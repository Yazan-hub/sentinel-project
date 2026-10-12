#nullable disable
// MA-8-9: a stair flag's Revit half - the pick's box, the body the bridge takes, the client's calls and the window's wiring (the Revit halves are pinned by
// source text, as the other windows are). The bridge validates the box (changesets-logic checkStairFlag, WebApp/bridge/fixtures/stair-flag/cases.json): no copy here.
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    static void Ma8StairChecks()
    {
        Console.WriteLine("\nMA-8-9 - stairs as flagged manual rows (StairFlag, ChangesetClient.FlagStair / FetchScan, the window)");
        // the pick: corners in any order are sorted; z runs from the level to the next story; whole mm
        var f = StairFlag.FromPick("L01", 0, 3000, new[] { 4200.4, 6000.5 }, new[] { 1000.0, 600.0 }, out var why);
        Ok(f != null && why == null && f.Storey == "L01" && f.Min.SequenceEqual(new[] { 1000.0, 600.0, 0.0 }) && f.Max.SequenceEqual(new[] { 4200.0, 6001.0, 3000.0 }),
           "FromPick sorts the corners, takes z from the level to the next story, in whole mm");
        var top = StairFlag.FromPick("L03", 6000, null, new[] { 0.0, 0 }, new[] { 1000.0, 3000 }, out var noTop);
        Ok(top == null && noTop == "There is no Building Story above L03, so the stair's height is unknown. Add a story level above it (mark it Building Story), then flag the stair again. Nothing was saved.", "no story above: no box, and why");
        Ok(StairFlag.Line("L01", new[] { 0.0, 0, 0 }, new[] { 3200.0, 5400, 3000 }) == "Stair on L01 · 3200 × 5400 mm, 3000 mm tall", "Line: storey, plan size, height");
        Ok(StairFlag.Line("L01", null, null) == "Stair on L01", "Line with no box says the storey only");
        // the body: exactly {kind, storey, box:{min,max}} - the bridge refuses any other key
        using (var d = JsonDocument.Parse(f.Body()))
        {
            var r = d.RootElement;
            Ok(r.EnumerateObject().Select(p => p.Name).SequenceEqual(new[] { "kind", "storey", "box" }) && r.GetProperty("kind").GetString() == "stair" && r.GetProperty("storey").GetString() == "L01"
               && r.GetProperty("box").GetProperty("min").GetArrayLength() == 3 && r.GetProperty("box").GetProperty("max")[2].GetDouble() == 3000,
               "the body is {kind: stair, storey, box: {min, max}} and nothing else");
        }
        // the DTO reads a flag row as the bridge sends it (and a plain exception row as before)
        var row = JsonSerializer.Deserialize<FlagReplyDto>("{\"flag\":{\"unique_id\":\"stair:pick-0a1b2c3d\",\"name\":\"Stair picked on L01\",\"reason\":\"r\",\"kind\":\"stair\",\"storey\":\"L01\",\"box\":{\"min\":[1,2,0],\"max\":[3,4,3000]},\"source\":\"pick\"},\"ledger\":{\"id\":1}}").Flag;
        Ok(row.Kind == "stair" && row.Storey == "L01" && row.Source == "pick" && row.GlobalId == null && row.Box.Max[2] == 3000 && row.UniqueId == "stair:pick-0a1b2c3d", "ExceptionRowDto reads kind, storey, box, source and global_id");
        var plain = JsonSerializer.Deserialize<ExceptionRowDto>("{\"unique_id\":\"u\",\"name\":null,\"reason\":\"r\"}");
        Ok(plain.Kind == null && plain.Box == null, "a row without kind reads as before");
        // signed out: refused in words before anything is sent (the machine credential would get a 403)
        string reply = null, err = null;
        // (this PC may hold a session: a signed-in Revit would send, so the call is made only when signed out; the source pin below holds either way)
        Ok(UserSession.IsSignedIn || (!ChangesetClient.FlagStair(null, "demo", "c1", f, out reply, out err) && reply == null
           && err == "a stair flag is a person's pick — sign in (Standards ▸ Sign in); nothing was saved"), "FlagStair signed out is refused in words, before the POST");

        string cli = Src("Coordination", "ChangesetClient.cs"), rev = Src("Commands.ReviewChangesets.cs"), win = Src("UI", "ChangesetReviewWindow.cs");
        Ok(cli.IndexOf("if (!UserSession.IsSignedIn) { error = \"a stair flag is a person's pick", StringComparison.Ordinal) > 0 && cli.IndexOf("if (!UserSession.IsSignedIn) { error = \"a stair flag is a person's pick", StringComparison.Ordinal) < cli.IndexOf("/flags\", flag.Body(), 201,", StringComparison.Ordinal)
           && cli.Contains("/{Uri.EscapeDataString(id)}/flags\", flag.Body(), 201, out reply, out error);") && cli.Contains("/scan?flag={Uri.EscapeDataString(flag)}\";")
           && cli.Contains("public static ScanDto FetchScan(BcfConfig cfg, string projectKey, string id, string flag, out string error)")
           && cli.Contains("public static ScanDto FetchScan(BcfConfig cfg, string projectKey, string id, out string error)"),
           "POST …/flags answers 201 with {kind, storey, box} only; GET …/scan?flag= is an overload beside the whole-storey read (its pinned lines stay)");
        // the pick: a hub job on the model in front, in a Building Story's plan, cancelled by Revit's own exception, nothing written
        int pick = rev.IndexOf("window.FlagStairRequested +=", StringComparison.Ordinal);
        Ok(pick > 0 && rev.IndexOf("App.Events.Enqueue(doc, \"pick a stair\"", pick, StringComparison.Ordinal) > pick
           && rev.Contains("uidoc.ActiveView is not ViewPlan viewPlan || viewPlan.GenLevel is not Level lvl") && rev.Contains("!here.IsStory")
           && rev.Contains("PickPoint(Autodesk.Revit.UI.Selection.ObjectSnapTypes.Endpoints | Autodesk.Revit.UI.Selection.ObjectSnapTypes.Intersections, \"Stair: first corner\")")
           && rev.Contains("catch (Autodesk.Revit.Exceptions.OperationCanceledException) { window.Shown(\"Flagging a stair was cancelled; nothing was saved.\"); return; }")
           && rev.Contains("ChangesetExecutor.Stories(d)") && rev.IndexOf("Task.Run(() =>", pick, StringComparison.Ordinal) < rev.IndexOf("ChangesetClient.FlagStair(cfg, key, cs.Id, flag,", pick, StringComparison.Ordinal)
           && rev.Contains("if (!UserSession.IsSignedIn) { window.Shown(\"A stair flag is a person's pick"),
           "Flag a stair…: a hub job on this model, in a Building Story's plan, two PickPoints (Revit's OperationCanceledException cancels), signed in, the POST off Revit's thread");
        // the slice: the scan's own overlay and its newest-tick-wins guard
        int sl = rev.IndexOf("window.StairSliceRequested +=", StringComparison.Ordinal);
        Ok(sl > 0 && rev.IndexOf("var ask = ++scanAsk;", sl, StringComparison.Ordinal) > sl && rev.IndexOf("ScanOff(on ? \"a slice ticked\"", sl, StringComparison.Ordinal) > sl
           && rev.IndexOf("ChangesetClient.FetchScan(cfg, key, cs.Id, flagUid, out var sliceErr)", sl, StringComparison.Ordinal) > sl
           && rev.IndexOf("if (window.Gone || ask != scanAsk || scanOn != null) return;", sl, StringComparison.Ordinal) > sl && rev.Contains("new GhostOverlayServer(doc, cs.Name, segs, null, \"Scan slice\")")
           && rev.IndexOf("slice.Points", StringComparison.Ordinal) == rev.LastIndexOf("slice.Points", StringComparison.Ordinal),
           "a slice shares scanOn / scanAsk with Show the scan (the newest tick wins) and draws the points into crosses only");
        Ok(win.Contains("public event Action FlagStairRequested;") && win.Contains("public event Action<bool, string> StairSliceRequested;") && win.Contains("public event Action<bool> ScanRequested;")
           && win.Contains("if (_scanBox?.IsChecked == true) _scanBox.IsChecked = false;") && win.Contains("foreach (var sl in _slices.Where(x => x.IsChecked == true).ToList()) sl.IsChecked = false; ScanRequested?.Invoke(true);")
           && win.Contains("if (stair && SurveyChangeset)") && win.Contains("Visibility = _cs.Status == \"withdrawn\" ? Visibility.Collapsed : Visibility.Visible")
           && win.Contains("StairFlag.Line(x.Storey, x.Box.Min, x.Box.Max)") && win.Contains("public void AddFlag(ExceptionRowDto x)"),
           "the window: Flag a stair… on a live changeset, a stair row's line, Scan slice on a survey changeset only, the slice and Show the scan untick each other, AddFlag");
    }
}
