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
ok[1].Elevation = "2.5";
Check("…and two within 3 mm (Build would keep one and drop the other)", DatumRows.Check(ok) == "Level 0 and Ground are both at 0 mm — one level stands there.");
ok[1].Elevation = "3.1";
Check("…3.1 mm apart are two levels", DatumRows.Check(ok) == null);
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

// ---- MA-5b-8 (DAT-5): angled and arc grids, named by GR-01 --------------------------------------------------------
var gr01 = new System.Text.RegularExpressions.Regex("^([A-Z]{1,2}|\\d{1,3})$");
Seg At(double cx, double cy, double deg, double r0, double r1) { double a = deg * Math.PI / 180; return new Seg(cx + r0 * Math.Cos(a), cy + r0 * Math.Sin(a), cx + r1 * Math.Cos(a), cy + r1 * Math.Sin(a)); }
var radial = new[] { 0, 22.5, 45, 67.5, 90 }.Select(d => At(0, 0, d, 15000, 32000))
    .Concat(new[] { 0, 22.5, 45, 67.5, 90 }.Select(d => At(0, 0, d, 33000, 33800)))                          // the bubbles' leaders
    .Concat(Enumerable.Range(0, 3).Select(k => new Seg(50000 - k * 3000, k * 5196.152, 50000 - k * 3000 + 17320.508, k * 5196.152 + 10000))) // a 30-degree wing
    .ToList();
var arcs = new[] { 20000.0, 25000, 30000 }.Select(r => new GridArc { Cx = 0, Cy = 0, R = r, StartDeg = 0, EndDeg = 90 })
    .Concat(new[] { 0, 22.5, 45, 67.5, 90 }.Select(d => new GridArc { Cx = 32500 * Math.Cos(d * Math.PI / 180), Cy = 32500 * Math.Sin(d * Math.PI / 180), R = 500, StartDeg = 0, EndDeg = 360 })) // bubbles
    .ToList();
var said = new List<string>();
var rg = DatumFromDrawing.Grids(radial, planArcs: arcs, warnings: said);
double FarAngle(DetectedGrid g) { var (x, y) = g.X1 * g.X1 + g.Y1 * g.Y1 > g.X2 * g.X2 + g.Y2 * g.Y2 ? (g.X1, g.Y1) : (g.X2, g.Y2); return Math.Round(Math.Atan2(y, x) * 180 / Math.PI, 1); }
Check("radial: 5 spokes numbered 1-5 by angle, the 30-degree wing A-C, the arcs D-F inner first; no bubble, no leader",
      string.Join(",", rg.Select(g => g.Name)) == "1,2,3,4,5,A,B,C,D,E,F" && rg.Where(g => g.IsArc).Select(g => g.R).SequenceEqual(new[] { 20000.0, 25000, 30000 })
      && rg.Take(5).Select(FarAngle).SequenceEqual(new[] { 0, 22.5, 45, 67.5, 90 }) && said.Count == 0);
Check("the wing is kept at 30 degrees, lettered bottom to top", rg.Where(g => !g.IsArc && !g.Vertical).All(g => Math.Abs(g.AngleDeg - 30) < 0.01)
      && rg.Where(g => !g.IsArc && !g.Vertical).Select(g => g.Name).SequenceEqual(new[] { "A", "B", "C" }) && rg.First(g => g.Name == "A").Y1 < rg.First(g => g.Name == "C").Y1);
Check("the arc grids keep their centre, radius and sweep exactly (within 5 mm)", rg.Where(g => g.IsArc).All(g => Math.Abs(g.Cx) < 5 && Math.Abs(g.Cy) < 5 && g.StartDeg == 0 && g.EndDeg == 90
      && Math.Abs(g.X1 - g.R) < 5 && Math.Abs(g.Y2 - g.R) < 5));
Check("every name passes GR-01 (letters or numbers)", rg.All(g => gr01.IsMatch(g.Name)) && DatumFromDrawing.Grids(many).All(g => gr01.IsMatch(g.Name)));
var whole = new List<string>();
DatumFromDrawing.Grids(radial, planArcs: new[] { new GridArc { Cx = 0, Cy = 0, R = 12000, StartDeg = 0, EndDeg = 360 } }, warnings: whole);
Check("a whole circle as big as a grid is said, never created", whole.Count == 1 && whole[0].StartsWith("A whole circle of radius 12000 mm on a grid layer"));
var twice = DatumFromDrawing.Grids(radial, planArcs: arcs.Concat(new[] { new GridArc { Cx = 3, Cy = -2, R = 20050, StartDeg = 10, EndDeg = 60 } }));
Check("an arc of one centre (5 mm) and radius (the merge) is one grid, the widest kept", twice.Count(g => g.IsArc) == 3 && twice.First(g => g.IsArc).EndDeg == 90);
var sq = new List<Seg> { new Seg(0, -500, 0, 7500), new Seg(5000, -500, 5000, 7500), new Seg(-500, 0, 10500, 0), new Seg(-500, 7000, 10500, 7000), new Seg(10000, -500, 10000.5, 7500) };
Check("plain orthogonal grids are named as before (a line 0.004 degrees off stays with its direction)", string.Join(",", DatumFromDrawing.Grids(sq).Select(g => g.Name)) == "1,2,3,A,B");
var mixed = DatumFromDrawing.Grids(sq.Concat(new[] { new Seg(20000, 0, 20000 + 8000 * Math.Cos(80 * Math.PI / 180), 8000 * Math.Sin(80 * Math.PI / 180)) }).ToList());
Check("a direction 10 degrees off vertical is numbered after the verticals", string.Join(",", mixed.Select(g => g.Name)) == "1,2,3,4,A,B" && Math.Abs(mixed[3].AngleDeg - 80) < 0.01);

// The drill's radial drawing (make-datum-sample.py --ma5b8), lines, arcs and circles on S-GRID-IDEN, read as DatumBuilder reads them.
(List<Seg> L, List<GridArc> A) Read(string file, string layer)
{
    var T = System.IO.File.ReadAllLines(file); var ls = new List<Seg>(); var arcList = new List<GridArc>();
    for (int i = 0; i + 1 < T.Length; i++)
    {
        string kind = T[i + 1].Trim();
        if (T[i].Trim() != "0" || (kind != "LINE" && kind != "ARC" && kind != "CIRCLE")) continue;
        string lay = null; double x1 = 0, y1 = 0, x2 = 0, y2 = 0, r = 0, a0 = 0, a1 = 360;
        for (int j = i + 2; j + 1 < T.Length && T[j].Trim() != "0"; j += 2)
        {
            double.TryParse(T[j + 1].Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d);
            switch (T[j].Trim()) { case "8": lay = T[j + 1].Trim(); break; case "10": x1 = d; break; case "20": y1 = d; break; case "11": x2 = d; break; case "21": y2 = d; break;
                                   case "40": r = d; break; case "50": a0 = d; break; case "51": a1 = d; break; }
        }
        if (lay != layer) continue;
        if (kind == "LINE") ls.Add(new Seg(x1, y1, x2, y2));
        else arcList.Add(new GridArc { Cx = x1, Cy = y1, R = r, StartDeg = kind == "CIRCLE" ? 0 : a0, EndDeg = kind == "CIRCLE" ? 360 : (a1 > a0 ? a1 : a1 + 360) });
    }
    return (ls, arcList);
}
if (sample == null) Console.WriteLine("  skip  demo/ghost-sample not found");
else if (!System.IO.File.Exists(System.IO.Path.Combine(sample, "ma5b8-radial.dxf"))) Console.WriteLine("  skip  ma5b8-radial.dxf not found");
else
{
    var (fl, fa) = Read(System.IO.Path.Combine(sample, "ma5b8-radial.dxf"), "S-GRID-IDEN");
    var fg = DatumFromDrawing.Grids(fl, planArcs: fa);
    Check($"ma5b8-radial.dxf: spokes 1-5, the wing A-C at 30 degrees, the arcs D-F of 20, 25 and 30 m about (200000, 0) — {string.Join(",", fg.Select(g => g.Name))}",
          string.Join(",", fg.Select(g => g.Name)) == "1,2,3,4,5,A,B,C,D,E,F" && fg.Where(g => g.IsArc).All(g => Math.Abs(g.Cx - 200000) < 5 && Math.Abs(g.Cy) < 5)
          && fg.Where(g => g.IsArc).Select(g => Math.Round(g.R)).SequenceEqual(new[] { 20000.0, 25000, 30000 }) && fg.Where(g => !g.IsArc && !g.Vertical).All(g => Math.Abs(g.AngleDeg - 30) < 0.01));
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
