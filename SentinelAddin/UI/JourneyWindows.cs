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
        var box = new TextBox { Text = string.Join(Environment.NewLine, lines), IsReadOnly = true, TextWrapping = TextWrapping.Wrap, FontFamily = new FontFamily("Consolas"), FontSize = 11, MaxHeight = 200, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        _body.Children.Add(new Expander { Header = "Details", IsExpanded = false, Content = box });
    }
}
