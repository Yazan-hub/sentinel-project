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
    // MA-3b5 (F1): Promote (DD) holds it too, while it reads and files — so a picker never lists a storey whose parts are still being filed.
    private static int _holds;
    internal static bool Held => Volatile.Read(ref _holds) > 0;
    internal static void Hold() => Interlocked.Increment(ref _holds);
    internal static void Release() => Interlocked.Decrement(ref _holds);
    private const string Title = "Sentinel — AI proposals";
    internal const string Busy = "A review window is open, a result is still being reported to the bridge, or Promote (DD) is reading or filing, or Ghost Builder is filing or withdrawing a build — finish or close the window, or wait until the pane's Doctor log says the report or Promote's filing is done (a Promote that files nothing is done when its dialog closes), or until the Ghost build's dialog shows (and, after one that was not placed, the Doctor log says its withdrawals), then run the command again.";
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
            "Other storeys of the same run that retype onto those types will fail the DD IDS check for that property until Promote plans again — decline them (untick all, write the reason in the note, press Decline all), then run Promote (DD).";
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
             away.Count == 0 ? null : $"{away.Count} result(s) applied in another model wait on this PC for the bridge — close this list, open that model and run Review AI Proposals there:\n" +
                                      string.Join("\n", away.Select(r => $"\"{r.Name}\" in {r.Doc}. {UnreportedResults.DeleteOnce(r)}")));
        return Result.Succeeded;
    }

    // MA-3b (AI-5): the picker's list, read on a pool thread once the waiting results were sent again; the words of those first.
    private static void Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away) => Task.Run(async () =>
    {
        var none = new List<(string Line, string Blocked, List<ChangesetDto> Entry)>();
        // MA-3b4 review C12: the round's words, windowless on every path (review C4's reason: the picker has no Retry report button),
        // declared here so a throw below still says them.
        string text = null;
        Action lost = null;
        try
        {
            var rep = await retried;
            if (rep.Words.Count > 0)
            {
                text = UnreportedResults.Windowless("", rep.Text);
                // MA-3b4 (MA-3b2b's gap): the picker may close while the list is read — the round's words then go to a dialog too, not the Doctor log alone.
                lost = () => App.Events.Enqueue(_ => TaskDialog.Show(Title, text));
            }
            // Review C11: the picker may be closed while the round ran (up to 120 s) — its words (a record removed, a result reported) go to
            // the Doctor log and a dialog, as a closed window's do (C2); nothing is listed.
            if (picker.Gone)
            {
                if (text != null)
                {
                    lost(); // MA-3b2b: no DocPin, and queued before the Doctor line — see Tell
                    try { App.PanelVm?.LogDoctor("Review AI Proposals: " + text); } catch { }
                }
                return;
            }
            var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
            var said = new List<string>();
            if (text != null) said.Add(text);
            if (away != null) said.Add(away);
            if (pending == null)
            {
                picker.SetEntries(none, string.Join("\n\n", new[] { $"Couldn't reach the bridge:\n{fetchErr}" }.Concat(said)), lost);
                return;
            }
            var rows = StoreyBatch.Entries(pending).Select(e => (StoreyBatch.Line(e, DateTime.UtcNow), Waiting(key, e), e)).ToList();
            said.Insert(0, rows.Count == 0 ? $"No pending proposals for project \"{key}\"." : $"{rows.Count} waiting for review on \"{key}\", oldest first — pick one and press Review.");
            picker.SetEntries(rows, string.Join("\n\n", said), lost);
        }
        catch (Exception ex) { picker.SetEntries(none, string.Join("\n\n", new[] { $"The list could not be read — {ex.GetType().Name}: {ex.Message}", text }.Where(s => s != null)), lost); }
    });

    // AI-2: why an entry cannot be opened — a result of one of its changesets waits on this PC; null when none does.
    private static string Waiting(string key, IEnumerable<ChangesetDto> entry)
    {
        var w = entry.Select(c => UnreportedResults.Read(key, c.Id)).Where(r => r != null).ToList();
        return w.Count == 0 ? null : UnreportedResults.Blocked(w);
    }

    // AI-2: the model a result was applied in — the workshared central's path, else the file's, else its title (a model never saved).
    // MA-3b4: Ghost Builder's records too (E4).
    internal static string DocOf(Document doc) => Publisher.CentralPath(doc) ?? (string.IsNullOrEmpty(doc.PathName) ? doc.Title : doc.PathName);

    // MA-3b2: reasons — the reviewer's reason per rejected ghost of this changeset (StoreyBatch.Own); null when none was typed.
    internal static UnreportedResults.Record ResultOf(string key, ChangesetDto cs, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, string doc, List<string> undo,
                                                     Dictionary<string, string> reasons) =>
        new UnreportedResults.Record
        {
            Key = key, ChangesetId = cs.Id, Name = cs.Name, Doc = doc, Applied = applied, Rejected = rejected, Note = note, ReviewRev = reviewRev,
            Undo = undo ?? new List<string>(), At = ProvenanceStamp.Now(), Reasons = reasons,
        };

    /// <summary>MA-3b (AI-2): what a round of reports did — one paragraph per result, the ones the bridge took (with its reply) and the ones
    /// left for Retry report.</summary>
    internal sealed class Reported
    {
        public readonly List<string> Words = new List<string>();
        public readonly List<UnreportedResults.Record> Left = new List<UnreportedResults.Record>();
        public readonly List<(UnreportedResults.Record R, string Reply)> Landed = new List<(UnreportedResults.Record R, string Reply)>();
        /// <summary>MA-3b4 (G1): a person must act — only some of a result's elements carry its stamp, or the bridge refused for good a
        /// result whose elements are in the model, or a result landed over a web decline (ChangesetTrust.LateDeclines — review C2). A round
        /// no window shows (Said) then raises a dialog.</summary>
        public bool Act;
        public string Text => string.Join("\n\n", Words);
    }

    /// <summary>MA-3b (AI-2): send results again that this PC holds for <paramref name="doc"/>. Each one is checked against the model's
    /// stamps first, here on the API thread (UnreportedResults.Verified: only what the model still holds is reported as applied); then
    /// they are sent off this thread.</summary>
    internal static Task<Reported> Retry(Document doc, BcfConfig cfg, List<UnreportedResults.Record> records)
    {
        var rep = new Reported();
        var send = new List<UnreportedResults.Record>();
        var gone = new List<UnreportedResults.Record>();
        foreach (var r in records)
        {
            var found = r.Applied.Count(a => !string.IsNullOrEmpty(a.RevitUniqueId) && doc.GetElement(a.RevitUniqueId) is { } e
                                             && ProvenanceStamp.Holds(ProvenanceStamp.Read(e), r.ChangesetId, a.ProposalGuid));
            var (report, ask, words) = UnreportedResults.Verified(r, found);
            if (report) send.Add(r);
            // MA-3b2 review C16: none here, and this is not the file it was applied in (another local of the central, or a never-saved
            // model matched by its title) — kept and said; the bridge's "proposed" is no evidence about that file.
            else if (ask && UnreportedResults.Elsewhere(r, doc.PathName) is { } elsewhere) { rep.Words.Add(elsewhere); rep.Left.Add(r); }
            else if (ask) gone.Add(r); // review C9: none in the model — the bridge is asked what it holds before the record goes
            else
            {
                rep.Words.Add(words);
                rep.Left.Add(r);
                rep.Act = true; // MA-3b4 (G1): some of its elements carry the stamp — a person checks the model
            }
        }
        return ReportAll(cfg, send, rep, gone);
    }

    /// <summary>MA-3b (AI-2): send each result on a pool thread — never waited for on Revit's. One the bridge takes loses its record and
    /// is remembered for the undo watcher; one it refuses for good (400, 404, 409) loses its record, said; any other failure keeps it.
    /// Review C1: a 409 on a result the bridge already holds (its reply was lost) is taken, not refused. Review C6: after the first
    /// failure that keeps its record, the rest of the round are not sent (kept, said) — one 120 s wait, never one per changeset.</summary>
    // MA-3b4 review C3: `after` runs on the pool thread once every result is sent, before the guard is released (Ghost Builder's
    // withdrawals — no review opens a changeset still being withdrawn); its words, when it has any, close the round's.
    internal static Task<Reported> ReportAll(BcfConfig cfg, List<UnreportedResults.Record> records, Reported rep = null, List<UnreportedResults.Record> gone = null, Func<Reported, string> after = null)
    {
        rep ??= new Reported();
        gone ??= new List<UnreportedResults.Record>();
        if (records.Count == 0 && gone.Count == 0) return Task.FromResult(rep);
        Hold();
        // Review C8: still on the caller's thread (Revit's, right after the placement or the stamp check) — an Undo from here on is noted.
        foreach (var r in records.Where(x => x.Applied.Count > 0)) UndoWatcher.Expect(r.Undo, r.ChangesetId);
        return Task.Run(() =>
        {
            try
            {
                // Review C9: a result gone from the model — the bridge says whether it holds it (proposed: the record goes; this result:
                // the changeset_reverted row its Undo never posted, the record going only once it is posted; unread: kept).
                foreach (var r in gone)
                {
                    var (drop, revert, words) = UnreportedResults.Gone(r, ChangesetClient.FetchOne(cfg, r.Key, r.ChangesetId, out var fetchErr), fetchErr);
                    if (revert)
                    {
                        drop = ChangesetClient.ReportReverted(cfg, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid).ToList(), "undo", out var revertErr);
                        words += UnreportedResults.RevertPosted(revertErr);
                    }
                    if (drop) UnreportedResults.Delete(r.Key, r.ChangesetId);
                    else rep.Left.Add(r);
                    rep.Words.Add(words);
                }
                var stalled = false;
                foreach (var r in records)
                {
                    if (stalled) { rep.Left.Add(r); rep.Words.Add($"\"{r.Name}\": {UnreportedResults.NotSent(r.Applied.Count)}"); continue; }
                    var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err, r.Reasons);
                    // Review C1: the bridge writes the doc before its audit row, and a reply can be lost — a 409 whose stored result applied
                    // exactly these ghosts is this result, landed earlier (re-read here, on this pool thread; FetchOne is an existing request).
                    // MA-3b2b: a decline too (it applied nothing) — one the bridge holds with the same rejected ghosts and note is taken.
                    string taken = null, unread = null;
                    if (!landed && err != null && err.StartsWith("Bridge 409", StringComparison.Ordinal))
                    {
                        var stored = ChangesetClient.FetchOne(cfg, r.Key, r.ChangesetId, out var readErr);
                        if (stored == null) unread = readErr ?? "no answer";
                        else taken = UnreportedResults.AlreadyTaken(r, stored);
                        // MA-3b2 review C15: the reasons that result holds are counted from the stored result, as from a reply.
                        if (taken != null) reply = UnreportedResults.StoredReply(stored);
                    }
                    if (landed || taken != null)
                    {
                        UnreportedResults.Delete(r.Key, r.ChangesetId);
                        rep.Landed.Add((r, reply));
                        rep.Act |= ChangesetTrust.LateDeclines(reply) != null; // MA-3b4 review C2: applied over a web decline — a person decides
                        // MA-3a (Q2): a ghost declined on the web after Apply re-checked it was applied over the decline — recorded by the bridge; said.
                        // MA-3b2: the decline reasons the bridge kept, counted from its reply (claimed vs verified).
                        rep.Words.Add((taken ?? $"\"{r.Name}\": reported ({ChangesetTrust.LedgerOf(reply)}).") + ChangesetTrust.ReasonsLine(reply, r.Reasons?.Count ?? 0) + (ChangesetTrust.LateDeclines(reply) is { } late ? "\n" + late : ""));
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
                    // Review C10: a 409 that could not be re-read may be this result, landed earlier — kept (never "refused"), and the round stops.
                    if (unread != null) { rep.Left.Add(r); stalled = true; rep.Words.Add($"\"{r.Name}\": {UnreportedResults.NotReRead(unread, r.Applied.Count)}"); continue; }
                    var (drop, words) = UnreportedResults.Outcome(err, r.Applied.Count);
                    if (drop) { UnreportedResults.Delete(r.Key, r.ChangesetId); rep.Act |= r.Applied.Count > 0; } // MA-3b4 (G1): refused for good, its elements in the model
                    else { rep.Left.Add(r); stalled = true; }
                    rep.Words.Add($"\"{r.Name}\": {words}");
                }
                if (after?.Invoke(rep) is string extra && extra.Length > 0) rep.Words.Add(extra.TrimStart('\n')); // MA-3b4 review C3
                return rep;
            }
            finally { Release(); }
        });
    }

    /// <summary>MA-3b4 (AI-2, founder decision F2 B): a model opened — the results this PC applied in it that the bridge has not taken are
    /// checked against its stamps here (DocumentOpened: Revit's thread — Retry) and sent off it; what the bridge did is said in the pane's
    /// Doctor log, and in a dialog only when a person must act (G1). Never while the guard is held (a picker or a review window open, a
    /// report in flight): said, and the next Review AI Proposals sends them. Never while nobody is signed in (review C1: the machine
    /// credential would file it in no one's name) — said. Nothing for a linked or family document, a model not bound, or another model's
    /// records (review C4's comparison).</summary>
    internal static void SendOnOpen(Document doc)
    {
        if (doc == null || doc.IsFamilyDocument || doc.IsLinked) return;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) return;
        var here = DocOf(doc);
        var mine = UnreportedResults.ForKey(ctx.Key).Where(r => string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)).ToList();
        if (mine.Count == 0) return;
        var head = UnreportedResults.OnOpening(doc.Title);
        // E1: the guard, in memory — a picker or a window may hold this model's results already, or a report of them may be in flight.
        if (Volatile.Read(ref _holds) > 0) { App.PanelVm?.LogDoctor(head + UnreportedResults.OpenHeld(mine.Count)); return; }
        // Review C1: a result is reported in a person's name — the machine credential would still pass as service (changesets-store).
        if (!UserSession.IsSignedIn) { App.PanelVm?.LogDoctor(head + UnreportedResults.OpenSignedOut(mine.Count)); return; }
        // Review C9: and not later either — a refresh the session loses mid-round signs it out, and ServiceToken would then fall back
        // to the file's machine credential; with it cleared, the round's requests carry the person's token or none (a 401: kept, said).
        var cfg = BcfConfig.Load(); cfg.FileToken = ""; // review C9
        Said(Retry(doc, cfg, mine), head, rep => rep.Act);
    }

    /// <summary>MA-3b4 (AI-2): a round of reports no window shows — a model opening (F2 B), Ghost Builder. On a pool thread, once the
    /// round is done (and the guard released): its words, made windowless, go to the pane's Doctor log — and to a dialog when
    /// <paramref name="ask"/> says a person must act, or the round failed. Nothing here ends unobserved (MA-3b2b review C1). Work that
    /// must finish under the guard (Ghost Builder's withdrawals) is ReportAll's <c>after</c>, never here (review C3).</summary>
    internal static void Said(Task<Reported> sending, string head, Func<Reported, bool> ask) => sending.ContinueWith(t =>
    {
        try
        {
            var done = t.Status == TaskStatus.RanToCompletion;
            var words = UnreportedResults.Windowless(head, done ? t.Result.Text : UnreportedResults.Failed(t.Exception?.GetBaseException().Message));
            // MA-3b2b review C1: queued before the Doctor line, which stands on its own; no DocPin — a dialog changes nothing in the model.
            if (!done || ask(t.Result)) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));
            try { App.PanelVm?.LogDoctor(words); } catch { }
        }
        catch (Exception ex) { App.Events.Enqueue(_ => TaskDialog.Show(Title, $"The report's result could not be shown — {ex.GetType().Name}: {ex.Message}\nRun Review AI Proposals to see what the bridge holds.")); }
    }, TaskScheduler.Default);

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

        // Per-invocation handler (every sibling command does the same): a static one would let a second open review
        // window clobber the staged request and double-fire callbacks. The closure below keeps it alive for the window's
        // lifetime. It runs on the API thread through the event hub (SEC-7) — the window owns no ExternalEvent.
        var handler = new ChangesetPlacementEvent();

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
        // MA-3c: the ghost overlay — the review's proposed creates drawn in this model's 3D views while the window is open; a tick
        // recolours; closing the window or Apply removes it. Registered, updated and removed on Revit's thread through the hub (DocPin for
        // the registration and the recolour: the model in front; the removal plain — the model may be gone). Nothing is written; every
        // outcome is said on the window's Show line. A late recolour after the removal draws nothing: a removed server is not asked.
        // Review: each create's level elevation (mm), resolved here on the API thread as the executor resolves it (LevelName, else
        // BaseLevel, else the level nearest BaseElevation) — this model's levels, then the levels this changeset creates.
        var levelMm = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        foreach (var lv in new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()) levelMm[lv.Name] = lv.Elevation * 304.8;
        foreach (var lc in (cs.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op == "create" && e.Kind == "level" && e.Place?.Name != null && e.Place.BaseElevation != null))
            if (!levelMm.ContainsKey(lc.Place.Name)) levelMm[lc.Place.Name] = lc.Place.BaseElevation.Value;
        double? LevelOf(ChangesetElementDto e)
        {
            var name = !string.IsNullOrWhiteSpace(e.Place?.LevelName) ? e.Place.LevelName : e.Place?.BaseLevel;
            if (!string.IsNullOrWhiteSpace(name)) return levelMm.TryGetValue(name, out var mm) ? mm : (double?)null;
            if (e.Place?.BaseElevation is double be && levelMm.Count > 0) return levelMm.Values.OrderBy(v => Math.Abs(v - be)).First();
            return null;
        }
        var drawable = (cs.Elements ?? new List<ChangesetElementDto>()).Where(GhostOverlayGeometry.Drawable).ToList();
        int creates = drawable.Count, outlined = drawable.Count(e => GhostOverlayGeometry.Segments(e, true, false, LevelOf(e)).Count > 0);
        var overlay = new GhostOverlayServer(doc, cs.Name, GhostOverlayGeometry.All(window.RowStates(), LevelOf));
        var overlayOn = new[] { false };
        var overlayFailed = false;
        void OverlayOff(string why)
        {
            if (!overlayOn[0]) return;
            overlayOn[0] = false;
            App.Events.Enqueue(ua => { try { GhostOverlayServer.Remove(ua, overlay); } catch (Exception ex) { App.PanelVm?.LogDoctor($"Review AI Proposals: the ghost overlay was not removed ({why}) — {ex.GetType().Name}: {ex.Message}"); } }, "remove the ghost overlay");
        }
        // Review: the draw job checks the window first — closed or applied before Revit ran it, nothing is registered (nothing would
        // remove it). overlayOn is set before Register, so a part-way registration is removed (here, and again when the window closes).
        void OverlayDraw(List<GhostOverlayGeometry.Segment> segs) =>
            App.Events.Enqueue(doc, "draw the ghost overlay", (ua, _) =>
            {
                if (window.Gone || window.Applied || overlayOn[0] || overlayFailed) return;
                overlayOn[0] = true;
                try { overlay.Update(segs); GhostOverlayServer.Register(ua, overlay); window.Shown(GhostOverlayGeometry.Line(creates, outlined)); }
                catch (Exception ex)
                {
                    overlayFailed = true;
                    OverlayOff("the registration failed");
                    window.Shown($"The ghost overlay could not be drawn — {ex.GetType().Name}: {ex.Message}. The review works as before; Show still zooms to a row.");
                }
            }, refusal => window.Shown($"The ghost overlay was not drawn — {refusal}"));
        if (outlined > 0) OverlayDraw(GhostOverlayGeometry.All(window.RowStates(), LevelOf));
        else window.Shown(GhostOverlayGeometry.Line(creates, 0));
        window.TicksChanged += states =>
        {
            if (outlined == 0) return;
            if (window.Applied) { OverlayOff("Apply"); return; }
            var segs = GhostOverlayGeometry.All(states, LevelOf);
            // Review: not drawn yet (a refusal, or removed at Apply and the window reopened) — drawn now; else recoloured. The recolour
            // touches no Document, so it needs no DocPin: it runs whichever model is in front.
            if (!overlayOn[0]) { OverlayDraw(segs); return; }
            App.Events.Enqueue(ua => { overlay.Update(segs); ua.ActiveUIDocument?.RefreshActiveView(); }, "recolour the ghost overlay");
        };
        window.Closed += (_, _) => OverlayOff("the window closed");
        var here = DocOf(doc);
        var left = new List<UnreportedResults.Record>(); // what Retry report sends again
        // Review C13: a decline that did not land lives only in this window (E4) — closing it loses it, said.
        window.Closed += (_, _) => { if (left.Any(r => r.Applied.Count == 0)) App.PanelVm?.LogDoctor("Review AI Proposals: a decline was not reported and its window is closed — " + UnreportedResults.DeclineLost); };

        // Review C2: the person may close the window at any time — words for a closed window go to the pane's Doctor log and, when they
        // are a result (not an "…ing" line), to a dialog on Revit's thread: said, never lost.
        void Tell(string words, bool interim = false)
        {
            void Closed()
            {
                // Review C13: no window is left to offer Retry report for a decline that did not land.
                words = words.Replace(UnreportedResults.DeclineKept, UnreportedResults.DeclineLost);
                // MA-3b2b review C14: nor for a sign-in refusal — its words name what is left to run.
                words = words.Replace(UnreportedResults.PressRetry, UnreportedResults.RunReview);
                // MA-3b2b (F-MA3b2-1): a dialog changes nothing in the model, so it needs no DocPin — whose refusal (another model in front,
                // this one closed) was swallowed here, and the result never shown. Said in whichever model is in front. Review C1: queued
                // before the Doctor line, which stands on its own — a pane that throws (this is a pool thread) cannot take the dialog with it.
                if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));
                try { App.PanelVm?.LogDoctor("Review AI Proposals: " + words); } catch { }
            }
            // MA-3b2b review C13: closed between this check and the posted words — Say hands them back, and the same path runs.
            if (!window.Gone) { window.Say(words, Closed); return; }
            Closed();
        }

        // AI-2: a round of reports runs off Revit's thread; the window says what landed and offers Retry report for what did not.
        void Send(Task<Reported> sending, Func<Reported, string> words) => sending.ContinueWith(t =>
        {
            // MA-3b2b review C1: nothing in this continuation may end it unobserved — whatever throws is said in a dialog.
            try
            {
                if (t.Status != TaskStatus.RanToCompletion)
                {
                    Tell("Reporting failed — " + (t.Exception?.GetBaseException().Message ?? "it did not finish") +
                         $"\nA result Revit applied is kept on this PC ({UnreportedResults.Root}) and sent again by the next Review AI Proposals.");
                    return;
                }
                left = t.Result.Left;
                // MA-3b2b (F-MA3b2-1): a summary that throws is said, with each result's own words (its ledger row, what is kept) after it.
                string said;
                try { said = words(t.Result); }
                catch (Exception ex) { said = $"The report's summary could not be built — {ex.GetType().Name}: {ex.Message}"; }
                Tell(said + (t.Result.Words.Count > 0 ? "\n\n" + t.Result.Text : ""));
                window.Retry(left.Count > 0);
            }
            catch (Exception ex) { App.Events.Enqueue(_ => TaskDialog.Show(Title, $"The report's result could not be shown — {ex.GetType().Name}: {ex.Message}\nRun Review AI Proposals to see what the bridge holds.")); }
        }, TaskScheduler.Default);

        async Task Decide(List<string> ticked, List<string> unticked, string note, Dictionary<string, string> reasons)
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
                    if (ChangesetTrust.Blank(note)) // review C18: blank to the eye, by the reasons' rule
                    {
                        window.Refused(ChangesetTrust.DeclineNeedsReason);
                        return;
                    }
                    // Review C2: × pressed while the re-check ran is a cancel — nothing is declined.
                    if (window.Gone) { App.PanelVm?.LogDoctor("Review AI Proposals: the window was closed before Decline all ran — nothing was declined."); return; }
                    window.Applying("Declining — reporting to the bridge…");
                    // declined — no transaction at all; each changeset of the storey on its own ledger row
                    Send(ReportAll(cfg, fresh.Select(f => ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null, StoreyBatch.Own(f, reasons))).ToList()), rep =>
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
                        // MA-3b2 review C14 (overrides S6): with the reviewer's reasons for the rows they unticked — every key a ghost this
                        // result rejects; the changeset is rejected for good, so a reason dropped here could never be recorded.
                        Tell($"Transaction failed and was rolled back:\n{result.Error}\n\nReporting the declines to the bridge…", interim: true);
                        Send(ReportAll(cfg, fresh.Select(f => ResultOf(key, f, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),
                                $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"), null, here, null, StoreyBatch.Own(f, reasons))).ToList()), rep =>
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
                        records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }, StoreyBatch.Own(one, reasons)));
                    }
                    foreach (var r in records) r.Path = doc.PathName ?? ""; // MA-3b2 review C16: the file itself, beside Doc (a local's central)
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
                // Enqueued from the window's thread (Revit's) — the hub raises on it, as every modeless window here does.
                _ = window.Dispatcher.BeginInvoke(new Action(() =>
                {
                    // Review C12: × between the check above and this raise is a cancel too — the window's hold is already released.
                    if (window.Gone) { App.PanelVm?.LogDoctor("Review AI Proposals: the window was closed before Apply ran — nothing was placed."); return; }
                    try
                    {
                        handler.Completed += onDone;
                        handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);
                        // SEC-7: through the event hub — a request Revit does not take at once is held, said in the Doctor log and
                        // raised again (never lost), so Apply stays pressed until Completed (review M3's Reopen on a refused raise is
                        // no longer a case).
                        App.Events.Enqueue(ua => handler.Execute(ua), "apply the proposals");
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

        window.DecideRequested += (ticked, unticked, note, reasons) => Task.Run(() => Decide(ticked, unticked, note, reasons));
        window.RetryRequested += () =>
        {
            var again = left;
            window.Say("Checking the model, then reporting again…");
            App.Events.Enqueue(doc, "check the model before reporting", (_, d) =>
                {
                    // Review C12: a job that throws (a stamp read) would only reach the hub's log — said here, and Retry report comes back.
                    try { Send(Retry(d, cfg, again), rep => $"Sent again: {rep.Landed.Count} of {again.Count} result(s) reported."); }
                    catch (Exception ex) { Tell($"Retry report could not run — {ex.GetType().Name}: {ex.Message}"); window.Retry(true); }
                },
                refusal => { window.Say(refusal); window.Retry(true); });
        };
        // MA-3b2 (zoom to row): a retype's or attach's element is selected and shown; a create's place is zoomed to in the active view
        // (ChangesetTrust.PlaceBox — mm in the model's internal coordinates, as the executor places it). On Revit's thread through the event
        // hub (DocPin: only while this model is the active one); no transaction, no bridge call; every outcome is said on the window.
        window.ShowRequested += el =>
        {
            var name = ChangesetTrust.GhostName(el);
            if (!string.IsNullOrWhiteSpace(el.Target?.UniqueId))
            {
                App.Events.SelectAndShow(doc, el.Target.UniqueId, gone => window.Shown(gone == null ? $"Showing {name}." : $"{name}: {gone}"));
                return;
            }
            var box = ChangesetTrust.PlaceBox(el.Place);
            if (box == null) { window.Shown($"{name}: its proposal carries no place to show."); return; }
            App.Events.Enqueue(doc, "show the place", (ui, _) =>
            {
                try
                {
                    var uidoc = ui.ActiveUIDocument;
                    var active = uidoc.ActiveGraphicalView; // review C10: a schedule or the project browser is not a view to zoom
                    var view = active == null ? null : uidoc.GetOpenUIViews().FirstOrDefault(v => v.ViewId == active.Id);
                    if (view == null) { window.Shown($"{name}: the active view cannot be zoomed — open a plan view and press Show again."); return; }
                    const double ft = 1.0 / 304.8;
                    view.ZoomAndCenterRectangle(new XYZ(box[0][0] * ft, box[0][1] * ft, box[0][2] * ft), new XYZ(box[1][0] * ft, box[1][1] * ft, box[1][2] * ft));
                    window.Shown($"Showing where {name} would be placed, in the active view ({active.Name}) — a plan of its level shows it best.");
                }
                catch (Exception ex) { window.Shown($"{name}: could not be shown — {ex.GetType().Name}: {ex.Message}"); }
            }, refusal => window.Shown(refusal));
        };
        window.Show();
        return true;
    }
}
