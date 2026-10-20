using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>
/// AI privacy controls (spec 2026-10-20): the office's or project's AI policy the bridge writes in words, and what it means for the
/// add-in's two tools that can send to a model off this PC (Ghost Builder, Photo Massing, the standards document reader). A lock
/// ("AI stays on this network") is read from GET /ai/policy and never overridden by this PC's "Allow a model off this PC"; this PC's own
/// model is never blocked and never asks the bridge. A policy that cannot be read refuses an off-PC model (fail closed). Pure, no Revit
/// types: tools/promote-check proves it. Nothing here is stored — the policy is read each time it matters.
/// </summary>
public static class AiPolicy
{
    /// <summary>What <see cref="LocalOnly.Where"/> answers for a model on this PC.</summary>
    public const string OnThisPc = "on this PC";

    /// <summary>The policy only matters for a model off this PC, on a model bound to a project.</summary>
    public static bool Applies(string modelWhere, string key) => modelWhere != OnThisPc && !string.IsNullOrWhiteSpace(key);

    /// <summary>The body of GET /ai/policy?project=key for <paramref name="key"/>: the lock, the redaction, and the bridge's sentence — or
    /// <c>Error</c> (words, never a guess) when the reply is not that.</summary>
    public static (bool LocalOnly, bool Redact, string Words, string? Error) Parse(string? json, string key)
    {
        try
        {
            using var doc = JsonDocument.Parse(json ?? "");
            if (doc.RootElement.ValueKind != JsonValueKind.Object || !doc.RootElement.TryGetProperty("policies", out var all) || all.ValueKind != JsonValueKind.Object)
                return Bad("the bridge's reply is not an AI policy");
            JsonElement p = default; bool found = false;
            foreach (var kv in all.EnumerateObject())
                if (kv.Name == key || (!found && string.Equals(kv.Name, key, StringComparison.OrdinalIgnoreCase))) { p = kv.Value; found = true; }
            if (!found || p.ValueKind != JsonValueKind.Object) return Bad($"the bridge's reply holds no policy for {key}");
            if (p.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String) return Bad(e.GetString()!); // the bridge's words (not a member, no such project)
            if (!Flag(p, "local_only", out bool lockedToPc) || !Flag(p, "redact", out bool redact))
                return Bad($"the bridge's policy for {key} does not say whether AI stays on this network");
            string words = p.TryGetProperty("words", out var w) && w.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(w.GetString())
                ? w.GetString()!.Trim()
                : lockedToPc ? $"AI stays on this network for {key}." : $"AI is not locked to this network for {key}.";
            return (lockedToPc, redact, words, null);
        }
        catch (JsonException) { return Bad("the bridge's reply is not an AI policy"); }
    }

    private static (bool, bool, string, string?) Bad(string why) => (false, false, "", why);

    private static bool Flag(JsonElement o, string name, out bool value)
    {
        value = false;
        if (!o.TryGetProperty(name, out var v) || (v.ValueKind != JsonValueKind.True && v.ValueKind != JsonValueKind.False)) return false;
        value = v.ValueKind == JsonValueKind.True;
        return true;
    }

    /// <summary>Null when a tool may use a model <paramref name="modelWhere"/> (<see cref="LocalOnly.Where"/>) for project <paramref name="key"/>;
    /// else the words it shows, before anything is read or sent. A model on this PC, or a model bound to no project, is never refused.</summary>
    public static string? OffPcModelRefusal(bool localOnly, string? words, string? policyError, string modelWhere, string key)
    {
        if (!Applies(modelWhere, key)) return null;
        if (policyError != null)
            return $"This model's project's AI policy was not read ({policyError.TrimEnd('.', ' ')}) — Sentinel uses a model off this PC only once the policy is read. "
                 + "This PC's own model still works. Nothing was read or sent.";
        return localOnly
            ? $"{words} Sentinel uses this PC's own model for {key}; \"Allow a model off this PC\" does not override it. Nothing was read or sent."
            : null;
    }

    /// <summary>PC Settings' line for the open model's project, from <see cref="Parse"/>'s answer (or "not bound" when <paramref name="key"/> is
    /// blank); <paramref name="pcOptIn"/> is this PC's "Allow a model off this PC".</summary>
    public static string SettingsLine(string key, (bool LocalOnly, bool Redact, string Words, string? Error) p, bool pcOptIn)
    {
        if (string.IsNullOrWhiteSpace(key))
            return "No Sentinel project is open — the office's AI policy applies once a model bound to a project is open.";
        if (p.Error != null) return $"AI policy not read — {p.Error.TrimEnd('.', ' ')}.";
        return p.Words
             + (p.Redact ? " Names are masked in AI answers (CLIENT_…, PERSON_…)." : "")
             + (p.LocalOnly && pcOptIn ? " The office lock overrides \"Allow a model off this PC\" for this project." : "");
    }
}
