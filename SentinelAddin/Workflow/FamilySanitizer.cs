using System.IO;
using Autodesk.Revit.DB;

namespace Sentinel.Workflow;

/// <summary>
/// Family sanitation gateway: audits an .rfa BEFORE it is committed to the
/// project. Opens the family document in the background, scans it, and only
/// loads on pass (or with explicit override). Locale-resilient by design:
/// identification via ElementType names (Compat.RuleTargetName) and
/// BuiltInCategory ids — never localized family/category display names.
/// </summary>
public static class FamilySanitizer
{
    public sealed class SanitationReport
    {
        public string FamilyPath { get; set; } = string.Empty;
        public int SolidCount { get; set; }
        public int NestedCadImports { get; set; }
        public List<string> MissingSharedParams { get; } = new List<string>();
        public List<string> Issues { get; } = new List<string>();
        public bool Passed => Issues.Count == 0;
    }

    /// Geometry budget: beyond this the family will hurt model performance.
    public const int MaxSolids = 150;
    /// Shared parameters every BDS library family must carry.
    public static readonly string[] RequiredSharedParams = { "BDS_Description" };

    /// <summary>Scan an .rfa on disk without touching the active project.
    /// Runs on the EventHub (needs the Application context to open docs).</summary>
    public static void ScanAndLoad(string rfaPath, Action<SanitationReport, bool> onDone)
    {
        App.Events?.Enqueue(uiapp =>
        {
            var report = new SanitationReport { FamilyPath = rfaPath };
            Document? famDoc = null;
            bool loaded = false;
            try
            {
                famDoc = uiapp.Application.OpenDocumentFile(rfaPath);
                if (!famDoc.IsFamilyDocument)
                {
                    report.Issues.Add("Not a family document.");
                }
                else
                {
                    Scan(famDoc, report);
                    var target = uiapp.ActiveUIDocument?.Document;
                    if (report.Passed && target is not null && !target.IsFamilyDocument)
                    {
                        loaded = famDoc.LoadFamily(target, new OverwriteOptions()) is not null;
                        Engine.RoiTracker.Log("family",
                            Path.GetFileName(rfaPath) + " sanitized and loaded");
                    }
                }
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex)
            {
                report.Issues.Add("Could not open family: " + ex.Message);
            }
            finally
            {
                famDoc?.Close(false);
            }
            onDone(report, loaded);
        });
    }

    /// <summary>Pure audit of an open family document.</summary>
    public static void Scan(Document famDoc, SanitationReport report)
    {
        // 1. Heavy geometry: count solids across all element geometry.
        var opts = new Options { DetailLevel = ViewDetailLevel.Fine, ComputeReferences = false };
        foreach (var e in new FilteredElementCollector(famDoc).WhereElementIsNotElementType())
        {
            var geo = e.get_Geometry(opts);
            if (geo is null) continue;
            foreach (var obj in geo)
                if (obj is Solid s && s.Volume > 1e-9) report.SolidCount++;
        }
        if (report.SolidCount > MaxSolids)
            report.Issues.Add($"Heavy geometry: {report.SolidCount} solids (budget {MaxSolids}).");

        // 2. Nested CAD: ImportInstance is locale-invariant (class, not name).
        report.NestedCadImports = new FilteredElementCollector(famDoc)
            .OfClass(typeof(ImportInstance)).GetElementCount();
        if (report.NestedCadImports > 0)
            report.Issues.Add(report.NestedCadImports + " nested CAD import(s) — explode/redraw before loading.");

        // 3. Required shared parameters (by definition name on the family manager —
        //    shared param names are user-defined, not localized by Revit).
        var fm = famDoc.FamilyManager;
        var present = new HashSet<string>(
            fm.Parameters.Cast<FamilyParameter>()
              .Where(p => p.IsShared)
              .Select(p => p.Definition.Name));
        foreach (var required in RequiredSharedParams)
            if (!present.Contains(required))
            {
                report.MissingSharedParams.Add(required);
                report.Issues.Add("Missing shared parameter: " + required);
            }

        // 4. Type sanity: every family type must have a non-default name.
        //    Locale-safe: FamilyManager types, not localized display strings.
        foreach (FamilyType t in fm.Types)
            if (string.IsNullOrWhiteSpace(t.Name) || t.Name.Trim().Length <= 1)
                report.Issues.Add("Unnamed family type found — name all types before loading.");
    }

    private sealed class OverwriteOptions : IFamilyLoadOptions
    {
        public bool OnFamilyFound(bool familyInUse, out bool overwriteParameterValues)
        { overwriteParameterValues = true; return true; }
        public bool OnSharedFamilyFound(Family sharedFamily, bool familyInUse,
            out FamilySource source, out bool overwriteParameterValues)
        { source = FamilySource.Family; overwriteParameterValues = true; return true; }
    }
}
