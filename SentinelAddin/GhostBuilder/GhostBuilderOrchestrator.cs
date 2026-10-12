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
    ///
    /// A DWG build is placed by GhostChangesetBuild through ChangesetExecutor (MA-1a step 2); Photo Massing files a
    /// changeset (MA-6-6), so PlacePrepared, its own transaction, is gone. The old RunAsync did every phase on one thread;
    /// blocking on it pinned the UI for the whole LLM round-trip.
    /// </summary>
    public sealed class GhostBuilderOrchestrator
    {
        private readonly Document _doc;
        private readonly GhostCadExtractor _extractor;
        private readonly ILayerMapper _mapper;
        private readonly double _minConfidence;
        private readonly string _familyLibraryDir;   // null -> skip preload
        private readonly GuidelineMatcher _guideline; // optional Office Modelling Guideline (per-wall types)

        public GhostBuilderOrchestrator(Document doc, ILayerMapper mapper,
                                        double minConfidence = 0.5, string familyLibraryDir = null,
                                        GuidelineMatcher guideline = null)
        {
            _doc = doc;
            _mapper = mapper;
            _minConfidence = minConfidence;
            _familyLibraryDir = familyLibraryDir;
            _guideline = guideline;
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
            var elements = _extractor.ExtractGhostElements(cadLink).ToList();
            // MA-1b: a layer that holds only block inserts has no curve of its own to name it (ExtractCadLayers reads curves) —
            // it is still a row of the review, counted one per insert.
            var layers = _extractor.ExtractCadLayers(cadLink)
                .Concat(elements.Where(e => e.Block != null).Select(e => e.CadLayer))
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            return new Inputs { Layers = layers, Elements = elements };
        }

        /// <summary>PHASE 2 — LLM mapping. Pure network; safe on a background thread. Cancellable.</summary>
        public Task<MappingResult> MapAsync(Inputs inputs, CancellationToken ct = default)
        {
            if (inputs?.Layers == null || inputs.Layers.Count == 0)
                return Task.FromResult<MappingResult>(null); // nothing to map
            return _mapper.MapLayersAsync(inputs.Layers, ct);
        }

        // MA-1a step 2: a DWG build no longer places here — it pairs, plans and files changesets that ChangesetExecutor
        // places (GhostChangesetBuild, raised by GhostBuilderPlacementEvent); Place(Inputs, …) was deleted with that move.
        // MA-6-6: Photo Massing files one changeset too, so PlacePrepared went with MassingBuilder (R12).
    }
}
