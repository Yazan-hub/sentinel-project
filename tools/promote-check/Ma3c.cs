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
        var fl = GhostOverlayGeometry.Segments(El("floor", new PlaceDto { LocationLoop = sq, Boundary = new double[0][], BaseElevation = 2900 }), true, false, 3000);
        Ok(fl.Count == 4 && fl.All(x => x.A[2] == 3000 && x.B[2] == 3000)
           && GhostOverlayGeometry.Segments(El("floor", new PlaceDto { Boundary = sq, BaseElevation = 3000 }), true, false).Count == 0,
           "MA-3c: a floor is its LocationLoop (the executor's source, whatever Boundary says) at its level");
        Ok(GhostOverlayGeometry.Segments(El("ceiling", new PlaceDto { Boundary = sq, Offset = 2700 }), true, false, 3000).All(x => x.A[2] == 5700)
           && GhostOverlayGeometry.Segments(El("roof", new PlaceDto { Boundary = sq, BaseOffset = 200 }), true, false, 9000).All(x => x.A[2] == 9200)
           && GhostOverlayGeometry.Segments(El("wall", new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0, 77 }, End = new double[] { 4000, 0, 77 } } }), true, false, 3000).Min(x => x.A[2]) == 3000,
           "MA-3c: a ceiling is at level + Offset, a roof at level + BaseOffset, a wall with no BaseElevation at its level - as the executor places them");
        Ok(GhostOverlayGeometry.Segments(El("grid", new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0 }, End = new double[] { 0, 9000 } } }), true, false).Count == 1
           && GhostOverlayGeometry.Segments(El("door", new PlaceDto { Location = new double[] { 1000, 2000 } }), true, false) is var dr && dr.Count == 3
           && dr.Any(x => x.B[2] - x.A[2] == GhostOverlayGeometry.PointCrossMm),
           "MA-3c: a grid is one segment; a door or window point is a cross and a vertical of PointCrossMm");
        var none = new[] { El("wall", wall.Place, "retype"), El("wall", wall.Place, "set_parameter"), El("level", new PlaceDto { Name = "L1", BaseElevation = 0 }), El("wall", null) };
        Ok(none.All(e => GhostOverlayGeometry.Segments(e, true, false).Count == 0) && none.All(e => !GhostOverlayGeometry.Drawable(e)), "MA-3c: a retype, a type edit, a level and a create with no place draw nothing and are not counted as drawable creates");
        var b = GhostOverlayGeometry.Bounds(s);
        Ok(b != null && b[0].SequenceEqual(new double[] { 0, 0, 0 }) && b[1].SequenceEqual(new double[] { 4000, 0, 3000 }) && GhostOverlayGeometry.Bounds(new List<GhostOverlayGeometry.Segment>()) == null, "MA-3c: Bounds is the least and greatest corner, null when empty");
        Ok(GhostOverlayGeometry.Line(0, 0) == "No ghost to draw: this review proposes no create (a retype or attach changes an element that exists — Show selects it)."
           && GhostOverlayGeometry.Line(2, 0) == "No ghost to draw: the 2 proposed create(s) carry no points to draw from."
           && GhostOverlayGeometry.Line(3, 2) == "2 of 3 proposed create(s) outlined in this model's 3D views, plans and sections — a see-through face and its edges, ticked green, unticked grey, declined red; nothing is written. Open one to see them; they go when this window closes or Apply places them.",
           "MA-3c: the window's line says how many outlines, in which colours, and when they go");
        string geo = Src("GhostBuilder", "GhostOverlayGeometry.cs");
        Ok(!geo.Contains("Autodesk.Revit") && !geo.Contains("Transaction"), "MA-3c: the geometry is pure - no Revit type, no Transaction");
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        string srv = Src("GhostBuilder", "GhostOverlayServer.cs"), rev = Src("Commands.ReviewChangesets.cs"), win = Src("UI", "ChangesetReviewWindow.cs");
        Ok(srv.Contains("bool fits = view is View3D || view is ViewPlan || view is ViewSection, same = _doc.IsValidObject && view.Document != null && view.Document.Equals(_doc);") && srv.Contains("return fits && same && _segments.Count > 0;") && srv.Contains("{_name}: drawn in")
           && srv.Contains("_format?.Dispose(); _effect?.Dispose();") && srv.Contains("PrimitiveType.LineList") && srv.Contains("PrimitiveType.TriangleList") && srv.Contains("if (DrawContext.IsTransparentPass())")
           && srv.Contains("public bool UseInTransparentPass(View view) => _tris.Count > 0;") && srv.Contains("_teffect.SetTransparency(GhostOverlayGeometry.FaceTransparency / 255.0);") && srv.Contains("_askedIn.Add(view.ViewType)") && srv.Contains("_drawnIn.Add(view.ViewType)") && !srv.Contains("Transaction"),
           "MA-3c Next: the server draws lines in the opaque pass and see-through faces in the transparent pass, in this document's 3D, plan and section views, and writes nothing (no Transaction)");
        // MA-3c Next: the faces — a wall's sheet (2 triangles, both windings), a square slab's fan, a door's two panels, a grid none.
        var wt = GhostOverlayGeometry.Tris(wall, true, false);
        Ok(wt.Count == 4 && wt.All(t => t.R == 0 && t.G == 170 && t.Bl == 90) && wt.SelectMany(t => new[] { t.A, t.B, t.C }).All(q => (q[2] == 0 || q[2] == 3000) && q[1] == 0 && (q[0] == 0 || q[0] == 4000)),
           "MA-3c Next: a wall's face is its sheet from base to top along its line, in the row's colour, both windings");
        Ok(GhostOverlayGeometry.Tris(El("floor", new PlaceDto { LocationLoop = sq, BaseElevation = 2900 }), true, false, 3000) is var ft && ft.Count == 4 && ft.All(t => t.A[2] == 3000 && t.B[2] == 3000 && t.C[2] == 3000)
           && GhostOverlayGeometry.Tris(El("door", new PlaceDto { Location = new double[] { 1000, 2000 } }), true, false).Count == 8
           && GhostOverlayGeometry.Tris(El("grid", new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0 }, End = new double[] { 0, 9000 } } }), true, false).Count == 0
           && GhostOverlayGeometry.AllTris(new[] { (wall, false, true) }).All(t => t.R == 200) && GhostOverlayGeometry.FaceTransparency == 150,
           "MA-3c Next: a square slab fans into 4 triangles on its level, a door stands two panels, a grid has no face; AllTris colours by state");
        Ok(rev.Contains("App.Events.Enqueue(doc, \"draw the ghost overlay\"") && rev.Contains("App.Events.Enqueue(ua => { overlay.Update(segs, tris); ua.ActiveUIDocument?.RefreshActiveView(); }, \"recolour the ghost overlay\");")
           && rev.Contains("if (window.Gone || window.Applied || overlayOn[0] || overlayFailed) return;") && rev.IndexOf("overlayOn[0] = true;", StringComparison.Ordinal) is var onAt && onAt > 0 && onAt < rev.IndexOf("GhostOverlayServer.Register(ua, overlay);", StringComparison.Ordinal)
           && rev.Contains("overlayFailed = true;") && rev.Contains("OverlayOff(\"the registration failed\");")
           && rev.Contains("if (!overlayOn[0]) { OverlayDraw(segs, tris); return; }")
           && rev.Contains("GhostOverlayGeometry.Drawable") && rev.Contains("GhostOverlayGeometry.Line(creates, outlined)")
           && rev.Contains("\"remove the ghost overlay\"") && rev.Contains("window.Closed += (_, _) => OverlayOff(\"the window closed\");")
           && rev.Contains("if (window.Applied) { OverlayOff(\"Apply\"); return; }"),
           "MA-3c: the overlay is drawn on the model in front through the hub (never after the window closed or Apply, a part-way registration removed), recoloured without a DocPin, removed when the window closes or Apply is pressed, and drawn again on a Reopen");
        Ok(win.Contains("public event Action<List<(ChangesetElementDto El, bool Ticked, bool Locked)>> TicksChanged;") && win.Contains("public bool Applied => _applied;")
           && win.Contains("Ticks(); // MA-3c: the ghost overlay recolours") && win.Contains("r.Box.IsEnabled = false; } Ticks(); });")
           && win.Contains("_applied = true; Ticks();") && win.Contains("Say(words); Ticks(); }); // MA-3c review: the overlay comes back"),
           "MA-3c: the window says every row's state after a tick, a Lock or Apply");
        Ok(Count(rev, "GhostOverlayServer.Register(") == 2 && Count(rev, "GhostOverlayServer.Remove(") == 2, "MA-3c: the overlay is registered once and removed in one place — MA-4f: and the scan overlay likewise");
    }
}
