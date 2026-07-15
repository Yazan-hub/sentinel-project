using System;
using System.Collections.Generic;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

/// <summary>
/// Modeless issue tracker for web-authored BCF topics. Shows the full details of the selected issue
/// (type/status/priority/assignee/due/labels/description/comments), jumps to the element + camera,
/// isolates all issue-affected elements, and answers "is my current selection linked to any issue?".
/// Built entirely in code (mirrors GhostBuilderProgressWindow); SetTopics/SetStatus/HighlightTopics
/// marshal via the dispatcher so the background fetch never touches controls directly.
/// </summary>
public sealed class BcfIssuesWindow : Window
{
    private readonly ListBox _list;
    private readonly TextBlock _details;
    private readonly TextBlock _status;
    private IReadOnlyList<BcfTopic> _topics = new List<BcfTopic>();

    public event Action<BcfTopic>? TopicActivated;
    public event Action? RefreshRequested;
    public event Action? IsolateAllRequested;
    public event Action? IssuesForSelectionRequested;

    /// <summary>Current topics (for the command's isolate-all / selection-lookup requests).</summary>
    public IReadOnlyList<BcfTopic> Topics => _topics;

    public BcfIssuesWindow()
    {
        Title = "Sentinel — Coordination Issues (BCF)";
        Width = 480;
        Height = 640;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        _list = new ListBox { Height = 150, SelectionMode = SelectionMode.Extended };
        _list.SelectionChanged += (_, __) => ShowDetails(_list.SelectedItem as BcfTopic);
        _list.MouseDoubleClick += (_, __) => ActivateSelected();

        _details = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(6), FontFamily = new FontFamily("Consolas") };
        var detailScroll = new ScrollViewer
        {
            Content = _details,
            Height = 210,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Background = Brushes.WhiteSmoke,
            BorderBrush = Brushes.LightGray,
            BorderThickness = new Thickness(1),
            Margin = new Thickness(0, 6, 0, 0),
        };

        Button Btn(string text, Action? click)
        {
            var b = new Button { Content = text, Margin = new Thickness(0, 4, 0, 0), Padding = new Thickness(6) };
            b.Click += (_, __) => click?.Invoke();
            return b;
        }

        var zoom = Btn("Zoom to issue (or double-click)", ActivateSelected);
        var isolateAll = Btn("Isolate ALL issue elements", () => IsolateAllRequested?.Invoke());
        var forSel = Btn("Issues for my Revit selection", () => IssuesForSelectionRequested?.Invoke());
        var refresh = Btn("Refresh", () => RefreshRequested?.Invoke());

        _status = new TextBlock { Text = "…", Margin = new Thickness(0, 6, 0, 0), TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray };

        var listLabel = new TextBlock { Text = "Issues", FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 0, 4) };

        // List fills; details + buttons + status pinned to the bottom (added bottom→top).
        var root = new DockPanel { Margin = new Thickness(12) };
        foreach (var (el, dock) in new (UIElement, Dock)[]
        {
            (_status, Dock.Bottom), (refresh, Dock.Bottom), (forSel, Dock.Bottom),
            (isolateAll, Dock.Bottom), (zoom, Dock.Bottom), (detailScroll, Dock.Bottom),
            (listLabel, Dock.Top),
        })
        {
            DockPanel.SetDock(el, dock);
            root.Children.Add(el);
        }
        root.Children.Add(_list); // last child fills the remaining space
        Content = root;
    }

    private void ActivateSelected()
    {
        if (_list.SelectedItem is BcfTopic t) TopicActivated?.Invoke(t);
    }

    public void SetTopics(IReadOnlyList<BcfTopic> topics) => Dispatcher.Invoke(() =>
    {
        _topics = topics;
        _list.ItemsSource = topics;
        _details.Text = string.Empty;
    });

    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);

    /// <summary>Select + reveal the topics the Revit selection was found in.</summary>
    public void HighlightTopics(IReadOnlyList<BcfTopic> matched) => Dispatcher.Invoke(() =>
    {
        _list.SelectedItems.Clear();
        foreach (BcfTopic t in matched) _list.SelectedItems.Add(t);
        if (matched.Count > 0)
        {
            _list.ScrollIntoView(matched[0]);
            ShowDetails(matched[0]);
        }
    });

    private void ShowDetails(BcfTopic? t)
    {
        if (t is null) { _details.Text = string.Empty; return; }

        var sb = new StringBuilder();
        sb.AppendLine(t.Title).AppendLine();
        sb.Append("Type:      ").AppendLine(t.Type);
        sb.Append("Status:    ").AppendLine(t.Status);
        sb.Append("Priority:  ").AppendLine(Or(t.Priority));
        sb.Append("Assigned:  ").AppendLine(Or(t.AssignedTo));
        sb.Append("Due:       ").AppendLine(Or(FormatDate(t.DueDate)));
        if (t.Labels is { Count: > 0 }) sb.Append("Labels:    ").AppendLine(string.Join(", ", t.Labels));
        sb.Append("Author:    ").Append(Or(t.Author)).Append("   ").AppendLine(FormatDate(t.CreationDate));

        int links = 0;
        foreach (var vp in t.Viewpoints) links += vp.Components?.Selection?.Count ?? 0;
        sb.Append("Linked el: ").AppendLine(links.ToString());

        if (!string.IsNullOrWhiteSpace(t.Description))
            sb.AppendLine().AppendLine("Description:").AppendLine(t.Description);

        if (t.Comments is { Count: > 0 })
        {
            sb.AppendLine().Append("Comments (").Append(t.Comments.Count).AppendLine("):");
            foreach (var c in t.Comments) sb.Append("  • ").Append(Or(c.Author)).Append(": ").AppendLine(c.Text);
        }
        if (t.History is { Count: > 0 })
        {
            sb.AppendLine().Append("History (").Append(t.History.Count).AppendLine("):");
            foreach (var h in t.History)
                sb.Append("  ").Append(FormatDate(h.Date)).Append("  ").Append(Or(h.Author)).Append(" — ").AppendLine(h.Action);
        }
        _details.Text = sb.ToString();
    }

    private static string Or(string? s) => string.IsNullOrWhiteSpace(s) ? "—" : s!;

    private static string FormatDate(string? iso)
    {
        if (string.IsNullOrWhiteSpace(iso)) return "";
        return DateTimeOffset.TryParse(iso, out var d) ? d.ToString("yyyy-MM-dd") : iso!;
    }
}
