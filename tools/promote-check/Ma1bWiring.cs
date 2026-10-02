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
    }
}
