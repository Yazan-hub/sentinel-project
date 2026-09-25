using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Engine;
using Sentinel.Standards;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("Ruleset install — canonical sha as the bridge computes it, and the raw-body merge\n");
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));

        // ── 1. canonical(): every case the bridge wrote ───────────────────────────────────────
        using var fx = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "WebApp", "bridge", "fixtures", "canonical-cases.json")));
        int n = 0;
        foreach (var c in fx.RootElement.EnumerateArray())
        {
            n++;
            string raw = c.GetProperty("raw").GetString()!, want = c.GetProperty("canonical").GetString()!;
            string got = CanonicalJson.Of(raw);
            Ok(got == want && CanonicalJson.Sha256(raw) == c.GetProperty("sha256").GetString(), $"case {n}: canonical text and sha256 equal the bridge's");
            if (got != want) { Console.WriteLine("        want: " + want); Console.WriteLine("        got:  " + got); }
        }
        Ok(n >= 9, $"the fixture carries {n} cases (at least 9)");

        // ── 2. merge onto the Aster ruleset@1 body (raw: {org} placeholders, Arabic, an unknown field) ──
        var raw1 = JsonNode.Parse(File.ReadAllText(Path.Combine(root, "demo", "aster", "ruleset-AST.json")))!.AsObject();
        raw1["x_note"] = "kept";                                   // a field the C# model does not know
        string asterRaw = raw1.ToJsonString();
        var nm = new Rule { Id = "NM-01", Target = RuleTarget.View, Mode = EnforcementMode.Warn, Tokens = { "DISC", "LEVEL" }, MessageEn = "'{name}' does not match DISC_LEVEL." };
        var m1 = RulesetMerge.Merge(asterRaw, new[] { "ARC_Walls", "MEP_Services" }, new[] { nm }, "aster-pack", "2.0.0");
        var b1 = JsonNode.Parse(m1.BodyJson)!.AsObject();
        var ws = b1["rules"]!.AsArray().First(r => (string?)r!["id"] == "WS-01")!;
        Ok(m1.Changed && m1.Semver == "1.0.1" && (string?)b1["semver"] == "1.0.1", "a real change bumps the patch semver (1.0.0 → 1.0.1)");
        Ok(ws["whitelist"]!.AsArray().Select(x => (string?)x).SequenceEqual(new[] { "ARC_Walls", "ARC_Doors", "INT_Finishes", "STR_Frame", "Shared Levels and Grids", "MEP_Services" }),
           "worksets unioned into WS-01, existing order kept, only the new one appended");
        Ok((string?)ws["doc_ref"] == "{org}-STD-001 §4" && (string?)b1["doc_refs"]!["rtg"] == "{org}-STD-001", "{org} placeholders stay unexpanded (raw body, not the loaded one)");
        Ok((string?)b1["x_note"] == "kept" && (string?)b1["standard_key"] == "ast-std-001" && (string?)b1["org"] == "AST", "unknown and untouched fields survive");
        Ok(((string?)b1["rules"]!.AsArray().First(r => (string?)r!["id"] == "VN-01")!["message_ar"])?.Length > 0, "the Arabic messages survive the round-trip");
        var added = b1["rules"]!.AsArray().Last()!;
        Ok((string?)added["id"] == "NM-01" && (string?)added["target"] == "view" && (string?)added["mode"] == "warn" && added["message_ar"] is null,
           "a new naming rule is appended in the wire form (snake_case enums, nulls dropped)");
        Ok(m1.Lines.Contains("WS-01 lists 6 workset(s), 1 new from this pack") && m1.Lines.Contains("naming rule NM-01 [View] DISC_LEVEL"), "the report lines name what changed");

        // ── 3. the same Build again changes nothing, so nothing is installed ─────────────────
        var m2 = RulesetMerge.Merge(m1.BodyJson, new[] { "ARC_Walls", "MEP_Services" }, new[] { nm }, "aster-pack", "2.0.0");
        Ok(!m2.Changed && m2.Semver == "1.0.1" && CanonicalJson.Of(m2.BodyJson) == CanonicalJson.Of(m1.BodyJson), "re-running the same pack is unchanged: no bump, same canonical body");

        // ── 4. a naming rule with the same id is replaced, not duplicated ─────────────────────
        var nm2 = new Rule { Id = "NM-01", Target = RuleTarget.Sheet, Mode = EnforcementMode.Warn, Tokens = { "NUM" }, MessageEn = "x" };
        var m3 = RulesetMerge.Merge(m1.BodyJson, Array.Empty<string>(), new[] { nm2 }, "aster-pack", "2.0.0");
        var r3 = JsonNode.Parse(m3.BodyJson)!["rules"]!.AsArray();
        Ok(m3.Changed && m3.Semver == "1.0.2" && r3.Count(r => (string?)r!["id"] == "NM-01") == 1 && (string?)r3.Last()!["target"] == "sheet", "same id → replaced in place");

        // ── 5. nothing installed: a new body from the pack ───────────────────────────────────
        var m4 = RulesetMerge.Merge(null, new[] { "ARC_Walls" }, Array.Empty<Rule>(), "office", "1.2.0");
        var b4 = JsonNode.Parse(m4.BodyJson)!.AsObject();
        Ok(m4.Changed && (string?)b4["standard_key"] == "office" && m4.Semver == "1.2.0", "no ruleset installed → standard_key = pack key, semver = the pack's, no bump");
        var ws4 = b4["rules"]!.AsArray().Single()!;
        Ok((string?)ws4["id"] == "WS-01" && (string?)ws4["target"] == "workset" && (string?)ws4["mode"] == "warn" && ws4["whitelist"]!.AsArray().Count == 1,
           "WS-01 is created when the body has no workset rule");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
