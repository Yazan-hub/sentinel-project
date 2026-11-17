using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.UI;
using Sentinel.Workflow;

namespace Sentinel.Commands;

/// <summary>UX slice 1 — the modeller's journey: Check → Fix → Publish. Thin screens over the existing engines (the full scan,
/// the ⚡ Fix name suggester filing Change Requests proposals, IFC pre-flight, family heal, Governed Publish). Nothing new is
/// judged here; the words are plain and the technical lines sit under Details.</summary>
internal static class Journey
{
    internal sealed class Outcome
    {
        public List<CheckGroup> Groups = new();
        public List<string> Details = new();
        public int Items;      // what the modeller can fix
        public int Blocking;   // rows in Block mode: the ones that stop a sync / publish
        public ScanReport? Scan;
    }

    /// Run the full scan and IFC pre-flight on this (API) thread and group the rows by what fixes them.
    internal static Outcome Run(Document doc)
    {
        var r = new Outcome();
        var engine = App.Engine!;
        var scan = r.Scan = engine.ScanFull(doc);
        var rs = scan.Ruleset;
        var src = engine.SourceFor(doc);
        var key = ProjectContext.For(doc).Key;
        var (contract, contractSource) = Task.Run(() => DeliveryContract.Load(key)).GetAwaiter().GetResult();
        var ifc = IfcPreFlightScanner.Scan(doc, contract, contractSource.Label);

        Rule? RuleOf(Violation v) => rs?.Rules.FirstOrDefault(x => x.Id == v.RuleId);
        var real = scan.Violations.Where(v => v.ElementId >= 0).ToList();
        var naming = real.Where(v => RuleOf(v)?.Target != RuleTarget.Parameter).ToList();
        var data = real.Where(v => RuleOf(v)?.Target == RuleTarget.Parameter).ToList();
        var ifcRows = ifc.Violations.Where(v => v.ElementId >= 0 && v.Mode != EnforcementMode.Monitor).ToList(); // Monitor = "default mapping will be used": a note, under Details
        int fixable = naming.Count(v => Fixable(v, RuleOf(v), rs?.Org) is not null);

        r.Groups.Add(Group("Naming", naming, naming.Count == 0 ? "All names follow the project standards."
            : $"{naming.Count} name(s) do not follow the project standards" + (fixable > 0 ? $" — {fixable} can be fixed for you." : "."),
            fixable > 0 ? "Fix all" : null, "fix-naming"));
        r.Groups.Add(Group("Required data", data, data.Count == 0 ? "Every required value is filled in."
            : $"{data.Count} element(s) miss a value the project needs. Fill them in on the elements (Show selects them).", null, null));
        r.Groups.Add(new CheckGroup { Title = "Families", Summary = "Checks the families loaded in this model and repairs missing shared parameters. Not checked yet.",
            FixLabel = "Check families", FixChoice = "families" });
        r.Groups.Add(Group("IFC readiness", ifcRows, ifcRows.Count == 0 ? "Ready for IFC export." :
            $"{ifcRows.Count} item(s) would export to IFC wrongly or without required data.", null, null));

        r.Items = naming.Count + data.Count + ifcRows.Count;
        r.Blocking = real.Count(v => v.Mode == EnforcementMode.Block);
        r.Details.Add($"Model: {doc.Title} · {scan.ElementsChecked} elements checked in {scan.DurationMs} ms; IFC: {ifc.ElementsChecked} in {ifc.DurationMs} ms");
        r.Details.Add("Project standards: " + src.Label + (scan.NotScored is { } ns ? " — not scored: " + ns : ""));
        r.Details.Add("IFC requirements from: " + contractSource.Label);
        var notes = ifc.Violations.Count(v => v.ElementId >= 0 && v.Mode == EnforcementMode.Monitor);
        if (notes > 0) r.Details.Add($"IFC notes (not counted): {notes} element(s) export with their category's default IFC class");
        foreach (var v in scan.Violations.Concat(ifc.Violations).Take(300))
            r.Details.Add($"{v.RuleId} [{v.Mode}] {(v.ElementId >= 0 ? "#" + v.ElementId + " " : "")}{v.ElementName}: {v.MessageEn}");
        return r;
    }

    private static CheckGroup Group(string title, List<Violation> rows, string summary, string? fix, string? choice) => new()
    {
        Title = title + (rows.Count > 0 ? $" ({rows.Count})" : " ✓"),
        Summary = summary,
        Examples = rows.Take(4).Select(v => $"{v.ElementName} — {v.MessageEn}").ToList(),
        ElementIds = rows.Where(v => v.ElementId > 0).Select(v => v.ElementId).Distinct().ToList(),
        FixLabel = fix, FixChoice = choice,
    };

    /// The ⚡ Fix rule (ViolationRow.ComputeCanFix): a named element under a token rule, not a type (those go through the Naming
    /// Manager). Returns the suggested name, or null.
    internal static string? Fixable(Violation v, Rule? rule, string? org)
    {
        if (v.ElementId <= 0 || rule is null || rule.Tokens.Count == 0 || rule.Target == RuleTarget.Type) return null;
        if (v.Mode == EnforcementMode.Monitor) return null;
        return AutoFixExecution.Suggest(v.ElementName, rule, org);
    }

    internal static void Show(UIDocument uidoc, IEnumerable<long> ids)
    {
        var list = ids.Select(i => i.ToElementId()).Where(i => uidoc.Document.GetElement(i) is not null).ToList();
        if (list.Count == 0) return;
        uidoc.Selection.SetElementIds(list);
        uidoc.ShowElements(list);
    }
}

[Transaction(TransactionMode.Manual)]
public sealed class CheckCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc || App.Engine is null) return Result.Cancelled;
        if (doc.IsFamilyDocument) { TaskDialog.Show("Sentinel — Check", "Open a project model to check it — a family is checked when it is loaded."); return Result.Cancelled; }

        var r = Journey.Run(doc);
        App.PanelVm?.PublishReport(doc, r.Scan!);   // the pane shows the same result
        App.ReloadRuleset(doc, postScan: true);     // and the scan is recorded as Scan Now's is

        var w = new JourneyWindow("Check", r.Items == 0 ? "No problems found. You can publish." : $"{r.Items} thing(s) to fix before you publish");
        foreach (var g in r.Groups) w.AddGroup(g);
        w.AddFooter("Go to Publish", "publish");
        w.AddDetails(r.Details);
        DialogOwner.Attach(w, c);
        w.ShowDialog();

        switch (w.Choice)
        {
            case "show": Journey.Show(uidoc, w.Picked.ElementIds); break;
            case "fix-naming": return FixNaming(c, doc, r.Scan!);
            case "families": return new SanitizeLoadedCommand().Execute(c, ref msg, els);
            case "publish": return new PublishCommand().Execute(c, ref msg, els);
        }
        return Result.Succeeded;
    }

    /// "Fix all": one proposed change per fixable name (RequestManager.CreateProposal, as ⚡ Fix files on a REQUEST rule) in one
    /// transaction; nothing is renamed until someone approves it in Fix.
    private static Result FixNaming(ExternalCommandData c, Document doc, ScanReport scan)
    {
        var rs = scan.Ruleset;
        int filed = 0, skipped = 0;
        using (var t = new Transaction(doc, "Sentinel — propose name fixes"))
        {
            t.Start();
            foreach (var v in scan.Violations)
            {
                var rule = rs?.Rules.FirstOrDefault(x => x.Id == v.RuleId);
                if (Journey.Fixable(v, rule, rs?.Org) is not { } name) continue;
                if (doc.GetElement(v.ElementId.ToElementId()) is { } e && RequestManager.CreateProposal(doc, v.RuleId, e, name)) filed++;
                else skipped++;
            }
            t.Commit();
        }
        TaskDialog.Show("Sentinel — Check", $"{filed} proposed change(s) ready to approve." +
            (skipped > 0 ? $"\n{skipped} already waiting or unchanged." : "") + "\n\nFix opens next: approve the ones you want.");
        string m = ""; return FixCommand.Open(c, ref m);
    }
}

[Transaction(TransactionMode.Manual)]
public sealed class FixCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els) => Open(c, ref msg);

    internal static Result Open(ExternalCommandData c, ref string msg)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;
        var waiting = RequestStore.GetPending(doc).Count;
        App.PanelVm?.SetWaiting(waiting);   // the pane's "changes waiting" follows what Fix shows
        var w = new JourneyWindow("Fix", waiting == 0 ? "No name fixes waiting" : $"{waiting} proposed change(s) waiting for approval");
        w.AddAction("Name fixes", "Proposed renames from Check. Approve applies the new name; Reject drops it. Revit's Undo takes an approved rename back.", "Open", "requests");
        w.AddAction("Model changes from AI", "Elements Sentinel proposes to add or change. Tick what goes into the model, then Apply.", "Open", "proposals");
        w.AddAction("Applied changes — Undo", "Changes already applied. See what Undo would put back, then Undo with your reason.", "Open", "applied");
        w.AddAction("Openings for pipes and ducts", "Find where linked MEP runs through structure and propose openings.", "Open", "mep");
        DialogOwner.Attach(w, c);
        w.ShowDialog();
        var els = new ElementSet();
        return w.Choice switch
        {
            "requests" => new ShowRequestsCommand().Execute(c, ref msg, els),
            "proposals" => new ReviewChangesetsCommand().Execute(c, ref msg, els),
            "applied" => new AppliedChangesCommand().Execute(c, ref msg, els),
            "mep" => new MepVoidsCommand().Execute(c, ref msg, els),
            _ => Result.Succeeded,
        };
    }
}

/// Publish: the pre-publish check first, in plain words, then the one governed path (GovernedPublishCommand) unchanged.
[Transaction(TransactionMode.Manual)]
public sealed class PublishCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc || App.Engine is null) return Result.Cancelled;
        if (doc.IsFamilyDocument) { TaskDialog.Show("Sentinel — Publish", "Open a project model to publish it."); return Result.Cancelled; }
        var r = Journey.Run(doc);
        var d = new TaskDialog("Sentinel — Publish")
        {
            MainInstruction = r.Items == 0 ? "Pre-publish check: nothing to fix" : $"Pre-publish check: {r.Items} thing(s) to fix",
            MainContent = (r.Blocking > 0 ? $"{r.Blocking} of them block the publish. Fix them in Check first.\n\n" : "") +
                          string.Join("\n", r.Groups.Where(g => g.Title != "Families").Select(g => g.Title + ": " + g.Summary)) +
                          "\n\nPublish exports the model to IFC and checks it against the project's requirements. If it fails, nothing is uploaded and you see why.",
            ExpandedContent = string.Join("\n", r.Details.Take(40)),
            CommonButtons = TaskDialogCommonButtons.Cancel,
        };
        if (r.Items > 0) d.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Open Check", "See and fix the items first");
        d.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Publish now", r.Items > 0 ? "Publish as it is — the check may refuse it" : "Export, check and upload");
        return d.Show() switch
        {
            TaskDialogResult.CommandLink1 => new CheckCommand().Execute(c, ref msg, els),
            TaskDialogResult.CommandLink2 => new GovernedPublishCommand().Execute(c, ref msg, els),
            _ => Result.Cancelled,
        };
    }
}
