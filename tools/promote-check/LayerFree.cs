#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 23. MA-2a: layer-free rules (Function, Location, Material as when.params), the matcher's parity with the TS resolver
    //        on the shared layer-free fixture, and BOS-5: a catalogue row answers for a category by its BuiltInCategory ─────
    static GuidelineMatcher LayerFreeChecks()
    {
        Console.WriteLine("\nMA-2a — the layer-free rule file (demo/bds-pilot/bds-dd-layerfree-guideline.json) and the TS parity fixture");
        string text = File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-layerfree-guideline.json"));
        string catalog = File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json"));
        var m3 = GuidelineMatcher.FromBodies(text, catalog, out var ge, out _);
        m3.CatalogLabel = "type_catalog@1 · ma2a · 0123456789ab…";
        Ok(m3.HasGuideline && ge == null && m3.IsDraft, "the layer-free file parses as guideline@n and is draft" + (ge == null ? "" : " — " + ge));
        var errs = m3.ValidateAgainstCatalog();
        Ok(errs.Count == 0, "every family and pattern it names is in the BDS catalogue" + (errs.Count > 0 ? " → " + string.Join(" | ", errs) : ""));
        var rules = JsonNode.Parse(text)["elements"].AsArray().SelectMany(e => e["rules"].AsArray()).ToList();
        Ok(rules.Count == 6 && rules.All(r => r["when"]["layer"] == null && r["when"]["params"].AsObject().Count > 0),
           "six rules, none with a layer, each on at least one param (Function, Location, Material)");

        GuidelineResolution R(Dictionary<string, string> ps, double? mm) => m3.Resolve(new GuidelineInput { Category = "Walls", Params = ps, ThicknessMm = mm });
        var both = R(new Dictionary<string, string> { ["Location"] = "Interior", ["Function"] = "Exterior" }, 100);
        Ok(both.Type == "BDS_INT_ARC_CMU_100 mm" && both.Matched != null && both.Matched.SequenceEqual(new[] { "param:Location" }),
           "Matched names the conditions the winning rule stated (param:Location), as the TS resolver's `matched` does — Location is listed first, so it wins the tie with Function");
        var stone = R(new Dictionary<string, string> { ["Location"] = "Exterior", ["Material"] = "Stone / Concrete Masonry Units" }, 50);
        Ok(stone.Type == "BDS_EXT_ARC_STONE_50 mm" && stone.Confidence == 1 && stone.Matched.SequenceEqual(new[] { "param:Location", "param:Material" }),
           "a rule on two params (Location + Material) is tried before one on one param, and Matched lists both");
        Ok(R(new Dictionary<string, string>(), 200).Source == "none" && R(new Dictionary<string, string> { ["Material"] = "Stone" }, 200).Source == "none",
           "no param, or a Material alone, matches no rule — nothing is guessed");
        var noMm = R(new Dictionary<string, string> { ["Location"] = "Exterior" }, null);
        Ok(noMm.Source == "rule" && noMm.Confidence == 1 && noMm.Type == null, "a rule that fires with no thickness names no type (the pattern is unfilled): the caller asks for a thickness");

        Console.WriteLine("\nBOS-5 — a catalogue row's BuiltInCategory (CatalogEntry.Bic, GuidelineMatcher.SameCategory)");
        const string german = "{\"types\":[{\"category\":\"Wände\",\"bic\":\"OST_Walls\",\"family\":\"Basic Wall\",\"type\":\"BDS_EXT_ARC_CMU_200 mm\",\"width_mm\":200}," +
                              "{\"category\":\"Wände\",\"bic\":\"OST_Walls\",\"family\":\"Basic Wall\",\"type\":\"BDS_EXT_ARC_CMU_300 mm\",\"width_mm\":300}," +
                              "{\"category\":\"Türen\",\"bic\":\"OST_Doors\",\"family\":\"BDS_INT_1 PNL\",\"type\":\"BDS_INT_1 PNL_WOOD_1000 x 2100 mm\"}]}";
        var de = GuidelineMatcher.FromBodies(text, german, out _, out var ce);
        Ok(de.HasCatalog && ce == null, "a catalogue whose rows carry bic parses" + (ce == null ? "" : " — " + ce));
        var deR = de.Resolve(new GuidelineInput { Category = "Walls", Params = new Dictionary<string, string> { ["Location"] = "Exterior" }, ThicknessMm = 200 });
        Ok(deR.Type == "BDS_EXT_ARC_CMU_200 mm" && deR.Confidence == 1, "\"Walls\" finds the row filed under \"Wände\" by its bic: confidence 1");
        var deGap = de.Resolve(new GuidelineInput { Category = "Walls", Params = new Dictionary<string, string> { ["Location"] = "Exterior" }, ThicknessMm = 150 });
        Ok(deGap.Confidence == 0 && deGap.Available.SequenceEqual(new[] { "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm" }), "…and the options of a gap through the bic too");
        Ok(de.CatalogHas("Walls", "Basic Wall", "BDS_EXT_ARC_CMU_200 mm") && de.CatalogHas("Doors", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm") && !de.CatalogHas("Floors", "Floor", "x"),
           "CatalogHas by bic: Walls and Doors found, Floors not");
        var deDoc = new Dictionary<string, IReadOnlyList<(string Family, string Type)>>(StringComparer.Ordinal)
            { ["Walls"] = new List<(string, string)> { (null, "BDS_EXT_ARC_CMU_200 mm") } };
        Ok(de.OfficeTypesIn(deDoc) == (1, 2), "the office-template check counts a \"Wände\" row against the document's \"Walls\" (1 of 2)");
        var noBic = GuidelineMatcher.FromBodies(text, german.Replace(",\"bic\":\"OST_Walls\"", "").Replace(",\"bic\":\"OST_Doors\"", ""), out _, out _);
        Ok(noBic.Resolve(new GuidelineInput { Category = "Walls", Params = new Dictionary<string, string> { ["Location"] = "Exterior" }, ThicknessMm = 200 }).Confidence == 0
           && noBic.ValidateAgainstCatalog().SequenceEqual(new[] { "\"Walls\" — this office's template has no types in that category." }),
           "without a bic a localized name answers for nothing: a type_catalog@1 from before BOS-5 behaves as before");
        GuidelineMatcher.FromBodies(null, "{\"types\":[{\"category\":\"Walls\",\"type\":\"x\",\"bic\":5}]}", out _, out var badBic);
        Ok(badBic == "types[0].bic must be a string (a BuiltInCategory name)", "a bic that is not text is refused in the bridge validator's words");
        Ok(GuidelineMatcher.CategoryBics.Keys.OrderBy(k => k, StringComparer.Ordinal).SequenceEqual(GuidelineMatcher.PlacementCategories.OrderBy(k => k, StringComparer.Ordinal))
           && GuidelineMatcher.CategoryBics["Walls"] == "OST_Walls" && GuidelineMatcher.CategoryBics["Grids"] == "OST_Grids",
           "CategoryBics covers exactly the categories Sentinel places (the TS CATEGORY_BIC is the same list: the fixture's German rows prove Walls and Doors on both sides)");


        Console.WriteLine("\nMA-2a — the drill's Ghost guideline: a layer rule and layer-free rules in one block (demo/ghost-sample/ma2a-ghost-guideline.json)");
        var mixed = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "ghost-sample", "ma2a-ghost-guideline.json")), catalog, out var mge, out _);
        Ok(mixed.HasGuideline && mge == null && mixed.ValidateAgainstCatalog().Count == 0, "the drill's Ghost guideline parses and names only BDS types");
        GuidelineResolution GR(string layer, Dictionary<string, string> ps, double mm) =>
            mixed.Resolve(new GuidelineInput { Category = "Walls", Layer = layer, Discipline = "A", Params = ps, ThicknessMm = mm, Level = "GR-FFL" });
        var onLayer = GR("A-WALL-EXT", new Dictionary<string, string> { ["Location"] = "Interior" }, 200);
        Ok(onLayer.Type == "BDS_EXT_ARC_CMU_200 mm" && onLayer.Confidence == 1 && onLayer.Matched.SequenceEqual(new[] { "layer" }),
           "the layer rule, listed first, wins on its layer whatever the boundary says (the TS test pins the same)");
        var byLocation = GR("A-WALL-INT", new Dictionary<string, string> { ["Location"] = "Interior" }, 100);
        Ok(byLocation.Type == "BDS_INT_ARC_CMU_100 mm" && byLocation.Confidence == 1 && byLocation.Matched.SequenceEqual(new[] { "param:Location" }),
           "a layer no rule names types by Location");
        Ok(GR("A-WALL-INT", new Dictionary<string, string>(), 100).Source == "none", "…and with no Location read it is a gap, never the default (there is none)");
        // Review C5: the matcher orders by how many conditions a rule states (a layer counts one), then by document order — so a
        // layer-free rule on two params, listed LAST, is tried before the layer rule listed first. Pinned here and in the TS test.
        var twoNode = JsonNode.Parse(File.ReadAllText(Repo("demo", "ghost-sample", "ma2a-ghost-guideline.json")));
        twoNode["elements"][0]["rules"].AsArray().Add(JsonNode.Parse("{\"when\":{\"params\":{\"Location\":\"Interior\",\"Material\":\"GYPS\"}},\"use\":{\"family\":\"Basic Wall\",\"typePattern\":\"BDS_INT_ARC_GYPS_{thickness} mm\"},\"why\":\"two conditions\"}"));
        var two = GuidelineMatcher.FromBodies(twoNode.ToJsonString(), catalog, out _, out _);
        var twoR = two.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", Discipline = "A", ThicknessMm = 100,
                                                    Params = new Dictionary<string, string> { ["Location"] = "Interior", ["Material"] = "Gypsum Wall Board" } });
        Ok(twoR.Type == "BDS_INT_ARC_GYPS_100 mm" && twoR.Matched.SequenceEqual(new[] { "param:Location", "param:Material" }),
           "a layer-free rule on TWO params, listed last, beats the layer rule listed first on its own layer — the matcher orders by how many conditions a rule states (review C5; the TS test pins the same)");

        ResolverParityLayerFree(text, m3);
        return m3;
    }

    // The TS resolver's answers over the layer-free file (guideline-layerfree.test.ts writes them) against the C# port, on family,
    // type, source, confidence, options and the matched conditions (Matched ↔ matched, review C9) — never `why`. A case with its own
    // `catalog` rows resolves against those (BOS-5).
    static void ResolverParityLayerFree(string guidelineText, GuidelineMatcher m3)
    {
        var path = Repo("WebApp", "src", "sentinel-core", "fixtures", "guideline-layerfree-cases.json");
        var cases = JsonNode.Parse(File.ReadAllText(path)).AsArray();
        int same = 0;
        foreach (var c in cases)
        {
            var input = c["input"];
            var m = c["catalog"] == null ? m3
                : GuidelineMatcher.FromBodies(guidelineText, new JsonObject { ["types"] = JsonNode.Parse(c["catalog"].ToJsonString()) }.ToJsonString(), out _, out _);
            var r = m.Resolve(new GuidelineInput
            {
                Category = (string)input["category"],
                Params = input["params"]?.AsObject().ToDictionary(kv => kv.Key, kv => (string)kv.Value),
                ThicknessMm = (double?)input["thicknessMm"],
            });
            var want = c["available"]?.AsArray().Select(x => (string)x) ?? Enumerable.Empty<string>();
            var wantMatched = c["matched"]?.AsArray().Select(x => (string)x).ToList(); // null when the TS resolver matched nothing
            bool ok = r.Family == (string)c["family"] && r.Type == (string)c["type"] && r.Source == (string)c["source"]
                      && r.Confidence == (double)c["confidence"] && (r.Available ?? new List<string>()).SequenceEqual(want)
                      && (wantMatched == null ? r.Matched == null : r.Matched != null && r.Matched.SequenceEqual(wantMatched));
            if (ok) same++;
            else Console.WriteLine($"        differs: {input.ToJsonString()} → C# {r.Family} / {r.Type} / {r.Source} / {r.Confidence} / [{string.Join(", ", r.Available ?? new List<string>())}] / matched [{string.Join(", ", r.Matched ?? new List<string>())}]");
        }
        Ok(cases.Count == 17 && same == cases.Count, $"the C# matcher gives the TS resolver's answer on every shared layer-free case ({same}/{cases.Count})");
    }
}
