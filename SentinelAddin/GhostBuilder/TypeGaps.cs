#nullable disable
// MA-2c — type-gap groups (design §6.4 "Type gaps in the Holding Area"), pure, so tools/promote-check drives it. A Promote run's
// type gaps are the held elements the office has no type for (PromoteHeld.Gap: the DD rule names a type the catalogue lacks, or no
// catalogue type is named at the element's size). One run can hold hundreds, so they are grouped: by category and the type wanted,
// else the size — every element once. The run posts its groups as ONE type_gap row (CommandReports.TypeGaps); the bridge names each
// group and the Holding Area lists it until a lead dismisses it or an installed type_catalog@n holds the type (holding-logic.mjs).
// The snap is 0 (D16), so the size is exact: no band.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    public sealed class TypeGapGroup
    {
        public string Category, Want, Size, Key;
        public int Elements;
        /// <summary>"Storey · Label" of the first <see cref="TypeGaps.MaxLabels"/> elements; the catalogue's nearest types.</summary>
        public List<string> Labels = new List<string>(), Nearest = new List<string>();
    }

    public static class TypeGaps
    {
        /// <summary>The bridge's caps on one type_gap row (cde-store.mjs typeGapRow).</summary>
        public const int MaxGroups = 200, MaxLabels = 20, MaxNearest = 10;

        /// <summary>The run's gap groups, in the order the plans first meet them: each held element whose hold is a type gap, grouped
        /// by category and the type it wants (else its size); the facts its rules read (at most three), its labels and the nearest types.</summary>
        public static List<TypeGapGroup> Group(IReadOnlyList<StoreyPlan> plans) =>
            plans.SelectMany(p => p.Held.Where(h => h.Gap != null).Select(h => (p.Storey, Held: h)))
                .GroupBy(x => (x.Held.Gap.Category + "|" + (x.Held.Gap.Want != null ? "type " + x.Held.Gap.Want : "size " + x.Held.Gap.Size)).Trim().ToLowerInvariant())
                .Select(g =>
                {
                    var first = g.First().Held.Gap;
                    var elements = g.GroupBy(x => x.Held.UniqueId).Select(e => e.First()).ToList();
                    var key = string.Join("; ", g.Select(x => x.Held.Gap.Key).Where(k => !string.IsNullOrEmpty(k)).Distinct().Take(3));
                    return new TypeGapGroup
                    {
                        Category = first.Category, Want = first.Want, Size = first.Size,
                        Key = key.Length == 0 ? null : key, // the bridge refuses an empty key; none is null
                        Elements = elements.Count,
                        Labels = elements.Take(MaxLabels).Select(x => One(x.Storey + " · " + x.Held.Label)).ToList(),
                        Nearest = g.SelectMany(x => x.Held.Gap.Nearest ?? new List<string>()).Distinct().Take(MaxNearest).ToList(),
                    };
                })
                .ToList();

        // A label carries the element's Mark, which a person types freely: one line of at most 256 characters, as the bridge keeps it.
        private static string One(string s)
        {
            var t = new string(s.Select(ch => char.IsControl(ch) ? ' ' : ch).ToArray());
            return t.Length <= 256 ? t : t.Substring(0, 255) + "…";
        }

        /// <summary>One group in words: "Walls: "BDS_EXT_ARC_CMU_125 mm" is not in the catalogue — 2 element(s) (Function Exterior);
        /// nearest: BDS_EXT_ARC_CMU_100 mm, …", or "Doors: no type named at 915 x 2134 mm — 1 element(s) (…)".</summary>
        public static string Line(TypeGapGroup g) =>
            $"{g.Category}: " + (g.Want != null ? $"\"{g.Want}\" is not in the catalogue" : $"no type named at {g.Size}") +
            $" — {g.Elements} element(s)" + (string.IsNullOrEmpty(g.Key) ? "" : $" ({g.Key})") +
            (g.Nearest.Count > 0 ? "; nearest: " + string.Join(", ", g.Nearest.Take(3)) : "");
    }
}
