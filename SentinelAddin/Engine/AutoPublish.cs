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
/// Doctor log says so once per document per session, naming the policy ("Auto-publish: off — publish: none — not
/// installed for &lt;key&gt; or its office"). A rejected run uploads nothing and logs its line; so does a gate FAIL.
///
/// Threading: the save/sync handler reads the key (Extensible Storage: API thread) and returns at once; the policy
/// GET (≤ 4 s) runs on a task; Prepare (export, gate, extraction — Revit API, plus the contract GET and the gate row,
/// ≤ 4 s + ≤ 6 s) runs in a later <see cref="RevitEventHub"/> job; Judge (the 120 s /propose) runs on a task; Stage
/// and the Doctor line land back through the hub. One run per document per 15 s, single-flighted: a save that
/// lands while a run is in flight is skipped, silently — a save is not the place for a dialog.
/// </summary>
public static class AutoPublish
{
    private static readonly TimeSpan MinInterval = TimeSpan.FromSeconds(15);
    // API thread only: the handlers, the hub's jobs and the pane's dispatcher are all Revit's main thread.
    private static readonly Dictionary<Document, DateTime> LastRun = new();
    private static readonly HashSet<Document> SaidOff = new();
    private static bool _busy;

    /// <summary>True from Prepare to Stage of one run. Governed Publish refuses to start meanwhile: both would write
    /// the same outbox name.</summary>
    internal static bool InFlight => _busy;

    /// <summary>Called from App.OnSaved / App.OnSynchronized (API thread). Never blocks: what can wait on the bridge
    /// runs on a task, what needs Revit runs in a later hub job.</summary>
    public static void Trigger(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || _busy || App.Events is not { } events || App.PanelVm is not { } vm) return;
        var now = DateTime.UtcNow;
        if (LastRun.TryGetValue(doc, out var last) && now - last < MinInterval) return;
        LastRun[doc] = now;
        Prune();
        var key = ProjectContext.For(doc).Key;
        if (key.Length == 0) return; // unbound: nothing to publish into

        var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        Task.Run(() => ArtefactClient.Resolve(key, "publish")).ContinueWith(t =>
        {
            var policy = t.Status == TaskStatus.RanToCompletion ? t.Result
                : ArtefactClient.None("publish", "the policy read did not finish (" + (t.Exception?.GetBaseException().Message ?? "unknown") + ")");
            if (!Publisher.AutoEnabled(policy))
            {
                // Once per document per session: saves are frequent, the reason is not. On the pane's thread (BeginInvoke,
                // never Invoke from a worker), which is the API thread that owns SaidOff.
                ui.BeginInvoke(new Action(() =>
                {
                    if (doc.IsValidObject && SaidOff.Add(doc)) vm.LogDoctor(PublishLines.Policy(policy));
                }));
                return;
            }
            events.Enqueue(_ => Run(doc, key, events, vm));
        }, TaskScheduler.Default);
    }

    // A hub job (API thread): Prepare here, Judge on a task, Stage and the line back through the hub.
    private static void Run(Document doc, string key, RevitEventHub events, UI.SentinelPanelViewModel vm)
    {
        if (_busy || !doc.IsValidObject || ProjectContext.For(doc).Key != key) return; // in flight, closed or rebound meanwhile
        _busy = true;
        PublishPlan plan;
        try
        {
            plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "auto"),
                                     (kind, timeout) => ArtefactClient.Resolve(key, kind, timeout));
        }
        catch (Exception ex) // never let a background export crash Revit
        {
            _busy = false;
            vm.LogDoctor("Auto-publish: nothing exported — " + ex.Message);
            return;
        }
        if (!plan.Ready) // refused before the referee (no export, or a gate FAIL): the temp IFC is already discarded
        {
            _busy = false;
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
            finally { _busy = false; }
        }), TaskScheduler.Default);
    }

    // Closed documents leave the maps (API thread).
    private static void Prune()
    {
        foreach (var d in LastRun.Keys.Where(d => !d.IsValidObject).ToList()) { LastRun.Remove(d); SaidOff.Remove(d); }
    }
}
