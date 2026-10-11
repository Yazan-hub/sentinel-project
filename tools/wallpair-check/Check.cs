#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string name)
    {
        if (c) { _pass++; Console.WriteLine("  PASS  " + name); }
        else { _fail++; Console.WriteLine("  FAIL  " + name); }
    }

    static int Main(string[] args)
    {
        if (args.Contains("sample")) return SampleRun.Run();
        Console.WriteLine("WallPairing — read wall thickness from two drawn faces\n");

        // A single 200mm-thick, 5000mm-long wall drawn as two parallel faces.
        var oneWall = new List<Seg> {
            new Seg(0, 0, 5000, 0),      // bottom face
            new Seg(0, 200, 5000, 200),  // top face
        };
        var w = WallPairing.Pair(oneWall);
        Ok(w.Count == 1, "two faces collapse to ONE wall");
        Ok(Math.Abs(w[0].ThicknessMm - 200) < 0.01, "thickness read as 200 from the 200 gap");
        Ok(Math.Abs(w[0].Cy1 - 100) < 0.01 && Math.Abs(w[0].Cy2 - 100) < 0.01, "centreline runs down the middle (y=100)");

        // The far faces of a room (opposite walls) are parallel + overlapping but 4m apart — NOT one wall.
        var room = new List<Seg> {
            new Seg(0, 0, 5000, 0),
            new Seg(0, 4000, 5000, 4000),
        };
        var r = WallPairing.Pair(room, maxThicknessMm: 1000);
        Ok(r.Count == 2 && r.All(x => x.ThicknessMm == 0), "room's opposite walls stay TWO unpaired lines, not one 4m-thick wall");

        // A reversed second face (drawn right-to-left) must still pair and give the right centreline.
        var reversed = new List<Seg> {
            new Seg(0, 0, 3000, 0),
            new Seg(3000, 300, 0, 300),
        };
        var rev = WallPairing.Pair(reversed);
        Ok(rev.Count == 1 && Math.Abs(rev[0].ThicknessMm - 300) < 0.01, "a reversed face still pairs, thickness 300");

        // Two collinear segments end-to-end (0 overlap) must NOT pair — they're one long face in two pieces.
        var collinear = new List<Seg> {
            new Seg(0, 0, 2000, 0),
            new Seg(2000, 0, 4000, 0),
        };
        Ok(WallPairing.Pair(collinear).All(x => x.ThicknessMm == 0), "collinear end-to-end segments do not pair (no overlap)");

        // Closest-partner: a thin (100) wall beside a thick (300) wall must each grab their OWN far face.
        var twoWalls = new List<Seg> {
            new Seg(0, 0,   6000, 0),      // face 1
            new Seg(0, 100, 6000, 100),    // face 2  -> pairs with 1 as a 100 wall
            new Seg(0, 500, 6000, 500),    // face 3
            new Seg(0, 800, 6000, 800),    // face 4  -> pairs with 3 as a 300 wall
        };
        var tw = WallPairing.Pair(twoWalls);
        var thk = tw.Select(x => Math.Round(x.ThicknessMm)).OrderBy(x => x).ToList();
        Ok(tw.Count == 2 && thk.SequenceEqual(new double[] { 100, 300 }),
           "adjacent thin + thick walls each pair with their own face (100 and 300, not 400)");

        // A lone line on a wall layer is kept, not dropped.
        Ok(WallPairing.Pair(new List<Seg> { new Seg(0, 0, 1000, 0) }).Count == 1,
           "a single unpaired face is kept as a thickness-0 wall, never discarded");

        // A real DWG face isn't exactly parallel — 2 degrees of drift still pairs.
        var drift = new List<Seg> {
            new Seg(0, 0, 5000, 0),
            new Seg(0, 200, 5000, 375),   // ~2 degrees off
        };
        Ok(WallPairing.Pair(drift).Count == 1, "2 degrees of drafting drift still pairs");

        OrderCases();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ---- 2026-10-11: the MA-5a-3 review's cases (a DWG writes its lines in any order) — each read in 6 orders ----

    /// <summary>The same lines forward, reversed, in 3 shuffles and each drawn end to start.</summary>
    static List<List<Seg>> Orders(List<Seg> s)
    {
        var o = new List<List<Seg>> { s, Enumerable.Reverse(s).ToList(), s.Select(x => new Seg(x.X2, x.Y2, x.X1, x.Y1)).ToList() };
        for (int k = 0; k < 3; k++) { var r = new Random(7 + k); o.Add(s.OrderBy(_ => r.Next()).ToList()); }
        return o;
    }
    /// <summary>A reading as a set: each wall's centreline (either way round, to 1 mm) and thickness (to 0.1 mm).</summary>
    static string Canon(List<PairedWall> ws) => string.Join(" ", ws.Select(w =>
    {
        var e = new[] { (Math.Round(w.Cx1), Math.Round(w.Cy1)), (Math.Round(w.Cx2), Math.Round(w.Cy2)) }.OrderBy(p => p.Item1).ThenBy(p => p.Item2).ToArray();
        return $"[{e[0].Item1},{e[0].Item2}-{e[1].Item1},{e[1].Item2} t{Math.Round(w.ThicknessMm, 1)}]";
    }).OrderBy(x => x));
    static bool Has(List<PairedWall> ws, double x1, double y1, double x2, double y2, double t) => ws.Any(w => Math.Abs(w.ThicknessMm - t) < 0.5 &&
        ((Math.Abs(w.Cx1 - x1) < 1 && Math.Abs(w.Cy1 - y1) < 1 && Math.Abs(w.Cx2 - x2) < 1 && Math.Abs(w.Cy2 - y2) < 1) ||
         (Math.Abs(w.Cx1 - x2) < 1 && Math.Abs(w.Cy1 - y2) < 1 && Math.Abs(w.Cx2 - x1) < 1 && Math.Abs(w.Cy2 - y1) < 1)));
    /// <summary>Read in every order: the same set each time, and `holds` on it.</summary>
    static void Case(string name, List<Seg> s, Func<List<PairedWall>, bool> holds)
    {
        var reads = Orders(s).Select(o => WallPairing.Pair(o)).ToList();
        var canon = reads.Select(Canon).ToList();
        bool same = canon.All(c => c == canon[0]);
        Ok(same && holds(reads[0]), $"{name} — {canon[0]}{(same ? "" : "  ORDER-DEPENDENT: " + string.Join(" | ", canon.Distinct()))}");
    }

    static void OrderCases()
    {
        Console.WriteLine("\nOrder-independent pairing (each case read forward, reversed, flipped and in 3 shuffles)\n");
        // (a) A 200 wall whose inner face a 100 partition breaks (a T), a 200 cupboard wall 800 beyond: the leftover inner face pairs
        // with its own wall, never the cupboard (it read an 800-thick wall over the cupboard, or lost it, by line order).
        Case("(a) a T-junction and a cupboard wall: three walls 200, 200 and 100, the south one through the T", new List<Seg> {
            new Seg(0, 0, 10000, 0), new Seg(0, 200, 5000, 200), new Seg(5100, 200, 10000, 200),
            new Seg(5000, 200, 5000, 1000), new Seg(5100, 200, 5100, 1000),
            new Seg(0, 1000, 5000, 1000), new Seg(5100, 1000, 10000, 1000), new Seg(0, 1200, 10000, 1200) },
            ws => ws.Count == 3 && Has(ws, 0, 100, 10000, 100, 200) && Has(ws, 0, 1100, 10000, 1100, 200) && Has(ws, 5050, 200, 5050, 1000, 100));
        // (b) A door 450 from an L corner, each wall piece one closed outline: the corner's two walls and the piece past the door;
        // the jambs and caps close outlines — no wall, no leftover (the jamb took the corner wall's face when it came first).
        Case("(b) a door beside an L corner: three walls 200, the jambs and caps consumed", new List<Seg> {
            new Seg(0, 0, 450, 0), new Seg(450, 0, 450, 200), new Seg(450, 200, 200, 200), new Seg(200, 200, 200, 2500),
            new Seg(200, 2500, 0, 2500), new Seg(0, 2500, 0, 0),
            new Seg(1350, 0, 5000, 0), new Seg(5000, 0, 5000, 200), new Seg(5000, 200, 1350, 200), new Seg(1350, 200, 1350, 0) },
            ws => ws.Count == 3 && ws.All(w => Math.Abs(w.ThicknessMm - 200) < 0.5) && Has(ws, 100, 0, 100, 2500, 200)
                  && Has(ws, 0, 100, 450, 100, 200) && Has(ws, 1350, 100, 5000, 100, 200));
        // (c) A 300 wall and a 200 wall on one flush outer face: two walls, each its own thickness and length (it read one).
        Case("(c) a flush face, two thicknesses: walls 300 and 200, the step between them consumed", new List<Seg> {
            new Seg(0, 0, 5000, 0), new Seg(5000, 0, 10000, 0), new Seg(0, 300, 5000, 300), new Seg(5000, 200, 10000, 200),
            new Seg(5000, 200, 5000, 300), new Seg(0, 0, 0, 300), new Seg(10000, 0, 10000, 200) },
            ws => ws.Count == 2 && Has(ws, 0, 150, 5000, 150, 300) && Has(ws, 5000, 100, 10000, 100, 200));
        // (d) A face that runs on alone far past its partner is a single line there, kept as an unpaired stretch — not wall.
        Case("(d) a face running on alone: a 200 wall over the pair, the rest an unpaired line", new List<Seg> {
            new Seg(0, 0, 10000, 0), new Seg(0, 200, 3000, 200), new Seg(0, 0, 0, 200) },
            ws => ws.Count == 2 && Has(ws, 0, 100, 3000, 100, 200) && Has(ws, 3000, 0, 10000, 0, 0));
        // (e) A wall drawn ±1° either side of horizontal (the angles meet across 0°/180°): still one wall.
        Case("(e) drift across 0°/180°: one wall", new List<Seg> { new Seg(0, 0, 5000, 87.3), new Seg(0, 300, 5000, 212.7) },
            ws => ws.Count == 1 && ws[0].ThicknessMm > 150 && ws[0].ThicknessMm < 300);
        // (f) Two walls with a 200 void between (a riser): the two walls, never the void.
        Case("(f) two walls with a void between: 300 and 200, not the void", new List<Seg> {
            new Seg(0, 0, 10000, 0), new Seg(0, 300, 10000, 300), new Seg(0, 500, 10000, 500), new Seg(0, 700, 10000, 700) },
            ws => ws.Count == 2 && Has(ws, 0, 150, 10000, 150, 300) && Has(ws, 0, 600, 10000, 600, 200));

        // ---- the second review (wf_63edf3d3-acc) ----
        var wall = new List<Seg> { new Seg(0, 0, 5000, 0), new Seg(0, 200, 5000, 200), new Seg(0, 0, 0, 200), new Seg(5000, 0, 5000, 200) };
        // (g) A lone line 600 beyond a wall's inner face (a screen, a one-line partition) is a lone line — never a 600 wall over the room.
        Case("(g) a lone line beside a wall: the wall, and the line unpaired", wall.Concat(new[] { new Seg(0, 800, 5000, 800) }).ToList(),
            ws => ws.Count == 2 && Has(ws, 0, 100, 5000, 100, 200) && Has(ws, 0, 800, 5000, 800, 0));
        // (h) A 50 lining against a 300 wall shares its face: both are walls.
        Case("(h) a lining against a wall: the 300 wall and the 50 lining", new List<Seg> { new Seg(0, 0, 5000, 0), new Seg(0, 300, 5000, 300), new Seg(0, 350, 5000, 350) },
            ws => ws.Count == 2 && Has(ws, 0, 150, 5000, 150, 300) && Has(ws, 0, 325, 5000, 325, 50));
        // (i) An unrelated line 0.4° off on the same layer does not tilt, split or hole a square wall's faces.
        var t = new List<Seg> { new Seg(0, 0, 8000, 0), new Seg(0, 200, 4000, 200), new Seg(4200, 200, 8000, 200), new Seg(4000, 200, 4000, 3000),
            new Seg(4200, 200, 4200, 3000), new Seg(4000, 3000, 4200, 3000), new Seg(0, 0, 0, 200), new Seg(8000, 0, 8000, 200) };
        Case("(i) a line 0.4° off elsewhere on the layer: the T's walls exact, the line unpaired", t.Concat(new[] { new Seg(0, 6000, 1500, 6010.47) }).ToList(),
            ws => ws.Count == 3 && Has(ws, 0, 100, 8000, 100, 200) && Has(ws, 4100, 200, 4100, 3000, 200) && Has(ws, 0, 6000, 1500, 6010.47, 0));
        // (j) A curved 200 wall drawn as 0.4° facets beside a square room: the room's walls keep their own square directions.
        var room = new List<Seg> { new Seg(0, 0, 6000, 0), new Seg(6000, 0, 6000, 5000), new Seg(6000, 5000, 0, 5000), new Seg(0, 5000, 0, 0),
            new Seg(200, 200, 5800, 200), new Seg(5800, 200, 5800, 4800), new Seg(5800, 4800, 200, 4800), new Seg(200, 4800, 200, 200) };
        var curve = new List<Seg>();
        for (double a = 0; a < 90 - 1e-9; a += 0.4)
            foreach (var r in new[] { 8000.0, 7800.0 })
            {
                double a0 = a * Math.PI / 180, a1 = Math.Min(a + 0.4, 90) * Math.PI / 180;
                curve.Add(new Seg(22000 + r * Math.Cos(a0), r * Math.Sin(a0), 22000 + r * Math.Cos(a1), r * Math.Sin(a1)));
            }
        var rc = WallPairing.Pair(room.Concat(curve).ToList());
        Ok(Has(rc, 0, 100, 6000, 100, 200) && Has(rc, 5900, 0, 5900, 5000, 200) && Has(rc, 0, 4900, 6000, 4900, 200) && Has(rc, 100, 0, 100, 5000, 200),
            $"(j) a curve's 0.4° facets beside a square room: the room's 4 walls square and 200 ({rc.Count(w => w.ThicknessMm > 0)} paired)");
        // (k) A T whose inner pieces are 3 mm off each other: no hole — the two walls meet at the partition's centreline.
        Case("(k) a T, the inner faces 3 mm off: the walls meet at the partition, the outer face all wall", new List<Seg> {
            new Seg(0, 0, 8000, 0), new Seg(0, 200, 4000, 200), new Seg(4200, 203, 8000, 203), new Seg(4000, 200, 4000, 3000),
            new Seg(4200, 203, 4200, 3000), new Seg(4000, 3000, 4200, 3000), new Seg(0, 0, 0, 200), new Seg(8000, 0, 8000, 203) },
            ws => ws.Count == 3 && Has(ws, 0, 100, 4100, 100, 200) && Has(ws, 4100, 101.5, 8000, 101.5, 203));
        // (l) Two walls crossing, each cut at the other: both run through.
        Case("(l) a crossing: both walls run through", new List<Seg> {
            new Seg(0, 0, 4900, 0), new Seg(5100, 0, 10000, 0), new Seg(0, 200, 4900, 200), new Seg(5100, 200, 10000, 200),
            new Seg(4900, -5000, 4900, 0), new Seg(4900, 200, 4900, 5000), new Seg(5100, -5000, 5100, 0), new Seg(5100, 200, 5100, 5000) },
            ws => ws.Count == 2 && Has(ws, 0, 100, 10000, 100, 200) && Has(ws, 5000, -5000, 5000, 5000, 200));
        // (m) A wall keeps its drawn direction: faces drawn right to left give a centreline right to left (the side Revit puts
        // a type's exterior on follows it).
        var rtl = WallPairing.Pair(new List<Seg> { new Seg(5000, 0, 0, 0), new Seg(5000, 200, 0, 200) });
        Ok(rtl.Count == 1 && rtl[0].Cx1 > rtl[0].Cx2, $"(m) faces drawn right to left: the centreline runs right to left ({rtl[0].Cx1:0} -> {rtl[0].Cx2:0})");
        // (n) Speed: 2,500 rooms' worth of walls (10,000 lines, shuffled) read well inside Ghost Builder's patience.
        var big = new List<Seg>();
        for (int i = 0; i < 2500; i++)
        {
            double x = (i % 50) * 7000, y = (i / 50) * 7000;
            big.AddRange(new[] { new Seg(x, y, x + 5000, y), new Seg(x + 5000, y, x + 5000, y + 200), new Seg(x + 5000, y + 200, x, y + 200), new Seg(x, y + 200, x, y) });
        }
        var rnd = new Random(3);
        big = big.OrderBy(_ => rnd.Next()).ToList();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var rb = WallPairing.Pair(big);
        Ok(rb.Count == 2500 && sw.Elapsed.TotalSeconds < 5, $"(n) 10,000 lines: {rb.Count} walls in {sw.Elapsed.TotalSeconds:0.00} s");
    }
}
