using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.GhostBuilder;

namespace Sentinel.UI;

/// <summary>
/// MA-2e (audit ANV-2, DAT-3): Annotate's preview — one group per level (lowest first) with a row per planned view (its name, the
/// guideline entry, the template's status), then one group of the unpinned levels and grids. A refused row is greyed, says why
/// and cannot be ticked (E1). The words above the rows name the guideline, the View rule that judged the names and B31 (spec
/// amendment S1, review C3). Modal and built in code, ViewPickWindow's idiom: ShowDialog() == true means
/// Create was pressed; <see cref="Views"/> and <see cref="Pins"/> hold the ticked rows.
/// </summary>
public sealed class AnnotatePreviewWindow : Window
{
    private readonly List<(CheckBox Box, PlannedView View)> _views = new();
    private readonly List<(CheckBox Box, PinRow Pin)> _pins = new();
    private readonly TextBlock _status = new() { Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap };
    private static readonly System.Windows.Media.Brush Greyed = new SolidColorBrush(System.Windows.Media.Color.FromRgb(128, 128, 128));

    public IReadOnlyList<PlannedView> Views { get; private set; } = new List<PlannedView>();
    public IReadOnlyList<PinRow> Pins { get; private set; } = new List<PinRow>();

    public AnnotatePreviewWindow(IReadOnlyList<PlannedView> views, IReadOnlyList<PinRow> pins, IReadOnlyList<string> words)
    {
        Title = "Sentinel — Annotate: views and pins";
        Width = 760; Height = 680; MinWidth = 480; MinHeight = 380;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var header = new TextBlock
        {
            Text = string.Join("\n", words) + "\n\nPre-ticked where it can be created or pinned: the guideline's first FloorPlan entry and first " +
                   "CeilingPlan entry for each story level, and every unpinned story level and grid. The rest are listed for you to tick; a greyed row says why it cannot be.",
            TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8),
        };

        var tree = new TreeView { BorderThickness = new Thickness(0) };
        foreach (var level in views.GroupBy(v => v.LevelName))
        {
            bool story = level.First().IsStory;
            var node = new TreeViewItem
            {
                Header = $"{level.Key}{(story ? "" : " — not a Building Story")} — {level.Count()} view(s)",
                IsExpanded = story, FontWeight = FontWeights.Bold,
            };
            foreach (var v in level)
            {
                string template = string.IsNullOrWhiteSpace(v.Template) ? "no template named"
                    : v.TemplateInModel ? "template " + v.Template : "template " + v.Template + " not in this model — created without it";
                var box = Row(node, $"{v.Name ?? "(no name)"}  ·  {v.Use}  ·  {template}", v.PreTicked, v.Refusal);
                if (v.Refusal == null) _views.Add((box, v));
            }
            tree.Items.Add(node);
        }
        var pinNode = new TreeViewItem { Header = $"Pin — {pins.Count} unpinned level(s) and grid(s)", IsExpanded = true, FontWeight = FontWeights.Bold };
        foreach (var p in pins)
        {
            var box = Row(pinNode, p.Label, p.PreTicked, p.Refusal);
            if (p.Refusal == null) _pins.Add((box, p));
        }
        tree.Items.Add(pinNode);

        var create = new Button { Content = "Create ▶", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0), IsDefault = true };
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(10, 5, 10, 5), IsCancel = true };
        create.Click += (_, __) => Accept();
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
        buttons.Children.Add(create);
        buttons.Children.Add(cancel);
        var footer = new StackPanel();
        footer.Children.Add(_status);
        footer.Children.Add(buttons);

        var root = new DockPanel { Margin = new Thickness(14) };
        DockPanel.SetDock(header, Dock.Top);
        DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(header);
        root.Children.Add(footer);
        root.Children.Add(tree);
        Content = root;
        ShowCount();
    }

    private CheckBox Row(TreeViewItem node, string text, bool ticked, string? refusal)
    {
        var box = new CheckBox { IsChecked = refusal == null && ticked, IsEnabled = refusal == null, VerticalAlignment = VerticalAlignment.Center };
        box.Click += (_, __) => ShowCount();
        var label = new TextBlock
        {
            Text = refusal == null ? text : text + "  —  " + refusal,
            Margin = new Thickness(6, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.Normal,
        };
        if (refusal != null) label.Foreground = Greyed;
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(box);
        row.Children.Add(label);
        node.Items.Add(new TreeViewItem { Header = row, Focusable = false, FontWeight = FontWeights.Normal });
        return box;
    }

    private void ShowCount() =>
        _status.Text = $"{_views.Count(r => r.Box.IsChecked == true)} of {_views.Count} creatable view(s) and " +
                       $"{_pins.Count(r => r.Box.IsChecked == true)} of {_pins.Count} datum(s) to pin are ticked.";

    private void Accept()
    {
        Views = _views.Where(r => r.Box.IsChecked == true).Select(r => r.View).ToList();
        Pins = _pins.Where(r => r.Box.IsChecked == true).Select(r => r.Pin).ToList();
        DialogResult = true;
        Close();
    }
}
