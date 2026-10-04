#nullable disable
// Governed AI modeling (A2): the ribbon entry. MA-3b (AI-5): a picker of every changeset waiting for review (a Promote storey as one
// entry) opens at once; the chosen entry's review window stays open until its report lands. AI-2: nothing in the review waits for the
// bridge on Revit's thread — the re-check, the role, the standards and every report run on a pool thread, and the window says what
// happened. A result Revit applied is written on this PC (UnreportedResults) before its report is sent, and a changeset with such a
// record is never opened again until the bridge takes it: Review AI Proposals checks the model's stamps and reports it first. The
// bridge's recorded status is the truth — an unreported application is a lie by omission. Re-fetches the changeset right before
// executing: if an agent withdrew it meanwhile, nothing runs (the bridge's CAS makes the report side race-safe too). Open() is the
// review flow itself, shared with Promote walls (MA-0); a changeset whose result landed is remembered for the undo watcher.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
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
    // MA-3b (AI-2): one review at a time — held while the picker or a review window is open, and while a report is in flight, so two
    // windows never apply one changeset and one result is never sent twice at once. Once it is released, a changeset Revit applied and
    // the bridge has not taken is kept closed by its record (UnreportedResults), never by this.
    private static int _holds;
    private static void Hold() => Interlocked.Increment(ref _holds);
    private static void Release() => Interlocked.Decrement(ref _holds);
    private const string Title = "Sentinel — AI proposals";
    private const string Busy = "A review window is open, or a result is still being reported to the bridge — finish or close the window, or wait for its report (two minutes at most), then run Review AI Proposals again.";
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
        if (Volatile.Read(ref _holds) > 0)
        {
            TaskDialog.Show(Title, Busy);
            return Result.Cancelled;
        }

        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show(Title, ProjectContext.NotBound);
            return Result.Cancelled;
        }
        var cfg = BcfConfig.Load();
        var key = ctx.Key;

        // MA-3b (AI-5): the picker opens at once and lists every pending entry; nothing here waits for the bridge. AI-2: first the
        // results this PC applied and the bridge has not taken — this model's are checked against its stamps here (the API thread) and
        // sent again off it; another model's are named, and their changesets stay closed.
        var here = DocOf(doc);
        var waiting = UnreportedResults.ForKey(key);
        // Review C4: a model's path is compared without case — Revit's casing depends on how the file was opened.
        var mine = waiting.Where(r => string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)).ToList();
        var away = waiting.Except(mine).ToList();
        var picker = new ChangesetPickerWindow(key);
        DialogOwner.Attach(picker, c);
        Hold();
        picker.Closed += (_, _) => Release();
        picker.Chosen += entry =>
        {
            picker.Close();
            App.Events.Enqueue(doc, "open the review", (ui, d) => Open(ui, d, cfg, key, entry));
        };
        picker.Show();
        // Review C7: said while this model's waiting results are checked and sent (one round waits up to 120 s for the bridge).
        if (mine.Count > 0) picker.SetEntries(new List<(string Line, string Blocked, List<ChangesetDto> Entry)>(),
            $"Checking this model and sending {mine.Count} result(s) it applied that the bridge has not taken (the bridge has up to two minutes to answer)…");
        Load(picker, cfg, key, Retry(doc, cfg, mine),
             away.Count == 0 ? null : $"{away.Count} result(s) applied in another model wait on this PC for the bridge — close this list, open that model and run Review AI Proposals there: " +
                                      string.Join("; ", away.Select(r => $"\"{r.Name}\" in {r.Doc}")));
        return Result.Succeeded;
    }

    // MA-3b (AI-5): the picker's list, read on a pool thread once the waiting results were sent again; the words of those first.
    private static void Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away) => Task.Run(async () =>
    {
        var none = new List<(string Line, string Blocked, List<ChangesetDto> Entry)>();
        try
        {
            var rep = await retried;
            var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
            var said = new List<string>();
            if (rep.Words.Count > 0) said.Add(rep.Text);
            if (away != null) said.Add(away);
            if (pending == null)
            {
                picker.SetEntries(none, string.Join("\n\n", new[] { $"Couldn't reach the bridge:\n{fetchErr}" }.Concat(said)));
                return;
            }
            var rows = StoreyBatch.Entries(pending).Select(e => (StoreyBatch.Line(e, DateTime.UtcNow), Waiting(key, e), e)).ToList();
            said.Insert(0, rows.Count == 0 ? $"No pending proposals for project \"{key}\"." : $"{rows.Count} waiting for review on \"{key}\", oldest first — pick one and press Review.");
            picker.SetEntries(rows, string.Join("\n\n", said));
        }
        catch (Exception ex) { picker.SetEntries(none, $"The list could not be read — {ex.GetType().Name}: {ex.Message}"); }
    });

    // AI-2: why an entry cannot be opened — a result of one of its changesets waits on this PC; null when none does.
    private static string Waiting(string key, IEnumerable<ChangesetDto> entry)
    {
        var w = entry.Select(c => UnreportedResults.Read(key, c.Id)).Where(r => r != null).ToList();
        return w.Count == 0 ? null : UnreportedResults.Blocked(w);
    }

    // AI-2: the model a result was applied in — the workshared central's path, else the file's, else its title (a model never saved).
    private static string DocOf(Document doc) => Publisher.CentralPath(doc) ?? (string.IsNullOrEmpty(doc.PathName) ? doc.Title : doc.PathName);

    private static UnreportedResults.Record ResultOf(string key, ChangesetDto cs, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, string doc, List<string> undo) =>
        new UnreportedResults.Record
        {
            Key = key, ChangesetId = cs.Id, Name = cs.Name, Doc = doc, Applied = applied, Rejected = rejected, Note = note, ReviewRev = reviewRev,
            Undo = undo ?? new List<string>(), At = ProvenanceStamp.Now(),
        };

    /// <summary>MA-3b (AI-2): what a round of reports did — one paragraph per result, the ones the bridge took (with its reply) and the ones
    /// left for Retry report.</summary>
    internal sealed class Reported
    {
        public readonly List<string> Words = new List<string>();
        public readonly List<UnreportedResults.Record> Left = new List<UnreportedResults.Record>();
        public readonly List<(UnreportedResults.Record R, string Reply)> Landed = new List<(UnreportedResults.Record R, string Reply)>();
        public string Text => string.Join("\n\n", Words);
    }

    /// <summary>MA-3b (AI-2): send results again that this PC holds for <paramref name="doc"/>. Each one is checked against the model's
    /// stamps first, here on the API thread (UnreportedResults.Verified: only what the model still holds is reported as applied); then
    /// they are sent off this thread.</summary>
    internal static Task<Reported> Retry(Document doc, BcfConfig cfg, List<UnreportedResults.Record> records)
    {
        var rep = new Reported();
        var send = new List<UnreportedResults.Record>();
        foreach (var r in records)
        {
            var found = r.Applied.Count(a => !string.IsNullOrEmpty(a.RevitUniqueId) && doc.GetElement(a.RevitUniqueId) is { } e
                                             && ProvenanceStamp.Holds(ProvenanceStamp.Read(e), r.ChangesetId, a.ProposalGuid));
            var (report, drop, words) = UnreportedResults.Verified(r, found);
            if (drop) UnreportedResults.Delete(r.Key, r.ChangesetId);
            if (report) send.Add(r);
            else
            {
                rep.Words.Add(words);
                if (!drop) rep.Left.Add(r);
            }
        }
        return ReportAll(cfg, send, rep);
    }

    /// <summary>MA-3b (AI-2): send each result on a pool thread — never waited for on Revit's. One the bridge takes loses its record and
    /// is remembered for the undo watcher; one it refuses for good (400, 404, 409) loses its record, said; any other failure keeps it.
    /// Review C1: a 409 on a result the bridge already holds (its reply was lost) is taken, not refused. Review C6: after the first
    /// failure that keeps its record, the rest of the round are not sent (kept, said) — one 120 s wait, never one per changeset.</summary>
    internal static Task<Reported> ReportAll(BcfConfig cfg, List<UnreportedResults.Record> records, Reported rep = null)
    {
        rep ??= new Reported();
        if (records.Count == 0) return Task.FromResult(rep);
        Hold();
        // Review C8: still on the caller's thread (Revit's, right after the placement or the stamp check) — an Undo from here on is noted.
        foreach (var r in records.Where(x => x.Applied.Count > 0)) UndoWatcher.Expect(r.Undo, r.ChangesetId);
        return Task.Run(() =>
        {
            try
            {
                var stalled = false;
                foreach (var r in records)
                {
                    if (stalled) { rep.Left.Add(r); rep.Words.Add($"\"{r.Name}\": {UnreportedResults.NotSent(r.Applied.Count)}"); continue; }
                    var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err);
                    // Review C1: the bridge writes the doc before its audit row, and a reply can be lost — a 409 whose stored result applied
                    // exactly these ghosts is this result, landed earlier (re-read here, on this pool thread; FetchOne is an existing request).
                    var taken = !landed && r.Applied.Count > 0 && err != null && err.StartsWith("Bridge 409", StringComparison.Ordinal)
                        ? UnreportedResults.AlreadyTaken(r, ChangesetClient.FetchOne(cfg, r.Key, r.ChangesetId, out _)) : null;
                    if (landed || taken != null)
                    {
                        UnreportedResults.Delete(r.Key, r.ChangesetId);
                        rep.Landed.Add((r, reply));
                        // MA-3a (Q2): a ghost declined on the web after Apply re-checked it was applied over the decline — recorded by the bridge; said.
                        rep.Words.Add(taken ?? $"\"{r.Name}\": reported ({ChangesetTrust.LedgerOf(reply)})." + (ChangesetTrust.LateDeclines(reply) is { } late ? "\n" + late : ""));
                        // Only a result the bridge holds is watched: an Undo then posts changeset_reverted for these guids — remembered under
                        // the Undo entry's name (the group's) and the changeset's own, whichever Revit reports (GhostChangesetBuild's rule).
                        // Review C8: an Undo that came while this report was in flight is posted here, once.
                        if (UndoWatcher.Land(r.Undo, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid)))
                        {
                            ChangesetClient.ReportReverted(cfg, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid).ToList(), "undo", out var undoErr);
                            rep.Words.Add(UnreportedResults.UndoneInFlight(r, undoErr));
                        }
                        continue;
                    }
                    var (drop, words) = UnreportedResults.Outcome(err, r.Applied.Count);
                    if (drop) UnreportedResults.Delete(r.Key, r.ChangesetId);
                    else { rep.Left.Add(r); stalled = true; }
                    rep.Words.Add($"\"{r.Name}\": {words}");
                }
                return rep;
            }
            finally { Release(); }
        });
    }

    /// <summary>Promote's entry (MA-0): the review window on <paramref name="batch"/>.</summary>
    internal static bool Open(ExternalCommandData c, Document doc, BcfConfig cfg, string key, IReadOnlyList<ChangesetDto> batch) => Open(c.Application, doc, cfg, key, batch);

    /// <summary>Open the review window on proposed changesets of <paramref name="doc"/> (bound to <paramref name="key"/>): one, or (MA-2d)
    /// the changesets of one Promote storey (StoreyBatch.Of) — shown as one, applied as one Undo, each reported on its own ledger row.
    /// False when a review is open, a report is in flight, or (MA-3b) a result of the batch waits on this PC. API thread (a command's
    /// Execute, or the event hub's job for the picker's choice).</summary>
    internal static bool Open(UIApplication ui, Document doc, BcfConfig cfg, string key, IReadOnlyList<ChangesetDto> batch)
    {
        var cs = StoreyBatch.Merge(batch);
        if (Volatile.Read(ref _holds) > 0)
        {
            TaskDialog.Show(Title, Busy);
            return false;
        }
        // MA-3b (AI-2): a changeset this PC applied and the bridge has not taken is never opened again — a second Apply would duplicate it.
        var waiting = batch.Select(b => UnreportedResults.Read(key, b.Id)).Where(r => r != null).ToList();
        if (waiting.Count > 0) { TaskDialog.Show(Title, UnreportedResults.Blocked(waiting)); return false; }
        // Review C7: a Promote part reviewed alone — a part of its storey waits twice (two Promote runs) or is missing — is said.
        if (batch.Count == 1 && cs.Source == "promote" && StoreyBatch.StoreyOf(cs.Name) != cs.Name)
            TaskDialog.Show(Title, $"\"{cs.Name}\" is reviewed alone: another part of its storey is missing (not filed, or reviewed already) or waits twice (two Promote runs) — applying it is its own Undo entry, not the storey's.");

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
        DialogOwner.Attach(window, ui); // house helper: owned by Revit's main window
        Hold();
        window.Closed += (_, _) => Release();
        var here = DocOf(doc);
        var left = new List<UnreportedResults.Record>(); // what Retry report sends again

        // Review C2: the person may close the window at any time — words for a closed window go to the pane's Doctor log and, when they
        // are a result (not an "…ing" line), to a dialog on Revit's thread: said, never lost.
        void Tell(string words, bool interim = false)
        {
            if (!window.Gone) { window.Say(words); return; }
            App.PanelVm?.LogDoctor("Review AI Proposals: " + words);
            if (!interim) App.Events.Enqueue(doc, "say the review's result", (_, _) => TaskDialog.Show(Title, words), _ => { });
        }

        // AI-2: a round of reports runs off Revit's thread; the window says what landed and offers Retry report for what did not.
        void Send(Task<Reported> sending, Func<Reported, string> words) => sending.ContinueWith(t =>
        {
            if (t.Status != TaskStatus.RanToCompletion)
            {
                Tell("Reporting failed — " + (t.Exception?.GetBaseException().Message ?? "it did not finish") +
                     $"\nA result Revit applied is kept on this PC ({UnreportedResults.Root}) and sent again by the next Review AI Proposals.");
                return;
            }
            left = t.Result.Left;
            Tell(words(t.Result) + (t.Result.Words.Count > 0 ? "\n\n" + t.Result.Text : ""));
            window.Retry(left.Count > 0);
        }, TaskScheduler.Default);

        async Task Decide(List<string> ticked, List<string> unticked, string note)
        {
            try
            {
                // Re-fetch: only still-proposed changesets may run (an agent may have withdrawn one) — MA-2d: the whole storey, or nothing.
                // MA-3b: on a pool thread; a refusal keeps the window, its ticks and its note.
                var fresh = new List<ChangesetDto>();
                foreach (var one in batch)
                {
                    var f = ChangesetClient.FetchOne(cfg, key, one.Id, out var oneErr);
                    if (f == null || f.Status != "proposed")
                    {
                        window.Refused(f == null ? $"Couldn't re-check the changeset:\n{oneErr}" : $"Changeset{(batch.Count > 1 ? $" \"{f.Name}\"" : "")} is now \"{f.Status}\" — nothing was created.");
                        return;
                    }
                    fresh.Add(f);
                }

                // MA-3a (design §6.6, D17): a web decline binds. The window shows one unticked and refuses its tick; one that landed after the
                // window opened is caught here, on the fresh copies — the whole Apply is refused and nothing is created.
                if (ChangesetTrust.DeclinedTicked(fresh, ticked) is { } declinedTicked)
                {
                    // Review C3: unticked and locked here, so the next press applies the rest.
                    window.Lock(fresh.SelectMany(f => f.Elements ?? new List<ChangesetElementDto>()).Where(e => ticked.Contains(e.ProposalGuid) && ChangesetTrust.DeclinedOnWeb(e)).Select(e => e.ProposalGuid).ToList());
                    window.Refused(declinedTicked);
                    return;
                }

                // The bridge takes a result from a contributor or above only: ask BEFORE anything runs, or a viewer's Apply would
                // change the model and then be refused, leaving the changeset "proposed" (the report's 401/403 is the backstop).
                var role = ChangesetClient.MyRole(cfg, key, out var roleErr);
                if (!Reporters.Contains(role))
                {
                    window.Refused((role == null ? $"Couldn't check your role on \"{key}\":\n{roleErr}" : $"You are {(role == "" ? "not a member" : role)} on \"{key}\" — applying or declining needs contributor or above.") +
                                   "\n\nNothing was changed. Sign in (Standards ▸ Sign in) as a contributor on this project.");
                    return;
                }

                if (ticked.Count == 0)
                {
                    // AI-5: Decline all needs a reason — the note, recorded on each changeset's result (result.note) and its changeset_applied row.
                    if (string.IsNullOrWhiteSpace(note))
                    {
                        window.Refused(ChangesetTrust.DeclineNeedsReason);
                        return;
                    }
                    // Review C2: × pressed while the re-check ran is a cancel — nothing is declined.
                    if (window.Gone) { App.PanelVm?.LogDoctor("Review AI Proposals: the window was closed before Decline all ran — nothing was declined."); return; }
                    window.Applying("Declining — reporting to the bridge…");
                    // declined — no transaction at all; each changeset of the storey on its own ledger row
                    Send(ReportAll(cfg, fresh.Select(f => ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null)).ToList()), rep =>
                    {
                        // Review C6: said, never silent — counted from the declines the bridge took; nothing in the model changed.
                        int declined = rep.Landed.Count;
                        return $"Declined {declined} of {fresh.Count} changeset(s) — nothing in the model changed." +
                               (fresh[0].Source == "promote" ? CarriedEdits(fresh) + "\n\n" + RunPromoteAgain : "");
                    });
                    return;
                }

                // MA-2b (design §3.4 steps 5 and 10): a Promote changeset is checked against the DD IDS made from the LOD matrix before
                // commit, and its LOD state after is recorded — both from what PromoteContext reads, off Revit's thread.
                var promote = fresh[0].Source == "promote" ? await Task.Run(() => PromoteContext.Fetch(key)) : null;
                // MA-1a item 6: the project's guideline, for its placement block — only when a ticked element is a create. None
                // installed is no block, and the result says so. A guideline that could not be read is not "no block" (review
                // amendment C7): nothing runs, and the changeset stays proposed.
                GuidelinePlacement placement = null;
                if (fresh.SelectMany(f => f.Elements).Any(e => ticked.Contains(e.ProposalGuid) && (e.Op is null or "create")))
                {
                    var standards = await Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false));
                    if (PlacementPolicy.UnreadRefusal(standards.GuidelineSource.Origin, standards.GuidelineSource.NotInstalled || standards.GuidelineSource.NoProject,
                                                      !string.IsNullOrWhiteSpace(key), standards.GuidelineSource.Reason) is { } unread)
                    {
                        window.Refused(unread + "\n\nThe proposals are still pending — press Apply again once the guideline can be read.");
                        return;
                    }
                    placement = standards.Guideline.Placement;
                }

                Action<ChangesetExecutor.ExecutionResult> onDone = null;
                onDone = result =>
                {
                    // Revit's API thread, inside the placement event: API reads and the record only — every report goes to a pool thread.
                    handler.Completed -= onDone;
                    if (result.NotRun)
                    {
                        // Review C3: nothing was placed (a "Go back", a DocPin refusal, a missing workset) — Apply comes back in this window.
                        if (window.Gone) Tell(result.Error + "\n\nNothing was placed; the proposals are still pending.");
                        else window.Reopen(result.Error + "\n\nNothing was placed; the proposals are still pending — change the ticks or press Apply again.");
                        return;
                    }
                    if (result.NotFinished != null)
                    {
                        // A6: Revit may still finish or drop the transaction — reporting either way could be a lie.
                        Tell(result.NotFinished +
                            $"\n\nNothing was reported: the {(fresh.Count > 1 ? $"storey's {fresh.Count} changesets stay" : "changeset stays")} proposed. Check the model before reviewing it again — a second Apply could duplicate what Revit finishes.");
                        return;
                    }
                    if (result.Error != null)
                    {
                        // Whole changeset — MA-2d: the whole storey — rolled back: each changeset reported declined with the reason, honestly.
                        Tell($"Transaction failed and was rolled back:\n{result.Error}\n\nReporting the declines to the bridge…", interim: true);
                        Send(ReportAll(cfg, fresh.Select(f => ResultOf(key, f, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),
                                $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"), null, here, null)).ToList()), rep =>
                        {
                            // Review C14: counted from the declines the bridge took (C6's rule), never the number sent.
                            int declined = rep.Landed.Count;
                            return $"Transaction failed and was rolled back:\n{result.Error}\n\nReported as declined: {declined} of {fresh.Count} changeset(s)" +
                                   (declined < fresh.Count ? " — the rest are still proposed; the model holds none of them." : ".") + (fresh[0].Source == "promote" ? CarriedEdits(fresh) + "\n\n" + RunPromoteAgain : "");
                        });
                        return;
                    }
                    // MA-1a step 2: an element Revit removed at commit is reported as rejected, with the reason in the note. MA-2d: each
                    // changeset of the storey is reported on its own ledger row; the storey's BLOCK and IDS lines ride on each note.
                    var gone = result.Gone.Select(a => a.ProposalGuid).ToList();
                    var undo = StoreyBatch.UndoName(fresh);
                    var records = new List<UnreportedResults.Record>();
                    foreach (var (one, res) in result.Each)
                    {
                        var oneGone = res.Gone.Select(a => a.ProposalGuid).ToList();
                        var rejected = StoreyBatch.Own(one, unticked).Concat(oneGone).Distinct().ToList();
                        var said = oneGone.Count == 0 ? note : $"{oneGone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
                        if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
                        if (result.Ids != null) said = result.Ids + (string.IsNullOrEmpty(said) ? "" : " | " + said);     // MA-2b
                        // MA-3a: the revision Apply re-checked. Remembered for the undo watcher under the Undo entry's name and the changeset's own.
                        records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }));
                    }
                    // AI-2: the record first — on this PC before the report is sent, so a result the bridge never hears of is never forgotten
                    // and never applied twice.
                    var unsaved = records.Where(r => r.Applied.Count > 0 && !UnreportedResults.Write(r)).Select(r => $"\"{r.Name}\"").ToList();
                    // MA-2b, design §3.4 step 10: the LOD state after a Promote changeset, read again on this (the API) thread — sent as one
                    // more lod_state row once the bridge holds a changeset of it as applied.
                    LodStateReport lod = null;
                    string after = null;
                    if (promote != null && result.Applied.Count > 0)
                    {
                        try { lod = PromoteWallsCommand.LodStateAfter(doc, promote); }
                        catch (Exception ex) { after = "LOD state after: not read — " + ex.Message; }
                    }
                    var warnings = GhostFailurePolicy.WarningsLine(result.Warnings, fresh.Count > 1 ? "storey" : "changeset");
                    var head = $"Applied {result.Applied.Count} element(s) from \"{cs.Name}\"." +
                        (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : "") +
                        (result.Ids != null ? "\n\n" + result.Ids : "") + (result.Placement != null ? "\n\n" + string.Join("\n", result.Placement) : "") + // MA-1a item 6
                        (unsaved.Count > 0 ? $"\n\n⚠ The result of {string.Join(", ", unsaved)} could not be saved on this PC ({UnreportedResults.Root}): if its report fails too, nothing on this PC remembers it — check the changeset's status on the bridge before reviewing it again." : "");
                    Tell(head + "\n\nReporting to the bridge…", interim: true);
                    Send(ReportAll(cfg, records), rep =>
                    {
                        // Review C15: what the bridge took — the changesets it holds as applied, and the rejected rows it recorded.
                        var held = rep.Landed.Where(x => x.R.Applied.Count > 0).Select(x => x.R.ChangesetId).ToList();
                        int untickedTaken = rep.Landed.Sum(x => StoreyBatch.Own(fresh.First(f => f.Id == x.R.ChangesetId), unticked).Count);
                        int goneTaken = rep.Landed.Sum(x => x.R.Rejected.Count(gone.Contains));
                        if (lod != null && held.Count > 0)
                        {
                            GovernedNotify.Report("LOD state after", CommandReports.LodState(lod, held, UserSession.Actor), key, window.Dispatcher);
                            after = "LOD state after (sent to the ledger — the pane's Doctor log says whether it was recorded): " + lod.Line;
                        }
                        else if (lod != null) after = "LOD state after: not sent — the bridge took no changeset of this Apply as applied (a result reported later sends none).";
                        return head + (unticked.Count > 0 ? $"\n{untickedTaken} of {unticked.Count} unticked element(s) reported as rejected." : "") +
                               (gone.Count > 0 ? $"\n{goneTaken} of {gone.Count} element(s) removed by Revit at commit — reported as rejected." : "") +
                               (after != null ? "\n\n" + after : "");
                    });
                };
                // Review C2: × pressed while the re-check, the role or the standards were read is a cancel — nothing is raised.
                if (window.Gone) { App.PanelVm?.LogDoctor("Review AI Proposals: the window was closed before Apply ran — nothing was placed."); return; }
                window.Applying("Applying in Revit…");
                // ExternalEvent.Raise from the window's thread (Revit's), as every modeless window here raises it.
                _ = window.Dispatcher.BeginInvoke(new Action(() =>
                {
                    try
                    {
                        handler.Completed += onDone;
                        handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);
                        // Review M3: a request Revit did not take places nothing — said, and Apply comes back. (Pending: an earlier raise
                        // still runs, so Apply stays pressed.)
                        var raised = evt.Raise();
                        if (raised == ExternalEventRequest.Denied || raised == ExternalEventRequest.TimedOut)
                        {
                            handler.Completed -= onDone;
                            window.Reopen($"Revit did not take the request ({raised}) — nothing was placed; press Apply again.");
                        }
                    }
                    catch (Exception ex)
                    {
                        handler.Completed -= onDone;
                        window.Reopen($"Apply could not be started — {ex.GetType().Name}: {ex.Message}\n\nNothing was placed; press Apply again.");
                    }
                }));
            }
            catch (Exception ex) { window.Refused($"Review AI Proposals failed — {ex.GetType().Name}: {ex.Message}\n\nNothing was created."); }
        }

        window.DecideRequested += (ticked, unticked, note) => Task.Run(() => Decide(ticked, unticked, note));
        window.RetryRequested += () =>
        {
            var again = left;
            window.Say("Checking the model, then reporting again…");
            App.Events.Enqueue(doc, "check the model before reporting", (_, d) => Send(Retry(d, cfg, again), rep => $"Sent again: {rep.Landed.Count} of {again.Count} result(s) reported."),
                refusal => { window.Say(refusal); window.Retry(true); });
        };
        window.Show();
        return true;
    }

    /// <summary>True when the bridge recorded the result. Ghost Builder's (GhostChangesetBuild), with its retry dialog — the review window
    /// reports through ReportAll (MA-3b). MA-3a: <paramref name="reviewRev"/> is the changeset's review_rev Apply re-checked (Ghost Builder's applying build sends the review_rev its filing reply carried; a call that applies nothing sends none).</summary>
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
