#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 2. the pure planner ────────────────────────────────────────────────────────────────────────────────────
    static readonly LevelFact[] Levels =
    {
        new LevelFact { Name = "Level 1", ElevationMm = 0, IsStory = true },
        new LevelFact { Name = "Ref", ElevationMm = 1500, IsStory = false },
        new LevelFact { Name = "Level 2", ElevationMm = 3000, IsStory = true },
        new LevelFact { Name = "Roof", ElevationMm = 6000, IsStory = true },
    };
    // The document's basic wall types → their Function.
    static readonly IReadOnlyDictionary<string, string> DocTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["Generic - 200mm"] = "Exterior", ["Generic - 125mm"] = "Exterior", ["Generic - 300mm"] = "Exterior",
        ["MA0 Interior - 100mm"] = "Interior", ["BDS_EXT_ARC_CMU_200 mm"] = "Exterior", ["BDS_INT_ARC_GYPS_100 mm"] = "Interior",
    };

    static int _uid;
    static WallFact W(string label, string type, string function, double mm, string baseLevel = "Level 1", string top = null,
                      double baseOff = 0, double topOff = 0, bool basic = true, bool group = false, string stamp = null,
                      double height = 0, bool structural = false) => new WallFact
    {
        UniqueId = $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{++_uid:x8}", Label = label, TypeName = type, Function = function,
        WidthMm = mm, BaseLevel = baseLevel, TopLevel = top, BaseOffsetMm = baseOff, TopOffsetMm = topOff,
        IsBasic = basic, InGroup = group, Stamp = stamp, HeightMm = height, Structural = structural,
    };

    static void Planner(GuidelineMatcher m)
    {
        Console.WriteLine("\nPlanner (PromoteWallsPlanner.Plan / Bodies)");
        var walls = new List<WallFact>
        {
            W("E1", "Generic - 200mm", "Exterior", 200),
            W("I1", "MA0 Interior - 100mm", "Interior", 100),
            W("G1", "Generic - 125mm", "Exterior", 125),
            W("X1", "Generic - 300mm", "Exterior", 300, top: "Level 2"),
            W("OK1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2", stamp: "{\"v\":1,\"source\":\"promote\"}"),
            W("SEED1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2", stamp: "{\"v\":1,\"source\":\"concept\"}"),
            W("CORE1", "Generic - 200mm", "Exterior", 200, top: "Roof"),
            W("TALL1", "Generic - 200mm", "Exterior", 200, height: 7000),
            W("LOW1", "Generic - 200mm", "Exterior", 200, top: "Level 2", topOff: -250),
            W("OFF1", "Generic - 200mm", "Exterior", 200, baseOff: 100),
            W("FR1", "Generic - 200mm", "Exterior", 200.4),
            W("GRP1", "Generic - 200mm", "Exterior", 200, group: true),
            W("CW1", "Curtain Wall", "Exterior", 0, basic: false),
            W("FD1", "Generic - 200mm", "Foundation", 200),
            W("L2a", "Generic - 200mm", "Exterior", 200, baseLevel: "Level 2"),
            W("L2b", "Generic - 200mm", "Exterior", 200, baseLevel: "Level 2", top: "Roof"),
            W("R1", "Generic - 200mm", "Exterior", 200, baseLevel: "Roof"),
            W("REF1", "Generic - 200mm", "Exterior", 200, baseLevel: "Ref"),
        };
        var plans = PromoteWallsPlanner.Plan(walls, Levels, DocTypes, m);
        StoreyPlan P(string s) => plans.FirstOrDefault(x => x.Storey == s);
        PromoteGhost G(StoreyPlan p, string op, string label) => p.Ghosts.FirstOrDefault(g => g.Op == op && g.Label == label);
        PromoteHeld H(StoreyPlan p, string label, string has) => p.Held.FirstOrDefault(h => h.Label == label && h.Reason.Contains(has));

        Ok(string.Join(",", plans.Select(p => p.Storey)) == "Level 1,Ref,Level 2,Roof", "one plan per base level, by elevation");
        var l1 = P("Level 1");
        var e1 = G(l1, "retype", "E1");
        Ok(e1 != null && e1.TypeBefore == "Generic - 200mm" && e1.TypeName == "BDS_EXT_ARC_CMU_200 mm"
           && e1.Reason == "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm",
           "Exterior 200 → retype to BDS_EXT_ARC_CMU_200 mm with type_before and its reason");
        var i1 = G(l1, "retype", "I1");
        Ok(i1 != null && i1.TypeBefore == "MA0 Interior - 100mm" && i1.TypeName == "BDS_INT_ARC_GYPS_100 mm", "Interior 100 → retype to BDS_INT_ARC_GYPS_100 mm");
        var a1 = G(l1, "attach", "E1");
        Ok(a1 != null && a1.BaseLevel == "Level 1" && a1.TopLevel == "Level 2" && a1.Reason == "DD: top to next story Level 2 +0 (was unconnected)",
           "an unconnected wall → attach to the next story (Level 2, skipping the non-story Ref)");
        Ok(l1.Ghosts.TakeWhile(g => g.Op == "retype").Count() == l1.Ghosts.Count(g => g.Op == "retype"), "retypes come before attaches");
        Ok(H(l1, "X1", "\"BDS_EXT_ARC_CMU_300 mm\" is in the catalogue but not loaded in this model — Sentinel creates no types") != null
           && G(l1, "retype", "X1") == null, "a target type missing from the document is held; no type is created");
        var g1 = H(l1, "G1", "gap: G1 (Generic - 125mm, Exterior)");
        Ok(g1 != null && g1.Reason.Contains(m.CatalogLabel) && G(l1, "retype", "G1") == null && G(l1, "attach", "G1") != null,
           "a 125 mm wall is held with a gap naming the catalogue — its attach is still planned");
        Ok(G(l1, "retype", "OK1") == null && G(l1, "attach", "OK1") == null && !l1.Held.Any(h => h.Label == "OK1"),
           "a wall already on its DD type with its top on the next story gets no ghost");
        Ok(l1.DdNow == 2 && l1.Stamped == 1, $"…and counts in DD now ({l1.DdNow}); stamped counts Promote's stamps only, not the seed's ({l1.Stamped})");
        Ok(H(l1, "CORE1", "top (Roof +0) is above Level 2 — attaching would cut the wall down to one storey; a person decides") != null
           && G(l1, "attach", "CORE1") == null && G(l1, "retype", "CORE1") != null, "a wall that spans two storeys is held, never cut down (its retype stays)");
        Ok(H(l1, "TALL1", "top (unconnected, 7000 mm high) is above Level 2") != null && G(l1, "attach", "TALL1") == null,
           "…and so is an unconnected wall taller than its storey");
        Ok(G(l1, "attach", "LOW1") != null && G(l1, "attach", "E1") != null, "a top below the next story (or unconnected, lower) is attached up to it");
        Ok(H(l1, "OFF1", "base offset 100 mm — attaching would move the wall") != null && G(l1, "attach", "OFF1") == null
           && G(l1, "retype", "OFF1") != null, "a base offset other than 0 holds the attach (the retype stays)");
        Ok(H(l1, "FR1", "width 200.4 mm is not a whole millimetre — exact match only (D16)") != null && G(l1, "retype", "FR1") == null,
           "a width that is not a whole mm is held");
        Ok(H(l1, "GRP1", "in a group") != null && !l1.Ghosts.Any(g => g.Label == "GRP1"), "a group member is held, nothing proposed");
        Ok(H(l1, "CW1", "not a basic wall") != null && !l1.Ghosts.Any(g => g.Label == "CW1"), "a non-Basic wall is held, nothing proposed");
        Ok(H(l1, "FD1", "no DD rule for Function Foundation in BDS DD walls v0 (MA-0)") != null, "no DD rule for its Function → held");
        Ok(H(P("Ref"), "REF1", "is not a Building Story") != null && P("Ref").Ghosts.Count == 0, "a wall based on a non-story level is held");

        var l2 = P("Level 2");
        Ok(l2.Ghosts.All(g => g.Op == "attach") && G(l2, "attach", "L2a")?.TopLevel == "Roof" && G(l2, "attach", "L2b") == null
           && l2.Held.Count(h => h.Reason.Contains("inside cannot be told from outside")) == 2,
           "a storey where every wall has one type holds all its retypes but keeps its attaches");
        var roof = P("Roof");
        Ok(G(roof, "retype", "R1") != null && G(roof, "attach", "R1") == null && H(roof, "R1", "no story level above Roof") != null,
           "the top storey holds the attach but still plans the retype");

        // 201 ghosts → 2 bodies; the exceptions ride on the first only
        var many = Enumerable.Range(0, 101).Select(i => W("M" + i, "Generic - 200mm", "Exterior", 200, top: "Level 2"))
            .Concat(Enumerable.Range(0, 100).Select(i => W("N" + i, "MA0 Interior - 100mm", "Interior", 100, top: "Level 2")))
            .Append(W("GAP", "Generic - 125mm", "Exterior", 125, top: "Level 2")).ToList();
        var big = PromoteWallsPlanner.Plan(many, Levels, DocTypes, m).Single();
        var bodies = Json(PromoteWallsPlanner.Bodies(new[] { big }, "yazan"));
        Ok(big.Ghosts.Count == 201 && bodies.Count == 2
           && bodies[0]["elements"].AsArray().Count == 200 && bodies[1]["elements"].AsArray().Count == 1,
           "201 ghosts → 2 bodies (200 + 1)");
        Ok(bodies[0]["exceptions"]?.AsArray().Count == 1 && bodies[1]["exceptions"] == null,
           "…the exceptions ride on the first body only");
        Ok((string)bodies[0]["name"] == "Promote walls (DD) · Level 1 (1/2)" && (string)bodies[1]["name"] == "Promote walls (DD) · Level 1 (2/2)",
           "…each named with its storey and part");
        Ok(bodies[0]["exceptions"][0]["reason"].GetValue<string>().Length <= 300, "an exception reason fits the bridge's 300-character cap");
        Ok(PromoteWallsPlanner.Bodies(new[] { P("Ref") }, "yazan").Count == 0, "a storey with no ghosts files nothing (a changeset needs an element)");

        // Every held wall reaches a filed changeset: a storey with no ghosts rides on the first body, named with its storey.
        var all = Json(PromoteWallsPlanner.Bodies(plans, "yazan"));
        Ok(all[0]["exceptions"].AsArray().Any(x => (string)x["name"] == "Ref · REF1")
           && all.Skip(1).All(b => b["exceptions"] == null || !b["exceptions"].AsArray().Any(x => ((string)x["name"]).StartsWith("Ref · "))),
           "the held walls of a storey with no ghosts ride on the first body filed, named with their storey");
        Ok(all.Sum(b => b["exceptions"]?.AsArray().Count ?? 0) == plans.Sum(p => p.Held.Count), "…so every held row is filed once");

        // Chunked by wall: 150 walls x (retype + attach) + 1 = 302 ghosts → 200 + 102, and no wall in two changesets.
        var pairs = Enumerable.Range(0, 150).Select(i => W("P" + i, "Generic - 200mm", "Exterior", 200))
            .Append(W("Q", "MA0 Interior - 100mm", "Interior", 100)).ToList();
        var two = Json(PromoteWallsPlanner.Bodies(PromoteWallsPlanner.Plan(pairs, Levels, DocTypes, m), "yazan"));
        var uids = two.Select(b => b["elements"].AsArray().Select(e => (string)e["target"]["unique_id"]).Distinct().ToList()).ToList();
        Ok(two.Count == 2 && two[0]["elements"].AsArray().Count == 200 && two[1]["elements"].AsArray().Count == 102
           && !uids[0].Intersect(uids[1]).Any(), "chunks keep each wall's retype and attach together (200 + 102, no wall split)");
        Ok(two.All(b => { var ops = b["elements"].AsArray().Select(e => (string)e["op"]).ToList(); return ops.TakeWhile(o => o == "retype").Count() == ops.Count(o => o == "retype"); }),
           "…retypes first in every chunk");

        // The bridge keeps at most 1000 exceptions on a changeset: the rest is one summary row.
        var crowd = new StoreyPlan { Storey = "L9" };
        crowd.Ghosts.Add(new PromoteGhost { Op = "attach", UniqueId = "u", Label = "A", BaseLevel = "L9", TopLevel = "L10" });
        crowd.Held.AddRange(Enumerable.Range(0, 1001).Select(i => new PromoteHeld { UniqueId = "h" + i, Label = "H" + i, Reason = "gap" }));
        var capped = Json(PromoteWallsPlanner.Bodies(new[] { crowd }, "yazan")).Single()["exceptions"].AsArray();
        Ok(capped.Count == PromoteWallsPlanner.MaxExceptions && (string)capped[999]["name"] == "… and 2 more" && (string)capped[998]["name"] == "H998",
           "1001 held rows → 999 rows + one \"… and 2 more\" row (the bridge's cap is 1000)");

        // No type catalogue: the matcher would answer the pattern unchecked — the type is held, the attach stays.
        var bare = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-walls-guideline.json")), null, out _, out _);
        var nc = PromoteWallsPlanner.Plan(new List<WallFact> { W("NC1", "Generic - 200mm", "Exterior", 200) }, Levels, DocTypes, bare).Single();
        Ok(nc.Ghosts.Count == 1 && nc.Ghosts[0].Op == "attach" && nc.Held.Single().Reason.StartsWith("no type catalogue installed"),
           "no type catalogue → the retype is held (\"no type catalogue installed\"), never matched unchecked");
    }

    // ── 2b. concept walls only (drill F1/F2): settled, office-typed and structural walls ───────────────────────
    static void ConceptOnly(GuidelineMatcher m)
    {
        Console.WriteLine("\nConcept walls only (drill F1/F2)");
        // This template gives BDS_INT_ARC_GYPS_100 mm the Function Exterior (as the BDS template did in the drill).
        var tpl = DocTypes.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);
        tpl["BDS_INT_ARC_GYPS_100 mm"] = "Exterior";
        var walls = new List<WallFact>
        {
            W("S1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("S2", "bds_ext_arc_cmu_200 mm", "Exterior", 200),
            W("FL1", "BDS_INT_ARC_GYPS_100 mm", "Exterior", 100, top: "Level 2"),
            W("OT1", "BDS_EXT_STR_CONC_200 mm", "Exterior", 200),
            W("OT2", "BDS_ÉXT_LSE_CONC_100 mm", "Exterior", 100),
            W("OT3", "BDS_INT_STR_CONC_200 mm", "Interior", 200, structural: true),
            W("ST1", "Generic - 200mm", "Exterior", 200, structural: true),
            W("C1", "Generic - 200mm", "Exterior", 200),
            W("C2", "MA0 Interior - 100mm", "Interior", 100),
        };
        var p = PromoteWallsPlanner.Plan(walls, Levels, tpl, m).Single();
        bool None(string label) => !p.Ghosts.Any(g => g.Label == label) && !p.Held.Any(h => h.Label == label);

        Ok(m.RuleProduces("Walls", "BDS_EXT_ARC_CMU_150 mm") && !m.RuleProduces("Walls", "BDS_EXT_ARC_CMU_ mm")
           && !m.RuleProduces("Walls", "BDS_EXT_STR_CONC_200 mm"), "RuleProduces: a rule's pattern with a number for {thickness}, nothing else");
        Ok(None("S1"), "a wall already on BDS_EXT_ARC_CMU_200 mm with its top attached gets no ghost, no held row");
        Ok(p.Ghosts.Count(g => g.Label == "S2") == 1 && p.Ghosts.Single(g => g.Label == "S2").Op == "attach" && !p.Held.Any(h => h.Label == "S2"),
           "…unattached, only its attach is planned (the type is settled, case-insensitively)");
        Ok(None("FL1"), "a wall on BDS_INT_ARC_GYPS_100 mm whose type says Exterior is settled — no CMU retype (the F2 flip)");
        Ok(None("OT1") && None("OT2") && None("OT3") && p.OfficeTyped == 3,
           $"walls on the office's other types (STR/LSE concrete, even structural) get nothing and no held row, and are counted ({p.OfficeTyped})");
        Ok(p.Held.Count == 1 && p.Held[0].Label == "ST1"
           && p.Held[0].Reason == "structural wall — Promote v0 does not retype or re-top structure; a person decides" && !p.Ghosts.Any(g => g.Label == "ST1"),
           "a structural concept wall is held whole: no retype, no attach");
        var c1 = p.Ghosts.FirstOrDefault(g => g.Op == "retype" && g.Label == "C1");
        var c2 = p.Ghosts.FirstOrDefault(g => g.Op == "retype" && g.Label == "C2");
        Ok(c1?.Note == null && c1?.Reason == "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm", "a concept wall still takes today's path");
        Ok(c2 != null && c2.TypeName == "BDS_INT_ARC_GYPS_100 mm" && c2.Note == "BDS_INT_ARC_GYPS_100 mm is Function Exterior in this model"
           && c2.Reason == "DD walls v0: Function Interior, 100 mm → BDS_INT_ARC_GYPS_100 mm — note: BDS_INT_ARC_GYPS_100 mm is Function Exterior in this model",
           "a retype onto a target of another Function in this model is still proposed, with the note on its reason");
        Ok(p.DdNow == 2 && p.Walls == 6, $"DD now {p.DdNow}/{p.Walls}: the office-typed walls are out of the denominator, the settled ones in");

        // The second run, after the first was applied: nothing to propose, and the gypsum partition stays gypsum.
        var after = new List<WallFact>
        {
            W("S1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("S2", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("FL1", "BDS_INT_ARC_GYPS_100 mm", "Exterior", 100, top: "Level 2"),
            W("OT1", "BDS_EXT_STR_CONC_200 mm", "Exterior", 200),
            W("ST1", "Generic - 200mm", "Exterior", 200, structural: true),
            W("C1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("C2", "BDS_INT_ARC_GYPS_100 mm", "Exterior", 100, top: "Level 2"),
        };
        var again = PromoteWallsPlanner.Plan(after, Levels, tpl, m).Single();
        Ok(again.Ghosts.Count == 0 && again.DdNow == 5 && again.Walls == 6 && again.OfficeTyped == 1,
           $"a second run proposes nothing (DD now {again.DdNow}/{again.Walls})");

        // The one-type hold (review fix): settled walls keep a half-promoted storey mixed; the office's other types do not.
        var half = PromoteWallsPlanner.Plan(new List<WallFact>
        {
            W("S1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("S2", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("C1", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2"),
            W("C2", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2"),
        }, Levels, tpl, m).Single();
        Ok(half.Ghosts.Count(x => x.Op == "retype") == 2 && half.Held.Count == 0,
           "a storey a first run left half-promoted still plans its leftover retypes (settled walls keep it mixed)");
        var masked = PromoteWallsPlanner.Plan(new List<WallFact>
        {
            W("OT1", "BDS_EXT_STR_CONC_200 mm", "Exterior", 200),
            W("C1", "Generic - 200mm", "Exterior", 200, top: "Level 2"),
            W("C2", "Generic - 200mm", "Exterior", 200, top: "Level 2"),
        }, Levels, tpl, m).Single();
        Ok(masked.Ghosts.Count == 0 && masked.Held.Count == 2 && masked.Held.All(h => h.Reason ==
           "every wall on Level 1 besides the 1 on other office types is \"Generic - 200mm\" — inside cannot be told from outside; a person decides"),
           "…but a template's office-typed wall does not mask a one-type storey");

        // A guideline with no office code: (b) is skipped, the concrete wall takes today's path.
        var g = JsonNode.Parse(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-walls-guideline.json"))).AsObject();
        g.Remove("office");
        var anon = GuidelineMatcher.FromBodies(g.ToJsonString(), File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        var np = PromoteWallsPlanner.Plan(new List<WallFact> { W("OT1", "BDS_EXT_STR_CONC_200 mm", "Exterior", 200) }, Levels, DocTypes, anon).Single();
        Ok(anon.Office == null && np.OfficeTyped == 0 && np.Ghosts.Any(x => x.Op == "retype" && x.TypeName == "BDS_EXT_ARC_CMU_200 mm"),
           "no office code in the guideline → no office-typed skip; the wall is retyped as today");
    }

    static List<JsonNode> Json(IEnumerable<object> bodies) => bodies.Select(b => JsonSerializer.SerializeToNode(b, ChangesetClient.WriteJson)).ToList();

    // ── 3. parity: the same body the bridge's vitest validates ─────────────────────────────────────────────────
    static void Parity(GuidelineMatcher m)
    {
        Console.WriteLine("\nParity (WebApp/bridge/fixtures/changeset-ops/promote-body.json)");
        var walls = new List<WallFact>
        {
            new WallFact { UniqueId = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-0004c3f8", Label = "W 312312", TypeName = "Generic - 200mm",
                           Function = "Exterior", WidthMm = 200, BaseLevel = "Level 1", IsBasic = true },
            new WallFact { UniqueId = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-0004c3f9", Label = "W 312313", TypeName = "MA0 Interior - 100mm",
                           Function = "Interior", WidthMm = 100, BaseLevel = "Level 1", TopLevel = "Level 2", TopOffsetMm = -250, IsBasic = true },
            new WallFact { UniqueId = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-0004c401", Label = "W 312321", TypeName = "Generic - 125mm",
                           Function = "Exterior", WidthMm = 125, BaseLevel = "Level 1", TopLevel = "Level 2", IsBasic = true },
        };
        var plan = PromoteWallsPlanner.Plan(walls, Levels, DocTypes, m).Single();
        var got = Json(PromoteWallsPlanner.Bodies(new[] { plan }, "yazan")).Single();
        var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "promote-body.json");
        var text = File.Exists(path) ? File.ReadAllText(path) : "null";
        bool same = JsonNode.DeepEquals(got, JsonNode.Parse(text));
        Ok(same, "the planner's body equals the fixture the bridge validates");
        if (!same) Console.WriteLine("        got: " + got.ToJsonString(new JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));

        // The fixture reads into the add-in's DTOs with the new fields filled (the bridge echoes them on the stored doc).
        var cs = same ? JsonSerializer.Deserialize<ChangesetDto>(text) : null;
        var retype = cs?.Elements.FirstOrDefault(e => e.Op == "retype");
        var attach = cs?.Elements.FirstOrDefault(e => e.Op == "attach");
        Ok(cs != null && cs.Source == "promote" && cs.Elements.All(e => e.Op != null && e.Target?.UniqueId != null && e.Reason != null),
           "every fixture element reads into ChangesetElementDto with Op, Target.UniqueId and Reason");
        Ok(retype?.Target.TypeBefore == "Generic - 200mm" && retype.Place.TypeName == "BDS_EXT_ARC_CMU_200 mm", "a retype reads Target.TypeBefore and Place.TypeName");
        Ok(attach?.Place.BaseLevel == "Level 1" && attach.Place.TopLevel == "Level 2" && attach.Target.TypeBefore == null,
           "an attach reads Place.BaseLevel and Place.TopLevel");
        Ok(cs?.Exceptions.Count == 1 && cs.Exceptions[0].UniqueId.EndsWith("0004c401") && cs.Exceptions[0].Name == "W 312321"
           && cs.Exceptions[0].Reason.StartsWith("gap: W 312321"), "the exceptions read into ExceptionRowDto");
    }

    // ── 4. the stamp and the undo matcher ──────────────────────────────────────────────────────────────────────
    static void StampAndUndo()
    {
        Console.WriteLine("\nStamp and undo matcher");
        const string id = "3f2a9c8b-1d0e-4f5a-8b7c-6d5e4f3a2b1c";
        string Ids(JsonNode a) => string.Join(",", a.AsArray().Select(x => (string)x));
        var seed = ProvenanceStamp.Json("seed-cs", "concept", new[] { "s1" }, "5a1c-0004c3f8");
        var j = JsonNode.Parse(ProvenanceStamp.Json(id, "promote", new[] { "8c1e", "91d0" }, "5a1c-0004c3f8", seed)).AsObject();
        Ok(j.Count == 13 && (int)j["v"] == 2 && (string)j["changeset_id"] == id && (string)j["source"] == "promote"
           && (string)j["unique_id_at_placement"] == "5a1c-0004c3f8",
           "the stamp JSON holds v (2), changeset_id, source, proposal_guids, unique_id_at_placement, changeset_ids, item 4's six fields and rule_is_reason (C2)");
        Ok(Ids(j["proposal_guids"]) == "s1,8c1e,91d0" && Ids(j["changeset_ids"]) == "seed-cs," + id,
           "a second changeset MERGES the element's stamp: every guid and changeset that touched it, oldest first");
        var copy = JsonNode.Parse(ProvenanceStamp.Json(id, "promote", new[] { "8c1e" }, "5a1c-0004c3f9", seed)).AsObject();
        Ok(Ids(copy["proposal_guids"]) == "8c1e" && Ids(copy["changeset_ids"]) == id && (string)copy["unique_id_at_placement"] == "5a1c-0004c3f9",
           "a copy's stamp (another element's unique_id_at_placement) is not merged");
        Ok(ProvenanceStamp.SourceOf(j.ToJsonString()) == "promote" && ProvenanceStamp.SourceOf("{\"v\":1}") == null && ProvenanceStamp.SourceOf("not json") == null,
           "SourceOf reads the last writer's source, null otherwise");

        var tx = UndoWatcher.TxName("Promote walls (DD) · Level 1", id);
        Ok(tx == "Sentinel AI changeset: Promote walls (DD) · Level 1 [3f2a9c8b]", "the transaction name carries the changeset id's first 8");
        Ok(UndoWatcher.Hits(new[] { tx }).Count == 0, "nothing is a hit before the result was reported");
        UndoWatcher.Remember(tx, "ma0-bds", id, new[] { "g1", "g2" });
        var hits = UndoWatcher.Hits(new[] { "Wall", tx, tx });
        Ok(hits.Count == 1 && hits[0].Key == "ma0-bds" && hits[0].ChangesetId == id && string.Join(",", hits[0].Guids) == "g1,g2",
           "a remembered name is one hit with its key, id and guids");
        Ok(UndoWatcher.Hits(new[] { "Sentinel AI changeset: Promote walls (DD) · Level 1 [00000000]", "Sentinel: Apply standard" }).Count == 0,
           "an unknown name is no hit");
        Ok(UndoWatcher.OpOf(true, false) == "undo" && UndoWatcher.OpOf(false, true) == "redo" && UndoWatcher.OpOf(false, false) == null,
           "undone → undo, redone → redo, anything else → no row");
    }
}
