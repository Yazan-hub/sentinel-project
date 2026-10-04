#nullable disable
static partial class Check
{
    // ── 35. MA-2c: the Revit-bound wiring of set_parameter, by source scan (the executor, the fix-in-place writer, the commands, the
    //        placement event and the review window compile in no check project; drill MA2c runs them) ────────────────────────────
    static void Ma2cWiringChecks()
    {
        Console.WriteLine("\nMA-2c — wiring (source scans)");
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        string exec = Src("GhostBuilder", "ChangesetExecutor.cs"), fix = Src("Coordination", "FixInPlaceService.cs"), place = Src("GhostBuilder", "ChangesetPlacementEvent.cs");
        string promote = Src("Commands.PromoteWalls.cs"), ctx = Src("GhostBuilder", "PromoteContext.cs"), window = Src("UI", "ChangesetReviewWindow.cs");
        string review = Src("Commands.ReviewChangesets.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);

        int attach = At(exec, "foreach (var el in toPlace.Where(e => e.Op == \"attach\"))"), write = At(exec, "foreach (var el in toPlace.Where(e => e.Op == \"set_parameter\"))");
        Ok(attach > 0 && write > attach && write < At(exec, "if (result.Applied.Count != toPlace.Count)")
           && exec.Contains("FixInPlaceService.WriteOnType(doc, type, el.Parameter, el.From, el.To, App.OrgFor(doc));") && exec.Contains("var type = ParamTarget(doc, el);"),
           "the executor writes each set_parameter after every retype and attach, inside the changeset's transaction, on the type the plan named");
        int stale = At(fix, "throw new InvalidOperationException($\"stale: {key} on type {t.Name} reads"), set = At(fix, "if (!p.Set(to))");
        Ok(stale > 0 && set > stale && At(fix, "reads back \\\"{back}\\\", not \\\"{to}\\\" — not written") > set
           && fix.Contains("entry.Candidates.Where(c => !c.InstanceOnly && (c.Kind == ParamKind.Lookup || c.Kind == ParamKind.BuiltIn))")
           && fix.Contains("p.StorageType != StorageType.String ?"),
           "the write is the stale guard (the value read now is empty, whatever the plan's from says: C1), then the set, then a read-back as the IDS reads it — on the type's own text parameter only");
        Ok(place.Contains(".Where(e => e.Op != \"set_parameter\").ToDictionary(e => e.ProposalGuid, e => e.Kind ?? \"wall\")"),
           "the DD IDS before commit judges the elements, never a set_parameter's type");
        Ok(ctx.Contains("var clauseTask = Task.Run(() => ArtefactClient.Resolve(key, \"ids\"));")
           && ctx.Contains("pc.Clauses = ids.Origin == \"none\" ? Clauses.None(ids.Label) : Clauses.FromIds(ids.BodyJson, ids.Label, out _);"),
           "the ids@n a clause is cited from is read with the rest of Promote's context, off the API thread");
        int refuse = At(promote, "PromotePlanner.Refuse(plans,"), plan = At(promote, "PropertyPlanner.Plan(plans, mx, TypeValues(doc, PropertyPlanner.DdTypes(plans, mx), mx), standards.Guideline, pc.Clauses)");
        Ok(refuse > 0 && plan > refuse && plan < At(promote, "PromoteWallsPlanner.Bodies(plans")
           && promote.Contains("FixInPlaceService.OnType(hits[0], doc, entry)") && promote.Contains("lodText + propText +")
           && promote.Contains("p.Held.Concat(p.ToPerson).Select(h =>"),
           "Promote reads the DD types' properties after its preflight and before it files, says what it writes and what goes to a person, and lists each");
        // Review C25 (C20's wiring): with no property row, the dialog shows the report's own line, which names what is held off the type.
        Ok(promote.Contains("var propText = props == null ? \"\" : props.Rows.Count == 0 ? \"\\n\\n\" + props.Line")
           && !promote.Contains("every one the DD types hold is filled"),
           "with no DD property row, Promote's dialog shows PropertyReport.Line — what is held off the type is said, never the old literal (C20)");
        Ok(window.Contains("\"set_parameter\" => $\"type edit {el.Kind}:") && window.Contains("$\"reaches {reachN} element(s) in the model now\"")
           // MA-2d C11: a storey's window (StoreyBatch.Merge's name) counts "this storey's" retypes.
           && window.Contains("(ChangesetTrust.RetypedOnto(_cs, el) is int more && more > 0 ? $\" + {more} if this {((_cs.Name ?? \"\").EndsWith(\", one Undo)\", StringComparison.Ordinal) ? \"storey\" : \"changeset\")}'s retypes onto it are applied\" : \"\")")
           && review.Contains("reach[sp.ProposalGuid] = new FilteredElementCollector(doc).WhereElementIsNotElementType().Count(x => x.GetTypeId() == spType.Id);")
           && review.Contains("new ChangesetReviewWindow(cs, reach)"),
           "the review window shows a set_parameter as a type edit: its reach counted by the add-in in the model now (C3), the parameter, from, to and the source");
        Ok(promote.Contains("var run = PropertyPlanner.FileAll(bodies, PropertyPlanner.Stalling((body, retry) =>") // MA-3b5 (F4): under the stall rule
           && promote.Contains("type edit(s) not filed — see Sent to a person")
           && promote.Contains("row(s) sent to a person reached no changeset") // C24
           // Review C22: the retry is a network call the plan adds, so it runs off the API thread — MA-2d: ChangesetClient.Send, for every
           // request (section 38).
           && promote.Contains("var cs = ChangesetClient.Propose(fileCfg, key, body, out err);"),
           "Promote files through FileAll: a body the bridge refuses for a set_parameter is filed again without its type edits (C4), the held rows of a body not filed ride on the next (C24), and the result says how many");
    }
}
