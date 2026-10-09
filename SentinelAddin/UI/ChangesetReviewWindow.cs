#nullable disable
// Governed AI modeling (A2): the human gate. One row per proposed element with the REFEREE'S
// verdict — pre-ticked only when the IDS accepted a create, or (MA-0) when it is a Promote retype/attach: a single-answer
// op (§3.4 step 7) whose ghost carries no property sets, so its IDS verdict certifies nothing (the badge still shows
// it; Promote v1 door swaps too, since the founder confirmed DR-1 on 2026-10-01). A human may tick a rejected row (overrule, with the failures on screen — the result records that they did);
// recorded rows say honestly that no spec adjudicated them. The elements the planner sent to a person are listed above
// the rows and cannot be ticked. Modeless, code-only WPF, in GhostReviewWindow's visual family.
// MA-1: a create row names family : type, level and the numbers a reviewer checks.
// MA-3b (AI-2, AI-5): the rows are grouped by what they do, in the web desk's words ("retype wall (28) · 28 ticked"), each group with
// Tick group / Untick group. The window stays open: a refusal keeps the ticks and the note, the status line says what happened and then
// what the bridge took ("reported (ledger #n)"), and Retry report appears while a report has not landed. Apply is pressed once; nothing
// ticked is Decline all, which needs a reason (the note).
// MA-3b2: each group has one reason box — its reason is recorded for that group's unticked rows (result.reasons, beside the note); it is
// taken at the press (read-only from then on), and one with no unticked row to go with is refused in words — and each row has Show:
// select and zoom to its element, or to where a create would be placed.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

public sealed class ChangesetReviewWindow : Window
{
    /// <summary>The ticked, the unticked, the note, and (MA-3b2) a reason per unticked ghost — {proposal_guid: one line}, from each group's
    /// reason box; empty when none was typed.</summary>
    public event Action<List<string>, List<string>, string, Dictionary<string, string>> DecideRequested;
    /// <summary>MA-3b2: a row's Show — the command selects and zooms to its element, or to where a create would be placed.</summary>
    public event Action<ChangesetElementDto> ShowRequested;
    /// <summary>MA-3b: "Retry report" — the results the bridge has not taken yet.</summary>
    public event Action RetryRequested;
    /// <summary>MA-4f: "Show the scan" ticked (true) or unticked (false) — a survey changeset only.</summary>
    public event Action<bool> ScanRequested;
    /// <summary>MA-3c: every row's state after a tick, a group tick, a Lock or Apply — the ghost overlay recolours from it.</summary>
    public event Action<List<(ChangesetElementDto El, bool Ticked, bool Locked)>> TicksChanged;
    /// <summary>MA-3c: every row's state, for the ghost overlay — locked = a declined row (its box disabled).</summary>
    public List<(ChangesetElementDto El, bool Ticked, bool Locked)> RowStates() => _rows.Select(r => (r.El, r.Box.IsChecked == true, !r.Box.IsEnabled)).ToList();
    /// <summary>MA-3c: Apply was pressed — the overlay goes; a Reopen draws it again.</summary>
    public bool Applied => _applied;
    private void Ticks() => TicksChanged?.Invoke(RowStates());

    private readonly List<(CheckBox Box, ChangesetElementDto El)> _rows = new();
    private readonly TextBox _note = new() { MinHeight = 40, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
    private readonly TextBox _status = new()
    {
        IsReadOnly = true, TextWrapping = TextWrapping.Wrap, MaxHeight = 180, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        Visibility = Visibility.Collapsed, Margin = new Thickness(0, 8, 0, 0),
    };
    private readonly Button _go = new() { Padding = new Thickness(12, 4, 12, 4), FontWeight = FontWeights.Bold };
    private readonly Button _retry = new() { Content = "Retry report", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0), Visibility = Visibility.Collapsed };
    private readonly List<Action> _headers = new();
    // MA-3b2: each group's reason box with its rows; and the line a row's Show speaks on — never the status line, which holds the result.
    private readonly List<(string What, TextBox Reason, List<(CheckBox Box, ChangesetElementDto El)> Rows)> _groups = new();
    private readonly TextBlock _shown = new() { Foreground = Brushes.Gray, TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed, Margin = new Thickness(0, 0, 0, 4) };
    private readonly ChangesetDto _cs;
    private bool _applied; // MA-3b: once Apply was raised, never again from this window — a second Apply could place it twice
    private volatile bool _gone;
    /// <summary>MA-3b review C2: the person closed the window — read from any thread; nothing is raised after it, and words go elsewhere.</summary>
    public bool Gone => _gone;

    /// <param name="reach">Review amendment C3 (MA-2c): for each set_parameter's proposal_guid, the elements on its type in the model
    /// now — counted by the caller on the API thread; shown on the row, never read from the reason.</param>
    public ChangesetReviewWindow(ChangesetDto changeset, IReadOnlyDictionary<string, int> reach = null)
    {
        _cs = changeset;
        Closed += (_, _) => _gone = true;
        Title = $"Sentinel — Review AI proposal: {_cs.Name}";
        Width = 640; Height = 560; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };

        // Header: what this is, who proposed it, what the referee said.
        var head = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
        head.Children.Add(new TextBlock { Text = _cs.Name, FontSize = 15, FontWeight = FontWeights.Bold });
        head.Children.Add(new TextBlock
        {
            Text = $"Proposed by {ChangesetTrust.SourceLabel(_cs)} · adjudication: {_cs.Adjudication?.Verdict ?? "?"} (spec: {_cs.Adjudication?.IdsSource ?? "?"})",
            Foreground = Brushes.Gray, Margin = new Thickness(0, 2, 0, 0),
        });
        var unattributed = _cs.Adjudication?.Unattributed?.Count ?? 0;
        if (unattributed > 0)
            head.Children.Add(new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(0x5c, 0x45, 0x00)),
                CornerRadius = new CornerRadius(3), Padding = new Thickness(6, 3, 6, 3), Margin = new Thickness(0, 6, 0, 0),
                Child = new TextBlock
                {
                    Text = $"⚠ {unattributed} failure(s) could not be attributed to a specific element — clean rows are NOT certified.",
                    Foreground = Brushes.Khaki, TextWrapping = TextWrapping.Wrap,
                },
            });
        // MA-3a: the web desk's declines, said once above the rows.
        if (ChangesetTrust.DeclinedHeader(_cs) is string declinedLine)
            head.Children.Add(new TextBlock { Text = "⚠ " + declinedLine, Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
        // MA-3b3: what the bridge could not carry from an earlier decline, said once above the rows.
        if (ChangesetTrust.NotCarriedLine(_cs) is string notCarried)
            head.Children.Add(new TextBlock { Text = notCarried, Foreground = Brushes.Khaki, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);

        // The elements sent to a person (Promote's exceptions): shown with their reason, never tickable.
        var held = _cs.Exceptions ?? new List<ExceptionRowDto>();
        if (held.Count > 0)
        {
            var heldList = new StackPanel();
            foreach (var x in held)
            {
                var row = new DockPanel { Margin = new Thickness(0, 2, 0, 2) };
                var box = new CheckBox { IsChecked = false, IsEnabled = false, VerticalAlignment = VerticalAlignment.Center };
                DockPanel.SetDock(box, Dock.Left);
                row.Children.Add(box);
                row.Children.Add(new TextBlock
                {
                    Text = $"{x.Name ?? x.UniqueId} — {x.Reason}", Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(8, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, ToolTip = x.UniqueId,
                });
                heldList.Children.Add(row);
            }
            var exp = new Expander
            {
                Header = $"Sent to a person ({held.Select(x => x.UniqueId).Distinct().Count()} element(s))", IsExpanded = true, Margin = new Thickness(0, 0, 0, 8),
                Content = new ScrollViewer { Content = heldList, MaxHeight = 140, VerticalScrollBarVisibility = ScrollBarVisibility.Auto },
            };
            DockPanel.SetDock(exp, Dock.Top);
            root.Children.Add(exp);
        }

        // Footer: reviewer note + actions. (Top/bottom docked before the fill so the list scrolls.)
        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        foot.Children.Add(_shown);
        foot.Children.Add(new TextBlock { Text = "Reviewer note (recorded with the result; Decline all needs one):", Foreground = Brushes.Gray });
        foot.Children.Add(_note);
        foot.Children.Add(_status);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 8, 0, 0) };
        var all = new Button { Content = "Tick suggested", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var none = new Button { Content = "Untick all", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        // Review C3: a row locked here (a late web decline) is never re-ticked.
        all.Click += (_, _) => { foreach (var r in _rows.Where(x => x.Box.IsEnabled)) r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El); };
        none.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = false; };
        // Re-entrancy guard: Decide disables Apply at once; it comes back only when nothing ran (Refused).
        _go.Click += (_, _) => Decide();
        _retry.Click += (_, _) => { _retry.IsEnabled = false; RetryRequested?.Invoke(); };
        // MA-4f: a survey changeset's scan, drawn as crosses beside the ghosts — off until ticked (each tick reads the scan again on the bridge's
        // one survey slot); a changeset that is a claim has no scan.
        var scan = new CheckBox { Content = "Show the scan", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0),
                                  Visibility = _cs.Claimed == false ? Visibility.Visible : Visibility.Collapsed };
        scan.Checked += (_, _) => ScanRequested?.Invoke(true);
        scan.Unchecked += (_, _) => ScanRequested?.Invoke(false);
        buttons.Children.Add(scan);
        buttons.Children.Add(_retry); buttons.Children.Add(all); buttons.Children.Add(none); buttons.Children.Add(_go);
        foot.Children.Add(buttons);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        // Rows. MA-3b: one group per what the ghosts do, in the order they come (the web desk's groupDesk; the storey is the picker's).
        var list = new StackPanel();
        foreach (var group in (_cs.Elements ?? new List<ChangesetElementDto>()).GroupBy(ChangesetTrust.GroupOf))
        {
            var boxes = new List<CheckBox>();
            var mine = new List<(CheckBox Box, ChangesetElementDto El)>(); // MA-3b2: this group's rows, for its reason
            var groupRows = new StackPanel();
            foreach (var el in group)
            {
                var row = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
                var box = new CheckBox
                {
                    VerticalAlignment = VerticalAlignment.Center,
                    IsChecked = ChangesetTrust.PreTick(_cs, el), // MA-1a item 8, MA-4f: the bridge's pre-tick — a create only when a survey job measured it and the IDS did not reject it
                };
                // MA-3a (design §6.6, D17): a web decline binds — the row opens unticked (PreTick) and cannot be ticked here; a lead re-opens it
                // on the web desk. Apply re-checks the fresh copy (ReviewChangesetsCommand).
                box.IsEnabled = !ChangesetTrust.DeclinedOnWeb(el);
                _rows.Add((box, el));
                boxes.Add(box);
                mine.Add((box, el));
                box.Checked += (_, _) => Counted();
                box.Unchecked += (_, _) => Counted();
                DockPanel.SetDock(box, Dock.Left);
                row.Children.Add(box);

                var badge = MakeBadge(el.Verdict);
                DockPanel.SetDock(badge, Dock.Right);
                row.Children.Add(badge);

                // MA-3b2 (zoom to row): the command selects and zooms to the row's element, or to where a create would be placed. A type
                // edit has no place in the model: its Show is disabled and says so.
                var show = new Button
                {
                    Content = "Show", Padding = new Thickness(6, 0, 6, 0), Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center,
                    ToolTip = "Select and zoom to it in the model — a create: zoom the active view to where it would be placed.",
                };
                if (el.Op == "set_parameter") { show.IsEnabled = false; show.ToolTip = ChangesetTrust.NoPlace; ToolTipService.SetShowOnDisabled(show, true); }
                show.Click += (_, _) => ShowRequested?.Invoke(el);
                DockPanel.SetDock(show, Dock.Right);
                row.Children.Add(show);

                var label = new TextBlock { Margin = new Thickness(8, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var type = el.Place?.TypeName;
                label.Text = el.Op switch
                {
                    "retype" => $"retype {el.Kind}: {name}  ·  {el.Target?.TypeBefore ?? "?"} → {(el.Place?.FamilyName != null ? el.Place.FamilyName + " : " : "")}{type}",
                    "attach" => $"attach: {name}  ·  {el.Place?.BaseLevel} → top {el.Place?.TopLevel}",
                    // MA-2c: a TYPE edit — never pre-ticked. Review amendment C3: its reach is the add-in's own count (Open, API thread),
                    // before the parameter so the ellipsis never trims it; the reason (the tooltip) is the poster's words.
                    "set_parameter" => $"type edit {el.Kind}: {(el.Place?.FamilyName != null ? el.Place.FamilyName + " : " : "")}{type}  ·  " +
                                       (reach != null && el.ProposalGuid != null && reach.TryGetValue(el.ProposalGuid, out var reachN) ? $"reaches {reachN} element(s) in the model now" : "reach not counted — the type is not in this model") +
                                       (ChangesetTrust.RetypedOnto(_cs, el) is int more && more > 0 ? $" + {more} if this {((_cs.Name ?? "").EndsWith(", one Undo)", StringComparison.Ordinal) ? "storey" : "changeset")}'s retypes onto it are applied" : "") + // review C21; MA-2d C11: a storey's window (StoreyBatch.Merge) counts every part
                                       $"  ·  {el.Parameter} \"{el.From}\" → \"{el.To}\"  ·  from {el.ValueSource?.Ref ?? el.ValueSource?.Kind ?? "an unnamed source"}",
                    _ => CreateLabel(el, name),
                };
                if (ChangesetTrust.Accuracy(el) is string accuracy) label.Text += "  ·  " + accuracy; // MA-1a item 8: "not measured"
                if (ChangesetTrust.Typing(el) is string typing) label.Text += "  ·  " + typing; // MA-2a: the bridge typed it from posted facts
                if (!string.IsNullOrWhiteSpace(el.Reason)) label.ToolTip = el.Reason;
                // MA-3a: the web desk's decision leads the row (the ellipsis never trims it) and is the tooltip's first line.
                if (ChangesetTrust.ReviewLine(el) is string reviewLine)
                {
                    label.Text = reviewLine + "  ·  " + label.Text;
                    label.ToolTip = reviewLine + (string.IsNullOrWhiteSpace(el.Reason) ? "" : "\n" + el.Reason);
                    if (!box.IsEnabled) label.Foreground = Brushes.Orange;
                }
                row.Children.Add(label);
                groupRows.Children.Add(row);
            }
            var tick = new Button { Content = "Tick group", Padding = new Thickness(8, 2, 8, 2), Margin = new Thickness(0, 0, 6, 4) };
            var untick = new Button { Content = "Untick group", Padding = new Thickness(8, 2, 8, 2), Margin = new Thickness(0, 0, 0, 4) };
            // A declined row stays unticked (its box is disabled): Tick group ticks only what may be ticked.
            tick.Click += (_, _) => { foreach (var b in boxes.Where(x => x.IsEnabled)) b.IsChecked = true; };
            untick.Click += (_, _) => { foreach (var b in boxes) b.IsChecked = false; };
            var bar = new StackPanel { Orientation = Orientation.Horizontal };
            bar.Children.Add(tick); bar.Children.Add(untick);
            // MA-3b2: one reason for this group's unticked rows — recorded per ghost with the result (result.reasons) and on its ledger row.
            // Review C4: on its own row under the buttons, the box filling it (no fixed width: the bar clips, it does not wrap).
            var why = new TextBox { MaxLength = ChangesetTrust.MaxReason, VerticalContentAlignment = VerticalAlignment.Center,
                                    ToolTip = "Optional, one line: why this group's unticked rows are declined. Recorded for each of them with the result and, when Revit is signed in, carried to the next filing: the next changeset that proposes the same change files the row already declined — not for a row already declined (its reason stands)." };
            var whyLabel = new TextBlock { Text = "Reason for the unticked here:", Foreground = Brushes.Gray, Margin = new Thickness(0, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center };
            var whyRow = new DockPanel { Margin = new Thickness(0, 0, 0, 4) };
            DockPanel.SetDock(whyLabel, Dock.Left);
            whyRow.Children.Add(whyLabel); whyRow.Children.Add(why);
            _groups.Add((group.Key, why, mine));
            var body = new StackPanel();
            body.Children.Add(bar); body.Children.Add(whyRow); body.Children.Add(groupRows);
            var groupBox = new Expander { IsExpanded = true, Content = body, Margin = new Thickness(0, 0, 0, 6) };
            string what = group.Key;
            string declinedHere = ChangesetTrust.DeclinedCount(group); // MA-3b3: "(n carried)" when the bridge carried some
            _headers.Add(() => groupBox.Header = $"{what} ({boxes.Count}) · {boxes.Count(b => b.IsChecked == true)} ticked" + (declinedHere != null ? " · " + declinedHere : ""));
            list.Children.Add(groupBox);
        }
        root.Children.Add(new ScrollViewer { Content = list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
        Counted();
    }

    // MA-3b: each group's header and the main button say what is ticked; nothing ticked is Decline all (it needs a reason: the note).
    private void Counted()
    {
        foreach (var h in _headers) h();
        int n = _rows.Count(r => r.Box.IsChecked == true);
        _go.Content = n == 0 ? "Decline all (needs a reason)" : $"Apply {n} ticked in Revit";
        Ticks(); // MA-3c: the ghost overlay recolours
    }

    /// <summary>A create row (MA-1): kind and name, then family : type, level, and the numbers a reviewer checks. Rows of the
    /// four v1 kinds read exactly as before.</summary>
    private static string CreateLabel(ChangesetElementDto el, string name)
    {
        var p = el.Place;
        var parts = new List<string> { $"{el.Kind}: {name}" };
        if (p?.TypeName != null) parts.Add((p.FamilyName != null ? p.FamilyName + " : " : "") + p.TypeName);
        if (p?.LevelName != null) parts.Add(p.LevelName);
        if (p?.SillHeight is double s) parts.Add($"sill {Mm(s)} mm");
        if (p?.Offset is double o) parts.Add($"offset {Mm(o)} mm");
        if (p?.BaseOffset is double b) parts.Add($"base offset {Mm(b)} mm");
        if (p?.Structural == true) parts.Add("structural");
        if (p?.Mark != null && p.Mark != name) parts.Add("Mark " + p.Mark);
        return string.Join("  ·  ", parts);
    }

    private static string Mm(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);

    // What is ticked when the window opens (and by "Tick suggested") is the bridge's decision since MA-1a item 8:
    // ChangesetTrust.PreTick (Coordination/ChangesetClient.cs). A create is pre-ticked only when a survey job measured it (MA-4f); a person still clicks Apply.

    private static UIElement MakeBadge(ElementVerdictDto v)
    {
        var status = v?.Status ?? "recorded";
        var (text, fg, tip) = status switch
        {
            "accepted" => ("✓ accepted", Brushes.LightGreen, "Passed the project's IDS adjudication."),
            "rejected" => ($"✗ rejected ({v.Failures?.Count ?? 0})", Brushes.IndianRed,
                string.Join("\n", (v.Failures ?? new List<JsonElement>()).Take(10).Select(FailureText))),
            "recorded" => ("— recorded", Brushes.Gray, "No spec to adjudicate against — nothing was certified for this element."),
            // A status outside the contract is a bridge-contract break — say so, don't dress it as recorded.
            _ => ($"? {status}", Brushes.Orange, "Unrecognised verdict status — treat as NOT certified."),
        };
        var tb = new TextBlock { Text = text, Foreground = fg, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
        tb.ToolTip = tip;
        return tb;
    }

    /** A failure as a reviewer reads it: "specification: requirement — reason", not raw JSON. */
    private static string FailureText(JsonElement f)
    {
        try
        {
            string Prop(string name) => f.ValueKind == JsonValueKind.Object && f.TryGetProperty(name, out var p) ? p.ToString() : null;
            var spec = Prop("specification");
            var req = Prop("requirement");
            var reason = Prop("reason");
            var parts = new[] { spec, req }.Where(s => !string.IsNullOrWhiteSpace(s));
            var head = string.Join(": ", parts);
            if (!string.IsNullOrWhiteSpace(reason)) head = string.IsNullOrWhiteSpace(head) ? reason : $"{head} — {reason}";
            return string.IsNullOrWhiteSpace(head) ? f.ToString() : head;
        }
        catch { return f.ToString(); }
    }

    // MA-3b: the window is never closed here — it stays until the person closes it, so a refusal keeps the ticks and the note.
    private void Decide()
    {
        var ticked = _rows.Where(r => r.Box.IsChecked == true).Select(r => r.El.ProposalGuid).ToList();
        var unticked = _rows.Where(r => r.Box.IsChecked != true).Select(r => r.El.ProposalGuid).ToList();
        // Review M2: Decline all without a reason is refused here at once — no bridge call; the command keeps the check as the backstop.
        if (ticked.Count == 0 && ChangesetTrust.Blank(_note.Text)) { Say(ChangesetTrust.DeclineNeedsReason); return; }
        // MA-3b2: each group's reason goes to its unticked rows that may be ticked here (a row the web declined keeps the web's reason). One
        // the bridge would refuse is refused here, before anything is sent — a result refused after Revit placed its elements is not reported.
        var reasons = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var g in _groups)
        {
            var reason = ChangesetTrust.DeclineReason(g.Reason.Text, out var problem);
            if (problem != null) { Say($"The reason for \"{g.What}\" was not taken — {problem}. Nothing was sent."); return; }
            if (reason == null) continue;
            // Review C3 (words are said, never silent): a reason with no row to carry it — none unticked, or every unticked one declined on the web.
            if (!g.Rows.Any(x => x.Box.IsChecked != true && x.Box.IsEnabled && x.El.ProposalGuid != null)) { Say($"The reason for \"{g.What}\" has no unticked row to go with — untick the rows it is for, or clear it. Nothing was sent."); return; }
            foreach (var r in g.Rows.Where(x => x.Box.IsChecked != true && x.Box.IsEnabled && x.El.ProposalGuid != null)) reasons[r.El.ProposalGuid] = reason;
        }
        _go.IsEnabled = false; Reasons(true); // review C2: the reasons are taken here — a box typed in afterwards would look recorded and not be
        Say("Re-checking with the bridge…");
        DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? "", reasons);
    }

    /// <summary>Review C2: the reason boxes are read-only once their reasons were taken (the press), and editable again only when nothing
    /// was applied (Refused, Reopen) — the next press takes them afresh.</summary>
    private void Reasons(bool taken) { foreach (var g in _groups) g.Reason.IsReadOnly = taken; }

    /// <summary>MA-3b: the status line; any thread. Apply stays as it is.</summary>
    public void Say(string words) => Ui(() =>
    {
        // Review C11: closed between the caller's Gone check and now — the words go to the Doctor log, never to a closed window.
        if (_gone) { if (!string.IsNullOrEmpty(words)) App.PanelVm?.LogDoctor("Review AI Proposals: " + words); return; }
        _status.Text = words ?? "";
        _status.Visibility = string.IsNullOrEmpty(words) ? Visibility.Collapsed : Visibility.Visible;
        _status.ScrollToHome();
    });

    /// <summary>MA-3b2b review C13: the same, for words that are a result — closed between the caller's Gone check and now, the caller's
    /// own closed-window path runs (<paramref name="gone"/>, on this dispatcher's thread) instead of the Doctor line alone. Any thread.</summary>
    public void Say(string words, Action gone) => Ui(() => { if (_gone) gone(); else Say(words); });

    /// <summary>MA-3b: nothing ran — said; the ticks and the note are kept and Apply can be pressed again. Any thread.</summary>
    public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; if (!_applied) Reasons(false); });

    /// <summary>MA-3b: the placement (or the decline) was started — Apply never comes back in this window. Any thread.</summary>
    public void Applying(string words) => Ui(() => { _applied = true; Ticks(); _go.IsEnabled = false; Reasons(true); Say(words); });

    /// <summary>Review C3, M3: nothing was placed after all (a "Go back", a refusal inside the placement, a request Revit did not take) —
    /// Apply comes back with the ticks and the note. Any thread.</summary>
    public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Reasons(false); Say(words); Ticks(); }); // MA-3c review: the overlay comes back

    /// <summary>Review C3: rows declined on the web after the window opened — unticked and locked, as the rows declined before it opened. Any thread.</summary>
    public void Lock(IEnumerable<string> guids)
    {
        var set = new HashSet<string>(guids ?? Enumerable.Empty<string>(), StringComparer.Ordinal);
        Ui(() => { foreach (var r in _rows.Where(x => x.El.ProposalGuid != null && set.Contains(x.El.ProposalGuid))) { r.Box.IsChecked = false; r.Box.IsEnabled = false; } Ticks(); });
    }

    /// <summary>MA-3b: whether "Retry report" is offered. Any thread.</summary>
    public void Retry(bool offered) => Ui(() => { _retry.Visibility = offered ? Visibility.Visible : Visibility.Collapsed; _retry.IsEnabled = offered; });

    /// <summary>MA-3b2: what a row's Show did, on its own line above the note (the status line keeps the result). Any thread; nothing
    /// once the window is closed — it is about the view, not a result.</summary>
    public void Shown(string words) => Ui(() =>
    {
        if (_gone) return;
        _shown.Text = words ?? "";
        _shown.Visibility = string.IsNullOrEmpty(words) ? Visibility.Collapsed : Visibility.Visible;
    });

    private void Ui(Action a)
    {
        if (Dispatcher.CheckAccess()) a();
        else Dispatcher.BeginInvoke(a);
    }
}
