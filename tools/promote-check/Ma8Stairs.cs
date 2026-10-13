#nullable disable
// MA-8-10: stairs from rules - a stair from a flag. The pure planner (StairPlanner: the riser rule, the run, every hold in words), its body against the bridge's fixture
// (WebApp/bridge/fixtures/changeset-ops/stair-cases.json, which vitest reads too), the guideline's Stairs element against the bridge's cases
// (fixtures/guideline-stairs/cases.json), the DTOs, and the Revit halves pinned by source text (the executor's stair scope, the propose hops, the window).
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    static void Ma8StairsChecks()
    {
        Console.WriteLine("\nMA-8-10 - stairs from rules (StairPlanner, GuidelineMatcher.StairRule, the DTOs, the executor's stair scope, the propose hops)");
        using var cases = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "stair-cases.json")));
        var root = cases.RootElement;

        // the riser rule: ONE function (the planner, the executor's re-check, the fixture) - ceil((f2f - 0.001) / max)
        bool rows = true;
        foreach (var r in root.GetProperty("risers").EnumerateArray())
            rows &= StairPlanner.Risers(r.GetProperty("f2fMm").GetDouble(), r.GetProperty("maxRiserMm").GetDouble()) == r.GetProperty("risers").GetInt32();
        Ok(rows && StairPlanner.Risers(3000.0000001, 187.5) == 16 && (int)Math.Ceiling(3000.0000001 / 187.5) == 17,
           "Risers: 3000/187.5 = 16, 3040/190 = 16, 3040.6/190 = 17, 3500/190 = 19 - and float noise on the levels (3000.0000001) does not add a riser");

        // the plan from the fixture's inputs
        var pl = root.GetProperty("plan");
        var fl = pl.GetProperty("flag");
        double[] V(JsonElement a) => a.EnumerateArray().Select(x => x.GetDouble()).ToArray();
        var stories = pl.GetProperty("stories").EnumerateArray().Select(s => new LevelFact { Name = s.GetProperty("name").GetString(), ElevationMm = s.GetProperty("elevationMm").GetDouble(), IsStory = s.GetProperty("isStory").GetBoolean() }).ToList();
        var rl = pl.GetProperty("rule");
        var rule = (Family: rl.GetProperty("family").GetString(), Type: rl.GetProperty("type").GetString(), WidthMm: rl.GetProperty("widthMm").GetDouble(), Source: rl.GetProperty("source").GetString());
        var ty = pl.GetProperty("type");
        var facts = new StairTypeFacts { MaxRiserMm = ty.GetProperty("maxRiserMm").GetDouble(), MinTreadMm = ty.GetProperty("minTreadMm").GetDouble(), MinRunWidthMm = ty.GetProperty("minRunWidthMm").GetDouble() };
        StairPlan Plan(double[] min = null, double[] max = null, bool? bottomAtMin = null, List<LevelFact> st = null, StairTypeFacts f = null, (string Family, string Type, double WidthMm, string Source)? ru = null, string storey = null) =>
            StairPlanner.Plan(fl.GetProperty("name").GetString(), fl.GetProperty("changeset").GetString(), fl.GetProperty("unique_id").GetString(), storey ?? fl.GetProperty("storey").GetString(),
                              min ?? V(fl.GetProperty("min")), max ?? V(fl.GetProperty("max")), bottomAtMin ?? pl.GetProperty("bottomAtMin").GetBoolean(), st ?? stories, ru ?? rule, f ?? facts, pl.GetProperty("actor").GetString());
        var plan = Plan();
        var got = JsonSerializer.SerializeToNode(plan.Body);
        bool same = plan.Hold == null && JsonNode.DeepEquals(got, JsonNode.Parse(root.GetProperty("good").GetRawText()));
        Ok(same, "the planner's body for the fixture's flag equals the fixture the bridge validates (fixtures/changeset-ops/stair-cases.json: 16 risers, run 3750 mm, source promote)");
        if (!same) Console.WriteLine("        got: " + (plan.Hold ?? got.ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping })));
        Ok(plan.Risers == 16 && plan.GoingMm == 250 && plan.WidthMm == 1200 && plan.RunMm == 3750 && plan.Line == "16 risers of 187.5 mm, going 250 mm, width 1200 mm, run 3750 mm",
           "the plan's account: 16 risers of 187.5 mm, going 250 mm (the type's minimum), width 1200 mm (the rule's), run (N - 1) x going = 3750 mm - not N x going (spike S1)");

        JsonNode Place(StairPlan p) => JsonSerializer.SerializeToNode(p.Body)["elements"][0]["place"];
        var rev = Plan(bottomAtMin: false);
        Ok(rev.Hold == null && Place(rev)["LocationCurve"]["start"][0].GetValue<double>() == 5500 && Place(rev)["LocationCurve"]["end"][0].GetValue<double>() == 1750
           && Place(rev)["LocationCurve"]["start"][1].GetValue<double>() == 2650,
           "bottomAtMin false reverses the line: it starts at the box's high end (x 5500) and ends 3750 mm toward the low end, still centred across (y 2650)");
        var tall = Plan(min: new[] { 2650.0 - 650, 1000.0, 0 }, max: new[] { 2650.0 + 650, 5500.0, 3000 });
        Ok(tall.Hold == null && Place(tall)["LocationCurve"]["start"][1].GetValue<double>() == 1000 && Place(tall)["LocationCurve"]["end"][1].GetValue<double>() == 4750
           && Place(tall)["LocationCurve"]["start"][0].GetValue<double>() == 2650 && StairPlanner.Ends(new[] { 2000.0, 1000, 0 }, new[] { 3300.0, 5500, 3000 }) is ("south", "north", 1000.0, 5500.0, false)
           && StairPlanner.Ends(V(fl.GetProperty("min")), V(fl.GetProperty("max"))) is ("west", "east", 1000.0, 5500.0, true),
           "a box longer in y runs the stair along y (south and north ends); one longer in x along x (west and east)");

        // the holds, each in words (D9: a landing, a turn, a winder is a person's)
        Ok(Plan(max: new[] { 3000.0, 3300, 3000 }).Hold == "16 risers at 250 mm going need 3750 mm; the box is 2000 mm long — a landing or a turn is a person's (D9)",
           "a box 2000 mm long holds the stair: 16 risers at 250 mm going need 3750 mm - a landing or a turn is a person's");
        Ok(Plan(min: new[] { 1000.0, 2000, 0 }, max: new[] { 5500.0, 3000, 3000 }).Hold == "the rule's 1200 mm run is wider than the box (1000 mm across) — a person decides",
           "a box narrower than the rule's width holds the stair");
        Ok(Plan(f: new StairTypeFacts { MaxRiserMm = 190, MinTreadMm = 250, MinRunWidthMm = 1500 }).Hold == "the rule's 1200 mm is under the type's minimum run width 1500 mm",
           "a rule width under the type's minimum run width holds the stair");
        Ok(Plan(st: stories.Where(l => l.Name == "L00").ToList()).Hold == "There is no Building Story above L00, so the stair's height is unknown. Add a story level above it (mark it Building Story), then propose the stair again.",
           "no Building Story above the flag's storey: the StairFlag.FromPick words");
        Ok(Plan(st: new List<LevelFact> { stories[0], new LevelFact { Name = "L01", ElevationMm = 3000, IsStory = false } }).Hold?.StartsWith("There is no Building Story above L00") == true,
           "a level that is not marked Building Story is not the top");
        Ok(Plan(min: new[] { 1000.0, 2000, 400 }).Hold == "the flag's box starts at 400 mm, not at L00 (0 mm) — flag the stair again on the plan of its storey"
           && Plan(min: new[] { 1000.0, 2000, 300 }).Hold == null && Plan(min: new[] { 1000.0, 2000, -300 }).Hold == null,
           "a box whose base is more than 300 mm off its storey is held; 300 mm is allowed");
        Ok(Plan(storey: "L09").Hold == "level \"L09\" is not in this model — the flag's storey; a person decides" && Plan(storey: "l00").Hold == null,
           "a storey the model does not hold is held; a level is found whatever its case");
        Ok(plan.Hold == null && StairPlanner.Plan("f", "c", "u", "L00", V(fl.GetProperty("min")), V(fl.GetProperty("max")), true, stories, rule, null, "a").Hold
               == "the stair type \"Assembled Stair : 190mm max riser 250mm going\" has no readable maximum riser and minimum tread — a person decides",
           "a type whose facts could not be read holds the stair");
        Ok(Plan(f: new StairTypeFacts { MaxRiserMm = 20, MinTreadMm = 250, MinRunWidthMm = 1000 }).Hold == "150 risers is outside 2 to 60 (3000 mm between L00 and L01, type maximum riser 20 mm) — a person decides",
           "a riser count outside 2 to 60 is held");
        var five = Plan(st: new List<LevelFact> { stories[0], new LevelFact { Name = "L01", ElevationMm = 3040, IsStory = true } }, f: new StairTypeFacts { MaxRiserMm = 190, MinTreadMm = 250.04, MinRunWidthMm = 1000 });
        Ok(five.Hold == null && five.Risers == 16 && five.GoingMm == 250.04 && Place(five)["Risers"].GetValue<int>() == 16,
           "3040 mm between the levels under a 190 mm maximum is 16 risers (float-noise slack only), and a tread read as 250.04 mm stays 250.04 mm (no rounding: Apply sets the going itself)");
        var band = Plan(st: new List<LevelFact> { stories[0], new LevelFact { Name = "L01", ElevationMm = 3040.3, IsStory = true } });
        Ok(band.Hold == null && band.Risers == 17 && StairPlanner.Risers(3040.3, 190) == 17,
           "3040.3 mm under a 190 mm maximum is 17 risers: a stair 0.02 mm over the maximum no longer passes on a 0.5 mm slack (review fix)");
        Ok(JsonSerializer.SerializeToNode(plan.Body)["elements"][0]["from_flag"]["unique_id"].GetValue<string>() == fl.GetProperty("unique_id").GetString()
           && StairPlanner.RowWords("L01", 16, 250, 1200) == "to L01 · 16 risers, going 250 mm, width 1200 mm — one straight run; landings, turns and railings are a person's",
           "the body names its flag (changeset and unique_id) and the row's words say one straight run, landings, turns and railings a person's");

        // the guideline's Stairs element: the bridge's cases (vitest reads the same file), then the rule the matcher answers
        using (var gcases = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "guideline-stairs", "cases.json"))))
            foreach (var c in gcases.RootElement.EnumerateArray())
            {
                var gbody = JsonNode.Parse(PlacementGuideline).AsObject();
                gbody["elements"].AsArray().Add(JsonNode.Parse(c.GetProperty("element").GetRawText()));
                var m = GuidelineMatcher.FromBodies(gbody.ToJsonString(), PlacementCatalog, out string error, out _);
                string want = c.GetProperty("error").ValueKind == JsonValueKind.Null ? null : c.GetProperty("error").GetString().Replace("{at}", "elements[2]");
                Ok(error == want && m.HasGuideline == (want == null),
                   "parity with the bridge - " + c.GetProperty("name").GetString() + (want == null ? ": accepted" : ": refused, \"" + want + "\"") + (error == want ? "" : " (the add-in said: " + (error ?? "accepted") + ")"));
            }
        const string StairType = "190mm max riser 250mm going";
        string stairGuideline = "{\"standard\":\"Stairs check\",\"elements\":[{\"category\":\"Stairs\",\"rules\":[{\"when\":{\"level\":\"L00\"},\"use\":{\"family\":\"Assembled Stair\",\"type\":\"" + StairType + "\",\"params\":{\"width_mm\":1500}}}]," +
                                "\"default\":{\"family\":\"Assembled Stair\",\"type\":\"" + StairType + "\",\"params\":{\"width_mm\":1200}}}]}";
        string stairCatalog = "{\"types\":[{\"category\":\"Stairs\",\"family\":\"Assembled Stair\",\"type\":\"" + StairType + "\"}]}";
        var sm = GuidelineMatcher.FromBodies(stairGuideline, stairCatalog, out _, out _);
        var onL00 = sm.StairRule("L00", out var h0);
        var onL01 = sm.StairRule("L01", out var h1);
        Ok(h0 == null && onL00 is { Family: "Assembled Stair", Type: StairType, WidthMm: 1500 } && onL00.Value.Source == "Stairs check rule"
           && h1 == null && onL01 is { WidthMm: 1200 } && onL01.Value.Source == "Stairs check default",
           "StairRule: the level's rule (its width_mm read from the JsonElement), else the Stairs default; the answer says which");
        var absent = GuidelineMatcher.FromBodies(PlacementGuideline, PlacementCatalog, out _, out _).StairRule("L00", out var hAbs);
        Ok(absent == null && hAbs == "no Stairs rule in Placement check guideline — add a Stairs element (a stair type and params.width_mm) to the guideline; a person decides",
           "a guideline with no Stairs element holds the stair in words (no guideline at all: the same)");
        var missing = GuidelineMatcher.FromBodies(stairGuideline, "{\"types\":[{\"category\":\"Stairs\",\"family\":\"Assembled Stair\",\"type\":\"Other\"}]}", out _, out _);
        Ok(missing.StairRule("L00", out var hMiss) == null && hMiss != null && hMiss.StartsWith("Stairs on L00 — ") && !hMiss.Contains("gap:") && hMiss.Contains("is not in "),
           "a stair type the catalogue in force lacks is a gap (Sentinel creates no types), named with the catalogue");

        // the DTOs: a stair as the bridge stores it, and what Revit reports back
        var dto = JsonSerializer.Deserialize<ChangesetElementDto>("{\"proposal_guid\":\"g\",\"kind\":\"stair\",\"op\":\"create\",\"place\":{\"LevelName\":\"L00\",\"TopLevel\":\"L01\",\"FamilyName\":\"Assembled Stair\",\"TypeName\":\"T\"," +
                                                                  "\"LocationCurve\":{\"start\":[1000,2650,0],\"end\":[4750,2650,0]},\"Width\":1200,\"Risers\":16,\"Going\":250},\"from_flag\":{\"changeset\":\"c1\",\"unique_id\":\"stair:pick-0a1b2c3d\"}}");
        Ok(dto.Place.Risers == 16 && dto.Place.Going == 250 && dto.Place.Width == 1200 && dto.Place.TopLevel == "L01" && dto.FromFlag.Changeset == "c1" && dto.FromFlag.UniqueId == "stair:pick-0a1b2c3d",
           "the client reads a stair: Risers, Going, Width, TopLevel and from_flag");
        Ok(JsonSerializer.Serialize(new ChangesetElementDto { Kind = "wall" }).IndexOf("from_flag", StringComparison.Ordinal) < 0, "an element with no from_flag sends none");
        var entry = new AppliedEntry { ProposalGuid = "g", RevitElementId = 5, RevitUniqueId = "u", Built = new StairBuiltDto { Risers = 16, RiserMm = 187.5, GoingMm = 250, WidthMm = 1200, Runs = 1, Railings = 2 } };
        var sent = JsonNode.Parse(ChangesetClient.ResultBody(new List<AppliedEntry> { entry, new AppliedEntry { ProposalGuid = "h", RevitElementId = 6, RevitUniqueId = "v" } }, new List<string>(), null, null, null));
        Ok(sent["applied"][0]["built"].ToJsonString() == "{\"risers\":16,\"riser_mm\":187.5,\"going_mm\":250,\"width_mm\":1200,\"runs\":1,\"railings\":2}" && sent["applied"][1].AsObject().ContainsKey("built") == false,
           "the result sends what Revit built as {risers, riser_mm, going_mm, width_mm, runs, railings} (the bridge's keepBuilt reads exactly these); an entry that built nothing sends no built");

        // the Revit halves, by source text (the executor, the propose hops and the window are Revit-bound)
        string src2(params string[] p) => Src(p);
        string ex = Src("GhostBuilder", "ChangesetExecutor.cs"), rv = Src("Commands.ReviewChangesets.cs"), win = Src("UI", "ChangesetReviewWindow.cs"), fh = Src("GhostBuilder", "GhostFailureHandler.cs"), cli = Src("Coordination", "ChangesetClient.cs");
        int At(string s, string what, int from = 0) => s.IndexOf(what, from, StringComparison.Ordinal);
        int branch = At(ex, "if (toPlace.Any(e => IsCreate(e) && e.Kind == \"stair\")) return ExecuteStair(doc, cs, toPlace);"), tx = At(ex, "using var t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id));", branch);
        int notLoaded = At(ex, "var notLoaded = NotLoaded(doc, toPlace);");
        Ok(branch > notLoaded && notLoaded > 0 && branch < tx && tx > 0, "Execute hands a stair to ExecuteStair after the not-loaded refusal and BEFORE the changeset's transaction (a stair edit scope cannot start with one open)");
        int es = At(ex, "private ExecutionResult ExecuteStair("), esEnd = At(ex, "private static XYZ CentreOf", es);
        string body = es > 0 && esEnd > es ? ex.Substring(es, esEnd - es) : "";
        int sc = At(body, "scope = new StairsEditScope(doc, UndoWatcher.TxName(cs.Name, cs.Id));"), st = At(body, "scope.Start(level.Id, top.Id)"), tr = At(body, "t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id));"),
            drn = At(body, "stairs.DesiredRisersNumber = risers;"), cr = At(body, "StairsRun.CreateStraightRun(doc, stairsId, Line.CreateBound(Pt(c.Start), Pt(c.End)), Arch.StairsRunJustification.Center)"),
            reg = At(body, "doc.Regenerate();"), chk = At(body, "if (stairs.ActualRisersNumber != risers)"), hgt = At(body, "if (stairs.ActualRiserHeight > type.MaxRiserHeight + 1e-6)"),
            app = At(body, "PlacementApply.Apply(Placement, new Element[] { stairs });"), stamp = At(body, "ProvenanceStamp.Write(stairs, cs.Id, cs.Source"), tc = At(body, "if (t.Commit() != TransactionStatus.Committed)"),
            scc = At(body, "scope.Commit(scopeHandler);"), read = At(body, "Railings = made.GetAssociatedRailings().Count");
        Ok(sc > 0 && sc < st && st < tr && tr < drn && drn < cr && cr < reg && reg < chk && chk < hgt && hgt < app && app < stamp && stamp < tc && tc < scc && scc < read,
           "ExecuteStair, in order: the scope named for the Undo - Start - the inner transaction - DesiredRisersNumber - CreateStraightRun (Center) - Regenerate - the risers and riser height refused BEFORE the commit - the placement block and the stamp - the transaction's commit - the scope's commit - the railings read AFTER it");
        Ok(body.Contains("StairPlanner.Risers(f2f, maxRiser) != risers") && body.Contains("going < type.MinTreadDepth / MmToFeet - StairPlanner.TolMm") && body.Contains("width < type.MinRunWidth / MmToFeet - StairPlanner.TolMm")
           && body.Contains("the levels or the stair type changed since the plan — re-propose from the flag") && body.Contains("scopeHandler = new GhostFailureHandler { AllOrNothing = true, RollBackOtherWarnings = true };")
           && body.Contains("catch (Exception ex)") && body.Contains("scope.Cancel()") && body.Contains("if (ex is PlacementRefused) return new ExecutionResult { NotRun = true, Error = ex.Message };"),
           "the executor re-checks the plan with the planner's own Risers() (amendment 1), commits the scope with an all-or-nothing handler that rolls back on any warning (a modal dialog otherwise), and cancels it on a refusal: PlacementRefused keeps the changeset proposed");
        Ok(ex.Contains("\"stair\" => () => StairsTypeOf(doc, p.FamilyName, p.TypeName), // MA-8-10") && ex.Contains("OfCategory(BuiltInCategory.OST_Stairs).WhereElementIsElementType()")
           && ex.Contains("if (!(hits[0] is Arch.StairsType)) throw new InvalidOperationException(") && ex.Contains("a sketch (legacy) stair type — Sentinel builds component stairs only")
           && ex.Contains("Manage ▸ Transfer Project Standards (Stairs types) from the office template; Sentinel creates no types"),
           "NotLoaded asks the stair type of the model (family and name, element types of OST_Stairs); a legacy sketch type is refused in words; a type not loaded says how to bring it in (amendment 15)");
        Ok(ex.Contains("scopeHandler = new GhostFailureHandler { AllOrNothing = true, RollBackOtherWarnings = true };") && !body.Contains("DeletableWarnings") && !body.Contains("scopeHandler.Ours")
           && fh.Contains("if (RollBackOtherWarnings) return RollBack(\"Revit raised a warning on the stair: \" + text, named);") && fh.Contains("SeenWarnings.Add((key, text, named));")
           && !fh.Contains(".DeleteWarning(") && !fh.Contains("DeletableWarnings") && !fh.Contains("RemovedWarnings") && !ex.Contains("DeletableWarnings") && !ex.Contains("RemovedLine")
           && ex.Contains("stairs.ActualTreadDepth = going * MmToFeet;") && ex.Contains("innerHandler.SeenWarnings.Concat(scopeHandler.SeenWarnings)")
           && !src2("GhostBuilder", "GhostFailurePolicy.cs").Contains("RemovedLine") && !src2("GhostBuilder", "ChangesetPlacementEvent.cs").Contains("Removed") && !rv.Contains("res.Removed") && !rv.Contains("result.Removed"),
           "no warning is ever erased at a stair's commit: the scope's handler is all-or-nothing with RollBackOtherWarnings, no allowlist, no DeleteWarning, no 'removed' line - a warning rolls the stair back with its words (F-S2-3)");

        // the propose hops (amendment 16): sign-in, the standards on a pool thread, Revit's thread for the type and the plan, the POST on a pool thread, the words
        int pr = At(rv, "window.ProposeStairRequested += uid =>");
        int a = At(rv, "if (!UserSession.IsSignedIn) { window.Shown(\"Proposing a stair needs a signed-in person", pr), b = At(rv, "Task.Run(() =>", a), ld = At(rv, "GhostStandards.Load(key, layers: false, guideline: true, catalog: true)", b),
            sr = At(rv, "standards.Guideline.StairRule(flag.Storey, out hold)", ld), eq = At(rv, "App.Events.Enqueue(doc, \"plan a stair\"", sr), styp = At(rv, "ChangesetExecutor.StairsTypeOf(d, rule.Value.Family, rule.Value.Type)", eq),
            dlg = At(rv, "var pick = ask.Show();", styp), pn = At(rv, "StairPlanner.Plan(flag.Name ?? flag.UniqueId, cs.Id, flag.UniqueId, flag.Storey, flag.Box.Min, flag.Box.Max, pick == TaskDialogResult.CommandLink1,", dlg),
            tk = At(rv, "Task.Run(() =>", pn), po = At(rv, "ChangesetClient.Propose(cfg, key, plan.Body, out var proposeErr)", tk), sh = At(rv, "window.Shown(filed == null ?", po);
        Ok(pr > 0 && a > pr && b > a && ld > b && sr > ld && eq > sr && styp > eq && dlg > styp && pn > dlg && tk > pn && po > tk && sh > po,
           "Propose a stair…: (a) the sign-in check, (b) a pool thread reads the standards and the Stairs rule, (c) Revit's thread reads the stair type, asks which end it rises from and plans, (d) a pool thread files it with the window's cfg, (e) the words");
        Ok(At(rv, "TaskDialogResult.CommandLink1", dlg) > 0 && rv.Contains("Rises from the {low} end") && rv.Contains("Rises from the {high} end") && rv.Contains("Proposing the stair was cancelled; nothing was saved.")
           && rv.Contains("Held for a person — ") && rv.Contains("Review it (Review AI Proposals); nothing was ticked or placed."),
           "the person says which end the stair rises from (two command links by compass, or Cancel); a hold is said as one; the proposal is not ticked or placed");
        Ok(win.Contains("public event Action<string> ProposeStairRequested;") && win.Contains("Content = \"Propose a stair…\"") && win.Contains("propose.Click += (_, _) => ProposeStairRequested?.Invoke(x.UniqueId);")
           && win.Contains("if (stair && _cs.Status != \"withdrawn\")") && win.Contains("StairPlanner.RowWords(p.TopLevel, p.Risers, p.Going, p.Width)")
           && win.Contains("public event Action FlagStairRequested;") && win.Contains("public event Action<bool, string> StairSliceRequested;") && win.Contains("public event Action<bool> ScanRequested;"),
           "the window: Propose a stair… on a stair flag of a live changeset; a stair row reads where it goes and that landings, turns and railings are a person's; the 8-9 events stay");
        Ok(cli.Contains("[JsonPropertyName(\"Risers\")] public int? Risers { get; set; }") && cli.Contains("[JsonPropertyName(\"Going\")] public double? Going { get; set; }")
           && cli.Contains("[JsonPropertyName(\"from_flag\")]") && cli.Contains("[JsonPropertyName(\"built\")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public StairBuiltDto Built { get; set; }"),
           "the client: PlaceDto Risers and Going, the element's from_flag, the applied entry's built");
    }
}
