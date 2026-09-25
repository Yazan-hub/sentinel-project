using System.Text.Json;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("ContainerNameJudge — the C# port judges every shared case exactly as the TS validator\n");
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));

        // ── 1. the shared fixtures (the TS validator's own outcomes) ──────────────────────────
        using var fx = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "WebApp", "src", "sentinel-core", "fixtures", "naming-cases.json")));
        int n = 0;
        foreach (var c in fx.RootElement.EnumerateArray())
        {
            n++;
            string name = c.GetProperty("name").GetString()!;
            ContainerNameVerdict got = ContainerNameJudge.Judge(name, c.GetProperty("naming").GetRawText());
            var want = c.GetProperty("failures").EnumerateArray()
                .Select(f => (f.GetProperty("field").GetString()!, f.GetProperty("reason").GetString()!)).ToList();
            bool same = got.Ok == c.GetProperty("ok").GetBoolean() && got.Failures.SequenceEqual(want);
            Ok(same, $"case {n}: {JsonSerializer.Serialize(name)} → {(got.Ok ? "ok" : got.Failures.Count + " failure(s)")}");
            if (!same)
            {
                Console.WriteLine("        want: " + string.Join(" | ", want.Select(w => w.Item1 + ": " + w.Item2)));
                Console.WriteLine("        got:  " + string.Join(" | ", got.Failures.Select(w => w.Field + ": " + w.Reason)));
            }
        }
        Ok(n >= 10, $"the fixture carries {n} cases (at least 10)");

        // ── 2. never throws ───────────────────────────────────────────────────────────────────
        var junk = ContainerNameJudge.Judge("X", "not json");
        Ok(!junk.Ok && junk.Failures.Count == 1 && junk.Failures[0].Field == "*", "an unreadable naming body fails closed with one '*' failure");

        // ── 3. CDE-01's decision ──────────────────────────────────────────────────────────────
        string aster = File.ReadAllText(Path.Combine(root, "demo", "aster", "aster-naming-ruleset.json"));
        const string label = "naming@1 · office · 3f0737600a1b…";
        Ok(CdeSyncGuard.Decide("ASTR26-AST-ZZ-XX-M3-A-0001", "", "AST", aster, label) is null,
           "Aster's own example passes (the deleted ISO regex rejected it)");
        var bad = CdeSyncGuard.Decide("Aster Tower Central", "", "", aster, label);
        Ok(bad is { Mode: EnforcementMode.Warn } && bad.DocRef == label && bad.MessageEn.Contains("does not match " + label + ": expected 7 '-'-separated fields"),
           "a non-conforming central file warns and names naming@n · source · sha");
        var none = CdeSyncGuard.Decide("Aster Tower Central", "", "", null, "none — not installed for aster-villa or its office");
        Ok(none is { Mode: EnforcementMode.Monitor } && none.MessageEn.Contains("no naming standard to judge it by: none — not installed for aster-villa or its office"),
           "no naming installed → one Monitor note (never scored), not a violation");
        Ok(CdeSyncGuard.Decide("BDS_BDS20268_Tower A", "", "BDS", null, "none") is null,
           "the office central-file convention ({org} from the ruleset) still passes");
        var withOrg = CdeSyncGuard.Decide("Tower", "", "BDS", aster, label);
        Ok(withOrg is not null && withOrg.MessageEn.Contains(label + " or BDS_[ProjectCode]_[ProjectName]"), "with an org the message names both conventions");
        var code = CdeSyncGuard.Decide("XYZ01-AST-ZZ-XX-M3-A-0001", "ASTR26", "", aster, label);
        Ok(code is { Mode: EnforcementMode.Warn } && code.MessageEn.Contains("project code 'ASTR26'"), "the document's project code must be in the name");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
