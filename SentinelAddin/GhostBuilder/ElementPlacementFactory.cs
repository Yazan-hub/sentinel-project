#nullable disable
// ponytail: nullable off to match the ported GhostBuilder module; annotate when hardening.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// Universal placement factory: routes one mapped CAD element to the correct Revit creation
    /// call based on its category (Walls -> Wall.Create, Floors/Ceilings -> *.Create with a closed
    /// loop, point families -> NewFamilyInstance). Extracted out of GhostPlacementEngine so the
    /// engine just iterates and this class owns the API-shape decisions.
    ///
    /// Anti-hallucination: every type/symbol the LLM names is looked up in the live-doc caches
    /// passed in; a name the model invents resolves to null and is skipped with a warning, never
    /// thrown into Revit.
    ///
    /// Version handling: Wall.Create and NewFamilyInstance are stable across Revit 2021-2027, so
    /// they carry NO #if. Floor/Ceiling creation is the ONLY real break — Floor.Create/Ceiling.Create
    /// are 2022+; 2021 has NewFloor (and no ceiling API) — so those are the only guarded calls.
    ///
    /// Caller owns the Transaction (this only creates elements inside one).
    /// </summary>
    public sealed class ElementPlacementFactory
    {
        private readonly Document _doc;
        private readonly Level _level;
        private readonly IReadOnlyDictionary<string, WallType> _wallTypes;
        private readonly IReadOnlyDictionary<string, FamilySymbol> _symbols;
        private readonly IReadOnlyDictionary<string, FloorType> _floorTypes;
        private readonly IReadOnlyDictionary<string, ElementType> _ceilingTypes;

        public ElementPlacementFactory(
            Document doc, Level level,
            IReadOnlyDictionary<string, WallType> wallTypes,
            IReadOnlyDictionary<string, FamilySymbol> symbols,
            IReadOnlyDictionary<string, FloorType> floorTypes = null,
            IReadOnlyDictionary<string, ElementType> ceilingTypes = null)
        {
            _doc = doc ?? throw new ArgumentNullException(nameof(doc));
            _level = level ?? throw new ArgumentNullException(nameof(level));
            _wallTypes = wallTypes ?? new Dictionary<string, WallType>();
            _symbols = symbols ?? new Dictionary<string, FamilySymbol>();
            _floorTypes = floorTypes ?? new Dictionary<string, FloorType>();
            _ceilingTypes = ceilingTypes ?? new Dictionary<string, ElementType>();
        }

        /// <summary>Outcome of one placement attempt, so the engine can tally without re-inspecting.</summary>
        public enum Outcome { Placed, SkippedNoGeometry, SkippedUnknownType, SkippedUnsupported }

        /// <summary>
        /// Place one element. <paramref name="warning"/> is set (non-null) when the element is
        /// skipped for a reason worth surfacing to the user.
        /// </summary>
        public Outcome Place(GhostElement el, LayerMapping map, out string warning)
        {
            warning = null;
            string wanted = map.BdsFamilyType ?? map.BdsFamily;

            // Category strings align with the LLM mapping / BDS conventions (see GhostPlacementEngine).
            switch (map.Category)
            {
                case "Walls":
                    return PlaceWall(el, wanted, out warning);

                case "Floors":
                    return PlaceSlab(el, wanted, isCeiling: false, out warning);

                case "Ceilings":
                    return PlaceSlab(el, wanted, isCeiling: true, out warning);

                case "Doors":
                case "Windows":
                case "Columns":
                case "Furniture":
                    return PlaceFamilyInstance(el, wanted, out warning);

                default:
                    warning = $"Category '{map.Category}' (layer '{el.CadLayer}') not handled at LOD 200; skipped.";
                    return Outcome.SkippedUnsupported;
            }
        }

        // ---- Walls: stable API 2021-2027, no #if ----
        private Outcome PlaceWall(GhostElement el, string wanted, out string warning)
        {
            warning = null;

            // A wall element carries either a single open run (LocationCurve) or, when the CAD source
            // was a closed polyline on a wall layer, a boundary loop -> one wall per loop edge.
            var runs = new List<Curve>();
            if (el.LocationCurve != null && el.LocationCurve.IsBound)
                runs.Add(el.LocationCurve);
            else if (el.LocationLoop != null)
                runs.AddRange(el.LocationLoop.Where(c => c != null && c.IsBound));

            if (runs.Count == 0) return Outcome.SkippedNoGeometry;

            if (wanted == null || !_wallTypes.TryGetValue(wanted, out WallType wt))
            {
                warning = $"WallType '{wanted}' not found (layer '{el.CadLayer}'); skipped.";
                return Outcome.SkippedUnknownType;
            }

            double minLen = _doc.Application.ShortCurveTolerance;
            double height = Math.Max(el.TopElevation - el.BaseElevation, minLen * 10);

            int placed = 0;
            foreach (Curve raw in runs)
            {
                // Wall.Create demands a curve in a HORIZONTAL plane and above the min length. Dirty
                // CAD carries lines whose endpoints differ in Z or are near-degenerate; flatten and
                // length-check each run so a single bad edge is skipped, not fatal to the element.
                Curve run = ToHorizontal(raw);
                if (run == null || run.Length < minLen) continue;
                Wall.Create(_doc, run, wt.Id, _level.Id,
                            height, el.BaseElevation, flip: false, structural: false);
                placed++;
            }
            return placed > 0 ? Outcome.Placed : Outcome.SkippedNoGeometry;
        }

        /// <summary>
        /// Flatten a Line to a single elevation (its start Z) so it lies in a horizontal plane, as
        /// Wall.Create requires. Already-horizontal lines and non-line curves are returned unchanged;
        /// a line that collapses to near-zero length once flattened returns null (skip it). Anything
        /// still invalid is caught by the per-element guard in GhostPlacementEngine.
        /// </summary>
        private Curve ToHorizontal(Curve c)
        {
            if (c is Line line)
            {
                XYZ p0 = line.GetEndPoint(0), p1 = line.GetEndPoint(1);
                if (Math.Abs(p0.Z - p1.Z) < 1e-9) return c; // already horizontal
                var f1 = new XYZ(p1.X, p1.Y, p0.Z);
                if (p0.DistanceTo(f1) < _doc.Application.ShortCurveTolerance) return null; // near-vertical
                return Line.CreateBound(p0, f1);
            }
            return c;
        }

        // ---- Point families (doors/windows/columns/furniture): stable API, no #if ----
        private Outcome PlaceFamilyInstance(GhostElement el, string wanted, out string warning)
        {
            warning = null;
            if (el.LocationPoint == null) return Outcome.SkippedNoGeometry;

            if (wanted == null || !_symbols.TryGetValue(wanted, out FamilySymbol sym))
            {
                warning = $"FamilySymbol '{wanted}' not found (layer '{el.CadLayer}'); skipped.";
                return Outcome.SkippedUnknownType;
            }

            if (!sym.IsActive) sym.Activate(); // inactive symbols throw on NewFamilyInstance
            _doc.Create.NewFamilyInstance(el.LocationPoint, sym, _level, StructuralType.NonStructural);
            return Outcome.Placed;
        }

        // ---- Floors & ceilings: the ONE genuine cross-version break ----
        private Outcome PlaceSlab(GhostElement el, string wanted, bool isCeiling, out string warning)
        {
            warning = null;

            // Requires a valid closed boundary. The current extractor does not produce one yet, so
            // this is where floor/ceiling mappings honestly bottom out until loop-extraction lands.
            if (!TryBuildClosedLoop(el, out CurveLoop loop))
            {
                warning = $"{(isCeiling ? "Ceiling" : "Floor")} on layer '{el.CadLayer}' skipped: its CAD " +
                          "geometry is not a closed polyline, so no boundary loop could be formed.";
                return Outcome.SkippedNoGeometry;
            }

            if (isCeiling)
                return CreateCeiling(el, wanted, loop, out warning);
            return CreateFloor(el, wanted, loop, out warning);
        }

        private Outcome CreateFloor(GhostElement el, string wanted, CurveLoop loop, out string warning)
        {
            warning = null;
            FloorType ft = ResolveType(_floorTypes, wanted);
            if (ft == null)
            {
                warning = $"FloorType '{wanted}' not found (layer '{el.CadLayer}'); skipped.";
                return Outcome.SkippedUnknownType;
            }

#if REVIT2022_OR_GREATER
            // 2022+ : Floor.Create takes a list of CurveLoops.
            Floor.Create(_doc, new List<CurveLoop> { loop }, ft.Id, _level.Id);
#else
            // 2021 : legacy NewFloor(CurveArray, ...). Convert the loop to a CurveArray.
            var arr = new CurveArray();
            foreach (Curve c in loop) arr.Append(c);
            _doc.Create.NewFloor(arr, ft, _level, structural: false);
#endif
            return Outcome.Placed;
        }

        private Outcome CreateCeiling(GhostElement el, string wanted, CurveLoop loop, out string warning)
        {
            warning = null;
#if REVIT2022_OR_GREATER
            ElementType ct = ResolveType(_ceilingTypes, wanted);
            if (ct == null)
            {
                warning = $"CeilingType '{wanted}' not found (layer '{el.CadLayer}'); skipped.";
                return Outcome.SkippedUnknownType;
            }
            // 2022+ : Ceiling.Create takes a list of CurveLoops.
            Ceiling.Create(_doc, new List<CurveLoop> { loop }, ct.Id, _level.Id);
            return Outcome.Placed;
#else
            // Revit 2021 has NO public ceiling-creation API. Honestly report rather than fake it.
            warning = $"Ceiling creation is not supported by the Revit 2021 API (layer '{el.CadLayer}'); skipped.";
            return Outcome.SkippedUnsupported;
#endif
        }

        // ---- helpers ----

        /// <summary>
        /// Build a validated, planar-ish closed CurveLoop from the element's boundary curves.
        /// Returns false if there is no loop, any curve is unbound, or the loop isn't closed —
        /// so a bad boundary is skipped, never thrown into Floor/Ceiling.Create.
        /// </summary>
        private static bool TryBuildClosedLoop(GhostElement el, out CurveLoop loop)
        {
            loop = null;
            IList<Curve> curves = el.LocationLoop;
            if (curves == null || curves.Count < 3) return false;
            if (curves.Any(c => c == null || !c.IsBound)) return false;

            try
            {
                // CurveLoop.Create validates connectivity + closure; it throws on an open/disjoint
                // loop, which we treat as "skip" rather than letting it reach placement.
                loop = CurveLoop.Create(curves);
                return loop != null && !loop.IsOpen();
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException) { return false; }
            catch (InvalidOperationException) { return false; }
        }

        private static T ResolveType<T>(IReadOnlyDictionary<string, T> cache, string wanted) where T : class =>
            wanted != null && cache.TryGetValue(wanted, out T t) ? t : null;
    }
}
