#nullable disable
// MA-8-8: MEP Type Check's judge on the real BDS catalogue (pure; the Revit half is pinned by source text), and its ledger row.
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    static MepFact Mf(long id, string cat, string fam, string type, string sys = null, string sysFam = null, bool read = false) =>
        new MepFact { Id = id, Category = cat, Family = fam, Type = type, System = sys, SystemFamily = sysFam, SystemRead = read };

    static void Ma8MepChecks()
    {
        Console.WriteLine("\nMA-8-8 — MEP Type Check (MepTypeCheck, CommandReports.MepCheck)");
        string catText = File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json"));
        var m = GuidelineMatcher.FromBodies(null, catText, out _, out _);
        m.CatalogLabel = "type_catalog@1 · ma0-bds · 0123456789ab…";

        Ok(m.CatalogCount("Piping Systems") == 11 && m.CatalogCount("Duct Systems") == 3 && m.CatalogCount("Conduits") == 8, "the catalogue counts its rows by category (11 Piping Systems, 3 Duct Systems, 8 Conduits)");
        Ok(MepTypeCheck.NoCatalog(m) == null, "a catalogue installed: no refusal");
        var empty = GuidelineMatcher.FromBodies(null, null, out _, out _);
        Ok(MepTypeCheck.NoCatalog(empty) == "No type catalogue installed (type_catalog (unlabelled)) — nothing to check against; nothing was sent.", "no catalogue: said in words, nothing to send");

        var facts = new[]
        {
            Mf(1, "Ducts", "Oval Duct", "Default", "Supply Air", "Duct System", true),             // matched
            Mf(2, "Ducts", "Oval Duct", "Default", "Supply Air 2", "Duct System", true),           // system not the office's
            Mf(3, "Ducts", "Oval Duct", "Default", null, null, true),                              // no system
            Mf(4, "Ducts", "Round Duct", "Mitered Elbows / Tees", "Supply Air", "Duct System", true),   // type not the office's
            Mf(5, "Pipes", "Pipe Types", "Default", "Domestic Cold Water", "Piping System", true), // matched
            Mf(6, "Pipes", "Pipe Types", "Default", "Domestic Cold Water", "Piping System", true),
            Mf(7, "Cable Trays", "Cable Tray with Fittings", "Ladder Cable Tray"),                 // matched, type only
            Mf(8, "Cable Trays", "Cable Tray with Fittings", "Wire Mesh Strange"),                 // type not the office's
            Mf(9, "Conduits", "Conduit with Fittings", "Rigid Metal Conduit (RMC)"),
        };
        var r = MepTypeCheck.Run(facts, m);
        Ok(r.Checked == 9 && r.Matched == 5 && r.TypeNotOffice == 2 && r.SystemNotOffice == 1 && r.NoSystem == 1 && r.Unmatched == 4,
           $"9 checked: 5 matched, 2 type, 1 system, 1 no system (got {r.Checked}/{r.Matched}/{r.TypeNotOffice}/{r.SystemNotOffice}/{r.NoSystem})");
        var ducts = r.Categories.Single(c => c.Category == "Ducts");
        Ok(ducts.Matched == 1 && ducts.SystemNote == "system checked against 3 Duct Systems rows", "ducts: system checked against the 3 Duct Systems rows");
        Ok(r.Categories.Single(c => c.Category == "Pipes").SystemNote == "system checked against 11 Piping Systems rows", "pipes: system checked against the 11 Piping Systems rows");
        Ok(r.Categories.Single(c => c.Category == "Cable Trays").SystemNote == "type only — Revit gives a cable tray no system type"
           && r.Categories.Single(c => c.Category == "Conduits").SystemNote.StartsWith("type only"), "trays and conduits: type only, said");
        Ok(r.Findings.Select(f => f.Verdict).OrderBy(x => x).SequenceEqual(new[] { MepTypeCheck.None, MepTypeCheck.Wrong, MepTypeCheck.Wrong, MepTypeCheck.WrongSystem }.OrderBy(x => x)),
           "four findings, one per unmatched group");
        Ok(r.Findings.Single(f => f.Ids.Contains(2)).Verdict == MepTypeCheck.WrongSystem && r.Findings.Single(f => f.Ids.Contains(3)).Verdict == MepTypeCheck.None
           && r.Findings.Single(f => f.Ids.Contains(4)).Verdict == MepTypeCheck.Wrong && r.Findings.Single(f => f.Ids.Contains(8)).Verdict == MepTypeCheck.Wrong,
           "each unmatched element sits in the finding of its own verdict");
        Ok(ducts.SystemJudged == 3 && r.SystemJudged == 5, $"systems judged only on elements with the office's type (got {ducts.SystemJudged}/{r.SystemJudged})");

        // One wrong type spread over systems is one finding, with no system (it was never judged).
        var rw = MepTypeCheck.Run(new[] { Mf(1, "Ducts", "Round Duct", "Strange", "Supply Air", "Duct System", true), Mf(2, "Ducts", "Round Duct", "Strange", "Return Air", "Duct System", true) }, m);
        Ok(rw.Findings.Count == 1 && rw.Findings[0].Count == 2 && rw.Findings[0].System == null, "a wrong type over two systems: one finding, Count 2, no system");

        // A system type whose own family differs from the catalogue's is not the office's: the family reaches CatalogHas.
        var rf = MepTypeCheck.Run(new[] { Mf(1, "Ducts", "Oval Duct", "Default", "Supply Air", "Lüftungssystem", true) }, m);
        Ok(rf.SystemNotOffice == 1 && rf.Matched == 0, "a different SystemFamily changes the verdict");

        // A system that cannot be read is counted as not judged, said in the note.
        var ru = MepTypeCheck.Run(new[] { Mf(1, "Pipes", "Pipe Types", "Default") }, m);
        Ok(ru.Matched == 1 && ru.SystemJudged == 0 && ru.SystemUnread == 1 && ru.Categories[0].SystemNote.EndsWith("; 1 not judged (system unreadable)"), "system unreadable: matched but counted not judged");

        // A catalogue with no rows for a category: its elements are not checkable, never a type failure.
        var noDucts = System.Text.Json.Nodes.JsonNode.Parse(catText);
        var drows = noDucts["types"].AsArray();
        for (int i = drows.Count - 1; i >= 0; i--) if ((string)drows[i]["category"] == "Ducts") drows.RemoveAt(i);
        var md = GuidelineMatcher.FromBodies(null, noDucts.ToJsonString(), out _, out _);
        var rn = MepTypeCheck.Run(new[] { Mf(1, "Ducts", "Oval Duct", "Default", "Supply Air", "Duct System", true), Mf(2, "Cable Trays", "Cable Tray with Fittings", "Ladder Cable Tray") }, md);
        Ok(rn.Checked == 2 && rn.NotCheckable == 1 && rn.TypeNotOffice == 0 && rn.Matched == 1 && rn.Unmatched == 0 && rn.Findings.Count == 0
           && rn.Categories.Single(c => c.Category == "Ducts").SystemNote == "not checkable — the catalogue has no Ducts rows",
           "no Ducts rows: not checkable, said, not a finding");
        Ok(Json(CommandReports.MepCheck(rn, "cat", "a@b.test")).GetProperty("action").GetString().EndsWith(", 1 not checkable"), "the ledger action says not checkable");

        // A catalogue with no Piping Systems rows cannot judge a pipe's system: not checkable, never a fail or a pass of it.
        var trimmed = System.Text.Json.Nodes.JsonNode.Parse(catText);
        var rows = trimmed["types"].AsArray();
        for (int i = rows.Count - 1; i >= 0; i--) if ((string)rows[i]["category"] == "Piping Systems") rows.RemoveAt(i);
        var mt = GuidelineMatcher.FromBodies(null, trimmed.ToJsonString(), out _, out _);
        var rp = MepTypeCheck.Run(new[] { Mf(1, "Pipes", "Pipe Types", "Default", "Anything", "Piping System", true) }, mt);
        Ok(rp.Matched == 1 && rp.Categories[0].SystemNote == "type only — system not checkable, the catalogue has no Piping Systems rows",
           "no Piping Systems rows: the pipe's system is not checkable, said, and not failed");

        // Findings: most elements first; a finding keeps at most 20 ids; the row keeps 50 beside the true total.
        var many = Enumerable.Range(1, 130).Select(i => Mf(i, "Conduits", "Conduit with Fittings", "Odd " + i)).ToList();
        many.AddRange(Enumerable.Range(1000, 25).Select(i => Mf(i, "Conduits", "Conduit with Fittings", "Odd 7")));
        var rm = MepTypeCheck.Run(many, m);
        Ok(rm.Findings[0].Type == "Odd 7" && rm.Findings[0].Count == 26 && rm.Findings[0].Ids.Count == MepTypeCheck.IdsPerFinding, "findings sorted by count; ids capped at 20");
        var nv = Json(CommandReports.MepCheck(rm, "type_catalog@1 · x", "a@b.test")).GetProperty("new_value");
        Ok(nv.GetProperty("findings").GetArrayLength() == CommandReports.MaxNames && nv.GetProperty("findings_total").GetInt32() == rm.Findings.Count && rm.Findings.Count > 50,
           "the row keeps 50 findings beside the true total");

        Ok(JsonSerializer.Serialize(CommandReports.MepCheck(MepTypeCheck.Run(new[] { Mf(9, "Conduits", "Conduit with Fittings", "Rigid Metal Conduit (RMC)") }, m), "cat", "lead@office.example"), new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) ==
           "{\"entity_type\":\"mep_check\",\"actor\":\"lead@office.example\",\"action\":\"mep_check:run · 1 checked, 1 matched, 0 type and 0 system not the office's (system judged on 0)\"," +
           "\"new_value\":{\"catalog\":\"cat\",\"no_type\":0,\"not_read\":\"flex ducts and pipes, placeholders, fabrication parts, fittings and accessories\",\"categories\":[{\"category\":\"Conduits\",\"checked\":1,\"matched\":1,\"type_not_office\":0,\"system_not_office\":0,\"no_system\":0,\"not_checkable\":0,\"system_judged\":0,\"system_unread\":0," +
           "\"system_note\":\"type only — Revit gives a conduit no system type\"}],\"findings\":[],\"findings_total\":0,\"source\":\"revit\"}}",
           "the mep_check body, whole");

        // The Revit half, pinned by source: the four categories come from the fixed map (never Category.Name), the system type's own
        // FamilyName goes to the catalogue, the command is read only, and the walk is MepVoidManager's own category list.
        string cmd = File.ReadAllText(Repo("SentinelAddin", "Commands.MepTypeCheck.cs"));
        Ok(cmd.Contains("[Transaction(TransactionMode.ReadOnly)]") && !cmd.Contains("Category.Name") && !cmd.Contains("new Transaction(")
           && cmd.Contains("OST_DuctCurves => \"Ducts\"") && cmd.Contains("OST_PipeCurves => \"Pipes\"") && cmd.Contains("OST_CableTray => \"Cable Trays\"") && cmd.Contains("OST_Conduit => \"Conduits\"")
           && cmd.Contains("st?.FamilyName") && cmd.Contains("MepVoidManager.MepCats"), "the command: read only, categories by BuiltInCategory, the system type's own family name");
        Ok(File.ReadAllText(Repo("SentinelAddin", "Engine", "MepVoidManager.cs")).Contains("internal static readonly BuiltInCategory[] MepCats"), "MepCats is internal, shared with the check");
        Ok(File.ReadAllText(Repo("SentinelAddin", "App.cs")).Contains("\"Sentinel.Commands.MepTypeCheckCommand\""), "the ribbon button is registered");
    }
}
