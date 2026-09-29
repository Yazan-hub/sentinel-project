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
    public static string? Suggest(string currentName, Rule? rule, string? org) =>
        rule is null || rule.Tokens.Count == 0 ? null : NameSynth.BuildCompliantName(currentName, rule, org);

    /// <summary>Queue an auto-fix for a violation. UI-thread safe.
    /// finalName: coordinator-approved name from FixReviewDialog; when null,
    /// the token synthesis result is used as-is.
    /// onDone(oldName, newName|null) fires back on the hub after completion.
    /// pinned: the document the pane's rows were scanned in (XC-1); the fix refuses (onRefused) when another model
    /// is active or it was closed.</summary>
    public static void Run(Document pinned, long elementId, string ruleId, Action<string, string?>? onDone = null,
                           string? finalName = null, Action<string>? onRefused = null)
    {
        App.Events?.Enqueue(pinned, "rename the element", (uiapp, doc) =>
        {
            var rule = App.Engine?.RulesetFor(doc).Rules.FirstOrDefault(r => r.Id == ruleId);
            if (rule is null || rule.Tokens.Count == 0) { onDone?.Invoke("", null); return; }

            var element = doc.GetElement(elementId.ToElementId());
            if (element is null) { onDone?.Invoke("", null); return; }

            string oldName = element is ViewSheet sh ? sh.SheetNumber : element.Name;
            string candidate = string.IsNullOrWhiteSpace(finalName)
                ? NameSynth.BuildCompliantName(oldName, rule, App.OrgFor(doc))
                : finalName!.Trim();
            if (candidate == oldName) { onDone?.Invoke(oldName, null); return; }

            if (rule.Mode == EnforcementMode.Request)
            {   // BG-4: a REQUEST rule is decided by a coordinator — file the proposal, rename nothing
                using var tp = new Transaction(doc, "Sentinel: Propose " + ruleId);
                tp.Start();
                bool filed = RequestManager.CreateProposal(doc, ruleId, element, candidate);
                tp.Commit();
                onDone?.Invoke(oldName, filed ? candidate : null);
                return;
            }

            using var t = new Transaction(doc, "Sentinel: Auto-fix " + ruleId);
            t.Start();
            try
            {
                candidate = Deduplicate(doc, element, rule, candidate);
                if (!RuleRegex.Matches(rule, App.OrgFor(doc), candidate, out _))
                {   // the de-duplicated name (a suffix) no longer passes the rule: write nothing (BG-5)
                    t.RollBack();
                    onDone?.Invoke(oldName, null);
                    return;
                }
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
                onDone?.Invoke(oldName, candidate);
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException)
            {
                t.RollBack();                                     // name collision, read-only, etc.
                onDone?.Invoke(oldName, null);
            }
        }, onRefused);
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
