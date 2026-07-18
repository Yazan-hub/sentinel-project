using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
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

    public void Dispose() { _http.Dispose(); _sse.Dispose(); }
}
