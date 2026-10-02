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

        var (b, t) = GhostFiling.WallElevations(3000, 0, 10, Tol);
        Ok(Math.Abs(b - 3000) < 1e-9 && Math.Abs(t - 6048) < 1e-9,
           "a 10 ft CAD wall at CAD Z 0 on a level at 3000 mm → base 3000, top 6048 (absolute mm: the CAD Z is the offset from the level)");
        var (b1, t1) = GhostFiling.WallElevations(0, 1, 1, Tol);
        Ok(Math.Abs(b1 - 304.8) < 1e-9 && t1 > b1, "a CAD wall with no height still rises ten short-curve tolerances — the executor refuses top ≤ base");

        var line = GhostFiling.Run(new double[] { 0, 0 }, new double[] { 5000, 0 }, null, 3000, Tol * 304.8);
        Ok(line != null && line.Mid == null && line.Start.SequenceEqual(new double[] { 0, 0, 3000 }) && line.End.SequenceEqual(new double[] { 5000, 0, 3000 }),
           "a line is filed flat at its base elevation, with no mid point");
        Ok(GhostFiling.Run(new double[] { 0, 0 }, new double[] { 0.5, 0 }, null, 0, Tol * 304.8) == null
           && GhostFiling.Run(new double[] { 0, 0 }, new double[] { 0, 0.1 }, new double[] { 1000, 1000 }, 0, Tol * 304.8) == null,
           "a run (line or arc) whose ends are closer than Revit's short-curve tolerance once flat (a near-vertical CAD line) is not filed");
        var arc = GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 1000 }, 0, Tol * 304.8);
        Ok(arc?.Mid != null && arc.Mid.SequenceEqual(new double[] { 1000, 1000, 0 }), "an arc wall carries its mid point, flat at the base");

        Ok(GhostFiling.SyntheticHint("Generic Door").Contains("placeholder the layer mapping wrote") && GhostFiling.SyntheticHint(" generic wall ").Length > 0
           && GhostFiling.SyntheticHint("Generic - 200mm") == "" && GhostFiling.SyntheticHint(null) == "",
           "a synthetic 'Generic Door'/'Generic Wall' name is named as a placeholder; a real type such as 'Generic - 200mm' is not");

        CurveDto R(double x0, double y0, double x1, double y1) => GhostFiling.Run(new[] { x0, y0 }, new[] { x1, y1 }, null, 0, 1);
        var mixed = Enumerable.Range(0, 450).Select(i => i % 3 == 0
            ? GhostFiling.Point("door", "A-DOOR", i, "M_Single-Flush", "0915 x 2134mm", "Level 1", i, 0, 0)
            : GhostFiling.Wall("A-WALL", i, "mapping", "Generic - 200mm", "Level 1", R(i, 0, i + 100, 0), 0, 3048)).ToList();
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
            GhostFiling.Wall("A-WALL-EXT", 1, "mapping", "Generic - 200mm", "Level 1", R(0, 0, 10000, 0), 0, 3048),
            GhostFiling.Wall("A-WALL-EXT", 2, "guideline", "Generic - 200mm", "Level 1",
                             GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 1000 }, 0, 1), 0, 3048),
            GhostFiling.Floor("A-FLOR", 1, "Generic 150mm", "Level 1", new[] { new double[] { 0, 0, 0 }, new double[] { 10000, 0, 0 }, new double[] { 10000, 7000, 0 }, new double[] { 0, 7000, 0 } }),
            GhostFiling.Ceiling("A-CLNG", 1, "600 x 600mm Grid", "Level 1", new[] { new double[] { 0, 0 }, new double[] { 4000, 0 }, new double[] { 4000, 7000 }, new double[] { 0, 7000 } }, 0),
            GhostFiling.Point("door", "A-DOOR", 1, "M_Single-Flush", "0915 x 2134mm", "Level 1", 6450, 0, 0),
            GhostFiling.Point("window", "A-GLAZ", 1, "M_Fixed", "0915 x 1220mm", "Level 1", 10000, 3500, 0),
            GhostFiling.Point("column", "A-COLS", 1, "M_Rectangular Column", "457 x 610mm", "Level 1", 5000, 3500, 0),
            GhostFiling.Point("furniture", "A-FURN", 1, "M_Desk", "1525 x 762mm", "Level 1", 2000, 2000, 0),
        };
        var got = JsonSerializer.SerializeToNode(GhostFiling.Body("Ghost Builder · sample-plan · Level 1", "yazan", els), ChangesetClient.WriteJson);
        var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ghost-dwg-body.json");
        var text = File.Exists(path) ? File.ReadAllText(path) : "null";
        bool same = JsonNode.DeepEquals(got, JsonNode.Parse(text));
        Ok(same, "GhostFiling's body equals the fixture the bridge validates (wall, arc wall, floor, ceiling, door, window, column, furniture)");
        if (!same) Console.WriteLine("        got: " + got.ToJsonString(new JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        var cs = same ? JsonSerializer.Deserialize<ChangesetDto>(text) : null;
        Ok(cs?.Source == "dwg" && cs.Elements.Count == 8 && cs.Elements[1].Place.LocationCurve.Mid.SequenceEqual(new double[] { 1000, 1000, 0 })
           && cs.Elements.Where(e => e.Kind is "column" or "furniture").All(e => e.Place.FamilyName != null && e.Place.Location?.Length == 3),
           "the fixture reads back into the add-in's DTOs: source dwg, the arc's mid point, columns and furniture with FamilyName and Location");
    }
}
