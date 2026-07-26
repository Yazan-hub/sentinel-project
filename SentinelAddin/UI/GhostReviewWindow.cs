using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.GhostBuilder;

namespace Sentinel.UI;

/// <summary>
/// GhostBuilder v2 P3 — the review gate. The interpreter's Build Proposal is shown BEFORE anything is
/// written to the model: one row per mapped CAD layer with its category/type, how many elements it will
/// create, a confidence badge, and any document-derived parameters (with the sentence they came from as
/// the tooltip). The reviewer ticks what to build; only ticked rows are placed.
///
/// This is the "review" half of auto-build → govern → review. It matters more now that P2 seeds actual
/// parameter values from PDFs: a model reading a spec wrong should be caught here, not in the model.
///
/// Mirrors <see cref="StandardsReviewWindow"/> (same badge idiom, same tick-then-emit shape, built in
/// code with no XAML pair) because it is the same job on a different payload.
/// </summary>
public sealed class GhostReviewWindow : Window
{
    private readonly TreeView _tree;
    private readonly TextBlock _status;
    private readonly Button _build;
    private readonly ComboBox _levelBox = new()
    {
        MinWidth = 160, Margin = new Thickness(6, 0, 12, 0), VerticalAlignment = VerticalAlignment.Center,
    };
    private readonly List<(CheckBox Box, LayerMapping Map)> _rows = new();

    /// <summary>Fires with the ticked layers + the chosen level's ElementId value (-1 = default).</summary>
    public event Action<MappingResult, long>? BuildRequested;

    // ponytail: fixed cap - one plan layer proposing >500 elements is annotation noise
    // (Snowdon: 6,961 handrail segments as "floors"). Make configurable if a real
    // layer ever legitimately exceeds it.
    internal const int HighCountFlag = 500;

    /// <summary>
    /// Whether a row starts ticked: deterministic ("standard") matches only, under the absurd-count cap,
    /// at or above the confidence floor. LLM-sourced rows and high-count rows never start ticked (Snowdon
    /// finding 2 — confident-but-wrong LLM rows arrived pre-ticked). Null/empty source is treated as NOT
    /// standard, mirroring Task 3's conservative posture.
    /// </summary>
    internal static bool PreTick(int n, double confidence, string source, double preTickAbove) =>
        n > 0 && n <= HighCountFlag && confidence >= preTickAbove &&
        string.Equals(source, "standard", StringComparison.OrdinalIgnoreCase);

    // net48's LangVersion lacks IsExternalInit (needed for `record`), so this is a plain class.
    private sealed class LevelChoice
    {
        public LevelChoice(string name, long id) { Name = name; Id = id; }
        public string Name { get; }
        public long Id { get; }
        public override string ToString() => Name;
    }

    public GhostReviewWindow()
    {
        Title = "Sentinel — Ghost Builder: review the build proposal";
        Width = 860;
        Height = 620;
        MinWidth = 520;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        _tree = new TreeView { Margin = new Thickness(0, 6, 0, 0) };
        // Wrap long parameter lines instead of scrolling them off the right edge. Paired with the
        // stretched row content below, this is what keeps a long spec readable at any window size.
        ScrollViewer.SetHorizontalScrollBarVisibility(_tree, ScrollBarVisibility.Disabled);
        _tree.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        _status = new TextBlock
        {
            Text = "…", Margin = new Thickness(0, 6, 0, 0),
            TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray,
        };

        _build = Btn("Build ticked layers ▶", Build);
        var cancel = Btn("Cancel", Close);
        cancel.IsCancel = true; // ESC closes without building

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 6, 0, 0) };
        buttons.Children.Add(new TextBlock
        {
            Text = "Build on level:", VerticalAlignment = VerticalAlignment.Center,
        });
        buttons.Children.Add(_levelBox);
        buttons.Children.Add(_build);
        buttons.Children.Add(cancel);

        var header = new TextBlock
        {
            Text = "Nothing has been built yet. Tick the layers to build, then Build.",
            FontWeight = FontWeights.Bold, TextWrapping = TextWrapping.Wrap,
        };

        var root = new DockPanel { Margin = new Thickness(12) };
        foreach (var (el, dock) in new (UIElement, Dock)[]
        {
            (header, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom),
        })
        {
            DockPanel.SetDock(el, dock);
            root.Children.Add(el);
        }
        root.Children.Add(_tree);
        Content = root;
    }

    private static Button Btn(string text, Action click)
    {
        var b = new Button { Content = text, Margin = new Thickness(0, 0, 6, 0), Padding = new Thickness(10, 5, 10, 5) };
        b.Click += (_, __) => click();
        return b;
    }

    /// <summary>
    /// Populate from the proposal. <paramref name="elementsPerLayer"/> is how many CAD elements each layer
    /// will actually turn into — a layer that maps beautifully but carries no geometry is worth seeing
    /// before you build, so those rows show "0 elements" and are never pre-ticked.
    /// </summary>
    /// <param name="preTickAbove">Confidence at or above which a row starts ticked (low-confidence guesses
    /// are opt-in, exactly as in the standards review).</param>
    public void Load(MappingResult proposal, IReadOnlyDictionary<string, int> elementsPerLayer,
                     string targetLabel, double preTickAbove = 0.5) => Dispatcher.Invoke(() =>
    {
        _rows.Clear();
        _tree.Items.Clear();

        List<LayerMapping> maps = proposal?.Mappings?.Where(m => m != null).ToList() ?? new List<LayerMapping>();
        int totalElements = 0;

        foreach (var group in maps.GroupBy(m => string.IsNullOrWhiteSpace(m.Category) ? "(no category)" : m.Category)
                                  .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase))
        {
            int groupElements = group.Sum(m => Count(elementsPerLayer, m.CadLayer));
            totalElements += groupElements;

            var node = new TreeViewItem
            {
                Header = $"{group.Key} — {group.Count()} layer(s), {groupElements:N0} element(s)",
                IsExpanded = true,
                FontWeight = FontWeights.Bold,
            };

            foreach (LayerMapping m in group.OrderByDescending(m => Count(elementsPerLayer, m.CadLayer)))
            {
                int n = Count(elementsPerLayer, m.CadLayer);
                bool isStandard = string.Equals(m.Source, "standard", StringComparison.OrdinalIgnoreCase);
                bool absurd = n > HighCountFlag;
                var cb = new CheckBox
                {
                    IsChecked = PreTick(n, m.Confidence, m.Source, preTickAbove),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                cb.Checked += (_, __) => UpdateStatus();
                cb.Unchecked += (_, __) => UpdateStatus();

                string type = m.BdsFamilyType ?? m.BdsFamily ?? "(no type)";
                string suffix = (isStandard ? "" : "  · LLM") + (absurd ? "  ⚠ high count — likely annotation" : "");
                var name = new TextBlock
                {
                    Text = $"{m.CadLayer}  →  {type}   ·   {n:N0} element(s){suffix}",
                    Margin = new Thickness(6, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Normal,
                };
                var badge = new TextBlock
                {
                    Text = $"{Badge(m.Confidence)} {m.Confidence:0.0}",
                    Foreground = BadgeBrush(m.Confidence), VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Normal,
                };

                var line1 = new StackPanel { Orientation = Orientation.Horizontal };
                line1.Children.Add(cb);
                line1.Children.Add(name);
                line1.Children.Add(badge);

                // The whole row is a VERTICAL stack: identity on line 1, parameters WRAPPED underneath.
                // They were on one horizontal line, which clipped behind a scrollbar the moment a spec
                // listed more than two values — and a reviewer cannot approve what they cannot read.
                var row = new StackPanel { Orientation = Orientation.Vertical, ToolTip = Provenance(m) };
                row.Children.Add(line1);

                // P2 parameters are the highest-risk part of the proposal (a misread spec writes a wrong
                // fire rating into the model), so they are shown on the row itself, never hidden in a tooltip.
                if (m.Params != null && m.Params.Count > 0)
                    row.Children.Add(new TextBlock
                    {
                        Text = "⚙ " + string.Join(" · ", m.Params.Select(p => $"{p.Name} = {p.Value}")),
                        Foreground = new SolidColorBrush(Color.FromRgb(60, 90, 170)),
                        FontWeight = FontWeights.Normal,
                        TextWrapping = TextWrapping.Wrap,
                        Margin = new Thickness(24, 1, 4, 3),
                    });

                node.Items.Add(new TreeViewItem
                {
                    Header = row,
                    Focusable = false,
                    // Let the row use the tree's full width so the wrapped parameter line has somewhere
                    // to wrap TO, instead of growing sideways forever.
                    HorizontalContentAlignment = HorizontalAlignment.Stretch,
                });
                _rows.Add((cb, m));
            }

            _tree.Items.Add(node);
        }

        if (_rows.Count == 0)
        {
            _build.IsEnabled = false;
            _status.Text = "The proposal is empty — no CAD layer was mapped, so there is nothing to build.";
            return;
        }

        _status.Text = $"{_rows.Count} layer(s), {totalElements:N0} element(s) proposed for '{targetLabel}'. " +
                       "Deterministic standard matches start ticked; LLM-proposed and high-count rows start unticked — review before building.";
        UpdateStatus();
    });

    /// <summary>Populate the build-level choices. Call before Show().</summary>
    public void LoadLevels(IReadOnlyList<(string Name, long Id)> levels, long defaultId) => Dispatcher.Invoke(() =>
    {
        _levelBox.Items.Clear();
        foreach (var (name, id) in levels) _levelBox.Items.Add(new LevelChoice(name, id));

        _levelBox.SelectedIndex = Math.Max(0,
            levels.ToList().FindIndex(l => l.Id == defaultId));
    });

    private static int Count(IReadOnlyDictionary<string, int> counts, string layer) =>
        layer != null && counts != null && counts.TryGetValue(layer, out int n) ? n : 0;

    private static string Provenance(LayerMapping m)
    {
        var parts = new List<string> { $"Layer: {m.CadLayer}", $"Confidence: {m.Confidence:0.00}" };
        if (!string.IsNullOrWhiteSpace(m.Rationale)) parts.Add($"Why: {m.Rationale}");
        if (!string.IsNullOrWhiteSpace(m.SourceDoc)) parts.Add($"Source: {m.SourceDoc}");
        return string.Join(Environment.NewLine, parts);
    }

    private static string Badge(double c) => c >= 0.9 ? "●" : c >= 0.6 ? "◐" : "○";
    private static Brush BadgeBrush(double c) => c >= 0.9
        ? new SolidColorBrush(Color.FromRgb(40, 150, 70))
        : c >= 0.6 ? new SolidColorBrush(Color.FromRgb(200, 140, 20))
                   : new SolidColorBrush(Color.FromRgb(190, 60, 60));

    private void UpdateStatus()
    {
        int ticked = _rows.Count(r => r.Box.IsChecked == true);
        _build.IsEnabled = ticked > 0;
        _build.Content = ticked > 0 ? $"Build {ticked} ticked layer(s) ▶" : "Build ticked layers ▶";
    }

    /// <summary>Approve the ticked rows — what the Build button does. Public so the gate's rule
    /// ("only ticked rows leave this window") is directly checkable without a live Revit.</summary>
    public void Build()
    {
        var ticked = _rows.Where(r => r.Box.IsChecked == true).Select(r => r.Map).ToList();
        if (ticked.Count == 0) { _status.Text = "Nothing ticked — tick at least one layer first."; return; }

        _build.IsEnabled = false;              // one build per review; the window closes when it completes
        _status.Text = $"Building {ticked.Count} layer(s)…";
        long levelId = (_levelBox.SelectedItem as LevelChoice)?.Id ?? -1;
        BuildRequested?.Invoke(new MappingResult { Mappings = ticked }, levelId);
    }

    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);
}
