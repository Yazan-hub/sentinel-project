#nullable disable
// Governed AI modeling (A2): the ribbon entry. Fetch proposed changesets (FIFO), show the review
// window, execute the human's ticks via ExternalEvent, report the result — with a retry dialog,
// because the bridge's recorded status is the truth and an unreported application is a lie by
// omission. Re-fetches the changeset right before executing: if an agent withdrew it meanwhile,
// nothing runs (the bridge's CAS makes the report side race-safe too).
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

[Transaction(TransactionMode.Manual)]
public sealed class ReviewChangesetsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        var cfg = BcfConfig.Load();
        var key = SettingsManager.WebProjectKeyFor(doc);

        var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
        if (pending == null)
        {
            TaskDialog.Show("Sentinel — AI proposals", $"Couldn't reach the bridge:\n{fetchErr}");
            return Result.Failed;
        }
        if (pending.Count == 0)
        {
            TaskDialog.Show("Sentinel — AI proposals", $"No pending proposals for project \"{key}\".");
            return Result.Succeeded;
        }

        var cs = pending[0]; // FIFO; the dialog says how many wait behind it
        if (pending.Count > 1)
            TaskDialog.Show("Sentinel — AI proposals", $"{pending.Count} proposals pending — reviewing the oldest first ({cs.Name}). Run again for the next.");

        // Per-invocation handler/event (every sibling command does the same): a static pair would
        // let a second open review window clobber the staged request and double-fire callbacks.
        // The closure below keeps both alive for the window's lifetime.
        var handler = new ChangesetPlacementEvent();
        var evt = ExternalEvent.Create(handler);

        var window = new ChangesetReviewWindow(cs);
        DialogOwner.Attach(window, c); // house helper: owned by Revit's main window
        window.DecideRequested += (ticked, unticked, note) =>
        {
            // Re-fetch: only a still-proposed changeset may run (an agent may have withdrawn it).
            var fresh = ChangesetClient.FetchOne(cfg, key, cs.Id, out var oneErr);
            if (fresh == null || fresh.Status != "proposed")
            {
                TaskDialog.Show("Sentinel — AI proposals",
                    fresh == null ? $"Couldn't re-check the changeset:\n{oneErr}" : $"Changeset is now \"{fresh.Status}\" — nothing was created.");
                return;
            }

            if (ticked.Count == 0)
            {
                Report(cfg, key, cs.Id, new List<AppliedEntry>(), unticked, note); // declined — no transaction at all
                return;
            }

            Action<ChangesetExecutor.ExecutionResult> onDone = null;
            onDone = result =>
            {
                handler.Completed -= onDone;
                if (result.Error != null)
                {
                    // Whole changeset rolled back: report declined with the reason — honestly.
                    Report(cfg, key, cs.Id, new List<AppliedEntry>(),
                        cs.Elements.Select(e => e.ProposalGuid).ToList(),
                        $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"));
                    TaskDialog.Show("Sentinel — AI proposals", $"Transaction failed and was rolled back:\n{result.Error}\n\nReported as declined.");
                    return;
                }
                Report(cfg, key, cs.Id, result.Applied, unticked, note);
                TaskDialog.Show("Sentinel — AI proposals",
                    $"Created {result.Applied.Count} element(s) from \"{cs.Name}\"." + (unticked.Count > 0 ? $"\n{unticked.Count} unticked element(s) reported as rejected." : ""));
            };
            handler.Completed += onDone;
            handler.SetRequest(fresh, new HashSet<string>(ticked));
            evt.Raise();
        };
        window.Show();
        return Result.Succeeded;
    }

    private static void Report(BcfConfig cfg, string key, string id, List<AppliedEntry> applied, List<string> rejected, string note)
    {
        while (true)
        {
            if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, out var err)) return;
            // When elements WERE created, cancelling leaves the bridge still saying "proposed" —
            // and a later review run would re-execute the same changeset, DUPLICATING the elements.
            // Say so explicitly; an unnamed hazard is a trap.
            var hazard = applied.Count > 0
                ? $"\n\nWARNING: {applied.Count} element(s) were ALREADY CREATED in this model. If you cancel, the bridge still lists this changeset as \"proposed\" — reviewing it again would create duplicates. Retry until the report succeeds, or have the agent withdraw the changeset before any re-review."
                : "";
            var d = new TaskDialog("Sentinel — AI proposals")
            {
                MainInstruction = "The result could not be reported to the bridge.",
                MainContent = $"{err}\n\nThe governed record does NOT yet reflect what happened in Revit.{hazard}\n\nRetry?",
                CommonButtons = TaskDialogCommonButtons.Retry | TaskDialogCommonButtons.Cancel,
            };
            if (d.Show() != TaskDialogResult.Retry) return;
        }
    }
}
