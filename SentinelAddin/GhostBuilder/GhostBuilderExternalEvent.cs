#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
using Sentinel.Commands;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// PHASE 3 handoff. The review's Build stages the reviewed rows here and Raise()s; Revit then calls Execute() ON THE API
    /// THREAD — the only place a model may change. MA-1a step 2: the build is planned, filed as changesets (source dwg) and
    /// placed by ChangesetExecutor. MA-3b7: planned by GhostChangesetBuild.Prepare (a dry run, here), filed by File on a pool
    /// thread, placed by Place in a second event in the model the review was opened on (DocPin).
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
                // MA-3b7 (XC-3): the dry run on Revit's thread; the filing on a pool thread (Revit answers meanwhile); the build back on
                // Revit's thread in the model it started from (DocPin) — a model switched or closed is said, what was filed is withdrawn.
                // MA-3b7 review: one guard with Review AI Proposals and Promote (DD) — Ghost's changesets are proposed on the bridge from the
                // first chunk until the build places them, so no review applies one meanwhile (the frozen thread used to be the guard).
                if (ReviewChangesetsCommand.Held) { Completed?.Invoke(new GhostPlacementEngine.PlacementReport { NotBuilt = ReviewChangesetsCommand.Busy }, null); return; }
                var prep = GhostChangesetBuild.Prepare(app, request);
                if (prep.Refused) { Completed?.Invoke(prep.Report, null); return; }
                var doc = prep.Doc;
                App.PanelVm?.LogDoctor(GhostFailurePolicy.FilingLine(prep.Bound ? prep.Bodies.Count : 0, prep.Bound));
                ReviewChangesetsCommand.Hold(); // released exactly once (Once): after the not-filed words, after Place returns, or in NotPlaced
                int held = 1;
                void Once() { if (Interlocked.Exchange(ref held, 0) == 1) ReviewChangesetsCommand.Release(); }
                Task.Run(() => GhostChangesetBuild.File(prep)).ContinueWith(t =>
                {
                  try
                  {
                    var filed = t.Status == TaskStatus.RanToCompletion ? t.Result
                        : new GhostChangesetBuild.Filed { Changesets = new List<ChangesetDto>(), NotFiled = GhostFailurePolicy.NotFiledLine(t.Exception?.GetBaseException().Message ?? "the filing did not finish") };
                    if (filed.NotFiled != null)
                    {
                        prep.Report.NotBuilt = filed.NotFiled; prep.Report.Ledger = filed.Ledger;
                        // Back on Revit's thread through the hub, as Completed promises: the command's handler shows a TaskDialog.
                        App.Events.Enqueue(_ => { try { Say(() => prep.Report); } finally { Once(); } }, "say the Ghost Builder build was not filed");
                        return;
                    }
                    App.Events.Enqueue(doc, "place the Ghost Builder build", (u, d) => Say(() => { try { return GhostChangesetBuild.Place(u, d, prep, filed); } finally { Once(); } }),
                        why => Say(() => { try { return GhostChangesetBuild.NotPlaced(prep, filed, why); } finally { Once(); } }));
                  }
                  catch (Exception ex) { Once(); App.PanelVm?.LogDoctor("Ghost Builder: the build was not handed back to Revit — " + ex.Message); }
                }, TaskScheduler.Default);
            }
            catch (Exception ex)
            {
                // Never let an exception escape Execute() — Revit treats it as a fatal add-in fault.
                Completed?.Invoke(null, ex);
            }
        }

        // MA-3b7: event B and the pool thread's words reach Completed as Execute did — a throw is the error, never lost in the hub.
        private void Say(Func<GhostPlacementEngine.PlacementReport> report)
        {
            try { Completed?.Invoke(report(), null); }
            catch (Exception ex) { Completed?.Invoke(null, ex); }
        }

        public string GetName() => Sentinel.Engine.OrgNames.GhostEventName(Org);
    }
}
