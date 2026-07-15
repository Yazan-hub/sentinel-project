using System;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace Sentinel.UI;

/// <summary>
/// Modeless progress window for the Ghost Builder. Owns the CancellationTokenSource: closing the
/// window, clicking Cancel, or pressing ESC cancels the background LLM call. Built entirely in code
/// (no XAML pair) to keep it a single self-contained file.
///
/// Thread note: created and shown on the Revit UI thread. The background task updates it via
/// <see cref="SetStatus"/>, which marshals onto this window's dispatcher — never touch its controls
/// directly from Task.Run.
/// </summary>
public sealed class GhostBuilderProgressWindow : Window
{
    private readonly CancellationTokenSource _cts = new();
    private readonly TextBlock _status;

    /// <summary>Token the background LLM call observes. Cancelled on ESC / Cancel / close.</summary>
    public CancellationToken Token => _cts.Token;

    public GhostBuilderProgressWindow()
    {
        Title = "Sentinel — Ghost Builder";
        Width = 380;
        SizeToContent = SizeToContent.Height;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;

        _status = new TextBlock
        {
            Text = "Starting…",
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 12),
        };

        var bar = new ProgressBar { IsIndeterminate = true, Height = 18, Margin = new Thickness(0, 0, 0, 12) };

        var cancel = new Button
        {
            Content = "Cancel",
            Width = 90,
            HorizontalAlignment = HorizontalAlignment.Right,
            IsCancel = true, // ESC triggers this button
        };
        cancel.Click += (_, __) => Cancel();

        var root = new StackPanel { Margin = new Thickness(16) };
        root.Children.Add(_status);
        root.Children.Add(bar);
        root.Children.Add(cancel);
        Content = root;

        // ESC anywhere in the window cancels (IsCancel covers focus-on-button; this covers the rest).
        PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) Cancel(); };

        // Closing the window (X) must also cancel the background work.
        Closed += (_, __) => _cts.Cancel();
    }

    /// <summary>Update the status line from any thread.</summary>
    public void SetStatus(string text) =>
        Dispatcher.Invoke(() => _status.Text = text);

    private void Cancel()
    {
        _cts.Cancel();
        _status.Text = "Cancelling…";
    }
}
