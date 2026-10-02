#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // A guideline and a catalogue that pass the bridge validator; each case adds one placement block to the guideline.
    const string PlacementGuideline =
        "{\"standard\":\"Placement check guideline\",\"elements\":[" +
        "{\"category\":\"Walls\",\"rules\":[],\"default\":{\"family\":\"Basic Wall\"}},{\"category\":\"Doors\",\"rules\":[]}]}";
    const string PlacementCatalog =
        "{\"types\":[{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_200 mm\"}," +
        "{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_INT_100 mm\"}," +
        "{\"category\":\"Doors\",\"family\":\"OFF_Door\",\"type\":\"900 x 2100\"}," +
        "{\"category\":\"Furniture\",\"family\":\"OFF_Desk\",\"type\":\"1600\"}]}";

    static GuidelineMatcher WithPlacement(string placementJson, out string error)
    {
        var body = JsonNode.Parse(PlacementGuideline).AsObject();
        body["placement"] = placementJson == null ? null : JsonNode.Parse(placementJson);
        return GuidelineMatcher.FromBodies(body.ToJsonString(), PlacementCatalog, out error, out _);
    }

    // ── 14. MA-1a item 6: the placement block, its words, and the office-template count ─────────────────────────
    static void PlacementBlockChecks()
    {
        Console.WriteLine("\nMA-1a item 6 — the guideline's placement block (GuidelineMatcher, PlacementPolicy)");

        // The bridge's own cases (WebApp/bridge/fixtures/guideline-placement/cases.json, which vitest reads too): the add-in's
        // loader accepts and refuses the same bodies, in the same words.
        using (var cases = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "guideline-placement", "cases.json"))))
            foreach (var c in cases.RootElement.EnumerateArray())
            {
                var p = c.GetProperty("placement");
                string want = c.GetProperty("error").ValueKind == JsonValueKind.Null ? null : c.GetProperty("error").GetString();
                var m = WithPlacement(p.ValueKind == JsonValueKind.Null ? null : p.GetRawText(), out string error);
                Ok(error == want && m.HasGuideline == (want == null),
                   "parity with the bridge — " + c.GetProperty("name").GetString() + (want == null ? ": accepted" : ": refused, \"" + want + "\"") +
                   (error == want ? "" : " (the add-in said: " + (error ?? "accepted") + ")"));
            }

        var full = WithPlacement("{\"worksets\":{\"Walls\":\"ARC_Walls\",\"Doors\":\"ARC_Doors\",\"Levels\":\"Shared Levels and Grids\"},\"phase\":\"view\"}", out _);
        var block = full.Placement;
        Ok(block != null && block.Worksets.Count == 3 && block.Worksets["Walls"] == "ARC_Walls" && block.Phase == "view",
           "the block is read as written: three worksets and the view's phase");
        Ok(WithPlacement(null, out _).Placement == null && GuidelineMatcher.FromBodies(null, null, out _, out _).Placement == null,
           "no block, or no guideline at all, reads as null — never an empty block");

        Ok(PlacementPolicy.WorksetFor(block, "walls") == "ARC_Walls" && PlacementPolicy.WorksetFor(block, " Doors ") == "ARC_Doors",
           "a category finds its workset whatever its case or padding");
        Ok(PlacementPolicy.WorksetFor(block, "Furniture") == null && PlacementPolicy.WorksetFor(null, "Walls") == null,
           "a category the block does not name, or no block, gives no workset");
        Ok(PlacementPolicy.CategoriesOf("wall").SequenceEqual(new[] { "Walls" }) && PlacementPolicy.CategoriesOf("level").SequenceEqual(new[] { "Levels" })
           && PlacementPolicy.CategoriesOf("column").SequenceEqual(new[] { "Columns" }) && PlacementPolicy.CategoriesOf("stair").Length == 0,
           "each changeset kind names its guideline category — a column the architectural Columns the executor places, an unknown kind none");
        foreach (var kind in new[] { "wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture" })
            Ok(PlacementPolicy.CategoriesOf(kind).Length > 0, "the bridge's vocabulary is covered: " + kind);
        Ok(PlacementPolicy.Kinds.SelectMany(PlacementPolicy.CategoriesOf).OrderBy(c => c, StringComparer.Ordinal)
               .SequenceEqual(GuidelineMatcher.PlacementCategories.OrderBy(c => c, StringComparer.Ordinal)),
           "the categories a block may name are exactly the ones a kind lands in");
        Ok(PlacementPolicy.KindOf("Walls") == "wall" && PlacementPolicy.KindOf(" doors ") == "door" && PlacementPolicy.KindOf("Stairs") == null,
           "a category names its kind back, whatever its case or padding; one Sentinel does not place names none");

        var have = new[] { "Workset1", "arc_walls" };
        Ok(PlacementPolicy.MissingWorksets(block, new[] { "wall", "door", "furniture", "door" }, have).SequenceEqual(new[] { "ARC_Doors" }),
           "the batch needs ARC_Walls (in the model) and ARC_Doors (not): one missing workset, named once");
        Ok(PlacementPolicy.MissingWorksets(block, new[] { "wall", "furniture" }, have).Count == 0,
           "a workset the batch does not need is not asked for (Levels' is missing, and no level is placed)");
        Ok(PlacementPolicy.MissingWorksets(null, new[] { "wall" }, have).Count == 0, "no block: nothing is missing");

        Ok(PlacementPolicy.DesignOptionRefusal("Option 2", "apply the proposals") ==
           "Nothing was placed — design option \"Option 2\" is being edited, and Sentinel never places into a design option. " +
           "Switch to Main Model (Manage ▸ Design Options), then apply the proposals again.",
           "an active design option is refused by name, with the way out");
        Ok(PlacementPolicy.MissingWorksetRefusal(new[] { "ARC_Doors" }) ==
           "Nothing was placed — the guideline's placement block names a workset this model does not have: \"ARC_Doors\". " +
           "Create it (Standards ▸ Apply Standard, or Collaborate ▸ Worksets), then try again — Sentinel never creates a workset while placing, and never picks another.",
           "one missing workset is refused by name");
        Ok(PlacementPolicy.MissingWorksetRefusal(new[] { "ARC_Doors", "ARC_Floors" }).StartsWith(
           "Nothing was placed — the guideline's placement block names 2 worksets this model does not have: \"ARC_Doors\", \"ARC_Floors\". Create them ("),
           "two missing worksets are both named");

        var tally = new PlacementPolicy.Tally();
        tally.On("ARC_Walls"); tally.On("ARC_Walls"); tally.On("ARC_Doors"); tally.NoWorkset("Furniture"); tally.NoWorkset("Furniture"); tally.Phased = 5;
        Ok(PlacementPolicy.Lines(null, true, new PlacementPolicy.Tally(), "New Construction").SequenceEqual(new[] { PlacementPolicy.NoBlock })
           && PlacementPolicy.NoBlock == "Placement: no placement block (the project's guideline has none, or no guideline is installed) — each element is on the active workset and in the phase Revit gave it, as before.",
           "no block: one line that says today's behaviour holds");
        Ok(PlacementPolicy.Lines(block, true, tally, "New Construction").SequenceEqual(new[]
           {
               "Worksets: 1 on ARC_Doors · 2 on ARC_Walls · 2 left on the active workset (the guideline names no workset for Furniture).",
               "Phase: 5 element(s) set to \"New Construction\", the active view's phase (a level or a grid has no phase).",
           }), "worksets counted by name, the unnamed category said, the phase counted");
        Ok(PlacementPolicy.Lines(block, false, new PlacementPolicy.Tally(), null).SequenceEqual(new[]
           {
               "Worksets: not set — this model is not workshared, so it has no worksets (the guideline names 3).",
               "Phase: not set — the active view has no phase (a sheet, a legend); each element is in the phase Revit gave it.",
           }), "a model that is not workshared, in a view with no phase: both said, nothing claimed");
        var worksetsOnly = WithPlacement("{\"worksets\":{\"Walls\":\"ARC_Walls\"}}", out _).Placement;
        Ok(PlacementPolicy.Lines(worksetsOnly, true, new PlacementPolicy.Tally(), "New Construction")[1] ==
           "Phase: the guideline's placement block names none — each element is in the phase Revit gave it.",
           "a block with no phase leaves the phase alone, and says so");
        Ok(PlacementPolicy.Lines(WithPlacement("{\"phase\":\"view\"}", out _).Placement, true, new PlacementPolicy.Tally(), "Existing")[0] ==
           "Worksets: the guideline's placement block names none — each element is on the active workset.",
           "a block with no worksets leaves the workset alone, and says so");

        // Review amendment C6: the lines are counted from the elements still in the model after the commit.
        var written = new PlacementPolicy.Written();
        written.Add("u1", "ARC_Walls", null, true); written.Add("u2", "ARC_Walls", null, true); written.Add("u3", "ARC_Walls", null, true);
        written.Add("u4", null, "Furniture", false);
        Ok(PlacementPolicy.Lines(block, true, written.Surviving(new[] { "u1", "u3", "u4" }), "New Construction").SequenceEqual(new[]
           {
               "Worksets: 2 on ARC_Walls · 1 left on the active workset (the guideline names no workset for Furniture).",
               "Phase: 2 element(s) set to \"New Construction\", the active view's phase (a level or a grid has no phase).",
           }), "three walls set, one removed by Revit at commit: the lines say two — counted from what is still in the model");

        // Review amendment C7: a guideline that could not be read is not "no block".
        Ok(PlacementPolicy.UnreadRefusal("none", false, true, "bridge unreachable (timed out after 4 s)") ==
           "Nothing was placed — the project's guideline could not be read (bridge unreachable (timed out after 4 s)), so its placement block is unknown. " +
           "Try again once it can be read — Sentinel never places on a guess.",
           "a guideline that could not be read is refused with the reader's own reason");
        Ok(PlacementPolicy.UnreadRefusal("none", true, true, "not installed for demo or its office") == null
           && PlacementPolicy.UnreadRefusal("none", false, false, "not bound — Sentinel ▸ Project Setup") == null,
           "no guideline installed, or a model that is not bound, is no block — not a refusal");
        Ok(PlacementPolicy.UnreadRefusal("bridge", false, true, null) == null && PlacementPolicy.UnreadRefusal("cache", false, true, "bridge unreachable — cached 14:02") == null,
           "a guideline read from the bridge, or from its cached copy, is read: its block — or its lack of one — is known");

        // The office-template check: the catalogue's types in the guideline's categories (Walls, Doors — not Furniture).
        var docTypes = new Dictionary<string, IReadOnlyList<(string Family, string Type)>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Walls"] = new List<(string, string)> { (null, "off_ext_200 mm"), (null, "Generic - 200mm") },
            ["Doors"] = new List<(string, string)> { ("Another Door", "900 x 2100") },
            ["Furniture"] = new List<(string, string)> { ("OFF_Desk", "1600") },
        };
        var (present, total) = full.OfficeTypesIn(docTypes);
        Ok(present == 1 && total == 3, "1 of 3 office types present: a wall type by name, not the door of another family, not a category the guideline has no rules for");
        var none = full.OfficeTypesIn(new Dictionary<string, IReadOnlyList<(string Family, string Type)>> { ["Walls"] = new List<(string, string)> { (null, "Generic - 200mm") } });
        Ok(none.Present == 0 && none.Total == 2, "a category the reader did not read is not counted against the model");
        Ok(PlacementPolicy.TemplateRefuses(0, 3) && !PlacementPolicy.TemplateRefuses(1, 3) && !PlacementPolicy.TemplateRefuses(0, 0),
           "the build is refused only when the model holds none of them — never when there is nothing to compare");
        Ok(PlacementPolicy.TemplateRefusal(3, "type_catalog@1 · office · 0123…") ==
           "Nothing was built — this model was not made from the office template: it holds none of the 3 office type(s) that type_catalog@1 · office · 0123… lists in the guideline's categories. " +
           "Start the project from the office template, then run this again — Sentinel never loads an unknown family.",
           "the refusal is the design's sentence, with the count and the catalogue");
        Ok(PlacementPolicy.TemplateLine(true, 1, 3, "type_catalog@1 · office · 0123…") == "Office template: 1 of 3 office type(s) present (type_catalog@1 · office · 0123…)."
           && PlacementPolicy.TemplateLine(true, 0, 0, "type_catalog@1") == "Office template: not checked — type_catalog@1 lists no type in a category the guideline has rules for."
           && PlacementPolicy.TemplateLine(false, 0, 0, "none — not installed for demo or its office") == "Office template: not checked — type_catalog: none — not installed for demo or its office.",
           "the count is said as counted; with nothing to compare it says not checked, never a pass");
    }
}
