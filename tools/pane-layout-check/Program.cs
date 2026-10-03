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
using System.Windows.Threading;
using Sentinel.UI;

namespace Sentinel.Checks;

// The pane's bindings, filled with the longest lines the pane prints (drill MA2b's, and the view model's longest journey
// key, "not bound" — in Revit that key comes with empty lines; here they are filled to make the strip tallest). Blank =
// the loading / not-bound state: every line but the key is "".
public sealed class PaneVm
{
    public PaneVm(bool blank = false)
    {
        if (!blank) return;
        JourneyKey = "Journey — loading…";
        StandardsLine = NextLine = LodLine = PublishLine = ScanRulesetLine = "";
    }
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
                                                         $"Level {i:00}_SSL", "Type 'BDS_EXT_WALL_CONC_200' does not match BDS_[LOC]_[DISC]_[MATERIAL]_[SIZE] mm.")));
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
    static void Ok(bool ok, string what) { if (ok) _pass++; else _fail++; if (!ok || Verbose) Console.WriteLine((ok ? "  PASS  " : "  FAIL  ") + what); }
    static bool Verbose;
    const double FourLines = 60;

    static string Repo()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
            if (Directory.Exists(Path.Combine(d.FullName, "SentinelAddin"))) return d.FullName;
        throw new DirectoryNotFoundException("SentinelAddin not found above " + AppContext.BaseDirectory);
    }

    /// <summary>The real pane, without what needs Revit: x:Class (the code-behind) and the event handlers. The one thing the
    /// code-behind does to the layout — the journey's cap on every resize — is done here with the same function.</summary>
    static UserControl Load(string xaml, double h, bool blank = false)
    {
        xaml = Regex.Replace(xaml, @"\s+x:Class=""[^""]*""", "");
        xaml = Regex.Replace(xaml, @"\s+(Click|MouseDoubleClick)=""[^""]*""", "");
        var pane = (UserControl)XamlReader.Parse(xaml);
        pane.DataContext = new PaneVm(blank);
        if (pane.FindName("Journey") is FrameworkElement j) j.MaxHeight = PaneLayout.JourneyCap(h);
        return pane;
    }

    static IEnumerable<DependencyObject> Tree(DependencyObject root)
    {
        yield return root;
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
            foreach (var d in Tree(VisualTreeHelper.GetChild(root, i))) yield return d;
    }

    /// <summary>Shown when it and every parent up to the pane are Visible and not transparent (IsVisible needs a live window).</summary>
    static bool Shown(DependencyObject d, DependencyObject pane)
    {
        for (var p = d; p != null && p != pane; p = VisualTreeHelper.GetParent(p))
            if (p is UIElement u && (u.Visibility != Visibility.Visible || u.Opacity < 0.05)) return false;
        return true;
    }

    /// <summary>Why a person cannot see or click this control, or null (Hidden still lays out; Opacity, IsHitTestVisible and
    /// IsEnabled do not touch layout at all).</summary>
    static string Unusable(DependencyObject d, DependencyObject pane)
    {
        for (var p = d; p != null && p != pane; p = VisualTreeHelper.GetParent(p))
            if (p is UIElement u)
            {
                if (u.Visibility != Visibility.Visible) return $"its {u.GetType().Name} is {u.Visibility}";
                if (u.Opacity < 0.05) return $"its {u.GetType().Name} is transparent";
                if (!u.IsHitTestVisible) return $"its {u.GetType().Name} ignores clicks";
                if (!u.IsEnabled) return $"its {u.GetType().Name} is disabled";
            }
        return null;
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

    /// <summary>The part of an element that is drawn: its box cut by its layout clip. ActualWidth/ActualHeight are the size it
    /// wanted; an element given less is clipped, not shrunk (second review: a 614 DIP StackPanel drawn at 40 passed).</summary>
    static Rect Seen(FrameworkElement f, Visual pane)
    {
        var r = Box(f, pane);
        var g = LayoutInformation.GetLayoutClip(f);
        if (g != null) r.Intersect(f.TransformToAncestor(pane).TransformBounds(g.Bounds));
        return r;
    }

    /// <summary>Why a person cannot read this element whole in a w x h dock, or null: trimmed with an ellipsis, outside the
    /// pane sideways, clipped by its own slot or a parent's, below the pane. A scroller brings what it holds into view
    /// (unless scrollIsCut: the element must be in view as it stands), except a box that scrolls by whole items, which never
    /// shows the end of an item taller than itself.</summary>
    static string Cut(FrameworkElement e, Visual pane, double w, double h, bool scrollIsCut = false)
    {
        if (e is TextBlock t && t.TextTrimming != TextTrimming.None) return "trimmed with an ellipsis";
        var r = Box(e, pane);
        if (r.Left < -0.5 || r.Right > w + 0.5) return $"runs sideways out of the pane ({r.Left:F0}–{r.Right:F0})";
        if (!Inside(r, Seen(e, pane))) return "given less room than it needs (clipped)";
        for (var p = VisualTreeHelper.GetParent(e); p != null && p != pane; p = VisualTreeHelper.GetParent(p))
        {
            // every StackPanel is an IScrollInfo; only one a ScrollViewer owns scrolls
            if (p is IScrollInfo si0 && p is not ScrollContentPresenter && si0.ScrollOwner is ScrollViewer isv && isv.CanContentScroll
                && r.Height > Box(isv, pane).Height + 0.5) return "taller than its item-scrolling box: its end never shows";
            if (!scrollIsCut && (p is ScrollViewer || (p is IScrollInfo si && si.ScrollOwner != null))) return null;
            if (p is FrameworkElement f && !Inside(r, Seen(f, pane))) return $"clipped by its {f.GetType().Name}";
        }
        return r.Top < -0.5 || r.Bottom > h + 0.5 ? $"below the pane ({r.Top:F0}–{r.Bottom:F0})" : null;
    }

    static string Short(string s) => s.Length > 36 ? s.Substring(0, 36) + "…" : s;

    /// <summary>Measure, arrange, then let the dispatcher run: a live DataGrid shares out its columns' widths only then (second
    /// review: without the pump the check saw the declared widths, while Revit showed ⚡ Fix squeezed to 14 DIP).</summary>
    static void Lay(UserControl pane, double w, double h)
    {
        for (int i = 0; i < 2; i++)
        {
            pane.Measure(new Size(w, h));
            pane.Arrange(new Rect(0, 0, w, h));
            pane.UpdateLayout();
            Dispatcher.CurrentDispatcher.Invoke(DispatcherPriority.ContextIdle, new Action(() => { }));
        }
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
        string repo = Repo();
        string xaml = File.ReadAllText(Path.Combine(repo, "SentinelAddin", "UI", "SentinelPanel.xaml"));
        string code = File.ReadAllText(Path.Combine(repo, "SentinelAddin", "UI", "SentinelPanel.xaml.cs"));
        Verbose = args.Contains("-v");
        string pngDir = args.FirstOrDefault(a => a != "-v");
        Console.WriteLine("The Live Coordination pane in a narrow dock (drill MA2b: lines cut, ↻ off the right edge) — failures and the count");

        Ok(Regex.Matches(code, Regex.Escape("SizeChanged += (_, e) => Journey.MaxHeight = PaneLayout.JourneyCap(e.NewSize.Height);")).Count == 1
           && xaml.Contains("<ScrollViewer x:Name=\"Journey\""),
           "the code-behind caps the journey box with PaneLayout.JourneyCap on every resize — the function this check lays it out with");

        // Wide: 160 the narrowest a person might drag it, 193 the drill's dock (~290 px at 150 % beside Speckle), 320 the old
        // MinWidth, 420 a wide dock. High: 1000 a tall dock, 720 the whole of a 1080p display at 150 %, 480 a laptop's dock.
        var fixedCols = new Dictionary<string, double> { [""] = 58, ["Rule"] = 55, ["Mode"] = 70, ["Element"] = 130, ["Ref"] = 105 };
        foreach (double w in new[] { 160.0, 193.0, 320.0, 420.0 })
        foreach (double h in new[] { 1000.0, 720.0, 480.0 })
        foreach (bool doctorOpen in new[] { false, true })
        {
            string at = $"at {w}x{h} DIP, the Doctor {(doctorOpen ? "open" : "shut")}";
            var pane = Load(xaml, h);
            Lay(pane, w, h);
            var exp = Tree(pane).OfType<Expander>().First();
            exp.IsExpanded = doctorOpen;
            Lay(pane, w, h);

            Ok(pane.ActualWidth <= w + 0.5, $"{at}: the pane lays out no wider than its dock ({pane.ActualWidth:F0})");

            var refresh = Tree(pane).OfType<Button>().FirstOrDefault(b => (b.Content as string) == "↻");
            string rc = refresh == null || refresh.ActualWidth <= 0 ? "not laid out" : Unusable(refresh, pane) ?? Cut(refresh, pane, w, h, scrollIsCut: true);
            Ok(rc == null, $"{at}: the ↻ button can be seen and clicked without scrolling{(rc == null ? "" : " — " + rc)}");

            // every line outside the rule grid: 6 journey lines, ↻, the score and its status, the Doctor header (+ its 2 log lines open)
            var lines = Tree(pane).OfType<TextBlock>()
                .Where(t => Shown(t, pane) && t.ActualWidth > 0 && t.ActualHeight > 0 && !string.IsNullOrEmpty(t.Text) && !ScrollsSideways(t, pane)).ToList();
            int want = doctorOpen ? 12 : 10;
            var cut = lines.Select(t => (t, why: Cut(t, pane, w, h))).Where(x => x.why != null).Select(x => $"\"{Short(x.t.Text)}\" {x.why}").ToList();
            Ok(lines.Count >= want && cut.Count == 0,
               $"{at}: every line outside the rule grid can be read whole, scrolling the journey if need be ({lines.Count} of {want} laid out)" + (cut.Count == 0 ? "" : ": " + string.Join("; ", cut)));

            var lod = lines.FirstOrDefault(t => BindingOperations.GetBinding(t, TextBlock.TextProperty)?.Path?.Path == "LodLine");
            Ok(lod != null && lod.TextWrapping == TextWrapping.Wrap && lod.Text.Contains("ledger #1548"),
               $"{at}: the LOD line wraps, never trimmed ({(lod == null ? "not laid out" : lod.ActualHeight.ToString("F0") + " DIP high")})");

            // the journey box: never squeezed below four lines, its scroll bar shown when it scrolls; a tall dock shows it all
            if (pane.FindName("Journey") is not ScrollViewer journey) { Ok(false, $"{at}: the journey box (x:Name Journey, the code-behind caps it) is missing"); continue; }
            var jstack = Tree(journey).OfType<StackPanel>().First();
            double jh = Box(journey, pane).Height;
            // four lines of the 11 pt journey, a number of its own: PaneLayout.JourneyMin is what this asks of it
            Ok(jh >= Math.Min(jstack.ActualHeight, FourLines) - 0.5,
               $"{at}: the journey box shows at least four lines of the journey ({jh:F0} of {jstack.ActualHeight:F0} DIP)");
            if (h >= 1000 && w >= 320)
                Ok(journey.ScrollableHeight <= 0.5, $"{at}: a tall dock shows the whole journey, unscrolled, as before the fix ({jh:F0} of {jstack.ActualHeight:F0} DIP)");
            if (h >= 1000 && w >= 193)
            {
                string lc = lod == null ? "not laid out" : Cut(lod, pane, w, h, scrollIsCut: true);
                Ok(lc == null, $"{at}: the LOD line is in view without scrolling{(lc == null ? "" : " — " + lc)}");
            }

            var bars = Tree(pane).OfType<ScrollViewer>().Where(s => Shown(s, pane) &&
                ((s.ScrollableHeight > 0.5 && s.ComputedVerticalScrollBarVisibility != Visibility.Visible) ||
                 (s.ScrollableWidth > 0.5 && s.ComputedHorizontalScrollBarVisibility != Visibility.Visible))).ToList();
            Ok(bars.Count == 0, $"{at}: every box that scrolls shows its scroll bar{(bars.Count == 0 ? "" : $" — {bars.Count} hide it")}");

            var toggle = Tree(exp).OfType<ToggleButton>().FirstOrDefault();
            string tc = toggle == null || toggle.ActualHeight <= 0 ? "squeezed to nothing" : Unusable(toggle, pane) ?? Cut(toggle, pane, w, h, scrollIsCut: true);
            Ok(tc == null, $"{at}: the Doctor's toggle can be seen and clicked{(tc == null ? "" : " — " + tc)}");

            var grid = Tree(pane).OfType<DataGrid>().First();
            var rows = Tree(grid).OfType<ScrollViewer>().FirstOrDefault();
            string gc = Cut(grid, pane, w, h, scrollIsCut: true);
            // a 480 DIP dock with the Doctor open shows the Doctor first: one whole rule row, as master did
            int rowsWant = h < 720 && doctorOpen ? 1 : 3;
            Ok(gc == null && rows != null && rows.ViewportHeight >= rowsWant,
               $"{at}: the rule grid sits whole in the pane, under no other scroller, and shows rows — {(rows == null ? 0 : rows.ViewportHeight):F0} whole, at least {rowsWant}{(gc == null ? "" : " — the grid " + gc)}");

            var headers = Tree(grid).OfType<DataGridColumnHeadersPresenter>().FirstOrDefault();
            Ok(headers != null && Shown(headers, pane) && headers.ActualHeight > 0, $"{at}: the rule grid's column headers are shown");

            // drill F3: the ⚡ Fix column is first and every fixed column keeps its width, so ⚡ Fix shows whole without scrolling
            var squeezed = grid.Columns.Where(c => fixedCols.ContainsKey(c.Header as string ?? "") && c.ActualWidth < fixedCols[c.Header as string ?? ""] - 0.5)
                .Select(c => $"{(c.Header as string == "" ? "⚡ Fix" : c.Header)} {c.ActualWidth:F0} of {fixedCols[c.Header as string ?? ""]}").ToList();
            Ok(squeezed.Count == 0, $"{at}: every fixed column keeps its width — the grid scrolls sideways instead{(squeezed.Count == 0 ? "" : " — " + string.Join(", ", squeezed))}");
            var fix = Tree(grid).OfType<Button>().FirstOrDefault(b => (b.Content as string) == "⚡ Fix");
            string fc = fix == null ? "missing" : Unusable(fix, pane)
                        ?? (rows != null && Inside(Box(fix, pane), Seen(rows, pane)) && Box(fix, pane).Right <= w + 0.5 ? null : "not in the grid's view without scrolling")
                        ?? (Tree(fix).OfType<TextBlock>().FirstOrDefault() is TextBlock fl ? Cut(fl, pane, w, h) : "no label");
            Ok(fc == null, $"{at}: the first row's ⚡ Fix shows whole and can be clicked (drill F3){(fc == null ? "" : " — " + fc)}");

            var msg = grid.Columns.FirstOrDefault(col => (col.Header as string) == "Message");
            Ok(msg != null && msg.ActualWidth >= 160 - 0.5, $"{at}: the Message column keeps room to be read ({(msg == null ? 0 : msg.ActualWidth):F0} DIP; the grid scrolls sideways to it)");
            var cell = Tree(grid).OfType<TextBlock>().FirstOrDefault(t => t.Text == ((PaneVm)pane.DataContext).Violations[0].Message);
            Ok(cell != null && (cell.ToolTip as string) == cell.Text, $"{at}: a message cut by its column shows whole on hover (its tooltip)");

            // the journey, the score, the Doctor and the grid lie one under another, none covering another
            var blocks = ((Panel)pane.Content).Children.OfType<FrameworkElement>().Where(c => Shown(c, pane)).ToList();
            var over = new List<string>();
            for (int i = 0; i < blocks.Count; i++)
                for (int k = i + 1; k < blocks.Count; k++)
                {
                    var x = Rect.Intersect(Box(blocks[i], pane), Box(blocks[k], pane));
                    if (!x.IsEmpty && x.Width > 0.5 && x.Height > 0.5) over.Add($"{blocks[i].GetType().Name} and {blocks[k].GetType().Name} by {x.Height:F0} DIP");
                }
            Ok(over.Count == 0, $"{at}: the journey, the score, the Doctor and the grid do not cover each other{(over.Count == 0 ? "" : " — " + string.Join("; ", over))}");

            if (pngDir != null) { Directory.CreateDirectory(pngDir); Png(pane, w, h, Path.Combine(pngDir, $"pane-{w}x{h}-{(doctorOpen ? "open" : "shut")}.png")); }
        }

        // loading / not bound: the key alone, no blank lines under it (they took ~73 DIP of a narrow dock)
        {
            var pane = Load(xaml, 720, blank: true);
            Lay(pane, 193, 720);
            double jh = pane.FindName("Journey") is ScrollViewer journey ? Box(journey, pane).Height : double.NaN;
            Ok(jh <= 2 * 15 + 0.5, $"at 193x720 DIP, loading: the journey box holds the key alone, its empty lines take no room ({jh:F0} DIP)");
        }

        Console.WriteLine();
        Console.WriteLine($"{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
