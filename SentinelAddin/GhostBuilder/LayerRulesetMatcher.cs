// Ghost Builder's deterministic layer mapping (P1), driven by the project's layers@n (cohesion phase 4b-2). Exact and
// alias rows mirror WebApp/src/sentinel-core/layers.ts, whose suite (layers.test.ts) is the conformance reference;
// extensions, params, requires, disciplines and enforce stay in the body unread (spec 4b "Out of scope"). The AIA
// discipline-major parse and the keyword list are generic heuristics kept as a safety net and labelled
// "heuristic" — never "standard", never pre-ticked. No file on the machine, beside the DLL or in code stands in
// for a standard: with none installed, HeuristicsOnly() maps. Pure C#, no Revit API, safe off the API thread like
// the LayerMapper that uses it.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    public sealed class LayerRulesetMatcher
    {
        private sealed class LayerDef
        {
            public string Layer = "", Category = "";
            public string? Family;
        }

        private readonly List<Regex> _ignoreGlobs = new();
        private readonly Dictionary<string, LayerDef> _byExact = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, LayerDef> _byAlias = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>The sha256 of the layers@n body this matcher reads — GhostStandards sets it; null for
        /// <see cref="HeuristicsOnly"/>. LayerMapper stamps its per-project cache with it.</summary>
        public string? Sha { get; set; }

        /// <summary>False for <see cref="HeuristicsOnly"/>: nothing installed, so no row maps as "standard".</summary>
        public bool HasStandard => _byExact.Count > 0;

        private LayerRulesetMatcher() { }

        /// <summary>No layers@n for the project (or one that did not parse): the built-in ignore net and the labelled
        /// AIA heuristics only. Nothing it maps is a standard.</summary>
        public static LayerRulesetMatcher HeuristicsOnly() => new LayerRulesetMatcher();

        private static readonly string[] Categories = { "Walls", "Floors", "Ceilings", "Doors", "Windows", "Columns", "Furniture" };

        /// <summary>A layers@n body (the raw artefact JSON) → the matcher, or null with <paramref name="error"/> naming the
        /// field ("layers[3].category must be Walls | …"), by the bridge validator's rules (spec 2026-09-25-standards-4b
        /// decision 4): standard non-empty; layers a non-empty array of {layer non-empty, category one of the seven,
        /// family? string, aliases? string[]}; ignore? string[]. Optional means absent or null. Unknown fields are
        /// ignored. Never throws.</summary>
        public static LayerRulesetMatcher? FromBody(string? json, out string? error)
        {
            error = null;
            if (string.IsNullOrWhiteSpace(json)) { error = "the body is empty"; return null; }
            try
            {
                using var doc = JsonDocument.Parse(json!);
                var b = doc.RootElement;
                if (b.ValueKind == JsonValueKind.Null) throw new InvalidDataException("the body is null");
                if (b.ValueKind != JsonValueKind.Object) throw new InvalidDataException("the body must be a JSON object");
                if (!b.TryGetProperty("standard", out var standard) || !Filled(standard)) throw Bad("standard", "must be a non-empty string");
                if (!b.TryGetProperty("layers", out var rows) || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() == 0)
                    throw Bad("layers", "must be a non-empty array");

                var m = new LayerRulesetMatcher();
                int i = 0;
                foreach (var r in rows.EnumerateArray())
                {
                    var at = $"layers[{i++}]";
                    if (r.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                    if (!r.TryGetProperty("layer", out var layer) || !Filled(layer)) throw Bad(at + ".layer", "must be a non-empty string");
                    if (!r.TryGetProperty("category", out var category) || category.ValueKind != JsonValueKind.String || Array.IndexOf(Categories, category.GetString()) < 0)
                        throw Bad(at + ".category", "must be " + string.Join(" | ", Categories));
                    var family = Optional(r, "family");
                    if (family is { } f && f.ValueKind != JsonValueKind.String) throw Bad(at + ".family", "must be a string");
                    var aliases = Optional(r, "aliases");
                    if (aliases is { } a && !Strings(a)) throw Bad(at + ".aliases", "must be an array of strings");

                    var def = new LayerDef { Layer = layer.GetString()!, Category = category.GetString()!, Family = family?.GetString() };
                    m._byExact[Norm(def.Layer)] = def;
                    if (aliases is { } list)
                        foreach (var alias in list.EnumerateArray())
                            if (!string.IsNullOrWhiteSpace(alias.GetString())) m._byAlias[Norm(alias.GetString()!)] = def;
                }
                if (Optional(b, "ignore") is { } ignore)
                {
                    if (!Strings(ignore)) throw Bad("ignore", "must be an array of strings");
                    foreach (var glob in ignore.EnumerateArray())
                        if (GlobToRegex(glob.GetString()!) is { } rx) m._ignoreGlobs.Add(rx);
                }
                return m;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return null;
            }
        }

        // ---- public API (mirrors layers.ts, minus what placement doesn't consume) ----

        /// <summary>A non-model layer (annotation/system) that must never become geometry. The standard's ignore
        /// globs are UNIONed with a built-in token safety net, so this is never less aggressive than the pre-P1
        /// hardcoded filter — with or without a standard.</summary>
        public bool ShouldIgnore(string layer)
        {
            if (string.IsNullOrWhiteSpace(layer)) return true;
            string n = Norm(layer);
            foreach (var rx in _ignoreGlobs) if (rx.IsMatch(n)) return true;
            if (n == "0" || n == "DEFPOINTS") return true;
            foreach (var t in BuiltInIgnoreTokens) if (n.Contains(t)) return true;
            return false;
        }

        /// <summary>A layer → its mapping, or null when only the local model can say. Source "standard": the installed
        /// layers@n's exact row (confidence 1) or alias (.95). Source "heuristic": the AIA discipline-major parse (.7)
        /// or a keyword (.75) — a guess, labelled as one, never pre-ticked.</summary>
        public LayerMapping? Match(string layer)
        {
            if (string.IsNullOrWhiteSpace(layer)) return null;
            string n = Norm(layer);

            if (_byExact.TryGetValue(n, out var ex)) return Map(layer, ex.Category, ex.Family, 1.0, "standard", "layers standard: " + ex.Layer);
            if (_byAlias.TryGetValue(n, out var al)) return Map(layer, al.Category, al.Family, 0.95, "standard", "layers standard: alias of " + al.Layer);

            // D-MAJR-MINR parse -> category (generic AIA, not an office standard)
            var parts = n.Split('-');
            if (parts.Length >= 2 && parts[0].Length == 1 &&
                MajorCategory.TryGetValue(parts[1], out var cat) && cat != "(extension)")
                return Map(layer, cat, null, 0.7, "heuristic", $"heuristic: the AIA major '{parts[1]}' reads as {cat} — not a row of an installed layers standard");

            // keyword fallback (the pre-P1 heuristics, kept as a safety net)
            foreach (var rule in KeywordRules)
                if (n.Contains(rule.Token))
                    return Map(layer, rule.Category, rule.Family, 0.75, "heuristic", $"heuristic: the name contains '{rule.Token}' — not a row of an installed layers standard");

            return null; // unknown -> the local model
        }

        // ---- internals ----
        private static LayerMapping Map(string layer, string category, string? family, double conf, string source, string why) => new LayerMapping
        {
            CadLayer = layer,
            Category = category,
            BdsFamily = string.IsNullOrWhiteSpace(family) ? GenericFamily(category) : family,
            Confidence = conf,
            Source = source,
            Rationale = why,
        };

        private static string Norm(string s) => (s ?? "").Trim().ToUpperInvariant();

        private static InvalidDataException Bad(string path, string want) => new InvalidDataException($"{path} {want}");

        // "Optional" means absent or null, as the bridge validator reads it.
        private static JsonElement? Optional(JsonElement o, string name) =>
            o.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v : (JsonElement?)null;

        private static bool Strings(JsonElement v) =>
            v.ValueKind == JsonValueKind.Array && v.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String);

        // Blank as the bridge's filled() reads it: char.IsWhiteSpace plus U+FEFF (DeliveryContract.Text's rule).
        private static bool Filled(JsonElement v) =>
            v.ValueKind == JsonValueKind.String && v.GetString()!.Any(ch => !char.IsWhiteSpace(ch) && ch != '﻿');

        private static Regex? GlobToRegex(string glob)
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

        // Kept from the pre-P1 LayerMapper as a safety net; every hit is labelled heuristic.
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
    }
}
