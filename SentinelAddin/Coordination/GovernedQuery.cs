using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using Sentinel.Commands; // BcfConfig (bridge URL + service token)

namespace Sentinel.Coordination
{
    /// <summary>
    /// Read side of the governed layer: short, blocking GETs the Revit UI calls to learn what the web project says
    /// (the journey, the Federation Gate, the clash register). The counterpart to <see cref="GovernedNotify"/>.
    /// NEVER throws — any failure (bridge down, CDE not configured) returns null and the caller says so. Uses the
    /// same <see cref="BcfConfig"/>, so it's zero extra configuration. A publish's version comes back from
    /// /propose itself (ProposalResult.Version); nothing here reads it by name.
    /// </summary>
    internal static class GovernedQuery
    {
        // Short timeout: this runs on the UI thread of a manual command, so a slow/absent bridge can't hang Revit.
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };

        /// <summary>Blocking GET that attaches the bridge auth-gate bearer (F2) when configured. Throws on a
        /// non-success status (callers already catch and return null).</summary>
        private static string GetString(string url, string token)
        {
            var msg = new HttpRequestMessage(HttpMethod.Get, url);
            if (!string.IsNullOrWhiteSpace(token))
                msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var resp = Http.SendAsync(msg).GetAwaiter().GetResult();
            resp.EnsureSuccessStatusCode();
            return resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        }

        /// <summary>
        /// One line for the Clash Manager header: the project's Federation Gate status from the web
        /// (PASS / FAIL with the failing checks / NOT CHECKABLE / NOT RUN, STALE when a live version changed).
        /// Blocking, ~4 s cap; null when the bridge is unreachable or the key is empty. The project key is the
        /// DOCUMENT's (ProjectContext), never a machine default — the cohesion review's D5.
        /// </summary>
        public static string? FederationStatus(string projectKey)
        {
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) return null;
            try
            {
                var cfg = BcfConfig.Load();
                var json = GetString(cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/federation", cfg.ServiceToken);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (!root.TryGetProperty("latest", out var latest) || latest.ValueKind != JsonValueKind.Object)
                {
                    int live = root.TryGetProperty("live_set", out var ls) && ls.ValueKind == JsonValueKind.Array ? ls.GetArrayLength() : 0;
                    return $"Federation Gate: NOT RUN — {live} live model(s) on '{key}'; run it on the web before clashing.";
                }
                var result = latest.GetProperty("result");
                var verdict = result.GetProperty("verdict").GetString() ?? "";
                var failing = new List<string>();
                foreach (var c in result.GetProperty("checks").EnumerateArray())
                    if (c.GetProperty("status").GetString() == "fail") failing.Add(c.GetProperty("id").GetString() ?? "");
                int total = 0, read = 0;
                if (result.TryGetProperty("models", out var modelsEl) && modelsEl.ValueKind == JsonValueKind.Array)
                    foreach (var m in modelsEl.EnumerateArray())
                    {
                        total++;
                        if (m.TryGetProperty("has_manifest", out var hm) && hm.ValueKind == JsonValueKind.True) read++;
                    }
                bool stale = root.TryGetProperty("stale", out var st) && st.ValueKind == JsonValueKind.True;
                var word = verdict == "pass" ? "PASS" : verdict == "fail" ? "FAIL" : "NOT CHECKABLE";
                return $"Federation Gate: {word}" + (failing.Count > 0 ? " (" + string.Join(", ", failing) + " — see the web Issues)" : "")
                     + (total > 0 && read < total ? $" · {read} of {total} read" : "")
                     + (stale ? " — STALE, a live version changed" : "") + $" on '{key}'";
            }
            catch { return null; }
        }

        /// <summary>The project's journey from the web (GET /cde/:key/journey), flattened for the pane's Next strip.</summary>
        public sealed class JourneyInfo
        {
            public string Key = "";
            public string Kind = "";
            public string StandardsLine = "";
            public string NextLine = "";
            public int Done;
            public int Total;
            public string? RulesetRef;
            public string? RulesetSource;
            public string? RulesetStandardKey;
            public string? RulesetSemver;
            public string? RulesetSha256;
            public string? RulesetLabel; // "unavailable — …" when the bridge could not read the standards
        }

        /// <summary>
        /// The Next strip: the standards in force (each label is the bridge's refLabel, "ruleset@1 · office · 3f07…",
        /// exactly as the judges print it), the next step with where it is done, and "n of m done" — counts, never a
        /// percentage. Blocking, ~4 s cap; null when the bridge is unreachable. The key is the DOCUMENT's
        /// (ProjectContext), read by the caller on the API thread.
        /// </summary>
        public static JourneyInfo? Journey(string projectKey) => Journey(projectKey, out _);

        /// <summary>As <see cref="Journey(string?)"/>, and says why it returned null: the bridge's own message on a
        /// refusal (one 404 for an unknown project key or one you are not a member of), else the transport error.</summary>
        public static JourneyInfo? Journey(string projectKey, out string? failure)
        {
            failure = null;
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) { failure = "not bound — Sentinel ▸ Project Setup"; return null; }
            try
            {
                var cfg = BcfConfig.Load();
                var msg = new HttpRequestMessage(HttpMethod.Get, cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/journey");
                if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                    msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                var resp = Http.SendAsync(msg).GetAwaiter().GetResult();
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (!resp.IsSuccessStatusCode)
                {
                    string? said = null;
                    try { using var err = JsonDocument.Parse(json); if (err.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String) said = m.GetString(); } catch { }
                    failure = $"{(int)resp.StatusCode}: {said ?? resp.ReasonPhrase}";
                    return null;
                }
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                static string? Str(JsonElement e, string name) =>
                    e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
                static JsonElement Obj(JsonElement e, string name) =>
                    e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Object ? v : default;
                int Int(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : 0;
                var standards = Obj(root, "standards");
                // The web strip's rule: the ref label when installed; the install hint only for "none"; a failed
                // read's "unavailable — …" label as is, never as an install hint.
                string Label(string kind)
                {
                    var r = Obj(standards, kind);
                    var label = Str(r, "label") ?? "unknown";
                    return Str(r, "ref") is null && label == "none" ? "none — install from Settings/Packs" : label;
                }

                int done = Int("done"), total = Int("total");
                var nextId = Str(root, "next");
                string nextLine;
                if (nextId is null)
                {
                    nextLine = $"Next: nothing left to do · {done} of {total} done"
                             + (done < total ? $" ({total - done} not checkable — see the web Guide)" : "");
                }
                else
                {
                    JsonElement step = default;
                    if (root.TryGetProperty("steps", out var steps) && steps.ValueKind == JsonValueKind.Array)
                        foreach (var s in steps.EnumerateArray())
                            if (Str(s, "id") == nextId) { step = s; break; }
                    var how = Obj(step, "how");
                    var web = Obj(how, "web");
                    var place = Str(how, "revit")
                             ?? (Str(web, "tab") is { } tab ? string.Join(" ▸ ", new[] { "web", tab, Str(web, "hint") }.Where(x => !string.IsNullOrEmpty(x))) : null)
                             ?? "no screen for this step yet";
                    var who = Str(how, "who");
                    nextLine = $"Next: {Str(step, "label") ?? nextId} — {place}"
                             + (who is null ? "" : $" ({who})")
                             + $" · {done} of {total} done";
                }

                var rs = Obj(standards, "ruleset");
                return new JourneyInfo
                {
                    Key = Str(root, "key") ?? key,
                    Kind = Str(root, "kind") ?? "",
                    StandardsLine = $"Standards in force: IDS {Label("ids")} · Rules {Label("ruleset")} · Naming {Label("naming")}",
                    NextLine = nextLine,
                    Done = done,
                    Total = total,
                    RulesetRef = Str(rs, "ref"),
                    RulesetSource = Str(rs, "source"),
                    RulesetStandardKey = Str(rs, "standard_key"),
                    RulesetSemver = Str(rs, "semver"),
                    RulesetSha256 = Str(rs, "sha256"),
                    RulesetLabel = Str(rs, "label"),
                };
            }
            catch (Exception e) { failure = e.Message; return null; } // never surface a read failure into Revit
        }

        /// <summary>
        /// Which ruleset judged the pane's rows — the document's own ruleset@n as resolved when it was loaded
        /// (its label says "cached" when the bridge was not reached) — against what the journey says is in force
        /// now. Same artefact = ref, source and sha all equal; then the line is just "Judged by &lt;refLabel&gt;".
        /// Pure (no I/O).
        /// </summary>
        public static string ScanRulesetLine(ResolvedArtefact local, JourneyInfo? j)
        {
            var head = "Judged by " + local.Label;
            if (j is null) return head + " — the project's ruleset now is unknown (journey unavailable)";
            if (string.IsNullOrEmpty(j.RulesetRef))
            {
                if (j.RulesetLabel is { } l && l != "none") return head + " — the project's ruleset is " + l; // a failed read is not "nothing installed"
                return local.Ref is null ? head + " — nothing is scored" : head + " — but the project now has no ruleset installed (Scan Now reloads)";
            }
            if (local.Ref == j.RulesetRef && local.Source == j.RulesetSource && local.Sha256 == j.RulesetSha256) return head;
            return head + $" — the project now has {j.RulesetLabel ?? j.RulesetRef} (Scan Now reloads)";
        }

        /// <summary>One project's ledger rows of one entity_type, as far as they were read (the ROI dashboard's read).</summary>
        public sealed class RoiPage
        {
            public readonly List<JsonElement> Rows = new List<JsonElement>(); // each Clone()d: the parsed documents are disposed
            public int Total;      // the route's exact count of rows of this kind
            public bool Truncated; // Total > Rows.Count: the newest were read, the ledger holds more
        }

        /// <summary>The audit route's AUDIT_MAX per page, and how many pages are read before the dashboard says the ledger holds more.</summary>
        public const int RoiPageSize = 1000, RoiPages = 5;

        /// <summary>
        /// The project's ledger rows of one entity_type, newest first, through the filtered audit route
        /// (GET /cde/:key/audit?entity_type=&lt;t&gt;&amp;limit=1000&amp;offset=&lt;k·1000&gt;), up to <see cref="RoiPages"/> pages;
        /// <c>Truncated</c> when the route's exact total exceeds what was read. Null when the bridge could not be read,
        /// with why (the bridge's own message on a refusal, else the transport error) — a failed read is never "0 rows".
        /// BLOCKING, each GET ≤ 4 s; callers run it OFF the API thread. The key is the DOCUMENT's (ProjectContext).
        /// </summary>
        public static RoiPage? RoiRows(string projectKey, string entityType, out string? failure)
        {
            failure = null;
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) { failure = "not bound — Sentinel ▸ Project Setup"; return null; }
            try
            {
                var cfg = BcfConfig.Load();
                var page = new RoiPage();
                for (int i = 0; i < RoiPages; i++)
                {
                    var msg = new HttpRequestMessage(HttpMethod.Get, cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key)
                        + "/audit?entity_type=" + Uri.EscapeDataString(entityType) + "&limit=" + RoiPageSize + "&offset=" + (i * RoiPageSize));
                    if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                        msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                    var resp = Http.SendAsync(msg).GetAwaiter().GetResult();
                    var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    if (!resp.IsSuccessStatusCode)
                    {
                        string? said = null;
                        try { using var err = JsonDocument.Parse(json); if (err.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String) said = m.GetString(); } catch { }
                        failure = $"{(int)resp.StatusCode}: {said ?? resp.ReasonPhrase}";
                        return null;
                    }
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    page.Total = root.TryGetProperty("total", out var t) && t.ValueKind == JsonValueKind.Number && t.TryGetInt32(out var n) ? n : 0;
                    int got = 0;
                    if (root.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array)
                        foreach (var r in rows.EnumerateArray()) { page.Rows.Add(r.Clone()); got++; }
                    if (got < RoiPageSize || page.Rows.Count >= page.Total) break; // the last page
                }
                page.Truncated = page.Total > page.Rows.Count;
                return page;
            }
            catch (Exception e) { failure = e.Message; return null; } // never surface a read failure into Revit
        }

        /// <summary>One recorded clash from the web-side team register (GET /clash/:project).</summary>
        public sealed class ClashRow
        {
            public string Label = "";
            public string Status = "";
            public double Volume;
        }

        /// <summary>
        /// Read the team-wide clash register recorded on the web (status lifecycle raised → reviewed → approved
        /// → resolved, raise-time volume). Returns the list (possibly empty) when reachable, or null when the
        /// bridge/CDE can't be reached — so the caller can tell "no clashes" from "offline". Blocking, ~4s cap.
        /// The register is keyed by the web project, the same key the web clash panel writes under (the document's
        /// key, from ProjectContext); an empty key returns null.
        /// </summary>
        public static List<ClashRow>? ClashRegister(string projectKey)
        {
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) return null;
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/clash/" + Uri.EscapeDataString(key);
                var json = GetString(url, cfg.ServiceToken);

                using var doc = JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
                    return new List<ClashRow>();
                var rows = new List<ClashRow>();
                foreach (var it in items.EnumerateArray())
                {
                    rows.Add(new ClashRow
                    {
                        Label = it.TryGetProperty("label", out var l) && l.ValueKind == JsonValueKind.String && l.GetString() is { Length: > 0 } lbl
                            ? lbl
                            : (it.TryGetProperty("signature", out var s) ? s.GetString() ?? "" : ""),
                        Status = it.TryGetProperty("status", out var st) ? st.GetString() ?? "" : "",
                        Volume = it.TryGetProperty("volume", out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var vd) ? vd : 0,
                    });
                }
                return rows;
            }
            catch { return null; } // unreachable — caller shows a "bridge not reachable" note
        }
    }
}
