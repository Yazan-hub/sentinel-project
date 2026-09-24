using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

/// <summary>
/// The ruleset a document is judged by comes from its web project: ruleset@n on the project, else on its
/// office, else the explicit none (cohesion phase 4a). There is no machine file, no bundled copy and no pilot
/// fallback. This half is pure (no Revit, no HTTP) so tools/org-check compiles it; the fetching half —
/// <c>Load</c> / <c>NoneSource</c> — is in RulesetStore.Revit.cs.
/// </summary>
public static partial class RulesetStore
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    /// The explicit "nothing installed" ruleset: no rules, so it scans nothing and scores nothing.
    public static Ruleset None() => new() { StandardKey = "none", Semver = "0.0.0" };

    /// <summary>A ruleset@n body (the raw artefact JSON) → the ruleset the scan uses: a fresh object, so the
    /// "{org}" expansion (OrgNames.Apply, in place) never touches the stored body. Null/empty body → None().
    /// A body that does not parse, or one the scanner cannot walk (a null list the bridge validator lets
    /// through) → None() and <paramref name="error"/> says why, out loud. Never throws.
    /// <paramref name="skipped"/> names the rules dropped because they need an office code and none is set.</summary>
    public static Ruleset FromBody(string? bodyJson, out List<string> skipped, out string? error)
    {
        skipped = new List<string>();
        error = null;
        if (string.IsNullOrWhiteSpace(bodyJson)) return None();
        try
        {
            var rs = JsonSerializer.Deserialize<Ruleset>(bodyJson!, JsonOpts);
            if (rs is null) { error = "the body is null"; return None(); }
            RequireShape(rs);
            skipped = OrgNames.Apply(rs);
            return rs;
        }
        catch (Exception ex)
        {
            skipped = new List<string>();
            error = ex.Message;
            return None();
        }
    }

    // The bridge validator checks id/target/mode only, so "whitelist": null (etc.) installs; C# would then crash
    // in OrgNames.Apply or mid-scan. Refuse it here, naming the field.
    private static void RequireShape(Ruleset rs)
    {
        if (rs.Rules is null) throw new InvalidDataException("'rules' is null");
        if (rs.DocRefs is null) throw new InvalidDataException("'doc_refs' is null");
        if (rs.Org is null) throw new InvalidDataException("'org' is null");
        for (int i = 0; i < rs.Rules.Count; i++)
        {
            var r = rs.Rules[i] ?? throw new InvalidDataException($"rules[{i}] is null");
            var nul = r.Tokens is null ? "tokens" : r.TokenDefs is null ? "token_defs" : r.Whitelist is null ? "whitelist"
                : r.Exclusions is null ? "exclusions" : r.Categories is null ? "categories" : r.Separator is null ? "separator"
                : r.MessageEn is null ? "message_en" : r.Id is null ? "id" : null;
            if (nul is not null) throw new InvalidDataException($"rules[{i}].{nul} is null");
        }
    }
}
