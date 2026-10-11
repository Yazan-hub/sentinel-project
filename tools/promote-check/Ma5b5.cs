#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-5b-5: Promote rehosts a door or window no wall hosts — the planner (FindHost, Rehost), the body, the trust, the wiring ──
    static void Ma5b5Checks(GuidelineMatcher m2)
    {
        Console.WriteLine("\nMA-5b-5 — rehost: FindHost, the plan, the body, never pre-ticked, the executor's guards");
        // An interior partition on Level 1 the placeholder stands in, read by Revit as one candidate (its body holds the opening's middle).
        RehostCandidate Wall(Action<RehostCandidate> set = null)
        {
            var c = new RehostCandidate { UniqueId = "wall-uid", Label = "wall 7", TypeName = "MA0 Interior - 100mm", Function = "Interior", BaseLevel = "Level 1",
                Basic = true, LengthMm = 5000, AlongMm = 2000, BottomMm = 0, TopMm = 3000, PointMm = new double[] { 44050, 2500, 0 } };
            set?.Invoke(c);
            return c;
        }
        // A level-based placeholder door: no wall hosts it, standing at its level, 1000 x 2100 (its own Width and Height).
        ElementFact Ph(string label, Action<ElementFact> set = null, string kind = "door", string family = "Placeholder Door", string type = "1000 x 2100", double w = 1000, double h = 2100) =>
            Dw(kind, label, family, type, w, h, host: null, set: f =>
            {
                f.Unhosted = true; f.AtMm = new double[] { 44100, 2510, 0 }; f.OffsetMm = 0; f.Candidates = new List<RehostCandidate> { Wall() };
                set?.Invoke(f);
            });
        List<StoreyPlan> Plan(IEnumerable<ElementFact> fs, bool signedIn = true) =>
            PromotePlanner.Plan(new[] { "Doors", "Windows" }, new List<WallFact>(), fs.ToList(), Levels, DocTypes, V1Types(), m2, signedIn);
        PromoteGhost G(List<StoreyPlan> ps, string label) => ps.SelectMany(p => p.Ghosts).FirstOrDefault(g => g.Label == label);
        string H(List<StoreyPlan> ps, string label) => ps.SelectMany(p => p.Held).FirstOrDefault(h => h.Label == label)?.Reason;

        var ps = Plan(new[] { Ph("PH1") });
        var g = G(ps, "PH1");
        Ok(g != null && g.Op == "rehost" && g.FamilyName == "BDS_INT_1 PNL" && g.TypeName == "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" && g.TypeBefore == "Placeholder Door : 1000 x 2100"
           && g.LocationMm.SequenceEqual(new double[] { 44050, 2500, 0 }) && g.AtMm.SequenceEqual(new double[] { 44100, 2510, 0 }) && g.LevelName == "Level 1" && g.SillHeightMm == null
           && g.Reason.StartsWith("rehost — no wall hosts it; it stands in wall 7: DD doors: HostFunction Interior, Size W1000 x H2100 mm → BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm"),
           "a placeholder door standing in one interior wall: a rehost ghost to the office type of its size (Swap's resolution, D16) at its middle on the wall's line, its point the stale guard");
        Ok(H(Plan(new[] { Ph("PH1") }, signedIn: false), "PH1") == "no wall hosts it — a rehost removes an element: sign in (Sentinel ▸ Sign in) and run Promote again"
           && H(PromotePlanner.Plan(new[] { "Doors" }, new List<WallFact>(), new List<ElementFact> { Ph("PH1") }, Levels, DocTypes, V1Types(), m2), "PH1")?.StartsWith("no wall hosts it — a rehost removes an element") == true,
           "signed out (and by default) Promote proposes no rehost — a held row that says sign in (R11)");
        Ok(G(Plan(new[] { Ph("PH2", type: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", family: "BDS_INT_1 PNL") }), "PH2")?.Op == "rehost",
           "an unhosted instance of an office type is rehosted too — the rehost path runs before the settled and office checks (R5)");

        string Why(Action<ElementFact> set, string kind = "door") { var f = Ph("X", set, kind); PromotePlanner.FindHost(f, out var w); return w; }
        Ok(Why(f => f.Candidates.Clear()) == "no wall hosts it, and it stands in no wall of Level 1 — a person places it"
           && Why(f => f.Candidates.Add(Wall(c => c.Label = "wall 8"))) == "no wall hosts it, and it stands in 2 walls (wall 7, wall 8) — a person picks its host"
           && Why(f => f.Candidates[0] = Wall(c => { c.Basic = false; c.Odd = "a curtain wall"; })) == "no wall hosts it; the wall it stands in (wall 7) is a curtain wall — Sentinel hosts a door in one straight basic wall only; a person decides"
           && Why(f => f.Candidates[0] = Wall(c => c.InGroup = true)) == "no wall hosts it; its host would be wall 7, which is in a group — a person decides"
           && Why(f => f.RehostWhy = "no wall hosts it, and a dimension references it — removing it would change the dimension; a person rehosts it") == "no wall hosts it, and a dimension references it — removing it would change the dimension; a person rehosts it",
           "FindHost: none, two, a curtain wall, a grouped wall, and Revit's own reason (a dimension) are a person's");
        Ok(Why(f => f.OffsetMm = 3500) == "no wall hosts it, and it stands 3500 mm above Level 1 — a door stands on its level; a person places it"
           && Why(f => f.OffsetMm = 900, "window") == null
           && Why(f => f.OffsetMm = 1500, "window") == "no wall hosts it; its 1500–3600 mm above Level 1 is not inside wall 7 (0–3000 mm) — a person places it"
           && Why(f => f.Candidates[0] = Wall(c => c.AlongMm = 300)) == "no wall hosts it; at 300 mm along wall 7 (5000 mm long) a 1000 mm door runs past its end — a person places it"
           && Why(f => f.WidthMm = null) == "no wall hosts it, and its type has no Width and Height to place it by — a person decides"
           && Why(f => f.Candidates[0] = Wall(c => c.BaseLevel = "Level 0")) == "no wall hosts it; the wall it stands in (wall 7) is based on Level 0, not Level 1 — Sentinel hosts a door only in a wall based on its own level; a person decides"
           && Why(f => { f.OffsetMm = -100; f.Candidates[0] = Wall(c => c.BottomMm = -300); }, "window") == "no wall hosts it, and its sill is 100 mm below Level 1 — Sentinel files no sill below its level; a person places it",
           "FindHost (design review R3): a raised door is held; a window's span must lie inside the wall; the width must fit inside the wall's ends; (review) the wall is based on the opening's level; no sill below the level");
        // review: the rehost's office type gets its DD property edits like a retype target (DdTypes, Onto) — the IDS judges the new door
        var mx = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd-ma2b.json")), out _);
        Ok(PropertyPlanner.DdTypes(ps, mx).Any(t => t.Category == "Doors" && t.Family == "BDS_INT_1 PNL" && t.Type == "BDS_INT_1 PNL_WOOD_1000 x 2100 mm"),
           "a rehost's office type is a DD type the property edits reach (as a retype target's)");
        var win = G(Plan(new[] { Ph("W1", f => f.OffsetMm = 900, "window", "Placeholder Window", "600x1200 mm", 600, 1200) }), "W1");
        Ok(win?.Op == "rehost" && win.SillHeightMm == 900, "a window rehost carries its offset as its sill");

        // The body the bridge's rehost branch requires: target {unique_id, type_before, ifc_guid?, at}, place {LevelName, Location, FamilyName,
        // TypeName, SillHeight (a window only)} — a door's null sill is left out (WriteJson).
        var body = JsonSerializer.Serialize(PromoteWallsPlanner.Bodies(ps, "lead@example.test")[0], ChangesetClient.WriteJson);
        var el = JsonDocument.Parse(body).RootElement.GetProperty("elements")[0];
        Ok(el.GetProperty("op").GetString() == "rehost" && el.GetProperty("kind").GetString() == "door"
           && el.GetProperty("target").GetProperty("type_before").GetString() == "Placeholder Door : 1000 x 2100" && el.GetProperty("target").GetProperty("at").GetArrayLength() == 3
           && el.GetProperty("place").GetProperty("Location").GetArrayLength() == 3 && el.GetProperty("place").GetProperty("LevelName").GetString() == "Level 1"
           && el.GetProperty("place").GetProperty("TypeName").GetString() == "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" && !el.GetProperty("place").TryGetProperty("SillHeight", out _)
           && el.GetProperty("validate").GetProperty("identity").GetProperty("Class").GetString() == "IfcDoor",
           "Bodies files a rehost as the bridge's rehost branch reads it — its stale guard and its whole place; a door's sill left out");

        var dto = new ChangesetElementDto { Op = "rehost", Kind = "door", ProposalGuid = "g", Pretick = true, Target = new TargetDto { UniqueId = "u", TypeBefore = "Placeholder Door : 1000 x 2100", At = new double[] { 44100, 2510, 0 } },
            Place = new PlaceDto { LevelName = "Level 1", Location = new double[] { 44050, 2500, 0 }, FamilyName = "BDS_INT_1 PNL", TypeName = "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" } };
        Ok(!ChangesetTrust.PreTick(new ChangesetDto { Source = "promote", Elements = new List<ChangesetElementDto> { dto } }, dto)
           && ChangesetTrust.RehostWords(dto) == "Placeholder Door : 1000 x 2100 at (44100, 2510) → BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm in the wall at (44050, 2500) on Level 1; " +
              "the unhosted instance and any tags on it are removed (one Undo brings them back); its Mark, Comments, workset and phase carry over, its other values do not; hinge and swing: the office family's default — compare with the placeholder",
           "a rehost is never pre-ticked (a person ticks each removal); its row names what it replaces, with what, where, and that one Undo brings it back");

        // The executor's wiring (a source scan: the code is Revit-bound).
        string ex = Src("GhostBuilder", "ChangesetExecutor.cs"), rv = Src("Commands.ReviewChangesets.cs"), pw = Src("Commands.PromoteWalls.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int rooms = At(ex, "var rooms = toPlace.Where(e => IsCreate(e) && e.Kind == \"room\")"), block = At(ex, "var rehosts = toPlace.Where(e => e.Op == \"rehost\").ToList();"),
            retype = At(ex, "// MA-0: retype before attach."), probe = At(ex, "using (var st = new SubTransaction(doc)) { st.Start(); probe = doc.Delete(oldId); st.RollBack(); }"),
            home = At(ex, "var home = PlacementApply.Home(old);"), made = At(ex, "made = doc.Create.NewFamilyInstance(Pt(p), sym, wall, level, StructuralType.NonStructural);"),
            inherit = At(ex, "PlacementApply.Inherit(made, home);");
        Ok(rooms > 0 && block > rooms && retype > block && home > block && probe > home && made > probe && inherit > made && inherit < retype,
           "the executor rehosts after the rooms and before any retype; the old instance's home is read and the delete probed (rolled back) before anything is created (R1)");
        var rb = ex.Substring(block, retype - block);
        Ok(rb.Contains("!(doc.GetElement(id) is IndependentTag)") && rb.Contains("deleted.Count != probe.Count || deleted.Any(id => !probe.Contains(id))")
           && rb.Contains("HeldBy(doc, old)") && rb.Contains("HeldBy(doc, wall)") && rb.Contains("Overlap(doc, wall, p, el, sym)") && rb.Contains("!NoWallHost(old)")
           && rb.Contains("RemovedTags = probe.Count - 1") && rb.Split("result.Kept.Add(").Length == 2 && rb.Split("Keep(").Length == 15
           && rb.Contains("Math.Pow(lp.Z / MmToFeet - was[2], 2)") && rb.Contains("(doc.GetElement(old.LevelId) as Level)?.Name") && rb.Contains("old.SuperComponent != null")
           && rb.Contains("retyped since Promote read it"),
           "only the old instance and its tags may go (else kept); the real delete must match the probe; the old instance and its wall held or overlapped are kept; the tags removed are counted; (review) moved, raised, retyped or on another level since is kept; not a top-level door or window refuses");
        Ok(ex.Contains("toPlace.Any(e => IsCreate(e) || e.Op == \"rehost\") && PlacementApply.DesignOptionRefusal(doc, \"apply it\")")
           && ex.Contains("pe && (IsCreate(pe) || pe.Op == \"rehost\")") && ex.Contains("toPlace.Any(e => e.Op == \"rehost\")\n                    ? new ExecutionResult { NotRun = true"),
           "a rehost is refused in a design option like a create (R7); its new instance takes the placement block; a commit-time rollback leaves a rehosting changeset proposed (R8)");
        Ok(pw.Contains("else if (ChangesetExecutor.NoWallHost(fi)) RehostFacts(doc, fi, f, dimRefs);") && ex.Contains("if (!NoWallHost(old))")
           && pw.Contains("if (g.Op == \"rehost\") return ChangesetExecutor.RehostRefusal(doc, g.Kind, g.FamilyName, g.TypeName);")
           && pw.Contains("standards.Guideline, UserSession.IsSignedIn)"),
           "one predicate for 'no wall hosts it' in Promote's read and at Apply (R2); the preflight holds what Apply refuses (R5); Promote plans rehosts only signed in");
        int svc = At(rv, "if (role == \"service\" && fresh.SelectMany(f => f.Elements ?? new List<ChangesetElementDto>()).Any(e => e.Op == \"rehost\" && ticked.Contains(e.ProposalGuid)))"),
            none = At(rv, "if (ticked.Count == 0)");
        Ok(svc > 0 && none > svc && !rv.Contains("foreach (var (g, why) in res.Kept)") && rv.Contains("said = KeptLine(one, res.Kept)"),
           "Review AI Proposals refuses a ticked rehost under the machine credential before anything runs (R11); a kept ghost's reason rides on the note, never a carried decline (R10)");
    }
}
