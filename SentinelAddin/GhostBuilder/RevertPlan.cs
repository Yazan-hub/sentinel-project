#nullable disable
// Revert (2026-10-20, docs/superpowers/specs/2026-10-20-revert-and-persisted-design.md §A): the Revit-free half of a compensating change —
// the applied rows as the bridge stores them, the rows that are never reverted (and why), the person's reason, the words of the Applied AI
// Changes window, and a revert Revit made that the bridge has not recorded yet (%AppData%\Sentinel\unrecorded-reverts\<key>\<id>.json, sent
// again when the window opens — UnreportedResults' rule). ChangesetReverter is the Revit half. tools/promote-check links this file.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Commands;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public static class RevertPlan
    {
        /// <summary>One applied row as the bridge stores it (result.applied) — only what Revert reads.</summary>
        public sealed class AppliedRow
        {
            [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
            [JsonPropertyName("revit_unique_id")] public string RevitUniqueId { get; set; }
            [JsonPropertyName("before")] public AttachBeforeDto Before { get; set; }
        }

        /// <summary>The changeset's applied rows, from its stored result; none when it holds no result or one that does not read.</summary>
        public static List<AppliedRow> Applied(ChangesetDto cs)
        {
            try
            {
                if (cs?.Result is not { ValueKind: JsonValueKind.Object } r || !r.TryGetProperty("applied", out var a) || a.ValueKind != JsonValueKind.Array)
                    return new List<AppliedRow>();
                return (JsonSerializer.Deserialize<List<AppliedRow>>(a.GetRawText()) ?? new List<AppliedRow>()).Where(x => !string.IsNullOrEmpty(x?.ProposalGuid)).ToList();
            }
            catch (JsonException) { return new List<AppliedRow>(); }
        }

        /// <summary>A row Revert never undoes, in the person's words — or null (Revit decides from the model).</summary>
        public static string NeverWhy(ChangesetElementDto el, AppliedRow a)
        {
            if (string.IsNullOrEmpty(a?.RevitUniqueId)) return "the bridge holds no Revit id for it — nothing to find in the model";
            if (el.Op == "rehost") return "a rehost removed the original door or window; Sentinel cannot bring it back — a person decides";
            if (el.Replaces != null) return "it replaced a DirectShape or Generic Model that Sentinel removed; Sentinel cannot bring that back — a person decides";
            if (el.Op == "attach" && a.Before == null) return "the wall's top before the attach was not recorded (applied before 2026-10-20) — a person resets it by hand";
            if (el.Op is not (null or "create" or "retype" or "attach" or "reshape" or "set_parameter")) return $"Revert does not know the op \"{el.Op}\" — a person decides";
            return null;
        }

        /// <summary>The person's reason, trimmed to one line — or null with the problem said (required, at most 500 characters).</summary>
        public static string Reason(string text, out string problem)
        {
            problem = null;
            var t = string.Join(" ", (text ?? "").Split(new[] { '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries)).Trim();
            if (t.Length == 0) { problem = "Type why you revert it — the reason is recorded on the ledger with your name."; return null; }
            if (t.Length > 500) { problem = $"The reason is {t.Length} characters — keep it to 500."; return null; }
            return t;
        }

        /// <summary>The window's state line for an applied changeset: reverted, saved, not in the saved model, or not yet seen saved.</summary>
        public static string State(ChangesetDto cs)
        {
            var parts = new List<string>();
            if (cs.Reverted != null)
                parts.Add($"reverted by {cs.Reverted.By ?? "?"}" + (cs.Reverted.Kept is > 0 ? $" ({cs.Reverted.Kept} row(s) kept as they stood)" : "") + Ledger(cs.Reverted.LedgerId)
                          // 2026-10-20 (spec §4): the revert's own save
                          + (cs.Reverted.Persisted is not { } rp ? " — revert not yet seen saved"
                             : rp.State == "confirmed" ? " — revert " + (rp.How switch { "synced" => "synchronised with central", "saved_locally" => "saved locally, not synced yet", "reopened" => "found in the model when it was reopened", _ => "saved in the model" })
                             : $" — revert NOT in the saved model ({rp.Missing ?? 0} row(s) back) — closed without saving, or Revit stopped"));
            var p = cs.Persisted;
            // drill REV (F-REV-2): after a revert the saved check is about the change as applied — said so, never read as the revert's
            parts.Add((cs.Reverted != null ? "as applied: " : "") + (p == null ? "not yet seen saved"
                : p.State == "confirmed" ? (p.How switch { "synced" => "synchronised with central", "saved_locally" => "saved locally, not synced yet", "reopened" => "found in the model when it was reopened", _ => "saved in the model" }) + Ledger(p.LedgerId)
                : $"NOT in the saved model ({p.Missing ?? 0} element(s)) — closed without saving, or Revit stopped" + Ledger(p.LedgerId)));
            return string.Join(" · ", parts);
        }

        private static string Ledger(long? id) => id == null ? "" : $" (ledger #{id})";

        /// <summary>The window's preview: what goes back and what is kept, each kept row with why.</summary>
        public static string Preview(int back, IReadOnlyList<(string Label, string Why)> kept)
        {
            var head = back == 0 ? "Nothing would go back — every applied row is kept as it stands:"
                     : $"{back} row(s) go back to how they were before this changeset." + (kept.Count == 0 ? "" : $" {kept.Count} kept as they stand:");
            return head + string.Concat(kept.Take(20).Select(k => $"\n• {k.Label}: {k.Why}")) + (kept.Count > 20 ? $"\n… and {kept.Count - 20} more" : "");
        }

        // ── a revert Revit made that the bridge has not recorded yet ──
        public sealed class Record
        {
            [JsonPropertyName("key")] public string Key { get; set; }
            [JsonPropertyName("changeset_id")] public string ChangesetId { get; set; }
            [JsonPropertyName("name")] public string Name { get; set; }
            [JsonPropertyName("guids")] public List<string> Guids { get; set; } = new List<string>();
            [JsonPropertyName("kept")] public List<KeptRow> Kept { get; set; } = new List<KeptRow>();
            [JsonPropertyName("reason")] public string Reason { get; set; }
            [JsonPropertyName("tx")] public string Tx { get; set; }
            [JsonPropertyName("at")] public string At { get; set; }
        }

        /// <summary>The root. The check points it at a temp folder; nothing else sets it.</summary>
        internal static string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "unrecorded-reverts");

        public static string PathFor(string key, string id) => Path.Combine(Root, ArtefactCache.Safe(key), ArtefactCache.Safe(id) + ".json");

        public static bool Write(Record r)
        {
            try
            {
                var path = PathFor(r.Key, r.ChangesetId);
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.WriteAllText(path, JsonSerializer.Serialize(r));
                return true;
            }
            catch (Exception) { return false; }
        }

        public static void Delete(string key, string id)
        {
            try { File.Delete(PathFor(key, id)); } catch (Exception) { /* nothing to delete */ }
        }

        /// <summary>Every unrecorded revert of <paramref name="key"/>, each only under its own file name.</summary>
        public static List<Record> ForKey(string key)
        {
            try
            {
                var dir = Path.Combine(Root, ArtefactCache.Safe(key));
                if (!Directory.Exists(dir)) return new List<Record>();
                return Directory.GetFiles(dir, "*.json").Select(f =>
                {
                    try { var r = JsonSerializer.Deserialize<Record>(File.ReadAllText(f)); return r != null && r.Key == key && string.Equals(PathFor(key, r.ChangesetId), f, StringComparison.OrdinalIgnoreCase) ? r : null; }
                    catch (Exception) { return null; }
                }).Where(r => r != null).ToList();
            }
            catch (Exception) { return new List<Record>(); }
        }

        /// <summary>Post one revert's ledger row; the record goes when the bridge takes it, or refuses it for good (said). Off Revit's thread.</summary>
        internal static string Send(BcfConfig cfg, Record r)
        {
            var ok = ChangesetClient.ReportReverted(cfg, r.Key, r.ChangesetId, r.Guids, "undo", out var error, "revert", r.Reason, r.Kept);
            if (ok || SavedCheck.ForGood(error)) Delete(r.Key, r.ChangesetId);
            if (ok) UndoWatcher.Remember(r.Tx, r.Key, r.ChangesetId, r.Guids, r.Reason, r.Kept, inverse: true);
            return ok ? $"\"{r.Name}\": revert recorded on the ledger ({r.Guids.Count} row(s) back, {r.Kept.Count} kept)."
                 : SavedCheck.ForGood(error) ? $"\"{r.Name}\": the bridge refused the revert's record ({error}). The model is reverted; this PC's record is removed — tell the project lead."
                 : $"\"{r.Name}\": the model is reverted, but the ledger row was NOT posted: {error}. Kept on this PC; sent again when Applied AI Changes opens.";
        }
    }
}
