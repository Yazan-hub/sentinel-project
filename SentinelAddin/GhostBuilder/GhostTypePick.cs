#nullable disable
// MA-1a step 1: the one loaded family type a Ghost row names — exact, or a person (D16). Pure (family and type names), so
// ghost-p2-check proves it without Revit. The rule of ChangesetExecutor.CreateType (exact name, the family when given; none →
// a gap; more than one → a person decides) plus the row a layers@n standard produces: a family with no type names its ONLY
// type. Never the first one loaded — the fallback this replaces (ElementPlacementFactory.FallbackSymbol, audit GHB).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    public static class GhostTypePick
    {
        /// <summary>The index in <paramref name="loaded"/> (one category's family types) of the one the row names, or -1 with
        /// <paramref name="why"/> in words. Names compare as Revit's do: case- and space-insensitive.</summary>
        public static int Pick(IReadOnlyList<(string Family, string Type)> loaded, string category, string family, string type, out string why)
        {
            why = null;
            bool f = !string.IsNullOrWhiteSpace(family), t = !string.IsNullOrWhiteSpace(type);
            if (!f && !t)
            {
                why = $"the layer mapping names no {category} family or type — Sentinel never takes the first one loaded; pick one in the review";
                return -1;
            }
            var hits = Enumerable.Range(0, loaded?.Count ?? 0)
                .Where(i => (!f || Same(loaded[i].Family, family)) && (!t || Same(loaded[i].Type, type)))
                .ToList();
            if (hits.Count == 1) return hits[0];
            string label = f && t ? $"{family} : {type}" : f ? family : type;
            if (hits.Count == 0)
                why = f && !t
                    ? $"{category} family \"{family}\" is not loaded in this model — load it or set the Ghost family library"
                    : $"{category} type \"{label}\" is not loaded in this model — load it or pick a loaded type in the review";
            else
                why = f && !t
                    ? $"{category} family \"{family}\" has {hits.Count} types — pick one in the review"
                    : $"{hits.Count} {category} types are named \"{label}\" — a person decides (pick one in the review)";
            return -1;
        }

        private static bool Same(string a, string b) => string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
