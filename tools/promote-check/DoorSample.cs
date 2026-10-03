#nullable disable
using System.Text.Json;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 21. MA-1b drill data: the reader's pure half over make-sample.py --ma1b's own numbers ───────────────────────────
    // The script computes what each INSERT must become; this computes it again with the add-in's code (Frame, BlockCentre,
    // Snap, Axes) from the INSERT's raw values. Two independent workings of one drawing; drill MA1b compares Revit with both.
    static void DoorSampleChecks()
    {
        Console.WriteLine("\nMA-1b drill data (demo/ghost-sample/sample-doors-expected.json, make-sample.py --ma1b)");
        var path = Repo("demo", "ghost-sample", "sample-doors-expected.json");
        Ok(File.Exists(path), "the expected results are written beside the drawing");
        if (!File.Exists(path)) return;
        var doc = JsonDocument.Parse(File.ReadAllText(path)).RootElement;
        double half = doc.GetProperty("wall_thickness_mm").GetDouble() / 2;
        var walls = doc.GetProperty("walls").EnumerateArray().Select(w => ("wall " + w.GetProperty("n").GetInt32(), "L",
            w.GetProperty("start")[0].GetDouble(), w.GetProperty("start")[1].GetDouble(), w.GetProperty("end")[0].GetDouble(), w.GetProperty("end")[1].GetDouble())).ToList();
        // Review amendment C4: the wall drawn in two pieces that stop at a door — both pieces are walls of the build.
        var brokenWall = doc.GetProperty("broken_wall");
        foreach (var p in brokenWall.GetProperty("pieces").EnumerateArray())
            walls.Add(("broken wall piece " + (walls.Count - 10), "L", p.GetProperty("start")[0].GetDouble(), p.GetProperty("start")[1].GetDouble(),
                       p.GetProperty("end")[0].GetDouble(), p.GetProperty("end")[1].GetDouble()));
        var halves = walls.Select(_ => half).ToList();
        var blocks = doc.GetProperty("blocks").EnumerateArray().ToDictionary(b => b.GetProperty("name").GetString(), b => b);
        bool SameAngle(double a, double b) => Math.Abs(((a - b) % 360 + 540) % 360 - 180) < 0.001;

        // One INSERT as the extractor's pure half reads it: its axes from rotation and scale, the middle of what its block
        // draws, the wall that middle belongs to.
        (int Wall, double X, double Y, double Rot, bool Mirrored, string Why) Read(JsonElement b)
        {
            double a = b.GetProperty("dxf_rotation").GetDouble() * Math.PI / 180, sx = b.GetProperty("x_scale").GetDouble(), sy = b.GetProperty("y_scale").GetDouble();
            double ox = b.GetProperty("insert")[0].GetDouble(), oy = b.GetProperty("insert")[1].GetDouble();
            (double X, double Y) World(double bx, double by) =>
                (ox + Math.Cos(a) * sx * bx - Math.Sin(a) * sy * by, oy + Math.Sin(a) * sx * bx + Math.Cos(a) * sy * by);
            var (rot, mirrored) = PlacementGeometry.Frame(Math.Cos(a) * sx, Math.Sin(a) * sx, -Math.Sin(a) * sy, Math.Cos(a) * sy);
            var drawn = blocks[b.GetProperty("block").GetString()].GetProperty("drawn").EnumerateArray().Select(p => World(p[0].GetDouble(), p[1].GetDouble())).ToList();
            var c = PlacementGeometry.BlockCentre(ox, oy, rot, drawn);
            var s = PlacementGeometry.Snap(walls, halves, "L", c.X, c.Y, rot, out var why);
            return (s?.Wall ?? -1, s?.X ?? 0, s?.Y ?? 0, rot, mirrored, why);
        }
        bool AsExpected(JsonElement b)
        {
            var r = Read(b);
            var axes = PlacementGeometry.Axes(r.Rot, r.Mirrored);
            return r.Wall == b.GetProperty("wall").GetInt32() - 1
                && Math.Abs(r.X - b.GetProperty("at")[0].GetDouble()) < 0.01 && Math.Abs(r.Y - b.GetProperty("at")[1].GetDouble()) < 0.01
                && SameAngle(r.Rot, b.GetProperty("rotation").GetDouble()) && r.Mirrored == b.GetProperty("mirrored").GetBoolean()
                // Review amendment C9: each times its calibration sign (a sign squared is 1), so this holds whichever way the drill sets them.
                && SameAngle(Math.Atan2(axes.Hy * PlacementGeometry.HandSign, axes.Hx * PlacementGeometry.HandSign) * 180 / Math.PI, b.GetProperty("hinge_to_strike_deg").GetDouble())
                && SameAngle(Math.Atan2(axes.Fy * PlacementGeometry.FacingSign, axes.Fx * PlacementGeometry.FacingSign) * 180 / Math.PI, b.GetProperty("swing_side_deg").GetDouble());
        }

        var doors = doc.GetProperty("doors").EnumerateArray().ToList();
        Ok(walls.Count == 13 && doors.Count == 10, "11 walls, a twelfth drawn in two pieces, and 10 door blocks");
        Ok(doors.Select(d => doc.GetProperty("walls")[d.GetProperty("wall").GetInt32() - 1].GetProperty("angle").GetInt32())
               .SequenceEqual(new[] { 0, 15, 30, 45, 60, 90, 120, 135, 150, 165 }), "the doors' walls are at the ten known angles");
        var wrong = doors.Where(d => !AsExpected(d)).Select(d => d.GetProperty("n").GetInt32()).ToList();
        Ok(wrong.Count == 0, "each door block reads — by Frame, BlockCentre, Snap and Axes — as the script expects: its wall, the point on the wall's line, " +
                             "its angle, its mirror, its hinge side and its swing side" + (wrong.Count == 0 ? "" : " → door(s) " + string.Join(", ", wrong)));
        Ok(doors.Count(d => d.GetProperty("mirrored").GetBoolean()) == 3
           && doors.Count(d => !SameAngle(d.GetProperty("rotation").GetDouble(), doc.GetProperty("walls")[d.GetProperty("wall").GetInt32() - 1].GetProperty("angle").GetInt32())) == 4
           && doors.Count(d => d.GetProperty("off_line_mm").GetDouble() != 0) == 2,
           "three doors are mirrored, four run against their wall's direction (two half turns, two x-mirrors), two are drawn off the centre line");
        Ok(doors.All(d => d.GetProperty("at").EnumerateArray().Select(v => v.GetDouble())
               .SequenceEqual(doc.GetProperty("walls")[d.GetProperty("wall").GetInt32() - 1].GetProperty("centre").EnumerateArray().Select(v => v.GetDouble()))),
           "every door belongs at its wall's centre — hinge-inserted, off-line or mirrored, the middle of the opening lands there");
        Ok(AsExpected(doc.GetProperty("window")) && blocks["WIN-1200"].GetProperty("layer").GetString() == "0",
           "the window block (its own lines on layer 0) reads as the script expects");
        var lone = Read(doc.GetProperty("no_wall"));
        Ok(lone.Wall == -1 && lone.Why.StartsWith("no straight wall of this build on L passes within half its thickness of"), "the block with no wall near is a gap, in words");
        var gap = Read(brokenWall);
        Ok(gap.Wall == -1 && PlacementGeometry.IsBrokenWall(gap.Why)
           && gap.Why.StartsWith($"the wall line of broken wall piece 1 stops {brokenWall.GetProperty("stops_short_mm").GetDouble():0.#} mm short of "),
           "the door between two wall pieces is a gap that says the wall line stops short of it (F8) — not 'no wall', and not a door");

        int Inserts(string file) => File.ReadAllLines(Repo("demo", "ghost-sample", file)).Count(l => l == "INSERT");
        string main = doc.GetProperty("drawing").GetString(), planted = doc.GetProperty("planted_drawing").GetString();
        Ok(File.Exists(Repo("demo", "ghost-sample", main)) && Inserts(main) == 13, "sample-doors.dxf holds 13 inserts: 10 doors, the window, the one with no wall, the one between two wall pieces");
        Ok(File.Exists(Repo("demo", "ghost-sample", planted)) && Inserts(planted) == 14, "sample-doors-planted.dxf holds one more: the duplicate of door 1");
        var dxf = File.ReadAllLines(Repo("demo", "ghost-sample", main));
        Ok(dxf.Contains("BLOCKS") && dxf.Contains("DOOR-900") && dxf.Contains("WIN-1200") && dxf.Contains("ENDBLK"), "the drawing defines both blocks in a BLOCKS section");
    }
}
