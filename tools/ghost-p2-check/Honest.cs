// MA-1a step 1 (GHB-5) — Ghost Builder's honest build, offline: the failure rule (GhostFailurePolicy), the family-type pick
// (GhostTypePick) and the review's type drop-down (GhostReviewWindow). All Revit-free; the Revit halves are drilled live.
using System.Windows.Controls;
using Sentinel.GhostBuilder;
using Sentinel.UI;

static partial class Check
{
    static void Honest()
    {
        Policy();
        TypePick();
        ReviewChoices();
    }

    // ── the failure rule: a user's element is never deleted or resolved; warnings are counted, never erased ──
    static void Policy()
    {
        Console.WriteLine("\nMA-1a — Ghost's failure rule (GhostFailurePolicy)");
        var ours = new HashSet<long> { 101, 102, 103 };
        var W = GhostFailurePolicy.Severity.Warning;
        var E = GhostFailurePolicy.Severity.Error;
        GhostFailurePolicy.Act D(GhostFailurePolicy.Severity s, bool res, long[] failing, long[]? additional = null, bool tried = false) =>
            GhostFailurePolicy.Decide(s, res, failing, additional ?? Array.Empty<long>(), ours, tried);

        Ok(D(W, true, new long[] { 900 }) == GhostFailurePolicy.Act.Count && D(W, false, new long[] { 101 }) == GhostFailurePolicy.Act.Count,
           "a warning is counted, never erased or resolved — whoever's element it names");
        Ok(D(E, true, new long[] { 101 }, new long[] { 102 }) == GhostFailurePolicy.Act.Resolve,
           "an error naming only this build's elements takes Revit's own resolution");
        Ok(D(E, true, new long[] { 101 }, tried: true) == GhostFailurePolicy.Act.DeleteOurs,
           "…once: the same failure back after its resolution deletes this build's elements instead (no endless loop)");
        Ok(D(E, false, new long[] { 101, 102 }) == GhostFailurePolicy.Act.DeleteOurs
           && GhostFailurePolicy.ToDelete(new long[] { 101, 102 }, ours).SequenceEqual(new long[] { 101, 102 }),
           "an error with no resolution naming only ours deletes them");
        Ok(D(E, true, new long[] { 101, 900 }) == GhostFailurePolicy.Act.DeleteOurs
           && GhostFailurePolicy.ToDelete(new long[] { 101, 900, 101 }, ours).SequenceEqual(new long[] { 101 }),
           "an error naming the user's element 900 and ours 101: only 101 is deleted, and Revit's resolution is never applied");
        Ok(D(E, true, new long[] { 101 }, new long[] { 900 }) == GhostFailurePolicy.Act.DeleteOurs,
           "a user's element among the additional ids also keeps Revit's resolution away");
        Ok(D(E, true, new long[] { 900, 901 }) == GhostFailurePolicy.Act.RollBack
           && D(E, false, new long[] { 900 }) == GhostFailurePolicy.Act.RollBack,
           "an error naming only the user's elements rolls the build back — nothing of theirs is deleted");
        // A5: (failing ∪ additional) ∩ ours — a user's wall failing with a new wall as additional ("Can't keep elements joined").
        Ok(D(E, false, new long[] { 900 }, new long[] { 101 }) == GhostFailurePolicy.Act.DeleteOurs
           && GhostFailurePolicy.ToDelete(new long[] { 900 }, ours, new long[] { 101, 900 }).SequenceEqual(new long[] { 101 }),
           "a user's element failing with ours among the additional ids: only ours (101) is deleted, never 900");
        Ok(D(E, true, new long[0]) == GhostFailurePolicy.Act.RollBack,
           "an error naming no element rolls back — never Revit's modal dialog, never a guess");
        Ok(D(GhostFailurePolicy.Severity.Corruption, true, new long[] { 101 }) == GhostFailurePolicy.Act.RollBack,
           "document corruption is never committed through");
        Ok(GhostFailurePolicy.RollBackReason("Can't keep elements joined.", E, new long[] { 900, 901 })
               == "Can't keep elements joined. (it names element(s) 900, 901, which this build did not create — Sentinel never deletes or resolves those)",
           "a rollback names the user's elements by id");
        Ok(GhostFailurePolicy.RollBackReason(null!, E, new long[0]) == "a Revit failure (Revit names no element, so Sentinel cannot tell it is this build's own)",
           "…and says so when Revit names none");

        Ok(GhostFailurePolicy.PlacedLine(9, new List<string>()) == "Placed: 9", "Placed alone when Revit removed nothing");
        Ok(GhostFailurePolicy.PlacedLine(9, new List<string> { "Walls on 'A-WALL' — Can't make Wall.", "Doors on 'A-DOOR' — X.", "Walls on 'A-WALL' — Can't make Wall." })
               == "Placed: 9 (3 deleted by Revit: Walls on 'A-WALL' — Can't make Wall. ×2; Doors on 'A-DOOR' — X.)",
           "Placed 9 (3 deleted by Revit: …) — each named with the failure that named it, repeats collapsed");
        Ok(GhostFailurePolicy.WarningsLine(new Dictionary<string, int>()) == null, "no Revit warning, no line");
        Ok(GhostFailurePolicy.WarningsLine(new Dictionary<string, int> { ["Highlighted walls overlap."] = 2, ["There are identical instances in the same place."] = 1 })
               == "Revit warnings raised by this build: 3 — left in the model (Manage ▸ Review Warnings), never erased: Highlighted walls overlap. ×2; There are identical instances in the same place.",
           "warnings are counted by text and said to be left in the model");
        var seen = new List<(string Key, string Text, IReadOnlyCollection<long> Ids)>
        {
            ("k1", "Highlighted walls overlap.", new long[] { 101, 900 }),
            ("k1", "Highlighted walls overlap.", new long[] { 101, 900 }),   // the same warning, shown again on the next pass
            ("k2", "Highlighted walls overlap.", new long[] { 102, 103 }),
            ("k3", "There are identical instances in the same place.", new long[] { 103 }),
        };
        string Counted(ISet<long> gone) =>
            string.Join("; ", GhostFailurePolicy.CountWarnings(seen, gone).OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => $"{kv.Key}={kv.Value}"));
        Ok(Counted(new HashSet<long>()) == "Highlighted walls overlap.=2; There are identical instances in the same place.=1",
           "a warning seen on two passes counts once; two warnings with the same text count two");
        Ok(Counted(new HashSet<long> { 103 }) == "Highlighted walls overlap.=1",
           "a warning naming an element of this build that Revit removed is not counted — it went with the element");
        Ok(GhostFailurePolicy.NotBuiltLine("X (y)") == "Nothing was built — Revit rolled the build back, so the model is as it was before Build: X (y)",
           "a rolled-back build reads as nothing built");
        Ok(GhostFailurePolicy.NotFinishedLine("Pending") == "Revit has not finished the build (status Pending) — check the model before re-running",
           "A6: a build Revit has not finished (Pending) reads as not finished — never as nothing built, never recounted");
        Ok(GhostFailurePolicy.DoctorSkips("Ghost Builder - LOD 200") && !GhostFailurePolicy.DoctorSkips("Sentinel: Fix") && !GhostFailurePolicy.DoctorSkips(null!),
           "A4: the Doctor skips the Ghost transaction only — it never erases a warning Ghost counts");
        Ok(GhostFailurePolicy.TypeParamBlocked(true, "Ghost 275mm", 0) == null,
           "A7: a type this build added takes the type parameter");
        Ok(GhostFailurePolicy.TypeParamBlocked(false, "Generic - 200mm", 3) == "not applied to type \"Generic - 200mm\" — it would change 3 existing instance(s)"
           && GhostFailurePolicy.TypeParamBlocked(false, "Generic - 200mm", 0) == "not applied to type \"Generic - 200mm\" — it is the model's own type, not one this build added",
           "A7: a type the model already had is never written — the Note says how many existing instances it would change");
    }

    // ── the family-type pick: exact (category, family, type), or a gap a person resolves — never the first one loaded ──
    static void TypePick()
    {
        Console.WriteLine("\nMA-1a — the family type a row names (GhostTypePick)");
        var doors = new List<(string Family, string Type)>
        {
            ("Single-Flush", "0915 x 2134mm"), ("Single-Flush", "0864 x 2134mm"), ("Double-Glass", "0915 x 2134mm"), ("Bifold", "Standard"),
        };
        int P(string? family, string? type, out string? why) => GhostTypePick.Pick(doors, "Doors", family!, type!, out why);

        Ok(P("Single-Flush", "0864 x 2134mm", out _) == 1, "family and type → that one type");
        Ok(P(" single-flush ", "0864 X 2134MM", out _) == 1, "names compare as Revit's do: case- and space-insensitive");
        Ok(P(null, "0915 x 2134mm", out var shared) == -1 && shared == "2 Doors types are named \"0915 x 2134mm\" — a person decides (pick one in the review)",
           "a type name two families share is a person's call, never the first family's");
        Ok(P(null, "Standard", out _) == 3, "a type name only one family has → that type");
        Ok(P("Bifold", null, out _) == 3, "a family with no type named → its ONLY type");
        Ok(P("Single-Flush", null, out var many) == -1 && many == "Doors family \"Single-Flush\" has 2 types — pick one in the review",
           "a family with two types and none named → a gap, never its first type");
        Ok(P("Generic_Door", null, out var missing) == -1 && missing == "Doors family \"Generic_Door\" is not loaded in this model — load it or set the Ghost family library",
           "the base standard's Generic_Door, not loaded → a gap, never another door family (the old fallback)");
        Ok(P(null, null, out var nothing) == -1 && nothing == "the layer mapping names no Doors family or type — Sentinel never takes the first one loaded; pick one in the review",
           "a row that names nothing → a gap");
        Ok(GhostTypePick.Pick(new List<(string Family, string Type)>(), "Doors", "Single-Flush", "0864 x 2134mm", out var none) == -1
           && none == "Doors type \"Single-Flush : 0864 x 2134mm\" is not loaded in this model — load it or pick a loaded type in the review",
           "nothing loaded → a gap naming family and type");
    }

    // ── the review: a type drop-down per row, "(ignore)", copies out, the forecast of what the build will add ──
    static void ReviewChoices()
    {
        Console.WriteLine("\nMA-1a — the review's type drop-down (GhostReviewWindow)");
        var proposal = new MappingResult
        {
            Mappings = new List<LayerMapping>
            {
                new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls",    BdsFamily = "BDS_Wall_Ext",    Confidence = 1.0, Source = "standard" },
                new LayerMapping { CadLayer = "A-DOOR",     Category = "Doors",    BdsFamily = "Generic_Door",    Confidence = 1.0, Source = "standard" },
                new LayerMapping { CadLayer = "A-FLOR",     Category = "Floors",   BdsFamily = "BDS_Floor",       Confidence = 1.0, Source = "standard" },
                new LayerMapping { CadLayer = "A-LEVEL",    Category = "Ceilings", BdsFamily = "Generic Ceiling", Confidence = 0.8, Source = "llm" },
            }
        };
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase) { ["A-WALL-EXT"] = 4, ["A-DOOR"] = 2, ["A-FLOR"] = 1, ["A-LEVEL"] = 3 };
        var loaded = new Dictionary<string, IReadOnlyList<(string? Family, string Type)>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Walls"]  = new List<(string? Family, string Type)> { (null, "Exterior - Brick on CMU"), (null, "Generic - 200mm") },
            ["Floors"] = new List<(string? Family, string Type)> { (null, "BDS_Floor") },
            ["Doors"]  = new List<(string? Family, string Type)> { ("Single-Flush", "0864 x 2134mm"), ("Single-Flush", "0915 x 2134mm") },
        };

        var w = new GhostReviewWindow();          // constructed, never shown
        MappingResult? emitted = null;
        w.BuildRequested += (m, _) => emitted = m;
        w.LoadTypes(loaded);
        w.Load(proposal, counts, "Scratch.rvt", "Layers: …", guided: true, hasLibrary: true);
        (CheckBox Box, ComboBox Type, LayerMapping Map) Row(GhostReviewWindow win, string layer) => win.Rows.First(r => r.Map.CadLayer == layer);
        void Choose(GhostReviewWindow win, string layer, string label) { var t = Row(win, layer).Type; t.SelectedItem = t.Items.Cast<object>().First(i => i.ToString() == label); }

        Ok(Row(w, "A-DOOR").Type.Items.Cast<object>().Select(i => i.ToString()).SequenceEqual(new[]
           { "as proposed: Generic_Door", "Single-Flush : 0864 x 2134mm", "Single-Flush : 0915 x 2134mm", "(ignore)" }),
           "a row offers: as proposed, every loaded type of its category (family : type), and (ignore)");
        Ok(w.ForecastText == string.Join(Environment.NewLine, new[]
           {
               "Types this build will add to the model (forecast — the summary lists what was added):",
               "  + Doors family \"Generic_Door\" (layer A-DOOR) — loaded from the Ghost family library if it holds Generic_Door.rfa, else skipped",
               "  + Walls type \"BDS_Wall_Ext\" (layer A-WALL-EXT) — cloned from the type catalogue, or reported as a gap",
               "  + Walls typed by the guideline at a thickness the model lacks — made at Build, each listed in the summary",
           }),
           "before Build, the review lists what the ticked rows will add (BDS_Floor is loaded: not listed)");

        Choose(w, "A-DOOR", "Single-Flush : 0864 x 2134mm");
        Ok(!w.ForecastText.Contains("Generic_Door"), "picking a loaded door type takes Generic_Door off the forecast");
        Choose(w, "A-FLOR", "(ignore)");
        Ok(Row(w, "A-FLOR").Box.IsChecked == false && !Row(w, "A-FLOR").Box.IsEnabled, "(ignore) unticks the row and locks its box");
        Choose(w, "A-LEVEL", "(ignore)");
        w.Build();
        var built = emitted?.Mappings ?? new List<LayerMapping>();
        Ok(built.Select(m => m.CadLayer).SequenceEqual(new[] { "A-DOOR", "A-WALL-EXT" }), "Build emits the ticked rows only — never an ignored one");
        Ok(built.FirstOrDefault(m => m.CadLayer == "A-DOOR") is { Source: "reviewer", BdsFamily: "Single-Flush", BdsFamilyType: "0864 x 2134mm" },
           "a picked type leaves as the reviewer's: that family and type");
        Ok(built.All(b => proposal.Mappings.All(p => !ReferenceEquals(b, p)))
           && proposal.Mappings[1] is { Source: "standard", BdsFamily: "Generic_Door", BdsFamilyType: null },
           "every row leaves as a copy — the proposal (and the mapper's cached rows) are never edited");
        Ok(w.Choices.Select(c => $"{c.CadLayer}:{c.Source}:{c.Ignore}").SequenceEqual(new[] { "A-LEVEL:reviewer:True", "A-DOOR:reviewer:False", "A-FLOR:reviewer:True" }),
           "the reviewer's choices — a pick and two ignores, ticked or not — are what the command remembers");

        // A2: a remembered ignore on a category with no loaded type can still be undone ("as proposed"), or forgotten.
        var w2 = new GhostReviewWindow();
        w2.LoadTypes(loaded);
        w2.Load(new MappingResult { Mappings = new List<LayerMapping>
            { new LayerMapping { CadLayer = "A-LEVEL", Category = "Ceilings", BdsFamily = "Generic Ceiling", Confidence = 1.0, Source = "reviewer", Ignore = true } } },
            counts, "Scratch.rvt", "Layers: …");
        var lv = w2.Rows[0];
        bool cameBackIgnored = lv.Type.SelectedItem?.ToString() == "(ignore)" && lv.Box.IsChecked == false && !lv.Box.IsEnabled;
        Choose(w2, "A-LEVEL", "as proposed: Generic Ceiling");
        Ok(cameBackIgnored && lv.Box.IsEnabled
           && w2.Choices.Select(c => $"{c.CadLayer}:{c.Source}:{c.Ignore}:{c.BdsFamily}").SequenceEqual(new[] { "A-LEVEL:reviewer:False:Generic Ceiling" }),
           "a remembered ignore comes back as (ignore), unticked and locked — and \"as proposed\" undoes it, even with no type loaded");
        Choose(w2, "A-LEVEL", "(forget my choice)");
        Ok(lv.Type.Items.Cast<object>().Select(i => i.ToString()).SequenceEqual(new[] { "as proposed: Generic Ceiling", "(ignore)", "(forget my choice)" })
           && lv.Box.IsChecked == false && !lv.Box.IsEnabled && w2.Choices.Count == 1 && w2.Choices[0].Forget,
           "a remembered row offers (forget my choice): not built this run, handed to Remember to forget");
        Ok(GhostReviewWindow.SourceNote("reviewer") == "  · your earlier review" && !GhostReviewWindow.PreTick(10, 1.0, "reviewer", 0.5),
           "a remembered reviewer row says so and starts unticked, like every row that is not the standard");

        // A3: with no Ghost family library, a door family that is not loaded is a skip, never an addition.
        var w3 = new GhostReviewWindow();
        w3.LoadTypes(loaded);
        w3.Load(new MappingResult { Mappings = new List<LayerMapping> { proposal.Mappings[1] } }, counts, "Scratch.rvt", "Layers: …");
        Ok(w3.ForecastText == "Types: this build adds no type or family to the model." + Environment.NewLine
           + "  – Doors family \"Generic_Door\" (layer A-DOOR) — not loaded, and no Ghost family library is set — the row will be skipped",
           "no family library: a door family that is not loaded is forecast as skipped, never as an addition");
    }
}
