#nullable disable
// MA-1a item 4: read one element's Sentinel provenance stamp in words (ProvenanceStamp.Describe) — source, source file sha256,
// layer, rule, approver, ledger row, time; a stamp that came with a copy reads "copied, not placed by Sentinel". Reads only:
// no transaction, no network.
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using Sentinel.Engine;

namespace Sentinel.Commands;

[Transaction(TransactionMode.ReadOnly)]
public sealed class ProvenanceCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        var selected = uidoc.Selection.GetElementIds();
        Element e;
        if (selected.Count == 1) e = doc.GetElement(selected.First());
        else
        {
            try { e = doc.GetElement(uidoc.Selection.PickObject(ObjectType.Element, "Pick an element to read its Sentinel provenance stamp")); }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
        }
        if (e == null) return Result.Cancelled;
        TaskDialog.Show("Sentinel — Provenance",
            $"{e.Category?.Name ?? "Element"} {e.Id.IdValue()} — {e.Name}\n\n" + ProvenanceStamp.Describe(ProvenanceStamp.Read(e), e.UniqueId));
        return Result.Succeeded;
    }
}
