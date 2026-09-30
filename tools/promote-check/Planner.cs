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
    static readonly ISet<string> DocTypes = new HashSet<string>(new[]
        { "Generic - 200mm", "Generic - 125mm", "Generic - 300mm", "MA0 Interior - 100mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_INT_ARC_GYPS_100 mm" },
        StringComparer.OrdinalIgnoreCase);

    static int _uid;
    static WallFact W(string label, string type, string function, double mm, string baseLevel = "Level 1", string top = null,
                      double baseOff = 0, double topOff = 0, bool basic = true, bool group = false, string stamp = null) => new WallFact
    {
        UniqueId = $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{++_uid:x8}", Label = label, TypeName = type, Function = function,
        WidthMm = mm, BaseLevel = baseLevel, TopLevel = top, BaseOffsetMm = baseOff, TopOffsetMm = topOff,
        IsBasic = basic, InGroup = group, Stamp = stamp,
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
            W("OK1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2", stamp: "{\"v\":1}"),
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
        Ok(l1.DdNow == 1 && l1.Stamped == 1, $"…and counts once in DD now ({l1.DdNow}) and stamped ({l1.Stamped})");
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
        var bodies = PromoteWallsPlanner.Bodies(big, "yazan").Select(b => JsonSerializer.SerializeToNode(b, ChangesetClient.WriteJson)).ToList();
        Ok(big.Ghosts.Count == 201 && bodies.Count == 2
           && bodies[0]["elements"].AsArray().Count == 200 && bodies[1]["elements"].AsArray().Count == 1,
           "201 ghosts → 2 bodies (200 + 1)");
        Ok(bodies[0]["exceptions"]?.AsArray().Count == 1 && bodies[1]["exceptions"] == null,
           "…the exceptions ride on the first body only");
        Ok((string)bodies[0]["name"] == "Promote walls (DD) · Level 1 (1/2)" && (string)bodies[1]["name"] == "Promote walls (DD) · Level 1 (2/2)",
           "…each named with its storey and part");
        Ok(bodies[0]["exceptions"][0]["reason"].GetValue<string>().Length <= 300, "an exception reason fits the bridge's 300-character cap");
        Ok(PromoteWallsPlanner.Bodies(P("Ref"), "yazan").Count == 0, "a storey with no ghosts files nothing (a changeset needs an element)");
    }

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
        var got = JsonSerializer.SerializeToNode(PromoteWallsPlanner.Bodies(plan, "yazan").Single(), ChangesetClient.WriteJson);
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
        var j = JsonNode.Parse(ProvenanceStamp.Json(id, new[] { "8c1e", "91d0" }, "5a1c-0004c3f8")).AsObject();
        Ok(j.Count == 4 && (int)j["v"] == 1 && (string)j["changeset_id"] == id
           && string.Join(",", j["proposal_guids"].AsArray().Select(x => (string)x)) == "8c1e,91d0" && (string)j["unique_id_at_placement"] == "5a1c-0004c3f8",
           "the stamp JSON holds v, changeset_id, proposal_guids and unique_id_at_placement");

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
