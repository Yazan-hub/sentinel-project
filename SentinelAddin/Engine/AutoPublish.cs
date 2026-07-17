using System;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Push-on-save. When enabled, every Revit save / sync-to-central re-exports the model to the outbox (which
/// the Bridge uploads to That Open Platform), so the web viewer always reflects the latest model without a
/// manual "Publish" click.
///
/// Two safeguards make this safe to leave on:
///   • the export is marshalled through the shared <see cref="RevitEventHub"/> ExternalEvent, so it runs in a
///     valid API context (you cannot export/transact directly inside a DocumentSaved event), and
///   • it is throttled (<see cref="MinInterval"/>) and single-flighted (<see cref="_busy"/>), so a burst of
///     saves — or a save that fires while a big model is still exporting — never piles up exports.
/// IFC export runs on Revit's API thread, so a very large model will briefly block the UI while it writes;
/// the throttle keeps that to at most once per interval, and the toggle lets the user turn it off entirely.
/// </summary>
public static class AutoPublish
{
    /// <summary>Master switch (flipped by the ribbon's Auto-Publish toggle). Default on — this is the feature.</summary>
    public static bool Enabled { get; set; } = true;

    /// <summary>Last outcome, for the panel / toggle dialog to surface ("Synced 1,234 KB at 14:03").</summary>
    public static string LastStatus { get; private set; } = "Auto-publish idle.";

    private static readonly TimeSpan MinInterval = TimeSpan.FromSeconds(15);
    private static DateTime _lastRun = DateTime.MinValue;
    private static bool _busy;

    /// <summary>
    /// Queue an auto-export for <paramref name="doc"/> if enabled, not a family doc, and neither throttled
    /// nor already running. Called from the DocumentSaved / DocumentSynchronizedWithCentral hooks.
    /// </summary>
    public static void Trigger(Document? doc)
    {
        if (!Enabled || doc is null || doc.IsFamilyDocument || _busy) return;

        var now = DateTime.UtcNow;
        if (now - _lastRun < MinInterval) return;
        _lastRun = now;

        var hub = App.Events;
        if (hub is null) { RunNow(doc); return; }          // no hub yet → run inline (already valid context on sync)
        hub.Enqueue(_ => RunNow(doc));                       // else marshal to the ExternalEvent (valid API context)
    }

    private static void RunNow(Document doc)
    {
        _busy = true;
        try
        {
            var r = PlatformExporter.ExportToOutbox(doc, PlatformExporter.Default3DView(doc));
            LastStatus = r.state switch
            {
                PlatformExporter.State.Ok => $"Synced {r.bytes / 1024:N0} KB → outbox at {DateTime.Now:HH:mm:ss}.",
                PlatformExporter.State.MissingOrEmpty => "Auto-publish skipped: export had no geometry.",
                PlatformExporter.State.Locked => "Auto-publish skipped: outbox IFC was locked.",
                _ => "Auto-publish failed: " + (r.error ?? "unknown"),
            };
        }
        catch (Exception ex)
        {
            LastStatus = "Auto-publish error: " + ex.Message; // never let a background export crash Revit
        }
        finally
        {
            _busy = false;
        }
    }
}
