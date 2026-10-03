using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Data;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Sentinel.Checks;

// The pane's bindings, filled with the longest lines the pane prints (drill MA2b's, and the view model's longest
// journey key, "not bound" — in Revit that key comes with empty lines; here they are filled to make the strip tallest).
public sealed class PaneVm
{
    public string JourneyKey { get; } = "Journey — not bound — Sentinel ▸ Project Setup";
    public string StandardsLine { get; } = "Standards in force: IDS none — install from Settings ▸ Standards · Packs · Rules ruleset@1 · office · 0261a9b3c4d5… · Naming none — install from Settings";
    public string NextLine { get; } = "Next: Team in place — web ▸ Settings ▸ Members — add an owner and a lead by e-mail (owner first) (owner) · 0 of 8 done";
    public string LodLine { get; } = "LOD state: DD → design: 9 of 86 at DD (10%) · 68 below · 9 blocked · 0 not measured · 101 on other office types, not counted — Revit's count (claimed), lead@office.example, 2026-10-03 09:12 UTC · ledger #1548";
    public string PublishLine { get; } = "Auto-publish: off — publish: none — not installed for ma2b or its office";
    public string ScanRulesetLine { get; } = "Judged by ruleset@1 · office · 0261a9b3c4d5… (BDS_Project Number_Project Name (Template))";
    public string ScoreText { get; } = "Rule pass rate 86.7%";
    public string Status { get; } = "ma2b-a — 420 elements in 103 ms";
    public string DoctorHeader { get; } = "Doctor — 0 warning(s) auto-resolved · 2 line(s)";
    public ObservableCollection<string> DoctorLog { get; } = new ObservableCollection<string> {
        "10:54:08  LOD state now — Recorded: ledger #1537 · receipt 78ed60aed99c4ecb…",
        "11:12:19  LOD state after — Recorded: ledger #1548 · receipt 0c55ad1d2d2d3b10…",
    };
    // 30 rows: a real model scans to hundreds; the grid must show some of them whatever the strips above it take
    public ObservableCollection<PaneRow> Violations { get; } = new ObservableCollection<PaneRow>(
        Enumerable.Range(1, 30).Select(i => new PaneRow(i % 3 == 0 ? "FN-01" : "VN-01", i % 3 == 0 ? "WARN" : "REQUEST",
                                                         $"Level {i:00}_SSL", "Name does not match the naming schema")));
}

public sealed class PaneRow
{
    public PaneRow(string rule, string mode, string element, string message) { RuleId = rule; Mode = mode; ElementName = element; Message = message; }
    public string RuleId { get; }
    public string Mode { get; }
    public string ElementName { get; }
    public string Message { get; }
    public string DocRef { get; } = "BDS-NC-001 §3.2";
    public Visibility FixVisibility { get; } = Visibility.Visible;
}

static class Program
{
    static int _pass, _fail;
    static void Ok(bool ok, string what) { if (ok) _pass++; else _fail++; Console.WriteLine((ok ? "  PASS  " : "  FAIL  ") + what); }

    static string Repo()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
            if (Directory.Exists(Path.Combine(d.FullName, "SentinelAddin"))) return d.FullName;
        throw new DirectoryNotFoundException("SentinelAddin not found above " + AppContext.BaseDirectory);
    }

    /// <summary>The real pane, without what needs Revit: x:Class (the code-behind) and the event handlers.</summary>
    static UserControl Load(string xaml)
    {
        xaml = Regex.Replace(xaml, @"\s+x:Class=""[^""]*""", "");
        xaml = Regex.Replace(xaml, @"\s+(Click|MouseDoubleClick)=""[^""]*""", "");
        var pane = (UserControl)XamlReader.Parse(xaml);
        pane.DataContext = new PaneVm();
        return pane;
    }

    static IEnumerable<DependencyObject> Tree(DependencyObject root)
    {
        yield return root;
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
            foreach (var d in Tree(VisualTreeHelper.GetChild(root, i))) yield return d;
    }

    /// <summary>Shown when it and every parent up to the pane are Visible (IsVisible needs a live window; there is none here).</summary>
    static bool Shown(DependencyObject d, DependencyObject pane)
    {
        for (var p = d; p != null && p != pane; p = VisualTreeHelper.GetParent(p))
            if (p is UIElement u && u.Visibility != Visibility.Visible) return false;
        return true;
    }

    /// <summary>Inside a ScrollViewer that may scroll sideways (the rule grid): allowed to be wider than the pane.</summary>
    static bool ScrollsSideways(DependencyObject d, DependencyObject pane)
    {
        for (var p = VisualTreeHelper.GetParent(d); p != null && p != pane; p = VisualTreeHelper.GetParent(p))
            if (p is ScrollViewer sv && sv.HorizontalScrollBarVisibility != ScrollBarVisibility.Disabled) return true;
        return false;
    }

    static Rect Box(FrameworkElement e, Visual pane) => e.TransformToAncestor(pane).TransformBounds(new Rect(0, 0, e.ActualWidth, e.ActualHeight));
    static bool Inside(Rect r, Rect outer) => r.Left >= outer.Left - 0.5 && r.Top >= outer.Top - 0.5 && r.Right <= outer.Right + 0.5 && r.Bottom <= outer.Bottom + 0.5;

    /// <summary>Why a person cannot read this element whole in a w x h dock, or null: trimmed with an ellipsis, outside the
    /// pane sideways, outside a parent's box (clipped) up to the first scroller (a scroller brings it into view), or below
    /// the pane. Review of the narrow-dock fix: wrapping turns a sideways cut into a cut at the bottom; both are cuts.</summary>
    static string Cut(FrameworkElement e, Visual pane, double w, double h)
    {
        if (e is TextBlock t && t.TextTrimming != TextTrimming.None) return "trimmed with an ellipsis";
        var r = Box(e, pane);
        if (r.Left < -0.5 || r.Right > w + 0.5) return $"runs sideways out of the pane ({r.Left:F0}–{r.Right:F0})";
        for (var p = VisualTreeHelper.GetParent(e); p != null && p != pane; p = VisualTreeHelper.GetParent(p))
        {
            // every StackPanel is an IScrollInfo; only one a ScrollViewer owns scrolls
            if (p is ScrollViewer || (p is IScrollInfo si && si.ScrollOwner != null)) return null;
            if (p is FrameworkElement f && !Inside(r, Box(f, pane))) return $"clipped by its {f.GetType().Name}";
        }
        return r.Top < -0.5 || r.Bottom > h + 0.5 ? $"below the pane ({r.Top:F0}–{r.Bottom:F0})" : null;
    }

    static string Short(string s) => s.Length > 36 ? s.Substring(0, 36) + "…" : s;

    static void Lay(UserControl pane, double w, double h)
    {
        pane.Measure(new Size(w, h));
        pane.Arrange(new Rect(0, 0, w, h));
        pane.UpdateLayout();
    }

    static void Png(UserControl pane, double w, double h, string file)
    {
        const double dpi = 144; // the founder's 150 % display, near enough
        var dv = new DrawingVisual();
        using (var dc = dv.RenderOpen())
        {
            dc.DrawRectangle(Brushes.White, null, new Rect(0, 0, w, h));
            dc.DrawRectangle(new VisualBrush(pane) { Stretch = Stretch.None, AlignmentX = AlignmentX.Left, AlignmentY = AlignmentY.Top, ViewboxUnits = BrushMappingMode.Absolute, Viewbox = new Rect(0, 0, w, h) }, null, new Rect(0, 0, w, h));
        }
        var bmp = new RenderTargetBitmap((int)(w * dpi / 96), (int)(h * dpi / 96), dpi, dpi, PixelFormats.Pbgra32);
        bmp.Render(dv);
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(bmp));
        using var fs = File.Create(file);
        enc.Save(fs);
    }

    [STAThread]
    static int Main(string[] args)
    {
        string xaml = File.ReadAllText(Path.Combine(Repo(), "SentinelAddin", "UI", "SentinelPanel.xaml"));
        string pngDir = args.Length > 0 ? args[0] : null;
        Console.WriteLine("The Live Coordination pane in a narrow dock (drill MA2b: lines cut, ↻ off the right edge)");

        // Wide: 193 DIP is the drill's docked pane (~290 px at 150 %), 160 the narrowest a person might drag it, 420 a wide
        // dock. High: 900, and 720 — the whole of a 1080p display at 150 %, so a docked pane there is shorter still.
        foreach (double w in new[] { 160.0, 193.0, 420.0 })
        foreach (double h in new[] { 900.0, 720.0 })
        foreach (bool doctorOpen in new[] { false, true })
        {
            string at = $"at {w}x{h} DIP, the Doctor {(doctorOpen ? "open" : "shut")}";
            var pane = Load(xaml);
            Lay(pane, w, h);
            var exp = Tree(pane).OfType<Expander>().First();
            exp.IsExpanded = doctorOpen;
            Lay(pane, w, h);

            Ok(pane.ActualWidth <= w + 0.5, $"{at}: the pane lays out no wider than its dock ({pane.ActualWidth:F0})");

            var refresh = Tree(pane).OfType<Button>().FirstOrDefault(b => (b.Content as string) == "↻");
            string rc = refresh == null || refresh.ActualWidth <= 0 ? "not laid out" : Cut(refresh, pane, w, h);
            Ok(rc == null, $"{at}: the ↻ button is in view{(rc == null ? "" : " — " + rc)}");

            // every line outside the rule grid: 6 journey lines, ↻, the score and its status, the Doctor header (+ its 2 log lines open)
            var lines = Tree(pane).OfType<TextBlock>()
                .Where(t => Shown(t, pane) && t.ActualWidth > 0 && t.ActualHeight > 0 && !string.IsNullOrEmpty(t.Text) && !ScrollsSideways(t, pane)).ToList();
            int want = doctorOpen ? 12 : 10;
            var cut = lines.Select(t => (t, why: Cut(t, pane, w, h))).Where(x => x.why != null).Select(x => $"\"{Short(x.t.Text)}\" {x.why}").ToList();
            Ok(lines.Count >= want && cut.Count == 0,
               $"{at}: every line outside the rule grid can be read whole ({lines.Count} of {want} laid out)" + (cut.Count == 0 ? "" : ": " + string.Join("; ", cut)));

            var lod = lines.FirstOrDefault(t => BindingOperations.GetBinding(t, TextBlock.TextProperty)?.Path?.Path == "LodLine");
            Ok(lod != null && lod.TextWrapping == TextWrapping.Wrap && lod.Text.Contains("ledger #1548"),
               $"{at}: the LOD line wraps, never trimmed ({(lod == null ? "not laid out" : lod.ActualHeight.ToString("F0") + " DIP high")})");

            var toggle = Tree(exp).OfType<ToggleButton>().FirstOrDefault();
            string tc = toggle == null || toggle.ActualHeight <= 0 ? "squeezed to nothing" : Cut(toggle, pane, w, h);
            Ok(tc == null, $"{at}: the Doctor's toggle is in view{(tc == null ? "" : " — " + tc)}");

            var grid = Tree(pane).OfType<DataGrid>().First();
            var rows = Tree(grid).OfType<ScrollViewer>().FirstOrDefault();
            string gc = Cut(grid, pane, w, h);
            Ok(gc == null && rows != null && rows.ViewportHeight >= 3,
               $"{at}: the rule grid shows rows — {(rows == null ? 0 : rows.ViewportHeight):F0} whole, at least 3{(gc == null ? "" : " — the grid " + gc)}");

            // drill F3: the ⚡ Fix column is first, so its button is in the grid's view without scrolling sideways
            var fix = Tree(grid).OfType<Button>().FirstOrDefault(b => (b.Content as string) == "⚡ Fix");
            Ok(fix != null && rows != null && Inside(Box(fix, pane), Box(rows, pane)) && Box(fix, pane).Right <= w + 0.5,
               $"{at}: the first row's ⚡ Fix is in view without scrolling (drill F3)");

            // the rule's message: the fixed columns take 418 DIP, so a star column alone fell to 20 DIP ("Na…") at any width
            var msg = grid.Columns.FirstOrDefault(col => (col.Header as string) == "Message");
            Ok(msg != null && msg.ActualWidth >= 160 - 0.5, $"{at}: the Message column keeps room to be read ({(msg == null ? 0 : msg.ActualWidth):F0} DIP; the grid scrolls sideways to it)");

            if (pngDir != null) { Directory.CreateDirectory(pngDir); Png(pane, w, h, Path.Combine(pngDir, $"pane-{w}x{h}-{(doctorOpen ? "open" : "shut")}.png")); }
        }

        Console.WriteLine();
        Console.WriteLine($"{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
