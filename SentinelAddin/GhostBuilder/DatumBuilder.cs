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
            /// <summary>MA-5b-7 (DAT-1): every layer the drawing(s) held — listed when nothing was found — and where the datum was read.</summary>
            public HashSet<string> SeenLayers = new(StringComparer.OrdinalIgnoreCase);
            public DatumSource Source;
        }

        /// <summary>MA-5b-7 (DAT-1): which layers hold the datum — the project's layers@n datum section, or the built-in words — and how
        /// it is read (merges, grid letters skipped). <see cref="Label"/> names it in every dialog.</summary>
        public sealed class DatumSource
        {
            public Func<string, bool> IsLevel, IsGrid;
            public string Label;
            public double LevelMergeMm = 50, GridMergeMm = 100;
            public ISet<char> Skip = DatumFromDrawing.DefaultSkip;

            /// <summary>No datum section: a level layer holds LEVEL or LEVL (AIA abbreviates it; not the bare LEV — A-ELEV is an elevation);
            /// a grid layer holds GRID.</summary>
            public static DatumSource Words(string why) => new DatumSource
            {
                IsLevel = l => l.IndexOf("LEVEL", StringComparison.OrdinalIgnoreCase) >= 0 || l.IndexOf("LEVL", StringComparison.OrdinalIgnoreCase) >= 0,
                IsGrid = l => l.IndexOf("GRID", StringComparison.OrdinalIgnoreCase) >= 0,
                Label = $"{why} — the words LEVEL / LEVL (levels) and GRID (grids) in a layer's name",
            };

            public static DatumSource Of(LayerRulesetMatcher.DatumLayers d, string artefact) => new DatumSource
            {
                IsLevel = d.IsLevel, IsGrid = d.IsGrid, Label = $"{artefact} datum: {d.Describe()}",
                LevelMergeMm = d.LevelMergeMm, GridMergeMm = d.GridMergeMm, Skip = d.SkipLetters,
            };
        }

        /// <summary>
        /// Detect (no writes) — for the review window. Scans every CAD import ALREADY in the doc: level lines from the layers
        /// <paramref name="src"/> names levels (a section), grid lines from those it names grids (a plan).
        /// </summary>
        public DatumResult Detect(DatumSource src)
        {
            var levelSegs = new List<Seg>();
            var gridSegs = new List<Seg>();
            var res = new DatumResult { Source = src }; // MA-1a item 4: it collects the layers read
            foreach (var import in new FilteredElementCollector(_doc).OfClass(typeof(ImportInstance)).Cast<ImportInstance>())
                CollectSegs(import, src, levelSegs, gridSegs, res);
            return Compute(levelSegs, gridSegs, res);
        }

        /// <summary>
        /// Detect from a SPECIFIC set of files (typically one, user-picked) — pooling several sheets' geometry produced misaligned grids
        /// when sheets used different origins. Revit reads a DWG's geometry only once it is in the document, so each is imported
        /// temporarily (origin to origin, so it lands on the project base point) inside a transaction that is ROLLED BACK: nothing from
        /// the read is ever committed.
        /// </summary>
        public DatumResult DetectFromFiles(IReadOnlyList<string> files, DatumSource src, ImportUnit unit = ImportUnit.Default)
        {
            var dwgs = files;
            var levelSegs = new List<Seg>();
            var gridSegs = new List<Seg>();
            var read = new List<string>();
            var res = new DatumResult { Source = src }; // MA-1a item 4: it collects the layers read

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
                    Unit = unit, // MA-5b-2 (DAT-4): the person's choice; Default = the file's own header
                };
                foreach (var path in dwgs)
                {
                    if (_doc.Import(path, opts, view, out ElementId id) && _doc.GetElement(id) is ImportInstance imp)
                    {
                        _doc.Regenerate(); // make the imported geometry readable before we read it
                        int before = levelSegs.Count + gridSegs.Count;
                        CollectSegs(imp, src, levelSegs, gridSegs, res);
                        if (levelSegs.Count + gridSegs.Count > before)
                            read.Add(System.IO.Path.GetFileName(path));
                    }
                }
            }
            finally
            {
                if (t.HasStarted() && !t.HasEnded()) t.RollBack(); // discard every temp import — leave no trace
            }

            Compute(levelSegs, gridSegs, res);
            if (read.Count > 0) res.Warnings.Insert(0, "Datum read from: " + string.Join(", ", read));
            return res;
        }

        private DatumResult Compute(List<Seg> levelSegs, List<Seg> gridSegs, DatumResult res)
        {
            var src = res.Source;
            res.Levels = DatumFromDrawing.Levels(levelSegs, src.LevelMergeMm);
            res.Grids = DatumFromDrawing.Grids(gridSegs, src.GridMergeMm, src.Skip);
            if (res.Levels.Count == 0)
                res.Warnings.Add("No level lines found on a level layer in the drawing(s) read — levels come from a section export.");
            if (res.Grids.Count == 0)
                res.Warnings.Add("No grid lines found on a grid layer in the drawing(s) read — grids come from a plan export.");
            // A DXF without a $INSUNITS header is imported as inches, so every mm height comes out 25.4x too
            // big (a 47 m tower became 1.2 km, simulation 3.9, F41). No building has a 250 m top level: say so.
            double top = res.Levels.Count == 0 ? 0 : res.Levels.Max(l => l.ElevationMm);
            if (top > 250_000)
                res.Warnings.Add($"Top level at {top / 1000:0} m — the drawing's units look wrong (a DXF with no $INSUNITS header is read as inches, x25.4). Check the file's units before building.");
            res.Warnings.AddRange(DatumFromDrawing.SpacingWarnings(res.Levels, levelSegs)); // MA-5b-2 (DAT-4)
            return res;
        }

        /// <summary>MA-5b-2 (DAT-4): the pick window's units (DwgPickWindow.UnitChoices) as Revit's import unit; anything else is the file's own.</summary>
        public static ImportUnit UnitOf(string key) => key switch
        {
            "mm" => ImportUnit.Millimeter, "cm" => ImportUnit.Centimeter, "m" => ImportUnit.Meter,
            "in" => ImportUnit.Inch, "ft" => ImportUnit.Foot, _ => ImportUnit.Default,
        };

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
                    Rule = "Datum from Drawings: a level line's height on a level layer (a section) — " + detected.Source?.Label + how };
                var gridFacts = new ProvenanceStamp.Facts { Layer = Layers(detected.GridLayers), SourceSha256 = detected.SourceSha256,
                    Rule = "Datum from Drawings: a grid line on a grid layer (a plan) — " + detected.Source?.Label + how };
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

        private void CollectSegs(ImportInstance import, DatumSource src, List<Seg> levels, List<Seg> grids, DatumResult res)
        {
            GeometryElement geo = import.get_Geometry(new Options { ComputeReferences = false });
            if (geo == null) return;
            foreach (GeometryObject obj in geo)
            {
                if (obj is GeometryInstance gi)
                    foreach (GeometryObject n in gi.GetInstanceGeometry()) AddIfOnLayer(n, src, levels, grids, res);
                else
                    AddIfOnLayer(obj, src, levels, grids, res);
            }
        }

        // MA-1a item 4: a layer that gave a line is recorded for the stamp (layers); MA-5b-7: every layer seen, for a read that found none.
        private void AddIfOnLayer(GeometryObject o, DatumSource src, List<Seg> levels, List<Seg> grids, DatumResult res)
        {
            string layer = LayerOf(o);
            if (layer == null) return;
            res.SeenLayers.Add(layer);
            var segs = new List<Seg>();
            switch (o)
            {
                case Line line:
                    segs.Add(ToSeg(line.GetEndPoint(0), line.GetEndPoint(1)));
                    break;
                case PolyLine poly:
                    var pts = poly.GetCoordinates();
                    for (int i = 0; i < pts.Count - 1; i++) segs.Add(ToSeg(pts[i], pts[i + 1]));
                    break;
                // arcs/splines aren't level or grid datums — ignore (DAT-5)
            }
            if (segs.Count == 0) return;
            if (src.IsLevel(layer)) { levels.AddRange(segs); res.LevelLayers.Add(layer); }
            if (src.IsGrid(layer)) { grids.AddRange(segs); res.GridLayers.Add(layer); }
        }

        private static string Layers(HashSet<string> layers) =>
            layers.Count == 0 ? null : string.Join(", ", layers.OrderBy(x => x, StringComparer.OrdinalIgnoreCase));

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

        // The level created, or null when one at that height is kept (MA-1a item 4: the caller stamps what it created). MA-5b-7: its name as
        // typed (another level of that name: "Name (2)", said), its Building Story as left in the review.
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
            string want = UniqueLevelName(lv.Name, level.Id);
            try
            {
                level.Name = want;
                if (want != lv.Name) warnings.Add($"A level named '{lv.Name}' is already in the model — the new one at {lv.ElevationMm:0} mm is '{want}'.");
            }
            catch (Exception ex) { warnings.Add($"Revit refused the name '{want}' ({ex.Message}) — the level at {lv.ElevationMm:0} mm is '{level.Name}'; rename it."); }
            level.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.Set(lv.Story ? 1 : 0);
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

        // The grid created, or null when it is skipped or kept (MA-1a item 4: the caller stamps what it created). MA-5b-7: a grid in the
        // model on the same line is the one kept (by position, not name); a grid of that name elsewhere gives the new one "Name (2)", said.
        private Grid CreateGrid(DetectedGrid g, List<string> warnings)
        {
            XYZ p1 = new XYZ(g.X1 * MmToFeet, g.Y1 * MmToFeet, 0);
            XYZ p2 = new XYZ(g.X2 * MmToFeet, g.Y2 * MmToFeet, 0);
            if (p1.DistanceTo(p2) < _doc.Application.ShortCurveTolerance)
            {
                warnings.Add($"Grid '{g.Name}' too short to create — skipped.");
                return null;
            }
            var grids = new FilteredElementCollector(_doc).OfClass(typeof(Grid)).Cast<Grid>().ToList();
            foreach (var x in grids)
                if (x.Curve is Line l && DatumFromDrawing.SameLine(g, l.GetEndPoint(0).X * FeetToMm, l.GetEndPoint(0).Y * FeetToMm, l.GetEndPoint(1).X * FeetToMm, l.GetEndPoint(1).Y * FeetToMm))
                {
                    warnings.Add($"Grid '{g.Name}': grid '{x.Name}' already stands on that line — kept.");
                    return null;
                }
            var taken = grids.Select(x => x.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            string want = g.Name;
            for (int i = 2; taken.Contains(want); i++) want = $"{g.Name} ({i})";
            var grid = Grid.Create(_doc, Line.CreateBound(p1, p2));
            try
            {
                grid.Name = want;
                if (want != g.Name) warnings.Add($"A grid named '{g.Name}' stands elsewhere in the model — this one is '{want}'; rename one of them.");
            }
            catch (Exception ex) { warnings.Add($"Revit refused the grid name '{want}' ({ex.Message}) — it is '{grid.Name}'; rename it."); }
            return grid;
        }
    }
}
