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
        public bool Vertical;       // numbered (within 45° of vertical, or a spoke); else lettered
        /// <summary>MA-5b-8 (DAT-5): an arc grid — its centre, radius and sweep (degrees anticlockwise from +X, start &lt; end); X1..Y2 are
        /// its ends. AngleDeg: a line's direction, 0 up to 180.</summary>
        public bool IsArc;
        public double Cx, Cy, R, StartDeg, EndDeg, AngleDeg;
        /// <summary>The same grid under another name (the review's typed one).</summary>
        public DetectedGrid With(string name) { var g = (DetectedGrid)MemberwiseClone(); g.Name = name; return g; }
    }

    /// <summary>MA-5b-8 (DAT-5): an arc drawn on a grid layer, in mm — centre, radius, sweep in degrees anticlockwise from +X (start &lt; end;
    /// a whole circle spans 360).</summary>
    public sealed class GridArc
    {
        public double Cx, Cy, R, StartDeg, EndDeg;
        public double Span => EndDeg - StartDeg;
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
        /// Grids from the lines (and MA-5b-8: arcs) on a plan's grid layer. A line or an arc is a grid when it is at least a quarter as long
        /// (an arc: as wide in radius) as the longest line there — a bubble, its leader, a tick is smaller; a whole circle is no grid (said).
        /// Lines group by direction (within the drawing tolerance of ~1.15°, the old 2 % slope); in a direction, lines whose offsets are within
        /// <paramref name="mergeTolMm"/> are one grid (the longest kept); arcs of one centre (5 mm) and radius (the merge) likewise.
        /// Names follow GR-01 (letters or numbers): numbers for lines within 45° of vertical (the direction nearest vertical first, then left to
        /// right) and then for the spokes of a radial plan (a line whose extension passes within 5 mm of an arc grid's centre), by angle
        /// anticlockwise from +X; letters (never I or O) for lines within 45° of horizontal (nearest horizontal first, then bottom to top) and then
        /// for the arcs, inner first. Plain orthogonal grids are named exactly as before.
        /// </summary>
        public static List<DetectedGrid> Grids(IEnumerable<Seg> planLines, double mergeTolMm = 100.0, ISet<char> skipLetters = null,
                                               IEnumerable<GridArc> planArcs = null, List<string> warnings = null)
        {
            skipLetters ??= DefaultSkip;
            var all = (planLines ?? Enumerable.Empty<Seg>()).Where(s => s.Length > 1e-6).ToList();
            double min = (all.Count == 0 ? 0 : all.Max(l => l.Length)) / 4;
            var lines = all.Where(l => l.Length >= min).ToList();

            // Arcs: big enough, not whole circles; one per centre and radius (the widest sweep kept).
            var arcs = new List<GridArc>();
            foreach (var a in (planArcs ?? Enumerable.Empty<GridArc>()).Where(a => a.R > 0 && a.R >= min).OrderByDescending(a => a.Span))
            {
                if (a.Span >= 359.9) { warnings?.Add($"A whole circle of radius {a.R:0} mm on a grid layer, centre ({a.Cx:0}, {a.Cy:0}) — Revit makes no grid of a whole circle; draw it as an arc."); continue; }
                if (!arcs.Any(k => Math.Abs(k.Cx - a.Cx) <= 5 && Math.Abs(k.Cy - a.Cy) <= 5 && Math.Abs(k.R - a.R) <= mergeTolMm)) arcs.Add(a);
            }

            // Lines: by direction, then by offset (the longest kept at each).
            double tolDeg = Math.Atan(0.02) * 180 / Math.PI;
            double Dir(Seg l) { double d = Math.Atan2(l.Y2 - l.Y1, l.X2 - l.X1) * 180 / Math.PI; d = ((d % 180) + 180) % 180; return d >= 180 - tolDeg ? d - 180 : d; }
            var families = new List<(double Deg, List<Seg> Lines)>();
            foreach (var l in lines.OrderBy(Dir))
            {
                double d = Dir(l);
                var f = families.FirstOrDefault(x => Math.Abs(x.Deg - d) <= tolDeg);
                if (f.Lines == null) families.Add((d, new List<Seg> { l })); else f.Lines.Add(l);
            }
            GridArc CentreOf(Seg l) => arcs.FirstOrDefault(a => Math.Abs((a.Cx - l.X1) * (l.Y2 - l.Y1) - (a.Cy - l.Y1) * (l.X2 - l.X1)) / l.Length <= 5);
            var numbered = new List<(double Key1, double Key2, Seg Line, double Deg)>();
            var lettered = new List<(double Key1, double Key2, Seg Line, double Deg)>();
            var spokes = new List<(double Ang, Seg Line, double Deg)>();
            foreach (var (_, fl) in families)
            {
                double deg = fl.Average(Dir), r = deg * Math.PI / 180;
                bool num = Math.Abs(deg - 90) <= 45;
                // the normal across the direction: +X-ward for a numbered direction (left to right), +Y-ward for a lettered one (bottom to top)
                double nx = -Math.Sin(r), ny = Math.Cos(r);
                if (num ? nx < 0 : ny < 0) { nx = -nx; ny = -ny; }
                double Off(Seg l) => (l.X1 + l.X2) / 2 * nx + (l.Y1 + l.Y2) / 2 * ny;
                foreach (var l in Dedupe(fl.Where(x => CentreOf(x) == null).OrderBy(Off), Off, mergeTolMm))
                    (num ? numbered : lettered).Add((num ? Math.Abs(deg - 90) : Math.Min(Math.Abs(deg), Math.Abs(180 - deg)), Off(l), l, deg));
                foreach (var l in fl.Where(x => CentreOf(x) != null))
                {
                    var c = CentreOf(l);
                    // the end away from the centre gives its angle; one spoke per angle (the longest kept)
                    var (fx, fy) = Math.Pow(l.X1 - c.Cx, 2) + Math.Pow(l.Y1 - c.Cy, 2) > Math.Pow(l.X2 - c.Cx, 2) + Math.Pow(l.Y2 - c.Cy, 2) ? (l.X1, l.Y1) : (l.X2, l.Y2);
                    double ang = (Math.Atan2(fy - c.Cy, fx - c.Cx) * 180 / Math.PI + 360) % 360;
                    int k = spokes.FindIndex(sp => Math.Abs(sp.Ang - ang) <= 0.5);
                    if (k < 0) spokes.Add((ang, l, deg));
                    else if (l.Length > spokes[k].Line.Length) spokes[k] = (ang, l, deg);
                }
            }

            var grids = new List<DetectedGrid>();
            int n = 0, a0 = 0;
            foreach (var x in numbered.OrderBy(x => Math.Round(x.Key1, 6)).ThenBy(x => x.Key2)) grids.Add(New(x.Line, (++n).ToString(CultureInfo.InvariantCulture), true, x.Deg));
            foreach (var x in spokes.OrderBy(x => x.Ang)) grids.Add(New(x.Line, (++n).ToString(CultureInfo.InvariantCulture), true, x.Deg));
            foreach (var x in lettered.OrderBy(x => Math.Round(x.Key1, 6)).ThenBy(x => x.Key2)) grids.Add(New(x.Line, Letter(a0++, skipLetters), false, x.Deg));
            foreach (var a in arcs.OrderBy(a => a.R).ThenBy(a => a.Cx).ThenBy(a => a.Cy))
            {
                double s0 = a.StartDeg * Math.PI / 180, s1 = a.EndDeg * Math.PI / 180;
                grids.Add(new DetectedGrid
                {
                    Name = Letter(a0++, skipLetters), IsArc = true, Cx = a.Cx, Cy = a.Cy, R = a.R, StartDeg = a.StartDeg, EndDeg = a.EndDeg,
                    X1 = a.Cx + a.R * Math.Cos(s0), Y1 = a.Cy + a.R * Math.Sin(s0), X2 = a.Cx + a.R * Math.Cos(s1), Y2 = a.Cy + a.R * Math.Sin(s1),
                });
            }
            return grids;
        }

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

        private static DetectedGrid New(Seg s, string name, bool vertical, double deg) => new DetectedGrid
        { Name = name, X1 = s.X1, Y1 = s.Y1, X2 = s.X2, Y2 = s.Y2, Vertical = vertical, AngleDeg = deg };

        /// <summary>MA-5b-8 (DAT-5): an arc grid already in the model — the same centre and radius, each within <paramref name="tolMm"/>.</summary>
        public static bool SameArc(DetectedGrid g, double cx, double cy, double r, double tolMm = 10) =>
            g.IsArc && Math.Abs(g.Cx - cx) <= tolMm && Math.Abs(g.Cy - cy) <= tolMm && Math.Abs(g.R - r) <= tolMm;

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
            if (g.IsArc) return false;
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
             rows.Where(r => r.Tick && r.IsGrid).Select(r => r.Grid.With(r.Name.Trim())).ToList());
    }
}
