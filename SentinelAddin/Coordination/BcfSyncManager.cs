using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.Coordination;

/// <summary>
/// Zero-License BCF Sync — the IMPORT half of the loop (export half = <see cref="Engine.BcfExporter"/>).
/// Non-Revit users author BCF topics (full details: type/status/priority/assignee/due/labels/description)
/// on the web; this fetches them (network, background thread) and the operations run on the API thread
/// via <see cref="BcfApplyEvent"/> (ExternalEvent → only when Revit is idle).
/// DTOs follow OpenCDE BCF-API 3.0 so the store is interoperable with BIMcollab/Revizto/Solibri.
/// </summary>
public sealed class BcfSyncManager : IDisposable
{
    private readonly HttpClient _http;
    private readonly HttpClient _sse; // long-lived SSE stream — no per-request timeout
    private readonly string _base;

    public BcfSyncManager(string baseUrl, string? bearerToken = null)
    {
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        _sse = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
        if (!string.IsNullOrWhiteSpace(bearerToken))
        {
            var auth = new AuthenticationHeaderValue("Bearer", bearerToken);
            _http.DefaultRequestHeaders.Authorization = auth;
            _sse.DefaultRequestHeaders.Authorization = auth;
        }
        _base = baseUrl.TrimEnd('/');
    }

    /// <summary>
    /// Live BCF loop (import side): subscribe to the bridge's SSE stream (GET /events?project=…) and
    /// invoke <paramref name="onChange"/> whenever a topic changes on the web (or another Revit). Pure
    /// network — call from a background thread; the callback must marshal any Revit work to the API thread
    /// (e.g. raise <see cref="BcfApplyEvent"/> or re-run FetchActiveAsync). Auto-reconnects on drop until
    /// the token is cancelled. Debouncing is the caller's concern (many pushes can arrive in a burst).
    /// </summary>
    public async Task StartLiveSyncAsync(string projectId, Action onChange, CancellationToken ct = default)
    {
        string url = $"{_base}/events?project={Uri.EscapeDataString(projectId)}";
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using HttpResponseMessage resp = await _sse
                    .GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
                resp.EnsureSuccessStatusCode();
                using var stream = await resp.Content.ReadAsStreamAsync().ConfigureAwait(false);
                using var reader = new System.IO.StreamReader(stream);
                while (!ct.IsCancellationRequested)
                {
                    string? line = await reader.ReadLineAsync().ConfigureAwait(false);
                    if (line is null) break;                              // stream closed → reconnect
                    if (line.StartsWith("data:", StringComparison.Ordinal))
                    {
                        try { onChange(); } catch { /* consumer threw — keep listening */ }
                    }
                    // ": comment"/keepalive lines are ignored.
                }
            }
            catch (OperationCanceledException) { break; }
            catch { /* bridge restart / transient network → back off + reconnect */ }
            try { await Task.Delay(3000, ct).ConfigureAwait(false); } catch { break; }
        }
    }

    /// <summary>Pure network — safe on a background thread. Returns the open (non-closed) topics.</summary>
    public async Task<IReadOnlyList<BcfTopic>> FetchActiveAsync(
        string projectId, string modelId, CancellationToken ct = default)
    {
        // No status filter → the service returns everything except Closed.
        string url = $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics" +
                     $"?model={Uri.EscapeDataString(modelId)}";
        using HttpResponseMessage resp = await _http.GetAsync(url, ct).ConfigureAwait(false);
        resp.EnsureSuccessStatusCode();
        string body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
        return JsonSerializer.Deserialize<List<BcfTopic>>(body) ?? new List<BcfTopic>();
    }

    /// <summary>POST a comment on a topic. Returns the HTTP status (0 = transport failure) — the caller
    /// shows it; nothing here decides what the failure means.</summary>
    public Task<int> AddCommentAsync(string projectId, string topicGuid, string comment, string author, CancellationToken ct = default) =>
        SendJsonAsync(HttpMethod.Post,
            $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics/{Uri.EscapeDataString(topicGuid)}/comments",
            new { comment, author }, ct);

    /// <summary>PUT topic_status (Open / Resolved / Closed …); the bridge logs the change to the topic's
    /// history under <paramref name="author"/>. Returns the HTTP status (0 = transport failure).</summary>
    public Task<int> SetStatusAsync(string projectId, string topicGuid, string status, string author, CancellationToken ct = default) =>
        SendJsonAsync(HttpMethod.Put,
            $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics/{Uri.EscapeDataString(topicGuid)}",
            new { topic_status = status, author }, ct);

    /// <summary>Raise an issue from Revit: POST the topic, then its viewpoint. <paramref name="bearer"/> is read per
    /// call (a signed-in session refreshes; this manager lives as long as the window). Network only — call off the
    /// API thread. Never throws: every answer, including none, is in the result.</summary>
    public async Task<IssueResult> CreateIssueAsync(string projectId, IssueDraft draft, string modelId, Func<string>? bearer = null, CancellationToken ct = default)
    {
        var r = new IssueResult();
        string topics = $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics";
        (r.TopicStatus, var body) = await SendForBodyAsync(HttpMethod.Post, topics, draft.TopicBody(modelId), bearer, ct).ConfigureAwait(false);
        if (r.TopicStatus == 201)
        {
            try { using var doc = JsonDocument.Parse(body); r.TopicGuid = doc.RootElement.TryGetProperty("guid", out var g) ? g.GetString() : null; }
            catch (JsonException) { r.TopicGuid = null; }
            if (string.IsNullOrEmpty(r.TopicGuid)) { r.TopicStatus = 502; r.TopicMessage = "the bridge answered 201 without a topic guid"; return r; }
        }
        else { r.TopicMessage = MessageOf(body); return r; }
        (r.ViewpointStatus, body) = await SendForBodyAsync(HttpMethod.Post, $"{topics}/{Uri.EscapeDataString(r.TopicGuid!)}/viewpoints", draft.ViewpointBody(), bearer, ct).ConfigureAwait(false);
        if (r.ViewpointStatus != 201) r.ViewpointMessage = MessageOf(body);
        return r;
    }

    private static string MessageOf(string body)
    {
        try { using var doc = JsonDocument.Parse(body); return doc.RootElement.TryGetProperty("message", out var m) ? m.GetString() ?? "" : ""; }
        catch (JsonException) { return ""; }
    }

    private async Task<(int Status, string Body)> SendForBodyAsync(HttpMethod method, string url, object body, Func<string>? bearer, CancellationToken ct)
    {
        try
        {
            using var msg = new HttpRequestMessage(method, url)
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            };
            var token = bearer?.Invoke();
            if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using HttpResponseMessage resp = await _http.SendAsync(msg, ct).ConfigureAwait(false);
            return ((int)resp.StatusCode, await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
        }
        catch { return (0, ""); }
    }

    private async Task<int> SendJsonAsync(HttpMethod method, string url, object body, CancellationToken ct)
    {
        try
        {
            using var msg = new HttpRequestMessage(method, url)
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            };
            using HttpResponseMessage resp = await _http.SendAsync(msg, ct).ConfigureAwait(false);
            return (int)resp.StatusCode;
        }
        catch { return 0; }
    }

    public void Dispose() { _http.Dispose(); _sse.Dispose(); }
}
