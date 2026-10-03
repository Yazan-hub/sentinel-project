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
           && client.Contains("(resp, body) = Send(WriteHttp, () => Req(HttpMethod.Post, $\"{cfg.ServiceUrl.TrimEnd('/')}{path}\", cfg.ServiceToken, payload));")
           // Review C1: the token (a sign-in refresh is a network call) is read where the request is built — inside Send's pool thread.
           && Count(client, "cfg.ServiceToken") == Count(client, "() => Req(") && Count(client, "() => Req(") == 4
           && !client.Contains("Send(ReadHttp, Req(") && !client.Contains("Send(WriteHttp, msg)")
           && !client.Contains("ReadAsStringAsync().GetAwaiter()"),
           "ChangesetClient builds (its token too), sends and reads every request on a pool thread — FetchProposed, FetchOne, MyRole and Post (Propose, ReportResult, Withdraw, ReportReverted): one place for Promote, the review, Ghost Builder and the undo watcher");
        Ok(promote.Contains("var cs = ChangesetClient.Propose(cfg, key, body, out err);") && !promote.Contains("retry ? Task.Run("),
           "Promote's first Propose is off the API thread too: C22's wrap of the retry is now the client's, for both");
    }

    // ── 39. MA-2d: one Undo per storey — the placement event, the review and Promote, by source scan (they compile in no check project;
    //        drill MA2d runs them) ───────────────────────────────────────────────────────────────────────────────────────────────
    static void Ma2dStoreyWiringChecks()
    {
        Console.WriteLine("\nMA-2d — one Undo per storey (source scans)");
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        string review = Src("Commands.ReviewChangesets.cs"), place = Src("GhostBuilder", "ChangesetPlacementEvent.cs"), promote = Src("Commands.PromoteWalls.cs");
        string window = Src("UI", "ChangesetReviewWindow.cs");
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
        Ok(review.Contains("var cs = StoreyBatch.Merge(batch);") && review.Contains("foreach (var one in batch)") && review.Contains("var batch = StoreyBatch.Of(pending, pending[0]);")
           && promote.Contains("ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(pending, unreviewed))")
           && promote.Contains("ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(filed, first))")
           // Review C7: a Promote part reviewed alone (a part waits twice, or one is missing) is said.
           && review.Contains("is reviewed alone: another part of its storey is missing (not filed, or reviewed already) or waits twice (two Promote runs) — applying it is its own Undo entry, not the storey's.")
           // Review C17: a storey's dialogs speak of the storey.
           && review.Contains("GhostFailurePolicy.WarningsLine(result.Warnings, fresh.Count > 1 ? \"storey\" : \"changeset\")")
           && review.Contains("Nothing was reported: the {(fresh.Count > 1 ? $\"storey's {fresh.Count} changesets stay\" : \"changeset stays\")} proposed.")
           // Review C11: in a storey's window the type edit's row counts "this storey's" retypes.
           && window.Contains("((_cs.Name ?? \"\").EndsWith(\", one Undo)\", StringComparison.Ordinal) ? \"storey\" : \"changeset\")}'s retypes onto it are applied"),
           "Review AI Proposals and Promote open a Promote storey's changesets in one window, each re-checked before anything runs; a part reviewed alone is said; a type edit's row says whose retypes it counts");
        int reported = At(review, "if (!Report(cfg, key, one.Id, res.Applied, rejected, said)) continue;");
        Ok(review.Contains("foreach (var (one, res) in result.Each)") && reported > 0 && At(review, "UndoWatcher.Remember(undo, key, one.Id, guids);") > reported
           && review.Contains("UndoWatcher.Remember(UndoWatcher.TxName(one.Name, one.Id), key, one.Id, guids);")
           // Review C15: the LOD state after names only the changesets the bridge holds as applied; the dialog counts the rejected rows it took.
           && At(review, "if (res.Applied.Count > 0) held.Add(one.Id);") > reported && review.Contains("CommandReports.LodState(lod, held, UserSession.Actor)")
           && !review.Contains("fresh.Select(f => f.Id)") && review.Contains("{untickedTaken} of {unticked.Count} unticked element(s) reported as rejected.")
           && review.Contains("{goneTaken} of {gone.Count} element(s) removed by Revit at commit — reported as rejected."),
           "each changeset of the storey is reported on its own ledger row and remembered under the Undo entry's name and its own; the LOD state after is read once, for the storey");
        Ok(review.Contains("if (Report(cfg, key, f.Id, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),")
           // Review C14: the rolled-back storey's declines are counted from what the bridge took, as C6's are.
           && Count(review, ")) declined++;") == 2 && review.Contains("Reported as declined: {declined} of {fresh.Count} changeset(s)")
           && review.Contains("(declined < fresh.Count ? \" — the rest are still proposed; the model holds none of them.\" : \".\")")
           && Count(review, "(fresh[0].Source == \"promote\" ? CarriedEdits(fresh) + \"\\n\\n\" + RunPromoteAgain : \"\")") == 2
           && review.Contains("it first opens any other Promote storey still waiting for review, and plans again once none is waiting")
           // Review C2: a declined storey's type edits — later storeys of the same run that retype onto them fail the DD IDS.
           && review.Contains("Other storeys of the same run that retype onto those types will fail the DD IDS check for that property until Promote plans again — decline them (untick all ▸ Apply), then run Promote (DD).")
           // Review C6: an all-unticked storey is declined in words, counted from what the bridge took.
           && review.Contains("if (Report(cfg, key, f.Id, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note)) declined++;")
           && review.Contains("$\"Declined {declined} of {fresh.Count} changeset(s) — nothing in the model changed.\""),
           "a storey that fails or is unticked whole is declined whole, each changeset with the reason, said with its type edits' consequence, and the words say Promote reopens a waiting storey before it plans again (drill MA2c D2)");
    }
}
