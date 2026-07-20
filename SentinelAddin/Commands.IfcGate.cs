using System.IO;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>
/// KF-1: IFC Delivery Gate. Exports the active 3D view to IFC, immediately
/// re-parses the produced file against the delivery contract, and issues a
/// signed pass/fail certificate. A FAIL means the file should not be uploaded
/// to the CDE. Also usable on an existing IFC (skip export).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class IfcDeliveryGateCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        var doc = uidoc?.Document;
        if (uidoc is null || doc is null) return Result.Cancelled;

        var choice = new TaskDialog("Sentinel — IFC Delivery Gate")
        {
            MainInstruction = "Certify an IFC deliverable",
            MainContent = "Contract: " + Sentinel.Engine.DeliveryContract.DefaultPath,
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

        var contract = Sentinel.Engine.DeliveryContract.LoadOrDefault();
        string? ifcPath = null;

        if (pick == TaskDialogResult.CommandLink2)
        {
            var open = new Microsoft.Win32.OpenFileDialog
            { Title = "Select IFC file", Filter = "IFC files (*.ifc)|*.ifc", CheckFileExists = true };
            if (open.ShowDialog() != true) return Result.Cancelled;
            ifcPath = open.FileName;
            Certify(ifcPath, contract);
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
            Filter = "IFC 2x3 (*.ifc)|*.ifc",
            FileName = Path.GetFileNameWithoutExtension(doc.Title) + ".ifc",
        };
        if (save.ShowDialog() != true) return Result.Cancelled;
        ifcPath = save.FileName;

        App.Events?.Enqueue(uiapp =>
        {
            var d = uiapp.ActiveUIDocument?.Document;
            if (d is null) return;
            try
            {
                var opts = new IFCExportOptions
                {
                    FileVersion = contract.IfcSchema.StartsWith("IFC4", StringComparison.OrdinalIgnoreCase)
                        ? IFCVersion.IFC4 : IFCVersion.IFC2x3CV2,
                    FilterViewId = d.ActiveView.Id,
                    ExportBaseQuantities = true,
                };
                using var t = new Transaction(d, "Sentinel: IFC export (gated)");
                t.Start();  // Revit requires a transaction wrapper for Export IFC in some versions
                d.Export(Path.GetDirectoryName(ifcPath)!, Path.GetFileName(ifcPath), opts);
                t.Commit();

                Certify(ifcPath!, contract);
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Sentinel — IFC Delivery Gate", "Export failed: " + ex.Message);
            }
        });
        return Result.Succeeded;
    }

    private static void Certify(string ifcPath, Sentinel.Engine.DeliveryContract contract)
    {
        var r = Sentinel.Engine.IfcDeliveryGate.Validate(ifcPath, contract);
        // Record the gate verdict in the web app's governed audit trail (fire-and-forget, never blocks).
        Sentinel.Coordination.GovernedNotify.DeliveryGate(
            Path.GetFileName(ifcPath), r.Passed, r.ContractKey, r.DetectedSchema,
            r.TotalEntities, r.Failures.Count, r.FileSha256);
        var top = r.EntityCounts.OrderByDescending(kv => kv.Value).Take(6)
            .Select(kv => kv.Key + ": " + kv.Value);

        TaskDialog.Show("Sentinel — IFC Delivery Gate",
            (r.Passed ? "✓ PASS — certified for CDE upload"
                      : "✕ FAIL — DO NOT upload this file") + "\n\n" +
            "Contract: " + r.ContractKey + " · Schema: " + r.DetectedSchema + "\n" +
            "Entities: " + r.TotalEntities + " (" + (r.FileSizeBytes / 1048576.0).ToString("F1") + " MB)\n" +
            string.Join("\n", top) + "\n\n" +
            (r.Failures.Count > 0 ? "FAILURES:\n• " + string.Join("\n• ", r.Failures) + "\n\n" : "") +
            (r.Warnings.Count > 0 ? "Warnings:\n• " + string.Join("\n• ", r.Warnings) + "\n\n" : "") +
            "Certificate: " + r.CertificatePath + "\nSHA-256: " + r.FileSha256.Substring(0, 16) + "…");
    }
}
