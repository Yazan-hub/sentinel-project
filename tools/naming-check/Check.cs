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

        Console.WriteLine("\nRuleRegex.Matches — the ⚡ Fix dialog and the scanner give one answer (BG-5)\n");
        var orgRule = new Rule { Id = "VW-01", Tokens = ["ORG", "BODY"], Separator = "_",
            TokenDefs = new() { ["ORG"] = "{org}", ["BODY"] = "[A-Z0-9]+" }, MessageEn = "x" };
        Ok(RuleRegex.Matches(orgRule, "AST", "AST_LOBBY", out var e1) && e1 is null, "a rule with {org} passes the office's own name (the dialog refused it)");
        Ok(!RuleRegex.Matches(orgRule, "AST", "BDS_LOBBY", out _), "another office's code does not pass");
        var bad = new Rule { Id = "X", Tokens = ["A"], TokenDefs = new() { ["A"] = "(" }, MessageEn = "x" };
        Ok(!RuleRegex.Matches(bad, "AST", "anything", out var e2) && e2 is not null && e2.StartsWith("the rule's pattern is malformed"), "a malformed def fails closed, with the reason");
        Ok(RuleRegex.Matches(new Rule { Id = "Y", MessageEn = "x" }, "AST", "whatever", out _), "a rule with no tokens has nothing to match");
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

        // ── the skeleton a person completes (founder's request 2026-09-28) ──────────────────────────────
        {
            var tnSk = Tn01();
            var ctx = new NamingContext { Category = "Walls", FamilyName = "Basic Wall", WidthMm = 200 };
            var p = NamingProposer.Propose("Counter Top", tnSk, "AST", ctx);
            Ok(p.Verdict == NameVerdict.NeedsHuman && p.Slots != null && p.Slots.Count == tnSk.Tokens.Count, "a name the recovery cannot finish comes with one slot per token");
            var org = p.Slots![0]; var loc = p.Slots[1]; var disc = p.Slots[2]; var mat = p.Slots[3]; var size = p.Slots[4];
            Ok(org.Value == "AST", "ORG is fixed to the office code");
            Ok(loc.Value == null && loc.Options != null && string.Join("|", loc.Options) == "EXT|INT|FND", "LOC the name lacks is a pick from the rule's values");
            Ok(disc.Value == null && disc.Options != null && disc.Options.Contains("ARC"), "DISC likewise");
            Ok(mat.Value == null && mat.Options == null && mat.Prefill == "COUNTER TOP", "MATERIAL is free text seeded with the leftover words");
            Ok(size.Value == "200 mm", "SIZE comes from the measured width");
            var name = NamingProposer.Assemble(tnSk, new[] { "AST", "INT", "ARC", "COUNTER TOP", "200 mm" });
            Ok(name == "AST_INT_ARC_COUNTER TOP_200 mm" && RuleRegex.For(tnSk, "AST").IsMatch(name), "the picks assemble into a name the rule accepts: " + name);
            Ok(!RuleRegex.For(tnSk, "AST").IsMatch(NamingProposer.Assemble(tnSk, new[] { "AST", "", "ARC", "COUNTER TOP", "200 mm" })), "an unpicked slot is not a valid name");
            var p2 = NamingProposer.Propose("AST_EXT_Brick", tnSk, "AST", new NamingContext { Category = "Walls", WidthMm = null });
            Ok(p2.Slots != null && p2.Slots[1].Value == "EXT" && p2.Slots[3].Prefill == "BRICK" && p2.Slots[4].Value == null, "a value the name already carries is fixed; no width and no size in the name leaves SIZE to the person");
            var conf = NamingProposer.Propose("AST_EXT_ARC_CMU_200 mm", tnSk, "AST", ctx);
            Ok(conf.Verdict == NameVerdict.Conforming && conf.Slots == null, "a conforming name has no skeleton");
            var ceil = NamingProposer.Propose("2' x 2' ACT System", tnSk, "AST", new NamingContext { Category = "Ceilings", WidthMm = null });
            Ok(ceil.Slots != null && !ceil.Slots[3].Prefill.Contains("'") && ceil.Slots[3].Accepts(ceil.Slots[3].Prefill), "a free-text prefill is sanitised to the token's characters: " + ceil.Slots![3].Prefill);
            Ok(!ceil.Slots[4].Accepts("2 X 2 ACT SYSTEM") && ceil.Slots[4].Accepts("200 mm") && ceil.Slots[4].Expects == "like 200 mm", "SIZE accepts '200 mm' and says so");
            var gwb = NamingProposer.Propose("5/8\" GWB on Metal Stud", tnSk, "AST", new NamingContext { Category = "Ceilings", WidthMm = null });
            Ok(gwb.Slots != null && gwb.Slots[3].Prefill == "5 8 GWB ON METAL STUD" && gwb.Slots[3].Accepts(gwb.Slots[3].Prefill), "a prefill with a slash and lowercase is reduced to what the token accepts: " + gwb.Slots![3].Prefill);
            Ok(ceil.Slots[1].Expects == "one of EXT, INT, FND" && !ceil.Slots[1].Accepts("") && ceil.Slots[1].Accepts("INT"), "an enum slot says its choices and accepts one");
            var fnSk = new Rule { Id = "FN-01", Target = RuleTarget.Family, Tokens = new List<string> { "ORG", "BODY" }, Separator = "_",
                TokenDefs = new Dictionary<string, string> { ["ORG"] = "{org}", ["BODY"] = "((INT|EXT|STR)_)?[A-Za-z0-9][A-Za-z0-9 \\-\\+]*(_[A-Za-z0-9][A-Za-z0-9 \\-\\+]*)+" } };
            var fam = NamingProposer.Propose("Base Cabinet-Double Door Sink Unit", fnSk, "AST", new NamingContext { Category = "Casework" });
            Ok(fam.Verdict == NameVerdict.Proposed && fam.Slots != null && fam.Slots.Count == 2 && fam.Slots[0].Value == "AST" && fam.Slots[1].Value == null, "a family rule the recovery cannot finish gets a skeleton too (ORG fixed, BODY free) — and is proposed when the words already fit");
            Ok(!fam.Slots![1].Accepts("Base Cabinet-Double Door Sink Unit") && fam.Slots[1].Accepts("Base Cabinet_Double Door Sink Unit") && RuleRegex.For(fnSk, "AST").IsMatch(NamingProposer.Assemble(fnSk, new[] { "AST", "Base Cabinet_Double Door Sink Unit" })), "the body slot refuses the dash form and accepts the underscore form the rule wants");
            Ok(fam.Suggestion == "AST_Base Cabinet_Double Door Sink Unit" && RuleRegex.For(fnSk, "AST").IsMatch(fam.Suggestion!), "the family suggestion turns the dash into the separator the body needs, and matches: " + fam.Suggestion);
            Ok(ceil.Suggestion == "AST_EXT_ARC_2 X 2 ACT SYSTEM_" && !RuleRegex.For(tnSk, "AST").IsMatch(ceil.Suggestion!), "a ceiling with no measured size is suggested with the size left empty, so it is refused until typed: " + ceil.Suggestion);
            var probs = NamingProposer.Problems(ceil.Suggestion!, ceil.Slots!, "_");
            Ok(probs.Count == 1 && probs[0] == "SIZE missing — like 200 mm", "…and the reason names the part: " + string.Join("; ", probs));
            Ok(NamingProposer.Problems("AST_INT_ARC_GYP_200 mm", ceil.Slots!, "_").Count == 0, "a finished name has no problems");
            Ok(NamingProposer.Problems("AST_INT_ARC", ceil.Slots!, "_")[0].StartsWith("5 parts expected"), "too few parts is said as such");
            Ok(NamingProposer.Problems("AST_INT_ARC_GYP_ 200 mm", ceil.Slots!, "_")[0] == "SIZE: no space next to '_'", "a space beside the separator is named, not hidden by trimming");
            var aliased = new Rule { Id = "TN-01", Target = RuleTarget.Type, Tokens = tnSk.Tokens, Separator = "_", TokenDefs = tnSk.TokenDefs,
                TokenAliases = new Dictionary<string, Dictionary<string, string>> { ["MATERIAL"] = new() { ["GWB"] = "GYP", ["GYPSUM BOARD"] = "GYP", ["ACT"] = "ACT" } } };
            var gwb2 = NamingProposer.Propose("5/8\" GWB on Metal Stud", aliased, "AST", new NamingContext { Category = "Ceilings" });
            Ok(gwb2.Slots != null && gwb2.Slots[3].Value == "GYP" && gwb2.Suggestion == "AST_EXT_ARC_GYP_", "a material word the office maps (GWB) becomes its code, fixed: " + gwb2.Suggestion);
            aliased.TokenAliases!["MATERIAL"]["METAL"] = "MTL"; aliased.TokenAliases["MATERIAL"]["WOOD"] = "TMB";
            var facing = NamingProposer.Propose("5/8\" GWB on Metal Stud", aliased, "AST", new NamingContext { Category = "Ceilings" });
            Ok(facing.Slots![3].Value == "GYP", "the earliest material word wins over the substrate (GWB before Metal): " + facing.Slots[3].Value);
            // ── the model's facts finish a name (token_infer): proposed, each token's source in the note ──
            aliased.TokenInfer = new Dictionary<string, TokenInfer>
            {
                ["LOC"] = new TokenInfer { ByParameter = new() { ["Function"] = new() { ["Exterior"] = "EXT", ["Interior"] = "INT" } }, ByCategory = new() { ["Ceilings"] = "INT" } },
                ["DISC"] = new TokenInfer { ByCategory = new() { ["Walls"] = "ARC", ["Ceilings"] = "ARC" } },
            };
            var wallCtx = new NamingContext { Category = "Walls", WidthMm = 200, Facts = { ["Function"] = "Exterior" }, Materials = { "Gypsum Board", "Metal Stud" } };
            var auto1 = NamingProposer.Propose("Generic - 200mm", aliased, "AST", wallCtx);
            Ok(auto1.Verdict == NameVerdict.Proposed && auto1.Name == "AST_EXT_ARC_GYP_200 mm", "a wall whose name says nothing is proposed from Function, category, the finish layer and the measured width: " + auto1.Name);
            Ok(string.Join("; ", auto1.Notes) == "LOC EXT from Function = Exterior; DISC ARC from category Walls; MATERIAL GYP from layer 'Gypsum Board'; 'Generic - 200 mm' dropped", "…and the note says where each token came from: " + string.Join("; ", auto1.Notes));
            var ceilCtx = new NamingContext { Category = "Ceilings", WidthMm = 15.9, Materials = { "Gypsum Wall Board" } };
            var auto2 = NamingProposer.Propose("5/8\" GWB on Metal Stud", aliased, "AST", ceilCtx);
            Ok(auto2.Verdict == NameVerdict.Proposed && auto2.Name == "AST_INT_ARC_GYP_15.9 mm", "a ceiling: LOC by category, material from the name, thickness measured: " + auto2.Name);
            var noFacts = NamingProposer.Propose("Generic", aliased, "AST", new NamingContext { Category = "Roofs" });
            Ok(noFacts.Verdict == NameVerdict.NeedsHuman && noFacts.Slots![1].Options != null, "no fact for the token → still a human's, with the pick offered");
            var wrongFact = NamingProposer.Propose("Generic - 200mm", aliased, "AST", new NamingContext { Category = "Walls", WidthMm = 200, Facts = { ["Function"] = "Retaining" } });
            Ok(wrongFact.Verdict == NameVerdict.NeedsHuman, "a parameter value the map does not list is never guessed");
            var act = NamingProposer.Propose("2' x 2' ACT System", aliased, "AST", new NamingContext { Category = "Ceilings" });
            Ok(act.Slots != null && act.Slots[3].Value == "ACT", "a code already in the name is kept as the code");
            var doorRule = new Rule { Id = "TN-02", Target = RuleTarget.Type, Tokens = new List<string> { "ORG", "LOC", "LEAF", "MATERIAL", "SIZE" }, Separator = "_",
                TokenDefs = new Dictionary<string, string> { ["ORG"] = "{org}", ["LOC"] = "EXT|INT", ["LEAF"] = "\\d+ PNL|[A-Z0-9][A-Z0-9 \\-]*", ["MATERIAL"] = "[A-Z0-9][A-Z0-9 \\-]*", ["SIZE"] = "\\d+ x \\d+ mm" } };
            var doorSk = NamingProposer.Propose("30\" x 80\"", doorRule, "AST", new NamingContext { Category = "Doors" });
            Ok(doorSk.Slots != null && doorSk.Slots[4].Value == "762 x 2032 mm", "a door size in inches is converted to mm: " + doorSk.Slots![4].Value);
            Ok(doorSk.Suggestion == "AST_EXT___762 x 2032 mm" && NamingProposer.Problems(doorSk.Suggestion!, doorSk.Slots, "_").Count == 2, "no leaf or material is invented for it — two parts are left for the person: " + doorSk.Suggestion);
            // ── doors: inches, the leaf from the family name, the material from a parameter ──
            doorRule.TokenAliases = new Dictionary<string, Dictionary<string, string>> { ["LEAF"] = new() { ["SINGLE"] = "1 PNL", ["DOUBLE"] = "2 PNL" }, ["MATERIAL"] = new() { ["OAK"] = "TMB", ["STEEL"] = "STL" } };
            doorRule.TokenInfer = new Dictionary<string, TokenInfer> { ["LOC"] = new TokenInfer { ByParameter = new() { ["Function"] = new() { ["Exterior"] = "EXT", ["Interior"] = "INT" } } }, ["MATERIAL"] = new TokenInfer { ByParameter = new() { ["Door Material"] = new() } } };
            var dctx = new NamingContext { Category = "Doors", FamilyName = "Door-Passage-Single-Flush", Facts = { ["Function"] = "Interior", ["Door Material"] = "Solid Oak" } };
            var dAuto = NamingProposer.Propose("30\" x 84\"", doorRule, "AST", dctx);
            Ok(dAuto.Verdict == NameVerdict.Proposed && dAuto.Name == "AST_INT_1 PNL_TMB_762 x 2134 mm", "a door: LOC from Function, leaf from the family name, material from Door Material, inches rounded to mm: " + dAuto.Name + " — " + string.Join("; ", dAuto.Notes));
            var dPart = NamingProposer.Propose("30\" x 84\"", doorRule, "AST", new NamingContext { Category = "Doors", FamilyName = "Door-Passage-Single-Flush", Facts = { ["Function"] = "Interior" } });
            Ok(dPart.Verdict == NameVerdict.NeedsHuman && dPart.Suggestion == "AST_INT_1 PNL__762 x 2134 mm", "no material anywhere → the material is left for a person: " + dPart.Suggestion);
            // ── a family name that only needs its separators normalised is proposed ──
            var fam2 = NamingProposer.Propose("Base Cabinet-Double Door Sink Unit", fnSk, "AST", new NamingContext { Category = "Casework" });
            Ok(fam2.Verdict == NameVerdict.Proposed && fam2.Name == "AST_Base Cabinet_Double Door Sink Unit" && fam2.Notes[0] == "the name's own words, separators normalised", "a family name whose words already fit becomes a proposal: " + fam2.Name);
            var famTaken = NamingProposer.Propose("Base Cabinet-Double Door Sink Unit", fnSk, "AST", new NamingContext { Category = "Casework", ExistingNamesInFamily = new HashSet<string> { "AST_Base Cabinet_Double Door Sink Unit" } });
            Ok(famTaken.Verdict == NameVerdict.NeedsHuman, "…unless that name is already taken");
            var tuer = NamingProposer.Propose("T\u00FCr 900\u00D72100", doorRule, "AST", new NamingContext { Category = "Doors", FamilyName = "Door-Passage-Single-Flush", Facts = { ["Function"] = "Interior", ["Door Material"] = "Steel" } });
            Ok(tuer.Verdict == NameVerdict.Proposed && tuer.Name == "AST_INT_1 PNL_STL_900 x 2100 mm" && tuer.Notes.Contains("SIZE 900 x 2100 mm read as mm from '900 x 2100'"), "a size written with × and no unit is read as mm and said so: " + tuer.Name + " — " + string.Join("; ", tuer.Notes));
            var small = NamingProposer.Propose("Panel 30x80", doorRule, "AST", new NamingContext { Category = "Doors", Facts = { ["Function"] = "Interior" } });
            Ok(small.Verdict == NameVerdict.NeedsHuman, "a unit-less size too small to be mm is not read");
            var generic = NamingProposer.Propose("Generic - 12\"", aliased, "AST", new NamingContext { Category = "Walls", WidthMm = 304.8, Facts = { ["Function"] = "Exterior" } });
            Ok(generic.Verdict == NameVerdict.NeedsHuman && generic.Notes.Last() == "MATERIAL not found in the name, the family, the layers or the parameters the rule names", "no material word anywhere → said plainly, the leftover words are not taken as the material: " + generic.Notes.Last());
        }

        // ── SEC-3: a ruleset's pattern is matched under a bound — past it the name is not evaluated, in words, never a pass ──
        var slow = new Rule { Id = "SL-01", Tokens = ["A"], TokenDefs = new() { ["A"] = "(a+)+b" }, MessageEn = "x" };
        var slowName = new string('a', 27) + "!";
        var clock = System.Diagnostics.Stopwatch.StartNew();
        Ok(!RuleRegex.Matches(slow, null, slowName, out var slowWhy) && slowWhy == RuleRegex.TimedOut && clock.ElapsedMilliseconds < 2000,
           $"SEC-3: a pattern past its bound is not evaluated, in words, within its bound ({clock.ElapsedMilliseconds} ms)");
        clock.Restart();
        Ok(!new TokenSlot { Token = "A", Pattern = "(a+)+b" }.Accepts(slowName) && clock.ElapsedMilliseconds < 2000,
           $"SEC-3: a slot's pattern past its bound accepts nothing ({clock.ElapsedMilliseconds} ms)");
        Ok(RuleRegex.Judge(() => RuleRegex.For(slow, null).IsMatch(slowName)) == RuleRegex.TimedOut,
           "SEC-3: the scanner's bound turns a match past its bound into the one note's words");
        // C4: the bound is per scan too — a rule under the match bound on every name still stops once its matches in one
        // scan add up past ScanBudget, with one note (a match here costs 100 ms; 40 of them would take 4 s).
        var steady = new Rule { Id = "SL-02", Tokens = ["A"], MessageEn = "x" };
        var scan = new RuleRegex.ScanClock();
        clock.Restart();
        var scanWhy = RuleRegex.Judge(() => { for (int i = 0; i < 40; i++) scan.Time(steady, () => { System.Threading.Thread.Sleep(100); return true; }); });
        Ok(scanWhy == RuleRegex.TookTooLongAcrossScan && clock.ElapsedMilliseconds < 3000,
           $"SEC-3: a rule under the match bound on each of 40 names stops at the scan bound, one note ({clock.ElapsedMilliseconds} ms)");
        var quick = new RuleRegex.ScanClock();
        Ok(RuleRegex.Judge(() => { for (int i = 0; i < 40; i++) quick.Time(steady, () => true); }) is null,
           "SEC-3: a quick rule over 40 names runs to the end with no note");

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
