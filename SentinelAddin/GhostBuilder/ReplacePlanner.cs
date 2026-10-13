#nullable disable
// MA-8-7 (D16) - the pure planner of Promote's replacing creates. A third-party model's DirectShape (a Revit-opened IFC, a Matterport/aurivus
// export) that is wall- or floor-like is re-created as an office wall or floor: an ordinary `create` ghost that carries `replaces` {unique_id,
// box}, so the executor deletes the original in the same Undo. Facts read from the pinned document go in (ShapeFact: one upright prism's box and
// its bottom loop); the ghost to file or the reason a person decides comes out. No Revit types, so tools/promote-check drives it offline.
//
// EXACT OR A PERSON (D16), as the walls: the type is the DD rule's at confidence 1 and already loaded here, at the shape's own thickness; anything
// else is a held row with its reason. A replacing create removes an element, so it is proposed only signed in (the bridge refuses one the machine
// credential files).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    /// <summary>One DirectShape, Generic Model instance or in-place family as Revit read it (API thread). Box and Loop are in model mm.</summary>
    public sealed class ShapeFact
    {
        public string UniqueId, Label, Category;
        /// <summary>"directshape" | "generic" (an OST_GenericModel family instance) | "inplace" (an in-place family).</summary>
        public string Kind;
        /// <summary>Sentinel's own mass (ApplicationId "Sentinel"): Shell a Mass shells it, Promote never removes it.</summary>
        public bool Sentinel, Pinned, InGroup, InOption;
        public double[] BoxMin, BoxMax;
        /// <summary>The bottom face's outer loop (straight edges, [x, y, z] mm), or null with <see cref="PrismWhy"/>.</summary>
        public List<double[]> Loop;
        /// <summary>Why the shape is not one upright prism (several solids, a sloped face, a curved edge ...), or null.</summary>
        public string PrismWhy;
    }

    /// <summary>One shape's verdict: a ghost to file, or the reason a person decides (with a type gap when the office lacks the type).</summary>
    public sealed class ReplaceRow
    {
        public ShapeFact Fact;
        /// <summary>The storey the row rides on (the story the shape stands on, else the nearest one below its middle).</summary>
        public string Storey, Held;
        public PromoteGhost Ghost;
        public TypeGap Gap;
    }

    public static class ReplacePlanner
    {
        public const double TolMm = 0.5;
        /// <summary>A wall-like prism: its short side (the wall's thickness), and the least its long side and height are of it.</summary>
        public const double MinThickMm = 50, MaxThickMm = 1000, MinRatio = 2;
        /// <summary>A right angle within this (degrees); a rectangle's corners.</summary>
        public const double RightAngleDeg = 0.5;

        public static List<ReplaceRow> Plan(IReadOnlyList<ShapeFact> shapes, IReadOnlyList<LevelFact> levels, IReadOnlyList<WallFact> walls,
            IReadOnlyDictionary<string, string> docBasicWallTypes, IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes,
            GuidelineMatcher m, bool signedIn)
        {
            var rows = new List<ReplaceRow>();
            var stories = (levels ?? new List<LevelFact>()).Where(l => l != null && l.IsStory).OrderBy(l => l.ElevationMm).ToList();
            foreach (var s in shapes ?? new List<ShapeFact>())
            {
                if (s == null || s.UniqueId == null) continue;
                var row = new ReplaceRow { Fact = s, Storey = RidesOn(stories, s) };
                rows.Add(row);
                row.Held = Judge(s, stories, levels, walls, docBasicWallTypes, docTypes, m, signedIn, row);
            }
            return rows;
        }

        // The storey a held shape's row rides on: the highest story at or below the box's middle, else the lowest story.
        private static string RidesOn(List<LevelFact> stories, ShapeFact s)
        {
            if (stories.Count == 0 || s.BoxMin == null || s.BoxMax == null) return "";
            double mid = (s.BoxMin[2] + s.BoxMax[2]) / 2;
            return (stories.LastOrDefault(l => l.ElevationMm <= mid + TolMm) ?? stories[0]).Name;
        }

        // The reason a person decides, or null with row.Ghost set.
        private static string Judge(ShapeFact s, List<LevelFact> stories, IReadOnlyList<LevelFact> levels, IReadOnlyList<WallFact> walls,
            IReadOnlyDictionary<string, string> docBasicWallTypes, IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes,
            GuidelineMatcher m, bool signedIn, ReplaceRow row)
        {
            if (s.Sentinel) return "Sentinel's own mass (ApplicationId Sentinel) — Shell it (2c); Promote does not remove it";
            if (s.Kind == "inplace") return "an in-place family — a person re-creates it"; // amendment 14: deleting the last instance would delete its family
            if (s.Pinned) return "pinned — Sentinel does not remove a pinned element";
            if (s.InGroup) return "in a group — Sentinel does not edit group members";
            if (s.InOption) return "in a design option — Sentinel does not edit design options";
            if (s.PrismWhy != null) return "a DirectShape that is not one upright prism (" + s.PrismWhy + ") — a person decides";
            if (s.BoxMin == null || s.BoxMax == null || s.Loop == null || s.Loop.Count < 3) return "a DirectShape that is not one upright prism (no bottom loop was read) — a person decides";
            if (!signedIn) return "a replacing create removes an element: sign in (Sentinel ▸ Sign in) and run Promote again";
            if (!m.HasCatalog) return $"no type catalogue installed ({m.CatalogLabel}) — the exact DD type cannot be checked (D16)";

            double dx = s.BoxMax[0] - s.BoxMin[0], dy = s.BoxMax[1] - s.BoxMin[1], h = s.BoxMax[2] - s.BoxMin[2];
            string size = $"{Mm(dx)} x {Mm(dy)} x {Mm(h)} mm";
            string kind = s.Kind == "generic" ? "Generic Model" : "DirectShape";
            string what = $"{s.Label} ({s.Category} {kind}, {size})";
            var rect = Rectangle(s.Loop, out double shortSide, out double longSide, out var a0, out var a1);
            bool wallShape = rect && shortSide >= MinThickMm - TolMm && shortSide <= MaxThickMm + TolMm && longSide >= MinRatio * shortSide && h >= MinRatio * shortSide;
            bool floorShape = !wallShape && h <= MaxThickMm + TolMm && h <= Math.Min(dx, dy) / 2 + TolMm;
            if (!wallShape && !floorShape) return $"{what}: neither wall- nor floor-like (a column, a beam?) — a person decides";

            if (wallShape)
            {
                var story = StoryAt(stories, s.BoxMin[2], out double off);
                if (story == null) return $"{what}: its bottom sits {Mm(off)} mm off any story — a person decides";
                double t = Math.Round(shortSide);
                if (Math.Abs(shortSide - t) > 0.1) return $"{what}: thickness {shortSide.ToString("0.###", CultureInfo.InvariantCulture)} mm is not a whole millimetre — exact match only (D16)";
                // The storey's barriers as the outer boundary reads them (PromoteWallsPlanner.Plan's rule), then this wall's own centre line last.
                var segs = Barriers(walls, levels, story);
                segs.Add(new WallLocation.Segment { X0 = a0[0], Y0 = a0[1], X1 = a1[0], Y1 = a1[1], WidthMm = t });
                string loc = WallLocation.Locate(segs, segs.Count - 1, out string locWhy);
                var ps = new Dictionary<string, string>();
                if (loc != null) ps["Location"] = loc;
                var res = m.Resolve(new GuidelineInput { Category = "Walls", Params = ps, ThicknessMm = t });
                string used = PromoteWallsPlanner.What(ps, res.Matched);
                if (res.Source != "rule" || string.IsNullOrWhiteSpace(res.Type))
                    return $"{what}: no DD rule for {used}, {Mm(t)} mm in {m.Standard}" + (loc == null ? $" (location unknown: {locWhy})" : "");
                if (res.Confidence != 1)
                {
                    row.Gap = new TypeGap { Category = "Walls", Want = res.Type, Size = Mm(t) + " mm", Key = used, Nearest = res.Available ?? new List<string>() };
                    return m.Gap(what, res.Why);
                }
                if (docBasicWallTypes == null || !docBasicWallTypes.ContainsKey(res.Type))
                    return $"{what}: \"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types";
                var next = PromoteWallsPlanner.NextStory(levels, story.ElevationMm);
                bool toNext = next != null && Math.Abs(next.ElevationMm - s.BoxMax[2]) <= TolMm;
                row.Storey = story.Name;
                row.Ghost = new PromoteGhost
                {
                    Op = "create", Kind = "wall", UniqueId = s.UniqueId, Label = s.Label, TypeName = res.Type, LevelName = story.Name,
                    ReplacesUid = s.UniqueId, ReplacesMin = s.BoxMin, ReplacesMax = s.BoxMax,
                    StartMm = new[] { a0[0], a0[1], s.BoxMin[2] }, EndMm = new[] { a1[0], a1[1], s.BoxMin[2] },
                    TopLevel = toNext ? next.Name : null, TopElevationMm = toNext ? (double?)null : s.BoxMax[2],
                    Reason = $"re-create {s.Label} ({s.Category} {kind}, {size}) as {res.Type} — the original is removed in the same Undo (D16)",
                };
                return null;
            }
            else
            {
                var story = StoryAt(stories, s.BoxMax[2], out double off); // a floor hangs below its level: its top is the story
                if (story == null) return $"{what}: its top sits {Mm(off)} mm off any story — a person decides";
                double t = Math.Round(h);
                if (Math.Abs(h - t) > 0.1) return $"{what}: thickness {h.ToString("0.###", CultureInfo.InvariantCulture)} mm is not a whole millimetre — exact match only (D16)";
                var res = m.Resolve(new GuidelineInput { Category = "Floors", Params = new Dictionary<string, string>(), ThicknessMm = t });
                if (res.Source != "rule" || string.IsNullOrWhiteSpace(res.Type)) return $"{what}: no DD rule for no facts, {Mm(t)} mm in {m.Standard}";
                if (res.Confidence != 1)
                {
                    row.Gap = new TypeGap { Category = "Floors", Want = res.Type, Size = Mm(t) + " mm", Key = "no facts", Nearest = res.Available ?? new List<string>() };
                    return m.Gap(what, res.Why);
                }
                IReadOnlyDictionary<string, double?> types = null;
                if (docTypes == null || !docTypes.TryGetValue("Floors", out types) || types == null || !types.TryGetValue(res.Type, out var build))
                    return $"{what}: \"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types";
                if (!(build.HasValue && Math.Abs(build.Value - t) <= TolMm))
                    return $"{what}: \"{res.Type}\" {(build.HasValue ? "is " + Mm(build.Value) + " mm thick" : "has no build-up")} in this model, the shape is {Mm(t)} mm — a person decides";
                row.Storey = story.Name;
                row.Ghost = new PromoteGhost
                {
                    Op = "create", Kind = "floor", UniqueId = s.UniqueId, Label = s.Label, TypeName = res.Type, LevelName = story.Name,
                    ReplacesUid = s.UniqueId, ReplacesMin = s.BoxMin, ReplacesMax = s.BoxMax,
                    LoopMm = s.Loop.Select(p => new[] { p[0], p[1], s.BoxMax[2] }).ToList(),
                    Reason = $"re-create {s.Label} ({s.Category} {kind}, {size}) as {res.Type} — the original is removed in the same Undo (D16)",
                };
                return null;
            }
        }

        /// <summary>The story whose elevation is within 0.5 mm of <paramref name="z"/>, or null with how far the nearest is.</summary>
        private static LevelFact StoryAt(List<LevelFact> stories, double z, out double off)
        {
            var near = stories.OrderBy(l => Math.Abs(l.ElevationMm - z)).FirstOrDefault();
            off = near == null ? double.NaN : Math.Abs(near.ElevationMm - z);
            return near != null && off <= TolMm ? near : null;
        }

        // The storey's barriers, as PromoteWallsPlanner.Plan reads them: the walls based on it, and every other wall that crosses its plane.
        private static List<WallLocation.Segment> Barriers(IReadOnlyList<WallFact> walls, IReadOnlyList<LevelFact> levels, LevelFact story)
        {
            var byName = new Dictionary<string, LevelFact>(StringComparer.Ordinal);
            foreach (var l in levels ?? new List<LevelFact>()) if (l?.Name != null && !byName.ContainsKey(l.Name)) byName[l.Name] = l;
            double Elev(string level) => level != null && byName.TryGetValue(level, out var l) ? l.ElevationMm : double.MaxValue;
            double Top(WallFact w) => w.TopLevel == null ? Elev(w.BaseLevel) + w.BaseOffsetMm + w.HeightMm
                : byName.TryGetValue(w.TopLevel, out var t) ? t.ElevationMm + w.TopOffsetMm : double.MaxValue;
            double plane = story.ElevationMm;
            return (walls ?? new List<WallFact>()).Where(w => w.Line != null && (w.BaseLevel == story.Name
                    || (Elev(w.BaseLevel) + w.BaseOffsetMm <= plane + TolMm && Top(w) > plane + TolMm)))
                .Select(w => w.Line).ToList();
        }

        /// <summary>Is the loop a rectangle (four corners, right angles within 0.5 degrees)? Its short and long sides, and the centre line along the
        /// long axis: the midpoints of the two short edges, a0 to a1.</summary>
        public static bool Rectangle(IReadOnlyList<double[]> loop, out double shortSide, out double longSide, out double[] a0, out double[] a1)
        {
            shortSide = longSide = 0; a0 = a1 = null;
            var p = loop.ToList();
            if (p.Count == 5 && Math.Abs(p[0][0] - p[4][0]) < 1e-6 && Math.Abs(p[0][1] - p[4][1]) < 1e-6) p.RemoveAt(4);
            if (p.Count != 4) return false;
            for (int i = 0; i < 4; i++)
            {
                var u = new[] { p[(i + 1) % 4][0] - p[i][0], p[(i + 1) % 4][1] - p[i][1] };
                var v = new[] { p[(i + 2) % 4][0] - p[(i + 1) % 4][0], p[(i + 2) % 4][1] - p[(i + 1) % 4][1] };
                double lu = Math.Sqrt(u[0] * u[0] + u[1] * u[1]), lv = Math.Sqrt(v[0] * v[0] + v[1] * v[1]);
                if (lu < 1e-6 || lv < 1e-6) return false;
                double ang = Math.Acos(Math.Max(-1, Math.Min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)))) * 180 / Math.PI;
                if (Math.Abs(ang - 90) > RightAngleDeg) return false;
            }
            double l01 = Dist(p[0], p[1]), l12 = Dist(p[1], p[2]);
            shortSide = Math.Min(l01, l12); longSide = Math.Max(l01, l12);
            // the short edges are 0-1 and 2-3 when l01 is short, else 1-2 and 3-0
            var (s0, s1, t0, t1) = l01 <= l12 ? (p[0], p[1], p[2], p[3]) : (p[1], p[2], p[3], p[0]);
            a0 = new[] { (s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2 };
            a1 = new[] { (t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2 };
            return true;
        }

        private static double Dist(double[] a, double[] b) => Math.Sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
        private static string Mm(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);
    }
}
