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
    // Keyed by the Document (not PathName/Title): a first save or Save As changes the path, and the snapshot must
    // still be found — a request made after it then carries the real old name (BG-1).
    private static readonly Dictionary<Document, Dictionary<long, string>> Snapshots =
        new Dictionary<Document, Dictionary<long, string>>();

    public static void Forget(Document doc) => Snapshots.Remove(doc);

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
        Snapshots[doc] = map;
    }

    public static string? GetSnapshotName(Document doc, long elementId) =>
        Snapshots.TryGetValue(doc, out var map) && map.TryGetValue(elementId, out var n) ? n : null;

    public static void UpdateSnapshot(Document doc, long elementId, string newName)
    {
        if (Snapshots.TryGetValue(doc, out var map)) map[elementId] = newName;
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

    /// BG-4: ⚡ Fix on a REQUEST rule proposes instead of renaming. MUST run inside a transaction.
    /// False when a request is already pending for the element or the name would not change.
    public static bool CreateProposal(Document doc, string ruleId, Element element, string proposed)
    {
        long id = element.Id.IdValue();
        if (RequestStore.HasPending(doc, id)) return false;
        var current = element is ViewSheet s ? s.SheetNumber : element.Name;
        if (current == proposed) return false;
        var req = new ChangeRequest
        {
            RuleId = ruleId,
            ElementId = id,
            ElementCategory = element.Category?.Name ?? element.GetType().Name,
            OldValue = current,
            NewValue = proposed,
            RequestedBy = doc.Application.Username,
            Proposal = true,
        };
        RequestStore.Upsert(doc, req, new AuditEntry
        {
            Actor = req.RequestedBy,
            Action = "request.proposed",
            RequestId = req.Id,
            Detail = $"{req.ElementCategory} '{current}' -> '{proposed}' proposed ({ruleId})",
        });
        SetReviewFlag(element, "Pending");
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
        // A proposal is also known from the append-only audit: a pre-BG-4 add-in rewriting the blob drops the new
        // "proposal" field, and the request must not then be treated as an edit that already happened.
        bool proposal = req.Proposal
            || RequestStore.GetAudit(doc).Any(a => a.RequestId == req.Id && a.Action == "request.proposed");
        req.Proposal = proposal;

        if (approve)
        {
            req.Status = RequestStatus.Approved;
            if (element is not null)
            {
                if (proposal)                                  // BG-4: a proposal was never applied — Approve applies it
                {
                    try { RevertValue(element, req.NewValue); }
                    catch (Autodesk.Revit.Exceptions.ApplicationException)
                    {   // the name was taken after the proposal was filed: the whole verdict rolls back, stays pending
                        throw new InvalidOperationException($"'{req.NewValue}' is already in use — reject this proposal or rename by hand.");
                    }
                    UpdateSnapshot(doc, req.ElementId, req.NewValue);
                }
                SetReviewFlag(element, "");
            }
        }
        else
        {
            req.Status = RequestStatus.Rejected;
            if (element is not null)
            {
                var current = element is ViewSheet vs ? vs.SheetNumber : element.Name;
                bool handRenamed = proposal && current != req.OldValue;
                // A hand rename made while the proposal was pending is reverted only if it still breaks the request's
                // rule — a compliant one was never going to be reviewed, and reverting it would bring back the bad name.
                bool handRenameViolates = handRenamed && App.Engine is { } engine
                    && engine.ScanElements(doc, new List<ElementId> { element.Id }).Any(v => v.RuleId == req.RuleId);
                if (proposal && !handRenameViolates)
                {
                    SetReviewFlag(element, "");                // nothing to revert (or a compliant hand rename, kept)
                    if (handRenamed) req.VerdictNote = $"{note ?? "-"} | hand rename '{current}' kept (passes {req.RuleId})";
                }
                else
                {
                    // Decision 8: auto-revert — also for a proposal whose element was renamed by hand while it was
                    // pending (no second request could be filed then, so this is the only review that rename gets).
                    RevertValue(element, req.OldValue);
                    SetReviewFlag(element, "");
                    UpdateSnapshot(doc, req.ElementId, req.OldValue);
                    req.Status = RequestStatus.Reverted;
                    if (proposal) req.VerdictNote = $"{note ?? "-"} | reverted the hand rename '{current}'";
                }
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
