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
using Sentinel.Standards;
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

        // ANV-1 (F4, review C1): the ruleset Scan Now judges this document by, as App.ReloadRuleset cached it — no network call
        // here. "Not loaded yet" is never read as none (the names would go unjudged): Annotate refuses, saying so — before the
        // guideline's GET, so the person does not wait on it to be refused (review C16). An installed none (Has is true) plans the
        // fixed names, and the preview says they are not checked.
        if (App.Engine is not RuleEngineHost engine || !engine.Has(doc))
        {
            TaskDialog.Show(Title, "The project's ruleset has not loaded yet, so the view names cannot be judged by Scan Now's rule. Run Scan Now, then Annotate again. Nothing was created.");
            return Result.Cancelled;
        }
        var ruleset = engine.RulesetFor(doc);
        string rulesetLabel = engine.SourceFor(doc).Label;

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
        if (storyNames.Count == 0) words.Add("No level in this model is a Building Story — no view and no level is pre-ticked (unpinned grids still are); tick the rows you want.");
        words.Add(ViewPlanner.UndoWords());

        // MA-8-11 (ANV-3): view templates the creatable rows name that the model lacks can be copied from the office template file a lead
        // picks. It is opened detached in the background, never saved, and closed unsaved in the finally below (a file the person already
        // holds open is used and never closed). Nothing is opened unless the person picks the file.
        OfficeTemplateSource? src = null;
        var templateRows = new List<TemplateRow>();
        string? templatesHeader = null;
        var missing = ViewPlanner.Missing(plans, templates.Keys);
        if (missing.Count > 0)
        {
            var ask = new TaskDialog(Title)
            {
                MainInstruction = $"{missing.Count} view template(s) the guideline names are not in this model",
                MainContent = string.Join("\n", missing.Select(m => "  • " + m)) + "\n\nTheir views are created without them unless you copy them from the office template file. The file is never saved or changed.",
                CommonButtons = TaskDialogCommonButtons.Cancel,
            };
            ask.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Pick the office template file…");
            ask.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Continue without them");
            var answer = ask.Show();
            if (answer == TaskDialogResult.CommandLink1)
            {
                var dlg = new Microsoft.Win32.OpenFileDialog { Title = "Sentinel — the office view template file", Filter = "Revit template or project (*.rte;*.rvt)|*.rte;*.rvt" };
                if (dlg.ShowDialog() != true) return Result.Cancelled;
                src = OfficeTemplate.Open(c.Application.Application, doc, dlg.FileName, out string why);
                if (src == null) { TaskDialog.Show(Title, why); return Result.Cancelled; }
            }
            else if (answer != TaskDialogResult.CommandLink2) return Result.Cancelled;
        }
        try
        {
        // (the body to the end of Execute sits inside the try without re-indenting, to keep the diff small: the finally at the end closes the file)
        var fileViewId = new Dictionary<string, ElementId>();
        if (src != null)
        {
            var fileTemplates = new Dictionary<string, string>();
            foreach (var v in new FilteredElementCollector(src.Doc).OfClass(typeof(View)).Cast<View>().Where(v => v.IsTemplate))
                if (!fileTemplates.ContainsKey(v.Name)) { fileTemplates[v.Name] = v.ViewType.ToString(); fileViewId[v.Name] = v.Id; }
            templateRows = ViewPlanner.TemplateRows(missing, fileTemplates, src.FileName, taken);
            // The catalogue's template title is a warning to compare, never a gate; loaded only now, off the API thread.
            string? catalogTitle = Task.Run(() => GhostStandards.Load(key, layers: false, guideline: false, catalog: true)).GetAwaiter().GetResult().Guideline.TemplateTitle;
            templatesHeader = ViewPlanner.TemplateFileLine(src.FileName, src.Sha256, src.Title, catalogTitle, src.Format, src.Seconds, src.Opened);
        }

        // A person decides: nothing is written before Create; Cancel writes nothing.
        var pick = new AnnotatePreviewWindow(plans, pins, words, templateRows, templatesHeader);
        DialogOwner.Attach(pick, c);
        if (pick.ShowDialog() != true) return Result.Cancelled;
        if (pick.Views.Count + pick.Pins.Count + pick.Templates.Count == 0)
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
        var copiedNames = new List<string>();
        var notCopied = new List<(string Name, string Why)>();
        bool committed = false, kept;
        string? thrown = null;
        // XC-2 and spec amendment S1: one Sentinel action, one group — the views and the pins.
        try
        {
            kept = SentinelUndo.Run(doc, "Annotate views", () =>
            {
                using var t = new Transaction(doc, "Sentinel — Annotate: guideline views");
                t.Start();
                // MA-8-11: each ticked template in its own SubTransaction (the ANV-2 pattern), before the views that use it.
                var usedNames = new HashSet<string>(pick.Views.Select(v => v.Template));
                foreach (var tr in pick.Templates)
                {
                    if (!usedNames.Contains(tr.Name)) { notCopied.Add((tr.Name, "no ticked view uses it")); continue; }
                    using var st = new SubTransaction(doc);
                    st.Start();
                    try
                    {
                        var opts = new CopyPasteOptions();
                        opts.SetDuplicateTypeNamesHandler(new StandardsBuilder.UseDestinationTypes());
                        var made = ElementTransformUtils.CopyElements(src!.Doc, new List<ElementId> { fileViewId[tr.Name] }, doc, Transform.Identity, opts);
                        var copy = made.Select(i => doc.GetElement(i)).OfType<View>().FirstOrDefault(v => v.IsTemplate)
                            ?? throw new InvalidOperationException("Revit copied no view template");
                        if (copy.Name != tr.Name) throw new InvalidOperationException($"Revit renamed it to {copy.Name} — a name clash");
                        if (st.Commit() != TransactionStatus.Committed) throw new InvalidOperationException("Revit did not commit this template");
                        templates[tr.Name] = copy;
                        copiedNames.Add(tr.Name);
                    }
                    catch (Exception ex)
                    {
                        if (st.HasStarted() && !st.HasEnded()) st.RollBack();
                        failed.Add($"View template '{tr.Name}': {ex.Message}");
                        notCopied.Add((tr.Name, ex.Message));
                    }
                }
                // Now the rows read the copies: a view warns "created without it" only for a template still missing.
                foreach (var p in plans) p.TemplateInModel = !string.IsNullOrWhiteSpace(p.Template) && templates.ContainsKey(p.Template);
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
                        // A template of another view family (e.g. a CeilingPlan one on a FloorPlan view) is not valid here: created without it.
                        bool tplUsed = p.TemplateInModel && view.IsValidViewTemplate(templates[p.Template].Id);
                        if (tplUsed) view.ViewTemplateId = templates[p.Template].Id;
                        bool routed = string.IsNullOrWhiteSpace(p.BrowserStatus) || ViewGenerator.SetFirstMatch(view, routeParams, p.BrowserStatus);
                        if (st.Commit() != TransactionStatus.Committed) throw new InvalidOperationException("Revit did not commit this view");
                        created.Add(p.Name);
                        if (!routed) unrouted++;
                        if (!tplUsed && !string.IsNullOrWhiteSpace(p.Template))
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
                return committed && created.Count + claimedPins + copiedNames.Count > 0;
            });
        }
        // Review C2: a group whose commit or rollback Revit refuses gets the same read-back as one not kept.
        catch (Autodesk.Revit.Exceptions.InvalidOperationException ex) { kept = false; thrown = ex.Message; }

        // Review C2 — claimed vs verified: what the model holds after the group, kept or not, is what the result and the row say.
        var present = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<View>()
            .Where(v => !v.IsTemplate && created.Contains(v.Name)).Select(v => v.Name).ToList();
        // MA-8-11 (amendment 6): the ledger records what the model holds after the group, kept or not, not what the loop claimed.
        var templatesNow = copiedNames.Count == 0 ? new List<string>()
            : new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().Where(v => v.IsTemplate && copiedNames.Contains(v.Name)).Select(v => v.Name).Distinct().ToList();
        var pinnedNow = pick.Pins.Select(p => doc.GetElement(p.Id.ToElementId())).Where(e => e != null && e.Pinned).ToList();
        int pinnedLevels = pinnedNow.Count(e => e is Level), pinnedGrids = pinnedNow.Count - pinnedLevels;
        if (!kept && present.Count + pinnedNow.Count + templatesNow.Count == 0)
        {
            string why = thrown != null ? "Revit refused the Undo group: " + thrown
                : !committed ? "Revit did not commit the transaction (a view or a datum it needs may be owned by another user)."
                : created.Count + claimedPins + copiedNames.Count == 0 ? "every ticked row failed:\n  • " + string.Join("\n  • ", failed)
                : "Revit did not keep the Undo group.";
            TaskDialog.Show(Title, "Nothing was created or pinned — " + why + "\nRead back from the model: no view, pin or view template of this run is in it — the model is as it was.");
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
        CommandReports.AnnotateMore? more = null;
        if (src != null)
        {
            var notIn = notCopied.Concat(templateRows.Where(r => r.Refusal != null).Select(r => (r.Name, r.Refusal!)))
                .Concat(copiedNames.Where(n => !templatesNow.Contains(n)).Select(n => (n, "not in the model after the Undo group")))
                .Concat(templateRows.Where(r => r.Refusal == null && !pick.Templates.Any(t => t.Name == r.Name)).Select(r => (r.Name, "not ticked"))).ToList();
            more = new CommandReports.AnnotateMore
            {
                FileName = src.FileName, Title = src.Title, Sha256 = src.Sha256, Format = src.Format, Opened = src.Opened, Seconds = src.Seconds,
                Copied = templatesNow, NotCopied = notIn,
            };
        }
        GovernedNotify.Report("Annotate", CommandReports.Annotate(present, levelsWithViews, skippedExisting, refused, failed.Count, unrouted, pinnedLevels, pinnedGrids,
            warnings.Count, storyNames.Count, pinnedNow.Select(e => e.Id.IdValue()).ToList(), pinnedLine, kept, guidelineLabel, rulesetLabel, UserSession.Actor, more), key);

        var sb = new StringBuilder();
        if (!kept)
            sb.AppendLine($"Revit committed this run but did not keep the Undo group (B31?): {present.Count} view(s), {pinnedNow.Count} pin(s) and {templatesNow.Count} view template(s) are in the model — the annotate ledger row is the record.").AppendLine();
        sb.AppendLine(words[0]).AppendLine(words[1]);
        sb.AppendLine($"Created: {present.Count} view(s). Pinned: {pinnedLevels} level(s) and {pinnedGrids} grid(s).");
        sb.AppendLine(pinnedLine);
        if (src != null)
            sb.AppendLine($"View templates: copied {templatesNow.Count} from {src.FileName} (sha256 {src.Sha256.Substring(0, 12)}…) — "
                + (src.Opened ? "opened in the background, closed unsaved." : "the file was already open and is still open, unchanged by Sentinel."));
        if (skippedExisting + refused > 0) sb.AppendLine($"Not created, as the preview said: {skippedExisting} already in the model, {refused} refused with a reason.");
        if (unrouted > 0) sb.AppendLine($"Not routed in the Project Browser: {unrouted} view(s) — no writable {string.Join(" / ", routeParams)} parameter.");
        if (failed.Count > 0)
        {
            sb.AppendLine().AppendLine("Failed (each view rolled back alone, each pin set or refused alone; the rest were kept):");
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
        finally
        {
            // MA-8-11: Cancel, a throw and success all end here; a file the person already held open is never closed.
            try { if (src != null && src.Opened) src.Doc.Close(false); }
            catch (Exception ex) { App.PanelVm?.LogDoctor($"Annotate: the office template file could not be closed in the background ({ex.Message}); close it by hand, unsaved."); }
        }
    }
}
