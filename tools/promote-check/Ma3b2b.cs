#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;

static partial class Check
{
    // ── 46. MA-3b2b: a decline the bridge already holds is taken, not refused — a Decline all (or a rolled-back Apply) whose reply
    //        was lost and is sent again by Retry report (pure, and the one line that asks) ─────────────────────────────────────────
    static void Ma3b2bDeclineChecks()
    {
        Console.WriteLine("\nMA-3b2b — a decline the bridge already holds is taken, not refused");
        UnreportedResults.Record Decline(string note, params string[] rejected) =>
            new UnreportedResults.Record { Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL", Rejected = rejected.ToList(), Note = note };
        // The same decline with the reviewer's reason for ghost a, as typed (the bridge keeps it trimmed).
        UnreportedResults.Record Why(UnreportedResults.Record r, string guid, string reason) { r.Reasons = new Dictionary<string, string> { [guid] = reason }; return r; }
        UnreportedResults.Record Mine(string note, params string[] rejected) => Why(Decline(note, rejected), "a", "  stays as it is ");
        ChangesetDto Stored(string status, string result) => JsonSerializer.Deserialize<ChangesetDto>($"{{\"id\":\"c\",\"status\":\"{status}\",\"result\":{result}}}");
        const string held = "{\"applied\":[],\"rejected\":[\"b\",\"a\"],\"note\":\"not this package\",\"reasons\":{\"a\":\"stays as it is\"}}";
        const string bare = "{\"applied\":[],\"rejected\":[\"b\",\"a\"],\"note\":\"not this package\"}"; // a bridge before MA-3b2 keeps no reasons
        const string taken = "\"Promote (DD) · GR-FFL\": the bridge had already taken it (its reply did not reach Revit) — declined; the bridge named no ledger row for it here.";

        Ok(UnreportedResults.AlreadyTaken(Mine(" not this package ", "a", "b"), Stored("declined", held)) == taken
           && UnreportedResults.AlreadyTaken(Decline(null, "a"), Stored("declined", "{\"applied\":[],\"rejected\":[\"a\"],\"note\":null}")) == taken
           && UnreportedResults.AlreadyTaken(Decline("", "a"), Stored("declined", "{\"applied\":[],\"rejected\":[\"a\"]}")) == taken,
           "a decline whose stored result rejects the same ghosts with the same note (trimmed; none is none) is this decline, landed earlier — taken, said");
        Ok(UnreportedResults.AlreadyTaken(Mine("another reason", "a", "b"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b", "c"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("proposed", "null")) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("withdrawn", "null")) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("partially_applied", held)) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("declined", "{\"applied\":[],\"note\":\"not this package\"}")) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package"), Stored("declined", "{\"applied\":[],\"rejected\":[],\"note\":\"not this package\"}")) == null
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), null) == null,
           "another note, another set of ghosts, a changeset still proposed, withdrawn or partly applied, a stored result with no rejected list, or a record that rejects nothing is not this decline — the 409 stands");
        Ok(UnreportedResults.AlreadyTaken(Why(Decline("not this package", "a", "b"), "a", "another reason"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Why(Decline("not this package", "a", "b"), "b", "stays as it is"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a", "b"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Why(Decline("not this package", "a", "b"), "a", " ​ "), Stored("declined", bare)) == taken
           && UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("declined", bare)) == taken,
           "review C7: the same ghosts and note with other stored reasons (another text, another ghost, or reasons this record never sent) is another person's decline — the 409 stands; a stored result with no reasons still matches (a blank reason is never kept; an older bridge keeps none)");
        Ok(ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(Stored("declined", held)), 1) == "\n1 decline reason(s) recorded with it."
           && ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(Stored("declined", bare)), 1).StartsWith("\n⚠ 1 decline reason(s) were sent and the bridge kept 0", StringComparison.Ordinal),
           "the reasons of a decline taken earlier are counted from the stored result (C15) — a bridge that kept none is said, never counted as kept");
        var goneDecline = UnreportedResults.Gone(Mine("not this package", "a", "b"), Stored("declined", held), null);
        Ok(UnreportedResults.AlreadyTaken(Mine("not this package", "a", "b"), Stored("declined", held)) == taken && goneDecline.Drop && !goneDecline.Revert
           && UnreportedResults.DeclineLost == "Nothing in the model changed; the bridge may or may not have taken the decline — run Review AI Proposals: a changeset no longer listed is no longer proposed — declined, unless it was withdrawn or applied meanwhile (the web desk's Recently decided in Revit lists what Revit reported); one still listed is reviewed again.",
           "review C10, C8: a record that applied nothing never asks for a changeset_reverted row, though the bridge holds its decline; a decline whose window is closed is not said to stay proposed — the bridge may hold it, and (review C15) one no longer listed is not said to be declined when it may have been withdrawn or applied");
        string review = Src("Commands.ReviewChangesets.cs");
        int asked = review.IndexOf("if (!landed && err != null && err.StartsWith(\"Bridge 409\", StringComparison.Ordinal))", StringComparison.Ordinal);
        int counted = review.IndexOf("if (taken != null) reply = UnreportedResults.StoredReply(stored);", StringComparison.Ordinal);
        Ok(asked > 0 && counted > asked && counted < review.IndexOf("if (landed || taken != null)", asked, StringComparison.Ordinal),
           "review C16: a decline's 409 reaches the stored reply — the reasons are counted from it inside the re-read every 409 takes, before the landed branch");
        // Review C14: a closed window's words never name a button that is gone — a sign-in refusal says Review AI Proposals, not Retry report.
        string refused = UnreportedResults.Outcome("Bridge 401: {\"message\":\"sign in\"}", 0).Words;
        Ok(refused.Contains(UnreportedResults.PressRetry) && refused.EndsWith("\n" + UnreportedResults.DeclineKept, StringComparison.Ordinal)
           && !refused.Replace(UnreportedResults.DeclineKept, UnreportedResults.DeclineLost).Replace(UnreportedResults.PressRetry, UnreportedResults.RunReview).Contains("Retry report")
           && refused.Replace(UnreportedResults.PressRetry, UnreportedResults.RunReview).Contains("as a contributor on this project, then run Review AI Proposals.")
           && review.Contains("words = words.Replace(UnreportedResults.PressRetry, UnreportedResults.RunReview);"),
           "review C14: a decline refused for the sign-in, said for a closed window, names no Retry report — sign in, then run Review AI Proposals");
        Ok(review.Contains("if (!landed && err != null && err.StartsWith(\"Bridge 409\", StringComparison.Ordinal))") && !review.Contains("!landed && r.Applied.Count > 0 && err != null")
           && UnreportedResults.Outcome("Bridge 409: {\"message\":\"changeset is declined — a result can be reported exactly once, from proposed\"}", 0).Words.StartsWith("the bridge refused it", StringComparison.Ordinal),
           "every 409 — a decline's too — is re-read before it is called refused; a 409 that is not this result still reads \"the bridge refused it\"");
    }

    // ── 47. MA-3b2b (F-MA3b2-1): the words of a report whose window is closed reach a dialog (source scans — Revit-bound; drill
    //        MA3b2b's row R-1 runs them) ─────────────────────────────────────────────────────────────────────────────────────────
    static void Ma3b2bWiringChecks()
    {
        Console.WriteLine("\nMA-3b2b — a closed window's result is said in a dialog (source scans)");
        string review = Src("Commands.ReviewChangesets.cs"), hub = Src("RevitEventHub.cs");
        // Review C13: the window closed between Tell's Gone check and the posted Say — the same dialog, not the Doctor line alone.
        const string closedDialog = "if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));", posted = "if (!window.Gone) { window.Say(words, Closed); return; }";
        int closedAt = review.IndexOf("void Closed()", StringComparison.Ordinal);
        Ok(Src("UI", "ChangesetReviewWindow.cs").Contains("public void Say(string words, Action gone) => Ui(() => { if (_gone) gone(); else Say(words); });")
           && review.Contains(posted) && !review.Contains("{ window.Say(words); return; }")
           && closedAt > 0 && closedAt < review.IndexOf(closedDialog, StringComparison.Ordinal)
           && review.IndexOf(closedDialog, StringComparison.Ordinal) < review.IndexOf(posted, StringComparison.Ordinal),
           "review C13: a window closed between Tell's check and the posted words gets the closed window's dialog too — Say hands the words back, and both orders end in one path");
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        Ok(hub.Contains("using System.Windows.Threading;") && hub.Contains("private readonly Dispatcher _ui = Dispatcher.CurrentDispatcher;")
           && hub.Contains("if (_ui.CheckAccess()) Raise();") && hub.Contains("else _ui.BeginInvoke(new Action(Raise));")
           && Count(hub, "_event.Raise()") == 1 && hub.Contains("var raised = _event.Raise();")
           && hub.Contains("if (raised != ExternalEventRequest.Denied && raised != ExternalEventRequest.TimedOut) return;")
           && hub.Contains("App.PanelVm?.LogDoctor($\"Revit did not take a Sentinel action ({raised}) — it stays queued and runs with the next one.\");"),
           "the event hub raises on Revit's own thread whoever enqueues (a report's continuation is a pool thread), and a raise Revit did not take is said in the Doctor log");
        Ok(review.Contains("if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));")
           && review.Contains("App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text));")
           && !review.Contains("_ => { }") && !review.Contains("\"say the review's result\""),
           "a closed window's or picker's result is shown in whichever model is in front — a dialog changes nothing, so no DocPin refusal is there to be swallowed");
        Ok(review.Contains("try { said = words(t.Result); }")
           && review.Contains("catch (Exception ex) { said = $\"The report's summary could not be built — {ex.GetType().Name}: {ex.Message}\"; }")
           && review.Contains("Tell(said + (t.Result.Words.Count > 0 ? \"\\n\\n\" + t.Result.Text : \"\"));") && !review.Contains("Tell(words(t.Result)"),
           "a summary that throws is said, with each result's own words after it — the continuation never ends without words");
        // Review C1: the pane's Doctor line must not be able to take the dialog with it — LogDoctor ran on the caller's own dispatcher
        // when WPF has no Application (a pool thread here), and an insert into the bound log throws there.
        string vm = Src("UI", "SentinelPanelViewModel.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int queued = At(review, "if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));");
        Ok(vm.Contains("private readonly System.Windows.Threading.Dispatcher _ui = System.Windows.Threading.Dispatcher.CurrentDispatcher;")
           && vm.Contains("private void OnUi(Action a)") && vm.Contains("if (_ui.CheckAccess()) a();") && vm.Contains("else _ui.BeginInvoke(a);")
           && !vm.Contains("Application.Current") && Count(vm, "CurrentDispatcher") == 1
           && queued > 0 && queued < At(review, "try { App.PanelVm?.LogDoctor(\"Review AI Proposals: \" + words); } catch { }")
           && At(review, "App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text));") < At(review, "try { App.PanelVm?.LogDoctor(\"Review AI Proposals: \" + rep.Text); } catch { }")
           && review.Contains("catch (Exception ex) { App.Events.Enqueue(_ => TaskDialog.Show(Title, $\"The report's result could not be shown — {ex.GetType().Name}: {ex.Message}\\nRun Review AI Proposals to see what the bridge holds.\")); }"),
           "review C1: the pane's own dispatcher is Revit's, kept from its making (never the caller's); a closed window's dialog is queued before its Doctor line, each on its own; a continuation that throws anywhere still says so in a dialog");
    }
}
