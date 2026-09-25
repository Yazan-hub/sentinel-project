using Sentinel.Coordination;

namespace Sentinel.Engine;

/// The fetching half of RulesetStore: a project key → that project's ruleset@n. Kept out of RulesetStore.cs so
/// tools/org-check compiles the pure half without the bridge client. There is deliberately no blocking
/// LoadFor(Document): the only entry point is <see cref="Load"/>, run off the UI thread (App.ReloadRuleset).
public static partial class RulesetStore
{
    /// <summary>The project's ruleset@n (project → office), org-expanded on a fresh copy, or the explicit none (an
    /// empty key is "not bound"). BLOCKING (the artefact GET, ≤ 4 s): background task only. No Revit API, never
    /// throws. <c>Note</c> is a Doctor-log line (rules skipped for a missing org, a body that did not parse) —
    /// the caller logs it on the API thread.</summary>
    public static (Ruleset Ruleset, ResolvedArtefact Source, string? Note) Load(string projectKey)
    {
        try
        {
            var src = ArtefactClient.Resolve(projectKey, "ruleset");
            if (src.Origin == "none") return (None(), src, null);

            var rs = FromBody(src.BodyJson, out var skipped, out var error);
            if (error is not null)
            {
                var why = $"{src.Label} did not parse: {error}";
                return (rs, NoneSource(why), "Ruleset " + why + " — nothing is scored until it is fixed on the web.");
            }
            return (rs, src, skipped.Count == 0 ? null
                : $"Ruleset {src.Label}: no office code ('org' is empty) — {skipped.Count} rule(s) that need one skipped: {string.Join(", ", skipped)}");
        }
        catch (Exception ex)
        {
            var why = "the ruleset could not be loaded (" + ex.Message + ")";
            return (None(), NoneSource(why), "Ruleset: " + why + " — nothing is scored; Scan Now retries.");
        }
    }

    /// A "none" source with its reason; its label is what every surface prints ("none — <reason>").
    public static ResolvedArtefact NoneSource(string reason) =>
        new() { Kind = "ruleset", Origin = "none", Reason = reason, Label = "none — " + reason };
}
