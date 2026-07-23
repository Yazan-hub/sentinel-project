#nullable disable
using System;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Photo → Massing: estimate a building's envelope from the project images (renders, photos, elevations)
/// in the scoped folder, let the user CORRECT the numbers, then build it through the SAME governed
/// GhostBuilder placement + Office Modelling Guideline a DWG uses. The governed answer to the Geopogo demo:
/// the estimate is an explicit, reviewable input, not silent geometry that drifts.
///
/// Threading mirrors GhostBuilderCommand: vision inference on a background thread (Revit-API-free);
/// placement funnels through an ExternalEvent (API thread only).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class MassingFromImagesCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        var settings = SettingsManager.Resolve(doc);
        string folder = settings.GhostSourceFolder;
        if (string.IsNullOrWhiteSpace(folder) || MassingVisionReader.CountImages(folder) == 0)
        {
            TaskDialog.Show("Sentinel — Massing",
                "No images found. Set the Ghost source folder (Project Setup) to a folder containing the " +
                "project's photos / renders / elevations, then run again.");
            return Result.Cancelled;
        }

        string libraryDir = string.IsNullOrWhiteSpace(settings.GhostFamilyLibraryDir) ? null : settings.GhostFamilyLibraryDir;
        var guideline = GuidelineMatcher.Load(
            string.IsNullOrWhiteSpace(settings.GhostGuidelinePath) ? null : settings.GhostGuidelinePath,
            string.IsNullOrWhiteSpace(settings.GhostTypeCatalogPath) ? null : settings.GhostTypeCatalogPath);
        var orchestrator = new GhostBuilderOrchestrator(doc, mapper: null, minConfidence: 0,
                                                        familyLibraryDir: libraryDir, guideline: guideline);

        var placementEvent = new MassingPlacementEvent();
        var externalEvent = ExternalEvent.Create(placementEvent);

        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
            TaskDialog.Show("Sentinel — Massing",
                error != null ? "Build failed: " + error.Message : Summarize(report));
        });

        // Vision estimate on a background thread; the review window (API thread) drives the build.
        _ = Task.Run(async () =>
        {
            try
            {
                progress.SetStatus($"Reading the project images with the local vision model…");
                using var reader = new MassingVisionReader(settings.GhostVisionModel, settings.OllamaUrl);
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;

                progress.Dispatcher.Invoke(() =>
                {
                    progress.Close();
                    var review = new MassingReviewWindow(estimate);
                    new System.Windows.Interop.WindowInteropHelper(review) { Owner = c.Application.MainWindowHandle };
                    review.BuildRequested += corrected =>
                    {
                        var plan = MassingPlanner.Plan(corrected, defaultWallThicknessMm: 200);
                        var (elements, mapping) = MassingBuilder.ToBuildInputs(plan);
                        placementEvent.SetRequest(orchestrator, elements, mapping);
                        externalEvent.Raise();
                    };
                    review.Show();
                });
            }
            catch (OperationCanceledException) { progress.Dispatcher.Invoke(progress.Close); }
            catch (Exception ex)
            {
                progress.Dispatcher.Invoke(() => { progress.Close(); TaskDialog.Show("Sentinel — Massing", ex.Message); });
            }
        });

        progress.Show();
        return Result.Succeeded;
    }

    private static string Summarize(GhostPlacementEngine.PlacementReport r)
    {
        if (r is null) return "No report returned.";
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"Placed: {r.Placed}");
        if (r.CreatedTypes.Count > 0)
        {
            sb.AppendLine().AppendLine($"Created {r.CreatedTypes.Count} new type(s):");
            foreach (var t in r.CreatedTypes) sb.AppendLine($"  + {t}");
        }
        if (r.Warnings.Count > 0)
        {
            sb.AppendLine().AppendLine("Notes:");
            foreach (var g in r.Warnings.GroupBy(w => w).OrderByDescending(g => g.Count()))
                sb.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        return sb.ToString();
    }
}

/// <summary>PHASE 3 handoff for massing placement — mirrors GhostBuilderPlacementEvent. Places the
/// prepared elements on the API thread via the orchestrator's PlacePrepared (skips DWG face-pairing).</summary>
public sealed class MassingPlacementEvent : IExternalEventHandler
{
    private GhostBuilderOrchestrator _orchestrator;
    private System.Collections.Generic.List<GhostElement> _elements;
    private MappingResult _mapping;

    public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

    public void SetRequest(GhostBuilderOrchestrator orchestrator,
                           System.Collections.Generic.List<GhostElement> elements, MappingResult mapping)
    {
        _orchestrator = orchestrator; _elements = elements; _mapping = mapping;
    }

    public void Execute(UIApplication app)
    {
        var orch = _orchestrator; var els = _elements; var map = _mapping;
        _orchestrator = null; _elements = null; _mapping = null;
        try
        {
            if (orch == null) throw new InvalidOperationException("No massing request staged.");
            Completed?.Invoke(orch.PlacePrepared(els, map), null);
        }
        catch (Exception ex) { Completed?.Invoke(null, ex); }
    }

    public string GetName() => "Sentinel Massing - Placement";
}
