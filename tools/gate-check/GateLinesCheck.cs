using System.Text.Json;
using Sentinel.Engine;
using static Sentinel.Engine.IfcDeliveryGate;

/// <summary>GateLines: what the IFC Delivery Gate and Governed Publish print, and the audit row they post
/// (cohesion phase 4b-1). Every line names what judged; NOT CHECKED never reads as a pass or a fail.</summary>
static class GateLinesCheck
{
    const string Sha = "3f9a0c1d2e4b5f60718293a4b5c6d7e8f90112233445566778899aabbccddeef";
    const string Label = "contract@1 · office · 3f9a0c1d2e4b…";
    const string NoneLabel = "none — not installed for north-yard or its office";
    const string UnboundLabel = "none — not bound — Sentinel ▸ Project Setup";

    static GateResult Judged(GateOutcome o, string schema, params string[] failures)
    {
        var r = new GateResult
        {
            Outcome = o, ContractLabel = Label, ContractRef = "contract@1", ContractSource = "office", ContractSha256 = Sha,
            ContractKey = "pilot-ifc4", IfcPath = @"C:\out\a.ifc", DetectedSchema = schema, FileSizeBytes = 1048576,
            TotalEntities = 40, FileSha256 = string.Concat(Enumerable.Repeat("ab", 32)),
            CertificatePath = @"C:\out\a.sentinel-cert.json",
        };
        r.EntityCounts["IFCWALLSTANDARDCASE"] = 12;
        r.EntityCounts["IFCCOLUMN"] = 3;
        r.Failures.AddRange(failures);
        return r;
    }

    // As IfcDeliveryGate.Validate leaves a result with no contract: the reason is the whole none label.
    static GateResult NotChecked(string label) => new GateResult
    {
        Outcome = GateOutcome.NotChecked, ContractLabel = label, NotCheckedReason = label,
        IfcPath = @"C:\out\a.ifc", DetectedSchema = "IFC2X3", FileSizeBytes = 1048576,
        FileSha256 = string.Concat(Enumerable.Repeat("cd", 32)), CertificatePath = @"C:\out\a.sentinel-cert.json",
    };

    public static void Run(Action<bool, string> ok)
    {
        Console.WriteLine("\nGateLines — what the IFC Delivery Gate and Governed Publish say, and the audit row they post\n");
        var pass = Judged(GateOutcome.Pass, "IFC4");
        var fail = Judged(GateOutcome.Fail, "IFC2X3",
            "Schema mismatch: contract requires IFC4, file is IFC2X3.", "IFCCOLUMN: 0 found, contract requires ≥ 1.");
        var none = NotChecked(NoneLabel);
        var unbound = NotChecked(UnboundLabel);

        // ── 1. the verdict line (spec 4b-1, Revit paragraph — exact) ──────────────────────────────────────────
        ok(GateLines.PublishLine(pass, "north-yard") == "Delivery gate: PASS · contract@1 · office · 3f9a0c1d2e4b… · Schema IFC4",
           "publish line: PASS names contract@n · source · sha and the schema");
        ok(GateLines.PublishLine(none, "north-yard") == "Delivery gate: NOT CHECKED — contract: none — not installed for north-yard or its office",
           "publish line: none reads NOT CHECKED with the none label");
        ok(GateLines.Verdict(fail, "north-yard") == "FAIL · contract@1 · office · 3f9a0c1d2e4b… · Schema IFC2X3",
           "verdict: FAIL names the contract and the schema");
        ok(GateLines.Verdict(unbound, "") == "NOT CHECKED — not bound — Sentinel ▸ Project Setup" && GateLines.NotBoundVerdict == GateLines.Verdict(unbound, "  "),
           "verdict: an unbound document reads NOT CHECKED — not bound");

        // ── 2. the IFC Gate's first dialog names the contract, never a machine path ──────────────────────────
        var intro = GateLines.Intro("IFC4", Label);
        ok(intro == "Contract: contract@1 · office · 3f9a0c1d2e4b…\nAn export is IFC4 Reference View, the schema this contract asks for.",
           "intro: the contract label and the schema an export will use");
        var introNone = GateLines.Intro(null, NoneLabel);
        ok(introNone == "Contract: " + NoneLabel + "\nNothing will be judged: an export is IFC 2x3 and the certificate says NOT_CHECKED (it still records the file's SHA-256).",
           "intro: none says nothing will be judged, IFC 2x3, NOT_CHECKED");
        ok(!intro.Contains("AppData") && !intro.Contains(".json") && !introNone.Contains("AppData") && !introNone.Contains(".json"),
           "intro: no machine path");

        // ── 3. the IFC Gate's result dialog ──────────────────────────────────────────────────────────────────
        var dPass = GateLines.GateDialog(pass, "north-yard");
        ok(dPass.StartsWith("✓ PASS — certified for CDE upload\n\nContract: " + Label + " · Schema: IFC4\nEntities: 40 (1.0 MB)\nIFCWALLSTANDARDCASE: 12\nIFCCOLUMN: 3\n\n"),
           "dialog: PASS heads with the contract label, schema and counts");
        ok(dPass.EndsWith("Certificate: C:\\out\\a.sentinel-cert.json\nSHA-256: abababababababab…"),
           "dialog: the certificate path and the file's SHA-256");
        var dFail = GateLines.GateDialog(fail, "north-yard");
        ok(dFail.StartsWith("✕ FAIL — DO NOT upload this file\n\nContract: " + Label + " · Schema: IFC2X3\n")
           && dFail.Contains("FAILURES:\n• Schema mismatch: contract requires IFC4, file is IFC2X3.\n• IFCCOLUMN: 0 found, contract requires ≥ 1.\n\n"),
           "dialog: FAIL lists every failure under the contract label");
        var dNone = GateLines.GateDialog(none, "north-yard");
        ok(dNone == "NOT CHECKED — contract: " + NoneLabel + "\n\nNothing was judged — this file is NOT certified for CDE upload.\n" +
                    "Schema: IFC2X3 (1.0 MB)\n\nCertificate: C:\\out\\a.sentinel-cert.json\nSHA-256: cdcdcdcdcdcdcdcd…",
           "dialog: none reads NOT CHECKED, not certified");
        ok(!dNone.Contains("PASS") && !dNone.Contains("✓") && !dNone.Contains("FAIL"),
           "dialog: NOT CHECKED never reads as a pass or a fail");
        ok(GateLines.GateDialog(unbound, "").StartsWith("NOT CHECKED — not bound — Sentinel ▸ Project Setup\n\n"),
           "dialog: an unbound document reads NOT CHECKED — not bound");
        var missing = new GateResult { Outcome = GateOutcome.Fail, ContractLabel = Label, IfcPath = @"C:\gone.ifc" };
        missing.Failures.Add("IFC file not found.");
        ok(GateLines.GateDialog(missing, "north-yard").EndsWith("SHA-256: …") && GateLines.GateDialog(missing, "north-yard").Contains("Schema: not detected"),
           "dialog: a file that was never read (no sha) does not throw");

        // ── 4. Governed Publish's reject dialog names the contract ─────────────────────────────────────────────
        var many = Judged(GateOutcome.Fail, "IFC4", Enumerable.Range(1, 15).Select(i => "failure " + i).ToArray());
        var rej = GateLines.PublishRejected(many);
        ok(rej.StartsWith("✕ REJECTED — delivery gate failed (not published)\n\nContract: " + Label + " · Schema: IFC4\n\nFAILURES:\n• failure 1\n")
           && rej.EndsWith("\n\nFix the deliverable and run Governed Publish again."),
           "reject: names the contract label, the schema and the failures");
        ok(rej.Contains("• failure 12\n… and 3 more\n") && !rej.Contains("failure 13"),
           "reject: 12 failures shown, the rest counted");

        // ── 5. the audit row: the Node intake gate row's shape, passed nullable ────────────────────────────────
        ok(GateLines.AuditAction("a.ifc", pass) == "IFC delivery gate PASS: a.ifc"
           && GateLines.AuditAction("a.ifc", fail) == "IFC delivery gate FAIL: a.ifc"
           && GateLines.AuditAction("a.ifc", none) == "IFC delivery gate NOT CHECKED: a.ifc",
           "audit action: PASS | FAIL | NOT CHECKED");
        ok(string.Join(",", GateLines.AuditValue("a.ifc", pass).Keys) ==
           "file,result,passed,contract,contract_ref,contract_source,contract_sha256,schema,entities,failures,sha256,source",
           "audit value: the intake gate row's fields, in order");
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", pass))))
        {
            var e = j.RootElement;
            ok(e.GetProperty("result").GetString() == "pass" && e.GetProperty("passed").ValueKind == JsonValueKind.True
               && e.GetProperty("contract").GetString() == "pilot-ifc4" && e.GetProperty("contract_ref").GetString() == "contract@1"
               && e.GetProperty("contract_source").GetString() == "office" && e.GetProperty("contract_sha256").GetString() == Sha
               && e.GetProperty("schema").GetString() == "IFC4" && e.GetProperty("entities").GetInt32() == 40
               && e.GetProperty("failures").GetInt32() == 0 && e.GetProperty("source").GetString() == "revit",
               "audit value: PASS carries result, passed true and the contract's ref · source · sha");
        }
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", fail))))
            ok(j.RootElement.GetProperty("result").GetString() == "fail" && j.RootElement.GetProperty("passed").ValueKind == JsonValueKind.False
               && j.RootElement.GetProperty("failures").GetInt32() == 2,
               "audit value: FAIL carries passed false and the failure count");
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", none))))
        {
            var e = j.RootElement;
            ok(e.GetProperty("result").GetString() == "not_checked" && e.GetProperty("passed").ValueKind == JsonValueKind.Null
               && e.GetProperty("contract").ValueKind == JsonValueKind.Null && e.GetProperty("contract_ref").ValueKind == JsonValueKind.Null
               && e.GetProperty("contract_source").ValueKind == JsonValueKind.Null && e.GetProperty("contract_sha256").ValueKind == JsonValueKind.Null
               && e.GetProperty("entities").ValueKind == JsonValueKind.Null && e.GetProperty("failures").GetInt32() == 0
               && e.GetProperty("sha256").GetString() == string.Concat(Enumerable.Repeat("cd", 32)),
               "audit value: NOT CHECKED carries passed null, no contract, no entity count — but the file's sha");
        }
    }
}
