#nullable disable
// Revit API writes must NEVER run from Task.Run — the executor runs here, on the API context the
// ExternalEvent provides, mirroring GhostBuilderPlacementEvent's snapshot pattern.
// MA-1a item 5: when the model's ruleset has a BLOCK rule, the changeset runs inside a TransactionGroup named as its own
// transaction (one Undo entry, which the undo watcher finds by that name), and before the group is kept the BLOCK check asks
// "This batch will block your sync: N element(s)". Go back rolls the group back and the changeset stays proposed (NotRun);
// Place anyway keeps it, and the line rides on the result's note. Without a BLOCK rule nothing changes here.
// Review amendment C3: nothing thrown here leaves Execute — the group is rolled back if it is still open, and the caller
// is told the changeset was not placed (NotRun: it stays proposed), with the exception named.
using System;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder;

public sealed class ChangesetPlacementEvent : IExternalEventHandler
{
    public event Action<ChangesetExecutor.ExecutionResult> Completed;

    private ChangesetDto _cs;
    private HashSet<string> _ticked;
    private Document _doc;   // the model the review window was opened on (XC-1)

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc) { _cs = cs; _ticked = ticked; _doc = doc; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked; var doc = _doc;
        _cs = null; _ticked = null; _doc = null;
        if (cs == null || ticked == null || doc == null)
        {
            // A Raise without a staged request must still complete — a silent return would hang
            // any caller awaiting the callback.
            Raise(new ChangesetExecutor.ExecutionResult { Error = "no request staged", NotRun = true });
            return;
        }
        if (DocPin.Check(app, doc, "place the proposals") is { } refusal)
        {
            Raise(new ChangesetExecutor.ExecutionResult { Error = refusal, NotRun = true });
            return;
        }
        ChangesetExecutor.ExecutionResult result;
        try
        {
            var before = BlockCheck.Before(doc, out var note);
            if (before == null)
            {
                result = new ChangesetExecutor().Execute(doc, cs, ticked);
                result.Block = note; // "not checked — the ruleset has not loaded yet", or null: no BLOCK rule can fire
            }
            else result = RunChecked(doc, cs, ticked, before);
        }
        catch (Exception ex)
        {
            // C3: never let an exception escape Execute() — Revit treats it as a fatal add-in fault (GhostBuilderPlacementEvent's
            // rule). The executor answers its own failures with a result, so what lands here was thrown before its transaction
            // began, or by the BLOCK check — whose group RunChecked has rolled back.
            result = NotPlaced(ex);
        }
        Raise(result);
    }

    // Final review (C3's other half): a subscriber that throws — the caller's report, its dialogs — does not leave Execute
    // either. Completed is raised once, never again: by then the changeset may be placed, so the Doctor log says what was
    // thrown and that the result may not have been reported (RevitEventHub's rule: never crash Revit, never lose it silently).
    private void Raise(ChangesetExecutor.ExecutionResult result)
    {
        try { Completed?.Invoke(result); }
        catch (Exception ex)
        {
            try { App.PanelVm?.LogDoctor($"Review AI Proposals: reporting the changeset's result failed — {ex.GetType().Name}: {ex.Message}. Check the model and the proposal's state before applying it again."); }
            catch { /* the pane itself is gone */ }
        }
    }

    private static ChangesetExecutor.ExecutionResult NotPlaced(Exception ex) =>
        new ChangesetExecutor.ExecutionResult { NotRun = true, Error = $"The changeset was not placed — {ex.GetType().Name}: {ex.Message}" };

    private static ChangesetExecutor.ExecutionResult RunChecked(Document doc, ChangesetDto cs, HashSet<string> ticked, ScanReport before)
    {
        using var group = new TransactionGroup(doc, UndoWatcher.TxName(cs.Name, cs.Id));
        try
        {
            group.Start();
            // F-S2-1: a group forces modal failure handling on its inner transactions unless told not to.
            group.IsFailureHandlingForcedModal = false;
            var result = new ChangesetExecutor().Execute(doc, cs, ticked);
            if (result.Error != null || result.NotFinished != null)
            {
                // ponytail: a Pending commit (NotFinished) is disposed with the group, as Ghost's build does; the executor's
                // all-or-nothing preprocessor answers every error, so Revit should never leave one pending.
                if (result.NotFinished == null) group.RollBack();
                return result;
            }
            var added = BlockCheck.AddedSince(doc, before);
            if (added.Count > 0 && !BlockCheck.PlaceAnyway(doc, added, $"changeset \"{cs.Name}\"", before.RulesetRef))
            {
                group.RollBack();
                return new ChangesetExecutor.ExecutionResult { NotRun = true, Error = BlockCheck.WentBack(added) };
            }
            // The line first: nothing may throw once the group is kept (the catch below says "not placed").
            var block = added.Count > 0 ? BlockCheck.PlacedAnyway(added, doc.IsWorkshared) : null;
            if (group.Assimilate() != TransactionStatus.Committed)
                return new ChangesetExecutor.ExecutionResult { Error = $"Revit did not keep the changeset's Undo group (status {group.GetStatus()})" };
            result.Block = block;
            return result;
        }
        catch (Exception ex)
        {
            // C3: the scan after the batch or the dialog threw — nothing is kept; the changeset stays proposed.
            if (group.HasStarted() && !group.HasEnded()) group.RollBack();
            return NotPlaced(ex);
        }
    }

    public string GetName() => "Sentinel - AI Changeset Placement";
}
