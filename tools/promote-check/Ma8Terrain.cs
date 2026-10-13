#nullable disable
// MA-8-14: terrain from a scan - the ground of a survey as one Toposolid. The pure planner (TerrainPlanner: every hold in words), its body against the bridge's fixture
// (WebApp/bridge/fixtures/changeset-ops/terrain-cases.json, which vitest reads too - the drift guard), the guideline's Toposolid rule, the DTOs, and the Revit halves pinned by
// source text (Compat.cs holds every Toposolid token behind the 2024 guard; the executor's one transaction; the propose hops; the window).
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    static void Ma8TerrainChecks()
    {
        Console.WriteLine("\nMA-8-14 - terrain from a scan (TerrainPlanner, GuidelineMatcher.TerrainRule, the DTOs, Compat's guard, the executor, the propose hops)");
        using var cases = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "terrain-cases.json")));
        var root = cases.RootElement;
        var pl = root.GetProperty("plan");
        double[][] Pts(JsonElement a) => a.EnumerateArray().Select(p => p.EnumerateArray().Select(x => x.GetDouble()).ToArray()).ToArray();
        var cs = pl.GetProperty("changeset");
        var rl = pl.GetProperty("rule");
        var rule = (Family: rl.GetProperty("family").GetString(), Type: rl.GetProperty("type").GetString(), Source: rl.GetProperty("source").GetString());
        var points = Pts(pl.GetProperty("points")); var foot = Pts(pl.GetProperty("footprint"));
        TerrainPlan Plan(double[][] pts = null, double[][] fp = null, string level = null, (string Family, string Type, string Source)? ru = null, bool noRule = false, int? cellMm = null, int? of = null) =>
            TerrainPlanner.Plan(pts ?? points, fp ?? foot, level ?? pl.GetProperty("level").GetString(), noRule ? null : (ru ?? rule), cs.GetProperty("name").GetString(), cs.GetProperty("id").GetString(),
                                cs.GetProperty("job").GetString(), cellMm ?? pl.GetProperty("cell_mm").GetInt32(), pl.GetProperty("z_mm").EnumerateArray().Select(x => x.GetDouble()).ToArray(), of ?? pl.GetProperty("of").GetInt32(), pl.GetProperty("actor").GetString());

        // the body for the fixture's inputs equals the fixture the bridge validates
        var plan = Plan();
        var got = JsonSerializer.SerializeToNode(plan.Body);
        bool same = plan.Hold == null && JsonNode.DeepEquals(got, JsonNode.Parse(root.GetProperty("good").GetRawText()));
        Ok(same, "the planner's body for the fixture's scan equals the fixture the bridge validates (fixtures/changeset-ops/terrain-cases.json: 6 ground points, source promote, from_scan)");
        if (!same) Console.WriteLine("        got: " + (plan.Hold ?? got.ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping })));
        Ok(plan.Points == 6 && plan.Line == "6 ground points on L00 outside the walls, lowest per 500 mm cell, -5000 to 1500 mm, Site Ground 300 (guideline@2 default), from job-0003; " + TerrainPlanner.Shape,
           "the plan's account: 6 ground points on the level, outside the walls, the cell and the height band read, the rule's type and where it came from, the job, the shape Revit builds");
        // review round 2 (D-B5-9, said): the hole is the walls' box plus 1 m and the rim points are Sentinel's - in the reason, the line, the row and the button's tooltip
        string goodReason = JsonSerializer.SerializeToNode(plan.Body)["elements"][0]["reason"].GetValue<string>();
        Ok(TerrainPlanner.Shape == "the hole is the walls' box plus 1 m (a notch or courtyard inside it gets no ground); Sentinel adds points along the outer edge and the hole's edge, each at the nearest ground point's height"
           && goodReason.EndsWith("; " + TerrainPlanner.Shape + " — check it against the site survey") && TerrainPlanner.RowWords(6, true).Contains("; " + TerrainPlanner.Shape + " — check it against the site survey"),
           "review round 2 (round 3: one plain sentence): the reason, the plan's line and the review row say the hole is the walls' box plus 1 m (a notch or courtyard gets no ground) and that Sentinel adds points along both loops at the nearest ground height");
        // review round 3: the drift guard on "plus 1 m" and on the desk's copy - survey-plan's pad is 1000 mm, and review-desk.ts holds Shape verbatim
        string surveySrc = File.ReadAllText(Repo("WebApp", "bridge", "survey-plan.mjs")), desk = File.ReadAllText(Repo("WebApp", "src", "setups", "review-desk.ts"));
        Ok(surveySrc.Contains("GROUND_MAX = 2000, GROUND_PAD_MM = 1000;") && TerrainPlanner.Shape.Contains("the walls' box plus 1 m ")
           && desk.Contains("export const TERRAIN_SHAPE = \"" + TerrainPlanner.Shape + "\";") && goodReason.Length <= 500,
           "review round 3: \"plus 1 m\" is survey-plan.mjs's GROUND_PAD_MM (1000), the web desk's TERRAIN_SHAPE is TerrainPlanner.Shape verbatim, and the fixture's reason is within the bridge's 500 characters");
        // review round 2: the row claims only what the bridge checks (as the desk), never that the add-in read the points off the scan
        Ok(TerrainPlanner.RowWords(6, true).StartsWith("Toposolid from 6 ground points filed by a signed-in member from the survey changeset (the bridge checked its level, footprint and height band, not the points; not re-measured); ")
           && !TerrainPlanner.RowWords(6, true).Contains("read off the scan"), "review round 2: the review row says a signed-in member filed the points and the bridge checked their level, footprint and band - not the points");
        // review round 2: the bridge's 500 m span is held here, in words, before the slow ground read is filed and refused
        // review round 3: measured over the points and the footprint (x -1000 to 11000), as the bridge - so points over 0 to 600 m span 601 m, and 0 to 499 m with the footprint 500 m
        var wideSpan = new[] { new double[] { 0, 0, -300 }, new double[] { 600000, 0, -300 }, new double[] { 0, 1000, -300 } };
        var farCluster = new[] { new double[] { 300000000, 0, -300 }, new double[] { 300005000, 0, -300 }, new double[] { 300000000, 5000, -300 } };
        Ok(Plan(pts: wideSpan).Hold == "the ground spans 601 m in plan — a terrain is at most 500 m across; a person decides" && Plan(pts: new[] { wideSpan[0], new double[] { 499000, 0, -300 }, wideSpan[2] }).Hold == null
           && Plan(pts: farCluster).Hold == "the ground spans 300006 m in plan — a terrain is at most 500 m across; a person decides",
           "review round 2: ground wider than 500 m in plan holds the terrain in words (the bridge's MAX_TERRAIN_SPAN_MM); 500 m is filed - review round 3: over the points and the footprint (a 5 m cluster 300 km off holds)");
        // review: the limits of the read are said - a widened cell (and what the 500 mm cell kept) and the band the ground outside of which is not read
        var wide = Plan(cellMm: 2000, of: 7000);
        var wideReason = JsonSerializer.SerializeToNode(wide.Body)["elements"][0]["reason"].GetValue<string>();
        Ok(wideReason.Contains("lowest per 2000 mm cell (widened from 500 mm, which kept 7000)") && wideReason.Contains("between -5000 and 1500 mm (5 m under to 1.5 m over L00's floor; ground outside that band is not read)")
           && wide.Line.Contains("lowest per 2000 mm cell (widened from 500 mm, which kept 7000), -5000 to 1500 mm"), "a widened cell is said with what the 500 mm cell kept; the height band and its limit are said");
        // final verification round 1: the reason stays within the bridge's 500 characters - a 60-character level name with a widened cell is cut (marked …), Shape whole
        string longLevel = new string('L', 60);
        var longPlan = Plan(level: longLevel, cellMm: 2000, of: 31542);
        string longReason = longPlan.Hold == null ? JsonSerializer.SerializeToNode(longPlan.Body)["elements"][0]["reason"].GetValue<string>() : "";
        var hugeJob = TerrainPlanner.Plan(points, foot, longLevel, rule, "S", "id", new string('j', 400), 2000, new double[] { -5000, 1500 }, 31542, "a");
        Ok(longReason.Length <= TerrainPlanner.MaxReason && longReason.Length > 480 && longReason.Contains("…'s floor;") && longReason.EndsWith("; " + TerrainPlanner.Shape + " — check it against the site survey")
           && wideReason.Length < 500 && !wideReason.Contains("…") && hugeJob.Hold != null && hugeJob.Hold.StartsWith("the terrain's reason would be ") && hugeJob.Hold.EndsWith(" characters — the bridge takes 500; a person decides")
           && File.ReadAllText(Repo("WebApp", "bridge", "changesets-logic.mjs")).Contains("if (el.reason != null && !text(el.reason, 500))"),
           "final verification round 1: a long level name with a widened cell is cut (…) so the reason stays within the bridge's 500 characters with Shape whole; a reason that still cannot fit holds in words");
        var noFamily = JsonSerializer.SerializeToNode(Plan(ru: ("", rule.Type, rule.Source)).Body)["elements"][0]["place"].AsObject();
        Ok(!noFamily.ContainsKey("FamilyName") && noFamily["TypeName"].GetValue<string>() == rule.Type, "a rule with no family sends no FamilyName (a Toposolid type's family is the system's)");

        // the holds, each in words (D9: a person decides)
        Ok(Plan(pts: points.Take(2).ToArray()).Hold == "2 ground point(s) outside the walls of L00 in the scan — a surface needs at least 3; a person decides", "fewer than 3 points hold the terrain");
        Ok(Plan(noRule: true).Hold == "the guideline names no Toposolid type — a person decides" && Plan(ru: (rule.Family, " ", rule.Source)).Hold == "the guideline names no Toposolid type — a person decides",
           "no Toposolid rule holds it: Sentinel never takes the model's first type");
        Ok(Plan(level: " ").Hold == "Survey job-0003 · GR-FFL's lowest walls name no level — the Toposolid is created on a level; a person decides", "walls that name no level hold it");
        Ok(Plan(fp: foot.Take(2).ToArray()).Hold == "the scan's storey has no footprint (no wall on L00) — a person decides", "no footprint holds it");
        Ok(Plan(pts: Enumerable.Range(0, 2001).Select(i => new[] { (double)i * 10, 0, -300 }).ToArray()).Hold == "2001 ground points — a terrain takes at most 2000; a person decides", "more than 2000 points hold it (the bridge's cap)");
        // review round 1: the bridge's constants read from its source (a change there turns this red), beside the planner's
        string logic = File.ReadAllText(Repo("WebApp", "bridge", "changesets-logic.mjs")), survey = File.ReadAllText(Repo("WebApp", "bridge", "survey-plan.mjs"));
        Ok(logic.Contains($"const MIN_TERRAIN_POINTS = {TerrainPlanner.MinPoints}, MAX_TERRAIN_POINTS = {TerrainPlanner.MaxPoints}, MAX_TERRAIN_SPAN_MM = {TerrainPlanner.MaxSpanMm.ToString(System.Globalization.CultureInfo.InvariantCulture)};")
           && survey.Contains($"export const GROUND_CELL_MM = {TerrainPlanner.BaseCellMm}, GROUND_MAX = {TerrainPlanner.MaxPoints}, ")
           && survey.Contains("return { band: [lo - 5000, lo + 1500], ") && wideReason.Contains("(5 m under to 1.5 m over L00's floor;"),
           "the planner's bounds (3 to 2000, 500 m across), base cell (500 mm) and stated band (5 m under to 1.5 m over) are the bridge's, read from changesets-logic.mjs and survey-plan.mjs");

        // review round 1: the rim - points inside each loop at the nearest ground z, one per corner, none on a loop line
        var ground = new List<double[]> { new double[] { 0, 0, -100 }, new double[] { 10000, 0, -200 }, new double[] { 10000, 10000, -300 }, new double[] { 0, 10000, -400 } };
        var square = new List<double[]> { new double[] { 0, 0 }, new double[] { 4000, 0 }, new double[] { 4000, 4000 }, new double[] { 0, 4000 } };
        var inRim = TerrainPlanner.RimPoints(square, ground, 50); var outRim = TerrainPlanner.RimPoints(square, ground, -50);
        Ok(TerrainPlanner.NearestZ(ground, 9000, 1000) == -200 && inRim.Count == 32 && inRim.All(q => q[0] > 49 && q[0] < 3951 && q[1] > 49 && q[1] < 3951)
           && outRim.All(q => q[0] < -49 || q[0] > 4049 || q[1] < -49 || q[1] > 4049) && inRim.Select(q => $"{q[0]:0.#},{q[1]:0.#}").Distinct().Count() == inRim.Count
           && inRim.Any(q => Math.Abs(q[0] - 50) < 1e-6 && Math.Abs(q[1] - 50) < 1e-6 && q[2] == -100) && inRim.All(q => q[2] == TerrainPlanner.NearestZ(ground, q[0], q[1])),
           "RimPoints: every 500 mm or less, 50 mm inside a loop (or outside the hole), one per corner, each at its nearest ground point's z");

        // review round 3: CreateTerrain's arithmetic, run on values (Compat calls these inside the 2024 guard; only the Revit calls stay pinned by text)
        Ok(TerrainPlanner.OffsetMm(points.Min(p => p[2]), 0) == -330 && TerrainPlanner.OffsetMm(-1500, -1000) == -510 && TerrainPlanner.OffsetMm(500, 0) == 0 && TerrainPlanner.OffsetMm(-320, -1000) == 0,
           "OffsetMm: the lowest point (-320) less the level (0) less 10 mm is -330; under a level at -1000 a -1500 lowest gives -510; ground above the level clamps to 0");
        var outer = TerrainPlanner.OuterRect(points, foot, 1000);
        Ok(outer.Select(q => $"{q[0]},{q[1]}").SequenceEqual(new[] { "-3000,-4000", "13000,-4000", "13000,12000", "-3000,12000" })
           && TerrainPlanner.OuterRect(points, new[] { new double[] { 20000, 0 }, new double[] { 21000, 0 }, new double[] { 21000, 1000 } }, 1000)[1][0] == 22000,
           "OuterRect: round the fixture's six points and the footprint, 1 m out on every side, anticlockwise from the low corner; a footprint beyond the points widens it");
        var cw = new[] { foot[0], foot[3], foot[2], foot[1], foot[0] };   // clockwise, closed
        Ok(TerrainPlanner.AnticlockwiseRing(cw).Select(q => $"{q[0]},{q[1]}").SequenceEqual(new[] { foot[1], foot[2], foot[3], foot[0] }.Select(q => $"{q[0]},{q[1]}"))
           && TerrainPlanner.AnticlockwiseRing(foot).Select(q => $"{q[0]},{q[1]}").SequenceEqual(foot.Select(q => $"{q[0]},{q[1]}")),
           "AnticlockwiseRing: a clockwise, closed footprint loses its closing point and is turned anticlockwise; an anticlockwise one is kept as it is");

        // review round 3: an applied terrain whose Toposolid this model no longer holds is found (reported as undone before a re-proposal); a standing one, a proposed one, a wall are not
        ChangesetDto Cs(string status, string kind, string applied) => JsonSerializer.Deserialize<ChangesetDto>(
            "{\"id\":\"c-" + status + "\",\"name\":\"Terrain · L00 · from S\",\"status\":\"" + status + "\",\"elements\":[{\"proposal_guid\":\"g1\",\"kind\":\"" + kind + "\"}],\"result\":{\"applied\":[" + applied + "]}}");
        const string Uid = "{\"proposal_guid\":\"g1\",\"revit_unique_id\":\"u1\"}";
        // final verification round 1: only the changeset the bridge's 409 names, and only when every applied terrain entry of it is absent - a gone terrain of another scan is not reported
        var cands = new[] { Cs("applied", "terrain", Uid), Cs("partially_applied", "terrain", Uid), Cs("proposed", "terrain", Uid) };
        var named = TerrainPlanner.Gone(cands, "c-applied", _ => false);
        Ok(named?.Id == "c-applied" && named.Value.Guids.SequenceEqual(new[] { "g1" }) && TerrainPlanner.Gone(cands, "c-partially_applied", _ => false)?.Id == "c-partially_applied"
           && TerrainPlanner.Gone(cands, "c-other", _ => false) == null && TerrainPlanner.Gone(cands, null, _ => false) == null && TerrainPlanner.Gone(cands, "c-proposed", _ => false) == null
           && TerrainPlanner.Gone(new[] { Cs("applied", "wall", Uid) }, "c-applied", _ => false) == null && TerrainPlanner.Gone(new[] { Cs("applied", "terrain", "{\"proposal_guid\":\"g1\"}") }, "c-applied", _ => false) == null
           && TerrainPlanner.Gone(new[] { Cs("applied", "terrain", Uid) }, "c-applied", u => u == "u1") == null && TerrainPlanner.Gone(null, "c-applied", _ => false) == null,
           "final verification round 1: Gone judges only the changeset the bridge's 409 names (an absent applied terrain of another scan is not reported), never a standing one, a proposed one, another kind, or an entry with no UniqueId");
        // final verification round 2: the id leads the bridge's message - a level name of 100 characters (named three times) still leaves it inside Refusal's 400-character cut
        string lvl = new string('L', 100), sv = "Survey job-0003 · " + lvl, held = "5b1c6f3e-2a4d-4e8f-9c1a-7d2e3f4a5b6c";
        string said409 = ChangesetTrust.Refusal(409, JsonSerializer.Serialize(new { message = $"elements[0]: changeset {held} (applied) holds this scan — a terrain from \"{sv}\"'s scan is already built as \"Terrain · {lvl} · from {sv}\"; undo it in Revit first; nothing was saved" }));
        Ok(said409.EndsWith("…") && TerrainPlanner.Blocker(said409) == held
           && TerrainPlanner.Blocker("Bridge 409: elements[0]: a terrain from \"S\"'s scan is already built as \"T\" (applied, changeset " + held + ") — undo it in Revit first; nothing was saved") == null
           && TerrainPlanner.Blocker("Bridge 400: elements[0]: changeset " + held + " (applied) holds this scan — x") == null
           && TerrainPlanner.Blocker("elements[0]: this flag is already built as \"x\" (applied) — undo it in Revit first") == null && TerrainPlanner.Blocker(null) == null
           && File.ReadAllText(Repo("WebApp", "bridge", "changesets-logic.mjs")).Contains("${at}: changeset ${other.id} (applied) holds this scan — a terrain from \"${cs.name}\"'s scan is already built as \"${other.name}\"; undo it in Revit first; nothing was saved`"),
           "final verification round 1 (round 2: the id first): the bridge's terrain 409 names the blocking changeset's id ahead of the names (changesets-logic.mjs checkFromScan), and Blocker reads it back from a 409 cut at 400 characters (a 100-character level); any other answer frees nothing");
        // final verification round 2: a Sentinel terrain of another changeset already in the model refuses an Apply (Undo, Propose, Redo, Apply would stand two)
        string Stamp(string c) => Sentinel.Engine.ProvenanceStamp.Json(c, "promote", new[] { "g" }, "u");
        Ok(TerrainPlanner.StandingOther(new[] { Stamp("c-new") }, "c-new") == null && TerrainPlanner.StandingOther(new[] { "not json", Stamp("c-old") }, "c-new") == "c-old"
           && TerrainPlanner.StandingOther(new string[0], "c-new") == null && TerrainPlanner.StandingOther(null, "c-new") == null && TerrainPlanner.StandingOther(new[] { Stamp(null) }, "c-new") == null,
           "final verification round 2: StandingOther names a Sentinel-stamped Toposolid of another changeset (never this one's, a stamp with no changeset, or one that is not JSON)");
        // final verification round 2: the raise read-back's arithmetic on values - mm off, the Level.Elevation frame moved by dz (a Survey Point base), the 5 mm bound
        Ok(Math.Abs(TerrainPlanner.RaiseOffMm(-300 / 304.8, -300, 0)) < 1e-9 && Math.Abs(TerrainPlanner.RaiseOffMm(-295.1 / 304.8, -300, 0) - 4.9) < 1e-9 && Math.Abs(TerrainPlanner.RaiseOffMm(-294.9 / 304.8, -300, 0) - 5.1) < 1e-9
           && Math.Abs(TerrainPlanner.RaiseOffMm(-306 / 304.8, -300, 0) + 6) < 1e-9 && Math.Abs(TerrainPlanner.RaiseOffMm((-300 + 3000) / 304.8, -300, 3000 / 304.8)) < 1e-9
           && Math.Abs(TerrainPlanner.RaiseOffMm(-300 / 304.8, -300, 3000 / 304.8) + 3000) < 1e-9 && TerrainPlanner.RaiseToleranceMm == 5,
           "final verification round 2: RaiseOffMm - 0, 4.9, 5.1 and -6 mm off; a dz of 3000 mm (Survey Point base) moves the ground point and a vertex left in the old frame reads 3000 mm off; the bound is 5 mm");

        // the Revit 2021-2023 words, at Propose and at Apply
        Ok(TerrainPlanner.NoProposal("2023") == "a terrain is a Toposolid — Revit 2024 and later; this is Revit 2023. Nothing was proposed"
           && TerrainPlanner.OldRevit == "a terrain is a Toposolid — Revit 2024 and later; this Revit cannot apply it; nothing was placed"
           && TerrainPlanner.RowWords(6, false).EndsWith(" — " + TerrainPlanner.OldRevit) && !TerrainPlanner.RowWords(6, true).Contains("Revit 2024"),
           "a Revit before 2024 says so at Propose, on the row and at Apply - and nothing was proposed or placed");

        // the guideline's Toposolid rule: the level's rule, else the default; none, or a type the catalogue lacks, holds in words
        string guideline = "{\"standard\":\"Terrain check\",\"elements\":[{\"category\":\"Toposolid\",\"rules\":[{\"when\":{\"level\":\"L00\"},\"use\":{\"family\":\"Toposolid\",\"type\":\"Site Ground 300\"}}]," +
                           "\"default\":{\"family\":\"Toposolid\",\"type\":\"Site Ground 150\"}}]}";
        string catalog = "{\"types\":[{\"category\":\"Toposolid\",\"family\":\"Toposolid\",\"type\":\"Site Ground 300\"},{\"category\":\"Toposolid\",\"family\":\"Toposolid\",\"type\":\"Site Ground 150\"}]}";
        var tm = GuidelineMatcher.FromBodies(guideline, catalog, out _, out _);
        var l0 = tm.TerrainRule("L00", out var h0); var l1 = tm.TerrainRule("L01", out var h1);
        Ok(h0 == null && l0 is { Family: "Toposolid", Type: "Site Ground 300" } && l0.Value.Source == "Terrain check rule" && h1 == null && l1 is { Type: "Site Ground 150" } && l1.Value.Source == "Terrain check default",
           "TerrainRule: the level's rule, else the Toposolid default; the answer says which");
        var absent = GuidelineMatcher.FromBodies(PlacementGuideline, PlacementCatalog, out _, out _).TerrainRule("L00", out var hAbs);
        Ok(absent == null && hAbs == "the guideline names no Toposolid type — Placement check guideline has no Toposolid element; add one (a Toposolid type) to the guideline; a person decides",
           "a guideline with no Toposolid element holds the terrain in words");
        var lacks = GuidelineMatcher.FromBodies(guideline, "{\"types\":[{\"category\":\"Toposolid\",\"family\":\"Toposolid\",\"type\":\"Other\"}]}", out _, out _);
        Ok(lacks.TerrainRule("L00", out var hLack) == null && hLack != null && hLack.StartsWith("Toposolid on L00 — ") && hLack.Contains("is not in "), "a Toposolid type the catalogue in force lacks is a gap, named with the catalogue");

        // the DTOs: a terrain as the bridge stores it, and the ground answer
        var dto = JsonSerializer.Deserialize<ChangesetElementDto>("{\"proposal_guid\":\"g\",\"kind\":\"terrain\",\"op\":\"create\",\"place\":{\"LevelName\":\"L00\",\"TypeName\":\"T\",\"Points\":[[1,2,-3],[4,5,-6],[7,8,-9]],\"Boundary\":[[0,0],[1,0],[1,1]]}," +
                                                                  "\"from_scan\":{\"changeset\":\"c1\"}}");
        Ok(dto.Place.Points.Length == 3 && dto.Place.Points[1][2] == -6 && dto.Place.Boundary.Length == 3 && dto.FromScan.Changeset == "c1", "the client reads a terrain: Points, Boundary and from_scan");
        Ok(JsonSerializer.Serialize(new ChangesetElementDto { Kind = "wall" }).IndexOf("from_scan", StringComparison.Ordinal) < 0, "an element with no from_scan sends none");
        // review round 2: the ground answer is the shared fixture's sample (changesets-store.test (k) checks scanOverlay answers its keys and types) - the drift guard
        var g = JsonSerializer.Deserialize<GroundDto>(root.GetProperty("ground_answer").GetRawText());
        Ok(g.Ground == true && g.Job == "job-0003" && g.LedgerId == 7 && g.Level == "L00" && g.Footprint.Length == 4 && g.Points.Count == 3 && g.Points[2][2] == -290 && g.CellMm == 500 && g.ZMm.Length == 2 && g.Of == 3,
           "the client reads the fixture's ground answer (terrain-cases.json ground_answer, the bridge's shape): ground, job, ledger_id, level, footprint, cell, band, of, points");
        Ok(JsonSerializer.Deserialize<GroundDto>("{\"job\":\"job-0003\",\"points\":[[1,2,3]]}").Ground == null, "review round 1: a plain scan answer (a bridge from before ?ground=1) reads as no ground");

        // the Revit halves, by source text
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        string compat = Src("Compat.cs"), ex = Src("GhostBuilder", "ChangesetExecutor.cs"), rv = Src("Commands.ReviewChangesets.cs"), win = Src("UI", "ChangesetReviewWindow.cs"), cli = Src("Coordination", "ChangesetClient.cs");
        int At(string s, string what, int from = 0) => s.IndexOf(what, from, StringComparison.Ordinal);

        // every Toposolid API token lives in Compat.cs, under the 2024 guard
        var outside = Directory.EnumerateFiles(Repo("SentinelAddin"), "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar) && !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar) && Path.GetFileName(f) != "Compat.cs")
            .Where(f => File.ReadAllLines(f).Where(l => !l.TrimStart().StartsWith("//")).Any(l => Regex.IsMatch(l, @"Toposolid\.Create\(|typeof\(Toposolid|OST_Toposolid|TOPOSOLID_|\(Toposolid\)|<Toposolid>|\bToposolidType\b"))).ToList();
        Ok(outside.Count == 0, "no Toposolid, ToposolidType or OST_Toposolid token outside Compat.cs (the 2021-2023 builds never name a type they do not have)" + (outside.Count == 0 ? "" : " - found in " + string.Join(", ", outside.Select(Path.GetFileName))));
        int create = At(compat, "Toposolid.Create(doc, new List<CurveLoop> { Loop(outerMm), Loop(ringMm) }, lifted, typeId, level.Id)"), gate = At(compat, "#if REVIT2024_OR_GREATER", At(compat, "public static Element CreateTerrain("));
        int els = At(compat, "#else", gate), types = At(compat, "typeof(ToposolidType)");
        Ok(create > gate && gate > 0 && create < els && compat.Split("Toposolid.Create(").Length == 2 && types > 0 && At(compat, "#if REVIT2024_OR_GREATER", At(compat, "public static List<ElementType> TerrainTypes(")) is var tg && tg > 0 && tg < types,
           "Toposolid.Create (the CurveLoop overload: outer + inner loop, the points) is called once, inside #if REVIT2024_OR_GREATER in Compat.CreateTerrain; so is the ToposolidType collector");
        Ok(compat.Contains("double o = Sentinel.GhostBuilder.TerrainPlanner.OffsetMm(pointsMm.Min(p => p[2]), level.Elevation * 304.8) * mm;") && compat.Contains("new XYZ(p[0] * mm, p[1] * mm, p[2] * mm + dz - o)")
           && compat.Contains("var outerMm = Sentinel.GhostBuilder.TerrainPlanner.OuterRect(pointsMm, footprintMm, 1000);") && compat.Contains("var ringMm = Sentinel.GhostBuilder.TerrainPlanner.AnticlockwiseRing(footprintMm);")
           && compat.Contains("ts.get_Parameter(BuiltInParameter.TOPOSOLID_HEIGHTABOVELEVEL_PARAM)") && compat.Contains("if (!offset.Set(o)) throw new InvalidOperationException(") && !compat.Contains("LookupParameter(\"Height Offset From Level\")")
           && compat.Contains("nothing was placed") && compat.Contains("public static bool TerrainSupported"),
           "lift then offset (the spike): the points go in lifted by -o, the height offset is set to o by its BuiltInParameter (a localised Revit works), never above 0 - and no type is created");

        Ok(!GhostOverlayGeometry.Drawable(dto) && GhostOverlayGeometry.Segments(dto, true, false).Count == 0, "review: a terrain has no ghost drawing, so the overlay does not count it as drawable");
        Ok(GhostOverlayGeometry.TerrainLine == "No ghost to draw: a terrain is a Toposolid made from points; it has no ghost drawing — Show zooms to its footprint."
           && rv.Contains("else window.Shown(creates == 0 && (cs.Elements ?? new()).Any(e => GhostOverlayGeometry.IsCreate(e) && e.Kind == \"terrain\") ? GhostOverlayGeometry.TerrainLine : GhostOverlayGeometry.Line(creates, 0));")
           && ChangesetTrust.PlaceBox(dto.Place) != null,
           "review round 2: a terrain changeset's overlay line says a terrain has no ghost drawing and Show zooms to its footprint (PlaceBox reads its Boundary) - never \"proposes no create\"");
        // review: the points' z is the Level.Elevation frame - moved to the internal z by ProjectElevation less Elevation (as the mass), the loops drawn at ProjectElevation; no FamilyName match on the type
        int ct = At(compat, "public static Element CreateTerrain("), cte = At(compat, "#else", ct);
        string ctBody = compat.Substring(ct, cte - ct);
        Ok(ctBody.Contains("double dz = level.ProjectElevation - level.Elevation;") && ctBody.Contains("double z = level.ProjectElevation;") && !ctBody.Contains("double z = level.Elevation;"),
           "CreateTerrain moves the points from the Level.Elevation frame to the internal z (ProjectElevation less Elevation, as the mass) and draws its loops at ProjectElevation - a Survey Point base or a moved base point no longer puts the ground metres off the building");
        int tt = At(compat, "public static List<ElementType> TerrainTypes("), tte = At(compat, "#else", tt);
        Ok(!compat.Substring(tt, tte - tt).Contains("t.FamilyName"), "a Toposolid type is matched by its name only: FamilyName is the system family's localised display name");

        // Execute: refused before the transaction on a Revit before 2024; one terrain loop inside the changeset's one transaction
        int branch = At(ex, "if (toPlace.Any(e => IsCreate(e) && e.Kind == \"stair\")) return ExecuteStair(doc, cs, toPlace);");
        int old = At(ex, "if (!Compat.TerrainSupported && toPlace.Any(e => IsCreate(e) && e.Kind == \"terrain\")) return new ExecutionResult { NotRun = true, Error = TerrainPlanner.OldRevit };", branch);
        int tx = At(ex, "using var t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id));", branch), start = At(ex, "t.Start();", tx);
        int loop = At(ex, "foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == \"terrain\"))", start), made = At(ex, "Compat.CreateTerrain(doc, el.Place.Points, el.Place.Boundary, type.Id, level)", loop), ceiling = At(ex, "e.Kind == \"ceiling\"", loop);
        Ok(branch > 0 && old > branch && old < tx && start > tx && loop > start && made > loop && made < ceiling && ex.Substring(loop, made - loop).IndexOf("new Transaction(", StringComparison.Ordinal) < 0,
           "Execute: a terrain on a Revit before 2024 is refused before the transaction (NotRun, the plan's words); the terrain loop runs inside the changeset's one transaction (one Undo), with no transaction of its own");
        Ok(ex.Contains("\"terrain\" => Compat.TerrainSupported ? () => ToposolidTypeOf(doc, p.FamilyName, p.TypeName) : null,") && ex.Contains("Compat.TerrainTypes(doc, familyName, typeName)")
           && ex.Contains("Manage ▸ Transfer Project Standards (Toposolid types) from the office template; Sentinel creates no types"),
           "NotLoaded asks the Toposolid type of the model on 2024 and later (and nothing before: Execute's own words); a type not loaded says how to bring it in; Sentinel creates no types");
        string fhs = Src("GhostBuilder", "GhostFailureHandler.cs");
        int ho = At(ex, "var handler = GhostFailureHandler.AllOrNothingOn(t);", start), rb = At(ex, "if (toPlace.Any(e => IsCreate(e) && e.Kind == \"terrain\")) { handler.RollBackOtherWarnings = true; handler.WarningOn = \"the terrain\"; }", ho);
        Ok(ho > start && rb > ho && rb < loop && !fhs.Contains("Toposolid") && !fhs.Contains("DeleteWarning(") && !ex.Substring(loop, made - loop).Contains("DeleteWarning")
           && fhs.Contains("if (RollBackOtherWarnings) return RollBack(\"Revit raised a warning on \" + WarningOn + \": \" + text, named);"),
           "F-K1-1 (review round 1): a terrain's transaction rolls back on any warning at the commit, in its words (\"Revit raised a warning on the terrain: …\") - never a modal, never erased");
        Ok(rv.Contains("!(cs.Elements ?? new()).Any(e => e.Kind == \"stair\" || e.Kind == \"terrain\"); // a stair is re-proposed from its flag, a terrain from the scan"),
           "review round 1: \"Run Promote (DD) again\" is never said of a terrain (PromoteRun excludes it, as a stair) - it is re-proposed from the scan");
        Ok(cli.Contains("if (ground?.Ground != true || ground.Footprint == null) { error = NotGround; return null; }")
           && ChangesetClient.NotGround == "this bridge does not read ground — restart or update it; nothing was proposed",
           "review round 1: FetchGround fails closed - an answer that is not a ground answer (a bridge from before ?ground=1) is said in words, never planned as ground");
        Ok(ctBody.Contains("var editor = ts.GetSlabShapeEditor();") && ctBody.Contains("v.VertexType != SlabShapeVertexType.Interior") && ctBody.Contains("editor.ModifySubElement(v, Sentinel.GhostBuilder.TerrainPlanner.NearestZ(pointsMm, v.Position.X / mm, v.Position.Y / mm) * mm + dz - top);")
           && ctBody.IndexOf("if (!offset.Set(o))", StringComparison.Ordinal) < ctBody.IndexOf("var editor = ts.GetSlabShapeEditor();", StringComparison.Ordinal)
           && ctBody.Contains("RimPoints(outerMm, pointsMm, 50)") && ctBody.Contains("RimPoints(ringMm, pointsMm, -50)") && ctBody.Contains("var lifted = pointsMm.Concat(rim)"),
           "review round 1 (Revit-only, source pin): CreateTerrain adds rim points inside both loops and, after the offset, raises every loop vertex to its nearest ground point's z - no trench round the building, no sunken rim");
        // review round 2 (Revit-only, source pin; K-1c reads the heights back): Regenerate before the editor (as the spike), fail closed on fewer loop vertices than corners, all behind one switch
        int setO = ctBody.IndexOf("if (!offset.Set(o))", StringComparison.Ordinal), sw = ctBody.IndexOf("if (!TerrainRim) return ts;", StringComparison.Ordinal),
            regen = ctBody.IndexOf("doc.Regenerate();", StringComparison.Ordinal), ed = ctBody.IndexOf("var editor = ts.GetSlabShapeEditor();", StringComparison.Ordinal),
            guard = ctBody.IndexOf("if (loopVerts.Count < outerMm.Count + ringMm.Count)", StringComparison.Ordinal), mod = ctBody.IndexOf("foreach (var v in loopVerts)", StringComparison.Ordinal);
        Ok(setO > 0 && sw > setO && regen > sw && ed > regen && guard > ed && mod > guard && ctBody.Contains("editor.IsEnabled ? editor.SlabShapeVertices")
           && ctBody.Contains("throw new InvalidOperationException($\"the Toposolid's loop corners could not be read ({loopVerts.Count} of {outerMm.Count + ringMm.Count})") && ctBody.Contains("nothing was placed\");")
           && compat.Contains("public static readonly bool TerrainRim = true;") && ctBody.Contains("var rim = !TerrainRim ? Enumerable.Empty<double[]>()"),
           "review round 2 (Revit-only, source pin): after the offset, the Toposolid is regenerated before its shape editor is read; fewer loop vertices than the loops' corners throws in words (the changeset's transaction rolls back, nothing placed); the rim and the raise sit behind Compat.TerrainRim (false = the spike's proven route)");

        // the propose hops: sign-in and the version on this thread, the ground and the standards on a pool thread, Revit's thread for the type and the plan, the POST on a pool thread, the words
        int pr = At(rv, "window.ProposeTerrainRequested += () =>");
        int a = At(rv, "if (!UserSession.IsSignedIn) { window.Shown(\"Proposing a terrain needs a signed-in person", pr), v = At(rv, "if (!Compat.TerrainSupported) { window.Shown(TerrainPlanner.NoProposal(revitVersion)); return; }", a),
            b = At(rv, "Task.Run(() =>", v), fg = At(rv, "ChangesetClient.FetchGround(cfg, key, cs.Id, out var groundErr)", b), ld = At(rv, "GhostStandards.Load(key, layers: false, guideline: true, catalog: true)", fg),
            tr = At(rv, "standards.Guideline.TerrainRule(ground.Level, out hold)", ld), eq = At(rv, "App.Events.Enqueue(doc, \"plan a terrain\"", tr), ty = At(rv, "ChangesetExecutor.ToposolidTypeOf(d, rule.Value.Family, rule.Value.Type)", eq),
            pn = At(rv, "TerrainPlanner.Plan(ground.Points.ToArray(), ground.Footprint, ground.Level, rule, cs.Name, cs.Id, ground.Job, ground.CellMm, ground.ZMm, ground.Of, UserSession.Actor)", ty), tk = At(rv, "Task.Run(() =>", pn),
            po = At(rv, "ChangesetClient.Propose(cfg, key, plan.Body, out var proposeErr)", tk), sh = At(rv, "window.Shown(filed == null ?", po);
        Ok(pr > 0 && a > pr && v > a && b > v && fg > b && ld > fg && tr > ld && eq > tr && ty > eq && pn > ty && tk > pn && po > tk && sh > po && rv.Contains("var revitVersion = ui.Application.VersionNumber;"),
           "Propose terrain…: (a) the sign-in check and the Revit version, (b) a pool thread reads the ground and the Toposolid rule, (c) Revit's thread reads the type and plans, (d) a pool thread files it with the window's cfg, (e) the words");
        Ok(rv.Contains("Held for a person — ") && rv.Contains("The terrain was not proposed — ") && rv.Contains("Review it (Review AI Proposals); nothing was ticked or placed."),
           "a hold is said as one; a refusal (a 409 included) shows the bridge's message only; the proposal is not ticked or placed");
        Ok(win.Contains("public event Action ProposeTerrainRequested;") && win.Contains("Content = \"Propose terrain from the scan…\"") && win.Contains("terrain.Click += (_, _) => ProposeTerrainRequested?.Invoke();")
           && win.Contains("Visibility = SurveyChangeset && _cs.Status != \"withdrawn\" ? Visibility.Visible : Visibility.Collapsed") && win.Contains("TerrainPlanner.RowWords(p.Points.Length, Compat.TerrainSupported)")
           && win.Contains("as a changeset of its own — \" + TerrainPlanner.Shape + \" — nothing is ticked or placed\""),
           "the window: Propose terrain from the scan… on a live survey changeset; a terrain row says the points are the add-in's reading, and on a Revit before 2024 the refusal's words");
        Ok(cli.Contains("[JsonPropertyName(\"Points\")] public double[][] Points { get; set; }") && cli.Contains("[JsonPropertyName(\"from_scan\")]") && cli.Contains("/scan?ground=1")
           && cli.Contains("public static GroundDto FetchGround(") && cli.Contains("Send(WriteHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken))"),
           "the client: PlaceDto Points, the element's from_scan, and FetchGround - a new overload beside FetchScan, waiting as long as a write, with the person's token");
        // review round 3, final verification round 1 (Revit-only, source pin): a scan held by an applied terrain whose Toposolid this model does not hold is freed only on the
        // person's word - the changesets read with the ground; after the 409, Revit's thread judges only the changeset it names, refuses a stale workshared local, asks Yes/No
        // (default No) naming the changeset and this model; only on Yes the Undo row is posted and the terrain filed again, once
        // final verification round 2: only the changeset the 409 names is read, after the 409 (no list before every filing); a failed read is said
        int bl = At(rv, "var blocker = filed == null ? TerrainPlanner.Blocker(proposeErr) : null;", po), fa = At(rv, "var named = ChangesetClient.FetchOne(cfg, key, blocker, out var namedErr);", bl),
            fq = At(rv, "App.Events.Enqueue(doc, \"free a scan\"", fa), gn = At(rv, "var gone = TerrainPlanner.Gone(new[] { named }, blocker, uid => d2.GetElement(uid) != null);", fq),
            ws = At(rv, "try { current = d2.HasAllChangesFromCentral(); }", gn), stale = At(rv, "if (!current) { window.Shown($\"The terrain was not proposed — {proposeErr} ({TerrainPlanner.StaleLocal})\"); return; }", ws),
            q = At(rv, "MainContent = TerrainPlanner.GoneQuestion(g.Name, DocOf(d2))", stale), yes = At(rv, "if (ask.Show() != TaskDialogResult.Yes) { window.Shown(\"The terrain was not proposed — \" + proposeErr); return; }", q),
            rp = At(rv, "ChangesetClient.ReportReverted(cfg, key, g.Id, g.Guids, \"undo\", out var revertErr, basis: \"absent\")", yes), again = At(rv, "var again = ChangesetClient.Propose(cfg, key, plan.Body, out var againErr);", rp);
        Ok(bl > po && fa > bl && fq > fa && gn > fq && !rv.Contains("ChangesetClient.FetchAll(cfg, key, out _)") && rv.Contains("if (named == null) { window.Shown($\"The terrain was not proposed — {proposeErr} (whether the applied terrain is still in this model could not be read: {namedErr}; nothing was recorded)\"); return; }")
           && cli.Contains("JsonSerializer.Serialize(new { op, guids, actor = UserSession.Actor, basis }, WriteJson)") && ws > gn && stale > ws && q > stale && yes > q && rp > yes && again > rp
           && rv.Split("ChangesetClient.ReportReverted(cfg, key, g.").Length == 2 && !rv.Contains("TerrainPlanner.Gone(all, uid =>") && rv.Contains("DefaultButton = TaskDialogResult.No")
           && rv.Contains("if (gone == null) { window.Shown(\"The terrain was not proposed — \" + proposeErr); return; }") && rv.Contains("nothing was ticked or placed.{word} The scan is free.")
           && TerrainPlanner.StaleLocal == "this local is not up to date with central — Reload Latest, then press again; nothing was recorded"
           && TerrainPlanner.GoneQuestion("T", "C:\\m.rvt").Contains("its Toposolid is not in this model (C:\\m.rvt)") && TerrainPlanner.GoneQuestion("T", "m").Contains("If it may stand in another model, a copy, another person's local, or a closed workset, answer No."),
           "final verification round 1 (Revit-only, source pin; round 2: the one changeset read after the 409, the Undo row marked basis absent): after the bridge's 409 Propose terrain judges only the changeset it names on Revit's thread, refuses a workshared local not up to date with central, asks Yes/No (default No) naming it and this model, and posts the Undo row and files again only on Yes - nothing is reported without the Yes; \"the scan is free\" is said only after the filing");
        // final verification round 1 (Revit-only, source pin): the raise read back - after the ModifySubElement loop, a Regenerate and every loop vertex within 5 mm of its ground point, or a throw
        int rbk = ctBody.IndexOf("Revit did not take the raise; nothing was placed", StringComparison.Ordinal), regen2 = ctBody.IndexOf("doc.Regenerate();", mod, StringComparison.Ordinal);
        int bk = ctBody.IndexOf("var back = ts.GetSlabShapeEditor().SlabShapeVertices.Cast<SlabShapeVertex>().Where(v => v.VertexType != SlabShapeVertexType.Interior).ToList();", regen2, StringComparison.Ordinal),
            bkg = ctBody.IndexOf("if (back.Count < outerMm.Count + ringMm.Count)", bk, StringComparison.Ordinal), bkl = ctBody.IndexOf("foreach (var v in back)", bkg, StringComparison.Ordinal);
        Ok(regen2 > mod && bk > regen2 && bkg > bk && bkl > bkg && rbk > bkl && ctBody.Contains("could not be read back ({back.Count} of {outerMm.Count + ringMm.Count})")
           && ctBody.Contains("double off = Sentinel.GhostBuilder.TerrainPlanner.RaiseOffMm(v.Position.Z, Sentinel.GhostBuilder.TerrainPlanner.NearestZ(pointsMm, v.Position.X / mm, v.Position.Y / mm), dz);")
           && ctBody.Contains("if (Math.Abs(off) > Sentinel.GhostBuilder.TerrainPlanner.RaiseToleranceMm)") && ctBody.IndexOf("return ts;", rbk, StringComparison.Ordinal) > rbk,
           "final verification round 1 (Revit-only, source pin; round 2: the read counted, the arithmetic RaiseOffMm's): after the raise CreateTerrain regenerates and reads the loop vertices back - fewer than the loops' corners, or one more than 5 mm off its ground point, throws in words, and the transaction rolls back");
        // final verification round 1 (Revit-only, source pin): a failure inside CreateTerrain is PlacementRefused - rolled back, the changeset stays proposed (C5, as the roof), never declined
        Ok(ex.Contains("try { Collect(result, el, Compat.CreateTerrain(doc, el.Place.Points, el.Place.Boundary, type.Id, level)); }")
           && ex.Contains("{ throw new PlacementRefused($\"{at}: Revit did not build the terrain — {(ex is InvalidOperationException ? ex.Message : ex.GetType().Name + \": \" + ex.Message + Frame(ex))}; it stays proposed\"); }"),
           "final verification round 1 (Revit-only, source pin; round 2: a Revit exception keeps its type and frame): Revit not building the terrain (CreateTerrain's refusals or a Revit exception in its rim steps) is PlacementRefused - rolled back, the changeset stays proposed, never reported declined");
        // final verification round 2 (Revit-only, source pin): a Sentinel terrain of another changeset in the model refuses the Apply before CreateTerrain; a terrain rolled back at the commit stays proposed
        int sto = At(ex, "var standing = TerrainPlanner.StandingOther(Compat.TerrainStamps(doc), cs.Id);", loop),
            stw = At(ex, "if (standing != null) throw new PlacementRefused($\"{at}: a Sentinel terrain (changeset {standing}) already stands in this model — undo or delete it first; it stays proposed\");", sto);
        int rbb = At(ex, "if (status == TransactionStatus.RolledBack)"), rbt = At(ex, "return new ExecutionResult { NotRun = true, Error = error + \" — a terrain Revit did not build stays proposed\" };", rbb),
            rbe = At(ex, ": new ExecutionResult { Error = error };", rbb);
        Ok(sto > loop && stw > sto && stw < made && rbb > 0 && rbt > rbb && rbe > rbt && ex.Substring(rbb, rbt - rbb).Contains("if (toPlace.Any(e => IsCreate(e) && e.Kind == \"terrain\"))")
           && compat.Contains("new FilteredElementCollector(doc).OfClass(typeof(Toposolid)).Select(Sentinel.Engine.ProvenanceStamp.Read).Where(s => s != null).ToList();")
           && At(compat, "#if REVIT2024_OR_GREATER", At(compat, "public static List<string> TerrainStamps(")) < At(compat, "OfClass(typeof(Toposolid))"),
           "final verification round 2 (Revit-only, source pin): Apply refuses a terrain while a Sentinel Toposolid of another changeset stands in the model (PlacementRefused: rolled back, stays proposed); a terrain Revit rolls back at the commit is NotRun, never reported declined");
        // review round 3 (source pin): a pending stair or terrain (source promote) is not a Promote or Shell storey run - neither command opens it instead of planning
        string pw = Src("Commands.PromoteWalls.cs"), sm = Src("Commands.ShellMass.cs");
        Ok(rv.Contains("internal static bool PromoteRun(ChangesetDto cs) => StoreyRun(cs) && ") && rv.Contains("internal static bool StoreyRun(ChangesetDto cs) => cs.Source == \"promote\"")
           && new[] { pw, sm }.All(c => c.Contains("var unreviewed = pending.FirstOrDefault(ReviewChangesetsCommand.StoreyRun);") && c.Contains("pending.Any(ReviewChangesetsCommand.StoreyRun)") && !c.Contains("p.Source == \"promote\"")),
           "review round 3 (source pin): Promote (DD) and Shell a Mass open only a waiting Promote or Shell changeset (StoreyRun) - a pending stair or terrain never stops them planning");
        // review round 3: the Apply refusals in the house words (an em dash, as the executor's)
        Ok(ctBody.Contains("Height Offset From Level — the ground cannot") && ctBody.Contains("mm — the ground would stand") && ctBody.Contains(") — the ground at the building")
           && compat.Contains("\"a terrain is a Toposolid — Revit 2024 and later\"") && !Regex.IsMatch(ctBody, "\"[^\"\\n]* - [^\"\\n]*nothing was placed"),
           "review round 3: CreateTerrain's refusals use an em dash, as every other terrain message");
    }
}
