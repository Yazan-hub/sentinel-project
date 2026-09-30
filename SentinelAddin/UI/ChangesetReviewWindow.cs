#nullable disable
// Governed AI modeling (A2): the human gate. One row per proposed element with the REFEREE'S
// verdict — pre-ticked only when the IDS accepted it, or (MA-0) when it is a Promote retype/attach: a single-answer
// op (§3.4 step 7) whose ghost carries no property sets, so its IDS verdict certifies nothing (the badge still shows
// it). A human may tick a rejected row (overrule, with the failures on screen — the result records that they did);
// recorded rows say honestly that no spec adjudicated them. The walls the planner sent to a person are listed above
// the rows and cannot be ticked. Modeless, code-only WPF, in GhostReviewWindow's visual family.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

public sealed class ChangesetReviewWindow : Window
{
    public event Action<List<string>, List<string>, string> DecideRequested;

    private readonly List<(CheckBox Box, ChangesetElementDto El)> _rows = new();
    private readonly TextBox _note = new() { MinHeight = 40, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
    private readonly ChangesetDto _cs;

    public ChangesetReviewWindow(ChangesetDto changeset)
    {
        _cs = changeset;
        Title = $"Sentinel — Review AI proposal: {_cs.Name}";
        Width = 640; Height = 560; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };

        // Header: what this is, who proposed it, what the referee said.
        var head = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
        head.Children.Add(new TextBlock { Text = _cs.Name, FontSize = 15, FontWeight = FontWeights.Bold });
        head.Children.Add(new TextBlock
        {
            Text = $"Proposed by {_cs.Source} · adjudication: {_cs.Adjudication?.Verdict ?? "?"} (spec: {_cs.Adjudication?.IdsSource ?? "?"})",
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
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);

        // The walls sent to a person (Promote's exceptions): shown with their reason, never tickable.
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
                Header = $"Sent to a person ({held.Count})", IsExpanded = true, Margin = new Thickness(0, 0, 0, 8),
                Content = new ScrollViewer { Content = heldList, MaxHeight = 140, VerticalScrollBarVisibility = ScrollBarVisibility.Auto },
            };
            DockPanel.SetDock(exp, Dock.Top);
            root.Children.Add(exp);
        }

        // Footer: reviewer note + actions. (Top/bottom docked before the fill so the list scrolls.)
        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        foot.Children.Add(new TextBlock { Text = "Reviewer note (recorded with the result):", Foreground = Brushes.Gray });
        foot.Children.Add(_note);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 8, 0, 0) };
        var all = new Button { Content = "Tick suggested", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var none = new Button { Content = "Untick all", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var go = new Button { Content = "Apply ticked in Revit", Padding = new Thickness(12, 4, 12, 4), FontWeight = FontWeights.Bold };
        all.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = PreTick(_cs, r.El); };
        none.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = false; };
        // Re-entrancy guard (GhostReviewWindow convention): if a DecideRequested subscriber throws,
        // Close() is skipped — the button must not allow a second fire with the same snapshot.
        go.Click += (_, _) => { go.IsEnabled = false; Decide(); };
        buttons.Children.Add(all); buttons.Children.Add(none); buttons.Children.Add(go);
        foot.Children.Add(buttons);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        // Rows.
        var list = new StackPanel();
        foreach (var el in _cs.Elements ?? new List<ChangesetElementDto>())
        {
            var row = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
            var box = new CheckBox
            {
                VerticalAlignment = VerticalAlignment.Center,
                IsChecked = PreTick(_cs, el), // the referee's verdict, or a Promote single-answer op
            };
            _rows.Add((box, el));
            DockPanel.SetDock(box, Dock.Left);
            row.Children.Add(box);

            var badge = MakeBadge(el.Verdict);
            DockPanel.SetDock(badge, Dock.Right);
            row.Children.Add(badge);

            var label = new TextBlock { Margin = new Thickness(8, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
            var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
            var type = el.Place?.TypeName; var lvl = el.Place?.LevelName;
            label.Text = el.Op switch
            {
                "retype" => $"retype: {name}  ·  {el.Target?.TypeBefore ?? "?"} → {type}",
                "attach" => $"attach: {name}  ·  {el.Place?.BaseLevel} → top {el.Place?.TopLevel}",
                _ => $"{el.Kind}: {name}" + (type != null ? $"  ·  {type}" : "") + (lvl != null ? $"  ·  {lvl}" : ""),
            };
            if (!string.IsNullOrWhiteSpace(el.Reason)) label.ToolTip = el.Reason;
            row.Children.Add(label);
            list.Children.Add(row);
        }
        root.Children.Add(new ScrollViewer { Content = list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
    }

    /// <summary>What is ticked when the window opens (and by "Tick suggested"): what the IDS accepted, and a Promote
    /// retype/attach. MA-1 moves this decision to the bridge (§6.3); a person still clicks Apply either way.</summary>
    private static bool PreTick(ChangesetDto cs, ChangesetElementDto el) =>
        el.Verdict?.Status == "accepted" || (cs.Source == "promote" && el.Op is "retype" or "attach");

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

    private void Decide()
    {
        var ticked = _rows.Where(r => r.Box.IsChecked == true).Select(r => r.El.ProposalGuid).ToList();
        var unticked = _rows.Where(r => r.Box.IsChecked != true).Select(r => r.El.ProposalGuid).ToList();
        DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? "");
        Close();
    }
}
