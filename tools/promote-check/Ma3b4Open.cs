#nullable disable

static partial class Check
{
    // ── 50. MA-3b4: a waiting result is sent by itself when its model opens (F2 B) — source scans (Revit-bound; drill MA3b4 R-2) ──────
    static void Ma3b4OpenChecks()
    {
        Console.WriteLine("\nMA-3b4 — a waiting result sent by itself when its model opens (source scans)");
        string review = Src("Commands.ReviewChangesets.cs"), app = Src("App.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        int opened = At(app, "private static void OnDocumentOpened("), send = At(app, "try { Commands.ReviewChangesetsCommand.SendOnOpen(doc); }");
        // Review C6: the send is the first thing after the family return — a throw in the pane's own open-time work cannot skip it unsaid.
        Ok(opened > 0 && send > opened && send < app.IndexOf("SentinelUpdater.RegisterFor(doc", opened, StringComparison.Ordinal) && Count(app, "SendOnOpen(") == 1
           && app.Contains("catch (Exception ex) { PanelVm?.LogDoctor($\"Review AI Proposals (on opening \\\"{doc.Title}\\\"): the results waiting on this PC were not checked"),
           "F2 B: every model that opens (DocumentOpened — never File ▸ New) has its waiting results checked and sent, before anything else Sentinel does on opening (review C6); a throw is said in the Doctor log");
        int on = At(review, "internal static void SendOnOpen(Document doc)");
        int skip = At(review, "if (doc == null || doc.IsFamilyDocument || doc.IsLinked) return;"), bound = At(review, "if (!ctx.IsBound) return;");
        int held = At(review, "if (Volatile.Read(ref _holds) > 0) { App.PanelVm?.LogDoctor(head + UnreportedResults.OpenHeld(mine.Count)); return; }");
        int signedOut = At(review, "if (!UserSession.IsSignedIn) { App.PanelVm?.LogDoctor(head + UnreportedResults.OpenSignedOut(mine.Count)); return; }");
        // Review C9: the round's every request goes with the person's token or none — a session the bridge's refresh loses mid-round
        // never falls back to the machine credential (BcfConfig.ServiceToken's `?? FileToken`).
        int person = At(review, "var cfg = BcfConfig.Load(); cfg.FileToken = \"\"; // review C9");
        int retry = At(review, "Said(Retry(doc, cfg, mine), head, rep => rep.Act);");
        Ok(on > 0 && skip > on && bound > skip && held > bound && signedOut > held && person > signedOut && retry > person && !review.Contains("Retry(doc, BcfConfig.Load(), mine)")
           && Count(review, ".Where(r => string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)).ToList();") == 2,
           "only this model's records (its central's or file's path, without case — review C4), never a linked or family document or an unbound model; never while a window is open or a report is in flight (the guard), said; never in the machine's name — nobody signed in, said (review C1); the stamp check first (Retry, on Revit's thread)");
        int said = At(review, "internal static void Said(Task<Reported> sending, string head, Func<Reported, bool> ask) => sending.ContinueWith(t =>");
        int dialog = At(review, "if (!done || ask(t.Result)) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));");
        Ok(said > 0 && dialog > said && At(review, "try { App.PanelVm?.LogDoctor(words); } catch { }") > dialog
           && review.Contains("var words = UnreportedResults.Windowless(head, done ? t.Result.Text : UnreportedResults.Failed(t.Exception?.GetBaseException().Message));")
           && review.IndexOf("}, TaskScheduler.Default);", said, StringComparison.Ordinal) > dialog,
           "G1: a round no window shows is said in the pane's Doctor log from a pool thread, in words made windowless; a dialog only when a person must act or the round failed");
        Ok(review.Contains("rep.Act = true; // MA-3b4 (G1)") && review.Contains("if (drop) { UnreportedResults.Delete(r.Key, r.ChangesetId); rep.Act |= r.Applied.Count > 0; } // MA-3b4 (G1)")
           && review.Contains("rep.Act |= ChangesetTrust.LateDeclines(reply) != null; // MA-3b4 review C2")
           && !review.Contains("GetAwaiter().GetResult()") && !review.Contains(".Wait(") && Count(review, "Hold();") == 3,
           "G1: a person must act when only some of a result's elements carry its stamp, the bridge refused for good a result whose elements are in the model, or a result landed over a web decline (review C2); nothing waits, and the guard is held no more often");
    }
}
