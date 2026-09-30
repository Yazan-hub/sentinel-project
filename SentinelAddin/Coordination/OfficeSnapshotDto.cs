using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Engine;

namespace Sentinel.Coordination;

/// <summary>
/// What the add-in tells Sentinel about an OFFICE: the template's provision (worksets, shared parameters),
/// its type catalogue and the ruleset in force. Wire shape = the bridge's office-store validateSnapshot():
/// { source:{kind,title,revit_version}, pack:{worksets:[{name}], shared_parameters:[{name,binding}]},
///   catalog:{count,types:[{category,family,type,system,width_mm,height_mm}]},
///   ruleset:{standard_key,semver,org,ref,sha256,rules:[…]}|null, at } — ref/sha name the ruleset@n that judged.
/// No Revit types here — tools/snapshot-check compiles this file on plain net8 and pins the property names.
/// </summary>
public sealed class OfficeSnapshotDto
{
    /// Enums as snake_case strings ("type", "monitor") — what the bridge's checks compare against; nulls dropped.
    public static readonly JsonSerializerOptions WireOpts = new()
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    [JsonPropertyName("source")] public SourceDto Source { get; set; } = new();
    [JsonPropertyName("pack")] public PackDto Pack { get; set; } = new();
    [JsonPropertyName("catalog")] public CatalogDto Catalog { get; set; } = new();
    [JsonPropertyName("ruleset")] public RulesetDto? Ruleset { get; set; }
    [JsonPropertyName("at")] public string At { get; set; } = DateTimeOffset.UtcNow.ToString("o");
    /// Who sent it (XC-4: UserSession.Actor, set by GovernedNotify) — the bridge's own default is "revit"; a signed-in
    /// caller's row is their verified identity whatever this says.
    [JsonPropertyName("actor")] public string? Actor { get; set; }

    public sealed class SourceDto
    {
        [JsonPropertyName("kind")] public string Kind { get; set; } = "template";   // template | model
        [JsonPropertyName("title")] public string Title { get; set; } = "";
        [JsonPropertyName("revit_version")] public string RevitVersion { get; set; } = "";
    }
    public sealed class PackDto
    {
        [JsonPropertyName("worksets")] public List<NameDto> Worksets { get; set; } = new();
        [JsonPropertyName("shared_parameters")] public List<SharedParamDto> SharedParameters { get; set; } = new();
    }
    public sealed class NameDto { [JsonPropertyName("name")] public string Name { get; set; } = ""; }
    public sealed class SharedParamDto
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("binding")] public string Binding { get; set; } = "instance";
    }
    public sealed class CatalogDto
    {
        [JsonPropertyName("count")] public int Count { get; set; }
        [JsonPropertyName("types")] public List<TypeDto> Types { get; set; } = new();
    }
    public sealed class TypeDto
    {
        [JsonPropertyName("category")] public string Category { get; set; } = "";
        [JsonPropertyName("family")] public string Family { get; set; } = "";
        [JsonPropertyName("type")] public string Type { get; set; } = "";
        [JsonPropertyName("system")] public bool System { get; set; }
        [JsonPropertyName("width_mm")] public double? WidthMm { get; set; }
        [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
    }
    /// The ruleset the template was checked against and which artefact it is (office-store keeps ref and sha256).
    public sealed class RulesetDto
    {
        [JsonPropertyName("standard_key")] public string StandardKey { get; set; } = "";
        [JsonPropertyName("semver")] public string Semver { get; set; } = "";
        [JsonPropertyName("org")] public string Org { get; set; } = "";
        [JsonPropertyName("ref")] public string? Ref { get; set; }
        [JsonPropertyName("sha256")] public string? Sha256 { get; set; }
        [JsonPropertyName("rules")] public List<Rule> Rules { get; set; } = new();
    }

    /// <summary>Build from primitives so the mapping from StandardsPack stays in the add-in and this file stays Revit-free.</summary>
    public static OfficeSnapshotDto Build(string kind, string title, string revitVersion,
        IEnumerable<string> worksets, IEnumerable<(string name, string binding)> sharedParams,
        IEnumerable<TypeDto> types, Ruleset? ruleset, string? rulesetRef = null, string? rulesetSha256 = null)
    {
        var typeList = types.ToList();
        return new OfficeSnapshotDto
        {
            Source = new SourceDto { Kind = kind, Title = title, RevitVersion = revitVersion },
            Pack = new PackDto
            {
                Worksets = worksets.Where(w => !string.IsNullOrWhiteSpace(w)).Select(w => new NameDto { Name = w }).ToList(),
                SharedParameters = sharedParams.Where(p => !string.IsNullOrWhiteSpace(p.name)).Select(p => new SharedParamDto { Name = p.name, Binding = string.IsNullOrWhiteSpace(p.binding) ? "instance" : p.binding }).ToList(),
            },
            Catalog = new CatalogDto { Count = typeList.Count, Types = typeList },
            Ruleset = ruleset is null ? null : new RulesetDto
            {
                StandardKey = ruleset.StandardKey, Semver = ruleset.Semver, Org = ruleset.Org,
                Ref = rulesetRef, Sha256 = rulesetSha256, Rules = ruleset.Rules,
            },
        };
    }

    public string ToJson() => JsonSerializer.Serialize(this, WireOpts);
}

/// <summary>A scan report on the wire — the bridge's validateScan() shape. Modes serialise as snake_case.</summary>
public sealed class ScanReportDto
{
    [JsonPropertyName("doc_title")] public string DocTitle { get; set; } = "";
    [JsonPropertyName("at")] public string At { get; set; } = "";
    [JsonPropertyName("duration_ms")] public long DurationMs { get; set; }
    [JsonPropertyName("elements_checked")] public int ElementsChecked { get; set; }
    [JsonPropertyName("violations")] public List<ViolationDto> Violations { get; set; } = new();
    // Which ruleset@n judged the scan. Sent as an explicit null when none judged (WireOpts drops nulls elsewhere):
    // the bridge then reads office.model_health as not_checkable instead of "met" on an empty scan.
    [JsonPropertyName("ruleset_ref"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] public string? RulesetRef { get; set; }
    [JsonPropertyName("ruleset_sha256"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] public string? RulesetSha256 { get; set; }
    [JsonPropertyName("actor")] public string? Actor { get; set; } // XC-4, as OfficeSnapshotDto.Actor

    public sealed class ViolationDto
    {
        [JsonPropertyName("rule_id")] public string RuleId { get; set; } = "";
        [JsonPropertyName("mode")] public EnforcementMode Mode { get; set; }
        [JsonPropertyName("element_id")] public long ElementId { get; set; }
        [JsonPropertyName("element_name")] public string ElementName { get; set; } = "";
        [JsonPropertyName("message")] public string Message { get; set; } = "";
    }

    public static ScanReportDto From(ScanReport r) => new()
    {
        DocTitle = r.DocTitle,
        At = r.At.ToUniversalTime().ToString("o"),
        DurationMs = r.DurationMs,
        ElementsChecked = r.ElementsChecked,
        Violations = r.Violations.Select(v => new ViolationDto { RuleId = v.RuleId, Mode = v.Mode, ElementId = v.ElementId, ElementName = v.ElementName, Message = v.MessageEn }).ToList(),
        RulesetRef = r.RulesetRef,
        RulesetSha256 = r.RulesetSha256,
    };

    public string ToJson() => JsonSerializer.Serialize(this, OfficeSnapshotDto.WireOpts);
}
