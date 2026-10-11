// MA-5a-3 — the sentinel-drawing check. Run: dotnet run --project tools/drawing-check
// Drives DrawingJob.Run (the worker's whole contract, stdin JSON → stdout JSON, without the process) on the drill plan and its
// variants, and holds the reading to drawing/fixtures/drill-plan-L00.expected.json.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using Sentinel.Drawing;

namespace Sentinel.Checks
{
    static class Check
    {
        static int fails;
        static void Ok(bool cond, string words) { Console.WriteLine($"{(cond ? "ok  " : "FAIL")} {words}"); if (!cond) fails++; }

        static string Root()
        {
            for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
                if (Directory.Exists(Path.Combine(d.FullName, "drawing", "fixtures"))) return d.FullName;
            throw new Exception("drawing/fixtures not found above " + AppContext.BaseDirectory);
        }

        static string Sha(string path) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant();

        static JsonObject Run(params (string id, string path, string sha)[] items)
        {
            var arr = new JsonArray();
            foreach (var (id, path, sha) in items) arr.Add(new JsonObject { ["id"] = id, ["kind"] = "drawing", ["path"] = path, ["sha256"] = sha });
            return DrawingJob.Run(new JsonObject { ["job_id"] = "job-0001", ["items"] = arr, ["params"] = new JsonObject(), ["seed"] = 1 });
        }

        static JsonNode[] Kind(JsonObject r, string kind) => r["result"]["candidates"].AsArray().Where(c => (string)c["kind"] == kind).ToArray();
        static double D(JsonNode n) => double.Parse(n.ToJsonString()); // a value built from an int has no GetValue<double>
        static double Dist(JsonNode p, JsonNode q) => Math.Sqrt(Math.Pow(D(p[0]) - D(q[0]), 2) + Math.Pow(D(p[1]) - D(q[1]), 2));

        // ---- the branch review's cases (wf_ae3a6c66-31b), on Analyse with drawn strokes (paper mm) — each read in both stroke orders ----
        static Stroke Ln(double x1, double y1, double x2, double y2, double w = 0.7) => new Stroke { X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Weight = w };
        static readonly Stroke THIN = Ln(0, -50, 1, -50, 0.25); // a second weight: walls are told from the rest
        /// <summary>A circle's arc from a0 over span degrees as one cubic Bezier.</summary>
        static Curve Bz(double cx, double cy, double r, double a0, double span)
        {
            double a = a0 * Math.PI / 180, b = (a0 + span) * Math.PI / 180, k = 4.0 / 3 * Math.Tan((b - a) / 4);
            double x0 = cx + r * Math.Cos(a), y0 = cy + r * Math.Sin(a), x3 = cx + r * Math.Cos(b), y3 = cy + r * Math.Sin(b);
            return new Curve { P = new[] { x0, y0, x0 - k * r * Math.Sin(a), y0 + k * r * Math.Cos(a), x3 + k * r * Math.Sin(b), y3 - k * r * Math.Cos(b), x3, y3 } };
        }
        static Reading An(List<Stroke> s, List<Curve> c = null, List<Word> w = null) =>
            PlanReader.Analyse(s.Append(THIN).ToList(), c ?? new List<Curve>(), w ?? new List<Word>());
        static Reading[] Both(List<Stroke> s, List<Curve> c = null, List<Word> w = null)
        {
            var back = new List<Stroke>(s); back.Reverse();
            return new[] { An(s, c, w), An(back, c, w) };
        }
        static string Ws(Reading r) => string.Join("; ", r.Walls.Select(w => $"({w.X1:0.#},{w.Y1:0.#})-({w.X2:0.#},{w.Y2:0.#}) t {w.Thickness:0.##}"));
        static bool Has(Reading r, double x1, double y1, double x2, double y2, double t) => r.Walls.Any(w => Math.Abs(w.Thickness - t) < 0.01 &&
            ((Math.Abs(w.X1 - x1) < 0.05 && Math.Abs(w.Y1 - y1) < 0.05 && Math.Abs(w.X2 - x2) < 0.05 && Math.Abs(w.Y2 - y2) < 0.05) ||
             (Math.Abs(w.X1 - x2) < 0.05 && Math.Abs(w.Y1 - y2) < 0.05 && Math.Abs(w.X2 - x1) < 0.05 && Math.Abs(w.Y2 - y1) < 0.05)));

        static void Review()
        {
            // (a) A T-junction breaks a wall's inner face; a cupboard wall 20 mm off: the leftover face pairs with its own wall, never the
            // cupboard — in either stroke order (it read a 1000 mm wall over the cupboard).
            var t = new List<Stroke> { Ln(0, 0, 200, 0), Ln(0, 4, 100, 4), Ln(104, 4, 200, 4), Ln(100, 4, 100, 24), Ln(104, 4, 104, 24), Ln(0, 24, 100, 24), Ln(104, 24, 200, 24), Ln(0, 28, 200, 28) };
            foreach (var r in Both(t))
                Ok(r.Walls.Count == 3 && Has(r, 0, 2, 200, 2, 4) && Has(r, 0, 26, 200, 26, 4) && r.Walls.All(w => w.Thickness < 4.1),
                    $"a T-junction and a cupboard wall: 3 walls 4 thick, the outer through the T — {Ws(r)}");
            // (b) A door 5 mm from an L corner, each wall piece one closed outline: the corner's walls both read, jambs never pair with a
            // perpendicular face (it lost the 50 mm wall when the jambs came first).
            var l = new List<Stroke> { Ln(0, 0, 9, 0), Ln(9, 0, 9, 4), Ln(9, 4, 4, 4), Ln(4, 4, 4, 50), Ln(4, 50, 0, 50), Ln(0, 50, 0, 0),
                Ln(27, 0, 100, 0), Ln(100, 0, 100, 4), Ln(100, 4, 27, 4), Ln(27, 4, 27, 0) };
            var swing = new List<Curve> { Bz(9, 4, 18, 0, 90) };
            foreach (var r in Both(l, swing))
                Ok(r.Walls.Count == 2 && Has(r, 2, 0, 2, 50, 4) && Has(r, 0, 2, 100, 2, 4) && r.Doors.Count == 1 && Math.Abs(r.Doors[0].Width - 18) < 0.05,
                    $"a door beside an L corner: the corner's 2 walls, the door joining the nib to the rest — {Ws(r)}; {r.Doors.Count} door(s)");
            // (c) Two walls of different thickness on one flush face: two walls, each its own thickness and length (it read one).
            var f = new List<Stroke> { Ln(0, 0, 100, 0), Ln(100, 0, 200, 0), Ln(0, 6, 100, 6), Ln(100, 4, 200, 4), Ln(100, 4, 100, 6) };
            foreach (var r in Both(f))
                Ok(r.Walls.Count == 2 && Has(r, 0, 3, 100, 3, 6) && Has(r, 100, 2, 200, 2, 4), $"a flush face, two thicknesses: 2 walls, 6 and 4 — {Ws(r)}");
            // (d) A cut column (a closed square in the wall weight) beside a wall: a column, not a wall.
            var col = new List<Stroke> { Ln(0, 0, 100, 0), Ln(0, 6, 100, 6), Ln(300, 300, 308, 300), Ln(308, 300, 308, 308), Ln(308, 308, 300, 308), Ln(300, 308, 300, 300) };
            foreach (var r in Both(col))
                Ok(r.Walls.Count == 1 && Has(r, 0, 3, 100, 3, 6) && r.Columns >= 1, $"a cut column: no wall, counted a column — {Ws(r)}; columns {r.Columns}");
            // (e) A double door: two swings of half the gap hinged at both ends — one door of the whole gap, the wall joined through it.
            var dd = new List<Stroke> { Ln(0, 0, 50, 0), Ln(0, 6, 50, 6), Ln(50, 0, 50, 6), Ln(86, 0, 150, 0), Ln(86, 6, 150, 6), Ln(86, 0, 86, 6) };
            var leaves = new List<Curve> { Bz(50, 6, 18, 0, 90), Bz(86, 6, 18, 90, 90) };
            foreach (var r in Both(dd, leaves))
                Ok(r.Walls.Count == 1 && r.Doors.Count == 1 && Math.Abs(r.Doors[0].Width - 36) < 0.05 && r.Doors[0].Leaves == 2, $"a double door: 1 wall, 1 door 36 wide of 2 leaves — {Ws(r)}");
            // (f) A nib shorter than the wall is thick still reads (its outer face runs on to the corner), and the door joins it on.
            var nib = new List<Stroke> { Ln(0, 0, 6, 0), Ln(6, 0, 6, 4), Ln(6, 4, 4, 4), Ln(4, 4, 4, 50), Ln(4, 50, 0, 50), Ln(0, 50, 0, 0),
                Ln(24, 0, 100, 0), Ln(100, 0, 100, 4), Ln(100, 4, 24, 4), Ln(24, 4, 24, 0) };
            foreach (var r in Both(nib, new List<Curve> { Bz(6, 4, 18, 0, 90) }))
                Ok(r.Doors.Count == 1 && Math.Abs(r.Doors[0].Width - 18) < 0.05 && Has(r, 0, 2, 100, 2, 4), $"a door beside a corner after a short nib: found, the nib joined on — {Ws(r)}; {r.Doors.Count} door(s)");
            // (f2) A door hinged on the corner wall's face, no nib: the door at the wall's end, the wall run on through it to the corner.
            var corner = new List<Stroke> { Ln(0, 0, 4, 0), Ln(4, 0, 4, 50), Ln(4, 50, 0, 50), Ln(0, 50, 0, 0), Ln(22, 0, 100, 0), Ln(100, 0, 100, 4), Ln(100, 4, 22, 4), Ln(22, 4, 22, 0) };
            foreach (var r in Both(corner, new List<Curve> { Bz(4, 4, 18, 0, 90) }))
                Ok(r.Doors.Count == 1 && Math.Abs(r.Doors[0].Width - 18) < 0.05 && Has(r, 4, 2, 100, 2, 4) && Has(r, 2, 0, 2, 50, 4),
                    $"a door hinged on a corner wall: found at the wall's end, the wall run on to the corner — {Ws(r)}; {r.Doors.Count} door(s)");
            // (g) A swing not set square to the wall (its strike and leaf off the wall's line and its normal) is no door, even of the
            // gap's radius at the gap's end.
            foreach (var r in Both(nib, new List<Curve> { Bz(24, 4, 18, 45, 90) }))
                Ok(r.Doors.Count == 0 && r.Walls.Count == 3, $"a swing not set square to the wall's line is no door of it — {r.Doors.Count} door(s), {r.Walls.Count} walls");
            // (h) Tags: a size word is a door's only when each is the other's nearest within 1.5 radii; one past that reach is none.
            var door = new List<Stroke> { Ln(0, 0, 50, 0), Ln(0, 6, 50, 6), Ln(50, 0, 50, 6), Ln(68, 0, 150, 0), Ln(68, 6, 150, 6), Ln(68, 0, 68, 6) };
            var arc = new List<Curve> { Bz(50, 6, 18, 0, 90) };
            var near = An(door, arc, new List<Word> { new Word { Text = "900x2100", X = 59, Y = 14 }, new Word { Text = "1200x1500", X = 59, Y = 40 } });
            Ok(near.Doors.Count == 1 && near.Doors[0].TagW == 900, $"the nearer size word is the door's ({near.Doors.FirstOrDefault()?.TagW})");
            var far = An(door, arc, new List<Word> { new Word { Text = "900x2100", X = 59, Y = 40 } });
            Ok(far.Doors.Count == 1 && far.Doors[0].TagW == null, "a size word past 1.5 radii is no door's");
            var arabic = An(door, arc, new List<Word> { new Word { Text = "٩٠٠x٢١٠٠", X = 59, Y = 14 } });
            Ok(arabic.Doors.Count == 1 && arabic.Doors[0].TagW == null, "a size in other digits is not read, and nothing throws");
            // (i) A swing written as two Beziers, each with its own move: one arc, one door.
            var split = An(door, new List<Curve> { Bz(50, 6, 18, 0, 45), Bz(50, 6, 18, 45, 45) });
            Ok(split.Doors.Count == 1 && split.Walls.Count == 1, "a swing in two pieces is one door");
            // (j) A border and a title block drawn heaviest: the walls are read from the weight that pairs into walls.
            var sheet = new List<Stroke> { Ln(10, 10, 287, 10, 1), Ln(287, 10, 287, 200, 1), Ln(287, 200, 10, 200, 1), Ln(10, 200, 10, 10, 1),
                Ln(225, 12, 285, 12, 1), Ln(225, 19, 285, 19, 1), Ln(225, 26, 285, 26, 1), Ln(225, 33, 285, 33, 1) };
            for (int k = 0; k < 5; k++) { sheet.Add(Ln(20, 40 + 30 * k, 200, 40 + 30 * k)); sheet.Add(Ln(20, 46 + 30 * k, 200, 46 + 30 * k)); }
            for (int k = 0; k < 3; k++) { sheet.Add(Ln(30 + 60 * k, 52, 30 + 60 * k, 190)); sheet.Add(Ln(36 + 60 * k, 52, 36 + 60 * k, 190)); }
            var rs = An(sheet);
            Ok(rs.WallWeight == 0.7 && rs.Walls.Count == 8 && rs.Walls.All(w => Math.Abs(w.Thickness - 6) < 0.01) && rs.Weights.Any(w => w.weight == 1 && !w.read),
                $"a heaviest border and title block pairing into under 30 % of the walls: walls at 0.7 only ({rs.WallWeight}, {Ws(rs)})");
            // ---- the skeptic's cases (a second review of the new pairing) ----
            Stroke[] Rect(double x0, double y0, double x1, double y1) => new[] { Ln(x0, y0, x1, y0), Ln(x1, y0, x1, y1), Ln(x1, y1, x0, y1), Ln(x0, y1, x0, y0) };
            // (l) A cavity wall (four lines: two leaves and the cavity): the two leaves, never the cavity.
            foreach (var r in Both(new List<Stroke> { Ln(0, 0, 200, 0), Ln(0, 2.05, 200, 2.05), Ln(0, 4.05, 200, 4.05), Ln(0, 6.05, 200, 6.05),
                Ln(0, 0, 0, 2.05), Ln(200, 0, 200, 2.05), Ln(0, 4.05, 0, 6.05), Ln(200, 4.05, 200, 6.05) }))
                Ok(r.Walls.Count == 2 && Has(r, 0, 1.025, 200, 1.025, 2.05) && Has(r, 0, 5.05, 200, 5.05, 2), $"a cavity wall: its two leaves, not the cavity — {Ws(r)}");
            // (m) Two walls with a void between: the two walls; a lining against a wall: both the wall and the lining.
            foreach (var r in Both(new List<Stroke> { Ln(0, 0, 200, 0), Ln(0, 6, 200, 6), Ln(0, 10, 200, 10), Ln(0, 14, 200, 14), Ln(0, 0, 0, 6), Ln(200, 0, 200, 6), Ln(0, 10, 0, 14), Ln(200, 10, 200, 14) }))
                Ok(r.Walls.Count == 2 && Has(r, 0, 3, 200, 3, 6) && Has(r, 0, 12, 200, 12, 4), $"two walls with a void between: the two walls — {Ws(r)}");
            foreach (var r in Both(new List<Stroke> { Ln(0, 0, 200, 0), Ln(0, 6, 200, 6), Ln(0, 7, 200, 7) }))
                Ok(r.Walls.Count == 2 && Has(r, 0, 3, 200, 3, 6) && Has(r, 0, 6.5, 200, 6.5, 1), $"a lining against a wall: the wall and the lining — {Ws(r)}");
            // (n) Piers between windows, each a closed outline on the wall's line: walls, not columns.
            var piers = new List<Stroke>();
            double[] cuts = { 0, 40, 80, 100, 140, 160, 200, 220, 260, 300 };
            for (int i = 0; i + 1 < cuts.Length; i += 2) piers.AddRange(Rect(cuts[i], 0, cuts[i + 1], 6));
            foreach (var r in Both(piers)) Ok(r.Walls.Count == 5 && r.Columns == 0, $"piers between windows: 5 walls, no column — {Ws(r)}; columns {r.Columns}");
            // (o) Two walls crossing, each cut at the other: both run through.
            foreach (var r in Both(new List<Stroke> { Ln(0, 0, 98, 0), Ln(102, 0, 200, 0), Ln(0, 4, 98, 4), Ln(102, 4, 200, 4), Ln(0, 0, 0, 4), Ln(200, 0, 200, 4),
                Ln(98, -100, 98, 0), Ln(98, 4, 98, 100), Ln(102, -100, 102, 0), Ln(102, 4, 102, 100), Ln(98, -100, 102, -100), Ln(98, 100, 102, 100) }))
                Ok(r.Walls.Count == 2 && Has(r, 0, 2, 200, 2, 4) && Has(r, 100, -100, 100, 100, 4), $"a crossing: both walls run through — {Ws(r)}");
            // (p) External walls in one pen, more partitions in a lighter one: both read.
            var pens = new List<Stroke> { Ln(0, 0, 200, 0), Ln(200, 0, 200, 150), Ln(200, 150, 0, 150), Ln(0, 150, 0, 0), Ln(6, 6, 194, 6), Ln(194, 6, 194, 144), Ln(194, 144, 6, 144), Ln(6, 144, 6, 6) };
            foreach (var px in new[] { 25.0, 45, 65, 85, 105, 125, 145, 165 }) { pens.Add(Ln(px - 1, 6, px - 1, 144, 0.5)); pens.Add(Ln(px + 1, 6, px + 1, 144, 0.5)); }
            var rp = An(pens);
            Ok(rp.Walls.Count == 12 && rp.Walls.Count(w => Math.Abs(w.Thickness - 6) < 0.01) == 4, $"two pens: 4 external walls and 8 partitions — {rp.Walls.Count} walls, weights {string.Join(", ", rp.Weights.Select(w => $"{w.weight}:{w.paired}:{w.read}"))}");
            // (q) A framed door (an 826 leaf in a 926 opening): one wall through, the door the opening's width at its middle.
            var framed = new List<Stroke> { Ln(0, 0, 50, 0), Ln(0, 4, 50, 4), Ln(50, 0, 50, 4), Ln(68.5, 0, 150, 0), Ln(68.5, 4, 150, 4), Ln(68.5, 0, 68.5, 4) };
            foreach (var r in Both(framed, new List<Curve> { Bz(51, 4, 16.5, 0, 90) }))
                Ok(r.Walls.Count == 1 && r.Doors.Count == 1 && Math.Abs(r.Doors[0].Width - 18.5) < 0.05 && Math.Abs(r.Doors[0].X - 59.25) < 0.05, $"a framed door: one wall, the door 18.5 wide at 59.25 — {Ws(r)}");
            // (r) A threshold line on one face across the door: still a door, in one wall.
            foreach (var r in Both(door.Concat(new[] { Ln(50, 0, 68, 0) }).ToList(), arc))
                Ok(r.Walls.Count == 1 && r.Doors.Count == 1 && Math.Abs(r.Doors[0].Width - 18) < 0.05, $"a threshold line across a door: one wall, one door — {Ws(r)}; {r.Doors.Count} door(s)");
            // (s) A column in a wall's line, its outline full: one column, counted once; the wall stops at it.
            foreach (var r in Both(new List<Stroke> { Ln(0, 0, 100, 0), Ln(108, 0, 200, 0), Ln(0, 4, 100, 4), Ln(108, 4, 200, 4), Ln(0, 0, 0, 4), Ln(200, 0, 200, 4),
                Ln(100, -2, 108, -2), Ln(100, 6, 108, 6), Ln(100, -2, 100, 6), Ln(108, -2, 108, 6) }))
                Ok(r.Walls.Count == 2 && r.Columns == 1, $"a column in a wall's line: 2 walls, 1 column — {Ws(r)}; columns {r.Columns}");
            // (t) A face that runs on alone far past its partner: the wall stops with its partner — no PAIR_MAX of wall it does not have.
            foreach (var r in Both(new List<Stroke> { Ln(0, 0, 200, 0), Ln(0, 6, 60, 6), Ln(0, 0, 0, 6) }))
                Ok(r.Walls.Count == 1 && Has(r, 0, 3, 60, 3, 6), $"a face running on alone: the wall stops at its partner's end — {Ws(r)}");
            // (u) A lone heavy line 14 paper mm beyond a wall's inner face (a screen) is no wall's face — never a 700 mm wall over the room.
            foreach (var r in Both(new List<Stroke> { Ln(0, 0, 200, 0), Ln(0, 6, 200, 6), Ln(0, 0, 0, 6), Ln(200, 0, 200, 6), Ln(0, 20, 200, 20) }))
                Ok(r.Walls.Count == 1 && Has(r, 0, 3, 200, 3, 6), $"a lone line beside a wall: the wall only — {Ws(r)}");
            // (v) A flush outer face whose wall steps from 300 to 200 at a T: the two walls meet at the T wall's centreline (no notch).
            foreach (var r in Both(new List<Stroke> { Ln(0, 0, 400, 0), Ln(0, 6, 94, 6), Ln(0, 0, 0, 6), Ln(100, 4, 400, 4), Ln(400, 0, 400, 4),
                Ln(100, 4, 100, 6), Ln(94, 6, 94, 200), Ln(100, 6, 100, 200), Ln(94, 200, 100, 200) }))
                Ok(Has(r, 0, 3, 97, 3, 6) && Has(r, 97, 2, 400, 2, 4), $"a flush face stepping at a T: the walls meet at the T's centreline — {Ws(r)}");
            // (k) Speed: 20,000 wall strokes (500 walls, each face in 20 pieces, shuffled) read well inside the bridge's bound.
            var big = new List<Stroke>();
            for (int k = 0; k < 500; k++) for (int p = 0; p < 20; p++) { big.Add(Ln(p * 10, 10 * k, p * 10 + 10, 10 * k)); big.Add(Ln(p * 10, 10 * k + 4, p * 10 + 10, 10 * k + 4)); }
            var rnd = new Random(7);
            big = big.OrderBy(_ => rnd.Next()).ToList();
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var rb = An(big);
            Ok(rb.Walls.Count == 500 && sw.Elapsed.TotalSeconds < 10, $"20,000 strokes: {rb.Walls.Count} walls in {sw.Elapsed.TotalSeconds:0.0} s");
        }

        static int Main()
        {
            string root = Root(), fx = Path.Combine(root, "drawing", "fixtures");
            string plan = Path.Combine(fx, "drill-plan-L00.pdf");
            var expected = JsonNode.Parse(File.ReadAllText(Path.Combine(fx, "drill-plan-L00.expected.json")));

            // 1. The drill plan: 5 walls (the south wall and the partition each ONE wall through their door), 2 doors with their tags.
            var r = Run(("ev-0007", plan, Sha(plan)));
            Ok((string)r["status"] == "done" && (string)r["version"] == "0.1.0", "the drill plan is read: done, sentinel-drawing 0.1.0");
            var walls = Kind(r, "wall"); var doors = Kind(r, "door");
            Ok(walls.Length == 5, $"5 walls (got {walls.Length}) — the border, title block and marks are no wall, the jambs no wall");
            Ok(doors.Length == 2, $"2 doors (got {doors.Length})");
            var hostOf = new System.Collections.Generic.Dictionary<string, string>();
            foreach (var e in expected["walls"].AsArray())
            {
                var w = walls.FirstOrDefault(c => {
                    var lc = c["geometry"]["LocationCurve"];
                    return (Dist(lc["start"], e["start"]) < 0.1 && Dist(lc["end"], e["end"]) < 0.1) || (Dist(lc["start"], e["end"]) < 0.1 && Dist(lc["end"], e["start"]) < 0.1);
                });
                Ok(w != null, $"wall {e["name"]}: its centreline {e["start"].ToJsonString()} → {e["end"].ToJsonString()} (paper mm, within 0.1 = 5 mm at 1:50)");
                if (w == null) continue;
                hostOf[(string)e["name"]] = (string)w["cid"];
                double t = D(w["measured"]["thickness_paper_mm"]);
                Ok(Math.Abs(t - D(e["thickness_paper_mm"])) <= 0.02, $"wall {e["name"]}: thickness {t} paper mm = {t * 50:0} mm at 1:50 (expected {e["thickness_mm_at_1_50"]}, within 1 mm)");
            }
            foreach (var e in expected["doors"].AsArray())
            {
                var d = doors.FirstOrDefault(c => Dist(c["geometry"]["Location"], e["location"]) < 0.2);
                Ok(d != null, $"door in the {e["host"]} wall at {e["location"].ToJsonString()} (within 0.2 paper mm = 10 mm)");
                if (d == null) continue;
                Ok(Math.Abs(D(d["measured"]["width_paper_mm"]) - D(e["width_paper_mm"])) <= 0.2, $"door in the {e["host"]} wall: width {d["measured"]["width_paper_mm"]} paper mm (expected {e["width_paper_mm"]})");
                Ok(hostOf.TryGetValue((string)e["host"], out var h) && (string)d["geometry"]["host"] == h, $"door in the {e["host"]} wall: hosted in the wall its gap splits ({d["geometry"]["host"]})");
                Ok(D(d["measured"]["tag_width_mm"]) == D(e["tag_width_mm"]) && D(d["measured"]["tag_height_mm"]) == D(e["tag_height_mm"]), $"door in the {e["host"]} wall: its tag {d["measured"]["tag_width_mm"]}x{d["measured"]["tag_height_mm"]}");
                var dir = d["geometry"]["direction"];
                Ok(Math.Abs(D(dir[0]) - D(e["direction"][0])) < 0.01 && Math.Abs(D(dir[1]) - D(e["direction"][1])) < 0.01, $"door in the {e["host"]} wall: swings {dir.ToJsonString()}");
                var host = walls.First(w => (string)w["cid"] == (string)d["geometry"]["host"]);
                var s = host["geometry"]["LocationCurve"]["start"];
                Ok(Math.Abs(Dist(s, d["geometry"]["Location"]) - D(d["geometry"]["along_paper_mm"])) < 0.01, "its along_paper_mm is the distance from its host's start");
            }
            var all = r["result"]["candidates"].AsArray();
            Ok(all.Select(c => (string)c["cid"]).Distinct().Count() == all.Count, "every cid is unique");
            Ok(all.All(c => (string)c["geometry"]["units"] == "paper_mm" && (int)c["geometry"]["page"] == 1), "every candidate says paper_mm, page 1");
            Ok(all.All(c => c["evidence"].AsArray().Select(x => (string)x).SequenceEqual(new[] { "ev-0007#page-1" })), "every candidate's evidence is ev-0007#page-1");
            Ok(all.All(c => c["type"] == null && c["geometry"]["TypeName"] == null), "no candidate carries a type");
            Ok(all.All(c => ((string)c["cid"]).StartsWith("drawing-ev-0007-p1-wall-")), "cids are drawing-<item>-p1-wall-N[-door-M]");
            var it = r["result"]["receipt"]["items"][0];
            Ok((int)it["pages"] == 1 && (int)it["page_read"] == 1 && it["why"] == null, "the receipt: 1 page, page 1 read, no why");
            Ok(Math.Abs(D(it["wall_weight_pt"]) - 0.7) < 1e-6, $"the receipt: walls in the page's heaviest weight, 0.7 pt (got {it["wall_weight_pt"]})");
            Ok(Math.Abs(D(it["size_paper_mm"][0]) - 297.04) < 0.05 && Math.Abs(D(it["size_paper_mm"][1]) - 209.9) < 0.05, $"the receipt: the page's size in paper mm {it["size_paper_mm"].ToJsonString()}");
            Ok(r["result"]["derived"].AsArray().Count == 0 && r["refused"].AsArray().Count == 0, "no derived, nothing refused");
            Ok(r["tools"].AsArray().Any(t => (string)t["name"] == "PdfPig" && (string)t["version"] == "0.1.16" && (string)t["licence"] == "Apache-2.0"), "tools name PdfPig 0.1.16, Apache-2.0");

            // 2. One line weight: walls cannot be told from the title block — nothing, and the receipt says why.
            string one = Path.Combine(fx, "variants", "one-weight.pdf");
            var r1 = Run(("ev-0001", one, Sha(one)));
            Ok((string)r1["status"] == "done" && r1["result"]["candidates"].AsArray().Count == 0, "one line weight: done, no candidate");
            Ok(((string)r1["result"]["receipt"]["items"][0]["why"] ?? "").StartsWith("one line weight on the page"), $"one line weight: the receipt says why ({r1["result"]["receipt"]["items"][0]["why"]})");

            // 3. The partition's swing moved into the east room: an arc with no wall gap of its radius is no door; a gap with no arc
            // is no door, and its two walls stay two.
            string stray = Path.Combine(fx, "variants", "stray-arc.pdf");
            var r2 = Run(("ev-0001", stray, Sha(stray)));
            Ok(Kind(r2, "wall").Length == 6 && Kind(r2, "door").Length == 1, $"stray arc: 6 walls (the partition two) and 1 door (got {Kind(r2, "wall").Length} / {Kind(r2, "door").Length})");
            Ok(Kind(r2, "door").All(d => Dist(d["geometry"]["Location"], expected["doors"][0]["location"]) < 0.2), "stray arc: the one door is the south wall's");

            // 4. Two pages: page 1 is read and the receipt says there were two.
            string two = Path.Combine(fx, "variants", "two-page.pdf");
            var r3 = Run(("ev-0001", two, Sha(two)));
            var i3 = r3["result"]["receipt"]["items"][0];
            Ok((int)i3["pages"] == 2 && (int)i3["page_read"] == 1 && Kind(r3, "wall").Length == 5 && Kind(r3, "door").Length == 2, "two pages: page 1 read (5 walls, 2 doors), pages 2");

            // 5. Not the admitted bytes; not a PDF; a mix (the good one read, the bad one listed); a missing file.
            var r4 = Run(("ev-0001", plan, new string('0', 64)));
            Ok((string)r4["status"] == "refused" && r4["result"] == null && (string)r4["refused"][0]["reason"] == "not the bytes admitted (sha256)", $"a changed file: refused, not the bytes admitted ({r4["refused"].ToJsonString()})");
            string txt = Path.Combine(Path.GetTempPath(), "sentinel-drawing-check-not-a-pdf.pdf");
            File.WriteAllText(txt, "this is not a PDF");
            var r5 = Run(("ev-0002", txt, Sha(txt)));
            Ok((string)r5["status"] == "refused" && (string)r5["refused"][0]["reason"] == "not a PDF PdfPig can open", $"not a PDF: refused in words ({r5["refused"].ToJsonString()})");
            var r6 = Run(("ev-0001", plan, Sha(plan)), ("ev-0002", txt, Sha(txt)));
            Ok((string)r6["status"] == "done" && r6["refused"].AsArray().Count == 1 && (string)r6["refused"][0]["id"] == "ev-0002"
               && r6["result"]["candidates"].AsArray().All(c => (string)c["evidence"][0] == "ev-0001#page-1"), "a mix: the PDF read, the other refused, nothing from it");
            File.Delete(txt);
            var r7 = Run(("ev-0001", Path.Combine(fx, "no-such.pdf"), new string('0', 64)));
            Ok((string)r7["status"] == "refused" && ((string)r7["refused"][0]["reason"]).StartsWith("the file cannot be read") && !((string)r7["refused"][0]["reason"]).Contains("no-such"), "a missing file: refused in words that name no path");

            Review();
            Console.WriteLine(fails == 0 ? "drawing-check: all passed" : $"drawing-check: {fails} FAILED");
            return fails == 0 ? 0 : 1;
        }
    }
}
