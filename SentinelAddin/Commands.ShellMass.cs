#nullable disable
// MA-6-4 Shell a Mass (C6, design §3.3 row 8) — the ribbon entry, Model from Drawings ▸ 2c. Pick a mass (an in-place or loaded mass, a
// DirectShape in Mass, or a Sentinel DirectShape placed as a Generic Model); ShellReader cuts it at each Building Story level on the API
// thread; the changesets waiting for review and the guideline and type catalogue are read off it; ShellPlanner plans typed walls, a floor
// per storey and a flat roof; the dialog shows the plan (No = read-only) and Yes files it through the reviewed changeset path as source
// promote (one changeset up to 200 elements: one review, one Undo; else one per storey) and opens the review. Promote's pieces, not its
// planner: the review guard (Hold/Release), DocPin hops, a waiting Promote or Shell changeset reopened instead of planning on top of it.
// No FaceWall (MA-6 D1): a face wall spans every storey, so it is not level-bound and breaks one Undo per storey. Nothing here writes to
// the model — the executor does, after a person ticks and clicks Apply.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Commands;

[Transaction(TransactionMode.Manual)]
public sealed class ShellMassCommand : IExternalCommand
{
    private const string Title = "Sentinel — Shell a Mass";

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        var doc = uidoc?.Document;
        if (doc is null || doc.IsFamilyDocument) return Result.Cancelled;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show(Title, ProjectContext.NotBound);
            return Result.Cancelled;
        }
        if (ReviewChangesetsCommand.Held)
        {
            TaskDialog.Show(Title, ReviewChangesetsCommand.Busy);
            return Result.Cancelled;
        }

        // The pick: a selected mass, else a pick restricted to masses. PickObject cannot say there is nothing to pick — said first.
        Element mass;
        var selected = uidoc.Selection.GetElementIds();
        if (selected.Count == 1 && MassOnly.Is(doc.GetElement(selected.First()))) mass = doc.GetElement(selected.First());
        else
        {
            if (!MassOnly.Any(doc, null))
            {
                TaskDialog.Show(Title, "This model has no mass — model one (Massing & Site ▸ In-Place Mass), place a mass family, or run 2b · Photo Massing and apply its changeset."); // MA-6-6: Photo Massing files a mass
                return Result.Cancelled;
            }
            if (!MassOnly.Any(doc, uidoc.ActiveView))
            {
                TaskDialog.Show(Title, "No mass shows in this view — in a plan or 3D view, turn on Show Mass (Massing & Site) to see and pick an in-place mass, or select the mass first.");
                return Result.Cancelled;
            }
            try { mass = doc.GetElement(uidoc.Selection.PickObject(ObjectType.Element, new MassOnly(), "Pick the mass to shell")); }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
        }
        if (mass == null) return Result.Cancelled;

        // API thread, read-only: the mass's storeys and sections, and the types the planner may name.
        ShellFacts facts;
        string refusal;
        try { facts = ShellReader.Read(doc, mass, out refusal); }
        catch (Exception ex) { facts = null; refusal = $"Revit could not read it — {ex.Message}"; } // R5: said, never a throw out of the command
        if (facts == null)
        {
            TaskDialog.Show(Title, $"Mass {mass.Id.IdValue()} cannot be shelled — {refusal}\n\nNothing was planned or filed.");
            return Result.Cancelled;
        }

        var cfg = BcfConfig.Load();
        var key = ctx.Key;
        ReviewChangesetsCommand.Hold(); // released by Plan, or by the filing it hands the guard to
        App.PanelVm?.LogDoctor("Shell a Mass: reading the bridge (the changesets waiting for review, the guideline and type catalogue) off Revit's thread — Revit stays usable, and the dialog opens by itself.");
        Task.Run(() =>
        {
            var pending = ChangesetClient.FetchProposed(cfg, key, out var err);
            return (Pending: pending, Err: err, Standards: pending == null || pending.Any(ReviewChangesetsCommand.StoreyRun) ? null : GhostStandards.Load(key, layers: false));
        }).ContinueWith(read => App.Events.Enqueue(doc, "plan Shell a Mass", (ui, d) =>
        {
            var held = 1;
            void Once() { if (System.Threading.Interlocked.Exchange(ref held, 0) == 1) ReviewChangesetsCommand.Release(); }
            var handed = false;
            try { handed = PlanAndFile(ui, d, cfg, key, facts, read, Once); }
            finally { if (!handed) Once(); }
        }, why => { ReviewChangesetsCommand.Release(); TaskDialog.Show(Title, why); }), TaskScheduler.Default);
        return Result.Succeeded;
    }

    // On Revit's thread in the model the command started from (DocPin): plans, asks, and hands the guard to the filing (true) or not.
    private static bool PlanAndFile(UIApplication ui, Document doc, BcfConfig cfg, string key, ShellFacts facts,
                                    Task<(List<ChangesetDto> Pending, string Err, GhostStandards Standards)> read, Action release)
    {
        if (ProjectContext.For(doc).Key != key)
        {
            TaskDialog.Show(Title, $"This model's project changed while Shell a Mass read the bridge (was {key}) — nothing was planned or filed. Run Shell a Mass again.");
            return false;
        }
        if (read.Status != TaskStatus.RanToCompletion)
        {
            TaskDialog.Show(Title, "Shell a Mass could not read the bridge — " + (read.Exception?.GetBaseException().Message ?? "the read did not finish") + "\nNothing was planned or filed.");
            return false;
        }
        var (pending, fetchErr, standards) = read.Result;
        if (pending == null)
        {
            TaskDialog.Show(Title, $"Couldn't reach the bridge:\n{fetchErr}");
            return false;
        }
        // A Promote or Shell changeset still waiting for review is opened instead — a shell is never planned on top of one.
        var unreviewed = pending.FirstOrDefault(ReviewChangesetsCommand.StoreyRun); // review round 3: a pending stair or terrain is not a storey run
        if (unreviewed != null)
        {
            TaskDialog.Show(Title, $"\"{unreviewed.Name}\" is still waiting for review — it opens now. Apply or decline it, then run Shell a Mass again.");
            release(); // Open checks the guard
            ReviewChangesetsCommand.Open(ui, doc, cfg, key, StoreyBatch.Of(pending, unreviewed));
            return false;
        }
        var m = standards.Guideline;
        if (!m.HasGuideline)
        {
            TaskDialog.Show(Title, $"Guideline: {standards.GuidelineSource.Label}\n\nNo DD rule file is installed for \"{key}\" or its office — nothing to plan. Install one as guideline@n.");
            return false;
        }
        if (!m.HasCatalog) // Promote's words: with none, the matcher answers unchecked — not an exact match
        {
            TaskDialog.Show(Title, $"No type catalogue installed ({m.CatalogLabel}) — the exact DD type cannot be checked (D16). Nothing was planned or filed.");
            return false;
        }

        var clock = System.Diagnostics.Stopwatch.StartNew();
        var plan = ShellPlanner.Plan(facts, m, curtain: true); // MA-6-5: facade rules may type a curtain wall
        var actor = UserSession.Actor;
        var bodies = ShellPlanner.Bodies(plan, facts, actor);
        clock.Stop();
        var held = plan.Held.Select(h => $"{h.Name}: {h.Reason}").ToList();
        var dlg = new TaskDialog(Title)
        {
            MainInstruction = bodies.Count == 0 ? $"Nothing to file: no storey of {facts.MassLabel} can be shelled." : $"File the shell of {facts.MassLabel} for review?",
            MainContent = standards.Header + (m.IsDraft ? "\nDRAFT rules: install them on a throwaway project only." : "") + "\n\n" + string.Join("\n", plan.Lines) +
                          (bodies.Count == 0 ? "" : "\n\n" + (bodies.Count == 1 ? $"{plan.Count} element(s) in 1 changeset (one review, one Undo)."
                              : $"{plan.Count} element(s) in {bodies.Count} changesets, one per storey — the first opens for review; Review AI Proposals lists the rest.") +
                              " Nothing is pre-ticked: you tick each element in the review, and nothing is placed until you apply it.") +
                          (held.Count > 0 ? $"\n\n{held.Count} row(s) sent to a person" + (bodies.Count > 0 ? " — they ride on the first changeset filed." : " — nothing is filed, so they are listed only here.") : "") +
                          (bodies.Count > 0 ? "\n\nNo = a read-only run: nothing is filed, nothing in the model changes." : ""),
            CommonButtons = bodies.Count == 0 ? TaskDialogCommonButtons.Ok : TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No,
        };
        if (held.Count > 0) dlg.ExpandedContent = "Sent to a person:\n" + string.Join("\n", held.Take(40)) + (held.Count > 40 ? $"\n… and {held.Count - 40} more" : "");
        if (dlg.Show() != TaskDialogResult.Yes) return false;

        // Off Revit's thread, as Promote files (MA-3b5): the guard stays held until the bridge has answered the last filing; the review opens
        // back on Revit's thread in this model only. Review C11: signed in, the filing carries the person's token or none, never the PC's.
        var pane = System.Windows.Threading.Dispatcher.CurrentDispatcher;
        var title = doc.Title;
        var fileCfg = BcfConfig.Load(); if (UserSession.IsSignedIn) fileCfg.FileToken = "";
        App.PanelVm?.LogDoctor($"Shell a Mass: filing {bodies.Count} changeset(s) off Revit's thread — the review opens by itself in this model once the bridge has answered.");
        Task.Run(() =>
        {
            ChangesetDto first = null;
            var filed = new List<ChangesetDto>();
            string said = "";
            try
            {
                // Stops after the first filing that fails: the rest are not sent (the held rows ride on the first).
                foreach (var body in bodies)
                {
                    var cs = ChangesetClient.Propose(fileCfg, key, body, out var err);
                    if (cs == null) { said = $"{bodies.Count - filed.Count} of {bodies.Count} changeset(s) were not filed — {err ?? "not filed"}" + (first == null && held.Count > 0 ? "; the rows sent to a person reached no changeset (listed in the dialog only)" : ""); break; }
                    first ??= cs;
                    filed.Add(cs);
                }
            }
            catch (Exception ex) { said = $"Shell a Mass's filing stopped — {ex.GetType().Name}: {ex.Message}"; }
            finally { release(); }
            // MA-6-4 review: once a filed storey is applied, ShellReader refuses this mass (walls stand inside it) — the rest is never shelled.
            if (filed.Count > 0 && filed.Count < bodies.Count)
                said += "\nDecline the storey changeset(s) Shell a Mass filed, then run it again — once one is applied, Shell plans no more of this mass.";
            if (filed.Count > 0)
            {
                try
                {
                    // MA-6 amendment 12: the planner's build:run receipt, as every other placer posts one — deterministic, no model, no tokens.
                    var receipt = new BuildReceipt.Facts { Seconds = clock.Elapsed.TotalSeconds, Candidates = facts.Storeys.Count };
                    receipt.Parameters["mass"] = facts.MassLabel;
                    receipt.Parameters["guideline"] = standards.GuidelineSource.Label;
                    receipt.Parameters["type_catalog"] = standards.CatalogSource.Label;
                    GovernedNotify.Report("Shell a Mass receipt", BuildReceipt.Run("shell-mass", BuildReceipt.AddinSha256, receipt, plan.Held.Count, filed.Select(f => f.Id).ToList(), actor), key, pane);
                }
                catch (Exception ex) { said += (said.Length > 0 ? "\n" : "") + $"Shell a Mass's receipt was not sent — {ex.GetType().Name}: {ex.Message}"; }
            }
            App.PanelVm?.LogDoctor($"Shell a Mass: {filed.Count} of {bodies.Count} changeset(s) filed (confirmed by the bridge) — the filing is done.");
            if (first == null) { App.Events.Enqueue(_ => TaskDialog.Show(Title, said)); return; }
            string NotOpened(string why) => why + $"\n\n{filed.Count} changeset(s) Shell a Mass filed wait for review — in \"{title}\", run Review AI Proposals." + (said.Length > 0 ? "\n\n" + said : "");
            App.Events.Enqueue(doc, "open the review of the shell", (u, d) =>
            {
                if (ProjectContext.For(d).Key != key) { TaskDialog.Show(Title, NotOpened($"This model's project changed while Shell a Mass filed (was {key})")); return; }
                if (said.Length > 0) TaskDialog.Show(Title, said);
                if (ReviewChangesetsCommand.Held) { TaskDialog.Show(Title, NotOpened(ReviewChangesetsCommand.Busy)); return; }
                ReviewChangesetsCommand.Open(u, d, cfg, key, StoreyBatch.Of(filed, first));
            }, why => TaskDialog.Show(Title, NotOpened(why)));
        });
        return true;
    }
}

/// <summary>MA-6-4: what Shell a Mass may pick — an element in Mass (an in-place or loaded mass, a DirectShape in Mass) or (MA-6 amendment 11)
/// a DirectShape Sentinel placed, whatever its category (Photo Massing's Generic Model fallback, D13).</summary>
internal sealed class MassOnly : ISelectionFilter
{
    public static bool Is(Element e) => e != null && (e.Category?.Id.IdValue() == (long)BuiltInCategory.OST_Mass || e is DirectShape ds && ds.ApplicationId == "Sentinel");

    /// <summary>Is there one in the model (<paramref name="view"/> null), or one this view shows?</summary>
    public static bool Any(Document doc, View view)
    {
        FilteredElementCollector In() => view == null ? new FilteredElementCollector(doc) : new FilteredElementCollector(doc, view.Id);
        try
        {
            return In().OfCategory(BuiltInCategory.OST_Mass).WhereElementIsNotElementType().Any()
                   || In().OfClass(typeof(DirectShape)).Cast<DirectShape>().Any(d => d.ApplicationId == "Sentinel");
        }
        catch (Exception) { return true; } // a view that holds no elements (a schedule): the pick says what it can
    }

    public bool AllowElement(Element e) => Is(e);
    public bool AllowReference(Reference r, XYZ p) => false;
}
