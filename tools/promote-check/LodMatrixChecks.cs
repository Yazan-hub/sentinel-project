#nullable disable
using System.Text.Json.Nodes;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 28. MA-2b: the lod_matrix twin — LodMatrix.FromBody against the cases sentinel-core's parseLodMatrix and the bridge's
    //        install check read (WebApp/bridge/fixtures/lod-matrix/cases.json): the same bodies accepted and refused, in the
    //        same words, with the same stage map (D18), snap (D16) and properties. This section is the design's "tools/lod-check". ─────
    static void LodMatrixParityChecks()
    {
        Console.WriteLine("\nMA-2b — lod_matrix: the C# twin of parseLodMatrix (WebApp/bridge/fixtures/lod-matrix/cases.json)");
        var cases = JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "lod-matrix", "cases.json"))).AsArray();
        int same = 0;
        foreach (var c in cases)
        {
            var mx = LodMatrix.FromBody(c["body"].ToJsonString(), out var err);
            string want = (string)c["error"];
            bool ok = want != null
                ? mx == null && err == want
                : mx != null && err == null
                  && mx.StageMap.Count == 4 && c["stage_map"].AsObject().All(kv => mx.StageMap[kv.Key] == (string)kv.Value)
                  && mx.SnapMm.Count == c["snap"].AsObject().Count && c["snap"].AsObject().All(kv => mx.SnapMm[kv.Key] == (int)kv.Value)
                  && mx.Properties.Count == c["properties"].AsObject().Count
                  && c["properties"].AsObject().All(kv => mx.Properties[kv.Key].SequenceEqual(kv.Value.AsArray().Select(x => (string)x)));
            if (ok) same++;
            else Console.WriteLine($"        {(string)c["name"]}: got {(mx == null ? "error \"" + err + "\"" : "a matrix")}, want {(want == null ? "a matrix" : "\"" + want + "\"")}");
        }
        Ok(cases.Count == 26 && same == cases.Count, $"every shared lod_matrix case ({same}/{cases.Count}): the same answer and the same words as the TS reader");

        var demo = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd.json")), out var de);
        Ok(de == null && demo.SnapMm.Values.All(v => v == 0) && demo.StageMap["DD"] == "design" && demo.StageMap["CD"] == "coord",
           "the demo matrix (a v0 body): every row exact (snap 0), the D18 stage map");
        var snapped = JsonNode.Parse(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd.json"))).AsObject();
        snapped["rows"][0]["DD"]["type_snap_mm"] = 15;
        var notRun = new List<string>();
        var sm = LodMatrix.FromBody(snapped.ToJsonString(), out _);
        Ok(sm.SnapMm["Walls"] == 15 && sm.Dd["Walls"] == LodMatrix.V1["Walls"] && LodMatrix.Classes(sm, "lod_matrix@3", DdElementsMatcher(), notRun).Contains("Walls"),
           "a snap is kept apart from the DD rules: the Walls row still reads as Promote v1's, so Walls run (GN-4 untouched)");
        Ok(LodMatrix.Stages.SequenceEqual(new[] { "tender", "design", "coord", "constr", "hand", "oper" }) && LodMatrix.MatrixStages.SequenceEqual(new[] { "concept", "SD", "DD", "CD" }),
           "one stage list (D18): the project stages and the matrix stages, in order");
    }

    static GuidelineMatcher DdElementsMatcher() =>
        GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json")),
                                    File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
}
