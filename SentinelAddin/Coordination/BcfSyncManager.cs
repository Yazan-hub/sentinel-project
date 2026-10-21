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
    private readonly string? _token; // the token at construction: a call given no bearer (the stream reads its own — SEC-6)

    /// <summary>SEC-6 (S20): what the live stream says when the bridge refuses it for a sign-in (HTTP 401).</summary>
    internal const string LiveSignedOut = "Live sync paused — sign-in needed (signed out, or it expired): Sentinel ▸ Sign in; it resumes by itself.";
    /// <summary>SEC-6 (review C13): said once a paused live stream is back.</summary>
    internal const string LiveResumed = "Live sync resumed.";
    /// <summary>Review C17: the sign-in could not be read at all (not a signed-out session — that is <see cref="LiveSignedOut"/>).</summary>
    internal static string LiveSignInUnreadable(Exception ex) => $"Live sync paused — the sign-in could not be read ({ex.GetType().Name}); retrying every 30 s.";
    /// <summary>SEC-6: the wait after a refused connect (30 s; the check shortens it).</summary>
    internal static int RefusedRetryMs = 30000;

    public BcfSyncManager(string baseUrl, string? bearerToken = null)
    {
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        _sse = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
        _token = bearerToken;
        _base = baseUrl.TrimEnd('/');
    }

    /// <summary>
    /// Live BCF loop (import side): subscribe to the bridge's SSE stream (GET /events?project=…) and
    /// invoke <paramref name="onChange"/> whenever a topic changes on the web (or another Revit). Pure
    /// network — call from a background thread; the callback must marshal any Revit work to the API thread
    /// (e.g. raise <see cref="BcfApplyEvent"/> or re-run FetchActiveAsync). Auto-reconnects on drop until
    /// the token is cancelled. Debouncing is the caller's concern (many pushes can arrive in a burst).
    /// SEC-6 (S20): <paramref name="bearer"/> is read at every connect (a signed-in session refreshes; the bridge ends a stream
    /// when its sign-in expires, and the next connect carries the fresh one); an answer that is not a stream is said once
    /// through <paramref name="said"/> — a 401 as <see cref="LiveSignedOut"/>, anything else as the bridge's words — and
    /// retried every 30 s. A dropped connection (a bridge restart) reconnects after 3 s, unsaid, as before.
    /// </summary>
    public async Task StartLiveSyncAsync(string projectId, Action onChange, Func<string?> bearer, Action<string> said, CancellationToken ct = default)
    {
        string url = $"{_base}/events?project={Uri.EscapeDataString(projectId)}";
        string? lastSaid = null;
        while (!ct.IsCancellationRequested)
        {
            var wait = 3000;
            try
            {
                using var msg = new HttpRequestMessage(HttpMethod.Get, url);
                string? token;
                try { token = bearer(); }
                catch (Exception ex)
                {
                    // review C17: a sign-in that cannot be read is said, never a silent 3 s retry.
                    wait = RefusedRetryMs;
                    string w = LiveSignInUnreadable(ex);
                    if (w != lastSaid) { lastSaid = w; try { said(w); } catch { /* the window is gone */ } }
                    await Task.Delay(wait, ct).ConfigureAwait(false);
                    continue;
                }
                if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                using HttpResponseMessage resp = await _sse.SendAsync(msg, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode)
                {
                    wait = RefusedRetryMs;
                    int code = (int)resp.StatusCode;
                    string m = MessageOf(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
                    string words = code == 401 ? LiveSignedOut
                        : $"Live sync paused — the bridge answered HTTP {code}{(m.Length > 0 ? ": " + m : "")}; retrying every 30 s.";
                    if (words != lastSaid) { lastSaid = words; try { said(words); } catch { /* the window is gone */ } }
                    await Task.Delay(wait, ct).ConfigureAwait(false);
                    continue;
                }
                if (lastSaid is not null) { try { said(LiveResumed); } catch { /* the window is gone */ } } // review C13
                lastSaid = null;
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
            try { await Task.Delay(wait, ct).ConfigureAwait(false); } catch { break; }
        }
    }

    /// <summary>Pure network — safe on a background thread. Returns the open (non-closed) topics, or every topic when
    /// <paramref name="status"/> is "all" (the window filters closed ones itself, like BCF Manager's "Closed issues" filter).
    /// <paramref name="bearer"/> is read per call, as for <see cref="CreateIssueAsync"/>.</summary>
    public async Task<IReadOnlyList<BcfTopic>> FetchActiveAsync(
        string projectId, string modelId, Func<string>? bearer = null, CancellationToken ct = default, string? status = null)
    {
        // No status filter → the service returns everything except Closed.
        string url = $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics" +
                     $"?model={Uri.EscapeDataString(modelId)}" + (status is null ? "" : $"&status={Uri.EscapeDataString(status)}");
        using var msg = new HttpRequestMessage(HttpMethod.Get, url);
        Authorize(msg, bearer);
        using HttpResponseMessage resp = await _http.SendAsync(msg, ct).ConfigureAwait(false);
        resp.EnsureSuccessStatusCode();
        string body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
        var list = JsonSerializer.Deserialize<List<BcfTopic>>(body) ?? new List<BcfTopic>();
        for (int i = 0; i < list.Count; i++) list[i].Nr = i + 1; // the bridge lists in creation order
        return list;
    }

    /// <summary>PUT the fields a quick edit changed (topic_status, priority, assigned_to, due_date — the bridge logs each one to
    /// the topic's history under <paramref name="author"/>, and asks a lead for a governed close). Returns the HTTP status (0 = transport failure).</summary>
    public async Task<int> UpdateAsync(string projectId, string topicGuid, IDictionary<string, object?> fields, string author, Func<string>? bearer = null, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?>(fields) { ["author"] = author };
        return (await SendForBodyAsync(HttpMethod.Put,
            $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics/{Uri.EscapeDataString(topicGuid)}",
            body, bearer, ct).ConfigureAwait(false)).Status;
    }

    /// <summary>POST a comment on a topic. Returns the HTTP status (0 = transport failure) — the caller
    /// shows it; nothing here decides what the failure means. <paramref name="bearer"/> is read per call.</summary>
    public async Task<int> AddCommentAsync(string projectId, string topicGuid, string comment, string author, Func<string>? bearer = null, CancellationToken ct = default) =>
        (await SendForBodyAsync(HttpMethod.Post,
            $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics/{Uri.EscapeDataString(topicGuid)}/comments",
            new { comment, author }, bearer, ct).ConfigureAwait(false)).Status;

    /// <summary>PUT topic_status (Open / Resolved / Closed …); the bridge logs the change to the topic's
    /// history under <paramref name="author"/>. Returns the HTTP status (0 = transport failure).</summary>
    public async Task<int> SetStatusAsync(string projectId, string topicGuid, string status, string author, Func<string>? bearer = null, CancellationToken ct = default) =>
        (await SendForBodyAsync(HttpMethod.Put,
            $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics/{Uri.EscapeDataString(topicGuid)}",
            new { topic_status = status, author }, bearer, ct).ConfigureAwait(false)).Status;

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

    /// <summary>Send a .bcf/.bcfzip to the bridge's import (the one BCF reader the web uses too). → the bridge's answer in
    /// words: what was added, updated and skipped, and why. Network only — call off the API thread. Never throws.</summary>
    public async Task<string> ImportBcfAsync(string projectId, byte[] file, string modelId, Func<string>? bearer = null, CancellationToken ct = default)
    {
        try
        {
            // The new topics carry this Revit's model id, so the Issues list (filtered by it) shows what was just imported.
            using var msg = new HttpRequestMessage(HttpMethod.Post, $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/import?model={Uri.EscapeDataString(modelId ?? "")}")
            { Content = new ByteArrayContent(file) };
            msg.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            Authorize(msg, bearer);
            using HttpResponseMessage resp = await _files.SendAsync(msg, ct).ConfigureAwait(false);
            var body = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode) return $"Not imported — {Or(MessageOf(body), $"the bridge answered {(int)resp.StatusCode}")}";
            using var doc = JsonDocument.Parse(body);
            var r = doc.RootElement;
            int N(string k) => r.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 0;
            var said = $"BCF {r.GetProperty("version").GetString()} file: {N("created")} new, {N("updated")} updated" + (N("unchanged") > 0 ? $", {N("unchanged")} already up to date." : ".");
            var skipped = r.TryGetProperty("skipped", out var s) ? s.EnumerateArray().ToList() : new List<JsonElement>();
            if (skipped.Count > 0)
                said += $" {skipped.Count} skipped — " + string.Join("; ", skipped.Take(3).Select(x => $"\u201c{x.GetProperty("title").GetString()}\u201d: {x.GetProperty("why").GetString()}"))
                    + (skipped.Count > 3 ? $" (and {skipped.Count - 3} more)." : ".");
            if (r.TryGetProperty("notes", out var notes) && notes.ValueKind == JsonValueKind.Array && notes.GetArrayLength() > 0)
                said += " Not kept: " + string.Join("; ", notes.EnumerateArray().Select(x => x.GetString())) + ".";
            return said;
        }
        catch (TaskCanceledException) { return "Not imported in 10 minutes — the bridge may still be reading the file; press Refresh in a minute to see what arrived"; }
        catch (Exception e) { return $"Not imported — could not reach the bridge ({e.Message})"; }
    }

    /// <summary>The project's issues as a .bcfzip in <paramref name="version"/> ("acc" = BCF 2.1 for ACC, "2.1" or "3.0"), one
    /// <paramref name="part"/> of <c>Parts</c> (ACC imports at most 100 issues a file). → (bytes or null, words, parts).
    /// Network only — call off the API thread. Never throws.</summary>
    public async Task<(byte[]? File, string Said, int Parts)> ExportBcfAsync(string projectId, string version, int part = 1, Func<string>? bearer = null, CancellationToken ct = default)
    {
        try
        {
            var q = version == "acc" ? "for=acc" : $"version={Uri.EscapeDataString(version)}";
            using var msg = new HttpRequestMessage(HttpMethod.Get, $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/export?{q}&part={part}");
            Authorize(msg, bearer);
            using HttpResponseMessage resp = await _files.SendAsync(msg, ct).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode)
                return (null, $"Not exported — {Or(MessageOf(await resp.Content.ReadAsStringAsync().ConfigureAwait(false)), $"the bridge answered {(int)resp.StatusCode}")}", 0);
            var bytes = await resp.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
            var label = version == "acc" ? "ACC (BCF 2.1)" : $"BCF {version}";
            var said = label;
            var parts = 1;
            if (resp.Headers.TryGetValues("X-Sentinel-Export", out var info))
            {
                using var doc = JsonDocument.Parse(info.First());
                var r = doc.RootElement;
                said = $"{r.GetProperty("topics").GetInt32()} issue(s) for {label}";
                if (r.TryGetProperty("parts", out var p) && p.ValueKind == JsonValueKind.Number) parts = p.GetInt32();
                var lost = r.GetProperty("lost").EnumerateArray().Select(x => x.GetString()).Take(3).ToList();
                if (lost.Count > 0) said += $". Not carried: {string.Join("; ", lost)}";
            }
            return (bytes, said, parts);
        }
        catch (Exception e) { return (null, $"Not exported — could not reach the bridge ({e.Message})", 0); }
    }

    private static string Or(string s, string fallback) => string.IsNullOrWhiteSpace(s) ? fallback : s;
    // A BCF package with snapshots can take longer than the 30 s the other calls get.
    private readonly HttpClient _files = new() { Timeout = TimeSpan.FromMinutes(10) };

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
            Authorize(msg, bearer);
            using HttpResponseMessage resp = await _http.SendAsync(msg, ct).ConfigureAwait(false);
            return ((int)resp.StatusCode, await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
        }
        catch { return (0, ""); }
    }

    /// <summary>The call's own bearer when it has one (empty = no header), else the token at construction.</summary>
    private void Authorize(HttpRequestMessage msg, Func<string>? bearer)
    {
        var token = bearer is null ? _token : bearer();
        if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    public void Dispose() { _http.Dispose(); _sse.Dispose(); _files.Dispose(); }
}
