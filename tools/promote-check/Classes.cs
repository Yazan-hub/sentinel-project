#nullable disable
using System.Text.Json.Nodes;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 5. Promote v1: the DD elements rule file, the C#-only reads, and the resolver's parity with guideline.ts ────
    static GuidelineMatcher DdElementsFile()
    {
        Console.WriteLine("\nDD elements rule file (demo/bds-pilot/bds-dd-elements-guideline.json)");
        var text = File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json"));
        var m2 = GuidelineMatcher.FromBodies(text, File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out var ge, out _);
        m2.CatalogLabel = "type_catalog@1 · ma1-bds · 0123456789ab…";
        Ok(m2.HasGuideline && ge == null, "the elements file parses as guideline@n" + (ge == null ? "" : " — " + ge));
        var errs = m2.ValidateAgainstCatalog();
        Ok(errs.Count == 0, "every family, type and pattern it names is in the catalogue" + (errs.Count > 0 ? " → " + string.Join(" | ", errs) : ""));
        Ok(m2.IsDraft && !Walls().IsDraft, "its status is draft (the walls file has none)");

        JsonNode Block(string json, string cat) => JsonNode.Parse(json)["elements"].AsArray().First(e => (string)e["category"] == cat);
        Ok(JsonNode.DeepEquals(Block(text, "Walls"), Block(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-walls-guideline.json")), "Walls")),
           "its Walls block is the walls file's, unchanged (drift check)");
        var explicitRules = JsonNode.Parse(text)["elements"].AsArray()
            .Where(e => (string)e["category"] is "Doors" or "Windows")
            .SelectMany(e => e["rules"].AsArray().Select(r => ((string)e["category"], (string)r["use"]["family"], (string)r["use"]["type"]))).ToList();
        Ok(explicitRules.Count == 16 && explicitRules.All(x => m2.CatalogHas(x.Item1, x.Item2, x.Item3)),
           $"every door and window rule names a (family, type) pair the catalogue holds ({explicitRules.Count})");

        Console.WriteLine("\nC#-only reads (RuleProduces by family, RuleParam, CatalogHas, CatalogOfSize, HasRulesFor)");
        Ok(m2.RuleProduces("Doors", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", "BDS_INT_1 PNL") && !m2.RuleProduces("Doors", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", "Other"),
           "RuleProduces with a family: the rule's family must match too");
        Ok(m2.RuleParam("Walls", "BDS_INT_ARC_GYPS_100 mm", "Function") == "Interior" && m2.RuleParam("Walls", "BDS_EXT_ARC_CMU_200 mm", "Function") == "Exterior"
           && m2.RuleParam("Walls", "Generic - 200mm", "Function") == null, "RuleParam: the producing rule's Function, null when no rule produces the type");
        Ok(!m2.CatalogHas("Windows", "BDS_Window_Single Panel", "1500x2600 mm") && m2.CatalogHas("Windows", "BDS_Window_Single Panel", "600x1200 mm"),
           "CatalogHas: family and type together (1500x2600 is in the Sliding families only)");
        var both = m2.CatalogOfSize("Windows", 600, 1300);
        Ok(both.Count == 2 && both.Select(x => x.Split(" : ")[0]).Distinct().Count() == 2 && m2.CatalogOfSize("Doors", 915, 2134).Count == 0,
           $"CatalogOfSize: 600 x 1300 is in two window families ({string.Join(", ", both)}); no door is 915 x 2134");
        Ok(m2.HasRulesFor("Roofs") && !Walls().HasRulesFor("Roofs"), "HasRulesFor: Roofs on the elements file, not on the walls file");

        ResolverParity(m2);
        return m2;
    }

    static GuidelineMatcher Walls() => GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-walls-guideline.json")),
                                                                    File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);

    // The TS resolver's answers (guideline-fixtures.test.ts writes them) against the C# port, on family, type, source,
    // confidence and options — never `why` (C# names the catalogue's label, TS "the template").
    static void ResolverParity(GuidelineMatcher m2)
    {
        var path = Repo("WebApp", "src", "sentinel-core", "fixtures", "guideline-dd-cases.json");
        var cases = JsonNode.Parse(File.ReadAllText(path)).AsArray();
        int same = 0;
        foreach (var c in cases)
        {
            var input = c["input"];
            var r = m2.Resolve(new GuidelineInput
            {
                Category = (string)input["category"],
                Params = input["params"]?.AsObject().ToDictionary(kv => kv.Key, kv => (string)kv.Value),
                ThicknessMm = (double?)input["thicknessMm"],
            });
            var want = c["available"]?.AsArray().Select(x => (string)x) ?? Enumerable.Empty<string>();
            bool ok = r.Family == (string)c["family"] && r.Type == (string)c["type"] && r.Source == (string)c["source"]
                      && r.Confidence == (double)c["confidence"] && (r.Available ?? new List<string>()).SequenceEqual(want);
            if (ok) same++;
            else Console.WriteLine($"        differs: {input.ToJsonString()} → C# {r.Family} / {r.Type} / {r.Source} / {r.Confidence} / [{string.Join(", ", r.Available ?? new List<string>())}]");
        }
        Ok(cases.Count == 29 && same == cases.Count, $"the C# matcher gives the TS resolver's answer on every shared case ({same}/{cases.Count})");
    }
}
