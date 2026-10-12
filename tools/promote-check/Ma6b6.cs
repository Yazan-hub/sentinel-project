#nullable disable
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-6-6: Photo Massing v2 (MAS-2 + MAS-1) — the mass kind in the overlay (pure), the executor's DirectShape (D13, amendment 3), the
    // review's Shell-it line, the command that files one changeset (amendment 4), and the old placement path gone (R12) ──
    static void Ma6b6Checks()
    {
        Console.WriteLine("\nMA-6-6 — Photo Massing v2: the mass in the overlay, the executor, the review, the command and the deletions");

        // The overlay (pure): the Boundary at the base and at the top, an upright at each vertex; the side quads and two fans. Amendment 3:
        // the elevations are in the Level.Elevation frame, so frameMm (the nearest level's ProjectElevation less its Elevation) lifts it.
        var mass = new ChangesetElementDto { Op = "create", Kind = "mass", Place = new PlaceDto
        {
            Boundary = new[] { new double[] { -6000, -4000 }, new double[] { 6000, -4000 }, new double[] { 6000, 4000 }, new double[] { -6000, 4000 } },
            BaseElevation = 0, TopElevation = 9600,
        } };
        var segs = GhostOverlayGeometry.Segments(mass, true, false);
        var lifted = GhostOverlayGeometry.Segments(mass, true, false, frameMm: 300);
        double Lo(IEnumerable<GhostOverlayGeometry.Segment> s) => s.Min(x => Math.Min(x.A[2], x.B[2]));
        double Hi(IEnumerable<GhostOverlayGeometry.Segment> s) => s.Max(x => Math.Max(x.A[2], x.B[2]));
        Ok(GhostOverlayGeometry.Drawable(mass) && segs.Count == 12 && Lo(segs) == 0 && Hi(segs) == 9600 && Lo(lifted) == 300 && Hi(lifted) == 9900
           && segs.Count(x => x.A[2] == 0 && x.B[2] == 9600) == 4,
           "the overlay draws a mass: its footprint at 0 and at 9600, an upright at each of 4 corners — lifted by the frame offset (amendment 3)");
        var tris = GhostOverlayGeometry.Tris(mass, true, false);
        Ok(tris.Count == 4 * 4 + 2 * 2 * 2 && tris.All(t => new[] { t.A[2], t.B[2], t.C[2] }.All(z => z == 0 || z == 9600))
           && GhostOverlayGeometry.AllTris(new[] { (mass, true, false) }, null, null, _ => 300).All(t => t.A[2] >= 300)
           && GhostOverlayGeometry.All(new[] { (mass, true, false) }, null, null, _ => 300).Count == 12,
           "…as faces: a quad per side and fans at the bottom and the top, both windings; All and AllTris pass the frame offset per row");
        var noTop = new ChangesetElementDto { Op = "create", Kind = "mass", Place = new PlaceDto { Boundary = mass.Place.Boundary, BaseElevation = 0 } };
        Ok(GhostOverlayGeometry.Segments(noTop, true, false).Count == 0 && GhostOverlayGeometry.Tris(noTop, true, false).Count == 0,
           "a mass without both elevations draws nothing (the bridge refuses one)");

        // The executor (Revit-bound, a source scan): Mass asked before the DirectShape is made, the Generic Model fallback said (D13), z0 from the
        // resolved level's ProjectElevation (amendment 3), a Sentinel DirectShape (Shell's pick takes it, amendment 11), before the drift guard.
        string ex = Src("GhostBuilder", "ChangesetExecutor.cs");
        int asked = ex.IndexOf("if (!DirectShape.IsValidCategoryId(cat, doc))", StringComparison.Ordinal), made = ex.IndexOf("var ds = DirectShape.CreateElement(doc, cat);", StringComparison.Ordinal);
        Ok(asked > 0 && made > asked && ex.Contains("cat = new ElementId(BuiltInCategory.OST_GenericModel);")
           && ex.Contains("result.MassAs = \"Mass: placed as Generic Models — this Revit refuses a DirectShape in Mass (D13); Shell it still works\";")
           && ex.Contains("var lvl = ResolveLevel(doc, new PlaceDto { BaseElevation = baseMm });")
           && ex.Contains("var z0 = lvl.ProjectElevation + (baseMm * MmToFeet - lvl.Elevation);")
           && ex.Contains("var loop = CurveLoop.Create(Outline(el.Place.Boundary, z0, $\"mass \\\"{name}\\\"\"));")
           && ex.Contains("ds.ApplicationId = \"Sentinel\";") && ex.Contains("ds.ApplicationDataId = el.ProposalGuid;")
           && made < ex.IndexOf("ticked element(s) of unsupported kind or op were not placed", StringComparison.Ordinal),
           "the executor asks whether Mass takes a DirectShape before making one, falls back to Generic Models in words (D13), extrudes from the level's ProjectElevation (amendment 3), and places it before the drift guard");
        Ok(ex.Contains("_ => null, // a level, grid, room, opening or mass (MA-6-6) names no type"),
           "NotLoaded asks no type for a mass (6-5's pre-check): a mass row is never 'not loaded'");
        string pe = Src("GhostBuilder", "ChangesetPlacementEvent.cs"), review = Src("Commands.ReviewChangesets.cs");
        Ok(pe.Contains("result.MassAs ??= res.MassAs; // MA-6-6 (D13)") && pe.Contains("if (result.MassAs != null) (result.Placement ??= new System.Collections.Generic.List<string>()).Add(result.MassAs);")
           && review.Contains("if (res.MassAs != null) said = res.MassAs + (string.IsNullOrEmpty(said) ? \"\" : \" | \" + said);"),
           "the fallback is said on the Apply dialog (the placement lines) and on its changeset's own ledger note (D13)");
        Ok(review.Contains("? \"\\n\\nNext: Shell it — select the mass and run Model from Drawings ▸ 2c · Shell a Mass\" : \"\";")
           && review.Contains("fresh.Where(f => f.Source == \"photo\")") && review.Contains("(after != null ? \"\\n\\n\" + after : \"\") + next;")
           && review.Contains("double? FrameOf(ChangesetElementDto e) =>") && review.Contains("(l.ProjectElevation - l.Elevation) * 304.8"),
           "after Apply of a photo changeset that placed a mass, the message ends with the Shell-it step (M-2); the overlay reads each mass's frame offset on the API thread");

        // The command (amendment 4): bound and the review guard free before an image is read; the levels read and the body planned on Revit's
        // thread through the hub when the person files; filed off it under the guard, the person's token or none; the review opened on it.
        string cmd = Src("Commands.Massing.cs");
        int bound = cmd.IndexOf("if (!ctx.IsBound)", StringComparison.Ordinal), held = cmd.IndexOf("if (ReviewChangesetsCommand.Held)", StringComparison.Ordinal);
        int images = cmd.IndexOf("MassingVisionReader.CountImages(folder) == 0", StringComparison.Ordinal);
        int plan = cmd.IndexOf("private static void PlanAndFile(", StringComparison.Ordinal);
        Ok(bound > 0 && held > bound && images > held && cmd.Contains("TaskDialog.Show(Title, ProjectContext.NotBound);") && cmd.Contains("TaskDialog.Show(Title, ReviewChangesetsCommand.Busy);"),
           "Photo Massing says an unbound model and a busy review before an image is read (amendment 4)");
        Ok(plan > 0 && cmd.IndexOf("if (ProjectContext.For(doc).Key != key)", plan, StringComparison.Ordinal) > plan
           && cmd.IndexOf("var levels = ChangesetExecutor.Stories(doc).Select(l => (l.Name, l.ElevationMm, l.IsStory)).ToList();", plan, StringComparison.Ordinal) > plan
           && cmd.Contains("var (body, refusal) = MassingPlanner.Changeset(corrected, levels, actor, fp);")
           && cmd.IndexOf("ReviewChangesetsCommand.Hold();", StringComparison.Ordinal) > cmd.IndexOf("if (refusal != null)", StringComparison.Ordinal)
           && cmd.Contains("if (UserSession.IsSignedIn) fileCfg.FileToken = \"\";") && cmd.Contains("finally { ReviewChangesetsCommand.Release(); }")
           && cmd.Contains("ReviewChangesetsCommand.Open(u, d, cfg, key, new[] { cs });"),
           "the key re-checked, the levels read and the body planned when the person files (not when the review opened), filed under the guard with the person's token or none, then the review opens on it");
        Ok(cmd.Contains("receipt.Parameters[\"openings_seen\"] = MassingPlanner.OpeningsSeen(corrected);")
           && cmd.Contains("receipt.Parameters[\"images_sha256\"] = MassingPlanner.HasModelValue(corrected) ? imagesSha : null;")
           && cmd.Contains("BuildReceipt.Run(\"photo-massing\", BuildReceipt.AddinSha256, receipt, 0, new List<string> { cs.Id }, actor)"),
           "the build:run receipt carries the openings seen (D12), the images' sha only while a number is the model's (E7), and the filed changeset");
        // MA-6-9 (C14): the receipt names the views and the known dimension; the progress line counts photos; the reader sends p1_measure.py's
        // prompt and schema, one call per photo, counted per call (Trust.cs pins the Usage literals).
        string reader = Src("GhostBuilder", "MassingVisionReader.cs");
        Ok(cmd.Contains("receipt.Parameters[\"views\"] = corrected.ViewLines;") && cmd.Contains("receipt.Parameters[\"known_dimension\"] = MassingPlanner.KnownWords(corrected);")
           && cmd.Contains("progress: new Progress<string>(progress.SetStatus)") && reader.Contains("$\"Reading photo {i + 1} of {images.Count}…\""),
           "MA-6-9: the Photo Massing receipt carries views (one line per photo) and known_dimension; the progress line reads \"Reading photo i of n…\"");
        Ok(reader.Contains("\"Look at the tallest building in this photo. Count its storeys: the horizontal floor bands from the ground to the roof, \" +")
           && reader.Contains("\"Give no length in metres, feet or millimetres - counts and ratios only. Return only JSON.\";")
           && reader.Contains("\"required\"\": [\"\"storeys\"\", \"\"full_height\"\", \"\"height_to_width\"\", \"\"view\"\"]")
           && reader.Contains("options\"] = new { temperature = 0 }") && reader.Contains("return MassingPlanner.FromViews(views);")
           && !reader.Contains("MassingPlanner.Validate(") && !reader.Contains("footprintWidthMm"),
           "MA-6-9: the reader sends the prompt and schema row P-1 measured, at temperature 0, one call per photo, and hands the estimate on unvalidated (a count of 300 reaches ScaleRefusal)");
        // Review fix: a Photo Massing changeset still waiting is opened instead of filing a second (the same "Massing Lnn" levels, D16).
        int fetch = cmd.IndexOf("var pending = ChangesetClient.FetchProposed(cfg, key, out err);", plan, StringComparison.Ordinal);
        Ok(fetch > plan && fetch < cmd.IndexOf("cs = ChangesetClient.Propose(fileCfg, key, body, out err);", StringComparison.Ordinal)
           && cmd.Contains("waiting = pending?.FirstOrDefault(p => p.Source == \"photo\");")
           && cmd.Contains("if (pending != null && waiting == null) cs = ChangesetClient.Propose(fileCfg, key, body, out err);")
           && cmd.Contains("review.Reopen(MassingPlanner.NotStarted($\"\\\"{waiting.Name}\\\" already waits for review — it opens now: apply or decline it first\"));")
           && cmd.IndexOf("cs = waiting;", StringComparison.Ordinal) < cmd.IndexOf("ReviewChangesetsCommand.Open(u, d, cfg, key, new[] { cs });", StringComparison.Ordinal),
           "Photo Massing reads the waiting changesets off Revit's thread before it files: a photo one still waiting opens in the review instead, with words on the status line (review fix)");
        // Review fix: the reviewer ticks what the row shows — a mass's footprint and elevations on Revit's row; the DD line pluralises a mass.
        string row = Src("UI", "ChangesetReviewWindow.cs");
        Ok(row.Contains("if (el.Kind == \"mass\" && p?.Boundary is { Length: > 0 } bd && p.BaseElevation is double mb && p.TopElevation is double mt)")
           && row.Contains("parts.Add($\"{Mm(bd.Max(q => q[0]) - bd.Min(q => q[0]))} x {Mm(bd.Max(q => q[1]) - bd.Min(q => q[1]))} mm footprint, {Mm(mb)} to {Mm(mt)} mm\");")
           && StageIds.OutOfScope(new[] { "level", "level", "mass" }) == "DD IDS: not asked of 2 level(s), 1 mass(es): the DD IDS has no class for them",
           "a mass row reads its footprint extent and its two elevations (not only the poster's reason); the DD line says \"1 mass(es)\"");
        string planner = Src("GhostBuilder", "MassingPlanner.cs");
        Ok(planner.Contains("public static (object Body, string Refusal) Changeset(MassingEstimate m, IReadOnlyList<(string Name, double ElevationMm, bool IsStory)> levels, string actor, Footprint fp = null)")
           && !planner.Contains("LevelFact") && planner.Contains("source = \"photo\""),
           "MassingPlanner.Changeset is self-contained (amendment 4): tuples in, anonymous objects out — massing-check and ghost-p2-check compile it alone");
        Ok(Src("App.cs").Contains("then file one changeset — the missing levels and a mass — for review; nothing is placed until a person applies it in Review AI Proposals; then Shell it (2c · Shell a Mass)"),
           "the 2b tooltip says what Photo Massing does now: one changeset for review, then Shell it");

        // MA-6-10 (MAS-3): the footprint pick - asked after the guards and before the images are read; the picker's traps (Esc, view-specific imports).
        string picker = Src("GhostBuilder", "FootprintPicker.cs");
        int ask = cmd.IndexOf("Where does the mass stand?", StringComparison.Ordinal);
        Ok(ask > cmd.IndexOf("MassingVisionReader.CountImages(folder) == 0", StringComparison.Ordinal) && ask < cmd.IndexOf("Task.Run(async () =>", StringComparison.Ordinal)
           && ask < cmd.IndexOf("reader.EstimateAsync(", StringComparison.Ordinal)
           && cmd.Contains("MassingPlanner.Changeset(corrected, levels, actor, fp);") && cmd.Contains("FootprintPicker.Centre(uidoc, out string centreWhy)")
           && cmd.Contains("estimate.Footprint = fp;"),
           "MA-6-10: Photo Massing asks where the mass stands after the guards and before an image is read, and files the footprint it was given");
        Ok(picker.Contains("ObjectType.PointOnElement") && picker.Contains("public bool AllowReference(Reference r, XYZ p) => true;")
           && picker.Contains("e is ImportInstance || e is ModelCurve || e is PropertyLine")
           && picker.Contains("catch (Autodesk.Revit.Exceptions.OperationCanceledException)") && !picker.Contains("catch (OperationCanceledException)")
           && picker.Contains("if (imp.ViewSpecific)") && picker.Contains("opt.View = ov;") && !picker.Contains(": null }") // Options.View throws on null
           && cmd.Contains("uidoc.ActiveView is not ViewPlan") && picker.Contains("ArcNear(geo, at)") && picker.Contains("MassingPlanner.CadName(best.layer)")
           && cmd.Contains("MassingPlanner.OutlineProblem(norm)")
           && picker.Contains("the footprint has a curved edge — Sentinel takes straight edges only")
           && picker.Contains("the curve you picked is not a closed polyline — join it in CAD (PEDIT), or select model lines along it first"),
           "MA-6-10: the pick is a PointOnElement pick whose filter allows the reference, Esc is caught by its Revit name, a view-specific import is read in its view, and the refusals have the plan's words");

        // The bridge's half, the same names: the kind, its class and the source.
        string logic = File.ReadAllText(Repo("WebApp", "bridge", "changesets-logic.mjs"));
        Ok(logic.Contains("\"room\", \"opening\", \"beam\", \"mass\"];") && logic.Contains("mass: \"IFCBUILDINGELEMENTPROXY\"")
           && logic.Contains("export const ADDIN_SOURCES = [\"dwg\", \"promote\", \"photo\"];") && planner.Contains("Class = \"IFCBUILDINGELEMENTPROXY\", Name = \"Photo mass\""),
           "the bridge takes the mass kind under the class the planner posts (IFCBUILDINGELEMENTPROXY) and files photo as the add-in's source");

        // R12: the old placement path is gone — MassingBuilder, PlacePrepared and its placeholder types, the massing row, the web plan twin.
        var sep = Path.DirectorySeparatorChar;
        var sources = Directory.GetFiles(Repo("SentinelAddin"), "*.cs", SearchOption.AllDirectories)
            .Where(p => !p.Contains(sep + "obj" + sep) && !p.Contains(sep + "bin" + sep)).Select(File.ReadAllText).ToList();
        Ok(!File.Exists(Repo("SentinelAddin", "GhostBuilder", "MassingBuilder.cs")) && !sources.Any(s => s.Contains("PlacePrepared(") || s.Contains("placeholderTypes") || s.Contains("MassingPlacementEvent"))
           && !Src("Coordination", "CommandReports.cs").Contains("public static object Massing(")
           && !File.Exists(Repo("WebApp", "src", "sentinel-core", "massing-plan.ts")) && !File.Exists(Repo("WebApp", "src", "sentinel-core", "massing-plan.test.ts")),
           "Photo Massing's own placement path is gone (R12): MassingBuilder, PlacePrepared, the placeholder-type chain, the massing ledger row and the web's unused plan twin");
    }
}
