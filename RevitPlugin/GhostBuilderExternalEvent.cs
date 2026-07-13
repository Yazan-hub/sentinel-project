using System;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace BadranDesignStudio.Sentinel
{
    /// <summary>
    /// Revit-thread-safe entry point for the Ghost Builder. Execute() is invoked by Revit
    /// ON THE API THREAD, so it is legal to open transactions and touch the document here.
    /// The async orchestrator is driven synchronously via GetAwaiter().GetResult() — safe
    /// because we are already on the API thread and only briefly block it.
    ///
    /// Usage (modeless add-in):
    ///   _handler = new GhostBuilderExternalEvent(mapper);
    ///   _event   = ExternalEvent.Create(_handler);
    ///   ...
    ///   _handler.SetRequest(uiDoc.Document, pickedCadLink);
    ///   _event.Raise();   // Revit calls Execute() on the API thread when ready
    /// </summary>
    public sealed class GhostBuilderExternalEvent : IExternalEventHandler
    {
        private readonly LocalGhostBuilder _mapper;
        private readonly double _minConfidence;

        // Per-raise request payload. Set immediately before Raise().
        private Document _doc;
        private ImportInstance _cadLink;

        /// <summary>Fired on the API thread after each run. Report is null when an error is passed.</summary>
        public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

        public GhostBuilderExternalEvent(LocalGhostBuilder mapper, double minConfidence = 0.5)
        {
            _mapper = mapper ?? throw new ArgumentNullException(nameof(mapper));
            _minConfidence = minConfidence;
        }

        /// <summary>Stage the inputs for the next Raise(). Call on the UI thread just before Raise().</summary>
        public void SetRequest(Document doc, ImportInstance cadLink)
        {
            _doc = doc;
            _cadLink = cadLink;
        }

        public void Execute(UIApplication app)
        {
            // Snapshot + clear the request so a stale payload can't be reused accidentally.
            Document doc = _doc;
            ImportInstance cadLink = _cadLink;
            _doc = null;
            _cadLink = null;

            try
            {
                if (doc == null || cadLink == null)
                    throw new InvalidOperationException("No request staged. Call SetRequest() before Raise().");

                var orchestrator = new GhostBuilderOrchestrator(doc, _mapper, _minConfidence);

                // We ARE on the API thread; block on the async pass. The transaction inside
                // RunAsync opens only after the LLM await completes, all on this thread.
                var report = orchestrator.RunAsync(cadLink).GetAwaiter().GetResult();

                Completed?.Invoke(report, null);
            }
            catch (Exception ex)
            {
                // Never let an exception escape Execute() — Revit would treat it as a fatal add-in fault.
                Completed?.Invoke(null, ex);
            }
        }

        public string GetName() => "BDS Ghost Builder";
    }
}
