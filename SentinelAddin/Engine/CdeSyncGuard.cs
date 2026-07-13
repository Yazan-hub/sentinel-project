using System.IO;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;

namespace Sentinel.Engine;

/// <summary>
/// CDE Sync Guard: validates the central file name against the BDS/ISO 19650
/// container conventions when a sync completes. Revit's API cannot veto a
/// sync (DocumentSynchronizedWithCentral is post-event and the Synchronizing
/// pre-event is not cancellable), so the guard reports loudly instead of
/// blocking — violation lands in the panel + audit trail, and Phase 3 posts
/// it to the backend so a misnamed file is caught the first time it syncs.
/// </summary>
public static class CdeSyncGuard
{
    public const string RuleId = "CDE-01";

    // BDS-RTG-001 §2.1: BDS_[ProjectCode]_[ProjectName].rvt (central)
    private static readonly Regex CentralRx = new(
        @"^BDS_[A-Z0-9]{4,10}_[\w \-]+$", RegexOptions.CultureInvariant | RegexOptions.Compiled);

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

        if ((CentralRx.IsMatch(fileName) || IsoContainerRx.IsMatch(fileName)) && codeOk)
            return null;

        if (!codeOk)
            return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
                "Central file '" + fileName + "' does not contain the configured project code '" +
                projectCode + "'. Verify this model belongs to the project.",
                "اسم الملف لا يحتوي على رمز المشروع المحدد.",
                "ISO 19650-2 / Project Setup");

        return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
            "Central file '" + fileName + "' does not match BDS_[ProjectCode]_[ProjectName] " +
            "or the ISO 19650 container string. Rename via BIM Manager before the next issue.",
            "اسم الملف المركزي لا يطابق اتفاقية التسمية المعتمدة.",
            "BDS-RTG-001 §2.1 / ISO 19650-2");
    }
}
