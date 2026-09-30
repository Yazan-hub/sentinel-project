#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 9. MA-1 placement slice: the one wall under a door's or window's point (pure), over the MA-0 seed's walls ────
    static void PlacementChecks()
    {
        Console.WriteLine("\nMA-1 host finder (PlacementGeometry.Host over the MA-0 seed's walls)");
        var walls = SeedWalls();
        string H(string level, double x, double y) { var i = PlacementGeometry.Host(walls, level, x, y, out var why); return i >= 0 ? walls[i].Label : why; }

        Ok(H("GR-FFL", 8000, 2250) == "MA0-L1-I02", "GR-FFL (8000, 2250) → MA0-L1-I02");
        Ok(H("GR-FFL", 8000.6, 2250) == "MA0-L1-I02", "0.6 mm off the line → still MA0-L1-I02 (within 1 mm)");
        Ok(H("GR-FFL", 8002, 2250) == "no straight wall on GR-FFL passes within 1 mm of (8002, 2250) — re-propose the point on one wall's location line",
           "2 mm off → no wall, in words");
        Ok(H("01-FFL", 8000, 2250) == "MA0-L2-I02", "the same plan point on 01-FFL → MA0-L2-I02, never GR-FFL's wall");
        Ok(H("gr-ffl", 8000, 2250) == "MA0-L1-I02", "level names compare case-insensitively");
        Ok(H("GR-FFL", 8000, 5000).StartsWith("no straight wall on GR-FFL"), "past I02's end (y 4500) → no wall (the segment is clamped)");
        Ok(H("GR-FFL", 8000, 0) == "2 walls on GR-FFL pass within 1 mm of (8000, 0): MA0-L1-E01, MA0-L1-I02 — a person decides the host",
           "a junction (E01 and I02) → two walls named, a person decides");
        Ok(H("GR-FFL", 12000, 0).StartsWith("3 walls"), "E01's end, E02's start and I03 → 3 walls");
        Ok(H("MA0 Roof", 8000, 2250).StartsWith("no straight wall on MA0 Roof"), "a level with no walls → no wall");
        var none = PlacementGeometry.Host(new List<(string, string, double, double, double, double)>(), "GR-FFL", 0, 0, out var whyNone);
        Ok(none == -1 && whyNone != null, "an empty wall list → -1 and a reason, no throw");
    }

    // The MA-0 seed's walls (demo/promote-sample/make-concept.py EXTERIOR, INTERIOR, GAP) on both storeys, as the executor passes them.
    static List<(string Label, string Level, double X0, double Y0, double X1, double Y1)> SeedWalls()
    {
        (int, int, int, int)[] ext = { (0, 0, 12000, 0), (12000, 0, 24000, 0), (24000, 0, 24000, 6000), (24000, 6000, 24000, 12000),
                                       (24000, 12000, 12000, 12000), (12000, 12000, 0, 12000), (0, 12000, 0, 6000), (0, 6000, 0, 0) };
        var xs = new[] { 4000, 8000, 12000, 16000, 20000 };
        var inner = xs.Select(x => (x, 0, x, 4500)).Concat(xs.Select(x => (x, 7500, x, 12000))).ToArray();
        (int, int, int, int)[] gap = { (2000, 6000, 6000, 6000), (18000, 6000, 22000, 6000) };
        var walls = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>();
        foreach (var (tag, level) in new[] { ("L1", "GR-FFL"), ("L2", "01-FFL") })
            foreach (var (p, segs) in new[] { ("E", ext), ("I", inner), ("G", gap) })
                for (var i = 0; i < segs.Length; i++)
                    walls.Add(($"MA0-{tag}-{p}{i + 1:00}", level, segs[i].Item1, segs[i].Item2, segs[i].Item3, segs[i].Item4));
        return walls;
    }
}
