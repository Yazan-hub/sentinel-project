using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using Sentinel.Commands; // BcfConfig (bridge URL + service token)
using Sentinel.Engine;   // ArtefactCache

namespace Sentinel.Coordination
{
    /// <summary>A standard in force for a document's project, with where it came from. <see cref="Label"/> is what
    /// every judge prints: "ruleset@1 · office · fb8f9baefa9f…" (the bridge's refLabel), + " (cached HH:mm)" when
    /// the bridge could not confirm it, or "none — &lt;reason&gt;". A none never scores, passes or publishes green.</summary>
    public sealed class ResolvedArtefact
    {
        public string Kind = "";
        public string? Ref, Source, Sha256, BodyJson;
        public string Origin = "none"; // bridge | cache | none
        public string? Reason;
        public bool NotInstalled;       // none because the bridge said 404 not_installed (nothing on the project or its office)
        public DateTime? FetchedAt;     // UTC; set for bridge and cache
        public string Label = "";
    }

    /// <summary>
    /// Revit's reader of the project's standards: <c>GET /cde/:key/artefacts/:kind</c> (project → office on the
    /// bridge), with an ETag round-trip against the machine cache. 200 → cache it; 304 → the cached copy is current;
    /// 404 not_installed / no_project → none (and the stale copy is cleared); any other answer or no answer → the
    /// cached copy labelled "cached", else none. Blocking (4 s cap) and never throws — callers run it OFF the Revit
    /// UI thread and hand the result back to the API thread.
    /// </summary>
    public static class ArtefactClient
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };

        public static ResolvedArtefact Resolve(string key, string kind)
        {
            BcfConfig cfg;
            try { cfg = BcfConfig.Load(); }
            catch (Exception e) { return None(kind, "the bridge settings could not be read (" + e.Message + ")"); }
            return Resolve(key, kind, cfg.ServiceUrl, cfg.ServiceToken);
        }

        /// <summary>As <see cref="Resolve(string,string)"/> against an explicit bridge (the harness's fake one).</summary>
        internal static ResolvedArtefact Resolve(string key, string kind, string serviceUrl, string token)
        {
            key = (key ?? "").Trim();
            kind = (kind ?? "").Trim();
            if (key.Length == 0) return None(kind, "not bound — Sentinel ▸ Project Setup");
            var cached = ArtefactCache.Read(key, kind);
            try
            {
                using var msg = new HttpRequestMessage(HttpMethod.Get,
                    (serviceUrl ?? "").TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/artefacts/" + Uri.EscapeDataString(kind));
                if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                if (cached != null) msg.Headers.TryAddWithoutValidation("If-None-Match", ETagFor(cached.Ref, cached.Source, cached.Sha256));
                using var resp = Http.SendAsync(msg).GetAwaiter().GetResult();
                var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                return Interpret(key, kind, (int)resp.StatusCode, text, cached, DateTime.UtcNow);
            }
            catch (Exception e)
            {
                var why = e is TaskCanceledException or OperationCanceledException ? "timed out after 4 s" : (e.InnerException?.Message ?? e.Message);
                return Fallback(kind, cached, "bridge unreachable", why);
            }
        }

        /// <summary>The bridge's answer → the artefact in force, updating the cache. Pure but for the cache writes.</summary>
        internal static ResolvedArtefact Interpret(string key, string kind, int status, string body, CachedArtefact? cached, DateTime nowUtc)
        {
            if (status == 304)
            {
                if (cached == null) return None(kind, "the bridge answered 304 but there is no cached copy");
                cached.FetchedAt = nowUtc; // confirmed current now
                ArtefactCache.Write(key, kind, cached);
                return From(kind, cached, "bridge");
            }
            string? message = null, reason = null;
            JsonDocument? doc = null;
            try { doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body); } catch (Exception) { /* not JSON */ }
            using (doc)
            {
                var root = doc?.RootElement ?? default;
                string? S(string n) => root.ValueKind == JsonValueKind.Object && root.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
                message = S("message");
                reason = S("reason");
                if (status == 200)
                {
                    string? r = S("ref"), src = S("source"), sha = S("sha256");
                    if (string.IsNullOrEmpty(r) || string.IsNullOrEmpty(src) || string.IsNullOrEmpty(sha)
                        || !root.TryGetProperty("body", out var b) || b.ValueKind != JsonValueKind.Object)
                        return Fallback(kind, cached, "the bridge answered 200 without ref, source, sha256 and body", null);
                    var fresh = new CachedArtefact { Kind = kind, Ref = r!, Source = src!, Sha256 = sha!, BodyJson = b.GetRawText(), FetchedAt = nowUtc };
                    ArtefactCache.Write(key, kind, fresh);
                    return From(kind, fresh, "bridge");
                }
            }
            if (status == 404 && reason == "not_installed")
            {
                ArtefactCache.Clear(key, kind);
                var none = None(kind, $"not installed for {key} or its office");
                none.NotInstalled = true;
                return none;
            }
            if (status == 404 && reason == "no_project")
            {
                ArtefactCache.Clear(key, kind);
                return None(kind, $"no project {key} on the bridge");
            }
            if (status == 404 && reason == "unknown_kind") return None(kind, $"the bridge does not know the kind '{kind}'");
            return Fallback(kind, cached, $"the bridge answered HTTP {status}", message);
        }

        /// <summary>The ETag the bridge sends for an artefact: <c>"&lt;ref&gt;:&lt;source&gt;:&lt;sha256&gt;"</c>, quotes
        /// included (source inside, so a move from office to project is a change).</summary>
        public static string ETagFor(string @ref, string source, string sha256) => "\"" + @ref + ":" + source + ":" + sha256 + "\"";

        /// <summary>The bridge's refLabel, ported: "ruleset@1 · office · fb8f9baefa9f…"; "none" when all are empty.</summary>
        public static string RefLabel(string? @ref, string? source, string? sha256)
        {
            var parts = new[] { @ref, source, string.IsNullOrEmpty(sha256) ? null : sha256!.Substring(0, Math.Min(12, sha256.Length)) + "…" }
                .Where(p => !string.IsNullOrEmpty(p)).ToArray();
            return parts.Length == 0 ? "none" : string.Join(" · ", parts);
        }

        private static ResolvedArtefact From(string kind, CachedArtefact a, string origin, string? reason = null) => new ResolvedArtefact
        {
            Kind = kind, Ref = a.Ref, Source = a.Source, Sha256 = a.Sha256, BodyJson = a.BodyJson,
            Origin = origin, Reason = reason, FetchedAt = a.FetchedAt,
            Label = RefLabel(a.Ref, a.Source, a.Sha256) + (origin == "cache" ? $" (cached {a.FetchedAt.ToLocalTime():HH:mm})" : ""),
        };

        // No confirmation from the bridge: the cached copy says so, else none.
        private static ResolvedArtefact Fallback(string kind, CachedArtefact? cached, string what, string? detail) =>
            cached != null
                ? From(kind, cached, "cache", $"{what} — cached {cached.FetchedAt.ToLocalTime():HH:mm}")
                : None(kind, what + (string.IsNullOrEmpty(detail) ? "" : " (" + detail + ")"));

        /// <summary>The explicit none for <paramref name="kind"/>: its label is what every surface prints
        /// ("none — &lt;reason&gt;"). Public so a loader can refuse a body it cannot use (DeliveryContract.Load).</summary>
        public static ResolvedArtefact None(string kind, string reason) =>
            new ResolvedArtefact { Kind = kind, Origin = "none", Reason = reason, Label = "none — " + reason };
    }
}
