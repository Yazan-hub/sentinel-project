using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Ghost Builder: pick a 2D DWG import, map its CAD layers to BDS families via the local LLM,
/// and build LOD 200 geometry — WITHOUT freezing the Revit UI.
///
/// Threading (this is the whole point of the command):
///   • Execute (API thread): resolve config, pick DWG, extract inputs (reads), show a modeless
///     progress window, then RETURN immediately so Revit's UI stays live.
///   • Task.Run (background): the LLM HTTP call only — the sole slow, Revit-API-free step.
///     Cancellable via the window's ESC / Cancel (CancellationToken).
///   • ExternalEvent (API thread): geometry placement (Wall.Create etc.), the only place Revit
///     API writes are legal. Reads and writes never touch the background thread.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class GhostBuilderCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        // 1. Resolve config (project ES -> machine JSON). Ghost paths are optional.
        var settings = SettingsManager.Resolve(doc);
        string? libraryDir = string.IsNullOrWhiteSpace(settings.GhostFamilyLibraryDir)
            ? null
            : settings.GhostFamilyLibraryDir;

        string schemaJson = "";
        if (!string.IsNullOrWhiteSpace(settings.GhostMappingSchemaPath))
        {
            if (!File.Exists(settings.GhostMappingSchemaPath))
            {
                TaskDialog.Show("Sentinel — Ghost Builder",
                    $"Mapping schema not found:\n{settings.GhostMappingSchemaPath}\n\n" +
                    "Fix the path in Project Setup, or clear it to run without a schema.");
                return Result.Cancelled;
            }
            schemaJson = File.ReadAllText(settings.GhostMappingSchemaPath);
        }

        if (libraryDir != null && !Directory.Exists(libraryDir))
        {
            TaskDialog.Show("Sentinel — Ghost Builder",
                $"Family library folder not found:\n{libraryDir}\n\n" +
                "Fix the path in Project Setup, or clear it to run without family preload.");
            return Result.Cancelled;
        }

        // 2. Pick a DWG import (API thread — legal here, before we hand off).
        ImportInstance? cadLink;
        try
        {
            var picked = uidoc.Selection.PickObject(
                ObjectType.Element, new CadImportFilter(),
                "Select a 2D CAD (DWG) import to build from.");
            cadLink = doc.GetElement(picked.ElementId) as ImportInstance;
        }
        catch (Autodesk.Revit.Exceptions.OperationCanceledException)
        {
            return Result.Cancelled; // user pressed Esc during pick — not an error
        }
        if (cadLink is null) return Result.Cancelled;

        // 3. PHASE 1 — Revit API reads, on this (API) thread. Fast; safe to do inline.
        // Cache + base-dictionary layer for dirty external DWGs: known layers resolve locally, only
        // unrecognised ones reach Ollama (LocalGhostBuilder), and every result is remembered.
        var mapper = new LayerMapper(new LocalGhostBuilder(schemaJson));
        var orchestrator = new GhostBuilderOrchestrator(doc, mapper, minConfidence: 0.5, familyLibraryDir: libraryDir);
        GhostBuilderOrchestrator.Inputs inputs;
        try
        {
            inputs = orchestrator.ExtractInputs(cadLink);
        }
        catch (System.Exception ex)
        {
            mapper.Dispose();
            msg = $"{ex.GetType().Name}: {ex.Message}";
            return Result.Failed;
        }

        if (inputs.Layers.Count == 0)
        {
            mapper.Dispose();
            TaskDialog.Show("Sentinel — Ghost Builder", "No CAD layers found in the import; nothing to build.");
            return Result.Cancelled;
        }

        // 4. Wire the PHASE 3 placement handoff (runs on the API thread when raised).
        var placementEvent = new GhostBuilderPlacementEvent(minConfidence: 0.5);
        var externalEvent = ExternalEvent.Create(placementEvent);

        // 5. Modeless progress window owns the CancellationTokenSource (ESC / Cancel -> cancel).
        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        placementEvent.Completed += (report, error) =>
        {
            // Back on the API thread. Marshal UI updates to the window's dispatcher.
            progress.Dispatcher.Invoke(() =>
            {
                mapper.Dispose();
                progress.Close();
                if (error != null)
                    TaskDialog.Show("Sentinel — Ghost Builder", "Placement failed: " + error.Message);
                else
                    TaskDialog.Show("Sentinel — Ghost Builder", Summarize(report));
            });
        };

        // 6. PHASE 2 — LLM mapping on a background thread. UI is free the moment we return below.
        _ = Task.Run(async () =>
        {
            try
            {
                progress.SetStatus("Mapping CAD layers with the local model…");
                MappingResult mapping = await orchestrator.MapAsync(inputs, progress.Token).ConfigureAwait(false);

                if (progress.Token.IsCancellationRequested) return; // user aborted; window already closing

                // Stage phase 3 and raise — Revit runs Place() on the API thread.
                progress.SetStatus("Placing geometry…");
                placementEvent.SetRequest(orchestrator, inputs, mapping);
                externalEvent.Raise();
            }
            catch (System.OperationCanceledException)
            {
                CloseOnUi(progress, mapper); // ESC/Cancel: HTTP aborted cleanly
            }
            catch (System.Net.Http.HttpRequestException)
            {
                FailOnUi(progress, mapper,
                    "Could not reach the local model at http://localhost:11434.\n\n" +
                    "Start Ollama and pull the model (\"ollama run llama3\"), then try again.");
            }
            catch (System.Exception ex)
            {
                FailOnUi(progress, mapper, $"{ex.GetType().Name}: {ex.Message}");
            }
        });

        progress.Show();   // modeless — does NOT block; returns immediately
        return Result.Succeeded;
    }

    private static void CloseOnUi(GhostBuilderProgressWindow w, LayerMapper mapper) =>
        w.Dispatcher.Invoke(() => { mapper.Dispose(); w.Close(); });

    private static void FailOnUi(GhostBuilderProgressWindow w, LayerMapper mapper, string message) =>
        w.Dispatcher.Invoke(() =>
        {
            mapper.Dispose();
            w.Close();
            TaskDialog.Show("Sentinel — Ghost Builder", message);
        });

    private static string Summarize(GhostPlacementEngine.PlacementReport r)
    {
        if (r is null) return "No report returned.";
        var lines = new System.Text.StringBuilder();
        lines.AppendLine($"Placed: {r.Placed}");
        if (r.SkippedLowConfidence > 0) lines.AppendLine($"Skipped (low confidence): {r.SkippedLowConfidence}");
        if (r.SkippedUnknownFamily > 0) lines.AppendLine($"Skipped (family not in model): {r.SkippedUnknownFamily}");
        if (r.SkippedNoGeometry > 0)    lines.AppendLine($"Skipped (no geometry): {r.SkippedNoGeometry}");
        if (r.Warnings.Count > 0)
        {
            // Collapse identical warnings (a dirty layer can skip tens of thousands of elements for
            // the same reason) into one line with a count, most frequent first — otherwise the dialog
            // is an unreadable wall of duplicates.
            lines.AppendLine().AppendLine("Warnings:");
            foreach (var g in r.Warnings.GroupBy(w => w).OrderByDescending(g => g.Count()))
                lines.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        return lines.ToString();
    }
}

/// <summary>Restricts PickObject to DWG/CAD import instances.</summary>
internal sealed class CadImportFilter : ISelectionFilter
{
    public bool AllowElement(Element e) => e is ImportInstance;
    public bool AllowReference(Reference r, XYZ p) => false;
}
