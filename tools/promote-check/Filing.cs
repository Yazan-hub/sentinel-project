#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 10. MA-1a step 2: Ghost Builder files changesets (GhostFiling), the Doctor skips them, one Undo covers many ────────
    static void FilingChecks()
    {
        Console.WriteLine("\nMA-1a step 2 — Ghost Builder files changesets (GhostFiling)");
        const double Tol = 0.0026; // Revit's ShortCurveTolerance, about 0.79 mm, in feet

        // MA-1a item 3 (GHB-2): the drawing's Z is read from the import's own Z, and a wall is filed with no top.
        Ok(Math.Abs(GhostFiling.WallBase(9000, 9000 / 304.8, 9000 / 304.8) - 9000) < 1e-6,
           "a plan imported on L3 (+9 m) and built on L3 → base 9000 mm, offset 0 (+18 m before: audit GHB-2)");
        Ok(Math.Abs(GhostFiling.WallBase(9000, 0, 0) - 9000) < 1e-9 && Math.Abs(GhostFiling.WallBase(3000, 1, 0) - 3304.8) < 1e-9,
           "a plan imported on L1 and built on L3 lands on L3; a CAD Z 1 ft above the import is 304.8 mm above the build level");
        Ok(GhostFiling.Wall("A-WALL", 1, "mapping", "Generic - 200mm", "Level 1", GhostFiling.Run(new double[] { 0, 0 }, new double[] { 5000, 0 }, null, 0, 1), 0)
               .Place.TopElevation == null,
           "a Ghost wall is filed with no TopElevation — the executor gives it the next story (no 10 ft constant)");
        // Final review: a wall drawn below the build level would take the build level as its next story — a named gap.
        Ok(GhostFiling.BelowLevelGap("GR-FFL", 0, -300, "GR-FFL").StartsWith("the drawing puts this wall 300 mm below GR-FFL")
           && GhostFiling.BelowLevelGap("GR-FFL", 0, 0, "01_SSL") == null && GhostFiling.BelowLevelGap("MA0 Roof", 6300, 6300, null) == null,
           "a wall the drawing puts below the build level is a named gap (its next story would be the build level itself); a wall on the level, or on the top story, is none");
        // MA-1a item 4: the rule the stamp records.
        Ok(GhostFiling.Rule("guideline", "llm", "guideline@3 · x", "layers@1 · y") == "type by the guideline (guideline@3 · x)"
           && GhostFiling.Rule("mapping", "standard", "g", "layers@1 · y") == "type by the layer mapping (standard: layers@1 · y)"
           && GhostFiling.Rule(null, "llm", "g", "l") == "type by the layer mapping (llm)"
           && GhostFiling.Rule(null, "reviewer", "g", "l") == "type picked by the reviewer in Ghost's review",
           "the stamp's rule names what typed an element: the guideline (its artefact), the layer mapping's tier (the layers standard), or the reviewer");
        // Review amendment C8: Ghost's review opens on the drawing's own level (the BDS template's levels, lowest first).
        var bds = new List<(long, double)> { (11, -300), (12, 0), (13, 3000), (14, 3300), (15, 6300) };
        Ok(GhostFiling.DefaultLevel(bds, 0.4, 15) == 12 && GhostFiling.DefaultLevel(bds, 3300, null) == 14
           && GhostFiling.DefaultLevel(bds, 1500, 13) == 13 && GhostFiling.DefaultLevel(bds, 1500, null) == 11 && GhostFiling.DefaultLevel(bds, 1500, 99) == 11,
           "the review's build level defaults to the level at the import's elevation (within 1 mm) — GR-FFL, not GR_SSL — else the active plan view's level, else the lowest (C8)");

        var line = GhostFiling.Run(new double[] { 0, 0 }, new double[] { 5000, 0 }, null, 3000, Tol * 304.8);
        Ok(line != null && line.Mid == null && line.Start.SequenceEqual(new double[] { 0, 0, 3000 }) && line.End.SequenceEqual(new double[] { 5000, 0, 3000 }),
           "a line is filed flat at its base elevation, with no mid point");
        Ok(GhostFiling.Run(new double[] { 0, 0 }, new double[] { 0.5, 0 }, null, 0, Tol * 304.8) == null
           && GhostFiling.Run(new double[] { 0, 0 }, new double[] { 0, 0.1 }, new double[] { 1000, 1000 }, 0, Tol * 304.8) == null,
           "a run (line or arc) whose ends are closer than Revit's short-curve tolerance once flat (a near-vertical CAD line) is not filed");
        var arc = GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 1000 }, 0, Tol * 304.8);
        Ok(arc?.Mid != null && arc.Mid.SequenceEqual(new double[] { 1000, 1000, 0 }), "an arc wall carries its mid point, flat at the base");
        var onChord = GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 0.5 }, 0, Tol * 304.8);
        Ok(onChord != null && onChord.Mid == null, "an 'arc' whose mid is < 1 mm off its chord is filed straight (the bridge refuses such a mid)");

        Ok(GhostFiling.SyntheticHint("Generic Door").Contains("placeholder the layer mapping wrote") && GhostFiling.SyntheticHint(" generic wall ").Length > 0
           && GhostFiling.SyntheticHint("Generic - 200mm") == "" && GhostFiling.SyntheticHint(null) == "",
           "a synthetic 'Generic Door'/'Generic Wall' name is named as a placeholder; a real type such as 'Generic - 200mm' is not");

        CurveDto R(double x0, double y0, double x1, double y1) => GhostFiling.Run(new[] { x0, y0 }, new[] { x1, y1 }, null, 0, 1);
        var mixed = Enumerable.Range(0, 450).Select(i => i % 3 == 0
            ? GhostFiling.Point("door", "A-DOOR", i, "M_Single-Flush", "0915 x 2134mm", "Level 1", i, 0, 0)
            : GhostFiling.Wall("A-WALL", i, "mapping", "Generic - 200mm", "Level 1", R(i, 0, i + 100, 0), 0)).ToList();
        var chunks = GhostFiling.Chunks(mixed);
        var flat = chunks.SelectMany(c => c).ToList();
        Ok(chunks.Select(c => c.Count).SequenceEqual(new[] { 200, 200, 50 }), "450 elements → changesets of 200, 200 and 50 (the bridge's cap)");
        Ok(flat.FindIndex(e => e.Kind == "door") == 300 && flat.Skip(300).All(e => e.Kind == "door") && flat.Count == 450,
           "every wall is filed before any door: an opening's host exists when its changeset runs");
        Ok(flat.Where(e => e.Kind == "wall").Select(e => e.Validate.Identity.Name).Take(2).SequenceEqual(new[] { "A-WALL #1", "A-WALL #2" }),
           "the plan's order is kept within a kind");
        // B8: the cap the chunks use is the bridge's own — a larger chunk would be a 413.
        Ok(File.ReadAllText(Repo("WebApp", "bridge", "changesets-logic.mjs")).Contains($"MAX_CHANGESET_ELEMENTS = {GhostFiling.MaxElements};"),
           $"GhostFiling.MaxElements ({GhostFiling.MaxElements}) is the bridge's MAX_CHANGESET_ELEMENTS (changesets-logic.mjs)");

        // B2 (founder decision F9 A): a DWG door or window is hosted only in a wall this build creates.
        var modelWalls = new List<(string, string, double, double, double, double)> { ("wall 101", "Level 1", 0, 0, 5000, 0) };
        var buildWalls = new List<(string, string, double, double, double, double)> { ("A-WALL #1 (this build)", "Level 1", 0, 3000, 5000, 3000) };
        Ok(GhostFiling.HostGap(modelWalls, buildWalls, "Level 1", 2500, 0)?.Contains("a wall already in the model (wall 101) lies under the point") == true
           && GhostFiling.HostGap(modelWalls, buildWalls, "Level 1", 2500, 3000) == null,
           "a DWG opening over a wall already in the model only is a named gap (F9 A); over a wall this build creates it is filed");

        // MA-1b (GHB-1): a block's door or window carries the block's direction; a drawn outline's carries none.
        var turned = GhostFiling.Point("door", "A-DOOR", 1, "F", "T", "Level 1", 0, 0, 0, 240, true).Place;
        var straightOn = GhostFiling.Point("window", "A-GLAZ", 1, "F", "T", "Level 1", 0, 0, 0, 90).Place;
        var outline = GhostFiling.Point("door", "A-DOOR", 2, "F", "T", "Level 1", 0, 0, 0).Place;
        Ok(turned.Rotation == 240 && turned.Mirrored == true && straightOn.Rotation == 90 && straightOn.Mirrored == null
           && outline.Rotation == null && outline.Mirrored == null && turned.FlipFacing == null && turned.FlipHand == null,
           "a block's door or window is filed with place.Rotation, and Mirrored only when it is mirrored; an outline's with neither; never a flip");
        var sent = new List<ChangesetElementDto>
        {
            GhostFiling.Point("door", "A-DOOR", 1, "F", "T", "Level 1", 0, 0, 0, 240, true),
            GhostFiling.Point("door", "A-DOOR", 2, "F", "T", "Level 1", 0, 0, 0),
        };
        List<ChangesetElementDto> Back() => JsonSerializer.Deserialize<List<ChangesetElementDto>>(JsonSerializer.Serialize(sent, ChangesetClient.WriteJson));
        var oldBridge = Back();
        oldBridge[0].Place.Rotation = null;
        oldBridge[0].Place.Mirrored = null;
        var unmirrored = Back();
        unmirrored[0].Place.Mirrored = null;
        Ok(!GhostFiling.LostRotation(sent, Back()) && GhostFiling.LostRotation(sent, oldBridge) && GhostFiling.LostRotation(sent, unmirrored),
           "a bridge that answers without a sent Rotation or Mirrored (one still on the old code) is seen before anything is placed");

        var local = GhostFiling.Local("Ghost Builder · plan · Level 1", chunks[2]);
        Ok(local.Source == "dwg" && Guid.TryParse(local.Id, out _) && local.Elements.Count == 50
           && local.Elements.All(e => Guid.TryParse(e.ProposalGuid, out _)) && local.Elements.Select(e => e.ProposalGuid).Distinct().Count() == 50,
           "an unbound model's changeset is local: source dwg, its own id, a distinct guid per element");
        Ok(GhostFiling.Name("plan", "Level 1", 0, 1) == "Ghost Builder · plan · Level 1" && GhostFiling.Name(" ", "L2", 1, 3) == "Ghost Builder · drawing · L2 (2/3)",
           "changeset names: the drawing and the level, and (i/n) when there are several");

        const string id = "3f2a9c8b-1d0e-4f5a-8b7c-6d5e4f3a2b1c";
        Ok(GhostFailurePolicy.DoctorSkips(UndoWatcher.TxName(GhostFiling.Name("plan", "Level 1", 0, 1), id))
           && GhostFailurePolicy.DoctorSkips(UndoWatcher.TxName("Promote walls (DD) · Level 1", id)) && !GhostFailurePolicy.DoctorSkips("Sentinel — import DWG plan"),
           "the Doctor skips every changeset's transaction (UndoWatcher.TxName starts with GhostFailurePolicy.ChangesetTxPrefix), not the DWG import");

        // One Undo entry over several changesets: remembered under the group's name and each changeset's own name, one hit each.
        const string id2 = "7b1e0c2d-9a8f-4e3d-a2b1-c0d9e8f7a6b5";
        string g = UndoWatcher.TxName("Ghost Builder · plan · Level 1 (1/2)", id), own2 = UndoWatcher.TxName("Ghost Builder · plan · Level 1 (2/2)", id2);
        UndoWatcher.Remember(g, "demo", id, new[] { "a1", "a2" });
        UndoWatcher.Remember(g, "demo", id2, new[] { "b1" });
        UndoWatcher.Remember(own2, "demo", id2, new[] { "b1" });
        var both = UndoWatcher.Hits(new[] { g });
        Ok(both.Count == 2 && both.Select(h => h.ChangesetId).SequenceEqual(new[] { id, id2 }), "one Undo name can cover two changesets: both are hits");
        Ok(UndoWatcher.Hits(new[] { g, own2 }).Count == 2, "a changeset remembered under two names that Revit both reports is one hit (no second ledger row)");
        UndoWatcher.Remember(g, "demo", id, new[] { "a1" });
        Ok(UndoWatcher.Hits(new[] { g }).Single(h => h.ChangesetId == id).Guids.SequenceEqual(new[] { "a1" }), "remembering the same changeset again replaces it");

        Console.WriteLine("\nMA-1a step 2 parity (WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json)");
        var els = new List<ChangesetElementDto>
        {
            GhostFiling.Wall("A-WALL-EXT", 1, "mapping", "Generic - 200mm", "Level 1", R(0, 0, 10000, 0), 0),
            GhostFiling.Wall("A-WALL-EXT", 2, "guideline", "Generic - 200mm", "Level 1",
                             GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 1000 }, 0, 1), 0),
            GhostFiling.Floor("A-FLOR", 1, "Generic 150mm", "Level 1", new[] { new double[] { 0, 0, 0 }, new double[] { 10000, 0, 0 }, new double[] { 10000, 7000, 0 }, new double[] { 0, 7000, 0 } }),
            GhostFiling.Ceiling("A-CLNG", 1, "600 x 600mm Grid", "Level 1", new[] { new double[] { 0, 0 }, new double[] { 4000, 0 }, new double[] { 4000, 7000 }, new double[] { 0, 7000 } }, 0),
            GhostFiling.Point("door", "A-DOOR", 1, "M_Single-Flush", "0915 x 2134mm", "Level 1", 6450, 0, 0, 240, true), // MA-1b: a mirrored block's door
            GhostFiling.Point("window", "A-GLAZ", 1, "M_Fixed", "0915 x 1220mm", "Level 1", 10000, 3500, 0),
            GhostFiling.Point("column", "A-COLS", 1, "M_Rectangular Column", "457 x 610mm", "Level 1", 5000, 3500, 0),
            GhostFiling.Point("furniture", "A-FURN", 1, "M_Desk", "1525 x 762mm", "Level 1", 2000, 2000, 0),
        };
        // MA-1a item 4: the planner adds the rule and the drawing's sha to the layer GhostFiling set (GhostChangesetBuild.Prov).
        els[0].Provenance.Rule = GhostFiling.Rule("mapping", "standard", "guideline@3 · bds-office · 1a2b3c4d…", "layers@1 · bds-office · 9f8e7d6c…");
        els[0].Provenance.SourceSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        els[1].Provenance.Rule = GhostFiling.Rule("guideline", "standard", "guideline@3 · bds-office · 1a2b3c4d…", "layers@1 · bds-office · 9f8e7d6c…");
        els[4].Provenance.Rule = GhostFiling.Rule(null, "reviewer", "none", "none");
        var got = JsonSerializer.SerializeToNode(GhostFiling.Body("Ghost Builder · sample-plan · Level 1", "yazan", els), ChangesetClient.WriteJson);
        var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ghost-dwg-body.json");
        var text = File.Exists(path) ? File.ReadAllText(path) : "null";
        bool same = JsonNode.DeepEquals(got, JsonNode.Parse(text));
        Ok(same, "GhostFiling's body equals the fixture the bridge validates (wall, arc wall, floor, ceiling, door, window, column, furniture)");
        if (!same) Console.WriteLine("        got: " + got.ToJsonString(new JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        var cs = same ? JsonSerializer.Deserialize<ChangesetDto>(text) : null;
        Ok(cs?.Source == "dwg" && cs.Elements.Count == 8 && cs.Elements[1].Place.LocationCurve.Mid.SequenceEqual(new double[] { 1000, 1000, 0 })
           && cs.Elements.Where(e => e.Kind is "column" or "furniture").All(e => e.Place.FamilyName != null && e.Place.Location?.Length == 3)
           && cs.Elements.All(e => e.Provenance?.Layer != null && e.Place.TopElevation == null) && cs.Elements[0].Provenance.SourceSha256?.Length == 64,
           "the fixture reads back into the add-in's DTOs: source dwg, the arc's mid point, columns and furniture with FamilyName and Location, " +
           "every element's provenance, no wall TopElevation (MA-1a items 3–4)");
    }
}
