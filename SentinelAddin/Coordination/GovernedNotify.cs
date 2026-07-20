using System;
using System.Net.Http;
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

        /// <summary>POST a governed event to <c>{ServiceUrl}/cde/{ProjectId}{path}</c>; fire-and-forget, never throws.</summary>
        private static void Post(string path, object payload)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(cfg.ProjectId) + path;
                var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                // observe the task's exception so a failed POST never surfaces as an unobserved exception
                _ = Http.PostAsync(url, content).ContinueWith(t => { _ = t.Exception; }, TaskScheduler.Default);
            }
            catch { /* never throw into Revit */ }
        }
    }
}
