#nullable disable
// "Applied, then saved" (2026-10-20, docs/superpowers/specs/2026-10-20-revert-and-persisted-design.md §B): the ledger says "applied" when the
// bridge takes a result, but the model may never be saved (closed without saving, Revit stopped). A changeset the bridge took is written here,
// on this PC (%AppData%\Sentinel\unsaved\<key>\<id>.json — UnreportedResults' rule: persistent, not the model), with the file it was applied
// in. On that file's next save, sync or opening, each applied element is looked for with a provenance stamp naming the changeset
// (ProvenanceStamp.Holds — Undo removes it, a file never saved never had it), and one changeset_confirmed or changeset_lost row is posted.
// A workshared local save confirms "saved locally" and the record waits for the sync. Records and decisions are pure (tools/promote-check);
// SENTINEL_CHECK hides the Revit half. Save As carries the records to the new path (Repath, App.OnSavedAs) and confirms them there.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Coordination;
#if !SENTINEL_CHECK
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Sentinel.Commands;
#endif

namespace Sentinel.Engine
{
    public static class SavedCheck
    {
        public sealed class Row
        {
            [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
            [JsonPropertyName("revit_unique_id")] public string RevitUniqueId { get; set; }
        }

        public sealed class Record
        {
            [JsonPropertyName("key")] public string Key { get; set; }
            [JsonPropertyName("changeset_id")] public string ChangesetId { get; set; }
            [JsonPropertyName("name")] public string Name { get; set; }
            /// <summary>The file it was applied in (Document.PathName — a local's own path).</summary>
            [JsonPropertyName("path")] public string Path { get; set; }
            [JsonPropertyName("applied")] public List<Row> Applied { get; set; } = new List<Row>();
            /// <summary>A workshared local save confirmed it already; the record waits for a sync.</summary>
            [JsonPropertyName("saved_locally")] public bool SavedLocally { get; set; }
            [JsonPropertyName("at")] public string At { get; set; }
        }

        /// <summary>The root. The check points it at a temp folder; nothing else sets it.</summary>
        internal static string Root = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "unsaved");

        public static string PathFor(string key, string id) => System.IO.Path.Combine(Root, ArtefactCache.Safe(key), ArtefactCache.Safe(id) + ".json");

        /// <summary>A result the bridge took: remembered until its file is saved. A model never saved (no path) or one that applied nothing is
        /// not — a title cannot tell two copies apart (UnreportedResults.Elsewhere's reason). False when it was not written.</summary>
        public static bool Remember(UnreportedResults.Record r)
        {
            if (r == null || string.IsNullOrEmpty(r.Path) || r.Applied == null || r.Applied.Count == 0) return false;
            return Write(new Record
            {
                Key = r.Key, ChangesetId = r.ChangesetId, Name = r.Name, Path = r.Path, At = ProvenanceStamp.Now(),
                Applied = r.Applied.Select(a => new Row { ProposalGuid = a.ProposalGuid, RevitUniqueId = a.RevitUniqueId }).ToList(),
            });
        }

        public static bool Write(Record r)
        {
            try
            {
                var path = PathFor(r.Key, r.ChangesetId);
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
                File.WriteAllText(path, JsonSerializer.Serialize(r));
                return true;
            }
            catch (Exception) { return false; }
        }

        public static void Forget(string key, string id)
        {
            try { File.Delete(PathFor(key, id)); } catch (Exception) { /* nothing to delete */ }
        }

        /// <summary>Every record applied in <paramref name="path"/> (case ignored: Revit's casing depends on how the file was opened), oldest first.</summary>
        public static List<Record> ForPath(string path)
        {
            try
            {
                if (string.IsNullOrEmpty(path) || !Directory.Exists(Root)) return new List<Record>();
                return Directory.GetFiles(Root, "*.json", SearchOption.AllDirectories).Select(Load)
                    .Where(r => r != null && string.Equals(r.Path, path, StringComparison.OrdinalIgnoreCase))
                    .OrderBy(r => r.At ?? "", StringComparer.Ordinal).ToList();
            }
            catch (Exception) { return new List<Record>(); }
        }

        private static Record Load(string file)
        {
            try
            {
                var r = JsonSerializer.Deserialize<Record>(File.ReadAllText(file));
                // only under its own file name (UnreportedResults.ForKey's rule)
                return r != null && string.Equals(PathFor(r.Key, r.ChangesetId), file, StringComparison.OrdinalIgnoreCase) ? r : null;
            }
            catch (Exception) { return null; }
        }

        /// <summary>Save As (drill REV WS-4): the records of <paramref name="oldPath"/> follow the model to <paramref name="newPath"/>, so the new
        /// file's saves confirm them. How many moved; none for a model never saved, or the same path.</summary>
        public static int Repath(string oldPath, string newPath)
        {
            if (string.IsNullOrEmpty(oldPath) || string.IsNullOrEmpty(newPath) || string.Equals(oldPath, newPath, StringComparison.OrdinalIgnoreCase)) return 0;
            var moved = 0;
            foreach (var r in ForPath(oldPath)) { r.Path = newPath; if (Write(r)) moved++; }
            return moved;
        }

        /// <summary>What an event means for a record: the <c>how</c> to post (null = post nothing) and whether the record goes once posted.
        /// <paramref name="ev"/> is "saved", "synced" or "opened". A workshared local save is "saved_locally" and keeps the record for the sync;
        /// an opening after one posts nothing (that local copy was saved — the sync is what is still owed).</summary>
        public static (string How, bool Drop) Decide(string ev, bool workshared, Record r) => ev switch
        {
            "saved" => workshared ? (r.SavedLocally ? (null, false) : ("saved_locally", false)) : ("saved", true),
            "synced" => ("synced", true),
            "opened" => r.SavedLocally ? (null, false) : ("reopened", true),
            _ => (null, false),
        };

        /// <summary>The applied rows the model holds (its element is there with this changeset's stamp) and those it does not.</summary>
        public static (List<string> Held, List<string> Missing) Split(Record r, Func<Row, bool> holds)
        {
            var held = new List<string>();
            var missing = new List<string>();
            foreach (var a in r.Applied ?? new List<Row>()) (holds(a) ? held : missing).Add(a.ProposalGuid);
            return (held, missing);
        }

        /// <summary>The Doctor log's line for one posted check.</summary>
        public static string Words(Record r, string how, int held, int missing, string ledger, string error)
        {
            var when = how switch { "saved" => "saved", "saved_locally" => "saved locally (not synced yet)", "synced" => "synchronised with central", _ => "reopened" };
            if (error != null) return $"Saved check: \"{r.Name}\" ({when}) — NOT recorded: {error}. Kept on this PC; checked again at the next save, sync or opening.";
            return missing == 0
                ? $"Saved check: \"{r.Name}\" — all {held} element(s) are in the model as {when}: changeset_confirmed ({ledger})."
                : $"Saved check: \"{r.Name}\" — {missing} of {held + missing} element(s) are NOT in the model as {when}"
                  + (how == "reopened" ? " (it was closed without saving, or Revit stopped)" : " (undone or deleted before the save)") + $": changeset_lost ({ledger}).";
        }

        /// <summary>A refusal that never heals on a retry (the changeset is no longer applied, or its applied set no longer matches).</summary>
        public static bool ForGood(string error) =>
            error != null && new[] { "400", "404", "409" }.Any(c => error.StartsWith("Bridge " + c, StringComparison.Ordinal));

#if !SENTINEL_CHECK
        /// <summary>DocumentSaved, DocumentSynchronizedWithCentral (succeeded) and DocumentOpened (App): the waiting records of this file, checked
        /// against its stamps here (API thread, read-only), posted off it. Never throws.</summary>
        public static void On(Document doc, string ev)
        {
            try
            {
                if (doc == null || doc.IsFamilyDocument || doc.IsLinked) return;
                foreach (var r in ForPath(doc.PathName))
                {
                    var (how, drop) = Decide(ev, doc.IsWorkshared, r);
                    if (how == null) continue;
                    var (held, missing) = Split(r, a => doc.GetElement(a.RevitUniqueId ?? "") is Element e
                                                        && ProvenanceStamp.Holds(ProvenanceStamp.Read(e), r.ChangesetId, a.ProposalGuid));
                    Task.Run(() =>
                    {
                        var ok = ChangesetClient.ReportPersisted(BcfConfig.Load(), r.Key, r.ChangesetId, how, held, missing, out var reply, out var error);
                        var gone = !ok && ForGood(error);
                        if (ok && drop || gone) Forget(r.Key, r.ChangesetId);
                        else if (ok) { r.SavedLocally = true; Write(r); }
                        App.PanelVm?.LogDoctor(Words(r, how, held.Count, missing.Count, ok ? ChangesetTrust.LedgerOf(reply) : null, ok ? null : error)
                                               + (gone ? " The bridge will not take it, so this PC's record is removed." : ""));
                    });
                }
            }
            catch (Exception ex) { App.PanelVm?.LogDoctor($"Saved check ({ev}) failed: {ex.GetType().Name}: {ex.Message}"); }
        }
#endif
    }
}
