#nullable disable
// MA-5a-3 — sentinel-drawing's job: the bridge's job JSON in, the result JSON out (the contract of sentinel-survey's jobs, design §6.9).
// Each item is a drawing the bridge admitted: its bytes re-hashed here against the sha256 the bridge sent (a file changed since admission
// is refused, never read), opened with PdfPig, page 1 read (PlanReader). Candidates carry no type and are proposed by nobody here: the
// scale and placement are MA-5a-4's 2-point alignment. Refusals are in words that name no path (the bridge shows them to a lead).
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using UglyToad.PdfPig;

namespace Sentinel.Drawing
{
    public static class DrawingJob
    {
        public const string NAME = "sentinel-drawing";
        public const string VERSION = "0.1.0";

        static double R(double v) => Math.Round(v, 3) + 0.0; // + 0.0: never "-0" in the JSON
        static JsonArray P(double x, double y) => new JsonArray(R(x), R(y));

        public static JsonObject Run(JsonNode job)
        {
            var started = DateTime.UtcNow;
            var cpu0 = Process.GetCurrentProcess().TotalProcessorTime;
            var refused = new JsonArray();
            var candidates = new JsonArray();
            var receiptItems = new JsonArray();
            foreach (var it in job["items"].AsArray())
            {
                string id = (string)it["id"], path = (string)it["path"], want = ((string)it["sha256"] ?? "").ToLowerInvariant();
                string why = (string)it["kind"] != "drawing" ? "not a drawing item" : null;
                byte[] bytes = null;
                if (why == null)
                {
                    try { bytes = File.ReadAllBytes(path); }
                    catch (Exception e) { why = $"the file cannot be read on this PC ({e.GetType().Name})"; }
                }
                if (why == null && Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant() != want) why = "not the bytes admitted (sha256)";
                if (why != null) { refused.Add(new JsonObject { ["id"] = id, ["reason"] = why }); continue; }
                PdfDocument doc;
                try { doc = PdfDocument.Open(bytes); }
                catch { refused.Add(new JsonObject { ["id"] = id, ["reason"] = "not a PDF PdfPig can open" }); continue; }
                using (doc)
                {
                    Reading reading; int pages; double w, h;
                    try
                    {
                        pages = doc.NumberOfPages;
                        var page = doc.GetPage(1);
                        (w, h) = (page.Width * PlanReader.MM_PER_PT, page.Height * PlanReader.MM_PER_PT);
                        reading = PlanReader.Read(page);
                    }
                    catch (Exception e) { refused.Add(new JsonObject { ["id"] = id, ["reason"] = $"page 1 could not be read ({e.GetType().Name})" }); continue; }
                    Add(candidates, id, reading);
                    var ri = new JsonObject
                    {
                        ["id"] = id, ["pages"] = pages, ["page_read"] = 1, ["size_paper_mm"] = P(w, h), ["strokes"] = reading.Strokes,
                        ["wall_weight_pt"] = reading.WallWeight.HasValue ? R(reading.WallWeight.Value) : null, ["faces"] = reading.Faces,
                        ["unpaired_faces"] = reading.Unpaired, ["arcs"] = reading.Arcs, ["walls"] = reading.Walls.Count, ["doors"] = reading.Doors.Count,
                        ["columns"] = reading.Columns,
                        ["weights"] = new JsonArray(reading.Weights.Select(x => (JsonNode)new JsonObject { ["pt"] = R(x.weight), ["paired_paper_mm"] = R(x.paired) }).ToArray()),
                    };
                    if (reading.Why != null) ri["why"] = reading.Why;
                    receiptItems.Add(ri);
                }
            }
            var tools = new JsonArray(
                new JsonObject { ["name"] = NAME, ["version"] = VERSION, ["licence"] = "proprietary" },
                new JsonObject { ["name"] = "PdfPig", ["version"] = "0.1.16", ["licence"] = "Apache-2.0" },
                new JsonObject { ["name"] = ".NET", ["version"] = Environment.Version.ToString(), ["licence"] = "MIT" });
            var outcome = new JsonObject { ["status"] = receiptItems.Count > 0 ? "done" : "refused", ["version"] = VERSION, ["tools"] = tools, ["refused"] = refused };
            if (receiptItems.Count > 0)
                outcome["result"] = new JsonObject
                {
                    ["candidates"] = candidates, ["derived"] = new JsonArray(),
                    ["receipt"] = new JsonObject
                    {
                        ["started"] = started.ToString("o"), ["finished"] = DateTime.UtcNow.ToString("o"),
                        ["cpu_s"] = R((Process.GetCurrentProcess().TotalProcessorTime - cpu0).TotalSeconds), ["items"] = receiptItems,
                    },
                };
            return outcome;
        }

        /// <summary>One item's walls and doors as candidates (paper mm, page 1, evidence &lt;item&gt;#page-1), in the reader's order.</summary>
        static void Add(JsonArray candidates, string id, Reading r)
        {
            string Cid(int n) => $"drawing-{id}-p1-wall-{n + 1}";
            for (int n = 0; n < r.Walls.Count; n++)
            {
                var w = r.Walls[n];
                var faces = new JsonArray(w.Faces.Select(f => (JsonNode)new JsonArray(R(f[0]), R(f[1]), R(f[2]), R(f[3]))).ToArray());
                candidates.Add(new JsonObject
                {
                    ["cid"] = Cid(n), ["kind"] = "wall",
                    ["geometry"] = new JsonObject { ["LocationCurve"] = new JsonObject { ["start"] = P(w.X1, w.Y1), ["end"] = P(w.X2, w.Y2) }, ["faces"] = faces, ["page"] = 1, ["units"] = "paper_mm" },
                    ["measured"] = new JsonObject { ["length_paper_mm"] = R(Math.Sqrt((w.X2 - w.X1) * (w.X2 - w.X1) + (w.Y2 - w.Y1) * (w.Y2 - w.Y1))), ["thickness_paper_mm"] = R(w.Thickness) },
                    ["evidence"] = new JsonArray($"{id}#page-1"),
                });
            }
            foreach (var host in r.Doors.GroupBy(d => d.Host))
            {
                int m = 0;
                foreach (var d in host)
                {
                    var measured = new JsonObject { ["width_paper_mm"] = R(d.Width) };
                    if (d.TagW.HasValue) { measured["tag_width_mm"] = d.TagW.Value; measured["tag_height_mm"] = d.TagH.Value; }
                    candidates.Add(new JsonObject
                    {
                        ["cid"] = $"{Cid(d.Host)}-door-{++m}", ["kind"] = "door",
                        ["geometry"] = new JsonObject
                        {
                            ["host"] = Cid(d.Host), ["Location"] = P(d.X, d.Y), ["direction"] = P(d.Ux, d.Uy), ["along_paper_mm"] = R(d.Along),
                            ["swing_centre"] = P(d.Cx, d.Cy), ["leaves"] = d.Leaves, ["page"] = 1, ["units"] = "paper_mm",
                        },
                        ["measured"] = measured,
                        ["evidence"] = new JsonArray($"{id}#page-1"),
                    });
                }
            }
        }
    }
}
