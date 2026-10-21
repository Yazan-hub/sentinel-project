using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.Coordination;

/// <summary>
/// The Issues window's list rules, Revit-free so tools/issue-check pins them: which issues the filters keep and in what
/// order, and which fields a quick edit changed. Mirrors BCF Manager's filter bar (status, type, priority, assignee, text).
/// </summary>
public static class IssueList
{
    /// <summary>The statuses the window offers (the web's STATUS_COLOR set); a status another tool set stays selectable.</summary>
    public static readonly string[] Statuses = { "Open", "In Progress", "Resolved", "Closed" };
    /// <summary>The default status filter: everything not Closed — the bridge's own working set.</summary>
    public const string OpenIssues = "Open issues";

    /// <summary>The issues the filters keep, sorted. <paramref name="mine"/> null = no assignee filter; a <paramref name="type"/>
    /// or <paramref name="priority"/> starting with "All" = no filter; <paramref name="sortKey"/> is a column's bound property.</summary>
    public static List<BcfTopic> Filter(IEnumerable<BcfTopic> all, string? search, string status, string type, string priority, string? mine, string sortKey, bool desc)
    {
        var q = (search ?? "").Trim();
        static bool Has(string? s, string q) => (s ?? "").IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0;
        static bool Same(string? a, string? b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        IEnumerable<BcfTopic> v = all.Where(t =>
            (status == "All" || (status == OpenIssues ? !Same(t.Status, "Closed") : Same(t.Status, status)))
            && (type.StartsWith("All") || Same(t.Type, type))
            && (priority.StartsWith("All") || Same(t.Priority, priority))
            && (mine is null || Has(t.AssignedTo, mine))
            && (q.Length == 0 || Has(t.Title, q) || Has(t.Description, q) || Has(t.AssignedTo, q) || (t.Labels ?? new List<string>()).Any(l => Has(l, q))));
        Func<BcfTopic, object> key = sortKey switch
        {
            "Title" => t => t.Title ?? "",
            "Status" => t => Rank(Statuses, t.Status),
            "Priority" => t => Rank(IssueDraft.Priorities, t.Priority),
            "AssignedTo" => t => t.AssignedTo ?? "",
            "DueDay" => t => string.IsNullOrEmpty(t.DueDay) ? "9999" : t.DueDay, // no deadline sorts last
            "ModifiedDay" => t => t.ModifiedDay,
            _ => t => t.Nr,
        };
        return (desc ? v.OrderByDescending(key).ThenBy(t => t.Nr) : v.OrderBy(key).ThenBy(t => t.Nr)).ToList();
    }

    private static int Rank(string[] order, string? value)
    {
        for (int i = 0; i < order.Length; i++) if (string.Equals(order[i], value, StringComparison.OrdinalIgnoreCase)) return i;
        return 99;
    }

    /// <summary>The quick edit's changed fields against <paramref name="t"/>, in BCF names (topic_status, priority, assigned_to,
    /// due_date as an ISO day or null) — only what differs is PUT, so the bridge's history logs only real changes.</summary>
    public static Dictionary<string, object?> Changes(BcfTopic t, string? status, string? priority, string assigned, DateTime? due)
    {
        var d = new Dictionary<string, object?>(StringComparer.Ordinal);
        // Case-insensitive: the window shows a stored "open" as "Open" — that is not a change.
        if (status != null && !string.Equals(status, t.Status, StringComparison.OrdinalIgnoreCase)) d["topic_status"] = status;
        if (priority != null && !string.Equals(priority, t.Priority, StringComparison.OrdinalIgnoreCase)) d["priority"] = priority;
        if (assigned.Trim() != (t.AssignedTo ?? "")) d["assigned_to"] = assigned.Trim();
        var newDay = due?.Date.ToString("yyyy-MM-dd") ?? "";
        if (newDay != BcfTopic.Day(t.DueDate)) d["due_date"] = due?.Date.ToString("yyyy-MM-dd'T'00:00:00'Z'");
        return d;
    }
}
