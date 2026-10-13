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

    // MA-8-12: the types of a category, whatever their class (a room tag's type is no FamilySymbol on every version).
    private static List<ElementType> TypesOf(Document doc, BuiltInCategory bic) =>
        new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().OfType<ElementType>().ToList();

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
        // MA-8-12: with no sheets block there is nothing to plan for sheets - said once, in the words above the rows.
        if (guideline.Sheets == null) words.Add(SheetPlanner.NoSheetsBlock);
        words.Add(ViewPlanner.UndoWords());

        // MA-8-11 (ANV-3): view templates the creatable rows name that the model lacks can be copied from the office template file a lead
        // picks. It is opened detached in the background, never saved, and closed unsaved in the finally below (a file the person already
        // holds open is used and never closed). Nothing is opened unless the person picks the file.
        OfficeTemplateSource? src = null;
        var templateRows = new List<TemplateRow>();
        string? templatesHeader = null;
        var missing = ViewPlanner.Missing(plans, templates.Keys, SheetPlanner.Templates(guideline.Views, guideline.Sheets));
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

        // MA-8-12 (ANV-4, ANV-5): the sheets and tags of the one level the person picks in the preview. The title block and the tag types are looked up
        // here, in the model (Sentinel loads no families): a row whose title block or tag is not loaded is refused in words, never created without it.
        long titleBlockId = 0;
        var sheetNodes = new Dictionary<string, SheetNode>();
        Func<string, SheetNode>? sheetsFor = null;
        if (guideline.Sheets != null)
        {
            string tbText = guideline.Sheets.TitleBlock;
            int tbAt = tbText.IndexOf(" : ", StringComparison.Ordinal);
            string tbFamily = tbText.Substring(0, tbAt).Trim(), tbType = tbText.Substring(tbAt + 3).Trim();
            titleBlockId = TypesOf(doc, BuiltInCategory.OST_TitleBlocks).FirstOrDefault(e => e is FamilySymbol && e.FamilyName == tbFamily && e.Name == tbType)?.Id.IdValue() ?? 0;
            var sheetNumbers = new HashSet<string>(new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().Select(s => s.SheetNumber));
            string? tbWarning = null;
            bool tbChecked = false;
            sheetsFor = level =>
            {
                var node = sheetNodes[level] = new SheetNode { Sheets = SheetPlanner.Plan(guideline.Views, guideline.ViewNaming, guideline.Sheets, level, ruleset, taken, sheetNumbers) };
                if (!tbChecked)
                {
                    tbChecked = true; // the catalogue is read once, the first time a level is chosen, off the API thread
                    var cat = Task.Run(() => GhostStandards.Load(key, layers: false, guideline: false, catalog: true)).GetAwaiter().GetResult().Guideline;
                    tbWarning = !cat.HasCatalog ? "the type catalogue is not installed, so the title block is not checked against it"
                        : cat.CatalogHas("Title Blocks", tbFamily, tbType) ? null : "WARNING: it is not a Title Blocks row of the office type catalogue";
                }
                node.Lines.Add($"Title block {tbText}" + (titleBlockId == 0 ? " is not loaded in this model" : "") + (tbWarning != null ? " — " + tbWarning : "") + ".");
                var perLevel = SheetPlanner.NotPerLevel(guideline.Views);
                if (perLevel != null) node.Lines.Add(perLevel);
                if (titleBlockId == 0)
                    foreach (var s in node.Sheets.Where(s => s.Refusal == null))
                        s.Refusal = $"title block {tbText} not loaded — load it (Sentinel loads no families)";
                node.Tags = SheetPlanner.Tags(node.Sheets, guideline.Graphics);
                var typesByTag = new Dictionary<string, List<ElementType>>();
                foreach (var t in node.Tags.Where(t => t.Refusal == null))
                {
                    if (!typesByTag.TryGetValue(t.TagBic, out var all))
                        typesByTag[t.TagBic] = all = Enum.TryParse(t.TagBic, out BuiltInCategory tagBic) ? TypesOf(doc, tagBic) : new List<ElementType>();
                    var ofFamily = all.Where(e => e.FamilyName == t.Family).ToList();
                    var named = t.Type == null ? null : ofFamily.FirstOrDefault(e => e.Name == t.Type);
                    if (ofFamily.Count == 0) t.Refusal = $"tag family {t.Family} not loaded — load it (Sentinel loads no families)";
                    else if (t.Type != null && named == null) t.Refusal = $"tag type {t.Family} : {t.Type} not loaded";
                    else if (t.Type == null && ofFamily.Count > 1) t.Refusal = $"the guideline names the family {t.Family}, not which of its {ofFamily.Count} types";
                    else t.SymbolId = (named ?? ofFamily[0]).Id.IdValue();
                }
                return node;
            };
        }

        // A person decides: nothing is written before Create; Cancel writes nothing.
        var pick = new AnnotatePreviewWindow(plans, pins, words, templateRows, templatesHeader,
            sheetsFor == null ? null : stories.Where(l => l.IsStory).Select(l => l.Name).ToList(), sheetsFor);
        DialogOwner.Attach(pick, c);
        if (pick.ShowDialog() != true) return Result.Cancelled;
        if (pick.Views.Count + pick.Pins.Count + pick.Templates.Count + pick.Sheets.Count + pick.Tags.Count == 0)
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
        // MA-8-12: sheet views are kept out of `created` (that list stays the WIP views), so views_created and levelsWithViews keep their meaning.
        var sheetViews = new Dictionary<string, ElementId>();
        var sheetsMade = new List<(string Number, string Name, string View)>();
        var sheetsFailed = new List<(string Number, string Why)>();
        var tagRuns = new List<(string View, string Category, string Tag, string TagBic, int Placed, int Skipped, string? Why)>();
        var tagGaps = new List<(string Category, string Why)>();
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
                var usedNames = new HashSet<string>(pick.Views.Select(v => v.Template).Concat(pick.Sheets.Select(s => s.Template)));
                foreach (var tr in pick.Templates)
                {
                    if (!usedNames.Contains(tr.Name)) { notCopied.Add((tr.Name, "no ticked view or sheet uses it")); continue; }
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
                // MA-8-12 (ANV-4): each ticked sheet in its own SubTransaction - its view (the SH_ name, the sheet template), its sheet on the
                // guideline's title block, its viewport at the middle of the title block. A failure rolls back that sheet and its view, and is named.
                foreach (var sp in pick.Sheets)
                {
                    using var st = new SubTransaction(doc);
                    st.Start();
                    try
                    {
                        if (!NamingUtils.IsValidName(sp.ViewName)) throw new InvalidOperationException("Revit refuses this view name");
                        var view = ViewPlan.Create(doc, viewType[sp.ViewType], levelId[pick.SheetLevel!]);
                        view.Name = sp.ViewName;
                        bool tplUsed = templates.TryGetValue(sp.Template, out var tpl) && view.IsValidViewTemplate(tpl.Id);
                        if (tplUsed) view.ViewTemplateId = tpl!.Id;
                        if (!string.IsNullOrWhiteSpace(sp.BrowserStatus) && !ViewGenerator.SetFirstMatch(view, routeParams, sp.BrowserStatus)) unrouted++;
                        var tb = doc.GetElement(titleBlockId.ToElementId()) as FamilySymbol ?? throw new InvalidOperationException("the title block is no longer in the model");
                        if (!tb.IsActive) tb.Activate();
                        var sheet = ViewSheet.Create(doc, tb.Id);
                        sheet.SheetNumber = sp.Number;
                        sheet.Name = sp.Name;
                        doc.Regenerate();
                        var box = new FilteredElementCollector(doc, sheet.Id).OfCategory(BuiltInCategory.OST_TitleBlocks).FirstOrDefault()?.get_BoundingBox(sheet);
                        var centre = box != null ? (box.Min + box.Max) / 2 : XYZ.Zero;
                        if (!Viewport.CanAddViewToSheet(doc, sheet.Id, view.Id)) throw new InvalidOperationException("Revit says this view cannot go on this sheet");
                        Viewport.Create(doc, sheet.Id, view.Id, centre);
                        if (st.Commit() != TransactionStatus.Committed) throw new InvalidOperationException("Revit did not commit this sheet");
                        sheetViews[sp.ViewName] = view.Id;
                        sheetsMade.Add((sp.Number, sp.Name, sp.ViewName));
                        if (!tplUsed) warnings.Add($"View template '{sp.Template}' not in this model — '{sp.ViewName}' created without it.");
                    }
                    catch (Exception ex)
                    {
                        if (st.HasStarted() && !st.HasEnded()) st.RollBack();
                        failed.Add($"Sheet {sp.Number}: {ex.Message}");
                        sheetsFailed.Add((sp.Number, ex.Message));
                    }
                }
                // Amendment 9: a view made in this transaction answers a collector only after a regenerate (its template, its visibility).
                if (sheetViews.Count > 0) doc.Regenerate();
                // MA-8-12 (ANV-5): each ticked tag set in its own SubTransaction, on this run's sheet views only. Rooms go through NewRoomTag,
                // never IndependentTag (amendment 13). A tag Revit refuses is counted skipped with the first reason; the rest stay.
                foreach (var tg in pick.Tags)
                {
                    string label = tg.Family + (tg.Type != null ? " : " + tg.Type : "");
                    if (!sheetViews.TryGetValue(tg.ViewName, out var vid))
                    {
                        tagGaps.Add((tg.Category, SheetPlanner.SheetNotMade));
                        failed.Add($"Tags {tg.Category} in {tg.ViewName}: {SheetPlanner.SheetNotMade}");
                        continue;
                    }
                    using var st = new SubTransaction(doc);
                    st.Start();
                    int placed = 0, skipped = 0;
                    string? why = null;
                    try
                    {
                        if (!Enum.TryParse(tg.ElementBic, out BuiltInCategory elementBic)) throw new InvalidOperationException("no such category " + tg.ElementBic);
                        var symId = tg.SymbolId.ToElementId();
                        var view = (View)doc.GetElement(vid);
                        var elements = new FilteredElementCollector(doc, vid).OfCategory(elementBic).WhereElementIsNotElementType().ToList();
                        foreach (var e in elements)
                        {
                            try
                            {
                                if (tg.How == "room")
                                {
                                    var room = e as Autodesk.Revit.DB.Architecture.Room;
                                    if (room == null || room.Area <= 0 || room.LevelId != view.GenLevel?.Id) throw new InvalidOperationException("the room is not placed on this level");
                                    var at = (room.Location as LocationPoint)?.Point ?? throw new InvalidOperationException("the room has no location point");
                                    var tag = doc.Create.NewRoomTag(new LinkElementId(room.Id), new UV(at.X, at.Y), vid);
                                    tag.ChangeTypeId(symId);
                                }
                                else
                                {
                                    var at = (e.Location as LocationPoint)?.Point ?? (e.Location as LocationCurve)?.Curve.Evaluate(0.5, true)
                                        ?? (e.get_BoundingBox(view) is { } bb ? (bb.Min + bb.Max) / 2 : throw new InvalidOperationException("the element has no point in the view"));
                                    IndependentTag.Create(doc, symId, vid, new Reference(e), false, TagOrientation.Horizontal, at);
                                }
                                placed++;
                            }
                            catch (Exception ex) { skipped++; why ??= ex.Message; }
                        }
                        if (st.Commit() != TransactionStatus.Committed) throw new InvalidOperationException("Revit did not commit these tags");
                        tagRuns.Add((tg.ViewName, tg.Category, label, tg.TagBic, placed, skipped, why));
                    }
                    catch (Exception ex)
                    {
                        if (st.HasStarted() && !st.HasEnded()) st.RollBack();
                        failed.Add($"Tags {tg.Category} in {tg.ViewName}: {ex.Message}");
                        tagGaps.Add((tg.Category, ex.Message));
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
                return committed && created.Count + claimedPins + copiedNames.Count + sheetsMade.Count + tagRuns.Sum(r => r.Placed) > 0;
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
        // MA-8-12: the sheets with their viewports, and the tags per sheet view and category, as the model holds them after the group.
        var sheetsNow = new List<(string Number, string Name, string View, int Viewports)>();
        if (sheetsMade.Count > 0)
        {
            var madeBy = sheetsMade.ToDictionary(m => m.Number);
            foreach (var sh in new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>())
                if (madeBy.TryGetValue(sh.SheetNumber, out var m) && sh.Name == m.Name) sheetsNow.Add((sh.SheetNumber, sh.Name, m.View, sh.GetAllViewports().Count));
        }
        var tagsNow = new List<(string View, string Category, string Tag, int Placed, int Skipped, string? Why)>();
        if (tagRuns.Count > 0)
        {
            var viewIdByName = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<View>()
                .Where(v => !v.IsTemplate && sheetsNow.Any(s => s.View == v.Name)).ToDictionary(v => v.Name, v => v.Id);
            foreach (var r in tagRuns)
            {
                int held = viewIdByName.TryGetValue(r.View, out var vwId) && Enum.TryParse(r.TagBic, out BuiltInCategory heldBic)
                    ? new FilteredElementCollector(doc, vwId).OfCategory(heldBic).WhereElementIsNotElementType().GetElementCount() : 0;
                tagsNow.Add((r.View, r.Category, r.Tag, held, r.Skipped, r.Why));
            }
        }
        if (!kept && present.Count + pinnedNow.Count + templatesNow.Count + sheetsNow.Count + tagsNow.Sum(t => t.Placed) == 0)
        {
            string why = thrown != null ? "Revit refused the Undo group: " + thrown
                : !committed ? "Revit did not commit the transaction (a view or a datum it needs may be owned by another user)."
                : created.Count + claimedPins + copiedNames.Count + sheetsMade.Count + tagRuns.Sum(r => r.Placed) == 0 ? "every ticked row failed:\n  • " + string.Join("\n  • ", failed)
                : "Revit did not keep the Undo group.";
            TaskDialog.Show(Title, "Nothing was created or pinned — " + why + "\nRead back from the model: no view, pin, view template, sheet or tag of this run is in it — the model is as it was.");
            return Result.Failed;
        }

        // MA-8-12 (MH-VW-01): the printable plans of the chosen level on no sheet, less those on a WIP template (D12), read after the group.
        MhVw01Result? mh = null;
        if (pick.SheetLevel != null)
        {
            var onSheet = new HashSet<long>(new FilteredElementCollector(doc).OfClass(typeof(Viewport)).Cast<Viewport>().Select(vp => vp.ViewId.IdValue()));
            var wipTemplates = new HashSet<string>(guideline.Views.Where(v => !string.IsNullOrWhiteSpace(v.WipTemplate)).Select(v => v.WipTemplate));
            var facts = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<ViewPlan>().Select(v => new ViewFact
            {
                Name = v.Name, Level = v.GenLevel?.Name, IsTemplate = v.IsTemplate, Printable = v.CanBePrinted, OnSheet = onSheet.Contains(v.Id.IdValue()),
                Template = v.ViewTemplateId == ElementId.InvalidElementId ? null : doc.GetElement(v.ViewTemplateId)?.Name,
            }).ToList();
            mh = SheetPlanner.MhVw01(facts, pick.SheetLevel, wipTemplates);
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
        if (src != null || pick.SheetLevel != null) more = new CommandReports.AnnotateMore();
        if (pick.SheetLevel != null)
        {
            // The tag rows the plan refused for a sheet this run ticked are gaps beside the ones Revit refused.
            var planGaps = sheetNodes.TryGetValue(pick.SheetLevel, out var node)
                ? node.Tags.Where(t => t.Refusal != null && pick.Sheets.Any(s => s.ViewName == t.ViewName)).Select(t => (t.Category, t.Refusal)) : Enumerable.Empty<(string, string)>();
            more!.Level = pick.SheetLevel; more.Sheets = sheetsNow; more.SheetsFailed = sheetsFailed; more.Tags = tagsNow;
            more.TagGaps = planGaps.Concat(tagGaps).Distinct().ToList();
            if (mh != null) more.Mh = (mh.Level, mh.Count, mh.Names, mh.WipExcepted, mh.Line());
        }
        if (src != null)
        {
            var notIn = notCopied.Concat(templateRows.Where(r => r.Refusal != null).Select(r => (r.Name, r.Refusal!)))
                .Concat(copiedNames.Where(n => !templatesNow.Contains(n)).Select(n => (n, "not in the model after the Undo group")))
                .Concat(templateRows.Where(r => r.Refusal == null && !pick.Templates.Any(t => t.Name == r.Name)).Select(r => (r.Name, "not ticked"))).ToList();
            more!.FileName = src.FileName; more.Title = src.Title; more.Sha256 = src.Sha256; more.Format = src.Format; more.Opened = src.Opened;
            more.Seconds = src.Seconds; more.Copied = templatesNow; more.NotCopied = notIn;
        }
        GovernedNotify.Report("Annotate", CommandReports.Annotate(present, levelsWithViews, skippedExisting, refused, failed.Count, unrouted, pinnedLevels, pinnedGrids,
            warnings.Count, storyNames.Count, pinnedNow.Select(e => e.Id.IdValue()).ToList(), pinnedLine, kept, guidelineLabel, rulesetLabel, UserSession.Actor, more), key);

        var sb = new StringBuilder();
        if (!kept)
            sb.AppendLine($"Revit committed this run but did not keep the Undo group (B31?): {present.Count} view(s), {pinnedNow.Count} pin(s), {sheetsNow.Count} sheet(s) and {templatesNow.Count} view template(s) are in the model — the annotate ledger row is the record.").AppendLine();
        sb.AppendLine(words[0]).AppendLine(words[1]);
        sb.AppendLine($"Created: {present.Count} view(s). Pinned: {pinnedLevels} level(s) and {pinnedGrids} grid(s).");
        sb.AppendLine(pinnedLine);
        if (src != null)
            sb.AppendLine($"View templates: copied {templatesNow.Count} from {src.FileName} (sha256 {src.Sha256.Substring(0, 12)}…) — "
                + (src.Opened ? "opened in the background, closed unsaved." : "the file was already open and is still open, unchanged by Sentinel."));
        if (pick.SheetLevel != null)
        {
            sb.AppendLine($"Sheets on {pick.SheetLevel}: {sheetsNow.Count} made with {sheetsNow.Sum(s => s.Viewports)} viewport(s)" + (sheetsNow.Count > 0 ? " — " + string.Join(", ", sheetsNow.Select(s => s.Number)) : "") + ".");
            foreach (var g in tagsNow.GroupBy(t => t.Category))
                sb.AppendLine($"Tags, {g.Key} ({g.First().Tag}): {g.Sum(t => t.Placed)} in the model, {g.Sum(t => t.Skipped)} refused by Revit" + (g.Any(t => t.Why != null) ? " — " + g.First(t => t.Why != null).Why : "") + ".");
            if (mh != null) sb.AppendLine(mh.Line() + ".");
        }
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
