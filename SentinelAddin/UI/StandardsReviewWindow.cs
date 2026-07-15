using System;
using System.Collections.Generic;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Standards;

namespace Sentinel.UI;

/// <summary>
/// Human-in-the-loop review (docs/standards-engine-spec.md §4). Shows every extracted item grouped
/// by category with a confidence badge + provenance tooltip; the reviewer ticks what to build. Golden-
/// model items (confidence ≥ 0.9) are pre-ticked; anything lower is opt-in. Built entirely in code
/// (mirrors BcfIssuesWindow); Build/Save emit a pack containing only the ticked items.
/// </summary>
public sealed class StandardsReviewWindow : Window
{
    private readonly TreeView _tree;
    private readonly TextBlock _status;
    private readonly TextBox _report;
    private StandardsPack _source = new();
    private readonly List<Leaf> _leaves = new();

    /// A tick-tracked row: the checkbox plus the spec it represents.
    private sealed class Leaf
    {
        public Leaf(CheckBox box, object spec) { Box = box; Spec = spec; }
        public CheckBox Box { get; }
        public object Spec { get; }
    }

    /// <summary>Fires with a pack containing only the ticked items — build them into the model.</summary>
    public event Action<StandardsPack>? BuildRequested;
    /// <summary>Fires with the ticked pack — persist it to disk without building.</summary>
    public event Action<StandardsPack>? SaveRequested;

    public StandardsReviewWindow()
    {
        Title = "Sentinel — Build Office System";
        Width = 560;
        Height = 680;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        _tree = new TreeView { Margin = new Thickness(0, 6, 0, 0) };
        _status = new TextBlock { Text = "…", Margin = new Thickness(0, 6, 0, 0), TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray };
        _report = new TextBox
        {
            IsReadOnly = true, FontFamily = new FontFamily("Consolas"), Height = 150,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto, TextWrapping = TextWrapping.Wrap,
            Background = Brushes.WhiteSmoke, BorderBrush = Brushes.LightGray, BorderThickness = new Thickness(1),
            Margin = new Thickness(0, 6, 0, 0), Visibility = Visibility.Collapsed,
        };

        var build = Btn("Build ticked items ▶", () => Emit(BuildRequested));
        var save = Btn("Save pack", () => Emit(SaveRequested));
        var close = Btn("Close", Close);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 6, 0, 0) };
        buttons.Children.Add(build);
        buttons.Children.Add(save);
        buttons.Children.Add(close);

        var header = new TextBlock
        {
            Text = "Proposed office standard — tick what to build, then Build.",
            FontWeight = FontWeights.Bold, TextWrapping = TextWrapping.Wrap,
        };

        var root = new DockPanel { Margin = new Thickness(12) };
        foreach (var (el, dock) in new (UIElement, Dock)[]
        {
            (header, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom), (_report, Dock.Bottom),
        })
        {
            DockPanel.SetDock(el, dock);
            root.Children.Add(el);
        }
        root.Children.Add(_tree); // fills remaining space
        Content = root;
    }

    private static Button Btn(string text, Action click)
    {
        var b = new Button { Content = text, Margin = new Thickness(0, 0, 6, 0), Padding = new Thickness(10, 5, 10, 5) };
        b.Click += (_, __) => click();
        return b;
    }

    /// <summary>Populate the tree from a pack (extracted from a golden model or loaded from disk).</summary>
    /// <param name="sourceLabel">Where the pack came from (model title or file name).</param>
    /// <param name="buildTarget">The model Build will write into (the active document).</param>
    public void Load(StandardsPack pack, string sourceLabel, string buildTarget) => Dispatcher.Invoke(() =>
    {
        _source = pack;
        _leaves.Clear();
        _tree.Items.Clear();

        AddGroup($"Worksets ({pack.Provision.Worksets.Count})",
            pack.Provision.Worksets, w => w.Name, w => w.Confidence, w => w.Provenance);
        AddGroup($"Shared Parameters ({pack.Provision.SharedParameters.Count})",
            pack.Provision.SharedParameters,
            p => $"{p.Name}   [{p.Type}·{p.Binding}]",
            p => p.Confidence, p => p.Provenance);
        AddGroup($"Naming Rules ({pack.Provision.NamingRules.Count})",
            pack.Provision.NamingRules,
            n => $"[{n.Target}] {n.Pattern}" + (string.IsNullOrEmpty(n.Example) ? "" : $"   e.g. {n.Example}"),
            n => n.Confidence, n => n.Provenance);
        AddGroup($"View Templates ({pack.Provision.ViewTemplates.Count})",
            pack.Provision.ViewTemplates,
            v => $"{v.Name}   [{v.ViewType}]",
            v => v.Confidence, v => v.Provenance);
        AddGroup($"Browser Organization ({pack.Provision.BrowserOrganization.Count})",
            pack.Provision.BrowserOrganization,
            o => $"{o.Name}   [{o.Target}]",
            o => o.Confidence, o => o.Provenance);

        int total = pack.Provision.Worksets.Count + pack.Provision.SharedParameters.Count
                    + pack.Provision.NamingRules.Count
                    + pack.Provision.ViewTemplates.Count + pack.Provision.BrowserOrganization.Count;
        SetStatus(total == 0
            ? $"'{sourceLabel}' has nothing to review."
            : $"{total} item(s) from '{sourceLabel}'. Tick items, then Build into '{buildTarget}'.");
    });

    private void AddGroup<T>(string header, IReadOnlyList<T> items,
        Func<T, string> label, Func<T, double> confidence, Func<T, Provenance> prov)
    {
        var node = new TreeViewItem { Header = header, IsExpanded = true, FontWeight = FontWeights.Bold };
        foreach (var item in items)
        {
            double conf = confidence(item);
            Provenance pv = prov(item);

            var cb = new CheckBox { IsChecked = conf >= 0.9 || pv.IsGoldenModel, VerticalAlignment = VerticalAlignment.Center };
            var name = new TextBlock { Text = label(item), Margin = new Thickness(6, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.Normal };
            var badge = new TextBlock
            {
                Text = Badge(conf) + $" {conf:0.0}",
                Foreground = BadgeBrush(conf), VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.Normal,
            };

            var row = new StackPanel { Orientation = Orientation.Horizontal, ToolTip = pv.ToString() };
            row.Children.Add(cb);
            row.Children.Add(name);
            row.Children.Add(badge);

            node.Items.Add(new TreeViewItem { Header = row, Focusable = false });
            _leaves.Add(new Leaf(cb, item!));
        }
        _tree.Items.Add(node);
    }

    private static string Badge(double c) => c >= 0.9 ? "●" : c >= 0.6 ? "◐" : "○";
    private static Brush BadgeBrush(double c) => c >= 0.9
        ? new SolidColorBrush(Color.FromRgb(40, 150, 70))
        : c >= 0.6 ? new SolidColorBrush(Color.FromRgb(200, 140, 20))
                   : new SolidColorBrush(Color.FromRgb(190, 60, 60));

    /// <summary>Build a pack from only the ticked rows and hand it to the listener.</summary>
    private void Emit(Action<StandardsPack>? sink)
    {
        if (sink is null) return;
        var pack = new StandardsPack
        {
            PackKey = _source.PackKey, Semver = _source.Semver, CreatedAt = _source.CreatedAt,
            SourceModel = _source.SourceModel, // carried so the builder can transfer view templates / browser org
        };
        foreach (var leaf in _leaves)
        {
            if (leaf.Box.IsChecked != true) continue;
            switch (leaf.Spec)
            {
                case WorksetSpec w: pack.Provision.Worksets.Add(w); break;
                case SharedParamSpec p: pack.Provision.SharedParameters.Add(p); break;
                case NamingRuleSpec nr: pack.Provision.NamingRules.Add(nr); break;
                case ViewTemplateSpec v: pack.Provision.ViewTemplates.Add(v); break;
                case BrowserOrgSpec o: pack.Provision.BrowserOrganization.Add(o); break;
            }
        }
        int n = pack.Provision.Worksets.Count + pack.Provision.SharedParameters.Count
                + pack.Provision.NamingRules.Count
                + pack.Provision.ViewTemplates.Count + pack.Provision.BrowserOrganization.Count;
        if (n == 0) { SetStatus("Nothing ticked — tick at least one item first."); return; }
        SetStatus($"Working on {n} ticked item(s)…");
        sink(pack);
    }

    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);

    /// <summary>Render the per-item build outcome (called from the ExternalEvent thread).</summary>
    public void ShowReport(BuildReport r) => Dispatcher.Invoke(() =>
    {
        var sb = new StringBuilder();
        void Section(string title, IReadOnlyList<string> lines)
        {
            if (lines.Count == 0) return;
            sb.Append(title).Append(" (").Append(lines.Count).AppendLine("):");
            foreach (var l in lines) sb.Append("  • ").AppendLine(l);
        }
        Section("✓ Created", r.Created);
        Section("– Skipped", r.Skipped);
        Section("✗ Failed", r.Failed);

        _report.Text = sb.Length == 0 ? "Nothing to do." : sb.ToString();
        _report.Visibility = Visibility.Visible;
        SetStatus($"Done — {r.Created.Count} created, {r.Skipped.Count} skipped, {r.Failed.Count} failed.");
    });
}
