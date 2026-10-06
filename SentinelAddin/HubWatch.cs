using System;
using System.Globalization;

namespace Sentinel;

/// <summary>F-SEC5-1: what the event hub says about a queued Sentinel action that has waited for Revit, or a running one that
/// takes long — said, never silent. Pure (no Revit types): tools/event-check compiles it. Each episode (one oldest queued
/// action, one running action) is said once: the pane's Doctor log keeps 200 lines.</summary>
internal sealed class HubWatch
{
    /// <summary>A queued action older than this, with nothing running, is raised again (the watchdog ticks every 5 s).</summary>
    internal static readonly TimeSpan ReRaiseAfter = TimeSpan.FromSeconds(10);
    /// <summary>A queued action older than this, with nothing running, is run from Revit's Idling event (founder decision F-a).</summary>
    internal static readonly TimeSpan DrainAfter = TimeSpan.FromSeconds(15);
    /// <summary>A running action is named once it has run this long.</summary>
    internal static readonly TimeSpan LongRun = TimeSpan.FromSeconds(60);

    private DateTime? _saidWait, _saidRun;

    /// <summary>The watchdog's tick (UTC times): the words to say, or null; <paramref name="raiseAgain"/> when the oldest queued
    /// action has waited past <see cref="ReRaiseAfter"/> and nothing runs.</summary>
    internal string? Tick(DateTime now, (string What, DateTime At)? oldest, int queued, (string What, DateTime At)? running,
                          DateTime? lastIdling, out bool raiseAgain)
    {
        raiseAgain = false;
        if (running is { } r)
        {
            if (now - r.At <= LongRun || _saidRun == r.At) return null;
            _saidRun = r.At;
            return $"A Sentinel action has been running for {Secs(now - r.At)} s: {r.What} — {queued} more wait for it.";
        }
        if (oldest is not { } o || now - o.At <= ReRaiseAfter) return null;
        raiseAgain = true;
        if (_saidWait == o.At) return null;
        _saidWait = o.At;
        return $"A Sentinel action has waited {Secs(now - o.At)} s for Revit: {o.What} ({queued} queued; "
             + (lastIdling is { } i ? $"Revit was last idle {Secs(now - i)} s ago" : "Revit has not been idle this session") + ") — raised again";
    }

    /// <summary>Revit's Idling event runs the queue itself when its oldest action has waited past <see cref="DrainAfter"/>
    /// and nothing runs.</summary>
    internal static bool ShouldDrain(DateTime now, DateTime? oldestAt, bool running) => !running && oldestAt is { } a && now - a > DrainAfter;

    /// <summary>The words of a drain by Idling.</summary>
    internal static string Drained(TimeSpan waited, string what, int queued) =>
        $"Revit's Idling ran {queued} queued Sentinel action(s) — Revit had not run its external event for {Secs(waited)} s (first: {what}).";

    private static string Secs(TimeSpan t) => ((int)t.TotalSeconds).ToString(CultureInfo.InvariantCulture);
}
