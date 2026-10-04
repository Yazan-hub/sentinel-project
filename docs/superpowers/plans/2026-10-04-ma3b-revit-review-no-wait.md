# MA-3b — the Revit review that does not wait: the picker, the groups, Decline all with a reason, and a result never lost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first sub-slice of the MA-3a plan's "Next ▸ MA-3b — the Revit desk that does not wait" (Revit only, plus three lines in the bridge), and the drill MA3b:
- **AI-2 — the review never waits on Revit's thread, and a report is never lost.** Apply's re-check (`FetchOne`), the role (`MyRole`), the DD IDS (`PromoteContext.Fetch`) and the guideline (`GhostStandards.Load`) run on a pool thread; every report (applied, declined, rolled back, sent again) runs on a pool thread through one `ReportAll` — no `GetResult` is left in the review command, and the modal Retry/Cancel loop that ran inside the placement event is gone from the review (Ghost Builder keeps its own `Report`). A result Revit applied is **written on this PC before its report is sent** (`%AppData%\Sentinel\unreported\<key>\<changeset id>.json`) and deleted when the bridge takes it. While it exists, its changeset is never opened for review again on this PC (the picker lists it, not openable; Promote's `Open` refuses it), so nothing is applied twice. It is sent again at the next Review AI Proposals or by the window's **Retry report** — each time only after the model's provenance stamps confirm its elements are still there (claimed vs verified): none there — never reported as applied, the record removed, said; some there — neither, said.
- **The window stays open until the report lands.** A refusal (a withdrawn changeset, a web decline that landed, a role, a guideline that could not be read, Decline all without a reason) is said on the window's status line and keeps the ticks and the note; Apply is pressed once per window; the status line then says what the bridge took, each changeset with `reported (ledger #n)`. The one-review guard is held while the picker or a window is open and while a report is in flight.
- **AI-5 — the picker.** Review AI Proposals opens a small window at once ("Loading…") listing every pending changeset, oldest first — a Promote storey's parts as ONE entry — with its age, source, the referee's verdict counts and the web's declines; the "reviewing the oldest first … Run again for the next" modal is gone. Nothing ticked is **Decline all**, which needs a reason (the note, stored as the result's `note`).
- **Groups.** The window's rows are grouped by what they do, in the web desk's words (`retype wall (28) · 28 ticked`), each group with **Tick group** (never a declined row) and **Untick group**.
- **The bridge answers the ledger row** of a result (`ledger: {id, hash}` on the reply to `POST /changesets/:key/:id/result`, never stored) — three lines and one vitest test.
- **Drill MA3b** — short: Revit 2024, two scratch copies of the B35 seed, the test bridge on `127.0.0.1:4101`, no web rows (rows R-1 … R-4, R-5 optional).

**Source of truth:** `docs/superpowers/plans/2026-10-04-ma3a-binding-web-decline.md` ▸ Next ▸ MA-3b (`:2432`); `docs/strategy/2026-09-30-revit-addin-audit.md` — AI-2 (`:352`), AI-5 (`:355`), the review findings (`:344-345`); `docs/strategy/2026-09-30-model-automation-design.md` — MA-3, Revit side (`:1104-1107`), §6.6 (`:844`). Base: `feature/ma3b-revit-desk` at `fed78cb` (master `f44b7fb` + migration 0037's record + web 1.0.41). Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight, as the founder asks — one drillable slice):** AI-2 whole (off the thread, the record, the guard, the stamp check), AI-5 whole (picker, Decline all with a reason, the ledger line, the window that stays open), the grouping. Left to **Next** with reasons: MA-3b2 (a reason per declined ghost — a bridge validator, storage and fixture; zoom to row), MA-3b3 (the Revit "ticked" lock — bridge state and the web desk; carrying a decline forward to a Promote re-run — a founder decision), MA-3b4 (a waiting result sent by itself on `DocumentOpened`; Ghost Builder's and Promote's own waits).

**Architecture:**

*Pure (add-in, promote-check §42).* `StoreyBatch.Entries(pending)` (the picker's entries: FIFO, `Of`'s storey rule), `StoreyBatch.Line(entry, now)` and `Age(createdAt, now)`; `ChangesetTrust.GroupOf(el)` (`"<op ?? create> <kind>"`, the web desk's `whatOf`) and `ChangesetTrust.LedgerOf(reply)`; `ProvenanceStamp.Holds(json, changesetId, guid)`; the new `Engine/UnreportedResults.cs` — `Record`, `Write`/`Read`/`ForKey`/`Delete` under `%AppData%\Sentinel\unreported` (path segments by `ArtefactCache.Safe`, now `internal`), and the words: `Verified(record, found)`, `Outcome(error, applied)`, `Blocked(records)`.

*Revit (scans §43, §39/§41 rewritten; the drill).* `ReviewChangesetsCommand.Execute` opens `ChangesetPickerWindow` at once, checks this model's waiting results against its stamps (API thread) and sends them again (`Retry` → `ReportAll`, pool thread), then lists the entries (`Load`, pool thread); a choice goes through `App.Events.Enqueue(doc, …)` to `Open(UIApplication, …)` (the reach count needs the API thread). `Open` refuses a batch with a waiting result; the window's `DecideRequested` runs `Decide` on a pool thread; `onDone` (the API thread, inside the placement event) only reads the model, writes the records, and hands the reports to `ReportAll`; `Send` puts the outcome on the window's status line and offers Retry report. `ChangesetReviewWindow` gains groups, a status line (`Say`, `Refused`, `Applying`, `Retry`, `Reopen`, `Lock` — each callable from any thread), `Gone` (C2) and never closes itself.

*Bridge.* `changesets-store.mjs reportResult` returns `{ ...updated, ledger: ledgerRef(row) }` (the `changeset_applied` row it already writes); the stored doc is unchanged.

**Tech Stack:** C# add-in (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF built in code); the offline check `tools/promote-check`; the Node bridge (ESM, vitest 2).

## Global Constraints

- Branch `feature/ma3b-revit-desk` (it holds this plan, on `fed78cb`); merge `--no-ff` into master only after every task's checks pass **and the live drill MA3b is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **No network call on Revit's API thread, and now no wait for one on any UI path of the review**: no `GetAwaiter().GetResult()` and no `.Wait(` in `Commands.ReviewChangesets.cs`; every request stays inside `ChangesetClient`'s existing methods (`Ma2dWiring` still counts 4 `() => Req(` and 3 GET sends — no new HTTP call).
  - **Nothing is applied twice.** A result Revit applied is on disk before its report is sent; while it is there its changeset is never opened for review on this PC; Apply is pressed once per window.
  - **Claimed vs verified.** A waiting result is sent again as applied only when every element it names is in the model with a stamp listing the changeset and the proposal.
  - **Words are said, never silent.** Every refusal, every report that did not land and every record removed is said on the window or the picker, with the bridge's words.
  - **The bridge holds the trust rules**; the add-in re-checks (MA-3a's `DeclinedTicked` on the fresh copies stays before the role and before anything runs).
  - **Every Revit write stays inside one TransactionGroup per Sentinel action (XC-2)**: the placement event is unchanged; the record is a file, never an Undo entry.
  - **No new database table, no migration, no web change.**
- After the add-in task, the builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false` for 2022–2027. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (net48 has only `System`, `System.Collections.Generic`, `System.Linq` as global usings).
- Checks: from `WebApp`, `npx vitest run <files>`; from the repo root, `dotnet run --project tools/promote-check`. A full vitest run rewrites `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with LF only: when `git diff --ignore-all-space --stat` on it is empty, `git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by source scans and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100; never publish to the That Open platform.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never print the founder's e-mail address; never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are `fed78cb`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs. A new or wholly replaced file may be written with LF (git normalises it).

**Dry run (planner, 2026-10-04).** A detached worktree of `feature/ma3b-revit-desk` at `fed78cb` in the session's scratchpad (`scratchpad/ma3b/dry`, `WebApp/node_modules` linked in as a junction; removed afterwards — never the repository). Every code step of **Tasks 1–3** was applied in order (the brief asked for Tasks 1–2; Task 3 was applied too, so no step of this plan is unbuilt code), each task's "see it fail" run made, then its code and its "see it pass" run. Task 4's replace was matched once. The totals in the steps are those runs':
- Base totals, measured first: `vitest run bridge/changesets-store.test.mjs` `1 passed (1)` file, `54 passed (54)`; `promote-check` `695/695`.
- Task 1: `1 failed | 54 passed (55)` → `55 passed (55)`; with the review and logic tests `3 passed (3)` files, `167 passed (167)`; `vitest run bridge` `91 passed (91)` files, `1854 passed | 1 skipped (1855)`; `ids-cases.json` rewritten LF-only with no other change and restored.
- Task 2: `promote-check` fails to compile (`CS2001: Source file '…\SentinelAddin\Engine\UnreportedResults.cs' could not be found`) → `716/716 checks pass`; `session-check` `47/47`, `artefact-cache-check` `55/55`.
- Task 3: `711/730 checks pass` (the 4 rewritten scans of §39/§41, MA-1a's rewritten scan in `PlacementBlock.cs` and the 14 of §43 fail on the old code) → `730/730 checks pass`; builds 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — no warning in a file MA-3b touches (master's own; a first draft's `CS4014` on `window.Dispatcher.BeginInvoke` is why that line starts with `_ =`).
- Task 4 (final): the full `npx vitest run` `143 passed (143)` files, `2319 passed | 1 skipped (2320)`; the check projects that compile a changed file pass as on master — `artefact-cache-check` `55/55`, `gate-check` `219/219`, `ghost-p2-check` `107/107`, `ghost-standards-check` `177/177`, `publish-check` `124/124`, `roi-check` `50/50`, `session-check` `47/47`, `promote-check` `730/730`.
- (Before the review amendments) after the plan was written, a second detached worktree at `fed78cb` (`scratchpad/ma3b/apply`) received Tasks 1–4 **from this document's text** by a script that reads its `Create`, `Replace the whole of` and replace blocks as an implementer does (23 steps; each replace matched its text exactly once): every file it touched was identical, line endings aside, to the dry run's; there `promote-check` `724/724` and the 2024 build `0`/`5`. Both worktrees were removed afterwards.
- **Review amendments (amender, 2026-10-04).** The totals above are the amended plan's: a fresh detached worktree of `feature/ma3b-revit-desk` at `0308898` (`scratchpad/ma3b/dry`, `node_modules` as a junction, removed afterwards — the junction first) received Tasks 1–4 **from this document's amended text** by a script that reads its `Create`, `Replace the whole of`, `In … replace` and `and replace` blocks (26 steps, each replace matched exactly once): base `promote-check` `695/695`; Task 1 `3 passed (3)` files, `167 passed (167)`; Task 2 `CS2001` → `716/716`, `session-check` `47/47`, `artefact-cache-check` `55/55`; Task 3 `711/730` → `730/730`, builds 2022–2027 `0` errors with `3/3/5/1/1/3` warnings (none in a file MA-3b touches); Task 4 the eight check projects as listed, the full vitest `143 passed (143)` files, `2319 passed | 1 skipped (2320)`. The first amended run found two older scans that name text MA-3b changes — MA-1a's NotRun words (`PlacementBlock.cs`, now rewritten in Task 3 Step 1) and §19's `r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El)` (kept by the code: Tick suggested skips a locked row with `.Where(x => x.Box.IsEnabled)`).
- Not run: the drill (Revit and the founder) and the commit commands.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | Where an "applied, unreported" result is kept (audit AI-2 says "Extensible Storage on ProjectInfo"; the MA-3a Next text says "a local file per document") | **A:** a file on this PC, `%AppData%\Sentinel\unreported\<key>\<changeset id>.json`, naming the model it was applied in; the model's provenance stamps (already written inside the placement's transaction) are the per-model truth checked before a retry. **B:** an Extensible Storage entity on ProjectInfo | **A** — B is an Undo entry of its own (Ctrl+Z could take the record away and leave the elements) and fights for ownership of ProjectInfo in a workshared central (`ArtefactCache.cs:21-22`'s reason); the stamp already answers "is it still in this model" |
| F2 | When a waiting result is sent again (AI-2's proof says "the report lands later by itself") | **A:** at the next Review AI Proposals in that model, and by the window's **Retry report** — each after a stamp check on Revit's thread. **B:** also by itself on `DocumentOpened` and on a timer | **A** — B is a background writer to the ledger with no window to say what it did; it is MA-3b4 (Next). The picker says what was sent and what was not |
| F3 | Decline all (nothing ticked) | **A:** needs a reason — the note; refused in words while it is empty (AI-5). **B:** optional, as today | **A**. A partial Apply's unticked ghosts keep the optional note (a reason per ghost is MA-3b2) |
| F4 | A waiting result of a model that is not open (another copy, a model never opened again) | **A:** listed in the picker's status and on its entry, the changeset not openable on this PC; the words name the file to delete once the person has checked it. **B:** a "Forget" button | **A** — no new control; a Forget that deletes a record of elements that are in some model is the duplicate AI-2 exists to prevent |
| F5 | The bridge names the ledger row of a result | **A:** `reportResult` returns `ledger: {id, hash}` (three lines; the founder restarts the 4100 bridge at the deployment). **B:** no bridge change: Revit says "the bridge named no ledger row" | **A**. Either order of deployment works: an older bridge's reply reads "the bridge named no ledger row"; an older add-in ignores the field |

## Amendments to the spec's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (audit AI-2, "Save an 'applied, unreported' record in Extensible Storage first").** The record is a file on this PC (F1 A), written before the report is sent; the model's provenance stamps are what a retry is checked against.
- **S2 (audit AI-2's proof, "The report lands later by itself").** It lands at the next Review AI Proposals in that model or by Retry report (F2 A). "Revit stays responsive" is proven with a bridge that accepts the connection and never answers (R-2), so the 120-second write wait is real.
- **S3 (audit AI-5, "'Decline all' … confirms 'Declined — reported (ledger …)'").** The window says `Declined <n> of <m> changeset(s) — nothing in the model changed.` and, for each changeset, `"<name>": reported (ledger #<id>).` — the ledger row of each changeset's `changeset_applied` row (a storey's parts are separate rows).
- **S4 (MA-3a Next, "a reason per decline in Revit (the result's optional `reasons {guid: text}`)").** MA-3b gives Decline all its required reason (the result's `note`); a reason per declined ghost needs the bridge's validator and storage, and is MA-3b2.
- **S5 (design `:1106`, "Rows grouped by storey and kind … accept a storey in one batch").** The storey is the picker's entry (a Promote storey's parts open as one window, StoreyBatch); the window groups by kind as the web desk does (`whatOf`: `"<op> <kind>"`); a storey is accepted in one batch with Tick group / Tick suggested and one Apply (one Undo, MA-2d).

## Review amendments (BINDING — the critic's findings, 2026-10-04; each is in the task text it changes. C1–C7 were important, M1–M5 minor; none critical, none rejected)

- **C1 — a result the bridge already took is landed, never "refused".** `reportResult` writes the doc (CAS) before its audit row, so a lost reply (the 120 s timeout, Revit closed mid-report, an audit that threw) leaves a record whose retry reads `409 changeset is partially_applied …`. In `ReportAll`, a `Bridge 409` on a record with applied elements re-reads the changeset with the existing `ChangesetClient.FetchOne` (the same pool thread; no new request — Ma2dWiring's counts hold); `UnreportedResults.AlreadyTaken(record, fresh)` returns the words when the changeset is no longer proposed and its stored `result.applied` names exactly the record's ghosts — then the record is deleted, remembered for the undo watcher and counted as landed: `"<name>": the bridge had already taken it (its reply did not reach Revit) — <status>; the bridge named no ledger row for it here.` Otherwise the 409 stands. `ChangesetDto` gains `Result` (`JsonElement?`, read as it comes). *Amender:* `AlreadyTaken` returns the words or null (not a bool) so §42 checks the decision and the words together. §42 +1, §43 +1 (with C6).
- **C2 — words for a closed window are never lost, and × before Apply is a cancel.** The window sets `Gone` on `Closed`. `Decide` checks it immediately before `window.Applying("Applying in Revit…")` (and before Decline all's) — set: nothing is raised (nothing declined), the Doctor log says `Review AI Proposals: the window was closed before Apply ran — nothing was placed.` `Send` and `onDone` speak through `Tell`: the window while it is open; once it is gone, the Doctor log, and for a result (not an interim "…Reporting" line) a TaskDialog through `App.Events.Enqueue(doc, "say the review's result", …)`. *Amender:* `Enqueue` already writes its refusal to the Doctor log (`RevitEventHub.cs:33`), so `onRefused` is a no-op rather than logging the words twice. §43 +1 (with M3).
- **C3 — "Go back" gives Apply back; a late web decline is locked; no words send the person into Busy.** `Reopen(words)` (any thread) clears `_applied` and re-enables Apply: `NotRun` uses it with `…Nothing was placed; the proposals are still pending — change the ticks or press Apply again.` `Lock(guids)` unticks and disables rows; the `DeclinedTicked` branch locks the hit rows before `Refused`, and `DeclinedTicked`'s last sentence becomes `Nothing was created. They are unticked here and cannot be ticked — press Apply again for the rest, or close this window.` (only the review uses it; §41's check follows). *Amender:* Tick suggested skips a disabled row (it would re-tick a locked one); `Verified`'s "some" words say `then close this window and run Review AI Proposals again`, and the picker's another-model words `close this list, open that model and run …` (the picker holds the guard too). `Blocked`'s words are unchanged — Promote's `Open` also shows them with no window open. MA-1a's scan of the old NotRun words (`PlacementBlock.cs`) is rewritten. §43 +1.
- **C4 — a model's path is compared without case.** `mine`/`away` in `Execute` use `string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)`; §43's scan says so and refuses `r.Doc == here`.
- **C5 — R-2 proves the 120 s wait and the report's own hold** (the drill's R-2, binding): the time from **Place anyway** to the words is recorded (pass: ≥ 115 s; under 100 s the POST failed on a pooled socket — press **Retry report** and measure that wait instead); then **Retry report** again, close the window with × while it waits, and press Review AI Proposals — Busy proves the guard is held by the report alone; the final words arrive as a TaskDialog (C2), closed by `WindowPattern.Close`. UNSURE 7 added (net48's pooled socket).
- **C6 — one round waits at most once.** After the first report that `Outcome` keeps (no answer, a timeout, a 5xx, a 401/403), `ReportAll` sends none of the rest: each goes to `Left` with `UnreportedResults.NotSent(applied)` — `not sent: the first report of this round did not land.` plus the kept-record line — so `Busy`'s "two minutes at most" holds for a storey. *Amender:* "did not land" rather than "did not answer" — true for a 403 too. §42 +1 (with M4).
- **C7 — the picker says what it waits on.** When this model has waiting results, `Execute` sets the picker's status right after `Show` (the API thread is the picker's): `Checking this model and sending <n> result(s) it applied that the bridge has not taken (the bridge has up to two minutes to answer)…`. *Amender:* in `Execute`, not `Load` — no new parameter, the same moment. §43 +1 (with M2).
- **M1 — one lock on StoreyBatch's mixed set.** `Of` holds `lock (Mixed)` (its body moved to `OfLocked`); the ponytail risk line is replaced by a stated one: listing marks a mixed storey's parts, as opening one did.
- **M2 — Decline all without a reason is refused at once.** The window refuses before `DecideRequested` (no bridge call) with `ChangesetTrust.DeclineNeedsReason`; `Decide` keeps the check as the backstop, with the same constant.
- **M3 — a request Revit did not take gives Apply back.** The `BeginInvoke` lambda is in `try`; `evt.Raise()` answering `Denied` or `TimedOut`, or a throw, unhooks `onDone` and `Reopen`s with the words. *Amender:* not `!= Accepted` — `Pending` means an earlier raise will still run, and giving Apply back then could place twice.
- **M4 — a timeout says what it is.** `Outcome` reads an error that is not the bridge's (`Bridge …`) and contains `canceled` as `the bridge did not answer within 120 s` (net48 `A task was canceled.`, net8 `…canceled due to the configured HttpClient.Timeout…`).
- **M5 — the founder's e-mail never reaches a command line.** The founder writes the membership body to a scratch file; the runner posts it with `@<file>`, prints only the status and the `user_id`, and deletes the file.
- **C8 (critical, second review) — an Undo while a report is in flight is posted once it lands.** AI-2 frees Revit while `ReportAll` waits (up to 120 s), and the undo watcher only knew a changeset after the bridge took it, so a Ctrl+Z in that time posted nothing and the bridge kept "applied" for elements the model no longer held. `ReportAll`, still on the caller's (API) thread, calls `UndoWatcher.Expect(r.Undo, r.ChangesetId)` for each applied result; `OnChanged` goes through `Seen(names, op)`, which notes an Undo/Redo of a changeset in flight and returns only the remembered ones; the landed branch calls `Land(…)` (Remember + forget the flight, one lock) and, when the last op noted was an Undo, posts `ReportReverted(…, "undo")` and says `UnreportedResults.UndoneInFlight`. Retry report is covered by the same path (its stamp check and `Expect` run in one API-thread job). §42 +1, §43 +1; the Remember scans of §39 and §43 now read the `Land` line.
- **C9 (important, second review) — a waiting result gone from the model is removed only after the bridge says what it holds.** `Verified` with no stamp left now answers `Ask` (no words, nothing removed on Revit's thread); `Retry` hands those records to `ReportAll(cfg, send, rep, gone)`, which re-reads each with the existing `FetchOne` on its pool thread and reads the answer with `UnreportedResults.Gone`: still proposed — the record goes, `…the bridge holds the changeset as proposed, so it opens for review again`; this very result (C1's `AlreadyTaken`) — the bridge took it and its reply was lost, then the model lost it (an Undo the watcher never knew, a model closed without saving): `ReportReverted(…, "undo")` is posted and the record goes only once it is (`RevertPosted`); another result — the record goes, said; not readable — kept. The words add "or a local that was never synchronised" (Risks). Drill R-5's expected words follow. §42 +1 (the `Verified` check now pins `Ask`), §43 +1.
- **C10 (minor, second review) — a 409 that cannot be re-read is never "refused".** `ReportAll` keeps `FetchOne`'s error: when the re-read after a `Bridge 409` fails, the record is kept (`Left`), the round stops (C6) and the words are `UnreportedResults.NotReRead` — `not reported: the bridge answered 409 and the changeset could not be re-read to tell whether it already holds this result (…)` plus the kept line. The record is removed only when `FetchOne` answered. §42 +1 (with C9's scan).
- **C11 (important, second review) — the picker's words are never lost.** The picker has `Gone` (set on `Closed`), as the window has (C2). `Load`, once this model's round of reports is back, checks it: when the picker was closed meanwhile (the round can take 120 s), the round's words — a record removed, a result reported, C1's "already taken" — go to the Doctor log and a TaskDialog through `App.Events.Enqueue(doc, "say the review's result", …)`, and nothing is listed (`Load` takes `doc`). `SetEntries` and the window's `Say` check `_gone` again on the UI thread: words posted to a picker or window that closed in between go to the Doctor log. §43 +1.
- **C12 (minor, second review) — × in the last gap places nothing; a Retry job that throws is said.** The raise's `BeginInvoke` lambda checks `window.Gone` first (× between `Decide`'s check and the raise had released the window's hold) and logs `…the window was closed before Apply ran — nothing was placed.`; Retry report's event-hub job wraps `Send(Retry(…))` in `try` — a throw (a stamp read) is said through `Tell` and Retry report comes back (the hub only logged it). §43 +1.
- **C13 (minor, second review) — a decline lost with its window is said so.** `UnreportedResults.DeclineKept` (Kept(0)'s line) and `DeclineLost`: `Tell` for a closed window replaces "Retry report sends it again." with `Nothing in the model changed; the changeset stays proposed — review it again to decline it.`; closing a window whose `left` still holds a decline logs the same in the Doctor log (E4). §43 +1.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The window's `DecideRequested` runs `Decide` with `Task.Run`; inside, the blocking client calls run as they are (they are synchronous, and `Send` builds each request on its own pool thread — MA-2d C1); `PromoteContext.Fetch` and `GhostStandards.Load` keep their `await Task.Run(…)` | No new HTTP call, so `Ma2dWiring`'s counts hold; `Ma2bWiring` still finds `Task.Run(() => PromoteContext.Fetch(key))` |
| E2 | Every window method the pool thread calls (`Say`, `Refused`, `Applying`, `Retry`, the picker's `SetEntries`) marshals itself through the window's `Dispatcher`; `handler.SetRequest` and `evt.Raise()` run through `window.Dispatcher.BeginInvoke` | Revit's main thread raises the event, as every modeless window here does; no reliance on a `SynchronizationContext` after an `await` |
| E3 | The guard is a counter (`Interlocked`): +1 for the open picker, +1 for the open window, +1 for each round of reports in flight | The old `_reviewOpen` was released on `Closed`, before the placement and the report (audit `:345`). In memory only: a Revit restart resets it, the records do not |
| E4 | A record is written only for a changeset with applied elements; a decline that did not land lives in the window's memory for Retry report | A decline changes nothing in the model; losing it (the window closed) leaves the changeset proposed, said: "Nothing in the model changed; Retry report sends it again" |
| E5 | The model's identity is `Publisher.CentralPath(doc) ?? PathName ?? Title` | A new local of the same central is the same model; a stale local's elements that never reached the central are "not in this model" — the record removed, said (Risks) |
| E6 | Before a retry: every applied element in the model with a stamp naming the changeset and the proposal → send; none → remove the record, said; some → keep it, said with its path | All-or-nothing placement (one group) makes "some" a person's deletion after Apply; never a guess |
| E7 | A report that fails: 400/404/409 — the record removed with the bridge's words (it never heals with the same body), except a 409 whose stored result names exactly the record's ghosts, which is landed (C1); 401/403 — kept, "sign in"; anything else — kept; after the first kept failure the rest of the round wait (C6) | Same split as `Report`'s no-retry list |
| E8 | `Report` (with its dialog) stays for Ghost Builder (`GhostChangesetBuild.cs:153,653`), unchanged | Ghost Builder's own waits are MA-3b4 |
| E9 | `ArtefactCache.Safe` becomes `internal` and is reused for the record's path segments; promote-check compiles `ArtefactCache.cs` | One sanitiser |
| E10 | Apply is pressed once per window (`_applied`); a refusal before anything ran gives Apply back, and so do a "Go back" inside the placement and a request Revit did not take (`Reopen` — C3, M3); × before the raise is a cancel (C2) | A second Apply in the same window could place the changeset twice while its report is still out |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `WebApp/bridge/changesets-store.mjs`, `changesets-store.test.mjs` | 1 | `reportResult` answers `ledger: ledgerRef(row)`; 1 test |
| `SentinelAddin/Engine/UnreportedResults.cs` (new) | 2 | `Record`, `Root`, `PathFor`, `Write`, `Read`, `ForKey`, `Delete`, `Verified`, `Outcome`, `Blocked` |
| `SentinelAddin/Engine/ArtefactCache.cs` | 2 | `Safe` internal |
| `SentinelAddin/GhostBuilder/StoreyBatch.cs` | 2 | `Entries`, `Line`, `Age` |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 2 | `ChangesetTrust.GroupOf`, `ChangesetTrust.LedgerOf` |
| `SentinelAddin/Engine/ProvenanceStamp.cs` | 2 | `Holds` |
| `tools/promote-check/Ma3bDesk.cs` (new), `Check.cs`, `promote-check.csproj` | 2, 3 | Sections 42 (21 checks) and 43 (14 scans) |
| `tools/promote-check/Ma2dWiring.cs`, `Ma3aReview.cs`, `PlacementBlock.cs` | 2, 3 | §39 and §41's scans of the review, rewritten with it; §41's `DeclinedTicked` words (C3, Task 2); MA-1a's scan of NotRun's words (C3) |
| `SentinelAddin/UI/ChangesetPickerWindow.cs` (new) | 3 | The picker |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | 3 | Groups, the status line, Retry report; never closes itself |
| `SentinelAddin/Commands.ReviewChangesets.cs` | 3 | The picker's entry, `Load`, `Retry`, `ReportAll`, `Open(UIApplication, …)`, `Decide` off the thread, `onDone` record-first |
| `docs/strategy/2026-09-30-model-automation-design.md` | 4 | What was built, drill pending |

---

## Tasks (in order: the bridge's ledger line; the pure pieces; the Revit wiring; the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file. `Replace the whole of <file> with` gives the whole file. `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once.

### Task 1 — Bridge: a result answers its ledger row

**Files:**
- Modify `WebApp/bridge/changesets-store.mjs` (`reportResult`)
- Test `WebApp/bridge/changesets-store.test.mjs`

**Interfaces:**
- Consumes: `ledgerRef(row)` (`changesets-store.mjs:58`, `{id, hash}` or null), the `changeset_applied` audit `reportResult` already writes.
- Produces: the reply of `POST /changesets/:key/:id/result` carries `ledger: {id, hash}` (`{id: null, hash: null}` when the ledger answered no id; `null` when it answered nothing). The stored doc never holds `ledger`. Task 2's `ChangesetTrust.LedgerOf(reply)` reads it.

- [ ] **Step 1: The failing test.** In `WebApp/bridge/changesets-store.test.mjs`, replace:

```js
    expect(deps.audit.mock.calls.some((c) => c[3] === "changeset_applied")).toBe(true);
  });
```

with:

```js
    expect(deps.audit.mock.calls.some((c) => c[3] === "changeset_applied")).toBe(true);
  });

  it("MA-3b: a result answers the changeset_applied row it wrote, so Revit says \"reported (ledger #n)\" — the stored doc does not keep it", async () => {
    const deps = baseDeps({ audit: vi.fn(async () => ({ id: 1731, hash: "cd".repeat(32) })) });
    const cs = await propose(deps);
    const out = await reportResult("demo", cs.id, { applied: [], rejected: cs.elements.map((e) => e.proposal_guid), note: "drill MA3b: wrong storey" }, "r", deps);
    expect(out).toMatchObject({ status: "declined", ledger: { id: 1731, hash: "cd".repeat(32) }, result: { note: "drill MA3b: wrong storey" } });
    expect(deps.saved.get(cs.id).ledger).toBeUndefined();
    // A ledger that names no row (an older audit answer) is said as such by the add-in (ChangesetTrust.LedgerOf): ledger {id: null}.
    const quiet = baseDeps();
    const cs2 = await propose(quiet);
    const out2 = await reportResult("demo", cs2.id, { applied: [], rejected: cs2.elements.map((e) => e.proposal_guid) }, "r", quiet);
    expect(out2.ledger).toEqual({ id: null, hash: null });
  });
```

- [ ] **Step 2: See it fail.** From `WebApp`: `npx vitest run bridge/changesets-store.test.mjs`
Expected: `1 failed | 54 passed (55)` — `AssertionError: expected { …(14) } to match object { status: 'declined', …(2) }`.

- [ ] **Step 3: The code.** In `WebApp/bridge/changesets-store.mjs`, replace:

```js
  await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
```

with:

```js
  // MA-3b (AI-5): the row is answered with the result, so Revit says "reported (ledger #n)" — on the reply only, never on the stored doc.
  const row = await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
```

and replace:

```js
      ...(conflicts.unchecked.length ? { applied_over_decline_unchecked: conflicts.unchecked, unchecked_why: UNCHECKED_WHY } : {}) });
  return updated;
```

with:

```js
      ...(conflicts.unchecked.length ? { applied_over_decline_unchecked: conflicts.unchecked, unchecked_why: UNCHECKED_WHY } : {}) });
  return { ...updated, ledger: ledgerRef(row) };
```

- [ ] **Step 4: See it pass.** From `WebApp`: `npx vitest run bridge/changesets-store.test.mjs bridge/changesets-review.test.mjs bridge/changesets-logic.test.mjs`
Expected: `3 passed (3)` files, `167 passed (167)`. Then `npx vitest run bridge`: `91 passed (91)` files, `1854 passed | 1 skipped (1855)`; restore `ids-cases.json` (Global Constraints).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-store.test.mjs
git commit -m "feat(bridge): MA-3b - a changeset result answers its changeset_applied ledger row (ledger {id, hash}), never stored, so Revit says reported (ledger #n)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2 — Revit, pure: the picker's entries, the groups, the ledger line, the waiting result and the stamp check

**Files:**
- Create `SentinelAddin/Engine/UnreportedResults.cs`, `tools/promote-check/Ma3bDesk.cs`
- Modify `SentinelAddin/Engine/ArtefactCache.cs`, `SentinelAddin/GhostBuilder/StoreyBatch.cs`, `SentinelAddin/Coordination/ChangesetClient.cs`, `SentinelAddin/Engine/ProvenanceStamp.cs`, `tools/promote-check/Check.cs`, `tools/promote-check/promote-check.csproj`, `tools/promote-check/Ma3aReview.cs` (C3: `DeclinedTicked`'s last sentence)

**Interfaces:**
- Consumes: `StoreyBatch.Of`/`Merge` (MA-2d), `ChangesetTrust.DeclinedOnWeb` (MA-3a), `ElementVerdictDto.Status`, `AppliedEntry`, `ProvenanceStamp.Json`, `ArtefactCache.Safe`; the bridge's `ledger` (Task 1).
- Produces:
  - `StoreyBatch.Entries(IReadOnlyList<ChangesetDto> pending) → List<List<ChangesetDto>>`; `StoreyBatch.Line(IReadOnlyList<ChangesetDto> entry, DateTime nowUtc) → string`; `StoreyBatch.Age(string createdAt, DateTime nowUtc) → string`.
  - `ChangesetTrust.GroupOf(ChangesetElementDto) → string`; `ChangesetTrust.LedgerOf(string reply) → string` (`"ledger #1731"` or `"the bridge named no ledger row"`); `ChangesetTrust.DeclineNeedsReason` (const, M2); `ChangesetDto.Result` (`JsonElement?`, C1); `ChangesetTrust.DeclinedTicked`'s last sentence now `They are unticked here and cannot be ticked — press Apply again for the rest, or close this window.` (C3).
  - `StoreyBatch.Of` holds a lock on its set of mixed parts (M1).
  - `ProvenanceStamp.Holds(string json, string changesetId, string guid) → bool`.
  - `UnreportedResults.Record {Key, ChangesetId, Name, Doc, Applied, Rejected, Note, ReviewRev, Undo, At}`; `UnreportedResults.Root` (internal), `PathFor(key, id)`, `Write(Record) → bool`, `Read(key, id) → Record|null`, `ForKey(key) → List<Record>`, `Delete(key, id)`, `Verified(Record, int found) → (bool Report, bool Drop, string Words)`, `Outcome(string error, int applied) → (bool Drop, string Words)` (a timeout said as `the bridge did not answer within 120 s` — M4), `NotSent(int applied) → string` (C6), `AlreadyTaken(Record, ChangesetDto fresh) → string|null` (C1: the words when the bridge already holds the result, else null), `Blocked(IEnumerable<Record>) → string`.

- [ ] **Step 1: The failing checks.** Create `tools/promote-check/Ma3bDesk.cs`:

```csharp
#nullable disable
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 42. MA-3b: the Revit review that does not wait (AI-2, AI-5) — the picker's entries and lines, the window's groups, the ledger
    //        line, the result that waits on this PC and the stamp check before it is sent again (pure) ───────────────────────────
    static void Ma3bDeskChecks()
    {
        Console.WriteLine("\nMA-3b — the picker, the groups, and the result that waits on this PC (AI-2, AI-5)");
        ChangesetDto Cs(string id, string name, string source, string created, params (string Guid, string Op, string Verdict)[] els) => new ChangesetDto
        {
            Id = id, Name = name, Source = source, Claimed = true, Status = "proposed", CreatedAt = created,
            Elements = els.Select(e => new ChangesetElementDto { ProposalGuid = e.Guid, Op = e.Op, Kind = "wall", Verdict = new ElementVerdictDto { Status = e.Verdict } }).ToList(),
        };
        var g1 = Cs("e1000000-a", "Promote (DD) · GR-FFL (1/2)", "promote", "2026-10-04T10:00:00Z", ("a", "retype", "recorded"), ("b", "attach", "recorded"));
        var agent = Cs("e2000000-a", "Core walls", "agent", "2026-10-04T10:05:00Z", ("c", null, "accepted"), ("d", null, "rejected"));
        var g2 = Cs("e3000000-a", "Promote (DD) · GR-FFL (2/2)", "promote", "2026-10-04T10:06:00Z", ("e", "retype", "recorded"));
        var l1 = Cs("e4000000-a", "Promote (DD) · 01-FFL", "promote", "2026-10-04T10:07:00Z", ("f", "attach", "recorded"));
        var entries = StoreyBatch.Entries(new List<ChangesetDto> { g1, agent, g2, l1 });
        Ok(entries.Count == 3 && entries[0].SequenceEqual(new[] { g1, g2 }) && entries[1].SequenceEqual(new[] { agent }) && entries[2].SequenceEqual(new[] { l1 })
           && StoreyBatch.Entries(new List<ChangesetDto>()).Count == 0,
           "the picker lists every pending changeset once, oldest first — a Promote storey's parts as one entry (StoreyBatch.Of's rule)");

        var now = new DateTime(2026, 10, 4, 12, 0, 0, DateTimeKind.Utc);
        g2.Elements[0].Review = new ReviewDto { State = "declined", Action = "decline", Reason = "no", By = "r@example.com", Role = "contributor" };
        Ok(StoreyBatch.Line(entries[0], now) == "Promote (DD) · GR-FFL (2 changesets, one Undo) — promote (claimed) · 2 h ago · 3 ghost(s): 0 accepted, 0 rejected, 3 recorded · 1 declined on the web"
           && StoreyBatch.Line(entries[1], now) == "Core walls — agent (claimed) · 1 h ago · 2 ghost(s): 1 accepted, 1 rejected, 0 recorded",
           "an entry's line: its name, source, age, its ghosts by the referee's verdict, and the web's declines");
        Ok(StoreyBatch.Age("2026-10-04T11:59:40Z", now) == "just now" && StoreyBatch.Age("2026-10-04T11:47:30.5+00:00", now) == "12 min ago"
           && StoreyBatch.Age("2026-10-01T09:00:00Z", now) == "3 d ago" && StoreyBatch.Age("not a time", now) == "age unknown" && StoreyBatch.Age(null, now) == "age unknown",
           "the age reads the bridge's created_at as UTC — and says so when it cannot read it");

        Ok(ChangesetTrust.GroupOf(g1.Elements[0]) == "retype wall" && ChangesetTrust.GroupOf(agent.Elements[0]) == "create wall"
           && StoreyBatch.Merge(entries[0]).Elements.GroupBy(ChangesetTrust.GroupOf).Select(g => $"{g.Key} ({g.Count()})").SequenceEqual(new[] { "retype wall (2)", "attach wall (1)" }),
           "the window groups a storey's ghosts by what they do, in the web desk's words (review-desk.ts whatOf), in the order they come");

        const string none = "the bridge named no ledger row";
        Ok(ChangesetTrust.LedgerOf("{\"id\":\"x\",\"status\":\"declined\",\"ledger\":{\"id\":1731,\"hash\":\"ab\"}}") == "ledger #1731"
           && ChangesetTrust.LedgerOf("{\"id\":\"x\",\"ledger\":{\"id\":null,\"hash\":null}}") == none && ChangesetTrust.LedgerOf("{\"id\":\"x\",\"ledger\":null}") == none
           && ChangesetTrust.LedgerOf("{\"id\":\"x\"}") == none && ChangesetTrust.LedgerOf("not json") == none && ChangesetTrust.LedgerOf(null) == none,
           "a reported result names its ledger row; a bridge before MA-3b (no ledger), a row with no id and a reply that is not JSON say the web desk's words");

        // The record: written before the report is sent, read back whole, never another changeset's or key's.
        var root = Path.Combine(Path.GetTempPath(), "ma3b-check-" + Guid.NewGuid().ToString("N"));
        var was = UnreportedResults.Root;
        UnreportedResults.Root = root;
        try
        {
            var rec = new UnreportedResults.Record
            {
                Key = "ma3b", ChangesetId = "e1000000-a", Name = "Promote (DD) · GR-FFL (1/2)", Doc = @"C:\models\a.rvt",
                Applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "a", RevitElementId = 401, RevitUniqueId = "u-a" } }, Rejected = new List<string> { "b" },
                Note = "DD IDS: 1 failing, placed anyway | reviewer: drill", ReviewRev = 2, Undo = new List<string> { "Sentinel AI changeset: Promote (DD) · GR-FFL [e1000000]" },
                At = "2026-10-04T12:00:00Z",
            };
            Ok(UnreportedResults.Write(rec) && File.Exists(UnreportedResults.PathFor("ma3b", "e1000000-a")) && UnreportedResults.PathFor("ma3b", "e1000000-a") == Path.Combine(root, "ma3b", "e1000000-a.json"),
               "a result Revit applied is written to <root>\\<key>\\<changeset id>.json (%AppData%\\Sentinel\\unreported; here a temp root) before its report is sent");
            var back = UnreportedResults.Read("ma3b", "e1000000-a");
            Ok(back != null && back.Doc == rec.Doc && back.Name == rec.Name && back.Applied.Single().RevitUniqueId == "u-a" && back.Applied[0].RevitElementId == 401
               && back.Applied[0].ProposalGuid == "a" && back.Rejected.SequenceEqual(new[] { "b" }) && back.Note == rec.Note && back.ReviewRev == 2 && back.Undo.SequenceEqual(rec.Undo) && back.At == rec.At,
               "…and read back whole: the applied ids, the rejected guids, the note, the review_rev Apply re-checked and the Undo names — the body the retry sends is the one Apply built");
            File.WriteAllText(Path.Combine(root, "ma3b", "e9.json"), "{ not json");
            File.WriteAllText(UnreportedResults.PathFor("ma3b", "other"), File.ReadAllText(UnreportedResults.PathFor("ma3b", "e1000000-a")));
            Ok(UnreportedResults.ForKey("ma3b").Select(r => r.ChangesetId).SequenceEqual(new[] { "e1000000-a" }) && UnreportedResults.Read("ma3b", "other") == null
               && UnreportedResults.Read("ma3b-x", "e1000000-a") == null && UnreportedResults.ForKey("nothing-here").Count == 0,
               "a file that is not a record, or another changeset's or key's record under this name, is no record (never sent as this one)");
            UnreportedResults.Delete("ma3b", "e1000000-a");
            Ok(UnreportedResults.Read("ma3b", "e1000000-a") == null && !UnreportedResults.ForKey("ma3b").Any(), "a result the bridge took loses its record");
            var file = Path.Combine(root, "a-file");
            File.WriteAllText(file, "x");
            UnreportedResults.Root = file;
            Ok(!UnreportedResults.Write(rec), "a record that cannot be written says so (false) — the window then says nothing on this PC remembers the result");
        }
        finally
        {
            UnreportedResults.Root = was;
            try { Directory.Delete(root, true); } catch (Exception) { /* a temp folder */ }
        }

        // Before a waiting result is sent again: what the model holds is the truth (claimed vs verified).
        var two = new UnreportedResults.Record
        {
            Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL",
            Applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "a", RevitUniqueId = "u-a" }, new AppliedEntry { ProposalGuid = "b", RevitUniqueId = "u-b" } },
        };
        var all = UnreportedResults.Verified(two, 2);
        var gone = UnreportedResults.Verified(two, 0);
        var some = UnreportedResults.Verified(two, 1);
        var decline = UnreportedResults.Verified(new UnreportedResults.Record { Key = "k", ChangesetId = "d", Name = "x" }, 0);
        Ok(all.Report && !all.Drop && all.Words == null && decline.Report && !decline.Drop,
           "a result whose every element still carries its stamp is sent again (a decline, which placed nothing, too)");
        Ok(!gone.Report && gone.Drop && gone.Words == "\"Promote (DD) · GR-FFL\": not in this model as applied (undone, or the model was closed without saving) — nothing reported; the changeset stays proposed and opens for review again. This PC's record is removed.",
           "a result none of whose elements carries its stamp any more is never reported as applied — said, and its record removed");
        Ok(!some.Report && !some.Drop && some.Words == $"\"Promote (DD) · GR-FFL\": 1 of 2 element(s) Apply placed carry its stamp in this model — nothing reported, and the record is kept ({UnreportedResults.PathFor("k", "c")}): check the model (finish the Undo, or delete what is left), then close this window and run Review AI Proposals again.",
           "a result only part of which is in the model is neither reported nor forgotten — said, with the record's path");

        var refused = UnreportedResults.Outcome("Bridge 409: {\"message\":\"changeset is partially_applied — a result can be reported exactly once, from proposed\"}", 2);
        var signIn = UnreportedResults.Outcome("Bridge 403: {\"message\":\"result requires the contributor role (you are viewer)\"}", 2);
        var down = UnreportedResults.Outcome("No connection could be made because the target machine actively refused it. (127.0.0.1:4101)", 2);
        var downDecline = UnreportedResults.Outcome(null, 0);
        Ok(refused.Drop && refused.Words == "the bridge refused it (retrying cannot fix this): Bridge 409: {\"message\":\"changeset is partially_applied — a result can be reported exactly once, from proposed\"}\nThis PC's record is removed; the 2 element(s) Apply placed are still in this model — check the changeset's status on the bridge before any re-review.",
           "a result the bridge refuses for good (400, 404, 409) loses its record, said with the bridge's words and what is still in the model");
        Ok(!signIn.Drop && signIn.Words == "not reported: Bridge 403: {\"message\":\"result requires the contributor role (you are viewer)\"}\nSign in (Standards ▸ Sign in) as a contributor on this project, then press Retry report.\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice.",
           "a 401 or 403 keeps the record and says to sign in");
        Ok(!down.Drop && down.Words == "not reported: No connection could be made because the target machine actively refused it. (127.0.0.1:4101)\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice."
           && !downDecline.Drop && downDecline.Words == "not reported: the bridge did not answer\nNothing in the model changed; Retry report sends it again.",
           "a bridge that does not answer keeps the record (AI-2) — and a decline, which placed nothing, says so");
        var waiting = new UnreportedResults.Record { Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL", Doc = @"C:\models\a.rvt", At = "2026-10-04T12:00:00Z" };
        Ok(UnreportedResults.Blocked(new[] { waiting }) == "\"Promote (DD) · GR-FFL\" was applied in C:\\models\\a.rvt (2026-10-04T12:00:00Z) and the bridge has not taken its result yet — it is not opened for review again, so nothing is applied twice. Run Review AI Proposals in that model: it checks the model and reports it first.",
           "a changeset with a waiting result is not opened, and the words say where it was applied and what reports it");

        // Review C1: a 409 on a result the bridge already holds (its reply was lost: the 120 s timeout, Revit closed mid-report, or the
        // audit row threw after the doc was written) is landed — never "refused" — when the stored result applied exactly the record's ghosts.
        var held = new UnreportedResults.Record
        {
            Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL",
            Applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "a", RevitUniqueId = "u-a" }, new AppliedEntry { ProposalGuid = "b", RevitUniqueId = "u-b" } },
        };
        ChangesetDto Stored(string status, string result) => System.Text.Json.JsonSerializer.Deserialize<ChangesetDto>($"{{\"id\":\"c\",\"status\":\"{status}\",\"result\":{result}}}");
        const string ab = "{\"applied\":[{\"proposal_guid\":\"b\",\"revit_element_id\":2},{\"proposal_guid\":\"a\",\"revit_element_id\":1}],\"rejected\":[]}";
        Ok(UnreportedResults.AlreadyTaken(held, Stored("partially_applied", ab)) == "\"Promote (DD) · GR-FFL\": the bridge had already taken it (its reply did not reach Revit) — partially_applied; the bridge named no ledger row for it here."
           && UnreportedResults.AlreadyTaken(held, Stored("proposed", "null")) == null
           && UnreportedResults.AlreadyTaken(held, Stored("applied", "{\"applied\":[{\"proposal_guid\":\"a\",\"revit_element_id\":1}]}")) == null
           && UnreportedResults.AlreadyTaken(held, Stored("withdrawn", "null")) == null && UnreportedResults.AlreadyTaken(held, null) == null
           && UnreportedResults.AlreadyTaken(new UnreportedResults.Record { Key = "k", ChangesetId = "c", Name = "x" }, Stored("declined", "{\"applied\":[]}")) == null,
           "review C1: a result the bridge already holds with exactly the record's applied ghosts is taken (said); a proposed, withdrawn or different result, or no applied ghost, is not");

        // Review M4, C6: a write that timed out says so; after the first report of a round that did not land, the rest are not sent.
        var net48 = UnreportedResults.Outcome("A task was canceled.", 2);
        var net8 = UnreportedResults.Outcome("The request was canceled due to the configured HttpClient.Timeout of 120 seconds elapsing.", 0);
        Ok(!net48.Drop && net48.Words.StartsWith("not reported: the bridge did not answer within 120 s\nThe result is kept on this PC", StringComparison.Ordinal)
           && !net8.Drop && net8.Words == "not reported: the bridge did not answer within 120 s\nNothing in the model changed; Retry report sends it again."
           && UnreportedResults.Outcome("Bridge 409: {\"message\":\"canceled\"}", 0).Words.StartsWith("the bridge refused it", StringComparison.Ordinal)
           && UnreportedResults.NotSent(2) == "not sent: the first report of this round did not land.\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice."
           && UnreportedResults.NotSent(0) == "not sent: the first report of this round did not land.\nNothing in the model changed; Retry report sends it again.",
           "review M4, C6: a report that timed out reads \"did not answer within 120 s\" (net48's and net8's words; a bridge's own words are kept); a result not sent after the round's first failure is kept, said");

        const string stamp = "{\"v\":2,\"changeset_id\":\"c2\",\"source\":\"promote\",\"proposal_guids\":[\"a\",\"x\"],\"unique_id_at_placement\":\"u-a\",\"changeset_ids\":[\"c1\",\"c2\"]}";
        Ok(ProvenanceStamp.Holds(stamp, "c2", "a") && ProvenanceStamp.Holds(stamp, "c1", "x") && !ProvenanceStamp.Holds(stamp, "c3", "a") && !ProvenanceStamp.Holds(stamp, "c2", "z")
           && !ProvenanceStamp.Holds(null, "c2", "a") && !ProvenanceStamp.Holds("not json", "c2", "a") && !ProvenanceStamp.Holds("[1]", "c2", "a") && !ProvenanceStamp.Holds(stamp, null, "a"),
           "the stamp holds a waiting result's element only when it lists both the changeset and the proposal (written inside the placement's transaction: an Undo takes it away)");
        Ok(ProvenanceStamp.Holds(ProvenanceStamp.Json("c9", "promote", new[] { "g9" }, "u-9"), "c9", "g9"),
           "…as the executor writes it (ProvenanceStamp.Json)");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3aWiringChecks();
```

with:

```csharp
        Ma3aWiringChecks();
        Ma3bDeskChecks();
```

In `tools/promote-check/promote-check.csproj`, replace:

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\StoreyBatch.cs" />
```

with:

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\StoreyBatch.cs" />
    <!-- MA-3b (AI-2): a result Revit applied and has not reported, kept on this PC; its path segments are the artefact cache's -->
    <Compile Include="..\..\SentinelAddin\Engine\UnreportedResults.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\ArtefactCache.cs" />
```

In `tools/promote-check/Ma3aReview.cs` (§41 — review amendment C3: a late web decline is unticked and locked in the window that stays open, so its words no longer send the person to a second Review AI Proposals, which reads Busy), replace:

```csharp
Nothing was created. Run Review AI Proposals again: they open unticked, with the reason.",
```

with:

```csharp
Nothing was created. They are unticked here and cannot be ticked — press Apply again for the rest, or close this window.",
```

- [ ] **Step 2: See it fail.** From the repo root: `dotnet run --project tools/promote-check`
Expected: the build fails — `error CS2001: Source file '…\SentinelAddin\Engine\UnreportedResults.cs' could not be found`.

- [ ] **Step 3: The code.** Create `SentinelAddin/Engine/UnreportedResults.cs`:

```csharp
#nullable disable
// MA-3b (AI-2): a result Revit applied that the bridge has not taken yet. Written on this PC BEFORE its report is sent (the API thread,
// right after the placement committed) and deleted when the bridge takes it. While it exists the changeset is never opened for review
// on this PC (ReviewChangesetsCommand.Open refuses it), so nothing is applied twice; Review AI Proposals checks it against the model's
// provenance stamps (ProvenanceStamp.Holds — claimed vs verified) and sends it again. %AppData%\Sentinel\unreported\<key>\<changeset
// id>.json: persistent, NOT the deletable cache (PlatformExporter's outbox rule), and not Extensible Storage (a write there is an Undo
// entry and fights for ownership in a workshared central — ArtefactCache's reason; founder decision F1). Pure file I/O and words
// (tools/promote-check, section 42); never throws.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Coordination;

namespace Sentinel.Engine
{
    public static class UnreportedResults
    {
        /// <summary>The result as Apply built it — the body the report sends — and where it was applied.</summary>
        public sealed class Record
        {
            [JsonPropertyName("key")] public string Key { get; set; }
            [JsonPropertyName("changeset_id")] public string ChangesetId { get; set; }
            [JsonPropertyName("name")] public string Name { get; set; }
            /// <summary>The model it was applied in: the workshared central's path, else the file's path, else its title.</summary>
            [JsonPropertyName("doc")] public string Doc { get; set; }
            [JsonPropertyName("applied")] public List<AppliedEntry> Applied { get; set; } = new List<AppliedEntry>();
            [JsonPropertyName("rejected")] public List<string> Rejected { get; set; } = new List<string>();
            [JsonPropertyName("note")] public string Note { get; set; }
            /// <summary>The review_rev Apply re-checked (MA-3a); null when none was.</summary>
            [JsonPropertyName("review_rev")] public int? ReviewRev { get; set; }
            /// <summary>The Undo entry names the undo watcher remembers it under once the bridge takes it.</summary>
            [JsonPropertyName("undo")] public List<string> Undo { get; set; } = new List<string>();
            [JsonPropertyName("at")] public string At { get; set; }
        }

        /// <summary>The root. The check points it at a temp folder; nothing else sets it.</summary>
        internal static string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "unreported");

        public static string PathFor(string key, string id) => Path.Combine(Root, ArtefactCache.Safe(key), ArtefactCache.Safe(id) + ".json");

        /// <summary>False when it could not be written — the caller says nothing on this PC remembers the result.</summary>
        public static bool Write(Record r)
        {
            try
            {
                var path = PathFor(r.Key, r.ChangesetId);
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.WriteAllText(path, JsonSerializer.Serialize(r));
                return true;
            }
            catch (Exception) { return false; }
        }

        /// <summary>The record of changeset <paramref name="id"/> on <paramref name="key"/>, or null (none, unreadable, or another's).</summary>
        public static Record Read(string key, string id)
        {
            var r = Load(PathFor(key, id));
            return r != null && r.Key == key && r.ChangesetId == id ? r : null;
        }

        /// <summary>Every record of <paramref name="key"/>, oldest first — each only under its own file name.</summary>
        public static List<Record> ForKey(string key)
        {
            try
            {
                var dir = Path.Combine(Root, ArtefactCache.Safe(key));
                if (!Directory.Exists(dir)) return new List<Record>();
                return Directory.GetFiles(dir, "*.json").Select(f => (File: f, R: Load(f)))
                    .Where(x => x.R != null && x.R.Key == key && string.Equals(PathFor(key, x.R.ChangesetId), x.File, StringComparison.OrdinalIgnoreCase))
                    .Select(x => x.R).OrderBy(r => r.At ?? "", StringComparer.Ordinal).ToList();
            }
            catch (Exception) { return new List<Record>(); }
        }

        public static void Delete(string key, string id)
        {
            try { File.Delete(PathFor(key, id)); } catch (Exception) { /* nothing to delete */ }
        }

        private static Record Load(string path)
        {
            try { return File.Exists(path) ? JsonSerializer.Deserialize<Record>(File.ReadAllText(path)) : null; }
            catch (Exception) { return null; }
        }

        /// <summary>Before a waiting result is sent again: <paramref name="found"/> is how many of its applied elements this model still
        /// holds with a stamp naming the changeset and the proposal (read by the caller on the API thread). All of them: send it. None: it
        /// is not in this model as applied — never reported as applied, the record removed. Some: neither — the record kept, said.</summary>
        public static (bool Report, bool Drop, string Words) Verified(Record r, int found)
        {
            int total = r.Applied?.Count ?? 0;
            if (found == total) return (true, false, null);
            if (found == 0)
                return (false, true, $"\"{r.Name}\": not in this model as applied (undone, or the model was closed without saving) — nothing reported; the changeset stays proposed and opens for review again. This PC's record is removed.");
            return (false, false, $"\"{r.Name}\": {found} of {total} element(s) Apply placed carry its stamp in this model — nothing reported, and the record is kept ({PathFor(r.Key, r.ChangesetId)}): check the model (finish the Undo, or delete what is left), then close this window and run Review AI Proposals again.");
        }

        /// <summary>A report that did not land (<paramref name="error"/> as ChangesetClient says it): whether the record goes, and the words.
        /// 400, 404 and 409 never heal on a retry with the same body — the record goes, said; anything else keeps it for a retry.</summary>
        public static (bool Drop, string Words) Outcome(string error, int applied)
        {
            var err = string.IsNullOrWhiteSpace(error) ? "the bridge did not answer" : error;
            bool Is(params string[] codes) => codes.Any(c => err.StartsWith("Bridge " + c, StringComparison.Ordinal));
            // Review M4: the 120 s write timeout reads "A task was canceled." (net48) or "…canceled due to the configured HttpClient.Timeout…"
            // (net8) — said as what it is; a bridge's own words are never rewritten.
            if (!err.StartsWith("Bridge ", StringComparison.Ordinal) && err.IndexOf("canceled", StringComparison.OrdinalIgnoreCase) >= 0)
                err = "the bridge did not answer within 120 s";
            if (Is("400", "404", "409"))
                return (true, $"the bridge refused it (retrying cannot fix this): {err}" +
                              (applied > 0 ? $"\nThis PC's record is removed; the {applied} element(s) Apply placed are still in this model — check the changeset's status on the bridge before any re-review." : ""));
            return (false, $"not reported: {err}" + (Is("401", "403") ? "\nSign in (Standards ▸ Sign in) as a contributor on this project, then press Retry report." : "") + Kept(applied));
        }

        /// <summary>Review C6: a result not sent because the round's first report did not land (each waits up to 120 s) — kept, said.</summary>
        public static string NotSent(int applied) => "not sent: the first report of this round did not land." + Kept(applied);

        private static string Kept(int applied) => applied > 0
            ? "\nThe result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice."
            : "\nNothing in the model changed; Retry report sends it again.";

        /// <summary>Review C1: the words when the bridge already holds this result — a 409 whose stored changeset (<paramref name="fresh"/>,
        /// re-read) is no longer proposed and applied exactly the record's ghosts: its earlier report landed and the reply was lost (the 120 s
        /// timeout, Revit closed mid-report, or the audit row threw after the doc was written). Null otherwise — then the 409 stands.</summary>
        public static string AlreadyTaken(Record r, ChangesetDto fresh)
        {
            if ((r?.Applied?.Count ?? 0) == 0 || fresh?.Status == null || fresh.Status == "proposed") return null;
            if (fresh.Result is not { ValueKind: JsonValueKind.Object } res || !res.TryGetProperty("applied", out var a) || a.ValueKind != JsonValueKind.Array) return null;
            var took = new HashSet<string>(a.EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Object && x.TryGetProperty("proposal_guid", out var g) && g.ValueKind == JsonValueKind.String ? g.GetString() : null)
                .Where(g => g != null), StringComparer.Ordinal);
            return took.SetEquals(r.Applied.Select(x => x.ProposalGuid))
                ? $"\"{r.Name}\": the bridge had already taken it (its reply did not reach Revit) — {fresh.Status}; the bridge named no ledger row for it here."
                : null;
        }

        /// <summary>Why a changeset is not opened for review: its result waits on this PC.</summary>
        public static string Blocked(IEnumerable<Record> waiting) =>
            string.Join("\n\n", waiting.Select(r => $"\"{r.Name}\" was applied in {r.Doc} ({r.At}) and the bridge has not taken its result yet — it is not opened for review again, so nothing is applied twice. Run Review AI Proposals in that model: it checks the model and reports it first."));
    }
}
```

In `SentinelAddin/Engine/ArtefactCache.cs`, replace:

```csharp
    private static string Safe(string? s)
```

with:

```csharp
    // MA-3b: also UnreportedResults' path segments.
    internal static string Safe(string? s)
```

In `SentinelAddin/GhostBuilder/StoreyBatch.cs`, replace:

```csharp
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
```

with:

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
```

and replace:

```csharp
    // Review C13: the ids of Promote parts that were pending when their storey had a part waiting twice or missing.
```

with:

```csharp
    /// <summary>MA-3b (AI-5): every pending changeset as the review picker lists it — in <paramref name="pending"/>'s order (FIFO), a
    /// Promote storey's parts as ONE entry (Of's rule: a part Of reviews alone is an entry of its own).</summary>
    public static List<List<ChangesetDto>> Entries(IReadOnlyList<ChangesetDto> pending)
    {
        var taken = new HashSet<string>();
        var entries = new List<List<ChangesetDto>>();
        foreach (var cs in pending ?? new List<ChangesetDto>())
        {
            if (cs?.Id == null || taken.Contains(cs.Id)) continue;
            var entry = Of(pending, cs);
            foreach (var x in entry) taken.Add(x.Id);
            entries.Add(entry);
        }
        return entries;
    }

    /// <summary>MA-3b (AI-5): an entry's line in the picker — its name, source, age, its ghosts by the referee's verdict, and the web's
    /// declines.</summary>
    public static string Line(IReadOnlyList<ChangesetDto> entry, DateTime nowUtc)
    {
        var cs = Merge(entry);
        var els = cs.Elements ?? new List<ChangesetElementDto>();
        int V(string status) => els.Count(e => (e.Verdict?.Status ?? "recorded") == status);
        int declined = els.Count(ChangesetTrust.DeclinedOnWeb);
        return $"{cs.Name} — {cs.Source}{(cs.Claimed == true ? " (claimed)" : "")} · {Age(cs.CreatedAt, nowUtc)} · {els.Count} ghost(s): {V("accepted")} accepted, {V("rejected")} rejected, {V("recorded")} recorded" +
               (declined > 0 ? $" · {declined} declined on the web" : "");
    }

    /// <summary>"just now", "12 min ago", "3 h ago", "2 d ago" — the bridge's created_at read as UTC; "age unknown" when it is not a time.</summary>
    public static string Age(string createdAt, DateTime nowUtc)
    {
        if (!DateTime.TryParse(createdAt, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var at)) return "age unknown";
        var min = (nowUtc - at).TotalMinutes;
        return min < 1 ? "just now" : min < 60 ? $"{(int)min} min ago" : min < 48 * 60 ? $"{(int)(min / 60)} h ago" : $"{(int)(min / 1440)} d ago";
    }

    // Review C13: the ids of Promote parts that were pending when their storey had a part waiting twice or missing.
```

and replace (review amendment M1 — the picker lists entries on a pool thread while Promote may call `Of` on Revit's: one lock on the one set):

```csharp
    public static List<ChangesetDto> Of(IEnumerable<ChangesetDto> pending, ChangesetDto first)
    {
        var alone = new List<ChangesetDto> { first };
```

with:

```csharp
    public static List<ChangesetDto> Of(IEnumerable<ChangesetDto> pending, ChangesetDto first)
    {
        // MA-3b review M1: the picker's Entries call this on a pool thread while Promote may call it on Revit's — Mixed is one set.
        lock (Mixed) return OfLocked(pending, first);
    }

    private static List<ChangesetDto> OfLocked(IEnumerable<ChangesetDto> pending, ChangesetDto first)
    {
        var alone = new List<ChangesetDto> { first };
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace:

```csharp
    /// <summary>The changeset's source as the review shows it: a claim is said to be one.</summary>
```

with:

```csharp
    /// <summary>MA-3b: the review window's group for a ghost — what it does, in the web desk's words (review-desk.ts whatOf): "retype wall".</summary>
    public static string GroupOf(ChangesetElementDto el) => $"{el.Op ?? "create"} {el.Kind}";

    /// <summary>MA-3b (AI-5): the ledger row the bridge named for a result — "ledger #1731" — or the web desk's words when it named none
    /// (a bridge before MA-3b, a row with no id, or a reply that is not JSON).</summary>
    public static string LedgerOf(string reply)
    {
        try
        {
            using var doc = JsonDocument.Parse(reply ?? "");
            var r = doc.RootElement;
            return r.ValueKind == JsonValueKind.Object && r.TryGetProperty("ledger", out var l) && l.ValueKind == JsonValueKind.Object && l.TryGetProperty("id", out var id)
                   && (id.ValueKind == JsonValueKind.Number || id.ValueKind == JsonValueKind.String) ? "ledger #" + id : "the bridge named no ledger row";
        }
        catch (JsonException) { return "the bridge named no ledger row"; }
    }

    /// <summary>MA-3b (AI-5, review M2): Decline all without a reason — said by the window at once and by the command as the backstop.</summary>
    public const string DeclineNeedsReason = "Nothing is ticked, so this declines every ghost — a decline needs a reason: type it in the note (it is recorded with the result), then press Decline all.";

    /// <summary>The changeset's source as the review shows it: a claim is said to be one.</summary>
```

and replace (review amendment C3 — the window that stays open unticks and locks a late decline; a second Review AI Proposals would read Busy):

```csharp
            "\n\nNothing was created. Run Review AI Proposals again: they open unticked, with the reason.";
```

with:

```csharp
            "\n\nNothing was created. They are unticked here and cannot be ticked — press Apply again for the rest, or close this window.";
```

and replace (review amendment C1 — the stored result, read only to tell a lost reply from a refusal):

```csharp
    [JsonPropertyName("exceptions")] public List<ExceptionRowDto> Exceptions { get; set; } = new();
}

public sealed class AppliedEntry
```

with:

```csharp
    [JsonPropertyName("exceptions")] public List<ExceptionRowDto> Exceptions { get; set; } = new();
    /// <summary>MA-3b review C1: the stored result as the bridge holds it (null while proposed) — read as it comes, so an odd value never
    /// breaks reading the changeset; UnreportedResults.AlreadyTaken reads its applied ghosts.</summary>
    [JsonPropertyName("result")] public JsonElement? Result { get; set; }
}

public sealed class AppliedEntry
```

In `SentinelAddin/Engine/ProvenanceStamp.cs`, replace:

```csharp
        /// <summary>The source of the changeset that last stamped (e.g. "promote"), or null. Pure; never throws.</summary>
```

with:

```csharp
        /// <summary>MA-3b (AI-2): whether the stamp lists changeset <paramref name="changesetId"/> and proposal <paramref name="guid"/> — what a
        /// result waiting on this PC is checked against before it is sent again. The stamp is written inside the placement's transaction,
        /// so an Undo, or closing the model without saving, takes it away. Pure; never throws.</summary>
        public static bool Holds(string json, string changesetId, string guid)
        {
            try
            {
                using var d = JsonDocument.Parse(json ?? "null");
                var r = d.RootElement;
                bool Lists(string name, string value) => r.TryGetProperty(name, out var a) && a.ValueKind == JsonValueKind.Array
                    && a.EnumerateArray().Any(x => x.ValueKind == JsonValueKind.String && x.GetString() == value);
                return r.ValueKind == JsonValueKind.Object && changesetId != null && guid != null && Lists("changeset_ids", changesetId) && Lists("proposal_guids", guid);
            }
            catch (Exception) { return false; }
        }

        /// <summary>The source of the changeset that last stamped (e.g. "promote"), or null. Pure; never throws.</summary>
```

- [ ] **Step 4: See it pass.** From the repo root: `dotnet run --project tools/promote-check`
Expected: `716/716 checks pass` (21 new, under `MA-3b — the picker, the groups, and the result that waits on this PC (AI-2, AI-5)`). Then `dotnet run --project tools/session-check` → `47/47 checks pass` (it compiles `ChangesetClient.cs`) and `dotnet run --project tools/artefact-cache-check` → `55/55 checks pass` (it compiles `ArtefactCache.cs`).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/Engine/UnreportedResults.cs SentinelAddin/Engine/ArtefactCache.cs SentinelAddin/GhostBuilder/StoreyBatch.cs SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/Engine/ProvenanceStamp.cs tools/promote-check/Ma3bDesk.cs tools/promote-check/Check.cs tools/promote-check/promote-check.csproj tools/promote-check/Ma3aReview.cs
git commit -m "feat(addin): MA-3b - pure: the picker's entries and lines (a Promote storey as one, age, source, verdict counts, web declines), the window's groups (the desk's whatOf), the ledger line, the applied-unreported record on this PC and the stamp check before a retry, a result the bridge already took told from a refusal, a timeout said, a lock on StoreyBatch's mixed set (promote-check 42; review C1, C3, C6, M1, M2, M4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3 — Revit: the picker, the window that stays open, the review that does not wait

**Files:**
- Create `SentinelAddin/UI/ChangesetPickerWindow.cs`
- Replace `SentinelAddin/UI/ChangesetReviewWindow.cs`, `SentinelAddin/Commands.ReviewChangesets.cs`
- Modify `tools/promote-check/Ma3bDesk.cs` (§43), `tools/promote-check/Check.cs`, `tools/promote-check/Ma2dWiring.cs` (§39), `tools/promote-check/Ma3aReview.cs` (§41), `tools/promote-check/PlacementBlock.cs` (MA-1a's scan of NotRun's words — review C3)

**Interfaces:**
- Consumes: everything Task 2 produces; `App.Events.Enqueue(Document, string, Action<UIApplication, Document>, Action<string>)` (XC-1's DocPin), `DialogOwner.Attach(Window, UIApplication)`, `Publisher.CentralPath(doc)`, `ProvenanceStamp.Read(Element)`, `ProvenanceStamp.Now()`, `UndoWatcher.Remember`, `GovernedNotify.Report(…, Dispatcher ui)`, MA-3a's `ChangesetTrust.DeclinedTicked`/`LateDeclines`.
- Produces:
  - `ChangesetPickerWindow(string key)`: `event Action<List<ChangesetDto>> Chosen`; `SetEntries(List<(string Line, string Blocked, List<ChangesetDto> Entry)>, string status)` (any thread).
  - `ChangesetReviewWindow`: `event Action RetryRequested`; `Say(string)`, `Refused(string)`, `Applying(string)`, `Retry(bool)`, `Reopen(string)` (C3, M3), `Lock(IEnumerable<string>)` (C3) (any thread); `bool Gone` (C2); `DecideRequested` unchanged in type (never raised for Decline all without a reason — M2); the window never closes itself.
  - `ReviewChangesetsCommand.Open(UIApplication, Document, BcfConfig, string, IReadOnlyList<ChangesetDto>)`, and `Open(ExternalCommandData, …)` kept for Promote; `Retry(Document, BcfConfig, List<UnreportedResults.Record>) → Task<Reported>`, `ReportAll(BcfConfig, List<UnreportedResults.Record>, Reported = null) → Task<Reported>`; `Report(…)` unchanged (Ghost Builder's).

- [ ] **Step 1: The failing scans.** In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           "…as the executor writes it (ProvenanceStamp.Json)");
    }
}
```

with:

```csharp
           "…as the executor writes it (ProvenanceStamp.Json)");
    }

    // ── 43. MA-3b: the review does not wait and does not lose a report (source scans — Revit-bound; drill MA3b runs them) ──────────
    static void Ma3bWiringChecks()
    {
        Console.WriteLine("\nMA-3b — the review does not wait and does not lose a report (source scans)");
        string review = Src("Commands.ReviewChangesets.cs"), window = Src("UI", "ChangesetReviewWindow.cs");
        string picker = File.Exists(Repo("SentinelAddin", "UI", "ChangesetPickerWindow.cs")) ? Src("UI", "ChangesetPickerWindow.cs") : ""; // new in MA-3b
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        Ok(!review.Contains("GetAwaiter().GetResult()") && !review.Contains(".Wait(") && review.Contains("window.DecideRequested += (ticked, unticked, note) => Task.Run(() => Decide(ticked, unticked, note));")
           && At(review, "var f = ChangesetClient.FetchOne(cfg, key, one.Id, out var oneErr);") > At(review, "async Task Decide(")
           && review.Contains("await Task.Run(() => PromoteContext.Fetch(key))") && review.Contains("await Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false))"),
           "AI-2: Apply's re-check, the role, the DD IDS and the guideline are read on a pool thread — the review never waits on Revit's thread");
        int reportAll = At(review, "internal static Task<Reported> ReportAll("), pool = reportAll < 0 ? -1 : review.IndexOf("return Task.Run(() =>", reportAll, StringComparison.Ordinal);
        Ok(reportAll > 0 && pool > reportAll && At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err);") > pool
           && Count(review, "ReportAll(cfg, ") == 4 && !review.Contains("if (!Report(") && !review.Contains("if (Report("),
           "AI-2: every report of the review — applied, declined, rolled back, sent again — goes through ReportAll on a pool thread; Report's retry dialog is Ghost Builder's alone");
        int write = At(review, "!UnreportedResults.Write(r)"), send = At(review, "Send(ReportAll(cfg, records), rep =>");
        Ok(write > At(review, "onDone = result =>") && send > write && review.Contains("UnreportedResults.Delete(r.Key, r.ChangesetId);")
           && At(review, "foreach (var tx in r.Undo) UndoWatcher.Remember(tx, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid));") > At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key"),
           "AI-2: the result is written on this PC before its report is sent, deleted when the bridge takes it, and only then remembered for the undo watcher");
        int open = At(review, "internal static bool Open(UIApplication ui,"), refuse = At(review, "if (waiting.Count > 0) { TaskDialog.Show(Title, UnreportedResults.Blocked(waiting)); return false; }");
        Ok(open > 0 && refuse > open && refuse < At(review, "var window = new ChangesetReviewWindow(cs, reach);")
           && review.Contains("Open(c.Application, doc, cfg, key, batch)") && review.Contains("StoreyBatch.Entries(pending).Select(e => (StoreyBatch.Line(e, DateTime.UtcNow), Waiting(key, e), e))"),
           "AI-2: a changeset whose result waits on this PC is never opened for review again — by the picker (listed, not openable) or by Promote (Open refuses it)");
        Ok(review.Contains("ProvenanceStamp.Holds(ProvenanceStamp.Read(e), r.ChangesetId, a.ProposalGuid)") && review.Contains("var (report, drop, words) = UnreportedResults.Verified(r, found);")
           && review.Contains("var mine = waiting.Where(r => string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)).ToList();") && review.Contains("Load(picker, cfg, key, Retry(doc, cfg, mine),") // review C4
           && !review.Contains("r.Doc == here") && !review.Contains("r.Doc != here")
           && review.Contains("App.Events.Enqueue(doc, \"check the model before reporting\", (_, d) => Send(Retry(d, cfg, again),"),
           "AI-2: a waiting result is sent again only after the model's stamps are read on the API thread (claimed vs verified) — at the next Review AI Proposals and by Retry report; the model's path is compared without case (review C4)");
        Ok(!review.Contains("_reviewOpen") && Count(review, "Hold();") == 3 && Count(review, "Release();") == 3 && review.Contains("finally { Release(); }")
           && review.Contains("picker.Closed += (_, _) => Release();") && review.Contains("window.Closed += (_, _) => Release();"),
           "AI-2: the one-review guard is held while the picker or the window is open and while a report is in flight — not released when the window closes with a report still out");
        Ok(At(review, "if (string.IsNullOrWhiteSpace(note))") > 0 && At(review, "if (string.IsNullOrWhiteSpace(note))") < At(review, "window.Applying(\"Declining — reporting to the bridge…\");")
           && review.Contains("window.Refused(ChangesetTrust.DeclineNeedsReason);")
           && review.Contains("rep.Words.Add(taken ?? $\"\\\"{r.Name}\\\": reported ({ChangesetTrust.LedgerOf(reply)}).\""),
           "AI-5: Decline all needs a reason (the note), and every report says the ledger row the bridge named");
        Ok(!window.Contains("Close();") && window.Contains("public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; });")
           && window.Contains("public void Applying(string words) => Ui(() => { _applied = true; _go.IsEnabled = false; Say(words); });")
           && window.Contains("if (Dispatcher.CheckAccess()) a();"),
           "the window stays open: a refusal keeps the ticks and the note and Apply comes back; once Apply ran it never comes back; its words arrive from any thread");
        Ok(window.Contains("GroupBy(ChangesetTrust.GroupOf)") && window.Contains("foreach (var b in boxes.Where(x => x.IsEnabled)) b.IsChecked = true;")
           && window.Contains("$\"{what} ({boxes.Count}) · {boxes.Count(b => b.IsChecked == true)} ticked\"")
           && window.Contains("_go.Content = n == 0 ? \"Decline all (needs a reason)\" : $\"Apply {n} ticked in Revit\";"),
           "the rows are grouped by what they do, with Tick group (never a declined row) and Untick group, each header counting its ticks");
        Ok(picker.Contains("Tag = blocked == null ? entry : null") && picker.Contains("if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetEntries(entries, status))); return; }")
           && !review.Contains("reviewing the oldest first"),
           "AI-5: the picker lists every entry and opens none whose result waits on this PC; the 'oldest first' modal is gone");
        Ok(review.Contains("? UnreportedResults.AlreadyTaken(r, ChangesetClient.FetchOne(cfg, r.Key, r.ChangesetId, out _)) : null;") && review.Contains("if (landed || taken != null)")
           && review.Contains("if (stalled) { rep.Left.Add(r); rep.Words.Add($\"\\\"{r.Name}\\\": {UnreportedResults.NotSent(r.Applied.Count)}\"); continue; }")
           && review.Contains("else { rep.Left.Add(r); stalled = true; }"),
           "review C1, C6: a 409 on a result the bridge already holds is landed and watched for Undo, never 'refused'; after the first report of a round that did not land, the rest wait for Retry report (one 120 s wait, not n)");
        int gone = At(review, "if (window.Gone) { App.PanelVm?.LogDoctor(\"Review AI Proposals: the window was closed before Apply ran — nothing was placed.\"); return; }");
        Ok(gone > At(review, "async Task Decide(") && gone < At(review, "window.Applying(\"Applying in Revit…\");") && window.Contains("Closed += (_, _) => _gone = true;")
           && review.Contains("App.Events.Enqueue(doc, \"say the review's result\", (_, _) => TaskDialog.Show(Title, words), _ => { });") && Count(review, "window.Say(") == 3
           && review.Contains("if (raised == ExternalEventRequest.Denied || raised == ExternalEventRequest.TimedOut)") && Count(review, "handler.Completed -= onDone;") == 3,
           "review C2, M3: a window closed before Apply places nothing; words for a closed window go to the Doctor log and a dialog, never lost; a request Revit did not take (or one that threw) gives Apply back, said");
        Ok(window.Contains("public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Say(words); });") && window.Contains("public void Lock(IEnumerable<string> guids)")
           && At(review, "window.Lock(") > At(review, "if (ChangesetTrust.DeclinedTicked(fresh, ticked) is { } declinedTicked)") && At(review, "window.Lock(") < At(review, "window.Refused(declinedTicked);")
           && review.Contains("else window.Reopen(result.Error + ") && !review.Contains("— run Review AI Proposals again.")
           && window.Contains("foreach (var r in _rows.Where(x => x.Box.IsEnabled)) r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El);"),
           "review C3: a 'Go back' (nothing placed) gives Apply back; a decline that landed after the window opened is unticked and locked here (Tick suggested never re-ticks it); no words send the person to a second Review while this window holds the guard");
        int early = At(window, "if (ticked.Count == 0 && string.IsNullOrWhiteSpace(_note.Text)) { Say(ChangesetTrust.DeclineNeedsReason); return; }");
        int status = At(review, "if (mine.Count > 0) picker.SetEntries(");
        Ok(early > 0 && early < At(window, "DecideRequested?.Invoke(") && status > 0 && status < At(review, "Load(picker, cfg, key, Retry(doc, cfg, mine),"),
           "review M2, C7: Decline all without a reason is refused by the window at once (no bridge call); the picker says it is checking and sending this model's waiting results before it lists");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3bDeskChecks();
```

with:

```csharp
        Ma3bDeskChecks();
        Ma3bWiringChecks();
```

In `tools/promote-check/Ma2dWiring.cs` (§39 — the review's literal scans are rewritten with the review), replace:

```csharp
        Ok(review.Contains("var cs = StoreyBatch.Merge(batch);") && review.Contains("foreach (var one in batch)") && review.Contains("var batch = StoreyBatch.Of(pending, pending[0]);")
```

with:

```csharp
        // MA-3b (AI-5): the picker lists every entry (StoreyBatch.Entries — a storey as one) instead of opening the oldest.
        Ok(review.Contains("var cs = StoreyBatch.Merge(batch);") && review.Contains("foreach (var one in batch)") && review.Contains("StoreyBatch.Entries(pending)")
```

replace:

```csharp
        int reported = At(review, "if (!Report(cfg, key, one.Id, res.Applied, rejected, said, one.ReviewRev)) continue;"); // MA-3a: with the revision Apply re-checked
        Ok(review.Contains("foreach (var (one, res) in result.Each)") && reported > 0 && At(review, "UndoWatcher.Remember(undo, key, one.Id, guids);") > reported
           && review.Contains("UndoWatcher.Remember(UndoWatcher.TxName(one.Name, one.Id), key, one.Id, guids);")
           // Review C15: the LOD state after names only the changesets the bridge holds as applied; the dialog counts the rejected rows it took.
           && At(review, "if (res.Applied.Count > 0) held.Add(one.Id);") > reported && review.Contains("CommandReports.LodState(lod, held, UserSession.Actor)")
```

with:

```csharp
        // MA-3b (AI-2): each result is built on the API thread with the revision Apply re-checked (MA-3a) and the Undo names, and reported
        // by ReportAll on a pool thread; the undo watcher remembers it only once the bridge took it.
        int reported = At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err);");
        Ok(review.Contains("foreach (var (one, res) in result.Each)") && reported > 0
           && At(review, "foreach (var tx in r.Undo) UndoWatcher.Remember(tx, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid));") > reported
           && review.Contains("new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }")
           // Review C15: the LOD state after names only the changesets the bridge holds as applied; the words count the rejected rows it took.
           && review.Contains("var held = rep.Landed.Where(x => x.R.Applied.Count > 0).Select(x => x.R.ChangesetId).ToList();") && review.Contains("CommandReports.LodState(lod, held, UserSession.Actor)")
```

replace:

```csharp
        Ok(review.Contains("if (Report(cfg, key, f.Id, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),")
           // Review C14: the rolled-back storey's declines are counted from what the bridge took, as C6's are.
           && Count(review, ")) declined++;") == 2 && review.Contains("Reported as declined: {declined} of {fresh.Count} changeset(s)")
```

with:

```csharp
        Ok(review.Contains("ResultOf(key, f, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),")
           // Review C14: the rolled-back storey's declines are counted from what the bridge took, as C6's are (MA-3b: the reports that landed).
           && Count(review, "int declined = rep.Landed.Count;") == 2 && review.Contains("Reported as declined: {declined} of {fresh.Count} changeset(s)")
```

and replace:

```csharp
           && review.Contains("if (Report(cfg, key, f.Id, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note)) declined++;")
```

with:

```csharp
           && review.Contains("ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null)")
```

In `tools/promote-check/Ma3aReview.cs` (§41), replace:

```csharp
        Ok(review.Contains("if (!Report(cfg, key, one.Id, res.Applied, rejected, said, one.ReviewRev)) continue;")
```

with:

```csharp
        Ok(review.Contains("records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }));") // MA-3b: sent by ReportAll
```

In `tools/promote-check/PlacementBlock.cs` (review amendment C3: a "Go back" now gives Apply back in the window that stays open — the words never send the person to another model or to a second Review), replace:

```csharp
        Ok(Src("Commands.ReviewChangesets.cs").Contains("The proposals are still pending — run Review AI Proposals again.\"")
```

with:

```csharp
        Ok(Src("Commands.ReviewChangesets.cs").Contains("Nothing was placed; the proposals are still pending — change the ticks or press Apply again.\"")
```

- [ ] **Step 2: See them fail.** From the repo root: `dotnet run --project tools/promote-check`
Expected: `711/730 checks pass` — FAIL on §39's three rewritten scans ("Review AI Proposals and Promote open a Promote storey's changesets in one window …", "each changeset of the storey is reported on its own ledger row …", "a storey that fails or is unticked whole is declined whole …"), §41's ("the result carries the review_rev Apply re-checked …"), MA-1a's ("a refusal in Review AI Proposals does not send the person to another model …") and all fourteen of §43.

- [ ] **Step 3: The picker.** Create `SentinelAddin/UI/ChangesetPickerWindow.cs`:

```csharp
#nullable disable
// MA-3b (AI-5): every changeset waiting for review on a project, oldest first — a Promote storey as one entry — each with its age, its
// source, its ghosts by the referee's verdict and the web's declines (StoreyBatch.Line). It opens at once ("Loading…"); the list arrives
// from a pool thread (SetEntries marshals itself). An entry whose result waits on this PC (UnreportedResults) is listed with the reason
// and cannot be opened. Review (or a double-click) hands the entry to ReviewChangesetsCommand. Modeless, code-only WPF.
using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

public sealed class ChangesetPickerWindow : Window
{
    public event Action<List<ChangesetDto>> Chosen;

    private readonly TextBox _status = new()
    {
        Text = "Loading…", IsReadOnly = true, TextWrapping = TextWrapping.Wrap, MaxHeight = 160, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
    };
    private readonly ListBox _list = new() { Margin = new Thickness(0, 8, 0, 8) };
    private readonly Button _open = new() { Content = "Review", Padding = new Thickness(12, 4, 12, 4), FontWeight = FontWeights.Bold, IsEnabled = false };

    public ChangesetPickerWindow(string key)
    {
        Title = $"Sentinel — AI proposals waiting: {key}";
        Width = 720; Height = 420; WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var root = new DockPanel { Margin = new Thickness(10) };
        DockPanel.SetDock(_status, Dock.Top);
        root.Children.Add(_status);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(_open);
        DockPanel.SetDock(buttons, Dock.Bottom);
        root.Children.Add(buttons);
        ScrollViewer.SetHorizontalScrollBarVisibility(_list, ScrollBarVisibility.Disabled);
        root.Children.Add(_list);
        Content = root;
        _list.SelectionChanged += (_, _) => _open.IsEnabled = (_list.SelectedItem as ListBoxItem)?.Tag is List<ChangesetDto>;
        _open.Click += (_, _) => Choose();
        _list.MouseDoubleClick += (_, _) => Choose();
    }

    private void Choose()
    {
        if ((_list.SelectedItem as ListBoxItem)?.Tag is List<ChangesetDto> entry) Chosen?.Invoke(entry);
    }

    /// <summary>The entries — each one's line, why it cannot be opened (null when it can) and its changesets — and the status. Any thread.</summary>
    public void SetEntries(List<(string Line, string Blocked, List<ChangesetDto> Entry)> entries, string status)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetEntries(entries, status))); return; }
        _status.Text = status ?? "";
        _list.Items.Clear();
        foreach (var (line, blocked, entry) in entries)
        {
            var text = new TextBlock { Text = blocked == null ? line : line + "\n⚠ " + blocked, TextWrapping = TextWrapping.Wrap };
            if (blocked != null) text.Foreground = Brushes.DarkOrange;
            _list.Items.Add(new ListBoxItem { Content = text, Tag = blocked == null ? entry : null, Padding = new Thickness(4, 3, 4, 3) });
        }
        _open.IsEnabled = false;
    }
}
```

- [ ] **Step 4: The window.** Replace the whole of `SentinelAddin/UI/ChangesetReviewWindow.cs` with (the rows' text, badges, tooltips and MA-3a's decline lines are as before — only moved into the group loop):

```csharp
#nullable disable
// Governed AI modeling (A2): the human gate. One row per proposed element with the REFEREE'S
// verdict — pre-ticked only when the IDS accepted a create, or (MA-0) when it is a Promote retype/attach: a single-answer
// op (§3.4 step 7) whose ghost carries no property sets, so its IDS verdict certifies nothing (the badge still shows
// it; Promote v1 door swaps too, since the founder confirmed DR-1 on 2026-10-01). A human may tick a rejected row (overrule, with the failures on screen — the result records that they did);
// recorded rows say honestly that no spec adjudicated them. The elements the planner sent to a person are listed above
// the rows and cannot be ticked. Modeless, code-only WPF, in GhostReviewWindow's visual family.
// MA-1: a create row names family : type, level and the numbers a reviewer checks.
// MA-3b (AI-2, AI-5): the rows are grouped by what they do, in the web desk's words ("retype wall (28) · 28 ticked"), each group with
// Tick group / Untick group. The window stays open: a refusal keeps the ticks and the note, the status line says what happened and then
// what the bridge took ("reported (ledger #n)"), and Retry report appears while a report has not landed. Apply is pressed once; nothing
// ticked is Decline all, which needs a reason (the note).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

public sealed class ChangesetReviewWindow : Window
{
    public event Action<List<string>, List<string>, string> DecideRequested;
    /// <summary>MA-3b: "Retry report" — the results the bridge has not taken yet.</summary>
    public event Action RetryRequested;

    private readonly List<(CheckBox Box, ChangesetElementDto El)> _rows = new();
    private readonly TextBox _note = new() { MinHeight = 40, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
    private readonly TextBox _status = new()
    {
        IsReadOnly = true, TextWrapping = TextWrapping.Wrap, MaxHeight = 180, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
        Visibility = Visibility.Collapsed, Margin = new Thickness(0, 8, 0, 0),
    };
    private readonly Button _go = new() { Padding = new Thickness(12, 4, 12, 4), FontWeight = FontWeights.Bold };
    private readonly Button _retry = new() { Content = "Retry report", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0), Visibility = Visibility.Collapsed };
    private readonly List<Action> _headers = new();
    private readonly ChangesetDto _cs;
    private bool _applied; // MA-3b: once Apply was raised, never again from this window — a second Apply could place it twice
    private volatile bool _gone;
    /// <summary>MA-3b review C2: the person closed the window — read from any thread; nothing is raised after it, and words go elsewhere.</summary>
    public bool Gone => _gone;

    /// <param name="reach">Review amendment C3 (MA-2c): for each set_parameter's proposal_guid, the elements on its type in the model
    /// now — counted by the caller on the API thread; shown on the row, never read from the reason.</param>
    public ChangesetReviewWindow(ChangesetDto changeset, IReadOnlyDictionary<string, int> reach = null)
    {
        _cs = changeset;
        Closed += (_, _) => _gone = true;
        Title = $"Sentinel — Review AI proposal: {_cs.Name}";
        Width = 640; Height = 560; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };

        // Header: what this is, who proposed it, what the referee said.
        var head = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
        head.Children.Add(new TextBlock { Text = _cs.Name, FontSize = 15, FontWeight = FontWeights.Bold });
        head.Children.Add(new TextBlock
        {
            Text = $"Proposed by {ChangesetTrust.SourceLabel(_cs)} · adjudication: {_cs.Adjudication?.Verdict ?? "?"} (spec: {_cs.Adjudication?.IdsSource ?? "?"})",
            Foreground = Brushes.Gray, Margin = new Thickness(0, 2, 0, 0),
        });
        var unattributed = _cs.Adjudication?.Unattributed?.Count ?? 0;
        if (unattributed > 0)
            head.Children.Add(new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(0x5c, 0x45, 0x00)),
                CornerRadius = new CornerRadius(3), Padding = new Thickness(6, 3, 6, 3), Margin = new Thickness(0, 6, 0, 0),
                Child = new TextBlock
                {
                    Text = $"⚠ {unattributed} failure(s) could not be attributed to a specific element — clean rows are NOT certified.",
                    Foreground = Brushes.Khaki, TextWrapping = TextWrapping.Wrap,
                },
            });
        // MA-3a: the web desk's declines, said once above the rows.
        if (ChangesetTrust.DeclinedHeader(_cs) is string declinedLine)
            head.Children.Add(new TextBlock { Text = "⚠ " + declinedLine, Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);

        // The elements sent to a person (Promote's exceptions): shown with their reason, never tickable.
        var held = _cs.Exceptions ?? new List<ExceptionRowDto>();
        if (held.Count > 0)
        {
            var heldList = new StackPanel();
            foreach (var x in held)
            {
                var row = new DockPanel { Margin = new Thickness(0, 2, 0, 2) };
                var box = new CheckBox { IsChecked = false, IsEnabled = false, VerticalAlignment = VerticalAlignment.Center };
                DockPanel.SetDock(box, Dock.Left);
                row.Children.Add(box);
                row.Children.Add(new TextBlock
                {
                    Text = $"{x.Name ?? x.UniqueId} — {x.Reason}", Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(8, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, ToolTip = x.UniqueId,
                });
                heldList.Children.Add(row);
            }
            var exp = new Expander
            {
                Header = $"Sent to a person ({held.Select(x => x.UniqueId).Distinct().Count()} element(s))", IsExpanded = true, Margin = new Thickness(0, 0, 0, 8),
                Content = new ScrollViewer { Content = heldList, MaxHeight = 140, VerticalScrollBarVisibility = ScrollBarVisibility.Auto },
            };
            DockPanel.SetDock(exp, Dock.Top);
            root.Children.Add(exp);
        }

        // Footer: reviewer note + actions. (Top/bottom docked before the fill so the list scrolls.)
        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        foot.Children.Add(new TextBlock { Text = "Reviewer note (recorded with the result; Decline all needs one):", Foreground = Brushes.Gray });
        foot.Children.Add(_note);
        foot.Children.Add(_status);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 8, 0, 0) };
        var all = new Button { Content = "Tick suggested", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var none = new Button { Content = "Untick all", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        // Review C3: a row locked here (a late web decline) is never re-ticked.
        all.Click += (_, _) => { foreach (var r in _rows.Where(x => x.Box.IsEnabled)) r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El); };
        none.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = false; };
        // Re-entrancy guard: Decide disables Apply at once; it comes back only when nothing ran (Refused).
        _go.Click += (_, _) => Decide();
        _retry.Click += (_, _) => { _retry.IsEnabled = false; RetryRequested?.Invoke(); };
        buttons.Children.Add(_retry); buttons.Children.Add(all); buttons.Children.Add(none); buttons.Children.Add(_go);
        foot.Children.Add(buttons);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        // Rows. MA-3b: one group per what the ghosts do, in the order they come (the web desk's groupDesk; the storey is the picker's).
        var list = new StackPanel();
        foreach (var group in (_cs.Elements ?? new List<ChangesetElementDto>()).GroupBy(ChangesetTrust.GroupOf))
        {
            var boxes = new List<CheckBox>();
            var groupRows = new StackPanel();
            foreach (var el in group)
            {
                var row = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
                var box = new CheckBox
                {
                    VerticalAlignment = VerticalAlignment.Center,
                    IsChecked = ChangesetTrust.PreTick(_cs, el), // MA-1a item 8: the bridge's pre-tick — never a create
                };
                // MA-3a (design §6.6, D17): a web decline binds — the row opens unticked (PreTick) and cannot be ticked here; a lead re-opens it
                // on the web desk. Apply re-checks the fresh copy (ReviewChangesetsCommand).
                box.IsEnabled = !ChangesetTrust.DeclinedOnWeb(el);
                _rows.Add((box, el));
                boxes.Add(box);
                box.Checked += (_, _) => Counted();
                box.Unchecked += (_, _) => Counted();
                DockPanel.SetDock(box, Dock.Left);
                row.Children.Add(box);

                var badge = MakeBadge(el.Verdict);
                DockPanel.SetDock(badge, Dock.Right);
                row.Children.Add(badge);

                var label = new TextBlock { Margin = new Thickness(8, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var type = el.Place?.TypeName;
                label.Text = el.Op switch
                {
                    "retype" => $"retype {el.Kind}: {name}  ·  {el.Target?.TypeBefore ?? "?"} → {(el.Place?.FamilyName != null ? el.Place.FamilyName + " : " : "")}{type}",
                    "attach" => $"attach: {name}  ·  {el.Place?.BaseLevel} → top {el.Place?.TopLevel}",
                    // MA-2c: a TYPE edit — never pre-ticked. Review amendment C3: its reach is the add-in's own count (Open, API thread),
                    // before the parameter so the ellipsis never trims it; the reason (the tooltip) is the poster's words.
                    "set_parameter" => $"type edit {el.Kind}: {(el.Place?.FamilyName != null ? el.Place.FamilyName + " : " : "")}{type}  ·  " +
                                       (reach != null && el.ProposalGuid != null && reach.TryGetValue(el.ProposalGuid, out var reachN) ? $"reaches {reachN} element(s) in the model now" : "reach not counted — the type is not in this model") +
                                       (ChangesetTrust.RetypedOnto(_cs, el) is int more && more > 0 ? $" + {more} if this {((_cs.Name ?? "").EndsWith(", one Undo)", StringComparison.Ordinal) ? "storey" : "changeset")}'s retypes onto it are applied" : "") + // review C21; MA-2d C11: a storey's window (StoreyBatch.Merge) counts every part
                                       $"  ·  {el.Parameter} \"{el.From}\" → \"{el.To}\"  ·  from {el.ValueSource?.Ref ?? el.ValueSource?.Kind ?? "an unnamed source"}",
                    _ => CreateLabel(el, name),
                };
                if (ChangesetTrust.Accuracy(el) is string accuracy) label.Text += "  ·  " + accuracy; // MA-1a item 8: "not measured"
                if (ChangesetTrust.Typing(el) is string typing) label.Text += "  ·  " + typing; // MA-2a: the bridge typed it from posted facts
                if (!string.IsNullOrWhiteSpace(el.Reason)) label.ToolTip = el.Reason;
                // MA-3a: the web desk's decision leads the row (the ellipsis never trims it) and is the tooltip's first line.
                if (ChangesetTrust.ReviewLine(el) is string reviewLine)
                {
                    label.Text = reviewLine + "  ·  " + label.Text;
                    label.ToolTip = reviewLine + (string.IsNullOrWhiteSpace(el.Reason) ? "" : "\n" + el.Reason);
                    if (!box.IsEnabled) label.Foreground = Brushes.Orange;
                }
                row.Children.Add(label);
                groupRows.Children.Add(row);
            }
            var tick = new Button { Content = "Tick group", Padding = new Thickness(8, 2, 8, 2), Margin = new Thickness(0, 0, 6, 4) };
            var untick = new Button { Content = "Untick group", Padding = new Thickness(8, 2, 8, 2), Margin = new Thickness(0, 0, 0, 4) };
            // A declined row stays unticked (its box is disabled): Tick group ticks only what may be ticked.
            tick.Click += (_, _) => { foreach (var b in boxes.Where(x => x.IsEnabled)) b.IsChecked = true; };
            untick.Click += (_, _) => { foreach (var b in boxes) b.IsChecked = false; };
            var bar = new StackPanel { Orientation = Orientation.Horizontal };
            bar.Children.Add(tick); bar.Children.Add(untick);
            var body = new StackPanel();
            body.Children.Add(bar); body.Children.Add(groupRows);
            var groupBox = new Expander { IsExpanded = true, Content = body, Margin = new Thickness(0, 0, 0, 6) };
            string what = group.Key;
            int declinedHere = group.Count(ChangesetTrust.DeclinedOnWeb);
            _headers.Add(() => groupBox.Header = $"{what} ({boxes.Count}) · {boxes.Count(b => b.IsChecked == true)} ticked" + (declinedHere > 0 ? $" · {declinedHere} declined on the web" : ""));
            list.Children.Add(groupBox);
        }
        root.Children.Add(new ScrollViewer { Content = list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
        Counted();
    }

    // MA-3b: each group's header and the main button say what is ticked; nothing ticked is Decline all (it needs a reason: the note).
    private void Counted()
    {
        foreach (var h in _headers) h();
        int n = _rows.Count(r => r.Box.IsChecked == true);
        _go.Content = n == 0 ? "Decline all (needs a reason)" : $"Apply {n} ticked in Revit";
    }

    /// <summary>A create row (MA-1): kind and name, then family : type, level, and the numbers a reviewer checks. Rows of the
    /// four v1 kinds read exactly as before.</summary>
    private static string CreateLabel(ChangesetElementDto el, string name)
    {
        var p = el.Place;
        var parts = new List<string> { $"{el.Kind}: {name}" };
        if (p?.TypeName != null) parts.Add((p.FamilyName != null ? p.FamilyName + " : " : "") + p.TypeName);
        if (p?.LevelName != null) parts.Add(p.LevelName);
        if (p?.SillHeight is double s) parts.Add($"sill {Mm(s)} mm");
        if (p?.Offset is double o) parts.Add($"offset {Mm(o)} mm");
        if (p?.BaseOffset is double b) parts.Add($"base offset {Mm(b)} mm");
        if (p?.Structural == true) parts.Add("structural");
        if (p?.Mark != null && p.Mark != name) parts.Add("Mark " + p.Mark);
        return string.Join("  ·  ", parts);
    }

    private static string Mm(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);

    // What is ticked when the window opens (and by "Tick suggested") is the bridge's decision since MA-1a item 8:
    // ChangesetTrust.PreTick (Coordination/ChangesetClient.cs). A create is never pre-ticked; a person still clicks Apply.

    private static UIElement MakeBadge(ElementVerdictDto v)
    {
        var status = v?.Status ?? "recorded";
        var (text, fg, tip) = status switch
        {
            "accepted" => ("✓ accepted", Brushes.LightGreen, "Passed the project's IDS adjudication."),
            "rejected" => ($"✗ rejected ({v.Failures?.Count ?? 0})", Brushes.IndianRed,
                string.Join("\n", (v.Failures ?? new List<JsonElement>()).Take(10).Select(FailureText))),
            "recorded" => ("— recorded", Brushes.Gray, "No spec to adjudicate against — nothing was certified for this element."),
            // A status outside the contract is a bridge-contract break — say so, don't dress it as recorded.
            _ => ($"? {status}", Brushes.Orange, "Unrecognised verdict status — treat as NOT certified."),
        };
        var tb = new TextBlock { Text = text, Foreground = fg, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
        tb.ToolTip = tip;
        return tb;
    }

    /** A failure as a reviewer reads it: "specification: requirement — reason", not raw JSON. */
    private static string FailureText(JsonElement f)
    {
        try
        {
            string Prop(string name) => f.ValueKind == JsonValueKind.Object && f.TryGetProperty(name, out var p) ? p.ToString() : null;
            var spec = Prop("specification");
            var req = Prop("requirement");
            var reason = Prop("reason");
            var parts = new[] { spec, req }.Where(s => !string.IsNullOrWhiteSpace(s));
            var head = string.Join(": ", parts);
            if (!string.IsNullOrWhiteSpace(reason)) head = string.IsNullOrWhiteSpace(head) ? reason : $"{head} — {reason}";
            return string.IsNullOrWhiteSpace(head) ? f.ToString() : head;
        }
        catch { return f.ToString(); }
    }

    // MA-3b: the window is never closed here — it stays until the person closes it, so a refusal keeps the ticks and the note.
    private void Decide()
    {
        var ticked = _rows.Where(r => r.Box.IsChecked == true).Select(r => r.El.ProposalGuid).ToList();
        var unticked = _rows.Where(r => r.Box.IsChecked != true).Select(r => r.El.ProposalGuid).ToList();
        // Review M2: Decline all without a reason is refused here at once — no bridge call; the command keeps the check as the backstop.
        if (ticked.Count == 0 && string.IsNullOrWhiteSpace(_note.Text)) { Say(ChangesetTrust.DeclineNeedsReason); return; }
        _go.IsEnabled = false;
        Say("Re-checking with the bridge…");
        DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? "");
    }

    /// <summary>MA-3b: the status line; any thread. Apply stays as it is.</summary>
    public void Say(string words) => Ui(() =>
    {
        _status.Text = words ?? "";
        _status.Visibility = string.IsNullOrEmpty(words) ? Visibility.Collapsed : Visibility.Visible;
        _status.ScrollToHome();
    });

    /// <summary>MA-3b: nothing ran — said; the ticks and the note are kept and Apply can be pressed again. Any thread.</summary>
    public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; });

    /// <summary>MA-3b: the placement (or the decline) was started — Apply never comes back in this window. Any thread.</summary>
    public void Applying(string words) => Ui(() => { _applied = true; _go.IsEnabled = false; Say(words); });

    /// <summary>Review C3, M3: nothing was placed after all (a "Go back", a refusal inside the placement, a request Revit did not take) —
    /// Apply comes back with the ticks and the note. Any thread.</summary>
    public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Say(words); });

    /// <summary>Review C3: rows declined on the web after the window opened — unticked and locked, as the rows declined before it opened. Any thread.</summary>
    public void Lock(IEnumerable<string> guids)
    {
        var set = new HashSet<string>(guids ?? Enumerable.Empty<string>(), StringComparer.Ordinal);
        Ui(() => { foreach (var r in _rows.Where(x => x.El.ProposalGuid != null && set.Contains(x.El.ProposalGuid))) { r.Box.IsChecked = false; r.Box.IsEnabled = false; } });
    }

    /// <summary>MA-3b: whether "Retry report" is offered. Any thread.</summary>
    public void Retry(bool offered) => Ui(() => { _retry.Visibility = offered ? Visibility.Visible : Visibility.Collapsed; _retry.IsEnabled = offered; });

    private void Ui(Action a)
    {
        if (Dispatcher.CheckAccess()) a();
        else Dispatcher.BeginInvoke(a);
    }
}
```

- [ ] **Step 5: The command.** Replace the whole of `SentinelAddin/Commands.ReviewChangesets.cs` with (`Report` at its end is unchanged — Ghost Builder's):

```csharp
#nullable disable
// Governed AI modeling (A2): the ribbon entry. MA-3b (AI-5): a picker of every changeset waiting for review (a Promote storey as one
// entry) opens at once; the chosen entry's review window stays open until its report lands. AI-2: nothing in the review waits for the
// bridge on Revit's thread — the re-check, the role, the standards and every report run on a pool thread, and the window says what
// happened. A result Revit applied is written on this PC (UnreportedResults) before its report is sent, and a changeset with such a
// record is never opened again until the bridge takes it: Review AI Proposals checks the model's stamps and reports it first. The
// bridge's recorded status is the truth — an unreported application is a lie by omission. Re-fetches the changeset right before
// executing: if an agent withdrew it meanwhile, nothing runs (the bridge's CAS makes the report side race-safe too). Open() is the
// review flow itself, shared with Promote walls (MA-0); a changeset whose result landed is remembered for the undo watcher.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

[Transaction(TransactionMode.Manual)]
public sealed class ReviewChangesetsCommand : IExternalCommand
{
    // MA-3b (AI-2): one review at a time — held while the picker or a review window is open, and while a report is in flight, so two
    // windows never apply one changeset and one result is never sent twice at once. Once it is released, a changeset Revit applied and
    // the bridge has not taken is kept closed by its record (UnreportedResults), never by this.
    private static int _holds;
    private static void Hold() => Interlocked.Increment(ref _holds);
    private static void Release() => Interlocked.Decrement(ref _holds);
    private const string Title = "Sentinel — AI proposals";
    private const string Busy = "A review window is open, or a result is still being reported to the bridge — finish or close the window, or wait for its report (two minutes at most), then run Review AI Proposals again.";
    // The roles POST /changesets/:key/:id/result accepts (changesets-store.mjs reportResult: contributor or above; the
    // machine credential reads as service).
    private static readonly string[] Reporters = { "service", "contributor", "lead", "owner" };
    // MA-2d (drill MA2c D2): after a Promote storey is declined, Promote reopens a Promote storey still waiting for review before it
    // plans again — said, so "re-run Promote" in the error does not surprise.
    internal const string RunPromoteAgain = "Run Promote (DD) again to plan this storey anew: it first opens any other Promote storey still waiting for review, and plans again once none is waiting.";
    // Review C2: MA-2c F11 puts a type edit on the first storey whose retypes land on its type, so a later storey of the same run
    // may retype onto it; when a storey carrying type edits is declined, those storeys fail the DD IDS until Promote plans again — said.
    internal static string CarriedEdits(IEnumerable<ChangesetDto> fresh)
    {
        var edits = fresh.SelectMany(f => f.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op == "set_parameter").ToList();
        return edits.Count == 0 ? "" :
            $"\n\nThis storey carried {edits.Count} type edit(s) ({string.Join(", ", edits.Select(e => e.Place?.TypeName ?? "?").Distinct())}). " +
            "Other storeys of the same run that retype onto those types will fail the DD IDS check for that property until Promote plans again — decline them (untick all ▸ Apply), then run Promote (DD).";
    }

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        if (Volatile.Read(ref _holds) > 0)
        {
            TaskDialog.Show(Title, Busy);
            return Result.Cancelled;
        }

        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show(Title, ProjectContext.NotBound);
            return Result.Cancelled;
        }
        var cfg = BcfConfig.Load();
        var key = ctx.Key;

        // MA-3b (AI-5): the picker opens at once and lists every pending entry; nothing here waits for the bridge. AI-2: first the
        // results this PC applied and the bridge has not taken — this model's are checked against its stamps here (the API thread) and
        // sent again off it; another model's are named, and their changesets stay closed.
        var here = DocOf(doc);
        var waiting = UnreportedResults.ForKey(key);
        // Review C4: a model's path is compared without case — Revit's casing depends on how the file was opened.
        var mine = waiting.Where(r => string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)).ToList();
        var away = waiting.Except(mine).ToList();
        var picker = new ChangesetPickerWindow(key);
        DialogOwner.Attach(picker, c);
        Hold();
        picker.Closed += (_, _) => Release();
        picker.Chosen += entry =>
        {
            picker.Close();
            App.Events.Enqueue(doc, "open the review", (ui, d) => Open(ui, d, cfg, key, entry));
        };
        picker.Show();
        // Review C7: said while this model's waiting results are checked and sent (one round waits up to 120 s for the bridge).
        if (mine.Count > 0) picker.SetEntries(new List<(string Line, string Blocked, List<ChangesetDto> Entry)>(),
            $"Checking this model and sending {mine.Count} result(s) it applied that the bridge has not taken (the bridge has up to two minutes to answer)…");
        Load(picker, cfg, key, Retry(doc, cfg, mine),
             away.Count == 0 ? null : $"{away.Count} result(s) applied in another model wait on this PC for the bridge — close this list, open that model and run Review AI Proposals there: " +
                                      string.Join("; ", away.Select(r => $"\"{r.Name}\" in {r.Doc}")));
        return Result.Succeeded;
    }

    // MA-3b (AI-5): the picker's list, read on a pool thread once the waiting results were sent again; the words of those first.
    private static void Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away) => Task.Run(async () =>
    {
        var none = new List<(string Line, string Blocked, List<ChangesetDto> Entry)>();
        try
        {
            var rep = await retried;
            var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
            var said = new List<string>();
            if (rep.Words.Count > 0) said.Add(rep.Text);
            if (away != null) said.Add(away);
            if (pending == null)
            {
                picker.SetEntries(none, string.Join("\n\n", new[] { $"Couldn't reach the bridge:\n{fetchErr}" }.Concat(said)));
                return;
            }
            var rows = StoreyBatch.Entries(pending).Select(e => (StoreyBatch.Line(e, DateTime.UtcNow), Waiting(key, e), e)).ToList();
            said.Insert(0, rows.Count == 0 ? $"No pending proposals for project \"{key}\"." : $"{rows.Count} waiting for review on \"{key}\", oldest first — pick one and press Review.");
            picker.SetEntries(rows, string.Join("\n\n", said));
        }
        catch (Exception ex) { picker.SetEntries(none, $"The list could not be read — {ex.GetType().Name}: {ex.Message}"); }
    });

    // AI-2: why an entry cannot be opened — a result of one of its changesets waits on this PC; null when none does.
    private static string Waiting(string key, IEnumerable<ChangesetDto> entry)
    {
        var w = entry.Select(c => UnreportedResults.Read(key, c.Id)).Where(r => r != null).ToList();
        return w.Count == 0 ? null : UnreportedResults.Blocked(w);
    }

    // AI-2: the model a result was applied in — the workshared central's path, else the file's, else its title (a model never saved).
    private static string DocOf(Document doc) => Publisher.CentralPath(doc) ?? (string.IsNullOrEmpty(doc.PathName) ? doc.Title : doc.PathName);

    private static UnreportedResults.Record ResultOf(string key, ChangesetDto cs, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, string doc, List<string> undo) =>
        new UnreportedResults.Record
        {
            Key = key, ChangesetId = cs.Id, Name = cs.Name, Doc = doc, Applied = applied, Rejected = rejected, Note = note, ReviewRev = reviewRev,
            Undo = undo ?? new List<string>(), At = ProvenanceStamp.Now(),
        };

    /// <summary>MA-3b (AI-2): what a round of reports did — one paragraph per result, the ones the bridge took (with its reply) and the ones
    /// left for Retry report.</summary>
    internal sealed class Reported
    {
        public readonly List<string> Words = new List<string>();
        public readonly List<UnreportedResults.Record> Left = new List<UnreportedResults.Record>();
        public readonly List<(UnreportedResults.Record R, string Reply)> Landed = new List<(UnreportedResults.Record R, string Reply)>();
        public string Text => string.Join("\n\n", Words);
    }

    /// <summary>MA-3b (AI-2): send results again that this PC holds for <paramref name="doc"/>. Each one is checked against the model's
    /// stamps first, here on the API thread (UnreportedResults.Verified: only what the model still holds is reported as applied); then
    /// they are sent off this thread.</summary>
    internal static Task<Reported> Retry(Document doc, BcfConfig cfg, List<UnreportedResults.Record> records)
    {
        var rep = new Reported();
        var send = new List<UnreportedResults.Record>();
        foreach (var r in records)
        {
            var found = r.Applied.Count(a => !string.IsNullOrEmpty(a.RevitUniqueId) && doc.GetElement(a.RevitUniqueId) is { } e
                                             && ProvenanceStamp.Holds(ProvenanceStamp.Read(e), r.ChangesetId, a.ProposalGuid));
            var (report, drop, words) = UnreportedResults.Verified(r, found);
            if (drop) UnreportedResults.Delete(r.Key, r.ChangesetId);
            if (report) send.Add(r);
            else
            {
                rep.Words.Add(words);
                if (!drop) rep.Left.Add(r);
            }
        }
        return ReportAll(cfg, send, rep);
    }

    /// <summary>MA-3b (AI-2): send each result on a pool thread — never waited for on Revit's. One the bridge takes loses its record and
    /// is remembered for the undo watcher; one it refuses for good (400, 404, 409) loses its record, said; any other failure keeps it.
    /// Review C1: a 409 on a result the bridge already holds (its reply was lost) is taken, not refused. Review C6: after the first
    /// failure that keeps its record, the rest of the round are not sent (kept, said) — one 120 s wait, never one per changeset.</summary>
    internal static Task<Reported> ReportAll(BcfConfig cfg, List<UnreportedResults.Record> records, Reported rep = null)
    {
        rep ??= new Reported();
        if (records.Count == 0) return Task.FromResult(rep);
        Hold();
        return Task.Run(() =>
        {
            try
            {
                var stalled = false;
                foreach (var r in records)
                {
                    if (stalled) { rep.Left.Add(r); rep.Words.Add($"\"{r.Name}\": {UnreportedResults.NotSent(r.Applied.Count)}"); continue; }
                    var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err);
                    // Review C1: the bridge writes the doc before its audit row, and a reply can be lost — a 409 whose stored result applied
                    // exactly these ghosts is this result, landed earlier (re-read here, on this pool thread; FetchOne is an existing request).
                    var taken = !landed && r.Applied.Count > 0 && err != null && err.StartsWith("Bridge 409", StringComparison.Ordinal)
                        ? UnreportedResults.AlreadyTaken(r, ChangesetClient.FetchOne(cfg, r.Key, r.ChangesetId, out _)) : null;
                    if (landed || taken != null)
                    {
                        UnreportedResults.Delete(r.Key, r.ChangesetId);
                        // Only a result the bridge holds is watched: an Undo then posts changeset_reverted for these guids — remembered under
                        // the Undo entry's name (the group's) and the changeset's own, whichever Revit reports (GhostChangesetBuild's rule).
                        foreach (var tx in r.Undo) UndoWatcher.Remember(tx, r.Key, r.ChangesetId, r.Applied.Select(a => a.ProposalGuid));
                        rep.Landed.Add((r, reply));
                        // MA-3a (Q2): a ghost declined on the web after Apply re-checked it was applied over the decline — recorded by the bridge; said.
                        rep.Words.Add(taken ?? $"\"{r.Name}\": reported ({ChangesetTrust.LedgerOf(reply)})." + (ChangesetTrust.LateDeclines(reply) is { } late ? "\n" + late : ""));
                        continue;
                    }
                    var (drop, words) = UnreportedResults.Outcome(err, r.Applied.Count);
                    if (drop) UnreportedResults.Delete(r.Key, r.ChangesetId);
                    else { rep.Left.Add(r); stalled = true; }
                    rep.Words.Add($"\"{r.Name}\": {words}");
                }
                return rep;
            }
            finally { Release(); }
        });
    }

    /// <summary>Promote's entry (MA-0): the review window on <paramref name="batch"/>.</summary>
    internal static bool Open(ExternalCommandData c, Document doc, BcfConfig cfg, string key, IReadOnlyList<ChangesetDto> batch) => Open(c.Application, doc, cfg, key, batch);

    /// <summary>Open the review window on proposed changesets of <paramref name="doc"/> (bound to <paramref name="key"/>): one, or (MA-2d)
    /// the changesets of one Promote storey (StoreyBatch.Of) — shown as one, applied as one Undo, each reported on its own ledger row.
    /// False when a review is open, a report is in flight, or (MA-3b) a result of the batch waits on this PC. API thread (a command's
    /// Execute, or the event hub's job for the picker's choice).</summary>
    internal static bool Open(UIApplication ui, Document doc, BcfConfig cfg, string key, IReadOnlyList<ChangesetDto> batch)
    {
        var cs = StoreyBatch.Merge(batch);
        if (Volatile.Read(ref _holds) > 0)
        {
            TaskDialog.Show(Title, Busy);
            return false;
        }
        // MA-3b (AI-2): a changeset this PC applied and the bridge has not taken is never opened again — a second Apply would duplicate it.
        var waiting = batch.Select(b => UnreportedResults.Read(key, b.Id)).Where(r => r != null).ToList();
        if (waiting.Count > 0) { TaskDialog.Show(Title, UnreportedResults.Blocked(waiting)); return false; }
        // Review C7: a Promote part reviewed alone — a part of its storey waits twice (two Promote runs) or is missing — is said.
        if (batch.Count == 1 && cs.Source == "promote" && StoreyBatch.StoreyOf(cs.Name) != cs.Name)
            TaskDialog.Show(Title, $"\"{cs.Name}\" is reviewed alone: another part of its storey is missing (not filed, or reviewed already) or waits twice (two Promote runs) — applying it is its own Undo entry, not the storey's.");

        // Per-invocation handler/event (every sibling command does the same): a static pair would
        // let a second open review window clobber the staged request and double-fire callbacks.
        // The closure below keeps both alive for the window's lifetime.
        var handler = new ChangesetPlacementEvent();
        var evt = ExternalEvent.Create(handler);

        // Review amendment C3 (MA-2c): a type edit's reach is the add-in's own count, read here on the API thread — the elements on the
        // type in the model now — never the poster's words in its reason.
        var reach = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var sp in (cs.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op == "set_parameter" && e.ProposalGuid != null))
            if (!string.IsNullOrWhiteSpace(sp.Target?.UniqueId) && doc.GetElement(sp.Target.UniqueId) is ElementType spType)
                reach[sp.ProposalGuid] = new FilteredElementCollector(doc).WhereElementIsNotElementType().Count(x => x.GetTypeId() == spType.Id);
        var window = new ChangesetReviewWindow(cs, reach);
        DialogOwner.Attach(window, ui); // house helper: owned by Revit's main window
        Hold();
        window.Closed += (_, _) => Release();
        var here = DocOf(doc);
        var left = new List<UnreportedResults.Record>(); // what Retry report sends again

        // Review C2: the person may close the window at any time — words for a closed window go to the pane's Doctor log and, when they
        // are a result (not an "…ing" line), to a dialog on Revit's thread: said, never lost.
        void Tell(string words, bool interim = false)
        {
            if (!window.Gone) { window.Say(words); return; }
            App.PanelVm?.LogDoctor("Review AI Proposals: " + words);
            if (!interim) App.Events.Enqueue(doc, "say the review's result", (_, _) => TaskDialog.Show(Title, words), _ => { });
        }

        // AI-2: a round of reports runs off Revit's thread; the window says what landed and offers Retry report for what did not.
        void Send(Task<Reported> sending, Func<Reported, string> words) => sending.ContinueWith(t =>
        {
            if (t.Status != TaskStatus.RanToCompletion)
            {
                Tell("Reporting failed — " + (t.Exception?.GetBaseException().Message ?? "it did not finish") +
                     $"\nA result Revit applied is kept on this PC ({UnreportedResults.Root}) and sent again by the next Review AI Proposals.");
                return;
            }
            left = t.Result.Left;
            Tell(words(t.Result) + (t.Result.Words.Count > 0 ? "\n\n" + t.Result.Text : ""));
            window.Retry(left.Count > 0);
        }, TaskScheduler.Default);

        async Task Decide(List<string> ticked, List<string> unticked, string note)
        {
            try
            {
                // Re-fetch: only still-proposed changesets may run (an agent may have withdrawn one) — MA-2d: the whole storey, or nothing.
                // MA-3b: on a pool thread; a refusal keeps the window, its ticks and its note.
                var fresh = new List<ChangesetDto>();
                foreach (var one in batch)
                {
                    var f = ChangesetClient.FetchOne(cfg, key, one.Id, out var oneErr);
                    if (f == null || f.Status != "proposed")
                    {
                        window.Refused(f == null ? $"Couldn't re-check the changeset:\n{oneErr}" : $"Changeset{(batch.Count > 1 ? $" \"{f.Name}\"" : "")} is now \"{f.Status}\" — nothing was created.");
                        return;
                    }
                    fresh.Add(f);
                }

                // MA-3a (design §6.6, D17): a web decline binds. The window shows one unticked and refuses its tick; one that landed after the
                // window opened is caught here, on the fresh copies — the whole Apply is refused and nothing is created.
                if (ChangesetTrust.DeclinedTicked(fresh, ticked) is { } declinedTicked)
                {
                    // Review C3: unticked and locked here, so the next press applies the rest.
                    window.Lock(fresh.SelectMany(f => f.Elements ?? new List<ChangesetElementDto>()).Where(e => ticked.Contains(e.ProposalGuid) && ChangesetTrust.DeclinedOnWeb(e)).Select(e => e.ProposalGuid).ToList());
                    window.Refused(declinedTicked);
                    return;
                }

                // The bridge takes a result from a contributor or above only: ask BEFORE anything runs, or a viewer's Apply would
                // change the model and then be refused, leaving the changeset "proposed" (the report's 401/403 is the backstop).
                var role = ChangesetClient.MyRole(cfg, key, out var roleErr);
                if (!Reporters.Contains(role))
                {
                    window.Refused((role == null ? $"Couldn't check your role on \"{key}\":\n{roleErr}" : $"You are {(role == "" ? "not a member" : role)} on \"{key}\" — applying or declining needs contributor or above.") +
                                   "\n\nNothing was changed. Sign in (Standards ▸ Sign in) as a contributor on this project.");
                    return;
                }

                if (ticked.Count == 0)
                {
                    // AI-5: Decline all needs a reason — the note, recorded on each changeset's result (result.note) and its changeset_applied row.
                    if (string.IsNullOrWhiteSpace(note))
                    {
                        window.Refused(ChangesetTrust.DeclineNeedsReason);
                        return;
                    }
                    // Review C2: × pressed while the re-check ran is a cancel — nothing is declined.
                    if (window.Gone) { App.PanelVm?.LogDoctor("Review AI Proposals: the window was closed before Decline all ran — nothing was declined."); return; }
                    window.Applying("Declining — reporting to the bridge…");
                    // declined — no transaction at all; each changeset of the storey on its own ledger row
                    Send(ReportAll(cfg, fresh.Select(f => ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null)).ToList()), rep =>
                    {
                        // Review C6: said, never silent — counted from the declines the bridge took; nothing in the model changed.
                        int declined = rep.Landed.Count;
                        return $"Declined {declined} of {fresh.Count} changeset(s) — nothing in the model changed." +
                               (fresh[0].Source == "promote" ? CarriedEdits(fresh) + "\n\n" + RunPromoteAgain : "");
                    });
                    return;
                }

                // MA-2b (design §3.4 steps 5 and 10): a Promote changeset is checked against the DD IDS made from the LOD matrix before
                // commit, and its LOD state after is recorded — both from what PromoteContext reads, off Revit's thread.
                var promote = fresh[0].Source == "promote" ? await Task.Run(() => PromoteContext.Fetch(key)) : null;
                // MA-1a item 6: the project's guideline, for its placement block — only when a ticked element is a create. None
                // installed is no block, and the result says so. A guideline that could not be read is not "no block" (review
                // amendment C7): nothing runs, and the changeset stays proposed.
                GuidelinePlacement placement = null;
                if (fresh.SelectMany(f => f.Elements).Any(e => ticked.Contains(e.ProposalGuid) && (e.Op is null or "create")))
                {
                    var standards = await Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false));
                    if (PlacementPolicy.UnreadRefusal(standards.GuidelineSource.Origin, standards.GuidelineSource.NotInstalled || standards.GuidelineSource.NoProject,
                                                      !string.IsNullOrWhiteSpace(key), standards.GuidelineSource.Reason) is { } unread)
                    {
                        window.Refused(unread + "\n\nThe proposals are still pending — press Apply again once the guideline can be read.");
                        return;
                    }
                    placement = standards.Guideline.Placement;
                }

                Action<ChangesetExecutor.ExecutionResult> onDone = null;
                onDone = result =>
                {
                    // Revit's API thread, inside the placement event: API reads and the record only — every report goes to a pool thread.
                    handler.Completed -= onDone;
                    if (result.NotRun)
                    {
                        // Review C3: nothing was placed (a "Go back", a DocPin refusal, a missing workset) — Apply comes back in this window.
                        if (window.Gone) Tell(result.Error + "\n\nNothing was placed; the proposals are still pending.");
                        else window.Reopen(result.Error + "\n\nNothing was placed; the proposals are still pending — change the ticks or press Apply again.");
                        return;
                    }
                    if (result.NotFinished != null)
                    {
                        // A6: Revit may still finish or drop the transaction — reporting either way could be a lie.
                        Tell(result.NotFinished +
                            $"\n\nNothing was reported: the {(fresh.Count > 1 ? $"storey's {fresh.Count} changesets stay" : "changeset stays")} proposed. Check the model before reviewing it again — a second Apply could duplicate what Revit finishes.");
                        return;
                    }
                    if (result.Error != null)
                    {
                        // Whole changeset — MA-2d: the whole storey — rolled back: each changeset reported declined with the reason, honestly.
                        Tell($"Transaction failed and was rolled back:\n{result.Error}\n\nReporting the declines to the bridge…", interim: true);
                        Send(ReportAll(cfg, fresh.Select(f => ResultOf(key, f, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),
                                $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"), null, here, null)).ToList()), rep =>
                        {
                            // Review C14: counted from the declines the bridge took (C6's rule), never the number sent.
                            int declined = rep.Landed.Count;
                            return $"Transaction failed and was rolled back:\n{result.Error}\n\nReported as declined: {declined} of {fresh.Count} changeset(s)" +
                                   (declined < fresh.Count ? " — the rest are still proposed; the model holds none of them." : ".") + (fresh[0].Source == "promote" ? CarriedEdits(fresh) + "\n\n" + RunPromoteAgain : "");
                        });
                        return;
                    }
                    // MA-1a step 2: an element Revit removed at commit is reported as rejected, with the reason in the note. MA-2d: each
                    // changeset of the storey is reported on its own ledger row; the storey's BLOCK and IDS lines ride on each note.
                    var gone = result.Gone.Select(a => a.ProposalGuid).ToList();
                    var undo = StoreyBatch.UndoName(fresh);
                    var records = new List<UnreportedResults.Record>();
                    foreach (var (one, res) in result.Each)
                    {
                        var oneGone = res.Gone.Select(a => a.ProposalGuid).ToList();
                        var rejected = StoreyBatch.Own(one, unticked).Concat(oneGone).Distinct().ToList();
                        var said = oneGone.Count == 0 ? note : $"{oneGone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
                        if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
                        if (result.Ids != null) said = result.Ids + (string.IsNullOrEmpty(said) ? "" : " | " + said);     // MA-2b
                        // MA-3a: the revision Apply re-checked. Remembered for the undo watcher under the Undo entry's name and the changeset's own.
                        records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }));
                    }
                    // AI-2: the record first — on this PC before the report is sent, so a result the bridge never hears of is never forgotten
                    // and never applied twice.
                    var unsaved = records.Where(r => r.Applied.Count > 0 && !UnreportedResults.Write(r)).Select(r => $"\"{r.Name}\"").ToList();
                    // MA-2b, design §3.4 step 10: the LOD state after a Promote changeset, read again on this (the API) thread — sent as one
                    // more lod_state row once the bridge holds a changeset of it as applied.
                    LodStateReport lod = null;
                    string after = null;
                    if (promote != null && result.Applied.Count > 0)
                    {
                        try { lod = PromoteWallsCommand.LodStateAfter(doc, promote); }
                        catch (Exception ex) { after = "LOD state after: not read — " + ex.Message; }
                    }
                    var warnings = GhostFailurePolicy.WarningsLine(result.Warnings, fresh.Count > 1 ? "storey" : "changeset");
                    var head = $"Applied {result.Applied.Count} element(s) from \"{cs.Name}\"." +
                        (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : "") +
                        (result.Ids != null ? "\n\n" + result.Ids : "") + (result.Placement != null ? "\n\n" + string.Join("\n", result.Placement) : "") + // MA-1a item 6
                        (unsaved.Count > 0 ? $"\n\n⚠ The result of {string.Join(", ", unsaved)} could not be saved on this PC ({UnreportedResults.Root}): if its report fails too, nothing on this PC remembers it — check the changeset's status on the bridge before reviewing it again." : "");
                    Tell(head + "\n\nReporting to the bridge…", interim: true);
                    Send(ReportAll(cfg, records), rep =>
                    {
                        // Review C15: what the bridge took — the changesets it holds as applied, and the rejected rows it recorded.
                        var held = rep.Landed.Where(x => x.R.Applied.Count > 0).Select(x => x.R.ChangesetId).ToList();
                        int untickedTaken = rep.Landed.Sum(x => StoreyBatch.Own(fresh.First(f => f.Id == x.R.ChangesetId), unticked).Count);
                        int goneTaken = rep.Landed.Sum(x => x.R.Rejected.Count(gone.Contains));
                        if (lod != null && held.Count > 0)
                        {
                            GovernedNotify.Report("LOD state after", CommandReports.LodState(lod, held, UserSession.Actor), key, window.Dispatcher);
                            after = "LOD state after (sent to the ledger — the pane's Doctor log says whether it was recorded): " + lod.Line;
                        }
                        else if (lod != null) after = "LOD state after: not sent — the bridge took no changeset of this Apply as applied (a result reported later sends none).";
                        return head + (unticked.Count > 0 ? $"\n{untickedTaken} of {unticked.Count} unticked element(s) reported as rejected." : "") +
                               (gone.Count > 0 ? $"\n{goneTaken} of {gone.Count} element(s) removed by Revit at commit — reported as rejected." : "") +
                               (after != null ? "\n\n" + after : "");
                    });
                };
                // Review C2: × pressed while the re-check, the role or the standards were read is a cancel — nothing is raised.
                if (window.Gone) { App.PanelVm?.LogDoctor("Review AI Proposals: the window was closed before Apply ran — nothing was placed."); return; }
                window.Applying("Applying in Revit…");
                // ExternalEvent.Raise from the window's thread (Revit's), as every modeless window here raises it.
                _ = window.Dispatcher.BeginInvoke(new Action(() =>
                {
                    try
                    {
                        handler.Completed += onDone;
                        handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);
                        // Review M3: a request Revit did not take places nothing — said, and Apply comes back. (Pending: an earlier raise
                        // still runs, so Apply stays pressed.)
                        var raised = evt.Raise();
                        if (raised == ExternalEventRequest.Denied || raised == ExternalEventRequest.TimedOut)
                        {
                            handler.Completed -= onDone;
                            window.Reopen($"Revit did not take the request ({raised}) — nothing was placed; press Apply again.");
                        }
                    }
                    catch (Exception ex)
                    {
                        handler.Completed -= onDone;
                        window.Reopen($"Apply could not be started — {ex.GetType().Name}: {ex.Message}\n\nNothing was placed; press Apply again.");
                    }
                }));
            }
            catch (Exception ex) { window.Refused($"Review AI Proposals failed — {ex.GetType().Name}: {ex.Message}\n\nNothing was created."); }
        }

        window.DecideRequested += (ticked, unticked, note) => Task.Run(() => Decide(ticked, unticked, note));
        window.RetryRequested += () =>
        {
            var again = left;
            window.Say("Checking the model, then reporting again…");
            App.Events.Enqueue(doc, "check the model before reporting", (_, d) => Send(Retry(d, cfg, again), rep => $"Sent again: {rep.Landed.Count} of {again.Count} result(s) reported."),
                refusal => { window.Say(refusal); window.Retry(true); });
        };
        window.Show();
        return true;
    }

    /// <summary>True when the bridge recorded the result. Ghost Builder's (GhostChangesetBuild), with its retry dialog — the review window
    /// reports through ReportAll (MA-3b). MA-3a: <paramref name="reviewRev"/> is the changeset's review_rev Apply re-checked (Ghost Builder's applying build sends the review_rev its filing reply carried; a call that applies nothing sends none).</summary>
    internal static bool Report(BcfConfig cfg, string key, string id, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev = null)
    {
        while (true)
        {
            if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, reviewRev, out var reply, out var err))
            {
                // MA-3a (Q2): a ghost declined on the web after Apply re-checked it was applied over the decline — recorded by the bridge; said.
                if (ChangesetTrust.LateDeclines(reply) is { } late) TaskDialog.Show("Sentinel — AI proposals", late);
                return true;
            }
            // Client errors (400 bad payload, 401/403 not signed in or not a contributor, 404, 409 already-resolved)
            // won't heal on retry with an identical payload — show once and stop instead of an unwinnable retry loop.
            if (err != null && new[] { "400", "401", "403", "404", "409" }.Any(code => err.StartsWith("Bridge " + code)))
            {
                TaskDialog.Show("Sentinel — AI proposals",
                    $"The bridge refused the result (retrying cannot fix this):\n{err}" +
                    (err.StartsWith("Bridge 401") || err.StartsWith("Bridge 403") ? "\n\nSign in (Standards ▸ Sign in) as a contributor on this project." : "") +
                    (applied.Count > 0 ? "\n\nElements WERE changed in this model. Check the changeset's status in the bridge before any re-review." : ""));
                return false;
            }
            // When elements WERE created, cancelling leaves the bridge still saying "proposed" —
            // and a later review run would re-execute the same changeset, DUPLICATING the elements.
            // Say so explicitly; an unnamed hazard is a trap.
            var hazard = applied.Count > 0
                ? $"\n\nWARNING: {applied.Count} element(s) were ALREADY CREATED in this model. If you cancel, the bridge still lists this changeset as \"proposed\" — reviewing it again would create duplicates. Retry until the report succeeds, or have the agent withdraw the changeset before any re-review."
                : "";
            var d = new TaskDialog("Sentinel — AI proposals")
            {
                MainInstruction = "The result could not be reported to the bridge.",
                MainContent = $"{err}\n\nThe governed record does NOT yet reflect what happened in Revit.{hazard}\n\nRetry?",
                CommonButtons = TaskDialogCommonButtons.Retry | TaskDialogCommonButtons.Cancel,
            };
            if (d.Show() != TaskDialogResult.Retry) return false;
        }
    }
}
```

- [ ] **Step 6: See them pass.** From the repo root: `dotnet run --project tools/promote-check`
Expected: `730/730 checks pass`. Then the builds, each `0 Error(s)` with master's warnings (none in a file MA-3b touches):

```bash
for v in 2022 2023 2024 2025 2026 2027; do dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Error\(s\)|Warning\(s\)"; done
```

Expected: 2022 `0`/`3`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` (errors/warnings).

- [ ] **Step 7: Commit.**

```bash
git add SentinelAddin/UI/ChangesetPickerWindow.cs SentinelAddin/UI/ChangesetReviewWindow.cs SentinelAddin/Commands.ReviewChangesets.cs tools/promote-check/Ma3bDesk.cs tools/promote-check/Check.cs tools/promote-check/Ma2dWiring.cs tools/promote-check/Ma3aReview.cs tools/promote-check/PlacementBlock.cs
git commit -m "feat(addin): MA-3b - the review does not wait (AI-2) and lists every pending changeset (AI-5): a picker opens at once (a Promote storey as one entry); Apply's re-check, the role, the standards and every report run on a pool thread; a result Revit applied is written on this PC before its report is sent, its changeset not opened again until the bridge takes it, sent again after a stamp check; the window stays open (refusals keep the ticks and the note; Retry report; reported (ledger #n)); rows grouped by what they do with Tick group / Untick group; Decline all needs a reason; the guard is held until the report lands (promote-check 43; 39 and 41 rewritten)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4 — Words: the design doc; the final checks

**Files:**
- Modify `docs/strategy/2026-09-30-model-automation-design.md`

- [ ] **Step 1: The design doc says what was built.** In `docs/strategy/2026-09-30-model-automation-design.md`, replace:

```markdown
  - Rows grouped by storey and kind; zoom to row; accept a storey in one batch; a reason for each decline (AI-5).
  - AI-2: the report is sent off the UI thread.
```

with:

```markdown
  - Rows grouped by storey and kind; zoom to row; accept a storey in one batch; a reason for each decline (AI-5). BUILT on `feature/ma3b-revit-desk` (MA-3b), drill MA3b pending: a picker of every pending changeset (age, source, verdict counts, the web's declines; a Promote storey as one entry), the rows grouped by what they do (the web desk's words) with Tick group / Untick group, Decline all needs a reason, and each report names its ledger row. A reason per declined ghost and zoom to row are MA-3b2.
  - AI-2: the report is sent off the UI thread. BUILT on `feature/ma3b-revit-desk` (MA-3b), drill MA3b pending: the re-check, the role, the standards and every report run on a pool thread, and the window stays open until the report lands (Retry report); a result Revit applied is kept on this PC (`%AppData%\Sentinel\unreported` — founder decision F1, not Extensible Storage) before its report is sent, its changeset is not opened for review again until the bridge takes it, and it is sent again only after the model's stamps confirm its elements (at the next Review AI Proposals, or by Retry report — by itself on `DocumentOpened` is MA-3b4).
```

- [ ] **Step 2: The final checks.** From `WebApp`: `npx vitest run` → `143 passed (143)` files, `2319 passed | 1 skipped (2320)`; restore `ids-cases.json`. From the repo root, the check projects that compile a file MA-3b changed:

```bash
for p in promote-check session-check artefact-cache-check gate-check ghost-p2-check ghost-standards-check publish-check roi-check; do printf "%s: " $p; dotnet run --project tools/$p 2>&1 | grep -E "checks? pass" | tail -1; done
```

Expected: `promote-check: 730/730`, `session-check: 47/47`, `artefact-cache-check: 55/55`, `gate-check: 219/219`, `ghost-p2-check: 107/107`, `ghost-standards-check: 177/177`, `publish-check: 124/124`, `roi-check: 50/50` (each `checks pass`). The other 18 check projects compile no file MA-3b changes.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -m "docs: MA-3b - the design doc says what was built (the picker, the groups, Decline all with a reason, the review that does not wait, the result kept on this PC); drill MA3b pending" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Live drill MA3b (Revit 2024, two scratch copies, the test bridge, no web rows — on the branch, before the merge)

**The founder's OK first.** The set-up's build deploys the branch's add-in into Revit 2024. That needs the founder's explicit OK in chat for this drill; without it, nothing below runs and every row is **owed**.

**Who does what.** The drill runner drives Revit by mouse (or UI Automation's Invoke, as in MA2c–MA3a) and the bridge calls. Revit is signed in (the founder; Standards ▸ Sign in, their password — the founder's). **Focus-sensitive steps** — clicking in Revit's view, Ctrl+Z, reading the review window — happen while Revit is in front, or are the founder's: a script cannot take focus from Chrome, and Revit's owned windows hide from UI Automation while Revit is in the background (a hidden window looked closed in MA3a). TaskDialog buttons have no UIA Invoke (`WindowPattern.Close` works). Revit's Undo list opens at its dropdown (`133,10`): read it, **never click an entry** (a click undoes). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window. Open the scratch copies from Revit's Open dialog.

**The Revit MCP in this drill:** only its read-only calls, never while a Revit command, a TaskDialog or a Sentinel window is open.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run (tight scope); the code is the same on net8/net10 and builds there (Task 3).
- **A result sent by itself on `DocumentOpened`** (F2 B): not built — MA-3b4.
- **A 401/403 report** (`Outcome`'s sign-in words), **a record that could not be written**, and **a record removed by a 400/404/409**: checked offline (promote-check §42), not provoked.
- **The LOD state after for a result sent again later** (none is sent — said in the window): not a row.
- **Ghost Builder's** report (unchanged, its retry dialog): not a row.
- **R-5** (a waiting result undone with Ctrl+Z is never reported as applied): optional — owed if not run.

**Set-up (once):**
- **Build.** Close Revit. Record the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`, lower case). With the founder's OK: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build); record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The add-in's bridge settings.** Copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma3bbak` beside it (never print it, never open it in a viewer); point it at the test bridge: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The test bridge on 127.0.0.1:4101** — the `bridge-test` preview server (`.claude/launch.json`: `node <scratchpad>/bridge-test.mjs`, which sets `BCF_PORT=4101`, `BCF_EVENT_POLL_MS=0` and imports the checkout's `WebApp/bridge/bcf-service.mjs` — this branch's, Task 1). If that scratchpad file is gone, write it again with those four lines (`process.env.BCF_PORT = "4101"; process.env.BCF_EVENT_POLL_MS = "0"; await import("file:///C:/Users/yazan/Claude/Projects/Co%20BIM%20Assistant/sentinel-project/WebApp/bridge/bcf-service.mjs");`). Its banner names port 4101; `curl -s http://127.0.0.1:4101/health` answers. The founder's 4100 bridge is not touched. Every bridge call names `http://127.0.0.1:4101` through MA2e's helper (the machine credential, read through `load-env.mjs`):

  ```bash
  b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
  ```

- **The scratch web projects** (from `WebApp`; nothing on `demo`, `bds-office`, `ma3a` or a real office): `b4101 POST cde/projects '{"key":"ma3b-office","kind":"office"}'`, `b4101 POST cde/projects '{"key":"ma3b","office_key":"ma3b-office"}'`; on the OFFICE: `b4101 PUT "cde/ma3b-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma3b-office/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json`, `b4101 PUT "cde/ma3b-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`, `b4101 PUT "cde/ma3b-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json` (each 201). The founder's membership (review M5 — the e-mail never reaches a command line, a log or the record): the founder writes `{"email":"<their account>","role":"contributor"}` to `<scratchpad>/ma3b/member.json`; the runner sends `b4101 POST cde/ma3b/members @<scratchpad>/ma3b/member.json | grep -oE '^[0-9]+|"user_id":"[^"]*"'` (the status and the `user_id` only; record those) and deletes the file.
- **The silent port** (R-2): a listener that accepts a connection and never answers, so a report waits its full 120 s — `node -e "require('net').createServer(() => {}).listen(4101, '127.0.0.1', () => console.log('silent on 4101'))"`, run in the background only while `bridge-test` is stopped, stopped before `bridge-test` starts again.
- **The scratch models**: `Documents\Sentinel drills\ma3b\ma3b-a.rvt` and `ma3b-b.rvt`, two copies of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), opened from Revit's Open dialog, each bound with Sentinel ▸ Project Setup to `ma3b` (current-project scope), never saved. Open `ma3b-b.rvt` only at R-2b.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| R-1 | On `ma3b-a.rvt`: Sentinel ▸ Promote (DD) → **Yes**; the review window it opens (GR-FFL) — close it with ×. Sentinel ▸ Review AI Proposals | A window `Sentinel — AI proposals waiting: ma3b` opens at once reading `Loading…`, then `3 waiting for review on "ma3b", oldest first — pick one and press Review.` and three lines: `Promote (DD) · GR-FFL — promote (claimed) · just now · 48 ghost(s): …`, `Promote (DD) · 01-FFL — …`, `Promote (DD) · MA0 Roof — …` (or the names Promote filed — MA3a's D-1: 48, 40 and 1 ghosts); no "reviewing the oldest first" dialog. Choose GR-FFL ▸ **Review**: the review window shows `retype wall (28) · 28 ticked` and `attach wall (20) · 20 ticked` (signed in: pre-ticked) and the button `Apply 48 ticked in Revit`; **Untick group** on the attach group → `attach wall (20) · 0 ticked`, `Apply 28 ticked in Revit`; **Tick group** → 20 again, then **Untick group** again | The picker's text; the group headers and the button before and after |
| R-2 | In that window (28 retypes ticked): **Apply 28 ticked in Revit**. At the DD IDS dialog (MA3a's D-4 met it on this seed: "Place anyway"), before pressing anything: stop the `bridge-test` preview; start the silent port; then **Place anyway**, noting the time (review C5). While the window reads `Reporting to the bridge…`: with Revit in front, click an element in the view and read the Undo list. When the window's words arrive, note the time. **Under 100 s** means the POST failed at once on a pooled socket, not on the silent port (UNSURE 7): press **Retry report**, note the time, run the click and the Undo list during that wait, and measure to its words instead. Then list `%AppData%\Sentinel\unreported\ma3b\` (file names and sizes only). **The report's own hold** (C5): press **Retry report** again; while the window still reads `Checking the model, then reporting again…` (5 s after the press), close the window with ×, then press Review AI Proposals on the ribbon. When the report's words arrive as a TaskDialog (C2), read it and close it with `WindowPattern.Close`; read the pane's Doctor log. Stop the silent port; start `bridge-test` | Revit answers the click and the Undo list shows one Sentinel entry while the report waits; the words arrive **≥ 115 s** after the press they follow; the window reads `Applied 28 element(s) from "Promote (DD) · GR-FFL".` … `"Promote (DD) · GR-FFL": not reported: the bridge did not answer within 120 s` and `The result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice.`, with **Retry report** shown; one file `<GR-FFL changeset id>.json`; after × the ribbon's Review answers `A review window is open, or a result is still being reported to the bridge — …` (the guard held by the report alone); the TaskDialog then carries the same `not reported` words, and the Doctor log a `Review AI Proposals: …` line with them; the file is still there | The window's text; the two times and the elapsed seconds; the Undo list; the file name; the ribbon's words after ×; the TaskDialog's text; the Doctor log line; the raw timeout words if they differ (UNSURE 2) |
| R-2b | Open `ma3b-b.rvt` (Revit's Open dialog), bind it with Project Setup to `ma3b`. Review AI Proposals | The picker's status names `1 result(s) applied in another model wait on this PC for the bridge — close this list, open that model and run Review AI Proposals there: "Promote (DD) · GR-FFL" in <ma3b-a's path>`; the GR-FFL line carries `⚠ "Promote (DD) · GR-FFL" was applied in <ma3b-a's path> (…) and the bridge has not taken its result yet — it is not opened for review again …`; selecting it leaves **Review** disabled (a double-click does nothing). Close the picker; close `ma3b-b.rvt` without saving | The picker's text; Review's state |
| R-3 | Back in `ma3b-a.rvt` (switch to its window): Review AI Proposals. Then `b4101 GET changesets/ma3b/<GR-FFL id>`, `b4101 GET "cde/ma3b/audit?entity_type=changeset&limit=5"`; list `%AppData%\Sentinel\unreported\ma3b\` | The picker's status leads with `2 waiting for review on "ma3b" …` and says `"Promote (DD) · GR-FFL": reported (ledger #<n>).`; it lists 01-FFL and MA0 Roof only; the file is gone; GET `"status":"partially_applied"`, `result.applied` 28, `result.rejected` 20, `result.review_rev_seen` `{"value":0,"claimed":true}`; the newest audit row `changeset_applied` #`<n>` | The picker's text; the ledger id; GET's fields |
| R-4 | Choose 01-FFL ▸ Review. **Untick all** (the button reads `Decline all (needs a reason)`); press it with the note empty. Then type `drill MA3b: wrong storey` in the note; **Decline all**. `b4101 GET changesets/ma3b/<01-FFL id>`; read the Undo list | The first press, at once (no `Re-checking with the bridge…` first — M2): `Nothing is ticked, so this declines every ghost — a decline needs a reason: type it in the note (it is recorded with the result), then press Decline all.`, the window open and the button enabled again; the second: `Declined 1 of 1 changeset(s) — nothing in the model changed.` … `Run Promote (DD) again …` and `"Promote (DD) · 01-FFL": reported (ledger #<m>).`; GET `"status":"declined"`, `result.note` `drill MA3b: wrong storey`; the Undo list unchanged | The window's text; the ledger id; GET's fields |
| R-5 (optional) | Choose MA0 Roof ▸ Review; tick it; at **Apply**, before Revit places it, stop `bridge-test` (if no dialog comes first, stop it before pressing Apply — the re-check then refuses in words and the row is **owed**). After `not reported: …`: with Revit in front, **Ctrl+Z** once (never click the Undo list). Start `bridge-test`; **Retry report** | `"…MA0 Roof": not in this model as applied (undone, the model was closed without saving, or a local that was never synchronised) — nothing reported; the bridge holds the changeset as proposed, so it opens for review again. This PC's record is removed.` (review C9: said only after the bridge was asked); `b4101 GET` the changeset `"status":"proposed"`, `"result":null` | The window's text; GET |

The rows run in the order R-1, R-2, R-2b, R-3, R-4 (R-5) on the same session.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA3b — the Revit review that does not wait, live (<date> ~hh:mm → hh:mm local, branch feature/ma3b-revit-desk <sha>, Claude driving Revit 2024)`: the Setup paragraph (deploy on the founder's OK with the DLL sha before and after, settings at 127.0.0.1:4101, the scratch office and project, the membership, the sign-in state, the scratch copies, not saved), the table `| Row | Result | Evidence |` with **pass**/fail and the window's and the picker's text quoted, plus ledger `#n`; then R-amendments, F-MA3b-n findings each fixed on the branch ("fix(drill MA3b): …" with its check) and their shas, and the **owed** rows at its end.

**Closing list:**
- close Revit without saving either scratch copy;
- stop `bridge-test` and the silent port if it still runs; the founder's 4100 bridge is not touched;
- restore the add-in's bridge settings: copy `bcf-config.json.ma3bbak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, and record the deployed DLL's sha256 beside the hash recorded before. If the session's permission check refuses that build, say so: the branch's add-in stays until the merge's deploy — safe: with master's 4100 bridge it says "the bridge named no ledger row", and it writes and clears its own records;
- list what the drill left on the shared ledger — the scratch office `ma3b-office` (`guideline@1`, `type_catalog@1`, `lod_matrix@1`, `ruleset@1`), the project `ma3b`, the membership, the changesets and their rows — left in place on purpose (scratch keys);
- list what the drill left on this PC outside the repository: `%AppData%\Sentinel\unreported\ma3b\` (deleted with its files, if any: a scratch key), `%AppData%\Sentinel\cache\ma3b*` (deleted: scratch keys only), the scratch copies in `Documents\Sentinel drills\ma3b\` (kept, named, as evidence; never committed).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record — R-2 and R-3 are never owed at the merge: without them nothing proves live that Revit does not wait and that a result is never lost (AI-2's proof); the merge waits for a session that runs them;
- each F-MA3b-n fix is committed on the branch with its check, and Task 4 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does was deployed and its row run again live before the merge; a row whose fix was not run again is **owed**, not passed;
- R-2 passed: if a result Revit applied was lost (no record and not reported) or a changeset was applied twice, nothing is merged.

**The design doc says what the drill proved**, committed on the branch before the merge: replace each `BUILT on \`feature/ma3b-revit-desk\` (MA-3b), drill MA3b pending` with `LANDED in MA-3b (merge <date>), drill MA3b: <passed rows; owed rows>` — `git commit -m "docs: MA-3b - drill MA3b's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma3b-revit-desk -F - <<'EOF'
Merge feature/ma3b-revit-desk: MA-3b - the Revit review that does not wait (audit AI-2, AI-5): Review AI Proposals opens a picker at once listing every pending changeset (a Promote storey as one entry; age, source, verdict counts, the web's declines); Apply's re-check, the role, the standards and every report run on a pool thread - no GetResult left in the review; a result Revit applied is written on this PC (%AppData%\Sentinel\unreported, founder decision F1) before its report is sent, its changeset is not opened again until the bridge takes it, and it is sent again (the next Review, or Retry report) only after the model's stamps confirm its elements; the review window stays open (a refusal keeps the ticks and the note; Retry report; each report names its ledger row - the bridge now answers it); rows grouped by what they do with Tick group / Untick group; Decline all needs a reason; the guard is held until the report lands. Drill MA3b: <the result and the owed rows>. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order** (either order works — an older bridge's reply has no `ledger` and the add-in says "the bridge named no ledger row"; an older add-in ignores the field — the bridge first, so the first review after the deploy names its rows):
1. **The bridge — the founder restarts the 4100 bridge** on master (`changesets-store.mjs` changed; no bundle rebuild, no migration).
2. **The add-in**, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same for each other Revit version the founder uses.
3. No web publish (no web change).

## UNSURE facts this drill settles

1. Whether `ExternalEvent.Raise()` through `window.Dispatcher.BeginInvoke` from a pool thread places as the old synchronous handler did (it runs on Revit's main thread either way) — R-2.
2. The words net48's `HttpClient` gives when a 120-second write times out (expected `A task was canceled.`, which `Outcome` says as `the bridge did not answer within 120 s` — M4; other words appear raw) — R-2 records them.
3. Whether the picker's wrapped `TextBlock` lines read whole at 720 px, and whether a `ListBoxItem` whose `Tag` is null is visibly not openable — cosmetic; R-1, R-2b.
4. Whether the B35 seed's MA0 Roof ghost is a create (it then needs the guideline's placement block) — R-5 only.
5. Whether one Ctrl+Z after an unreported apply removes the stamps with the elements (one TransactionGroup, one Undo entry — MA-2d) — R-5.
6. Whether Promote on a fresh copy bound to `ma3b` files the same three changesets as MA3a's D-1 — R-1 records what it filed.
7. Whether net48 sends the report's POST on a pooled keep-alive socket left by the re-check's GETs, so it fails at once once `bridge-test` is stopped instead of waiting on the silent port (review C5) — R-2's elapsed time says; the row measures the Retry report's wait when it does.

## Risks (each a ceiling stated in words)

- **A record of a model never opened again keeps its changeset closed on this PC** (F4 A): the picker names the model and the file to delete once the person has checked it. A "Forget" button is not built (it would invite the duplicate AI-2 prevents).
- **Records are per PC.** Another PC (or the same PC after the file is deleted) can still open a changeset whose result waits here, because it is still proposed on the bridge — a duplicate across machines. The bridge-side "ticked" lock (MA-3b3) closes it.
- **A stale workshared local** whose elements never reached the central: on a new local of the same central the record's elements are "not in this model" — the record is removed and said; if the old local is later synchronised, its elements arrive unreported (the changeset may be applied again meanwhile). Said in the words ("not in this model as applied"); a central-side check is not built.
- **A result sent again later sends no LOD state after** (it is read at Apply): the window says so.
- **A decline that did not land lives only in the window** (E4): closing the window loses it; nothing in the model changed and the changeset stays proposed — said.
- **The guard is in memory** (E3): a Revit restart resets it; the records on disk still keep an applied changeset closed.
- **Listing marks a mixed storey's parts** (review C13's session set): `StoreyBatch.Entries` calls `Of` for every pending changeset, so a storey with a part waiting twice or missing is marked mixed by the picker's listing alone, as opening one did; `Of` holds a lock on that set (M1), since the picker lists on a pool thread while Promote may call it on Revit's.
- **A 409 read as "already taken" (C1)** compares the ghosts the stored result applied with the record's: another PC that applied the same changeset with the same ticks first would match — this PC's elements are then a duplicate the bridge does not name (the "Records are per PC" ceiling; MA-3b3's lock closes it). The words say "its reply did not reach Revit" and name the status; the record is removed.
- **Ghost Builder still waits** (its `Report` dialog, `GhostChangesetBuild.cs:153,653`) and **Promote's own reads still wait** (`Commands.PromoteWalls.cs:49,61,191`): MA-3b4.

## Next (out of scope here)

- **MA-3b2 — a reason per declined ghost, and zoom to row** (Revit, plus a bridge step). The result's optional `reasons {guid: text}`: the bridge validates each key is in `rejected`, cleans each value with `reasonOf` (`changesets-logic.mjs:540`, exported or a pure `resultReasons`), stores it beside `declined_on_web` and on the `changeset_applied` row; a fixture entry in `fixtures/changeset-ops/ma3a-review.json` read by vitest and promote-check; one reason box per group fills its unticked ghosts. Zoom: a `SelectAndShow` overload by unique id that says when the element is gone (`RevitEventHub.cs:45` returns silently today), and `ZoomAndCenterRectangle` for a create (corners from `place`, mm → ft). Why later: reasons need a bridge restart and a contract change; zoom matters less than not freezing and not losing a report. Size S–M.
- **MA-3b3 — the Revit "ticked" lock and the carried decline** (Revit + bridge + web desk). The F2 C / S4 lock needs bridge state, a route and the desk refusing a decline on a locked ghost — it brings web rows. C4's carry-forward (same `target.unique_id`, `op`, `place.TypeName`/`to` as a declined ghost) needs every changeset of every status and a founder decision: **(A)** the bridge stamps the carried `review` at filing (trust stays in the bridge; the desk shows it) or **(B)** Promote files the ghost as an exception row with the decline's words (add-in only, never placed). Recommended: A. Size M–L.
- **MA-3b4 — nothing in modelling waits.** A waiting result sent by itself on `DocumentOpened` (F2 B) with a line in the pane's Doctor log; Ghost Builder writes the same record before its report and stops waiting; Promote's reads (`:49`, `:61`) and its filing (`:191`) off the thread.
- **MA-3c — the ghost overlay** and **MA-3d — web highlights and the proposal model**: as in the MA-3a plan's Next.
- Owed rows carried: Revit 2025–2027 for the review (MA-3a and MA-3b); MA3a's D-4 second account and a late decline applied over; and from MA2e — Revit 2025–2027 for Annotate, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy.
