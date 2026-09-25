using System.Text.Json;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
#endif

namespace Sentinel.Engine;

/// <summary>
/// The web project a Revit document belongs to — read ONLY from the document's own settings (Extensible Storage,
/// <c>web_project_key</c>, written by Project Setup at project scope). No machine config.json, no bcf-config
/// projectId, no THATOPEN_PROJECT_ID, no "default": an unbound document says so (cohesion phase 4a, decision 7).
/// <see cref="For"/> reads Extensible Storage, so it runs on the Revit API thread; callers hand the
/// <see cref="Key"/> string to background work, never the document.
/// </summary>
public sealed class ProjectContext
{
    /// <summary>What every surface says when a document has no web project.</summary>
    public const string NotBound = "This model is not bound to a web project — Sentinel ▸ Project Setup.";

    public string Key = "";
    public bool IsBound;

    /// <summary>Pure: the context stored in a SentinelSettings JSON blob (null, empty, corrupt or keyless → unbound).
    /// Never throws.</summary>
    public static ProjectContext FromSettingsJson(string? json)
    {
        var key = "";
        try
        {
            if (!string.IsNullOrWhiteSpace(json))
            {
                using var d = JsonDocument.Parse(json!);
                if (d.RootElement.ValueKind == JsonValueKind.Object
                    && d.RootElement.TryGetProperty("web_project_key", out var k) && k.ValueKind == JsonValueKind.String)
                    key = (k.GetString() ?? "").Trim();
            }
        }
        catch (Exception) { key = ""; } // corrupt settings: unbound, never a guess
        return new ProjectContext { Key = key, IsBound = key.Length > 0 };
    }

#if !SENTINEL_CHECK
    /// <summary>The document's project context. Null and family documents are unbound. API thread only.</summary>
    public static ProjectContext For(Document? doc) =>
        FromSettingsJson(doc is null || doc.IsFamilyDocument ? null : SettingsManager.DocumentJson(doc));
#endif
}
