using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Standards;

/// <summary>
/// "Standards-as-code" — the machine-readable office standard the Standards Engine
/// extracts (from a golden .rvt), a human reviews, and the builder executes. See
/// docs/standards-engine-spec.md.
///
/// MVP scope: the PROVISION half (worksets + shared parameters). The pack's worksets
/// double as the WS-01 rule whitelist the scanner enforces — "one array, two faces".
/// The embedded ruleset/delivery blocks from the spec land in a later slice; for the
/// MVP the builder merges the worksets into the existing effective ruleset directly.
/// </summary>
public sealed class StandardsPack
{
    [JsonPropertyName("schema_version")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("pack_key")] public string PackKey { get; set; } = "office";
    [JsonPropertyName("semver")] public string Semver { get; set; } = "1.0.0";
    [JsonPropertyName("created_at")] public string CreatedAt { get; set; } = string.Empty;
    /// The golden model this pack was extracted from. Needed at build time to TRANSFER items the
    /// Revit API cannot author from JSON (view templates, browser organization) via cross-document copy.
    [JsonPropertyName("source_model")] public SourceModel? SourceModel { get; set; }
    [JsonPropertyName("provision")] public ProvisionSet Provision { get; set; } = new();

    /// Serialization options for saving a pack to disk (human-readable).
    public static JsonSerializerOptions JsonOpts => new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

/// <summary>What StandardsBuilder creates in the target model.</summary>
public sealed class ProvisionSet
{
    // Serializable items — fully round-trip through a saved pack (built from JSON alone).
    [JsonPropertyName("worksets")] public List<WorksetSpec> Worksets { get; set; } = new();
    [JsonPropertyName("shared_parameters")] public List<SharedParamSpec> SharedParameters { get; set; } = new();

    // Transfer items — the Revit API can't author these from JSON; they're cross-document COPIED from
    // the golden model, so building them requires that model to be open at build time.
    [JsonPropertyName("view_templates")] public List<ViewTemplateSpec> ViewTemplates { get; set; } = new();
    [JsonPropertyName("browser_organization")] public List<BrowserOrgSpec> BrowserOrganization { get; set; } = new();
}

/// <summary>Identity of the golden model a pack was extracted from (for cross-document transfer).</summary>
public sealed class SourceModel
{
    [JsonPropertyName("title")] public string Title { get; set; } = string.Empty;
    [JsonPropertyName("path")] public string? Path { get; set; }
}

/// <summary>Where a proposed item came from — drives the review UI's trust display.</summary>
public sealed class Provenance
{
    [JsonPropertyName("source")] public string Source { get; set; } = string.Empty;   // "golden-model:ACME_Tower.rvt"
    [JsonPropertyName("locator")] public string? Locator { get; set; }                 // "WorksetTable", "ParameterBindings", "p.4"

    /// True when this came straight from a real model (100% accurate) — pre-ticked in review.
    [JsonIgnore] public bool IsGoldenModel => Source.StartsWith("golden-model", StringComparison.OrdinalIgnoreCase);

    public override string ToString() => string.IsNullOrWhiteSpace(Locator) ? Source : $"{Source} · {Locator}";
}

public sealed class WorksetSpec
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("confidence")] public double Confidence { get; set; } = 1.0;
    [JsonPropertyName("provenance")] public Provenance Provenance { get; set; } = new();
}

public sealed class SharedParamSpec
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("group")] public string Group { get; set; } = "Sentinel";
    /// Simplified type token (Text/Length/Number/Integer/YesNo/Area/Volume/Angle) — mapped to the
    /// version-appropriate ForgeTypeId/ParameterType by StandardsCompat on build.
    [JsonPropertyName("type")] public string Type { get; set; } = "Text";
    [JsonPropertyName("binding")] public string Binding { get; set; } = "instance"; // instance | type
    [JsonPropertyName("categories")] public List<string> Categories { get; set; } = new();
    [JsonPropertyName("guid")] public string? Guid { get; set; }                     // preserved for stable re-provisioning
    [JsonPropertyName("confidence")] public double Confidence { get; set; } = 1.0;
    [JsonPropertyName("provenance")] public Provenance Provenance { get; set; } = new();
}

/// <summary>A view template — metadata for review; built by cross-document copy (matched by name).</summary>
public sealed class ViewTemplateSpec
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("view_type")] public string ViewType { get; set; } = string.Empty;   // "FloorPlan", "ThreeD"…
    [JsonPropertyName("detail_level")] public string? DetailLevel { get; set; }
    [JsonPropertyName("scale")] public int Scale { get; set; }
    [JsonPropertyName("discipline")] public string? Discipline { get; set; }
    [JsonPropertyName("source_element_id")] public long SourceElementId { get; set; }        // hint; build matches by name
    [JsonPropertyName("confidence")] public double Confidence { get; set; } = 1.0;
    [JsonPropertyName("provenance")] public Provenance Provenance { get; set; } = new();
}

/// <summary>A Project Browser organization scheme (views or sheets) — transferred by copy.</summary>
public sealed class BrowserOrgSpec
{
    [JsonPropertyName("target")] public string Target { get; set; } = "views"; // views | sheets
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("confidence")] public double Confidence { get; set; } = 1.0;
    [JsonPropertyName("provenance")] public Provenance Provenance { get; set; } = new();
}

/// <summary>Per-item outcome of a build run, surfaced back in the review window.</summary>
public sealed class BuildReport
{
    public List<string> Created { get; } = new();
    public List<string> Skipped { get; } = new();
    public List<string> Failed { get; } = new();
}
