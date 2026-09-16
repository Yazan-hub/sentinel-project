using System.Diagnostics;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// IFC Pre-Flight: on-demand audit run BEFORE an IFC export (Revit has no
/// export-intercept API, so this is invoked from the ribbon / prior to the
/// coordinator issuing the model). Checks, per exportable model category:
///   1. 'IfcExportAs' type/instance parameter present and non-empty
///   2. Mandatory property-set parameters (configurable) filled
/// Read-only — safe anywhere; results feed the standard ScanReport pipeline
/// so the panel and HealthScorecard consume them like any other violation.
/// </summary>
public static class IfcPreFlightScanner
{
    public const string RuleIdExportAs = "IFC-01";
    public const string RuleIdPset = "IFC-02";

    /// Mandatory office shared parameters for deliverable exports, named from the
    /// configured office code (extend via ruleset overlay in Phase 3).
    public static string[] MandatoryPsetParams(string org) => new[] { OrgNames.ViewStatus(org) };

    /// Categories that materially matter in an IFC deliverable.
    private static readonly BuiltInCategory[] ExportCategories =
    {
        BuiltInCategory.OST_Walls, BuiltInCategory.OST_Floors, BuiltInCategory.OST_Roofs,
        BuiltInCategory.OST_Ceilings, BuiltInCategory.OST_Doors, BuiltInCategory.OST_Windows,
        BuiltInCategory.OST_Stairs, BuiltInCategory.OST_StructuralColumns,
        BuiltInCategory.OST_StructuralFraming, BuiltInCategory.OST_StructuralFoundation,
        BuiltInCategory.OST_Columns, BuiltInCategory.OST_CurtainWallPanels,
        BuiltInCategory.OST_CurtainWallMullions, BuiltInCategory.OST_GenericModel,
    };

    public static ScanReport Scan(Document doc)
    {
        var sw = Stopwatch.StartNew();
        var violations = new List<Violation>();
        int checkedCount = 0;

        var rs = App.Engine?.Ruleset;
        string org = rs?.Org ?? string.Empty;
        string? bep = OrgNames.DocRef(rs, "bep");
        string exportAsRef = bep is null ? "ISO 16739" : "ISO 16739 / " + bep;
        string[] psetParams;
        if (OrgNames.Configured(org)) psetParams = MandatoryPsetParams(org);
        else
        {
            psetParams = Array.Empty<string>();
            violations.Add(new Violation(RuleIdPset, EnforcementMode.Monitor, -1, "IFC pre-flight",
                "No office code configured (ruleset 'org' is empty) — office parameter checks skipped.",
                "لم يتم تكوين رمز المكتب — تم تخطي فحص معاملات المكتب.", null));
        }

        var catFilter = new ElementMulticategoryFilter(ExportCategories);
        var elements = new FilteredElementCollector(doc)
            .WherePasses(catFilter)
            .WhereElementIsNotElementType()
            .ToElements();

        // Type-level export mapping is the common pattern; cache per type id.
        var typeHasExportAs = new Dictionary<long, bool>();

        foreach (var e in elements)
        {
            checkedCount++;
            // Locale-invariant: read Revit's built-in IFC parameters by id
            // ("Export to IFC As" in English UI, "In IFC exportieren als" in
            // German, ...), then fall back to the exporter's shared parameter.
#if REVIT2023_OR_GREATER
            bool hasExportAs =
                HasNonEmptyBip(e, BuiltInParameter.IFC_EXPORT_ELEMENT_AS)
                || HasNonEmpty(e, "IfcExportAs");
            if (!hasExportAs)
            {
                var typeId = e.GetTypeId();
                long tKey = typeId.IdValue();
                if (!typeHasExportAs.TryGetValue(tKey, out var typeOk))
                {
                    var et = doc.GetElement(typeId);
                    typeOk = et is not null &&
                        (HasNonEmptyBip(et, BuiltInParameter.IFC_EXPORT_ELEMENT_TYPE_AS)
                         || HasNonEmpty(et, "IfcExportAs"));
                    typeHasExportAs[tKey] = typeOk;
                }
                hasExportAs = typeOk;
            }
#else
            bool hasExportAs = HasNonEmpty(e, "IfcExportAs");
            if (!hasExportAs)
            {
                var typeId = e.GetTypeId();
                long tKey = typeId.IdValue();
                if (!typeHasExportAs.TryGetValue(tKey, out var typeOk))
                {
                    var et = doc.GetElement(typeId);
                    typeOk = et is not null && HasNonEmpty(et, "IfcExportAs");
                    typeHasExportAs[tKey] = typeOk;
                }
                hasExportAs = typeOk;
            }
#endif

            if (!hasExportAs)
            {
                // Category-aware severity: Walls/Doors/etc. have sane default
                // IFC mappings (IfcWall, IfcDoor) -> MONITOR (informational).
                // Generic Models export as IfcBuildingElementProxy -> WARN,
                // that's what actually degrades a coordination deliverable.
                bool poorDefault = e.Category is not null &&
                    (e.Category.MatchesCategoryKey("Generic Models") ||
                     e.Category.MatchesCategoryKey("Specialty Equipment"));
                violations.Add(new Violation(RuleIdExportAs,
                    poorDefault ? EnforcementMode.Warn : EnforcementMode.Monitor,
                    e.Id.IdValue(), Describe(e),
                    poorDefault
                        ? "No IFC mapping — will export as IfcBuildingElementProxy. Set 'Export to IFC As' on the type."
                        : "No explicit IFC mapping — default category mapping will be used.",
                    "معامل 'IfcExportAs' غير محدد — سيتم استخدام التعيين الافتراضي.",
                    exportAsRef));
            }

            foreach (var pName in psetParams)
            {
                var p = e.LookupParameter(pName);
                if (p is not null && (!p.HasValue || string.IsNullOrWhiteSpace(p.AsString())))
                    violations.Add(new Violation(RuleIdPset, EnforcementMode.Warn,
                        e.Id.IdValue(), Describe(e),
                        "Mandatory property '" + pName + "' is empty for IFC export.",
                        null, bep));
            }
        }

        sw.Stop();
        return new ScanReport(doc.Title + " [IFC pre-flight]", DateTimeOffset.Now,
            sw.ElapsedMilliseconds, checkedCount, violations);
    }

    private static bool HasNonEmpty(Element e, string name)
    {
        var p = e.LookupParameter(name);
        return p is not null && p.HasValue && !string.IsNullOrWhiteSpace(p.AsString());
    }

    private static bool HasNonEmptyBip(Element e, BuiltInParameter bip)
    {
        var p = e.get_Parameter(bip);
        return p is not null && p.HasValue && !string.IsNullOrWhiteSpace(p.AsString());
    }

    private static string Describe(Element e) =>
        (e.Category?.Name ?? "?") + ": " + (string.IsNullOrEmpty(e.Name) ? e.Id.IdValue().ToString() : e.Name);
}
