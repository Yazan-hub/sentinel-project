using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>
/// Render all Revit sheets to PNG for the web "Sheets" viewer. Sheets never survive IFC export, so this
/// pushes them directly: images + manifest into %AppData%\Sentinel\sheets\&lt;model&gt;\, which the Bridge
/// serves to the web app. Read-only — it exports images, changing no model data.
/// </summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class PublishSheetsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;

        var (count, dir, error) = Sentinel.Engine.SheetExporter.ExportAll(doc);

        if (error is not null)
        {
            msg = "Sheet export failed: " + error;
            return Result.Failed;
        }
        if (count == 0)
        {
            TaskDialog.Show("Sentinel — Publish Sheets",
                "No sheets found to export.\n\nCreate sheets in Revit (View → Sheet), then try again.");
            return Result.Cancelled;
        }

        TaskDialog.Show("Sentinel — Publish Sheets",
            $"Exported {count} sheet(s) to:\n{dir}\n\n" +
            "The Sentinel Bridge serves these to the web app's BIM Tools → Sheets tab. " +
            "Make sure the Bridge is running, then open Sheets and refresh.");
        return Result.Succeeded;
    }
}
