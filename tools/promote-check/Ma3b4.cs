#nullable disable
using Sentinel.Coordination;
using Sentinel.Engine;

static partial class Check
{
    // ── 49. MA-3b4: the words of a round no window shows — a model opening (founder decision F2 B), Ghost Builder (pure) ───────────
    static void Ma3b4WordChecks()
    {
        Console.WriteLine("\nMA-3b4 — the words of a report no window shows");
        const string keptOpen = "\nThe result is kept on this PC and sent again by the next opening of this model or Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice.";
        const string down = "Bridge 503: {\"error\":\"drill MA3b4 proxy: the bridge is down (503)\"}";
        const string signIn = "Bridge 403: {\"message\":\"result requires the contributor role (you are viewer)\"}";
        var rec = new UnreportedResults.Record
        {
            Key = "ma3b4", ChangesetId = "c49", Name = "Ghost Builder: sample-walls-ma2a.dxf on GR-FFL", Doc = "C:\\drills\\ma3b4-a.rvt", Path = "",
            Applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "g1" }, new AppliedEntry { ProposalGuid = "g2" } },
        };
        var head = UnreportedResults.OnOpening("ma3b4-a");
        Ok(head == "Review AI Proposals (on opening \"ma3b4-a\"): "
           && UnreportedResults.Windowless(head, "\"Ghost Builder: sample-walls-ma2a.dxf on GR-FFL\": " + UnreportedResults.Outcome(down, 2).Words)
              == "Review AI Proposals (on opening \"ma3b4-a\"): \"Ghost Builder: sample-walls-ma2a.dxf on GR-FFL\": not reported: " + down + keptOpen,
           "a result the bridge did not take, said on opening: kept, sent again by the next opening or Review AI Proposals — never 'Retry report' with no window");
        Ok(UnreportedResults.Windowless("", UnreportedResults.Outcome(signIn, 2).Words)
           == "not reported: " + signIn + "\nSign in (Standards ▸ Sign in) as a contributor on this project, then run Review AI Proposals." + keptOpen,
           "a sign-in refusal names what is left to run (MA-3b2b review C14's rule)");
        Ok(UnreportedResults.Windowless("", UnreportedResults.Verified(rec, 1).Words).EndsWith("check the model (finish the Undo, or delete what is left), then run Review AI Proposals in this model.", StringComparison.Ordinal)
           && UnreportedResults.Windowless("", UnreportedResults.RevertPosted("Bridge 503: down")) == "NOT posted: Bridge 503: down\nThe record is kept on this PC; the next opening of this model or Review AI Proposals asks the bridge again."
           && UnreportedResults.Windowless(UnreportedResults.GhostHead, "\"x\": " + UnreportedResults.Outcome(null, 0).Words).EndsWith("\nNothing in the model changed.", StringComparison.Ordinal),
           "a partial stamp count asks for Review AI Proposals in this model, never 'close this window'; a revert not posted waits for the next opening; a decline no window holds is offered nothing");
        var all = new[]
        {
            UnreportedResults.Outcome(down, 2).Words, UnreportedResults.Outcome(signIn, 0).Words, UnreportedResults.Outcome("Bridge 404: gone", 2).Words,
            UnreportedResults.NotSent(2), UnreportedResults.NotSent(0), UnreportedResults.NotReRead("A task was canceled.", 2), UnreportedResults.Gone(rec, null, "Bridge 503: down").Words,
            UnreportedResults.RevertPosted("Bridge 503: down"), UnreportedResults.Verified(rec, 1).Words, UnreportedResults.Elsewhere(rec, "C:\\other.rvt"),
            UnreportedResults.UndoneInFlight(rec, "Bridge 503: down"),
        }.Select(w => UnreportedResults.Windowless(UnreportedResults.GhostHead, w)).ToList();
        Ok(all.All(w => w.StartsWith(UnreportedResults.GhostHead, StringComparison.Ordinal) && !w.Contains("Retry report") && !w.Contains("this window")),
           "no word of a round offers Retry report or 'this window' when no window shows it");
        Ok(UnreportedResults.GhostReporting("ma2a-ghost", new List<string> { "55f4929e", "7acd0c36" }, new List<string>())
              == "Ledger: reporting 2 changeset(s) to ma2a-ghost (source dwg: 55f4929e, 7acd0c36) off Revit's thread — the pane's Doctor log says what the bridge took. A result it does not take is kept on this PC and sent again by the next opening of this model or Review AI Proposals; that changeset is not opened for review until then, so nothing is applied twice. One Ctrl+Z undoes the whole build; changeset_reverted is posted for what the bridge holds."
           && UnreportedResults.GhostReporting("k", new List<string> { "55f4929e" }, new List<string> { "55f4929e" })
              .EndsWith($"\n⚠ The result of 55f4929e could not be saved on this PC ({UnreportedResults.Root}): if its report fails too, nothing on this PC remembers it — check the changeset's status on the bridge before reviewing it again.", StringComparison.Ordinal),
           "AI-2: Ghost Builder's summary says its results are being reported, where the outcome is said, that one not taken is kept and never applied twice — and names a result that could not be saved");
        // Review C8: the round's "kept on this PC" is corrected for a result whose save failed and whose report did not land.
        Ok(UnreportedResults.NotKept(new List<string> { "55f4929e" }) == $"\n\n⚠ 55f4929e: NOT kept on this PC — its save failed ({UnreportedResults.Root}), so nothing here keeps that changeset closed; check its status on the bridge before anyone reviews it."
           && UnreportedResults.NotKept(new List<string>()) == "",
           "review C8: a Ghost result whose save failed and whose report did not land is never said to be kept on this PC");
        Ok(UnreportedResults.GhostDeclining(2) == "Ledger: reporting 2 changeset(s) as declined, with the reason, off Revit's thread — the pane's Doctor log says what the bridge took; one it does not take is withdrawn instead, and one that is neither is named there (still proposed: withdraw it on the web)."
           && UnreportedResults.WithdrawnInstead(new List<string> { "55f4929e" }, new List<string> { "7acd0c36" }) == "\n\nWithdrawn instead (the decline did not land): 55f4929e.\n\nStill proposed — neither declined nor withdrawn: 7acd0c36. Withdraw it on the web before anyone reviews it."
           && UnreportedResults.WithdrawnInstead(new List<string>(), new List<string>()) == "",
           "B4 kept: a rolled-back build's declines are reported off Revit's thread; one not taken is withdrawn instead, one neither is named");
        // Review C10: the withdrawals keep MA-3b C6's rule — one wait for a bridge that does not answer, never one per changeset.
        var tried = new List<string>();
        var silent = UnreportedResults.WithdrawEach(new[] { ("a1", "a1"), ("b2", "b2"), ("c3", "c3") }, id => { tried.Add(id); return id == "a1" ? "the bridge did not answer within 120 s" : null; });
        var refusedTried = new List<string>();
        var refused = UnreportedResults.WithdrawEach(new[] { ("a1", "a1"), ("b2", "b2"), ("c3", "c3") }, id => { refusedTried.Add(id); return id == "a1" ? "Bridge 409: {\"error\":\"not proposed\"}" : null; });
        Ok(tried.SequenceEqual(new[] { "a1" }) && silent == UnreportedResults.WithdrawnInstead(new List<string>(), new List<string> { "a1", "b2", "c3" })
           && refusedTried.SequenceEqual(new[] { "a1", "b2", "c3" }) && refused == UnreportedResults.WithdrawnInstead(new List<string> { "b2", "c3" }, new List<string> { "a1" }),
           "review C10: a rolled-back build's withdrawals stop after the first the bridge did not answer (the rest named still proposed, the guard held one 120 s wait, not one per changeset); a bridge's refusal does not stop them");
        Ok(UnreportedResults.OpenHeld(2) == "2 result(s) applied in this model wait on this PC for the bridge — not sent now: a review window is open, a report is in flight, or Promote (DD) is reading or filing. Once it is done, run Review AI Proposals in this model: it checks the model and sends them."
           && UnreportedResults.Failed(null).StartsWith("reporting failed — it did not finish\nWhat Revit applied is kept on this PC (" + UnreportedResults.Root + ")", StringComparison.Ordinal),
           "a guard that stops the open-time send is said, never a silent skip; a round that failed says nothing on this PC is lost");
        Ok(UnreportedResults.OpenSignedOut(2) == "2 result(s) applied in this model wait on this PC for the bridge — not sent: nobody is signed in, and a result is reported in a person's name. Sign in (Standards ▸ Sign in) as a contributor on this project, then run Review AI Proposals in this model."
           && UnreportedResults.Windowless("", UnreportedResults.OpenSignedOut(1)) == UnreportedResults.OpenSignedOut(1),
           "review C1: an open-time send never goes in the machine's name — nobody signed in, nothing sent, said, and what to do named");
        // Review C9: what SendOnOpen's cleared FileToken relies on — with no person's token, ServiceToken is none, never the machine's.
        Ok(new Sentinel.Commands.BcfConfig { FileToken = "machine" }.ServiceToken == "machine" && new Sentinel.Commands.BcfConfig { FileToken = "" }.ServiceToken == "",
           "review C9: an open-time round sent with the file token cleared carries the person's token or none (a 401, kept, said) — never the machine credential when a session is lost mid-round");
    }
}
