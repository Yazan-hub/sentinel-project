using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.Workflow;

namespace Sentinel.Standards;

public enum NameVerdict { Conforming, Proposed, NeedsHuman, Blocked }

public sealed class NamingContext
{
    public string Category = "";
    public string FamilyName = "";
    public bool IsSystem;
    public double? WidthMm;                 // measured thickness (walls); null when the category has none
    public double? HeightMm;
    public ISet<string> ExistingNamesInFamily = new HashSet<string>(StringComparer.Ordinal);
    public ISet<string> SiblingProposals = new HashSet<string>(StringComparer.Ordinal); // other rows' proposals
}

public sealed class NameProposal
{
    public string? Name;
    public NameVerdict Verdict;
    public List<string> Notes = new();
    /// <summary>For a NeedsHuman type row: one slot per token so a person can finish the name — a recovered value,
    /// the rule's allowed values to pick from, or free text with a prefill. Null when the rule is not a token rule.</summary>
    public List<TokenSlot>? Slots;
}

/// <summary>One token of a name a person completes: <see cref="Value"/> when the name or the model already says it
/// (shown fixed), else <see cref="Options"/> to pick from (an enum token), else free text seeded with
/// <see cref="Prefill"/>. Nothing is defaulted: a slot without a Value is the human's.</summary>
public sealed class TokenSlot
{
    public string Token = "";
    public string? Value;                 // recovered from the name, the office code, or the measured size
    public List<string>? Options;         // the enum's allowed values, when the name carries none of them
    public string Prefill = "";           // free text: the leftover words, uppercased
    public string Hint = "";              // what the token wants, in the rule's words (its regex) for the tooltip
}

/// <summary>
/// Recovery-only name proposals. A token is emitted only when the name (or, for size, the measured width)
/// carries it — enum tokens are NEVER defaulted, a non-conforming result is NEVER shown as a proposal, and a
/// collision is BLOCKED, never suffixed. Revit-free; the office code comes in as `org`.
/// </summary>
public static class NamingProposer
{
    private static readonly string[] NoiseWords = { "WALL", "FLOOR", "CEILING", "ROOF", "DOOR", "WINDOW" };
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ARCH"] = "ARC", ["EXTERNAL"] = "EXT", ["INTERNAL"] = "INT", ["FOUNDATION"] = "FND",
    };
    private static readonly Regex EnumDef = new(@"^[A-Z0-9]+(\|[A-Z0-9]+)*$", RegexOptions.CultureInvariant);

    public static NameProposal Propose(string current, Rule rule, string? org, NamingContext ctx)
    {
        var p = ProposeCore(current, rule, org, ctx);
        if (p.Verdict == NameVerdict.NeedsHuman && rule.Target == RuleTarget.Type && rule.Tokens.Count > 0)
        {
            try { p.Slots = Skeleton(current, rule, org, ctx); } catch { p.Slots = null; } // a skeleton is help, never a blocker
        }
        return p;
    }

    private static NameProposal ProposeCore(string current, Rule rule, string? org, NamingContext ctx)
    {
        var p = new NameProposal();
        current = (current ?? "").Trim();
        if (rule.Tokens.Count == 0) return Fail(p, "rule has no token schema");
        if (RuleRegex.NeedsOrg(rule) && string.IsNullOrWhiteSpace(org)) return Fail(p, "ruleset has no org code");
        // A name can look syntactically compliant yet disagree with the measured geometry — check that
        // BEFORE trusting the regex match, so a stale digit in an otherwise-conforming name still surfaces.
        // The SIZE token is matched case-insensitively, exactly as Recover matches it.
        var sizeToken = rule.Tokens.FirstOrDefault(t => t.Equals("SIZE", StringComparison.OrdinalIgnoreCase));
        if (rule.Target == RuleTarget.Type && ctx.WidthMm != null && sizeToken != null
            && rule.TokenDefs.TryGetValue(sizeToken, out var sizeDef) && sizeDef != null && !sizeDef.Contains(" x "))
        {
            var named = TypeNameParse.ThicknessMm(Normalize(current));
            double? namedMm = named == double.MaxValue ? null : named;
            if (WidthMismatch(namedMm, ctx.WidthMm, out var why)) return Fail(p, why!);
        }

        var rx = RuleRegex.For(rule, org);
        if (rx.IsMatch(current)) { p.Name = current; p.Verdict = NameVerdict.Conforming; return p; }

        string? candidate = rule.Target == RuleTarget.Family
            ? NameSynth.BuildCompliantName(current, rule, org)
            : Recover(current, rule, org, ctx, p);
        if (candidate == null) return p;                              // Recover already explained
        if (!rx.IsMatch(candidate)) return Fail(p, $"recovered '{candidate}' does not match the schema");
        p.Name = candidate;
        if (candidate == current) { p.Verdict = NameVerdict.Conforming; return p; }
        if (ctx.ExistingNamesInFamily.Contains(candidate) || ctx.SiblingProposals.Contains(candidate))
        {
            p.Verdict = NameVerdict.Blocked;
            p.Notes.Add($"duplicate of {candidate} — merge is a human decision");
            return p;
        }
        p.Verdict = NameVerdict.Proposed;
        return p;
    }

    private static NameProposal Fail(NameProposal p, string note) { p.Verdict = NameVerdict.NeedsHuman; p.Notes.Add(note); return p; }

    /// <summary>
    /// The slots a person fills for a type name the recovery could not finish (founder's request 2026-09-28): the
    /// office code and any enum value the name already carries are fixed; an enum the name lacks is a pick from the
    /// rule's allowed values; free-text tokens get the leftover words as a prefill; SIZE is the measured width when
    /// there is one. Never a proposal by itself — <see cref="Assemble"/> + the rule's regex decide.
    /// </summary>
    public static List<TokenSlot> Skeleton(string current, Rule rule, string? org, NamingContext ctx)
    {
        var norm = Normalize((current ?? "").Trim());
        var o = (org ?? "").Trim();
        var segments = norm.Split(new[] { rule.Separator }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim()).Where(s => s.Length > 0)
            .Where(s => !s.Equals(o, StringComparison.OrdinalIgnoreCase) && !NoiseWords.Contains(s.ToUpperInvariant()))
            .ToList();
        var slots = new List<TokenSlot>();
        var free = new List<TokenSlot>();
        foreach (var token in rule.Tokens)
        {
            rule.TokenDefs.TryGetValue(token, out var rawDef);
            var def = rawDef ?? "";
            var slot = new TokenSlot { Token = token, Hint = def.Length == 0 ? "any letters, digits or dashes" : RuleRegex.DefWithOrg(def, org) };
            if (def == RuleRegex.OrgPlaceholder || (o.Length > 0 && (def == o || def == Regex.Escape(o))))
            { slot.Value = o.Length > 0 ? o : null; if (slot.Value == null) slot.Prefill = ""; slots.Add(slot); continue; }
            if (token.Equals("SIZE", StringComparison.OrdinalIgnoreCase))
            {
                if (def.Contains(" x ") && TypeNameParse.TrySection(norm, out var w, out var h)) slot.Value = $"{Mm(w)} x {Mm(h)} mm";
                else if (!def.Contains(" x "))
                {
                    var named = TypeNameParse.ThicknessMm(norm);
                    var v = ctx.WidthMm ?? (named == double.MaxValue ? (double?)null : named);
                    if (v != null) slot.Value = $"{Mm(v.Value)} mm";
                }
                var seg = segments.FirstOrDefault(s => Regex.IsMatch(s, @"\d+(\.\d+)?\s*(x\s*\d+(\.\d+)?\s*)?mm$", RegexOptions.IgnoreCase));
                if (seg != null) segments.Remove(seg);
                if (slot.Value == null) slot.Prefill = "";
                slots.Add(slot); continue;
            }
            if (EnumDef.IsMatch(def))
            {
                var allowed = def.Split('|').ToList();
                var hit = segments.FirstOrDefault(s => allowed.Contains(Canon(s), StringComparer.OrdinalIgnoreCase));
                if (hit != null) { slot.Value = allowed.First(a => a.Equals(Canon(hit), StringComparison.OrdinalIgnoreCase)); segments.Remove(hit); }
                else slot.Options = allowed;
                slots.Add(slot); continue;
            }
            slots.Add(slot); free.Add(slot);
        }
        // The leftover words seed the free-text slots in order; the last one takes whatever remains.
        for (int i = 0; i < free.Count; i++)
        {
            if (i < segments.Count)
                free[i].Prefill = string.Join(" ", i == free.Count - 1 ? segments.Skip(i) : new[] { segments[i] }).ToUpperInvariant();
        }
        return slots;
    }

    /// <summary>The name the slots spell, in token order (a slot's Value, else what the person chose or typed).</summary>
    public static string Assemble(Rule rule, IEnumerable<string> values) => string.Join(rule.Separator, values.Select(v => (v ?? "").Trim()));

    // ---- type rules: recover tokens from the name + measured size ----
    private static string? Recover(string current, Rule rule, string? org, NamingContext ctx, NameProposal p)
    {
        var norm = Normalize(current);
        var o = (org ?? "").Trim();
        var segments = norm.Split(new[] { rule.Separator }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim()).Where(s => s.Length > 0)
            .Where(s => !s.Equals(o, StringComparison.OrdinalIgnoreCase) && !NoiseWords.Contains(s.ToUpperInvariant()))
            .ToList();
        var values = new Dictionary<string, string>();
        var freeText = new List<string>();

        // Pass 1: literal / enum / size tokens consume their segment; nothing is defaulted.
        foreach (var token in rule.Tokens)
        {
            rule.TokenDefs.TryGetValue(token, out var rawDef);
            var def = rawDef ?? "";
            // The ORG token: still "{org}" in a raw ruleset, or the office code itself (regex-escaped) once
            // OrgNames.Apply expanded the ruleset at load — both spell the same literal.
            if (def == RuleRegex.OrgPlaceholder || (o.Length > 0 && (def == o || def == Regex.Escape(o))))
            { values[token] = o; continue; }
            if (token.Equals("SIZE", StringComparison.OrdinalIgnoreCase))
            {
                var size = RecoverSize(norm, def, ctx, segments, p);
                if (size == null) return null;
                values[token] = size; continue;
            }
            if (EnumDef.IsMatch(def))
            {
                var allowed = def.Split('|');
                var hit = segments.FirstOrDefault(s => allowed.Contains(Canon(s), StringComparer.OrdinalIgnoreCase));
                if (hit == null) { Fail(p, $"no {token} in name (expected one of {def})"); return null; }
                values[token] = allowed.First(a => a.Equals(Canon(hit), StringComparison.OrdinalIgnoreCase));
                segments.Remove(hit); continue;
            }
            freeText.Add(token);
        }
        // Pass 2: free-text tokens take the leftovers, in order, one segment each.
        if (segments.Count != freeText.Count)
        {
            Fail(p, freeText.Count == 0
                ? $"leftover text '{string.Join(" ", segments)}' has no token to go to"
                : $"cannot tell {string.Join("/", freeText)} from the leftover '{string.Join(" | ", segments)}'");
            return null;
        }
        for (int i = 0; i < freeText.Count; i++) values[freeText[i]] = segments[i].ToUpperInvariant();
        return string.Join(rule.Separator, rule.Tokens.Select(t => values[t]));
    }

    /// The one width-mismatch test, shared by the early guard and RecoverSize: a size in the name that
    /// disagrees with the measured Width by more than 0.5 mm is a human decision, never a silent rewrite.
    private static bool WidthMismatch(double? named, double? widthMm, out string? why)
    {
        why = null;
        if (named == null || widthMm == null || Math.Abs(named.Value - widthMm.Value) <= 0.5) return false;
        why = $"name says {Mm(named.Value)} mm, Width is {Mm(widthMm.Value)} mm";
        return true;
    }

    private static string Canon(string segment) => Aliases.TryGetValue(segment, out var a) ? a : segment.ToUpperInvariant();

    private static string? RecoverSize(string norm, string def, NamingContext ctx, List<string> segments, NameProposal p)
    {
        var isSection = def.Contains(" x ");
        string? seg = null;
        string? value = null;
        if (isSection)
        {
            // Nominal size lives in the NAME only (audit §3) — the Width/Height parameters are never used.
            if (!TypeNameParse.TrySection(norm, out var w, out var h)) { Fail(p, "no W x H in name"); return null; }
            value = $"{Mm(w)} x {Mm(h)} mm";
            seg = segments.FirstOrDefault(s => Regex.IsMatch(s, @"\d+(\.\d+)?\s*x\s*\d+(\.\d+)?\s*mm", RegexOptions.IgnoreCase));
        }
        else
        {
            var fromName = TypeNameParse.ThicknessMm(norm);
            double? named = fromName == double.MaxValue ? null : fromName;
            if (WidthMismatch(named, ctx.WidthMm, out var why)) { Fail(p, why!); return null; }
            var v = ctx.WidthMm ?? named;
            if (v == null) { Fail(p, "no size in name and no measured Width"); return null; }
            value = $"{Mm(v.Value)} mm";
            seg = segments.FirstOrDefault(s => Regex.IsMatch(s, @"^\d+(\.\d+)?\s*mm$", RegexOptions.IgnoreCase));
        }
        if (seg != null) segments.Remove(seg);
        return value;
    }

    private static string Mm(double v) => v % 1 == 0 ? ((long)v).ToString(CultureInfo.InvariantCulture) : v.ToString("0.##", CultureInfo.InvariantCulture);

    /// Diacritics folded, units and separators normalised. Case is left alone (free text is uppercased later).
    internal static string Normalize(string s)
    {
        var sb = new StringBuilder();
        foreach (var ch in s.Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch);
        var t = sb.ToString().Normalize(NormalizationForm.FormC);
        t = Regex.Replace(t, @"(\d+(?:\.\d+)?)\s*_?\s*cm\b", m => Mm(double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) * 10) + " mm", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)", "$1 x $2");
        t = Regex.Replace(t, @"(\d+(?:\.\d+)?)\s*_?\s*mm\b", "$1 mm", RegexOptions.IgnoreCase);
        return Regex.Replace(t, @"[ ]{2,}", " ").Trim();
    }
}
