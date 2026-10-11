using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.GhostBuilder;

namespace Sentinel.UI;

/// <summary>
/// MA-5b-7 (DAT-2): Datum's review — one row per level read (tick, name, elevation in mm from ±0.00, Building Story) and per grid (tick,
/// name, where it runs), the ±0.00 anchor above the levels, the source of the read (layers@n's datum section or the built-in words) and its
/// notes above all. Nothing is created from a row left unticked. Create is refused here, in words, while a ticked name is blank or repeated,
/// an elevation is no number or two levels share one (DatumRows.Check). Modal and built in code, AnnotatePreviewWindow's idiom:
/// ShowDialog() == true means Create was pressed and <see cref="Rows"/> holds what was typed.
/// </summary>
public sealed class DatumReviewWindow : Window
{
    private readonly List<DatumRow> _rows;
    private readonly List<(DatumRow Row, CheckBox Tick, TextBox Name, TextBox Elevation, CheckBox Story)> _levels = new();
    private readonly List<(DatumRow Row, CheckBox Tick, TextBox Name)> _grids = new();
    private readonly ComboBox _anchor = new() { MinWidth = 220, Margin = new Thickness(6, 0, 0, 0) };
    private int _applied = -1;        // the level ±0.00 is on now (review: a refused move goes back to it)
    private bool _reverting;
    private readonly TextBlock _status = new() { Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap };
    private static readonly Brush Bad = new SolidColorBrush(Color.FromRgb(176, 32, 32));

    public IReadOnlyList<DatumRow> Rows => _rows;

    public DatumReviewWindow(List<DatumRow> rows, string source, IReadOnlyList<string> notes)
    {
        _rows = rows;
        Title = "Sentinel — Datum from Drawings: review";
        Width = 720; Height = 680; MinWidth = 480; MinHeight = 380;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var header = new TextBlock
        {
            Text = "Read from: " + source + (notes.Count > 0 ? "\n\n" + string.Join("\n", notes.Select(n => "• " + n)) : "") +
                   "\n\nUntick what is not a level or grid (a parapet line, a section mark), type the names your office uses, and set ±0.00 on the level " +
                   "the building is measured from — a level below it reads negative. Nothing is created until you press Create.",
            TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8),
        };

        var body = new StackPanel();
        var levelRows = rows.Where(r => !r.IsGrid).ToList();
        if (levelRows.Count > 0)
        {
            body.Children.Add(Heading($"Levels — {levelRows.Count} read"));
            var anchorRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 6) };
            anchorRow.Children.Add(new TextBlock { Text = "±0.00 at:", VerticalAlignment = VerticalAlignment.Center });
            anchorRow.Children.Add(_anchor);
            body.Children.Add(anchorRow);
            body.Children.Add(Columns("Create", "Name", "Elevation (mm from ±0.00)", "Building Story"));
            foreach (var r in levelRows)
            {
                var tick = new CheckBox { IsChecked = r.Tick, VerticalAlignment = VerticalAlignment.Center };
                var name = new TextBox { Text = r.Name, Margin = new Thickness(4, 2, 4, 2) };
                var elev = new TextBox { Text = r.Elevation, Margin = new Thickness(4, 2, 4, 2) };
                // review: the ±0.00 list shows each level's name as it is typed now, never the name it was read with
                var item = new ComboBoxItem();
                item.SetBinding(ContentControl.ContentProperty, new System.Windows.Data.Binding("Text") { Source = name });
                _anchor.Items.Add(item);
                var story = new CheckBox { IsChecked = r.Story, VerticalAlignment = VerticalAlignment.Center };
                _levels.Add((r, tick, name, elev, story));
                body.Children.Add(Line(tick, name, elev, story));
            }
            _anchor.SelectedIndex = _applied = levelRows.FindIndex(r => DatumRows.Mm(r.Elevation) == 0);
            _anchor.SelectionChanged += (_, __) => MoveAnchor();
        }
        var gridRows = rows.Where(r => r.IsGrid).ToList();
        if (gridRows.Count > 0)
        {
            body.Children.Add(Heading($"Grids — {gridRows.Count} read"));
            body.Children.Add(Columns("Create", "Name", "Runs (mm)", ""));
            foreach (var r in gridRows)
            {
                var tick = new CheckBox { IsChecked = r.Tick, VerticalAlignment = VerticalAlignment.Center };
                var name = new TextBox { Text = r.Name, Margin = new Thickness(4, 2, 4, 2) };
                var runs = new TextBlock
                {
                    Text = Runs(r.Grid),
                    VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4, 0, 0, 0), TextWrapping = TextWrapping.Wrap,
                };
                _grids.Add((r, tick, name));
                body.Children.Add(Line(tick, name, runs, null));
            }
        }

        // review: no IsDefault — Enter in a name or an elevation box must not create the datum before the review is done
        var create = new Button { Content = "Create ▶", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0) };
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
        root.Children.Add(new ScrollViewer { Content = body, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
    }

    // MA-5b-8 (DAT-5): how a grid runs — an arc by its centre, radius and sweep; a line by its ends, and its angle when it is not square.
    private static string Runs(DetectedGrid g)
    {
        string kind = g.Vertical ? "numbered" : "lettered";
        if (g.IsArc) return $"{kind}, arc: centre ({g.Cx:0}, {g.Cy:0}), radius {g.R:0}, {g.StartDeg:0.#}°–{g.EndDeg:0.#}°";
        double off = System.Math.Min(System.Math.Abs(g.AngleDeg % 90), 90 - System.Math.Abs(g.AngleDeg % 90));
        return $"{kind}{(off > 1.2 ? $", at {(g.AngleDeg + 180) % 180:0.#}°" : "")}: ({g.X1:0}, {g.Y1:0}) → ({g.X2:0}, {g.Y2:0})";
    }

    private static TextBlock Heading(string text) => new() { Text = text, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 10, 0, 4) };

    private static Grid Columns(params string[] heads)
    {
        var g = Frame();
        for (int i = 0; i < heads.Length; i++)
        {
            var t = new TextBlock { Text = heads[i], FontWeight = FontWeights.SemiBold, Margin = new Thickness(4, 0, 4, 2) };
            Grid.SetColumn(t, i);
            g.Children.Add(t);
        }
        return g;
    }

    private static Grid Line(UIElement a, UIElement b, UIElement c, UIElement? d)
    {
        var g = Frame();
        int i = 0;
        foreach (var e in new[] { a, b, c, d })
        {
            if (e != null) { Grid.SetColumn(e, i); g.Children.Add(e); }
            i++;
        }
        if (d == null) Grid.SetColumnSpan(c, 2); // drill MA5b batch 2 (F-4): a grid's run (an arc's centre, radius and sweep) has the room
        return g;
    }

    private static Grid Frame()
    {
        var g = new Grid();
        foreach (var w in new[] { 60.0, 200.0, 220.0, 120.0 }) g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(w) });
        return g;
    }

    // What is typed, into the rows.
    private void Sync()
    {
        foreach (var (row, tick, name, elev, story) in _levels) { row.Tick = tick.IsChecked == true; row.Name = name.Text; row.Elevation = elev.Text; row.Story = story.IsChecked == true; }
        foreach (var (row, tick, name) in _grids) { row.Tick = tick.IsChecked == true; row.Name = name.Text; }
    }

    // ±0.00 moved: every level's elevation shifted by what the chosen level reads now (what was typed).
    private void MoveAnchor()
    {
        if (_reverting || _anchor.SelectedIndex < 0) return;
        Sync();
        string? why = DatumRows.Anchor(_rows, _rows.IndexOf(_levels[_anchor.SelectedIndex].Row));
        if (why != null)
        {
            // review: refused — ±0.00 stays where it was, and the list says so
            _reverting = true; _anchor.SelectedIndex = _applied; _reverting = false;
            Say(why, true);
            return;
        }
        _applied = _anchor.SelectedIndex;
        foreach (var (row, _, _, elev, _) in _levels) elev.Text = row.Elevation;
        Say($"±0.00 is {_levels[_anchor.SelectedIndex].Name.Text} — every elevation moved with it.", false);
    }

    private void Say(string text, bool bad)
    {
        _status.Text = text;
        _status.Foreground = bad ? Bad : SystemColors.ControlTextBrush;
    }

    private void Accept()
    {
        Sync();
        if (DatumRows.Check(_rows) is string why) { Say(why, true); return; }
        if (!_rows.Any(r => r.Tick)) { Say("Nothing is ticked — tick a level or a grid, or Cancel.", true); return; }
        DialogResult = true;
        Close();
    }
}
