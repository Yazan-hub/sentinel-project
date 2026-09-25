using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>What a naming@n body says about one container name: the name checked (after the extension strip)
/// and, per failing field, the field key ("*" for a wrong field count) and the reason in the web's words.</summary>
public sealed class ContainerNameVerdict
{
    public bool Ok;
    public string Name = "";
    public List<(string Field, string Reason)> Failures = new();
}

/// <summary>
/// A pure port of the web's container-name validator (WebApp/src/sentinel-core/naming.ts,
/// validateContainerName) over a naming@n body, so CDE-01 in Revit and the bridge's /propose judge a name
/// the same way. Same order, same reason text; a field value passes when it is a placeholder, in the enum,
/// fully matches the pattern, or (no enum and no pattern) is non-empty. Patterns run as ECMAScript regexes
/// anchored with \z (JS `$` never matches before a trailing newline). No Revit, no HTTP: tools/naming-port-check
/// runs it over WebApp/src/sentinel-core/fixtures/naming-cases.json, the TS validator's own outcomes. Never throws.
/// </summary>
public static class ContainerNameJudge
{
    public static ContainerNameVerdict Judge(string name, string namingBodyJson)
    {
        try
        {
            using var d = JsonDocument.Parse(namingBodyJson);
            return Judge(name, d.RootElement);
        }
        catch (Exception ex)
        {
            return new ContainerNameVerdict { Ok = false, Name = (name ?? "").Trim(), Failures = { ("*", "the naming standard could not be read: " + ex.Message) } };
        }
    }

    private static ContainerNameVerdict Judge(string rawName, JsonElement rs)
    {
        string name = StripExt((rawName ?? "").Trim(), Strings(rs, "strip_extensions"));
        string sep = Str(rs, "separator");
        var fields = rs.TryGetProperty("fields", out var fa) && fa.ValueKind == JsonValueKind.Array
            ? fa.EnumerateArray().ToList() : new List<JsonElement>();
        var v = new ContainerNameVerdict { Name = name };
        string[] parts = name.Length == 0 ? new string[0] : name.Split(new[] { sep }, StringSplitOptions.None);

        if (parts.Length != fields.Count)
        {
            v.Failures.Add(("*", $"expected {fields.Count} '{sep}'-separated fields ({string.Join(sep, fields.Select(f => Str(f, "label")))}), got {parts.Length}"));
            return v;
        }

        for (int i = 0; i < fields.Count; i++)
        {
            var f = fields[i];
            string val = parts[i], pattern = Str(f, "pattern");
            var en = Strings(f, "enum");
            var ph = Strings(f, "placeholders");
            if (ph != null && ph.Contains(val)) continue;                  // explicit not-applicable → always ok
            if (en != null && en.Contains(val)) continue;                  // in the allowed set → ok
            if (pattern.Length > 0 && FullMatch(pattern, val)) continue;
            if (en == null && pattern.Length == 0 && val.Length > 0) continue; // no enum, no pattern: any non-empty token

            string allowed = en != null ? $" (allowed: {string.Join(", ", en.Take(12))}{(en.Count > 12 ? ", …" : "")})"
                : pattern.Length > 0 ? $" (must match /{pattern}/)" : "";
            v.Failures.Add((Str(f, "key"), $"'{val}' is not a valid {Str(f, "label")}{allowed}"));
        }
        v.Ok = v.Failures.Count == 0;
        return v;
    }

    private static bool FullMatch(string pattern, string value)
    {
        // A bad ruleset regex (or a runaway match) fails closed, as the TS validator does.
        try { return Regex.IsMatch(value, "^(?:" + pattern + @")\z", RegexOptions.ECMAScript, TimeSpan.FromMilliseconds(250)); }
        catch (Exception) { return false; }
    }

    private static string StripExt(string name, List<string>? exts)
    {
        foreach (var e in exts ?? new List<string>())
            if (name.EndsWith(e, StringComparison.OrdinalIgnoreCase))
                return e.Length == 0 ? "" : name.Substring(0, name.Length - e.Length); // JS slice(0, -0) is ""
        return name;
    }

    private static string Str(JsonElement o, string k) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";

    private static List<string>? Strings(JsonElement o, string k) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Array
            ? v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToList()
            : null;
}
