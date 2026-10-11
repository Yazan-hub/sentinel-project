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
    }
}
