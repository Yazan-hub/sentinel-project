#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
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

    // ── 6. the v1 planner: floors, roofs, ceilings retyped; doors, windows swapped; concept-only and idempotent ─────
    static readonly string[] AllClasses = { "Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows" };

    static Dictionary<string, IReadOnlyDictionary<string, double?>> V1Types(Action<Dictionary<string, Dictionary<string, double?>>> edit = null)
    {
        var d = new Dictionary<string, Dictionary<string, double?>>(StringComparer.Ordinal)
        {
            ["Floors"] = new() { ["BDS_INT_STR_CONC_150 mm"] = 150, ["BDS_INT_STR_CONC_300 mm"] = 300, ["Generic 300mm"] = 300, ["Concrete 250mm"] = 250, ["BDS_INT_ARC_SCREED_90 mm"] = 90 },
            ["Roofs"] = new() { ["BDS_EXT_ARC_GENRC_300 mm"] = 300, ["Generic - 300mm"] = 300, ["Generic - 225mm"] = 225 },
            ["Ceilings"] = new() { ["BDS_INT_ARC_GYPS_50 mm"] = 50, ["MA1 Ceiling - 50mm"] = 50 },
            ["Doors"] = new() { ["BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm"] = null, ["BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm"] = null, ["M_Single-Flush : MA1 1000 x 2100mm"] = null },
            ["Windows"] = new() { ["BDS_Window_Single Panel : 600x1200 mm"] = null, ["BDS_Window_1 Panel+FX : 800x1200 mm"] = null },
        };
        edit?.Invoke(d);
        return d.ToDictionary(kv => kv.Key, kv => (IReadOnlyDictionary<string, double?>)new Dictionary<string, double?>(kv.Value, StringComparer.OrdinalIgnoreCase), StringComparer.Ordinal);
    }

    static ElementFact Fx(string kind, string label, string family, string type, double? t = null, string level = "Level 1", Action<ElementFact> set = null)
    {
        var f = new ElementFact { Kind = kind, UniqueId = $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{++_uid:x8}", Label = label, Family = family, TypeName = type, ThicknessMm = t, Level = level };
        set?.Invoke(f);
        return f;
    }
    static ElementFact Fl(string label, string type, string fn, double? t, Action<ElementFact> set = null) =>
        Fx("floor", label, "Floor", type, t, set: f => { f.Function = fn; set?.Invoke(f); });
    // A door or window in a basic wall, by default an interior concept partition on Level 1.
    static ElementFact Dw(string kind, string label, string family, string type, double? w, double? h, string host = "MA0 Interior - 100mm",
                          string hostFn = "Interior", Action<ElementFact> set = null) =>
        Fx(kind, label, family, type, set: f =>
        {
            f.WidthMm = w; f.HeightMm = h; f.HostTypeName = host; f.HostFunction = hostFn; f.HostBasic = host != null; f.HostLevel = "Level 1";
            set?.Invoke(f);
        });

    static List<StoreyPlan> V1(GuidelineMatcher m, IEnumerable<ElementFact> others, IEnumerable<WallFact> walls = null,
                               IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> types = null, string[] classes = null,
                               IReadOnlyDictionary<string, string> wallTypes = null) =>
        PromotePlanner.Plan(classes ?? AllClasses, (walls ?? Enumerable.Empty<WallFact>()).ToList(), others.ToList(), Levels, wallTypes ?? DocTypes, types ?? V1Types(), m);

    // A copy of the elements file with one rule added (or rule [replace] swapped) under the category.
    static GuidelineMatcher WithRule(GuidelineMatcher m2, string category, string ruleJson, int? replace = null)
    {
        var g = JsonNode.Parse(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json"))).AsObject();
        var rules = g["elements"].AsArray().First(e => (string)e["category"] == category)["rules"].AsArray();
        if (replace is int i) rules[i] = JsonNode.Parse(ruleJson); else rules.Add(JsonNode.Parse(ruleJson));
        var m = GuidelineMatcher.FromBodies(g.ToJsonString(), File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        m.CatalogLabel = m2.CatalogLabel;
        return m;
    }

    static void Classes(GuidelineMatcher m2)
    {
        PromoteGhost G(List<StoreyPlan> ps, string label) => ps.SelectMany(p => p.Ghosts).FirstOrDefault(g => g.Label == label);
        string H(List<StoreyPlan> ps, string label) => ps.SelectMany(p => p.Held).FirstOrDefault(h => h.Label == label)?.Reason;
        bool None(List<StoreyPlan> ps, string label) => G(ps, label) == null && H(ps, label) == null;
        ClassCount N(List<StoreyPlan> ps, string cat, string storey = "Level 1") => ps.First(p => p.Storey == storey).Others[cat];

        Console.WriteLine("\nPlanner v1 — floors (PromotePlanner.Plan)");
        var fl = V1(m2, new[]
        {
            Fl("F300", "Generic 300mm", "Interior", 300), Fl("F250", "Concrete 250mm", "Interior", 250), Fl("FEXT", "Generic 300mm", "Exterior", 300),
            Fl("FNOFN", "Generic 300mm", null, 300), Fl("FSTR", "Generic 300mm", "Interior", 300, f => f.Structural = true),
            Fl("F3004", "Generic 300mm", "Interior", 300.4), Fl("F450", "Concrete 450mm", "Interior", 450),
            Fx("floor", "FREF", "Floor", "Generic 300mm", 300, "Ref", f => f.Function = "Interior"),
            Fl("FGRP", "Generic 300mm", "Interior", 300, f => f.InGroup = true), Fl("FOPT", "Generic 300mm", "Interior", 300, f => f.InOption = true),
            Fl("FIPF", "Generic 300mm", "Interior", 300, f => f.NotEditable = "an in-place family"),
        });
        var f300 = G(fl, "F300");
        Ok(f300 != null && f300.Op == "retype" && f300.Kind == "floor" && f300.FamilyName == null && f300.TypeBefore == "Generic 300mm"
           && f300.TypeName == "BDS_INT_STR_CONC_300 mm" && f300.Reason == "DD floors: Function Interior, Family Floor, 300 mm → BDS_INT_STR_CONC_300 mm",
           "Interior 300 → retype to BDS_INT_STR_CONC_300 mm with its pinned reason");
        var f250 = H(fl, "F250");
        Ok(f250 != null && f250.StartsWith("gap: F250") && f250.Contains("BDS_INT_STR_CONC_150 mm, BDS_INT_STR_CONC_300 mm, BDS_INT_STR_CONC_450 mm"),
           "Interior 250 → a gap listing the three BDS slabs, never a nearest");
        Ok(H(fl, "FEXT") == "no DD rule for Function Exterior, Family Floor in BDS DD elements v1 (Promote v1) — DRAFT", "an exterior floor has no DD rule (FL-2)");
        Ok(H(fl, "FNOFN") == "no DD rule for Family Floor in BDS DD elements v1 (Promote v1) — DRAFT", "a floor type with no Function has no DD rule");
        Ok(H(fl, "FSTR")?.StartsWith("structural floor — ") == true && G(fl, "FSTR") == null, "a structural concept floor is held whole (FL-3)");
        Ok(H(fl, "F3004")?.Contains("300.4 mm is not a whole millimetre") == true, "a thickness that is not a whole mm is held");
        Ok(H(fl, "F450") == "\"BDS_INT_STR_CONC_450 mm\" is in the catalogue but not loaded in this model — Sentinel creates no types",
           "a target missing from the model is held; no type is created");
        Ok(H(fl, "FREF")?.Contains("is not a Building Story") == true && fl.Any(p => p.Storey == "Ref"), "a floor on a non-story level is held on its own plan");
        Ok(H(fl, "FGRP")?.StartsWith("in a group") == true && H(fl, "FOPT")?.StartsWith("in a design option") == true
           && H(fl, "FIPF")?.StartsWith("an in-place family") == true, "group members, design options and in-place families are held with those words");
        var thick = V1(m2, new[] { Fl("F300", "Generic 300mm", "Interior", 300) }, types: V1Types(d => d["Floors"]["BDS_INT_STR_CONC_300 mm"] = 310));
        Ok(H(thick, "F300") == "\"BDS_INT_STR_CONC_300 mm\" is 310 mm thick in this model, the floor is 300 mm — a retype would move a face; a person decides",
           "a target whose build-up here differs from the element's thickness is held (E6)");
        var settled = V1(m2, new[] { Fl("FS", "BDS_INT_STR_CONC_300 mm", "Interior", 300, f => f.Structural = true), Fl("FO", "BDS_INT_ARC_SCREED_90 mm", "Interior", 90) });
        var sc = N(settled, "Floors");
        Ok(None(settled, "FS") && None(settled, "FO") && sc.DdNow == 1 && sc.Total == 1 && sc.OfficeTyped == 1,
           $"a settled structural slab is DD (no ghost); an office screed is left as is, out of the denominator (DD now {sc.DdNow}/{sc.Total}, office {sc.OfficeTyped})");
        var bare = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json")), null, out _, out _);
        Ok(H(V1(bare, new[] { Fl("F300", "Generic 300mm", "Interior", 300) }), "F300")?.StartsWith("no type catalogue installed") == true,
           "no type catalogue → held, never matched unchecked");

        Console.WriteLine("\nPlanner v1 — roofs and ceilings");
        var rc = V1(m2, new[]
        {
            Fx("roof", "R300", "Basic Roof", "Generic - 300mm", 300), Fx("roof", "R225", "Basic Roof", "Generic - 225mm", 225),
            Fx("roof", "RSG", "Sloped Glazing", "Sloped Glazing"),
            Fx("ceiling", "C50", "Compound Ceiling", "MA1 Ceiling - 50mm", 50), Fx("ceiling", "C56", "Compound Ceiling", "600mm x 600mm ACT System", 56),
            Fx("ceiling", "CB", "Basic Ceiling", "Generic"), Fx("ceiling", "CNT", "Compound Ceiling", "MA1 Ceiling - odd"),
        });
        Ok(G(rc, "R300")?.TypeName == "BDS_EXT_ARC_GENRC_300 mm" && G(rc, "R300").Kind == "roof", "a basic roof at 300 → BDS_EXT_ARC_GENRC_300 mm (RF-1)");
        Ok(H(rc, "R225")?.StartsWith("gap: R225") == true && H(rc, "R225").Contains("Available: BDS_EXT_ARC_GENRC_300 mm"), "225 → a gap listing 300");
        Ok(H(rc, "RSG")?.StartsWith("no DD rule for Family Sloped Glazing") == true, "sloped glazing has no DD rule");
        Ok(G(rc, "C50")?.TypeName == "BDS_INT_ARC_GYPS_50 mm" && G(rc, "C50").Reason == "DD ceilings: Family Compound Ceiling, 50 mm → BDS_INT_ARC_GYPS_50 mm",
           "a compound ceiling at 50 → BDS_INT_ARC_GYPS_50 mm (CL-2)");
        Ok(H(rc, "C56")?.StartsWith("gap: C56") == true && H(rc, "C56").Contains("Available: BDS_INT_ARC_GYPS_50 mm"), "an ACT at 56 → a gap listing 50");
        Ok(H(rc, "CB")?.StartsWith("no DD rule for Family Basic Ceiling") == true, "a Basic Ceiling has no DD rule (CL-1)");
        Ok(H(rc, "CNT")?.StartsWith("no build-up thickness") == true, "a compound ceiling with no thickness is held");
        var wallOnly = V1(m2, new[] { Fx("ceiling", "C50", "Compound Ceiling", "MA1 Ceiling - 50mm", 50) },
                          types: V1Types(d => d["Ceilings"].Remove("BDS_INT_ARC_GYPS_50 mm")),
                          wallTypes: new Dictionary<string, string>(DocTypes.ToDictionary(kv => kv.Key, kv => kv.Value), StringComparer.OrdinalIgnoreCase) { ["BDS_INT_ARC_GYPS_50 mm"] = "Interior" });
        Ok(H(wallOnly, "C50")?.Contains("not loaded in this model") == true, "a wall type of the same name is not a ceiling type: held, not loaded");
        var cl1 = WithRule(m2, "Ceilings", "{\"when\":{\"params\":{\"Family\":\"Basic Ceiling\"}},\"use\":{\"family\":\"Compound Ceiling\",\"type\":\"BDS_INT_ARC_GYPS_50 mm\"}}");
        Ok(V1(cl1, new[] { Fx("ceiling", "CB", "Basic Ceiling", "Generic") }).SelectMany(p => p.Ghosts).SingleOrDefault()?.Reason
           == "DD ceilings: Family Basic Ceiling → BDS_INT_ARC_GYPS_50 mm", "CL-1's alternative is data: a Basic Ceiling rule proposes it (no thickness compared)");

        Console.WriteLine("\nPlanner v1 — doors and windows");
        var oneTypeWalls = new[] { W("L2a", "Generic - 200mm", "Exterior", 200, baseLevel: "Level 2"), W("L2b", "Generic - 200mm", "Exterior", 200, baseLevel: "Level 2") };
        var dw = V1(m2, new[]
        {
            Dw("door", "D1000", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100), Dw("door", "D2000", "M_Double-Flush", "MA1 2000 x 2100mm", 2000, 2100),
            Dw("door", "DEXT", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, "Generic - 200mm", "Exterior"),
            Dw("door", "DLIE", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, "BDS_INT_ARC_GYPS_100 mm", "Exterior"),
            Dw("door", "DOFF", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, "BDS_EXT_STR_CONC_200 mm", "Exterior"),
            Dw("door", "DONE", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, "Generic - 200mm", "Exterior", f => { f.Level = "Level 2"; f.HostLevel = "Level 2"; }),
            Dw("door", "DNOH", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, host: null),
            Dw("door", "DCW", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, "Curtain Wall", null, f => f.HostBasic = false),
            Dw("door", "DINS", "M_Single-Flush", "MA1 1000 x 2100mm", null, 2100), Dw("door", "DIMP", "M_Single-Flush", "36in x 84in", 914.4, 2133.6),
            Dw("door", "DLIAR", "M_Single-Flush", "MA1 1000 x 2100mm", 900, 2100), Dw("door", "D915", "M_Single-Flush", "0915 x 2134mm", 915, 2134),
            Dw("door", "DSET", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", 960, 1980),
            Dw("door", "DOTH", "Other", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", 1000, 2100),
            Dw("door", "DGLS", "BDS_INT_1 PNL", "BDS_INT_1 PNL_GLASS_1000 x 2100 mm", 960, 1980),
            Dw("window", "W600", "M_Fixed", "MA1 600 x 1200mm", 600, 1200, "Generic - 200mm", "Exterior"),
            Dw("window", "W800", "M_Fixed", "MA1 800 x 1200mm", 800, 1200, "Generic - 200mm", "Exterior"),
            Dw("window", "W1300", "M_Fixed", "MA1 600 x 1300mm", 600, 1300, "Generic - 200mm", "Exterior"),
            Dw("window", "WOFF", "BDS_Window_1 Panel+FX", "600x1200 mm", 600, 1200, "Generic - 200mm", "Exterior"),
        }, oneTypeWalls);
        var d1 = G(dw, "D1000");
        Ok(d1 != null && d1.Kind == "door" && d1.FamilyName == "BDS_INT_1 PNL" && d1.TypeName == "BDS_INT_1 PNL_WOOD_1000 x 2100 mm"
           && d1.TypeBefore == "M_Single-Flush : MA1 1000 x 2100mm"
           && d1.Reason == "DD doors: HostFunction Interior, Size W1000 x H2100 mm → BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm",
           "an interior 1000 x 2100 door → BDS_INT_1 PNL : …WOOD_1000 x 2100 mm, type_before \"Family : Type\", its pinned reason");
        Ok(G(dw, "D2000")?.FamilyName == "BDS_INT_2 PNL" && G(dw, "D2000").TypeName == "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "2000 x 2100 → BDS_INT_2 PNL (DR-5)");
        Ok(H(dw, "DEXT")?.StartsWith("no DD rule for HostFunction Exterior, Size W1000 x H2100 mm in BDS DD elements v1") == true
           && H(dw, "DEXT").Contains("— the catalogue has ") && H(dw, "DEXT").Contains("which one is office policy"), "an exterior door is held, naming what the catalogue has (DR-4)");
        Ok(G(dw, "DLIE")?.FamilyName == "BDS_INT_1 PNL" && G(dw, "DLIE").Reason.EndsWith(" (host BDS_INT_ARC_GYPS_100 mm: its DD rule says Interior)"),
           "a door in a settled gypsum wall whose template says Exterior reads Interior from the DD rule (DR-2, the F2 trap)");
        Ok(H(dw, "DOFF")?.StartsWith("host BDS_EXT_STR_CONC_200 mm is an office type") == true, "a door in another office wall type is held");
        Ok(H(dw, "DONE")?.StartsWith("every wall on Level 2 is one type") == true, "a door in a one-type storey is held");
        Ok(H(dw, "DNOH") == "not hosted by a wall — rehosting is MA-5" && H(dw, "DCW")?.StartsWith("host Curtain Wall is not a basic wall") == true,
           "an unhosted door and one in a curtain wall are held");
        Ok(H(dw, "DINS")?.Contains("instance-sized family") == true && H(dw, "DIMP")?.Contains("914.4 x 2133.6 mm is not a whole millimetre") == true,
           "an instance-sized door and an imperial size are held");
        Ok(H(dw, "DLIAR") == "its type name says 1000 x 2100 mm, its Width x Height is 900 x 2100 mm — a person decides", "a type name that disagrees with its Width is held");
        Ok(H(dw, "D915")?.StartsWith("gap: D915 (M_Single-Flush : 0915 x 2134mm) — no Doors type of 915 x 2134 mm in the catalogue") == true,
           "915 x 2134 → a gap: no BDS door of that size");
        Ok(None(dw, "DSET") && N(dw, "Doors").DdNow == 1, "a door already on BDS_INT_1 PNL_WOOD (Width 960) is settled by family and type, never re-measured");
        Ok(G(dw, "DOTH")?.FamilyName == "BDS_INT_1 PNL", "…the same type name in another family is not settled (proposed)");
        Ok(None(dw, "DGLS") && None(dw, "WOFF") && N(dw, "Doors").OfficeTyped == 1 && N(dw, "Windows").OfficeTyped == 1,
           "a glass BDS door and a BDS window no rule produces are office-typed: left as is");
        Ok(G(dw, "W600")?.FamilyName == "BDS_Window_Single Panel" && G(dw, "W600").TypeName == "600x1200 mm" && G(dw, "W600").TypeBefore == "M_Fixed : MA1 600 x 1200mm"
           && G(dw, "W800")?.FamilyName == "BDS_Window_1 Panel+FX", "windows by exact size: 600 x 1200 → Single Panel, 800 x 1200 → 1 Panel+FX (WN-1)");
        Ok(H(dw, "W1300")?.Contains("BDS_Window_Single Panel : 600x1300 mm") == true && H(dw, "W1300").Contains("BDS_Window_1 Panel+FX : 600x1300 mm"),
           "600 x 1300 is in two families: held, naming both (WN-2)");
        Ok(H(V1(m2, new[] { Dw("door", "D2000", "M_Double-Flush", "MA1 2000 x 2100mm", 2000, 2100) },
                types: V1Types(d => d["Doors"].Remove("BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm"))), "D2000")
           == "\"BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm\" is in the catalogue but not loaded in this model — Sentinel creates no types",
           "a door target not loaded here is held");
        var lying = WithRule(m2, "Doors", "{\"when\":{\"params\":{\"HostFunction\":\"Interior\",\"Size\":\"W1000 x H2100 mm\"}},\"use\":{\"family\":\"BDS_INT_1 PNL\",\"type\":\"BDS_INT_2 PNL_WOOD_2000 x 2100 mm\"}}", 0);
        Ok(H(V1(lying, new[] { Dw("door", "D1000", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100) }), "D1000")?.Contains("the rule and the type name disagree") == true,
           "a rule whose type name carries another size is held");
        var split = WithRule(m2, "Windows", "{\"when\":{\"params\":{\"Size\":\"W1500 x H2600 mm\"}},\"use\":{\"family\":\"BDS_Window_Single Panel\",\"type\":\"1500x2600 mm\"}}");
        Ok(H(V1(split, new[] { Dw("window", "W1526", "M_Fixed", "MA1 1500 x 2600mm", 1500, 2600) }), "W1526")?.Contains("is not one family and type in the catalogue") == true,
           "a rule pairing a family with another family's type name is held (CatalogHas)");

        Console.WriteLine("\nPlanner v1 — merge, order, idempotence, preflight, bodies");
        var merged = V1(m2, new[] { Fl("F300", "Generic 300mm", "Interior", 300), Fx("roof", "R300", "Basic Roof", "Generic - 300mm", 300, "Roof"),
                                    Fl("F2", "Generic 300mm", "Interior", 300, f => f.Level = "Level 2") },
                        new[] { W("E1", "Generic - 200mm", "Exterior", 200), W("I1", "MA0 Interior - 100mm", "Interior", 100) });
        Ok(string.Join(",", merged.Select(p => p.Storey)) == "Level 1,Level 2,Roof" && merged[0].Ghosts.Any(g => g.Kind == null) && G(merged, "F300") != null,
           "walls and a floor on Level 1 share one plan; a storey with no walls gets its own; storeys by elevation");
        Ok(!V1(m2, new[] { Fl("F300", "Generic 300mm", "Interior", 300) }, new[] { W("E1", "Generic - 200mm", "Exterior", 200) },
               classes: new[] { "Floors" }).SelectMany(p => p.Ghosts).Any(g => g.Kind == null), "Walls not run → no wall ghost");
        var wallsSet = new List<WallFact> { W("E1", "Generic - 200mm", "Exterior", 200), W("I1", "MA0 Interior - 100mm", "Interior", 100), W("G1", "Generic - 125mm", "Exterior", 125) };
        var onlyWalls = Json(PromoteWallsPlanner.Bodies(V1(m2, new[] { Fl("F300", "Generic 300mm", "Interior", 300) }, wallsSet, classes: new[] { "Walls" }), "yazan"));
        var ma0 = Json(PromoteWallsPlanner.Bodies(PromoteWallsPlanner.Plan(wallsSet, Levels, DocTypes, m2), "yazan"));
        Ok(onlyWalls.Count == ma0.Count && onlyWalls.Zip(ma0, JsonNode.DeepEquals).All(x => x), "Classes = [Walls] → the MA-0 bodies, byte for byte");

        // Idempotence: apply every ghost to the facts, plan again — nothing new, and DD now grows by exactly the proposals.
        var facts = new List<ElementFact>
        {
            Fl("F300", "Generic 300mm", "Interior", 300), Fl("F150", "Concrete 150mm", "Interior", 150), Fl("F250", "Concrete 250mm", "Interior", 250),
            Fx("roof", "R300", "Basic Roof", "Generic - 300mm", 300), Fx("ceiling", "C50", "Compound Ceiling", "MA1 Ceiling - 50mm", 50),
            Dw("door", "D1000", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100),
            Dw("door", "DLIE", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, "BDS_INT_ARC_GYPS_100 mm", "Exterior"),
            Dw("window", "W600", "M_Fixed", "MA1 600 x 1200mm", 600, 1200, "Generic - 200mm", "Exterior"),
            Dw("window", "W800", "M_Fixed", "MA1 800 x 1200mm", 800, 1200, "Generic - 200mm", "Exterior"),
        };
        var first = V1(m2, facts);
        var ghosts = first.SelectMany(p => p.Ghosts).ToList();
        foreach (var g in ghosts) { var f = facts.Single(x => x.UniqueId == g.UniqueId); f.TypeName = g.TypeName; if (g.FamilyName != null) f.Family = g.FamilyName; }
        var second = V1(m2, facts);
        string[] cats = { "Floors", "Roofs", "Ceilings", "Doors", "Windows" };
        Ok(ghosts.Count == 8 && !second.SelectMany(p => p.Ghosts).Any()
           && cats.All(cat => N(second, cat).DdNow == N(first, cat).DdNow + ghosts.Count(g => PromoteWallsPlanner.Classes[g.Kind].Category == cat)),
           $"every class is idempotent: {ghosts.Count} proposals applied → a second run proposes nothing, DD now grows by exactly them");

        var pre = V1(m2, new[] { Dw("door", "D1000", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100), Fl("F300", "Generic 300mm", "Interior", 300) });
        var counts = N(pre, "Doors").DdNow + "/" + N(pre, "Doors").Total;
        PromotePlanner.Refuse(pre, g => g.Kind == "door" ? "\"BDS_INT_1 PNL_WOOD_1000 x 2100 mm\" is not a valid type for D1000 in Revit — a person decides" : null);
        Ok(G(pre, "D1000") == null && H(pre, "D1000")?.StartsWith("\"BDS_INT_1 PNL_WOOD_1000 x 2100 mm\" is not a valid type") == true && G(pre, "F300") != null
           && N(pre, "Doors").DdNow + "/" + N(pre, "Doors").Total == counts, "Refuse: the preflight moves a refused ghost to the held rows; counts unchanged");

        var body = Json(PromoteWallsPlanner.Bodies(pre, "yazan", title: "Promote (DD)")).Single();
        Ok((string)body["name"] == "Promote (DD) · Level 1" && (string)body["elements"][0]["kind"] == "floor"
           && (string)body["elements"][0]["validate"]["identity"]["Class"] == "IfcSlab" && body["elements"][0]["place"]["FamilyName"] == null
           && (string)body["exceptions"][0]["name"] == "D1000",
           "Bodies(title: \"Promote (DD)\"): the kind and IFC class per class, no FamilyName on a floor, held rows as exceptions");
    }

    // ── 7. parity: the v1 body the bridge's vitest validates (promote-body-v1.json) ────────────────────────────────
    static void ParityV1(GuidelineMatcher m2)
    {
        Console.WriteLine("\nParity v1 (WebApp/bridge/fixtures/changeset-ops/promote-body-v1.json)");
        string U(int n) => $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{n:x8}";
        ElementFact At(ElementFact f, int n) { f.UniqueId = U(n); return f; }
        var walls = new List<WallFact>
        {
            new WallFact { UniqueId = U(0x190), Label = "W 312312", TypeName = "Generic - 200mm", Function = "Exterior", WidthMm = 200, BaseLevel = "Level 1", IsBasic = true },
        };
        var others = new List<ElementFact>
        {
            At(Fl("Floor 401", "Generic 300mm", "Interior", 300), 0x191),
            At(Fx("roof", "Roof 402", "Basic Roof", "Generic - 300mm", 300), 0x192),
            At(Fx("ceiling", "Ceiling 403", "Compound Ceiling", "MA1 Ceiling - 50mm", 50), 0x193),
            At(Dw("door", "Door 404", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100), 0x194),
            At(Dw("window", "Window 405", "M_Fixed", "MA1 600 x 1200mm", 600, 1200, "Generic - 200mm", "Exterior"), 0x195),
            At(Dw("door", "Door 406", "M_Single-Flush", "0915 x 2134mm", 915, 2134), 0x196),
        };
        var plan = V1(m2, others, walls).Single();
        var got = Json(PromoteWallsPlanner.Bodies(new[] { plan }, "yazan", title: "Promote (DD)")).Single();
        var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "promote-body-v1.json");
        var text = File.Exists(path) ? File.ReadAllText(path) : "null";
        bool same = JsonNode.DeepEquals(got, JsonNode.Parse(text));
        Ok(same, "the v1 planner's body equals the fixture the bridge validates");
        if (!same) Console.WriteLine("        got: " + got.ToJsonString(new JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));

        var cs = same ? JsonSerializer.Deserialize<ChangesetDto>(text) : null;
        var door = cs?.Elements.FirstOrDefault(e => e.Kind == "door");
        Ok(door?.Place.FamilyName == "BDS_INT_1 PNL" && door.Target.TypeBefore == "M_Single-Flush : MA1 1000 x 2100mm",
           "a door reads Place.FamilyName and Target.TypeBefore \"Family : Type\" into the DTOs");
        Ok(cs?.Elements.Select(e => e.Kind).Distinct().Count() == 6 && cs.Exceptions.Count == 1 && cs.Exceptions[0].Name == "Door 406",
           "all six kinds ride one storey's changeset; the 915 door is its one exception");
    }
}
