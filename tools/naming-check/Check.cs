using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Engine;

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

        Console.WriteLine("\nShipped ruleset.json — 1.5.0 shape");
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(RepoRoot(), "SentinelAddin", "Resources", "ruleset.json")), JsonOpts)!;
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

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
