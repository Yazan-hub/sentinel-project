#nullable disable

static partial class Check
{
    // ── 22. MA-1b: the Revit-bound wiring, as a source scan (proven live in drill MA1b) ────────────────────────────────
    static void Ma1bWiringChecks()
    {
        Console.WriteLine("\nMA-1b wiring (source scan: the executor, the reader, the planner, Photo Massing's review)");
        string executor = Src("GhostBuilder", "ChangesetExecutor.cs");
        Ok(executor.Contains("bool turnHand = PlacementGeometry.Opposes(fi.HandOrientation.X, fi.HandOrientation.Y, hx, hy) && fi.CanFlipHand;")
           && executor.Contains("bool turnFacing = PlacementGeometry.Opposes(fi.FacingOrientation.X, fi.FacingOrientation.Y, fx, fy) && fi.CanFlipFacing;")
           && executor.IndexOf("if (turnHand) fi.flipHand();", StringComparison.Ordinal) > executor.IndexOf("bool turnFacing =", StringComparison.Ordinal),
           "the executor reads both answers before either flip, then flips a block's door toward the drawing's hinge side and swing side, only where its family can (drill MA1b)");
        int commit = executor.IndexOf("var status = t.Commit();", StringComparison.Ordinal), measured = executor.IndexOf("result.Turned.Add(PlacementGeometry.Turn(", StringComparison.Ordinal);
        Ok(commit > 0 && measured > commit, "what a placed door holds is measured after the commit, never promised before it");
        // Drill MA1b (F-MA1b-2): the flips run in their own transaction after the creating one committed — the facing a fresh
        // door reports inside that transaction was the reverse of the committed one on every wall drawn with a negative Y.
        int turned = executor.IndexOf("TurnToBlocks(doc, cs, toPlace, result);", StringComparison.Ordinal), flipped = executor.IndexOf("if (turnFacing) fi.flipFacing();", StringComparison.Ordinal);
        Ok(turned > commit && turned < measured && flipped > executor.IndexOf("private static void TurnToBlocks(", StringComparison.Ordinal)
           && !executor.Contains("doc.Regenerate(); // the orientations of an instance created in this transaction"),
           "a block's door is turned after the commit, in its own transaction, from the orientation the model holds (drill MA1b)");
        Ok(executor.Contains("catch (Exception) { result.Turned.Add((Label(el), double.NaN, false, false, false, false)); }"),
           "a direction that cannot be read back is recorded as unread — it never undoes what Revit committed");
        int refused = executor.IndexOf("PlacementGeometry.AcrossWall(lines[i].Label, lines[i].X0, lines[i].Y0, lines[i].X1, lines[i].Y1, along) is string across", StringComparison.Ordinal);
        Ok(refused > 0 && refused < executor.IndexOf("var fi = doc.Create.NewFamilyInstance(Pt(p), sym, hosts[i], level, StructuralType.NonStructural);", StringComparison.Ordinal),
           "the executor refuses a Rotation that does not run along the host wall, before it creates that instance (an agent's changeset is not snapped by Ghost); the rollback takes the rest of the changeset with it");
        Ok(executor.Contains("before this instance is created; the rollback takes the rest of the changeset with it") && !executor.Contains("before anything is created"),
           "the executor's words say what happens: this instance is refused before it exists, and the changeset's earlier elements go back with it");
        Ok(executor.Contains("fi.FacingOrientation.X, fi.FacingOrientation.Y, fi.CanFlipHand, fi.CanFlipFacing));"),
           "whether a family lacks a flip is read from the instance after the commit, never assumed");
        Ok(Src("GhostBuilder", "ChangesetPlacementEvent.cs").Contains("AddRange(PlacementGeometry.TurnLines(result.Turned))"),
           "Review AI Proposals shows the same lines for a changeset that carries a Rotation");

        string reader = Src("GhostBuilder", "GhostBuilder_ExtractionAndPlacement.cs");
        Ok(reader.Contains("Transform t = import.Transform.Multiply(gi.Transform);")
           && reader.Contains("PlacementGeometry.Frame(t.BasisX.X, t.BasisX.Y, t.BasisY.X, t.BasisY.Y)"),
           "the reader composes each insert's transform with the import's own, and takes the angle and the mirror from the composed axes");
        Ok(reader.Contains("PlacementGeometry.BlockCentre(t.Origin.X * FtToMm, t.Origin.Y * FtToMm, rotation, drawn)"),
           "a block stands at the middle of what it draws, not at its insertion point");
        // Drill MA1b (F-MA1b-1): the loose curves are read from the import's SYMBOL geometry, where a block is still one nested
        // instance (the instance geometry flattens blocks into loose curves: 36 on A-DOOR for 12 blocks); a nested instance is
        // AddBlocks's alone, so a drawing of blocks gives no stray point and no block's curves become elements.
        Ok(reader.Contains("GeometryElement symbol = instance.GetSymbolGeometry();") && reader.Contains("if (n is GeometryInstance) continue;")
           && reader.Contains("c.CreateTransformed(t)") && reader.Contains("pl.GetTransformed(t)") && !reader.Contains("instance.GetInstanceGeometry();"),
           "the loose curves come from the symbol geometry, carried into the model's frame; a block's curves are never loose elements (drill MA1b)");
        Ok(reader.Contains("Nested = nested }"), "the reader counts the blocks inside a block — the planner says they were read as one");
        Ok(Src("GhostBuilder", "GhostBuilderOrchestrator.cs").Contains(".Concat(elements.Where(e => e.Block != null).Select(e => e.CadLayer))"),
           "a layer that holds only block inserts is still a row of the review");

        string planner = Src("GhostBuilder", "GhostChangesetBuild.cs");
        int snap = planner.IndexOf("PlacementGeometry.Snap(straight, halves, level.Name, x, y, el.Block?.RotationDeg, out string hostWhy)", StringComparison.Ordinal);
        int hostRule = planner.IndexOf("hostWhy = HostProblem(x, y);", StringComparison.Ordinal);
        Ok(snap > 0 && hostRule > snap, "Ghost's planner snaps a door or window onto its wall, then asks the executor's own host rule at the moved point");
        Ok(planner.Contains("halves.Add(width / 2);") && planner.Contains("ChangesetExecutor.ResolveWallType(doc, type).Width * FtToMm"),
           "half a wall's thickness is half its TYPE's width — what the wall will be, also for a wall drawn as one line");
        Ok(planner.Contains("hosted ? el.Block?.RotationDeg : null, el.Block?.Mirrored == true"), "a hosted block is filed with its angle and mirror; an outline with none");
        Ok(planner.Contains("if (el.Block != null && k.Kind != \"door\" && k.Kind != \"window\")") && planner.Contains("report.SkippedBlocks += kv.Value;")
           && Src("Commands.GhostBuilder.cs").Contains("Skipped (a block on a row that is not Doors or Windows): {r.SkippedBlocks}")
           && planner.Contains("report.SkippedNoHost + report.SkippedDuplicate + report.SkippedNoGeometry + report.SkippedUnknownFamily + report.SkippedBlocks,"),
           "a block on a row that is not Doors or Windows is not placed: counted, named, and in the ledger report's skipped count");
        // Review (2026-10-03): a block on a Walls row is set aside where the walls are typed — never a silent SkippedNoGeometry.
        int wallRow = planner.IndexOf("if (el.Block != null) { NoteNested($\"Walls on '{el.CadLayer}'\", el); SetAside(el); continue; }", StringComparison.Ordinal);
        Ok(wallRow > 0 && wallRow < planner.IndexOf("typer.ResolveWallType(el, map, out string gap, out string typedBy", StringComparison.Ordinal), // MA-2a adds the facts argument
           "a block on a Walls row is counted and named with the other blocks, before it is typed as a wall");
        // Review (2026-10-03, amendment C5): the "read as ONE block" sentence is said on every ticked row, before the E17 set-aside.
        int nested = planner.IndexOf("NoteNested(what, el);", StringComparison.Ordinal);
        Ok(nested > 0 && nested < planner.IndexOf("if (el.Block != null && k.Kind != \"door\" && k.Kind != \"window\")", StringComparison.Ordinal),
           "a block that holds blocks is said to be read as one on a Columns, Furniture or Floors row too, not only on a Doors or Windows row");
        Ok(planner.Contains("if (PlacementGeometry.IsBrokenWall(hostWhy)) report.SkippedBrokenWall++;")
           && Src("Commands.GhostBuilder.cs").Contains("of these, where a wall line stops short of the opening"),
           "a door or window at a wall broken at the opening is counted on its own summary line");
        Ok(planner.Contains("if (el.Block?.Nested > 0)"), "a block that holds blocks inside it is said to be read as one");
        // F4 option B (drill B1-10, 2026-10-03: Revit answers two identical doors at one point with an error that rolls the whole
        // build back): the second block at a planned door's or window's point is named a duplicate and not filed — after the
        // snap and the host rule (both points are on the wall's line), before the plan takes it.
        int dup = planner.IndexOf("report.SkippedDuplicate++;", StringComparison.Ordinal);
        int filedPoint = planner.IndexOf("plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Point(", StringComparison.Ordinal);
        Ok(dup > hostRule && dup < filedPoint && planner.Contains("hostedAt.Where(h => h.Kind == k.Kind && Math.Abs(h.X - x) <= 1 && Math.Abs(h.Y - y) <= 1)")
           && planner.Contains("hostedAt.Add((k.Kind, x, y, what));")
           && Src("Commands.GhostBuilder.cs").Contains("a duplicate in the drawing, not filed; F4): {r.SkippedDuplicate}"),
           "a second door or window block within 1 mm of one already planned is named a duplicate and not filed (F4 B), counted on its own summary line and in the ledger's skipped count");
        Ok(planner.Contains("if (GhostFiling.LostRotation(chunks[c], cs.Elements))"), "a bridge that dropped the angle abandons the build before anything is placed");
        Ok(planner.Contains("report.Placement.AddRange(PlacementGeometry.TurnLines(results.SelectMany(x => x.Turned).ToList()));"),
           "the summary says how the placed doors sit against their blocks, from what the executor measured after the commit");
        Ok(!planner.Contains("GHB-1, MA-1b)") && Src("Commands.GhostBuilder.cs").Contains("within half its thickness of the door or window"),
           "the gap's words no longer say the snap is still to come");

        string massing = Src("Commands.Massing.cs"), massingReview = Src("UI", "MassingReviewWindow.cs");
        Ok(massingReview.Contains("if (!_build.IsEnabled) return;") && massingReview.Contains("_build.IsEnabled = false;"),
           "MAS-4: Photo Massing's Build is disabled by the click that builds");
        Ok(massing.Contains("MassingPlanner.BuildKept(error != null, report?.RolledBack != null, report?.NotFinished != null, report?.Placed ?? 0)")
           && massing.Contains("if (kept) review.Close();") && massing.Contains("else review.Reopen(MassingPlanner.ReopenStatus);"),
           "MAS-4: the command closes the review when the build is kept, and reopens it when nothing was built");
        Ok(massing.Contains("report.NewElements.Select(n => n.Id).Where(id => uidoc.Document.GetElement(id) != null)")
           && massing.Contains("uidoc.Selection.SetElementIds(ids);") && massing.Contains("uidoc.ShowElements(ids);")
           && massing.Contains("MassingPlanner.SelectedLine(uidoc.Selection.GetElementIds().Count, ids.Count)"),
           "MAS-4: what was placed and is still in the model is selected and zoomed to, and the line prints what Revit holds selected, read back");
        Ok(massing.Contains("App.Events.Enqueue(ua => placementEvent.Execute(ua), \"place the massing build\");") && massingReview.Contains("Reopen(MassingPlanner.NotStarted(ex.Message));"),
           "MAS-4 (SEC-7): a build request goes through the event hub — one Revit does not take at once is held, said and raised again, never lost; one that threw before it was queued reopens the review");
    }
}
