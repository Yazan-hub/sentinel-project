#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-6-4: Shell a Mass — the pure planner (loops, inset, lean, typing, roof, bodies), its body against the bridge's fixture, the wall
    // top in the overlay, and the command's wiring ──
    static void Ma6b4Checks()
    {
        Console.WriteLine("\nMA-6-4 — Shell a Mass: the planner, its body, the overlay's wall top and the wiring");
        var shell = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-shell-guideline.json")),
                                                File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out var ge, out var ce);
        Ok(shell.HasGuideline && ge == null && shell.HasCatalog && ce == null && shell.ValidateAgainstCatalog().Count == 0,
           "the shell guideline parses and every family and type it names is in the BDS catalogue (amendment 13: the C# side of the TS check)");

        // An L, clockwise: (0,0) up to (0,12000), across to (6000,12000), down to the reflex corner (6000,6000), across, down, back.
        var L = new List<double[]> { P(0, 0), P(0, 12000), P(6000, 12000), P(6000, 6000), P(18000, 6000), P(18000, 0) };
        static double[] P(double x, double y) => new[] { x, y };
        bool SameSet(List<double[]> a, List<double[]> b) => a.Count == b.Count && a.All(q => b.Any(r => Math.Abs(q[0] - r[0]) < 1e-9 && Math.Abs(q[1] - r[1]) < 1e-9));
        double Area2(List<double[]> a) => Enumerable.Range(0, a.Count).Sum(i => a[i][0] * a[(i + 1) % a.Count][1] - a[(i + 1) % a.Count][0] * a[i][1]);

        // Clean: the L given counter-clockwise, one edge split in two, closed — clockwise, 6 vertices.
        var ccw = new List<double[]> { P(0, 0), P(9000, 0), P(18000, 0), P(18000, 6000), P(6000, 6000), P(6000, 12000), P(0, 12000), P(0, 0) };
        var clean = ShellPlanner.Clean(ccw);
        Ok(clean.Count == 6 && Area2(clean) < 0 && SameSet(clean, L) && !clean.Any(q => q[0] == 9000),
           "Clean: an L given counter-clockwise, one edge split in two and closed, comes back clockwise with its 6 vertices");

        // Inset: each edge moved 150 mm to its right (inside), the corners mitred — the reflex corner too.
        var inset = ShellPlanner.Inset(L, Enumerable.Repeat(150.0, 6).ToList());
        double Off(double[] q, double[] a, double[] b) => Math.Abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / Math.Sqrt(Math.Pow(b[0] - a[0], 2) + Math.Pow(b[1] - a[1], 2));
        Ok(Enumerable.Range(0, 6).All(k => Math.Abs(Off(inset[k], L[k], L[(k + 1) % 6]) - 150) < 1e-6 && Math.Abs(Off(inset[(k + 1) % 6], L[k], L[(k + 1) % 6]) - 150) < 1e-6)
           && SameSet(inset, new List<double[]> { P(150, 150), P(150, 11850), P(5850, 11850), P(5850, 5850), P(17850, 5850), P(17850, 150) }),
           "Inset: each offset edge lies 150 mm inside its source, and consecutive edges meet at a mitre — the reflex corner at (5850, 5850)");

        // Same: 1.9 mm is the same loop, 2.1 mm leans (S-2).
        List<double[]> Moved(List<double[]> a, double dx) => a.Select(q => P(q[0] + dx, q[1])).ToList();
        Ok(ShellPlanner.Same(L, Moved(L, 1.9)) && !ShellPlanner.Same(L, Moved(L, 2.1)) && !ShellPlanner.Same(L, L.Take(4).ToList())
           && ShellPlanner.Leans == "the mass leans in this storey — a person decides",
           "Same: a vertex 1.9 mm off is the same loop, 2.1 mm off leans; another vertex count is not the same");

        // The facts of a 2-storey L (SH L0 0, SH L1 4000, SH L2 8000) whose bottom reaches 300 mm below SH L0, every type loaded.
        ShellFacts Facts(int storeys, Func<int, (List<double[]>, List<double[]>, string)> storey = null)
        {
            var f = new ShellFacts { MassUid = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-0000a111", MassLabel = "mass 41233", BelowMm = 300, RiseMm = 0 };
            for (int i = 0; i <= storeys; i++) f.Levels.Add(($"SH L{i}", i * 4000.0));
            for (int i = 0; i < storeys; i++) f.Storeys.Add(storey?.Invoke(i) ?? (L, L, null));
            f.WallTypes["BDS_EXT_ARC_CMU_300 mm"] = ("Basic", 300);
            f.FloorTypes.Add("BDS_INT_STR_CONC_300 mm");
            f.RoofTypes.Add("BDS_EXT_ARC_GENRC_300 mm");
            return f;
        }
        var lf = Facts(2);
        var plan = ShellPlanner.Plan(lf, shell);
        var one = Json(ShellPlanner.Bodies(plan, lf, "yazan"));
        var els = one.Count == 1 ? one[0]["elements"].AsArray() : new JsonArray();
        Ok(plan.Count == 15 && plan.Storeys.Select(s => s.Storey).SequenceEqual(new[] { "SH L0", "SH L1" }) && plan.Roof != null
           && els.Count(e => (string)e["kind"] == "wall" && (string)e["place"]["TypeName"] == "BDS_EXT_ARC_CMU_300 mm" && (string)e["place"]["BaseLevel"] == "SH L0" && (string)e["place"]["TopLevel"] == "SH L1") == 6
           && els.Count(e => (string)e["kind"] == "floor" && (string)e["place"]["TypeName"] == "BDS_INT_STR_CONC_300 mm") == 2
           && els.Count(e => (string)e["kind"] == "roof" && (string)e["place"]["LevelName"] == "SH L2" && (string)e["place"]["TypeName"] == "BDS_EXT_ARC_GENRC_300 mm" && (double)e["place"]["BaseOffset"] == 0) == 1
           && plan.Lines.SequenceEqual(new[] { "SH L0→SH L1: 6 walls · floor · filed", "SH L1→SH L2: 6 walls · floor · filed", "Roof on SH L2: filed" }),
           "an exact rule types the shell: per storey 6 walls on BDS_EXT_ARC_CMU_300 mm (Base SH Ln, Top SH Ln+1), a floor on BDS_INT_STR_CONC_300 mm, and one flat roof on the top level");
        Ok(one.Count == 1 && (string)one[0]["name"] == "Shell (DD) · mass 41233" && (string)one[0]["source"] == "promote" && (string)one[0]["actor"] == "yazan"
           && !one[0].AsObject().ContainsKey("pretick") && els.All(e => !e.AsObject().ContainsKey("pretick"))
           && one[0]["exceptions"].AsArray().Count == 1 && (string)one[0]["exceptions"][0]["unique_id"] == lf.MassUid && (string)one[0]["exceptions"][0]["name"] == "below SH L0"
           && (string)one[0]["exceptions"][0]["reason"] == "the mass reaches 300 mm below SH L0 — no level there; add one (Datum) or a person decides",
           "15 elements: one changeset (one review, one Undo), source promote, no pre-tick sent; the mass below the lowest level rides on it as a held row named by the mass");
        var w0 = els.FirstOrDefault(e => (string)e["validate"]["identity"]["Name"] == "Shell SH L0 W4");
        Ok(w0 != null && w0["place"]["LocationCurve"]["start"].AsArray().Select(v => (double)v).SequenceEqual(new double[] { 5850, 5850, 0 })
           && (string)w0["reason"] == "Shell of mass 41233 · SH L0→SH L1 · rule Location Exterior → BDS_EXT_ARC_CMU_300 mm, inset 150 mm"
           && (string)w0["facts"]["params"]["Location"] == "Exterior" && (string)w0["validate"]["identity"]["Class"] == "IFCWALL"
           && els.First(e => (string)e["kind"] == "floor")["place"]["LocationLoop"].AsArray().Count == 6,
           "a wall's centreline is the inset line at its level (the reflex corner's wall starts at the mitre), with the facts its rule saw and why; a floor is the mass face");
        var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "shell-body.json");
        bool same = File.Exists(path) && JsonNode.DeepEquals(one.Single(), JsonNode.Parse(File.ReadAllText(path)));
        Ok(same, "the shell's body equals the fixture the bridge validates (fixtures/changeset-ops/shell-body.json)");
        if (!same) Console.WriteLine("        got: " + one.Single().ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));

        // Typing (D3): a {thickness} rule, a type not loaded, a curtain answer (6-4), a bad floor — each holds its whole storey.
        string Held(ShellPlan p, string name) => p.Held.FirstOrDefault(h => h.Name == name).Reason ?? "";
        var layerFree = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-layerfree-guideline.json")),
                                                    File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        var pattern = ShellPlanner.Plan(Facts(1), layerFree);
        Ok(pattern.Count == 0 && pattern.Storeys.Count == 0 && Held(pattern, "SH L0 storey").Contains("walls: " + ShellPlanner.Thickness)
           && ShellPlanner.Thickness == "the rule names its type with {thickness} — a mass has no thickness; write an exact-type rule"
           && Held(pattern, "roof") == "its storey SH L0→SH L1 is held — a person decides",
           "a {thickness} rule cannot type a mass: the storey is held in words, and its roof with it");
        var notLoaded = Facts(1); notLoaded.WallTypes.Clear();
        var nl = ShellPlanner.Plan(notLoaded, shell);
        Ok(nl.Count == 0 && Held(nl, "SH L0 storey") == "walls: \"BDS_EXT_ARC_CMU_300 mm\" is in the catalogue but not loaded in this model — Sentinel creates no types",
           "a wall type the model does not hold holds the storey — its floor is not filed either (one bad wall holds its floor)");
        var curtain = Facts(1); curtain.WallTypes["BDS_EXT_ARC_CMU_300 mm"] = ("Curtain", 0);
        Ok(Held(ShellPlanner.Plan(curtain, shell), "SH L0 storey") == "walls: \"BDS_EXT_ARC_CMU_300 mm\" is a curtain wall type — Sentinel places basic walls only",
           "a rule whose type is a curtain wall type here holds the storey (6-4 places basic walls only)");
        var noFloor = Facts(2); noFloor.FloorTypes.Clear();
        var nf = ShellPlanner.Plan(noFloor, shell);
        Ok(nf.Count == 0 && nf.Storeys.Count == 0 && Held(nf, "SH L1 storey").StartsWith("floor: \"BDS_INT_STR_CONC_300 mm\" is in the catalogue but not loaded"),
           "a floor type not loaded holds its storey's walls too — a partial storey would leave gaps");

        // Lean (S-2) and the roof: the box storey filed, the leaning one held in the exact words, its roof with it.
        var small = new List<double[]> { P(1000, 1000), P(1000, 11000), P(17000, 11000), P(17000, 1000) };
        var leans = ShellPlanner.Plan(Facts(2, i => i == 0 ? (L, L, null) : (L, small, null)), shell);
        Ok(leans.Storeys.Select(s => s.Storey).SequenceEqual(new[] { "SH L0" }) && Held(leans, "SH L1 storey") == ShellPlanner.Leans && leans.Roof == null
           && Held(leans, "roof") == "its storey SH L1→SH L2 is held — a person decides" && leans.Lines.Contains("SH L1→SH L2: held — " + ShellPlanner.Leans),
           "S-2: a storey whose top is not its bottom leans — held in the exact words; the storey below is filed; the roof is held with its storey");
        var rises = Facts(2); rises.RiseMm = 600;
        var rp = ShellPlanner.Plan(rises, shell);
        Ok(rp.Roof == null && rp.Storeys.Count == 2 && Held(rp, "roof") == "the mass rises 600 mm above SH L2 — no level there; add one (Datum) or a person decides",
           "the roof is filed only at the mass top: a mass that rises 600 mm above its top level holds the roof, in words");
        var setback = ShellPlanner.Plan(Facts(2, i => i == 0 ? (L, L, null) : (small, small, null)), shell);
        Ok(setback.Storeys.Count == 2 && setback.Roof != null && Held(setback, "SH L1 setback") == "the mass steps in at SH L1 — the terrace below gets no roof; a person decides",
           "a setback between two filed storeys is a held row, never a silent gap");
        var unread = ShellPlanner.Plan(Facts(1, _ => (null, null, "the mass has a hole (a courtyard) 10 mm above SH L0 — a person decides")), shell);
        Ok(unread.Count == 0 && Held(unread, "SH L0 storey") == "the mass has a hole (a courtyard) 10 mm above SH L0 — a person decides",
           "a storey the reader could not read is held with the reader's why");

        // Bodies (D2): ≤ 200 elements one changeset; above, one per storey with the roof in the top storey's and the held rows on the first.
        // Amendment 5: a storey of more than 200 elements is held — no (i/n) parts.
        object E(int i) => new { op = "create", kind = "wall", n = i };
        ShellPlan Hand(params int[] sizes)
        {
            var p = new ShellPlan { Roof = new { op = "create", kind = "roof" } };
            for (int i = 0; i < sizes.Length; i++) p.Storeys.Add(($"SH L{i}", Enumerable.Range(0, sizes[i]).Select(E).ToList()));
            p.Count = sizes.Sum() + 1;
            p.Held.Add(("SH L9 storey", "the mass leans in this storey — a person decides"));
            return p;
        }
        var b199 = Json(ShellPlanner.Bodies(Hand(100, 98), lf, "a"));
        var b260 = Json(ShellPlanner.Bodies(Hand(100, 100, 59), lf, "a"));
        Ok(b199.Count == 1 && b199[0]["elements"].AsArray().Count == 199 && (string)b199[0]["source"] == "promote" && !b199[0].AsObject().ContainsKey("pretick")
           && b260.Select(b => (string)b["name"]).SequenceEqual(new[] { "Shell (DD) · mass 41233 · SH L0", "Shell (DD) · mass 41233 · SH L1", "Shell (DD) · mass 41233 · SH L2" })
           && b260.Select(b => b["elements"].AsArray().Count).SequenceEqual(new[] { 100, 100, 60 }) && (string)b260[2]["elements"][59]["kind"] == "roof"
           && b260[0]["exceptions"].AsArray().Count == 1 && !b260[1].AsObject().ContainsKey("exceptions") && b260.All(b => (string)b["source"] == "promote")
           && b260.All(b => StoreyBatch.StoreyOf((string)b["name"]) == (string)b["name"])
           && ShellPlanner.Bodies(new ShellPlan(), lf, "a").Count == 0,
           "199 elements: one body; 260: one per storey (no \" (i/n)\" parts), the roof with the top storey, the held rows on the first; nothing to file: no body");
        List<double[]> Gon(int n) => Enumerable.Range(0, n).Select(i => P(50000 * Math.Cos(-2 * Math.PI * i / n), 50000 * Math.Sin(-2 * Math.PI * i / n))).ToList();
        var big = ShellPlanner.Plan(Facts(1, _ => (Gon(199), Gon(199), null)), shell);
        var fits = ShellPlanner.Plan(Facts(1, _ => (Gon(198), Gon(198), null)), shell);
        Ok(big.Count == 0 && Held(big, "SH L0 storey") == "199 edges in one storey — more than one changeset holds; a person decides"
           && fits.Count == 200 && fits.Roof != null && Json(ShellPlanner.Bodies(fits, lf, "a")).Single()["elements"].AsArray().Count == 200,
           "amendment 5: a storey that with its floor (and roof) is more than 200 elements is held in words; 198 edges, a floor and the roof fit one changeset");

        // The overlay draws a wall to its TopLevel (the executor's top), or SketchHeightMm without one (MA-3c's case stands).
        var topped = new ChangesetElementDto { Op = "create", Kind = "wall", Place = new PlaceDto { BaseLevel = "SH L0", TopLevel = "SH L1", LocationCurve = new CurveDto { Start = new double[] { 0, 0, 0 }, End = new double[] { 4000, 0, 0 } } } };
        Ok(GhostOverlayGeometry.Segments(topped, true, false, 0, 4000).Max(x => Math.Max(x.A[2], x.B[2])) == 4000
           && GhostOverlayGeometry.Tris(topped, true, false, 0, 4000).Max(t => t.C[2]) == 4000
           && GhostOverlayGeometry.Segments(topped, true, false, 0).Max(x => Math.Max(x.A[2], x.B[2])) == GhostOverlayGeometry.SketchHeightMm
           && GhostOverlayGeometry.All(new[] { (topped, true, false) }, _ => 0, _ => 4000).Max(x => x.B[2]) == 4000,
           "the overlay draws a wall with a TopLevel to that level (4 m storey, 4 m sheet); without one it is sketched 3000 mm as before");

        // The review: "Run Promote (DD) again" is never said of a shell (amendment 12); the overlay is given each wall's top.
        Ok(Commands_PromoteRun("promote", "Promote (DD) · SH L1") && !Commands_PromoteRun("promote", "Shell (DD) · mass 41233") && !Commands_PromoteRun("agent", "Promote (DD) · SH L1"),
           "a Promote changeset is planned again by Promote (DD); a shell (source promote, named Shell (DD)) and an agent's are not");
        string review = Src("Commands.ReviewChangesets.cs"), cmd = Src("Commands.ShellMass.cs"), reader = Src("GhostBuilder", "ShellReader.cs"), app = Src("App.cs");
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        Ok(review.Contains("internal static bool PromoteRun(ChangesetDto cs) => cs.Source == \"promote\" && !(cs.Name ?? \"\").StartsWith(ShellPlanner.Title, StringComparison.Ordinal);")
           && Count(review, "(PromoteRun(fresh[0]) ? CarriedEdits(fresh) + \"\\n\\n\" + RunPromoteAgain : \"\")") == 2 && !review.Contains("(fresh[0].Source == \"promote\" ?")
           && review.Contains("levelMm.TryGetValue(e.Place.TopLevel, out var mm) ? mm : (double?)null;")
           && review.Contains("GhostOverlayGeometry.Segments(e, true, false, LevelOf(e), TopOf(e))") && Count(review, "GhostOverlayGeometry.All(window.RowStates(), LevelOf, TopOf)") == 2
           && review.Contains("GhostOverlayGeometry.All(states, LevelOf, TopOf); var tris = GhostOverlayGeometry.AllTris(states, LevelOf, TopOf);"),
           "the review gates both \"Run Promote (DD) again\" texts on PromoteRun, and gives the overlay each wall's TopLevel elevation at every draw");

        // The command: the review guard taken, released exactly once on every path; the filing as Promote's; the receipt.
        Ok(cmd.Contains("[Transaction(TransactionMode.Manual)]\npublic sealed class ShellMassCommand : IExternalCommand")
           && cmd.Contains("if (ReviewChangesetsCommand.Held)") && cmd.Contains("ReviewChangesetsCommand.Hold(); // released by Plan")
           && cmd.Contains("void Once() { if (System.Threading.Interlocked.Exchange(ref held, 0) == 1) ReviewChangesetsCommand.Release(); }")
           && cmd.Contains("finally { if (!handed) Once(); }") && cmd.Contains("why => { ReviewChangesetsCommand.Release(); TaskDialog.Show(Title, why); }")
           && cmd.IndexOf("release(); // Open checks the guard", StringComparison.Ordinal) < cmd.IndexOf("ReviewChangesetsCommand.Open(ui, doc, cfg, key, StoreyBatch.Of(pending, unreviewed));", StringComparison.Ordinal)
           && cmd.Contains("finally { release(); }") && cmd.Contains("if (UserSession.IsSignedIn) fileCfg.FileToken = \"\";")
           && cmd.Contains("ReviewChangesetsCommand.Open(u, d, cfg, key, StoreyBatch.Of(filed, first));") && cmd.Contains("if (ProjectContext.For(d).Key != key)")
           && cmd.Contains("var unreviewed = pending.FirstOrDefault(p => p.Source == \"promote\");") && cmd.Contains("if (!m.HasCatalog)")
           && cmd.Contains("GovernedNotify.Report(\"Shell a Mass receipt\", BuildReceipt.Run(\"shell-mass\", BuildReceipt.AddinSha256,"),
           "the command holds the review guard and releases it once on every path (a refusal, No, a throw, the hub's refusal, the filing's finally, a waiting changeset reopened), files as Promote does and posts its build:run receipt");
        Ok(cmd.Contains("e.Category?.Id.IdValue() == (long)BuiltInCategory.OST_Mass || e is DirectShape ds && ds.ApplicationId == \"Sentinel\"")
           && cmd.Contains("catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }")
           && cmd.Contains("This model has no mass") && cmd.Contains("turn on Show Mass (Massing & Site) to see and pick an in-place mass"),
           "the pick takes a mass, or a DirectShape Sentinel placed (amendment 11); Esc cancels; no mass, or none shown, is said before the pick (amendment 13)");
        Ok(reader.Contains("catch (Exception ex) { f.Storeys.Add((null, null, $\"Revit could not cut the mass at {a.Name} — {ex.Message}\")); }")
           && reader.Contains("WherePasses(new ElementIntersectsSolidFilter(solid))") && reader.Contains("bb.Transform.OfPoint(new XYZ(x, y, z)).Z")
           && reader.Contains("var faces = above == null ? new List<PlanarFace>()") && reader.Contains("GroupBy(t => t.Name, StringComparer.OrdinalIgnoreCase)")
           && reader.Contains("t.Kind == WallKind.Basic ? t.Width * FtToMm : 0") && reader.Contains("BooleanOperationsUtils.CutWithHalfSpace(s, Plane.CreateByNormalAndOrigin(XYZ.BasisZ, new XYZ(0, 0, zFt)))"),
           "the reader holds a storey Revit could not cut, counts walls inside the solid itself, reads the Z range in the model's frame, takes a missed cut as \"does not reach\" and groups wall types by name (amendments 6, 7)");
        var faceWall = Directory.GetFiles(Repo("SentinelAddin"), "*.cs", SearchOption.AllDirectories)
            .Where(p => !p.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar) && !p.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar))
            .Where(p => File.ReadAllText(p).Contains("FaceWall.Create")).ToList();
        int massing = app.IndexOf("\"Sentinel_Massing\"", StringComparison.Ordinal), shellAt = app.IndexOf("Sub(chain, \"Sentinel_ShellMass\", \"2c · Shell a Mass\", \"Sentinel.Commands.ShellMassCommand\", \"ghost\",", StringComparison.Ordinal);
        Ok(faceWall.Count == 0 && massing > 0 && shellAt > massing && app.IndexOf("\"Sentinel_Annotate\"", StringComparison.Ordinal) > shellAt,
           "D1: no FaceWall.Create anywhere in the add-in; the ribbon's 2c · Shell a Mass sits after 2b · Photo Massing");
    }

    // ReviewChangesetsCommand is a Revit command (not compiled here): its PromoteRun rule, word for word, checked against the source above.
    static bool Commands_PromoteRun(string source, string name) => source == "promote" && !(name ?? "").StartsWith(ShellPlanner.Title, StringComparison.Ordinal);
}
