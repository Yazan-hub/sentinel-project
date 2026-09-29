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
        public SavedState(Document doc, ElementId viewId, ElementId elementId, OverrideGraphicSettings original, bool startedIsolation)
        { Doc = doc; ViewId = viewId; ElementId = elementId; Original = original; StartedIsolation = startedIsolation; }
        public Document Doc { get; }          // the model the preview was painted on (XC-1)
        public ElementId ViewId { get; }
        public ElementId ElementId { get; }
        public OverrideGraphicSettings Original { get; }
        public bool StartedIsolation { get; }
    }

    // One active preview at a time; keyed state survives across EventHub calls.
    private static SavedState? _active;
    private static readonly object Gate = new object();

    /// <summary>Apply the diff highlight on <paramref name="doc"/> — the model the Change Requests window was opened
    /// on (XC-1: refused when another model is active). Safe no-op if the element is not visible/overridable in the
    /// active view (e.g. the request is a sheet).</summary>
    public static void Show(Document doc, long elementId)
    {
        App.Events?.Enqueue(doc, "show the change", (uiapp, d) =>
        {
            var uidoc = uiapp.ActiveUIDocument!;       // DocPin: the active document is d
            var id = elementId.ToElementId();
            var element = d.GetElement(id);
            var view = d.ActiveView;
            if (element is null || view is null) return;

            // Views/sheets under review can't be overridden as graphics — fall
            // back to opening/selecting them instead of painting them.
            if (element is View targetView)
            {
                uidoc.RequestViewChange(targetView);
                return;
            }
            if (!element.CanBeHidden(view)) { uidoc.Selection.SetElementIds(new List<ElementId> { id }); return; }

            Reset(); // never stack two previews

            using var t = new Transaction(d, "Sentinel: Preview pending change");
            t.Start();

            var original = view.GetElementOverrides(id);
            bool isolate = !view.IsInTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);

            var ogs = new OverrideGraphicSettings()
                .SetSurfaceTransparency(40)
                .SetSurfaceForegroundPatternColor(new Color(70, 170, 110))
                .SetProjectionLineColor(new Color(30, 110, 70))
                .SetProjectionLineWeight(6);
            var solid = GetSolidFillPattern(d);
            if (solid is not null) ogs.SetSurfaceForegroundPatternId(solid.Id);

            view.SetElementOverrides(id, ogs);
            if (isolate) view.IsolateElementTemporary(id);

            t.Commit();

            lock (Gate) _active = new SavedState(d, view.Id, id, original, isolate);
            uidoc.Selection.SetElementIds(new List<ElementId> { id });
            uidoc.ShowElements(id);
        });
    }

    /// <summary>Restore the original graphic state. Idempotent; called from
    /// RequestsWindow.Closed and before every new Show().</summary>
    public static void ResetFromUi() => App.Events?.Enqueue(_ => Reset());

    // Restores the graphics on the document the preview was painted on — never on whichever model is active now.
    private static void Reset()
    {
        SavedState? s;
        lock (Gate) { s = _active; _active = null; }
        if (s is null || !s.Doc.IsValidObject) return;   // closed: its preview went with it
        var doc = s.Doc;
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
