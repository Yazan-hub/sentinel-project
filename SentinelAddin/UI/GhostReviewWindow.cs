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
    private readonly List<(CheckBox Box, ComboBox Type, LayerMapping Map)> _rows = new();
    // GHB-5: the types loaded in the model per category (LoadTypes), what the ticked rows will add (the forecast), whether
    // a guideline is installed (a measured wall may then get a type at Build that no row names), and whether a Ghost family
    // library is set (without one, a family that is not loaded is skipped, never added — A3).
    private IReadOnlyDictionary<string, IReadOnlyList<(string? Family, string Type)>> _types =
        new Dictionary<string, IReadOnlyList<(string? Family, string Type)>>();
    private readonly TextBlock _forecast = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) };
    private bool _guided, _hasLibrary;

    /// <summary>The reviewer's choices — a loaded type picked, "(ignore)", or "(forget my choice)" — ticked or not, as copies
    /// with Source "reviewer": what the command hands LayerMapper.Remember when the review builds or closes (GHB-5).</summary>
    public IReadOnlyList<LayerMapping> Choices =>
        _rows.Select(r => Effective(r.Map, r.Type.SelectedItem as TypeItem)).Where(m => m.Source == "reviewer").ToList();
    // The three standards the proposal was made with (GhostStandards.Header), none included.
    private readonly TextBlock _standards = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 0) };

    /// <summary>Fires with the ticked layers + the chosen level's ElementId value (-1 = default).</summary>
    public event Action<MappingResult, long>? BuildRequested;

    // ponytail: fixed cap - one plan layer proposing >500 elements is annotation noise
    // (Snowdon: 6,961 handrail segments as "floors"). Make configurable if a real
    // layer ever legitimately exceeds it.
    internal const int HighCountFlag = 500;

    /// <summary>
    /// Whether a row starts ticked: rows of the project's installed layers standard ("standard") only, under the
    /// absurd-count cap, at or above the confidence floor. Heuristic guesses, local-model answers (fresh or
    /// remembered), unmapped layers and high-count rows never start ticked (Snowdon finding 2 — confident-but-wrong
    /// LLM rows arrived pre-ticked; cohesion 4b-2 — a keyword guess is not a standard). Null/empty source is NOT
    /// standard.
    /// </summary>
    internal static bool PreTick(int n, double confidence, string source, double preTickAbove) =>
        n > 0 && n <= HighCountFlag && confidence >= preTickAbove &&
        string.Equals(source, "standard", StringComparison.OrdinalIgnoreCase);

    /// <summary>What a row says after its element count when it is not a row of the installed standard.</summary>
    internal static string SourceNote(string? source) => source?.ToLowerInvariant() switch
    {
        "standard" => "",
        "heuristic" => "  · heuristic guess",
        "llm" => "  · local model",
        "cache" => "  · local model (remembered)",
        "reviewer" => "  · your earlier review",
        "unmapped" => "  · not mapped",
        _ => "  · " + (string.IsNullOrWhiteSpace(source) ? "no source" : source),
    };

    /// <summary>The standards line as shown (for the harness).</summary>
    internal string StandardsLine => _standards.Text;

    /// <summary>The rows and the forecast as shown (for the harness).</summary>
    internal IReadOnlyList<(CheckBox Box, ComboBox Type, LayerMapping Map)> Rows => _rows;
    internal string ForecastText => _forecast.Text;

    // net48's LangVersion lacks IsExternalInit (needed for `record`), so this is a plain class.
    private sealed class LevelChoice
    {
        public LevelChoice(string name, long id) { Name = name; Id = id; }
        public string Name { get; }
        public long Id { get; }
        public override string ToString() => Name;
    }

    // One entry of a row's type drop-down: the row as proposed, a type loaded in this model, "(ignore)", or — on a remembered
    // row — "(forget my choice)". A plain class (net48).
    private sealed class TypeItem
    {
        public TypeItem(string label, string? family, string? type, bool ignore = false, bool proposed = false, bool forget = false)
        {
            Label = label; Family = family; Type = type; Ignore = ignore; Proposed = proposed; Forget = forget;
        }
        public string Label { get; }
        public string? Family { get; }
        public string? Type { get; }
        public bool Ignore { get; }
        public bool Proposed { get; }
        public bool Forget { get; }
        public override string ToString() => Label;
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
            Text = "Nothing has been built yet. Tick the layers to build — pick a type or (ignore) where the proposal is wrong — then Build.",
            FontWeight = FontWeights.Bold, TextWrapping = TextWrapping.Wrap,
        };

        var top = new StackPanel();
        top.Children.Add(header);
        top.Children.Add(_standards);

        var root = new DockPanel { Margin = new Thickness(12) };
        foreach (var (el, dock) in new (UIElement, Dock)[]
        {
            (top, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom), (_forecast, Dock.Bottom),
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
    /// <param name="standardsHeader">The three standards the proposal was made with (GhostStandards.Header):
    /// "Layers: … · Guideline: … · Type catalogue: …", none included. Shown under the title.</param>
    /// <param name="preTickAbove">Confidence at or above which a row starts ticked (low-confidence guesses
    /// are opt-in, exactly as in the standards review).</param>
    /// <param name="guided">A guideline is installed: the forecast says measured walls may get a type made at Build.</param>
    /// <param name="hasLibrary">A Ghost family library is set: a door, window, column or furniture family that is not loaded
    /// may be loaded from it at Build. Without one, the forecast says that row will be skipped (A3).</param>
    public void Load(MappingResult proposal, IReadOnlyDictionary<string, int> elementsPerLayer,
                     string targetLabel, string standardsHeader, double preTickAbove = 0.5, bool guided = false,
                     bool hasLibrary = false) => Dispatcher.Invoke(() =>
    {
        _guided = guided;
        _hasLibrary = hasLibrary;
        _standards.Text = standardsHeader;
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
                bool absurd = n > HighCountFlag;
                var cb = new CheckBox
                {
                    IsChecked = PreTick(n, m.Confidence, m.Source, preTickAbove),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                cb.Checked += (_, __) => UpdateStatus();
                cb.Unchecked += (_, __) => UpdateStatus();

                // GHB-5: the type is a choice, not a label — as proposed, any type of this category loaded in the model,
                // "(ignore)" (never built; remembered), and on a remembered row "(forget my choice)" (A2). A remembered
                // ignore comes back selected, its box unticked and locked; "as proposed" undoes it.
                var pick = new ComboBox
                {
                    MinWidth = 220, Margin = new Thickness(6, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Normal,
                };
                List<TypeItem> items = ItemsFor(m);
                foreach (TypeItem item in items) pick.Items.Add(item);
                pick.SelectedIndex = m.Ignore ? items.FindIndex(i => i.Ignore) : 0;
                void Lock()
                {
                    // An ignore is never built; a forgotten choice is not built on this run either (it is asked again next run).
                    bool off = (pick.SelectedItem as TypeItem) is { } t && (t.Ignore || t.Forget);
                    if (off) cb.IsChecked = false;
                    cb.IsEnabled = !off;
                }
                Lock();
                pick.SelectionChanged += (_, __) => { Lock(); UpdateStatus(); };

                string suffix = SourceNote(m.Source) + (absurd ? "  ⚠ high count — likely annotation" : "");
                var name = new TextBlock
                {
                    Text = $"{m.CadLayer}  →",
                    Margin = new Thickness(6, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Normal,
                };
                var count = new TextBlock
                {
                    Text = $"·   {n:N0} element(s){suffix}",
                    Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center,
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
                line1.Children.Add(pick);
                line1.Children.Add(count);
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
                _rows.Add((cb, pick, m));
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
                       "Only rows of the installed layers standard start ticked; heuristic, local-model, unmapped and high-count rows start unticked — review before building. " +
                       "A type you pick, or (ignore), is remembered for this project when you Build or close.";
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

    /// <summary>The types loaded in the model, per mapping category — Walls (basic), Floors and Ceilings by name; Doors,
    /// Windows, Columns and Furniture as family : type — read on the API thread: what each row's drop-down offers. Call
    /// before Load.</summary>
    public void LoadTypes(IReadOnlyDictionary<string, IReadOnlyList<(string? Family, string Type)>> byCategory) =>
        _types = byCategory ?? new Dictionary<string, IReadOnlyList<(string? Family, string Type)>>();

    // A row's drop-down: the row as proposed (always — an ignore keeps its proposed type, so it can be undone: A2), each loaded
    // type of its category, "(ignore)", and on a row that came from memory "(forget my choice)".
    private List<TypeItem> ItemsFor(LayerMapping m)
    {
        var items = new List<TypeItem> { new TypeItem("as proposed: " + TypeLabel(m.BdsFamily, m.BdsFamilyType), m.BdsFamily, m.BdsFamilyType, proposed: true) };
        if (m.Category != null && _types.TryGetValue(m.Category, out var loaded))
            foreach (var (family, type) in loaded) items.Add(new TypeItem(TypeLabel(family, type), family, type));
        items.Add(new TypeItem("(ignore)", null, null, ignore: true));
        if (m.Source == "reviewer") items.Add(new TypeItem("(forget my choice)", null, null, forget: true));
        return items;
    }

    private static string TypeLabel(string? family, string? type) =>
        type == null ? family ?? "(no type)" : family == null ? type : family + " : " + type;

    /// <summary>The row that leaves the window — always a COPY (the mapper's rows, LayerMapper's cache among them, are never
    /// edited): as proposed (an ignore undone), or the reviewer's pick (Source "reviewer", that family and type), or ignore
    /// (Source "reviewer", Ignore), or a remembered choice to forget (Forget: LayerMapper.Remember deletes it).</summary>
    private static LayerMapping Effective(LayerMapping m, TypeItem? pick)
    {
        var c = m.Copy();
        if (pick == null) return c;
        if (pick.Proposed) { c.Ignore = false; return c; }
        if (pick.Forget) { c.Forget = true; return c; }
        c.Source = "reviewer";
        c.Confidence = 1.0;
        c.Ignore = pick.Ignore;
        if (!pick.Ignore) { c.BdsFamily = pick.Family; c.BdsFamilyType = pick.Type; }
        c.Rationale = pick.Ignore ? "ignored by the reviewer" : "picked by the reviewer from the types loaded in this model";
        return c;
    }

    // The ticked rows as they would leave the window.
    private List<LayerMapping> Ticked() =>
        _rows.Where(r => r.Box.IsChecked == true).Select(r => Effective(r.Map, r.Type.SelectedItem as TypeItem)).ToList();

    /// <summary>GHB-5, before Build: what the ticked rows will add to the model's type library — a forecast from the rows and
    /// the types already loaded (the summary after Build lists what was added). A wall or floor type the model lacks is
    /// cloned from the type catalogue or reported as a gap (the provisioners); a door, window, column or furniture family it
    /// lacks is loaded from the Ghost family library when that holds the .rfa (the preloader) — with no library set, that row
    /// is skipped, never added (A3); with a guideline, a measured wall the model has no type for is made at Build (known only
    /// once the walls are paired). Each line starts "+ " (added) or "– " (skipped).</summary>
    internal static List<string> TypesToCreate(IReadOnlyList<LayerMapping> ticked,
        IReadOnlyDictionary<string, IReadOnlyList<(string? Family, string Type)>> loaded, bool guided, bool hasLibrary)
    {
        var lines = new List<string>();
        foreach (LayerMapping m in ticked)
        {
            if (m.Category == null) continue;
            IReadOnlyList<(string? Family, string Type)> have =
                loaded.TryGetValue(m.Category, out var l) ? l : Array.Empty<(string? Family, string Type)>();
            if (m.Category is "Walls" or "Floors")
            {
                string? name = m.BdsFamilyType ?? m.BdsFamily;
                if (name != null && !have.Any(h => Same(h.Type, name)))
                    lines.Add($"+ {m.Category} type \"{name}\" (layer {m.CadLayer}) — cloned from the type catalogue, or reported as a gap");
            }
            else if (m.Category is "Doors" or "Windows" or "Columns" or "Furniture"
                     && m.BdsFamily != null && !have.Any(h => Same(h.Family, m.BdsFamily)))
                lines.Add(hasLibrary
                    ? $"+ {m.Category} family \"{m.BdsFamily}\" (layer {m.CadLayer}) — loaded from the Ghost family library if it holds {m.BdsFamily}.rfa, else skipped"
                    : $"– {m.Category} family \"{m.BdsFamily}\" (layer {m.CadLayer}) — not loaded, and no Ghost family library is set — the row will be skipped");
        }
        lines = lines.Distinct().ToList();
        if (guided && ticked.Any(m => m.Category == "Walls"))
            lines.Add("+ Walls typed by the guideline at a thickness the model lacks — made at Build, each listed in the summary");
        return lines;
    }

    private static bool Same(string? a, string? b) => string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);

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
        var ticked = Ticked();
        _build.IsEnabled = ticked.Count > 0;
        _build.Content = ticked.Count > 0 ? $"Build {ticked.Count} ticked layer(s) ▶" : "Build ticked layers ▶";
        var lines = TypesToCreate(ticked, _types, _guided, _hasLibrary);
        _forecast.Text = (lines.Any(a => a.StartsWith("+", StringComparison.Ordinal))
                ? "Types this build will add to the model (forecast — the summary lists what was added):"
                : "Types: this build adds no type or family to the model.")
            + string.Concat(lines.Select(a => Environment.NewLine + "  " + a));
    }

    /// <summary>Approve the ticked rows — what the Build button does. Public so the gate's rule
    /// ("only ticked rows leave this window", as copies with the reviewer's picks) is directly checkable without a live Revit.</summary>
    public void Build()
    {
        var ticked = Ticked();
        if (ticked.Count == 0) { _status.Text = "Nothing ticked — tick at least one layer first."; return; }

        _build.IsEnabled = false;              // one build per review; the window closes when it completes
        _status.Text = $"Building {ticked.Count} layer(s)…";
        long levelId = (_levelBox.SelectedItem as LevelChoice)?.Id ?? -1;
        BuildRequested?.Invoke(new MappingResult { Mappings = ticked }, levelId);
    }

    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);
}
