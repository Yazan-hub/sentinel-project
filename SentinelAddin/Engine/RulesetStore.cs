using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

/// <summary>
/// Offline-first ruleset access (Decision: add-in works offline).
/// Order: %ProgramData% deployed cache -> per-user cache -> embedded fallback.
/// Phase 3 adds backend sync writing into the per-user cache.
/// </summary>
public static class RulesetStore
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    public static string UserCachePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Sentinel", "ruleset.json");

    public static string DeployedPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Sentinel", "ruleset.json");

    /// Ruleset shipped alongside the add-in DLL (deployed by build.ps1).
    public static string BundledPath => Path.Combine(
        Path.GetDirectoryName(typeof(RulesetStore).Assembly.Location)!,
        "Resources", "ruleset.json");

    /// <summary>Resolution chain, highest priority first:
    /// 1. Configured master ruleset (SettingsManager: project ES -> machine JSON)
    /// 2. User cache -> ProgramData -> bundled -> embedded fallback.</summary>
    public static Ruleset LoadEffective(Autodesk.Revit.DB.Document? doc = null)
    {
        var configured = SettingsManager.Resolve(doc).MasterRulesetPath;
        var chain = string.IsNullOrWhiteSpace(configured)
            ? new[] { UserCachePath, DeployedPath, BundledPath }
            : new[] { configured, UserCachePath, DeployedPath, BundledPath };
        foreach (var path in chain)
        {
            if (!File.Exists(path)) continue;
            try
            {
                var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(path), JsonOpts);
                if (rs is not null) return rs;
            }
            catch (JsonException) { /* fall through to next source */ }
        }
        return EmbeddedFallback();
    }

    /// Minimal safety net so the add-in never starts rule-less.
    private static Ruleset EmbeddedFallback() => new()
    {
        StandardKey = "bds-rtg-001",
        Semver = "0.0.0-fallback",
        Rules =
        [
            new Rule
            {
                Id = "WS-01", Target = RuleTarget.Workset, Mode = EnforcementMode.Warn,
                Whitelist =
                [
                    "ARC_Sheets","ARC_Walls","ARC_Floors","ARC_Facade","ARC_Doors","ARC_Furniture",
                    "ARC_Interior","ARC_Links","INT_Walls","INT_Floors","INT_Ceilings",
                    "Shared_Levels & Grids Model","XX_Landscape","XX_MEP Modell","XX_STR Model"
                ],
                MessageEn = "Workset '{name}' is not in the BDS 15-name whitelist.",
                MessageAr = "مجموعة العمل '{name}' غير مدرجة في قائمة BDS المعتمدة.",
                DocRef = "BDS-RTG-001 §3.1"
            },
            new Rule
            {
                Id = "VP-01", Target = RuleTarget.Parameter, Mode = EnforcementMode.Warn,
                ParameterName = "BDS_View Status",
                Exclusions = [@"^<.*>$", @"^\{3D"],
                MessageEn = "View '{name}': 'BDS_View Status' is empty.",
                MessageAr = "العرض '{name}': حقل 'BDS_View Status' فارغ.",
                DocRef = "BDS-RTG-001 §4.2"
            },
        ],
    };
}
