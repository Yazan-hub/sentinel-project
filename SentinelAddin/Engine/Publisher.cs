using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Sentinel.Coordination;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
#endif

namespace Sentinel.Engine;

/// <summary>
/// The one publish path (cohesion phase 5b, spec 2026-09-26 Decision 8): a model leaves Revit for the web only through
/// here — Governed Publish with its dialog, Auto-Publish without one. <see cref="Prepare"/> runs on the API thread
/// (the container's name, the contract, the whole-model export, the gate and its ledger row, the extraction);
/// <see cref="Judge"/> runs OFF it (one /propose that judges, registers the version and stamps it);
/// <see cref="Stage"/> writes the sidecar naming that version FIRST and then moves the IFC into the outbox — a
/// rejected run stages nothing. Everything but Prepare and Judge is Revit-free: tools/publish-check compiles this
/// file under SENTINEL_CHECK.
/// </summary>
public static class Publisher
{
    /// <summary>
    /// The container's name — the same string for the outbox file, the sidecar, <c>container_name</c> and
    /// <c>register.name</c>, so nothing splits a container again (F12). The central model's file name for a workshared
    /// model (the local copy is "&lt;central&gt;_&lt;user&gt;.&lt;suffix&gt;"), else the document's own path, else its
    /// title; ".rvt"/".rte" and a trailing ".ifc" stripped and nothing else ("Tower v2.1" keeps its ".1"); invalid
    /// file-name characters become "_"; blank is "SentinelModel"; + ".ifc". Pure.
    /// </summary>
    public static string ContainerName(string? centralUserVisiblePath, string? pathName, string? title)
    {
        var pick = Given(centralUserVisiblePath) ?? Given(pathName) ?? (title ?? "");
        var name = pick.Substring(Math.Max(pick.LastIndexOf('\\'), pick.LastIndexOf('/')) + 1).Trim();
        name = Strip(Strip(Strip(name, ".rvt"), ".rte"), ".ifc");
        foreach (var ch in Path.GetInvalidFileNameChars()) name = name.Replace(ch, '_');
        return (string.IsNullOrWhiteSpace(name) ? "SentinelModel" : name) + ".ifc";
    }

    private static string? Given(string? s) => string.IsNullOrWhiteSpace(s) ? null : s!.Trim();

    private static string Strip(string name, string ext) =>
        name.Length > ext.Length && name.EndsWith(ext, StringComparison.OrdinalIgnoreCase) ? name.Substring(0, name.Length - ext.Length) : name;

    /// <summary>The lead's policy (spec Decision 2: publish@n's body is exactly {auto: boolean}; none installed = off):
    /// auto runs only when the artefact in force — from the bridge, or its cached copy when the bridge did not answer,
    /// as every other artefact judges — says <c>auto: true</c>. None, <c>auto: false</c> and a body that does not parse
    /// are off; <see cref="PublishLines.Policy"/> says why. Pure.</summary>
    public static bool AutoEnabled(ResolvedArtefact publish) => publish.Origin != "none" && PolicyAuto(publish.BodyJson) == true;

    // The body's `auto`: true / false, or null when the body is not {auto: boolean}.
    internal static bool? PolicyAuto(string? body)
    {
        try
        {
            using var d = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "null" : body!);
            var r = d.RootElement;
            if (r.ValueKind != JsonValueKind.Object || !r.TryGetProperty("auto", out var a)) return null;
            return a.ValueKind switch { JsonValueKind.True => true, JsonValueKind.False => false, _ => (bool?)null };
        }
        catch (JsonException) { return null; }
    }

    /// <summary>
    /// On accepted or recorded with a registered version: the sidecar <c>{project, container, version_id}</c> is
    /// written FIRST, then the IFC moves into the outbox (the watcher attaches the geometry to that version by id, so
    /// it can never register a version of its own or attach to the wrong one); a sidecar that cannot be written moves
    /// nothing. Anything else — rejected, the bridge not reached, a reply with no version — stages nothing and discards
    /// the temp IFC. A move that fails keeps the temp IFC (the dialog names it) and the sidecar (the watcher sweeps .ifc
    /// files only; the next stage of this container overwrites it). Pure over paths; tools/publish-check pins the order.
    /// </summary>
    public static StageResult Stage(PublishPlan plan, PublishOutcome outcome, string outboxDir)
    {
        var r = new StageResult();
        if (!outcome.Publishable || outcome.Version is null)
        {
            r.Reason = !outcome.Reached ? "the bridge returned no verdict"
                     : outcome.Rejected ? "the verdict is rejected"
                     : "the bridge registered no version";
            Discard(plan);
            return r;
        }
        try
        {
            Directory.CreateDirectory(outboxDir);
            var sidecar = Path.Combine(outboxDir, plan.ContainerName + ".meta.json");
            File.WriteAllText(sidecar, JsonSerializer.Serialize(new { project = plan.Key, container = plan.ContainerName, version_id = outcome.Version.Id }));
            r.SidecarPath = sidecar;
            // ponytail: an older IFC of this container still waiting in the outbox is replaced under the new sidecar;
            // the watcher's stabilisation wait and the 15 s throttle keep that from mattering — a per-version file
            // name if it ever does.
            var dst = Path.Combine(outboxDir, plan.ContainerName);
            if (File.Exists(dst)) File.Delete(dst);
            File.Move(plan.TempIfcPath, dst);
            r.OutboxPath = dst;
            r.Staged = true;
            Discard(plan); // the certificate and the folder; the IFC has moved
        }
        catch (Exception e)
        {
            r.Reason = "the IFC did not reach the upload outbox (" + e.Message + ")";
            r.KeptIfcPath = File.Exists(plan.TempIfcPath) ? plan.TempIfcPath : null;
        }
        return r;
    }

    /// <summary>Delete the temp IFC, its certificate and their folder (when empty). Best-effort; never throws.</summary>
    public static void Discard(PublishPlan plan)
    {
        if (string.IsNullOrEmpty(plan.TempIfcPath)) return;
        try { File.Delete(plan.TempIfcPath); } catch { /* best-effort */ }
        try { if (plan.Gate.CertificatePath.Length > 0) File.Delete(plan.Gate.CertificatePath); } catch { /* best-effort */ }
        try
        {
            var dir = Path.GetDirectoryName(plan.TempIfcPath);
            if (dir != null && Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any()) Directory.Delete(dir);
        }
        catch { /* best-effort */ }
    }

#if !SENTINEL_CHECK
    /// <summary>The central model's user-visible path for a workshared document, else null. API thread; never throws.</summary>
    public static string? CentralPath(Document doc)
    {
        try
        {
            return doc.IsWorkshared && doc.GetWorksharingCentralModelPath() is ModelPath mp
                ? ModelPathUtils.ConvertModelPathToUserVisiblePath(mp)
                : null;
        }
        catch { return null; }
    }

    /// <summary>The document's container name (<see cref="ContainerName(string?,string?,string?)"/>). API thread.</summary>
    public static string ContainerName(Document doc) => ContainerName(CentralPath(doc), doc.PathName, doc.Title);

    /// <summary>
    /// Everything the API thread must do before the referee is asked: the key and the name; the contract (off this
    /// thread and waited, ≤ 4 s, so the export uses the schema it asks for — <paramref name="resolve"/> is the
    /// project's artefact reader, <c>(kind, timeout) → ResolvedArtefact</c>, asked for "contract"; null means
    /// <see cref="DeliveryContract.Load"/>); the WHOLE model exported (no view filter; the export's transaction rolled
    /// back — <see cref="PlatformExporter.ExportToDir"/>) into a folder of its own under <paramref name="tempDir"/> in <c>contract.IfcSchema ?? "IFC2X3"</c>; the gate and
    /// its ledger row (waited, ≤ 6 s, so the row lands before /propose) — posted to <c>/cde/:key/delivery-gate</c> with
    /// <paramref name="source"/> ("revit" from Governed Publish, "auto-publish" from Auto-Publish) and publish true, so
    /// the bridge holds a FAIL on the web and <see cref="PublishPlan.GateRow"/>'s <see cref="LedgerResult.Hold"/> names
    /// that hold row; the elements read for the referee. An unbound
    /// document, a failed export, a gate FAIL or a throw after the export leaves <see cref="PublishPlan.Ready"/> false with the temp IFC
    /// discarded: <see cref="PublishLines.Dialog(PublishPlan,PublishOutcome?,StageResult?)"/> says which. Revit API
    /// only here; the plan carries no Revit object.
    /// </summary>
    public static PublishPlan Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact>? resolve = null, string source = "revit")
    {
        var ctx = ProjectContext.For(doc);
        var plan = new PublishPlan { Key = ctx.Key, ContainerName = ContainerName(doc) };
        if (!ctx.IsBound) { plan.Refusal = ProjectContext.NotBound + "\n\nNothing was exported or published."; return plan; }
        var key = plan.Key;

        // 0) The delivery contract in force (project → office → none), resolved OFF this thread and waited, as
        //    Governed Publish did: the export below uses the schema it asks for.
        var (contract, contractSource) = Task.Run(() => resolve is null ? DeliveryContract.Load(key) : DeliveryContract.FromResolved(resolve("contract", null))).GetAwaiter().GetResult();
        plan.Contract = contract;
        plan.ContractSource = contractSource;

        // 1) The whole model, to a temp folder of this plan's own (two runs never share a file), NOT the outbox: only
        //    a judged, registered version reaches the outbox (Stage).
        var dir = Path.Combine(tempDir, Guid.NewGuid().ToString("N"));
        var (state, path, _, error) = PlatformExporter.ExportToDir(doc, dir, plan.ContainerName, contract?.IfcSchema ?? "IFC2X3");
        plan.TempIfcPath = path;
        if (state != PlatformExporter.State.Ok)
        {
            plan.Refusal = state == PlatformExporter.State.MissingOrEmpty
                ? "IFC export contained no geometry — nothing to publish. Check the model's IFC mappings (Export to IFC As)."
                : "IFC export failed: " + (error ?? state.ToString());
            Discard(plan);
            return plan;
        }

        // 2) The IFC Delivery Gate (contract@n above; none → NOT CHECKED, and the IDS still judges), and its row on the
        //    ledger, waited OFF this thread so it lands before /propose. A FAIL stops here; every line names it.
        //    From here the temp IFC exists: a throw (the gate's file I/O, the gate row's task, the extraction) is a
        //    refusal that discards it, so nothing lingers under %TEMP% unnamed — on either caller's path.
        try
        {
            plan.Gate = IfcDeliveryGate.Validate(path, contract, contractSource);
            plan.SizeBytes = plan.Gate.FileSizeBytes;
            plan.Sha256 = plan.Gate.FileSha256;
            var gate = plan.Gate;
            var name = plan.ContainerName;
            plan.GateRow = Task.Run(() => GovernedNotify.DeliveryGate(name, gate, key, source, publish: true)).GetAwaiter().GetResult();
            if (plan.GateFailed) { Discard(plan); return plan; }

            // 3) The elements the referee judges, read-only from the live model. Without an office code the Pset_<org>.*
            //    rows are dropped from the read table (PsetMap) and the referee reports them missing: the plan says so.
            if (string.IsNullOrWhiteSpace(App.OrgFor(doc)))
                plan.OrgWarning = "This document's ruleset (" + (App.Engine?.SourceFor(doc).Label ?? "none") + ") has no \"org\" code — " +
                    "office property sets (Pset_<org>.*) were NOT read for this publish; the referee will report them " +
                    "missing. Install a ruleset@n with an \"org\" on " + key + " or its office, then retry.";
            plan.Elements = GovernedElementExtractor.Extract(doc, key);
            return plan;
        }
        catch (Exception e)
        {
            Discard(plan);
            plan.Refusal = "the publish stopped before the referee: " + e.Message;
            return plan;
        }
    }

    /// <summary>
    /// The one referee call, OFF the API thread (the plan holds no Revit object): <c>POST /cde/:key/propose</c> with
    /// the elements, <c>container_name</c>, <c>register {name, size_bytes, sha256}</c> and <c>gate_row_id</c> (the gate
    /// row's ledger id, when it was recorded) — the bridge judges by the project's ids@n and naming@n, writes one
    /// proposal row naming the file and its gate row, and on accepted or recorded registers the version (wip, no
    /// geometry) and stamps the verdict on it; a rejected verdict registers nothing and, judged by installed standards,
    /// is held on the web (<see cref="PublishOutcome.HoldRow"/>). Blocking (120 s cap); never throws — an unreached
    /// bridge is <see cref="PublishOutcome.Reached"/> false. <paramref name="source"/> is the proposal row's "from":
    /// "Governed Publish", or "Auto-Publish" (the bridge's hold names them revit and auto-publish).
    /// </summary>
    public static PublishOutcome Judge(PublishPlan plan, string source = "Governed Publish") =>
        PublishOutcome.From(GovernedNotify.Propose(plan.Elements, versionId: null, actor: "Revit", projectKey: plan.Key,
            containerName: plan.ContainerName, source: source,
            register: new RegisterRequest { Name = plan.ContainerName, SizeBytes = plan.SizeBytes, Sha256 = plan.Sha256 },
            gateRowId: plan.GateRow.Id));
#endif
}

/// <summary>What <see cref="Publisher.Prepare"/> gathered on the API thread — strings, the exported file, the gate
/// and the elements; never a Revit object, so <see cref="Publisher.Judge"/> can run on a pool thread.</summary>
public sealed class PublishPlan
{
    public string Key = "";
    public string ContainerName = "";
    public string TempIfcPath = "";
    public long SizeBytes;
    public string Sha256 = "";
    /// <summary>Why nothing was judged: not bound, the export produced nothing, or the gate or the extraction threw (the temp IFC discarded). Null otherwise — a gate FAIL is <see cref="GateFailed"/>, not a refusal.</summary>
    public string? Refusal;
    /// <summary>The org-less ruleset note (Pset_&lt;org&gt; rows not read), for the dialog; null when the org is set.</summary>
    public string? OrgWarning;
    public DeliveryContract? Contract;
    public ResolvedArtefact ContractSource = ArtefactClient.None("contract", "not loaded");
    public IfcDeliveryGate.GateResult Gate = new IfcDeliveryGate.GateResult();
    /// <summary>The gate row as the bridge answered; on a FAIL its <see cref="LedgerResult.Hold"/> is the hold:gate row.</summary>
    public LedgerResult GateRow = LedgerResult.NotRecorded("the gate did not run");
    public IReadOnlyList<GovElement> Elements = Array.Empty<GovElement>();
    /// <summary>The gate judged and failed (a NOT CHECKED gate is not a fail).</summary>
    public bool GateFailed => Refusal is null && Gate.Outcome == GateOutcome.Fail;
    /// <summary>The export landed and the gate did not fail: the referee may be asked.</summary>
    public bool Ready => Refusal is null && !GateFailed;
}

/// <summary>What one /propose came to, from the bridge's answer alone (<see cref="From"/>). Not reached: nothing
/// registered, no row confirmed. Rejected: one proposal row, nothing registered. Accepted or recorded: the version the
/// bridge registered and stamped — or none, when it answered without one.</summary>
public sealed class PublishOutcome
{
    public ProposalResult Verdict = new ProposalResult();
    public bool Reached => Verdict.Reached;
    public bool Accepted => Reached && Verdict.Verdict == "accepted";
    public bool Rejected => Reached && Verdict.Verdict == "rejected";
    /// <summary>Accepted or recorded: the bridge registers a version (spec Decision 3).</summary>
    public bool Publishable => Reached && !Rejected;
    public ProposalResult.VersionInfo? Version => Reached ? Verdict.Version : null;
    /// <summary>The proposal row as the bridge handed it back: audit_id and receipt.ledger_hash.</summary>
    public LedgerResult VerdictRow => LedgerResult.FromReceipt(Verdict.AuditId, Verdict.ReceiptHash);
    /// <summary>The verdict:&lt;v&gt; row the bridge stamped on the registered version: verdict_audit_id and
    /// verdict_hash. Not confirmed when either is missing (a bridge before 5b answers no verdict_hash).</summary>
    public LedgerResult StampRow => LedgerResult.FromReceipt(Verdict.VerdictAuditId, Verdict.VerdictHash);
    /// <summary>The hold:&lt;stage&gt; row the bridge wrote for a refused registration (the reply's hold {id, hash});
    /// null when it returned none; not confirmed when the hold came back without its id or hash.</summary>
    public LedgerResult? HoldRow => Reached && Verdict.Held ? LedgerResult.FromReceipt(Verdict.HoldId, Verdict.HoldHash) : null;
    public static PublishOutcome From(ProposalResult r) => new PublishOutcome { Verdict = r };
}

/// <summary>What <see cref="Publisher.Stage"/> did. <see cref="Staged"/> only when the sidecar was written and the IFC
/// is in the outbox; otherwise <see cref="Reason"/> says why nothing waits for upload.</summary>
public sealed class StageResult
{
    public bool Staged;
    public string? OutboxPath;
    public string? SidecarPath;
    public string Reason = "";
    /// <summary>The temp IFC, when a failed move kept it (the version is registered; the geometry is not queued).</summary>
    public string? KeptIfcPath;
}

/// <summary>The words Governed Publish (a dialog) and Auto-Publish (one Doctor line) print, and the pane's policy line,
/// from the plan, the outcome and the stage alone — so tools/publish-check pins them. Every line names what judged (the
/// existing <see cref="GateLines"/> and <see cref="LedgerLine"/> words, the IDS and naming labels from the bridge's
/// answer); the version is claimed only from the reply; "receipt" appears only with a hash the bridge returned (the
/// proposal row's receipt.ledger_hash, the stamp row's verdict_hash, a hold row's hash); "Held on the web" only when
/// the bridge returned the hold row it wrote. Pure.</summary>
public static class PublishLines
{
    public static string GateRow(PublishPlan p) => "Gate row: " + LedgerLine.For(p.GateRow);
    public static string VerdictRow(PublishOutcome o) => "Verdict row: " + LedgerLine.For(o.VerdictRow);

    /// <summary>"Held on the web: Project Files ▸ On hold · ledger #815 · receipt 7a8b9c0d1e2f3041…" (spec 2026-09-27
    /// Decision 9) — printed only when the bridge returned the hold row it wrote for this refusal (the /propose reply's
    /// hold, or the delivery-gate route's for a gate FAIL); the ledger words are <see cref="LedgerLine"/>'s.</summary>
    public static string Held(LedgerResult hold) => "Held on the web: Project Files ▸ On hold · " + LedgerLine.For(hold);

    /// <summary>"Version: &lt;container&gt; v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5…" from the reply — the
    /// stamp row through <see cref="LedgerLine"/>, so "… · wip · not confirmed — the bridge returned no chain hash"
    /// when verdict_audit_id or verdict_hash is missing; with no version "Version: not confirmed — &lt;reason&gt;".</summary>
    public static string Version(PublishPlan p, PublishOutcome o)
    {
        var v = o.Version;
        if (v is null) return "Version: not confirmed — " + NoVersion(o);
        return "Version: " + p.ContainerName + " " + v.Revision + " · " + v.State + " · " + LedgerLine.For(o.StampRow);
    }

    private static string NoVersion(PublishOutcome o) =>
        !o.Reached ? "the bridge returned no verdict" + (o.Verdict.Error is { Length: > 0 } e ? " (" + e + ")" : "")
        : o.Rejected ? "rejected — nothing was registered"
        : "the bridge registered no version";

    /// <summary>The IDS line, from the bridge's answer: what judged and what it found, or that nothing was judged.</summary>
    public static string Ids(PublishPlan p, PublishOutcome o)
    {
        var v = o.Verdict;
        if (v.IdsRef is null) return "IDS: none — no IDS installed for " + p.Key + " or its office. The model was NOT judged.";
        if (v.Downgraded is not null) return "IDS " + v.IdsLabel + ": nothing in its scope — 0 in-scope element checks, so nothing was judged.";
        return "IDS " + v.IdsLabel + ": " + v.Passing + "/" + v.InScope + " in-scope element checks passed" +
               (v.Warned ? " — " + v.Failing + " failure(s) kept as warnings (enforce: " + (v.IdsEnforce ?? "not reported") + ")." : ".");
    }

    public static string Naming(PublishOutcome o) =>
        o.Verdict.NamingRef is null
            ? "Naming: not judged — no naming standard installed."
            : "Naming " + o.Verdict.NamingLabel + ": " + (o.Verdict.NamingOk == false ? "failed (warn — recorded, not blocking)." : "passed.");

    /// <summary>The pane's fourth line and the Doctor's, from the publish@n in force: "Auto-publish: on · publish@1 ·
    /// office · 3f07a1b2c3d4…" (the label, "(cached HH:mm)" included when the cache answered), "Auto-publish: off —
    /// publish: none — not installed for &lt;key&gt; or its office" (any none, with its reason), "Auto-publish: off —
    /// &lt;label&gt;" (auto: false), or "… did not parse: …".</summary>
    public static string Policy(ResolvedArtefact publish)
    {
        if (publish.Origin == "none") return "Auto-publish: off — publish: " + publish.Label;
        return Publisher.PolicyAuto(publish.BodyJson) switch
        {
            true => "Auto-publish: on · " + publish.Label,
            false => "Auto-publish: off — " + publish.Label,
            _ => "Auto-publish: off — " + publish.Label + " did not parse: the body is not {auto: true} or {auto: false}",
        };
    }

    /// <summary>Governed Publish's one dialog. With no outcome (the plan was refused before the referee): the refusal
    /// — not bound, an export that produced nothing, or the gate FAILED (<see cref="GateLines.PublishRejected"/> and the
    /// gate row); "" for a ready plan. With an outcome: the bridge not reached, rejected, or accepted / recorded with
    /// the version and where the IFC is.</summary>
    public static string Dialog(PublishPlan p, PublishOutcome? o = null, StageResult? s = null)
    {
        if (o is null || s is null)
            return p.Refusal is not null ? p.Refusal
                 : p.GateFailed ? GateLines.PublishRejected(p.Gate) + "\n\n" + GateRow(p) + (p.GateRow.Hold is { } gateHold ? "\n" + Held(gateHold) : "")
                 : "";
        var gateLine = GateLines.PublishLine(p.Gate, p.Key);
        if (!o.Reached)
            return gateLine + "\n" + GateRow(p) + "\n\n" +
                   "The Sentinel bridge did not return a verdict — nothing was registered or uploaded, and no verdict row is confirmed.\n\n" +
                   (o.Verdict.Error is { Length: > 0 } ? "Reason: " + o.Verdict.Error + "\n\n" : "") +
                   "Start the bridge (npm run bcf:serve) and run Governed Publish again.";
        var v = o.Verdict;
        if (o.Rejected)
        {
            var nameFailed = v.NamingOk == false;
            return (nameFailed
                       ? "✕ REJECTED — model name does not follow the ISO 19650 convention (not published)\n\nName checked: " + p.ContainerName + "\n\n"
                       : "✕ REJECTED — " + v.Failing + " of " + v.InScope + " in-scope element check(s) failed (not published)\n\n") +
                   gateLine + "\n" + GateRow(p) + "\n" + VerdictRow(o) + "\n" +
                   "No version was registered and nothing was uploaded.\n" +
                   (o.HoldRow is { } hold ? Held(hold) + "\n" : "") + "\n" +
                   (nameFailed ? "NAMING:\n• " + string.Join("\n• ", v.NamingFailures) + "\n\n" : "") +
                   (v.Failures.Count > 0 ? "FAILURES:\n• " + string.Join("\n• ", v.Failures) + "\n\n" : "") +
                   (v.BcfRaised > 0
                       ? v.BcfRaised + " BCF issue(s) opened on the failing elements — they're now in the web Issues panel and will live-sync into Revit. Fix them and run Governed Publish again."
                       : nameFailed
                           ? "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again."
                           : "Fix the failures and run Governed Publish again.");
        }
        // accepted, or recorded (no IDS, or nothing in its scope): registered, and in the outbox when Stage landed it
        var status = s.Staged && o.Version is { } sv ? "published as " + sv.Revision + " · " + sv.State
                   : o.Version is { } rv ? rv.Revision + " · " + rv.State + " registered, NOT in the upload outbox"
                   : "no version registered";
        var head = o.Accepted
            ? "✓ ACCEPTED — " + status
            : (s.Staged ? "Published" : "Recorded") + " — not judged: " + NotJudged(p, o);
        var upload = s.Staged ? "Queued for upload — the outbox watcher attaches the geometry to this version."
                   : o.Version is null ? "Nothing was uploaded: there is no version to attach the geometry to — run Governed Publish again."
                   : "NOT in the upload outbox — " + s.Reason + "." + (s.KeptIfcPath is null ? " The export is gone — run Governed Publish again." : " The IFC is kept at " + s.KeptIfcPath + " — run Governed Publish again.");
        return head + "\n" +
               "Project: " + p.Key + "\n\n" +
               Ids(p, o) + "\n" +
               Naming(o) + "\n" +
               gateLine + "\n" +
               (o.Accepted && p.Gate.Outcome == GateOutcome.NotChecked ? GateLines.JudgedAlone(p.Gate) + "\n" : "") +
               "SHA-256: " + p.Sha256.Substring(0, Math.Min(16, p.Sha256.Length)) + "…\n" +
               GateRow(p) + "\n" +
               VerdictRow(o) + "\n" +
               Version(p, o) + "\n\n" +
               upload +
               (o.Accepted ? "" : "\nNo verdict badge: " + (v.Downgraded is null ? "nothing was judged" : "the IDS found nothing in its scope, so nothing was judged") +
                   " — the verdict is \"recorded\", and publishing this version on the web needs the lead's reason. " +
                   (v.Downgraded is null ? "Install an IDS on the project or its office to judge the next one." : "Give the IDS something in its scope, or install one that covers this model, to judge the next one."));
    }

    private static string NotJudged(PublishPlan p, PublishOutcome o) =>
        o.Verdict.IdsRef is null ? "no IDS installed for " + p.Key + " or its office" : "nothing in the IDS's scope (" + o.Verdict.IdsLabel + ")";

    /// <summary>Auto-Publish's one Doctor line for the same outcomes: <paramref name="o"/> and <paramref name="s"/> are
    /// null when the plan was refused before the referee (not bound, no export, gate FAIL) or the judge never answered.</summary>
    public static string Doctor(PublishPlan p, PublishOutcome? o = null, StageResult? s = null)
    {
        if (p.Refusal is not null) return "Auto-publish failed — nothing uploaded — " + p.Refusal.Replace("\n", " ").Replace("  ", " ");
        if (p.GateFailed) return "Auto-publish rejected — nothing uploaded — delivery gate " + GateLines.Verdict(p.Gate, p.Key) + " · " + p.Gate.Failures.Count + " failure(s) · gate row: " + LedgerLine.For(p.GateRow) +
                                 (p.GateRow.Hold is { } gateHold ? " · " + Held(gateHold) : "");
        if (o is null || s is null) return "Auto-publish: no verdict — the publish stopped before the referee answered — nothing uploaded";
        var v = o.Verdict;
        if (!o.Reached) return "Auto-publish: no verdict — nothing uploaded — " + (v.Error is { Length: > 0 } ? v.Error : "the bridge returned no verdict");
        if (o.Rejected)
            return "Auto-publish rejected — nothing uploaded — " +
                   (v.NamingOk == false ? "the model name " + p.ContainerName + " failed naming " + v.NamingLabel : v.Failing + " of " + v.InScope + " element check(s) failed · " + v.IdsLabel) +
                   " · " + LedgerLine.For(o.VerdictRow) + (o.HoldRow is { } hold ? " · " + Held(hold) : "");
        if (o.Version is null) return "Auto-publish: verdict " + v.Verdict + " but the bridge registered no version — nothing uploaded · " + LedgerLine.For(o.VerdictRow);
        var ver = o.Version;
        if (!s.Staged) return "Auto-publish: " + p.ContainerName + " " + ver.Revision + " · " + ver.State + " registered but NOT in the upload outbox — " + s.Reason + (s.KeptIfcPath is null ? "" : " — the IFC is kept at " + s.KeptIfcPath);
        return "Auto-published " + p.ContainerName + " " + ver.Revision + " · " + ver.State + " · " + LedgerLine.For(o.StampRow) +
               (o.Accepted ? "" : " — not judged: " + NotJudged(p, o));
    }
}
