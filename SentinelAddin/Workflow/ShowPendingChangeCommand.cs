using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Workflow;

/// <summary>
/// Visual Diff Engine. Highlights the element under review with a temporary
/// semi-transparent green override + temporary isolation in the active view,
/// captures the original graphic state, and restores it on demand (called by
/// RequestsWindow.Closed). All Revit work runs through App.Events (ExternalEvent),
/// so it is safe to call from the WPF thread.
/// </summary>
public static class ShowPendingChangeCommand
{
    private sealed class SavedState
    {
        public SavedState(ElementId viewId, ElementId elementId, OverrideGraphicSettings original, bool startedIsolation)
        { ViewId = viewId; ElementId = elementId; Original = original; StartedIsolation = startedIsolation; }
        public ElementId ViewId { get; }
        public ElementId ElementId { get; }
        public OverrideGraphicSettings Original { get; }
        public bool StartedIsolation { get; }
    }

    // One active preview at a time; keyed state survives across EventHub calls.
    private static SavedState? _active;
    private static readonly object Gate = new object();

    /// <summary>Apply the diff highlight. Safe no-op if the element is not
    /// visible/overridable in the active view (e.g. the request is a sheet).</summary>
    public static void Show(long elementId)
    {
        App.Events?.Enqueue(uiapp =>
        {
            var uidoc = uiapp.ActiveUIDocument;
            var doc = uidoc?.Document;
            if (uidoc is null || doc is null) return;

            var id = elementId.ToElementId();
            var element = doc.GetElement(id);
            var view = doc.ActiveView;
            if (element is null || view is null) return;

            // Views/sheets under review can't be overridden as graphics — fall
            // back to opening/selecting them instead of painting them.
            if (element is View targetView)
            {
                uidoc.RequestViewChange(targetView);
                return;
            }
            if (!element.CanBeHidden(view)) { uidoc.Selection.SetElementIds(new List<ElementId> { id }); return; }

            Reset(uiapp); // never stack two previews

            using var t = new Transaction(doc, "Sentinel: Preview pending change");
            t.Start();

            var original = view.GetElementOverrides(id);
            bool isolate = !view.IsInTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);

            var ogs = new OverrideGraphicSettings()
                .SetSurfaceTransparency(40)
                .SetSurfaceForegroundPatternColor(new Color(70, 170, 110))
                .SetProjectionLineColor(new Color(30, 110, 70))
                .SetProjectionLineWeight(6);
            var solid = GetSolidFillPattern(doc);
            if (solid is not null) ogs.SetSurfaceForegroundPatternId(solid.Id);

            view.SetElementOverrides(id, ogs);
            if (isolate) view.IsolateElementTemporary(id);

            t.Commit();

            lock (Gate) _active = new SavedState(view.Id, id, original, isolate);
            uidoc.Selection.SetElementIds(new List<ElementId> { id });
            uidoc.ShowElements(id);
        });
    }

    /// <summary>Restore the original graphic state. Idempotent; called from
    /// RequestsWindow.Closed and before every new Show().</summary>
    public static void ResetFromUi() => App.Events?.Enqueue(Reset);

    private static void Reset(UIApplication uiapp)
    {
        SavedState? s;
        lock (Gate) { s = _active; _active = null; }
        if (s is null) return;

        var doc = uiapp.ActiveUIDocument?.Document;
        if (doc is null) return;
        if (doc.GetElement(s.ViewId) is not View view) return;

        using var t = new Transaction(doc, "Sentinel: Clear change preview");
        t.Start();
        if (doc.GetElement(s.ElementId) is not null)
            view.SetElementOverrides(s.ElementId, s.Original);
        if (s.StartedIsolation && view.IsInTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate))
            view.DisableTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);
        t.Commit();
    }

    private static FillPatternElement? GetSolidFillPattern(Document doc) =>
        new FilteredElementCollector(doc)
            .OfClass(typeof(FillPatternElement))
            .Cast<FillPatternElement>()
            .FirstOrDefault(p => p.GetFillPattern().IsSolidFill);
}
