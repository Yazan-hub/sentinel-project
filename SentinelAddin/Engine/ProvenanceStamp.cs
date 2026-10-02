#nullable disable
// MA-0: the provenance stamp (design §6.4) — an Extensible Storage entity on every element Sentinel placed or changed. One
// entity per element per schema, so a write MERGES the element's own earlier stamp: changeset_id and source are the latest
// writer's, proposal_guids and changeset_ids every changeset that touched the element (oldest first), and
// unique_id_at_placement stays the first placement's. Written inside the placer's own transaction (Ctrl+Z removes it too).
// The JSON is pure (tools/promote-check); SENTINEL_CHECK hides the Revit half, the DocPin pattern. A stamp whose
// unique_id_at_placement is not its element's is a copy's: it is not this element's history, is not merged, and reads
// "copied, not placed by Sentinel".
// MA-1a item 4 (v2): the full stamp — layer, rule, source_sha256, approver, ledger_row, placed_at — written by every placer:
// the changeset executor (agents, Promote, Ghost Builder), Datum from Drawings and Photo Massing (no changeset: changeset_id
// null, no ledger row of their own: item 7 reports each run as one row after its commit). layer and source_sha256 keep an earlier write's value when the latest writer has none
// (a Promote retype keeps the Ghost wall's drawing); rule, approver, ledger_row and placed_at are the latest writer's.
// Describe is what Model from Drawings ▸ 5 · Provenance shows.
// Review amendments (binding). C1: the Facts come from the in-process placer only, never from a changeset the bridge
// returned, and Describe prints one line per field (a line break inside a value becomes a space). C2: with no rule of the
// placer's own, the rule is the element's own reason (Facts.Reason), marked rule_is_reason, and Describe labels it "Reason
// given by the proposer (<source>)" — it never reads as an office rule.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.ExtensibleStorage;
using Sentinel.Coordination;
#endif

namespace Sentinel.Engine
{
    public static class ProvenanceStamp
    {
        /// <summary>MA-1a item 4: what a placer knows about an element beyond its changeset. Every field may be null.</summary>
        public sealed class Facts
        {
            /// <summary>The CAD layer it was read from (Ghost Builder, Datum).</summary>
            public string Layer;
            /// <summary>What decided it, in words (the rule or pick that typed it) — the in-process placer's own.</summary>
            public string Rule;
            /// <summary>C2: the element's own reason as its proposer gave it (a changeset element's reason: Promote's DD rule
            /// text, an agent's stated reason). It is the stamp's rule only when <see cref="Rule"/> is empty, and is marked so.</summary>
            public string Reason;
            /// <summary>The sha256 (64 hex) of the source file it was read from, when Sentinel read that file.</summary>
            public string SourceSha256;
            /// <summary>The changeset's proposal row on the project ledger (adjudication.audit_id).</summary>
            public string LedgerRow;
        }

        /// <summary>C1 + C2: the Facts one element of a changeset is stamped with. Layer, rule and source file come from
        /// <paramref name="callers"/> only — what the in-process caller of the executor knows, by proposal_guid (null = none) —
        /// so this takes no changeset element: a provenance the bridge returned cannot reach a stamp. The reason is the
        /// element's own (<paramref name="touched"/>: each proposal of the changeset that touched it, with its reason). Pure.</summary>
        public static Facts ForChangeset(IReadOnlyDictionary<string, Facts> callers, IEnumerable<(string Guid, string Reason)> touched, string ledgerRow)
        {
            var all = (touched ?? Enumerable.Empty<(string Guid, string Reason)>()).ToList();
            var own = callers == null ? null : all.Select(x => x.Guid != null && callers.TryGetValue(x.Guid, out var f) ? f : null).FirstOrDefault(f => f != null);
            return new Facts
            {
                Layer = own?.Layer, Rule = own?.Rule, SourceSha256 = own?.SourceSha256, LedgerRow = ledgerRow,
                Reason = string.Join("; ", all.Select(x => x.Reason).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct()),
            };
        }

        /// <summary>The stored value, merged onto <paramref name="prior"/> (the element's stamp now, or null). Pure.</summary>
        public static string Json(string changesetId, string source, IEnumerable<string> proposalGuids, string uniqueId, string prior = null,
                                  Facts facts = null, string approver = null, string placedAt = null)
        {
            var ids = new List<string>();
            var guids = new List<string>();
            string layer = null, sha = null;
            try
            {
                using var d = JsonDocument.Parse(prior ?? "null");
                var r = d.RootElement;
                if (r.ValueKind == JsonValueKind.Object && Str(r, "unique_id_at_placement") == uniqueId)
                {
                    if (r.TryGetProperty("changeset_ids", out var a) && a.ValueKind == JsonValueKind.Array) ids.AddRange(a.EnumerateArray().Select(x => x.ToString()));
                    else if (Str(r, "changeset_id") is string one) ids.Add(one);
                    if (r.TryGetProperty("proposal_guids", out var g) && g.ValueKind == JsonValueKind.Array) guids.AddRange(g.EnumerateArray().Select(x => x.ToString()));
                    layer = Str(r, "layer");
                    sha = Str(r, "source_sha256");
                }
            }
            catch (Exception) { /* not a stamp: start afresh */ }
            if (changesetId != null && !ids.Contains(changesetId)) ids.Add(changesetId); // Datum and Massing file no changeset
            guids.AddRange((proposalGuids ?? Enumerable.Empty<string>()).Where(x => !guids.Contains(x)));
            // C2: the placer's own rule, else the element's own reason — marked, so the reader never shows it as an office rule.
            var rule = string.IsNullOrWhiteSpace(facts?.Rule) ? null : facts.Rule;
            var reason = rule != null || string.IsNullOrWhiteSpace(facts?.Reason) ? null : facts.Reason;
            return JsonSerializer.Serialize(new
            {
                v = 2,
                changeset_id = changesetId,
                source,
                proposal_guids = guids,
                unique_id_at_placement = uniqueId,
                changeset_ids = ids,
                layer = facts?.Layer ?? layer,
                rule = rule ?? reason,
                rule_is_reason = reason != null,
                source_sha256 = facts?.SourceSha256 ?? sha,
                approver,
                ledger_row = facts?.LedgerRow,
                placed_at = placedAt,
            });
        }

        /// <summary>The source of the changeset that last stamped (e.g. "promote"), or null. Pure; never throws.</summary>
        public static string SourceOf(string json)
        {
            try { using var d = JsonDocument.Parse(json ?? "null"); return d.RootElement.ValueKind == JsonValueKind.Object ? Str(d.RootElement, "source") : null; }
            catch (Exception) { return null; }
        }

        /// <summary>MA-1a item 4: the stamp in words for a person, or why there is none — one line per field (C1). A stamp whose
        /// unique_id_at_placement is not <paramref name="uniqueId"/> came with a copy: "copied, not placed by Sentinel" (design
        /// §6.4). A rule that is the proposer's own reason is labelled so (C2). Pure; never throws.</summary>
        public static string Describe(string json, string uniqueId)
        {
            if (string.IsNullOrWhiteSpace(json)) return "No Sentinel provenance stamp — Sentinel did not place or change this element.";
            try
            {
                using var d = JsonDocument.Parse(json);
                var r = d.RootElement;
                if (r.ValueKind != JsonValueKind.Object) return "This element's Sentinel stamp cannot be read.";
                bool v1 = !(r.TryGetProperty("v", out var v) && v.ValueKind == JsonValueKind.Number && v.GetInt32() >= 2);
                string S(string name) => OneLine(Str(r, name));
                string Or(string name, string none) => S(name) is string s && s.Length > 0 ? s : v1 ? "not recorded (a stamp from before MA-1a item 4)" : none;
                var placedBy = Str(r, "unique_id_at_placement");
                var source = S("source") ?? "unknown";
                var approver = Or("approver", "not recorded");
                var row = S("ledger_row");
                var at = S("placed_at");
                bool reason = r.TryGetProperty("rule_is_reason", out var ir) && ir.ValueKind == JsonValueKind.True;
                int n = r.TryGetProperty("changeset_ids", out var ids) && ids.ValueKind == JsonValueKind.Array ? ids.GetArrayLength() : 0;
                // Final review: the proposer's own reason (up to 500 characters of their text) is printed last and in quotes, so
                // nothing it says — however it wraps in the dialog — stands above or between the stamp's own lines.
                return string.Join("\n", new[]
                {
                    placedBy == uniqueId ? "Placed or changed by Sentinel."
                        : $"Copied, not placed by Sentinel — this stamp came with a copy of element {OneLine(placedBy) ?? "(unknown)"}; the lines below are that element's record, not this one's.",
                    "Source: " + source,
                    "Source file sha256: " + Groups8(Or("source_sha256", "none recorded — Sentinel read no file for it (an agent's proposal, or a drawing already imported in the model)")),
                    "Layer: " + Or("layer", "none — not read from a drawing layer"),
                    reason ? null : "Rule: " + Or("rule", "not recorded"),
                    "Approver: " + approver + (approver.StartsWith("unsigned", StringComparison.Ordinal) ? " (not signed in — Standards ▸ Sign in names you)" : ""),
                    "Ledger row: " + (row != null ? "#" + row + " — the proposal row its changeset was filed with"
                                      : v1 ? "not recorded (a stamp from before MA-1a item 4)" : "none — not on a project ledger row of its own (an unbound model's local changeset, Datum or Photo Massing; since MA-1a item 7 a bound run is reported as one datum or massing row — the pane's log said whether the ledger recorded it)"),
                    "Placed at: " + (at != null ? at + " (UTC, this PC's clock)" : v1 ? "not recorded (a stamp from before MA-1a item 4)" : "not recorded"),
                    "Changeset: " + (S("changeset_id") ?? "none") + (n > 1 ? $" (the latest of {n} that touched it)" : ""),
                    reason ? $"Reason given by the proposer ({source}): \"{Or("rule", "not recorded")}\"" : null,
                }.Where(line => line != null));
            }
            catch (Exception) { return "This element's Sentinel stamp cannot be read."; }
        }

        // C1: one line per field. A line break — a control character (Cc) or a Unicode line or paragraph separator (Zl, Zp) —
        // inside a value becomes one space, so a value can never pass for another line of the stamp ("…\nApprover: someone").
        // Final review: so does every run of spaces of any kind (Zs: ordinary, no-break, em …) — padding cannot push a value's
        // tail onto a line of its own where the dialog wraps.
        private static string OneLine(string s) => s == null ? null : Regex.Replace(s, @"[\p{Cc}\p{Z}]+", " ").Trim();

        // Drill MA1a-I35: the dialog clipped the 64 digits, one unbreakable word, to "…", so nobody could compare the hash.
        // A sha256 is shown in groups of 8, which wrap; any other text (the "none recorded" words) is left as it is.
        private static string Groups8(string s) => s != null && Regex.IsMatch(s, "^[0-9a-f]{64}$") ? Regex.Replace(s, ".{8}(?!$)", "$0 ") : s;

        /// <summary>MA-1a item 4: a file's sha256 (64 lowercase hex), or null when it cannot be read. Never throws.</summary>
        public static string FileSha256(string path)
        {
            try
            {
                using var sha = SHA256.Create();
                using var fs = File.OpenRead(path);
                return Hex(sha.ComputeHash(fs));
            }
            catch (Exception) { return null; }
        }

        /// <summary>MA-1a item 4 (founder decision F6): one sha256 over several files (Photo Massing's images) — the sha256 of
        /// their "sha256  name" lines sorted by name, as sha256sum prints them; two files of one name (Massing reads subfolders
        /// too) sort by their sha, so the answer never depends on the order read. Null when there is none or one cannot be read.</summary>
        public static string FilesSha256(IEnumerable<string> paths)
        {
            var files = (paths ?? Enumerable.Empty<string>()).Select(p => (Name: Path.GetFileName(p), Sha: FileSha256(p))).ToList();
            if (files.Count == 0 || files.Any(f => f.Sha == null)) return null;
            var lines = files.OrderBy(f => f.Name, StringComparer.Ordinal).ThenBy(f => f.Sha, StringComparer.Ordinal).Select(f => f.Sha + "  " + f.Name);
            using var sha = SHA256.Create();
            return Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(string.Join("\n", lines) + "\n")));
        }

        private static string Hex(byte[] b) => BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();

        /// <summary>The time a stamp records: UTC, to the second, from this PC's clock.</summary>
        public static string Now() => DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

        private static string Str(JsonElement o, string name) =>
            o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

#if !SENTINEL_CHECK
        // Fixed forever: a new Guid is a new schema, and stamps written under the old one become unreadable.
        private static readonly Guid SchemaGuid = new Guid("C25BA5C0-8AFC-47E2-A3AB-52B79ED5B1C7");
        private const string Field = "json";

        // SettingsManager's pattern. A schema name cannot hold dots, so the design's Sentinel.Provenance.v1 is written so.
        private static Schema GetSchema()
        {
            var existing = Schema.Lookup(SchemaGuid);
            if (existing != null) return existing;
            var b = new SchemaBuilder(SchemaGuid);
            b.SetSchemaName("SentinelProvenanceV1");
            b.SetReadAccessLevel(AccessLevel.Public);
            b.SetWriteAccessLevel(AccessLevel.Public);
            b.AddSimpleField(Field, typeof(string));
            return b.Finish();
        }

        /// <summary>Stamp <paramref name="e"/>, merging its own earlier stamp; the approver is the signed-in person
        /// (UserSession.Actor — "unsigned — &lt;Windows user&gt;" when nobody is; founder decision F5) and the time is now. The
        /// CALLER holds the open transaction (the placer's). API thread.</summary>
        public static void Write(Element e, string changesetId, string source, IEnumerable<string> proposalGuids, Facts facts = null)
        {
            var entity = new Entity(GetSchema());
            entity.Set(Field, Json(changesetId, source, proposalGuids, e.UniqueId, Read(e), facts, UserSession.Actor, Now()));
            e.SetEntity(entity);
        }

        /// <summary>The stamp JSON on <paramref name="e"/>, or null (none, or the schema is not in this session). Read-only:
        /// never creates the schema. API thread; never throws.</summary>
        public static string Read(Element e)
        {
            try
            {
                var s = Schema.Lookup(SchemaGuid);
                if (s == null || e == null) return null;
                var entity = e.GetEntity(s);
                return entity.IsValid() ? entity.Get<string>(Field) : null;
            }
            catch (Exception) { return null; }
        }
#endif
    }
}
