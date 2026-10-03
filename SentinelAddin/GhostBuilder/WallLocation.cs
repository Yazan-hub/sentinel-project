#nullable disable
// MA-2a: inside or outside, read from the storey's own walls — the outer boundary as the cheapest honest reading sees it.
//
// WHAT "OUTSIDE" MEANS HERE. A wall is Exterior when exactly one of its two sides looks out: from a point just beyond that face,
// a ray away from the wall, or along the wall either way, meets no other wall of the storey — while the other side is enclosed
// in all three directions. It is Interior when both sides are enclosed. Anything else is UNKNOWN with its reason — both sides
// open (a free-standing wall, or a storey whose walls do not close), fewer than three other walls, a curved wall, a wall too
// short to look out from — and an unknown location is a named reason to a person, never a guess (the rule that needs it
// cannot fire). Walls stand in for the boundary whatever their type: an office type, a structural wall and a curtain wall
// enclose as well as a concept wall does; a curved wall's chord stands in for it as a barrier.
//
// CEILINGS, STATED. A wall facing a closed inner courtyard reads Interior (every direction meets a wall). A ray that escapes
// through an opening in a wall drawn in pieces (GHB-6) reads that side as open. A wall whose sample point lies beyond another
// wall's centreline (overlapping walls — a partition drawn inside a thick wall's body) is unknown, in words (review C23); walls that
// overlap only away from the located wall's middle are read as any other. A storey is its walls' base level, as Promote
// plans it. Pure 2D in millimetres, no Revit types: tools/promote-check drives it over the concept layout, an L, a U, an O and
// the drill drawing's own numbers; Promote (storey walls) and Ghost Builder (the walls of one build) feed it.
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Sentinel.GhostBuilder
{
    public static class WallLocation
    {
        /// <summary>One wall of the storey in plan (mm): its location line (a curved wall's chord, flagged) and its width.</summary>
        public sealed class Segment
        {
            public double X0, Y0, X1, Y1, WidthMm;
            public bool Curved;
        }

        public const string Exterior = "Exterior", Interior = "Interior";
        /// <summary>The sample points sit this far beyond each face (half the width plus this).</summary>
        public const double ClearMm = 100;
        /// <summary>A wall shorter than this is not read: its middle is too near its ends to look out from.</summary>
        public const double MinLengthMm = 500;
        /// <summary>Fewer other walls than this is no outline to be inside or outside of.</summary>
        public const int MinOthers = 3;
        /// <summary>A ray meets a wall within this (mm); a sample point this close to another wall's line is on it.</summary>
        public const double TolMm = 1;

        /// <summary>"Exterior", "Interior", or null with <paramref name="why"/> (plain words, no guess) for wall <paramref name="i"/>
        /// among the storey's <paramref name="walls"/> (a null entry is a wall with no line read: it is skipped as a barrier).</summary>
        public static string Locate(IReadOnlyList<Segment> walls, int i, out string why)
        {
            why = null;
            var w = walls[i];
            if (w == null) { why = "no location line was read"; return null; }
            if (w.Curved) { why = "a curved wall — its sides are not read (MA-2a reads straight walls)"; return null; }
            int others = 0;
            for (int j = 0; j < walls.Count; j++) if (j != i && walls[j] != null) others++;
            if (others < MinOthers) { why = $"only {others} other wall(s) on the storey — no outline to be inside or outside of"; return null; }
            double dx = w.X1 - w.X0, dy = w.Y1 - w.Y0, len = Math.Sqrt(dx * dx + dy * dy);
            if (len < MinLengthMm) { why = $"{Mm(len)} mm long — too short to look out from (under {Mm(MinLengthMm)} mm)"; return null; }
            double ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
            double mx = (w.X0 + w.X1) / 2, my = (w.Y0 + w.Y1) / 2, off = Math.Max(0, w.WidthMm) / 2 + ClearMm;
            // Overlapping walls (review C23): a sample point BEYOND another wall's centreline — the short segment from this wall's
            // middle to the point crosses it — starts its rays past that wall, which is then never met: a partition drawn inside a
            // thick shell wall's body read Exterior. Unknown, in words. A wall abutting another's face, or meeting it end-on at its
            // middle (the sample segment runs along it), crosses nothing and is read as before.
            for (int j = 0; j < walls.Count; j++)
            {
                var o = walls[j];
                if (j == i || o == null) continue;
                if (Crosses(mx, my, mx + nx * off, my + ny * off, o) || Crosses(mx, my, mx - nx * off, my - ny * off, o))
                { why = "its sample point lies beyond another wall's centreline (overlapping walls) — a person decides"; return null; }
            }
            bool plusOpen = Open(walls, i, mx + nx * off, my + ny * off, nx, ny, ux, uy);
            bool minusOpen = Open(walls, i, mx - nx * off, my - ny * off, -nx, -ny, ux, uy);
            if (plusOpen != minusOpen) return Exterior;
            if (!plusOpen) return Interior;
            why = "both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it";
            return null;
        }

        /// <summary>The storey's walls as one line of a summary: how many read Exterior, Interior and unknown.</summary>
        public static string Summary(int exterior, int interior, int unknown) =>
            $"outer boundary: {exterior} outside · {interior} inside · {unknown} unknown";

        // A side is open when a ray from its sample point — away from the wall, or along the wall either way — meets no other wall.
        private static bool Open(IReadOnlyList<Segment> walls, int i, double px, double py, double ax, double ay, double ux, double uy) =>
            !Hits(walls, i, px, py, ax, ay) || !Hits(walls, i, px, py, ux, uy) || !Hits(walls, i, px, py, -ux, -uy);

        private static bool Hits(IReadOnlyList<Segment> walls, int i, double px, double py, double dx, double dy)
        {
            for (int j = 0; j < walls.Count; j++)
                if (j != i && walls[j] != null && RayMeets(px, py, dx, dy, walls[j])) return true;
            return false;
        }

        /// <summary>Does the ray p + t·d (t &gt; TolMm) meet the segment s, within TolMm? A proper crossing; or, parallel to it, an
        /// end of the segment on the ray (a ray running along a wall's line is stopped by that wall).</summary>
        internal static bool RayMeets(double px, double py, double dx, double dy, Segment s)
        {
            double ex = s.X1 - s.X0, ey = s.Y1 - s.Y0, rx = s.X0 - px, ry = s.Y0 - py;
            double den = dx * ey - dy * ex;
            double elen = Math.Sqrt(ex * ex + ey * ey);
            if (elen < 1e-9) return OnRay(px, py, dx, dy, s.X0, s.Y0);
            if (Math.Abs(den) < 1e-9 * elen) return OnRay(px, py, dx, dy, s.X0, s.Y0) || OnRay(px, py, dx, dy, s.X1, s.Y1);
            double t = (rx * ey - ry * ex) / den; // along the ray (d is a unit vector: mm)
            double u = (rx * dy - ry * dx) / den; // along the segment, 0 at its start, 1 at its end
            double slack = TolMm / elen;
            return t > TolMm && u >= -slack && u <= 1 + slack;
        }

        private static bool OnRay(double px, double py, double dx, double dy, double qx, double qy)
        {
            double vx = qx - px, vy = qy - py, t = vx * dx + vy * dy;
            return t > TolMm && Math.Abs(vx * dy - vy * dx) <= TolMm;
        }

        /// <summary>Does the segment a→b cross segment s — not parallel, the crossing on a→b past a and within s?</summary>
        private static bool Crosses(double ax, double ay, double bx, double by, Segment s)
        {
            double dx = bx - ax, dy = by - ay, ex = s.X1 - s.X0, ey = s.Y1 - s.Y0, rx = s.X0 - ax, ry = s.Y0 - ay;
            double den = dx * ey - dy * ex;
            if (Math.Abs(den) < 1e-9 * Math.Sqrt((dx * dx + dy * dy) * (ex * ex + ey * ey))) return false;
            double t = (rx * ey - ry * ex) / den, u = (rx * dy - ry * dx) / den;
            return t > 0 && t <= 1 && u >= 0 && u <= 1;
        }

        private static string Mm(double v) => v.ToString("0", CultureInfo.InvariantCulture);
    }
}
