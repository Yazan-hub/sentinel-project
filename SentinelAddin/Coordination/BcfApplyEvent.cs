using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Coordination;

// ---------------------------------------------------------------------------
// API-thread operations (ExternalEvent). Mirrors GhostBuilderPlacementEvent:
// stage a request -> Raise() -> Revit calls Execute() on the API thread when idle.
// ---------------------------------------------------------------------------
public enum BcfOp { ApplyViewpoint, IsolateAll, IssuesForSelection }

public sealed class BcfApplyEvent : IExternalEventHandler
{
    private const double MetersToFeet = 1.0 / 0.3048;

    private BcfOp _op;
    private BcfViewpoint? _viewpoint;
    private IReadOnlyList<BcfTopic>? _topics;

    /// <summary>Status/summary message after an operation.</summary>
    public event Action<string>? Applied;

    /// <summary>Fired by IssuesForSelection: the topics the current Revit selection belongs to.</summary>
    public event Action<IReadOnlyList<BcfTopic>, string>? SelectionMatched;

    public void RequestApply(BcfViewpoint vp) { _op = BcfOp.ApplyViewpoint; _viewpoint = vp; }
    public void RequestIsolateAll(IReadOnlyList<BcfTopic> topics) { _op = BcfOp.IsolateAll; _topics = topics; }
    public void RequestIssuesForSelection(IReadOnlyList<BcfTopic> topics) { _op = BcfOp.IssuesForSelection; _topics = topics; }

    public void Execute(UIApplication app)
    {
        if (app.ActiveUIDocument is not { } uidoc) return;
        Document doc = uidoc.Document;
        try
        {
            switch (_op)
            {
                case BcfOp.ApplyViewpoint: ApplyViewpoint(uidoc, doc); break;
                case BcfOp.IsolateAll: IsolateAll(uidoc, doc); break;
                case BcfOp.IssuesForSelection: IssuesForSelection(uidoc, doc); break;
            }
        }
        catch (Exception ex)
        {
            Applied?.Invoke("error: " + ex.Message); // never let it escape Execute()
        }
        finally { _viewpoint = null; _topics = null; }
    }

    public string GetName() => "Sentinel - BCF Operation";

    // ---- operations ----

    private void ApplyViewpoint(UIDocument uidoc, Document doc)
    {
        BcfViewpoint? vp = _viewpoint;
        if (vp is null) return;

        IList<ElementId> ids = ResolveByIfcGuid(doc, new HashSet<string>(GuidsOf(vp), StringComparer.Ordinal));
        View3D? view = GetOrCreateCoordinationView(doc);
        string cameraNote = "";

        if (view is not null)
        {
            using (var t = new Transaction(doc, "Sentinel: apply BCF viewpoint"))
            {
                t.Start();
                if (vp.Camera is { } cam)
                {
                    try { (XYZ eye, XYZ fwd, XYZ up) = ToRevit(doc, cam); view.SetOrientation(new ViewOrientation3D(eye, up, fwd)); }
                    catch (Exception camEx) { cameraNote = "  (camera skipped: " + camEx.Message + ")"; }
                }
                if (ids.Count > 0)
                {
                    view.DisableTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);
                    view.IsolateElementsTemporary(ids);
                }
                t.Commit();
            }
            uidoc.ActiveView = view;
        }

        if (ids.Count > 0) { uidoc.Selection.SetElementIds(ids); uidoc.ShowElements(ids); }
        Applied?.Invoke((ids.Count > 0
            ? $"Isolated + selected {ids.Count} element(s)."
            : "No matching element in this model.") + cameraNote);
    }

    private void IsolateAll(UIDocument uidoc, Document doc)
    {
        IReadOnlyList<BcfTopic> topics = _topics ?? new List<BcfTopic>();
        var wanted = new HashSet<string>(topics.SelectMany(GuidsOf), StringComparer.Ordinal);
        if (wanted.Count == 0) { Applied?.Invoke("No linked elements across the issues."); return; }

        IList<ElementId> ids = ResolveByIfcGuid(doc, wanted);
        View3D? view = GetOrCreateCoordinationView(doc);
        if (view is not null && ids.Count > 0)
        {
            using (var t = new Transaction(doc, "Sentinel: isolate all issue elements"))
            {
                t.Start();
                view.DisableTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);
                view.IsolateElementsTemporary(ids);
                t.Commit();
            }
            uidoc.ActiveView = view;
            uidoc.Selection.SetElementIds(ids);
            uidoc.ShowElements(ids);
        }
        Applied?.Invoke(ids.Count > 0
            ? $"Isolated {ids.Count} element(s) across {topics.Count} issue(s)."
            : "No issue elements found in this model.");
    }

    private void IssuesForSelection(UIDocument uidoc, Document doc)
    {
        IReadOnlyList<BcfTopic> topics = _topics ?? new List<BcfTopic>();
        ICollection<ElementId> sel = uidoc.Selection.GetElementIds();
        if (sel.Count == 0)
        {
            SelectionMatched?.Invoke(new List<BcfTopic>(), "Select element(s) in Revit first, then click again.");
            return;
        }

        // GlobalId of each selected element (same encoding the export uses).
        var selGuids = new HashSet<string>(StringComparer.Ordinal);
        foreach (ElementId id in sel)
        {
            string? g = doc.GetElement(id)?.get_Parameter(BuiltInParameter.IFC_GUID)?.AsString();
            if (string.IsNullOrWhiteSpace(g)) { try { g = ToIfcGuid(ExportUtils.GetExportId(doc, id)); } catch { continue; } }
            if (!string.IsNullOrWhiteSpace(g)) selGuids.Add(g!);
        }

        var matched = topics.Where(t => GuidsOf(t).Any(selGuids.Contains)).ToList();
        SelectionMatched?.Invoke(matched, matched.Count > 0
            ? $"Selection is linked to {matched.Count} issue(s) (highlighted)."
            : "Selection is NOT linked to any issue.");
    }

    // ---- GlobalId helpers ----

    private static IEnumerable<string> GuidsOf(BcfViewpoint vp) =>
        vp.Components?.Selection?.Select(s => s.IfcGuid).Where(g => !string.IsNullOrWhiteSpace(g))!
        ?? Enumerable.Empty<string>();

    private static IEnumerable<string> GuidsOf(BcfTopic t) =>
        (t.Viewpoints ?? new List<BcfViewpoint>()).SelectMany(GuidsOf);

    /// <summary>Map a set of IFC GlobalIds to Revit ElementIds (IFC_GUID param, else computed).</summary>
    private static IList<ElementId> ResolveByIfcGuid(Document doc, HashSet<string> wanted)
    {
        var result = new List<ElementId>();
        if (wanted.Count == 0) return result;

        foreach (Element e in new FilteredElementCollector(doc).WhereElementIsNotElementType())
        {
            string? g = e.get_Parameter(BuiltInParameter.IFC_GUID)?.AsString();
            if (string.IsNullOrWhiteSpace(g))
            {
                try { g = ToIfcGuid(ExportUtils.GetExportId(doc, e.Id)); } catch { continue; }
            }
            if (wanted.Contains(g!))
            {
                result.Add(e.Id);
                if (result.Count == wanted.Count) break; // found them all — stop scanning
            }
        }
        return result;
    }

    // Autodesk's IFC GlobalId encoding (compressed 22-char base64) — the scheme Revit's IFC exporter
    // uses, so a GlobalId from the .frag/IFC maps back to its Revit element.
    private static readonly char[] _b64 =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$".ToCharArray();

    private static string ToIfcGuid(Guid guid)
    {
        byte[] b = guid.ToByteArray(); // .NET stores the first 3 fields little-endian; reorder below.
        uint[] num =
        {
            b[3],
            (uint)b[2] * 65536 + (uint)b[1] * 256 + b[0],
            (uint)b[5] * 65536 + (uint)b[4] * 256 + b[7],
            (uint)b[6] * 65536 + (uint)b[8] * 256 + b[9],
            (uint)b[10] * 65536 + (uint)b[11] * 256 + b[12],
            (uint)b[13] * 65536 + (uint)b[14] * 256 + b[15],
        };
        var buf = new char[22];
        int offset = 0, len = 2; // first group encodes 1 byte → 2 chars; the rest 3 bytes → 4 chars.
        for (int i = 0; i < 6; i++)
        {
            uint act = num[i];
            for (int k = len - 1; k >= 0; k--) { buf[offset + k] = _b64[(int)(act % 64)]; act /= 64; }
            offset += len;
            len = 4;
        }
        return new string(buf);
    }

    private static View3D? GetOrCreateCoordinationView(Document doc)
    {
        const string name = "Sentinel Coordination";
        View3D? existing = new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>()
            .FirstOrDefault(v => !v.IsTemplate && v.Name == name);
        if (existing is not null) return existing;

        ViewFamilyType? vft = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType))
            .Cast<ViewFamilyType>().FirstOrDefault(t => t.ViewFamily == ViewFamily.ThreeDimensional);
        if (vft is null) return null;

        using var t = new Transaction(doc, "Sentinel: create coordination view");
        t.Start();
        View3D v = View3D.CreateIsometric(doc, vft.Id);
        try { v.Name = name; } catch { /* name clash — keep the default */ }
        t.Commit();
        return v;
    }

    /// <summary>
    /// BCF (meters, Z-up, IFC-export coordinate base) -> Revit internal (feet). CALIBRATION KNOB:
    /// invert the SAME base the Bridge exported in (default: Shared coords). up is Gram-Schmidt'd
    /// perpendicular to forward because ViewOrientation3D requires it and BCF vectors rarely are.
    /// </summary>
    private static (XYZ eye, XYZ fwd, XYZ up) ToRevit(Document doc, PerspectiveCamera c)
    {
        Transform inv = doc.ActiveProjectLocation.GetTotalTransform().Inverse; // Shared -> Internal
        XYZ eye = inv.OfPoint(new XYZ(c.ViewPoint.X, c.ViewPoint.Y, c.ViewPoint.Z) * MetersToFeet);
        XYZ fwd = inv.OfVector(new XYZ(c.Direction.X, c.Direction.Y, c.Direction.Z)).Normalize();
        XYZ up = inv.OfVector(new XYZ(c.UpVector.X, c.UpVector.Y, c.UpVector.Z));

        XYZ upOrtho = up.Subtract(fwd.Multiply(up.DotProduct(fwd)));
        if (upOrtho.GetLength() < 1e-6)
        {
            XYZ seed = Math.Abs(fwd.DotProduct(XYZ.BasisZ)) < 0.9 ? XYZ.BasisZ : XYZ.BasisY;
            upOrtho = seed.Subtract(fwd.Multiply(seed.DotProduct(fwd)));
        }
        return (eye, fwd, upOrtho.Normalize());
    }
}
