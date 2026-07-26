using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace Sentinel.UI;

/// <summary>Choose which DWG plan from the project folder to build from — or fall back to
/// picking an import already in the model. Modal; ShowDialog() == true means a choice was made.</summary>
public sealed class DwgPickWindow : Window
{
    private readonly ListBox _list;

    public string? SelectedPath { get; private set; }
    public bool PickFromModel { get; private set; }

    public DwgPickWindow(IReadOnlyList<string> files, IReadOnlyCollection<string>? alreadyImportedNames = null)
    {
        Title = "Sentinel — Ghost Builder: choose a drawing";
        Width = 520; Height = 380; MinWidth = 380;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var imported = new HashSet<string>(alreadyImportedNames ?? System.Array.Empty<string>(),
            System.StringComparer.OrdinalIgnoreCase);

        _list = new ListBox { Margin = new Thickness(0, 6, 0, 6) };
        foreach (var f in files)
        {
            var label = Path.GetFileName(f);
            if (imported.Contains(Path.GetFileNameWithoutExtension(f))) label += " (already imported)";
            _list.Items.Add(new ListBoxItem { Content = label, Tag = f });
        }
        if (_list.Items.Count > 0) _list.SelectedIndex = 0;
        _list.MouseDoubleClick += (_, __) => Accept();

        var build = new Button { Content = "Use selected drawing ▶", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0) };
        build.Click += (_, __) => Accept();
        var model = new Button { Content = "Pick from model…", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0) };
        model.Click += (_, __) => { PickFromModel = true; DialogResult = true; Close(); };
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(10, 5, 10, 5), IsCancel = true };

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(build); buttons.Children.Add(model); buttons.Children.Add(cancel);

        var header = new TextBlock
        {
            Text = "Drawings found in the project's Ghost source folder. The chosen one is imported origin-to-origin and kept in the model.",
            TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.Bold,
        };

        var root = new DockPanel { Margin = new Thickness(12) };
        DockPanel.SetDock(header, Dock.Top);
        DockPanel.SetDock(buttons, Dock.Bottom);
        root.Children.Add(header); root.Children.Add(buttons); root.Children.Add(_list);
        Content = root;
    }

    private void Accept()
    {
        SelectedPath = (_list.SelectedItem as ListBoxItem)?.Tag as string;
        if (SelectedPath == null) return;
        DialogResult = true;
        Close();
    }
}
