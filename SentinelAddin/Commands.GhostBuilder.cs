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
/// review the proposal, and build LOD 200 geometry — WITHOUT freezing the Revit UI.
///
/// Threading (this is the whole point of the command):
///   • Execute (API thread): resolve config, pick DWG, extract inputs (reads), show a modeless
///     progress window, then RETURN immediately so Revit's UI stays live.
///   • Task.Run (background): the LLM HTTP call only — the sole slow, Revit-API-free step.
///     Cancellable via the window's ESC / Cancel (CancellationToken).
///   • Review (UI thread): the proposal is shown for approval — NOTHING is written until the user
///     ticks layers and clicks Build. Cancel/ESC ends the run having touched nothing (P3 gate).
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
        // Ghost Builder v2 (P1): the BDS DWG Layer Standard (bds-layers.json) drives deterministic mapping;
        // the LOCAL model (settings.GhostModel, default qwen2.5) resolves only the unrecognised layers.
        // Cloud stays off — the drawing never leaves the machine.
        var rulesetPath = string.IsNullOrWhiteSpace(settings.GhostLayerRulesetPath) ? null : settings.GhostLayerRulesetPath;
        // P2 SENSE (slice 1): read supporting docs (PDF/specs) from the SCOPED folder → context for the model.
        var evidence = GhostEvidence.FromFolder(settings.GhostSourceFolder);
        var llm = new LocalGhostBuilder(schemaJson, settings.GhostModel, settings.OllamaUrl, evidence.Context);
        var mapper = new LayerMapper(llm, matcher: LayerRulesetMatcher.Load(rulesetPath));
        // minConfidence 0: the P3 review window is the confidence gate now. It pre-ticks at 0.5 and shows
        // the score on every row, so a human has already adjudicated each layer by the time we place —
        // a second silent engine-side threshold would just drop layers the reviewer deliberately ticked.
        var orchestrator = new GhostBuilderOrchestrator(doc, mapper, minConfidence: 0, familyLibraryDir: libraryDir);
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
        var placementEvent = new GhostBuilderPlacementEvent();
        var externalEvent = ExternalEvent.Create(placementEvent);

        // 5. Modeless progress window owns the CancellationTokenSource (ESC / Cancel -> cancel).
        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        // 5b. The P3 review gate. Created here (UI thread) but only shown once the proposal exists;
        // its Build click is the ONLY path to placement, so an unreviewed proposal can never reach the model.
        var review = new GhostReviewWindow();
        new System.Windows.Interop.WindowInteropHelper(review) { Owner = c.Application.MainWindowHandle };
        bool building = false;

        review.BuildRequested += approved =>
        {
            building = true;
            placementEvent.SetRequest(orchestrator, inputs, approved);
            externalEvent.Raise();
        };

        // Closing the review without building ends the run — nothing was written, so there is nothing
        // to report or undo. Disposing the mapper here is what releases its HttpClient.
        review.Closed += (_, __) => { if (!building) mapper.Dispose(); };

        placementEvent.Completed += (report, error) =>
        {
            // Back on the API thread. Marshal UI updates to the window's dispatcher.
            review.Dispatcher.Invoke(() =>
            {
                mapper.Dispose();
                review.Close();
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
                // P2 slice 2: read sketch/render images with the local vision model and fold their hints into
                // the model's context. Best-effort + offline; no images / no VLM pulled -> silently skipped.
                int imgCount = LocalVisionReader.CountImages(settings.GhostSourceFolder);
                if (imgCount > 0)
                {
                    progress.SetStatus($"Reading {imgCount} sketch(es) with the local vision model…");
                    using var vision = new LocalVisionReader(settings.GhostVisionModel, settings.OllamaUrl);
                    string hints = await vision.ReadFolderAsync(settings.GhostSourceFolder, ct: progress.Token).ConfigureAwait(false);
                    if (!string.IsNullOrWhiteSpace(hints)) llm.AppendEvidence(hints);
                }

                progress.SetStatus(evidence.IsEmpty
                    ? "Mapping CAD layers with the local model…"
                    : $"Mapping CAD layers with the local model ({evidence.Sources.Count} doc(s) for context)…");
                MappingResult mapping = await orchestrator.MapAsync(inputs, progress.Token).ConfigureAwait(false);

                if (progress.Token.IsCancellationRequested) return; // user aborted; window already closing

                // P2 (task 4/5): one more local call — read the project documents for parameter values that
                // belong on the mapped elements (a spec's "FR60" -> the wall's Fire Rating). Runs over the
                // FINAL mapping set, so layers the deterministic BDS pass resolved get seeded too. No
                // documents in the scoped folder -> no call, no change.
                if (llm.HasEvidence)
                {
                    progress.SetStatus("Reading parameters from the project documents…");
                    await llm.EnrichParamsAsync(mapping, progress.Token).ConfigureAwait(false);
                }

                // P3 gate: hand the proposal to the human instead of building it. Placement is raised
                // from the review window's Build click, never from here.
                var perLayer = inputs.Elements
                    .GroupBy(e => e.CadLayer ?? "", System.StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.Count(), System.StringComparer.OrdinalIgnoreCase);

                progress.Dispatcher.Invoke(() =>
                {
                    progress.Close();
                    review.Load(mapping, perLayer, doc.Title);
                    review.Show();
                });
            }
            catch (System.OperationCanceledException)
            {
                CloseOnUi(progress, mapper); // ESC/Cancel: HTTP aborted cleanly
            }
            catch (System.Net.Http.HttpRequestException)
            {
                FailOnUi(progress, mapper,
                    $"Could not reach the local model at {settings.OllamaUrl}.\n\n" +
                    $"Start Ollama and pull the model (\"ollama pull {settings.GhostModel}\"), then try again.");
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
