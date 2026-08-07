#nullable disable
// Governed AI modeling (A2): the human gate. One row per proposed element with the REFEREE'S
// verdict — pre-ticked only when the IDS accepted it. A human may tick a rejected row (overrule,
// with the failures on screen — the result records that they did); recorded rows say honestly
// that no spec adjudicated them. Modeless, code-only WPF, in GhostReviewWindow's visual family.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

public sealed class ChangesetReviewWindow : Window
{
    public event Action<List<string>, List<string>, string> DecideRequested;

    private readonly List<(CheckBox Box, ChangesetElementDto El)> _rows = new();
    private readonly TextBox _note = new() { MinHeight = 40, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
    private readonly ChangesetDto _cs;

    public ChangesetReviewWindow(ChangesetDto changeset)
    {
        _cs = changeset;
        Title = $"Sentinel — Review AI proposal: {_cs.Name}";
        Width = 640; Height = 560; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };

        // Header: what this is, who proposed it, what the referee said.
        var head = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
        head.Children.Add(new TextBlock { Text = _cs.Name, FontSize = 15, FontWeight = FontWeights.Bold });
        head.Children.Add(new TextBlock
        {
            Text = $"Proposed by {_cs.Source} · adjudication: {_cs.Adjudication?.Verdict ?? "?"} (spec: {_cs.Adjudication?.IdsSource ?? "?"})",
            Foreground = Brushes.Gray, Margin = new Thickness(0, 2, 0, 0),
        });
        var unattributed = _cs.Adjudication?.Unattributed?.Count ?? 0;
        if (unattributed > 0)
            head.Children.Add(new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(0x5c, 0x45, 0x00)),
                CornerRadius = new CornerRadius(3), Padding = new Thickness(6, 3, 6, 3), Margin = new Thickness(0, 6, 0, 0),
                Child = new TextBlock
                {
                    Text = $"⚠ {unattributed} failure(s) could not be attributed to a specific element — clean rows are NOT certified.",
                    Foreground = Brushes.Khaki, TextWrapping = TextWrapping.Wrap,
                },
            });
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);

        // Footer: reviewer note + actions. (Top/bottom docked before the fill so the list scrolls.)
        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        foot.Children.Add(new TextBlock { Text = "Reviewer note (recorded with the result):", Foreground = Brushes.Gray });
        foot.Children.Add(_note);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 8, 0, 0) };
        var all = new Button { Content = "Tick accepted", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var none = new Button { Content = "Untick all", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var go = new Button { Content = "Create ticked in Revit", Padding = new Thickness(12, 4, 12, 4), FontWeight = FontWeights.Bold };
        all.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = r.El.Verdict?.Status == "accepted"; };
        none.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = false; };
        go.Click += (_, _) => Decide();
        buttons.Children.Add(all); buttons.Children.Add(none); buttons.Children.Add(go);
        foot.Children.Add(buttons);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        // Rows.
        var list = new StackPanel();
        foreach (var el in _cs.Elements ?? new List<ChangesetElementDto>())
        {
            var row = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
            var box = new CheckBox
            {
                VerticalAlignment = VerticalAlignment.Center,
                IsChecked = el.Verdict?.Status == "accepted", // pre-tick = the referee's verdict, nothing else
            };
            _rows.Add((box, el));
            DockPanel.SetDock(box, Dock.Left);
            row.Children.Add(box);

            var badge = MakeBadge(el.Verdict);
            DockPanel.SetDock(badge, Dock.Right);
            row.Children.Add(badge);

            var label = new TextBlock { Margin = new Thickness(8, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
            var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
            var type = el.Place?.TypeName; var lvl = el.Place?.LevelName;
            label.Text = $"{el.Kind}: {name}" + (type != null ? $"  ·  {type}" : "") + (lvl != null ? $"  ·  {lvl}" : "");
            row.Children.Add(label);
            list.Children.Add(row);
        }
        root.Children.Add(new ScrollViewer { Content = list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
    }

    private static UIElement MakeBadge(ElementVerdictDto v)
    {
        var status = v?.Status ?? "recorded";
        var (text, fg) = status switch
        {
            "accepted" => ("✓ accepted", Brushes.LightGreen),
            "rejected" => ($"✗ rejected ({v.Failures?.Count ?? 0})", Brushes.IndianRed),
            _ => ("— recorded", Brushes.Gray),
        };
        var tb = new TextBlock { Text = text, Foreground = fg, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
        tb.ToolTip = status switch
        {
            "rejected" => string.Join("\n", (v.Failures ?? new List<JsonElement>()).Take(10).Select(f => f.ToString())),
            "recorded" => "No spec to adjudicate against — nothing was certified for this element.",
            _ => "Passed the project's IDS adjudication.",
        };
        return tb;
    }

    private void Decide()
    {
        var ticked = _rows.Where(r => r.Box.IsChecked == true).Select(r => r.El.ProposalGuid).ToList();
        var unticked = _rows.Where(r => r.Box.IsChecked != true).Select(r => r.El.ProposalGuid).ToList();
        DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? "");
        Close();
    }
}
