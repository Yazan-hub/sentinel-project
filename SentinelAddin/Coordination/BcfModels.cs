using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Coordination;

// ---------------------------------------------------------------------------
// OpenCDE BCF-API 3.0 DTOs (subset used by the sync loop)
// ---------------------------------------------------------------------------
public sealed class BcfTopic
{
    [JsonPropertyName("guid")] public string Guid { get; set; } = "";
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("topic_type")] public string Type { get; set; } = "Issue";
    [JsonPropertyName("topic_status")] public string Status { get; set; } = "Open";
    [JsonPropertyName("priority")] public string Priority { get; set; } = "";
    [JsonPropertyName("assigned_to")] public string AssignedTo { get; set; } = "";
    [JsonPropertyName("due_date")] public string? DueDate { get; set; }
    [JsonPropertyName("stage")] public string Stage { get; set; } = "";
    [JsonPropertyName("description")] public string Description { get; set; } = "";
    [JsonPropertyName("creation_author")] public string Author { get; set; } = "";
    [JsonPropertyName("creation_date")] public string CreationDate { get; set; } = "";
    [JsonPropertyName("labels")] public List<string> Labels { get; set; } = new();
    [JsonPropertyName("comments")] public List<BcfComment> Comments { get; set; } = new();
    [JsonPropertyName("history")] public List<BcfHistory> History { get; set; } = new();
    [JsonPropertyName("viewpoints")] public List<BcfViewpoint> Viewpoints { get; set; } = new();

    // Shown in the issue list; the details pane renders the rest.
    public override string ToString() => $"[{Status}] {Title}";
}

public sealed class BcfComment
{
    [JsonPropertyName("comment")] public string Text { get; set; } = "";
    [JsonPropertyName("author")] public string Author { get; set; } = "";
    [JsonPropertyName("date")] public string Date { get; set; } = "";
}

public sealed class BcfHistory
{
    [JsonPropertyName("date")] public string Date { get; set; } = "";
    [JsonPropertyName("author")] public string Author { get; set; } = "";
    [JsonPropertyName("action")] public string Action { get; set; } = "";
}

public sealed class BcfViewpoint
{
    [JsonPropertyName("guid")] public string Guid { get; set; } = "";
    [JsonPropertyName("perspective_camera")] public PerspectiveCamera? Camera { get; set; }
    [JsonPropertyName("components")] public BcfComponents? Components { get; set; }
}

public sealed class BcfComponents
{
    [JsonPropertyName("selection")] public List<BcfComponent> Selection { get; set; } = new();
}

public sealed class BcfComponent
{
    [JsonPropertyName("ifc_guid")] public string IfcGuid { get; set; } = "";
}

public sealed class PerspectiveCamera
{
    [JsonPropertyName("camera_view_point")] public Vec3 ViewPoint { get; set; } = new();
    [JsonPropertyName("camera_direction")] public Vec3 Direction { get; set; } = new();
    [JsonPropertyName("camera_up_vector")] public Vec3 UpVector { get; set; } = new();
    [JsonPropertyName("field_of_view")] public double FieldOfView { get; set; } = 60.0;
}

public sealed class Vec3
{
    [JsonPropertyName("x")] public double X { get; set; }
    [JsonPropertyName("y")] public double Y { get; set; }
    [JsonPropertyName("z")] public double Z { get; set; }
}
