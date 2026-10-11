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
// MA-5b-7 (DAT-1): never I or O (they read as 1 and 0) — 24 letters, then AA
Check("I and O skipped: H then J, N then P; the 25th is AA", lettered.Count == 28 && lettered[7] == "H" && lettered[8] == "J" && lettered[12] == "N" && lettered[13] == "P"
      && lettered[23] == "Z" && lettered[24] == "AA" && lettered[27] == "AD" && !lettered.Any(n => n.Contains('I') || n.Contains('O')));
Check("a datum section's own skip letters (none): the 27th is AA again",
      DatumFromDrawing.Grids(many, skipLetters: new HashSet<char>()).Where(g => !g.Vertical).Select(g => g.Name).ElementAt(26) == "AA");

// ---- MA-5b-7 (DAT-2): the review rows ----------------------------------------------------------------------
var read = new List<DetectedLevel> { new() { Name = "Level 1", ElevationMm = 3500 }, new() { Name = "Level 0", ElevationMm = 0 }, new() { Name = "Level 2", ElevationMm = 7000 } };
var gridLine = new DetectedGrid { Name = "A", X1 = 0, Y1 = 0, X2 = 10000, Y2 = 0 };
var rows = DatumRows.Of(read, new[] { gridLine });
Check("rows: levels lowest first, then grids, all ticked, Building Story on", rows.Count == 4 && rows[0].Name == "Level 0" && rows[1].Elevation == "3500" && rows[3].IsGrid
      && rows.All(r => r.Tick) && rows.Take(3).All(r => r.Story));
Check("±0.00 on the second level: a basement at −3500, the anchor at 0", DatumRows.Anchor(rows, 1) == null && rows[0].Elevation == "-3500" && rows[1].Elevation == "0" && rows[2].Elevation == "3500");
rows[2].Elevation = "3600";
Check("…the anchor moved again reads what was TYPED (3600), not what was read", DatumRows.Anchor(rows, 2) == null && rows[0].Elevation == "-7100" && rows[1].Elevation == "-3600" && rows[2].Elevation == "0");
rows[0].Elevation = "abc";
Check("…an elevation that is no number: nothing shifted, said", DatumRows.Anchor(rows, 1) == "Level 0: \"abc\" is not a number of mm — correct it first" && rows[1].Elevation == "-3600");
Check("a grid row is no anchor", DatumRows.Anchor(rows, 3) == "±0.00 is a level row");
Check("elevations as typed: −3500, +3500, ' 3 500 mm', 3500.5; not 'abc', not empty",
      DatumRows.Mm("\u22123500") == -3500 && DatumRows.Mm("+3500") == 3500 && DatumRows.Mm(" 3 500 mm") == 3500 && DatumRows.Mm("3500.5") == 3500.5 && DatumRows.Mm("abc") == null && DatumRows.Mm("") == null);
var ok = DatumRows.Of(read, new[] { gridLine });
Check("a clean set checks", DatumRows.Check(ok) == null);
ok[1].Name = " ";
Check("a ticked level with no name is refused", DatumRows.Check(ok) == "A ticked level (at 3500 mm) has no name — type one, or untick it.");
ok[1].Tick = false;
Check("…unticked, it is no row", DatumRows.Check(ok) == null && DatumRows.Picked(ok).Levels.Count == 2);
ok[1].Tick = true; ok[1].Name = "level 0 ";
Check("two ticked levels of one name (any case, trimmed) are refused", DatumRows.Check(ok) == "Two ticked levels are named \"Level 0\" — a name is one level's.");
ok[1].Name = "Ground"; ok[1].Elevation = "0";
Check("two ticked levels at one elevation are refused", DatumRows.Check(ok) == "Level 0 and Ground are both at 0 mm — one level stands there.");
ok[1].Elevation = "3500"; ok[2].Story = false; ok[3].Name = "B1";
var picked = DatumRows.Picked(ok);
Check("picked: names trimmed as typed, elevations as typed, Building Story as left, the grid renamed on its own line",
      picked.Levels.Select(l => l.Name).SequenceEqual(new[] { "Level 0", "Ground", "Level 2" }) && picked.Levels[2].Story == false && picked.Levels[1].ElevationMm == 3500
      && picked.Grids.Single().Name == "B1" && picked.Grids[0].X2 == 10000);

// ---- MA-5b-7: grids de-duplicated by position, not name ---------------------------------------------------
Check("a grid on the same line (5 mm off, 0.02° turned) is the one in the model", DatumFromDrawing.SameLine(gridLine, -2000, 5, 12000, 5 + 14000 * Math.Tan(0.02 * Math.PI / 180)));
Check("…one 20 mm off is another grid; one 1° turned too", !DatumFromDrawing.SameLine(gridLine, 0, 20, 10000, 20) && !DatumFromDrawing.SameLine(gridLine, 0, 0, 10000, 10000 * Math.Tan(Math.PI / 180)));

// ---- SPACING (MA-5b-2, DAT-4) -------------------------------------------------------------------------------
// A metres drawing read as millimetres: every storey 3 mm apart. An FFL/SSL pair 300 mm apart beside 3 m storeys: no warning.
List<DetectedLevel> Lv(params double[] mm) => mm.Select((e, i) => new DetectedLevel { Name = $"Level {i}", ElevationMm = e }).ToList();
var tiny = DatumFromDrawing.SpacingWarnings(Lv(0, 3.2, 6.4));
Check("every gap under 1.5 m: one warning, the units named", tiny.Count == 1 && tiny[0].StartsWith("The levels are at most 3 mm apart") && tiny[0].Contains("units"));
Check("an FFL/SSL pair beside 3 m storeys: no warning", DatumFromDrawing.SpacingWarnings(Lv(-300, 0, 3200, 6400)).Count == 0);
var tall = DatumFromDrawing.SpacingWarnings(Lv(0, 3200, 15200));
Check("a gap over 10 m names its two levels", tall.Count == 1 && tall[0].StartsWith("Level 1 and Level 2 are 12 m apart"));
Check("one level, or none: nothing to compare", DatumFromDrawing.SpacingWarnings(Lv(0)).Count == 0 && DatumFromDrawing.SpacingWarnings(Lv()).Count == 0);
// review: a 12-storey section drawn in metres, read as mm — the 50 mm merge leaves ONE level; the lines read again finer still name the units
var metres = Enumerable.Range(0, 13).Select(i => new Seg(0, i * 3.2, 12, i * 3.2)).ToList();
Check("metres read as mm: the merge leaves one level", DatumFromDrawing.Levels(metres).Count == 1);
var mw = DatumFromDrawing.SpacingWarnings(DatumFromDrawing.Levels(metres), metres);
Check("…and the spacing check still names the units", mw.Count == 1 && mw[0].StartsWith("The levels are at most 3 mm apart"));
Check("a real one-level drawing: no warning", DatumFromDrawing.SpacingWarnings(Lv(0), new[] { new Seg(0, 0, 12000, 0) }).Count == 0);

// ---- MA-5b-7: the drill's drawing, read by layer as DatumBuilder reads it (an office's own datum layers) -----------------
List<Seg> OnLayer(string file, string layer)
{
    var L = System.IO.File.ReadAllLines(file); var o = new List<Seg>();
    for (int i = 0; i + 1 < L.Length; i++)
    {
        if (L[i].Trim() != "0" || L[i + 1].Trim() != "LINE") continue;
        string lay = null; double x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        for (int j = i + 2; j + 1 < L.Length && L[j].Trim() != "0"; j += 2)
        {
            double.TryParse(L[j + 1].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d);
            switch (L[j].Trim()) { case "8": lay = L[j + 1].Trim(); break; case "10": x1 = d; break; case "20": y1 = d; break; case "11": x2 = d; break; case "21": y2 = d; break; }
        }
        if (lay == layer) o.Add(new Seg(x1, y1, x2, y2));
    }
    return o;
}
string sample = null;
for (var d = new System.IO.DirectoryInfo(Environment.CurrentDirectory); d != null && sample == null; d = d.Parent)
    if (System.IO.File.Exists(System.IO.Path.Combine(d.FullName, "demo", "ghost-sample", "ma5b7-datum.dxf"))) sample = System.IO.Path.Combine(d.FullName, "demo", "ghost-sample");
if (sample == null) Console.WriteLine("  skip  demo/ghost-sample/ma5b7-datum.dxf not found");
else
{
    var dl = DatumFromDrawing.Levels(OnLayer(System.IO.Path.Combine(sample, "ma5b7-datum.dxf"), "A-SECT-DATUM"));
    Check("ma5b7-datum.dxf: 5 levels on A-SECT-DATUM, the lowest read as 0 (the person anchors ±0.00 on the ground: the basement at -3500)",
          dl.Select(l => l.ElevationMm).SequenceEqual(new[] { 0.0, 3500, 7000, 10500, 11400 }));
    var dg = DatumFromDrawing.Grids(OnLayer(System.IO.Path.Combine(sample, "ma5b7-datum.dxf"), "S-GRID-IDEN"));
    Check("…12 grids on S-GRID-IDEN: 1-3, then A-H and J (no I)", string.Join(",", dg.Select(g => g.Name)) == "1,2,3,A,B,C,D,E,F,G,H,J");
    var sh = DatumFromDrawing.Grids(OnLayer(System.IO.Path.Combine(sample, "ma5b7-plan-shifted.dxf"), "S-GRID-IDEN"));
    Check("ma5b7-plan-shifted.dxf: its numbered grids stand elsewhere, its lettered ones on the same lines",
          sh.Where(g => g.Vertical).All(g => !dg.Any(o => DatumFromDrawing.SameLine(g, o.X1, o.Y1, o.X2, o.Y2))) && sh.Where(g => !g.Vertical).All(g => dg.Any(o => DatumFromDrawing.SameLine(g, o.X1, o.Y1, o.X2, o.Y2))));
}

// ---- KIT DXFs ----------------------------------------------------------------------------------------
// Revit imports a DXF with no $INSUNITS header as inches — every mm height x25.4 (simulation 3.9, F41).
// The kit's hand-written drawings must declare millimetres.
string kit = null;
for (var d = new System.IO.DirectoryInfo(Environment.CurrentDirectory); d != null && kit == null; d = d.Parent)
    if (System.IO.Directory.Exists(System.IO.Path.Combine(d.FullName, "demo", "aster", "dwg")))
        kit = System.IO.Path.Combine(d.FullName, "demo", "aster", "dwg");
if (kit == null) Console.WriteLine("  skip  demo/aster/dwg not found above " + Environment.CurrentDirectory);
else foreach (var f in System.IO.Directory.GetFiles(kit, "*.dxf"))
    Check(System.IO.Path.GetFileName(f) + " declares $INSUNITS 4 (mm)",
          System.Text.RegularExpressions.Regex.IsMatch(System.IO.File.ReadAllText(f), @"\$INSUNITS\s+70\s+4\s"));

Console.WriteLine(failed == 0 ? "\nDATUM OK" : $"\n{failed} FAILED");
return failed;
