using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
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

        var rs = App.Engine.RulesetFor(doc);
        if (!rs.Rules.Any(r => r.Target is RuleTarget.Type or RuleTarget.Family))
        {
            TaskDialog.Show("Sentinel — Naming Manager", $"This document's ruleset ({App.Engine.SourceFor(doc).Label}) has no family or type naming rule (targets `family` / `type`). Install a ruleset@n with one on the web project or its office first.");
            return Result.Succeeded;
        }
        if (rs.Rules.Any(r => RuleRegex.NeedsOrg(r)) && string.IsNullOrWhiteSpace(rs.Org))
            TaskDialog.Show("Sentinel — Naming Manager", "The ruleset has no office code (\"org\") — every ORG-bearing rule will read 'needs a human' until it is set.");

        var projectKey = ProjectContext.For(doc).Key; // empty when unbound: renames stay local, the ledger row is not sent (the status says so)
        var rows = NamingManagerService.BuildRows(doc, rs);           // read-only, on this command's API thread
        var window = new NamingManagerWindow(rows);
        DialogOwner.Attach(window, c);
        window.Closed += (_, _) => _open = false;
        // Every status goes through Say, which numbers it. Say runs on Revit's main thread (the window's events and the
        // hub's jobs both do), and a batch's late ledger line lands only if nothing newer was said since — never over a
        // later Rename's, Rescan's or Select's status, whichever order the bridge answers in.
        var said = 0;
        void Say(string text) { said++; window.SetStatus(text); }

        window.RescanRequested += () =>
        {
            window.SetBusy(true);
            App.Events.Enqueue(ua =>
            {
                try
                {
                    var d = ua.ActiveUIDocument?.Document;
                    if (d == null || !d.Equals(doc)) { Say("switch back to the model the Naming Manager was opened on — nothing was done"); window.SetBusy(false); return; }
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine!.RulesetFor(d)));
                    said++; // SetRows wrote the status itself: an earlier batch's late ledger line must not overwrite it
                    window.SetBusy(false);
                }
                catch (Exception ex) { Say("Revit refused: " + ex.Message); window.SetBusy(false); }
            });
        };
        window.SelectRequested += row => App.Events.Enqueue(ua =>
        {
            try
            {
                var d = ua.ActiveUIDocument;
                if (d?.Document is not { } dd || !dd.Equals(doc)) { Say("switch back to the model the Naming Manager was opened on — nothing was done"); window.SetBusy(false); return; }
                var typeIds = row.IsType
                    ? new HashSet<ElementId>(new[] { row.ElementId.ToElementId() })
                    : new HashSet<ElementId>((d.Document.GetElement(row.ElementId.ToElementId()) as Family)?.GetFamilySymbolIds() ?? Enumerable.Empty<ElementId>());
                var ids = new FilteredElementCollector(d.Document).WhereElementIsNotElementType().Where(e => typeIds.Contains(e.GetTypeId())).Select(e => e.Id).ToList();
                if (ids.Count == 0) { Say("No instances of that type in the model."); return; }
                d.Selection.SetElementIds(ids); d.ShowElements(ids);
            }
            catch (Exception ex) { Say("Revit refused: " + ex.Message); }
        });
        Action<List<NamingRow>> rename = ticked =>
        {
            window.SetBusy(true); Say($"Renaming {ticked.Count} row(s)…");
            App.Events.Enqueue(ua =>
            {
                try
                {
                    var d = ua.ActiveUIDocument?.Document;
                    if (d == null || !d.Equals(doc)) { Say("switch back to the model the Naming Manager was opened on — nothing was done"); window.SetBusy(false); return; }
                    var results = NamingManagerService.Apply(d, ticked, App.Engine!.RulesetFor(d), projectKey, out var ledger);
                    var ok = results.Count(r => r.Ok);
                    var failed = results.Where(r => !r.Ok).Select(r => $"{r.Row.Current}: {r.Message}").ToList();
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine.RulesetFor(d)));
                    var status = $"Renamed {ok}/{results.Count}." + (failed.Count > 0 ? " Not renamed — " + string.Join(" · ", failed.Take(6)) + (failed.Count > 6 ? " · …" : "") : "");
                    Say(ledger is null ? status : status + " Ledger: waiting for the bridge…");
                    var mine = said;
                    window.SetBusy(false);
                    // The batch's ledger row is on a task (≤ 6 s). Its line follows from the worker through the window's
                    // dispatcher; this handler has returned by then, so nothing waits on the worker.
                    ledger?.ContinueWith(t => window.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        if (mine != said) return; // a newer status owns the line
                        window.SetStatus(status + " " + LedgerLine.Sentence(t.Status == TaskStatus.RanToCompletion ? t.Result
                            : LedgerResult.NotConfirmed(t.Exception?.GetBaseException().Message ?? "the ledger post did not finish")));
                    })), TaskScheduler.Default);
                }
                catch (Exception ex) { Say("Revit refused: " + ex.Message); window.SetBusy(false); }
            });
        };
        window.RenameRequested += rename;
        window.FixRequested += row =>
        {
            // The Live Coordination panel's Review Fix dialog, seeded with the row's suggestion; the dialog checks the
            // name against the rule (org expanded) and Execute goes through the batch path with one row.
            var rs = App.Engine!.RulesetFor(doc);
            var rule = rs.Rules.FirstOrDefault(r => r.Id == row.RuleId);
            var seed = row.Suggestion ?? (row.Proposed.Length > 0 ? row.Proposed : row.Current);
            var dialog = new FixReviewDialog(row.Current, row.RuleId, rule, rs.Org, seed);   // the dialog expands {org} itself (BG-5)
            DialogOwner.Attach(dialog, c);
            if (dialog.ShowDialog() != true || string.IsNullOrWhiteSpace(dialog.FinalName)) return;
            row.Proposed = dialog.FinalName!.Trim();
            rename(new List<NamingRow> { row });
        };
        try { window.Show(); }
        catch { _open = false; throw; }
        _open = true;
        return Result.Succeeded;
    }
}
