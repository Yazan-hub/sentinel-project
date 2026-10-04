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
            /// <summary>MA-3b2 review C16: the file it was applied in (Document.PathName — a local's own path, where Doc is its central's);
            /// "" for a model never saved; null on a record written before this field.</summary>
            [JsonPropertyName("path")] public string Path { get; set; }
            [JsonPropertyName("applied")] public List<AppliedEntry> Applied { get; set; } = new List<AppliedEntry>();
            [JsonPropertyName("rejected")] public List<string> Rejected { get; set; } = new List<string>();
            [JsonPropertyName("note")] public string Note { get; set; }
            /// <summary>MA-3b2: the reviewer's reason per rejected ghost ({proposal_guid: one line}); null when none was typed, and on a
            /// record written before MA-3b2.</summary>
            [JsonPropertyName("reasons")] public Dictionary<string, string> Reasons { get; set; }
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
        /// is not in this model as applied — never reported as applied; review C9: Ask — the bridge is asked what it holds before the
        /// record goes (Gone, on a pool thread). Some: neither — the record kept, said.</summary>
        public static (bool Report, bool Ask, string Words) Verified(Record r, int found)
        {
            int total = r.Applied?.Count ?? 0;
            if (found == total) return (true, false, null);
            if (found == 0) return (false, true, null);
            return (false, false, $"\"{r.Name}\": {found} of {total} element(s) Apply placed carry its stamp in this model — nothing reported, and the record is kept ({PathFor(r.Key, r.ChangesetId)}): check the model (finish the Undo, or delete what is left), then close this window and run Review AI Proposals again.");
        }

        /// <summary>MA-3b2 review C16: a waiting result none of whose elements this model holds (Verified's Ask) is dropped only on the
        /// evidence of the file it was applied in. Every local of one central shares Doc (the central's path) and every never-saved model
        /// its title, so another copy would say "none here", the bridge "proposed", and the record would go while the first copy still
        /// holds the elements — a second Apply then duplicates them. The words when <paramref name="pathName"/> (this Document.PathName)
        /// is not that file, or the model was never saved: the record is kept. Null when it is that file, or the record is from before
        /// the field (then as before). Ceiling: an Undo in a never-saved model keeps its record until the file named is deleted.</summary>
        public static string Elsewhere(Record r, string pathName)
        {
            if (r?.Path == null) return null;
            string delete = $"check the changeset's status on the bridge, then delete {PathFor(r.Key, r.ChangesetId)}.";
            if (r.Path.Length == 0)
                return $"\"{r.Name}\": applied in a model that was never saved, and this model holds none of it — a title cannot tell whether this is that model. Nothing reported, and the record is kept. If it was undone, or that model is gone, {delete}";
            if (string.Equals(r.Path, pathName ?? "", StringComparison.OrdinalIgnoreCase)) return null;
            return $"\"{r.Name}\": applied in {r.Path}, and this file ({pathName}) holds none of it — another copy of the same model. Nothing reported, and the record is kept: open that file and run Review AI Proposals there, or synchronise it and reload this one. If that file is gone, or it was undone there, {delete}";
        }

        /// <summary>A report that did not land (<paramref name="error"/> as ChangesetClient says it): whether the record goes, and the words.
        /// 400, 404 and 409 never heal on a retry with the same body — the record goes, said; anything else keeps it for a retry.</summary>
        public static (bool Drop, string Words) Outcome(string error, int applied)
        {
            // Review M4, MA-3b2: a timeout is said as what it is (ChangesetTrust.BridgeWords — the client says it so already; net48's and
            // net8's own timeout words are read the same way); a bridge's own words are never rewritten, nor a sign-in failure's (C1).
            var err = ChangesetTrust.BridgeWords(error, 120);
            bool Is(params string[] codes) => codes.Any(c => err.StartsWith("Bridge " + c, StringComparison.Ordinal));
            if (Is("400", "404", "409"))
                return (true, $"the bridge refused it (retrying cannot fix this): {err}" +
                              (applied > 0 ? $"\nThis PC's record is removed; the {applied} element(s) Apply placed are still in this model — check the changeset's status on the bridge before any re-review." : ""));
            return (false, $"not reported: {err}" + (Is("401", "403") ? "\nSign in (Standards ▸ Sign in) as a contributor on this project" + PressRetry : "") + Kept(applied));
        }

        /// <summary>Review C6: a result not sent because the round's first report did not land (each waits up to 120 s) — kept, said.</summary>
        public static string NotSent(int applied) => "not sent: the first report of this round did not land." + Kept(applied);

        private static string Kept(int applied) => applied > 0
            ? "\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice."
            : "\n" + DeclineKept;

        /// <summary>A decline that did not land lives in its window (E4). Review C13: once the window is closed there is no Retry report —
        /// the caller says DeclineLost instead.</summary>
        /// <summary>MA-3b2b review C14: the sign-in refusal's last words — a closed window has no Retry report, the caller says RunReview.</summary>
        public const string PressRetry = ", then press Retry report.";
        public const string RunReview = ", then run Review AI Proposals.";
        public const string DeclineKept = "Nothing in the model changed; Retry report sends it again.";
        // MA-3b2b review C8: never "it stays proposed" — after a lost reply the bridge may hold the decline; the picker's list says which.
        // Review C15: nor "no longer listed was declined" — the picker lists proposed only, and a withdrawal or another PC's Apply unlists it too.
        public const string DeclineLost = "Nothing in the model changed; the bridge may or may not have taken the decline — run Review AI Proposals: a changeset no longer listed is no longer proposed — declined, unless it was withdrawn or applied meanwhile (the web desk's Recently decided in Revit lists what Revit reported); one still listed is reviewed again.";

        /// <summary>Review C1: the words when the bridge already holds this result — a 409 whose stored changeset (<paramref name="fresh"/>,
        /// re-read) is no longer proposed and applied exactly the record's ghosts: its earlier report landed and the reply was lost (the 120 s
        /// timeout, Revit closed mid-report, or the audit row threw after the doc was written). Null otherwise — then the 409 stands.
        /// MA-3b2b: a result that applied nothing (Decline all, a rolled-back Apply) is taken when the changeset is declined and its stored
        /// result rejects exactly the record's ghosts with the record's note (the bridge stores it trimmed; none is none) and — review C7 —
        /// when it holds reasons, exactly the record's (each as the bridge keeps it: ChangesetTrust.DeclineReason; a blank one is not
        /// kept), so another person's reasons are never counted as this reviewer's. A stored result with no reasons still matches (a
        /// bridge before MA-3b2 keeps none; the caller's ReasonsLine then says fewer were kept than sent). Ceiling: another person's
        /// decline of the same ghosts with the same note and the same reasons (or none stored) reads as this one — nothing is lost, the
        /// changeset is declined either way; who reported it is not compared (the stored actor is the bridge's resolved one).</summary>
        public static string AlreadyTaken(Record r, ChangesetDto fresh)
        {
            if (r == null || fresh?.Status == null || fresh.Status == "proposed") return null;
            if (fresh.Result is not { ValueKind: JsonValueKind.Object } res) return null;
            string taken = $"\"{r.Name}\": the bridge had already taken it (its reply did not reach Revit) — {fresh.Status}; the bridge named no ledger row for it here.";
            if ((r.Applied?.Count ?? 0) == 0)
            {
                if (fresh.Status != "declined" || (r.Rejected?.Count ?? 0) == 0 || !res.TryGetProperty("rejected", out var rej) || rej.ValueKind != JsonValueKind.Array) return null;
                var declined = new HashSet<string>(rej.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()), StringComparer.Ordinal);
                string note = res.TryGetProperty("note", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : "";
                if (!declined.SetEquals(r.Rejected) || !string.Equals(note, (r.Note ?? "").Trim(), StringComparison.Ordinal)) return null;
                if (res.TryGetProperty("reasons", out var kept) && kept.ValueKind == JsonValueKind.Object)
                {
                    var mine = new Dictionary<string, string>(StringComparer.Ordinal);
                    foreach (var p in r.Reasons ?? new Dictionary<string, string>())
                        if (ChangesetTrust.DeclineReason(p.Value, out _) is { } why) mine[p.Key] = why;
                    var theirs = kept.EnumerateObject().ToList();
                    if (theirs.Count != mine.Count || theirs.Any(p => p.Value.ValueKind != JsonValueKind.String || !mine.TryGetValue(p.Name, out var why) || !string.Equals(why, p.Value.GetString(), StringComparison.Ordinal))) return null;
                }
                return taken;
            }
            if (!res.TryGetProperty("applied", out var a) || a.ValueKind != JsonValueKind.Array) return null;
            var took = new HashSet<string>(a.EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Object && x.TryGetProperty("proposal_guid", out var g) && g.ValueKind == JsonValueKind.String ? g.GetString() : null)
                .Where(g => g != null), StringComparer.Ordinal);
            return took.SetEquals(r.Applied.Select(x => x.ProposalGuid)) ? taken : null;
        }

        /// <summary>MA-3b2 review C15: the stored changeset (re-read after a 409) in the shape of the bridge's reply to a result, so
        /// ChangesetTrust.ReasonsLine counts the reasons a result taken earlier holds.</summary>
        public static string StoredReply(ChangesetDto fresh) => JsonSerializer.Serialize(new { result = fresh?.Result });

        /// <summary>Review C9: a waiting result none of whose elements this model holds, and what the bridge holds (<paramref name="fresh"/>,
        /// re-read on a pool thread; null with <paramref name="err"/> when it could not be). A record stays exactly when its reply was lost,
        /// so the bridge may already hold it: then Revert — the caller posts the changeset_reverted row Revit's Undo would have, and drops
        /// the record only once it is posted (RevertPosted). Still proposed: dropped, said. Unread: kept.</summary>
        public static (bool Drop, bool Revert, string Words) Gone(Record r, ChangesetDto fresh, string err)
        {
            var why = $"\"{r.Name}\": not in this model as applied (undone, the model was closed without saving, or a local that was never synchronised)";
            if (fresh?.Status == null)
                return (false, false, $"{why}, and the bridge could not be re-read to say whether it took it ({err ?? "no answer"}) — nothing reported." + Kept(r.Applied?.Count ?? 0));
            if (fresh.Status == "proposed")
                return (true, false, $"{why} — nothing reported; the bridge holds the changeset as proposed, so it opens for review again. This PC's record is removed.");
            // MA-3b2b review C10: only a result that applied something has an Undo to post — a decline the bridge holds (AlreadyTaken's
            // new case) never asks for a changeset_reverted row with no ghost.
            if ((r.Applied?.Count ?? 0) > 0 && AlreadyTaken(r, fresh) != null)
                return (true, true, $"{why}, but the bridge had already taken it (its reply did not reach Revit) — {fresh.Status}; a changeset_reverted row (undo) for its {r.Applied.Count} element(s) was ");
            return (true, false, $"{why}, and the bridge holds the changeset as {fresh.Status} with a result that is not this one — nothing reported. This PC's record is removed.");
        }

        /// <summary>Review C9: the end of Gone's words once the revert was sent (<paramref name="err"/> null: posted).</summary>
        public static string RevertPosted(string err) => err == null
            ? "posted. This PC's record is removed."
            : $"NOT posted: {err}\nThe record is kept on this PC; Retry report or the next Review AI Proposals asks the bridge again.";

        /// <summary>Review C10: a 409 whose changeset could not be re-read — it may be this result, landed earlier; never called refused.</summary>
        public static string NotReRead(string err, int applied) =>
            $"not reported: the bridge answered 409 and the changeset could not be re-read to tell whether it already holds this result ({err})." + Kept(applied);

        /// <summary>Review C8: the result landed, but an Undo of it came while its report was in flight — the changeset_reverted row the
        /// undo watcher would have posted; <paramref name="err"/> is null when it was posted.</summary>
        public static string UndoneInFlight(Record r, string err) => $"\"{r.Name}\": undone in Revit while its report was in flight — " + (err == null
            ? $"a changeset_reverted row (undo) was posted for its {r.Applied?.Count ?? 0} element(s)."
            : $"the changeset_reverted row (undo) was NOT posted: {err}\nThe bridge holds it as applied and the model does not — check the changeset on the bridge.");

        /// <summary>Why a changeset is not opened for review: its result waits on this PC.</summary>
        public static string Blocked(IEnumerable<Record> waiting) =>
            string.Join("\n\n", waiting.Select(r => $"\"{r.Name}\" was applied in {r.Doc} ({r.At}) and the bridge has not taken its result yet — it is not opened for review again, so nothing is applied twice. Run Review AI Proposals in that model: it checks the model and reports it first. {DeleteOnce(r)}"));

        /// <summary>Founder decision F4 (review C14): the file that keeps the changeset closed on this PC, named for a model that is gone.</summary>
        public static string DeleteOnce(Record r) => $"If that model is gone, check the changeset's status on the bridge, then delete {PathFor(r.Key, r.ChangesetId)}.";

        /// <summary>MA-3b4 (founder decision F2 B): the head of the Doctor line when a model opens and its waiting results are checked and sent.</summary>
        public static string OnOpening(string title) => $"Review AI Proposals (on opening \"{title}\"): ";

        /// <summary>MA-3b4: a model opened while the one-review guard is held (a picker or a window open, a report in flight) — nothing sent, said.</summary>
        public static string OpenHeld(int n) =>
            $"{n} result(s) applied in this model wait on this PC for the bridge — not sent now: a review window is open or a report is in flight. Once it is done, run Review AI Proposals in this model: it checks the model and sends them.";

        /// <summary>MA-3b4 review C1: a model opened while nobody is signed in — nothing sent (a result is reported in a person's name, never
        /// the machine credential's, which the bridge would still accept as service), said.</summary>
        public static string OpenSignedOut(int n) =>
            $"{n} result(s) applied in this model wait on this PC for the bridge — not sent: nobody is signed in, and a result is reported in a person's name. Sign in (Standards ▸ Sign in) as a contributor on this project, then run Review AI Proposals in this model.";

        /// <summary>MA-3b4 (G2): the head of Ghost Builder's Doctor line — its report runs after its summary is shown.</summary>
        public const string GhostHead = "Ghost Builder — the report to the bridge: ";

        // MA-3b4 (S4): what a window's words offer that no window can — MA-3b2b review C14's rule, for every offer: a round at a model's
        // opening or from Ghost Builder has no Retry report and no window to close.
        private static readonly (string Window, string None)[] NoWindow =
        {
            (PressRetry, RunReview),
            (DeclineKept, "Nothing in the model changed."),
            ("Retry report or the next Review AI Proposals", "the next opening of this model or Review AI Proposals"),
            ("then close this window and run Review AI Proposals again.", "then run Review AI Proposals in this model."),
        };

        /// <summary>MA-3b4: a round's words for the pane's Doctor log (and a dialog) when no window shows them.</summary>
        public static string Windowless(string head, string words) => NoWindow.Aggregate(head + (words ?? ""), (s, p) => s.Replace(p.Window, p.None));

        /// <summary>MA-3b4: a round that did not finish (its task faulted) — nothing on this PC is lost.</summary>
        public static string Failed(string why) =>
            $"reporting failed — {why ?? "it did not finish"}\nWhat Revit applied is kept on this PC ({Root}) and sent again by the next opening of this model or Review AI Proposals; a decline that did not land leaves its changeset proposed.";

        /// <summary>MA-3b4 (AI-2): Ghost Builder's ledger line — its results are written on this PC and reported off Revit's thread.</summary>
        public static string GhostReporting(string key, IList<string> ids, IList<string> unsaved) =>
            $"Ledger: reporting {ids.Count} changeset(s) to {key} (source dwg: {string.Join(", ", ids)}) off Revit's thread — the pane's Doctor log says what the bridge took. " +
            "A result it does not take is kept on this PC and sent again by the next opening of this model or Review AI Proposals; that changeset is not opened for review until then, so nothing is applied twice. " +
            "One Ctrl+Z undoes the whole build; changeset_reverted is posted for what the bridge holds." +
            (unsaved.Count == 0 ? "" : $"\n⚠ The result of {string.Join(", ", unsaved)} could not be saved on this PC ({Root}): if its report fails too, nothing on this PC remembers it — check the changeset's status on the bridge before reviewing it again.");

        /// <summary>MA-3b4: Ghost Builder's ledger line when the build rolled back — every filed changeset is reported declined off Revit's thread.</summary>
        public static string GhostDeclining(int n) =>
            $"Ledger: reporting {n} changeset(s) as declined, with the reason, off Revit's thread — the pane's Doctor log says what the bridge took; one it does not take is withdrawn instead, and one that is neither is named there (still proposed: withdraw it on the web).";

        /// <summary>MA-3b4 (B4): after Ghost Builder's declines — the changesets withdrawn instead, and those neither declined nor withdrawn.</summary>
        public static string WithdrawnInstead(IList<string> withdrawn, IList<string> kept) =>
            (withdrawn.Count == 0 ? "" : $"\n\nWithdrawn instead (the decline did not land): {string.Join(", ", withdrawn)}.") +
            (kept.Count == 0 ? "" : $"\n\nStill proposed — neither declined nor withdrawn: {string.Join(", ", kept)}. Withdraw it on the web before anyone reviews it.");

        /// <summary>MA-3b4 review C8: Ghost Builder's results whose save on this PC failed and whose report did not land — the round's
        /// "kept on this PC" is not true for them.</summary>
        public static string NotKept(IList<string> ids) => ids.Count == 0 ? ""
            : $"\n\n⚠ {string.Join(", ", ids)}: NOT kept on this PC — its save failed ({Root}), so nothing here keeps that changeset closed; check its status on the bridge before anyone reviews it.";
    }
}
