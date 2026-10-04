#nullable disable

static partial class Check
{
    // ── 51. MA-3b4: Ghost Builder writes its result before its report and never waits for it; the picker's closed-window gap — source
    //        scans (Revit-bound; drill MA3b4 R-1) ──────────────────────────────────────────────────────────────────────────────────
    static void Ma3b4GhostChecks()
    {
        Console.WriteLine("\nMA-3b4 — Ghost Builder does not wait for its report and keeps what the bridge did not take (source scans)");
        string ghost = Src("GhostBuilder", "GhostChangesetBuild.cs"), review = Src("Commands.ReviewChangesets.cs"), picker = Src("UI", "ChangesetPickerWindow.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int done = At(ghost, "done = true;");
        // Review C7: every result is written — one whose elements Revit all removed at commit too (nothing else keeps it closed).
        int write = At(ghost, "var unsaved = records.Where(x => !UnreportedResults.Write(x)).ToList();");
        // Review C8: a result whose save failed and whose report did not land is said NOT kept, under the guard (ReportAll's after).
        int send = At(ghost, "ReviewChangesetsCommand.Said(ReviewChangesetsCommand.ReportAll(cfg, records, after: rep => UnreportedResults.NotKept(unsaved.Where(u => !rep.Landed.Any(l => l.R == u)).Select(u => Short(u.ChangesetId)).ToList())),");
        int sendAsk = At(ghost, "UnreportedResults.GhostHead, rep => rep.Act || rep.Landed.Count < records.Count); // review C2: a late decline asks too");
        Ok(done > 0 && write > done && send > write && sendAsk > send && !ghost.Contains("x.Applied.Count > 0 && !UnreportedResults.Write(x)")
           && ghost.Contains("ReviewChangesetsCommand.DocOf(doc), new List<string> { undo, UndoWatcher.TxName(cs.Name, cs.Id) }, null);")
           && ghost.Contains("rec.Path = doc.PathName ?? \"\";")
           && !ghost.Contains("ReviewChangesetsCommand.Report(") && !ghost.Contains("UndoWatcher.Remember(") && !review.Contains("internal static bool Report("),
           "AI-2: Ghost Builder writes each applied result on this PC (the model, the file, its Undo names) before its report, which goes through ReportAll on a pool thread — remembered for the undo watcher once the bridge takes it; Report and its modal Retry are gone");
        int decline = At(ghost, "GhostPlacementEngine.PlacementReport Decline(ChangesetDto failing, string error)");
        int declines = At(ghost, "ReviewChangesetsCommand.Said(ReviewChangesetsCommand.ReportAll(cfg, declines, after: rep =>");
        // Review C11: only the declines the bridge did not take are withdrawn (a withdrawal of one it declined is refused — a false
        // "still proposed"); review C10: through WithdrawEach, which stops after the first the bridge did not answer.
        int landedSet = At(ghost, "var landed = new HashSet<string>(rep.Landed.Select(x => x.R.ChangesetId), StringComparer.Ordinal);");
        int notLanded = At(ghost, "return UnreportedResults.WithdrawEach(filed.Where(f => !landed.Contains(f.Id)).Select(f => (f.Id, Short(f.Id))),");
        int withdraw = At(ghost, "id => ChangesetClient.Withdraw(cfg, r.Key, id, out var why) ? null : why ?? \"no answer\");");
        int asked = At(ghost, "}), UnreportedResults.GhostHead, rep => rep.Landed.Count < declines.Count);");
        // Review C3: the withdrawals run inside ReportAll's round, before its finally releases the guard — no review can open them meanwhile.
        int all = At(review, "internal static Task<Reported> ReportAll(BcfConfig cfg, List<UnreportedResults.Record> records, Reported rep = null, List<UnreportedResults.Record> gone = null, Func<Reported, string> after = null)");
        int then = At(review, "if (after?.Invoke(rep) is string extra && extra.Length > 0) rep.Words.Add(extra.TrimStart('\\n')); // MA-3b4 review C3");
        Ok(decline > 0 && declines > decline && landedSet > declines && notLanded > landedSet && withdraw > notLanded && asked > withdraw && ghost.Contains("report.Ledger = UnreportedResults.GhostDeclining(declines.Count);")
           && ghost.Contains(": UnreportedResults.GhostReporting(r.Key, filed.Select(f => Short(f.Id)).ToList(), unsaved.Select(u => Short(u.ChangesetId)).ToList());")
           && all > 0 && then > all && review.IndexOf("finally { Release(); }", all, StringComparison.Ordinal) > then,
           "B4 kept: a build rolled back reports each changeset declined off Revit's thread, and one the bridge does not take is withdrawn instead, there — under the guard (review C3); the summary says the report is under way and where its outcome is said");
        Ok(picker.Contains("public void SetEntries(List<(string Line, string Blocked, List<ChangesetDto> Entry)> entries, string status, Action gone = null)")
           // Review C12: the round's words are windowless on every path of the picker (it has no Retry report), and a throw keeps them.
           && review.Contains("text = UnreportedResults.Windowless(\"\", rep.Text);") && review.Contains("lost = () => App.Events.Enqueue(_ => TaskDialog.Show(Title, text));")
           && review.Contains("if (text != null) said.Add(text);") && !review.Contains("said.Add(rep.Text)") && !review.Contains("TaskDialog.Show(Title, rep.Text)")
           && review.Contains("catch (Exception ex) { picker.SetEntries(none, string.Join(\"\\n\\n\", new[] { $\"The list could not be read — {ex.GetType().Name}: {ex.Message}\", text }.Where(s => s != null)), lost); }")
           && review.Contains("picker.SetEntries(rows, string.Join(\"\\n\\n\", said), lost);")
           && review.Contains(".Concat(said)), lost);"),
           "MA-3b2b's gap: a round's words that reach a picker closed in between go to a dialog too, not to the Doctor log alone");
    }
}
