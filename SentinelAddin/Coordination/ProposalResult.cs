using System;
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
    // What judged — the bridge resolves the project's ids@n / naming@n (else its office's) itself. Null ref = none.
    public string? IdsRef, IdsSource, IdsSha256;
    public string? IdsEnforce;                      // reject | warn | off (the IDS's own enforce), null = not reported
    public bool Warned;                             // accepted, with failures kept as warnings (enforce "warn")
    public string? NamingRef, NamingSource, NamingSha256;
    // The version /propose registered and stamped when `register` was sent (cohesion phase 5a, spec Decision 3): null
    // on a rejected verdict, without `register`, or when the bridge answered without one. VerdictAuditId and
    // VerdictHash are the verdict:<v> row's id and chain hash (verdict_hash, answered by the 5b bridge; an older one
    // answers no hash and the stamp then reads not confirmed); Downgraded is "nothing in scope" when an accepted
    // verdict with in_scope 0 was recorded instead.
    public VersionInfo? Version;
    public string? VerdictAuditId;
    public string? VerdictHash;
    public string? Downgraded;
    // The hold:<stage> row the bridge wrote for this refusal (spec 2026-09-27 Decision 4): the reply's hold {id, hash}.
    // Held is false when the reply's hold is null or absent — a refusal the bridge does not hold (no register, a client
    // standard, a caller who could not register) or a bridge before 6a; HoldId / HoldHash stay null when it omits them.
    public bool Held;
    public string? HoldId, HoldHash;
    /// "ids@4 · office · 23bb57937fb0…" or "none" — the bridge's refLabel, as every other surface prints it.
    public string IdsLabel => RefLabel(IdsRef, IdsSource, IdsSha256);
    public string NamingLabel => RefLabel(NamingRef, NamingSource, NamingSha256);

    /// <summary>The reply's <c>version {id, container_id, revision, state}</c>.</summary>
    public sealed class VersionInfo
    {
        public string Id = "";
        public string? ContainerId;
        public string Revision = "";
        public string State = "";
    }

    /// <summary>The /propose body, as <c>GovernedNotify.Propose</c> serializes it. Pure, so tools/publish-check pins
    /// the wire shape: <paramref name="register"/> goes as <c>{name, size_bytes, sha256}</c> (the bridge requires
    /// name = container_name) and only when given; <paramref name="gateRowId"/> as <c>gate_row_id</c> only when it is a
    /// ledger id (the Publisher's recorded gate row, phase 6a); every other key as before.</summary>
    public static Dictionary<string, object?> RequestBody(object elements, string? versionId, string actor, string? containerName,
                                                          string? source, string? note, bool raiseBcf, string? failuresRequirement,
                                                          RegisterRequest? register, long? gateRowId = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["source"] = source ?? "Governed Publish",
            ["actor"] = actor,
            ["elements"] = elements,
        };
        if (versionId != null) body["version_id"] = versionId;
        if (containerName != null) body["container_name"] = containerName; // ISO 19650 naming gate
        if (note != null) body["note"] = note;
        if (!raiseBcf) body["raise_bcf"] = false;
        // One requirement's failures only (fix-in-place): the bridge then returns up to 1000 of them
        // plus failures_total / failures_matched, so truncation is detected by count, not guessed.
        if (!string.IsNullOrWhiteSpace(failuresRequirement)) body["failures_requirement"] = failuresRequirement;
        if (register != null)
            body["register"] = new Dictionary<string, object?> { ["name"] = register.Name, ["size_bytes"] = register.SizeBytes, ["sha256"] = register.Sha256 };
        if (gateRowId is > 0) body["gate_row_id"] = gateRowId.Value;
        return body;
    }

    public static ProposalResult Parse(string json)
    {
        var r = new ProposalResult();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        r.Reached = true;
        r.Verdict = Str(root, "verdict") ?? "recorded";
        r.Downgraded = Str(root, "downgraded");
        if (root.TryGetProperty("version", out var ver) && ver.ValueKind == JsonValueKind.Object && Str(ver, "id") is { Length: > 0 } vid)
            r.Version = new VersionInfo { Id = vid, ContainerId = Str(ver, "container_id"), Revision = Str(ver, "revision") ?? "", State = Str(ver, "state") ?? "" };
        r.VerdictAuditId = Scalar(root, "verdict_audit_id");
        r.VerdictHash = Str(root, "verdict_hash");
        if (root.TryGetProperty("hold", out var hd) && hd.ValueKind == JsonValueKind.Object) { r.Held = true; r.HoldId = Scalar(hd, "id"); r.HoldHash = Str(hd, "hash"); }
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
        r.IdsRef = Str(root, "ids_ref");
        r.IdsSource = Str(root, "ids_source");
        r.IdsSha256 = Str(root, "ids_sha256");
        r.IdsEnforce = Str(root, "ids_enforce");
        r.Warned = root.TryGetProperty("warned", out var w) && w.ValueKind == JsonValueKind.True;
        r.NamingRef = Str(root, "naming_ref");
        r.NamingSource = Str(root, "naming_source");
        r.NamingSha256 = Str(root, "naming_sha256");
        return r;
    }

    // The bridge's refLabel (artefact-store.mjs): ref · source · first 12 of the sha + "…", or "none".
    private static string RefLabel(string? @ref, string? source, string? sha)
    {
        var parts = new List<string>();
        if (!string.IsNullOrEmpty(@ref)) parts.Add(@ref!);
        if (!string.IsNullOrEmpty(source)) parts.Add(source!);
        if (!string.IsNullOrEmpty(sha)) parts.Add(sha!.Substring(0, Math.Min(12, sha.Length)) + "…");
        return parts.Count == 0 ? "none" : string.Join(" · ", parts);
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

/// <summary>What /propose registers on an accepted or recorded verdict (spec 2026-09-26 Decision 3): the container the
/// naming standard judged (the bridge refuses a name other than container_name) and the bytes the gate certified.</summary>
public sealed class RegisterRequest
{
    public string Name = "";
    public long SizeBytes;
    public string Sha256 = "";
}
