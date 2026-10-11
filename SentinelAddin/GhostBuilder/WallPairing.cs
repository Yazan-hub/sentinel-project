#nullable disable
// Pair the two parallel faces a wall is DRAWN as, and read the thickness from the gap between them.
//
// WHY. A DWG draws a wall as two lines — its two faces — a wall-thickness apart. The extractor used to
// turn each line into its own LOD-200 wall run, producing two paper-thin walls where there should be one
// solid wall of a known thickness, and discarding exactly the number the Office Modelling Guideline needs
// to pick a type (docs/BDS_TEMPLATE_TYPE_AUDIT.md: for BDS walls, thickness IS the type variant).
//
// PURE 2D GEOMETRY. No Revit types — takes bare segment endpoints, returns centreline + thickness — so it
// runs and is tested offline on plain .NET, like sentinel-core. GhostCadExtractor feeds it the real curve
// endpoints and rebuilds Revit curves from the centrelines it returns.
//
// ORDER-INDEPENDENT (2026-10-11; the MA-5a-3 review found the first version read by line order — a CAD file
// writes its lines in any order). Collinear segments are one FACE (the intervals they cover); two faces
// within maxThicknessMm and angleTolDeg of parallel are a wall where BOTH are present. Pairs claim over the
// whole drawing, never in input order: those with an OUTER face (nothing parallel beyond it) first, then the
// rest, each by its gap, closest first; a face is claimed once per side (a lining shares the wall's face); a
// pair whose faces are already walls on their far sides is a void or a cavity between two walls; a face
// inside a wall is no face of another. A claim then crosses a gap where only ONE face breaks (a wall meeting
// it: a T) and runs on along a face that continues alone to a corner within maxThicknessMm (an L corner).
// A wall is longer than it is thick (two jambs a door apart are no wall). So a face left over at a T can no
// longer steal a far partner, jambs near a corner can no longer swallow the corner's wall, and two walls of
// different thickness on one flush face stay two — whatever order the lines come in.
// The same approach reads vector PDF plans in drawing/PlanReader.cs (sentinel-drawing).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    /// <summary>A 2D line segment — a DWG wall face. Units are the drawing's (millimetres for a mm DWG).</summary>
    public readonly struct Seg
    {
        public readonly double X1, Y1, X2, Y2;
        public Seg(double x1, double y1, double x2, double y2) { X1 = x1; Y1 = y1; X2 = x2; Y2 = y2; }
        public double Dx => X2 - X1;
        public double Dy => Y2 - Y1;
        public double Length => Math.Sqrt(Dx * Dx + Dy * Dy);
    }

    /// <summary>One wall recovered from a pair of faces: its centreline and the measured thickness.</summary>
    public sealed class PairedWall
    {
        public double Cx1, Cy1, Cx2, Cy2;   // centreline endpoints
        public double ThicknessMm;          // gap between the two faces, in drawing units
        public int FaceA, FaceB;            // indices of a segment of each face it came from (FaceB -1: an unpaired line)
    }

    public static class WallPairing
    {
        const double MERGE_DEG = 0.5; // segments this close to one angle, on one line, are one face

        /// <summary>
        /// Recover walls from face segments, whatever order they come in. A line (or the stretch of one) that
        /// pairs with nothing is returned as a single "unpaired" centreline (thickness 0) rather than dropped —
        /// a lone line on a wall layer is still a wall the modeller drew, it just has no measurable thickness,
        /// and the guideline reports that honestly as a gap instead of the builder inventing one. A short line
        /// that closes a wall's outline (an end cap, a jamb, a step between two thicknesses) is part of that
        /// wall, not a wall of its own.
        /// </summary>
        /// <param name="maxThicknessMm">Ignore pairs further apart than this — two walls on opposite sides
        /// of a room are parallel and overlapping but are NOT one wall. 1000mm covers any real wall.</param>
        /// <param name="angleTolDeg">How far from parallel two faces may be and still pair (drawings drift).</param>
        /// <param name="minOverlapFrac">How much of the shorter face must overlap the longer for the two to be
        /// considered at all.</param>
        public static List<PairedWall> Pair(
            IReadOnlyList<Seg> segments,
            double maxThicknessMm = 1000.0,
            double angleTolDeg = 5.0,
            double minOverlapFrac = 0.5)
        {
            var walls = new List<PairedWall>();
            if (segments == null || segments.Count == 0) return walls;
            double touch = Math.Max(1e-6, maxThicknessMm * 1e-3); // 1 mm a 1000 mm wall: lines this close touch
            double tol = angleTolDeg * Math.PI / 180;
            var faces = Faces(segments, touch, Math.Min(MERGE_DEG, angleTolDeg) * Math.PI / 180);

            // Candidate pairs, and which side of each face has a parallel neighbour (an outer face has none).
            var pairs = new List<Pr>();
            foreach (var a in faces)
                foreach (var b in faces)
                {
                    if (b.Id <= a.Id || AngleBetween(a, b) > tol) continue;
                    var p = new Pr(a, b);
                    var raw = Inter(a.Iv, p.ToA(b.Iv), touch);
                    if (raw.Count == 0) continue;
                    double mid = (raw[0].a + raw[raw.Count - 1].b) / 2, gs = p.OffsetOfB(mid);
                    p.G = Math.Abs(gs);
                    if (p.G <= touch || p.G > maxThicknessMm) continue;
                    p.SideA = Math.Sign(gs);
                    p.SideB = Math.Sign(p.OffsetOfA(p.AtoB(mid)));
                    a.Near[p.SideA > 0 ? 1 : 0] = true;
                    b.Near[p.SideB > 0 ? 1 : 0] = true;
                    if (Len(raw) < minOverlapFrac * Math.Min(Len(a.Iv), Len(b.Iv))) continue;
                    pairs.Add(p);
                }
            // Outer first, then the gap, then where the pair sits — the order of the input never decides.
            pairs = pairs.OrderBy(p => !p.A.Near[p.SideA > 0 ? 0 : 1] || !p.B.Near[p.SideB > 0 ? 0 : 1] ? 0 : 1)
                         .ThenBy(p => p.G).ThenBy(p => p.A.Id).ThenBy(p => p.B.Id).ToList();

            var claims = new List<Pr>();
            foreach (var p in pairs)
            {
                var both = Inter(Minus(p.A.Iv, p.A.Side(p.SideA), touch), p.ToA(Minus(p.B.Iv, p.B.Side(p.SideB), touch)), touch);
                both = Minus(both, Inter(p.A.Side(-p.SideA), p.ToA(p.B.Side(-p.SideB)), touch), touch); // a void between two walls
                foreach (var c in claims)
                    if (Inside(p.A, c, tol, touch) || Inside(p.B, c, tol, touch)) both = Minus(both, Frame(c.Both, c.A, p.A), touch); // a face inside a wall
                if (Len(both) < p.G) continue; // shorter than thick wherever both faces are free: jambs, caps
                p.Id = claims.Count;
                p.Both = both;
                claims.Add(p);
                foreach (var x in both) p.A.Own[p.SideA > 0 ? 1 : 0].Add((x.a, x.b, p.Id));
                foreach (var x in p.ToB(both)) p.B.Own[p.SideB > 0 ? 1 : 0].Add((x.a, x.b, p.Id));
            }

            // Each claim's runs: across a gap one face spans alone (a T), on along a face to its own corner.
            var bands = new List<(Pr p, double lo, double hi)>();
            foreach (var p in claims)
            {
                var runs = new List<(double lo, double hi)>();
                foreach (var x in p.Both)
                {
                    if (runs.Count > 0)
                    {
                        var last = runs[runs.Count - 1];
                        var gapB = p.ToB(new List<(double a, double b)> { (last.hi, x.a) });
                        if (Free(p.A, last.hi, x.a, p.Id, touch) || (gapB.Count > 0 && Free(p.B, gapB[0].a, gapB[0].b, p.Id, touch)))
                        { runs[runs.Count - 1] = (last.lo, x.b); continue; }
                    }
                    runs.Add((x.a, x.b));
                }
                foreach (var (lo0, hi0) in runs)
                {
                    double lo = Math.Min(RunOn(p.A, lo0, -1, p.Id, maxThicknessMm, touch), p.BtoA(RunOn(p.B, p.AtoB(lo0), -p.Dir, p.Id, maxThicknessMm, touch)));
                    double hi = Math.Max(RunOn(p.A, hi0, 1, p.Id, maxThicknessMm, touch), p.BtoA(RunOn(p.B, p.AtoB(hi0), p.Dir, p.Id, maxThicknessMm, touch)));
                    lo = Math.Min(lo, lo0); hi = Math.Max(hi, hi0);
                    if (hi - lo < p.G) continue; // a wall is longer than it is thick
                    bands.Add((p, lo, hi));
                }
            }

            // Walls: the centreline midway between the faces over the run; FaceA/FaceB a segment of each face.
            var corners = new List<(double x, double y)>();
            foreach (var (p, lo, hi) in bands)
            {
                var a0 = p.A.At(lo); var a1 = p.A.At(hi); var b0 = p.B.At(p.AtoB(lo)); var b1 = p.B.At(p.AtoB(hi));
                var am = p.A.At((lo + hi) / 2); var bm = p.B.At(p.AtoB((lo + hi) / 2));
                walls.Add(new PairedWall
                {
                    Cx1 = (a0.x + b0.x) / 2, Cy1 = (a0.y + b0.y) / 2, Cx2 = (a1.x + b1.x) / 2, Cy2 = (a1.y + b1.y) / 2,
                    ThicknessMm = Math.Sqrt((am.x - bm.x) * (am.x - bm.x) + (am.y - bm.y) * (am.y - bm.y)),
                    FaceA = Member(p.A, lo, hi), FaceB = Member(p.B, Math.Min(p.AtoB(lo), p.AtoB(hi)), Math.Max(p.AtoB(lo), p.AtoB(hi))),
                });
                corners.Add(a0); corners.Add(a1); corners.Add(b0); corners.Add(b1);
            }

            // Leftovers — every line, or stretch of one, no wall covers, as an unpaired centreline (nothing a modeller
            // drew is silently lost), except a short line both of whose ends are a wall's corners (a cap, a jamb, a step).
            double near = 5 * touch;
            bool Corner(double x, double y) => corners.Any(c => (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) <= near * near);
            foreach (var f in faces)
            {
                var covered = new List<(double a, double b)>();
                double thick = 0; // the thickest wall this face is a face of: a leftover shorter than it is that wall's end, not a line
                foreach (var (p, lo, hi) in bands)
                {
                    if (p.A == f) covered.Add((lo, hi));
                    else if (p.B == f) { double s0 = p.AtoB(lo), s1 = p.AtoB(hi); covered.Add((Math.Min(s0, s1), Math.Max(s0, s1))); }
                    else continue;
                    thick = Math.Max(thick, p.G);
                }
                covered = Norm(covered, touch);
                foreach (var (i, s0, s1) in f.Members)
                {
                    var seg = segments[i];
                    if (seg.Length <= maxThicknessMm && Corner(seg.X1, seg.Y1) && Corner(seg.X2, seg.Y2)) continue;
                    var left = Minus(new List<(double a, double b)> { (s0, s1) }, covered, touch).Where(x => x.b - x.a > Math.Max(near, thick)).ToList();
                    if (left.Count == 1 && left[0].a <= s0 + touch && left[0].b >= s1 - touch)
                    { walls.Add(new PairedWall { Cx1 = seg.X1, Cy1 = seg.Y1, Cx2 = seg.X2, Cy2 = seg.Y2, ThicknessMm = 0, FaceA = i, FaceB = -1 }); continue; }
                    foreach (var (u0, u1) in left)
                    {
                        var e0 = f.At(u0); var e1 = f.At(u1);
                        walls.Add(new PairedWall { Cx1 = e0.x, Cy1 = e0.y, Cx2 = e1.x, Cy2 = e1.y, ThicknessMm = 0, FaceA = i, FaceB = -1 });
                    }
                }
            }
            return walls;
        }

        // ---- faces ------------------------------------------------------------------------------------------

        /// <summary>A face: collinear segments as the intervals they cover along U (s), at offset Off along N. Own[0] /
        /// Own[1]: what pairs claimed on its -N / +N side; Near[0] / Near[1]: a parallel face overlaps it on that side.</summary>
        sealed class Face
        {
            public int Id; public double Th, Ux, Uy, Nx, Ny, Off;
            public List<(double a, double b)> Iv;
            public List<(int seg, double a, double b)> Members = new List<(int, double, double)>();
            public readonly List<(double a, double b, int pair)>[] Own = { new List<(double, double, int)>(), new List<(double, double, int)>() };
            public readonly bool[] Near = new bool[2];
            public List<(double a, double b)> Side(int side) => Norm(Own[side > 0 ? 1 : 0].Select(o => (o.a, o.b)), 0);
            public IEnumerable<(double a, double b, int pair)> AllOwn => Own[0].Concat(Own[1]);
            public (double x, double y) At(double s) => (Ux * s + Nx * Off, Uy * s + Ny * Off);
            public double S(double x, double y) => x * Ux + y * Uy;
            public double O(double x, double y) => x * Nx + y * Ny;
        }

        /// <summary>Segments grouped by angle (within merge), then by offset (within touch) into faces — sorted by
        /// geometry, so their ids (and every tie-break after) do not depend on the input's order.</summary>
        static List<Face> Faces(IReadOnlyList<Seg> segs, double touch, double merge)
        {
            var dir = new List<(int i, double th)>();
            for (int i = 0; i < segs.Count; i++)
            {
                var s = segs[i];
                if (s.Length < 1e-6) continue; // a point is no line
                double th = Math.Atan2(s.Dy, s.Dx);
                if (th < 0) th += Math.PI;
                if (th >= Math.PI - merge / 2) th -= Math.PI; // 179.9° is 0°'s
                dir.Add((i, th));
            }
            dir = dir.OrderBy(d => d.th).ThenBy(d => segs[d.i].X1 + segs[d.i].X2).ThenBy(d => segs[d.i].Y1 + segs[d.i].Y2).ToList();
            var faces = new List<Face>();
            for (int i = 0; i < dir.Count;)
            {
                int j = i + 1;
                while (j < dir.Count && dir[j].th - dir[j - 1].th <= merge) j++;
                double th = 0;
                for (int k = i; k < j; k++) th += dir[k].th;
                th /= j - i;
                double ux = Math.Cos(th), uy = Math.Sin(th), nx = -uy, ny = ux;
                var at = new List<(int seg, double off, double a, double b)>();
                for (int k = i; k < j; k++)
                {
                    var s = segs[dir[k].i];
                    double s1 = s.X1 * ux + s.Y1 * uy, s2 = s.X2 * ux + s.Y2 * uy;
                    at.Add((dir[k].i, ((s.X1 + s.X2) / 2) * nx + ((s.Y1 + s.Y2) / 2) * ny, Math.Min(s1, s2), Math.Max(s1, s2)));
                }
                at = at.OrderBy(x => x.off).ThenBy(x => x.a).ToList();
                for (int k = 0; k < at.Count;)
                {
                    int m = k + 1;
                    while (m < at.Count && at[m].off - at[m - 1].off <= touch) m++;
                    var f = new Face { Id = faces.Count, Th = th, Ux = ux, Uy = uy, Nx = nx, Ny = ny };
                    for (int q = k; q < m; q++) { f.Off += at[q].off; f.Members.Add((at[q].seg, at[q].a, at[q].b)); }
                    f.Off /= m - k;
                    f.Iv = Norm(f.Members.Select(x => (x.a, x.b)), touch);
                    faces.Add(f);
                    k = m;
                }
                i = j;
            }
            return faces;
        }

        static double AngleBetween(Face a, Face b)
        {
            double d = Math.Abs(a.Th - b.Th) % Math.PI;
            return Math.Min(d, Math.PI - d);
        }

        /// <summary>A candidate pair of faces, with the maps between A's frame (s along A) and B's.</summary>
        sealed class Pr
        {
            public readonly Face A, B; public readonly int Dir; // Dir: +1 when A's and B's U point the same way
            public double G; public int SideA, SideB, Id; public List<(double a, double b)> Both;
            public Pr(Face a, Face b) { A = a; B = b; Dir = a.Ux * b.Ux + a.Uy * b.Uy >= 0 ? 1 : -1; }
            public double AtoB(double s) { var p = A.At(s); return B.S(p.x, p.y); }
            public double BtoA(double s) { var p = B.At(s); return A.S(p.x, p.y); }
            public double OffsetOfB(double sA) { var p = B.At(AtoB(sA)); return A.O(p.x, p.y) - A.Off; }
            public double OffsetOfA(double sB) { var p = A.At(BtoA(sB)); return B.O(p.x, p.y) - B.Off; }
            public List<(double a, double b)> ToA(List<(double a, double b)> iv) => Norm(iv.Select(x => (Math.Min(BtoA(x.a), BtoA(x.b)), Math.Max(BtoA(x.a), BtoA(x.b)))), 0);
            public List<(double a, double b)> ToB(List<(double a, double b)> iv) => Norm(iv.Select(x => (Math.Min(AtoB(x.a), AtoB(x.b)), Math.Max(AtoB(x.a), AtoB(x.b)))), 0);
        }

        /// <summary>Intervals in face `from`'s frame, in face `to`'s (through the points they cover).</summary>
        static List<(double a, double b)> Frame(List<(double a, double b)> iv, Face from, Face to)
        {
            if (from == to) return iv;
            return Norm(iv.Select(x =>
            {
                var p = from.At(x.a); var q = from.At(x.b);
                double s0 = to.S(p.x, p.y), s1 = to.S(q.x, q.y);
                return (Math.Min(s0, s1), Math.Max(s0, s1));
            }), 0);
        }

        /// <summary>Face f lies between claim c's two faces, where they overlap it.</summary>
        static bool Inside(Face f, Pr c, double tol, double touch)
        {
            if (f == c.A || f == c.B || AngleBetween(f, c.A) > tol) return false;
            var ov = Inter(Frame(f.Iv, f, c.A), c.Both, touch);
            if (ov.Count == 0) return false;
            double mid = (ov[0].a + ov[ov.Count - 1].b) / 2;
            var m = c.A.At(mid);
            var p = f.At(f.S(m.x, m.y));
            double d = (c.A.O(p.x, p.y) - c.A.Off) * c.SideA;
            return d > touch && d < c.G - touch;
        }

        /// <summary>x0..x1 on face l is drawn and no other pair's claim.</summary>
        static bool Free(Face l, double x0, double x1, int id, double touch) =>
            Covers(l.Iv, x0, x1, touch) && !l.AllOwn.Any(o => o.pair != id && o.b > x0 + touch && o.a < x1 - touch);

        /// <summary>How far face l continues alone from e (side -1: down its U, +1: up), when it stops within max —
        /// a corner; a face that runs on further is a single line beyond the wall, not the wall. Never into another
        /// pair's claim.</summary>
        static double RunOn(Face l, double e, int side, int id, double max, double touch)
        {
            var iv = l.Iv.FirstOrDefault(x => x.a <= e + touch && x.b >= e - touch);
            if (iv.b - iv.a <= 0) return e;
            double end = side < 0 ? iv.a : iv.b;
            if (Math.Abs(end - e) > max) return e;
            foreach (var o in l.AllOwn)
            {
                if (o.pair == id) continue;
                if (side < 0 && o.b <= e + touch && o.b > end) end = o.b;
                if (side > 0 && o.a >= e - touch && o.a < end) end = o.a;
            }
            return end;
        }

        /// <summary>The segment of face f that overlaps lo..hi most (the wall's FaceA / FaceB).</summary>
        static int Member(Face f, double lo, double hi) =>
            f.Members.OrderByDescending(m => Math.Min(m.b, hi) - Math.Max(m.a, lo)).ThenBy(m => m.a).First().seg;

        // ---- intervals --------------------------------------------------------------------------------------

        static List<(double a, double b)> Norm(IEnumerable<(double a, double b)> xs, double touch)
        {
            var o = new List<(double a, double b)>();
            foreach (var x in xs.Where(x => x.b - x.a > 0).OrderBy(x => x.a))
            {
                if (o.Count > 0 && x.a <= o[o.Count - 1].b + touch) o[o.Count - 1] = (o[o.Count - 1].a, Math.Max(o[o.Count - 1].b, x.b));
                else o.Add(x);
            }
            return o;
        }
        static List<(double a, double b)> Inter(List<(double a, double b)> A, List<(double a, double b)> B, double touch)
        {
            var o = new List<(double a, double b)>();
            int i = 0, j = 0;
            while (i < A.Count && j < B.Count)
            {
                double lo = Math.Max(A[i].a, B[j].a), hi = Math.Min(A[i].b, B[j].b);
                if (hi - lo > touch) o.Add((lo, hi));
                if (A[i].b < B[j].b) i++; else j++;
            }
            return o;
        }
        static List<(double a, double b)> Minus(List<(double a, double b)> A, List<(double a, double b)> cut, double touch)
        {
            var o = new List<(double a, double b)>(A);
            foreach (var (ca, cb) in cut)
            {
                var next = new List<(double a, double b)>();
                foreach (var (a, b) in o)
                {
                    if (cb <= a || ca >= b) { next.Add((a, b)); continue; }
                    if (ca - a > touch) next.Add((a, ca));
                    if (b - cb > touch) next.Add((cb, b));
                }
                o = next;
            }
            return o;
        }
        static double Len(List<(double a, double b)> A) => A.Sum(x => x.b - x.a);
        static bool Covers(List<(double a, double b)> A, double x0, double x1, double touch) => A.Any(x => x.a <= x0 + touch && x.b >= x1 - touch);
    }
}
