#nullable disable
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-3c: the ghost overlay — its geometry (pure) and its wiring ──
    static void Ma3cChecks()
    {
        Console.WriteLine("\nMA-3c — the ghost overlay: its geometry (pure) and its wiring");
        ChangesetElementDto El(string kind, PlaceDto p, string op = "create") => new ChangesetElementDto { Kind = kind, Op = op, Place = p };
        var wall = El("wall", new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0 }, End = new double[] { 4000, 0 } }, BaseElevation = 0, TopElevation = 3000 });
        var s = GhostOverlayGeometry.Segments(wall, true, false);
        Ok(s.Count == 4 && s.All(x => (x.A[2] == 0 || x.A[2] == 3000) && (x.B[2] == 0 || x.B[2] == 3000)), "MA-3c: a straight wall is 4 segments (base, top, two verticals) at its base and top");
        Ok(s.All(x => x.R == 0 && x.G == 170 && x.Bl == 90)
           && GhostOverlayGeometry.Segments(wall, false, false).All(x => x.R == 140 && x.G == 140 && x.Bl == 140)
           && GhostOverlayGeometry.Segments(wall, true, true).All(x => x.R == 200 && x.G == 60 && x.Bl == 60)
           && GhostOverlayGeometry.Segments(wall, false, true).All(x => x.R == 200 && x.G == 60 && x.Bl == 60),
           "MA-3c: ticked is green, unticked grey, declined red whatever the tick");
        var noTop = El("wall", new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0 }, End = new double[] { 4000, 0 } }, BaseElevation = 500 });
        Ok(GhostOverlayGeometry.Segments(noTop, true, false).Max(x => x.A[2]) == 500 + GhostOverlayGeometry.SketchHeightMm, "MA-3c: a wall with no top is sketched SketchHeightMm above its base");
        var arc = El("wall", new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0 }, Mid = new double[] { 2000, 2000 }, End = new double[] { 4000, 0 } }, BaseElevation = 0, TopElevation = 3000 });
        var pts = GhostOverlayGeometry.Arc(new double[] { 0, 0 }, new double[] { 2000, 2000 }, new double[] { 4000, 0 });
        Ok(GhostOverlayGeometry.Segments(arc, true, false).Count == 2 * GhostOverlayGeometry.ArcChords + 2 && pts.Count == GhostOverlayGeometry.ArcChords + 1
           && pts[0][0] == 0 && pts[0][1] == 0 && pts[GhostOverlayGeometry.ArcChords][0] == 4000 && pts[GhostOverlayGeometry.ArcChords][1] == 0
           && Math.Sqrt(Math.Pow(pts[GhostOverlayGeometry.ArcChords / 2][0] - 2000, 2) + Math.Pow(pts[GhostOverlayGeometry.ArcChords / 2][1] - 2000, 2)) < 1,
           "MA-3c: an arc wall is sampled in ArcChords chords through its Mid");
        var sq = new[] { new double[] { 0, 0 }, new double[] { 5000, 0 }, new double[] { 5000, 5000 }, new double[] { 0, 5000 } };
        var fl = GhostOverlayGeometry.Segments(El("floor", new PlaceDto { Boundary = sq, BaseElevation = 3000 }), true, false);
        var fl2 = GhostOverlayGeometry.Segments(El("floor", new PlaceDto { LocationLoop = sq, BaseElevation = 3000 }), true, false);
        Ok(fl.Count == 4 && fl.All(x => x.A[2] == 3000 && x.B[2] == 3000) && fl2.Count == 4, "MA-3c: a floor is its closed loop at its base; LocationLoop is used when Boundary is null");
        Ok(GhostOverlayGeometry.Segments(El("grid", new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0 }, End = new double[] { 0, 9000 } } }), true, false).Count == 1
           && GhostOverlayGeometry.Segments(El("door", new PlaceDto { Location = new double[] { 1000, 2000 } }), true, false) is var dr && dr.Count == 3
           && dr.Any(x => x.B[2] - x.A[2] == GhostOverlayGeometry.PointCrossMm),
           "MA-3c: a grid is one segment; a door or window point is a cross and a vertical of PointCrossMm");
        var none = new[] { El("wall", wall.Place, "retype"), El("wall", wall.Place, "set_parameter"), El("level", new PlaceDto { Name = "L1", BaseElevation = 0 }), El("wall", null) };
        Ok(none.All(e => GhostOverlayGeometry.Segments(e, true, false).Count == 0) && none.Where(e => e.Kind != "level").All(e => !GhostOverlayGeometry.IsCreate(e)), "MA-3c: a retype, a type edit, a level and a create with no place draw nothing");
        var b = GhostOverlayGeometry.Bounds(s);
        Ok(b != null && b[0].SequenceEqual(new double[] { 0, 0, 0 }) && b[1].SequenceEqual(new double[] { 4000, 0, 3000 }) && GhostOverlayGeometry.Bounds(new List<GhostOverlayGeometry.Segment>()) == null, "MA-3c: Bounds is the least and greatest corner, null when empty");
        Ok(GhostOverlayGeometry.Line(0, 0) == "No ghost to draw: this review proposes no create (a retype or attach changes an element that exists — Show selects it)."
           && GhostOverlayGeometry.Line(3, 7) == "7 outline(s) of 3 proposed create(s) drawn in this model's 3D views — ticked green, unticked grey, declined red; nothing is written. Open a 3D view to see them; they go when this window closes or Apply places them.",
           "MA-3c: the window's line says how many outlines, in which colours, and when they go");
        string geo = Src("GhostBuilder", "GhostOverlayGeometry.cs");
        Ok(!geo.Contains("Autodesk.Revit") && !geo.Contains("Transaction"), "MA-3c: the geometry is pure - no Revit type, no Transaction");
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        string srv = Src("GhostBuilder", "GhostOverlayServer.cs"), rev = Src("Commands.ReviewChangesets.cs"), win = Src("UI", "ChangesetReviewWindow.cs");
        Ok(srv.Contains("public bool CanExecute(View view) => view is View3D && view.Document != null && view.Document.Equals(_doc) && _segments.Count > 0;")
           && srv.Contains("PrimitiveType.LineList") && srv.Contains("if (DrawContext.IsTransparentPass()") && !srv.Contains("Transaction"),
           "MA-3c: the server draws lines in this document's 3D views only, skips the transparent pass, and writes nothing (no Transaction)");
        Ok(rev.Contains("App.Events.Enqueue(doc, \"draw the ghost overlay\"") && rev.Contains("App.Events.Enqueue(doc, \"recolour the ghost overlay\"")
           && rev.Contains("\"remove the ghost overlay\"") && rev.Contains("window.Closed += (_, _) => OverlayOff(\"the window closed\");")
           && rev.Contains("if (window.Applied) { OverlayOff(\"Apply\"); return; }"),
           "MA-3c: the overlay is drawn and recoloured on the model in front through the hub, and removed when the window closes or Apply is pressed");
        Ok(win.Contains("public event Action<List<(ChangesetElementDto El, bool Ticked, bool Locked)>> TicksChanged;") && win.Contains("public bool Applied => _applied;"),
           "MA-3c: the window says every row's state after a tick, a Lock or Apply");
        Ok(Count(rev, "GhostOverlayServer.Register(") == 1 && Count(rev, "GhostOverlayServer.Remove(") == 1, "MA-3c: the overlay is registered once and removed in one place");
    }
}
