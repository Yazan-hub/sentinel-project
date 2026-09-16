using System.Collections.Generic;

namespace Sentinel.Engine;

// The IDS-ready ElementProperties shape the referee core expects — {identity:{Class,GlobalId,Name,Tag},
// psets:[{name,rows:[{name,value}]}], quantities:[]}. Revit-free, so the fix-in-place planner and its check
// tool can build and patch payloads without the API. NOTE: these MUST be properties (get/set), not fields —
// System.Text.Json serializes properties only; fields would emit empty {} groups and the referee would see
// no pset data at all.
public sealed class GovRow { public string name { get; set; } = ""; public string value { get; set; } = ""; }
public sealed class GovGroup { public string name { get; set; } = ""; public List<GovRow> rows { get; set; } = new(); }

public sealed class GovIdentity
{
    public string? GlobalId { get; set; }
    public string? Name { get; set; }
    public string? Class { get; set; }
    public string? Tag { get; set; }
}

/// <summary>One element, serialized straight into the propose payload's <c>elements[]</c>.</summary>
public sealed class GovElement
{
    public string modelId { get; set; } = "";
    public long localId { get; set; }
    public GovIdentity identity { get; set; } = new();
    public List<GovGroup> psets { get; set; } = new();
    public List<GovGroup> quantities { get; set; } = new();
}
