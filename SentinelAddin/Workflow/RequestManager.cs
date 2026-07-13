using System.IO;
using System.Text.Json;
using Autodesk.Revit.DB;

namespace Sentinel.Workflow;

/// <summary>
/// Orchestrates the request lifecycle:
///   modeller edit hits a REQUEST-mode rule (DMU)
///     -> capture old/new from name snapshot
///     -> persist Pending request (ES) + set ZZZ_ReviewStatus = "Pending"
///   coordinator verdict (RequestsWindow -> ExternalEvent)
///     -> Approve: clear flag, keep change
///     -> Reject:  revert value, clear flag (Decision 8)
/// </summary>
public static class RequestManager
{
    public const string ReviewStatusParam = "ZZZ_ReviewStatus";

    // ---------- Roles ----------
    private sealed class Settings { public List<string> Coordinators { get; set; } = new List<string>(); }

    private static string SettingsPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Sentinel", "settings.json");

    public static bool IsCoordinator(Document doc)
    {
        var user = doc.Application.Username;
        try
        {
            if (File.Exists(SettingsPath))
            {
                var s = JsonSerializer.Deserialize<Settings>(File.ReadAllText(SettingsPath));
                if (s is not null && s.Coordinators.Count > 0)
                    return s.Coordinators.Any(c => string.Equals(c, user, StringComparison.OrdinalIgnoreCase));
            }
        }
        catch (Exception) { /* fall through: treat as coordinator-less setup */ }
        return true; // no settings file yet -> don't lock anyone out during pilot
    }

    // ---------- Name snapshots (old-value capture for DMU) ----------
    // DMU only tells us WHAT changed, not the previous value. We keep a
    // per-document snapshot of monitored names, refreshed on open/sync
    // and after every handled change.
    private static readonly Dictionary<string, Dictionary<long, string>> Snapshots =
        new Dictionary<string, Dictionary<long, string>>();

    private static string Key(Document doc) => doc.PathName ?? doc.Title;

    public static void RefreshSnapshot(Document doc)
    {
        var map = new Dictionary<long, string>();
        foreach (var e in new FilteredElementCollector(doc)
                     .WherePasses(new LogicalOrFilter(new List<ElementFilter>
                     {
                         new ElementClassFilter(typeof(View)),
                         new ElementClassFilter(typeof(ViewSheet)),
                         new ElementClassFilter(typeof(Level)),
                         new ElementClassFilter(typeof(Grid)),
                     })))
        {
            map[e.Id.IdValue()] = e is ViewSheet s ? s.SheetNumber : e.Name;
        }
        Snapshots[Key(doc)] = map;
    }

    public static string? GetSnapshotName(Document doc, long elementId) =>
        Snapshots.TryGetValue(Key(doc), out var map) && map.TryGetValue(elementId, out var n) ? n : null;

    public static void UpdateSnapshot(Document doc, long elementId, string newName)
    {
        if (Snapshots.TryGetValue(Key(doc), out var map)) map[elementId] = newName;
    }

    // ---------- Lifecycle ----------
    /// Called from DMU Execute (transaction already open).
    /// Returns false if a pending request already exists for the element.
    public static bool CreatePending(Document doc, string ruleId, Element element, string newValue)
    {
        long id = element.Id.IdValue();
        if (RequestStore.HasPending(doc, id)) return false;

        var oldValue = GetSnapshotName(doc, id) ?? "";
        if (oldValue == newValue) return false; // no-op edit

        var req = new ChangeRequest
        {
            RuleId = ruleId,
            ElementId = id,
            ElementCategory = element.Category?.Name ?? element.GetType().Name,
            OldValue = oldValue,
            NewValue = newValue,
            RequestedBy = doc.Application.Username,
        };
        RequestStore.Upsert(doc, req, new AuditEntry
        {
            Actor = req.RequestedBy,
            Action = "request.created",
            RequestId = req.Id,
            Detail = $"{req.ElementCategory} '{oldValue}' -> '{newValue}' ({ruleId})",
        });
        SetReviewFlag(element, "Pending");
        UpdateSnapshot(doc, id, newValue);
        return true;
    }

    /// Coordinator verdict. MUST run inside a transaction (ExternalEvent).
    public static void Resolve(Document doc, Guid requestId, bool approve, string? note)
    {
        var req = RequestStore.Find(doc, requestId);
        if (req is null || req.Status != RequestStatus.Pending) return;

        var user = doc.Application.Username;
        var element = doc.GetElement(req.ElementId.ToElementId());

        req.VerdictBy = user;
        req.VerdictAt = DateTimeOffset.Now;
        req.VerdictNote = note;

        if (approve)
        {
            req.Status = RequestStatus.Approved;
            if (element is not null) SetReviewFlag(element, "");
        }
        else
        {
            req.Status = RequestStatus.Rejected;
            if (element is not null)
            {
                RevertValue(element, req.OldValue);          // Decision 8: auto-revert
                SetReviewFlag(element, "");
                UpdateSnapshot(doc, req.ElementId, req.OldValue);
                req.Status = RequestStatus.Reverted;
            }
        }

        RequestStore.Upsert(doc, req, new AuditEntry
        {
            Actor = user,
            Action = approve ? "request.approved" : "request.rejected",
            RequestId = req.Id,
            Detail = $"'{req.OldValue}' -> '{req.NewValue}' | note: {note ?? "-"}",
        });
    }

    private static void RevertValue(Element element, string oldValue)
    {
        if (element is ViewSheet sheet) sheet.SheetNumber = oldValue;
        else element.Name = oldValue;
    }

    private static void SetReviewFlag(Element element, string value)
    {
        var p = element.LookupParameter(ReviewStatusParam);
        if (p is not null && !p.IsReadOnly && p.StorageType == StorageType.String)
            p.Set(value);
        // Parameter missing -> SetupCommand not yet run; request still tracked in ES.
    }
}
