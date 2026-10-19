#nullable disable
// Roadmap item 1, slice B, the founder's rule (2026-10-19): what no changeset may edit is set in a window, never a .json. Standards & Build ▸
// Protection shows the policy in force for this model's web project (protection@n, project → office, or the built-in default) in plain words,
// lets a lead or owner change it — categories by name, this model's worksets as ticks, other workset names in a box — and saves it as the next
// protection@n on the project or its office. Reads run off the API thread; the window opens at once and fills itself. Code-only WPF.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.Standards;
using TextBox = System.Windows.Controls.TextBox;

namespace Sentinel.Commands;

[Transaction(TransactionMode.ReadOnly)]
public sealed class ProtectionCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { TaskDialog.Show("Sentinel — Protection", ProjectContext.NotBound); return Result.Cancelled; }
        var worksets = doc.IsWorkshared
            ? new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset).Select(w => w.Name).OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList()
            : new List<string>();
        var win = new ProtectionWindow(ctx.Key, worksets);
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        win.Load();
        return Result.Succeeded;
    }
}

public sealed class ProtectionWindow : Window
{
    private readonly string _key;
    private readonly List<string> _modelWorksets;
    private readonly List<(string Code, CheckBox Box)> _cats = new();
    private readonly CheckBox _structural = new() { Content = "Walls and floors marked \"Structural\" in Revit", Margin = new Thickness(0, 2, 0, 2) };
    private readonly List<CheckBox> _ws = new();
    private readonly TextBox _otherWs = new() { AcceptsReturn = true, Height = 54, TextWrapping = TextWrapping.NoWrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    private readonly RadioButton _toProject = new() { IsChecked = true, Margin = new Thickness(0, 0, 14, 0) };
    private readonly RadioButton _toOffice = new() { IsEnabled = false };
    private readonly TextBlock _inForce = new() { TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold };
    private readonly TextBlock _status = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0) };
    private readonly Button _save = new() { Content = "Save", Padding = new Thickness(14, 4, 14, 4), FontWeight = FontWeights.Bold, IsEnabled = false };
    private readonly Button _reset = new() { Content = "Reset to the built-in default", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 8, 0) };
    private HashSet<string> _otherCodes = new(StringComparer.Ordinal); // codes a saved policy holds that the window does not show: kept on save
    private string _office;
    private bool _projectHasOwn;

    public ProtectionWindow(string key, List<string> modelWorksets)
    {
        _key = key; _modelWorksets = modelWorksets;
        Title = $"Sentinel — Protection: {key}";
        Width = 560; SizeToContent = SizeToContent.Height; WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var root = new StackPanel { Margin = new Thickness(12) };
        root.Children.Add(new TextBlock { Text = "Protected from automated changes", FontSize = 15, FontWeight = FontWeights.Bold });
        root.Children.Add(new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 8), Foreground = System.Windows.Media.Brushes.DimGray,
            Text = "No changeset — from AI, the web or Promote — may edit an existing element of what is ticked here. Such a row is kept as it stands, with the reason, and the rest of the changeset is applied. New elements are not affected." });
        root.Children.Add(_inForce);
        root.Children.Add(Heading("Elements"));
        var grid = new System.Windows.Controls.Primitives.UniformGrid { Columns = 2 };
        foreach (var (code, label) in ProtectionRules.Catalog)
        {
            var b = new CheckBox { Content = label, Margin = new Thickness(0, 2, 12, 2) };
            _cats.Add((code, b));
            grid.Children.Add(b);
        }
        root.Children.Add(grid);
        root.Children.Add(_structural);
        root.Children.Add(Heading("Worksets"));
        if (_modelWorksets.Count == 0)
            root.Children.Add(new TextBlock { Text = "This model is not workshared — it has no worksets to tick.", Foreground = System.Windows.Media.Brushes.DimGray });
        foreach (var w in _modelWorksets) { var b = new CheckBox { Content = w, Margin = new Thickness(0, 2, 0, 2) }; _ws.Add(b); root.Children.Add(b); }
        root.Children.Add(new TextBlock { Text = "Also protect worksets named (one per line; * means anything, e.g. *Shared Levels and Grids*):", Margin = new Thickness(0, 6, 0, 2), TextWrapping = TextWrapping.Wrap });
        root.Children.Add(_otherWs);
        root.Children.Add(Heading("Save for"));
        var target = new StackPanel { Orientation = Orientation.Horizontal };
        _toProject.Content = $"This project ({key})";
        _toOffice.Content = "Every project in the office";
        target.Children.Add(_toProject); target.Children.Add(_toOffice);
        root.Children.Add(target);
        root.Children.Add(_status);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
        buttons.Children.Add(_reset); buttons.Children.Add(_save);
        root.Children.Add(buttons);
        Content = new ScrollViewer { Content = root, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, MaxHeight = 760 };
        _reset.Click += (_, _) => { Fill(ProtectionRules.Default()); Say("The built-in default is in the form — press Save to keep it.", false); };
        _save.Click += (_, _) => Save();
        _toOffice.Checked += (_, _) => Say(_projectHasOwn ? $"{_key} has its own protection policy, which wins over the office's — saving for the office changes the other projects." : null, false);
        _toProject.Checked += (_, _) => Say(null, false);
        Say("Reading the policy in force…", false);
    }

    private static TextBlock Heading(string t) => new() { Text = t, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 10, 0, 2) };

    /// <summary>The policy in force, the office and this person's role — off the API thread; the window fills itself.</summary>
    public void Load() => Task.Run(() =>
    {
        var a = ArtefactClient.Resolve(_key, "protection");
        var scope = GovernedNotify.ProjectScope(_key);
        string office = null, officeWhy = scope.Error;
        if (scope.Error is null) office = TypeCatalogExport.OfficeKeyFrom(scope.Json, _key, out officeWhy);
        var role = ChangesetClient.MyRole(BcfConfig.Load(), _key, out var roleError);
        var (lead, why) = ChangesetClient.CoordinatorFrom(_key, role, roleError);
        Dispatcher.BeginInvoke(new Action(() =>
        {
            var rules = a.Origin != "none" ? ProtectionRules.From(a.BodyJson, a.Label) : ProtectionRules.Default(a.NotInstalled ? "none saved yet" : a.Label);
            _projectHasOwn = a.Origin != "none" && string.Equals(a.Source, "project", StringComparison.OrdinalIgnoreCase);
            _inForce.Text = "In force now: " + (a.Origin != "none" && !rules.Label.StartsWith("the built-in") ? a.Label : rules.Label);
            Fill(rules);
            _office = office;
            _toOffice.IsEnabled = lead && office != null;
            _toOffice.Content = office != null ? $"Every project in the office ({office})" : "Every project in the office (" + (officeWhy ?? "this project has no office") + ")";
            _save.IsEnabled = lead;
            Say(lead ? null : "Read-only: only a lead or owner of the web project can change protection — " + why + ".", !lead);
        }));
    });

    private void Fill(ProtectionRules r)
    {
        foreach (var (code, box) in _cats) box.IsChecked = r.Categories.Contains(code);
        _otherCodes = new HashSet<string>(r.Categories.Where(c => _cats.All(x => x.Code != c)), StringComparer.Ordinal);
        _structural.IsChecked = r.StructuralHosts;
        var (ticked, other) = ProtectionRules.SplitWorksets(r.Worksets, _modelWorksets);
        foreach (var b in _ws) b.IsChecked = ticked.Contains((string)b.Content);
        _otherWs.Text = string.Join(Environment.NewLine, other);
    }

    private ProtectionRules FromForm()
    {
        var r = new ProtectionRules { StructuralHosts = _structural.IsChecked == true };
        foreach (var c in _otherCodes) r.Categories.Add(c);
        foreach (var (code, box) in _cats) if (box.IsChecked == true) r.Categories.Add(code);
        r.Worksets.AddRange(_ws.Where(b => b.IsChecked == true).Select(b => (string)b.Content));
        r.Worksets.AddRange(_otherWs.Text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).Where(s => s.Length > 0));
        return r;
    }

    private void Save()
    {
        var target = _toOffice.IsChecked == true && _office != null ? _office : _key;
        var body = FromForm().ToJson();
        _save.IsEnabled = false;
        Say($"Saving on {target}…", false);
        Task.Run(() =>
        {
            var put = GovernedNotify.InstallArtefact(target, "protection", body, UserSession.Actor);
            Dispatcher.BeginInvoke(new Action(() =>
            {
                _save.IsEnabled = true;
                if (put.Error != null) { Say($"Not saved on {target}: {put.Error}", true); return; }
                Say($"✓ Saved as protection@{put.Version} on {target}, recorded in the ledger. Revit uses it for the next changeset you apply.", false);
                if (target == _key) { _projectHasOwn = true; _inForce.Text = $"In force now: protection@{put.Version} · project"; }
                else if (!_projectHasOwn) _inForce.Text = $"In force now: protection@{put.Version} · office";
            }));
        });
    }

    private void Say(string text, bool bad)
    {
        _status.Text = text ?? "";
        _status.Foreground = bad ? System.Windows.Media.Brushes.Firebrick : System.Windows.Media.Brushes.DarkGreen;
    }
}
