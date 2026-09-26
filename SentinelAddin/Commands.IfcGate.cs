using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>
/// KF-1: IFC Delivery Gate. Exports the active 3D view to IFC in the schema the contract asks for, then re-parses the
/// produced file against the delivery contract installed on the document's web project or its office
/// (contract@n · source · sha). It issues a PASS / FAIL certificate; a FAIL means the file should not be uploaded to
/// the CDE. With no contract (none installed, or the document is unbound), nothing is judged: the certificate says
/// NOT_CHECKED, never PASS. Also usable on an existing IFC (skip export).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class IfcDeliveryGateCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        var doc = uidoc?.Document;
        if (uidoc is null || doc is null) return Result.Cancelled;
        var targetDocPath = doc.PathName;
        var targetTitle = doc.Title;
        var projectKey = Sentinel.Engine.ProjectContext.For(doc).Key; // empty when unbound: certify locally, record nothing
        // The contract in force for this document's project (project → office → none). The key is read here, on the
        // API thread; the fetch runs OFF it and the command waits, as Governed Publish waits on /propose (the client
        // caps it). An unbound document resolves to none without a request.
        var (contract, contractSource) = Task.Run(() => Sentinel.Engine.DeliveryContract.Load(projectKey)).GetAwaiter().GetResult();
        var schema = contract?.IfcSchema ?? "IFC2X3"; // no contract: export IFC 2x3 as before and judge nothing

        var choice = new TaskDialog("Sentinel — IFC Delivery Gate")
        {
            MainInstruction = "Certify an IFC deliverable",
            MainContent = Sentinel.Engine.GateLines.Intro(contract?.IfcSchema, contractSource.Label),
            CommonButtons = TaskDialogCommonButtons.Cancel,
        };
        choice.AddCommandLink(TaskDialogCommandLinkId.CommandLink1,
            "Export active view to IFC, then certify",
            "Runs the exporter with current project setup, validates the result.");
        choice.AddCommandLink(TaskDialogCommandLinkId.CommandLink2,
            "Certify an existing IFC file",
            "Validate a file already exported (any source).");
        var pick = choice.Show();
        if (pick != TaskDialogResult.CommandLink1 && pick != TaskDialogResult.CommandLink2)
            return Result.Cancelled;

        string? ifcPath = null;

        if (pick == TaskDialogResult.CommandLink2)
        {
            var open = new Microsoft.Win32.OpenFileDialog
            { Title = "Select IFC file", Filter = "IFC files (*.ifc)|*.ifc", CheckFileExists = true };
            if (Sentinel.UI.DialogOwner.ShowFileDialog(open, c.Application) != true) return Result.Cancelled;
            ifcPath = open.FileName;
            Certify(ifcPath, contract, contractSource, projectKey);
            return Result.Succeeded;
        }

        // Export path: needs a 3D view + save location.
        if (doc.ActiveView is not View3D view3d)
        {
            TaskDialog.Show("Sentinel — IFC Delivery Gate",
                "Open a 3D view first — the exporter certifies what that view shows.");
            return Result.Cancelled;
        }
        var save = new Microsoft.Win32.SaveFileDialog
        {
            Title = "Export IFC deliverable",
            Filter = (string.Equals(schema, "IFC4", StringComparison.OrdinalIgnoreCase) ? "IFC4" : "IFC 2x3") + " (*.ifc)|*.ifc",
            FileName = Path.GetFileNameWithoutExtension(doc.Title) + ".ifc",
        };
        if (Sentinel.UI.DialogOwner.ShowFileDialog(save, c.Application) != true) return Result.Cancelled;
        ifcPath = save.FileName;
        var targetViewId = view3d.Id;

        App.Events?.Enqueue(uiapp =>
        {
            // Pin to the document/view captured at command time — the handler runs deferred on the
            // ExternalEvent queue, and by then focus may have moved to a different open document
            // (observed live: gate invoked on Project1, ran against a different doc). Never operate
            // on whichever document merely has focus at event time.
            var d = uiapp.Application.Documents.Cast<Document>().FirstOrDefault(x =>
                (!string.IsNullOrEmpty(targetDocPath) && x.PathName == targetDocPath) || x.Title == targetTitle);
            if (d is null)
            {
                TaskDialog.Show("Sentinel — IFC Delivery Gate",
                    "The document this gate was started from is no longer active — nothing was exported.");
                return;
            }
            // The shared export primitive: the contract's schema (IFC4 → IFC4 Reference View, else IFC 2x3 CV2), the
            // view filter, base quantities and the transaction wrapper. It never throws.
            var (state, exported, _, error) = Sentinel.Engine.PlatformExporter.ExportToDir(
                d, targetViewId, Path.GetDirectoryName(ifcPath!)!, Path.GetFileName(ifcPath!), schema);
            if (state != Sentinel.Engine.PlatformExporter.State.Ok)
            {
                TaskDialog.Show("Sentinel — IFC Delivery Gate",
                    state == Sentinel.Engine.PlatformExporter.State.MissingOrEmpty
                        ? "IFC export contained no geometry — nothing to certify. Check the view and mappings."
                        : "Export failed: " + (error ?? state.ToString()));
                return;
            }
            try { Certify(exported, contract, contractSource, projectKey); }
            catch (Exception ex) { TaskDialog.Show("Sentinel — IFC Delivery Gate", "Certification failed: " + ex.Message); }
        });
        return Result.Succeeded;
    }

    private static void Certify(string ifcPath, Sentinel.Engine.DeliveryContract? contract,
                                Sentinel.Coordination.ResolvedArtefact contractSource, string projectKey)
    {
        // No contract → NOT CHECKED: the file's sha and schema are recorded, nothing is judged, never a PASS.
        var r = Sentinel.Engine.IfcDeliveryGate.Validate(ifcPath, contract, contractSource);
        // Record the gate verdict and the contract that judged on the document's web project ledger and wait for the
        // answer OFF this thread (≤ 6 s) — both callers are API contexts: the command body and the export's event job.
        // The dialog ends with what the ledger answered: "Recorded: ledger #<id> · receipt <16 hex>…", not confirmed,
        // not recorded, or — unbound — nothing sent.
        var ledger = Task.Run(() => Sentinel.Coordination.GovernedNotify.DeliveryGate(Path.GetFileName(ifcPath), r, projectKey)).GetAwaiter().GetResult();
        TaskDialog.Show("Sentinel — IFC Delivery Gate",
            Sentinel.Engine.GateLines.GateDialog(r, projectKey) + "\n\n" + Sentinel.Coordination.LedgerLine.Sentence(ledger));
    }
}
