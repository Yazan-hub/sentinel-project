using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.UI;
using Sentinel.Workflow;

namespace Sentinel.Commands;

/// <summary>Naming Manager: scan families/types against the Family/Type rules, review proposals, rename the
/// ticked rows. Scan + rename run on the event hub (API thread); the window only raises events.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class NamingManagerCommand : IExternalCommand
{
    private static bool _open;

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        if (_open) { TaskDialog.Show("Sentinel — Naming Manager", "The Naming Manager is already open."); return Result.Cancelled; }
        if (App.Engine is null || App.Events is null) { TaskDialog.Show("Sentinel — Naming Manager", "Sentinel's rule engine is not running — restart Revit."); return Result.Failed; }

        var rs = App.Engine.Ruleset;
        if (!rs.Rules.Any(r => r.Target is RuleTarget.Type or RuleTarget.Family))
        {
            TaskDialog.Show("Sentinel — Naming Manager", "The effective ruleset has no family or type naming rule (targets `family` / `type`). Add one to the ruleset first.");
            return Result.Succeeded;
        }
        if (rs.Rules.Any(r => RuleRegex.NeedsOrg(r)) && string.IsNullOrWhiteSpace(rs.Org))
            TaskDialog.Show("Sentinel — Naming Manager", "The ruleset has no office code (\"org\") — every ORG-bearing rule will read 'needs a human' until it is set.");

        var projectKey = ProjectContext.For(doc).Key; // empty when unbound: renames stay local, the audit row is not sent (Doctor log says so)
        var rows = NamingManagerService.BuildRows(doc, rs);           // read-only, on this command's API thread
        var window = new NamingManagerWindow(rows);
        DialogOwner.Attach(window, c);
        window.Closed += (_, _) => _open = false;

        window.RescanRequested += () =>
        {
            window.SetBusy(true);
            App.Events.Enqueue(ua =>
            {
                try
                {
                    var d = ua.ActiveUIDocument?.Document;
                    if (d == null || !d.Equals(doc)) { window.SetStatus("switch back to the model the Naming Manager was opened on — nothing was done"); window.SetBusy(false); return; }
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine!.Ruleset));
                    window.SetBusy(false);
                }
                catch (Exception ex) { window.SetStatus("Revit refused: " + ex.Message); window.SetBusy(false); }
            });
        };
        window.SelectRequested += row => App.Events.Enqueue(ua =>
        {
            try
            {
                var d = ua.ActiveUIDocument;
                if (d?.Document is not { } dd || !dd.Equals(doc)) { window.SetStatus("switch back to the model the Naming Manager was opened on — nothing was done"); window.SetBusy(false); return; }
                var typeIds = row.IsType
                    ? new HashSet<ElementId>(new[] { row.ElementId.ToElementId() })
                    : new HashSet<ElementId>((d.Document.GetElement(row.ElementId.ToElementId()) as Family)?.GetFamilySymbolIds() ?? Enumerable.Empty<ElementId>());
                var ids = new FilteredElementCollector(d.Document).WhereElementIsNotElementType().Where(e => typeIds.Contains(e.GetTypeId())).Select(e => e.Id).ToList();
                if (ids.Count == 0) { window.SetStatus("No instances of that type in the model."); return; }
                d.Selection.SetElementIds(ids); d.ShowElements(ids);
            }
            catch (Exception ex) { window.SetStatus("Revit refused: " + ex.Message); }
        });
        window.RenameRequested += ticked =>
        {
            window.SetBusy(true); window.SetStatus($"Renaming {ticked.Count} row(s)…");
            App.Events.Enqueue(ua =>
            {
                try
                {
                    var d = ua.ActiveUIDocument?.Document;
                    if (d == null || !d.Equals(doc)) { window.SetStatus("switch back to the model the Naming Manager was opened on — nothing was done"); window.SetBusy(false); return; }
                    var results = NamingManagerService.Apply(d, ticked, App.Engine!.Ruleset, projectKey);
                    var ok = results.Count(r => r.Ok);
                    var failed = results.Where(r => !r.Ok).Select(r => $"{r.Row.Current}: {r.Message}").ToList();
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine.Ruleset));
                    window.SetStatus($"Renamed {ok}/{results.Count}." + (failed.Count > 0 ? " Not renamed — " + string.Join(" · ", failed.Take(6)) + (failed.Count > 6 ? " · …" : "") : ""));
                    window.SetBusy(false);
                }
                catch (Exception ex) { window.SetStatus("Revit refused: " + ex.Message); window.SetBusy(false); }
            });
        };
        try { window.Show(); }
        catch { _open = false; throw; }
        _open = true;
        return Result.Succeeded;
    }
}
