#nullable disable
using System.Text.Json;
using Sentinel.Coordination;

static partial class Check
{
    // ── 40. MA-3a: a web decline binds — the add-in reads the web desk's decisions as the bridge stores them (the shared fixture
    //        WebApp/bridge/fixtures/changeset-ops/ma3a-review.json, which vitest proves applyDecisions makes) ─────────────────────
    static void Ma3aReviewChecks()
    {
        Console.WriteLine("\nMA-3a — the web desk's decisions as Revit reads them (design §6.6, D17)");
        using var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ma3a-review.json")));
        var after = JsonSerializer.Deserialize<ChangesetDto>(fx.RootElement.GetProperty("after").GetRawText());
        var before = JsonSerializer.Deserialize<ChangesetDto>(fx.RootElement.GetProperty("before").GetRawText());
        ChangesetElementDto G(ChangesetDto cs, string g) => cs.Elements.Single(e => e.ProposalGuid == g);

        Ok(after.ReviewRev == 1 && before.ReviewRev == 0 && G(after, "g-1").Review.State == "declined" && G(after, "g-1").Review.Rev == 1
           && G(after, "g-1").Review.By == "reviewer@example.com" && G(after, "g-1").Review.Role == "contributor"
           && G(after, "g-2").Review.State == "accepted" && G(after, "g-2").Review.Reason == null && G(after, "g-3").Review == null,
           "the changeset's review_rev and each ghost's review are read as the bridge stores them; a ghost nobody decided reads null");
        var old = JsonSerializer.Deserialize<ChangesetDto>("{\"id\":\"c\",\"elements\":[{\"proposal_guid\":\"g\",\"op\":\"attach\"}]}");
        Ok(old.ReviewRev == null && old.Elements[0].Review == null, "a changeset from a bridge before MA-3a reads with no review_rev and no review");

        Ok(ChangesetTrust.PreTick(before, G(before, "g-1")) && !ChangesetTrust.PreTick(after, G(after, "g-1")) && !ChangesetTrust.PreTick(after, G(after, "g-4")),
           "a web decline binds: the retype the bridge pre-ticked opens unticked once it is declined");
        Ok(ChangesetTrust.PreTick(after, G(after, "g-2")) && ChangesetTrust.PreTick(after, G(after, "g-3")),
           "a web accept is advice: an accepted ghost keeps the bridge's pre-tick, and a ghost nobody decided keeps its own");
        Ok(ChangesetTrust.DeclinedOnWeb(G(after, "g-1")) && !ChangesetTrust.DeclinedOnWeb(G(after, "g-2")) && !ChangesetTrust.DeclinedOnWeb(G(after, "g-3")),
           "DeclinedOnWeb is the decline alone");

        Ok(ChangesetTrust.ReviewLine(G(after, "g-1")) == "declined on the web by reviewer@example.com (contributor): wrong type: W 1 is a party wall · a lead may re-open it on the web desk",
           "a declined row says who declined it, the role, the reason and that a lead may re-open it");
        Ok(ChangesetTrust.ReviewLine(G(after, "g-2")) == "accepted on the web by reviewer@example.com (contributor) — advice: it still needs your tick"
           && ChangesetTrust.ReviewLine(G(after, "g-3")) == null,
           "an accepted row says it is advice; a row nobody decided says nothing");
        var reopened = G(after, "g-1");
        reopened.Review = JsonSerializer.Deserialize<ReviewDto>(fx.RootElement.GetProperty("reopened_review").GetRawText());
        Ok(ChangesetTrust.ReviewLine(reopened) == "re-opened on the web by lead@example.com (lead): party wall confirmed external by the client"
           && ChangesetTrust.PreTick(after, reopened) && !ChangesetTrust.DeclinedOnWeb(reopened),
           "a lead's re-open: the row says so, and the ghost may be ticked again (its pre-tick back)");
        reopened.Review = JsonSerializer.Deserialize<ReviewDto>(fx.RootElement.GetProperty("after").GetProperty("elements")[0].GetProperty("review").GetRawText());

        Ok(ChangesetTrust.DeclinedHeader(after) == "2 ghost(s) declined on the web — shown unticked with the reason; they cannot be ticked here (a lead may re-open one on the web desk). Apply reports them as rejected; the changeset stays proposed until Revit reports it — a new Promote run proposes a declined ghost again, undecided."
           && ChangesetTrust.DeclinedHeader(before) == null,
           "the window's header counts the web's declines and says a changeset stays proposed until Revit reports it");

        var refused = ChangesetTrust.DeclinedTicked(new[] { after }, new HashSet<string> { "g-1", "g-2", "g-3" });
        Ok(refused == "1 ticked ghost(s) were declined on the web after this window opened:\n· retype wall \"W 1\" — declined on the web by reviewer@example.com (contributor): wrong type: W 1 is a party wall · a lead may re-open it on the web desk\n\nNothing was created. They are unticked here and cannot be ticked — press Apply again for the rest, or close this window.",
           "Apply's re-check: a ticked ghost declined in the fresh copy refuses the whole Apply, naming it, the reviewer and the reason");
        Ok(ChangesetTrust.DeclinedTicked(new[] { after }, new HashSet<string> { "g-2", "g-3" }) == null && ChangesetTrust.DeclinedTicked(new[] { before }, new HashSet<string> { "g-1" }) == null,
           "…and nothing is refused when no ticked ghost is declined");

        string late = ChangesetTrust.LateDeclines(fx.RootElement.GetProperty("late_reply").GetRawText());
        Ok(late == "1 ghost(s) were declined on the web after Apply re-checked them, and were applied:\n· retype wall \"W 2\" — declined on the web by reviewer@example.com (contributor): W 2 is demolished\n\nThe bridge recorded the apply over the decline (changeset_applied). Undo in Revit if the decline should stand.",
           "a result the bridge took over a late decline is said, ghost by ghost (Q2)");
        Ok(ChangesetTrust.LateDeclines("{\"id\":\"c\",\"result\":{\"applied\":[]}}") == null && ChangesetTrust.LateDeclines("{\"result\":{\"applied_over_late_decline\":[]}}") == null
           && ChangesetTrust.LateDeclines("not json") == null && ChangesetTrust.LateDeclines(null) == null,
           "…and nothing is said for a reply without one, or one that is not JSON");
        Ok(ChangesetTrust.LateDeclines("{\"result\":{\"applied_over_late_decline\":[],\"applied_over_decline_unchecked\":[{\"name\":\"retype wall \\\"W 1\\\"\",\"by\":\"r@example.com\",\"role\":\"contributor\",\"reason\":\"no\"}]}}")
           == "1 ghost(s) declined on the web were applied, and this result carried no review_rev — the bridge cannot tell whether the decline was seen:\n· retype wall \"W 1\" — declined on the web by r@example.com (contributor): no\n\nThe bridge recorded it as unchecked (changeset_applied). Undo in Revit if the decline should stand.",
           "a decline applied by a result with no review_rev is said as unchecked, never as late (review amendment C2)");
    }

    // ── 41. MA-3a: the review window and Apply obey the web's declines (source scans — Revit-bound; drill MA3a runs them) ────────
    static void Ma3aWiringChecks()
    {
        Console.WriteLine("\nMA-3a — the review window and Apply obey the web's declines (source scans)");
        string window = Src("UI", "ChangesetReviewWindow.cs"), review = Src("Commands.ReviewChangesets.cs"), client = Src("Coordination", "ChangesetClient.cs"),
               ghost = Src("GhostBuilder", "GhostChangesetBuild.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        Ok(window.Contains("box.IsEnabled = !ChangesetTrust.DeclinedOnWeb(el);") && At(window, "box.IsEnabled = !ChangesetTrust.DeclinedOnWeb(el);") > At(window, "IsChecked = ChangesetTrust.PreTick(_cs, el)")
           && window.Contains("if (ChangesetTrust.ReviewLine(el) is string reviewLine)") && window.Contains("if (ChangesetTrust.DeclinedHeader(_cs) is string declinedLine)"),
           "the window shows a declined row unticked and disabled, every row's web decision, and the declines' header");
        int freshDone = At(review, "fresh.Add(f);"), refuse = At(review, "if (ChangesetTrust.DeclinedTicked(fresh, ticked) is { } declinedTicked)");
        Ok(freshDone > 0 && refuse > freshDone && refuse < At(review, "var role = ChangesetClient.MyRole(cfg, key, out var roleErr);")
           && refuse < At(review, "handler.SetRequest(") && review.IndexOf("return;", refuse, StringComparison.Ordinal) < At(review, "var role = ChangesetClient.MyRole(cfg, key, out var roleErr);"),
           "Apply re-checks the declines on the fresh copies before anything runs, and a declined tick refuses it all (it returns)");
        Ok(review.Contains("records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }));") // MA-3b: sent by ReportAll
           && review.Contains("if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, reviewRev, out var reply, out var err))")
           && review.Contains("if (ChangesetTrust.LateDeclines(reply) is { } late) TaskDialog.Show(\"Sentinel — AI proposals\", late);")
           && client.Contains("JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev })")
           && ghost.Contains("res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine), cs.ReviewRev))"),
           "the result carries the review_rev Apply re-checked (Ghost Builder's, the one its filing reply carried — C2), and a late or unchecked decline the bridge recorded is said");
    }
}
