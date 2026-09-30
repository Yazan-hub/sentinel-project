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

    /// <summary>Governed Publish's accept dialog when the IDS accepted and no contract judged: intake's note, word for
    /// word (amendment A3).</summary>
    public static string JudgedAlone(GateResult r) =>
        "The IDS judged alone — the delivery gate was not checked (contract: " + r.ContractLabel + ").";

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
        return (r.Outcome == GateOutcome.Pass ? "✓ contract PASS — IDS not checked here (Governed Publish judges ids@n)" : "✕ FAIL — DO NOT upload this file") + "\n\n" +
               "Contract: " + r.ContractLabel + " · Schema: " + Schema(r) + "\n" +
               "Entities: " + r.TotalEntities + " (" + size + ")\n" +
               string.Join("\n", top) + "\n\n" +
               (r.Coverage.Count > 0 ? "Coverage:\n• " + string.Join("\n• ", r.Coverage.Take(12).Select(c => c.Requirement + " · " + c.Entity + " " + c.Covered + "/" + c.Total)) +
                                       (r.Coverage.Count > 12 ? "\n… and " + (r.Coverage.Count - 12) + " more" : "") + "\n\n" : "") +
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

    /// <summary>The most failures the delivery-gate route takes in one row (it refuses a longer list).</summary>
    public const int RouteFailures = 200;

    /// <summary>The body of <c>POST /cde/:key/delivery-gate</c> (spec 2026-09-27 Decision 5), which the bridge stores
    /// as the delivery_gate row's value — it words the row "IFC delivery gate PASS | FAIL | NOT CHECKED: &lt;file&gt;"
    /// itself, as intake's:
    /// <list type="bullet">
    /// <item>result: "pass" | "fail" | "not_checked"</item>
    /// <item>passed: true | false | null. Null means not checked, never a pass or a fail.</item>
    /// <item>the contract's display key and its ref · source · sha, all null when none; schema null when not detected</item>
    /// <item>entities: null when not checked</item>
    /// <item>failures: the list itself — past <see cref="RouteFailures"/>, the first 199 and one line counting the rest
    /// (the certificate beside the IFC keeps every one); failures_total: how many there are, so the bridge's hold
    /// counts the ones it does not keep</item>
    /// <item>sha256 and size_bytes of the certified file, both null when it was never read</item>
    /// <item>source: "revit" (Governed Publish), "auto-publish" or "check" (the IFC Delivery Gate command); publish:
    /// true when a publish is judging the file — the bridge then holds a FAIL on the web (Project Files ▸ On hold)</item>
    /// </list></summary>
    public static Dictionary<string, object?> AuditValue(string file, GateResult r, string source, bool publish)
    {
        var judged = r.Outcome != GateOutcome.NotChecked;
        var read = r.FileSha256.Length == 64; // IfcDeliveryGate.Seal hashed the file: its bytes were read
        var failures = r.Failures.Count <= RouteFailures
            ? r.Failures.ToList()
            : r.Failures.Take(RouteFailures - 1)
                        .Concat(new[] { "… and " + (r.Failures.Count - RouteFailures + 1) + " more — the certificate lists every one" }).ToList();
        return new Dictionary<string, object?>
        {
            ["file"] = file,
            ["result"] = r.Outcome switch { GateOutcome.Pass => "pass", GateOutcome.Fail => "fail", _ => "not_checked" },
            ["passed"] = judged ? r.Outcome == GateOutcome.Pass : (bool?)null,
            ["contract"] = judged ? r.ContractKey : null,
            ["contract_ref"] = r.ContractRef,
            ["contract_source"] = r.ContractSource,
            ["contract_sha256"] = r.ContractSha256,
            ["schema"] = r.DetectedSchema.Length > 0 ? r.DetectedSchema : null,
            ["entities"] = judged ? r.TotalEntities : (int?)null,
            ["failures"] = failures,
            ["failures_total"] = r.Failures.Count,
            ["sha256"] = read ? r.FileSha256 : null,
            ["size_bytes"] = read ? r.FileSizeBytes : (long?)null,
            ["source"] = source,
            ["publish"] = publish,
        };
    }

    private static string Schema(GateResult r) => r.DetectedSchema.Length > 0 ? r.DetectedSchema : "not detected";
}
