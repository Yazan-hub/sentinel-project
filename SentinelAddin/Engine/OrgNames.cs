using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>
/// Office-code substitution. Sentinel is office-agnostic: the pilot's "BDS" lives in its ruleset@n body
/// ("org"), never in code. Everything here is a pure function of the org string so tools/org-check
/// can pin, without Revit, that org = "BDS" yields exactly the pilot's historical names.
/// When no org is configured, callers must say so (doctor log / Monitor violation) rather than
/// match nothing or everything silently — Configured() is the gate.
/// </summary>
public static class OrgNames
{
    public const string Placeholder = "{org}";

    public static bool Configured(string? org) => !string.IsNullOrWhiteSpace(org);
    public static bool Uses(string? s) => s?.Contains(Placeholder) == true;
    public static string Expand(string template, string org) => template.Replace(Placeholder, org);

    // ── Shared / project parameter names ──────────────────────────────────────────────────────
    public static string ViewStatus(string org)  => Expand("{org}_View Status", org);   // IFC pre-flight, VP-01
    public static string Discipline(string org)  => Expand("{org}_Discipline", org);
    public static string VoidId(string org)      => Expand("{org}_Void_ID", org);
    public static string VoidStatus(string org)  => Expand("{org}_Void_Status", org);
    public static string Description(string org) => Expand("{org}_Description", org);   // library family gate
    public static string Pset(string org)        => Expand("Pset_{org}", org);          // IDS-facing pset

    /// Browser-routing candidates (ViewGenerator): office names first, generic names after.
    /// With no org the office entries drop out and only the generic candidates remain.
    public static string[] MainGroupParams(string org)   => Candidates(org, "{org}_View Status", "View_Group", "{org}_Discipline", "View Group");
    public static string[] SubGroupParams(string org)    => Candidates(org, "{org}_View Type", "{org}_Sub-Discipline", "View_SubGroup", "Sub Discipline");
    public static string[] SubSubGroupParams(string org) => Candidates(org, "{org}_View Sub Type", "View_Detail_Group");
    /// IDS extraction candidates (GovernedElementExtractor).
    public static string[] DisciplineParams(string org)  => Candidates(org, "{org}_Discipline", "Discipline");
    public static string[] UValueParams(string org)      => Candidates(org, "ThermalTransmittance", "U-Value", "Heat Transfer Coefficient (U)", "{org}_UValue");

    public static string[] Candidates(string org, params string[] templates) =>
        Configured(org) ? templates.Select(t => Expand(t, org)).ToArray()
                        : templates.Where(t => !Uses(t)).ToArray();

    // ── CDE central-file convention: {org}_[ProjectCode]_[ProjectName].rvt ────────────────────
    public static string CentralFilePattern(string org) => "^" + Regex.Escape(org) + @"_[A-Z0-9]{4,10}_[\w \-]+$";
    public static string CentralFileHint(string org) => Expand("{org}_[ProjectCode]_[ProjectName]", org);

    public static string GhostEventName(string org) =>
        Configured(org) ? org + " Ghost Builder - Placement" : "Ghost Builder - Placement";

    /// A cited office standard by role ("rtg", "bep"), or null when the ruleset does not name one.
    public static string? DocRef(Ruleset? rs, string key) =>
        rs is not null && rs.DocRefs.TryGetValue(key, out var v) && !Uses(v) ? v : null;

    /// <summary>Expands every "{org}" in the ruleset in place (token defs regex-escaped). With no org
    /// configured, rules and doc refs that need one are REMOVED — a literal "{org}" would be an invalid
    /// regex / a parameter that matches nothing — and their ids are returned so the caller can say so.</summary>
    public static List<string> Apply(Ruleset rs)
    {
        var org = rs.Org ?? string.Empty;
        var skipped = new List<string>();
        if (Configured(org))
        {
            foreach (var k in rs.DocRefs.Keys.ToList()) rs.DocRefs[k] = Expand(rs.DocRefs[k], org);
            foreach (var r in rs.Rules)
            {
                foreach (var k in r.TokenDefs.Keys.ToList()) r.TokenDefs[k] = Expand(r.TokenDefs[k], Regex.Escape(org));
                if (r.ParameterName is not null) r.ParameterName = Expand(r.ParameterName, org);
                r.MessageEn = Expand(r.MessageEn, org);
                if (r.MessageAr is not null) r.MessageAr = Expand(r.MessageAr, org);
                if (r.DocRef is not null) r.DocRef = Expand(r.DocRef, org);
            }
            return skipped;
        }
        foreach (var k in rs.DocRefs.Keys.Where(k => Uses(rs.DocRefs[k])).ToList()) rs.DocRefs.Remove(k);
        rs.Rules.RemoveAll(r =>
        {
            bool needs = r.TokenDefs.Values.Any(Uses) || Uses(r.ParameterName) || Uses(r.MessageEn) || Uses(r.MessageAr) || Uses(r.DocRef);
            if (needs) skipped.Add(r.Id);
            return needs;
        });
        return skipped;
    }
}
