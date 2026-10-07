#nullable disable
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 53. MA-3b6: the declines made before, read before Promote's dialog — its words (pure) and its wiring (source scans; drill MA3b6) ──
    static void Ma3b6WordChecks()
    {
        Console.WriteLine("\nMA-3b6 — the declines made before: Promote's words and the storeys it does not file");
        Ok(PropertyPlanner.FileQuestion(3, 0) == "File 3 changeset(s)?"
           && PropertyPlanner.FileQuestion(2, 1) == "File 2 of 3 changeset(s)? (1 not filed — every ghost in them was declined before)"
           && PropertyPlanner.FileQuestion(0, 2) == "Nothing to file: every ghost Promote would propose was declined before.",
           "F8 B: the dialog's question counts the storeys it files and those it does not (every ghost in them was declined before)");
        ChangesetPreviewDto P(string name, int carried = 0, int noReason = 0, int creates = 0, int unverified = 0, bool all = false) =>
            new ChangesetPreviewDto { Name = name, Carried = carried, NoReason = noReason, Creates = creates, Unverified = unverified, AllCarried = all };
        var none = new List<ChangesetPreviewDto> { P("a"), P("b") };
        var some = new List<ChangesetPreviewDto> { P("Promote (DD) · 00-GFL", carried: 1, noReason: 1), P("Promote (DD) · 01-FFL", carried: 2, all: true) };
        Ok(PropertyPlanner.CarriedLine(null) == null && PropertyPlanner.CarriedLine(none) == null
           && PropertyPlanner.CarriedLine(some) == "Declined before (the bridge carries each decline onto its ghost, already declined, for the reviewer): 3 ghost(s) in 2 storey(s); not carried: 1 declined in Revit with no reason, 0 with a reason no signed-in member reported, 0 create(s) like one declined before\n1 storey(s) not filed — every ghost in them was declined before: Promote (DD) · 01-FFL. Their rows sent to a person are listed only in this dialog; a lead re-opens a decline on the web desk to file them again.",
           "the dialog says how many ghosts were declined before, what is not carried and why, and names each storey it does not file");
        Ok(PropertyPlanner.PreviewNotRead("Bridge 404: changesets route not found") == "Declined before: not read — Bridge 404: changesets route not found. Every storey is filed; a ghost declined before is still filed already declined by the bridge.",
           "F8 A: a preview the bridge did not answer is said, and every storey is filed as before");
        var bodies = new List<object> { "b0", "b1", "b2" };
        var kept = PropertyPlanner.WithoutCarried(bodies, new List<ChangesetPreviewDto> { P("a"), P("b", all: true), P("c") });
        Ok(kept.Count == 2 && (string)kept[0] == "b0" && (string)kept[1] == "b2"
           && PropertyPlanner.WithoutCarried(bodies, null).Count == 3
           && PropertyPlanner.WithoutCarried(bodies, new List<ChangesetPreviewDto> { P("a", all: true), P("b", all: true) }).Count == 3,
           "F8 B: a storey whose every ghost was declined before is not filed; no preview, or one that does not match the bodies, files them all");
        string promote = Src("Commands.PromoteWalls.cs");
        int hop = promote.IndexOf("Task.Run(() => { var pv = ChangesetClient.Preview(cfg, key, bodies, out var e);", StringComparison.Ordinal);
        Ok(hop > 0 && promote.Contains("App.Events.Enqueue(doc, \"ask Promote (DD)\"") && promote.Contains("PropertyPlanner.FileAll(toFile")
           && promote.Contains("PropertyPlanner.FileQuestion(toFile.Count, skipped)") && !promote.Contains("$\"File {bodies.Count} changeset(s)?\""),
           "MA-3b6: Promote reads the preview on a pool thread, asks back on Revit's thread in this model only (DocPin), files only the storeys not wholly declined before, and no longer asks 'File {bodies.Count}'");
    }
}
