using System.Windows;
using System.Windows.Media;
using Sentinel.Engine;

namespace Sentinel.UI;

public partial class RulesetWindow : Window
{
    public RulesetWindow(Ruleset ruleset)
    {
        DataContext = new RulesetWindowViewModel(ruleset);
        InitializeComponent();
    }
}

public sealed class RuleCard
{
    public RuleCard(Rule r)
    {
        Id = r.Id;
        Target = r.Target.ToString().ToUpperInvariant();
        Mode = r.Mode.ToString().ToUpperInvariant();
        DocRef = r.DocRef ?? "";
        MessageEn = r.MessageEn.Replace("{name}", "…");
        MessageAr = r.MessageAr?.Replace("{name}", "…") ?? "";
        Pattern = r.Tokens.Count > 0
            ? string.Join(r.Separator, r.Tokens.Select(t => $"[{t}]"))
            : "";
        ExtraInfo = BuildExtra(r);

        (ModeBackground, ModeForeground) = r.Mode switch
        {
            EnforcementMode.Monitor => (Brush("#E8F0FA"), Brush("#3478C8")),
            EnforcementMode.Warn    => (Brush("#FFF6DC"), Brush("#B07D10")),
            EnforcementMode.Request => (Brush("#FDEBD8"), Brush("#C2611A")),
            _                       => (Brush("#FBE3E3"), Brush("#B3352F")),
        };
    }

    private static string BuildExtra(Rule r)
    {
        var parts = new List<string>();
        if (r.Whitelist.Count > 0)
            parts.Add($"Whitelist ({r.Whitelist.Count}): {string.Join(", ", r.Whitelist.Take(6))}{(r.Whitelist.Count > 6 ? ", …" : "")}");
        if (r.Categories.Count > 0)
            parts.Add($"Scoped to: {string.Join(", ", r.Categories)}");
        if (r.ParameterName is not null)
            parts.Add($"Checks parameter: '{r.ParameterName}'");
        if (r.Exclusions.Count > 0)
            parts.Add($"Excludes {r.Exclusions.Count} system pattern(s)");
        return string.Join("  ·  ", parts);
    }

    private static SolidColorBrush Brush(string hex)
    {
        var b = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        b.Freeze();
        return b;
    }

    public string Id { get; }
    public string Target { get; }
    public string Mode { get; }
    public string DocRef { get; }
    public string MessageEn { get; }
    public string MessageAr { get; }
    public string Pattern { get; }
    public string ExtraInfo { get; }
    public System.Windows.Media.Brush ModeBackground { get; }
    public System.Windows.Media.Brush ModeForeground { get; }
    public Visibility PatternVisibility => Pattern.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
    public Visibility ArVisibility => MessageAr.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
    public Visibility ExtraVisibility => ExtraInfo.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
}

public sealed class RulesetWindowViewModel
{
    public RulesetWindowViewModel(Ruleset rs)
    {
        Header = $"{rs.StandardKey}  ·  v{rs.Semver}";
        SubHeader = $"{rs.Rules.Count} active rules — office master + project overlay (effective set)";
        Rules = rs.Rules.Select(r => new RuleCard(r)).ToList();
    }

    public string Header { get; }
    public string SubHeader { get; }
    public IReadOnlyList<RuleCard> Rules { get; }
}
