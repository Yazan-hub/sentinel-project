#nullable disable
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 54. MA-3b7: Ghost Builder files and withdraws off Revit's thread — its words (pure) and its wiring (source scans; drill MA3b7) ──
    static void Ma3b7Checks()
    {
        Console.WriteLine("\nMA-3b7 — Ghost Builder files and withdraws off Revit's thread");
        Ok(GhostFailurePolicy.FilingLine(3, true) == "Ghost Builder: the types proved and the build planned; filing 3 changeset(s) off Revit's thread — Revit stays usable, and the build places by itself in this model once the bridge has answered."
           && GhostFailurePolicy.FilingLine(0, false) == "Ghost Builder: the types proved and the build planned; this model is not bound to a web project, so nothing is filed — the build places by itself.",
           "the Doctor line says the filing runs off Revit's thread, or that an unbound model files nothing");
        // Review: re-pinned on DocPin's real refusal (the hub passes it whole) — no double period, no "nothing was changed".
        Ok(GhostFailurePolicy.NotPlacedLine(Sentinel.Engine.DocPin.Refusal(true, false, "ma.rvt", "place the Ghost Builder build")) == "Nothing was built — Sentinel did not place the Ghost Builder build: switch back to ma.rvt. The build was planned for the model it started from and places only there; run Build again in that model."
           && GhostFailurePolicy.NotPlacedLine(Sentinel.Engine.DocPin.Refusal(false, false, "", "place the Ghost Builder build")) == "Nothing was built — Sentinel did not place the Ghost Builder build: the model it was started on is closed. The build was planned for the model it started from and places only there; run Build again in that model.",
           "DocPin: a build whose model was switched or closed says nothing was built and where to run it again");
        Ok(GhostFailurePolicy.FiledWithdrawn(new[] { "a1", "b2" }, new string[0]) == "the 2 changeset(s) already filed were withdrawn."
           && GhostFailurePolicy.FiledWithdrawn(new[] { "a1" }, new[] { "b2" }) == "withdrawn: a1; changeset(s) b2 were filed and could not be withdrawn — withdraw them on the web before anyone reviews them."
           && Sentinel.Engine.UnreportedResults.WithdrawEach(new[] { ("x", "a1"), ("y", "b2"), ("z", "c3") }, id => id == "x" ? null : "timeout", GhostFailurePolicy.FiledWithdrawn)
              == "withdrawn: a1; changeset(s) b2, c3 were filed and could not be withdrawn — withdraw them on the web before anyone reviews them.",
           "review: Ghost Builder's own withdrawals name what was withdrawn and what is still proposed, never a decline it did not try");
        Ok(GhostFailurePolicy.WithdrawingLine(2) == "Ledger: withdrawing the 2 changeset(s) already filed, off Revit's thread — the pane's Doctor log says what the bridge answered (one it did not answer is named there: withdraw it on the web before anyone reviews it).",
           "a rolled-back build says its filed changesets are withdrawn off Revit's thread and where the answer is");
        string ghost = Src("GhostBuilder", "GhostChangesetBuild.cs"), ev = Src("GhostBuilder", "GhostBuilderExternalEvent.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        int file = At(ghost, "public static Filed File("), place = At(ghost, "public static GhostPlacementEngine.PlacementReport Place("), propose = At(ghost, "ChangesetClient.Propose(");
        Ok(ghost.Contains("public static Prepared Prepare(UIApplication app, Request r)") && ghost.Contains("public static Filed File(Prepared p)")
           && ghost.Contains("public static GhostPlacementEngine.PlacementReport Place(UIApplication app, Document doc, Prepared p, Filed filed)")
           && Count(ghost, "ChangesetClient.Propose(") == 1 && propose > file && file > 0 && propose < place
           && Count(ghost, "new TransactionGroup(doc, \"Ghost Builder\")") == 2 && !ghost.Contains("public static GhostPlacementEngine.PlacementReport Run("),
           "MA-3b7: the dry run (A), the pool-thread filing and the build (B) are three entry points; the filing lives in File alone and the build has its own group");
        Ok(ev.Contains("Task.Run(() => GhostChangesetBuild.File(prep))") && ev.Contains("App.Events.Enqueue(doc, \"place the Ghost Builder build\"")
           && ev.Contains("GhostChangesetBuild.NotPlaced(prep, filed, why)"),
           "MA-3b7: the controller files on a pool thread and places in a second event in the model it started from; a refusal says nothing was placed");
        // Place delegates to Build, which holds the build's group
        int build = At(ghost, "private static GhostPlacementEngine.PlacementReport Build(");
        int start = ghost.IndexOf("group.Start();", build, StringComparison.Ordinal), end = ghost.IndexOf("group.Assimilate()", start, StringComparison.Ordinal);
        bool outside = true; for (int i = 0; (i = ghost.IndexOf("Withdraw(", i, StringComparison.Ordinal)) >= 0; i++) if (i > start && i < end) outside = false;
        Ok(start > 0 && end > start && outside, "MA-3b7: no withdrawal sits inside the build's open group (they run off Revit's thread)");
        // Review: the exact off-thread call, under the guard; WithdrawAll is called only by File (the pool thread) and WithdrawOff.
        int offAt = At(ghost, "private static void WithdrawOff(Prepared p, List<ChangesetDto> filed, string what)");
        int offHold = ghost.IndexOf("ReviewChangesetsCommand.Hold();", offAt, StringComparison.Ordinal);
        int offRun = At(ghost, "Task.Run(() => { try { App.PanelVm?.LogDoctor(UnreportedResults.GhostHead + what + WithdrawAll(p, filed)); } finally { ReviewChangesetsCommand.Release(); } });");
        int fileAll = At(ghost, "\"Ledger: \" + WithdrawAll(p, filed)");
        Ok(offAt > 0 && offHold > offAt && offRun > offHold && offRun - offAt < 400 && Count(ghost, "WithdrawAll(") == 3 && fileAll > file && fileAll < place
           && ghost.Contains("WithdrawOff(prep, filed, \"withdrawn after the build rolled back — \");") && ghost.Contains("WithdrawOff(p, filed.Changesets, \"withdrawn, nothing was placed — \");"),
           "review: a rolled-back or unplaced build withdraws only through WithdrawOff — on a pool thread, holding the review's guard");
        int gTry = ghost.LastIndexOf("try", start, StringComparison.Ordinal);
        Ok(gTry > build && start - gTry < 200 && ghost.Contains("if (cfg != null && UserSession.IsSignedIn) cfg.FileToken = \"\"; // review C11"),
           "review: B's group starts inside the try (a refused group still withdraws), and the filing carries the person's token or none (C11)");
        string addin = Src("GhostBuilder", "GhostBuilderExternalEvent.cs"), win = Src("UI", "GhostReviewWindow.cs"), rev = Src("Commands.ReviewChangesets.cs");
        int busy = At(addin, "if (ReviewChangesetsCommand.Held) { Completed?.Invoke(new GhostPlacementEngine.PlacementReport { NotBuilt = ReviewChangesetsCommand.Busy }, null); return; }");
        int prepAt = At(addin, "GhostChangesetBuild.Prepare(app, request)"), hold = At(addin, "ReviewChangesetsCommand.Hold();"), run = At(addin, "Task.Run(() => GhostChangesetBuild.File(prep))");
        Ok(busy > 0 && prepAt > busy && hold > prepAt && run > hold && Count(addin, "ReviewChangesetsCommand.Release()") == 1
           && addin.Contains("void Once() { if (Interlocked.Exchange(ref held, 0) == 1) ReviewChangesetsCommand.Release(); }")
           && addin.Contains("try { Say(() => prep.Report); } finally { Once(); }") && addin.Contains("try { return GhostChangesetBuild.Place(u, d, prep, filed); } finally { Once(); }")
           && addin.Contains("try { return GhostChangesetBuild.NotPlaced(prep, filed, why); } finally { Once(); }")
           && rev.Contains("or Ghost Builder is filing or withdrawing a build"),
           "review: Ghost Builder refuses while the review's guard is held, holds it from the filing until the build places or is withdrawn, and releases it once");
        Ok(win.Contains("_build.IsEnabled = !_building && ticked.Count > 0;") && At(win, "_building = true;") > At(win, "public void Build()")
           && At(win, "_building = false;") > At(win, "public void Reopen("),
           "review: a tick during the filing does not turn Build back on — one build at a time");
        // ── MA-3b8 — the C1e audit of GovernedNotify.Report: the Doctor line goes straight to the pane, which marshals itself ──
        string gn = Src("Coordination", "GovernedNotify.cs"), vm = Src("UI", "SentinelPanelViewModel.cs");
        Ok(!gn.Contains("Dispatcher.CurrentDispatcher") && !gn.Contains("ui.BeginInvoke(") && gn.Contains("void Say(LedgerResult ledger) { try { Sentinel.App.PanelVm?.LogDoctor(")
           && vm.Contains("if (_ui.CheckAccess()) a();") && vm.Contains("else _ui.BeginInvoke(a);") && vm.Contains("public void LogDoctor(string line, int resolved = 0) => OnUi(() =>"),
           "MA-3b8 (C1e audit): Report's Doctor line is given to the pane directly — LogDoctor marshals to the pane's own dispatcher, so a report from any thread lands; no CurrentDispatcher of the caller's thread");
    }
}
