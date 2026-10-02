#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using Autodesk.Revit.UI;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// PHASE 3 handoff. The review's Build stages the reviewed rows here and Raise()s; Revit then calls Execute() ON THE API
    /// THREAD — the only place a model may change. MA-1a step 2: the build is planned, filed as changesets (source dwg) and
    /// placed by ChangesetExecutor, all in GhostChangesetBuild.Run, which checks first that the model the review was opened
    /// on is still the active one (DocPin).
    /// </summary>
    public sealed class GhostBuilderPlacementEvent : IExternalEventHandler
    {
        /// The document's office code, set by the command that creates this handler (it names the event only).
        public string Org = "";

        // Per-raise payload, staged on the UI thread just before Raise().
        private GhostChangesetBuild.Request _request;

        /// <summary>Fired on the API thread after the build. Report null when an error is passed.</summary>
        public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

        /// <summary>Stage the reviewed rows for the next Raise().</summary>
        public void SetRequest(GhostChangesetBuild.Request request) => _request = request;

        public void Execute(UIApplication app)
        {
            // Snapshot + clear so a stale payload can't be reused.
            var request = _request;
            _request = null;
            try
            {
                if (request == null) throw new InvalidOperationException("No request staged. Call SetRequest() before Raise().");
                Completed?.Invoke(GhostChangesetBuild.Run(app, request), null);
            }
            catch (Exception ex)
            {
                // Never let an exception escape Execute() — Revit treats it as a fatal add-in fault.
                Completed?.Invoke(null, ex);
            }
        }

        public string GetName() => Sentinel.Engine.OrgNames.GhostEventName(Org);
    }
}
