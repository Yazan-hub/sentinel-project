#nullable disable
// MA-1a item 6: where a placed element goes, decided over plain values — no Revit API, so tools/promote-check proves it
// offline. guideline@n's placement block names a workset per category and the phase; Sentinel never places into a design
// option. Every refusal and every summary line of item 6 is worded here; PlacementApply (the Revit half) reads the model,
// writes the two parameters and records what it wrote per element (Written); the lines are counted after the commit,
// from the elements still in the model. The office-template check's words are here too: its count is
// GuidelineMatcher.OfficeTypesIn.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder;

namespace Sentinel.Engine
{
    public static class PlacementPolicy
    {
        /// <summary>The guideline category a changeset kind lands in (a column is an architectural Column: the executor
        /// takes its type from OST_Columns only). An unknown kind names none.</summary>
        public static string[] CategoriesOf(string kind)
        {
            switch (kind)
            {
                case "wall": return new[] { "Walls" };
                case "floor": return new[] { "Floors" };
                case "roof": return new[] { "Roofs" };
                case "ceiling": return new[] { "Ceilings" };
                case "door": return new[] { "Doors" };
                case "window": return new[] { "Windows" };
                case "column": return new[] { "Columns" };
                case "furniture": return new[] { "Furniture" };
                case "level": return new[] { "Levels" };
                case "grid": return new[] { "Grids" };
                default: return new string[0];
            }
        }

        /// <summary>The changeset kinds Sentinel places — the bridge's vocabulary (changesets-logic.mjs VOCABULARY).</summary>
        public static readonly string[] Kinds = { "wall", "floor", "roof", "ceiling", "door", "window", "column", "furniture", "level", "grid" };

        /// <summary>The kind that lands in a category (case and padding ignored); null for one Sentinel does not place.</summary>
        public static string KindOf(string category) =>
            Kinds.FirstOrDefault(k => CategoriesOf(k).Any(c => string.Equals(c, (category ?? "").Trim(), StringComparison.OrdinalIgnoreCase)));

        /// <summary>The workset the block names for a category (case and padding ignored); null when it names none.</summary>
        public static string WorksetFor(GuidelinePlacement block, string category)
        {
            if (block?.Worksets == null || category == null) return null;
            foreach (var kv in block.Worksets)
                if (string.Equals((kv.Key ?? "").Trim(), category.Trim(), StringComparison.OrdinalIgnoreCase)) return (kv.Value ?? "").Trim();
            return null;
        }

        /// <summary>The worksets a batch of these kinds needs that the model does not have, each once, by name. A workset the
        /// batch does not need is not asked for.</summary>
        public static List<string> MissingWorksets(GuidelinePlacement block, IEnumerable<string> kinds, IEnumerable<string> modelWorksets)
        {
            var have = new HashSet<string>(modelWorksets ?? new string[0], StringComparer.OrdinalIgnoreCase);
            return (kinds ?? new string[0]).SelectMany(CategoriesOf).Select(c => WorksetFor(block, c))
                .Where(n => !string.IsNullOrEmpty(n) && !have.Contains(n))
                .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(n => n, StringComparer.Ordinal).ToList();
        }

        /// <summary>The refusal when a design option is being edited. <paramref name="what"/> is the action to repeat
        /// ("apply the proposals", "build").</summary>
        public static string DesignOptionRefusal(string option, string what) =>
            "Nothing was placed — design option \"" + option + "\" is being edited, and Sentinel never places into a design option. " +
            "Switch to Main Model (Manage ▸ Design Options), then " + what + " again.";

        public static string MissingWorksetRefusal(IReadOnlyList<string> names) =>
            "Nothing was placed — the guideline's placement block names " + (names.Count == 1 ? "a workset" : names.Count + " worksets") +
            " this model does not have: " + string.Join(", ", names.Select(n => "\"" + n + "\"")) + ". Create " + (names.Count == 1 ? "it" : "them") +
            " (Standards ▸ Apply Standard, or Collaborate ▸ Worksets), then try again — Sentinel never creates a workset while placing, and never picks another.";

        /// <summary>Review amendment C7: null, or the refusal when the project's guideline could not be read — whether it
        /// has a placement block is then unknown, and a guess would put every element on the wrong workset. A guideline
        /// read from the bridge or from its cached copy is read. "None installed" (the bridge said so — for the project and
        /// its office, or because it has no such project yet: the caller passes either as <paramref name="notInstalled"/>)
        /// and a model that is not bound are no block, not a refusal. <paramref name="why"/> is the reader's own reason ("bridge unreachable
        /// (…)", "guideline@3 · … did not parse: …").</summary>
        public static string UnreadRefusal(string origin, bool notInstalled, bool bound, string why) =>
            origin != "none" || notInstalled || !bound ? null
            : "Nothing was placed — the project's guideline could not be read (" + why + "), so its placement block is unknown. " +
              "Try again once it can be read — Sentinel never places on a guess.";

        /// <summary>Review amendment C29: Revit refused a workset or phase write on a created element by throwing.
        /// <paramref name="element"/> is its category and UniqueId, <paramref name="why"/> Revit's own words.</summary>
        public static string WriteRefusal(string element, string why) =>
            "Nothing was placed — Revit would not set the workset or the phase of " + element + " (" + why + "). The model is as it was.";

        /// <summary>What a placement run did: elements per workset, elements whose category the block names no workset
        /// for, and elements whose phase was set. Built by <see cref="Written.Surviving"/> after the commit, so it counts
        /// only what is still in the model.</summary>
        public sealed class Tally
        {
            public readonly Dictionary<string, int> OnWorkset = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            public readonly Dictionary<string, int> Unnamed = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            public int Phased;
            public void On(string workset) => OnWorkset[workset] = (OnWorkset.TryGetValue(workset, out int n) ? n : 0) + 1;
            public void NoWorkset(string category) => Unnamed[category] = (Unnamed.TryGetValue(category, out int n) ? n : 0) + 1;
        }

        /// <summary>Review amendment C6: what PlacementApply wrote, per element, inside the placer's transaction. The
        /// summary is counted from it after the commit, for the elements still in the model — an element Revit removed at
        /// commit is in no count (the GHB-5 rule).</summary>
        public sealed class Written
        {
            private readonly List<(string Id, string Workset, string Unnamed, bool Phased)> _set = new List<(string, string, string, bool)>();

            /// <summary>One created element: the workset it was put on (null: none), or the category the block names no
            /// workset for (null: the workset part did not run), and whether its phase was set.</summary>
            public void Add(string uniqueId, string workset, string unnamedCategory, bool phased) => _set.Add((uniqueId, workset, unnamedCategory, phased));

            public Tally Surviving(IEnumerable<string> uniqueIds)
            {
                var alive = new HashSet<string>(uniqueIds ?? new string[0], StringComparer.Ordinal);
                var tally = new Tally();
                foreach (var s in _set.Where(s => alive.Contains(s.Id)))
                {
                    if (s.Workset != null) tally.On(s.Workset);
                    else if (s.Unnamed != null) tally.NoWorkset(s.Unnamed);
                    if (s.Phased) tally.Phased++;
                }
                return tally;
            }
        }

        public const string NoBlock =
            "Placement: no placement block (the project's guideline has none, or no guideline is installed) — each element is on the active workset and in the phase Revit gave it, as before.";

        /// <summary>The summary lines of one placement run: what was set, and what was not and why — never nothing.
        /// <paramref name="phaseName"/> is the active view's phase, null when the view has none.</summary>
        public static List<string> Lines(GuidelinePlacement block, bool workshared, Tally tally, string phaseName)
        {
            if (block == null) return new List<string> { NoBlock };
            var lines = new List<string>();
            int named = block.Worksets?.Count ?? 0;
            if (named == 0) lines.Add("Worksets: the guideline's placement block names none — each element is on the active workset.");
            else if (!workshared) lines.Add("Worksets: not set — this model is not workshared, so it has no worksets (the guideline names " + named + ").");
            else
            {
                var parts = tally.OnWorkset.OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => kv.Value + " on " + kv.Key).ToList();
                if (tally.Unnamed.Count > 0)
                    parts.Add(tally.Unnamed.Values.Sum() + " left on the active workset (the guideline names no workset for " +
                              string.Join(", ", tally.Unnamed.Keys.OrderBy(k => k, StringComparer.Ordinal)) + ")");
                lines.Add("Worksets: " + (parts.Count == 0 ? "no element was created" : string.Join(" · ", parts)) + ".");
            }
            if (block.Phase == null) lines.Add("Phase: the guideline's placement block names none — each element is in the phase Revit gave it.");
            else if (phaseName == null) lines.Add("Phase: not set — the active view has no phase (a sheet, a legend); each element is in the phase Revit gave it.");
            else lines.Add("Phase: " + tally.Phased + " element(s) set to \"" + phaseName + "\", the active view's phase (a level or a grid has no phase).");
            return lines;
        }

        // ── the office-template check (the count is GuidelineMatcher.OfficeTypesIn) ──────────────────────────────

        /// <summary>The build is refused only when the model holds none of the office types there are to compare.</summary>
        public static bool TemplateRefuses(int present, int total) => total > 0 && present == 0;

        public static string TemplateRefusal(int total, string catalogLabel) =>
            "Nothing was built — this model was not made from the office template: it holds none of the " + total + " office type(s) that " +
            catalogLabel + " lists in the guideline's categories. Start the project from the office template, then run this again — Sentinel never loads an unknown family.";

        public static string TemplateLine(bool hasCatalog, int present, int total, string catalogLabel) =>
            !hasCatalog ? "Office template: not checked — type_catalog: " + catalogLabel + "."
            : total == 0 ? "Office template: not checked — " + catalogLabel + " lists no type in a category the guideline has rules for."
            : "Office template: " + present + " of " + total + " office type(s) present (" + catalogLabel + ").";
    }
}
