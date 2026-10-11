#nullable disable
// MA-5a-3 — sentinel-drawing's reading of one plan page (plan docs/superpowers/plans/2026-10-11-ma5a3-drawing-reader.md).
//
// WALLS: a vector plan draws a cut wall as its two faces in one line weight. Collinear strokes of a weight make a FACE LINE (the
// intervals it covers); two parallel face lines within PAIR_MAX are a wall where BOTH faces are present. Pairs claim over the whole page
// (never in stroke order: a CAD plot writes strokes in any order): those with an OUTER face (nothing parallel beyond it) first, then the
// rest, each by its gap, closest first; a face is claimed once per side (a lining shares the wall's face), a pair whose faces are
// already walls on their far sides is a void or a cavity between two walls, and a line inside a wall is no face of another. A claimed
// run then crosses a gap where only ONE face breaks (a wall meeting it: a T) and runs on along a face that continues alone (an L
// corner); a gap where BOTH faces break is an opening, or a crossing when a crossing wall's own gap fits it. A wall is longer than it is
// thick (two jambs a door apart are no wall); a run alone on its line, capped at both ends and at most COLUMN x its thickness (or under
// 1.5 x), is a column. Every weight whose lines pair into at least WEIGHT_SHARE of the best weight's wall length is read (external walls
// and partitions in two pens); a border or title block drawn heaviest pairs into little.
// DOORS: a quarter-circle swing (90° ± 10) set square to a wall — its strike along the wall, its open leaf across it — hinged at an end
// of an opening of about its radius (a leaf 75–110 % of the opening: a frame takes the rest), which joins the two collinear walls into
// ONE wall through the door (Revit hosts a door in one wall); two swings of half the opening are a double door; a swing over a gap where
// one face runs on (a threshold line) is a door in the one wall; a swing at a wall's end with no wall beyond (a door beside a corner) is
// a door too, the wall run on through it. A "W x H" tag that is a door's nearest and has that door nearest is kept, as the drawing's
// numbers.
// Paper millimetres throughout (page origin bottom-left, y up): the scale and placement are the lead's 2-point alignment (MA-5a-4).
// Analyse() is pure — strokes, curves and words in, a Reading out; Read(page) only collects them.
// ponytail: window glass or sill lines, stair treads and a door leaf drawn as a rectangle IN the wall weight pair into thin walls; a
// dense hatch in its own weight can out-pair the walls — the receipt lists every weight's paired length. Fix each when a real set does it.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;

namespace Sentinel.Drawing
{
    public sealed class Stroke { public double X1, Y1, X2, Y2, Weight; }
    /// <summary>A cubic Bezier: P0, C1, C2, P3 as x, y pairs; consecutive curves on one circle, end to start, are one arc.</summary>
    public sealed class Curve { public double[] P; }
    public sealed class Word { public string Text; public double X, Y; }

    public sealed class Wall { public double X1, Y1, X2, Y2, Thickness; public List<double[]> Faces = new List<double[]>(); }
    public sealed class Door { public int Host; public double X, Y, Ux, Uy, Along, Width, Cx, Cy; public int Leaves = 1; public int? TagW, TagH; }

    public sealed class Reading
    {
        public List<Wall> Walls = new List<Wall>();
        public List<Door> Doors = new List<Door>();
        public int Strokes, Faces, Arcs, Unpaired, Columns;
        /// <summary>The weight that pairs into the most wall length.</summary>
        public double? WallWeight;
        /// <summary>Each stroke weight, the wall length its lines pair into (paper mm) and whether it was read as walls.</summary>
        public List<(double weight, double paired, bool read)> Weights = new List<(double, double, bool)>();
        public string Why;
    }

    public static class PlanReader
    {
        public const double MM_PER_PT = 25.4 / 72;
        public const double PAIR_MAX = 25;     // paper mm: a 1250 mm wall at 1:50 — faces further apart are two walls across a room
        public const double ARC_SPAN = 90, ARC_SPAN_TOL = 10; // degrees: a door swing is a quarter circle
        public const double GAP_TOL = 0.10;    // a swing set square within 10 % of its radius; its hinge within 10 % of the opening's end
        public const double LEAF_MIN = 0.75, LEAF_MAX = 1.1; // a leaf's radius as a share of its opening (a frame takes the rest)
        public const double TAG_REACH = 1.5;   // a tag within 1.5 radii of its door
        public const double COLUMN = 3;        // a lone run capped at both ends and at most 3 x its thickness is a column (300 x 900)
        public const double WEIGHT_SHARE = 0.3; // a weight pairing into 30 % of the best's wall length is read too (two pens)
        const double PARALLEL = 0.5 * Math.PI / 180; // radians: a plot draws a wall's two faces at one angle
        const double TOUCH = 0.05;             // paper mm: strokes on one line within this touch; a gap shorter than this is none
        const double CIRCLE = 0.02;            // a curve is a circle's arc when its quarter points sit within 2 % of the radius
        static readonly Regex TAG = new Regex(@"^([0-9]{3,4})\s*[xX×]\s*([0-9]{3,4})$");

        /// <summary>Collect page 1's stroked lines, curves and words (paper mm) and analyse them.</summary>
        public static Reading Read(Page page)
        {
            var strokes = new List<Stroke>();
            var curves = new List<Curve>();
            double X(PdfPoint p) => p.X * MM_PER_PT;
            double Y(PdfPoint p) => p.Y * MM_PER_PT;
            foreach (var path in page.Paths)
            {
                if (!path.IsStroked || path.IsClipping) continue;
                // ponytail: the width as written (PdfPig does not scale it by the CTM) — weights drawn under different scales (a form's
                // /Matrix) compare in mixed units; track the CTM when real sets do that.
                double w = Convert.ToDouble(path.LineWidth);
                foreach (var sub in path)
                {
                    PdfPoint? start = null, cur = null;
                    foreach (var cmd in sub.Commands)
                    {
                        switch (cmd)
                        {
                            case PdfSubpath.Move m: start = cur = m.Location; break;
                            case PdfSubpath.Line l:
                                strokes.Add(new Stroke { X1 = X(l.From), Y1 = Y(l.From), X2 = X(l.To), Y2 = Y(l.To), Weight = w });
                                cur = l.To; break;
                            case PdfSubpath.CubicBezierCurve c:
                                curves.Add(new Curve { P = new[] { X(c.StartPoint), Y(c.StartPoint), X(c.FirstControlPoint), Y(c.FirstControlPoint),
                                    X(c.SecondControlPoint), Y(c.SecondControlPoint), X(c.EndPoint), Y(c.EndPoint) } });
                                cur = c.EndPoint; break;
                            case PdfSubpath.Close _:
                                if (start.HasValue && cur.HasValue && !start.Value.Equals(cur.Value))
                                    strokes.Add(new Stroke { X1 = X(cur.Value), Y1 = Y(cur.Value), X2 = X(start.Value), Y2 = Y(start.Value), Weight = w });
                                cur = start; break;
                        }
                    }
                }
            }
            var words = page.GetWords().Select(x => new Word { Text = x.Text, X = x.BoundingBox.Centroid.X * MM_PER_PT, Y = x.BoundingBox.Centroid.Y * MM_PER_PT }).ToList();
            return Analyse(strokes, curves, words);
        }

        public static Reading Analyse(IList<Stroke> strokes, IList<Curve> curves, IList<Word> words)
        {
            var r = new Reading { Strokes = strokes.Count + curves.Count };
            if (strokes.Count == 0) { r.Why = "no stroked line on the page — nothing drawn to read (text only, a scan or a filled-only drawing: C10)"; return r; }
            var classes = strokes.GroupBy(s => Math.Round(s.Weight, 3)).OrderByDescending(g => g.Key).ToList();
            if (classes.Count == 1) { r.Why = "one line weight on the page — walls are not told from the rest"; return r; }
            int groups = 0;
            var read = new List<(double weight, List<Stroke> strokes, List<Line> lines, List<Band> bands, double total)>();
            foreach (var cls in classes)
            {
                var ss = cls.ToList();
                var lines = Lines(ss, ref groups);
                var bands = Bands(lines);
                read.Add((cls.Key, ss, lines, bands, bands.Sum(b => b.Hi - b.Lo)));
            }
            double most = read.Max(x => x.total);
            if (most <= 0) { r.Why = $"no two parallel lines of one weight pair into a wall (faces under {PAIR_MAX} paper mm apart, longer than thick)"; return r; }
            foreach (var x in read) r.Weights.Add((x.weight, Math.Round(x.total, 3), x.total >= WEIGHT_SHARE * most));
            read = read.Where(x => x.total >= WEIGHT_SHARE * most).ToList();
            r.WallWeight = read.OrderByDescending(x => x.total).First().weight;
            r.Faces = read.Sum(x => x.lines.Count);
            r.Unpaired = read.Sum(x => x.lines.Count(l => l.OwnLo.Count == 0 && l.OwnHi.Count == 0));
            var pieces = read.SelectMany(x => x.bands.Select(b => Piece(b, x.strokes))).ToList();

            var arcs = Arcs(curves);
            r.Arcs = arcs.Count;
            var used = new bool[arcs.Count];
            var group = Enumerable.Range(0, pieces.Count).ToArray();
            int Find(int i) { while (group[i] != i) i = group[i] = group[group[i]]; return i; }
            void Union(int i, int j) => group[Find(j)] = Find(i);
            var found = new List<(int piece, Door door)>();
            var tracks = Tracks(pieces);
            var open = new List<(List<int> track, int k, double g0, double g1)>(); // openings with no door yet

            // Doors in an opening between two collinear pieces of one thickness (consecutive along their line: nothing collinear between).
            foreach (var track in tracks)
                for (int k = 0; k + 1 < track.Count; k++)
                {
                    var a = pieces[track[k]]; var b = pieces[track[k + 1]];
                    double g0 = a.Hi, g1 = b.Lo;
                    if (g1 - g0 <= TOUCH) continue;
                    var door = GapDoor(a, g0, g1, arcs, used);
                    if (door == null) { open.Add((track, k, g0, g1)); continue; }
                    a.DoorHi = b.DoorLo = true;
                    found.Add((track[k], door));
                    Union(track[k], track[k + 1]);
                }
            // A crossing: two walls cut each other — each one's opening as wide as the other is thick, at the same place. Both run through.
            foreach (var (track, k, g0, g1) in open)
            {
                var a = pieces[track[k]];
                var (cx, cy) = a.At((g0 + g1) / 2, a.C);
                foreach (var (t2, k2, h0, h1) in open)
                {
                    var b = pieces[t2[k2]];
                    if (Math.Abs(a.Ux * b.Ux + a.Uy * b.Uy) >= Math.Cos(PARALLEL)) continue;
                    double tol = Math.Max(0.2, 0.1 * Math.Max(a.G, b.G)), s = S(b, cx, cy), o = cx * b.Nx + cy * b.Ny - b.C;
                    if (Math.Abs(o) > tol || s < h0 - tol || s > h1 + tol) continue;
                    if (Math.Abs((g1 - g0) - b.G) > tol || Math.Abs((h1 - h0) - a.G) > tol) continue;
                    Union(track[k], track[k + 1]);
                    Union(t2[k2], t2[k2 + 1]);
                }
            }
            // A swing over a gap one face runs on across (a threshold or a frame line): a door in the one wall.
            foreach (var (p, i) in pieces.Select((p, i) => (p, i)))
                foreach (var (g0, g1) in p.Gaps)
                {
                    var door = GapDoor(p, g0, g1, arcs, used);
                    if (door != null) found.Add((i, door));
                }
            // A swing at a piece's end with no piece beyond within its radius: a door beside a corner — the piece runs on through it.
            foreach (var track in tracks)
                for (int k = 0; k < track.Count; k++)
                {
                    var p = pieces[track[k]];
                    foreach (int side in new[] { -1, 1 })
                    {
                        if (side < 0 ? p.DoorLo : p.DoorHi) continue;
                        double e = side < 0 ? p.Lo : p.Hi;
                        double room = side < 0 ? (k > 0 ? p.Lo - pieces[track[k - 1]].Hi : double.MaxValue) : (k + 1 < track.Count ? pieces[track[k + 1]].Lo - p.Hi : double.MaxValue);
                        var door = EndDoor(p, e, side, room, arcs, used);
                        if (door == null) continue;
                        if (side < 0) { p.Lo -= door.Width; p.DoorLo = true; } else { p.Hi += door.Width; p.DoorHi = true; }
                        found.Add((track[k], door));
                    }
                }

            // One wall per group of pieces joined through doors and crossings. A run alone on its line, with no door, capped at both ends
            // and at most COLUMN x its thickness — or under 1.5 x — is a column, counted once by its centre, not a wall (a pier between
            // windows is on a wall's line: a wall).
            var alone = new HashSet<int>(tracks.Where(t => t.Count == 1).Select(t => t[0]));
            var columns = new HashSet<(long, long)>();
            var wallOf = new Dictionary<int, int>();
            for (int i = 0; i < pieces.Count; i++)
            {
                int root = Find(i);
                if (wallOf.ContainsKey(root)) continue;
                var members = Enumerable.Range(0, pieces.Count).Where(k => Find(k) == root).ToList();
                var p0 = pieces[members[0]];
                double len = p0.Hi - p0.Lo;
                if (members.Count == 1 && alone.Contains(members[0]) && !p0.DoorLo && !p0.DoorHi && !found.Any(f => f.piece == members[0])
                    && ((p0.CapLo && p0.CapHi && len <= COLUMN * p0.G) || len < 1.5 * p0.G))
                {
                    var (mx, my) = p0.At((p0.Lo + p0.Hi) / 2, p0.C);
                    columns.Add(((long)Math.Round(mx * 2), (long)Math.Round(my * 2)));
                    wallOf[root] = -1;
                    continue;
                }
                wallOf[root] = r.Walls.Count;
                r.Walls.Add(Join(members.Select(k => pieces[k]).ToList()));
            }
            r.Columns = columns.Count;
            foreach (var (piece, d) in found)
            {
                d.Host = wallOf[Find(piece)];
                if (d.Host < 0) continue;
                var w = r.Walls[d.Host];
                d.Along = Math.Sqrt((d.X - w.X1) * (d.X - w.X1) + (d.Y - w.Y1) * (d.Y - w.Y1));
                r.Doors.Add(d);
            }
            r.Doors = r.Doors.OrderBy(d => d.Host).ThenBy(d => d.Along).ToList();
            Tags(r.Doors, words);
            return r;
        }

        // ---- face lines -------------------------------------------------------------------------------------------------------

        /// <summary>A face line: collinear strokes of one weight, as the intervals they cover along U (s), at offset Off along N. A pair
        /// claims its lower line's upper side (OwnHi) and its upper line's lower side (OwnLo). ExpLo / ExpHi: nothing parallel overlaps it
        /// within PAIR_MAX on that side — an outer face.</summary>
        sealed class Line
        {
            public int Group; public double Ux, Uy, Off; public bool ExpLo, ExpHi;
            public List<(double a, double b)> Iv;
            public List<(double a, double b, int cand)> OwnLo = new List<(double, double, int)>(), OwnHi = new List<(double, double, int)>();
            public IEnumerable<(double a, double b, int cand)> Own => OwnLo.Concat(OwnHi);
        }

        /// <summary>Strokes grouped by direction (within PARALLEL), then by offset (within TOUCH) into face lines. O(n log n), but for the
        /// outer-face test (lines within PAIR_MAX of each other).</summary>
        static List<Line> Lines(List<Stroke> strokes, ref int groupNo)
        {
            var dir = new List<(Stroke s, double th)>();
            foreach (var s in strokes)
            {
                double dx = s.X2 - s.X1, dy = s.Y2 - s.Y1;
                if (dx * dx + dy * dy < 1e-12) continue;
                double th = Math.Atan2(dy, dx);
                if (th < 0) th += Math.PI;
                if (th >= Math.PI - PARALLEL / 2) th -= Math.PI; // 179.9° is 0°'s
                dir.Add((s, th));
            }
            dir.Sort((p, q) => p.th.CompareTo(q.th));
            var lines = new List<Line>();
            for (int i = 0; i < dir.Count;)
            {
                int j = i + 1;
                while (j < dir.Count && dir[j].th - dir[j - 1].th <= PARALLEL) j++;
                double th = dir.Skip(i).Take(j - i).Average(x => x.th), ux = Math.Cos(th), uy = Math.Sin(th), nx = -uy, ny = ux;
                var at = dir.Skip(i).Take(j - i).Select(x => (off: ((x.s.X1 + x.s.X2) / 2) * nx + ((x.s.Y1 + x.s.Y2) / 2) * ny,
                    a: Math.Min(x.s.X1 * ux + x.s.Y1 * uy, x.s.X2 * ux + x.s.Y2 * uy), b: Math.Max(x.s.X1 * ux + x.s.Y1 * uy, x.s.X2 * ux + x.s.Y2 * uy)))
                    .OrderBy(x => x.off).ToList();
                var mine = new List<Line>();
                for (int k = 0; k < at.Count;)
                {
                    int m = k + 1;
                    while (m < at.Count && at[m].off - at[m - 1].off <= TOUCH) m++;
                    mine.Add(new Line { Group = groupNo, Ux = ux, Uy = uy, Off = at.Skip(k).Take(m - k).Average(x => x.off), Iv = Norm(at.Skip(k).Take(m - k).Select(x => (x.a, x.b))) });
                    k = m;
                }
                for (int k = 0; k < mine.Count; k++)
                {
                    bool Near(int q) => Math.Abs(mine[q].Off - mine[k].Off) <= PAIR_MAX && Len(Inter(mine[k].Iv, mine[q].Iv)) > TOUCH;
                    mine[k].ExpLo = true; mine[k].ExpHi = true;
                    for (int q = k - 1; q >= 0 && mine[k].Off - mine[q].Off <= PAIR_MAX; q--) if (Near(q)) { mine[k].ExpLo = false; break; }
                    for (int q = k + 1; q < mine.Count && mine[q].Off - mine[k].Off <= PAIR_MAX; q++) if (Near(q)) { mine[k].ExpHi = false; break; }
                }
                lines.AddRange(mine);
                groupNo++;
                i = j;
            }
            return lines;
        }

        sealed class Band { public Line A, B; public double G, Lo, Hi; public List<(double, double)> Gaps = new List<(double, double)>(); }

        /// <summary>Walls from face lines: candidate pairs (parallel, within PAIR_MAX) claim where both faces are present — pairs with an
        /// outer face first, then by gap, closest first; a face once per side; never a void between two walls, never a line inside one.
        /// Each claim then crosses one-sided gaps (a T, a threshold) and runs on along a face that continues alone (an L corner, at most
        /// PAIR_MAX), never into another pair's claim.</summary>
        static List<Band> Bands(List<Line> lines)
        {
            var cands = new List<(Line a, Line b, double g)>();
            foreach (var grp in lines.GroupBy(l => l.Group))
            {
                var ls = grp.OrderBy(l => l.Off).ToList();
                for (int i = 0; i < ls.Count; i++)
                    for (int j = i + 1; j < ls.Count && ls[j].Off - ls[i].Off <= PAIR_MAX; j++)
                        if (ls[j].Off - ls[i].Off > TOUCH) cands.Add((ls[i], ls[j], ls[j].Off - ls[i].Off));
            }
            // Stable: outer first, then the gap, then where the pair sits — the same page gives the same walls whatever its stroke order.
            cands = cands.OrderBy(c => c.a.ExpLo || c.b.ExpHi ? 0 : 1).ThenBy(c => c.g).ThenBy(c => c.a.Group).ThenBy(c => c.a.Off).ToList();
            var claims = new List<(Line a, Line b, double g, List<(double a, double b)> both)>();
            static List<(double a, double b)> Ivs(List<(double a, double b, int cand)> own) => Norm(own.Select(o => (o.a, o.b)));
            foreach (var (a, b, g) in cands)
            {
                var both = Inter(Minus(a.Iv, Ivs(a.OwnHi)), Minus(b.Iv, Ivs(b.OwnLo)));
                both = Minus(both, Inter(Ivs(a.OwnLo), Ivs(b.OwnHi))); // walls on both far sides: the void or cavity between them
                foreach (var c in claims)
                    if (c.a.Group == a.Group && (Inside(a.Off, c.a, c.b) || Inside(b.Off, c.a, c.b))) both = Minus(both, c.both); // a line inside a wall
                if (Len(both) < g) continue; // shorter than thick wherever both faces are free: jambs, caps
                int id = claims.Count;
                claims.Add((a, b, g, both));
                foreach (var x in both) { a.OwnHi.Add((x.a, x.b, id)); b.OwnLo.Add((x.a, x.b, id)); }
            }
            var bands = new List<Band>();
            for (int id = 0; id < claims.Count; id++)
            {
                var (a, b, g, both) = claims[id];
                bool Free(Line l, double x0, double x1) =>
                    Covers(l.Iv, x0, x1) && !l.Own.Any(o => o.cand != id && o.b > x0 + TOUCH && o.a < x1 - TOUCH);
                var runs = new List<(double lo, double hi, List<(double, double)> gaps)>();
                foreach (var x in both)
                {
                    if (runs.Count > 0 && (Free(a, runs[^1].hi, x.a) || Free(b, runs[^1].hi, x.a)))
                    {
                        runs[^1].gaps.Add((runs[^1].hi, x.a));
                        runs[^1] = (runs[^1].lo, x.b, runs[^1].gaps);
                    }
                    else runs.Add((x.a, x.b, new List<(double, double)>()));
                }
                foreach (var (lo0, hi0, gaps) in runs)
                {
                    double lo = Math.Min(RunOn(a, lo0, -1, id), RunOn(b, lo0, -1, id)), hi = Math.Max(RunOn(a, hi0, 1, id), RunOn(b, hi0, 1, id));
                    if (hi - lo < g) continue; // a wall is longer than it is thick
                    bands.Add(new Band { A = a, B = b, G = g, Lo = lo, Hi = hi, Gaps = gaps });
                }
            }
            return bands;
        }

        static bool Inside(double off, Line lo, Line hi) => off > lo.Off + TOUCH && off < hi.Off - TOUCH;

        /// <summary>How far a face continues alone from e (side -1: down, +1: up), at most PAIR_MAX and never into another pair's claim.</summary>
        static double RunOn(Line l, double e, int side, int id)
        {
            var iv = l.Iv.FirstOrDefault(x => x.a <= e + TOUCH && x.b >= e - TOUCH);
            if (iv.b - iv.a <= 0) return e;
            double end = side < 0 ? Math.Max(iv.a, e - PAIR_MAX) : Math.Min(iv.b, e + PAIR_MAX);
            foreach (var o in l.Own)
            {
                if (o.cand == id) continue;
                if (side < 0 && o.b <= e + TOUCH && o.b > end) end = o.b;
                if (side > 0 && o.a >= e - TOUCH && o.a < end) end = o.a;
            }
            return end;
        }

        // ---- pieces and doors -------------------------------------------------------------------------------------------------

        /// <summary>A band as a wall piece in its line's frame: axis U, centre offset C, extent Lo..Hi, thickness G; capped where a
        /// stroke of its weight closes an end across both faces; Gaps: where one face breaks and the other runs on.</summary>
        sealed class Pc
        {
            public int Group; public double Ux, Uy, Nx, Ny, C, G, Lo, Hi; public Line A, B;
            public bool CapLo, CapHi, DoorLo, DoorHi;
            public List<(double, double)> Gaps;
            public (double x, double y) At(double s, double o) => (Ux * s + Nx * o, Uy * s + Ny * o);
        }

        static Pc Piece(Band b, List<Stroke> heavy)
        {
            var p = new Pc { Group = b.A.Group, Ux = b.A.Ux, Uy = b.A.Uy, Nx = -b.A.Uy, Ny = b.A.Ux, C = (b.A.Off + b.B.Off) / 2, G = b.G, Lo = b.Lo, Hi = b.Hi, A = b.A, B = b.B, Gaps = b.Gaps };
            double tol = Math.Max(0.1, 0.05 * b.G);
            bool Cap(double s)
            {
                var (x1, y1) = p.At(s, b.A.Off); var (x2, y2) = p.At(s, b.B.Off);
                double D(double ax, double ay, double bx, double by) => Math.Sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
                return heavy.Any(k => (D(k.X1, k.Y1, x1, y1) <= tol && D(k.X2, k.Y2, x2, y2) <= tol) || (D(k.X1, k.Y1, x2, y2) <= tol && D(k.X2, k.Y2, x1, y1) <= tol));
            }
            p.CapLo = Cap(p.Lo); p.CapHi = Cap(p.Hi);
            return p;
        }

        /// <summary>Pieces on one line (one direction, one centre within a quarter of their thickness, one thickness within 10 %), by Lo.</summary>
        static List<List<int>> Tracks(List<Pc> ps)
        {
            var tracks = new List<List<int>>();
            foreach (int i in Enumerable.Range(0, ps.Count).OrderBy(i => ps[i].Group).ThenBy(i => ps[i].C).ThenBy(i => ps[i].Lo))
            {
                var t = tracks.Count == 0 ? null : tracks[^1];
                var q = t == null ? null : ps[t[0]];
                bool same = q != null && q.Group == ps[i].Group && Math.Abs(q.C - ps[i].C) <= Math.Max(0.25 * q.G, 0.2) && Math.Abs(q.G - ps[i].G) <= 0.1 * Math.Max(q.G, ps[i].G);
                if (!same) tracks.Add(new List<int> { i }); else t.Add(i);
            }
            foreach (var t in tracks) t.Sort((x, y) => ps[x].Lo.CompareTo(ps[y].Lo));
            return tracks;
        }

        sealed class Arc { public double Cx, Cy, R, Span, X0, Y0, X3, Y3; }

        /// <summary>An arc as a swing of a wall on axis (ux, uy): its strike end along the wall (side of it: +1 / -1), its open leaf
        /// across it (+1 / -1 along the normal); null when it is not set square to the wall.</summary>
        static (int strike, int leaf)? Swing(Arc c, Pc p)
        {
            (double a, double o) Rel(double x, double y) => ((x - c.Cx) * p.Ux + (y - c.Cy) * p.Uy, (x - c.Cx) * p.Nx + (y - c.Cy) * p.Ny);
            var e0 = Rel(c.X0, c.Y0); var e3 = Rel(c.X3, c.Y3);
            bool Strike((double a, double o) e) => Math.Abs(Math.Abs(e.a) - c.R) <= GAP_TOL * c.R && Math.Abs(e.o) <= GAP_TOL * c.R;
            bool Leaf((double a, double o) e) => Math.Abs(Math.Abs(e.o) - c.R) <= GAP_TOL * c.R && Math.Abs(e.a) <= GAP_TOL * c.R;
            if (Strike(e0) && Leaf(e3)) return (Math.Sign(e0.a), Math.Sign(e3.o));
            if (Strike(e3) && Leaf(e0)) return (Math.Sign(e3.a), Math.Sign(e0.o));
            return null;
        }

        static double S(Pc p, double x, double y) => x * p.Ux + y * p.Uy;
        static bool OnWall(Pc p, Arc c, double reach) => Math.Abs(c.Cx * p.Nx + c.Cy * p.Ny - p.C) <= p.G / 2 + reach;

        static Door MakeDoor(Pc p, double s0, double s1, Arc c, int leaf, int leaves)
        {
            var (x, y) = p.At((s0 + s1) / 2, p.C);
            return new Door { X = x, Y = y, Ux = p.Nx * leaf, Uy = p.Ny * leaf, Width = s1 - s0, Cx = c.Cx, Cy = c.Cy, Leaves = leaves };
        }

        /// <summary>The door in the opening g0..g1 of piece a's line: one swing of LEAF_MIN–LEAF_MAX of the opening, hinged at an end (a
        /// frame's width in from it at most), or two of half that hinged at both ends (a double door). Marks the arcs used.</summary>
        static Door GapDoor(Pc a, double g0, double g1, List<Arc> arcs, bool[] used)
        {
            double g = g1 - g0, tol = GAP_TOL * g;
            if (g < a.G) return null; // an opening narrower than the wall is thick is no door
            bool Hinged(Arc c, int strike, double r, double lo, double hi)
            {
                double s = S(a, c.Cx, c.Cy), frame = Math.Max(0, (hi - lo) - r);
                return strike > 0 ? s >= lo - tol && s <= lo + frame + tol : s <= hi + tol && s >= hi - frame - tol;
            }
            int best = -1; double bestErr = double.MaxValue; int bestLeaf = 0;
            for (int k = 0; k < arcs.Count; k++)
            {
                var c = arcs[k];
                if (used[k] || c.R < LEAF_MIN * g || c.R > LEAF_MAX * g || !OnWall(a, c, tol)) continue;
                var sw = Swing(c, a);
                if (sw == null || !Hinged(c, sw.Value.strike, c.R, g0, g1)) continue;
                if (Math.Abs(c.R - g) < bestErr) { bestErr = Math.Abs(c.R - g); best = k; bestLeaf = sw.Value.leaf; }
            }
            if (best >= 0) { used[best] = true; return MakeDoor(a, g0, g1, arcs[best], bestLeaf, 1); }
            int lo = -1, hi = -1; int leafLo = 0;
            double mid = (g0 + g1) / 2;
            for (int k = 0; k < arcs.Count; k++)
            {
                var c = arcs[k];
                if (used[k] || c.R < LEAF_MIN * g / 2 || c.R > LEAF_MAX * g / 2 || !OnWall(a, c, tol)) continue;
                var sw = Swing(c, a);
                if (sw == null) continue;
                if (lo < 0 && sw.Value.strike > 0 && Hinged(c, 1, c.R, g0, mid)) { lo = k; leafLo = sw.Value.leaf; }
                else if (hi < 0 && sw.Value.strike < 0 && Hinged(c, -1, c.R, mid, g1)) hi = k;
            }
            if (lo < 0 || hi < 0) return null;
            used[lo] = used[hi] = true;
            return MakeDoor(a, g0, g1, arcs[lo], leafLo, 2);
        }

        /// <summary>A door at piece p's end e (side -1: its Lo, +1: its Hi) with no piece within `room` beyond: a swing set square to p,
        /// hinged at e opening away from it, or hinged one radius beyond e swinging back to it.</summary>
        static Door EndDoor(Pc p, double e, int side, double room, List<Arc> arcs, bool[] used)
        {
            for (int k = 0; k < arcs.Count; k++)
            {
                var c = arcs[k];
                if (used[k] || c.R < p.G || c.R > room + GAP_TOL * c.R || !OnWall(p, c, GAP_TOL * c.R)) continue;
                var sw = Swing(c, p);
                if (sw == null) continue;
                double s = S(p, c.Cx, c.Cy);
                bool here = Math.Abs(s - e) <= GAP_TOL * c.R && sw.Value.strike == side;
                bool there = Math.Abs(s - (e + side * c.R)) <= GAP_TOL * c.R && sw.Value.strike == -side;
                if (!here && !there) continue;
                used[k] = true;
                double s0 = side > 0 ? e : e - c.R, s1 = side > 0 ? e + c.R : e;
                return MakeDoor(p, s0, s1, c, sw.Value.leaf, 1);
            }
            return null;
        }

        /// <summary>Collinear pieces joined through their doors: one axis over all their extents; centre and thickness length-weighted.</summary>
        static Wall Join(List<Pc> ps)
        {
            var a = ps[0];
            double lo = ps.Min(p => p.Lo), hi = ps.Max(p => p.Hi), l = ps.Sum(p => p.Hi - p.Lo);
            double c = ps.Sum(p => p.C * (p.Hi - p.Lo)) / l, t = ps.Sum(p => p.G * (p.Hi - p.Lo)) / l;
            var (x1, y1) = a.At(lo, c); var (x2, y2) = a.At(hi, c);
            var w = new Wall { X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Thickness = t };
            foreach (var p in ps)
                foreach (var line in new[] { p.A, p.B })
                    foreach (var (s0, s1) in Inter(line.Iv, new List<(double, double)> { (p.Lo, p.Hi) }))
                    {
                        var (fx1, fy1) = p.At(s0, line.Off); var (fx2, fy2) = p.At(s1, line.Off);
                        w.Faces.Add(new[] { fx1, fy1, fx2, fy2 });
                    }
            return w;
        }

        // ---- intervals --------------------------------------------------------------------------------------------------------

        static List<(double a, double b)> Norm(IEnumerable<(double a, double b)> xs)
        {
            var o = new List<(double a, double b)>();
            foreach (var x in xs.Where(x => x.b - x.a > 0).OrderBy(x => x.a))
                if (o.Count > 0 && x.a <= o[^1].b + TOUCH) o[^1] = (o[^1].a, Math.Max(o[^1].b, x.b)); else o.Add(x);
            return o;
        }
        static List<(double a, double b)> Inter(List<(double a, double b)> A, List<(double a, double b)> B)
        {
            var o = new List<(double a, double b)>();
            int i = 0, j = 0;
            while (i < A.Count && j < B.Count)
            {
                double lo = Math.Max(A[i].a, B[j].a), hi = Math.Min(A[i].b, B[j].b);
                if (hi - lo > TOUCH) o.Add((lo, hi));
                if (A[i].b < B[j].b) i++; else j++;
            }
            return o;
        }
        static List<(double a, double b)> Minus(List<(double a, double b)> A, IEnumerable<(double a, double b)> cut)
        {
            var o = new List<(double a, double b)>(A);
            foreach (var (ca, cb) in Norm(cut))
            {
                var next = new List<(double a, double b)>();
                foreach (var (a, b) in o)
                {
                    if (cb <= a || ca >= b) { next.Add((a, b)); continue; }
                    if (ca - a > TOUCH) next.Add((a, ca));
                    if (b - cb > TOUCH) next.Add((cb, b));
                }
                o = next;
            }
            return o;
        }
        static double Len(List<(double a, double b)> A) => A.Sum(x => x.b - x.a);
        static bool Covers(List<(double a, double b)> A, double x0, double x1) => A.Any(x => x.a <= x0 + TOUCH && x.b >= x1 - TOUCH);

        // ---- arcs and tags ----------------------------------------------------------------------------------------------------

        /// <summary>Quarter-circle swings: each curve fitted to a circle; consecutive curves on the same circle, end to start, are one arc
        /// (an exporter may write each piece with its own move).</summary>
        static List<Arc> Arcs(IList<Curve> curves)
        {
            var arcs = new List<Arc>();
            Arc cur = null;
            void Close() { if (cur != null && Math.Abs(cur.Span - ARC_SPAN) <= ARC_SPAN_TOL) arcs.Add(cur); cur = null; }
            foreach (var c in curves)
            {
                var a = Fit(c.P);
                bool continues = a != null && cur != null && Math.Abs(c.P[0] - cur.X3) <= TOUCH && Math.Abs(c.P[1] - cur.Y3) <= TOUCH
                    && Math.Abs(a.R - cur.R) <= CIRCLE * cur.R && Math.Sqrt((a.Cx - cur.Cx) * (a.Cx - cur.Cx) + (a.Cy - cur.Cy) * (a.Cy - cur.Cy)) <= CIRCLE * cur.R;
                if (continues) { cur.Span += a.Span; cur.X3 = a.X3; cur.Y3 = a.Y3; }
                else { Close(); cur = a; }
            }
            Close();
            return arcs;
        }

        static (double, double) Bez(double[] p, double t)
        {
            double u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
            return (a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]);
        }

        /// <summary>The circle through a curve's ends and middle, when its quarter points lie on it too; its span in degrees.</summary>
        static Arc Fit(double[] p)
        {
            var (x1, y1) = (p[0], p[1]); var (x2, y2) = Bez(p, 0.5); var (x3, y3) = (p[6], p[7]);
            double det = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
            if (Math.Abs(det) < 1e-9) return null;
            double s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
            double cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / det, cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / det;
            double r = Math.Sqrt((x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy));
            foreach (var t in new[] { 0.25, 0.75 })
            {
                var (qx, qy) = Bez(p, t);
                if (Math.Abs(Math.Sqrt((qx - cx) * (qx - cx) + (qy - cy) * (qy - cy)) - r) > CIRCLE * r) return null;
            }
            double Ang(double ax, double ay, double bx, double by) =>
                Math.Abs(Math.Atan2((ax - cx) * (by - cy) - (ay - cy) * (bx - cx), (ax - cx) * (bx - cx) + (ay - cy) * (by - cy))) * 180 / Math.PI;
            return new Arc { Cx = cx, Cy = cy, R = r, Span = Ang(x1, y1, x2, y2) + Ang(x2, y2, x3, y3), X0 = x1, Y0 = y1, X3 = x3, Y3 = y3 };
        }

        /// <summary>"W x H" tags (one word, or three: W, x, H): a tag is a door's when each is the other's nearest within TAG_REACH radii
        /// (a window's or a room's size beside a door is not the door's).</summary>
        static void Tags(List<Door> doors, IList<Word> words)
        {
            var tags = new List<(int w, int h, double x, double y)>();
            for (int i = 0; i < words.Count; i++)
            {
                var m = TAG.Match(words[i].Text.Trim());
                if (m.Success) { tags.Add((int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), words[i].X, words[i].Y)); continue; }
                if (i + 2 < words.Count)
                {
                    var m3 = TAG.Match($"{words[i].Text}{words[i + 1].Text}{words[i + 2].Text}");
                    if (m3.Success) tags.Add((int.Parse(m3.Groups[1].Value), int.Parse(m3.Groups[2].Value), words[i + 1].X, words[i + 1].Y));
                }
            }
            double Dist(Door d, (int w, int h, double x, double y) t) => Math.Sqrt((t.x - d.X) * (t.x - d.X) + (t.y - d.Y) * (t.y - d.Y));
            int NearestDoor((int w, int h, double x, double y) t)
            {
                int best = -1; double bd = double.MaxValue;
                for (int d = 0; d < doors.Count; d++) { double x = Dist(doors[d], t); if (x <= TAG_REACH * doors[d].Width && x < bd) { bd = x; best = d; } }
                return best;
            }
            for (int d = 0; d < doors.Count; d++)
            {
                int bestTag = -1; double bt = double.MaxValue;
                for (int k = 0; k < tags.Count; k++) { double x = Dist(doors[d], tags[k]); if (x <= TAG_REACH * doors[d].Width && x < bt) { bt = x; bestTag = k; } }
                if (bestTag < 0 || NearestDoor(tags[bestTag]) != d) continue;
                doors[d].TagW = tags[bestTag].w; doors[d].TagH = tags[bestTag].h;
            }
        }
    }
}
