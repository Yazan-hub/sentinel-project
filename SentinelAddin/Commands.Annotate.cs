using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Commands;

/// <summary>
/// Annotate — step 3 of the datum → model → annotate chain. Creates the WIP plan views the
/// Office Modelling Guideline's `views` section prescribes: one per plannable entry per level,
/// named to the office structure, view template applied, routed into the office Project Browser
/// structure. Idempotent: a view whose name already exists is skipped, so re-running is safe.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class AnnotateViewsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        var settings = SettingsManager.Resolve(doc);
        var guideline = GuidelineMatcher.Load(
            string.IsNullOrWhiteSpace(settings.GhostGuidelinePath) ? null : settings.GhostGuidelinePath,
            string.IsNullOrWhiteSpace(settings.GhostTypeCatalogPath) ? null : settings.GhostTypeCatalogPath);

        if (guideline.Views is null || guideline.Views.Count == 0)
        {
            TaskDialog.Show("Sentinel — Annotate",
                "The guideline has no `views` section — nothing to create.\n" +
                $"Guideline: {guideline.Standard}");
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
            TaskDialog.Show("Sentinel — Annotate", "The guideline's views section has no plannable (FloorPlan/CeilingPlan) entries.");
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
                ViewGenerator.SetFirstMatch(view, ViewGenerator.MainGroupParams, p.BrowserStatus);

            created++;
        }
        t.Commit();

        var sb = new System.Text.StringBuilder();
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
