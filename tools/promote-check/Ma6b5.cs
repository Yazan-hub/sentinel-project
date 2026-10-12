#nullable disable
using System.Text.Json.Nodes;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-6-5: curtain walls from a facade rule — each shell wall's Facade (N/E/S/W against True North), a facade rule's curtain type on
    // the mass face, Promote's settled curtain walls, and the create-only curtainOk, the extractor's IfcCurtainWall and the pre-flight ──
    static void Ma6b5Checks()
    {
        Console.WriteLine("\nMA-6-5 — curtain walls from a facade rule: Facade, the planner, Promote, the executor, the extractor and the pre-flight");
        static double[] P(double x, double y) => new[] { x, y };

        // Facade: a clockwise square's edges face W, N, E, S; True North turned 90° (counter-clockwise positive) turns each a quarter;
        // the half-open ties (45° is E, 135° S, 225° W, 315° N) hold through a rotation's float noise.
        var sq = new List<double[]> { P(0, 0), P(0, 10000), P(20000, 10000), P(20000, 0) };
        string Sides(double tn) => string.Concat(Enumerable.Range(0, 4).Select(k => ShellPlanner.Facade(sq[k], sq[(k + 1) % 4], tn)));
        Ok(Sides(0) == "WNES" && Sides(90) == "SWNE" && Sides(-90) == "NESW" && Sides(180) == "ESWN" && Sides(360) == "WNES",
           "Facade: a clockwise loop's edges face W, N, E, S (the left normal is outside); True North 90° turns them to S, W, N, E — the project's north face reads west");
        Ok(ShellPlanner.Facade(P(0, 0), P(1, -1), 0) == "E" && ShellPlanner.Facade(P(0, 0), P(-1, -1), 0) == "S" && ShellPlanner.Facade(P(0, 0), P(-1, 1), 0) == "W"
           && ShellPlanner.Facade(P(0, 0), P(1, 1), 0) == "N" && ShellPlanner.Facade(P(0, 10000), P(20000, 10000), 45) == "N" && ShellPlanner.Facade(P(0, 10000), P(20000, 10000), -45) == "E"
           && ShellPlanner.Facade(P(0, 0), P(0, 10000), 45) == "W" && ShellPlanner.Facade(P(0, 0), P(0, 10000), 135) == "S",
           "Facade: the ties are half-open — 45° is E, 135° S, 225° W, 315° N — also when a True North angle lands an edge exactly on one");

        // The planner on a 3-storey box (FC L00-FC L03, True North = Project North) with the shell guideline's facade rules.
        var shell = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-shell-guideline.json")),
                                                File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out var ge, out _);
        ShellFacts Box(double trueNorth = 0, string glazing = "Curtain")
        {
            var f = new ShellFacts { MassUid = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-0000b222", MassLabel = "mass 52344", TrueNorthDeg = trueNorth };
            for (int i = 0; i <= 3; i++) f.Levels.Add(($"FC L{i:00}", i * 4000.0));
            for (int i = 0; i < 3; i++) f.Storeys.Add((sq, sq, null));
            f.WallTypes["BDS_EXT_ARC_CMU_300 mm"] = ("Basic", 300);
            f.WallTypes["M_Storefront"] = ("Curtain", 0);
            f.WallTypes["M_Exterior Glazing"] = (glazing, 0);
            f.FloorTypes.Add("BDS_INT_STR_CONC_300 mm");
            f.RoofTypes.Add("BDS_EXT_ARC_GENRC_300 mm");
            return f;
        }
        var plan = ShellPlanner.Plan(Box(), shell, curtain: true);
        List<JsonNode> Walls(ShellPlan p, string storey) => Json(p.Storeys.First(s => s.Storey == storey).Elements).Where(e => (string)e["kind"] == "wall").ToList();
        string Types(ShellPlan p, string storey) => string.Join(" | ", Walls(p, storey).Select(e => (string)e["place"]["TypeName"]));
        double[] At(JsonNode e, string end) => e["place"]["LocationCurve"][end].AsArray().Select(v => (double)v).ToArray();
        const string cmu = "BDS_EXT_ARC_CMU_300 mm", glass = "M_Exterior Glazing", front = "M_Storefront";
        var l0 = Walls(plan, "FC L00");
        var l1 = Walls(plan, "FC L01");
        Ok(ge == null && plan.Count == 16 && plan.Roof != null && plan.Held.Count == 0
           && Types(plan, "FC L00") == string.Join(" | ", Enumerable.Repeat(front, 4))
           && Types(plan, "FC L01") == $"{cmu} | {cmu} | {cmu} | {glass}" && Types(plan, "FC L02") == $"{cmu} | {cmu} | {cmu} | {glass}"
           && plan.Lines.SequenceEqual(new[] { "FC L00→FC L01: 4 walls · floor · filed", "FC L01→FC L02: 4 walls · floor · filed", "FC L02→FC L03: 4 walls · floor · filed", "Roof on FC L03: filed" }),
           "the box shells: FC L00 is storefront on every face; on FC L01 and FC L02 the south face is M_Exterior Glazing and the rest CMU; floors and the roof as 6-4");
        Ok(Enumerable.Range(0, 4).All(k => At(l0[k], "start").Take(2).SequenceEqual(sq[k]) && At(l0[k], "end").Take(2).SequenceEqual(sq[(k + 1) % 4]))
           && At(l1[3], "start").SequenceEqual(new double[] { 19850, 0, 4000 }) && At(l1[3], "end").SequenceEqual(new double[] { 150, 0, 4000 })
           && At(l1[2], "start").SequenceEqual(new double[] { 19850, 9850, 4000 }) && At(l1[2], "end").SequenceEqual(new double[] { 19850, 0, 4000 })
           && (string)l1[3]["reason"] == "Shell of mass 52344 · FC L01→FC L02 · rule level FC L01, Facade S → M_Exterior Glazing, inset 0 mm"
           && (string)l1[2]["reason"] == "Shell of mass 52344 · FC L01→FC L02 · rule Location Exterior → BDS_EXT_ARC_CMU_300 mm, inset 150 mm"
           && (string)l0[0]["reason"] == "Shell of mass 52344 · FC L00→FC L01 · rule level FC L00, Location Exterior → M_Storefront, inset 0 mm",
           "a curtain wall's line is the mass face (inset 0); the CMU beside it is inset 150 mm and runs to the face line — the south glazing between the CMU centrelines; a facade rule's reason names its level (review), the plain rule's does not");
        Ok(string.Concat(l1.Select(e => (string)e["facts"]["params"]["Facade"])) == "WNES" && l1.All(e => (string)e["facts"]["params"]["Location"] == "Exterior")
           && (string)l1[3]["validate"]["identity"]["Class"] == "IFCWALL",
           "each wall's facts carry its Facade with Location Exterior — the record of what the rule saw; the bridge still sets the kind's class");

        // True North 90°: the face that faces true south is the project's west edge — the glazing moves there.
        var turned = ShellPlanner.Plan(Box(90), shell, curtain: true);
        Ok(Types(turned, "FC L01") == $"{glass} | {cmu} | {cmu} | {cmu}" && Types(turned, "FC L00") == string.Join(" | ", Enumerable.Repeat(front, 4)),
           "True North 90°: south glazing lands on the project's west edge (drill C-1 checks the sign on a copy)");
        // A stacked answer still holds its storey; with curtain off (6-4) a curtain answer holds and no Facade is sent.
        var stacked = ShellPlanner.Plan(Box(glazing: "Stacked"), shell, curtain: true);
        string Held(ShellPlan p, string name) => p.Held.FirstOrDefault(h => h.Name == name).Reason ?? "";
        Ok(stacked.Storeys.Select(s => s.Storey).SequenceEqual(new[] { "FC L00" }) && stacked.Roof == null
           && Held(stacked, "FC L01 storey") == "walls: \"M_Exterior Glazing\" is a stacked wall type — Sentinel places basic and curtain walls only"
           && Held(stacked, "FC L02 storey") == Held(stacked, "FC L01 storey"),
           "a stacked answer still holds the whole storey, in words that say curtain walls are placed now");
        var off = ShellPlanner.Plan(Box(), shell);
        Ok(off.Storeys.Select(s => s.Storey).SequenceEqual(new[] { "FC L01", "FC L02" }) && Types(off, "FC L01") == string.Join(" | ", Enumerable.Repeat(cmu, 4))
           && Held(off, "FC L00 storey") == "walls: \"M_Storefront\" is a curtain wall type — Sentinel places basic walls only"
           && Walls(off, "FC L01").All(e => e["facts"]["params"]["Facade"] == null),
           "with curtain off (6-4's planner, the fixture's) no Facade is sent and a curtain answer holds its storey — Shell a Mass passes curtain: true");

        // Promote (D4): a curtain wall on a type a DD rule produces is settled — not held, DD now when its top is, no Pset_WallCommon asked.
        var levels = new List<LevelFact> { new LevelFact { Name = "FC L00", ElevationMm = 0, IsStory = true }, new LevelFact { Name = "FC L01", ElevationMm = 4000, IsStory = true } };
        WallFact Cw(string type, string uid) => new WallFact { UniqueId = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-" + uid, Label = "W " + uid, TypeName = type, BaseLevel = "FC L00", TopLevel = "FC L01", Curtain = true };
        var promoted = PromoteWallsPlanner.Plan(new[] { Cw("M_Storefront", "0000c001"), Cw("Curtain Wall 1", "0000c002") }, levels, new Dictionary<string, string>(), shell).Single();
        Ok(promoted.Walls == 2 && promoted.DdNow == 1 && promoted.Settled.Count == 0 && promoted.Ghosts.Count == 0
           && promoted.Held.Count == 1 && promoted.Held[0].Label == "W 0000c002" && promoted.Held[0].Reason == "a curtain wall on \"Curtain Wall 1\", a type no DD rule produces — Promote does not retype curtain walls; a rule that names it, or a person, decides"
           && promoted.Lod.Any(l => l.UniqueId.EndsWith("0000c001") && l.RulesOk) && promoted.Lod.Any(l => l.UniqueId.EndsWith("0000c002") && l.Blocked),
           "Promote: a curtain wall on M_Storefront (a facade rule's type) is settled and DD now, its type's properties not asked; one on an unruled curtain type is still blocked, in words that say what would settle it (review)");

        // The executor: curtainOk only at the two create sites (Execute's and NotLoaded's); a retype and Ghost stay basic.
        string ex = Src("GhostBuilder", "ChangesetExecutor.cs");
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        Ok(Count(ex, "curtainOk: true") == 2 && ex.Contains("var wt = ResolveWallType(doc, el.Place.TypeName, curtainOk: true);")
           && ex.Contains("\"wall\" => () => ResolveWallType(doc, p.TypeName, curtainOk: true),")
           && ex.Contains("if (kind == \"wall\") return ResolveWallType(doc, typeName);") && !Src("GhostBuilder", "GhostChangesetBuild.cs").Contains("curtainOk"),
           "the executor places a curtain type on a create only (Execute's loop and NotLoaded's create branch); RetypeTarget and Ghost never pass curtainOk — no retype turns a basic wall into a curtain wall");

        // The extractor: IfcCurtainWall, after the explicit "Export to IFC As" and before the category map.
        string gx = Src("Engine", "GovernedElementExtractor.cs");
        int curtainAt = gx.IndexOf("if (e is Wall cw && cw.WallType?.Kind == WallKind.Curtain) return \"IFCCURTAINWALL\";", StringComparison.Ordinal);
        Ok(curtainAt > gx.IndexOf("if (!string.IsNullOrWhiteSpace(explicitAs))", StringComparison.Ordinal) && curtainAt < gx.IndexOf("foreach (var (cat, ifc) in CategoryToIfc)", StringComparison.Ordinal)
           && gx.IndexOf("if (!string.IsNullOrWhiteSpace(explicitAs))", StringComparison.Ordinal) > 0,
           "the extractor reads a curtain wall as IFCCURTAINWALL — what Revit's export writes — after an explicit Export to IFC As and before the category map");

        // Amendment 8: the IFC pre-flight reads the extractor's class and skips a Pset_WallCommon entry (scoped to IFCWALL) on IFCCURTAINWALL.
        string pre = Src("Engine", "IfcPreFlightScanner.cs");
        var fire = PsetMap.Entries("BDS").Single(e => e.Pset == "Pset_WallCommon" && e.Prop == "FireRating");
        bool Skips(PsetEntry entry, string cls) => entry.Classes.Length > 0 && !entry.Classes.Any(c => cls.StartsWith(c, StringComparison.OrdinalIgnoreCase)); // the scanner's own test, below
        Ok(pre.Contains("var cls = GovernedElementExtractor.IfcClassOf(e, doc);")
           && pre.Contains("if (entry.Classes.Length > 0 && !entry.Classes.Any(c => cls.StartsWith(c, StringComparison.OrdinalIgnoreCase))) continue;")
           && Skips(fire, "IFCCURTAINWALL") && !Skips(fire, "IFCWALL") && !Skips(fire, "IFCWALLSTANDARDCASE"),
           "amendment 8: the IFC pre-flight skips the wall FireRating entry on an IFCCURTAINWALL (no Pset_CurtainWallCommon reader) and still checks it on IFCWALL");

        // The wiring: the shell passes curtain and reads True North; Promote reads a wall's curtain type.
        Ok(Src("Commands.ShellMass.cs").Contains("var plan = ShellPlanner.Plan(facts, m, curtain: true);")
           && Src("GhostBuilder", "ShellReader.cs").Contains("TrueNorthDeg = doc.ActiveProjectLocation.GetProjectPosition(XYZ.Zero).Angle * 180 / Math.PI")
           && Src("Commands.PromoteWalls.cs").Contains("Curtain = wt?.Kind == WallKind.Curtain,")
           && Src("GhostBuilder", "ShellReader.cs").Contains("g.FirstOrDefault(x => x.Kind == WallKind.Basic) ?? g.FirstOrDefault(x => x.Kind == WallKind.Curtain) ?? g.First();"),
           "Shell a Mass plans with curtain and the project's True North; Promote's wall facts say a curtain type; the reader picks a name's basic type, then its curtain one, as ResolveWallType does with curtainOk (review)");

        // Review: fix-in-place refuses a payload element outside the requirement's classes (a curtain wall on an IFCWALL issue) at Check and
        // Re-check, before the bridge — never certified off "no failure". The logic is tools/fixplace-check's.
        string bcf = Src("Commands.BcfIssues.cs");
        Ok(Count(bcf, "FixPlan.OutsideRequirement(payload, req, org) is { } outside") == 2
           && bcf.IndexOf("FixPlan.OutsideRequirement", bcf.IndexOf("void Recheck(", StringComparison.Ordinal), StringComparison.Ordinal) < bcf.IndexOf("GovernedNotify.Propose", bcf.IndexOf("void Recheck(", StringComparison.Ordinal), StringComparison.Ordinal),
           "fix-in-place: Check and Re-check refuse an element exported outside the issue's requirement (a curtain wall is IFCCURTAINWALL now) before anything is sent or certified");
    }
}
