#nullable disable
// P1 (GhostBuilder v2): deterministic-first layer mapping driven by the BDS DWG Layer Standard
// (bds-layers.json) instead of hardcoded heuristics. Mirrors WebApp/src/sentinel-core/layers.ts —
// whose test suite (layers.test.ts) is the CONFORMANCE REFERENCE for this port. Compliant layers map
// here with NO model call (confidence 1); only genuine gaps fall through to the local LLM. Pure C#,
// no Revit API, so it stays safe to run off the API thread like the LayerMapper that uses it.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    public sealed class LayerRulesetMatcher
    {
        // ---- ruleset model (the subset of bds-layers.json this pass needs) ----
        private sealed class Ruleset
        {
            [JsonPropertyName("standard")] public string Standard { get; set; }
            [JsonPropertyName("enforce")]  public string Enforce  { get; set; } = "warn";
            [JsonPropertyName("ignore")]   public List<string> Ignore { get; set; } = new();
            [JsonPropertyName("layers")]   public List<LayerDef> Layers { get; set; } = new();
        }
        private sealed class LayerDef
        {
            [JsonPropertyName("layer")]    public string Layer { get; set; }
            [JsonPropertyName("category")] public string Category { get; set; }
            [JsonPropertyName("family")]   public string Family { get; set; }
            [JsonPropertyName("aliases")]  public List<string> Aliases { get; set; } = new();
        }

        private readonly Ruleset _rs;
        private readonly List<Regex> _ignoreGlobs;
        private readonly Dictionary<string, LayerDef> _byExact;
        private readonly Dictionary<string, LayerDef> _byAlias;

        public string StandardName => string.IsNullOrWhiteSpace(_rs?.Standard) ? "(built-in fallback)" : _rs.Standard;

        private LayerRulesetMatcher(Ruleset rs)
        {
            _rs = rs ?? new Ruleset();
            _ignoreGlobs = (_rs.Ignore ?? new List<string>()).Select(GlobToRegex).Where(r => r != null).ToList();
            _byExact = new Dictionary<string, LayerDef>(StringComparer.OrdinalIgnoreCase);
            _byAlias = new Dictionary<string, LayerDef>(StringComparer.OrdinalIgnoreCase);
            foreach (var l in _rs.Layers ?? new List<LayerDef>())
            {
                if (string.IsNullOrWhiteSpace(l?.Layer)) continue;
                _byExact[Norm(l.Layer)] = l;
                foreach (var a in l.Aliases ?? new List<string>())
                    if (!string.IsNullOrWhiteSpace(a)) _byAlias[Norm(a)] = l;
            }
        }

        /// <summary>Load from an explicit path, else %AppData%\Sentinel\bds-layers.json, else the
        /// Resources copy shipped beside the DLL, else a built-in default. Never throws.</summary>
        public static LayerRulesetMatcher Load(string explicitPath = null)
        {
            foreach (var path in CandidatePaths(explicitPath))
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
                    {
                        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(path));
                        if (rs != null) return new LayerRulesetMatcher(rs);
                    }
                }
                catch { /* corrupt/unreadable -> try the next candidate */ }
            }
            return new LayerRulesetMatcher(BuiltInDefault());
        }

        private static IEnumerable<string> CandidatePaths(string explicitPath)
        {
            if (!string.IsNullOrWhiteSpace(explicitPath)) yield return explicitPath;
            yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                      "Sentinel", "bds-layers.json");
            var dll = Path.GetDirectoryName(typeof(LayerRulesetMatcher).Assembly.Location);
            if (!string.IsNullOrEmpty(dll)) yield return Path.Combine(dll, "Resources", "bds-layers.json");
        }

        // ---- public API (mirrors layers.ts, minus what placement doesn't consume) ----

        /// <summary>A non-model layer (annotation/system) that must never become geometry. The ruleset's
        /// ignore globs are UNIONed with a built-in token safety net, so this is never less aggressive
        /// than the pre-P1 hardcoded filter.</summary>
        public bool ShouldIgnore(string layer)
        {
            if (string.IsNullOrWhiteSpace(layer)) return true;
            string n = Norm(layer);
            foreach (var rx in _ignoreGlobs) if (rx.IsMatch(n)) return true;
            if (n == "0" || n == "DEFPOINTS") return true;
            foreach (var t in BuiltInIgnoreTokens) if (n.Contains(t)) return true;
            return false;
        }

        /// <summary>Deterministically map a layer to a LayerMapping, or null if it needs the model.
        /// Confidence: 1 exact · .95 alias · .7 standard-format parse · .75 keyword fallback.</summary>
        public LayerMapping Match(string layer)
        {
            if (string.IsNullOrWhiteSpace(layer)) return null;
            string n = Norm(layer);

            if (_byExact.TryGetValue(n, out var ex)) return Map(layer, ex.Category, ex.Family, 1.0);
            if (_byAlias.TryGetValue(n, out var al)) return Map(layer, al.Category, al.Family, 0.95);

            // standard-format parse: D-MAJR-MINR -> category
            var parts = n.Split('-');
            if (parts.Length >= 2 && parts[0].Length == 1 &&
                MajorCategory.TryGetValue(parts[1], out var cat) && cat != null && cat != "(extension)")
                return Map(layer, cat, GenericFamily(cat), 0.7);

            // keyword fallback (preserves the pre-P1 heuristics as a safety net)
            foreach (var rule in KeywordRules)
                if (n.Contains(rule.Token)) return Map(layer, rule.Category, rule.Family, 0.75);

            return null; // unknown -> hand to the LLM tier
        }

        // ---- internals ----
        private static LayerMapping Map(string layer, string category, string family, double conf) =>
            string.IsNullOrEmpty(category) || category == "(extension)"
                ? null
                : new LayerMapping
                {
                    CadLayer = layer,
                    Category = category,
                    BdsFamily = string.IsNullOrWhiteSpace(family) ? GenericFamily(category) : family,
                    Confidence = conf,
                };

        private static string Norm(string s) => (s ?? "").Trim().ToUpperInvariant();

        private static Regex GlobToRegex(string glob)
        {
            try
            {
                var rx = string.Join(".*", glob.ToUpperInvariant().Split('*').Select(Regex.Escape));
                return new Regex("^" + rx + "$", RegexOptions.CultureInvariant);
            }
            catch { return null; }
        }

        private static readonly Dictionary<string, string> MajorCategory = new(StringComparer.OrdinalIgnoreCase)
        {
            ["WALL"] = "Walls", ["DOOR"] = "Doors", ["WIND"] = "Windows", ["GLAZ"] = "Windows",
            ["FLOR"] = "Floors", ["SLAB"] = "Floors", ["CLNG"] = "Ceilings", ["COLS"] = "Columns",
            ["FURN"] = "Furniture", ["EQPM"] = "Furniture",
            ["BEAM"] = "(extension)", ["STRS"] = "(extension)", ["ROOF"] = "(extension)",
            ["DUCT"] = "(extension)", ["PIPE"] = "(extension)",
        };

        // Kept from the pre-P1 LayerMapper so a missing/partial ruleset is never worse than before.
        private static readonly (string Token, string Category, string Family)[] KeywordRules =
        {
            ("PARTITION", "Walls", "Generic Wall"), ("WALL", "Walls", "Generic Wall"),
            ("DOOR", "Doors", "Generic Door"),
            ("WINDOW", "Windows", "Generic Window"), ("GLAZ", "Windows", "Generic Window"), ("GLASS", "Windows", "Generic Window"),
            ("SLAB", "Floors", "Generic Floor"), ("FLOOR", "Floors", "Generic Floor"), ("FLOR", "Floors", "Generic Floor"),
            ("CEILING", "Ceilings", "Generic Ceiling"), ("CEIL", "Ceilings", "Generic Ceiling"), ("CLNG", "Ceilings", "Generic Ceiling"), ("RCP", "Ceilings", "Generic Ceiling"),
            ("COLUMN", "Columns", "Generic Column"), ("COL", "Columns", "Generic Column"),
            ("FURN", "Furniture", "Generic Furniture"), ("CASEWORK", "Furniture", "Generic Furniture"), ("EQUIP", "Furniture", "Generic Furniture"),
        };

        private static readonly string[] BuiltInIgnoreTokens =
        {
            "ANNO", "TEXT", "DIM", "NOTE", "TAG", "LEADER", "SYMBOL", "LEGEND",
            "TITLE", "REVCLOUD", "MATCHLINE", "GRID", "VIEWPORT", "VPORT", "WIPEOUT", "NPLT",
            "HATCH", "AREA",
        };

        private static string GenericFamily(string category) => category switch
        {
            "Walls" => "Generic Wall",
            "Doors" => "Generic Door",
            "Windows" => "Generic Window",
            "Floors" => "Generic Floor",
            "Ceilings" => "Generic Ceiling",
            "Columns" => "Generic Column",
            "Furniture" => "Generic Furniture",
            _ => "Generic Model",
        };

        private static Ruleset BuiltInDefault() => new Ruleset
        {
            Standard = "built-in fallback",
            Ignore = new List<string>(), // BuiltInIgnoreTokens covers the ignore net; KeywordRules cover mapping
            Layers = new List<LayerDef>(),
        };
    }
}
