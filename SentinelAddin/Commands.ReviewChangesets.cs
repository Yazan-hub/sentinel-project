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
    // MA-2d (drill MA2c D2): after a Promote storey is declined, Promote reopens a Promote storey still waiting for review before it
    // plans again — said, so "re-run Promote" in the error does not surprise.
    internal const string RunPromoteAgain = "Run Promote (DD) again to plan this storey anew: it first opens any other Promote storey still waiting for review, and plans again once none is waiting.";
    // Review C2: MA-2c F11 puts a type edit on the first storey whose retypes land on its type, so a later storey of the same run
    // may retype onto it; when a storey carrying type edits is declined, those storeys fail the DD IDS until Promote plans again — said.
    internal static string CarriedEdits(IEnumerable<ChangesetDto> fresh)
    {
        var edits = fresh.SelectMany(f => f.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op == "set_parameter").ToList();
        return edits.Count == 0 ? "" :
            $"\n\nThis storey carried {edits.Count} type edit(s) ({string.Join(", ", edits.Select(e => e.Place?.TypeName ?? "?").Distinct())}). " +
            "Other storeys of the same run that retype onto those types will fail the DD IDS check for that property until Promote plans again — decline them (untick all ▸ Apply), then run Promote (DD).";
    }

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

        // FIFO; MA-2d: a Promote storey's changesets are reviewed together (StoreyBatch). The dialog says how many wait behind it.
        var batch = StoreyBatch.Of(pending, pending[0]);
        if (pending.Count > batch.Count)
            TaskDialog.Show("Sentinel — AI proposals", $"{pending.Count} proposals pending — reviewing the oldest first ({StoreyBatch.Merge(batch).Name}). Run again for the next.");
        return Open(c, doc, cfg, key, batch) ? Result.Succeeded : Result.Cancelled;
    }

    /// <summary>Open the review window on proposed changesets of <paramref name="doc"/> (bound to <paramref name="key"/>): one, or (MA-2d)
    /// the changesets of one Promote storey (StoreyBatch.Of) — shown as one, applied as one Undo, each reported on its own ledger row.
    /// False when a review window is already open. API thread (a command's Execute).</summary>
    internal static bool Open(ExternalCommandData c, Document doc, BcfConfig cfg, string key, IReadOnlyList<ChangesetDto> batch)
    {
        var cs = StoreyBatch.Merge(batch);
        if (_reviewOpen)
        {
            TaskDialog.Show("Sentinel — AI proposals", "A review window is already open — finish or close it first.");
            return false;
        }
        // Review C7: a Promote part reviewed alone — a part of its storey waits twice (two Promote runs) or is missing — is said.
        if (batch.Count == 1 && cs.Source == "promote" && StoreyBatch.StoreyOf(cs.Name) != cs.Name)
            TaskDialog.Show("Sentinel — AI proposals", $"\"{cs.Name}\" is reviewed alone: another part of its storey is missing (not filed, or reviewed already) or waits twice (two Promote runs) — applying it is its own Undo entry, not the storey's.");

        // Per-invocation handler/event (every sibling command does the same): a static pair would
        // let a second open review window clobber the staged request and double-fire callbacks.
        // The closure below keeps both alive for the window's lifetime.
        var handler = new ChangesetPlacementEvent();
        var evt = ExternalEvent.Create(handler);

        // Review amendment C3 (MA-2c): a type edit's reach is the add-in's own count, read here on the API thread — the elements on the
        // type in the model now — never the poster's words in its reason.
        var reach = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var sp in (cs.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op == "set_parameter" && e.ProposalGuid != null))
            if (!string.IsNullOrWhiteSpace(sp.Target?.UniqueId) && doc.GetElement(sp.Target.UniqueId) is ElementType spType)
                reach[sp.ProposalGuid] = new FilteredElementCollector(doc).WhereElementIsNotElementType().Count(x => x.GetTypeId() == spType.Id);
        var window = new ChangesetReviewWindow(cs, reach);
        DialogOwner.Attach(window, c); // house helper: owned by Revit's main window
        _reviewOpen = true;
        window.Closed += (_, _) => _reviewOpen = false;
        window.DecideRequested += (ticked, unticked, note) =>
        {
            // Re-fetch: only still-proposed changesets may run (an agent may have withdrawn one) — MA-2d: the whole storey, or nothing.
            var fresh = new List<ChangesetDto>();
            foreach (var one in batch)
            {
                var f = ChangesetClient.FetchOne(cfg, key, one.Id, out var oneErr);
                if (f == null || f.Status != "proposed")
                {
                    TaskDialog.Show("Sentinel — AI proposals",
                        f == null ? $"Couldn't re-check the changeset:\n{oneErr}" : $"Changeset{(batch.Count > 1 ? $" \"{f.Name}\"" : "")} is now \"{f.Status}\" — nothing was created.");
                    return;
                }
                fresh.Add(f);
            }

            // MA-3a (design §6.6, D17): a web decline binds. The window shows one unticked and refuses its tick; one that landed after the
            // window opened is caught here, on the fresh copies — the whole Apply is refused and nothing is created.
            if (ChangesetTrust.DeclinedTicked(fresh, ticked) is { } declinedTicked)
            {
                TaskDialog.Show("Sentinel — AI proposals", declinedTicked);
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
                int declined = 0;
                foreach (var f in fresh) if (Report(cfg, key, f.Id, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note)) declined++; // declined — no transaction at all
                // Review C6: said, never silent — counted from the declines the bridge took; nothing in the model changed.
                TaskDialog.Show("Sentinel — AI proposals", $"Declined {declined} of {fresh.Count} changeset(s) — nothing in the model changed." +
                    (fresh[0].Source == "promote" ? CarriedEdits(fresh) + "\n\n" + RunPromoteAgain : ""));
                return;
            }

            // MA-2b (design §3.4 steps 5 and 10): a Promote changeset is checked against the DD IDS made from the LOD matrix before
            // commit, and its LOD state after is recorded — both from what PromoteContext reads, fetched off this thread.
            var promote = fresh[0].Source == "promote" ? Task.Run(() => PromoteContext.Fetch(key)).GetAwaiter().GetResult() : null;
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
                        $"\n\nNothing was reported: the {(fresh.Count > 1 ? $"storey's {fresh.Count} changesets stay" : "changeset stays")} proposed. Check the model before reviewing it again — a second Apply could duplicate what Revit finishes.");
                    return;
                }
                if (result.Error != null)
                {
                    // Whole changeset — MA-2d: the whole storey — rolled back: each changeset reported declined with the reason, honestly.
                    // Review C14: counted from the declines the bridge took (C6's rule), never the number sent.
                    int declined = 0;
                    foreach (var f in fresh)
                        if (Report(cfg, key, f.Id, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),
                                $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"))) declined++;
                    TaskDialog.Show("Sentinel — AI proposals", $"Transaction failed and was rolled back:\n{result.Error}\n\nReported as declined: {declined} of {fresh.Count} changeset(s)" +
                        (declined < fresh.Count ? " — the rest are still proposed; the model holds none of them." : ".") + (fresh[0].Source == "promote" ? CarriedEdits(fresh) + "\n\n" + RunPromoteAgain : ""));
                    return;
                }
                // MA-1a step 2: an element Revit removed at commit is reported as rejected, with the reason in the note. MA-2d: each
                // changeset of the storey is reported on its own ledger row; the storey's BLOCK and IDS lines ride on each note.
                var gone = result.Gone.Select(a => a.ProposalGuid).ToList();
                var undo = StoreyBatch.UndoName(fresh);
                // Review C15: what the bridge took — the changesets it holds as applied, and the rejected rows it recorded.
                var held = new List<string>();
                int untickedTaken = 0, goneTaken = 0;
                foreach (var (one, res) in result.Each)
                {
                    var oneGone = res.Gone.Select(a => a.ProposalGuid).ToList();
                    var rejected = StoreyBatch.Own(one, unticked).Concat(oneGone).Distinct().ToList();
                    var said = oneGone.Count == 0 ? note : $"{oneGone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
                    if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
                    if (result.Ids != null) said = result.Ids + (string.IsNullOrEmpty(said) ? "" : " | " + said);     // MA-2b
                    // Only a result the bridge holds is watched: an Undo then posts changeset_reverted for these guids — remembered under
                    // the Undo entry's name (the group's) and the changeset's own, whichever Revit reports (GhostChangesetBuild's rule).
                    if (!Report(cfg, key, one.Id, res.Applied, rejected, said, one.ReviewRev)) continue; // MA-3a: the revision Apply re-checked
                    if (res.Applied.Count > 0) held.Add(one.Id);
                    untickedTaken += StoreyBatch.Own(one, unticked).Count;
                    goneTaken += oneGone.Count;
                    var guids = res.Applied.Select(a => a.ProposalGuid).ToList();
                    UndoWatcher.Remember(undo, key, one.Id, guids);
                    UndoWatcher.Remember(UndoWatcher.TxName(one.Name, one.Id), key, one.Id, guids);
                }
                // MA-2b, design §3.4 step 10: the LOD state after a Promote changeset, read again on this (the API) thread — one more
                // lod_state row, which the gate and the strips read as the newest.
                string after = null;
                if (promote != null && held.Count > 0)
                {
                    try
                    {
                        var lod = PromoteWallsCommand.LodStateAfter(doc, promote);
                        if (lod != null)
                        {
                            GovernedNotify.Report("LOD state after", CommandReports.LodState(lod, held, UserSession.Actor), key);
                            after = "LOD state after (sent to the ledger — the pane's Doctor log says whether it was recorded): " + lod.Line;
                        }
                    }
                    catch (Exception ex) { after = "LOD state after: not read — " + ex.Message; }
                }
                var warnings = GhostFailurePolicy.WarningsLine(result.Warnings, fresh.Count > 1 ? "storey" : "changeset");
                TaskDialog.Show("Sentinel — AI proposals",
                    $"Applied {result.Applied.Count} element(s) from \"{cs.Name}\"." + (unticked.Count > 0 ? $"\n{untickedTaken} of {unticked.Count} unticked element(s) reported as rejected." : "") +
                    (gone.Count > 0 ? $"\n{goneTaken} of {gone.Count} element(s) removed by Revit at commit — reported as rejected." : "") +
                    (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : "") +
                    (result.Ids != null ? "\n\n" + result.Ids : "") + (after != null ? "\n\n" + after : "") +
                    (result.Placement != null ? "\n\n" + string.Join("\n", result.Placement) : "")); // MA-1a item 6
            };
            // MA-1a item 6: the project's guideline, for its placement block — only when a ticked element is a create.
            // Fetched off this thread and waited for (4 s at most), as Annotate does. None installed is no block, and the
            // result says so. A guideline that could not be read is not "no block" (review amendment C7): nothing runs,
            // and the changeset stays proposed.
            GuidelinePlacement placement = null;
            if (fresh.SelectMany(f => f.Elements).Any(e => ticked.Contains(e.ProposalGuid) && (e.Op is null or "create")))
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
    /// dialog. MA-3a: <paramref name="reviewRev"/> is the changeset's review_rev Apply re-checked (Ghost Builder's own build sends none).</summary>
    internal static bool Report(BcfConfig cfg, string key, string id, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev = null)
    {
        while (true)
        {
            if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, reviewRev, out var reply, out var err))
            {
                // MA-3a (Q2): a ghost declined on the web after Apply re-checked it was applied over the decline — recorded by the bridge; said.
                if (ChangesetTrust.LateDeclines(reply) is { } late) TaskDialog.Show("Sentinel — AI proposals", late);
                return true;
            }
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
