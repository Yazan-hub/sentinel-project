using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Commands;

/// <summary>
/// Annotate — step 3 of the datum → model → annotate chain. Creates the WIP plan views the `views` section of
/// the guideline@n installed on the document's web project (or its office) prescribes: one per plannable entry
/// per level, named to the office structure, view template applied, routed into the office Project Browser
/// structure. Idempotent: a view whose name already exists is skipped, so re-running is safe. With no guideline
/// it refuses and names the none — it never plans another office's views (cohesion 4b-2, F44).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class AnnotateViewsCommand : IExternalCommand
{
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
            TaskDialog.Show("Sentinel — Annotate", nothing);
            return Result.Cancelled;
        }

        var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
            .OrderBy(l => l.Elevation).ToList();
        if (levels.Count == 0)
        {
            TaskDialog.Show("Sentinel — Annotate", "No Levels in the model — run Datum from Drawings first.");
            return Result.Cancelled;
        }

        var plans = ViewPlanner.Plan(guideline.Views, guideline.ViewNaming,
            levels.Select(l => l.Name).ToList());
        if (plans.Count == 0)
        {
            TaskDialog.Show("Sentinel — Annotate", $"Guideline: {guidelineLabel}\nIts views section has no plannable (FloorPlan/CeilingPlan) entries — nothing to create.");
            return Result.Cancelled;
        }

        // Caches: existing view names (idempotency), templates by name, VFTs, levels by name.
        var allViews = new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().ToList();
        // Includes template names too: View.Name = ... throws if a VIEW TEMPLATE already holds that
        // name, even when no non-template view does.
        var taken = new HashSet<string>(allViews.Select(v => v.Name));
        var templates = allViews.Where(v => v.IsTemplate)
            .GroupBy(v => v.Name).ToDictionary(g => g.Key, g => g.First());
        var vfts = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType))
            .Cast<ViewFamilyType>().ToList();
        var levelByName = levels.GroupBy(l => l.Name).ToDictionary(g => g.Key, g => g.First());

        int created = 0, skippedExisting = 0;
        var warnings = new List<string>();

        using var t = new Transaction(doc, "Sentinel — Annotate: guideline views");
        t.Start();
        foreach (var p in plans)
        {
            if (taken.Contains(p.Name)) { skippedExisting++; continue; }
            if (!levelByName.TryGetValue(p.LevelName, out Level level)) continue;

            var family = p.ViewType == "CeilingPlan" ? ViewFamily.CeilingPlan : ViewFamily.FloorPlan;
            var vft = vfts.FirstOrDefault(v => v.ViewFamily == family);
            if (vft is null) { warnings.Add($"No {family} view family type in this model — skipped '{p.Name}'."); continue; }

            var view = ViewPlan.Create(doc, vft.Id, level.Id);
            view.Name = p.Name;
            taken.Add(p.Name);

            if (!string.IsNullOrWhiteSpace(p.Template))
            {
                if (templates.TryGetValue(p.Template, out View tpl)) view.ViewTemplateId = tpl.Id;
                else warnings.Add($"View template '{p.Template}' not in this model — '{p.Name}' created without it.");
            }

            if (!string.IsNullOrWhiteSpace(p.BrowserStatus))
                ViewGenerator.SetFirstMatch(view, OrgNames.MainGroupParams(App.OrgFor(doc)), p.BrowserStatus);

            created++;
        }
        if (t.Commit() != TransactionStatus.Committed)
        {
            TaskDialog.Show("Sentinel — Annotate", "Nothing was created — Revit did not commit the transaction (a view it needs may be owned by another user). The model is as it was.");
            return Result.Failed;
        }
        // MA-1a item 7: one annotate row for the run, sent off this thread; the pane's log says what the ledger answered.
        if (created > 0)
            GovernedNotify.Report("Annotate", CommandReports.Annotate(created, skippedExisting, warnings.Count, levels.Count, guidelineLabel, UserSession.Actor), key);

        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"Guideline: {guidelineLabel}"); // what planned these views
        sb.AppendLine($"Created: {created} view(s) across {levels.Count} level(s).");
        if (skippedExisting > 0) sb.AppendLine($"Skipped (already exist): {skippedExisting}");
        if (warnings.Count > 0)
        {
            sb.AppendLine().AppendLine("Warnings:");
            foreach (var g in warnings.GroupBy(w => w))
                sb.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        TaskDialog.Show("Sentinel — Annotate", sb.ToString());
        return Result.Succeeded;
    }
}
