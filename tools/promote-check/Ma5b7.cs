#nullable disable

static partial class Check
{
    // ── MA-5b-7: Datum reads the office's datum layers and a person reviews each row (source scan: the command is Revit-bound) ──
    static void Ma5b7Checks()
    {
        Console.WriteLine("\nMA-5b-7 — Datum from the office's layers, reviewed row by row");
        string cmd = Src("Commands.Datum.cs"), b = Src("GhostBuilder", "DatumBuilder.cs");
        int load = cmd.IndexOf("GhostStandards.Load(key, layers: true, catalog: false)", StringComparison.Ordinal),
            pick = cmd.IndexOf("new Sentinel.UI.DwgPickWindow(", StringComparison.Ordinal),
            review = cmd.IndexOf("new Sentinel.UI.DatumReviewWindow(", StringComparison.Ordinal),
            build = cmd.IndexOf("builder.Build(detected, placing)", StringComparison.Ordinal);
        Ok(load > 0 && pick > load && review > pick && build > review && cmd.Contains("builder.Detect(src)") && cmd.Contains("DetectFromFiles(new[] { pick.SelectedPath }, src,")
           && cmd.Contains("(detected.Levels, detected.Grids) = DatumRows.Picked(review.Rows);") && !cmd.Contains("TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No")
           && cmd.Contains("standards.Layers.Datum is { } datumLayers ? DatumBuilder.DatumSource.Of(") && cmd.Contains("detected.SeenLayers"),
           "the layers@n datum section is read before a drawing is picked; the rows a person ticks and types are what Build creates (no Yes/No); a read that finds nothing lists the drawing's layers");
        Ok(b.Contains("level.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.Set(lv.Story ? 1 : 0);") && b.Contains("DatumFromDrawing.SameLine(g,")
           && b.Contains("res.SeenLayers.Add(layer);") && !b.Contains("DetectFromFolder") && !b.Contains("LayerMatches("),
           "Build sets Building Story as left in the review, keeps a grid on a line already in the model (by position, not name), and records every layer seen");
        // MA-5b-8 (DAT-5): arcs on grid layers reach Grids; an arc grid is created as an arc and kept when one stands on it
        Ok(b.Contains("if (src.IsGrid(layer)) { res.GridArcs.Add(ToArc(arc)); res.GridLayers.Add(layer); }") && b.Contains("DatumFromDrawing.Grids(gridSegs, src.GridMergeMm, src.Skip, res.GridArcs, res.Warnings)")
           && b.Contains("? Grid.Create(_doc, Arc.Create(new XYZ(g.Cx * MmToFeet, g.Cy * MmToFeet, 0), g.R * MmToFeet,") && b.Contains("x.Curve is Arc ea && DatumFromDrawing.SameArc(g,"),
           "MA-5b-8: arcs on a grid layer are read, created as arc grids, and an arc grid already in the model is kept");
        // Drill MA5b batch 2 (F-1): Ghost refuses an elevation, a section, a drafting or a 3D view before a drawing is picked
        string ghost = Src("Commands.GhostBuilder.cs");
        int refuse = ghost.IndexOf("if (uidoc.ActiveView.ViewType is ViewType.Elevation or ViewType.Section or ViewType.Detail or ViewType.DraftingView or ViewType.ThreeD", StringComparison.Ordinal),
            acquire = ghost.IndexOf("// 2. Acquire the DWG", StringComparison.Ordinal);
        Ok(refuse > 0 && acquire > refuse && ghost.Contains("Ghost Builder reads a plan drawing into a plan view"),
           "drill F-1: Ghost Builder refuses a non-plan view, in words, before a drawing is picked (an elevation put the drawing in its vertical plane)");
    }
}
