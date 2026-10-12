#nullable disable
using Sentinel.Coordination;

static partial class Check
{
    // ── MA-6 fix-b1: drill MA6 batch 1 — a missing level's words fit every source (F-1); a type the model does not hold keeps the changeset
    // proposed (F-2) and is said on its review row before Apply (F-3) ──
    static void Ma6FixB1Checks()
    {
        Console.WriteLine("\nMA-6 fix-b1 — drill MA6 batch 1: level words, a type not loaded stays proposed and is said before Apply");
        string ex = Src("GhostBuilder", "ChangesetExecutor.cs"), win = Src("UI", "ChangesetReviewWindow.cs"), review = Src("Commands.ReviewChangesets.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        string Body(string head) { int i = At(ex, head); return i < 0 ? "" : ex.Substring(i, ex.IndexOf("\n    }\n", i, StringComparison.Ordinal) - i); }

        // F-1: the missing-level refusal, on an agent's changeset too — no "re-run Promote" first.
        const string tail = " does not exist in this model — apply the changeset that creates it first, or propose again creating it or naming a level it has (Promote: run it again); nothing was placed, and this one stays proposed\");";
        Ok(Body("private static Level ResolveLevel(Document doc, PlaceDto place)").Contains("throw new PlacementRefused($\"level \\\"{place.LevelName}\\\"" + tail)
           && Body("private static Level LevelNamed(Document doc, string name)").Contains("throw new PlacementRefused($\"level \\\"{n}\\\"" + tail)
           && !ex.Contains("re-run Promote, re-propose naming a level it has"),
           "F-1: a named level that does not exist is refused in words that fit every source (an agent's storey applied before the one that makes its level) — ResolveLevel and LevelNamed say the same");

        // F-2: a type the model does not hold is the model's state — PlacementRefused in every lookup; two of the name still decline.
        string wallT = Body("internal static WallType ResolveWallType(Document doc, string typeName)"), floorT = Body("internal static FloorType ResolveFloorType(Document doc, string typeName)"),
               createT = Body("internal static ElementType CreateType(Document doc, BuiltInCategory bic, string kind, string familyName, string typeName)"),
               retypeT = Body("internal static ElementType RetypeTarget(Document doc, Element e, string kind, string familyName, string typeName)");
        Ok(wallT.Contains("?? throw new PlacementRefused($\"wall type \\\"{typeName}\\\" does not exist in this model")
           && floorT.Contains("if (hits.Count == 0) throw new PlacementRefused($\"floor type \\\"{typeName}\\\" does not exist in this model")
           && createT.Contains("if (hits.Count == 0) throw new PlacementRefused($\"{kind} type \\\"{label}\\\" does not exist in this model — load it (Sentinel loads no families and creates no types)")
           && retypeT.Contains("if (hits.Count == 0) throw new PlacementRefused($\"{kind} type \\\"{label}\\\" does not exist in this model")
           && !ex.Contains("throw new InvalidOperationException($\"wall type \\\"{typeName}\\\" does not exist") && !ex.Contains("throw new InvalidOperationException($\"{kind} type \\\"{label}\\\" does not exist")
           && !ex.Contains("throw new InvalidOperationException($\"floor type \\\"{typeName}\\\" does not exist")
           && floorT.Contains("if (hits.Count > 1) throw new InvalidOperationException(") && createT.Contains("if (hits.Count > 1) throw new InvalidOperationException("),
           "F-2: wall, floor, roof, ceiling, door, window, column, furniture, beam and retype lookups refuse a type the model does not hold with PlacementRefused (the changeset stays proposed); two types of the name still decline");
        Ok(Src("Commands.PromoteWalls.cs").Contains("catch (Exception ex) { return ex.Message; }")
           && Body("internal static string RehostRefusal(Document doc, string kind, string familyName, string typeName)").Contains("catch (InvalidOperationException ex) { return ex.Message; }")
           && Src("GhostBuilder", "GhostChangesetBuild.cs").Contains("catch (InvalidOperationException ex) { return ex.Message; }")
           && Src("GhostBuilder", "PlacementApply.cs").Contains("class PlacementRefused : InvalidOperationException"),
           "…and every pre-check that reads a lookup's refusal still does (Promote's preflight, RehostRefusal, Ghost's Refusal): PlacementRefused is an InvalidOperationException");

        // NotLoaded asks, per kind, the lookup Execute runs — the review's answer is Apply's.
        string notLoaded = Body("internal static HashSet<string> NotLoaded(Document doc, IEnumerable<ChangesetElementDto> rows)");
        string[] pairs =
        {
            "ResolveWallType(doc, p.TypeName)", "ResolveWallType(doc, el.Place.TypeName)",
            "ResolveFloorType(doc, p.TypeName)", "ResolveFloorType(doc, el.Place.TypeName)",
            "CreateType(doc, BuiltInCategory.OST_Roofs, \"roof\", null, p.TypeName)", "CreateType(doc, BuiltInCategory.OST_Roofs, \"roof\", null, el.Place.TypeName)",
            "CreateType(doc, BuiltInCategory.OST_Ceilings, \"ceiling\", null, p.TypeName)", "CreateType(doc, BuiltInCategory.OST_Ceilings, \"ceiling\", null, el.Place.TypeName)",
            "CreateType(doc, BuiltInCategory.OST_StructuralFraming, \"beam\", p.FamilyName, p.TypeName)", "CreateType(doc, BuiltInCategory.OST_StructuralFraming, \"beam\", el.Place.FamilyName, el.Place.TypeName)",
            "RetypeTarget(doc, e, el.Kind, p.FamilyName, p.TypeName)", "RetypeTarget(doc, e, el.Kind, el.Place?.FamilyName, el.Place?.TypeName)",
        };
        bool same = true;
        for (int i = 0; i < pairs.Length; i += 2) same &= notLoaded.Contains(pairs[i]) && ex.Contains(pairs[i + 1]);
        Ok(same && notLoaded.Contains("\"door\" => () => CreateType(doc, BuiltInCategory.OST_Doors, \"door\", p.FamilyName, p.TypeName)")
           && notLoaded.Contains("\"window\" => () => CreateType(doc, BuiltInCategory.OST_Windows, \"window\", p.FamilyName, p.TypeName)")
           && ex.Contains("CreateType(doc, el.Kind == \"door\" ? BuiltInCategory.OST_Doors : BuiltInCategory.OST_Windows,")
           && notLoaded.Contains("\"column\" => () => CreateType(doc, BuiltInCategory.OST_Columns, \"column\", p.FamilyName, p.TypeName)")
           && notLoaded.Contains("\"furniture\" => () => CreateType(doc, BuiltInCategory.OST_Furniture, \"furniture\", p.FamilyName, p.TypeName)")
           && ex.Contains("CreateType(doc, el.Kind == \"column\" ? BuiltInCategory.OST_Columns : BuiltInCategory.OST_Furniture,")
           && notLoaded.Contains("catch (PlacementRefused) { gone = true; }") && notLoaded.Contains("else if (IsCreate(el) || el.Op == \"rehost\")"),
           "F-3: NotLoaded asks each create, retype and rehost the very lookup Apply runs for its kind, and counts only its PlacementRefused (not loaded)");

        // Execute refuses the ticked rows NotLoaded names before its transaction — NotRun, so the changeset stays proposed.
        int design = At(ex, "PlacementApply.DesignOptionRefusal(doc, \"apply it\") is { } inOption"), pre = At(ex, "var notLoaded = NotLoaded(doc, toPlace);"), start = At(ex, "t.Start();");
        Ok(design > 0 && pre > design && start > pre
           && ex.Contains("return new ExecutionResult { NotRun = true, Error = ChangesetTrust.NotLoadedRefusal(toPlace.Where(e => notLoaded.Contains(e.ProposalGuid))) };"),
           "F-2: Apply refuses every ticked row whose type is not loaded before its transaction (NotRun: nothing placed, the changeset stays proposed)");
        int notRun = At(review, "if (result.NotRun)"), reopen = At(review, "else window.Reopen(result.Error + "), report = At(review, "Tell($\"Transaction failed and was rolled back:");
        Ok(notRun > 0 && reopen > notRun && report > reopen && review.Substring(notRun, report - notRun).Contains("return;")
           && !review.Substring(notRun, report - notRun).Contains("ReportAll("),
           "…and the review gives Apply back with the ticks kept; nothing reports the changeset declined (the missing-level case's path)");

        // The review: read on the API thread before the window shows; the row says it after its label and opens unticked; the footer counts.
        int read = At(review, "var notLoaded = ChangesetExecutor.NotLoaded(doc, cs.Elements);"), open = At(review, "var window = new ChangesetReviewWindow(cs, reach, notLoaded);");
        int mark = At(win, "var notHere = new TextBlock { Text = ChangesetTrust.NotLoadedMark"), label = At(win, "row.Children.Add(label);");
        Ok(read > 0 && open > read && mark > At(win, "row.Children.Add(show);") && label > mark && win.Contains("DockPanel.SetDock(notHere, Dock.Right);")
           && win.Contains("if (ChangesetTrust.NotLoadedLine(_notLoaded.Count) is string notLoadedLine)")
           && win.Contains("IsChecked = ChangesetTrust.PreTick(_cs, el, _notLoaded)") && win.Contains("r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El, _notLoaded)"),
           "F-3: the review reads the rows whose type is not loaded before the window shows; each says so after its label (never trimmed), opens unticked, Tick suggested leaves it; the footer counts them");

        // Pure: the pre-tick and the words.
        ChangesetElementDto El(string guid, string op, bool? pretick) => new ChangesetElementDto
        {
            ProposalGuid = guid, Op = op, Kind = "window", Pretick = pretick, Verdict = new ElementVerdictDto { Status = "accepted" },
            Target = op == "retype" ? new TargetDto { UniqueId = "u", TypeBefore = "T0" } : null, Accuracy = op == "create" ? new AccuracyDto { Status = "within_tolerance" } : null,
            Validate = new ValidateDto { Identity = new IdentityDto { Name = "W-" + guid } },
            Place = new PlaceDto { FamilyName = "BDS_Window_Single Panel", TypeName = "1200x2000 mm" },
        };
        var promote = new ChangesetDto { Source = "promote" };
        var survey = new ChangesetDto { Source = "sentinel-survey 0.6.0", Claimed = false };
        var gone = new HashSet<string> { "g1" };
        Ok(ChangesetTrust.PreTick(promote, El("g1", "retype", true)) && !ChangesetTrust.PreTick(promote, El("g1", "retype", true), gone)
           && ChangesetTrust.PreTick(survey, El("g1", "create", true)) && !ChangesetTrust.PreTick(survey, El("g1", "create", true), gone)
           && ChangesetTrust.PreTick(promote, El("g2", "retype", true), gone) && !ChangesetTrust.PreTick(promote, El(null, "retype", false), gone),
           "F-3: a row whose type is not loaded opens unticked even when the bridge pre-ticked it (a Promote retype, a measured survey create); every other row as before");
        var one = ChangesetTrust.NotLoadedRefusal(new[] { El("g1", "create", null) });
        var seven = ChangesetTrust.NotLoadedRefusal(Enumerable.Range(1, 7).Select(i => El("g" + i, "create", null)));
        Ok(one == "1 ticked row(s) name a type this model does not hold — window \"W-g1\" (BDS_Window_Single Panel : 1200x2000 mm): load the family (Sentinel loads no families and creates no types), "
                  + "or untick that row and apply the rest, or propose again with a loaded type; nothing was placed, and this one stays proposed"
           && seven.StartsWith("7 ticked row(s) name a type this model does not hold — window \"W-g1\"") && seven.Contains("window \"W-g5\" (BDS_Window_Single Panel : 1200x2000 mm) and 2 more: ")
           && !seven.Contains("W-g6"),
           "F-2: Apply's refusal names each row and its type (five, then a count), says what to do — load the family, untick the row, or propose again — and that nothing was placed and it stays proposed");
        Ok(ChangesetTrust.NotLoadedLine(0) == null && ChangesetTrust.NotLoadedLine(2)?.Contains("2 row(s) name a type this model does not hold") == true
           && ChangesetTrust.NotLoadedMark == "⚠ not in this model — load the family, or untick this row",
           "F-3: the footer counts the rows (none, no line); each row's mark is plain words");
    }
}
