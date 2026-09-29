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

/// <summary>The ROI dashboard on the ledger (cohesion phase 5c): the active document's key is read here, on the API
/// thread; its ledger rows and its roi@n are read OFF it and waited for, as Governed Publish waits for its referee.
/// An unbound document reads nothing and the window says so.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class RoiDashboardCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var ctx = Sentinel.Engine.ProjectContext.For(c.Application.ActiveUIDocument?.Document);
        var lines = ctx.IsBound
            ? System.Threading.Tasks.Task.Run(() => Sentinel.UI.RoiDashboard.Read(ctx.Key)).GetAwaiter().GetResult()
            : Sentinel.Engine.RoiLines.NotBound();
        var win = new Sentinel.UI.RoiDashboard(lines);
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
        Sentinel.Engine.MepVoidManager.Reconcile(report => HandleReport(report, c.Application, doc));
        return Result.Succeeded;
    }

    private static void HandleReport(Sentinel.Engine.MepVoidManager.ReconcileReport report, Autodesk.Revit.UI.UIApplication uiapp, Document doc)
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
            Sentinel.Engine.MepVoidManager.TrackingConfigured(doc)
                ? "One instance per merged candidate, with " + Sentinel.Engine.MepVoidManager.PVoidId(doc) + " + " +
                  Sentinel.Engine.MepVoidManager.PVoidStatus(doc) + " = Pending."
                : "Unavailable: " + Sentinel.Engine.MepVoidManager.NoOrgMessage);
        confirm.AddCommandLink(TaskDialogCommandLinkId.CommandLink2,
            "Export to BCF (send to MEP engineers)",
            "Isolates the affected hosts, captures camera + snapshot, writes a .bcfzip.");
        var choice = confirm.Show();

        if (choice == TaskDialogResult.CommandLink1)
        {
            if (!Sentinel.Engine.MepVoidManager.TrackingConfigured(doc))
            {
                TaskDialog.Show("Sentinel — MEP Openings", Sentinel.Engine.MepVoidManager.NoOrgMessage);
                return;
            }
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
        // The data gate first (D-01): the same status the web clash panel shows, read for this document's key.
        var ctx = Sentinel.Engine.ProjectContext.For(doc);
        var fedLine = !ctx.IsBound
            ? "Federation Gate: not checked — " + Sentinel.Engine.ProjectContext.NotBound
            : Sentinel.Coordination.GovernedQuery.FederationStatus(ctx.Key) ?? "Federation Gate: bridge unreachable";
        if (clashes.Count == 0)
        {
            TaskDialog.Show("Sentinel — Clash Manager",
                "No clashes found between linked MEP/IFC elements and native structure.\n\n" + fedLine);
            return Result.Succeeded;
        }
        var win = new Sentinel.UI.ClashManagerDialog(doc, clashes, fedLine);
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}

/// <summary>Retroactive scan + auto-heal of families already in the project. Each run is one <c>family_heal</c> row
/// on the document's web project ledger (cohesion phase 4c; simulation F16). The document and its key are captured
/// here, on the API thread at command time: the heal runs later on the Events queue and must never heal, or record
/// against, whichever model has focus by then.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class SanitizeLoadedCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;
        var key = Sentinel.Engine.ProjectContext.For(doc).Key; // "" when unbound: Event sends nothing and says so

        Workflow.FamilyProcessor.ScanLoaded(doc, verdicts =>
        {
            List<string> Names(Workflow.FamilyProcessor.HealResult r) =>
                verdicts.Where(v => v.Result == r).Select(v => v.FamilyName).ToList();
            var healedNames = Names(Workflow.FamilyProcessor.HealResult.Healed);
            var humanNames = Names(Workflow.FamilyProcessor.HealResult.RequiresHumanInteraction);
            var failedNames = Names(Workflow.FamilyProcessor.HealResult.Failed);
            int healed = healedNames.Count, human = humanNames.Count, failed = failedNames.Count;
            int clean = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.Clean);

            var needsHuman = verdicts
                .Where(v => v.Result == Workflow.FamilyProcessor.HealResult.RequiresHumanInteraction)
                .Take(12)
                .Select(v => "• " + v.TypeName + ": " + string.Join("; ", v.Notes.Take(2)));

            // One ledger row per run, waited for (6 s cap) on this Events job. Event never touches the UI, so the
            // wait cannot deadlock; the report then says what the ledger recorded, or why that is not confirmed.
            var payload = Workflow.HealRecord.Payload(verdicts.Count, clean, healedNames, humanNames, failedNames, Environment.UserName);
            var ledger = System.Threading.Tasks.Task.Run(() => Sentinel.Coordination.GovernedNotify.Event("/audit", payload, key)).GetAwaiter().GetResult();
            var said = Sentinel.Coordination.LedgerLine.Sentence(ledger);

            TaskDialog.Show("Sentinel — Family Auto-Heal",
                verdicts.Count + " families scanned\n" +
                "✓ Clean: " + clean + "\n" +
                "⚡ Auto-healed (shared params injected + reloaded): " + healed + "\n" +
                "⚠ Requires human interaction (geometry/CAD): " + human + "\n" +
                "✕ Failed: " + failed +
                (human > 0 ? "\n\nManual attention needed:\n" + string.Join("\n", needsHuman) : "") +
                "\n\n" + said);
        });
        return Result.Succeeded;
    }
}
