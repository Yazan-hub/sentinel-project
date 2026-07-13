using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

public enum EnforcementMode { Monitor, Warn, Request, Block }

public enum RuleTarget { View, Sheet, Workset, Family, Level, Grid, Parameter }

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
    [JsonPropertyName("whitelist")] public List<string> Whitelist { get; set; } = new List<string>();
    [JsonPropertyName("exclusions")] public List<string> Exclusions { get; set; } = new List<string>(); // regex, e.g. "^<.*>$", "^\\{3D"
    [JsonPropertyName("parameter_name")] public string? ParameterName { get; set; }     // for Parameter rules
    [JsonPropertyName("categories")] public List<string> Categories { get; set; } = new List<string>(); // family scope (Module 1 amendment)
    [JsonPropertyName("message_en")] public string MessageEn { get; set; } = string.Empty;
    [JsonPropertyName("message_ar")] public string? MessageAr { get; set; }
    [JsonPropertyName("doc_ref")] public string? DocRef { get; set; }                   // "BDS-RTG-001 §5"
}

public sealed class Ruleset
{
    /// Wire-format version (roadmap Rule 2: JSON contracts ARE the API between
    /// the Revit agent and the future TypeScript/OBC core). Bump on breaking change.
    [JsonPropertyName("schema_version")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("standard_key")] public string StandardKey { get; set; } = string.Empty;
    [JsonPropertyName("semver")] public string Semver { get; set; } = string.Empty;
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
