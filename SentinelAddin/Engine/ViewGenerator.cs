using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Generates the MEP clash coordination 3D view, routes it into the BDS
/// Project Browser structure (05_COORDINATION & QA/QC -> 05.3_MEP COORDINATION
/// -> MEP Clashes via the three browser parameters), section-boxes it around
/// the clashes and applies ISO-style severity color overrides:
/// Hard = red, Medium = orange, Soft = yellow (solid fill + projection lines).
/// Must run inside the EventHub (owns its transaction).
/// </summary>
public static class ViewGenerator
{
    private static readonly Color Red = new Color(190, 45, 40);
    private static readonly Color Orange = new Color(235, 140, 30);
    private static readonly Color Yellow = new Color(245, 210, 60);

    // BDS-RTG-001 §4: browser routing parameters. Offices vary — each slot
    // tries a list of candidate names, first match wins (strict routing, #1).
    internal static readonly string[] MainGroupParams =
        { "BDS_View Status", "View_Group", "BDS_Discipline", "View Group" };
    internal static readonly string[] SubGroupParams =
        { "BDS_View Type", "BDS_Sub-Discipline", "View_SubGroup", "Sub Discipline" };
    internal static readonly string[] SubSubGroupParams =
        { "BDS_View Sub Type", "View_Detail_Group" };

    public static View3D? CreateClashView(Document doc, List<ClashManager.ClashItem> clashes)
    {
        if (clashes.Count == 0) return null;

        var vft = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType))
            .Cast<ViewFamilyType>().FirstOrDefault(v => v.ViewFamily == ViewFamily.ThreeDimensional);
        if (vft is null) return null;

        using var t = new Transaction(doc, "Sentinel: Create clash view");
        t.Start();

        var view = View3D.CreateIsometric(doc, vft.Id);
        view.Name = Unique(doc, "CO_MEP-CLASH_" + DateTime.Now.ToString("yyyyMMdd_HHmm"));
        view.DetailLevel = ViewDetailLevel.Fine;
        view.DisplayStyle = DisplayStyle.ShadingWithEdges;

        // Browser routing (strict, with fallback — fix #1):
        bool mainOk = SetFirstMatch(view, MainGroupParams, "05_COORDINATION & QA/QC");
        bool subOk = SetFirstMatch(view, SubGroupParams, "05.3_MEP COORDINATION");
        SetFirstMatch(view, SubSubGroupParams, "MEP Clashes");
        if (!mainOk)
        {
            // No custom grouping parameter in this document: fall back to the
            // native discipline so the view at least lands under Coordination.
            var disc = view.get_Parameter(BuiltInParameter.VIEW_DISCIPLINE);
            if (disc is not null && !disc.IsReadOnly) disc.Set((int)ViewDiscipline.Coordination);
            App.PanelVm?.LogDoctor(
                "Clash view: no browser grouping parameter found (tried: " +
                string.Join(", ", MainGroupParams) + ") — used native VIEW_DISCIPLINE fallback. " +
                "The view may appear under '???' until the parameter exists.");
        }
        else if (!subOk)
        {
            App.PanelVm?.LogDoctor("Clash view: main group set, but no sub-group parameter found (tried: " +
                string.Join(", ", SubGroupParams) + ").");
        }

        // Section box: envelope of all clash points + 1m margin
        double margin = 1.0 / 0.3048;
        var pts = clashes.Select(c => c.Location).ToList();
        view.SetSectionBox(new BoundingBoxXYZ
        {
            Min = new XYZ(pts.Min(p => p.X) - margin, pts.Min(p => p.Y) - margin, pts.Min(p => p.Z) - margin),
            Max = new XYZ(pts.Max(p => p.X) + margin, pts.Max(p => p.Y) + margin, pts.Max(p => p.Z) + margin),
        });

        // Severity color overrides on the HOST elements (link elements cannot
        // be individually overridden; the section box brings viewers to them).
        var solid = new FilteredElementCollector(doc).OfClass(typeof(FillPatternElement))
            .Cast<FillPatternElement>().FirstOrDefault(p => p.GetFillPattern().IsSolidFill);

        foreach (var group in clashes.GroupBy(c => c.HostId))
        {
            var worst = group.Max(c => c.Grade);
            var color = worst == ClashManager.Severity.Hard ? Red
                      : worst == ClashManager.Severity.Medium ? Orange : Yellow;
            var ogs = new OverrideGraphicSettings()
                .SetProjectionLineColor(color)
                .SetSurfaceForegroundPatternColor(color)
                .SetSurfaceTransparency(20);
            if (solid is not null) ogs.SetSurfaceForegroundPatternId(solid.Id);
            try { view.SetElementOverrides(group.Key.ToElementId(), ogs); }
            catch (Autodesk.Revit.Exceptions.ApplicationException) { }
        }

        t.Commit();
        return view;
    }

    /// Try each candidate parameter name; set the first writable string match.
    internal static bool SetFirstMatch(Element e, string[] candidates, string value)
    {
        foreach (var name in candidates)
        {
            var p = e.LookupParameter(name);
            if (p is not null && !p.IsReadOnly && p.StorageType == StorageType.String)
            { p.Set(value); return true; }
        }
        return false;
    }

    private static string Unique(Document doc, string baseName)
    {
        var taken = new HashSet<string>(new FilteredElementCollector(doc)
            .OfClass(typeof(View3D)).Cast<View3D>().Select(v => v.Name));
        if (!taken.Contains(baseName)) return baseName;
        for (int i = 1; i < 100; i++)
            if (!taken.Contains(baseName + "_" + i.ToString("D2"))) return baseName + "_" + i.ToString("D2");
        return baseName + "_" + Guid.NewGuid().ToString("N").Substring(0, 4);
    }
}
