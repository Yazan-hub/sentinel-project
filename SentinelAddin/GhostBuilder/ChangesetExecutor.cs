#nullable disable
// Governed AI modeling (A2): places the elements a human ticked, in ONE transaction, collecting
// the created ElementIds per proposal_guid — the golden thread back to the audit trail. Any
// failure rolls back the WHOLE changeset (partially_applied means "human unticked some", never
// "some failed silently"). Contract geometry is MILLIMETRES; Revit internal units are feet.
// MA-0: a ghost's op is create (a new element), retype (an existing wall, floor, roof, ceiling, door or window to a type
// already in the document — a door or window keeps its host) or attach (an existing wall's base and top to story levels). Every element the changeset touched is stamped (ProvenanceStamp),
// inside this transaction, and the transaction is named so the undo watcher can find it.
// MA-1: a create also places a door or window (hosted by the one wall its point lies on), a flat footprint roof or a
// ceiling; any create but a level or grid may carry a Mark, a floor Structural.
// MA-1a step 2: Ghost Builder's DWG builds run here too (GhostChangesetBuild): a column or furniture create (unhosted on its
// level) and an arc wall (LocationCurve.mid). Commit-time failures go through the all-or-nothing preprocessor (a warning is
// counted and left in the model, any error rolls the changeset back), and what survived the commit is recounted.
// F-S2-2: a new wall never joins a wall that was already in the model (WallUtils.DisallowWallJoinAtEnd on the new wall, at
// each end that touches one, PlacementGeometry.EndsTouching); walls of the same changeset or build still join at corners.
// MA-1a item 3 (GHB-2): a wall create with no TopElevation rises to the next Building Story above its base, its top constrained
// there at offset 0 (PromoteWallsPlanner.WallTop — Promote's attach rule); on the top story it is unconnected at the storey
// below's height; with neither it is refused by name. An explicit TopElevation stays unconnected, as reviewed. With no
// BaseElevation the base is the level itself. Item 4: the stamp also carries the changeset's proposal row on the ledger, the
// approver and the time, and — from the IN-PROCESS caller only (Provenance, as WallsBefore; review amendment C1) — the
// element's layer, rule and source file. A changeset element's own provenance field is the bridge's record and is never read
// here: anyone who can file a changeset could write it. With no rule of the caller's, the rule is the element's reason,
// marked as its proposer's (C2).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Arch = Autodesk.Revit.DB.Architecture; // MA-8-10: Stairs, StairsRun, StairsType (a using would make Room and Railing ambiguous with the executor's own names)
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder;

public sealed class ChangesetExecutor
{
    private const double MmToFeet = 1.0 / 304.8;
    private const double TolFt = 0.5 * MmToFeet; // the planner's 0.5 mm

    public sealed class ExecutionResult
    {
        public List<AppliedEntry> Applied { get; } = new();
        public string Error { get; set; }
        /// Nothing was attempted (the model was switched or closed): the changeset stays pending — never reported
        /// as declined, never as applied.
        public bool NotRun { get; set; }
        /// MA-1a step 2: applied elements Revit no longer holds after the commit (the recount) — reported as rejected, never as
        /// applied. Empty when every element survived, which all-or-nothing makes the rule.
        public List<AppliedEntry> Gone { get; } = new();
        /// MA-1a step 2: the Revit warnings this changeset raised, counted by text — left in the model, never erased ([BP] P1-3).
        public Dictionary<string, int> Warnings { get; } = new();
        /// MA-5b-4 (C13b): reshapes NOT done — the wall was edited by hand since it was placed, or is gone — each with why; reported as
        /// rejected with that reason, never as applied, and never a failure of the changeset (the rest is applied).
        public List<(string ProposalGuid, string Why)> Kept { get; } = new();
        /// A6: Commit returned neither Committed nor RolledBack (Pending, …) — Revit may still finish or drop it, so nothing is
        /// reported and nothing recounted; this is the whole result.
        public string NotFinished { get; set; }
        /// MA-1a item 5: the BLOCK check's line — placed anyway with N element(s) that will block a sync, or why BLOCK rules
        /// were not checked; null when none can fire. Set by ChangesetPlacementEvent; it rides on the result's note.
        public string Block { get; set; }
        /// MA-2b: the DD IDS check's line (design §3.4 step 5) — placed anyway with N element(s) failing, and what it could not read
        /// — or why it did not run; null on a changeset that is not Promote's. Set by ChangesetPlacementEvent; it rides on the note.
        public string Ids { get; set; }
        /// MA-1a item 6: what the placement block did to the created elements — worksets, phase — or why it did nothing;
        /// null when the changeset created nothing. Set by ChangesetPlacementEvent from the plan it resolved.
        public List<string> Placement { get; set; }
        /// MA-1b (GHB-1): each door or window created with place.Rotation (read from a drawn block), as Revit holds it AFTER
        /// the commit — the angle between it and its block, and whether its hand and facing run with the block's axes
        /// (PlacementGeometry.Turn), and whether its family lacks the hand or the facing flip. OffDeg NaN = it could not be
        /// read back. Empty when the changeset carried no Rotation.
        public List<(string Label, double OffDeg, bool Hand, bool Facing, bool NoHandFlip, bool NoFacingFlip)> Turned { get; } = new();
        /// MA-2d: each changeset's own result, in the order it ran — a Promote storey's several changesets run in one group
        /// (ChangesetPlacementEvent.RunChecked), and the fields above are the storey's whole; one entry for a changeset run alone. Set by
        /// ChangesetPlacementEvent for a placed storey; the review reports each entry on its own ledger row.
        public List<(ChangesetDto Cs, ExecutionResult Res)> Each { get; } = new();
        /// MA-6-6 (D13): said when this Revit refused a DirectShape in Mass and the mass was placed as a Generic Model instead;
        /// null otherwise. Carried by ChangesetPlacementEvent onto the placement lines, so the note and the dialog say it.
        public string MassAs { get; set; }
        /// MA-8-10: the line saying which Revit warnings a stair's edit scope removed (GhostFailurePolicy.RemovedLine); null when none. Rides on the note and
        /// the dialog like MassAs - the one place Sentinel erases a warning is always said.
        public string Removed { get; set; }
    }

    /// F-S2-2: the ids of the walls that were in the model before the caller's build (a Ghost build of several changesets sets
    /// it, so a wall of its first changeset still joins one of its second at a corner); null = the walls in the model when this
    /// changeset starts. A new wall never joins one of them.
    public ISet<long> WallsBefore { get; set; }

    /// MA-1a item 4 (review amendment C1): what the in-process caller knows of the elements it filed, by proposal_guid — the
    /// layer, the rule that typed it, the source file's sha256 (Ghost Builder sets it, as it sets WallsBefore). Null, or no
    /// entry = none (Review AI Proposals, Promote). The only place a stamp's layer, rule and sha come from: el.Provenance, which
    /// the bridge returned, is never read.
    public IReadOnlyDictionary<string, ProvenanceStamp.Facts> Provenance { get; set; }

    /// MA-1a item 6: where this changeset's created elements go — the workset each category names and the view's phase —
    /// resolved by the in-process caller on the API thread before Execute (PlacementApply.Resolve). Null = nothing is set
    /// (a changeset that creates nothing). A design option being edited is refused here whatever this holds.
    public PlacementPlan Placement { get; set; }

    private static XYZ Pt(double[] p) => new XYZ(p[0] * MmToFeet, p[1] * MmToFeet, p[2] * MmToFeet);

    /// MA-1a item 3: the model's levels as the next-story rule reads them — the one projection (review amendment C6): the
    /// executor's wall top, Ghost's planner and Promote all read it.
    internal static List<LevelFact> Stories(Document doc) => new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
        .Select(l => new LevelFact { Name = l.Name, ElevationMm = l.Elevation / MmToFeet, IsStory = l.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.AsInteger() == 1 })
        .ToList();

    // F-S2-2: the walls a new wall must not join, as PlacementGeometry.EndsTouching reads them (mm): plan polyline (the Location
    // Line), body reach from it (PlacementGeometry.BodyReach), bottom and top (Level.Elevation's frame, as a create's BaseElevation).
    private List<(IReadOnlyList<double[]> Line, double HalfWidth, double Bottom, double Top)> ExistingWalls(Document doc) =>
        new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>()
            .Where(w => w.Location is LocationCurve && (WallsBefore == null || WallsBefore.Contains(w.Id.IdValue())))
            .Select(w =>
            {
                var (bottom, top) = Heights(doc, w);
                IReadOnlyList<double[]> line = ((LocationCurve)w.Location).Curve.Tessellate().Select(p => new[] { p.X / MmToFeet, p.Y / MmToFeet }).ToList();
                // The curve sits on the wall's Location Line, not always its centre (PlacementGeometry.BodyReach).
                var reach = PlacementGeometry.BodyReach(w.Width / MmToFeet, w.get_Parameter(BuiltInParameter.WALL_KEY_REF_PARAM)?.AsInteger());
                return (line, reach, bottom / MmToFeet, top / MmToFeet);
            }).ToList();

    // A wall's bottom and top (ft): its base level + offset, and its top level + offset or its unconnected height — attach's
    // reading. An unreadable base counts as every height, so the join is disallowed rather than risked.
    private static (double Bottom, double Top) Heights(Document doc, Wall w)
    {
        if (!(doc.GetElement(w.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsElementId() ?? ElementId.InvalidElementId) is Level b))
            return (double.NegativeInfinity, double.PositiveInfinity);
        var bottom = b.Elevation + (w.get_Parameter(BuiltInParameter.WALL_BASE_OFFSET)?.AsDouble() ?? 0);
        return (bottom, doc.GetElement(w.get_Parameter(BuiltInParameter.WALL_HEIGHT_TYPE)?.AsElementId() ?? ElementId.InvalidElementId) is Level tl
            ? tl.Elevation + (w.get_Parameter(BuiltInParameter.WALL_TOP_OFFSET)?.AsDouble() ?? 0)
            : bottom + (w.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.AsDouble() ?? 0));
    }

    private static Level ResolveLevel(Document doc, PlaceDto place)
    {
        var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().ToList();
        if (!levels.Any()) throw new InvalidOperationException("the model has no levels");
        if (!string.IsNullOrWhiteSpace(place?.LevelName))
        {
            // A NAMED level that doesn't exist fails honestly (same rule as named types): the
            // reviewer saw that level name on the row. Nearest-by-elevation applies only when the
            // proposal names no level. MA-6-3 (amendment 1): it is the model's state, not a verdict on the changeset (C5's rule) —
            // PlacementRefused keeps it proposed, so a storey applied before the one that creates its levels can be applied after it.
            return levels.FirstOrDefault(l => string.Equals(l.Name, place.LevelName, StringComparison.OrdinalIgnoreCase))
                   ?? throw new PlacementRefused($"level \"{place.LevelName}\" does not exist in this model — apply the changeset that creates it first, or propose again with the level in the changeset or naming a level this model has (Promote: run it again); nothing was placed, and this one stays proposed");
        }
        // Drill MA2a (F-MA2a-3): contract 2 names a wall's level BaseLevel (design :675). It was read only for an attach, and a
        // create naming no LevelName fell to the model's LOWEST level — the design's wall went on GR_SSL, 300 mm high, in silence.
        if (!string.IsNullOrWhiteSpace(place?.BaseLevel)) return LevelNamed(doc, place.BaseLevel);
        if (place?.BaseElevation is double mm)
        {
            var ft = mm * MmToFeet;
            return levels.OrderBy(l => Math.Abs(l.Elevation - ft)).First();
        }
        throw new InvalidOperationException("names no level (place.LevelName, place.BaseLevel or place.BaseElevation) — Sentinel never picks its level");
    }

    // A named type that doesn't exist FAILS the changeset (named reason → declined) rather than
    // silently substituting: the human ticked a row showing that TypeName, and the IDS adjudicated
    // the proposal it labels — placing an arbitrary type would break the governance chain at its
    // last link. A proposal with NO TypeName is a gap and fails too (D16): Sentinel never takes the
    // model's first type, and it never creates one here. MA-6 fix-b1 (F-2): a type the model does not hold is the model's state, not a verdict
    // (C5's rule, as a missing level) — PlacementRefused, so the changeset stays proposed (Execute refuses such rows first: NotLoaded); it is still
    // an InvalidOperationException, so Ghost's and Promote's pre-checks read it as before. Two types of the name, or no TypeName, still decline.
    private const string NoTypeName = "gap: no type name — Sentinel never takes the model's first type; re-propose with a TypeName";

    /// <param name="curtainOk">MA-6-5 (D4): a create may place a curtain type (its grid from the type) — only the create loop and NotLoaded's
    /// create branch pass it; a retype (RetypeTarget) and Ghost stay basic, so no retype ever turns a basic wall into a curtain wall.</param>
    internal static WallType ResolveWallType(Document doc, string typeName, bool curtainOk = false)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var named = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
            .Where(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)).ToList();
        if (named.FirstOrDefault(t => t.Kind == WallKind.Basic) is WallType basic) return basic;
        if (curtainOk && named.FirstOrDefault(t => t.Kind == WallKind.Curtain) is WallType cw) return cw;
        // MA-6 fix-b1 (review): a curtain or stacked type of the name IS loaded — loading cannot help, so it stays a decline (NotLoaded skips it).
        if (named.Count > 0)
            throw new InvalidOperationException(curtainOk
                ? $"wall type \"{typeName}\" is a {named[0].Kind.ToString().ToLowerInvariant()} type — Sentinel places basic and curtain walls only; re-propose with a basic or curtain wall type"
                : $"wall type \"{typeName}\" is a {named[0].Kind.ToString().ToLowerInvariant()} type — Sentinel places basic walls only; re-propose with a basic wall type");
        throw new PlacementRefused($"wall type \"{typeName}\" does not exist in this model — load it (Sentinel creates no types), or re-propose with the exact name of a loaded type");
    }

    // MA-1a step 2: a floor's type among the model's FLOOR types only — a foundation slab type of the same name is another
    // thing (OfClass(FloorType) holds both) — and, as CreateType does, more than one is a person's decision.
    internal static FloorType ResolveFloorType(Document doc, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var hits = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>()
            .Where(t => !t.IsFoundationSlab && string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)).ToList();
        if (hits.Count == 0) throw new PlacementRefused($"floor type \"{typeName}\" does not exist in this model — load it (Sentinel creates no types), or re-propose with the exact name of a loaded type");
        if (hits.Count > 1) throw new InvalidOperationException($"{hits.Count} floor types are named \"{typeName}\" in this model — a person decides");
        return hits[0];
    }

    /// MA-1: the walls a door or window may be hosted by — Basic, not a stacked member, straight — with each one's plan line
    /// (mm) for PlacementGeometry.Host, and every other wall with a location line (one of those near the point is a refusal).
    /// Also Ghost's planner (GhostChangesetBuild), which checks a DWG opening before it is filed.
    internal static (List<Wall> Hosts, List<Wall> Odd, List<(string Label, string Level, double X0, double Y0, double X1, double Y1)> Lines) HostWalls(Document doc)
    {
        var walls = new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>().Where(w => w.Location is LocationCurve).ToList();
        bool Plain(Wall w) => w.WallType.Kind == WallKind.Basic && !w.IsStackedWallMember && ((LocationCurve)w.Location).Curve is Line;
        var hosts = walls.Where(Plain).ToList();
        var lines = hosts.Select(w =>
        {
            var c = ((LocationCurve)w.Location).Curve;
            XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1);
            return ("wall " + w.Id.IdValue(), (doc.GetElement(w.LevelId) as Level)?.Name, a.X / MmToFeet, a.Y / MmToFeet, b.X / MmToFeet, b.Y / MmToFeet);
        }).ToList();
        return (hosts, walls.Where(w => !Plain(w)).ToList(), lines);
    }

    /// A wall of <paramref name="odd"/> on the level whose location curve passes within HostTolMm of (x, y) mm, or null.
    internal static Wall OddNear(IEnumerable<Wall> odd, ElementId levelId, double xMm, double yMm) => odd.FirstOrDefault(w =>
    {
        var c = ((LocationCurve)w.Location).Curve;
        return w.LevelId.Equals(levelId)
               && c.Distance(new XYZ(xMm * MmToFeet, yMm * MmToFeet, c.GetEndPoint(0).Z)) <= PlacementGeometry.HostTolMm * MmToFeet;
    });

    /// MA-1: the one loaded type of a category a create names — by exact name, and by family for a door or window. None → load
    /// it (Sentinel loads no families and creates no types); more than one → a person decides. System family names are never
    /// compared (translated in non-English Revit): a roof or ceiling names its type only. RetypeTarget stays Promote's.
    internal static ElementType CreateType(Document doc, BuiltInCategory bic, string kind, string familyName, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var hits = new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>()
            .Where(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)
                        && (familyName == null || t is FamilySymbol s && string.Equals(s.FamilyName, familyName, StringComparison.OrdinalIgnoreCase)))
            .ToList();
        var label = familyName == null ? typeName : familyName + " : " + typeName;
        if (hits.Count == 0) throw new PlacementRefused($"{kind} type \"{label}\" does not exist in this model — load it (Sentinel loads no families and creates no types), or re-propose with the exact name of a loaded type");
        if (hits.Count > 1) throw new InvalidOperationException($"{hits.Count} {kind} types are named \"{label}\" in this model — a person decides");
        return hits[0];
    }

    /// MA-8-10 (amendment 15): the one loaded stair type a stair create names, by family and name - Stairs types are element types of OST_Stairs. None: not
    /// loaded (PlacementRefused - the model's state; Manage > Transfer Project Standards brings the office's Stairs types in); more than one: a person decides;
    /// one that is not a StairsType is a sketch (legacy) stair type - Sentinel builds component stairs only (declined, in words: the plan named it).
    internal static ElementType StairsTypeOf(Document doc, string familyName, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName) || string.IsNullOrWhiteSpace(familyName)) throw new InvalidOperationException(NoTypeName);
        var hits = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Stairs).WhereElementIsElementType().Cast<ElementType>()
            .Where(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase) && string.Equals(t.FamilyName, familyName, StringComparison.OrdinalIgnoreCase))
            .ToList();
        var label = familyName + " : " + typeName;
        if (hits.Count == 0) throw new PlacementRefused($"stair type \"{label}\" does not exist in this model — Manage ▸ Transfer Project Standards (Stairs types) from the office template; Sentinel creates no types");
        if (hits.Count > 1) throw new InvalidOperationException($"{hits.Count} stair types are named \"{label}\" in this model — a person decides");
        if (!(hits[0] is Arch.StairsType)) throw new InvalidOperationException($"stair type \"{label}\" is a sketch (legacy) stair type — Sentinel builds component stairs only");
        return hits[0];
    }

    /// MA-1: a roof's or ceiling's outline (mm; the bridge checked it is one simple loop) as lines at zFt; a closing point equal
    /// to the first is dropped, as the bridge's outlineProblem reads it.
    private static List<Curve> Outline(double[][] b, double zFt, string what)
    {
        var n = b?.Length ?? 0;
        if (n > 3 && b[0][0] == b[n - 1][0] && b[0][1] == b[n - 1][1]) n--;
        if (n < 3) throw new InvalidOperationException($"{what}: its Boundary needs at least 3 points");
        XYZ P(int i) => new XYZ(b[i][0] * MmToFeet, b[i][1] * MmToFeet, zFt);
        return Enumerable.Range(0, n).Select(i => (Curve)Line.CreateBound(P(i), P((i + 1) % n))).ToList();
    }

    /// MA-6-3: two curves with the same ends in plan (1 mm, either way round) — a roof's footprint line and the Boundary edge it was made from.
    private static bool SameEnds(Curve a, Curve b)
    {
        bool Near(XYZ p, XYZ q) => Math.Abs(p.X - q.X) <= MmToFeet && Math.Abs(p.Y - q.Y) <= MmToFeet;
        XYZ a0 = a.GetEndPoint(0), a1 = a.GetEndPoint(1), b0 = b.GetEndPoint(0), b1 = b.GetEndPoint(1);
        return (Near(a0, b0) && Near(a1, b1)) || (Near(a0, b1) && Near(a1, b0));
    }

    /// MA-6-3: does a floor's planar top face hold the point in plan (its edges tessellated, PlacementGeometry.Holds)? A floor whose top
    /// is not planar holds nothing here: its opening is a person's.
    private static bool Holds(Floor f, XYZ p)
    {
        foreach (var r in HostObjectUtils.GetTopFaces(f))
        {
            if (!(f.GetGeometryObjectFromReference(r) is PlanarFace top)) continue;
            var segments = new List<(double, double, double, double)>();
            foreach (EdgeArray loop in top.EdgeLoops)
                foreach (Edge e in loop)
                {
                    var pts = e.Tessellate();
                    for (var k = 1; k < pts.Count; k++) segments.Add((pts[k - 1].X, pts[k - 1].Y, pts[k].X, pts[k].Y));
                }
            if (PlacementGeometry.Holds(segments, p.X, p.Y)) return true;
        }
        return false;
    }

    /// MA-1: a create's Mark (ALL_MODEL_MARK), when it carries one (the bridge refuses one on a level or grid).
    private static void SetMark(Element e, ChangesetElementDto el)
    {
        if (!string.IsNullOrWhiteSpace(el.Place?.Mark)) Set(e, BuiltInParameter.ALL_MODEL_MARK, el.Place.Mark, el.Kind);
    }

    /// A level named exactly (case-insensitive, as ResolveLevel reads a LevelName); blank or missing fails. MA-6-3 (amendment 1): a
    /// missing one keeps the changeset proposed (PlacementRefused), as ResolveLevel's does. MA-6 fix-b1 (F-1): ResolveLevel's words, which fit
    /// every source — an agent's changeset is not Promote's.
    private static Level LevelNamed(Document doc, string name)
    {
        var n = name?.Trim();
        if (string.IsNullOrEmpty(n)) throw new InvalidOperationException("attach needs a BaseLevel and a TopLevel");
        return new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
                   .FirstOrDefault(l => string.Equals(l.Name, n, StringComparison.OrdinalIgnoreCase))
               ?? throw new PlacementRefused($"level \"{n}\" does not exist in this model — apply the changeset that creates it first, or propose again with the level in the changeset or naming a level this model has (Promote: run it again); nothing was placed, and this one stays proposed");
    }

    /// The existing wall a retype/attach names by UniqueId.
    private static Wall TargetWall(Document doc, ChangesetElementDto el)
    {
        var uid = el.Target?.UniqueId;
        if (string.IsNullOrWhiteSpace(uid)) throw new InvalidOperationException($"{el.Op} \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\" names no wall");
        return doc.GetElement(uid) as Wall
               ?? throw new InvalidOperationException($"wall {uid} is not in this model — re-run Promote");
    }

    /// The existing element a retype names by UniqueId, of the category its kind says (a door ghost never retypes a wall).
    private static Element Target(Document doc, ChangesetElementDto el)
    {
        var uid = el.Target?.UniqueId;
        if (string.IsNullOrWhiteSpace(uid)) throw new InvalidOperationException($"{el.Op} \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\" names no element");
        var e = doc.GetElement(uid) ?? throw new InvalidOperationException($"{el.Kind} {uid} is not in this model — re-run Promote");
        // MA-8-7 (batch-3 amendment 1): through TryClassOf - a column or beam is a structure kind, not one of Classes' six
        if (el.Kind == null || !PromoteWallsPlanner.TryClassOf(el.Kind, out var cls) || e.Category == null
            || !e.Category.MatchesCategoryKey(cls.Category) || (el.Kind == "wall" && e is not Wall))
            throw new InvalidOperationException($"{uid} is not a {el.Kind} — re-run Promote");
        return e;
    }

    /// MA-2c: the TYPE a set_parameter names by UniqueId — of its kind's category, and still the type the plan named (a renamed or
    /// replaced type fails the changeset, as a retype's type_before does).
    private static ElementType ParamTarget(Document doc, ChangesetElementDto el)
    {
        var uid = el.Target?.UniqueId;
        var t = (string.IsNullOrWhiteSpace(uid) ? null : doc.GetElement(uid)) as ElementType
                ?? throw new InvalidOperationException($"set_parameter: type {uid} is not in this model — re-run Promote");
        var named = el.Place?.FamilyName != null ? el.Place.FamilyName + " : " + el.Place.TypeName : el.Place?.TypeName;
        if (el.Kind == null || !PromoteWallsPlanner.Classes.TryGetValue(el.Kind, out var cls) || t.Category == null || !t.Category.MatchesCategoryKey(cls.Category)
            || !string.Equals(TypeLabel(t), named, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"set_parameter: {uid} is \"{TypeLabel(t)}\", not the {el.Kind} type \"{named}\" the plan named — re-run Promote");
        return t;
    }

    /// "Family : Type" for a loadable family's type, the name otherwise — what the planner wrote as type_before.
    internal static string TypeLabel(ElementType t) => t is FamilySymbol s ? s.FamilyName + " : " + s.Name : t.Name;

    /// The one type a retype names: walls as MA-0 (ResolveWallType); otherwise of the element's own type's category and class,
    /// by exact name (and family, for a FamilySymbol). None → "load it (Sentinel creates no types)"; more than one → a person
    /// decides. Also the command's preflight. System family names are never compared (they are translated in non-English Revit).
    internal static ElementType RetypeTarget(Document doc, Element e, string kind, string familyName, string typeName)
    {
        if (kind == "wall") return ResolveWallType(doc, typeName);
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var cur = doc.GetElement(e.GetTypeId()) as ElementType
                  ?? throw new InvalidOperationException($"{kind} {e.UniqueId} has no type Sentinel can read");
        var hits = new FilteredElementCollector(doc).OfCategoryId(cur.Category.Id).WhereElementIsElementType().Cast<ElementType>()
            .Where(t => t.GetType() == cur.GetType() && string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)
                        && (t is not FamilySymbol s || string.Equals(s.FamilyName, familyName, StringComparison.OrdinalIgnoreCase)))
            .ToList();
        string label = familyName == null ? typeName : familyName + " : " + typeName;
        if (hits.Count == 0) throw new PlacementRefused($"{kind} type \"{label}\" does not exist in this model — load it (Sentinel creates no types), or propose again with a loaded type (Promote: run it again)");
        if (hits.Count > 1) throw new InvalidOperationException($"{hits.Count} {kind} types are named \"{label}\" in this model — a person decides");
        return hits[0];
    }

    /// A door's or window's TYPE Width and Height in mm: the generic built-in first, then the category's (which one a concept
    /// family uses is owed live, B35-10); null = neither is a type parameter (an instance-sized family).
    internal static (double? W, double? H) TypeSize(ElementType t, string kind) =>
        (TypeMm(t, BuiltInParameter.FAMILY_WIDTH_PARAM, kind == "door" ? BuiltInParameter.DOOR_WIDTH : BuiltInParameter.WINDOW_WIDTH),
         TypeMm(t, BuiltInParameter.FAMILY_HEIGHT_PARAM, kind == "door" ? BuiltInParameter.DOOR_HEIGHT : BuiltInParameter.WINDOW_HEIGHT));

    private static double? TypeMm(ElementType t, params BuiltInParameter[] bips)
    {
        foreach (var bip in bips)
            if (t?.get_Parameter(bip) is { HasValue: true } p && p.StorageType == StorageType.Double) return p.AsDouble() / MmToFeet;
        return null;
    }

    /// Promote v1's holds, again on the model as it is at Apply (the planner read facts a person may have edited since; a
    /// changeset's source is the caller's own label): why a floor, roof, ceiling, door or window retype must not run, or null.
    /// Walls keep MA-0's checks. A retype never moves a face (the same build-up, 0.5 mm) or resizes an opening (a door: the
    /// target's type name carries the concept type's exact Width x Height, DR-1; a window: the target type's own), and never
    /// touches a group member, a design option, a structural floor, or a door or window no wall hosts. Also the preflight.
    internal static string Unsafe(Element e, string kind, ElementType cur, ElementType nt)
    {
        string what = $"{kind} {e.UniqueId}";
        if (kind == "wall")
        {
            // MA-2a (review C3): a wall retype never moves a face either. Promote names a type at the wall's own width, so its retypes
            // pass; a retype the bridge typed from a poster's facts (full contract 2) carries a CLAIMED thickness, and this is the one
            // check that sees it. Nothing else about a wall is checked here, as before (MA-0's holds are the planner's).
            if (cur is WallType cw && nt is WallType nw && cw.Kind == WallKind.Basic && nw.Kind == WallKind.Basic && Math.Abs(nw.Width - cw.Width) > TolFt)
                return $"\"{nt.Name}\" is {Mm(nw.Width / MmToFeet)} mm thick, {what} is {Mm(cw.Width / MmToFeet)} mm — a retype would move a face; a person decides";
            return null;
        }
        if (e.GroupId != ElementId.InvalidElementId) return what + " is in a group — Sentinel does not edit group members";
        if (e.DesignOption != null) return what + " is in a design option — Sentinel does not edit design options";
        if (kind == "floor" && e.get_Parameter(BuiltInParameter.FLOOR_PARAM_IS_STRUCTURAL)?.AsInteger() == 1)
            return what + " is structural — Promote v1 does not retype structure; a person decides";
        if (kind is "column" or "beam")
        {
            // MA-8-7: a structural retype never changes the section. The target's type name carries the section the plan measured
            // (TrySection, 0.5 mm), or it is the type the element already has by name (a steel shape in another family).
            if (!(e is FamilyInstance sfi)) return what + " is not a family instance — a person decides";
            if (StructureHold(sfi, kind) is string hold) return $"{what} is {hold} — a person decides";
            var (sw, sd, _) = SectionOf(sfi, kind);
            // review: the name stands in only where no rectangle was read (a steel shape); a measured section must agree with the target's own name
            bool byName = !(sw.HasValue && sd.HasValue) && cur != null && string.Equals(nt.Name, cur.Name, StringComparison.OrdinalIgnoreCase);
            bool bySection = sw.HasValue && sd.HasValue && TypeNameParse.TrySection(nt.Name, out var tw, out var td) && Math.Abs(tw - sw.Value) <= 0.5 && Math.Abs(td - sd.Value) <= 0.5;
            if (!byName && !bySection)
                return $"{what} reads {(sw.HasValue && sd.HasValue ? Mm(sw.Value) + " x " + Mm(sd.Value) + " mm" : "no rectangular section")}, \"{nt.Name}\" is " +
                       $"{(TypeNameParse.TrySection(nt.Name, out var nw2, out var nh2) ? Mm(nw2) + " x " + Mm(nh2) + " mm by its name" : "not sized by its name")} — a retype would change its section; a person decides";
            return null;
        }
        if ((cur as HostObjAttributes)?.GetCompoundStructure() is CompoundStructure was)
        {
            var now = (nt as HostObjAttributes)?.GetCompoundStructure();
            if (now == null || Math.Abs(now.GetWidth() - was.GetWidth()) > TolFt)
                return $"\"{nt.Name}\" {(now == null ? "has no build-up" : "is " + Mm(now.GetWidth() / MmToFeet) + " mm thick")}, " +
                       $"{what} is {Mm(was.GetWidth() / MmToFeet)} mm — a retype would move a face; a person decides";
        }
        if (kind is "door" or "window")
        {
            if ((e as FamilyInstance)?.Host is not Wall) return what + " is not hosted by a wall — a person decides";
            var (w, h) = TypeSize(cur, kind);
            double? tw = null, th = null;
            if (kind == "window") (tw, th) = TypeSize(nt, kind);
            else if (TypeNameParse.TrySection(nt.Name, out var nw, out var nh)) { tw = nw; th = nh; }
            if (!(w.HasValue && h.HasValue && tw.HasValue && th.HasValue && Math.Abs(w.Value - tw.Value) <= 0.001 && Math.Abs(h.Value - th.Value) <= 0.001))
                return $"{what} is {Size(w, h)}, \"{TypeLabel(nt)}\" is {Size(tw, th)}{(kind == "door" ? " by its name" : "")} — the swap would resize it; a person decides";
        }
        return null;
    }

    private static string Mm(double mm) => mm.ToString("0.#", CultureInfo.InvariantCulture);
    private static string Size(double? w, double? h) => w.HasValue && h.HasValue ? $"{Mm(w.Value)} x {Mm(h.Value)} mm" : "not sized by its type";

    // A parameter that is missing, read-only or refuses the value fails the changeset: attach lands as reviewed or not at all.
    private static void Set(Element e, BuiltInParameter bip, ElementId v, string kind = "wall")
    {
        var p = e.get_Parameter(bip);
        if (p == null || p.IsReadOnly || !p.Set(v)) throw new InvalidOperationException($"could not set {bip} on {kind} {e.UniqueId}");
    }

    private static void Set(Element e, BuiltInParameter bip, double v, string kind = "wall")
    {
        var p = e.get_Parameter(bip);
        if (p == null || p.IsReadOnly || !p.Set(v)) throw new InvalidOperationException($"could not set {bip} on {kind} {e.UniqueId}");
    }

    private static void Set(Element e, BuiltInParameter bip, int v, string kind)
    {
        var p = e.get_Parameter(bip);
        if (p == null || p.IsReadOnly || !p.Set(v)) throw new InvalidOperationException($"could not set {bip} on {kind} {e.UniqueId}");
    }

    private static void Set(Element e, BuiltInParameter bip, string v, string kind)
    {
        var p = e.get_Parameter(bip);
        if (p == null || p.IsReadOnly || !p.Set(v)) throw new InvalidOperationException($"could not set {bip} on {kind} {e.UniqueId}");
    }

    /// <summary>MA-8-7 (batch-3 amendment 7): why a structural column or beam is not Sentinel's to retype - words, or null. Framing whose structural type is
    /// not Beam (braces, purlins), a curved or unlocated member, a slanted column, a nested (truss) member and an in-place family. The plan's read
    /// (Commands.PromoteWalls.OtherFact) and Unsafe (the preflight and Apply) judge alike.</summary>
    internal static string StructureHold(FamilyInstance fi, string kind)
    {
        if (fi.SuperComponent != null) return "a nested component (a truss member) — its parent family decides its type";
        if (fi.Symbol?.Family?.IsInPlace == true) return "an in-place family - a person re-creates it";
        if (kind == "beam")
        {
            if (fi.StructuralType != StructuralType.Beam) return $"framing of structural type {fi.StructuralType} (a brace or purlin)";
            if (!(fi.Location is LocationCurve lc) || lc.Curve == null || !(lc.Curve is Line)) return "a curved or unlocated member";
        }
        else if (fi.IsSlantedColumn) return "a slanted column";
        return null;
    }

    /// <summary>MA-8-7 (amendment 7): a structural column's or beam's rectangular section in mm, read from its ORIGINAL geometry (before joins and cuts:
    /// <c>FamilyInstance.GetOriginalGeometry</c>, Fine, every version - a joined or cut instance fails a volume test on its instance solids). A column's
    /// W x D are its extents along the instance's own X and Y (GetTransform), a beam's across its axis (horizontal) and in Z, its length the solid's own
    /// extent along the axis (a cutback or extension counts, not the LocationCurve's length). Why is set, and W and D null, when the solids are not one
    /// rectangular prism (volume within 2 % of W x D x length) - a steel shape or a profile is typed by its name. ponytail: the solids' extents, not the
    /// family's parameters (their names differ by family and language); verify live on the structural samples (F-2).</summary>
    internal static (double? W, double? D, string Why) SectionOf(FamilyInstance fi, string kind)
    {
        const string notRect = "a section that is not a rectangle (a steel shape or a profile) — by its type name only";
        try
        {
            // review: GetOriginalGeometry is in the FamilySymbol's frame, not the instance's - moved into the instance's frame (GetTransform), so a
            // rotated column or a beam off the world X axis is measured along its own axes, as the axes below are the instance's.
            var ge = fi.GetOriginalGeometry(new Options { DetailLevel = ViewDetailLevel.Fine })?.GetTransformed(fi.GetTransform());
            if (ge == null) return (null, null, "no original geometry was read");
            var solids = new List<Solid>();
            foreach (var go in ge)
            {
                if (go is GeometryInstance gi) { foreach (var g2 in gi.GetInstanceGeometry()) if (g2 is Solid s2 && s2.Volume > 1e-9) solids.Add(s2); }
                else if (go is Solid s && s.Volume > 1e-9) solids.Add(s);
            }
            if (solids.Count == 0) return (null, null, "no solid was read");
            XYZ u, v, a; // the two section axes and the axis of the member (all unit)
            if (kind == "beam")
            {
                var c = (fi.Location as LocationCurve)?.Curve;
                if (c == null || !c.IsBound) return (null, null, "no location line");
                a = (c.GetEndPoint(1) - c.GetEndPoint(0)).Normalize();
                u = XYZ.BasisZ.CrossProduct(a);
                if (u.GetLength() < 1e-6) return (null, null, "a vertical member"); // not a beam
                u = u.Normalize();
                v = a.CrossProduct(u).Normalize();
            }
            else
            {
                var tr = fi.GetTransform();
                u = tr.BasisX.Normalize(); v = tr.BasisY.Normalize(); a = tr.BasisZ.Normalize();
            }
            double u0 = double.MaxValue, u1 = double.MinValue, v0 = double.MaxValue, v1 = double.MinValue, a0 = double.MaxValue, a1 = double.MinValue, vol = 0;
            foreach (var s in solids)
            {
                vol += s.Volume;
                foreach (Edge ed in s.Edges)
                    foreach (var p in new[] { ed.AsCurve().GetEndPoint(0), ed.AsCurve().GetEndPoint(1) })
                    {
                        double pu = p.DotProduct(u), pv = p.DotProduct(v), pa = p.DotProduct(a);
                        u0 = Math.Min(u0, pu); u1 = Math.Max(u1, pu); v0 = Math.Min(v0, pv); v1 = Math.Max(v1, pv); a0 = Math.Min(a0, pa); a1 = Math.Max(a1, pa);
                    }
            }
            double w = u1 - u0, d = v1 - v0, len = a1 - a0;
            if (!(w > 0 && d > 0 && len > 0) || Math.Abs(vol - w * d * len) > 0.02 * w * d * len) return (null, null, notRect);
            return (w / MmToFeet, d / MmToFeet, null);
        }
        catch (Exception ex) { return (null, null, "the section could not be read: " + ex.Message); }
    }

    /// <summary>MA-8-7 (D16, R12): may a create that replaces <paramref name="uid"/> delete it? <c>Why</c> is null when it may, else the reason in words (no
    /// subject - "the original ..."); <c>Refuse</c> is true when the element is not what Promote named (a DirectShape or a Generic Model instance, never
    /// a mass) - Apply then refuses the whole changeset, which stays proposed - and false when it is the model's state (gone, moved or edited since the
    /// plan read it, pinned or borrowed, or one whose delete takes more than itself and its tags) - Apply keeps it and says so. With
    /// <paramref name="probe"/> the delete is tried in a rolled-back SubTransaction (inside the open transaction - Apply only): the elements it would take.
    /// The planner's preflight does not probe (it has no transaction).</summary>
    internal static (string Why, bool Refuse, ElementId OldId, string OldUid, List<ElementId> Probe) ReplaceCheck(Document doc, string uid, double[] boxMin, double[] boxMax, bool probe)
    {
        var old = string.IsNullOrWhiteSpace(uid) ? null : doc.GetElement(uid);
        if (old == null) return ("the original is no longer in this model", false, null, null, null);
        bool direct = old is DirectShape;
        bool generic = old is FamilyInstance gfi && gfi.SuperComponent == null && !(gfi.Symbol?.Family?.IsInPlace ?? false)
                       && old.Category?.Id.IdValue() == (long)BuiltInCategory.OST_GenericModel;
        if (!direct && !generic)
            return ($"{uid} is {old.Category?.Name ?? "no category"} ({old.GetType().Name}), not a DirectShape or Generic Model - a create that replaces removes only those; re-run Promote", true, null, null, null);
        if (Sentinel.Commands.MassOnly.Is(old))
            return ($"{uid} is a mass (Sentinel's own, or in Mass) - Shell a Mass shells it, Promote never removes it; re-run Promote", true, null, null, null);
        var bb = old.get_BoundingBox(null);
        if (boxMin == null || boxMax == null || boxMin.Length < 3 || boxMax.Length < 3) return ($"{uid} was named with no box to compare - re-run Promote", true, null, null, null);
        if (bb == null || new[] { bb.Min.X, bb.Min.Y, bb.Min.Z }.Select((q, i) => Math.Abs(q / MmToFeet - boxMin[i])).Concat(new[] { bb.Max.X, bb.Max.Y, bb.Max.Z }.Select((q, i) => Math.Abs(q / MmToFeet - boxMax[i]))).Any(x => x > ReshapeTolMm))
            return ("the original was moved or edited since Promote read it", false, null, null, null);
        if (HeldBy(doc, old) is string held) return ("the original " + held, false, null, null, null);
        // review: the wrapper is not used after the probe's delete and roll-back (RevitAPI: a wrapper whose native object was destroyed is invalid) -
        // its id and UniqueId are taken first and returned instead of it.
        var oldId = old.Id;
        var oldUid = old.UniqueId;
        if (!probe) return (null, false, oldId, oldUid, null);
        ICollection<ElementId> ids;
        try { using (var sub = new SubTransaction(doc)) { sub.Start(); ids = doc.Delete(oldId); sub.RollBack(); } }
        catch (Exception ex) when (!(ex is PlacementRefused)) { return ($"the original cannot be removed - Revit refused: {ex.Message}", false, null, null, null); }
        var others = ids.Where(id => !id.Equals(oldId) && !(doc.GetElement(id) is IndependentTag)).ToList();
        if (others.Count > 0)
            return ($"the original cannot be removed alone - removing it would also remove {others.Count} other element(s) (" +
                    string.Join(", ", others.Take(3).Select(id => doc.GetElement(id)?.Category?.Name ?? "an element with no category")) + (others.Count > 3 ? ", ..." : "") + ")", false, null, null, null);
        return (null, false, oldId, oldUid, ids.ToList());
    }

    /// <summary>MA-8-7: the planner's preflight of a replacing create (no probe) - the reason a person decides, or null.</summary>
    internal static string ReplaceRefusal(Document doc, string uid, double[] boxMin, double[] boxMax)
    {
        var (why, _, _, _, _) = ReplaceCheck(doc, uid, boxMin, boxMax, probe: false);
        return why;
    }

    private static bool IsCreate(ChangesetElementDto e) => e.Op is null or "create";

    /// <summary>MA-5b-5 (design review R2): no wall hosts it — no host, or a Level (a level-based family's Host is its level), a reference
    /// plane or a sketch plane (work-plane based). The one predicate Promote's read, its preflight and Apply share; a real non-wall host
    /// (a roof's skylight) is not this.</summary>
    internal static bool NoWallHost(FamilyInstance fi) => fi.Host == null || fi.Host is Level || fi.Host is ReferencePlane || fi.Host is SketchPlane;

    /// <summary>MA-5b-5 (R5): a family that goes into a wall — GhostChangesetBuild's test: one-level-based hosted, hosting a wall (or not said).</summary>
    internal static bool WallHosted(FamilySymbol s)
    {
        var by = s.Family.get_Parameter(BuiltInParameter.FAMILY_HOSTING_BEHAVIOR)?.AsInteger();
        return s.Family.FamilyPlacementType == FamilyPlacementType.OneLevelBasedHosted && (by == null || by == 1);
    }

    /// <summary>MA-5b-5: why a rehost's type cannot be placed — not loaded exactly (CreateType's words), or not wall-hosted — or null. Promote's
    /// preflight holds what Apply would refuse.</summary>
    internal static string RehostRefusal(Document doc, string kind, string familyName, string typeName)
    {
        FamilySymbol s;
        try { s = (FamilySymbol)CreateType(doc, kind == "window" ? BuiltInCategory.OST_Windows : BuiltInCategory.OST_Doors, kind, familyName, typeName); }
        catch (InvalidOperationException ex) { return ex.Message; }
        return WallHosted(s) ? null : $"\"{TypeLabel(s)}\" is not a wall-hosted family — a person picks a wall-hosted {kind} type";
    }

    /// <summary>MA-6 fix-b1 (F-2, F-3): the rows — creates, retypes and rehosts — whose type this model does not hold: the answer of the very
    /// lookup Apply runs for the row's kind (ResolveWallType, ResolveFloorType, CreateType, RetypeTarget: their PlacementRefused), each distinct
    /// type asked once. Read-only. Any other refusal (no TypeName, two types of the name, a retype's element gone) is not this — Apply says it.
    /// The review window reads it when it opens; Execute refuses the ticked ones before its transaction.</summary>
    internal static HashSet<string> NotLoaded(Document doc, IEnumerable<ChangesetElementDto> rows)
    {
        var missing = new HashSet<string>(StringComparer.Ordinal);
        var asked = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        foreach (var el in rows ?? Enumerable.Empty<ChangesetElementDto>())
        {
            var p = el?.Place;
            if (el?.ProposalGuid == null || p == null) continue;
            Func<ElementType> pick = null;
            var scope = "";
            if (el.Op == "retype")
            {
                // Review: Execute's own order — its target of the kind's category (Target), a readable type, still the type_before the plan saw;
                // a row failing any of those is declined by Apply in its own words before the lookup, so it is not "not loaded".
                Element e;
                try { e = Target(doc, el); } catch (InvalidOperationException) { continue; }
                if (!(doc.GetElement(e.GetTypeId()) is ElementType cur)
                    || el.Target.TypeBefore != null && !string.Equals(TypeLabel(cur), el.Target.TypeBefore, StringComparison.OrdinalIgnoreCase)) continue;
                pick = () => RetypeTarget(doc, e, el.Kind, p.FamilyName, p.TypeName);
                // RetypeTarget's answer for a non-wall depends on the target type's category and class too
                if (el.Kind != "wall") scope = $"{cur.Category?.Id.IdValue()}|{cur.GetType().Name}";
            }
            else if (IsCreate(el) || el.Op == "rehost") // Execute's own call for each kind (a rehost places a door or window)
                pick = el.Kind switch
                {
                    "wall" => () => ResolveWallType(doc, p.TypeName, curtainOk: true), // MA-6-5: a wall here is a create (Execute's own call)
                    "floor" => () => ResolveFloorType(doc, p.TypeName),
                    "roof" => () => CreateType(doc, BuiltInCategory.OST_Roofs, "roof", null, p.TypeName),
                    "ceiling" => () => CreateType(doc, BuiltInCategory.OST_Ceilings, "ceiling", null, p.TypeName),
                    "door" => () => CreateType(doc, BuiltInCategory.OST_Doors, "door", p.FamilyName, p.TypeName),
                    "window" => () => CreateType(doc, BuiltInCategory.OST_Windows, "window", p.FamilyName, p.TypeName),
                    "column" => () => CreateType(doc, BuiltInCategory.OST_Columns, "column", p.FamilyName, p.TypeName),
                    "furniture" => () => CreateType(doc, BuiltInCategory.OST_Furniture, "furniture", p.FamilyName, p.TypeName),
                    "beam" => () => CreateType(doc, BuiltInCategory.OST_StructuralFraming, "beam", p.FamilyName, p.TypeName),
                    "stair" => () => StairsTypeOf(doc, p.FamilyName, p.TypeName), // MA-8-10
                    _ => null, // a level, grid, room, opening or mass (MA-6-6) names no type
                };
            if (pick == null) continue;
            var key = $"{el.Op}|{el.Kind}|{p.FamilyName}|{p.TypeName}|{scope}";
            if (!asked.TryGetValue(key, out var gone))
            {
                try { pick(); gone = false; }
                catch (PlacementRefused) { gone = true; }
                catch (Exception) { gone = false; } // another refusal — Apply says it in its own words
                asked[key] = gone;
            }
            if (gone) missing.Add(el.ProposalGuid);
        }
        return missing;
    }

    /// <summary>MA-5b-5 (R8): a person's "do not touch", or what this user cannot edit here — words ("is pinned"), or null: pinned, in a group,
    /// in a design option, borrowed by another user, changed or deleted in central since the last reload (App's NotFixableHere test).</summary>
    internal static string HeldBy(Document doc, Element e)
    {
        if (e.Pinned) return "is pinned";
        if (e.GroupId != null && !e.GroupId.Equals(ElementId.InvalidElementId)) return "is in a group — Sentinel does not edit a group's members";
        if (e.DesignOption != null) return "is in a design option";
        if (!doc.IsWorkshared) return null;
        if (WorksharingUtils.GetCheckoutStatus(doc, e.Id) == CheckoutStatus.OwnedByOtherUser) return "is borrowed by another user";
        var u = WorksharingUtils.GetModelUpdatesStatus(doc, e.Id);
        return u == ModelUpdatesStatus.UpdatedInCentral || u == ModelUpdatesStatus.DeletedInCentral ? "was changed in central — Reload Latest, then run Promote again" : null;
    }

    /// <summary>MA-5b-5 (R9): a door or window already in the host wall across the new one's span (a window over a window: its sill-to-head
    /// too) — the placeholder may be a leftover, or two rehosts meet; words, or null. A door's size is its type name's (DR-1), else its own.</summary>
    private static string Overlap(Document doc, Wall wall, double[] p, ChangesetElementDto el, FamilySymbol sym)
    {
        if (!(((LocationCurve)wall.Location).Curve is Line line)) return null;
        XYZ a = line.GetEndPoint(0), d = line.Direction;
        double Along(double xMm, double yMm) => (xMm * MmToFeet - a.X) * d.X + (yMm * MmToFeet - a.Y) * d.Y;
        (double? W, double? H) Size(FamilySymbol s, string kind) =>
            TypeNameParse.TrySection(s.Name, out var nw, out var nh) ? (nw, nh) : TypeSize(s, kind);
        var (w, h) = Size(sym, el.Kind);
        double at = Along(p[0], p[1]), half = (w ?? 0) / 2 * MmToFeet, sill = el.Place.SillHeight ?? 0;
        foreach (var id in wall.FindInserts(false, false, false, false))
        {
            if (!(doc.GetElement(id) is FamilyInstance o) || !(o.Location is LocationPoint lp)) continue;
            string kind = o.Category?.Id.IdValue() == (long)BuiltInCategory.OST_Doors ? "door" : o.Category?.Id.IdValue() == (long)BuiltInCategory.OST_Windows ? "window" : null;
            if (kind == null) continue;
            var (ow, oh) = Size(o.Symbol, kind);
            if (Math.Abs(Along(lp.Point.X / MmToFeet, lp.Point.Y / MmToFeet) - at) >= half + (ow ?? 0) / 2 * MmToFeet) continue;
            // review (MA-5b-5): heights for every pair — a door stands from 0, a window from its sill
            if (h is double hh && oh is double ohh)
            {
                double ob = kind == "window" ? (o.get_Parameter(BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM)?.AsDouble() ?? 0) / MmToFeet : 0, nb = el.Kind == "window" ? sill : 0;
                if (nb >= ob + ohh || ob >= nb + hh) continue;
            }
            return $"would overlap {kind} {o.Id.IdValue()}, already in wall {wall.Id.IdValue()} across that point (the placeholder may be a leftover)";
        }
        return null;
    }

    /// <summary>MA-4f: a wall as Revit holds it — every face of its main solid (ClashManager.GetMainSolid: coarse, the largest; a wall carries no
    /// transform) as triangles, 9 numbers each in mm in Revit's internal frame (the frame Pt places in); PlacementGeometry.PackMesh rounds and caps
    /// it. Null with no element or no solid.</summary>
    private static double[] WallMesh(Element e)
    {
        var s = e == null ? null : ClashManager.GetMainSolid(e);
        if (s == null) return null;
        var mm = new List<double>();
        foreach (Face f in s.Faces)
        {
            var m = f.Triangulate();
            for (var i = 0; i < m.NumTriangles; i++)
            {
                var t = m.get_Triangle(i);
                for (var k = 0; k < 3; k++) { var p = t.get_Vertex(k); mm.Add(p.X / MmToFeet); mm.Add(p.Y / MmToFeet); mm.Add(p.Z / MmToFeet); }
            }
        }
        return PlacementGeometry.PackMesh(mm);
    }

    public ExecutionResult Execute(Document doc, ChangesetDto cs, HashSet<string> tickedGuids)
    {
        var result = new ExecutionResult();
        var toPlace = (cs.Elements ?? new List<ChangesetElementDto>())
            .Where(e => tickedGuids.Contains(e.ProposalGuid)).ToList();
        if (!toPlace.Any()) return result;
        // MA-1a item 6: never into a design option — refused before the transaction, for every source; the changeset stays
        // proposed (NotRun). A retype or an attach creates nothing, so it is not refused here. A retype of a floor, roof,
        // ceiling, door or window that is in an option is refused by Unsafe; a wall's is not (Unsafe keeps MA-0's checks
        // for walls — Promote's planner holds a wall in an option, an agent's changeset is not held: see Risks). MA-5b-5 (R7): a
        // rehost creates an element (and removes one from the main model), so it is refused like a create.
        if (toPlace.Any(e => IsCreate(e) || e.Op == "rehost") && PlacementApply.DesignOptionRefusal(doc, "apply it") is { } inOption)
            return new ExecutionResult { NotRun = true, Error = inOption };
        // MA-6 fix-b1 (F-2): a ticked row naming a type this model does not hold is the model's state, not a verdict on the changeset (C5's
        // rule, as a missing level) — refused before the transaction, every such row named, and the changeset stays proposed (NotRun). The
        // review window read the same answer when it opened (NotLoaded) and opened those rows unticked.
        var notLoaded = NotLoaded(doc, toPlace);
        if (notLoaded.Count > 0)
            return new ExecutionResult { NotRun = true, Error = ChangesetTrust.NotLoadedRefusal(toPlace.Where(e => notLoaded.Contains(e.ProposalGuid))) };

        // MA-8-10: a stair is built in Revit's own stair edit scope, which cannot start with a transaction open - so it branches off here, before the
        // changeset's transaction (RunChecked's TransactionGroup is open: one Undo entry). The bridge files a stair alone in its changeset.
        if (toPlace.Any(e => IsCreate(e) && e.Kind == "stair")) return ExecuteStair(doc, cs, toPlace);

        string at = null; // the element being placed when something throws — the refusal names it
        using var t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id)); // the undo watcher finds it by this name
        t.Start();
        // MA-1a step 2: Revit's commit-time failures go through the all-or-nothing rule — a warning is counted and left in the
        // model, any error rolls the whole changeset back (never Revit's modal dialog, never a person's "Delete Element(s)"
        // half-commit). Non-modal: the warnings Revit keeps are shown the ordinary, dismissable way. The global Doctor skips
        // this transaction (GhostFailurePolicy.DoctorSkips).
        var handler = GhostFailureHandler.AllOrNothingOn(t);
        try
        {
            // Levels first: walls/floors in the same changeset may target them by name.
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "level"))
            {
                at = Label(el);
                var lvl = Level.Create(doc, (el.Place?.BaseElevation ?? 0) * MmToFeet);
                lvl.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.Set(1); // MA-6-2: a storey for Stories(doc) and the LOD state (DatumBuilder's set)
                if (!string.IsNullOrWhiteSpace(el.Validate?.Identity?.Name)) lvl.Name = el.Validate.Identity.Name;
                Collect(result, el, lvl);
            }
            doc.Regenerate();

            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "grid"))
            {
                at = Label(el);
                var c = el.Place.LocationCurve;
                var grid = Grid.Create(doc, Line.CreateBound(Pt(c.Start), Pt(c.End)));
                if (!string.IsNullOrWhiteSpace(el.Validate?.Identity?.Name)) grid.Name = el.Validate.Identity.Name;
                Collect(result, el, grid);
            }

            // MA-8-7 (D16): a create that replaces a DirectShape or Generic Model. Before the creates, after the levels: each original is checked (ReplaceCheck - R12:
            // only a DirectShape or Generic Model, the box it stood in, not held, and a probe delete in a rolled-back SubTransaction that takes only itself and its tags).
            // What a person may have changed since Promote read it is KEPT as it stands and said - the create is not made, so no duplicate stands beside it; anything
            // that is not a DirectShape or Generic Model refuses the whole changeset (PlacementRefused: it stays proposed).
            var replaced = new Dictionary<string, (ElementId OldId, string Uid, List<ElementId> Probe)>(StringComparer.Ordinal);
            var notMade = new HashSet<string>(StringComparer.Ordinal);
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Replaces != null))
            {
                at = Label(el);
                var (why, refuse, oldId, oldUid, probe) = ReplaceCheck(doc, el.Replaces.UniqueId, el.Replaces.Box?.Min, el.Replaces.Box?.Max, probe: true);
                if (refuse) throw new PlacementRefused($"{at}: {why}");
                if (why != null)
                {
                    result.Kept.Add((el.ProposalGuid, $"{at}: {why} — not re-created; the original stays as it stands, a person decides"));
                    notMade.Add(el.ProposalGuid);
                    continue;
                }
                replaced[el.ProposalGuid] = (oldId, oldUid, probe);
            }

            // F-S2-2: read before this changeset's first wall exists — a level or grid above is no wall.
            var wallCreates = toPlace.Where(e => IsCreate(e) && e.Kind == "wall" && !notMade.Contains(e.ProposalGuid)).ToList();
            var existing = wallCreates.Count > 0 ? ExistingWalls(doc) : null;
            List<LevelFact> stories = null; // read once, when the first wall needs its top (after this changeset's levels exist)
            foreach (var el in wallCreates)
            {
                at = Label(el);
                var c = el.Place.LocationCurve;
                var level = ResolveLevel(doc, el.Place);
                // MA-6-5 (D4): a curtain type places a curtain wall, its grid from the type. Its Width (read below for the joins) is what Revit
                // gives a curtain type — drill C-1 watches the corners where curtain meets basic (R8).
                var wt = ResolveWallType(doc, el.Place.TypeName, curtainOk: true);
                // MA-1a item 3 (GHB-2): the base is BaseElevation, or the level itself (0 mm put a named level's wall at minus its
                // elevation). The top is TopElevation, unconnected, as reviewed; else the next Building Story above the base,
                // constrained there; on the top story, unconnected at the storey below's height (founder decision F2); else a
                // refusal in words — never a constant.
                var baseMm = el.Place.BaseElevation ?? level.Elevation / MmToFeet;
                Level topLevel = null;
                double topMm;
                if (el.Place.TopElevation is double sent) topMm = sent;
                else if (!string.IsNullOrWhiteSpace(el.Place.TopLevel))
                {
                    // Contract 2's TopLevel (F-MA2a-3): the top is constrained to the level the poster named, offset 0.
                    topLevel = LevelNamed(doc, el.Place.TopLevel);
                    topMm = topLevel.Elevation / MmToFeet;
                }
                else
                {
                    var top = PromoteWallsPlanner.WallTop(stories ??= Stories(doc), baseMm, level.Name, out var why)
                              ?? throw new InvalidOperationException($"wall \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\": {why}");
                    topMm = top.TopMm;
                    if (top.TopLevel != null) topLevel = LevelNamed(doc, top.TopLevel);
                }
                // An inverted/zero height is a broken proposal — fail the changeset honestly rather
                // than silently placing a coerced wall that doesn't match what was reviewed.
                if (topMm <= baseMm)
                    throw new InvalidOperationException($"wall \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\": TopElevation ({topMm}mm) must be above BaseElevation ({baseMm}mm)");
                var heightFt = (topMm - baseMm) * MmToFeet;
                var offsetFt = baseMm * MmToFeet - level.Elevation;
                // MA-1a step 2: a curved DWG wall carries a point on its arc (LocationCurve.mid).
                var curve = c.Mid != null ? (Curve)Arc.Create(Pt(c.Start), Pt(c.End), Pt(c.Mid)) : Line.CreateBound(Pt(c.Start), Pt(c.End));
                var wall = Wall.Create(doc, curve, wt.Id, level.Id, heightFt, offsetFt, false, false);
                if (topLevel != null)
                {
                    // Attach's own two parameters (MA-0, live on Revit 2024): the top follows the story level from now on.
                    Set(wall, BuiltInParameter.WALL_HEIGHT_TYPE, topLevel.Id);
                    Set(wall, BuiltInParameter.WALL_TOP_OFFSET, 0.0);
                }
                // F-S2-2 (founder): a new wall never joins a wall that was already in the model — disallowed on the NEW wall, at
                // each end that touches one, before any regeneration forms the join. Only Sentinel's own wall changes.
                foreach (var end in PlacementGeometry.EndsTouching(c.Start[0], c.Start[1], c.End[0], c.End[1], wt.Width / 2 / MmToFeet, baseMm, topMm, existing))
                    WallUtils.DisallowWallJoinAtEnd(wall, end);
                SetMark(wall, el);
                Collect(result, el, wall);
            }

            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "floor" && !notMade.Contains(e.ProposalGuid)))
            {
                at = Label(el);
                var level = ResolveLevel(doc, el.Place);
                var ft2 = ResolveFloorType(doc, el.Place.TypeName);
                var pts = el.Place.LocationLoop.Select(Pt).ToList();
                // Agents commonly close the ring explicitly (last point == first) — the wraparound
                // segment would then be zero-length and Line.CreateBound would throw, declining the
                // whole changeset over a legitimate polygon convention. Trim closure + consecutive dupes.
                if (pts.Count > 1 && pts[0].IsAlmostEqualTo(pts[pts.Count - 1])) pts.RemoveAt(pts.Count - 1);
                for (var i = pts.Count - 1; i > 0; i--)
                    if (pts[i].IsAlmostEqualTo(pts[i - 1])) pts.RemoveAt(i);
                if (pts.Count < 3)
                    throw new InvalidOperationException($"floor \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\": fewer than 3 distinct boundary points after removing duplicates");
                var loop = new CurveLoop();
                for (var i = 0; i < pts.Count; i++)
                    loop.Append(Line.CreateBound(pts[i], pts[(i + 1) % pts.Count]));
#if REVIT2022_OR_GREATER
                var floor = Floor.Create(doc, new List<CurveLoop> { loop }, ft2.Id, level.Id);
#else
                var arr = new CurveArray();
                foreach (var seg in loop) arr.Append(seg);
                var floor = doc.Create.NewFloor(arr, ft2, level, false);
#endif
                if (el.Place.Structural is bool st) Set(floor, BuiltInParameter.FLOOR_PARAM_IS_STRUCTURAL, st ? 1 : 0, "floor");
                SetMark(floor, el);
                Collect(result, el, floor);
            }

            // MA-8-7 (D16): the originals go, after the walls and floors that replace them exist, in the same transaction (one Undo restores each original and
            // removes the new element). A delete that takes anything but what the probe counted refuses the whole changeset; Revit's report is the ledger's
            // proof - RemovedUniqueId is set only now, after the count matched, and RemovedTags is the tags that went with it.
            foreach (var el in toPlace.Where(e => replaced.ContainsKey(e.ProposalGuid)))
            {
                at = Label(el);
                var (oldId, uid, probe) = replaced[el.ProposalGuid];
                var deleted = doc.Delete(oldId);
                if (deleted.Count != probe.Count || deleted.Any(id => !probe.Contains(id)))
                    throw new PlacementRefused($"{at}: deleting {uid} took {deleted.Count} element(s), its probe {probe.Count} - nothing was placed; re-run Promote");
                var entry = result.Applied.First(a => a.ProposalGuid == el.ProposalGuid);
                entry.RemovedTags = probe.Count - 1;
                entry.RemovedUniqueId = uid;
            }

            // MA-1: a roof on its level — NewFootPrintRoof; flat unless it carries Slopes (MA-6-3).
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "roof"))
            {
                at = Label(el);
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var level = ResolveLevel(doc, el.Place);
                var rt = CreateType(doc, BuiltInCategory.OST_Roofs, "roof", null, el.Place.TypeName) as RoofType
                         ?? throw new InvalidOperationException($"roof \"{name}\": \"{el.Place.TypeName}\" is not a roof type Sentinel can sketch");
                var arr = new CurveArray();
                var lines = Outline(el.Place.Boundary, level.Elevation, $"roof \"{name}\"");
                foreach (var c in lines) arr.Append(c);
                // The API reads this "out" array before filling it (the SDK sample creates it first): passed null, the call throws a
                // bare "Value cannot be null." (B35, live).
                var edges = new ModelCurveArray();
                var roof = doc.Create.NewFootPrintRoof(arr, level, rt, out edges);
                // MA-6-3: each footprint line is matched to its Boundary edge by its ends (1 mm, either way round). An edge the bridge sent a
                // slope for defines it (SlopeAngle is rise over run); every other edge defines none — a gable, or a flat roof as before.
                var slopes = el.Place.Slopes;
                var sloped = new List<(ModelCurve Mc, int Edge, double Deg)>();
                foreach (ModelCurve mc in edges)
                {
                    var i = slopes == null ? -1 : lines.FindIndex(l => SameEnds(l, mc.GeometryCurve));
                    var deg = i >= 0 && i < slopes.Count ? slopes[i] : null;
                    roof.set_DefinesSlope(mc, deg != null);
                    if (deg is double d) { roof.set_SlopeAngle(mc, Math.Tan(d * Math.PI / 180)); sloped.Add((mc, i, d)); }
                }
                if (slopes != null)
                {
                    var unmatched = Enumerable.Range(0, slopes.Count).Where(i => slopes[i] != null && !sloped.Any(s => s.Edge == i)).ToList();
                    // Review fix (C5's rule): Revit not holding a slope as sent is this Revit's state, not a verdict on the proposal —
                    // PlacementRefused rolls it back and the changeset stays proposed, to apply again once the add-in is fixed.
                    if (unmatched.Count > 0)
                        throw new PlacementRefused($"roof \"{name}\": Revit's footprint has no line on Boundary edge(s) {string.Join(", ", unmatched)} — their slope could not be set; nothing was placed, and this one stays proposed");
                    // Read back after a regeneration (risk R3, the API's slope unit) from the roof's top faces — never through SlopeAngle, which
                    // returns the number in the unit it was written in, so a wrong unit would read as sent. Each sent pitch needs a top face that pitch.
                    doc.Regenerate();
                    var pitches = HostObjectUtils.GetTopFaces(roof).Select(r => roof.GetGeometryObjectFromReference(r)).OfType<PlanarFace>()
                        .Select(f => Math.Acos(Math.Min(1, Math.Abs(f.FaceNormal.Z))) * 180 / Math.PI).ToList();
                    foreach (var (mc, i, d) in sloped)
                        if (!roof.get_DefinesSlope(mc) || !pitches.Any(a => Math.Abs(a - d) <= 0.1))
                            throw new PlacementRefused($"roof \"{name}\": Boundary edge {i} {(roof.get_DefinesSlope(mc) ? "" : "defines no slope after the set, and ")}no top face is pitched the {Mm(d)}° sent (they read {(pitches.Count == 0 ? "none" : string.Join(", ", pitches.Select(a => Mm(a) + "°")))}) — Revit did not take the slope; nothing was placed, and this one stays proposed");
                }
                if (el.Place.BaseOffset is double off) Set(roof, BuiltInParameter.ROOF_LEVEL_OFFSET_PARAM, off * MmToFeet, "roof");
                SetMark(roof, el);
                Collect(result, el, roof);
            }

            // MA-6-6 (MAS-2, D13): a mass — its Boundary extruded from BaseElevation to TopElevation as a DirectShape in Mass: no wall or floor
            // schedule rows, no IfcWall or IfcSlab. Asked before it is made: a Revit that refuses Mass for a DirectShape gets a Generic Model,
            // said on the result (Shell a Mass still takes it: MassOnly, amendment 11). Amendment 3: the elevations are in the Level.Elevation
            // frame (a level's BaseElevation's), so the solid's z0 is the nearest level's ProjectElevation plus the offset from that level.
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "mass"))
            {
                at = Label(el);
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                double baseMm = el.Place.BaseElevation ?? throw new InvalidOperationException($"mass \"{name}\" has no BaseElevation");
                double topMm = el.Place.TopElevation ?? throw new InvalidOperationException($"mass \"{name}\" has no TopElevation");
                if (topMm <= baseMm) throw new InvalidOperationException($"mass \"{name}\": TopElevation ({topMm}mm) must be above BaseElevation ({baseMm}mm)");
                var lvl = ResolveLevel(doc, new PlaceDto { BaseElevation = baseMm });
                var z0 = lvl.ProjectElevation + (baseMm * MmToFeet - lvl.Elevation);
                var cat = new ElementId(BuiltInCategory.OST_Mass);
                if (!DirectShape.IsValidCategoryId(cat, doc))
                {
                    cat = new ElementId(BuiltInCategory.OST_GenericModel);
                    result.MassAs = "Mass: placed as Generic Models — this Revit refuses a DirectShape in Mass (D13); Shell it still works";
                }
                var loop = CurveLoop.Create(Outline(el.Place.Boundary, z0, $"mass \"{name}\""));
                var solid = GeometryCreationUtilities.CreateExtrusionGeometry(new List<CurveLoop> { loop }, XYZ.BasisZ, (topMm - baseMm) * MmToFeet);
                var ds = DirectShape.CreateElement(doc, cat);
                ds.ApplicationId = "Sentinel"; // Shell a Mass's pick takes a Sentinel DirectShape whatever its category (MassOnly)
                ds.ApplicationDataId = el.ProposalGuid;
                ds.SetShape(new List<GeometryObject> { solid });
                ds.SetName(name);
                Collect(result, el, ds);
            }

            // MA-1: a ceiling at its height above the level (place.Offset, required by the bridge).
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "ceiling"))
            {
                at = Label(el);
#if REVIT2022_OR_GREATER
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var level = ResolveLevel(doc, el.Place);
                var ct = CreateType(doc, BuiltInCategory.OST_Ceilings, "ceiling", null, el.Place.TypeName);
                var off = el.Place.Offset ?? throw new InvalidOperationException($"ceiling \"{name}\" has no Offset (its height above {level.Name})");
                var loop = CurveLoop.Create(Outline(el.Place.Boundary, level.Elevation, $"ceiling \"{name}\""));
                var ceiling = Ceiling.Create(doc, new List<CurveLoop> { loop }, ct.Id, level.Id);
                Set(ceiling, BuiltInParameter.CEILING_HEIGHTABOVELEVEL_PARAM, off * MmToFeet, "ceiling");
                SetMark(ceiling, el);
                Collect(result, el, ceiling);
#else
                throw new InvalidOperationException("a ceiling create needs Revit 2022 or later — this Revit has no ceiling API");
#endif
            }

            // MA-1: doors and windows after every wall of this changeset (Regenerate first), so one may host on a wall it creates. The
            // host is the ONE straight basic wall on the named level under the point (PlacementGeometry.Host) — none or two is a
            // refusal in words, never a guess; so is a curtain, stacked or curved wall of that level passing the point too (the finder
            // cannot weigh it, so it may not be skipped). The symbol must be loaded; it is activated inside this transaction (Undo
            // deactivates it). The instance must land in that wall — a family that is not wall-hosted rolls the changeset back.
            var openings = toPlace.Where(e => IsCreate(e) && e.Kind is "door" or "window").ToList();
            if (openings.Count > 0)
            {
                doc.Regenerate();
                var (hosts, odd, lines) = HostWalls(doc);
                foreach (var el in openings)
                {
                    at = Label(el);
                    var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                    var level = ResolveLevel(doc, el.Place);
                    var p = el.Place.Location ?? throw new InvalidOperationException($"{el.Kind} \"{name}\" has no Location");
                    if (Math.Abs(p[2] * MmToFeet - level.Elevation) > TolFt)
                        throw new InvalidOperationException($"{el.Kind} \"{name}\": Location z {Mm(p[2])} mm is not {level.Name}'s elevation {Mm(level.Elevation / MmToFeet)} mm — a {el.Kind} stands on its level" + (el.Kind == "window" ? "; its sill is place.SillHeight" : ""));
                    var sym = (FamilySymbol)CreateType(doc, el.Kind == "door" ? BuiltInCategory.OST_Doors : BuiltInCategory.OST_Windows,
                                                       el.Kind, el.Place.FamilyName, el.Place.TypeName);
                    var near = OddNear(odd, level.Id, p[0], p[1]);
                    if (near != null)
                    {
                        var what = near.WallType.Kind == WallKind.Curtain ? "curtain" : near.WallType.Kind == WallKind.Stacked || near.IsStackedWallMember ? "stacked"
                                 : ((LocationCurve)near.Location).Curve is Line ? "non-basic" : "curved";
                        throw new InvalidOperationException($"{el.Kind} \"{name}\": a {what} wall (wall {near.Id.IdValue()}) on {level.Name} passes the point — " +
                                                            $"Sentinel hosts a {el.Kind} in one straight basic wall only; a person decides the host");
                    }
                    var i = PlacementGeometry.Host(lines, level.Name, p[0], p[1], out var why);
                    if (i < 0) throw UntickedHost(cs, tickedGuids, $"{el.Kind} \"{name}\"", "wall", level, p[0], p[1]) ?? new InvalidOperationException($"{el.Kind} \"{name}\": {why}");
                    // MA-1b (review amendment C1): a block's direction runs along its wall. Ghost's planner files none that does
                    // not (its snap has the same rule); an agent's changeset is refused here, in words,
                    // before this instance is created; the rollback takes the rest of the changeset with it (one Undo, Error -> Decline).
                    if (el.Place.Rotation is double along
                        && PlacementGeometry.AcrossWall(lines[i].Label, lines[i].X0, lines[i].Y0, lines[i].X1, lines[i].Y1, along) is string across)
                        throw new InvalidOperationException($"{el.Kind} \"{name}\": {across}");
                    if (!sym.IsActive) { sym.Activate(); doc.Regenerate(); }
                    var fi = doc.Create.NewFamilyInstance(Pt(p), sym, hosts[i], level, StructuralType.NonStructural);
                    if (!(fi.Host is Wall hw && hw.Id.Equals(hosts[i].Id)))
                        throw new InvalidOperationException($"{el.Kind} \"{name}\": \"{TypeLabel(sym)}\" did not go into wall {hosts[i].Id.IdValue()} — its family is not wall-hosted; re-propose a wall-hosted {el.Kind}");
                    if (el.Place.SillHeight is double sill) Set(fi, BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM, sill * MmToFeet, el.Kind);
                    if (el.Place.FlipFacing == true && !(fi.CanFlipFacing && fi.flipFacing())) throw new InvalidOperationException($"{el.Kind} \"{name}\" cannot flip its facing");
                    if (el.Place.FlipHand == true && !(fi.CanFlipHand && fi.flipHand())) throw new InvalidOperationException($"{el.Kind} \"{name}\" cannot flip its hand");
                    // MA-1b (GHB-1): a door or window read from a drawn block is turned toward the block's hinge side (hand)
                    // and swing side (facing) in a second transaction, after this one commits (TurnToBlocks): drill MA1b showed
                    // that the facing a fresh door reports inside the creating transaction is, on a wall drawn with a negative
                    // Y direction, the reverse of what the model holds after the commit — a flip decided here went the wrong way
                    // on 4 of 10 doors (F-MA1b-2).
                    SetMark(fi, el);
                    Collect(result, el, fi);
                }
            }

            // MA-6-3: openings after every wall, floor, door and window of this changeset (Regenerate first: a host made in this transaction
            // is cut too). A wall opening is a rectangle in the ONE straight basic wall under its point (the door's host finder and its
            // refusals), Width along the wall, from its sill up Height; a floor opening is its Boundary cut through the ONE floor of its level
            // that holds the outline's centre — this changeset's floors first, then the model's. None or two is a refusal in words.
            var cuts = toPlace.Where(e => IsCreate(e) && e.Kind == "opening").ToList();
            if (cuts.Count > 0)
            {
                doc.Regenerate();
                var (hosts, odd, lines) = HostWalls(doc);
                var ours = new HashSet<long>(result.Applied.Where(a => toPlace.First(e => e.ProposalGuid == a.ProposalGuid).Kind == "floor").Select(a => a.RevitElementId));
                foreach (var el in cuts)
                {
                    at = Label(el);
                    var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                    var level = ResolveLevel(doc, el.Place);
                    Opening cut;
                    if (el.Place.Location is double[] p)
                    {
                        if (Math.Abs(p[2] * MmToFeet - level.Elevation) > TolFt)
                            throw new InvalidOperationException($"opening \"{name}\": Location z {Mm(p[2])} mm is not {level.Name}'s elevation {Mm(level.Elevation / MmToFeet)} mm — a wall opening stands on its level; its bottom is place.SillHeight");
                        if (OddNear(odd, level.Id, p[0], p[1]) is Wall near)
                            throw new InvalidOperationException($"opening \"{name}\": a wall Sentinel does not cut (wall {near.Id.IdValue()}: curtain, stacked or curved) on {level.Name} passes the point — a person decides");
                        var i = PlacementGeometry.Host(lines, level.Name, p[0], p[1], out var why);
                        if (i < 0) throw UntickedHost(cs, tickedGuids, $"opening \"{name}\"", "wall", level, p[0], p[1]) ?? new InvalidOperationException($"opening \"{name}\": {why}");
                        double w = (el.Place.Width ?? 0) * MmToFeet, h = (el.Place.Height ?? 0) * MmToFeet, z0 = level.Elevation + (el.Place.SillHeight ?? 0) * MmToFeet;
                        // Review fix: the rectangle lies inside its one host — between the wall's line ends, its bottom and its top — or it is
                        // refused: NewOpening cuts that wall alone, and a wall it runs past (a collinear neighbour, the storey above) would stay whole.
                        var (wb, wt) = Heights(doc, hosts[i]);
                        if (PlacementGeometry.OpeningFits(lines[i].Label, lines[i].X0, lines[i].Y0, lines[i].X1, lines[i].Y1, wb / MmToFeet, wt / MmToFeet,
                                                          p[0], p[1], el.Place.Width ?? 0, z0 / MmToFeet, (z0 + h) / MmToFeet) is string past)
                            throw new InvalidOperationException($"opening \"{name}\": {past}");
                        var wc = ((LocationCurve)hosts[i].Location).Curve;
                        var d = new XYZ(wc.GetEndPoint(1).X - wc.GetEndPoint(0).X, wc.GetEndPoint(1).Y - wc.GetEndPoint(0).Y, 0).Normalize();
                        double x = p[0] * MmToFeet, y = p[1] * MmToFeet;
                        cut = doc.Create.NewOpening(hosts[i], new XYZ(x - d.X * w / 2, y - d.Y * w / 2, z0), new XYZ(x + d.X * w / 2, y + d.Y * w / 2, z0 + h));
                    }
                    else
                    {
                        var outline = Outline(el.Place.Boundary, level.Elevation, $"opening \"{name}\"");
                        var mid = new XYZ(outline.Average(c => c.GetEndPoint(0).X), outline.Average(c => c.GetEndPoint(0).Y), level.Elevation);
                        var onLevel = new FilteredElementCollector(doc).OfClass(typeof(Floor)).Cast<Floor>().Where(f => f.LevelId.Equals(level.Id)).ToList();
                        var pool = onLevel.Any(f => ours.Contains(f.Id.IdValue()) && Holds(f, mid)) ? onLevel.Where(f => ours.Contains(f.Id.IdValue())).ToList() : onLevel;
                        var pick = pool.Where(f => Holds(f, mid)).ToList();
                        if (pick.Count == 0 && UntickedHost(cs, tickedGuids, $"opening \"{name}\"", "floor", level, mid.X / MmToFeet, mid.Y / MmToFeet) is { } offFloor) throw offFloor;
                        if (pick.Count != 1)
                            throw new InvalidOperationException($"opening \"{name}\": {(pick.Count == 0 ? "no floor of " + level.Name + " holds" : pick.Count + " floors of " + level.Name + " hold")} the centre of its Boundary — Sentinel cuts one floor; a person decides");
                        // Review fix: no vertex or edge middle of the outline lies on another floor of that pool — NewOpening cuts pick[0] alone, and
                        // a floor beside it under the same void would stay whole. A void flush with the edge two floors share stays legal: each point
                        // is taken 1 mm toward the centre first (Holds counts a point on an edge as inside one of the two floors). ponytail: a
                        // strongly concave outline can step 1 mm out of itself there; sample inside the outline if that ever refuses a real void.
                        var spots = outline.SelectMany(c => new[] { c.GetEndPoint(0), c.Evaluate(0.5, true) })
                            .Select(q => (mid - q).GetLength() <= MmToFeet ? q : q + (mid - q).Normalize() * MmToFeet).ToList();
                        if (pool.FirstOrDefault(f => !f.Id.Equals(pick[0].Id) && spots.Any(q => Holds(f, q))) is Floor other)
                            throw new InvalidOperationException($"opening \"{name}\": its Boundary reaches floor {other.Id.IdValue()} of {level.Name} as well as floor {pick[0].Id.IdValue()} — Sentinel cuts one floor; re-propose the void inside one floor, or a person decides");
                        var arr = new CurveArray();
                        foreach (var c in outline) arr.Append(c);
                        cut = doc.Create.NewOpening(pick[0], arr, true);
                    }
                    Collect(result, el, cut);
                }
            }

            // MA-1a step 2: a column or furniture stands unhosted on its level at its point (Ghost Builder's point families): the
            // one loaded (family, type) it names, activated inside this transaction, z = the level's elevation.
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind is "column" or "furniture"))
            {
                at = Label(el);
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var level = ResolveLevel(doc, el.Place);
                var p = el.Place.Location ?? throw new InvalidOperationException($"{el.Kind} \"{name}\" has no Location");
                if (Math.Abs(p[2] * MmToFeet - level.Elevation) > TolFt)
                    throw new InvalidOperationException($"{el.Kind} \"{name}\": Location z {Mm(p[2])} mm is not {level.Name}'s elevation {Mm(level.Elevation / MmToFeet)} mm — a {el.Kind} stands on its level");
                var sym = (FamilySymbol)CreateType(doc, el.Kind == "column" ? BuiltInCategory.OST_Columns : BuiltInCategory.OST_Furniture,
                                                   el.Kind, el.Place.FamilyName, el.Place.TypeName);
                if (!sym.IsActive) { sym.Activate(); doc.Regenerate(); }
                var fi = doc.Create.NewFamilyInstance(Pt(p), sym, level, StructuralType.NonStructural);
                // MA-6-3: a column with a TopLevel stands to it, offset 0 (the bridge checked it is not its own level).
                if (el.Kind == "column" && !string.IsNullOrWhiteSpace(el.Place.TopLevel))
                {
                    var top = LevelNamed(doc, el.Place.TopLevel);
                    if (top.Elevation <= level.Elevation) throw new InvalidOperationException($"column \"{name}\": its TopLevel {top.Name} is not above {level.Name}");
                    Set(fi, BuiltInParameter.FAMILY_TOP_LEVEL_PARAM, top.Id, "column");
                    Set(fi, BuiltInParameter.FAMILY_TOP_LEVEL_OFFSET_PARAM, 0.0, "column");
                }
                SetMark(fi, el);
                Collect(result, el, fi);
            }

            // MA-6-3: a beam on its straight line (z = its top: Revit's default justification, the curve's height above the level sets
            // its end offsets) — the one loaded Structural Framing (family, type) it names, activated inside this transaction.
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "beam"))
            {
                at = Label(el);
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var level = ResolveLevel(doc, el.Place);
                var c = el.Place.LocationCurve ?? throw new InvalidOperationException($"beam \"{name}\" has no LocationCurve");
                var sym = (FamilySymbol)CreateType(doc, BuiltInCategory.OST_StructuralFraming, "beam", el.Place.FamilyName, el.Place.TypeName);
                if (!sym.IsActive) { sym.Activate(); doc.Regenerate(); }
                var fi = doc.Create.NewFamilyInstance(Line.CreateBound(Pt(c.Start), Pt(c.End)), sym, level, StructuralType.Beam);
                SetMark(fi, el);
                Collect(result, el, fi);
            }

            // MA-5b-4 (C13b): a reshape moves an existing wall's location line to where a revised drawing draws it — only when the wall still
            // stands where it was placed (target.placed, within 2 mm, either way round): one edited by hand since, or gone, is KEPT and said,
            // and the rest of the changeset is applied. Its type is untouched (a thickness change is a person's row on the bridge); hosted
            // doors and windows follow their wall (one the new line leaves outside rolls the whole changeset back, in Revit's words).
            foreach (var el in toPlace.Where(e => e.Op == "reshape"))
            {
                at = Label(el);
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var c = el.Place?.LocationCurve;
                var was = el.Target?.Placed;
                if (c?.Start == null || c.End == null || was?.Start == null || was.End == null)
                    throw new InvalidOperationException($"reshape \"{name}\" has no new line or no placed line");
                if (!(doc.GetElement(el.Target.UniqueId ?? "") is Wall w))
                {
                    result.Kept.Add((el.ProposalGuid, $"wall {el.Target.UniqueId} is no longer in this model — not reshaped (deleted by hand, or replaced: Revit's Move with Disjoin gives a wall a new id)"));
                    continue;
                }
                if (!(((w.Location as LocationCurve)?.Curve) is Line now))
                {
                    result.Kept.Add((el.ProposalGuid, $"wall {w.Id.IdValue()} is no longer a straight wall — edited by hand since it was placed; kept as it stands"));
                    continue;
                }
                XYZ a0 = now.GetEndPoint(0), a1 = now.GetEndPoint(1);
                if (!PlacementGeometry.AsPlaced(a0.X / MmToFeet, a0.Y / MmToFeet, a1.X / MmToFeet, a1.Y / MmToFeet, was.Start, was.End, ReshapeTolMm))
                {
                    result.Kept.Add((el.ProposalGuid, $"wall {w.Id.IdValue()} was moved by hand since it was placed (it no longer stands on {Pair(was.Start)} → {Pair(was.End)}) — kept as it stands; a person decides"));
                    continue;
                }
                // review: a person's "do not move" — a pin, a group, a colleague's borrowed wall — is kept too, never overridden (a lock rolls
                // the whole changeset back in Revit's words: finding one needs a scan of locked dimensions)
                var held = w.Pinned ? "is pinned"
                         : w.GroupId != null && !w.GroupId.Equals(ElementId.InvalidElementId) ? "is in a group — Sentinel does not edit a group's members"
                         : doc.IsWorkshared && WorksharingUtils.GetCheckoutStatus(doc, w.Id) == CheckoutStatus.OwnedByOtherUser ? "is borrowed by another user"
                         : null;
                if (held != null) { result.Kept.Add((el.ProposalGuid, $"wall {w.Id.IdValue()} {held} — kept as it stands; a person decides")); continue; }
                // review: the new line runs the wall's own way — a line set end for end reverses the wall (its exterior face goes inside)
                double bx = c.End[0] - c.Start[0], by = c.End[1] - c.Start[1];
                var (s0, s1) = bx * (a1.X - a0.X) + by * (a1.Y - a0.Y) < 0 ? (c.End, c.Start) : (c.Start, c.End);
                ((LocationCurve)w.Location).Curve = Line.CreateBound(new XYZ(s0[0] * MmToFeet, s0[1] * MmToFeet, a0.Z), new XYZ(s1[0] * MmToFeet, s1[1] * MmToFeet, a0.Z));
                Collect(result, el, w);
            }

            // MA-5b-1: a room at its label's point on its level, after every wall of this changeset (Regenerate first): Revit finds the
            // boundary there (NewRoom(level, UV)). All or nothing, in words — and the changeset stays proposed (PlacementRefused: the model
            // or the ticks, not a verdict on it): a room already standing at a point; two of these rooms in one enclosed area; a room the
            // walls round it do not close (Area 0: a wall around it unticked, held or a type gap).
            var rooms = toPlace.Where(e => IsCreate(e) && e.Kind == "room").ToList();
            if (rooms.Count > 0)
            {
                doc.Regenerate();
                // review: the phase the walls go to (the placement block's view phase) — a room is checked and placed in it; none = the last phase
                var phase = Placement?.PhaseId != null ? doc.GetElement(Placement.PhaseId) as Phase : null;
                var spots = new List<(ChangesetElementDto el, Level level, XYZ pt, string name)>();
                foreach (var el in rooms)
                {
                    at = Label(el);
                    var level = ResolveLevel(doc, el.Place);
                    var p = el.Place.Location ?? throw new InvalidOperationException($"{at} has no Location");
                    var name = $"room {(string.IsNullOrWhiteSpace(el.Place.Number) ? "" : el.Place.Number + " ")}{el.Place.Name}";
                    // a foot above its level, in the model's internal frame (review: ProjectElevation — Elevation reads from the survey point
                    // when the level's base is set so): inside a room's height
                    var pt = new XYZ(p[0] * MmToFeet, p[1] * MmToFeet, level.ProjectElevation + 1.0);
                    if ((phase != null ? doc.GetRoomAtPoint(pt, phase) : doc.GetRoomAtPoint(pt)) is { } there)
                        throw new PlacementRefused($"{name}: room {there.Number} \"{there.Name}\" already stands at its point on {level.Name} — untick it; nothing was placed");
                    spots.Add((el, level, pt, name));
                }
                var made = new List<Autodesk.Revit.DB.Architecture.Room>();
                foreach (var (el, level, pt, name) in spots)
                {
                    at = Label(el);
                    // review: a room Revit cannot place (null, or its own exception) leaves the changeset proposed, said — never a decline of the walls too
                    Autodesk.Revit.DB.Architecture.Room room;
                    try { room = doc.Create.NewRoom(level, new UV(pt.X, pt.Y)); }
                    catch (Autodesk.Revit.Exceptions.ApplicationException ex) { throw new PlacementRefused($"{name}: Revit could not place it on {level.Name} ({ex.Message}) — untick it; nothing was placed"); }
                    if (room == null) throw new PlacementRefused($"{name}: Revit could not place it on {level.Name} — untick it; nothing was placed");
                    var inPhase = room.get_Parameter(BuiltInParameter.ROOM_PHASE_ID)?.AsElementId();
                    if (phase != null && inPhase != null && !inPhase.Equals(phase.Id))
                        throw new PlacementRefused($"{name}: Revit places a new room in the project's last phase ({(doc.GetElement(inPhase) as Phase)?.Name ?? "?"}), and this changeset's walls go to \"{phase.Name}\" — apply it from a view of the last phase, or untick the room; nothing was placed");
                    room.Name = el.Place.Name;
                    if (!string.IsNullOrWhiteSpace(el.Place.Number)) room.Number = el.Place.Number;
                    made.Add(room);
                    Collect(result, el, room);
                }
                doc.Regenerate();
                at = "the rooms";
                for (int i = 0; i < made.Count; i++)
                    for (int j = i + 1; j < made.Count; j++)
                        if (made[i].IsPointInRoom(spots[j].pt) || made[j].IsPointInRoom(spots[i].pt))
                            throw new PlacementRefused($"{spots[i].name} and {spots[j].name} fall in one enclosed area on {spots[i].level.Name} — a wall between them is unticked, or the drawing labels one room twice: untick one; nothing was placed");
                for (int i = 0; i < made.Count; i++)
                    if (!(made[i].Area > 0))
                        throw new PlacementRefused($"{spots[i].name} is not enclosed on {spots[i].level.Name} — a wall round it is unticked, held or a type gap: untick the room, or place its walls first; nothing was placed");
                // drill MA5b (F-MA5b-2): enclosed is not enough — with a wall of this changeset unticked, walls already standing can close a larger
                // area round the label (the two rooms an unticked partition splits): an unticked wall on its level through the room refuses it
                var unticked = cs.Elements.Where(e => IsCreate(e) && e.Kind == "wall" && !tickedGuids.Contains(e.ProposalGuid)
                                                      && e.Place?.LocationCurve?.Start is { Length: >= 2 } && e.Place.LocationCurve.End is { Length: >= 2 }).ToList();
                for (int i = 0; i < made.Count; i++)
                    foreach (var w in unticked.Where(w => string.Equals(w.Place.LevelName, spots[i].el.Place.LevelName, StringComparison.OrdinalIgnoreCase)))
                    {
                        double[] a = w.Place.LocationCurve.Start, b = w.Place.LocationCurve.End;
                        if (made[i].IsPointInRoom(new XYZ((a[0] + b[0]) / 2 * MmToFeet, (a[1] + b[1]) / 2 * MmToFeet, spots[i].pt.Z)))
                            throw new PlacementRefused($"{spots[i].name}: {Label(w)} is unticked and runs through it on {spots[i].level.Name} — Revit would close the room past it: tick the wall, or untick the room; nothing was placed");
                    }
            }

            // MA-5b-5: rehost — a door or window no wall hosts is replaced by the office's wall-hosted type of its size in the one wall it
            // stands in, and removed: one at a time, after every create (a wall this changeset creates may host it) and the rooms. What a
            // person may have changed since Promote read it — gone, hosted now, retyped, moved, pinned, grouped, in an option, a colleague's,
            // its wall gone or held, an opening already there — is KEPT as it stands and said (MA-5b-4's path: rejected, never a failure); a
            // type not loaded exactly or not wall-hosted refuses the changeset, which stays proposed. Design review R1: a probe delete (rolled
            // back) gives exactly what the delete would take — the old instance and its tags only, else kept — and the old instance's Mark,
            // Comments, workset and phase are read before anything is removed.
            var rehosts = toPlace.Where(e => e.Op == "rehost").ToList();
            if (rehosts.Count > 0)
            {
                doc.Regenerate();
                var (hosts, odd, lines) = HostWalls(doc);
                foreach (var el in rehosts)
                {
                    at = Label(el);
                    void Keep(string why) => result.Kept.Add((el.ProposalGuid, $"{at} {why} — not rehosted; it stays as it stands, a person decides"));
                    if (!(doc.GetElement(el.Target?.UniqueId ?? "") is FamilyInstance old)) { Keep("is no longer in this model"); continue; }
                    // review: a rehost deletes what it names — only a top-level instance of its own kind (as Target() keeps a door ghost off a
                    // wall); anything else is no placeholder Promote read, and refuses the changeset (it stays proposed)
                    if (old.Category?.Id.IdValue() != (long)(el.Kind == "window" ? BuiltInCategory.OST_Windows : BuiltInCategory.OST_Doors) || old.SuperComponent != null)
                        throw new PlacementRefused($"{at}: {el.Target.UniqueId} is not a top-level {el.Kind} ({old.Category?.Name ?? "no category"}) — a rehost replaces a door or window only; re-run Promote");
                    if (!NoWallHost(old)) { Keep(old.Host is Wall ? "is hosted by a wall now" : $"is hosted by {old.Host.Category?.Name ?? "an element"} now"); continue; }
                    if (!string.Equals(TypeLabel(old.Symbol), el.Target.TypeBefore, StringComparison.OrdinalIgnoreCase))
                    { Keep($"is \"{TypeLabel(old.Symbol)}\" now, not \"{el.Target.TypeBefore}\" — retyped since Promote read it"); continue; }
                    var lp = (old.Location as LocationPoint)?.Point;
                    var was = el.Target.At;
                    if (lp == null || was == null || was.Length < 3
                        || Math.Sqrt(Math.Pow(lp.X / MmToFeet - was[0], 2) + Math.Pow(lp.Y / MmToFeet - was[1], 2) + Math.Pow(lp.Z / MmToFeet - was[2], 2)) > ReshapeTolMm)
                    { Keep("was moved or raised by hand since Promote read it"); continue; }
                    var onLevel = (doc.GetElement(old.LevelId) as Level)?.Name;
                    if (!string.Equals(onLevel, el.Place.LevelName, StringComparison.OrdinalIgnoreCase))
                    { Keep($"is on {onLevel ?? "no level"} now, not {el.Place.LevelName} — moved to another level since Promote read it"); continue; }
                    if (HeldBy(doc, old) is string heldOld) { Keep(heldOld); continue; }
                    var level = ResolveLevel(doc, el.Place);
                    var p = el.Place.Location ?? throw new PlacementRefused($"{at}: a rehost with no place.Location — re-run Promote");
                    if (Math.Abs(p[2] * MmToFeet - level.Elevation) > TolFt)
                        throw new PlacementRefused($"{at}: Location z {Mm(p[2])} mm is not {level.Name}'s elevation {Mm(level.Elevation / MmToFeet)} mm — re-run Promote");
                    if (RehostRefusal(doc, el.Kind, el.Place.FamilyName, el.Place.TypeName) is string no) throw new PlacementRefused($"{at}: {no}");
                    var sym = (FamilySymbol)CreateType(doc, el.Kind == "window" ? BuiltInCategory.OST_Windows : BuiltInCategory.OST_Doors, el.Kind, el.Place.FamilyName, el.Place.TypeName);
                    if (OddNear(odd, level.Id, p[0], p[1]) is Wall near) { Keep($"would go where wall {near.Id.IdValue()} (curtain, stacked, curved or not basic) passes"); continue; }
                    var i = PlacementGeometry.Host(lines, level.Name, p[0], p[1], out var why);
                    if (i < 0) { Keep($"has no one wall at its planned point now ({why})"); continue; }
                    var wall = hosts[i];
                    if (HeldBy(doc, wall) is string heldWall) { Keep($"would go into wall {wall.Id.IdValue()}, which {heldWall}"); continue; }
                    if (Overlap(doc, wall, p, el, sym) is string over) { Keep(over); continue; }
                    // R1: what removing it takes — the probe is rolled back; the old instance's own values are read now, never after the delete
                    var oldId = old.Id;
                    string mark = old.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString(), comments = old.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.AsString();
                    var home = PlacementApply.Home(old);
                    ICollection<ElementId> probe;
                    try { using (var st = new SubTransaction(doc)) { st.Start(); probe = doc.Delete(oldId); st.RollBack(); } }
                    catch (Exception ex) when (!(ex is PlacementRefused)) { Keep($"cannot be removed — Revit refused: {ex.Message}"); continue; }
                    var others = probe.Where(id => !id.Equals(oldId) && !(doc.GetElement(id) is IndependentTag)).ToList();
                    if (others.Count > 0)
                    {
                        Keep($"cannot be removed alone — removing it would also remove {others.Count} other element(s) (" +
                             string.Join(", ", others.Take(3).Select(id => doc.GetElement(id)?.Category?.Name ?? "an element with no category")) + (others.Count > 3 ? ", …" : "") + ")");
                        continue;
                    }
                    FamilyInstance made = null;
                    var removedAlone = true;
                    using (var st = new SubTransaction(doc))
                    {
                        st.Start();
                        try
                        {
                            if (!sym.IsActive) { sym.Activate(); doc.Regenerate(); }
                            made = doc.Create.NewFamilyInstance(Pt(p), sym, wall, level, StructuralType.NonStructural);
                            if (!(made.Host is Wall hw && hw.Id.Equals(wall.Id)))
                                throw new PlacementRefused($"{at}: \"{TypeLabel(sym)}\" did not go into wall {wall.Id.IdValue()} — re-run Promote");
                            if (el.Place.SillHeight is double sill) Set(made, BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM, sill * MmToFeet, el.Kind);
                            var deleted = doc.Delete(oldId);
                            if (deleted.Count != probe.Count || deleted.Any(id => !probe.Contains(id)))
                            {
                                st.RollBack();
                                removedAlone = false;
                                Keep($"could not be removed alone (Revit's delete took {deleted.Count} element(s), its probe {probe.Count})");
                            }
                            else
                            {
                                if (!string.IsNullOrEmpty(mark)) made.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.Set(mark);
                                if (!string.IsNullOrEmpty(comments)) made.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.Set(comments);
                                PlacementApply.Inherit(made, home);
                                st.Commit();
                            }
                        }
                        catch (PlacementRefused) { throw; }
                        catch (Exception ex) { throw new PlacementRefused($"{at}: Revit refused the rehost — {ex.GetType().Name}: {ex.Message}"); }
                    }
                    if (!removedAlone) continue;
                    Collect(result, el, made);
                    result.Applied[result.Applied.Count - 1].RemovedTags = probe.Count - 1;
                }
            }

            // MA-0: retype before attach. Only to a type already in the document; the model must still hold the type
            // the plan saw, or the reviewer approved something that is no longer true. Promote v1: one path for every kind —
            // a door or window swaps to a symbol of its own category and keeps its host; Unsafe repeats the planner's holds.
            var centres = new List<(Element E, string Kind, XYZ Centre)>();
            foreach (var el in toPlace.Where(e => e.Op == "retype"))
            {
                at = Label(el);
                var e = Target(doc, el);
                var cur = doc.GetElement(e.GetTypeId()) as ElementType
                          ?? throw new InvalidOperationException($"{el.Kind} {e.UniqueId} has no type Sentinel can read");
                if (el.Target?.TypeBefore != null && !string.Equals(TypeLabel(cur), el.Target.TypeBefore, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException($"{el.Kind} {e.UniqueId} is now \"{TypeLabel(cur)}\" — the model changed since the plan; re-run Promote");
                var nt = RetypeTarget(doc, e, el.Kind, el.Place?.FamilyName, el.Place?.TypeName);
                var no = Unsafe(e, el.Kind, cur, nt);
                if (no != null) throw new InvalidOperationException(no);
                if (nt is FamilySymbol s && !s.IsActive) { s.Activate(); doc.Regenerate(); } // inside the transaction: Undo deactivates it too
                if (!e.IsValidType(nt.Id)) throw new InvalidOperationException($"\"{TypeLabel(nt)}\" is not a valid type for {el.Kind} {e.UniqueId}");
                var host = (e as FamilyInstance)?.Host?.Id;
                // MA-8-7 (amendment 7): a retype into another family can move a structural member when the two families' origins differ - the box centre
                // before and after must agree to 0.5 mm, or the changeset is declined inside the transaction.
                var centre0 = el.Kind is "column" or "beam" ? CentreOf(e) : null;
                if (e.ChangeTypeId(nt.Id) != ElementId.InvalidElementId) throw new InvalidOperationException($"Revit replaced the {el.Kind} on retype");
                if (centre0 != null) centres.Add((e, el.Kind, centre0)); // compared after the loop: one Regenerate, not one per member
                if (host != null && !host.Equals((e as FamilyInstance)?.Host?.Id)) throw new InvalidOperationException($"{el.Kind} {e.UniqueId} lost its host on the swap");
                Collect(result, el, e);
            }
            if (centres.Count > 0)
            {
                doc.Regenerate();
                foreach (var (me, mkind, centre0) in centres)
                {
                    var centre1 = CentreOf(me);
                    if (centre1 == null || (centre1 - centre0).GetLength() > TolFt)
                        throw new InvalidOperationException($"{mkind} {me.UniqueId} moved on the retype ({(centre1 == null ? "no box after" : Mm((centre1 - centre0).GetLength() / MmToFeet) + " mm")}) — the two families' origins differ; a person retypes it");
                }
            }

            // Attach = the constraint parameters (Revit 2024 has no Wall.AddAttachment): base and top on story levels, offsets 0.
            // Like retype's type_before, the model must still be what the plan saw: the base where it stood at +0 (the
            // planner proposes no other — attach never moves a wall), and a top no higher than the new one (attach never
            // cuts a wall down: hosted doors and windows above would go). Otherwise a person's later edit is not overwritten.
            foreach (var el in toPlace.Where(e => e.Op == "attach"))
            {
                at = Label(el);
                var w = TargetWall(doc, el);
                var b = LevelNamed(doc, el.Place?.BaseLevel);
                var top = LevelNamed(doc, el.Place?.TopLevel);
                if (top.Elevation <= b.Elevation) throw new InvalidOperationException($"{top.Name} is not above {b.Name}");
                var baseOff = w.get_Parameter(BuiltInParameter.WALL_BASE_OFFSET)?.AsDouble() ?? 0;
                if (!b.Id.Equals(w.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsElementId()) || Math.Abs(baseOff) > TolFt)
                    throw new InvalidOperationException($"wall {w.UniqueId} changed since the plan (its base is no longer {b.Name} +0); re-run Promote");
                var topNow = doc.GetElement(w.get_Parameter(BuiltInParameter.WALL_HEIGHT_TYPE)?.AsElementId() ?? ElementId.InvalidElementId) is Level tl
                    ? tl.Elevation + (w.get_Parameter(BuiltInParameter.WALL_TOP_OFFSET)?.AsDouble() ?? 0)
                    : b.Elevation + baseOff + (w.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM)?.AsDouble() ?? 0);
                if (topNow > top.Elevation + TolFt)
                    throw new InvalidOperationException($"wall {w.UniqueId} rises above {top.Name} — attaching would cut it down; re-run Promote");
                Set(w, BuiltInParameter.WALL_BASE_CONSTRAINT, b.Id);
                Set(w, BuiltInParameter.WALL_BASE_OFFSET, 0.0);
                Set(w, BuiltInParameter.WALL_HEIGHT_TYPE, top.Id);
                Set(w, BuiltInParameter.WALL_TOP_OFFSET, 0.0);
                Collect(result, el, w);
            }

            // MA-2c: set_parameter after every retype and attach, so a value lands on the type the retype just set (drill MA2b I-1: a
            // retype drops the concept type's value) and the DD IDS checked before commit sees it. The TYPE's own parameter, the stale
            // guard first (the value read now must be empty: review amendment C1), read back as the IDS reads it (FixInPlaceService).
            foreach (var el in toPlace.Where(e => e.Op == "set_parameter"))
            {
                at = Label(el);
                var type = ParamTarget(doc, el); // `t` is the transaction
                FixInPlaceService.WriteOnType(doc, type, el.Parameter, el.From, el.To, App.OrgFor(doc));
                Collect(result, el, type);
            }

            // Every ticked element must have been handled by a loop above — if the bridge's
            // vocabulary ever grows past the executor's, the mismatch fails the changeset HERE,
            // inside the transaction, instead of surfacing as a 400 after elements already exist.
            // MA-6-3 review fix: the add-in's version is this session's state, not a verdict on the changeset (C5's rule) — PlacementRefused
            // keeps it proposed, to apply once the add-in that reads the kind is deployed.
            if (result.Applied.Count + result.Kept.Count != toPlace.Count)
                throw new PlacementRefused($"{toPlace.Count - result.Applied.Count} ticked element(s) of unsupported kind or op were not placed — the add-in is older than the bridge's vocabulary; nothing was placed, and this one stays proposed until the add-in is updated");
            // MA-1a item 6: each element this changeset CREATED goes to the workset its category names and to the view's
            // phase — inside this transaction, so Ctrl+Z takes them back with the element. A retype or attach target keeps
            // its own workset and phase.
            at = "the placement block";
            PlacementApply.Apply(Placement, result.Applied.Where(a => toPlace.First(e => e.ProposalGuid == a.ProposalGuid) is var pe && (IsCreate(pe) || pe.Op == "rehost"))
                                                  .Select(a => doc.GetElement(a.RevitUniqueId)));
            // The stamp: once per element, with every guid of this changeset that touched it, merged onto the element's
            // earlier stamp (one entity per schema) — inside this transaction, so Ctrl+Z removes it too.
            at = "the provenance stamp";
            // MA-1a item 4: plus the changeset's proposal row on the ledger (null for a local changeset); the approver and the
            // time are the writer's (ProvenanceStamp.Write). C1: the layer, rule and source file are the in-process caller's
            // (Provenance) — never el.Provenance, which came back from the bridge. C2: the element's own reason goes with them,
            // and is the stamp's rule, marked as the proposer's, when the caller gave none.
            var ledgerRow = cs.Adjudication?.LedgerRow;
            foreach (var g in result.Applied.GroupBy(a => a.RevitUniqueId))
                ProvenanceStamp.Write(doc.GetElement(g.Key), cs.Id, cs.Source, g.Select(a => a.ProposalGuid),
                    ProvenanceStamp.ForChangeset(Provenance, g.Select(a => (a.ProposalGuid, toPlace.First(e => e.ProposalGuid == a.ProposalGuid).Reason)), ledgerRow));
            // Revit's failure resolution can roll a transaction back WITHOUT throwing — reporting
            // the collected ids then would be the "some failed silently" lie this file forbids.
            var status = t.Commit();
            if (status == TransactionStatus.RolledBack)
            {
                // B3: the failure that rolled it back names its culprits — each element this changeset placed by its label
                // (RevitElementId → ProposalGuid → element), so the person knows which layer to untick.
                var labels = new Dictionary<long, string>();
                foreach (var a in result.Applied) labels[a.RevitElementId] = Label(toPlace.First(e => e.ProposalGuid == a.ProposalGuid));
                var error = "Revit did not commit the transaction (failure resolution rolled it back)" + (handler.RolledBack != null ? ": " + handler.RolledBack + GhostFailurePolicy.RolledBackNames(handler.RolledBackIds, labels) : "");
                // MA-5b-5 (R8): a changeset that rehosts stays proposed (NotRun) — a commit-time refusal is this model's state, not a verdict
                // on the changeset; the person unticks the rehost and applies again
                // MA-8-7: a create that replaces removes an element too - the same rule
                return toPlace.Any(e => e.Op == "rehost" || e.Replaces != null)
                    ? new ExecutionResult { NotRun = true, Error = error + " — it " + (toPlace.Any(e => e.Op == "rehost") ? "rehosts a door or window" : "re-creates a DirectShape") + ", so it stays proposed: untick the row(s) Revit named (a removal among them, or another) and Apply again" }
                    : new ExecutionResult { Error = error };
            }
            // A6: Pending (or any other status) — Revit may still finish or drop it: nothing is reported, nothing recounted.
            if (status != TransactionStatus.Committed)
                return new ExecutionResult { NotFinished = GhostFailurePolicy.NotFinishedLine(status.ToString()) };
            // MA-1a step 2: the recount — an element Revit no longer holds after the commit is reported as rejected, never
            // as applied; a warning that named it went with it. The rest are counted, left in the model, never erased.
            var gone = new HashSet<long>();
            foreach (var a in result.Applied.Where(a => doc.GetElement(a.RevitUniqueId) == null).ToList())
            {
                result.Applied.Remove(a);
                result.Gone.Add(a);
                gone.Add(a.RevitElementId);
            }
            foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) result.Warnings[kv.Key] = kv.Value;
            // MA-4f: Revit's re-read for verify — each wall a survey changeset created (Claimed false: built by a bridge-run job), as Revit holds
            // it after the commit and the recount: its joins, its location line, its type's real width. The add-in's claim, said so by the bridge
            // ("revit (claimed)"). Read only — the transaction is over; a read that throws, or a solid past the cap, leaves Mesh null and the
            // bridge measures that wall as filed.
            if (cs.Claimed == false)
                foreach (var a in result.Applied)
                    if (toPlace.First(e => e.ProposalGuid == a.ProposalGuid) is { Kind: "wall" } w && IsCreate(w))
                        try { a.Mesh = WallMesh(doc.GetElement(a.RevitUniqueId)); } catch (Exception) { a.Mesh = null; }
            TurnToBlocks(doc, cs, toPlace, result);
            // MA-1b (GHB-1): each door or window placed from a block, as Revit holds it now — the angle between it and its
            // block, its hinge side and swing side against the drawing's. Read after the commit and the recount (an element
            // Revit removed is in Gone, not here). The transaction is over: a read that throws is recorded as unread.
            foreach (var a in result.Applied)
            {
                var el = toPlace.First(e => e.ProposalGuid == a.ProposalGuid);
                if (!IsCreate(el) || !(el.Place?.Rotation is double rot)) continue;
                try
                {
                    var fi = (FamilyInstance)doc.GetElement(a.RevitUniqueId);
                    result.Turned.Add(PlacementGeometry.Turn(Label(el), rot, el.Place.Mirrored == true,
                        fi.HandOrientation.X, fi.HandOrientation.Y, fi.FacingOrientation.X, fi.FacingOrientation.Y, fi.CanFlipHand, fi.CanFlipFacing));
                }
                catch (Exception) { result.Turned.Add((Label(el), double.NaN, false, false, false, false)); }
            }
            return result;
        }
        catch (PlacementRefused ex)
        {
            // MA-1a item 6 (review amendment C5): Revit refused a workset write — this session's model state, not a verdict
            // on the changeset. Rolled back whole; the changeset stays proposed (NotRun), like the other refusals of item 6.
            // An Error without NotRun would be reported to the ledger as declined, and could not be applied again.
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            return new ExecutionResult { NotRun = true, Error = ex.Message };
        }
        catch (Exception ex)
        {
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            // Our own refusals already name the element; anything else (a Revit API or .NET exception) is named here, with
            // its type and the first Sentinel frame, so a declined changeset says which element failed and where.
            return new ExecutionResult { Error = ex is InvalidOperationException ? ex.Message : $"{at ?? "the changeset"}: {ex.GetType().Name}: {ex.Message}{Frame(ex)}" }; // fresh result: NOTHING was applied
        }
    }

    /// <summary>MA-8-10: one straight stair between two levels, in Revit's stair edit scope (spike S1, Revit 2024: one Undo entry, one Ctrl+Z removes the stairs,
    /// the run and the type's railings). Called by Execute inside RunChecked's TransactionGroup with NO transaction open. The sequence: re-check the plan against
    /// this model (the levels, the type: StairPlanner.Risers) - scope.Start - an inner transaction (the type, DesiredRisersNumber, CreateStraightRun, the run's
    /// width, Regenerate, the risers and the riser height read back and refused before commit, the placement block, the stamp) - scope.Commit with the warnings it
    /// raises deleted (a warning at the scope's commit is otherwise a modal dialog) - then the built facts read AFTER the commit (the railings appear only there).
    /// A refusal rolls both back; the run is (N - 1) x going long (N x going gives N + 1 risers and a top-end warning).</summary>
    private ExecutionResult ExecuteStair(Document doc, ChangesetDto cs, List<ChangesetElementDto> toPlace)
    {
        if (toPlace.Count != 1)
            return new ExecutionResult { NotRun = true, Error = "a stair changeset holds its stair and nothing else — Revit builds a stair in its own edit scope; nothing was placed" };
        var el = toPlace[0];
        var at = Label(el);
        StairsEditScope scope = null;
        Transaction t = null;
        GhostFailureHandler scopeHandler = null, innerHandler = null;
        try
        {
            var p = el.Place ?? throw new InvalidOperationException($"{at} has no place");
            var level = ResolveLevel(doc, p);
            var top = LevelNamed(doc, p.TopLevel);
            if (top.Elevation <= level.Elevation + TolFt)
                throw new PlacementRefused($"{at}: its TopLevel {top.Name} is not above {level.Name} — re-propose from the flag; nothing was placed, and this one stays proposed");
            var type = (Arch.StairsType)StairsTypeOf(doc, p.FamilyName, p.TypeName);
            var c = p.LocationCurve;
            if (c?.Start == null || c.End == null || p.Risers is not int risers || p.Going is not double going || p.Width is not double width)
                throw new InvalidOperationException($"{at} needs place.LocationCurve, place.Risers, place.Going and place.Width");
            if (Math.Abs(c.Start[2] * MmToFeet - level.Elevation) > TolFt || Math.Abs(c.End[2] * MmToFeet - level.Elevation) > TolFt)
                throw new InvalidOperationException($"{at}: the run's z is not {level.Name}'s elevation {Mm(level.Elevation / MmToFeet)} mm — a stair's run starts on its level");
            // the plan against the model it is applied in: the riser rule (one pure function, with the planner's), the going and the width the type allows
            double f2f = (top.Elevation - level.Elevation) / MmToFeet, maxRiser = type.MaxRiserHeight / MmToFeet;
            if (StairPlanner.Risers(f2f, maxRiser) != risers || going < type.MinTreadDepth / MmToFeet - 0.5 || width < type.MinRunWidth / MmToFeet - 0.5)
                throw new PlacementRefused($"{at}: the levels or the stair type changed since the plan — re-propose from the flag; nothing was placed, and this one stays proposed");

            scope = new StairsEditScope(doc, UndoWatcher.TxName(cs.Name, cs.Id));
            var stairsId = scope.Start(level.Id, top.Id);
            t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id)); // the Doctor skips it by its prefix (GhostFailurePolicy.DoctorSkips)
            t.Start();
            innerHandler = GhostFailureHandler.AllOrNothingOn(t);
            var stairs = (Arch.Stairs)doc.GetElement(stairsId);
            stairs.ChangeTypeId(type.Id);
            stairs.DesiredRisersNumber = risers;
            var run = Arch.StairsRun.CreateStraightRun(doc, stairsId, Line.CreateBound(Pt(c.Start), Pt(c.End)), Arch.StairsRunJustification.Center);
            run.ActualRunWidth = width * MmToFeet;
            doc.Regenerate();
            // refused BEFORE the commit: Revit's warning for it would be a modal dialog at the scope's commit (spike S1)
            if (stairs.ActualRisersNumber != risers)
                throw new PlacementRefused($"{at}: Revit made {stairs.ActualRisersNumber} risers, not the {risers} planned (the run is {Mm(Math.Sqrt((c.End[0] - c.Start[0]) * (c.End[0] - c.Start[0]) + (c.End[1] - c.Start[1]) * (c.End[1] - c.Start[1])))} mm) — nothing was placed; re-propose from the flag");
            if (stairs.ActualRiserHeight > type.MaxRiserHeight + 0.5 * MmToFeet)
                throw new PlacementRefused($"{at}: the riser would be {Mm(stairs.ActualRiserHeight / MmToFeet)} mm, over the type's maximum {Mm(maxRiser)} mm — nothing was placed; re-propose from the flag");
            // MA-1a item 6: the workset and phase, and the stamp - inside the scope's transaction, so the one Ctrl+Z takes them with the stair
            PlacementApply.Apply(Placement, new Element[] { stairs });
            ProvenanceStamp.Write(stairs, cs.Id, cs.Source, new[] { el.ProposalGuid },
                ProvenanceStamp.ForChangeset(Provenance, new[] { (el.ProposalGuid, el.Reason) }, cs.Adjudication?.LedgerRow));
            if (t.Commit() != TransactionStatus.Committed)
                throw new InvalidOperationException("Revit did not commit the stair's transaction" + (innerHandler.RolledBack != null ? ": " + innerHandler.RolledBack : ""));
            scopeHandler = new GhostFailureHandler { AllOrNothing = true, DeleteWarnings = true };
            // the elements a warning of this stair may name and still be removed: the stair, its runs, landings and supports (read inside the scope)
            scopeHandler.Ours.Add(stairsId.IdValue());
            foreach (var id in stairs.GetStairsRuns().Concat(stairs.GetStairsLandings()).Concat(stairs.GetStairsSupports())) scopeHandler.Ours.Add(id.IdValue());
            scope.Commit(scopeHandler);

            // what Revit holds now, read after the scope's commit: the type's railings appear only there. Rounded to 0.01 mm.
            var made = doc.GetElement(stairsId) as Arch.Stairs ?? throw new InvalidOperationException($"{at}: Revit no longer holds the stair after its edit scope committed");
            var runs = made.GetStairsRuns();
            double R(double ft) => Math.Round(ft / MmToFeet, 2);
            var result = new ExecutionResult();
            Collect(result, el, made);
            result.Applied[0].Built = new StairBuiltDto
            {
                Risers = made.ActualRisersNumber, RiserMm = R(made.ActualRiserHeight), GoingMm = R(made.ActualTreadDepth),
                WidthMm = runs.Count > 0 && doc.GetElement(runs.First()) is Arch.StairsRun r0 ? R(r0.ActualRunWidth) : 0,
                Runs = runs.Count, Railings = made.GetAssociatedRailings().Count,
            };
            foreach (var kv in GhostFailurePolicy.CountWarnings(scopeHandler.SeenWarnings, new HashSet<long>())) result.Warnings[kv.Key] = kv.Value;
            result.Removed = GhostFailurePolicy.RemovedLine(scopeHandler.RemovedWarnings);
            return result;
        }
        catch (Exception ex)
        {
            if (t != null && t.HasStarted() && !t.HasEnded()) t.RollBack();
            try { if (scope != null && scope.IsActive) scope.Cancel(); } catch (Exception) { /* closed with the group's rollback */ }
            if (ex is PlacementRefused) return new ExecutionResult { NotRun = true, Error = ex.Message };
            var why = scopeHandler?.RolledBack ?? innerHandler?.RolledBack;
            return new ExecutionResult { Error = why != null ? "Revit did not commit the stair (failure resolution rolled it back): " + why
                : ex is InvalidOperationException ? ex.Message : $"{at}: {ex.GetType().Name}: {ex.Message}{Frame(ex)}" };
        }
        finally { t?.Dispose(); scope?.Dispose(); }
    }

    private static XYZ CentreOf(Element e) { var bb = e.get_BoundingBox(null); return bb == null ? null : (bb.Min + bb.Max) / 2; }

    private static string Label(ChangesetElementDto el) => $"{el.Kind} \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\"";

    /// <summary>MA-6 fix-b1 (review): no host was found for a door, window or opening, and the one it would go into is a create of this changeset
    /// the person left unticked (a type not loaded opens unticked, F-3) — the ticks, not a verdict (the room rule's): PlacementRefused, so the
    /// changeset stays proposed; null when it is not that.</summary>
    private static PlacementRefused UntickedHost(ChangesetDto cs, HashSet<string> ticked, string what, string hostKind, Level level, double xMm, double yMm) =>
        ChangesetTrust.UntickedHost(cs.Elements, ticked, hostKind, level.Name, xMm, yMm) is { } h
            ? new PlacementRefused($"{what}: its host {Label(h)} in this changeset is unticked — tick it, or untick this row too; nothing was placed, and this one stays proposed")
            : null;

    /// <summary>MA-5b-4: how far (mm, in plan) a wall's ends may sit from where it was placed and still be "as placed" — Horizun's point
    /// tolerance is 1 mm; 2 mm allows the feet/mm round trip.</summary>
    internal const double ReshapeTolMm = 2;
    private static string Pair(double[] p) => $"({Mm(p[0])}, {Mm(p[1])})";

    // The first stack frame inside Sentinel, e.g. " (at ChangesetExecutor.Execute)"; empty when there is none.
    private static string Frame(Exception ex)
    {
        var line = (ex.StackTrace ?? "").Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l.IndexOf("Sentinel.", StringComparison.Ordinal) >= 0);
        if (line == null) return "";
        var at = line.StartsWith("at ") ? line.Substring(3) : line;
        var paren = at.IndexOf('(');
        return " (at " + (paren > 0 ? at.Substring(0, paren) : at) + ")";
    }

    /// <summary>MA-1b (GHB-1, F-MA1b-2): flip each door or window placed from a block toward the block's hinge side (hand) and
    /// swing side (facing), where its family can — in its own transaction AFTER the creating one committed, because the
    /// orientation a hosted instance reports inside the transaction that created it is not what the model holds after the
    /// commit (drill MA1b: reversed on every wall drawn with a negative Y direction). Every caller runs the executor inside
    /// a TransactionGroup, so this stays one Undo. A flip Revit refuses rolls this transaction back and leaves the elements
    /// as placed: Turned, measured after it, says what each one holds — one such family never declines a build.</summary>
    private static void TurnToBlocks(Document doc, ChangesetDto cs, List<ChangesetElementDto> toPlace, ExecutionResult result)
    {
        var turn = result.Applied.Select(a => (a, el: toPlace.First(e => e.ProposalGuid == a.ProposalGuid)))
                                 .Where(x => IsCreate(x.el) && x.el.Place?.Rotation is double).ToList();
        if (turn.Count == 0) return;
        using var t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id));
        try
        {
            t.Start();
            GhostFailureHandler.AllOrNothingOn(t);
            foreach (var (a, el) in turn)
            {
                if (!(doc.GetElement(a.RevitUniqueId) is FamilyInstance fi)) continue;
                var (hx, hy, fx, fy) = PlacementGeometry.Axes(el.Place.Rotation.Value, el.Place.Mirrored == true);
                // Both answers are read BEFORE either flip (drill MA1b, F-MA1b-2): after flipHand() Revit reported the facing
                // reversed until the next regeneration, so a facing read after it skipped the flip the door needed — the same
                // four doors (every one whose hand had to flip) ended facing the wrong way, in the creating transaction and in
                // this one alike.
                bool turnHand = PlacementGeometry.Opposes(fi.HandOrientation.X, fi.HandOrientation.Y, hx, hy) && fi.CanFlipHand;
                bool turnFacing = PlacementGeometry.Opposes(fi.FacingOrientation.X, fi.FacingOrientation.Y, fx, fy) && fi.CanFlipFacing;
                if (turnHand) fi.flipHand();
                if (turnFacing) fi.flipFacing();
            }
            if (t.Commit() != TransactionStatus.Committed && t.HasStarted() && !t.HasEnded()) t.RollBack();
        }
        catch (Exception)
        {
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
        }
    }

    private static void Collect(ExecutionResult result, ChangesetElementDto el, Element created)
    {
        result.Applied.Add(new AppliedEntry
        {
            ProposalGuid = el.ProposalGuid,
#if NET48
            RevitElementId = created.Id.IntegerValue,
#else
            RevitElementId = created.Id.Value,
#endif
            RevitUniqueId = created.UniqueId,
        });
    }
}
