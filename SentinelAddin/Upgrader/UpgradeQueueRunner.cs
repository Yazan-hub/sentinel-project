using System;
using System.Diagnostics;
using System.IO;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Events;
using Sentinel.Engine;

namespace Sentinel.Upgrader;

/// <summary>
/// When THIS Revit version is named as the target of a pending upgrade queue,
/// process it at ApplicationInitialized (docs can't open during OnStartup),
/// write per-job results as we go, then exit Revit. Warning dialogs are
/// suppressed and counted; a failing job never stops the batch.
/// </summary>
public static class UpgradeQueueRunner
{
    private static UpgradeQueue? _queue;
    private static int _dialogsSuppressed;

    /// Fast no-op on every normal Revit launch (the common case: no queue targets this version).
    /// Defensive: any bug in arming must never break normal startup.
    public static void TryArm(UIControlledApplication app)
    {
        try
        {
            _queue = UpgradeQueueStore.LoadQueueFor(app.ControlledApplication.VersionNumber);
            if (_queue is null) return;

            app.DialogBoxShowing += OnDialog;                       // swallow upgrade prompts
            app.ControlledApplication.FailuresProcessing += OnFailures;
            app.ControlledApplication.ApplicationInitialized += OnReady;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Sentinel: upgrade queue arming failed ({ex.Message}) — skipping, normal startup continues.");
        }
    }

    private static void OnDialog(object? s, DialogBoxShowingEventArgs e)
    {
        _dialogsSuppressed++;
        e.OverrideResult((int)TaskDialogResult.Ok);
    }

    private static void OnFailures(object? s, FailuresProcessingEventArgs e)
    {
        var fa = e.GetFailuresAccessor();
        fa.DeleteAllWarnings();                                  // count via _dialogsSuppressed only
        e.SetProcessingResult(FailureProcessingResult.Continue);
    }

    private static void OnReady(object? sender, ApplicationInitializedEventArgs e)
    {
        var dbApp = (Application)sender!;
        foreach (var job in _queue!.Jobs)
        {
            var sw = Stopwatch.StartNew();
            _dialogsSuppressed = 0;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(job.Dest)!);
                var mp = ModelPathUtils.ConvertUserVisiblePathToModelPath(job.Src);
                var opts = new OpenOptions
                { DetachFromCentralOption = DetachFromCentralOption.DetachAndPreserveWorksets };
                var doc = dbApp.OpenDocumentFile(mp, opts);
                doc.SaveAs(job.Dest, new SaveAsOptions { OverwriteExistingFile = true });
                doc.Close(false);
                job.Ok = true;
            }
            catch (Exception ex) { job.Ok = false; job.Error = ex.Message; }
            job.Warnings = _dialogsSuppressed;
            job.Ms = sw.ElapsedMilliseconds;
            UpgradeQueueStore.SaveResults(_queue, done: false);  // truthful partial on crash
        }
        UpgradeQueueStore.SaveResults(_queue, done: true);
        File.Delete(UpgradeQueueStore.QueuePath);
        // ponytail: this instance exists only to run the queue — kill is the
        // reliable exit (PostableCommand.ExitRevit prompts on some versions).
        Process.GetCurrentProcess().Kill();
    }
}
