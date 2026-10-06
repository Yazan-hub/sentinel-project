using System.Runtime.CompilerServices;
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
    private ExternalEvent _event; // F-SEC5-1 (review C3): made again from Idling when Revit keeps it Pending
    // F-SEC5-1: each queued action carries a label and the moment it was queued (UTC): a wait is said with both.
    private readonly Queue<(string What, DateTime At, Action<UIApplication> Job)> _work = new();
    private readonly object _lock = new();

    // MA-3b2b (F-MA3b2-1): Revit's own thread — the hub is made in App.OnStartup, on it.
    private readonly Dispatcher _ui = Dispatcher.CurrentDispatcher;

    // F-SEC5-1: what runs now and since when, when Revit was last idle, Revit's last answer to a raise, and the watchdog.
    private (string What, DateTime At)? _running;
    private DateTime? _lastIdling;
    private ExternalEventRequest _lastRaise;
    private readonly HubWatch _watch = new();
    private readonly DispatcherTimer _timer;
    private bool _quiet, _saidSender; // the watchdog's own raise (review C2); Idling without the application said (review C8)

    public RevitEventHub()
    {
        _event = ExternalEvent.Create(this);
        // F-SEC5-1: a queued action that waits, or a running one that takes long, is said in the Doctor log and raised again —
        // never a silent stall. A timer on Revit's thread is not an API context: it only raises and says.
        _timer = new DispatcherTimer(TimeSpan.FromSeconds(5), DispatcherPriority.Background, (_, _) => Watch(), _ui);
    }

    public void Enqueue(Action<UIApplication> action, [CallerMemberName] string what = "")
    {
        // F-SEC5-1 (review C7): the label names the caller's class too — most callers enqueue from a method named Execute.
        var owner = (action.Method.DeclaringType?.FullName ?? "").Split('+')[0].Split('.').Last();
        if (owner != nameof(RevitEventHub)) what = $"{owner}.{what}";
        lock (_lock) _work.Enqueue((what, DateTime.UtcNow, action));
        // MA-3b2b (F-MA3b2-1): a report's continuation enqueues from a pool thread — the only callers that did, and the one job that
        // did not show (drill MA3b2, Z-4). Every raise now happens on Revit's thread, as every modeless window here raises.
        if (_ui.CheckAccess()) Raise();
        else _ui.BeginInvoke(new Action(Raise));
    }

    private void Raise()
    {
        var raised = _event.Raise();
        _lastRaise = raised;
        if (_quiet) return; // F-SEC5-1 (review C2): the watchdog says its own line, once per episode
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
        }, what);

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
        if (_running is not null) return; // F-SEC5-1: a re-entrant call (Idling during a job's dialog) leaves the queue to the outer run
        try
        {
            while (true)
            {
                (string What, DateTime At, Action<UIApplication> Job) next;
                lock (_lock)
                {
                    if (_work.Count == 0) return;
                    next = _work.Dequeue();
                    _running = (next.What, DateTime.UtcNow);
                }
                try { next.Job(app); }
                catch (Exception ex)
                {
                    // Never let a UI action crash Revit — but never lose it silently either (the ↻ on the strip, Select).
                    Say($"A Sentinel action failed and was skipped: {ex.GetType().Name}: {ex.Message}");
                }
            }
        }
        finally { lock (_lock) _running = null; }
    }

    /// <summary>F-SEC5-1: the watchdog's tick (every 5 s, on Revit's thread): a queued action that has waited past
    /// HubWatch.ReRaiseAfter with nothing running is raised again and said once, with Revit's answer; an action running past
    /// HubWatch.LongRun is named once.</summary>
    private void Watch()
    {
        (string What, DateTime At)? oldest, running;
        int queued;
        lock (_lock)
        {
            oldest = _work.Count > 0 ? (_work.Peek().What, _work.Peek().At) : null;
            queued = _work.Count;
            running = _running;
        }
        var words = _watch.Tick(DateTime.UtcNow, oldest, queued, running, _lastIdling, out var again);
        if (again) { _quiet = true; try { Raise(); } finally { _quiet = false; } }
        if (words is null) return;
        Say(again ? $"{words}; Revit answered {_lastRaise}." : words);
    }

    /// <summary>F-SEC5-1 (founder decision F-a): Revit's Idling event, a second way onto the API thread. It notes that Revit is
    /// idle; when the queue's oldest action has waited past HubWatch.DrainAfter with nothing running, it runs the queue here and
    /// says so. Idling is asked to come again at once only while an action has waited past HubWatch.ReRaiseAfter.</summary>
    public void OnIdling(object? sender, Autodesk.Revit.UI.Events.IdlingEventArgs e)
    {
        var now = DateTime.UtcNow;
        _lastIdling = now;
        DateTime? oldestAt;
        string what;
        int n;
        lock (_lock)
        {
            n = _work.Count;
            oldestAt = n > 0 ? _work.Peek().At : null;
            what = n > 0 ? _work.Peek().What : "";
        }
        if (oldestAt is null) return;
        if (sender is not UIApplication app)
        {
            // review C8: never a silent spin — said once, and Idling is not asked to come again at once.
            if (!_saidSender) { _saidSender = true; Say("Revit's Idling event did not name the application — a waiting Sentinel action cannot be run from it."); }
            return;
        }
        if (now - oldestAt.Value > HubWatch.ReRaiseAfter) e.SetRaiseWithoutDelay();
        if (!HubWatch.ShouldDrain(now, oldestAt, _running is not null)) return;
        Say(HubWatch.Drained(now - oldestAt.Value, what, n));
        Execute(app);
        if (_lastRaise == ExternalEventRequest.Pending)
        {
            // review C3: Revit kept the event Pending while idle — it is made again here (Idling is an API context). The new one is
            // made first: if Revit refuses, the old one stays and the refusal is said.
            try
            {
                var fresh = ExternalEvent.Create(this);
                _event.Dispose();
                _event = fresh;
                _lastRaise = ExternalEventRequest.Accepted;
                Say("Sentinel's link to Revit was stuck (Revit kept answering Pending while idle) — it was made again.");
            }
            catch (Exception ex)
            {
                Say($"Sentinel's link to Revit is stuck (Revit kept answering Pending while idle) and could not be made again ({ex.GetType().Name}: {ex.Message}) — a waiting action still runs from Idling; restart Revit when convenient.");
            }
        }
    }

    /// <summary>Stops the watchdog (Revit is shutting down).</summary>
    public void Stop() => _timer.Stop();

    private static void Say(string line)
    {
        try { App.PanelVm?.LogDoctor(line); }
        catch { /* the pane itself is gone */ }
    }

    public string GetName() => "Sentinel Event Hub";
}
