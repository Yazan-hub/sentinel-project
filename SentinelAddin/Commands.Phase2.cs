using System.IO;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>Sanitize + load an .rfa through the family gateway.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class SanitizeFamilyCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Select family to sanitize and load",
            Filter = "Revit family (*.rfa)|*.rfa",
            CheckFileExists = true,
        };
        if (Sentinel.UI.DialogOwner.ShowFileDialog(dlg, c.Application) != true) return Result.Cancelled;

        Workflow.FamilySanitizer.ScanAndLoad(dlg.FileName, (report, loaded) =>
        {
            var td = new TaskDialog("Sentinel — Family Sanitation")
            {
                MainInstruction = report.Passed
                    ? (loaded ? "✓ Family passed and was loaded" : "✓ Family passed (no target document to load into)")
                    : "✕ Family failed sanitation — NOT loaded",
                MainContent =
                    Path.GetFileName(report.FamilyPath) + "\n" +
                    "Solids: " + report.SolidCount + " (budget " + Workflow.FamilySanitizer.MaxSolids + ")\n" +
                    "Nested CAD imports: " + report.NestedCadImports + "\n" +
                    (report.Issues.Count > 0 ? "\nIssues:\n• " + string.Join("\n• ", report.Issues) : ""),
                CommonButtons = TaskDialogCommonButtons.Close,
            };
            td.Show();
        });
        return Result.Succeeded;
    }
}

/// <summary>Executive ROI dashboard.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class RoiDashboardCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var win = new Sentinel.UI.RoiDashboard();
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}

/// <summary>Scan linked MEP vs native structure; offer to place voids.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class MepVoidsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        // Lifecycle pass: reconcile existing tracked voids against the current
        // IFC drop (relocate moved, orphan deleted), then handle new candidates.
        Sentinel.Engine.MepVoidManager.Reconcile(report => HandleReport(report, c.Application));
        return Result.Succeeded;
    }

    private static void HandleReport(Sentinel.Engine.MepVoidManager.ReconcileReport report, Autodesk.Revit.UI.UIApplication uiapp)
    {
        var candidates = report.NewCandidates;
        if (candidates.Count == 0 && report.Updated + report.Orphaned == 0)
        {
            TaskDialog.Show("Sentinel — MEP Openings",
                "No intersections found between linked MEP/IFC elements and native structure.\n\n" +
                "Check that the IFC/MEP links are loaded.");
            return;
        }

        var confirm = new TaskDialog("Sentinel — MEP Openings")
        {
            MainInstruction = candidates.Count + " new void candidate(s) after 150 mm merge",
            MainContent = "IFC iteration: " + report.Updated + " existing void(s) relocated, " +
                          report.Orphaned + " orphaned, " + report.Unchanged + " unchanged.\n\n" +
                          "Void placement requires a Generic Model family with 'Void' or " +
                          "'Provision' in its name loaded in the project.",
            CommonButtons = TaskDialogCommonButtons.Cancel,
        };
        confirm.AddCommandLink(TaskDialogCommandLinkId.CommandLink1,
            "Place tracked provision-for-void families",
            "One instance per merged candidate, with BDS_Void_ID + BDS_Void_Status = Pending.");
        confirm.AddCommandLink(TaskDialogCommandLinkId.CommandLink2,
            "Export to BCF (send to MEP engineers)",
            "Isolates the affected hosts, captures camera + snapshot, writes a .bcfzip.");
        var choice = confirm.Show();

        if (choice == TaskDialogResult.CommandLink1)
        {
            Sentinel.Engine.MepVoidManager.PlaceVoids(candidates, (placed, failed) =>
                TaskDialog.Show("Sentinel — MEP Openings",
                    placed + " tracked void(s) placed" + (failed > 0 ? ", " + failed + " skipped (no symbol or bad point)." : ".")));
            return;
        }

        if (choice == TaskDialogResult.CommandLink2)
        {
            var folderDlg = new Microsoft.Win32.SaveFileDialog
            {
                Title = "Choose BCF output folder (file name is auto-generated)",
                FileName = "SelectFolder",
                Filter = "Folder selection|*.this",
            };
            if (Sentinel.UI.DialogOwner.ShowFileDialog(folderDlg, uiapp) != true) return;
            var outDir = Path.GetDirectoryName(folderDlg.FileName)!;

            // Export ONE topic per host element group (host-side ids only —
            // linked MEP element ids are not addressable in the host doc).
            App.Events?.Enqueue(evtApp =>
            {
                var doc2 = evtApp.ActiveUIDocument?.Document;
                if (doc2 is null) return;
                var issue = new Sentinel.Engine.BcfExporter.BcfIssue
                {
                    Title = "Provision for void required (" + candidates.Count + " candidates)",
                    Type = "Request",
                    Status = "Active",
                    Author = doc2.Application.Username,
                    Description = string.Join("\n", candidates.Take(20).Select(cd =>
                        cd.MepDescription + " (" + cd.LinkName + ") vs " + cd.HostName)),
                };
                foreach (var hostId in candidates.Select(cd => cd.HostId).Distinct().Take(100))
                    issue.Components.Add(hostId.ToElementId());
                try
                {
                    var file = Sentinel.Engine.BcfExporter.Export(uiapp, issue, outDir);
                    TaskDialog.Show("Sentinel — BCF Export", "✓ Exported:\n" + file +
                        "\n\nOpen in BIMcollab/Solibri/Navisworks or send to the MEP team.");
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("Sentinel — BCF Export", "Export failed: " + ex.Message);
                }
            });
        }
    }
}

/// <summary>Native clash detection: run engine, open the Clash Manager UI.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class ClashManagerCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        var clashes = Sentinel.Engine.ClashManager.Run(doc);
        if (clashes.Count == 0)
        {
            TaskDialog.Show("Sentinel — Clash Manager",
                "No clashes found between linked MEP/IFC elements and native structure.");
            return Result.Succeeded;
        }
        var win = new Sentinel.UI.ClashManagerDialog(clashes);
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}

/// <summary>Retroactive scan + auto-heal of families already in the project.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class SanitizeLoadedCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is null) return Result.Cancelled;

        Workflow.FamilyProcessor.ScanLoaded(verdicts =>
        {
            int healed = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.Healed);
            int human = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.RequiresHumanInteraction);
            int clean = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.Clean);
            int failed = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.Failed);

            var needsHuman = verdicts
                .Where(v => v.Result == Workflow.FamilyProcessor.HealResult.RequiresHumanInteraction)
                .Take(12)
                .Select(v => "• " + v.TypeName + ": " + string.Join("; ", v.Notes.Take(2)));

            TaskDialog.Show("Sentinel — Family Auto-Heal",
                verdicts.Count + " families scanned\n" +
                "✓ Clean: " + clean + "\n" +
                "⚡ Auto-healed (shared params injected + reloaded): " + healed + "\n" +
                "⚠ Requires human interaction (geometry/CAD): " + human + "\n" +
                "✕ Failed: " + failed +
                (human > 0 ? "\n\nManual attention needed:\n" + string.Join("\n", needsHuman) : ""));
        });
        return Result.Succeeded;
    }
}
