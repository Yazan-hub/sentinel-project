#nullable disable
// Revit API writes must NEVER run from Task.Run — the executor runs here, on the API context the
// ExternalEvent provides, mirroring GhostBuilderPlacementEvent's snapshot pattern.
using System;
using System.Collections.Generic;
using Autodesk.Revit.UI;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder;

public sealed class ChangesetPlacementEvent : IExternalEventHandler
{
    public event Action<ChangesetExecutor.ExecutionResult> Completed;

    private ChangesetDto _cs;
    private HashSet<string> _ticked;

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked) { _cs = cs; _ticked = ticked; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked;
        _cs = null; _ticked = null;
        if (cs == null || ticked == null) return;
        var doc = app.ActiveUIDocument?.Document;
        if (doc == null)
        {
            Completed?.Invoke(new ChangesetExecutor.ExecutionResult { Error = "no active document" });
            return;
        }
        var result = new ChangesetExecutor().Execute(doc, cs, ticked);
        Completed?.Invoke(result);
    }

    public string GetName() => "Sentinel - AI Changeset Placement";
}
