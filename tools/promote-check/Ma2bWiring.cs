#nullable disable
static partial class Check
{
    // ── 32. MA-2b: the Revit-bound wiring, by source scan (the commands, the placement event, the pane and the HTTP client
    //        compile in no check project; drill MA2b runs them) ───────────────────────────────────────────────────────────
    static void Ma2bWiringChecks()
    {
        Console.WriteLine("\nMA-2b — wiring (source scans)");
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        string promote = Src("Commands.PromoteWalls.cs"), review = Src("Commands.ReviewChangesets.cs"), place = Src("GhostBuilder", "ChangesetPlacementEvent.cs");
        string ctx = Src("GhostBuilder", "PromoteContext.cs");
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        Ok(Count(promote, "PromoteContext.Fetch(") == 1 && promote.Contains("Task.Run(() => PromoteContext.Fetch(key))")
           && Count(review, "PromoteContext.Fetch(") == 1 && review.Contains("Task.Run(() => PromoteContext.Fetch(key))")
           && ctx.Contains("ArtefactClient.StageIds(key, out var why)") && Src("Coordination", "ArtefactClient.cs").Contains("\"/artefacts/lod_matrix/ids\""),
           "no network call on Revit's API thread: the matrix and the DD IDS (GET …/artefacts/lod_matrix/ids) are read inside Task.Run, in Promote and in the review");
        Ok(promote.Contains("try { lod = LodStateOf(doc, plans, pc, \"now\"); }") && promote.Contains("catch (Exception ex) { lodErr = ex.Message; }")
           && promote.Contains("lodErr != null ? \"LOD state: not read — \" + lodErr") && promote.IndexOf("GovernedNotify.Report(\"LOD state now\"", StringComparison.Ordinal) > 0
           && promote.IndexOf("GovernedNotify.Report(\"LOD state now\"", StringComparison.Ordinal) < promote.IndexOf("dlg.Show()", StringComparison.Ordinal)
           && promote.Contains("\"\\n\\n\" + ddNow + \"\\n\" + lodText") && promote.Contains("LOD state now (sent to the ledger — the pane's Doctor log says whether it was recorded): ")
           && !promote.Contains("recorded on the ledger") && !review.Contains("recorded on the ledger"),
           "Promote's header shows the LOD state now (step 2), and its lod_state row is posted on every run with a matrix — the read-only run too; a read that throws is said, never the end of Promote (review)");
        Ok(promote.Contains("GovernedElementExtractor.ExtractByIds(doc, doc.Title, ruled.Select(x => x.Element.Id), org)")
           && promote.Contains("var r = LodState.Read(plans, pc.Mx, pc.Ids, pc.IdsWhy, props, pc.NotRun);")
           && promote.Contains("var plans = PromotePlanner.Plan(pc.Classes, walls, others, levels, docTypes, classTypes, pc.Standards.Guideline);"),
           "the LOD state reads the facts Promote reads, and the DD IDS judges the elements the rules pass, through the extractor");
        int judged = place.IndexOf("PromoteContext.JudgeApplied(doc, ids, result.Applied, kindOf)", StringComparison.Ordinal);
        Ok(judged > 0 && judged < place.IndexOf("BlockCheck.AddedSince(doc, before)", StringComparison.Ordinal)
           && judged < place.IndexOf("group.Assimilate()", StringComparison.Ordinal)
           && place.Contains("return new ChangesetExecutor.ExecutionResult { NotRun = true, Error = StageIds.WentBack(fails.Count, ids.Matrix) };")
           && !place.Contains("if (before == null && promote?.Ids == null") && place.Contains("result.Ids = \"DD IDS: not checked — \" + promote.IdsWhy;") // MA-2d C10: no lone path — every changeset runs in the group
           && ctx.Contains("var v = ids.Judge(g.identity.Class, StageIds.ValuesOf(g), org, spec);")
           && promote.Contains("pc.Ids.Judge(read[i].identity.Class, StageIds.ValuesOf(read[i]), org, ruled[i].Spec);")
           && place.Contains("idsLine = StageIds.Summary(judged, fails, notRead, notJudged, ids.Matrix);") && !place.Contains("every element passed")
           && ctx.Contains("StageIds.NotFrom(pc.Ids, pc.MxSha, pc.MxLabel) is string other")
           && ctx.Contains("MainContent = string.Join(\"\\n\", StageIds.Tally(fails)") && ctx.Contains("ExpandedContent = string.Join(\"\\n\", fails.Take(200))"),
           "the DD IDS is checked before commit where the BLOCK check runs (step 5): going back rolls the group back; a check that could not run is said; each element is judged against its own class's specification, and what was not judged is said; how many were judged is said; an IDS made from another matrix than the one read is not used (review); the dialog counts every failing element and names each under See details (drill MA2b F-MA2b-2)");
        int afterAt = review.IndexOf("PromoteWallsCommand.LodStateAfter(doc, promote)", StringComparison.Ordinal);
        Ok(afterAt > review.IndexOf("onDone = result =>", StringComparison.Ordinal) && review.Contains("GovernedNotify.Report(\"LOD state after\"")
           && review.Contains("handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);"),
           "after a Promote changeset is applied, the LOD state after is read on the API thread and posted as one more lod_state row (step 10)");
        Ok(Src("UI", "SentinelPanel.xaml").Contains("<TextBlock Text=\"{Binding LodLine}\"") && Src("Coordination", "GovernedQuery.cs").Contains("LodLine = Str(Obj(root, \"lod_state\"), \"line\") ?? \"\",")
           && Count(Src("UI", "SentinelPanelViewModel.cs"), "ScanRulesetLine = LodLine = \"\";") == 3,
           "the Live Coordination pane prints the journey's LOD state line — the ledger's, as the web strip does — and clears it with the others");
    }
}
