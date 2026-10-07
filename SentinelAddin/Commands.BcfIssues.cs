using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Windows.Interop;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Zero-License BCF Sync — the Revit-side entry point. Opens a modeless list of the coordination
/// issues non-Revit users raised on the web (via bridge/bcf-service.mjs), and on click navigates the
/// author straight to the element + camera.
///
/// Threading: fetch is async network (no Revit API, safe off the UI thread); applying a viewpoint is
/// funneled through <see cref="BcfApplyEvent"/> (ExternalEvent → runs on the API thread only when
/// Revit is idle, so it can never interrupt a command/transaction/worksharing sync).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class BcfIssuesCommand : IExternalCommand
{
    private const double FeetToMeters = 0.3048;

    /// <summary>API thread only. The selected elements' IFC GlobalIds (the IFC_GUID parameter, else the id the IFC
    /// export gives them — the same mapping BcfApplyEvent reads back) and, when the active view is 3D, its camera in
    /// BCF terms (shared coordinates, metres; the inverse of BcfApplyEvent.ToRevit). <paramref name="pointsAt"/> says
    /// what the issue will point at, for the dialog.</summary>
    internal static IssueDraft CaptureIssue(UIDocument uidoc, out string pointsAt)
    {
        var doc = uidoc.Document;
        var draft = new IssueDraft { Author = UserSession.Actor };
        var cats = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var id in uidoc.Selection.GetElementIds())
        {
            var e = doc.GetElement(id);
            if (e == null || e is ElementType) continue;
            string? g = e.get_Parameter(BuiltInParameter.IFC_GUID)?.AsString();
            if (string.IsNullOrWhiteSpace(g)) { try { g = BcfApplyEvent.ToIfcGuid(ExportUtils.GetExportId(doc, id)); } catch { continue; } }
            if (string.IsNullOrWhiteSpace(g)) continue;
            draft.IfcGuids.Add(g!);
            var c = e.Category?.Name ?? "Other";
            cats[c] = cats.TryGetValue(c, out var n) ? n + 1 : 1;
        }
        if (uidoc.ActiveView is View3D v3 && !v3.IsTemplate)
        {
            var o = v3.GetOrientation();
            var toShared = doc.ActiveProjectLocation.GetTotalTransform().Inverse; // shared → internal, inverted
            Vec3 V(XYZ p) => new() { X = p.X, Y = p.Y, Z = p.Z };
            draft.Camera = new PerspectiveCamera
            {
                ViewPoint = V(toShared.OfPoint(o.EyePosition) * FeetToMeters),
                Direction = V(toShared.OfVector(o.ForwardDirection).Normalize()),
                UpVector = V(toShared.OfVector(o.UpDirection).Normalize()),
                FieldOfView = 60.0,
            };
            draft.CameraNote = v3.IsPerspective ? $"camera from '{v3.Name}'" : $"camera from '{v3.Name}' (isometric, sent as a 60° perspective)";
        }
        else draft.CameraNote = "no camera (the active view is not 3D)";
        var what = string.Join(", ", cats.OrderByDescending(kv => kv.Value).Select(kv => $"{kv.Value} × {kv.Key}"));
        draft.Description = what.Length == 0 ? "" : $"Raised from Revit on {what} in '{doc.Title}'.";
        pointsAt = draft.IfcGuids.Count == 0
            ? "Nothing selected."
            : $"Points at {draft.IfcGuids.Count} element(s): {what} · {draft.CameraNote}.";
        return draft;
    }

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uiapp = c.Application;
        if (uiapp.ActiveUIDocument?.Document is null) return Result.Cancelled;

        // The OPEN model's web project governs which issues are listed, commented and resolved — there is no
        // machine-wide default. Found live: a model on its own project listed another project's issues.
        var ctx = ProjectContext.For(uiapp.ActiveUIDocument.Document);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — BCF Issues", ProjectContext.NotBound);
            return Result.Cancelled;
        }
        var bcfKey = ctx.Key;
        var mainHandle = uiapp.MainWindowHandle;   // captured here: the UIApplication is only valid inside Execute
        BcfConfig cfg = BcfConfig.Load();
        var apply = new BcfApplyEvent(uiapp.ActiveUIDocument.Document);
        string token;
        try { token = cfg.ServiceToken; }
        catch (SessionException e) { TaskDialog.Show("Sentinel — BCF Issues", e.Message); return Result.Cancelled; }
        var sync = new BcfSyncManager(cfg.ServiceUrl, token);

        var window = new BcfIssuesWindow();
        new WindowInteropHelper(window) { Owner = uiapp.MainWindowHandle };

        // SEC-7: the window owns no ExternalEvent — each Revit action goes through the event hub (labelled, watched, said and
        // raised again when Revit does not take it). The request is staged inside the job, on Revit's thread, so two clicks
        // never share one staging.
        void Apply(string what, System.Action<UIApplication> job)
        {
            if (App.Events == null) { window.SetStatus("Sentinel's event hub is not running — restart Revit."); return; }
            App.Events.Enqueue(job, what);
        }
        // Jump to an issue: its first viewpoint, applied on the API thread.
        window.TopicActivated += topic =>
        {
            BcfViewpoint? vp = topic.Viewpoints.FirstOrDefault();
            if (vp is null) { window.SetStatus("This issue has no viewpoint."); return; }
            Apply("open the issue", ua => { apply.RequestApply(vp); apply.Execute(ua); });
        };
        // Isolate every element linked to any open issue.
        window.IsolateAllRequested += () => Apply("isolate the issue elements", ua => { apply.RequestIsolateAll(window.Topics); apply.Execute(ua); });
        // Which issue(s) is the current Revit selection linked to?
        window.IssuesForSelectionRequested += () => Apply("match the selection to issues", ua => { apply.RequestIssuesForSelection(window.Topics); apply.Execute(ua); });

        apply.Applied += summary => window.SetStatus(summary);
        apply.SelectionMatched += (matched, msg) => { window.HighlightTopics(matched); window.SetStatus(msg); };

        // Fetch on a background continuation; window updates marshal via its dispatcher.
        async void Refresh()
        {
            window.SetStatus("Fetching open issues…");
            try
            {
                // The bearer is read per fetch, off Revit's thread (a refresh may block): a sign-in or out since the window opened counts.
                var topics = await Task.Run(() => sync.FetchActiveAsync(bcfKey, cfg.ModelId, () => BcfConfig.Load().ServiceToken)).ConfigureAwait(false);
                window.SetTopics(topics);
                window.SetStatus(topics.Count == 0
                    ? "No open issues. (Raise one from the web viewer.)"
                    : $"{topics.Count} open issue(s). Double-click to zoom in Revit.");
            }
            catch (SessionException ex) { window.SetStatus(ex.Message); }
            catch (Exception ex)
            {
                window.SetStatus($"Could not reach the BCF service at {cfg.ServiceUrl}\n{ex.Message}");
            }
        }
        window.RefreshRequested += Refresh;

        // Live BCF loop: subscribe to the bridge's SSE stream and refresh (debounced) on every push, so an
        // issue raised on the web appears in this active Revit session within seconds — no manual refresh.
        var liveCts = new System.Threading.CancellationTokenSource();
        var lastLive = DateTime.MinValue;
        // SEC-6 (S20): off Revit's thread (reading the bearer may refresh a session), with the bearer read at every connect — the
        // bridge ends a stream when its sign-in expires — and the stream's own words in the window when it is paused.
        _ = Task.Run(() => sync.StartLiveSyncAsync(bcfKey, () =>
        {
            var now = DateTime.UtcNow;
            if ((now - lastLive).TotalMilliseconds < 500) return; // debounce bursts
            lastLive = now;
            try { window.Dispatcher.BeginInvoke(new Action(Refresh)); } catch { /* window closed */ }
        },
            () => { try { return BcfConfig.Load().ServiceToken; } catch (SessionException) { return null; } }, // SEC-6: read at every connect
            words => { try { window.SetStatus(words); } catch { /* window closed */ } },
            liveCts.Token));

        // One fix window per topic (value null between the click and the window opening). Touched only on
        // the UI thread — the click handler, the hub jobs (Revit's API thread IS the UI thread) and Closed.
        var openFix = new Dictionary<string, FixInPlaceWindow?>(StringComparer.Ordinal);

        window.Closed += (_, __) =>
        {
            liveCts.Cancel();
            foreach (var f in openFix.Values.ToList()) f?.Close();   // they talk to this sync; they cannot outlive it
            sync.Dispose();
        };

        // Fix-in-place: plan on the API thread, check/re-check through the referee off it, apply on the
        // API thread, and close the loop on the topic only with evidence (every GUID resolved AND passing).
        var doc = uiapp.ActiveUIDocument.Document;
        var projectKey = bcfKey; // same document, same key
        var org = App.OrgFor(doc);
        // Display only (the banner): the bridge judges every check by its own resolved IDS. Off the UI thread.
        var ids = Task.Run(() => IdsSpecFile.Resolve(projectKey));
        static string User() => UserSession.Actor; // read at each use: a sign-in while the window is open counts

        // Raise an issue FROM Revit (founder's request 2026-09-28): selection and camera are read on the API thread,
        // the person describes it, and the two POSTs run off it; the window says what the bridge answered.
        window.NewIssueRequested += () =>
        {
            if (App.Events == null) { window.SetStatus("Sentinel's event hub is not running — restart Revit."); return; }
            App.Events.Enqueue(ua =>
            {
                var ud = ua.ActiveUIDocument;
                if (ud?.Document is not { } d || !d.Equals(doc)) { window.SetStatus("switch back to the model the Issues window was opened on — nothing was sent"); return; }
                var draft = CaptureIssue(ud, out var pointsAt);
                var why = draft.IfcGuids.Count == 0 ? draft.Refusal() : null;
                if (why != null) { window.SetStatus(why); return; }
                var dlg = new NewIssueDialog(draft, pointsAt);
                DialogOwner.Attach(dlg, mainHandle);
                if (dlg.ShowDialog() != true) { window.SetStatus("New issue cancelled — nothing was sent."); return; }
                window.SetStatus("Creating the issue…");
                var serviceUrl = cfg.ServiceUrl;
                // The token is read before the send so a SessionException faults the task in words (SI-1).
                Task.Run(() => { var bearer = BcfConfig.Load().ServiceToken; return sync.CreateIssueAsync(bcfKey, draft, cfg.ModelId, () => bearer); })
                    .ContinueWith(t =>
                    {
                        var line = t.Status == TaskStatus.RanToCompletion ? t.Result.Sentence(draft, serviceUrl) : "Not created — " + (t.Exception?.GetBaseException().Message ?? "the request did not finish");
                        window.SetOutcome(line);
                        if (t.Status == TaskStatus.RanToCompletion && t.Result.TopicGuid != null) try { window.Dispatcher.BeginInvoke(new Action(Refresh)); } catch { /* window closed */ }
                    }, TaskScheduler.Default);
            });
        };

        // "No failure came back" is only evidence of passing when the referee judged everything that was sent
        // and its failure list was not cut off. Returns the reason the response cannot be trusted, or null.
        static string? NotConclusive(int expected, int sent, int inScope, int failureCount, int matched)
        {
            var parts = new List<string>();
            if (sent < expected) parts.Add($"{expected - sent} element(s) missing from the model");
            if (!FixPlan.Conclusive(sent, inScope, failureCount, matched, out var why)) parts.Add(why);
            return parts.Count == 0 ? null : $"referee response is not conclusive: {string.Join(" / ", parts)} \u2014 nothing certified";
        }

        window.FixRequested += topic =>
        {
            var req = IdsIssueRef.TryParse(topic.Title);
            if (req == null) { window.SetStatus("Only referee-raised IDS issues can be fixed here."); return; }
            if (openFix.ContainsKey(topic.Guid)) { window.SetStatus("a Fix window is already open for this issue"); return; }
            var guids = topic.Viewpoints.SelectMany(v => v.Components?.Selection?.Select(s => s.IfcGuid) ?? Enumerable.Empty<string>())
                             .Where(g => !string.IsNullOrWhiteSpace(g)).Distinct().ToList();
            if (App.Events == null) { window.SetStatus("Sentinel's event hub is not running \u2014 restart Revit."); return; }

            void PlanFailed(string why) { openFix.Remove(topic.Guid); window.SetFixEnabled(true); window.SetStatus(why); }

            openFix[topic.Guid] = null;
            window.SetFixEnabled(false);
            window.SetStatus("Resolving the issue's elements in this model\u2026");
            App.Events.Enqueue(ua =>
            {
                try
                {
                    var d = ua.ActiveUIDocument?.Document;
                    // The plan and projectKey belong to the document this command opened on.
                    if (d == null || !d.Equals(doc))
                    { PlanFailed("switch back to the model this issue belongs to \u2014 nothing was done"); return; }
                    var plan = FixInPlaceService.BuildPlan(d, req, guids, org);
                    window.Dispatcher.BeginInvoke(new Action(() => OpenFixWindow(d, topic, req, plan, guids)));
                }
                catch (Exception ex) { PlanFailed("Revit refused: " + ex.Message); }
            });
        };

        void OpenFixWindow(Document d, BcfTopic topic, IdsIssueRef req, FixInPlaceService.Plan plan, List<string> guids)
        {
            var fix = new FixInPlaceWindow(topic, req, plan);
            DialogOwner.Attach(fix, mainHandle);
            openFix[topic.Guid] = fix;
            fix.Closed += (_, __) => openFix.Remove(topic.Guid);
            window.SetFixEnabled(true);
            ids.ContinueWith(t =>
            {
                // Resolve never throws; SetBanner marshals to the window. The label says why (not installed,
                // no project, bridge unreachable) \u2014 so the banner does not claim "not installed" on a timeout.
                if (t.Result.Origin == "none")
                    fix.SetBanner($"No IDS to check against for {projectKey} ({t.Result.Label}). Apply is allowed; nothing can be checked, certified or resolved from here.");
            }, TaskScheduler.Default);

            bool applied = false;   // set by Apply; decides whether the evidence says "Fixed" or "Verified"

            // Same document as the one this window was planned against? Nothing is read or written otherwise.
            bool SameDoc(UIApplication u)
            {
                var d2 = u.ActiveUIDocument?.Document;
                if (d2 != null && d2.Equals(d)) return true;
                fix.SetStatus("switch back to the model this issue belongs to \u2014 nothing was done");
                fix.SetBusy(false);
                return false;
            }

            // Check = dry run: patched payload -> referee; verdicts painted per row. raise_bcf:false always.
            fix.CheckRequested += ticked =>
            {
                fix.SetBusy(true); fix.SetStatus("Checking proposed values with the referee\u2026");
                App.Events!.Enqueue(ua2 =>
                {
                    try
                    {
                        if (!SameDoc(ua2)) return;
                        // A check judges the values the user typed \u2014 rows without a value are not sent (they
                        // would only fail for being empty and crowd the response).
                        ticked = ticked.Where(r => r.Proposed.Trim().Length > 0).ToList();
                        if (ticked.Count == 0) { fix.SetStatus("Enter a value in at least one ticked row, then Check."); fix.SetBusy(false); return; }
                        var payload = FixInPlaceService.ExtractPatched(d, projectKey, plan, ticked, req, org);
                        var expected = ticked.SelectMany(r => r.InstanceIds).Distinct().Count();
                        var keys = new HashSet<string>(ticked.Select(r => r.Key));
                        Task.Run(() =>
                        {
                            var res = GovernedNotify.Propose(payload, null, User(), projectKey: projectKey,
                                source: "revit-fix", note: $"fix-in-place check \u00b7 BCF {topic.Guid}", raiseBcf: false,
                                failuresRequirement: req.Requirement);
                            if (!res.Reached)
                            {
                                fix.SetStatus($"Could not reach the bridge \u2014 nothing was checked ({res.Error}). Applying is unverified.");
                                fix.SetBusy(false); return;
                            }
                            if (res.Verdict == "recorded")
                            {
                                fix.SetBanner($"No IDS installed for {projectKey} or its office \u2014 verdict \u201crecorded\u201d. Apply is allowed; nothing can be certified or resolved.");
                                fix.SetStatus($"Not checkable: no IDS installed for {projectKey} or its office."); fix.SetBusy(false); return;
                            }
                            var why = NotConclusive(expected, payload.Count, res.InScope, res.ElementFailures.Count, res.FailuresMatched);
                            if (why != null) { fix.SetStatus(why); fix.SetBusy(false); return; }
                            var fold = FixPlan.Fold(res.ElementFailures, plan.Rows, keys, guids, req.Requirement);
                            fix.RefreshRows();
                            // The bridge filtered the list to this requirement; the footnote count comes from its totals.
                            var other = res.FailuresTotal >= 0 && res.FailuresMatched >= 0 ? res.FailuresTotal - res.FailuresMatched : fold.OtherOpen;
                            fix.SetStatus($"Check: {fold.Pass} would pass, {fold.Fail} would fail{(other > 0 ? $" \u00b7 {other} failure(s) on other requirements not part of this issue" : "")} \u00b7 IDS {res.IdsLabel} \u00b7 {LedgerLine.For(LedgerResult.FromReceipt(res.AuditId, res.ReceiptHash))}");
                            fix.SetBusy(false);
                        });
                    }
                    catch (Exception ex) { fix.SetStatus("Revit refused: " + ex.Message); fix.SetBusy(false); }
                });
            };

            // Apply = one transaction on the API thread, then an automatic re-check of the REAL model state.
            fix.ApplyRequested += ticked =>
            {
                fix.SetBusy(true); fix.SetStatus("Applying ticked values\u2026");
                App.Events!.Enqueue(ua2 =>
                {
                    try
                    {
                        if (!SameDoc(ua2)) return;
                        var outcomes = FixInPlaceService.Apply(d, ticked, req, topic.Guid);
                        var done = outcomes.Count(o => o.Ok);
                        if (done > 0) applied = true;
                        // MA-1a item 7 (P1-9): one fix_in_place row for the Apply, sent off this thread. The re-check below
                        // files its own referee row.
                        if (done > 0)
                            GovernedNotify.Report("Fix-in-place", CommandReports.FixInPlace(req.Requirement, topic.Guid, done, outcomes.Count - done, UserSession.Actor), projectKey);
                        foreach (var o in outcomes.Where(o => !o.Ok)) { o.Row.Verdict = FixVerdict.Fail; o.Row.Reason = "not written: " + o.Message; }
                        fix.RefreshRows();
                        fix.SetStatus($"Applied {done}/{outcomes.Count} row(s). Re-checking the model with the referee\u2026");
                        Recheck(ua2);
                    }
                    catch (Exception ex) { fix.SetStatus("Revit refused: " + ex.Message); fix.SetBusy(false); }
                });
            };
            fix.RecheckRequested += () => { fix.SetBusy(true); fix.SetStatus("Re-checking\u2026"); App.Events!.Enqueue(Recheck); };
            fix.ZoomRequested += row => App.Events?.SelectAndShow(d, row.IsType ? row.InstanceIds[0] : row.TargetId);

            // Re-check: extract what the model holds NOW, judge it, and close the loop only on full evidence.
            void Recheck(UIApplication ua2)
            {
                try
                {
                    if (!SameDoc(ua2)) return;
                    var payload = FixInPlaceService.Extract(d, projectKey, plan, plan.Rows, org);
                    var expected = plan.Rows.SelectMany(r => r.InstanceIds).Distinct().Count();
                    var keys = new HashSet<string>(plan.Rows.Select(r => r.Key));
                    Task.Run(async () =>
                    {
                        var res = GovernedNotify.Propose(payload, null, User(), projectKey: projectKey,
                            source: "revit-fix", note: $"fix-in-place re-check \u00b7 BCF {topic.Guid}", raiseBcf: false,
                            failuresRequirement: req.Requirement);
                        if (!res.Reached)
                        {
                            fix.SetStatus(applied
                                ? $"Applied. NOT verified \u2014 the bridge could not be reached ({res.Error}); the issue was not touched. Use Re-check when it is back."
                                : $"NOT verified \u2014 the bridge could not be reached ({res.Error}); the issue was not touched. Use Re-check when it is back.");
                            fix.SetBusy(false); return;
                        }
                        if (res.Verdict == "recorded")
                        {
                            fix.SetStatus(applied
                                ? $"Applied. NOT verified \u2014 no IDS installed for {projectKey} or its office; the issue was not touched."
                                : $"NOT verified \u2014 no IDS installed for {projectKey} or its office; the issue was not touched.");
                            fix.SetBusy(false); return;
                        }
                        // Nothing is painted green and no comment is posted off a response that cannot vouch for
                        // every element sent: the rows stay exactly as they were, Unchecked included.
                        var why = NotConclusive(expected, payload.Count, res.InScope, res.ElementFailures.Count, res.FailuresMatched);
                        if (why != null) { fix.SetStatus(why); fix.SetBusy(false); return; }
                        var fold = FixPlan.Fold(res.ElementFailures, plan.Rows, keys, guids, req.Requirement);
                        fix.RefreshRows();
                        var total = guids.Count;
                        var passed = fold.PassGuids;
                        var ledgerLine = LedgerLine.For(LedgerResult.FromReceipt(res.AuditId, res.ReceiptHash));
                        // A topic lists at most 500 GUIDs (bridge viewpoint cap). When it names more failures than
                        // it lists, the unlisted ones were never examined — say so, and never resolve on them.
                        var unlisted = Math.Max(0, req.Failing - total);
                        var evidence = $"{(applied ? "Fixed" : "Verified")} in Revit by {User()}: {passed}/{total} element(s) now pass {req.Requirement}. Referee re-check against IDS {res.IdsLabel} (ledger row: {ledgerLine})."
                            + (unlisted > 0 ? $" {unlisted} of the {req.Failing} failing element(s) are not listed on this issue and were NOT examined." : "");
                        // The elements that ACTUALLY still fail — the fold's GUIDs, not every instance of a
                        // row that failed (a type row can fail one of its instances and pass the rest), and
                        // NotFixable rows included. Shown as instance ids where the plan knows one.
                        var idOf = plan.GuidOf.GroupBy(kv => kv.Value).ToDictionary(g => g.Key, g => g.First().Key);
                        var still = fold.FailedGuids
                            .Select(g => idOf.TryGetValue(g, out var id) ? id.ToString() : g).ToList();
                        if (still.Count > 0) evidence += $" Still failing: {string.Join(", ", still.Take(20))}{(still.Count > 20 ? ", \u2026" : "")}.";
                        if (fold.Unresolved.Count > 0) evidence += $" Not in this model: {string.Join(", ", fold.Unresolved.Take(10))}{(fold.Unresolved.Count > 10 ? ", \u2026" : "")}.";

                        // The bearer now, not the window's: the comment and the status go under the person they name (SI-1).
                        string bearer;
                        try { bearer = BcfConfig.Load().ServiceToken; }
                        catch (SessionException e) { fix.SetStatus($"Re-check done ({passed}/{total} pass) but the evidence comment was not posted ({e.Message}); the issue is unchanged."); fix.SetBusy(false); return; }
                        var c = await sync.AddCommentAsync(bcfKey, topic.Guid, evidence, User(), () => bearer).ConfigureAwait(false);
                        if (c < 200 || c >= 300) { fix.SetStatus($"Re-check done ({passed}/{total} pass) but the evidence comment was not posted (HTTP {c}); the issue is unchanged."); fix.SetBusy(false); return; }
                        if (!fold.AllPass)
                        {
                            fix.SetStatus($"Re-check: {passed}/{total} pass. Evidence posted; the issue stays {topic.Status} until every element passes.");
                            fix.SetBusy(false); return;
                        }
                        if (unlisted > 0)
                        {
                            fix.SetStatus($"Re-check: {passed}/{total} listed element(s) pass, but the issue names {req.Failing} failing and lists only {total} — {unlisted} were never examined. Evidence posted; the issue stays {topic.Status}. Re-publish to raise a fresh, complete issue.");
                            fix.SetBusy(false); return;
                        }
                        var s = await sync.SetStatusAsync(bcfKey, topic.Guid, "Resolved", User(), () => bearer).ConfigureAwait(false);
                        fix.SetStatus(s >= 200 && s < 300
                            ? $"\u2713 {passed}/{total} pass \u2014 evidence posted and the issue is now Resolved ({ledgerLine}). Closing it stays a human decision on the web."
                            : $"Evidence posted; status unchanged (HTTP {s}).");
                        fix.SetBusy(false);
                        try { window.Dispatcher.BeginInvoke(new Action(Refresh)); } catch { /* window closed */ }
                    });
                }
                catch (Exception ex) { fix.SetStatus("Revit refused: " + ex.Message); fix.SetBusy(false); }
            }

            fix.Show();
        }

        window.Show();
        Refresh(); // initial load
        return Result.Succeeded;
    }
}
