using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Sentinel.Checks;

// The pane's bindings, filled with the lines a real project shows (drill MA2b's, the longest the pane has printed).
public sealed class PaneVm
{
    public string JourneyKey { get; } = "Journey · ma2b (project)";
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
    public ObservableCollection<PaneRow> Violations { get; } = new ObservableCollection<PaneRow> {
        new PaneRow("VN-01", "REQUEST", "Level 01_SSL", "View name does not match the naming schema"),
        new PaneRow("FN-01", "WARN", "M_Fixed : 0915 x 1220mm", "Family name does not follow the office pattern"),
    };
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

    /// <summary>Inside a ScrollViewer that may scroll sideways (the rule grid): allowed to be wider than the pane.</summary>
    static bool ScrollsSideways(DependencyObject d, DependencyObject pane)
    {
        for (var p = VisualTreeHelper.GetParent(d); p != null && p != pane; p = VisualTreeHelper.GetParent(p))
            if (p is ScrollViewer sv && sv.HorizontalScrollBarVisibility != ScrollBarVisibility.Disabled) return true;
        return false;
    }

    /// <summary>Shown when it and every parent up to the pane are Visible (IsVisible needs a live window; there is none here).</summary>
    static bool Shown(DependencyObject d, DependencyObject pane)
    {
        for (var p = d; p != null && p != pane; p = VisualTreeHelper.GetParent(p))
            if (p is UIElement u && u.Visibility != Visibility.Visible) return false;
        return true;
    }

    static double Right(FrameworkElement e, Visual pane) => e.TransformToAncestor(pane).TransformBounds(new Rect(0, 0, e.ActualWidth, e.ActualHeight)).Right;

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

        // 193 DIP is the drill's docked pane (~290 px at 150 %); 160 the narrowest a person might drag it; 420 a wide dock.
        foreach (double w in new[] { 160.0, 193.0, 420.0 })
        {
            const double h = 900;
            var pane = Load(xaml);
            Lay(pane, w, h);
            Ok(pane.ActualWidth <= w + 0.5, $"at {w} DIP the pane lays out no wider than its dock (it laid out at {pane.ActualWidth:F0})");

            var refresh = Tree(pane).OfType<Button>().FirstOrDefault(b => (b.Content as string) == "↻");
            Ok(refresh != null && refresh.ActualWidth > 0 && Right(refresh, pane) <= w + 0.5,
               $"at {w} DIP the ↻ button is inside the pane (its right edge at {(refresh == null ? double.NaN : Right(refresh, pane)):F0})");

            var exp = Tree(pane).OfType<Expander>().First();
            exp.IsExpanded = true; // the Doctor log open, as a person reads it
            Lay(pane, w, h);
            var lines = Tree(pane).OfType<TextBlock>()
                .Where(t => Shown(t, pane) && t.ActualWidth > 0 && !string.IsNullOrEmpty(t.Text) && !ScrollsSideways(t, pane)).ToList();
            var over = lines.Where(t => Right(t, pane) > w + 0.5)
                .Select(t => $"\"{(t.Text.Length > 40 ? t.Text.Substring(0, 40) + "…" : t.Text)}\" ends at {Right(t, pane):F0}").ToList();
            // 12 = the six journey lines, ↻, the score and its status, the Doctor header and its two log lines: fewer means a line
            // went unread (or scrolls sideways out of sight, as the Doctor log did)
            Ok(lines.Count >= 12 && over.Count == 0, $"at {w} DIP every line outside the rule grid ({lines.Count} read) wraps inside the pane — the journey, the LOD line, the score, the Doctor header and its log" +
                                 (over.Count == 0 ? "" : ": " + string.Join("; ", over)));

            var lod = Tree(pane).OfType<TextBlock>().FirstOrDefault(t => BindingOperations.GetBinding(t, TextBlock.TextProperty)?.Path?.Path == "LodLine");
            Ok(lod != null && lod.ActualHeight > 0 && lod.Text.Contains("ledger #1548"), $"at {w} DIP the LOD line is shown whole (wrapped, {(lod == null ? 0 : lod.ActualHeight):F0} DIP high)");

            var grid = Tree(pane).OfType<DataGrid>().First();
            Ok(Right(grid, pane) <= w + 0.5, $"at {w} DIP the rule grid fits the pane and scrolls its own columns sideways (drill F3: ⚡ Fix first)");

            if (pngDir != null) { Directory.CreateDirectory(pngDir); Png(pane, w, h, Path.Combine(pngDir, $"pane-{w}.png")); }
        }

        Console.WriteLine();
        Console.WriteLine($"{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
