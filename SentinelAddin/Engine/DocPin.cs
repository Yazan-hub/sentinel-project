// XC-1: every Sentinel job that changes or shows a model runs on the model it was started on — captured when the
// action starts (row published, button clicked, window opened) — or refuses in words and changes nothing. The words
// are pure (tools/docpin-check); SENTINEL_CHECK hides the Revit half from the check.
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
#endif

namespace Sentinel.Engine;

public static class DocPin
{
    /// <summary>What Sentinel says when a job does not run; null = run. <paramref name="what"/> is a verb phrase
    /// ("rename the element").</summary>
    public static string? Refusal(bool pinnedValid, bool pinnedActive, string pinnedTitle, string what)
    {
        if (!pinnedValid) return $"Sentinel did not {what}: the model it was started on is closed — nothing was changed.";
        if (!pinnedActive) return $"Sentinel did not {what}: switch back to {pinnedTitle} — nothing was changed.";
        return null;
    }

#if !SENTINEL_CHECK
    /// <summary>Null when <paramref name="pinned"/> is open and is Revit's active document; else the refusal line.
    /// API thread only. IsValidObject is read before Equals: a closed document cannot be compared.</summary>
    public static string? Check(UIApplication app, Document pinned, string what)
    {
        bool valid = pinned.IsValidObject;
        bool active = valid && app.ActiveUIDocument?.Document is { } a && a.Equals(pinned);
        return Refusal(valid, active, valid ? pinned.Title : "", what);
    }
#endif
}
