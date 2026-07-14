using System;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;

namespace BadranDesignStudio.Sentinel
{
    /// <summary>
    /// Runs the full Ghost Builder pass: DWG -> layers -> LLM mapping -> geometry -> placed 3D.
    /// The LLM call is awaited BEFORE any transaction opens, because a Revit Transaction must
    /// live entirely on the main thread and must never span an await.
    /// </summary>
    public sealed class GhostBuilderOrchestrator
    {
        private readonly Document _doc;
        private readonly GhostCadExtractor _extractor;
        private readonly LocalGhostBuilder _mapper;
        private readonly double _minConfidence;
        private readonly string _familyLibraryDir;   // null -> skip preload

        public GhostBuilderOrchestrator(Document doc, LocalGhostBuilder mapper,
                                        double minConfidence = 0.5, string familyLibraryDir = null)
        {
            _doc = doc;
            _mapper = mapper;
            _minConfidence = minConfidence;
            _familyLibraryDir = familyLibraryDir;
            _extractor = new GhostCadExtractor(doc);
        }

        public async Task<GhostPlacementEngine.PlacementReport> RunAsync(ImportInstance cadLink)
        {
            if (cadLink == null) throw new ArgumentNullException(nameof(cadLink));

            // 1. Layers -> LLM mapping (async I/O, NO transaction open here).
            var layers = _extractor.ExtractCadLayers(cadLink).ToList();
            if (layers.Count == 0)
                return new GhostPlacementEngine.PlacementReport
                { Warnings = { "No CAD layers found in import; nothing to build." } };

            MappingResult mapping = await _mapper.MapLayersAsync(layers);
            if (mapping?.Mappings == null || mapping.Mappings.Count == 0)
                return new GhostPlacementEngine.PlacementReport
                { Warnings = { "LLM returned no mappings; nothing to build." } };

            // 2. Geometry (sync, still no transaction — reads only).
            var elements = _extractor.ExtractGhostElements(cadLink).ToList();

            // 3. Placement inside a single transaction on the main thread.
            using var t = new Transaction(_doc, "Ghost Builder - LOD 200");
            t.Start();
            GhostPlacementEngine.PlacementReport report;
            try
            {
                // Load any mapped families missing from the doc, THEN regenerate, THEN build the
                // engine — the engine caches the doc's families/types/levels in its constructor,
                // so it must be created AFTER preload or the new families won't be in its cache.
                // Both loads and placement share this one transaction: a failure rolls back atomically.
                GhostFamilyPreloader.PreloadReport pre = null;
                if (_familyLibraryDir != null)
                {
                    pre = new GhostFamilyPreloader(_doc, _familyLibraryDir).Preload(mapping);
                    if (pre.Loaded > 0) _doc.Regenerate(); // make new symbols visible to the collector
                }

                // Wall types are system families (not loadable) — duplicate a base type for any
                // mapped wall type the doc lacks. Same transaction, before the engine caches types.
                var wallProv = new GhostWallTypeProvisioner(_doc).Provision(mapping);
                if (wallProv.Created > 0) _doc.Regenerate();

                var engine = new GhostPlacementEngine(_doc, _minConfidence);
                report = engine.Place(mapping, elements);
                report.Warnings.InsertRange(0, wallProv.Warnings);
                if (pre != null) report.Warnings.InsertRange(0, pre.Warnings);

                t.Commit();
            }
            catch
            {
                if (t.HasStarted() && !t.HasEnded()) t.RollBack();
                throw;
            }

            return report;
        }
    }
}
