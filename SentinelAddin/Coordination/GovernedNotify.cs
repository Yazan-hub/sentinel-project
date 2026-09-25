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
    /// Fire-and-forget notifications from Revit INTO the web app's governed layer (bridge <c>/cde/...</c>).
    /// This is the compatibility bridge between authoring (Revit) and the referee layer (Sentinel web): it
    /// records what Revit did in the project's immutable, hash-chained audit trail, so the CDE timeline shows
    /// authoring events alongside coordination + governance. It NEVER throws and NEVER blocks the Revit save
    /// flow — an absent or slow bridge is a silent no-op. The bridge comes from <see cref="BcfConfig"/>
    /// (ServiceUrl + ServiceToken); the project is ALWAYS the caller's document key (ProjectContext) — there is
    /// no machine default, and an empty key records nothing (and says so in the Doctor log).
    /// </summary>
    internal static class GovernedNotify
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };

        // Governed Publish is a deliberate, interactive action whose /propose call adjudicates the whole model
        // AND (on a reject) creates a BCF issue per failing requirement across several Supabase round-trips —
        // seconds, not milliseconds, on a large model. Give the blocking governed calls a generous timeout so
        // they wait for the real verdict instead of tripping the "bridge unreachable" fallback on big models.
        private static readonly HttpClient GovHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };

        /// <summary>Send a governed request, attaching the bridge auth-gate bearer (F2) when the bridge requires
        /// one (BcfConfig.ServiceToken non-empty). Blocking; the caller owns/reads the response.</summary>
        private static HttpResponseMessage Send(HttpClient client, HttpMethod method, string url, HttpContent? content, BcfConfig cfg)
        {
            var msg = new HttpRequestMessage(method, url);
            if (content != null) msg.Content = content;
            if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
            return client.SendAsync(msg).GetAwaiter().GetResult();
        }

        /// <summary>The document's project key, trimmed; empty when the document is not bound. No fallback.</summary>
        private static string KeyOf(string? projectKey) => (projectKey ?? "").Trim();

        private const string NotBoundError = "this model is not bound to a web project — Sentinel ▸ Project Setup";

        /// <summary>Record a "model published from Revit" event in the governed audit trail.</summary>
        public static void ModelPublished(string modelName, long bytes, string projectKey)
        {
            Post("/audit", new
            {
                entity_type = "model",
                actor = "Revit",
                action = "Model published from Revit: " + modelName,
                new_value = new { model = modelName, kb = bytes / 1024, source = "revit", at = DateTime.UtcNow.ToString("o") },
            }, projectKey);
        }

        /// <summary>
        /// Register a Revit publish as a new version in the web app's file-version history (migration 0011,
        /// <c>POST /cde/:key/files</c>). The model's title is the file key, so repeated publishes append
        /// v1 → v2 → … and the newest becomes the live version — the same version timeline a web upload feeds.
        /// Fire-and-forget; a bridge without the CDE configured just no-ops (503).
        /// </summary>
        public static void FileVersion(string modelName, long bytes, string projectKey)
        {
            var name = modelName.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelName : modelName + ".ifc";
            Post("/files", new
            {
                name,
                author = "Revit",
                size_bytes = bytes,
                notes = "published from Revit",
            }, projectKey);
        }

        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) in the governed audit trail. The web CDE timeline then shows the
        /// certificate that decided whether a deliverable was fit for upload: PASS, FAIL or NOT CHECKED. The row names
        /// the contract that judged (contract_ref · contract_source · contract_sha256), all null when none was
        /// installed. <c>passed</c> is null when nothing was judged; every reader treats null as not checked, never as
        /// a pass or a fail. The row is <see cref="Sentinel.Engine.GateLines.AuditValue"/>, which has the Node intake
        /// gate row's shape and is pinned by tools/gate-check. <c>sha256</c> ties it to the exact bytes certified.
        /// </summary>
        public static void DeliveryGate(string fileName, Sentinel.Engine.IfcDeliveryGate.GateResult gate, string projectKey)
        {
            Post("/audit", new
            {
                entity_type = "delivery_gate",
                actor = "Revit",
                action = Sentinel.Engine.GateLines.AuditAction(fileName, gate),
                new_value = Sentinel.Engine.GateLines.AuditValue(fileName, gate),
            }, projectKey);
        }

        /// <summary>Record a Naming Manager batch in the governed audit trail (fire-and-forget).</summary>
        public static void NamingRenamed(IEnumerable<object> rows, string actor, string projectKey)
        {
            var list = rows.ToList();
            Post("/audit", new
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
        /// <paramref name="note"/> land on the audit row. Blocking (120s cap); never throws:
        /// <see cref="ProposalResult.Reached"/> is false on any transport/parse failure.
        /// </summary>
        public static ProposalResult Propose(object elements, string? versionId, string actor,
                                             string projectKey, string? containerName = null,
                                             string? source = null, string? note = null, bool raiseBcf = true,
                                             string? failuresRequirement = null)
        {
            var r = new ProposalResult();
            var key = KeyOf(projectKey);
            if (key.Length == 0) { r.Error = NotBoundError; return r; }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/propose";
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

                var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
                var resp = Send(GovHttp, HttpMethod.Post, url, content, cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (!resp.IsSuccessStatusCode) { r.Error = "bridge returned HTTP " + (int)resp.StatusCode; return r; }
                return ProposalResult.Parse(json);
            }
            catch (Exception ex)
            {
                // Distinguish a timeout (large model, still adjudicating) from a real connection failure.
                r.Error = ex is TaskCanceledException or OperationCanceledException
                    ? "timed out after 120s (model may be very large)"
                    : ex.InnerException?.Message ?? ex.Message;
            }
            return r;
        }

        /// <summary>
        /// Register a Revit publish as a new file version and return its id (or null if unreachable) — the
        /// blocking counterpart to <see cref="FileVersion"/>, used by Governed Publish so it can stamp the
        /// verdict badge onto the exact version it just created. <c>POST /cde/:key/files</c> → the new version's id.
        /// </summary>
        public static string? RegisterVersionId(string modelName, long bytes, string author, string projectKey, string? notes = null)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0) return null;
            try
            {
                var name = modelName.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelName : modelName + ".ifc";
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/files";
                var body = new { name, author, size_bytes = bytes, notes = notes ?? "published from Revit (Governed Publish)" };
                var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
                var resp = Send(GovHttp, HttpMethod.Post, url, content, cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (!resp.IsSuccessStatusCode) return null;

                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("version", out var ver) && ver.TryGetProperty("id", out var id))
                    return id.GetString();
            }
            catch { /* unreachable */ }
            return null;
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

        /// <summary>Post a scan report to <c>POST /cde/{key}/office/scan</c> (the Phase-3 seam). Fire-and-forget,
        /// at most one per minute per process — sync storms must not become request storms. An empty key posts
        /// nothing (App.OnSynchronized already skips unbound documents; this keeps the rule for any other caller).</summary>
        public static void OfficeScan(Sentinel.Engine.ScanReport report, string projectKey)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0) return;
            var now = DateTime.UtcNow;
            if (now - _lastScanPost < ScanThrottle) return;
            _lastScanPost = now;
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/office/scan";
                var content = new StringContent(ScanReportDto.From(report).ToJson(), Encoding.UTF8, "application/json");
                var msg = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
                if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                    msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                _ = Http.SendAsync(msg).ContinueWith(t => { _ = t.Exception; msg.Dispose(); }, TaskScheduler.Default);
            }
            catch { /* never throw into Revit */ }
        }

        /// <summary>POST a governed event to <c>{ServiceUrl}/cde/{key}{path}</c>; fire-and-forget, never throws.
        /// An empty key posts nothing and says so in the Doctor log — never a silent "default".</summary>
        private static void Post(string path, object payload, string projectKey)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0)
            {
                App.PanelVm?.LogDoctor($"Not recorded on the web ({path.TrimStart('/')}): {NotBoundError}.");
                return;
            }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + path;
                var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                var msg = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
                if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                    msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                // observe the task's exception so a failed POST never surfaces as an unobserved exception
                _ = Http.SendAsync(msg).ContinueWith(t => { _ = t.Exception; msg.Dispose(); }, TaskScheduler.Default);
            }
            catch { /* never throw into Revit */ }
        }
    }
}
