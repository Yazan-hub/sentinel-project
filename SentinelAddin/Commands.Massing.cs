#nullable disable
using System;
using System.Collections.Generic;
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
/// in the scoped folder, let the user CORRECT the numbers, then (MA-6-6, MAS-2) file them as ONE reviewed changeset —
/// the Building Story levels the massing needs that the model lacks, and one untyped mass between them
/// (MassingPlanner.Changeset). Nothing is placed until a person ticks and applies it in Review AI Proposals, which opens
/// on it; Shell a Mass (2c) then turns the mass into typed walls, floors and a roof, one storey per level (MAS-1). A mass
/// and levels are untyped, so no guideline or type catalogue is read here.
/// The governed answer to the Geopogo demo: the estimate is an explicit, reviewable input, not silent geometry
/// that drifts.
///
/// Threading: vision inference on a background thread (Revit-API-free); the levels are read and the body planned on the
/// API thread through the event hub when the person files (the review is modeless — MA-6 amendment 4); the bridge is
/// called off Revit's thread, under the review guard.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class MassingFromImagesCommand : IExternalCommand
{
    private const string Title = "Sentinel — Massing";

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        // MA-1a item 6 (review amendment C10): never into a design option — said before an image is read. Apply asks again
        // (the executor), for an option entered while the review is open.
        if (PlacementApply.DesignOptionRefusal(doc, "run Photo Massing") is { } inOption)
        {
            TaskDialog.Show(Title, inOption);
            return Result.Cancelled;
        }
        // MA-6-6 (amendment 4): filing needs a project key and the review guard free — said before an image is read.
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show(Title, ProjectContext.NotBound);
            return Result.Cancelled;
        }
        if (ReviewChangesetsCommand.Held)
        {
            TaskDialog.Show(Title, ReviewChangesetsCommand.Busy);
            return Result.Cancelled;
        }

        var settings = SettingsManager.Resolve(doc);
        if (SettingsManager.ToolRefusal(settings, callsModel: true) is { } notLocal) // SEC-2: asked before an image is read or sent
        {
            TaskDialog.Show(Title, notLocal);
            return Result.Cancelled;
        }
        string folder = settings.GhostSourceFolder;
        if (string.IsNullOrWhiteSpace(folder) || MassingVisionReader.CountImages(folder) == 0)
        {
            TaskDialog.Show(Title,
                "No images found. Set the Ghost source folder (Project Setup) to a folder containing the " +
                "project's photos / renders / elevations, then run again.");
            return Result.Cancelled;
        }

        string key = ctx.Key;
        var cfg = BcfConfig.Load();
        // MA-1a item 8: the vision reader's time and usage, for the filing's receipt.
        var readerClock = new System.Diagnostics.Stopwatch();
        ModelUsage visionUsage = null;

        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        // Vision estimate on a background thread; the review window (Revit's thread) asks for the filing.
        _ = Task.Run(async () =>
        {
            try
            {
                progress.SetStatus($"Reading the project images with the vision model {LocalOnly.Where(settings.OllamaUrl)}…");
                using var reader = new MassingVisionReader(settings.GhostVisionModel, settings.OllamaUrl, settings.GhostCloudOptIn);
                readerClock.Start();
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
                readerClock.Stop();
                visionUsage = reader.Usage;
                // MA-1a item 4 (founder decision F6): one sha256 over the images the vision model read. MA-6-6: it rides on the receipt —
                // the executor never reads a changeset's provenance (C1), so it is not stamped on the mass.
                string imagesSha = ProvenanceStamp.FilesSha256(MassingVisionReader.Images(folder).Take(MassingVisionReader.MaxImages));
                if (progress.Token.IsCancellationRequested) return;

                progress.Dispatcher.Invoke(() =>
                {
                    progress.Close();
                    var review = new MassingReviewWindow(estimate); // closed once the changeset is filed, reopened with why otherwise
                    new System.Windows.Interop.WindowInteropHelper(review) { Owner = c.Application.MainWindowHandle };
                    review.BuildRequested += corrected =>
                    {
                        var receipt = new BuildReceipt.Facts { Seconds = readerClock.Elapsed.TotalSeconds };
                        receipt.Models.Add(visionUsage);
                        receipt.Parameters["images_read"] = Math.Min(MassingVisionReader.CountImages(folder), MassingVisionReader.MaxImages);
                        // Final review (E7): the images are the source only while the numbers still hold one the vision model gave.
                        receipt.Parameters["images_sha256"] = MassingPlanner.HasModelValue(corrected) ? imagesSha : null;
                        receipt.Parameters["openings_seen"] = MassingPlanner.OpeningsSeen(corrected); // D12: counted, never placed
                        // SEC-7, amendment 4: planned on Revit's thread in this model when the person files — the levels read then, not when
                        // the review opened (a level added since would give a duplicate name, and Apply would decline the changeset for good).
                        if (App.Events is null) { review.Reopen(MassingPlanner.NotStarted("Sentinel's event hub is not running — restart Revit")); return; }
                        App.Events.Enqueue(doc, "plan Photo Massing", (u, d) => PlanAndFile(d, cfg, key, corrected, review, receipt),
                            why => review.Reopen(MassingPlanner.NotStarted(why)));
                    };
                    review.Show();
                });
            }
            catch (OperationCanceledException) { progress.Dispatcher.Invoke(progress.Close); }
            catch (Exception ex)
            {
                progress.Dispatcher.Invoke(() => { progress.Close(); TaskDialog.Show(Title, ex.Message); });
            }
        });

        progress.Show();
        return Result.Succeeded;
    }

    // MA-6-6: on Revit's thread in the model the command started from (DocPin) — the key and the guard asked again, the levels read, the
    // body planned (MassingPlanner.Changeset), then filed off Revit's thread as Shell a Mass files (review C11: signed in, the person's token
    // or none, never the PC's), the review guard held until the bridge has answered. Filed: the receipt, the review closes and Review AI
    // Proposals opens on the changeset. Not filed: the review reopens with why.
    private static void PlanAndFile(Document doc, BcfConfig cfg, string key, MassingEstimate corrected, MassingReviewWindow review, BuildReceipt.Facts receipt)
    {
        if (ProjectContext.For(doc).Key != key) { review.Reopen(MassingPlanner.NotStarted($"this model's project changed since the images were read (was {key}) — run Photo Massing again")); return; }
        if (ReviewChangesetsCommand.Held) { review.Reopen(MassingPlanner.NotStarted(ReviewChangesetsCommand.Busy)); return; }
        var levels = ChangesetExecutor.Stories(doc).Select(l => (l.Name, l.ElevationMm, l.IsStory)).ToList();
        var actor = UserSession.Actor;
        var (body, refusal) = MassingPlanner.Changeset(corrected, levels, actor);
        if (refusal != null) { review.Reopen(MassingPlanner.NotStarted(refusal)); return; }

        ReviewChangesetsCommand.Hold(); // released once the bridge has answered
        var pane = System.Windows.Threading.Dispatcher.CurrentDispatcher;
        var title = doc.Title;
        var fileCfg = BcfConfig.Load(); if (UserSession.IsSignedIn) fileCfg.FileToken = "";
        App.PanelVm?.LogDoctor("Photo Massing: filing the changeset off Revit's thread — the review opens by itself in this model once the bridge has answered.");
        Task.Run(() =>
        {
            ChangesetDto cs = null;
            string err = null;
            try { cs = ChangesetClient.Propose(fileCfg, key, body, out err); }
            catch (Exception ex) { err = $"{ex.GetType().Name}: {ex.Message}"; }
            finally { ReviewChangesetsCommand.Release(); }
            if (cs == null)
            {
                _ = review.Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (review.IsVisible) review.Reopen(MassingPlanner.ReopenStatus);
                    TaskDialog.Show(Title, "Photo Massing was not filed — " + (err ?? "the bridge did not take it") + "\n\nNothing was placed; nothing in the model changed.");
                }));
                return;
            }
            try
            {
                // MA-1a item 8: the build:run receipt — the vision model's run and what it filed (the counts ride on it, D12).
                receipt.Candidates = cs.Elements?.Count ?? 0;
                GovernedNotify.Report("Photo Massing receipt", BuildReceipt.Run("photo-massing", BuildReceipt.AddinSha256, receipt, 0, new List<string> { cs.Id }, actor), key, pane);
            }
            catch (Exception ex) { App.PanelVm?.LogDoctor($"Photo Massing's receipt was not sent — {ex.GetType().Name}: {ex.Message}"); }
            App.PanelVm?.LogDoctor($"Photo Massing: \"{cs.Name}\" filed (confirmed by the bridge) — the filing is done.");
            _ = review.Dispatcher.BeginInvoke(new Action(() => { if (review.IsVisible) review.Close(); }));
            string NotOpened(string why) => why + $"\n\n\"{cs.Name}\" waits for review — in \"{title}\", run Review AI Proposals.";
            App.Events.Enqueue(doc, "open the review of Photo Massing", (u, d) =>
            {
                if (ProjectContext.For(d).Key != key) { TaskDialog.Show(Title, NotOpened($"This model's project changed while Photo Massing filed (was {key})")); return; }
                if (ReviewChangesetsCommand.Held) { TaskDialog.Show(Title, NotOpened(ReviewChangesetsCommand.Busy)); return; }
                ReviewChangesetsCommand.Open(u, d, cfg, key, new[] { cs });
            }, why => TaskDialog.Show(Title, NotOpened(why)));
        });
    }
}
