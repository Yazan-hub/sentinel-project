using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using static Sentinel.Engine.IfcDeliveryGate;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static void Is(string got, string want, string n)
    {
        Ok(got == want, n);
        if (got != want) Console.WriteLine("        got:  " + got.Replace("\n", "\\n") + "\n        want: " + want.Replace("\n", "\\n"));
    }

    const string FileSha = "3f9a0c1d2e4b5f60718293a4b5c6d7e8f90112233445566778899aabbccddeef"; // the IFC the gate certified
    const string RowHash = "0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff0"; // the proposal row's chain hash
    const string GateHash = "5c6d7e8f90112233445566778899aabbccddeeff00112233445566778899aabb"; // the gate row's chain hash
    const string StampHash = "6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d"; // the verdict:<v> row's (verdict_hash)
    const string CSha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";    // contract@1's sha
    const string ISha = "23bb57937fb0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aa";    // ids@4's sha
    const string NSha = "77e1d2c3b4a5968778695a4b3c2d1e0f0f1e2d3c4b5a69788796a5b4c3d2e1f0";    // naming@2's sha
    const string PSha = "3f07a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddee";    // publish@1's sha
    const string Vid = "9d2c6e1a-5b3f-4c7d-8e9f-0a1b2c3d4e5f";
    const string Cid = "1d2c6e1a-5b3f-4c7d-8e9f-0a1b2c3d4e5f";
    const string Container = "AST_ASTR26_Aster Tower.ifc";
    const string Key = "aster-tower";

    // What /propose answers the Publisher (cde-store.mjs adjudicateProposal, 5a + Task 4's verdict_hash): accepted,
    // registered as v1 wip, stamped as row 814 (its hash in verdict_hash); the receipt is the proposal row's (813).
    const string Accepted = "{\"verdict\":\"accepted\",\"downgraded\":null,\"summary\":{\"in_scope\":40,\"passing\":40,\"failing\":0},\"failures\":[]," +
        "\"naming\":{\"ok\":true,\"failures\":[],\"enforce\":\"reject\"},\"naming_ref\":\"naming@2\",\"naming_source\":\"office\",\"naming_sha256\":\"" + NSha + "\"," +
        "\"warned\":false,\"ids_enforce\":\"reject\",\"ids_source\":\"office\",\"ids_ref\":\"ids@4\",\"ids_sha256\":\"" + ISha + "\",\"client_ids_ignored\":false," +
        "\"audit_id\":813,\"recorded_at\":\"2026-09-26T10:00:01+00:00\"," +
        "\"version\":{\"id\":\"" + Vid + "\",\"container_id\":\"" + Cid + "\",\"revision\":\"v1\",\"state\":\"wip\"},\"verdict_audit_id\":814,\"verdict_hash\":\"" + StampHash + "\",\"agent\":null," +
        "\"receipt\":{\"version\":\"sentinel-receipt/1\",\"audit_id\":813,\"ledger_hash\":\"" + RowHash + "\",\"prev_hash\":\"" + GateHash + "\"}}";
    const string VersionJson = "\"version\":{\"id\":\"" + Vid + "\",\"container_id\":\"" + Cid + "\",\"revision\":\"v1\",\"state\":\"wip\"},\"verdict_audit_id\":814,\"verdict_hash\":\"" + StampHash + "\"";

    static string Reply(string verdict, string? downgraded = null, int inScope = 40, int passing = 40, int failing = 0, bool version = true) =>
        Accepted.Replace("\"verdict\":\"accepted\",\"downgraded\":null", "\"verdict\":\"" + verdict + "\",\"downgraded\":" + (downgraded is null ? "null" : "\"" + downgraded + "\""))
                .Replace("\"in_scope\":40,\"passing\":40,\"failing\":0", "\"in_scope\":" + inScope + ",\"passing\":" + passing + ",\"failing\":" + failing)
                .Replace(VersionJson, version ? VersionJson : "\"version\":null,\"verdict_audit_id\":null,\"verdict_hash\":null");

    static int Main()
    {
        Console.WriteLine("Publisher — one publish path: the container's name, the /propose register and reply, the outbox order, the lines, the policy\n");
        Names();
        Wire();
        Outcomes();
        Staging();
        Lines();
        Policy();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. ContainerName: the central file's name, the same string everywhere (F12) ──────────────────────
    static void Names()
    {
        const string Central = @"C:\Projects\Aster\AST_ASTR26_Aster Tower.rvt";
        const string Local = @"C:\Users\yazan\Documents\AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt";
        const string LocalTitle = "AST_ASTR26_Aster Tower_yazan.hKNTHU";
        Is(Publisher.ContainerName(Central, Local, LocalTitle), Container, "a workshared model is named from its central file — the local's _yazan.hKNTHU is gone (F12)");
        Is(Publisher.ContainerName("BIM 360://Aster/Models/AST_ASTR26_Aster Tower.rvt", Local, LocalTitle), Container, "a cloud central path names it the same");
        Is(Publisher.ContainerName(null, Local, LocalTitle), "AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc", "no central: the document's own file name, .rvt stripped and nothing else");
        Is(Publisher.ContainerName("  ", "", LocalTitle), "AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc", "no central, no path: the title as it is (never GetFileNameWithoutExtension's '…_yazan')");
        Is(Publisher.ContainerName(null, "", "Villa.rvt"), "Villa.ifc", "a title carrying .rvt (Explorer shows extensions) is stripped");
        Is(Publisher.ContainerName(null, "", "Villa.RVT"), "Villa.ifc", "…case-insensitively");
        Is(Publisher.ContainerName(null, @"C:\t\Office Template.rte", "Office Template"), "Office Template.ifc", ".rte is stripped");
        Is(Publisher.ContainerName(null, @"C:\m\Tower v2.1.rvt", "Tower v2.1"), "Tower v2.1.ifc", "a dotted name keeps its dot: only .rvt, .rte and .ifc are extensions");
        Is(Publisher.ContainerName(null, "", "Model.ifc"), "Model.ifc", "a trailing .ifc is not doubled");
        Is(Publisher.ContainerName(null, @"C:\x\Model.ifc.rvt", "Model.ifc"), "Model.ifc", "a model opened from an IFC (Model.ifc.rvt) is Model.ifc");
        Is(Publisher.ContainerName(null, "/srv/models/Bridge.rvt", "Bridge"), "Bridge.ifc", "a forward-slash path splits too");
        Is(Publisher.ContainerName(Central, "", ""), Container, "the central wins with no path and no title");
        Is(Publisher.ContainerName(null, "", "A:B*C?"), "A_B_C_.ifc", "invalid file-name characters become _ (the SafeName Governed Publish used)");
        Is(Publisher.ContainerName(null, "", "   "), "SentinelModel.ifc", "a blank name is SentinelModel");
        Is(Publisher.ContainerName(null, "", ".rvt"), ".rvt.ifc", "a name that is only an extension is kept (nothing else to name it by)");
    }

    // ── 2. the wire: register in the /propose body; the reply's version, verdict_audit_id, downgraded ──
    static void Wire()
    {
        var reg = new RegisterRequest { Name = Container, SizeBytes = 5120000, Sha256 = FileSha };
        Is(JsonSerializer.Serialize(ProposalResult.RequestBody(new object[0], null, "Revit", Container, "Governed Publish", null, true, null, reg)),
           "{\"source\":\"Governed Publish\",\"actor\":\"Revit\",\"elements\":[],\"container_name\":\"" + Container + "\",\"register\":{\"name\":\"" + Container + "\",\"size_bytes\":5120000,\"sha256\":\"" + FileSha + "\"}}",
           "register goes as {name, size_bytes, sha256} beside container_name, with no version_id");
        Is(JsonSerializer.Serialize(ProposalResult.RequestBody(new object[0], "v1", "Revit", Container, null, "n", false, "REQ-1", null)),
           "{\"source\":\"Governed Publish\",\"actor\":\"Revit\",\"elements\":[],\"version_id\":\"v1\",\"container_name\":\"" + Container + "\",\"note\":\"n\",\"raise_bcf\":false,\"failures_requirement\":\"REQ-1\"}",
           "without register the body is the one every other caller sends today");

        var r = ProposalResult.Parse(Accepted);
        Ok(r.Reached && r.Verdict == "accepted" && r.Downgraded is null, "an accepted reply reads accepted, not downgraded");
        Ok(r.Version is { Id: Vid, ContainerId: Cid, Revision: "v1", State: "wip" }, "the reply's version {id, container_id, revision, state} is read");
        Is(r.VerdictAuditId ?? "null", "814", "verdict_audit_id (a number) reads as text");
        Is(ProposalResult.Parse(Accepted.Replace("\"verdict_audit_id\":814", "\"verdict_audit_id\":\"814\"")).VerdictAuditId ?? "null", "814", "…and as a string");
        Is(r.VerdictHash ?? "null", StampHash, "verdict_hash (the stamp row's chain hash, Task 4's bridge) reads");
        Is(LedgerLine.For(LedgerResult.FromReceipt(r.AuditId, r.ReceiptHash)), "ledger #813 · receipt 0a1b2c3d4e5f6071…", "audit_id and receipt.ledger_hash still read as the proposal row");
        var rec = ProposalResult.Parse(Reply("recorded", "nothing in scope", 0, 0, 0));
        Ok(rec.Verdict == "recorded" && rec.Downgraded == "nothing in scope" && rec.Version is { Revision: "v1" }, "recorded with downgraded 'nothing in scope' reads both, and its version");
        var rej = ProposalResult.Parse(Reply("rejected", null, 40, 37, 3, version: false));
        Ok(rej.Verdict == "rejected" && rej.Version is null && rej.VerdictAuditId is null && rej.VerdictHash is null && rej.Failing == 3, "a rejected reply: version null, verdict_audit_id and verdict_hash null read as none");
        Ok(ProposalResult.Parse(Accepted.Replace("\"id\":\"" + Vid + "\",", "")).Version is null, "a version without an id is no version");
        Ok(ProposalResult.Parse("{\"verdict\":\"accepted\",\"summary\":{\"in_scope\":1,\"passing\":1,\"failing\":0},\"audit_id\":1}").Version is null, "a pre-5a reply (no version key) is no version");
    }

    // ── 3. PublishOutcome: what the answer allows ─────────────────────────────────────────────────────
    static PublishOutcome Outcome(string json) => PublishOutcome.From(ProposalResult.Parse(json));
    static readonly PublishOutcome Unreached = PublishOutcome.From(new ProposalResult { Error = "timed out after 120s (model may be very large)" });

    static void Outcomes()
    {
        var acc = Outcome(Accepted);
        Ok(acc.Reached && acc.Accepted && acc.Publishable && !acc.Rejected && acc.Version?.Id == Vid, "accepted → publishable, with its version");
        Is(LedgerLine.For(acc.VerdictRow), "ledger #813 · receipt 0a1b2c3d4e5f6071…", "the verdict row is the proposal row's id and receipt hash");
        Is(LedgerLine.For(acc.StampRow), "ledger #814 · receipt 6e7f8091a2b3c4d5…", "the stamp row is verdict_audit_id and verdict_hash");
        var rec = Outcome(Reply("recorded", "nothing in scope", 0, 0, 0));
        Ok(rec.Publishable && !rec.Accepted && !rec.Rejected && rec.Version is not null, "recorded → publishable (registered, badge recorded), not accepted");
        var rej = Outcome(Reply("rejected", null, 40, 37, 3, version: false));
        Ok(rej.Rejected && !rej.Publishable && !rej.Accepted && rej.Version is null, "rejected → not publishable, no version");
        Ok(!Unreached.Reached && !Unreached.Publishable && !Unreached.Rejected && !Unreached.Accepted && Unreached.Version is null, "not reached → nothing publishable, no version");
        Is(LedgerLine.For(Unreached.VerdictRow), "not confirmed — the bridge returned no chain hash", "not reached → no row confirmed");
        Ok(Outcome(Reply("accepted", null, 40, 40, 0, version: false)).Version is null, "accepted with no version in the reply → no version (Stage stages nothing)");
    }

    // ── 4. Stage: the sidecar before the IFC; nothing on a reject ──────────────────────────────────────
    static string _tmp = "";

    static PublishPlan Plan(string folder, string content = "ISO-10303-21;")
    {
        var dir = Path.Combine(_tmp, folder);
        Directory.CreateDirectory(dir);
        var ifc = Path.Combine(dir, Container);
        File.WriteAllText(ifc, content);
        File.WriteAllText(Path.ChangeExtension(ifc, ".sentinel-cert.json"), "{}"); // the certificate the gate wrote beside it
        var plan = new PublishPlan { Key = Key, ContainerName = Container, TempIfcPath = ifc, SizeBytes = content.Length, Sha256 = FileSha };
        plan.Gate.CertificatePath = Path.ChangeExtension(ifc, ".sentinel-cert.json");
        return plan;
    }

    static void Staging()
    {
        _tmp = Path.Combine(Path.GetTempPath(), "sentinel-publish-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tmp);
        var outbox = Path.Combine(_tmp, "outbox"); // does not exist yet: Stage creates it
        var sidecar = Path.Combine(outbox, Container + ".meta.json");
        var dst = Path.Combine(outbox, Container);
        try
        {
            var acc = Outcome(Accepted);
            var p1 = Plan("p1");
            var s1 = Publisher.Stage(p1, acc, outbox);
            Ok(s1.Staged && s1.OutboxPath == dst && File.ReadAllText(dst) == "ISO-10303-21;" && s1.SidecarPath == sidecar, "accepted: the IFC is in the outbox");
            Is(File.ReadAllText(sidecar), "{\"project\":\"" + Key + "\",\"container\":\"" + Container + "\",\"version_id\":\"" + Vid + "\"}",
               "the sidecar names the project, the container and the version the bridge registered — the watcher attaches by that id");
            Ok(!File.Exists(p1.TempIfcPath) && !File.Exists(p1.Gate.CertificatePath) && !Directory.Exists(Path.GetDirectoryName(p1.TempIfcPath)),
               "the temp IFC, its certificate and their folder are gone");

            // Order: a folder squatting on the destination makes the move fail. The sidecar is already written when
            // it does — the reverse order would leave no sidecar here.
            File.Delete(dst);
            File.Delete(sidecar);
            Directory.CreateDirectory(dst);
            var p2 = Plan("p2");
            var s2 = Publisher.Stage(p2, acc, outbox);
            Ok(!s2.Staged && s2.OutboxPath is null && s2.Reason.StartsWith("the IFC did not reach the upload outbox (") && s2.KeptIfcPath == p2.TempIfcPath,
               "a move that fails: not staged, the reason names it, the temp IFC is kept for the dialog");
            Ok(File.Exists(sidecar) && File.Exists(p2.TempIfcPath), "the sidecar was written BEFORE the move (it is there although the move failed)");
            Directory.Delete(dst);
            File.Delete(sidecar);
            Publisher.Discard(p2);

            // A folder squatting on the sidecar's path makes its write fail: then the IFC never moves.
            Directory.CreateDirectory(sidecar);
            var p2b = Plan("p2b");
            var s2b = Publisher.Stage(p2b, acc, outbox);
            Ok(!s2b.Staged && s2b.SidecarPath is null && s2b.Reason.StartsWith("the IFC did not reach the upload outbox (") && !File.Exists(dst) && File.Exists(p2b.TempIfcPath),
               "no sidecar → no IFC in the outbox (the watcher never sees an IFC without its sidecar)");
            Directory.Delete(sidecar);
            Publisher.Discard(p2b);

            // An older IFC of the same container still waiting in the outbox is replaced.
            File.WriteAllText(dst, "old");
            var p3 = Plan("p3", "new");
            Ok(Publisher.Stage(p3, acc, outbox).Staged && File.ReadAllText(dst) == "new", "an older outbox IFC of this container is replaced");
            File.Delete(dst);
            File.Delete(sidecar);

            foreach (var (name, o, reason) in new[]
            {
                ("rejected", Outcome(Reply("rejected", null, 40, 37, 3, version: false)), "the verdict is rejected"),
                ("not reached", Unreached, "the bridge returned no verdict"),
                ("accepted but no version", Outcome(Reply("accepted", null, 40, 40, 0, version: false)), "the bridge registered no version"),
                ("recorded but no version", Outcome(Reply("recorded", null, 0, 0, 0, version: false)), "the bridge registered no version"),
            })
            {
                var p = Plan("p-" + name.Replace(' ', '-'));
                var s = Publisher.Stage(p, o, outbox);
                Ok(!s.Staged && s.Reason == reason && s.SidecarPath is null && s.KeptIfcPath is null, name + ": nothing staged — " + reason);
                Ok(!File.Exists(sidecar) && !File.Exists(dst) && !File.Exists(p.TempIfcPath) && !Directory.Exists(Path.GetDirectoryName(p.TempIfcPath)),
                   name + ": no sidecar, no outbox IFC, the temp IFC discarded");
            }
        }
        finally { try { Directory.Delete(_tmp, true); } catch { } }
    }

    // ── 5. the lines: every outcome names what judged; the version only from the reply ────────────────
    static GateResult Gate(GateOutcome o, string schema = "IFC4")
    {
        var r = new GateResult
        {
            Outcome = o, ContractLabel = "contract@1 · office · 0123456789ab…", ContractRef = "contract@1", ContractSource = "office", ContractSha256 = CSha,
            ContractKey = "pilot-ifc4", IfcPath = @"C:\t\a.ifc", DetectedSchema = schema, FileSizeBytes = 5120000, TotalEntities = 40, FileSha256 = FileSha,
            CertificatePath = @"C:\t\a.sentinel-cert.json",
        };
        if (o == GateOutcome.Fail) r.Failures.Add("IFCCOLUMN: 0 found, contract requires ≥ 1.");
        return r;
    }

    static PublishPlan Ready(GateResult? gate = null) => new PublishPlan
    {
        Key = Key, ContainerName = Container, TempIfcPath = @"C:\t\a.ifc", SizeBytes = 5120000, Sha256 = FileSha,
        Gate = gate ?? Gate(GateOutcome.Pass), GateRow = LedgerResult.FromReceipt("812", GateHash),
    };

    static readonly StageResult Staged = new StageResult { Staged = true, OutboxPath = @"C:\o\a.ifc", SidecarPath = @"C:\o\a.ifc.meta.json" };
    static readonly StageResult NotStaged = new StageResult { Reason = "the bridge registered no version" };

    static void Lines()
    {
        const string GateLine = "Delivery gate: PASS · contract@1 · office · 0123456789ab… · Schema IFC4";
        const string GateRowLine = "Gate row: ledger #812 · receipt 5c6d7e8f90112233…";
        const string VerdictRowLine = "Verdict row: ledger #813 · receipt 0a1b2c3d4e5f6071…";
        const string Judged = "IDS ids@4 · office · 23bb57937fb0…: 40/40 in-scope element checks passed.\nNaming naming@2 · office · 77e1d2c3b4a5…: passed.\n";
        const string Rows = "\nSHA-256: 3f9a0c1d2e4b5f60…\n" + GateRowLine + "\n" + VerdictRowLine + "\n";
        const string VersionLine = "Version: " + Container + " v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5…";
        const string Queued = "Queued for upload — the outbox watcher attaches the geometry to this version.";
        var plan = Ready();
        var acc = Outcome(Accepted);

        // refusals, before the referee: Dialog with no outcome
        Is(PublishLines.Dialog(plan), "", "a ready plan has no refusal");
        var unbound = new PublishPlan { Refusal = ProjectContext.NotBound + "\n\nNothing was exported or published." };
        Is(PublishLines.Dialog(unbound), "This model is not bound to a web project — Sentinel ▸ Project Setup.\n\nNothing was exported or published.", "not bound: the one text, nothing exported");
        var noGeom = new PublishPlan { Key = Key, Refusal = "IFC export contained no geometry — nothing to publish. Check the model's 3D view and the IFC mappings." };
        Is(PublishLines.Dialog(noGeom), noGeom.Refusal!, "an empty export: the refusal as the plan states it");
        var failed = Ready(Gate(GateOutcome.Fail, "IFC2X3"));
        Ok(failed.GateFailed && !failed.Ready, "a gate FAIL is not ready");
        Is(PublishLines.Dialog(failed),
           "✕ REJECTED — delivery gate failed (not published)\n\nContract: contract@1 · office · 0123456789ab… · Schema: IFC2X3\n\nFAILURES:\n• IFCCOLUMN: 0 found, contract requires ≥ 1.\n\nFix the deliverable and run Governed Publish again.\n\n" + GateRowLine,
           "gate FAIL: GateLines.PublishRejected and the gate row, as before");
        var notChecked = Ready(new GateResult { Outcome = GateOutcome.NotChecked, ContractLabel = "none — not installed for aster-tower or its office", NotCheckedReason = "none — not installed for aster-tower or its office", DetectedSchema = "IFC2X3", FileSizeBytes = 5120000, FileSha256 = FileSha });
        Ok(!notChecked.GateFailed && notChecked.Ready, "a NOT CHECKED gate is not a fail: the referee is still asked");

        // the version line
        Is(PublishLines.Version(plan, acc), VersionLine, "the version from the reply: container, revision, state, the stamp row's ledger id and receipt (verdict_audit_id + verdict_hash)");
        Is(PublishLines.Version(plan, Outcome(Accepted.Replace("\"verdict_audit_id\":814", "\"verdict_audit_id\":null"))),
           "Version: " + Container + " v1 · wip · not confirmed — the bridge returned no chain hash", "a version with no verdict_audit_id: the stamp is not confirmed");
        Is(PublishLines.Version(plan, Outcome(Accepted.Replace("\"verdict_hash\":\"" + StampHash + "\"", "\"verdict_hash\":null"))),
           "Version: " + Container + " v1 · wip · not confirmed — the bridge returned no chain hash", "a bridge before Task 4 (no verdict_hash): the stamp is not confirmed — never a receipt without its hash");
        Is(PublishLines.Version(plan, Outcome(Reply("accepted", null, 40, 40, 0, version: false))), "Version: not confirmed — the bridge registered no version", "no version in an accepted reply");
        Is(PublishLines.Version(plan, Outcome(Reply("rejected", null, 40, 37, 3, version: false))), "Version: not confirmed — rejected — nothing was registered", "no version on a reject");
        Is(PublishLines.Version(plan, Unreached), "Version: not confirmed — the bridge returned no verdict (timed out after 120s (model may be very large))", "no version when the bridge was not reached");

        // accepted
        Is(PublishLines.Dialog(plan, acc, Staged),
           "✓ ACCEPTED — published as v1 · wip\nProject: aster-tower\n\n" + Judged + GateLine + Rows + VersionLine + "\n\n" + Queued,
           "accepted and staged: what judged, both ledger rows, the version, the upload");
        var warned = Outcome(Accepted.Replace("\"failing\":0", "\"failing\":2").Replace("\"warned\":false,\"ids_enforce\":\"reject\"", "\"warned\":true,\"ids_enforce\":\"warn\""));
        Ok(PublishLines.Dialog(plan, warned, Staged).Contains("IDS ids@4 · office · 23bb57937fb0…: 40/40 in-scope element checks passed — 2 failure(s) kept as warnings (enforce: warn).\n"),
           "accepted with warnings names the IDS's enforce");
        Ok(PublishLines.Dialog(notChecked, acc, Staged).Contains("Delivery gate: NOT CHECKED — contract: none — not installed for aster-tower or its office\nThe IDS judged alone — the delivery gate was not checked (contract: none — not installed for aster-tower or its office).\n"),
           "accepted with no contract: NOT CHECKED and the IDS-judged-alone note (A3)");
        Is(PublishLines.Dialog(plan, acc, new StageResult { Reason = "the IFC did not reach the upload outbox (Access to the path is denied.)", SidecarPath = @"C:\o\a.ifc.meta.json", KeptIfcPath = @"C:\t\a.ifc" }),
           "✓ ACCEPTED — v1 · wip registered, NOT in the upload outbox\nProject: aster-tower\n\n" + Judged + GateLine + Rows + VersionLine + "\n\n" +
           "NOT in the upload outbox — the IFC did not reach the upload outbox (Access to the path is denied.). The IFC is kept at C:\\t\\a.ifc — run Governed Publish again.",
           "accepted, registered, but the move failed: never 'published', the reason and where the IFC is");
        Is(PublishLines.Dialog(plan, Outcome(Reply("accepted", null, 40, 40, 0, version: false)), NotStaged),
           "✓ ACCEPTED — no version registered\nProject: aster-tower\n\n" + Judged + GateLine + Rows +
           "Version: not confirmed — the bridge registered no version\n\n" +
           "Nothing was uploaded: there is no version to attach the geometry to — run Governed Publish again.",
           "accepted but the reply carries no version: no version claimed, nothing uploaded");

        // recorded: nothing in scope, and no IDS
        var down = Outcome(Reply("recorded", "nothing in scope", 0, 0, 0));
        Is(PublishLines.Dialog(plan, down, Staged),
           "Published — not judged: nothing in the IDS's scope (ids@4 · office · 23bb57937fb0…)\nProject: aster-tower\n\n" +
           "IDS ids@4 · office · 23bb57937fb0…: nothing in its scope — 0 in-scope element checks, so nothing was judged.\n" +
           "Naming naming@2 · office · 77e1d2c3b4a5…: passed.\n" + GateLine + Rows + VersionLine + "\n\n" + Queued + "\n" +
           "No verdict badge: the IDS found nothing in its scope, so nothing was judged — the verdict is \"recorded\", and publishing this version on the web needs the lead's reason. Give the IDS something in its scope, or install one that covers this model, to judge the next one.",
           "recorded, nothing in scope: never ACCEPTED, names the IDS, says what publishing needs");
        var none = Outcome(Reply("recorded", null, 0, 0, 0).Replace("\"ids_source\":\"office\",\"ids_ref\":\"ids@4\",\"ids_sha256\":\"" + ISha + "\"", "\"ids_source\":\"none\",\"ids_ref\":null,\"ids_sha256\":null"));
        Is(PublishLines.Dialog(plan, none, Staged),
           "Published — not judged: no IDS installed for aster-tower or its office\nProject: aster-tower\n\n" +
           "IDS: none — no IDS installed for aster-tower or its office. The model was NOT judged.\n" +
           "Naming naming@2 · office · 77e1d2c3b4a5…: passed.\n" + GateLine + Rows + VersionLine + "\n\n" + Queued + "\n" +
           "No verdict badge: nothing was judged — the verdict is \"recorded\", and publishing this version on the web needs the lead's reason. Install an IDS on the project or its office to judge the next one.",
           "recorded, no IDS: the none reason, the install hint");
        Ok(PublishLines.Dialog(plan, Outcome(Reply("recorded", null, 0, 0, 0, version: false)), NotStaged).StartsWith("Recorded — not judged: nothing in the IDS's scope (ids@4 · office · 23bb57937fb0…)\n"),
           "recorded with nothing staged never says Published");

        // rejected: element checks, then the name
        var rej = Outcome(Reply("rejected", null, 40, 37, 3, version: false).Replace("\"failures\":[]", "\"failures\":[{\"element\":\"1\",\"requirement\":\"Walls need FireRating\",\"reason\":\"FireRating missing\"}]").Replace("\"agent\":null", "\"agent\":null,\"bcf\":{\"raised\":1}"));
        Is(PublishLines.Dialog(plan, rej, NotStaged),
           "✕ REJECTED — 3 of 40 in-scope element check(s) failed (not published)\n\n" +
           GateLine + "\n" + GateRowLine + "\n" + VerdictRowLine + "\nNo version was registered and nothing was uploaded.\n\n" +
           "FAILURES:\n• Walls need FireRating: FireRating missing\n\n" +
           "1 BCF issue(s) opened on the failing elements — they're now in the web Issues panel and will live-sync into Revit. Fix them and run Governed Publish again.",
           "rejected: the failures, the rows, no version, no upload, the BCF note");
        var badName = Outcome(Reply("rejected", null, 40, 40, 0, version: false).Replace("\"naming\":{\"ok\":true,\"failures\":[],\"enforce\":\"reject\"}", "\"naming\":{\"ok\":false,\"failures\":[{\"reason\":\"field 2 must be the originator code\"}],\"enforce\":\"reject\"}"));
        Is(PublishLines.Dialog(plan, badName, NotStaged),
           "✕ REJECTED — model name does not follow the ISO 19650 convention (not published)\n\nName checked: " + Container + "\n\n" +
           GateLine + "\n" + GateRowLine + "\n" + VerdictRowLine + "\nNo version was registered and nothing was uploaded.\n\n" +
           "NAMING:\n• field 2 must be the originator code\n\n" +
           "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again.",
           "rejected by name: the name checked is the container's name");

        // not reached: no shell command, no manual upload
        var un = PublishLines.Dialog(plan, Unreached, NotStaged);
        Is(un, GateLine + "\n" + GateRowLine + "\n\n" +
               "The Sentinel bridge did not return a verdict — nothing was registered or uploaded, and no verdict row is confirmed.\n\n" +
               "Reason: timed out after 120s (model may be very large)\n\n" +
               "Start the bridge (npm run bcf:serve) and run Governed Publish again.",
           "bridge not reached: nothing registered or uploaded, the reason, run again");
        Ok(!un.Contains("upload-ifc") && !un.Contains("node "), "no shell command is printed any more");

        // Auto-Publish's one Doctor line
        Is(PublishLines.Doctor(plan, acc, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5…", "auto, accepted: Auto-published <container> <revision> · wip · the stamp row");
        Is(PublishLines.Doctor(plan, down, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5… — not judged: nothing in the IDS's scope (ids@4 · office · 23bb57937fb0…)", "auto, recorded: says nothing was judged");
        Is(PublishLines.Doctor(plan, none, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5… — not judged: no IDS installed for aster-tower or its office", "auto, recorded with no IDS");
        Is(PublishLines.Doctor(plan, rej, NotStaged), "Auto-publish rejected — nothing uploaded — 3 of 40 element check(s) failed · ids@4 · office · 23bb57937fb0… · ledger #813 · receipt 0a1b2c3d4e5f6071…", "auto, rejected: nothing uploaded, the failures, what judged, the proposal row");
        Is(PublishLines.Doctor(plan, badName, NotStaged), "Auto-publish rejected — nothing uploaded — the model name " + Container + " failed naming naming@2 · office · 77e1d2c3b4a5… · ledger #813 · receipt 0a1b2c3d4e5f6071…", "auto, rejected by name");
        Is(PublishLines.Doctor(failed), "Auto-publish rejected — nothing uploaded — delivery gate FAIL · contract@1 · office · 0123456789ab… · Schema IFC2X3 · 1 failure(s) · gate row: ledger #812 · receipt 5c6d7e8f90112233…", "auto, gate FAIL: nothing uploaded, the contract, the gate row");
        Is(PublishLines.Doctor(plan, Unreached, NotStaged), "Auto-publish: no verdict — nothing uploaded — timed out after 120s (model may be very large)", "auto, bridge not reached");
        Is(PublishLines.Doctor(noGeom), "Auto-publish failed — nothing uploaded — IFC export contained no geometry — nothing to publish. Check the model's 3D view and the IFC mappings.", "auto, empty export");
        Is(PublishLines.Doctor(plan, Outcome(Reply("accepted", null, 40, 40, 0, version: false)), NotStaged), "Auto-publish: verdict accepted but the bridge registered no version — nothing uploaded · ledger #813 · receipt 0a1b2c3d4e5f6071…", "auto, no version in the reply");
        Is(PublishLines.Doctor(plan, acc, new StageResult { Reason = "the IFC did not reach the upload outbox (x)", KeptIfcPath = @"C:\t\a.ifc" }), "Auto-publish: " + Container + " v1 · wip registered but NOT in the upload outbox — the IFC did not reach the upload outbox (x) — the IFC is kept at C:\\t\\a.ifc", "auto, the move failed: names the kept IFC");
        Is(PublishLines.Doctor(plan), "Auto-publish: no verdict — the publish stopped before the referee answered — nothing uploaded", "auto, a Judge task that never answered");
    }

    // ── 6. the policy: publish@n {auto: true}, else off with the reason ────────────────────────────────
    static ResolvedArtefact Publish(string body, string origin) => new ResolvedArtefact
    {
        Kind = "publish", Ref = "publish@1", Source = "office", Sha256 = PSha, BodyJson = body, Origin = origin,
        Label = ArtefactClient.RefLabel("publish@1", "office", PSha) + (origin == "cache" ? " (cached 14:03)" : ""),
    };

    static void Policy()
    {
        var on = Publish("{\"auto\":true}", "bridge");
        Ok(Publisher.AutoEnabled(on), "publish@1 {auto: true} from the bridge → on");
        Is(PublishLines.Policy(on), "Auto-publish: on · publish@1 · office · 3f07a1b2c3d4…", "the pane's line names publish@n · source · sha");
        var off = Publish("{\"auto\":false}", "bridge");
        Ok(!Publisher.AutoEnabled(off), "{auto: false} → off");
        Is(PublishLines.Policy(off), "Auto-publish: off — publish@1 · office · 3f07a1b2c3d4…", "…and the line names the artefact that says so");
        var none = ArtefactClient.None("publish", "not installed for aster-tower or its office");
        Ok(!Publisher.AutoEnabled(none), "none installed → off");
        Is(PublishLines.Policy(none), "Auto-publish: off — publish: none — not installed for aster-tower or its office", "…with the none reason (the pane's line)");
        var cached = Publish("{\"auto\":true}", "cache");
        Ok(Publisher.AutoEnabled(cached), "a cached {auto: true} (the bridge unreachable now) → on, as every other cached artefact judges");
        Is(PublishLines.Policy(cached), "Auto-publish: on · publish@1 · office · 3f07a1b2c3d4… (cached 14:03)", "…and the line says it is the cached copy");
        foreach (var body in new[] { "{}", "{\"auto\":\"true\"}", "{\"auto\":1}", "[]", "null", "", "not json" })
        {
            var bad = Publish(body, "bridge");
            Ok(!Publisher.AutoEnabled(bad) && PublishLines.Policy(bad) == "Auto-publish: off — publish@1 · office · 3f07a1b2c3d4… did not parse: the body is not {auto: true} or {auto: false}",
               "a body that is not {auto: boolean} (" + (body.Length == 0 ? "empty" : body) + ") → off, did not parse");
        }
        var unreachable = ArtefactClient.None("publish", "bridge unreachable (No connection could be made)");
        Ok(!Publisher.AutoEnabled(unreachable) && PublishLines.Policy(unreachable) == "Auto-publish: off — publish: none — bridge unreachable (No connection could be made)",
           "no bridge and no cache → off, the reason");
    }
}
