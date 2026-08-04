using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.UI;
using Microsoft.Win32;

namespace Sentinel.Commands;

/// <summary>
/// Upgrade Files: batch-upgrade a folder of .rvt/.rfa to a target installed Revit version via the
/// per-version Sentinel queue runner (Task 3). This command only writes the queue, launches the
/// target Revit, and polls for results — it never opens a document itself (opening a newer-format
/// file in this session's older Revit would fail outright).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class UpgradeFilesCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var installed = InstalledRevits();
        if (installed.Count == 0)
        {
            TaskDialog.Show("Sentinel — Upgrade Files", "No installed Revit versions were found under Program Files\\Autodesk.");
            return Result.Cancelled;
        }

        string? folder = PickFolder(c);
        if (folder == null) return Result.Cancelled;

        var files = Directory.EnumerateFiles(folder, "*.rvt")
            .Concat(Directory.EnumerateFiles(folder, "*.rfa"))
            .OrderBy(f => f).ToList();
        if (files.Count == 0)
        {
            TaskDialog.Show("Sentinel — Upgrade Files", "No .rvt or .rfa files found in that folder.");
            return Result.Cancelled;
        }

        var rows = files.Select(f =>
        {
            var info = RvtFileInfo.Read(f);
            return (path: f, version: info.SavedVersion, flavor: info.Flavor);
        }).ToList();

        string currentVersion = c.Application.Application.VersionNumber;
        var win = new UpgradeWindow(rows, installed, currentVersion);
        DialogOwner.Attach(win, c);
        if (win.ShowDialog() != true || win.TargetVersion == null || win.TickedPaths.Count == 0)
            return Result.Cancelled;

        string target = win.TargetVersion;
        var queue = new UpgradeQueue
        {
            Target = target,
            CreatedAt = DateTimeOffset.Now,
            Jobs = win.TickedPaths.Select(p => new UpgradeJob
            {
                Src = p,
                Dest = Path.Combine(Path.GetDirectoryName(p)!, "upgraded-" + target, Path.GetFileName(p)),
            }).ToList(),
        };

        // A stale results file from a previous run must never be read as this run's outcome.
        if (File.Exists(UpgradeQueueStore.ResultsPath)) File.Delete(UpgradeQueueStore.ResultsPath);
        UpgradeQueueStore.SaveQueue(queue);

        try
        {
            Process.Start(RevitExe(target));
        }
        catch (Exception ex)
        {
            TaskDialog.Show("Sentinel — Upgrade Files", $"Could not launch Revit {target}:\n{ex.Message}");
            return Result.Failed;
        }

        var progress = new UpgradeProgressWindow(queue.Jobs.Count);
        DialogOwner.Attach(progress, c);
        progress.PollAndShow();

        return Result.Succeeded;
    }

    private static string? PickFolder(ExternalCommandData c)
    {
#if NET48
        // net48 WPF has no folder dialog (mirrors SettingsDialog.xaml.cs OnBrowseGhostFolder) —
        // the classic OpenFileDialog trick: pick any file in the target folder, take its directory.
        var dlg = new OpenFileDialog
        {
            Title = "Select the folder of .rvt/.rfa files to upgrade (pick any file inside it)",
            CheckFileExists = false,
            FileName = "Select this folder",
        };
        if (DialogOwner.ShowFileDialog(dlg, c.Application) != true) return null;
        return Path.GetDirectoryName(dlg.FileName);
#else
        var dlg = new OpenFolderDialog { Title = "Select the folder of .rvt/.rfa files to upgrade" };
        return DialogOwner.ShowFileDialog(dlg, c.Application) == true ? dlg.FolderName : null;
#endif
    }

    // ponytail: path probe instead of registry - same truth, no registry plumbing. The loop's
    // 2030 ceiling is deliberate headroom.
    private static List<string> InstalledRevits()
    {
        var found = new List<string>();
        for (var v = 2021; v <= 2030; v++)
            if (File.Exists(RevitExe(v.ToString()))) found.Add(v.ToString());
        return found;
    }

    private static string RevitExe(string version) =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Autodesk", "Revit " + version, "Revit.exe");
}

/// <summary>
/// Modal, DialogOwner-attached progress window for the launched-Revit queue runner. Polls
/// upgrade-results.json every 2s (DispatcherTimer — no background thread needed, Revit API isn't
/// touched at all here) for up to 10 minutes, then shows the final per-job report.
/// </summary>
internal sealed class UpgradeProgressWindow : Window
{
    private readonly int _total;
    private readonly TextBlock _status;
    private readonly DispatcherTimer _timer;
    private readonly DateTime _startedAt = DateTime.Now;
    private static readonly TimeSpan Timeout = TimeSpan.FromMinutes(10);
    private bool _cancelled;

    public UpgradeProgressWindow(int total)
    {
        _total = total;
        Title = "Sentinel — Upgrading Files";
        Width = 420; Height = 160; MinWidth = 320;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;
        ResizeMode = ResizeMode.NoResize;

        _status = new TextBlock { Text = $"0 of {_total} done…", TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12) };
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(10, 5, 10, 5), HorizontalAlignment = HorizontalAlignment.Right };
        cancel.Click += (_, __) => { _cancelled = true; DialogResult = false; Close(); };

        var root = new DockPanel { Margin = new Thickness(12) };
        DockPanel.SetDock(cancel, Dock.Bottom);
        root.Children.Add(cancel);
        root.Children.Add(_status);
        Content = root;

        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _timer.Tick += (_, __) => Poll();
    }

    /// <summary>Blocks (modally) until the batch completes, times out, or is cancelled, then shows
    /// the final report as a TaskDialog.</summary>
    public void PollAndShow()
    {
        _timer.Start();
        ShowDialog();
        _timer.Stop();

        if (_cancelled)
        {
            TaskDialog.Show("Sentinel — Upgrade Files", "Cancelled — the target Revit's queue runner keeps working; re-open this dialog is not needed, check the upgraded-<version> folder later.");
            return;
        }

        var result = UpgradeQueueStore.LoadResults();
        if (result is { done: true })
        {
            ShowReport(result.Value.jobs);
            return;
        }

        // Timed out: report completed vs still-pending by name.
        var jobs = result?.jobs ?? new List<UpgradeJob>();
        var done = jobs.Where(j => j.Ok.HasValue).Select(j => Path.GetFileName(j.Src)).ToList();
        var pending = jobs.Where(j => !j.Ok.HasValue).Select(j => Path.GetFileName(j.Src)).ToList();
        var sb = new StringBuilder("Timed out after 10 minutes.\n\n");
        sb.AppendLine($"Completed ({done.Count}): " + (done.Count > 0 ? string.Join(", ", done) : "none"));
        sb.AppendLine($"Still pending ({pending.Count}): " + (pending.Count > 0 ? string.Join(", ", pending) : "none"));
        TaskDialog.Show("Sentinel — Upgrade Files", sb.ToString());
    }

    private void Poll()
    {
        if (DateTime.Now - _startedAt > Timeout)
        {
            DialogResult = false;
            Close();
            return;
        }

        var result = UpgradeQueueStore.LoadResults();
        if (result == null) return;

        int done = result.Value.jobs.Count(j => j.Ok.HasValue);
        _status.Text = $"{done} of {_total} done…";

        if (result.Value.done)
        {
            DialogResult = true;
            Close();
        }
    }

    private static void ShowReport(List<UpgradeJob> jobs)
    {
        var sb = new StringBuilder();
        foreach (var j in jobs)
        {
            string name = Path.GetFileName(j.Src);
            if (j.Ok == true)
            {
                var fromVer = RvtFileInfo.Read(j.Src).SavedVersion;
                var toVer = RvtFileInfo.Read(j.Dest).SavedVersion;
                string transition = string.IsNullOrEmpty(fromVer) || string.IsNullOrEmpty(toVer)
                    ? "" : $" ({fromVer} → {toVer})";
                sb.AppendLine($"✓ {name}{transition}, {j.Warnings} warning(s), {j.Ms / 1000.0:0} s");
            }
            else
            {
                sb.AppendLine($"✕ {name} — {j.Error}");
            }
        }
        TaskDialog.Show("Sentinel — Upgrade Files", sb.ToString());
    }
}
