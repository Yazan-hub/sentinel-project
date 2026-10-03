#nullable disable
// Governed AI modeling (A2): the ribbon entry. Fetch proposed changesets (FIFO), show the review
// window, execute the human's ticks via ExternalEvent, report the result — with a retry dialog,
// because the bridge's recorded status is the truth and an unreported application is a lie by
// omission. Re-fetches the changeset right before executing: if an agent withdrew it meanwhile,
// nothing runs (the bridge's CAS makes the report side race-safe too). Open() is the review flow itself, shared with
// Promote walls (MA-0); a changeset whose result landed is remembered for the undo watcher.
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

[Transaction(TransactionMode.Manual)]
public sealed class ReviewChangesetsCommand : IExternalCommand
{
    // One review window at a time: status only flips at REPORT time, so two open windows would
    // both re-fetch "proposed" and both execute the same changeset — physical duplicates the
    // bridge's CAS can 409 but not prevent.
    private static bool _reviewOpen;
    // The roles POST /changesets/:key/:id/result accepts (changesets-store.mjs reportResult: contributor or above; the
    // machine credential reads as service).
    private static readonly string[] Reporters = { "service", "contributor", "lead", "owner" };

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        if (_reviewOpen)
        {
            TaskDialog.Show("Sentinel — AI proposals", "A review window is already open — finish or close it first.");
            return Result.Cancelled;
        }

        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — AI proposals", ProjectContext.NotBound);
            return Result.Cancelled;
        }
        var cfg = BcfConfig.Load();
        var key = ctx.Key;

        var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
        if (pending == null)
        {
            TaskDialog.Show("Sentinel — AI proposals", $"Couldn't reach the bridge:\n{fetchErr}");
            return Result.Failed;
        }
        if (pending.Count == 0)
        {
            TaskDialog.Show("Sentinel — AI proposals", $"No pending proposals for project \"{key}\".");
            return Result.Succeeded;
        }

        var cs = pending[0]; // FIFO; the dialog says how many wait behind it
        if (pending.Count > 1)
            TaskDialog.Show("Sentinel — AI proposals", $"{pending.Count} proposals pending — reviewing the oldest first ({cs.Name}). Run again for the next.");
        return Open(c, doc, cfg, key, cs) ? Result.Succeeded : Result.Cancelled;
    }

    /// <summary>Open the review window on one proposed changeset of <paramref name="doc"/> (bound to <paramref name="key"/>).
    /// False when a review window is already open. API thread (a command's Execute).</summary>
    internal static bool Open(ExternalCommandData c, Document doc, BcfConfig cfg, string key, ChangesetDto cs)
    {
        if (_reviewOpen)
        {
            TaskDialog.Show("Sentinel — AI proposals", "A review window is already open — finish or close it first.");
            return false;
        }

        // Per-invocation handler/event (every sibling command does the same): a static pair would
        // let a second open review window clobber the staged request and double-fire callbacks.
        // The closure below keeps both alive for the window's lifetime.
        var handler = new ChangesetPlacementEvent();
        var evt = ExternalEvent.Create(handler);

        var window = new ChangesetReviewWindow(cs);
        DialogOwner.Attach(window, c); // house helper: owned by Revit's main window
        _reviewOpen = true;
        window.Closed += (_, _) => _reviewOpen = false;
        window.DecideRequested += (ticked, unticked, note) =>
        {
            // Re-fetch: only a still-proposed changeset may run (an agent may have withdrawn it).
            var fresh = ChangesetClient.FetchOne(cfg, key, cs.Id, out var oneErr);
            if (fresh == null || fresh.Status != "proposed")
            {
                TaskDialog.Show("Sentinel — AI proposals",
                    fresh == null ? $"Couldn't re-check the changeset:\n{oneErr}" : $"Changeset is now \"{fresh.Status}\" — nothing was created.");
                return;
            }

            // The bridge takes a result from a contributor or above only: ask BEFORE anything runs, or a viewer's Apply would
            // change the model and then be refused, leaving the changeset "proposed" (Report's 401/403 stop is the backstop).
            var role = ChangesetClient.MyRole(cfg, key, out var roleErr);
            if (!Reporters.Contains(role))
            {
                TaskDialog.Show("Sentinel — AI proposals",
                    (role == null ? $"Couldn't check your role on \"{key}\":\n{roleErr}" : $"You are {(role == "" ? "not a member" : role)} on \"{key}\" — applying or declining needs contributor or above.") +
                    "\n\nNothing was changed. Sign in (Standards ▸ Sign in) as a contributor on this project.");
                return;
            }

            if (ticked.Count == 0)
            {
                Report(cfg, key, cs.Id, new List<AppliedEntry>(), unticked, note); // declined — no transaction at all
                return;
            }

            // MA-2b (design §3.4 steps 5 and 10): a Promote changeset is checked against the DD IDS made from the LOD matrix before
            // commit, and its LOD state after is recorded — both from what PromoteContext reads, fetched off this thread.
            var promote = fresh.Source == "promote" ? Task.Run(() => PromoteContext.Fetch(key)).GetAwaiter().GetResult() : null;
            Action<ChangesetExecutor.ExecutionResult> onDone = null;
            onDone = result =>
            {
                handler.Completed -= onDone;
                if (result.NotRun)
                {
                    TaskDialog.Show("Sentinel — AI proposals", result.Error + "\n\nThe proposals are still pending — run Review AI Proposals again.");
                    return;
                }
                if (result.NotFinished != null)
                {
                    // A6: Revit may still finish or drop the transaction — reporting either way could be a lie.
                    TaskDialog.Show("Sentinel — AI proposals", result.NotFinished +
                        "\n\nNothing was reported: the changeset stays proposed. Check the model before reviewing it again — a second Apply could duplicate what Revit finishes.");
                    return;
                }
                if (result.Error != null)
                {
                    // Whole changeset rolled back: report declined with the reason — honestly.
                    Report(cfg, key, cs.Id, new List<AppliedEntry>(),
                        cs.Elements.Select(e => e.ProposalGuid).ToList(),
                        $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"));
                    TaskDialog.Show("Sentinel — AI proposals", $"Transaction failed and was rolled back:\n{result.Error}\n\nReported as declined.");
                    return;
                }
                // MA-1a step 2: an element Revit removed at commit is reported as rejected, with the reason in the note.
                var gone = result.Gone.Select(a => a.ProposalGuid).ToList();
                var rejected = unticked.Concat(gone).Distinct().ToList();
                var said = gone.Count == 0 ? note : $"{gone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
                if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
                if (result.Ids != null) said = result.Ids + (string.IsNullOrEmpty(said) ? "" : " | " + said);     // MA-2b
                // Only a result the bridge holds is watched: an Undo then posts changeset_reverted for these guids.
                if (Report(cfg, key, cs.Id, result.Applied, rejected, said))
                    UndoWatcher.Remember(UndoWatcher.TxName(fresh.Name, fresh.Id), key, fresh.Id, result.Applied.Select(a => a.ProposalGuid));
                // MA-2b, design §3.4 step 10: the LOD state after a Promote changeset, read again on this (the API) thread — one more
                // lod_state row, which the gate and the strips read as the newest.
                string after = null;
                if (promote != null && result.Applied.Count > 0)
                {
                    try
                    {
                        var lod = PromoteWallsCommand.LodStateAfter(doc, promote);
                        if (lod != null)
                        {
                            GovernedNotify.Report("LOD state after", CommandReports.LodState(lod, new[] { fresh.Id }, UserSession.Actor), key);
                            after = "LOD state after (sent to the ledger — the pane's Doctor log says whether it was recorded): " + lod.Line;
                        }
                    }
                    catch (Exception ex) { after = "LOD state after: not read — " + ex.Message; }
                }
                var warnings = GhostFailurePolicy.WarningsLine(result.Warnings, "changeset");
                TaskDialog.Show("Sentinel — AI proposals",
                    $"Applied {result.Applied.Count} element(s) from \"{cs.Name}\"." + (unticked.Count > 0 ? $"\n{unticked.Count} unticked element(s) reported as rejected." : "") +
                    (gone.Count > 0 ? $"\n{gone.Count} element(s) removed by Revit at commit — reported as rejected." : "") +
                    (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : "") +
                    (result.Ids != null ? "\n\n" + result.Ids : "") + (after != null ? "\n\n" + after : "") +
                    (result.Placement != null ? "\n\n" + string.Join("\n", result.Placement) : "")); // MA-1a item 6
            };
            // MA-1a item 6: the project's guideline, for its placement block — only when a ticked element is a create.
            // Fetched off this thread and waited for (4 s at most), as Annotate does. None installed is no block, and the
            // result says so. A guideline that could not be read is not "no block" (review amendment C7): nothing runs,
            // and the changeset stays proposed.
            GuidelinePlacement placement = null;
            if (fresh.Elements.Any(e => ticked.Contains(e.ProposalGuid) && (e.Op is null or "create")))
            {
                var standards = Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false)).GetAwaiter().GetResult();
                if (PlacementPolicy.UnreadRefusal(standards.GuidelineSource.Origin, standards.GuidelineSource.NotInstalled || standards.GuidelineSource.NoProject,
                                                  !string.IsNullOrWhiteSpace(key), standards.GuidelineSource.Reason) is { } unread)
                {
                    TaskDialog.Show("Sentinel — AI proposals", unread + "\n\nThe proposals are still pending — run Review AI Proposals again once the guideline can be read.");
                    return;
                }
                placement = standards.Guideline.Placement;
            }
            handler.Completed += onDone;
            handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);
            evt.Raise();
        };
        window.Show();
        return true;
    }

    /// <summary>True when the bridge recorded the result. Also Ghost Builder's (GhostChangesetBuild), with the same retry
    /// dialog.</summary>
    internal static bool Report(BcfConfig cfg, string key, string id, List<AppliedEntry> applied, List<string> rejected, string note)
    {
        while (true)
        {
            if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, out var err)) return true;
            // Client errors (400 bad payload, 401/403 not signed in or not a contributor, 404, 409 already-resolved)
            // won't heal on retry with an identical payload — show once and stop instead of an unwinnable retry loop.
            if (err != null && new[] { "400", "401", "403", "404", "409" }.Any(code => err.StartsWith("Bridge " + code)))
            {
                TaskDialog.Show("Sentinel — AI proposals",
                    $"The bridge refused the result (retrying cannot fix this):\n{err}" +
                    (err.StartsWith("Bridge 401") || err.StartsWith("Bridge 403") ? "\n\nSign in (Standards ▸ Sign in) as a contributor on this project." : "") +
                    (applied.Count > 0 ? "\n\nElements WERE changed in this model. Check the changeset's status in the bridge before any re-review." : ""));
                return false;
            }
            // When elements WERE created, cancelling leaves the bridge still saying "proposed" —
            // and a later review run would re-execute the same changeset, DUPLICATING the elements.
            // Say so explicitly; an unnamed hazard is a trap.
            var hazard = applied.Count > 0
                ? $"\n\nWARNING: {applied.Count} element(s) were ALREADY CREATED in this model. If you cancel, the bridge still lists this changeset as \"proposed\" — reviewing it again would create duplicates. Retry until the report succeeds, or have the agent withdraw the changeset before any re-review."
                : "";
            var d = new TaskDialog("Sentinel — AI proposals")
            {
                MainInstruction = "The result could not be reported to the bridge.",
                MainContent = $"{err}\n\nThe governed record does NOT yet reflect what happened in Revit.{hazard}\n\nRetry?",
                CommonButtons = TaskDialogCommonButtons.Retry | TaskDialogCommonButtons.Cancel,
            };
            if (d.Show() != TaskDialogResult.Retry) return false;
        }
    }
}
