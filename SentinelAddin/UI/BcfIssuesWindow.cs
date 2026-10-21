using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Sentinel.Coordination;

namespace Sentinel.UI;

/// <summary>
/// Modeless issue tracker for the project's BCF topics — Sentinel's own BCF Manager (founder, 2026-10-21: no BIMcollab).
/// A columned list (Nr/Title/Status/Priority/Assigned/Due/Modified) that sorts on a header click, a search box and
/// status/type/priority/mine filters; the selected issue's snapshot and details; a quick edit (status, priority, assignee,
/// due date) and a quick comment; zoom, section box, isolate, selection lookup, new issue, Fix in Revit, BCF files.
/// Built entirely in code; SetTopics/SetStatus/HighlightTopics marshal via the dispatcher so the background fetch never
/// touches controls directly. Every write goes to the bridge through the command (roles and the lead's rules live there).
/// </summary>
public sealed class BcfIssuesWindow : Window
{
    private readonly ListView _list;
    private readonly GridView _grid;
    private readonly TextBlock _details;
    private readonly Image _snapshot;
    private readonly TextBlock _status;
    private readonly TextBox _search = new() { MinWidth = 140, Margin = new Thickness(0, 0, 6, 0) };
    private readonly ComboBox _fStatus = new() { Margin = new Thickness(0, 0, 6, 0) };
    private readonly ComboBox _fType = new() { Margin = new Thickness(0, 0, 6, 0) };
    private readonly ComboBox _fPriority = new() { Margin = new Thickness(0, 0, 6, 0) };
    private readonly CheckBox _fMine = new() { Content = "Mine", VerticalAlignment = VerticalAlignment.Center };
    private readonly ComboBox _eStatus = new() { MinWidth = 96, Margin = new Thickness(0, 0, 4, 0) };
    private readonly ComboBox _ePriority = new() { MinWidth = 76, Margin = new Thickness(0, 0, 4, 0) };
    private readonly TextBox _eAssigned = new() { MinWidth = 120, Margin = new Thickness(0, 0, 4, 0) };
    private readonly DatePicker _eDue = new() { Margin = new Thickness(0, 0, 4, 0) };
    private readonly Button _eSave;
    private readonly TextBox _comment = new() { AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MaxHeight = 60, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    private readonly Button _send;
    private readonly Button _fix;
    private readonly Func<string> _me;
    private IReadOnlyList<BcfTopic> _all = new List<BcfTopic>();
    private List<BcfTopic> _visible = new();
    private string _sortKey = "Nr";
    private bool _sortDesc;
    private string? _shownGuid;   // the issue whose edit fields are showing — a refresh of the same issue keeps what was typed
    private bool _rendering;      // an ItemsSource reset fires SelectionChanged(null); nothing is cleared for it

    private static string[] Statuses => IssueList.Statuses;
    private const string OpenIssues = IssueList.OpenIssues;

    public event Action<BcfTopic>? TopicActivated;
    public event Action<BcfTopic>? SectionBoxRequested;
    public event Action? RefreshRequested;
    public event Action? IsolateAllRequested;
    public event Action? IssuesForSelectionRequested;
    public event Action<BcfTopic>? FixRequested;
    public event Action? NewIssueRequested;
    public event Action? ImportRequested;
    public event Action? ExportRequested;
    /// <summary>A quick comment on the selected issue.</summary>
    public event Action<BcfTopic, string>? CommentRequested;
    /// <summary>A quick edit: only the fields that differ from the topic (topic_status, priority, assigned_to, due_date).</summary>
    public event Action<BcfTopic, Dictionary<string, object?>>? EditRequested;

    /// <summary>The issues now listed (after the filters) — what isolate-all works on.</summary>
    public IReadOnlyList<BcfTopic> Topics => _visible;
    /// <summary>Every issue fetched — the selection lookup searches these, so a hidden (closed, filtered) issue is still found.</summary>
    public IReadOnlyList<BcfTopic> AllTopics => _all;

    /// <param name="me">Who is signed in, read at each use — for the "Mine" filter.</param>
    public BcfIssuesWindow(Func<string>? me = null)
    {
        _me = me ?? (() => "");
        Title = "Sentinel — Coordination Issues (BCF)";
        Width = 700;
        Height = 860;
        MinWidth = 560; MinHeight = 600;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        // ── filters ──
        foreach (var s in new[] { OpenIssues }.Concat(Statuses).Concat(new[] { "All" })) _fStatus.Items.Add(s);
        _fStatus.SelectedIndex = 0;
        _fType.Items.Add("All types"); foreach (var t in IssueDraft.Types) _fType.Items.Add(t); _fType.SelectedIndex = 0;
        _fPriority.Items.Add("All priorities"); foreach (var p in IssueDraft.Priorities) _fPriority.Items.Add(p); _fPriority.SelectedIndex = 0;
        _search.TextChanged += (_, __) => Render();
        foreach (var c in new[] { _fStatus, _fType, _fPriority }) c.SelectionChanged += (_, __) => Render();
        _fMine.Checked += (_, __) => Render(); _fMine.Unchecked += (_, __) => Render();
        var filters = new WrapPanel { Margin = new Thickness(0, 0, 0, 4) };
        filters.Children.Add(new TextBlock { Text = "Search ", VerticalAlignment = VerticalAlignment.Center });
        filters.Children.Add(_search);
        filters.Children.Add(_fStatus); filters.Children.Add(_fType); filters.Children.Add(_fPriority); filters.Children.Add(_fMine);

        // ── list ──
        _grid = new GridView();
        void Col(string header, string path, double width) =>
            _grid.Columns.Add(new GridViewColumn { Header = header, Width = width, DisplayMemberBinding = new System.Windows.Data.Binding(path) });
        Col("Nr", "Nr", 38); Col("Title", "Title", 250); Col("Status", "Status", 80); Col("Priority", "Priority", 66);
        Col("Assigned", "AssignedTo", 110); Col("Due", "DueDay", 80); Col("Modified", "ModifiedDay", 80);
        _list = new ListView { View = _grid, SelectionMode = SelectionMode.Extended, MinHeight = 120 };
        _list.SelectionChanged += (_, __) => { if (!_rendering) ShowDetails(_list.SelectedItem as BcfTopic); };
        _list.MouseDoubleClick += (_, __) => ActivateSelected();
        _list.AddHandler(GridViewColumnHeader.ClickEvent, new RoutedEventHandler((_, e) =>
        {
            if (e.OriginalSource is not GridViewColumnHeader h || h.Column?.DisplayMemberBinding is not System.Windows.Data.Binding b) return;
            var key = b.Path.Path;
            _sortDesc = key == _sortKey && !_sortDesc;
            _sortKey = key;
            Render();
        }));

        // ── details ──
        _snapshot = new Image { MaxHeight = 160, Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(6, 6, 6, 0), Visibility = Visibility.Collapsed };
        _details = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(6), FontFamily = new FontFamily("Consolas") };
        var detailStack = new StackPanel(); detailStack.Children.Add(_snapshot); detailStack.Children.Add(_details);
        var detailScroll = new ScrollViewer
        {
            Content = detailStack, Height = 230, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Background = Brushes.WhiteSmoke, BorderBrush = Brushes.LightGray, BorderThickness = new Thickness(1), Margin = new Thickness(0, 6, 0, 0),
        };

        Button Btn(string text, Action? click, double top = 4)
        {
            var b = new Button { Content = text, Margin = new Thickness(0, top, 0, 0), Padding = new Thickness(6) };
            b.Click += (_, __) => click?.Invoke();
            return b;
        }

        // ── quick edit + quick comment (BCF Manager's pencil and "Quick comment") ──
        foreach (var s in Statuses) _eStatus.Items.Add(s);
        foreach (var p in IssueDraft.Priorities) _ePriority.Items.Add(p);
        _eSave = new Button { Content = "Save changes", Padding = new Thickness(6, 2, 6, 2) };
        _eSave.Click += (_, __) => SaveEdit();
        var edit = new WrapPanel { Margin = new Thickness(0, 6, 0, 0) };
        edit.Children.Add(new TextBlock { Text = "Status ", VerticalAlignment = VerticalAlignment.Center }); edit.Children.Add(_eStatus);
        edit.Children.Add(new TextBlock { Text = "Priority ", VerticalAlignment = VerticalAlignment.Center }); edit.Children.Add(_ePriority);
        edit.Children.Add(new TextBlock { Text = "Assigned ", VerticalAlignment = VerticalAlignment.Center }); edit.Children.Add(_eAssigned);
        edit.Children.Add(new TextBlock { Text = "Due ", VerticalAlignment = VerticalAlignment.Center }); edit.Children.Add(_eDue);
        edit.Children.Add(_eSave);
        _send = new Button { Content = "Send comment", Padding = new Thickness(6, 2, 6, 2), Margin = new Thickness(4, 0, 0, 0), VerticalAlignment = VerticalAlignment.Top };
        _send.Click += (_, __) => SendComment();
        var commentRow = new DockPanel { Margin = new Thickness(0, 4, 0, 0) };
        DockPanel.SetDock(_send, Dock.Right); commentRow.Children.Add(_send); commentRow.Children.Add(_comment);
        _comment.ToolTip = "A comment on the selected issue, under your name; everyone sees it on the web board too.";

        // ── actions ──
        var act = new UniformGrid { Columns = 2, Margin = new Thickness(0, 4, 0, 0) };
        var zoom = Btn("Zoom to issue (or double-click)", ActivateSelected, 0); zoom.Margin = new Thickness(0, 0, 2, 0);
        var box = Btn("Section box around issue", () => { if (_list.SelectedItem is BcfTopic t) SectionBoxRequested?.Invoke(t); }, 0); box.Margin = new Thickness(2, 0, 0, 0);
        box.ToolTip = "A section box on the Sentinel Coordination view around the issue's elements, with 1 m of air; Undo removes it.";
        var isolateAll = Btn("Isolate ALL listed issue elements", () => IsolateAllRequested?.Invoke(), 0); isolateAll.Margin = new Thickness(0, 4, 2, 0);
        var forSel = Btn("Issues for my Revit selection", () => IssuesForSelectionRequested?.Invoke(), 0); forSel.Margin = new Thickness(2, 4, 0, 0);
        act.Children.Add(zoom); act.Children.Add(box); act.Children.Add(isolateAll); act.Children.Add(forSel);
        var raise = Btn("＋ New issue from my Revit selection", () => NewIssueRequested?.Invoke());
        raise.FontWeight = FontWeights.SemiBold;
        raise.ToolTip = "Select the element(s) in Revit (a 3D view also sends its camera and a snapshot), then describe the issue — it lands on the web board, linked to them.";
        _fix = Btn("Fix in Revit (referee-raised IDS issues only)", () => { if (_list.SelectedItem is BcfTopic t) FixRequested?.Invoke(t); });
        _fix.IsEnabled = false;
        _fix.ToolTip = "Only issues the referee raised (title “IDS: … — … (N failing)”) can be fixed in place.";

        // Work alongside ACC and BIMcollab: a BCF file in, a BCF file out (spec 2026-10-19-work-alongside-connectors).
        var files = new UniformGrid { Columns = 3, Margin = new Thickness(0, 4, 0, 0) };
        var import = Btn("Import BCF file…", () => ImportRequested?.Invoke(), 0);
        import.ToolTip = "Add or update issues from a .bcf/.bcfzip exported by ACC, BIMcollab or another BCF tool.";
        import.Margin = new Thickness(0, 0, 2, 0);
        var export = Btn("Export BCF file…", () => ExportRequested?.Invoke(), 0);
        export.ToolTip = "Save this project's issues as a .bcfzip — BCF 2.1 for ACC, or BCF 3.0.";
        export.Margin = new Thickness(2, 0, 2, 0);
        var refresh = Btn("Refresh", () => RefreshRequested?.Invoke(), 0); refresh.Margin = new Thickness(2, 0, 0, 0);
        files.Children.Add(import); files.Children.Add(export); files.Children.Add(refresh);

        _status = new TextBlock { Text = "…", Margin = new Thickness(0, 6, 0, 0), TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray };

        // List fills; everything else pinned top/bottom (bottom children added bottom→top).
        var root = new DockPanel { Margin = new Thickness(12) };
        foreach (var (el, dock) in new (UIElement, Dock)[]
        {
            (_status, Dock.Bottom), (_fix, Dock.Bottom), (files, Dock.Bottom), (raise, Dock.Bottom), (act, Dock.Bottom),
            (commentRow, Dock.Bottom), (edit, Dock.Bottom), (detailScroll, Dock.Bottom),
            (filters, Dock.Top),
        })
        {
            DockPanel.SetDock(el, dock);
            root.Children.Add(el);
        }
        root.Children.Add(_list); // last child fills the remaining space
        Content = root;
        ShowDetails(null);
    }

    private void ActivateSelected()
    {
        if (_list.SelectedItem is BcfTopic t) TopicActivated?.Invoke(t);
    }

    private void Render()
    {
        var selected = (_list.SelectedItem as BcfTopic)?.Guid;
        var me = _fMine.IsChecked == true ? _me() : null;
        if (me != null && me.Trim().Length == 0) me = "\u0000"; // signed out: "Mine" matches nothing, and the count line says so
        _visible = IssueList.Filter(_all, _search.Text, _fStatus.SelectedItem as string ?? OpenIssues, _fType.SelectedItem as string ?? "All", _fPriority.SelectedItem as string ?? "All", me, _sortKey, _sortDesc);
        _rendering = true;
        try { _list.ItemsSource = _visible; } finally { _rendering = false; }
        foreach (GridViewColumn c in _grid.Columns)
        {
            var text = (c.Header as string ?? "").TrimEnd(' ', '▲', '▼');
            var path = (c.DisplayMemberBinding as System.Windows.Data.Binding)?.Path.Path;
            c.Header = path == _sortKey ? text + (_sortDesc ? " ▼" : " ▲") : text;
        }
        if (selected != null && _visible.FirstOrDefault(t => t.Guid == selected) is { } keep) _list.SelectedItem = keep;
        else ShowDetails(null);
        CountLine = $"{_visible.Count} of {_all.Count} issue(s) listed" + (me == "\u0000" ? " — sign in for “Mine”" : "");
    }

    /// <summary>"12 of 30 issue(s) listed" for the status line.</summary>
    public string CountLine { get; private set; } = "";

    public void SetTopics(IReadOnlyList<BcfTopic> topics) => Dispatcher.Invoke(() =>
    {
        _all = topics;
        Render();
    });

    // An action's outcome (an issue created or refused) stays on the line for a while: the live refresh that follows
    // the bridge's broadcast would otherwise replace it with the list count within a second.
    private string? _outcome;
    private DateTime _outcomeAt;
    public void SetOutcome(string text) => Dispatcher.Invoke(() => { _outcome = text; _outcomeAt = DateTime.UtcNow; _status.Text = text; });
    public void SetStatus(string text) => Dispatcher.Invoke(() =>
        _status.Text = _outcome != null && text != _outcome && (DateTime.UtcNow - _outcomeAt).TotalSeconds < 90 ? _outcome + nl2 + text : text);
    private static readonly string nl2 = Environment.NewLine;

    /// <summary>Select + reveal the topics the Revit selection was found in (the filters widen to "All" when one is hidden).</summary>
    public void HighlightTopics(IReadOnlyList<BcfTopic> matched) => Dispatcher.Invoke(() =>
    {
        if (matched.Any(m => !_visible.Contains(m))) { _fStatus.SelectedItem = "All"; _search.Text = ""; _fMine.IsChecked = false; _fType.SelectedIndex = 0; _fPriority.SelectedIndex = 0; }
        _list.SelectedItems.Clear();
        foreach (BcfTopic t in matched) _list.SelectedItems.Add(t);
        if (matched.Count > 0)
        {
            _list.ScrollIntoView(matched[0]);
            ShowDetails(matched[0]);
        }
    });

    private void ShowDetails(BcfTopic? t)
    {
        _fix.IsEnabled = t != null && IdsIssueRef.TryParse(t.Title) != null;
        foreach (Control c in new Control[] { _eStatus, _ePriority, _eAssigned, _eDue, _eSave, _comment, _send }) c.IsEnabled = t != null;
        if (t is null) { _shownGuid = null; _details.Text = string.Empty; _snapshot.Visibility = Visibility.Collapsed; _eAssigned.Text = ""; _eDue.SelectedDate = null; _comment.Text = ""; return; }

        // The edit fields and the comment box are reset only for another issue: a live refresh of this one (a colleague's
        // comment) keeps what is being typed.
        if (t.Guid != _shownGuid)
        {
            _shownGuid = t.Guid;
            var status = Statuses.FirstOrDefault(s => string.Equals(s, t.Status, StringComparison.OrdinalIgnoreCase));
            if (status is null && !string.IsNullOrEmpty(t.Status) && !_eStatus.Items.Contains(t.Status)) _eStatus.Items.Add(t.Status); // a status another tool set stays selectable
            _eStatus.SelectedItem = status ?? t.Status;
            _ePriority.SelectedItem = IssueDraft.Priorities.FirstOrDefault(p => string.Equals(p, t.Priority, StringComparison.OrdinalIgnoreCase));
            _eAssigned.Text = t.AssignedTo ?? "";
            _eDue.SelectedDate = DateTimeOffset.TryParse(t.DueDate, out var due) ? due.Date : null;
            _comment.Text = "";
        }
        ShowSnapshot(t.Snapshot);

        var sb = new StringBuilder();
        sb.Append('#').Append(t.Nr).Append("  ").AppendLine(t.Title).AppendLine();
        sb.Append("Type:      ").AppendLine(t.Type);
        sb.Append("Status:    ").AppendLine(t.Status);
        sb.Append("Priority:  ").AppendLine(Or(t.Priority));
        sb.Append("Assigned:  ").AppendLine(Or(t.AssignedTo));
        sb.Append("Due:       ").AppendLine(Or(t.DueDay));
        if (t.Labels is { Count: > 0 }) sb.Append("Labels:    ").AppendLine(string.Join(", ", t.Labels));
        sb.Append("Author:    ").Append(Or(t.Author)).Append("   ").AppendLine(BcfTopic.Day(t.CreationDate));
        sb.Append("Linked el: ").AppendLine(t.LinkedCount.ToString());

        if (!string.IsNullOrWhiteSpace(t.Description))
            sb.AppendLine().AppendLine("Description:").AppendLine(t.Description);

        if (t.Comments is { Count: > 0 })
        {
            sb.AppendLine().Append("Comments (").Append(t.Comments.Count).AppendLine("):");
            foreach (var c in t.Comments) sb.Append("  • ").Append(BcfTopic.Day(c.Date)).Append("  ").Append(Or(c.Author)).Append(": ").AppendLine(c.Text);
        }
        if (t.History is { Count: > 0 })
        {
            sb.AppendLine().Append("History (").Append(t.History.Count).AppendLine("):");
            foreach (var h in t.History)
                sb.Append("  ").Append(BcfTopic.Day(h.Date)).Append("  ").Append(Or(h.Author)).Append(" — ").AppendLine(h.Action);
        }
        _details.Text = sb.ToString();
    }

    private void ShowSnapshot(string? dataUrl)
    {
        _snapshot.Source = null; _snapshot.Visibility = Visibility.Collapsed;
        if (string.IsNullOrEmpty(dataUrl)) return;
        try
        {
            var comma = dataUrl!.IndexOf(',');
            if (!dataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) || comma < 0) return;
            var bytes = Convert.FromBase64String(dataUrl.Substring(comma + 1));
            var img = new BitmapImage();
            using (var ms = new System.IO.MemoryStream(bytes)) { img.BeginInit(); img.CacheOption = BitmapCacheOption.OnLoad; img.StreamSource = ms; img.EndInit(); }
            img.Freeze();
            _snapshot.Source = img; _snapshot.Visibility = Visibility.Visible;
        }
        catch { /* a snapshot that does not decode is simply not shown */ }
    }

    private void SaveEdit()
    {
        if (_list.SelectedItem is not BcfTopic t) return;
        var changes = IssueList.Changes(t, _eStatus.SelectedItem as string, _ePriority.SelectedItem as string, _eAssigned.Text, _eDue.SelectedDate);
        if (changes.Count == 0) { SetStatus("Nothing changed."); return; }
        _eSave.IsEnabled = false; // until ActionDone: a second click must not send twice
        EditRequested?.Invoke(t, changes);
    }

    private void SendComment()
    {
        if (_list.SelectedItem is not BcfTopic t) return;
        var text = _comment.Text.Trim();
        if (text.Length == 0) { SetStatus("Type the comment first."); return; }
        _send.IsEnabled = false; // until ActionDone
        CommentRequested?.Invoke(t, text);
    }

    /// <summary>Clear the comment box after a comment landed.</summary>
    public void CommentSent() => Dispatcher.Invoke(() => _comment.Text = "");
    /// <summary>A comment or edit has been answered (either way): the buttons take the next one.</summary>
    public void ActionDone() => Dispatcher.Invoke(() => { _send.IsEnabled = _list.SelectedItem != null; _eSave.IsEnabled = _list.SelectedItem != null; });

    /// <summary>Disable the Fix button while a plan build is queued; re-enabling still respects the selection.</summary>
    public void SetFixEnabled(bool enabled) => Dispatcher.Invoke(() =>
        _fix.IsEnabled = enabled && _list.SelectedItem is BcfTopic t && IdsIssueRef.TryParse(t.Title) != null);

    private static string Or(string? s) => string.IsNullOrWhiteSpace(s) ? "—" : s!;
}
