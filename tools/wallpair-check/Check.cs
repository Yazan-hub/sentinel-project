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

    static int Main()
    {
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

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
