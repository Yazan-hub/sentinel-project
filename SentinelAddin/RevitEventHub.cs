using System.Windows.Threading;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel;

/// <summary>
/// Single ExternalEvent funnel for all UI->Revit actions (element select/zoom
/// now; Phase 2 adds rejected-change auto-revert per Decision 8). WPF code
/// must never touch the Revit API directly — it enqueues work here.
/// </summary>
public sealed class RevitEventHub : IExternalEventHandler
{
    private readonly ExternalEvent _event;
    private readonly Queue<Action<UIApplication>> _work = new();
    private readonly object _lock = new();

    // MA-3b2b (F-MA3b2-1): Revit's own thread — the hub is made in App.OnStartup, on it.
    private readonly Dispatcher _ui = Dispatcher.CurrentDispatcher;

    public RevitEventHub() => _event = ExternalEvent.Create(this);

    public void Enqueue(Action<UIApplication> action)
    {
        lock (_lock) _work.Enqueue(action);
        // MA-3b2b (F-MA3b2-1): a report's continuation enqueues from a pool thread — the only callers that did, and the one job that
        // did not show (drill MA3b2, Z-4). Every raise now happens on Revit's thread, as every modeless window here raises.
        if (_ui.CheckAccess()) Raise();
        else _ui.BeginInvoke(new Action(Raise));
    }

    private void Raise()
    {
        var raised = _event.Raise();
        if (raised != ExternalEventRequest.Denied && raised != ExternalEventRequest.TimedOut) return;
        // Said, never silent: the job is still in the queue and runs when Revit takes a later raise.
        try { App.PanelVm?.LogDoctor($"Revit did not take a Sentinel action ({raised}) — it stays queued and runs with the next one."); }
        catch { /* the pane itself is gone */ }
    }

    /// <summary>XC-1: run <paramref name="job"/> on <paramref name="doc"/> only while it is open and Revit's active
    /// document; otherwise say why (Doctor log + a dialog, or <paramref name="onRefused"/> when the caller shows it
    /// itself) and change nothing. The job gets the pinned document: it never re-reads ActiveUIDocument.</summary>
    public void Enqueue(Document doc, string what, Action<UIApplication, Document> job, Action<string>? onRefused = null)
        => Enqueue(uiapp =>
        {
            if (Sentinel.Engine.DocPin.Check(uiapp, doc, what) is { } refusal)
            {
                App.PanelVm?.LogDoctor(refusal);
                if (onRefused is not null) onRefused(refusal);
                else TaskDialog.Show("Sentinel", refusal);
                return;
            }
            job(uiapp, doc);
        });

    public void SelectAndShow(Document doc, long elementId) => Enqueue(doc, "select the element", (uiapp, d) =>
    {
        var uidoc = uiapp.ActiveUIDocument!;          // DocPin: the active document is d
        var id = elementId.ToElementId();
        if (d.GetElement(id) is null) return;
        uidoc.Selection.SetElementIds([id]);
        uidoc.ShowElements(id);
    });

    /// <summary>MA-3b2 (zoom to row): by UniqueId, and said — <paramref name="said"/> gets null once the element is selected and shown,
    /// else why not: it is gone from the model, the model is not the active one (DocPin's words), or Revit could not show it. The id
    /// overload above stays silent for its callers.</summary>
    public void SelectAndShow(Document doc, string uniqueId, Action<string?> said) => Enqueue(doc, "show the element", (uiapp, d) =>
    {
        try
        {
            if (d.GetElement(uniqueId) is not { } e) { said("not in this model now (deleted, or changed since the proposal was planned)."); return; }
            var uidoc = uiapp.ActiveUIDocument!;
            uidoc.Selection.SetElementIds([e.Id]);
            uidoc.ShowElements(e.Id);
            said(null);
        }
        catch (Exception ex) { said($"could not be shown — {ex.GetType().Name}: {ex.Message}"); }
    }, said);

    public void Execute(UIApplication app)
    {
        while (true)
        {
            Action<UIApplication>? job;
            lock (_lock)
            {
                if (_work.Count == 0) return;
                job = _work.Dequeue();
            }
            try { job(app); }
            catch (Exception ex)
            {
                // Never let a UI action crash Revit — but never lose it silently either (the ↻ on the strip, Select).
                try { App.PanelVm?.LogDoctor($"A Sentinel action failed and was skipped: {ex.GetType().Name}: {ex.Message}"); }
                catch { /* the pane itself is gone */ }
            }
        }
    }

    public string GetName() => "Sentinel Event Hub";
}
