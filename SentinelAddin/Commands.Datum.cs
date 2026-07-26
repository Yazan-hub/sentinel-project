#nullable disable
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
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

        var builder = new DatumBuilder(doc);

        // Match the real workflow: read the datum straight from the project drawings folder — no hand
        // importing. Fall back to any DWG already imported into the model if no folder is set.
        var settings = SettingsManager.Resolve(doc);
        string folder = settings.GhostSourceFolder;
        bool haveFolder = !string.IsNullOrWhiteSpace(folder) && System.IO.Directory.Exists(folder);
        bool haveImports = new FilteredElementCollector(doc).OfClass(typeof(ImportInstance)).Any();

        if (!haveFolder && !haveImports)
        {
            TaskDialog.Show("Sentinel — Datum",
                "No drawings to read. Set the Ghost source folder (Project Setup) to the folder holding your " +
                "project DWGs — the section (for levels) and plan (for grids) — then run again. " +
                "Set your project base point / survey point first, as usual; the DWGs are read origin-to-origin.");
            return Result.Cancelled;
        }

        DatumBuilder.DatumResult detected;
        if (haveFolder)
        {
            var files = System.IO.Directory.EnumerateFiles(folder, "*.*")
                .Where(f => f.EndsWith(".dwg", System.StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".dxf", System.StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f).ToList();
            if (files.Count == 0)
            {
                TaskDialog.Show("Sentinel — Datum", $"No .dwg/.dxf files in {folder}.");
                return Result.Cancelled;
            }

            var pick = new Sentinel.UI.DwgPickWindow(files, null,
                title: "Sentinel — Datum: choose ONE drawing",
                header: "Pick the drawing to read datum from. Levels come from a section's " +
                        "LEVEL layer, grids from a plan's GRID layer. The drawing is read " +
                        "temporarily (nothing is kept). Sheets have different origins - " +
                        "run once per drawing; existing levels/grids are kept, not duplicated.",
                showPickFromModel: false);
            new System.Windows.Interop.WindowInteropHelper(pick) { Owner = c.Application.MainWindowHandle };
            if (pick.ShowDialog() != true || pick.SelectedPath == null)
                return Result.Cancelled;

            detected = builder.DetectFromFiles(new[] { pick.SelectedPath });
        }
        else detected = builder.Detect();

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
