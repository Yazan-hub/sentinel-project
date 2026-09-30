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

        // ── 3. CDE-01's decision (GP-3: judged before the sync, as the bridge's /propose judges the name) ──
        string aster = File.ReadAllText(Path.Combine(root, "demo", "aster", "aster-naming-ruleset.json"));
        string With(string? enforce)
        {
            var o = System.Text.Json.Nodes.JsonNode.Parse(aster)!.AsObject();
            if (enforce is null) o.Remove("enforce"); else o["enforce"] = enforce;
            return o.ToJsonString();
        }
        const string label = "naming@1 · office · 3f0737600a1b…";
        Ok(aster.Contains("\"enforce\": \"reject\""), "the Aster naming@1 fixture is enforce: reject");
        Ok(CdeSyncGuard.Decide("ASTR26-AST-ZZ-XX-M3-A-0001", "", aster, label) is null,
           "Aster's own example passes (the deleted ISO regex rejected it)");
        var bad = CdeSyncGuard.Decide("Aster Tower Central", "", aster, label);
        Ok(bad is { Mode: EnforcementMode.Block } && bad.DocRef == label && bad.MessageEn.Contains("does not match " + label + ": expected 7 '-'-separated fields") &&
           bad.MessageEn.Contains("enforce: reject"),
           "reject: a non-conforming central file is a Block (the sync stops) and names naming@n · source · sha");
        var b10 = CdeSyncGuard.Decide("AST_ASTR26_Aster Tower", "", aster, label);
        Ok(b10 is { Mode: EnforcementMode.Block },
           "B10: 'AST_ASTR26_Aster Tower' fails naming@1 here as at /propose (no office-pattern short-circuit)");
        var field = CdeSyncGuard.Decide("ASTR26-XYZ-ZZ-XX-M3-A-0001", "", aster, label);
        Ok(field is { Mode: EnforcementMode.Block } && field.MessageEn.Contains("'XYZ' is not a valid Originator"),
           "the failing field is named ('XYZ' is not a valid Originator)");
        Ok(CdeSyncGuard.Decide("Aster Tower Central", "", With(null), label) is { Mode: EnforcementMode.Block },
           "no enforce → reject, as the bridge (rs.enforce ?? \"reject\")");
        var warn = CdeSyncGuard.Decide("Aster Tower Central", "", With("warn"), label);
        Ok(warn is { Mode: EnforcementMode.Warn } && warn.MessageEn.Contains("enforce: warn"), "enforce: warn → a Warn (Sync anyway / Cancel)");
        Ok(CdeSyncGuard.Decide("Aster Tower Central", "", With("off"), label) is null, "enforce: off → not judged, as the bridge");
        var none = CdeSyncGuard.Decide("Aster Tower Central", "", null, "none — not installed for aster-villa or its office");
        Ok(none is { Mode: EnforcementMode.Monitor } && none.MessageEn.Contains("no naming standard to judge it by: none — not installed for aster-villa or its office"),
           "no naming installed → one Monitor note (never scored), not a violation");
        Ok(CdeSyncGuard.Decide("BDS_BDS20268_Tower A", "", null, "none") is { Mode: EnforcementMode.Monitor },
           "the old office central-file pattern no longer passes a name unjudged");
        var code = CdeSyncGuard.Decide("XYZ01-AST-ZZ-XX-M3-A-0001", "ASTR26", aster, label);
        Ok(code is { Mode: EnforcementMode.Warn } && code.MessageEn.Contains("project code 'ASTR26'"), "the document's project code must be in the name");
        Ok(CdeSyncGuard.Decide("Aster Tower", "ASTR26", aster, label) is { Mode: EnforcementMode.Block },
           "a rejected name is a Block even when the project code is missing too");
        Ok(CdeSyncGuard.Decide("Aster Tower", "ASTR26", null, "none") is { Mode: EnforcementMode.Warn },
           "with no naming@n the project code is still checked");
        Ok(CdeSyncGuard.StopsSync(bad!) && CdeSyncGuard.StopsSync(warn!) && !CdeSyncGuard.StopsSync(none!),
           "reject and naming@n's warn stop the sync (to ask); a Monitor note never does");
        Ok(!CdeSyncGuard.StopsSync(code!) && CdeSyncGuard.Decide("Tower A", "BDS20268", With("off"), label) is { Mode: EnforcementMode.Warn } off &&
           !CdeSyncGuard.StopsSync(off) && !CdeSyncGuard.StopsSync(CdeSyncGuard.Decide("Tower A", "BDS20268", null, "none")!),
           "the project-code Warn never stops the sync to ask (enforce: off or no naming@n) — it joins the pane after it");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
