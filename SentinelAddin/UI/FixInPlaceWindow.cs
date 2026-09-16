// Fix-in-place: the human gate between a referee-raised BCF issue and the model. One row per instance (or
// per TYPE, with its blast radius spelled out), the current and proposed value, and the referee's verdict
// for the proposed value BEFORE anything is written. Modeless, code-only WPF, in ChangesetReviewWindow's
// visual family. The window never touches the Revit API or the network — it raises events.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.UI;

public sealed class FixInPlaceWindow : Window
{
    public event Action<List<FixRow>>? CheckRequested;
    public event Action<List<FixRow>>? ApplyRequested;
    public event Action? RecheckRequested;
    public event Action<FixRow>? ZoomRequested;

    private readonly FixInPlaceService.Plan _plan;
    private readonly StackPanel _list = new();
    private readonly TextBlock _status = new() { Foreground = Brushes.Gray, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) };
    private readonly Border _banner = new() { Visibility = Visibility.Collapsed, Background = new SolidColorBrush(Color.FromRgb(0x5c, 0x45, 0x00)), CornerRadius = new CornerRadius(3), Padding = new Thickness(6, 3, 6, 3), Margin = new Thickness(0, 6, 0, 0) };
    private readonly TextBlock _bannerText = new() { Foreground = Brushes.Khaki, TextWrapping = TextWrapping.Wrap };
    private readonly TextBox _setAll = new() { Width = 160, Margin = new Thickness(0, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center };
    private readonly List<(CheckBox Box, TextBox Value, TextBlock Verdict, FixRow Row)> _rows = new();
    private readonly List<Button> _actions = new();

    public FixInPlaceWindow(BcfTopic topic, IdsIssueRef req, FixInPlaceService.Plan plan)
    {
        _plan = plan;
        Title = $"Sentinel — Fix in Revit: {req.Requirement}";
        Width = 860; Height = 600; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };

        // Header: the issue, the requirement, what resolved and what did not.
        var head = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
        head.Children.Add(new TextBlock { Text = topic.Title, FontSize = 15, FontWeight = FontWeights.Bold, TextWrapping = TextWrapping.Wrap });
        head.Children.Add(new TextBlock
        {
            Text = $"Requirement {req.Requirement} · spec “{req.Spec}” · {plan.Rows.Count} row(s) covering {plan.Rows.Sum(r => r.InstanceIds.Count)} of {req.Failing} element(s)",
            Foreground = Brushes.Gray, Margin = new Thickness(0, 2, 0, 0), TextWrapping = TextWrapping.Wrap,
        });
        if (plan.Unresolved.Count > 0)
            head.Children.Add(new TextBlock
            {
                Text = $"⚠ {plan.Unresolved.Count} element(s) on this issue are not in the open model — the issue cannot be resolved from here until they are: {string.Join(", ", plan.Unresolved.Take(5))}{(plan.Unresolved.Count > 5 ? ", …" : "")}",
                Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 0),
            });
        _banner.Child = _bannerText;
        head.Children.Add(_banner);
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);

        // Footer: set-all, actions, status.
        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        var line = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        line.Children.Add(new TextBlock { Text = "Set all ticked to:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0) });
        line.Children.Add(_setAll);
        line.Children.Add(Btn("Set", () => { foreach (var r in _rows.Where(r => r.Box.IsChecked == true && r.Row.Writable)) r.Value.Text = _setAll.Text; }));
        line.Children.Add(Btn("Zoom", () => { var r = _rows.FirstOrDefault(x => x.Box.IsChecked == true); if (r.Row != null) ZoomRequested?.Invoke(r.Row); }));
        line.Children.Add(Btn("Check", () => Fire(CheckRequested), bold: true));
        line.Children.Add(Btn("Apply ticked", () => Fire(ApplyRequested), bold: true));
        line.Children.Add(Btn("Re-check", () => RecheckRequested?.Invoke()));
        foot.Children.Add(line);
        foot.Children.Add(_status);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        // Rows.
        foreach (var row in plan.Rows) _list.Children.Add(MakeRow(row));
        if (plan.Rows.Count == 0)
            _list.Children.Add(new TextBlock { Text = $"None of this issue's {req.Failing} element(s) are in the open model.", Foreground = Brushes.Orange, Margin = new Thickness(0, 12, 0, 0) });
        root.Children.Add(new ScrollViewer { Content = _list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
        SetStatus(plan.Rows.Count == 0 ? "Nothing to fix here." : "Enter values, then Check — the referee judges the proposed values before anything is written.");
    }

    private Button Btn(string text, Action click, bool bold = false)
    {
        var b = new Button { Content = text, Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(6, 0, 0, 0), FontWeight = bold ? FontWeights.Bold : FontWeights.Normal };
        b.Click += (_, _) => click();
        _actions.Add(b);
        return b;
    }

    private void Fire(Action<List<FixRow>>? ev)
    {
        foreach (var r in _rows) { r.Row.Ticked = r.Box.IsChecked == true; r.Row.Proposed = r.Value.Text; }
        var ticked = _rows.Where(r => r.Row.Ticked && r.Row.Writable).Select(r => r.Row).ToList();
        if (ticked.Count == 0) { SetStatus("Tick at least one fixable row."); return; }
        ev?.Invoke(ticked);
    }

    private UIElement MakeRow(FixRow row)
    {
        var grid = new Grid { Margin = new Thickness(0, 3, 0, 3) };
        foreach (var w in new[] { 24.0, 300.0, 120.0, 140.0, 0.0 })
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = w == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(w) });

        var box = new CheckBox { IsChecked = row.Writable, IsEnabled = row.Writable, VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(box, 0); grid.Children.Add(box);

        var label = new TextBlock { TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4, 0, 8, 0) };
        label.Inlines.Add(row.Label);
        label.Inlines.Add(new System.Windows.Documents.LineBreak());
        label.Inlines.Add(new System.Windows.Documents.Run(row.Writable ? $"{row.ScopeText} · {row.ParamName} ({row.ResolvedVia})" : row.ScopeText)
        { Foreground = row.IsType ? Brushes.DarkOrange : Brushes.Gray, FontSize = 11 });
        Grid.SetColumn(label, 1); grid.Children.Add(label);

        var current = new TextBlock { Text = row.Current.Length == 0 ? "(empty)" : row.Current, Foreground = Brushes.Gray, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
        current.ToolTip = "current value";
        Grid.SetColumn(current, 2); grid.Children.Add(current);

        var value = new TextBox { Text = row.Proposed, IsEnabled = row.Writable, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0) };
        value.ToolTip = row.ValueKind == ValueKind.YesNo ? "yes / no" : "proposed value";
        Grid.SetColumn(value, 3); grid.Children.Add(value);

        var verdict = new TextBlock { VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold };
        Grid.SetColumn(verdict, 4); grid.Children.Add(verdict);

        _rows.Add((box, value, verdict, row));
        Paint(verdict, row);
        return grid;
    }

    private static void Paint(TextBlock tb, FixRow row)
    {
        (tb.Text, tb.Foreground, tb.ToolTip) = row.Verdict switch
        {
            FixVerdict.Pass => ("✓ passes", Brushes.LightGreen, "The referee accepted this value."),
            FixVerdict.Fail => ($"✗ {row.Reason}", Brushes.IndianRed, row.Reason),
            FixVerdict.NotFixable => ($"— not fixable here: {row.NotFixableReason}", Brushes.Orange, row.NotFixableReason),
            _ => ("unchecked", Brushes.Gray, "Not yet checked by the referee."),
        };
    }

    // ---- called from the command (marshalled via the dispatcher) ----
    public void RefreshRows() => Dispatcher.Invoke(() => { foreach (var r in _rows) Paint(r.Verdict, r.Row); });
    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);
    public void SetBanner(string? text) => Dispatcher.Invoke(() => { _bannerText.Text = text ?? ""; _banner.Visibility = text == null ? Visibility.Collapsed : Visibility.Visible; });
    public void SetBusy(bool busy) => Dispatcher.Invoke(() => { foreach (var b in _actions) b.IsEnabled = !busy; });
}
