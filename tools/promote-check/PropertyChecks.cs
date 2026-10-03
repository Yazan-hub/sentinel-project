#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    static JsonObject ValueSources() =>
        JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "value-sources.json"))).AsObject();

    // ── 33. MA-2c: where a set_parameter's value comes from — the add-in's reading of the shared fixture the bridge's
    //        changesets-typing reads (CATALOG_PARAM, KIND_ENTITY, clauseValues): one table, one reading of the clauses ─────────
    static void ValueSourceChecks()
    {
        Console.WriteLine("\nMA-2c — value sources (WebApp/bridge/fixtures/changeset-ops/value-sources.json)");
        var vs = ValueSources();
        var cp = vs["catalog_param"].AsObject();
        Ok(cp.Count == PropertyPlanner.CatalogParam.Count && cp.All(kv => PropertyPlanner.CatalogParam.TryGetValue(kv.Key, out var v) && v == (string)kv.Value),
           "the catalogue parameter of each DD property is the bridge's CATALOG_PARAM");
        var ke = vs["kind_entity"].AsObject();
        Ok(ke.Count == PromoteWallsPlanner.Classes.Count && ke.All(kv => PromoteWallsPlanner.Classes[kv.Key].Ifc.ToUpperInvariant() == (string)kv.Value)
           && PropertyPlanner.Entity("Ceilings") == "IFCCOVERING",
           "each Promote kind's IFC entity is the bridge's KIND_ENTITY");
        var cl = Clauses.FromIds(vs["ids"].ToJsonString(), "ids@1 · project · 0a1b2c3d4e5f…", out var err);
        var cases = vs["clauses"].AsArray();
        int same = 0;
        foreach (var c in cases)
        {
            var got = cl.For((string)c["entity"], (string)c["key"]);
            bool ok = got.Select(x => x.Value).SequenceEqual(c["values"].AsArray().Select(x => (string)x))
                      && (c["spec"] == null || (got[0].Spec == (string)c["spec"] && got[0].Sentence == (string)c["sentence"]));
            if (ok) same++;
            else Console.WriteLine($"        {(string)c["name"]}: got [{string.Join(", ", got.Select(x => x.Value))}]");
        }
        Ok(err == null && cl.Installed && cases.Count == 7 && same == cases.Count
           && cl.Floors("IFCCOVERING", "Pset_CoveringCommon.FireRating").Select(x => x.Spec).SequenceEqual(new[] { "Ceilings at least REI30" }),
           $"every shared clause case ({same}/{cases.Count}) reads as the bridge's clauseValues: a whole-class clause's one exact value, nothing else — a floor (\"at least …\") is kept apart, never a value (C7)");
        var bad = Clauses.FromIds("{", "ids@1 · project · 0a1b2c3d4e5f…", out var be);
        Ok(be != null && bad.For("IFCDOOR", "Pset_DoorCommon.FireRating").Count == 0 && bad.Label.StartsWith("ids@1 · project · 0a1b2c3d4e5f… did not parse: "),
           "an ids@n body that does not parse cites nothing, and says so");
        var m = GuidelineMatcher.FromBodies(null, vs["catalog"].ToJsonString(), out _, out var ce);
        Ok(ce == null && m.CatalogValue("Walls", null, "BDS_EXT_ARC_CMU_200 mm", "Fire Rating") == "60 min"
           && m.CatalogValue("Walls", null, "BDS_INT_ARC_GYPS_100 mm", "Fire Rating") == null
           && m.CatalogValue("Doors", "BDS_INT_2 PNL", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "Fire Rating") == "FD60"
           && m.CatalogValue("Doors", "BDS_INT_1 PNL", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "Fire Rating") == null,
           "a catalogue row gives its harvested parameter for exactly its type (and family): filled, or none");
        var real = GuidelineMatcher.FromBodies(null, File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        Ok(real.CatalogValue("Walls", null, "BDS_EXT_ARC_CMU_200 mm", "Fire Rating") == null && real.CatalogValue("Walls", null, "Interior - 121mm Partition (1-hr)", "Fire Rating") == "1 HR"
           && real.CatalogValue("Doors", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", "Fire Rating") == null,
           "the BDS pilot catalogue gives no Fire Rating for the types the DD rules produce (drill MA2b) — only its stock partitions carry one");
    }

    // ── 34. MA-2c: the DD properties Promote fills (PropertyPlanner) and the body it files, held to the fixture the bridge
    //        validates (WebApp/bridge/fixtures/changeset-ops/set-parameter-body.json) ─────────────────────────────────────────────
    static void PropertyPlannerChecks()
    {
        Console.WriteLine("\nMA-2c — the DD properties Promote fills (PropertyPlanner; WebApp/bridge/fixtures/changeset-ops/set-parameter-body.json)");
        var vs = ValueSources();
        var m = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json")), vs["catalog"].ToJsonString(), out _, out _);
        m.CatalogLabel = "type_catalog@1 · office · fedcba987654…";
        var mx = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd-ma2b.json")), out _);
        var clauses = Clauses.FromIds(vs["ids"].ToJsonString(), "ids@1 · project · 0a1b2c3d4e5f…", out _);
        string U(int n) => $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{n:x8}";
        ElementFact At(ElementFact f, int n) { f.UniqueId = U(n); return f; }
        var walls = new List<WallFact>
        {
            new WallFact { UniqueId = U(0x190), Label = "W 312312", TypeName = "Generic - 200mm", Function = "Exterior", WidthMm = 200, BaseLevel = "Level 1", TopLevel = "Level 2", IsBasic = true },
            new WallFact { UniqueId = U(0x191), Label = "W 312313", TypeName = "BDS_INT_ARC_GYPS_100 mm", Function = "Interior", WidthMm = 100, BaseLevel = "Level 1", TopLevel = "Level 2", IsBasic = true },
        };
        var others = new List<ElementFact>
        {
            At(Dw("door", "Door 404", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100), 0x194),
            At(Dw("door", "Door 405", "BDS_INT_2 PNL", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", 2000, 2100, host: "BDS_INT_ARC_GYPS_100 mm"), 0x195),
        };
        TypeValue TV(string cat, string fam, string type, int n, int instances, string current = "", string noWriter = null) => new TypeValue
        {
            Category = cat, Family = fam, Type = type, UniqueId = U(n), Key = cat == "Walls" ? "Pset_WallCommon.FireRating" : "Pset_DoorCommon.FireRating",
            Current = current, Param = "Fire Rating", NoWriter = noWriter, Instances = instances,
        };
        var values = new List<TypeValue>
        {
            TV("Walls", null, "BDS_EXT_ARC_CMU_200 mm", 0xa01, 0), TV("Walls", null, "BDS_INT_ARC_GYPS_100 mm", 0xa02, 1),
            TV("Doors", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", 0xa03, 0), TV("Doors", "BDS_INT_2 PNL", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", 0xa04, 1),
        };

        var plans = V1(m, others, walls);
        var types = PropertyPlanner.DdTypes(plans, mx);
        Ok(types.Select(t => t.Type).SequenceEqual(new[] { "BDS_INT_ARC_GYPS_100 mm", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" })
           && types[1].Family == "BDS_INT_2 PNL" && types[0].Family == null,
           "the DD types the plan lands elements on: the settled ones first, then the retype targets, once each (" + string.Join(", ", types.Select(t => t.Type)) + ")");
        var rep = PropertyPlanner.Plan(plans, mx, values, m, clauses);
        var p = plans.Single();
        string O(string type) => rep.Rows.FirstOrDefault(r => r.Label.EndsWith(type))?.Outcome;
        Ok(O("BDS_EXT_ARC_CMU_200 mm") == "write" && O("BDS_INT_1 PNL_WOOD_1000 x 2100 mm") == "write" && O("BDS_INT_ARC_GYPS_100 mm") == "no source"
           && O("BDS_INT_2 PNL_WOOD_2000 x 2100 mm") == "disagree" && rep.Rows.Count == 4,
           "a source writes; no source, and a catalogue and a clause that disagree, go to a person — never a pick");
        var cmu = p.Ghosts.Single(g => g.Op == "set_parameter" && g.TypeName == "BDS_EXT_ARC_CMU_200 mm");
        var door = p.Ghosts.Single(g => g.Op == "set_parameter" && g.FamilyName == "BDS_INT_1 PNL");
        Ok(cmu.Kind == "wall" && cmu.UniqueId == U(0xa01) && cmu.From == "" && cmu.To == "60 min" && cmu.SourceKind == "catalogue" && cmu.RevitParameter == "Fire Rating"
           && cmu.Reason == "DD walls: Pset_WallCommon.FireRating \"60 min\" from type_catalog@1 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating — a type edit: every element on BDS_EXT_ARC_CMU_200 mm reads it (0 in the model now, 1 more that this changeset retypes onto it)",
           "the catalogue row of exactly the target type gives the wall type's Fire Rating; the reason says it is a type edit and how many elements read it");
        Ok(door.Kind == "door" && door.To == "FD30" && door.SourceKind == "clause"
           && door.Reason.Contains("from ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · \"All doors shall be FD30.\""),
           "a whole-class clause of the installed ids@n gives the door type's Fire Rating, cited with its sentence");
        Ok(p.ToPerson.Count == 2 && p.ToPerson[0].UniqueId == U(0xa02) && p.ToPerson[0].Label == "type BDS_INT_ARC_GYPS_100 mm · Pset_WallCommon.FireRating"
           && p.ToPerson[0].Reason == "no source for Pset_WallCommon.FireRating on BDS_INT_ARC_GYPS_100 mm — type_catalog@1 · office · fedcba987654… gives no Fire Rating for it, and no clause of ids@1 · project · 0a1b2c3d4e5f… pins one; a person fills it in Revit (Type Properties) — 1 element(s) on it"
           && p.ToPerson[1].Reason.StartsWith("the sources disagree on Pset_DoorCommon.FireRating for BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm: \"FD60\" (type_catalog@1"),
           "each property sent to a person names the type, the property and why");
        // C11: the matrix's Pset_WallCommon.IsExternal is held off the type on each DD wall type (no TypeValue: Revit reads it from the
        // Function) — counted, never silent. C3: each ✎ line says how many elements read the type (the planner's own count).
        Ok(rep.Line == "DD properties: 2 type edit(s) from a cited source (never pre-ticked) · 1 with no source — sent to a person (1 element(s) on those types) · 1 sent to a person for another reason · 2 held off the type (instance, IsExternal from Function, or not read) — not planned"
           && rep.NotOnType == 2
           && rep.Lines()[2] == "✎ Walls · BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating → \"60 min\" (type_catalog@1 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating) — 1 element(s) read the type",
           "Promote's header line counts what is written, what has no source and what is not on the type (drill MA2 records it); each type edit says its reach");

        // Nothing written over a filled value — one its source contradicts goes to a person (C11) —, a property the type does not hold
        // is counted, not touched, and nothing a writer cannot write.
        var filled = PropertyPlanner.Plan(V1(m, others, walls), mx, values.Select(v => v.Type == "BDS_EXT_ARC_CMU_200 mm" ? TV("Walls", null, v.Type, 0xa01, 0, "120 min") : v).ToList(), m, clauses);
        var notHeld = PropertyPlanner.Plan(V1(m, others, walls), mx, values.Where(v => v.Type != "BDS_EXT_ARC_CMU_200 mm").ToList(), m, clauses);
        var noWriter = V1(m, others, walls);
        var nw = PropertyPlanner.Plan(noWriter, mx, values.Select(v => v.Type == "BDS_EXT_ARC_CMU_200 mm" ? TV("Walls", null, v.Type, 0xa01, 0, "", "Fire Rating is read-only on the type") : v).ToList(), m, clauses);
        var differs = filled.Rows.SingleOrDefault(r => r.Label == "BDS_EXT_ARC_CMU_200 mm");
        Ok(differs?.Outcome == "differs" && filled.Written == 1
           && differs.Why == "Pset_WallCommon.FireRating on BDS_EXT_ARC_CMU_200 mm reads \"120 min\", type_catalog@1 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating gives \"60 min\" — not overwritten; a person decides"
           && filled.Line.Contains(" · 2 sent to a person for another reason")
           && notHeld.Rows.All(r => r.Label != "BDS_EXT_ARC_CMU_200 mm") && notHeld.NotOnType == 3
           && nw.Rows.Single(r => r.Label == "BDS_EXT_ARC_CMU_200 mm").Outcome == "no writer"
           && noWriter.Single().Ghosts.All(g => g.TypeName != "BDS_EXT_ARC_CMU_200 mm" || g.Op == "retype")
           && noWriter.Single().ToPerson.Any(h => h.Reason.EndsWith("but Fire Rating is read-only on the type — a person sets it in Revit")),
           "a filled value is never overwritten — one its source contradicts goes to a person, said; a property the type does not hold is counted, not touched; one Revit cannot write goes to a person with the value and why (C11)");

        // C7 (S8): a clause that sets a minimum is not a value — a wall floor clause of its own (the shared ids keep the wall cases' words).
        var floorIds = Clauses.FromIds("{\"specifications\":[{\"name\":\"Walls at least REI60\",\"applicability\":{\"entity\":\"IFCWALL\"}," +
            "\"requirements\":{\"properties\":[{\"pset\":\"Pset_WallCommon\",\"name\":\"FireRating\",\"value\":\"REI60\",\"cardinality\":\"required\"}]}," +
            "\"source_sentence\":\"All walls shall be at least REI60.\"}]}", "ids@2 · project · 1a2b3c4d5e6f…", out _);
        var fl = PropertyPlanner.Plan(V1(m, others, walls), mx, values, m, floorIds);
        Ok(floorIds.For("IFCWALL", "Pset_WallCommon.FireRating").Count == 0
           && fl.Rows.Single(r => r.Label == "BDS_INT_ARC_GYPS_100 mm").Why == "no source for Pset_WallCommon.FireRating on BDS_INT_ARC_GYPS_100 mm — type_catalog@1 · office · fedcba987654… gives no Fire Rating for it, and ids@2 · project · 1a2b3c4d5e6f… · Walls at least REI60 sets a minimum (\"All walls shall be at least REI60.\"), not a value; a person fills it in Revit (Type Properties) — 1 element(s) on it"
           && fl.Rows.Single(r => r.Label == "BDS_EXT_ARC_CMU_200 mm").Outcome == "write",
           "a clause that sets a minimum (\"at least …\") is never written, and the person is told so; the catalogue still gives its own type's value (C7)");
        var none = PropertyPlanner.Plan(V1(m, others, walls), mx, values, m, Clauses.None("none — not installed for ma2c or its office"));
        Ok(none.Rows.Single(r => r.Label == "BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm").Why.Contains("and no ids@n is installed to cite (none — not installed for ma2c or its office)"),
           "with no ids@n installed, a property with no catalogue value says there is no clause to cite");

        // The body, held to the fixture the bridge validates; read back into the add-in's DTOs.
        var got = Json(PromoteWallsPlanner.Bodies(plans, "yazan", title: "Promote (DD)")).Single();
        var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "set-parameter-body.json");
        var text = File.Exists(path) ? File.ReadAllText(path) : "null";
        bool same = JsonNode.DeepEquals(got, JsonNode.Parse(text));
        Ok(same, "the planner's body with its set_parameter rows equals the fixture the bridge validates");
        if (!same) Console.WriteLine("        got: " + got.ToJsonString(new JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        var cs = same ? JsonSerializer.Deserialize<ChangesetDto>(text) : null;
        var sp = cs?.Elements.FirstOrDefault(e => e.Op == "set_parameter");
        Ok(sp != null && sp.Parameter == "Pset_WallCommon.FireRating" && sp.From == "" && sp.To == "60 min" && sp.ValueSource?.Kind == "catalogue"
           && sp.Target.UniqueId == U(0xa01) && sp.Place.TypeName == "BDS_EXT_ARC_CMU_200 mm" && cs.Exceptions.Count == 2,
           "a set_parameter reads into ChangesetElementDto (Parameter, From, To, ValueSource); the properties sent to a person into the exceptions");
        if (sp != null) sp.Pretick = true;
        Ok(sp != null && !ChangesetTrust.PreTick(cs, sp), "a set_parameter is never pre-ticked, whatever a bridge answers (founder decision F1)");

        // C8: a type edit rides first in its storey's ghosts, so a storey of several chunks files it in the first.
        var chunkPlans = V1(m, others, walls);
        PropertyPlanner.Plan(chunkPlans, mx, values, m, clauses);
        var chunks = Json(PromoteWallsPlanner.Bodies(chunkPlans, "yazan", max: 3, title: "Promote (DD)"));
        Ok(chunks.Count == 2 && chunks[0]["elements"].AsArray().Count(e => (string)e["op"] == "set_parameter") == 2
           && chunks[1]["elements"].AsArray().All(e => (string)e["op"] == "retype"),
           "a storey filed in several changesets carries its type edits in the first (C8)");

        // C4: a body the bridge refused for a set_parameter's source is filed again without its type edits — each an exception that
        // says why; a body of type edits only is not filed again.
        var again = PropertyPlanner.WithoutWrites(PromoteWallsPlanner.Bodies(plans, "yazan", title: "Promote (DD)")[0],
            "Bridge 400: elements[2]: set_parameter's value_source: the sources disagree", out var dropped);
        var an = again == null ? null : JsonSerializer.SerializeToNode(again, ChangesetClient.WriteJson);
        Ok(dropped == 2 && an != null && an["elements"].AsArray().Count == 2 && an["elements"].AsArray().All(e => (string)e["op"] == "retype")
           && an["exceptions"].AsArray().Count == 4
           && (string)an["exceptions"][2]["unique_id"] == U(0xa01) && (string)an["exceptions"][2]["name"] == "type BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating"
           && (string)an["exceptions"][2]["reason"] == "not filed: the bridge refused its source — Bridge 400: elements[2]: set_parameter's value_source: the sources disagree; a person fills it in Revit (Type Properties)"
           && (string)an["exceptions"][3]["name"] == "type BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm · Pset_DoorCommon.FireRating"
           && PropertyPlanner.WithoutWrites(new { elements = new[] { new { op = "set_parameter" } } }, "x", out var none2) == null && none2 == 1,
           "a body refused for a set_parameter is filed again without its type edits, each an exception that says why; one of type edits only is not (C4)");
    }
}
