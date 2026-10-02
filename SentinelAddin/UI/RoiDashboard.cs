using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.UI;

/// <summary>
/// The ROI dashboard (cohesion phase 5c, spec Decision 9): the lines <see cref="RoiLines"/> built from the ledger rows
/// the bridge returned for the ACTIVE document's project and its roi@n. Code-built WPF, no XAML pair. The window
/// reads nothing itself: the command reads <see cref="Read"/> OFF the API thread, waits, and hands the lines in.
/// </summary>
public sealed class RoiDashboard : Window
{
    private static readonly Brush Navy = new SolidColorBrush(Color.FromRgb(0x1E, 0x3A, 0x5F));
    private static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(0x9D, 0xB4, 0xCE));

    public RoiDashboard(IReadOnlyList<string> lines)
    {
        Title = "Sentinel — ROI Dashboard";
        Width = 640; SizeToContent = SizeToContent.Height; ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = new SolidColorBrush(Color.FromRgb(0xF4, 0xF6, 0xF9));

        var root = new StackPanel();
        var header = new Border { Background = Navy, Padding = new Thickness(20, 14, 20, 14) };
        var hs = new StackPanel();
        hs.Children.Add(new TextBlock { Text = "Return on investment", Foreground = Brushes.White, FontSize = 18, FontWeight = FontWeights.SemiBold });
        hs.Children.Add(new TextBlock
        {
            Text = lines.Count > 0 ? lines[0] : "", // "ROI · <key> · counted from the ledger (…)", or why nothing was
            Foreground = Muted, FontSize = 11, Margin = new Thickness(0, 3, 0, 0), TextWrapping = TextWrapping.Wrap,
        });
        header.Child = hs;
        root.Children.Add(header);

        var card = new Border
        {
            Background = Brushes.White, CornerRadius = new CornerRadius(8),
            BorderBrush = new SolidColorBrush(Color.FromRgb(0xE3, 0xE8, 0xEF)),
            BorderThickness = new Thickness(1), Margin = new Thickness(14),
            Padding = new Thickness(16, 12, 16, 12),
        };
        var list = new StackPanel();
        foreach (var line in lines.Skip(1))
            list.Children.Add(new TextBlock { Text = line, FontSize = 13, Margin = new Thickness(0, 3, 0, 3), TextWrapping = TextWrapping.Wrap });
        card.Child = list;
        root.Children.Add(card);

        Content = root;
    }

    /// <summary>
    /// The three ledger kinds (GET /cde/:key/audit?entity_type=…, up to five pages of 1000 each) and the project's
    /// roi@n, then the lines. BLOCKING (each GET ≤ 4 s) and never on the API thread: the command runs it on a Task and
    /// waits, as Governed Publish waits for its referee. A kind the bridge would not answer counts nothing at all.
    /// </summary>
    public static string[] Read(string key)
    {
        // ponytail: the three kinds are read one after the other (≤ 16 GETs worst case); read them in parallel if a
        // 5000-row project makes the wait felt.
        var gate = GovernedQuery.RoiRows(key, "delivery_gate", out var failure);
        var naming = gate is null ? null : GovernedQuery.RoiRows(key, "naming", out failure);
        var heal = naming is null ? null : GovernedQuery.RoiRows(key, "family_heal", out failure);
        // MA-1a item 7 (P1-9): the fixes that write a ledger row — read the same way, counted, not priced.
        var autoFix = heal is null ? null : GovernedQuery.RoiRows(key, "auto_fix", out failure);
        var inPlace = autoFix is null ? null : GovernedQuery.RoiRows(key, "fix_in_place", out failure);
        var doctor = inPlace is null ? null : GovernedQuery.RoiRows(key, "doctor", out failure);
        if (gate is null || naming is null || heal is null || autoFix is null || inPlace is null || doctor is null)
            return RoiLines.Unavailable(key, failure ?? "the bridge did not answer");
        var counts = RoiCounts.From(gate.Rows, naming.Rows, heal.Rows, gate.Truncated || naming.Truncated || heal.Truncated)
            .WithFixes(autoFix.Rows, inPlace.Rows, doctor.Rows, autoFix.Truncated || inPlace.Truncated || doctor.Truncated);
        var roi = ArtefactClient.Resolve(key, "roi");
        return RoiLines.Lines(key, counts, RoiMoney.From(counts, roi), roi);
    }
}
