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
            // proposal names no level.
            return levels.FirstOrDefault(l => string.Equals(l.Name, place.LevelName, StringComparison.OrdinalIgnoreCase))
                   ?? throw new InvalidOperationException($"level \"{place.LevelName}\" does not exist in this model — include it in the changeset or re-propose without a LevelName");
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
    // model's first type, and it never creates one here.
    private const string NoTypeName = "gap: no type name — Sentinel never takes the model's first type; re-propose with a TypeName";

    internal static WallType ResolveWallType(Document doc, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var types = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
            .Where(t => t.Kind == WallKind.Basic).ToList();
        return types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException($"wall type \"{typeName}\" does not exist in this model — load it (Sentinel creates no types), or re-propose with the exact name of a loaded type");
    }

    // MA-1a step 2: a floor's type among the model's FLOOR types only — a foundation slab type of the same name is another
    // thing (OfClass(FloorType) holds both) — and, as CreateType does, more than one is a person's decision.
    internal static FloorType ResolveFloorType(Document doc, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var hits = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>()
            .Where(t => !t.IsFoundationSlab && string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)).ToList();
        if (hits.Count == 0) throw new InvalidOperationException($"floor type \"{typeName}\" does not exist in this model — load it (Sentinel creates no types), or re-propose with the exact name of a loaded type");
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
        if (hits.Count == 0) throw new InvalidOperationException($"{kind} type \"{label}\" does not exist in this model — load it (Sentinel loads no families and creates no types), or re-propose with the exact name of a loaded type");
        if (hits.Count > 1) throw new InvalidOperationException($"{hits.Count} {kind} types are named \"{label}\" in this model — a person decides");
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

    /// MA-1: a create's Mark (ALL_MODEL_MARK), when it carries one (the bridge refuses one on a level or grid).
    private static void SetMark(Element e, ChangesetElementDto el)
    {
        if (!string.IsNullOrWhiteSpace(el.Place?.Mark)) Set(e, BuiltInParameter.ALL_MODEL_MARK, el.Place.Mark, el.Kind);
    }

    /// A level named exactly (case-insensitive, as ResolveLevel reads a LevelName); blank or missing fails.
    private static Level LevelNamed(Document doc, string name)
    {
        var n = name?.Trim();
        if (string.IsNullOrEmpty(n)) throw new InvalidOperationException("attach needs a BaseLevel and a TopLevel");
        return new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
                   .FirstOrDefault(l => string.Equals(l.Name, n, StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException($"level \"{n}\" does not exist in this model — re-run Promote, or re-propose naming a level it has");
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
        if (el.Kind == null || !PromoteWallsPlanner.Classes.TryGetValue(el.Kind, out var cls) || e.Category == null
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
        if (hits.Count == 0) throw new InvalidOperationException($"{kind} type \"{label}\" does not exist in this model — load it (Sentinel creates no types), or re-run Promote");
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
    private static void Set(Element e, BuiltInParameter bip, ElementId v)
    {
        var p = e.get_Parameter(bip);
        if (p == null || p.IsReadOnly || !p.Set(v)) throw new InvalidOperationException($"could not set {bip} on wall {e.UniqueId}");
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

    private static bool IsCreate(ChangesetElementDto e) => e.Op is null or "create";

    public ExecutionResult Execute(Document doc, ChangesetDto cs, HashSet<string> tickedGuids)
    {
        var result = new ExecutionResult();
        var toPlace = (cs.Elements ?? new List<ChangesetElementDto>())
            .Where(e => tickedGuids.Contains(e.ProposalGuid)).ToList();
        if (!toPlace.Any()) return result;
        // MA-1a item 6: never into a design option — refused before the transaction, for every source; the changeset stays
        // proposed (NotRun). A retype or an attach creates nothing, so it is not refused here. A retype of a floor, roof,
        // ceiling, door or window that is in an option is refused by Unsafe; a wall's is not (Unsafe keeps MA-0's checks
        // for walls — Promote's planner holds a wall in an option, an agent's changeset is not held: see Risks).
        if (toPlace.Any(IsCreate) && PlacementApply.DesignOptionRefusal(doc, "apply it") is { } inOption)
            return new ExecutionResult { NotRun = true, Error = inOption };

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

            // F-S2-2: read before this changeset's first wall exists — a level or grid above is no wall.
            var wallCreates = toPlace.Where(e => IsCreate(e) && e.Kind == "wall").ToList();
            var existing = wallCreates.Count > 0 ? ExistingWalls(doc) : null;
            List<LevelFact> stories = null; // read once, when the first wall needs its top (after this changeset's levels exist)
            foreach (var el in wallCreates)
            {
                at = Label(el);
                var c = el.Place.LocationCurve;
                var level = ResolveLevel(doc, el.Place);
                var wt = ResolveWallType(doc, el.Place.TypeName);
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

            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "floor"))
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

            // MA-1: a flat roof on its level — NewFootPrintRoof, and no footprint edge defines a slope (slopes are a later field).
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "roof"))
            {
                at = Label(el);
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var level = ResolveLevel(doc, el.Place);
                var rt = CreateType(doc, BuiltInCategory.OST_Roofs, "roof", null, el.Place.TypeName) as RoofType
                         ?? throw new InvalidOperationException($"roof \"{name}\": \"{el.Place.TypeName}\" is not a roof type Sentinel can sketch");
                var arr = new CurveArray();
                foreach (var c in Outline(el.Place.Boundary, level.Elevation, $"roof \"{name}\"")) arr.Append(c);
                // The API reads this "out" array before filling it (the SDK sample creates it first): passed null, the call throws a
                // bare "Value cannot be null." (B35, live).
                var edges = new ModelCurveArray();
                var roof = doc.Create.NewFootPrintRoof(arr, level, rt, out edges);
                foreach (ModelCurve mc in edges) roof.set_DefinesSlope(mc, false);
                if (el.Place.BaseOffset is double off) Set(roof, BuiltInParameter.ROOF_LEVEL_OFFSET_PARAM, off * MmToFeet, "roof");
                SetMark(roof, el);
                Collect(result, el, roof);
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
                    if (i < 0) throw new InvalidOperationException($"{el.Kind} \"{name}\": {why}");
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
                SetMark(fi, el);
                Collect(result, el, fi);
            }

            // MA-0: retype before attach. Only to a type already in the document; the model must still hold the type
            // the plan saw, or the reviewer approved something that is no longer true. Promote v1: one path for every kind —
            // a door or window swaps to a symbol of its own category and keeps its host; Unsafe repeats the planner's holds.
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
                if (e.ChangeTypeId(nt.Id) != ElementId.InvalidElementId) throw new InvalidOperationException($"Revit replaced the {el.Kind} on retype");
                if (host != null && !host.Equals((e as FamilyInstance)?.Host?.Id)) throw new InvalidOperationException($"{el.Kind} {e.UniqueId} lost its host on the swap");
                Collect(result, el, e);
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
            if (result.Applied.Count != toPlace.Count)
                throw new InvalidOperationException($"{toPlace.Count - result.Applied.Count} ticked element(s) of unsupported kind or op were not placed — the add-in is older than the bridge's vocabulary");
            // MA-1a item 6: each element this changeset CREATED goes to the workset its category names and to the view's
            // phase — inside this transaction, so Ctrl+Z takes them back with the element. A retype or attach target keeps
            // its own workset and phase.
            at = "the placement block";
            PlacementApply.Apply(Placement, result.Applied.Where(a => IsCreate(toPlace.First(e => e.ProposalGuid == a.ProposalGuid)))
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
                return new ExecutionResult { Error = "Revit did not commit the transaction (failure resolution rolled it back)" + (handler.RolledBack != null ? ": " + handler.RolledBack + GhostFailurePolicy.RolledBackNames(handler.RolledBackIds, labels) : "") };
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

    private static string Label(ChangesetElementDto el) => $"{el.Kind} \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\"";

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
