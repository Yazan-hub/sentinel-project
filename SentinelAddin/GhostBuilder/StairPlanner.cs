#nullable disable
// MA-8-10: a stair from a flag, the pure planner. Facts go in - the flag (storey, box, who filed it), the model's stories, the guideline's Stairs
// rule and the facts of the model's StairsType - and out comes either the POST /changesets/:key body of ONE stair or the reason a person decides
// (D9). No Revit types, so tools/promote-check drives it offline; Commands.ReviewChangesets reads the facts and files the body.
//
// ONE STRAIGHT RUN OR A PERSON. The box says where the stair is, not how it turns: a run that does not fit the box's long side, a landing, a
// winder, a width the type does not allow - each is a hold in words. The riser count is the type's maximum riser rule (Risers); the run is
// (N - 1) x going long in plan - spike S1: N x going gives N + 1 risers and a top-end warning. Railings are the type's, added by Revit at the
// stair edit scope's commit; Sentinel adds none.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    /// <summary>The facts of the model's StairsType the plan needs, in mm (MaxRiserHeight, MinTreadDepth, MinRunWidth).</summary>
    internal sealed class StairTypeFacts
    {
        public double MaxRiserMm, MinTreadMm, MinRunWidthMm;
    }

    /// <summary>A plan: <see cref="Body"/> to file, or <see cref="Hold"/> (a whole sentence) when a person decides.</summary>
    internal sealed class StairPlan
    {
        public object Body;
        public string Hold;
        /// <summary>The one-line account for the dialog ("16 risers of 187.5 mm, going 250 mm, width 1200 mm, run 3750 mm").</summary>
        public string Line;
        public int Risers;
        public double GoingMm, WidthMm, RunMm;
    }

    internal static class StairPlanner
    {
        /// <summary>The slack a riser rule allows (mm): float noise only (levels and the type's limits come from feet). Review fix: it was 0.5 mm, which let a stair
        /// over the type's maximum riser (or under its minimum going / width) by up to 0.5 mm through every guard.</summary>
        public const double TolMm = 0.001;
        /// <summary>How far (mm) the flag's box may start from its storey's elevation.</summary>
        public const double BoxBaseMm = 300;

        /// <summary>The riser count for a floor-to-floor height under a maximum riser: ceil((f2f - 0.001) / max). The ONE rule - the planner, the
        /// executor's re-check and the fixture share it (batch-4 amendment 1): levels and the type's maximum come from feet, so a plain ceil turns
        /// 3040.0000001 / 190 into 17 and the executor would refuse a plan it made itself. 3000/187.5 = 16, 3040/190 = 16, 3040.6/190 = 17.</summary>
        public static int Risers(double f2fMm, double maxRiserMm) => (int)Math.Ceiling((f2fMm - TolMm) / maxRiserMm);

        private static string F(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);

        /// <summary>The two ends of the box's long plan side, by compass: ("west", "east", x at west, x at east) when it runs along x, else
        /// ("south", "north", y, y). The person says which end the stair rises from - the box does not.</summary>
        public static (string Low, string High, double LowAt, double HighAt, bool AlongX) Ends(double[] min, double[] max) =>
            max[0] - min[0] >= max[1] - min[1] ? ("west", "east", min[0], max[0], true) : ("south", "north", min[1], max[1], false);

        /// <param name="stories">ChangesetExecutor.Stories(doc): the model's levels. The base is the story named <paramref name="storey"/>, the top the next
        /// Building Story above it.</param>
        /// <param name="rule">The guideline's Stairs rule for the storey (GuidelineMatcher.StairRule).</param>
        /// <param name="type">The StairsType's facts, or null when it could not be read.</param>
        /// <param name="bottomAtMin">The run rises from the box's low end (west / south) when true, else from the high end.</param>
        public static StairPlan Plan(string flagName, string changeset, string uid, string storey, double[] min, double[] max, bool bottomAtMin,
                                     IReadOnlyList<LevelFact> stories, (string Family, string Type, double WidthMm, string Source) rule, StairTypeFacts type, string actor)
        {
            StairPlan Hold(string why) => new StairPlan { Hold = why };
            var bottom = stories?.FirstOrDefault(l => l != null && string.Equals(l.Name, storey, StringComparison.OrdinalIgnoreCase));
            if (bottom == null) return Hold($"level \"{storey}\" is not in this model — the flag's storey; a person decides");
            var top = PromoteWallsPlanner.NextStory(stories, bottom.ElevationMm);
            if (top == null)
                return Hold($"There is no Building Story above {storey}, so the stair's height is unknown. Add a story level above it (mark it Building Story), then propose the stair again.");
            if (Math.Abs(min[2] - bottom.ElevationMm) > BoxBaseMm)
                return Hold($"the flag's box starts at {F(min[2])} mm, not at {storey} ({F(bottom.ElevationMm)} mm) — flag the stair again on the plan of its storey");
            if (type == null || type.MaxRiserMm <= 0 || type.MinTreadMm <= 0)
                return Hold($"the stair type \"{rule.Family} : {rule.Type}\" has no readable maximum riser and minimum tread — a person decides");

            double f2f = top.ElevationMm - bottom.ElevationMm;
            int n = Risers(f2f, type.MaxRiserMm);
            if (n < 2 || n > 60) return Hold($"{n} risers is outside 2 to 60 ({F(f2f)} mm between {storey} and {top.Name}, type maximum riser {F(type.MaxRiserMm)} mm) — a person decides");
            double going = type.MinTreadMm, width = rule.WidthMm, run = (n - 1) * going;
            double dx = max[0] - min[0], dy = max[1] - min[1];
            bool alongX = dx >= dy;
            double longSide = alongX ? dx : dy, shortSide = alongX ? dy : dx;
            if (run > longSide + 1)
                return Hold($"{n} risers at {F(going)} mm going need {F(run)} mm; the box is {F(longSide)} mm long — a landing or a turn is a person's (D9)");
            if (width < type.MinRunWidthMm - TolMm)
                return Hold($"the rule's {F(width)} mm is under the type's minimum run width {F(type.MinRunWidthMm)} mm");
            if (width > shortSide + 1)
                return Hold($"the rule's {F(width)} mm run is wider than the box ({F(shortSide)} mm across) — a person decides");

            // the run starts at the bottom end's edge, centred across the box; z is the storey's elevation (Level.Elevation frame, as every place is)
            double across = (alongX ? (min[1] + max[1]) : (min[0] + max[0])) / 2;
            double from = bottomAtMin ? (alongX ? min[0] : min[1]) : (alongX ? max[0] : max[1]);
            double to = bottomAtMin ? from + run : from - run;
            double[] P(double a) => alongX ? new[] { a, across, bottom.ElevationMm } : new[] { across, a, bottom.ElevationMm };
            double riser = f2f / n;
            string name = $"Stair · {storey} → {top.Name}";
            string reason = $"{n} risers of {F(riser)} mm (type maximum {F(type.MaxRiserMm)} mm), going {F(going)} mm (type minimum), width {F(width)} mm (from {rule.Source}) — " +
                            $"one straight run between {storey} and {top.Name}; landings, turns, winders and railings are a person's";
            var element = new
            {
                kind = "stair",
                validate = new { identity = new { Class = "IFCSTAIR", Name = name } },
                reason,
                place = new
                {
                    LevelName = bottom.Name, TopLevel = top.Name, FamilyName = rule.Family, TypeName = rule.Type,
                    LocationCurve = new { start = P(from), end = P(to) },
                    Width = width, Risers = n, Going = going,
                },
                from_flag = new { changeset, unique_id = uid },
            };
            return new StairPlan
            {
                Body = new { name = $"{name} · from {flagName}", source = "promote", actor, elements = new[] { element } },
                Risers = n, GoingMm = going, WidthMm = width, RunMm = run,
                Line = $"{n} risers of {F(riser)} mm, going {F(going)} mm, width {F(width)} mm, run {F(run)} mm",
            };
        }

        /// <summary>The line the review window and the desk read beside a stair: "to L01 · 16 risers, going 250 mm, width 1200 mm — one straight run; landings, turns and railings are a person's".</summary>
        public static string RowWords(string topLevel, int? risers, double? going, double? width) =>
            $"to {topLevel} · {risers} risers, going {F(going ?? 0)} mm, width {F(width ?? 0)} mm — one straight run; landings, turns and railings are a person's";
    }
}
