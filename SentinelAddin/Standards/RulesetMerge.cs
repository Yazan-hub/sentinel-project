using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.Standards;

/// <summary>
/// Build / Apply → the body of the project's next ruleset@n. Starts from the RAW stored body (never the
/// org-expanded in-memory ruleset: that one has the office code baked in and, with no org, has lost rules),
/// keeps every field it does not touch, unions the pack's worksets into the workset rule (WS-01, created when
/// missing), replaces-or-appends the pack's naming rules by id, and bumps the patch semver only when the
/// canonical form changed — an unchanged merge installs nothing. Pure (no Revit, no HTTP):
/// tools/ruleset-install-check.
/// </summary>
public static class RulesetMerge
{
    public sealed class Result
    {
        public string BodyJson = "";
        public bool Changed;
        public string Semver = "";
        public List<string> Lines = new();
    }

    // The wire form RulesetStore reads: enums snake_case ("workset", "warn"), nulls dropped.
    private static readonly JsonSerializerOptions RuleOpts = new()
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
    private static readonly Regex SemverRx = new(@"^(\d+)\.(\d+)\.(\d+)$");

    /// <param name="rawBodyJson">The installed ruleset@n body (project or office), or null when none is installed:
    /// then a new body is started from the pack (standard_key = pack key, semver = the pack's).</param>
    public static Result Merge(string? rawBodyJson, IReadOnlyCollection<string> worksets, IReadOnlyList<Rule> namingRules, string packKey, string packSemver)
    {
        bool fresh = rawBodyJson is null;
        var body = fresh
            ? new JsonObject
            {
                ["standard_key"] = packKey,
                ["semver"] = SemverRx.IsMatch(packSemver ?? "") ? packSemver : "1.0.0",
                ["rules"] = new JsonArray(),
            }
            : JsonNode.Parse(rawBodyJson!) as JsonObject ?? throw new FormatException("the installed ruleset body is not a JSON object");
        if (body["rules"] is not JsonArray rules) body["rules"] = rules = new JsonArray();
        string before = fresh ? "" : CanonicalJson.Of(body.ToJsonString());
        var res = new Result();

        if (worksets.Count > 0)
        {
            var ws = rules.OfType<JsonObject>().FirstOrDefault(r => S(r["target"]) == "workset");
            if (ws is null)
            {
                ws = new JsonObject
                {
                    ["id"] = "WS-01",
                    ["target"] = "workset",
                    ["mode"] = "warn",
                    ["whitelist"] = new JsonArray(),
                    ["message_en"] = "Workset '{name}' is not in the office standard.",
                    ["doc_ref"] = packKey,
                };
                rules.Add(ws);
            }
            if (ws["whitelist"] is not JsonArray wl) ws["whitelist"] = wl = new JsonArray();
            var have = new HashSet<string>(wl.Select(S).OfType<string>(), StringComparer.Ordinal);
            int added = 0;
            foreach (var name in worksets)
                if (have.Add(name)) { wl.Add(JsonValue.Create(name)); added++; }
            res.Lines.Add($"{S(ws["id"])} lists {wl.Count} workset(s), {added} new from this pack");
        }

        foreach (var rule in namingRules)
        {
            var node = JsonSerializer.SerializeToNode(rule, RuleOpts)!;
            int idx = -1;
            for (int i = 0; i < rules.Count; i++)
                if (rules[i] is JsonObject o && S(o["id"]) == rule.Id) { idx = i; break; }
            if (idx >= 0) rules[idx] = node; else rules.Add(node);
            res.Lines.Add($"naming rule {rule.Id} [{rule.Target}] {string.Join(rule.Separator, rule.Tokens)}");
        }

        res.Changed = fresh || CanonicalJson.Of(body.ToJsonString()) != before;
        string semver = S(body["semver"]) ?? "";
        if (res.Changed && !fresh)
        {
            var m = SemverRx.Match(semver);
            if (m.Success) body["semver"] = semver = $"{m.Groups[1].Value}.{m.Groups[2].Value}.{long.Parse(m.Groups[3].Value) + 1}";
        }
        res.Semver = semver;
        res.BodyJson = body.ToJsonString();
        return res;
    }

    private static string? S(JsonNode? n) => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
}
