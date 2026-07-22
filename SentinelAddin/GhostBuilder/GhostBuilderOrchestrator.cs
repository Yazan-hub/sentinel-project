#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// Ghost Builder pass, split by threading affinity so the UI never freezes:
    ///
    ///   • ExtractInputs(cadLink)  — Revit API READS. API thread only. Fast.
    ///   • MapAsync(inputs, ct)    — LLM HTTP call. Pure network, no Revit API — safe on a
    ///                               background thread (Task.Run) and cancellable.
    ///   • Place(inputs, mapping)  — Revit API WRITES (Wall.Create, family placement) inside one
    ///                               transaction. API thread ONLY — must run via ExternalEvent.
    ///
    /// The old RunAsync did all three on one thread; blocking on it pinned the UI for the whole
    /// LLM round-trip. Callers now drive the three phases across the right threads themselves.
    /// </summary>
    public sealed class GhostBuilderOrchestrator
    {
        private readonly Document _doc;
        private readonly GhostCadExtractor _extractor;
        private readonly ILayerMapper _mapper;
        private readonly double _minConfidence;
        private readonly string _familyLibraryDir;   // null -> skip preload

        public GhostBuilderOrchestrator(Document doc, ILayerMapper mapper,
                                        double minConfidence = 0.5, string familyLibraryDir = null)
        {
            _doc = doc;
            _mapper = mapper;
            _minConfidence = minConfidence;
            _familyLibraryDir = familyLibraryDir;
            _extractor = new GhostCadExtractor(doc);
        }

        /// <summary>Extracted CAD layers + placeable elements. Plain data — no Revit API, so it
        /// can be carried onto a background thread and back safely.</summary>
        public sealed class Inputs
        {
            public List<string> Layers { get; set; }
            public List<GhostElement> Elements { get; set; }
        }

        /// <summary>PHASE 1 — Revit API reads. Call on the API thread.</summary>
        public Inputs ExtractInputs(ImportInstance cadLink)
        {
            if (cadLink == null) throw new ArgumentNullException(nameof(cadLink));
            return new Inputs
            {
                Layers   = _extractor.ExtractCadLayers(cadLink).ToList(),
                Elements = _extractor.ExtractGhostElements(cadLink).ToList(),
            };
        }

        /// <summary>PHASE 2 — LLM mapping. Pure network; safe on a background thread. Cancellable.</summary>
        public Task<MappingResult> MapAsync(Inputs inputs, CancellationToken ct = default)
        {
            if (inputs?.Layers == null || inputs.Layers.Count == 0)
                return Task.FromResult<MappingResult>(null); // nothing to map
            return _mapper.MapLayersAsync(inputs.Layers, ct);
        }

        /// <summary>
        /// PHASE 3 — geometry creation inside one transaction. Revit API writes: API thread ONLY,
        /// must be invoked from an IExternalEventHandler.Execute. Never from Task.Run.
        /// </summary>
        public GhostPlacementEngine.PlacementReport Place(Inputs inputs, MappingResult mapping)
        {
            if (inputs?.Layers == null || inputs.Layers.Count == 0)
                return new GhostPlacementEngine.PlacementReport
                { Warnings = { "No CAD layers found in import; nothing to build." } };

            if (mapping?.Mappings == null || mapping.Mappings.Count == 0)
                return new GhostPlacementEngine.PlacementReport
                { Warnings = { "LLM returned no mappings; nothing to build." } };

            var elements = inputs.Elements;

            using var t = new Transaction(_doc, "Ghost Builder - LOD 200");
            t.Start();

            // Auto-resolve the creation failures a bulk dirty-CAD build raises at commit
            // ("Can't make Wall", "Can't keep elements joined") so the user isn't blocked behind
            // dozens of modal "cannot be ignored" dialogs — and a stray Cancel can't nuke the build.
            FailureHandlingOptions fho = t.GetFailureHandlingOptions();
            fho.SetFailuresPreprocessor(new GhostFailureHandler());
            fho.SetClearAfterRollback(true);
            t.SetFailureHandlingOptions(fho);
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

                // Floor types are system families too — duplicate a base type for any mapped floor type
                // the doc lacks, so a "Floors" layer builds instead of skipping on a missing type.
                var floorProv = new GhostFloorTypeProvisioner(_doc).Provision(mapping);
                if (floorProv.Created > 0) _doc.Regenerate();

                var engine = new GhostPlacementEngine(_doc, _minConfidence);
                report = engine.Place(mapping, elements);
                report.Warnings.InsertRange(0, floorProv.Warnings);
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
