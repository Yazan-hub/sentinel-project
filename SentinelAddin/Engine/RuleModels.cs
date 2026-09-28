using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

public enum EnforcementMode { Monitor, Warn, Request, Block }

public enum RuleTarget { View, Sheet, Workset, Family, Level, Grid, Parameter, Type }

/// <summary>Token-based JSON rule (Decision 9): no raw regex in authored rules;
/// tokens compile to regex internally. Bilingual messages.</summary>
public sealed class Rule
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;            // "VN-01"
    [JsonPropertyName("target")] public RuleTarget Target { get; set; }
    [JsonPropertyName("mode")] public EnforcementMode Mode { get; set; }
    [JsonPropertyName("tokens")] public List<string> Tokens { get; set; } = new List<string>(); // ["PREFIX","TYPE","LEVEL","DESC"]
    [JsonPropertyName("token_defs")] public Dictionary<string, string> TokenDefs { get; set; } = new Dictionary<string, string>();
    [JsonPropertyName("separator")] public string Separator { get; set; } = "_";
    /// <summary>Per token, words a name may carry → the code the standard wants ("GYPSUM" → "GYP"). Optional; the
    /// office's own list, never a literal in code.</summary>
    [JsonPropertyName("token_aliases")] public Dictionary<string, Dictionary<string, string>>? TokenAliases { get; set; }
    /// <summary>Per token, where a value the name lacks may be read from the model: a type parameter's value
    /// ("Function": {"Exterior": "EXT"}) or the category ("Ceilings": "INT"). Optional; the office's own map.</summary>
    [JsonPropertyName("token_infer")] public Dictionary<string, TokenInfer>? TokenInfer { get; set; }
    [JsonPropertyName("whitelist")] public List<string> Whitelist { get; set; } = new List<string>();
    [JsonPropertyName("exclusions")] public List<string> Exclusions { get; set; } = new List<string>(); // regex, e.g. "^<.*>$", "^\\{3D"
    [JsonPropertyName("parameter_name")] public string? ParameterName { get; set; }     // for Parameter rules
    [JsonPropertyName("categories")] public List<string> Categories { get; set; } = new List<string>(); // family scope (Module 1 amendment)
    [JsonPropertyName("message_en")] public string MessageEn { get; set; } = string.Empty;
    [JsonPropertyName("message_ar")] public string? MessageAr { get; set; }
    [JsonPropertyName("doc_ref")] public string? DocRef { get; set; }                   // "{org}-RTG-001 §5"
}

public sealed class TokenInfer
{
    [JsonPropertyName("by_parameter")] public Dictionary<string, Dictionary<string, string>>? ByParameter { get; set; } // parameter → value → token value
    [JsonPropertyName("by_category")] public Dictionary<string, string>? ByCategory { get; set; }                       // category → token value
}

public sealed class Ruleset
{
    /// Wire-format version (roadmap Rule 2: JSON contracts ARE the API between
    /// the Revit agent and the future TypeScript/OBC core). Bump on breaking change.
    [JsonPropertyName("schema_version")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("standard_key")] public string StandardKey { get; set; } = string.Empty;
    [JsonPropertyName("semver")] public string Semver { get; set; } = string.Empty;
    /// The office code ("BDS" for the pilot; "XXX" in templates). The ONE place an office name lives: rules
    /// reference it as "{org}" in token defs, parameter names, messages and doc refs. OrgNames.Apply expands it
    /// once at load (rules that need an org are dropped LOUDLY when none is configured); RuleRegex and the
    /// naming proposer accept either the placeholder or the expanded literal. Sentinel never hardcodes an office.
    [JsonPropertyName("org")] public string Org { get; set; } = string.Empty;
    /// Office standards the code-side checks cite, keyed by role ("rtg", "bep"); values may use "{org}".
    [JsonPropertyName("doc_refs")] public Dictionary<string, string> DocRefs { get; set; } = new Dictionary<string, string>();
    [JsonPropertyName("rules")] public List<Rule> Rules { get; set; } = new List<Rule>();
}

public sealed class Violation
{
    public Violation(string ruleId, EnforcementMode mode, long elementId, string elementName, string messageEn, string? messageAr, string? docRef)
    {
        RuleId = ruleId;
        Mode = mode;
        ElementId = elementId;
        ElementName = elementName;
        MessageEn = messageEn;
        MessageAr = messageAr;
        DocRef = docRef;
    }

    public string RuleId { get; }
    public EnforcementMode Mode { get; }
    public long ElementId { get; }
    public string ElementName { get; }
    public string MessageEn { get; }
    public string? MessageAr { get; }
    public string? DocRef { get; }
}

public sealed class ScanReport
{
    public ScanReport(string docTitle, DateTimeOffset at, long durationMs, int elementsChecked, IReadOnlyList<Violation> violations)
    {
        DocTitle = docTitle;
        At = at;
        DurationMs = durationMs;
        ElementsChecked = elementsChecked;
        Violations = violations;
    }

    public string DocTitle { get; }
    public DateTimeOffset At { get; }
    public long DurationMs { get; }
    public int ElementsChecked { get; }
    public IReadOnlyList<Violation> Violations { get; }

    /// The ruleset that judged these rows (null for a report no ruleset judged, e.g. IFC pre-flight) and its
    /// artefact identity — what the scan report tells the bridge (ruleset_ref / ruleset_sha256).
    public Ruleset? Ruleset { get; set; }
    public string? RulesetRef { get; set; }
    public string? RulesetSha256 { get; set; }
    /// Set when no rule judged the document (ruleset none, or every rule dropped): the line shown INSTEAD of a
    /// score and a grade — "none — not installed for aster-villa or its office". Score must not be read then.
    public string? NotScored { get; set; }

    /// The same report — same ruleset identity — with one more violation from a check outside the ruleset
    /// (CDE-01 at sync); <paramref name="counted"/> false keeps it out of ElementsChecked (a Monitor note).
    public ScanReport Plus(Violation extra, bool counted = true) =>
        new(DocTitle, At, DurationMs, ElementsChecked + (counted ? 1 : 0), new List<Violation>(Violations) { extra })
        { Ruleset = Ruleset, RulesetRef = RulesetRef, RulesetSha256 = RulesetSha256, NotScored = NotScored };

    /// Monitor-mode findings are informational and excluded from the score
    /// (HealthScorecard still counts them at low weight for the PM view).
    public double Score
    {
        get
        {
            if (ElementsChecked == 0) return 100;
            int scored = Violations.Count(v => v.Mode != EnforcementMode.Monitor);
            return Math.Max(0, 100.0 * (ElementsChecked - scored) / ElementsChecked);
        }
    }
}
