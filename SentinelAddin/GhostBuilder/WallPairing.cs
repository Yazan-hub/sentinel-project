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
// The whole thing is one geometric idea: two segments are the two faces of ONE wall when they are
// parallel, overlap along their shared direction, and sit within a plausible wall-thickness of each other.
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
        public int FaceA, FaceB;            // indices of the two segments consumed (for the "used" set)
    }

    public static class WallPairing
    {
        /// <summary>
        /// Recover walls from face segments. Anything not paired is returned as a single "unpaired"
        /// centreline (the segment itself, thickness 0) rather than dropped — a lone line on a wall layer
        /// is still a wall the modeller drew, it just has no measurable thickness, and the guideline
        /// reports that honestly as a gap instead of the builder inventing one.
        /// </summary>
        /// <param name="maxThicknessMm">Ignore pairs further apart than this — two walls on opposite sides
        /// of a room are parallel and overlapping but are NOT one wall. 1000mm covers any real wall.</param>
        /// <param name="angleTolDeg">How far from parallel two faces may be and still pair (drawings drift).</param>
        public static List<PairedWall> Pair(
            IReadOnlyList<Seg> segments,
            double maxThicknessMm = 1000.0,
            double angleTolDeg = 5.0,
            double minOverlapFrac = 0.5)
        {
            var walls = new List<PairedWall>();
            var used = new bool[segments.Count];
            double cosTol = Math.Cos(angleTolDeg * Math.PI / 180.0);

            // Greedy, but deterministic: for each segment take the CLOSEST valid partner. Closest-first
            // is what stops a thin wall stealing the far face of a thick wall beside it.
            for (int i = 0; i < segments.Count; i++)
            {
                if (used[i]) continue;
                var a = segments[i];
                if (a.Length < 1e-6) { used[i] = true; continue; }

                int best = -1;
                double bestGap = double.MaxValue;
                for (int j = i + 1; j < segments.Count; j++)
                {
                    if (used[j]) continue;
                    var b = segments[j];
                    if (b.Length < 1e-6) continue;

                    if (!Parallel(a, b, cosTol)) continue;
                    if (Overlap(a, b) < minOverlapFrac) continue;
                    double gap = PerpDistance(a, b);
                    if (gap < 1e-6 || gap > maxThicknessMm) continue; // coincident or too far to be one wall

                    if (gap < bestGap) { bestGap = gap; best = j; }
                }

                if (best >= 0)
                {
                    used[i] = used[best] = true;
                    walls.Add(Centreline(a, segments[best], bestGap, i, best));
                }
            }

            // Leftover faces — return as unpaired centrelines so nothing a modeller drew is silently lost.
            for (int i = 0; i < segments.Count; i++)
            {
                if (used[i]) continue;
                var a = segments[i];
                if (a.Length < 1e-6) continue;
                walls.Add(new PairedWall { Cx1 = a.X1, Cy1 = a.Y1, Cx2 = a.X2, Cy2 = a.Y2, ThicknessMm = 0, FaceA = i, FaceB = -1 });
            }
            return walls;
        }

        private static bool Parallel(Seg a, Seg b, double cosTol)
        {
            double la = a.Length, lb = b.Length;
            double dot = (a.Dx * b.Dx + a.Dy * b.Dy) / (la * lb);
            return Math.Abs(dot) >= cosTol; // |cos| — same OR opposite direction both count as parallel
        }

        /// <summary>Perpendicular distance from b's midpoint to the infinite line through a. This IS the
        /// wall thickness once the two are known to be parallel and overlapping.</summary>
        private static double PerpDistance(Seg a, Seg b)
        {
            double mx = (b.X1 + b.X2) * 0.5, my = (b.Y1 + b.Y2) * 0.5;
            double la = a.Length;
            // 2D cross product of a's direction with (a.start -> midpoint), normalised.
            return Math.Abs(a.Dx * (my - a.Y1) - a.Dy * (mx - a.X1)) / la;
        }

        /// <summary>Fraction of the shorter segment that overlaps the longer, measured along a's direction.
        /// Two collinear-but-separate wall segments (0 overlap) must not pair.</summary>
        private static double Overlap(Seg a, Seg b)
        {
            double ux = a.Dx / a.Length, uy = a.Dy / a.Length;
            double Proj(double x, double y) => (x - a.X1) * ux + (y - a.Y1) * uy;
            double a0 = 0, a1 = a.Length;
            double b0 = Proj(b.X1, b.Y1), b1 = Proj(b.X2, b.Y2);
            if (b0 > b1) { var t = b0; b0 = b1; b1 = t; }
            double lo = Math.Max(a0, b0), hi = Math.Min(a1, b1);
            double overlap = Math.Max(0, hi - lo);
            return overlap / Math.Min(a.Length, b.Length);
        }

        /// <summary>The centreline: each face's midpoint pushed half the gap toward the other. Using
        /// projected endpoints keeps the centreline along a's direction even when b is drawn reversed.</summary>
        private static PairedWall Centreline(Seg a, Seg b, double gap, int ia, int ib)
        {
            double mx = (a.X1 + b.X1 + a.X2 + b.X2) * 0.25;
            double my = (a.Y1 + b.Y1 + a.Y2 + b.Y2) * 0.25;
            // Direction from a's own endpoints; the centreline runs a's full length through the mid-point.
            double ux = a.Dx / a.Length, uy = a.Dy / a.Length;
            double half = a.Length * 0.5;
            return new PairedWall
            {
                Cx1 = mx - ux * half, Cy1 = my - uy * half,
                Cx2 = mx + ux * half, Cy2 = my + uy * half,
                ThicknessMm = gap,
                FaceA = ia, FaceB = ib,
            };
        }
    }
}
