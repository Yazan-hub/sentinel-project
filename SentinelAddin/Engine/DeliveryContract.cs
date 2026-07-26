using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

/// <summary>
/// KF-1: machine-readable IFC delivery contract (the EIR/BEP distilled into
/// enforceable export requirements). Pure data — this class is part of the
/// portable core and translates 1:1 to the TypeScript/OBC implementation.
/// Loaded from {settings folder}\delivery-contract.json or project ES later.
/// </summary>
public sealed class DeliveryContract
{
    [JsonPropertyName("schema_version")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("contract_key")] public string ContractKey { get; set; } = "bds-default";
    [JsonPropertyName("ifc_schema")] public string IfcSchema { get; set; } = "IFC2X3"; // or IFC4
    /// Entities that MUST appear at least min_count times in the deliverable.
    [JsonPropertyName("required_entities")] public List<EntityRequirement> RequiredEntities { get; set; } = new();
    /// Property sets that must exist somewhere in the file (by exact name).
    [JsonPropertyName("required_psets")] public List<string> RequiredPsets { get; set; } = new();
    /// Properties that must exist (searched as IFCPROPERTYSINGLEVALUE names).
    [JsonPropertyName("required_properties")] public List<string> RequiredProperties { get; set; } = new();
    /// Entities that must NOT appear (e.g. proxy dumping ground).
    [JsonPropertyName("forbidden_entities")] public List<EntityLimit> ForbiddenEntities { get; set; } = new();
    /// Site georeferencing must be present (IFCSITE with RefLatitude/Longitude).
    [JsonPropertyName("require_georeference")] public bool RequireGeoreference { get; set; } = true;

    public sealed class EntityRequirement
    {
        [JsonPropertyName("entity")] public string Entity { get; set; } = string.Empty; // "IFCWALL"
        [JsonPropertyName("min_count")] public int MinCount { get; set; } = 1;
    }
    public sealed class EntityLimit
    {
        [JsonPropertyName("entity")] public string Entity { get; set; } = string.Empty; // "IFCBUILDINGELEMENTPROXY"
        [JsonPropertyName("max_count")] public int MaxCount { get; set; }                // 0 = forbidden
        [JsonPropertyName("max_ratio")] public double MaxRatio { get; set; } = 1.0;      // vs all building elements
    }

    public static string DefaultPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Sentinel", "delivery-contract.json");

    public static DeliveryContract LoadOrDefault()
    {
        try
        {
            if (File.Exists(DefaultPath))
                return JsonSerializer.Deserialize<DeliveryContract>(File.ReadAllText(DefaultPath))
                       ?? BuiltInDefault();
        }
        catch (Exception) { }
        return BuiltInDefault();
    }

    // generic starter; offices install their own delivery-contract.json (see config/base-standard/)
    private static DeliveryContract BuiltInDefault() => new()
    {
        RequiredEntities = new List<EntityRequirement>
        {
            new() { Entity = "IFCWALL", MinCount = 1 },
            new() { Entity = "IFCSLAB", MinCount = 1 },
            new() { Entity = "IFCDOOR", MinCount = 0 },
            new() { Entity = "IFCPROJECT", MinCount = 1 },
            new() { Entity = "IFCBUILDINGSTOREY", MinCount = 1 },
        },
        RequiredPsets = new List<string> { "Pset_WallCommon" },
        RequiredProperties = new List<string>(),
        ForbiddenEntities = new List<EntityLimit>
        {
            // Proxy elements are where semantics go to die (KF-1 thesis).
            new() { Entity = "IFCBUILDINGELEMENTPROXY", MaxCount = int.MaxValue, MaxRatio = 0.25 },
        },
        RequireGeoreference = true,
    };
}
