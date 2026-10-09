#nullable disable
static partial class Check
{
    // ── 38. MA-2d: no network call on Revit's API thread — every request ChangesetClient sends runs on a pool thread (source scan: the
    //        client compiles here, but its HTTP is never called offline) ─────────────────────────────────────────────────────────────
    static void Ma2dThreadChecks()
    {
        Console.WriteLine("\nMA-2d — network calls off the API thread (source scans)");
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        string client = Src("Coordination", "ChangesetClient.cs"), promote = Src("Commands.PromoteWalls.cs");
        int send = client.IndexOf("Task.Run(async () =>", StringComparison.Ordinal);
        int make = client.IndexOf("var msg = make();", StringComparison.Ordinal);
        Ok(Count(client, ".SendAsync(") == 1 && send > 0 && make > send && client.IndexOf("await http.SendAsync(msg).ConfigureAwait(false);", StringComparison.Ordinal) > make
           && Count(client, "Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken))") == 3
           && client.Contains("(resp, body) = Send(http ?? WriteHttp, () => Req(HttpMethod.Post, $\"{cfg.ServiceUrl.TrimEnd('/')}{path}\", cfg.ServiceToken, payload));")
           // Review C1: the token (a sign-in refresh is a network call) is read where the request is built — inside Send's pool thread.
           && Count(client, "cfg.ServiceToken") == Count(client, "() => Req(") && Count(client, "() => Req(") == 5
           && !client.Contains("Send(ReadHttp, Req(") && !client.Contains("Send(WriteHttp, msg)")
           && !client.Contains("ReadAsStringAsync().GetAwaiter()"),
           "ChangesetClient builds (its token too), sends and reads every request on a pool thread — FetchProposed, FetchOne, MyRole, FetchScan (MA-4f) and Post (Propose, ReportResult, Withdraw, ReportReverted): one place for Promote, the review, Ghost Builder and the undo watcher");
        Ok(promote.Contains("var cs = ChangesetClient.Propose(fileCfg, key, body, out err);") && !promote.Contains("retry ? Task.Run("),
           "Promote's Propose — the first and the retry — goes through the client's pool thread, and since MA-3b5 Promote's filing itself runs on a pool thread: nothing on Revit's thread waits for it");
    }

    // ── 39. MA-2d: one Undo per storey — the placement event, the review and Promote, by source scan (they compile in no check project;
    //        drill MA2d runs them) ───────────────────────────────────────────────────────────────────────────────────────────────
    static void Ma2dStoreyWiringChecks()
    {
        Console.WriteLine("\nMA-2d — one Undo per storey (source scans)");
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        string review = Src("Commands.ReviewChangesets.cs"), place = Src("GhostBuilder", "ChangesetPlacementEvent.cs"), promote = Src("Commands.PromoteWalls.cs");
        string window = Src("UI", "ChangesetReviewWindow.cs"), ctx = Src("GhostBuilder", "PromoteContext.cs");
        // Drill MA2d F-MA2d-2: the DD IDS dialog's headline and the line on every changeset's note speak of the storey.
        Ok(place.Contains("StageIds.Summary(judged, fails, notRead, notJudged, ids.Matrix, batch.Count > 1 ? \"This \" + what : null)")
           && ctx.Contains("StageIds.Headline(fails.Count, matrix, what.StartsWith(\"storey \", StringComparison.Ordinal) ? \"This \" + what : null)"),
           "a storey's DD IDS dialog and the line on its changesets' notes name the storey (drill MA2d F-MA2d-2)");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        int loop = At(place, "foreach (var cs in batch)"), judge = At(place, "PromoteContext.JudgeApplied(doc, ids, result.Applied, kindOf)");
        Ok(place.Contains("using var group = new TransactionGroup(doc, StoreyBatch.UndoName(batch));") && loop > 0 && judge > loop
           && At(place, "BlockCheck.AddedSince(doc, before)") > judge && At(place, "group.Assimilate()") > judge
           && place.Contains("batch.SelectMany(c => c.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op != \"set_parameter\")")
           // Review C10: no lone path — every changeset, one or a storey's several, runs in the checked group.
           && !place.Contains("if (before == null && promote?.Ids == null") && place.Contains("result = RunChecked(doc, batch, ticked, before, plan, promote?.Ids);"),
           "every changeset runs in ONE group named as its Undo entry — a storey's each through the executor in order, then the DD IDS on everything the storey applied (F11 within the storey), the BLOCK check once, then the group is kept");
        // Review C16: the loop stops at the failed changeset — the first "return res;" after the rollback comes before the next is kept.
        int rolled = At(place, "if (res.NotFinished == null) SentinelUndo.RollBack(group, doc);");
        int stop = rolled < 0 ? -1 : place.IndexOf("return res;", rolled, StringComparison.Ordinal);
        Ok(rolled > 0 && place.Contains("res.Error = $\"changeset \\\"{cs.Name}\\\": {res.Error}\";")
           && stop > rolled && stop < At(place, "result.Each.Add((cs, res));"),
           "any changeset that fails rolls the whole storey back and the error names it; each changeset's own result is kept for its report");
        // MA-3b (AI-5): the picker lists every entry (StoreyBatch.Entries — a storey as one) instead of opening the oldest.
        Ok(review.Contains("var cs = StoreyBatch.Merge(batch);") && review.Contains("foreach (var one in batch)") && review.Contains("StoreyBatch.Entries(pending)")
           && promote.Contains("ReviewChangesetsCommand.Open(ui, doc, cfg, key, StoreyBatch.Of(pending, unreviewed))") // MA-3b5: the plan hop's UIApplication
           && promote.Contains("ReviewChangesetsCommand.Open(u, d, cfg, key, StoreyBatch.Of(filed, first))") // MA-3b5: the open hop, DocPin
           // Review C7: a Promote part reviewed alone (a part waits twice, or one is missing) is said.
           && review.Contains("is reviewed alone: another part of its storey is missing (not filed, or reviewed already) or waits twice (two Promote runs) — applying it is its own Undo entry, not the storey's.")
           // Review C17: a storey's dialogs speak of the storey.
           && review.Contains("GhostFailurePolicy.WarningsLine(result.Warnings, fresh.Count > 1 ? \"storey\" : \"changeset\")")
           && review.Contains("Nothing was reported: the {(fresh.Count > 1 ? $\"storey's {fresh.Count} changesets stay\" : \"changeset stays\")} proposed.")
           // Review C11: in a storey's window the type edit's row counts "this storey's" retypes.
           && window.Contains("((_cs.Name ?? \"\").EndsWith(\", one Undo)\", StringComparison.Ordinal) ? \"storey\" : \"changeset\")}'s retypes onto it are applied"),
           "Review AI Proposals and Promote open a Promote storey's changesets in one window, each re-checked before anything runs; a part reviewed alone is said; a type edit's row says whose retypes it counts");
        // MA-3b (AI-2): each result is built on the API thread with the revision Apply re-checked (MA-3a) and the Undo names, and reported
        // by ReportAll on a pool thread; the undo watcher remembers it only once the bridge took it.
        int reported = At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err, r.Reasons);"); // MA-3b2: and the reasons
        Ok(review.Contains("foreach (var (one, res) in result.Each)") && reported > 0
           && At(review, "if (UndoWatcher.Land(r.Undo, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid)))") > reported // review C8: Land remembers it
           && review.Contains("new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }")
           // Review C15: the LOD state after names only the changesets the bridge holds as applied; the words count the rejected rows it took.
           && review.Contains("var held = rep.Landed.Where(x => x.R.Applied.Count > 0).Select(x => x.R.ChangesetId).ToList();") && review.Contains("CommandReports.LodState(lod, held, UserSession.Actor)")
           && !review.Contains("fresh.Select(f => f.Id)") && review.Contains("{untickedTaken} of {unticked.Count} unticked element(s) reported as rejected.")
           && review.Contains("{goneTaken} of {gone.Count} element(s) removed by Revit at commit — reported as rejected."),
           "each changeset of the storey is reported on its own ledger row and remembered under the Undo entry's name and its own; the LOD state after is read once, for the storey");
        Ok(review.Contains("ResultOf(key, f, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),")
           // Review C14: the rolled-back storey's declines are counted from what the bridge took, as C6's are (MA-3b: the reports that landed).
           && Count(review, "int declined = rep.Landed.Count;") == 2 && review.Contains("Reported as declined: {declined} of {fresh.Count} changeset(s)")
           && review.Contains("(declined < fresh.Count ? \" — the rest are still proposed; the model holds none of them.\" : \".\")")
           && Count(review, "(fresh[0].Source == \"promote\" ? CarriedEdits(fresh) + \"\\n\\n\" + RunPromoteAgain : \"\")") == 2
           && review.Contains("it first opens any other Promote storey still waiting for review, and plans again once none is waiting")
           // Review C2: a declined storey's type edits — later storeys of the same run that retype onto them fail the DD IDS.
           && review.Contains("Other storeys of the same run that retype onto those types will fail the DD IDS check for that property until Promote plans again — decline them (untick all, write the reason in the note, press Decline all), then run Promote (DD).") // MA-3b review C16: Decline all needs a reason
           // Review C6: an all-unticked storey is declined in words, counted from what the bridge took.
           && review.Contains("ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null, StoreyBatch.Own(f, reasons))") // MA-3b2: each part's own reasons
           && review.Contains("$\"Declined {declined} of {fresh.Count} changeset(s) — nothing in the model changed.\""),
           "a storey that fails or is unticked whole is declined whole, each changeset with the reason, said with its type edits' consequence, and the words say Promote reopens a waiting storey before it plans again (drill MA2c D2)");
    }
}
