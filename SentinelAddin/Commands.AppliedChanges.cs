#nullable disable
// Revert (2026-10-20, docs/superpowers/specs/2026-10-20-revert-and-persisted-design.md §A): Coordinate ▸ Applied AI Changes. Opens at once and
// fills itself off Revit's thread: first any revert this PC made that the bridge has not recorded (sent again), then the person's role (a revert
// is a signed-in contributor's or above), the protection policy in force (protection@n, else the built-in default), and the project's applied
// changesets. Check revert and Revert run on Revit's thread through the event hub (ChangesetReverter); the ledger row is posted off it
// (RevertPlan.Send). Held like a review (ReviewChangesetsCommand.Hold): no changeset is applied and reverted at once on this PC.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

[Transaction(TransactionMode.Manual)]
public sealed class AppliedChangesCommand : IExternalCommand
{
    private const string Title = "Sentinel — Applied AI changes";
    private static readonly string[] Revertors = { "contributor", "lead", "owner" };

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { IsFamilyDocument: false } doc) return Result.Cancelled;
        if (ReviewChangesetsCommand.Held) { TaskDialog.Show(Title, ReviewChangesetsCommand.Busy); return Result.Cancelled; }
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { TaskDialog.Show(Title, ProjectContext.NotBound); return Result.Cancelled; }
        var key = ctx.Key;
        var win = new AppliedChangesWindow(key);
        DialogOwner.Attach(win, c);
        ReviewChangesetsCommand.Hold();
        win.Closed += (_, _) => ReviewChangesetsCommand.Release();
        ProtectionRules rules = null; // read with the list; null until then = the built-in default
        win.CheckRequested += cs => App.Events.Enqueue(doc, "check a revert", (_, d) =>
        {
            var o = ChangesetReverter.Run(d, cs, rules, commit: false);
            win.ShowPreview(cs, o.Error ?? RevertPlan.Preview(o.Reverted.Count, o.Kept.Select(k => (k.Label, k.Why)).ToList()), o.Error == null && o.Reverted.Count > 0);
        }, refusal => win.Say(refusal));
        win.RevertRequested += (cs, reason) => App.Events.Enqueue(doc, "revert a changeset", (_, d) =>
        {
            var o = ChangesetReverter.Run(d, cs, rules, commit: true);
            if (o.Error != null || o.Reverted.Count == 0) { win.Say(o.Error ?? RevertPlan.Preview(0, o.Kept.Select(k => (k.Label, k.Why)).ToList())); return; }
            var r = new RevertPlan.Record
            {
                Key = key, ChangesetId = cs.Id, Name = cs.Name, Guids = o.Reverted, Reason = reason, Tx = o.Tx, At = ProvenanceStamp.Now(),
                Kept = o.Kept.Select(k => new KeptRow { ProposalGuid = k.ProposalGuid, Why = k.Why.Length > 300 ? k.Why.Substring(0, 299) + "…" : k.Why }).ToList(),
            };
            // written before the post (UnreportedResults' rule): a revert the bridge never hears of is sent again, never lost
            var kept = RevertPlan.Write(r);
            SavedCheck.Forget(key, cs.Id); // no longer meant to be in the model: no saved check for it
            Task.Run(() =>
            {
                var words = $"Reverted in this model: {o.Reverted.Count} row(s) back, {o.Kept.Count} kept (one Undo step: \"{o.Tx}\").\n" + RevertPlan.Send(BcfConfig.Load(), r)
                            + (kept ? "" : "\nThis PC could not keep a record of it — if the line above says NOT posted, tell the project lead.");
                App.PanelVm?.LogDoctor("Applied AI Changes: " + words.Replace('\n', ' '));
                Load(win, key, null, words);
            });
        }, refusal => win.Say(refusal));
        win.Show();
        Load(win, key, rr => rules = rr, null);
        return Result.Succeeded;
    }

    /// <summary>Off Revit's thread: send waiting reverts, then read the role, the protection policy and the applied changesets into the window;
    /// <paramref name="after"/> (a revert's outcome) stays in the preview box.</summary>
    private static void Load(AppliedChangesWindow win, string key, Action<ProtectionRules> rulesRead, string after) => Task.Run(() =>
    {
        try
        {
            var cfg = BcfConfig.Load();
            var said = RevertPlan.ForKey(key).Select(r => RevertPlan.Send(cfg, r)).ToList();
            if (rulesRead != null)
            {
                var prot = ArtefactClient.Resolve(key, "protection");
                rulesRead(prot.Origin != "none" ? ProtectionRules.From(prot.BodyJson, prot.Label) : ProtectionRules.Default(prot.NotInstalled ? "none installed" : prot.Label));
            }
            var role = UserSession.IsSignedIn ? ChangesetClient.MyRole(cfg, key, out _) : null;
            var may = role != null && Revertors.Contains(role);
            var all = ChangesetClient.FetchAll(cfg, key, out var error);
            if (all == null) { win.SetList(new List<(string, ChangesetDto)>(), string.Join("\n", said.Append($"The bridge did not answer: {error}")), false); return; }
            var rows = all.Where(cs => cs.Status is "applied" or "partially_applied").OrderByDescending(cs => cs.CreatedAt ?? "", StringComparer.Ordinal)
                .Select(cs => ($"{cs.Name} · {cs.Source} · {RevertPlan.Applied(cs).Count} applied · filed {(cs.CreatedAt ?? "?").Replace('T', ' ').Split('.')[0]}\n{RevertPlan.State(cs)}", cs)).ToList();
            var who = !UserSession.IsSignedIn ? "You are not signed in — a revert is a signed-in person's act (Standards ▸ Sign in). You can read the list."
                    : !may ? $"Your role on {key} is {role ?? "unknown"} — a revert needs a contributor, lead or owner. You can read the list."
                    : "Select a changeset, press Check revert, read what would happen, type your reason, then Revert.";
            win.SetList(rows, string.Join("\n", said.Append(rows.Count == 0 ? "No applied changeset on this project." : $"{rows.Count} applied changeset(s), newest first. {who}")), may);
            if (after != null) win.Say(after);
        }
        catch (Exception ex) { win.SetList(new List<(string, ChangesetDto)>(), $"The list could not be read — {ex.GetType().Name}: {ex.Message}", false); }
    });
}
