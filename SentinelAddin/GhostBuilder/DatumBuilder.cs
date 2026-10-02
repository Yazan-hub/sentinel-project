#nullable disable
// Build the model's DATUM in Revit — real Levels and Grids — from the imported drawings, so the modelling
// workflow starts the way a modeller starts: datum first, then everything hosts to it. Reads the level
// lines off a section's levels layer and the grid lines off a plan's grid layer (DatumFromDrawing does the
// pure geometry), then creates the Levels/Grids in one transaction.
//
// Revit-coupled — API thread only, must run inside/behind an ExternalEvent. The pure detector it calls is
// offline-tested (tools/datum-check); this file is the thin Revit shell: read geometry -> Seg(mm) -> create.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public sealed class DatumBuilder
    {
        private const double FeetToMm = 304.8;
        private const double MmToFeet = 1.0 / 304.8;

        private readonly Document _doc;
        public DatumBuilder(Document doc) => _doc = doc;

        public sealed class DatumResult
        {
            public List<DetectedLevel> Levels = new();
            public List<DetectedGrid> Grids = new();
            public int LevelsCreated, GridsCreated;
            /// <summary>MA-1a item 7: Revit committed Build's transaction — only then do the two counts hold.</summary>
            public bool Committed;
            /// <summary>MA-1a item 6: the placement block's lines for what Build created, counted after its commit from the
            /// levels and grids still in the model; null when Build was given no plan.</summary>
            public List<string> Placement;
            public List<string> Warnings = new();
            /// <summary>MA-1a item 4: the layers the levels and the grids were read from, and the drawing's sha256 when one picked
            /// file was read (the command sets it; null when the datum came from imports already in the model).</summary>
            public HashSet<string> LevelLayers = new(StringComparer.OrdinalIgnoreCase), GridLayers = new(StringComparer.OrdinalIgnoreCase);
            public string SourceSha256;
        }

        /// <summary>
        /// Detect (no writes) — for the confirmation preview. Scans every CAD import ALREADY in the doc:
        /// level lines from any layer whose name contains <paramref name="levelLayerKeyword"/> (section),
        /// grid lines from any layer containing <paramref name="gridLayerKeyword"/> (plan).
        /// </summary>
        public DatumResult Detect(string levelLayerKeyword = "LEVEL", string gridLayerKeyword = "GRID")
        {
            var levelSegs = new List<Seg>();
            var gridSegs = new List<Seg>();
            var res = new DatumResult(); // MA-1a item 4: it collects the layers read
            foreach (var import in new FilteredElementCollector(_doc).OfClass(typeof(ImportInstance))
                                        .Cast<ImportInstance>())
            {
                CollectSegs(import, levelLayerKeyword, levelSegs, res.LevelLayers);
                CollectSegs(import, gridLayerKeyword, gridSegs, res.GridLayers);
            }
            return Compute(levelSegs, gridSegs, levelLayerKeyword, gridLayerKeyword, res);
        }

        /// <summary>
        /// Detect from the DWGs in a FOLDER, matching the real workflow: the project drawings live in a
        /// folder and you want grids + levels off them WITHOUT hand-importing anything. Revit can only read
        /// a DWG's geometry once it's in the document, so this imports each DWG temporarily (origin-to-origin,
        /// so it lands on your project base point), reads the datum, then REMOVES the temp imports — the
        /// model is left with only the levels/grids the follow-up Build creates. All in one transaction that
        /// is rolled back, so nothing from the read is ever committed.
        /// </summary>
        public DatumResult DetectFromFolder(string folder, string levelLayerKeyword = "LEVEL",
                                            string gridLayerKeyword = "GRID")
        {
            var dwgs = System.IO.Directory.EnumerateFiles(folder, "*.*")
                .Where(f => f.EndsWith(".dwg", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".dxf", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f).ToList();
            if (dwgs.Count == 0)
            {
                var empty = new DatumResult();
                empty.Warnings.Add($"No .dwg/.dxf files in {folder}.");
                return empty;
            }
            return DetectFromFiles(dwgs, levelLayerKeyword, gridLayerKeyword);
        }

        /// <summary>
        /// Detect from a SPECIFIC set of files (typically one, user-picked) instead of pooling every DWG in a
        /// folder — pooling multiple sheets' geometry produced misaligned grids when sheets used different
        /// origins. Same scratch-import/rollback structure as DetectFromFolder.
        /// </summary>
        public DatumResult DetectFromFiles(IReadOnlyList<string> files, string levelLayerKeyword = "LEVEL",
                                           string gridLayerKeyword = "GRID")
        {
            var dwgs = files;
            var levelSegs = new List<Seg>();
            var gridSegs = new List<Seg>();
            var read = new List<string>();
            var res = new DatumResult(); // MA-1a item 4: it collects the layers read

            // One transaction we deliberately ROLL BACK: the temp imports exist only long enough to read.
            using var t = new Transaction(_doc, "Sentinel — read DWG datum (temporary)");
            t.Start();
            try
            {
                var view = ScratchView();
                var opts = new DWGImportOptions
                {
                    Placement = ImportPlacement.Origin,   // origin-to-origin → aligns with the base point
                    ThisViewOnly = true,
                    ColorMode = ImportColorMode.Preserved,
                };
                foreach (var path in dwgs)
                {
                    if (_doc.Import(path, opts, view, out ElementId id) && _doc.GetElement(id) is ImportInstance imp)
                    {
                        _doc.Regenerate(); // make the imported geometry readable before we read it
                        int before = levelSegs.Count + gridSegs.Count;
                        CollectSegs(imp, levelLayerKeyword, levelSegs, res.LevelLayers);
                        CollectSegs(imp, gridLayerKeyword, gridSegs, res.GridLayers);
                        if (levelSegs.Count + gridSegs.Count > before)
                            read.Add(System.IO.Path.GetFileName(path));
                    }
                }
            }
            finally
            {
                if (t.HasStarted() && !t.HasEnded()) t.RollBack(); // discard every temp import — leave no trace
            }

            Compute(levelSegs, gridSegs, levelLayerKeyword, gridLayerKeyword, res);
            if (read.Count > 0) res.Warnings.Insert(0, "Datum read from: " + string.Join(", ", read));
            return res;
        }

        private DatumResult Compute(List<Seg> levelSegs, List<Seg> gridSegs, string levelKw, string gridKw, DatumResult res)
        {
            res.Levels = DatumFromDrawing.Levels(levelSegs);
            res.Grids = DatumFromDrawing.Grids(gridSegs);
            if (res.Levels.Count == 0)
                res.Warnings.Add($"No level lines found on a '*{levelKw}*' layer in the drawing(s) read — levels come from a section export.");
            if (res.Grids.Count == 0)
                res.Warnings.Add($"No grid lines found on a '*{gridKw}*' layer in the drawing(s) read — grids come from a plan export.");
            // A DXF without a $INSUNITS header is imported as inches, so every mm height comes out 25.4x too
            // big (a 47 m tower became 1.2 km, simulation 3.9, F41). No building has a 250 m top level: say so.
            double top = res.Levels.Count == 0 ? 0 : res.Levels.Max(l => l.ElevationMm);
            if (top > 250_000)
                res.Warnings.Add($"Top level at {top / 1000:0} m — the drawing's units look wrong (a DXF with no $INSUNITS header is read as inches, x25.4). Check the file's units before building.");
            return res;
        }

        // A throwaway drafting view to host the temporary DWG imports; goes away with the rolled-back txn.
        private View ScratchView()
        {
            var vft = new FilteredElementCollector(_doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>()
                .First(v => v.ViewFamily == ViewFamily.Drafting);
            return ViewDrafting.Create(_doc, vft.Id);
        }

        /// <summary>Create the detected Levels + Grids in one transaction. Skips levels/grids that already
        /// exist (within tolerance) so re-running is safe. Caller runs this on the API thread.</summary>
        /// <param name="placing">MA-1a item 6: where the new levels and grids go (PlacementApply.Resolve); null = nothing is set.</param>
        public DatumResult Build(DatumResult detected, PlacementPlan placing = null)
        {
            var made = new List<Element>(); // what this run created, for the placement block
            using var t = new Transaction(_doc, "Sentinel — Datum from Drawings");
            t.Start();
            try
            {
                // MA-1a item 4: each level and grid it creates carries the full stamp — source dwg, no changeset, no ledger row
                // of its own (item 7: the command reports the run as one datum row, after the commit) — inside this
                // transaction, so Ctrl+Z removes it with them.
                // Final review: "read origin to origin" is Sentinel's own import of the picked file (DetectFromFiles; the command
                // sets its sha). Imports already in the model (Detect) were placed by someone else — nothing is claimed for them.
                string how = detected.SourceSha256 != null ? ", read origin to origin" : "";
                var levelFacts = new ProvenanceStamp.Facts { Layer = Layers(detected.LevelLayers), SourceSha256 = detected.SourceSha256,
                    Rule = "Datum from Drawings: a level line's height on a layer named LEVEL or LEVL (a section)" + how };
                var gridFacts = new ProvenanceStamp.Facts { Layer = Layers(detected.GridLayers), SourceSha256 = detected.SourceSha256,
                    Rule = "Datum from Drawings: a grid line on a layer named GRID (a plan)" + how };
                foreach (var lv in detected.Levels)
                    if (CreateLevel(lv, detected.Warnings) is Level level)
                    {
                        made.Add(level);
                        ProvenanceStamp.Write(level, null, "dwg", null, levelFacts);
                    }
                foreach (var g in detected.Grids)
                    if (CreateGrid(g, detected.Warnings) is Grid grid)
                    {
                        made.Add(grid);
                        ProvenanceStamp.Write(grid, null, "dwg", null, gridFacts);
                    }
                // MA-1a item 6: each new level and grid on the workset the guideline names — inside this transaction.
                PlacementApply.Apply(placing, made);
                detected.Committed = t.Commit() == TransactionStatus.Committed;
                // Counted after the commit, from the levels and grids still in the model (review amendments C6, C31): the
                // report row, the receipt and the dialog say what the placement lines beside them say.
                detected.LevelsCreated = made.Count(e => e.IsValidObject && e is Level);
                detected.GridsCreated = made.Count(e => e.IsValidObject && e is Grid);
                detected.Placement = placing?.Lines(_doc, made.Where(e => e.IsValidObject).Select(e => e.UniqueId));
            }
            catch
            {
                if (t.HasStarted() && !t.HasEnded()) t.RollBack();
                throw;
            }
            return detected;
        }

        // --- Revit reads -----------------------------------------------------------------------------

        private void CollectSegs(ImportInstance import, string layerKeyword, List<Seg> into, HashSet<string> layers)
        {
            if (string.IsNullOrWhiteSpace(layerKeyword)) return;
            GeometryElement geo = import.get_Geometry(new Options { ComputeReferences = false });
            if (geo == null) return;
            foreach (GeometryObject obj in geo)
            {
                if (obj is GeometryInstance gi)
                    foreach (GeometryObject n in gi.GetInstanceGeometry()) AddIfOnLayer(n, layerKeyword, into, layers);
                else
                    AddIfOnLayer(obj, layerKeyword, into, layers);
            }
        }

        // MA-1a item 4: a layer that gave a line is recorded for the stamp (layers).
        private void AddIfOnLayer(GeometryObject o, string layerKeyword, List<Seg> into, HashSet<string> layers)
        {
            string layer = LayerOf(o);
            if (layer == null || !LayerMatches(layer, layerKeyword)) return;

            switch (o)
            {
                case Line line:
                    into.Add(ToSeg(line.GetEndPoint(0), line.GetEndPoint(1)));
                    layers.Add(layer);
                    break;
                case PolyLine poly:
                    var pts = poly.GetCoordinates();
                    for (int i = 0; i < pts.Count - 1; i++) into.Add(ToSeg(pts[i], pts[i + 1]));
                    layers.Add(layer);
                    break;
                // arcs/splines aren't level or grid datums — ignore
            }
        }

        private static string Layers(HashSet<string> layers) =>
            layers.Count == 0 ? null : string.Join(", ", layers.OrderBy(x => x, StringComparer.OrdinalIgnoreCase));

        // AIA layer naming abbreviates "LEVEL" to "-LEVL" (e.g. A-ANNO-LEVL); a plain "LEVEL" substring
        // check never matches those. Accept either spelling for the level keyword — but not the bare "LEV"
        // prefix, which would false-match elevation layers like A-ELEV. Grids don't need this: AIA uses GRID.
        private static bool LayerMatches(string layer, string keyword)
        {
            if (string.Equals(keyword, "LEVEL", StringComparison.OrdinalIgnoreCase))
                return layer.IndexOf("LEVEL", StringComparison.OrdinalIgnoreCase) >= 0
                    || layer.IndexOf("LEVL", StringComparison.OrdinalIgnoreCase) >= 0;
            return layer.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private string LayerOf(GeometryObject o)
        {
            ElementId id = o.GraphicsStyleId;
            if (id == ElementId.InvalidElementId) return null;
            return _doc.GetElement(id) is GraphicsStyle g && g.GraphicsStyleCategory != null
                ? g.GraphicsStyleCategory.Name : null;
        }

        // Revit geometry is in feet; DatumFromDrawing works in mm. The drawing's X,Y carry the data
        // (a section's Y is height; a plan's X,Y are grid positions) — Z is ~0 on a 2D import.
        private static Seg ToSeg(XYZ a, XYZ b) =>
            new Seg(a.X * FeetToMm, a.Y * FeetToMm, b.X * FeetToMm, b.Y * FeetToMm);

        // --- Revit writes ----------------------------------------------------------------------------

        // The level created, or null when one at that height is kept (MA-1a item 4: the caller stamps what it created).
        private Level CreateLevel(DetectedLevel lv, List<string> warnings)
        {
            double elevFt = lv.ElevationMm * MmToFeet;
            var existing = new FilteredElementCollector(_doc).OfClass(typeof(Level)).Cast<Level>()
                .FirstOrDefault(l => Math.Abs(l.Elevation - elevFt) < 0.01); // ~3mm
            if (existing != null)
            {
                warnings.Add($"Level at {lv.ElevationMm:0} mm already exists ('{existing.Name}') — kept.");
                return null;
            }
            var level = Level.Create(_doc, elevFt);
            try { level.Name = UniqueLevelName(lv.Name, level.Id); } catch { /* name clash/illegal — leave default */ }
            return level;
        }

        // Revit auto-names a new level by incrementing the last one ("Level 1" -> "Level 2"), so the level
        // just created can already hold the wanted name; exclude it, or every level after the first comes
        // out as "Level N (2)" (simulation 3.9, F40).
        private string UniqueLevelName(string want, ElementId self)
        {
            var taken = new FilteredElementCollector(_doc).OfClass(typeof(Level)).Cast<Level>()
                .Where(l => l.Id != self)
                .Select(l => l.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (!taken.Contains(want)) return want;
            for (int i = 2; ; i++) if (!taken.Contains($"{want} ({i})")) return $"{want} ({i})";
        }

        // The grid created, or null when it is skipped or kept (MA-1a item 4: the caller stamps what it created).
        private Grid CreateGrid(DetectedGrid g, List<string> warnings)
        {
            XYZ p1 = new XYZ(g.X1 * MmToFeet, g.Y1 * MmToFeet, 0);
            XYZ p2 = new XYZ(g.X2 * MmToFeet, g.Y2 * MmToFeet, 0);
            if (p1.DistanceTo(p2) < _doc.Application.ShortCurveTolerance)
            {
                warnings.Add($"Grid '{g.Name}' too short to create — skipped.");
                return null;
            }
            // A grid name must be unique; Revit throws on a clash. Skip if the label's taken.
            var taken = new FilteredElementCollector(_doc).OfClass(typeof(Grid)).Cast<Grid>()
                .Select(x => x.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (taken.Contains(g.Name))
            {
                warnings.Add($"Grid '{g.Name}' already exists — kept.");
                return null;
            }
            var grid = Grid.Create(_doc, Line.CreateBound(p1, p2));
            try { grid.Name = g.Name; } catch { /* clash/illegal — Revit auto-named it */ }
            return grid;
        }
    }
}
