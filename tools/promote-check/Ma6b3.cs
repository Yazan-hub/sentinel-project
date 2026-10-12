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
           && ex.Contains("var got = Math.Atan(roof.get_SlopeAngle(mc)) * 180 / Math.PI;") && ex.Contains("Math.Abs(got - d) > 0.1"),
           "a roof edge with a slope defines it (rise over run) and is read back within 0.1° after a regeneration (risk R3); every other edge defines none, as before");
    }
}
