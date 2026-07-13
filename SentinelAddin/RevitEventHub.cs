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

    public RevitEventHub() => _event = ExternalEvent.Create(this);

    public void Enqueue(Action<UIApplication> action)
    {
        lock (_lock) _work.Enqueue(action);
        _event.Raise();
    }

    public void SelectAndShow(long elementId) => Enqueue(uiapp =>
    {
        var uidoc = uiapp.ActiveUIDocument;
        if (uidoc is null) return;
        var id = elementId.ToElementId();
        if (uidoc.Document.GetElement(id) is null) return;
        uidoc.Selection.SetElementIds([id]);
        uidoc.ShowElements(id);
    });

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
            catch { /* never let a UI action crash Revit; Phase 3: log to backend */ }
        }
    }

    public string GetName() => "Sentinel Event Hub";
}
