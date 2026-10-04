#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 44. MA-3b2: a reason per declined ghost (the rule, the split per changeset, the body, the record, what the bridge kept), the
    //        place a row shows, and the bridge's failures in plain words (pure) ───────────────────────────────────────────────────
    static void Ma3b2ReasonChecks()
    {
        Console.WriteLine("\nMA-3b2 — a reason per declined ghost, the place a row shows, the bridge's failures in plain words");
        using var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ma3a-review.json")));
        var rr = fx.RootElement.GetProperty("revit_reasons");
        var after = JsonSerializer.Deserialize<ChangesetDto>(fx.RootElement.GetProperty("after").GetRawText());

        // The one-line rule, as the bridge holds it (the fixture's `rule`, which vitest runs through resultReasons).
        bool rule = true;
        foreach (var c in rr.GetProperty("rule").EnumerateArray())
        {
            var clean = ChangesetTrust.DeclineReason(c.GetProperty("text").GetString(), out var problem);
            string want = c.TryGetProperty("clean", out var w) && w.ValueKind == JsonValueKind.String ? w.GetString() : null;
            rule &= c.GetProperty("ok").GetBoolean() ? problem == null && clean == want : problem == ChangesetTrust.ReasonRule && clean == null;
        }
        string long500 = new string('x', 500);
        Ok(rule && rr.GetProperty("rule").GetArrayLength() == 5 && ChangesetTrust.ReasonRule == "a reason is one line of at most 500 characters" && ChangesetTrust.MaxReason == 500
           && ChangesetTrust.DeclineReason(long500, out var p500) == long500 && p500 == null
           && ChangesetTrust.DeclineReason(long500 + "x", out var p501) == null && p501 == ChangesetTrust.ReasonRule
           && ChangesetTrust.DeclineReason(null, out var pNull) == null && pNull == null,
           "a decline reason is cleaned as the bridge cleans it (the shared fixture's rule): trimmed; blank is none; two lines, a control character or more than 500 characters is refused before anything is sent");

        // A storey's reasons, split back to the changeset each ghost is reported on (StoreyBatch.Own's rule).
        var part1 = new ChangesetDto { Id = "p1", Elements = after.Elements.Take(2).ToList() }; // g-1, g-2
        var part2 = new ChangesetDto { Id = "p2", Elements = after.Elements.Skip(2).ToList() }; // g-3, g-4
        var typed = new Dictionary<string, string> { ["g-3"] = "W 2 is demolished in the next package", ["g-1"] = "a party wall", ["zz"] = "not a ghost" };
        var own1 = StoreyBatch.Own(part1, typed);
        var own2 = StoreyBatch.Own(part2, typed);
        Ok(own1 != null && own1.Count == 1 && own1["g-1"] == "a party wall" && own2 != null && own2.Count == 1 && own2["g-3"] == "W 2 is demolished in the next package"
           && StoreyBatch.Own(part1, new Dictionary<string, string> { ["g-3"] = "x" }) == null && StoreyBatch.Own(part1, (Dictionary<string, string>)null) == null,
           "a storey's reasons are split back to the changeset each ghost is reported on; none for a changeset is null (its report sends none)");

        // The body Revit posts, and the record that is sent again later.
        var applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "g-2", RevitElementId = 312312, RevitUniqueId = "u-2" } };
        var rejected = new List<string> { "g-1", "g-3", "g-4" };
        using var body = JsonDocument.Parse(ChangesetClient.ResultBody(applied, rejected, "GR-FFL reviewed in Revit", 1, own2));
        using var bare = JsonDocument.Parse(ChangesetClient.ResultBody(applied, rejected, null, null, null));
        // Review C19: a body that lost its reasons is a counted FAIL, not a crash of the run.
        bool hasReasons = body.RootElement.TryGetProperty("reasons", out var sentReasons) && sentReasons.ValueKind == JsonValueKind.Object;
        bool bareReasons = bare.RootElement.TryGetProperty("reasons", out var noReasons) && noReasons.ValueKind == JsonValueKind.Null;
        Ok(hasReasons && sentReasons.TryGetProperty("g-3", out var g3) && g3.GetString() == "W 2 is demolished in the next package" && sentReasons.EnumerateObject().Count() == 1
           && body.RootElement.GetProperty("review_rev").GetInt32() == 1 && body.RootElement.GetProperty("applied")[0].GetProperty("proposal_guid").GetString() == "g-2"
           && body.RootElement.GetProperty("rejected").GetArrayLength() == 3 && body.RootElement.TryGetProperty("actor", out _)
           && bareReasons && bare.RootElement.GetProperty("review_rev").ValueKind == JsonValueKind.Null,
           "the result's body carries reasons {proposal_guid: text} beside applied, rejected, note, actor and review_rev; with none it is null, which the bridge reads as none");

        var root = Path.Combine(Path.GetTempPath(), "ma3b2-check-" + Guid.NewGuid().ToString("N"));
        var was = UnreportedResults.Root;
        UnreportedResults.Root = root;
        try
        {
            var rec = new UnreportedResults.Record { Key = "ma3b2", ChangesetId = "c-1", Name = "Promote (DD) · GR-FFL", Doc = @"C:\models\a.rvt", Applied = applied, Rejected = rejected, Reasons = own2, At = "2026-10-04T12:00:00Z" };
            bool wrote = UnreportedResults.Write(rec);
            var back = UnreportedResults.Read("ma3b2", "c-1");
            File.WriteAllText(UnreportedResults.PathFor("ma3b2", "c-0"), "{\"key\":\"ma3b2\",\"changeset_id\":\"c-0\",\"name\":\"before MA-3b2\",\"applied\":[],\"rejected\":[\"g\"]}");
            var old = UnreportedResults.Read("ma3b2", "c-0");
            Ok(wrote && back?.Reasons != null && back.Reasons.Count == 1 && back.Reasons["g-3"] == "W 2 is demolished in the next package" && old != null && old.Reasons == null,
               "a result kept on this PC keeps its reasons, so one sent again later carries them; a record written before MA-3b2 reads with none");
        }
        finally
        {
            UnreportedResults.Root = was;
            try { Directory.Delete(root, true); } catch (Exception) { /* a temp folder */ }
        }

        // Claimed vs verified: the words count the reasons the bridge's reply holds, never the ones sent.
        string reply = "{\"id\":\"c\",\"status\":\"partially_applied\",\"result\":{\"note\":null,\"reasons\":" + rr.GetProperty("stored").GetRawText() + "},\"ledger\":{\"id\":1801}}";
        const string notKept = " — a bridge before MA-3b2 keeps none, and a blank one is never kept; what it did not keep is not on the ledger.";
        Ok(ChangesetTrust.ReasonsLine(reply, 2) == "\n2 decline reason(s) recorded with it." && ChangesetTrust.ReasonsLine(reply, 0) == "" && ChangesetTrust.ReasonsLine(null, 0) == ""
           && ChangesetTrust.ReasonsLine(reply, 3) == "\n⚠ 3 decline reason(s) were sent and the bridge kept 2" + notKept
           && ChangesetTrust.ReasonsLine("{\"id\":\"c\",\"result\":{\"note\":null}}", 2) == "\n⚠ 2 decline reason(s) were sent and the bridge kept 0" + notKept
           && ChangesetTrust.ReasonsLine("not json", 1) == "\n⚠ 1 decline reason(s) were sent and the bridge kept 0" + notKept,
           "a reported result says how many decline reasons the bridge kept — read from its reply (claimed vs verified); a bridge that kept fewer than were sent is said");

        // Review C15: a result the bridge had already taken (its reply was lost, then a 409) is counted the same way, from the stored result re-read.
        var storedCs = JsonSerializer.Deserialize<ChangesetDto>("{\"id\":\"c\",\"status\":\"partially_applied\",\"result\":{\"applied\":[],\"reasons\":" + rr.GetProperty("stored").GetRawText() + "}}");
        var bareCs = JsonSerializer.Deserialize<ChangesetDto>("{\"id\":\"c\",\"status\":\"partially_applied\",\"result\":{\"applied\":[]}}");
        Ok(ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(storedCs), 2) == "\n2 decline reason(s) recorded with it." && ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(storedCs), 0) == ""
           && ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(bareCs), 2) == "\n⚠ 2 decline reason(s) were sent and the bridge kept 0" + notKept
           && ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(null), 1) == "\n⚠ 1 decline reason(s) were sent and the bridge kept 0" + notKept,
           "a result the bridge had already taken says how many decline reasons it holds — counted from the stored result re-read after the 409 (review C15)");

        // Review C18: Decline all's note is blank by the reasons' own rule — a zero-width space is no reason.
        Ok(ChangesetTrust.Blank(null) && ChangesetTrust.Blank("") && ChangesetTrust.Blank("  \t") && ChangesetTrust.Blank("\u200B") && ChangesetTrust.Blank(" \u200B\uFEFF ")
           && !ChangesetTrust.Blank("out of scope") && !ChangesetTrust.Blank("two\nlines") && !ChangesetTrust.Blank(new string('x', 501)),
           "a note that is blank to the eye (spaces, a zero-width space) is no reason for Decline all; a note of several lines or a long one is still a note (review C18)");

        // The bridge's failures in plain words (drill MA3b's finding: "Couldn't reach the bridge: A task was canceled.").
        const string notRefreshed = "session not refreshed — retrying (Supabase not reached: A task was canceled.)"; // UserSession.cs:152, :177
        var refusedConnection = new HttpRequestException("An error occurred while sending the request.",
            new InvalidOperationException("Unable to connect to the remote server", new InvalidOperationException("No connection could be made because the target machine actively refused it 127.0.0.1:4101")));
        Ok(ChangesetTrust.BridgeWords("A task was canceled.", 8) == "the bridge did not answer within 8 s"
           && ChangesetTrust.BridgeWords("The request was canceled due to the configured HttpClient.Timeout of 120 seconds elapsing.", 120) == "the bridge did not answer within 120 s"
           && ChangesetTrust.BridgeWords(new TaskCanceledException(), 8) == "the bridge did not answer within 8 s"
           && ChangesetTrust.BridgeWords(new OperationCanceledException("anything"), 120) == "the bridge did not answer within 120 s"
           && ChangesetTrust.BridgeWords(refusedConnection, 8) == "the connection failed — No connection could be made because the target machine actively refused it 127.0.0.1:4101"
           && ChangesetTrust.BridgeWords(new JsonException("'<' is an invalid start of a value."), 8) == "'<' is an invalid start of a value."
           && ChangesetTrust.BridgeWords("Bridge 409: {\"message\":\"the changeset was canceled\"}", 8) == "Bridge 409: {\"message\":\"the changeset was canceled\"}"
           && ChangesetTrust.BridgeWords((string)null, 8) == "the bridge did not answer" && ChangesetTrust.BridgeWords("  ", 8) == "the bridge did not answer"
           // Review C1 (never a guess): a sign-in refresh that timed out before the bridge was asked keeps its own words — everywhere.
           && ChangesetTrust.BridgeWords("The operation was canceled.", 8) == "the bridge did not answer within 8 s"
           && ChangesetTrust.BridgeWords(new InvalidOperationException(notRefreshed), 8) == notRefreshed && ChangesetTrust.BridgeWords(notRefreshed, 120) == notRefreshed
           && ChangesetTrust.BridgeWords(new InvalidOperationException(""), 8) == "the bridge did not answer"
           && UnreportedResults.Outcome(notRefreshed, 1) is var kept && !kept.Drop && kept.Words.StartsWith("not reported: " + notRefreshed, StringComparison.Ordinal) && !kept.Words.Contains("the bridge did not answer")
           && UnreportedResults.Outcome("A task was canceled.", 1).Words.StartsWith("not reported: the bridge did not answer within 120 s", StringComparison.Ordinal),
           "a request that timed out reads \"the bridge did not answer within N s\" (net48's and net8's words, or the exception itself), a refused connection names its cause, the bridge's own words are never rewritten, and a sign-in that failed before the bridge was asked is never said as the bridge's silence");
        string client = Src("Coordination", "ChangesetClient.cs"), unreported = Src("Engine", "UnreportedResults.cs");
        int reads = 0;
        for (int i = 0; (i = client.IndexOf("error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds);", i, StringComparison.Ordinal)) >= 0; i++) reads++;
        Ok(reads == 3 && client.Contains("catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)WriteHttp.Timeout.TotalSeconds); return false; }")
           && unreported.Contains("var err = ChangesetTrust.BridgeWords(error, 120);")
           && client.Contains("ResultBody(applied, rejected, note, reviewRev, reasons), 200, out reply, out error);"),
           "every read (the pending list, the re-check, the role) and every write of the changeset client says its failure in those words, with its own timeout; the result is posted with ResultBody");

        // Zoom to row: the rectangle a create's row shows, from its place (mm, with a margin); none when the place has no point.
        var wall = ChangesetTrust.PlaceBox(new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0, 3000 }, End = new double[] { 5000, 0, 3000 } } });
        var arc = ChangesetTrust.PlaceBox(new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0, 0 }, End = new double[] { 4000, 0, 0 }, Mid = new double[] { 2000, 2000, 0 } } }, 0);
        var door = ChangesetTrust.PlaceBox(new PlaceDto { Location = new double[] { 2500, 100, 0 } });
        var roof = ChangesetTrust.PlaceBox(new PlaceDto { Boundary = new[] { new double[] { 0, 0 }, new double[] { 8000, 0 }, new double[] { 8000, 6000 } }, BaseElevation = 6000 }, 500);
        Ok(wall != null && wall[0].SequenceEqual(new double[] { -1000, -1000, 3000 }) && wall[1].SequenceEqual(new double[] { 6000, 1000, 3000 })
           && arc[0].SequenceEqual(new double[] { 0, 0, 0 }) && arc[1].SequenceEqual(new double[] { 4000, 2000, 0 })
           && door[0].SequenceEqual(new double[] { 1500, -900, 0 }) && door[1].SequenceEqual(new double[] { 3500, 1100, 0 })
           && roof[0].SequenceEqual(new double[] { -500, -500, 6000 }) && roof[1].SequenceEqual(new double[] { 8500, 6500, 6000 })
           && ChangesetTrust.PlaceBox(new PlaceDto { Name = "03-FFL", BaseElevation = 9000 }) == null && ChangesetTrust.PlaceBox(null) == null,
           "a create's row shows the rectangle around its place — a wall's line (an arc's middle point too), a door's point, a roof's outline — 1 m wider on each side; a level or a grid has no place to show");
        Ok(ChangesetTrust.GhostName(after.Elements[0]) == "retype wall \"W 1\"" && ChangesetTrust.GhostName(new ChangesetElementDto { ProposalGuid = "g-9", Kind = "door" }) == "create door \"g-9\""
           && ChangesetTrust.NoPlace == "A type edit has no place in the model — it reaches every element on its type (the row says how many).",
           "a row's Show names its ghost as the bridge's refusals do, and a type edit says it has no place");
    }
}
