using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Commands; // kept: every caller already imports it

/// <summary>
/// Where the bridge is and how to authenticate to it, read from %AppData%\Sentinel\bcf-config.json (env vars as
/// fallback). modelId filters the BCF list (empty = all models). It is NOT a project-key source: a document's web
/// project comes only from the document (ProjectContext). A legacy "projectId" in the file is ignored —
/// System.Text.Json skips members the class does not declare. No Revit types: tools/*-check harnesses compile it.
/// </summary>
internal sealed class BcfConfig
{
    [JsonPropertyName("serviceUrl")] public string ServiceUrl { get; set; } = "http://localhost:4100";
    [JsonPropertyName("modelId")] public string ModelId { get; set; } = ""; // empty → service returns all models
    // Shared secret for the bridge's auth gate (F2). When the bridge runs with BCF_TOKEN set, Revit must present
    // it or the governed calls are rejected as anonymous. Empty = legacy bridge (no gate) → no header is sent.
    [JsonPropertyName("serviceToken")] public string ServiceToken { get; set; } = "";

    public static BcfConfig Load()
    {
        string path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "bcf-config.json");
        try
        {
            if (File.Exists(path)) return Parse(File.ReadAllText(path));
        }
        catch { /* fall through to env/defaults */ }

        return new BcfConfig
        {
            ServiceUrl = Env("BCF_SERVICE_URL", "http://localhost:4100"),
            ServiceToken = Env("BCF_TOKEN", ""),
        };
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
