#nullable disable
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 20. MA-1b (GHB-1): a DWG door or window block — its frame, the wall it belongs to, the way it turns (pure) ──────
    static void DoorBlockChecks()
    {
        Console.WriteLine("\nMA-1b block frame (PlacementGeometry.Frame, BlockCentre)");
        // A DXF INSERT's two axes in plan: the block's X and Y, scaled, then turned by its rotation.
        (double RotationDeg, bool Mirrored) F(double rot, double sx = 1, double sy = 1)
        {
            double a = rot * Math.PI / 180, c = Math.Cos(a), s = Math.Sin(a);
            return PlacementGeometry.Frame(c * sx, s * sx, -s * sy, c * sy);
        }
        bool Is((double RotationDeg, bool Mirrored) f, double rot, bool mirrored) => Math.Abs(f.RotationDeg - rot) < 1e-4 && f.Mirrored == mirrored;
        Ok(Is(F(0), 0, false) && Is(F(30), 30, false) && Is(F(225), 225, false), "an insert turned 0, 30 or 225 degrees reads that angle, not mirrored");
        Ok(Is(F(60, -1), 240, true), "an x scale of -1 at 60 degrees reads 240 degrees, mirrored (its X axis points the other way)");
        Ok(Is(F(165, 1, -1), 165, true), "a y scale of -1 at 165 degrees reads 165 degrees, mirrored");
        Ok(Is(F(10, -1, -1), 190, false), "both scales -1 is a half turn, not a mirror");
        Ok(F(359.99999999).RotationDeg == 0 && F(-0.00000001).RotationDeg == 0, "an angle a rounding away from 360 reads 0, never 360 (the bridge takes 0 up to 360)");

        var c0 = PlacementGeometry.BlockCentre(1000, 2000, 0, new[] { (1000.0, 2000.0), (1900.0, 2000.0), (1000.0, 2900.0) });
        Ok(Math.Abs(c0.X - 1450) < 1e-6 && Math.Abs(c0.Y - 2000) < 1e-6, "a door block inserted by its hinge: the middle of what it draws along its X axis is the middle of the opening");
        var c90 = PlacementGeometry.BlockCentre(0, 0, 90, new[] { (0.0, 0.0), (0.0, 900.0), (-900.0, 0.0) });
        Ok(Math.Abs(c90.X) < 1e-6 && Math.Abs(c90.Y - 450) < 1e-6, "the same block turned 90 degrees: the middle is 450 up its wall");
        Ok(PlacementGeometry.BlockCentre(5, 7, 30, null) == (5, 7) && PlacementGeometry.BlockCentre(5, 7, 30, new (double, double)[0]) == (5, 7),
           "a block that draws nothing stands at its insertion point");

        Console.WriteLine("\nMA-1b the wall a block belongs to (PlacementGeometry.Snap)");
        var walls = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>
        {
            ("W1", "L1", 0, 0, 4000, 0), ("W2", "L1", 4000, 0, 4000, 4000), ("W3", "L2", 0, 0, 4000, 0),
        };
        var half = new List<double> { 100, 100, 100 };
        string S(double x, double y, double? axis, string level = "L1", List<(string, string, double, double, double, double)> w = null, List<double> h = null)
        {
            var s = PlacementGeometry.Snap(w ?? walls, h ?? half, level, x, y, axis, out var why);
            return s == null ? why : $"{(w ?? walls)[s.Value.Wall].Item1} ({s.Value.X:0.###}, {s.Value.Y:0.###})";
        }
        Ok(S(2000, 60, 0) == "W1 (2000, 0)", "a block 60 mm off a 200 mm wall's line is moved onto the line");
        Ok(S(2000, 101, 0) == "W1 (2000, 0)" && S(2000, 102, 0) == "no straight wall of this build on L1 passes within half its thickness of (2000, 102)",
           "half the wall's thickness plus 1 mm is the reach: 101 mm snaps, 102 mm is no wall, in words");
        Ok(S(2000, 60, 180) == "W1 (2000, 0)" && S(2000, 60, 4) == "W1 (2000, 0)", "a block turned a half turn, or 4 degrees off, is still along its wall");
        Ok(S(2000, 60, 6) == "the block at (2000, 60) is turned 6° from W1 — a door or window lies along its wall (within 5°)"
           && S(2000, 60, 90).StartsWith("the block at (2000, 60) is turned 90° from W1"), "6 degrees off, or across the wall: a named gap, never a guess");
        Ok(S(2000, 60, null) == "W1 (2000, 0)", "a drawn outline has no axis: it snaps by distance alone");
        Ok(S(2000, 60, 0, "l2") == "W3 (2000, 0)" && S(2000, 60, 0, "L3").StartsWith("no straight wall of this build on L3"), "only walls of the build level count; level names compare as Revit's do");
        Ok(S(3950, 50, 0) == "W1 (3950, 0)" && S(3950, 50, 90) == "W2 (4000, 50)", "at a corner the block's axis picks its wall");
        Ok(S(3950, 50, null) == "2 walls of this build on L1 are equally near (3950, 50): W1, W2 — a person decides the host"
           && S(3950, 20, null) == "W1 (3950, 0)", "an outline at a corner: the nearer wall, or — equally near — a person decides");
        // Review amendment C4: a wall line that stops just short of the opening is said — walls broken at openings are the usual CAD habit.
        Ok(S(4090, 0, 0, "L2") == "the wall line of W3 stops 90 mm short of (4090, 0) — wall pieces broken at an opening are not joined yet (GHB-6)"
           && PlacementGeometry.IsBrokenWall(S(4090, 0, 0, "L2")) && !PlacementGeometry.IsBrokenWall(S(2000, 102, 0)) && !PlacementGeometry.IsBrokenWall(null),
           "a point past the wall's end is not that wall's opening — and when the wall's line stops just short of it, the sentence says so");
        Ok(S(4000 + PlacementGeometry.BrokenReachMm + 1, 0, 0, "L2") == "no straight wall of this build on L2 passes within half its thickness of (6001, 0)"
           && S(4090, 0, 90, "L2") == "no straight wall of this build on L2 passes within half its thickness of (4090, 0)"
           && S(4090, 102, 0, "L2").StartsWith("no straight wall of this build on L2"),
           "further past the end than a wide opening, a block across that line, or off the line by more than half the thickness: no wall, plainly");
        var pieces = new List<(string, string, double, double, double, double)> { ("W1", "L1", 0, 0, 1550, 0), ("W2", "L1", 2450, 0, 4000, 0) };
        Ok(S(2000, 0, 0, w: pieces, h: new List<double> { 100, 100 }) == "the wall line of W1 stops 450 mm short of (2000, 0) — wall pieces broken at an opening are not joined yet (GHB-6)"
           && S(2100, 0, null, w: pieces, h: new List<double> { 100, 100 }).StartsWith("the wall line of W2 stops 350 mm short of (2100, 0)"),
           "a door in the gap between two wall pieces on one line is named as a broken wall — the nearer piece, or the first of two equally near");
        var twice = new List<(string, string, double, double, double, double)> { ("W1", "L1", 0, 0, 4000, 0), ("W1 again", "L1", 0, 0, 4000, 0) };
        Ok(S(2000, 0, 0, w: twice, h: new List<double> { 100, 100 }) == "2 walls of this build on L1 are equally near (2000, 0): W1, W1 again — a person decides the host",
           "two walls drawn on top of each other: named, a person decides");
        Ok(S(0, 0, 0, w: new List<(string, string, double, double, double, double)>(), h: new List<double>()).StartsWith("no straight wall of this build"), "no wall at all: a reason, no throw");
        Ok(S(2000, 149, 0, h: new List<double> { 150, 100, 100 }) == "W1 (2000, 0)", "a thicker wall reaches further: each wall's own half thickness");
        // Review (2026-10-03): the measured angle is printed to a hundredth, so "turned 5° … (within 5°)" is never said of 5.04°.
        Ok(S(2000, 60, 5.04) == "the block at (2000, 60) is turned 5.04° from W1 — a door or window lies along its wall (within 5°)"
           && PlacementGeometry.AcrossWall("w", 0, 0, 4000, 0, 5.04) == "place.Rotation 5.04° is 5.04° off the line of its wall (w) — a door or window lies along its wall (within 5°)",
           "a block 5.04 degrees off its wall is refused with that angle, not with a rounded 5 — in the planner and in the executor");
        // Review (2026-10-03): near a corner, a block a fraction past its wall's end is answered by the wall whose line stops short,
        // not by the perpendicular neighbour it is turned 90° from.
        Ok(S(4000.4, 0, 0) == "the wall line of W1 stops 0.4 mm short of (4000.4, 0) — wall pieces broken at an opening are not joined yet (GHB-6)",
           "at a corner, a block just past the end of the wall it lies along names that wall's line, not the wall it is across");
        // Review (2026-10-03): the planner (Snap, from the import's curves) and the executor (AcrossWall, from the Revit wall's
        // line after the mm->ft->mm round trip) read the 5° bound on different numbers, and at exactly 5° either may land an ulp
        // over. The executor's bound is a hair looser (ParallelSlackDeg), so whatever Snap files, AcrossWall accepts: a gap is
        // named by the planner, never a whole-build decline by the executor.
        double wx = Math.Cos(30 * Math.PI / 180) * 4000, wy = Math.Sin(30 * Math.PI / 180) * 4000, ft = 304.8, rx = wx / ft * ft, ry = wy / ft * ft;
        var w30 = new List<(string, string, double, double, double, double)> { ("W30", "L1", 0, 0, wx, wy) };
        int filedAt5 = 0, agree = 0;
        for (int k = -20; k <= 20; k++)
        {
            double rot = 35 + k * 1e-13; // the angles a reader could hand over around exactly 5° off (Frame rounds to 4 decimals: 35.0000 itself is one of them)
            bool filed = S(wx / 2, wy / 2, rot, w: w30, h: new List<double> { 100 }).StartsWith("W30 (");
            if (filed) filedAt5++;
            if (!filed || PlacementGeometry.AcrossWall("W30", 0, 0, rx, ry, rot) == null) agree++;
        }
        Ok(filedAt5 > 0 && agree == 41, "every block Snap files at 5 degrees off a 30-degree wall is accepted by the executor on the same wall rebuilt from feet");
        Ok(PlacementGeometry.AcrossWall("W30", 0, 0, rx, ry, 35 + 1e-9) == null && PlacementGeometry.AcrossWall("W30", 0, 0, rx, ry, 35.01) != null
           && S(wx / 2, wy / 2, 35.01, w: w30, h: new List<double> { 100 }).StartsWith("the block at"),
           "the executor's slack is a rounding, not a degree: 5 degrees plus a billionth passes, 5.01 is refused — and is the planner's named gap");

        Console.WriteLine("\nMA-1b the way a block turns (PlacementGeometry.Axes, Opposes, AxisOff, Turn, TurnLines)");
        bool Near((double Hx, double Hy, double Fx, double Fy) a, double hx, double hy, double fx, double fy) =>
            Math.Abs(a.Hx - hx) + Math.Abs(a.Hy - hy) + Math.Abs(a.Fx - fx) + Math.Abs(a.Fy - fy) < 1e-9;
        // Review amendment C9: this is the ONE line that pins the signs. Every other check here and in DoorSample.cs multiplies
        // by H and G, so a sign the drill turns to -1 (row B1-3) needs this line changed and no other.
        Ok(PlacementGeometry.HandSign == 1 && PlacementGeometry.FacingSign == 1, "the two calibration signs are +1 until drill MA1b says otherwise (the one line that pins them)");
        int H = PlacementGeometry.HandSign, G = PlacementGeometry.FacingSign;
        Ok(Near(PlacementGeometry.Axes(0, false), H, 0, 0, G) && Near(PlacementGeometry.Axes(90, false), 0, H, -G, 0),
           "hand runs along the block's X axis; facing is its Y axis, to the left of it (each times its calibration sign)");
        Ok(Near(PlacementGeometry.Axes(0, true), H, 0, 0, -G), "a mirrored block swings to the other side: its Y axis is to the right");
        Ok(PlacementGeometry.Opposes(-1, 0, 1, 0) && !PlacementGeometry.Opposes(1, 0, 1, 0) && !PlacementGeometry.Opposes(0, 1, 1, 0),
           "a direction against the target's needs a flip; with it, or square to it, none");
        Ok(PlacementGeometry.AxisOff(10, 190) == 0 && PlacementGeometry.AxisOff(0, 91) == 89 && PlacementGeometry.AxisOff(359, 1) == 2 && PlacementGeometry.AxisOff(-90, 90) == 0,
           "the angle between two lines is 0 to 90, whatever way each points");
        double c30 = Math.Cos(Math.PI / 6), s30 = Math.Sin(Math.PI / 6);
        var good = PlacementGeometry.Turn("door \"A-DOOR #1\"", 30, false, H * c30, H * s30, -G * s30, G * c30);
        var wrongHand = PlacementGeometry.Turn("door \"A-DOOR #2\"", 30, false, -H * c30, -H * s30, -G * s30, G * c30, canFlipHand: false);
        var wrongBoth = PlacementGeometry.Turn("window \"A-GLAZ #1\"", 30, true, -H * c30, -H * s30, -G * s30, G * c30);
        Ok(good.OffDeg < 1e-9 && good.Hand && good.Facing && wrongHand.OffDeg < 1e-9 && !wrongHand.Hand && wrongHand.Facing && wrongHand.NoHandFlip && !wrongHand.NoFacingFlip
           && !wrongBoth.Hand && !wrongBoth.Facing && !wrongBoth.NoHandFlip,
           "a placed instance against its block: the angle between them, whether its hand and its facing run with the block's axes, and whether its family lacks the flip");
        Ok(PlacementGeometry.Turn("d", 30, false, 1, 0, 0, 1).OffDeg is > 29.999 and < 30.001, "an instance 30 degrees off its block reads 30");
        // Review amendment C1: square to its block is not "with" its block — the flip test alone would say so (a dot product of 0).
        var across = PlacementGeometry.Turn("door \"A-DOOR #5\"", 90, false, 1, 0, 0, 1);
        Ok(across.OffDeg == 90 && !across.Hand && !across.Facing, "an instance across its block (90 degrees off) is turned to neither of its axes");
        Ok(PlacementGeometry.AcrossWall("wall 7", 40000, 90000, 44000, 90000, 90) == "place.Rotation 90° is 90° off the line of its wall (wall 7) — a door or window lies along its wall (within 5°)"
           && PlacementGeometry.AcrossWall("w", 0, 0, 4000, 0, 6) != null && PlacementGeometry.AcrossWall("w", 0, 0, 4000, 0, 180) == null
           && PlacementGeometry.AcrossWall("w", 0, 0, 4000, 0, 4) == null && PlacementGeometry.AcrossWall("w", 0, 0, 0, 4000, 270) == null,
           "a Rotation across its host wall is a refusal in words; along it, either way round or 4 degrees off, is none");
        var lines = PlacementGeometry.TurnLines(new[] { good, wrongHand, wrongBoth, ("door \"A-DOOR #4\"", double.NaN, false, false, false, false), across });
        Ok(lines.Count == 5
           && lines[0] == "Blocks: 5 door(s) and window(s) placed with a block's direction (place.Rotation) — largest angle between one and its block's X axis 90.0°; " +
                          "hand along the block's X axis and facing along its Y axis on 1 of 5 (Sentinel reads X as hinge to strike and Y as the swing side: compare one door with the drawing)."
           && lines[1] == "  door \"A-DOOR #2\": its family has no hand flip — its hand runs against the block's X axis."
           && lines[2] == "  window \"A-GLAZ #1\": its hand is not turned to the block's X axis; its facing is not turned to the block's Y axis."
           && lines[3] == "  door \"A-DOOR #4\": its direction could not be read back from Revit — compare it with the drawing."
           && lines[4] == "  door \"A-DOOR #5\": it lies 90.0° off its block's X axis — it is not turned to its block.",
           "the summary says what was measured: one line for the build, and one for each instance not turned to its block, with no such flip, or unread");
        Ok(PlacementGeometry.TurnLines(null).Count == 0 && PlacementGeometry.TurnLines(new (string, double, bool, bool, bool, bool)[0]).Count == 0, "a build with no block says nothing");
    }
}
