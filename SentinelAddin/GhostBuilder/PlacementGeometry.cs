#nullable disable
// MA-1: pure placement geometry for changeset creates — no Revit, so promote-check tests it offline. Millimetres, plan (x, y).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Sentinel.GhostBuilder;

public static class PlacementGeometry
{
    /// <summary>How far a door's or window's point may lie from its host wall's location line (mm): the proposal puts it ON
    /// the line, this absorbs rounding only.</summary>
    public const double HostTolMm = 1.0;

    /// <summary>The one wall on <paramref name="level"/> whose location line passes within HostTolMm of (x, y): its index in
    /// <paramref name="walls"/>, or -1 with <paramref name="why"/> in words. None, or more than one (a junction, a duplicate
    /// wall), is a refusal — Sentinel never guesses a host. Level names compare as Revit's do (case-insensitive).</summary>
    public static int Host(IReadOnlyList<(string Label, string Level, double X0, double Y0, double X1, double Y1)> walls,
                           string level, double x, double y, out string why)
    {
        var hits = Enumerable.Range(0, walls.Count)
            .Where(i => string.Equals(walls[i].Level, level, StringComparison.OrdinalIgnoreCase)
                        && Distance(walls[i].X0, walls[i].Y0, walls[i].X1, walls[i].Y1, x, y) <= HostTolMm)
            .ToList();
        var at = $"within {Mm(HostTolMm)} mm of ({Mm(x)}, {Mm(y)})";
        why = hits.Count == 1 ? null
            : hits.Count == 0 ? $"no straight wall on {level} passes {at} — re-propose the point on one wall's location line"
            : $"{hits.Count} walls on {level} pass {at}: {string.Join(", ", hits.Select(i => walls[i].Label))} — a person decides the host";
        return hits.Count == 1 ? hits[0] : -1;
    }

    /// <summary>F-S2-2: slack (mm) on the touch test of <see cref="EndsTouching"/>.</summary>
    public const double JoinTolMm = 1.0;

    /// <summary>F-S2-2: the ends (0 = start, 1 = end) of a NEW wall that touch a wall already in the model — the new wall's end
    /// lies within that wall's body (its plan polyline ± half its width) grown by half the new wall's width and JoinTolMm, and
    /// the two overlap in height. Revit would auto-join them there, and a join it cannot keep declines the whole changeset, so
    /// the executor disallows the join at those ends of the new wall only (the existing wall is never touched). The body, not
    /// the location line alone: a wall drawn up to an existing wall's FACE ends half that wall's width from its line, and Revit
    /// joins it all the same. The height overlap keeps the walls of the storeys above and below (same plan, other levels) from
    /// counting. Walls of the same changeset or build are not in <paramref name="before"/>, so their corners still join.
    /// Millimetres; bottom/top in one frame (Level.Elevation's).</summary>
    public static List<int> EndsTouching(double x0, double y0, double x1, double y1, double halfWidth, double bottom, double top,
                                         IEnumerable<(IReadOnlyList<double[]> Line, double HalfWidth, double Bottom, double Top)> before)
    {
        var near = (before ?? Enumerable.Empty<(IReadOnlyList<double[]> Line, double HalfWidth, double Bottom, double Top)>())
            .Where(w => w.Line != null && w.Line.Count >= 2 && w.Bottom < top - JoinTolMm && w.Top > bottom + JoinTolMm).ToList();
        bool Touches(double x, double y) => near.Any(w =>
            Enumerable.Range(1, w.Line.Count - 1).Min(i => Distance(w.Line[i - 1][0], w.Line[i - 1][1], w.Line[i][0], w.Line[i][1], x, y))
            <= w.HalfWidth + halfWidth + JoinTolMm);
        var ends = new List<int>();
        if (Touches(x0, y0)) ends.Add(0);
        if (Touches(x1, y1)) ends.Add(1);
        return ends;
    }

    /// <summary>F-S2-2: how far an existing wall's body reaches from its location curve (mm), the HalfWidth EndsTouching reads.
    /// Only a Wall Centerline location line (WALL_KEY_REF_PARAM 0) sits mid-body (width / 2); a face or core line can put the
    /// whole width on one side, so any other line, or one Sentinel cannot read (null), reaches the full width either side. The
    /// extra reach only disallows a few more new-wall ends, never a join that should have been stopped.</summary>
    public static double BodyReach(double width, int? locationLine) => locationLine == 0 ? width / 2 : width;

    /// <summary>MA-4f: the most triangles a wall's re-read holds (the bridge's MAX_MESH_TRIANGLES) — a straight wall after its joins is about 12;
    /// past about 50 it is curved or swept and the bridge would not reduce it (MA-5).</summary>
    public const int MaxMeshTriangles = 64;

    /// <summary>MA-4f: a wall's triangles (9 numbers each, mm) as Revit's result sends them: each rounded to 0.1 mm, never -0; null for none, a
    /// part triangle, a number not finite, or more than MaxMeshTriangles — the bridge then measures the wall as filed.</summary>
    public static double[] PackMesh(IReadOnlyList<double> mm)
    {
        if (mm == null || mm.Count == 0 || mm.Count % 9 != 0 || mm.Count / 9 > MaxMeshTriangles) return null;
        var o = new double[mm.Count];
        for (var i = 0; i < o.Length; i++)
        {
            if (double.IsNaN(mm[i]) || double.IsInfinity(mm[i])) return null;
            o[i] = Math.Round(mm[i] * 10) / 10 + 0.0; // + 0.0: a -0 becomes 0 (System.Text.Json writes "-0")
        }
        return o;
    }

    // ── MA-1b (GHB-1): a DWG door or window block — its frame, the wall it belongs to, the way it turns ───────────────

    /// <summary>GHB-1: how far a block's X axis may turn from a wall's line and still be that wall's opening (degrees).</summary>
    public const double ParallelTolDeg = 5.0;

    /// <summary>Review (2026-10-03): the executor's bound is ParallelTolDeg plus this slack. Ghost's planner (Snap) measures the
    /// angle on the import's curves in mm, the executor (AcrossWall) on the Revit wall's line after the mm->ft->mm round trip;
    /// at exactly ParallelTolDeg the two can land an ulp apart, and a block the planner filed must never be a whole-build
    /// decline in the executor. A rounding, not a degree: nothing a person could draw lands inside it.</summary>
    public const double ParallelSlackDeg = 1e-6;

    /// <summary>GHB-1 calibration, one knob each. +1 = Revit's HandOrientation runs the way the block's X axis does (hinge to
    /// strike), and its FacingOrientation points to the side the block's Y axis does (the side the leaf swings to). Drill MA1b
    /// (row B1-3) compares each placed door with the block drawn under it: a door family that reads the other way round is one
    /// sign here, not a redesign. The signs are one pair for every family (review amendment C3): after the drill they are right
    /// for the drill's door family; a family modelled the other way round is placed the other way round, and only the eye
    /// sees it — the summary says what was measured against these signs, and tells the reader to compare one door.</summary>
    public const int HandSign = 1, FacingSign = 1;

    /// <summary>GHB-1 (review amendment C4): how far short of an opening a wall's line may stop and still be named as a wall
    /// broken at that opening (mm). ponytail: one fixed reach, wider than a double door's half; the opening's own drawn
    /// width when sizing lands (MA-2).</summary>
    public const double BrokenReachMm = 2000;

    /// <summary>How a gap's sentence ends when a wall's line stops short of the opening (Snap). Joining the pieces is GHB-6.</summary>
    public const string BrokenWallNote = "wall pieces broken at an opening are not joined yet (GHB-6)";

    /// <summary>Whether a Snap reason names a wall broken at the opening — Ghost's planner counts these on their own line.</summary>
    public static bool IsBrokenWall(string why) => why != null && why.EndsWith(BrokenWallNote, StringComparison.Ordinal);

    /// <summary>A block insert's direction from its two axes in plan, as its transform gives them (any length): the plan
    /// angle of its X axis in degrees, 0 up to (not including) 360, to four decimals — what place.Rotation carries — and
    /// whether the block is mirrored (its axes are left-handed: a negative X or Y scale, not both).</summary>
    public static (double RotationDeg, bool Mirrored) Frame(double bxX, double bxY, double byX, double byY)
    {
        double deg = Math.Round(Math.Atan2(bxY, bxX) * 180 / Math.PI, 4);
        if (deg < 0) deg += 360;
        if (deg >= 360 || deg == 0) deg = 0; // 359.99999… rounds up to 360; and never a negative zero
        return (deg, bxX * byY - bxY * byX < 0);
    }

    /// <summary>The middle of what a block draws, measured along its X axis from its insertion point (ox, oy): a door block
    /// inserted by its hinge draws from the hinge to the strike, so this is the middle of the opening — where Revit's door
    /// family has its origin. A block that draws nothing stands at its insertion point.</summary>
    public static (double X, double Y) BlockCentre(double ox, double oy, double rotationDeg, IEnumerable<(double X, double Y)> drawn)
    {
        double a = rotationDeg * Math.PI / 180, ux = Math.Cos(a), uy = Math.Sin(a), min = double.MaxValue, max = double.MinValue;
        foreach (var p in drawn ?? Enumerable.Empty<(double X, double Y)>())
        {
            double t = (p.X - ox) * ux + (p.Y - oy) * uy;
            min = Math.Min(min, t);
            max = Math.Max(max, t);
        }
        if (min > max) return (ox, oy);
        double mid = (min + max) / 2;
        return (ox + mid * ux, oy + mid * uy);
    }

    /// <summary>The angle between two lines in plan (degrees, 0 to 90), whatever way each points.</summary>
    public static double AxisOff(double aDeg, double bDeg)
    {
        double d = Math.Abs(aDeg - bDeg) % 180;
        return d > 90 ? 180 - d : d;
    }

    /// <summary>GHB-1: the wall a door or window at (x, y) belongs to — the one wall on <paramref name="level"/> whose line
    /// passes within half its thickness (<paramref name="halfMm"/>, one per wall, plus HostTolMm) of the point, with the
    /// point beside the wall and not past its end, and, when the opening is a block (<paramref name="axisDeg"/>, its X axis),
    /// running along that axis within ParallelTolDeg. Returns the wall's index and the point moved onto its line. No such
    /// wall, a block across its wall, or two walls equally near: null and <paramref name="why"/> in words — never a guess.
    /// A nearer wall wins over a farther one (a corner). When no wall qualifies but a wall's line, carried on past its end,
    /// passes the point within the same reach (and along the block's axis) and stops no more than BrokenReachMm short of it,
    /// the reason names that wall and the distance, and ends with BrokenWallNote (review amendment C4).</summary>
    public static (int Wall, double X, double Y)? Snap(IReadOnlyList<(string Label, string Level, double X0, double Y0, double X1, double Y1)> walls,
                                                       IReadOnlyList<double> halfMm, string level, double x, double y, double? axisDeg, out string why)
    {
        string at = $"({Mm(x)}, {Mm(y)})";
        var near = new List<(int I, double D, double Px, double Py)>();
        int stops = -1;                    // the wall whose line stops nearest short of the point (a wall broken at the opening)
        double shortBy = double.MaxValue;  // … and by how many mm
        for (int i = 0; i < walls.Count; i++)
        {
            var w = walls[i];
            if (!string.Equals(w.Level, level, StringComparison.OrdinalIgnoreCase)) continue;
            double dx = w.X1 - w.X0, dy = w.Y1 - w.Y0, len2 = dx * dx + dy * dy;
            if (len2 == 0) continue;
            double t = ((x - w.X0) * dx + (y - w.Y0) * dy) / len2;
            if (t < 0 || t > 1) // past the wall's end: not this wall's opening
            {
                double end = (t < 0 ? -t : t - 1) * Math.Sqrt(len2), ex = w.X0 + t * dx - x, ey = w.Y0 + t * dy - y;
                if (end <= BrokenReachMm && end < shortBy && Math.Sqrt(ex * ex + ey * ey) <= halfMm[i] + HostTolMm
                    && (axisDeg == null || AxisOff(Math.Atan2(dy, dx) * 180 / Math.PI, axisDeg.Value) <= ParallelTolDeg))
                    (stops, shortBy) = (i, end);
                continue;
            }
            double px = w.X0 + t * dx, py = w.Y0 + t * dy, d = Math.Sqrt((px - x) * (px - x) + (py - y) * (py - y));
            if (d <= halfMm[i] + HostTolMm) near.Add((i, d, px, py));
        }
        // Review amendment C4: the wall whose line stops short of the opening — said when no wall is near, and (review 2026-10-03)
        // when the only walls near are the ones the block lies across: at a corner, "W1 stops 0.4 mm short" is the fact, not
        // "turned 90° from W2".
        string broken = stops >= 0 ? $"the wall line of {walls[stops].Label} stops {Mm(shortBy)} mm short of {at} — {BrokenWallNote}" : null;
        if (near.Count == 0)
        {
            why = broken ?? $"no straight wall of this build on {level} passes within half its thickness of {at}";
            return null;
        }
        var along = near.OrderBy(c => c.D).ToList();
        if (axisDeg is double axis)
        {
            double Off(int i) => AxisOff(Math.Atan2(walls[i].Y1 - walls[i].Y0, walls[i].X1 - walls[i].X0) * 180 / Math.PI, axis);
            int nearest = along[0].I;
            along = along.Where(c => Off(c.I) <= ParallelTolDeg).ToList();
            if (along.Count == 0)
            {
                why = broken ?? $"the block at {at} is turned {Ang(Off(nearest))}° from {walls[nearest].Label} — a door or window lies along its wall (within {Mm(ParallelTolDeg)}°)";
                return null;
            }
        }
        var ties = along.Where(c => c.D - along[0].D <= HostTolMm).ToList();
        if (ties.Count > 1)
        {
            why = $"{ties.Count} walls of this build on {level} are equally near {at}: {string.Join(", ", ties.Select(c => walls[c.I].Label))} — a person decides the host";
            return null;
        }
        why = null;
        return (along[0].I, along[0].Px, along[0].Py);
    }

    /// <summary>GHB-1: the directions a door or window placed from a block must have — its hand (Hx, Hy): the block's X axis,
    /// hinge to strike; its facing (Fx, Fy): the block's Y axis, the side the leaf swings to (to the left of X, or to the right
    /// when mirrored). Each is multiplied by its calibration sign.</summary>
    public static (double Hx, double Hy, double Fx, double Fy) Axes(double rotationDeg, bool mirrored)
    {
        double a = rotationDeg * Math.PI / 180, hx = Math.Cos(a), hy = Math.Sin(a), side = mirrored ? -1 : 1;
        return (HandSign * hx, HandSign * hy, FacingSign * side * -hy, FacingSign * side * hx);
    }

    /// <summary>Whether a direction (ox, oy) points against the target (tx, ty) — the flip test. Square to it is not against it.</summary>
    public static bool Opposes(double ox, double oy, double tx, double ty) => ox * tx + oy * ty < 0;

    /// <summary>Review amendment C1: a door or window's Rotation must run along its host wall — null when it does (within
    /// ParallelTolDeg, either way round), else the refusal's words. The flip test (Opposes) cannot see a Rotation across the
    /// wall (a dot product of 0 flips nothing), so the executor asks this before it creates the instance. The bound carries
    /// ParallelSlackDeg: what Snap filed at exactly the tolerance is accepted here.</summary>
    public static string AcrossWall(string wallLabel, double x0, double y0, double x1, double y1, double rotationDeg)
    {
        double off = AxisOff(Math.Atan2(y1 - y0, x1 - x0) * 180 / Math.PI, rotationDeg);
        return off <= ParallelTolDeg + ParallelSlackDeg ? null
            : $"place.Rotation {Ang(rotationDeg)}° is {Ang(off)}° off the line of its wall ({wallLabel}) — a door or window lies along its wall (within {Mm(ParallelTolDeg)}°)";
    }

    /// <summary>One placed door or window against the block it came from: the angle between its hand line and the block's X
    /// axis (0 to 90 degrees); whether its hand runs with the block's X axis and its facing with the block's Y axis (each
    /// times its calibration sign) — false for both when it does not lie along its block (OffDeg over ParallelTolDeg); and
    /// whether its family lacks the hand flip or the facing flip (read from the instance: FamilyInstance.CanFlipHand,
    /// CanFlipFacing).</summary>
    public static (string Label, double OffDeg, bool Hand, bool Facing, bool NoHandFlip, bool NoFacingFlip) Turn(string label, double rotationDeg, bool mirrored,
        double handX, double handY, double facingX, double facingY, bool canFlipHand = true, bool canFlipFacing = true)
    {
        var (hx, hy, fx, fy) = Axes(rotationDeg, mirrored);
        double off = AxisOff(Math.Atan2(handY, handX) * 180 / Math.PI, rotationDeg);
        bool along = off <= ParallelTolDeg;
        return (label, off, along && !Opposes(handX, handY, hx, hy), along && !Opposes(facingX, facingY, fx, fy), !canFlipHand, !canFlipFacing);
    }

    /// <summary>The summary's lines for the doors and windows a build placed with a block's direction: one for the build —
    /// how many, the largest angle between one and its block's X axis, on how many the hand runs with the block's X axis and
    /// the facing with its Y axis — then one for each that is not turned to its block (saying "its family has no … flip"
    /// only when the instance said so), or could not be read back (OffDeg NaN). It says what was measured, not "as drawn":
    /// that X is hinge to strike and Y the swing side is Sentinel's reading of the block (F9), and the line says so
    /// (review amendment C3). Empty with no block.</summary>
    public static List<string> TurnLines(IReadOnlyList<(string Label, double OffDeg, bool Hand, bool Facing, bool NoHandFlip, bool NoFacingFlip)> turned)
    {
        var lines = new List<string>();
        if (turned == null || turned.Count == 0) return lines;
        string Deg(double d) => d.ToString("0.0", CultureInfo.InvariantCulture);
        var read = turned.Where(t => !double.IsNaN(t.OffDeg)).ToList();
        double worst = read.Count == 0 ? 0 : read.Max(t => t.OffDeg);
        lines.Add($"Blocks: {turned.Count} door(s) and window(s) placed with a block's direction (place.Rotation) — largest angle between one and its block's X axis " +
                  $"{Deg(worst)}°; hand along the block's X axis and facing along its Y axis on {read.Count(t => t.Hand && t.Facing)} of {turned.Count} " +
                  "(Sentinel reads X as hinge to strike and Y as the swing side: compare one door with the drawing).");
        foreach (var t in turned)
        {
            if (double.IsNaN(t.OffDeg)) lines.Add($"  {t.Label}: its direction could not be read back from Revit — compare it with the drawing.");
            else if (t.OffDeg > ParallelTolDeg) lines.Add($"  {t.Label}: it lies {Deg(t.OffDeg)}° off its block's X axis — it is not turned to its block.");
            else if (!(t.Hand && t.Facing))
            {
                var parts = new List<string>();
                if (!t.Hand) parts.Add(t.NoHandFlip ? "its family has no hand flip — its hand runs against the block's X axis" : "its hand is not turned to the block's X axis");
                if (!t.Facing) parts.Add(t.NoFacingFlip ? "its family has no facing flip — its facing is against the block's Y axis" : "its facing is not turned to the block's Y axis");
                lines.Add($"  {t.Label}: {string.Join("; ", parts)}.");
            }
        }
        return lines;
    }

    /// <summary>Distance (mm) from (x, y) to the segment — clamped to its ends, so a point past a wall's end is not on it.</summary>
    internal static double Distance(double x0, double y0, double x1, double y1, double x, double y)
    {
        double dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
        var t = len2 == 0 ? 0 : Math.Max(0, Math.Min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        double px = x0 + t * dx - x, py = y0 + t * dy - y;
        return Math.Sqrt(px * px + py * py);
    }

    private static string Mm(double mm) => mm.ToString("0.#", CultureInfo.InvariantCulture);
    /// <summary>A measured angle, to a hundredth: "turned 5.04°" is never printed as "turned 5°" beside "(within 5°)".</summary>
    private static string Ang(double deg) => deg.ToString("0.##", CultureInfo.InvariantCulture);
}
