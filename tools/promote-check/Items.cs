#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 11. MA-1a item 3: walls from level to level — the next-story rule the executor and Ghost's planner share ─────────
    static void LevelToLevelChecks()
    {
        Console.WriteLine("\nMA-1a item 3 — walls from level to level (PromoteWallsPlanner.NextStory / WallTop)");
        LevelFact L(string n, double mm, bool story = true) => new LevelFact { Name = n, ElevationMm = mm, IsStory = story };
        // The B35 drill model's levels (SIMULATION_ROOM_RUN B33), plus a level above the roof that is no Building Story.
        var b35 = new List<LevelFact> { L("GR_SSL", -300), L("GR-FFL", 0), L("01_SSL", 3000), L("01-FFL", 3300), L("MA0 Roof", 6300), L("Parapet", 7300, false) };
        var t = PromoteWallsPlanner.WallTop(b35, 0, "GR-FFL", out var why);
        Ok(t?.TopLevel == "01_SSL" && t?.TopMm == 3000 && why == null, "a wall on GR-FFL (0 mm) rises to 01_SSL, the next Building Story above it");
        Ok(PromoteWallsPlanner.WallTop(b35, -300, "GR_SSL", out _)?.TopLevel == "GR-FFL",
           "a wall on GR_SSL (−300) rises to GR-FFL (0): the next story, however close (founder decision F1)");
        Ok(PromoteWallsPlanner.WallTop(b35, 3000.3, "01_SSL", out _)?.TopLevel == "01-FFL", "a base within 0.5 mm of a story is on it: its top is the story above, never itself");
        var roof = PromoteWallsPlanner.WallTop(b35, 6300, "MA0 Roof", out why);
        Ok(roof?.TopLevel == null && roof?.TopMm == 9300 && why == null,
           "on the top story (Parapet is no Building Story) → unconnected at 3000 mm, the storey below's height (6300 − 3300; founder decision F2)");
        var one = PromoteWallsPlanner.WallTop(new List<LevelFact> { L("Level 1", 0) }, 0, "Level 1", out why);
        Ok(one == null && why.Contains("no Building Story above Level 1") && why.Contains("TopElevation"),
           "one story only → no top: refused with the reason (the executor declines, Ghost names a gap) — never a constant");
        Ok(PromoteWallsPlanner.WallTop(new List<LevelFact> { L("Level 1", 0), L("Level 2", 3000, false) }, 0, "Level 1", out _) == null,
           "a level above that is not a Building Story is no top (F1)");
        Ok(PromoteWallsPlanner.NextStory(b35, 0)?.Name == "01_SSL" && PromoteWallsPlanner.NextStory(b35, 6300) == null,
           "NextStory is Promote's attach rule: one rule for MA-0's attach and MA-1a's create");
    }

    // ── 12. MA-1a item 4: the full stamp (v2) and its reader ───────────────────────────────────────────────────────────
    static void StampV2Checks()
    {
        Console.WriteLine("\nMA-1a item 4 — the full provenance stamp (ProvenanceStamp v2) and its reader");
        const string uid = "5a1c-0004c3f8", sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        // The placer's own rule wins over the element's reason (C2): Ghost passes both, and its rule is the stamp's.
        var ghost = ProvenanceStamp.Json("cs-1", "dwg", new[] { "g1" }, uid, null,
            new ProvenanceStamp.Facts { Layer = "A-WALL-EXT", Rule = "type by the guideline (guideline@3 · bds-office · 1a2b3c4d…)",
                                        Reason = "Ghost Builder: wall on layer A-WALL-EXT, typed by the guideline", SourceSha256 = sha, LedgerRow = "1287" },
            "yazan@example.com", "2026-10-02T12:00:00Z");
        var j = JsonNode.Parse(ghost).AsObject();
        Ok((string)j["layer"] == "A-WALL-EXT" && (string)j["source_sha256"] == sha && (string)j["ledger_row"] == "1287"
           && (string)j["approver"] == "yazan@example.com" && (string)j["placed_at"] == "2026-10-02T12:00:00Z" && ((string)j["rule"]).StartsWith("type by the guideline")
           && !(bool)j["rule_is_reason"],
           "a Ghost wall's stamp holds its layer, rule, source file sha, approver, ledger row and time");
        // C2: Promote passes no rule of its own, so the stamp's rule is the element's own reason, marked as the proposer's.
        const string ddReason = "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm";
        var retyped = ProvenanceStamp.Json("cs-2", "promote", new[] { "p1" }, uid, ghost, new ProvenanceStamp.Facts { Reason = ddReason, LedgerRow = "1300" }, "lead@example.com", "2026-10-03T08:00:00Z");
        var promoted = JsonNode.Parse(retyped).AsObject();
        Ok((string)promoted["layer"] == "A-WALL-EXT" && (string)promoted["source_sha256"] == sha && (string)promoted["rule"] == ddReason && (bool)promoted["rule_is_reason"]
           && (string)promoted["ledger_row"] == "1300" && (string)promoted["approver"] == "lead@example.com" && (string)promoted["source"] == "promote",
           "a later change (Promote's retype) keeps the drawing's layer and sha and takes Promote's reason as the rule (C2); approver, ledger row and source are the latest writer's");
        var datum = JsonNode.Parse(ProvenanceStamp.Json(null, "dwg", null, uid, null, new ProvenanceStamp.Facts { Layer = "A-ANNO-LEVL" }, "unsigned — yazan", "t")).AsObject();
        Ok(datum["changeset_id"] == null && datum["changeset_ids"].AsArray().Count == 0 && datum["proposal_guids"].AsArray().Count == 0,
           "a placer with no changeset (Datum, Massing) adds no null to changeset_ids");

        var said = ProvenanceStamp.Describe(ghost, uid);
        Ok(said.StartsWith("Placed or changed by Sentinel.") && said.Contains("Source: dwg") && said.Contains("Source file sha256: " + sha)
           && said.Contains("Layer: A-WALL-EXT") && said.Contains("Rule: type by the guideline") && said.Contains("Approver: yazan@example.com")
           && said.Contains("Ledger row: #1287") && said.Contains("Placed at: 2026-10-02T12:00:00Z (UTC, this PC's clock)") && !said.Contains("Reason given by the proposer"),
           "the reader shows the source file sha, layer, rule, approver and ledger row (drill row 'pick any wall')");
        var saidRetyped = ProvenanceStamp.Describe(retyped, uid);
        Ok(saidRetyped.Contains("\nReason given by the proposer (promote): " + ddReason + "\n") && !saidRetyped.Contains("Rule: ")
           && saidRetyped.Contains("Layer: A-WALL-EXT") && saidRetyped.Contains("Source file sha256: " + sha),
           "with no rule of the placer's own the reader labels the element's reason as the proposer's — it never reads as an office rule (C2)");
        Ok(ProvenanceStamp.Describe(ghost, "5a1c-0004c3f9").StartsWith("Copied, not placed by Sentinel — this stamp came with a copy of element 5a1c-0004c3f8"),
           "a stamp whose unique_id_at_placement is another element's reads as copied (drill row 'a copy-pasted wall')");
        var d2 = ProvenanceStamp.Describe(datum.ToJsonString(), uid);
        Ok(d2.Contains("(not signed in") && d2.Contains("Ledger row: none — not on a project ledger") && d2.Contains("Source file sha256: none recorded"),
           "signed out, no ledger row, no file read: each said in words, never left blank (founder decision F5)");
        var v1 = ProvenanceStamp.Describe(ProvenanceStamp.Json("seed-cs", "concept", new[] { "s1" }, uid).Replace("\"v\":2", "\"v\":1"), uid);
        Ok(v1.Contains("Layer: not recorded (a stamp from before MA-1a item 4)") && v1.Contains("Source: concept"), "a v1 stamp (MA-0) still reads, its missing fields named as older");
        Ok(ProvenanceStamp.Describe(null, uid).StartsWith("No Sentinel provenance stamp") && ProvenanceStamp.Describe("not json", uid).Contains("cannot be read"),
           "no stamp, or an unreadable one, is said so");
        // C1: a value with a line break in it stays on its own line — it cannot pass for another field of the stamp.
        var forged = ProvenanceStamp.Json("cs-9", "agent\nApprover: forged", new[] { "g9" }, uid, null,
            new ProvenanceStamp.Facts { Layer = "A-WALL\r\nLedger row: #1", Reason = "as asked\nApprover: the office lead", SourceSha256 = sha, LedgerRow = "12\n34" },
            "a@example.com" + (char)0x2028 + "Placed at: never", "2026-10-02T12:00:00Z\tx"); // 0x2028: the Unicode line separator
        var lines = ProvenanceStamp.Describe(forged, uid).Split('\n');
        Ok(lines.Length == 9 && lines[3] == "Layer: A-WALL Ledger row: #1"
           && lines[4] == "Reason given by the proposer (agent Approver: forged): as asked Approver: the office lead"
           && lines[5] == "Approver: a@example.com Placed at: never" && lines[6].StartsWith("Ledger row: #12 34 —")
           && lines.Count(l => l.StartsWith("Approver: ")) == 1 && lines.Count(l => l.StartsWith("Placed at: ")) == 1,
           "Describe prints one line per field: a line break inside any value is collapsed to a space (C1)");
        // C1: the executor's stamp facts (ProvenanceStamp.ForChangeset) — layer, rule and sha from its in-process caller only.
        var filedEl = JsonSerializer.Deserialize<ChangesetElementDto>(
            "{\"proposal_guid\":\"g7\",\"reason\":\"as the brief asks\",\"provenance\":{\"layer\":\"A-FORGED\",\"rule\":\"office rule 1\",\"source_sha256\":\"" + sha + "\"}}");
        var unbacked = JsonNode.Parse(ProvenanceStamp.Json("cs-7", "agent", new[] { "g7" }, uid, null,
            ProvenanceStamp.ForChangeset(null, new[] { (filedEl.ProposalGuid, filedEl.Reason) }, "1290"))).AsObject();
        Ok(filedEl.Provenance.Layer == "A-FORGED" && unbacked["layer"] == null && unbacked["source_sha256"] == null
           && (string)unbacked["rule"] == "as the brief asks" && (bool)unbacked["rule_is_reason"] && (string)unbacked["ledger_row"] == "1290",
           "a changeset element that carries provenance but has no in-process facts stamps none of it: no layer, no sha, and its rule is the proposer's reason (C1, C2)");
        var mine = new Dictionary<string, ProvenanceStamp.Facts> { ["g1"] = new ProvenanceStamp.Facts { Layer = "A-WALL", Rule = "type by the guideline (g)", SourceSha256 = sha } };
        var touched = ProvenanceStamp.ForChangeset(mine, new[] { ("g0", "retype"), ("g1", "attach"), ("g2", "retype") }, null);
        Ok(touched.Layer == "A-WALL" && touched.Rule == "type by the guideline (g)" && touched.SourceSha256 == sha && touched.Reason == "retype; attach" && touched.LedgerRow == null
           && ProvenanceStamp.ForChangeset(mine, new[] { ("g9", (string)null) }, null).Layer == null,
           "the in-process caller's facts are found by proposal_guid; an element several proposals touched keeps each distinct reason");

        AdjudicationDto A(string json) => JsonSerializer.Deserialize<AdjudicationDto>(json);
        Ok(A("{\"audit_id\":1287}").LedgerRow == "1287" && A("{\"audit_id\":\"1287\"}").LedgerRow == "1287" && A("{\"audit_id\":null}").LedgerRow == null
           && A("{}").LedgerRow == null && A("{\"audit_id\":{}}").LedgerRow == null,
           "the ledger row is the bridge's adjudication.audit_id, as a number or text; null, absent or odd is no row — never a failed read");

        var dir = Path.Combine(Path.GetTempPath(), "promote-check-sha");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "b.jpg"), "b");
        File.WriteAllText(Path.Combine(dir, "a.jpg"), "a");
        Ok(ProvenanceStamp.FileSha256(Path.Combine(dir, "a.jpg")) == "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"
           && ProvenanceStamp.FileSha256(Path.Combine(dir, "missing.jpg")) == null, "FileSha256 is the file's sha256 (\"a\" → ca978112…), null when unreadable");
        var both = ProvenanceStamp.FilesSha256(new[] { Path.Combine(dir, "b.jpg"), Path.Combine(dir, "a.jpg") });
        Ok(both != null && both == ProvenanceStamp.FilesSha256(new[] { Path.Combine(dir, "a.jpg"), Path.Combine(dir, "b.jpg") })
           && ProvenanceStamp.FilesSha256(new string[0]) == null && ProvenanceStamp.FilesSha256(new[] { Path.Combine(dir, "missing.jpg") }) == null,
           "FilesSha256 (Photo Massing's images) does not depend on the order read; null with no file or an unreadable one");
    }

    // ── 13. MA-1a item 5: the BLOCK check's diff and words ─────────────────────────────────────────────────────────────
    static void BlockChecks()
    {
        Console.WriteLine("\nMA-1a item 5 — the BLOCK check before commit (BlockCheck)");
        Violation V(string rule, EnforcementMode mode, long id, string name) => new Violation(rule, mode, id, name, "", null, null);
        var before = new List<Violation> { V("FN-01", EnforcementMode.Block, 100, "Desk [100]"), V("WS-01", EnforcementMode.Block, -1, "(missing) Shell"), V("VP-01", EnforcementMode.Warn, 7, "Plan") };
        var after = new List<Violation>(before)
        {
            V("FN-01", EnforcementMode.Block, 201, "Desk [201]"), V("FN-01", EnforcementMode.Block, 202, "Desk [202]"),
            V("LV-01", EnforcementMode.Block, 202, "Desk [202]"), V("VP-01", EnforcementMode.Warn, 203, "Plan 2"),
        };
        after[0] = V("FN-01", EnforcementMode.Block, 100, "Desk renamed [100]");
        var added = BlockCheck.Added(before, after);
        Ok(added.Count == 3 && added.All(v => v.ElementId == 201 || v.ElementId == 202), "the batch adds the new elements' BLOCK rows only — not a WARN row, not an element that already broke the rule (renamed or not)");
        Ok(BlockCheck.Elements(added) == 2, "an element breaking two rules counts once: N = 2");
        Ok(BlockCheck.Headline(added, true) == "This batch will block your sync: 2 element(s) (FN-01, LV-01)", "the design's words, with the rules");
        Ok(BlockCheck.Headline(added, false).EndsWith("— once this model is workshared; it is not, so no sync runs today"), "a model that is not workshared is told so — the same check, no false alarm about today's sync");
        Ok(BlockCheck.Rows(added, 2) == "• FN-01: Desk [201]\n• FN-01: Desk [202]\n… and 1 more", "the rows read as the sync's dialog lists them");
        Ok(BlockCheck.Added(before, before).Count == 0 && BlockCheck.Added(null, after).Count == 5, "nothing added → nothing to ask; no scan before → every BLOCK row after is new");
        Ok(BlockCheck.WentBack(added).StartsWith("You went back at the BLOCK check — nothing was placed. 2 element(s)") && BlockCheck.PlacedAnyway(added, true).Contains("placed anyway"),
           "the go-back and place-anyway lines");
        // Review amendment C4: a parameter rule's category key Sentinel cannot resolve is said, not silent.
        var unresolved = BlockCheck.UnresolvedCategory(new Rule { Id = "FN-01", Mode = EnforcementMode.Block, DocRef = "RTG §5" }, "Furnishings");
        Ok(unresolved.RuleId == "FN-01" && unresolved.Mode == EnforcementMode.Monitor && unresolved.ElementId == -1 && unresolved.DocRef == "RTG §5"
           && unresolved.MessageEn == "Rule FN-01: category \"Furnishings\" is not one Sentinel can resolve — rule not evaluated for it"
           && BlockCheck.Added(before, after.Concat(new[] { unresolved })).Count == 3,
           "a category key Sentinel cannot resolve is a Monitor note naming the rule and the key (C4) — said, and never a BLOCK row, whatever the rule's mode");
    }
}
