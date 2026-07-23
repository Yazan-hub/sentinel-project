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

        // Optional Office Modelling Guideline. When present, a wall's TYPE is chosen from the measured
        // thickness (GhostWallPairer) via the office's own catalogue, instead of the one-guess-per-layer
        // family the mapping supplies. Null = the pre-guideline behaviour, unchanged.
        private readonly GuidelineMatcher _guideline;

        public ElementPlacementFactory(
            Document doc, Level level,
            IReadOnlyDictionary<string, WallType> wallTypes,
            IReadOnlyDictionary<string, FamilySymbol> symbols,
            IReadOnlyDictionary<string, FloorType> floorTypes = null,
            IReadOnlyDictionary<string, ElementType> ceilingTypes = null,
            GuidelineMatcher guideline = null)
        {
            _doc = doc ?? throw new ArgumentNullException(nameof(doc));
            _level = level ?? throw new ArgumentNullException(nameof(level));
            _wallTypes = wallTypes ?? new Dictionary<string, WallType>();
            _symbols = symbols ?? new Dictionary<string, FamilySymbol>();
            _floorTypes = floorTypes ?? new Dictionary<string, FloorType>();
            _ceilingTypes = ceilingTypes ?? new Dictionary<string, ElementType>();
            _guideline = guideline;
        }

        /// <summary>Outcome of one placement attempt, so the engine can tally without re-inspecting.</summary>
        public enum Outcome { Placed, SkippedNoGeometry, SkippedUnknownType, SkippedUnsupported }

        /// <summary>Parameter-seeding notes (P2), deduped — a dirty layer places thousands of elements and
        /// would otherwise repeat the same line thousands of times. The engine folds these into its report.</summary>
        public readonly HashSet<string> Notes = new HashSet<string>();

        // "<typeId>|<paramName>" already written — a type parameter is shared, so writing it once per
        // instance is pointless work and pointless noise.
        private readonly HashSet<string> _typeParamsDone = new HashSet<string>();

        // Wall types CREATED during this build (a guideline gap → make the type at the measured thickness).
        // Keyed by name so the second 275mm wall reuses the type the first one created, never re-duplicates.
        private readonly Dictionary<string, WallType> _createdWallTypes =
            new Dictionary<string, WallType>(StringComparer.OrdinalIgnoreCase);
        /// <summary>Names of wall types this build created — surfaced in the report so a human sees the
        /// office standard was extended, not just that walls were placed.</summary>
        public readonly List<string> CreatedTypes = new List<string>();

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
                    return PlaceWall(el, wanted, map, out warning);

                case "Floors":
                    return PlaceSlab(el, wanted, isCeiling: false, map, out warning);

                case "Ceilings":
                    return PlaceSlab(el, wanted, isCeiling: true, map, out warning);

                case "Doors":
                case "Windows":
                case "Columns":
                case "Furniture":
                    return PlaceFamilyInstance(el, wanted, map.Category, map, out warning);

                default:
                    warning = $"Category '{map.Category}' (layer '{el.CadLayer}') not handled at LOD 200; skipped.";
                    return Outcome.SkippedUnsupported;
            }
        }

        /// <summary>
        /// Choose the wall TYPE. If a guideline is loaded and the wall has a measured thickness, the
        /// office's own type wins over the mapping's single-guess family. A guideline GAP (a measured
        /// thickness the office template has no type for) returns null with a reviewer-facing reason —
        /// the wall is then skipped, never built with an invented type or snapped to the wrong size.
        /// </summary>
        private string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason)
        {
            gapReason = null;
            if (_guideline == null || !_guideline.HasGuideline || el.ThicknessMm <= 0)
                return map.BdsFamilyType ?? map.BdsFamily; // pre-guideline behaviour

            // Discipline is the layer's first token: A-WALL-EXT -> "A", S-WALL -> "S".
            string disc = (el.CadLayer ?? "").Split('-', '_').FirstOrDefault();
            var res = _guideline.Resolve(new GuidelineInput
            {
                Category = "Walls",
                Layer = el.CadLayer,
                Discipline = disc,
                ThicknessMm = el.ThicknessMm,
            });

            if (res.Confidence <= 0)
            {
                // A gap is a "make it", not a "give up": clone the office's nearest real build-up and
                // resize it to the measured thickness, so the type is still a BDS assembly named to the
                // office convention. Only if creation genuinely can't proceed do we fall back to the gap.
                if (!string.IsNullOrWhiteSpace(res.Type) && res.Available != null && res.Available.Count > 0)
                {
                    var made = GhostTypeCreator.CreateWallType(
                        _doc, res.Type, el.ThicknessMm, res.Available, out string createReason);
                    if (made != null)
                    {
                        if (!_createdWallTypes.ContainsKey(made.Name))
                        {
                            _createdWallTypes[made.Name] = made;
                            CreatedTypes.Add($"{made.Name} (from a {el.ThicknessMm:0} mm wall on '{el.CadLayer}')");
                        }
                        return made.Name;
                    }
                    gapReason = $"{res.Why} Tried to create it and couldn't: {createReason}.";
                    return null;
                }
                gapReason = res.Why ?? $"No office type for a {el.ThicknessMm:0} mm wall on '{el.CadLayer}'.";
                return null;
            }
            return res.Type ?? map.BdsFamilyType ?? map.BdsFamily;
        }

        // ---- Walls: stable API 2021-2027, no #if ----
        private Outcome PlaceWall(GhostElement el, string wanted, LayerMapping map, out string warning)
        {
            warning = null;

            // The guideline decides the type from the measured thickness where it can; a gap is surfaced
            // and the wall skipped rather than mis-typed.
            string resolved = ResolveWallType(el, map, out string gapReason);
            if (gapReason != null)
            {
                warning = $"Wall on '{el.CadLayer}': {gapReason}";
                return Outcome.SkippedUnknownType;
            }
            wanted = resolved ?? wanted;

            // A wall element carries either a single open run (LocationCurve) or, when the CAD source
            // was a closed polyline on a wall layer, a boundary loop -> one wall per loop edge.
            var runs = new List<Curve>();
            if (el.LocationCurve != null && el.LocationCurve.IsBound)
                runs.Add(el.LocationCurve);
            else if (el.LocationLoop != null)
                runs.AddRange(el.LocationLoop.Where(c => c != null && c.IsBound));

            if (runs.Count == 0) return Outcome.SkippedNoGeometry;

            // Look up in the doc's types first, then in the types this build just created (a guideline
            // gap resolved to a new type at the measured thickness).
            if (wanted == null
                || (!_wallTypes.TryGetValue(wanted, out WallType wt) && !_createdWallTypes.TryGetValue(wanted, out wt)))
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
                ApplyParams(Wall.Create(_doc, run, wt.Id, _level.Id,
                            height, el.BaseElevation, flip: false, structural: false), map);
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
        private Outcome PlaceFamilyInstance(GhostElement el, string wanted, string category, LayerMapping map, out string warning)
        {
            warning = null;

            // A block insert carries an insertion point directly; a symbol drawn as a closed outline
            // (e.g. a column square) carries a loop instead — use its centroid so it still places.
            XYZ pt = el.LocationPoint ?? Centroid(el.LocationLoop);
            if (pt == null) return Outcome.SkippedNoGeometry;

            // Resolve the named symbol; if the model invented a name the doc lacks, fall back to ANY loaded
            // family of the matching category, so a column/furniture layer still places when a family of that
            // kind exists in the project. A blank project with no such family skips — honestly.
            FamilySymbol sym = null;
            if (wanted != null) _symbols.TryGetValue(wanted, out sym);
            if (sym == null) sym = FallbackSymbol(category);
            if (sym == null)
            {
                warning = $"No {category} family available (layer '{el.CadLayer}'); load one for this category " +
                          "or set the Ghost family library. Skipped.";
                return Outcome.SkippedUnknownType;
            }

            if (!sym.IsActive) sym.Activate(); // inactive symbols throw on NewFamilyInstance
            ApplyParams(_doc.Create.NewFamilyInstance(pt, sym, _level, StructuralType.NonStructural), map);
            return Outcome.Placed;
        }

        private static XYZ Centroid(IList<Curve> loop)
        {
            if (loop == null || loop.Count == 0) return null;
            double x = 0, y = 0, z = 0; int n = 0;
            foreach (Curve c in loop)
            {
                if (c == null || !c.IsBound) continue;
                XYZ p = c.GetEndPoint(0);
                x += p.X; y += p.Y; z += p.Z; n++;
            }
            return n > 0 ? new XYZ(x / n, y / n, z / n) : null;
        }

        private readonly Dictionary<string, FamilySymbol> _fallbackByCategory =
            new Dictionary<string, FamilySymbol>(StringComparer.OrdinalIgnoreCase);

        // First loaded family symbol of the category, or null when the project has none.
        private FamilySymbol FallbackSymbol(string category)
        {
            string key = category ?? "";
            if (_fallbackByCategory.TryGetValue(key, out FamilySymbol cached)) return cached;

            BuiltInCategory? bic = category switch
            {
                "Doors" => BuiltInCategory.OST_Doors,
                "Windows" => BuiltInCategory.OST_Windows,
                "Columns" => BuiltInCategory.OST_Columns,
                "Furniture" => BuiltInCategory.OST_Furniture,
                _ => (BuiltInCategory?)null,
            };
            FamilySymbol sym = bic == null ? null
                : new FilteredElementCollector(_doc).OfCategory(bic.Value)
                    .OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>().FirstOrDefault();

            _fallbackByCategory[key] = sym;
            return sym;
        }

        // ---- Floors & ceilings: the ONE genuine cross-version break ----
        private Outcome PlaceSlab(GhostElement el, string wanted, bool isCeiling, LayerMapping map, out string warning)
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
                return CreateCeiling(el, wanted, loop, map, out warning);
            return CreateFloor(el, wanted, loop, map, out warning);
        }

        private Outcome CreateFloor(GhostElement el, string wanted, CurveLoop loop, LayerMapping map, out string warning)
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
            ApplyParams(Floor.Create(_doc, new List<CurveLoop> { loop }, ft.Id, _level.Id), map);
#else
            // 2021 : legacy NewFloor(CurveArray, ...). Convert the loop to a CurveArray.
            var arr = new CurveArray();
            foreach (Curve c in loop) arr.Append(c);
            ApplyParams(_doc.Create.NewFloor(arr, ft, _level, structural: false), map);
#endif
            return Outcome.Placed;
        }

        private Outcome CreateCeiling(GhostElement el, string wanted, CurveLoop loop, LayerMapping map, out string warning)
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
            ApplyParams(Ceiling.Create(_doc, new List<CurveLoop> { loop }, ct.Id, _level.Id), map);
            return Outcome.Placed;
#else
            // Revit 2021 has NO public ceiling-creation API. Honestly report rather than fake it.
            warning = $"Ceiling creation is not supported by the Revit 2021 API (layer '{el.CadLayer}'); skipped.";
            return Outcome.SkippedUnsupported;
#endif
        }

        // ---- helpers ----

        /// <summary>
        /// P2: write the document-derived parameters onto a just-created element — the point of reading the
        /// specs at all. A spec's "external walls FR60" becomes an actual Fire Rating on the wall, so the
        /// IDS/referee pass downstream has real data to check instead of an empty LOD 200 shell.
        ///
        /// Instance parameter first. Spec data usually lives on the TYPE (Fire Rating on a WallType, not the
        /// wall), so a missing/read-only instance parameter falls back to the element's type — written once
        /// per (type, parameter) and NOTED, because that write is visible on every other instance of the type.
        ///
        /// Values are set via SetValueString for anything non-textual, so "200" is read in the document's
        /// display units. A raw Parameter.Set(double) would take it as 200 FEET.
        /// Never throws: a parameter that will not take a value is skipped with a note, never a failed build.
        /// </summary>
        private void ApplyParams(Element e, LayerMapping map)
        {
            if (e == null || map?.Params == null || map.Params.Count == 0) return;

            foreach (ParamAssignment pa in map.Params)
            {
                if (pa == null || string.IsNullOrWhiteSpace(pa.Name)) continue;

                Parameter p = e.LookupParameter(pa.Name);
                if (p != null && !p.IsReadOnly)
                {
                    if (SetValue(p, pa.Value))
                        Notes.Add($"Set '{pa.Name}' = '{pa.Value}' on layer '{map.CadLayer}' elements{Provenance(map)}.");
                    else
                        Notes.Add($"Could not apply '{pa.Name}' = '{pa.Value}' to layer '{map.CadLayer}' " +
                                  "elements (value not accepted by the parameter); skipped.");
                    continue;
                }

                var et = _doc.GetElement(e.GetTypeId()) as ElementType;
                Parameter tp = et?.LookupParameter(pa.Name);
                if (tp == null || tp.IsReadOnly)
                {
                    Notes.Add($"Parameter '{pa.Name}' not found on layer '{map.CadLayer}' elements or their type; skipped.");
                    continue;
                }

                if (!_typeParamsDone.Add(et.Id.ToString() + "|" + pa.Name)) continue; // already written for this type
                if (SetValue(tp, pa.Value))
                    Notes.Add($"Set TYPE parameter '{pa.Name}' = '{pa.Value}' on '{et.Name}'{Provenance(map)} " +
                              "— this affects every instance of that type.");
                else
                    Notes.Add($"Could not apply '{pa.Name}' = '{pa.Value}' to type '{et.Name}' " +
                              "(value not accepted by the parameter); skipped.");
            }
        }

        private static string Provenance(LayerMapping map) =>
            string.IsNullOrWhiteSpace(map.SourceDoc) ? "" : $" (from {map.SourceDoc})";

        private static bool SetValue(Parameter p, string value)
        {
            if (value == null) return false;
            try
            {
                // Text goes in verbatim; everything else through SetValueString so the document's units
                // and value-list rules apply (and an unparseable value simply returns false).
                return p.StorageType == StorageType.String ? p.Set(value) : p.SetValueString(value);
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException) { return false; }
        }

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
