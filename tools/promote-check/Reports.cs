#nullable disable
using System.Text.Json;
using Sentinel.Coordination;

static partial class Check
{
    static JsonElement Json(object payload) => JsonDocument.Parse(JsonSerializer.Serialize(payload)).RootElement.Clone();

    // ── 16. MA-1a item 7: one report row per run of a modelling command, and the Doctor's buffer ────────────────
    static void ReportChecks()
    {
        Console.WriteLine("\nMA-1a item 7 — the modelling commands' report rows (CommandReports, DoctorBuffer)");
        const string sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        // The whole body, once: what POST /cde/:key/audit receives (GovernedNotify serializes it the same way).
        Ok(JsonSerializer.Serialize(CommandReports.Datum(2, 5, 1, sha, "lead@office.example")) ==
           "{\"entity_type\":\"datum\",\"actor\":\"lead@office.example\",\"action\":\"Datum from Drawings created 2 level(s) and 5 grid(s)\"," +
           "\"new_value\":{\"levels_created\":2,\"grids_created\":5,\"notes\":1,\"source_sha256\":\"" + sha + "\",\"source\":\"revit\"}}",
           "a Datum run is one datum row: the counts, the drawing's sha, source revit");
        Ok(Json(CommandReports.Datum(0, 3, 0, null, "a")).GetProperty("new_value").GetProperty("source_sha256").ValueKind == JsonValueKind.Null,
           "a Datum run that read imports already in the model names no file: source_sha256 null, never a made-up sha");

        var ids = Enumerable.Range(1, 60).Select(i => "cs-" + i.ToString("00")).ToList();
        var ghost = Json(CommandReports.GhostBuild("plan-L01.dxf", "GR-FFL", 41, 1, 2, 0, 3, 7, 1, ids, "a@b.example"));
        var gv = ghost.GetProperty("new_value");
        Ok(ghost.GetProperty("entity_type").GetString() == "ghost_build" && ghost.GetProperty("action").GetString() == "Ghost Builder placed 41 element(s) from plan-L01.dxf on GR-FFL",
           "a Ghost build is one ghost_build row, worded with its count, drawing and level");
        Ok(gv.GetProperty("placed").GetInt32() == 41 && gv.GetProperty("removed_by_revit").GetInt32() == 1 && gv.GetProperty("wall_gaps").GetInt32() == 2
           && gv.GetProperty("type_gaps").GetInt32() == 0 && gv.GetProperty("skipped").GetInt32() == 3 && gv.GetProperty("revit_warnings").GetInt32() == 7
           && gv.GetProperty("types_added").GetInt32() == 1, "…with every count the summary shows: placed, removed by Revit, gaps, skipped, warnings, types added");
        Ok(gv.GetProperty("changesets").GetArrayLength() == 50 && gv.GetProperty("changesets_total").GetInt32() == 60 && CommandReports.MaxNames == 50,
           "60 changesets → the first 50 ids beside the true total");

        var massing = Json(CommandReports.Massing(12, 0, 4, 0, 2, 0, null, "a"));
        Ok(massing.GetProperty("entity_type").GetString() == "massing" && massing.GetProperty("action").GetString() == "Photo Massing placed 12 element(s)"
           && massing.GetProperty("new_value").GetProperty("wall_gaps").GetInt32() == 4 && massing.GetProperty("new_value").GetProperty("images_sha256").ValueKind == JsonValueKind.Null,
           "a Massing build is one massing row; no image sha when the numbers are the reviewer's");

        var annotate = Json(CommandReports.Annotate(6, 2, 1, 3, "guideline@3 · office · 0123…", "a"));
        Ok(annotate.GetProperty("entity_type").GetString() == "annotate" && annotate.GetProperty("action").GetString() == "Annotate created 6 view(s) across 3 level(s)"
           && annotate.GetProperty("new_value").GetProperty("skipped_existing").GetInt32() == 2 && annotate.GetProperty("new_value").GetProperty("guideline").GetString() == "guideline@3 · office · 0123…",
           "an Annotate run is one annotate row, naming the guideline that planned the views");

        var many = Enumerable.Range(1, 55).Select(i => "Workset: W" + i).ToList();
        var std = Json(CommandReports.ApplyStandard(many, new[] { "Line style: Hidden" }, new string[0], "a"));
        Ok(std.GetProperty("entity_type").GetString() == "apply_standard" && std.GetProperty("action").GetString() == "Apply Standard: 55 created, 1 skipped, 0 failed"
           && std.GetProperty("new_value").GetProperty("created").GetArrayLength() == 50 && std.GetProperty("new_value").GetProperty("created_total").GetInt32() == 55
           && std.GetProperty("new_value").GetProperty("skipped").GetArrayLength() == 1 && std.GetProperty("new_value").GetProperty("failed_total").GetInt32() == 0,
           "an Apply Standard run is one apply_standard row: each outcome capped at 50 names beside its total");

        var fix = Json(CommandReports.AutoFix("VP-01", "Views", "Level 1", "FP_L01_GA", 4711, "a"));
        Ok(fix.GetProperty("entity_type").GetString() == "auto_fix" && fix.GetProperty("action").GetString() == "Auto-fix VP-01: 1 Views renamed"
           && fix.GetProperty("new_value").GetProperty("old_name").GetString() == "Level 1" && fix.GetProperty("new_value").GetProperty("new_name").GetString() == "FP_L01_GA"
           && fix.GetProperty("new_value").GetProperty("element_id").GetInt64() == 4711, "one click of Fix is one auto_fix row: the rule, the old and the new name, the element");

        var inPlace = Json(CommandReports.FixInPlace("Pset_WallCommon.FireRating", "bcf-guid-1", 3, 1, "a"));
        Ok(inPlace.GetProperty("entity_type").GetString() == "fix_in_place" && inPlace.GetProperty("action").GetString() == "Fix-in-place Pset_WallCommon.FireRating: 3 value(s) written, 1 not written"
           && inPlace.GetProperty("new_value").GetProperty("bcf_guid").GetString() == "bcf-guid-1" && inPlace.GetProperty("new_value").GetProperty("applied").GetInt32() == 3
           && inPlace.GetProperty("new_value").GetProperty("not_written").GetInt32() == 1, "one fix-in-place Apply is one fix_in_place row: written and not written, the issue it answers");

        Ok(Json(CommandReports.GhostBuild(new string('d', 600), "L", 1, 0, 0, 0, 0, 0, 0, new string[0], "a")).GetProperty("action").GetString().Length == 500,
           "an action is clipped to the route's 500 characters");
        foreach (var row in new[] { ghost, massing, annotate, std, fix, inPlace })
            Ok(row.GetProperty("new_value").GetProperty("source").GetString() == "revit" && row.GetProperty("actor").GetString().Length > 0,
               row.GetProperty("entity_type").GetString() + ": names its actor and source revit");

        // The Doctor: resolutions gathered for one minute become one row.
        var buffer = new DoctorBuffer();
        Ok(buffer.Take("demo") == null, "nothing resolved: nothing to report");
        Ok(buffer.Add("demo", "Line is slightly off axis", "Wall", new long[] { 10, 11 }), "the first resolution of a window asks for one flush");
        Ok(!buffer.Add("demo", "Line is slightly off axis", "Wall", new long[] { 11, 12 }) && !buffer.Add("demo", "Line is slightly off axis", "Model Lines", new long[] { 13 }),
           "later ones in the same window join it — no second flush");
        Ok(buffer.Add("other", "Line is slightly off axis", "Wall", new long[] { 1 }), "another project has its own window");
        var tally = buffer.Take("demo");
        Ok(tally.Resolved == 3 && tally.ByWarning["Line is slightly off axis"] == 3 && tally.ByTransaction["Wall"] == 2 && tally.ByTransaction["Model Lines"] == 1
           && tally.ElementIdsTotal == 4 && tally.ElementIds.SequenceEqual(new long[] { 10, 11, 12, 13 }),
           "the window's tally: 3 resolutions, by warning and by transaction, 4 distinct elements");
        Ok(buffer.Take("demo") == null && buffer.Add("demo", "x", "y", null), "taking empties the window: the next resolution starts a new one");
        var doctor = Json(CommandReports.Doctor(tally, "a"));
        var dv = doctor.GetProperty("new_value");
        Ok(doctor.GetProperty("entity_type").GetString() == "doctor" && doctor.GetProperty("action").GetString() == "Doctor: 3 warning(s) resolved with Revit's own fix in 2 kind(s) of transaction"
           && dv.GetProperty("resolved").GetInt32() == 3 && dv.GetProperty("warnings")[0].GetProperty("text").GetString() == "Line is slightly off axis"
           && dv.GetProperty("warnings")[0].GetProperty("count").GetInt32() == 3 && dv.GetProperty("transactions").GetArrayLength() == 2
           && dv.GetProperty("element_ids").GetArrayLength() == 4 && dv.GetProperty("element_ids_total").GetInt32() == 4
           && dv.GetProperty("window_seconds").GetInt32() == 60 && DoctorBuffer.WindowSeconds == 60,
           "a window is one doctor row: the count, by warning, by transaction, the elements, the window's length");
        var wide = new DoctorBuffer();
        wide.Add("demo", "w", "t", Enumerable.Range(1, 70).Select(i => (long)i));
        var wideRow = Json(CommandReports.Doctor(wide.Take("demo"), "a")).GetProperty("new_value");
        Ok(wideRow.GetProperty("element_ids").GetArrayLength() == 50 && wideRow.GetProperty("element_ids_total").GetInt32() == 70, "70 elements → the first 50 ids beside the true total");
    }

    // ── 17. MA-1a item 7: each of the eight commands reports once, off the API thread (a source scan) ──────────────
    static void ReportWiringChecks()
    {
        Console.WriteLine("\nMA-1a item 7 — one report call in each command, never on the API thread (source scan)");
        string notify = Src("Coordination", "GovernedNotify.cs");
        int at = notify.IndexOf("public static void Report(string what, object payload, string projectKey, System.Windows.Threading.Dispatcher? ui = null)", StringComparison.Ordinal);
        string body = at < 0 ? "" : notify.Substring(at, notify.IndexOf("\n        }", at, StringComparison.Ordinal) - at);
        Ok(at > 0 && body.Contains("Task.Run(() => Event(\"/audit\", payload, key))") && body.Contains(".BeginInvoke("),
           "GovernedNotify.Report posts on a pool thread and logs to the pane through BeginInvoke");
        Ok(at > 0 && !body.Contains("GetAwaiter") && !body.Contains(".Wait(") && !body.Contains(".Result;") && !body.Contains("TaskDialog"),
           "…and never waits for the bridge or shows a dialog: no command is blocked or delayed by the ledger");
        Ok(body.Contains("LedgerResult.NotBound()"), "an unbound model sends nothing and says so in the pane log");
        foreach (var (file, call) in new[]
        {
            (new[] { "Commands.Datum.cs" }, "GovernedNotify.Report(\"Datum from Drawings\", CommandReports.Datum("),
            (new[] { "GhostBuilder", "GhostChangesetBuild.cs" }, "GovernedNotify.Report(\"Ghost Builder\", CommandReports.GhostBuild("),
            (new[] { "Commands.Massing.cs" }, "GovernedNotify.Report(\"Photo Massing\", CommandReports.Massing("),
            (new[] { "Commands.Annotate.cs" }, "GovernedNotify.Report(\"Annotate\", CommandReports.Annotate("),
            (new[] { "Commands.Standards.cs" }, "GovernedNotify.Report(\"Apply Standard\", CommandReports.ApplyStandard("),
            (new[] { "Workflow", "AutoFixExecution.cs" }, "GovernedNotify.Report(\"Auto-fix \" + ruleId, Sentinel.Coordination.CommandReports.AutoFix("),
            (new[] { "Commands.BcfIssues.cs" }, "GovernedNotify.Report(\"Fix-in-place\", CommandReports.FixInPlace("),
            (new[] { "Updaters", "FailureInterceptor.cs" }, "GovernedNotify.Report(\"Doctor\", Sentinel.Coordination.CommandReports.Doctor("),
        })
        {
            string src = Src(file);
            int first = src.IndexOf(call, StringComparison.Ordinal);
            Ok(first > 0 && src.IndexOf(call, first + 1, StringComparison.Ordinal) < 0, file[file.Length - 1] + ": one report call");
        }
        Ok(Src("GhostBuilder", "DatumBuilder.cs").Contains("detected.Committed = t.Commit() == TransactionStatus.Committed;")
           && Src("Commands.Datum.cs").Contains("if (!result.Committed)"),
           "Datum reports only a transaction Revit committed, and says so when it did not");
        Ok(Src("Commands.Annotate.cs").Contains("if (t.Commit() != TransactionStatus.Committed)"), "Annotate reports only a transaction Revit committed, and says so when it did not");
        string doctor = Src("Updaters", "FailureInterceptor.cs");
        Ok(doctor.Contains("Reported.Add(key, p.Text, p.Tx, p.Ids)") && doctor.Contains("Task.Delay(TimeSpan.FromSeconds(Sentinel.Coordination.DoctorBuffer.WindowSeconds))")
           && doctor.Contains("Reported.Take(key)"),
           "the Doctor gathers a minute's resolutions per project and reports them as one row");

        // Review amendments C9, C19, C22, C23.
        Ok(body.Contains("\"HTTP 413\"") && body.Contains("\"HTTP 429\"") && body.Contains("LedgerResult.NotRecorded("),
           "a report the route refused before writing (413, 429) reads \"not recorded\" in the pane, never \"may have landed\"");
        string ghostBuild = Src("GhostBuilder", "GhostChangesetBuild.cs");
        int gate = ghostBuild.IndexOf("if (report.Placed > 0)", StringComparison.Ordinal);
        Ok(gate > 0 && ghostBuild.IndexOf("GovernedNotify.Report(\"Ghost Builder\"", StringComparison.Ordinal) > gate,
           "Ghost Builder reports only a build that left an element in the model");
        string applyStandard = Src("Commands.Standards.cs");
        Ok(Src("Engine", "SentinelUndo.cs").Contains("keep = g.Assimilate() == TransactionStatus.Committed")
           && applyStandard.Contains("kept = Sentinel.Engine.SentinelUndo.Run(") && applyStandard.Contains("if (kept && modelCreated.Count > 0)")
           && applyStandard.Contains("!c.StartsWith(\"Ruleset:\", StringComparison.Ordinal)"),
           "Apply Standard reports only a build Revit kept, and only its model creations — never the ruleset install's line");
        string standardsBuilder = Src("Standards", "StandardsBuilder.cs");
        Ok(standardsBuilder.Contains("private static void Committed(Transaction t, BuildReport r, int from)") && !standardsBuilder.Contains("t.Commit();"),
           "each Apply Standard step counts as created only what Revit committed");
        Ok(doctor.Contains("Project = ProjectContext.For(doc).Key") && doctor.Contains("p.Project == key"),
           "a Doctor resolution is reported only under the project of the model it happened in");
    }
}
