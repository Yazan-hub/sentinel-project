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
// writes its lines in any order). Collinear segments are one FACE, with its own direction (the intervals it
// covers); two faces within maxThicknessMm and angleTolDeg of parallel are a wall where BOTH are present.
// Pairs claim over the whole drawing, never in input order: those with an OUTER face (nothing parallel beyond
// it) first, then the rest, each by its gap, closest first. A face that is already one wall's face is another
// wall's face only when one of the two is a lining (LINING of maxThicknessMm) — a lone line beside a wall
// stays a lone line; a pair whose faces are already walls on their far sides is a void or a cavity; a face
// inside a wall is no face of another. A claim then crosses a gap where only ONE face breaks (a wall meeting
// it: a T), crosses a gap where both break when a crossing wall's own gap fits it (a crossing), and runs on
// along a face that continues alone — to a corner within maxThicknessMm, or to the middle of the gap before
// the next wall on that face. A wall is longer than it is thick (two jambs a door apart are no wall). Short
// lines whose ends are wall corners (caps, jambs, steps) are consumed; every other stretch no wall covers is
// returned as an unpaired line. The same approach reads vector PDF plans in drawing/PlanReader.cs.
// ponytail: an L corner whose two outer faces both run on alone past maxThicknessMm leaves its corner square empty; faces drifting
// apart give one averaged straight wall; a cavity's closers and a nib shorter than it is thick are no walls of their own.
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
        public double Cx1, Cy1, Cx2, Cy2;   // centreline endpoints, in the drawn direction of its FaceA segment
        public double ThicknessMm;          // gap between the two faces, in drawing units
        public int FaceA, FaceB;            // indices of a segment of each face it came from (FaceB -1: an unpaired line)
    }

    public static class WallPairing
    {
        const double MERGE_DEG = 0.5; // segments within this of one angle (anchored, not chained), on one line, are one face
        const double LINING = 0.1;    // of maxThicknessMm: a wall this thin may share a face with another wall (a lining)

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
            double tol = angleTolDeg * Math.PI / 180, lining = LINING * maxThicknessMm;
            var faces = Faces(segments, touch, Math.Min(MERGE_DEG, angleTolDeg) * Math.PI / 180);
            var near = Neighbours(faces, maxThicknessMm, tol);

            // Candidate pairs, and which side of each face has a parallel neighbour (an outer face has none).
            var pairs = new List<Pr>();
            foreach (var a in faces)
                foreach (var b in near[a.Id])
                {
                    if (b.Id <= a.Id) continue;
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
            List<(double a, double b)> Shared(Face f, int side, double g) => // already another wall's face there, neither a lining
                Norm(f.Own[side > 0 ? 1 : 0].Where(o => Math.Min(g, claims[o.pair].G) > lining).Select(o => (o.a, o.b)), 0);
            foreach (var p in pairs)
            {
                var both = Inter(Minus(p.A.Iv, p.A.Side(p.SideA), touch), p.ToA(Minus(p.B.Iv, p.B.Side(p.SideB), touch)), touch);
                both = Minus(both, Inter(p.A.Side(-p.SideA), p.ToA(p.B.Side(-p.SideB)), touch), touch); // a void between two walls
                both = Minus(both, Shared(p.A, -p.SideA, p.G), touch);
                both = Minus(both, p.ToA(Shared(p.B, -p.SideB, p.G)), touch);
                foreach (var c in Nearby(p, near, claims))
                    if (Inside(p.A, c, tol, touch) || Inside(p.B, c, tol, touch)) both = Minus(both, Frame(c.Both, c.A, p.A), touch); // a face inside a wall
                if (Len(both) < p.G) continue; // shorter than thick wherever both faces are free: jambs, caps
                p.Id = claims.Count;
                p.Both = both;
                claims.Add(p);
                p.A.Claims.Add(p); p.B.Claims.Add(p);
                foreach (var x in both) p.A.Own[p.SideA > 0 ? 1 : 0].Add((x.a, x.b, p.Id));
                foreach (var x in p.ToB(both)) p.B.Own[p.SideB > 0 ? 1 : 0].Add((x.a, x.b, p.Id));
            }

            // Each claim's runs: across a gap one face spans alone (a T); then across a gap both break where a crossing wall's
            // own gap fits it (a crossing).
            foreach (var p in claims)
            {
                p.Runs = new List<(double lo, double hi)>();
                foreach (var x in p.Both)
                {
                    if (p.Runs.Count > 0)
                    {
                        var last = p.Runs[p.Runs.Count - 1];
                        var gapB = p.ToB(new List<(double a, double b)> { (last.hi, x.a) });
                        if (Free(p.A, last.hi, x.a, p.Id, touch) || (gapB.Count > 0 && Free(p.B, gapB[0].a, gapB[0].b, p.Id, touch)))
                        { p.Runs[p.Runs.Count - 1] = (last.lo, x.b); continue; }
                    }
                    p.Runs.Add((x.a, x.b));
                }
            }
            Crossings(claims, tol, touch);

            // On along a face that continues alone, then the bands: a wall is longer than it is thick.
            var bands = new List<(Pr p, double lo, double hi)>();
            foreach (var p in claims)
                foreach (var (lo0, hi0) in p.Runs)
                {
                    double lo = Math.Min(lo0, Math.Min(RunOn(p.A, lo0, -1, p, maxThicknessMm, touch), p.BtoA(RunOn(p.B, p.AtoB(lo0), -p.Dir, p, maxThicknessMm, touch))));
                    double hi = Math.Max(hi0, Math.Max(RunOn(p.A, hi0, 1, p, maxThicknessMm, touch), p.BtoA(RunOn(p.B, p.AtoB(hi0), p.Dir, p, maxThicknessMm, touch))));
                    if (hi - lo < p.G) continue;
                    bands.Add((p, lo, hi));
                    p.A.Bands.Add((lo, hi, p.G));
                    double b0 = p.AtoB(lo), b1 = p.AtoB(hi);
                    p.B.Bands.Add((Math.Min(b0, b1), Math.Max(b0, b1), p.G));
                }

            // Walls: the centreline midway between the faces over the band, in the drawn direction of its FaceA segment.
            double nearMm = 5 * touch;
            var corners = new Dictionary<(long, long), List<(double x, double y)>>();
            (long, long) Cell(double x, double y) => ((long)Math.Floor(x / nearMm), (long)Math.Floor(y / nearMm));
            foreach (var (p, lo, hi) in bands)
            {
                var a0 = p.A.At(lo); var a1 = p.A.At(hi); var b0 = p.B.At(p.AtoB(lo)); var b1 = p.B.At(p.AtoB(hi));
                var am = p.A.At((lo + hi) / 2); var bm = p.B.At(p.AtoB((lo + hi) / 2));
                double b0s = p.AtoB(lo), b1s = p.AtoB(hi);
                int fa = Member(p.A, lo, hi), fb = Member(p.B, Math.Min(b0s, b1s), Math.Max(b0s, b1s));
                if (fb < fa) (fa, fb) = (fb, fa); // FaceA: the face line drawn first, as before
                var w = new PairedWall
                {
                    Cx1 = Um((a0.x + b0.x) / 2), Cy1 = Um((a0.y + b0.y) / 2), Cx2 = Um((a1.x + b1.x) / 2), Cy2 = Um((a1.y + b1.y) / 2),
                    ThicknessMm = Math.Sqrt((am.x - bm.x) * (am.x - bm.x) + (am.y - bm.y) * (am.y - bm.y)),
                    FaceA = fa, FaceB = fb,
                };
                var sa = segments[fa]; // the centreline runs the way its FaceA line is drawn (Revit puts a type's exterior by it)
                if (sa.Dx * (w.Cx2 - w.Cx1) + sa.Dy * (w.Cy2 - w.Cy1) < 0) { (w.Cx1, w.Cx2) = (w.Cx2, w.Cx1); (w.Cy1, w.Cy2) = (w.Cy2, w.Cy1); }
                walls.Add(w);
                foreach (var c in new[] { a0, a1, b0, b1 })
                {
                    var k = Cell(c.x, c.y);
                    if (!corners.TryGetValue(k, out var l)) corners[k] = l = new List<(double x, double y)>();
                    l.Add(c);
                }
            }
            bool Corner(double x, double y)
            {
                var (cx, cy) = Cell(x, y);
                for (long i = cx - 1; i <= cx + 1; i++)
                    for (long j = cy - 1; j <= cy + 1; j++)
                        if (corners.TryGetValue((i, j), out var l) && l.Any(c => (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) <= nearMm * nearMm)) return true;
                return false;
            }

            // Leftovers — every line, or stretch of one, no wall covers, as an unpaired centreline (nothing a modeller drew is
            // silently lost), except a short line both of whose ends are a wall's corners (a cap, a jamb, a step) and a stub at a
            // wall's end no longer than that wall is thick (drift's sliver, not a line).
            foreach (var f in faces)
            {
                var covered = Norm(f.Bands.Select(x => (x.lo, x.hi)), touch);
                double thick = f.Bands.Count == 0 ? 0 : f.Bands.Max(x => x.g);
                foreach (var (i, s0, s1) in f.Members)
                {
                    var seg = segments[i];
                    if (seg.Length <= nearMm) continue; // a line of a few millimetres is a drafting speck, not a wall
                    if (seg.Length <= maxThicknessMm && Corner(seg.X1, seg.Y1) && Corner(seg.X2, seg.Y2)) continue;
                    var left = Minus(new List<(double a, double b)> { (s0, s1) }, covered, touch);
                    if (left.Count == 1 && left[0].a <= s0 + touch && left[0].b >= s1 - touch)
                    { walls.Add(new PairedWall { Cx1 = seg.X1, Cy1 = seg.Y1, Cx2 = seg.X2, Cy2 = seg.Y2, ThicknessMm = 0, FaceA = i, FaceB = -1 }); continue; }
                    bool fwd = seg.Dx * f.Ux + seg.Dy * f.Uy >= 0;
                    foreach (var (u0, u1) in left)
                    {
                        bool between = covered.Any(c => Math.Abs(c.b - u0) <= touch) && covered.Any(c => Math.Abs(c.a - u1) <= touch);
                        if (u1 - u0 <= (between ? nearMm : Math.Max(nearMm, thick))) continue;
                        var e0 = f.At(fwd ? u0 : u1); var e1 = f.At(fwd ? u1 : u0);
                        walls.Add(new PairedWall { Cx1 = Um(e0.x), Cy1 = Um(e0.y), Cx2 = Um(e1.x), Cy2 = Um(e1.y), ThicknessMm = 0, FaceA = i, FaceB = -1 });
                    }
                }
            }
            // In the drawing's own line order (by the line each came from), as before: Ghost Builder numbers a layer's walls in this order.
            return walls.OrderBy(w => w.FaceA).ThenBy(w => w.Cx1).ThenBy(w => w.Cy1).ToList();
        }

        // ---- joins (MA-5b-6, GHB-6) ---------------------------------------------------------------------------

        /// <summary>MA-5b-6 (GHB-6): the bridge's trimEnds (WebApp/bridge/survey-plan.mjs), ported — each end of a paired wall moved along
        /// its own line to the nearest centreline of another paired wall it meets: within that wall's thickness + 50 of the end, the two
        /// not within 10° of parallel, the crossing on that wall's line or within this wall's thickness + 50 past its ends. Read from the
        /// untrimmed walls, so the order never matters; a trim that would leave a wall under 1 long leaves it; unpaired lines (thickness 0)
        /// neither trim nor are trimmed to. An L corner's overshoot (the run on to the outer corner) comes back to the centrelines'
        /// crossing; a T's stem reaches the through wall's centreline. ponytail: end to centreline only, O(n²) — a mitre or three walls at
        /// one end are Revit's joins; a grid of buckets when a drawing's walls run to tens of thousands.</summary>
        public static void TrimEnds(IList<PairedWall> walls)
        {
            const double SLACK = 50;
            double sinMin = Math.Sin(Math.PI / 18);
            var moved = new (double x1, double y1, double x2, double y2)?[walls.Count];
            for (int i = 0; i < walls.Count; i++)
            {
                var w = walls[i];
                double dx = w.Cx2 - w.Cx1, dy = w.Cy2 - w.Cy1, len = Math.Sqrt(dx * dx + dy * dy);
                if (!(w.ThicknessMm > 0) || len <= 0) continue;
                double ux = dx / len, uy = dy / len;
                double To(double ex, double ey) // e + t·u = o.start + v·(o.end − o.start)
                {
                    double? best = null;
                    for (int j = 0; j < walls.Count; j++)
                    {
                        var o = walls[j];
                        if (j == i || !(o.ThicknessMm > 0)) continue;
                        double ox = o.Cx2 - o.Cx1, oy = o.Cy2 - o.Cy1, ol = Math.Sqrt(ox * ox + oy * oy), den = ux * oy - uy * ox;
                        if (ol <= 0 || Math.Abs(den) < sinMin * ol) continue; // parallel, or nearly
                        double rx = o.Cx1 - ex, ry = o.Cy1 - ey, t = (rx * oy - ry * ox) / den, v = (rx * uy - ry * ux) / den, slack = (w.ThicknessMm + SLACK) / ol;
                        if (Math.Abs(t) > o.ThicknessMm + SLACK || v < -slack || v > 1 + slack) continue;
                        if (best == null || Math.Abs(t) < Math.Abs(best.Value)) best = t;
                    }
                    return best ?? 0;
                }
                double t0 = To(w.Cx1, w.Cy1), t1 = To(w.Cx2, w.Cy2);
                if (len - t0 + t1 < 1) continue;
                moved[i] = (Um(w.Cx1 + t0 * ux), Um(w.Cy1 + t0 * uy), Um(w.Cx2 + t1 * ux), Um(w.Cy2 + t1 * uy));
            }
            for (int i = 0; i < walls.Count; i++)
                if (moved[i] is var (x1, y1, x2, y2)) { walls[i].Cx1 = x1; walls[i].Cy1 = y1; walls[i].Cx2 = x2; walls[i].Cy2 = y2; }
        }

        /// <summary>MA-5b-6 (GHB-6): two paired walls a drawing broke at a door or window are ONE wall through it (Revit hosts an opening in
        /// one wall) — of one thickness (± 1), on one line (within 0.5° and 1), consecutive along it (no paired wall of the list on that line
        /// over the gap), at most <paramref name="reach"/> apart, an opening point in the gap (along it within 1 of its ends, across it
        /// within half the thickness + <paramref name="hostTol"/>). The joined wall keeps the piece drawn first's direction and face;
        /// each opening once (wall–door–wall–window–wall is one wall). Two pieces with no opening between them stay two (a gap a
        /// person drew). Call it per Walls row: a door between two rows' walls joins nothing.</summary>
        public static List<PairedWall> JoinAtOpenings(IReadOnlyList<PairedWall> walls, IReadOnlyList<(double X, double Y)> openings, double reach, double hostTol)
        {
            var ws = walls.ToList();
            if (openings == null || openings.Count == 0) return ws;
            double sinTol = Math.Sin(0.5 * Math.PI / 180);
            double Len(PairedWall a) => Math.Sqrt((a.Cx2 - a.Cx1) * (a.Cx2 - a.Cx1) + (a.Cy2 - a.Cy1) * (a.Cy2 - a.Cy1));
            // Along a's line from its start: the point's s, and its distance across.
            (double s, double n) On(PairedWall a, double x, double y)
            {
                double dx = a.Cx2 - a.Cx1, dy = a.Cy2 - a.Cy1, l = Len(a);
                return (((x - a.Cx1) * dx + (y - a.Cy1) * dy) / l, Math.Abs((x - a.Cx1) * dy - (y - a.Cy1) * dx) / l);
            }
            bool OneLine(PairedWall a, PairedWall b)
            {
                double la = Len(a), lb = Len(b);
                if (la <= 0 || lb <= 0) return false;
                double cross = ((a.Cx2 - a.Cx1) * (b.Cy2 - b.Cy1) - (a.Cy2 - a.Cy1) * (b.Cx2 - b.Cx1)) / (la * lb);
                return Math.Abs(cross) <= sinTol && On(a, b.Cx1, b.Cy1).n <= 1 && On(a, b.Cx2, b.Cy2).n <= 1;
            }
            // One pass: an opening sits in one gap, so it joins one pair at most; a chain joins in any order (A+B then AB+C, or B+C then A+BC).
            foreach (var (px, py) in openings)
            {
                {
                    // The paired walls whose line passes the point and that stop short of it within reach.
                    var near = ws.Where(a => a.ThicknessMm > 0 && Len(a) > 0).Select(a => (a, at: On(a, px, py)))
                                 .Where(c => c.at.n <= c.a.ThicknessMm / 2 + hostTol
                                             && (c.at.s >= Len(c.a) - 1 ? c.at.s - Len(c.a) <= reach + 1 : c.at.s <= 1 && -c.at.s <= reach + 1))
                                 .Select(c => c.a).ToList();
                    foreach (var a in near.OrderBy(x => x.FaceA))
                    {
                        double la = Len(a), sp = On(a, px, py).s;
                        PairedWall b = null; double lo = 0, hi = 0;
                        foreach (var c in near)
                        {
                            if (c == a || Math.Abs(c.ThicknessMm - a.ThicknessMm) > 1 || !OneLine(a, c)) continue;
                            double c0 = On(a, c.Cx1, c.Cy1).s, c1 = On(a, c.Cx2, c.Cy2).s, cl = Math.Min(c0, c1), ch = Math.Max(c0, c1);
                            bool after = sp >= la - 1 && cl >= sp - 1 && cl - la <= reach, before = sp <= 1 && ch <= sp + 1 && -ch <= reach;
                            if (!(after || before)) continue;
                            double g0 = after ? la : ch, g1 = after ? cl : 0;
                            // consecutive: no other paired wall on this line over the gap
                            if (ws.Any(d => d != a && d != c && d.ThicknessMm > 0 && OneLine(a, d)
                                            && Math.Max(On(a, d.Cx1, d.Cy1).s, On(a, d.Cx2, d.Cy2).s) > g0 + 1 && Math.Min(On(a, d.Cx1, d.Cy1).s, On(a, d.Cx2, d.Cy2).s) < g1 - 1)) continue;
                            b = c; lo = Math.Min(0, cl); hi = Math.Max(la, ch);
                            break;
                        }
                        if (b == null) continue;
                        double ux = (a.Cx2 - a.Cx1) / la, uy = (a.Cy2 - a.Cy1) / la;
                        var first = a.FaceA <= b.FaceA ? a : b;
                        var j = new PairedWall
                        {
                            Cx1 = Um(a.Cx1 + lo * ux), Cy1 = Um(a.Cy1 + lo * uy), Cx2 = Um(a.Cx1 + hi * ux), Cy2 = Um(a.Cy1 + hi * uy),
                            ThicknessMm = first.ThicknessMm, FaceA = first.FaceA, FaceB = first.FaceB,
                        };
                        // the piece drawn first's direction (Revit puts a type's exterior by it)
                        double fx = first.Cx2 - first.Cx1, fy = first.Cy2 - first.Cy1;
                        if (fx * (j.Cx2 - j.Cx1) + fy * (j.Cy2 - j.Cy1) < 0) { (j.Cx1, j.Cx2) = (j.Cx2, j.Cx1); (j.Cy1, j.Cy2) = (j.Cy2, j.Cy1); }
                        ws[ws.IndexOf(first)] = j;
                        ws.Remove(first == a ? b : a);
                        break;
                    }
                }
            }
            return ws;
        }

        // ---- faces ------------------------------------------------------------------------------------------

        /// <summary>A face: collinear segments as the intervals they cover along its own U (s), at offset Off along its N.
        /// Own[0] / Own[1]: what pairs claimed on its -N / +N side; Near[0] / Near[1]: a parallel face overlaps it there.</summary>
        sealed class Face
        {
            public int Id; public double Th, Ux, Uy, Nx, Ny, Off;
            public List<(double a, double b)> Iv;
            public List<(int seg, double a, double b)> Members = new List<(int, double, double)>();
            public readonly List<(double a, double b, int pair)>[] Own = { new List<(double, double, int)>(), new List<(double, double, int)>() };
            public readonly bool[] Near = new bool[2];
            public readonly List<Pr> Claims = new List<Pr>();
            public readonly List<(double lo, double hi, double g)> Bands = new List<(double, double, double)>();
            public List<(double a, double b)> Side(int side) => Norm(Own[side > 0 ? 1 : 0].Select(o => (o.a, o.b)), 0);
            public IEnumerable<(double a, double b, int pair)> AllOwn => Own[0].Concat(Own[1]);
            public (double x, double y) At(double s) => (Ux * s + Nx * Off, Uy * s + Ny * Off);
            public double S(double x, double y) => x * Ux + y * Uy;
            public double O(double x, double y) => x * Nx + y * Ny;
        }

        /// <summary>A segment's angle in [0, π), the same whichever end it is drawn from.</summary>
        static double Angle(Seg s)
        {
            double dx = s.Dx, dy = s.Dy;
            if (dx < 0 || (dx == 0 && dy < 0)) { dx = -dx; dy = -dy; }
            double th = Math.Atan2(dy, dx); // (-π/2, π/2]
            return th < 0 ? th + Math.PI : th;
        }

        /// <summary>Segments into faces: angle windows anchored at their first member (never chained across a layer — a curve's
        /// facets cannot drag a square wall's angle), cut where the angles leave their widest gap (so no fixed angle splits a
        /// line); within a window, segments on one line (offsets within touch). Each face takes its own members' angle and
        /// offset, length-weighted. Sorted by geometry, so ids — and every tie-break after — do not depend on input order.</summary>
        static List<Face> Faces(IReadOnlyList<Seg> segs, double touch, double merge)
        {
            var dir = new List<(int i, double th, double len)>();
            for (int i = 0; i < segs.Count; i++)
            {
                var s = segs[i];
                if (s.Length < 1e-6) continue; // a point is no line
                dir.Add((i, Angle(s), s.Length));
            }
            var faces = new List<Face>();
            if (dir.Count == 0) return faces;
            dir = dir.OrderBy(d => d.th).ThenBy(d => segs[d.i].X1 + segs[d.i].X2).ThenBy(d => segs[d.i].Y1 + segs[d.i].Y2).ToList();
            // Start after the widest angular gap (the circle wraps at π): angles before it come after, +π.
            int cut = 0; double widest = dir[0].th + Math.PI - dir[dir.Count - 1].th;
            for (int k = 1; k < dir.Count; k++) if (dir[k].th - dir[k - 1].th > widest) { widest = dir[k].th - dir[k - 1].th; cut = k; }
            dir = dir.Skip(cut).Concat(dir.Take(cut).Select(d => (d.i, d.th + Math.PI, d.len))).ToList();
            for (int i = 0; i < dir.Count;)
            {
                int j = i + 1;
                while (j < dir.Count && dir[j].th - dir[i].th <= merge) j++;
                // The window's frame for telling lines apart: its length-weighted MEDIAN angle — the walls' own, which a few
                // short unrelated lines in the window (a curve's facets, a drifted line) cannot tilt.
                double wl = 0, acc = 0, wth = dir[i].th;
                for (int k = i; k < j; k++) wl += dir[k].len;
                foreach (var d in dir.Skip(i).Take(j - i).OrderBy(d => d.th)) { acc += d.len; if (acc >= wl / 2) { wth = d.th; break; } }
                double wnx = -Math.Sin(wth), wny = Math.Cos(wth);
                var at = new List<(int seg, double th, double len, double off)>();
                for (int k = i; k < j; k++)
                {
                    var s = segs[dir[k].i];
                    at.Add((dir[k].i, dir[k].th, dir[k].len, ((s.X1 + s.X2) / 2) * wnx + ((s.Y1 + s.Y2) / 2) * wny));
                }
                foreach (var cluster in Lines(at, touch))
                {
                    var f = Build(cluster, segs, faces.Count, touch);
                    // A face must be a line: when a member strays from it (pieces drawn at slightly different angles that met
                    // here), split the cluster by precise angle, each piece on its own line — never one averaged face off all.
                    if (cluster.Count > 1 && f.Members.Any(mb => Strays(segs[mb.seg], f, touch)))
                    {
                        var sorted = cluster.OrderBy(x => x.th).ThenBy(x => x.seg).ToList();
                        for (int a = 0; a < sorted.Count;)
                        {
                            int b = a + 1;
                            while (b < sorted.Count && sorted[b].th - sorted[a].th <= FINE) b++;
                            var sub = sorted.Skip(a).Take(b - a).ToList();
                            var (snx, sny) = (-Math.Sin(sub[0].th), Math.Cos(sub[0].th));
                            var subAt = sub.Select(x => { var s = segs[x.seg]; return (x.seg, x.th, x.len, off: ((s.X1 + s.X2) / 2) * snx + ((s.Y1 + s.Y2) / 2) * sny); }).ToList();
                            foreach (var c2 in Lines(subAt, touch)) faces.Add(Build(c2, segs, faces.Count, touch));
                            a = b;
                        }
                    }
                    else faces.Add(f);
                }
                i = j;
            }
            return faces;
        }

        const double FINE = 1e-4; // radians: angles this close are one line's over a 10 m face, to within a millimetre

        /// <summary>Segments on one line: sorted by offset, consecutive offsets within touch.</summary>
        static List<List<(int seg, double th, double len, double off)>> Lines(List<(int seg, double th, double len, double off)> at, double touch)
        {
            var o = new List<List<(int seg, double th, double len, double off)>>();
            at = at.OrderBy(x => x.off).ThenBy(x => x.seg).ToList();
            for (int k = 0; k < at.Count;)
            {
                int m = k + 1;
                while (m < at.Count && at[m].off - at[m - 1].off <= touch) m++;
                o.Add(at.Skip(k).Take(m - k).ToList());
                k = m;
            }
            return o;
        }

        /// <summary>A face from its members: their length-weighted angle and offset, the intervals they cover.</summary>
        static Face Build(List<(int seg, double th, double len, double off)> members, IReadOnlyList<Seg> segs, int id, double touch)
        {
            double fl = 0, fth = 0;
            foreach (var x in members) { fth += x.th * x.len; fl += x.len; }
            fth /= fl;
            var f = new Face { Id = id, Th = fth, Ux = Math.Cos(fth), Uy = Math.Sin(fth), Nx = -Math.Sin(fth), Ny = Math.Cos(fth) };
            double off = 0;
            foreach (var x in members)
            {
                var s = segs[x.seg];
                off += (((s.X1 + s.X2) / 2) * f.Nx + ((s.Y1 + s.Y2) / 2) * f.Ny) * x.len;
                double s1 = f.S(s.X1, s.Y1), s2 = f.S(s.X2, s.Y2);
                f.Members.Add((x.seg, Math.Min(s1, s2), Math.Max(s1, s2)));
            }
            f.Off = off / fl;
            f.Iv = Norm(f.Members.Select(x => (x.a, x.b)), touch);
            return f;
        }

        static bool Strays(Seg s, Face f, double touch) =>
            Math.Abs(f.O(s.X1, s.Y1) - f.Off) > touch || Math.Abs(f.O(s.X2, s.Y2) - f.Off) > touch;

        /// <summary>A computed coordinate to the micrometre (a millimetre drawing's float noise, never "-0").</summary>
        static double Um(double v) => Math.Round(v, 3) + 0.0;

        static double AngleBetween(Face a, Face b)
        {
            double d = Math.Abs(a.Th - b.Th) % Math.PI;
            return Math.Min(d, Math.PI - d);
        }

        /// <summary>Each face's neighbours: faces within angle tol of parallel whose extents come within max — through a
        /// grid of max-sized cells along each face, so a big drawing is not every face against every face.</summary>
        static List<Face>[] Neighbours(List<Face> faces, double max, double tol)
        {
            var grid = new Dictionary<(long, long), List<int>>();
            var cells = new List<(long, long)>[faces.Count];
            foreach (var f in faces)
            {
                var set = new HashSet<(long, long)>();
                double s0 = f.Iv[0].a, s1 = f.Iv[f.Iv.Count - 1].b;
                int steps = Math.Max(1, (int)Math.Ceiling((s1 - s0) / max));
                for (int k = 0; k <= steps; k++)
                {
                    var p = f.At(s0 + (s1 - s0) * k / steps);
                    long cx = (long)Math.Floor(p.x / max), cy = (long)Math.Floor(p.y / max);
                    for (long i = cx - 1; i <= cx + 1; i++) for (long j = cy - 1; j <= cy + 1; j++) set.Add((i, j));
                }
                cells[f.Id] = set.ToList();
                foreach (var c in set) { if (!grid.TryGetValue(c, out var l)) grid[c] = l = new List<int>(); l.Add(f.Id); }
            }
            var near = new List<Face>[faces.Count];
            foreach (var f in faces)
            {
                var ids = new HashSet<int>();
                foreach (var c in cells[f.Id]) foreach (var id in grid[c]) if (id != f.Id && AngleBetween(f, faces[id]) <= tol) ids.Add(id);
                near[f.Id] = ids.OrderBy(x => x).Select(x => faces[x]).ToList();
            }
            return near;
        }

        /// <summary>Claims on p's faces and their neighbours — the only ones a face of p can lie inside.</summary>
        static IEnumerable<Pr> Nearby(Pr p, List<Face>[] near, List<Pr> claims)
        {
            var seen = new HashSet<int>();
            foreach (var f in near[p.A.Id].Concat(near[p.B.Id]).Concat(new[] { p.A, p.B }))
                foreach (var c in f.Claims) if (seen.Add(c.Id)) yield return c;
        }

        /// <summary>A candidate pair of faces, with the maps between A's frame (s along A) and B's.</summary>
        sealed class Pr
        {
            public readonly Face A, B; public readonly int Dir; // Dir: +1 when A's and B's U point the same way
            public double G; public int SideA, SideB, Id; public List<(double a, double b)> Both;
            public List<(double lo, double hi)> Runs;
            public Pr(Face a, Face b) { A = a; B = b; Dir = a.Ux * b.Ux + a.Uy * b.Uy >= 0 ? 1 : -1; }
            public double AtoB(double s) { var p = A.At(s); return B.S(p.x, p.y); }
            public double BtoA(double s) { var p = B.At(s); return A.S(p.x, p.y); }
            public double OffsetOfB(double sA) { var p = B.At(AtoB(sA)); return A.O(p.x, p.y) - A.Off; }
            public double OffsetOfA(double sB) { var p = A.At(BtoA(sB)); return B.O(p.x, p.y) - B.Off; }
            public (double x, double y) Centre(double sA) { var a = A.At(sA); var b = B.At(AtoB(sA)); return ((a.x + b.x) / 2, (a.y + b.y) / 2); }
            public List<(double a, double b)> ToA(List<(double a, double b)> iv) => Norm(iv.Select(x => (Math.Min(BtoA(x.a), BtoA(x.b)), Math.Max(BtoA(x.a), BtoA(x.b)))), 0);
            public List<(double a, double b)> ToB(List<(double a, double b)> iv) => Norm(iv.Select(x => (Math.Min(AtoB(x.a), AtoB(x.b)), Math.Max(AtoB(x.a), AtoB(x.b)))), 0);
        }

        /// <summary>Two walls that cut each other: each one's opening as wide as the other is thick, at the same place —
        /// both run through (the PDF reader's rule).</summary>
        static void Crossings(List<Pr> claims, double tol, double touch)
        {
            var gaps = new List<(Pr p, int k, double g0, double g1)>();
            foreach (var p in claims)
                for (int k = 0; k + 1 < p.Runs.Count; k++) gaps.Add((p, k, p.Runs[k].hi, p.Runs[k + 1].lo));
            var join = new HashSet<(int, int)>();
            foreach (var (p, k, g0, g1) in gaps)
            {
                var c = p.Centre((g0 + g1) / 2);
                foreach (var (q, k2, h0, h1) in gaps)
                {
                    if (q == p || AngleBetween(p.A, q.A) <= tol) continue;
                    double slack = Math.Max(10 * touch, 0.1 * Math.Max(p.G, q.G)), s = q.A.S(c.x, c.y);
                    var qc = q.Centre(s);
                    if ((qc.x - c.x) * (qc.x - c.x) + (qc.y - c.y) * (qc.y - c.y) > slack * slack || s < h0 - slack || s > h1 + slack) continue;
                    if (Math.Abs((g1 - g0) - q.G) > slack || Math.Abs((h1 - h0) - p.G) > slack) continue;
                    join.Add((p.Id, k)); join.Add((q.Id, k2));
                }
            }
            foreach (var p in claims)
                for (int k = p.Runs.Count - 2; k >= 0; k--)
                    if (join.Contains((p.Id, k))) { p.Runs[k] = (p.Runs[k].lo, p.Runs[k + 1].hi); p.Runs.RemoveAt(k + 1); }
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

        /// <summary>How far face l continues alone from e (side -1: down its U, +1: up): to the next wall on that face (to the
        /// middle of the gap when that wall is on the same side — two walls meeting at a T meet there), else to the face's own
        /// end — when that is within max (a corner); a face that runs on further is a single line beyond the wall.</summary>
        static double RunOn(Face l, double e, int side, Pr p, double max, double touch)
        {
            var iv = l.Iv.FirstOrDefault(x => x.a <= e + touch && x.b >= e - touch);
            if (iv.b - iv.a <= 0) return e;
            double stop = side < 0 ? iv.a : iv.b, nearest = stop;
            bool same = false;
            int mine = (l == p.A ? p.SideA : p.SideB) > 0 ? 1 : 0;
            for (int k = 0; k < 2; k++)
                foreach (var o in l.Own[k])
                {
                    if (o.pair == p.Id) continue;
                    double at = side < 0 ? o.b : o.a;
                    if (side < 0 ? (at > e + touch || at <= nearest) : (at < e - touch || at >= nearest)) continue;
                    nearest = at; same = k == mine;
                }
            double end = nearest == stop ? stop : same ? (e + nearest) / 2 : nearest;
            return Math.Abs(end - e) > max ? e : end;
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
