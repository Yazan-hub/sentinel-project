#nullable disable
// MA-8-7: third-party RVT re-typed in place. Structure by section (PromotePlanner.Section), the foreign classifier (ForeignTypes), a create that replaces a
// DirectShape (ReplacePlanner, D16) with its body, DTO and review words, and the Revit halves pinned by source text (the executor's replaces pre-pass,
// the delete after the creates, ReplaceCheck's R12 gate, Unsafe's section branch, the foreign read before the template refusal). The bridge judges the
// same foreign cases from the same fixture (WebApp/bridge/fixtures/changeset-ops/foreign-cases.json): no copy of its cases here.
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    static readonly string[] WithStructure = { "Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows", "Structural Columns", "Structural Framing" };

    static ShapeFact Sh(string label, double[] min, double[] max, Action<ShapeFact> set = null)
    {
        var s = new ShapeFact
        {
            UniqueId = $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{++_uid:x8}", Label = label, Category = "Generic Models", Kind = "directshape", BoxMin = min, BoxMax = max,
            Loop = new List<double[]> { new[] { min[0], min[1], min[2] }, new[] { max[0], min[1], min[2] }, new[] { max[0], max[1], min[2] }, new[] { min[0], max[1], min[2] } },
        };
        set?.Invoke(s);
        return s;
    }

    static void Ma8ForeignChecks()
    {
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        Console.WriteLine("\nMA-8-7 - third-party RVT in place (structure by section, the foreign classifier, a create that replaces)");
        var catText = File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json"));
        var m = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json")), catText, out _, out _);
        m.CatalogLabel = "type_catalog@1 · ma0-bds · 0123456789ab…";

        // ── the shared foreign cases: the bridge's foreignOf reads the same file ──
        var fx = JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "foreign-cases.json")));
        var cat = GuidelineMatcher.FromBodies(null, new JsonObject { ["types"] = JsonNode.Parse(fx["catalog"].ToJsonString()) }.ToJsonString(), out _, out var catErr);
        int agree = 0, total = 0;
        foreach (var c in fx["cases"].AsArray())
        {
            total++;
            string before = (string)c["type_before"];
            bool got = ForeignTypes.IsForeign(cat, (string)c["category"], (string)c["family"], (string)c["type"], system: !before.Contains(" : "));
            if (got == (bool)c["foreign"]) agree++; else Console.WriteLine($"        differs: {c["name"]} - C# {got}, fixture {c["foreign"]}");
        }
        Ok(catErr == null && total == 12 && agree == total, $"ForeignTypes.IsForeign gives the bridge's foreignOf answer on every shared case ({agree}/{total})");

        // ── structure by section ──
        Dictionary<string, IReadOnlyDictionary<string, double?>> Types(params string[] structure)
        {
            var t = V1Types().ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal);
            t["Structural Columns"] = new Dictionary<string, double?>(StringComparer.OrdinalIgnoreCase) { ["BDS_Column_Concrete_Rectangular : BDS_INT_STR_CONC_300 X 1500 mm"] = null, ["M_Concrete-Rectangular-Column : 300 x 450mm"] = null,
                ["BDS_Column_Concrete_Rectangular : BDS_INT_STR_CONC_600 X 600 mm"] = null, ["Generic Col : Foo"] = null };
            t["Structural Framing"] = new Dictionary<string, double?>(StringComparer.OrdinalIgnoreCase) { ["M_W Shapes : W310X21"] = null, ["BDS_STR_CONC_Rectangular Beam : BDS_INT_STR_CONC_300 x 600 mm"] = null };
            foreach (var s in structure) t.Remove(s);
            return t;
        }
        ElementFact Col(string label, double? w, double? d, string family = "Generic Col", string type = "Foo", string why = null, Action<ElementFact> set = null) =>
            Fx("column", label, family, type, set: f => { f.SectionWMm = w; f.SectionDMm = d; f.SectionWhy = why; set?.Invoke(f); });
        List<StoreyPlan> Run(IEnumerable<ElementFact> els, IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> types = null, GuidelineMatcher mm = null) =>
            PromotePlanner.Plan(WithStructure, new List<WallFact>(), els.ToList(), Levels, DocTypes, types ?? Types(), mm ?? m);
        string Held(List<StoreyPlan> p, string label) => p.SelectMany(x => x.Held).FirstOrDefault(h => h.Label == label)?.Reason;
        PromoteGhost Ghost(List<StoreyPlan> p, string label) => p.SelectMany(x => x.Ghosts).FirstOrDefault(g => g.Label == label);

        var c1 = Col("C1", 300, 1500);
        var pc = Run(new[] { c1 });
        var gh = Ghost(pc, "C1");
        Ok(gh != null && gh.Op == "retype" && gh.Kind == "column" && gh.FamilyName == "BDS_Column_Concrete_Rectangular" && gh.TypeName == "BDS_INT_STR_CONC_300 X 1500 mm"
           && gh.TypeBefore == "Generic Col : Foo" && gh.Reason == "structure by section 300 x 1500 mm: Generic Col : Foo → BDS_Column_Concrete_Rectangular : BDS_INT_STR_CONC_300 X 1500 mm (catalogue row, exact)",
           "a column whose section names exactly one catalogue row is retyped to it, said by section");
        var c2 = Col("C2", 300, 450);
        Ok(Ghost(Run(new[] { c2 }), "C2")?.FamilyName == "M_Concrete-Rectangular-Column", "300 x 450 reads '300 x 450mm' (no space before mm)");
        Ok(Held(Run(new[] { Col("C3", 450, 300) }), "C3") == "the catalogue names M_Concrete-Rectangular-Column : 300 x 450mm (300 x 450); it reads 450 x 300 mm in its own frame — turned; a person decides",
           "a turned section (only D x W names a row) is held, never swapped");
        var c4 = Run(new[] { Col("C4", 1000, 1000) });
        var gap = c4.SelectMany(x => x.Held).First(h => h.Label == "C4").Gap;
        Ok(Held(c4, "C4").StartsWith("gap: C4 (Generic Col : Foo) — no Structural Columns type named at 1000 x 1000 mm in the catalogue") && gap?.Category == "Structural Columns" && gap.Size == "1000 x 1000 mm",
           "no row at that section: a type gap {Structural Columns, 1000 x 1000 mm}, the Holding Area lists it");
        Ok(Held(Run(new[] { Col("C5", 300, 1500) }, Types("Structural Columns")), "C5").Contains("not loaded in this model — Sentinel creates no types"), "the target must be loaded (Sentinel creates no types)");
        var b1 = Fx("beam", "B1", "Wide Flange", "W310X21", set: f => { f.SectionWhy = "a section that is not a rectangle (a steel shape or a profile) — by its type name only"; });
        var pb = Run(new[] { b1 });
        Ok(Ghost(pb, "B1") is { Kind: "beam", FamilyName: "M_W Shapes", TypeName: "W310X21" } g1 && g1.Reason == "structure by its type name: Wide Flange : W310X21 → M_W Shapes : W310X21 (catalogue row, exact)",
           "a steel shape named alone (W310X21 in another family) is the one catalogue type of that exact name");
        var b2 = Fx("beam", "B2", "Wide Flange", "W999", set: f => { f.SectionWhy = "a section that is not a rectangle (a steel shape or a profile) — by its type name only"; });
        Ok(Held(Run(new[] { b2 }), "B2").Contains("no Structural Framing type of this name in the catalogue — a section that is not a rectangle"), "a steel shape no catalogue type is named like: a gap, said why");
        var ps = Run(new[] { Col("C6", 300, 300, "BDS_Column_Concrete_Rectangular", "BDS_INT_STR_CONC_300 X 300 mm"), Col("C7", 300, 300, "BDS_Other", "Z") });
        Ok(Ghost(ps, "C6") == null && Held(ps, "C6") == null && ps[0].Others["Structural Columns"].DdNow == 1 && ps[0].Others["Structural Columns"].OfficeTyped == 1 && ps[0].Others["Structural Columns"].Total == 1,
           "settled (a catalogue row) is untouched and counted; the office's own prefix is left as is and not counted");
        Ok(Held(Run(new[] { Col("C8", null, null, set: f => f.NotEditable = "framing of structural type Brace (a brace or purlin)") }), "C8") == "framing of structural type Brace (a brace or purlin) — Sentinel does not retype it; a person decides", "a brace is held in words");
        // review: a measured rectangle that no row carries is a gap even when a row has the type's name; a name alone is for steel shapes only
        var c12 = Run(new[] { Col("C12", 350, 350, "Ext", "300 x 450mm") });
        Ok(Ghost(c12, "C12") == null && c12.SelectMany(x => x.Held).First(h => h.Label == "C12").Gap is { Size: "350 x 350 mm", Want: null }, "a 350 x 350 column named like a 300 x 450 row is a gap at its size, never retyped by name");
        // review: a section not read as a rectangle and a name the catalogue lacks is a gap that WANTS that type (the bridge's type_gap row needs a want or a size)
        var c13 = Run(new[] { Col("C13", null, null, "Ext", "W999 X 99", why: "a section that is not a rectangle (a steel shape or a profile) — by its type name only") });
        var grp = TypeGaps.Group(c13);
        Ok(grp.Count == 1 && grp[0].Want == "W999 X 99" && grp[0].Size == null && grp[0].Category == "Structural Columns", "an unread section with an unknown name is a gap group with Want = the type name (typeGapRow accepts it)");
        // two catalogue rows at one section: a person decides, naming both
        var two = JsonNode.Parse(catText);
        two["types"].AsArray().Add(JsonNode.Parse("{\"category\":\"Structural Columns\",\"family\":\"Other Col\",\"type\":\"300 x 1500 mm\",\"system\":false,\"width_mm\":null,\"height_mm\":null,\"params\":{}}"));
        var mt = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json")), two.ToJsonString(), out _, out _);
        Ok(Held(Run(new[] { Col("C9", 300, 1500) }, mm: mt), "C9").Contains("which one is office policy"), "several rows at one section: held, which one is office policy");
        // never in the LOD matrix
        var all = Run(new[] { c1, c2, b1, Col("C10", 300, 300, "BDS_Column_Concrete_Rectangular", "BDS_INT_STR_CONC_300 X 300 mm") });
        Ok(all.SelectMany(x => x.Lod).All(f => Array.IndexOf(LodMatrix.Order, f.Category) >= 0) && all.SelectMany(x => x.Settled).All(s => Array.IndexOf(LodMatrix.Order, s.Category) >= 0)
           && all.Sum(x => x.Others.ContainsKey("Structural Columns") ? x.Others["Structural Columns"].Total : 0) == 3, "structure never enters p.Lod or p.Settled; its counts are in p.Others");
        // structure's office-typed members are counted apart: the LOD state's office_typed is the matrix classes' alone
        var lodMx = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd.json")), out _);
        var officeOnly = Run(new[] { Col("C11", 300, 300, "BDS_Other", "Z") });
        Ok(officeOnly[0].Others["Structural Columns"].OfficeTyped == 1 && LodState.Read(officeOnly, lodMx, null, "no ids", new Dictionary<string, StageIds.Verdict>(), null).OfficeTyped == 0,
           "the LOD state's office_typed does not count structure (outside the matrix)");
        // the body and the property planner (amendment 1: every Classes lookup goes through ClassOf)
        var body = JsonSerializer.SerializeToNode(PromoteWallsPlanner.Bodies(Run(new[] { c1, b1 }), "yazan").First(), ChangesetClient.WriteJson);
        var els = body["elements"].AsArray();
        Ok(els.Count == 2 && (string)els[0]["kind"] == "column" && (string)els[0]["validate"]["identity"]["Class"] == "IfcColumn" && (string)els[0]["place"]["FamilyName"] == "BDS_Column_Concrete_Rectangular"
           && (string)els[1]["validate"]["identity"]["Class"] == "IfcBeam", "the body of a structure retype: kind column / beam, the IFC class from ClassOf, the family and type");
        var mx = new LodMatrix();
        mx.Properties["Walls"] = new List<string> { "Pset_WallCommon.FireRating" };
        Ok(PropertyPlanner.DdTypes(Run(new[] { c1, b1 }), mx).Count == 0, "PropertyPlanner.Landed/Onto skip structure kinds (outside the matrix): no crash, nothing landed");
        Ok(PromoteWallsPlanner.ClassOf("column").Ifc == "IfcColumn" && PromoteWallsPlanner.ClassOf("wall").Category == "Walls" && !PromoteWallsPlanner.Classes.ContainsKey("column")
           && PromoteWallsPlanner.TryClassOf("beam", out var bc) && bc.Category == "Structural Framing" && !PromoteWallsPlanner.TryClassOf("mass", out _), "ClassOf / TryClassOf: Classes stays Promote's six (held to the bridge's KIND_ENTITY), Structure is beside it");

        // ── a create that replaces ──
        var rules = JsonNode.Parse("{\"standard\":\"MA-8-7 test\",\"office\":\"BDS\",\"stage\":\"DD\",\"elements\":[" +
            "{\"category\":\"Walls\",\"rules\":[{\"when\":{},\"use\":{\"family\":\"Basic Wall\",\"typePattern\":\"BDS_EXT_ARC_CMU_{thickness} mm\"},\"why\":\"test\"}]}," +
            "{\"category\":\"Floors\",\"rules\":[{\"when\":{},\"use\":{\"family\":\"Floor\",\"typePattern\":\"BDS_INT_STR_CONC_{thickness} mm\"},\"why\":\"test\"}]}]}");
        var mr = GuidelineMatcher.FromBodies(rules.ToJsonString(), catText, out var rge, out _);
        mr.CatalogLabel = m.CatalogLabel;
        var wallTypes = new Dictionary<string, string>(DocTypes, StringComparer.OrdinalIgnoreCase) { ["BDS_EXT_ARC_CMU_300 mm"] = "Exterior" };
        List<ReplaceRow> Re(IEnumerable<ShapeFact> shapes, bool signedIn = true, IReadOnlyDictionary<string, string> wt = null, IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> ty = null) =>
            ReplacePlanner.Plan(shapes.ToList(), Levels, new List<WallFact>(), wt ?? wallTypes, ty ?? V1Types(), mr, signedIn);
        var wall = Sh("Shape 1", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300, 3000 });
        var rw = Re(new[] { wall });
        var g = rw[0].Ghost;
        Ok(rge == null && rw[0].Held == null && g != null && g.Op == "create" && g.Kind == "wall" && g.TypeName == "BDS_EXT_ARC_CMU_300 mm" && g.LevelName == "Level 1" && g.TopLevel == "Level 2" && g.TopElevationMm == null
           && g.ReplacesUid == wall.UniqueId && g.UniqueId == wall.UniqueId && g.StartMm.SequenceEqual(new[] { 6000.0, 150, 0 }) && g.EndMm.SequenceEqual(new[] { 0.0, 150, 0 })
           && g.Reason == "re-create Shape 1 (Generic Models DirectShape, 6000 x 300 x 3000 mm) as BDS_EXT_ARC_CMU_300 mm — the original is removed in the same Undo (D16)",
           "a DirectShape that is one upright 6000 x 300 x 3000 prism standing on a story becomes a wall create that replaces it, centre line along the long axis, top at the next story");
        var rolled = Re(new[] { Sh("Shape 2", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300, 2500 }) })[0].Ghost;
        Ok(rolled.TopLevel == null && rolled.TopElevationMm == 2500, "a top that is not the next story is a TopElevation (unconnected), as reviewed");
        var floor = Sh("Shape 3", new[] { 0.0, 0, -300 }, new[] { 6000.0, 4000, 0 });
        var gf = Re(new[] { floor })[0].Ghost;
        Ok(gf != null && gf.Kind == "floor" && gf.TypeName == "BDS_INT_STR_CONC_300 mm" && gf.LevelName == "Level 1" && gf.LoopMm.Count == 4 && gf.LoopMm.All(p => p[2] == 0),
           "a 300 mm slab whose top is the story becomes a floor create, its loop at the top");
        string Why(ShapeFact s, bool signedIn = true, IReadOnlyDictionary<string, string> wt = null, IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> ty = null) => Re(new[] { s }, signedIn, wt, ty)[0].Held;
        Ok(Why(Sh("S4", new[] { 0.0, 0, 0 }, new[] { 300.0, 300, 3000 })) == "S4 (Generic Models DirectShape, 300 x 300 x 3000 mm): neither wall- nor floor-like (a column, a beam?) — a person decides", "300 x 300 x 3000 is a column, held");
        Ok(Why(Sh("S5", new[] { 0.0, 0, 100 }, new[] { 6000.0, 300, 3100 })) == "S5 (Generic Models DirectShape, 6000 x 300 x 3000 mm): its bottom sits 100 mm off any story — a person decides", "a bottom off every story is held with how far");
        Ok(Why(Sh("S6", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300, 3000 }, s => s.Sentinel = true)).StartsWith("Sentinel's own mass (ApplicationId Sentinel) — Shell it (2c)")
           && Why(Sh("S7", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300, 3000 }, s => s.Pinned = true)) == "pinned — Sentinel does not remove a pinned element"
           && Why(Sh("S8", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300, 3000 }, s => s.Kind = "inplace")) == "an in-place family — a person re-creates it"
           && Why(Sh("S9", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300, 3000 }, s => s.InGroup = true)) == "in a group — Sentinel does not edit group members"
           && Why(Sh("S10", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300, 3000 }, s => { s.Loop = null; s.PrismWhy = "2 solids"; })) == "a DirectShape that is not one upright prism (2 solids) — a person decides",
           "Sentinel's mass, a pinned, grouped or in-place element and a shape that is not one prism are held with their words");
        Ok(Why(wall, signedIn: false) == "a replacing create removes an element: sign in (Sentinel ▸ Sign in) and run Promote again", "signed out, none is proposed (the bridge refuses one from the machine credential)");
        Ok(Why(wall, wt: new Dictionary<string, string>(DocTypes)).Contains("\"BDS_EXT_ARC_CMU_300 mm\" is in the catalogue but not loaded in this model") , "the office wall type must be loaded");
        Ok(Why(Sh("S11", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300.4, 3000 })).Contains("is not a whole millimetre — exact match only (D16)"), "a thickness that is not a whole millimetre is held (exact or a person)");
        // review: only a Walls DirectShape that is wall-like, a Floors one that is floor-like, or a Generic Model is re-created
        string Cat(string cat, double[] min, double[] max) => Why(Sh("K", min, max, s => s.Category = cat));
        var wmin = new[] { 0.0, 0, 0 }; var wmax = new[] { 6000.0, 300, 3000 }; var fmin = new[] { 0.0, 0, -300 }; var fmax = new[] { 6000.0, 4000, 0 };
        Ok(Cat("Structural Foundations", fmin, fmax) == "K (Structural Foundations DirectShape, 6000 x 4000 x 300 mm): a Structural Foundations DirectShape — Promote re-creates walls and floors only; a person decides"
           && Cat("Walls", fmin, fmax) != null && Cat("Floors", wmin, wmax) != null && Cat("Walls", wmin, wmax) == null && Cat("Floors", fmin, fmax) == null && Cat("Generic Models", wmin, wmax) == null,
           "a footing or roof slab DirectShape is held with its category; Walls/Floors DirectShapes of the matching shape and Generic Models are re-created");
        // review: an office catalogue Generic Model family is the office's own
        var gm = JsonNode.Parse(catText)["types"].AsArray().First(t => (string)t["category"] == "Generic Models");
        string gfam = (string)gm["family"], gtyp = (string)gm["type"];
        Ok(Why(Sh("K2", wmin, wmax, s => { s.Kind = "generic"; s.Family = gfam; s.Type = gtyp; })) == $"K2 is the office's own type ({gfam} : {gtyp}) — Sentinel does not remove it"
           && Why(Sh("K3", wmin, wmax, s => { s.Kind = "generic"; s.Family = "Foreign Fam"; s.Type = "X"; })) == null, "an office catalogue Generic Model instance is never removed; a third party's is re-created");
        // review: classes this Promote runs
        var onlyWalls = ReplacePlanner.Plan(new[] { Sh("K4", wmin, wmax), Sh("K5", fmin, fmax) }, Levels, new List<WallFact>(), wallTypes, V1Types(), mr, true, new[] { "Walls" });
        Ok(onlyWalls[0].Held == null && onlyWalls[1].Held == "K5 (Generic Models DirectShape, 6000 x 4000 x 300 mm): this Promote does not run Floors (no LOD matrix = walls only) — a person decides", "with no matrix (walls only) a floor-like shape is held, not re-created");
        // review: the box z is in the levels' frame, the stale guard's box in Revit's internal frame
        var framed = Re(new[] { Sh("K6", new[] { 0.0, 0, 0 }, new[] { 6000.0, 300, 3000 }, s => { s.RawMin = new[] { 0.0, 0, 250000 }; s.RawMax = new[] { 6000.0, 300, 253000 }; }) })[0].Ghost;
        Ok(framed != null && framed.ReplacesMin[2] == 250000 && framed.ReplacesMax[2] == 253000 && framed.StartMm[2] == 0 && framed.TopLevel == "Level 2", "replaces.box keeps Revit's internal box; the storey and the top read the level-frame box");
        var kb = JsonSerializer.SerializeToNode(PromoteWallsPlanner.Bodies(Re(new[] { Sh("K7", wmin, wmax, s => s.Category = "Walls") }).Select(r => new StoreyPlan { Storey = r.Storey, Ghosts = { r.Ghost } }).ToList(), "yazan").First(), ChangesetClient.WriteJson);
        var kdto = JsonSerializer.Deserialize<ChangesetElementDto>(kb["elements"][0].ToJsonString());
        Ok((string)kb["elements"][0]["replaces"]["kind"] == "directshape" && (string)kb["elements"][0]["replaces"]["category"] == "Walls"
           && ChangesetTrust.ReplacesWords(kdto).Contains("(Walls DirectShape, 6000 x 300 x 3000 mm)"), "the body carries the original's class and category; the review row names them");
        Ok(ChangesetTrust.UntickedWords(new ChangesetElementDto { Op = "retype", Kind = "column" }) == "not pre-ticked: structure is a person's"
           && ChangesetTrust.UntickedWords(new ChangesetElementDto { Op = "retype", Kind = "wall", Foreign = true }) == "not pre-ticked: a type that is not the office's"
           && ChangesetTrust.UntickedWords(new ChangesetElementDto { Op = "retype", Kind = "wall", Foreign = false }) == null && ChangesetTrust.UntickedWords(new ChangesetElementDto { Op = "create", Kind = "wall" }) == null,
           "a retype row says why it is not pre-ticked");
        // the plan: ghosts ride on the storey of their shape; never counted in the LOD state; Refuse moves a refused one to Held
        var plans = PromotePlanner.Plan(WithStructure, new List<WallFact>(), new List<ElementFact>(), Levels, wallTypes, V1Types(), mr, true, new[] { wall, floor, Sh("S12", new[] { 0.0, 0, 0 }, new[] { 300.0, 300, 3000 }) });
        var l1 = plans.Single(p => p.Storey == "Level 1");
        Ok(l1.Ghosts.Count(x => x.ReplacesUid != null) == 2 && l1.Held.Count == 1 && l1.Lod.Count == 0 && l1.Settled.Count == 0, "Plan merges the shapes onto their storey: 2 replacing creates, 1 held, none in the LOD facts");
        PromotePlanner.Refuse(plans, x => x.ReplacesUid == wall.UniqueId ? "the original is pinned" : null);
        Ok(l1.Ghosts.Count(x => x.ReplacesUid != null) == 1 && l1.Held.Any(h => h.UniqueId == wall.UniqueId && h.Reason == "the original is pinned"), "the preflight holds a replacing create it refuses, as for a rehost");
        // the body and the DTO the review reads
        var rb = JsonSerializer.SerializeToNode(PromoteWallsPlanner.Bodies(Re(new[] { wall, floor }).Select(r => new StoreyPlan { Storey = r.Storey, Ghosts = { r.Ghost } }).ToList(), "yazan").First(), ChangesetClient.WriteJson);
        var we = rb["elements"].AsArray()[0];
        Ok((string)we["op"] == "create" && (string)we["kind"] == "wall" && (string)we["replaces"]["unique_id"] == wall.UniqueId && we["replaces"]["box"]["max"][1].GetValue<double>() == 300 && we["target"] == null
           && (string)we["place"]["LevelName"] == "Level 1" && we["place"]["LocationCurve"]["start"][0].GetValue<double>() == 6000 && (string)we["place"]["TopLevel"] == "Level 2" && !((JsonObject)we["place"]).ContainsKey("TopElevation")
           && (string)we["place"]["TypeName"] == "BDS_EXT_ARC_CMU_300 mm" && (string)we["validate"]["identity"]["Class"] == "IfcWall",
           "the body of a replacing wall create: op create, replaces {unique_id, box}, the place of an ordinary create (no target, no TopElevation beside TopLevel)");
        var fe = rb["elements"].AsArray().Count > 1 ? rb["elements"].AsArray()[1] : null;
        Ok(fe == null || ((string)fe["kind"] == "floor" && fe["place"]["LocationLoop"].AsArray().Count == 4), "a replacing floor create carries its LocationLoop");
        var dto = JsonSerializer.Deserialize<ChangesetElementDto>(we.ToJsonString());
        Ok(dto.Replaces?.UniqueId == wall.UniqueId && dto.Replaces.Box.Max[0] == 6000 && ChangesetTrust.ReplacesWords(dto) == $"re-creates {wall.UniqueId} (Generic Models DirectShape, 6000 x 300 x 3000 mm) — the original and any tags on it are removed in the same Undo (one Undo brings it back and removes the new wall)"
           && ChangesetTrust.ReplacesWords(new ChangesetElementDto { Kind = "wall" }) == null, "the DTO reads replaces; the review row says the original is removed in the same Undo");
        var cs = new ChangesetDto { Source = "promote", Claimed = true };
        Ok(!ChangesetTrust.PreTick(cs, new ChangesetElementDto { Op = "retype", Kind = "wall", Foreign = true, Pretick = true, Target = new TargetDto { TypeBefore = "T" } })
           && !ChangesetTrust.PreTick(cs, new ChangesetElementDto { Op = "retype", Kind = "column", Pretick = true, Target = new TargetDto { TypeBefore = "T" } })
           && !ChangesetTrust.PreTick(cs, new ChangesetElementDto { Op = "retype", Kind = "beam", Target = new TargetDto { TypeBefore = "T" } })
           && ChangesetTrust.PreTick(cs, new ChangesetElementDto { Op = "retype", Kind = "wall", Foreign = false, Pretick = true, Target = new TargetDto { TypeBefore = "T" } }),
           "Revit never ticks a foreign retype or a column/beam retype, whatever the bridge answered; a catalogue-row retype follows the bridge");
        Ok(JsonSerializer.Serialize(new AppliedEntry { ProposalGuid = "g", RevitUniqueId = "u" }, ChangesetClient.WriteJson).Contains("removed_unique_id") == false
           && JsonSerializer.Serialize(new AppliedEntry { ProposalGuid = "g", RemovedUniqueId = "old" }, ChangesetClient.WriteJson).Contains("\"removed_unique_id\":\"old\""),
           "AppliedEntry.removed_unique_id is sent only for a replacing create (left out otherwise: bodies stay byte-identical)");

        // ── the foreign classifier ──
        ForeignFact Ff(string uid, string category, string family, string type, bool system = false, string shape = null) =>
            new ForeignFact { UniqueId = uid, Label = uid, Category = category, Family = family, Type = type, System = system, Shape = shape };
        var facts = new[]
        {
            Ff("w1", "Walls", "Basic Wall", "BDS_EXT_ARC_CMU_300 mm", true),                    // settled
            Ff("w2", "Walls", "Basic Wall", "Aussenwand 36.5", true),                          // foreign, retype-able
            Ff("w3", "Walls", "Basic Wall", "Innenwand 11.5", true),                           // foreign, held
            Ff("f1", "Furniture", "Chair", "Plain"),                                           // foreign, a class Promote does not read
            Ff("d1", "Generic Models", null, null, shape: "directshape"),                      // re-created
            Ff("d2", "Generic Models", null, null, shape: "directshape"),                      // held
            Ff("c1", "Structural Columns", "BDS_Column_Concrete_Rectangular", "BDS_INT_STR_CONC_300 X 300 mm"),
        };
        var plan = new StoreyPlan { Storey = "Level 1" };
        plan.Ghosts.Add(new PromoteGhost { Op = "retype", UniqueId = "w2", Kind = "wall" });
        plan.Ghosts.Add(new PromoteGhost { Op = "create", UniqueId = "d1", ReplacesUid = "d1", Kind = "wall" });
        plan.Held.Add(new PromoteHeld { UniqueId = "w3", Reason = "gap: no wall rule" });
        plan.Held.Add(new PromoteHeld { UniqueId = "d2", Reason = "S5: its bottom sits 100 mm off any story — a person decides" });
        var rep = ForeignTypes.Classify(facts, new[] { plan }, m);
        Ok(rep.NSettled == 2 && rep.NRetype == 2 && rep.NGap == 2 && rep.NDirectShape == 1 && rep.Foreign == 5 && rep.Types == 4 && rep.NotChecked == null
           && rep.Line == "Foreign (types not the office's): retype-able 2 · gap 2 · DirectShape/Generic Model 1 · settled 2", $"the four bins ({rep.Line})");
        Ok(rep.Rows.Single(r => r.Type == "Plain").Why == "Sentinel does not retype Furniture" && rep.Rows.Single(r => r.Type == "Innenwand 11.5").Why == "gap: no wall rule"
           && rep.Rows.Single(r => r.Bin == ForeignReport.DirectShape).Why.StartsWith("S5:"), "a gap says why: Promote's hold, or that Sentinel does not retype the category");
        Ok(rep.Lines(2).Count == 3 && rep.Lines(2)[2] == "… and 3 more type row(s)" && rep.TopCategories().Select(x => x.Count).SequenceEqual(new[] { 2, 2, 1 }), "the lines are the top groups, then how many more; the top categories lead with the most elements");
        // review: a Generic Model instance of the office's own catalogue is settled, not a shape; a refused model (no plans) says nothing was planned
        var gen = ForeignTypes.Classify(new[] { Ff("g1", "Generic Models", gfam, gtyp, shape: "generic"), Ff("g2", "Generic Models", "Foreign Fam", "X", shape: "generic") }, new[] { new StoreyPlan { Storey = "Level 1" } }, m);
        Ok(gen.NSettled == 1 && gen.NDirectShape == 1, "an office-catalogue Generic Model instance is settled, a foreign one is a DirectShape/Generic Model row");
        var refused = ForeignTypes.Classify(new[] { Ff("w9", "Walls", "Basic Wall", "Innenwand 11.5", true), Ff("d9", "Generic Models", null, null, shape: "directshape") }, null, m);
        Ok(refused.Rows.All(r => r.Why == ForeignTypes.NotPlanned), "on a refused model the reasons say nothing was planned, not that Sentinel does not retype");
        var nocat = ForeignTypes.Classify(facts, null, GuidelineMatcher.FromBodies(null, null, out _, out _));
        Ok(nocat.NotChecked == "no type catalogue installed (type_catalog (unlabelled)) — foreign types are not judged" && nocat.Foreign == 0 && nocat.Line.StartsWith("Foreign types: not judged — "), "no catalogue: nothing is classified, said in words");
        var led = Json(CommandReports.ForeignTypes(rep, "cat", "a@b.test"));
        Ok(led.GetProperty("entity_type").GetString() == "foreign_types" && led.GetProperty("action").GetString() == "foreign_types:run · 5 element(s) on 4 type(s) not the office's"
           && led.GetProperty("new_value").GetProperty("totals").GetProperty("directshape").GetInt32() == 1 && led.GetProperty("new_value").GetProperty("rows_total").GetInt32() == 5
           && led.GetProperty("new_value").GetProperty("source").GetString() == "revit", "the ledger row: foreign_types, the totals by bin, the top groups beside their true total");
        Ok(CommandReports.ForeignTypes(nocat, "cat", "a@b.test") is var nr && Json(nr).GetProperty("action").GetString().StartsWith("foreign_types:run · not judged"), "a run that judged nothing is a row that says so");

        // ── Revit halves, by source text ──
        string ex = Src("GhostBuilder", "ChangesetExecutor.cs"), cmd = Src("Commands.PromoteWalls.cs"), cli = Src("Coordination", "ChangesetClient.cs"), pw = Src("GhostBuilder", "PromoteWallsPlanner.cs"), rcv = Src("Commands.ReviewChangesets.cs");
        int pre = At(ex, "var replaced = new Dictionary<string, (ElementId OldId, string Uid, List<ElementId> Probe)>"), walls = At(ex, "var wallCreates = toPlace.Where("), floors = At(ex, "toPlace.Where(e => IsCreate(e) && e.Kind == \"floor\""),
            del = At(ex, "var deleted = doc.Delete(oldId);"), roofs = At(ex, "// MA-1: a roof on its level"), rehost = At(ex, "var rehosts = toPlace.Where(e => e.Op == \"rehost\").ToList();");
        Ok(pre > 0 && walls > pre && floors > walls && del > floors && roofs > del && rehost > roofs
           && ex.Contains("var (why, refuse, oldId, oldUid, probe) = ReplaceCheck(doc, el.Replaces.UniqueId, el.Replaces.Box?.Min, el.Replaces.Box?.Max, probe: true);") && ex.Contains("if (refuse) throw new PlacementRefused($\"{at}: {why}\");")
           && ex.Contains("deleted.Count != probe.Count || deleted.Any(id => !probe.Contains(id))") && ex.Contains("entry.RemovedUniqueId = uid;") && ex.Contains("notMade.Add(el.ProposalGuid);")
           && ex.Contains("&& !notMade.Contains(e.ProposalGuid)).ToList();"),
           "the executor checks every original before the creates (kept ones are not made), deletes after the walls and floors, refuses unless the delete equals the probe, and reports the removed UniqueId");
        string rc = ex.Substring(At(ex, "internal static (string Why, bool Refuse, ElementId OldId, string OldUid, List<ElementId> Probe) ReplaceCheck"), 3600);
        Ok(rc.Contains("old is DirectShape") && rc.Contains("old.Category?.Id.IdValue() == (long)BuiltInCategory.OST_GenericModel") && rc.Contains("!(gfi.Symbol?.Family?.IsInPlace ?? false)")
           && rc.Contains("Sentinel.Commands.MassOnly.Is(old)") && rc.Contains("not a DirectShape or Generic Model") && rc.Contains("HeldBy(doc, old)") && rc.Contains("new SubTransaction(doc)") && rc.Contains("sub.RollBack()")
           && rc.Contains("!(doc.GetElement(id) is IndependentTag)") && rc.IndexOf("var oldUid = old.UniqueId;", StringComparison.Ordinal) is int ou && ou > 0 && ou < rc.IndexOf("new SubTransaction(doc)", StringComparison.Ordinal) && !rc.Substring(rc.IndexOf("sub.RollBack()", StringComparison.Ordinal)).Contains("old.") && rc.Contains("> ReshapeTolMm"),
           "R12: only a DirectShape or a Generic Model instance (never an in-place family, never a mass), the box it stood in, not held, and a probe delete in a rolled-back SubTransaction that takes only itself and its tags");
        Ok(ex.Contains("if (kind is \"column\" or \"beam\")") && ex.Contains("StructureHold(sfi, kind)") && ex.Contains("a retype would change its section; a person decides") && ex.Contains("SectionOf(sfi, kind)")
           && ex.Contains("fi.GetOriginalGeometry(new Options { DetailLevel = ViewDetailLevel.Fine })?.GetTransformed(fi.GetTransform())") && ex.Contains("bool byName = !(sw.HasValue && sd.HasValue) &&")
           && ex.Contains("var centres = new List<(Element E, string Kind, XYZ Centre)>();") && ex.Contains("foreach (var (me, mkind, centre0) in centres)") && ex.Contains("moved on the retype") && ex.Contains("PromoteWallsPlanner.TryClassOf(el.Kind, out var cls)")
           && ex.Contains("fi.StructuralType != StructuralType.Beam") && ex.Contains("fi.IsSlantedColumn") && ex.Contains("fi.SuperComponent != null"),
           "Unsafe keeps a structure retype's section (by TrySection or by name); the section is read from the original geometry; a moved centre declines; Target goes through TryClassOf");
        Ok(cmd.IndexOf("ReadForeign(doc)", StringComparison.Ordinal) is int rf && rf > 0 && cmd.IndexOf("PlacementPolicy.TemplateRefuses(officeHave, officeAll)", StringComparison.Ordinal) > rf
           && cmd.Contains("ForeignRefusal(refusedForeign, foreignErr)") && cmd.Contains("classes.AddRange(structure);") && cmd.Contains("var structure = mx == null ? new List<string>()")
           && cmd.Contains("UserSession.IsSignedIn, shapes);") && cmd.Contains("ChangesetExecutor.ReplaceRefusal(doc, g.ReplacesUid, g.ReplacesMin, g.ReplacesMax)") && cmd.Contains("foreignText +")
           && cmd.Contains("!(e is DirectShape) && !(e is FamilyInstance sfi && sfi.Symbol?.Family?.IsInPlace == true)") && cmd.Contains("Compat.CategoryKeyOf(cat)") && cmd.Contains("&& !e.ViewSpecific") == false,
           "Promote reads the foreign types before the template refusal and says them in it; structure runs with a matrix; the DirectShape collectors skip shapes and in-place families; the plan takes the shapes");
        Ok(rcv.Contains("(e.Op == \"rehost\" || e.Replaces != null) && ticked.Contains(e.ProposalGuid)") && rcv.Contains("A rehost or a re-creation removes an element"), "the machine credential's Apply is refused client-side for a re-creation too (the bridge refuses its result)");
        Ok(cmd.Contains("s.RawMin = (double[])s.BoxMin.Clone();") && cmd.Contains("(near.Elevation - near.ProjectElevation) * FtToMm") && cmd.Contains("if (MassOnly.Is(e)) continue; // review") && cmd.Contains("an in-place family - a person re-creates it")
           && ex.Contains("return \"an in-place family - a person re-creates it\";"), "ReadShapes moves the box into the levels' frame (raw kept for the guard), the foreign read skips Sentinel's masses, one in-place words");
        var pcx = Src("GhostBuilder", "PromoteContext.cs");
        Ok(pcx.Contains("structure is outside the LOD matrix - the DD IDS judges no structure") && pcx.Contains("the DD IDS made from the LOD matrix has no class for this kind yet")
           && pcx.Contains("NoDdClass = new HashSet<string>(StringComparer.Ordinal) { \"level\", \"grid\", \"room\", \"opening\", \"mass\" }"), "JudgeApplied says an applied column or beam is outside the LOD matrix; the NoDdClass kinds are unchanged");
        Ok(cmd.Contains("cat.CategoryType != CategoryType.Model || e.ViewSpecific") && cmd.Contains("fi?.SuperComponent != null") && cmd.Contains("\"OST_CurtainWallPanels\"") && cmd.Contains("\"OST_Lines\"")
           && cmd.Contains("if (type == null && shape != \"directshape\") continue;"), "the foreign collector leaves out view-specific elements, nested components, curtain parts, stair and railing parts, lines and typeless elements");
        Ok(cmd.Contains("if (kind == \"beam\") f.Level ??= LevelName(sfi.get_Parameter(BuiltInParameter.INSTANCE_REFERENCE_LEVEL_PARAM)?.AsElementId());") && cmd.Contains("ChangesetExecutor.StructureHold(sfi, kind)")
           && cmd.Contains("ChangesetExecutor.SectionOf(sfi, kind)") && cmd.Contains("PromoteWallsPlanner.ClassOf(o.Kind).Category"), "OtherFact reads a structural member's level, its holds and its original-geometry section through the executor's own functions");
        Ok(cli.Contains("[JsonPropertyName(\"replaces\")]") && cli.Contains("el.Foreign == true || (el.Op == \"retype\" && (el.Kind == \"column\" || el.Kind == \"beam\"))") && cli.Contains("[JsonPropertyName(\"removed_unique_id\")]")
           && pw.Contains("ClassOf(g.Kind ?? \"wall\").Ifc"), "the client reads replaces and foreign, never pre-ticks a foreign or structure retype itself, and sends removed_unique_id");
    }
}
