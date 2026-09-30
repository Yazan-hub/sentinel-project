namespace Sentinel.Workflow;

/// <summary>
/// The one ledger row a Heal Loaded Families run writes (cohesion phase 4c; simulation F16: the heal left no ledger
/// row). Pure — no Revit API — so tools/heal-check compiles it. <see cref="FamilyProcessor"/> injects through
/// <see cref="SharedParameterFile"/>, so the row cannot name a file the heal did not use.
/// </summary>
public static class HealRecord
{
    /// <summary>Family names kept per outcome; the totals stay true. A 212-family run is one row, not a 212-name list.</summary>
    public const int MaxNames = 50;

    /// <summary>The scratch shared-parameter file, in the temp folder, where the heal defines each parameter it injects.</summary>
    public const string SharedParameterFile = "Sentinel_SP.txt";

    /// <summary>What the row names as the injected parameters' source: the file by name, never a workstation path.
    /// ASCII only, so the serialized row reads the same everywhere.</summary>
    public const string SharedParameterSource =
        SharedParameterFile + " in the temp folder: a scratch file where the heal defines each missing parameter, not an office shared-parameter file";

    /// <summary>The <c>POST /cde/:key/audit</c> body for one run. <paramref name="healed"/>, <paramref name="human"/>
    /// and <paramref name="failed"/> are family names in scan order; <paramref name="user"/> is the actor, UserSession.Actor.</summary>
    public static object Payload(int scanned, int clean, IReadOnlyList<string> healed, IReadOnlyList<string> human,
                                 IReadOnlyList<string> failed, string user) => new
    {
        entity_type = "family_heal",
        actor = user,
        action = $"Family heal: {healed.Count} healed, {human.Count} for a human, {failed.Count} failed of {scanned}",
        new_value = new
        {
            scanned,
            clean,
            healed = healed.Take(MaxNames).ToArray(),
            human = human.Take(MaxNames).ToArray(),
            failed = failed.Take(MaxNames).ToArray(),
            healed_total = healed.Count,
            human_total = human.Count,
            failed_total = failed.Count,
            // Only a healed family carries definitions from the file: a failed one is closed without saving.
            shared_parameter_source = healed.Count > 0 ? SharedParameterSource : "not named",
            source = "revit",
        },
    };
}
