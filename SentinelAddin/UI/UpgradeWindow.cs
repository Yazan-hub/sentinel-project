using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;

namespace Sentinel.UI;

/// <summary>
/// Batch Upgrade Files review gate. One row per .rvt/.rfa found in the picked folder, its detected
/// saved version + flavor, and a target-version dropdown of installed Revits. Downgrades (detected
/// version > target) are disabled and refused outright — the Version Bridge for downgrades isn't
/// built yet, and silently "upgrading" backwards would corrupt the file. Rows recompute whenever the
/// target changes so the ticks always reflect the currently selected target.
/// </summary>
public sealed class UpgradeWindow : Window
{
    private readonly IReadOnlyList<(string Path, string Version, string Flavor)> _rows;
    private readonly List<(CheckBox Box, TextBlock Label, string Path, string Version)> _items = new();
    private readonly ComboBox _targetBox = new() { MinWidth = 100, Margin = new Thickness(6, 0, 12, 0) };
    private readonly Button _ok;

    public string? TargetVersion { get; private set; }
    public IReadOnlyList<string> TickedPaths { get; private set; } = Array.Empty<string>();

    public UpgradeWindow(IReadOnlyList<(string path, string version, string flavor)> rows,
                         IReadOnlyList<string> installedVersions, string currentVersion)
    {
        _rows = rows;

        Title = "Sentinel — Upgrade Files";
        Width = 620; Height = 500; MinWidth = 420;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var header = new TextBlock
        {
            Text = "Upgraded copies are written to an 'upgraded-<version>' subfolder. Sources are never " +
                   "modified. Workshared files are detached. Downgrading needs the Version Bridge (not built yet).",
            FontWeight = FontWeights.Bold, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8),
        };

        var list = new StackPanel { Margin = new Thickness(0, 6, 0, 6) };
        var scroll = new ScrollViewer { Content = list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };

        foreach (var r in rows)
        {
            var cb = new CheckBox { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 3, 6, 3) };
            var label = new TextBlock { VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap };
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            row.Children.Add(cb);
            row.Children.Add(label);
            list.Children.Add(row);
            _items.Add((cb, label, r.path, r.version));
            cb.Checked += (_, __) => UpdateOk();
            cb.Unchecked += (_, __) => UpdateOk();
        }

        foreach (var v in installedVersions) _targetBox.Items.Add(v);
        _targetBox.SelectedIndex = Math.Max(0, installedVersions.ToList().IndexOf(currentVersion));
        _targetBox.SelectionChanged += (_, __) => Recompute();

        _ok = new Button { Content = "Upgrade 0 file(s) ▶", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0), IsEnabled = false };
        _ok.Click += (_, __) => Accept();
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(10, 5, 10, 5), IsCancel = true };

        var targetRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 6) };
        targetRow.Children.Add(new TextBlock { Text = "Target version:", VerticalAlignment = VerticalAlignment.Center });
        targetRow.Children.Add(_targetBox);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 8, 0, 0) };
        buttons.Children.Add(_ok);
        buttons.Children.Add(cancel);

        var root = new DockPanel { Margin = new Thickness(12) };
        DockPanel.SetDock(header, Dock.Top);
        DockPanel.SetDock(targetRow, Dock.Top);
        DockPanel.SetDock(buttons, Dock.Bottom);
        root.Children.Add(header);
        root.Children.Add(targetRow);
        root.Children.Add(buttons);
        root.Children.Add(scroll);
        Content = root;

        Recompute();
    }

    // Row rule per the brief: detected > target -> disabled + refused; == target -> unticked, already
    // this version; empty -> unticked, unknown; < target -> ticked. Recomputed on every target change.
    private void Recompute()
    {
        if (_targetBox.SelectedItem is not string target) return;
        bool targetIsNum = int.TryParse(target, out int t);

        for (int i = 0; i < _items.Count; i++)
        {
            var (cb, label, path, version) = _items[i];
            var (path2, ver2, flavor) = _rows[i];
            string suffix;
            bool enabled = true, ticked;

            if (string.IsNullOrWhiteSpace(version))
            {
                ticked = false;
                suffix = " · version unknown";
            }
            else if (targetIsNum && int.TryParse(version, out int v))
            {
                if (v > t) { ticked = false; enabled = false; suffix = " · downgrade — refused"; }
                else if (v == t) { ticked = false; suffix = " · already this version"; }
                else { ticked = true; suffix = ""; }
            }
            else
            {
                ticked = false;
                suffix = " · version unknown";
            }

            cb.IsEnabled = enabled;
            cb.IsChecked = ticked;
            label.Text = $"{System.IO.Path.GetFileName(path)} · {(string.IsNullOrWhiteSpace(version) ? "unknown" : version)} · {flavor}{suffix}";
        }
        UpdateOk();
    }

    private void UpdateOk()
    {
        int n = _items.Count(x => x.Box.IsEnabled && x.Box.IsChecked == true);
        _ok.IsEnabled = n > 0;
        _ok.Content = $"Upgrade {n} file(s) ▶";
    }

    private void Accept()
    {
        TargetVersion = _targetBox.SelectedItem as string;
        TickedPaths = _items.Where(x => x.Box.IsEnabled && x.Box.IsChecked == true).Select(x => x.Path).ToList();
        DialogResult = true;
        Close();
    }
}
