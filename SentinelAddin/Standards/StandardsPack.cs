using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Engine;

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

    // Naming conventions extracted as ordered token rules (e.g. View = DISCIPLINE_LEVEL_TYPE). Fully
    // round-trip through a saved pack; unlike worksets/params these are NOT created in the model — on
    // build they merge into the effective ruleset so the scanner enforces them.
    [JsonPropertyName("naming_rules")] public List<NamingRuleSpec> NamingRules { get; set; } = new();

    // Transfer items — the Revit API can't author these from JSON; they're cross-document COPIED from
    // the golden model, so building them requires that model to be open at build time.
    [JsonPropertyName("view_templates")] public List<ViewTemplateSpec> ViewTemplates { get; set; } = new();
    [JsonPropertyName("browser_organization")] public List<BrowserOrgSpec> BrowserOrganization { get; set; } = new();

    // The TYPE CATALOGUE — every family/type the template actually carries. Read-only reference, never
    // built into a target model. It exists so the Office Modelling Guideline can name types that EXIST:
    // a guideline written against invented names makes GhostBuilder provision types nobody recognises,
    // which is precisely the mistake that shipped once already (see docs/…office-modelling-guideline.md).
    [JsonPropertyName("type_catalog")] public List<TypeSpec> TypeCatalog { get; set; } = new();
}

/// <summary>One placeable type in the template — the vocabulary the guideline is allowed to use.</summary>
public sealed class TypeSpec
{
    /// <summary>Revit category, e.g. "Walls", "Doors" — matches the GhostBuilder build categories.</summary>
    [JsonPropertyName("category")] public string Category { get; set; } = "";
    /// <summary>Family name. For system families (walls/floors/ceilings) this is the system family name.</summary>
    [JsonPropertyName("family")] public string Family { get; set; } = "";
    /// <summary>Type name as it appears in the template.</summary>
    [JsonPropertyName("type")] public string Type { get; set; } = "";
    /// <summary>true for system families (Wall/Floor/Ceiling) — these are duplicated, not loaded.</summary>
    [JsonPropertyName("system")] public bool IsSystem { get; set; }
    /// <summary>Overall thickness/width in mm where the type exposes one — the dimension an office
    /// standard most often keys on ("200 blockwork"). Null when the type has no such parameter.</summary>
    [JsonPropertyName("width_mm")] public double? WidthMm { get; set; }
    [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
    /// <summary>Type parameters worth seeing when authoring rules (Fire Rating, Material, Assembly Code…).</summary>
    [JsonPropertyName("params")] public Dictionary<string, string> Params { get; set; } = new();
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

/// <summary>
/// A naming convention extracted as an ordered token rule (Decision 9: authored rules carry TOKENS, not raw
/// regex — the engine compiles tokens→regex, falling back to a generic alphanumeric segment for tokens with
/// no <c>token_defs</c>, so a prose-extracted rule enforces STRUCTURE: segment count + separator + charset).
/// Maps to <see cref="Rule"/>. Doc-derived rules always enforce in Warn (never Block).
/// </summary>
public sealed class NamingRuleSpec
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;              // "NM-01"
    [JsonPropertyName("target")] public string Target { get; set; } = "View";             // View|Sheet|Family|Level|Grid|Workset
    [JsonPropertyName("tokens")] public List<string> Tokens { get; set; } = new();         // ["DISCIPLINE","LEVEL","TYPE"]
    [JsonPropertyName("separator")] public string Separator { get; set; } = "_";
    [JsonPropertyName("categories")] public List<string> Categories { get; set; } = new(); // Family scope, when Target=Family
    [JsonPropertyName("example")] public string? Example { get; set; }                     // "ARC_L03_EXT" — reviewer sanity check
    [JsonPropertyName("message_en")] public string MessageEn { get; set; } = string.Empty;
    [JsonPropertyName("confidence")] public double Confidence { get; set; } = 1.0;
    [JsonPropertyName("provenance")] public Provenance Provenance { get; set; } = new();

    /// <summary>Human-readable pattern ("DISCIPLINE_LEVEL_TYPE") — shown in review + default message.</summary>
    [JsonIgnore] public string Pattern => string.Join(Separator, Tokens);

    /// <summary>Project to the engine's authored rule for enforcement.</summary>
    public Rule ToRule() => new()
    {
        Id = string.IsNullOrWhiteSpace(Id) ? "NM-DOC" : Id,
        Target = Enum.TryParse<RuleTarget>(Target, ignoreCase: true, out var t) ? t : RuleTarget.View,
        Mode = EnforcementMode.Warn,
        Tokens = Tokens.ToList(),
        Separator = string.IsNullOrEmpty(Separator) ? "_" : Separator,
        Categories = Categories.ToList(),
        MessageEn = string.IsNullOrWhiteSpace(MessageEn)
            ? $"'{{name}}' does not match the naming pattern {Pattern}."
            : MessageEn,
        DocRef = Provenance?.ToString(),
    };
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
