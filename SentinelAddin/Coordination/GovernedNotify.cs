using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Sentinel.Commands; // BcfConfig (bridge URL + platform project id)

namespace Sentinel.Coordination
{
    /// <summary>
    /// Fire-and-forget notifications from Revit INTO the web app's governed layer (bridge <c>/cde/...</c>).
    /// This is the compatibility bridge between authoring (Revit) and the referee layer (Sentinel web): it
    /// records what Revit did in the project's immutable, hash-chained audit trail, so the CDE timeline shows
    /// authoring events alongside coordination + governance. It NEVER throws and NEVER blocks the Revit save
    /// flow — an absent or slow bridge is a silent no-op. Uses the same <see cref="BcfConfig"/> (ServiceUrl +
    /// ProjectId) as the BCF sync, so it's zero extra configuration.
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

        /// <summary>Record a "model published from Revit" event in the governed audit trail.</summary>
        public static void ModelPublished(string modelName, long bytes)
        {
            Post("/audit", new
            {
                entity_type = "model",
                actor = "Revit",
                action = "Model published from Revit: " + modelName,
                new_value = new { model = modelName, kb = bytes / 1024, source = "revit", at = DateTime.UtcNow.ToString("o") },
            });
        }

        /// <summary>
        /// Register a Revit publish as a new version in the web app's file-version history (migration 0011,
        /// <c>POST /cde/:key/files</c>). The model's title is the file key, so repeated publishes append
        /// v1 → v2 → … and the newest becomes the live version — the same version timeline a web upload feeds.
        /// Fire-and-forget; a bridge without the CDE configured just no-ops (503).
        /// </summary>
        public static void FileVersion(string modelName, long bytes)
        {
            var name = modelName.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelName : modelName + ".ifc";
            Post("/files", new
            {
                name,
                author = "Revit",
                size_bytes = bytes,
                notes = "published from Revit",
            });
        }

        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) in the governed audit trail, so the web CDE timeline
        /// shows the pass/fail certificate that decided whether a deliverable was fit for upload — the same
        /// gate the web app enforces via IDS, now sourced from Revit. <paramref name="sha256"/> ties the
        /// verdict to the exact bytes that were certified (provenance).
        /// </summary>
        public static void DeliveryGate(string fileName, bool passed, string contractKey, string schema,
                                        int totalEntities, int failureCount, string sha256)
        {
            Post("/audit", new
            {
                entity_type = "delivery_gate",
                actor = "Revit",
                action = "IFC delivery gate " + (passed ? "PASS" : "FAIL") + ": " + fileName,
                new_value = new
                {
                    file = fileName,
                    passed,
                    contract = contractKey,
                    schema,
                    entities = totalEntities,
                    failures = failureCount,
                    sha256,
                    source = "revit",
                    at = DateTime.UtcNow.ToString("o"),
                },
            });
        }

        /// <summary>The parsed result of a governed proposal (see <see cref="Propose"/>).</summary>
        public sealed class ProposalResult
        {
            public bool Reached;                       // false ⇒ bridge/CDE unreachable (caller falls back)
            public string Verdict = "recorded";        // accepted | rejected | recorded (no IDS)
            public int InScope, Passing, Failing;
            public int BcfRaised;                      // issues auto-opened on a reject (bridge G2)
            public List<string> Failures = new();      // "<requirement>: <reason>", capped for the dialog
            public string? Error;                      // why Reached is false (timeout / refused / status), for the dialog
            public bool? NamingOk;                     // null = name not checked; false = container name failed the ISO 19650 gate
            public List<string> NamingFailures = new();// "<field>: <reason>", for the dialog
        }

        /// <summary>
        /// The referee call: POST the extracted <paramref name="elements"/> (+ optional JSON <paramref name="idsSpec"/>)
        /// to <c>/cde/:key/propose</c> and return the deterministic verdict. When <paramref name="versionId"/> is
        /// set, the bridge also stamps the verdict onto that file version (the web verdict badge, G3); on a reject
        /// it auto-opens a BCF issue per failing requirement (G2). Blocking (~6s cap) so the caller can branch on
        /// the verdict — this is the one place Revit needs the answer, not fire-and-forget. Never throws:
        /// <see cref="ProposalResult.Reached"/> is false on any transport/parse failure.
        /// </summary>
        public static ProposalResult Propose(object elements, object? idsSpec, string? versionId, string actor, string? containerName = null)
        {
            var r = new ProposalResult();
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(cfg.ProjectId) + "/propose";
                var body = new Dictionary<string, object?>
                {
                    ["source"] = "Governed Publish",
                    ["actor"] = actor,
                    ["elements"] = elements,
                };
                if (idsSpec != null) body["ids"] = idsSpec;
                if (versionId != null) body["version_id"] = versionId;
                if (containerName != null) body["container_name"] = containerName; // ISO 19650 naming gate

                var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
                var resp = Send(GovHttp, HttpMethod.Post, url, content, cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (!resp.IsSuccessStatusCode) { r.Error = "bridge returned HTTP " + (int)resp.StatusCode; return r; }

                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                r.Reached = true;
                r.Verdict = root.TryGetProperty("verdict", out var v) ? v.GetString() ?? "recorded" : "recorded";
                if (root.TryGetProperty("summary", out var s))
                {
                    if (s.TryGetProperty("in_scope", out var i) && i.TryGetInt32(out var iv)) r.InScope = iv;
                    if (s.TryGetProperty("passing", out var p) && p.TryGetInt32(out var pv)) r.Passing = pv;
                    if (s.TryGetProperty("failing", out var f) && f.TryGetInt32(out var fv)) r.Failing = fv;
                }
                if (root.TryGetProperty("bcf", out var b) && b.TryGetProperty("raised", out var br) && br.TryGetInt32(out var brv))
                    r.BcfRaised = brv;
                if (root.TryGetProperty("failures", out var fl) && fl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var it in fl.EnumerateArray())
                    {
                        if (r.Failures.Count >= 12) break;
                        var req = it.TryGetProperty("requirement", out var rq) ? rq.GetString() : null;
                        var reason = it.TryGetProperty("reason", out var rs) ? rs.GetString() : null;
                        r.Failures.Add((req ?? "requirement") + ": " + (reason ?? "failed"));
                    }
                }
                if (root.TryGetProperty("naming", out var nm) && nm.ValueKind == JsonValueKind.Object)
                {
                    r.NamingOk = nm.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True;
                    if (nm.TryGetProperty("failures", out var nf) && nf.ValueKind == JsonValueKind.Array)
                        foreach (var it in nf.EnumerateArray())
                        {
                            if (r.NamingFailures.Count >= 12) break;
                            r.NamingFailures.Add(it.TryGetProperty("reason", out var rn) ? rn.GetString() ?? "invalid" : "invalid");
                        }
                }
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
        public static string? RegisterVersionId(string modelName, long bytes, string author, string? notes = null)
        {
            try
            {
                var name = modelName.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelName : modelName + ".ifc";
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(cfg.ProjectId) + "/files";
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

        /// <summary>POST a governed event to <c>{ServiceUrl}/cde/{ProjectId}{path}</c>; fire-and-forget, never throws.</summary>
        private static void Post(string path, object payload)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(cfg.ProjectId) + path;
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
