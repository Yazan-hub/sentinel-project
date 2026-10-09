#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-4f-1: Revit's pre-tick of a measured survey create; Revit's re-read of each survey wall it placed (AppliedEntry.mesh) ──
    static void Ma4fChecks()
    {
        Console.WriteLine("\nMA-4f — Revit's pre-tick of a measured survey create; Revit's re-read (AppliedEntry.mesh)");
        string survey;
        using (var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "contract2-survey.json"))))
            survey = fx.RootElement.GetProperty("stored").GetRawText();
        bool Ticked(Action<ChangesetDto, ChangesetElementDto> edit) { var c = JsonSerializer.Deserialize<ChangesetDto>(survey); edit(c, c.Elements[0]); return ChangesetTrust.PreTick(c, c.Elements[0]); }
        Ok(Ticked((c, e) => { }), "MA-4f: a survey create the bridge pre-ticked within tolerance opens ticked in Revit (the web desk calls it pre-ticked)");
        Ok(!Ticked((c, e) => e.Pretick = false), "…not one the bridge did not pre-tick (a storey whose level was not checked, a size not measured)");
        Ok(!Ticked((c, e) => e.Accuracy.Status = "out_of_tolerance") && !Ticked((c, e) => e.Accuracy = null), "…not one out of tolerance, nor one with no accuracy, whatever its pretick says");
        Ok(!Ticked((c, e) => c.Claimed = null) && !Ticked((c, e) => c.Claimed = true), "…not from a claimed source, nor from a bridge before item 8");
        Ok(!Ticked((c, e) => e.Verdict = new ElementVerdictDto { Status = "rejected" }) && Ticked((c, e) => e.Verdict = new ElementVerdictDto { Status = "accepted" }),
           "…not one the office IDS rejected (its badge reads ✗ rejected; Apply's IDS stage would ask straight after) — an accepted one still opens ticked");
        Ok(!Ticked((c, e) => e.Review = new ReviewDto { State = "declined" }), "…not one declined on the web: a decline binds");
        Ok(!Ticked((c, e) => e.Op = "set_parameter"), "…and a type edit never");

        var plain = new AppliedEntry { ProposalGuid = "g1", RevitElementId = 901, RevitUniqueId = "u1" };
        var meshed = new AppliedEntry { ProposalGuid = "g2", RevitElementId = 902, RevitUniqueId = "u2", Mesh = new double[] { 0, 0, 0, 1000, 0, 0, 0, 0, 2800 } };
        string Body(params AppliedEntry[] a) => ChangesetClient.ResultBody(a.ToList(), new List<string>(), null, null, null);
        Ok(!Body(plain).Contains("\"mesh\"") && Body(plain).Contains("\"applied\":[{\"proposal_guid\":\"g1\",\"revit_element_id\":901,\"revit_unique_id\":\"u1\"}]"),
           "an entry with no re-read writes no mesh key: every other result body stays byte-identical");
        Ok(Body(meshed).Contains("\"mesh\":[0,0,0,1000,0,0,0,0,2800]"), "…and a re-read rides on its entry, 9 numbers a triangle");
        var root = Path.Combine(Path.GetTempPath(), "ma4f-check-" + Guid.NewGuid().ToString("N"));
        var was = UnreportedResults.Root;
        UnreportedResults.Root = root;
        try
        {
            UnreportedResults.Write(new UnreportedResults.Record { Key = "ma4f", ChangesetId = "c-1", Name = "Survey job-0003 · Scan L01 job-0003", Doc = "a.rvt", Applied = new List<AppliedEntry> { plain, meshed }, At = "2026-10-10T12:00:00Z" });
            UnreportedResults.Write(new UnreportedResults.Record { Key = "ma4f", ChangesetId = "c-0", Name = "Promote (DD) · GR-FFL", Doc = "a.rvt", Applied = new List<AppliedEntry> { plain }, At = "2026-10-10T12:00:00Z" });
            var back = UnreportedResults.Read("ma4f", "c-1");
            Ok(back.Applied[1].Mesh.SequenceEqual(meshed.Mesh) && back.Applied[0].Mesh == null && Body(back.Applied.ToArray()) == Body(plain, meshed)
               && !File.ReadAllText(UnreportedResults.PathFor("ma4f", "c-0")).Contains("mesh"),
               "a result kept on this PC keeps each re-read, so a report sent again later carries it; a record with none holds no mesh key");
        }
        finally { UnreportedResults.Root = was; try { Directory.Delete(root, true); } catch (Exception) { /* a temp folder */ } }

        Ok(PlacementGeometry.PackMesh(new List<double> { 0.04, 0, 0, 1000.06, 0, 0, 0, 0, 2799.96 }).SequenceEqual(new double[] { 0, 0, 0, 1000.1, 0, 0, 0, 0, 2800 })
           && JsonSerializer.Serialize(PlacementGeometry.PackMesh(new List<double> { -0.04, 0, 0, 1, 0, 0, 0, 0, 1 })) == "[0,0,0,1,0,0,0,0,1]",
           "PackMesh rounds each corner to 0.1 mm and never writes -0 (the bridge's JSON would not)");
        Ok(PlacementGeometry.PackMesh(new List<double>()) == null && PlacementGeometry.PackMesh(new List<double> { 1, 2, 3 }) == null
           && PlacementGeometry.PackMesh(new List<double> { double.NaN, 0, 0, 1, 0, 0, 0, 0, 1 }) == null
           && PlacementGeometry.PackMesh(Enumerable.Repeat(1.0, 9 * (PlacementGeometry.MaxMeshTriangles + 1)).ToList()) == null
           && PlacementGeometry.PackMesh(Enumerable.Repeat(1.0, 9 * PlacementGeometry.MaxMeshTriangles).ToList()).Length == 9 * 64,
           "…and gives none for nothing, a part triangle, a number not finite, or more than 64 triangles (the bridge then measures the wall as filed)");

        string ex = Src("GhostBuilder", "ChangesetExecutor.cs");
        int at = ex.IndexOf("try { a.Mesh = WallMesh(doc.GetElement(a.RevitUniqueId)); } catch (Exception) { a.Mesh = null; }", StringComparison.Ordinal);
        int recount = ex.IndexOf("GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)", StringComparison.Ordinal);
        Ok(at > ex.IndexOf("var status = t.Commit();", StringComparison.Ordinal) && at > recount && at < ex.IndexOf("TurnToBlocks(doc, cs, toPlace, result);", StringComparison.Ordinal)
           && ex.LastIndexOf("if (cs.Claimed == false)", at, StringComparison.Ordinal) > recount
           && ex.Contains("var s = e == null ? null : ClashManager.GetMainSolid(e);") && ex.Contains("return PlacementGeometry.PackMesh(mm);"),
           "the executor re-reads each wall a survey changeset created after the commit and the recount, from its main solid; a read that throws leaves it null");
        string win = Src("UI", "ChangesetReviewWindow.cs");
        Ok(win.Contains("IsChecked = ChangesetTrust.PreTick(_cs, el), // MA-1a item 8, MA-4f:") && !win.Contains("A create is never pre-ticked"),
           "the window still ticks by ChangesetTrust alone, and no comment there says a create is never pre-ticked");
    }

    // ── MA-4f-2: the scan overlay — the bridge's answer, the crosses (pure) and the wiring ──
    static void Ma4f2Checks()
    {
        Console.WriteLine("\nMA-4f — the scan overlay: the bridge's answer, the crosses (pure) and the wiring");
        var fx = JsonSerializer.Deserialize<ScanDto>(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "scan-reply.json")));
        Ok(fx.Job == "job-0002" && fx.LedgerId == 2201 && fx.CellMm == 100 && fx.ZMm.SequenceEqual(new double[] { 300, 2500 }) && fx.Of == 2
           && fx.Points.Count == 2 && fx.Points[0].SequenceEqual(new double[] { 40125, 150, 1400 }),
           "the bridge's scan reply (the fixture vitest holds scanOverlay to) reads: its job, row, cube, heights, count and points in the model's mm");
        var segs = GhostOverlayGeometry.ScanCrosses(fx.Points, GhostOverlayGeometry.ScanBudget);
        Ok(segs.Count == 6 && segs.All(s => s.R == 0 && s.G == 160 && s.Bl == 220)
           && segs.Take(3).All(s => Enumerable.Range(0, 3).Sum(k => Math.Abs(s.B[k] - s.A[k])) == GhostOverlayGeometry.ScanCrossMm)
           && segs[0].A.SequenceEqual(new double[] { 40095, 150, 1400 }) && segs[2].B.SequenceEqual(new double[] { 40125, 150, 1430 }),
           "each point is a cyan cross of three 60 mm arms about it");
        var many = Enumerable.Range(0, 6000).Select(i => new double[] { i, 0, 0 }).ToList();
        Ok(GhostOverlayGeometry.ScanCrosses(many, GhostOverlayGeometry.ScanBudget).Count == 3 * 5000 && GhostOverlayGeometry.ScanBudget * 6 <= 32767
           && GhostOverlayGeometry.ScanCrosses(new List<double[]> { null, new double[] { 1, 2 }, new double[] { 1, double.NaN, 3 } }, 10).Count == 0
           && GhostOverlayGeometry.ScanCrosses(null, 10).Count == 0,
           "at most 5 000 points are drawn (30 000 vertices: inside any 16-bit index); a point short of three finite numbers, and none, draw nothing");
        Ok(GhostOverlayGeometry.ScanLine(fx, 2) == "Scan: 2 of 2 point(s) drawn as cyan crosses — job-0002 (ledger #2201), one point per 100 mm, 300–2500 mm high (the walls less 300 mm at the floor and ceiling), placed by the lead's frame; nothing is written. Untick to hide.",
           "the window's line says how many, from which job, how thinned and how placed");
        string cli = Src("Coordination", "ChangesetClient.cs"), rev = Src("Commands.ReviewChangesets.cs"), win = Src("UI", "ChangesetReviewWindow.cs"), srv = Src("GhostBuilder", "GhostOverlayServer.cs");
        Ok(cli.Contains("/{Uri.EscapeDataString(id)}/scan\";") && cli.Contains("var (resp, body) = Send(WriteHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));"),
           "the scan is read with the person's token (a signed-out Revit sends the file's, which the bridge refuses in words), waiting as long as a write: the bridge runs sentinel-survey");
        Ok(win.Contains("public event Action<bool> ScanRequested;") && win.Contains("Visibility = _cs.Claimed == false ? Visibility.Visible : Visibility.Collapsed"),
           "\"Show the scan\" is offered on a survey changeset only, unticked");
        int ask = rev.IndexOf("window.ScanRequested +=", StringComparison.Ordinal);
        Ok(ask > 0 && rev.IndexOf("Task.Run(() =>", ask, StringComparison.Ordinal) < rev.IndexOf("var got = ChangesetClient.FetchScan(cfg, key, cs.Id, out var err);", StringComparison.Ordinal)
           && rev.Contains("App.Events.Enqueue(doc, \"draw the scan overlay\"") && rev.Contains("if (window.Gone || ask != scanAsk || scanOn != null) return;")
           && rev.Contains("window.Closed += (_, _) => { scanAsk++; ScanOff(\"the window closed\"); };") && !rev.Contains("ScanOff(\"Apply\")"),
           "the scan is read off Revit's thread, drawn through the hub on the model in front (the newest tick wins), removed when unticked or the window closes — not at Apply");
        Ok(rev.Contains("void ScanOff(string why) => App.Events.Enqueue(ua =>") && rev.Contains("var s = scanOn; scanOn = null;")
           && rev.Contains("if (!on) { window.Shown(window.Applied ? \"\" : GhostOverlayGeometry.Line(creates, outlined)); return; }"),
           "scanOn is read and written on Revit's thread only (the removal is a hub job: an untick during the draw removes what it drew); unticking puts the ghost line back");
        Ok(rev.IndexOf("got.Points", StringComparison.Ordinal) == rev.LastIndexOf("got.Points", StringComparison.Ordinal) && rev.Contains("ScanCrosses(got.Points,"),
           "the scan's points go into the crosses only — never into a line, the Doctor or a file (the lines carry counts)");
        Ok(srv.Contains("_bounds = GhostOverlayGeometry.Bounds(_segments); Drop();") && srv.Contains("var b = _bounds;") && srv.Contains("{_name}: drawn in"),
           "one server class draws both overlays: its name in the Doctor's lines, its bounds once a geometry (not each frame)");
    }
}
