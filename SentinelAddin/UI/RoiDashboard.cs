using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Engine;

namespace Sentinel.UI;

/// <summary>
/// Executive ROI dashboard (code-built WPF window — no XAML pair needed).
/// Shows man-hours saved, monetary value, and per-category interventions.
/// </summary>
public sealed class RoiDashboard : Window
{
    private static readonly Brush Navy = new SolidColorBrush(Color.FromRgb(0x1E, 0x3A, 0x5F));
    private static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(0x66, 0x77, 0x88));

    private static readonly Dictionary<string, string> KindLabels = new Dictionary<string, string>
    {
        ["autofix"] = "Naming auto-fixes",
        ["doctor"] = "Revit warnings auto-resolved",
        ["cde"] = "Bad CDE syncs intercepted",
        ["family"] = "Families sanitized",
        ["mepvoid"] = "MEP voids placed",
        ["bcf"] = "BCF issues exported",
    };

    public RoiDashboard()
    {
        Title = "Sentinel — ROI Dashboard";
        Width = 560; SizeToContent = SizeToContent.Height; ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = new SolidColorBrush(Color.FromRgb(0xF4, 0xF6, 0xF9));

        var s = RoiTracker.Summarize();
        var root = new StackPanel();

        var header = new Border { Background = Navy, Padding = new Thickness(20, 14, 20, 14) };
        var hs = new StackPanel();
        hs.Children.Add(new TextBlock { Text = "Return on investment", Foreground = Brushes.White, FontSize = 18, FontWeight = FontWeights.SemiBold });
        hs.Children.Add(new TextBlock
        {
            Text = $"Assumes {RoiTracker.MinutesSavedPerFix:F0} min saved per automated intervention at ${RoiTracker.HourlyRateUsd:F0}/h",
            Foreground = new SolidColorBrush(Color.FromRgb(0x9D, 0xB4, 0xCE)),
            FontSize = 11, Margin = new Thickness(0, 3, 0, 0),
        });
        header.Child = hs;
        root.Children.Add(header);

        var cards = new Grid { Margin = new Thickness(14, 14, 14, 4) };
        cards.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        cards.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        cards.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var metricCards = new[]
        {
            MetricCard(s.TotalInterventions.ToString(), "automated interventions"),
            MetricCard(s.HoursSaved.ToString("F1") + " h", "man-hours saved"),
            MetricCard("$" + s.ValueUsd.ToString("N0"), "estimated value"),
        };
        for (int i = 0; i < metricCards.Length; i++)
        {
            Grid.SetColumn(metricCards[i], i);
            cards.Children.Add(metricCards[i]);
        }
        root.Children.Add(cards);

        root.Children.Add(new TextBlock
        {
            Text = s.Last30Days + " intervention(s) in the last 30 days",
            FontSize = 11, Foreground = Muted, Margin = new Thickness(20, 4, 20, 8),
        });

        var breakdown = new Border
        {
            Background = Brushes.White, CornerRadius = new CornerRadius(8),
            BorderBrush = new SolidColorBrush(Color.FromRgb(0xE3, 0xE8, 0xEF)),
            BorderThickness = new Thickness(1), Margin = new Thickness(14, 0, 14, 14),
            Padding = new Thickness(16, 12, 16, 12),
        };
        var list = new StackPanel();
        list.Children.Add(new TextBlock { Text = "By intervention type", FontSize = 11, Foreground = Muted, Margin = new Thickness(0, 0, 0, 8) });
        foreach (var kv in KindLabels)
        {
            s.ByKind.TryGetValue(kv.Key, out var n);
            var row = new DockPanel { Margin = new Thickness(0, 2, 0, 2) };
            var count = new TextBlock { Text = n.ToString(), FontWeight = FontWeights.SemiBold, FontSize = 13, MinWidth = 44 };
            DockPanel.SetDock(count, Dock.Left);
            row.Children.Add(count);
            row.Children.Add(new TextBlock { Text = kv.Value, FontSize = 13 });
            list.Children.Add(row);
        }
        breakdown.Child = list;
        root.Children.Add(breakdown);

        Content = root;
    }

    private static Border MetricCard(string value, string label)
    {
        var card = new Border
        {
            Background = Brushes.White, CornerRadius = new CornerRadius(8),
            BorderBrush = new SolidColorBrush(Color.FromRgb(0xE3, 0xE8, 0xEF)),
            BorderThickness = new Thickness(1), Margin = new Thickness(6),
            Padding = new Thickness(14, 12, 14, 12),
        };
        var sp = new StackPanel();
        sp.Children.Add(new TextBlock { Text = value, FontSize = 22, FontWeight = FontWeights.Bold, Foreground = Navy });
        sp.Children.Add(new TextBlock { Text = label, FontSize = 11, Foreground = Muted });
        card.Child = sp;
        return card;
    }
}
