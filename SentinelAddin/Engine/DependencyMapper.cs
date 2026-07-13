using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Pre-flight dependency check before an element is deleted or renamed.
/// Read-only. Reports what would break: views placed on sheets, datum planes
/// hosting section boxes/dimensions, elements pinned by constraints, and the
/// blast radius of dependent elements. Consumed by the approval workflow
/// (a request on a heavily-depended element deserves extra coordinator care)
/// and by future delete-interception.
/// </summary>
public static class DependencyMapper
{
    public sealed class DependencyReport
    {
        public long ElementId { get; set; }
        public string ElementName { get; set; } = string.Empty;
        public int DependentCount { get; set; }
        public List<string> BoundSheets { get; } = new List<string>();
        public List<string> DependentViews { get; } = new List<string>();
        public List<string> Constraints { get; } = new List<string>();
        public bool IsPinned { get; set; }
        /// True when deletion/modification is high-impact and should be
        /// escalated (on sheets, pinned, or wide dependency fan-out).
        public bool RequiresEscalation =>
            IsPinned || BoundSheets.Count > 0 || Constraints.Count > 0 || DependentCount > 25;
    }

    public static DependencyReport Analyze(Document doc, ElementId id)
    {
        var report = new DependencyReport { ElementId = id.IdValue() };
        var element = doc.GetElement(id);
        if (element is null) return report;

        report.ElementName = element is ViewSheet sh ? sh.SheetNumber : element.Name;
        report.IsPinned = element.Pinned;

        // 1. View under review -> is it placed on any sheet? (deleting it
        //    empties a documented deliverable)
        if (element is View view && view is not ViewSheet)
        {
            foreach (ViewSheet sheet in new FilteredElementCollector(doc)
                         .OfClass(typeof(ViewSheet)).Cast<ViewSheet>())
            {
                if (sheet.GetAllPlacedViews().Contains(view.Id))
                    report.BoundSheets.Add(sheet.SheetNumber + " — " + sheet.Name);
            }
        }

        // 2. Blast radius: what Revit would delete alongside this element.
        //    GetDependentElements is read-only and cheap (2020+ API, all targets).
        var dependents = element.GetDependentElements(null);
        report.DependentCount = Math.Max(0, dependents.Count - 1); // excludes self

        foreach (var depId in dependents)
        {
            if (depId == element.Id) continue;
            var dep = doc.GetElement(depId);
            switch (dep)
            {
                case View dv when !dv.IsTemplate:
                    report.DependentViews.Add(dv.Name);
                    break;
                case Dimension dim:
                    report.Constraints.Add("Dimension/constraint " + dim.Id.IdValue());
                    break;
            }
        }

        // 3. Datum-specific: levels/grids hosting anything at all is already
        //    covered by DependentCount; flag the classic killers explicitly.
        if (element is Level && report.DependentCount > 0)
            report.Constraints.Add("Level hosts " + report.DependentCount + " element(s) — deletion cascades");
        if (element is Grid && report.DependentCount > 0)
            report.Constraints.Add("Grid referenced by " + report.DependentCount + " element(s)");

        return report;
    }

    /// One-line summary for status bars and audit notes.
    public static string Summarize(DependencyReport r) =>
        r.RequiresEscalation
            ? "⚠ High impact: " + r.DependentCount + " dependents, " +
              r.BoundSheets.Count + " sheet(s), " + r.Constraints.Count + " constraint(s)" +
              (r.IsPinned ? ", PINNED" : "")
            : "Low impact: " + r.DependentCount + " dependent element(s)";
}
