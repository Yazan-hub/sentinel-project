#nullable disable

static partial class Check
{
    // ── 22. MA-1b: the Revit-bound wiring, as a source scan (proven live in drill MA1b) ────────────────────────────────
    static void Ma1bWiringChecks()
    {
        Console.WriteLine("\nMA-1b wiring (source scan: the executor, the reader, the planner, Photo Massing's review)");
        string executor = Src("GhostBuilder", "ChangesetExecutor.cs");
        Ok(executor.Contains("PlacementGeometry.Opposes(fi.HandOrientation.X, fi.HandOrientation.Y, hx, hy) && fi.CanFlipHand) fi.flipHand();")
           && executor.Contains("PlacementGeometry.Opposes(fi.FacingOrientation.X, fi.FacingOrientation.Y, fx, fy) && fi.CanFlipFacing) fi.flipFacing();"),
           "the executor flips a block's door toward the drawing's hinge side and swing side, only where its family can");
        int commit = executor.IndexOf("var status = t.Commit();", StringComparison.Ordinal), measured = executor.IndexOf("result.Turned.Add(PlacementGeometry.Turn(", StringComparison.Ordinal);
        Ok(commit > 0 && measured > commit, "what a placed door holds is measured after the commit, never promised before it");
        Ok(executor.Contains("catch (Exception) { result.Turned.Add((Label(el), double.NaN, false, false, false, false)); }"),
           "a direction that cannot be read back is recorded as unread — it never undoes what Revit committed");
        int refused = executor.IndexOf("PlacementGeometry.AcrossWall(lines[i].Label, lines[i].X0, lines[i].Y0, lines[i].X1, lines[i].Y1, along) is string across", StringComparison.Ordinal);
        Ok(refused > 0 && refused < executor.IndexOf("var fi = doc.Create.NewFamilyInstance(Pt(p), sym, hosts[i], level, StructuralType.NonStructural);", StringComparison.Ordinal),
           "the executor refuses a Rotation that does not run along the host wall, before it creates the instance (an agent's changeset is not snapped by Ghost)");
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
        Ok(reader.Contains("n is Curve || n is PolyLine || n is GeometryInstance"), "a drawing that holds only blocks gives no stray point at the import's origin");
        Ok(reader.Contains("Nested = nested }"), "the reader counts the blocks inside a block — the planner says they were read as one");
        Ok(Src("GhostBuilder", "GhostBuilderOrchestrator.cs").Contains(".Concat(elements.Where(e => e.Block != null).Select(e => e.CadLayer))"),
           "a layer that holds only block inserts is still a row of the review");
    }
}
