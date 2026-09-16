using System.IO;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;

namespace Sentinel.Engine;

/// <summary>
/// CDE Sync Guard: validates the central file name against the office/ISO 19650
/// container conventions when a sync completes. Revit's API cannot veto a
/// sync (DocumentSynchronizedWithCentral is post-event and the Synchronizing
/// pre-event is not cancellable), so the guard reports loudly instead of
/// blocking — violation lands in the panel + audit trail, and Phase 3 posts
/// it to the backend so a misnamed file is caught the first time it syncs.
/// </summary>
public static class CdeSyncGuard
{
    public const string RuleId = "CDE-01";

    // Office RTG §2.1: {org}_[ProjectCode]_[ProjectName].rvt (central) — pattern built from the
    // configured office code (OrgNames.CentralFilePattern); no org -> only the ISO string is checked.

    // Full ISO 19650 container string (project-level deliverable copies)
    private static readonly Regex IsoContainerRx = new(
        @"^[A-Z]{2,5}\d{4,6}-[A-Z]{2,5}-[A-Z]{2}(-[A-Z]{2})?-[A-Z]{2,4}-(ZZ|Z\d|XX|\d{2})-[A-Z0-9]{2}-(XX|\d{2}|B\d)-\d{4}$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>Called from App.OnSynchronized (already wired to the
    /// DocumentSynchronizedWithCentral event). Returns the violation for the
    /// panel, or null when compliant.</summary>
    public static Violation? Check(DocumentSynchronizedWithCentralEventArgs e)
    {
        var doc = e.Document;
        if (doc is null || !doc.IsWorkshared) return null;

        string fileName = Path.GetFileNameWithoutExtension(
            doc.GetWorksharingCentralModelPath() is ModelPath mp
                ? ModelPathUtils.ConvertModelPathToUserVisiblePath(mp)
                : doc.PathName);
        if (string.IsNullOrEmpty(fileName)) fileName = doc.Title;

        // Settings-aware (SettingsManager: project ES -> machine JSON): when a
        // project code is configured, the file name must also carry it —
        // catches "right pattern, wrong project" copies on the CDE.
        var projectCode = SettingsManager.Resolve(doc).ProjectCode;
        bool codeOk = string.IsNullOrEmpty(projectCode) ||
                      fileName.IndexOf(projectCode, StringComparison.OrdinalIgnoreCase) >= 0;

        var rs = App.Engine?.Ruleset;
        string org = rs?.Org ?? string.Empty;
        bool orgConfigured = OrgNames.Configured(org);
        bool centralOk = orgConfigured && Regex.IsMatch(fileName, OrgNames.CentralFilePattern(org), RegexOptions.CultureInvariant);

        if ((centralOk || IsoContainerRx.IsMatch(fileName)) && codeOk)
            return null;

        if (!codeOk)
            return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
                "Central file '" + fileName + "' does not contain the configured project code '" +
                projectCode + "'. Verify this model belongs to the project.",
                "اسم الملف لا يحتوي على رمز المشروع المحدد.",
                "ISO 19650-2 / Project Setup");

        string? rtg = OrgNames.DocRef(rs, "rtg");
        string docRef = rtg is null ? "ISO 19650-2" : rtg + " §2.1 / ISO 19650-2";
        return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
            orgConfigured
                ? "Central file '" + fileName + "' does not match " + OrgNames.CentralFileHint(org) + " " +
                  "or the ISO 19650 container string. Rename via BIM Manager before the next issue."
                : "Central file '" + fileName + "' does not match the ISO 19650 container string " +
                  "(no office code configured — the office central-file pattern was not checked). " +
                  "Rename via BIM Manager before the next issue.",
            "اسم الملف المركزي لا يطابق اتفاقية التسمية المعتمدة.",
            docRef);
    }
}
