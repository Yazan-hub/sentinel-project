using System;
using System.Linq;
using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>CDE-01's decision, pure (no Revit, no HTTP) so tools/naming-port-check can pin it. The Revit half
/// (CdeSyncGuard.cs) reads the file name, the document's project code and the naming@n the document resolved, and
/// calls <see cref="Decide"/> before each sync (App.OnSynchronizing).</summary>
public static partial class CdeSyncGuard
{
    public const string RuleId = "CDE-01";

    /// <param name="namingBody">The naming@n body, or null when there is none to judge by.</param>
    /// <param name="namingLabel">What judged, as every surface prints it ("naming@1 · office · 3f07…",
    /// "… (cached 14:02)", "none — not installed for aster-villa or its office", "not bound — …").</param>
    /// <returns>GP-3, the bridge's verdict on the same name (/propose, judgeContainerName): the name judged by naming@n
    /// alone — no office-pattern short-circuit ("AST_ASTR26_Aster Tower" passed it here and failed naming@1 there).
    /// A failing name is a Block when naming@n's <c>enforce</c> is reject (absent = reject, as the bridge) — the sync
    /// stops — and a Warn otherwise; <c>enforce: off</c> judges nothing. Then the document's project code must be in
    /// the name (Warn). Null when the name passes; a Monitor note (never scored) when there is no naming@n.</returns>
    public static Violation? Decide(string fileName, string? projectCode, string? namingBody, string namingLabel)
    {
        if (namingBody is not null && Enforce(namingBody) is var enforce && enforce != "off")
        {
            var v = ContainerNameJudge.Judge(fileName, namingBody);
            if (!v.Ok)
            {
                bool reject = enforce == "reject";
                return new Violation(RuleId, reject ? EnforcementMode.Block : EnforcementMode.Warn, -1, fileName,
                    "Central file '" + fileName + "' does not match " + namingLabel + ": " +
                    string.Join("; ", v.Failures.Select(f => f.Reason)) + ". " +
                    (reject ? "The naming standard rejects this name (enforce: reject) — Governed Publish rejects it too."
                            : "Recorded as a warning (enforce: warn)."),
                    "اسم الملف المركزي لا يطابق اتفاقية التسمية المعتمدة.",
                    namingLabel);
            }
        }

        // "Right pattern, wrong project": the document's own project code (Project Setup) must be in the name.
        if (!string.IsNullOrEmpty(projectCode) && fileName.IndexOf(projectCode, StringComparison.OrdinalIgnoreCase) < 0)
            return new Violation(RuleId, EnforcementMode.Warn, -1, fileName,
                "Central file '" + fileName + "' does not contain the configured project code '" +
                projectCode + "'. Verify this model belongs to the project.",
                "اسم الملف لا يحتوي على رمز المشروع المحدد.",
                ProjectSetupRef);

        if (namingBody is null)
            return new Violation(RuleId, EnforcementMode.Monitor, -1, fileName,
                "Central file '" + fileName + "' not checked — no naming standard to judge it by: " + namingLabel + ".",
                null, namingLabel);
        return null;
    }

    private const string ProjectSetupRef = "Project Setup";

    /// <summary>GP-3: whether this row stops the sync before it runs — a Block, or naming@n's warn ("Sync anyway /
    /// Cancel"). The project-code Warn and a Monitor note never ask: no naming standard judged them, and they join the
    /// pane's report after the sync.</summary>
    public static bool StopsSync(Violation v) =>
        v.Mode == EnforcementMode.Block || (v.Mode == EnforcementMode.Warn && v.DocRef != ProjectSetupRef);

    // naming@n's enforce as the bridge reads it (`rs.enforce ?? "reject"`): absent or null → "reject"; a string as
    // written; any other value → "" (neither reject nor off: recorded, not blocking). A body that does not parse
    // fails closed ("reject"), as ContainerNameJudge does.
    private static string Enforce(string namingBody)
    {
        try
        {
            using var d = JsonDocument.Parse(namingBody);
            if (d.RootElement.ValueKind != JsonValueKind.Object || !d.RootElement.TryGetProperty("enforce", out var e) ||
                e.ValueKind == JsonValueKind.Null) return "reject";
            return e.ValueKind == JsonValueKind.String ? e.GetString()! : "";
        }
        catch (JsonException) { return "reject"; }
    }
}
