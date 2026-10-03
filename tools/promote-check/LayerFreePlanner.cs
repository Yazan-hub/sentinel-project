#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 24. MA-2a: the outer boundary (WallLocation), Promote's layer-free params, the bridge-typed body as the add-in reads it,
    //        and the drill drawing's own numbers (make-sample.py --ma2a) ─────────────────────────────────────────────────────
    static WallLocation.Segment Seg(double x0, double y0, double x1, double y1, double w = 200, bool curved = false) =>
        new WallLocation.Segment { X0 = x0, Y0 = y0, X1 = x1, Y1 = y1, WidthMm = w, Curved = curved };

    // make-concept.py's layout: a 24 x 12 m outline of eight walls, ten partitions off the corridor, two free-standing gap walls in it.
    static List<WallLocation.Segment> Concept()
    {
        var s = new List<WallLocation.Segment>
        {
            Seg(0, 0, 12000, 0), Seg(12000, 0, 24000, 0), Seg(24000, 0, 24000, 6000), Seg(24000, 6000, 24000, 12000),
            Seg(24000, 12000, 12000, 12000), Seg(12000, 12000, 0, 12000), Seg(0, 12000, 0, 6000), Seg(0, 6000, 0, 0),
        };
        foreach (var x in new[] { 4000, 8000, 12000, 16000, 20000 }) { s.Add(Seg(x, 0, x, 4500, 100)); s.Add(Seg(x, 7500, x, 12000, 100)); }
        s.Add(Seg(2000, 6000, 6000, 6000, 125)); s.Add(Seg(18000, 6000, 22000, 6000, 125));
        return s;
    }

    static string Loc(IReadOnlyList<WallLocation.Segment> walls, int i) => WallLocation.Locate(walls, i, out _);
    static string Why(IReadOnlyList<WallLocation.Segment> walls, int i) { WallLocation.Locate(walls, i, out var why); return why; }

    static void WallLocationChecks()
    {
        Console.WriteLine("\nMA-2a — the outer boundary (WallLocation.Locate)");
        var c = Concept();
        Ok(Enumerable.Range(0, 8).All(i => Loc(c, i) == "Exterior"), "the concept layout: all eight outline walls read Exterior");
        Ok(Enumerable.Range(8, 10).All(i => Loc(c, i) == "Interior"), "…its ten partitions read Interior");
        Ok(Loc(c, 18) == "Interior" && Loc(c, 19) == "Interior", "…and the two free-standing gap walls in the corridor read Interior (a ray along a partition's line is stopped by it)");

        var free = Concept(); free.Add(Seg(30000, 0, 34000, 0));
        Ok(Loc(free, 20) == null && Why(free, 20) == "both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it",
           "a wall standing outside the outline is unknown: both sides open, in words");
        Ok(Enumerable.Range(0, 8).All(i => Loc(free, i) == "Exterior"), "…and it does not change the outline walls' reading");

        var curved = Concept(); curved.Add(Seg(2000, 9000, 6000, 9000, 200, curved: true));
        Ok(Loc(curved, 20) == null && Why(curved, 20) == "a curved wall — its sides are not read (MA-2a reads straight walls)", "a curved wall is unknown, in words");
        var few = new List<WallLocation.Segment> { Seg(0, 0, 5000, 0), Seg(5000, 0, 5000, 5000), Seg(5000, 5000, 0, 5000) };
        Ok(Loc(few, 0) == null && Why(few, 0) == "only 2 other wall(s) on the storey — no outline to be inside or outside of", "fewer than three other walls: unknown, in words");
        var shortWall = Concept(); shortWall.Add(Seg(6000, 2000, 6300, 2000, 100));
        Ok(Loc(shortWall, 20) == null && Why(shortWall, 20) == "300 mm long — too short to look out from (under 500 mm)", "a wall under 500 mm is unknown, in words");
        var noLine = Concept(); noLine.Add(null);
        Ok(Loc(noLine, 20) == null && Why(noLine, 20) == "no location line was read" && Loc(noLine, 0) == "Exterior", "a wall with no line read is unknown and is no barrier");

        // An L: the two inner-corner walls are outside too (a convex hull would have called them inside).
        var l = new List<WallLocation.Segment> { Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 6000), Seg(12000, 6000, 6000, 6000), Seg(6000, 6000, 6000, 12000), Seg(6000, 12000, 0, 12000), Seg(0, 12000, 0, 0) };
        Ok(Enumerable.Range(0, 6).All(i => Loc(l, i) == "Exterior"), "an L-shaped outline: every wall reads Exterior, the inner corner's two included");
        // A U: the walls facing the open courtyard look out through its open side.
        var u = new List<WallLocation.Segment> { Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 12000, 12000), Seg(12000, 12000, 12000, 4000),
                                                 Seg(12000, 4000, 6000, 4000), Seg(6000, 4000, 6000, 12000), Seg(6000, 12000, 0, 12000), Seg(0, 12000, 0, 0) };
        Ok(Enumerable.Range(0, 8).All(i => Loc(u, i) == "Exterior"), "a U-shaped outline: the three courtyard walls read Exterior through the open side");
        // An O: a closed inner courtyard — its four walls read Interior (the stated ceiling: every direction meets a wall).
        var o = new List<WallLocation.Segment> { Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 0, 12000), Seg(0, 12000, 0, 0),
                                                 Seg(6000, 4000, 12000, 4000), Seg(12000, 4000, 12000, 8000), Seg(12000, 8000, 6000, 8000), Seg(6000, 8000, 6000, 4000) };
        Ok(Enumerable.Range(0, 4).All(i => Loc(o, i) == "Exterior") && Enumerable.Range(4, 4).All(i => Loc(o, i) == "Interior"),
           "a closed courtyard's walls read Interior — the ceiling the file states, pinned so a change is seen");
        // Review C23: a partition drawn INSIDE a thick shell wall's body (its centreline 100 mm in from the shell's) had its outer sample
        // point past the shell's centreline, met nothing and read Exterior at confidence 1. Overlapping walls are unknown, in words; a
        // partition merely abutting the shell's face (x = 350 against a 600 mm wall at x = 0) still reads Interior.
        var thick = new List<WallLocation.Segment> { Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 8000), Seg(12000, 8000, 0, 8000), Seg(0, 8000, 0, 0, 600), Seg(100, 1000, 100, 7000, 100) };
        Ok(Loc(thick, 4) == null && Why(thick, 4) == "its sample point lies beyond another wall's centreline (overlapping walls) — a person decides",
           "a partition drawn inside a 600 mm shell wall's body is unknown, in words — not Exterior (review C23)");
        Ok(Loc(thick, 3) == null && Why(thick, 3) == Why(thick, 4) && Enumerable.Range(0, 3).All(k => Loc(thick, k) == "Exterior"),
           "…the shell wall it is drawn inside is unknown the same way (its own sample point is beyond the partition), the other three outline walls read Exterior");
        var abut = new List<WallLocation.Segment>(thick) { [4] = Seg(350, 1000, 350, 7000, 100) };
        Ok(Loc(abut, 4) == "Interior", "…while a partition abutting the shell's face reads Interior as before");
        Ok(WallLocation.Summary(8, 12, 1) == "outer boundary: 8 outside · 12 inside · 1 unknown", "the summary line");
    }

    // The O layout again, for the planner's checks: a closed inner courtyard inside an 18 x 12 m outline.
    static List<WallLocation.Segment> Courtyard() => new List<WallLocation.Segment>
    {
        Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 0, 12000), Seg(0, 12000, 0, 0),
        Seg(6000, 4000, 12000, 4000), Seg(12000, 4000, 12000, 8000), Seg(12000, 8000, 6000, 8000), Seg(6000, 8000, 6000, 4000),
    };

    // The layer-free rule file through Promote's planner: a one-type storey types by location, an unknown location goes to a person.
    static void PlannerLayerFreeChecks(GuidelineMatcher m, GuidelineMatcher m3)
    {
        Console.WriteLine("\nMA-2a — Promote passes Function, Location and Material (PromoteWallsPlanner with the layer-free file)");
        var docTypes = new Dictionary<string, string>(DocTypes, StringComparer.OrdinalIgnoreCase)
            { ["BDS_INT_ARC_CMU_200 mm"] = "Interior", ["BDS_INT_ARC_CMU_100 mm"] = "Interior", ["BDS_EXT_ARC_CMU_100 mm"] = "Exterior" };
        var layout = Concept(); layout.Add(Seg(30000, 0, 34000, 0));
        // Every wall Generic - 200mm, Function Exterior (the template's default): the one-type storey MA-0 held whole.
        var oneType = layout.Select((s, i) => W($"W{i + 1}", "Generic - 200mm", "Exterior", 200, top: "Level 2", set: w => w.Line = s)).ToList();
        var plan = PromoteWallsPlanner.Plan(oneType, Levels, docTypes, m3).Single();
        PromoteGhost G(StoreyPlan p, string label) => p.Ghosts.FirstOrDefault(g => g.Op == "retype" && g.Label == label);
        Ok(plan.OneType && plan.Ghosts.Count(g => g.Op == "retype") == 20 && plan.Held.Count == 1, $"a one-type storey of 21 walls: 20 retypes by location, 1 held ({plan.Held.Count})");
        Ok(Enumerable.Range(1, 8).All(n => G(plan, $"W{n}")?.TypeName == "BDS_EXT_ARC_CMU_200 mm") && G(plan, "W1").Reason == "DD walls v0: Location Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm",
           "the eight outline walls → BDS_EXT_ARC_CMU_200 mm, the reason naming what the rule used: Location Exterior, not the Function that told nothing");
        Ok(Enumerable.Range(9, 12).All(n => G(plan, $"W{n}")?.TypeName == "BDS_INT_ARC_CMU_200 mm"), "the twelve inside walls → BDS_INT_ARC_CMU_200 mm");
        Ok(plan.Held.Single().Label == "W21" && plan.Held.Single().Reason ==
           "every wall on Level 1 is \"Generic - 200mm\" — inside cannot be told from outside: its Function tells nothing, and its location is unknown (both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it); a person decides",
           "the wall outside the outline is held with the location's reason, never typed by the Function that told nothing");
        // The same storey with MA-0's Function-only file: location is known but the file has no rule for it — held, in words.
        var old = PromoteWallsPlanner.Plan(oneType, Levels, docTypes, m).Single();
        Ok(old.Ghosts.Count(g => g.Op == "retype") == 0 && old.Held.Count == 21
           && old.Held.First(h => h.Label == "W1").Reason == "every wall on Level 1 is \"Generic - 200mm\" — inside cannot be told from outside: its Function tells nothing, and BDS DD walls v0 (MA-0) has no rule for Location Exterior; a person decides",
           "with MA-0's Function-only file the one-type storey is still held whole, and each reason says the file has no rule for the location read");
        // A mixed storey: Function is a modelling decision and is passed; Location wins where it is read; Material refines.
        var mixed = new List<WallFact>
        {
            W("E1", "Generic - 200mm", "Exterior", 200, top: "Level 2", set: w => w.Line = layout[0]),
            W("I1", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2", set: w => w.Line = layout[8]),
            W("I2", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2", set: w => { w.Line = layout[9]; w.Material = "Gypsum Wall Board / Metal Stud"; }),
            W("F1", "Generic - 200mm", "Exterior", 200, top: "Level 2", set: w => w.Line = layout[20]),
            W("N1", "Generic - 200mm", "Exterior", 200, top: "Level 2"),
        };
        var others = layout.Skip(1).Take(7).Select((s, i) => W($"O{i}", "BDS_EXT_STR_CONC_200 mm", "Exterior", 200, top: "Level 2", set: w => w.Line = s)).ToList();
        var mp = PromoteWallsPlanner.Plan(mixed.Concat(others).ToList(), Levels, docTypes, m3).Single();
        Ok(!mp.OneType && G(mp, "E1")?.Reason == "DD walls v0: Location Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm", "a mixed storey: an outline wall types by Location");
        Ok(G(mp, "I1")?.TypeName == "BDS_INT_ARC_CMU_100 mm" && G(mp, "I1").Reason == "DD walls v0: Location Interior, 100 mm → BDS_INT_ARC_CMU_100 mm",
           "an inside wall types by Location (the Location rule is listed before the Function rule)");
        Ok(G(mp, "I2")?.TypeName == "BDS_INT_ARC_GYPS_100 mm" && G(mp, "I2").Reason == "DD walls v0: Location Interior, Material Gypsum Wall Board / Metal Stud, 100 mm → BDS_INT_ARC_GYPS_100 mm",
           "a wall whose build-up names gypsum types by Location and Material, and the reason says both");
        Ok(G(mp, "F1")?.Reason == "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm" && G(mp, "N1")?.Reason == "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm",
           "a wall whose location is unknown, or whose line was not read, falls to the Function rule on a mixed storey — as MA-0 typed it");
        var none = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-layerfree-guideline.json")).Replace("\"Function\": \"Exterior\"", "\"Function\": \"Soffit\""),
                                               File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        var np = PromoteWallsPlanner.Plan(mixed.Take(4).Concat(others).ToList(), Levels, docTypes, none).Single();
        Ok(np.Held.Any(h => h.Label == "F1" && h.Reason == "no DD rule for Function Exterior in BDS DD walls, layer-free v0 (MA-2a) — DRAFT (location unknown: both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it)"),
           "with no rule for its Function either, the held reason names the facts passed and why the location is unknown");

        // Review after the landing (C21): a Function that is neither Exterior nor Interior (Retaining, Foundation, Soffit, Coreshaft) is
        // not a side, so C2's disagreement never fired and the Location rule listed first retyped a retaining wall to an internal CMU
        // at confidence 1. Now the wall is held unless the winning rule itself names Function.
        var civil = new List<WallFact>
        {
            W("RET", "Generic - 200mm", "Retaining", 200, top: "Level 2", set: w => w.Line = layout[8]),   // a partition's line: reads Interior
            W("FND", "Generic - 200mm", "Foundation", 200, top: "Level 2", set: w => w.Line = layout[1]),  // an outline line: reads Exterior
            W("SOF", "Generic - 200mm", "Soffit", 200, top: "Level 2"),                                   // no line: location unknown
        };
        var civStorey = civil.Concat(mixed.Take(2)).Concat(others.Skip(1)).ToList(); // E1 and I1 make it a mixed storey (the civil walls alone would be one-type: F2); FND stands on O0's line
        var civ = PromoteWallsPlanner.Plan(civStorey, Levels, docTypes, m3).Single();
        Ok(!civ.OneType && civ.Ghosts.Count(g => g.Op == "retype") == 2 && G(civ, "RET") == null && G(civ, "FND") == null
           && civ.Held.Any(h => h.Label == "RET" && h.Reason == "Function Retaining — the rule that matched does not name Function: it does not decide a Retaining wall; a person decides")
           && civ.Held.Any(h => h.Label == "FND" && h.Reason == "Function Foundation — the rule that matched does not name Function: it does not decide a Foundation wall; a person decides"),
           "a mixed storey: a Retaining wall reading Interior and a Foundation wall reading Exterior are held in words, neither retyped by the Location rule; E1 and I1 retype as before (C21)");
        Ok(civ.Held.Any(h => h.Label == "SOF" && h.Reason.StartsWith("no DD rule for Function Soffit in ")), "…and a Soffit wall with no location and no rule for its Function is held as before");
        var soffit = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-layerfree-guideline.json")).Replace("\"Function\": \"Exterior\"", "\"Function\": \"Soffit\""),
                                                 File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        var sp = PromoteWallsPlanner.Plan(civStorey, Levels, docTypes, soffit).Single();
        Ok(G(sp, "SOF")?.Reason == "DD walls v0: Function Soffit, 200 mm → BDS_EXT_ARC_CMU_200 mm — note: BDS_EXT_ARC_CMU_200 mm is Function Exterior in this model" && sp.Held.Any(h => h.Label == "RET") && sp.Held.Any(h => h.Label == "FND"),
           "…where a rule names the Function it decides (the Soffit wall retypes); where the Location rule listed first wins, the wall is still held");

        // Review C2: on a mixed storey a type's Function that disagrees with the reading is held, never outvoted by the file's order.
        // The O layout's courtyard walls carry Function Exterior (a courtyard wall is one) and read Interior; its east outline wall
        // is a Function-Interior type here and reads Exterior.
        var court = Courtyard();
        var cw = court.Select((s, i) => i == 1 ? W("C2", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2", set: w => w.Line = s)
                                               : W($"C{i + 1}", "Generic - 200mm", "Exterior", 200, top: "Level 2", set: w => w.Line = s)).ToList();
        cw.Add(W("CI", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2", set: w => w.Line = Seg(2000, 2000, 2000, 10000, 100)));
        var cp = PromoteWallsPlanner.Plan(cw, Levels, docTypes, m3).Single();
        Ok(!cp.OneType && cp.Ghosts.Count(g => g.Op == "retype") == 4 && G(cp, "C1")?.TypeName == "BDS_EXT_ARC_CMU_200 mm" && G(cp, "CI")?.TypeName == "BDS_INT_ARC_CMU_100 mm"
           && Enumerable.Range(5, 4).All(n => cp.Held.Any(h => h.Label == $"C{n}" && h.Reason == "Function Exterior but it reads inside (both sides enclosed — a courtyard, or a misread outline); a person decides")),
           "a mixed storey: the four courtyard walls (Function Exterior, reading Interior) are held in words, 0 retyped to an internal type; the outline and the partition, where both agree, retype (review C2)");
        Ok(cp.Held.Any(h => h.Label == "C2" && h.Reason == "Function Interior but it reads outside (one side looks out of the storey's outline); a person decides"),
           "…and an outline wall of a Function-Interior type is held the other way round");

        // Review C1: the storey's barriers are its own walls AND every wall that crosses its plane. A shell based on Level 1 rising to
        // the Roof encloses Level 2: a room of four partitions there reads Interior. The same room with no shell reads Exterior on
        // every wall (each has one side open) — the barrier list is what decides.
        var shell = Concept().Take(8).Select((s, i) => W($"S{i + 1}", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Roof", set: w => w.Line = s)).ToList();
        var roomSegs = new[] { Seg(8000, 4000, 16000, 4000, 100), Seg(16000, 4000, 16000, 8000, 100), Seg(16000, 8000, 8000, 8000, 100), Seg(8000, 8000, 8000, 4000, 100) };
        List<WallFact> Room() => roomSegs.Select((s, i) => W($"R{i + 1}", "MA0 Interior - 100mm", "Interior", 100, baseLevel: "Level 2", top: "Roof", set: w => w.Line = s)).ToList();
        var l2 = PromoteWallsPlanner.Plan(shell.Concat(Room()).ToList(), Levels, docTypes, m3).Single(p => p.Storey == "Level 2");
        Ok(l2.OneType && l2.Held.Count == 0 && l2.Ghosts.Count(g => g.Op == "retype") == 4
           && Enumerable.Range(1, 4).All(n => G(l2, $"R{n}")?.Reason == "DD walls v0: Location Interior, 100 mm → BDS_INT_ARC_CMU_100 mm"),
           "a shell based on Level 1 rising to the Roof is a barrier on Level 2: a room of four partitions there reads Interior, none Exterior (review C1)");
        var alone = PromoteWallsPlanner.Plan(Room(), Levels, docTypes, m3).Single();
        Ok(alone.Ghosts.Count(g => g.Op == "retype") == 4 && Enumerable.Range(1, 4).All(n => G(alone, $"R{n}")?.TypeName == "BDS_EXT_ARC_CMU_100 mm"),
           "…the same room with no shell reads Exterior on every wall — the barrier list is what decides");
        var low = Concept().Take(8).Select((s, i) => W($"L{i + 1}", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2", set: w => w.Line = s)).ToList();
        var l2low = PromoteWallsPlanner.Plan(low.Concat(Room()).ToList(), Levels, docTypes, m3).Single(p => p.Storey == "Level 2");
        Ok(Enumerable.Range(1, 4).All(n => G(l2low, $"R{n}")?.TypeName == "BDS_EXT_ARC_CMU_100 mm"), "…and a shell that stops AT Level 2 (top = the plane) is no barrier there");

        Console.WriteLine("\nMA-2a — a door's location from a host settled by a Location rule (PromotePlanner.Swap, GuidelineMatcher.RuleLocation)");
        string catalogText = File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json"));
        string layerFree = File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-layerfree-guideline.json"));
        var doorsG = JsonNode.Parse(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json"))).AsObject();
        var wallsBlock = doorsG["elements"].AsArray().First(e => (string)e["category"] == "Walls");
        wallsBlock["rules"] = JsonNode.Parse(layerFree)["elements"][0]["rules"].DeepClone();
        var md = GuidelineMatcher.FromBodies(doorsG.ToJsonString(), catalogText, out var dge, out _);
        Ok(dge == null && md.RuleParam("Walls", "BDS_INT_ARC_GYPS_100 mm", "Function") == null && md.RuleParam("Walls", "BDS_INT_ARC_GYPS_100 mm", "Location") == null
           && md.RuleLocation("Walls", "BDS_INT_ARC_GYPS_100 mm") == "Interior" && md.RuleLocation("Walls", "BDS_INT_ARC_CMU_100 mm") == "Interior" && md.RuleLocation("Walls", "BDS_EXT_ARC_CMU_200 mm") == "Exterior",
           "the gypsum type is produced by a Location+Material rule and a Function rule: RuleParam names no one Function and no one Location, RuleLocation reads Function else Location per rule and names Interior (review C6)");
        var door = Dw("door", "D1", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, host: "BDS_INT_ARC_CMU_100 mm", hostFn: "Interior");
        var dp = PromotePlanner.Plan(new[] { "Doors" }, new List<WallFact>(), new[] { door }, Levels, docTypes, V1Types(), md);
        Ok(dp.SelectMany(p => p.Ghosts).Any(g => g.Label == "D1" && g.TypeName == "BDS_INT_1 PNL_WOOD_1000 x 2100 mm"),
           "a door in a host the Location rule settled is swapped by that location");
        var inGyps = Dw("door", "D2", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, host: "BDS_INT_ARC_GYPS_100 mm", hostFn: "Interior");
        var dp2 = PromotePlanner.Plan(new[] { "Doors" }, new List<WallFact>(), new[] { inGyps }, Levels, docTypes, V1Types(), md);
        Ok(dp2.SelectMany(p => p.Ghosts).Any(g => g.Label == "D2" && g.TypeName == "BDS_INT_1 PNL_WOOD_1000 x 2100 mm"),
           "a door in the gypsum partition — the common case the DD file exists for — is swapped too (it was held under RuleParam)");
        // A true disagreement: the gypsum type produced by a Location Interior rule AND a Function Exterior rule — held, in words.
        wallsBlock["rules"] = JsonNode.Parse(layerFree.Replace("\"Function\": \"Interior\"", "\"Function\": \"Exterior\""))["elements"][0]["rules"].DeepClone();
        var mdx = GuidelineMatcher.FromBodies(doorsG.ToJsonString(), catalogText, out _, out _);
        var dp3 = PromotePlanner.Plan(new[] { "Doors" }, new List<WallFact>(), new[] { inGyps }, Levels, docTypes, V1Types(), mdx);
        Ok(mdx.RuleLocation("Walls", "BDS_INT_ARC_GYPS_100 mm") == null
           && dp3.SelectMany(p => p.Held).Any(h => h.Label == "D2" && h.Reason == "host BDS_INT_ARC_GYPS_100 mm: its DD rules do not name one Function or Location — a person decides"),
           "a host whose producing rules say Interior (Location) and Exterior (Function) names no one location: held, in words");
    }

    // The bridge-typed body as the add-in reads it (the `stored` half of the shared fixture vitest proves from `posted`).
    static void TypedBodyChecks()
    {
        Console.WriteLine("\nMA-2a — the bridge-typed changeset as the add-in reads it (contract2-typed-body.json)");
        string stored;
        using (var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "contract2-typed-body.json"))))
            stored = fx.RootElement.GetProperty("stored").GetRawText();
        var cs = JsonSerializer.Deserialize<ChangesetDto>(stored);
        foreach (var e in cs.Elements) e.Verdict = new ElementVerdictDto { Status = "recorded" };
        Ok(cs.Elements[0].Place.TypeName == "BDS_EXT_ARC_CMU_200 mm" && cs.Elements[1].Place.TypeName == "BDS_INT_ARC_CMU_100 mm",
           "the executor reads the type the bridge filled into place.TypeName, as for any other changeset");
        Ok(cs.Elements[0].Typing?.TypedBy == "bridge" && cs.Elements[0].Typing.Type == "BDS_EXT_ARC_CMU_200 mm" && cs.Elements[0].Typing.Family == "Basic Wall"
           && cs.Elements[0].Typing.Guideline == "guideline@1 · office · 0123456789ab…",
           "typing reads who typed it, the type and family, and which guideline decided");
        Ok(ChangesetTrust.Typing(cs.Elements[0]) == "typed by the bridge from the facts posted (guideline@1 · office · 0123456789ab…)",
           "the review's words for a bridge-typed element");
        var caller = JsonSerializer.Deserialize<ChangesetElementDto>("{\"kind\":\"wall\",\"op\":\"create\",\"typing\":{\"typed_by\":\"caller\"}}");
        var older = JsonSerializer.Deserialize<ChangesetElementDto>("{\"kind\":\"wall\",\"op\":\"create\"}");
        Ok(ChangesetTrust.Typing(caller) == null && ChangesetTrust.Typing(older) == null, "a caller-typed element, or one from a bridge before MA-2a, adds no words");
        Ok(cs.Elements.All(e => !ChangesetTrust.PreTick(cs, e)), "neither element opens ticked: a create never, a bridge-typed retype not for that");
        string filed = JsonSerializer.Serialize(new ChangesetElementDto { Kind = "wall", Op = "retype" }, ChangesetClient.WriteJson);
        Ok(!filed.Contains("typing") && !filed.Contains("facts"), "an element the add-in files carries no typing (nulls are left out): the bridge's record is the bridge's");
    }

    // The drill drawing's own numbers (make-sample.py --ma2a): the script states each wall's location; WallLocation reads it again.
    static void WallSampleChecks()
    {
        Console.WriteLine("\nMA-2a drill data (demo/ghost-sample/sample-walls-ma2a-expected.json, make-sample.py --ma2a)");
        var path = Repo("demo", "ghost-sample", "sample-walls-ma2a-expected.json");
        Ok(File.Exists(path), "the expected results are written beside the drawing");
        if (!File.Exists(path)) return;
        var doc = JsonDocument.Parse(File.ReadAllText(path)).RootElement;
        var walls = doc.GetProperty("walls").EnumerateArray().ToList();
        var segs = walls.Select(w => Seg(w.GetProperty("start")[0].GetDouble(), w.GetProperty("start")[1].GetDouble(),
                                        w.GetProperty("end")[0].GetDouble(), w.GetProperty("end")[1].GetDouble(), w.GetProperty("thickness_mm").GetDouble())).ToList();
        int agree = 0;
        for (int i = 0; i < segs.Count; i++)
        {
            string want = walls[i].GetProperty("location").ValueKind == JsonValueKind.Null ? null : walls[i].GetProperty("location").GetString();
            string got = Loc(segs, i);
            if (got == want) agree++; else Console.WriteLine($"        wall {i + 1} ({walls[i].GetProperty("layer").GetString()}): script says {want ?? "unknown"}, WallLocation says {got ?? "unknown"}");
        }
        Ok(walls.Count == 7 && agree == 7, $"the add-in's outer boundary reads each of the seven drawn walls as the script states ({agree}/{walls.Count}): four outside, two inside, one unknown");
        Ok(walls.Count(w => w.GetProperty("layer").GetString() == "A-WALL-EXT") == 4 && walls.Count(w => w.GetProperty("location").ValueKind == JsonValueKind.Null) == 1,
           "four walls on A-WALL-EXT (the layer rule's), three on A-WALL-INT (the layer-free rules'), one of them with no location");
        int Lines(string file) => File.ReadAllLines(Repo("demo", "ghost-sample", file)).Count(l => l == "LINE");
        Ok(File.Exists(Repo("demo", "ghost-sample", "sample-walls-ma2a.dxf")) && Lines("sample-walls-ma2a.dxf") == 14, "sample-walls-ma2a.dxf holds 14 lines: two faces for each of the seven walls");
    }
}
