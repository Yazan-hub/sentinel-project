using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using static Sentinel.Engine.IfcDeliveryGate;

namespace Sentinel.Engine;

/// <summary>
/// The words the IFC Delivery Gate and Governed Publish print, and the audit row they post (cohesion phase 4b-1).
/// They are built from the <see cref="GateResult"/> alone, so tools/gate-check pins them. Every line names what
/// judged: contract@n · source · sha, or the none label. A NOT CHECKED gate never reads as a pass or a fail.
/// Pure: no Revit, no HTTP.
/// </summary>
public static class GateLines
{
    /// <summary>What an unbound document's gate reads (spec 4b-1).</summary>
    public const string NotBoundVerdict = "NOT CHECKED — not bound — Sentinel ▸ Project Setup";

    /// <summary>"PASS · contract@1 · office · 3f9a0c1d2e4b… · Schema IFC4", "FAIL · … · Schema IFC2X3",
    /// "NOT CHECKED — contract: none — not installed for &lt;key&gt; or its office", or <see cref="NotBoundVerdict"/>
    /// when the document has no project key.</summary>
    public static string Verdict(GateResult r, string projectKey) => r.Outcome switch
    {
        GateOutcome.Pass => "PASS · " + r.ContractLabel + " · Schema " + Schema(r),
        GateOutcome.Fail => "FAIL · " + r.ContractLabel + " · Schema " + Schema(r),
        _ => (projectKey ?? "").Trim().Length == 0 ? NotBoundVerdict : "NOT CHECKED — contract: " + r.ContractLabel,
    };

    /// <summary>Governed Publish's gate line, used by the accept/recorded dialog, the IDS/naming reject dialog and the
    /// bridge-unreachable dialog.</summary>
    public static string PublishLine(GateResult r, string projectKey) => "Delivery gate: " + Verdict(r, projectKey);

    /// <summary>The IFC Delivery Gate's first dialog. It names the contract that will judge (never a machine path)
    /// and says what an export produces. <paramref name="contractSchema"/> is null when no contract is in force.</summary>
    public static string Intro(string? contractSchema, string contractLabel) =>
        "Contract: " + contractLabel + "\n" +
        (contractSchema is null
            ? "Nothing will be judged: an export is IFC 2x3 and the certificate says NOT_CHECKED (it still records the file's SHA-256)."
            : "An export is " + (string.Equals(contractSchema, "IFC4", StringComparison.OrdinalIgnoreCase) ? "IFC4 Reference View" : "IFC 2x3 CV2") +
              ", the schema this contract asks for.");

    /// <summary>The IFC Delivery Gate's result dialog. The caller adds the line saying where it was recorded.</summary>
    public static string GateDialog(GateResult r, string projectKey)
    {
        var size = (r.FileSizeBytes / 1048576.0).ToString("F1", CultureInfo.InvariantCulture) + " MB";
        var cert = "Certificate: " + r.CertificatePath + "\nSHA-256: " +
                   r.FileSha256.Substring(0, Math.Min(16, r.FileSha256.Length)) + "…";
        if (r.Outcome == GateOutcome.NotChecked)
            return Verdict(r, projectKey) + "\n\n" +
                   "Nothing was judged — this file is NOT certified for CDE upload.\n" +
                   "Schema: " + Schema(r) + " (" + size + ")\n\n" + cert;
        var top = r.EntityCounts.OrderByDescending(kv => kv.Value).Take(6).Select(kv => kv.Key + ": " + kv.Value);
        return (r.Outcome == GateOutcome.Pass ? "✓ PASS — certified for CDE upload" : "✕ FAIL — DO NOT upload this file") + "\n\n" +
               "Contract: " + r.ContractLabel + " · Schema: " + Schema(r) + "\n" +
               "Entities: " + r.TotalEntities + " (" + size + ")\n" +
               string.Join("\n", top) + "\n\n" +
               (r.Failures.Count > 0 ? "FAILURES:\n• " + string.Join("\n• ", r.Failures) + "\n\n" : "") +
               (r.Warnings.Count > 0 ? "Warnings:\n• " + string.Join("\n• ", r.Warnings) + "\n\n" : "") +
               cert;
    }

    /// <summary>Governed Publish's reject dialog when the gate FAILED. It names the contract that judged, shows the
    /// first 12 failures and counts the rest.</summary>
    public static string PublishRejected(GateResult r) =>
        "✕ REJECTED — delivery gate failed (not published)\n\n" +
        "Contract: " + r.ContractLabel + " · Schema: " + Schema(r) + "\n\n" +
        "FAILURES:\n• " + string.Join("\n• ", r.Failures.Take(12)) + "\n" +
        (r.Failures.Count > 12 ? "… and " + (r.Failures.Count - 12) + " more\n" : "") +
        "\nFix the deliverable and run Governed Publish again.";

    /// <summary>The audit row's action: "IFC delivery gate PASS | FAIL | NOT CHECKED: &lt;file&gt;". This is the
    /// same message intake writes.</summary>
    public static string AuditAction(string file, GateResult r) =>
        "IFC delivery gate " + (r.Outcome switch { GateOutcome.Pass => "PASS", GateOutcome.Fail => "FAIL", _ => "NOT CHECKED" }) +
        ": " + file;

    /// <summary>The audit row's value, with the Node intake gate row's fields:
    /// <list type="bullet">
    /// <item>result: "pass" | "fail" | "not_checked"</item>
    /// <item>passed: true | false | null. Null means not checked, never a pass or a fail.</item>
    /// <item>the contract's display key and its ref · source · sha, all null when none</item>
    /// <item>entities: null when not checked</item>
    /// <item>the failure count, the file's sha256, and source "revit"</item>
    /// </list></summary>
    public static Dictionary<string, object?> AuditValue(string file, GateResult r)
    {
        var judged = r.Outcome != GateOutcome.NotChecked;
        return new Dictionary<string, object?>
        {
            ["file"] = file,
            ["result"] = r.Outcome switch { GateOutcome.Pass => "pass", GateOutcome.Fail => "fail", _ => "not_checked" },
            ["passed"] = judged ? r.Outcome == GateOutcome.Pass : (bool?)null,
            ["contract"] = judged ? r.ContractKey : null,
            ["contract_ref"] = r.ContractRef,
            ["contract_source"] = r.ContractSource,
            ["contract_sha256"] = r.ContractSha256,
            ["schema"] = r.DetectedSchema,
            ["entities"] = judged ? r.TotalEntities : (int?)null,
            ["failures"] = r.Failures.Count,
            ["sha256"] = r.FileSha256,
            ["source"] = "revit",
        };
    }

    private static string Schema(GateResult r) => r.DetectedSchema.Length > 0 ? r.DetectedSchema : "not detected";
}
