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
        var kp = vs["kind_pset"]?.AsObject();
        Ok(kp != null && kp.Count == PropertyPlanner.KindPset.Count && kp.All(kv => PropertyPlanner.KindPset.TryGetValue(kv.Key, out var v) && v == (string)kv.Value),
           "the property set each kind may write is the bridge's KIND_PSET (review C19)");
        var cn = vs["class_noun"]?.AsObject();
        Ok(cn != null && cn.Count == Clauses.ClassNoun.Count && cn.All(kv => Clauses.ClassNoun.TryGetValue(kv.Key, out var w) && w.SequenceEqual(kv.Value.AsArray().Select(x => (string)x))),
           "the noun a whole-class sentence names each entity by is the bridge's CLASS_NOUN (review C23)");
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
        Ok(err == null && cl.Installed && cases.Count == 13 && same == cases.Count
           && cl.NotValues("IFCCOVERING", "Pset_CoveringCommon.FireRating").Select(x => x.Spec + " " + x.Why).SequenceEqual(new[] { "Ceilings at least REI30 it states \"at least REI30\", not \"REI30\" — a person decides" })
           && cl.NotValues("IFCWALL", "Pset_WallCommon.AcousticRating").Select(x => x.Why).SequenceEqual(new[] { "it is not worded \"the acoustic rating of all walls shall be Rw 45.\" — a person decides" })
           && cl.Unreadable("Pset_RoofCommon.AcousticRating") == 6,
           $"every shared clause case ({same}/{cases.Count}) reads as the bridge's clauseValues: a whole-class clause's one exact value, nothing else — a floor (\"at least …\") is kept apart, never a value (C7)");
        // Review C23: a cited value is ONE value — a rating token or a number with a time unit — and a sentence ends with it. The
        // bridge's notAValue answers every case the same (vitest reads them too): a case the two sides answer differently fails here.
        static string Judge(JsonNode c) => Clauses.NotAValue((string)c["sentence"], (string)c["value"], (string)c["entity"] ?? "IFCDOOR", (string)c["key"] ?? "Pset_DoorCommon.FireRating");
        var vc = vs["value_cases"]?.AsArray();
        var differ = vc == null ? new List<string> { "no value_cases" } : vc.Where(c => Judge(c) != (string)c["why"])
            .Select(c => $"{(string)c["value"]} / {(string)c["sentence"]}: got {Judge(c) ?? "cited"}").ToList();
        foreach (var d in differ.Take(8)) Console.WriteLine("        " + d);
        Ok(vc?.Count == 249 && differ.Count == 0 && vc.Count(c => c["why"] == null) == 75,
           $"every shared value case ({(vc?.Count ?? 0) - differ.Count}/{vc?.Count ?? 0}) reads as the bridge's notAValue: one rating token or one number with a time unit, the sentence ending with it — a bound, a choice, a qualifier or a narrowing tail goes to a person (C23)");
        // Review C23 (context): a sentence is cited only when compileIds marked it source_alone — its document said nothing but
        // whole-class one-value sentences. The specifications are compileIds' own (vitest holds them to it); both sides cite alike.
        var dc = vs["document_cases"]?.AsArray();
        var docDiffer = dc == null ? new List<string> { "no document_cases" } : dc.Where(c =>
            !Clauses.FromIds(new JsonObject { ["specifications"] = c["specifications"].DeepClone() }.ToJsonString(), "ids@1", out _)
                .For((string)c["entity"], (string)c["key"]).Select(x => x.Value).SequenceEqual(c["values"].AsArray().Select(x => (string)x)))
            .Select(c => (string)c["text"]).ToList();
        foreach (var d in docDiffer.Take(8)) Console.WriteLine("        " + d.Replace("\n", " / "));
        Ok(dc?.Count == 46 && docDiffer.Count == 0 && dc.Count(c => c["values"].AsArray().Count > 0) == 8
           && cl.NotValues("IFCWALL", "Pset_WallCommon.ThermalTransmittance").Select(x => x.Why).SequenceEqual(new[] { Clauses.NotAlone }),
           $"every shared document ({(dc?.Count ?? 0) - docDiffer.Count}/{dc?.Count ?? 0}) cites as the bridge's clauseValues: a heading, a place before a colon, a wrapped \"or better.\", an exception after it — the sentence is not cited unless its document said nothing else (C23 context)");
        var deep = "{\"specifications\":[{\"name\":\"d\",\"applicability\":{\"entity\":\"IFCDOOR\"},\"source_sentence\":\"All doors shall be FD30.\",\"source_alone\":true,\"x\":" + new string('[', 80) + new string(']', 80)
                   + ",\"requirements\":{\"properties\":[{\"pset\":\"Pset_DoorCommon\",\"name\":\"FireRating\",\"value\":\"FD30\",\"cardinality\":\"required\"}]}}]}";
        Ok(Clauses.FromIds(deep, "ids@1", out var de).For("IFCDOOR", "Pset_DoorCommon.FireRating").Select(x => x.Value).SequenceEqual(new[] { "FD30" }) && de == null,
           "an ids@n nested deeper than 64 levels is read, as the bridge reads it (C23)");
        var trims = vs["catalog_trim"]?.AsArray();
        Ok(trims?.Count == 5 && trims.All(t =>
           {
               var row = vs["catalog"]["types"][0].DeepClone().AsObject();
               row["params"] = new JsonObject { ["Fire Rating"] = (string)t["raw"] };
               var cm = GuidelineMatcher.FromBodies(null, new JsonObject { ["types"] = new JsonArray(row) }.ToJsonString(), out _, out _);
               return cm.CatalogValue("Walls", null, (string)row["type"], "Fire Rating") == (string)t["value"]
                      && (PropertyPlanner.Catalogued(cm, "Walls", null, (string)row["type"], "Pset_WallCommon.FireRating").Why == null) == (bool)t["cited"];
           }),
           "a catalogue value is trimmed of ASCII blanks only, as the bridge's makeCiter trims it (U+0085, U+FEFF, U+00A0 kept on both sides), and what is left is one value or no source (C23)");
        // Review C23 (whole class, one source): a clause is the class's only when its pattern matches every IFC class the entity is
        // exported as; a clause that says more of the key than the value sends it to a person. The bridge's ENTITY_SUBTYPES, clauseValues, saysMore.
        var es = vs["entity_subtypes"]?.AsObject();
        Ok(es != null && es.Count == Clauses.Subtypes.Count && es.All(kv => Clauses.Subtypes.TryGetValue(kv.Key, out var w) && w.SequenceEqual(kv.Value.AsArray().Select(x => (string)x))),
           "the IFC classes each entity is exported as are the bridge's ENTITY_SUBTYPES (review C23)");
        var ic = vs["ids_cases"]?.AsArray();
        var icDiffer = ic == null ? new List<string> { "no ids_cases" } : ic.Where(c =>
        {
            var x = Clauses.FromIds(new JsonObject { ["specifications"] = c["specifications"].DeepClone() }.ToJsonString(), "ids@1", out _);
            return !x.For((string)c["entity"], (string)c["key"]).Select(h => h.Value).SequenceEqual(c["values"].AsArray().Select(v => (string)v))
                   || x.SaysMore((string)c["entity"], (string)c["key"], (string)c["value"])?.Spec != (string)c["more"];
        }).Select(c => (string)c["name"]).ToList();
        foreach (var d in icDiffer.Take(8)) Console.WriteLine("        " + d);
        Ok(ic?.Count == 50 && icDiffer.Count == 0,
           $"every shared ids case ({(ic?.Count ?? 0) - icDiffer.Count}/{ic?.Count ?? 0}) cites and says more as the bridge does: \"^IFCWALL$\" is no IFCWALLSTANDARDCASE's, a source_sentence not text is no sentence, a pattern, optional, prohibited, narrower or uncited clause of another value goes to a person (C23)");
        var cc = vs["catalog_cases"]?.AsArray();
        var ccDiffer = cc == null ? new List<string> { "no catalog_cases" } : cc.Where(c =>
        {
            var cm = GuidelineMatcher.FromBodies(null, new JsonObject { ["types"] = new JsonArray(c["row"].DeepClone()) }.ToJsonString(), out _, out _);
            var (cv, why) = PropertyPlanner.Catalogued(cm, "Doors", (string)c["family"], (string)c["type"], "Pset_DoorCommon.FireRating");
            return (cv == (string)c["value"] && why == null) != (bool)c["cited"];
        }).Select(c => (string)c["name"]).ToList();
        foreach (var d in ccDiffer.Take(8)) Console.WriteLine("        " + d);
        Ok(cc?.Count == 21 && ccDiffer.Count == 0,
           $"every shared catalogue case ({(cc?.Count ?? 0) - ccDiffer.Count}/{cc?.Count ?? 0}) cites as the bridge's makeCiter: exactly that type (ASCII blanks and letters only — NEL, BOM, the Kelvin sign are other names) and one value (\"TBC\", \"FD30 or FD60\" are none) (C23)");
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
           && fl.Rows.Single(r => r.Label == "BDS_INT_ARC_GYPS_100 mm").Why == "no source for Pset_WallCommon.FireRating on BDS_INT_ARC_GYPS_100 mm — type_catalog@1 · office · fedcba987654… gives no Fire Rating for it, and ids@2 · project · 1a2b3c4d5e6f… · Walls at least REI60 (\"All walls shall be at least REI60.\"): it states \"at least REI60\", not \"REI60\" — a person decides; a person fills it in Revit (Type Properties) — 1 element(s) on it"
           && fl.Rows.Single(r => r.Label == "BDS_EXT_ARC_CMU_200 mm").Outcome == "disagree",
           "a clause that sets a minimum (\"at least …\") is never written, and the person is told so; and the catalogue's own value is not written past it either: the gate holds every wall to it (C7, C23 one source)");
        // Review C19: a matrix key outside the class's own common set is never planned as a write (the bridge refuses it, and C4 would
        // drop the valid type edits of the same body with it): it goes to a person with the value and why.
        var mxOther = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd-ma2b.json"))
            .Replace("\"Pset_WallCommon.IsExternal\"]", "\"Pset_WallCommon.IsExternal\", \"Pset_BDS.FireRating\"]"), out _);
        var disc = Clauses.FromIds("{\"specifications\":[{\"name\":\"Walls are REI 60\",\"applicability\":{\"entity\":\"IFCWALL\"}," +
            "\"requirements\":{\"properties\":[{\"pset\":\"Pset_BDS\",\"name\":\"FireRating\",\"value\":\"REI 60\",\"cardinality\":\"required\"}]}}]}", "ids@3 · project · 2a3b4c5d6e7f…", out _);
        var otherPlans = V1(m, others, walls);
        var other = PropertyPlanner.Plan(otherPlans, mxOther, values.Append(new TypeValue { Category = "Walls", Type = "BDS_EXT_ARC_CMU_200 mm", UniqueId = U(0xa01),
            Key = "Pset_BDS.FireRating", Current = "", Param = "BDS Fire Rating", Instances = 0 }).ToList(), m, disc);
        var dr = other.Rows.SingleOrDefault(r => r.Key == "Pset_BDS.FireRating");
        Ok(dr?.Outcome == "no writer" && dr.Why.EndsWith("but Sentinel writes only Pset_WallCommon on a wall type — a person sets it in Revit")
           && otherPlans.Single().Ghosts.All(g => g.Parameter != "Pset_BDS.FireRating")
           && otherPlans.Single().Ghosts.Any(g => g.Op == "set_parameter" && g.Parameter == "Pset_WallCommon.FireRating" && g.TypeName == "BDS_EXT_ARC_CMU_200 mm"),
           "a key outside the class's own set (KIND_PSET) is never planned as a write: it goes to a person, and the type's valid edits still ride (C19)");
        // Review C20: the header names what is held off the type with no row too; "on those types" counts each type once; a clause
        // whose entity pattern .NET cannot read is named, never "no clause pins one".
        var twice = new PropertyReport { Rows = {
            new PropertyRow { Outcome = "no source", UniqueId = "t1", Elements = 10 }, new PropertyRow { Outcome = "no source", UniqueId = "t1", Elements = 10 },
            new PropertyRow { Outcome = "no source", UniqueId = "t2", Elements = 4 } } };
        var unread = Clauses.FromIds("{\"specifications\":[{\"name\":\"Walls REI60\",\"applicability\":{\"entity\":\"(IFCWALL\"}," +
            "\"requirements\":{\"properties\":[{\"pset\":\"Pset_WallCommon\",\"name\":\"FireRating\",\"value\":\"REI60\",\"cardinality\":\"required\"}]}}]}", "ids@4 · project · 3a4b5c6d7e8f…", out _);
        var ur = PropertyPlanner.Plan(V1(m, others, walls), mx, values, m, unread).Rows.Single(r => r.Label == "BDS_INT_ARC_GYPS_100 mm");
        Ok(new PropertyReport { NotOnType = 2 }.Line == "DD properties: every one the DD types hold is filled, or the matrix asks none Sentinel reads on a type · 2 held off the type (instance, IsExternal from Function, or not read) — not planned"
           && new PropertyReport().Line == "DD properties: every one the DD types hold is filled, or the matrix asks none Sentinel reads on a type"
           && twice.NoSourceElements == 14
           && ur.Outcome == "no source" && ur.Why.Contains(", and 1 clause(s) of ids@4 · project · 3a4b5c6d7e8f… on Pset_WallCommon.FireRating have an entity pattern Sentinel cannot read;"),
           "the header counts what is held off the type when no row is planned, each no-source type's elements once, and names a clause it cannot read (C20)");
        // Review C23 (one source): a cited value another clause of the ids@n does not pin (here FD60 on gate doors) goes to a person;
        // a catalogue value that is not one value ("TBC") is no source.
        var idsMore = vs["ids"].DeepClone().AsObject();
        idsMore["specifications"].AsArray().Add(JsonNode.Parse("{\"name\":\"Gate doors FD60\",\"applicability\":{\"entity\":\"IFCDOOR\",\"predefinedType\":\"GATE\"},\"requirements\":{\"properties\":[{\"pset\":\"Pset_DoorCommon\",\"name\":\"FireRating\",\"value\":\"FD60\",\"cardinality\":\"required\"}]}}"));
        var moreRep = PropertyPlanner.Plan(V1(m, others, walls), mx, values, m, Clauses.FromIds(idsMore.ToJsonString(), "ids@5 · project · 4a5b6c7d8e9f…", out _));
        var mr = moreRep.Rows.Single(r => r.Label == "BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm");
        var tbcCat = vs["catalog"].DeepClone().AsObject();
        foreach (var t in tbcCat["types"].AsArray()) if ((string)t["type"] == "BDS_EXT_ARC_CMU_200 mm") t["params"]["Fire Rating"] = "TBC";
        var tm = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json")), tbcCat.ToJsonString(), out _, out _);
        tm.CatalogLabel = "type_catalog@1 · office · fedcba987654…";
        var tr = PropertyPlanner.Plan(V1(tm, others, walls), mx, values, tm, clauses).Rows.Single(r => r.Label == "BDS_EXT_ARC_CMU_200 mm");
        Ok(mr.Outcome == "disagree"
           && mr.Why == "Pset_DoorCommon.FireRating on BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm: \"FD30\" (ids@5 · project · 4a5b6c7d8e9f… · Doors carry FD30 · \"All doors shall be FD30.\"), but ids@5 · project · 4a5b6c7d8e9f… · Gate doors FD60 (\"FD60\") also speaks of it, and not as \"FD30\": " + Clauses.NotWhole
           && tr.Outcome == "no source" && tr.Why.StartsWith("no source for Pset_WallCommon.FireRating on BDS_EXT_ARC_CMU_200 mm — type_catalog@1 · office · fedcba987654… gives Fire Rating \"TBC\" is not one value"),
           "a value another clause of the ids@n does not pin goes to a person, said; a catalogue placeholder (\"TBC\") is no source (C23)");
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
        var doorEdit = cs?.Elements.FirstOrDefault(e => e.Op == "set_parameter" && e.Kind == "door");
        Ok(sp != null && doorEdit != null && ChangesetTrust.RetypedOnto(cs, sp) == 1 && ChangesetTrust.RetypedOnto(cs, doorEdit) == 1
           && ChangesetTrust.RetypedOnto(cs, new ChangesetElementDto { Op = "set_parameter", Kind = "wall", Place = new PlaceDto { TypeName = "BDS_INT_ARC_GYPS_100 mm" } }) == 0,
           "a type edit's review row counts the elements this changeset retypes onto its type, beside the model's own count (review C21)");

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
           // Review C17: only the type edit the bridge named was refused for its source; the other one was not filed with it.
           && (string)an["exceptions"][3]["reason"] == "not filed with it: the bridge refused another type edit of this changeset (Bridge 400: elements[2]: set_parameter's value_source: the sources disagree); run Promote again to file it, or fill it in Revit (Type Properties)"
           && PropertyPlanner.WithoutWrites(new { elements = new[] { new { op = "set_parameter" } } }, "x", out var none2) == null && none2 == 1,
           "a body refused for a set_parameter is filed again without its type edits, each an exception that says why; one of type edits only is not (C4)");
        // Review C17: the re-filed body keeps the bridge's 1000-exception cap — the held rows past it fold into the "(more)" row.
        var big = SP("GR-FFL", "retype", Enumerable.Range(0, 1100).Select(i => "W " + i).ToArray());
        big.Ghosts.Add(SP("x", "set_parameter").Ghosts[0]);
        var bigBody = PromoteWallsPlanner.Bodies(new List<StoreyPlan> { big }, "yazan")[0];
        var capped = JsonSerializer.SerializeToNode(PropertyPlanner.WithoutWrites(bigBody, "Bridge 400: elements[1]: op \"set_parameter\" is not supported", out _), ChangesetClient.WriteJson);
        var cx = capped?["exceptions"].AsArray();
        Ok(Json(new[] { bigBody })[0]["exceptions"].AsArray().Count == PromoteWallsPlanner.MaxExceptions
           && cx?.Count == PromoteWallsPlanner.MaxExceptions && (string)cx[998]["unique_id"] == "(more)" && (string)cx[998]["name"] == "… and 103 more"
           && (string)cx[999]["name"] == "type BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating" && ((string)cx[999]["reason"]).StartsWith("not filed: the bridge refused its source — "),
           "a body re-filed without its type edits stays within the bridge's 1000 exceptions: the held rows past it fold into the \"(more)\" row, the type edits stay named (C17)");

        // Review C16: a storey whose only ghosts are type edits (C8 put them there: its types are settled, no storey retypes onto
        // them) files them with no exceptions — its held rows ride on the first body with a retype or attach, as a storey with no
        // ghost does — so a refused type edit (WithoutWrites: null, nothing else to file) never costs them the ledger.
        StoreyPlan SP(string storey, string op, params string[] held)
        {
            var sp = new StoreyPlan { Storey = storey };
            if (op != null) sp.Ghosts.Add(new PromoteGhost { Op = op, Kind = op == "set_parameter" ? "wall" : null, UniqueId = U(op == "set_parameter" ? 0xb01 : 0xb02),
                Label = op == "set_parameter" ? "type BDS_EXT_ARC_CMU_200 mm" : "W 1", TypeName = "BDS_EXT_ARC_CMU_200 mm", TypeBefore = "Generic - 200mm",
                Parameter = "Pset_WallCommon.FireRating", RevitParameter = "Fire Rating", From = "", To = "60 min", SourceKind = "catalogue", Reason = "r" });
            foreach (var h in held) sp.Held.Add(new PromoteHeld { UniqueId = U(0xc00 + held.Length), Label = h, Reason = "why " + h });
            sp.ToPerson.Add(new PromoteHeld { UniqueId = U(0xd00), Label = "type X · " + storey, Reason = "no source" });
            return sp;
        }
        var typeOnly = Json(PromoteWallsPlanner.Bodies(new List<StoreyPlan> { SP("GR-FFL", "set_parameter", "W 7"), SP("L1", "retype"), SP("L2", null, "W 9") }, "yazan"));
        var ex1 = typeOnly.Count == 2 ? typeOnly[1]["exceptions"]?.AsArray().Select(e => (string)e["name"]).ToList() : null;
        Ok(typeOnly.Count == 2 && typeOnly[0]["exceptions"] == null
           && PropertyPlanner.WithoutWrites(PromoteWallsPlanner.Bodies(new List<StoreyPlan> { SP("GR-FFL", "set_parameter", "W 7"), SP("L1", "retype") }, "yazan")[0], "x", out _) == null
           && ex1 != null && ex1.SequenceEqual(new[] { "type X · L1", "GR-FFL · W 7", "GR-FFL · type X · GR-FFL", "L2 · W 9", "L2 · type X · L2" }),
           "a storey of type edits only files them with no exceptions; its held rows ride on the first body with a retype or attach, named with their storey (C16)");
        var alone = Json(PromoteWallsPlanner.Bodies(new List<StoreyPlan> { SP("GR-FFL", "set_parameter", "W 7"), SP("L2", null, "W 9") }, "yazan"));
        Ok(alone.Count == 1 && alone[0]["exceptions"].AsArray().Select(e => (string)e["name"])
               .SequenceEqual(new[] { "W 7", "type X · GR-FFL", "L2 · W 9", "L2 · type X · L2" }),
           "with no body that retypes or attaches, the type-edit body carries every held row, as before (C16)");
        // Review C24 (C16 residual): when that body is refused, its held rows are not lost — WithoutWrites returns it without the
        // writes (no element left: nothing to post) and FileAll hands its rows, and the refused type edits, to the next body filed.
        var lone = PropertyPlanner.WithoutWrites(PromoteWallsPlanner.Bodies(new List<StoreyPlan> { SP("GR-FFL", "set_parameter", "W 7"), SP("L2", null, "W 9") }, "yazan")[0],
            "Bridge 400: elements[0]: set_parameter's value_source: x", out var lostN);
        var ln = lone == null ? null : JsonSerializer.SerializeToNode(lone, ChangesetClient.WriteJson);
        Ok(lostN == 1 && ln != null && ln["elements"].AsArray().Count == 0
           && ln["exceptions"].AsArray().Select(e => (string)e["name"]).SequenceEqual(new[] { "W 7", "type X · GR-FFL", "L2 · W 9", "L2 · type X · L2", "type BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating" }),
           "a refused body of type edits only that carries held rows is not dropped: without its writes it still holds every held row, and each type edit as a row (C24)");
        // FileAll over a fake bridge that refuses the ground floor's type edit: its rows ride on the next body filed; with no next body
        // they are counted. A body refused for another reason hands its rows on too.
        var posted = new List<JsonNode>();
        string Bridge(object b, bool retry)
        {
            var n = JsonSerializer.SerializeToNode(b, ChangesetClient.WriteJson);
            var name = (string)n["name"];
            if (name.EndsWith("GR-FFL") && n["elements"].AsArray().Any(e => (string)e["op"] == "set_parameter")) return "Bridge 400: elements[0]: set_parameter's value_source: x";
            if (name.EndsWith("L3")) return "Bridge 500: down";
            posted.Add(n);
            return null;
        }
        var run = PropertyPlanner.FileAll(PromoteWallsPlanner.Bodies(new List<StoreyPlan> { SP("GR-FFL", "set_parameter", "W 7"), SP("L1", "set_parameter"), SP("L2", null, "W 9") }, "yazan"), Bridge);
        var l1 = posted.Count == 1 ? posted[0]["exceptions"]?.AsArray().Select(e => (string)e["name"]).ToList() : null;
        var tail = PropertyPlanner.FileAll(PromoteWallsPlanner.Bodies(new List<StoreyPlan> { SP("GR-FFL", "set_parameter", "W 7"), SP("L2", null, "W 9") }, "yazan"), Bridge);
        posted.Clear();
        var down = PropertyPlanner.FileAll(PromoteWallsPlanner.Bodies(new List<StoreyPlan> { SP("L3", "retype", "W 3"), SP("L4", "retype") }, "yazan"), Bridge);
        Ok(run.Failed.Count == 1 && run.TypeEditsNotFiled == 1 && run.RowsNotFiled == 0
           && l1 != null && l1.SequenceEqual(new[] { "W 7", "type X · GR-FFL", "L2 · W 9", "L2 · type X · L2", "type BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating", "type X · L1" })
           && tail.Failed.Count == 1 && tail.RowsNotFiled == 5
           && down.Failed.SequenceEqual(new[] { "Bridge 500: down" }) && posted.Count == 1
           && posted[0]["exceptions"].AsArray().Select(e => (string)e["name"]).SequenceEqual(new[] { "W 3", "type X · L3", "type X · L4" }),
           "FileAll: the rows of a body not filed — its refused type edits among them — ride on the next body filed, ahead of its own; with no next body they are counted (C24)");
    }
}
