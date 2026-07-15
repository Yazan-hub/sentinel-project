using System.IO;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>
/// Publish the active model to That Open Platform. Exports the active view to IFC into the Sentinel
/// "outbox" (%AppData%\Sentinel\outbox). The Node Bridge (WebApp/bridge, using @thatopen/services)
/// watches that folder and uploads each file to the project's CDE via the supported Files API
/// (client.createFile).
///
/// This REPLACES the former direct POST to /api/item, which was wrong on every axis and always 500'd:
///   • /api/item publishes APPS/COMPONENTS, not model files (models go through the Files API);
///   • the host api.thatopen.com doesn't resolve (it's platform.thatopen.com);
///   • a platform token authenticates as an accessToken query param, not a Bearer header;
///   • no projectId was ever sent.
/// The upload now lives entirely in the Bridge, which uses the official SDK and gets all of that right.
/// The Revit side's only job is a clean local IFC export into the watched outbox.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class PublishToPlatformCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;

        // Outbox the Bridge watches. Persistent (NOT %TEMP%) so the file survives until uploaded.
        string outbox = Path.Combine(
            System.Environment.GetFolderPath(System.Environment.SpecialFolder.ApplicationData),
            "Sentinel", "outbox");
        Directory.CreateDirectory(outbox);

        string ifcName = SanitizeFileName(Path.GetFileNameWithoutExtension(doc.Title)) + ".ifc";
        string ifcPath = Path.Combine(outbox, ifcName);

        // Export the active view to IFC (transaction wrapper matches the IFC Delivery Gate's pattern).
        try
        {
            var opts = new IFCExportOptions
            {
                FileVersion = IFCVersion.IFC2x3CV2,
                FilterViewId = doc.ActiveView.Id,
                ExportBaseQuantities = true,
            };
            using var t = new Transaction(doc, "Sentinel: IFC export (publish)");
            t.Start();
            doc.Export(outbox, ifcName, opts);
            t.Commit();
        }
        catch (System.Exception ex)
        {
            msg = "IFC export failed: " + ex.Message;
            return Result.Failed;
        }

        // Gatekeeper: never hand the Bridge an empty or locked export.
        switch (InspectIfc(ifcPath))
        {
            case IfcState.MissingOrEmpty:
                try { File.Delete(ifcPath); } catch { /* best-effort */ }
                TaskDialog.Show("Sentinel — Publish to Platform",
                    "Upload Aborted: Generated IFC file contains no valid geometry. " +
                    "Please check your GhostBuilder layer mappings.");
                return Result.Cancelled;

            case IfcState.Locked:
                TaskDialog.Show("Sentinel — Publish to Platform",
                    "The generated IFC file is locked by another process. " +
                    "Close any app holding it and try again.");
                return Result.Cancelled;
        }

        long kb = new FileInfo(ifcPath).Length / 1024;
        TaskDialog.Show("Sentinel — Publish to Platform",
            $"Exported to the Sentinel outbox ({kb:N0} KB):\n{ifcPath}\n\n" +
            "The Sentinel Bridge uploads outbox files to That Open Platform. If the Bridge watcher " +
            "is running it will pick this up automatically; otherwise upload it once with:\n\n" +
            $"    cd WebApp\n    node bridge/upload-ifc.mjs \"{ifcPath}\"");
        return Result.Succeeded;
    }

    private enum IfcState { Ok, MissingOrEmpty, Locked }

    /// <summary>Export must exist, be non-empty (0 KB == no geometry), and be readable (not locked).</summary>
    private static IfcState InspectIfc(string path)
    {
        var fi = new FileInfo(path);
        if (!fi.Exists || fi.Length == 0) return IfcState.MissingOrEmpty;
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        }
        catch (IOException)
        {
            return IfcState.Locked;
        }
        return IfcState.Ok;
    }

    private static string SanitizeFileName(string s)
    {
        foreach (char ch in Path.GetInvalidFileNameChars())
            s = s.Replace(ch, '_');
        return string.IsNullOrWhiteSpace(s) ? "SentinelModel" : s;
    }
}
