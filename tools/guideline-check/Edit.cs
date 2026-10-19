#nullable disable
using System;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── Batch 3 of the no-JSON work: the Modelling Guideline window (Standards & Build ▸ Standards ▸ Modelling Guideline) ──
    // The window's model reads the guideline in force and writes back only what it shows. The new-guideline body below is
    // compared with WebApp/bridge/fixtures/standard-windows/guideline-new.json, which vitest runs through the bridge's own
    // validateArtefact (SENTINEL_WRITE_FIXTURES=1 rewrites the file).
    static void EditChecks(string root)
    {
        Console.WriteLine("\nBatch 3 — the Modelling Guideline window: what it reads it writes back, what it changes installs");
        var files = new[] { Path.Combine(root, "demo", "bds-pilot"), Path.Combine(root, "demo", "ghost-sample") }
            .SelectMany(d => Directory.GetFiles(d, "*guideline*.json")).OrderBy(f => f, StringComparer.Ordinal).ToList();
        Ok(files.Count >= 8, $"the repository's guidelines are found ({files.Count})");
        foreach (var f in files)
        {
            var src = File.ReadAllText(f);
            var json = GuidelineEdit.From(src).ToJson(out var problem);
            Ok(json != null && JsonNode.DeepEquals(JsonNode.Parse(json), JsonNode.Parse(src)),
               $"{Path.GetFileName(f)}: an unchanged save writes the same body" + (problem == null ? "" : " — " + problem));
        }

        // One change: only that field moves; views, viewNaming, references and the rule's why stay.
        var bds = File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "bds-guideline.json"));
        var g = GuidelineEdit.From(bds);
        g.Elements[0].Rules[0].Layer = "A-WALL-EXT-NEW";
        var changed = JsonNode.Parse(g.ToJson(out _)).AsObject();
        var before = JsonNode.Parse(bds).AsObject();
        Ok((string)changed["elements"][0]["rules"][0]["when"]["layer"] == "A-WALL-EXT-NEW", "a changed layer is written");
        changed["elements"][0]["rules"][0]["when"]["layer"] = "A-WALL-EXT";
        Ok(JsonNode.DeepEquals(changed, before), "and nothing else moves (views, viewNaming, references, why and the other rules kept)");
        Ok(g.ToJson(out _) == g.ToJson(out _), "a save is repeatable: the model and the body read are not changed by writing");

        // A field cleared in a card is taken out of the rule, never written blank (the bridge refuses a blank condition).
        g = GuidelineEdit.From(bds);
        g.Elements[0].Rules[0].Params = "";
        var cleared = JsonNode.Parse(g.ToJson(out _));
        Ok(cleared["elements"][0]["rules"][0]["when"]["params"] == null && (string)cleared["elements"][0]["rules"][0]["when"]["layer"] == "A-WALL-EXT",
           "clearing the parameters takes params out of the rule, its layer stays");
        g.Elements[0].Rules[0].Layer = "";
        Ok(g.ToJson(out var noCond) == null && noCond == "Walls, rule 1 names no condition (layer, level, discipline or parameters) — it would match every element; make it the category's default instead.",
           "a rule left with no condition is refused in words: " + noCond);

        // A new guideline, filled in the window from nothing.
        var n = GuidelineEdit.From(null);
        n.Standard = "Office Modelling Guideline v1";
        var walls = new GuidelineEdit.Element { Category = "Walls" };
        walls.Rules.Add(new GuidelineEdit.Rule { Layer = "A-WALL-EXT", Params = "Material = STONE", Why = "Stone cladding outside.", Use = new GuidelineEdit.Use { Family = "Basic Wall", Type = "EXT_STONE_300" } });
        walls.Rules.Add(new GuidelineEdit.Rule { Level = "Level 1", Use = new GuidelineEdit.Use { Family = "Basic Wall", TypePattern = "INT_GYPS_{thickness} mm" } });
        walls.Default = new GuidelineEdit.Use { Family = "Basic Wall", Type = "Generic - 200mm" };
        var stairs = new GuidelineEdit.Element { Category = "Stairs" };
        stairs.Rules.Add(new GuidelineEdit.Rule { Discipline = "Architecture", Use = new GuidelineEdit.Use { Family = "Assembled Stair", Type = "Office Stair", WidthMm = "1200" } });
        n.Elements.Add(walls); n.Elements.Add(stairs);
        n.TitleBlock = "A1 metric : A1"; n.SheetNumber = "A-{level}-{n}"; n.SheetName = "{level} {use}";
        n.Worksets["Walls"] = "Architecture"; n.Worksets["Doors"] = " "; n.PhaseView = true;
        var fresh = n.ToJson(out var freshProblem);
        Ok(fresh != null, "a new guideline filled in the window installs by the add-in's check" + (freshProblem == null ? "" : " — " + freshProblem));
        var fixture = Path.Combine(root, "WebApp", "bridge", "fixtures", "standard-windows", "guideline-new.json");
        if (Environment.GetEnvironmentVariable("SENTINEL_WRITE_FIXTURES") == "1" && fresh != null)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(fixture));
            File.WriteAllText(fixture, JsonNode.Parse(fresh).ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }) + "\n");
        }
        Ok(fresh != null && File.Exists(fixture) && JsonNode.DeepEquals(JsonNode.Parse(fresh), JsonNode.Parse(File.ReadAllText(fixture))),
           "it is the body the bridge's validateArtefact passes (fixtures/standard-windows/guideline-new.json, read by vitest)");
        var fn = JsonNode.Parse(fresh ?? "{}");
        Ok((double)fn["elements"][1]["rules"][0]["use"]["params"]["width_mm"] == 1200 && fn["placement"]["worksets"]["Doors"] == null && (string)fn["placement"]["phase"] == "view",
           "the stair width is a number, a blank workset is left out, the phase is the view's");

        // The mistakes, said in words before anything is sent.
        string Fails(Action<GuidelineEdit> change)
        {
            var e = GuidelineEdit.From(fresh);
            change(e);
            return e.ToJson(out var p) == null ? p : null;
        }
        Ok(Fails(e => e.Standard = " ") == "Name the guideline (for example: Office Modelling Guideline v4).", "a guideline needs a name");
        Ok(Fails(e => e.Elements[0].Rules[0].Use.Family = "") == "Walls, rule 1 needs the family it places.", "a rule needs its family");
        Ok(Fails(e => e.Elements[1].Rules[0].Use.WidthMm = "200") == "Stairs, rule 1: the stair's run width is a number of millimetres from 300 to 5000.", "a stair's width is 300 to 5000 mm");
        Ok(Fails(e => e.Elements[1].Rules.Add(new GuidelineEdit.Rule { Level = "Level 2", Use = new GuidelineEdit.Use { Family = "Assembled Stair", Type = "Office Stair" } }))
           == "Stairs, rule 2: the stair's run width is a number of millimetres from 300 to 5000.", "a new stair rule without a width is refused");
        Ok(Fails(e => e.Elements[0].Rules[0].Params = "Material STONE") == "Walls, rule 1: write each parameter as Name = value, separated by ; (for example: Material = STONE).",
           "parameters are written Name = value");
        Ok(Fails(e => e.SheetName = "") == "Sheets: give both the sheet number and the sheet name, or clear all three sheet fields.", "the sheets block is all or nothing");
        Ok(Fails(e => e.SheetNumber = "A-{n}") == "Sheets: the sheet number must hold {level}, so each level's sheet gets its own number.", "a sheet number holds {level}");
        Ok(Fails(e => e.TitleBlock = "A1 metric") == "The guideline would not install: sheets.titleBlock must be \"Family : Type\"",
           "what the window does not word itself is the add-in's check, in the bridge's words");
        Ok(Fails(e => e.Elements.Clear()) == "Add at least one category and its rules.", "a guideline needs a category");
        Ok(Fails(e => e.Elements[1].Rules[0].Use.WidthMm = "NaN") == "Stairs, rule 1: the stair's run width is a number of millimetres from 300 to 5000.",
           "NaN is not a width (it compares false both ways) — refused in words, never an exception on save");
        // Review finding 2: a blank condition installed before MA-2a is taken out on save, even when the card left it as it was.
        var old = GuidelineEdit.From("{\"standard\":\"Old\",\"elements\":[{\"category\":\"Walls\",\"rules\":[{\"when\":{\"layer\":\"\",\"level\":\"Level 1\"},\"use\":{\"family\":\"Basic Wall\"}}]}]}");
        var oldJson = old.ToJson(out var oldProblem);
        Ok(oldJson != null && JsonNode.Parse(oldJson)["elements"][0]["rules"][0]["when"].ToJsonString() == "{\"level\":\"Level 1\"}",
           "an old guideline's blank layer is dropped on an unchanged save, so the bridge takes it" + (oldProblem == null ? "" : " — " + oldProblem));

        var cleared2 = GuidelineEdit.From(fresh);
        cleared2.TitleBlock = cleared2.SheetNumber = cleared2.SheetName = ""; cleared2.Worksets.Clear(); cleared2.PhaseView = false;
        var c2 = JsonNode.Parse(cleared2.ToJson(out _));
        Ok(c2["sheets"] == null && c2["placement"] == null, "clearing the sheet fields and the placement takes both blocks out");
        Ok(GuidelineEdit.ParamsText(JsonNode.Parse("{\"Material\":\"STONE\",\"Fire\":\"60\"}").AsObject()) == "Material = STONE; Fire = 60", "parameters read as Name = value; …");
    }
}
