using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.Commands;

/// <summary>
/// G1 — <b>Governed Publish</b>: the one publish path (cohesion phase 5b, spec Decision 8) with a dialog.
/// <see cref="Publisher.Prepare"/> on this thread — the whole model (the default 3D view) exported to a TEMP IFC in
/// the contract's schema, the delivery gate and its ledger row (waited for, ≤ 6 s), the elements extracted —
/// then <see cref="Publisher.Judge"/> waited for OFF this thread: one <c>POST /cde/:key/propose</c> that judges the
/// IDS and the name and, on accepted or recorded, registers the version and stamps its verdict (one proposal row,
/// one version, one verdict row; a gate FAIL never reaches it). Then <see cref="Publisher.Stage"/>: the sidecar
/// naming that version is written first, then the IFC moves into the outbox; a reject stages nothing. One dialog
/// from <see cref="PublishLines"/> names the container, the revision, both ledger rows and what judged. Auto-publish
/// runs the same three calls without the dialog, when the project's publish@n says so.
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

        // Auto-publish between its Prepare and its Stage would write the same outbox name this command does.
        if (AutoPublish.InFlight)
        {
            TaskDialog.Show(Title, "Auto-publish is judging this model right now — its Doctor line lands when it finishes. " +
                                   "Run Governed Publish after that.\n\nNothing was exported.");
            return Result.Cancelled;
        }

        // 1) Prepare on this (API) thread: the contract, the whole-model export to TEMP (never the outbox — a reject
        //    must not leak a model into it), the gate and its ledger row, the extraction. Not Ready = refused before
        //    the referee (an export that produced nothing, or a gate FAIL): the dialog says which; the temp IFC is
        //    already discarded and nothing is staged.
        var plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "governed"),
                                     (kind, timeout) => ArtefactClient.Resolve(projectKey, kind, timeout));
        if (!plan.Ready)
        {
            TaskDialog.Show(Title, PublishLines.Dialog(plan));
            return plan.GateFailed ? Result.Succeeded : Result.Failed;
        }
        // Without an office code the Pset_<org>.* rows were dropped from the read table (PsetMap), so the referee
        // sees them as missing. Say so out loud — the verdict is still honest and still recorded.
        if (plan.OrgWarning is not null) TaskDialog.Show(Title, plan.OrgWarning);

        // 2) Judge OFF this thread and wait for it (the 120 s /propose): a modal command may block on the bridge; a
        //    save handler may not. 3) Stage: accepted or recorded → the sidecar {project, container, version_id},
        //    then the IFC into the outbox; anything else → the temp IFC is deleted and nothing is staged.
        var outcome = Task.Run(() => Publisher.Judge(plan)).GetAwaiter().GetResult();
        var stage = Publisher.Stage(plan, outcome, PlatformExporter.OutboxDir());
        TaskDialog.Show(Title, PublishLines.Dialog(plan, outcome, stage));
        return Result.Succeeded;
    }
}
