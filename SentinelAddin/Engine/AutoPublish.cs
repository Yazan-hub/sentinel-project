using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// Auto-publish on save and sync (cohesion phase 5b, spec Decisions 2 and 8): the same governed pipeline as
/// Governed Publish — <see cref="Publisher"/>: the whole model exported in the contract's schema, the delivery gate
/// and its ledger row, one /propose that registers the version with its verdict, the sidecar-first stage — run
/// without a dialog, and ONLY when the project's <c>publish@n</c> says <c>{auto: true}</c>. There is no switch in
/// Revit: none installed, a cached none, <c>auto: false</c> or a body that does not parse all mean off, and the
/// Doctor log says so once per document per policy (a changed policy earns its line), naming it ("Auto-publish: off — publish: none — not
/// installed for &lt;key&gt; or its office"). A rejected run uploads nothing and logs its line; so does a gate FAIL.
///
/// Threading: the save/sync handler reads the key (Extensible Storage: API thread) and returns at once; the policy
/// GET (≤ 4 s) runs on a task; Prepare (export, gate, extraction — Revit API, plus the contract GET and the gate row,
/// ≤ 4 s + ≤ 6 s) runs in a later <see cref="RevitEventHub"/> job — announced first (GP-1: "Auto-publish: exporting …"
/// lands in the pane, and the export is queued only after the pane has painted it); Judge (the 120 s /propose) runs on
/// a task; Stage and the Doctor line land back through the hub. One run per document per 15 s, single-flighted with
/// Governed Publish (<see cref="Publisher.InFlight"/>): a save that lands while a publish is in flight is skipped,
/// silently — a save is not the place for a dialog.
/// </summary>
public static class AutoPublish
{
    private static readonly TimeSpan MinInterval = TimeSpan.FromSeconds(15);
    // API thread only: the handlers, the hub's jobs and the pane's dispatcher are all Revit's main thread. Keyed by the
    // document's path (else its title), never by the Document object: a closed document's wrapper throws
    // InvalidObjectException from Equals/GetHashCode, which once left every later save's handler dead and silent
    // (Session B10). A closed document's key lingers harmlessly; the same path reopened resumes its throttle and its line.
    private static readonly Dictionary<string, DateTime> LastRun = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, string> SaidOff = new(StringComparer.OrdinalIgnoreCase); // the last "off" line said per document

    private static string IdOf(Document doc) => doc.PathName.Length > 0 ? doc.PathName : doc.Title;

    /// <summary>Called from App.OnSaved / App.OnSynchronized (API thread). Never blocks: what can wait on the bridge
    /// runs on a task, what needs Revit runs in a later hub job.</summary>
    public static void Trigger(Document? doc)
    {
        // A throw here is swallowed by Revit (journal only) and would leave auto-publish silently dead: say it instead.
        try { TriggerCore(doc); }
        catch (Exception ex) { App.PanelVm?.LogDoctor("Auto-publish: not triggered — " + ex.GetType().Name + ": " + ex.Message); }
    }

    private static void TriggerCore(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || Publisher.InFlight || App.Events is not { } events || App.PanelVm is not { } vm) return;
        var now = DateTime.UtcNow;
        var id = IdOf(doc);
        if (LastRun.TryGetValue(id, out var last) && now - last < MinInterval) return;
        LastRun[id] = now;
        var key = ProjectContext.For(doc).Key;
        if (key.Length == 0) return; // unbound: nothing to publish into
        // SEC-4 (S28, founder decisions Q-a/Q-b): the key the model names publishes nothing until this PC confirms it for this
        // model (Project Setup ▸ Save) — signed in or out. Said once per document and line, as the "off" line is.
        if (!ModelBindings.ConfirmedFor(doc, key))
        {
            var refused = ModelBindings.NotConfirmed("Auto-publish", key);
            if (!(SaidOff.TryGetValue(id, out var said) && said == refused)) { SaidOff[id] = refused; vm.LogDoctor(refused); }
            return;
        }

        var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        Task.Run(() => ArtefactClient.Resolve(key, "publish")).ContinueWith(t =>
        {
            var policy = t.Status == TaskStatus.RanToCompletion ? t.Result
                : ArtefactClient.None("publish", "the policy read did not finish (" + (t.Exception?.GetBaseException().Message ?? "unknown") + ")");
            if (!Publisher.AutoEnabled(policy))
            {
                // Once per document per policy: saves are frequent, the reason is not — but a changed policy (publish@2, the
                // cached copy while the bridge is down) earns its line. On the pane's thread (BeginInvoke, never Invoke from
                // a worker), which is the API thread that owns SaidOff.
                var line = PublishLines.Policy(policy);
                ui.BeginInvoke(new Action(() =>
                {
                    if (!doc.IsValidObject || (SaidOff.TryGetValue(id, out var said) && said == line)) return;
                    SaidOff[id] = line;
                    vm.LogDoctor(line);
                }));
                return;
            }
            events.Enqueue(_ => Announce(doc, key, events, vm));
        }, TaskScheduler.Default);
    }

    // A hub job (API thread): claim the run, say it in the pane, and queue the export behind the pane's paint — the
    // Background priority runs after the dispatcher has rendered the line, so it shows before Revit pauses.
    private static void Announce(Document doc, string key, RevitEventHub events, UI.SentinelPanelViewModel vm)
    {
        if (Publisher.InFlight || !doc.IsValidObject || ProjectContext.For(doc).Key != key) return; // in flight, closed or rebound meanwhile
        Publisher.InFlight = true;
        vm.LogDoctor("Auto-publish: exporting " + Publisher.ContainerName(doc) + " — Revit pauses until the export ends…");
        System.Windows.Threading.Dispatcher.CurrentDispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Background,
            new Action(() => events.Enqueue(_ => Run(doc, key, events, vm))));
    }

    // A hub job (API thread): Prepare here, Judge on a task, Stage and the line back through the hub.
    private static void Run(Document doc, string key, RevitEventHub events, UI.SentinelPanelViewModel vm)
    {
        if (!doc.IsValidObject) { Publisher.InFlight = false; vm.LogDoctor("Auto-publish: nothing exported — the model was closed"); return; }
        PublishPlan plan;
        try
        {
            plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "auto"),
                                     (kind, timeout) => ArtefactClient.Resolve(key, kind, timeout), "auto-publish");
        }
        catch (Exception ex) // never let a background export crash Revit
        {
            Publisher.InFlight = false;
            vm.LogDoctor("Auto-publish: nothing exported — " + ex.Message);
            return;
        }
        if (!plan.Ready) // refused before the referee (no export, or a gate FAIL): the temp IFC is already discarded
        {
            Publisher.InFlight = false;
            vm.LogDoctor(PublishLines.Doctor(plan));
            return;
        }
        if (plan.OrgWarning is not null) vm.LogDoctor("Auto-publish: " + plan.OrgWarning);
        Task.Run(() => Publisher.Judge(plan, "Auto-Publish")).ContinueWith(t => events.Enqueue(_ =>
        {
            try
            {
                if (t.Status != TaskStatus.RanToCompletion) // Judge never throws; this guards the task itself
                {
                    Publisher.Discard(plan);
                    vm.LogDoctor("Auto-publish: no verdict — nothing uploaded — " + (t.Exception?.GetBaseException().Message ?? "the verdict call did not finish"));
                    return;
                }
                var stage = Publisher.Stage(plan, t.Result, PlatformExporter.OutboxDir());
                vm.LogDoctor(PublishLines.Doctor(plan, t.Result, stage));
            }
            finally { Publisher.InFlight = false; }
        }), TaskScheduler.Default);
    }
}
