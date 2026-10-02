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
            // layerOverride: the layer of the object this one was made from (a curve carried into the model's frame is a new
            // object with no graphics style of its own).
            void Emit(GeometryObject o, XYZ insertPoint, string layerOverride = null)
            {
                string layer = layerOverride ?? LayerOf(o);
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
                                    BaseElevation = pts[0].Z, // a wall's top is the executor's: the next story (MA-1a item 3)
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
                    // Drill MA1b (F-MA1b-1): the import's INSTANCE geometry flattens every block insert into loose curves, so a
                    // door block's leaf and arc came out as two curve elements on the door layer beside the block itself (36 on
                    // A-DOOR for 12 blocks). Its SYMBOL geometry keeps each insert as a nested GeometryInstance: the curves drawn
                    // loose in the drawing are read from there, carried into the model's frame one by one, and a nested instance
                    // is left to AddBlocks — a block is one thing, and its curves are never loose elements.
                    Transform t = instance.Transform;
                    GeometryElement symbol = instance.GetSymbolGeometry();
                    if (symbol == null) continue;
                    foreach (GeometryObject n in symbol)
                    {
                        if (n is GeometryInstance) continue;
                        string layer = LayerOf(n);
                        if (layer == null) continue;
                        GeometryObject moved = n is Curve c ? (GeometryObject)c.CreateTransformed(t)
                                             : n is PolyLine pl ? pl.GetTransformed(t) : null;
                        if (moved != null) Emit(moved, null, layer);
                    }
                }
                else
                {
                    Emit(obj, null);
                }
            }

            AddBlocks(geo, results, LayerOf); // MA-1b (GHB-1): each block insert, as one point element
            return results;
        }

        private const double FtToMm = 304.8;

        /// <summary>
        /// MA-1b (GHB-1): every block INSERT of the drawing as ONE point element on the insert's layer — the middle of what
        /// the block draws (a door block inserted by its hinge stands at the middle of its opening), with the block's angle
        /// and mirror (GhostElement.Block). The import is one GeometryInstance; each insert is a nested GeometryInstance of
        /// its SYMBOL geometry, placed by its own Transform — composed here with the import's, so no frame is guessed. A block
        /// inside a block is part of the outer one. The curves inside a block are not emitted as elements (ExtractGhostElements
        /// reads the loose curves from the symbol geometry too, where a block is still one nested instance — drill MA1b): a
        /// block is one thing. Points go through Transform.OfPoint, which takes any scale, a mirror included.
        /// </summary>
        private void AddBlocks(GeometryElement geo, List<GhostElement> results, Func<GeometryObject, string> layerOf)
        {
            int nested = 0; // the block inserts inside the insert being read (review amendment C5): set to 0 before each Gather
            // What a block draws, in model millimetres (plan), and the first layer one of its own curves names.
            string Gather(GeometryElement g, Transform t, List<(double X, double Y)> into)
            {
                string first = null;
                foreach (GeometryObject o in g)
                {
                    if (o is GeometryInstance n)
                    {
                        nested++;
                        GeometryElement inner = n.GetSymbolGeometry();
                        string innerLayer = inner == null ? null : Gather(inner, t.Multiply(n.Transform), into);
                        first = first ?? innerLayer;
                        continue;
                    }
                    IList<XYZ> pts = o is PolyLine pl ? pl.GetCoordinates() : o is Curve c && c.IsBound ? c.Tessellate() : null;
                    if (pts == null) continue;
                    first = first ?? layerOf(o);
                    foreach (XYZ p in pts)
                    {
                        XYZ q = t.OfPoint(p);
                        into.Add((q.X * FtToMm, q.Y * FtToMm));
                    }
                }
                return first;
            }

            foreach (GeometryObject top in geo)
            {
                if (!(top is GeometryInstance import)) continue;
                GeometryElement drawing = import.GetSymbolGeometry();
                if (drawing == null) continue;
                foreach (GeometryObject o in drawing)
                {
                    if (!(o is GeometryInstance gi)) continue;
                    GeometryElement symbol = gi.GetSymbolGeometry();
                    if (symbol == null) continue;
                    Transform t = import.Transform.Multiply(gi.Transform);
                    var drawn = new List<(double X, double Y)>();
                    nested = 0;
                    string ownLayer = Gather(symbol, t, drawn);
                    string layer = layerOf(gi) ?? ownLayer; // the insert's layer; with none, the layer of what it draws
                    if (layer == null) continue;
                    var (rotation, mirrored) = PlacementGeometry.Frame(t.BasisX.X, t.BasisX.Y, t.BasisY.X, t.BasisY.Y);
                    var (cx, cy) = PlacementGeometry.BlockCentre(t.Origin.X * FtToMm, t.Origin.Y * FtToMm, rotation, drawn);
                    results.Add(new GhostElement
                    {
                        CadLayer = layer,
                        LocationPoint = new XYZ(cx / FtToMm, cy / FtToMm, t.Origin.Z),
                        BaseElevation = t.Origin.Z,
                        Block = new GhostBlock { Name = BlockName(gi), RotationDeg = rotation, Mirrored = mirrored, Nested = nested },
                    });
                }
            }
        }

        // The block's name, when Revit gives the nested instance's symbol one (drill MA1b records what it gives); else null.
        // It is said in a gap's sentence and decides nothing.
        private string BlockName(GeometryInstance gi)
        {
            try
            {
#if REVIT2023_OR_GREATER
                return _doc.GetElement(gi.GetSymbolGeometryId().SymbolId)?.Name;
#else
                return gi.Symbol?.Name;
#endif
            }
            catch (Exception) { return null; }
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
                BaseElevation = z, // a wall's top is the executor's: the next story (MA-1a item 3)
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
    }

    // ---------------------------------------------------------------------
    // 2. PLACEMENT
    // ---------------------------------------------------------------------

    /// <summary>MA-1b (GHB-1): what a block INSERT of the drawing says beyond its point — its name when Revit gives one,
    /// the plan angle of its X axis (degrees, 0 up to 360) and whether it is mirrored (PlacementGeometry.Frame).</summary>
    public sealed class GhostBlock
    {
        public string Name { get; set; }
        public double RotationDeg { get; set; }
        public bool Mirrored { get; set; }
        /// <summary>How many block inserts this block holds inside it (any depth). They are read as part of this ONE block.</summary>
        public int Nested { get; set; }
    }

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
        public double TopElevation { get; set; }         // Photo Massing's walls: height driver (a DWG wall's top is the executor's, MA-1a item 3)
        public double ThicknessMm { get; set; }          // walls: measured from the two drawn faces (0 = unpaired/unknown)
        public GhostBlock Block { get; set; }            // MA-1b: a block insert — LocationPoint is the middle of what it draws; null otherwise
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
        private readonly bool _placeholderTypes; // massing only — see ElementPlacementFactory
        private readonly Document _doc;
        private readonly double _minConfidence;

        // Caches of what actually exists in the model (the anti-hallucination truth set).
        private readonly Dictionary<string, WallType> _wallTypes;
        private readonly Dictionary<string, FloorType> _floorTypes;
        private readonly Dictionary<string, ElementType> _ceilingTypes;
        private readonly Level _defaultLevel;

        private readonly GuidelineMatcher _guideline; // optional office guideline for per-wall type choice

        /// <summary>A7: the document's type ids before this build (GhostBuilderOrchestrator) — handed to the factory, which
        /// writes a type parameter only on a type not in it. Null: no type parameter is written.</summary>
        public ISet<long> TypesBefore;

        public GhostPlacementEngine(Document doc, double minConfidence = 0.5, GuidelineMatcher guideline = null, Level level = null,
                                    bool placeholderTypes = false)
        {
            _doc = doc;
            _minConfidence = minConfidence;
            _guideline = guideline;
            _placeholderTypes = placeholderTypes;

            _wallTypes = new FilteredElementCollector(doc)
                .OfClass(typeof(WallType)).Cast<WallType>()
                .GroupBy(w => w.Name).ToDictionary(g => g.Key, g => g.First(),
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

            _defaultLevel = level ?? new FilteredElementCollector(doc)
                .OfClass(typeof(Level)).Cast<Level>()
                .OrderBy(l => l.Elevation).FirstOrDefault();
        }

        public sealed class PlacementReport
        {
            /// <summary>This build's elements that exist AFTER the commit — counted by GhostBuilderOrchestrator from NewElements
            /// (GHB-5): never before the commit, never per CAD element (a closed loop of 4 walls is 4).</summary>
            public int Placed;
            public int SkippedLowConfidence;
            public int SkippedUnknownFamily;
            public int SkippedNoGeometry;
            public readonly List<string> Warnings = new List<string>();
            /// <summary>MA-1a item 6: what the placement block did to this build's elements — worksets, phase — or why it did
            /// nothing. Its own list: a result of the build, printed apart from the warnings.</summary>
            public readonly List<string> Placement = new List<string>();
            /// <summary>Types and families this build added to the model: families loaded, wall and floor types the mapping names, guideline-gap sizes.</summary>
            public readonly List<string> CreatedTypes = new List<string>();
            /// <summary>Walls typed by the guideline, by the layer mapping (guideline none, or no measured thickness), by the
            /// reviewer (a type picked in the review), or left as a reported gap (skipped, or a massing placeholder) —
            /// ElementPlacementFactory's tallies, taken before the commit.</summary>
            public int WallsByGuideline, WallsByMapping, WallsByReviewer, WallGaps;
            /// <summary>Wall and floor types a ticked mapping row named that this build did not create — no sibling from
            /// the type catalogue in this document, or a clone that failed (the provisioners' gaps, each named in Warnings with its reason).</summary>
            public int TypeGaps;
            /// <summary>Every element this build created, with what it is ("Walls on 'A-WALL-EXT'") — the failure handler's
            /// "ours" and the ids Placed is counted from.</summary>
            public readonly List<(ElementId Id, string What)> NewElements = new List<(ElementId Id, string What)>();
            /// <summary>This build's elements gone after the commit, each "what — the Revit failure that named it".</summary>
            public readonly List<string> DeletedByRevit = new List<string>();
            /// <summary>Revit warnings the build raised, counted by text — left in the model, never erased ([BP] P1-3).</summary>
            public readonly Dictionary<string, int> RevitWarnings = new Dictionary<string, int>();
            /// <summary>Set when Revit did not commit the build: why. Nothing exists then, and nothing else here is true.</summary>
            public string RolledBack;
            /// <summary>A6: set when Commit returned neither Committed nor RolledBack (Pending, …) — the whole report
            /// (GhostFailurePolicy.NotFinishedLine). Nothing was recounted, and nothing else here is true.</summary>
            public string NotFinished;
            /// <summary>MA-1a step 2 (DWG): the whole line when nothing was built — not filed, rolled back, refused or nothing to
            /// build. Placed and the type lines are then untrue; Warnings still name every row that gave no element.</summary>
            public string NotBuilt;
            /// <summary>MA-1a step 2 (DWG): which changesets carry the build on the project's ledger, or why none does.</summary>
            public string Ledger;
            /// <summary>MA-1a step 2 (DWG), MA-1b: doors and windows not filed because no single straight wall of this build lies
            /// within half its thickness of the point (for a block: along the block's axis), or the executor's host rule refuses
            /// the moved point — a wall already in the model under it (B2: only a wall this build creates hosts one), a second
            /// wall, a curved one.</summary>
            public int SkippedNoHost;
            /// <summary>MA-1b (F8): of SkippedNoHost, the doors and windows standing where a wall's line stops short of the
            /// opening — a wall drawn in two pieces at the opening; the pieces are not joined yet (GHB-6).</summary>
            public int SkippedBrokenWall;
            /// <summary>MA-1b (E17): block inserts on a row that is not Doors or Windows — not placed, named per layer in Warnings.</summary>
            public int SkippedBlocks;
            /// <summary>MA-1a step 2 (DWG): placed elements whose provenance stamp reads source dwg after the build.</summary>
            public int Stamped;
            /// <summary>MA-1a item 5 (DWG): the person went back at the BLOCK check — nothing was built (NotBuilt says so) and the
            /// review stays open for another Build.</summary>
            public bool WentBack;
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
                _doc, _defaultLevel, _wallTypes, _floorTypes, _ceilingTypes, _guideline, _placeholderTypes);
            factory.TypesBefore = TypesBefore; // A7

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
                    // Outcome.Placed is not counted here: Placed is what exists after the commit (GhostBuilderOrchestrator).
                    case ElementPlacementFactory.Outcome.SkippedNoGeometry:  report.SkippedNoGeometry++; break;
                    case ElementPlacementFactory.Outcome.SkippedUnknownType: report.SkippedUnknownFamily++; break;
                    // SkippedUnsupported: counted only via its warning, not a hard bucket.
                }
            }

            // P2: what the project documents actually wrote onto the geometry (and what would not take).
            report.Warnings.AddRange(factory.Notes);
            report.CreatedTypes.AddRange(factory.CreatedTypes);
            report.WallsByGuideline = factory.WallsByGuideline;
            report.WallsByMapping = factory.WallsByMapping;
            report.WallsByReviewer = factory.WallsByReviewer;
            report.WallGaps = factory.WallGaps;
            report.NewElements.AddRange(factory.NewElements);

            return report;
        }
    }
}
