using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>CDE-01's decision, pure (no Revit, no HTTP) so tools/naming-port-check can pin it. The Revit half
/// (CdeSyncGuard.cs) reads the file name, the document's project code, the office code and the naming@n the
/// document resolved, and calls <see cref="Decide"/>.</summary>
public static partial class CdeSyncGuard
{
    public const string RuleId = "CDE-01";

    /// <param name="namingBody">The naming@n body, or null when there is none to judge by.</param>
    /// <param name="namingLabel">What judged, as every surface prints it ("naming@1 · office · 3f07…",
    /// "… (cached 14:02)", "none — not installed for aster-villa or its office", "not bound — …").</param>
    /// <returns>Null when the name passes; a Warn violation when it fails; a Monitor note (never scored) when
    /// there is no naming standard to judge by.</returns>
    public static Violation? Decide(string fileName, string? projectCode, string? org, string? namingBody, string namingLabel)
    {
        // "Right pattern, wrong project": the document's own project code (Project Setup) must be in the name.
        if (!string.IsNullOrEmpty(projectCode) && fileName.IndexOf(projectCode, StringComparison.OrdinalIgnoreCase) < 0)
            return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
                "Central file '" + fileName + "' does not contain the configured project code '" +
                projectCode + "'. Verify this model belongs to the project.",
                "اسم الملف لا يحتوي على رمز المشروع المحدد.",
                "Project Setup");

        // The office's central-file convention ({org}_[ProjectCode]_[ProjectName]) — the org is ruleset data.
        if (OrgNames.Configured(org) && Regex.IsMatch(fileName, OrgNames.CentralFilePattern(org!), RegexOptions.CultureInvariant))
            return null;

        if (namingBody is null)
            return new Violation(RuleId, EnforcementMode.Monitor, -1, fileName,
                "Central file '" + fileName + "' not checked — no naming standard to judge it by: " + namingLabel + ".",
                null, namingLabel);

        var v = ContainerNameJudge.Judge(fileName, namingBody);
        if (v.Ok) return null;
        string alt = OrgNames.Configured(org) ? " or " + OrgNames.CentralFileHint(org!) : "";
        return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
            "Central file '" + fileName + "' does not match " + namingLabel + alt + ": " +
            string.Join("; ", v.Failures.Select(f => f.Reason)) + ". Rename via BIM Manager before the next issue.",
            "اسم الملف المركزي لا يطابق اتفاقية التسمية المعتمدة.",
            namingLabel);
    }
}
