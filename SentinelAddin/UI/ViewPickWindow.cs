using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Autodesk.Revit.DB;

namespace Sentinel.UI;

/// <summary>
/// Choose which Revit views to publish to the web app's Views tab — Revit's own "Publish Settings"
/// dialog (used for ACC/Forma), reimplemented for Sentinel: one group per <see cref="ViewType"/>
/// (Floor Plans, Sections, Elevations, 3D Views, …), one checkbox row per view. Modal; ShowDialog() ==
/// true means Publish was pressed, and <see cref="SelectedViewIds"/> holds the ticked views.
///
/// Built in code with no XAML pair, same idiom as <see cref="DwgPickWindow"/> (modal/result-property
/// shape) and <see cref="GhostReviewWindow"/> (grouped TreeView + checkbox-per-row population).
/// </summary>
public sealed class ViewPickWindow : Window
{
    private readonly TreeView _tree = new() { BorderThickness = new Thickness(0) };
    private readonly TextBlock _status;
    private readonly List<(CheckBox Box, View View)> _rows = new();

    public IReadOnlyList<ElementId> SelectedViewIds { get; private set; } = Array.Empty<ElementId>();

    public ViewPickWindow(IReadOnlyList<View> views, IReadOnlyCollection<string>? preSelectedUniqueIds = null)
    {
        Title = "Sentinel — Publish Views";
        Width = 560; Height = 620; MinWidth = 420; MinHeight = 360;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var pre = new HashSet<string>(preSelectedUniqueIds ?? Array.Empty<string>());

        var header = new TextBlock
        {
            Text = "Only checked views appear in the web app's Views tab. Unchecking and republishing removes a view.",
            TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 0, 8),
        };

        var selectAll = new Button { Content = "Select All", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var selectNone = new Button { Content = "Select None", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        selectAll.Click += (_, __) => { foreach (var r in _rows) r.Box.IsChecked = true; };
        selectNone.Click += (_, __) => { foreach (var r in _rows) r.Box.IsChecked = false; };
        var toolbar = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 6) };
        toolbar.Children.Add(selectAll);
        toolbar.Children.Add(selectNone);

        _status = new TextBlock { Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(90, 90, 90)), Margin = new Thickness(0, 8, 0, 0) };

        var publish = new Button { Content = "Publish ▶", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0), IsDefault = true };
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(10, 5, 10, 5), IsCancel = true };
        publish.Click += (_, __) => Accept();
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
        buttons.Children.Add(publish);
        buttons.Children.Add(cancel);

        var footer = new StackPanel();
        footer.Children.Add(_status);
        footer.Children.Add(buttons);

        var root = new DockPanel { Margin = new Thickness(14) };
        DockPanel.SetDock(header, Dock.Top);
        DockPanel.SetDock(toolbar, Dock.Top);
        DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(header);
        root.Children.Add(toolbar);
        root.Children.Add(footer);
        root.Children.Add(_tree);
        Content = root;

        Load(views, pre);
    }

    private void Load(IReadOnlyList<View> views, HashSet<string> pre)
    {
        _tree.Items.Clear();
        _rows.Clear();

        foreach (var group in views.GroupBy(v => v.ViewType)
                                    .OrderBy(g => g.Key.ToString(), StringComparer.OrdinalIgnoreCase))
        {
            var node = new TreeViewItem
            {
                Header = $"{FriendlyType(group.Key)} — {group.Count()} view(s)",
                IsExpanded = true,
                FontWeight = FontWeights.Bold,
            };

            foreach (var v in group.OrderBy(v => v.Name, StringComparer.OrdinalIgnoreCase))
            {
                var cb = new CheckBox
                {
                    IsChecked = pre.Contains(v.UniqueId),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                string level = v is ViewPlan vpl && vpl.GenLevel is { } lv ? $"  ·  {lv.Name}" : "";
                var name = new TextBlock
                {
                    Text = v.Name + level,
                    Margin = new Thickness(6, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center,
                };
                var row = new StackPanel { Orientation = Orientation.Horizontal };
                row.Children.Add(cb);
                row.Children.Add(name);

                node.Items.Add(new TreeViewItem { Header = row, Focusable = false, HorizontalContentAlignment = HorizontalAlignment.Stretch });
                _rows.Add((cb, v));
            }

            _tree.Items.Add(node);
        }

        _status.Text = _rows.Count == 0
            ? "No publishable views found in this project."
            : $"{_rows.Count} view(s) available, {_rows.Count(r => r.Box.IsChecked == true)} pre-checked from the last publish.";
    }

    private static string FriendlyType(ViewType t) => t switch
    {
        ViewType.FloorPlan => "Floor Plans",
        ViewType.CeilingPlan => "Ceiling Plans",
        ViewType.Elevation => "Elevations",
        ViewType.Section => "Sections",
        ViewType.ThreeD => "3D Views",
        ViewType.DraftingView => "Drafting Views",
        ViewType.Detail => "Detail Views",
        ViewType.AreaPlan => "Area Plans",
        ViewType.Schedule => "Schedules",
        _ => t.ToString(),
    };

    private void Accept()
    {
        SelectedViewIds = _rows.Where(r => r.Box.IsChecked == true).Select(r => r.View.Id).ToList();
        DialogResult = true;
        Close();
    }
}
