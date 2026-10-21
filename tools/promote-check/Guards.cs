#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── Human-error guards (spec 2026-10-21): the review's risk tiers, the batch limit, the governed delete and its revert ──
    static void GuardChecks()
    {
        Console.WriteLine("\nHuman-error guards (2026-10-21) — risk-tiered review, batch limit, delete a duplicate");
        ChangesetElementDto El(string op, string kind) => new ChangesetElementDto { Op = op, Kind = kind, ProposalGuid = op + kind };
        Ok(ChangesetTrust.TierOf(El("set_parameter", "wall"), null) == ChangesetTrust.Tier.Safe && ChangesetTrust.TierOf(El("retype", "door"), null) == ChangesetTrust.Tier.Safe
           && ChangesetTrust.TierOf(El("attach", "wall"), null) == ChangesetTrust.Tier.Safe && ChangesetTrust.TierOf(El("create", "door"), null) == ChangesetTrust.Tier.Safe
           && ChangesetTrust.TierOf(El(null, "furniture"), null) == ChangesetTrust.Tier.Safe,
           "a type edit, a retype, an attach and a door or furniture create that touch nothing protected are safe — grouped");
        Ok(new[] { "wall", "floor", "roof", "column", "beam", "stair", "terrain", "level", "grid", "mass", "opening" }.All(k => ChangesetTrust.TierOf(El("create", k), null) == ChangesetTrust.Tier.Reason)
           && new[] { "reshape", "rehost", "delete" }.All(op => ChangesetTrust.TierOf(El(op, "wall"), null) == ChangesetTrust.Tier.Reason)
           && ChangesetTrust.TierOf(new ChangesetElementDto { Op = "create", Kind = "wall", Replaces = new ReplacesDto() }, null) == ChangesetTrust.Tier.Reason,
           "geometry creates, a reshape, a rehost, a delete and a create that replaces need a reason, whatever the model holds");
        Ok(ChangesetTrust.TierOf(El("retype", "door"), (false, "within 50 mm of Structural Columns 7")) == ChangesetTrust.Tier.Reason
           && ChangesetTrust.TierOf(El("create", "door"), (true, "Levels are protected")) == ChangesetTrust.Tier.Reason,
           "a safe row near a protected element needs a reason; a create is never locked as protected (it edits nothing that exists)");
        Ok(ChangesetTrust.TierOf(El("retype", "column"), (true, "Structural Columns are protected by the built-in protection policy")) == ChangesetTrust.Tier.Protected
           && ChangesetTrust.TierOf(El("delete", "wall"), (true, "is structural")) == ChangesetTrust.Tier.Protected,
           "a row whose own element is protected is locked — the executor keeps it as it stands; a protected copy is never deleted");
        Ok(ChangesetTrust.RiskyByOp(El("delete", "wall")) && !ChangesetTrust.RiskyByOp(El("set_parameter", "wall")), "the bridge's list of rows risky by what they do is the window's (riskyByOp)");

        Ok(ChangesetTrust.BatchRefusal(200, "") == null && ChangesetTrust.BatchRefusal(201, " ")?.Contains("201 rows are ticked — more than the 200") == true
           && ChangesetTrust.BatchRefusal(201, "one storey, checked in the overlay") == null,
           "over 200 ticked, Apply asks to split the batch or give a reason; at 200 it does not ask");

        var body = JsonDocument.Parse(ChangesetClient.ResultBody(new List<AppliedEntry>(), new List<string>(), null, null, null, "k-1",
                                                                 new Dictionary<string, string> { ["g1"] = "checked in 3D" }, "one storey")).RootElement;
        var bare = JsonDocument.Parse(ChangesetClient.ResultBody(new List<AppliedEntry>(), new List<string>(), null, null, null)).RootElement;
        Ok(body.GetProperty("tick_reasons").GetProperty("g1").GetString() == "checked in 3D" && body.GetProperty("batch_reason").GetString() == "one storey"
           && bare.GetProperty("tick_reasons").ValueKind == JsonValueKind.Null && bare.GetProperty("batch_reason").ValueKind == JsonValueKind.Null,
           "the result carries the tick reasons and the batch reason, null when none (a bridge before them ignores both)");

        // §3: the delete's row, what it carries back, the saved check and Revert
        var del = new ChangesetElementDto { Op = "delete", Kind = "wall", ProposalGuid = "d1", Target = new TargetDto { IfcGuid = "2O2Fr$t4X7Zf8NOew3FLKI", KeeperIfcGuid = "2O2Fr$t4X7Zf8NOew3FLKJ" } };
        Ok(ChangesetTrust.DeleteWords(del).Contains("2O2Fr$t4X7Zf8NOew3FLKI") && ChangesetTrust.DeleteWords(del).Contains("same type, level, place and size"),
           "a delete's row names the copy, the element kept, and that Revit removes it only when they are the same");
        var entry = new AppliedEntry { ProposalGuid = "d1", RevitElementId = 9, RevitUniqueId = "u9", Deleted = new DeletedDto { KeeperUniqueId = "u8", Values = { new ParamValueDto { Id = -1001, Name = "Comments", Storage = "String", Value = "copy" } } } };
        var sent = JsonDocument.Parse(ChangesetClient.ResultBody(new List<AppliedEntry> { entry }, new List<string>(), null, null, null)).RootElement.GetProperty("applied")[0];
        Ok(sent.GetProperty("deleted").GetProperty("keeper_unique_id").GetString() == "u8" && sent.GetProperty("deleted").GetProperty("values")[0].GetProperty("id").GetInt64() == -1001
           && !JsonDocument.Parse(ChangesetClient.ResultBody(new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "x" } }, new List<string>(), null, null, null)).RootElement.GetProperty("applied")[0].TryGetProperty("deleted", out _),
           "a delete's applied entry carries the element kept and the copy's values; every other entry leaves the field out");

        var cs = new ChangesetDto { Id = "c-d", Name = "Clash duplicates", Result = JsonDocument.Parse("{\"applied\":[{\"proposal_guid\":\"d1\",\"revit_element_id\":9,\"revit_unique_id\":\"u9\",\"deleted\":{\"keeper_unique_id\":\"u8\",\"values\":[]}}," +
            "{\"proposal_guid\":\"d2\",\"revit_element_id\":10,\"revit_unique_id\":\"u10\"}]}").RootElement.Clone() };
        var rows = RevertPlan.Applied(cs);
        Ok(rows[0].Deleted?.KeeperUniqueId == "u8" && RevertPlan.NeverWhy(del, rows[0]) == null && RevertPlan.NeverWhy(del, rows[1])?.Contains("cannot re-create it") == true,
           "Revert reads a delete's record and goes to Revit's checks; one with no record is kept, said");
        Ok(RevertPlan.Recreated.Contains("its Revit id is new"), "Revert says the copy comes back as a copy of the element kept, with a new Revit id");

        var rec = new UnreportedResults.Record { Key = "k", ChangesetId = "c-d", Name = "n", Path = @"C:\m.rvt", Applied = new List<AppliedEntry> { entry, new AppliedEntry { ProposalGuid = "g", RevitUniqueId = "u1" } } };
        var root = SavedCheck.Root;
        try
        {
            SavedCheck.Root = Path.Combine(Path.GetTempPath(), "sentinel-guards-check-" + Guid.NewGuid().ToString("N"));
            Ok(SavedCheck.Remember(rec), "a result with a delete is remembered for its saved check");
            var back = SavedCheck.ForPath(@"C:\m.rvt").Single();
            var (held, missing) = SavedCheck.Split(back, a => a.Deleted);
            Ok(back.Applied.Single(a => a.ProposalGuid == "d1").Deleted && !back.Applied.Single(a => a.ProposalGuid == "g").Deleted && held.SequenceEqual(new[] { "d1" }) && missing.SequenceEqual(new[] { "g" }),
               "the saved check knows a delete's row: held while its copy is gone, missing when it is back");
        }
        finally { try { Directory.Delete(SavedCheck.Root, true); } catch { } SavedCheck.Root = root; }
    }
}
