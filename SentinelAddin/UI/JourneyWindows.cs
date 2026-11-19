#nullable disable
// UX simplification slice 1 (docs/ux/2026-11-17-simplification-map.md): the modeller's Check and Fix windows. Code-only WPF,
// modal: each button records one choice and closes, and the command acts on it inside its own Execute (API thread), so it
// can run the existing tools with the same ExternalCommandData. Plain words on screen; technical lines only under Details.
using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Sentinel.UI;

/// One group of Check results: a title, a plain count line, a few example lines, and up to two actions.
public sealed class CheckGroup
{
    public string Title = "";
    public string Summary = "";
    public List<string> Examples = new();
    public List<long> ElementIds = new();
    public string FixLabel;     // null = no fix button
    public string FixChoice;    // what the command does on Fix
    public List<(string Label, string Choice)> MoreActions = new();   // further buttons after Fix (Build's step 3)
}

/// F-UX1-5: Check's "Fix all" lists the proposed names first; only the rows a person ticks are filed. Nothing is ticked at
/// the start; "Tick all" and "Clear" help with long lists.
public sealed class NamePickWindow : Window
{
    public List<int> Ticked { get; } = new();
    private readonly List<CheckBox> _boxes = new();

    public NamePickWindow(List<(string Current, string Proposed)> rows)
    {
        Title = "Sentinel — Fix names";
        Width = 640; Height = 560; WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var root = new DockPanel { Margin = new Thickness(12) };
        var head = new TextBlock { Text = $"{rows.Count} name(s) can be fixed. Tick the ones to propose; they wait for approval in Fix.",
            TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 8) };
        DockPanel.SetDock(head, Dock.Top); root.Children.Add(head);
        // Default colours: a disabled button with white text read blank (drill UX-1 re-check); bold marks it as the main action.
        var file = new Button { Content = "Propose ticked (0)", Padding = new Thickness(12, 4, 12, 4), Margin = new Thickness(8, 0, 0, 0), IsEnabled = false,
            FontWeight = FontWeights.Bold };
        void Count() { var n = _boxes.Count(b => b.IsChecked == true); file.Content = $"Propose ticked ({n})"; file.IsEnabled = n > 0; }
        Button B(string t, Action a) { var b = new Button { Content = t, Padding = new Thickness(12, 4, 12, 4), Margin = new Thickness(8, 0, 0, 0) }; b.Click += (_, _) => a(); return b; }
        var bar = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 8, 0, 0) };
        bar.Children.Add(B("Tick all", () => { foreach (var b in _boxes) b.IsChecked = true; }));
        bar.Children.Add(B("Clear", () => { foreach (var b in _boxes) b.IsChecked = false; }));
        bar.Children.Add(file);
        bar.Children.Add(B("Cancel", () => DialogResult = false));
        file.Click += (_, _) => { for (int i = 0; i < _boxes.Count; i++) if (_boxes[i].IsChecked == true) Ticked.Add(i); DialogResult = true; };
        DockPanel.SetDock(bar, Dock.Bottom); root.Children.Add(bar);
        var list = new StackPanel();
        foreach (var (cur, prop) in rows)
        {
            var cb = new CheckBox { Margin = new Thickness(0, 2, 0, 2), Content = new TextBlock { Text = $"{cur}  →  {prop}", TextWrapping = TextWrapping.Wrap } };
            cb.Checked += (_, _) => Count(); cb.Unchecked += (_, _) => Count();
            _boxes.Add(cb); list.Children.Add(cb);
        }
        root.Children.Add(new ScrollViewer { Content = list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
    }
}

public sealed class JourneyWindow : Window
{
    public string Choice { get; private set; } // null = closed with no action
    public CheckGroup Picked { get; private set; }
    private readonly StackPanel _body = new() { Margin = new Thickness(12) };

    public JourneyWindow(string title, string headline)
    {
        Title = "Sentinel — " + title;
        Width = 560; SizeToContent = SizeToContent.Height; MaxHeight = 760;
        WindowStartupLocation = WindowStartupLocation.CenterScreen; ResizeMode = ResizeMode.CanResizeWithGrip;
        _body.Children.Add(new TextBlock { Text = headline, FontSize = 16, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 10) });
        Content = new ScrollViewer { Content = _body, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    }

    private Button Btn(string text, Action onClick, bool primary = false)
    {
        var b = new Button { Content = text, Padding = new Thickness(12, 4, 12, 4), Margin = new Thickness(8, 0, 0, 0) };
        if (primary) { b.Background = new SolidColorBrush(Color.FromRgb(0x1E, 0x3A, 0x5F)); b.Foreground = Brushes.White; }
        b.Click += (_, _) => { onClick(); Close(); };
        return b;
    }

    /// A card: title + count on the left, actions on the right, example lines below.
    public void AddGroup(CheckGroup g)
    {
        var card = new Border { BorderBrush = new SolidColorBrush(Color.FromRgb(0xD5, 0xDB, 0xE3)), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4), Padding = new Thickness(10), Margin = new Thickness(0, 0, 0, 8) };
        var stack = new StackPanel();
        var head = new DockPanel();
        var buttons = new StackPanel { Orientation = Orientation.Horizontal };
        if (g.ElementIds.Count > 0) buttons.Children.Add(Btn("Show", () => { Choice = "show"; Picked = g; }));
        if (g.FixLabel != null) buttons.Children.Add(Btn(g.FixLabel, () => { Choice = g.FixChoice; Picked = g; }, primary: true));
        foreach (var (label, choice) in g.MoreActions) buttons.Children.Add(Btn(label, () => { Choice = choice; Picked = g; }));
        DockPanel.SetDock(buttons, Dock.Right);
        head.Children.Add(buttons);
        var left = new StackPanel();
        left.Children.Add(new TextBlock { Text = g.Title, FontWeight = FontWeights.Bold });
        left.Children.Add(new TextBlock { Text = g.Summary, Foreground = new SolidColorBrush(Color.FromRgb(0x55, 0x5E, 0x6B)), TextWrapping = TextWrapping.Wrap });
        head.Children.Add(left);
        stack.Children.Add(head);
        foreach (var e in g.Examples)
            stack.Children.Add(new TextBlock { Text = "• " + e, FontSize = 11, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 2, 0, 0) });
        card.Child = stack;
        _body.Children.Add(card);
    }

    /// A row with a single action (the Fix window's sections).
    public void AddAction(string title, string text, string button, string choice)
        => AddGroup(new CheckGroup { Title = title, Summary = text, FixLabel = button, FixChoice = choice });

    public void AddFooter(string button, string choice)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 4, 0, 8) };
        row.Children.Add(Btn(button, () => Choice = choice, primary: true));
        row.Children.Add(Btn("Close", () => { }));
        _body.Children.Add(row);
    }

    /// The collapsed Details: technical lines (rule ids, versions, notes) a modeller never needs to read.
    public void AddDetails(IEnumerable<string> lines)
    {
        if (DetailsExpander.Make(lines) is { } fold) _body.Children.Add(fold);
    }
}

/// UX slice 4: the one closed "Details" fold every window uses (codes, numbers, versions, addresses). Null when there is nothing to show.
public static class DetailsExpander
{
    public static Expander Make(IEnumerable<string> lines)
    {
        var text = string.Join(Environment.NewLine, System.Linq.Enumerable.Where(lines ?? new string[0], l => !string.IsNullOrWhiteSpace(l)));
        if (text.Length == 0) return null;
        var box = new TextBox { Text = text, IsReadOnly = true, TextWrapping = TextWrapping.Wrap, FontFamily = new FontFamily("Consolas"), FontSize = 11, MaxHeight = 200, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        return new Expander { Header = "Details", IsExpanded = false, Content = box };
    }
}
