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

    /// <summary>Distance (mm) from (x, y) to the segment — clamped to its ends, so a point past a wall's end is not on it.</summary>
    internal static double Distance(double x0, double y0, double x1, double y1, double x, double y)
    {
        double dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
        var t = len2 == 0 ? 0 : Math.Max(0, Math.Min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        double px = x0 + t * dx - x, py = y0 + t * dy - y;
        return Math.Sqrt(px * px + py * py);
    }

    private static string Mm(double mm) => mm.ToString("0.#", CultureInfo.InvariantCulture);
}
