#nullable disable
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.GhostBuilder;

namespace Sentinel.Commands;

/// <summary>
/// Datum from Drawings: read the model's LEVELS from an imported section's levels layer and its GRIDS from
/// an imported plan's grid layer, then create them — the datum-first step of an as-built modelling workflow
/// that GhostBuilder used to skip (walls got a default height and no grid). Heights and grid positions are
/// DETERMINISTIC (measured off the drawing geometry, not estimated), so this needs no vision model and no
/// background thread — it's all Revit reads/writes on the API thread. The only reviewable thing is the
/// auto-generated names, which the user renames in Revit; a confirmation dialog shows what will be created.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class DatumFromDrawingsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        if (!new FilteredElementCollector(doc).OfClass(typeof(ImportInstance)).Any())
        {
            TaskDialog.Show("Sentinel — Datum",
                "No CAD imports found. Import your section (for levels) and plan (for grids) first, then run again.");
            return Result.Cancelled;
        }

        var builder = new DatumBuilder(doc);
        var detected = builder.Detect();

        if (detected.Levels.Count == 0 && detected.Grids.Count == 0)
        {
            TaskDialog.Show("Sentinel — Datum",
                "Found no level or grid lines.\n\n" + string.Join("\n", detected.Warnings) +
                "\n\nLevels are read from a section layer containing \"LEVEL\"; grids from a plan layer " +
                "containing \"GRID\". Check the drawings are imported and drawn to the office layer standard.");
            return Result.Cancelled;
        }

        var td = new TaskDialog("Sentinel — Datum from Drawings")
        {
            MainInstruction = $"Create {detected.Levels.Count} level(s) and {detected.Grids.Count} grid(s)?",
            MainContent = Preview(detected),
            CommonButtons = TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No,
            DefaultButton = TaskDialogResult.Yes,
        };
        if (td.Show() != TaskDialogResult.Yes) return Result.Cancelled;

        var result = builder.Build(detected);
        TaskDialog.Show("Sentinel — Datum",
            $"Created {result.LevelsCreated} level(s) and {result.GridsCreated} grid(s)." +
            (result.Warnings.Count > 0 ? "\n\nNotes:\n • " + string.Join("\n • ", result.Warnings.Distinct()) : "") +
            "\n\nRename them to your office's own labels in the Project Browser if needed, then model — " +
            "elements will host to these levels.");
        return Result.Succeeded;
    }

    private static string Preview(DatumBuilder.DatumResult d)
    {
        var sb = new StringBuilder();
        if (d.Levels.Count > 0)
        {
            sb.AppendLine("Levels (ground-up):");
            foreach (var l in d.Levels) sb.AppendLine($"  {l.Name}  =  +{l.ElevationMm:0} mm");
        }
        if (d.Grids.Count > 0)
        {
            var v = d.Grids.Where(g => g.Vertical).Select(g => g.Name);
            var h = d.Grids.Where(g => !g.Vertical).Select(g => g.Name);
            sb.AppendLine($"Grids:  {string.Join(", ", v)}  /  {string.Join(", ", h)}");
        }
        return sb.ToString().TrimEnd();
    }
}
