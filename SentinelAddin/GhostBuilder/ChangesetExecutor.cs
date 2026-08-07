#nullable disable
// Governed AI modeling (A2): places the elements a human ticked, in ONE transaction, collecting
// the created ElementIds per proposal_guid — the golden thread back to the audit trail. Any
// failure rolls back the WHOLE changeset (partially_applied means "human unticked some", never
// "some failed silently"). Contract geometry is MILLIMETRES; Revit internal units are feet.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder;

public sealed class ChangesetExecutor
{
    private const double MmToFeet = 1.0 / 304.8;

    public sealed class ExecutionResult
    {
        public List<AppliedEntry> Applied { get; } = new();
        public string Error { get; set; }
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
    // last link. Only a proposal with NO TypeName may take the model's first type.
    private static WallType ResolveWallType(Document doc, string typeName)
    {
        var types = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
            .Where(t => t.Kind == WallKind.Basic).ToList();
        if (!types.Any()) throw new InvalidOperationException("the model has no basic wall types");
        if (string.IsNullOrWhiteSpace(typeName)) return types.First();
        return types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException($"wall type \"{typeName}\" does not exist in this model — load or create it, or re-propose without a TypeName");
    }

    private static FloorType ResolveFloorType(Document doc, string typeName)
    {
        var types = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().ToList();
        if (!types.Any()) throw new InvalidOperationException("the model has no floor types");
        if (string.IsNullOrWhiteSpace(typeName)) return types.First();
        return types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException($"floor type \"{typeName}\" does not exist in this model — load or create it, or re-propose without a TypeName");
    }

    public ExecutionResult Execute(Document doc, ChangesetDto cs, HashSet<string> tickedGuids)
    {
        var result = new ExecutionResult();
        var toPlace = (cs.Elements ?? new List<ChangesetElementDto>())
            .Where(e => tickedGuids.Contains(e.ProposalGuid)).ToList();
        if (!toPlace.Any()) return result;

        using var t = new Transaction(doc, $"Sentinel AI changeset: {cs.Name}");
        t.Start();
        try
        {
            // Levels first: walls/floors in the same changeset may target them by name.
            foreach (var el in toPlace.Where(e => e.Kind == "level"))
            {
                var lvl = Level.Create(doc, (el.Place?.BaseElevation ?? 0) * MmToFeet);
                if (!string.IsNullOrWhiteSpace(el.Validate?.Identity?.Name)) lvl.Name = el.Validate.Identity.Name;
                Collect(result, el, lvl);
            }
            doc.Regenerate();

            foreach (var el in toPlace.Where(e => e.Kind == "grid"))
            {
                var c = el.Place.LocationCurve;
                var grid = Grid.Create(doc, Line.CreateBound(Pt(c.Start), Pt(c.End)));
                if (!string.IsNullOrWhiteSpace(el.Validate?.Identity?.Name)) grid.Name = el.Validate.Identity.Name;
                Collect(result, el, grid);
            }

            foreach (var el in toPlace.Where(e => e.Kind == "wall"))
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

            foreach (var el in toPlace.Where(e => e.Kind == "floor"))
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

            // Every ticked element must have been handled by a kind loop above — if the bridge's
            // vocabulary ever grows past the executor's, the mismatch fails the changeset HERE,
            // inside the transaction, instead of surfacing as a 400 after elements already exist.
            if (result.Applied.Count != toPlace.Count)
                throw new InvalidOperationException($"{toPlace.Count - result.Applied.Count} ticked element(s) of unsupported kind were not placed — the add-in is older than the bridge's vocabulary");
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
