using System.IO;
using Autodesk.Revit.DB;

namespace Sentinel.Workflow;

/// <summary>
/// Retroactive sanitizer + auto-healer for families ALREADY loaded in the
/// project. Missing shared parameters are healed automatically: EditFamily in
/// the background, inject definitions, silent reload via IFamilyLoadOptions.
/// Geometry/CAD problems cannot be healed safely -> RequiresHumanInteraction.
/// Locale-resilient: elements identified via ElementType names
/// (Compat.RuleTargetName) and CategoryType/BuiltInCategory, never localized
/// display names. Runs on the EventHub (EditFamily is illegal inside an open
/// transaction — the hub guarantees a clean API context).
/// </summary>
public static class FamilyProcessor
{
    public enum HealResult { Clean, Healed, RequiresHumanInteraction, Failed }

    public sealed class FamilyVerdict
    {
        public string TypeName { get; set; } = string.Empty;   // locale-safe identifier
        public string FamilyName { get; set; } = string.Empty; // display only
        public HealResult Result { get; set; }
        public List<string> Notes { get; } = new List<string>();
    }

    /// <summary>Scan every editable, user-loadable model family in the active
    /// document; heal what is safely healable. Callback gets the full report.</summary>
    public static void ScanLoaded(Action<List<FamilyVerdict>> onDone)
    {
        App.Events?.Enqueue(uiapp =>
        {
            var doc = uiapp.ActiveUIDocument?.Document;
            var verdicts = new List<FamilyVerdict>();
            if (doc is null) { onDone(verdicts); return; }

            var families = new FilteredElementCollector(doc).OfClass(typeof(Family))
                .Cast<Family>()
                .Where(f => f.IsEditable && !f.IsInPlace
                            && f.FamilyCategory is { CategoryType: CategoryType.Model })
                .ToList();

            foreach (var family in families)
            {
                // Locale-safe identity: first type name, not the family display name.
                var firstTypeId = family.GetFamilySymbolIds().FirstOrDefault();
                var typeName = firstTypeId is not null && doc.GetElement(firstTypeId) is ElementType et
                    ? et.RuleTargetName() : family.Name;
                var verdict = new FamilyVerdict { TypeName = typeName, FamilyName = family.Name };

                Document? famDoc = null;
                try
                {
                    famDoc = doc.EditFamily(family);
                    var report = new FamilySanitizer.SanitationReport();
                    FamilySanitizer.Scan(famDoc, report);

                    bool geometryProblem = report.SolidCount > FamilySanitizer.MaxSolids
                                           || report.NestedCadImports > 0;
                    if (geometryProblem)
                    {
                        // Human Interaction Trap: geometry / CAD / reference fixes
                        // must never be automated.
                        verdict.Result = HealResult.RequiresHumanInteraction;
                        verdict.Notes.AddRange(report.Issues);
                    }
                    else if (report.MissingSharedParams.Count > 0)
                    {
                        InjectSharedParameters(uiapp.Application, famDoc, report.MissingSharedParams, verdict);
                        famDoc.LoadFamily(doc, new SilentOverwrite());
                        verdict.Result = HealResult.Healed;
                        verdict.Notes.Add("Injected: " + string.Join(", ", report.MissingSharedParams));
                        Engine.RoiTracker.Log("family", typeName + " auto-healed (" +
                            report.MissingSharedParams.Count + " shared param(s))");
                    }
                    else
                    {
                        verdict.Result = HealResult.Clean;
                    }
                }
                catch (Autodesk.Revit.Exceptions.ApplicationException ex)
                {
                    verdict.Result = HealResult.Failed;
                    verdict.Notes.Add(ex.Message);
                }
                finally
                {
                    famDoc?.Close(false);
                }
                verdicts.Add(verdict);
            }
            onDone(verdicts);
        });
    }

    private static void InjectSharedParameters(
        Autodesk.Revit.ApplicationServices.Application app,
        Document famDoc, List<string> missing, FamilyVerdict verdict)
    {
        var originalSp = app.SharedParametersFilename;
        var tempSp = Path.Combine(Path.GetTempPath(), "Sentinel_SP.txt");
        try
        {
            if (!File.Exists(tempSp)) File.WriteAllText(tempSp, "");
            app.SharedParametersFilename = tempSp;
            var spFile = app.OpenSharedParameterFile();
            var group = spFile.Groups.get_Item("Sentinel") ?? spFile.Groups.Create("Sentinel");

            using var t = new Transaction(famDoc, "Sentinel: Inject shared parameters");
            t.Start();
            foreach (var name in missing)
            {
                var def = group.Definitions.get_Item(name)
                    ?? group.Definitions.Create(new ExternalDefinitionCreationOptions(name,
#if REVIT2022_OR_GREATER
                        SpecTypeId.String.Text
#else
                        ParameterType.Text
#endif
                    ));
                famDoc.FamilyManager.AddParameter((ExternalDefinition)def,
#if REVIT2024_OR_GREATER
                    GroupTypeId.IdentityData,
#else
                    BuiltInParameterGroup.PG_IDENTITY_DATA,
#endif
                    isInstance: false);
            }
            t.Commit();
        }
        finally
        {
            app.SharedParametersFilename = originalSp;
        }
    }

    private sealed class SilentOverwrite : IFamilyLoadOptions
    {
        public bool OnFamilyFound(bool familyInUse, out bool overwriteParameterValues)
        { overwriteParameterValues = false; return true; }   // keep user values
        public bool OnSharedFamilyFound(Family sharedFamily, bool familyInUse,
            out FamilySource source, out bool overwriteParameterValues)
        { source = FamilySource.Family; overwriteParameterValues = false; return true; }
    }
}
