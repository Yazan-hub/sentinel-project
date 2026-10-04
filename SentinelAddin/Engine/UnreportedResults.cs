#nullable disable
// MA-3b (AI-2): a result Revit applied that the bridge has not taken yet. Written on this PC BEFORE its report is sent (the API thread,
// right after the placement committed) and deleted when the bridge takes it. While it exists the changeset is never opened for review
// on this PC (ReviewChangesetsCommand.Open refuses it), so nothing is applied twice; Review AI Proposals checks it against the model's
// provenance stamps (ProvenanceStamp.Holds — claimed vs verified) and sends it again. %AppData%\Sentinel\unreported\<key>\<changeset
// id>.json: persistent, NOT the deletable cache (PlatformExporter's outbox rule), and not Extensible Storage (a write there is an Undo
// entry and fights for ownership in a workshared central — ArtefactCache's reason; founder decision F1). Pure file I/O and words
// (tools/promote-check, section 42); never throws.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Coordination;

namespace Sentinel.Engine
{
    public static class UnreportedResults
    {
        /// <summary>The result as Apply built it — the body the report sends — and where it was applied.</summary>
        public sealed class Record
        {
            [JsonPropertyName("key")] public string Key { get; set; }
            [JsonPropertyName("changeset_id")] public string ChangesetId { get; set; }
            [JsonPropertyName("name")] public string Name { get; set; }
            /// <summary>The model it was applied in: the workshared central's path, else the file's path, else its title.</summary>
            [JsonPropertyName("doc")] public string Doc { get; set; }
            [JsonPropertyName("applied")] public List<AppliedEntry> Applied { get; set; } = new List<AppliedEntry>();
            [JsonPropertyName("rejected")] public List<string> Rejected { get; set; } = new List<string>();
            [JsonPropertyName("note")] public string Note { get; set; }
            /// <summary>The review_rev Apply re-checked (MA-3a); null when none was.</summary>
            [JsonPropertyName("review_rev")] public int? ReviewRev { get; set; }
            /// <summary>The Undo entry names the undo watcher remembers it under once the bridge takes it.</summary>
            [JsonPropertyName("undo")] public List<string> Undo { get; set; } = new List<string>();
            [JsonPropertyName("at")] public string At { get; set; }
        }

        /// <summary>The root. The check points it at a temp folder; nothing else sets it.</summary>
        internal static string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "unreported");

        public static string PathFor(string key, string id) => Path.Combine(Root, ArtefactCache.Safe(key), ArtefactCache.Safe(id) + ".json");

        /// <summary>False when it could not be written — the caller says nothing on this PC remembers the result.</summary>
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

        /// <summary>The record of changeset <paramref name="id"/> on <paramref name="key"/>, or null (none, unreadable, or another's).</summary>
        public static Record Read(string key, string id)
        {
            var r = Load(PathFor(key, id));
            return r != null && r.Key == key && r.ChangesetId == id ? r : null;
        }

        /// <summary>Every record of <paramref name="key"/>, oldest first — each only under its own file name.</summary>
        public static List<Record> ForKey(string key)
        {
            try
            {
                var dir = Path.Combine(Root, ArtefactCache.Safe(key));
                if (!Directory.Exists(dir)) return new List<Record>();
                return Directory.GetFiles(dir, "*.json").Select(f => (File: f, R: Load(f)))
                    .Where(x => x.R != null && x.R.Key == key && string.Equals(PathFor(key, x.R.ChangesetId), x.File, StringComparison.OrdinalIgnoreCase))
                    .Select(x => x.R).OrderBy(r => r.At ?? "", StringComparer.Ordinal).ToList();
            }
            catch (Exception) { return new List<Record>(); }
        }

        public static void Delete(string key, string id)
        {
            try { File.Delete(PathFor(key, id)); } catch (Exception) { /* nothing to delete */ }
        }

        private static Record Load(string path)
        {
            try { return File.Exists(path) ? JsonSerializer.Deserialize<Record>(File.ReadAllText(path)) : null; }
            catch (Exception) { return null; }
        }

        /// <summary>Before a waiting result is sent again: <paramref name="found"/> is how many of its applied elements this model still
        /// holds with a stamp naming the changeset and the proposal (read by the caller on the API thread). All of them: send it. None: it
        /// is not in this model as applied — never reported as applied, the record removed. Some: neither — the record kept, said.</summary>
        public static (bool Report, bool Drop, string Words) Verified(Record r, int found)
        {
            int total = r.Applied?.Count ?? 0;
            if (found == total) return (true, false, null);
            if (found == 0)
                return (false, true, $"\"{r.Name}\": not in this model as applied (undone, or the model was closed without saving) — nothing reported; the changeset stays proposed and opens for review again. This PC's record is removed.");
            return (false, false, $"\"{r.Name}\": {found} of {total} element(s) Apply placed carry its stamp in this model — nothing reported, and the record is kept ({PathFor(r.Key, r.ChangesetId)}): check the model (finish the Undo, or delete what is left), then close this window and run Review AI Proposals again.");
        }

        /// <summary>A report that did not land (<paramref name="error"/> as ChangesetClient says it): whether the record goes, and the words.
        /// 400, 404 and 409 never heal on a retry with the same body — the record goes, said; anything else keeps it for a retry.</summary>
        public static (bool Drop, string Words) Outcome(string error, int applied)
        {
            var err = string.IsNullOrWhiteSpace(error) ? "the bridge did not answer" : error;
            bool Is(params string[] codes) => codes.Any(c => err.StartsWith("Bridge " + c, StringComparison.Ordinal));
            // Review M4: the 120 s write timeout reads "A task was canceled." (net48) or "…canceled due to the configured HttpClient.Timeout…"
            // (net8) — said as what it is; a bridge's own words are never rewritten.
            if (!err.StartsWith("Bridge ", StringComparison.Ordinal) && err.IndexOf("canceled", StringComparison.OrdinalIgnoreCase) >= 0)
                err = "the bridge did not answer within 120 s";
            if (Is("400", "404", "409"))
                return (true, $"the bridge refused it (retrying cannot fix this): {err}" +
                              (applied > 0 ? $"\nThis PC's record is removed; the {applied} element(s) Apply placed are still in this model — check the changeset's status on the bridge before any re-review." : ""));
            return (false, $"not reported: {err}" + (Is("401", "403") ? "\nSign in (Standards ▸ Sign in) as a contributor on this project, then press Retry report." : "") + Kept(applied));
        }

        /// <summary>Review C6: a result not sent because the round's first report did not land (each waits up to 120 s) — kept, said.</summary>
        public static string NotSent(int applied) => "not sent: the first report of this round did not land." + Kept(applied);

        private static string Kept(int applied) => applied > 0
            ? "\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice."
            : "\nNothing in the model changed; Retry report sends it again.";

        /// <summary>Review C1: the words when the bridge already holds this result — a 409 whose stored changeset (<paramref name="fresh"/>,
        /// re-read) is no longer proposed and applied exactly the record's ghosts: its earlier report landed and the reply was lost (the 120 s
        /// timeout, Revit closed mid-report, or the audit row threw after the doc was written). Null otherwise — then the 409 stands.</summary>
        public static string AlreadyTaken(Record r, ChangesetDto fresh)
        {
            if ((r?.Applied?.Count ?? 0) == 0 || fresh?.Status == null || fresh.Status == "proposed") return null;
            if (fresh.Result is not { ValueKind: JsonValueKind.Object } res || !res.TryGetProperty("applied", out var a) || a.ValueKind != JsonValueKind.Array) return null;
            var took = new HashSet<string>(a.EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Object && x.TryGetProperty("proposal_guid", out var g) && g.ValueKind == JsonValueKind.String ? g.GetString() : null)
                .Where(g => g != null), StringComparer.Ordinal);
            return took.SetEquals(r.Applied.Select(x => x.ProposalGuid))
                ? $"\"{r.Name}\": the bridge had already taken it (its reply did not reach Revit) — {fresh.Status}; the bridge named no ledger row for it here."
                : null;
        }

        /// <summary>Review C8: the result landed, but an Undo of it came while its report was in flight — the changeset_reverted row the
        /// undo watcher would have posted; <paramref name="err"/> is null when it was posted.</summary>
        public static string UndoneInFlight(Record r, string err) => $"\"{r.Name}\": undone in Revit while its report was in flight — " + (err == null
            ? $"a changeset_reverted row (undo) was posted for its {r.Applied?.Count ?? 0} element(s)."
            : $"the changeset_reverted row (undo) was NOT posted: {err}\nThe bridge holds it as applied and the model does not — check the changeset on the bridge.");

        /// <summary>Why a changeset is not opened for review: its result waits on this PC.</summary>
        public static string Blocked(IEnumerable<Record> waiting) =>
            string.Join("\n\n", waiting.Select(r => $"\"{r.Name}\" was applied in {r.Doc} ({r.At}) and the bridge has not taken its result yet — it is not opened for review again, so nothing is applied twice. Run Review AI Proposals in that model: it checks the model and reports it first."));
    }
}
