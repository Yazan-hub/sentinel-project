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
            public List<string> Warnings = new();
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
            foreach (var import in new FilteredElementCollector(_doc).OfClass(typeof(ImportInstance))
                                        .Cast<ImportInstance>())
            {
                CollectSegs(import, levelLayerKeyword, levelSegs);
                CollectSegs(import, gridLayerKeyword, gridSegs);
            }
            return Compute(levelSegs, gridSegs, levelLayerKeyword, gridLayerKeyword);
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
                        CollectSegs(imp, levelLayerKeyword, levelSegs);
                        CollectSegs(imp, gridLayerKeyword, gridSegs);
                        if (levelSegs.Count + gridSegs.Count > before)
                            read.Add(System.IO.Path.GetFileName(path));
                    }
                }
            }
            finally
            {
                if (t.HasStarted() && !t.HasEnded()) t.RollBack(); // discard every temp import — leave no trace
            }

            var res = Compute(levelSegs, gridSegs, levelLayerKeyword, gridLayerKeyword);
            if (read.Count > 0) res.Warnings.Insert(0, "Datum read from: " + string.Join(", ", read));
            return res;
        }

        private DatumResult Compute(List<Seg> levelSegs, List<Seg> gridSegs, string levelKw, string gridKw)
        {
            var res = new DatumResult
            {
                Levels = DatumFromDrawing.Levels(levelSegs),
                Grids = DatumFromDrawing.Grids(gridSegs),
            };
            if (res.Levels.Count == 0)
                res.Warnings.Add($"No level lines found on a '*{levelKw}*' layer in the drawing(s) read — levels come from a section export.");
            if (res.Grids.Count == 0)
                res.Warnings.Add($"No grid lines found on a '*{gridKw}*' layer in the drawing(s) read — grids come from a plan export.");
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
        public DatumResult Build(DatumResult detected)
        {
            using var t = new Transaction(_doc, "Sentinel — Datum from Drawings");
            t.Start();
            try
            {
                foreach (var lv in detected.Levels)
                    if (CreateLevel(lv, detected.Warnings)) detected.LevelsCreated++;
                foreach (var g in detected.Grids)
                    if (CreateGrid(g, detected.Warnings)) detected.GridsCreated++;
                t.Commit();
            }
            catch
            {
                if (t.HasStarted() && !t.HasEnded()) t.RollBack();
                throw;
            }
            return detected;
        }

        // --- Revit reads -----------------------------------------------------------------------------

        private void CollectSegs(ImportInstance import, string layerKeyword, List<Seg> into)
        {
            if (string.IsNullOrWhiteSpace(layerKeyword)) return;
            GeometryElement geo = import.get_Geometry(new Options { ComputeReferences = false });
            if (geo == null) return;
            foreach (GeometryObject obj in geo)
            {
                if (obj is GeometryInstance gi)
                    foreach (GeometryObject n in gi.GetInstanceGeometry()) AddIfOnLayer(n, layerKeyword, into);
                else
                    AddIfOnLayer(obj, layerKeyword, into);
            }
        }

        private void AddIfOnLayer(GeometryObject o, string layerKeyword, List<Seg> into)
        {
            string layer = LayerOf(o);
            if (layer == null || !LayerMatches(layer, layerKeyword)) return;

            switch (o)
            {
                case Line line:
                    into.Add(ToSeg(line.GetEndPoint(0), line.GetEndPoint(1)));
                    break;
                case PolyLine poly:
                    var pts = poly.GetCoordinates();
                    for (int i = 0; i < pts.Count - 1; i++) into.Add(ToSeg(pts[i], pts[i + 1]));
                    break;
                // arcs/splines aren't level or grid datums — ignore
            }
        }

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

        private bool CreateLevel(DetectedLevel lv, List<string> warnings)
        {
            double elevFt = lv.ElevationMm * MmToFeet;
            var existing = new FilteredElementCollector(_doc).OfClass(typeof(Level)).Cast<Level>()
                .FirstOrDefault(l => Math.Abs(l.Elevation - elevFt) < 0.01); // ~3mm
            if (existing != null)
            {
                warnings.Add($"Level at {lv.ElevationMm:0} mm already exists ('{existing.Name}') — kept.");
                return false;
            }
            var level = Level.Create(_doc, elevFt);
            try { level.Name = UniqueLevelName(lv.Name); } catch { /* name clash/illegal — leave default */ }
            return true;
        }

        private string UniqueLevelName(string want)
        {
            var taken = new FilteredElementCollector(_doc).OfClass(typeof(Level)).Cast<Level>()
                .Select(l => l.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (!taken.Contains(want)) return want;
            for (int i = 2; ; i++) if (!taken.Contains($"{want} ({i})")) return $"{want} ({i})";
        }

        private bool CreateGrid(DetectedGrid g, List<string> warnings)
        {
            XYZ p1 = new XYZ(g.X1 * MmToFeet, g.Y1 * MmToFeet, 0);
            XYZ p2 = new XYZ(g.X2 * MmToFeet, g.Y2 * MmToFeet, 0);
            if (p1.DistanceTo(p2) < _doc.Application.ShortCurveTolerance)
            {
                warnings.Add($"Grid '{g.Name}' too short to create — skipped.");
                return false;
            }
            // A grid name must be unique; Revit throws on a clash. Skip if the label's taken.
            var taken = new FilteredElementCollector(_doc).OfClass(typeof(Grid)).Cast<Grid>()
                .Select(x => x.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (taken.Contains(g.Name))
            {
                warnings.Add($"Grid '{g.Name}' already exists — kept.");
                return false;
            }
            var grid = Grid.Create(_doc, Line.CreateBound(p1, p2));
            try { grid.Name = g.Name; } catch { /* clash/illegal — Revit auto-named it */ }
            return true;
        }
    }
}
