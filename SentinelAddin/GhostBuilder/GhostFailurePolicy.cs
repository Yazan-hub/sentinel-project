#nullable disable
// MA-1a step 1 (GHB-5): what Ghost Builder's failure preprocessor may do with one Revit failure, decided over plain element
// ids — no Revit API, so ghost-p2-check proves it offline. A warning is counted and left to Revit, never erased ([BP] P1-3).
// An error is given Revit's own resolution only when every element it names (failing and additional) is one this build
// created, and only once; otherwise only this build's elements among the ids it names are deleted; an error that names
// none of them rolls the whole build back. A user's element is never deleted, resolved or unjoined by Sentinel.
// Beside it, the two other honest-build rules: the Doctor skips this transaction (A4); no write onto a user's type (A7).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    public static class GhostFailurePolicy
    {
        public enum Severity { Warning, Error, Corruption }
        public enum Act { Count, Resolve, DeleteOurs, RollBack }

        /// <summary>Revit re-runs failure processing after every fix (ProceedWithCommit); past this many passes the build is
        /// rolled back rather than looped (RevitAPI: a preprocessor must avoid an infinite loop).</summary>
        public const int MaxPasses = 20;

        private static readonly long[] None = new long[0];

        /// <param name="triedResolution">This same failure (definition and named ids) was given Revit's resolution on an
        /// earlier pass and came back.</param>
        public static Act Decide(Severity severity, bool hasResolutions, IReadOnlyCollection<long> failing,
                                 IReadOnlyCollection<long> additional, ISet<long> ours, bool triedResolution = false)
        {
            if (severity == Severity.Warning) return Act.Count;
            if (severity == Severity.Corruption) return Act.RollBack;
            var named = (failing ?? None).Concat(additional ?? None).ToList();
            if (hasResolutions && !triedResolution && named.Count > 0 && named.All(ours.Contains)) return Act.Resolve;
            // A5: (failing ∪ additional) ∩ ours — "Can't keep elements joined" between a user's wall (failing) and a new
            // wall (additional) deletes the new wall; only an error naming none of ours rolls back.
            return named.Any(ours.Contains) ? Act.DeleteOurs : Act.RollBack;
        }

        /// <summary>This build's elements among the ids a failure names (failing ∪ additional) — the only ids Sentinel ever
        /// deletes.</summary>
        public static List<long> ToDelete(IEnumerable<long> failing, ISet<long> ours, IEnumerable<long> additional = null) =>
            (failing ?? None).Concat(additional ?? None).Where(ours.Contains).Distinct().ToList();

        /// <summary>Why the build was rolled back, naming the user's elements by id.</summary>
        public static string RollBackReason(string description, Severity severity, IReadOnlyCollection<long> foreign)
        {
            string what = string.IsNullOrWhiteSpace(description) ? "a Revit failure" : description.Trim();
            if (severity == Severity.Corruption) return what + " (Revit reports document corruption; the build is never committed through it)";
            return foreign == null || foreign.Count == 0
                ? what + " (Revit names no element, so Sentinel cannot tell it is this build's own)"
                : what + $" (it names element(s) {string.Join(", ", foreign)}, which this build did not create — Sentinel never deletes or resolves those)";
        }

        /// <summary>"Placed: 9", or "Placed: 9 (1 deleted by Revit: Walls on 'A-WALL' — Can't make Wall.)" — repeats collapsed.</summary>
        public static string PlacedLine(int placed, IReadOnlyList<string> deleted) =>
            deleted == null || deleted.Count == 0
                ? $"Placed: {placed}"
                : $"Placed: {placed} ({deleted.Count} deleted by Revit: " +
                  string.Join("; ", deleted.GroupBy(d => d).Select(g => g.Count() > 1 ? $"{g.Key} ×{g.Count()}" : g.Key)) + ")";

        /// <summary>The Revit warnings this build left in the model, counted by text. <paramref name="seen"/> is every warning
        /// the preprocessor saw, on every pass: Revit re-runs it after each fix (ProceedWithCommit) and may or may not show an
        /// unresolved warning again (UNSURE), so a warning counts once per Key (its failure definition and the elements it
        /// names). A warning that names an element of this build that is <paramref name="gone"/> after the commit went with
        /// that element, so it is not counted.</summary>
        public static Dictionary<string, int> CountWarnings(IEnumerable<(string Key, string Text, IReadOnlyCollection<long> Ids)> seen,
                                                            ISet<long> gone)
        {
            var counts = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var g in (seen ?? Enumerable.Empty<(string Key, string Text, IReadOnlyCollection<long> Ids)>()).GroupBy(w => w.Key))
            {
                var w = g.First();
                if (w.Ids != null && gone != null && w.Ids.Any(gone.Contains)) continue;
                string text = string.IsNullOrWhiteSpace(w.Text) ? "Revit warning" : w.Text.Trim();
                counts[text] = counts.TryGetValue(text, out int n) ? n + 1 : 1;
            }
            return counts;
        }

        /// <summary>The Revit warnings this build raised, counted by text — left in the model; null when there were none.</summary>
        public static string WarningsLine(IReadOnlyDictionary<string, int> warnings, string what = "build")
        {
            int total = warnings?.Values.Sum() ?? 0;
            if (total == 0) return null;
            return $"Revit warnings raised by this {what}: {total} — left in the model (Manage ▸ Review Warnings), never erased: " +
                   string.Join("; ", warnings.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal)
                                             .Select(kv => kv.Value > 1 ? $"{kv.Key} ×{kv.Value}" : kv.Key));
        }

        /// <summary>A build Revit rolled back: nothing exists, so this is the whole report.</summary>
        public static string NotBuiltLine(string reason) =>
            "Nothing was built — Revit rolled the build back, so the model is as it was before Build: " + reason;

        /// <summary>A6: Commit returned neither Committed nor RolledBack (Pending, …): Revit may still finish or drop the build,
        /// so nothing is recounted and this is the whole report.</summary>
        public static string NotFinishedLine(string status) =>
            $"Revit has not finished the build (status {status}) — check the model before re-running";

        /// <summary>Photo Massing's transaction name (it keeps its own path until MA-6). A DWG build no longer uses it: it runs
        /// as changesets (GhostChangesetBuild).</summary>
        public const string TxName = "Ghost Builder - LOD 200";

        /// <summary>MA-1a step 2: a DWG build's two own transactions inside its one Undo — the types and families its rows
        /// need, before the changesets run, and the document values (P2) after.</summary>
        public const string TypesTxName = "Ghost Builder - types";
        public const string ParamsTxName = "Ghost Builder - parameters";

        /// <summary>Every changeset the executor runs is named UndoWatcher.TxName(…), which starts with this (promote-check
        /// proves the two agree).</summary>
        public const string ChangesetTxPrefix = "Sentinel AI changeset: ";

        /// <summary>A4, widened in MA-1a step 2: the global Doctor (FailureInterceptor) leaves these transactions' warnings
        /// alone — massing's, a DWG build's types and parameters, and EVERY changeset's (Ghost's are changesets now; the
        /// name carries no source, and a changeset counts its warnings and leaves them in the model too, [BP] P1-3).</summary>
        public static bool DoctorSkips(string transactionName) =>
            transactionName == TxName || transactionName == TypesTxName || transactionName == ParamsTxName
            || (transactionName != null && transactionName.StartsWith(ChangesetTxPrefix, StringComparison.Ordinal));

        /// <summary>MA-1a step 2: the changeset executor's rule (founder decision F1 B of step 1, which arrives here): a
        /// warning is counted and left to Revit; any error rolls the whole changeset back — nothing is deleted or resolved.</summary>
        public static Act DecideAllOrNothing(Severity severity) => severity == Severity.Warning ? Act.Count : Act.RollBack;

        /// <summary>Why a changeset was rolled back at commit, in words.</summary>
        public static string AllOrNothingReason(string description, Severity severity)
        {
            string what = string.IsNullOrWhiteSpace(description) ? "a Revit failure" : description.Trim();
            return what + (severity == Severity.Corruption
                ? " (Revit reports document corruption)"
                : " (a Revit error at commit: the changeset is all or nothing, so none of it was kept)");
        }

        /// <summary>B3: the elements the failure that rolled a changeset back named (failing and additional ids), as the
        /// person reads them — each one this changeset placed by its label (<paramref name="labels"/>: element id → e.g.
        /// <c>wall "A-WALL-EXT #12"</c>), any other by its id — so they know which layer to untick. Appended to
        /// AllOrNothingReason; empty when Revit named none.</summary>
        public static string RolledBackNames(IEnumerable<long> ids, IReadOnlyDictionary<long, string> labels)
        {
            var named = (ids ?? None).Distinct()
                .Select(i => labels != null && labels.TryGetValue(i, out var l) ? l : $"element {i} (not one of this changeset's)").ToList();
            if (named.Count == 0) return "";
            return " — Revit named " + string.Join(", ", named.Take(10)) + (named.Count > 10 ? $" and {named.Count - 10} more" : "");
        }

        /// <summary>MA-1a step 2: a DWG build that could not be filed as changesets — nothing exists.</summary>
        public static string NotFiledLine(string reason) =>
            "Nothing was built — the build could not be filed as a changeset, so Sentinel rolled it back (no element, type or family was added): " + reason;

        /// <summary>MA-3b7: the pane's Doctor line when the dry run is done and the filing starts off Revit's thread.</summary>
        public static string FilingLine(int n, bool bound) => bound
            ? $"Ghost Builder: the types proved and the build planned; filing {n} changeset(s) off Revit's thread — Revit stays usable, and the build places by itself in this model once the bridge has answered."
            : "Ghost Builder: the types proved and the build planned; this model is not bound to a web project, so nothing is filed — the build places by itself.";
        /// <summary>MA-3b7 (DocPin): the model was switched or closed while Ghost Builder filed — nothing was placed.</summary>
        /// MA-3b7 review: <paramref name="why"/> is DocPin's refusal — its "nothing was changed" is not said (what was filed is withdrawn).
        public static string NotPlacedLine(string why) => $"Nothing was built — {why.Replace(" — nothing was changed", "").TrimEnd('.')}. The build was planned for the model it started from and places only there; run Build again in that model.";
        /// <summary>MA-3b7 review: what Ghost Builder's own withdrawals did — no decline was tried, so none is named (WithdrawEach's words).</summary>
        public static string FiledWithdrawn(IList<string> withdrawn, IList<string> kept) => kept.Count == 0
            ? $"the {withdrawn.Count} changeset(s) already filed were withdrawn."
            : (withdrawn.Count == 0 ? "" : $"withdrawn: {string.Join(", ", withdrawn)}; ") +
              $"changeset(s) {string.Join(", ", kept)} were filed and could not be withdrawn — withdraw them on the web before anyone reviews them.";
        /// <summary>MA-3b7: the withdrawals after a build rolled back run off Revit's thread — the Doctor log says what the bridge answered.</summary>
        public static string WithdrawingLine(int n) => $"Ledger: withdrawing the {n} changeset(s) already filed, off Revit's thread — the pane's Doctor log says what the bridge answered (one it did not answer is named there: withdraw it on the web before anyone reviews it).";

        /// <summary>A7: a parameter is written onto a TYPE only when this build added that type (provisioned, cloned or loaded
        /// this run); on any other type the write would change the user's own instances, so it is not applied. Null = write;
        /// otherwise the reason for the Note.</summary>
        public static string TypeParamBlocked(bool typeAddedByThisBuild, string typeName, int existingInstances) =>
            typeAddedByThisBuild ? null
            : existingInstances > 0 ? $"not applied to type \"{typeName}\" — it would change {existingInstances} existing instance(s)"
            : $"not applied to type \"{typeName}\" — it is the model's own type, not one this build added";
    }
}
