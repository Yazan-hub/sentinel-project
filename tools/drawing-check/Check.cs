// MA-5a-3 — the sentinel-drawing check. Run: dotnet run --project tools/drawing-check
// Drives DrawingJob.Run (the worker's whole contract, stdin JSON → stdout JSON, without the process) on the drill plan and its
// variants, and holds the reading to drawing/fixtures/drill-plan-L00.expected.json.
using System;
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

            Console.WriteLine(fails == 0 ? "drawing-check: all passed" : $"drawing-check: {fails} FAILED");
            return fails == 0 ? 0 : 1;
        }
    }
}
