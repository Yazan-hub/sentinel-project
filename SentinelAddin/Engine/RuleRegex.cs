using System.Linq;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>
/// The one token→regex compiler (moved out of RuleEngineHost so the Revit-free proposer validates with the
/// EXACT pattern the scanner enforces). Substitutes the office code for `{org}` first: escaped inside a
/// token def (it becomes regex), verbatim inside a message. An empty org leaves `{org}` in place — inside a
/// regex that literal matches no real name, so an unconfigured rule fails closed rather than open.
/// </summary>
public static class RuleRegex
{
    public const string OrgPlaceholder = "{org}";

    /// SEC-3: every pattern a ruleset brings is matched under this bound; past it the name is not evaluated (never a pass).
    public static readonly System.TimeSpan MatchTimeout = System.TimeSpan.FromMilliseconds(250);
    public const string TimedOut = "the rule's pattern took too long on this name — not evaluated (a lead corrects the pattern)";

    /// SEC-3: and a rule's matches within one scan, added up, are bounded by this; past it the rule stops for that scan.
    public static readonly System.TimeSpan ScanBudget = System.TimeSpan.FromSeconds(2);
    public const string TookTooLongAcrossScan = "the rule's pattern took too long across this scan — not evaluated (a lead corrects the pattern)";

    /// Runs one rule's judging: null when it ran to the end, else the words of its one Monitor note — a match past
    /// MatchTimeout, or the rule's matches past ScanBudget in this scan.
    public static string? Judge(System.Action judge)
    {
        try { judge(); return null; }
        catch (RegexMatchTimeoutException) { return TimedOut; }
        catch (ScanBudgetSpent) { return TookTooLongAcrossScan; }
    }

    /// One scan's matching time per rule (a new clock per scan). Time runs one match of the rule; once the rule's matches
    /// have taken ScanBudget, its next match throws ScanBudgetSpent, which Judge turns into the note.
    public sealed class ScanClock
    {
        private readonly System.Collections.Generic.Dictionary<Rule, System.TimeSpan> _spent = new System.Collections.Generic.Dictionary<Rule, System.TimeSpan>();

        public bool Time(Rule rule, System.Func<bool> match)
        {
            _spent.TryGetValue(rule, out var spent);
            if (spent >= ScanBudget) throw new ScanBudgetSpent();
            var sw = System.Diagnostics.Stopwatch.StartNew();
            try { return match(); }
            finally { _spent[rule] = spent + sw.Elapsed; }
        }
    }

    public sealed class ScanBudgetSpent : System.Exception { }

    public static string DefWithOrg(string def, string? org) =>
        string.IsNullOrWhiteSpace(org) ? def : def.Replace(OrgPlaceholder, Regex.Escape(org.Trim()));

    public static string TextWithOrg(string text, string? org) =>
        string.IsNullOrWhiteSpace(org) ? text : text.Replace(OrgPlaceholder, org.Trim());

    /// Does this rule reference the office code anywhere?
    public static bool NeedsOrg(Rule r) =>
        r.TokenDefs.Values.Any(d => d.Contains(OrgPlaceholder))
        || r.MessageEn.Contains(OrgPlaceholder)
        || (r.MessageAr?.Contains(OrgPlaceholder) ?? false);

    /// Anchored pattern: each token resolves through token_defs (unknown tokens match a safe default),
    /// joined by the escaped separator. Callers cache; this compiles a fresh Regex every call.
    public static Regex For(Rule r, string? org)
    {
        var parts = r.Tokens.Select(t =>
            r.TokenDefs.TryGetValue(t, out var def) ? "(?:" + DefWithOrg(def, org) + ")" : @"[A-Za-z0-9\-]+");
        return new Regex("^" + string.Join(Regex.Escape(r.Separator), parts) + "$",
                         RegexOptions.CultureInvariant, MatchTimeout);
    }

    /// BG-5: the one "does this name pass the rule" answer for every surface (scanner, ⚡ Fix dialog, the fix itself).
    /// A rule with no tokens has nothing to match. A malformed token def fails CLOSED with the reason — never a pass.
    public static bool Matches(Rule r, string? org, string text, out string? error)
    {
        error = null;
        if (r.Tokens.Count == 0) return true;
        try { return For(r, org).IsMatch(text); }
        catch (System.ArgumentException ex) { error = "the rule's pattern is malformed: " + ex.Message; return false; }
        catch (RegexMatchTimeoutException) { error = TimedOut; return false; }
    }
}
