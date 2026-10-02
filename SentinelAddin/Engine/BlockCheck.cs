#nullable disable
// MA-1a item 5 (design §2.4 steps 6 and 8, D19): the BLOCK check before commit. A batch is judged by the same full scan a
// sync runs (App.OnSynchronizing: RuleEngineHost.ScanFull, its BLOCK rows), once before the batch and once after it is
// written, while its Undo group is still open. The BLOCK rows the batch adds are what "This batch will block your sync: N
// element(s)" counts; the person goes back (the group is rolled back — nothing is placed) or places anyway (founder decision
// F4: a BLOCK rule stops the sync, not the edit). No scan at all when the ruleset has no BLOCK rule. The diff and the words
// are pure (tools/promote-check); SENTINEL_CHECK hides the Revit half.
using System;
using System.Collections.Generic;
using System.Linq;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
#endif

namespace Sentinel.Engine
{
    public static class BlockCheck
    {
        /// <summary>Said when the ruleset has not landed yet — the check is never silently skipped.</summary>
        public const string NotLoaded = "BLOCK rules not checked before placing — this model's ruleset has not loaded yet (Scan Now loads it).";

        /// <summary>The BLOCK rows of <paramref name="after"/> that <paramref name="before"/> did not hold: what the batch adds. A row
        /// is its rule and its element — by id, or by name when it has none (a workset row) — so an element that already broke a
        /// rule is not counted again when the batch retypes or renames it. Pure.</summary>
        public static List<Violation> Added(IEnumerable<Violation> before, IEnumerable<Violation> after)
        {
            var had = new HashSet<string>((before ?? Enumerable.Empty<Violation>()).Where(v => v.Mode == EnforcementMode.Block).Select(Key));
            return (after ?? Enumerable.Empty<Violation>()).Where(v => v.Mode == EnforcementMode.Block && !had.Contains(Key(v))).ToList();
        }

        private static string Key(Violation v) => v.RuleId + "\n" + Element(v);
        private static string Element(Violation v) => v.ElementId > 0 ? v.ElementId.ToString() : v.ElementName;

        /// <summary>How many elements the rows name — an element that breaks two rules is one.</summary>
        public static int Elements(IReadOnlyList<Violation> added) => added.Select(Element).Distinct().Count();

        private static string Rules(IReadOnlyList<Violation> added) => string.Join(", ", added.Select(v => v.RuleId).Distinct());

        /// <summary>The design's words (§2.4 step 6), with the rules.</summary>
        public static string Headline(IReadOnlyList<Violation> added, bool workshared) =>
            $"This batch will block your sync: {Elements(added)} element(s) ({Rules(added)})" +
            (workshared ? "" : " — once this model is workshared; it is not, so no sync runs today");

        /// <summary>The rows, as the sync's dialog lists them: "• LB-01: MA0 Roof", at most <paramref name="max"/>.</summary>
        public static string Rows(IReadOnlyList<Violation> added, int max = 8) =>
            string.Join("\n", added.Take(max).Select(v => "• " + v.RuleId + ": " + v.ElementName)) +
            (added.Count > max ? $"\n… and {added.Count - max} more" : "");

        /// <summary>The summary and ledger-note line when the person placed the batch anyway.</summary>
        public static string PlacedAnyway(IReadOnlyList<Violation> added, bool workshared) =>
            Headline(added, workshared) + " — placed anyway, as the person chose; a sync stops until they are fixed.";

        /// <summary>The line when the person went back: nothing was placed.</summary>
        public static string WentBack(IReadOnlyList<Violation> added) =>
            $"You went back at the BLOCK check — nothing was placed. {Elements(added)} element(s) would have blocked your sync ({Rules(added)}).";

        /// <summary>Review amendment C4: a category key of a parameter rule that Sentinel cannot resolve is said, not silent — a
        /// Monitor note whatever the rule's mode (the NeedsOrg style: a rule that was NOT evaluated never blocks a sync and is
        /// never a scored row), so the rule does not read as "all clean" for that category. Pure.</summary>
        public static Violation UnresolvedCategory(Rule rule, string key) =>
            new Violation(rule.Id, EnforcementMode.Monitor, -1, $"(category \"{key}\" is not one Sentinel can resolve — rule not evaluated for it)",
                $"Rule {rule.Id}: category \"{key}\" is not one Sentinel can resolve — rule not evaluated for it", null, rule.DocRef);

#if !SENTINEL_CHECK
        /// <summary>Review amendment C7 — the one BLOCK gate: the sync's full scan of this document when a BLOCK rule can fire on
        /// it, else null with no scan (its ruleset has not loaded yet, or holds no BLOCK rule). The check before commit
        /// (<see cref="Before"/>) and the sync (App.OnSynchronizing) both call it, so they cannot disagree on what can block.
        /// The report's BLOCK rows are what block; the sync alone then drops what this user cannot fix (NotFixableHere, E9).
        /// API thread; reads only, so it is safe inside an open TransactionGroup (RuleEngineHost opens no transaction).</summary>
        public static ScanReport Rows(Document doc) =>
            App.Engine is { } engine && engine.Has(doc) && engine.RulesetFor(doc).Rules.Any(r => r.Mode == EnforcementMode.Block)
                ? engine.ScanFull(doc) : null;

        /// <summary>The full scan before a batch (<see cref="Rows(Document)"/>), or null when nothing can block it: no BLOCK rule in
        /// the ruleset (note null), or the ruleset has not loaded yet (note = <see cref="NotLoaded"/>).</summary>
        public static ScanReport Before(Document doc, out string note)
        {
            note = App.Engine == null || !App.Engine.Has(doc) ? NotLoaded : null;
            return Rows(doc);
        }

        /// <summary>The BLOCK rows the batch added since <paramref name="before"/>, judged now by the sync's own scan. API thread.</summary>
        public static List<Violation> AddedSince(Document doc, ScanReport before) => Added(before.Violations, App.Engine.ScanFull(doc).Violations);

        /// <summary>Ask the person, modal, in the same API call (the batch's group still open, no transaction open): true = place
        /// anyway. Closing the dialog is going back — the safe answer.</summary>
        public static bool PlaceAnyway(Document doc, IReadOnlyList<Violation> added, string what, string rulesetRef)
        {
            var td = new TaskDialog("Sentinel — BLOCK check")
            {
                MainInstruction = Headline(added, doc.IsWorkshared),
                MainContent = Rows(added) + $"\n\nJudged by {rulesetRef ?? "this model's ruleset"} — the rules a sync runs. A BLOCK rule stops the sync, not the edit.",
                AllowCancellation = true,
            };
            td.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Go back", $"Nothing is placed: {what} is rolled back and the model stays as it was.");
            td.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Place anyway", "Fix these before you sync — Sentinel stops the sync until they are fixed.");
            td.DefaultButton = TaskDialogResult.CommandLink1;
            return td.Show() == TaskDialogResult.CommandLink2;
        }
#endif
    }
}
