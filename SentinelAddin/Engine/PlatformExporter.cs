using System;
using System.IO;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// The silent IFC export primitive (<see cref="ExportToDir"/>) behind <see cref="Publisher"/> (Governed Publish and
/// auto-publish) and the IFC Delivery Gate, plus the outbox the Bridge watches. Nothing here writes into the outbox:
/// since cohesion phase 5b the only writer is Publisher.Stage, after a verdict, sidecar first. No dialogs here —
/// callers decide how (or whether) to surface the result.
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

    /// <summary>Append a line to %AppData%\Sentinel\publish.log — the publish path's diagnostic trail.</summary>
    public static void Log(string line)
    {
        try
        {
            string path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "publish.log");
            File.AppendAllText(path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}\r\n");
        }
        catch { /* logging must never break a publish */ }
    }

    /// <summary>
    /// Export the WHOLE of <paramref name="doc"/> to <paramref name="dir"/>/<paramref name="ifcName"/>. This is the
    /// shared export primitive behind <see cref="Publisher"/> (which exports to a temp dir first, so it can stage ONLY
    /// on a verdict) and the IFC Delivery Gate. <paramref name="ifcSchema"/> is the delivery contract's
    /// <c>ifc_schema</c>: "IFC4" exports IFC4 Reference View, anything else exports IFC 2x3 CV2. GP-2: no FilterViewId
    /// — a filter view exports only what that view shows (its section box, hidden categories, phase; B17 exported a
    /// per-user "{3D - user}"); no filter is the whole model. Revit exports IFC only inside an open transaction; it is
    /// ROLLED BACK once the file is written, so an export leaves no Undo entry and does not mark the document modified
    /// (B10: a committed one forced a second save and a second auto run). Never throws; returns a result.
    /// </summary>
    public static (State state, string path, long bytes, string? error) ExportToDir(
        Document doc, string dir, string ifcName, string ifcSchema = "IFC2X3")
    {
        Directory.CreateDirectory(dir);
        string ifcPath = Path.Combine(dir, ifcName);

        try
        {
            var opts = new IFCExportOptions
            {
                FileVersion = string.Equals(ifcSchema, "IFC4", StringComparison.OrdinalIgnoreCase)
                    ? IFCVersion.IFC4RV : IFCVersion.IFC2x3CV2,
                ExportBaseQuantities = true,
            };

            using var t = new Transaction(doc, "Sentinel: IFC export");
            t.Start();
            try { doc.Export(dir, ifcName, opts); }
            finally { if (t.GetStatus() == TransactionStatus.Started) t.RollBack(); } // the file is written; the model is not touched
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
}
