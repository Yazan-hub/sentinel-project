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
        private readonly IReadOnlyDictionary<string, FloorType> _floorTypes;
        private readonly IReadOnlyDictionary<string, ElementType> _ceilingTypes;

        // The Office Modelling Guideline and type catalogue in force (guideline@n, type_catalog@n — GhostStandards).
        // With a guideline, a wall's TYPE is chosen from the measured thickness (GhostWallPairer) and checked against
        // the catalogue, instead of the one-guess-per-layer family the mapping supplies. Guideline none (HasGuideline
        // false) or null = the mapping's family, the pre-guideline behaviour — counted as such (WallsByMapping).
        private readonly GuidelineMatcher _guideline;

        // Massing is an LOD 100 estimate: when the office standard has no type for a wall, floor, door or window, place it
        // with the template's DEFAULT type and say so, rather than placing nothing (simulation 3.9, F43 —
        // every wall was skipped on a template without the pilot's type names). The DWG path keeps the
        // strict behaviour: a mis-typed element there is a real defect, a placeholder box here is the point.
        private readonly bool _placeholderTypes;

        // The document's default type of a group (the template's), or null — never the model's first type (D16, MA-1a).
        private T DefaultType<T>(ElementTypeGroup group) where T : ElementType =>
            _doc.GetElement(_doc.GetDefaultElementTypeId(group)) as T;

        public ElementPlacementFactory(
            Document doc, Level level,
            IReadOnlyDictionary<string, WallType> wallTypes,
            IReadOnlyDictionary<string, FloorType> floorTypes = null,
            IReadOnlyDictionary<string, ElementType> ceilingTypes = null,
            GuidelineMatcher guideline = null,
            bool placeholderTypes = false)
        {
            _placeholderTypes = placeholderTypes;
            _doc = doc ?? throw new ArgumentNullException(nameof(doc));
            _level = level ?? throw new ArgumentNullException(nameof(level));
            _wallTypes = wallTypes ?? new Dictionary<string, WallType>();
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

        /// <summary>Every element this build created, with what it is ("Walls on 'A-WALL-EXT'"): the failure handler's "ours"
        /// and the ids Placed is counted from after the commit (GhostBuilderOrchestrator). Filled at ApplyParams, which every
        /// create site calls with its new element.</summary>
        public readonly List<(ElementId Id, string What)> NewElements = new List<(ElementId Id, string What)>();

        /// <summary>A7: the ids of every type in the document before this build started (GhostBuilderOrchestrator). A type
        /// parameter is written only on a type NOT in it — one this build added. Null: no type is written.</summary>
        public ISet<long> TypesBefore;

        /// <summary>Who typed each wall (Revit walls; a skipped CAD wall counts one gap) — the build summary's lines: the
        /// guideline; the layer mapping (guideline none, or no measured thickness); the reviewer (a type picked in the review);
        /// nobody — a gap reported as a warning, or a massing placeholder noted for retyping. A wall skipped for having no
        /// geometry is in none of them.</summary>
        public int WallsByGuideline, WallsByMapping, WallsByReviewer, WallGaps;

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
                    return PlaceFamilyInstance(el, map.Category, map, out warning);

                default:
                    warning = $"Category '{map.Category}' (layer '{el.CadLayer}') not handled at LOD 200; skipped.";
                    return Outcome.SkippedUnsupported;
            }
        }

        /// <summary>
        /// Choose the wall TYPE and say who chose it (<paramref name="typedBy"/>: "guideline" | "mapping"). With a
        /// guideline and a measured thickness the office's own type wins over the mapping's single-guess family; with
        /// guideline none, or no measured thickness, it is the mapping's (the pre-guideline behaviour). The OPEN
        /// document decides presence (F54). A GAP — no type the office's standards stand behind — returns null with a
        /// reviewer-facing reason naming the type catalogue in force; the wall is then skipped (massing: placed on a
        /// named placeholder), never built with an invented type, an unrelated clone, or the wrong size.
        /// </summary>
        private string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason, out string typedBy)
        {
            gapReason = null;
            typedBy = "mapping";
            // GHB-5: a type the reviewer picked in the review is used as picked — over the guideline and the mapping — and
            // counted on its own summary line; a person chose it, so nothing re-decides it (founder decision F2).
            if (map.Source == "reviewer" && !string.IsNullOrWhiteSpace(map.BdsFamilyType ?? map.BdsFamily))
            {
                typedBy = "reviewer";
                return map.BdsFamilyType ?? map.BdsFamily;
            }
            bool guided = _guideline != null && _guideline.HasGuideline;
            if (!guided || el.ThicknessMm <= 0)
            {
                string mapped = map.BdsFamilyType ?? map.BdsFamily; // pre-guideline behaviour
                if (mapped == null)
                    gapReason = Gap($"{el.ThicknessMm:0} mm wall on '{el.CadLayer}'",
                        (guided ? "no measured thickness to choose a guideline type" : "guideline: none")
                        + ", and the layer mapping names no wall type");
                return mapped;
            }

            typedBy = "guideline";
            // Discipline is the layer's first token: A-WALL-EXT -> "A", S-WALL -> "S".
            string disc = (el.CadLayer ?? "").Split('-', '_').FirstOrDefault();
            var res = _guideline.Resolve(new GuidelineInput
            {
                Category = "Walls",
                Layer = el.CadLayer,
                Discipline = disc,
                ThicknessMm = el.ThicknessMm,
                Level = _level.Name,
            });

            if (!_guideline.HasCatalog)
                Notes.Add($"Wall types were not checked against a type catalogue (type_catalog: {_guideline.CatalogLabel}) — only against this document.");

            // The OPEN document is the truth (F54): if it has the type — or this build created it — use it, whatever
            // the catalogue says (on the pilot's own template, another office's catalogue once called it missing).
            if (!string.IsNullOrWhiteSpace(res.Type)
                && (_wallTypes.ContainsKey(res.Type) || _createdWallTypes.ContainsKey(res.Type)))
                return res.Type;

            if (!string.IsNullOrWhiteSpace(res.Type) && !_guideline.HasCatalog)
            {
                gapReason = Gap(res.Type, "not in this document; types checked against this document only");
                return null;
            }

            if (res.Confidence <= 0)
            {
                // A gap is a "make it", not a "give up": clone the nearest sibling the catalogue lists AND this
                // document has, resized to the measured thickness and named to the office convention. No such
                // sibling, or a resize that fails, is the gap — reported with the catalogue's label.
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
                    gapReason = Gap(res.Type, createReason);
                    return null;
                }
                gapReason = res.Why ?? Gap($"{el.ThicknessMm:0} mm wall on '{el.CadLayer}'", "the guideline names no wall type for it");
                return null;
            }
            if (res.Type != null) return res.Type;
            typedBy = "mapping"; // a guideline rule with no type or pattern: the mapping's family, as before
            return map.BdsFamilyType ?? map.BdsFamily;
        }

        // A gap names the type catalogue in force (GuidelineMatcher.Gap); with no matcher at all there is none.
        private string Gap(string what, string why) =>
            _guideline?.Gap(what, why) ?? $"gap: {what} — {why} (type_catalog: not loaded)";

        // ---- Walls: stable API 2021-2027, no #if ----
        private Outcome PlaceWall(GhostElement el, string wanted, LayerMapping map, out string warning)
        {
            warning = null;

            // The guideline decides the type from the measured thickness where it can; a gap is surfaced
            // and the wall skipped rather than mis-typed.
            string resolved = ResolveWallType(el, map, out string gapReason, out string typedBy);
            if (gapReason != null && _placeholderTypes)
            {
                var ph = DefaultType<WallType>(ElementTypeGroup.WallType);
                if (ph != null)
                {
                    Notes.Add($"Placeholder wall type '{ph.Name}' used for {el.ThicknessMm:0} mm walls on '{el.CadLayer}' — {gapReason.TrimEnd('.')}. Retype before issue.");
                    resolved = ph.Name; gapReason = null;
                    typedBy = "placeholder"; // counted in WallGaps once it is placed
                    if (!_wallTypes.ContainsKey(ph.Name)) _createdWallTypes[ph.Name] = ph;
                }
            }
            if (gapReason != null)
            {
                WallGaps++;
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
                WallGaps++;
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
            if (placed == 0) return Outcome.SkippedNoGeometry;
            if (typedBy == "guideline") WallsByGuideline += placed;
            else if (typedBy == "mapping") WallsByMapping += placed;
            else if (typedBy == "reviewer") WallsByReviewer += placed;
            else WallGaps += placed; // a massing placeholder: placed, but typed by nobody — reported for retyping
            return Outcome.Placed;
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
        private Outcome PlaceFamilyInstance(GhostElement el, string category, LayerMapping map, out string warning)
        {
            warning = null;

            // A block insert carries an insertion point directly; a symbol drawn as a closed outline
            // (e.g. a column square) carries a loop instead — use its centroid so it still places.
            XYZ pt = el.LocationPoint ?? Centroid(el.LocationLoop);
            if (pt == null) return Outcome.SkippedNoGeometry;

            // The ONE loaded (family, type) the row names, among this category's types only (GhostTypePick: exact, or a gap a
            // person resolves in the review) — never a symbol of another category that shares the type name, never the first
            // one loaded. Massing (LOD 100) alone may use the category's DEFAULT family type, declared in a Note like its walls.
            List<FamilySymbol> syms = SymbolsOf(category);
            int i = GhostTypePick.Pick(syms.Select(s => (s.FamilyName, s.Name)).ToList(), category, map.BdsFamily, map.BdsFamilyType, out string why);
            FamilySymbol sym = i >= 0 ? syms[i] : null;
            if (sym == null && _placeholderTypes)
            {
                sym = DefaultSymbol(category);
                if (sym != null)
                    Notes.Add($"Placeholder {category} type '{sym.FamilyName} : {sym.Name}' (the template's default) used on '{el.CadLayer}' — the massing names no {category} type. Retype before issue.");
            }
            if (sym == null)
            {
                warning = $"{category} on '{el.CadLayer}': {why}; skipped.";
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

        private readonly Dictionary<string, List<FamilySymbol>> _symbolsByCategory =
            new Dictionary<string, List<FamilySymbol>>(StringComparer.OrdinalIgnoreCase);

        // The loaded family types of one point-family category, read once per build (after the preloader ran). The
        // category key → BuiltInCategory map is Compat's (locale-safe), not a second switch.
        private List<FamilySymbol> SymbolsOf(string category)
        {
            string key = category ?? "";
            if (_symbolsByCategory.TryGetValue(key, out List<FamilySymbol> cached)) return cached;
            BuiltInCategory bic = Compat.ResolveCategoryKey(key);
            var syms = bic == BuiltInCategory.INVALID ? new List<FamilySymbol>()
                : new FilteredElementCollector(_doc).OfCategory(bic).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>().ToList();
            _symbolsByCategory[key] = syms;
            return syms;
        }

        // Massing only: the category's default family type in this document (the template's), or null.
        private FamilySymbol DefaultSymbol(string category)
        {
            BuiltInCategory bic = Compat.ResolveCategoryKey(category ?? "");
            return bic == BuiltInCategory.INVALID ? null
                : _doc.GetElement(_doc.GetDefaultFamilyTypeId(new ElementId(bic))) as FamilySymbol;
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
            if (ft == null && _placeholderTypes)
            {
                ft = DefaultType<FloorType>(ElementTypeGroup.FloorType);
                if (ft != null)
                    Notes.Add($"Placeholder floor type '{ft.Name}' used on '{el.CadLayer}' — the office standard names no floor type for the massing. Retype before issue.");
            }
            if (ft == null)
            {
                warning = $"FloorType '{wanted ?? ""}' not found (layer '{el.CadLayer}'); skipped.";
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
        /// per (type, parameter) and NOTED, because that write is visible on every other instance of the type. A7: only a
        /// type this build added is written; a type the model already had is left alone and the Note says why.
        ///
        /// Values are set via SetValueString for anything non-textual, so "200" is read in the document's
        /// display units. A raw Parameter.Set(double) would take it as 200 FEET.
        /// Never throws: a parameter that will not take a value is skipped with a note, never a failed build.
        /// </summary>
        private void ApplyParams(Element e, LayerMapping map)
        {
            // Every create site (Wall.Create, NewFamilyInstance, Floor.Create/NewFloor, Ceiling.Create) passes its new element
            // here: record it as this build's (GHB-5 — the failure handler's "ours", and what Placed is counted from).
            if (e != null) NewElements.Add((e.Id, $"{map?.Category ?? "Element"} on '{map?.CadLayer}'"));
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

                if (!_typeParamsDone.Add(et.Id.ToString() + "|" + pa.Name)) continue; // already decided for this type
                // A7: only a type this build added is written; on any other the write would change the user's instances too.
                bool added = TypesBefore != null && !TypesBefore.Contains(et.Id.IdValue());
                string blocked = GhostFailurePolicy.TypeParamBlocked(added, et.Name, added ? 0 : ExistingInstances(et));
                if (blocked != null)
                {
                    Notes.Add($"'{pa.Name}' = '{pa.Value}' for layer '{map.CadLayer}' elements{Provenance(map)}: {blocked}.");
                    continue;
                }
                if (SetValue(tp, pa.Value))
                    Notes.Add($"Set TYPE parameter '{pa.Name}' = '{pa.Value}' on '{et.Name}'{Provenance(map)} " +
                              "— this affects every instance of that type.");
                else
                    Notes.Add($"Could not apply '{pa.Name}' = '{pa.Value}' to type '{et.Name}' " +
                              "(value not accepted by the parameter); skipped.");
            }
        }

        // The instances of a type that are not this build's — what a type-parameter write would silently change (A7).
        private int ExistingInstances(ElementType et)
        {
            var mine = new HashSet<long>(NewElements.Select(n => n.Id.IdValue()));
            long typeId = et.Id.IdValue();
            var c = new FilteredElementCollector(_doc).WhereElementIsNotElementType();
            if (et.Category != null) c = c.OfCategoryId(et.Category.Id);
            return c.Count(x => x.GetTypeId().IdValue() == typeId && !mine.Contains(x.Id.IdValue()));
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
