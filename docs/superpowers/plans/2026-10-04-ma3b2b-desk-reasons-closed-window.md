# MA-3b2b — Revit's decline reasons on the web desk, a closed window's result in a dialog, and a lost-reply decline taken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first entry of the MA-3b2 plan's "Next" (`docs/superpowers/plans/2026-10-04-ma3b2-decline-reasons-zoom.md` ▸ Next ▸ MA-3b2b) and the two items drill MA3b2 left, as one drillable slice:
- **Revit's decline reasons on the web review desk.** Under the proposed list, a section **"Recently decided in Revit"**: the newest 10 changesets Revit reported (applied, partially applied, declined), each with who reported it, when, the reviewer's note, its ledger row (`ledger #n`) and — when the ledger holds one — the Undo in Revit after it (review C3), and every ghost the result did not apply with Revit's reason (`result.reasons`) and the web's (`declined_on_web`) — or the words that it has none. Text only (`textContent`), never HTML (MA-3b2 review C13). A second read beside the proposed one; the desk's ↻ Refresh re-reads both.
- **F-MA3b2-1 fixed.** With the review window closed while a report is out, the report's words reach a TaskDialog. The root cause is **not verified offline** (it needs Revit). Four candidates are closed in one place each — the fourth is review C1's: the pane's Doctor line ran on the pool thread and could throw before the dialog was queued. Drill row **R-0** runs the same steps on the build Revit holds *before* the deploy and reads which candidate it was (review C2); R-1 says whether the dialog now shows.
- **A Decline all whose reply was lost is taken, not "refused".** On Retry report the bridge answers 409; the changeset is re-read, and a stored result that is declined with the same rejected ghosts and the same note — and, when it holds reasons, the same reasons (review C7) — is this decline, landed earlier.
- **Drill MA3b2b** — short: two web rows (W-1, W-2) on the founder's local app, three Revit rows on Revit 2024 behind the drill proxy (R-0 on the build Revit holds now; R-1 and R-2 on the branch's).

**Source of truth:** `docs/superpowers/plans/2026-10-04-ma3b2-decline-reasons-zoom.md` ▸ Next ▸ MA-3b2b, its review amendments C13 and "Not changed"; `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` ▸ `## Session MA3b2` (F-MA3b2-1; what the drill left on the ledger under key `ma3b2`); `docs/strategy/2026-09-30-revit-addin-audit.md` — AI-2 (`:352`), AI-5 (`:355`). Base: `feature/ma3b2b-desk-reasons` at master `e411406` (MA-3b2 merged). Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight — one drillable slice, about 300 lines with its checks, after the review):** the three items above. All three fit; nothing is split off. Left to **Next** with reasons: a bridge `status` list and `limit` (only if the desk's read proves heavy), the ledger panel printing reasons, an audit of the other caller-dispatcher sites (review C1e), a reason box per row, MA-3b3, MA-3b4, MA-3c/d.

**Architecture:**

*Pure (add-in, promote-check §46).* `UnreportedResults.AlreadyTaken(record, fresh)` gains the decline case: a record that applied nothing is taken when `fresh.Status == "declined"`, the stored `result.rejected` set-equals the record's, and the stored `result.note` equals the record's note trimmed (the bridge stores it trimmed, or null); when the stored result holds `reasons`, they equal the record's as the bridge keeps them (review C7). `Gone` asks for a revert only for a record that applied something (C10); `DeclineLost` no longer says the changeset stays proposed (C8). `ReportAll` re-reads on every 409, no longer only for a result with applied ghosts.

*Revit (scans §47; the drill).* `RevitEventHub` keeps Revit's dispatcher (it is made in `App.OnStartup`, on Revit's thread) and raises its `ExternalEvent` on it whoever enqueues; a raise Revit did not take is said in the Doctor log. `ReviewChangesetsCommand.Tell` and the picker's `Load` show a closed window's result through the plain `Enqueue(Action<UIApplication>)` — no DocPin, so no refusal to swallow. `Send`'s continuation catches a summary that throws and says it, with each result's own words. Review C1: the pane's view model keeps Revit's dispatcher from its making and `OnUi` uses it, never the caller's; `Tell` and `Load` queue the dialog before the Doctor line, each on its own; `Send`'s whole continuation sits inside a catch that says what threw in a dialog.

*Web (vitest; the drill).* `review-desk.ts`: `readDecided` (one `GET /changesets/:key`, kept: the reported ones, newest report first), `readLedger` (one `GET /cde/:key/audit` by changeset id → per report its `changeset_applied` row id and the newest `changeset_reverted` row — review C3), pure `decidedView` and `decidedCount`, and a `recent(decided, ledger)` block built once inside a catch (review C4) and appended to the desk's body in all three of its endings. **No bridge change** (founder decision F1 A): the 4100 bridge the founder restarted needs nothing more.

**Tech Stack:** C# add-in (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF); the offline check `tools/promote-check`; the web app (TypeScript, That Open, vitest 2). The Node bridge is read, not changed.

## Global Constraints

- Branch `feature/ma3b2b-desk-reasons` (it holds this plan, on `e411406`); merge `--no-ff` into master only after every task's checks pass **and the live drill MA3b2b is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **No network call on Revit's API thread, and no wait for one in the review**: no `GetAwaiter().GetResult()` and no `.Wait(` in `Commands.ReviewChangesets.cs` (§43 scans it). No new HTTP call in the add-in: the 409 re-read is the existing `FetchOne`, on the pool thread it already runs on.
  - **Nothing MA-3b and MA-3b2 hold is loosened**: the record before the send, one Apply per window, the guard (`Hold();` three times, `Release();` three times), `window.Say(` three times in the command, `UnreportedResults.Delete(` three times.
  - **Words are said, never silent.** A closed window's result reaches the Doctor log *and* a dialog; a raise Revit did not take is said; a summary that throws is said; a ledger row the desk could not read is said on each report (`ledger row not read — …`), never hidden and never a made-up id.
  - **Never a guess.** A 409 is "already taken" only when the stored result is this one (same ghosts, same note); anything else stays "the bridge refused it". The desk says `no reason given for this ghost` rather than inventing one.
  - **Claimed vs verified.** The desk's ledger id comes from the ledger read (the audit route), not from the changeset doc (it holds none).
  - **Text, never HTML (C13).** `review-desk.ts` contains no `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`; every new node is made by the panel's `el()` (it sets `textContent`).
  - **Every Revit write stays inside one TransactionGroup per Sentinel action (XC-2)**: this slice writes nothing to the model (a dialog; a queue).
  - **No bridge change, no new database table, no migration.**
- After the add-in task, the builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false` for 2022–2027. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (net48 has only `System`, `System.Collections.Generic`, `System.Linq` as global usings).
- Checks: from `WebApp`, `npx vitest run <files>`; from the repo root, `dotnet run --project tools/promote-check`. A full vitest run rewrites `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with LF only: when `git diff --ignore-all-space --stat` on it is empty, `git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by source scans and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100; never publish to the That Open platform (the publish is the founder's, after the merge).
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never print the founder's e-mail address (the desk shows `reported_by` on screen — a record of a web row says "the founder's account" or `<account>`, never the address; review C5: no screenshot of the desk, and the runner reads it only through the page script that masks addresses); never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Line numbers are `e411406`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs. A new file may be written with LF (git normalises it).

**Dry run (planner, 2026-10-04).** A detached worktree of `feature/ma3b2b-desk-reasons` at `e411406` in the session's scratchpad (`scratchpad/ma3b2b/dry`, `WebApp/node_modules` linked in as a junction; removed afterwards — never the repository). The brief asked for Tasks 1–2; **all four tasks' code** was applied, in order, **from this document's code blocks** (a script holds each block once; it applied them — each replace matched its text exactly once — and wrote them into this plan), each "see it fail" run before its code and each "see it pass" run after. Its totals — **superseded by the amender's run below**, which the steps now quote:
- Base, measured first: `promote-check` `756/756` (the brief said 695/695 — that was before MA-3b's and MA-3b2's reviews); `src/setups/review-desk.test.ts` `1 passed (1)` file, `10 passed (10)`.
- Task 1: `758/760 checks pass` (2 of §46's 4 fail on the old code) → `760/760 checks pass`.
- Task 2: `758/763 checks pass` (5 fail: the two rewritten lines of §43 and §47's three) → `763/763 checks pass`; `session-check` `47/47`, `docpin-check` `4/4`; builds with `-p:DeployToRevit=false`: 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — master's own counts.
- Task 3: `7 failed | 10 passed (17)` (`TypeError: decidedView is not a function`, and the like) → `1 passed (1)` file, `17 passed (17)`; `npx tsc --noEmit -p .` names no error in `review-desk.ts` or its test (master's 17 errors are elsewhere and unchanged).
- Task 4 (final): the full `npx vitest run` `143 passed (143)` files, `2332 passed | 1 skipped (2333)` (master 2325 + 7); `ids-cases.json` rewritten LF-only with no other change and restored; all 26 check projects: the 25 that count `2380/2380` (master 2373 + 7), `datum-check` `DATUM OK`.
- The drill's proxy script (set-up), on ports 4111 → a stand-in on 4112 with `SLOW_MS=1500`: a plain `POST …/result` passed at once; with `lose`, a GET passed, the first `POST …/result` reached the stand-in and its reply was dropped (curl exit 52, the proxy logged it), the second passed; with `slow`, a GET passed at once, the first `POST …/result` took 1.5 s, the second passed at once.
- Not run: the drill (Revit, the founder's local app) and the tasks' commit commands.

**Dry run again (amender, after review C1–C12, 2026-10-04).** The same way: a detached worktree of `feature/ma3b2b-desk-reasons` at `c1135c2` in `scratchpad/ma3b2b/dry` (`WebApp/node_modules` linked in as a junction; the junction, then the worktree, removed afterwards — never the repository), all four tasks' **amended** code applied in order from this document's code blocks by the same script (each replace matched exactly once), each "see it fail" run before its code and each "see it pass" after. The totals in the steps are this run's:
- Task 1: `757/762 checks pass` (5 fail: §43's C13 quote and four of §46's six) → `762/762 checks pass`.
- Task 2: `760/766 checks pass` (6 fail: the two rewritten lines of §43 and §47's four) → `766/766 checks pass`; `session-check` `47/47`, `docpin-check` `4/4`; builds with `-p:DeployToRevit=false`: 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — master's own counts (`OnUi` as an instance method compiles for every caller).
- Task 3: `9 failed | 10 passed (19)` → `1 passed (1)` file, `19 passed (19)`; `npx tsc --noEmit -p .` names no error in `review-desk.ts` or its test (the scratch tree shows one error more than the checkout, in `main.ts`: `./generated/fragments-worker` is a generated file a fresh worktree does not hold).
- Task 4 (final): the full `npx vitest run` `143 passed (143)` files, `2334 passed | 1 skipped (2335)` (master 2325 + 9); `ids-cases.json` rewritten LF-only with no other change and restored; all 26 check projects: the 25 that count `2383/2383` (master 2373 + 10), `datum-check` `DATUM OK`.
- Not run: the drill, the drill's proxy script again (unchanged), and the tasks' commit commands.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts. **F5 is not a default: it needs the founder's explicit words in chat.**

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | How the desk reads decided changesets and their ledger rows | **A:** no bridge change — one `GET /changesets/:key` (every status; the desk keeps the reported ones) and one `GET /cde/:key/audit` for the rows. **B:** the bridge's list takes a `status` list and a `limit` (one line, one vitest) — another bridge restart. **C:** the bridge stores the ledger id on the changeset (a second write after the audit row; reverses MA-3b's "on the reply only") | **A** — the 4100 bridge the founder already restarted serves the web rows as it is; the ceiling (the whole list is read to show ten) is said in the code and in Risks, and B is in Next for when it bites |
| F2 | How many reports the section shows | **A:** the newest 10, and a line saying so when there are more ("The newest 10 of 14 reports — the older ones are on the ledger."). **B:** all. **C:** paged | **A** — the desk is for what was just decided; the ledger holds the rest |
| F3 | A closed window's result when another model is in front (or its model is closed) | **A:** the dialog shows anyway, in whichever model is in front — its words name the changeset. **B:** keep the DocPin refusal and show it with the words | **A** — a dialog changes nothing in the model; the refusal was the hole (it was swallowed, so nothing showed) |
| F4 | When a decline's 409 is "already taken" | **A:** the changeset is `declined` and its stored result rejects the same ghosts with the same note — and, when it stored reasons, the same reasons (review C7). **B:** also the same reporter | **A** — the stored reporter is the bridge's resolved actor, the record holds none; B would read a true landing as "refused". Ceiling: another person's decline of the same ghosts with the same note and the same reasons (or with none stored) reads as this one — the changeset is declined either way, nothing is lost, and no other person's reason is counted as this reviewer's |
| F5 | The Revit rows of the drill: R-0 on the build Revit 2024 holds now (no deploy, but Revit pointed at the drill's proxy — review C2), then R-1 and R-2 on the branch build deployed to Revit 2024 | The founder's explicit OK in chat for this drill — one OK covers R-0, the deploy and the put-back — or the rows are **owed** | none — without the OK only the web rows run |

## Amendments to the brief's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (the scout, "three parallel status reads").** One read with no status, filtered on the desk (F1 A): the bridge's list reads every changeset of the project for any status anyway (`changesets-store.mjs listChangesets` filters after `docList`), so three reads would fetch the same rows three times.
- **S2 (the entry, "and the ledger id").** The stored changeset holds no ledger id (`changesets-store.mjs`: "on the reply only, never on the stored doc"). The desk reads it from the ledger (`GET /cde/:key/audit?entity_type=changeset&action_prefix=changeset_applied&entity_id=<ids>`); a report with no row found says `no ledger row found for it`, and a read that failed says `ledger row not read — <why>` on each report.
- **S3 (the entry, "each rejected ghost's reason").** `result.rejected` also holds ghosts Revit removed at commit and every ghost of a rolled-back Apply — not only the reviewer's declines. The desk calls them **not applied**, and a ghost with neither a Revit reason nor a web decline says `no reason given for this ghost` (the note above it may say why).
- **S4 (the brief, "find the root cause").** Not found offline — it cannot be: the hub and the pane are Revit-bound. The plan states four candidates (the fourth from review C1) and one observation gap (UNSURE 1), closes each candidate, binds drill row R-0 to read — on the build Revit holds before the deploy — which candidate it was (review C2), and R-1 to say whether the dialog shows with the fix. The fix is claimed until R-1 passes.
- **S5 (the brief, "adjust the MA-3b C1 check accordingly").** §42's C1 assertion still holds as written (its record rejects nothing); only its words change. The decline's cases are the new §46.
- **S6 (the scout, "`onRefused` shows the words anyway, or the plain Enqueue").** The plain `Enqueue(Action<UIApplication>)` (F3 A) — fewer words on screen, no second path.

## Review amendments (BINDING — the adversarial review of `c1135c2`; each is also written into the task, drill row or section it changes, and overrides any older text it contradicts)

**Critical**

- **C1 — a fourth cause of F-MA3b2-1: `Tell`'s own Doctor line can throw before the dialog is queued.** `Tell` called `App.PanelVm?.LogDoctor(…)` first, then `App.Events.Enqueue(…)`, on a pool thread. `LogDoctor` runs through `OnUi` (`SentinelPanelViewModel.cs:253`): `Application.Current?.Dispatcher ?? Dispatcher.CurrentDispatcher`. Inside Revit WPF usually has no `Application` (not verified on this PC — UNSURE 7); the fallback is then the pool thread's own new dispatcher, `CheckAccess()` is true, and `DoctorLog.Insert` runs on the pool thread — an `ObservableCollection` bound to a `ListBox` throws there. The exception left `Tell` before the `Enqueue` line: no dialog and no Doctor line. Bound (Task 2):
  - (a) the view model keeps `_ui = Dispatcher.CurrentDispatcher` from its making (`App.OnStartup`, Revit's thread); `OnUi` is an instance method on `_ui` and never falls back to the caller's dispatcher. **One change to the review's text:** off the thread it **posts** (`_ui.BeginInvoke`), it does not wait (`_ui.Invoke`) — see "Changed" below. The journey read's `var ui = …` in the same file (`:164`, "Same dispatcher OnUi uses") becomes `_ui` too, so the file holds no `Application.Current`.
  - (b) `Tell` queues the dialog first, then logs, each on its own: `if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words)); try { App.PanelVm?.LogDoctor("Review AI Proposals: " + words); } catch { }`. `Load`'s `picker.Gone` branch has the same order.
  - (c) `Send`'s whole continuation body is inside `try { … } catch (Exception ex) { App.Events.Enqueue(_ => TaskDialog.Show(Title, $"The report's result could not be shown — {ex.GetType().Name}: {ex.Message}\nRun Review AI Proposals to see what the bridge holds.")); }` (the summary's own catch stays inside it).
  - (d) §47 gains one check: the view model holds no `Application.Current` and one `CurrentDispatcher` (the field); `Tell`'s and `Load`'s `Enqueue` precede their `LogDoctor`; `Send`'s catch-all is there.
  - (e) Task 2's "What is known" lists this as candidate 5. The other four `Application.Current?.Dispatcher ?? CurrentDispatcher` sites (`App.cs:381`, `Coordination/GovernedNotify.cs:101`, `Engine/AutoPublish.cs:58`, `Updaters/FailureInterceptor.cs:41`) go to Next as an audit.

**Important**

- **C2 — the root cause is read without a second deploy: drill row R-0.** The build Revit 2024 holds now is pre-fix. R-0 runs R-1's steps once on it, before the branch deploy, under F5's same OK, as the first Revit row — proxy in `slow`, Revit in front, the Doctor log read. The log discriminates: a line naming `say the review's result` → the DocPin refusal (candidate 2); `A Sentinel action failed and was skipped` → the dialog job threw; the `Review AI Proposals: Applied…` line with no dialog → the raise was not taken (candidate 1); no words line at all → the summary or `Tell` threw (candidate 3 or 5). The three changesets are assigned: **R-0 takes GR-FFL, R-1 takes 01-FFL, R-2 declines MA0 Roof** (1 ghost). S4 and "Not settled" no longer say "settled only by a second deploy"; the merge message names the candidate R-0 showed; W-2's expected lines follow the new assignment.
- **C3 — a report undone in Revit says so on the desk.** W-1's first expected line (`01-FFL — applied … 40 applied`) was a statement the ledger contradicts (#1814: undone). `readLedger` asks `action_prefix=changeset_` (same ids, `limit=1000`) and returns `Map<string, LedgerRows>` — `{ row: number | null; reverted: { id: number; op: string } | null }`: `row` is the `changeset_applied` id, `reverted` the newest `changeset_reverted` row (rows arrive newest first; `op` from `new_value.op`). `decidedView` appends to the head ` · undone in Revit after the report (ledger #n)` for `undo`, ` · undone, then redone in Revit (ledger #n)` for `redo` (and, never a guess, ` · a changeset_reverted row follows the report (ledger #n)` for any other `op`). One vitest case. W-1 expects `… · ledger #1813 · undone in Revit after the report (ledger #1814)`. Added with it (the wider prefix made it possible): a ledger holding more `changeset_*` rows for the reports than one read returns is `not read — …`, never a cut read that says "no ledger row found". The item is removed from Next; its Risk is rewritten.
- **C4 — the new section cannot freeze the deciding desk.** `show()` builds the section once inside a catch — `` let tail: HTMLElement; try { tail = recent(decided, ledger); } catch (e) { tail = el("div", `Reports not shown — ${(e as Error).message}`, "color:#fca5a5"); } `` — and appends `tail` in its three endings (the scan counts them). `decidedView` is **total**: a result without `applied`/`rejected` lists, a reporter or a time is said with what it has (`?? []`, `an unknown account`, `an unknown time`). One vitest case on `result: { note: null }`.
- **C5 — the drill never carries the founder's address.** No screenshot in W-1/W-2. The runner reads the desk only through page script that returns `document.body.innerText.replace(/[^\s@]+@[^\s@]+/g, "<account>")` — no page-text or accessibility read of that tab, no screenshot. If the founder reads it instead, the record still writes `<account>`.
- **C6 — R-1 names two more failures.** Besides a dialog that shows only after a click: (i) the dialog shows but the Doctor log lacks `Review AI Proposals: Applied…` — C1's logging half is broken (`OnUi` did not reach the pane); (ii) neither shows by 120 s and a click changes nothing — the continuation died: look at `Send`'s catch-all (C1c), and the GET says whether the report landed.

**Minor**

- **C7 — "already taken" never counts another person's reasons as this reviewer's.** In `AlreadyTaken`'s decline branch, a stored result that holds a `reasons` object must equal the record's reasons as the bridge keeps them (`ChangesetTrust.DeclineReason` per guid — trimmed, a blank one dropped; ordinal); otherwise null (the 409 stands). A stored result with no `reasons` still matches (an older bridge; `ReasonsLine` then says fewer were kept). §46 gains the check (same ghosts and note; another text, another ghost, or reasons the record never sent → null). F4 A's words follow.
- **C8 — `DeclineLost` is not a guess.** It becomes `"Nothing in the model changed; the bridge may or may not have taken the decline — run Review AI Proposals: a changeset no longer listed was declined, one still listed is reviewed again."`; §43's C13 quote follows (Task 1).
- **C9 — E1 is a precaution, and says so.** `ExternalEvent.Raise()` is believed callable from any thread (not checked against Autodesk's documentation here), so candidate 1 is the least likely; the hop is safe (`window.Say` posts to the same dispatcher, proven live). Task 2's commit message and the design-doc line say "the hub's raise moved to Revit's thread (precaution; not shown to be the cause)" — unless R-0 shows the words line with no dialog, then the drill's record and the merge message say it was the cause.
- **C10 — `Gone` never asks a revert for a decline.** `Gone` tests `(r.Applied?.Count ?? 0) > 0 && AlreadyTaken(r, fresh) != null` — unreachable today (`Verified` reports a 0-of-0 record), now guarded. One §46 check.
- **C11 — the ledger read delays the proposed list**: one sentence in Risks.
- **C12 — R-1's "no mouse over Revit"** becomes "after ×, do not move the mouse or press a key" (the pointer ends over Revit when the window is closed).

**Changed while applying (the reason is the plan's, a reviewer may challenge it)**

- **C1a's `_ui.Invoke` is `_ui.BeginInvoke`.** The house rule this plan quotes says callers still wait with `GetResult` on Revit's thread. With `Invoke`, a pool thread that logs while Revit's thread waits for that pool thread would wait for Revit's thread in turn — a deadlock the old fallback (run on the caller's thread) could not have, and one this slice must not introduce for every `LogDoctor` caller in the add-in. Posting cannot deadlock; a caller already on Revit's thread still runs inline. Ceiling (Risks): a line from a pool thread shows a moment later.

**After the build (three reviews of `74fbf91`; all minor; fixed in one commit, each with its promote-check line)**

- **C13 — a window closed between `Tell`'s `Gone` check and the posted words gets the dialog too.** `Tell` (pool thread) read `window.Gone`, then `window.Say` posted to the window's dispatcher; closed in that gap, `Say`'s own `_gone` branch wrote the Doctor line only. `ChangesetReviewWindow.Say(string words, Action gone)` hands the words back when the window is gone, and `Tell` passes its closed-window path (a local `Closed()`: the two replacements, the dialog queued, then the Doctor line) — both orders end in one path. `Say(string)` is unchanged (the window's own interim words). §47 gains the scan. Ceiling (Risks): the picker's `SetEntries` has the same gap, Doctor line only.
- **C14 — a closed window's dialog never says "press Retry report".** A decline (or a result) refused with 401/403 ends `…as a contributor on this project, then press Retry report.`; with the window gone `Closed()` replaces `UnreportedResults.PressRetry` with `RunReview` (`, then run Review AI Proposals.`). §46 gains the check (the 401 decline's closed-window words hold no `Retry report`).
- **C15 — `DeclineLost` does not say a changeset no longer listed was declined** (supersedes C8's words). The picker lists proposed changesets only; one gone from it may have been withdrawn, or applied from another PC. It reads `"Nothing in the model changed; the bridge may or may not have taken the decline — run Review AI Proposals: a changeset no longer listed is no longer proposed — declined, unless it was withdrawn or applied meanwhile (the web desk's Recently decided in Revit lists what Revit reported); one still listed is reviewed again."`; §46's quote follows (§43's quotes its unchanged start).
- **C16 — §46's reasons check is tied to the wiring.** `StoredReply` + `ReasonsLine` alone passed on master. One more check: `if (taken != null) reply = UnreportedResults.StoredReply(stored);` lies after the every-409 condition and before the landed branch — it fails on the old condition (`r.Applied.Count > 0`).
- **Not changed:** `WebApp/package-lock.json` reads `1.0.30` against `package.json` `1.0.42` — stale since before this branch (Next: `npm install --package-lock-only`, its own commit). The review brief named scans this branch does not hold (PlacementBlock, a bridge test): F1 A, no bridge change — the slice's checks are §43 (C2/M3, C11, C13), §46, §47 and `review-desk.test.ts`.

**Rejected:** none.

**Checked by the review and found sound (unchanged):** the C# is net48-safe; no report is sent twice; no new `GetResult`/`Wait` in the review, no network call on the API thread, no model write (XC-2 untouched); every new web node goes through `el()`; the audit route takes a comma list of uuids and `limit=1000`; R-2's proxy logic (`once` resets on restart); two web rows; three items in one slice.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The hub raises on the dispatcher it was made on (`Dispatcher.CurrentDispatcher` in a field initialiser; `App.OnStartup` makes the hub on Revit's thread) | One place, every caller (`Commands.BcfIssues`, `NamingManager`, `Standards`, the review). A caller already on Revit's thread raises at once, as before. Review C9: a **precaution** — `Raise()` is believed callable from any thread, so candidate 1 is the least likely; the hop itself is safe (`window.Say` posts to the same dispatcher, proven live) |
| E2 | A `Denied`/`TimedOut` raise is logged, not retried | The job stays in the queue; the next accepted raise drains it. Ceiling: with no later raise it waits — said in the Doctor log |
| E3 | `Load` loses its `Document doc` parameter | Its only use was the DocPin of the dialog |
| E4 | The note is compared trimmed by .NET, the bridge trimmed by JavaScript | They differ on a few rare characters (a leading U+FEFF): such a note reads "refused", as every decline did before this slice |
| E5 | `decidedView` takes the ledger as `LedgerRows \| null \| Error` | Three different truths, three different words (S2); the rows are the report's and the newest Undo or Redo after it (review C3) |
| E6 | Each report is a closed `<details>` whose summary is the head line | Native; a storey's 48 rows do not flood the desk |
| E7 | `readLedger` asks `action_prefix=changeset_` with `limit=1000` and keeps, per changeset, the row whose action is exactly `changeset_applied` and the newest `changeset_reverted` row (review C3) | A result is written once; reverts arrive newest first. More `changeset_*` rows for the ten reports than one read returns (proposed, reviewed, re-opened, applied, reverted — far from 1000 for ten changesets) is said as `not read`, never a cut read |
| E8 | The time is the stored ISO time cut to minutes, with `UTC` | Pure and testable; no locale |
| E9 | `OnUi` posts to Revit's dispatcher (`BeginInvoke`) when called off it; the review asked for `Invoke` | See "Changed while applying": waiting for Revit's thread from a pool thread Revit's thread may be waiting on is a deadlock; posting is not. Inline on Revit's thread, as before |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `tools/promote-check/Ma3b2b.cs` (new) | 1, 2 | §46 (the decline's 409, its reasons, `Gone`'s guard, `DeclineLost` — pure) and §47 (the hub, the dialog, the summary, the pane's dispatcher and the order — scans) |
| `tools/promote-check/Check.cs` | 1, 2 | the two new sections' calls |
| `tools/promote-check/Ma3bDesk.cs` | 1, 2 | §42's C1 words; §43's C13 quote of `DeclineLost` (C8); §43's two lines that quote the dialog |
| `SentinelAddin/Engine/UnreportedResults.cs` | 1 | `AlreadyTaken`'s decline case with its reasons (C7); `Gone`'s guard (C10); `DeclineLost` (C8) |
| `SentinelAddin/Commands.ReviewChangesets.cs` | 1, 2 | the 409 re-read for every result; the dialog without DocPin, queued before the Doctor line (C1b); the summary's catch and the continuation's (C1c) |
| `SentinelAddin/RevitEventHub.cs` | 2 | the raise on Revit's thread, its result said |
| `SentinelAddin/UI/SentinelPanelViewModel.cs` | 2 | the pane's own dispatcher, kept from its making (C1a) |
| `WebApp/src/setups/review-desk.test.ts` | 3 | the decided section's words, reads and scans |
| `WebApp/src/setups/review-desk.ts` | 3 | `readDecided`, `readLedger` (+ the Undo after a report, C3), `decidedView` (total, C4), `decidedCount`, `recent`, `show()`'s guarded `tail` (C4) |
| `WebApp/package.json` | 3 | `1.0.41` → `1.0.42` |
| `docs/strategy/2026-09-30-model-automation-design.md` | 4 | what was built |

---

## Tasks (in order: the pure piece; the Revit wiring; the web desk; the words and the final checks. The merge follows the live drill)

### Task 1 — Pure: a decline the bridge already holds is taken

**Files:**
- Create: `tools/promote-check/Ma3b2b.cs`
- Modify: `tools/promote-check/Check.cs`, `tools/promote-check/Ma3bDesk.cs` (the C1 check's words, `:131`; the C13 check's quote of `DeclineLost`, `:299` — review C8)
- Modify: `SentinelAddin/Engine/UnreportedResults.cs` (`DeclineLost`, `:147`; `AlreadyTaken`, `:149–162`; `Gone`, `:179`), `SentinelAddin/Commands.ReviewChangesets.cs` (`:223–226`)

**Interfaces:**
- Consumes: `UnreportedResults.Record` (`Applied`, `Rejected`, `Note`, `Name`, `Reasons` — a `Dictionary<string, string>` or null), `ChangesetTrust.DeclineReason(string text, out string problem)` (the reason as the bridge keeps it; null when blank or refused), `ChangesetDto` (`Status`, `Result` — a `JsonElement?`), `UnreportedResults.StoredReply(ChangesetDto)`, `ChangesetTrust.ReasonsLine(string reply, int sent)`.
- Produces: `public static string AlreadyTaken(Record r, ChangesetDto fresh)` — unchanged signature; now also non-null for a record with no applied ghost when the stored changeset is `declined` with the same rejected set and note and — when the stored result holds reasons — the same reasons (C7). `Gone(Record, ChangesetDto, string)` keeps its signature and never answers Revert for a record with no applied ghost (C10). `DeclineLost` has new words (C8). Task 2 adds §47 to the file this task creates.

- [ ] **Step 1: Write the failing check.**

Create `tools/promote-check/Ma3b2b.cs`:

```csharp
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
           && UnreportedResults.DeclineLost == "Nothing in the model changed; the bridge may or may not have taken the decline — run Review AI Proposals: a changeset no longer listed was declined, one still listed is reviewed again.",
           "review C10, C8: a record that applied nothing never asks for a changeset_reverted row, though the bridge holds its decline; a decline whose window is closed is not said to stay proposed — the bridge may hold it");
        string review = Src("Commands.ReviewChangesets.cs");
        Ok(review.Contains("if (!landed && err != null && err.StartsWith(\"Bridge 409\", StringComparison.Ordinal))") && !review.Contains("!landed && r.Applied.Count > 0 && err != null")
           && UnreportedResults.Outcome("Bridge 409: {\"message\":\"changeset is declined — a result can be reported exactly once, from proposed\"}", 0).Words.StartsWith("the bridge refused it", StringComparison.Ordinal),
           "every 409 — a decline's too — is re-read before it is called refused; a 409 that is not this result still reads \"the bridge refused it\"");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b2WiringChecks();
```

with:

```csharp
        Ma3b2WiringChecks();
        Ma3b2bDeclineChecks();
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
"review C1: a result the bridge already holds with exactly the record's applied ghosts is taken (said); a proposed, withdrawn or different result, or no applied ghost, is not");
```

with:

```csharp
"review C1: a result the bridge already holds with exactly the record's applied ghosts is taken (said); a proposed, withdrawn or different result is not, nor a record that applied and rejected nothing (a decline: MA-3b2b, section 46)");
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           && UnreportedResults.DeclineLost == "Nothing in the model changed; the changeset stays proposed — review it again to decline it.",
           "review C13: a decline that did not land is lost with its window (E4) — said so, never 'Retry report sends it again' with no window left");
```

with:

```csharp
           && UnreportedResults.DeclineLost.StartsWith("Nothing in the model changed; the bridge may or may not have taken the decline", StringComparison.Ordinal),
           "review C13: a decline that did not land has no Retry report once its window is closed (E4) — said so, never 'Retry report sends it again' with no window left (MA-3b2b C8: nor 'stays proposed' — the bridge may hold it)");
```

- [ ] **Step 2: See it fail.** From the repo root: `dotnet run --project tools/promote-check`

Expected: `757/762 checks pass` — five FAIL lines: §43's `review C13: …` (its quote changed), and §46's `a decline whose stored result rejects the same ghosts with the same note …`, `review C7: …`, `review C10, C8: …` and `every 409 — a decline's too — is re-read before it is called refused …`.

- [ ] **Step 3: The code.**

In `SentinelAddin/Engine/UnreportedResults.cs`, replace:

```csharp
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
```

with:

```csharp
        /// timeout, Revit closed mid-report, or the audit row threw after the doc was written). Null otherwise — then the 409 stands.
        /// MA-3b2b: a result that applied nothing (Decline all, a rolled-back Apply) is taken when the changeset is declined and its stored
        /// result rejects exactly the record's ghosts with the record's note (the bridge stores it trimmed; none is none) and — review C7 —
        /// when it holds reasons, exactly the record's (each as the bridge keeps it: ChangesetTrust.DeclineReason; a blank one is not
        /// kept), so another person's reasons are never counted as this reviewer's. A stored result with no reasons still matches (a
        /// bridge before MA-3b2 keeps none; the caller's ReasonsLine then says fewer were kept than sent). Ceiling: another person's
        /// decline of the same ghosts with the same note and the same reasons (or none stored) reads as this one — nothing is lost, the
        /// changeset is declined either way; who reported it is not compared (the stored actor is the bridge's resolved one).</summary>
        public static string AlreadyTaken(Record r, ChangesetDto fresh)
        {
            if (r == null || fresh?.Status == null || fresh.Status == "proposed") return null;
            if (fresh.Result is not { ValueKind: JsonValueKind.Object } res) return null;
            string taken = $"\"{r.Name}\": the bridge had already taken it (its reply did not reach Revit) — {fresh.Status}; the bridge named no ledger row for it here.";
            if ((r.Applied?.Count ?? 0) == 0)
            {
                if (fresh.Status != "declined" || (r.Rejected?.Count ?? 0) == 0 || !res.TryGetProperty("rejected", out var rej) || rej.ValueKind != JsonValueKind.Array) return null;
                var declined = new HashSet<string>(rej.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()), StringComparer.Ordinal);
                string note = res.TryGetProperty("note", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : "";
                if (!declined.SetEquals(r.Rejected) || !string.Equals(note, (r.Note ?? "").Trim(), StringComparison.Ordinal)) return null;
                if (res.TryGetProperty("reasons", out var kept) && kept.ValueKind == JsonValueKind.Object)
                {
                    var mine = new Dictionary<string, string>(StringComparer.Ordinal);
                    foreach (var p in r.Reasons ?? new Dictionary<string, string>())
                        if (ChangesetTrust.DeclineReason(p.Value, out _) is { } why) mine[p.Key] = why;
                    var theirs = kept.EnumerateObject().ToList();
                    if (theirs.Count != mine.Count || theirs.Any(p => p.Value.ValueKind != JsonValueKind.String || !mine.TryGetValue(p.Name, out var why) || !string.Equals(why, p.Value.GetString(), StringComparison.Ordinal))) return null;
                }
                return taken;
            }
            if (!res.TryGetProperty("applied", out var a) || a.ValueKind != JsonValueKind.Array) return null;
            var took = new HashSet<string>(a.EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Object && x.TryGetProperty("proposal_guid", out var g) && g.ValueKind == JsonValueKind.String ? g.GetString() : null)
                .Where(g => g != null), StringComparer.Ordinal);
            return took.SetEquals(r.Applied.Select(x => x.ProposalGuid)) ? taken : null;
        }
```

In `SentinelAddin/Engine/UnreportedResults.cs`, replace:

```csharp
            if (AlreadyTaken(r, fresh) != null)
```

with:

```csharp
            // MA-3b2b review C10: only a result that applied something has an Undo to post — a decline the bridge holds (AlreadyTaken's
            // new case) never asks for a changeset_reverted row with no ghost.
            if ((r.Applied?.Count ?? 0) > 0 && AlreadyTaken(r, fresh) != null)
```

In `SentinelAddin/Engine/UnreportedResults.cs`, replace:

```csharp
        public const string DeclineLost = "Nothing in the model changed; the changeset stays proposed — review it again to decline it.";
```

with:

```csharp
        // MA-3b2b review C8: never "it stays proposed" — after a lost reply the bridge may hold the decline; the picker's list says which.
        public const string DeclineLost = "Nothing in the model changed; the bridge may or may not have taken the decline — run Review AI Proposals: a changeset no longer listed was declined, one still listed is reviewed again.";
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                    // exactly these ghosts is this result, landed earlier (re-read here, on this pool thread; FetchOne is an existing request).
                    string taken = null, unread = null;
                    if (!landed && r.Applied.Count > 0 && err != null && err.StartsWith("Bridge 409", StringComparison.Ordinal))
```

with:

```csharp
                    // exactly these ghosts is this result, landed earlier (re-read here, on this pool thread; FetchOne is an existing request).
                    // MA-3b2b: a decline too (it applied nothing) — one the bridge holds with the same rejected ghosts and note is taken.
                    string taken = null, unread = null;
                    if (!landed && err != null && err.StartsWith("Bridge 409", StringComparison.Ordinal))
```

What follows without another edit (read it, do not change it): a taken decline goes down the landed branch — `UnreportedResults.Delete` on a record that was never written is a no-op, `rep.Landed` counts it (so `Declined {n} of …` and the rolled-back path's `Reported as declined: …` count it), `ReasonsLine` counts the stored reasons (C15) — equal to the record's by review C7, or none on a bridge that kept none (said) — and `UndoWatcher.Land` with no applied guid posts nothing. A 409 that cannot be re-read keeps the decline in the window (`NotReRead(unread, 0)` ends with `Retry report sends it again.`).

- [ ] **Step 4: See it pass.** `dotnet run --project tools/promote-check` → `762/762 checks pass`.

- [ ] **Step 5: Commit.**

```bash
git add tools/promote-check/Ma3b2b.cs tools/promote-check/Check.cs tools/promote-check/Ma3bDesk.cs SentinelAddin/Engine/UnreportedResults.cs SentinelAddin/Commands.ReviewChangesets.cs
git commit -m "fix(addin): MA-3b2b - a decline the bridge already holds is taken, not refused: a 409 on a result that applied nothing is re-read, and a declined changeset whose stored result rejects the same ghosts with the same note (and the same reasons, when it stored any) is this decline, landed earlier (its reply was lost); a decline never asks for a changeset_reverted row; a closed window's unreported decline is no longer said to stay proposed - the bridge may hold it" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2 — Revit: a closed window's result reaches a dialog (F-MA3b2-1)

**What is known, and what is not.** In drill MA3b2 (Z-4) the window was closed while a 95-second report was out; the report landed (ledger #1813, #1814), the words reached the Doctor log (by the code: the log line is written before the dialog is queued), and no TaskDialog was seen. Nothing more was recorded. The candidates, none verified:

1. **The raise came from a pool thread.** `Tell` runs in `Send`'s continuation (`TaskScheduler.Default`). `RevitEventHub.Enqueue` called `_event.Raise()` right there and ignored its result. Every other hub caller raises from Revit's or a window's thread; the review's own Apply marshals its raise on purpose (`:500`, "ExternalEvent.Raise from the window's thread (Revit's), as every modeless window here raises it"). `Tell` (`:315`) and the picker's `Load` (`:112`) were the only pool-thread raises — and the only jobs that did not show.
2. **The refusal was swallowed.** The dialog was queued with a DocPin and an empty refusal callback (`_ => { }`): with another model in front, or this one closed, nothing showed. In Z-4 the model was probably in front, so this is a real hole but likely not Z-4's cause.
3. **The summary threw.** `Send`'s `words(t.Result)` runs unguarded; an exception there ends the continuation unobserved — no dialog, and no Doctor line either (which Z-4's record does not contradict: its "the Doctor log has the words" is read from the code, not from the screen).
4. *(An observation gap, not a cause.)* Revit was in the background for part of Z-4, and its owned windows hide from UI Automation there (MA3a's lesson): a dialog that did show may not have been seen.
5. **The Doctor line threw before the dialog was queued (review C1).** `Tell` logged first, on the pool thread. `LogDoctor` → `OnUi` took `Application.Current?.Dispatcher ?? Dispatcher.CurrentDispatcher`; with no WPF `Application` inside Revit (usual; not verified on this PC) that is the pool thread's own dispatcher, the insert into the bound `DoctorLog` ran right there and threw (`NotSupportedException`), and the exception left `Tell` before its `Enqueue` line — no dialog, no Doctor line, the continuation faulted unobserved. It fits Z-4 as well as 3 does, and needs no rare input.

This task closes 1–3 and 5. Drill row **R-0** runs the same steps on the build Revit holds before the deploy and reads which it was (review C2); R-1 runs on the branch's build with Revit in front (4) and reads the Doctor log.

**Files:**
- Modify: `tools/promote-check/Ma3b2b.cs` (§47), `tools/promote-check/Check.cs`, `tools/promote-check/Ma3bDesk.cs` (`:271`, `:288`)
- Modify: `SentinelAddin/RevitEventHub.cs` (`:1–23`), `SentinelAddin/UI/SentinelPanelViewModel.cs` (`:163–164`, `:253–258`), `SentinelAddin/Commands.ReviewChangesets.cs` (`:93`, `:97`, `:111–112`, `:314–315`, `:319–330`)

**Interfaces:**
- Consumes: `App.Events` (`RevitEventHub`), `App.PanelVm?.LogDoctor(string)`, `ExternalEvent.Raise()` → `ExternalEventRequest`.
- Produces: `RevitEventHub.Enqueue(Action<UIApplication>)` — same signature, callable from any thread; `Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away)` (no `Document`); `SentinelPanelViewModel.OnUi(Action)` — an instance method on the view model's own dispatcher: `LogDoctor(string, int)` keeps its signature, is safe from any thread, and off Revit's thread posts instead of waiting.

- [ ] **Step 1: Write the failing checks.**

In `tools/promote-check/Ma3b2b.cs`, replace:

```csharp
           "every 409 — a decline's too — is re-read before it is called refused; a 409 that is not this result still reads \"the bridge refused it\"");
    }
}
```

with:

```csharp
           "every 409 — a decline's too — is re-read before it is called refused; a 409 that is not this result still reads \"the bridge refused it\"");
    }

    // ── 47. MA-3b2b (F-MA3b2-1): the words of a report whose window is closed reach a dialog (source scans — Revit-bound; drill
    //        MA3b2b's row R-1 runs them) ─────────────────────────────────────────────────────────────────────────────────────────
    static void Ma3b2bWiringChecks()
    {
        Console.WriteLine("\nMA-3b2b — a closed window's result is said in a dialog (source scans)");
        string review = Src("Commands.ReviewChangesets.cs"), hub = Src("RevitEventHub.cs");
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
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b2bDeclineChecks();
```

with:

```csharp
        Ma3b2bDeclineChecks();
        Ma3b2bWiringChecks();
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           && review.Contains("App.Events.Enqueue(doc, \"say the review's result\", (_, _) => TaskDialog.Show(Title, words), _ => { });") && Count(review, "window.Say(") == 3
```

with:

```csharp
           && review.Contains("if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));") && Count(review, "window.Say(") == 3 // MA-3b2b: no DocPin, no swallowed refusal
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           && review.Contains("if (picker.Gone)") && review.Contains("App.Events.Enqueue(doc, \"say the review's result\", (_, _) => TaskDialog.Show(Title, rep.Text), _ => { });")
```

with:

```csharp
           && review.Contains("if (picker.Gone)") && review.Contains("App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text));") // MA-3b2b
```

- [ ] **Step 2: See them fail.** `dotnet run --project tools/promote-check`

Expected: `760/766 checks pass` — six FAIL lines: §43's `review C2, M3: …` and `review C11: …` (their quoted lines changed), and §47's four.

- [ ] **Step 3: The code.**

In `SentinelAddin/RevitEventHub.cs`, replace:

```csharp
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
```

with:

```csharp
using System.Windows.Threading;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
```

In `SentinelAddin/RevitEventHub.cs`, replace:

```csharp
    public RevitEventHub() => _event = ExternalEvent.Create(this);

    public void Enqueue(Action<UIApplication> action)
    {
        lock (_lock) _work.Enqueue(action);
        _event.Raise();
    }
```

with:

```csharp
    // MA-3b2b (F-MA3b2-1): Revit's own thread — the hub is made in App.OnStartup, on it.
    private readonly Dispatcher _ui = Dispatcher.CurrentDispatcher;

    public RevitEventHub() => _event = ExternalEvent.Create(this);

    public void Enqueue(Action<UIApplication> action)
    {
        lock (_lock) _work.Enqueue(action);
        // MA-3b2b (F-MA3b2-1): a report's continuation enqueues from a pool thread — the only callers that did, and the one job that
        // did not show (drill MA3b2, Z-4). Every raise now happens on Revit's thread, as every modeless window here raises.
        if (_ui.CheckAccess()) Raise();
        else _ui.BeginInvoke(new Action(Raise));
    }

    private void Raise()
    {
        var raised = _event.Raise();
        if (raised != ExternalEventRequest.Denied && raised != ExternalEventRequest.TimedOut) return;
        // Said, never silent: the job is still in the queue and runs when Revit takes a later raise.
        try { App.PanelVm?.LogDoctor($"Revit did not take a Sentinel action ({raised}) — it stays queued and runs with the next one."); }
        catch { /* the pane itself is gone */ }
    }
```

In `SentinelAddin/UI/SentinelPanelViewModel.cs`, replace:

```csharp
        // Same dispatcher OnUi uses: the pane's (WPF application) dispatcher when there is one.
        var ui = Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
```

with:

```csharp
        // Same dispatcher OnUi uses: Revit's own (MA-3b2b review C1).
        var ui = _ui;
```

In `SentinelAddin/UI/SentinelPanelViewModel.cs`, replace:

```csharp
    private static void OnUi(Action a)
    {
        var d = Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        if (d.CheckAccess()) a();
        else d.Invoke(a);
    }
```

with:

```csharp
    // MA-3b2b review C1: Revit's own thread — the view model is made in App.OnStartup, on it. Never the caller's dispatcher: inside
    // Revit WPF has no Application, and the fallback (the calling pool thread's own new dispatcher) ran the action right there — an
    // insert into the bound Doctor log throws on any thread but this one. Posted, not waited for: a caller on a pool thread that
    // Revit's thread is waiting on (GetResult) must not wait for Revit's thread in turn.
    private readonly System.Windows.Threading.Dispatcher _ui = System.Windows.Threading.Dispatcher.CurrentDispatcher;

    private void OnUi(Action a)
    {
        if (_ui.CheckAccess()) a();
        else _ui.BeginInvoke(a);
    }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    private static void Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away, Document doc) => Task.Run(async () =>
```

with:

```csharp
    private static void Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away) => Task.Run(async () =>
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
string.Join("\n", away.Select(r => $"\"{r.Name}\" in {r.Doc}. {UnreportedResults.DeleteOnce(r)}")), doc);
```

with:

```csharp
string.Join("\n", away.Select(r => $"\"{r.Name}\" in {r.Doc}. {UnreportedResults.DeleteOnce(r)}")));
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                    App.PanelVm?.LogDoctor("Review AI Proposals: " + rep.Text);
                    App.Events.Enqueue(doc, "say the review's result", (_, _) => TaskDialog.Show(Title, rep.Text), _ => { });
```

with:

```csharp
                    App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text)); // MA-3b2b: no DocPin, and queued before the Doctor line — see Tell
                    try { App.PanelVm?.LogDoctor("Review AI Proposals: " + rep.Text); } catch { }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
            App.PanelVm?.LogDoctor("Review AI Proposals: " + words);
            if (!interim) App.Events.Enqueue(doc, "say the review's result", (_, _) => TaskDialog.Show(Title, words), _ => { });
```

with:

```csharp
            // MA-3b2b (F-MA3b2-1): a dialog changes nothing in the model, so it needs no DocPin — whose refusal (another model in front,
            // this one closed) was swallowed here, and the result never shown. Said in whichever model is in front. Review C1: queued
            // before the Doctor line, which stands on its own — a pane that throws (this is a pool thread) cannot take the dialog with it.
            if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));
            try { App.PanelVm?.LogDoctor("Review AI Proposals: " + words); } catch { }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
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
```

with:

```csharp
            // MA-3b2b review C1: nothing in this continuation may end it unobserved — whatever throws is said in a dialog.
            try
            {
                if (t.Status != TaskStatus.RanToCompletion)
                {
                    Tell("Reporting failed — " + (t.Exception?.GetBaseException().Message ?? "it did not finish") +
                         $"\nA result Revit applied is kept on this PC ({UnreportedResults.Root}) and sent again by the next Review AI Proposals.");
                    return;
                }
                left = t.Result.Left;
                // MA-3b2b (F-MA3b2-1): a summary that throws is said, with each result's own words (its ledger row, what is kept) after it.
                string said;
                try { said = words(t.Result); }
                catch (Exception ex) { said = $"The report's summary could not be built — {ex.GetType().Name}: {ex.Message}"; }
                Tell(said + (t.Result.Words.Count > 0 ? "\n\n" + t.Result.Text : ""));
                window.Retry(left.Count > 0);
            }
            catch (Exception ex) { App.Events.Enqueue(_ => TaskDialog.Show(Title, $"The report's result could not be shown — {ex.GetType().Name}: {ex.Message}\nRun Review AI Proposals to see what the bridge holds.")); }
        }, TaskScheduler.Default);
```

- [ ] **Step 4: See them pass, and the builds.** `dotnet run --project tools/promote-check` → `766/766 checks pass`. `dotnet run --project tools/session-check` → `47/47 checks pass`. Then, each with `-p:DeployToRevit=false`:

```bash
for v in 2022 2023 2024 2025 2026 2027; do printf "$v: "; dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Warning\(s\)|Error\(s\)|error CS" | sort -u | tr '\n' ' '; echo; done
```

Expected: `0 Error(s)` six times; warnings 2022 `3`, 2023 `3`, 2024 `5`, 2025 `1`, 2026 `1`, 2027 `3` (master's counts).

- [ ] **Step 5: Commit.**

```bash
git add tools/promote-check/Ma3b2b.cs tools/promote-check/Check.cs tools/promote-check/Ma3bDesk.cs SentinelAddin/RevitEventHub.cs SentinelAddin/UI/SentinelPanelViewModel.cs SentinelAddin/Commands.ReviewChangesets.cs
git commit -m "fix(addin): MA-3b2b - a closed window's result reaches a dialog (F-MA3b2-1): the dialog is queued before the Doctor line, and the pane's view model uses Revit's own dispatcher, never the caller's (on a pool thread the insert into the bound log could throw before the dialog was queued); the dialog needs no DocPin, so no refusal is swallowed; a summary that throws is said with each result's own words, and a continuation that throws anywhere says so in a dialog; the hub's raise moved to Revit's thread (precaution; not shown to be the cause) and a raise Revit did not take is said. Root cause claimed, not verified - drill MA3b2b R-0 reads it, R-1 proves the fix" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3 — Web: "Recently decided in Revit" on the review desk

**Files:**
- Modify: `WebApp/src/setups/review-desk.test.ts` (the import at `:11`; a new `describe` before the Refresh scan at `:103`)
- Modify: `WebApp/src/setups/review-desk.ts` (the header comment; `PendingChangeset` at `:21`; `readPending` at `:80–88`; the panel: `recent` after `let seq = 0;`, `show()` at `:169–175` and its end)
- Modify: `WebApp/package.json:3`

**Interfaces:**
- Consumes: `bfetch(url)` (`./bridge-fetch`, mocked in the test), `ghostLine(el)`, the panel's `el(tag, text, css)` (it sets `textContent`), the fixture `bridge/fixtures/changeset-ops/ma3a-review.json` (`after`, `revit_reasons.result`, `revit_reasons.stored`). The bridge, unchanged: `GET /changesets/:key` → the changesets, each with `result` (`applied[]`, `rejected[]`, `note`, `reported_at`, `reported_by`, `declined_on_web[]`, `reasons?`); `GET /cde/:key/audit?…` → `{ rows: [{ id, entity_id, action, new_value, … }], total }`, newest first (`changeset_reverted` rows carry `new_value.op`: `undo` or `redo`).
- Produces: `export interface DeskResult`, `export interface DecidedView { head: string; note: string | null; declined: { line: string; why: string[] }[] }`, `export const DECIDED_MAX = 10`, `export async function readDecided(base: string, key: string): Promise<PendingChangeset[]>`, `export interface LedgerRows { row: number | null; reverted: { id: number; op: string } | null }` (C3), `export async function readLedger(base: string, key: string, ids: string[]): Promise<Map<string, LedgerRows>>`, `export const decidedCount: (n: number) => string`, `export function decidedView(cs: PendingChangeset, ledger: LedgerRows | null | Error): DecidedView` (total — C4); `readPending` keeps its signature.

- [ ] **Step 1: Write the failing tests.**

In `WebApp/src/setups/review-desk.test.ts`, replace:

```ts
import { storeyOf, groupDesk, ghostLine, reviewWords, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset } from "./review-desk";
```

with:

```ts
import { storeyOf, groupDesk, ghostLine, reviewWords, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset,
  readDecided, readLedger, decidedView, decidedCount, DECIDED_MAX, type LedgerRows } from "./review-desk";
```

In `WebApp/src/setups/review-desk.test.ts`, replace:

```ts
describe("↻ Refresh re-reads the desk without reloading the site (source scan: no DOM here)", () => {
```

with:

```ts
describe("recently decided in Revit (MA-3b2b)", () => {
  const rr = fx.revit_reasons;
  const reported = (id: string, status: string, reported_at: string): PendingChangeset => ({
    ...after, id, status,
    result: {
      applied: rr.result.applied, rejected: rr.result.rejected, note: rr.result.note, reported_at, reported_by: "modeller@example.com",
      declined_on_web: [
        { proposal_guid: "g-1", by: "reviewer@example.com", role: "contributor", reason: "wrong type: W 1 is a party wall" },
        { proposal_guid: "g-4", by: "reviewer@example.com", role: "contributor", reason: "no fire strategy issued yet" },
      ],
      reasons: rr.stored,
    },
  });
  const A = "0b0f6c1e-8a59-4d0a-9d6e-3f1f2a6c7e11", B = "7c2d9a40-11aa-4e0b-8a77-5d3e9f0c2b22";
  const cs = reported(A, "partially_applied", "2026-10-04T13:44:10.123Z");
  const row = (n: number): LedgerRows => ({ row: n, reverted: null });
  beforeEach(() => { bfetch.mockReset(); });

  it("a reported changeset in words: who, when, the counts, the ledger row, the note, and each ghost not applied with Revit's reason and the web's", () => {
    const v = decidedView(cs, row(1811));
    expect(v.head).toBe("Promote (DD) · GR-FFL — partially applied in Revit by modeller@example.com · 2026-10-04 13:44 UTC · 1 applied, 3 not applied · ledger #1811");
    expect(v.note).toBe("GR-FFL reviewed in Revit");
    expect(v.declined).toEqual([
      { line: "W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm", why: ["Revit: a party wall, as the web desk said", "web, reviewer@example.com (contributor): wrong type: W 1 is a party wall"] },
      { line: "W 2 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm", why: ["Revit: W 2 is demolished in the next package"] },
      { line: 'Basic Wall : BDS_EXT_ARC_CMU_200 mm · FireRating "" → "60 min" (a type edit: it reaches every element of the type)', why: ["web, reviewer@example.com (contributor): no fire strategy issued yet"] },
    ]);
  });

  it("claimed vs verified: a ledger row that was not found or not read is said, never a made-up id; a ghost with no reason says so", () => {
    expect(decidedView(cs, null).head).toMatch(/ · no ledger row found for it$/);
    expect(decidedView(cs, new Error("not read — HTTP 500")).head).toMatch(/ · ledger row not read — HTTP 500$/);
    const bare = decidedView({ ...cs, status: "declined", result: { ...cs.result!, applied: [], rejected: ["g-2", "constructor"], note: null, reported_at: "", declined_on_web: undefined, reasons: undefined } }, row(7));
    expect(bare.head).toBe("Promote (DD) · GR-FFL — declined in Revit by modeller@example.com · an unknown time · 0 applied, 2 not applied · ledger #7");
    expect(bare.note).toBeNull();
    expect(bare.declined).toEqual([{ line: "W 1 · GR-FFL → top 01-FFL", why: ["no reason given for this ghost"] }, { line: "constructor", why: ["no reason given for this ghost"] }]);
  });

  it("review C3: a report undone in Revit says so, with the ledger row that says it — never 'applied' alone", () => {
    const done = { ...cs, status: "applied" };
    expect(decidedView(done, { row: 1813, reverted: { id: 1814, op: "undo" } }).head).toMatch(/ · ledger #1813 · undone in Revit after the report \(ledger #1814\)$/);
    expect(decidedView(done, { row: 1813, reverted: { id: 1816, op: "redo" } }).head).toMatch(/ · ledger #1813 · undone, then redone in Revit \(ledger #1816\)$/);
    expect(decidedView(done, { row: 1813, reverted: { id: 1817, op: "" } }).head).toMatch(/ · ledger #1813 · a changeset_reverted row follows the report \(ledger #1817\)$/);
    expect(decidedView(done, { row: null, reverted: { id: 1814, op: "undo" } }).head).toMatch(/ · no ledger row found for it · undone in Revit after the report \(ledger #1814\)$/);
  });

  it("review C4: an old or hand-written result (no lists, no reporter) is still said — the view never throws", () => {
    const v = decidedView({ ...cs, result: { note: null } as never }, null);
    expect(v.head).toBe("Promote (DD) · GR-FFL — partially applied in Revit by an unknown account · an unknown time · 0 applied, 0 not applied · no ledger row found for it");
    expect(v.note).toBeNull();
    expect(v.declined).toEqual([]);
  });

  it("C13: a reason is text — markup typed in Revit comes back as the same characters, for textContent", () => {
    const v = decidedView({ ...cs, result: { ...cs.result!, reasons: { "g-3": '<b onclick="x()">not this</b>' } } }, row(1));
    expect(v.declined[1].why).toEqual(['Revit: <b onclick="x()">not this</b>']);
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });

  it("the heading says how many reports are shown", () => {
    expect(DECIDED_MAX).toBe(10);
    expect(decidedCount(3)).toBe("3 report(s), newest first.");
    expect(decidedCount(14)).toBe("The newest 10 of 14 reports — the older ones are on the ledger.");
  });

  it("readDecided reads every changeset and keeps the reported ones, newest report first; a failure is 'not read — …'", async () => {
    const older = reported(B, "declined", "2026-10-04T09:00:00.000Z");
    bfetch.mockResolvedValueOnce(res(200, [after, older, { ...after, id: "w", status: "withdrawn" }, cs]));
    expect((await readDecided("http://b/", "demo")).map((c) => c.id)).toEqual([A, B]);
    expect(bfetch.mock.calls[0][0]).toBe("http://b/changesets/demo");
    bfetch.mockResolvedValueOnce(res(403, { message: "not a member" }));
    await expect(readDecided("http://b", "demo")).rejects.toThrow("not read — not a member");
  });

  it("readLedger asks the ledger for the reports' rows by changeset id — the report's row and the newest Undo or Redo after it (C3); none asked is no read; a failure is 'not read — …'", async () => {
    expect((await readLedger("http://b", "demo", [])).size).toBe(0);
    expect(bfetch).not.toHaveBeenCalled();
    bfetch.mockResolvedValueOnce(res(200, { rows: [
      { id: 1816, entity_id: B, action: "changeset_reverted", new_value: { op: "redo", guids: ["g-2"], count: 1 } },
      { id: 1814, entity_id: B, action: "changeset_reverted", new_value: { op: "undo", guids: ["g-2"], count: 1 } },
      { id: 1813, entity_id: B, action: "changeset_applied" }, { id: 1811, entity_id: A, action: "changeset_applied" },
      { id: 1805, entity_id: A, action: "changeset_reviewed" }, { id: 1800, entity_id: A, action: "changeset_proposed" }], total: 6 }));
    expect([...(await readLedger("http://b/", "demo key", [A, B]))]).toEqual([[B, { row: 1813, reverted: { id: 1816, op: "redo" } }], [A, { row: 1811, reverted: null }]]);
    expect(bfetch.mock.calls[0][0]).toBe(`http://b/cde/demo%20key/audit?entity_type=changeset&action_prefix=changeset_&entity_id=${A},${B}&limit=1000`);
    bfetch.mockResolvedValueOnce(res(200, { rows: [{ id: 1811, entity_id: A, action: "changeset_applied" }], total: 1200 }));
    await expect(readLedger("http://b", "demo", [A])).rejects.toThrow("not read — the ledger holds more rows for these reports (1200) than one read returns");
    bfetch.mockResolvedValueOnce(res(400, { message: "entity_id must be a uuid or a comma list of uuids" }));
    await expect(readLedger("http://b", "demo", ["x"])).rejects.toThrow("not read — entity_id must be a uuid or a comma list of uuids");
    bfetch.mockResolvedValueOnce(res(200, { total: 0 }));
    await expect(readLedger("http://b", "demo", [A])).rejects.toThrow("not read — the bridge answered without rows");
  });

  it("the desk reads the decided list beside the proposed one, Refresh re-reads both, and the section shows when nothing waits (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("const [role, pending, decided] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e), readDecided(base, key).catch((e: Error) => e)]);");
    // Review C4: the section is built once, and a throw in it is said — it never takes the proposed list with it.
    expect(src).toContain('try { tail = recent(decided, ledger); } catch (e) { tail = el("div", `Reports not shown — ${(e as Error).message}`, "color:#fca5a5"); }');
    expect(src).toContain('if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5"), tail); return; }');
    expect(src).toContain('if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project."), tail); return; }');
    expect(src).toContain("    body.append(tail);");
    expect(src.split("recent(decided, ledger)").length - 1).toBe(1);
    expect(src.split(/\btail\b/).length - 1).toBe(6); // declared, set twice, shown in each of the desk's three endings
  });
});

describe("↻ Refresh re-reads the desk without reloading the site (source scan: no DOM here)", () => {
```

- [ ] **Step 2: See them fail.** From `WebApp`: `npx vitest run src/setups/review-desk.test.ts`

Expected: `9 failed | 10 passed (19)` — `TypeError: decidedView is not a function` (and `readDecided`, `readLedger`, `decidedCount`; the scan's missing lines).

- [ ] **Step 3: The code, and the version.**

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
export interface PendingChangeset { id: string; name: string; source: string; claimed?: boolean; status: string; created_at: string; review_rev?: number; elements: Ghost[]; }
```

with:

```ts
/** What Revit reported on a changeset (bridge reportResult). `reasons` — Revit's reason per ghost — is there only when one was sent. */
export interface DeskResult {
  applied: { proposal_guid: string }[]; rejected: string[]; note: string | null; reported_at: string; reported_by: string;
  declined_on_web?: { proposal_guid: string; by: string; role: string; reason: string }[];
  reasons?: Record<string, string>;
}
export interface PendingChangeset { id: string; name: string; source: string; claimed?: boolean; status: string; created_at: string; review_rev?: number; elements: Ghost[]; result?: DeskResult | null; }
export interface DecidedView { head: string; note: string | null; declined: { line: string; why: string[] }[]; }
/** A report's ledger rows: its changeset_applied row, and the newest changeset_reverted row after it (an Undo or a Redo in Revit). */
export interface LedgerRows { row: number | null; reverted: { id: number; op: string } | null; }
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
/** GET /changesets/:key?status=proposed. Any failure throws "not read — <why>", never an empty list. */
export async function readPending(base: string, key: string): Promise<PendingChangeset[]> {
  let r: Response;
  try { r = await bfetch(at(base, key, "?status=proposed")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as PendingChangeset[] | { message?: string } | null;
  if (!r.ok || !Array.isArray(j)) throw new Error(`not read — ${(j as { message?: string } | null)?.message || (r.ok ? "the bridge answered without a list" : `HTTP ${r.status}`)}`);
  return j;
}
```

with:

```ts
async function readList(url: string): Promise<PendingChangeset[]> {
  let r: Response;
  try { r = await bfetch(url); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as PendingChangeset[] | { message?: string } | null;
  if (!r.ok || !Array.isArray(j)) throw new Error(`not read — ${(j as { message?: string } | null)?.message || (r.ok ? "the bridge answered without a list" : `HTTP ${r.status}`)}`);
  return j;
}

/** GET /changesets/:key?status=proposed. Any failure throws "not read — <why>", never an empty list. */
export const readPending = (base: string, key: string): Promise<PendingChangeset[]> => readList(at(base, key, "?status=proposed"));

// ── MA-3b2b: recently decided in Revit — what Revit reported, with its reason per ghost. Read-only; every string here is rendered
//    with textContent (a reason is free text typed in Revit — MA-3b2 review C13). ──

/** How many reports the desk shows, newest first; decidedCount says when there are more. */
export const DECIDED_MAX = 10;
const DECIDED: Record<string, string> = { applied: "applied", partially_applied: "partially applied", declined: "declined" };

/** GET /changesets/:key — every changeset (the bridge's list takes one status or none); kept: the ones Revit reported, newest report
 *  first. Any failure throws "not read — <why>". ponytail: the whole list is read to show ten; a bridge `status` list + `limit` when a
 *  project's list grows heavy (Next). */
export async function readDecided(base: string, key: string): Promise<PendingChangeset[]> {
  return (await readList(at(base, key)))
    .filter((c) => c.status in DECIDED && !!c.result)
    .sort((a, b) => { const x = a.result!.reported_at ?? "", y = b.result!.reported_at ?? ""; return x < y ? 1 : x > y ? -1 : 0; });
}

/** The ledger rows of the reports (the stored changeset holds no row id): GET /cde/:key/audit by changeset id → per changeset, its
 *  changeset_applied row and (review C3) the newest changeset_reverted row — rows come newest first, so the first one seen. No id
 *  asked is no read. Any failure throws "not read — <why>" — the desk then says the row was not read, never a made-up id; so does a
 *  ledger holding more changeset_* rows for these reports than one read returns (1000): a cut read could miss a report's row. */
export async function readLedger(base: string, key: string, ids: string[]): Promise<Map<string, LedgerRows>> {
  if (!ids.length) return new Map();
  let r: Response;
  try { r = await bfetch(`${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/audit?entity_type=changeset&action_prefix=changeset_&entity_id=${ids.map(encodeURIComponent).join(",")}&limit=1000`); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { rows?: { id: number; entity_id: string; action: string; new_value?: { op?: unknown } | null }[]; total?: number; message?: string } | null;
  if (!r.ok || !Array.isArray(j?.rows)) throw new Error(`not read — ${j?.message || (r.ok ? "the bridge answered without rows" : `HTTP ${r.status}`)}`);
  if ((j.total ?? 0) > j.rows.length) throw new Error(`not read — the ledger holds more rows for these reports (${j.total}) than one read returns`);
  const out = new Map<string, LedgerRows>();
  for (const x of j.rows) {
    if (x.action !== "changeset_applied" && x.action !== "changeset_reverted") continue;
    const e = out.get(x.entity_id) ?? { row: null, reverted: null };
    if (x.action === "changeset_applied") e.row = x.id;
    else if (!e.reverted) e.reverted = { id: x.id, op: typeof x.new_value?.op === "string" ? x.new_value.op : "" };
    out.set(x.entity_id, e);
  }
  return out;
}

/** "3 report(s), newest first." — or that only the newest DECIDED_MAX are shown. */
export const decidedCount = (n: number): string =>
  n > DECIDED_MAX ? `The newest ${DECIDED_MAX} of ${n} reports — the older ones are on the ledger.` : `${n} report(s), newest first.`;

/** One reported changeset in words. `ledger`: its rows; null when the ledger read found none; the Error of a read that failed.
 *  Each ghost the result did not apply carries Revit's reason (result.reasons) and the web's (declined_on_web) — or says it has none.
 *  Review C3: a report undone in Revit says so (the ledger's changeset_reverted row), never "applied" alone. Review C4: total — a
 *  result without its lists, its reporter or its time (an old or hand-written one) is said with what it has, never thrown. */
export function decidedView(cs: PendingChangeset, ledger: LedgerRows | null | Error): DecidedView {
  const r: Partial<DeskResult> = cs.result ?? {};
  const applied = r.applied ?? [], rejected = r.rejected ?? [], when = r.reported_at ?? "";
  const at = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(when) ? `${when.slice(0, 10)} ${when.slice(11, 16)} UTC` : "an unknown time";
  const rev = ledger instanceof Error ? null : ledger?.reverted ?? null;
  const row = (ledger instanceof Error ? `ledger row ${ledger.message}` : ledger?.row != null ? `ledger #${ledger.row}` : "no ledger row found for it")
    + (!rev ? "" : rev.op === "undo" ? ` · undone in Revit after the report (ledger #${rev.id})` : rev.op === "redo" ? ` · undone, then redone in Revit (ledger #${rev.id})`
      : ` · a changeset_reverted row follows the report (ledger #${rev.id})`);
  const byGuid = new Map((cs.elements ?? []).map((e) => [e.proposal_guid, e]));
  const web = new Map((r.declined_on_web ?? []).map((d) => [d.proposal_guid, d]));
  const revit = (g: string): string | null => (r.reasons && Object.prototype.hasOwnProperty.call(r.reasons, g) ? r.reasons[g] : null);
  return {
    head: `${cs.name} — ${DECIDED[cs.status] ?? cs.status} in Revit by ${r.reported_by || "an unknown account"} · ${at} · ${applied.length} applied, ${rejected.length} not applied · ${row}`,
    note: r.note ?? null,
    declined: rejected.map((g) => {
      const el = byGuid.get(g), w = web.get(g), why: string[] = [];
      if (revit(g)) why.push(`Revit: ${revit(g)}`);
      if (w) why.push(`web, ${w.by} (${w.role}): ${w.reason}`);
      return { line: el ? ghostLine(el) : g, why: why.length ? why : ["no reason given for this ghost"] };
    }),
  };
}
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
  let seq = 0;

  const decide = async
```

with:

```ts
  let seq = 0;

  // MA-3b2b: what Revit reported, under the proposed list. Every node is made by el() — textContent, never markup (C13).
  const recent = (decided: PendingChangeset[] | Error, ledger: Map<string, LedgerRows> | Error): HTMLElement => {
    const box = el("div", "", "margin-top:.9rem;border-top:1px solid #2a2a30;padding-top:.5rem");
    box.append(el("div", "Recently decided in Revit", "font-weight:600"));
    if (decided instanceof Error) { box.append(el("div", `Reports ${decided.message}`, "color:#fca5a5")); return box; }
    if (!decided.length) { box.append(el("div", "Revit has reported no changeset on this project.", "color:#8b93a1")); return box; }
    box.append(el("div", decidedCount(decided.length), "color:#8b93a1"));
    for (const cs of decided.slice(0, DECIDED_MAX)) {
      const v = decidedView(cs, ledger instanceof Error ? ledger : ledger.get(cs.id) ?? null);
      const one = el("details", "", "margin:.4rem 0;border:1px solid #2a2a30;border-radius:.35rem;padding:.3rem .5rem");
      one.append(el("summary", v.head, "cursor:pointer"));
      one.append(el("div", v.note ? `Note: ${v.note}` : "No note.", "margin:.3rem 0;color:#8b93a1"));
      if (v.declined.length) one.append(el("div", `Not applied (${v.declined.length}):`, "margin:.3rem 0 .1rem;color:#8b93a1"));
      for (const g of v.declined) {
        const row = el("div", "", "padding:.15rem 0");
        row.append(el("div", g.line), ...g.why.map((w) => el("div", w, "color:#fca5a5")));
        one.append(row);
      }
      box.append(one);
    }
    return box;
  };

  const decide = async
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
    const [role, pending] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e)]);
    if (mine !== seq) return;
```

with:

```ts
    const [role, pending, decided] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e), readDecided(base, key).catch((e: Error) => e)]);
    if (mine !== seq) return;
    // MA-3b2b: the ledger rows of the reports shown — a read of its own, so a ledger that cannot be read is said on each report.
    const ledger = decided instanceof Error ? new Map<string, LedgerRows>() : await readLedger(base, key, decided.slice(0, DECIDED_MAX).map((c) => c.id)).catch((e: Error) => e);
    if (mine !== seq) return;
    // Review C4: built once, and a throw in it is said — it never leaves the desk at "Reading…" or takes the proposed list with it.
    let tail: HTMLElement;
    try { tail = recent(decided, ledger); } catch (e) { tail = el("div", `Reports not shown — ${(e as Error).message}`, "color:#fca5a5"); }
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
    if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5")); return; }
    if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project.")); return; }
```

with:

```ts
    if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5"), tail); return; }
    if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project."), tail); return; }
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
      body.append(box);
    }
  }
  onActiveProjectChange(() => void show());
```

with:

```ts
      body.append(box);
    }
    body.append(tail);
  }
  onActiveProjectChange(() => void show());
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
// not read says "not read — …", never that nothing waits. No 3D here: ghosts in the viewer are MA-3d.
```

with:

```ts
// not read says "not read — …", never that nothing waits. No 3D here: ghosts in the viewer are MA-3d.
// MA-3b2b: under it, "Recently decided in Revit" — the changesets Revit reported (a second read beside the proposed one), each with
// who, when, the note, its ledger row (and the row of an Undo in Revit after it) and every ghost it did not apply with Revit's reason (result.reasons) and the web's.
```

In `WebApp/package.json`, replace:

```json
  "version": "1.0.41",
```

with:

```json
  "version": "1.0.42",
```

- [ ] **Step 4: See them pass.** From `WebApp`: `npx vitest run src/setups/review-desk.test.ts` → `1 passed (1)` file, `19 passed (19)`. Then `npx tsc --noEmit -p . 2>&1 | grep -c review-desk` → `0` (master's own errors, in `main.ts` and `sentinel-core`, are not this task's).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/src/setups/review-desk.ts WebApp/src/setups/review-desk.test.ts WebApp/package.json
git commit -m "feat(web): MA-3b2b - the review desk lists what Revit reported (Recently decided in Revit): the newest 10 changesets applied, partially applied or declined, each with who, when, the note, its ledger row (read from the ledger, said when not read), the Undo in Revit after the report when the ledger holds one, and every ghost not applied with Revit's reason and the web's - as text, never HTML; a second read beside the proposed list, re-read by Refresh, and a section that cannot take the proposed list with it; no bridge change; 1.0.42" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4 — Words: the design doc; the final checks

**Files:**
- Modify: `docs/strategy/2026-09-30-model-automation-design.md` (the end of the line at `:1106`)

- [ ] **Step 1: The design doc says what was built.**

In `docs/strategy/2026-09-30-model-automation-design.md`, replace:

```markdown
Revit's reasons on the web desk are MA-3b2b.
```

with:

```markdown
Revit's reasons on the web desk: BUILT on `feature/ma3b2b-desk-reasons` (MA-3b2b), drill MA3b2b pending — the desk's "Recently decided in Revit" lists the newest 10 changesets Revit reported (applied, partially applied, declined) with who, when, the note, the ledger row (and an Undo in Revit after the report) and each ghost not applied with Revit's reason and the web's, as text; a closed window's result reaches a dialog (queued before the Doctor line, which no longer runs on the caller's thread; no DocPin, so no swallowed refusal; the hub's raise moved to Revit's thread — a precaution, not shown to be the cause); a Decline all whose reply was lost is taken on Retry report, not called refused.
```

- [ ] **Step 2: The final checks.** From `WebApp`: `npx vitest run` → `143 passed (143)` files, `2334 passed | 1 skipped (2335)`; restore `ids-cases.json` (Global Constraints). From the repo root, every check project:

```bash
for d in tools/*-check; do ls $d/*.csproj >/dev/null 2>&1 || continue; printf "%s: " $(basename $d); dotnet run --project $d 2>&1 | grep -E "checks? pass|DATUM OK" | tail -1; done
```

Expected: 26 lines — `promote-check: 766/766`, `session-check: 47/47`, the other 23 as on master (together `2383/2383`) — and `datum-check: DATUM OK`. `tools/rvtinfo-check` has no project and is skipped.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -m "docs: MA-3b2b - the design doc says what was built (Revit's reasons on the web desk, a closed window's result in a dialog, a lost-reply decline taken); drill MA3b2b pending" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Live drill MA3b2b (two web rows on the founder's local app; three Revit rows on Revit 2024 behind the drill proxy — R-0 on the build Revit holds now, R-1 and R-2 on the branch's — before the merge)

**The founder's OK first (F5).** The Revit rows' set-up deploys the branch's add-in into Revit 2024. That needs the founder's explicit OK in chat for this drill; without it R-0, R-1 and R-2 are **owed**, W-2's second half is owed with them, and only W-1 and W-2's first half run. The one OK covers R-0 (no deploy: the build Revit holds, pointed at the drill's proxy — review C2), the deploy after it, and the put-back. The web rows need no deploy and no publish: the founder's local app (`web-dev`, port 4000, this checkout on the branch) against the 4100 bridge as it runs — **no bridge restart** (no bridge file changed).

**Who does what.** The web rows are read on the founder's signed-in local app — the founder's, or the runner reading that tab (the runner types no password and signs nobody in). The record never quotes the address the desk shows as "by": it says "the founder's account" or `<account>`. **Review C5: no screenshot of the desk, and no page-text or accessibility read of that tab** — the runner reads it only through page script that returns `document.body.innerText.replace(/[^\s@]+@[^\s@]+/g, "<account>")`; if the founder reads it instead, the record still writes `<account>`. The Revit rows: the runner drives Revit by mouse (or UI Automation's Invoke), Revit signed in (Standards ▸ Sign in — the founder's). **Focus-sensitive steps** — reading the review window, closing it, reading a TaskDialog — happen while Revit is in front, or are the founder's: a script cannot take focus from Chrome, and Revit's owned windows hide from UI Automation while Revit is in the background (a hidden window looked closed in MA3a — and may be why Z-4 saw no dialog). TaskDialog buttons have no UIA Invoke (`WindowPattern.Close` works). Revit's Undo list opens at its dropdown (`133,10`): read it, **never click an entry**. The pane's grid virtualizes (read it through `ScrollPattern`). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window. Open the scratch copy from Revit's Open dialog; never save it.

**The Revit MCP in this drill:** only its read-only calls, never while a Revit command, a TaskDialog or a Sentinel window is open.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run (tight scope); the code is the same on net8/net10 and builds there (Task 2).
- **The published app**: not run — the publish is the founder's, after the merge; the rows run on the local app.
- **A closed window's result with another model in front, or its model closed** (F3 A), **a raise Revit refuses** (`Denied`/`TimedOut`), **a summary that throws**, **a closed picker's result**: checked by scan (§47), not provoked.
- **A rolled-back Apply whose reply was lost**, **a 409 that is another person's decline** (the ceiling of F4): checked offline (§46), not provoked.
- **A project with more than 10 reports**, **a ledger read that fails**, **a viewer's desk**: checked offline (vitest), not provoked — unless the founder's own project shows one, then it is recorded.
- **MA3b2's owed rows** (Show on a create and on a type edit, the tab refusal, MA3b's R-5) stay owed; this drill does not carry them.
- **Which candidate was Z-4's cause** is R-0's to read (review C2). If R-0's dialog shows by itself, F-MA3b2-1 did not reproduce on that build: the cause stays unsettled (the observation gap, candidate 4, the likeliest), and R-1 still proves the dialog shows with the fix. If the build Revit holds has no review window that reports off Revit's thread (older than MA-3b), R-0 is **owed** and says so.

**Set-up for the web rows:** the `web-dev` preview (port 4000) from this checkout on the branch; the founder signed in there; the 4100 bridge running (not touched). Nothing else.

**Set-up for the Revit rows (once, after the founder's OK) — review C2: everything but the deploy comes first, R-0 runs on the build Revit holds now, and the deploy follows it:**
- **The build Revit holds.** Close Revit. Record the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`) and which commit it is, if known. **No build yet.**
- **The add-in's bridge settings.** Copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma3b2bbak` beside it (never print it, never open it in a viewer); point it at the drill's port: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The test bridge on 127.0.0.1:4102, behind the drill proxy on 4101.** Two preview servers, added to `.claude/launch.json` beside `bridge-test` and removed in the closing list:
  - `ma3b2b-bridge` — `node <scratchpad>/ma3b2b/bridge-4102.mjs`, `cwd` `WebApp`, port 4102; the file is three lines: `process.env.BCF_PORT = "4102"; process.env.BCF_EVENT_POLL_MS = "0"; await import("file:///C:/Users/yazan/Claude/Projects/Co%20BIM%20Assistant/sentinel-project/WebApp/bridge/bcf-service.mjs");`. Its banner names port 4102.
  - `ma3b2b-proxy` — `node <scratchpad>/ma3b2b/proxy.mjs`, port 4101. The planner left the file there; if it is gone, write it again:

    ```js
    // Drill MA3b2b's door: 127.0.0.1:4101 -> the test bridge on 127.0.0.1:4102. An empty file beside this script sets its mood, for the
    // FIRST POST .../result it sees (restart the proxy for another): "slow" delays the bridge's answer by 95 s (the bridge has taken the
    // result; Revit still waits); "lose" drops the answer (the bridge has taken the result; Revit never hears).
    import http from "node:http";
    import { existsSync } from "node:fs";
    const mood = (m) => existsSync(new URL(m, import.meta.url));
    const SLOW_MS = Number(process.env.SLOW_MS || 95000), PORT = Number(process.env.PROXY_PORT || 4101), UP = Number(process.env.UP_PORT || 4102);
    let once = false;
    http.createServer((req, res) => {
      const first = !once && req.method === "POST" && req.url.endsWith("/result") && (mood("slow") || mood("lose"));
      const lose = first && mood("lose");
      if (first) once = true;
      const up = http.request({ host: "127.0.0.1", port: UP, method: req.method, path: req.url, headers: req.headers }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          if (lose) { console.log(`lost the reply to ${req.url} - the bridge answered ${r.statusCode}`); res.destroy(); return; }
          setTimeout(() => { res.writeHead(r.statusCode, r.headers); res.end(Buffer.concat(chunks)); }, first ? SLOW_MS : 0);
        });
      });
      up.on("error", (e) => { res.writeHead(502, { "Content-Type": "text/plain" }); res.end(`drill proxy: the test bridge on ${UP} did not answer - ${e.message}`); });
      req.pipe(up);
    }).listen(PORT, "127.0.0.1", () => console.log(`drill proxy on 127.0.0.1:${PORT} -> ${UP}`));
    ```

    A mood is an empty file beside it: `touch <scratchpad>/ma3b2b/slow` / `rm …/slow`, the same for `lose`. Neither exists at the start.
  - `curl -s http://127.0.0.1:4101/health` answers through the proxy. The founder's 4100 bridge is not touched. Every bridge call of the runner names `http://127.0.0.1:4101` through the helper (the machine credential, read through `load-env.mjs`, never printed), from `WebApp`:

  ```bash
  b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
  ```

- **The scratch web projects** (fresh keys — `ma3b2`'s storeys are decided): `b4101 POST cde/projects '{"key":"ma3b2b-office","kind":"office"}'`, `b4101 POST cde/projects '{"key":"ma3b2b","office_key":"ma3b2b-office"}'`; on the office: `b4101 PUT "cde/ma3b2b-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma3b2b-office/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json`, `b4101 PUT "cde/ma3b2b-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`, `b4101 PUT "cde/ma3b2b-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json` (each 201). The founder's membership (the e-mail never reaches a command line, a log or the record): the founder writes `{"email":"<their account>","role":"contributor"}` to `<scratchpad>/ma3b2b/member.json`; the runner sends `b4101 POST cde/ma3b2b/members @<scratchpad>/ma3b2b/member.json | grep -oE '^[0-9]+|"user_id":"[^"]*"'` (the status and the `user_id` only) and deletes the file.
- **The scratch model**: `Documents\Sentinel drills\ma3b2b\ma3b2b-a.rvt`, a copy of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), opened from Revit's Open dialog, bound with Sentinel ▸ Project Setup to `ma3b2b`, never saved. A floor plan of GR-FFL is the active view.
- **Promote once**: Sentinel ▸ Promote (DD) → **Yes**; close the review window it opens with ×. Record what it filed (drill MA3b2: GR-FFL 48 ghosts — `retype wall (24)` first — 01-FFL 40, MA0 Roof 1).
- **R-0 runs here** (the table below), on that build.
- **Then the deploy, for R-1 and R-2.** Close Revit **without saving**. `ls "$APPDATA/Sentinel/unreported/ma3b2b"` (names only) — expected: no such folder, or empty; a file there means R-0's report did not land: recorded, and the next Review AI Proposals says what it does with it. `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build); record `git rev-parse --short HEAD` and the new DLL's sha256. Stop and start the `ma3b2b-proxy` preview (its "first result" is spent). Open Revit and the scratch copy again from Revit's Open dialog — it was never saved, so R-0's elements are not in it; the bridge holds GR-FFL as reported, which is what W-2 reads. Bind it again with Project Setup if Sentinel shows it unbound. **Do not Promote again**: 01-FFL and MA0 Roof still wait. If 01-FFL cannot be applied in the reopened copy, Promote again (→ Yes) and use the storey it files; the record says so.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| W-1 — the section, on what drill MA3b2 left | On the local app (`http://localhost:4000`), signed in, project `ma3b2` (the founder is a contributor there), the **Review** tab. Read the desk from top to bottom (the masked page script — C5); open the report of `Promote (DD) · GR-FFL` | Above: the proposed list still shows `Promote (DD) · MA0 Roof` (1 ghost). Under it **Recently decided in Revit**, `2 report(s), newest first.`: first `Promote (DD) · 01-FFL — applied in Revit by <account> · 2026-10-04 <hh:mm> UTC · 40 applied, 0 not applied · ledger #1813 · undone in Revit after the report (ledger #1814)` (review C3); then `Promote (DD) · GR-FFL — partially applied in Revit by <account> · 2026-10-04 <hh:mm> UTC · 24 applied, 24 not applied · ledger #1811`. Opened, GR-FFL shows its note (or `No note.`), `Not applied (24):`, and under each of the 24 rows `Revit: drill MA3b2: these stay as they are until the slab is set`. If the founder is not signed in or not a member, the desk says so in words and the row is **owed**, not failed | Both head lines (as `<account>`), the note line, the count of rows carrying the reason, two rows quoted. **No screenshot** (C5) |
| R-0 — which candidate it was (review C2; the build Revit holds, **before the deploy**) | `touch <scratchpad>/ma3b2b/slow`. Review AI Proposals ▸ GR-FFL ▸ **Review**. Leave the ticks as the window opens; press **Apply … ticked in Revit**; at the DD IDS dialog, **Place anyway**; note the time. When the window reads `Reporting to the bridge…`, close it with ×. **After ×, do not move the mouse or press a key**; Revit stays in front until a dialog shows or 120 s have passed since Place anyway. Read the dialog if one shows (close it: `WindowPattern.Close`). Read the pane's Doctor log (its newest lines) either way. `rm …/slow`. `b4101 GET changesets/ma3b2b/<GR-FFL id>` (status only) | **An observation, not pass/fail** — complete when one reading is recorded: **(a)** no dialog and no `Review AI Proposals: Applied…` line in the Doctor log → the summary or `Tell` threw (candidate 3 or 5; with nothing rare in the result, 5); **(b)** no dialog, the `Review AI Proposals: Applied…` line is there and nothing else → the raise was not taken (candidate 1 — then C9's "precaution" becomes "the cause" in the record and the merge message); **(c)** a Doctor line naming `say the review's result` → DocPin's refusal (candidate 2); **(d)** `A Sentinel action failed and was skipped` → the dialog job threw; **(e)** the dialog shows by itself → not reproduced on this build (candidate 4 the likeliest). GET: the changeset is reported (`applied` or `partially_applied`) — or the record says what it is | The reading (a)–(e); the Doctor log's newest five lines; the two times; the build's sha256; the status |
| R-1 — F-MA3b2-1, with the fix (the branch's build) | (After the deploy.) `touch <scratchpad>/ma3b2b/slow`. Review AI Proposals ▸ 01-FFL ▸ **Review**. On its first group: **Untick group** (if the storey has one group only, untick one row instead); put `<b>drill MA3b2b</b> stays as modelled` in the group's reason box (the founder types it, or UIA `ValuePattern.SetValue`); press **Apply … ticked in Revit**; at the DD IDS dialog, **Place anyway**; note the time. When the window reads `Reporting to the bridge…`, close it with ×. **After ×, do not move the mouse or press a key** (review C12); Revit stays in front until a dialog shows or 120 s have passed since Place anyway. Read the dialog whole; close it (`WindowPattern.Close`); note the time. Read the pane's Doctor log (its newest lines). `rm …/slow`. `b4101 GET changesets/ma3b2b/<01-FFL id>` | A TaskDialog titled `Sentinel — AI proposals` shows **by itself**, 90–115 s after Place anyway: `Applied <a> element(s) from "Promote (DD) · 01-FFL".` … `"Promote (DD) · 01-FFL": reported (ledger #<n>).` and `<k> decline reason(s) recorded with it.` The Doctor log holds `Review AI Proposals: Applied <a> element(s) …` and **neither** `Revit did not take a Sentinel action` **nor** `A Sentinel action failed and was skipped` **nor** `The report's result could not be shown`. GET: `partially_applied`, `result.reasons` `<k>` entries. **Fails, each named (review C6):** **(i)** no dialog by 120 s; click Revit's title bar once and wait 10 s — a dialog that shows only then (finding F-MA3b2b-1: the raise on Revit's thread is not enough while Revit sits idle), recorded with which Doctor lines are there; **(ii)** the dialog shows but the Doctor log lacks `Review AI Proposals: Applied…` — C1's logging half is broken (`OnUi` did not reach the pane); **(iii)** neither a dialog nor a Doctor line by 120 s and the click changes nothing — the continuation died: look at `Send`'s catch-all (C1c); the GET says whether the report landed | The dialog's text; the two times; the Doctor log's newest five lines; `<a>`, `<k>`, the ledger id; whether a click was needed; on a fail, which of (i)–(iii) |
| R-2 — a decline whose reply was lost | Stop and start the `ma3b2b-proxy` preview (its "first result" is spent). `touch <scratchpad>/ma3b2b/lose`. Review AI Proposals ▸ MA0 Roof ▸ **Review**. **Untick group** on its one group (the button reads `Decline all (needs a reason)`); put `drill MA3b2b R-2` in the group's reason box and `drill MA3b2b: the reply is lost` in the note; press it. Read the window. `rm …/lose`. `b4101 GET changesets/ma3b2b/<MA0 Roof id>` (status only). Press **Retry report**; read the window. `b4101 GET "cde/ma3b2b/audit?entity_type=changeset&action_prefix=changeset_applied&limit=3"` | After the press: `Declined 0 of 1 changeset(s) — nothing in the model changed.` (then Promote's own lines) and `"Promote (DD) · MA0 Roof": not reported: <the connection's words>` ending `Nothing in the model changed; Retry report sends it again.`; the proxy's log says `lost the reply to …/result - the bridge answered 200`; GET: `"status":"declined"`. After Retry report: `Sent again: 1 of 1 result(s) reported.` and `"Promote (DD) · MA0 Roof": the bridge had already taken it (its reply did not reach Revit) — declined; the bridge named no ledger row for it here.` with `1 decline reason(s) recorded with it.` (review C7: the stored reason is this one) — **never** `the bridge refused it`. The audit read shows **one** `changeset_applied` row for that changeset | The window's text both times (UNSURE 4: the connection's words, whole); the proxy's log line; the status; the audit row's id |
| W-2 — Refresh, and text as text | On the local app, the Review tab, switch the project to `ma3b2b` (or, with the Revit rows owed: stay on `ma3b2`). Note the count line. Press **↻ Refresh**. Read the section (the masked page script — C5); open the 01-FFL report | Refresh re-reads the section without reloading the site (the "Reading…" line shows, the section comes back). With the Revit rows run: `3 report(s), newest first.` — `Promote (DD) · MA0 Roof — declined in Revit by <account> … 0 applied, 1 not applied · ledger #<m>` with `Note: drill MA3b2b: the reply is lost` and its row `Revit: drill MA3b2b R-2`; then `Promote (DD) · 01-FFL — partially applied … · ledger #<n>` (R-1's `<n>`), each of its unticked rows reading, as characters, `Revit: <b>drill MA3b2b</b> stays as modelled` — the angle brackets visible, nothing bold; then `Promote (DD) · GR-FFL — applied` (or `partially applied`) `… · ledger #<g>` (R-0's report; no Undo row: Revit was closed, not undone). With the Revit rows owed: the count line and both reports of W-1 come back unchanged, and the `<b>` half is **owed** (checked offline, vitest) | The count line before and after; the head lines (as `<account>`); one reason row quoted with its brackets. **No screenshot** (C5) |

The rows run in the order W-1, R-0, (the deploy), R-1, R-2, W-2. If Promote filed other names or counts than drill MA3b2's, the rows use what it filed and the record says so.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA3b2b — Revit's reasons on the web desk, a closed window's result in a dialog, a lost-reply decline taken, live (<date> ~hh:mm → hh:mm local, branch feature/ma3b2b-desk-reasons <sha>, Claude driving Revit 2024, the founder's local app)`: the Setup paragraph (the local app and the 4100 bridge as they ran; for the Revit rows: the deploy on the founder's OK with the DLL sha before and after, settings at 127.0.0.1:4101, the proxy and the bridge on 4102, the scratch office and project, the membership, the sign-in state, the scratch copy, not saved), the table `| Row | Result | Evidence |` with **pass**/fail/owed and the words quoted (never the founder's address), plus ledger `#n`; then F-MA3b2b-n findings each fixed on the branch ("fix(drill MA3b2b): …" with its check) and their shas, and the **owed** rows at its end.

**Closing list:**
- close Revit without saving the scratch copy;
- stop `ma3b2b-proxy` and `ma3b2b-bridge`; delete the `slow` and `lose` files if either is left; remove the two entries from `.claude/launch.json`; the founder's 4100 bridge and the `web-dev` preview are not touched;
- restore the add-in's bridge settings: copy `bcf-config.json.ma3b2bbak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed — **a deploy too: only under the founder's same explicit OK**: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, and record the deployed DLL's sha256 beside the hash recorded before. Without that OK, say so: the branch's add-in stays until the merge's deploy — safe: it differs from master's only in this slice's three fixes;
- list what the drill left on the shared ledger — the scratch office `ma3b2b-office` (four artefacts), the project `ma3b2b`, the membership, the changesets (GR-FFL reported by R-0, 01-FFL partially applied, MA0 Roof declined) and their rows — left in place on purpose (scratch keys);
- list what the drill left on this PC outside the repository: `%AppData%\Sentinel\unreported\ma3b2b\` (deleted with its files, if any), `%AppData%\Sentinel\cache\ma3b2b*` (deleted: scratch keys only), the scratch copy in `Documents\Sentinel drills\ma3b2b\` (kept, named, as evidence; never committed), `<scratchpad>/ma3b2b/` (the proxy and the bridge script; not the repository).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record — **W-1 is never owed at the merge** (it needs no deploy: without it nothing proves live that the desk shows a reason typed in Revit); R-0, R-1 and R-2 may be owed only because the founder gave no deploy OK — then the merge message says F-MA3b2-1's fix is **built, not proven**;
- each F-MA3b2b-n fix is committed on the branch with its check, and Task 4 Step 2's checks were run again after the last fix;
- a fix that changes what Revit or the desk does was run again live before the merge; a row whose fix was not run again is **owed**, not passed.

**The design doc says what the drill proved**, committed on the branch before the merge: replace ``BUILT on `feature/ma3b2b-desk-reasons` (MA-3b2b), drill MA3b2b pending`` with `LANDED in MA-3b2b (merge <date>), drill MA3b2b: <passed rows; owed rows>` — `git commit -m "docs: MA-3b2b - drill MA3b2b's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma3b2b-desk-reasons -F - <<'EOF'
Merge feature/ma3b2b-desk-reasons: MA-3b2b - Revit's decline reasons on the web review desk (Recently decided in Revit: the newest 10 changesets Revit reported, each with who, when, the note, its ledger row read from the ledger, the Undo in Revit after the report when the ledger holds one, and every ghost not applied with Revit's reason and the web's - as text, never HTML; a second read beside the proposed list, re-read by Refresh; no bridge change; web 1.0.42, the publish is the founder's), F-MA3b2-1 (a closed window's result reaches a dialog: queued before the Doctor line, the pane's view model on Revit's own dispatcher, no DocPin, a summary or a continuation that throws is said; the hub's raise moved to Revit's thread <as a precaution | the cause>; cause by drill row R-0: <the candidate R-0 showed, or "not reproduced", or "not read: R-0 owed">), and a Decline all whose reply was lost is taken on Retry report, not called refused (the stored result declined with the same ghosts, note and reasons). Drill MA3b2b: <the result and the owed rows>. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order:**
1. **The bridge: nothing.** No bridge file changed; the 4100 bridge is not restarted for this slice.
2. **The add-in**, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same for each other Revit version the founder uses.
3. **The web app — the founder's publish** (`npm run publish` from `WebApp`, version 1.0.42). Until then the published desk (1.0.41) shows no decided section; nothing else differs. Either order with step 2 works: the desk reads what any add-in since MA-3b2 reported.

## UNSURE facts this drill settles

1. **Which candidate was Z-4's cause** (R-0, on the build Revit holds before the deploy — review C2), and **whether the dialog shows with the fix** (R-1) — and, if R-1 fails, which of its three named fails it is (review C6). Whether a raise posted to Revit's dispatcher runs while Revit sits untouched in front is one claim under test (candidate 1); R-0 and R-1 keep Revit in front so candidate 4 (a dialog UI Automation could not see) is out of the way.
2. Whether `GET /cde/:key/audit` answers a signed-in contributor (the route itself asks no role; the database's row policies decide) — W-1's `ledger #1811`. A desk that says `ledger row not read — …` there is a finding (then F1 C, or a role on the route).
3. Whether `GET /changesets/:key` with no status answers the signed-in desk as the proposed read does (same route, same store call) — W-1.
4. The words net48 gives when the proxy drops a reply mid-request (expected through `ChangesetTrust.BridgeWords`: `the connection failed — <the socket's sentence>`) — R-2 records them whole.
5. Whether a reason with `<` and `>` survives the reason box, the bridge's one-line rule and the ledger unchanged — R-1's GET and W-2.
6. What note drill MA3b2's GR-FFL result carries (an IDS line from "Place anyway", or none) — W-1 records the line.
7. Whether WPF has an `Application` inside Revit on this PC (review C1 assumes none, as usual) — R-0's reading (a) says the pool thread's Doctor line did not arrive; reading (e) or (b) says it did.

## Risks (each a ceiling stated in words)

- **F-MA3b2-1's cause is claimed, not verified** (S4) until R-0 reads it (review C2). If R-1 fails, its three named fails (C6) say where to look next.
- **The desk reads the project's whole changeset list to show ten** (F1 A; twice per Refresh — once filtered by the bridge, once not). Ceiling: a project with hundreds of changesets pays for it on every Refresh; then the bridge's `status` list and `limit` (Next).
- **The ledger read delays the proposed list** (review C11): `readLedger` runs after the two list reads and before anything is drawn, so a slow audit read holds the proposals at `Reading…`. Acceptable for ten rows; if it bites, draw the proposals first and fill the section after.
- **More than 1000 `changeset_*` ledger rows for the ten reports shown** makes every report read `ledger row not read — …` (review C3's wider read; E7) — said, never a missing row called "not found".
- **`OnUi` posts instead of waiting** (review C1; E9): a Doctor line or a pane status written from a pool thread shows a moment later, and an exception inside a posted action surfaces on Revit's dispatcher, not at the caller (the actions set properties and insert a log line). A caller on Revit's thread runs inline, as before. It reaches every pane update in the add-in, not only the review's.
- **A report's ledger row is found by its changeset id among `changeset_applied` rows**: a changeset whose id is not a uuid (none the bridge makes) makes the ledger read a 400 — said on every report, the section still shows.
- **The reporter's address is on screen** for every member who can open the desk (it is on the ledger row already). Not new data; a new place.
- **A dialog for a closed window now shows over whichever model is in front** (F3 A) — its words name the changeset, not the model.
- **Another person's decline of the same ghosts with the same note and the same reasons (or none stored) reads as "already taken"** (F4 A, review C7) — the changeset is declined either way, and no other person's reason is counted as this reviewer's.
- **A note with a character .NET and JavaScript trim differently reads "refused"** (E4) — today's words, nothing lost.
- **The hub's change reaches every Sentinel action that goes through it** (BCF issues, Naming Manager, Standards, Show): each already raises from Revit's or a window's thread, where the new code calls `Raise()` directly as before. A caller on another thread now raises a moment later (posted), never earlier.
- **An Undo is said from the ledger's newest `changeset_reverted` row for the changeset** (review C3): an Undo of some of a report's ghosts reads the same as one of all of them — the row's own guids are on the ledger. A report undone by closing Revit without saving has no such row and still reads "applied" (R-0's GR-FFL in this drill).
- **A picker closed between `Load`'s `Gone` check and its posted status gets the Doctor line only** (review C13 fixed the review window's same gap, not the picker's): the picker's round is the waiting results sent again, and each is said again by the next Review AI Proposals.

## Not settled (for the founder or the reviewer)

- **Which candidate caused Z-4's missing dialog** — R-0 reads it on the build Revit holds, before the deploy (review C2); it stays unsettled only if R-0's dialog shows (not reproduced) or the Revit rows are owed.
- **F5** — the OK for R-0, the deploy, R-1 and R-2.
- **Whether W-1 should run on the founder's own project instead of the scratch key `ma3b2`** — either works; `ma3b2` has known data.
- **The brief's base total** (`promote-check 695/695`) is stale: the measured base is `756/756`.

## Next (out of scope here)

- **The bridge's list takes a `status` list and a `limit`** (F1 B), or **the ledger id on the stored changeset** (F1 C): when the desk's two whole-list reads prove heavy, or the ledger read is refused to a role that reads the desk. One line and one vitest for B; a bridge restart. Size S.
- **`WebApp/package-lock.json`'s own version** (`1.0.30`; `package.json` is `1.0.42`): `npm install --package-lock-only` from `WebApp`, its own commit.
- **An audit of the other caller-dispatcher sites** (review C1e): `App.cs:381`, `Coordination/GovernedNotify.cs:101`, `Engine/AutoPublish.cs:58` and `Updaters/FailureInterceptor.cs:41` each take `Application.Current?.Dispatcher ?? Dispatcher.CurrentDispatcher` — on a pool thread with no WPF Application that is the caller's own dispatcher, not Revit's. Each should use a dispatcher kept on Revit's thread, as the view model and the hub now do. Size S.
- **The ledger panel prints a `changeset_applied` row's reasons** (`cde-panel.ts renderAudit` prints the action only). Size S.
- **A reason box per row** (MA-3b2 F1 B): when reviewers ask; no contract change.
- **MA-3b3 — the Revit "ticked" lock and the carried decline** (Revit + bridge + web desk): as in the MA-3b plan's Next. Size M–L.
- **MA-3b4 — nothing in modelling waits**: a waiting result sent by itself on `DocumentOpened`; Ghost Builder writes the same record before its report and stops waiting; Promote's reads (`Commands.PromoteWalls.cs:49`, `:61`) and its filing (`:191`) off the thread.
- **MA-3c — the ghost overlay** and **MA-3d — web highlights and the proposal model**: as in the MA-3a plan's Next.
- Owed rows carried: MA3b2's Show on a create and on a type edit, and the tab refusal; MA3b's R-5; Revit 2025–2027 for the review (MA-3a, MA-3b, MA-3b2, MA-3b2b); MA3a's D-4 second account and a late decline applied over; and from MA2e — Revit 2025–2027 for Annotate, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy.
