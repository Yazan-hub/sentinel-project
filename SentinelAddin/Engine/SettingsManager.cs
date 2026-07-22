using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.ExtensibleStorage;

namespace Sentinel.Engine;

/// <summary>
/// Dual-layer configuration (commercial flexibility: not every office runs ACC).
///   Layer 1 — Extensible Storage in the active Document (project-level truth;
///             travels with the central file to every team member).
///   Layer 2 — %AppData%\Sentinel\config.json (machine-level default; works
///             for offices on plain file servers or ACC Desktop Connector).
/// Resolution order: document ES first, JSON fallback second.
/// </summary>
public sealed class SentinelSettings
{
    [JsonPropertyName("master_ruleset_path")] public string MasterRulesetPath { get; set; } = string.Empty;
    [JsonPropertyName("revit_template_path")] public string RevitTemplatePath { get; set; } = string.Empty;
    [JsonPropertyName("project_code")] public string ProjectCode { get; set; } = string.Empty; // optional, tightens CDE-01

    // Ghost Builder: DWG -> LOD 200 auto-modeler. Both optional; empty disables preload / uses no schema.
    [JsonPropertyName("ghost_family_library_dir")] public string GhostFamilyLibraryDir { get; set; } = string.Empty; // .rfa library root; empty -> skip preload
    [JsonPropertyName("ghost_mapping_schema_path")] public string GhostMappingSchemaPath { get; set; } = string.Empty; // JSON schema file echoed into the LLM prompt

    // Ghost Builder v2 (P1): local model + swappable DWG layer standard. LOCAL-by-default (privacy — the
    // office's drawings never leave the machine); cloud is an explicit opt-in and stays OFF unless enabled.
    [JsonPropertyName("ghost_model")] public string GhostModel { get; set; } = "qwen2.5:7b-instruct";          // local Ollama model for the unknown-layer gaps
    [JsonPropertyName("ollama_url")] public string OllamaUrl { get; set; } = "http://localhost:11434/api/generate";
    [JsonPropertyName("ghost_layer_ruleset_path")] public string GhostLayerRulesetPath { get; set; } = string.Empty; // empty -> %AppData%\Sentinel\bds-layers.json, then the shipped Resources copy
    [JsonPropertyName("ghost_cloud_opt_in")] public bool GhostCloudOptIn { get; set; } = false;                 // OFF: no drawing leaves the machine
    // P2 SENSE: a SCOPED folder of supporting docs (PDF/specs/sketches) the agent may read — and ONLY this
    // folder. Empty -> no document context (P1 behaviour). Read locally; nothing leaves the machine.
    [JsonPropertyName("ghost_source_folder")] public string GhostSourceFolder { get; set; } = string.Empty;

    [JsonIgnore] public bool IsEmpty =>
        string.IsNullOrWhiteSpace(MasterRulesetPath) && string.IsNullOrWhiteSpace(RevitTemplatePath)
        && string.IsNullOrWhiteSpace(GhostSourceFolder) && string.IsNullOrWhiteSpace(GhostFamilyLibraryDir);
}

public static class SettingsManager
{
    private static readonly Guid SchemaGuid = new("A3F81C2D-6E4B-4D9A-B7C0-2E5F8A1D3B66");
    private const string FieldName = "ConfigJson";
    private const string StorageName = "Sentinel.Config";

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public static string ConfigJsonPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Sentinel", "config.json");

    // ---------------- Extensible Storage (project level) ----------------
    private static Schema GetSchema()
    {
        var existing = Schema.Lookup(SchemaGuid);
        if (existing is not null) return existing;
        var b = new SchemaBuilder(SchemaGuid);
        b.SetSchemaName("SentinelConfig");
        b.SetReadAccessLevel(AccessLevel.Public);
        b.SetWriteAccessLevel(AccessLevel.Public);
        b.AddSimpleField(FieldName, typeof(string));
        return b.Finish();
    }

    private static DataStorage? FindStorage(Document doc) =>
        new FilteredElementCollector(doc).OfClass(typeof(DataStorage))
            .Cast<DataStorage>().FirstOrDefault(ds => ds.Name == StorageName);

    /// <summary>Read project-level settings from the document. Null when absent.</summary>
    public static SentinelSettings? LoadFromDocument(Document doc)
    {
        try
        {
            var ds = FindStorage(doc);
            if (ds is null) return null;
            var entity = ds.GetEntity(GetSchema());
            if (!entity.IsValid()) return null;
            var json = entity.Get<string>(FieldName);
            if (string.IsNullOrEmpty(json)) return null;
            var s = JsonSerializer.Deserialize<SentinelSettings>(json);
            return s is { IsEmpty: false } ? s : null;
        }
        catch (Exception) { return null; }  // corrupt ES payload: fall through to JSON
    }

    /// <summary>Write project-level settings. CALLER must hold an open transaction
    /// (route through App.Events — see SettingsDialog).</summary>
    public static void SaveToDocument(Document doc, SentinelSettings settings)
    {
        var ds = FindStorage(doc) ?? DataStorage.Create(doc);
        if (ds.Name != StorageName) ds.Name = StorageName;
        var entity = new Entity(GetSchema());
        entity.Set(FieldName, JsonSerializer.Serialize(settings, JsonOpts));
        ds.SetEntity(entity);
    }

    // ---------------- Local JSON (machine level) ----------------
    public static SentinelSettings? LoadFromMachine()
    {
        try
        {
            if (!File.Exists(ConfigJsonPath)) return null;
            var s = JsonSerializer.Deserialize<SentinelSettings>(File.ReadAllText(ConfigJsonPath));
            return s is { IsEmpty: false } ? s : null;
        }
        catch (Exception) { return null; }
    }

    public static void SaveToMachine(SentinelSettings settings)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(ConfigJsonPath)!);
        File.WriteAllText(ConfigJsonPath, JsonSerializer.Serialize(settings, JsonOpts));
    }

    // ---------------- Resolution ----------------
    /// <summary>Effective settings: document ES first, machine JSON fallback,
    /// empty settings when neither exists (engine then uses built-in chain).</summary>
    public static SentinelSettings Resolve(Document? doc)
    {
        var machine = LoadFromMachine();
        var project = doc is not null ? LoadFromDocument(doc) : null;
        if (project is null) return machine ?? new SentinelSettings();

        // A project's document ES wins for its own fields, but the machine config still supplies the GHOST
        // operational defaults (source folder / family library / ruleset path) so they apply even in a project
        // that carries its own Sentinel ES — otherwise a per-project setup silently disables P2's doc folder.
        if (machine is not null)
        {
            if (string.IsNullOrWhiteSpace(project.GhostSourceFolder)) project.GhostSourceFolder = machine.GhostSourceFolder;
            if (string.IsNullOrWhiteSpace(project.GhostFamilyLibraryDir)) project.GhostFamilyLibraryDir = machine.GhostFamilyLibraryDir;
            if (string.IsNullOrWhiteSpace(project.GhostLayerRulesetPath)) project.GhostLayerRulesetPath = machine.GhostLayerRulesetPath;
        }
        return project;
    }
}
