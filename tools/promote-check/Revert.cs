#nullable disable
using System.IO;
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── Revert + "applied, then saved" (2026-10-20): the rows never reverted, the person's reason, the window's words, the records on this PC ──
    static void RevertChecks()
    {
        Console.WriteLine("\nRevert (2026-10-20) — a compensating change, and whether the saved model kept a changeset");
        var result = JsonDocument.Parse("{\"applied\":[{\"proposal_guid\":\"g1\",\"revit_element_id\":5,\"revit_unique_id\":\"u1\"}," +
            "{\"proposal_guid\":\"g2\",\"revit_element_id\":6,\"revit_unique_id\":\"u2\",\"before\":{\"top_level\":\"L2\",\"top_offset_mm\":-150,\"height_mm\":null}}," +
            "{\"proposal_guid\":\"g3\",\"revit_element_id\":7,\"revit_unique_id\":null,\"built\":{\"risers\":null}}]}").RootElement.Clone();
        var cs = new ChangesetDto { Id = "c-1", Name = "Promote (DD) · L1", Result = result };
        var applied = RevertPlan.Applied(cs);
        Ok(applied.Count == 3 && applied[1].Before?.TopLevel == "L2" && applied[1].Before.TopOffsetMm == -150 && applied[0].Before == null,
           "the applied rows are read from the stored result, an attach's top before with them (and an odd stair field does not break the read)");
        Ok(RevertPlan.Applied(new ChangesetDto()).Count == 0, "a changeset with no result has no applied rows");

        var a1 = applied[0];
        Ok(RevertPlan.NeverWhy(new ChangesetElementDto { Op = "rehost" }, a1)?.Contains("cannot bring it back") == true, "a rehost is never reverted, said");
        Ok(RevertPlan.NeverWhy(new ChangesetElementDto { Op = "create", Replaces = new ReplacesDto() }, a1)?.Contains("DirectShape") == true, "a create that replaced a DirectShape is never reverted, said");
        Ok(RevertPlan.NeverWhy(new ChangesetElementDto { Op = "attach" }, a1)?.Contains("not recorded") == true, "an attach applied before the top was recorded is kept, said");
        Ok(RevertPlan.NeverWhy(new ChangesetElementDto { Op = "attach" }, applied[1]) == null, "an attach whose top was recorded goes to Revit's checks");
        Ok(RevertPlan.NeverWhy(new ChangesetElementDto { Op = "create" }, applied[2])?.Contains("no Revit id") == true, "a row the bridge holds no Revit id for is kept");
        Ok(new[] { null, "create", "retype", "reshape", "set_parameter" }.All(op => RevertPlan.NeverWhy(new ChangesetElementDto { Op = op }, a1) == null)
           && RevertPlan.NeverWhy(new ChangesetElementDto { Op = "explode" }, a1) != null, "the known ops go to Revit's checks; an unknown op is kept, never guessed");

        Ok(RevertPlan.Reason("  ", out var p1) == null && p1.StartsWith("Type why"), "a revert needs a reason");
        Ok(RevertPlan.Reason(new string('x', 501), out var p2) == null && p2.Contains("500"), "a reason is at most 500 characters");
        Ok(RevertPlan.Reason(" wrong\r\nstorey\t ", out _) == "wrong storey", "a reason is one line, trimmed");

        Ok(RevertPlan.State(cs) == "not yet seen saved", "a changeset no save has confirmed says so");
        cs.Persisted = new PersistedDto { State = "lost", How = "reopened", Missing = 4 };
        Ok(RevertPlan.State(cs).StartsWith("NOT in the saved model (4 element(s)) — closed without saving"), "a lost changeset says it is not in the saved model, and why it may be");
        cs.Persisted = new PersistedDto { State = "confirmed", How = "synced" };
        cs.Reverted = new RevertedDto { By = "lead@office", Kept = 2 };
        Ok(RevertPlan.State(cs) == "reverted by lead@office (2 row(s) kept as they stood) — revert not yet seen saved · as applied: synchronised with central", "a revert and the sync are both said");
        // a revert's own save (2026-10-20, spec 2026-10-20-apply-claim-isolation-revert-saved-design.md §4)
        cs.Reverted.Persisted = new PersistedDto { State = "confirmed", How = "saved" };
        Ok(RevertPlan.State(cs).StartsWith("reverted by lead@office (2 row(s) kept as they stood) — revert saved in the model ·"), "a revert seen saved says so");
        cs.Reverted.Persisted = new PersistedDto { State = "lost", How = "reopened", Missing = 1 };
        Ok(RevertPlan.State(cs).Contains("— revert NOT in the saved model (1 row(s) back) — closed without saving, or Revit stopped"), "a revert lost by an unsaved close says so");
        var stamp = ProvenanceStamp.Json("c-1", "promote", new[] { "g1", "g2" }, "u1");
        var marked = ProvenanceStamp.MarkReverted(stamp, "c-1", "g1");
        Ok(ProvenanceStamp.IsReverted(marked, "c-1", "g1") && !ProvenanceStamp.IsReverted(marked, "c-1", "g2") && !ProvenanceStamp.IsReverted(stamp, "c-1", "g1")
           && !ProvenanceStamp.IsReverted(marked, "c-2", "g1") && ProvenanceStamp.Holds(marked, "c-1", "g1"),
           "the revert mark names its changeset and row only; the stamp still holds the changeset");
        Ok(ProvenanceStamp.MarkReverted(marked, "c-1", "g1") == marked && ProvenanceStamp.MarkReverted("not json", "c-1", "g1") == "not json" && ProvenanceStamp.MarkReverted(null, "c-1", "g1") == null,
           "marking twice is one mark; an unreadable stamp is left as it is");
        Ok(ProvenanceStamp.IsReverted(ProvenanceStamp.Json("c-3", "agent", new[] { "x" }, "u1", marked), "c-1", "g1")
           && !ProvenanceStamp.IsReverted(ProvenanceStamp.Json("c-3", "agent", new[] { "x" }, "u9", marked), "c-1", "g1"),
           "a later changeset's stamp keeps the revert mark (a copy's stamp, another UniqueId, starts afresh)");
        Ok(ChangesetTrust.ClaimRefused("Bridge 409: \"L1\" is being applied by ana on DESK-01 (since 10:02 UTC) — nothing was changed; try again when they finish, or after 10:32 UTC")
           == "Not applied — \"L1\" is being applied by ana on DESK-01 (since 10:02 UTC) — nothing was changed; try again when they finish, or after 10:32 UTC\n\nNothing was changed in the model; the proposals are still pending.",
           "a refused apply claim says who is applying it and where, in the bridge's words");
        Ok(RevertPlan.Preview(3, new List<(string, string)> { ("create wall \"W1\"", "was moved by hand") }) == "3 row(s) go back to how they were before this changeset. 1 kept as they stand:\n• create wall \"W1\": was moved by hand",
           "the preview counts what goes back and names each row kept, with why");
        Ok(RevertPlan.Preview(0, new List<(string, string)>()).StartsWith("Nothing would go back"), "a preview where nothing goes back says so");

        var rev = new UndoWatcher.Entry { Inverse = true };
        Ok(UndoWatcher.PostFor(rev, "undo") == ("redo", null) && UndoWatcher.PostFor(rev, "redo") == ("undo", "revert")
           && UndoWatcher.PostFor(new UndoWatcher.Entry(), "undo") == ("undo", null), "Ctrl+Z of a revert posts a redo; Ctrl+Y posts the revert again; a changeset's own Undo is unchanged");
        Ok(UndoWatcher.RevertTxName("A", "0123456789") == "Sentinel revert: A [01234567]", "the revert's Undo entry is named for the watcher");

        // "applied, then saved": what each event posts, and the records on this PC
        var r = new SavedCheck.Record { Key = "k", ChangesetId = "c-1", Name = "A", Path = @"C:\m\a.rvt", Applied = { new SavedCheck.Row { ProposalGuid = "g1", RevitUniqueId = "u1" }, new SavedCheck.Row { ProposalGuid = "g2", RevitUniqueId = "u2" } } };
        Ok(SavedCheck.Decide("saved", false, r) == ("saved", true) && SavedCheck.Decide("synced", true, r) == ("synced", true)
           && SavedCheck.Decide("opened", false, r) == ("reopened", true), "a save, a sync and a reopening each post once and the record goes");
        Ok(SavedCheck.Decide("saved", true, r) == ("saved_locally", false), "a workshared local save confirms locally and waits for the sync");
        r.SavedLocally = true;
        Ok(SavedCheck.Decide("saved", true, r) == (null, false) && SavedCheck.Decide("opened", true, r) == (null, false) && SavedCheck.Decide("synced", true, r) == ("synced", true),
           "after a local save, only the sync posts again");
        var (held, missing) = SavedCheck.Split(r, a => a.RevitUniqueId == "u1");
        Ok(held.SequenceEqual(new[] { "g1" }) && missing.SequenceEqual(new[] { "g2" }), "the rows are split by what the model holds");
        Ok(SavedCheck.Words(r, "reopened", 0, 2, "ledger #9", null) == "Saved check: \"A\" — 2 of 2 element(s) are NOT in the model as reopened (it was closed without saving, or Revit stopped): changeset_lost (ledger #9).",
           "a lost changeset is said in words, with its ledger row");
        Ok(SavedCheck.Words(r, "saved", 2, 0, "ledger #8", null).Contains("changeset_confirmed (ledger #8)") && SavedCheck.Words(r, "saved", 2, 0, null, "Bridge 503: down").Contains("NOT recorded"),
           "a confirmed one too; a post that failed says it is kept and checked again");
        Ok(SavedCheck.ForGood("Bridge 409: x") && SavedCheck.ForGood("Bridge 400: x") && !SavedCheck.ForGood("Bridge 503: x") && !SavedCheck.ForGood(null), "only a refusal that never heals drops the record");

        var root = Path.Combine(Path.GetTempPath(), "revert-check-" + Guid.NewGuid().ToString("N"));
        string wasSaved = SavedCheck.Root, wasRevert = RevertPlan.Root;
        SavedCheck.Root = Path.Combine(root, "unsaved"); RevertPlan.Root = Path.Combine(root, "reverts");
        try
        {
            var u = new UnreportedResults.Record { Key = "k", ChangesetId = "c-1", Name = "A", Path = @"C:\m\a.rvt", Applied = { new AppliedEntry { ProposalGuid = "g1", RevitUniqueId = "u1" } } };
            Ok(SavedCheck.Remember(u) && SavedCheck.ForPath(@"c:\M\A.RVT").Single().Applied.Single().RevitUniqueId == "u1",
               "a result the bridge took is remembered with its file, found again whatever the path's casing");
            Ok(!SavedCheck.Remember(new UnreportedResults.Record { Key = "k", ChangesetId = "c-2", Path = "", Applied = u.Applied })
               && !SavedCheck.Remember(new UnreportedResults.Record { Key = "k", ChangesetId = "c-3", Path = @"C:\m\a.rvt" }),
               "a model never saved, or a result that applied nothing, is not remembered");
            Ok(SavedCheck.ForPath(@"C:\m\b.rvt").Count == 0, "another file's records are not its");
            Ok(SavedCheck.Repath(@"C:\M\A.rvt", @"C:\m\REV_ARC_ZZ_XX_M3_A_0001.rvt") == 1 && SavedCheck.ForPath(@"C:\m\a.rvt").Count == 0
               && SavedCheck.ForPath(@"C:\m\REV_ARC_ZZ_XX_M3_A_0001.rvt").Single().ChangesetId == "c-1"
               && SavedCheck.Repath("", @"C:\m\x.rvt") == 0 && SavedCheck.Repath(@"C:\m\x.rvt", @"C:\m\x.rvt") == 0,
               "Save As (drill REV WS-4): the records follow the model to its new file; a never-saved model or the same path moves none");
            SavedCheck.Forget("k", "c-1");
            Ok(SavedCheck.ForPath(@"C:\m\a.rvt").Count == 0, "a record goes once posted");
            // a revert's own save (2026-10-20): its own record beside the changeset's, posted with of "revert"
            Ok(SavedCheck.RememberRevert("k", "c-1", "A", @"C:\m\a.rvt", new[] { new SavedCheck.Row { ProposalGuid = "g1", RevitUniqueId = "u1" } })
               && SavedCheck.Remember(u) && SavedCheck.ForPath(@"C:\m\a.rvt").Count(x => x.Revert) == 1 && SavedCheck.ForPath(@"C:\m\a.rvt").Count == 2
               && File.Exists(SavedCheck.PathFor("k", "c-1", true)),
               "a revert is remembered as its own record (<id>.revert.json), beside the changeset's");
            Ok(!SavedCheck.RememberRevert("k", "c-4", "B", "", new[] { new SavedCheck.Row { ProposalGuid = "g1" } }) && !SavedCheck.RememberRevert("k", "c-4", "B", @"C:\m\a.rvt", new SavedCheck.Row[0]),
               "a revert in a model never saved, or of no row, is not remembered");
            var rv = SavedCheck.ForPath(@"C:\m\a.rvt").Single(x => x.Revert);
            Ok(SavedCheck.Words(rv, "saved", 1, 0, "ledger #7", null) == "Saved check: the revert of \"A\" — all 1 row(s) are still reverted in the model as saved: changeset_revert_confirmed (ledger #7)."
               && SavedCheck.Words(rv, "reopened", 0, 1, "ledger #8", null).Contains("1 of 1 row(s) are back as the changeset set them in the model as reopened (it was closed without saving, or Revit stopped): changeset_revert_lost (ledger #8)"),
               "a revert's saved check is said as the revert's");
            SavedCheck.Forget("k", "c-1", true); SavedCheck.Forget("k", "c-1");
            Ok(SavedCheck.ForPath(@"C:\m\a.rvt").Count == 0, "each record goes on its own");

            var rr = new RevertPlan.Record { Key = "k", ChangesetId = "c-1", Name = "A", Guids = { "g1" }, Kept = { new KeptRow { ProposalGuid = "g2", Why = "moved" } }, Reason = "wrong storey", Tx = "Sentinel revert: A [c-1]" };
            Ok(RevertPlan.Write(rr) && RevertPlan.ForKey("k").Single().Kept.Single().Why == "moved" && RevertPlan.ForKey("other").Count == 0,
               "a revert the bridge has not recorded is kept on this PC, under its project");
            RevertPlan.Delete("k", "c-1");
            Ok(RevertPlan.ForKey("k").Count == 0, "and goes once recorded");
        }
        finally
        {
            SavedCheck.Root = wasSaved; RevertPlan.Root = wasRevert;
            try { Directory.Delete(root, true); } catch (Exception) { /* a temp folder */ }
        }

        // the body the bridge reads
        Ok(JsonSerializer.Serialize(new AppliedEntry { ProposalGuid = "g", RevitElementId = 1, RevitUniqueId = "u", Before = new AttachBeforeDto { HeightMm = 3000 } }, ChangesetClient.WriteJson)
           == "{\"proposal_guid\":\"g\",\"revit_element_id\":1,\"revit_unique_id\":\"u\",\"before\":{\"height_mm\":3000}}"
           && !JsonSerializer.Serialize(new AppliedEntry { ProposalGuid = "g" }, ChangesetClient.WriteJson).Contains("before"),
           "an attach's top before rides on its applied row; every other row's body is unchanged");
    }
}
