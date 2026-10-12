#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-6-3: vocabulary v2 — an opening, a beam, a roof's Slopes, a column's TopLevel; a missing named level keeps a changeset proposed ──
    static void Ma6b3Checks()
    {
        Console.WriteLine("\nMA-6-3 — vocabulary v2: opening, beam, roof Slopes, column TopLevel");
        var fx = JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "vocab-v2-body.json")))["posted"]["elements"].AsArray();
        PlaceDto Place(int i) => JsonSerializer.Deserialize<PlaceDto>(fx[i]["place"].ToJsonString());
        var cut = Place(0); var roof = Place(5); var column = Place(2);
        Ok(cut.Width == 900 && cut.Height == 2100 && cut.SillHeight == 0 && roof.Slopes.Count == 4 && roof.Slopes[0] == 30 && roof.Slopes[1] == null
           && column.TopLevel == "H L2",
           "PlaceDto reads the fixture's v2 fields: a wall opening's Width, Height and SillHeight, a roof's Slopes (null = no slope), a column's TopLevel");

        // A floor opening's host is the one floor whose top face holds the outline's centre — even-odd, so a hole in the floor holds nothing.
        var square = new List<(double, double, double, double)> { (0, 0, 10, 0), (10, 0, 10, 10), (10, 10, 0, 10), (0, 10, 0, 0),
                                                                  (4, 4, 6, 4), (6, 4, 6, 6), (6, 6, 4, 6), (4, 6, 4, 4) };
        Ok(PlacementGeometry.Holds(square, 2, 2) && !PlacementGeometry.Holds(square, 5, 5) && !PlacementGeometry.Holds(square, 11, 5) && !PlacementGeometry.Holds(square, 5, -1),
           "PlacementGeometry.Holds: a point on the floor is held; one in a hole of it, or outside it, is not");

        Ok(PlacementPolicy.CategoriesOf("beam").SequenceEqual(new[] { "Structural Framing" }) && PlacementPolicy.KindOf(" structural framing ") == "beam"
           && GuidelineMatcher.PlacementCategories.Contains("Structural Framing") && GuidelineMatcher.CategoryBics["Structural Framing"] == "OST_StructuralFraming",
           "a beam lands in Structural Framing: a placement block may name its workset (amendment 11), and a harvested row's bic answers for it");

        string ex = Src("GhostBuilder", "ChangesetExecutor.cs");
        int At(string what) => ex.IndexOf(what, StringComparison.Ordinal);
        string Body(string head) { int i = At(head); return i < 0 ? "" : ex.Substring(i, ex.IndexOf("\n    }\n", i, StringComparison.Ordinal) - i); }
        string resolve = Body("private static Level ResolveLevel(Document doc, PlaceDto place)"), named = Body("private static Level LevelNamed(Document doc, string name)");
        Ok(resolve.Contains("?? throw new PlacementRefused($\"level \\\"{place.LevelName}\\\" does not exist in this model")
           && named.Contains("?? throw new PlacementRefused($\"level \\\"{n}\\\" does not exist in this model")
           && !resolve.Contains("throw new InvalidOperationException($\"level") && !named.Contains("throw new InvalidOperationException($\"level")
           && ex.Contains("catch (PlacementRefused ex)") && ex.Contains("return new ExecutionResult { NotRun = true, Error = ex.Message };"),
           "amendment 1 (drill H-5): a named level that does not exist is the model's state, not a verdict — PlacementRefused, so the changeset stays proposed (NotRun) and applies after the storey that creates its level");

        int doors = At("var openings = toPlace.Where(e => IsCreate(e) && e.Kind is \"door\" or \"window\").ToList();"), cuts = At("var cuts = toPlace.Where(e => IsCreate(e) && e.Kind == \"opening\").ToList();"),
            columns = At("foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind is \"column\" or \"furniture\"))"), beams = At("foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == \"beam\"))"),
            rooms = At("var rooms = toPlace.Where(e => IsCreate(e) && e.Kind == \"room\").ToList();");
        string cutBlock = cuts < 0 || columns < cuts ? "" : ex.Substring(cuts, columns - cuts);
        Ok(doors > 0 && cuts > doors && columns > cuts && beams > columns && rooms > beams
           && cutBlock.Contains("doc.Regenerate();") && cutBlock.IndexOf("doc.Regenerate();", StringComparison.Ordinal) < cutBlock.IndexOf("foreach (var el in cuts)", StringComparison.Ordinal)
           && cutBlock.Contains("doc.Create.NewOpening(hosts[i], new XYZ(") && cutBlock.Contains("doc.Create.NewOpening(pick[0], arr, true)")
           && cutBlock.Contains("PlacementGeometry.Host(lines, level.Name, p[0], p[1], out var why)"),
           "openings are cut after every wall, floor, door and window (one Regenerate first, so a host this changeset made is cut too), in the door's one host wall, or through one floor; beams after the columns, before the rooms");
        Ok(ex.Contains("doc.Create.NewFamilyInstance(Line.CreateBound(Pt(c.Start), Pt(c.End)), sym, level, StructuralType.Beam)")
           && ex.Contains("CreateType(doc, BuiltInCategory.OST_StructuralFraming, \"beam\", el.Place.FamilyName, el.Place.TypeName)")
           && ex.Contains("Set(fi, BuiltInParameter.FAMILY_TOP_LEVEL_PARAM, top.Id, \"column\");") && ex.Contains("Set(fi, BuiltInParameter.FAMILY_TOP_LEVEL_OFFSET_PARAM, 0.0, \"column\");"),
           "a beam is the named Structural Framing type on its line; a column with a TopLevel stands to it at offset 0");
        Ok(!ex.Contains("foreach (ModelCurve mc in edges) roof.set_DefinesSlope(mc, false);") && ex.Contains("roof.set_SlopeAngle(mc, Math.Tan(d * Math.PI / 180));")
           && ex.Contains("HostObjectUtils.GetTopFaces(roof).Select(r => roof.GetGeometryObjectFromReference(r)).OfType<PlanarFace>()")
           && ex.Contains(".Select(f => Math.Acos(Math.Min(1, Math.Abs(f.FaceNormal.Z))) * 180 / Math.PI)") && ex.Contains("!pitches.Any(a => Math.Abs(a - d) <= 0.1)")
           && !ex.Contains("get_SlopeAngle"),
           "a roof edge with a slope defines it (rise over run) and is read back within 0.1° after a regeneration from the roof's top faces, never through SlopeAngle (review fix: that reads the unit it wrote — risk R3); every other edge defines none, as before");

        // ── MA-6-3 review fixes ──
        Ok(ex.Contains("throw new PlacementRefused($\"roof \\\"{name}\\\": Revit's footprint has no line on Boundary edge(s)")
           && ex.Contains("throw new PlacementRefused($\"roof \\\"{name}\\\": Boundary edge {i}")
           && ex.Contains("throw new PlacementRefused($\"{toPlace.Count - result.Applied.Count} ticked element(s) of unsupported kind or op were not placed — the add-in is older than the bridge's vocabulary"),
           "a slope Revit does not hold, and an add-in older than the bridge's vocabulary, are this session's state (C5's rule): PlacementRefused, so the changeset stays proposed (NotRun)");

        // A wall opening's rectangle stays inside its one host wall: between the line's ends, its bottom and its top (HostTolMm slack).
        string Fits(double x, double w, double z0, double z1) => PlacementGeometry.OpeningFits("wall 7", 0, 0, 4000, 0, 0, 3000, x, 0, w, z0, z1);
        Ok(Fits(2000, 900, 0, 2100) == null && Fits(450, 900, 0, 2100) == null && Fits(3550.5, 900, 0, 3000.5) == null
           && Fits(400, 900, 0, 2100)?.Contains("its 900 mm width, centred 400 mm along wall 7, runs past an end of that wall (4000 mm long)") == true
           && Fits(3600, 900, 0, 2100) != null && Fits(2000, 900, 1000, 3100)?.Contains("it runs from 1000 to 3100 mm, past wall 7's bottom (0 mm) or top (3000 mm)") == true
           && Fits(2000, 900, -5, 2100) != null
           && PlacementGeometry.OpeningFits("wall 7", 0, 0, 4000, 0, double.NegativeInfinity, double.PositiveInfinity, 2000, 0, 900, 0, 99999) == null,
           "PlacementGeometry.OpeningFits: a wall opening inside its wall fits; one past an end, its bottom or its top is refused in words (an unreadable base reads as every height)");
        Ok(cutBlock.Contains("var (wb, wt) = Heights(doc, hosts[i]);") && cutBlock.Contains("PlacementGeometry.OpeningFits(lines[i].Label, lines[i].X0, lines[i].Y0, lines[i].X1, lines[i].Y1, wb / MmToFeet, wt / MmToFeet,")
           && cutBlock.IndexOf("PlacementGeometry.OpeningFits(", StringComparison.Ordinal) < cutBlock.IndexOf("doc.Create.NewOpening(hosts[i]", StringComparison.Ordinal),
           "the executor asks OpeningFits of the host wall's line and heights before it cuts the wall");
        Ok(cutBlock.Contains("if (pool.FirstOrDefault(f => !f.Id.Equals(pick[0].Id) && spots.Any(q => Holds(f, q))) is Floor other)")
           && cutBlock.Contains("outline.SelectMany(c => new[] { c.GetEndPoint(0), c.Evaluate(0.5, true) })")
           && cutBlock.Contains("its Boundary reaches floor {other.Id.IdValue()} of {level.Name} as well as floor {pick[0].Id.IdValue()}")
           && cutBlock.IndexOf("is Floor other)", StringComparison.Ordinal) < cutBlock.IndexOf("doc.Create.NewOpening(pick[0], arr, true)", StringComparison.Ordinal)
           && cutBlock.Contains("\"no floor of \" + level.Name + \" holds\" : pick.Count + \" floors of \" + level.Name + \" hold\""),
           "a floor opening whose outline (its vertices and edge middles, 1 mm in) reaches another floor of the pool is refused before the cut; 'no floor … holds', 'N floors … hold'");

        string ui = Src("UI", "ChangesetReviewWindow.cs");
        string label = ui.Substring(ui.IndexOf("private static string CreateLabel(", StringComparison.Ordinal));
        label = label.Substring(0, label.IndexOf("\n    }\n", StringComparison.Ordinal));
        Ok(label.Contains("if (el.Kind == \"column\" && p?.TopLevel != null) parts.Add(\"to \" + p.TopLevel);")
           && label.Contains("if (el.Kind == \"opening\" && p?.Boundary != null) parts.Add(\"hole in a floor\");")
           && label.Contains("if (p?.Slopes?.Any(s => s != null) == true) parts.Add(\"slopes \" + string.Join(\"/\", p.Slopes.Select(s => s is double d ? Mm(d) + \"°\" : \"–\")));"),
           "Revit's review row shows what Apply builds: a column's top level, a hole in a floor, a roof's pitch per edge (the overlay draws a sloped roof flat)");
    }
}
