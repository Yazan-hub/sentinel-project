using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Linq;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Sentinel.Commands; // BcfConfig (bridge URL + service token)

namespace Sentinel.Coordination
{
    /// <summary>
    /// Notifications from Revit INTO the web app's governed layer (bridge <c>/cde/...</c>): what Revit did lands on
    /// the project's ledger (audit_log; its hash chain runs through the whole table, not per project), so the CDE
    /// timeline shows authoring events alongside coordination + governance. A ledger event (<see cref="Event"/> and
    /// the wrappers that return a <see cref="LedgerResult"/>) is BLOCKING — 6 s cap — and says what the ledger
    /// answered: callers run it OFF the Revit API thread and wait (a modal tool) or continue on the task (save, sync),
    /// then print <see cref="LedgerLine"/> on their own thread. Nothing here throws and nothing here touches UI. The
    /// bridge comes from <see cref="BcfConfig"/> (ServiceUrl + ServiceToken); the project is ALWAYS the caller's
    /// document key (ProjectContext) — there is no machine default, and an empty key records nothing and says so.
    /// A version is registered only by <see cref="Propose"/>'s <c>register</c> (one call judges, registers and stamps).
    /// </summary>
    internal static class GovernedNotify
    {
        // Governed Publish is a deliberate, interactive action whose /propose call adjudicates the whole model
        // AND (on a reject) creates a BCF issue per failing requirement across several Supabase round-trips —
        // seconds, not milliseconds, on a large model. Give the blocking governed calls a generous timeout so
        // they wait for the real verdict instead of tripping the "bridge unreachable" fallback on big models.
        private static readonly HttpClient GovHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };

        /// <summary>Send a governed request, attaching the bridge auth-gate bearer (F2) when the bridge requires
        /// one (BcfConfig.ServiceToken non-empty). Blocking; the caller owns/reads the response.</summary>
        private static HttpResponseMessage Send(HttpClient client, HttpMethod method, string url, HttpContent? content, BcfConfig cfg,
                                                System.Threading.CancellationToken ct = default)
        {
            var msg = new HttpRequestMessage(method, url);
            if (content != null) msg.Content = content;
            if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
            return client.SendAsync(msg, ct).GetAwaiter().GetResult();
        }

        /// <summary>The document's project key, trimmed; empty when the document is not bound. No fallback.</summary>
        private static string KeyOf(string? projectKey) => (projectKey ?? "").Trim();

        private const string NotBoundError = "this model is not bound to a web project — Sentinel ▸ Project Setup";

        /// <summary>
        /// POST one governed event to <c>{ServiceUrl}/cde/{key}{path}</c> and return what the ledger answered —
        /// <see cref="LedgerLine"/> is the only text for it. BLOCKING, ≤ 6 s unless <paramref name="timeout"/> says
        /// otherwise: a modal tool waits with <c>Task.Run(() => …).GetAwaiter().GetResult()</c>, a save or sync handler
        /// continues on the task. Never throws and never touches UI — no LogDoctor, no Dispatcher: a worker calling
        /// back into a thread that waits on it would deadlock; the caller prints the line on its own thread. An empty
        /// key sends nothing (<see cref="LedgerState.NotBound"/>).
        /// </summary>
        public static LedgerResult Event(string path, object payload, string projectKey, TimeSpan? timeout = null)
        {
            var cfg = BcfConfig.Load(); // never throws: the file, else the environment, else localhost
            string token;
            try { token = cfg.ServiceToken; }
            catch (SessionException e) { return LedgerResult.NotRecorded(e.Message); } // SI-1: never the PC's token instead
            return LedgerResult.Post(cfg.ServiceUrl, token, projectKey, path, payload, timeout ?? LedgerResult.DefaultTimeout);
        }

        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) on the ledger through <c>POST /cde/:key/delivery-gate</c> (spec
        /// 2026-09-27 Decision 5): the machine credential, or a signed-in contributor or above under their verified
        /// identity (GATE-E1) — the open audit route refuses entity_type delivery_gate since 6a, so a gate row comes
        /// only from here, the gate's own words. The web CDE timeline then
        /// shows the certificate that decided whether a deliverable was fit for upload: PASS, FAIL or NOT CHECKED. The
        /// bridge words the row itself and stores <see cref="Sentinel.Engine.GateLines.AuditValue"/> as its value (pinned
        /// by tools/gate-check and tools/publish-check): the contract that judged (all null when none), <c>passed</c>
        /// null when nothing was judged, every failure, and the file's sha256 and size. <paramref name="source"/> is
        /// "revit" (Governed Publish), "auto-publish" or "check" (the IFC Delivery Gate command); with
        /// <paramref name="publish"/> a FAIL is also held on the web and the reply's hold row comes back as
        /// <see cref="LedgerResult.Hold"/>. The IFC gate and the Publisher wait for the answer and print its line.
        /// </summary>
        public static LedgerResult DeliveryGate(string fileName, Sentinel.Engine.IfcDeliveryGate.GateResult gate, string projectKey,
                                                string source, bool publish)
        {
            // XC-4: the machine credential's row names UserSession.Actor; a signed-in row is the verified identity whatever this says.
            var value = Sentinel.Engine.GateLines.AuditValue(fileName, gate, source, publish);
            value["actor"] = UserSession.Actor;
            return Event("/delivery-gate", value, projectKey);
        }

        /// <summary>
        /// MA-1a item 7: one modelling command's report row (a <see cref="CommandReports"/> body), sent and forgotten.
        /// Returns at once: the POST runs on a pool thread (<see cref="Event"/>, 6 s cap), and when the ledger has answered
        /// one line goes to the pane's Doctor log — "&lt;what&gt; — Recorded: ledger #812 · receipt …", "… — Not recorded — …",
        /// "… — Not confirmed — …". An unbound model sends nothing and says so in the same log. Never throws, never
        /// waits, never shows a dialog: no command is blocked or delayed by the ledger, and no network call is made on
        /// Revit's API thread. Callers report only what Revit committed. <paramref name="ui"/> is the pane's dispatcher
        /// when the caller is not on Revit's API thread.
        /// </summary>
        public static void Report(string what, object payload, string projectKey, System.Windows.Threading.Dispatcher? ui = null)
        {
            // The pane's thread: the caller's own when it is Revit's API thread (every command), else the one it hands over
            // (the Doctor's flush runs on a pool thread, where there is no pane dispatcher to find).
            ui = ui ?? System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
            // Review amendment C22: the report route answers 413 and 429 before it writes (cde-store.mjs recordRevitReport),
            // so for this poster they are "not recorded". LedgerResult's own wording — "the entry may have landed" — stays
            // for the routes nobody has checked. A refused report is lost, not retried.
            LedgerResult Refused(LedgerResult r) =>
                r.State == LedgerState.NotConfirmed && (r.Reason.StartsWith("HTTP 413", StringComparison.Ordinal) || r.Reason.StartsWith("HTTP 429", StringComparison.Ordinal))
                    ? LedgerResult.NotRecorded(r.Reason.Replace(" (the entry may have landed)", "")) : r;
            void Say(LedgerResult ledger) => ui.BeginInvoke(new Action(() =>
            {
                try { Sentinel.App.PanelVm?.LogDoctor(what + " — " + LedgerLine.Sentence(Refused(ledger))); } catch { /* the pane is gone */ }
            }));
            string key = KeyOf(projectKey);
            if (key.Length == 0) { Say(LedgerResult.NotBound()); return; }
            Task.Run(() => Event("/audit", payload, key)).ContinueWith(t => Say(t.Status == TaskStatus.RanToCompletion
                ? t.Result
                : LedgerResult.NotConfirmed(t.Exception?.GetBaseException().Message ?? "the report did not finish")), TaskScheduler.Default);
        }

        /// <summary>Record a Naming Manager batch on the ledger: one row for the batch (the window continues on the
        /// task and shows the line).</summary>
        public static LedgerResult NamingRenamed(IEnumerable<object> rows, string actor, string projectKey)
        {
            var list = rows.ToList();
            return Event("/audit", new
            {
                entity_type = "naming",
                actor,
                action = $"Naming Manager renamed {list.Count} item(s) in Revit",
                new_value = new { rows = list, source = "revit", at = DateTime.UtcNow.ToString("o") },
            }, projectKey);
        }

        /// <summary>
        /// The referee call: POST the extracted <paramref name="elements"/> to <c>/cde/:key/propose</c> and return
        /// the deterministic verdict. No IDS is sent: the bridge judges by the project's ids@n (else its office's,
        /// else none → "recorded") and names it in the response (ids_ref · ids_source · ids_sha256). When <paramref name="versionId"/> is
        /// set, the bridge also stamps the verdict onto that file version (the web verdict badge, G3); on a reject
        /// it auto-opens a BCF issue per failing requirement (G2) unless <paramref name="raiseBcf"/> is false —
        /// a fix-in-place check or re-check must never open topics. <paramref name="source"/> and
        /// <paramref name="note"/> land on the audit row. With <paramref name="register"/> (the Publisher: one
        /// adjudication per publish, spec 2026-09-26 Decision 3) the bridge registers the version on an accepted or
        /// recorded verdict and stamps it, answering <see cref="ProposalResult.Version"/> and
        /// <see cref="ProposalResult.VerdictAuditId"/>; a rejected verdict registers nothing, and the bridge answers the
        /// hold row it wrote for it, if any (<see cref="ProposalResult.Held"/>). <paramref name="gateRowId"/> (the
        /// Publisher: its gate row's ledger id) lets the proposal row name the gate row it follows. Blocking (120s cap,
        /// or until <paramref name="ct"/> is cancelled — GP-1's Cancel: the wait stops, the bridge may still finish);
        /// never throws: <see cref="ProposalResult.Reached"/> is false on any transport/parse failure.
        /// </summary>
        public static ProposalResult Propose(object elements, string? versionId, string actor,
                                             string projectKey, string? containerName = null,
                                             string? source = null, string? note = null, bool raiseBcf = true,
                                             string? failuresRequirement = null, RegisterRequest? register = null,
                                             long? gateRowId = null, System.Threading.CancellationToken ct = default)
        {
            var r = new ProposalResult();
            var key = KeyOf(projectKey);
            if (key.Length == 0) { r.Error = NotBoundError; return r; }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/propose";
                var body = ProposalResult.RequestBody(elements, versionId, actor, containerName, source, note, raiseBcf, failuresRequirement, register, gateRowId);

                var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
                var resp = Send(GovHttp, HttpMethod.Post, url, content, cfg, ct);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (!resp.IsSuccessStatusCode) { r.Error = "bridge returned HTTP " + (int)resp.StatusCode; return r; }
                return ProposalResult.Parse(json);
            }
            catch (Exception ex)
            {
                // Distinguish Cancel, a timeout (large model, still adjudicating) and a real connection failure.
                r.Error = ct.IsCancellationRequested ? "cancelled — Sentinel stopped waiting for the referee"
                    : ex is TaskCanceledException or OperationCanceledException
                    ? "timed out after 120s (model may be very large)"
                    : ex.InnerException?.Message ?? ex.Message;
            }
            return r;
        }

        /// <summary>
        /// Send the office snapshot (standards pack + type catalogue + ruleset) to <c>POST /cde/{key}/office/snapshot</c>.
        /// Blocking (120 s cap — a 20k-type catalogue is megabytes); returns null on success, else a short reason.
        /// Deliberate, interactive (a button) — so it reports instead of no-op'ing like the fire-and-forget calls.
        /// </summary>
        public static string? OfficeSnapshot(OfficeSnapshotDto dto, string projectKey)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0) return NotBoundError;
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/office/snapshot";
                dto.Actor = UserSession.Actor; // XC-4: never the bridge's "revit"
                var content = new StringContent(dto.ToJson(), Encoding.UTF8, "application/json");
                var resp = Send(GovHttp, HttpMethod.Post, url, content, cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (resp.IsSuccessStatusCode) return null;
                try { using var d = JsonDocument.Parse(json); if (d.RootElement.TryGetProperty("message", out var m)) return $"HTTP {(int)resp.StatusCode}: {m.GetString()}"; } catch { }
                return "bridge returned HTTP " + (int)resp.StatusCode;
            }
            catch (Exception ex)
            {
                return ex is TaskCanceledException or OperationCanceledException ? "timed out after 120s" : (ex.InnerException?.Message ?? ex.Message);
            }
        }

        /// <summary>
        /// Install <paramref name="kind"/>@n+1 on the project: <c>PUT /cde/{key}/artefacts/{kind}?actor=…</c>. The
        /// route lifts a top-level <c>source</c> object out of the body into the pointer's provenance. Blocking
        /// (120 s cap) — call it OFF the API thread. Returns the new version and the bridge's sha, or a reason.
        /// </summary>
        public static (int Version, string? Sha256, string? Error) InstallArtefact(string projectKey, string kind, string bodyJson, string actor)
        {
            if (string.IsNullOrWhiteSpace(projectKey)) return (0, null, "this model is not bound to a web project");
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(projectKey.Trim()) + "/artefacts/" +
                          Uri.EscapeDataString(kind) + "?actor=" + Uri.EscapeDataString(actor);
                var resp = Send(GovHttp, HttpMethod.Put, url, new StringContent(bodyJson, Encoding.UTF8, "application/json"), cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                JsonDocument? d = null;
                try { d = JsonDocument.Parse(json); } catch { /* not JSON: report the status alone */ }
                using (d)
                {
                    var root = d?.RootElement ?? default;
                    string? Prop(string k) => root.ValueKind == JsonValueKind.Object && root.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
                    if (resp.IsSuccessStatusCode)
                        return (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("version", out var ver) && ver.TryGetInt32(out var n) ? n : 0, Prop("sha256"), null);
                    return (0, null, Prop("message") is { } m ? $"HTTP {(int)resp.StatusCode}: {m}" : "bridge returned HTTP " + (int)resp.StatusCode);
                }
            }
            catch (Exception ex)
            {
                return (0, null, ex is TaskCanceledException or OperationCanceledException ? "timed out after 120s" : (ex.InnerException?.Message ?? ex.Message));
            }
        }

        // ponytail: throttle is per process, not per document — two models synced within 60 s post one scan;
        // per-document map if that matters
        private static DateTime _lastScanPost = DateTime.MinValue;
        private static readonly TimeSpan ScanThrottle = TimeSpan.FromSeconds(60);
        private static readonly object ScanGate = new object(); // OfficeScan runs on pool threads: two syncs must not both post

        /// <summary>Post a scan report to <c>POST /cde/{key}/office/scan</c> (the Phase-3 seam) and return what the
        /// ledger answered. At most one per minute per process — sync storms must not become request storms; a
        /// throttled report is not sent and says so. The route writes its ledger row through audit() (return=minimal),
        /// so a 201 reads "not confirmed — the bridge returned no chain hash" until that follow-up lands. BLOCKING
        /// (≤ 6 s): App.OnSynchronized runs it on a task and never waits. An empty key posts nothing. Never throws.</summary>
        public static LedgerResult OfficeScan(Sentinel.Engine.ScanReport report, string projectKey)
        {
            if (KeyOf(projectKey).Length == 0) return LedgerResult.NotBound();
            lock (ScanGate)
            {
                var now = DateTime.UtcNow;
                if (now - _lastScanPost < ScanThrottle)
                    return LedgerResult.NotRecorded("a scan report went less than a minute ago; this one was not sent (one a minute per process)");
                _lastScanPost = now;
            }
            try
            {
                // The report keeps its own wire shape (snake_case, an explicit null ruleset): Event's serializer writes a
                // JsonElement exactly as it is.
                var dto = ScanReportDto.From(report);
                dto.Actor = UserSession.Actor; // XC-4: never the bridge's "revit"
                using var wire = JsonDocument.Parse(dto.ToJson());
                return Event("/office/scan", wire.RootElement, projectKey);
            }
            catch (Exception e) { return LedgerResult.NotRecorded("the scan report could not be written (" + e.Message + ")"); }
        }
    }
}
