using System.Collections.Generic;
using System.Text.Json;

namespace Sentinel.Coordination;

/// <summary>
/// The parsed verdict of <c>POST /cde/:key/propose</c>. <see cref="Parse"/> is Revit-free and checked;
/// <c>GovernedNotify.Propose</c> only transports. A missing field stays at its default, and every default
/// reads as "recorded / nothing certified" — never as a pass.
/// </summary>
public sealed class ProposalResult
{
    public bool Reached;                            // false ⇒ bridge/CDE unreachable (caller falls back)
    public string Verdict = "recorded";             // accepted | rejected | recorded (no IDS)
    public int InScope, Passing, Failing;
    public int BcfRaised;                           // issues auto-opened on a reject (bridge G2)
    public List<string> Failures = new();           // "<requirement>: <reason>", capped at 12 for dialogs
    public List<ElementFailure> ElementFailures = new(); // every failure the bridge returned, per element
    public int FailuresTotal = -1;                  // bridge `failures_total` (all requirements, before slicing); −1 = not reported
    public int FailuresMatched = -1;                // bridge `failures_matched` (after the requirement filter, before slicing); −1 = not reported
    public string? AuditId;                         // the proposal's audit row
    public string? ReceiptHash;                     // receipt.ledger_hash — the row's own chain hash
    public string? Error;                           // why Reached is false (timeout / refused / status)
    public bool? NamingOk;                          // null = name not checked; false = container name failed
    public List<string> NamingFailures = new();

    public static ProposalResult Parse(string json)
    {
        var r = new ProposalResult();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        r.Reached = true;
        r.Verdict = Str(root, "verdict") ?? "recorded";
        if (root.TryGetProperty("summary", out var s) && s.ValueKind == JsonValueKind.Object)
        {
            if (s.TryGetProperty("in_scope", out var i) && i.TryGetInt32(out var iv)) r.InScope = iv;
            if (s.TryGetProperty("passing", out var p) && p.TryGetInt32(out var pv)) r.Passing = pv;
            if (s.TryGetProperty("failing", out var f) && f.TryGetInt32(out var fv)) r.Failing = fv;
        }
        if (root.TryGetProperty("bcf", out var b) && b.ValueKind == JsonValueKind.Object
            && b.TryGetProperty("raised", out var br) && br.TryGetInt32(out var brv)) r.BcfRaised = brv;
        if (root.TryGetProperty("failures", out var fl) && fl.ValueKind == JsonValueKind.Array)
        {
            foreach (var it in fl.EnumerateArray())
            {
                var req = Str(it, "requirement") ?? "requirement";
                var reason = Str(it, "reason") ?? "failed";
                r.ElementFailures.Add(new ElementFailure { Element = Scalar(it, "element") ?? "", Requirement = req, Reason = reason });
                if (r.Failures.Count < 12) r.Failures.Add(req + ": " + reason);
            }
        }
        if (root.TryGetProperty("failures_total", out var ft) && ft.TryGetInt32(out var ftv)) r.FailuresTotal = ftv;
        if (root.TryGetProperty("failures_matched", out var fm) && fm.TryGetInt32(out var fmv)) r.FailuresMatched = fmv;
        r.AuditId = Scalar(root, "audit_id");
        if (root.TryGetProperty("receipt", out var rc) && rc.ValueKind == JsonValueKind.Object) r.ReceiptHash = Str(rc, "ledger_hash");
        if (root.TryGetProperty("naming", out var nm) && nm.ValueKind == JsonValueKind.Object)
        {
            r.NamingOk = nm.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True;
            if (nm.TryGetProperty("failures", out var nf) && nf.ValueKind == JsonValueKind.Array)
                foreach (var it in nf.EnumerateArray())
                {
                    if (r.NamingFailures.Count >= 12) break;
                    r.NamingFailures.Add(Str(it, "reason") ?? "invalid");
                }
        }
        return r;
    }

    private static string? Str(JsonElement o, string name) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    // A string or a number, as text (audit ids and element ids arrive as either).
    private static string? Scalar(JsonElement o, string name)
    {
        if (o.ValueKind != JsonValueKind.Object || !o.TryGetProperty(name, out var p)) return null;
        return p.ValueKind switch { JsonValueKind.String => p.GetString(), JsonValueKind.Number => p.GetRawText(), _ => null };
    }
}
