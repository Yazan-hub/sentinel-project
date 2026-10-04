#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;

static partial class Check
{
    // ── 46. MA-3b2b: a decline the bridge already holds is taken, not refused — a Decline all (or a rolled-back Apply) whose reply
    //        was lost and is sent again by Retry report (pure, and the one line that asks) ─────────────────────────────────────────
    static void Ma3b2bDeclineChecks()
    {
        Console.WriteLine("\nMA-3b2b — a decline the bridge already holds is taken, not refused");
        UnreportedResults.Record Decline(string note, params string[] rejected) =>
            new UnreportedResults.Record { Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL", Rejected = rejected.ToList(), Note = note };
        // The same decline with the reviewer's reason for ghost a, as typed (the bridge keeps it trimmed).
        UnreportedResults.Record Why(UnreportedResults.Record r, string guid, string reason) { r.Reasons = new Dictionary<string, string> { [guid] = reason }; return r; }
        UnreportedResults.Record Mine(string note, params string[] rejected) => Why(Decline(note, rejected), "a", "  stays as it is ");
        ChangesetDto Stored(string status, string result) => JsonSerializer.Deserialize<ChangesetDto>($"{{\"id\":\"c\",\"status\":\"{status}\",\"result\":{result}}}");
        const string held = "{\"applied\":[],\"rejected\":[\"b\",\"a\"],\"note\":\"not this package\",\"reasons\":{\"a\":\"stays as it is\"}}";
        const string bare = "{\"applied\":[],\"rejected\":[\"b\",\"a\"],\"note\":\"not this package\"}"; // a bridge before MA-3b2 keeps no reasons
        const string taken = "\"Promote (DD) · GR-FFL\": the bridge had already taken it (its reply did not reach Revit) — declined; the bridge named no ledger row for it here.";

        Ok(UnreportedResults.AlreadyTaken(Mine(" not this package ", "a", "b"), Stored("declined", held)) == taken
           && UnreportedResults.AlreadyTaken(Decline(null, "a"), Stored("declined", "{\"applied\":[],\"rejected\":[\"a\"],\"note\":null}")) == taken
           && UnreportedResults.AlreadyTaken(Decline("", "a"), Stored("declined", "{\"applied\":[],\"rejected\":[\"a\"]}")) == taken,
           "a decline whose stored result rejects the same ghosts with the same note (trimmed; none is none) is this decline, landed earlier — taken, said");
        Ok(UnreportedResults.AlreadyTaken(Mine("another reason", "a", "b"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b", "c"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("proposed", "null")) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("withdrawn", "null")) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("partially_applied", held)) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("declined", "{\"applied\":[],\"note\":\"not this package\"}")) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package"), Stored("declined", "{\"applied\":[],\"rejected\":[],\"note\":\"not this package\"}")) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), null) == null,
           "another note, another set of ghosts, a changeset still proposed, withdrawn or partly applied, a stored result with no rejected list, or a record that rejects nothing is not this decline — the 409 stands");
        Ok(UnreportedResults.AlreadyTaken(Why(Decline("not this package", "a", "b"), "a", "another reason"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Why(Decline("not this package", "a", "b"), "b", "stays as it is"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a", "b"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Why(Decline("not this package", "a", "b"), "a", " ​ "), Stored("declined", bare)) == taken
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("declined", bare)) == taken,
           "review C7: the same ghosts and note with other stored reasons (another text, another ghost, or reasons this record never sent) is another person's decline — the 409 stands; a stored result with no reasons still matches (a blank reason is never kept; an older bridge keeps none)");
        Ok(ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(Stored("declined", held)), 1) == "\n1 decline reason(s) recorded with it."
           && ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(Stored("declined", bare)), 1).StartsWith("\n⚠ 1 decline reason(s) were sent and the bridge kept 0", StringComparison.Ordinal),
           "the reasons of a decline taken earlier are counted from the stored result (C15) — a bridge that kept none is said, never counted as kept");
        var goneDecline = UnreportedResults.Gone(Mine("not this package", "a", "b"), Stored("declined", held), null);
        Ok(UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("declined", held)) == taken && goneDecline.Drop && !goneDecline.Revert
           && UnreportedResults.DeclineLost == "Nothing in the model changed; the bridge may or may not have taken the decline — run Review AI Proposals: a changeset no longer listed was declined, one still listed is reviewed again.",
           "review C10, C8: a record that applied nothing never asks for a changeset_reverted row, though the bridge holds its decline; a decline whose window is closed is not said to stay proposed — the bridge may hold it");
        string review = Src("Commands.ReviewChangesets.cs");
        Ok(review.Contains("if (!landed && err != null && err.StartsWith(\"Bridge 409\", StringComparison.Ordinal))") && !review.Contains("!landed && r.Applied.Count > 0 && err != null")
           && UnreportedResults.Outcome("Bridge 409: {\"message\":\"changeset is declined — a result can be reported exactly once, from proposed\"}", 0).Words.StartsWith("the bridge refused it", StringComparison.Ordinal),
           "every 409 — a decline's too — is re-read before it is called refused; a 409 that is not this result still reads \"the bridge refused it\"");
    }
}
