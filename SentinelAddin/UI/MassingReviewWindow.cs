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
/// Review + CORRECT a photo massing estimate before it's built. The Geopogo demo places geometry straight
/// from the photo; this shows the estimate as EDITABLE NUMBERS with the low-confidence ones flagged, so the
/// "where the camera can't see" gap is a field a human fills, not a silent guess. On Build it emits a
/// user-corrected estimate — everything the reviewer touched is stamped source="user", confidence 1.
///
/// Mirrors GhostReviewWindow / StandardsReviewWindow: plain code, no XAML pair.
/// </summary>
public sealed class MassingReviewWindow : Window
{
    private readonly MassingEstimate _estimate;
    private readonly Dictionary<EstimatedValue, TextBox> _fields = new();
    private readonly TextBlock _status;
    private readonly Button _build; // MAS-4: disabled by the click that builds; Reopen enables it again

    /// <summary>Fires with the reviewer-corrected estimate — build exactly this.</summary>
    public event Action<MassingEstimate>? BuildRequested;

    public MassingReviewWindow(MassingEstimate estimate)
    {
        _estimate = estimate;
        Title = "Sentinel — Massing: review the estimate before building";
        Width = 560; Height = 620;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var panel = new StackPanel { Margin = new Thickness(14) };
        panel.Children.Add(new TextBlock
        {
            Text = "This is an ESTIMATE from the project images, not a measured drawing. Confirm or correct " +
                   "each number — amber fields are low-confidence or from a façade the photos didn't show. " +
                   "Nothing is built until you press Build.",
            TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 0, 10),
        });

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(180) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        int row = 0;
        AddRow(grid, ref row, "Footprint width (mm)", estimate.FootprintWidthMm);
        AddRow(grid, ref row, "Footprint depth (mm)", estimate.FootprintDepthMm);
        AddRow(grid, ref row, "Storeys", estimate.Storeys);
        AddRow(grid, ref row, "Storey height (mm)", estimate.StoreyHeightMm);
        for (int i = 0; i < estimate.Openings.Count; i++)
        {
            var o = estimate.Openings[i];
            AddRow(grid, ref row, $"Opening {i + 1} — {o.Kind} ({o.Facade}) width (mm)", o.WidthMm);
            AddRow(grid, ref row, $"Opening {i + 1} — {o.Kind} ({o.Facade}) height (mm)", o.HeightMm);
        }
        panel.Children.Add(grid);

        int needReview = MassingPlanner.FieldsNeedingReview(estimate).Count;
        _status = new TextBlock
        {
            Text = needReview == 0
                ? "Every field came back confident — for a photo that's unusual; sanity-check the numbers anyway."
                : $"{needReview} field(s) need your confirmation (amber). Correct them, then Build.",
            Margin = new Thickness(0, 10, 0, 8), TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Gray,
        };
        panel.Children.Add(_status);

        if (!string.IsNullOrWhiteSpace(estimate.Notes))
            panel.Children.Add(new TextBlock
            {
                Text = "Vision notes: " + estimate.Notes, TextWrapping = TextWrapping.Wrap,
                FontStyle = FontStyles.Italic, Foreground = Brushes.Gray, Margin = new Thickness(0, 0, 0, 8),
            });

        _build = new Button { Content = "Build massing ▶", Padding = new Thickness(12, 6, 12, 6), Margin = new Thickness(0, 6, 8, 0) };
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
            Text = v.Value.ToString("0.#", CultureInfo.InvariantCulture),
            Margin = new Thickness(0, 3, 6, 3),
            Background = needsReview ? new SolidColorBrush(Color.FromRgb(255, 244, 214)) : Brushes.White,
        };
        Grid.SetRow(box, row); Grid.SetColumn(box, 1); grid.Children.Add(box);
        _fields[v] = box;

        var hint = new TextBlock
        {
            Text = needsReview ? (v.Note ?? "confirm this") : $"{v.Confidence:0.0} confident",
            Foreground = needsReview ? new SolidColorBrush(Color.FromRgb(180, 120, 20)) : Brushes.Gray,
            VerticalAlignment = VerticalAlignment.Center, FontSize = 11,
        };
        Grid.SetRow(hint, row); Grid.SetColumn(hint, 2); grid.Children.Add(hint);
        row++;
    }

    /// <summary>Read the (possibly edited) boxes back into the estimate. A field the reviewer changed is
    /// now authoritative — source="user", confidence 1 — which is what makes a photo build trustworthy.</summary>
    public void Emit()
    {
        // MAS-4: one build per click. A second click — the other half of a double-click, or one while Revit is still
        // placing — finds Build disabled and does nothing. The command closes this window when the build is kept, or
        // calls Reopen when nothing was built.
        if (!_build.IsEnabled) return;
        _build.IsEnabled = false;
        _status.Text = "Building the massing…";
        foreach (var kv in _fields)
        {
            if (double.TryParse(kv.Value.Text, NumberStyles.Any, CultureInfo.InvariantCulture, out double val))
            {
                bool changed = Math.Abs(val - kv.Key.Value) > 0.001;
                kv.Key.Value = val;
                if (changed) { kv.Key.Source = "user"; kv.Key.Confidence = 1.0; kv.Key.Note = "confirmed by the reviewer"; }
            }
        }
        // Re-validate so any still-out-of-range hand-entry is caught, then hand off.
        // Review amendment C12: a subscriber that throws (the plan, the build inputs) never reaches the command's Completed
        // handler — the review is reopened here, with the reason, before the exception goes on as it did before.
        try { BuildRequested?.Invoke(MassingPlanner.Validate(_estimate)); }
        catch (Exception ex)
        {
            Reopen(MassingPlanner.NotStarted(ex.Message));
            throw;
        }
    }

    /// <summary>MAS-4: the build ended with nothing kept (refused, rolled back, or nothing placed) — Build works again, the
    /// numbers as the reviewer left them, and the status line says why.</summary>
    public void Reopen(string status)
    {
        _build.IsEnabled = true;
        _status.Text = status;
    }

    /// <summary>Whether a click on Build would build (the offline check reads it).</summary>
    public bool CanBuild => _build.IsEnabled;
    /// <summary>The status line under the numbers (the offline check reads it).</summary>
    public string StatusText => _status.Text;
}
