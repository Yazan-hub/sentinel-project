#nullable disable
// Governed AI modeling (A2): the ribbon entry. Fetch proposed changesets (FIFO), show the review
// window, execute the human's ticks via ExternalEvent, report the result — with a retry dialog,
// because the bridge's recorded status is the truth and an unreported application is a lie by
// omission. Re-fetches the changeset right before executing: if an agent withdrew it meanwhile,
// nothing runs (the bridge's CAS makes the report side race-safe too).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Interop;
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
    private static ChangesetPlacementEvent _handler;
    private static ExternalEvent _event;

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

        _handler ??= new ChangesetPlacementEvent();
        _event ??= ExternalEvent.Create(_handler);

        var window = new ChangesetReviewWindow(cs);
        new WindowInteropHelper(window) { Owner = c.Application.MainWindowHandle }; // module convention: every modeless command window is owned by Revit's main window
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
                _handler.Completed -= onDone;
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
            _handler.Completed += onDone;
            _handler.SetRequest(fresh, new HashSet<string>(ticked));
            _event.Raise();
        };
        window.Show();
        return Result.Succeeded;
    }

    private static void Report(BcfConfig cfg, string key, string id, List<AppliedEntry> applied, List<string> rejected, string note)
    {
        while (true)
        {
            if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, out var err)) return;
            var d = new TaskDialog("Sentinel — AI proposals")
            {
                MainInstruction = "The result could not be reported to the bridge.",
                MainContent = $"{err}\n\nThe governed record does NOT yet reflect what happened in Revit. Retry?",
                CommonButtons = TaskDialogCommonButtons.Retry | TaskDialogCommonButtons.Cancel,
            };
            if (d.Show() != TaskDialogResult.Retry) return;
        }
    }
}
