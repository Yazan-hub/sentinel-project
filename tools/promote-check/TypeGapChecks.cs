#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 36. MA-2c: type-gap groups (design §6.4) — the held elements the office has no type for, grouped by category and the type
    //        wanted (else the size), the one type_gap row a Promote run posts, and its wiring (source scan) ───────────────────────
    static void TypeGapChecks()
    {
        Console.WriteLine("\nMA-2c — type-gap groups (TypeGaps, CommandReports.TypeGaps)");
        var m = DdElementsMatcher();
        m.CatalogLabel = "type_catalog@1 · office · fedcba987654…";
        var walls = new List<WallFact>
        {
            W("W 125a", "Generic - 125mm", "Exterior", 125, top: "Level 2"), W("W 125b", "Generic - 125mm", "Exterior", 125, top: "Level 2"),
            W("W 200", "Generic - 200mm", "Exterior", 200, top: "Level 2"), W("W 300s", "Generic - 300mm", "Exterior", 300, top: "Level 2", structural: true),
        };
        var others = new List<ElementFact>
        {
            Fl("F250", "Concrete 250mm", "Interior", 250),
            Dw("door", "D915", "M_Single-Flush", "0915 x 2134mm", 915, 2134), Dw("door", "D916", "M_Single-Flush", "0915 x 2134mm", 915, 2134),
        };
        var plans = V1(m, others, walls);
        var gaps = TypeGaps.Group(plans);
        Ok(gaps.Count == 3 && gaps.Select(g => g.Category).SequenceEqual(new[] { "Walls", "Floors", "Doors" }),
           "the run's gaps fall into three groups, in the order the plan meets them: " + string.Join(" | ", gaps.Select(TypeGaps.Line)));
        var w = gaps[0];
        Ok(w.Want == "BDS_EXT_ARC_CMU_125 mm" && w.Size == "125 mm" && w.Elements == 2 && w.Key == "Function Exterior"
           && w.Labels.SequenceEqual(new[] { "Level 1 · W 125a", "Level 1 · W 125b" }) && w.Nearest.Contains("BDS_EXT_ARC_CMU_100 mm"),
           "two walls the rule types to a size the catalogue lacks are one group: the type it wants, the size, the facts, each element, the nearest types");
        Ok(gaps[1].Want == "BDS_INT_STR_CONC_250 mm" && gaps[1].Elements == 1 && gaps[2].Want == null && gaps[2].Size == "915 x 2134 mm" && gaps[2].Elements == 2,
           "a floor's wanted type is its own group; two doors no catalogue type is named at are one group by their size");
        Ok(TypeGaps.Line(gaps[2]) == "Doors: no type named at 915 x 2134 mm — 2 element(s) (HostFunction Interior, Size W915 x H2134 mm)"
           && TypeGaps.Line(w).StartsWith("Walls: \"BDS_EXT_ARC_CMU_125 mm\" is not in the catalogue — 2 element(s) (Function Exterior); nearest: "),
           "each group in words: what is missing, how many, from what facts, and the nearest types");
        var p = plans.Single();
        Ok(p.Held.Where(h => h.Gap != null).Select(h => h.Label).OrderBy(x => x).SequenceEqual(new[] { "D915", "D916", "F250", "W 125a", "W 125b" })
           && p.Held.Any(h => h.Label == "W 300s" && h.Gap == null),
           "only a gap hold carries a gap: structure, a type not loaded, a rule the guideline lacks are holds of their own");
        var row = JsonSerializer.SerializeToNode(CommandReports.TypeGaps(gaps, m.CatalogLabel, "guideline@1 · office · 0123456789ab…", "yazan")).AsObject();
        var g0 = row["new_value"]["groups"][0].AsObject();
        Ok((string)row["entity_type"] == "type_gap" && (string)row["action"] == "type_gap:run · 3 group(s), 5 element(s)" && (int)row["new_value"]["groups_total"] == 3
           && (string)g0["category"] == "Walls" && (string)g0["want"] == "BDS_EXT_ARC_CMU_125 mm" && (string)g0["size"] == "125 mm" && (int)g0["elements"] == 2
           && g0["labels"].AsArray().Count == 2 && (string)row["new_value"]["catalog"] == m.CatalogLabel,
           "one type_gap row per run: every group with its category, the type it wants or its size, its count, labels and nearest types, and the catalogue that judged");
        Ok(TypeGaps.Group(V1(m, new List<ElementFact>(), new List<WallFact> { W("W 200", "Generic - 200mm", "Exterior", 200, top: "Level 2") })).Count == 0,
           "a run with no gap has no group (and posts no row)");

        string promote = File.ReadAllText(Repo("SentinelAddin", "Commands.PromoteWalls.cs"));
        int post = promote.IndexOf("GovernedNotify.Report(\"Type gaps\", CommandReports.TypeGaps(gaps, standards.CatalogSource.Label, standards.GuidelineSource.Label, actor), key);", StringComparison.Ordinal);
        Ok(post > 0 && post < promote.IndexOf("dlg.Show()", StringComparison.Ordinal) && promote.Contains("if (gaps.Count > 0) GovernedNotify.Report(\"Type gaps\"")
           && promote.Contains("lodText + propText + gapText +"),
           "Promote posts its type gaps on every run that has one — the read-only run too — and lists the groups in its dialog");
    }
}
