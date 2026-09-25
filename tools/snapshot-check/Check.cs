using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static readonly JsonSerializerOptions ReadOpts = new() { PropertyNameCaseInsensitive = true, Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) } };
    static JsonElement P(JsonElement e, string path) { foreach (var k in path.Split('.')) e = k.All(char.IsDigit) ? e[int.Parse(k)] : e.GetProperty(k); return e; }

    static int Main()
    {
        Console.WriteLine("OfficeSnapshotDto — the wire shape the bridge's office-store validates\n");

        // The pilot's ruleset@1 body (seed data), deserialised as RulesetStore does, expanded with its org.
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "ruleset.json")), ReadOpts)!;
        OrgNames.Apply(rs);

        // ── 1. snapshot ────────────────────────────────────────────────────────────────────────
        var snap = OfficeSnapshotDto.Build("template", "XXX_Template.rte", "2024",
            new[] { "ARC_Walls", "", "ARC_Doors" },
            new[] { ("BDS_View Status", "instance"), ("BDS_Discipline", "") },
            new[] { new OfficeSnapshotDto.TypeDto { Category = "Walls", Family = "Basic Wall", Type = "BDS_EXT_ARC_CMU_200 mm", System = true, WidthMm = 200 } },
            rs, "ruleset@1", "fb8f9baefa9f4c1d");
        using var s = JsonDocument.Parse(snap.ToJson());
        var r = s.RootElement;
        Ok(P(r, "source.kind").GetString() == "template" && P(r, "source.title").GetString() == "XXX_Template.rte" && P(r, "source.revit_version").GetString() == "2024", "source.kind / title / revit_version");
        Ok(P(r, "pack.worksets").GetArrayLength() == 2 && P(r, "pack.worksets.0.name").GetString() == "ARC_Walls", "pack.worksets[].name (blank dropped)");
        Ok(P(r, "pack.shared_parameters.1.binding").GetString() == "instance", "pack.shared_parameters[].binding defaults to instance");
        Ok(P(r, "catalog.count").GetInt32() == 1 && P(r, "catalog.types.0.width_mm").GetDouble() == 200 && P(r, "catalog.types.0.system").GetBoolean(), "catalog.count / types[].width_mm / system");
        Ok(!P(r, "catalog.types.0").TryGetProperty("height_mm", out _), "null height_mm is omitted (bridge accepts absent or null)");
        Ok(P(r, "ruleset.org").GetString() == "BDS", "ruleset.org travels as data");
        Ok(P(r, "ruleset.ref").GetString() == "ruleset@1" && P(r, "ruleset.sha256").GetString() == "fb8f9baefa9f4c1d", "ruleset.ref / sha256 name the artefact that judged");
        Ok(P(r, "ruleset.standard_key").GetString() == rs.StandardKey && P(r, "ruleset.semver").GetString() == rs.Semver, "ruleset.standard_key / semver travel");
        using (var bare = JsonDocument.Parse(OfficeSnapshotDto.Build("template", "T.rte", "2024", new string[0], new (string, string)[0], new OfficeSnapshotDto.TypeDto[0], null).ToJson()))
            Ok(!bare.RootElement.TryGetProperty("ruleset", out _), "no ruleset (none installed) → the snapshot carries none, never a default");
        var tn = P(r, "ruleset.rules").EnumerateArray().First(x => x.GetProperty("id").GetString() == "TN-01");
        Ok(tn.GetProperty("target").GetString() == "type" && tn.GetProperty("mode").GetString() == "monitor", "rule enums serialise snake_case (target=type, mode=monitor)");
        Ok(tn.GetProperty("token_defs").GetProperty("ORG").GetString() == "BDS", "token_defs key preserved; {org} expanded before send");
        Ok(tn.GetProperty("categories").GetArrayLength() == 4, "rule categories travel");
        Ok(DateTimeOffset.TryParse(r.GetProperty("at").GetString(), out _), "at is an ISO timestamp");

        // ── 2. scan report ─────────────────────────────────────────────────────────────────────
        var report = new ScanReport("Aster Tower.rvt", DateTimeOffset.Parse("2026-09-17T08:00:00+02:00"), 1200, 410, new[]
        {
            new Violation("VN-01", EnforcementMode.Request, 1234, "Level 1 Plan", "does not match", null, null),
            new Violation("WS-01", EnforcementMode.Block, 99, "Workset1", "not whitelisted", null, "BDS-RTG-001 §3.1"),
        });
        using var d = JsonDocument.Parse(ScanReportDto.From(report).ToJson());
        var q = d.RootElement;
        Ok(P(q, "doc_title").GetString() == "Aster Tower.rvt" && P(q, "elements_checked").GetInt32() == 410 && P(q, "duration_ms").GetInt64() == 1200, "doc_title / elements_checked / duration_ms");
        Ok(P(q, "at").GetString() == "2026-09-17T06:00:00.0000000+00:00", "at is UTC ISO");
        Ok(P(q, "violations.0.rule_id").GetString() == "VN-01" && P(q, "violations.0.mode").GetString() == "request" && P(q, "violations.1.mode").GetString() == "block", "violations[].rule_id / mode snake_case");
        Ok(P(q, "violations.0.element_id").GetInt64() == 1234 && P(q, "violations.0.element_name").GetString() == "Level 1 Plan" && P(q, "violations.0.message").GetString() == "does not match", "violations[].element_id / element_name / message");
        Ok(P(q, "ruleset_ref").ValueKind == JsonValueKind.Null && P(q, "ruleset_sha256").ValueKind == JsonValueKind.Null, "judged by none: ruleset_ref / ruleset_sha256 travel as explicit nulls");
        report.RulesetRef = "ruleset@1"; report.RulesetSha256 = "fb8f9baefa9f0000";
        using var d2 = JsonDocument.Parse(ScanReportDto.From(report).ToJson());
        Ok(P(d2.RootElement, "ruleset_ref").GetString() == "ruleset@1" && P(d2.RootElement, "ruleset_sha256").GetString() == "fb8f9baefa9f0000", "judged by ruleset@n: ruleset_ref / ruleset_sha256 name it");
        var plus = report.Plus(new Violation("CDE-01", EnforcementMode.Warn, -1, "x", "m", null, null));
        Ok(plus.ElementsChecked == 411 && plus.Violations.Count == 3 && plus.RulesetRef == "ruleset@1" && plus.RulesetSha256 == "fb8f9baefa9f0000", "Plus (CDE-01 at sync) keeps the ruleset identity");
        Ok(report.Plus(plus.Violations[2], counted: false).ElementsChecked == 410, "Plus(counted: false) adds the row, not an element checked");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
