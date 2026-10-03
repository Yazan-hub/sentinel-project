#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 30. MA-2b: the stage IDS judge (StageIds) held to sentinel-core's validateElement on the shared fixture the bridge's
    //        matrixToIds test writes (WebApp/bridge/fixtures/lod-matrix/ids-cases.json) — and what Revit cannot read is "not
    //        read", never passed ──────────────────────────────────────────────────────────────────────────────────────────
    static void StageIdsChecks()
    {
        Console.WriteLine("\nMA-2b — the DD stage IDS judge (WebApp/bridge/fixtures/lod-matrix/ids-cases.json)");
        var fx = JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "lod-matrix", "ids-cases.json")));
        var ids = StageIds.FromIds(JsonDocument.Parse(fx["ids"].ToJsonString()).RootElement);
        Ok(ids.Specs.Select(s => s.Name).SequenceEqual(new[] { "Walls · DD", "Ceilings · DD", "Doors · DD" }) && ids.For("Walls").Entity == "IFCWALL"
           && ids.For("Walls").Required.SequenceEqual(new[] { "Pset_WallCommon.FireRating", "Pset_WallCommon.IsExternal", "Pset_WallCommon.LoadBearing" }),
           "the IDS reads as matrixToIds wrote it: one specification per class, its entity, its required properties");
        StageIds.Verdict V(string name)
        {
            var c = fx["cases"].AsArray().First(x => (string)x["name"] == name);
            var g = new GovElement { identity = new GovIdentity { Class = (string)c["identity"]["Class"] } };
            foreach (var ps in c["psets"].AsArray())
                g.psets.Add(new GovGroup { name = (string)ps["name"], rows = ps["rows"].AsArray().Select(r => new GovRow { name = (string)r["name"], value = (string)r["value"] }).ToList() });
            return ids.Judge(g.identity.Class, StageIds.ValuesOf(g), null);
        }
        int same = 0;
        foreach (var c in fx["cases"].AsArray())
        {
            var v = V((string)c["name"]);
            if (v.InScope == (bool)c["in_scope"] && v.Failed.SequenceEqual(c["failures"].AsArray().Select(x => (string)x))) same++;
            else Console.WriteLine($"        {(string)c["name"]}: C# [{string.Join(", ", v.Failed)}] in scope {v.InScope}");
        }
        Ok(fx["cases"].AsArray().Count == 8 && same == 8, $"every shared element ({same}/8): the same requirements fail as in validateElement, and the same elements are in scope");
        Ok(V("wall rated").Missing.Count == 0 && V("wall rated").NotRead.SequenceEqual(new[] { "Pset_WallCommon.LoadBearing" })
           && V("wall unrated").Missing.SequenceEqual(new[] { "Pset_WallCommon.FireRating" }) && V("door unrated").Missing.SequenceEqual(new[] { "Pset_DoorCommon.FireRating" })
           && V("ceiling").NotRead.SequenceEqual(new[] { "Pset_CoveringCommon.AcousticRating" }),
           "a property Revit reads and finds empty is MISSING; one Sentinel has no reader for (LoadBearing, a ceiling's AcousticRating) is NOT READ — never passed, never failed");
        var reply = StageIds.FromReply("{\"matrix\":\"lod_matrix@1 · office · abababababab…\",\"ids\":" + fx["ids"].ToJsonString() + ",\"unmatched\":" + fx["unmatched"].ToJsonString() + "}", out var re);
        Ok(re == null && reply.Matrix == "lod_matrix@1 · office · abababababab…"
           && reply.Unmatched.SequenceEqual(new[] { "Floors: Combustible — no standard property set holds Combustible for IFCSLAB — name it as Pset_X.Combustible" })
           && StageIds.FromReply("{\"message\":\"no lod_matrix\"}", out var bad) == null && bad.StartsWith("the DD IDS reply could not be read"),
           "the route's reply reads with the matrix's label and what matrixToIds could not place; a reply it cannot read is said, never an empty IDS");

        // The check before commit's words (design §3.4 step 5): what fails is said, with its rule; what cannot be read is said too.
        var unrated = V("wall unrated");
        var fails = new List<string> { StageIds.Line("W 312312", "Walls · DD", unrated) };
        Ok(fails[0] == "W 312312 (Walls · DD): missing Pset_WallCommon.FireRating" && StageIds.Line("W 1", "Walls · DD", V("wall rated")) == null,
           "an element that fails is one line: its label, the specification (the class and stage) and every missing property");
        Ok(StageIds.WentBack(1, "lod_matrix@2 · office · abababababab…") == "You went back at the DD IDS check — nothing was placed. 1 element(s) would have failed the DD IDS made from lod_matrix@2 · office · abababababab…."
           && StageIds.PlacedAnyway(fails, "lod_matrix@2") == "This changeset leaves 1 element(s) failing the DD IDS made from lod_matrix@2 — placed anyway, as the person chose: W 312312 (Walls · DD): missing Pset_WallCommon.FireRating",
           "going back and placing anyway are said in words, naming the matrix the IDS was made from");
        var many = Enumerable.Range(0, 26).Select(i => $"W {1000 + i} (Walls · DD): missing Pset_WallCommon.FireRating")
                             .Concat(new[] { "D 7 (Doors · DD): missing Pset_DoorCommon.FireRating", "W 9 (Walls · DD): missing Pset_WallCommon.FireRating, Pset_WallCommon.IsExternal" }).ToList();
        Ok(StageIds.Tally(many).SequenceEqual(new[] { "Walls · DD: missing Pset_WallCommon.FireRating — 26 element(s)", "Doors · DD: missing Pset_DoorCommon.FireRating — 1 element(s)",
                                                       "Walls · DD: missing Pset_WallCommon.FireRating, Pset_WallCommon.IsExternal — 1 element(s)" }),
           "drill MA2b F-MA2b-2: the DD IDS dialog counts every failing element by specification and missing properties — the 27th is in a line as the first is");
        Ok(StageIds.NotChecked(unrated.NotRead.Concat(V("wall rated").NotRead)) == "DD IDS: not checked for Pset_WallCommon.LoadBearing — Sentinel has no Revit reader for them, so they are neither passed nor failed"
           && StageIds.NotChecked(new string[0]) == null,
           "a property Revit cannot read is said beside the answer — never dropped, never passed");
        Ok(StageIds.NotJudged(new[] { "not in the DD IDS: Floors: Combustible — no standard property set holds Combustible for IFCSLAB — name it as Pset_X.Combustible",
                                      "W 312 is exported as IFCCOVERING, which the DD IDS for Walls (IFCWALL) does not judge" })
           == "DD IDS: not judged — not in the DD IDS: Floors: Combustible — no standard property set holds Combustible for IFCSLAB — name it as Pset_X.Combustible; "
              + "W 312 is exported as IFCCOVERING, which the DD IDS for Walls (IFCWALL) does not judge — neither passed nor failed"
           && StageIds.NotJudged(new string[0]) == null,
           "what the check did not judge — a property the IDS could not place, an element exported as another class — is said; \"every element passed\" is said only when nothing was left out");
        Ok(StageIds.Summary(3, new string[0], new string[0], new string[0], "lod_matrix@1") == "DD IDS: 3 element(s) judged, all passed (lod_matrix@1)"
           && StageIds.Summary(0, new string[0], new string[0], new string[0], "lod_matrix@1") == "DD IDS: nothing this changeset applied is asked anything by the DD IDS (lod_matrix@1)"
           && StageIds.Summary(1, fails, new[] { "Pset_WallCommon.LoadBearing" }, new string[0], "lod_matrix@1")
              == StageIds.PlacedAnyway(fails, "lod_matrix@1") + " " + StageIds.NotChecked(new[] { "Pset_WallCommon.LoadBearing" }),
           "the check before commit says how many elements it judged — never that every element passed when it judged none (review)");
        var b64 = new string('b', 64);
        var withSha = StageIds.FromReply("{\"matrix\":\"lod_matrix@2 · office · bbbbbbbbbbbb…\",\"sha256\":\"" + b64 + "\",\"ids\":" + fx["ids"].ToJsonString() + "}", out _);
        Ok(withSha.Sha == b64 && StageIds.NotFrom(withSha, b64, "lod_matrix@2 · office · bbbbbbbbbbbb…") == null
           && StageIds.NotFrom(withSha, new string('a', 64), "lod_matrix@1 · office · aaaaaaaaaaaa… (cached 09:15)")
              == "the DD IDS was made from lod_matrix@2 · office · bbbbbbbbbbbb…, not from the lod_matrix read (lod_matrix@1 · office · aaaaaaaaaaaa… (cached 09:15)) — run it again"
           && StageIds.NotFrom(reply, null, "none") != null,
           "the DD IDS and the matrix read are one matrix, by sha: an IDS made from another (a cached matrix, an install in between) is not used (review)");
    }

    // ── 31. MA-2b: the LOD state reader — at DD, below, blocked, not measured, per level and class, from Promote's own facts ──
    static void LodStateChecks(GuidelineMatcher m, GuidelineMatcher m2)
    {
        Console.WriteLine("\nMA-2b — the LOD state (LodState.Read over Promote's plan)");
        var mx = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd.json")), out _);
        mx.Properties["Walls"] = new List<string> { "Pset_WallCommon.FireRating" };
        StageIds Ids(params string[] wallProps) => StageIds.FromIds(JsonDocument.Parse(
            "{\"title\":\"t\",\"specifications\":[{\"name\":\"Walls · DD\",\"applicability\":{\"entity\":\"IFCWALL\"},\"requirements\":{\"properties\":[" +
            string.Join(",", wallProps.Select(p => $"{{\"pset\":\"{p.Split('.')[0]}\",\"name\":\"{p.Split('.')[1]}\",\"cardinality\":\"required\"}}")) + "]}}]}").RootElement);
        var walls = new List<WallFact>
        {
            W("OK1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("OK2", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("E1", "Generic - 200mm", "Exterior", 200),
            W("GRP1", "Generic - 200mm", "Exterior", 200, group: true),
            W("CW1", "Curtain Wall", "Exterior", 0, basic: false),
            W("BDS1", "BDS_EXT_ARC_STONE_300 mm", "Exterior", 300), // another office type: not counted
        };
        var plans = PromoteWallsPlanner.Plan(walls, Levels, DocTypes, m);
        string U(string label) => walls.First(w => w.Label == label).UniqueId;
        Dictionary<string, StageIds.Verdict> Props(StageIds ids, Dictionary<string, string> ok1, Dictionary<string, string> ok2) => new Dictionary<string, StageIds.Verdict>
        { [U("OK1")] = ids.Judge("IFCWALL", ok1, null), [U("OK2")] = ids.Judge("IFCWALL", ok2, null) };
        var rated = new Dictionary<string, string> { ["Pset_WallCommon.FireRating"] = "60" };
        var fire = Ids("Pset_WallCommon.FireRating");

        var r = LodState.Read(plans, mx, fire, null, Props(fire, rated, new Dictionary<string, string>()), null);
        var row = r.Rows.Single();
        Ok(row.Level == "Level 1" && row.Category == "Walls" && row.Total == 5 && row.At == 1 && row.Below == 2 && row.Blocked == 2 && row.NotMeasured == 0
           && row.Total == plans[0].Walls && plans[0].DdNow == 2,
           "Level 1 · Walls: 5 counted (the DD-now denominator — the other office type left out), 1 at DD, 2 below, 2 blocked; DD now (rules only) was 2");
        Ok(row.Reasons.Any(kv => kv.Key == "missing Pset_WallCommon.FireRating" && kv.Value == 1)
           && row.Reasons.Any(kv => kv.Key == "in a group — Sentinel does not edit group members")
           && row.Reasons.Any(kv => kv.Key == "not a basic wall — Promote v0 types basic walls only")
           && row.Reasons.Any(kv => kv.Key == "not on a DD type — Promote proposes a retype") && row.Reasons.Any(kv => kv.Key == "top not at the next story — Promote proposes an attach"),
           "the reasons: a missing property, the two blocks, and what Promote proposes for the concept wall");
        Ok(r.Line == "DD → design: 1 of 5 at DD (20%) · 2 below · 2 blocked · 0 not measured · 1 on other office types, not counted" && r.Share == 20 && r.OfficeTyped == 1,
           "the line every surface prints: the stage, its project stage (D18), the counts and the share — and the elements on the office's other types, left out of the count, named (review)");
        Ok(r.LevelLines()[0].StartsWith("Level 1 · Walls: 1 at DD, 2 below, 2 blocked, 0 not measured (") && r.LevelLines()[0].EndsWith("; …)"),
           "per level and class: the counts and the two commonest reasons");

        var twoProps = Ids("Pset_WallCommon.FireRating", "Pset_WallCommon.LoadBearing");
        mx.Properties["Walls"] = new List<string> { "Pset_WallCommon.FireRating", "Pset_WallCommon.LoadBearing" };
        var nr = LodState.Read(plans, mx, twoProps, null, Props(twoProps, rated, rated), null).Rows.Single();
        Ok(nr.At == 0 && nr.NotMeasured == 2 && nr.Reasons.Any(kv => kv.Key == "no Revit reader for Pset_WallCommon.LoadBearing" && kv.Value == 2),
           "a property Revit cannot read makes the wall NOT MEASURED, named — never at DD");
        var none = LodState.Read(plans, mx, null, "bridge unreachable (timed out after 4 s)", new Dictionary<string, StageIds.Verdict>(), null).Rows.Single();
        Ok(none.At == 0 && none.NotMeasured == 2 && none.Reasons.Any(kv => kv.Key == "the DD IDS was not read: bridge unreachable (timed out after 4 s)"),
           "with the DD IDS not read, the walls the rules pass are NOT MEASURED, with why");
        mx.Properties["Walls"] = new List<string>();
        var rulesOnly = LodState.Read(plans, mx, null, "no matrix ids", new Dictionary<string, StageIds.Verdict>(), new[] { "Floors: no DD row in the LOD matrix" });
        Ok(rulesOnly.At == 2 && rulesOnly.Line.EndsWith(" · Floors not measured"), "a class whose DD asks no property is at DD by its rules alone; a class not run is named not measured");
        var wallSpec = fire.For("Walls");
        var exported = LodState.Read(plans, new LodMatrix { StageMap = mx.StageMap, Properties = { ["Walls"] = new List<string> { "Pset_WallCommon.FireRating" } } },
                                     fire, null, new Dictionary<string, StageIds.Verdict> { [U("OK1")] = fire.Judge("IFCCOVERING", rated, null, wallSpec), [U("OK2")] = fire.Judge("IFCWALL", rated, null, wallSpec) }, null).Rows.Single();
        Ok(exported.At == 1 && exported.NotMeasured == 1 && exported.Reasons.Any(kv => kv.Key == "exported as IFCCOVERING, which the DD IDS for Walls (IFCWALL) does not judge"),
           "a wall exported as another IFC class is NOT MEASURED — the DD IDS does not apply to it");
        var noSpec = LodState.Read(plans, new LodMatrix { StageMap = mx.StageMap, Properties = { ["Walls"] = new List<string> { "Pset_WallCommon.FireRating" } } },
                                   StageIds.FromIds(JsonDocument.Parse("{\"title\":\"t\",\"specifications\":[]}").RootElement), null, new Dictionary<string, StageIds.Verdict>(), null).Rows.Single();
        Ok(noSpec.At == 0 && noSpec.NotMeasured == 2 && noSpec.Reasons.Any(kv => kv.Key == "the DD IDS names no Walls specification — the matrix asks Pset_WallCommon.FireRating"),
           "the matrix asks a property and the DD IDS has no specification for the class: NOT MEASURED, never at DD on its rules alone");
        var share = LodState.Read(plans, mx, null, "no matrix ids", new Dictionary<string, StageIds.Verdict>(), new[] { "Floors: no DD row in the LOD matrix", "Roofs: BDS DD v1 has no Roofs rules" });
        Ok(share.Share == null && share.Unmeasured.SequenceEqual(new[] { "Roofs: BDS DD v1 has no Roofs rules" }) && share.At == 2 && share.Line.StartsWith("DD → design: 2 of 5 at DD · ")
           && rulesOnly.Share == 40,
           "the share is not measured while a class the matrix asks for was not run (Roofs) — a class with no DD row (Floors) asks nothing and leaves it");

        var doors = V1(m2, new[]
        {
            Dw("door", "D1", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", 1000, 2100, host: "BDS_INT_ARC_GYPS_100 mm"),
            Dw("door", "D2", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, set: f => f.InGroup = true),
        }, classes: new[] { "Doors" });
        Ok(doors[0].Lod.Count == doors[0].Others["Doors"].Total && doors[0].Lod.Single(f => f.Blocked).Category == "Doors" && doors[0].Lod.Count(f => f.RulesOk) == doors[0].Others["Doors"].DdNow,
           "doors: one fact per counted door — the grouped one blocked, the settled hosted one at DD by its rules, as DD now counts them");
        var dmx = new LodMatrix { StageMap = mx.StageMap, Properties = { ["Doors"] = new List<string> { "Pset_DoorCommon.FireRating" } } };
        var dw = StageIds.FromIds(JsonDocument.Parse(
            "{\"title\":\"t\",\"specifications\":[{\"name\":\"Doors · DD\",\"applicability\":{\"entity\":\"IFCDOOR\"},\"requirements\":{\"properties\":[{\"pset\":\"Pset_DoorCommon\",\"name\":\"FireRating\",\"cardinality\":\"required\"}]}}," +
            "{\"name\":\"Windows · DD\",\"applicability\":{\"entity\":\"IFCWINDOW\"},\"requirements\":{\"properties\":[{\"pset\":\"Pset_WindowCommon\",\"name\":\"ThermalTransmittance\",\"cardinality\":\"required\"}]}}]}").RootElement);
        string d1 = doors[0].Lod.Single(f => f.RulesOk).UniqueId;
        var asWindow = LodState.Read(doors, dmx, dw, null, new Dictionary<string, StageIds.Verdict>
            { [d1] = dw.Judge("IFCWINDOW", new Dictionary<string, string> { ["Pset_WindowCommon.ThermalTransmittance"] = "1.4" }, null, dw.For("Doors")) }, null).Rows.Single();
        Ok(asWindow.At == 0 && asWindow.NotMeasured == 1 && asWindow.Reasons.Any(kv => kv.Key == "exported as IFCWINDOW, which the DD IDS for Doors (IFCDOOR) does not judge")
           && dw.Judge("IFCWINDOW", new Dictionary<string, string> { ["Pset_WindowCommon.ThermalTransmittance"] = "1.4" }, null).InScope,
           "a door exported as IFCWINDOW is judged against the Doors specification only — NOT MEASURED, never at DD on a window's passing U-value");
        var loose = V1(m2, new[] { Dw("door", "D3", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", 1000, 2100, host: null) }, classes: new[] { "Doors" });
        var looseRow = LodState.Read(loose, dmx, null, "x", new Dictionary<string, StageIds.Verdict>(), null).Rows.Single();
        Ok(looseRow.Below == 1 && looseRow.Reasons.Single().Key == "on a DD type, but no wall hosts it — Promote does not rehost; a person decides",
           "a settled door no wall hosts reads below DD with its reason — never a count with nothing to act on");

        mx.StageMap["DD"] = "coord";
        var report = LodState.Read(plans, new LodMatrix { StageMap = mx.StageMap }, null, "x", new Dictionary<string, StageIds.Verdict>(), null);
        report.MatrixSha = new string('a', 64);
        var body = JsonSerializer.Serialize(CommandReports.LodState(report, new[] { "cs-1" }, "lead@office.example"));
        var j = JsonNode.Parse(body);
        Ok((string)j["entity_type"] == "lod_state" && (string)j["action"] == "lod:state now · DD → coord: 2 of 5 at DD (40%) · 1 below · 2 blocked · 0 not measured · 1 on other office types, not counted"
           && (int)j["new_value"]["office_typed"] == 1
           && (int)j["new_value"]["share"] == 40 && (int)j["new_value"]["total"] == 5 && (string)j["new_value"]["project_stage"] == "coord"
           && (string)j["new_value"]["rows"][0]["category"] == "Walls" && (int)j["new_value"]["rows"][0]["blocked"] == 2 && (int)j["new_value"]["rows_total"] == 1
           && (string)j["new_value"]["changesets"][0] == "cs-1" && (string)j["new_value"]["source"] == "revit" && (string)j["new_value"]["matrix_sha256"] == new string('a', 64),
           "one lod_state row per run: the line as its action, the share, the project stage the matrix maps DD to, the matrix's sha, the rows with their reasons");
    }
}
