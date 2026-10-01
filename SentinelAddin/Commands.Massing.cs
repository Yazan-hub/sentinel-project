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
/// GhostBuilder placement a DWG uses, typed by the guideline@n and type_catalog@n installed on the document's web
/// project (or its office) and named in the summary; with no guideline every wall is a declared placeholder.
/// The governed answer to the Geopogo demo: the estimate is an explicit, reviewable input, not silent geometry
/// that drifts.
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
        // The project key is read here (Extensible Storage, API thread); the guideline and type catalogue it names are
        // fetched off this thread while the vision model reads the images. Massing reads no layer standard.
        string key = ProjectContext.For(doc).Key;
        GhostStandards standards = null; // set in the background before the review window can raise a build

        var placementEvent = new MassingPlacementEvent();
        var externalEvent = ExternalEvent.Create(placementEvent);

        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
            TaskDialog.Show("Sentinel — Massing",
                error != null ? "Build failed: " + error.Message : Summarize(report, standards));
        });

        // Vision estimate and the standards GET on background threads; the review window (API thread) drives the build.
        _ = Task.Run(async () =>
        {
            try
            {
                var fetch = Task.Run(() => GhostStandards.Load(key, layers: false)); // guideline@n + type_catalog@n
                progress.SetStatus($"Reading the project images with the local vision model…");
                using var reader = new MassingVisionReader(settings.GhostVisionModel, settings.OllamaUrl);
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;
                progress.SetStatus("Reading the project's guideline and type catalogue…");
                standards = await fetch.ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;
                var orchestrator = new GhostBuilderOrchestrator(doc, mapper: null, minConfidence: 0,
                                                                familyLibraryDir: libraryDir, guideline: standards.Guideline,
                                                                placeholderTypes: true); // LOD 100: default types, declared

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

    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        if (r is null) return "No report returned.";
        var sb = new System.Text.StringBuilder();
        // What typed this massing, first: the project's guideline and type catalogue, a none named as none.
        sb.AppendLine("Guideline: " + s.GuidelineSource.Label + " · Type catalogue: " + s.CatalogSource.Label);
        if (s.CatalogSource.Origin == "none") sb.AppendLine(GhostBuilderCommand.CatalogueNotChecked(s));
        sb.AppendLine();
        if (r.RolledBack != null) return sb.AppendLine(GhostFailurePolicy.NotBuiltLine(r.RolledBack)).ToString();
        if (r.NotFinished != null) return sb.AppendLine(r.NotFinished).ToString(); // A6
        sb.AppendLine(GhostFailurePolicy.PlacedLine(r.Placed, r.DeletedByRevit));
        sb.AppendLine(GhostBuilderCommand.WallsLine(r, s));
        if (r.SkippedUnknownFamily > 0) sb.AppendLine($"Skipped (type or family not in the model): {r.SkippedUnknownFamily}");
        var revitWarnings = GhostFailurePolicy.WarningsLine(r.RevitWarnings);
        if (revitWarnings != null) sb.AppendLine(revitWarnings);
        if (r.CreatedTypes.Count > 0)
        {
            sb.AppendLine().AppendLine($"Added {r.CreatedTypes.Count} type(s) or family(ies) to the model:");
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
