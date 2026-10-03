using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Annotate — step 3 of the datum → model → annotate chain (MA-2e: audit DAT-3, ANV-1, ANV-2). Plans the WIP plan views the
/// `views` section of the guideline@n installed on the document's web project (or its office) prescribes — levels × its
/// FloorPlan and CeilingPlan entries, each named from the project's View rule tokens or the fixed WIP_ name and judged by Scan
/// Now's own rule before anything is created (ViewPlanner) — and the unpinned levels and grids; shows them in one preview (a
/// story level × the first floor plan and ceiling plan entries, and story levels and grids, pre-ticked; a refused row says why);
/// writes the ticked rows inside one SentinelUndo group, each view in its own SubTransaction so one failure rolls back that view
/// only; then reads back what the model holds, kept or not (review C2). With no guideline it refuses and names the none — it never
/// plans another office's views (cohesion 4b-2, F44); with the ruleset not loaded yet it refuses too (review C1). B31 (spec
/// amendment S1, review C3): Revit may empty its Undo list after views are named, so the preview and the result always say the
/// annotate ledger row, which names the views and datums, is then the record.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class AnnotateViewsCommand : IExternalCommand
{
    private const string Title = "Sentinel — Annotate";

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        // guideline@n for this document's project (or its office): the key is read here on the API thread, the GET
        // runs off it and the command waits (4 s cap), as Governed Publish waits on /propose.
        string key = ProjectContext.For(doc).Key;
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false)).GetAwaiter().GetResult();
        var guideline = standards.Guideline;
        string guidelineLabel = standards.GuidelineSource.Label;

        var nothing = ViewPlanner.NothingToPlan(guidelineLabel, standards.GuidelineSource.Origin != "none", guideline.Views);
        if (nothing != null)
        {
            TaskDialog.Show(Title, nothing);
            return Result.Cancelled;
        }

        // The levels as the next-story rule reads them — the one projection (MA-1a review C6) — lowest first. Building Story is
        // read there, never set here (DAT-2).
        var stories = ChangesetExecutor.Stories(doc).OrderBy(l => l.ElevationMm).ToList();
        if (stories.Count == 0)
        {
            TaskDialog.Show(Title, "No Levels in the model — run Datum from Drawings first.");
            return Result.Cancelled;
        }
        var storyNames = new HashSet<string>(stories.Where(l => l.IsStory).Select(l => l.Name));

        // ANV-1 (F4, review C1): the ruleset Scan Now judges this document by, as App.ReloadRuleset cached it — no network call
        // here. "Not loaded yet" is never read as none (the names would go unjudged): Annotate refuses, saying so. An installed
        // none (Has is true) plans the fixed names, and the preview says they are not checked.
        if (App.Engine is not RuleEngineHost engine || !engine.Has(doc))
        {
            TaskDialog.Show(Title, "The project's ruleset has not loaded yet, so the view names cannot be judged by Scan Now's rule. Run Scan Now, then Annotate again. Nothing was created.");
            return Result.Cancelled;
        }
        var ruleset = engine.RulesetFor(doc);
        string rulesetLabel = engine.SourceFor(doc).Label;

        var allViews = new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().ToList();
        // Template names too: View.Name = … throws when a VIEW TEMPLATE already holds that name.
        var taken = new HashSet<string>(allViews.Select(v => v.Name));
        var templates = allViews.Where(v => v.IsTemplate).GroupBy(v => v.Name).ToDictionary(g => g.Key, g => g.First());
        var plans = ViewPlanner.Plan(guideline.Views, guideline.ViewNaming, stories.Select(l => (l.Name, l.IsStory)).ToList(), ruleset, taken);
        if (plans.Count == 0)
        {
            TaskDialog.Show(Title, $"Guideline: {guidelineLabel}\nIts views section has no plannable (FloorPlan/CeilingPlan) entries — nothing to create.");
            return Result.Cancelled;
        }

        // F6: the model's default floor plan and ceiling plan view types; none → the row is refused by name.
        var viewType = new Dictionary<string, ElementId>
        {
            ["FloorPlan"] = doc.GetDefaultElementTypeId(ElementTypeGroup.ViewTypeFloorPlan),
            ["CeilingPlan"] = doc.GetDefaultElementTypeId(ElementTypeGroup.ViewTypeCeilingPlan),
        };
        foreach (var p in plans)
        {
            p.TemplateInModel = !string.IsNullOrWhiteSpace(p.Template) && templates.ContainsKey(p.Template);
            if (p.Refusal == null && viewType[p.ViewType] == ElementId.InvalidElementId)
            {
                p.Refusal = $"this model has no default {(p.ViewType == "CeilingPlan" ? "ceiling plan" : "floor plan")} view type";
                p.PreTicked = false;
            }
        }

        // DAT-3 (F3 A, F7, review C7): every unpinned level and grid; one another user owns, or one changed or deleted in central
        // (either would fail the commit and roll every view back), is listed unticked with the reason.
        var datums = new FilteredElementCollector(doc).OfClass(typeof(Level)).ToElements()
            .Concat(new FilteredElementCollector(doc).OfClass(typeof(Grid)).ToElements())
            .Select(e => new DatumFact
            {
                Id = e.Id.IdValue(), Kind = e is Level ? "Level" : "Grid", Name = e.Name, Pinned = e.Pinned,
                IsStory = e is Level && storyNames.Contains(e.Name),
                OwnedBy = doc.IsWorkshared && WorksharingUtils.GetCheckoutStatus(doc, e.Id) == CheckoutStatus.OwnedByOtherUser
                    ? WorksharingUtils.GetWorksharingTooltipInfo(doc, e.Id).Owner : null,
                ChangedInCentral = doc.IsWorkshared
                    && WorksharingUtils.GetModelUpdatesStatus(doc, e.Id) is ModelUpdatesStatus.UpdatedInCentral or ModelUpdatesStatus.DeletedInCentral,
            }).ToList();
        var pins = ViewPlanner.Pins(datums);

        var words = new List<string> { "Guideline: " + guidelineLabel, ViewPlanner.RuleLine(ruleset, rulesetLabel) };
        if (storyNames.Count == 0) words.Add("No level in this model is a Building Story — nothing is pre-ticked; tick the rows you want.");
        words.Add(ViewPlanner.UndoWords());

        // A person decides: nothing is written before Create; Cancel writes nothing.
        var pick = new AnnotatePreviewWindow(plans, pins, words);
        DialogOwner.Attach(pick, c);
        if (pick.ShowDialog() != true) return Result.Cancelled;
        if (pick.Views.Count + pick.Pins.Count == 0)
        {
            TaskDialog.Show(Title, "Nothing was ticked — nothing was created or pinned.");
            return Result.Cancelled;
        }

        var levelId = new FilteredElementCollector(doc).OfClass(typeof(Level)).ToElements()
            .GroupBy(l => l.Name).ToDictionary(g => g.Key, g => g.First().Id);
        string[] routeParams = OrgNames.MainGroupParams(App.OrgFor(doc));
        var created = new List<string>();
        var failed = new List<string>();
        var warnings = new List<string>();
        int unrouted = 0, claimedPins = 0;
        bool committed = false, kept;
        string? thrown = null;
        // XC-2 and spec amendment S1: one Sentinel action, one group — the views and the pins.
        try
        {
            kept = SentinelUndo.Run(doc, "Annotate views", () =>
            {
                using var t = new Transaction(doc, "Sentinel — Annotate: guideline views");
                t.Start();
                foreach (var p in pick.Views)
                {
                    // ANV-2 (E4): one view's failure rolls back that view only and is named; the rest are still created.
                    using var st = new SubTransaction(doc);
                    st.Start();
                    try
                    {
                        if (!NamingUtils.IsValidName(p.Name)) throw new InvalidOperationException("Revit refuses this view name");
                        var view = ViewPlan.Create(doc, viewType[p.ViewType], levelId[p.LevelName]);
                        view.Name = p.Name;
                        if (p.TemplateInModel) view.ViewTemplateId = templates[p.Template].Id;
                        bool routed = string.IsNullOrWhiteSpace(p.BrowserStatus) || ViewGenerator.SetFirstMatch(view, routeParams, p.BrowserStatus);
                        if (st.Commit() != TransactionStatus.Committed) throw new InvalidOperationException("Revit did not commit this view");
                        created.Add(p.Name);
                        if (!routed) unrouted++;
                        if (!p.TemplateInModel && !string.IsNullOrWhiteSpace(p.Template))
                            warnings.Add($"View template '{p.Template}' not in this model — '{p.Name}' created without it.");
                    }
                    catch (Exception ex)
                    {
                        if (st.HasStarted() && !st.HasEnded()) st.RollBack();
                        failed.Add($"'{p.Name}': {ex.Message}");
                    }
                }
                foreach (var pin in pick.Pins)
                {
                    try
                    {
                        var e = doc.GetElement(pin.Id.ToElementId()) ?? throw new InvalidOperationException("no longer in the model");
                        e.Pinned = true;
                        claimedPins++;
                    }
                    catch (Exception ex) { failed.Add($"{pin.Label}: {ex.Message}"); }
                }
                committed = t.Commit() == TransactionStatus.Committed;
                return committed && created.Count + claimedPins > 0;
            });
        }
        // Review C2: a group whose commit or rollback Revit refuses gets the same read-back as one not kept.
        catch (Autodesk.Revit.Exceptions.InvalidOperationException ex) { kept = false; thrown = ex.Message; }

        // Review C2 — claimed vs verified: what the model holds after the group, kept or not, is what the result and the row say.
        var present = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<View>()
            .Where(v => !v.IsTemplate && created.Contains(v.Name)).Select(v => v.Name).ToList();
        var pinnedNow = pick.Pins.Select(p => doc.GetElement(p.Id.ToElementId())).Where(e => e != null && e.Pinned).ToList();
        int pinnedLevels = pinnedNow.Count(e => e is Level), pinnedGrids = pinnedNow.Count - pinnedLevels;
        if (!kept && present.Count + pinnedNow.Count == 0)
        {
            string why = thrown != null ? "Revit refused the Undo group: " + thrown
                : !committed ? "Revit did not commit the transaction (a view or a datum it needs may be owned by another user)."
                : created.Count + claimedPins == 0 ? "every ticked row failed:\n  • " + string.Join("\n  • ", failed)
                : "Revit did not keep the Undo group.";
            TaskDialog.Show(Title, "Nothing was created or pinned — " + why + "\nRead back from the model: no view or pin of this run is in it — the model is as it was.");
            return Result.Failed;
        }

        // S3 (review C6) — the substitute for MH-LNK-01 (not in code): every level and grid, read after the commit; links are not read (K7).
        var levelsNow = new FilteredElementCollector(doc).OfClass(typeof(Level)).ToElements();
        var storiesNow = levelsNow.Where(l => storyNames.Contains(l.Name)).ToList();
        var othersNow = levelsNow.Where(l => !storyNames.Contains(l.Name)).ToList();
        var gridsNow = new FilteredElementCollector(doc).OfClass(typeof(Grid)).ToElements();
        string pinnedLine = ViewPlanner.PinnedLine(storiesNow.Count(l => l.Pinned), storiesNow.Count, othersNow.Count(l => l.Pinned), othersNow.Count,
            gridsNow.Count(g => g.Pinned), gridsNow.Count);

        int skippedExisting = plans.Count(p => p.Refusal == ViewPlanner.Existing);
        int refused = plans.Count(p => p.Refusal != null) - skippedExisting;
        int levelsWithViews = pick.Views.Where(p => present.Contains(p.Name)).Select(p => p.LevelName).Distinct().Count();
        // MA-1a item 7: one annotate row for the run, sent off this thread; the pane's log says what the ledger answered. Review C4: it
        // names the views and datums the model holds, so it is the record when Revit did not keep the Undo group (B31).
        GovernedNotify.Report("Annotate", CommandReports.Annotate(present, levelsWithViews, skippedExisting, refused, failed.Count, unrouted, pinnedLevels, pinnedGrids,
            warnings.Count, storyNames.Count, pinnedNow.Select(e => e.Id.IdValue()).ToList(), pinnedLine, kept, guidelineLabel, rulesetLabel, UserSession.Actor), key);

        var sb = new StringBuilder();
        if (!kept)
            sb.AppendLine($"Revit committed the views but did not keep the Undo group (B31?): {present.Count} view(s) and {pinnedNow.Count} pin(s) are in the model — the annotate ledger row is the record.").AppendLine();
        sb.AppendLine(words[0]).AppendLine(words[1]);
        sb.AppendLine($"Created: {present.Count} view(s). Pinned: {pinnedLevels} level(s) and {pinnedGrids} grid(s).");
        sb.AppendLine(pinnedLine);
        if (skippedExisting + refused > 0) sb.AppendLine($"Not created, as the preview said: {skippedExisting} already in the model, {refused} refused with a reason.");
        if (unrouted > 0) sb.AppendLine($"Not routed in the Project Browser: {unrouted} view(s) — no writable {string.Join(" / ", routeParams)} parameter.");
        if (failed.Count > 0)
        {
            sb.AppendLine().AppendLine("Failed (each rolled back alone; the rest were kept):");
            foreach (var f in failed) sb.AppendLine("  • " + f);
        }
        if (warnings.Count > 0)
        {
            sb.AppendLine().AppendLine("Warnings:");
            foreach (var g in warnings.GroupBy(w => w))
                sb.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        sb.AppendLine().AppendLine(ViewPlanner.UndoWords());
        sb.AppendLine().Append("Scan Now judges the new view names by the same rule.");
        TaskDialog.Show(Title, sb.ToString());
        return Result.Succeeded;
    }
}
