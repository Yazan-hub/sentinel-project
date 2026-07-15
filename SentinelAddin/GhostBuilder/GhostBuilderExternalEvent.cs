#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using Autodesk.Revit.UI;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// PHASE 3 handoff. Places the already-computed geometry on the Revit API thread.
    ///
    /// The LLM mapping happens on a background thread in the command; when it finishes, the command
    /// stages the result here and Raise()s. Revit then calls Execute() ON THE API THREAD — the only
    /// place Wall.Create / family placement is legal. Revit API writes must NEVER run from Task.Run,
    /// which is why placement is funneled through this ExternalEvent rather than done inline.
    /// </summary>
    public sealed class GhostBuilderPlacementEvent : IExternalEventHandler
    {
        private readonly double _minConfidence;

        // Per-raise payload, staged on the UI/background thread just before Raise().
        private GhostBuilderOrchestrator _orchestrator;
        private GhostBuilderOrchestrator.Inputs _inputs;
        private MappingResult _mapping;

        /// <summary>Fired on the API thread after placement. Report null when an error is passed.</summary>
        public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

        public GhostBuilderPlacementEvent(double minConfidence = 0.5) => _minConfidence = minConfidence;

        /// <summary>Stage the pre-computed inputs + mapping for the next Raise().</summary>
        public void SetRequest(GhostBuilderOrchestrator orchestrator,
                               GhostBuilderOrchestrator.Inputs inputs, MappingResult mapping)
        {
            _orchestrator = orchestrator;
            _inputs = inputs;
            _mapping = mapping;
        }

        public void Execute(UIApplication app)
        {
            // Snapshot + clear so a stale payload can't be reused.
            var orchestrator = _orchestrator;
            var inputs = _inputs;
            var mapping = _mapping;
            _orchestrator = null; _inputs = null; _mapping = null;

            try
            {
                if (orchestrator == null)
                    throw new InvalidOperationException("No request staged. Call SetRequest() before Raise().");

                // We ARE on the API thread here — the transaction + geometry writes are legal.
                var report = orchestrator.Place(inputs, mapping);
                Completed?.Invoke(report, null);
            }
            catch (Exception ex)
            {
                // Never let an exception escape Execute() — Revit treats it as a fatal add-in fault.
                Completed?.Invoke(null, ex);
            }
        }

        public string GetName() => "BDS Ghost Builder - Placement";
    }
}
