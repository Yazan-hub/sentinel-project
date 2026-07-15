using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.Standards;

/// <summary>
/// ISO 19650 gap analysis (docs/standards-engine-spec.md — the report's #2 deferred item). Scores a
/// <see cref="StandardsPack"/> — the office standard Sentinel extracted/ingested — against the
/// fundamentals ISO 19650-2 expects an information standard to define, and reports what is PRESENT,
/// PARTIAL (looks related, needs confirmation) or MISSING. Pure logic (no Revit API), so it runs on
/// any thread and is unit-testable. It grades the STANDARD, not a specific model — a complementary
/// live-model gate is a separate slice.
///
/// Honesty: a parameter is only ever PARTIAL on a name match — a pack can't prove the parameter
/// actually carries ISO codes (S0–S7, revision, Uniclass), so we prompt the reviewer to confirm
/// rather than claim compliance we can't verify.
/// </summary>
public static class IsoGapAnalyzer
{
    public static IsoGapReport Analyze(StandardsPack pack)
    {
        var p = pack.Provision;
        var checks = new List<IsoCheck>
        {
            ContainerNaming(p),
            ParamCheck(p, "suitability-code", "Suitability / status code",
                new[] { "status", "suitab" },
                "the S0–S7 / A-B-C suitability code", "ISO 19650-2 §5.1 status code"),
            ParamCheck(p, "revision-code", "Revision code",
                new[] { "revision" },
                "the revision code (P01, C01…)", "ISO 19650-2 §5.1 revision"),
            ParamCheck(p, "classification", "Classification (Uniclass 2015)",
                new[] { "classif", "uniclass" },
                "a classification code", "ISO 19650 · Uniclass 2015"),
            ParamCheck(p, "originator", "Originator / author metadata",
                new[] { "originator", "author", "producer" },
                "the information originator", "ISO 19650-2 §5.1 originator"),
            Worksets(p),
        };
        return new IsoGapReport(checks);
    }

    // ISO 19650-2 information-container identification: Project-Originator-Volume-Level-Type-Role-Number.
    private static IsoCheck ContainerNaming(ProvisionSet p)
    {
        var container = p.NamingRules.FirstOrDefault(n => IsSheetOrView(n.Target) && n.Tokens.Count >= 4);
        if (container != null)
            return new IsoCheck("container-naming", "Container naming convention", IsoStatus.Present,
                $"{container.Target} rule {container.Id} — {container.Pattern}", "ISO 19650-2 §container ID");
        if (p.NamingRules.Count > 0)
            return new IsoCheck("container-naming", "Container naming convention", IsoStatus.Partial,
                "naming rules exist but none for Sheets/Views with ≥4 fields (the container ID has 7)", "ISO 19650-2 §container ID");
        return new IsoCheck("container-naming", "Container naming convention", IsoStatus.Missing,
            "no container naming rule (Project-Originator-Volume-Level-Type-Role-Number)", "ISO 19650-2 §container ID");
    }

    private static IsoCheck Worksets(ProvisionSet p) =>
        p.Worksets.Count > 0
            ? new IsoCheck("worksets", "Federation-ready worksets", IsoStatus.Present,
                $"{p.Worksets.Count} workset(s) defined", "ISO 19650 · information structure")
            : new IsoCheck("worksets", "Federation-ready worksets", IsoStatus.Missing,
                "no worksets — spatial/discipline containers undefined", "ISO 19650 · information structure");

    private static IsoCheck ParamCheck(ProvisionSet p, string key, string title, string[] needles, string want, string clause)
    {
        var hit = p.SharedParameters.FirstOrDefault(sp =>
            needles.Any(n => sp.Name.IndexOf(n, StringComparison.OrdinalIgnoreCase) >= 0));
        return hit != null
            ? new IsoCheck(key, title, IsoStatus.Partial, $"param '{hit.Name}' looks related — confirm it carries {want}", clause)
            : new IsoCheck(key, title, IsoStatus.Missing, $"no parameter for {want}", clause);
    }

    private static bool IsSheetOrView(string target) =>
        target.Equals("Sheet", StringComparison.OrdinalIgnoreCase) ||
        target.Equals("View", StringComparison.OrdinalIgnoreCase);
}

public enum IsoStatus { Present, Partial, Missing }

/// <summary>One ISO 19650 fundamental and how the pack measures up.</summary>
public sealed class IsoCheck
{
    public IsoCheck(string key, string title, IsoStatus status, string detail, string clause)
    {
        Key = key; Title = title; Status = status; Detail = detail; Clause = clause;
    }

    public string Key { get; }
    public string Title { get; }
    public IsoStatus Status { get; }
    public string Detail { get; }
    public string Clause { get; }

    public string Mark => Status switch { IsoStatus.Present => "✓", IsoStatus.Partial => "◐", _ => "✗" };
}

public sealed class IsoGapReport
{
    public IsoGapReport(IReadOnlyList<IsoCheck> checks) => Checks = checks;

    public IReadOnlyList<IsoCheck> Checks { get; }
    public int Present => Checks.Count(c => c.Status == IsoStatus.Present);
    public int Total => Checks.Count;

    /// Partial counts as half — a name-matched-but-unconfirmed fundamental is genuine partial credit.
    public double Score => Total == 0 ? 100 : 100.0 * Checks.Sum(Weight) / Total;

    private static double Weight(IsoCheck c) => c.Status switch
    {
        IsoStatus.Present => 1.0,
        IsoStatus.Partial => 0.5,
        _ => 0.0,
    };
}
