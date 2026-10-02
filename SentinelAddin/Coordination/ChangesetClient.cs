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
    /// <summary>MA-1a step 2: a point on an arc wall between its ends (a curved DWG wall); null = a straight line.</summary>
    [JsonPropertyName("mid")] public double[] Mid { get; set; }
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
    // retype (Promote v1): a door or window's target family — a type name alone is not one type.
    [JsonPropertyName("FamilyName")] public string FamilyName { get; set; }
    // create (MA-1): a door's or window's point on its host wall's location line (mm, z = its level), a window's sill, flips;
    // a roof's or ceiling's outline in plan [[x,y],…] (mm), a roof's base offset, a ceiling's height above its level.
    [JsonPropertyName("Location")] public double[] Location { get; set; }
    [JsonPropertyName("SillHeight")] public double? SillHeight { get; set; }
    [JsonPropertyName("FlipFacing")] public bool? FlipFacing { get; set; }
    [JsonPropertyName("FlipHand")] public bool? FlipHand { get; set; }
    [JsonPropertyName("Boundary")] public double[][] Boundary { get; set; }
    [JsonPropertyName("BaseOffset")] public double? BaseOffset { get; set; }
    [JsonPropertyName("Offset")] public double? Offset { get; set; }
    // any create but a level or grid (MA-1): its Mark (ALL_MODEL_MARK); a floor's Structural (FLOOR_PARAM_IS_STRUCTURAL).
    [JsonPropertyName("Mark")] public string Mark { get; set; }
    [JsonPropertyName("Structural")] public bool? Structural { get; set; }
}

/// <summary>The existing element a retype/attach ghost changes (MA-0, Promote v1): its Revit UniqueId, and for a retype the
/// type the plan saw ("Family : Type" for a door or window) — the executor refuses when the model has changed since.</summary>
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

/// <summary>MA-1a item 4: where an element came from, as its placer knows it — the CAD layer, the rule that typed it, the
/// source file's sha256. The bridge keeps it as filed, as a record. Review amendment C1: the executor never reads it back
/// from a changeset the bridge returned — an element's stamp takes these facts from its in-process placer only.</summary>
public sealed class ProvenanceDto
{
    [JsonPropertyName("layer")] public string Layer { get; set; }
    [JsonPropertyName("rule")] public string Rule { get; set; }
    [JsonPropertyName("source_sha256")] public string SourceSha256 { get; set; }
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
    /// <summary>MA-1a item 4: the filed record; null for an agent's or Promote's element (they name no drawing). Never what
    /// the stamp is written from (C1).</summary>
    [JsonPropertyName("provenance")] public ProvenanceDto Provenance { get; set; }
    /// <summary>MA-1a item 8: the bridge's pre-tick decision; null from a bridge before item 8, and on an element the
    /// add-in files (nulls are left out of a request body). Never trusted for a create (ChangesetTrust.PreTick).</summary>
    [JsonPropertyName("pretick")] public bool? Pretick { get; set; }
    /// <summary>MA-1a item 8: the bridge's accuracy status — "not_measured" until a survey job backs a measurement (MA-4).</summary>
    [JsonPropertyName("accuracy")] public AccuracyDto Accuracy { get; set; }
    /// <summary>MA-1a item 8 (review amendment C4): contract 2's reader id and evidence ids — the caller's claim, kept by
    /// the bridge as sent. Read only: nothing in MA-1a acts on them. Null on an element the add-in files.</summary>
    [JsonPropertyName("cid")] public string Cid { get; set; }
    [JsonPropertyName("evidence")] public List<string> Evidence { get; set; }
}

public sealed class AccuracyDto
{
    [JsonPropertyName("status")] public string Status { get; set; }
}

/// <summary>MA-1a item 8: how the review reads the bridge's trust fields. Pure (tools/promote-check).</summary>
public static class ChangesetTrust
{
    /// <summary>What is ticked when the review opens (and by "Tick suggested"). A create is never pre-ticked: an agent
    /// ghost and a drawing-only ghost never are, and nothing is measured before MA-4 — held here too, whatever a bridge
    /// answers. A retype or attach takes the bridge's decision; from a bridge before item 8 (no pretick) the window's own
    /// rule holds: a Promote attach, and a Promote retype with the type the plan saw (DR-1). A person still clicks Apply.</summary>
    public static bool PreTick(ChangesetDto cs, ChangesetElementDto el)
    {
        if (el.Op is null or "create") return false;
        return el.Pretick ?? (cs.Source == "promote" && (el.Op == "attach" || (el.Op == "retype" && el.Target?.TypeBefore != null)));
    }

    /// <summary>The element's accuracy in words ("not measured"); null when the bridge sent none.</summary>
    public static string Accuracy(ChangesetElementDto el) => el.Accuracy?.Status?.Replace('_', ' ');

    /// <summary>The changeset's source as the review shows it: a claim is said to be one.</summary>
    public static string SourceLabel(ChangesetDto cs) =>
        cs.Source + (cs.Claimed == true ? " (claimed — the bridge records who a changeset says it is from, and cannot verify it)" : "");
}

public sealed class AdjudicationDto
{
    [JsonPropertyName("verdict")] public string Verdict { get; set; }
    [JsonPropertyName("ids_source")] public string IdsSource { get; set; }
    [JsonPropertyName("unattributed")] public List<JsonElement> Unattributed { get; set; } = new();
    /// <summary>MA-1a item 4: the changeset's proposal row on the ledger ("Proposal &lt;verdict&gt;"; the bridge stores it as
    /// adjudication.audit_id). Read as it comes — a number from the ledger, null on a local changeset or an older bridge — so
    /// an odd value never breaks reading the changeset.</summary>
    [JsonPropertyName("audit_id")] public JsonElement? AuditId { get; set; }
    /// <summary>The ledger_row of every element this changeset places: the audit id as text, or null.</summary>
    [JsonIgnore] public string LedgerRow => AuditId is { ValueKind: JsonValueKind.Number or JsonValueKind.String } a ? a.ToString() : null;
}

public sealed class ChangesetDto
{
    [JsonPropertyName("id")] public string Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("source")] public string Source { get; set; }
    /// <summary>MA-1a item 8: the bridge marks the source a claim (true on every changeset until a bridge-run job backs
    /// one, MA-4); null from a bridge before item 8.</summary>
    [JsonPropertyName("claimed")] public bool? Claimed { get; set; }
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

    /// <summary>Withdraw a proposed changeset (POST /changesets/:key/:id/withdraw → 200): a Ghost build that filed some of its
    /// changesets and then could not file the rest takes them back, so none is left for a later review to apply.</summary>
    public static bool Withdraw(BcfConfig cfg, string projectKey, string id, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/withdraw",
             JsonSerializer.Serialize(new { actor = UserSession.Actor }, WriteJson), 200, out _, out error);

    /// <summary>A person undid or redid an applied changeset in Revit: one changeset_reverted ledger row
    /// (POST /changesets/:key/:id/reverted → 201). Off Revit's thread (the undo watcher's Task.Run).</summary>
    public static bool ReportReverted(BcfConfig cfg, string projectKey, string id, List<string> guids, string op, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/reverted",
             JsonSerializer.Serialize(new { op, guids, actor = UserSession.Actor }, WriteJson), 201, out _, out error);
}
