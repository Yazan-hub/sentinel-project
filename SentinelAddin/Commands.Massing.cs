#nullable disable
using System;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
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
        // MA-1a item 6 (review amendment C10): never into a design option — said before an image is read. The placement
        // event asks again, for an option entered while the review is open.
        if (PlacementApply.DesignOptionRefusal(doc, "run Photo Massing") is { } inOption)
        {
            TaskDialog.Show("Sentinel — Massing", inOption);
            return Result.Cancelled;
        }

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
        var loadedTypes = GhostBuilderCommand.HeldTypes(doc); // MA-1a item 6: the model's types, read on the API thread (F-MA2a-4: every type it holds)
        string templateLine = null;                             // the office-template check's line, for the summary
        string stampSha = null; // MA-1a item 7: the images' sha the build was stamped with (null: the numbers are the reviewer's)
        // MA-1a item 8: the vision reader's time and usage, and the facts of the run that was built, for its receipt.
        var readerClock = new System.Diagnostics.Stopwatch();
        ModelUsage visionUsage = null;
        BuildReceipt.Facts receipt = null;

        var placementEvent = new MassingPlacementEvent();
        var externalEvent = ExternalEvent.Create(placementEvent);

        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        MassingReviewWindow review = null; // MAS-4: set when the review opens; closed below once a build is kept
        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
            // MA-1a item 7: one massing row for a build Revit committed, sent off this thread.
            if (error == null && report != null && report.RolledBack == null && report.NotFinished == null && report.Placed > 0)
                GovernedNotify.Report("Photo Massing", CommandReports.Massing(report.Placed, report.DeletedByRevit.Count, report.WallGaps,
                    report.SkippedUnknownFamily + report.SkippedNoGeometry, report.RevitWarnings.Values.Sum(), report.CreatedTypes.Count,
                    stampSha, UserSession.Actor), key);
            if (error == null && report != null && report.RolledBack == null && report.NotFinished == null && report.Placed > 0 && receipt != null)
                GovernedNotify.Report("Photo Massing receipt", BuildReceipt.Run("photo-massing", BuildReceipt.AddinSha256, receipt, report.WallGaps, new string[0], UserSession.Actor), key);
            // MAS-4: a kept build closes the review (Build was disabled by the click, so no second massing lands on top) and
            // what it placed is selected and zoomed to, before the summary; a build that kept nothing — refused before the
            // transaction, rolled back, or nothing placed — leaves the review open with the reviewer's numbers.
            bool kept = MassingPlanner.BuildKept(error != null, report?.RolledBack != null, report?.NotFinished != null, report?.Placed ?? 0);
            string selected = kept && report.NotFinished == null ? SelectPlaced(uidoc, report) : null;
            if (review != null && review.IsVisible)
            {
                if (kept) review.Close();
                else review.Reopen(MassingPlanner.ReopenStatus);
            }
            TaskDialog.Show("Sentinel — Massing",
                error != null ? "Build failed: " + error.Message
                              : Summarize(report, standards, templateLine) + (selected == null ? "" : Environment.NewLine + selected));
        });

        // Vision estimate and the standards GET on background threads; the review window (API thread) drives the build.
        _ = Task.Run(async () =>
        {
            try
            {
                var fetch = Task.Run(() => GhostStandards.Load(key, layers: false)); // guideline@n + type_catalog@n
                progress.SetStatus($"Reading the project images with the local vision model…");
                using var reader = new MassingVisionReader(settings.GhostVisionModel, settings.OllamaUrl);
                readerClock.Start();
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
                readerClock.Stop();
                visionUsage = reader.Usage;
                // MA-1a item 4 (founder decision F6): one sha256 over the images the vision model read, for every element's stamp.
                string imagesSha = ProvenanceStamp.FilesSha256(MassingVisionReader.Images(folder).Take(MassingVisionReader.MaxImages));
                if (progress.Token.IsCancellationRequested) return;
                progress.SetStatus("Reading the project's guideline and type catalogue…");
                standards = await fetch.ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;
                // MA-1a item 6 (review amendment C7): a guideline that could not be read is not "no block".
                if (PlacementPolicy.UnreadRefusal(standards.GuidelineSource.Origin, standards.GuidelineSource.NotInstalled || standards.GuidelineSource.NoProject,
                                                  !string.IsNullOrWhiteSpace(key), standards.GuidelineSource.Reason) is { } unread)
                {
                    progress.Dispatcher.Invoke(() => { progress.Close(); TaskDialog.Show("Sentinel — Massing", unread); });
                    return;
                }
                // MA-1a item 6, the office-template check: refused when the model holds none of the office types.
                var (officeHave, officeAll) = standards.Guideline.OfficeTypesIn(loadedTypes);
                if (PlacementPolicy.TemplateRefuses(officeHave, officeAll))
                {
                    string refused = PlacementPolicy.TemplateRefusal(officeAll, standards.CatalogSource.Label);
                    progress.Dispatcher.Invoke(() => { progress.Close(); TaskDialog.Show("Sentinel — Massing", refused); });
                    return;
                }
                templateLine = PlacementPolicy.TemplateLine(standards.Guideline.HasCatalog, officeHave, officeAll, standards.CatalogSource.Label);
                var orchestrator = new GhostBuilderOrchestrator(doc, mapper: null, minConfidence: 0,
                                                                familyLibraryDir: libraryDir, guideline: standards.Guideline,
                                                                placeholderTypes: true); // LOD 100: default types, declared

                progress.Dispatcher.Invoke(() =>
                {
                    progress.Close();
                    review = new MassingReviewWindow(estimate); // MAS-4: the Completed handler closes or reopens it
                    new System.Windows.Interop.WindowInteropHelper(review) { Owner = c.Application.MainWindowHandle };
                    review.BuildRequested += corrected =>
                    {
                        var plan = MassingPlanner.Plan(corrected, defaultWallThicknessMm: 200);
                        var (elements, mapping) = MassingBuilder.ToBuildInputs(plan);
                        // Final review (E7): the images are the stamp's source only when the build still holds a number the
                        // vision model gave — not when Ollama was down or answered badly, or the reviewer replaced them all.
                        stampSha = MassingPlanner.HasModelValue(corrected) ? imagesSha : null;
                        receipt = new BuildReceipt.Facts { Seconds = readerClock.Elapsed.TotalSeconds, Candidates = elements.Count };
                        receipt.Models.Add(visionUsage);
                        receipt.Parameters["images_read"] = Math.Min(MassingVisionReader.CountImages(folder), MassingVisionReader.MaxImages);
                        receipt.Parameters["guideline"] = standards.GuidelineSource.Label;
                        receipt.Parameters["type_catalogue"] = standards.CatalogSource.Label;
                        placementEvent.SetRequest(orchestrator, elements, mapping, stampSha, standards.Guideline.Placement); // MA-1a item 6
                        // MAS-4 (review amendment C12): a request Revit does not accept never reaches Completed — Build must not
                        // stay disabled for good.
                        if (externalEvent.Raise() != ExternalEventRequest.Accepted)
                            review.Reopen(MassingPlanner.NotStarted("Revit did not accept the build request"));
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

    // MAS-4: select and zoom to what the build placed — NewElements still in the model, the same elements "Placed" counts.
    // The line prints what Revit holds selected afterwards, read back (review amendment C11). Runs inside the placement event, after its transaction ended (a selection is no
    // model change). DocPin.Check let the build run only in this command's own model, so uidoc is the active one. A refusal
    // by Revit (no view can show them) is one line of the summary; the build stands.
    private static string SelectPlaced(UIDocument uidoc, GhostPlacementEngine.PlacementReport report)
    {
        var ids = report.NewElements.Select(n => n.Id).Where(id => uidoc.Document.GetElement(id) != null).ToList();
        try
        {
            uidoc.Selection.SetElementIds(ids);
            uidoc.ShowElements(ids);
            return MassingPlanner.SelectedLine(uidoc.Selection.GetElementIds().Count, ids.Count);
        }
        catch (Exception ex) { return MassingPlanner.NotSelectedLine(ex.Message); }
    }

    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s, string template = null)
    {
        if (r is null) return "No report returned.";
        var sb = new System.Text.StringBuilder();
        // What typed this massing, first: the project's guideline and type catalogue, a none named as none.
        sb.AppendLine("Guideline: " + s.GuidelineSource.Label + " · Type catalogue: " + s.CatalogSource.Label);
        if (s.CatalogSource.Origin == "none") sb.AppendLine(GhostBuilderCommand.CatalogueNotChecked(s));
        if (template != null) sb.AppendLine(template); // MA-1a item 6: the office-template check
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
        // MA-1a item 6: what the placement block did — a result of the build, not a note.
        if (r.Placement.Count > 0)
        {
            sb.AppendLine();
            foreach (var p in r.Placement) sb.AppendLine(p);
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
    private string _imagesSha; // MA-1a item 4: the images read, for the stamp
    private GuidelinePlacement _placement; // MA-1a item 6: the guideline's placement block; null = none

    public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

    public void SetRequest(GhostBuilderOrchestrator orchestrator,
                           System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, string imagesSha,
                           GuidelinePlacement placement = null)
    {
        _orchestrator = orchestrator; _elements = elements; _mapping = mapping; _imagesSha = imagesSha; _placement = placement;
    }

    public void Execute(UIApplication app)
    {
        var orch = _orchestrator; var els = _elements; var map = _mapping; var sha = _imagesSha; var placement = _placement;
        _orchestrator = null; _elements = null; _mapping = null; _imagesSha = null; _placement = null;
        try
        {
            if (orch == null) throw new InvalidOperationException("No massing request staged.");
            // XC-1 (review amendment C17): the review window is modeless — build only while the model the command was
            // started on is the active one, so the active view (and its phase) is that model's.
            if (DocPin.Check(app, orch.Doc, "build the massing") is { } pinned) throw new InvalidOperationException(pinned);
            // MA-1a item 6: never into a design option, and never onto a workset the model does not have — both said
            // before the transaction.
            if (PlacementApply.DesignOptionRefusal(orch.Doc, "build the massing") is { } inOption) throw new InvalidOperationException(inOption);
            // Only the kinds of the layers this plan staged are asked for (review amendment C8): a massing with no
            // openings needs no Doors or Windows workset.
            var kinds = map?.Mappings == null || els == null ? new System.Collections.Generic.List<string>()
                : map.Mappings.Where(m => els.Any(e => e.CadLayer == m.CadLayer)).Select(m => PlacementPolicy.KindOf(m.Category))
                     .Where(k => k != null).Distinct().ToList();
            var placing = PlacementApply.Resolve(orch.Doc, placement, app.ActiveUIDocument?.ActiveView, kinds, out var noWorkset);
            if (placing == null) throw new InvalidOperationException(noWorkset);
            Completed?.Invoke(orch.PlacePrepared(els, map, imagesSha256: sha, placing: placing), null);
        }
        catch (Exception ex) { Completed?.Invoke(null, ex); }
    }

    public string GetName() => "Sentinel Massing - Placement";
}
