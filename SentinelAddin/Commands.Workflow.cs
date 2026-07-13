using System.IO;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Workflow;

namespace Sentinel.Commands;

/// <summary>Opens the coordinator review window for pending change requests.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class ShowRequestsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;
        var win = new Sentinel.UI.RequestsWindow(doc, RequestManager.IsCoordinator(doc));
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}

/// <summary>Project Setup: dual-layer settings dialog (paths + save scope).</summary>
[Transaction(TransactionMode.Manual)]
public sealed class ProjectSetupCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var win = new Sentinel.UI.SettingsDialog(c.Application.ActiveUIDocument?.Document);
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.ShowDialog();
        return Result.Succeeded;
    }
}

/// <summary>
/// One-time project setup (Decision 7): creates the ZZZ_ReviewStatus text
/// parameter on Views / Sheets / Levels / Grids so pending changes are
/// visible in the Project Browser via a Browser Organization scheme
/// (grouping by ZZZ_ReviewStatus — created manually once in the template,
/// since Revit's API cannot create browser schemes).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class SetupWorkflowCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uiapp = c.Application;
        var doc = uiapp.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        if (!RequestManager.IsCoordinator(doc))
        {
            TaskDialog.Show("Sentinel", "Only a BIM Coordinator can run project setup.");
            return Result.Cancelled;
        }

        // Already bound?
        var existing = new FilteredElementCollector(doc)
            .OfClass(typeof(ParameterElement)).Cast<ParameterElement>()
            .Any(p => p.Name == RequestManager.ReviewStatusParam);
        if (existing)
        {
            TaskDialog.Show("Sentinel", $"'{RequestManager.ReviewStatusParam}' already exists in this project.");
            return Result.Succeeded;
        }

        var app = uiapp.Application;
        var originalSpFile = app.SharedParametersFilename;
        var tempSp = Path.Combine(Path.GetTempPath(), "Sentinel_SP.txt");
        try
        {
            if (!File.Exists(tempSp)) File.WriteAllText(tempSp, "");
            app.SharedParametersFilename = tempSp;
            var spFile = app.OpenSharedParameterFile();
            var group = spFile.Groups.get_Item("Sentinel") ?? spFile.Groups.Create("Sentinel");

            var definition = group.Definitions.get_Item(RequestManager.ReviewStatusParam)
                ?? group.Definitions.Create(new ExternalDefinitionCreationOptions(
                       RequestManager.ReviewStatusParam,
#if REVIT2022_OR_GREATER
                       SpecTypeId.String.Text
#else
                       ParameterType.Text
#endif
                   ) { UserModifiable = false, Description = "Sentinel change-request flag. Do not edit manually." });

            var cats = app.Create.NewCategorySet();
            cats.Insert(doc.Settings.Categories.get_Item(BuiltInCategory.OST_Views));
            cats.Insert(doc.Settings.Categories.get_Item(BuiltInCategory.OST_Sheets));
            cats.Insert(doc.Settings.Categories.get_Item(BuiltInCategory.OST_Levels));
            cats.Insert(doc.Settings.Categories.get_Item(BuiltInCategory.OST_Grids));

            using var t = new Transaction(doc, "Sentinel: Setup workflow parameter");
            t.Start();
            var binding = app.Create.NewInstanceBinding(cats);
            doc.ParameterBindings.Insert(definition, binding,
#if REVIT2024_OR_GREATER
                GroupTypeId.IdentityData
#else
                BuiltInParameterGroup.PG_IDENTITY_DATA
#endif
            );
            t.Commit();

            TaskDialog.Show("Sentinel",
                $"'{RequestManager.ReviewStatusParam}' created and bound to Views, Sheets, Levels and Grids.\n\n" +
                "Final manual step (one time, API cannot do this):\n" +
                "View tab → User Interface → Browser Organization → New scheme grouping " +
                $"by '{RequestManager.ReviewStatusParam}' — pending items will then surface " +
                "in their own Project Browser group.");
            return Result.Succeeded;
        }
        finally
        {
            app.SharedParametersFilename = originalSpFile;
        }
    }
}
