#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;

namespace Sentinel.GhostBuilder
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
                        AddCurveEl(results, layer, line);
                        break;

                    case Arc arc:
                        // A full circle from CAD arrives as an UNBOUND Arc (no endpoints).
                        // AddCurveEl skips it — a closed circle can't drive a single wall run.
                        AddCurveEl(results, layer, arc);
                        break;

                    case PolyLine poly:
                        IList<XYZ> pts = poly.GetCoordinates();
                        double tol = _doc.Application.ShortCurveTolerance;

                        // A closed CAD polyline (room / slab / ceiling outline) comes back with its
                        // first vertex repeated as the last coordinate (or coincident endpoints).
                        // Turn it into ONE loop-bearing element instead of shredding it into runs:
                        // ElementPlacementFactory maps LocationLoop to Floor/Ceiling.Create, and its
                        // wall path also walks the loop edges, so a closed outline on a wall layer
                        // still becomes perimeter walls — no regression.
                        bool closed = pts.Count >= 4 && pts[0].DistanceTo(pts[pts.Count - 1]) < tol;
                        if (closed)
                        {
                            IList<Curve> loop = BuildClosedBoundLoop(pts, tol);
                            if (loop.Count >= 3) // need at least a triangle to bound a slab
                            {
                                results.Add(new GhostElement
                                {
                                    CadLayer = layer,
                                    LocationLoop = loop,
                                    BaseElevation = pts[0].Z,
                                    // Height driver in case this layer maps to Walls, not Floors.
                                    TopElevation = pts[0].Z + WallDefaultHeightFt
                                });
                                break;
                            }
                            // Too few usable edges to form a loop -> fall through to segment runs.
                        }

                        // Open polyline (or a closed one we couldn't loop): split into straight
                        // segments; each becomes its own wall run.
                        for (int i = 0; i < pts.Count - 1; i++)
                        {
                            if (pts[i].DistanceTo(pts[i + 1]) < tol)
                                continue; // skip degenerate segment
                            AddCurveEl(results, layer, Line.CreateBound(pts[i], pts[i + 1]));
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

        /// <summary>
        /// Build a wall-run element from a curve, but ONLY if the curve is bound. Unbound curves
        /// (full circles, ellipses) have no endpoints; calling GetEndPoint on them throws
        /// ArgumentException "The input curve is not bound". Those are skipped — a closed loop can't
        /// map to one LOD 200 wall run. Callers that need closed-loop handling would tessellate first.
        /// </summary>
        private void AddCurveEl(List<GhostElement> results, string layer, Curve c)
        {
            if (c == null || !c.IsBound) return; // gate BEFORE GetEndPoint — this is the fix

            double z = c.GetEndPoint(0).Z;
            results.Add(new GhostElement
            {
                CadLayer = layer,
                LocationCurve = c,
                BaseElevation = z,
                TopElevation = z + WallDefaultHeightFt
            });
        }

        /// <summary>
        /// Build an ordered, closed list of bound line segments from a closed polyline's vertices.
        /// Degenerate (coincident-vertex) segments are dropped, and if the CAD source didn't repeat
        /// its first vertex the loop is closed explicitly, so the result is safe to hand to
        /// CurveLoop.Create. Returns fewer than 3 curves when the polyline can't bound an area.
        /// </summary>
        private static IList<Curve> BuildClosedBoundLoop(IList<XYZ> pts, double tol)
        {
            var curves = new List<Curve>();
            for (int i = 0; i < pts.Count - 1; i++)
            {
                if (pts[i].DistanceTo(pts[i + 1]) < tol) continue; // drop duplicate/degenerate vertex
                curves.Add(Line.CreateBound(pts[i], pts[i + 1]));
            }

            // Close the ring if the last edge doesn't already land back on the start point.
            if (curves.Count >= 2)
            {
                XYZ start = curves[0].GetEndPoint(0);
                XYZ end = curves[curves.Count - 1].GetEndPoint(1);
                if (start.DistanceTo(end) >= tol)
                    curves.Add(Line.CreateBound(end, start));
            }

            return curves;
        }

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
        public Curve LocationCurve { get; set; }        // walls: the run
        public XYZ LocationPoint { get; set; }           // point families: insertion
        public IList<Curve> LocationLoop { get; set; }   // floors/ceilings: closed boundary
        public double BaseElevation { get; set; }
        public double TopElevation { get; set; }         // walls: height driver
        // NOTE: LocationLoop is the seam for floor/ceiling placement. GhostCadExtractor populates it
        // for CLOSED polylines (open polylines still split into per-segment wall runs via
        // LocationCurve). ElementPlacementFactory maps LocationLoop to Floor/Ceiling.Create, and its
        // wall path walks the loop edges so a closed outline on a wall layer still yields walls.
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
        private readonly Dictionary<string, FloorType> _floorTypes;
        private readonly Dictionary<string, ElementType> _ceilingTypes;
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

            _floorTypes = new FilteredElementCollector(doc)
                .OfClass(typeof(FloorType)).Cast<FloorType>()
                .GroupBy(f => f.Name).ToDictionary(g => g.Key, g => g.First(),
                         StringComparer.OrdinalIgnoreCase);

            // Ceiling types are ElementType (CeilingType exists 2022+; ElementType is the stable base).
            _ceilingTypes = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_Ceilings).WhereElementIsElementType()
                .Cast<ElementType>()
                .GroupBy(ct => ct.Name).ToDictionary(g => g.Key, g => g.First(),
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

            // All creation logic lives in the factory; the engine just iterates and tallies.
            var factory = new ElementPlacementFactory(
                _doc, _defaultLevel, _wallTypes, _symbols, _floorTypes, _ceilingTypes);

            foreach (GhostElement el in elements)
            {
                if (!byLayer.TryGetValue(el.CadLayer, out LayerMapping map))
                    continue; // layer the LLM chose not to map

                if (map.Confidence < _minConfidence) { report.SkippedLowConfidence++; continue; }

                ElementPlacementFactory.Outcome outcome;
                string warning;
                try
                {
                    outcome = factory.Place(el, map, out warning);
                }
                catch (Autodesk.Revit.Exceptions.ArgumentException ex)
                {
                    // One malformed CAD element (too-short, non-planar or self-intersecting curve)
                    // must NOT abort the whole build and roll back everything already placed. Skip
                    // it, record why, and keep going — resilience is the whole point for dirty DWGs.
                    report.SkippedNoGeometry++;
                    report.Warnings.Add($"Skipped layer '{el.CadLayer}': {ex.Message}");
                    continue;
                }
                catch (Autodesk.Revit.Exceptions.InvalidOperationException ex)
                {
                    report.SkippedNoGeometry++;
                    report.Warnings.Add($"Skipped layer '{el.CadLayer}': {ex.Message}");
                    continue;
                }

                if (warning != null) report.Warnings.Add(warning);

                switch (outcome)
                {
                    case ElementPlacementFactory.Outcome.Placed:             report.Placed++; break;
                    case ElementPlacementFactory.Outcome.SkippedNoGeometry:  report.SkippedNoGeometry++; break;
                    case ElementPlacementFactory.Outcome.SkippedUnknownType: report.SkippedUnknownFamily++; break;
                    // SkippedUnsupported: counted only via its warning, not a hard bucket.
                }
            }

            // P2: what the project documents actually wrote onto the geometry (and what would not take).
            report.Warnings.AddRange(factory.Notes);

            return report;
        }
    }
}
