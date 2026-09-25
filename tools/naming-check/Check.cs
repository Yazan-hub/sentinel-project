using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Engine;
using Sentinel.Standards;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    /// Walk up from the binary until the repo root (the folder that contains SentinelAddin/).
    static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !Directory.Exists(Path.Combine(dir.FullName, "SentinelAddin"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    static Rule Tn01() => new()
    {
        Id = "TN-01", Target = RuleTarget.Type, Mode = EnforcementMode.Warn,
        Tokens = ["ORG", "LOC", "DISC", "MATERIAL", "SIZE"], Separator = "_",
        TokenDefs = new()
        {
            ["ORG"] = "{org}", ["LOC"] = "EXT|INT|FND", ["DISC"] = "ARC|STR|LSE|INT|MEP|CIV",
            ["MATERIAL"] = @"[A-Z0-9][A-Z0-9 \-]*", ["SIZE"] = @"\d+(\.\d+)? mm",
        },
        MessageEn = "Type '{name}' does not match {org}_[LOC]_[DISC]_[MATERIAL]_[SIZE] mm.",
    };

    static int Main()
    {
        Console.WriteLine("RuleRegex — the one compiler, org as data\n");
        var tn = Tn01();
        Ok(RuleRegex.For(tn, "XXX").IsMatch("XXX_EXT_ARC_CMU_200 mm"), "org XXX matches an XXX name");
        Ok(!RuleRegex.For(tn, "XXX").IsMatch("BDS_EXT_ARC_CMU_200 mm"), "org XXX does not match a BDS name");
        Ok(RuleRegex.For(tn, "BDS").IsMatch("BDS_EXT_ARC_CMU_200 mm"), "org BDS matches the pilot's name");
        Ok(RuleRegex.For(tn, "A+B").IsMatch("A+B_INT_STR_CONC_300 mm"), "org with regex metachars is escaped");
        Ok(!RuleRegex.For(tn, "").IsMatch("XXX_EXT_ARC_CMU_200 mm") && !RuleRegex.For(tn, "").IsMatch("_EXT_ARC_CMU_200 mm"),
           "empty org matches nothing real (fails closed)");
        Ok(RuleRegex.NeedsOrg(tn), "TN-01 needs an org");
        Ok(!RuleRegex.NeedsOrg(new Rule { Tokens = ["LEVEL"], TokenDefs = new() { ["LEVEL"] = @"L\d{2}" }, MessageEn = "x" }), "a rule without {org} does not");
        Ok(RuleRegex.TextWithOrg("Type '{name}' does not match {org}_[LOC]", "XXX") == "Type '{name}' does not match XXX_[LOC]", "message substitution keeps {name}");
        Ok(RuleRegex.TextWithOrg("{org}_x", "") == "{org}_x", "empty org leaves the placeholder visible in text");

        Console.WriteLine("\nPilot ruleset@1 seed (demo/bds-pilot/ruleset.json) — 1.5.0 shape");
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(RepoRoot(), "demo", "bds-pilot", "ruleset.json")), JsonOpts)!;
        Ok(rs.Semver == "1.5.0", "semver 1.5.0");
        Ok(rs.Org == "BDS", "pilot copy carries org = BDS as DATA");
        var fn = rs.Rules.First(r => r.Id == "FN-01");
        Ok(fn.Tokens[0] == "ORG" && fn.TokenDefs["ORG"] == "{org}", "FN-01 token renamed ORG with {org} def");
        Ok(RuleRegex.For(fn, rs.Org).IsMatch("BDS_EXT_Door_Single"), "FN-01 still matches the pilot's family names");
        var t1 = rs.Rules.First(r => r.Id == "TN-01"); var t2 = rs.Rules.First(r => r.Id == "TN-02");
        Ok(t1.Target == RuleTarget.Type && t2.Target == RuleTarget.Type, "TN-01/TN-02 are type rules");
        Ok(RuleRegex.For(t1, rs.Org).IsMatch("BDS_FND_STR_CONC-RAFT_2500 mm"), "TN-01 accepts a hyphenated material");
        Ok(RuleRegex.For(t2, rs.Org).IsMatch("BDS_EXT_1 PNL_WOOD_1000 x 2100 mm"), "TN-02 accepts the pilot's door shape");
        Ok(rs.Rules.All(r => !r.MessageEn.Contains("BDS_")), "no message hardcodes the office prefix");

        Console.WriteLine("\nNamingProposer — recovery only, no guesses, no suffixes");
        NamingContext Ctx(double? width = null, params string[] existing) =>
            new() { Category = "Walls", FamilyName = "Basic Wall", IsSystem = true, WidthMm = width, ExistingNamesInFamily = new HashSet<string>(existing) };
        NameProposal P(string name, string org, NamingContext? c = null, Rule? r = null) => NamingProposer.Propose(name, r ?? Tn01(), org, c ?? Ctx());

        var x1 = P("XXX_ÊXT_ARC_CMU_200 mm", "XXX");
        Ok(x1.Verdict == NameVerdict.Proposed && x1.Name == "XXX_EXT_ARC_CMU_200 mm", "org XXX: folds Ê → E");
        var x2 = P("ACME_ÊXT_ARC_CMU_200 mm", "ACME");
        Ok(x2.Verdict == NameVerdict.Proposed && x2.Name == "ACME_EXT_ARC_CMU_200 mm", "org ACME: same shape, nothing hardcoded");
        Ok(P("XXX_EXT_ARC_CMU_200 mm", "").Verdict == NameVerdict.NeedsHuman, "empty org → NeedsHuman for an ORG rule");

        var b1 = P("BDS_ÊXT_LSE_CONC_100 mm", "BDS");
        Ok(b1.Verdict == NameVerdict.Proposed && b1.Name == "BDS_EXT_LSE_CONC_100 mm", "audit: non-ASCII Ê repaired");
        var b2 = P("BDS_ARCH_WALL_EXT_MTL_50_mm", "BDS", Ctx(50));
        Ok(b2.Verdict == NameVerdict.Proposed && b2.Name == "BDS_EXT_ARC_MTL_50 mm", "audit: legacy token order + ARCH alias + WALL noise + _mm");
        var b3 = P("BDS_ARCH_WALL_EXT_MTL_5_CM", "BDS", Ctx(50, "BDS_EXT_ARC_MTL_50 mm"));
        Ok(b3.Verdict == NameVerdict.Blocked && b3.Name == "BDS_EXT_ARC_MTL_50 mm" && b3.Notes.Any(n => n.Contains("duplicate")), "audit: 5_CM twin → same name → BLOCKED against the existing type, never suffixed");
        var sib = Ctx(50); sib.SiblingProposals.Add("BDS_EXT_ARC_MTL_50 mm");
        Ok(P("BDS_ARCH_WALL_EXT_MTL_50_mm", "BDS", sib).Verdict == NameVerdict.Blocked, "two rows proposing the same name → the second is BLOCKED");
        var b4 = P("BDS_LSE_WALL_CONC_150_mm", "BDS", Ctx(150));
        Ok(b4.Verdict == NameVerdict.NeedsHuman && b4.Notes.Any(n => n.Contains("LOC")), "audit: LSE is a discipline, no LOC → NeedsHuman");
        Ok(P("Generic - 200mm", "BDS", Ctx(200)).Verdict == NameVerdict.NeedsHuman, "stock Revit type → NeedsHuman");
        var b5 = P("BDS_EXT_ARC_MTL_50 mm", "BDS", Ctx(200));
        Ok(b5.Verdict == NameVerdict.NeedsHuman && b5.Notes.Any(n => n.Contains("Width")), "name says 50 mm, Width is 200 → NeedsHuman, never silently corrected");
        Ok(P("BDS_EXT_ARC_CMU_200 mm", "BDS", Ctx(200)).Verdict == NameVerdict.Conforming, "conforming stays Conforming");
        Ok(P("BDS_EXT_ARC_CMU_200 mm", "BDS", Ctx(200, "BDS_EXT_ARC_CMU_200 mm")).Verdict == NameVerdict.Conforming, "its own name in the family list is not a collision");
        var tn2 = new Rule
        {
            Id = "TN-02", Target = RuleTarget.Type, Tokens = ["ORG", "LOC", "LEAF", "MATERIAL", "SIZE"], Separator = "_",
            TokenDefs = new() { ["ORG"] = "{org}", ["LOC"] = "EXT|INT", ["LEAF"] = @"\d+ PNL|[A-Z0-9][A-Z0-9 \-]*", ["MATERIAL"] = @"[A-Z0-9][A-Z0-9 \-]*", ["SIZE"] = @"\d+ x \d+ mm" },
            MessageEn = "{org}",
        };
        var door = new NamingContext { Category = "Doors", FamilyName = "BDS_Door", WidthMm = 960, HeightMm = 1980 };
        var d1 = NamingProposer.Propose("BDS_EXT_1 PNL_WOOD_1000x2100mm", tn2, "BDS", door);
        Ok(d1.Verdict == NameVerdict.Proposed && d1.Name == "BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", "door: nominal size from the NAME, never from Width/Height");
        Ok(NamingProposer.Propose("BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", tn2, "BDS", door).Verdict == NameVerdict.Conforming, "door: conforming");
        var fn2 = new Rule { Id = "FN-01", Target = RuleTarget.Family, Tokens = ["ORG", "BODY"], Separator = "_",
            TokenDefs = new() { ["ORG"] = "{org}", ["BODY"] = @"((INT|EXT|STR)_)?[A-Za-z0-9][A-Za-z0-9 \-\+]*(_[A-Za-z0-9][A-Za-z0-9 \-\+]*)+" }, MessageEn = "{org}" };
        var f1 = NamingProposer.Propose("Single Flush_Wood", fn2, "XXX", new NamingContext { Category = "Doors", FamilyName = "Single Flush_Wood" });
        Ok(f1.Verdict == NameVerdict.Proposed && f1.Name == "XXX_Single Flush_Wood", "family rule: NameSynth candidate, org from data");
        Ok(NamingProposer.Propose("Single Flush_Wood", fn2, "XXX", new NamingContext { ExistingNamesInFamily = new HashSet<string> { "XXX_Single Flush_Wood" } }).Verdict == NameVerdict.Blocked,
           "family rule: collision is Blocked, not suffixed");

        Console.WriteLine("\nCatalogue sweep — 1,434 harvested types (pilot fixture, org BDS)");
        var cat = JsonSerializer.Deserialize<Catalog>(File.ReadAllText(Path.Combine(RepoRoot(), "demo", "bds-pilot", "bds-type-catalog.json")), JsonOpts)!;
        var rules = new[] { (rule: Tn01(), cats: new[] { "Walls", "Floors", "Ceilings", "Roofs" }), (rule: tn2, cats: new[] { "Doors", "Windows" }) };
        int conforming = 0, proposed = 0, needs = 0, blocked = 0, threw = 0, nonConforming = 0, dupes = 0;
        var proposedNames = new HashSet<string>();
        foreach (var (rule, cats) in rules)
        {
            var rx = RuleRegex.For(rule, "BDS");
            foreach (var group in cat.Types.Where(t => cats.Contains(t.Category)).GroupBy(t => t.Family))
            {
                var existing = new HashSet<string>(group.Select(t => t.Type));
                var siblings = new HashSet<string>();
                foreach (var t in group)
                {
                    var ctx = new NamingContext { Category = t.Category, FamilyName = t.Family, IsSystem = t.System,
                        WidthMm = rule.Id == "TN-01" ? t.WidthMm : null, ExistingNamesInFamily = existing, SiblingProposals = siblings };
                    NameProposal p;
                    try { p = NamingProposer.Propose(t.Type, rule, "BDS", ctx); } catch { threw++; continue; }
                    switch (p.Verdict)
                    {
                        case NameVerdict.Conforming: conforming++; break;
                        case NameVerdict.Proposed:
                            proposed++;
                            if (!rx.IsMatch(p.Name!)) nonConforming++;
                            if (!proposedNames.Add(t.Family + "|" + p.Name)) dupes++;
                            siblings.Add(p.Name!);
                            break;
                        case NameVerdict.NeedsHuman: needs++; break;
                        case NameVerdict.Blocked: blocked++; break;
                    }
                }
            }
        }
        Console.WriteLine($"  tally: conforming {conforming} · proposed {proposed} · needs-human {needs} · blocked {blocked}");
        Ok(threw == 0, "sweep never throws");
        Ok(nonConforming == 0, "sweep never proposes a non-conforming name");
        Ok(dupes == 0, "sweep never proposes a duplicate within a family");
        Ok(conforming + proposed + needs + blocked > 100, "sweep covered the wall/floor/door/window types");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    sealed class Catalog { public List<CatType> Types { get; set; } = new(); }
    sealed class CatType
    {
        public string Category { get; set; } = ""; public string Family { get; set; } = ""; public string Type { get; set; } = "";
        public bool System { get; set; }
        [JsonPropertyName("width_mm")] public double? WidthMm { get; set; }
        [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
    }
}
