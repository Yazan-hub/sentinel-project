using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Commands; // kept: every caller already imports it

/// <summary>
/// Where the bridge is and how to authenticate to it, read from %AppData%\Sentinel\bcf-config.json (env vars as
/// fallback). modelId filters the BCF list (empty = all models). It is NOT a project-key source: a document's web
/// project comes only from the document (ProjectContext). A legacy "projectId" in the file is ignored —
/// System.Text.Json skips members the class does not declare. No Revit types: tools/*-check harnesses compile it.
/// Since H4 (spec 2026-09-28) the bearer every call sends is the signed-in person's Supabase token when there is a
/// session (<see cref="Coordination.UserSession"/>), else the file's shared token — one getter, no call-site change.
/// </summary>
internal sealed class BcfConfig
{
    [JsonPropertyName("serviceUrl")] public string ServiceUrl { get; set; } = "http://localhost:4100";
    [JsonPropertyName("modelId")] public string ModelId { get; set; } = ""; // empty → service returns all models
    // The file's shared secret for the bridge's auth gate (F2): the machine credential. Empty on an external
    // install (H6), where only a signed-in person can talk to the bridge. Empty on a legacy bridge = no header.
    [JsonPropertyName("serviceToken")] public string FileToken { get; set; } = "";
    // Where Revit signs people in (public values: the anon key is in every browser bundle).
    [JsonPropertyName("supabaseUrl")] public string SupabaseUrl { get; set; } = "";
    [JsonPropertyName("supabaseAnonKey")] public string SupabaseAnonKey { get; set; } = "";

    /// <summary>The bearer to send: the signed-in person's access token (refreshed on demand), else the file's
    /// shared token; empty = no header. Decision 4: a signed-out PC keeps its shared token, an external install
    /// (no file token) gets a 401 that the tools word as "signed out". Throws
    /// <see cref="Coordination.SessionException"/> while a session exists but cannot be used (SI-1); never the file
    /// token then.</summary>
    [JsonIgnore]
    public string ServiceToken => global::Sentinel.Coordination.UserSession.AccessToken(SupabaseUrl, SupabaseAnonKey) ?? FileToken;

    public static BcfConfig Load()
    {
        string path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "bcf-config.json");
        BcfConfig cfg;
        try
        {
            cfg = File.Exists(path) ? Parse(File.ReadAllText(path)) : new BcfConfig
            {
                ServiceUrl = Env("BCF_SERVICE_URL", "http://localhost:4100"),
                FileToken = Env("BCF_TOKEN", ""),
            };
        }
        catch { cfg = new BcfConfig { ServiceUrl = Env("BCF_SERVICE_URL", "http://localhost:4100"), FileToken = Env("BCF_TOKEN", "") }; }
        // The Supabase address may live in the environment on a PC that also runs the bridge.
        if (string.IsNullOrWhiteSpace(cfg.SupabaseUrl)) cfg.SupabaseUrl = Env("SUPABASE_URL", "");
        if (string.IsNullOrWhiteSpace(cfg.SupabaseAnonKey)) cfg.SupabaseAnonKey = Env("SUPABASE_ANON_KEY", "");
        return cfg;
    }

    /// <summary>The file's JSON → config (case-insensitive, unknown members ignored). Throws on malformed JSON.</summary>
    internal static BcfConfig Parse(string json) =>
        JsonSerializer.Deserialize<BcfConfig>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new BcfConfig();

    private static string Env(string name, string fallback)
    {
        string? v = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(v) ? fallback : v!;
    }
}
