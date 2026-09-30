using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// G1 — <b>Governed Publish</b>: the one publish path (cohesion phase 5b, spec Decision 8) with a dialog.
/// <see cref="Publisher.Prepare"/> on this thread — the whole model (no view filter) exported to a TEMP IFC in
/// the contract's schema, the delivery gate and its ledger row (waited for, ≤ 6 s), the elements extracted —
/// then <see cref="Publisher.Judge"/> OFF this thread, not waited for (GP-1: Revit stays usable): one
/// <c>POST /cde/:key/propose</c> that judges the IDS and the name and, on accepted or recorded, registers the version
/// and stamps its verdict (one proposal row, one version, one verdict row; a gate FAIL never reaches it). Then, back
/// through the event hub, <see cref="Publisher.Stage"/>: the sidecar naming that version is written first, then the
/// IFC moves into the outbox; a reject stages nothing. A progress window (<see cref="PublishProgress"/>, its own
/// thread) shows the four steps and carries Cancel. One dialog from <see cref="PublishLines"/> names the container,
/// the revision, both ledger rows and what judged. Auto-publish runs the same three calls without the dialog, when
/// the project's publish@n says so.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class GovernedPublishCommand : IExternalCommand
{
    private const string Title = "Sentinel — Governed Publish";

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;

        // The web project this document publishes into (Project Setup → Web project). None → nothing is exported.
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show(Title, ProjectContext.NotBound + "\n\nNothing was exported or published.");
            return Result.Cancelled;
        }
        var projectKey = ctx.Key;

        // A publish between its Prepare and its Stage (Auto-publish, or an earlier Governed Publish still waiting for
        // the referee) would write the same temp and outbox names this command does.
        if (App.Events is not { } events) return Result.Failed; // the hub is made at startup, before the ribbon
        if (Publisher.InFlight)
        {
            TaskDialog.Show(Title, "A publish of this session is still running (Governed Publish waiting for the referee, or " +
                                   "Auto-publish) — its result lands when it finishes. Run Governed Publish after that.\n\nNothing was exported.");
            return Result.Cancelled;
        }

        // GP-1: the progress window, on its own thread (this one is busy inside the export). Steps, Revit's progress
        // during the export, and Cancel.
        Publisher.InFlight = true;
        var progress = PublishProgress.Show(Title);
        bool handedOff = false;
        try
        {
            // 1) Prepare on this (API) thread: the contract, the whole-model export to TEMP (never the outbox — a reject
            //    must not leak a model into it), the gate and its ledger row, the extraction. Not Ready = refused before
            //    the referee (an export that produced nothing, a gate FAIL, or Cancel): the dialog says which; the temp
            //    IFC is already discarded and nothing is staged.
            var plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "governed"),
                                         (kind, timeout) => ArtefactClient.Resolve(projectKey, kind, timeout), "revit", progress);
            if (plan.TempIfcPath.Length > 0) // the export ran: record what was measured (the B33 drill reads it)
                App.PanelVm?.LogDoctor("Governed Publish: Revit reported " + progress.RevitUpdates + " progress update(s) during the IFC export" +
                                       (progress.Token.IsCancellationRequested ? "; Cancel " + (progress.CancelSent ? "was passed to Revit."
                                           : progress.CancelRefused > 0 ? "was refused by Revit on " + progress.CancelRefused + " update(s)." : "did not reach Revit.") : "."));
            if (!plan.Ready)
            {
                progress.Close();
                TaskDialog.Show(Title, PublishLines.Dialog(plan));
                return plan.GateFailed ? Result.Succeeded : Result.Failed;
            }

            // 2) Judge OFF Revit's thread and NOT waited for here (the 120 s /propose): the command returns and Revit
            //    stays usable; Cancel stops the wait. 3) Stage back on the API thread through the hub: accepted or
            //    recorded → the sidecar {project, container, version_id}, then the IFC into the outbox; anything else →
            //    the temp IFC is deleted and nothing is staged. One dialog says what happened.
            progress.Step(3, "Referee — judging the IDS and the name on " + projectKey + " (up to 120 s). Revit is free to use.");
            var ct = progress.Token;
            Task.Run(() => Publisher.Judge(plan, "Governed Publish", ct)).ContinueWith(t => events.Enqueue(_ =>
            {
                try
                {
                    var outcome = t.Status == TaskStatus.RanToCompletion ? t.Result // Judge never throws; this guards the task
                        : PublishOutcome.From(new ProposalResult { Error = t.Exception?.GetBaseException().Message ?? "the verdict call did not finish" });
                    // Step 4 first: a Cancel from here says "too late"; one before it (even after the verdict arrived,
                    // while this job waited for Revit) is honoured — nothing staged, as the window promised.
                    progress.Step(4, "Register — staging the registered version for upload.");
                    string text;
                    if (ct.IsCancellationRequested) { Publisher.Discard(plan); text = PublishLines.CancelledAtReferee(plan); }
                    else text = PublishLines.Dialog(plan, outcome, Publisher.Stage(plan, outcome, PlatformExporter.OutboxDir()));
                    Publisher.InFlight = false; // staged: the next publish may start while the dialog is open
                    progress.Close();
                    // Without an office code the Pset_<org>.* rows were dropped from the read table (PsetMap), so the
                    // referee saw them as missing. Said with the result — the verdict is still honest and still recorded.
                    TaskDialog.Show(Title, (plan.OrgWarning is null ? "" : plan.OrgWarning + "\n\n") + text);
                }
                finally { Publisher.InFlight = false; progress.Close(); }
            }), TaskScheduler.Default);
            handedOff = true;
            return Result.Succeeded;
        }
        finally
        {
            if (!handedOff) { Publisher.InFlight = false; progress.Close(); }
        }
    }
}
