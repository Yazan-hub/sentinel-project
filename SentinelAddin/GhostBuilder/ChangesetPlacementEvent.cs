#nullable disable
// Revit API writes must NEVER run from Task.Run — the executor runs here, on the API context the
// ExternalEvent provides, mirroring GhostBuilderPlacementEvent's snapshot pattern.
using System;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;

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
            Completed?.Invoke(new ChangesetExecutor.ExecutionResult { Error = "no request staged", NotRun = true });
            return;
        }
        if (Sentinel.Engine.DocPin.Check(app, doc, "place the proposals") is { } refusal)
        {
            Completed?.Invoke(new ChangesetExecutor.ExecutionResult { Error = refusal, NotRun = true });
            return;
        }
        var result = new ChangesetExecutor().Execute(doc, cs, ticked);
        Completed?.Invoke(result);
    }

    public string GetName() => "Sentinel - AI Changeset Placement";
}
