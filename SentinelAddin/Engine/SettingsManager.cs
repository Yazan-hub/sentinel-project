using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.ExtensibleStorage;
#endif

namespace Sentinel.Engine;

/// <summary>
/// Dual-layer configuration (commercial flexibility: not every office runs ACC).
///   Layer 1 — Extensible Storage in the active Document (project-level truth;
///             travels with the central file to every team member).
///   Layer 2 — %AppData%\Sentinel\config.json (machine-level default; works
///             for offices on plain file servers or ACC Desktop Connector).
/// Resolution order: document ES first, JSON fallback second — but the model endpoint, the model names, the mapping
/// schema, the family library and the cloud opt-in are this PC's alone (SEC-2, <see cref="SettingsManager.Merge"/>):
/// a model never carries them.
/// </summary>
public sealed class SentinelSettings
{
    [JsonPropertyName("project_code")] public string ProjectCode { get; set; } = string.Empty; // optional, tightens CDE-01

    // The web-app project (Sentinel `projects.key`) this document publishes into — the ACC-style
    // "which project does this model belong to" link. Read only from the DOCUMENT (ProjectContext); empty = not
    // bound. A machine config.json value is ignored.
    [JsonPropertyName("web_project_key")] public string WebProjectKey { get; set; } = string.Empty;

    // Linked-model publishing was deleted in cohesion phase 5b: links are never judged, so they are not published. An
    // old payload's publish_linked_models is ignored on read and dropped by the next save.

    // Ghost Builder: DWG -> LOD 200 auto-modeler. Both optional; empty disables preload / uses no schema.
    [JsonPropertyName("ghost_family_library_dir")] public string GhostFamilyLibraryDir { get; set; } = string.Empty; // .rfa library root; empty -> skip preload
    [JsonPropertyName("ghost_mapping_schema_path")] public string GhostMappingSchemaPath { get; set; } = string.Empty; // JSON schema file echoed into the LLM prompt

    // Ghost Builder v2 (P1): the local model. LOCAL-by-default (privacy — the office's drawings never leave the
    // machine); cloud is an explicit opt-in and stays OFF unless enabled. The layer standard, the modelling guideline
    // and the type catalogue are not settings: they are the web project's layers@n, guideline@n and type_catalog@n
    // (cohesion 4b-2). An old payload's ghost_layer_ruleset_path, ghost_guideline_path and ghost_type_catalog_path
    // are ignored on read and dropped by the next save.
    [JsonPropertyName("ghost_model")] public string GhostModel { get; set; } = "qwen2.5:7b-instruct";          // local Ollama model for the unknown-layer gaps
    [JsonPropertyName("ollama_url")] public string OllamaUrl { get; set; } = LocalOnly.DefaultModelUrl;
    [JsonPropertyName("ghost_cloud_opt_in")] public bool GhostCloudOptIn { get; set; } = false;                 // OFF: no drawing leaves the machine
    // P2 SENSE: a SCOPED folder of supporting docs (PDF/specs/sketches) the agent may read — and ONLY this
    // folder. Empty -> no document context (P1 behaviour). Read locally; nothing leaves the machine.
    [JsonPropertyName("ghost_source_folder")] public string GhostSourceFolder { get; set; } = string.Empty;
    // SEC-2: set by Merge — the source folder is the model's own (checked as one: no share path), not this PC's.
    [JsonIgnore] public bool SourceFolderFromModel { get; set; }

    // F-S2-3 / BG-3: the Revit Doctor may apply Revit's own fix to a slightly-off-axis line in this project — a DOCUMENT fact
    // (Project Setup, project scope), honoured only when the document is bound to a web project. OFF: the Doctor only logs.
    [JsonPropertyName("doctor_axis_fix")] public bool DoctorAxisFix { get; set; } = false;

    [JsonPropertyName("ghost_vision_model")] public string GhostVisionModel { get; set; } = "llava"; // local VLM for sketches/renders (llava = widely-supported arch)

    // An old payload's "master_ruleset_path" (the ruleset comes from the web project) and its template path (SEC-3: read by no
    // code) are ignored on read, so an
    // ES that held only that path reads as empty. ProjectCode counts: an ES holding only a project code is real. The PC-only
    // fields (SEC-2) do not count: a model holding only those reads as empty.
    [JsonIgnore] public bool IsEmpty =>
        string.IsNullOrWhiteSpace(ProjectCode)
        && string.IsNullOrWhiteSpace(GhostSourceFolder)
        && string.IsNullOrWhiteSpace(WebProjectKey) && !DoctorAxisFix;
}

public static class SettingsManager
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public static string ConfigJsonPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Sentinel", "config.json");

    // ---------------- SEC-2: what a model may carry (pure; tools/project-context-check) ----------------

    /// <summary>The fields a model never carries: the model endpoint, the model names, the mapping schema, the family library
    /// and the cloud opt-in are this PC's config.json (or the defaults) alone.</summary>
    public static readonly string[] PcOnlyKeys =
        { "ollama_url", "ghost_model", "ghost_vision_model", "ghost_mapping_schema_path", "ghost_family_library_dir", "ghost_cloud_opt_in" };

    /// <summary>Effective settings: the model's own fields (template, project code, web project, source folder, Doctor) and the
    /// PC-only fields from this PC alone. A blank source folder is the PC's; a set one is marked as the model's.</summary>
    public static SentinelSettings Merge(SentinelSettings? project, SentinelSettings? machine)
    {
        var pc = machine ?? new SentinelSettings();
        if (project is null) return pc;
        project.OllamaUrl = pc.OllamaUrl;
        project.GhostModel = pc.GhostModel;
        project.GhostVisionModel = pc.GhostVisionModel;
        project.GhostMappingSchemaPath = pc.GhostMappingSchemaPath;
        project.GhostFamilyLibraryDir = pc.GhostFamilyLibraryDir;
        project.GhostCloudOptIn = pc.GhostCloudOptIn;
        project.GhostSourceFolder = (project.GhostSourceFolder ?? "").Trim(); // Project Setup compares its trimmed box with it
        project.SourceFolderFromModel = project.GhostSourceFolder.Length > 0;
        if (!project.SourceFolderFromModel) project.GhostSourceFolder = pc.GhostSourceFolder;
        return project;
    }

    /// <summary>The JSON a model stores: every field but the PC-only ones, indented.</summary>
    public static string DocumentPayload(SentinelSettings settings)
    {
        var o = JsonSerializer.SerializeToNode(settings, JsonOpts)!.AsObject();
        foreach (var k in PcOnlyKeys) o.Remove(k);
        return o.ToJsonString(JsonOpts);
    }

    /// <summary>The one check Ghost Builder, Photo Massing and Datum make after Resolve, before they read or send anything:
    /// null, or the words to show. <paramref name="callsModel"/>: the tool calls the model (Datum does not);
    /// <paramref name="addinDirForSchema"/>: the tool reads the mapping schema (Ghost Builder), from that folder or Sentinel\schemas.</summary>
    public static string? ToolRefusal(SentinelSettings s, bool callsModel, string? addinDirForSchema = null) =>
        LocalOnly.FolderRefusal(s.GhostSourceFolder, s.SourceFolderFromModel)
        ?? LocalOnly.FolderRefusal(s.GhostFamilyLibraryDir, fromModel: false)
        ?? (callsModel ? LocalOnly.ModelUrlRefusal(s.OllamaUrl, s.GhostCloudOptIn) : null)
        ?? (callsModel && s.SourceFolderFromModel && LocalOnly.Where(s.OllamaUrl) is var at && at != "on this PC"
            ? $"This model names the folder \"{s.GhostSourceFolder.Trim()}\" and the model is {at}: Sentinel sends files to a model off this PC "
              + "only from a folder this PC's config.json names. Nothing was read or sent."
            : null)
        ?? (addinDirForSchema is null ? null : LocalOnly.SchemaRefusal(s.GhostMappingSchemaPath, addinDirForSchema, LocalOnly.SchemasDir));

#if !SENTINEL_CHECK
    private static readonly Guid SchemaGuid = new("A3F81C2D-6E4B-4D9A-B7C0-2E5F8A1D3B66");
    private const string FieldName = "ConfigJson";
    private const string StorageName = "Sentinel.Config";

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

    /// <summary>The raw settings JSON stored in the document, or null (none stored, unreadable). API thread;
    /// never throws. <see cref="ProjectContext.For"/> reads the web project key from it.</summary>
    internal static string? DocumentJson(Document doc)
    {
        try
        {
            var ds = FindStorage(doc);
            if (ds is null) return null;
            var entity = ds.GetEntity(GetSchema());
            return entity.IsValid() ? entity.Get<string>(FieldName) : null;
        }
        catch (Exception) { return null; }
    }

    /// <summary>Read project-level settings from the document. Null when absent.</summary>
    public static SentinelSettings? LoadFromDocument(Document doc)
    {
        try
        {
            var json = DocumentJson(doc);
            if (string.IsNullOrEmpty(json)) return null;
            var s = JsonSerializer.Deserialize<SentinelSettings>(json!);
            return s is { IsEmpty: false } ? s : null;
        }
        catch (Exception) { return null; }  // corrupt ES payload: fall through to JSON
    }

    /// <summary>Write project-level settings — never the PC-only fields (SEC-2). CALLER must hold an open transaction
    /// (route through App.Events — see SettingsDialog).</summary>
    public static void SaveToDocument(Document doc, SentinelSettings settings)
    {
        var ds = FindStorage(doc) ?? DataStorage.Create(doc);
        if (ds.Name != StorageName) ds.Name = StorageName;
        var entity = new Entity(GetSchema());
        entity.Set(FieldName, DocumentPayload(settings));
        ds.SetEntity(entity);
    }

    // ---------------- Resolution ----------------

    /// <summary>Effective settings: the document's own fields, this PC's for the rest (<see cref="Merge"/>); the PC's alone,
    /// or the defaults, when the document holds none.</summary>
    public static SentinelSettings Resolve(Document? doc) => Merge(doc is not null ? LoadFromDocument(doc) : null, LoadFromMachine());
#endif

    // ---------------- Local JSON (machine level) ----------------
    /// <summary>This PC's config.json, or null (none, unreadable). A file holding only PC-only fields counts (SEC-2: the
    /// cloud opt-in and the endpoint may be all it sets).</summary>
    public static SentinelSettings? LoadFromMachine()
    {
        try
        {
            if (!File.Exists(ConfigJsonPath)) return null;
            return JsonSerializer.Deserialize<SentinelSettings>(File.ReadAllText(ConfigJsonPath));
        }
        catch (Exception) { return null; }
    }

    /// <summary>SEC-3: this PC's cloud opt-in (its config.json), for a model client with no model settings to merge.</summary>
    public static bool MachineCloudOptIn() => LoadFromMachine()?.GhostCloudOptIn == true;

    public static void SaveToMachine(SentinelSettings settings)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(ConfigJsonPath)!);
        File.WriteAllText(ConfigJsonPath, JsonSerializer.Serialize(settings, JsonOpts));
    }
}
