#nullable disable
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 42. MA-3b: the Revit review that does not wait (AI-2, AI-5) — the picker's entries and lines, the window's groups, the ledger
    //        line, the result that waits on this PC and the stamp check before it is sent again (pure) ───────────────────────────
    static void Ma3bDeskChecks()
    {
        Console.WriteLine("\nMA-3b — the picker, the groups, and the result that waits on this PC (AI-2, AI-5)");
        ChangesetDto Cs(string id, string name, string source, string created, params (string Guid, string Op, string Verdict)[] els) => new ChangesetDto
        {
            Id = id, Name = name, Source = source, Claimed = true, Status = "proposed", CreatedAt = created,
            Elements = els.Select(e => new ChangesetElementDto { ProposalGuid = e.Guid, Op = e.Op, Kind = "wall", Verdict = new ElementVerdictDto { Status = e.Verdict } }).ToList(),
        };
        var g1 = Cs("e1000000-a", "Promote (DD) · GR-FFL (1/2)", "promote", "2026-10-04T10:00:00Z", ("a", "retype", "recorded"), ("b", "attach", "recorded"));
        var agent = Cs("e2000000-a", "Core walls", "agent", "2026-10-04T10:05:00Z", ("c", null, "accepted"), ("d", null, "rejected"));
        var g2 = Cs("e3000000-a", "Promote (DD) · GR-FFL (2/2)", "promote", "2026-10-04T10:06:00Z", ("e", "retype", "recorded"));
        var l1 = Cs("e4000000-a", "Promote (DD) · 01-FFL", "promote", "2026-10-04T10:07:00Z", ("f", "attach", "recorded"));
        var entries = StoreyBatch.Entries(new List<ChangesetDto> { g1, agent, g2, l1 });
        Ok(entries.Count == 3 && entries[0].SequenceEqual(new[] { g1, g2 }) && entries[1].SequenceEqual(new[] { agent }) && entries[2].SequenceEqual(new[] { l1 })
           && StoreyBatch.Entries(new List<ChangesetDto>()).Count == 0,
           "the picker lists every pending changeset once, oldest first — a Promote storey's parts as one entry (StoreyBatch.Of's rule)");

        var now = new DateTime(2026, 10, 4, 12, 0, 0, DateTimeKind.Utc);
        g2.Elements[0].Review = new ReviewDto { State = "declined", Action = "decline", Reason = "no", By = "r@example.com", Role = "contributor" };
        Ok(StoreyBatch.Line(entries[0], now) == "Promote (DD) · GR-FFL (2 changesets, one Undo) — promote (claimed) · 2 h ago · 3 ghost(s): 0 accepted, 0 rejected, 3 recorded · 1 declined on the web"
           && StoreyBatch.Line(entries[1], now) == "Core walls — agent (claimed) · 1 h ago · 2 ghost(s): 1 accepted, 1 rejected, 0 recorded",
           "an entry's line: its name, source, age, its ghosts by the referee's verdict, and the web's declines");
        Ok(StoreyBatch.Age("2026-10-04T11:59:40Z", now) == "just now" && StoreyBatch.Age("2026-10-04T11:47:30.5+00:00", now) == "12 min ago"
           && StoreyBatch.Age("2026-10-01T09:00:00Z", now) == "3 d ago" && StoreyBatch.Age("not a time", now) == "age unknown" && StoreyBatch.Age(null, now) == "age unknown",
           "the age reads the bridge's created_at as UTC — and says so when it cannot read it");

        Ok(ChangesetTrust.GroupOf(g1.Elements[0]) == "retype wall" && ChangesetTrust.GroupOf(agent.Elements[0]) == "create wall"
           && StoreyBatch.Merge(entries[0]).Elements.GroupBy(ChangesetTrust.GroupOf).Select(g => $"{g.Key} ({g.Count()})").SequenceEqual(new[] { "retype wall (2)", "attach wall (1)" }),
           "the window groups a storey's ghosts by what they do, in the web desk's words (review-desk.ts whatOf), in the order they come");

        const string none = "the bridge named no ledger row";
        Ok(ChangesetTrust.LedgerOf("{\"id\":\"x\",\"status\":\"declined\",\"ledger\":{\"id\":1731,\"hash\":\"ab\"}}") == "ledger #1731"
           && ChangesetTrust.LedgerOf("{\"id\":\"x\",\"ledger\":{\"id\":null,\"hash\":null}}") == none && ChangesetTrust.LedgerOf("{\"id\":\"x\",\"ledger\":null}") == none
           && ChangesetTrust.LedgerOf("{\"id\":\"x\"}") == none && ChangesetTrust.LedgerOf("not json") == none && ChangesetTrust.LedgerOf(null) == none,
           "a reported result names its ledger row; a bridge before MA-3b (no ledger), a row with no id and a reply that is not JSON say the web desk's words");

        // The record: written before the report is sent, read back whole, never another changeset's or key's.
        var root = Path.Combine(Path.GetTempPath(), "ma3b-check-" + Guid.NewGuid().ToString("N"));
        var was = UnreportedResults.Root;
        UnreportedResults.Root = root;
        try
        {
            var rec = new UnreportedResults.Record
            {
                Key = "ma3b", ChangesetId = "e1000000-a", Name = "Promote (DD) · GR-FFL (1/2)", Doc = @"C:\models\a.rvt",
                Applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "a", RevitElementId = 401, RevitUniqueId = "u-a" } }, Rejected = new List<string> { "b" },
                Note = "DD IDS: 1 failing, placed anyway | reviewer: drill", ReviewRev = 2, Undo = new List<string> { "Sentinel AI changeset: Promote (DD) · GR-FFL [e1000000]" },
                At = "2026-10-04T12:00:00Z",
            };
            Ok(UnreportedResults.Write(rec) && File.Exists(UnreportedResults.PathFor("ma3b", "e1000000-a")) && UnreportedResults.PathFor("ma3b", "e1000000-a") == Path.Combine(root, "ma3b", "e1000000-a.json"),
               "a result Revit applied is written to <root>\\<key>\\<changeset id>.json (%AppData%\\Sentinel\\unreported; here a temp root) before its report is sent");
            var back = UnreportedResults.Read("ma3b", "e1000000-a");
            Ok(back != null && back.Doc == rec.Doc && back.Name == rec.Name && back.Applied.Single().RevitUniqueId == "u-a" && back.Applied[0].RevitElementId == 401
               && back.Applied[0].ProposalGuid == "a" && back.Rejected.SequenceEqual(new[] { "b" }) && back.Note == rec.Note && back.ReviewRev == 2 && back.Undo.SequenceEqual(rec.Undo) && back.At == rec.At,
               "…and read back whole: the applied ids, the rejected guids, the note, the review_rev Apply re-checked and the Undo names — the body the retry sends is the one Apply built");
            File.WriteAllText(Path.Combine(root, "ma3b", "e9.json"), "{ not json");
            File.WriteAllText(UnreportedResults.PathFor("ma3b", "other"), File.ReadAllText(UnreportedResults.PathFor("ma3b", "e1000000-a")));
            Ok(UnreportedResults.ForKey("ma3b").Select(r => r.ChangesetId).SequenceEqual(new[] { "e1000000-a" }) && UnreportedResults.Read("ma3b", "other") == null
               && UnreportedResults.Read("ma3b-x", "e1000000-a") == null && UnreportedResults.ForKey("nothing-here").Count == 0,
               "a file that is not a record, or another changeset's or key's record under this name, is no record (never sent as this one)");
            UnreportedResults.Delete("ma3b", "e1000000-a");
            Ok(UnreportedResults.Read("ma3b", "e1000000-a") == null && !UnreportedResults.ForKey("ma3b").Any(), "a result the bridge took loses its record");
            var file = Path.Combine(root, "a-file");
            File.WriteAllText(file, "x");
            UnreportedResults.Root = file;
            Ok(!UnreportedResults.Write(rec), "a record that cannot be written says so (false) — the window then says nothing on this PC remembers the result");
        }
        finally
        {
            UnreportedResults.Root = was;
            try { Directory.Delete(root, true); } catch (Exception) { /* a temp folder */ }
        }

        // Before a waiting result is sent again: what the model holds is the truth (claimed vs verified).
        var two = new UnreportedResults.Record
        {
            Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL",
            Applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "a", RevitUniqueId = "u-a" }, new AppliedEntry { ProposalGuid = "b", RevitUniqueId = "u-b" } },
        };
        var all = UnreportedResults.Verified(two, 2);
        var gone = UnreportedResults.Verified(two, 0);
        var some = UnreportedResults.Verified(two, 1);
        var decline = UnreportedResults.Verified(new UnreportedResults.Record { Key = "k", ChangesetId = "d", Name = "x" }, 0);
        Ok(all.Report && !all.Ask && all.Words == null && decline.Report && !decline.Ask,
           "a result whose every element still carries its stamp is sent again (a decline, which placed nothing, too)");
        Ok(!gone.Report && gone.Ask && gone.Words == null,
           "a result none of whose elements carries its stamp any more is never reported as applied — the bridge is asked first (review C9)");
        Ok(!some.Report && !some.Ask && some.Words == $"\"Promote (DD) · GR-FFL\": 1 of 2 element(s) Apply placed carry its stamp in this model — nothing reported, and the record is kept ({UnreportedResults.PathFor("k", "c")}): check the model (finish the Undo, or delete what is left), then close this window and run Review AI Proposals again.",
           "a result only part of which is in the model is neither reported nor forgotten — said, with the record's path");

        var refused = UnreportedResults.Outcome("Bridge 409: {\"message\":\"changeset is partially_applied — a result can be reported exactly once, from proposed\"}", 2);
        var signIn = UnreportedResults.Outcome("Bridge 403: {\"message\":\"result requires the contributor role (you are viewer)\"}", 2);
        var down = UnreportedResults.Outcome("No connection could be made because the target machine actively refused it. (127.0.0.1:4101)", 2);
        var downDecline = UnreportedResults.Outcome(null, 0);
        Ok(refused.Drop && refused.Words == "the bridge refused it (retrying cannot fix this): Bridge 409: {\"message\":\"changeset is partially_applied — a result can be reported exactly once, from proposed\"}\nThis PC's record is removed; the 2 element(s) Apply placed are still in this model — check the changeset's status on the bridge before any re-review.",
           "a result the bridge refuses for good (400, 404, 409) loses its record, said with the bridge's words and what is still in the model");
        Ok(!signIn.Drop && signIn.Words == "not reported: Bridge 403: {\"message\":\"result requires the contributor role (you are viewer)\"}\nSign in (Standards ▸ Sign in) as a contributor on this project, then press Retry report.\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice.",
           "a 401 or 403 keeps the record and says to sign in");
        Ok(!down.Drop && down.Words == "not reported: No connection could be made because the target machine actively refused it. (127.0.0.1:4101)\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice."
           && !downDecline.Drop && downDecline.Words == "not reported: the bridge did not answer\nNothing in the model changed; Retry report sends it again.",
           "a bridge that does not answer keeps the record (AI-2) — and a decline, which placed nothing, says so");
        var waiting = new UnreportedResults.Record { Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL", Doc = @"C:\models\a.rvt", At = "2026-10-04T12:00:00Z" };
        Ok(UnreportedResults.Blocked(new[] { waiting }) == "\"Promote (DD) · GR-FFL\" was applied in C:\\models\\a.rvt (2026-10-04T12:00:00Z) and the bridge has not taken its result yet — it is not opened for review again, so nothing is applied twice. Run Review AI Proposals in that model: it checks the model and reports it first.",
           "a changeset with a waiting result is not opened, and the words say where it was applied and what reports it");

        // Review C1: a 409 on a result the bridge already holds (its reply was lost: the 120 s timeout, Revit closed mid-report, or the
        // audit row threw after the doc was written) is landed — never "refused" — when the stored result applied exactly the record's ghosts.
        var held = new UnreportedResults.Record
        {
            Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL",
            Applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "a", RevitUniqueId = "u-a" }, new AppliedEntry { ProposalGuid = "b", RevitUniqueId = "u-b" } },
        };
        ChangesetDto Stored(string status, string result) => System.Text.Json.JsonSerializer.Deserialize<ChangesetDto>($"{{\"id\":\"c\",\"status\":\"{status}\",\"result\":{result}}}");
        const string ab = "{\"applied\":[{\"proposal_guid\":\"b\",\"revit_element_id\":2},{\"proposal_guid\":\"a\",\"revit_element_id\":1}],\"rejected\":[]}";
        Ok(UnreportedResults.AlreadyTaken(held, Stored("partially_applied", ab)) == "\"Promote (DD) · GR-FFL\": the bridge had already taken it (its reply did not reach Revit) — partially_applied; the bridge named no ledger row for it here."
           && UnreportedResults.AlreadyTaken(held, Stored("proposed", "null")) == null
           && UnreportedResults.AlreadyTaken(held, Stored("applied", "{\"applied\":[{\"proposal_guid\":\"a\",\"revit_element_id\":1}]}")) == null
           && UnreportedResults.AlreadyTaken(held, Stored("withdrawn", "null")) == null && UnreportedResults.AlreadyTaken(held, null) == null
           && UnreportedResults.AlreadyTaken(new UnreportedResults.Record { Key = "k", ChangesetId = "c", Name = "x" }, Stored("declined", "{\"applied\":[]}")) == null,
           "review C1: a result the bridge already holds with exactly the record's applied ghosts is taken (said); a proposed, withdrawn or different result, or no applied ghost, is not");

        // Review C9: a result none of whose elements this model holds is removed only after the bridge says what it holds — a record stays
        // exactly when its reply was lost, so the bridge may already hold it (then the Undo it never heard of is posted).
        const string why = "\"Promote (DD) · GR-FFL\": not in this model as applied (undone, the model was closed without saving, or a local that was never synchronised)";
        var stillProposed = UnreportedResults.Gone(held, Stored("proposed", "null"), null);
        var tookIt = UnreportedResults.Gone(held, Stored("partially_applied", ab), null);
        var other = UnreportedResults.Gone(held, Stored("applied", "{\"applied\":[{\"proposal_guid\":\"z\"}]}"), null);
        var unread = UnreportedResults.Gone(held, null, "Bridge 502: bad gateway");
        Ok(stillProposed.Drop && !stillProposed.Revert && stillProposed.Words == why + " — nothing reported; the bridge holds the changeset as proposed, so it opens for review again. This PC's record is removed."
           && tookIt.Drop && tookIt.Revert && tookIt.Words == why + ", but the bridge had already taken it (its reply did not reach Revit) — partially_applied; a changeset_reverted row (undo) for its 2 element(s) was "
           && UnreportedResults.RevertPosted(null) == "posted. This PC's record is removed."
           && UnreportedResults.RevertPosted("Bridge 503: down") == "NOT posted: Bridge 503: down\nThe record is kept on this PC; Retry report or the next Review AI Proposals asks the bridge again."
           && other.Drop && !other.Revert && other.Words == why + ", and the bridge holds the changeset as applied with a result that is not this one — nothing reported. This PC's record is removed."
           && !unread.Drop && !unread.Revert && unread.Words.StartsWith(why + ", and the bridge could not be re-read to say whether it took it (Bridge 502: bad gateway) — nothing reported.\nThe result is kept on this PC", StringComparison.Ordinal),
           "review C9: a result gone from the model is removed as 'stays proposed' only when the bridge says so; one the bridge already took gets its changeset_reverted row; one that cannot be re-read is kept");
        Ok(UnreportedResults.NotReRead("A task was canceled.", 2) == "not reported: the bridge answered 409 and the changeset could not be re-read to tell whether it already holds this result (A task was canceled.).\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice.",
           "review C10: a 409 whose changeset cannot be re-read is never called refused — the record is kept, said");

        // Review M4, C6: a write that timed out says so; after the first report of a round that did not land, the rest are not sent.
        var net48 = UnreportedResults.Outcome("A task was canceled.", 2);
        var net8 = UnreportedResults.Outcome("The request was canceled due to the configured HttpClient.Timeout of 120 seconds elapsing.", 0);
        Ok(!net48.Drop && net48.Words.StartsWith("not reported: the bridge did not answer within 120 s\nThe result is kept on this PC", StringComparison.Ordinal)
           && !net8.Drop && net8.Words == "not reported: the bridge did not answer within 120 s\nNothing in the model changed; Retry report sends it again."
           && UnreportedResults.Outcome("Bridge 409: {\"message\":\"canceled\"}", 0).Words.StartsWith("the bridge refused it", StringComparison.Ordinal)
           && UnreportedResults.NotSent(2) == "not sent: the first report of this round did not land.\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice."
           && UnreportedResults.NotSent(0) == "not sent: the first report of this round did not land.\nNothing in the model changed; Retry report sends it again.",
           "review M4, C6: a report that timed out reads \"did not answer within 120 s\" (net48's and net8's words; a bridge's own words are kept); a result not sent after the round's first failure is kept, said");

        const string stamp = "{\"v\":2,\"changeset_id\":\"c2\",\"source\":\"promote\",\"proposal_guids\":[\"a\",\"x\"],\"unique_id_at_placement\":\"u-a\",\"changeset_ids\":[\"c1\",\"c2\"]}";
        Ok(ProvenanceStamp.Holds(stamp, "c2", "a") && ProvenanceStamp.Holds(stamp, "c1", "x") && !ProvenanceStamp.Holds(stamp, "c3", "a") && !ProvenanceStamp.Holds(stamp, "c2", "z")
           && !ProvenanceStamp.Holds(null, "c2", "a") && !ProvenanceStamp.Holds("not json", "c2", "a") && !ProvenanceStamp.Holds("[1]", "c2", "a") && !ProvenanceStamp.Holds(stamp, null, "a"),
           "the stamp holds a waiting result's element only when it lists both the changeset and the proposal (written inside the placement's transaction: an Undo takes it away)");
        Ok(ProvenanceStamp.Holds(ProvenanceStamp.Json("c9", "promote", new[] { "g9" }, "u-9"), "c9", "g9"),
           "…as the executor writes it (ProvenanceStamp.Json)");

        // Review C8: an Undo while a report is in flight (the registry is filled only once the bridge takes the result) is noted, and handed
        // to the report when it lands — posted exactly once, by the report then or by the watcher after.
        string fly = UndoWatcher.TxName("Promote (DD) · C8", "c8000000-a"), flyOwn = UndoWatcher.TxName("Promote (DD) · C8 (1/1)", "c8000000-a");
        UndoWatcher.Expect(new[] { fly, flyOwn }, "c8000000-a");
        var during = UndoWatcher.Seen(new[] { fly }, "undo");
        var undoneInFlight = UndoWatcher.Land(new[] { fly, flyOwn }, "ma3b", "c8000000-a", new[] { "g8" });
        var afterLanding = UndoWatcher.Seen(new[] { flyOwn }, "redo");
        UndoWatcher.Expect(new[] { "c8 tx b" }, "c8000000-b");
        UndoWatcher.Seen(new[] { "c8 tx b" }, "undo");
        UndoWatcher.Seen(new[] { "c8 tx b" }, "redo");
        var redoneInFlight = UndoWatcher.Land(new[] { "c8 tx b" }, "ma3b", "c8000000-b", new[] { "g9" });
        UndoWatcher.Expect(new[] { "c8 tx c" }, "c8000000-c");
        var quiet = UndoWatcher.Land(new[] { "c8 tx c" }, "ma3b", "c8000000-c", new[] { "g10" });
        Ok(during.Count == 0 && undoneInFlight && afterLanding.Count == 1 && afterLanding[0].ChangesetId == "c8000000-a" && !redoneInFlight && !quiet
           && UnreportedResults.UndoneInFlight(held, null) == "\"Promote (DD) · GR-FFL\": undone in Revit while its report was in flight — a changeset_reverted row (undo) was posted for its 2 element(s)."
           && UnreportedResults.UndoneInFlight(held, "Bridge 503: down") == "\"Promote (DD) · GR-FFL\": undone in Revit while its report was in flight — the changeset_reverted row (undo) was NOT posted: Bridge 503: down\nThe bridge holds it as applied and the model does not — check the changeset on the bridge.",
           "review C8: an Undo while the report is in flight is noted and posted by the report once it lands (an Undo then Redo is not); after landing the watcher posts it; said");
    }

    // ── 43. MA-3b: the review does not wait and does not lose a report (source scans — Revit-bound; drill MA3b runs them) ──────────
    static void Ma3bWiringChecks()
    {
        Console.WriteLine("\nMA-3b — the review does not wait and does not lose a report (source scans)");
        string review = Src("Commands.ReviewChangesets.cs"), window = Src("UI", "ChangesetReviewWindow.cs");
        string picker = File.Exists(Repo("SentinelAddin", "UI", "ChangesetPickerWindow.cs")) ? Src("UI", "ChangesetPickerWindow.cs") : ""; // new in MA-3b
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        Ok(!review.Contains("GetAwaiter().GetResult()") && !review.Contains(".Wait(") && review.Contains("window.DecideRequested += (ticked, unticked, note) => Task.Run(() => Decide(ticked, unticked, note));")
           && At(review, "var f = ChangesetClient.FetchOne(cfg, key, one.Id, out var oneErr);") > At(review, "async Task Decide(")
           && review.Contains("await Task.Run(() => PromoteContext.Fetch(key))") && review.Contains("await Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false))"),
           "AI-2: Apply's re-check, the role, the DD IDS and the guideline are read on a pool thread — the review never waits on Revit's thread");
        int reportAll = At(review, "internal static Task<Reported> ReportAll("), pool = reportAll < 0 ? -1 : review.IndexOf("return Task.Run(() =>", reportAll, StringComparison.Ordinal);
        Ok(reportAll > 0 && pool > reportAll && At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err);") > pool
           && Count(review, "ReportAll(cfg, ") == 4 && !review.Contains("if (!Report(") && !review.Contains("if (Report("),
           "AI-2: every report of the review — applied, declined, rolled back, sent again — goes through ReportAll on a pool thread; Report's retry dialog is Ghost Builder's alone");
        int write = At(review, "!UnreportedResults.Write(r)"), send = At(review, "Send(ReportAll(cfg, records), rep =>");
        Ok(write > At(review, "onDone = result =>") && send > write && review.Contains("UnreportedResults.Delete(r.Key, r.ChangesetId);")
           && At(review, "if (UndoWatcher.Land(r.Undo, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid)))") > At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key"),
           "AI-2: the result is written on this PC before its report is sent, deleted when the bridge takes it, and only then remembered for the undo watcher");
        int expect = At(review, "foreach (var r in records.Where(x => x.Applied.Count > 0)) UndoWatcher.Expect(r.Undo, r.ChangesetId);");
        string watcher = Src("Engine", "UndoWatcher.cs");
        Ok(expect > reportAll && expect < pool && review.Contains("ChangesetClient.ReportReverted(cfg, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid).ToList(), \"undo\", out var undoErr)")
           && review.Contains("rep.Words.Add(UnreportedResults.UndoneInFlight(r, undoErr));")
           && watcher.Contains("foreach (var hit in Seen(e.GetTransactionNames(), op))") && !watcher.Contains("Registry.IsEmpty) return;"),
           "review C8: a report's results are expected by the undo watcher before the report leaves Revit's thread; an Undo noted while it was in flight is posted (changeset_reverted) once it lands, said");
        int open = At(review, "internal static bool Open(UIApplication ui,"), refuse = At(review, "if (waiting.Count > 0) { TaskDialog.Show(Title, UnreportedResults.Blocked(waiting)); return false; }");
        Ok(open > 0 && refuse > open && refuse < At(review, "var window = new ChangesetReviewWindow(cs, reach);")
           && review.Contains("Open(c.Application, doc, cfg, key, batch)") && review.Contains("StoreyBatch.Entries(pending).Select(e => (StoreyBatch.Line(e, DateTime.UtcNow), Waiting(key, e), e))"),
           "AI-2: a changeset whose result waits on this PC is never opened for review again — by the picker (listed, not openable) or by Promote (Open refuses it)");
        Ok(review.Contains("ProvenanceStamp.Holds(ProvenanceStamp.Read(e), r.ChangesetId, a.ProposalGuid)") && review.Contains("var (report, ask, words) = UnreportedResults.Verified(r, found);")
           && review.Contains("var mine = waiting.Where(r => string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)).ToList();") && review.Contains("Load(picker, cfg, key, Retry(doc, cfg, mine),") // review C4
           && !review.Contains("r.Doc == here") && !review.Contains("r.Doc != here")
           && review.Contains("App.Events.Enqueue(doc, \"check the model before reporting\", (_, d) =>") && review.Contains("try { Send(Retry(d, cfg, again), rep =>")
           && At(review, "try { Send(Retry(d, cfg, again), rep =>") > At(review, "App.Events.Enqueue(doc, \"check the model before reporting\", (_, d) =>"),
           "AI-2: a waiting result is sent again only after the model's stamps are read on the API thread (claimed vs verified) — at the next Review AI Proposals and by Retry report; the model's path is compared without case (review C4)");
        Ok(!review.Contains("_reviewOpen") && Count(review, "Hold();") == 3 && Count(review, "Release();") == 3 && review.Contains("finally { Release(); }")
           && review.Contains("picker.Closed += (_, _) => Release();") && review.Contains("window.Closed += (_, _) => Release();"),
           "AI-2: the one-review guard is held while the picker or the window is open and while a report is in flight — not released when the window closes with a report still out");
        Ok(At(review, "if (string.IsNullOrWhiteSpace(note))") > 0 && At(review, "if (string.IsNullOrWhiteSpace(note))") < At(review, "window.Applying(\"Declining — reporting to the bridge…\");")
           && review.Contains("window.Refused(ChangesetTrust.DeclineNeedsReason);")
           && review.Contains("rep.Words.Add(taken ?? $\"\\\"{r.Name}\\\": reported ({ChangesetTrust.LedgerOf(reply)}).\""),
           "AI-5: Decline all needs a reason (the note), and every report says the ledger row the bridge named");
        Ok(!window.Contains("Close();") && window.Contains("public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; });")
           && window.Contains("public void Applying(string words) => Ui(() => { _applied = true; _go.IsEnabled = false; Say(words); });")
           && window.Contains("if (Dispatcher.CheckAccess()) a();"),
           "the window stays open: a refusal keeps the ticks and the note and Apply comes back; once Apply ran it never comes back; its words arrive from any thread");
        Ok(window.Contains("GroupBy(ChangesetTrust.GroupOf)") && window.Contains("foreach (var b in boxes.Where(x => x.IsEnabled)) b.IsChecked = true;")
           && window.Contains("$\"{what} ({boxes.Count}) · {boxes.Count(b => b.IsChecked == true)} ticked\"")
           && window.Contains("_go.Content = n == 0 ? \"Decline all (needs a reason)\" : $\"Apply {n} ticked in Revit\";"),
           "the rows are grouped by what they do, with Tick group (never a declined row) and Untick group, each header counting its ticks");
        Ok(picker.Contains("Tag = blocked == null ? entry : null") && picker.Contains("if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetEntries(entries, status))); return; }")
           && !review.Contains("reviewing the oldest first"),
           "AI-5: the picker lists every entry and opens none whose result waits on this PC; the 'oldest first' modal is gone");
        int askGone = At(review, "var (drop, revert, words) = UnreportedResults.Gone(r, ChangesetClient.FetchOne(cfg, r.Key, r.ChangesetId, out var fetchErr), fetchErr);");
        Ok(review.Contains("else if (ask) gone.Add(r);") && review.Contains("return ReportAll(cfg, send, rep, gone);") && askGone > pool && Count(review, "UnreportedResults.Delete(") == 3
           && review.Contains("drop = ChangesetClient.ReportReverted(cfg, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid).ToList(), \"undo\", out var revertErr);")
           && review.Contains("if (unread != null) { rep.Left.Add(r); stalled = true; rep.Words.Add($\"\\\"{r.Name}\\\": {UnreportedResults.NotReRead(unread, r.Applied.Count)}\"); continue; }"),
           "review C9, C10: a waiting result gone from the model is removed only after the bridge was asked, on the pool thread (one it took gets its changeset_reverted row); a 409 that cannot be re-read keeps its record and stops the round");
        Ok(review.Contains("else taken = UnreportedResults.AlreadyTaken(r, stored);") && review.Contains("if (landed || taken != null)")
           && review.Contains("if (stalled) { rep.Left.Add(r); rep.Words.Add($\"\\\"{r.Name}\\\": {UnreportedResults.NotSent(r.Applied.Count)}\"); continue; }")
           && review.Contains("else { rep.Left.Add(r); stalled = true; }"),
           "review C1, C6: a 409 on a result the bridge already holds is landed and watched for Undo, never 'refused'; after the first report of a round that did not land, the rest wait for Retry report (one 120 s wait, not n)");
        int gone = At(review, "if (window.Gone) { App.PanelVm?.LogDoctor(\"Review AI Proposals: the window was closed before Apply ran — nothing was placed.\"); return; }");
        Ok(gone > At(review, "async Task Decide(") && gone < At(review, "window.Applying(\"Applying in Revit…\");") && window.Contains("Closed += (_, _) => _gone = true;")
           && review.Contains("App.Events.Enqueue(doc, \"say the review's result\", (_, _) => TaskDialog.Show(Title, words), _ => { });") && Count(review, "window.Say(") == 3
           && review.Contains("if (raised == ExternalEventRequest.Denied || raised == ExternalEventRequest.TimedOut)") && Count(review, "handler.Completed -= onDone;") == 3,
           "review C2, M3: a window closed before Apply places nothing; words for a closed window go to the Doctor log and a dialog, never lost; a request Revit did not take (or one that threw) gives Apply back, said");
        Ok(window.Contains("public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Say(words); });") && window.Contains("public void Lock(IEnumerable<string> guids)")
           && At(review, "window.Lock(") > At(review, "if (ChangesetTrust.DeclinedTicked(fresh, ticked) is { } declinedTicked)") && At(review, "window.Lock(") < At(review, "window.Refused(declinedTicked);")
           && review.Contains("else window.Reopen(result.Error + ") && !review.Contains("— run Review AI Proposals again.")
           && window.Contains("foreach (var r in _rows.Where(x => x.Box.IsEnabled)) r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El);"),
           "review C3: a 'Go back' (nothing placed) gives Apply back; a decline that landed after the window opened is unticked and locked here (Tick suggested never re-ticks it); no words send the person to a second Review while this window holds the guard");
        int early = At(window, "if (ticked.Count == 0 && string.IsNullOrWhiteSpace(_note.Text)) { Say(ChangesetTrust.DeclineNeedsReason); return; }");
        int status = At(review, "if (mine.Count > 0) picker.SetEntries(");
        Ok(early > 0 && early < At(window, "DecideRequested?.Invoke(") && status > 0 && status < At(review, "Load(picker, cfg, key, Retry(doc, cfg, mine),"),
           "review M2, C7: Decline all without a reason is refused by the window at once (no bridge call); the picker says it is checking and sending this model's waiting results before it lists");

        // Review C11–C13: no word is lost to a closed picker or window, × in the last gap places nothing, and a Retry job that throws is said.
        const string closedBeforeApply = "if (window.Gone) { App.PanelVm?.LogDoctor(\"Review AI Proposals: the window was closed before Apply ran — nothing was placed.\"); return; }";
        int raise = At(review, "_ = window.Dispatcher.BeginInvoke(new Action(() =>");
        Ok(picker.Contains("Closed += (_, _) => _gone = true;") && picker.Contains("if (_gone) { if (!string.IsNullOrEmpty(status)) App.PanelVm?.LogDoctor(\"Review AI Proposals: \" + status); return; }")
           && review.Contains("if (picker.Gone)") && review.Contains("App.Events.Enqueue(doc, \"say the review's result\", (_, _) => TaskDialog.Show(Title, rep.Text), _ => { });")
           && At(review, "if (picker.Gone)") > At(review, "var rep = await retried;") && At(review, "if (picker.Gone)") < At(review, "var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);")
           && window.Contains("if (_gone) { if (!string.IsNullOrEmpty(words)) App.PanelVm?.LogDoctor(\"Review AI Proposals: \" + words); return; }"),
           "review C11: the words of a round the picker started reach the Doctor log and a dialog when the picker was closed meanwhile; words posted to a window or picker that closed in between go to the Doctor log");
        Ok(Count(review, closedBeforeApply) == 2 && review.IndexOf(closedBeforeApply, raise, StringComparison.Ordinal) > raise
           && review.IndexOf(closedBeforeApply, raise, StringComparison.Ordinal) < At(review, "handler.Completed += onDone;")
           && review.Contains("catch (Exception ex) { Tell($\"Retry report could not run — {ex.GetType().Name}: {ex.Message}\"); window.Retry(true); }"),
           "review C12: × between Decide's check and the raise places nothing (the raise checks again); a Retry report whose job throws says so and gives Retry report back");
        Ok(review.Contains("words = words.Replace(UnreportedResults.DeclineKept, UnreportedResults.DeclineLost);")
           && review.Contains("window.Closed += (_, _) => { if (left.Any(r => r.Applied.Count == 0)) App.PanelVm?.LogDoctor(")
           && UnreportedResults.Outcome(null, 0).Words.EndsWith("\n" + UnreportedResults.DeclineKept, StringComparison.Ordinal)
           && UnreportedResults.DeclineLost == "Nothing in the model changed; the changeset stays proposed — review it again to decline it.",
           "review C13: a decline that did not land is lost with its window (E4) — said so, never 'Retry report sends it again' with no window left");
    }
}
