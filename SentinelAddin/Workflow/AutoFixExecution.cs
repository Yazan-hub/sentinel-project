using System.Text;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using Sentinel.Engine;

namespace Sentinel.Workflow;

/// <summary>
/// Auto-Remediator: forcefully renames a non-compliant element to satisfy its
/// JSON token schema. Fix strategy per token, left to right:
///   1. If a segment of the current name already matches the token def, keep it.
///   2. Otherwise synthesize the token's default (first alternative of its
///      regex alternation, e.g. "WIP|SH|..." -> "WIP"), or sanitize the
///      remaining free text into the token's charset.
/// The rename runs inside a transaction on the ExternalEvent queue — never on
/// the WPF thread — and is fully audited + snapshot-synced so the DMU does not
/// re-flag its own fix.
/// </summary>
public static class AutoFixExecution
{
    /// <summary>Compute the synthesized suggestion without touching the model
    /// (used by FixReviewDialog to pre-fill its editable TextBox).</summary>
    public static string? Suggest(string currentName, string ruleId)
    {
        var rule = App.Engine?.Ruleset.Rules.FirstOrDefault(r => r.Id == ruleId);
        return rule is null || rule.Tokens.Count == 0 ? null : BuildCompliantName(currentName, rule);
    }

    /// <summary>Queue an auto-fix for a violation. UI-thread safe.
    /// finalName: coordinator-approved name from FixReviewDialog; when null,
    /// the token synthesis result is used as-is.
    /// onDone(oldName, newName|null) fires back on the hub after completion.</summary>
    public static void Run(long elementId, string ruleId, Action<string, string?>? onDone = null, string? finalName = null)
    {
        App.Events?.Enqueue(uiapp =>
        {
            var doc = uiapp.ActiveUIDocument?.Document;
            var rule = App.Engine?.Ruleset.Rules.FirstOrDefault(r => r.Id == ruleId);
            if (doc is null || rule is null || rule.Tokens.Count == 0) { onDone?.Invoke("", null); return; }

            var element = doc.GetElement(elementId.ToElementId());
            if (element is null) { onDone?.Invoke("", null); return; }

            string oldName = element is ViewSheet sh ? sh.SheetNumber : element.Name;
            string candidate = string.IsNullOrWhiteSpace(finalName)
                ? BuildCompliantName(oldName, rule)
                : finalName!.Trim();
            if (candidate == oldName) { onDone?.Invoke(oldName, null); return; }

            using var t = new Transaction(doc, "Sentinel: Auto-fix " + ruleId);
            t.Start();
            try
            {
                candidate = Deduplicate(doc, element, rule, candidate);
                if (element is ViewSheet sheet) sheet.SheetNumber = candidate;
                else element.Name = candidate;

                RequestManager.UpdateSnapshot(doc, elementId, candidate);
                RequestStore.Upsert(doc,
                    new ChangeRequest
                    {
                        RuleId = ruleId,
                        ElementId = elementId,
                        ElementCategory = element.Category?.Name ?? element.GetType().Name,
                        OldValue = oldName,
                        NewValue = candidate,
                        RequestedBy = doc.Application.Username,
                        Status = RequestStatus.Approved,          // machine fix = pre-approved
                        VerdictBy = "Sentinel.AutoFix",
                        VerdictAt = DateTimeOffset.Now,
                        VerdictNote = "Automatic remediation",
                    },
                    new AuditEntry
                    {
                        Actor = doc.Application.Username,
                        Action = "autofix.applied",
                        Detail = ruleId + ": '" + oldName + "' -> '" + candidate + "'",
                    });
                t.Commit();
                Engine.RoiTracker.Log("autofix", ruleId + ": '" + oldName + "' -> '" + candidate + "'");
                onDone?.Invoke(oldName, candidate);
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException)
            {
                t.RollBack();                                     // name collision, read-only, etc.
                onDone?.Invoke(oldName, null);
            }
        });
    }

    // ---------------- Name synthesis ----------------
    internal static string BuildCompliantName(string current, Rule rule)
    {
        var sep = rule.Separator;
        var segments = current.Split(new[] { sep }, StringSplitOptions.RemoveEmptyEntries);
        var output = new List<string>(rule.Tokens.Count);
        int consumed = 0;

        foreach (var token in rule.Tokens)
        {
            rule.TokenDefs.TryGetValue(token, out var def);
            var rx = def is null ? null : new Regex("^(?:" + def + ")$", RegexOptions.CultureInvariant);

            if (consumed < segments.Length && rx is not null && rx.IsMatch(segments[consumed]))
            {
                output.Add(segments[consumed]);                   // keep valid segment
                consumed++;
            }
            else if (IsLastFreeTextToken(token, rule) && consumed < segments.Length)
            {
                // Fold ALL remaining segments into the trailing description token
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

    /// First alternative of a top-level alternation is the schema's canonical
    /// default ("WIP|SH|..." -> "WIP"). Falls back to a literal placeholder.
    internal static string DefaultFor(string? def, string token)
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
        candidate = Regex.Replace(candidate, @"[\^\$\?\*\+\\\(\)]", "");
        return candidate.Length > 0 ? candidate : token.ToUpperInvariant();
    }

    /// Strip characters the token def cannot accept; collapse whitespace.
    internal static string Sanitize(string text, string? def)
    {
        var cleaned = Regex.Replace(text, @"[^\w /&\+\-]", " ");
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        if (def is null) return cleaned;
        var rx = new Regex("^(?:" + def + ")$", RegexOptions.CultureInvariant);
        if (rx.IsMatch(cleaned)) return cleaned;
        var upper = cleaned.ToUpperInvariant();
        return rx.IsMatch(upper) ? upper : cleaned;
    }

    /// Revit rejects duplicate names for many classes: probe and suffix.
    private static string Deduplicate(Document doc, Element element, Rule rule, string candidate)
    {
        var collector = new FilteredElementCollector(doc).OfClass(element.GetType());
        var taken = new HashSet<string>(
            collector.Where(e => e.Id != element.Id)
                     .Select(e => e is ViewSheet s ? s.SheetNumber : e.Name));
        if (!taken.Contains(candidate)) return candidate;
        for (int i = 1; i < 100; i++)
        {
            var probe = candidate + rule.Separator + i.ToString("D2");
            if (!taken.Contains(probe)) return probe;
        }
        return candidate + rule.Separator + Guid.NewGuid().ToString("N").Substring(0, 6).ToUpperInvariant();
    }
}
