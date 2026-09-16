using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Windows.Interop;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Zero-License BCF Sync — the Revit-side entry point. Opens a modeless list of the coordination
/// issues non-Revit users raised on the web (via bridge/bcf-service.mjs), and on click navigates the
/// author straight to the element + camera.
///
/// Threading: fetch is async network (no Revit API, safe off the UI thread); applying a viewpoint is
/// funneled through <see cref="BcfApplyEvent"/> (ExternalEvent → runs on the API thread only when
/// Revit is idle, so it can never interrupt a command/transaction/worksharing sync).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class BcfIssuesCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uiapp = c.Application;
        if (uiapp.ActiveUIDocument?.Document is null) return Result.Cancelled;

        BcfConfig cfg = BcfConfig.Load();
        var apply = new BcfApplyEvent();
        var externalEvent = ExternalEvent.Create(apply);
        var sync = new BcfSyncManager(cfg.ServiceUrl, cfg.ServiceToken);

        var window = new BcfIssuesWindow();
        new WindowInteropHelper(window) { Owner = uiapp.MainWindowHandle };

        // Jump to an issue: stage its first viewpoint and raise the ExternalEvent (API-thread apply).
        window.TopicActivated += topic =>
        {
            BcfViewpoint? vp = topic.Viewpoints.FirstOrDefault();
            if (vp is null) { window.SetStatus("This issue has no viewpoint."); return; }
            apply.RequestApply(vp);
            externalEvent.Raise();
        };
        // Isolate every element linked to any open issue.
        window.IsolateAllRequested += () => { apply.RequestIsolateAll(window.Topics); externalEvent.Raise(); };
        // Which issue(s) is the current Revit selection linked to?
        window.IssuesForSelectionRequested += () => { apply.RequestIssuesForSelection(window.Topics); externalEvent.Raise(); };

        apply.Applied += summary => window.SetStatus(summary);
        apply.SelectionMatched += (matched, msg) => { window.HighlightTopics(matched); window.SetStatus(msg); };

        // Fetch on a background continuation; window updates marshal via its dispatcher.
        async void Refresh()
        {
            window.SetStatus("Fetching open issues…");
            try
            {
                var topics = await sync.FetchActiveAsync(cfg.ProjectId, cfg.ModelId).ConfigureAwait(false);
                window.SetTopics(topics);
                window.SetStatus(topics.Count == 0
                    ? "No open issues. (Raise one from the web viewer.)"
                    : $"{topics.Count} open issue(s). Double-click to zoom in Revit.");
            }
            catch (Exception ex)
            {
                window.SetStatus($"Could not reach the BCF service at {cfg.ServiceUrl}\n{ex.Message}");
            }
        }
        window.RefreshRequested += Refresh;

        // Live BCF loop: subscribe to the bridge's SSE stream and refresh (debounced) on every push, so an
        // issue raised on the web appears in this active Revit session within seconds — no manual refresh.
        var liveCts = new System.Threading.CancellationTokenSource();
        var lastLive = DateTime.MinValue;
        _ = sync.StartLiveSyncAsync(cfg.ProjectId, () =>
        {
            var now = DateTime.UtcNow;
            if ((now - lastLive).TotalMilliseconds < 500) return; // debounce bursts
            lastLive = now;
            try { window.Dispatcher.BeginInvoke(new Action(Refresh)); } catch { /* window closed */ }
        }, liveCts.Token);

        window.Closed += (_, __) => { liveCts.Cancel(); sync.Dispose(); };

        // Fix-in-place: plan on the API thread, check/re-check through the referee off it, apply on the
        // API thread, and close the loop on the topic only with evidence (every GUID resolved AND passing).
        var doc = uiapp.ActiveUIDocument.Document;
        var projectKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc);
        var org = App.Engine?.Ruleset.Org;
        var ids = IdsSpecFile.Load();
        var user = doc.Application.Username;
        window.FixRequested += topic =>
        {
            var req = IdsIssueRef.TryParse(topic.Title);
            if (req == null) { window.SetStatus("Only referee-raised IDS issues can be fixed here."); return; }
            var guids = topic.Viewpoints.SelectMany(v => v.Components?.Selection?.Select(s => s.IfcGuid) ?? Enumerable.Empty<string>())
                             .Where(g => !string.IsNullOrWhiteSpace(g)).Distinct().ToList();
            if (App.Events == null) { window.SetStatus("Sentinel's event hub is not running — restart Revit."); return; }
            window.SetStatus("Resolving the issue's elements in this model…");
            App.Events.Enqueue(ua =>
            {
                var d = ua.ActiveUIDocument?.Document;
                if (d == null) return;
                var plan = FixInPlaceService.BuildPlan(d, req, guids, org);
                window.Dispatcher.BeginInvoke(new Action(() => OpenFixWindow(ua, d, topic, req, plan, guids)));
            });
        };

        void OpenFixWindow(UIApplication ua, Document d, BcfTopic topic, IdsIssueRef req, FixInPlaceService.Plan plan, List<string> guids)
        {
            var fix = new FixInPlaceWindow(topic, req, plan);
            DialogOwner.Attach(fix, ua);
            if (ids == null)
                fix.SetBanner("No IDS available to check against (no %AppData%\\Sentinel\\ids.json; the bridge may still hold a server IDS). Apply is allowed; the issue cannot be resolved from here unless the bridge adjudicates.");

            // Check = dry run: patched payload → referee; verdicts painted per row. raise_bcf:false always.
            fix.CheckRequested += ticked =>
            {
                fix.SetBusy(true); fix.SetStatus("Checking proposed values with the referee…");
                App.Events!.Enqueue(ua2 =>
                {
                    var payload = FixInPlaceService.ExtractPatched(d, projectKey, plan, ticked, req, org);
                    var keys = new HashSet<string>(ticked.Select(r => r.Key));
                    Task.Run(() =>
                    {
                        var res = GovernedNotify.Propose(payload, ids, null, user, projectKey: projectKey,
                            source: "revit-fix", note: $"fix-in-place check · BCF {topic.Guid}", raiseBcf: false);
                        if (!res.Reached)
                        {
                            fix.SetStatus($"Could not reach the bridge — nothing was checked ({res.Error}). Applying is unverified.");
                            fix.SetBusy(false); return;
                        }
                        if (res.Verdict == "recorded")
                        {
                            fix.SetBanner("The bridge has no IDS to judge against — verdict “recorded”. Apply is allowed; nothing can be certified or resolved.");
                            fix.SetStatus("Not checkable: no IDS on the bridge or locally."); fix.SetBusy(false); return;
                        }
                        var fold = FixPlan.Fold(res.ElementFailures, plan.Rows, keys, guids, req.Requirement);
                        fix.RefreshRows();
                        fix.SetStatus($"Check: {fold.Pass} would pass, {fold.Fail} would fail{(fold.OtherOpen > 0 ? $" · {fold.OtherOpen} failure(s) on other requirements not part of this issue" : "")} · audit {res.AuditId}");
                        fix.SetBusy(false);
                    });
                });
            };

            // Apply = one transaction on the API thread, then an automatic re-check of the REAL model state.
            fix.ApplyRequested += ticked =>
            {
                fix.SetBusy(true); fix.SetStatus("Applying ticked values…");
                App.Events!.Enqueue(ua2 =>
                {
                    var outcomes = FixInPlaceService.Apply(d, ticked, req, topic.Guid);
                    var done = outcomes.Count(o => o.Ok);
                    foreach (var o in outcomes.Where(o => !o.Ok)) { o.Row.Verdict = FixVerdict.Fail; o.Row.Reason = "not written: " + o.Message; }
                    fix.RefreshRows();
                    fix.SetStatus($"Applied {done}/{outcomes.Count} row(s). Re-checking the model with the referee…");
                    Recheck(ua2);
                });
            };
            fix.RecheckRequested += () => { fix.SetBusy(true); fix.SetStatus("Re-checking…"); App.Events!.Enqueue(Recheck); };
            fix.ZoomRequested += row => App.Events?.SelectAndShow(row.IsType ? row.InstanceIds[0] : row.TargetId);

            // Re-check: extract what the model holds NOW, judge it, and close the loop only on full evidence.
            void Recheck(UIApplication ua2)
            {
                var payload = FixInPlaceService.Extract(d, projectKey, plan, plan.Rows, org);
                var keys = new HashSet<string>(plan.Rows.Select(r => r.Key));
                Task.Run(async () =>
                {
                    var res = GovernedNotify.Propose(payload, ids, null, user, projectKey: projectKey,
                        source: "revit-fix", note: $"fix-in-place re-check · BCF {topic.Guid}", raiseBcf: false);
                    if (!res.Reached)
                    {
                        fix.SetStatus($"Applied. NOT verified — the bridge could not be reached ({res.Error}); the issue was not touched. Use Re-check when it is back.");
                        fix.SetBusy(false); return;
                    }
                    if (res.Verdict == "recorded")
                    {
                        fix.SetStatus("Applied. NOT verified — the bridge has no IDS to judge against; the issue was not touched.");
                        fix.SetBusy(false); return;
                    }
                    var fold = FixPlan.Fold(res.ElementFailures, plan.Rows, keys, guids, req.Requirement);
                    fix.RefreshRows();
                    var total = guids.Count;
                    var passed = total - fold.Unresolved.Count - plan.Rows.Where(r => r.Verdict == FixVerdict.Fail).Sum(r => r.IssueGuids.Count);
                    var receipt = string.IsNullOrEmpty(res.ReceiptHash) ? "" : $" · receipt {res.ReceiptHash!.Substring(0, Math.Min(16, res.ReceiptHash.Length))}";
                    var evidence = $"Fixed in Revit by {user}: {passed}/{total} element(s) now pass {req.Requirement}. Referee re-check audit {res.AuditId}{receipt}.";
                    var still = plan.Rows.Where(r => r.Verdict == FixVerdict.Fail).SelectMany(r => r.InstanceIds).ToList();
                    if (still.Count > 0) evidence += $" Still failing: {string.Join(", ", still.Take(20))}{(still.Count > 20 ? ", …" : "")}.";
                    if (fold.Unresolved.Count > 0) evidence += $" Not in this model: {string.Join(", ", fold.Unresolved.Take(10))}{(fold.Unresolved.Count > 10 ? ", …" : "")}.";

                    var c = await sync.AddCommentAsync(cfg.ProjectId, topic.Guid, evidence, user).ConfigureAwait(false);
                    if (c < 200 || c >= 300) { fix.SetStatus($"Re-check done ({passed}/{total} pass) but the evidence comment was not posted (HTTP {c}); the issue is unchanged."); fix.SetBusy(false); return; }
                    if (!fold.AllPass)
                    {
                        fix.SetStatus($"Re-check: {passed}/{total} pass. Evidence posted; the issue stays {topic.Status} until every element passes.");
                        fix.SetBusy(false); return;
                    }
                    var s = await sync.SetStatusAsync(cfg.ProjectId, topic.Guid, "Resolved", user).ConfigureAwait(false);
                    fix.SetStatus(s >= 200 && s < 300
                        ? $"✓ {passed}/{total} pass — evidence posted and the issue is now Resolved (audit {res.AuditId}). Closing it stays a human decision on the web."
                        : $"Evidence posted; status unchanged (HTTP {s}).");
                    fix.SetBusy(false);
                    try { window.Dispatcher.BeginInvoke(new Action(Refresh)); } catch { /* window closed */ }
                });
            }

            fix.Show();
        }

        window.Show();
        Refresh(); // initial load
        return Result.Succeeded;
    }
}

/// <summary>
/// BCF sync configuration, read from %AppData%\Sentinel\bcf-config.json (env vars as fallback).
/// projectId must match what the web viewer POSTs (its platform project id); modelId empty = all models.
/// </summary>
internal sealed class BcfConfig
{
    [JsonPropertyName("serviceUrl")] public string ServiceUrl { get; set; } = "http://localhost:4100";
    [JsonPropertyName("projectId")] public string ProjectId { get; set; } = "default";
    [JsonPropertyName("modelId")] public string ModelId { get; set; } = ""; // empty → service returns all models
    // Shared secret for the bridge's auth gate (F2). When the bridge runs with BCF_TOKEN set, Revit must present
    // it or the governed calls are rejected as anonymous. Empty = legacy bridge (no gate) → no header is sent.
    [JsonPropertyName("serviceToken")] public string ServiceToken { get; set; } = "";

    public static BcfConfig Load()
    {
        string path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "bcf-config.json");
        try
        {
            if (File.Exists(path))
                return JsonSerializer.Deserialize<BcfConfig>(File.ReadAllText(path),
                           new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new BcfConfig();
        }
        catch { /* fall through to env/defaults */ }

        return new BcfConfig
        {
            ServiceUrl = Env("BCF_SERVICE_URL", "http://localhost:4100"),
            ProjectId = Env("THATOPEN_PROJECT_ID", "default"),
            ServiceToken = Env("BCF_TOKEN", ""),
        };
    }

    private static string Env(string name, string fallback)
    {
        string? v = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(v) ? fallback : v!;
    }
}
