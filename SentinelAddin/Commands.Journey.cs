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
        int fixable = naming.Count(v => Fixable(doc, v, RuleOf(v), rs?.Org) is not null);

        r.Groups.Add(Group("Naming", naming, naming.Count == 0 ? "All names follow the project standards."
            : $"{naming.Count} name(s) do not follow the project standards" + (fixable > 0 ? $" — {fixable} can be fixed for you" : "")
              + (naming.Count > fixable ? $"{(fixable > 0 ? ";" : " —")} {naming.Count - fixable} need a name from you (Show selects them)." : "."),
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
    /// Manager). F-UX1-4: the name is built strictly (NameSynth.BuildStrictName): a token missing from the name is read off the
    /// element as the rule's token_infer says, never guessed, and the name must pass the rule. Returns that name, or null.
    internal static string? Fixable(Document doc, Violation v, Rule? rule, string? org)
    {
        if (v.ElementId <= 0 || rule is null || rule.Tokens.Count == 0 || rule.Target == RuleTarget.Type) return null;
        if (v.Mode == EnforcementMode.Monitor) return null;
        if (doc.GetElement(v.ElementId.ToElementId()) is not { } e) return null;
        var name = NameSynth.BuildStrictName(v.ElementName, rule, org, token => Infer(e, rule, token));
        return name is not null && name != v.ElementName && RuleRegex.Matches(rule, org, name, out _) ? name : null;
    }

    /// The rule's token_infer for one token, read off the element: a parameter's value first, then its category. For a
    /// view, its view type ("Schedule", "FloorPlan", "Section") also counts as the category. Null when the office says nothing.
    private static string? Infer(Element e, Rule rule, string token)
    {
        if (rule.TokenInfer is null || !rule.TokenInfer.TryGetValue(token, out var inf) || inf is null) return null;
        if (inf.ByParameter is not null)
            foreach (var kv in inf.ByParameter)
                if (e.LookupParameter(kv.Key) is { HasValue: true } p && (p.AsString() ?? p.AsValueString()) is { } val)
                {
                    var m = kv.Value.FirstOrDefault(x => x.Key.Equals(val, StringComparison.OrdinalIgnoreCase));
                    if (m.Key is not null) return m.Value;
                }
        if (inf.ByCategory is not null)
            foreach (var key in new[] { e.Category?.Name, (e as View)?.ViewType.ToString() })
            {
                var m = inf.ByCategory.FirstOrDefault(x => key is not null && x.Key.Equals(key, StringComparison.OrdinalIgnoreCase));
                if (m.Key is not null) return m.Value;
            }
        return null;
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

    /// "Fix all" (F-UX1-5): the proposed names are listed first, nothing ticked; one proposed change per ticked row
    /// (RequestManager.CreateProposal, as ⚡ Fix files on a REQUEST rule) in one transaction; nothing is renamed until someone
    /// approves it in Fix.
    private static Result FixNaming(ExternalCommandData c, Document doc, ScanReport scan)
    {
        var rs = scan.Ruleset;
        var rows = new List<(Violation V, string Name)>();
        foreach (var v in scan.Violations)
            if (Journey.Fixable(doc, v, rs?.Rules.FirstOrDefault(x => x.Id == v.RuleId), rs?.Org) is { } name && !rows.Any(r => r.V.ElementId == v.ElementId))
                rows.Add((v, name));
        var pick = new NamePickWindow(rows.Select(r => (r.V.ElementName, r.Name)).ToList());
        DialogOwner.Attach(pick, c);
        if (pick.ShowDialog() != true || pick.Ticked.Count == 0) return Result.Cancelled;
        int filed = 0, skipped = 0;
        using (var t = new Transaction(doc, "Sentinel — propose name fixes"))
        {
            t.Start();
            foreach (var i in pick.Ticked)
            {
                var (v, name) = rows[i];
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

/// UX slice 7: Build — model from drawings and photos as one window over the existing tools, in order. Each step's state is
/// a cheap read (element counts by class or category: no geometry, no web call); what cannot be read cheaply says "not checked
/// here". How a button runs a tool: the window is modal and only records the chosen command's class name (BuildSteps); once it
/// closes we are still inside this Execute, on Revit's API thread with no transaction open, so creating that command and calling
/// its own Execute with the same ExternalCommandData is the same as pressing its ribbon button (Check and Fix do the same).
/// PostCommand is not used: it runs only after this command returns, and a posted add-in command needs its ribbon id looked up.
[Transaction(TransactionMode.Manual)]
public sealed class BuildCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;
        if (doc.IsFamilyDocument) { TaskDialog.Show("Sentinel — Build", "Open a project model to build in it."); return Result.Cancelled; }
        var state = State(doc);
        var w = new JourneyWindow("Build", "Model from drawings and photos, step by step");
        foreach (var s in BuildSteps.All.Append(BuildSteps.WhereFrom))
            w.AddGroup(new CheckGroup
            {
                Title = s.Number == null ? s.Title : s.Number + "  " + s.Title,
                Summary = s.Text,
                Examples = state.TryGetValue(s.Number ?? "", out var lines) ? lines : new List<string>(),
                FixLabel = s.Buttons[0].Label, FixChoice = s.Buttons[0].Command,
                MoreActions = s.Buttons.Skip(1).ToList(),
            });
        DialogOwner.Attach(w, c);
        w.ShowDialog();
        if (w.Choice is not { } cls) return Result.Succeeded;
        var cmd = (IExternalCommand)Activator.CreateInstance(typeof(BuildCommand).Assembly.GetType("Sentinel.Commands." + cls, throwOnError: true)!)!;
        return cmd.Execute(c, ref msg, els);
    }

    /// Step number → its state lines. Counts only; nothing is judged here.
    private static Dictionary<string, List<string>> State(Document doc)
    {
        FilteredElementCollector All() => new FilteredElementCollector(doc);
        var levels = All().OfClass(typeof(Level)).ToElements();
        var grids = All().OfClass(typeof(Grid)).ToElements();
        int drawings = All().OfClass(typeof(ImportInstance)).GetElementCount();
        int walls = All().OfClass(typeof(Wall)).GetElementCount();
        int masses = All().OfCategory(BuiltInCategory.OST_Mass).WhereElementIsNotElementType().GetElementCount();
        int pinnedL = levels.Count(l => l.Pinned), pinnedG = grids.Count(g => g.Pinned);
        var needs = drawings == 0 ? "No drawing is imported in this model yet — the tool offers the project folder's DWG files."
                                  : $"{drawings} drawing(s) imported or linked in this model.";
        return new Dictionary<string, List<string>>
        {
            ["1"] = new() { grids.Count > 0 ? $"Done: {levels.Count} level(s) and {grids.Count} grid(s) in the model." : $"Not yet: {levels.Count} level(s), no grids.", needs },
            ["2"] = new() { walls > 0 ? $"Done: {walls} wall(s) in the model." : "Not yet: no walls in the model.", needs },
            ["3"] = new() { masses > 0 ? $"{masses} mass(es) in the model; Shell a Mass can use them." : "Not yet: no mass in the model.",
                            "Photo Massing needs photos added to the project's evidence on the web (not checked here)." },
            ["4"] = new() { levels.Count + grids.Count > 0 && pinnedL == levels.Count && pinnedG == grids.Count
                                ? $"Done: all {levels.Count} level(s) and {grids.Count} grid(s) are pinned."
                                : $"Not yet: {pinnedL} of {levels.Count} level(s) and {pinnedG} of {grids.Count} grid(s) pinned.",
                            "Needs the office modelling guideline (not checked here)." },
            ["5"] = new() { "Not checked here: Promote shows each element's stage before it changes anything.",
                            "Needs this model linked to its web project (More > Project Setup)." },
        };
    }
}
