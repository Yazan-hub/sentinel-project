#nullable disable
// Read the model's DATUM — levels and grids — from the drawings, deterministically. A proper as-built
// modelling workflow builds the datum FIRST (levels from the sections/elevations, grids from the plan),
// then hosts every element to it. GhostBuilder used to skip this: walls got a default 10ft height and no
// grids. This is the missing foundation — real floor-to-floor heights and a real column grid, read from
// geometry the office already draws to its layer standard.
//
// PURE 2D — no Revit — so it's offline-testable; DatumBuilder (Revit) creates the Levels/Grids this finds.
// The heights come from LINE POSITIONS, not text: a BDS section is drawn to real mm scale, so a level
// line's Y-coordinate IS its elevation and a grid line's position IS the grid location. That sidesteps the
// unreliable business of reading imported-DWG text; names are auto-generated here and corrected in review.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    public sealed class DetectedLevel
    {
        public string Name;         // auto: "Level 0" (ground) … reviewable
        public double ElevationMm;  // the level line's height in the section, mm
        public bool Story = true;   // MA-5b-7 (DAT-2): Building Story, as the person leaves it in the review
    }

    public sealed class DetectedGrid
    {
        public string Name;         // auto: "1","2"… for vertical, "A","B"… for horizontal
        public double X1, Y1, X2, Y2;
        public bool Vertical;       // runs up the page (constant X) → numbered; else lettered
    }

    public static class DatumFromDrawing
    {
        /// <summary>
        /// Levels from the horizontal lines on a section's levels layer. Each distinct height (the line's Y,
        /// in mm) becomes a level; near-coincident lines merge (double-drawn datums). Sorted ground-up and
        /// named Level 0, 1, 2… — the reviewer renames to the office's own (Ground, L1, Roof).
        /// </summary>
        /// <param name="mergeTolMm">Heights within this are the same level (default 50 mm).</param>
        /// <summary>MA-5b-2 (DAT-4): storey spacing that says the units are wrong. Every gap under 1.5 m — no storey is that low (a metres
        /// drawing read as millimetres is 1000 x too small); an FFL/SSL pair 300 mm apart beside a 3 m storey is not flagged. A gap
        /// over 10 m: the units, or a level line missing.</summary>
        public static List<string> SpacingWarnings(IReadOnlyList<DetectedLevel> levels, IEnumerable<Seg> sectionLines = null)
        {
            var w = new List<string>();
            // review: a metres drawing read as millimetres puts every storey within the 50 mm merge — one level is left to judge. Read the
            // lines again 1000 x finer: a whole stack under a few mm is the units, not one level.
            if (levels.Count < 2 && sectionLines != null) levels = Levels(sectionLines, 0.05); // the default 50 mm merge, 1000 x finer
            var up = levels.OrderBy(l => l.ElevationMm).ToList();
            if (up.Count < 2) return w;
            var gaps = up.Zip(up.Skip(1), (a, b) => (a, b, mm: b.ElevationMm - a.ElevationMm)).ToList();
            double most = gaps.Max(g => g.mm);
            if (most < 1500)
                w.Add($"The levels are at most {most:0} mm apart — no storey is under 1.5 m: the drawing's units look wrong (a metres drawing read as millimetres?). Choose its units in the drawing window and read it again.");
            foreach (var g in gaps.Where(g => g.mm > 10_000))
                w.Add($"{g.a.Name} and {g.b.Name} are {g.mm / 1000:0.#} m apart — over 10 m between storeys: check the drawing's units, or a level line is missing.");
            return w;
        }

        public static List<DetectedLevel> Levels(IEnumerable<Seg> sectionLines, double mergeTolMm = 50.0)
        {
            // Only near-horizontal lines are level datums; a section is full of vertical/diagonal linework.
            var ys = (sectionLines ?? Enumerable.Empty<Seg>())
                .Where(s => s.Length > 1e-6 && Math.Abs(s.Y2 - s.Y1) < Math.Abs(s.X2 - s.X1) * 0.02) // ~horizontal
                .Select(s => (s.Y1 + s.Y2) * 0.5)
                .OrderBy(y => y)
                .ToList();

            var merged = new List<double>();
            foreach (double y in ys)
                if (merged.Count == 0 || Math.Abs(y - merged[merged.Count - 1]) > mergeTolMm)
                    merged.Add(y);

            if (merged.Count == 0) return new List<DetectedLevel>();

            // Ground = the lowest level = 0; others measured up from it, so the model's datum is sensible
            // regardless of where the section happened to sit in the DWG.
            double ground = merged[0];
            return merged.Select((y, i) => new DetectedLevel
            {
                Name = i == 0 ? "Level 0" : "Level " + i,
                ElevationMm = Math.Round(y - ground, 1),
            }).ToList();
        }

        /// <summary>
        /// Grids from the lines on a plan's grid layer. Long lines are split into VERTICAL (constant X →
        /// numbered 1,2,3 left→right) and HORIZONTAL (constant Y → lettered A,B,C bottom→top), the standard
        /// convention. Near-parallel duplicates on the same axis-position merge. Reviewer can relabel.
        /// </summary>
        public static List<DetectedGrid> Grids(IEnumerable<Seg> planLines, double mergeTolMm = 100.0, ISet<char> skipLetters = null)
        {
            skipLetters ??= DefaultSkip;
            var lines = (planLines ?? Enumerable.Empty<Seg>()).Where(s => s.Length > 1e-6).ToList();

            var vertical = Dedupe(lines.Where(IsVertical).OrderBy(s => (s.X1 + s.X2) * 0.5),
                                  s => (s.X1 + s.X2) * 0.5, mergeTolMm);
            var horizontal = Dedupe(lines.Where(IsHorizontal).OrderBy(s => (s.Y1 + s.Y2) * 0.5),
                                    s => (s.Y1 + s.Y2) * 0.5, mergeTolMm);

            var grids = new List<DetectedGrid>();
            for (int i = 0; i < vertical.Count; i++)
                grids.Add(New(vertical[i], (i + 1).ToString(), true));       // 1, 2, 3…
            for (int i = 0; i < horizontal.Count; i++)
                grids.Add(New(horizontal[i], Letter(i, skipLetters), false)); // A, B, C… — never I or O (MA-5b-7, the drawing convention)
            return grids;
        }

        private static bool IsVertical(Seg s)   => Math.Abs(s.X2 - s.X1) < Math.Abs(s.Y2 - s.Y1) * 0.02;
        private static bool IsHorizontal(Seg s) => Math.Abs(s.Y2 - s.Y1) < Math.Abs(s.X2 - s.X1) * 0.02;

        // Keep the LONGEST line at each axis-position (grid lines are long; a duplicate tick is short).
        private static List<Seg> Dedupe(IEnumerable<Seg> ordered, Func<Seg, double> axis, double tol)
        {
            var outp = new List<Seg>();
            foreach (var s in ordered)
            {
                if (outp.Count > 0 && Math.Abs(axis(s) - axis(outp[outp.Count - 1])) <= tol)
                {
                    if (s.Length > outp[outp.Count - 1].Length) outp[outp.Count - 1] = s; // prefer the longer
                    continue;
                }
                outp.Add(s);
            }
            return outp;
        }

        private static DetectedGrid New(Seg s, string name, bool vertical) => new DetectedGrid
        { Name = name, X1 = s.X1, Y1 = s.Y1, X2 = s.X2, Y2 = s.Y2, Vertical = vertical };

        /// <summary>MA-5b-7 (DAT-1): the letters a grid is never named by unless the layers@n datum section says otherwise — I and O
        /// read as 1 and 0.</summary>
        public static readonly ISet<char> DefaultSkip = new HashSet<char> { 'I', 'O' };

        // A, B, … Z, AA, AB … — spreadsheet-column style over the letters not skipped, so a big grid never runs out of names.
        public static string Letter(int i, ISet<char> skip = null)
        {
            var abc = Enumerable.Range('A', 26).Select(c => (char)c).Where(c => !(skip ?? DefaultSkip).Contains(c)).ToArray();
            if (abc.Length == 0) abc = Enumerable.Range('A', 26).Select(c => (char)c).ToArray();
            string s = "";
            for (int n = i; ; n = n / abc.Length - 1)
            {
                s = abc[n % abc.Length] + s;
                if (n < abc.Length) break;
            }
            return s;
        }

        /// <summary>MA-5b-7 (DAT-1): a grid already in the model on the same line — parallel within 0.5° and both of the new grid's ends
        /// within <paramref name="tolMm"/> of its line. Revit's grid is kept; the new one is not created.</summary>
        public static bool SameLine(DetectedGrid g, double x1, double y1, double x2, double y2, double tolMm = 10)
        {
            double dx = x2 - x1, dy = y2 - y1, l = Math.Sqrt(dx * dx + dy * dy), gx = g.X2 - g.X1, gy = g.Y2 - g.Y1, gl = Math.Sqrt(gx * gx + gy * gy);
            if (l <= 0 || gl <= 0 || Math.Abs(dx * gy - dy * gx) / (l * gl) > Math.Sin(0.5 * Math.PI / 180)) return false;
            double Off(double x, double y) => Math.Abs((x - x1) * dy - (y - y1) * dx) / l;
            return Off(g.X1, g.Y1) <= tolMm && Off(g.X2, g.Y2) <= tolMm;
        }
    }

    /// <summary>MA-5b-7 (DAT-2): one row of Datum's review window — what a person ticks and types before anything is created. A level row
    /// carries its typed name, elevation (mm from ±0.00, as text: what was typed) and Building Story; a grid row its typed name.</summary>
    public sealed class DatumRow
    {
        public bool Tick = true;
        public string Name;
        public string Elevation;          // a level's, as typed (mm from ±0.00)
        public bool Story = true;         // a level's Building Story
        public DetectedGrid Grid;         // a grid row's line; null on a level row
        public bool IsGrid => Grid != null;
    }

    public static class DatumRows
    {
        private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        /// <summary>The rows of what was read: levels lowest first (±0.00 the lowest, as Levels reads them), then grids.</summary>
        public static List<DatumRow> Of(IEnumerable<DetectedLevel> levels, IEnumerable<DetectedGrid> grids) =>
            (levels ?? Enumerable.Empty<DetectedLevel>()).OrderBy(l => l.ElevationMm)
                .Select(l => new DatumRow { Name = l.Name, Elevation = l.ElevationMm.ToString("0.#", Inv), Story = l.Story })
                .Concat((grids ?? Enumerable.Empty<DetectedGrid>()).Select(g => new DatumRow { Name = g.Name, Grid = g })).ToList();

        /// <summary>An elevation as typed: a number of mm, a leading + or − (or -) allowed, spaces ignored; null when it is none.</summary>
        public static double? Mm(string typed)
        {
            var t = (typed ?? "").Replace('\u2212', '-').Replace(" ", "").Trim();
            if (t.EndsWith("mm", StringComparison.OrdinalIgnoreCase)) t = t.Substring(0, t.Length - 2);
            return double.TryParse(t, NumberStyles.Float, Inv, out var v) && !double.IsNaN(v) && !double.IsInfinity(v) && Math.Abs(v) <= 1_000_000 ? v : (double?)null;
        }

        /// <summary>±0.00 moved to level row <paramref name="i"/>: every level row's elevation shifted by what row i reads NOW (what was
        /// typed, not what was read), so row i reads 0 and a level below it reads negative. Null, or why it cannot (an elevation that is no
        /// number — nothing is shifted).</summary>
        public static string Anchor(IList<DatumRow> rows, int i)
        {
            var levels = rows.Where(r => !r.IsGrid).ToList();
            if (i < 0 || i >= rows.Count || rows[i].IsGrid) return "±0.00 is a level row";
            if (levels.FirstOrDefault(r => Mm(r.Elevation) == null) is DatumRow bad) return $"{bad.Name}: \"{bad.Elevation}\" is not a number of mm — correct it first";
            double by = Mm(rows[i].Elevation).Value;
            foreach (var r in levels) r.Elevation = (Mm(r.Elevation).Value - by).ToString("0.#", Inv);
            return null;
        }

        /// <summary>Why Create cannot run, or null: a ticked row with a blank name, two ticked levels (or two ticked grids) of one name, a
        /// ticked level whose elevation is no number, or two ticked levels at one elevation.</summary>
        public static string Check(IReadOnlyList<DatumRow> rows)
        {
            var on = rows.Where(r => r.Tick).ToList();
            if (on.FirstOrDefault(r => string.IsNullOrWhiteSpace(r.Name)) is DatumRow blank)
                return blank.IsGrid ? "A ticked grid has no name — type one, or untick it." : $"A ticked level (at {blank.Elevation} mm) has no name — type one, or untick it.";
            foreach (var g in on.GroupBy(r => (r.IsGrid, r.Name.Trim().ToUpperInvariant())).Where(g => g.Count() > 1))
                return $"Two ticked {(g.Key.IsGrid ? "grids" : "levels")} are named \"{g.First().Name.Trim()}\" — a name is one {(g.Key.IsGrid ? "grid" : "level")}'s.";
            if (on.FirstOrDefault(r => !r.IsGrid && Mm(r.Elevation) == null) is DatumRow nan)
                return $"{nan.Name}: \"{nan.Elevation}\" is not a number of mm.";
            foreach (var g in on.Where(r => !r.IsGrid).GroupBy(r => Math.Round(Mm(r.Elevation).Value, 0)).Where(g => g.Count() > 1))
                return $"{string.Join(" and ", g.Select(r => r.Name.Trim()))} are both at {g.Key:0} mm — one level stands there.";
            return null;
        }

        /// <summary>The ticked rows as what Build creates: names trimmed as typed, elevations as typed, Building Story as left.</summary>
        public static (List<DetectedLevel> Levels, List<DetectedGrid> Grids) Picked(IReadOnlyList<DatumRow> rows) =>
            (rows.Where(r => r.Tick && !r.IsGrid).Select(r => new DetectedLevel { Name = r.Name.Trim(), ElevationMm = Mm(r.Elevation).Value, Story = r.Story }).ToList(),
             rows.Where(r => r.Tick && r.IsGrid).Select(r => new DetectedGrid { Name = r.Name.Trim(), X1 = r.Grid.X1, Y1 = r.Grid.Y1, X2 = r.Grid.X2, Y2 = r.Grid.Y2, Vertical = r.Grid.Vertical }).ToList());
    }
}
