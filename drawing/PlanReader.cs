#nullable disable
// MA-5a-3 — sentinel-drawing's reading of one plan page (plan docs/superpowers/plans/2026-10-11-ma5a3-drawing-reader.md).
//
// WALLS: a vector plan draws a cut wall as its two faces, in the page's heaviest line weight (a PDF has no layers; a CAD plot draws cut
// walls heaviest). The faces are paired by the add-in's own WallPairing (linked, rule for rule); a pair is a wall only when it is longer
// than it is thick (two jambs a door apart are parallel, overlapping and close — and are no wall).
// DOORS: a quarter-circle swing (90° ± 10) whose centre sits at the end of a wall across a gap of its radius (± 10 %), between two
// collinear walls of one thickness — those two are ONE wall through the door (Revit hosts a door in one wall). A "W x H" tag within
// 3 radii is kept, as the drawing's own numbers.
// Paper millimetres throughout (page origin bottom-left, y up): the scale and placement are the lead's 2-point alignment (MA-5a-4).
// Analyse() is pure — strokes, curves and words in, a Reading out; Read(page) only collects them.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Sentinel.GhostBuilder;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;

namespace Sentinel.Drawing
{
    public sealed class Stroke { public double X1, Y1, X2, Y2, Weight; }
    /// <summary>A cubic Bezier: P0, C1, C2, P3 as x, y pairs. Chain: its subpath — consecutive curves of one chain may be one arc.</summary>
    public sealed class Curve { public double[] P; public int Chain; }
    public sealed class Word { public string Text; public double X, Y; }

    public sealed class Wall { public double X1, Y1, X2, Y2, Thickness; public List<double[]> Faces = new List<double[]>(); }
    public sealed class Door { public int Host; public double X, Y, Ux, Uy, Along, Width, Cx, Cy; public int? TagW, TagH; }

    public sealed class Reading
    {
        public List<Wall> Walls = new List<Wall>();
        public List<Door> Doors = new List<Door>();
        public int Strokes, Faces, Arcs, Unpaired;
        public double? WallWeight;
        public string Why;
    }

    public static class PlanReader
    {
        public const double MM_PER_PT = 25.4 / 72;
        public const double PAIR_MAX = 25;     // paper mm: a 1250 mm wall at 1:50 — faces further apart are two walls across a room
        public const double MIN_FACE = 4;      // paper mm: a 200 mm stub at 1:50 — a shorter heavy stroke is a jamb or a stub, not a face
        public const double ARC_SPAN = 90, ARC_SPAN_TOL = 10; // degrees: a door swing is a quarter circle
        public const double GAP_TOL = 0.10;    // a swing's radius within 10 % of its gap; its hinge within 10 % of the gap's end
        public const double TAG_REACH = 3;     // a tag within 3 radii of its door
        const double ANGLE = 2;                // degrees: faces this close to parallel pair (a plot's rounding, not a drafter's drift)
        const double TOUCH = 0.05;             // paper mm: two heavy strokes end to end within this are one face (a line drawn in pieces)
        const double CIRCLE = 0.02;            // a curve is a circle's arc when its quarter points sit within 2 % of the radius
        static readonly Regex TAG = new Regex(@"^(\d{3,4})\s*[xX×]\s*(\d{3,4})$");

        /// <summary>Collect page 1's stroked lines, curves and words (paper mm) and analyse them.</summary>
        public static Reading Read(Page page)
        {
            var strokes = new List<Stroke>();
            var curves = new List<Curve>();
            int chain = 0;
            double X(PdfPoint p) => p.X * MM_PER_PT;
            double Y(PdfPoint p) => p.Y * MM_PER_PT;
            foreach (var path in page.Paths)
            {
                if (!path.IsStroked || path.IsClipping) continue;
                double w = Convert.ToDouble(path.LineWidth);
                foreach (var sub in path)
                {
                    chain++;
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
                                curves.Add(new Curve { Chain = chain, P = new[] { X(c.StartPoint), Y(c.StartPoint), X(c.FirstControlPoint), Y(c.FirstControlPoint),
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
            var weights = strokes.Select(s => Math.Round(s.Weight, 3)).Distinct().ToList();
            if (weights.Count == 1) { r.Why = "one line weight on the page — walls are not told from the rest"; return r; }
            double heavy = weights.Max();
            r.WallWeight = heavy;
            // ponytail: O(n²) merge and pairing (WallPairing's own) — a grid index when a real sheet's heavy strokes run to tens of thousands.
            var faces = Merge(strokes.Where(s => Math.Round(s.Weight, 3) == heavy).Select(s => new Seg(s.X1, s.Y1, s.X2, s.Y2)).ToList())
                .Where(s => s.Length >= MIN_FACE).ToList();
            r.Faces = faces.Count;

            var pieces = new List<Wall>();
            var used = new HashSet<int>();
            foreach (var p in WallPairing.Pair(faces, PAIR_MAX, ANGLE).Where(p => p.FaceB >= 0))
            {
                var w = Piece(faces[p.FaceA], faces[p.FaceB], p.ThicknessMm);
                if (w == null) continue;
                pieces.Add(w);
                used.Add(p.FaceA); used.Add(p.FaceB);
            }
            r.Unpaired = faces.Count - used.Count;

            var arcs = Arcs(curves);
            r.Arcs = arcs.Count;
            var group = Enumerable.Range(0, pieces.Count).ToArray();
            int Find(int i) { while (group[i] != i) i = group[i] = group[group[i]]; return i; }
            var found = new List<(int piece, Door door)>();
            var arcUsed = new bool[arcs.Count];
            for (int i = 0; i < pieces.Count; i++)
                for (int j = i + 1; j < pieces.Count; j++)
                {
                    var gap = Gap(pieces, i, j);
                    if (gap == null) continue;
                    var (g0, g1) = gap.Value;
                    var a = pieces[i];
                    var (ux, uy, len) = Dir(a);
                    double nx = -uy, ny = ux, g = g1 - g0;
                    int best = -1; double bestErr = double.MaxValue;
                    for (int k = 0; k < arcs.Count; k++)
                    {
                        if (arcUsed[k]) continue;
                        var c = arcs[k];
                        double s = (c.Cx - a.X1) * ux + (c.Cy - a.Y1) * uy, off = (c.Cx - a.X1) * nx + (c.Cy - a.Y1) * ny;
                        double err = Math.Abs(c.R - g);
                        if (err > GAP_TOL * g || Math.Abs(off) > a.Thickness / 2 + GAP_TOL * g) continue;
                        if (Math.Min(Math.Abs(s - g0), Math.Abs(s - g1)) > GAP_TOL * g) continue;
                        if (err < bestErr) { bestErr = err; best = k; }
                    }
                    if (best < 0) continue;
                    arcUsed[best] = true;
                    var arc = arcs[best];
                    double mid = (g0 + g1) / 2, side = (arc.Mx - a.X1) * nx + (arc.My - a.Y1) * ny >= 0 ? 1 : -1;
                    found.Add((i, new Door { X = a.X1 + ux * mid, Y = a.Y1 + uy * mid, Ux = nx * side, Uy = ny * side, Width = g, Cx = arc.Cx, Cy = arc.Cy }));
                    group[Find(j)] = Find(i);
                }

            // One wall per group of pieces joined through doors: its axis the first piece's, over every piece's extent.
            var wallOf = new Dictionary<int, int>();
            for (int i = 0; i < pieces.Count; i++)
            {
                int root = Find(i);
                if (wallOf.ContainsKey(root)) continue;
                var members = Enumerable.Range(0, pieces.Count).Where(k => Find(k) == root).Select(k => pieces[k]).ToList();
                wallOf[root] = r.Walls.Count;
                r.Walls.Add(Join(members));
            }
            foreach (var (piece, d) in found)
            {
                d.Host = wallOf[Find(piece)];
                var w = r.Walls[d.Host];
                d.Along = Math.Sqrt((d.X - w.X1) * (d.X - w.X1) + (d.Y - w.Y1) * (d.Y - w.Y1));
                r.Doors.Add(d);
            }
            r.Doors = r.Doors.OrderBy(d => d.Host).ThenBy(d => d.Along).ToList();
            Tags(r.Doors, words);
            return r;
        }

        static (double ux, double uy, double len) Dir(Wall w)
        {
            double dx = w.X2 - w.X1, dy = w.Y2 - w.Y1, l = Math.Sqrt(dx * dx + dy * dy);
            return (dx / l, dy / l, l);
        }

        /// <summary>The wall two paired faces draw: its centreline over both faces' extent, or null when it is shorter than it is thick.</summary>
        static Wall Piece(Seg a, Seg b, double t)
        {
            double ux = a.Dx / a.Length, uy = a.Dy / a.Length, nx = -uy, ny = ux;
            double S(double x, double y) => (x - a.X1) * ux + (y - a.Y1) * uy;
            double b0 = Math.Min(S(b.X1, b.Y1), S(b.X2, b.Y2)), b1 = Math.Max(S(b.X1, b.Y1), S(b.X2, b.Y2));
            if (Math.Min(a.Length, b1) - Math.Max(0, b0) < t) return null;
            double off = (((b.X1 + b.X2) / 2 - a.X1) * nx + ((b.Y1 + b.Y2) / 2 - a.Y1) * ny) / 2;
            double lo = Math.Min(0, b0), hi = Math.Max(a.Length, b1);
            var w = new Wall { X1 = a.X1 + ux * lo + nx * off, Y1 = a.Y1 + uy * lo + ny * off, X2 = a.X1 + ux * hi + nx * off, Y2 = a.Y1 + uy * hi + ny * off, Thickness = t };
            w.Faces.Add(new[] { a.X1, a.Y1, a.X2, a.Y2 });
            w.Faces.Add(new[] { b.X1, b.Y1, b.X2, b.Y2 });
            return w;
        }

        /// <summary>The gap between pieces i and j along i's axis, (g0, g1), when they are collinear walls of one thickness with nothing
        /// collinear between them; else null.</summary>
        static (double, double)? Gap(List<Wall> pieces, int i, int j)
        {
            var a = pieces[i];
            var (ux, uy, len) = Dir(a);
            double nx = -uy, ny = ux;
            bool Collinear(Wall b)
            {
                var (vx, vy, _) = Dir(b);
                if (Math.Abs(ux * vx + uy * vy) < Math.Cos(ANGLE * Math.PI / 180)) return false;
                if (Math.Abs(a.Thickness - b.Thickness) > 0.1 * Math.Max(a.Thickness, b.Thickness)) return false;
                double off = ((b.X1 + b.X2) / 2 - a.X1) * nx + ((b.Y1 + b.Y2) / 2 - a.Y1) * ny;
                return Math.Abs(off) <= Math.Max(0.25 * a.Thickness, 0.2);
            }
            (double, double) Span(Wall b)
            {
                double s1 = (b.X1 - a.X1) * ux + (b.Y1 - a.Y1) * uy, s2 = (b.X2 - a.X1) * ux + (b.Y2 - a.Y1) * uy;
                return (Math.Min(s1, s2), Math.Max(s1, s2));
            }
            var bj = pieces[j];
            if (!Collinear(bj)) return null;
            var (j0, j1) = Span(bj);
            double g0, g1;
            if (j0 >= len) { g0 = len; g1 = j0; }
            else if (j1 <= 0) { g0 = j1; g1 = 0; }
            else return null;
            if (g1 - g0 <= TOUCH) return null;
            for (int k = 0; k < pieces.Count; k++)
            {
                if (k == i || k == j || !Collinear(pieces[k])) continue;
                var (k0, k1) = Span(pieces[k]);
                if (k1 > g0 + TOUCH && k0 < g1 - TOUCH) return null;
            }
            return (g0, g1);
        }

        /// <summary>Collinear pieces joined through their doors: the first piece's axis over all their extents; the thickness length-weighted.</summary>
        static Wall Join(List<Wall> ps)
        {
            if (ps.Count == 1) return ps[0];
            var a = ps[0];
            var (ux, uy, _) = Dir(a);
            double lo = double.MaxValue, hi = double.MinValue, tl = 0, l = 0;
            foreach (var p in ps)
            {
                foreach (var (x, y) in new[] { (p.X1, p.Y1), (p.X2, p.Y2) })
                {
                    double s = (x - a.X1) * ux + (y - a.Y1) * uy;
                    lo = Math.Min(lo, s); hi = Math.Max(hi, s);
                }
                double pl = Dir(p).len;
                tl += p.Thickness * pl; l += pl;
            }
            var w = new Wall { X1 = a.X1 + ux * lo, Y1 = a.Y1 + uy * lo, X2 = a.X1 + ux * hi, Y2 = a.Y1 + uy * hi, Thickness = tl / l };
            foreach (var p in ps) w.Faces.AddRange(p.Faces);
            return w;
        }

        /// <summary>Heavy strokes that continue one another (collinear, end to end or overlapping) as one face.</summary>
        static List<Seg> Merge(List<Seg> segs)
        {
            var list = segs.Where(s => s.Length > 1e-9).ToList();
            for (bool merged = true; merged;)
            {
                merged = false;
                for (int i = 0; i < list.Count && !merged; i++)
                    for (int j = i + 1; j < list.Count && !merged; j++)
                    {
                        var a = list[i]; var b = list[j];
                        double ux = a.Dx / a.Length, uy = a.Dy / a.Length;
                        if (Math.Abs(ux * b.Dx / b.Length + uy * b.Dy / b.Length) < Math.Cos(0.5 * Math.PI / 180)) continue;
                        double Off(double x, double y) => Math.Abs((x - a.X1) * -uy + (y - a.Y1) * ux);
                        if (Off(b.X1, b.Y1) > TOUCH || Off(b.X2, b.Y2) > TOUCH) continue;
                        double S(double x, double y) => (x - a.X1) * ux + (y - a.Y1) * uy;
                        double b0 = Math.Min(S(b.X1, b.Y1), S(b.X2, b.Y2)), b1 = Math.Max(S(b.X1, b.Y1), S(b.X2, b.Y2));
                        if (b0 > a.Length + TOUCH || b1 < -TOUCH) continue;
                        double lo = Math.Min(0, b0), hi = Math.Max(a.Length, b1);
                        list[i] = new Seg(a.X1 + ux * lo, a.Y1 + uy * lo, a.X1 + ux * hi, a.Y1 + uy * hi);
                        list.RemoveAt(j);
                        merged = true;
                    }
            }
            return list;
        }

        sealed class Arc { public double Cx, Cy, R, Span, Mx, My; }

        /// <summary>Quarter-circle swings: each curve fitted to a circle; consecutive curves of one subpath on the same circle are one arc.</summary>
        static List<Arc> Arcs(IList<Curve> curves)
        {
            var arcs = new List<Arc>();
            Arc cur = null; int chain = -1; double endX = 0, endY = 0;
            void Close() { if (cur != null && Math.Abs(cur.Span - ARC_SPAN) <= ARC_SPAN_TOL) arcs.Add(cur); cur = null; }
            foreach (var c in curves)
            {
                var a = Fit(c.P);
                bool continues = a != null && cur != null && c.Chain == chain && Math.Abs(c.P[0] - endX) <= TOUCH && Math.Abs(c.P[1] - endY) <= TOUCH
                    && Math.Abs(a.R - cur.R) <= CIRCLE * cur.R && Math.Sqrt((a.Cx - cur.Cx) * (a.Cx - cur.Cx) + (a.Cy - cur.Cy) * (a.Cy - cur.Cy)) <= CIRCLE * cur.R;
                if (continues) cur.Span += a.Span;
                else { Close(); cur = a; }
                chain = c.Chain; endX = c.P[6]; endY = c.P[7];
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
            return new Arc { Cx = cx, Cy = cy, R = r, Span = Ang(x1, y1, x2, y2) + Ang(x2, y2, x3, y3), Mx = x2, My = y2 };
        }

        /// <summary>"W x H" tags (one word, or three: W, x, H) to the nearest door within TAG_REACH radii; a door keeps its nearest tag.</summary>
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
            var near = new double[doors.Count];
            for (int d = 0; d < doors.Count; d++) near[d] = double.MaxValue;
            foreach (var t in tags)
            {
                int best = -1; double bd = double.MaxValue;
                for (int d = 0; d < doors.Count; d++)
                {
                    double dist = Math.Sqrt((t.x - doors[d].X) * (t.x - doors[d].X) + (t.y - doors[d].Y) * (t.y - doors[d].Y));
                    if (dist <= TAG_REACH * doors[d].Width && dist < bd) { bd = dist; best = d; }
                }
                if (best < 0 || bd >= near[best]) continue;
                near[best] = bd;
                doors[best].TagW = t.w; doors[best].TagH = t.h;
            }
        }
    }
}
