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
        public static string WarningsLine(IReadOnlyDictionary<string, int> warnings)
        {
            int total = warnings?.Values.Sum() ?? 0;
            if (total == 0) return null;
            return $"Revit warnings raised by this build: {total} — left in the model (Manage ▸ Review Warnings), never erased: " +
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

        /// <summary>The Ghost transaction's name (DWG and massing) — unchanged; step 2 renames it with the changeset.</summary>
        public const string TxName = "Ghost Builder - LOD 200";

        /// <summary>A4: the global Doctor (FailureInterceptor) leaves this transaction's warnings alone — Ghost counts them and
        /// leaves them in the model ([BP] P1-3). Step 2 must widen this to the executor's transaction for Ghost-sourced
        /// changesets, or P1-3 regresses.</summary>
        public static bool DoctorSkips(string transactionName) => transactionName == TxName;

        /// <summary>A7: a parameter is written onto a TYPE only when this build added that type (provisioned, cloned or loaded
        /// this run); on any other type the write would change the user's own instances, so it is not applied. Null = write;
        /// otherwise the reason for the Note.</summary>
        public static string TypeParamBlocked(bool typeAddedByThisBuild, string typeName, int existingInstances) =>
            typeAddedByThisBuild ? null
            : existingInstances > 0 ? $"not applied to type \"{typeName}\" — it would change {existingInstances} existing instance(s)"
            : $"not applied to type \"{typeName}\" — it is the model's own type, not one this build added";
    }
}
