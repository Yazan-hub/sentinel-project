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
        private readonly GuidelineMatcher _guideline; // optional Office Modelling Guideline (per-wall types)
        private readonly bool _placeholderTypes;      // massing: default types + a note instead of skipping

        /// <summary>The Ghost transaction's name (DWG and massing) — also how the global Doctor (FailureInterceptor) knows to
        /// leave this build's warnings alone ([BP] P1-3, GhostFailurePolicy.DoctorSkips). Unchanged; step 2 renames it with
        /// the changeset.</summary>
        public const string TxName = GhostFailurePolicy.TxName;

        public GhostBuilderOrchestrator(Document doc, ILayerMapper mapper,
                                        double minConfidence = 0.5, string familyLibraryDir = null,
                                        GuidelineMatcher guideline = null, bool placeholderTypes = false)
        {
            _doc = doc;
            _mapper = mapper;
            _minConfidence = minConfidence;
            _familyLibraryDir = familyLibraryDir;
            _guideline = guideline;
            _placeholderTypes = placeholderTypes;
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
        public GhostPlacementEngine.PlacementReport Place(Inputs inputs, MappingResult mapping, Level level = null)
        {
            if (inputs?.Layers == null || inputs.Layers.Count == 0)
                return new GhostPlacementEngine.PlacementReport
                { Warnings = { "No CAD layers found in import; nothing to build." } };

            if (mapping?.Mappings == null || mapping.Mappings.Count == 0)
                return new GhostPlacementEngine.PlacementReport
                { Warnings = { "LLM returned no mappings; nothing to build." } };

            // Between map and place: collapse each wall's two drawn faces into one centreline element
            // carrying the measured thickness. A DWG draws a wall as two parallel lines a thickness apart;
            // without this each becomes a separate paper-thin wall and the thickness — the number the
            // Office Modelling Guideline picks the wall TYPE from — is thrown away. Additive and safe: a
            // wall it can't pair stays exactly the run it was.
            var elements = GhostWallPairer.PairWalls(inputs.Elements, mapping);
            return PlacePrepared(elements, mapping, level);
        }

        /// <summary>
        /// Same as Place(Inputs, MappingResult, Level), but resolves the level by ElementId against
        /// THIS orchestrator's own _doc — never the active document. The review window is modeless,
        /// so the user can switch documents between picking a level and clicking Build; resolving
        /// against ActiveUIDocument would risk placing on a same-numbered ElementId from the wrong
        /// document. -1 means "no level chosen" (falls back to the doc's lowest level, same as
        /// passing level: null).
        /// </summary>
        public GhostPlacementEngine.PlacementReport Place(Inputs inputs, MappingResult mapping, long levelId)
        {
            Level level = null;
            string fallbackWarning = null;
            if (levelId >= 0)
            {
#if NET48
                level = _doc.GetElement(new ElementId((int)levelId)) as Level;
#else
                level = _doc.GetElement(new ElementId(levelId)) as Level;
#endif
                if (level == null)
                {
                    var lowest = new FilteredElementCollector(_doc).OfClass(typeof(Level)).Cast<Level>()
                        .OrderBy(l => l.Elevation).FirstOrDefault();
                    fallbackWarning = lowest != null
                        ? $"Chosen level no longer exists — built on {lowest.Name} instead."
                        : "Chosen level no longer exists.";
                }
            }
            var report = Place(inputs, mapping, level);
            if (fallbackWarning != null) report.Warnings.Insert(0, fallbackWarning);
            return report;
        }

        /// <summary>
        /// Place already-prepared elements + mapping, WITHOUT the DWG face-pairing pass — for callers that
        /// bring their own geometry with thickness already set (photo massing). Same transaction,
        /// provisioners, guideline and audit as a DWG build, so a massing is governed identically.
        /// </summary>
        public GhostPlacementEngine.PlacementReport PlacePrepared(
            System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, Level level = null)
        {
            if (mapping?.Mappings == null || mapping.Mappings.Count == 0)
                return new GhostPlacementEngine.PlacementReport { Warnings = { "Nothing to build." } };

            using var t = new Transaction(_doc, TxName);
            t.Start();

            // MA-1a (GHB-5): the creation failures a bulk dirty-CAD build raises at commit are handled by GhostFailureHandler —
            // only THIS build's elements (handler.Ours, filled below just before Commit) are ever resolved or deleted; a failure
            // that names none of them rolls the build back; warnings are counted and left to Revit. Non-modal: the warnings
            // Revit keeps are shown the ordinary, dismissable way. Silent: no dialog after a rollback the handler chose.
            var handler = new GhostFailureHandler();
            FailureHandlingOptions fho = t.GetFailureHandlingOptions();
            fho.SetFailuresPreprocessor(handler);
            fho.SetClearAfterRollback(true);
            fho.SetForcedModalHandling(false);
            t.SetFailureHandlingOptions(fho);
            GhostPlacementEngine.PlacementReport report;
            try
            {
                // A7: every type the model has before this build — a type parameter is written only on a type not in it.
                var typesBefore = new HashSet<long>(new FilteredElementCollector(_doc).WhereElementIsElementType()
                                                        .ToElementIds().Select(i => i.IdValue()));

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

                // Wall and floor types are system families (not loadable) — a mapped type the doc lacks is created from
                // its catalogue sibling, or reported as a gap. Same transaction, before the engine caches types.
                var wallProv = new GhostWallTypeProvisioner(_doc, _guideline).Provision(mapping);
                if (wallProv.Created > 0) _doc.Regenerate();

                var floorProv = new GhostFloorTypeProvisioner(_doc, _guideline).Provision(mapping);
                if (floorProv.Created > 0) _doc.Regenerate();

                var engine = new GhostPlacementEngine(_doc, _minConfidence, _guideline, level, _placeholderTypes)
                { TypesBefore = typesBefore };
                report = engine.Place(mapping, elements);
                report.TypeGaps = wallProv.Gaps + floorProv.Gaps;
                report.Warnings.InsertRange(0, floorProv.Warnings);
                report.Warnings.InsertRange(0, wallProv.Warnings);
                if (pre != null) report.Warnings.InsertRange(0, pre.Warnings);
                // What this build added to the model's type library before placing — named, not just counted (GHB-5: the
                // review showed the forecast; this is what actually happened).
                report.CreatedTypes.InsertRange(0, floorProv.CreatedNames.Select(n => $"{n} (floor type the layer mapping names)"));
                report.CreatedTypes.InsertRange(0, wallProv.CreatedNames.Select(n => $"{n} (wall type the layer mapping names)"));
                if (pre != null) report.CreatedTypes.InsertRange(0, pre.LoadedNames.Select(n => $"family {n} (loaded from the Ghost family library)"));

                foreach (var (id, _) in report.NewElements) handler.Ours.Add(id.IdValue());
                TransactionStatus status = t.Commit();
                // Failure processing can roll the build back WITHOUT throwing (ChangesetExecutor checks the same): then
                // nothing this transaction made exists — no element, type or family — and the report says only that.
                if (status == TransactionStatus.RolledBack)
                    return new GhostPlacementEngine.PlacementReport
                    { RolledBack = handler.RolledBack ?? $"Revit did not commit the build (transaction status {status})" };
                // A6: any other non-Committed status (Pending, …) — Revit may still finish or drop it: no recount, say so.
                if (status != TransactionStatus.Committed)
                    return new GhostPlacementEngine.PlacementReport { NotFinished = GhostFailurePolicy.NotFinishedLine(status.ToString()) };

                // Placed is what survived the commit, counted from this build's own ids; each one Revit removed is named
                // with the failure that named it, and a warning that named it went with it (not counted).
                var gone = new HashSet<long>();
                foreach (var (id, what) in report.NewElements)
                {
                    if (_doc.GetElement(id) != null) { report.Placed++; continue; }
                    gone.Add(id.IdValue());
                    report.DeletedByRevit.Add(what + " — " +
                        (handler.Why.TryGetValue(id.IdValue(), out string why) ? why : "removed by Revit at commit"));
                }
                foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) report.RevitWarnings[kv.Key] = kv.Value;
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
