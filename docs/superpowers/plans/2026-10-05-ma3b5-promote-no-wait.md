# MA-3b5 — Promote reads and files without freezing Revit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The MA-3b4 plan's "Next ▸ MA-3b5 — Promote's own waits off Revit's thread" (`docs/superpowers/plans/2026-10-05-ma3b4-report-lands-by-itself.md`, its S1 and S2 rows and its Next), cut to one drillable slice — the open part of XC-3 ("network off Revit's UI thread, everywhere", `docs/strategy/2026-09-30-revit-addin-audit.md:1027`) in the modelling chain that a person feels most: Promote (DD) froze Revit for its reads (`Commands.PromoteWalls.cs:49` `FetchProposed`, up to 8 s; `:61` `PromoteContext.Fetch`, about 4 s) and for its filing (`:186-197`, one `Propose` per storey, each up to 120 s, growing with the bridge's store read — MA-3b3 C4):
- **The reads and the filing run on pool threads; Revit stays usable.** Execute checks the guard, holds it, reads on a pool thread (`Read`: the pending changesets, then the standards only when no Promote storey waits for review), and returns. The plan and its "File n changeset(s)?" dialog run back on Revit's thread through the event hub, **in the model Promote started from** (`App.Events.Enqueue(doc, …)`, DocPin). After Yes, the filing runs on a pool thread; the review window opens by itself through a second DocPin hop. A model switched or closed during the wait is said — nothing planned in it, nothing opened in the wrong one, and the words name what was filed and where to review it.
- **One guard with the review (F1).** Today the frozen thread is what stops a second Promote from planning and filing twice. Promote now takes the review's guard (`ReviewChangesetsCommand.Hold`, `Held`): while it reads or files, a second Promote and Review AI Proposals are refused in words that name Promote (F3), and a model opened meanwhile says why its waiting results were not sent (`OpenHeld`). While a review window is open or a report is in flight, Promote is refused at once (today it planned and filed, and only its `Open` said Busy).
- **The stall rule (F4).** After the first filing the bridge did not answer, the rest of the run is not sent (MA-3b C6's rule, as `UnreportedResults.WithdrawEach`) — the guard waits one write timeout, never one per storey.
- **The receipt's Doctor line is not lost** (MA-3b2b C1e): `GovernedNotify.Report("Promote receipt", …, key, pane)` with Revit's dispatcher captured on Revit's thread.
- **Drill MA3b5** — two Revit rows on Revit 2024 against a door that holds the answer to the first filing 90 s (review C2), and the first read in P-2 (C9).

**Source of truth:** the MA-3b4 plan's S1 ("a re-entrance guard … DocPin across the wait … the `GovernedNotify` dispatcher fix for its receipt (MA-3b2b C1e), a rewrite of §38's literal and its own drill row with a slow-filing proxy"), S2 and Next ▸ MA-3b5; `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` ▸ sessions MA3b3 (the B35 seed plans three Promote storeys on `ma3b3-office`'s artefacts: GR-FFL, 01-FFL, MA0 Roof) and MA3b4 (the door and the test bridge on 4101/4102). Base: `feature/ma3b5-promote-no-wait` at master `75100c9` (MA-3b4 merged). Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight — one drillable slice; the dry run's diff is in the Dry run paragraph):** Promote's two reads and its filing off Revit's thread with two DocPin hops; the shared guard and its words; the stall rule; the receipt's dispatcher; `ReviewChangesetsCommand.Open(ExternalCommandData…)` deleted (Promote was its only caller). Left to **Next** with reasons: Promote's dialog counting carried declines and a storey whose every ghost is carried (S2 — MA-3b6, a bridge preview route); Ghost Builder's filing and `Abandon`'s withdrawals; the dispatcher audit of the other `GovernedNotify` callers.

**Architecture:**

*Words and the stall rule (`GhostBuilder/PropertyPlanner.cs`, beside `FileAll`; `Engine/UnreportedResults.cs`; pure, promote-check §52).* `PromoteReading`, `PromoteFiling(n)`, `PromoteFiled(filed, n)` — the pane's Doctor lines of the wait; `PromoteNotOpened(refusal, filed, title)` — DocPin's refusal of the open hop plus what was filed and where to review it; `PromoteStopped(why, opened)` — a filing that threw (C6: `opened` when something was filed, so its review follows); `Stalling(post)` — wraps `FileAll`'s `post`: after the first error that is not a `Bridge 4xx` refusal, every later call returns `not sent: an earlier filing of this run failed without a refusal from the bridge (…)` without posting (C5). `OpenHeld(n)` names Promote (F3; §49's literal follows).

*Revit (`Commands.PromoteWalls.cs`, `Commands.ReviewChangesets.cs`; source scans §52b, §32, §35, §38, §39, §43; drill P-1, P-2).* `ReviewChangesetsCommand`: `Hold`/`Release` internal, `internal static bool Held`, `internal const string Busy` (names Promote, no time bound — F3), the `Open(ExternalCommandData…)` overload deleted. `PromoteWallsCommand.Execute`: bound check → `Held` → Busy, else `Hold()`, the `PromoteReading` Doctor line, `Task.Run(() => Read(cfg, key)).ContinueWith(read => App.Events.Enqueue(doc, "plan Promote (DD)", (ui, d) => Plan(ui, d, cfg, key, read), why => { Release(); dialog }))`, return. `Plan` (the hub's job) owns the guard: an idempotent `Once()` (Interlocked) releases it on every way out of `PlanAndFile` — a refusal, No, a throw the hub swallows — unless the filing took it; `PlanAndFile` is Execute's old body, unindented, its document still named `doc` (§15, §25), its `return Result.X` now `return false`; its first statement refuses a model whose project was re-bound during the reads (C4); the waiting storey opened through `Open(ui, doc, …)` after `release()` (Open checks the guard). After Yes: `pane` (Revit's dispatcher) and `title` are captured, the `PromoteFiling` Doctor line, then `Task.Run`: `FileAll(bodies, Stalling(…Propose…))`, the words; `catch` → `PromoteStopped(…, first != null)`; `finally { release(); }`; then the receipt with `pane` on every path that filed something (C6), the `PromoteFiled` Doctor line and the open hop `App.Events.Enqueue(doc, "open the review of the changesets Promote filed", (u, d) => { words; Held → PromoteNotOpened(Busy, …) (C7); Open(u, d, …) }, why => dialog(PromoteNotOpened(…) + words))`, or — nothing filed — a dialog with no DocPin (a dialog changes nothing). `c` (`ExternalCommandData`) is never used after Execute returns.

No bridge, web, `package.json` or migration change; no new HTTP call.

**Tech Stack:** the C# add-in (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF); the offline check `tools/promote-check` (it compiles `GhostBuilder/PropertyPlanner.cs` and `Engine/UnreportedResults.cs` and scans the Revit-bound sources).

## Global Constraints

- Branch `feature/ma3b5-promote-no-wait` (it holds this plan, on `75100c9`); merge `--no-ff` into master only after every task's checks pass **and the live drill MA3b5 is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **Network calls never wait on Revit's thread (AI-2, XC-3).** No `GetAwaiter().GetResult()` and no `.Wait(` in `Commands.PromoteWalls.cs` (§52b) nor in `Commands.ReviewChangesets.cs` (§43, §50).
  - **One review at a time, one Promote at a time.** The guard is the review's `_holds`; Promote holds it once (`Count(promote, "ReviewChangesetsCommand.Hold();") == 1`) and releases it exactly once on every path (`Once()`, the filing's `finally`, the refused plan hop). The review's own `Hold();`/`Release();` counts stay 3/3 (§43, §50).
  - **DocPin (XC-1).** Every plan, dialog and window of Promote after its reads runs in the model Promote started from, or refuses in words and changes nothing; a dialog alone (nothing filed) needs no pin.
  - **Words are said, never silent.** The wait is said in the pane's Doctor log (reading, filing, filed); a refusal (guard, DocPin) is a dialog; a filing that throws is said; the receipt's Doctor line reaches the pane (C1e).
  - **Claimed vs verified.** Unchanged: a filing whose reply timed out is "not filed" in Promote's words; the next Promote opens it as a waiting storey once the bridge holds it; one stored after a second Promote's read can be filed twice (as before MA-3b5 — review C10).
  - **Every Revit write stays inside one TransactionGroup per Sentinel action (XC-2)**: this slice adds no model write — Promote never writes the model; the executor does, after a person's Apply.
  - **Nothing MA-2b … MA-3b4 hold is loosened**: the LOD state row and the type-gap row are posted before the dialog (§32, §36), `FileAll`'s C4/C24 rules (§35), one Undo per storey (§39), the review's re-check and stamps.
- After each add-in task, the build: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false`; Task 3 builds 2022–2027. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s for anything beyond `System`, `System.Collections.Generic`, `System.Linq`.
- Checks: from the repo root, `dotnet run --project tools/promote-check`. No bridge or web file changes: vitest is not run (if it is, restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with `git checkout` when its content is unchanged — a full run rewrites it with LF).
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by source scans and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100; never publish to the That Open platform.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never print the founder's e-mail address (a drill record says "the founder's account" or `<account>`); never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are `75100c9`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs. A new file may be written with LF (git normalises it).

**Dry run (planner, 2026-10-05).** A detached worktree of `feature/ma3b5-promote-no-wait` at `75100c9` in the session's scratchpad (`scratchpad/ma3b5/dry`; removed afterwards — never the repository). A script (`scratchpad/ma3b5/apply.py`, MA-3b4's) read **this document** and applied every "Create … / In … , replace … with …" block of Tasks 1 and 2 in order (each replace matched its text exactly once, CRLF kept), each task's check step before its code step, and ran the named checks:
- Base, measured first: `promote-check` `797/797` (the brief's 794 is MA-3b4's plan before its review fixes).
- Task 1: the build fails (`error CS0117: 'PropertyPlanner' does not contain a definition for 'Stalling'`, and the same for `PromoteFiling`, `PromoteReading`, `PromoteFiled`, `PromoteNotOpened`, …) → `802/802 checks pass` (797 + 5).
- Task 2: eight `FAIL` lines (§52b's four, §32's, §35's, §39's and §43's one each), `798/806` → `806/806 checks pass`; builds with `-p:DeployToRevit=false`: 2024 `0 Error(s)` `5 Warning(s)`, 2022 `0`/`3`, 2027 `0`/`3` — master's own counts.
- The diff of Tasks 1–2: 12 files, 249 lines in, 58 out (the checks 82 new lines in two new files, plus 9 changed literals).
- **Again after the review amendments C1–C10** (the same script, a fresh detached worktree at `ce80886`, removed afterwards): base `797/797`; Task 1 the same six `error CS0117` → `802/802`; Task 2 the same eight `FAIL` lines, `798/806` → `806/806` (C4, C5, C6, C7 folded into existing checks: no new count); builds 2024 `0`/`5`, 2022 `0`/`3`, 2027 `0`/`3`; the diff 12 files, 271 lines in, 58 out (the checks 87 new lines).
- Not run: Task 3 (the design doc and the other 25 check projects — no file they compile or scan changed, so their counts are master's: 1617 together, `datum-check` `DATUM OK`), builds 2023, 2025 and 2026, the drill (Revit, the test bridge, the door) and the tasks' commit commands.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | What stops a second Promote now that Revit no longer freezes | **A:** the review's one guard (`_holds`), shared: while Promote reads or files, Review AI Proposals and a second Promote are refused; while a review window is open or a report is in flight, Promote is. **B:** a Promote-only guard | **A** — a picker opened mid-filing would list a storey with parts still missing, and applying it would be "reviewed alone" with a partial Undo; one guard, one sentence, no second lock to forget. The guard is per PC (as the review's is), not per project: a Promote in one model makes Review AI Proposals in another wait too (Risks) |
| F2 | Ghost Builder while Promote reads or files | **A:** not refused. **B:** refused | **A** — Ghost Builder files and places its own new elements, which Promote's plan (read before) never names; its `ReportAll` `Hold()` is a counter, so the two overlap safely. B would also refuse it while any review window is open — a change Ghost Builder's users would feel |
| F3 | The guard's words | **A:** `Busy` and `OpenHeld` name Promote ("or Promote (DD) is reading or filing") and drop "two minutes at most", which a filing of n storeys cannot keep; the pane's Doctor log says when it is done. **B:** unchanged | **A** — "a review window is open" is false while Promote files, and drill Z-4's reader acted on the time bound |
| F4 | A hung bridge during the filing | **A:** the stall rule — after the first filing the bridge did not answer, the rest are not sent (said per storey, counted in Promote's not-filed dialog). **B:** every storey waits its own 120 s | **A** — the guard then waits about 12 s of reads + the parts filed + one 120 s, never n × 120 s; the storeys not sent are filed by the next Promote once the waiting one is reviewed |
| F5 | The drill's Revit rows run on the branch build deployed to Revit 2024 | The founder's explicit OK in chat — **given** in the request that started this slice ("MA-3b5 go, deploy the ma3b5 branch to 2024"); it covers deploying the branch's build to Revit 2024 for drill MA3b5 | given — 2024 only; 2025–2027 are owed. Putting master's build back is not needed after the merge (master is then the branch); if the merge waits on a failed row, the branch's build stays (safe: same routes) unless the founder asks |

## Amendments to the brief's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (the brief, item 2: "a second Promote, or a review/Ghost build in the same key, while one is reading or filing is refused in words").** A second Promote and a review are refused; Ghost Builder is not (F2). The guard is per PC, not per key (F1): the review's guard has always been.
- **S2 (the brief, item 5: "carried declines in Promote's 'File n changeset(s)?' dialog if it fits cheaply").** Not in this slice — MA-3b6 (Next), through a **bridge preview route** (`POST /changesets/:key/preview`: validate, `docList`, `carryDeclines`, no store), not a second `carryKey` in C#: the newest-decision rules (`changesets-logic.mjs:650`, `:694` — roles, unverified, re-opened, C13's lower-casing) would live in two places, MA-3b3 F8's reason against it. The route is about 25 lines and a vitest, but it restarts the founder's 4100 bridge (a Funnel toggle) for a slice that is otherwise Revit-only. Meanwhile the person already sees carried declines before any Apply: the review window's `DeclinedHeader` (drill MA3b3 R-2).
- **S3 (the brief, item 4: "the receipt sent from the enqueued job").** Sent from the filing's pool thread with Revit's dispatcher handed in (`GovernedNotify.Report(…, key, pane)`, captured on Revit's thread in the plan job) — not from the open hop: the receipt describes the filing and must go out when the open hop is refused (the model closed). Same effect for C1e: the Doctor line is written through a dispatcher that pumps.
- **S4 (the brief, item 3: "the plan and the dialogs run in the model Promote started from").** The plan, its dialog and the review window do; the not-filed dialog when nothing was filed is shown with no pin (a dialog changes nothing in the model — MA-3b2b F-MA3b2-1's rule), and the open hop's refusal shows the not-filed words with it.

## Review amendments (BINDING — the review of `ce80886`; each is in the task or drill text it changes, and the text matches it)

The review found nothing critical; C1–C3 are important, C4–C10 minor. All are taken; C6's words and C9's window are adapted (said in each).

- **C1 (important — P-1 could pass on a frozen Revit).** A click or ribbon command made while Revit's thread is blocked waits in Revit's queue and runs once Revit is free, so (a)–(c) alone prove nothing. P-1 (a)–(c): the runner notes the time each answer appeared (the selection's MCP reply; each dialog). **Pass only when all three came before the door's `answered …` line.** Fails, named: any of them at or after `answered` (Revit froze, and the input waited in Revit's queue). (The Revit MCP itself runs on Revit's thread, so its reply time is a fair witness.)
- **C2 (important — 45 s is too short when Claude drives Revit).** The door is started with `SLOW_MS=90000` for P-1 and P-2 (the door's default; under ChangesetClient's 120 s write timeout). P-1 (d) reads "at least 90 s after Yes". The 45 s default and its fallback sentence ("If 45 s is too short …") are deleted.
- **C3 (important — privacy, a PUBLIC repo).** `setup.mjs` copies every member of `ma3b3` into `ma3b5` with that member's role, matching no address: `for (const x of list) await call("POST", "cde/ma3b5/members", { email: x.email, role: x.role });`. The plan matches no e-mail text anywhere. (Out of scope here, flagged to the founder: `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` already prints the founder's full address in three lines.)
- **C4 (minor — a re-bind during the read).** DocPin checks only which model is active; Project Setup re-binding it during the ~12 s read would plan with the old key's standards and file into the old key. `PlanAndFile`'s first statement: `if (ProjectContext.For(doc).Key != key) { TaskDialog.Show(Title, $"This model's project changed while Promote read the bridge (was {key}) — nothing was planned or filed. Run Promote (DD) again."); return false; }` (`Once` releases the guard). §52b scans for it (folded into its E4 check: no new count).
- **C5 (minor — the stall words).** A lost sign-in (`SessionException`, said by `ChangesetTrust.BridgeWords`) also stalls the run, but the bridge was never asked. `Stalling`'s words: `not sent: an earlier filing of this run failed without a refusal from the bridge ({err}) — run Promote (DD) again once it answers`. §52's literal follows.
- **C6 (minor — a filing that throws loses its receipt; its words contradict the open hop).** The receipt moves after the `try/catch/finally`, under `if (filedIds.Count > 0)`, so it is sent on every path that filed something; it sits in its own `try` whose `catch` adds `Promote's receipt was not sent — …` to the words (a throw there after the release would otherwise lose the open hop silently). `run` is not hoisted: the receipt reads `filedIds`, never `run`. `PromoteStopped(why, opened: first != null)`: when `opened`, the second line reads `What the bridge took before it stopped waits for review — it opens by itself while this model is in front.` — adapted from the review's "…opens now", which the open hop's DocPin refusal (shown with these words) would contradict. §52 pins both forms (folded: no new count).
- **C7 (minor — the release/open-hop gap's words, E3).** In the open hop, after the words and before `Open`: `if (ReviewChangesetsCommand.Held) { TaskDialog.Show(Title, PropertyPlanner.PromoteNotOpened(ReviewChangesetsCommand.Busy, filed.Count, title)); return; }`. §52b scans for it (folded).
- **C8 (minor — UNSURE #2 is settled by construction).** `Dispatcher.CurrentDispatcher` is the calling thread's; the hub's job runs on Revit's main thread, which made the hub's and the pane's `_ui` in `App.OnStartup`. UNSURE #2 is removed; P-1 (e) still records the receipt line as C1e's live proof.
- **C9 (minor, optional — taken: the plan hop's refusal live).** That refusal is the one release not through `Once`; a leak would keep Review AI Proposals Busy until Revit restarts. The door also holds the first `GET /changesets/<key>?status=proposed` when a file `slowread` exists beside it. P-2 starts with it: Promote (DD) in `ma3b5-a` and, in the same computer batch, a switch to `ma3b5-b` — **within 8 s** (adapted: `FetchProposed`'s read timeout ends the held read at 8 s, and the hop is queued then) — expecting `Sentinel did not plan Promote (DD): switch back to ma3b5-a — nothing was changed.`; then back to `ma3b5-a`, where the next Promote is not Busy (the release live), and the row goes on as written. A switch that misses the 8 s is recorded **owed** (Promote then says it could not reach the bridge in `ma3b5-a`; the guard is released by `Once`), never re-run. The "Owed: the plan hop's DocPin live" line is deleted.
- **C10 (minor — two wordings).** Global Constraints and Risks: "nothing is filed twice" becomes "the next Promote opens it as a waiting storey once the bridge holds it; one stored after a second Promote's read can be filed twice (as before MA-3b5)". P-2's last step expects "a waiting Promote storey (record which)", not "the GR-FFL storey" (`FirstOrDefault` follows the bridge's order).

*The review of `c70c8d6` (three lenses), fixed in the commit that adds these lines:*

- **C11 (important — a sign-out mid-filing files in the person's name with the PC's credential).** Revit stays usable while Promote files, so Sign out can run mid-run; `ServiceToken` then falls back to `FileToken` while the bodies' actor still names the person. Before the filing's `Task.Run`, on Revit's thread: `var fileCfg = BcfConfig.Load(); if (UserSession.IsSignedIn) fileCfg.FileToken = "";` (as MA-3b4's C9); `Propose` uses `fileCfg`, the review's `Open` keeps `cfg`. A sign-out mid-run is then refused by the bridge and said. §52b pins it; §35/§38's `Propose` literals follow.
- **C12 (minor — a re-bind during the filing).** The open hop's first statement re-checks `ProjectContext.For(d).Key != key` and says `PromoteNotOpened("This model's project changed while Promote filed (was {key})", …)` plus the filing's words; no review of the old project opens in the re-bound model. §52b pins it.
- **C13 (minor — a done line that never comes).** A Promote that files nothing (No, a refusal, nothing to promote) releases the guard with no Doctor line. The words say so instead of adding a line: `Busy` ends "…Promote's filing is done (a Promote that files nothing is done when its dialog closes), then run the command again."; `PromoteReading` ends "Until its dialog closes — or, after Yes, its filing is done — Review AI Proposals and a second Promote say they wait." §52 and §52b pin them.
- **C14 (minor — a timeout or an unreadable 201 is not "not filed").** The filing's words read "{n} of {m} changeset(s) were not confirmed filed (one the bridge did not answer may still be held — the next Promote (DD) opens it as a waiting storey if so):"; `PromoteFiled` reads "… filed (confirmed by the bridge) — the filing is done." §52 and §52b pin them.
- **C15 (important — §52b missed a guard released while the filing runs).** §52b's filing check also requires `release();` exactly twice (the waiting storey's and the filing's `finally`) and one `return true;` after the open hop. Proven: `return true;` → `return false;` and a `release();` before `PromoteFiling` each fail it (807/808).
- **C16 (minor — §52 crashed instead of failing).** The stall stub answers from `sent.Count`, not a queue: a `Stalling` that never stalls now fails §52's two F4 checks (806/808) instead of ending promote-check with `Queue empty`.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The reads run in one `Task.Run`, in today's order: `FetchProposed`, then `PromoteContext.Fetch` only when no Promote storey waits (`Read`) | Two parallel reads would keep §32's literal but read the standards for nothing on the waiting-storey path; §32's literal is rewritten instead (cheap) |
| E2 | Two hub hops, each with DocPin: "plan Promote (DD)" and "open the review of the changesets Promote filed" | The plan reads the model and shows its dialog; the review opens a window on it. `c` is never used after Execute returns (its `UIApplication` is the hub's `ui`) |
| E3 | The guard is released at the end of the filing (its `finally`), before the open hop is queued — not inside the open hop | `Open` checks the guard; one release per hop and no leak when the open hop is refused. The gap until the hub runs is benign: a picker or a report that takes the guard in it makes the open hop say so with `PromoteNotOpened(Busy, …)` — what was filed and where to review it (C7) — and the storey waits in the picker |
| E4 | `Plan` (the hub's job) wraps `PlanAndFile` (Execute's old body, unindented) with an idempotent `Once()` and a `handed` flag | The hub swallows a job's throw into a Doctor line (`RevitEventHub.cs:82`): a `finally` is the only way a throw releases the guard. `Interlocked.Exchange` makes the release once even if the waiting-storey path released already or the filing's `finally` raced an exception |
| E5 | The words and `Stalling` live in `PropertyPlanner`, beside `FileAll` and `FileRun` | It is pure and compiled by promote-check; `FileRun` already holds "what filing Promote's bodies did". No new file in the add-in |
| E6 | `ReviewChangesetsCommand.Open(ExternalCommandData…)` is deleted | Promote was its only caller (`:57`, `:216`); the MA-3b4 Next's "Open's UIApplication overload" already exists (MA-3b) |
| E7 | `Busy` stays a constant of the review command (now `internal`), checked by source scan | It is said by Revit-bound code only; `OpenHeld`, which a pure check pins, carries the same naming |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `tools/promote-check/Ma3b5.cs` (new) | 1 | §52 — Promote's words and its stall rule (pure) |
| `tools/promote-check/Check.cs` | 1, 2 | the new sections' calls |
| `tools/promote-check/Ma3b4.cs` | 1 | §49: `OpenHeld`'s literal names Promote |
| `SentinelAddin/GhostBuilder/PropertyPlanner.cs` | 1 | `PromoteReading`, `PromoteFiling`, `PromoteFiled`, `PromoteNotOpened`, `PromoteStopped`, `Stalling` |
| `SentinelAddin/Engine/UnreportedResults.cs` | 1 | `OpenHeld` names Promote |
| `tools/promote-check/Ma3b5Wiring.cs` (new) | 2 | §52b — Promote's reads, plan, filing and open hop (source scans) |
| `tools/promote-check/Ma2bWiring.cs`, `Ma2cWiring.cs`, `Ma2dWiring.cs`, `Ma3bDesk.cs` | 2 | §32, §35, §38 (label), §39, §43: Promote's literals follow the reshape |
| `SentinelAddin/Commands.ReviewChangesets.cs` | 2 | `Held`, `Hold`/`Release` internal, `Busy` internal and naming Promote; `Open(ExternalCommandData…)` deleted |
| `SentinelAddin/Commands.PromoteWalls.cs` | 2 | `Execute`, `Read`, `Plan`, `PlanAndFile`: the reads and the filing off Revit's thread, two DocPin hops |
| `docs/strategy/2026-09-30-model-automation-design.md` | 3 | what was built |

---

## Tasks (in order: the words and the stall rule; Promote's reshape and the guard; the design doc and the final checks. The merge follows the live drill)

### Task 1 — Words and the stall rule (pure, promote-check §52)

**Files:**
- Create: `tools/promote-check/Ma3b5.cs`
- Modify: `tools/promote-check/Check.cs` (the call list, after `Ma3b4GhostChecks();`)
- Modify: `tools/promote-check/Ma3b4.cs` (§49's `OpenHeld` literal, `:61`)
- Modify: `SentinelAddin/GhostBuilder/PropertyPlanner.cs` (after `FileAll`, `:516-518`)
- Modify: `SentinelAddin/Engine/UnreportedResults.cs` (`OpenHeld`, `:240-241`)

**Interfaces:**
- Produces: `PropertyPlanner.PromoteReading` (const), `PromoteFiling(int) → string`, `PromoteFiled(int, int) → string`, `PromoteNotOpened(string refusal, int filed, string title) → string`, `PromoteStopped(string why, bool opened) → string` (C6), `Stalling(Func<object, bool, string>) → Func<object, bool, string>`; `UnreportedResults.OpenHeld(int)` reworded.

- [ ] **Step 1: The failing check.** Create `tools/promote-check/Ma3b5.cs`:

```csharp
#nullable disable
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 52. MA-3b5: Promote reads and files off Revit's thread — the words of its wait and its stall rule (pure); its wiring is
    //        section 52b (Ma3b5Wiring.cs, source scans; drill MA3b5) ──────────────────────────────────────────────────────────────
    static void Ma3b5WordChecks()
    {
        Console.WriteLine("\nMA-3b5 — Promote's wait: its words and its stall rule");
        const string noAnswer = "the bridge did not answer within 120 s";
        var sent = new List<string>();
        var answers = new Queue<string>(new[] { null, noAnswer });
        var post = PropertyPlanner.Stalling((body, retry) => { sent.Add((string)body); return answers.Dequeue(); });
        var got = new[] { "GR-FFL", "01-FFL", "MA0 Roof" }.Select(b => post(b, false)).ToList();
        Ok(sent.SequenceEqual(new[] { "GR-FFL", "01-FFL" }) && got[0] == null && got[1] == noAnswer
           && got[2] == "not sent: an earlier filing of this run failed without a refusal from the bridge (the bridge did not answer within 120 s) — run Promote (DD) again once it answers", // C5
           "F4: after the first filing the bridge did not answer, the rest are not sent — Promote's guard waits one write timeout, never one per storey");
        var asked = new List<string>();
        var refusing = PropertyPlanner.Stalling((body, retry) => { asked.Add((string)body + (retry ? " again" : "")); return "Bridge 400: {\"error\":\"set_parameter: the source is not confirmed\"}"; });
        refusing("GR-FFL", false); refusing("GR-FFL", true); refusing("01-FFL", false);
        Ok(asked.SequenceEqual(new[] { "GR-FFL", "GR-FFL again", "01-FFL" }),
           "F4: a refusal (Bridge 4xx — FileAll's set_parameter retry among them) stalls nothing: the bridge answered");
        int calls = 0;
        object Body(string name) => new { name, elements = new[] { new { op = "retype" } }, exceptions = new object[0] };
        var run = PropertyPlanner.FileAll(new[] { Body("GR-FFL"), Body("01-FFL"), Body("MA0 Roof") }, PropertyPlanner.Stalling((body, retry) => ++calls == 1 ? null : noAnswer));
        Ok(calls == 2 && run.Failed.Count == 2 && run.Failed[0] == noAnswer && run.Failed[1].StartsWith("not sent: an earlier filing of this run", StringComparison.Ordinal),
           "F4 through FileAll: the third storey is never sent, and Promote's not-filed dialog counts it with why");
        Ok(PropertyPlanner.PromoteFiling(3) == "Promote (DD): filing 3 changeset(s) off Revit's thread — Revit stays usable, and the review opens by itself in this model once the bridge has answered. Until then, Review AI Proposals and a second Promote say they wait."
           && PropertyPlanner.PromoteReading.StartsWith("Promote (DD): reading the bridge", StringComparison.Ordinal) && PropertyPlanner.PromoteReading.Contains("Revit stays usable")
           && PropertyPlanner.PromoteFiled(2, 3) == "Promote (DD): 2 of 3 changeset(s) filed — the filing is done."
           && UnreportedResults.OpenHeld(1).Contains("a review window is open, a report is in flight, or Promote (DD) is reading or filing"),
           "the pane's Doctor log says when Promote reads, files and is done — Revit stays usable meanwhile; a model opened while Promote files says why its results wait (F3)");
        const string refusal = "Sentinel did not open the review of the changesets Promote filed: switch back to ma3b5-a — nothing was changed.";
        Ok(PropertyPlanner.PromoteNotOpened(refusal, 3, "ma3b5-a") == refusal + "\n\n3 changeset(s) Promote filed wait for review — in \"ma3b5-a\", run Review AI Proposals (or Promote (DD): it opens a Promote storey waiting for review before it plans again)."
           && PropertyPlanner.PromoteStopped("JsonException: bad", false) == "Promote's filing stopped — JsonException: bad\nWhat the bridge took before it stopped waits for review: run Promote (DD) again — it opens a Promote storey waiting for review before it plans again."
           && PropertyPlanner.PromoteStopped("JsonException: bad", true) == "Promote's filing stopped — JsonException: bad\nWhat the bridge took before it stopped waits for review — it opens by itself while this model is in front.", // C6
           "H5: a model switched or closed before the review opened is said with what was filed and where to review it — never opened in the wrong model; a filing that throws is said, and its words follow whether its review opens (C6)");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b4GhostChecks();
```

with:

```csharp
        Ma3b4GhostChecks();
        Ma3b5WordChecks();
```

In `tools/promote-check/Ma3b4.cs`, replace:

```csharp
        Ok(UnreportedResults.OpenHeld(2) == "2 result(s) applied in this model wait on this PC for the bridge — not sent now: a review window is open or a report is in flight. Once it is done, run Review AI Proposals in this model: it checks the model and sends them."
```

with:

```csharp
        Ok(UnreportedResults.OpenHeld(2) == "2 result(s) applied in this model wait on this PC for the bridge — not sent now: a review window is open, a report is in flight, or Promote (DD) is reading or filing. Once it is done, run Review AI Proposals in this model: it checks the model and sends them."
```

- [ ] **Step 2: See it fail.** From the repo root: `dotnet run --project tools/promote-check 2>&1 | grep -E "error CS|checks pass" | sort -u | head -5`
Expected: the build fails — `error CS0117: 'PropertyPlanner' does not contain a definition for 'Stalling'` (and the like for `PromoteFiling`, `PromoteReading`, `PromoteFiled`, `PromoteNotOpened`, `PromoteStopped`).

- [ ] **Step 3: The words and the stall rule.** In `SentinelAddin/GhostBuilder/PropertyPlanner.cs`, replace:

```csharp
            run.RowsNotFiled = carry?.Count ?? 0;
            return run;
        }
```

with:

```csharp
            run.RowsNotFiled = carry?.Count ?? 0;
            return run;
        }

        // ── MA-3b5: Promote reads and files off Revit's thread — the words of its wait, and its stall rule ──────────────────────────────

        /// <summary>MA-3b5: the pane's Doctor line when Promote starts reading (its dialog opens by itself once the reads are done).</summary>
        public const string PromoteReading = "Promote (DD): reading the bridge (the changesets waiting for review, the standards, the LOD matrix) off Revit's thread — Revit stays usable, and Promote's dialog opens by itself. Until then, Review AI Proposals and a second Promote say they wait.";

        /// <summary>MA-3b5: …when Promote starts filing, after Yes.</summary>
        public static string PromoteFiling(int n) =>
            $"Promote (DD): filing {n} changeset(s) off Revit's thread — Revit stays usable, and the review opens by itself in this model once the bridge has answered. Until then, Review AI Proposals and a second Promote say they wait.";

        /// <summary>MA-3b5: …when the filing is done and the guard is released.</summary>
        public static string PromoteFiled(int filed, int n) => $"Promote (DD): {filed} of {n} changeset(s) filed — the filing is done.";

        /// <summary>MA-3b5 (DocPin): the review of what Promote filed was not opened — the model was switched or closed meanwhile.</summary>
        public static string PromoteNotOpened(string refusal, int filed, string title) =>
            refusal + $"\n\n{filed} changeset(s) Promote filed wait for review — in \"{title}\", run Review AI Proposals (or Promote (DD): it opens a Promote storey waiting for review before it plans again).";

        /// <summary>MA-3b5: the filing threw — what the bridge took before it waits for review: opened by the open hop when something was
        /// filed (<paramref name="opened"/>, review C6 — true even when DocPin then refuses it, whose words say where), else by the next Promote.</summary>
        public static string PromoteStopped(string why, bool opened) =>
            $"Promote's filing stopped — {why}\nWhat the bridge took before it stopped waits for review" +
            (opened ? " — it opens by itself while this model is in front." : ": run Promote (DD) again — it opens a Promote storey waiting for review before it plans again.");

        /// <summary>MA-3b5 (F4): Promote's filing under MA-3b C6's rule (as UnreportedResults.WithdrawEach) — after the first filing the
        /// bridge did not answer (anything but a "Bridge 4xx" refusal: unreachable, a timeout, a 5xx), the rest are not sent, so Promote's
        /// guard waits one write timeout, never one per storey. A refusal — FileAll's set_parameter retry among them — stalls nothing.</summary>
        public static Func<object, bool, string> Stalling(Func<object, bool, string> post)
        {
            string stalled = null;
            return (body, retry) =>
            {
                if (stalled != null) return stalled;
                var err = post(body, retry);
                if (err != null && !err.StartsWith("Bridge 4", StringComparison.Ordinal))
                    stalled = $"not sent: an earlier filing of this run failed without a refusal from the bridge ({err}) — run Promote (DD) again once it answers"; // C5: a lost sign-in stalls too
                return err;
            };
        }
```

In `SentinelAddin/Engine/UnreportedResults.cs`, replace:

```csharp
            $"{n} result(s) applied in this model wait on this PC for the bridge — not sent now: a review window is open or a report is in flight. Once it is done, run Review AI Proposals in this model: it checks the model and sends them.";
```

with:

```csharp
            $"{n} result(s) applied in this model wait on this PC for the bridge — not sent now: a review window is open, a report is in flight, or Promote (DD) is reading or filing. Once it is done, run Review AI Proposals in this model: it checks the model and sends them.";
```

- [ ] **Step 4: See it pass.** `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"`
Expected: `802/802 checks pass` (797 + 5), no `FAIL` line.

- [ ] **Step 5: Commit.**

```bash
git add tools/promote-check/Ma3b5.cs tools/promote-check/Check.cs tools/promote-check/Ma3b4.cs SentinelAddin/GhostBuilder/PropertyPlanner.cs SentinelAddin/Engine/UnreportedResults.cs
git commit -m "feat(revit): MA-3b5 - the words of Promote's wait (reading, filing, filed, a review not opened in a switched model, a filing that stopped), the stall rule after the first filing the bridge did not answer, and OpenHeld naming Promote (promote-check 52)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2 — Revit: Promote's reads and filing off Revit's thread, the shared guard, two DocPin hops (source scans §52b)

**Files:**
- Create: `tools/promote-check/Ma3b5Wiring.cs`
- Modify: `tools/promote-check/Check.cs`
- Modify: `tools/promote-check/Ma2bWiring.cs` (§32, `:13`), `Ma2cWiring.cs` (§35, `:44`), `Ma2dWiring.cs` (§38's label `:23`, §39 `:55-56`), `Ma3bDesk.cs` (§43, `:230`)
- Modify: `SentinelAddin/Commands.ReviewChangesets.cs` (the guard `:30-35`; the `Open(ExternalCommandData…)` overload `:327-328`)
- Modify: `SentinelAddin/Commands.PromoteWalls.cs` (`Execute` `:36-217`)

**Interfaces:**
- Consumes: Task 1's words and `Stalling`; `RevitEventHub.Enqueue(Document, string, Action<UIApplication, Document>, Action<string>)` (`RevitEventHub.cs:44`); `ReviewChangesetsCommand.Open(UIApplication, Document, BcfConfig, string, IReadOnlyList<ChangesetDto>)` (`:334`); `GovernedNotify.Report(…, Dispatcher ui)` (`GovernedNotify.cs:97`).
- Produces: `ReviewChangesetsCommand.Held`, `Hold()`, `Release()`, `Busy` (internal); `PromoteWallsCommand.Read`, `Plan`, `PlanAndFile` (private).

- [ ] **Step 1: The failing checks.** Create `tools/promote-check/Ma3b5Wiring.cs`:

```csharp
#nullable disable

static partial class Check
{
    // ── 52b. MA-3b5: Promote's reads and filing off Revit's thread — source scans (Revit-bound; drill MA3b5 P-1, P-2) ───────────────────
    static void Ma3b5WiringChecks()
    {
        Console.WriteLine("\nMA-3b5 — Promote's reads and filing off Revit's thread (source scans)");
        string promote = Src("Commands.PromoteWalls.cs"), review = Src("Commands.ReviewChangesets.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        int exec = At(promote, "public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)");
        int busy = At(promote, "if (ReviewChangesetsCommand.Held)"), hold = At(promote, "ReviewChangesetsCommand.Hold();");
        int read = At(promote, "Task.Run(() => Read(cfg, key)).ContinueWith(read => App.Events.Enqueue(doc, \"plan Promote (DD)\", (ui, d) => Plan(ui, d, cfg, key, read),");
        Ok(exec > 0 && busy > exec && At(promote, "TaskDialog.Show(Title, ReviewChangesetsCommand.Busy);") > busy && hold > busy && read > hold
           && promote.Contains("why => { ReviewChangesetsCommand.Release(); TaskDialog.Show(Title, why); }), TaskScheduler.Default);")
           && Count(promote, "ReviewChangesetsCommand.Hold();") == 1 && Count(promote, "ExternalCommandData") == 1,
           "F1, E2: Promote checks the one guard and holds it on Revit's thread, reads off it, and plans back on it in the model it started from (DocPin) — a refused plan releases the guard; the command's data is never used after Execute returns");
        int once = At(promote, "void Once() { if (System.Threading.Interlocked.Exchange(ref held, 0) == 1) ReviewChangesetsCommand.Release(); }");
        int guarded = At(promote, "try { handed = PlanAndFile(ui, doc, cfg, key, read, Once); }");
        int rebound = At(promote, "if (ProjectContext.For(doc).Key != key)"), status = At(promote, "if (read.Status != TaskStatus.RanToCompletion)");
        int let = At(promote, "release(); // Open checks the guard"), waiting = At(promote, "ReviewChangesetsCommand.Open(ui, doc, cfg, key, StoreyBatch.Of(pending, unreviewed));");
        Ok(once > 0 && guarded > once && promote.Contains("finally { if (!handed) Once(); }") && rebound > guarded && status > rebound && let > status && waiting > let
           && promote.Contains("This model's project changed while Promote read the bridge (was {key}) — nothing was planned or filed. Run Promote (DD) again.")
           && Count(promote, "ReviewChangesetsCommand.Release();") == 2,
           "E4: the plan releases the guard exactly once on every way out but the filing — a refusal, No, a throw the hub swallows — and before a waiting storey opens (Open checks it); C4: a model re-bound during the reads plans and files nothing");
        int pane = At(promote, "var pane = System.Windows.Threading.Dispatcher.CurrentDispatcher;");
        int pool = pane < 0 ? -1 : promote.IndexOf("Task.Run(() =>", pane, StringComparison.Ordinal);
        int filing = At(promote, "var run = PropertyPlanner.FileAll(bodies, PropertyPlanner.Stalling((body, retry) =>");
        int receipt = At(promote, "plans.SelectMany(p => p.Held).Select(h => h.UniqueId).Distinct().Count(), filedIds, actor), key, pane);");
        int done = At(promote, "finally { release(); }"), open = At(promote, "App.Events.Enqueue(doc, \"open the review of the changesets Promote filed\", (u, d) =>");
        int busyHop = At(promote, "if (ReviewChangesetsCommand.Held) { TaskDialog.Show(Title, PropertyPlanner.PromoteNotOpened(ReviewChangesetsCommand.Busy, filed.Count, title)); return; }");
        Ok(pane > 0 && pool > pane && filing > pool && done > filing && receipt > done && open > receipt && busyHop > open
           && promote.IndexOf("ReviewChangesetsCommand.Open(u, d, cfg, key, StoreyBatch.Of(filed, first));", StringComparison.Ordinal) > busyHop
           && promote.Contains("why => TaskDialog.Show(Title, PropertyPlanner.PromoteNotOpened(why, filed.Count, title)")
           && promote.Contains("if (first == null) { App.Events.Enqueue(_ => TaskDialog.Show(Title, said)); return; }")
           && promote.Contains("catch (Exception ex) { said = PropertyPlanner.PromoteStopped($\"{ex.GetType().Name}: {ex.Message}\", first != null); }")
           && promote.Contains("catch (Exception ex) { said += (said.Length > 0 ? \"\\n\" : \"\") + $\"Promote's receipt was not sent — {ex.GetType().Name}: {ex.Message}\"; }"),
           "the filing runs on a pool thread under the stall rule (F4); the guard is released before the receipt and the review are queued (E3); the receipt goes out on every path that filed something, its Doctor line through Revit's dispatcher (S3, MA-3b2b C1e, C6); the review opens in this model only, a guard taken in the gap is said with what was filed (C7) — a refusal says what was filed and where; a filing that throws is said");
        Ok(!promote.Contains("GetAwaiter().GetResult()") && !promote.Contains(".Wait(") && Count(promote, "Task.Run(") == 2
           && review.Contains("internal static bool Held => Volatile.Read(ref _holds) > 0;") && review.Contains("internal static void Hold() =>") && review.Contains("internal static void Release() =>")
           && !review.Contains("Open(ExternalCommandData") && !review.Contains("two minutes at most")
           && review.Contains("internal const string Busy = \"A review window is open, a result is still being reported to the bridge, or Promote (DD) is reading or filing"),
           "AI-2, XC-3: nothing in Promote waits for the bridge on Revit's thread; the guard is the review's (F1), and its words name Promote with no time bound a filing cannot keep (F3)");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b5WordChecks();
```

with:

```csharp
        Ma3b5WordChecks();
        Ma3b5WiringChecks();
```

In `tools/promote-check/Ma2bWiring.cs`, replace:

```csharp
        Ok(Count(promote, "PromoteContext.Fetch(") == 1 && promote.Contains("Task.Run(() => PromoteContext.Fetch(key))")
```

with:

```csharp
        Ok(Count(promote, "PromoteContext.Fetch(") == 1 && promote.Contains("? null : PromoteContext.Fetch(key));") && promote.Contains("Task.Run(() => Read(cfg, key))") // MA-3b5: in Read, on a pool thread
```

In `tools/promote-check/Ma2cWiring.cs`, replace:

```csharp
        Ok(promote.Contains("var run = PropertyPlanner.FileAll(bodies, (body, retry) =>")
```

with:

```csharp
        Ok(promote.Contains("var run = PropertyPlanner.FileAll(bodies, PropertyPlanner.Stalling((body, retry) =>") // MA-3b5 (F4): under the stall rule
```

In `tools/promote-check/Ma2dWiring.cs`, replace:

```csharp
           "Promote's first Propose is off the API thread too: C22's wrap of the retry is now the client's, for both");
```

with:

```csharp
           "Promote's Propose — the first and the retry — goes through the client's pool thread, and since MA-3b5 Promote's filing itself runs on a pool thread: nothing on Revit's thread waits for it");
```

In `tools/promote-check/Ma2dWiring.cs`, replace:

```csharp
           && promote.Contains("ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(pending, unreviewed))")
           && promote.Contains("ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(filed, first))")
```

with:

```csharp
           && promote.Contains("ReviewChangesetsCommand.Open(ui, doc, cfg, key, StoreyBatch.Of(pending, unreviewed))") // MA-3b5: the plan hop's UIApplication
           && promote.Contains("ReviewChangesetsCommand.Open(u, d, cfg, key, StoreyBatch.Of(filed, first))") // MA-3b5: the open hop, DocPin
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           && review.Contains("Open(c.Application, doc, cfg, key, batch)") && review.Contains("StoreyBatch.Entries(pending).Select(e => (StoreyBatch.Line(e, DateTime.UtcNow), Waiting(key, e), e))"),
```

with:

```csharp
           && Src("Commands.PromoteWalls.cs").Contains("ReviewChangesetsCommand.Open(ui, doc, cfg, key, StoreyBatch.Of(pending, unreviewed));") // MA-3b5: Promote's Open is the UIApplication one
           && review.Contains("StoreyBatch.Entries(pending).Select(e => (StoreyBatch.Line(e, DateTime.UtcNow), Waiting(key, e), e))"),
```

- [ ] **Step 2: See them fail.** `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"`
Expected: eight `FAIL` lines — §52b's four, and one each of §32 (`no network call on Revit's API thread: the matrix and the DD IDS …`), §35 (`Promote files through FileAll: …`), §39 (`Review AI Proposals and Promote open a Promote storey's changesets in one window, …`) and §43 (`AI-2: a changeset whose result waits on this PC is never opened for review again — …`) — and `798/806 checks pass`.

- [ ] **Step 3: The guard, shared.** In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    private static int _holds;
    private static void Hold() => Interlocked.Increment(ref _holds);
    private static void Release() => Interlocked.Decrement(ref _holds);
    private const string Title = "Sentinel — AI proposals";
    private const string Busy = "A review window is open, or a result is still being reported to the bridge — finish or close the window, or wait for its report (two minutes at most), then run Review AI Proposals again.";
```

with:

```csharp
    // MA-3b5 (F1): Promote (DD) holds it too, while it reads and files — so a picker never lists a storey whose parts are still being filed.
    private static int _holds;
    internal static bool Held => Volatile.Read(ref _holds) > 0;
    internal static void Hold() => Interlocked.Increment(ref _holds);
    internal static void Release() => Interlocked.Decrement(ref _holds);
    private const string Title = "Sentinel — AI proposals";
    internal const string Busy = "A review window is open, a result is still being reported to the bridge, or Promote (DD) is reading or filing — finish or close the window, or wait until the pane's Doctor log says the report or Promote's filing is done, then run the command again.";
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    /// <summary>Promote's entry (MA-0): the review window on <paramref name="batch"/>.</summary>
    internal static bool Open(ExternalCommandData c, Document doc, BcfConfig cfg, string key, IReadOnlyList<ChangesetDto> batch) => Open(c.Application, doc, cfg, key, batch);

```

with:

```csharp
```

- [ ] **Step 4: Promote's reads and plan hop.** In `SentinelAddin/Commands.PromoteWalls.cs`, replace:

```csharp
        var cfg = BcfConfig.Load();
        var key = ctx.Key;

        var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
        if (pending == null)
        {
            TaskDialog.Show(Title, $"Couldn't reach the bridge:\n{fetchErr}");
            return Result.Failed;
        }
        var unreviewed = pending.FirstOrDefault(p => p.Source == "promote");
        if (unreviewed != null) // MA-2d: with the rest of its storey (StoreyBatch)
            return ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(pending, unreviewed)) ? Result.Succeeded : Result.Cancelled;

        // The standards, the LOD matrix and (MA-2b) its DD stage IDS, off the API thread (the Annotate pattern) — PromoteContext, which
        // the review's check before commit reads too — then the facts (on it).
        var pc = Task.Run(() => PromoteContext.Fetch(key)).GetAwaiter().GetResult();
        var standards = pc.Standards;
```

with:

```csharp
        // MA-3b5 (F1): one guard with the review — while Promote reads or files, a second Promote and Review AI Proposals are refused in
        // words (the frozen thread used to be the guard); while a review window is open or a report is in flight, Promote is.
        if (ReviewChangesetsCommand.Held)
        {
            TaskDialog.Show(Title, ReviewChangesetsCommand.Busy);
            return Result.Cancelled;
        }
        var cfg = BcfConfig.Load();
        var key = ctx.Key;
        ReviewChangesetsCommand.Hold(); // released by Plan (E4), or by the filing it hands the guard to (E3)
        App.PanelVm?.LogDoctor(PropertyPlanner.PromoteReading);
        // MA-3b5 (XC-3): the reads off Revit's thread; the plan and its dialog back on it, in the model Promote started from (DocPin): a
        // model switched or closed meanwhile is said, nothing is planned or filed, and the guard is released.
        Task.Run(() => Read(cfg, key)).ContinueWith(read => App.Events.Enqueue(doc, "plan Promote (DD)", (ui, d) => Plan(ui, d, cfg, key, read),
            why => { ReviewChangesetsCommand.Release(); TaskDialog.Show(Title, why); }), TaskScheduler.Default);
        return Result.Succeeded;
    }

    // MA-3b5 (E1): Promote's reads, on a pool thread — the changesets waiting for review, then, only when no Promote storey waits (that one
    // is opened instead), the standards, the LOD matrix and (MA-2b) its DD stage IDS: PromoteContext, which the review's check before commit
    // reads too.
    private static (List<ChangesetDto> Pending, string Err, PromoteContext Pc) Read(BcfConfig cfg, string key)
    {
        var pending = ChangesetClient.FetchProposed(cfg, key, out var err);
        return (pending, err, pending == null || pending.Any(p => p.Source == "promote") ? null : PromoteContext.Fetch(key));
    }

    // MA-3b5 (E4): the event hub's job, on Revit's thread in the pinned model. The guard Execute took is released exactly once (Once): here
    // when the plan ends — a refusal, No, a throw (the hub swallows it into a Doctor line) — or before a waiting storey opens; or by the
    // filing it was handed to.
    private static void Plan(UIApplication ui, Document doc, BcfConfig cfg, string key, Task<(List<ChangesetDto> Pending, string Err, PromoteContext Pc)> read)
    {
        var held = 1;
        void Once() { if (System.Threading.Interlocked.Exchange(ref held, 0) == 1) ReviewChangesetsCommand.Release(); }
        var handed = false;
        try { handed = PlanAndFile(ui, doc, cfg, key, read, Once); }
        finally { if (!handed) Once(); }
    }

    // Execute's body before MA-3b5, its reads handed in: plans on Revit's thread, asks, and hands the guard to the filing (true) or not.
    private static bool PlanAndFile(UIApplication ui, Document doc, BcfConfig cfg, string key, Task<(List<ChangesetDto> Pending, string Err, PromoteContext Pc)> read, Action release)
    {
        // Review C4: DocPin checks which model is in front, not its project — a model re-bound (Project Setup) during the reads would plan
        // with the old key's standards and file into the old key.
        if (ProjectContext.For(doc).Key != key)
        {
            TaskDialog.Show(Title, $"This model's project changed while Promote read the bridge (was {key}) — nothing was planned or filed. Run Promote (DD) again.");
            return false;
        }
        if (read.Status != TaskStatus.RanToCompletion)
        {
            TaskDialog.Show(Title, "Promote could not read the bridge — " + (read.Exception?.GetBaseException().Message ?? "the read did not finish") + "\nNothing was planned or filed.");
            return false;
        }
        var (pending, fetchErr, pc) = read.Result;
        if (pending == null)
        {
            TaskDialog.Show(Title, $"Couldn't reach the bridge:\n{fetchErr}");
            return false;
        }
        var unreviewed = pending.FirstOrDefault(p => p.Source == "promote");
        if (unreviewed != null) // MA-2d: with the rest of its storey (StoreyBatch)
        {
            release(); // Open checks the guard
            ReviewChangesetsCommand.Open(ui, doc, cfg, key, StoreyBatch.Of(pending, unreviewed));
            return false;
        }

        var standards = pc.Standards;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace:

```csharp
            TaskDialog.Show(Title, $"Guideline: {standards.GuidelineSource.Label}\n\nNo DD rule file is installed for \"{key}\" or its office — nothing to plan. Install one as guideline@n.");
            return Result.Cancelled;
```

with:

```csharp
            TaskDialog.Show(Title, $"Guideline: {standards.GuidelineSource.Label}\n\nNo DD rule file is installed for \"{key}\" or its office — nothing to plan. Install one as guideline@n.");
            return false;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace:

```csharp
            TaskDialog.Show(Title, PlacementPolicy.TemplateRefusal(officeAll, standards.CatalogSource.Label));
            return Result.Cancelled;
```

with:

```csharp
            TaskDialog.Show(Title, PlacementPolicy.TemplateRefusal(officeAll, standards.CatalogSource.Label));
            return false;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace:

```csharp
            TaskDialog.Show(Title, "Nothing to promote in this model." + (notRun.Count > 0 ? "\n\n" + string.Join("\n", notRun) : ""));
            return Result.Cancelled;
```

with:

```csharp
            TaskDialog.Show(Title, "Nothing to promote in this model." + (notRun.Count > 0 ? "\n\n" + string.Join("\n", notRun) : ""));
            return false;
```

- [ ] **Step 5: The filing and the open hop.** In `SentinelAddin/Commands.PromoteWalls.cs`, replace:

```csharp
        if (dlg.Show() != TaskDialogResult.Yes) return Result.Succeeded; // read-only run

        ChangesetDto first = null;
        var filedIds = new List<string>(); // MA-1a item 8: the changesets this run filed, for its receipt
        var filed = new List<ChangesetDto>(); // MA-2d: the first storey's changesets are opened together
        // Review amendments C4 and C24: a set_parameter the bridge refuses (its source not confirmed now, or a bridge older than the op)
        // never costs the storey its retypes and attaches — the body is filed again without its type edits, each one an exception that
        // says why — and the held rows of a body not filed ride on the next one filed (FileAll).
        var run = PropertyPlanner.FileAll(bodies, (body, retry) =>
        {
            string err = null;
            // Review C22, MA-2d: ChangesetClient sends every request off the API thread (Send) — the first attempt and the retry alike;
            // Revit still waits for the answer, as for PromoteContext.Fetch.
            var cs = ChangesetClient.Propose(cfg, key, body, out err);
            if (cs == null) return err ?? "not filed";
            first ??= cs;
            filed.Add(cs);
            filedIds.Add(cs.Id);
            return null;
        });
        var failed = run.Failed;
        var typeEditsNotFiled = run.TypeEditsNotFiled;
        if (filedIds.Count > 0)
        {
            // MA-1a item 8: the planner's build:run receipt for the run that filed these changesets — deterministic, so no
            // model and no tokens; its gaps are the elements it sent to a person.
            var receipt = new BuildReceipt.Facts { Seconds = plannerClock.Elapsed.TotalSeconds, Candidates = (classes.Contains("Walls") ? walls.Count : 0) + others.Count };
            receipt.Parameters["classes"] = classes.ToArray();
            receipt.Parameters["guideline"] = standards.GuidelineSource.Label;
            receipt.Parameters["lod_matrix"] = pc.MxLabel;
            GovernedNotify.Report("Promote receipt", BuildReceipt.Run("promote", BuildReceipt.AddinSha256, receipt,
                plans.SelectMany(p => p.Held).Select(h => h.UniqueId).Distinct().Count(), filedIds, actor), key);
        }
        if (failed.Count > 0 || typeEditsNotFiled > 0)
            TaskDialog.Show(Title, (typeEditsNotFiled > 0 ? $"{typeEditsNotFiled} type edit(s) not filed — see Sent to a person (the bridge refused their source; a person fills them in Revit)\n" : "") +
                                   (run.RowsNotFiled > 0 ? $"{run.RowsNotFiled} row(s) sent to a person reached no changeset — they are listed only in Promote's dialog\n" : "") +
                                   (failed.Count > 0 ? $"{failed.Count} of {bodies.Count} changeset(s) were not filed:\n" + string.Join("\n", failed.Take(5)) : ""));
        if (first == null) return Result.Failed;
        return ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(filed, first)) ? Result.Succeeded : Result.Cancelled;
    }
```

with:

```csharp
        if (dlg.Show() != TaskDialogResult.Yes) return false; // read-only run

        // MA-3b5 (XC-3): the filing runs off Revit's thread — Revit stays usable, and the guard stays held until the bridge has answered the
        // last filing: the filing's finally releases it before the review is queued (E3: Open checks it). The receipt's Doctor line goes
        // through Revit's own dispatcher (S3, MA-3b2b C1e: a pool thread's never pumps); the review opens back on Revit's thread in this
        // model only (DocPin), and a refusal says what was filed and where to review it.
        var pane = System.Windows.Threading.Dispatcher.CurrentDispatcher;
        var title = doc.Title;
        App.PanelVm?.LogDoctor(PropertyPlanner.PromoteFiling(bodies.Count));
        Task.Run(() =>
        {
            ChangesetDto first = null;
            var filedIds = new List<string>(); // MA-1a item 8: the changesets this run filed, for its receipt
            var filed = new List<ChangesetDto>(); // MA-2d: the first storey's changesets are opened together
            string said;
            try
            {
                // Review amendments C4 and C24: a set_parameter the bridge refuses (its source not confirmed now, or a bridge older than the
                // op) never costs the storey its retypes and attaches — the body is filed again without its type edits, each one an exception
                // that says why — and the held rows of a body not filed ride on the next one filed (FileAll). MA-3b5 (F4): after the first
                // filing the bridge did not answer, the rest are not sent (Stalling).
                var run = PropertyPlanner.FileAll(bodies, PropertyPlanner.Stalling((body, retry) =>
                {
                    string err = null;
                    // Review C22, MA-2d: ChangesetClient sends every request off the API thread (Send) — the first attempt and the retry
                    // alike; MA-3b5: and this filing runs on a pool thread, so nobody on Revit's thread waits for the answer.
                    var cs = ChangesetClient.Propose(cfg, key, body, out err);
                    if (cs == null) return err ?? "not filed";
                    first ??= cs;
                    filed.Add(cs);
                    filedIds.Add(cs.Id);
                    return null;
                }));
                var failed = run.Failed;
                var typeEditsNotFiled = run.TypeEditsNotFiled;
                said = failed.Count == 0 && typeEditsNotFiled == 0 ? ""
                    : (typeEditsNotFiled > 0 ? $"{typeEditsNotFiled} type edit(s) not filed — see Sent to a person (the bridge refused their source; a person fills them in Revit)\n" : "") +
                      (run.RowsNotFiled > 0 ? $"{run.RowsNotFiled} row(s) sent to a person reached no changeset — they are listed only in Promote's dialog\n" : "") +
                      (failed.Count > 0 ? $"{failed.Count} of {bodies.Count} changeset(s) were not filed:\n" + string.Join("\n", failed.Take(5)) : "");
            }
            catch (Exception ex) { said = PropertyPlanner.PromoteStopped($"{ex.GetType().Name}: {ex.Message}", first != null); }
            finally { release(); }
            // Review C6: the receipt on every path that filed something — a filing that threw after some storeys too; a throw here is said,
            // never left to end this pool thread before the open hop.
            if (filedIds.Count > 0)
            {
                try
                {
                    // MA-1a item 8: the planner's build:run receipt for the run that filed these changesets — deterministic, so no
                    // model and no tokens; its gaps are the elements it sent to a person.
                    var receipt = new BuildReceipt.Facts { Seconds = plannerClock.Elapsed.TotalSeconds, Candidates = (classes.Contains("Walls") ? walls.Count : 0) + others.Count };
                    receipt.Parameters["classes"] = classes.ToArray();
                    receipt.Parameters["guideline"] = standards.GuidelineSource.Label;
                    receipt.Parameters["lod_matrix"] = pc.MxLabel;
                    GovernedNotify.Report("Promote receipt", BuildReceipt.Run("promote", BuildReceipt.AddinSha256, receipt,
                        plans.SelectMany(p => p.Held).Select(h => h.UniqueId).Distinct().Count(), filedIds, actor), key, pane);
                }
                catch (Exception ex) { said += (said.Length > 0 ? "\n" : "") + $"Promote's receipt was not sent — {ex.GetType().Name}: {ex.Message}"; }
            }
            App.PanelVm?.LogDoctor(PropertyPlanner.PromoteFiled(filed.Count, bodies.Count));
            // Nothing filed: the words alone, in whichever model is in front — a dialog changes nothing (S4).
            if (first == null) { App.Events.Enqueue(_ => TaskDialog.Show(Title, said)); return; }
            App.Events.Enqueue(doc, "open the review of the changesets Promote filed", (u, d) =>
            {
                if (said.Length > 0) TaskDialog.Show(Title, said);
                // Review C7: a picker or a report that took the guard after the filing released it (E3) — said with what was filed and where.
                if (ReviewChangesetsCommand.Held) { TaskDialog.Show(Title, PropertyPlanner.PromoteNotOpened(ReviewChangesetsCommand.Busy, filed.Count, title)); return; }
                ReviewChangesetsCommand.Open(u, d, cfg, key, StoreyBatch.Of(filed, first));
            }, why => TaskDialog.Show(Title, PropertyPlanner.PromoteNotOpened(why, filed.Count, title) + (said.Length > 0 ? "\n\n" + said : "")));
        });
        return true;
    }
```

- [ ] **Step 6: See them pass, and the build.** `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"`
Expected: `806/806 checks pass`, no `FAIL` line.
Then `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "error CS|Warning\(s\)|Error\(s\)"`
Expected: `0 Error(s)`, `5 Warning(s)` (master's own count; no `error CS`).

- [ ] **Step 7: Commit.**

```bash
git add tools/promote-check/Ma3b5Wiring.cs tools/promote-check/Check.cs tools/promote-check/Ma2bWiring.cs tools/promote-check/Ma2cWiring.cs tools/promote-check/Ma2dWiring.cs tools/promote-check/Ma3bDesk.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/Commands.PromoteWalls.cs
git commit -m "feat(revit): MA-3b5 - Promote reads and files off Revit's thread: the reads on a pool thread, the plan and its dialog back on Revit's thread in the model Promote started from (DocPin), the filing on a pool thread under the stall rule, the review opened by itself through a second DocPin hop that says what was filed when the model was switched or closed; one guard with the review (a second Promote and Review AI Proposals refused in words that name Promote); the receipt's Doctor line through Revit's dispatcher (C1e); Open(ExternalCommandData) deleted (promote-check 52b)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3 — Words: the design doc; the final checks

**Files:**
- Modify: `docs/strategy/2026-09-30-model-automation-design.md` (the end of the AI-2 line at `:1107`)

- [ ] **Step 1: The design doc says what was built.** In `docs/strategy/2026-09-30-model-automation-design.md`, replace:

```markdown
Promote's own waits (its reads and its filing) are MA-3b5.
```

with:

```markdown
Promote's own waits (its reads and its filing): LANDED in MA-3b5 (merge 2026-10-05), drill MA3b5: P-1 and P-2 (the open hop) passed; owed: P-2 (the plan hop live), Revit 2025–2027 — Promote reads on a pool thread, plans and asks back on Revit's thread in the model it started from (DocPin), files on a pool thread (after the first filing the bridge did not answer, the rest are not sent) and opens the review by itself through a second DocPin hop; it shares the review's guard, so a second Promote or Review AI Proposals during its wait is refused in words that name it. Its dialog counting carried declines is MA-3b6.
```

- [ ] **Step 2: The final checks.** From the repo root, every check project:

```bash
for d in tools/*-check; do ls $d/*.csproj >/dev/null 2>&1 || continue; printf "%s: " $(basename $d); dotnet run --project $d 2>&1 | grep -E "checks? pass|DATUM OK" | tail -1; done
```

Expected: 26 lines — `promote-check: 806/806 checks pass`, the other 24 that count as on master (together with it `2423/2423`: master's 2414 + 9) — and `datum-check: DATUM OK`. `tools/rvtinfo-check` has no project and is skipped. Then the builds, each with `-p:DeployToRevit=false`:

```bash
for v in 2022 2023 2024 2025 2026 2027; do printf "%s: " $v; dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Warning\(s\)|Error\(s\)" | tr '\n' ' '; echo; done
```

Expected: 2022 `3 Warning(s) 0 Error(s)`, 2023 `3`/`0`, 2024 `5`/`0`, 2025 `1`/`0`, 2026 `1`/`0`, 2027 `3`/`0` — master's own counts.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -m "docs: MA-3b5 - the design doc says what was built (Promote reads and files off Revit's thread, two DocPin hops, the shared guard); drill MA3b5 pending" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Live drill MA3b5 (two Revit rows, on Revit 2024 on the branch's build, against a test bridge behind a door that holds the first filing 90 s and, in P-2, the first read — before the merge)

**The founder's OK (F5): given** in the request that started this slice ("MA-3b5 go, deploy the ma3b5 branch to 2024"). It covers deploying the branch's build to Revit 2024 for this drill; nothing else (no other Revit version, no bridge restart). The founder's 4100 bridge is **not** touched and not restarted: every row runs against the test bridge on `127.0.0.1:4102` behind the drill's door on `127.0.0.1:4101`.

**Who does what.** The runner drives Revit by mouse (or UI Automation's Invoke), Revit signed in (Standards ▸ Sign in — the founder's). **Focus-sensitive steps** — reading a dialog, the review window, the pane's Doctor log — happen while Revit is in front, or are the founder's: a script cannot take focus from Chrome, and Revit's owned windows hide from UI Automation while Revit is in the background (a hidden window looked closed in MA3a). TaskDialog buttons have no UIA Invoke (`WindowPattern.Close` works; Yes on Promote's dialog is a mouse click or the `Y` key while it has focus). Revit's Undo list opens at its dropdown (`133,10`): read it, **never click an entry**. The pane's lists virtualize (read them via `ScrollPattern`; the Doctor log is newest first; a line is found by its head among the newest 20 — MA-3b4 C5). The Revit MCP: only its read-only calls (`get_selected_elements`), never while a TaskDialog or a Sentinel window is open. After "Load Once" on the unsigned add-in prompt, open the Sentinel tab through UI Automation if the ribbon ignores clicks.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run (tight scope; the OK is 2024's); the code is the same on net8/net10 and builds there (Task 3).
- **The stall rule live** (a door that never answers: 120 s): pure check §52.
- **A filing that throws**: words (§52) and scan (§52b).
- **MA-3b4's owed rows** (R-3, the open-time guard live, Ghost Builder's decline path live) and the earlier ones stay owed; this drill does not carry them.

**Set-up (once; the deploy on F5's OK):**
- **The test bridge on 127.0.0.1:4102** — the preview server `bridge-4102` (`.claude/launch.json`: `node <scratchpad>/ma3b2b/bridge-4102.mjs`, `cwd` `WebApp`, port 4102; the file is two lines, written again if gone: `process.env.BCF_PORT = "4102"; process.env.BCF_EVENT_POLL_MS = "0";` then `await import("file:///C:/Users/yazan/Claude/Projects/Co%20BIM%20Assistant/sentinel-project/WebApp/bridge/bcf-service.mjs");`). It runs this checkout's bridge code (unchanged by this slice).
- **The drill's door on 127.0.0.1:4101** — the preview server `ma3b5-door` (`node <scratchpad>/ma3b5/door.mjs`, port 4101); not in the repository:

  ```js
  // Drill MA3b5's door: 127.0.0.1:4101 -> the test bridge on 127.0.0.1:4102. With an empty file "slowfile" beside this script, the
  // answer to the FIRST POST /changesets/<key> (a filing: no further path segment) is held SLOW_MS (90 s — review C2) after the bridge
  // answered — the bridge has filed it. With an empty file "slowread", the FIRST GET /changesets/<key>?status=proposed is held the same
  // way (review C9: the add-in gives up at 8 s). Everything else passes at once. Restart the door for another.
  import http from "node:http";
  import { existsSync } from "node:fs";
  const SLOW_MS = Number(process.env.SLOW_MS || 90000);
  const has = (f) => existsSync(new URL(f, import.meta.url));
  let filed = false, read = false;
  http.createServer((req, res) => {
    const filing = !filed && req.method === "POST" && /^\/changesets\/[^/?]+$/.test(req.url) && has("slowfile");
    const reading = !read && req.method === "GET" && /^\/changesets\/[^/?]+\?status=proposed$/.test(req.url) && has("slowread");
    if (filing) filed = true;
    if (reading) read = true;
    const slow = filing || reading;
    const up = http.request({ host: "127.0.0.1", port: 4102, method: req.method, path: req.url, headers: req.headers }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const send = () => { try { res.writeHead(r.statusCode, r.headers); res.end(Buffer.concat(chunks)); } catch (e) { console.log(`not delivered ${req.url}: ${e.message}`); } };
        if (!slow) return send();
        console.log(`held ${req.method} ${req.url} (${r.statusCode}) for ${SLOW_MS} ms - the bridge answered at ${new Date().toISOString()}`);
        setTimeout(() => { console.log(`answered ${req.url} at ${new Date().toISOString()}`); send(); }, SLOW_MS);
      });
    });
    up.on("error", (e) => { res.writeHead(502, { "Content-Type": "text/plain" }); res.end(`drill door: the test bridge on 4102 did not answer - ${e.message}`); });
    req.pipe(up);
  }).listen(4101, "127.0.0.1", () => console.log("drill door MA3b5 on 127.0.0.1:4101 -> 4102"));
  ```

  `<scratchpad>/ma3b5/slowfile` is an empty file, created before P-1; `<scratchpad>/ma3b5/slowread` is created before P-2 (C9). Every bridge call of the runner goes through MA3b4's helper on 4101 (it masks e-mail addresses; the machine credential is read through `load-env.mjs`, never printed), from `WebApp`: `node <scratchpad>/ma3b4/b4101.mjs <METHOD> <path> [body]`, written `b4101` below.
- **The project: `ma3b5`** under `ma3b3-office` (MA3b3's scratch office: the DD guideline, the type catalogue, the LOD matrix, the ruleset), every member of `ma3b3` copied with that member's role — the founder's account among them, matching no address (review C3). `<scratchpad>/ma3b5/setup.mjs` (from `WebApp`; never prints an address):

  ```js
  const m = await import("file:///C:/Users/yazan/Claude/Projects/Co%20BIM%20Assistant/sentinel-project/WebApp/bridge/load-env.mjs");
  const H = { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || "") };
  const B = "http://127.0.0.1:4101/";
  const call = async (method, path, body) => { const r = await fetch(B + path, { method, headers: H, ...(body ? { body: JSON.stringify(body) } : {}) }); console.log(method, path, r.status); return r; };
  const mem = await (await fetch(B + "cde/ma3b3/members", { headers: H })).json();
  const list = Array.isArray(mem) ? mem : mem.members;
  await call("POST", "cde/projects", { key: "ma3b5", office_key: "ma3b3-office" });
  for (const x of list) await call("POST", "cde/ma3b5/members", { email: x.email, role: x.role }); // review C3: every member, its role, no address matched
  ```

  Then `b4101 GET "changesets/ma3b5?status=proposed"` — expect none.
- **The add-in's bridge settings.** With Revit closed: copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma3b5bak` beside it (never print it, never open it in a viewer); point it at the door: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The deploy (F5).** Record the deployed `Sentinel.dll`'s sha256 under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`); with Revit closed, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build); record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The scratch models.** `Documents\Sentinel drills\ma3b5\ma3b5-a.rvt` and `ma3b5-b.rvt`, two copies of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), each opened from Revit's Open dialog ("Create New Local" unticked if offered); `ma3b5-a` bound with Sentinel ▸ Project Setup to `ma3b5`, `ma3b5-b` left unbound; **never saved**. `ma3b5-a` in front, a floor plan of GR-FFL its active view. Revit signed in.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| P-1 — Promote files while Revit stays usable; nothing runs twice; the review opens by itself | `slowfile` exists and the door was (re)started after it (`SLOW_MS` 90 s, its default — C2). In `ma3b5-a`, Revit in front: Sentinel ▸ Promote (DD); read the pane's Doctor log (the newest 20, by head); in Promote's dialog read the headline, then **Yes** — note the time. Within the 90 s, Revit in front, **noting the time each answer appears** (C1): **(a)** click a wall in the view; `get_selected_elements` (Revit MCP, read-only — it runs on Revit's thread, so its reply time is a witness); **(b)** Sentinel ▸ Review AI Proposals: read the dialog, close it (`WindowPattern.Close`); **(c)** Sentinel ▸ Promote (DD): read the dialog, close it. Then wait: **(d)** the review window opens by itself — note the time; read its title; close it without Apply. **(e)** the Doctor log's newest 20 lines (via ScrollPattern). `b4101 GET "changesets/ma3b5?status=proposed"` (count and names). The door's log (its `held …` and `answered …` times) | The first Doctor line `Promote (DD): reading the bridge (…) off Revit's thread — Revit stays usable, and Promote's dialog opens by itself. …`; Promote's dialog `File 3 changeset(s)?` (MA3b3: GR-FFL, 01-FFL, MA0 Roof; another count is recorded as it is); after Yes the line `Promote (DD): filing 3 changeset(s) off Revit's thread — …`; **(a)** the selection is the wall clicked; **(b)** a `Sentinel — AI proposals` dialog with the words `A review window is open, a result is still being reported to the bridge, or Promote (DD) is reading or filing — …`, no picker; **(c)** a `Sentinel — Promote (DD)` dialog with the same words, no second "reading" Doctor line; **and (a)–(c) all appeared before the door's `answered …` time** (C1); **(d)** the review window on `Promote (DD) · <storey>` opens by itself, at least 90 s after Yes (the door's `held …` and `answered …` lines), with no dialog before it; **(e)** the lines `Promote (DD): 3 of 3 changeset(s) filed — the filing is done.` and `Promote receipt — Recorded: ledger #<n>` (C1e live: the pool thread's receipt reached the pane — C8); the GET lists exactly 3 proposed changesets (none twice). **Fails, named:** any of (a)–(c) at or after `answered` (Revit froze, and the input waited in Revit's queue — C1); a picker in (b) or a second filing after (c) (the guard); no receipt line (C1e); a Busy or not-opened dialog instead of the window in (d) (the guard not released before the open hop — E3, C7) | the Doctor lines, the dialogs' words, the selection, the times of Yes, (a), (b), (c), (d) and the door's two lines, the GET |
| P-2 — a model switched during the read and mid-filing is said; nothing opens in the wrong one; the guard is released; the waiting storey opens afterwards | Withdraw P-1's three: for each id, `b4101 POST changesets/ma3b5/<id>/withdraw '{"actor":"drill-ma3b5"}'` → `200`. Create `slowread` (C9); restart the door (`slowfile` still there). **(r)** `ma3b5-a` in front: Sentinel ▸ Promote (DD) and, **in the same computer batch**, a switch to `ma3b5-b` (Ctrl+Tab — one view open per copy — or the window's tab) — within 8 s (`FetchProposed`'s read timeout ends the held read; C9). Read the dialog in `ma3b5-b`, close it. Switch back to `ma3b5-a`; Promote (DD) → **Yes**; then switch to `ma3b5-b` within the 90 s, and stay there. Read the dialog that appears after the door answers. The Doctor log's newest 20 lines. Then switch back to `ma3b5-a` and run **Promote (DD)** once more | **(r)** in `ma3b5-b`, a `Sentinel — Promote (DD)` dialog `Sentinel did not plan Promote (DD): switch back to ma3b5-a — nothing was changed.`; back in `ma3b5-a`, the next Promote shows its `reading` Doctor line and its dialog — no Busy (the plan hop's refusal released the guard). Then in `ma3b5-b`, a `Sentinel — Promote (DD)` dialog `Sentinel did not open the review of the changesets Promote filed: switch back to ma3b5-a — nothing was changed.` + `3 changeset(s) Promote filed wait for review — in "ma3b5-a", run Review AI Proposals (or Promote (DD): …)` (the title as Revit gives it); no review window in `ma3b5-b`; the same refusal in a Doctor line, and `Promote (DD): 3 of 3 changeset(s) filed — the filing is done.`. Back in `ma3b5-a`, Promote (DD) opens a waiting Promote storey's review window at once (record which — C10; the waiting-storey path — the guard released before `Open`, no Busy dialog, no "File n changeset(s)?" dialog); close it without Apply. **Fails, named:** a review window in `ma3b5-b` (DocPin bypassed); no dialog (the refusal lost); Busy after (r) or on the last Promote (the guard leaked). (r) **owed**, not failed, when the switch missed the 8 s (the door's `held GET` line, then Promote's `Couldn't reach the bridge` dialog in `ma3b5-a`) or the door held another caller's read (its `held GET` line before the click) — never re-run | (r)'s dialog and the door's `held GET` line, the dialogs, the Doctor lines, the window's title |

The rows run in the order P-1, P-2. If Promote files another count or other names than MA3b3's, the rows use what it filed and the record says so.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA3b5 — Promote reads and files without freezing Revit, live (<date> ~hh:mm → hh:mm local, branch feature/ma3b5-promote-no-wait <sha>, Claude driving Revit 2024)`: the Setup paragraph (the test bridge on 4102 behind the door on 4101; the deploy on the founder's OK with the DLL sha before and after; settings at 127.0.0.1:4101; the project `ma3b5`; the sign-in state; the scratch copies, never saved), the table `| Row | Result | Evidence |` with **pass**/fail/owed and the words quoted (never an address), plus ledger `#n`; then F-MA3b5-n findings each fixed on the branch with its check, the owed list and the closing list.

**Closing list:**
- withdraw P-2's three changesets (`b4101 POST changesets/ma3b5/<id>/withdraw '{"actor":"drill-ma3b5"}'`, each `200`);
- close Revit **without saving** either copy;
- stop `ma3b5-door` and `bridge-4102`; remove their entries from `.claude/launch.json` (this drill added them); the founder's 4100 bridge and the `web-dev` preview are not touched; delete `<scratchpad>/ma3b5/slowfile` and `slowread`;
- restore the add-in's bridge settings: copy `bcf-config.json.ma3b5bak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only — expect `366a193f4680…`, as MA3b3 and MA3b4), delete the backup;
- delete `%AppData%\Sentinel\cache\ma3b5` (a scratch key);
- the add-in: the branch's build stays deployed to Revit 2024 until the merge's deploy (F5) — safe, it uses the same routes;
- list what the drill left on the shared ledger — on `ma3b5` (a scratch key): six withdrawn changesets, their `changeset_proposed` rows, two `lod_state` rows, the type-gap rows and two Promote receipts — left in place on purpose;
- list what the drill left on this PC outside the repository: the scratch copies in `Documents\Sentinel drills\ma3b5\` (never saved, never committed), `<scratchpad>/ma3b5/` (`door.mjs`, `setup.mjs`).

## Merge (after the drill)

Merge when all of these hold:
- P-1 and P-2 passed, or a row is named **owed** in the record with why;
- each F-MA3b5-n fix is committed on the branch with its check, and Task 3 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does was run again live before the merge; a row whose fix was not run again is **owed**, not passed.

**The design doc says what the drill proved**, committed on the branch before the merge: replace ``BUILT on `feature/ma3b5-promote-no-wait` (MA-3b5), drill MA3b5 pending`` with `LANDED in MA-3b5 (merge <date>), drill MA3b5: <passed rows; owed rows>` — `git commit -m "docs: MA-3b5 - drill MA3b5's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma3b5-promote-no-wait -F - <<'EOF'
Merge feature/ma3b5-promote-no-wait: MA-3b5 - Promote reads and files without freezing Revit (XC-3 in the modelling chain): the reads (the changesets waiting for review, then the standards) on a pool thread; the plan and its dialog back on Revit's thread in the model Promote started from (DocPin - a model switched or closed is said, nothing planned); the filing on a pool thread under the stall rule (after the first filing the bridge did not answer the rest are not sent - F4); the review opened by itself through a second DocPin hop whose refusal says what was filed and where to review it. One guard with the review (F1): a second Promote and Review AI Proposals during the wait are refused in words that name Promote (F3); Ghost Builder is not (F2). The receipt's Doctor line through Revit's dispatcher (MA-3b2b C1e). Open(ExternalCommandData) deleted. No bridge, web or migration change. Drill MA3b5 (Revit 2024, signed in, scratch copies never saved, a door holding the first filing 90 s and the first read): <rows, times and ledger numbers>. Owed: <owed rows>. promote-check <n>, 26 checks <total>, builds 2022-2027 0 errors. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order:**
1. **The bridge: nothing.** No bridge file changed; no restart, no Funnel toggle.
2. **The add-in**, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same for each other Revit version the founder uses.
3. **The web app: nothing** (no web change).

## UNSURE facts this drill settles

1. Whether a TaskDialog shown while the filing runs (P-1 (b), (c)) delays the open hop until it is closed (an ExternalEvent raised under a modal dialog runs when Revit is idle again) — P-1 (d)'s time.
2. Whether the B35 seed still plans three storeys on `ma3b3-office`'s artefacts under a new project key — P-1's dialog.
3. Whether `ActiveUIDocument` after a window switch is the switched-to model when the hub job runs (DocPin's "active" read) — P-2.

## Risks (each a ceiling stated in words)

- **A hub job runs only when Revit is idle** (H7): a person inside a Revit tool (a wall being drawn) sees Promote's dialog or the review window when they leave it.
- **The guard is per PC** (F1): a Promote in one model makes Review AI Proposals in another wait until its filing is done — said by `Busy`; a model opened meanwhile says why its results were not sent (`OpenHeld`).
- **The model may change between the plan and Apply** — not new: the facts were read at plan time, Apply re-validates (the executor's `Unsafe`, the BLOCK and DD IDS checks), and the review window has always allowed edits before Apply.
- **A hung bridge holds the guard** about 12 s of reads + the parts filed + one 120 s (F4); during that Review AI Proposals and Promote say Busy. Revit closed meanwhile: the filings the bridge took wait for review; the next Promote opens them.
- **A filing whose reply timed out after the bridge stored it** is "not filed" in Promote's words (unchanged); the next Promote opens it as a waiting storey once the bridge holds it; one stored after a second Promote's read can be filed twice (as before MA-3b5 — C10).
- **The gap between the filing's release and the open hop** (E3): a Review AI Proposals or a report started in it holds the guard, and the open hop says `PromoteNotOpened(Busy, …)` — what was filed and where to review it (C7); the storey waits in the picker.
- **Ghost Builder during Promote's wait** (F2): allowed; its own report holds the same counter, so Review AI Proposals waits for both.
- **Ghost Builder's filing and `Abandon`'s withdrawals still wait on Revit's thread** (`GhostChangesetBuild.cs:532`, `:134`): Next.

## Not settled (for the founder or the reviewer)

- F1–F4 take their defaults unless the founder says otherwise; F5 (the deploy OK) is given for Revit 2024 only.

## Next (out of scope here)

- **MA-3b6 — Promote's "File n changeset(s)?" counts carried declines, and a storey whose every ghost is carried is not filed** (MA-3b3 Next, F8 B; S2 here): a bridge preview route `POST /changesets/:key/preview` (validate, `docList`, `carryDeclines`, nothing stored — one place for the rule), read in Promote's `Read` on the pool thread. Size M: about 25 lines of route and a vitest, the C# read and the dialog's words; it restarts the founder's 4100 bridge (a Funnel toggle).
- **Ghost Builder's filing and `Abandon`'s withdrawals off the thread** (`GhostChangesetBuild.cs:532`, `:134`): the filing sits inside the open TransactionGroup, so it needs the build split into a "file" step and a "place" event. Size M.
- **The C1e dispatcher audit of the remaining `GovernedNotify` callers** (`App.cs:386`, `AutoPublish.cs:58`, `FailureInterceptor.cs:41`, and `GovernedNotify.Report`'s default `Dispatcher.CurrentDispatcher` on a pool thread). Size S.
- **A guard per project key** (F1 B's cousin): not planned unless the PC-wide wait is felt.
- Carried over: the MA-3b4 Next items (a send on sync or a timer: not planned) and owed rows (R-3, the open-time guard live, Ghost Builder's decline path live, Revit 2025–2027), MA-3b3's (a second account, a web-origin carry live), MA-3c (the ghost overlay) and MA-3d (web highlights).
