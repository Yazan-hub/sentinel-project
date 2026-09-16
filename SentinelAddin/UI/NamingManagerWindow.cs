// Naming Manager: every family/type in scope of a Family/Type rule, current name → proposed name, the
// proposer's verdict with its reason, filters, and Rename ticked. Proposals are suggestions — a blank
// proposal means "needs a human", a Blocked row is a duplicate to merge, never to suffix. Modeless,
// code-only WPF. Never touches the Revit API — it raises events.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Standards;
using Sentinel.Workflow;

namespace Sentinel.UI;

public sealed class NamingManagerWindow : Window
{
    public event Action<List<NamingRow>>? RenameRequested;
    public event Action<NamingRow>? SelectRequested;
    public event Action? RescanRequested;

    private List<NamingRow> _rows;
    private readonly StackPanel _list = new();
    private readonly ComboBox _rule = new() { Width = 90, Margin = new Thickness(0, 0, 6, 0) };
    private readonly ComboBox _category = new() { Width = 130, Margin = new Thickness(0, 0, 6, 0) };
    private readonly ComboBox _verdict = new() { Width = 120, Margin = new Thickness(0, 0, 6, 0) };
    private readonly TextBox _search = new() { Width = 160, Margin = new Thickness(0, 0, 6, 0) };
    private readonly TextBlock _status = new() { Foreground = Brushes.Gray, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) };
    private readonly List<(CheckBox Box, TextBox Value, NamingRow Row)> _visible = new();
    private readonly List<Button> _actions = new();

    public NamingManagerWindow(List<NamingRow> rows)
    {
        _rows = rows;
        Title = "Sentinel — Naming Manager";
        Width = 980; Height = 640; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };
        var filters = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
        filters.Children.Add(new TextBlock { Text = "Rule", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) });
        filters.Children.Add(_rule);
        filters.Children.Add(new TextBlock { Text = "Category", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) });
        filters.Children.Add(_category);
        filters.Children.Add(new TextBlock { Text = "Verdict", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) });
        filters.Children.Add(_verdict);
        filters.Children.Add(new TextBlock { Text = "Search", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) });
        filters.Children.Add(_search);
        foreach (var cb in new[] { _rule, _category, _verdict }) cb.SelectionChanged += (_, _) => Render();
        _search.TextChanged += (_, _) => Render();
        DockPanel.SetDock(filters, Dock.Top);
        root.Children.Add(filters);

        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(Btn("Tick all proposed", () => { foreach (var v in _visible.Where(v => v.Row.Verdict == NameVerdict.Proposed)) v.Box.IsChecked = true; }));
        buttons.Children.Add(Btn("Untick all", () => { foreach (var v in _visible) v.Box.IsChecked = false; }));
        buttons.Children.Add(Btn("Select instances", () => { var v = _visible.FirstOrDefault(x => x.Box.IsChecked == true); if (v.Row != null) SelectRequested?.Invoke(v.Row); else SetStatus("Tick a row first."); }));
        buttons.Children.Add(Btn("Rescan", () => RescanRequested?.Invoke()));
        buttons.Children.Add(Btn("Rename ticked", Rename, bold: true));
        foot.Children.Add(buttons);
        foot.Children.Add(_status);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        root.Children.Add(new ScrollViewer { Content = _list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
        FillFilters();
        Render();
    }

    private Button Btn(string text, Action click, bool bold = false)
    {
        var b = new Button { Content = text, Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(6, 0, 0, 0), FontWeight = bold ? FontWeights.Bold : FontWeights.Normal };
        b.Click += (_, _) => click();
        _actions.Add(b);
        return b;
    }

    private void FillFilters()
    {
        void Fill(ComboBox cb, IEnumerable<string> items)
        {
            var keep = cb.SelectedItem as string;
            cb.ItemsSource = new[] { "(all)" }.Concat(items.Distinct().OrderBy(s => s)).ToList();
            cb.SelectedItem = keep != null && cb.Items.Contains(keep) ? keep : "(all)";
        }
        Fill(_rule, _rows.Select(r => r.RuleId));
        Fill(_category, _rows.Select(r => r.Category));
        Fill(_verdict, Enum.GetNames(typeof(NameVerdict)));
    }

    private void Render()
    {
        CommitEdits();
        _visible.Clear();
        _list.Children.Clear();
        string? Sel(ComboBox cb) => cb.SelectedItem as string is { } s && s != "(all)" ? s : null;
        var rule = Sel(_rule); var cat = Sel(_category); var verdict = Sel(_verdict); var q = _search.Text.Trim();
        var shown = _rows.Where(r => (rule == null || r.RuleId == rule) && (cat == null || r.Category == cat)
                                     && (verdict == null || r.Verdict.ToString() == verdict)
                                     && (q.Length == 0 || r.Current.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0 || r.Proposed.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0))
                         .OrderBy(r => r.Verdict == NameVerdict.Conforming).ThenBy(r => r.Category).ThenBy(r => r.Current).ToList();
        foreach (var row in shown) _list.Children.Add(MakeRow(row));
        var counts = _rows.GroupBy(r => r.Verdict).ToDictionary(g => g.Key, g => g.Count());
        int C(NameVerdict v) => counts.TryGetValue(v, out var n) ? n : 0;
        SetStatus($"{shown.Count} shown of {_rows.Count} · conforming {C(NameVerdict.Conforming)} · proposed {C(NameVerdict.Proposed)} · needs human {C(NameVerdict.NeedsHuman)} · blocked {C(NameVerdict.Blocked)}");
    }

    private UIElement MakeRow(NamingRow row)
    {
        var grid = new Grid { Margin = new Thickness(0, 2, 0, 2) };
        foreach (var w in new[] { 24.0, 200.0, 260.0, 260.0, 0.0, 60.0 })
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = w == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(w) });
        var editable = row.Verdict is NameVerdict.Proposed or NameVerdict.NeedsHuman;
        var box = new CheckBox { IsChecked = row.Ticked, IsEnabled = editable, VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(box, 0); grid.Children.Add(box);
        var meta = new TextBlock { Text = $"{row.Category}\n{row.FamilyName}", Foreground = Brushes.Gray, FontSize = 11, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
        Grid.SetColumn(meta, 1); grid.Children.Add(meta);
        var cur = new TextBlock { Text = row.Current, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(4, 0, 8, 0) };
        cur.ToolTip = row.Current;
        Grid.SetColumn(cur, 2); grid.Children.Add(cur);
        var val = new TextBox { Text = row.Proposed, IsEnabled = editable, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0) };
        Grid.SetColumn(val, 3); grid.Children.Add(val);
        var (text, brush) = row.Verdict switch
        {
            NameVerdict.Conforming => ("✓ conforming", Brushes.LightGreen),
            NameVerdict.Proposed => ("proposed", Brushes.DodgerBlue),
            NameVerdict.NeedsHuman => ("needs a human — " + row.Note, Brushes.Orange),
            _ => ("BLOCKED — " + row.Note, Brushes.IndianRed),
        };
        var v = new TextBlock { Text = text, Foreground = brush, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
        v.ToolTip = row.Note.Length == 0 ? text : row.Note;
        Grid.SetColumn(v, 4); grid.Children.Add(v);
        var inst = new TextBlock { Text = row.Instances.ToString(), Foreground = Brushes.Gray, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
        inst.ToolTip = "instances in the model";
        Grid.SetColumn(inst, 5); grid.Children.Add(inst);
        _visible.Add((box, val, row));
        return grid;
    }

    private void CommitEdits()
    {
        foreach (var v in _visible) { v.Row.Ticked = v.Box.IsChecked == true; v.Row.Proposed = v.Value.Text; }
    }

    private void Rename()
    {
        CommitEdits();
        var ticked = _rows.Where(r => r.Ticked && r.Verdict is NameVerdict.Proposed or NameVerdict.NeedsHuman && r.Proposed.Trim().Length > 0).ToList();
        if (ticked.Count == 0) { SetStatus("Tick at least one row with a name to rename."); return; }
        RenameRequested?.Invoke(ticked);
    }

    public void SetRows(List<NamingRow> rows) => Dispatcher.Invoke(() =>
    {
        _visible.Clear();
        _rows = rows;
        FillFilters();
        Render();
        SetStatus(_status.Text + " — rows rescanned — unsaved edits were discarded");
    });
    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);
    public void SetBusy(bool busy) => Dispatcher.Invoke(() =>
    {
        foreach (var b in _actions) b.IsEnabled = !busy;
        _list.IsEnabled = !busy;
        _rule.IsEnabled = !busy; _category.IsEnabled = !busy; _verdict.IsEnabled = !busy; _search.IsEnabled = !busy;
    });
}
