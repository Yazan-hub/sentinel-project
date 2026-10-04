#nullable disable
// MA-3b (AI-5): every changeset waiting for review on a project, oldest first — a Promote storey as one entry — each with its age, its
// source, its ghosts by the referee's verdict and the web's declines (StoreyBatch.Line). It opens at once ("Loading…"); the list arrives
// from a pool thread (SetEntries marshals itself). An entry whose result waits on this PC (UnreportedResults) is listed with the reason
// and cannot be opened. Review (or a double-click) hands the entry to ReviewChangesetsCommand. Modeless, code-only WPF.
using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

public sealed class ChangesetPickerWindow : Window
{
    public event Action<List<ChangesetDto>> Chosen;

    private readonly TextBox _status = new()
    {
        Text = "Loading…", IsReadOnly = true, TextWrapping = TextWrapping.Wrap, MaxHeight = 160, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
    };
    private readonly ListBox _list = new() { Margin = new Thickness(0, 8, 0, 8) };
    private readonly Button _open = new() { Content = "Review", Padding = new Thickness(12, 4, 12, 4), FontWeight = FontWeights.Bold, IsEnabled = false };
    private volatile bool _gone;
    /// <summary>Review C11: the person closed the picker — read from any thread; the round's words then go to the Doctor log and a dialog.</summary>
    public bool Gone => _gone;

    public ChangesetPickerWindow(string key)
    {
        Closed += (_, _) => _gone = true;
        Title = $"Sentinel — AI proposals waiting: {key}";
        Width = 720; Height = 420; WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var root = new DockPanel { Margin = new Thickness(10) };
        DockPanel.SetDock(_status, Dock.Top);
        root.Children.Add(_status);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(_open);
        DockPanel.SetDock(buttons, Dock.Bottom);
        root.Children.Add(buttons);
        ScrollViewer.SetHorizontalScrollBarVisibility(_list, ScrollBarVisibility.Disabled);
        root.Children.Add(_list);
        Content = root;
        _list.SelectionChanged += (_, _) => _open.IsEnabled = (_list.SelectedItem as ListBoxItem)?.Tag is List<ChangesetDto>;
        _open.Click += (_, _) => Choose();
        _list.MouseDoubleClick += (_, _) => Choose();
    }

    private void Choose()
    {
        if ((_list.SelectedItem as ListBoxItem)?.Tag is List<ChangesetDto> entry) Chosen?.Invoke(entry);
    }

    /// <summary>The entries — each one's line, why it cannot be opened (null when it can) and its changesets — and the status. Any thread.
    /// MA-3b4 (MA-3b2b's gap): <paramref name="gone"/> runs when the picker was closed in between — the caller's dialog.</summary>
    public void SetEntries(List<(string Line, string Blocked, List<ChangesetDto> Entry)> entries, string status, Action gone = null)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetEntries(entries, status, gone))); return; }
        // Review C11: closed between the caller's Gone check and now — the words go to the Doctor log, never to a closed window.
        if (_gone) { if (!string.IsNullOrEmpty(status)) App.PanelVm?.LogDoctor("Review AI Proposals: " + status); gone?.Invoke(); return; }
        _status.Text = status ?? "";
        _list.Items.Clear();
        foreach (var (line, blocked, entry) in entries)
        {
            var text = new TextBlock { Text = blocked == null ? line : line + "\n⚠ " + blocked, TextWrapping = TextWrapping.Wrap };
            if (blocked != null) text.Foreground = Brushes.DarkOrange;
            _list.Items.Add(new ListBoxItem { Content = text, Tag = blocked == null ? entry : null, Padding = new Thickness(4, 3, 4, 3) });
        }
        _open.IsEnabled = false;
    }
}
