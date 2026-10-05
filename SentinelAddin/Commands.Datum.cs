#nullable disable
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
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
        // MA-1a item 6: never into a design option — said before a drawing is picked.
        if (PlacementApply.DesignOptionRefusal(doc, "run Datum from Drawings") is { } inOption)
        {
            TaskDialog.Show("Sentinel — Datum", inOption);
            return Result.Cancelled;
        }

        var builder = new DatumBuilder(doc);

        // Match the real workflow: read the datum straight from the project drawings folder — no hand
        // importing. Fall back to any DWG already imported into the model if no folder is set.
        var settings = SettingsManager.Resolve(doc);
        if (SettingsManager.ToolRefusal(settings, callsModel: false) is { } notLocal) // SEC-2: asked before a drawing is read
        {
            TaskDialog.Show("Sentinel — Datum", notLocal);
            return Result.Cancelled;
        }
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

        var readerClock = new System.Diagnostics.Stopwatch(); // MA-1a item 8: the read's own time, for the receipt
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

            readerClock.Start();
            detected = builder.DetectFromFiles(new[] { pick.SelectedPath });
            readerClock.Stop();
            detected.SourceSha256 = ProvenanceStamp.FileSha256(pick.SelectedPath); // MA-1a item 4: the file the datum was read from
        }
        else
        {
            readerClock.Start();
            detected = builder.Detect();
            readerClock.Stop();
        }

        if (detected.Levels.Count == 0 && detected.Grids.Count == 0)
        {
            TaskDialog.Show("Sentinel — Datum",
                "Found no level or grid lines.\n\n" + string.Join("\n", detected.Warnings) +
                "\n\nLevels are read from a section layer containing \"LEVEL\"; grids from a plan layer " +
                "containing \"GRID\" — those two words, not the project's layers standard. Check the drawings are imported.");
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

        // MA-1a item 6: the project's guideline, for its placement block (Annotate's pattern: fetched off this thread and
        // waited for, 4 s at most; an unbound model has none). A workset the block names for Levels or Grids that the
        // model lacks is refused before the transaction.
        string key = ProjectContext.For(doc).Key;
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false)).GetAwaiter().GetResult();
        // Review amendment C7: a guideline that could not be read is not "no block" — refused before anything is created.
        if (PlacementPolicy.UnreadRefusal(standards.GuidelineSource.Origin, standards.GuidelineSource.NotInstalled || standards.GuidelineSource.NoProject,
                                          !string.IsNullOrWhiteSpace(key), standards.GuidelineSource.Reason) is { } unread)
        {
            TaskDialog.Show("Sentinel — Datum", unread);
            return Result.Cancelled;
        }
        var block = standards.Guideline.Placement;
        // Asked by what the drawing holds, not by what will be new (E4): a level that already exists is still asked for.
        var kinds = new[] { detected.Levels.Count > 0 ? "level" : null, detected.Grids.Count > 0 ? "grid" : null }.Where(k => k != null);
        var placing = PlacementApply.Resolve(doc, block, uidoc.ActiveView, kinds, out var noWorkset);
        if (placing == null)
        {
            TaskDialog.Show("Sentinel — Datum", noWorkset);
            return Result.Cancelled;
        }

        DatumBuilder.DatumResult result;
        try { result = builder.Build(detected, placing); }
        catch (PlacementRefused ex)
        {
            // Review amendment C5: Revit refused a workset write; Build rolled its transaction back. Said in Sentinel's
            // own dialog, not as an external-command exception.
            TaskDialog.Show("Sentinel — Datum", ex.Message);
            return Result.Cancelled;
        }
        if (!result.Committed)
        {
            TaskDialog.Show("Sentinel — Datum", "Nothing was created — Revit did not commit the transaction (an element it needs may be owned by another user). The model is as it was.");
            return Result.Failed;
        }
        // MA-1a item 7: one datum row for the run, sent off this thread; the pane's log says what the ledger answered.
        if (result.LevelsCreated + result.GridsCreated > 0)
            GovernedNotify.Report("Datum from Drawings", CommandReports.Datum(result.LevelsCreated, result.GridsCreated,
                result.Warnings.Distinct().Count(), result.SourceSha256, UserSession.Actor), key);
        if (result.LevelsCreated + result.GridsCreated > 0)
        {
            // MA-1a item 8: the reader's build:run receipt — deterministic, so no model and no tokens.
            var receipt = new BuildReceipt.Facts { Seconds = readerClock.Elapsed.TotalSeconds, Candidates = detected.Levels.Count + detected.Grids.Count };
            receipt.Parameters["level_layers"] = result.LevelLayers.OrderBy(l => l).ToArray();
            receipt.Parameters["grid_layers"] = result.GridLayers.OrderBy(l => l).ToArray();
            receipt.Parameters["source_sha256"] = result.SourceSha256;
            GovernedNotify.Report("Datum receipt", BuildReceipt.Run("datum", BuildReceipt.AddinSha256, receipt, 0, new string[0], UserSession.Actor), key);
        }
        TaskDialog.Show("Sentinel — Datum",
            $"Created {result.LevelsCreated} level(s) and {result.GridsCreated} grid(s), each stamped with where it came from (Model from Drawings ▸ 5 · Provenance reads it)." +
            "\n\n" + string.Join("\n", result.Placement) +
            (result.Warnings.Count > 0 ? "\n\nNotes:\n • " + string.Join("\n • ", result.Warnings.Distinct()) : "") +
            "\n\nRename them to your office's own labels in the Project Browser if needed, then model — " +
            "elements will host to these levels." +
            "\n\nNext: 3 · Annotate Views pins the story levels and grids and makes a floor plan and an RCP for each story level (it shows the rows first).");
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
        // The read's notes (which file, a units doubt) belong BEFORE the Yes, not in the report after it.
        if (d.Warnings.Count > 0) sb.AppendLine().AppendLine(string.Join("\n", d.Warnings.Select(w => "• " + w)));
        return sb.ToString().TrimEnd();
    }
}
