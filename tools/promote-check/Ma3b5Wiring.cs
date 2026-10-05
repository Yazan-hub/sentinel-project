#nullable disable

static partial class Check
{
    // ── 52b. MA-3b5: Promote's reads and filing off Revit's thread — source scans (Revit-bound; drill MA3b5 P-1, P-2) ───────────────────
    static void Ma3b5WiringChecks()
    {
        Console.WriteLine("\nMA-3b5 — Promote's reads and filing off Revit's thread (source scans)");
        string promote = Src("Commands.PromoteWalls.cs"), review = Src("Commands.ReviewChangesets.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        int exec = At(promote, "public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)");
        int busy = At(promote, "if (ReviewChangesetsCommand.Held)"), hold = At(promote, "ReviewChangesetsCommand.Hold();");
        int read = At(promote, "Task.Run(() => Read(cfg, key)).ContinueWith(read => App.Events.Enqueue(doc, \"plan Promote (DD)\", (ui, d) => Plan(ui, d, cfg, key, read),");
        Ok(exec > 0 && busy > exec && At(promote, "TaskDialog.Show(Title, ReviewChangesetsCommand.Busy);") > busy && hold > busy && read > hold
           && promote.Contains("why => { ReviewChangesetsCommand.Release(); TaskDialog.Show(Title, why); }), TaskScheduler.Default);")
           && Count(promote, "ReviewChangesetsCommand.Hold();") == 1 && Count(promote, "ExternalCommandData") == 1,
           "F1, E2: Promote checks the one guard and holds it on Revit's thread, reads off it, and plans back on it in the model it started from (DocPin) — a refused plan releases the guard; the command's data is never used after Execute returns");
        int once = At(promote, "void Once() { if (System.Threading.Interlocked.Exchange(ref held, 0) == 1) ReviewChangesetsCommand.Release(); }");
        int guarded = At(promote, "try { handed = PlanAndFile(ui, doc, cfg, key, read, Once); }");
        int rebound = At(promote, "if (ProjectContext.For(doc).Key != key)"), status = At(promote, "if (read.Status != TaskStatus.RanToCompletion)");
        int let = At(promote, "release(); // Open checks the guard"), waiting = At(promote, "ReviewChangesetsCommand.Open(ui, doc, cfg, key, StoreyBatch.Of(pending, unreviewed));");
        Ok(once > 0 && guarded > once && promote.Contains("finally { if (!handed) Once(); }") && rebound > guarded && status > rebound && let > status && waiting > let
           && promote.Contains("This model's project changed while Promote read the bridge (was {key}) — nothing was planned or filed. Run Promote (DD) again.")
           && Count(promote, "ReviewChangesetsCommand.Release();") == 2,
           "E4: the plan releases the guard exactly once on every way out but the filing — a refusal, No, a throw the hub swallows — and before a waiting storey opens (Open checks it); C4: a model re-bound during the reads plans and files nothing");
        int pane = At(promote, "var pane = System.Windows.Threading.Dispatcher.CurrentDispatcher;");
        int pool = pane < 0 ? -1 : promote.IndexOf("Task.Run(() =>", pane, StringComparison.Ordinal);
        int filing = At(promote, "var run = PropertyPlanner.FileAll(bodies, PropertyPlanner.Stalling((body, retry) =>");
        int receipt = At(promote, "plans.SelectMany(p => p.Held).Select(h => h.UniqueId).Distinct().Count(), filedIds, actor), key, pane);");
        int done = At(promote, "finally { release(); }"), open = At(promote, "App.Events.Enqueue(doc, \"open the review of the changesets Promote filed\", (u, d) =>");
        int busyHop = At(promote, "if (ReviewChangesetsCommand.Held) { TaskDialog.Show(Title, PropertyPlanner.PromoteNotOpened(ReviewChangesetsCommand.Busy, filed.Count, title)); return; }");
        int own = At(promote, "var fileCfg = BcfConfig.Load(); if (UserSession.IsSignedIn) fileCfg.FileToken = \"\"; // review C11");
        int rebind = At(promote, "if (ProjectContext.For(d).Key != key) { TaskDialog.Show(Title, PropertyPlanner.PromoteNotOpened($\"This model's project changed while Promote filed (was {key})\", filed.Count, title) + (said.Length > 0 ? \"\\n\\n\" + said : \"\")); return; }");
        Ok(own > pane && own < pool && promote.Contains("var cs = ChangesetClient.Propose(fileCfg, key, body, out err);") && !promote.Contains("ChangesetClient.Propose(cfg,"),
           "C11: Promote's filing carries the person's token or none, never the PC's machine credential after a sign-out mid-run (as review C9's open-time send)");
        Ok(rebind > open && rebind < busyHop,
           "C12: a model re-bound to another project while Promote filed opens no review of the old project's changesets — said with what was filed");
        Ok(pane > 0 && pool > pane && filing > pool && done > filing && receipt > done && open > receipt && busyHop > open
           && Count(promote, "release();") == 2 && Count(promote, "return true;") == 1 && At(promote, "return true;") > open // C15
           && promote.Contains("changeset(s) were not confirmed filed") // C14
           && promote.IndexOf("ReviewChangesetsCommand.Open(u, d, cfg, key, StoreyBatch.Of(filed, first));", StringComparison.Ordinal) > busyHop
           && promote.Contains("why => TaskDialog.Show(Title, PropertyPlanner.PromoteNotOpened(why, filed.Count, title)")
           && promote.Contains("if (first == null) { App.Events.Enqueue(_ => TaskDialog.Show(Title, said)); return; }")
           && promote.Contains("catch (Exception ex) { said = PropertyPlanner.PromoteStopped($\"{ex.GetType().Name}: {ex.Message}\", first != null); }")
           && promote.Contains("catch (Exception ex) { said += (said.Length > 0 ? \"\\n\" : \"\") + $\"Promote's receipt was not sent — {ex.GetType().Name}: {ex.Message}\"; }"),
           "the filing runs on a pool thread under the stall rule (F4); the guard is released before the receipt and the review are queued (E3); the receipt goes out on every path that filed something, its Doctor line through Revit's dispatcher (S3, MA-3b2b C1e, C6); the review opens in this model only, a guard taken in the gap is said with what was filed (C7) — a refusal says what was filed and where; a filing that throws is said");
        Ok(!promote.Contains("GetAwaiter().GetResult()") && !promote.Contains(".Wait(") && Count(promote, "Task.Run(") == 2
           && review.Contains("internal static bool Held => Volatile.Read(ref _holds) > 0;") && review.Contains("internal static void Hold() =>") && review.Contains("internal static void Release() =>")
           && !review.Contains("Open(ExternalCommandData") && !review.Contains("two minutes at most")
           && review.Contains("internal const string Busy = \"A review window is open, a result is still being reported to the bridge, or Promote (DD) is reading or filing")
           && review.Contains("(a Promote that files nothing is done when its dialog closes)"), // C13
           "AI-2, XC-3: nothing in Promote waits for the bridge on Revit's thread; the guard is the review's (F1), and its words name Promote with no time bound a filing cannot keep (F3)");
    }
}
