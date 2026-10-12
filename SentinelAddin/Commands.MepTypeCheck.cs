using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Commands;

/// <summary>
/// MA-8-8 MEP Type Check: every duct, pipe, cable tray and conduit of this model (not its links) judged against the type_catalog
/// installed on its web project or office — the type, and for ducts and pipes the system type. READ ONLY: nothing in the model changes,
/// no retype, no size check (the office has no size list, D15). One mep_check ledger row per check; an optional BCF topic file.
/// </summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class MepTypeCheckCommand : IExternalCommand
{
    private const string Title = "Sentinel — MEP Type Check";

    // The English category the catalogue uses, from the BuiltInCategory — never the category display name (it follows the Revit language).
    private static string? CategoryOf(BuiltInCategory bic) => bic switch
    {
        BuiltInCategory.OST_DuctCurves => "Ducts",
        BuiltInCategory.OST_PipeCurves => "Pipes",
        BuiltInCategory.OST_CableTray => "Cable Trays",
        BuiltInCategory.OST_Conduit => "Conduits",
        _ => null,
    };

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null || doc.IsFamilyDocument) return Result.Cancelled;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { TaskDialog.Show(Title, ProjectContext.NotBound); return Result.Cancelled; }
        string key = ctx.Key;

        // The catalogue off Revit's thread (Annotate's way): the command waits, 20 s at most.
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false, guideline: false, catalog: true)).GetAwaiter().GetResult();
        string none = MepTypeCheck.NoCatalog(standards.Guideline);
        if (none != null) { TaskDialog.Show(Title, none); return Result.Cancelled; }

        var facts = new List<MepFact>();
        foreach (var bic in MepVoidManager.MepCats)
            foreach (var e in new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsNotElementType())
            {
                var type = doc.GetElement(e.GetTypeId()) as ElementType;
                if (type is null) continue;
                var f = new MepFact { Id = e.Id.IdValue(), Category = CategoryOf(bic), Family = type.FamilyName, Type = type.Name };
                var sp = bic == BuiltInCategory.OST_DuctCurves ? e.get_Parameter(BuiltInParameter.RBS_DUCT_SYSTEM_TYPE_PARAM)
                       : bic == BuiltInCategory.OST_PipeCurves ? e.get_Parameter(BuiltInParameter.RBS_PIPING_SYSTEM_TYPE_PARAM) : null;
                if (sp != null)
                {
                    f.SystemRead = true;
                    var st = doc.GetElement(sp.AsElementId()) as ElementType;   // invalid id -> null -> "no system"
                    f.System = st?.Name;
                    f.SystemFamily = st?.FamilyName;
                }
                facts.Add(f);
            }

        var report = MepTypeCheck.Run(facts, standards.Guideline);
        string label = standards.CatalogSource.Label;
        GovernedNotify.Report("MEP type check", CommandReports.MepCheck(report, label, UserSession.Actor), key);

        var dlg = new TaskDialog(Title)
        {
            MainInstruction = report.Checked == 0
                ? "No ducts, pipes, cable trays or conduits in this model."
                : $"{report.Checked} MEP element(s) checked against {label}: {report.Matched} matched · {report.TypeNotOffice} type not the office's · {report.SystemNotOffice} system not the office's · {report.NoSystem} with no system",
            MainContent = string.Join("\n", report.Lines().Concat(report.Findings.Take(12).Select(MepTypeCheck.Line)))
                + "\n\nRead only — nothing in the model changed. Sizes are not checked: the office has no size list (D15). Links are not read. "
                + "Sent to the ledger as one mep_check row (the pane's Doctor log says whether it landed).",
            CommonButtons = TaskDialogCommonButtons.Close,
        };
        if (report.Unmatched > 0)
            dlg.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Export a BCF topic…", "A .bcfzip of the unmatched elements; nothing is raised on the web.");
        if (dlg.Show() == TaskDialogResult.CommandLink1) ExportBcf(c.Application, doc, report);
        return Result.Succeeded;
    }

    private static void ExportBcf(UIApplication uiapp, Document doc, MepReport report)
    {
        var folderDlg = new Microsoft.Win32.SaveFileDialog
        {
            Title = "Choose BCF output folder (file name is auto-generated)",
            FileName = "SelectFolder",
            Filter = "Folder selection|*.this",
        };
        if (Sentinel.UI.DialogOwner.ShowFileDialog(folderDlg, uiapp) != true) return;
        var outDir = Path.GetDirectoryName(folderDlg.FileName)!;
        App.Events?.Enqueue(doc, "export the BCF", (evtApp, doc2) =>
        {
            var issue = new BcfExporter.BcfIssue
            {
                Title = $"MEP types not the office's ({report.Unmatched})",
                Type = "Issue",
                Author = UserSession.Actor,
                Description = string.Join("\n", report.Findings.Take(20).Select(MepTypeCheck.Line)),
            };
            foreach (var id in report.Findings.SelectMany(f => f.Ids).Take(100)) issue.Components.Add(id.ToElementId());
            try
            {
                var file = BcfExporter.Export(evtApp, issue, outDir);
                TaskDialog.Show("Sentinel — BCF Export", "✓ Exported:\n" + file);
            }
            catch (Exception ex) { TaskDialog.Show("Sentinel — BCF Export", "Export failed: " + ex.Message); }
        });
    }
}
