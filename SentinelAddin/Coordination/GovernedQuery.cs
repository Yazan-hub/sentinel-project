using System;
using System.Net.Http;
using System.Text.Json;
using Sentinel.Commands; // BcfConfig (bridge URL + platform project id)

namespace Sentinel.Coordination
{
    /// <summary>
    /// Read side of the governed layer: a short, blocking GET the Revit UI can call to learn a model's current
    /// state in the web CDE before it acts (e.g. show "this model is at v3 · published" before a publish adds
    /// v4). The counterpart to the fire-and-forget <see cref="GovernedNotify"/>. NEVER throws — any failure
    /// (bridge down, CDE not configured, model not yet versioned) returns null and the caller just omits the
    /// governance line. Uses the same <see cref="BcfConfig"/>, so it's zero extra configuration.
    /// </summary>
    internal static class GovernedQuery
    {
        // Short timeout: this runs on the UI thread of a manual command, so a slow/absent bridge can't hang Revit.
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };

        /// <summary>The live version of a model file in the web CDE, or null if unknown/unreachable.</summary>
        public sealed class LiveInfo
        {
            public string Revision = "";
            public string State = "";
            public int VersionCount;
        }

        /// <summary>
        /// Look up the live file version + ISO 19650 state for <paramref name="modelTitle"/> (matched to the
        /// same "&lt;title&gt;.ifc" key <see cref="GovernedNotify.FileVersion"/> writes). Blocking, ~4s cap,
        /// returns null on any problem.
        /// </summary>
        public static LiveInfo LiveVersion(string modelTitle)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var name = modelTitle.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelTitle : modelTitle + ".ifc";
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(cfg.ProjectId) + "/files";
                var json = Http.GetStringAsync(url).GetAwaiter().GetResult();

                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != JsonValueKind.Array) return null;
                foreach (var file in doc.RootElement.EnumerateArray())
                {
                    if (!file.TryGetProperty("iso_name", out var iso) || !string.Equals(iso.GetString(), name, StringComparison.OrdinalIgnoreCase))
                        continue;
                    var count = file.TryGetProperty("version_count", out var vc) && vc.TryGetInt32(out var n) ? n : 0;
                    if (!file.TryGetProperty("versions", out var versions) || versions.ValueKind != JsonValueKind.Array) return null;
                    foreach (var v in versions.EnumerateArray())
                    {
                        if (v.TryGetProperty("is_live", out var live) && live.ValueKind == JsonValueKind.True)
                        {
                            return new LiveInfo
                            {
                                Revision = v.TryGetProperty("revision", out var r) ? r.GetString() ?? "" : "",
                                State = v.TryGetProperty("state", out var s) ? s.GetString() ?? "" : "",
                                VersionCount = count,
                            };
                        }
                    }
                    return null; // file exists but no live version
                }
                return null; // not versioned yet
            }
            catch { return null; } // never surface a read failure into Revit
        }
    }
}
