using System;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using Sentinel.Engine; // ProjectContext.NotBound

namespace Sentinel.Coordination;

/// <summary>What one ledger write came to, as far as it was measured (cohesion phase 4c, decision 1).</summary>
public enum LedgerState { Recorded, NotConfirmed, NotRecorded, NotBound }

/// <summary>
/// The outcome of one governed event. <see cref="LedgerState.Recorded"/> only when the bridge handed back the row's id
/// and its 64-hex chain hash; <see cref="LedgerState.NotConfirmed"/> when the entry may have landed but nothing proves
/// it (a timeout, a 5xx — a 500 can follow the insert and the bridge masks its text —, a 2xx with no hash);
/// <see cref="LedgerState.NotRecorded"/> when the bridge refused before writing (400/401/403/404/503) or was never
/// reached; <see cref="LedgerState.NotBound"/> when the document has no web project and nothing was sent. Revit-free
/// and UI-free: tools/event-check compiles this file.
/// </summary>
public sealed class LedgerResult
{
    /// <summary>The cap on one event POST, body included, when the caller passes none.</summary>
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(6);

    private const string NoHash = "the bridge returned no chain hash";
    private const string MayHaveLanded = " (the entry may have landed)";

    public readonly LedgerState State;
    public readonly long? Id;
    public readonly string? Hash;
    public readonly string Reason;
    /// <summary>The hold row the same write produced — the delivery-gate route's reply <c>hold {id, hash}</c> for a FAIL
    /// judged in a publish (spec 2026-09-27 Decision 5), through <see cref="FromReceipt"/>; null when the bridge returned
    /// none (a pass, a check, a refused or unreached write, a bridge before 6a).</summary>
    public readonly LedgerResult? Hold;

    private LedgerResult(LedgerState state, string reason, long? id = null, string? hash = null, LedgerResult? hold = null)
    {
        State = state;
        Reason = reason;
        Id = id;
        Hash = hash;
        Hold = hold;
    }

    public static LedgerResult NotConfirmed(string reason) => new(LedgerState.NotConfirmed, reason);
    public static LedgerResult NotRecorded(string reason) => new(LedgerState.NotRecorded, reason);
    public static LedgerResult NotBound() => new(LedgerState.NotBound, ProjectContext.NotBound);

    /// <summary>An audit id and a chain hash as the bridge handed them back (a /propose body's audit_id and
    /// receipt.ledger_hash, which ProposalResult carries) → Recorded, else not confirmed "no chain hash".</summary>
    public static LedgerResult FromReceipt(string? auditId, string? ledgerHash) =>
        long.TryParse(auditId, NumberStyles.None, CultureInfo.InvariantCulture, out var id) && id > 0 && IsHash(ledgerHash)
            ? new LedgerResult(LedgerState.Recorded, "", id, ledgerHash)
            : NotConfirmed(NoHash);

    /// <summary>An HTTP answer → what it proves. 2xx: the POST /cde/:key/audit row's id + hash, or a /propose body's
    /// audit_id + receipt.ledger_hash → Recorded, anything less → not confirmed. 400/401/403/404/503 are answered
    /// before any write → not recorded "HTTP n: message". Any other status → not confirmed. A 2xx body's
    /// <c>hold {id, hash}</c> (the delivery-gate route's, phase 6a) is carried as <see cref="Hold"/>.</summary>
    public static LedgerResult FromResponse(int status, string? body)
    {
        string? message = null, id = null, hash = null;
        LedgerResult? hold = null;
        try
        {
            using var d = JsonDocument.Parse(body ?? "");
            var root = d.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                message = Str(root, "message");
                if (root.TryGetProperty("receipt", out var receipt)) { id = Scalar(root, "audit_id"); hash = Str(receipt, "ledger_hash"); }
                else { id = Scalar(root, "id"); hash = Str(root, "hash"); }
                if (root.TryGetProperty("hold", out var h) && h.ValueKind == JsonValueKind.Object) hold = FromReceipt(Scalar(h, "id"), Str(h, "hash"));
            }
        }
        catch (JsonException) { /* not JSON (a proxy's page, an empty body): the status alone speaks */ }
        if (status >= 200 && status < 300)
        {
            var row = FromReceipt(id, hash);
            return hold is null ? row : new LedgerResult(row.State, row.Reason, row.Id, row.Hash, hold);
        }
        var what = "HTTP " + status + (string.IsNullOrWhiteSpace(message) ? "" : ": " + Clip(message!));
        return status is 400 or 401 or 403 or 404 or 503 ? NotRecorded(what) : NotConfirmed(what + MayHaveLanded);
    }

    /// <summary>A transport failure → what it proves. The call's own cap running out may follow the insert → not
    /// confirmed "timed out after N s"; a refused, unreachable or unresolvable bridge never saw the request → not
    /// recorded "the bridge did not answer"; anything else (a reset after sending) → not confirmed.</summary>
    public static LedgerResult FromException(Exception e, TimeSpan? timeout = null)
    {
        if (e is OperationCanceledException) // TaskCanceledException included
            return NotConfirmed("timed out after " + (timeout ?? DefaultTimeout).TotalSeconds.ToString("0.#", CultureInfo.InvariantCulture) + " s" + MayHaveLanded);
        if (NeverConnected(e)) return NotRecorded("the bridge did not answer");
        return NotConfirmed(Clip(e.InnerException?.Message ?? e.Message) + MayHaveLanded);
    }

    // Every call carries its own cap (a token per call), so a label names the cap that actually ran out.
    private static readonly HttpClient Http = new HttpClient { Timeout = System.Threading.Timeout.InfiniteTimeSpan };

    /// <summary>POST <paramref name="payload"/> as JSON to {serviceUrl}/cde/{key}{path} and read what the ledger
    /// answered. BLOCKING (≤ <paramref name="timeout"/>, body included); never throws; no Revit, no UI. An empty key
    /// sends nothing. <c>GovernedNotify.Event</c> is this with the bridge from BcfConfig; the harness drives it
    /// against its own loopback bridges.</summary>
    internal static LedgerResult Post(string serviceUrl, string? token, string projectKey, string path, object payload, TimeSpan timeout)
    {
        var key = (projectKey ?? "").Trim();
        if (key.Length == 0) return NotBound();
        var url = (serviceUrl ?? "").TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + path;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            return NotRecorded("the bridge address is not an http(s) URL (" + serviceUrl + ")");
        string json;
        try { json = JsonSerializer.Serialize(payload); }
        catch (Exception e) { return NotRecorded("the event could not be written as JSON (" + e.Message + ")"); }
        try
        {
            using var cts = new CancellationTokenSource(timeout);
            using var msg = new HttpRequestMessage(HttpMethod.Post, uri) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
            if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            // SendAsync buffers the body before it returns, under this token: the cap covers the whole read.
            using var resp = Http.SendAsync(msg, cts.Token).GetAwaiter().GetResult();
            return FromResponse((int)resp.StatusCode, resp.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        }
        catch (Exception e) { return FromException(e, timeout); }
    }

    // The request never reached the bridge: refused, unreachable or unresolvable. net8 raises HttpRequestException →
    // SocketException; net48 (Revit 2024) HttpRequestException → WebException (ConnectFailure, NameResolutionFailure).
    private static bool NeverConnected(Exception e)
    {
        for (var x = e; x != null; x = x.InnerException)
        {
            if (x is SocketException s && s.SocketErrorCode is SocketError.ConnectionRefused or SocketError.HostNotFound
                    or SocketError.NoData or SocketError.TryAgain or SocketError.HostUnreachable or SocketError.NetworkUnreachable
                    or SocketError.AddressNotAvailable) return true;
            if (x is WebException w && w.Status is WebExceptionStatus.ConnectFailure or WebExceptionStatus.NameResolutionFailure) return true;
        }
        return false;
    }

    private static bool IsHash(string? h)
    {
        if (h is null || h.Length != 64) return false;
        foreach (var c in h) if (!Uri.IsHexDigit(c)) return false;
        return true;
    }

    private static string Clip(string s) => s.Length <= 200 ? s : s.Substring(0, 200) + "…";

    private static string? Str(JsonElement o, string name) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    // An id arrives as a JSON number (bigint) or a string.
    private static string? Scalar(JsonElement o, string name)
    {
        if (o.ValueKind != JsonValueKind.Object || !o.TryGetProperty(name, out var p)) return null;
        return p.ValueKind switch { JsonValueKind.String => p.GetString(), JsonValueKind.Number => p.GetRawText(), _ => null };
    }
}

/// <summary>The only words for a ledger outcome (decision 1). Every Revit surface that writes to the ledger prints
/// one of these; none says "recorded" without the row's id and hash.</summary>
public static class LedgerLine
{
    /// <summary>"ledger #812 · receipt 3f9a0c1d2e4b5f60…", "not confirmed — …", "not recorded — …", or
    /// <see cref="ProjectContext.NotBound"/>.</summary>
    public static string For(LedgerResult r) => r.State switch
    {
        LedgerState.Recorded => "ledger #" + r.Id + " · receipt " + r.Hash!.Substring(0, 16) + "…",
        LedgerState.NotConfirmed => "not confirmed — " + r.Reason,
        LedgerState.NotRecorded => "not recorded — " + r.Reason,
        _ => ProjectContext.NotBound,
    };

    /// <summary>The same as a sentence, for a dialog or a status line: "Recorded: ledger #812 · receipt …",
    /// "Not confirmed — …", "Not recorded — …", or "Not recorded on the web: This model is not bound …" (the IFC
    /// gate's words since phase 4a).</summary>
    public static string Sentence(LedgerResult r)
    {
        if (r.State == LedgerState.Recorded) return "Recorded: " + For(r);
        if (r.State == LedgerState.NotBound) return "Not recorded on the web: " + ProjectContext.NotBound;
        var line = For(r);
        return char.ToUpperInvariant(line[0]) + line.Substring(1);
    }
}
