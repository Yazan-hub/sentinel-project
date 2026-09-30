using System;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Autodesk.Revit.DB.Events;
using Sentinel.Engine;

namespace Sentinel.UI;

/// <summary>
/// GP-1: Governed Publish's progress window, on its OWN STA thread — Revit's UI thread is busy inside Document.Export,
/// so a window it owned would neither repaint nor take a click. It shows the step (export, gate, referee, register),
/// Revit's own progress (<see cref="OnRevitProgress"/>, subscribed to Application.ProgressChanged during the export)
/// and a Cancel that is measured, not promised: the window says whether Revit gave it a progress update to cancel
/// through (<see cref="PublishLines.CancelNote"/>). Every member is safe from any thread. It never owns a Revit window
/// (a cross-thread owner would tie it to the busy thread), stays on top in the work area's corner, and a window that
/// cannot open leaves the publish running without one — it never throws into Revit.
/// </summary>
public sealed class PublishProgress
{
    private readonly CancellationTokenSource _cts = new();
    private Window? _win;
    private TextBlock? _step, _detail, _note;
    private ProgressBar? _bar;
    private int _stepNo, _updates, _lastTick, _closed;
    private volatile bool _cancelSent;

    /// <summary>Cancelled by the Cancel button or the window's X.</summary>
    public CancellationToken Token => _cts.Token;
    /// <summary>How many Application.ProgressChanged updates Revit raised while subscribed (the measurement).</summary>
    public int RevitUpdates => Volatile.Read(ref _updates);
    /// <summary>Whether Cancel reached Revit: ProgressChangedEventArgs.Cancel() was called on an update after Cancel.</summary>
    public bool CancelSent => _cancelSent;

    /// <summary>Open the window on a new STA thread and return once it is shown (≤ 5 s).</summary>
    public static PublishProgress Show(string title)
    {
        var p = new PublishProgress();
        var ready = new ManualResetEventSlim(); // not disposed: a thread that starts late still Sets it
        var t = new Thread(() =>
        {
            try
            {
                Dispatcher.CurrentDispatcher.UnhandledException += (_, e) => e.Handled = true; // never crash Revit
                p.Build(title);
                p._win!.Show();
            }
            catch { p._win = null; }
            finally { ready.Set(); }
            if (p._win is null) return;
            try { Dispatcher.Run(); } catch { /* the window is gone; the publish goes on */ }
        }) { IsBackground = true, Name = "Sentinel publish progress" };
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        ready.Wait(TimeSpan.FromSeconds(5));
        return p;
    }

    /// <summary>"Step 2 of 4 · Delivery gate — …"; clears Revit's progress line.</summary>
    public void Step(int n, string text)
    {
        Volatile.Write(ref _stepNo, n);
        Post(() =>
        {
            _step!.Text = "Step " + n + " of 4 · " + text;
            _detail!.Text = "";
            _bar!.IsIndeterminate = true;
        });
    }

    /// <summary>Application.ProgressChanged, on Revit's UI thread during the export: counts the update, passes a
    /// pending Cancel to Revit once, and shows the caption (at most every 100 ms). Reads <paramref name="e"/> here only.</summary>
    public void OnRevitProgress(object? sender, ProgressChangedEventArgs e)
    {
        Interlocked.Increment(ref _updates);
        if (_cts.IsCancellationRequested && !_cancelSent)
        {
            try { e.Cancel(); _cancelSent = true; }
            catch { /* this update cannot be cancelled; the next one is tried */ }
        }
        int now = Environment.TickCount; // wraps negative after 24.9 days: compare the difference unsigned
        if ((uint)unchecked(now - Volatile.Read(ref _lastTick)) < 100u) return;
        Volatile.Write(ref _lastTick, now);
        string caption = e.Caption ?? "";
        int lo = e.LowerRange, hi = e.UpperRange, pos = e.Position;
        Post(() =>
        {
            _detail!.Text = "Revit: " + caption + (hi > lo ? " — " + (pos - lo) + " / " + (hi - lo) : "");
            _bar!.IsIndeterminate = hi <= lo;
            if (hi > lo) { _bar.Minimum = lo; _bar.Maximum = hi; _bar.Value = Math.Max(lo, Math.Min(hi, pos)); }
        });
    }

    /// <summary>Close the window (idempotent) and end its thread.</summary>
    public void Close()
    {
        if (Interlocked.Exchange(ref _closed, 1) == 1) return;
        Post(() => _win!.Close());
    }

    private void Post(Action a)
    {
        var w = _win;
        if (w is null) return;
        try { w.Dispatcher.BeginInvoke(a); } catch { /* shut down */ }
    }

    private void RequestCancel()
    {
        if (_cts.IsCancellationRequested) return;
        _cts.Cancel();
        _note!.Text = PublishLines.CancelNote(Volatile.Read(ref _stepNo), RevitUpdates);
    }

    private void Build(string title)
    {
        _step = new TextBlock { Text = "Starting…", TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 6) };
        _detail = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 6) };
        _bar = new ProgressBar { IsIndeterminate = true, Height = 16, Margin = new Thickness(0, 0, 0, 8) };
        _note = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8) };
        var cancel = new Button { Content = "Cancel", Width = 90, HorizontalAlignment = HorizontalAlignment.Right };
        cancel.Click += (_, __) => RequestCancel();
        var root = new StackPanel { Margin = new Thickness(14) };
        root.Children.Add(_step);
        root.Children.Add(_detail);
        root.Children.Add(_bar);
        root.Children.Add(_note);
        root.Children.Add(cancel);
        var w = new Window
        {
            Title = title,
            Width = 440,
            SizeToContent = SizeToContent.Height,
            ResizeMode = ResizeMode.NoResize,
            WindowStartupLocation = WindowStartupLocation.Manual,
            ShowInTaskbar = false,
            Topmost = true,           // Revit takes the front while the referee judges; the window stays in sight
            Content = root,
        };
        var wa = SystemParameters.WorkArea;
        w.Left = wa.Right - w.Width - 24;
        w.Top = wa.Bottom - 220;
        w.Loaded += (_, __) => w.Top = wa.Bottom - w.ActualHeight - 24;
        // The X is Cancel while the publish runs; only Close() closes it.
        w.Closing += (_, e) => { if (Volatile.Read(ref _closed) == 0) { e.Cancel = true; RequestCancel(); } };
        w.Closed += (_, __) => Dispatcher.CurrentDispatcher.BeginInvokeShutdown(DispatcherPriority.Background);
        _win = w;
    }
}
