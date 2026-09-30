#nullable disable
// Governed AI modeling (A2): HTTP client for staged changesets. Blocking calls in the add-in's
// established idioms — the short-timeout read (GovernedQuery) and the long-timeout confirmed
// write (GovernedNotify's GovHttp). The bridge's status is the truth; this client never caches.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Commands; // BcfConfig (bridge URL + platform project id)

namespace Sentinel.Coordination;

public sealed class CurveDto
{
    [JsonPropertyName("start")] public double[] Start { get; set; }
    [JsonPropertyName("end")] public double[] End { get; set; }
}

public sealed class PlaceDto
{
    [JsonPropertyName("TypeName")] public string TypeName { get; set; }
    [JsonPropertyName("LevelName")] public string LevelName { get; set; }
    [JsonPropertyName("LocationCurve")] public CurveDto LocationCurve { get; set; }
    [JsonPropertyName("LocationLoop")] public double[][] LocationLoop { get; set; }
    [JsonPropertyName("BaseElevation")] public double? BaseElevation { get; set; }
    [JsonPropertyName("TopElevation")] public double? TopElevation { get; set; }
    [JsonPropertyName("Name")] public string Name { get; set; }
    // attach (MA-0): the story levels a wall's base and top are constrained to.
    [JsonPropertyName("BaseLevel")] public string BaseLevel { get; set; }
    [JsonPropertyName("TopLevel")] public string TopLevel { get; set; }
}

/// <summary>The existing wall a retype/attach ghost changes (MA-0): its Revit UniqueId, and for a retype the type the
/// plan saw — the executor refuses when the model has changed since.</summary>
public sealed class TargetDto
{
    [JsonPropertyName("unique_id")] public string UniqueId { get; set; }
    [JsonPropertyName("type_before")] public string TypeBefore { get; set; }
}

/// <summary>A wall a planner sent to a person instead of proposing a change (the changeset's exceptions).</summary>
public sealed class ExceptionRowDto
{
    [JsonPropertyName("unique_id")] public string UniqueId { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("reason")] public string Reason { get; set; }
}

public sealed class ElementVerdictDto
{
    [JsonPropertyName("status")] public string Status { get; set; } = "recorded";
    [JsonPropertyName("failures")] public List<JsonElement> Failures { get; set; } = new();
}

public sealed class IdentityDto
{
    [JsonPropertyName("Class")] public string Class { get; set; }
    [JsonPropertyName("Name")] public string Name { get; set; }
    [JsonPropertyName("GlobalId")] public string GlobalId { get; set; }
}

public sealed class ValidateDto
{
    [JsonPropertyName("identity")] public IdentityDto Identity { get; set; }
}

public sealed class ChangesetElementDto
{
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("kind")] public string Kind { get; set; }
    /// <summary>"create" (null on an older bridge), "retype" or "attach".</summary>
    [JsonPropertyName("op")] public string Op { get; set; }
    [JsonPropertyName("target")] public TargetDto Target { get; set; }
    [JsonPropertyName("reason")] public string Reason { get; set; }
    [JsonPropertyName("validate")] public ValidateDto Validate { get; set; }
    [JsonPropertyName("place")] public PlaceDto Place { get; set; }
    [JsonPropertyName("verdict")] public ElementVerdictDto Verdict { get; set; }
}

public sealed class AdjudicationDto
{
    [JsonPropertyName("verdict")] public string Verdict { get; set; }
    [JsonPropertyName("ids_source")] public string IdsSource { get; set; }
    [JsonPropertyName("unattributed")] public List<JsonElement> Unattributed { get; set; } = new();
}

public sealed class ChangesetDto
{
    [JsonPropertyName("id")] public string Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("source")] public string Source { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; }
    [JsonPropertyName("created_at")] public string CreatedAt { get; set; }
    [JsonPropertyName("adjudication")] public AdjudicationDto Adjudication { get; set; }
    [JsonPropertyName("elements")] public List<ChangesetElementDto> Elements { get; set; } = new();
    [JsonPropertyName("exceptions")] public List<ExceptionRowDto> Exceptions { get; set; } = new();
}

public sealed class AppliedEntry
{
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("revit_element_id")] public long RevitElementId { get; set; }
    [JsonPropertyName("revit_unique_id")] public string RevitUniqueId { get; set; }
}

internal static class ChangesetClient
{
    // Reads: short timeout, errors surfaced (the review flow must tell the human, unlike the
    // fire-and-forget notify paths). Writes: 120s — result reporting must confirm.
    private static readonly HttpClient ReadHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
    private static readonly HttpClient WriteHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };
    /// <summary>How a request body is written: nulls left out (a retype's target has no type_before on an attach).</summary>
    internal static readonly JsonSerializerOptions WriteJson = new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private static HttpRequestMessage Req(HttpMethod m, string url, string token)
    {
        var msg = new HttpRequestMessage(m, url);
        if (!string.IsNullOrWhiteSpace(token))
            msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return msg;
    }

    public static List<ChangesetDto> FetchProposed(BcfConfig cfg, string projectKey, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}?status=proposed";
            var resp = ReadHttp.SendAsync(Req(HttpMethod.Get, url, cfg.ServiceToken)).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            var list = JsonSerializer.Deserialize<List<ChangesetDto>>(body) ?? new List<ChangesetDto>();
            return list.OrderBy(c => c.CreatedAt, StringComparer.Ordinal).ToList(); // FIFO — oldest first
        }
        catch (Exception ex) { error = ex.Message; return null; }
    }

    public static ChangesetDto FetchOne(BcfConfig cfg, string projectKey, string id, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}";
            var resp = ReadHttp.SendAsync(Req(HttpMethod.Get, url, cfg.ServiceToken)).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            return JsonSerializer.Deserialize<ChangesetDto>(body);
        }
        catch (Exception ex) { error = ex.Message; return null; }
    }

    public static bool ReportResult(BcfConfig cfg, string projectKey, string id,
        List<AppliedEntry> applied, List<string> rejected, string note, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/result",
             JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor }), 200, out _, out error);

    private static bool Post(BcfConfig cfg, string path, string payload, int expect, out string body, out string error)
    {
        body = null; error = null;
        try
        {
            var msg = Req(HttpMethod.Post, $"{cfg.ServiceUrl.TrimEnd('/')}{path}", cfg.ServiceToken);
            msg.Content = new StringContent(payload, Encoding.UTF8, "application/json");
            var resp = WriteHttp.SendAsync(msg).GetAwaiter().GetResult();
            body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if ((int)resp.StatusCode != expect) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return false; }
            return true;
        }
        catch (Exception ex) { error = ex.Message; return false; }
    }

    /// <summary>The caller's role on the project (GET /cde/:key/members/me): "service" for the machine credential, a
    /// member's role, "" for a signed-in non-member; null with the error when it could not be read.</summary>
    public static string MyRole(BcfConfig cfg, string projectKey, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/cde/{Uri.EscapeDataString(projectKey)}/members/me";
            var resp = ReadHttp.SendAsync(Req(HttpMethod.Get, url, cfg.ServiceToken)).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("role", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : "";
        }
        catch (Exception ex) { error = ex.Message; return null; }
    }

    /// <summary>XC-4: whether this person may approve or reject change requests on <paramref name="key"/> — a signed-in
    /// lead or owner of the web project (<paramref name="role"/>/<paramref name="error"/> are <see cref="MyRole"/>'s
    /// answer). Every other answer, and every failure to read one, is read-only with the reason — worded for any lead-only
    /// action, the caller names the action; nothing grants on a failure.</summary>
    public static (bool Coordinator, string Why) CoordinatorFrom(string key, string role, string error)
    {
        if (string.IsNullOrWhiteSpace(key)) return (false, "this model is not bound to a web project (Sentinel ▸ Project Setup)");
        if (role == null) return (false, $"your role on {key} could not be read ({error})");
        if (role is "lead" or "owner") return (true, $"{role} on {key}");
        if (role == "service") return (false, $"signed out — sign in (Standards ▸ Sign in) as a lead or owner of {key}");
        if (role.Length == 0) return (false, $"you are not a member of {key}");
        return (false, $"you are {role} on {key}");
    }

    /// <summary>File a changeset (POST /changesets/:key → 201 and the stored changeset). Null with the error otherwise.</summary>
    public static ChangesetDto Propose(BcfConfig cfg, string projectKey, object body, out string error)
    {
        if (!Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}", JsonSerializer.Serialize(body, WriteJson), 201, out var resp, out error)) return null;
        try { return JsonSerializer.Deserialize<ChangesetDto>(resp); }
        catch (Exception ex) { error = ex.Message; return null; }
    }

    /// <summary>A person undid or redid an applied changeset in Revit: one changeset_reverted ledger row
    /// (POST /changesets/:key/:id/reverted → 201). Off Revit's thread (the undo watcher's Task.Run).</summary>
    public static bool ReportReverted(BcfConfig cfg, string projectKey, string id, List<string> guids, string op, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/reverted",
             JsonSerializer.Serialize(new { op, guids, actor = UserSession.Actor }, WriteJson), 201, out _, out error);
}
