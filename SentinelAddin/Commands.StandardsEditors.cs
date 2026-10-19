#nullable disable
// Batch 3 of the no-JSON work (spec docs/superpowers/specs/2026-10-19-standards-batch3-design.md, the founder's rule of 2026-10-19): the two
// standards whose names come from the model are set in Revit windows, never a .json. Standards & Build ▸ Standards ▸ Modelling Guideline
// (guideline@n) and ▸ IFC Export Mapping (ifc_export@n) show the standard in force for this model's web project (project → office) with this
// model's families, types, levels, title blocks, worksets and parameters as pick-lists; a lead or owner changes it and saves the next version
// on the project or its office — one ledger row, the bridge validates. Reads run off the API thread (the Protection idiom). Code-only WPF.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.Standards;
using ComboBox = System.Windows.Controls.ComboBox;
using Panel = System.Windows.Controls.Panel;
using RadioButton = System.Windows.Controls.RadioButton;
using TextBox = System.Windows.Controls.TextBox;

namespace Sentinel.Commands;

[Transaction(TransactionMode.ReadOnly)]
public sealed class GuidelineEditorCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { TaskDialog.Show("Sentinel — Modelling Guideline", ProjectContext.NotBound); return Result.Cancelled; }
        var picks = new GuidelineWindow.Picks
        {
            Levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().OrderBy(l => l.Elevation).Select(l => l.Name).ToList(),
            TitleBlocks = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_TitleBlocks).WhereElementIsElementType().Cast<ElementType>()
                .Select(t => t.FamilyName + " : " + t.Name).Distinct().OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList(),
            Worksets = StandardEditorWindow.Worksets(doc),
        };
        foreach (var cat in GuidelineEdit.Categories)
        {
            var bic = cat == "Stairs" ? "OST_Stairs" : GuidelineMatcher.CategoryBics.TryGetValue(cat, out var b) ? b : null;
            if (bic == null || !Enum.TryParse(bic, out BuiltInCategory bc)) continue;
            var fams = new SortedDictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in new FilteredElementCollector(doc).OfCategory(bc).WhereElementIsElementType().Cast<ElementType>())
            {
                if (string.IsNullOrEmpty(t.FamilyName)) continue;
                if (!fams.TryGetValue(t.FamilyName, out var list)) fams[t.FamilyName] = list = new List<string>();
                list.Add(t.Name);
            }
            foreach (var l in fams.Values) l.Sort(StringComparer.OrdinalIgnoreCase);
            picks.Families[cat] = fams;
        }
        var win = new GuidelineWindow(ctx.Key, picks);
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        win.Load();
        return Result.Succeeded;
    }
}

[Transaction(TransactionMode.ReadOnly)]
public sealed class IfcExportEditorCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { TaskDialog.Show("Sentinel — IFC Export Mapping", ProjectContext.NotBound); return Result.Cancelled; }
        // The parameter names this model holds: its project and shared parameters, and the parameters of one element and one type per common category.
        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        var it = doc.ParameterBindings.ForwardIterator();
        while (it.MoveNext()) if (it.Key is Definition d && !string.IsNullOrWhiteSpace(d.Name)) names.Add(d.Name);
        foreach (var bic in new[] { BuiltInCategory.OST_Walls, BuiltInCategory.OST_Floors, BuiltInCategory.OST_Roofs, BuiltInCategory.OST_Ceilings, BuiltInCategory.OST_Doors,
                     BuiltInCategory.OST_Windows, BuiltInCategory.OST_Columns, BuiltInCategory.OST_StructuralColumns, BuiltInCategory.OST_StructuralFraming, BuiltInCategory.OST_Stairs,
                     BuiltInCategory.OST_Railings, BuiltInCategory.OST_Furniture, BuiltInCategory.OST_GenericModel, BuiltInCategory.OST_Rooms, BuiltInCategory.OST_CurtainWallPanels })
            foreach (var el in new[] { new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsNotElementType().FirstElement(),
                                       new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().FirstElement() })
                if (el != null)
                    foreach (Parameter p in el.Parameters)
                        if (!string.IsNullOrWhiteSpace(p.Definition?.Name)) names.Add(p.Definition.Name);
        var win = new IfcExportWindow(ctx.Key, names.ToList());
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        win.Load();
        return Result.Succeeded;
    }
}

/// <summary>What the two windows share with Protection: the standard in force read off Revit's thread, a lead or owner's Save, for this project
/// or the office, and a refusal when someone saved a newer version since the window opened (it would be overwritten unseen).</summary>
public abstract class StandardEditorWindow : Window
{
    protected readonly string Key, Kind;
    protected readonly StackPanel Body = new() { IsEnabled = false };
    private readonly RadioButton _toProject = new() { IsChecked = true, Margin = new Thickness(0, 0, 14, 0) };
    private readonly RadioButton _toOffice = new() { IsEnabled = false };
    private readonly TextBlock _inForce = new() { TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 6) };
    private readonly TextBlock _status = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0), MinHeight = 34 };
    private readonly Button _save = new() { Content = "Save", Padding = new Thickness(14, 4, 14, 4), FontWeight = FontWeights.Bold, IsEnabled = false };
    private string _office, _readSha, _officeSha;
    private bool _projectHasOwn;

    protected StandardEditorWindow(string key, string kind, string title, string intro)
    {
        Key = key; Kind = kind;
        Title = $"Sentinel — {title}: {key}";
        Width = 780; Height = Math.Min(880, SystemParameters.WorkArea.Height - 40); WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var root = new StackPanel { Margin = new Thickness(12) };
        root.Children.Add(new TextBlock { Text = title, FontSize = 15, FontWeight = FontWeights.Bold });
        root.Children.Add(new TextBlock { Text = intro, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 8), Foreground = Brushes.DimGray });
        root.Children.Add(_inForce);
        root.Children.Add(Body);
        root.Children.Add(Heading("Save for"));
        var target = new StackPanel { Orientation = Orientation.Horizontal };
        _toProject.Content = $"This project ({key})";
        _toOffice.Content = "Every project in the office";
        target.Children.Add(_toProject); target.Children.Add(_toOffice);
        root.Children.Add(target);
        root.Children.Add(_status);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
        buttons.Children.Add(_save);
        root.Children.Add(buttons);
        Content = new ScrollViewer { Content = root, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        _save.Click += (_, _) => Save();
        _toOffice.Checked += (_, _) => Say(_projectHasOwn ? $"{key} has its own {kind}, which wins over the office's — saving for the office changes the other projects." : null, false);
        _toProject.Checked += (_, _) => Say(null, false);
        Say($"Reading the {kind} in force…", false);
    }

    /// <summary>Draw the form from the body in force (null: none saved yet). A body that does not read throws; the window is then read-only.</summary>
    protected abstract void Fill(string bodyJson);
    /// <summary>The body to install, or null with the reason in a person's words.</summary>
    protected abstract string BodyJson(out string problem);

    public static TextBlock Heading(string t) => new() { Text = t, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 12, 0, 3) };
    public static List<string> Worksets(Document doc) => doc.IsWorkshared
        ? new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset).Select(w => w.Name).OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList()
        : new List<string>();

    public void Load() => Task.Run(() =>
    {
        try { Read(); }
        catch (Exception e) { Dispatcher.BeginInvoke(new Action(() => { _inForce.Text = "In force now: not read — " + e.Message; Say("Read-only: the standard in force could not be read — " + e.Message, true); })); }
    });

    private void Read()
    {
        var a = ArtefactClient.Resolve(Key, Kind);
        var scope = GovernedNotify.ProjectScope(Key);
        string office = null, officeWhy = scope.Error;
        if (scope.Error is null) office = TypeCatalogExport.OfficeKeyFrom(scope.Json, Key, out officeWhy);
        // The office's own version, for a save for the office: the project's in force may be its own copy, not the office's.
        var o = office != null ? ArtefactClient.Resolve(office, Kind) : null;
        var role = ChangesetClient.MyRole(BcfConfig.Load(), Key, out var roleError);
        var (lead, why) = ChangesetClient.CoordinatorFrom(Key, role, roleError);
        Dispatcher.BeginInvoke(new Action(() =>
        {
            _inForce.Text = "In force now: " + (a.Origin != "none" ? a.Label : a.NotInstalled || a.NoProject ? $"none saved yet — Save makes {Kind}@1" : a.Label);
            // Only the bridge's answer is edited: a cached copy may be older than what is in force, and a none it did not confirm may hide one.
            string blocked = a.Origin == "cache" ? "the bridge was not reached, so this is the copy cached on this PC — it may be older than the one in force"
                           : a.Origin == "none" && !a.NotInstalled && !a.NoProject ? "the bridge did not answer (" + a.Reason + ")" : null;
            try { Fill(a.Origin != "none" ? a.BodyJson : null); }
            catch (Exception e) { blocked ??= $"{a.Label} did not read ({e.Message})"; }
            _readSha = a.Origin == "bridge" ? a.Sha256 : null;
            _officeSha = o?.Origin == "bridge" ? o.Sha256 : null;
            _projectHasOwn = a.Origin != "none" && string.Equals(a.Source, "project", StringComparison.OrdinalIgnoreCase);
            _office = office;
            _toOffice.IsEnabled = lead && office != null && blocked == null;
            _toOffice.Content = office != null ? $"Every project in the office ({office})" : "Every project in the office (" + (officeWhy ?? "this project has no office") + ")";
            Body.IsEnabled = true;
            _save.IsEnabled = lead && blocked == null;
            Say(blocked != null ? "Read-only: " + blocked + "." : lead ? null : $"Read-only: only a lead or owner of the web project can change the {Kind} — " + why + ".", blocked != null || !lead);
        }));
    }

    private void Save()
    {
        var target = _toOffice.IsChecked == true && _office != null ? _office : Key;
        string body, problem;
        try { body = BodyJson(out problem); }
        catch (Exception e) { Say("Not saved: " + e.Message, true); return; }
        if (body == null) { Say("Not saved: " + problem, true); return; }
        string actor;
        try { actor = UserSession.Actor; }
        catch (Exception e) { Say("Not saved: " + e.Message, true); return; }
        _save.IsEnabled = false;
        Say($"Saving on {target}…", false);
        var readSha = target == Key ? _readSha : _officeSha;
        Task.Run(() =>
        {
            var now = ArtefactClient.Resolve(target, Kind);
            string stale = now.Origin == "bridge" ? (now.Sha256 == readSha ? null : $"{now.Label} was saved since this window opened — close it and open it again to see it; nothing was saved")
                         : now.NotInstalled || now.NoProject ? (readSha == null ? null : $"the {Kind} this window opened with is no longer in force — close it and open it again; nothing was saved")
                         : "the bridge was not reached (" + now.Reason + "); nothing was saved";
            var put = stale == null ? GovernedNotify.InstallArtefact(target, Kind, body, actor) : (0, null, stale);
            Dispatcher.BeginInvoke(new Action(() =>
            {
                _save.IsEnabled = true;
                if (put.Error != null) { Say($"Not saved on {target}: {put.Error}", true); return; }
                Say($"✓ Saved as {Kind}@{put.Version} on {target}, recorded in the ledger. Sentinel uses it from the next command you run.", false);
                if (target != Key) _officeSha = put.Sha256;
                if (target == Key || !_projectHasOwn) { _readSha = put.Sha256; _inForce.Text = $"In force now: {Kind}@{put.Version} · " + (target == Key ? "project" : "office"); }
                if (target == Key) _projectHasOwn = true;
            }));
        });
    }

    protected void Say(string text, bool bad)
    {
        _status.Text = text ?? "";
        _status.Foreground = bad ? Brushes.Firebrick : Brushes.DarkGreen;
    }

    // ── small controls: a value typed or picked updates the model as it changes ──
    public static TextBox Text(string value, Action<string> set, double width = double.NaN, string tip = null)
    {
        var t = new TextBox { Text = value ?? "", Width = width, ToolTip = tip, Padding = new Thickness(2, 1, 2, 1) };
        t.TextChanged += (_, _) => set(t.Text);
        return t;
    }

    /// <summary>An editable list: pick one of the model's names or type another. No auto-complete — it would turn a typed "Level 1" into "Level 10".</summary>
    public static ComboBox Pick(IEnumerable<string> items, string value, Action<string> set, double width = double.NaN)
    {
        var c = new ComboBox { IsEditable = true, IsTextSearchEnabled = false, ItemsSource = (items ?? Enumerable.Empty<string>()).ToList(), Text = value ?? "", Width = width };
        c.AddHandler(TextBoxBase.TextChangedEvent, new TextChangedEventHandler((_, _) => set(c.Text)));
        return c;
    }

    /// <summary>A label over its control, side by side with others in a wrap panel.</summary>
    public static FrameworkElement Field(string label, FrameworkElement control, double width)
    {
        var p = new StackPanel { Width = width, Margin = new Thickness(0, 2, 10, 4), HorizontalAlignment = HorizontalAlignment.Left }; // a fixed width is not centred
        p.Children.Add(new TextBlock { Text = label, Foreground = Brushes.DimGray, FontSize = 11, Margin = new Thickness(0, 0, 0, 1) });
        control.HorizontalAlignment = HorizontalAlignment.Stretch;
        p.Children.Add(control);
        return p;
    }

    public static Button Small(string text, Action click)
    {
        var b = new Button { Content = text, Padding = new Thickness(7, 1, 7, 1), Margin = new Thickness(4, 0, 0, 0) };
        b.Click += (_, _) => click();
        return b;
    }

    public static Border Card(UIElement child) => new()
    {
        Child = child, BorderBrush = Brushes.Gainsboro, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(3),
        Padding = new Thickness(8, 6, 8, 6), Margin = new Thickness(0, 0, 0, 6),
    };
}

public sealed class GuidelineWindow : StandardEditorWindow
{
    public sealed class Picks
    {
        public List<string> Levels = new(), TitleBlocks = new(), Worksets = new();
        /// <summary>Category → family → its types, from this model.</summary>
        public Dictionary<string, SortedDictionary<string, List<string>>> Families = new(StringComparer.OrdinalIgnoreCase);
    }

    private readonly Picks _p;
    private GuidelineEdit _g = GuidelineEdit.From(null);
    private readonly ComboBox _category = new() { MinWidth = 220 };
    private readonly ComboBox _addCategory = new() { MinWidth = 160, Margin = new Thickness(14, 0, 0, 0) };
    private readonly StackPanel _rules = new(), _default = new(), _sheets = new(), _placement = new();
    private readonly StackPanel _standard = new();

    public GuidelineWindow(string key, Picks picks) : base(key, "guideline", "Modelling Guideline",
        "How Sentinel types what it builds and promotes: for each category, rules and a default. A rule with more conditions is tried before one with fewer; between rules with as many conditions, the higher one wins (↑ ↓). Also the sheets Annotate makes and the worksets new elements go on. Names come from this model; type another if it is not here.")
    {
        _p = picks;
        Body.Children.Add(_standard);
        Body.Children.Add(Heading("Rules for a category"));
        var bar = new StackPanel { Orientation = Orientation.Horizontal };
        bar.Children.Add(_category);
        bar.Children.Add(Small("Remove this category", RemoveCategory));
        bar.Children.Add(_addCategory);
        bar.Children.Add(Small("Add the category", AddCategory));
        Body.Children.Add(bar);
        Body.Children.Add(new TextBlock { Text = "A blank field is not a condition. Parameters: Name = value; another = value (the value is matched as part of the element's).", Foreground = Brushes.DimGray, FontSize = 11, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 4) });
        Body.Children.Add(_rules);
        Body.Children.Add(_default);
        Body.Children.Add(Heading("Sheets (optional)"));
        Body.Children.Add(_sheets);
        Body.Children.Add(Heading("Placement (optional)"));
        Body.Children.Add(_placement);
        _category.SelectionChanged += (_, _) => DrawCategory();
    }

    protected override void Fill(string bodyJson)
    {
        _g = GuidelineEdit.From(bodyJson);
        _standard.Children.Clear();
        _standard.Children.Add(Field("Name of the guideline", Text(_g.Standard, v => _g.Standard = v), 520));
        RefreshCategories(0);
        DrawSheets();
        DrawPlacement();
    }

    protected override string BodyJson(out string problem) => _g.ToJson(out problem);

    private GuidelineEdit.Element Current => _category.SelectedIndex >= 0 && _category.SelectedIndex < _g.Elements.Count ? _g.Elements[_category.SelectedIndex] : null;

    private void RefreshCategories(int select)
    {
        var labels = _g.Elements.Select((e, i) => e.Category + (_g.Elements.Take(i).Count(x => x.Category.Trim().Equals(e.Category.Trim(), StringComparison.OrdinalIgnoreCase)) is var n && n > 0 ? $" ({n + 1})" : "")).ToList();
        _category.ItemsSource = labels;
        _category.SelectedIndex = labels.Count == 0 ? -1 : Math.Max(0, Math.Min(select, labels.Count - 1));
        _addCategory.ItemsSource = GuidelineEdit.Categories.Where(c => !_g.Elements.Any(e => e.Category.Trim().Equals(c, StringComparison.OrdinalIgnoreCase))).ToList();
        _addCategory.SelectedIndex = _addCategory.Items.Count > 0 ? 0 : -1;
        DrawCategory();
    }

    private void AddCategory()
    {
        if (_addCategory.SelectedItem is not string c) return;
        _g.Elements.Add(new GuidelineEdit.Element { Category = c });
        RefreshCategories(_g.Elements.Count - 1);
    }

    private void RemoveCategory()
    {
        var i = _category.SelectedIndex;
        if (i < 0 || i >= _g.Elements.Count) return;
        Say($"{_g.Elements[i].Category} and its rules are out of the form — Save to keep that, or close the window to keep the guideline as it is.", false);
        _g.Elements.RemoveAt(i);
        RefreshCategories(i);
    }

    private void DrawCategory()
    {
        _rules.Children.Clear(); _default.Children.Clear();
        var e = Current;
        if (e == null) { _rules.Children.Add(new TextBlock { Text = "No category yet — add one above.", Foreground = Brushes.DimGray }); return; }
        for (int i = 0; i < e.Rules.Count; i++) _rules.Children.Add(RuleCard(e, i));
        _rules.Children.Add(new StackPanel { Orientation = Orientation.Horizontal, Children = { Small("+ Add a rule", () => { e.Rules.Add(new GuidelineEdit.Rule()); DrawCategory(); }) } });
        _default.Children.Add(Heading($"Default for {e.Category} (when no rule matches; optional)"));
        var d = new WrapPanel();
        AddUse(d, e, e.Default);
        _default.Children.Add(Card(d));
    }

    private UIElement RuleCard(GuidelineEdit.Element e, int i)
    {
        var r = e.Rules[i];
        var box = new StackPanel();
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 3) };
        var tools = new StackPanel { Orientation = Orientation.Horizontal };
        tools.Children.Add(Small("↑", () => Move(e, i, -1)));
        tools.Children.Add(Small("↓", () => Move(e, i, +1)));
        tools.Children.Add(Small("Remove", () => { e.Rules.RemoveAt(i); DrawCategory(); }));
        DockPanel.SetDock(tools, Dock.Right);
        head.Children.Add(tools);
        head.Children.Add(new TextBlock { Text = $"Rule {i + 1}", FontWeight = FontWeights.SemiBold });
        box.Children.Add(head);
        var when = new WrapPanel();
        when.Children.Add(Field("When — CAD layer", Text(r.Layer, v => r.Layer = v), 160));
        when.Children.Add(Field("level", Pick(_p.Levels, r.Level, v => r.Level = v), 150));
        when.Children.Add(Field("discipline", Text(r.Discipline, v => r.Discipline = v), 130));
        when.Children.Add(Field("parameters", Text(r.Params, v => r.Params = v, tip: "Name = value; another = value"), 230));
        box.Children.Add(when);
        var use = new WrapPanel();
        AddUse(use, e, r.Use);
        use.Children.Add(Field("why (optional)", Text(r.Why, v => r.Why = v), 300));
        box.Children.Add(use);
        return Card(box);
    }

    /// <summary>Use — family (this model's of the category), type (that family's), or a type pattern; the run width for stairs.</summary>
    private void AddUse(Panel into, GuidelineEdit.Element e, GuidelineEdit.Use u)
    {
        _p.Families.TryGetValue(e.Category.Trim(), out var fams);
        fams ??= new SortedDictionary<string, List<string>>();
        ComboBox type = null;
        List<string> TypesOf(string family) => fams.TryGetValue((family ?? "").Trim(), out var t) ? t : new List<string>();
        var family = Pick(fams.Keys, u.Family, v =>
        {
            if (v == u.Family) return;
            u.Family = v;
            if (type == null) return;
            var keep = type.Text; // swapping the list may clear an editable box's text; the type stays as the person left it
            type.ItemsSource = TypesOf(v);
            type.Text = keep;
        });
        type = Pick(TypesOf(u.Family), u.Type, v => u.Type = v);
        into.Children.Add(Field("Use — family", family, 170));
        into.Children.Add(Field("type", type, 200));
        into.Children.Add(Field("or a type pattern, e.g. EXT_{thickness} mm", Text(u.TypePattern, v => u.TypePattern = v), 230));
        if (e.IsStairs) into.Children.Add(Field("run width, mm", Text(u.WidthMm, v => u.WidthMm = v), 100));
    }

    private void Move(GuidelineEdit.Element e, int i, int by)
    {
        var j = i + by;
        if (j < 0 || j >= e.Rules.Count) return;
        (e.Rules[i], e.Rules[j]) = (e.Rules[j], e.Rules[i]);
        DrawCategory();
    }

    private void DrawSheets()
    {
        _sheets.Children.Clear();
        var w = new WrapPanel();
        w.Children.Add(Field("Title block (Family : Type)", Pick(_p.TitleBlocks, _g.TitleBlock, v => _g.TitleBlock = v), 240));
        w.Children.Add(Field("Sheet number, e.g. A-{level}-{n}", Text(_g.SheetNumber, v => _g.SheetNumber = v), 200));
        w.Children.Add(Field("Sheet name, e.g. {level} {use}", Text(_g.SheetName, v => _g.SheetName = v), 220));
        _sheets.Children.Add(w);
        _sheets.Children.Add(new TextBlock { Text = "{level} the level's name · {use} the view's use · {prefix} its prefix · {n} a running number. All three blank: Annotate makes no sheets.", Foreground = Brushes.DimGray, FontSize = 11, TextWrapping = TextWrapping.Wrap });
    }

    private void DrawPlacement()
    {
        _placement.Children.Clear();
        _placement.Children.Add(new TextBlock { Text = _p.Worksets.Count == 0 ? "This model is not workshared — names typed here are used in workshared models. Blank = the active workset." : "The workset each category's new elements go on. Blank = the active workset.", Foreground = Brushes.DimGray, FontSize = 11, TextWrapping = TextWrapping.Wrap });
        var w = new WrapPanel();
        var choices = new[] { "" }.Concat(_p.Worksets).ToList();
        foreach (var c in GuidelineEdit.PlacementCategories)
        {
            var cat = c;
            w.Children.Add(Field(cat, Pick(choices, _g.Worksets.TryGetValue(cat, out var ws) ? ws : "", v => _g.Worksets[cat] = v), 170));
        }
        _placement.Children.Add(w);
        var phase = new CheckBox { Content = "Place new elements in the phase of the view the person builds in", IsChecked = _g.PhaseView, Margin = new Thickness(0, 4, 0, 0) };
        phase.Checked += (_, _) => _g.PhaseView = true;
        phase.Unchecked += (_, _) => _g.PhaseView = false;
        _placement.Children.Add(phase);
    }
}

public sealed class IfcExportWindow : StandardEditorWindow
{
    private readonly List<string> _params;
    private IfcExportMapping _m = new();
    private readonly TextBox _label = new() { Width = 520 };
    private readonly ComboBox _common = new() { Width = 320, ItemsSource = new[] { "The exporter's default", "Yes — also export them", "No" } };
    private readonly ListBox _sets = new() { Width = 200, MinHeight = 240 };
    private readonly StackPanel _set = new() { Margin = new Thickness(12, 0, 0, 0) };
    private bool _quiet;

    public IfcExportWindow(string key, List<string> parameterNames) : base(key, "ifc_export", "IFC Export Mapping",
        "The property sets Governed Publish asks Revit's IFC exporter to write: each set's name, the IFC classes it goes on and its properties, each read from a Revit parameter of this model (blank = the parameter of the property's name).")
    {
        _params = parameterNames;
        Body.Children.Add(Field("Name of this mapping, e.g. Client EIR 2026 property sets", _label, 520));
        Body.Children.Add(Field("IFC common property sets (Pset_WallCommon …)", _common, 320));
        Body.Children.Add(Heading("Property sets"));
        var left = new StackPanel();
        left.Children.Add(_sets);
        var lb = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 0) };
        lb.Children.Add(Small("+ Add a set", AddSet));
        lb.Children.Add(Small("Remove", RemoveSet));
        left.Children.Add(lb);
        var row = new DockPanel();
        DockPanel.SetDock(left, Dock.Left);
        row.Children.Add(left);
        row.Children.Add(_set);
        Body.Children.Add(row);
        _label.TextChanged += (_, _) => _m.Label = _label.Text.Trim();
        _common.SelectionChanged += (_, _) => _m.CommonPsets = _common.SelectedIndex switch { 1 => true, 2 => false, _ => null };
        _sets.SelectionChanged += (_, _) => { if (!_quiet) DrawSet(); };
    }

    protected override void Fill(string bodyJson)
    {
        _m = bodyJson == null ? new IfcExportMapping() : IfcExportMapping.FromBody(bodyJson, out var error) ?? throw new FormatException(error);
        _label.Text = _m.Label;
        _common.SelectedIndex = _m.CommonPsets switch { true => 1, false => 2, _ => 0 };
        RefreshSets(0);
    }

    protected override string BodyJson(out string problem)
    {
        problem = _m.Problem();
        if (problem != null) return null;
        var json = _m.ToJson();
        if (IfcExportMapping.FromBody(json, out var error) == null) { problem = "The mapping would not install: " + error; return null; }
        return json;
    }

    private IfcExportMapping.Pset Current => _sets.SelectedIndex >= 0 && _sets.SelectedIndex < _m.Psets.Count ? _m.Psets[_sets.SelectedIndex] : null;

    private void Names() => _sets.ItemsSource = _m.Psets.Select((s, i) => s.Name.Length > 0 ? s.Name : $"(set {i + 1})").ToList();

    private void RefreshSets(int select)
    {
        Names();
        _sets.SelectedIndex = _m.Psets.Count == 0 ? -1 : Math.Max(0, Math.Min(select, _m.Psets.Count - 1));
        DrawSet();
    }

    private void AddSet()
    {
        _m.Psets.Add(new IfcExportMapping.Pset { Name = "Pset_New" + (_m.Psets.Count + 1), Level = "instance", Properties = { new IfcExportMapping.Prop { Type = "Text" } } });
        RefreshSets(_m.Psets.Count - 1);
    }

    private void RemoveSet()
    {
        var i = _sets.SelectedIndex;
        if (i < 0 || i >= _m.Psets.Count) return;
        _m.Psets.RemoveAt(i);
        RefreshSets(i);
    }

    private void DrawSet()
    {
        _set.Children.Clear();
        var s = Current;
        if (s == null) { _set.Children.Add(new TextBlock { Text = "No property set yet — add one.", Foreground = Brushes.DimGray }); return; }
        var name = Text(s.Name, v => s.Name = v.Trim());
        // The list shows the new name when the box is left, not on each key (redrawing the set would take the box away mid-word).
        name.LostFocus += (_, _) => { var i = _sets.SelectedIndex; _quiet = true; Names(); _sets.SelectedIndex = i; _quiet = false; };
        _set.Children.Add(Field("Set name (letters, digits and _, e.g. Pset_ClientWall)", name, 420));
        var inst = new RadioButton { Content = "For each element (instance)", IsChecked = s.Level != "type", Margin = new Thickness(0, 0, 14, 0) };
        var type = new RadioButton { Content = "For its type", IsChecked = s.Level == "type" };
        inst.Checked += (_, _) => s.Level = "instance";
        type.Checked += (_, _) => s.Level = "type";
        _set.Children.Add(new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 2, 0, 6), Children = { inst, type } });

        _set.Children.Add(new TextBlock { Text = "IFC classes it goes on", FontWeight = FontWeights.SemiBold });
        var have = s.Classes.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries).ToList();
        var ticks = new List<(string Name, CheckBox Box)>();
        var grid = new UniformGrid { Columns = 3 };
        foreach (var c in IfcExportMapping.CommonClasses)
        {
            var b = new CheckBox { Content = c, IsChecked = have.Contains(c), Margin = new Thickness(0, 1, 8, 1) };
            ticks.Add((c, b)); grid.Children.Add(b);
        }
        _set.Children.Add(grid);
        var other = Text(string.Join(", ", have.Where(c => !IfcExportMapping.CommonClasses.Contains(c))), _ => { }, 420);
        // Classes are rebuilt only when a tick or the box changes, so an unchanged set keeps its order (and the body its sha).
        void Rebuild() => s.Classes = string.Join(",", ticks.Where(t => t.Box.IsChecked == true).Select(t => t.Name)
            .Concat(other.Text.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries).Select(x => x.Trim())).Distinct());
        foreach (var (_, b) in ticks) { b.Checked += (_, _) => Rebuild(); b.Unchecked += (_, _) => Rebuild(); }
        other.TextChanged += (_, _) => Rebuild();
        _set.Children.Add(Field("Other IFC classes, in the exporter's spelling (e.g. IfcFlowTerminal, IfcPile)", other, 420));

        _set.Children.Add(new TextBlock { Text = "Properties", FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 6, 0, 2) });
        for (int j = 0; j < s.Properties.Count; j++)
        {
            var p = s.Properties[j];
            var at = j;
            var line = new WrapPanel();
            line.Children.Add(Field("Name", Text(p.Name, v => p.Name = v.Trim()), 170));
            var dt = new ComboBox { ItemsSource = IfcExportMapping.TypeChoices, SelectedItem = IfcExportMapping.TypeChoices.Contains(p.Type) ? p.Type : null };
            dt.SelectionChanged += (_, _) => p.Type = dt.SelectedItem as string ?? "";
            line.Children.Add(Field("Data type", dt, 140));
            line.Children.Add(Field("Revit parameter (blank = the property's name)", Pick(_params, p.RevitParameter, v => p.RevitParameter = v.Trim()), 240));
            var rm = Small("Remove", () => { s.Properties.RemoveAt(at); DrawSet(); });
            rm.VerticalAlignment = VerticalAlignment.Bottom; rm.Margin = new Thickness(0, 0, 0, 5);
            line.Children.Add(rm);
            _set.Children.Add(Card(line));
        }
        _set.Children.Add(new StackPanel { Orientation = Orientation.Horizontal, Children = { Small("+ Add a property", () => { s.Properties.Add(new IfcExportMapping.Prop { Type = "Text" }); DrawSet(); }) } });
    }
}
