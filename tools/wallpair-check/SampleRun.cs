#nullable disable
// Reads the double-line DXF sample, runs the REAL WallPairing + GuidelineMatcher on it, and prints what
// GhostBuilder will produce — the same two code paths the add-in uses, minus only Revit's placement call.
// Proves the sample end to end before it reaches Revit. Toggled by `dotnet run -- sample`.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Sentinel.GhostBuilder;

static class SampleRun
{
    public static int Run()
    {
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
            root = Path.GetFullPath(Path.Combine(root, ".."));

        string dxf = Path.Combine(root, "demo", "ghost-sample", "sample-wall-thickness.dxf");
        var byLayer = ReadDxfLines(dxf);

        var g = GuidelineMatcher.Load(
            Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json"),
            Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json"));

        Console.WriteLine("Sample run — real WallPairing + GuidelineMatcher on the double-line DXF\n");
        Console.WriteLine($"  guideline: {g.Standard}\n");

        int placed = 0, gaps = 0;
        foreach (var kv in byLayer.Where(k => k.Key.ToUpper().Contains("WALL")))
        {
            var walls = WallPairing.Pair(kv.Value);
            foreach (var w in walls)
            {
                string disc = kv.Key.Split('-', '_').First();
                var res = g.Resolve(new GuidelineInput
                { Category = "Walls", Layer = kv.Key, Discipline = disc, ThicknessMm = w.ThicknessMm });

                if (res.Confidence > 0)
                {
                    placed++;
                    Console.WriteLine($"  ✓ {kv.Key,-11} {w.ThicknessMm,4:0} mm  →  {res.Type}");
                }
                else
                {
                    gaps++;
                    Console.WriteLine($"  ⚠ {kv.Key,-11} {w.ThicknessMm,4:0} mm  →  GAP: {res.Why}");
                }
            }
        }
        Console.WriteLine($"\n  {placed} walls resolve to a real BDS type · {gaps} reported as gaps (not invented)");
        // The sample is designed for exactly 6 real + 1 gap.
        bool ok = placed == 6 && gaps == 1;
        Console.WriteLine(ok ? "\nSAMPLE OK — matches the designed expectation." : "\nSAMPLE MISMATCH.");
        return ok ? 0 : 1;
    }

    // Minimal R12 DXF LINE reader: group each layer's segments. Enough for this sample; not a general parser.
    static Dictionary<string, List<Seg>> ReadDxfLines(string path)
    {
        var res = new Dictionary<string, List<Seg>>(StringComparer.OrdinalIgnoreCase);
        string[] L = File.ReadAllLines(path);
        for (int i = 0; i + 1 < L.Length; i++)
        {
            if (L[i].Trim() != "0" || L[i + 1].Trim() != "LINE") continue;
            string layer = null; double x1 = 0, y1 = 0, x2 = 0, y2 = 0;
            for (int j = i + 2; j + 1 < L.Length && L[j].Trim() != "0"; j += 2)
            {
                string code = L[j].Trim(), val = L[j + 1].Trim();
                double d; double.TryParse(val, NumberStyles.Any, CultureInfo.InvariantCulture, out d);
                switch (code) { case "8": layer = val; break; case "10": x1 = d; break; case "20": y1 = d; break;
                                case "11": x2 = d; break; case "21": y2 = d; break; }
            }
            if (layer == null) continue;
            if (!res.TryGetValue(layer, out var list)) res[layer] = list = new List<Seg>();
            list.Add(new Seg(x1, y1, x2, y2));
        }
        return res;
    }
}
