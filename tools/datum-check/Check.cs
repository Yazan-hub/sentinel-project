// Offline conformance for DatumFromDrawing — the datum reader that turns a section's level lines into
// Levels and a plan's grid lines into Grids. Pure geometry, so we assert the real cases here rather than
// only finding out inside Revit: heights measured ground-up, near-coincident datums merged, horizontal vs
// diagonal linework separated, grids split into numbered verticals / lettered horizontals, longest line
// kept per axis-position. Run: dotnet run --project tools/datum-check
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder;

int failed = 0;
void Check(string name, bool ok) { Console.WriteLine((ok ? "  ok   " : "  FAIL ") + name); if (!ok) failed++; }

// ---- LEVELS ------------------------------------------------------------------------------------------
// A section drawn to mm scale: three level lines at Y = 10000, 13200, 16400 (an arbitrary DWG datum),
// plus vertical/diagonal building linework that must be ignored, plus a double-drawn datum 20mm off.
var section = new List<Seg>
{
    new Seg(0, 10000, 12000, 10000),      // ground
    new Seg(0, 10020, 12000, 10020),      // double-drawn ground (merges)
    new Seg(0, 13200, 12000, 13200),      // L1  (+3200 from ground)
    new Seg(0, 16400, 12000, 16400),      // L2  (+6400)
    new Seg(500, 10000, 500, 16400),      // a column — vertical, ignored
    new Seg(0, 10000, 3000, 13200),       // a stair — diagonal, ignored
};
var levels = DatumFromDrawing.Levels(section);
Check("3 levels found (double-datum merged)", levels.Count == 3);
Check("ground is 0", levels.Count > 0 && Math.Abs(levels[0].ElevationMm) < 0.01);
Check("L1 at +3200 ground-relative", levels.Count > 1 && Math.Abs(levels[1].ElevationMm - 3200) < 0.01);
Check("L2 at +6400", levels.Count > 2 && Math.Abs(levels[2].ElevationMm - 6400) < 0.01);
Check("auto-named Level 0/1/2", levels.Select(l => l.Name).SequenceEqual(new[] { "Level 0", "Level 1", "Level 2" }));
Check("no levels from empty input", DatumFromDrawing.Levels(new List<Seg>()).Count == 0);
Check("no levels from only vertical lines",
      DatumFromDrawing.Levels(new[] { new Seg(0, 0, 0, 5000), new Seg(100, 0, 100, 5000) }).Count == 0);

// ---- GRIDS -------------------------------------------------------------------------------------------
// A plan grid: 3 verticals (X = 0, 6000, 12000) and 2 horizontals (Y = 0, 8000), with a short tick at
// the same X as grid 2 that must not become its own grid, and a stray short segment that's neither.
var plan = new List<Seg>
{
    new Seg(0,    -500, 0,     8500),     // vertical @ X0  -> "1"
    new Seg(6000, -500, 6000,  8500),     // vertical @ X6000 -> "2"
    new Seg(6010, -100, 6010,  100),      // short tick near grid 2 -> merged away
    new Seg(12000,-500, 12000, 8500),     // vertical @ X12000 -> "3"
    new Seg(-500,  0,   12500, 0),        // horizontal @ Y0 -> "A"
    new Seg(-500,  8000,12500, 8000),     // horizontal @ Y8000 -> "B"
};
var grids = DatumFromDrawing.Grids(plan);
var verts = grids.Where(g => g.Vertical).ToList();
var horz  = grids.Where(g => !g.Vertical).ToList();
Check("3 vertical grids (tick merged)", verts.Count == 3);
Check("verticals numbered 1,2,3 L->R", verts.Select(g => g.Name).SequenceEqual(new[] { "1", "2", "3" }));
Check("2 horizontal grids", horz.Count == 2);
Check("horizontals lettered A,B bottom->top", horz.Select(g => g.Name).SequenceEqual(new[] { "A", "B" }));
Check("grid 2 kept the long line, not the tick",
      Math.Abs(verts.First(g => g.Name == "2").Y2 - verts.First(g => g.Name == "2").Y1) > 8000);
Check("no grids from empty input", DatumFromDrawing.Grids(new List<Seg>()).Count == 0);

// letter rollover past Z
var many = Enumerable.Range(0, 28).Select(i => new Seg(-1, i * 1000, 1, i * 1000)).ToList(); // 28 horizontals
var lettered = DatumFromDrawing.Grids(many).Where(g => !g.Vertical).Select(g => g.Name).ToList();
Check("27th letter is AA", lettered.Count == 28 && lettered[26] == "AA" && lettered[27] == "AB");

Console.WriteLine(failed == 0 ? "\nDATUM OK" : $"\n{failed} FAILED");
return failed;
