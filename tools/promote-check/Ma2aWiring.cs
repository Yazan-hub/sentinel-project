#nullable disable

static partial class Check
{
    // ── 25. MA-2a: the Revit-bound wiring, as a source scan (proven live in drill MA2a) ───────────────────────────────────────
    static void Ma2aWiringChecks()
    {
        Console.WriteLine("\nMA-2a wiring (source scan: Promote's facts, Ghost Builder's facts, the review's typing line)");
        string promote = Src("Commands.PromoteWalls.cs");
        Ok(promote.Contains("Line = WallLine(w),") && promote.Contains("private static WallLocation.Segment WallLine(Wall w)")
           && promote.Contains("Curved = !(c is Line)") && promote.Contains("WidthMm = basic ? wt.Width * FtToMm : 0"),
           "Promote reads each wall's location line in mm for the outer boundary — a curve's chord flagged, the basic type's width, none when the wall has no line");
        Ok(promote.Contains("Material = basic ? TypeHarvest.MaterialLabel(NamingManagerService.LayerMaterials(doc, wt)) : null,"),
           "Promote reads a basic wall type's build-up materials as the param Material, through the one shared reader");

        string ghost = Src("GhostBuilder", "GhostChangesetBuild.cs");
        Ok(ghost.Contains("drawn.Add(new WallLocation.Segment { X0 = a.X * FtToMm, Y0 = a.Y * FtToMm, X1 = b.X * FtToMm, Y1 = b.Y * FtToMm, WidthMm = el.ThicknessMm, Curved = !(c is Line) });"),
           "Ghost Builder lists this build's drawn walls in mm as the outer boundary reads them, each with its measured thickness");
        Ok(ghost.Contains("foreach (var mw in new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>())")
           && ghost.Contains("bb.Min.Z > planeFt + planeTolFt || bb.Max.Z <= planeFt + planeTolFt) continue;")
           && ghost.IndexOf("foreach (var mw in new FilteredElementCollector(doc)", StringComparison.Ordinal) > ghost.IndexOf("drawnAt[el] = drawn.Count;", StringComparison.Ordinal),
           "…and, after them (so a drawn wall's index holds), the model's own walls that cross the build level as barriers — a fit-out drawing in a model with its shell reads its partitions as inside (review C1)");
        Ok(ghost.Contains("string type = typer.ResolveWallType(el, map, out string gap, out string typedBy, GhostFacts(el));")
           && ghost.Contains("string loc = drawnAt.TryGetValue(el, out int at) ? WallLocation.Locate(drawn, at, out _) : null;")
           && ghost.Contains("if (loc != null) facts[\"Location\"] = loc;") && !ghost.Contains("facts[pa.Name]"),
           "each wall's rule sees its Location when the boundary reads one and nothing else — the mapping's parameter values (the local model's reading of the documents) never pick a type (review C4)");
        Ok(ghost.Contains("report.Warnings.Add(WallLocation.Summary(") && ghost.IndexOf("report.Warnings.Add(WallLocation.Summary(", StringComparison.Ordinal) > ghost.IndexOf("report.Warnings.AddRange(typer.Notes);", StringComparison.Ordinal),
           "the summary says how many walls read outside, inside and unknown, after the types are settled");
        string factory = Src("GhostBuilder", "ElementPlacementFactory.cs");
        Ok(factory.Contains("internal string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason, out string typedBy, Dictionary<string, string> facts = null)")
           && factory.Contains("Params = facts,"),
           "the typer passes the facts to the matcher as when.params — the same names the bridge and Promote use");
        Ok(Src("UI", "ChangesetReviewWindow.cs").Contains("if (ChangesetTrust.Typing(el) is string typing) label.Text += \"  ·  \" + typing;"),
           "Review AI Proposals says when the bridge typed an element, beside its accuracy");
        string executor = Src("GhostBuilder", "ChangesetExecutor.cs");
        Ok(!executor.Contains("if (kind == \"wall\") return null;") && executor.Contains("cw.Kind == WallKind.Basic && nw.Kind == WallKind.Basic && Math.Abs(nw.Width - cw.Width) > TolFt")
           && executor.Contains("mm — a retype would move a face; a person decides\";"),
           "the executor refuses a wall retype whose target width is not the wall's (a bridge-typed retype's thickness is the poster's claim) — and checks nothing else about a wall, as before (review C3)");
    }
}
