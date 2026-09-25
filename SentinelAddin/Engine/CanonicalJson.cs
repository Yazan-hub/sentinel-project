using System;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>
/// The bridge's canonical JSON (WebApp/bridge/artefact-store.mjs `canonical`): object keys sorted by UTF-16
/// code unit, recursively, no whitespace, strings and numbers written exactly as JSON.stringify writes them.
/// The artefact sha256 is over this text, so Build/Apply can tell "nothing changed" before installing
/// ruleset@n+1. Pure; tools/ruleset-install-check runs it over WebApp/bridge/fixtures/canonical-cases.json,
/// which the bridge's own test writes.
/// ponytail: numbers go through double like JS; on net48 "R" is not always the shortest round-trip, so a
/// rare float could differ there — rulesets carry integers only.
/// </summary>
public static class CanonicalJson
{
    public static string Of(string json)
    {
        using var d = JsonDocument.Parse(json);
        var sb = new StringBuilder();
        Write(sb, d.RootElement);
        return sb.ToString();
    }

    public static string Sha256(string json)
    {
        using var h = SHA256.Create();
        var bytes = h.ComputeHash(Encoding.UTF8.GetBytes(Of(json)));
        return string.Concat(bytes.Select(b => b.ToString("x2")));
    }

    private static void Write(StringBuilder sb, JsonElement e)
    {
        switch (e.ValueKind)
        {
            case JsonValueKind.Object:
                sb.Append('{');
                bool first = true;
                foreach (var p in e.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))
                {
                    if (!first) sb.Append(',');
                    first = false;
                    Str(sb, p.Name);
                    sb.Append(':');
                    Write(sb, p.Value);
                }
                sb.Append('}');
                break;
            case JsonValueKind.Array:
                sb.Append('[');
                bool firstItem = true;
                foreach (var x in e.EnumerateArray())
                {
                    if (!firstItem) sb.Append(',');
                    firstItem = false;
                    Write(sb, x);
                }
                sb.Append(']');
                break;
            case JsonValueKind.String: Str(sb, e.GetString()!); break;
            case JsonValueKind.Number: sb.Append(e.TryGetDouble(out var d) ? Num(d) : "null"); break;
            case JsonValueKind.True: sb.Append("true"); break;
            case JsonValueKind.False: sb.Append("false"); break;
            default: sb.Append("null"); break;
        }
    }

    /// JSON.stringify's string form: only ", \, and control characters are escaped (lone surrogates as \udxxx).
    private static void Str(StringBuilder sb, string s)
    {
        sb.Append('"');
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    bool lone = char.IsHighSurrogate(c) ? !(i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]))
                              : char.IsLowSurrogate(c) && !(i > 0 && char.IsHighSurrogate(s[i - 1]));
                    if (c < 0x20 || lone) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }

    /// Number::toString (ECMA-262 §6.1.6.1.20) from the shortest round-trip digits.
    private static string Num(double d)
    {
        if (double.IsNaN(d) || double.IsInfinity(d)) return "null";
        if (d == 0) return "0";
        string r = Math.Abs(d).ToString("R", CultureInfo.InvariantCulture);
        int exp = 0, ei = r.IndexOfAny(new[] { 'E', 'e' });
        if (ei >= 0) { exp = int.Parse(r.Substring(ei + 1), CultureInfo.InvariantCulture); r = r.Substring(0, ei); }
        int dot = r.IndexOf('.');
        string digits = dot < 0 ? r : r.Remove(dot, 1);
        int intLen = dot < 0 ? r.Length : dot;
        int lead = 0;
        while (lead < digits.Length - 1 && digits[lead] == '0') lead++;
        digits = digits.Substring(lead).TrimEnd('0');
        if (digits.Length == 0) digits = "0";
        int n = intLen - lead + exp, k = digits.Length;
        string s = k <= n && n <= 21 ? digits + new string('0', n - k)
            : 0 < n && n <= 21 ? digits.Substring(0, n) + "." + digits.Substring(n)
            : -6 < n && n <= 0 ? "0." + new string('0', -n) + digits
            : digits.Substring(0, 1) + (k > 1 ? "." + digits.Substring(1) : "") + "e" + (n - 1 >= 0 ? "+" : "-") + Math.Abs(n - 1);
        return (d < 0 ? "-" : "") + s;
    }
}
