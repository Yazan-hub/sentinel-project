using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace Sentinel.UI;

/// <summary>Choose which DWG plan from the project folder to build from — or fall back to
/// picking an import already in the model — and the drawing's units (MA-5b-2, DAT-4: a DXF with no $INSUNITS header is read
/// as inches; a metres drawing read as millimetres is 1000 x too small). Modal; ShowDialog() == true means a choice was made.</summary>
public sealed class DwgPickWindow : Window
{
    private readonly ListBox _list;
    private readonly ComboBox _units;

    /// <summary>The units the commands import the drawing in: "file" (the drawing's own header), "mm", "cm", "m", "in" or "ft".</summary>
    public static readonly (string Key, string Words)[] UnitChoices =
        { ("file", "as the file says"), ("mm", "millimetres"), ("cm", "centimetres"), ("m", "metres"), ("in", "inches"), ("ft", "feet") };

    public string? SelectedPath { get; private set; }
    public bool PickFromModel { get; private set; }
    public string Units { get; private set; } = "file";

    public DwgPickWindow(IReadOnlyList<string> files,
                         string? title = null,
                         string? header = null,
                         bool showPickFromModel = true)
    {
        Title = title ?? "Sentinel — Ghost Builder: choose a drawing";
        Width = 520; Height = 380; MinWidth = 380;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        _list = new ListBox { Margin = new Thickness(0, 6, 0, 6) };
        foreach (var f in files)
        {
            _list.Items.Add(new ListBoxItem { Content = Path.GetFileName(f), Tag = f });
        }
        if (_list.Items.Count > 0) _list.SelectedIndex = 0;
        _list.MouseDoubleClick += (_, __) => Accept();

        var build = new Button { Content = "Use selected drawing ▶", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0) };
        build.Click += (_, __) => Accept();
        var model = new Button { Content = "Pick from model…", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0) };
        model.Click += (_, __) => { PickFromModel = true; DialogResult = true; Close(); };
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(10, 5, 10, 5), IsCancel = true };

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(build);
        if (showPickFromModel) buttons.Children.Add(model);
        buttons.Children.Add(cancel);

        var headerText = new TextBlock
        {
            Text = header ?? "Drawings found in the project's Ghost source folder. The chosen one is imported origin-to-origin for this run and " +
                             "removed when the run ends (after a build, inside the build's one Undo) — a drawing you edit is read again.",
            TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.Bold,
        };

        _units = new ComboBox { Width = 160, Margin = new Thickness(6, 0, 0, 0) };
        foreach (var (key, words) in UnitChoices) _units.Items.Add(new ComboBoxItem { Content = words, Tag = key });
        _units.SelectedIndex = 0;
        var unitsRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
        unitsRow.Children.Add(new TextBlock { Text = "The drawing's units:", VerticalAlignment = VerticalAlignment.Center });
        unitsRow.Children.Add(_units);

        var root = new DockPanel { Margin = new Thickness(12) };
        DockPanel.SetDock(headerText, Dock.Top);
        DockPanel.SetDock(buttons, Dock.Bottom);
        DockPanel.SetDock(unitsRow, Dock.Bottom);
        root.Children.Add(headerText); root.Children.Add(buttons); root.Children.Add(unitsRow); root.Children.Add(_list);
        Content = root;
    }

    private void Accept()
    {
        SelectedPath = (_list.SelectedItem as ListBoxItem)?.Tag as string;
        if (SelectedPath == null) return;
        Units = (_units.SelectedItem as ComboBoxItem)?.Tag as string ?? "file";
        DialogResult = true;
        Close();
    }
}
