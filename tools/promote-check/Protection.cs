#nullable disable
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── Roadmap item 1, slice B: protection@n — what no changeset may edit; the built-in default when none is installed or read ──
    static void ProtectionChecks()
    {
        Console.WriteLine("\nRoadmap item 1 slice B — protected elements are kept as they stand, never edited");
        var d = ProtectionRules.Default("none installed");
        Ok(d.Why("OST_Levels", "Levels", null, false) == "Levels are protected by the built-in protection policy (none installed)",
           "the default protects levels and says by what");
        foreach (var c in new[] { "OST_Grids", "OST_StructuralColumns", "OST_StructuralFraming", "OST_StructuralFoundation", "OST_ProjectBasePoint", "OST_SharedBasePoint" })
            Ok(d.Why(c, c, null, false) != null, "the default protects " + c);
        Ok(d.Why("OST_Walls", "Walls", null, true) == "is structural, protected by the built-in protection policy (none installed)",
           "the default protects a wall or floor whose Structural box is ticked");
        Ok(d.Why("OST_Walls", "Walls", "Shared Levels and Grids", false)?.Contains("(*Shared Levels and Grids*)") == true,
           "the default protects the Shared Levels and Grids workset by its pattern");
        Ok(d.Why("OST_Walls", "Walls", "Architecture", false) == null && d.Why("OST_Doors", "Doors", null, false) == null,
           "an ordinary wall or door is not held");

        var office = ProtectionRules.From("{\"categories\":[\"OST_Levels\"],\"worksets\":[\"Core*\"],\"structural_hosts\":false}", "protection@2 (office)");
        Ok(office.Why("OST_Levels", "Levels", null, false) == "Levels are protected by protection@2 (office)", "an installed policy is named in its words");
        Ok(office.Why("OST_Grids", "Grids", null, false) == null && office.Why("OST_Walls", "Walls", null, true) == null,
           "an installed policy protects only what it lists: grids and structure are free when a lead installs that");
        Ok(office.Why("OST_Walls", "Walls", "core - shafts", false) != null && office.Why("OST_Walls", "Walls", "Façade core", false) == null,
           "a workset pattern matches whole names, case ignored: Core* holds 'core - shafts', not 'Façade core'");
        var none = ProtectionRules.From("{\"categories\":[],\"worksets\":[],\"structural_hosts\":false}", "protection@3 (project)");
        Ok(none.Why("OST_Levels", "Levels", "Shared Levels and Grids", true) == null, "an empty installed policy protects nothing — a lead's ledgered choice");

        var broken = ProtectionRules.From("{\"categories\":[\"OST_Levels\"]}", "protection@4 (office)");
        Ok(broken.Label.StartsWith("the built-in protection policy (protection@4 (office) did not read:") && broken.Why("OST_Grids", "Grids", null, false) != null,
           "a body that does not read fails closed to the default, and says so — never 'nothing protected'");
        Ok(ProtectionRules.From(null, null).Label == "the built-in protection policy (none installed)", "no body is the default");

        // The Protection window (Standards & Build ▸ Protection): a person's words on screen, the bridge's body on save
        Ok(ProtectionRules.Catalog.All(x => x.Code.StartsWith("OST_") && !x.Label.Contains("OST_")) && ProtectionRules.Catalog.Length == 7,
           "the window names every category in words — no Revit code on screen — and offers all seven of the default's");
        var saved = ProtectionRules.From(new ProtectionRules { Categories = { "OST_Levels", "OST_Grids" }, Worksets = { "Core", " core ", "", "*Shared*" }, StructuralHosts = true }.ToJson(), "protection@5 (project)");
        Ok(saved.Categories.SetEquals(new[] { "OST_Grids", "OST_Levels" }) && saved.Worksets.SequenceEqual(new[] { "Core", "*Shared*" }) && saved.StructuralHosts,
           "what the window saves reads back as the same policy: names trimmed, blanks and repeats dropped (case ignored)");
        Ok(new ProtectionRules().ToJson() == "{\"categories\":[],\"worksets\":[],\"structural_hosts\":false}", "an empty form saves every field the bridge requires");
        var (ticked, other) = ProtectionRules.SplitWorksets(new[] { "Shared Levels and Grids", "*Core*", "Gone" }, new[] { "shared levels and grids", "Architecture" });
        Ok(ticked.Count == 1 && ticked.Contains("Shared Levels and Grids") && other.SequenceEqual(new[] { "*Core*", "Gone" }),
           "a saved name that is one of this model's worksets is a tick; a pattern or another model's workset stays in the box");
        var win = Src("Commands.Protection.cs"); var app = Src("App.cs");
        Ok(app.Contains("Push(st, \"Sentinel_Protection\", \"Protection\", \"Sentinel.Commands.ProtectionCommand\"")
           && app.IndexOf("Sentinel_Protection") > app.IndexOf("Sentinel_Standards") && app.IndexOf("Sentinel_Protection") < app.IndexOf("Sentinel_Chain"),
           "Protection sits right after Standards on Standards & Build");
        Ok(win.Contains("GovernedNotify.InstallArtefact(target, \"protection\", body, actor)") && win.Contains("try { Read(); }") && win.Contains("_save.IsEnabled = lead;")
           && win.Contains("foreach (var c in _otherCodes) r.Categories.Add(c);") && win.Contains("Task.Run("),
           "Save installs the next protection@n as the signed-in person, only a lead or owner can press it, a code the window does not show is kept, and no read blocks Revit");
        var exec = Src("GhostBuilder", "ChangesetExecutor.cs"); var evt = Src("GhostBuilder", "ChangesetPlacementEvent.cs"); var ctx = Src("GhostBuilder", "PromoteContext.cs");
        Ok(exec.Contains("var guarded = Protected(doc, toPlace, Protection ?? ProtectionRules.Default(\"not read\"));")
           && exec.Contains("toPlace.RemoveAll(e => guarded.Any(h => h.Item1 == e.ProposalGuid));")
           && exec.Contains("!= toPlace.Count + guarded.Count)")
           && exec.Contains("foreach (var el in rows.Where(e => !IsCreate(e)))"),
           "the executor keeps every protected edit before its transaction, counts it as kept, and never holds a create");
        Ok(evt.Contains("RunChecked(doc, batch, ticked, before, plan, promote?.Ids, promote?.Protection)") && evt.Contains("Protection = protection }"),
           "every reviewed changeset runs with the project's policy");
        Ok(ctx.Contains("ArtefactClient.Resolve(key, \"protection\")") && ctx.Contains("ProtectionRules.Default(prot.NotInstalled ? \"none installed\" : prot.Label)"),
           "the policy is read off the API thread with the other standards; none read is the default");
    }
}
