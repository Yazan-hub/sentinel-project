using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.Coordination;

/// <summary>
/// An issue raised FROM Revit (founder's request 2026-09-28): what the person typed, the IFC GlobalIds of the
/// elements they selected and the active 3D view's camera, both captured on Revit's API thread. Revit-free, so the
/// bodies and the outcome sentence are pinned by tools/issue-check. The bridge's BCF route already takes a topic and
/// its viewpoint; the signed-in person's verified e-mail becomes the author there, never the value sent here.
/// </summary>
public sealed class IssueDraft
{
    public string Title = "";
    public string Description = "";
    public string TopicType = "Issue";
    public string Priority = "Normal";
    public string AssignedTo = "";
    public DateTime? DueDate;
    public List<string> IfcGuids = new();
    public PerspectiveCamera? Camera;
    public string CameraNote = "";

    /// <summary>The web Issues panel's vocabularies, so an issue reads the same wherever it was raised.</summary>
    public static readonly string[] Types = { "Issue", "Clash", "Fault", "Info", "Request" };
    public static readonly string[] Priorities = { "Low", "Normal", "High", "Critical" };

    /// <summary>Why this draft cannot be sent, in words; null when it can. An issue points at something, as on the
    /// web: at least one selected element.</summary>
    public string? Refusal()
    {
        if (IfcGuids.Count == 0) return "Select the element(s) the issue is about first — nothing was sent.";
        if (Title.Trim().Length == 0) return "A title, please — nothing was sent.";
        if (Title.Trim().Length > 600) return "A title is at most 600 characters — nothing was sent.";
        if (!Types.Contains(TopicType)) return $"Type is one of {string.Join(", ", Types)} — nothing was sent.";
        if (!Priorities.Contains(Priority)) return $"Priority is one of {string.Join(", ", Priorities)} — nothing was sent.";
        return null;
    }

    /// <summary>POST /bcf/3.0/projects/:pid/topics — the web panel's field set. creation_author is a label only: the
    /// bridge replaces it with the verified identity of a signed-in caller.</summary>
    public object TopicBody(string modelId) => new
    {
        title = Title.Trim(),
        topic_type = TopicType,
        topic_status = "Open",
        priority = Priority,
        assigned_to = AssignedTo.Trim(),
        due_date = DueDate?.Date.ToString("yyyy-MM-dd'T'00:00:00'Z'"),
        labels = new[] { "revit" },
        description = Description.Trim(),
        model = modelId,
        creation_author = "Revit",
    };

    /// <summary>POST …/topics/:guid/viewpoints — the camera (null when the active view is not 3D) and the selection.</summary>
    public object ViewpointBody() => new
    {
        perspective_camera = Camera,
        components = new { selection = IfcGuids.Distinct(StringComparer.Ordinal).Select(g => new { ifc_guid = g }).ToArray() },
    };
}

/// <summary>What the two calls answered. Status 0 = the bridge did not answer.</summary>
public sealed class IssueResult
{
    public int TopicStatus;
    public string? TopicGuid;
    public string TopicMessage = "";
    public int ViewpointStatus;
    public string ViewpointMessage = "";

    /// <summary>One sentence for the Issues window. Created only when the bridge returned the topic (201 + guid); a
    /// viewpoint that did not land is said, because then the issue points at nothing.</summary>
    public string Sentence(IssueDraft d, string serviceUrl)
    {
        string Why(int status, string message) => status switch
        {
            0 => $"the bridge did not answer at {serviceUrl}",
            401 => "signed out — Sentinel ▸ Sign in",
            _ => $"HTTP {status}" + (message.Length > 0 ? ": " + message : ""),
        };
        if (TopicStatus != 201 || string.IsNullOrEmpty(TopicGuid))
        {
            var why = Why(TopicStatus, TopicMessage);
            return "Not created — " + why + (why.EndsWith("nothing was saved") ? "." : " — nothing was saved.");
        }
        var n = d.IfcGuids.Distinct(StringComparer.Ordinal).Count();
        if (ViewpointStatus != 201)
            return $"Issue created: '{d.Title.Trim()}' — but its viewpoint was not saved ({Why(ViewpointStatus, ViewpointMessage)}), so it points at no element; link them on the web.";
        return $"Issue created: '{d.Title.Trim()}' · {n} element(s) linked · {d.CameraNote} — on the web board now.";
    }
}
