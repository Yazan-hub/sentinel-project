using System;
using System.IO;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// The silent, reusable "export the model to the Sentinel outbox" step, shared by the manual
/// Publish-to-Platform command and the automatic push-on-save service (<see cref="AutoPublish"/>).
/// Writes an IFC into %AppData%\Sentinel\outbox, which the Node Bridge watches and uploads to That Open
/// Platform. No dialogs here — callers decide how (or whether) to surface the result, so the same code
/// path serves both an interactive command and a background save hook.
/// </summary>
public static class PlatformExporter
{
    public enum State { Ok, MissingOrEmpty, Locked, Failed }

    /// <summary>The outbox the Bridge watches. Persistent (NOT %TEMP%) so files survive until uploaded.</summary>
    public static string OutboxDir()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sentinel", "outbox");
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>
    /// Export <paramref name="doc"/> to IFC in the outbox. When <paramref name="filterViewId"/> is a valid
    /// view, only that view's content is exported (the manual command passes the active view); otherwise the
    /// whole model is exported (the auto path passes a 3D view / null). Never throws — returns a result.
    /// </summary>
    public static (State state, string path, long bytes, string? error) ExportToOutbox(
        Document doc, ElementId? filterViewId = null)
    {
        string ifcName = Sanitize(Path.GetFileNameWithoutExtension(doc.Title)) + ".ifc";
        return ExportToDir(doc, filterViewId, OutboxDir(), ifcName);
    }

    /// <summary>
    /// Export <paramref name="doc"/> to <paramref name="dir"/>/<paramref name="ifcName"/> — the shared export
    /// primitive behind <see cref="ExportToOutbox"/> and the Governed Publish command (which exports to a temp
    /// dir first so it can publish ONLY on a passing verdict). Same view-filter + transaction idiom; never
    /// throws — returns a result.
    /// </summary>
    public static (State state, string path, long bytes, string? error) ExportToDir(
        Document doc, ElementId? filterViewId, string dir, string ifcName)
    {
        Directory.CreateDirectory(dir);
        string ifcPath = Path.Combine(dir, ifcName);

        try
        {
            var opts = new IFCExportOptions
            {
                FileVersion = IFCVersion.IFC2x3CV2,
                ExportBaseQuantities = true,
            };
            if (filterViewId is { } vid && vid != ElementId.InvalidElementId)
                opts.FilterViewId = vid;

            // Transaction wrapper mirrors the IFC Delivery Gate / manual Publish pattern (proven path).
            using var t = new Transaction(doc, "Sentinel: IFC export");
            t.Start();
            doc.Export(dir, ifcName, opts);
            t.Commit();
        }
        catch (Exception ex)
        {
            return (State.Failed, ifcPath, 0, ex.Message);
        }

        return Inspect(ifcPath);
    }

    /// <summary>Export must exist, be non-empty (0 KB == no geometry), and be readable (not locked).</summary>
    private static (State, string, long, string?) Inspect(string path)
    {
        var fi = new FileInfo(path);
        if (!fi.Exists || fi.Length == 0) return (State.MissingOrEmpty, path, 0, null);
        try { using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read); }
        catch (IOException) { return (State.Locked, path, fi.Length, null); }
        return (State.Ok, path, fi.Length, null);
    }

    /// <summary>
    /// The default 3D view for a whole-model export: the built-in "{3D}" if present, else the first
    /// non-template <see cref="View3D"/>, else null (which exports the entire model unfiltered).
    /// </summary>
    public static ElementId? Default3DView(Document doc)
    {
        ElementId? first = null;
        foreach (var v in new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>())
        {
            if (v.IsTemplate) continue;
            first ??= v.Id;
            if (v.Name == "{3D}") return v.Id;
        }
        return first;
    }

    private static string Sanitize(string s)
    {
        foreach (char ch in Path.GetInvalidFileNameChars()) s = s.Replace(ch, '_');
        return string.IsNullOrWhiteSpace(s) ? "SentinelModel" : s;
    }
}
