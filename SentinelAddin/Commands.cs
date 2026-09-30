using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

[Transaction(TransactionMode.Manual)]
public sealed class ShowPanelCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        c.Application.GetDockablePane(App.PaneId).Show();
        return Result.Succeeded;
    }
}

[Transaction(TransactionMode.Manual)]
public sealed class ScanNowCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null || App.Engine is null || App.PanelVm is null) return Result.Cancelled;
        if (doc.IsFamilyDocument)
        {
            TaskDialog.Show("Sentinel — Scan Now", "A family document is not scanned — only project documents are judged by their project's ruleset.");
            return Result.Cancelled;
        }
        // Re-resolve the document's ruleset@n first (an unchanged one is a cheap 304), then scan by it: the
        // scan and the strip land on the API thread once the GET returns.
        App.ReloadRuleset(doc);
        c.Application.GetDockablePane(App.PaneId).Show();
        return Result.Succeeded;
    }
}

[Transaction(TransactionMode.Manual)]
public sealed class IfcPreFlightCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null || App.PanelVm is null) return Result.Cancelled;
        // IFC-02 checks what the delivery contract in force requires (project → office → none), fetched off Revit's
        // thread and waited for, as the IFC Delivery Gate does (PRE-E2).
        var key = Sentinel.Engine.ProjectContext.For(doc).Key;
        var (contract, contractSource) = System.Threading.Tasks.Task.Run(() => Sentinel.Engine.DeliveryContract.Load(key)).GetAwaiter().GetResult();
        var report = Sentinel.Engine.IfcPreFlightScanner.Scan(doc, contract, contractSource.Label);

        if (report.ElementsChecked == 0)
        {
            // Templates / empty models: nothing placed in exportable categories.
            TaskDialog.Show("Sentinel — IFC Pre-Flight",
                "No placed model elements found in IFC-exportable categories " +
                "(walls, floors, doors, windows, structure, ...).\n\n" +
                "This is expected on an empty template. Run the pre-flight on a " +
                "populated project model before exporting IFC.");
            return Result.Succeeded;
        }

        c.Application.GetDockablePane(App.PaneId).Show(); // show first: Show() may rebuild the pane
        App.PanelVm.PublishReport(doc, report);

        // "Not checked" notes (ElementId -1) are not issues: they are listed apart, never counted as found or as clean.
        int notChecked = report.Violations.Count(v => v.ElementId < 0);
        int issues = report.Violations.Count - notChecked;
        var notCheckedLine = notChecked == 0 ? "" : $"\n\n{notChecked} requirement(s) not checked here (listed in the panel) — the delivery gate checks them in the IFC.";
        TaskDialog.Show("Sentinel — IFC Pre-Flight",
            issues == 0
                ? $"✓ No IFC issues found against {contractSource.Label}.\n\n{report.ElementsChecked} elements checked in {report.DurationMs} ms.{notCheckedLine}"
                : $"{issues} issue(s) found across {report.ElementsChecked} elements " +
                  $"({report.DurationMs} ms).\n\nDetails are listed in the Sentinel panel (rules IFC-01 / IFC-02).{notCheckedLine}");
        return Result.Succeeded;
    }
}

[Transaction(TransactionMode.Manual)]
public sealed class ScorecardCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null || App.Engine is null) return Result.Cancelled;
        var card = Sentinel.Engine.HealthScorecard.Build(App.Engine.ScanFull(doc));
        TaskDialog.Show("Sentinel — Health Scorecard",
            "Judged by " + App.Engine.SourceFor(doc).Label + "\n\n" + Sentinel.Engine.HealthScorecard.Render(card));
        return Result.Succeeded;
    }
}

[Transaction(TransactionMode.Manual)]
public sealed class ShowRulesetCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null || App.Engine is null)
        {
            TaskDialog.Show("Sentinel", "Open a project document first — each document is judged by its own project's ruleset.");
            return Result.Cancelled;
        }
        var win = new Sentinel.UI.RulesetWindow(App.Engine.RulesetFor(doc), App.Engine.SourceFor(doc), doc.Title);
        // Parent to Revit's main window so it stays on top of Revit only
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}
