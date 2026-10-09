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
}
