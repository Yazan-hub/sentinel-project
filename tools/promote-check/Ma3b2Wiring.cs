#nullable disable

static partial class Check
{
    // ── 45. MA-3b2: the window's reason boxes and Show, the reasons on every report of the review, and the zoom (source scans —
    //        Revit-bound; drill MA3b2 runs them) ─────────────────────────────────────────────────────────────────────────────────
    static void Ma3b2WiringChecks()
    {
        Console.WriteLine("\nMA-3b2 — the reason boxes, the reasons on the report, and zoom to row (source scans)");
        string review = Src("Commands.ReviewChangesets.cs"), window = Src("UI", "ChangesetReviewWindow.cs"), hub = Src("RevitEventHub.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }

        int refuse = At(window, "if (problem != null) { Say($\"The reason for \\\"{g.What}\\\" was not taken — {problem}. Nothing was sent.\"); return; }");
        // Review C3: a reason with no unticked row to carry it is refused in words, before anything is sent.
        // Review C17: the refusal tests the rows the reason is assigned to (unticked, may be ticked here, with a proposal_guid).
        int noRow = At(window, "if (!g.Rows.Any(x => x.Box.IsChecked != true && x.Box.IsEnabled && x.El.ProposalGuid != null)) { Say($\"The reason for \\\"{g.What}\\\" has no unticked row to go with — untick the rows it is for, or clear it. Nothing was sent.\"); return; }");
        int press = At(window, "_go.IsEnabled = false; Reasons(true);");
        Ok(window.Contains("public event Action<List<string>, List<string>, string, Dictionary<string, string>> DecideRequested;")
           // Review C4: the box is on its own row under the buttons, filling it — no fixed width to clip.
           && window.Contains("var why = new TextBox { MaxLength = ChangesetTrust.MaxReason,") && !window.Contains("Width = 220") && window.Contains("_groups.Add((group.Key, why, mine));")
           && window.Contains("whyRow.Children.Add(whyLabel); whyRow.Children.Add(why);") && window.Contains("body.Children.Add(bar); body.Children.Add(whyRow); body.Children.Add(groupRows);")
           && window.Contains("var reason = ChangesetTrust.DeclineReason(g.Reason.Text, out var problem);") && refuse > 0 && refuse < noRow && noRow < press
           // Review C2: the reasons are taken at the press — the boxes are read-only from then on, and editable again only when nothing was applied.
           && window.Contains("private void Reasons(bool taken) { foreach (var g in _groups) g.Reason.IsReadOnly = taken; }")
           && window.Contains("public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; if (!_applied) Reasons(false); });")
           && window.Contains("public void Applying(string words) => Ui(() => { _applied = true; Ticks(); _go.IsEnabled = false; Reasons(true); Say(words); });")
           && window.Contains("public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Reasons(false); Say(words); });")
           && window.Contains("foreach (var r in g.Rows.Where(x => x.Box.IsChecked != true && x.Box.IsEnabled && x.El.ProposalGuid != null)) reasons[r.El.ProposalGuid] = reason;")
           && window.Contains("DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? \"\", reasons);"),
           "each group has one reason box on its own row: its reason goes to that group's unticked rows that may be ticked here (never a row the web declined); one the bridge would refuse, or one with no such row, is refused by the window before anything is sent; the boxes are read-only once their reasons were taken");
        Ok(review.Contains("window.DecideRequested += (ticked, unticked, note, reasons) => Task.Run(() => Decide(ticked, unticked, note, reasons));")
           && review.Contains("ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null, StoreyBatch.Own(f, reasons))")
           && review.Contains("records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }, StoreyBatch.Own(one, reasons)));")
           // Review C14 (overrides S6): a rolled-back storey carries the reasons of the rows the reviewer unticked — never dropped without a word.
           && review.Contains("(string.IsNullOrEmpty(note) ? \"\" : $\" | reviewer: {note}\"), null, here, null, StoreyBatch.Own(f, reasons))).ToList()), rep =>")
           && !review.Contains("null, here, null, null)")
           && review.Contains("Undo = undo ?? new List<string>(), At = ProvenanceStamp.Now(), Reasons = reasons,"),
           "a partial Apply, a Decline all and a rolled-back storey carry each changeset's own reasons (the unticked rows') on its result and its record");
        Ok(review.Contains("var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err, r.Reasons);")
           && review.Contains("+ ChangesetTrust.ReasonsLine(reply, r.Reasons?.Count ?? 0) +")
           // Review C15: a result the bridge had already taken says it too — the words are parenthesised (+ binds tighter than ??).
           && review.Contains("if (taken != null) reply = UnreportedResults.StoredReply(stored);")
           && review.Contains("rep.Words.Add((taken ?? $\"\\\"{r.Name}\\\": reported ({ChangesetTrust.LedgerOf(reply)}).\") + ChangesetTrust.ReasonsLine(reply, r.Reasons?.Count ?? 0) +"),
           "every report of the review sends its record's reasons — one sent again later too — and says how many the bridge kept, from its reply (or, for one it had already taken, from the stored result)");

        int show = At(review, "window.ShowRequested += el =>"), shown = At(review, "window.Show();");
        string zoom = show > 0 && shown > show ? review.Substring(show, shown - show) : "";
        Ok(window.Contains("public event Action<ChangesetElementDto> ShowRequested;") && window.Contains("show.Click += (_, _) => ShowRequested?.Invoke(el);")
           && window.Contains("if (el.Op == \"set_parameter\") { show.IsEnabled = false; show.ToolTip = ChangesetTrust.NoPlace; ToolTipService.SetShowOnDisabled(show, true); }")
           && window.Contains("public void Shown(string words) => Ui(() =>") && window.Contains("foot.Children.Add(_shown);"),
           "every row has Show; a type edit's is disabled and says why; what Show did is said on its own line, never over the status line that holds the result");
        Ok(zoom.Contains("App.Events.SelectAndShow(doc, el.Target.UniqueId, gone => window.Shown(gone == null ? $\"Showing {name}.\" : $\"{name}: {gone}\"));")
           && zoom.Contains("var box = ChangesetTrust.PlaceBox(el.Place);") && zoom.Contains("App.Events.Enqueue(doc, \"show the place\", (ui, _) =>")
           && zoom.Contains("view.ZoomAndCenterRectangle(new XYZ(box[0][0] * ft, box[0][1] * ft, box[0][2] * ft), new XYZ(box[1][0] * ft, box[1][1] * ft, box[1][2] * ft));")
           && zoom.Contains("}, refusal => window.Shown(refusal));") && zoom.Contains("catch (Exception ex) { window.Shown(")
           // Review C10: the active GRAPHICAL view — a schedule or the browser has none to zoom, said in the same words.
           && zoom.Contains("var active = uidoc.ActiveGraphicalView;") && zoom.Contains("var view = active == null ? null : uidoc.GetOpenUIViews().FirstOrDefault(v => v.ViewId == active.Id);") && !zoom.Contains("uidoc.ActiveView.")
           && !zoom.Contains("Transaction") && !zoom.Contains("ChangesetClient.") && !zoom.Contains("window.Say(") && Count(review, "window.Say(") == 3,
           "Show selects and zooms to a retype's or attach's element, or zooms the active view to where a create would be placed — on Revit's thread through the event hub, with no transaction and no bridge call; every outcome is said");
        Ok(hub.Contains("public void SelectAndShow(Document doc, string uniqueId, Action<string?> said) => Enqueue(doc, \"show the element\", (uiapp, d) =>")
           && hub.Contains("if (d.GetElement(uniqueId) is not { } e) { said(\"not in this model now (deleted, or changed since the proposal was planned).\"); return; }")
           && hub.Contains("}, said);") && hub.Contains("if (d.GetElement(id) is null) return;"),
           "the event hub's Show by UniqueId says when the element is gone and when the model is not the active one (DocPin's words); the id overload its other callers use is unchanged");
    }
}
