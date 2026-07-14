using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;

namespace BadranDesignStudio.Sentinel
{
    // ---------------------------------------------------------------------
    // 1. EXTRACTION
    // ---------------------------------------------------------------------

    /// <summary>Pulls unique CAD layer names from a 2D DWG import in a Revit doc.</summary>
    public sealed class GhostCadExtractor
    {
        private readonly Document _doc;

        public GhostCadExtractor(Document doc) => _doc = doc;

        public IEnumerable<string> ExtractCadLayers(ImportInstance cadLink)
        {
            var layers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            GeometryElement geo = cadLink.get_Geometry(new Options { ComputeReferences = true });
            if (geo == null) return layers;

            // Null-safe pull of one layer name from a graphics style.
            void Collect(GeometryObject o)
            {
                ElementId id = o.GraphicsStyleId;
                if (id == ElementId.InvalidElementId) return;

                if (_doc.GetElement(id) is GraphicsStyle g
                    && g.GraphicsStyleType == GraphicsStyleType.Projection
                    && g.GraphicsStyleCategory != null)          // guards NRE on Category
                {
                    layers.Add(g.GraphicsStyleCategory.Name);
                }
            }

            // Traverse BOTH root-level geometry and nested-instance geometry.
            foreach (GeometryObject obj in geo)
            {
                if (obj is GeometryInstance instance)
                    foreach (GeometryObject nested in instance.GetInstanceGeometry())
                        Collect(nested);
                else
                    Collect(obj);
            }

            return layers;
        }

        /// <summary>
        /// Same traversal as ExtractCadLayers, but emits placeable GhostElements carrying
        /// real geometry: curves become wall runs, block inserts become point families.
        /// Elements with no usable geometry (hatches, text, unmapped layers) are dropped.
        /// </summary>
        public IEnumerable<GhostElement> ExtractGhostElements(ImportInstance cadLink)
        {
            var results = new List<GhostElement>();

            GeometryElement geo = cadLink.get_Geometry(new Options { ComputeReferences = true });
            if (geo == null) return results;

            // Resolve the CAD layer name from a geometry object's graphics style. Null if none.
            string LayerOf(GeometryObject o)
            {
                ElementId id = o.GraphicsStyleId;
                if (id == ElementId.InvalidElementId) return null;
                return _doc.GetElement(id) is GraphicsStyle g && g.GraphicsStyleCategory != null
                    ? g.GraphicsStyleCategory.Name
                    : null;
            }

            // Turn one geometry object into zero or more GhostElements.
            // insertPoint is set when this object came from a block instance (door/window/furniture).
            void Emit(GeometryObject o, XYZ insertPoint)
            {
                string layer = LayerOf(o);
                if (layer == null) return;

                switch (o)
                {
                    case Line line:
                        results.Add(MakeCurveEl(layer, line));
                        break;

                    case Arc arc:
                        results.Add(MakeCurveEl(layer, arc));
                        break;

                    case PolyLine poly:
                        // Split into straight segments; each becomes its own wall run.
                        IList<XYZ> pts = poly.GetCoordinates();
                        for (int i = 0; i < pts.Count - 1; i++)
                        {
                            if (pts[i].DistanceTo(pts[i + 1]) < _doc.Application.ShortCurveTolerance)
                                continue; // skip degenerate segment
                            results.Add(MakeCurveEl(layer, Line.CreateBound(pts[i], pts[i + 1])));
                        }
                        break;

                    default:
                        // A block insert with no curve of its own -> record its origin as a point family.
                        if (insertPoint != null)
                            results.Add(new GhostElement
                            {
                                CadLayer = layer,
                                LocationPoint = insertPoint,
                                BaseElevation = insertPoint.Z
                            });
                        break;
                }
            }

            foreach (GeometryObject obj in geo)
            {
                if (obj is GeometryInstance instance)
                {
                    // The block's insertion point = its transform origin. Emit it once as a
                    // point candidate, and also walk its curves in case the block IS the geometry
                    // (e.g. a wall drawn inside a block rather than a symbolic door).
                    XYZ origin = instance.Transform.Origin;
                    var nested = instance.GetInstanceGeometry();

                    bool hasCurve = nested.Any(n => n is Curve || n is PolyLine);
                    foreach (GeometryObject n in nested)
                        Emit(n, hasCurve ? null : origin);

                    // Pure symbolic block (no curves) -> single point family at the origin.
                    if (!hasCurve)
                    {
                        string layer = LayerOf(instance) ?? nested.Select(LayerOf).FirstOrDefault(l => l != null);
                        if (layer != null)
                            results.Add(new GhostElement
                            {
                                CadLayer = layer,
                                LocationPoint = origin,
                                BaseElevation = origin.Z
                            });
                    }
                }
                else
                {
                    Emit(obj, null);
                }
            }

            return results;
        }

        private GhostElement MakeCurveEl(string layer, Curve c) => new GhostElement
        {
            CadLayer = layer,
            LocationCurve = c,
            BaseElevation = c.GetEndPoint(0).Z,
            TopElevation = c.GetEndPoint(0).Z + WallDefaultHeightFt
        };

        // LOD 200 default wall height when the 2D CAD carries no Z info (10 ft).
        // ponytail: hard-coded; lift to per-category config when projects vary floor-to-floor.
        private const double WallDefaultHeightFt = 10.0;
    }

    // ---------------------------------------------------------------------
    // 2. PLACEMENT
    // ---------------------------------------------------------------------

    /// <summary>
    /// One CAD element resolved to geometry, ready to place. The extractor produces these
    /// alongside the layer names; MappingResult tells us WHICH family each layer becomes.
    /// </summary>
    public sealed class GhostElement
    {
        public string CadLayer { get; set; }
        public Curve LocationCurve { get; set; }   // walls: the run
        public XYZ LocationPoint { get; set; }      // point families: insertion
        public double BaseElevation { get; set; }
        public double TopElevation { get; set; }    // walls: height driver
    }

    /// <summary>
    /// Consumes MappingResult + resolved GhostElements and places Revit geometry.
    /// Every family/type/level referenced by the LLM is validated against the live doc
    /// BEFORE use, so a hallucinated family name is dropped, never thrown into Revit.
    /// Caller is responsible for wrapping calls in a Transaction.
    /// </summary>
    public sealed class GhostPlacementEngine
    {
        private readonly Document _doc;
        private readonly double _minConfidence;

        // Caches of what actually exists in the model (the anti-hallucination truth set).
        private readonly Dictionary<string, WallType> _wallTypes;
        private readonly Dictionary<string, FamilySymbol> _symbols;
        private readonly Level _defaultLevel;

        public GhostPlacementEngine(Document doc, double minConfidence = 0.5)
        {
            _doc = doc;
            _minConfidence = minConfidence;

            _wallTypes = new FilteredElementCollector(doc)
                .OfClass(typeof(WallType)).Cast<WallType>()
                .GroupBy(w => w.Name).ToDictionary(g => g.Key, g => g.First(),
                         StringComparer.OrdinalIgnoreCase);

            _symbols = new FilteredElementCollector(doc)
                .OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>()
                .GroupBy(s => s.Name).ToDictionary(g => g.Key, g => g.First(),
                         StringComparer.OrdinalIgnoreCase);

            _defaultLevel = new FilteredElementCollector(doc)
                .OfClass(typeof(Level)).Cast<Level>()
                .OrderBy(l => l.Elevation).FirstOrDefault();
        }

        public sealed class PlacementReport
        {
            public int Placed;
            public int SkippedLowConfidence;
            public int SkippedUnknownFamily;
            public int SkippedNoGeometry;
            public readonly List<string> Warnings = new List<string>();
        }

        public PlacementReport Place(MappingResult mapping, IEnumerable<GhostElement> elements)
        {
            var report = new PlacementReport();

            if (_defaultLevel == null)
            {
                report.Warnings.Add("No Level in document; cannot place. Aborting.");
                return report;
            }

            // Index mappings by layer for O(1) lookup.
            var byLayer = mapping.Mappings
                .GroupBy(m => m.CadLayer, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            foreach (GhostElement el in elements)
            {
                if (!byLayer.TryGetValue(el.CadLayer, out LayerMapping map))
                    continue; // layer the LLM chose not to map

                if (map.Confidence < _minConfidence) { report.SkippedLowConfidence++; continue; }

                switch (map.Category)
                {
                    case "Walls":
                        if (!TryPlaceWall(el, map, report)) { /* counted inside */ }
                        break;

                    case "Doors":
                    case "Windows":
                    case "Columns":
                    case "Furniture":
                        if (!TryPlaceFamilyInstance(el, map, report)) { /* counted inside */ }
                        break;

                    default:
                        report.Warnings.Add($"Category '{map.Category}' (layer '{el.CadLayer}') not handled at LOD 200; skipped.");
                        break;
                }
            }

            return report;
        }

        private bool TryPlaceWall(GhostElement el, LayerMapping map, PlacementReport r)
        {
            if (el.LocationCurve == null) { r.SkippedNoGeometry++; return false; }

            // bdsFamily / bdsFamilyType names a wall type -> must exist in the doc.
            string wanted = map.BdsFamilyType ?? map.BdsFamily;
            if (wanted == null || !_wallTypes.TryGetValue(wanted, out WallType wt))
            {
                r.SkippedUnknownFamily++;
                r.Warnings.Add($"WallType '{wanted}' not found (layer '{el.CadLayer}'); skipped.");
                return false;
            }

            double height = Math.Max(el.TopElevation - el.BaseElevation, _doc.Application.ShortCurveTolerance * 10);

            Wall.Create(_doc, el.LocationCurve, wt.Id, _defaultLevel.Id,
                        height, el.BaseElevation, flip: false, structural: false);
            r.Placed++;
            return true;
        }

        private bool TryPlaceFamilyInstance(GhostElement el, LayerMapping map, PlacementReport r)
        {
            if (el.LocationPoint == null) { r.SkippedNoGeometry++; return false; }

            string wanted = map.BdsFamilyType ?? map.BdsFamily;
            if (wanted == null || !_symbols.TryGetValue(wanted, out FamilySymbol sym))
            {
                r.SkippedUnknownFamily++;
                r.Warnings.Add($"FamilySymbol '{wanted}' not found (layer '{el.CadLayer}'); skipped.");
                return false;
            }

            if (!sym.IsActive) sym.Activate();   // inactive symbols throw on NewFamilyInstance

            _doc.Create.NewFamilyInstance(el.LocationPoint, sym, _defaultLevel,
                                          StructuralType.NonStructural);
            r.Placed++;
            return true;
        }
    }
}
