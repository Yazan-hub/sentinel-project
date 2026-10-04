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
        Ok(all.Report && !all.Drop && all.Words == null && decline.Report && !decline.Drop,
           "a result whose every element still carries its stamp is sent again (a decline, which placed nothing, too)");
        Ok(!gone.Report && gone.Drop && gone.Words == "\"Promote (DD) · GR-FFL\": not in this model as applied (undone, or the model was closed without saving) — nothing reported; the changeset stays proposed and opens for review again. This PC's record is removed.",
           "a result none of whose elements carries its stamp any more is never reported as applied — said, and its record removed");
        Ok(!some.Report && !some.Drop && some.Words == $"\"Promote (DD) · GR-FFL\": 1 of 2 element(s) Apply placed carry its stamp in this model — nothing reported, and the record is kept ({UnreportedResults.PathFor("k", "c")}): check the model (finish the Undo, or delete what is left), then close this window and run Review AI Proposals again.",
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
    }
}
