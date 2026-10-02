#nullable disable
// MA-1a item 6, the Revit half: the one place Sentinel writes an element's workset and phase, and the one place it asks
// whether a design option is being edited. Every placer calls it — ChangesetExecutor (Ghost Builder, Review AI Proposals,
// Promote), DatumBuilder and Photo Massing's PlacePrepared — inside its own transaction, after its creates and before its
// stamp, so one Ctrl+Z removes the elements with their workset and phase. The decisions and every word are
// PlacementPolicy's (pure, tools/promote-check). It never creates a workset and never switches the active one.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    /// <summary>Review amendments C5, C29: Revit refused a placement write on a created element (a workset owned by another
    /// user, a read-only parameter, a phase it will not take) — by answering false or by throwing. It is this session's model state, not a verdict on the changeset: the placer rolls its
    /// transaction back, and the executor answers NotRun, so the changeset stays proposed — as for the other refusals of
    /// item 6.</summary>
    public sealed class PlacementRefused : InvalidOperationException
    {
        public PlacementRefused(string message) : base(message) { }
    }

    /// <summary>One placement run: the guideline's block (null = none), the model's user worksets, the active view's phase,
    /// and what was written on each element.</summary>
    public sealed class PlacementPlan
    {
        public GuidelinePlacement Block;
        public bool Workshared;
        /// <summary>The model's user worksets by name; null when the workset part does not run (no block, no workset
        /// named, or the model is not workshared).</summary>
        public Dictionary<string, int> WorksetIds;
        /// <summary>The active view's phase; null = the phase is left alone.</summary>
        public ElementId PhaseId;
        public string PhaseName;
        /// <summary>What Apply wrote, per element (review amendment C6).</summary>
        public readonly PlacementPolicy.Written Written = new PlacementPolicy.Written();

        /// <summary>The summary lines, counted from the elements still in the model: call it after the commit and the
        /// placer's own recount, with the UniqueIds of what survived. An element Revit removed at commit is in no count,
        /// and a phase is counted as set only where the element still has it (drill MA1a-I68: Revit moved a door to its
        /// wall's phase).</summary>
        public List<string> Lines(Document doc, IEnumerable<string> survivingUniqueIds) =>
            PlacementPolicy.Lines(Block, Workshared, Written.Surviving(survivingUniqueIds, uid => doc.GetElement(uid)?.CreatedPhaseId == PhaseId), PhaseName);
    }

    public static class PlacementApply
    {
        /// <summary>Null, or the refusal when a design option is being edited: Sentinel never places into one, with or
        /// without a guideline. <paramref name="what"/> is the action to repeat.</summary>
        public static string DesignOptionRefusal(Document doc, string what)
        {
            var id = DesignOption.GetActiveDesignOptionId(doc);
            if (id == null || id == ElementId.InvalidElementId) return null;
            return PlacementPolicy.DesignOptionRefusal(doc.GetElement(id)?.Name ?? "(unnamed)", what);
        }

        /// <summary>Read what the block needs from the model, before any transaction: the user worksets (a workshared model
        /// only) and the active view's phase. Null with <paramref name="refusal"/> when a batch of these
        /// <paramref name="kinds"/> needs a workset the model does not have — a named thing that is missing is refused,
        /// never replaced. With no block the plan sets nothing and its Lines say so. A view of another document gives no
        /// phase (review amendment C17): two models from one template share phase ids, and this model's elements are never
        /// phased by another model's view.</summary>
        public static PlacementPlan Resolve(Document doc, GuidelinePlacement block, View view, IEnumerable<string> kinds, out string refusal)
        {
            refusal = null;
            if (view != null && !view.Document.Equals(doc)) view = null;
            var plan = new PlacementPlan { Block = block, Workshared = doc.IsWorkshared };
            if (block == null) return plan;
            if (doc.IsWorkshared && block.Worksets != null && block.Worksets.Count > 0)
            {
                var ids = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                foreach (Workset w in new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset)) ids[w.Name] = w.Id.IntegerValue;
                var missing = PlacementPolicy.MissingWorksets(block, kinds, ids.Keys);
                if (missing.Count > 0) { refusal = PlacementPolicy.MissingWorksetRefusal(missing); return null; }
                plan.WorksetIds = ids;
            }
            if (block.Phase == "view" && view != null
                && doc.GetElement(view.get_Parameter(BuiltInParameter.VIEW_PHASE)?.AsElementId() ?? ElementId.InvalidElementId) is Phase phase)
            {
                plan.PhaseId = phase.Id;
                plan.PhaseName = phase.Name;
            }
            return plan;
        }

        /// <summary>Put each created element on the workset its category names and in the plan's phase. Inside the placer's
        /// open transaction. An element whose category the block names no workset for stays on the active workset (recorded);
        /// an element with no phase (a level, a grid) keeps none. A workset or a phase Revit will not set — it answers false,
        /// or it throws (review amendment C29) — throws PlacementRefused: the placer rolls the whole batch back. What was written is recorded per element (plan.Written); the lines are counted
        /// from it after the commit.</summary>
        public static void Apply(PlacementPlan plan, IEnumerable<Element> created)
        {
            if (plan?.Block == null) return;
            foreach (var e in created)
            {
                if (e == null) continue;
                try { ApplyOne(plan, e); }
                catch (Exception ex) when (!(ex is PlacementRefused))
                {
                    // Whatever Revit throws on these writes is this session's model state, like a write it answers false to:
                    // never a verdict on the changeset (the executor's general catch would report it as declined).
                    string who = e.IsValidObject ? e.Category?.Name + " " + e.UniqueId : "an element Revit no longer holds";
                    throw new PlacementRefused(PlacementPolicy.WriteRefusal(who, ex.GetType().Name + ": " + ex.Message));
                }
            }
        }

        private static void ApplyOne(PlacementPlan plan, Element e)
        {
            string workset = null, unnamed = null;
            if (plan.WorksetIds != null)
            {
                // Locale-safe: the element's BuiltInCategory against the ten English category names a block may use
                // (Compat), then the block's own key for that category, whatever its case or padding.
                string category = GuidelineMatcher.PlacementCategories.FirstOrDefault(c => e.Category != null && e.Category.MatchesCategoryKey(c));
                string name = PlacementPolicy.WorksetFor(plan.Block, category);
                if (string.IsNullOrEmpty(name)) unnamed = e.Category?.Name ?? "no category";
                else
                {
                    var p = e.get_Parameter(BuiltInParameter.ELEM_PARTITION_PARAM);
                    if (!plan.WorksetIds.TryGetValue(name, out int id) || p == null || p.IsReadOnly || !p.Set(id))
                        throw new PlacementRefused($"Nothing was placed — Revit would not put {e.Category?.Name} {e.UniqueId} on workset \"{name}\" (the workset may be owned by another user, or not editable here).");
                    workset = name;
                }
            }
            bool phased = plan.PhaseId != null && e.HasPhases() && e.ArePhasesModifiable();
            if (phased) e.CreatedPhaseId = plan.PhaseId;
            plan.Written.Add(e.UniqueId, workset, unnamed, phased);
        }
    }
}
