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
        var sync = new BcfSyncManager(cfg.ServiceUrl);

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
        window.Closed += (_, __) => sync.Dispose();

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
        };
    }

    private static string Env(string name, string fallback)
    {
        string? v = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(v) ? fallback : v!;
    }
}
