#nullable disable
// MA-8-9: a stair flag's Revit half, pure. A person's pick (two plan corners on a Building Story's plan) becomes the box the bridge's
// POST /changesets/:key/:id/flags takes: {kind: "stair", storey, box: {min, max}} in whole mm in the model's frame (the Level.Elevation
// frame a changeset's places use). The bridge validates the box (changesets-logic checkStairFlag) and its 400 words come back to the
// window - this file keeps no copy of that check (amendment 14). Line() is the one-line account the window shows beside a flag.
using System;
using System.Globalization;
using System.Text.Json;

namespace Sentinel.GhostBuilder
{
    internal sealed class StairFlag
    {
        public string Storey;
        public double[] Min;   // [x, y, z] mm
        public double[] Max;

        /// <summary>The box of two picked plan corners (mm, any order) on a storey: x and y sorted, z from the level to the next Building Story's
        /// elevation. null with <paramref name="why"/> when there is no story above (the box's top is not known; a person decides).</summary>
        public static StairFlag FromPick(string levelName, double levelElevMm, double? nextStoryElevMm, double[] p1, double[] p2, out string why)
        {
            why = null;
            if (nextStoryElevMm is not double top)
            {
                why = $"no Building Story above {levelName} — the box's top is not known; a person decides";
                return null;
            }
            double R(double v) => Math.Round(v, MidpointRounding.AwayFromZero);
            return new StairFlag
            {
                Storey = levelName,
                Min = new[] { R(Math.Min(p1[0], p2[0])), R(Math.Min(p1[1], p2[1])), R(levelElevMm) },
                Max = new[] { R(Math.Max(p1[0], p2[0])), R(Math.Max(p1[1], p2[1])), R(top) },
            };
        }

        /// <summary>The POST body: exactly {kind, storey, box} (the bridge refuses any other key).</summary>
        public string Body() => JsonSerializer.Serialize(new { kind = "stair", storey = Storey, box = new { min = Min, max = Max } });

        /// <summary>"Stair on L01 · 3200 × 5400 mm, 3000 mm tall".</summary>
        public static string Line(string storey, double[] min, double[] max)
        {
            string F(double v) => v.ToString("0", CultureInfo.InvariantCulture);
            if (min == null || max == null || min.Length < 3 || max.Length < 3) return $"Stair on {storey}";
            return $"Stair on {storey} · {F(max[0] - min[0])} × {F(max[1] - min[1])} mm, {F(max[2] - min[2])} mm tall";
        }
    }
}
