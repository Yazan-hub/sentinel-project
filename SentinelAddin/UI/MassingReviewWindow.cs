using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.GhostBuilder;

namespace Sentinel.UI;

/// <summary>
/// Review + CORRECT a photo massing estimate before it's filed. The Geopogo demo places geometry straight
/// from the photo; this shows the estimate as EDITABLE NUMBERS with the low-confidence ones flagged, so the
/// "where the camera can't see" gap is a field a human fills, not a silent guess. On File for review it emits a
/// user-corrected estimate — everything the reviewer touched is stamped source="user", confidence 1. MA-6-6: the command
/// files it as one changeset (the missing levels and a mass); nothing is placed until a person applies it.
///
/// MA-6-9 (C14): the photos give counts and a ratio, not lengths. The rows show each mark (observed / given / inferred / assumed) and the
/// spread across the photos; a person gives ONE known dimension (the height or a façade's width), Scale ▶ works the lengths out, and File
/// for review is refused until one is given.
///
/// Mirrors GhostReviewWindow / StandardsReviewWindow: plain code, no XAML pair.
/// </summary>
public sealed class MassingReviewWindow : Window
{
    private readonly MassingEstimate _estimate;
    private readonly Dictionary<EstimatedValue, TextBox> _fields = new();
    private readonly Dictionary<EstimatedValue, TextBlock> _hints = new();
    private TextBox _knownH = null!, _knownW = null!; // MA-6-9: the known dimension, in metres
    private readonly TextBlock _status;
    private readonly Button _build; // MAS-4: disabled by the click that files; Reopen enables it again

    /// <summary>Fires with the reviewer-corrected estimate — file exactly this (MA-6-6).</summary>
    public event Action<MassingEstimate>? BuildRequested;

    public MassingReviewWindow(MassingEstimate estimate)
    {
        _estimate = estimate;
        Title = "Sentinel — Massing: review the estimate before filing";
        Width = 640; Height = 720;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var panel = new StackPanel { Margin = new Thickness(14) };
        panel.Children.Add(new TextBlock
        {
            Text = "This is an ESTIMATE from the project images, not a measured drawing. Confirm or correct " +
                   "each number — amber fields are low-confidence or from a façade the photos didn't show. " +
                   "Nothing is filed until you press File for review; nothing is placed until a person applies it in Review AI Proposals.",
            TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 0, 10),
        });

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(180) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        int row = 0;
        AddRow(grid, ref row, "Storeys", estimate.Storeys);
        if (estimate.HeightToWidth != null) AddRow(grid, ref row, "Height : width", estimate.HeightToWidth);
        _knownH = AddKnown(grid, ref row, "Known height (m)", estimate.KnownField == "height" ? estimate.KnownMm : (double?)null);
        _knownW = AddKnown(grid, ref row, "Known width (m)", estimate.KnownField == "width" ? estimate.KnownMm : (double?)null);
        AddRow(grid, ref row, "Storey height (mm)", estimate.StoreyHeightMm);
        AddRow(grid, ref row, "Footprint width (mm)", estimate.FootprintWidthMm);
        AddRow(grid, ref row, "Footprint depth (mm)", estimate.FootprintDepthMm);
        for (int i = 0; i < estimate.Openings.Count; i++)
        {
            var o = estimate.Openings[i];
            AddRow(grid, ref row, $"Opening {i + 1} — {o.Kind} ({o.Facade}) width (mm)", o.WidthMm);
            AddRow(grid, ref row, $"Opening {i + 1} — {o.Kind} ({o.Facade}) height (mm)", o.HeightMm);
        }
        panel.Children.Add(grid);

        var scale = new Button { Content = "Scale ▶", Padding = new Thickness(12, 4, 12, 4), Margin = new Thickness(0, 6, 0, 0), HorizontalAlignment = HorizontalAlignment.Left };
        scale.Click += (_, __) => ScaleNow();
        panel.Children.Add(scale);
        panel.Children.Add(new TextBlock
        {
            Text = "The photos give counts and ratios, not lengths. Type ONE known dimension — the building's height or a façade's width, in metres — " +
                   "and press Scale ▶: the storey height and the width are then worked out (inferred), the depth is only assumed. " +
                   "A model's storey count can be wrong the same way on every photo — compare it with the photos.",
            TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray, FontSize = 11, Margin = new Thickness(0, 6, 0, 0),
        });

        int needReview = MassingPlanner.FieldsNeedingReview(estimate).Count;
        _status = new TextBlock
        {
            Text = needReview == 0
                ? "Every field came back confident — for a photo that's unusual; sanity-check the numbers anyway."
                : $"{needReview} field(s) need your confirmation (amber). Correct them, then File for review.",
            Margin = new Thickness(0, 10, 0, 8), TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray,
        };
        panel.Children.Add(_status);

        if (!string.IsNullOrWhiteSpace(estimate.Notes))
            panel.Children.Add(new TextBlock
            {
                Text = "Vision notes: " + estimate.Notes, TextWrapping = TextWrapping.Wrap,
                FontStyle = FontStyles.Italic, Foreground = Brushes.Gray, Margin = new Thickness(0, 0, 0, 8),
            });

        _build = new Button { Content = "File for review ▶", Padding = new Thickness(12, 6, 12, 6), Margin = new Thickness(0, 6, 8, 0) };
        _build.Click += (_, __) => Emit();
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(12, 6, 12, 6), Margin = new Thickness(0, 6, 0, 0), IsCancel = true };
        cancel.Click += (_, __) => Close(); // shown modeless (Commands.Massing): IsCancel alone closes only a dialog
        var buttons = new StackPanel { Orientation = Orientation.Horizontal };
        buttons.Children.Add(_build); buttons.Children.Add(cancel);
        panel.Children.Add(buttons);

        Content = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    }

    private void AddRow(Grid grid, ref int row, string label, EstimatedValue v)
    {
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        bool needsReview = v.Source != "photo" || v.Confidence <= MassingPlanner.AssumedBelow;

        var lbl = new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 3, 6, 3) };
        Grid.SetRow(lbl, row); Grid.SetColumn(lbl, 0); grid.Children.Add(lbl);

        var box = new TextBox
        {
            Margin = new Thickness(0, 3, 6, 3),
        };
        Grid.SetRow(box, row); Grid.SetColumn(box, 1); grid.Children.Add(box);
        _fields[v] = box;

        var hint = new TextBlock { VerticalAlignment = VerticalAlignment.Center, FontSize = 11, TextWrapping = TextWrapping.Wrap, MaxWidth = 300 };
        Grid.SetRow(hint, row); Grid.SetColumn(hint, 2); grid.Children.Add(hint);
        _hints[v] = hint;
        Show(v);
        row++;
    }

    // A row's box, colour and hint from its value: the mark, the spread across the photos, the note (MA-6-9).
    private void Show(EstimatedValue v)
    {
        bool needsReview = v.Source != "photo" || v.Confidence <= MassingPlanner.AssumedBelow;
        _fields[v].Text = double.IsNaN(v.Value) ? "" : v.Value.ToString("0.###", CultureInfo.InvariantCulture); // 3 places: Emit's 0.001 change check never sees a rounding
        _fields[v].Background = needsReview ? new SolidColorBrush(Color.FromRgb(255, 244, 214)) : Brushes.White;
        _hints[v].Text = MassingPlanner.Hint(v) + (needsReview ? "" : $" · {v.Confidence:0.0} confident");
        _hints[v].Foreground = needsReview ? new SolidColorBrush(Color.FromRgb(180, 120, 20)) : Brushes.Gray;
    }

    private TextBox AddKnown(Grid grid, ref int row, string label, double? mm)
    {
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var lbl = new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 3, 6, 3) };
        Grid.SetRow(lbl, row); Grid.SetColumn(lbl, 0); grid.Children.Add(lbl);
        var box = new TextBox { Text = mm is double x ? (x / 1000).ToString("0.###", CultureInfo.InvariantCulture) : "", Margin = new Thickness(0, 3, 6, 3) };
        Grid.SetRow(box, row); Grid.SetColumn(box, 1); grid.Children.Add(box);
        var hint = new TextBlock { Text = "given — type one of the two", Foreground = Brushes.Gray, VerticalAlignment = VerticalAlignment.Center, FontSize = 11 };
        Grid.SetRow(hint, row); Grid.SetColumn(hint, 2); grid.Children.Add(hint);
        row++;
        return box;
    }

    private static double? Metres(string text) =>
        double.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out double m) && m > 0 ? m * 1000 : (double?)null;

    /// <summary>Scale ▶: the one known dimension in the boxes turns the photos' counts and ratio into lengths (MassingPlanner.Scale); the
    /// boxes and the values are rewritten together, so Emit's change check does not take them for the reviewer's own numbers.</summary>
    public void ScaleNow()
    {
        ReadBoxes(); // a number the reviewer typed first is theirs and is what Scale works from
        string why = MassingPlanner.Scale(_estimate, Metres(_knownH.Text), Metres(_knownW.Text));
        if (why != null) { _status.Text = "Scale: " + why; return; }
        foreach (var v in _fields.Keys) Show(v);
        _status.Text = MassingPlanner.ScaleRefusal(_estimate)
                       ?? $"Scaled from the {MassingPlanner.KnownWords(_estimate)}. The inferred numbers are amber — check them, then File for review.";
    }

    /// <summary>Read the (possibly edited) boxes back into the estimate. A field the reviewer changed is
    /// now authoritative — source="user", confidence 1 — which is what makes a photo build trustworthy.</summary>
    public void Emit()
    {
        // MAS-4: one filing per click. A second click — the other half of a double-click, or one while the bridge is still
        // answering — finds the button disabled and does nothing. The command closes this window once the changeset is filed
        // (MA-6-6), or calls Reopen when nothing was filed.
        if (!_build.IsEnabled) return;
        _build.IsEnabled = false;
        _status.Text = "Filing the massing for review…";
        ReadBoxes();
        // MA-6-9: a building the photos gave no length for cannot be filed; and an inferred number out of range is said, never clamped.
        if (_estimate.KnownField == null) { Reopen(MassingPlanner.NeedsKnown); return; }
        if (MassingPlanner.ScaleRefusal(_estimate) is { } tooFar) { Reopen(tooFar); return; }
        // Re-validate so any still-out-of-range hand-entry is caught, then hand off.
        // Review amendment C12: a subscriber that throws (the request to file) never reaches the command's own reopen — the
        // review is reopened here, with the reason, before the exception goes on as it did before.
        try { BuildRequested?.Invoke(MassingPlanner.Validate(_estimate)); }
        catch (Exception ex)
        {
            Reopen(MassingPlanner.NotStarted(ex.Message));
            throw;
        }
    }

    // Read the (possibly edited) boxes back: a number the reviewer changed is theirs.
    private void ReadBoxes()
    {
        foreach (var kv in _fields)
        {
            if (double.TryParse(kv.Value.Text, NumberStyles.Any, CultureInfo.InvariantCulture, out double val))
            {
                bool changed = Math.Abs(val - kv.Key.Value) > 0.001 || double.IsNaN(kv.Key.Value);
                kv.Key.Value = val;
                if (changed) { kv.Key.Source = "user"; kv.Key.Confidence = 1.0; kv.Key.Note = "confirmed by the reviewer"; kv.Key.Lo = kv.Key.Hi = null; kv.Key.Views = kv.Key.Of = 0; }
            }
        }
    }

    /// <summary>MAS-4: the filing ended with nothing filed (refused, or the bridge did not take it) — File for review works again,
    /// the numbers as the reviewer left them, and the status line says why.</summary>
    public void Reopen(string status)
    {
        _build.IsEnabled = true;
        _status.Text = status;
    }

    /// <summary>Whether a click on File for review would file (the offline check reads it).</summary>
    public bool CanBuild => _build.IsEnabled;
    /// <summary>The status line under the numbers (the offline check reads it).</summary>
    public string StatusText => _status.Text;
}
