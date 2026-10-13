#nullable disable
// MA-8-7 - the foreign classifier. A third-party model holds types the office never made. An element is FOREIGN when its type is not the office's:
// its "Family : Type" (a system type: its type name alone - system family names are translated in a non-English Revit) is no row of the type
// catalogue under its category. Every model-category instance Revit read is placed in one of four bins:
//   settled      a catalogue row - not foreign, counted for context;
//   retype       Promote filed a ghost for it (a retype, a rehost, or a create that replaces a DirectShape);
//   gap          foreign with no exact office answer - Promote's hold reason, or "Sentinel does not retype <category>" for a category it does not read;
//   directshape  a DirectShape, a Generic Model instance or an in-place family Promote did not re-create (the reason is its hold).
// Pure - no Revit types - so tools/promote-check drives it, with the bridge's foreignOf judging the same cases from the same fixture
// (WebApp/bridge/fixtures/changeset-ops/foreign-cases.json). Commands.PromoteWalls reads the facts.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    /// <summary>One model-category instance as Revit read it (API thread). Category is the guideline's English key ("Walls", "Structural Columns")
    /// or the display name of a category it has no key for.</summary>
    public sealed class ForeignFact
    {
        public string UniqueId, Label, Category, Family, Type, Level;
        /// <summary>A system family type (a wall, a floor ...): judged by its type name alone.</summary>
        public bool System;
        /// <summary>"directshape" | "generic" | "inplace", or null for an ordinary instance.</summary>
        public string Shape;
    }

    /// <summary>One group of foreign (or settled) elements: a type in a bin.</summary>
    public sealed class ForeignRow
    {
        public string Category, Family, Type, Bin, Why;
        public int Count;
    }

    public sealed class ForeignReport
    {
        public const string Settled = "settled", Retype = "retype", Gap = "gap", DirectShape = "directshape";
        public List<ForeignRow> Rows = new List<ForeignRow>();
        public int NSettled, NRetype, NGap, NDirectShape;
        /// <summary>The distinct types among the foreign elements.</summary>
        public int Types;
        /// <summary>Set when the catalogue cannot judge: nothing is classified.</summary>
        public string NotChecked;
        public int Foreign => NRetype + NGap + NDirectShape;

        /// <summary>"Foreign (types not the office's): retype-able a · gap b · DirectShape/Generic Model c · settled d" - or why it was not judged.</summary>
        public string Line => NotChecked != null ? "Foreign types: not judged — " + NotChecked
            : $"Foreign (types not the office's): retype-able {NRetype} · gap {NGap} · DirectShape/Generic Model {NDirectShape} · settled {NSettled}";

        /// <summary>The foreign rows by category and size, at most <paramref name="max"/>, then how many more.</summary>
        public List<string> Lines(int max)
        {
            var foreign = Rows.Where(r => r.Bin != Settled).OrderByDescending(r => r.Count).ThenBy(r => r.Category, StringComparer.Ordinal).ThenBy(r => r.Type, StringComparer.Ordinal).ToList();
            var lines = foreign.Take(max).Select(r =>
                $"{r.Category} · {(string.IsNullOrEmpty(r.Family) || r.Bin == DirectShape ? "" : r.Family + " : ")}{r.Type ?? "(no type)"} — {r.Count} · {Word(r.Bin)}" + (string.IsNullOrEmpty(r.Why) ? "" : ": " + r.Why)).ToList();
            if (foreign.Count > max) lines.Add($"… and {foreign.Count - max} more type row(s)");
            return lines;
        }

        /// <summary>Foreign elements per category, most first - the refusal dialog's "top categories".</summary>
        public List<(string Category, int Count)> TopCategories() =>
            Rows.Where(r => r.Bin != Settled).GroupBy(r => r.Category).Select(g => (g.Key, g.Sum(r => r.Count))).OrderByDescending(x => x.Item2).ThenBy(x => x.Item1, StringComparer.Ordinal).ToList();

        private static string Word(string bin) => bin == Retype ? "retype-able" : bin == DirectShape ? "DirectShape/Generic Model" : bin == Gap ? "gap" : bin;
    }

    public static class ForeignTypes
    {
        /// <summary>The maximum length of a row's reason (the ledger row and the dialog keep one line).</summary>
        public const int MaxWhy = 200;

        /// <summary>Is this type NOT the office's? A system type by its type name alone, a loadable family's by its family and type (the catalogue's rows).</summary>
        public static bool IsForeign(GuidelineMatcher m, string category, string family, string type, bool system) =>
            system ? !m.CatalogHasType(category, type) : !m.CatalogHas(category, family, type);

        public static string NoCatalog(GuidelineMatcher m) => $"no type catalogue installed ({m.CatalogLabel}) — foreign types are not judged";

        /// <summary>The elements of <paramref name="facts"/> in their bins. <paramref name="plans"/> (null or empty before Promote has planned) say which a
        /// ghost covers (by the element's UniqueId; a replacing create's is the DirectShape's) and why the rest are held.</summary>
        public static ForeignReport Classify(IReadOnlyList<ForeignFact> facts, IReadOnlyList<StoreyPlan> plans, GuidelineMatcher m)
        {
            var r = new ForeignReport();
            if (!m.HasCatalog) { r.NotChecked = NoCatalog(m); return r; }
            var ghosted = new HashSet<string>(StringComparer.Ordinal);
            var held = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var p in plans ?? new List<StoreyPlan>())
            {
                foreach (var g in p.Ghosts)
                    if (g.ReplacesUid != null) ghosted.Add(g.ReplacesUid);
                    else if (g.UniqueId != null && (g.Op == "retype" || g.Op == "rehost")) ghosted.Add(g.UniqueId);
                foreach (var h in p.Held) if (h.UniqueId != null && !held.ContainsKey(h.UniqueId)) held[h.UniqueId] = h.Reason;
            }
            var rows = new Dictionary<string, ForeignRow>(StringComparer.Ordinal);
            var types = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var f in facts ?? new List<ForeignFact>())
            {
                if (f == null) continue;
                string bin, why = null;
                if (f.Shape != null)
                {
                    // A shape has no office type to be judged by: re-created (a ghost covers it) or a DirectShape/Generic Model row with its hold.
                    bin = ghosted.Contains(f.UniqueId) ? ForeignReport.Retype : ForeignReport.DirectShape;
                    if (bin == ForeignReport.DirectShape) why = held.TryGetValue(f.UniqueId ?? "", out var h) ? h : f.Shape == "inplace" ? "an in-place family — a person re-creates it" : "Promote re-creates only a wall- or floor-like shape";
                }
                else if (!IsForeign(m, f.Category, f.Family, f.Type, f.System)) bin = ForeignReport.Settled;
                else if (ghosted.Contains(f.UniqueId ?? "")) bin = ForeignReport.Retype;
                else
                {
                    bin = ForeignReport.Gap;
                    why = held.TryGetValue(f.UniqueId ?? "", out var h) ? h : $"Sentinel does not retype {f.Category}";
                }
                if (why != null && why.Length > MaxWhy) why = why.Substring(0, MaxWhy - 1) + "…";
                // the key: a type in a bin; a held reason differs element to element, so the first one stands for the group
                string key = f.Category + "|" + (f.Shape != null ? "" : f.Family) + "|" + (f.Shape != null ? "" : f.Type) + "|" + bin;
                if (!rows.TryGetValue(key, out var row))
                    rows[key] = row = new ForeignRow { Category = f.Category, Family = f.Shape != null ? null : f.Family, Type = f.Shape != null ? "(" + f.Shape + ")" : f.Type, Bin = bin, Why = why };
                row.Count++;
                switch (bin)
                {
                    case ForeignReport.Settled: r.NSettled++; break;
                    case ForeignReport.Retype: r.NRetype++; break;
                    case ForeignReport.Gap: r.NGap++; break;
                    default: r.NDirectShape++; break;
                }
                if (bin != ForeignReport.Settled) types.Add(f.Category + "|" + f.Family + "|" + f.Type);
            }
            r.Rows = rows.Values.ToList();
            r.Types = types.Count;
            return r;
        }
    }
}
