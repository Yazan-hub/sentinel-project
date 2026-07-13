using System.IO;
using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Engine;

/// <summary>
/// Native BCF 2.1 exporter (BIMcollab/Solibri/Navisworks-compatible) — no
/// third-party libraries. Produces a .bcfzip containing, per topic:
///   {TopicGuid}/markup.bcf      — issue title/status/date + component GUIDs
///   {TopicGuid}/viewpoint.bcfv  — camera (eye/direction/up, meters) + components
///   {TopicGuid}/snapshot.png    — active-view image
///   bcf.version                 — 2.1 manifest
/// Coordinates: Revit feet -> BCF meters. IFC GUIDs resolved from the
/// element's IfcGUID parameter when present, else derived via ExportUtils.
/// </summary>
public static class BcfExporter
{
    private const double FtToM = 0.3048;

    public sealed class BcfIssue
    {
        public string Title { get; set; } = "Sentinel issue";
        public string Status { get; set; } = "Active";       // Active|Resolved|Closed
        public string Type { get; set; } = "Clash";          // Clash|Issue|Request
        public string Description { get; set; } = string.Empty;
        public string Author { get; set; } = "Sentinel";
        public List<ElementId> Components { get; } = new List<ElementId>();
    }

    /// <summary>Export one issue to a .bcfzip. Must run in a valid API context
    /// (route through App.Events). Isolates components in the active 3D view
    /// for the snapshot, then restores.</summary>
    public static string Export(UIApplication uiapp, BcfIssue issue, string outputFolder)
    {
        var uidoc = uiapp.ActiveUIDocument ?? throw new InvalidOperationException("No active document.");
        var doc = uidoc.Document;
        var view3d = doc.ActiveView as View3D;

        string topicGuid = Guid.NewGuid().ToString();
        string work = Path.Combine(Path.GetTempPath(), "SentinelBcf_" + topicGuid);
        Directory.CreateDirectory(Path.Combine(work, topicGuid));

        // ---- 1. Snapshot (with temporary isolation when we have a 3D view) ----
        bool isolated = false;
        if (view3d is not null && issue.Components.Count > 0)
        {
            try
            {
                using var t = new Transaction(doc, "Sentinel: BCF snapshot isolation");
                t.Start();
                view3d.IsolateElementsTemporary(issue.Components);
                t.Commit();
                isolated = true;
                uidoc.ShowElements(issue.Components);
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException) { }
        }

        string snapshotPath = Path.Combine(work, topicGuid, "snapshot.png");
        ExportSnapshot(doc, snapshotPath);

        if (isolated)
        {
            using var t = new Transaction(doc, "Sentinel: BCF snapshot restore");
            t.Start();
            view3d!.DisableTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);
            t.Commit();
        }

        // ---- 2. Component IFC GUIDs ----
        var components = issue.Components
            .Select(id => (Id: id, Guid: GetIfcGuid(doc, id), Element: doc.GetElement(id)))
            .Where(c => c.Element is not null)
            .ToList();

        // ---- 3. viewpoint.bcfv ----
        string viewpointGuid = Guid.NewGuid().ToString();
        var vp = new XElement("VisualizationInfo", new XAttribute("Guid", viewpointGuid));
        if (view3d is not null)
        {
            var orientation = view3d.GetOrientation();
            XYZ eye = orientation.EyePosition, fwd = orientation.ForwardDirection, up = orientation.UpDirection;
            if (view3d.IsPerspective)
                vp.Add(new XElement("PerspectiveCamera",
                    Point("CameraViewPoint", eye), Vector("CameraDirection", fwd),
                    Vector("CameraUpVector", up), new XElement("FieldOfView", "60")));
            else
                // Revit default 3D views are orthographic — BCF viewers expect
                // OrthogonalCamera + ViewToWorldScale for these.
                vp.Add(new XElement("OrthogonalCamera",
                    Point("CameraViewPoint", eye), Vector("CameraDirection", fwd),
                    Vector("CameraUpVector", up),
                    new XElement("ViewToWorldScale",
                        (view3d.get_BoundingBox(null) is BoundingBoxXYZ bb
                            ? Math.Max(1.0, (bb.Max - bb.Min).GetLength() * FtToM / 2.0)
                            : 10.0).ToString("F3", System.Globalization.CultureInfo.InvariantCulture))));
        }
        if (components.Count > 0)
        {
            vp.Add(new XElement("Components",
                new XElement("Selection", components.Select(c =>
                    new XElement("Component", new XAttribute("IfcGuid", c.Guid),
                        new XElement("OriginatingSystem", "Sentinel"),
                        new XElement("AuthoringToolId", c.Id.IdValue().ToString()))))));
        }
        Save(vp, Path.Combine(work, topicGuid, "viewpoint.bcfv"));

        // ---- 4. markup.bcf ----
        string now = DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
        var markup = new XElement("Markup",
            new XElement("Topic",
                new XAttribute("Guid", topicGuid),
                new XAttribute("TopicType", issue.Type),
                new XAttribute("TopicStatus", issue.Status),
                new XElement("Title", issue.Title),
                new XElement("CreationDate", now),
                new XElement("CreationAuthor", issue.Author),
                new XElement("Description", issue.Description)),
            new XElement("Comment",
                new XAttribute("Guid", Guid.NewGuid().ToString()),
                new XElement("Date", now),
                new XElement("Author", issue.Author),
                new XElement("Comment", issue.Description.Length > 0 ? issue.Description : issue.Title),
                new XElement("Viewpoint", new XAttribute("Guid", viewpointGuid))),
            new XElement("Viewpoints",
                new XAttribute("Guid", viewpointGuid),
                new XElement("Viewpoint", "viewpoint.bcfv"),
                new XElement("Snapshot", "snapshot.png")));
        Save(markup, Path.Combine(work, topicGuid, "markup.bcf"));

        // ---- 5. bcf.version + zip ----
        Save(new XElement("Version", new XAttribute("VersionId", "2.1"),
                new XElement("DetailedVersion", "2.1")),
             Path.Combine(work, "bcf.version"));

        Directory.CreateDirectory(outputFolder);
        string fileName = Sanitize(issue.Title) + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".bcfzip";
        string target = Path.Combine(outputFolder, fileName);
        if (File.Exists(target)) File.Delete(target);
        ZipFile.CreateFromDirectory(work, target);
        try { Directory.Delete(work, true); } catch (IOException) { }

        RoiTracker.Log("bcf", issue.Title + " -> " + fileName);
        return target;
    }

    // ---------------- helpers ----------------
    private static void ExportSnapshot(Document doc, string pngPath)
    {
        var opts = new ImageExportOptions
        {
            FilePath = pngPath.Substring(0, pngPath.Length - 4), // Revit appends extension
            ZoomType = ZoomFitType.FitToPage,
            PixelSize = 1200,
            ImageResolution = ImageResolution.DPI_150,
            FitDirection = FitDirectionType.Horizontal,
            HLRandWFViewsFileType = ImageFileType.PNG,
            ShadowViewsFileType = ImageFileType.PNG,
            ExportRange = ExportRange.VisibleRegionOfCurrentView,
        };
        doc.ExportImage(opts);
        // Revit may decorate the file name; normalize to snapshot.png.
        var dir = Path.GetDirectoryName(pngPath)!;
        var produced = Directory.GetFiles(dir, "*.png").FirstOrDefault();
        if (produced is not null && produced != pngPath) File.Move(produced, pngPath);
    }

    /// IfcGUID parameter (exporter-written) first; else derive the stable
    /// export GUID Revit itself would use for IFC.
    private static string GetIfcGuid(Document doc, ElementId id)
    {
        var e = doc.GetElement(id);
        var p = e?.get_Parameter(BuiltInParameter.IFC_GUID);
        var s = p?.AsString();
        if (!string.IsNullOrWhiteSpace(s)) return s!;
        return ExportUtils.GetExportId(doc, id).ToString("N").Substring(0, 22);
    }

    private static XElement Point(string name, XYZ p) => new(name,
        new XElement("X", (p.X * FtToM).ToString("F6", System.Globalization.CultureInfo.InvariantCulture)),
        new XElement("Y", (p.Y * FtToM).ToString("F6", System.Globalization.CultureInfo.InvariantCulture)),
        new XElement("Z", (p.Z * FtToM).ToString("F6", System.Globalization.CultureInfo.InvariantCulture)));

    private static XElement Vector(string name, XYZ v) => new(name,
        new XElement("X", v.X.ToString("F6", System.Globalization.CultureInfo.InvariantCulture)),
        new XElement("Y", v.Y.ToString("F6", System.Globalization.CultureInfo.InvariantCulture)),
        new XElement("Z", v.Z.ToString("F6", System.Globalization.CultureInfo.InvariantCulture)));

    private static void Save(XElement root, string path) =>
        new XDocument(new XDeclaration("1.0", "utf-8", "yes"), root).Save(path);

    private static string Sanitize(string s)
    {
        var sb = new StringBuilder();
        foreach (var ch in s)
            sb.Append(Path.GetInvalidFileNameChars().Contains(ch) || ch == ' ' ? '_' : ch);
        return sb.Length > 40 ? sb.ToString(0, 40) : sb.ToString();
    }
}
