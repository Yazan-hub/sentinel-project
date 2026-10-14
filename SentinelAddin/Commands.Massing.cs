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
/// Photo → Massing: estimate a building's envelope from the project's evidence-pack photos (MA-7-14: the admitted, blurred
/// copies, read through the bridge, never a folder), let the user CORRECT the numbers, then (MA-6-6, MAS-2) file them as ONE reviewed changeset —
/// the Building Story levels the massing needs that the model lacks, and one untyped mass between them
/// (MassingPlanner.Changeset). Nothing is placed until a person ticks and applies it in Review AI Proposals, which opens
/// on it; Shell a Mass (2c) then turns the mass into typed walls, floors and a roof, one storey per level (MAS-1). A mass
/// and levels are untyped, so no guideline or type catalogue is read here.
/// MA-7-14 closed Photo Massing's folder; MA-7-28 closed Ghost Builder's: its layer hints come from the same pack photos, never a folder.
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
        // MA-7-14 (amendment 27): the pack's photos are read by a model on this PC only - checked before any image is read or fetched.
        if (LocalOnly.ModelUrlRefusal(settings.OllamaUrl, cloudOptIn: false) != null)
        {
            TaskDialog.Show(Title, "Photo Massing: evidence photos are read by a model on this PC only — nothing was sent");
            return Result.Cancelled;
        }
        // MA-7-14 (D-7-27): the photos are the evidence pack's admitted, blurred ones, listed by the bridge - not a free folder. The read waits on a
        // pool thread like every client call here (MA-2d).
        var cfg = BcfConfig.Load();
        // (a slow bridge holds Revit for at most FetchPack's 8 s bound before this answer)
        string packJson = EvidenceClient.FetchPack(cfg, ctx.Key, PackPhotos.PackId, out string packErr);
        if (packJson == null) { TaskDialog.Show(Title, "Photo Massing could not read the project's evidence pack — " + packErr + "\n\nNothing was read."); return Result.Cancelled; }
        var (packPhotos, packSkipped, packBad) = PackPhotos.Usable(packJson);
        if (packBad != null) { TaskDialog.Show(Title, "Photo Massing could not read the project's evidence pack — " + packBad + "\n\nNothing was read."); return Result.Cancelled; }
        if (packPhotos.Count == 0)
        {
            TaskDialog.Show(Title, PackPhotos.NoneWords(packSkipped));
            return Result.Cancelled;
        }
        foreach (var why in packSkipped) App.PanelVm?.LogDoctor("Photo Massing: " + why);

        // MA-6-10 review: both picks work on the active view's plane - a section, sheet or 3D view would file the mass at the wrong place.
        if (uidoc.ActiveView is not ViewPlan)
        {
            TaskDialog.Show(Title, "Open a plan view, then run Photo Massing again - the mass is placed on the plan.");
            return Result.Cancelled;
        }
        // MA-6-10 (MAS-3): where the mass stands - asked here, a valid API context (the modeless review and the event hub never pick).
        var ask = new TaskDialog(Title)
        {
            MainInstruction = "Where does the mass stand?",
            CommonButtons = TaskDialogCommonButtons.Cancel,
        };
        ask.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Pick its footprint — a closed CAD polyline, a property line, or the model lines you selected first");
        ask.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Width × depth from the photos, centred on a point you pick");
        var way = ask.Show();
        if (way != TaskDialogResult.CommandLink1 && way != TaskDialogResult.CommandLink2) return Result.Cancelled;
        Footprint fp = null;
        if (way == TaskDialogResult.CommandLink1)
        {
            var segs = FootprintPicker.Pick(uidoc, out string pickedFrom, out string pickWhy);
            if (segs == null) { if (pickWhy != null) TaskDialog.Show(Title, "The footprint could not be read: " + pickWhy + "."); return Result.Cancelled; }
            var loop = MassingPlanner.Chain(segs, 1, out string chainWhy);
            if (loop == null) { TaskDialog.Show(Title, "The footprint is not one closed outline — " + chainWhy); return Result.Cancelled; }
            // MA-6-10 review: the outline is normalised and checked now - not found out at File, after the vision run.
            var norm = MassingPlanner.Placed(new Footprint { Loop = loop }, 0);
            if (norm == null) { TaskDialog.Show(Title, "The footprint has fewer than 3 corners once its repeated and straight-through points are dropped - check the outline."); return Result.Cancelled; }
            if (MassingPlanner.OutlineProblem(norm) is { } outlineWhy) { TaskDialog.Show(Title, "The footprint cannot be used: " + outlineWhy + "."); return Result.Cancelled; }
            fp = new Footprint { Loop = norm, From = pickedFrom };
        }
        var centre = FootprintPicker.Centre(uidoc, out string centreWhy);
        if (centreWhy != null) { TaskDialog.Show(Title, centreWhy); return Result.Cancelled; }
        if (centre != null) (fp ??= new Footprint { From = "width × depth from the photos" }).At = centre; // Esc: where it lies / the internal origin, as before

        string key = ctx.Key;
        // MA-1a item 8: the vision reader's time and usage, for the filing's receipt.
        var readerClock = new System.Diagnostics.Stopwatch();
        ModelUsage visionUsage = null;

        var readOk = new List<PackPhoto>(); // the photos whose blurred copy came, matched its sha AND the model gave a reading of (no Error) - what the mass will name
        var progress = new GhostBuilderProgressWindow(Title);
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        // Vision estimate on a background thread; the review window (Revit's thread) asks for the filing.
        _ = Task.Run(async () =>
        {
            try
            {
                progress.SetStatus($"Reading the project images with the vision model {LocalOnly.Where(settings.OllamaUrl)}…");
                using var reader = new MassingVisionReader(settings.GhostVisionModel, settings.OllamaUrl, settings.GhostCloudOptIn);
                readerClock.Start();
                MassingEstimate estimate = await reader.EstimateAsync(packPhotos, p => CopyOf(cfg, key, p), onRead: p => { lock (readOk) readOk.Add(p); }, ct: progress.Token, progress: new Progress<string>(progress.SetStatus)).ConfigureAwait(false); // MA-6-9: "Reading photo i of n…"
                readerClock.Stop();
                visionUsage = reader.Usage;
                // MA-7-14 (replaces MA-1a item 4's folder hash): the pack photos the model read - each item id and its copy's sha256 - ride on the
                // receipt and, as evidence, on the mass the bridge checks. The executor never reads a changeset's provenance (C1).
                var photosRead = readOk.OrderBy(x => x.Id, StringComparer.Ordinal).ToList();
                var evidence = photosRead.Select(PackPhotos.Evidence).ToList();
                if (progress.Token.IsCancellationRequested) return;
                // MA-7-14 review: nothing readable -> said now with each photo's reason, before the person types a number the bridge would refuse at File.
                if (photosRead.Count == 0)
                {
                    progress.Dispatcher.Invoke(() => { progress.Close(); TaskDialog.Show(Title, "Photo Massing: Nothing was read.\n\n" + string.Join("\n", estimate.ViewLines)); });
                    return;
                }

                progress.Dispatcher.Invoke(() =>
                {
                    progress.Close();
                    estimate.Footprint = fp; // MA-6-10: Scale and the review's rows read it
                    var review = new MassingReviewWindow(estimate); // closed once the changeset is filed, reopened with why otherwise
                    new System.Windows.Interop.WindowInteropHelper(review) { Owner = c.Application.MainWindowHandle };
                    review.BuildRequested += corrected =>
                    {
                        var receipt = new BuildReceipt.Facts { Seconds = readerClock.Elapsed.TotalSeconds };
                        receipt.Models.Add(visionUsage);
                        receipt.Parameters["images_read"] = photosRead.Count;
                        // Final review (E7): the images are the source only while the numbers still hold one the vision model gave.
                        receipt.Parameters["photos"] = photosRead.Select(x => new { item = x.Id, copy_sha256 = x.CopySha256 }).ToList(); // MA-7-14 review: the same photos the filed mass names, always
                        receipt.Parameters["model_values"] = MassingPlanner.HasModelValue(corrected); // Final review (E7): false when the person replaced every number the model gave
                        receipt.Parameters["openings_seen"] = MassingPlanner.OpeningsSeen(corrected); // D12: counted, never placed
                        receipt.Parameters["views"] = corrected.ViewLines; // MA-6-9: one line per photo read (counts and ratio, never a length)
                        receipt.Parameters["known_dimension"] = MassingPlanner.KnownWords(corrected); // MA-6-9: the one length a person gave
                        // SEC-7, amendment 4: planned on Revit's thread in this model when the person files — the levels read then, not when
                        // the review opened (a level added since would give a duplicate name, and Apply would decline the changeset for good).
                        if (App.Events is null) { review.Reopen(MassingPlanner.NotStarted("Sentinel's event hub is not running — restart Revit")); return; }
                        App.Events.Enqueue(doc, "plan Photo Massing", (u, d) => PlanAndFile(d, cfg, key, corrected, fp, review, receipt, evidence),
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

    // MA-7-14: a pack photo's blurred copy through the bridge (a pool-thread read), accepted only when it is the copy the pack names (its sha256).
    internal static (byte[] Jpeg, string Error) CopyOf(BcfConfig cfg, string key, PackPhoto p)
    {
        var bytes = EvidenceClient.FetchCopy(cfg, key, PackPhotos.PackId, p.Id, out string err);
        if (bytes == null) return (null, $"its blurred copy could not be read ({err}) — {p.Id} not read");
        if (!PackPhotos.IsCopy(bytes, p)) return (null, $"its blurred copy is not the one the pack names (sha256 differs) — {p.Id} not read");
        return (bytes, null);
    }

    // MA-6-6: on Revit's thread in the model the command started from (DocPin) — the key and the guard asked again, the levels read, the
    // body planned (MassingPlanner.Changeset), then filed off Revit's thread as Shell a Mass files (review C11: signed in, the person's token
    // or none, never the PC's), the review guard held until the bridge has answered. Filed: the receipt, the review closes and Review AI
    // Proposals opens on the changeset. Not filed: the review reopens with why. A Photo Massing changeset already waiting is opened instead.
    private static void PlanAndFile(Document doc, BcfConfig cfg, string key, MassingEstimate corrected, Footprint fp, MassingReviewWindow review, BuildReceipt.Facts receipt, List<string> evidence)
    {
        if (ProjectContext.For(doc).Key != key) { review.Reopen(MassingPlanner.NotStarted($"this model's project changed since the images were read (was {key}) — run Photo Massing again")); return; }
        if (ReviewChangesetsCommand.Held) { review.Reopen(MassingPlanner.NotStarted(ReviewChangesetsCommand.Busy)); return; }
        var levels = ChangesetExecutor.Stories(doc).Select(l => (l.Name, l.ElevationMm, l.IsStory)).ToList();
        var actor = UserSession.Actor;
        // MA-7-14: a mass is filed only with the pack photos it was read from; none could be read -> nothing to file (the bridge would refuse it)
        if (evidence.Count == 0) { review.Reopen(MassingPlanner.NotStarted("no photo could be read from the evidence pack — see Files ▸ Evidence")); return; }
        var (body, refusal) = MassingPlanner.Changeset(corrected, levels, actor, fp, evidence);
        if (refusal != null) { review.Reopen(MassingPlanner.NotStarted(refusal)); return; }

        ReviewChangesetsCommand.Hold(); // released once the bridge has answered
        var pane = System.Windows.Threading.Dispatcher.CurrentDispatcher;
        var title = doc.Title;
        var fileCfg = BcfConfig.Load(); if (UserSession.IsSignedIn) fileCfg.FileToken = "";
        App.PanelVm?.LogDoctor("Photo Massing: filing the changeset off Revit's thread — the review opens by itself in this model once the bridge has answered.");
        Task.Run(() =>
        {
            ChangesetDto cs = null, waiting = null;
            string err = null;
            try
            {
                // MA-6-6 review fix: a Photo Massing changeset still waiting for review is opened instead, as Shell a Mass and Promote do — a
                // second would create the same "Massing Lnn" levels (its Apply declined for good, D16) and a second mass on the first.
                var pending = ChangesetClient.FetchProposed(cfg, key, out err);
                waiting = pending?.FirstOrDefault(p => p.Source == "photo");
                // MA-7-14 review: one filed before 7-14 (no evidence on its mass) was read outside the pack - it is declined, not opened to apply.
                if (waiting != null && waiting.Elements?.Any(e => e.Evidence != null && e.Evidence.Count > 0) != true)
                {
                    err = $"\"{waiting.Name}\", an older Photo Massing changeset read outside the evidence pack, waits - decline it in Review AI Proposals, then run Photo Massing again";
                    waiting = null;
                }
                else if (pending != null && waiting == null) cs = ChangesetClient.Propose(fileCfg, key, body, out err);
            }
            catch (Exception ex) { err = $"{ex.GetType().Name}: {ex.Message}"; }
            finally { ReviewChangesetsCommand.Release(); }
            if (waiting != null)
            {
                _ = review.Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (review.IsVisible) review.Reopen(MassingPlanner.NotStarted($"\"{waiting.Name}\" already waits for review — it opens now: apply or decline it first"));
                }));
                cs = waiting;
            }
            else if (cs == null)
            {
                _ = review.Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (review.IsVisible) review.Reopen(MassingPlanner.ReopenStatus);
                    TaskDialog.Show(Title, "Photo Massing was not filed — " + (err ?? "the bridge did not take it") + "\n\nNothing was placed; nothing in the model changed.");
                }));
                return;
            }
            else
            {
                try
                {
                    // MA-1a item 8: the build:run receipt — the vision model's run and what it filed (the counts ride on it, D12).
                    receipt.Candidates = cs.Elements?.Count ?? 0;
                    GovernedNotify.Report("Photo Massing receipt", BuildReceipt.Run("photo-massing", BuildReceipt.AddinSha256, receipt, 0, new List<string> { cs.Id }, actor), key, pane);
                }
                catch (Exception ex) { App.PanelVm?.LogDoctor($"Photo Massing's receipt was not sent — {ex.GetType().Name}: {ex.Message}"); }
                App.PanelVm?.LogDoctor($"Photo Massing: \"{cs.Name}\" filed (confirmed by the bridge) — the filing is done.");
                _ = review.Dispatcher.BeginInvoke(new Action(() => { if (review.IsVisible) review.Close(); }));
            }
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
