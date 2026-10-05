using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.Workflow;

/// <summary>
/// Name synthesis for token rules (moved out of AutoFixExecution so it is Revit-free and checkable).
/// Strategy per token, left to right: keep a segment that already matches the token def; fold the rest into
/// the trailing free-text token; else synthesize the def's default (first alternative). Token defs are
/// resolved with the office code first — a `{org}` token yields the org, never the literal "{org}".
/// NOTE: this synthesizes defaults for enum tokens ("EXT|INT" → "EXT"); the naming manager deliberately
/// does NOT use it for type rules — see NamingProposer.
/// </summary>
public static class NameSynth
{
    public static string BuildCompliantName(string current, Rule rule, string? org)
    {
        var sep = rule.Separator;
        var segments = current.Split(new[] { sep }, StringSplitOptions.RemoveEmptyEntries);
        var output = new List<string>(rule.Tokens.Count);
        int consumed = 0;

        foreach (var token in rule.Tokens)
        {
            rule.TokenDefs.TryGetValue(token, out var rawDef);
            var def = rawDef is null ? null : RuleRegex.DefWithOrg(rawDef, org);
            var rx = def is null ? null : new Regex("^(?:" + def + ")$", RegexOptions.CultureInvariant, RuleRegex.MatchTimeout);

            if (consumed < segments.Length && rx is not null && Fits(rx, segments[consumed]))
            {
                output.Add(segments[consumed]);                   // keep valid segment
                consumed++;
            }
            else if (IsLastFreeTextToken(token, rule) && consumed < segments.Length)
            {
                var rest = Sanitize(string.Join(sep, segments.Skip(consumed)), def);
                output.Add(rest.Length > 0 ? rest : DefaultFor(def, token));
                consumed = segments.Length;
            }
            else
            {
                output.Add(DefaultFor(def, token));               // synthesize
            }
        }
        return string.Join(sep, output);
    }

    private static bool IsLastFreeTextToken(string token, Rule rule) =>
        rule.Tokens.Count > 0 && rule.Tokens[rule.Tokens.Count - 1] == token;

    /// First alternative of a top-level alternation is the schema's canonical default ("WIP|SH|…" → "WIP").
    /// Regex escapes are unwrapped, but the metacharacter strip that follows still removes the characters it
    /// covers — an escaped "A\+B" unwraps to "A+B" and then loses the "+" ("AB"). Only escapes outside that
    /// set (e.g. "\-" → "-") survive.
    public static string DefaultFor(string? def, string token)
    {
        if (string.IsNullOrEmpty(def)) return token.ToUpperInvariant();
        int depth = 0; var first = new StringBuilder();
        foreach (var ch in def!)
        {
            if (ch == '(') depth++;
            else if (ch == ')') depth--;
            else if (ch == '|' && depth == 0) break;
            else if (depth == 0) first.Append(ch);
        }
        var candidate = Regex.Replace(first.ToString(), @"\\d\{(\d+)(,\d*)?\}", m => new string('0', int.Parse(m.Groups[1].Value)));
        candidate = Regex.Replace(candidate, @"\\d", "0");
        candidate = Regex.Replace(candidate, @"\[[^\]]*\][*+?]?(\{[^}]*\})?", "X");
        candidate = Regex.Replace(candidate, @"\\(.)", "$1");                  // unescape (\- → -, \. → .)
        candidate = Regex.Replace(candidate, @"[\^\$\?\*\+\(\)]", "");         // …then strip metacharacters —
        // this runs AFTER the unescape, so a "+" (escaped or not) does not survive it.
        return candidate.Length > 0 ? candidate : token.ToUpperInvariant();
    }

    /// Strip characters the token def cannot accept; collapse whitespace.
    public static string Sanitize(string text, string? def)
    {
        var cleaned = Regex.Replace(text, @"[^\w /&\+\-]", " ");
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        if (def is null) return cleaned;
        var rx = new Regex("^(?:" + def + ")$", RegexOptions.CultureInvariant, RuleRegex.MatchTimeout);
        if (Fits(rx, cleaned)) return cleaned;
        var upper = cleaned.ToUpperInvariant();
        return Fits(rx, upper) ? upper : cleaned;
    }

    /// SEC-3: a token pattern is matched under RuleRegex.MatchTimeout; past it the text does not fit (never a pass —
    /// the caller's RuleRegex.Matches still judges the name it builds).
    private static bool Fits(Regex rx, string text)
    {
        try { return rx.IsMatch(text); }
        catch (RegexMatchTimeoutException) { return false; }
    }
}
