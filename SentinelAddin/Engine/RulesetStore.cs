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
                if (rs is not null) return Resolve(rs);
            }
            catch (JsonException) { /* fall through to next source */ }
        }
        return Resolve(EmbeddedFallback());
    }

    /// Expand "{org}" once at load; rules that need an office when none is configured are dropped LOUDLY.
    private static Ruleset Resolve(Ruleset rs)
    {
        var skipped = OrgNames.Apply(rs);
        if (skipped.Count > 0)
            App.PanelVm?.LogDoctor("Ruleset: no office code configured ('org' is empty) — " +
                skipped.Count + " rule(s) that need one skipped: " + string.Join(", ", skipped));
        return rs;
    }

    /// Safety net so the add-in never starts rule-less: the shipped Resources/ruleset.json, compiled
    /// into the DLL (csproj EmbeddedResource). It is the pilot's ruleset by design — a reference
    /// profile, not a fixed standard — and keeping it as DATA means the office code lives in one
    /// place; a neutral "XXX" ruleset would flag every workset and view in every office instead.
    private static Ruleset EmbeddedFallback()
    {
        using var stream = typeof(RulesetStore).Assembly.GetManifestResourceStream("ruleset.json");
        var rs = stream is null ? null : JsonSerializer.Deserialize<Ruleset>(stream, JsonOpts);
        return rs ?? new Ruleset { StandardKey = "none", Semver = "0.0.0-fallback" };
    }
}
