using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Interop;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
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
