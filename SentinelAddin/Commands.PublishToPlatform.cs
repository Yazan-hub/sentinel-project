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

        // Shared exporter (same code path as push-on-save). Manual publish keeps the active-view filter.
        var (state, path, bytes, error) = Sentinel.Engine.PlatformExporter.ExportToOutbox(doc, doc.ActiveView?.Id);

        switch (state)
        {
            case Sentinel.Engine.PlatformExporter.State.Failed:
                msg = "IFC export failed: " + error;
                return Result.Failed;

            case Sentinel.Engine.PlatformExporter.State.MissingOrEmpty:
                try { File.Delete(path); } catch { /* best-effort */ }
                TaskDialog.Show("Sentinel — Publish to Platform",
                    "Upload Aborted: Generated IFC file contains no valid geometry. " +
                    "Please check your GhostBuilder layer mappings.");
                return Result.Cancelled;

            case Sentinel.Engine.PlatformExporter.State.Locked:
                TaskDialog.Show("Sentinel — Publish to Platform",
                    "The generated IFC file is locked by another process. " +
                    "Close any app holding it and try again.");
                return Result.Cancelled;
        }

        TaskDialog.Show("Sentinel — Publish to Platform",
            $"Exported to the Sentinel outbox ({bytes / 1024:N0} KB):\n{path}\n\n" +
            "The Sentinel Bridge uploads outbox files to That Open Platform. If the Bridge watcher " +
            "is running it will pick this up automatically; otherwise upload it once with:\n\n" +
            $"    cd WebApp\n    node bridge/upload-ifc.mjs \"{path}\"\n\n" +
            "Tip: turn on 'Auto Publish' to push automatically on every save.");
        return Result.Succeeded;
    }
}
