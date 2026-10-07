#nullable disable
// MA-3c — the ghost overlay's geometry: what a review's proposed CREATE would be, as line segments in millimetres in the model's
// internal frame — the same points the executor places from (ChangesetExecutor: a wall's LocationCurve and its base/top, a floor's
// LocationLoop on its level, a roof's Boundary at level + BaseOffset, a ceiling's at level + Offset, a grid's line, a door's Location), so what is drawn is what Apply would make. Pure: no Revit types, pinned by
// tools/promote-check. A retype, an attach, a type edit or a level draws nothing — its element exists (Show selects it) or has no shape.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder
{
    public static class GhostOverlayGeometry
    {
        /// <summary>One line of the overlay, millimetres, with its colour.</summary>
        public sealed class Segment
        {
            public double[] A; public double[] B; public byte R, G, Bl;
        }
        /// <summary>The colour of a row's state: ticked green, unticked grey, declined (locked) red.</summary>
        public static (byte R, byte G, byte B) Colour(bool ticked, bool locked) => locked ? ((byte)200, (byte)60, (byte)60) : ticked ? ((byte)0, (byte)170, (byte)90) : ((byte)140, (byte)140, (byte)140);
        /// <summary>A wall whose top the proposal did not send is sketched this high (mm) — the executor decides the real top at Apply.</summary>
        public const double SketchHeightMm = 3000;
        public const int ArcChords = 16;
        public const double PointCrossMm = 600;

        public static bool IsCreate(ChangesetElementDto el) => el != null && el.Op == "create" && el.Place != null;

        /// <summary>Review: a create the overlay can draw — a level is a create with no shape.</summary>
        public static bool Drawable(ChangesetElementDto el) => IsCreate(el) && el.Kind != "level";

        /// <summary><paramref name="levelMm"/>: the elevation (mm) of the level the executor resolves for this create, read on the API thread.</summary>
        public static List<Segment> Segments(ChangesetElementDto el, bool ticked, bool locked, double? levelMm = null)
        {
            var segs = new List<Segment>();
            if (!IsCreate(el)) return segs;
            var (r, g, b) = Colour(ticked, locked);
            var p = el.Place;
            Segment Seg(double[] a, double za, double[] c, double zc) => new Segment { A = At(a, za), B = At(c, zc), R = r, G = g, Bl = b };
            bool Ok(double[] q) => q != null && q.Length >= 2;
            switch (el.Kind)
            {
                case "wall":
                {
                    var c = p.LocationCurve; if (c == null || !Ok(c.Start) || !Ok(c.End)) return segs;
                    double z0 = p.BaseElevation ?? levelMm ?? Z(c.Start, p), z1 = p.TopElevation ?? z0 + SketchHeightMm;
                    var pts = Ok(c.Mid) ? Arc(c.Start, c.Mid, c.End) : new List<double[]> { c.Start, c.End };
                    for (int i = 0; i + 1 < pts.Count; i++) { segs.Add(Seg(pts[i], z0, pts[i + 1], z0)); segs.Add(Seg(pts[i], z1, pts[i + 1], z1)); }
                    segs.Add(Seg(c.Start, z0, c.Start, z1));
                    segs.Add(Seg(c.End, z0, c.End, z1));
                    return segs;
                }
                case "floor": case "ceiling": case "roof":
                {
                    // Review: the executor's sources — a floor's LocationLoop on its level; a roof's Boundary at level + BaseOffset; a
                    // ceiling's Boundary at level + Offset (its height above the level).
                    var loop = (el.Kind == "floor" ? p.LocationLoop : p.Boundary)?.Where(Ok).ToList();
                    if (loop == null || loop.Count < 2) return segs;
                    double z = (levelMm ?? p.BaseElevation ?? Z(loop[0], p)) + (el.Kind == "roof" ? p.BaseOffset ?? 0 : el.Kind == "ceiling" ? p.Offset ?? 0 : 0);
                    for (int i = 0; i < loop.Count; i++) segs.Add(Seg(loop[i], z, loop[(i + 1) % loop.Count], z));
                    return segs;
                }
                case "grid":
                {
                    var c = p.LocationCurve; if (c == null || !Ok(c.Start) || !Ok(c.End)) return segs;
                    segs.Add(Seg(c.Start, Z(c.Start, p), c.End, Z(c.End, p)));
                    return segs;
                }
                case "door": case "window":
                {
                    var q = p.Location; if (!Ok(q)) return segs;
                    double z = Z(q, p), h = PointCrossMm / 2;
                    segs.Add(Seg(new[] { q[0] - h, q[1] }, z, new[] { q[0] + h, q[1] }, z));
                    segs.Add(Seg(new[] { q[0], q[1] - h }, z, new[] { q[0], q[1] + h }, z));
                    segs.Add(Seg(q, z, q, z + PointCrossMm));
                    return segs;
                }
                default: return segs; // a level has no shape; an unknown kind draws nothing
            }
        }

        /// <summary>Every segment of a review, from its rows' states.</summary>
        public static List<Segment> All(IEnumerable<(ChangesetElementDto El, bool Ticked, bool Locked)> rows, Func<ChangesetElementDto, double?> levelMm = null) =>
            (rows ?? Array.Empty<(ChangesetElementDto, bool, bool)>()).SelectMany(x => Segments(x.El, x.Ticked, x.Locked, levelMm?.Invoke(x.El))).ToList();

        /// <summary>The least and greatest corner (mm) of the segments, or null when there are none.</summary>
        public static double[][] Bounds(IReadOnlyList<Segment> segs)
        {
            if (segs == null || segs.Count == 0) return null;
            var pts = segs.SelectMany(s => new[] { s.A, s.B }).ToList();
            return new[] { new[] { pts.Min(q => q[0]), pts.Min(q => q[1]), pts.Min(q => q[2]) }, new[] { pts.Max(q => q[0]), pts.Max(q => q[1]), pts.Max(q => q[2]) } };
        }

        /// <summary>The overlay's line for the window: <paramref name="drawn"/> of the <paramref name="creates"/> drawable creates outlined.</summary>
        public static string Line(int creates, int drawn) => creates == 0
            ? "No ghost to draw: this review proposes no create (a retype or attach changes an element that exists — Show selects it)."
            : drawn == 0 ? $"No ghost to draw: the {creates} proposed create(s) carry no points to draw from."
            : $"{drawn} of {creates} proposed create(s) outlined in this model's 3D views — ticked green, unticked grey, declined red; nothing is written. Open a 3D view to see them; they go when this window closes or Apply places them.";

        static double Z(double[] q, PlaceDto p) => q.Length >= 3 ? q[2] : p.BaseElevation ?? 0;
        static double[] At(double[] q, double z) => new[] { q[0], q[1], z };

        /// <summary>An arc through three points (mm, plan), as ArcChords chords from a through m to b; a collinear triple is the line a→b.</summary>
        public static List<double[]> Arc(double[] a, double[] m, double[] b)
        {
            double ax = a[0], ay = a[1], bx = b[0], by = b[1], mx = m[0], my = m[1];
            double d = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my));
            if (Math.Abs(d) < 1e-9) return new List<double[]> { a, b };
            double ux = ((ax * ax + ay * ay) * (my - by) + (mx * mx + my * my) * (by - ay) + (bx * bx + by * by) * (ay - my)) / d;
            double uy = ((ax * ax + ay * ay) * (bx - mx) + (mx * mx + my * my) * (ax - bx) + (bx * bx + by * by) * (mx - ax)) / d;
            double rad = Math.Sqrt((ax - ux) * (ax - ux) + (ay - uy) * (ay - uy));
            double t0 = Math.Atan2(ay - uy, ax - ux), tm = Math.Atan2(my - uy, mx - ux), t1 = Math.Atan2(by - uy, bx - ux);
            double Sweep(double from, double to, bool ccw) { double s = ccw ? to - from : from - to; while (s < 0) s += 2 * Math.PI; return s; }
            bool anticlockwise = Sweep(t0, tm, true) < Sweep(t0, t1, true); // the direction in which m lies between a and b
            double total = Sweep(t0, t1, anticlockwise);
            var pts = new List<double[]>();
            for (int i = 0; i <= ArcChords; i++) { double t = t0 + (anticlockwise ? 1 : -1) * total * i / ArcChords; pts.Add(new[] { ux + rad * Math.Cos(t), uy + rad * Math.Sin(t) }); }
            pts[0] = new[] { ax, ay }; pts[ArcChords] = new[] { bx, by };
            return pts;
        }
    }
}
