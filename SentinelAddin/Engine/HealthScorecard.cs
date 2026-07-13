namespace Sentinel.Engine;

/// <summary>
/// Executive scorecard: rolls the raw violation list into a weighted 0-100
/// compliance score + per-domain breakdown suitable for project managers.
/// Unlike ScanReport.Score (flat count ratio), this weights by enforcement
/// severity so one BLOCK hurts more than ten MONITORs. Pure computation —
/// feed it any ScanReport (live scan, IFC pre-flight, or Phase 3 history).
/// </summary>
public static class HealthScorecard
{
    private static double Weight(EnforcementMode m) => m switch
    {
        EnforcementMode.Block => 8.0,
        EnforcementMode.Request => 4.0,
        EnforcementMode.Warn => 2.0,
        _ => 0.5, // monitor: informational, near-free
    };

    public sealed class DomainScore
    {
        public string Domain { get; set; } = string.Empty;   // rule id prefix: VN, SN, WS, FN, IFC, CDE...
        public int Violations { get; set; }
        public double WeightedPenalty { get; set; }
    }

    public sealed class Scorecard
    {
        public string DocTitle { get; set; } = string.Empty;
        public DateTimeOffset At { get; set; }
        public int ElementsChecked { get; set; }
        public int TotalViolations { get; set; }
        public double Score { get; set; }                    // weighted 0-100
        public string Grade => Score >= 95 ? "A" : Score >= 85 ? "B" : Score >= 70 ? "C" : Score >= 50 ? "D" : "F";
        public List<DomainScore> Domains { get; } = new List<DomainScore>();
        public string Headline =>
            $"{Score:F1}% ({Grade}) — {TotalViolations} open issue(s) across {Domains.Count} domain(s)";
    }

    public static Scorecard Build(ScanReport report)
    {
        var card = new Scorecard
        {
            DocTitle = report.DocTitle,
            At = report.At,
            ElementsChecked = report.ElementsChecked,
            TotalViolations = report.Violations.Count,
        };

        double penalty = 0;
        var byDomain = new Dictionary<string, DomainScore>();
        foreach (var v in report.Violations)
        {
            var w = Weight(v.Mode);
            penalty += w;
            var key = v.RuleId.Split('-')[0];
            if (!byDomain.TryGetValue(key, out var d))
                byDomain[key] = d = new DomainScore { Domain = key };
            d.Violations++;
            d.WeightedPenalty += w;
        }

        // Normalize: a model where every checked element carried a WARN would
        // score 0; a clean model scores 100. Elements can carry >1 violation,
        // so clamp at 0 rather than letting the score go negative.
        double maxPenalty = Math.Max(1, report.ElementsChecked) * Weight(EnforcementMode.Warn);
        card.Score = Math.Max(0, 100.0 * (1.0 - penalty / maxPenalty));

        card.Domains.AddRange(byDomain.Values.OrderByDescending(d => d.WeightedPenalty));
        return card;
    }

    /// Plain-text block for status emails / TaskDialogs / Phase 3 PDF export.
    public static string Render(Scorecard c)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("SENTINEL COMPLIANCE SCORECARD");
        sb.AppendLine(c.DocTitle + " — " + c.At.ToLocalTime().ToString("yyyy-MM-dd HH:mm"));
        sb.AppendLine(c.Headline);
        sb.AppendLine(new string('-', 48));
        foreach (var d in c.Domains)
            sb.AppendLine($"  {d.Domain,-6} {d.Violations,4} issue(s)   penalty {d.WeightedPenalty,6:F1}");
        return sb.ToString();
    }
}
