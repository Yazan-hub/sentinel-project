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
        App.PanelVm.PublishReport(App.Engine.ScanFull(doc));
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
        var report = Sentinel.Engine.IfcPreFlightScanner.Scan(doc);

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
        App.PanelVm.PublishReport(report);

        TaskDialog.Show("Sentinel — IFC Pre-Flight",
            report.Violations.Count == 0
                ? $"✓ Ready to export.\n\n{report.ElementsChecked} elements checked in {report.DurationMs} ms — no IFC issues."
                : $"{report.Violations.Count} issue(s) found across {report.ElementsChecked} elements " +
                  $"({report.DurationMs} ms).\n\nDetails are listed in the Sentinel panel (rules IFC-01 / IFC-02).");
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
            Sentinel.Engine.HealthScorecard.Render(card));
        return Result.Succeeded;
    }
}

[Transaction(TransactionMode.Manual)]
public sealed class ShowRulesetCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var rs = App.Engine?.Ruleset;
        if (rs is null)
        {
            TaskDialog.Show("Sentinel", "No ruleset loaded.");
            return Result.Cancelled;
        }
        var win = new Sentinel.UI.RulesetWindow(rs);
        // Parent to Revit's main window so it stays on top of Revit only
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}
