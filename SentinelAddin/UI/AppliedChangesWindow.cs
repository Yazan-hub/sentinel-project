#nullable disable
// Revert (2026-10-20): Applied AI Changes — every applied changeset of the project, newest first, each with what the last saved model held of it
// (RevertPlan.State) and any revert. Check revert runs the revert in Revit and rolls it back (ChangesetReverter, commit false), so the person
// reads exactly what would go back and what is kept, and why; Revert needs their reason and runs it for real. Modeless, code-only WPF
// (ChangesetPickerWindow's pattern); every setter marshals itself.
using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

namespace Sentinel.UI;

public sealed class AppliedChangesWindow : Window
{
    public event Action<ChangesetDto> CheckRequested;
    public event Action<ChangesetDto, string> RevertRequested;

    private readonly TextBox _status = new() { Text = "Loading…", IsReadOnly = true, TextWrapping = TextWrapping.Wrap, MaxHeight = 120, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    private readonly ListBox _list = new() { Margin = new Thickness(0, 8, 0, 8), MinHeight = 140 };
    private readonly TextBox _preview = new() { IsReadOnly = true, TextWrapping = TextWrapping.Wrap, Height = 140, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        Text = "Select a changeset and press Check revert — Sentinel shows what would go back and what would be kept, before anything changes." };
    private readonly TextBox _reason = new() { Margin = new Thickness(0, 4, 0, 8), TextWrapping = TextWrapping.Wrap, MaxLength = 500 };
    private readonly Button _check = new() { Content = "Check revert", Padding = new Thickness(12, 4, 12, 4), Margin = new Thickness(0, 0, 8, 0), IsEnabled = false };
    private readonly Button _revert = new() { Content = "Revert", Padding = new Thickness(12, 4, 12, 4), FontWeight = FontWeights.Bold, IsEnabled = false };
    private ChangesetDto _checked; // the changeset the preview is of; Revert acts on it only
    private bool _mayRevert;

    public AppliedChangesWindow(string key)
    {
        Title = $"Sentinel — Applied AI changes: {key}";
        Width = 760; Height = 640; WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var root = new DockPanel { Margin = new Thickness(10) };
        DockPanel.SetDock(_status, Dock.Top);
        root.Children.Add(_status);
        var bottom = new StackPanel();
        bottom.Children.Add(new TextBlock { Text = "What reverting it would do", FontWeight = FontWeights.Bold, Margin = new Thickness(0, 4, 0, 4) });
        bottom.Children.Add(_preview);
        bottom.Children.Add(new TextBlock { Text = "Why you revert it (recorded on the ledger with your name)", Margin = new Thickness(0, 8, 0, 0) });
        bottom.Children.Add(_reason);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(_check);
        buttons.Children.Add(_revert);
        bottom.Children.Add(buttons);
        DockPanel.SetDock(bottom, Dock.Bottom);
        root.Children.Add(bottom);
        ScrollViewer.SetHorizontalScrollBarVisibility(_list, ScrollBarVisibility.Disabled);
        root.Children.Add(_list);
        Content = root;
        _list.SelectionChanged += (_, _) =>
        {
            _check.IsEnabled = _mayRevert && Selected != null;
            _revert.IsEnabled = _mayRevert && _checked != null && ReferenceEquals(Selected, _checked);
        };
        _check.Click += (_, _) => { if (Selected is { } cs) { _check.IsEnabled = _revert.IsEnabled = false; _preview.Text = "Checking in the model…"; CheckRequested?.Invoke(cs); } };
        _revert.Click += (_, _) =>
        {
            if (_checked == null) return;
            var reason = RevertPlan.Reason(_reason.Text, out var problem);
            if (reason == null) { MessageBox.Show(this, problem, Title); return; }
            if (MessageBox.Show(this, $"Revert \"{_checked.Name}\" in this model now? It is one Undo step, recorded on the ledger with your reason.", Title, MessageBoxButton.OKCancel) != MessageBoxResult.OK) return;
            _check.IsEnabled = _revert.IsEnabled = false;
            _preview.Text = "Reverting…";
            RevertRequested?.Invoke(_checked, reason);
        };
    }

    private ChangesetDto Selected => (_list.SelectedItem as ListBoxItem)?.Tag as ChangesetDto;

    /// <summary>The applied changesets with their lines, the status, and whether this person may revert (a contributor or above). Any thread.</summary>
    public void SetList(List<(string Line, ChangesetDto Cs)> rows, string status, bool mayRevert)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetList(rows, status, mayRevert))); return; }
        _mayRevert = mayRevert;
        _status.Text = status ?? "";
        _list.Items.Clear();
        foreach (var (line, cs) in rows)
        {
            var text = new TextBlock { Text = line, TextWrapping = TextWrapping.Wrap };
            if (cs.Persisted?.State == "lost") text.Foreground = Brushes.DarkOrange;
            _list.Items.Add(new ListBoxItem { Content = text, Tag = cs, Padding = new Thickness(4, 3, 4, 3) });
        }
        _checked = null;
        _check.IsEnabled = _revert.IsEnabled = false;
    }

    /// <summary>The preview of <paramref name="cs"/>; Revert is offered only when something would go back. Any thread.</summary>
    public void ShowPreview(ChangesetDto cs, string text, bool canRevert)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => ShowPreview(cs, text, canRevert))); return; }
        _preview.Text = text;
        _checked = canRevert ? cs : null;
        _check.IsEnabled = _mayRevert && Selected != null;
        _revert.IsEnabled = _mayRevert && _checked != null && ReferenceEquals(Selected, _checked);
    }

    /// <summary>Words in the preview box (a revert's outcome). Any thread.</summary>
    public void Say(string text)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => Say(text))); return; }
        _preview.Text = text;
        _check.IsEnabled = _mayRevert && Selected != null;
    }
}
