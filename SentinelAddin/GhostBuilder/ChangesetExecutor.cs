#nullable disable
// Governed AI modeling (A2): places the elements a human ticked, in ONE transaction, collecting
// the created ElementIds per proposal_guid — the golden thread back to the audit trail. Any
// failure rolls back the WHOLE changeset (partially_applied means "human unticked some", never
// "some failed silently"). Contract geometry is MILLIMETRES; Revit internal units are feet.
// MA-0: a ghost's op is create (a new element), retype (an existing wall, floor, roof, ceiling, door or window to a type
// already in the document — a door or window keeps its host) or attach (an existing wall's base and top to story levels). Every element the changeset touched is stamped (ProvenanceStamp),
// inside this transaction, and the transaction is named so the undo watcher can find it.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Autodesk.Revit.DB;
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
    }

    private static XYZ Pt(double[] p) => new XYZ(p[0] * MmToFeet, p[1] * MmToFeet, p[2] * MmToFeet);

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
        if (place?.BaseElevation is double mm)
        {
            var ft = mm * MmToFeet;
            return levels.OrderBy(l => Math.Abs(l.Elevation - ft)).First();
        }
        return levels.OrderBy(l => l.Elevation).First();
    }

    // A named type that doesn't exist FAILS the changeset (named reason → declined) rather than
    // silently substituting: the human ticked a row showing that TypeName, and the IDS adjudicated
    // the proposal it labels — placing an arbitrary type would break the governance chain at its
    // last link. A proposal with NO TypeName is a gap and fails too (D16): Sentinel never takes the
    // model's first type, and it never creates one here.
    private const string NoTypeName = "gap: no type name — Sentinel never takes the model's first type; re-propose with a TypeName";

    private static WallType ResolveWallType(Document doc, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var types = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
            .Where(t => t.Kind == WallKind.Basic).ToList();
        return types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException($"wall type \"{typeName}\" does not exist in this model — load it (Sentinel creates no types), or re-propose with the exact name of a loaded type");
    }

    private static FloorType ResolveFloorType(Document doc, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var types = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().ToList();
        return types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException($"floor type \"{typeName}\" does not exist in this model — load it (Sentinel creates no types), or re-propose with the exact name of a loaded type");
    }

    /// A level named exactly (case-insensitive, as ResolveLevel reads a LevelName); blank or missing fails.
    private static Level LevelNamed(Document doc, string name)
    {
        var n = name?.Trim();
        if (string.IsNullOrEmpty(n)) throw new InvalidOperationException("attach needs a BaseLevel and a TopLevel");
        return new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
                   .FirstOrDefault(l => string.Equals(l.Name, n, StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException($"level \"{n}\" does not exist in this model — re-run Promote");
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
        if (kind == "wall") return null;
        string what = $"{kind} {e.UniqueId}";
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

    private static void Set(Element e, BuiltInParameter bip, double v)
    {
        var p = e.get_Parameter(bip);
        if (p == null || p.IsReadOnly || !p.Set(v)) throw new InvalidOperationException($"could not set {bip} on wall {e.UniqueId}");
    }

    private static bool IsCreate(ChangesetElementDto e) => e.Op is null or "create";

    public ExecutionResult Execute(Document doc, ChangesetDto cs, HashSet<string> tickedGuids)
    {
        var result = new ExecutionResult();
        var toPlace = (cs.Elements ?? new List<ChangesetElementDto>())
            .Where(e => tickedGuids.Contains(e.ProposalGuid)).ToList();
        if (!toPlace.Any()) return result;

        using var t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id)); // the undo watcher finds it by this name
        t.Start();
        try
        {
            // Levels first: walls/floors in the same changeset may target them by name.
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "level"))
            {
                var lvl = Level.Create(doc, (el.Place?.BaseElevation ?? 0) * MmToFeet);
                if (!string.IsNullOrWhiteSpace(el.Validate?.Identity?.Name)) lvl.Name = el.Validate.Identity.Name;
                Collect(result, el, lvl);
            }
            doc.Regenerate();

            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "grid"))
            {
                var c = el.Place.LocationCurve;
                var grid = Grid.Create(doc, Line.CreateBound(Pt(c.Start), Pt(c.End)));
                if (!string.IsNullOrWhiteSpace(el.Validate?.Identity?.Name)) grid.Name = el.Validate.Identity.Name;
                Collect(result, el, grid);
            }

            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "wall"))
            {
                var c = el.Place.LocationCurve;
                var level = ResolveLevel(doc, el.Place);
                var wt = ResolveWallType(doc, el.Place.TypeName);
                var baseMm = el.Place.BaseElevation ?? 0;
                var topMm = el.Place.TopElevation ?? (baseMm + 3000);
                // An inverted/zero height is a broken proposal — fail the changeset honestly rather
                // than silently placing a coerced wall that doesn't match what was reviewed.
                if (topMm <= baseMm)
                    throw new InvalidOperationException($"wall \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\": TopElevation ({topMm}mm) must be above BaseElevation ({baseMm}mm)");
                var heightFt = (topMm - baseMm) * MmToFeet;
                var offsetFt = baseMm * MmToFeet - level.Elevation;
                var wall = Wall.Create(doc, Line.CreateBound(Pt(c.Start), Pt(c.End)), wt.Id, level.Id, heightFt, offsetFt, false, false);
                Collect(result, el, wall);
            }

            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind == "floor"))
            {
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
                Collect(result, el, floor);
            }

            // MA-0: retype before attach. Only to a type already in the document; the model must still hold the type
            // the plan saw, or the reviewer approved something that is no longer true. Promote v1: one path for every kind —
            // a door or window swaps to a symbol of its own category and keeps its host; Unsafe repeats the planner's holds.
            foreach (var el in toPlace.Where(e => e.Op == "retype"))
            {
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

            // Every ticked element must have been handled by a loop above — if the bridge's
            // vocabulary ever grows past the executor's, the mismatch fails the changeset HERE,
            // inside the transaction, instead of surfacing as a 400 after elements already exist.
            if (result.Applied.Count != toPlace.Count)
                throw new InvalidOperationException($"{toPlace.Count - result.Applied.Count} ticked element(s) of unsupported kind or op were not placed — the add-in is older than the bridge's vocabulary");
            // The stamp: once per element, with every guid of this changeset that touched it, merged onto the element's
            // earlier stamp (one entity per schema) — inside this transaction, so Ctrl+Z removes it too.
            foreach (var g in result.Applied.GroupBy(a => a.RevitUniqueId))
                ProvenanceStamp.Write(doc.GetElement(g.Key), cs.Id, cs.Source, g.Select(a => a.ProposalGuid));
            // Revit's failure resolution can roll a transaction back WITHOUT throwing — reporting
            // the collected ids then would be the "some failed silently" lie this file forbids.
            if (t.Commit() != TransactionStatus.Committed)
                return new ExecutionResult { Error = "Revit did not commit the transaction (failure resolution rolled it back)" };
            return result;
        }
        catch (Exception ex)
        {
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            return new ExecutionResult { Error = ex.Message }; // fresh result: NOTHING was applied
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
