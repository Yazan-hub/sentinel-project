using System.Text.Json;
using Sentinel.Workflow;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    const string Source = "Sentinel_SP.txt in the temp folder: a scratch file where the heal defines each missing parameter, not an office shared-parameter file";

    static string[] Names(string stem, int n) => Enumerable.Range(1, n).Select(i => stem + i.ToString("00")).ToArray();
    static JsonElement Row(object payload) => JsonDocument.Parse(JsonSerializer.Serialize(payload)).RootElement;

    static int Main()
    {
        Console.WriteLine("Heal Loaded Families — one family_heal ledger row per run\n");

        // ── 1. the body POST /cde/:key/audit receives for one run (GovernedNotify serializes it the same way) ──
        var small = JsonSerializer.Serialize(HealRecord.Payload(4, 1, new[] { "AST_Door_Single" }, new[] { "AST_Stair_CAD" }, new[] { "AST_Locked" }, "tester"));
        Ok(small == "{\"entity_type\":\"family_heal\",\"actor\":\"revit:tester\",\"action\":\"Family heal: 1 healed, 1 for a human, 1 failed of 4\","
                  + "\"new_value\":{\"scanned\":4,\"clean\":1,\"healed\":[\"AST_Door_Single\"],\"human\":[\"AST_Stair_CAD\"],\"failed\":[\"AST_Locked\"],"
                  + "\"healed_total\":1,\"human_total\":1,\"failed_total\":1,\"shared_parameter_source\":\"" + Source + "\",\"source\":\"revit\"}}",
           "a run is one family_heal row: counts, names, totals, the shared-parameter file, source revit");

        // ── 2. a 212-family run is one row, not a 212-name list; the totals stay true ──────────────────────────
        var big = Row(HealRecord.Payload(212, 101, Names("AST_Healed_", 60), Names("AST_Human_", 51), Array.Empty<string>(), "tester"));
        var v = big.GetProperty("new_value");
        Ok(HealRecord.MaxNames == 50 && v.GetProperty("healed").EnumerateArray().Select(e => e.GetString()).SequenceEqual(Names("AST_Healed_", 50)),
           "60 healed → the first 50 names, in scan order");
        Ok(v.GetProperty("healed_total").GetInt32() == 60 && big.GetProperty("action").GetString() == "Family heal: 60 healed, 51 for a human, 0 failed of 212",
           "…beside healed_total 60, and the action counts all of them");
        Ok(v.GetProperty("human").GetArrayLength() == 50 && v.GetProperty("human_total").GetInt32() == 51 && v.GetProperty("failed").GetArrayLength() == 0,
           "each outcome is capped on its own (51 for a human → 50 names, total 51)");

        // ── 3. the file is named only when a family was healed from it ────────────────────────────────────────
        var none = Row(HealRecord.Payload(3, 2, Array.Empty<string>(), new[] { "AST_Stair_CAD" }, Array.Empty<string>(), "tester"));
        Ok(none.GetProperty("new_value").GetProperty("shared_parameter_source").GetString() == "not named", "nothing healed → shared_parameter_source \"not named\"");
        var empty = Row(HealRecord.Payload(0, 0, Array.Empty<string>(), Array.Empty<string>(), Array.Empty<string>(), "tester"));
        Ok(empty.GetProperty("action").GetString() == "Family heal: 0 healed, 0 for a human, 0 failed of 0", "a model with no editable family is still one row, of 0");

        // ── 4. the add-in's wiring (source scan, repo root found from the build output) ─────────────────────────
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 8 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
            root = Path.GetFullPath(Path.Combine(root, ".."));
        var processor = File.ReadAllText(Path.Combine(root, "SentinelAddin", "Workflow", "FamilyProcessor.cs"));
        var command = File.ReadAllText(Path.Combine(root, "SentinelAddin", "Commands.Phase2.cs"));
        Ok(processor.Contains("Path.Combine(Path.GetTempPath(), HealRecord.SharedParameterFile)") && !processor.Contains("\"Sentinel_SP.txt\""),
           "the heal injects through the file the row names (one spelling)");
        Ok(processor.Contains("ScanLoaded(Document doc,") && !processor.Contains("ActiveUIDocument"),
           "ScanLoaded heals the document it is handed, never the one in focus when the job runs");
        Ok(command.Contains("ProjectContext.For(doc).Key") && command.Contains("ScanLoaded(doc,")
           && command.Contains("GovernedNotify.Event(\"/audit\", payload, key)") && command.Contains("LedgerLine.Sentence(ledger)"),
           "Heal Loaded Families records the run on the key captured at command time and prints the ledger line");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
