using System.Text.Json.Serialization;

namespace Sentinel.Workflow;

public enum RequestStatus { Pending, Approved, Rejected, Reverted }

/// <summary>
/// One modeller change awaiting coordinator verdict. Persisted in
/// Extensible Storage inside the model, so it syncs with central,
/// works offline, and travels with the file. Mirrors the backend
/// contributions state machine (Phase 3 syncs these upstream).
/// </summary>
public sealed class ChangeRequest
{
    [JsonPropertyName("id")] public Guid Id { get; set; } = Guid.NewGuid();
    [JsonPropertyName("rule_id")] public string RuleId { get; set; } = string.Empty;
    [JsonPropertyName("element_id")] public long ElementId { get; set; }
    [JsonPropertyName("element_category")] public string ElementCategory { get; set; } = string.Empty;
    [JsonPropertyName("old_value")] public string OldValue { get; set; } = string.Empty;
    [JsonPropertyName("new_value")] public string NewValue { get; set; } = string.Empty;
    [JsonPropertyName("requested_by")] public string RequestedBy { get; set; } = string.Empty;
    [JsonPropertyName("requested_at")] public DateTimeOffset RequestedAt { get; set; } = DateTimeOffset.Now;
    [JsonPropertyName("status")] public RequestStatus Status { get; set; } = RequestStatus.Pending;
    [JsonPropertyName("verdict_by")] public string? VerdictBy { get; set; }
    [JsonPropertyName("verdict_at")] public DateTimeOffset? VerdictAt { get; set; }
    [JsonPropertyName("verdict_note")] public string? VerdictNote { get; set; }
}

/// <summary>Immutable audit line (Decision 8) — append-only local log,
/// mirrored to backend audit_log in Phase 3.</summary>
public sealed class AuditEntry
{
    [JsonPropertyName("at")] public DateTimeOffset At { get; set; } = DateTimeOffset.Now;
    [JsonPropertyName("actor")] public string Actor { get; set; } = string.Empty;
    [JsonPropertyName("action")] public string Action { get; set; } = string.Empty;   // request.created / .approved / .rejected / .reverted
    [JsonPropertyName("request_id")] public Guid RequestId { get; set; }
    [JsonPropertyName("detail")] public string Detail { get; set; } = string.Empty;
}
