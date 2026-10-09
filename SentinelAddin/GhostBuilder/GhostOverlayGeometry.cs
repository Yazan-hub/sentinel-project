#nullable disable
// MA-3c — the ghost overlay's geometry: what a review's proposed CREATE would be, as line segments in millimetres in the model's
// internal frame — the same points the executor places from (ChangesetExecutor: a wall's LocationCurve and its base/top, a floor's
// LocationLoop on its level, a roof's Boundary at level + BaseOffset, a ceiling's at level + Offset, a grid's line, a door's Location), so what is drawn is what Apply would make. Pure: no Revit types, pinned by
// tools/promote-check. A retype, an attach, a type edit or a level draws nothing — its element exists (Show selects it) or has no shape.
using System;
using System.Collections.Generic;
using System.Globalization;
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
        /// <summary>MA-3c Next: one translucent triangle of the overlay (mm) — a wall's sheet, a slab's fan, a point family's small panels.
        /// DirectContext3D draws every line one pixel wide, so a face is what reads at a site zoom.</summary>
        public sealed class Tri
        {
            public double[] A; public double[] B; public double[] C; public byte R, G, Bl;
        }
        /// <summary>The colour of a row's state: ticked green, unticked grey, declined (locked) red.</summary>
        public static (byte R, byte G, byte B) Colour(bool ticked, bool locked) => locked ? ((byte)200, (byte)60, (byte)60) : ticked ? ((byte)0, (byte)170, (byte)90) : ((byte)140, (byte)140, (byte)140);
        /// <summary>A wall whose top the proposal did not send is sketched this high (mm) — the executor decides the real top at Apply.</summary>
        public const double SketchHeightMm = 3000;
        public const int ArcChords = 16;
        public const double PointCrossMm = 600;
        /// <summary>A face's transparency for Revit (0 opaque … 255 invisible): the model shows through.</summary>
        public const byte FaceTransparency = 150;

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

        /// <summary>MA-3c Next: the faces of a create — a wall's sheet between base and top along each chord; a floor's, roof's or
        /// ceiling's outline as a fan from its first point (ponytail: a fan over-covers a concave outline; ear-clipping if it matters);
        /// a door's or window's two small upright panels at its point. Both windings, so the face shows from either side.</summary>
        public static List<Tri> Tris(ChangesetElementDto el, bool ticked, bool locked, double? levelMm = null)
        {
            var tris = new List<Tri>();
            if (!IsCreate(el)) return tris;
            var (r, g, b) = Colour(ticked, locked);
            var p = el.Place;
            bool Ok(double[] q) => q != null && q.Length >= 2;
            void Quad(double[] a, double[] c, double[] d, double[] e) // a→c→d→e around the face
            {
                tris.Add(new Tri { A = a, B = c, C = d, R = r, G = g, Bl = b }); tris.Add(new Tri { A = a, B = d, C = e, R = r, G = g, Bl = b });
                tris.Add(new Tri { A = a, B = d, C = c, R = r, G = g, Bl = b }); tris.Add(new Tri { A = a, B = e, C = d, R = r, G = g, Bl = b });
            }
            switch (el.Kind)
            {
                case "wall":
                {
                    var c = p.LocationCurve; if (c == null || !Ok(c.Start) || !Ok(c.End)) return tris;
                    double z0 = p.BaseElevation ?? levelMm ?? Z(c.Start, p), z1 = p.TopElevation ?? z0 + SketchHeightMm;
                    var pts = Ok(c.Mid) ? Arc(c.Start, c.Mid, c.End) : new List<double[]> { c.Start, c.End };
                    for (int i = 0; i + 1 < pts.Count; i++) Quad(At(pts[i], z0), At(pts[i + 1], z0), At(pts[i + 1], z1), At(pts[i], z1));
                    return tris;
                }
                case "floor": case "ceiling": case "roof":
                {
                    var loop = (el.Kind == "floor" ? p.LocationLoop : p.Boundary)?.Where(Ok).ToList();
                    if (loop == null || loop.Count < 3) return tris;
                    double z = (levelMm ?? p.BaseElevation ?? Z(loop[0], p)) + (el.Kind == "roof" ? p.BaseOffset ?? 0 : el.Kind == "ceiling" ? p.Offset ?? 0 : 0);
                    for (int i = 1; i + 1 < loop.Count; i++)
                    {
                        tris.Add(new Tri { A = At(loop[0], z), B = At(loop[i], z), C = At(loop[i + 1], z), R = r, G = g, Bl = b });
                        tris.Add(new Tri { A = At(loop[0], z), B = At(loop[i + 1], z), C = At(loop[i], z), R = r, G = g, Bl = b });
                    }
                    return tris;
                }
                case "door": case "window":
                {
                    var q = p.Location; if (!Ok(q)) return tris;
                    double z = Z(q, p), h = PointCrossMm / 2;
                    Quad(new[] { q[0] - h, q[1], z }, new[] { q[0] + h, q[1], z }, new[] { q[0] + h, q[1], z + PointCrossMm }, new[] { q[0] - h, q[1], z + PointCrossMm });
                    Quad(new[] { q[0], q[1] - h, z }, new[] { q[0], q[1] + h, z }, new[] { q[0], q[1] + h, z + PointCrossMm }, new[] { q[0], q[1] - h, z + PointCrossMm });
                    return tris;
                }
                default: return tris; // a grid is a line; a level has no shape
            }
        }

        /// <summary>Every face of a review, from its rows' states.</summary>
        public static List<Tri> AllTris(IEnumerable<(ChangesetElementDto El, bool Ticked, bool Locked)> rows, Func<ChangesetElementDto, double?> levelMm = null) =>
            (rows ?? Array.Empty<(ChangesetElementDto, bool, bool)>()).SelectMany(x => Tris(x.El, x.Ticked, x.Locked, levelMm?.Invoke(x.El))).ToList();

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
            : $"{drawn} of {creates} proposed create(s) outlined in this model's 3D views, plans and sections — a see-through face and its edges, ticked green, unticked grey, declined red; nothing is written. Open one to see them; they go when this window closes or Apply places them.";

        // ── MA-4f: the scan overlay — each point a small 3-arm cross (DirectContext3D draws 1-pixel lines and has no point size) ──
        /// <summary>At most this many points are drawn: 6 vertices each, 30 000 in one buffer — inside any 16-bit index width (Revit sizes its index
        /// buffers in short ints); the bridge sends no more (survey-plan SCAN_MAX). ponytail: one buffer; chunked buffers if a denser overlay is wanted.</summary>
        public const int ScanBudget = 5000;
        public const double ScanCrossMm = 60;
        /// <summary>Cyan: none of the ghosts' green, grey or red.</summary>
        public static readonly (byte R, byte G, byte B) ScanColour = (0, 160, 220);

        /// <summary>Three segments a point (±ScanCrossMm/2 along x, y and z), for the first <paramref name="budget"/> points with three finite
        /// numbers; none for none.</summary>
        public static List<Segment> ScanCrosses(IReadOnlyList<double[]> pts, int budget)
        {
            const double h = ScanCrossMm / 2;
            var segs = new List<Segment>();
            var c = ScanColour;
            foreach (var p in (pts ?? Array.Empty<double[]>()).Where(q => q != null && q.Length >= 3 && q.Take(3).All(v => !double.IsNaN(v) && !double.IsInfinity(v))).Take(budget))
            {
                segs.Add(new Segment { A = new[] { p[0] - h, p[1], p[2] }, B = new[] { p[0] + h, p[1], p[2] }, R = c.R, G = c.G, Bl = c.B });
                segs.Add(new Segment { A = new[] { p[0], p[1] - h, p[2] }, B = new[] { p[0], p[1] + h, p[2] }, R = c.R, G = c.G, Bl = c.B });
                segs.Add(new Segment { A = new[] { p[0], p[1], p[2] - h }, B = new[] { p[0], p[1], p[2] + h }, R = c.R, G = c.G, Bl = c.B });
            }
            return segs;
        }

        /// <summary>The window's line once the scan is drawn: <paramref name="drawn"/> points of the scan's.</summary>
        public static string ScanLine(ScanDto s, int drawn)
        {
            string F(double v) => v.ToString("0", CultureInfo.InvariantCulture);
            return $"Scan: {drawn} of {s.Of} point(s) drawn as cyan crosses — {s.Job} (ledger #{s.LedgerId}), one point per {s.CellMm} mm, {F(s.ZMm[0])}–{F(s.ZMm[1])} mm high (the walls less 300 mm at the floor and ceiling), placed by the lead's frame; nothing is written. Untick to hide.";
        }

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
