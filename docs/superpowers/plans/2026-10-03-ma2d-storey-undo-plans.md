# MA-2d — one Undo per storey, and Promote's network calls off Revit's API thread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fourth slice of MA-2 — "one Undo per storey" — in three parts, and the drill MA2 with gate G2:
- **One storey, one review, one Undo.** A Promote storey of more than 200 ghosts is filed as several changesets (`Promote (DD) · GR-FFL (1/2)`, `(2/2)`: `PromoteWallsPlanner.Bodies`). Today each is reviewed and applied on its own — its own window, its own Undo entry, its own DD IDS check, its own LOD state after — so a type edit that rides in `(1/2)` (MA-2c C8) is not seen by the retypes onto its type in `(2/2)` until `(1/2)` is applied (MA-2c F11). Now Review AI Proposals and Promote open a Promote storey's pending changesets in ONE window; Apply runs them through the executor in order inside ONE `TransactionGroup` in ONE ExternalEvent call, named as the storey's Undo entry; the DD IDS judges what the whole storey applied, the BLOCK check runs once, and the group is kept — one Undo entry. Any changeset that fails rolls the whole storey back and every changeset of it is reported declined. Each changeset still holds at most 200 elements and gets its own ledger row; the LOD state after is read once per storey (design §3.4 steps 8 and 10). F11 is gone **within a storey**; across storeys its ceiling stays (a later storey of the same run may retype onto a type whose edit rode in an earlier storey — review C2, Risks), and a declined storey says so.
- **No network call on Revit's API thread** (house rule). Every request `ChangesetClient` sends — Promote's `Propose` (the first attempt too), the review's `FetchProposed`, `FetchOne`, `MyRole` and `ReportResult`, Ghost Builder's `Propose` and `Withdraw`, the undo watcher's revert — is built, sent and read on a pool thread, in ONE place (`ChangesetClient.Send`) — built there too, because reading the sign-in token may refresh it over the network (review C1). `GovernedNotify.Report` was already fire-and-forget on a pool thread: unchanged.
- **The words after a stale decline** (drill MA2c D2): Promote reopens a Promote storey still waiting for review before it plans again; the decline dialog now says so.
- **Drill MA2d** — the design's drill MA2 rows this slice can prove (a storey of more than 200 ghosts: one Undo removes it, two changesets, two ledger rows; all or nothing; LOD counts, zero types created, no-source count, the IDS as it is; the aster-tower plan-only run; one Revit 2026 row) — and **gate G2's numbers** (edit cost on the MA-0 seed and on the drill's own crowded B35 copy, review C4). The G2 decision is the founder's.

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md` — §2.1 rule 5 (`:168`), §2.3 Place row (`:241`), §3.4 step 8 (`:345`) and step 10 (`:348-349`), §6.6 (`:854`), §7.3 (`:1258`), MA-2 delivers (`:1088-1089`), drill MA2 (`:1091-1099`), gate G2 (`:1100`), gate G1's edit cost (`:1025-1033`); the MA-2c plan `docs/superpowers/plans/2026-10-03-ma2c-set-parameter-gaps-undo-plans.md` — F11 (`:78`), F12 (`:79`), C8 (`:140`), C22's ceiling (`:173`), Risks and Next (`:3966-3980`); drill MA2c's record (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` session MA2c, D2 and Owed). Base: master `3242452`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (the split, founder decision F7):** MA-2d is the storey batch, the network calls, the D2 words, drill MA2d and G2's numbers — Promote only. **MA-2e** (Next) is DAT-3, ANV-1 and ANV-2 (a floor plan and an RCP per story level, view names from the View rule's tokens, levels and grids pinned — their own batch, B31): different code (Annotate, Datum, ViewPlanner and its TS twin, the token compiler, a new preview), different Undo semantics (B31 empties the Undo list after view actions), open design questions (which views, which token sources, a substitute for MH-LNK-01, which does not exist in code), and G2 does not need it. The MA-2c plan's F12 foresaw this split.

**Architecture:**

*The storey batch.* A new pure file `SentinelAddin/GhostBuilder/StoreyBatch.cs` reads a storey from the name Promote already writes (founder decision F1 A — no bridge field, no bridge change): `StoreyOf` takes off Bodies' ` (i/n)`; `Of(pending, first)` is what is reviewed with `first` — a Promote changeset that is one part of a storey brings the storey's other parts (Promote's, the same storey, the same n), in part order, when every part 1..n waits exactly once; a part waiting twice (two Promote runs) or a part missing is never guessed at — `first` is reviewed alone and `Open` says so (review C7); anything else is reviewed alone; `Merge` is the one `ChangesetDto` the existing review window shows (every part's elements and held rows, named `… · GR-FFL (2 changesets, one Undo)`) — which also makes MA-2c C21's "+ M if this changeset's retypes onto it are applied" count every part; `Own` splits the person's ticks and unticks back to each changeset; `UndoName` names the group as `UndoWatcher.TxName(storey, first id)`. `ReviewChangesetsCommand.Open` takes the batch (Review AI Proposals' FIFO and Promote's two calls build it with `Of`), re-fetches every changeset before anything runs (the whole storey, or nothing), and hands the batch to `ChangesetPlacementEvent.SetRequest`. `RunChecked` runs each changeset's executor in order inside the one group (GhostChangesetBuild's pattern), `ExecutionResult.Each` keeps each one's own result, the DD IDS judges the union (`PromoteContext.JudgeApplied` over every applied entry), the BLOCK check runs once, `Assimilate` is checked; every changeset, a lone one or a storey's several, runs in the group (review C10: the lone path, which ran the executor bare, is deleted). The review then reports each changeset on its own row, remembers each under the group's name and its own (Ghost's rule: which name Revit reports for an undone group is UNSURE 1), and posts one `lod_state` row naming every changeset id.

*The network calls.* `ChangesetClient` gets one private `Send(HttpClient, Func<HttpRequestMessage>)` that builds the request, runs `SendAsync` and the body read inside `Task.Run` and waits; `FetchProposed`, `FetchOne`, `MyRole` and `Post` (Propose, ReportResult, Withdraw, ReportReverted) call it with `() => Req(…, cfg.ServiceToken)`. Review C1: the request — its token — is built on the pool thread, because `BcfConfig.ServiceToken` calls `UserSession.AccessToken`, which refreshes a token with a minute or less left over the network (a mutex wait up to 10 s, a Supabase call up to 8 s); the body, with `UserSession.Actor` (a file read), is still serialized on the caller's thread. Promote's C22 retry wrap becomes the client's. `GovernedNotify.Report` is not touched: its pool thread is already pinned by the existing scan in `tools/promote-check/Reports.cs` (`Task.Run(() => Event("/audit", payload, key))`).

**Tech stack:** the Revit add-in in C# (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8); the offline C# console check `tools/promote-check` (`SENTINEL_CHECK`). No bridge, TS, web or ledger change: `WebApp/` is not touched, `bridge/sentinel-core.mjs` is not rebuilt, no migration.

## Global Constraints

- Branch `feature/ma2d-storey-undo` from master `3242452` (it holds this plan); merge `--no-ff` only after every task's checks pass **and the live drill MA2d is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **One Undo per Sentinel action (XC-2).** A storey's changesets are applied inside ONE `TransactionGroup` in ONE ExternalEvent call; the group is kept only when `Assimilate` answers Committed, and every other path rolls it back through `SentinelUndo.RollBack`. No new ExternalEvent, no transaction outside the group.
  - **All or nothing per storey.** Any changeset of the storey that fails (Error, NotFinished, NotRun) leaves nothing of the storey in the model; Error declines every changeset of it with the reason; NotRun and NotFinished report nothing (the storey stays proposed), as for one changeset today.
  - **Each changeset keeps its own ledger row** (`changeset_applied`, at most 200 elements) and its own `changeset_reverted` on Undo.
  - **A person decides.** Nothing new is pre-ticked: the merged window shows every row with the bridge's own pre-tick (`ChangesetTrust.PreTick`, per element, unchanged); a set_parameter is never pre-ticked.
  - **Claimed vs verified.** The storey is read from the name the add-in wrote on a `source: "promote"` changeset — a claim, as the source is (`claimed: true`); a changeset of another source, of another storey or of another part count is never batched, and a storey with a part waiting twice or a part missing is never batched — its part is reviewed alone, said (F1 A, review C7; ceilings in Risks).
  - **No network call on Revit's API thread.** Every `ChangesetClient` request is built (its token too, review C1), sent and read inside `Task.Run` (`Send`); `PromoteContext.Fetch` and `GhostStandards.Load` stay inside `Task.Run`; `GovernedNotify.Report` stays fire-and-forget. The caller still waits for the answer (the C22 ceiling, Risks).
  - **Words are said, never silent.** A storey that is declined says how many changesets were declined and that Promote reopens a waiting storey before it plans again (D2).
  - **The bridge is unchanged.** It already takes several changesets of one name; nothing in its trust rules moves to the add-in.
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s. C# `latest` (tuples, `is not`, `foreach (var (a, b) in …)`) is in use already.
- Checks: `dotnet run --project tools/promote-check` from the repo root. No file under `WebApp/` changes, so vitest is not run (a full vitest run would rewrite `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with LF only: if anyone runs it, `git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json` when its content is unchanged).
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by a source scan and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100.
- The community Revit MCP never writes. Only in the drill, and only its read-only calls: `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`, `get_available_family_types` — never while a Revit command, a TaskDialog or a Sentinel window is open.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are master `3242452`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs.

**Dry run (planner, 2026-10-03).** Every code step of Tasks 1–4 was applied in order, task by task, to a detached worktree of `feature/ma2d-storey-undo` at master `3242452` in the session's scratchpad — never in the repository — by a script that reads this document's `Create` and replace blocks as an implementer reads them (each replace matched its text exactly once, in the file's own line endings). Before each task's code its Step 1 was applied and its "see it fail" run made; after the code, its "see it pass" run. The totals in the steps are that run's; the worktree was removed afterwards.
- Master's own totals, measured first: `promote-check` `659/659`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`.
- Task 1: `promote-check` fails to compile (`CS2001`: `StoreyBatch.cs` not found); then `667/667`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`.
- Task 2: `666/669` (3 FAIL); then `669/669`; `session-check` (it compiles `ChangesetClient.cs` too) `47/47`; builds as master's.
- Task 3: `668/674` (6 FAIL); then `674/674`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)` — the whole storey wiring compiles on net48 and net8.
- Task 4: both design-doc replaces matched once; the final loop over every tracked check project — all 26 pass (`annotate-check ALL PASS`, `datum-check DATUM OK`, `docpin-check 4/4`, `pane-layout-check 349/349`, `promote-check 674/674`, `session-check 47/47`, the rest as on master).
- Not run: every line of the drill section, which only Revit can run, and the commit commands. Nothing on any branch of the repository was changed by the dry run; only this plan is committed.
- **After the review (C1–C4, C6–C12).** The amendments changed code in Tasks 1, 2 and 3; no check was added (each new condition joins an existing check), so the totals stay, except Task 3 Step 2's "see it fail", now `667/674` (7 FAIL: C11's scan in section 35 fails on the old window too). Dry run again (amender, 2026-10-03), Tasks 1–3 as amended, by the same kind of script on a detached scratch worktree at `9e732aa` (removed afterwards): every replace matched once; Task 1 then Task 2 `669/669`; Task 3 Step 1 `667/674` (7 FAIL, as above); Task 3 `674/674`; `session-check` `47/47`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)` (master's counts). Task 4 (words only) was not re-run.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts. **F4 is the one only the founder can take** — after the drill, with G2's numbers.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | What makes a storey batch | **A:** the name Promote writes (`<title> · <storey> (i/n)`) on a `source: "promote"` changeset — the add-in reads it back (`StoreyBatch`); no bridge change. **B:** a bridge `batch` field (`BODY_FIELDS`, the store, vitest), set by Promote and checked by the bridge | **A.** The bridge already takes several changesets of one name, and a Promote changeset's source is a claim either way (`claimed: true`): B would store the same claim in another field. Ceiling: an agent that posts `source: "promote"` with a storey's exact name and part count joins that storey's window — every row still shows, nothing new is pre-ticked (Risks); B is under Next |
| F2 | G2's two models (design `:1100`: "the MA-0 model and one more"; D8 is still open) | **A (review C4):** model A, a detached scratch copy of the MA-0 seed central (`ma0-seed-central-0848.rvt.bak`, the model of G1's baseline: 25 unticks on storey 1, about 2 min 20 s) — G2-A; model B, recorded from the drill's own crowded B35 copy `ma2d-a.rvt` — GR-FFL's numbers from P-1/A-1, plus 01-FFL applied once with the same metric (G2-B); nothing else is applied for G2. **B:** the founder names a real concept model | **A**, unless the founder names one before the drill. Ceiling: both are Sentinel's own seeds, not an office's concept model — G2 then measures Promote on seeds; **a real concept model is owed** until the founder names one |
| F3 | G2's edit-cost metric (G1: "ghosts the reviewer unticked or changed", plus time per storey) | **A:** per model and per storey: rows filed, rows the reviewer unticked (each with its reason), elements and DD properties sent to a person, and the time from the review window opening to the result dialog; read from the window, the dialogs and the ledger rows. Said once: the window cannot change a row. The reviewer is the drill runner (Claude), as in G1 (review C4). **B:** add the Revit warnings counted and the LOD gain | **A**; the LOD gain and the warnings are recorded anyway in the drill's rows |
| F4 | The G2 decision itself | Continue MA-3 then MA-4 as planned, change the plan, or stop | **The founder's.** Recommended default: continue — MA-3 (the review desk) then MA-4 (order C, D1) |
| F5 | The Revit 2026 or 2027 row (D14: "Revit 2024 for every drill, plus one 2026 or 2027 row") | **A:** Revit 2026: one Promote → Yes → Apply → Undo on a scratch copy. **B:** Revit 2027 | **A** (net8; 2027 is net10 and the same code). Owed if Revit 2026 is not installed on this PC (UNSURE 6) |
| F6 | The rows that need the founder (a password, port 4000) | **A:** owed unless the founder runs them: a second account approving one batch (MA2 row 7), the signed-out actor, W-1 (the web Holding Area). **B:** the drill waits for the founder | **A.** Named owed up front in the drill |
| F7 | The scope of MA-2d | **A:** the storey batch, the network calls, the D2 words, drill MA2d and G2's numbers; DAT-3/ANV-1/ANV-2 are MA-2e. **B:** all of it in one slice | **A**, the scout's split (Scope above) |

## Amendments to the spec's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 ("in one ExternalEvent, inside `SentinelUndo.Run`", design `:345`, `:1088`).** The storey runs in `ChangesetPlacementEvent.RunChecked`'s own `TransactionGroup`, named `UndoWatcher.TxName(<storey>, <first id>)` (`StoreyBatch.UndoName`), kept only when `Assimilate` answers Committed and rolled back through `SentinelUndo.RollBack` on every other path — `SentinelUndo.Run`'s contract, which Ghost's multi-changeset build already follows. `Run` itself is not called: it names the group `"Sentinel: " + name`, and the undo watcher and the Doctor's skip (`GhostFailurePolicy.DoctorSkips`) key on the `Sentinel AI changeset: ` prefix.
- **S2 ("a scratch model with more than 200 walls on one storey", the task's drill MA2).** The cap is 200 *elements* a changeset; a concept wall is a retype and an attach, so a storey of about 100 concept walls or more files two changesets. The drill adds **160** free-standing concept partitions to GR-FFL of the B35 seed (review C3: their attaches alone, 160, plus GR-FFL's own 48 rows and type edits pass 200, so GR-FFL files `(1/2)`, `(2/2)` even if the Location rule holds every retype; with the retypes, about 370 ghosts) — "two changesets, two ledger rows" as the design's row says.
- **S3 ("a plan-only run on aster-tower reports 'no guideline@n — not checkable'", design `:1098`).** Today's words are kept: `No DD rule file is installed for "aster-tower" or its office — nothing to plan. Install one as guideline@n.` (`Commands.PromoteWalls.cs`), after `Guideline: <label>`. Same meaning; nothing is planned, posted or filed.
- **S4 ("if any changeset of the storey fails, the whole storey rolls back", design `:345`).** Also when a changeset is refused before it writes (NotRun: a design option, a placement write) or Revit leaves one pending (NotFinished): nothing of the storey is kept and nothing is declined — the storey stays proposed, as one changeset does today.
- **S5 ("A Promote run posts one summary report, not one per changeset", design §6.6 `:854`).** Read for this slice as: one `lod_state` row per storey applied (it names every changeset id), never one per changeset; the per-changeset `changeset_applied` rows are the ledger's record, not reports.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The network calls move off the API thread in ONE place, `ChangesetClient.Send`, not at each call site | Every caller (Promote, the review, Ghost Builder, the undo watcher) routes through the client: one wrap fixes them all, including Ghost's `Propose`/`Withdraw`, which the MA-2c Risks left out. Ceiling: the caller still waits (Risks) |
| E2 | The review window is unchanged: it shows `StoreyBatch.Merge(batch)`, one `ChangesetDto` | No WPF change, so no new untested UI; C21's count across parts comes for free. Ceiling: the window does not say which part a row is in (the ledger rows do) |
| E3 | Every changeset — a storey of several, or one alone — runs in the checked group, with or without a BLOCK rule or a DD IDS (review C10) | One Undo is the point of the slice. The lone path (the executor bare when neither check runs) is deleted: its `TurnToBlocks` is a second transaction, so a create with a Rotation left two Undo entries (XC-2), and `TurnToBlocks`' own comment says every caller runs the executor inside a group |
| E4 | `ExecutionResult.Each` carries each changeset's own result; the storey's `Applied`, `Gone`, `Warnings` and `Turned` are their union; `Block` and `Ids` are the storey's and ride on every changeset's note | The review reports each changeset with its own applied and gone; the IDS and BLOCK lines are the storey's verdicts |
| E5 | The undo watcher remembers each changeset under the group's name and its own (GhostChangesetBuild's rule) | Which name `GetTransactionNames` returns for an undone assimilated group of several transactions is UNSURE 1; `Hits` lists a changeset once whichever name comes |

## Review amendments (BINDING — from the review of `9e732aa`; each is also written into the task or drill text it changes, which matches it)

The critic found no critical defect, four important findings (C1–C4) and seven minor ones (C6–C12). The numbers are the critic's finding headings, so each amendment matches its finding; there is no C5 (the critic's text labelled the amendments of its third and fourth important findings "C4" and "C5" — they are C3 and C4 here).

- **C1 (important) — the sign-in token refresh was still a network call on Revit's API thread.** `BcfConfig.ServiceToken` → `UserSession.AccessToken` refreshes a token with a minute or less left: a mutex wait up to 10 s, a Supabase call up to 8 s (`UserSession.cs` `Refresh`/`Token`). Task 2: `Send(HttpClient http, Func<HttpRequestMessage> make)`; its body runs `make()` inside the `Task.Run` before the first `await` (so the mutex is taken and released on that one pool thread); the three reads pass `() => Req(HttpMethod.Get, url, cfg.ServiceToken)`; `Req` takes an optional `json` and sets the body (`Req(HttpMethod m, string url, string token, string json = null)`; `ChangesetClient.cs` is `#nullable disable`), so `Post` passes `() => Req(HttpMethod.Post, …, cfg.ServiceToken, payload)`. `payload`, and `UserSession.Actor` in it (a file read), stays on the caller's thread. A `SessionException` from the token comes out of `GetResult()` into each method's existing `catch`. Section 38 asserts `Count(client, "cfg.ServiceToken") == Count(client, "() => Req(") == 4`, `!client.Contains("Send(ReadHttp, Req(")`, `!client.Contains("Send(WriteHttp, msg)")`. UNSURE 4 is re-worded.
- **C2 (important) — F11 is gone only within a storey.** MA-2c F11 puts a type's set_parameter on the first storey whose retypes land on it; a later storey of the same run (01-FFL onto GYPS_100) depends on it. When a Promote storey carrying type edits is declined (the Error path, or C6's all-unticked path), the dialog adds `ReviewChangesetsCommand.CarriedEdits(fresh)`: `This storey carried {k} type edit(s) ({types}). Other storeys of the same run that retype onto those types will fail the DD IDS check for that property until Promote plans again — decline them (untick all ▸ Apply), then run Promote (DD).` The words "F11 gone" (Goal, merge message, drill's Expected) now say "within a storey; across storeys F11's ceiling stays (Risks)"; Risks has the line. S-1 records the line and declines 01-FFL (untick all ▸ Apply) instead of applying it. Section 39 checks the literal.
- **C3 (important) — the drill's core rows rested on an unproven second changeset.** The crowd is **160** partitions (S2): attaches alone (160) plus GR-FFL's own 48 rows and type edits pass 200, so GR-FFL files two changesets whatever the Location rule decides about the retypes (UNSURE 7). The generator takes its rows (`y` values) as an argument: 10 rows (180 positions), chosen after reading GR-FFL's walls with MCP `get_current_view_elements` so each 800 mm partition lies inside the outline and 400 mm clear of every seed wall; fewer than 160 positions → it throws and the drill stops (F-MA2d-n). Before posting, MCP `get_available_family_types` confirms `MA0 Interior - 100mm` is in the seed; if not, stop and say so. P-1 has a precondition: if Promote's dialog shows GR-FFL as one changeset (200 ghosts or fewer), answer **No**, record F-MA2d-n, and A-1, U-1, S-1 and G2-B are **owed**, never passed.
- **C4 (important) — G2's second model duplicated A-1.** `ma2d-b35.rvt` was the same B35 seed minus the crowd. F2's default: G2-A on the MA-0 seed; G2-B recorded from `ma2d-a.rvt` — GR-FFL's numbers from P-1/A-1, plus 01-FFL applied once with the same metric (after S-1: Promote plans again, GR-FFL is applied so 01-FFL's retypes see its type edits, then 01-FFL is measured and applied). A real concept model is **owed** until the founder names one. `ma2d-b35.rvt` and the project `ma2d-b35` are removed from the set-up and the closing list. F3 drops "rows changed (always 0)" and says once that the window cannot change a row; F3 names the reviewer: the drill runner (Claude), as in G1.
- **C6 (minor) — an all-unticked storey was declined in silence.** After the declines, `Declined {declined} of {fresh.Count} changeset(s) — nothing in the model changed.` + (Promote's: `CarriedEdits(fresh)` + `RunPromoteAgain`). Changed from the critic's text: the count is the declines the bridge took (`Report` returned true), not the number sent — claimed vs verified. Section 39 checks it; S-1's 01-FFL decline shows it live.
- **C7 (minor) — parts of two Promote runs could be mixed in one batch.** **The critic's rule is not taken**: "part k+1 is the oldest copy created after part k" still mixes A(1/2) with B(2/2) in its own interleaving (A1, B1, B2, A2: B2 is the oldest part 2 after A1), and no rule on creation order separates two runs, since nothing in a changeset names its run. Instead, fail closed: `Of` batches only when every part 1..n waits exactly once; a part waiting twice or a part missing means `first` is reviewed alone (its own Undo), and `Open` says so: `"<name>" is reviewed alone: another part of its storey is missing or waits twice (two Promote runs) — applying it is its own Undo entry, not the storey's.` Section 37's checks take the duplicate and the missing part; section 39 checks the words; Risks has the line.
- **C8 (minor) — AST-1 could pass for the wrong reason.** AST-1 passes only when the `Guideline:` label says none is installed; a label of "could not be loaded" or "did not parse" (`GhostStandards.cs` `:54`, `:90`) fails the row and records F-MA2d-n (the words claim "not installed" for an unread guideline).
- **C9 (minor) — the design doc said LANDED before the drill.** Task 4 writes "BUILT on `feature/ma2d-storey-undo`, drill MA2d pending"; the merge step replaces it with the drill's result, committed on the branch before the merge.
- **C10 (minor) — the lone path left two Undo entries.** The lone path ran the executor bare; its `TurnToBlocks` is a second transaction (a create with a Rotation, no BLOCK rule, no DD IDS → two Undo entries, XC-2). Deleted: every changeset runs through `RunChecked` (E3). The scans become `!place.Contains("if (before == null && promote?.Ids == null")` in section 32 (Ma2bWiring) and section 39 — **not** the critic's `!place.Contains("new ChangesetExecutor { Placement = plan }.Execute(doc, batch[0], ticked)")`, which the old code never contained, so section 32's scan would pass before the change and "see it fail" would not fail.
- **C11 (minor) — the type-edit row's words were wrong in the merged window.** When the window's changeset name ends with `", one Undo)"` (`StoreyBatch.Merge`'s), the C21 row says "this storey's retypes", else "this changeset's" (`ChangesetReviewWindow.cs`); section 35's C21 scan (Ma2cWiring) follows the code; P-1 records the words.
- **C12 (minor) — S-1's literal was fragile.** S-1 passes on the prefix `changeset "Promote (DD) · GR-FFL (2/2)":`, the words `not in this model`, and both changesets `declined`. Added: the wall deleted is one whose every row (retype and attach) is in `(2/2)` (its `W <id>` appears in no row of `(1/2)`), so `(1/2)` cannot fail first.

**Checked and found sound by the critic** (kept): the group name matches the undo watcher (`Remember` keeps several entries under one name, `Hits` removes duplicates); `RollBack` and `Assimilate` follow the Ghost build's pattern; no view action happens inside the group (B31 does not apply); `GovernedNotify` is already pinned to a pool thread; every source scan fails on the old code; the MA-2e split.

**Review amendments of the built branch (C13…, from three reviews of `c2e078e`).** Each lands with its check; the Task 3 code blocks above are what was built before them and are superseded where they differ.

- **C13 (important) — C7 held only on the first look.** Pending A(1/2), B(1/2), A(2/2) (B's (2/2) not filed): A(1/2) is reviewed alone (part 1 waits twice), then B(1/2) and A(2/2) looked like one complete storey and were batched — one Undo over two runs' plans. `StoreyBatch.Of` now remembers, for the session, every part pending when its storey had a part waiting twice or missing, and never batches those parts again (a later run's parts still batch). Section 37 has the A1, B1, A2 case. Ceiling (Risks): the set is this Revit session's; another PC, or Revit restarted between, can still batch such leftovers. The full fix — a run id in the name — changes the name F1 A shows and is the founder's.
- **C14 (minor; two reviews) — the rolled-back storey's dialog said every changeset was declined without asking the bridge.** The Error path counts the declines the bridge took, as C6 does: `Reported as declined: {declined} of {fresh.Count} changeset(s)` + (`declined < fresh.Count` ? ` — the rest are still proposed; the model holds none of them.` : `.`), then C2's and D2's lines. S-1's expected words follow. Section 39 checks it.
- **C15 (minor) — what the bridge did not take was still counted and named.** The `lod_state` row names only the changesets the bridge took as applied with at least one element applied (`held`), none when that is empty; the result dialog says `{taken} of {n} unticked element(s) reported as rejected.` and the same for the elements Revit removed at commit, counted from the reports the bridge took. Section 39 checks it.
- **C16 (minor) — section 39's all-or-nothing scan did not pin the stop.** It now requires the first `return res;` after the rollback line to come before `result.Each.Add((cs, res));`; changing that `return res;` to `continue;` fails the scan (seen: 670/675).
- **C17 (minor) — a storey's dialogs spoke of one changeset.** The warnings line says `raised by this storey` for a storey of several; NotFinished says `the storey's {n} changesets stay proposed`; C7's words widen to `another part of its storey is missing (not filed, or reviewed already) or waits twice (two Promote runs)`. Section 39 checks the literals. The reviewer's other half — `SentinelUndo.RollBack` in a try after a NotFinished part — is not built: Revit's answer to rolling a group back over a pending commit is unknown off Revit, and Ghost's build disposes the group the same way (`GhostChangesetBuild.cs` NotFinished path); UNSURE 8 owes what the model holds after a pending part.
- **C18 (minor) — the design doc still said one LOD state per changeset, and step 8 had no status; one MA2 line was in no row.** Design §3.4 step 8 says BUILT on the branch, drill MA2d pending, with S1's group; step 10 says one row per applied storey (S5); §6.6 notes S5. Design `:1094` ("Every retyped wall's type is in `type_catalog@n`") was in no MA2d row: A-1 now reads every applied Promote retype's target type against `catalog-fr2.json`'s Walls rows (`not in catalog 0`). Words only; no check.

---

## File map

| File | Task | What it holds |
|---|---|---|
| `SentinelAddin/GhostBuilder/StoreyBatch.cs` (new) | 1 | `StoreyOf`, `Of`, `Merge`, `Own`, `UndoName` |
| `tools/promote-check/StoreyBatchChecks.cs` (new), `Check.cs`, `promote-check.csproj` | 1, 2, 3 | Section 37 (the batch, pure) and the calls of sections 38–39 |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 2 | `Send`; its four callers |
| `SentinelAddin/Commands.PromoteWalls.cs` | 2, 3 | The first `Propose` through the client; the batch opened |
| `tools/promote-check/Ma2dWiring.cs` (new), `Ma2cWiring.cs`, `Ma2bWiring.cs` | 2, 3 | Sections 38 (threads) and 39 (the storey's wiring), by source scan; three older scans follow the code |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` | 3 | `ExecutionResult.Each` |
| `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` | 3 | The batch request; `RunChecked` over the storey; the lone path deleted (C10) |
| `SentinelAddin/Commands.ReviewChangesets.cs` | 3 | `Open` on a batch (a part reviewed alone is said, C7); each changeset reported and remembered; one LOD state after; the D2 words; `CarriedEdits` (C2); the all-unticked decline said (C6) |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | 3 | C11: the C21 row says "this storey's" in a storey's window |
| `docs/strategy/2026-09-30-model-automation-design.md` | 4 | What landed; DAT-3/ANV-1/ANV-2 moved to MA-2e |

---

## Tasks (in order: the batch, pure; the network calls; the storey's wiring; the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file. `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once.

### Task 1 — C#: the storey batch, pure (`StoreyBatch`)

**Files:**
- Create `SentinelAddin/GhostBuilder/StoreyBatch.cs`
- Create `tools/promote-check/StoreyBatchChecks.cs`; modify `tools/promote-check/Check.cs`, `tools/promote-check/promote-check.csproj`

**Interfaces:**
- Consumes: `ChangesetDto`, `ChangesetElementDto`, `ExceptionRowDto`, `AdjudicationDto`, `ChangesetTrust.RetypedOnto` (`Coordination/ChangesetClient.cs`); `UndoWatcher.TxName(string name, string id)`; `PromoteWallsPlanner.Bodies(IReadOnlyList<StoreyPlan>, string actor, int max = 200, string title = …)`.
- Produces (namespace `Sentinel.GhostBuilder`): `StoreyBatch.StoreyOf(string name) → string`; `StoreyBatch.Of(IEnumerable<ChangesetDto> pending, ChangesetDto first) → List<ChangesetDto>`; `StoreyBatch.Merge(IReadOnlyList<ChangesetDto> batch) → ChangesetDto`; `StoreyBatch.Own(ChangesetDto cs, IEnumerable<string> guids) → List<string>`; `StoreyBatch.UndoName(IReadOnlyList<ChangesetDto> batch) → string`.

- [ ] **Step 1: The checks (section 37).**

`Create` `tools/promote-check/StoreyBatchChecks.cs`:

```csharp
#nullable disable
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 37. MA-2d: a Promote storey of several changesets, reviewed and applied as one (StoreyBatch) ─────────────────────────
    static void StoreyBatchChecks()
    {
        Console.WriteLine("\nMA-2d — the storey batch");
        Ok(StoreyBatch.StoreyOf("Promote (DD) · GR-FFL (2/3)") == "Promote (DD) · GR-FFL" && StoreyBatch.StoreyOf("Promote (DD) · GR-FFL") == "Promote (DD) · GR-FFL"
           && StoreyBatch.StoreyOf("Promote (DD) · L1 (a/b)") == "Promote (DD) · L1 (a/b)" && StoreyBatch.StoreyOf("Promote (DD) · L1 (2/3) x") == "Promote (DD) · L1 (2/3) x"
           && StoreyBatch.StoreyOf("Promote (DD) · L1 (٢/٣)") == "Promote (DD) · L1 (٢/٣)" && StoreyBatch.StoreyOf(null) == "",
           "StoreyOf takes off the \" (i/n)\" Bodies writes at the end of a name (ASCII digits), and nothing else");

        // Bodies' own names: three walls of one storey, a retype and an attach each (6 ghosts), at most 4 a changeset → 2 changesets.
        var sp = new StoreyPlan { Storey = "GR-FFL" };
        foreach (var u in new[] { "w1", "w2", "w3" })
        {
            sp.Ghosts.Add(new PromoteGhost { Op = "retype", UniqueId = u, Label = u, TypeBefore = "Generic - 200mm", TypeName = "BDS_EXT_ARC_CMU_200 mm", Reason = "r" });
            sp.Ghosts.Add(new PromoteGhost { Op = "attach", UniqueId = u, Label = u, BaseLevel = "GR-FFL", TopLevel = "01-FFL", Reason = "r" });
        }
        var names = Json(PromoteWallsPlanner.Bodies(new[] { sp }, "yazan", max: 4, title: "Promote (DD)")).Select(b => (string)b["name"]).ToList();
        Ok(names.SequenceEqual(new[] { "Promote (DD) · GR-FFL (1/2)", "Promote (DD) · GR-FFL (2/2)" }) && names.All(n => StoreyBatch.StoreyOf(n) == "Promote (DD) · GR-FFL"),
           "a storey of more ghosts than one changeset holds is filed as \"(1/2)\", \"(2/2)\", and StoreyOf gives both the storey's one name");

        ChangesetDto Cs(string id, string name, string source, params string[] guids) => new ChangesetDto
        {
            Id = id, Name = name, Source = source, Status = "proposed", Claimed = true, Adjudication = new AdjudicationDto { Verdict = "recorded", IdsSource = "ids@1" },
            Elements = guids.Select(g => new ChangesetElementDto { ProposalGuid = g, Op = "retype", Kind = "wall", Place = new PlaceDto { TypeName = "BDS_INT_ARC_GYPS_100 mm" } }).ToList(),
            Exceptions = new List<ExceptionRowDto> { new ExceptionRowDto { UniqueId = "held-" + id, Name = "held " + id, Reason = "a person decides" } },
        };
        var c1 = Cs("c1000000-a", "Promote (DD) · GR-FFL (1/2)", "promote", "a", "b");
        var agent = Cs("ag000000-a", "Promote (DD) · GR-FFL (2/2)", "agent", "z");
        var c2 = Cs("c2000000-a", "Promote (DD) · GR-FFL (2/2)", "promote", "c");
        var other = Cs("c3000000-a", "Promote (DD) · GR-FFL (2/3)", "promote", "d");
        var l1 = Cs("l1000000-a", "Promote (DD) · 01-FFL", "promote", "e");
        var dup = Cs("dup00000-a", "Promote (DD) · GR-FFL (1/2)", "promote", "f");
        var pending = new List<ChangesetDto> { c1, agent, c2, other, l1 };
        Ok(StoreyBatch.Of(pending, c1).SequenceEqual(new[] { c1, c2 }) && StoreyBatch.Of(new[] { c2, c1 }, c2).SequenceEqual(new[] { c1, c2 }),
           "a Promote storey's parts are reviewed together, in part order — not an agent's changeset of the same name or another run's \"(2/3)\"");
        // Review C7: two runs of one storey (a part waits twice), or a part missing, are never guessed at — the part is reviewed alone.
        Ok(StoreyBatch.Of(pending, l1).SequenceEqual(new[] { l1 }) && StoreyBatch.Of(pending, agent).SequenceEqual(new[] { agent })
           && StoreyBatch.Of(pending.Concat(new[] { dup }), c1).SequenceEqual(new[] { c1 }) && StoreyBatch.Of(pending.Concat(new[] { dup }), c2).SequenceEqual(new[] { c2 })
           && StoreyBatch.Of(new[] { c1 }, c1).SequenceEqual(new[] { c1 }),
           "a storey of one changeset, any changeset that is not Promote's, and a part whose storey has a part waiting twice or missing, is reviewed alone");

        var merged = StoreyBatch.Merge(new[] { c1, c2 });
        Ok(merged.Id == c1.Id && merged.Name == "Promote (DD) · GR-FFL (2 changesets, one Undo)" && merged.Source == "promote" && merged.Claimed == true
           && merged.Elements.Select(e => e.ProposalGuid).SequenceEqual(new[] { "a", "b", "c" }) && merged.Exceptions.Count == 2
           && ReferenceEquals(StoreyBatch.Merge(new[] { l1 }), l1),
           "the review window shows one storey: every part's elements and held rows, named as the storey; a changeset alone is shown as it is");
        Ok(StoreyBatch.Own(c1, new[] { "a", "c", "z" }).SequenceEqual(new[] { "a" }) && StoreyBatch.Own(c2, new[] { "a", "c", "z" }).SequenceEqual(new[] { "c" }),
           "the person's ticks and unticks are split back to the changeset each is reported on");
        Ok(StoreyBatch.UndoName(new[] { c1, c2 }) == UndoWatcher.TxName("Promote (DD) · GR-FFL", c1.Id) && StoreyBatch.UndoName(new[] { l1 }) == UndoWatcher.TxName(l1.Name, l1.Id)
           && GhostFailurePolicy.DoctorSkips(StoreyBatch.UndoName(new[] { c1, c2 })),
           "one Undo entry for the storey, named as a changeset's transaction (the undo watcher and the Doctor's skip key on that name); a changeset alone keeps its own");

        // MA-2c F11/C21: a type edit rides in the storey's first changeset, the retypes onto its type may be in a later one — one storey,
        // one window: the type edit's "+ M if … retypes onto it" counts every part.
        var edit = new ChangesetElementDto { ProposalGuid = "t", Op = "set_parameter", Kind = "wall", Place = new PlaceDto { TypeName = "BDS_INT_ARC_GYPS_100 mm" } };
        c1.Elements.Insert(0, edit);
        Ok(ChangesetTrust.RetypedOnto(c1, edit) == 2 && ChangesetTrust.RetypedOnto(StoreyBatch.Merge(new[] { c1, c2 }), edit) == 3,
           "a type edit's row counts the retypes onto its type in every changeset of the storey, not only its own (F11, C21)");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        TypeGapChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        TypeGapChecks();
        StoreyBatchChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\TypeGaps.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\TypeGaps.cs" />
    <!-- MA-2d: a Promote storey's changesets, reviewed and applied as one -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\StoreyBatch.cs" />
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` — it fails to compile: `CSC : error CS2001: Source file '…\SentinelAddin\GhostBuilder\StoreyBatch.cs' could not be found` (dry run).

- [ ] **Step 3: The batch.**

`Create` `SentinelAddin/GhostBuilder/StoreyBatch.cs`:

```csharp
#nullable disable
// MA-2d (design §2.1 rule 5, §3.4 step 8): one Undo per storey. Promote files a storey of more than 200 ghosts as several changesets
// named "<title> · <storey> (i/n)" (PromoteWallsPlanner.Bodies). The review opens a storey's pending parts as ONE window (Merge), and the
// placement event applies them in ONE TransactionGroup named UndoName: one Undo entry, while each changeset keeps its own ledger row.
// The storey is read from the name the add-in wrote on a Promote changeset (founder decision F1 A: no bridge field). Pure
// (tools/promote-check, section 37).
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder;

public static class StoreyBatch
{
    // Bodies' " (i/n)": the part and the number of parts of one storey (ASCII digits: \d would take any script's).
    private static readonly Regex Part = new Regex(@" \(([0-9]{1,4})/([0-9]{1,4})\)$", RegexOptions.CultureInvariant);

    /// <summary>The changeset's name without the " (i/n)" Bodies adds to a storey of several changesets; any other name as it is.</summary>
    public static string StoreyOf(string name)
    {
        var m = Part.Match(name ?? "");
        return m.Success ? name.Substring(0, m.Index) : name ?? "";
    }

    /// <summary>What is reviewed and applied with <paramref name="first"/>. A Promote changeset that is one part of a storey brings the
    /// storey's other parts in <paramref name="pending"/> — Promote's, the same storey, the same number of parts — in part order, when
    /// every part 1..n waits exactly once. Review C7: a part waiting twice (two Promote runs of one storey: nothing in a changeset names
    /// its run) or a part missing is never guessed at — <paramref name="first"/> is reviewed alone, and the review says so
    /// (ReviewChangesetsCommand.Open). Any other changeset (an agent's, a storey of one changeset) is reviewed alone.</summary>
    public static List<ChangesetDto> Of(IEnumerable<ChangesetDto> pending, ChangesetDto first)
    {
        var alone = new List<ChangesetDto> { first };
        var fm = Part.Match(first?.Name ?? "");
        if (first?.Source != "promote" || !fm.Success) return alone;
        string stem = StoreyOf(first.Name), n = fm.Groups[2].Value;
        var parts = (pending ?? Enumerable.Empty<ChangesetDto>()).Where(c => c != null && c.Id != first.Id).Concat(new[] { first })
            .Select(c => (Cs: c, M: Part.Match(c.Name ?? "")))
            .Where(x => x.Cs.Source == "promote" && x.M.Success && x.M.Groups[2].Value == n && StoreyOf(x.Cs.Name) == stem)
            .GroupBy(x => int.Parse(x.M.Groups[1].Value)).OrderBy(g => g.Key).ToList();
        return parts.Count == int.Parse(n) && parts.Select((g, i) => g.Key == i + 1 && g.Count() == 1).All(ok => ok)
            ? parts.Select(g => g.Single().Cs).ToList() : alone;
    }

    /// <summary>The one changeset the review window shows for a storey: every part's elements and held rows, named as the storey
    /// ("… · GR-FFL (2 changesets, one Undo)"), with the first part's id and trust fields (Promote's on every part). A batch of one is
    /// itself.</summary>
    public static ChangesetDto Merge(IReadOnlyList<ChangesetDto> batch)
    {
        if (batch.Count == 1) return batch[0];
        return new ChangesetDto
        {
            Id = batch[0].Id, Name = $"{StoreyOf(batch[0].Name)} ({batch.Count} changesets, one Undo)", Source = batch[0].Source,
            Claimed = batch[0].Claimed, Status = batch[0].Status, CreatedAt = batch[0].CreatedAt,
            Adjudication = new AdjudicationDto
            {
                Verdict = string.Join(" / ", batch.Select(c => c.Adjudication?.Verdict ?? "?").Distinct()),
                IdsSource = batch[0].Adjudication?.IdsSource,
                Unattributed = batch.SelectMany(c => c.Adjudication?.Unattributed ?? new List<JsonElement>()).ToList(),
            },
            Elements = batch.SelectMany(c => c.Elements ?? new List<ChangesetElementDto>()).ToList(),
            Exceptions = batch.SelectMany(c => c.Exceptions ?? new List<ExceptionRowDto>()).ToList(),
        };
    }

    /// <summary>The guids of <paramref name="guids"/> that are <paramref name="cs"/>'s own elements — a storey's ticks and unticks,
    /// split back to the changeset each is reported on.</summary>
    public static List<string> Own(ChangesetDto cs, IEnumerable<string> guids)
    {
        var mine = new HashSet<string>((cs.Elements ?? new List<ChangesetElementDto>()).Select(e => e.ProposalGuid));
        return (guids ?? Enumerable.Empty<string>()).Where(mine.Contains).ToList();
    }

    /// <summary>The Undo entry's name: the storey's, with the first part's id, as the executor names a changeset's own transaction
    /// (UndoWatcher.TxName — the undo watcher and GhostFailurePolicy.DoctorSkips key on it). A batch of one keeps the changeset's own.</summary>
    public static string UndoName(IReadOnlyList<ChangesetDto> batch) =>
        UndoWatcher.TxName(batch.Count == 1 ? batch[0].Name : StoreyOf(batch[0].Name), batch[0].Id);
}
```

- [ ] **Step 4: Run it, and see it pass.** `dotnet run --project tools/promote-check` — `667/667` (dry run: section 37's 8 checks on master's 659). Then both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` — `0 Error(s)`, `5 Warning(s)`; `-p:RevitVersion=2026` — `0 Error(s)`, `3 Warning(s)` (master's counts).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/StoreyBatch.cs tools/promote-check/StoreyBatchChecks.cs tools/promote-check/Check.cs tools/promote-check/promote-check.csproj
git commit -F - <<'EOF'
feat(promote): MA-2d - StoreyBatch: a Promote storey's changesets read from the name Promote writes, merged for one review, split back per changeset, one Undo name

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 2 — C#: every changeset request off Revit's API thread, in one place

**Files:**
- Modify `SentinelAddin/Coordination/ChangesetClient.cs` — `Send`; `Req` takes the body (C1); `FetchProposed`, `FetchOne`, `MyRole`, `Post` call `Send`
- Modify `SentinelAddin/Commands.PromoteWalls.cs` — the first `Propose` goes through the client like the retry
- Create `tools/promote-check/Ma2dWiring.cs`; modify `tools/promote-check/Check.cs`, `tools/promote-check/Ma2cWiring.cs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ChangesetClient.Send(HttpClient http, Func<HttpRequestMessage> make) → (HttpResponseMessage Resp, string Body)` (private; review C1: the request — its token — is built inside the pool thread); `ChangesetClient.Req(HttpMethod m, string url, string token, string json = null)` (private; `json` set as the body); every public method of `ChangesetClient` keeps its signature.

- [ ] **Step 1: The source scans (section 38), and MA-2c's scan of the retry follows the code.**

`Create` `tools/promote-check/Ma2dWiring.cs`:

```csharp
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
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        StoreyBatchChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        StoreyBatchChecks();
        Ma2dThreadChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

In `tools/promote-check/Ma2cWiring.cs`, replace

```csharp
           // Review C22: the retry is a network call the plan adds, so it runs off the API thread (the PromoteContext.Fetch pattern).
           && promote.Contains("var cs = retry ? Task.Run(() => ChangesetClient.Propose(cfg, key, body, out err)).GetAwaiter().GetResult()"),
```

with

```csharp
           // Review C22: the retry is a network call the plan adds, so it runs off the API thread — MA-2d: ChangesetClient.Send, for every
           // request (section 38).
           && promote.Contains("var cs = ChangesetClient.Propose(cfg, key, body, out err);"),
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` — `666/669` (3 FAIL, dry run): section 38's two scans, and section 35's Propose scan (its literal now follows the code) — nothing is wired yet.

- [ ] **Step 3: `Send`, and its callers.**

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
using System.Text.Json.Serialization;
```

with

```csharp
using System.Text.Json.Serialization;
using System.Threading.Tasks;
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    public static List<ChangesetDto> FetchProposed(BcfConfig cfg, string projectKey, out string error)
```

with

```csharp
    // MA-2d (house rule: no network call on Revit's API thread): every request this client sends — Promote's and Ghost Builder's
    // Propose and Withdraw, the review's FetchProposed, FetchOne, MyRole and ReportResult, the undo watcher's revert — is built, sent
    // and read on a pool thread. Review C1: built there too, because reading the token (BcfConfig.ServiceToken → UserSession.AccessToken)
    // refreshes a token with a minute or less left over the network (a mutex wait up to 10 s, a Supabase call up to 8 s); make() runs
    // before the first await, so that mutex is taken and released on one thread. The body — UserSession.Actor in it, a file read — is
    // serialized on the caller's. ponytail: the caller still waits for the answer (8 s reads, 120 s writes), so Revit is held as long
    // as before; a review flow that does not wait is the upgrade (MA-2d Risks).
    private static (HttpResponseMessage Resp, string Body) Send(HttpClient http, Func<HttpRequestMessage> make) =>
        Task.Run(async () =>
        {
            var msg = make();
            var resp = await http.SendAsync(msg).ConfigureAwait(false);
            return (resp, await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
        }).GetAwaiter().GetResult();

    public static List<ChangesetDto> FetchProposed(BcfConfig cfg, string projectKey, out string error)
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
            var resp = ReadHttp.SendAsync(Req(HttpMethod.Get, url, cfg.ServiceToken)).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            var list = JsonSerializer.Deserialize<List<ChangesetDto>>(body) ?? new List<ChangesetDto>();
```

with

```csharp
            var (resp, body) = Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            var list = JsonSerializer.Deserialize<List<ChangesetDto>>(body) ?? new List<ChangesetDto>();
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
            var resp = ReadHttp.SendAsync(Req(HttpMethod.Get, url, cfg.ServiceToken)).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            return JsonSerializer.Deserialize<ChangesetDto>(body);
```

with

```csharp
            var (resp, body) = Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            return JsonSerializer.Deserialize<ChangesetDto>(body);
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
            var resp = ReadHttp.SendAsync(Req(HttpMethod.Get, url, cfg.ServiceToken)).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            using var doc = JsonDocument.Parse(body);
```

with

```csharp
            var (resp, body) = Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            using var doc = JsonDocument.Parse(body);
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
            var msg = Req(HttpMethod.Post, $"{cfg.ServiceUrl.TrimEnd('/')}{path}", cfg.ServiceToken);
            msg.Content = new StringContent(payload, Encoding.UTF8, "application/json");
            var resp = WriteHttp.SendAsync(msg).GetAwaiter().GetResult();
            body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
```

with

```csharp
            // Review C1: the request — its token and its body — is built inside Send's pool thread; payload was serialized here.
            HttpResponseMessage resp;
            (resp, body) = Send(WriteHttp, () => Req(HttpMethod.Post, $"{cfg.ServiceUrl.TrimEnd('/')}{path}", cfg.ServiceToken, payload));
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    private static HttpRequestMessage Req(HttpMethod m, string url, string token)
    {
        var msg = new HttpRequestMessage(m, url);
```

with

```csharp
    private static HttpRequestMessage Req(HttpMethod m, string url, string token, string json = null)
    {
        var msg = new HttpRequestMessage(m, url);
        if (json != null) msg.Content = new StringContent(json, Encoding.UTF8, "application/json"); // MA-2d C1: a write's body, built with it
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
            // Review C22: a network call this plan adds runs off the API thread (Revit still waits, as for PromoteContext.Fetch).
            var cs = retry ? Task.Run(() => ChangesetClient.Propose(cfg, key, body, out err)).GetAwaiter().GetResult()
                           : ChangesetClient.Propose(cfg, key, body, out err);
```

with

```csharp
            // Review C22, MA-2d: ChangesetClient sends every request off the API thread (Send) — the first attempt and the retry alike;
            // Revit still waits for the answer, as for PromoteContext.Fetch.
            var cs = ChangesetClient.Propose(cfg, key, body, out err);
```

- [ ] **Step 4: Run it, and see it pass.** `dotnet run --project tools/promote-check` — `669/669` (dry run). Then both builds: Revit 2024 — `0 Error(s)`, `5 Warning(s)`; Revit 2026 — `0 Error(s)`, `3 Warning(s)`. And the other check project that compiles `ChangesetClient.cs`: `dotnet run --project tools/session-check` — `47/47 checks pass` (master's).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/Commands.PromoteWalls.cs tools/promote-check/Ma2dWiring.cs tools/promote-check/Check.cs tools/promote-check/Ma2cWiring.cs
git commit -F - <<'EOF'
fix(revit): MA-2d - every ChangesetClient request is built (its sign-in token too, review C1), sent and read on a pool thread (Send): Promote's first Propose, the review's FetchProposed/FetchOne/MyRole/ReportResult, Ghost's Propose/Withdraw, the undo watcher's revert

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 3 — Revit-bound: one review, one group, one Undo per storey; each changeset reported; the D2 words

**Files:**
- Modify `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` — `ExecutionResult.Each`
- Modify `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` — the batch request; `RunChecked` over the storey
- Modify `SentinelAddin/Commands.ReviewChangesets.cs` — `Open` on a batch (a part reviewed alone is said, C7); each changeset reported and remembered; one LOD state after; `RunPromoteAgain`; `CarriedEdits` (C2); the all-unticked decline said (C6)
- Modify `SentinelAddin/UI/ChangesetReviewWindow.cs` — the C21 row says "this storey's" in a storey's window (C11)
- Modify `SentinelAddin/Commands.PromoteWalls.cs` — both opens take the storey's batch
- Modify `tools/promote-check/Ma2dWiring.cs`, `tools/promote-check/Check.cs`, `tools/promote-check/Ma2bWiring.cs`, `tools/promote-check/Ma2cWiring.cs`

**Interfaces:**
- Consumes: Task 1's `StoreyBatch.Of`, `Merge`, `Own`, `UndoName`, `StoreyOf`.
- Produces: `ChangesetExecutor.ExecutionResult.Each : List<(ChangesetDto Cs, ExecutionResult Res)>`; `ChangesetPlacementEvent.SetRequest(IReadOnlyList<ChangesetDto> batch, HashSet<string> ticked, Document doc, GuidelinePlacement placement = null, PromoteContext promote = null)`; `ReviewChangesetsCommand.Open(ExternalCommandData c, Document doc, BcfConfig cfg, string key, IReadOnlyList<ChangesetDto> batch)`; `ReviewChangesetsCommand.RunPromoteAgain` (const string); `ReviewChangesetsCommand.CarriedEdits(IEnumerable<ChangesetDto> fresh) → string` (internal static, C2).

- [ ] **Step 1: The source scans (section 39), and MA-2b's scan of the lone path follows the code.**

In `tools/promote-check/Ma2dWiring.cs`, replace

```csharp
           "Promote's first Propose is off the API thread too: C22's wrap of the retry is now the client's, for both");
    }
}
```

with

```csharp
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
        Ok(place.Contains("if (res.NotFinished == null) SentinelUndo.RollBack(group, doc);") && place.Contains("res.Error = $\"changeset \\\"{cs.Name}\\\": {res.Error}\";")
           && place.Contains("result.Each.Add((cs, res));"),
           "any changeset that fails rolls the whole storey back and the error names it; each changeset's own result is kept for its report");
        Ok(review.Contains("var cs = StoreyBatch.Merge(batch);") && review.Contains("foreach (var one in batch)") && review.Contains("var batch = StoreyBatch.Of(pending, pending[0]);")
           && promote.Contains("ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(pending, unreviewed))")
           && promote.Contains("ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(filed, first))")
           // Review C7: a Promote part reviewed alone (a part waits twice, or one is missing) is said.
           && review.Contains("is reviewed alone: another part of its storey is missing or waits twice (two Promote runs) — applying it is its own Undo entry, not the storey's.")
           // Review C11: in a storey's window the type edit's row counts "this storey's" retypes.
           && window.Contains("((_cs.Name ?? \"\").EndsWith(\", one Undo)\", StringComparison.Ordinal) ? \"storey\" : \"changeset\")}'s retypes onto it are applied"),
           "Review AI Proposals and Promote open a Promote storey's changesets in one window, each re-checked before anything runs; a part reviewed alone is said; a type edit's row says whose retypes it counts");
        int reported = At(review, "if (!Report(cfg, key, one.Id, res.Applied, rejected, said)) continue;");
        Ok(review.Contains("foreach (var (one, res) in result.Each)") && reported > 0 && At(review, "UndoWatcher.Remember(undo, key, one.Id, guids);") > reported
           && review.Contains("UndoWatcher.Remember(UndoWatcher.TxName(one.Name, one.Id), key, one.Id, guids);")
           && review.Contains("CommandReports.LodState(lod, fresh.Select(f => f.Id).ToList(), UserSession.Actor)"),
           "each changeset of the storey is reported on its own ledger row and remembered under the Undo entry's name and its own; the LOD state after is read once, for the storey");
        Ok(review.Contains("Report(cfg, key, f.Id, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),")
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
```

In `tools/promote-check/Check.cs`, replace

```csharp
        Ma2dThreadChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        Ma2dThreadChecks();
        Ma2dStoreyWiringChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

In `tools/promote-check/Ma2bWiring.cs`, replace

```csharp
           && place.Contains("if (before == null && promote?.Ids == null)") && place.Contains("result.Ids = \"DD IDS: not checked — \" + promote.IdsWhy;")
```

with

```csharp
           && !place.Contains("if (before == null && promote?.Ids == null") && place.Contains("result.Ids = \"DD IDS: not checked — \" + promote.IdsWhy;") // MA-2d C10: no lone path — every changeset runs in the group
```

In `tools/promote-check/Ma2cWiring.cs`, replace

```csharp
           && window.Contains("(ChangesetTrust.RetypedOnto(_cs, el) is int more && more > 0 ? $\" + {more} if this changeset's retypes onto it are applied\" : \"\")")
```

with

```csharp
           // MA-2d C11: a storey's window (StoreyBatch.Merge's name) counts "this storey's" retypes.
           && window.Contains("(ChangesetTrust.RetypedOnto(_cs, el) is int more && more > 0 ? $\" + {more} if this {((_cs.Name ?? \"\").EndsWith(\", one Undo)\", StringComparison.Ordinal) ? \"storey\" : \"changeset\")}'s retypes onto it are applied\" : \"\")")
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` — `667/674` (7 FAIL; the dry run's `668/674` before review C11): section 39's five scans, section 32's scan of the lone path, and section 35's C21 scan (their literals now follow the code).

- [ ] **Step 3: The wiring.**

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
        public List<(string Label, double OffDeg, bool Hand, bool Facing, bool NoHandFlip, bool NoFacingFlip)> Turned { get; } = new();
    }
```

with

```csharp
        public List<(string Label, double OffDeg, bool Hand, bool Facing, bool NoHandFlip, bool NoFacingFlip)> Turned { get; } = new();
        /// MA-2d: each changeset's own result, in the order it ran — a Promote storey's several changesets run in one group
        /// (ChangesetPlacementEvent.RunChecked), and the fields above are the storey's whole; one entry for a changeset run alone. Set by
        /// ChangesetPlacementEvent for a placed storey; the review reports each entry on its own ledger row.
        public List<(ChangesetDto Cs, ExecutionResult Res)> Each { get; } = new();
    }
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
    private ChangesetDto _cs;
```

with

```csharp
    private List<ChangesetDto> _batch; // MA-2d: one changeset, or a Promote storey's changesets (StoreyBatch) — applied as one Undo
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
    public void SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc, GuidelinePlacement placement = null, PromoteContext promote = null)
    { _cs = cs; _ticked = ticked; _doc = doc; _placement = placement; _promote = promote; }
```

with

```csharp
    public void SetRequest(IReadOnlyList<ChangesetDto> batch, HashSet<string> ticked, Document doc, GuidelinePlacement placement = null, PromoteContext promote = null)
    { _batch = batch?.ToList(); _ticked = ticked; _doc = doc; _placement = placement; _promote = promote; }
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
        var cs = _cs; var ticked = _ticked; var doc = _doc; var placement = _placement; var promote = _promote;
        _cs = null; _ticked = null; _doc = null; _placement = null; _promote = null;
        if (cs == null || ticked == null || doc == null)
```

with

```csharp
        var batch = _batch; var ticked = _ticked; var doc = _doc; var placement = _placement; var promote = _promote;
        _batch = null; _ticked = null; _doc = null; _placement = null; _promote = null;
        if (batch == null || batch.Count == 0 || ticked == null || doc == null)
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
            var kinds = (cs.Elements ?? new List<ChangesetElementDto>())
```

with

```csharp
            var kinds = batch.SelectMany(cs => cs.Elements ?? new List<ChangesetElementDto>())
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
            if (before == null && promote?.Ids == null)
            {
                result = new ChangesetExecutor { Placement = plan }.Execute(doc, cs, ticked);
                result.Block = note; // "not checked — the ruleset has not loaded yet", or null: no BLOCK rule can fire
            }
            else
            {
                result = RunChecked(doc, cs, ticked, before, plan, promote?.Ids);
                if (before == null && !result.NotRun) result.Block = note;
            }
```

with

```csharp
            // MA-2d (design §3.4 step 8; review C10): every changeset — one alone or a Promote storey's several — runs in the checked
            // group: one Undo, all or nothing. The executor bare left two Undo entries for a create with a Rotation (TurnToBlocks is a
            // second transaction; its comment says every caller runs the executor inside a group — now true).
            result = RunChecked(doc, batch, ticked, before, plan, promote?.Ids);
            if (before == null && !result.NotRun) result.Block = note; // "not checked — the ruleset has not loaded yet", or null: no BLOCK rule can fire
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
    /// MA-2b: <paramref name="before"/> is null when no BLOCK rule can fire, <paramref name="ids"/> when the changeset is not Promote's
    /// (or its DD IDS was not read); the group runs when either check does.
    private static ChangesetExecutor.ExecutionResult RunChecked(Document doc, ChangesetDto cs, HashSet<string> ticked, ScanReport before, PlacementPlan plan, StageIds ids = null)
    {
        using var group = new TransactionGroup(doc, UndoWatcher.TxName(cs.Name, cs.Id));
        try
        {
            group.Start();
            // F-S2-1: a group forces modal failure handling on its inner transactions unless told not to.
            group.IsFailureHandlingForcedModal = false;
            var result = new ChangesetExecutor { Placement = plan }.Execute(doc, cs, ticked);
            if (result.Error != null || result.NotFinished != null)
            {
                // ponytail: a Pending commit (NotFinished) is disposed with the group, as Ghost's build does; the executor's
                // all-or-nothing preprocessor answers every error, so Revit should never leave one pending.
                if (result.NotFinished == null) SentinelUndo.RollBack(group, doc);
                return result;
            }
```

with

```csharp
    /// MA-2b: <paramref name="before"/> is null when no BLOCK rule can fire, <paramref name="ids"/> when the changeset is not Promote's
    /// (or its DD IDS was not read); MA-2d (review C10): the group runs for every changeset, checked or not.
    /// MA-2d (design §3.4 step 8, spec amendment S1): every changeset of <paramref name="batch"/> runs through the executor in order
    /// inside ONE group (GhostChangesetBuild's pattern) named StoreyBatch.UndoName; the DD IDS then judges what the whole storey applied
    /// — so a type edit in the first changeset is seen by the retypes onto its type in a later one (MA-2c F11, within the storey;
    /// across storeys its ceiling stays — review C2) — the BLOCK check runs
    /// once, and the group is kept: one Undo entry. Any changeset that fails rolls the whole storey back (S4).
    private static ChangesetExecutor.ExecutionResult RunChecked(Document doc, IReadOnlyList<ChangesetDto> batch, HashSet<string> ticked, ScanReport before, PlacementPlan plan, StageIds ids = null)
    {
        var what = batch.Count == 1 ? $"changeset \"{batch[0].Name}\"" : $"storey \"{StoreyBatch.StoreyOf(batch[0].Name)}\" ({batch.Count} changesets)";
        using var group = new TransactionGroup(doc, StoreyBatch.UndoName(batch));
        try
        {
            group.Start();
            // F-S2-1: a group forces modal failure handling on its inner transactions unless told not to.
            group.IsFailureHandlingForcedModal = false;
            var result = new ChangesetExecutor.ExecutionResult();
            foreach (var cs in batch)
            {
                var res = new ChangesetExecutor { Placement = plan }.Execute(doc, cs, ticked);
                if (res.Error != null || res.NotFinished != null)
                {
                    // ponytail: a Pending commit (NotFinished) is disposed with the group, as Ghost's build does; the executor's
                    // all-or-nothing preprocessor answers every error, so Revit should never leave one pending.
                    if (res.NotFinished == null) SentinelUndo.RollBack(group, doc);
                    // The storey is all or nothing: the error names the changeset that failed when there are several.
                    if (res.Error != null && batch.Count > 1) res.Error = $"changeset \"{cs.Name}\": {res.Error}";
                    return res;
                }
                result.Each.Add((cs, res));
                result.Applied.AddRange(res.Applied);
                result.Gone.AddRange(res.Gone);
                result.Turned.AddRange(res.Turned);
                foreach (var kv in res.Warnings) result.Warnings[kv.Key] = (result.Warnings.TryGetValue(kv.Key, out var seen) ? seen : 0) + kv.Value;
            }
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
                var kindOf = (cs.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op != "set_parameter").ToDictionary(e => e.ProposalGuid, e => e.Kind ?? "wall");
                var (fails, notRead, notJudged, judged) = PromoteContext.JudgeApplied(doc, ids, result.Applied, kindOf);
                if (fails.Count > 0 && !PromoteContext.PlaceAnyway(fails, ids.Matrix, $"changeset \"{cs.Name}\""))
```

with

```csharp
                var kindOf = batch.SelectMany(c => c.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op != "set_parameter").ToDictionary(e => e.ProposalGuid, e => e.Kind ?? "wall");
                var (fails, notRead, notJudged, judged) = PromoteContext.JudgeApplied(doc, ids, result.Applied, kindOf);
                if (fails.Count > 0 && !PromoteContext.PlaceAnyway(fails, ids.Matrix, what))
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
            if (added.Count > 0 && !BlockCheck.PlaceAnyway(doc, added, $"changeset \"{cs.Name}\"", before.RulesetRef))
```

with

```csharp
            if (added.Count > 0 && !BlockCheck.PlaceAnyway(doc, added, what, before.RulesetRef))
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
                return new ChangesetExecutor.ExecutionResult { Error = $"Revit did not keep the changeset's Undo group (status {group.GetStatus()})" };
```

with

```csharp
                return new ChangesetExecutor.ExecutionResult { Error = $"Revit did not keep the {(batch.Count == 1 ? "changeset's" : "storey's")} Undo group (status {group.GetStatus()})" };
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
    private static readonly string[] Reporters = { "service", "contributor", "lead", "owner" };
```

with

```csharp
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
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
        var cs = pending[0]; // FIFO; the dialog says how many wait behind it
        if (pending.Count > 1)
            TaskDialog.Show("Sentinel — AI proposals", $"{pending.Count} proposals pending — reviewing the oldest first ({cs.Name}). Run again for the next.");
        return Open(c, doc, cfg, key, cs) ? Result.Succeeded : Result.Cancelled;
```

with

```csharp
        // FIFO; MA-2d: a Promote storey's changesets are reviewed together (StoreyBatch). The dialog says how many wait behind it.
        var batch = StoreyBatch.Of(pending, pending[0]);
        if (pending.Count > batch.Count)
            TaskDialog.Show("Sentinel — AI proposals", $"{pending.Count} proposals pending — reviewing the oldest first ({StoreyBatch.Merge(batch).Name}). Run again for the next.");
        return Open(c, doc, cfg, key, batch) ? Result.Succeeded : Result.Cancelled;
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
    /// <summary>Open the review window on one proposed changeset of <paramref name="doc"/> (bound to <paramref name="key"/>).
    /// False when a review window is already open. API thread (a command's Execute).</summary>
    internal static bool Open(ExternalCommandData c, Document doc, BcfConfig cfg, string key, ChangesetDto cs)
    {
        if (_reviewOpen)
        {
            TaskDialog.Show("Sentinel — AI proposals", "A review window is already open — finish or close it first.");
            return false;
        }
```

with

```csharp
    /// <summary>Open the review window on proposed changesets of <paramref name="doc"/> (bound to <paramref name="key"/>): one, or (MA-2d)
    /// the changesets of one Promote storey (StoreyBatch.Of) — shown as one, applied as one Undo, each reported on its own ledger row.
    /// False when a review window is already open. API thread (a command's Execute).</summary>
    internal static bool Open(ExternalCommandData c, Document doc, BcfConfig cfg, string key, IReadOnlyList<ChangesetDto> batch)
    {
        var cs = StoreyBatch.Merge(batch);
        if (_reviewOpen)
        {
            TaskDialog.Show("Sentinel — AI proposals", "A review window is already open — finish or close it first.");
            return false;
        }
        // Review C7: a Promote part reviewed alone — a part of its storey waits twice (two Promote runs) or is missing — is said.
        if (batch.Count == 1 && cs.Source == "promote" && StoreyBatch.StoreyOf(cs.Name) != cs.Name)
            TaskDialog.Show("Sentinel — AI proposals", $"\"{cs.Name}\" is reviewed alone: another part of its storey is missing or waits twice (two Promote runs) — applying it is its own Undo entry, not the storey's.");
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
            // Re-fetch: only a still-proposed changeset may run (an agent may have withdrawn it).
            var fresh = ChangesetClient.FetchOne(cfg, key, cs.Id, out var oneErr);
            if (fresh == null || fresh.Status != "proposed")
            {
                TaskDialog.Show("Sentinel — AI proposals",
                    fresh == null ? $"Couldn't re-check the changeset:\n{oneErr}" : $"Changeset is now \"{fresh.Status}\" — nothing was created.");
                return;
            }
```

with

```csharp
            // Re-fetch: only still-proposed changesets may run (an agent may have withdrawn one) — MA-2d: the whole storey, or nothing.
            var fresh = new List<ChangesetDto>();
            foreach (var one in batch)
            {
                var f = ChangesetClient.FetchOne(cfg, key, one.Id, out var oneErr);
                if (f == null || f.Status != "proposed")
                {
                    TaskDialog.Show("Sentinel — AI proposals",
                        f == null ? $"Couldn't re-check the changeset:\n{oneErr}" : $"Changeset{(batch.Count > 1 ? $" \"{f.Name}\"" : "")} is now \"{f.Status}\" — nothing was created.");
                    return;
                }
                fresh.Add(f);
            }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                Report(cfg, key, cs.Id, new List<AppliedEntry>(), unticked, note); // declined — no transaction at all
```

with

```csharp
                int declined = 0;
                foreach (var f in fresh) if (Report(cfg, key, f.Id, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note)) declined++; // declined — no transaction at all
                // Review C6: said, never silent — counted from the declines the bridge took; nothing in the model changed.
                TaskDialog.Show("Sentinel — AI proposals", $"Declined {declined} of {fresh.Count} changeset(s) — nothing in the model changed." +
                    (fresh[0].Source == "promote" ? CarriedEdits(fresh) + "\n\n" + RunPromoteAgain : ""));
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
            var promote = fresh.Source == "promote" ? Task.Run(() => PromoteContext.Fetch(key)).GetAwaiter().GetResult() : null;
```

with

```csharp
            var promote = fresh[0].Source == "promote" ? Task.Run(() => PromoteContext.Fetch(key)).GetAwaiter().GetResult() : null;
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                    // Whole changeset rolled back: report declined with the reason — honestly.
                    Report(cfg, key, cs.Id, new List<AppliedEntry>(),
                        cs.Elements.Select(e => e.ProposalGuid).ToList(),
                        $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"));
                    TaskDialog.Show("Sentinel — AI proposals", $"Transaction failed and was rolled back:\n{result.Error}\n\nReported as declined.");
                    return;
```

with

```csharp
                    // Whole changeset — MA-2d: the whole storey — rolled back: each changeset reported declined with the reason, honestly.
                    foreach (var f in fresh)
                        Report(cfg, key, f.Id, new List<AppliedEntry>(), f.Elements.Select(e => e.ProposalGuid).ToList(),
                            $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"));
                    TaskDialog.Show("Sentinel — AI proposals", $"Transaction failed and was rolled back:\n{result.Error}\n\nReported as declined" +
                        (fresh.Count > 1 ? $" — all {fresh.Count} changesets of the storey." : ".") + (fresh[0].Source == "promote" ? CarriedEdits(fresh) + "\n\n" + RunPromoteAgain : ""));
                    return;
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                // MA-1a step 2: an element Revit removed at commit is reported as rejected, with the reason in the note.
                var gone = result.Gone.Select(a => a.ProposalGuid).ToList();
                var rejected = unticked.Concat(gone).Distinct().ToList();
                var said = gone.Count == 0 ? note : $"{gone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
                if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
                if (result.Ids != null) said = result.Ids + (string.IsNullOrEmpty(said) ? "" : " | " + said);     // MA-2b
                // Only a result the bridge holds is watched: an Undo then posts changeset_reverted for these guids.
                if (Report(cfg, key, cs.Id, result.Applied, rejected, said))
                    UndoWatcher.Remember(UndoWatcher.TxName(fresh.Name, fresh.Id), key, fresh.Id, result.Applied.Select(a => a.ProposalGuid));
```

with

```csharp
                // MA-1a step 2: an element Revit removed at commit is reported as rejected, with the reason in the note. MA-2d: each
                // changeset of the storey is reported on its own ledger row; the storey's BLOCK and IDS lines ride on each note.
                var gone = result.Gone.Select(a => a.ProposalGuid).ToList();
                var undo = StoreyBatch.UndoName(fresh);
                foreach (var (one, res) in result.Each)
                {
                    var oneGone = res.Gone.Select(a => a.ProposalGuid).ToList();
                    var rejected = StoreyBatch.Own(one, unticked).Concat(oneGone).Distinct().ToList();
                    var said = oneGone.Count == 0 ? note : $"{oneGone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
                    if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
                    if (result.Ids != null) said = result.Ids + (string.IsNullOrEmpty(said) ? "" : " | " + said);     // MA-2b
                    // Only a result the bridge holds is watched: an Undo then posts changeset_reverted for these guids — remembered under
                    // the Undo entry's name (the group's) and the changeset's own, whichever Revit reports (GhostChangesetBuild's rule).
                    if (!Report(cfg, key, one.Id, res.Applied, rejected, said)) continue;
                    var guids = res.Applied.Select(a => a.ProposalGuid).ToList();
                    UndoWatcher.Remember(undo, key, one.Id, guids);
                    UndoWatcher.Remember(UndoWatcher.TxName(one.Name, one.Id), key, one.Id, guids);
                }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                            GovernedNotify.Report("LOD state after", CommandReports.LodState(lod, new[] { fresh.Id }, UserSession.Actor), key);
```

with

```csharp
                            GovernedNotify.Report("LOD state after", CommandReports.LodState(lod, fresh.Select(f => f.Id).ToList(), UserSession.Actor), key);
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
            if (fresh.Elements.Any(e => ticked.Contains(e.ProposalGuid) && (e.Op is null or "create")))
```

with

```csharp
            if (fresh.SelectMany(f => f.Elements).Any(e => ticked.Contains(e.ProposalGuid) && (e.Op is null or "create")))
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        if (unreviewed != null)
            return ReviewChangesetsCommand.Open(c, doc, cfg, key, unreviewed) ? Result.Succeeded : Result.Cancelled;
```

with

```csharp
        if (unreviewed != null) // MA-2d: with the rest of its storey (StoreyBatch)
            return ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(pending, unreviewed)) ? Result.Succeeded : Result.Cancelled;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        var filedIds = new List<string>(); // MA-1a item 8: the changesets this run filed, for its receipt
```

with

```csharp
        var filedIds = new List<string>(); // MA-1a item 8: the changesets this run filed, for its receipt
        var filed = new List<ChangesetDto>(); // MA-2d: the first storey's changesets are opened together
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
            first ??= cs;
            filedIds.Add(cs.Id);
```

with

```csharp
            first ??= cs;
            filed.Add(cs);
            filedIds.Add(cs.Id);
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        return ReviewChangesetsCommand.Open(c, doc, cfg, key, first) ? Result.Succeeded : Result.Cancelled;
```

with

```csharp
        return ReviewChangesetsCommand.Open(c, doc, cfg, key, StoreyBatch.Of(filed, first)) ? Result.Succeeded : Result.Cancelled;
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace (review C11)

```csharp
                                   (ChangesetTrust.RetypedOnto(_cs, el) is int more && more > 0 ? $" + {more} if this changeset's retypes onto it are applied" : "") + // review C21
```

with

```csharp
                                   (ChangesetTrust.RetypedOnto(_cs, el) is int more && more > 0 ? $" + {more} if this {((_cs.Name ?? "").EndsWith(", one Undo)", StringComparison.Ordinal) ? "storey" : "changeset")}'s retypes onto it are applied" : "") + // review C21; MA-2d C11: a storey's window (StoreyBatch.Merge) counts every part
```

- [ ] **Step 4: Run it, and see it pass.** `dotnet run --project tools/promote-check` — `674/674` (dry run). Then both builds: Revit 2024 — `0 Error(s)`, `5 Warning(s)`; Revit 2026 — `0 Error(s)`, `3 Warning(s)` (master's counts).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/UI/ChangesetReviewWindow.cs SentinelAddin/Commands.PromoteWalls.cs tools/promote-check/Ma2dWiring.cs tools/promote-check/Check.cs tools/promote-check/Ma2bWiring.cs tools/promote-check/Ma2cWiring.cs
git commit -F - <<'EOF'
feat(promote): MA-2d - one Undo per storey: a Promote storey's changesets in one review window, one ExternalEvent, one TransactionGroup named as its Undo entry; the DD IDS judged on the whole storey (F11 within the storey), BLOCK once; any failure rolls the storey back and declines every changeset; each changeset reported on its own row and remembered under both names; one LOD state after; the D2 words. Review C2/C6/C7/C10/C11: a declined storey names its type edits and what later storeys need, an all-unticked decline is said, a part reviewed alone is said, the lone path is gone (every changeset in the group), a storey's type-edit row counts "this storey's" retypes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4 — Words: the design doc; the final checks

**Files:**
- Modify `docs/strategy/2026-09-30-model-automation-design.md`

- [ ] **Step 1: The design doc says what landed.**

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - One Undo per storey: all changesets of a storey in one ExternalEvent inside `SentinelUndo.Run`, then the LOD state after.
  - DAT-3, ANV-1, ANV-2: plans for each story with the office templates, datums pinned. They run as their own batch, because Revit may empty the Undo list after view actions.
```

with

```markdown
  - One Undo per storey: all changesets of a storey in one ExternalEvent inside `SentinelUndo.Run`, then the LOD state after. BUILT on `feature/ma2d-storey-undo`, drill MA2d pending (2026-10-03, plan `docs/superpowers/plans/2026-10-03-ma2d-storey-undo-plans.md`): a Promote storey's changesets (`StoreyBatch`, read from the name Promote writes) are reviewed in one window and applied in one TransactionGroup named as the storey's Undo entry (`ChangesetPlacementEvent.RunChecked`, kept by `Assimilate`, rolled back by `SentinelUndo.RollBack` — `SentinelUndo.Run`'s contract, spec amendment S1); the DD IDS is judged on the whole storey, the BLOCK check runs once, any failure rolls the storey back and declines every changeset; each changeset keeps its ledger row; one LOD state after per storey. Every `ChangesetClient` request now runs off Revit's API thread (`Send`).
  - DAT-3, ANV-1, ANV-2: plans for each story with the office templates, datums pinned. They run as their own batch, because Revit may empty the Undo list after view actions. Moved to MA-2e (MA-2d plan, founder decision F7).
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
Per storey and level to level: MISSING.
```

with

```markdown
Per storey: BUILT on `feature/ma2d-storey-undo`, drill MA2d pending (one review window, one ExternalEvent, one TransactionGroup, one Undo). Level to level: MISSING.
```

(Review C9: "BUILT …, drill MA2d pending" — claimed, not verified; the merge step replaces both lines' `BUILT on \`feature/ma2d-storey-undo\`, drill MA2d pending` with the drill's result.)

- [ ] **Step 2: The final checks** (from the repo root):
  - every tracked check project: `for p in $(git ls-files 'tools/*-check/*.csproj' | xargs -n1 dirname | sort -u); do dotnet run --project "$p"; done` — all 26 pass (`promote-check 674/674 checks pass`, `session-check` as on master, the rest as on master);
  - the builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` — `0 Error(s)`, `5 Warning(s)`; `-p:RevitVersion=2026` — `0 Error(s)`, `3 Warning(s)` (master's counts); 2022 and 2027 are not required builds.
  - No file under `WebApp/` changed: `git diff --stat master -- WebApp` prints nothing.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -F - <<'EOF'
docs(design): MA-2d built, drill MA2d pending - one Undo per storey (one review, one TransactionGroup, the DD IDS on the whole storey), ChangesetClient off the API thread; DAT-3/ANV-1/ANV-2 moved to MA-2e

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Live drill MA2d (Revit 2024, scratch copies only — on the branch, before the merge)

**The founder's OK first.** The set-up's build deploys the branch's add-in into Revit 2024 (and R26-1's into Revit 2026). That needs the founder's explicit OK in chat for this drill; without it, nothing below runs and every row is **owed**.

**Who does what.** The drill runner drives Revit by mouse (or UI Automation's Invoke, as in MA2c). Signing in and signing out need the founder's password. If the founder is away, the drill runs in whichever state the PC is in, and the other state is recorded as **owed** — never as passed. The sign-in state found before the drill is recorded, and the closing list returns the PC to it. Signed in, the account is first made a **lead** of the scratch projects (a changeset write needs contributor). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window.

**The Revit MCP in this drill:** only its read-only calls — `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`, `get_available_family_types` — and never while a Revit command, a TaskDialog or a Sentinel window is open (the review window is modeless: close it first).

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **A second account approves one batch, and the ledger names it** (MA2 row 7): needs the founder's second account and its password — owed unless the founder runs it (F6).
- **Signed in or signed out**: whichever this session does not run is owed (the actor on the `changeset_applied`, `changeset_reverted` and `lod_state` rows).
- **W-1 (the web Holding Area, from MA2c) and the Next strip (MA2b)**: port 4000 is held by the founder's `thatopen serve` and the app needs the founder's platform sign-in — owed unless the founder frees the port and signs in (read only: `netstat -ano | findstr :4000`).
- **Gap groups** (MA2 row 5): passed live in drill MA2c (G-1, G-2) and unchanged here — cited, not run again.
- **Revit 2027**: one 2026 row runs (F5); 2027 is owed.
- **Carried from MA2c**: a window U-value (UNSURE 2 of MA2c), a real office matrix (LM-1).
- **A real concept model for G2** (F2, review C4): owed until the founder names one; G2 measures Sentinel's own seeds.
- **The G2 decision** (F4): the founder's, after this record.

**Set-up (once):**
- **Build.** Close Revit. Record the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`, lower case) and the commit it was built from, if known — else "unknown". With the founder's OK: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build into Revit 2024; the closing list puts master's back). Record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The add-in's bridge settings.** Copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma2dbak` beside it. The file holds the file token: never print it, never open it in a viewer.
- **The test bridge on 127.0.0.1:4101** (the branch changes no bridge code; 4101 keeps the drill's scratch keys off the founder's 4100). From `WebApp`:
  - Probe which settings `config/.env` holds (names only, never a value):

    ```bash
    node -e 'import("./bridge/load-env.mjs").then(m => { const e = m.loadEnv(); for (const k of ["BCF_PORT", "BCF_EVENT_POLL_MS", "BCF_BASE"]) console.log(k, k in e ? "is set in config/.env — the shell cannot override it" : "is not in config/.env — the shell value is used") })'
    ```

  - If `BCF_PORT` is set in `config/.env`: stop, and ask the founder — the drill does not edit `config/.env`.
  - Start it in the background, event poll off: `BCF_PORT=4101 BCF_EVENT_POLL_MS=0 node bridge/bcf-service.mjs`. Its banner names port 4101, and `curl -s http://127.0.0.1:4101/health` answers. The founder's 4100 bridge is not touched, and no write route of it is called.
  - **Every bridge call of this drill names `http://127.0.0.1:4101` itself**, through this helper (defined once in the drill's shell; it reads the token through `load-env.mjs`; a path without its leading slash; a body starting with `@` is a file):

    ```bash
    b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
    ```

  - Point the add-in at the test bridge with a script that prints nothing of the file: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The drill's files**, in `Documents\Sentinel drills\ma2d\` (never committed). From `WebApp`, after `D="$(cygpath -m "$HOME/Documents/Sentinel drills/ma2d")"; mkdir -p "$D"`:
  - the catalogue with a Fire Rating on both wall types the DD rules produce, so the partitions' type edit rides in `(1/2)` and the retypes onto it in `(2/2)` (F11): `node -e 'const fs = require("fs"), c = JSON.parse(fs.readFileSync("../demo/bds-pilot/bds-type-catalog.json", "utf8")); for (const [t, v] of [["BDS_EXT_ARC_CMU_200 mm", "60 min"], ["BDS_INT_ARC_GYPS_100 mm", "30 min"]]) { const r = c.types.filter(x => x.category === "Walls" && x.type === t); if (r.length !== 1) throw new Error(t + " rows: " + r.length); r[0].params = { ...r[0].params, "Fire Rating": v }; } fs.writeFileSync(process.argv[1] + "/catalog-fr2.json", JSON.stringify(c)); console.log("catalog-fr2.json", c.types.length)' "$D"`;
  - the crowded storey (S2, review C3) is written at "The crowd, placed" below, once `ma2d-a.rvt` is open — its rows are read from the model first.
- **The scratch web projects.** Nothing is installed on `demo`, `bds-office` or any real office.
  - `b4101 POST cde/projects '{"key":"ma2d-office","kind":"office"}'`; then, each `{"key":"<k>","office_key":"ma2d-office"}`, the projects `ma2d` (the crowded copy; also G2's model B, C4), `ma2d-ma0` (G2's model A), `ma2d-26` (Revit 2026).
  - On the OFFICE: `b4101 PUT "cde/ma2d-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma2d-office/artefacts/type_catalog?actor=drill" "@$D/catalog-fr2.json"` (201, `type_catalog@1`), `b4101 PUT "cde/ma2d-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`, `b4101 PUT "cde/ma2d-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json`. No `ids@n` on the projects: the doors' Fire Rating has no source and goes to a person (MA2c proved the clause source).
  - **If the session is, or will be, signed in**: `b4101 POST cde/<key>/members '{"email":"<the account e-mail>","role":"lead"}'` for the office and the three projects; record each reply.
- **The scratch models**, in `Documents\Sentinel drills\ma2d\`, each bound with Sentinel ▸ Project Setup (current-project scope, not saved):
  - `ma2d-a.rvt` — a copy of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the PRE-Promote B35 seed), bound to `ma2d`;
  - `ma2d-ma0.rvt` — a copy of the MA-0 seed central `ma0-seed-central-0848.rvt.bak` (G1's model; expected in `Documents\sentinel-scratch\ma0\` beside the MA-0 scratch central — if it is not there, ask the founder; never search the disk), renamed `.rvt`, opened with **Detach from Central ▸ Detach and discard worksets**, bound to `ma2d-ma0` (G2, model A);
  - `ma2d-26.rvt` — another copy of the B35 seed, for R26-1, bound to `ma2d-26`.
- **The crowd, placed** on `ma2d-a.rvt` (S2, review C3: 160 free-standing concept partitions inside GR-FFL's outline, 800 mm long, 400 mm clear of every other wall, as one concept changeset):
  - MCP `get_available_family_types` (Walls): `MA0 Interior - 100mm` is in the seed. If it is not: stop, say so, and every row below is **owed**.
  - On the GR-FFL plan view, MCP `get_current_view_elements` (Walls): read each seed wall's line. Choose **10** `y` values (mm, the model's coordinates) such that every partition `[x, y] → [x + 800, y]` at the generator's 18 `x` positions (`x0` = 0, 4000, … 20000; `+400`, `+1600`, `+2800`) lies inside the outline and 400 mm clear of every seed wall; start from the earlier guess `1000, 2000, 3000, 8500, 9500, 10500` and keep only what the read confirms. Record the 10 values. If 10 such rows do not exist, stop and record F-MA2d-n (the drill needs another layout, not a guess).
  - From `WebApp`: `node -e 'const [d, n, ys] = process.argv.slice(1), at = []; for (const y of ys.split(",").map(Number)) for (let x0 = 0; x0 < 24000; x0 += 4000) for (const dx of [400, 1600, 2800]) at.push([x0 + dx, y]); if (+n > at.length || +n > 200) throw new Error("at most " + at.length); require("fs").writeFileSync(d + "/crowd.json", JSON.stringify({ name: "MA2d crowd seed", source: "concept", elements: at.slice(0, +n).map(([x, y], i) => ({ kind: "wall", place: { TypeName: "MA0 Interior - 100mm", LevelName: "GR-FFL", LocationCurve: { start: [x, y, 0], end: [x + 800, y, 0] }, BaseElevation: 0, TopElevation: 3000 }, validate: { identity: { Class: "IfcWall", Name: "MA2D-C" + String(i + 1).padStart(3, "0") } } })) })); console.log("crowd.json", +n)' "$D" 160 "<the 10 y values, comma-separated>"` — prints `crowd.json 160` (it throws when fewer than 160 positions).
  - `b4101 POST changesets/ma2d "@$D/crowd.json"` (201); Sentinel ▸ Review AI Proposals → `MA2d crowd seed`; tick each of the 160 create rows (a create is never pre-ticked; UI Automation's Toggle/Invoke as in MA2c is fine); **Apply** → `Applied 160 element(s) from "MA2d crowd seed".` Record the ledger row id.

**Record before the first row**, on `ma2d-a.rvt` after the crowd: MCP `get_available_family_types` for Walls and Doors (the type count before — "zero types created" is read against it); by mouse, Revit's Undo list (the arrow beside Undo): its top entry is the crowd's `Sentinel AI changeset: MA2d crowd seed [<id8>]`.

**Expected from the seed** (drill MA2c's record): GR-FFL's own changeset was 48 rows plus 3 type edits; the crowd adds 160 retypes onto `BDS_INT_ARC_GYPS_100 mm` (Location Interior) and 160 attaches (top 3000 mm, under `01-FFL` at 3300) — about 370 ghosts on GR-FFL (about 210 if the Location rule holds the retypes, UNSURE 7) → `Promote (DD) · GR-FFL (1/2)` and `(2/2)` either way (C3); `01-FFL` and any other storey one changeset each. The type edits ride at the start of GR-FFL's ghosts (C8), so in `(1/2)`; most crowd walls' retypes are in `(2/2)`. With both wall types' Fire Rating from the catalogue, the DD IDS before commit should fail only the elements MA2c's A-1 left failing for another reason than the walls' Fire Rating (the gap walls; the doors, whose Fire Rating has no source now) — **no crowd wall** fails it (F11 gone within the storey; across storeys its ceiling stays — C2, S-1). A difference is recorded with its reason, not by itself a failure.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| P-1 | On `ma2d-a.rvt`: Sentinel ▸ Promote (DD); read the dialog. **Precondition (C3):** if the dialog shows GR-FFL as one changeset (200 ghosts or fewer), answer **No**, record F-MA2d-n, and A-1, U-1, S-1 and G2-B are **owed**, never passed. Otherwise **Yes** | The dialog reads `File <k> changeset(s)?` with `<k>` ≥ 3; the LOD line `LOD state now …` (the before count); `DD properties: 2 type edit(s) from a cited source (never pre-ticked) · …` (CMU_200 "60 min", GYPS_100 "30 min"). After Yes, ONE review window opens, titled `Sentinel — Review AI proposal: Promote (DD) · GR-FFL (2 changesets, one Undo)`; it lists the rows of both changesets (the count = the two filed changesets' elements, read with `b4101 GET "changesets/ma2d?status=proposed"`); the type edit rows are **unticked** and GYPS_100's reads `… reaches <k> element(s) in the model now + <m> if this storey's retypes onto it are applied …` (C11: "this storey's", not "this changeset's") with `<m>` = every retype onto it in BOTH changesets (about 170) | The dialog's text; the two changesets' ids, names and element counts; `<k>`, `<m>`; the row's words; the GR-FFL review's start time (G2-B) |
| A-1 | Tick the two type edits (every other row as pre-ticked); time from the window opening; **Apply**; at the DD IDS dialog read the tally and See details; **Place anyway** (or the result, if it does not ask) | ONE DD IDS dialog for the storey (`storey "Promote (DD) · GR-FFL" (2 changesets)`); its tally names **no** `Walls · DD: missing Pset_WallCommon.FireRating` line for a crowd wall or an outline wall (See details lists none of `W <crowd id>`); ONE result dialog: `Applied <n> element(s) from "Promote (DD) · GR-FFL (2 changesets, one Undo)".` with ONE `LOD state after …` line; `b4101 GET "cde/ma2d/audit?entity_type=changeset&limit=4"`: TWO `changeset_applied` rows, one per changeset id, each with its own `applied` (the two add up to `<n>`), and `values` (the two type edits) on `(1/2)`'s; `b4101 GET "cde/ma2d/audit?entity_type=lod_state&limit=1"`: ONE row naming both changeset ids; every applied retype's target type is a Walls row of `type_catalog@1` (design `:1094`, review C18): `b4101 GET "changesets/ma2d" | node -e 'const fs = require("fs"), t = fs.readFileSync(0, "utf8"), all = JSON.parse(t.slice(t.indexOf(" ") + 1)), cat = new Set(JSON.parse(fs.readFileSync(process.argv[1] + "/catalog-fr2.json", "utf8")).types.filter(x => x.category === "Walls").map(x => x.type)); const r = all.filter(c => c.status === "applied" && c.source === "promote").flatMap(c => c.elements.filter(e => e.op === "retype")), miss = r.filter(e => !cat.has(e.place && e.place.TypeName)); console.log("retypes", r.length, "not in catalog", miss.length, miss.slice(0, 5).map(e => e.place && e.place.TypeName))' "$D"` prints `not in catalog 0`; MCP `get_available_family_types` Walls and Doors: the counts before (**zero types created**) | The tally; `<n>`; the two row ids; the lod_state row and its line; the time from window to result dialog; the retypes and catalog misses; the counts |
| U-1 | Close the dialogs and the review window. Read Revit's Undo list before pressing. Edit ▸ Undo once. Read it again | Before: the top entry is ONE `Sentinel AI changeset: Promote (DD) · GR-FFL [<first id8>]` (not two), the crowd's entry under it; after one Undo the top entry is the crowd's. MCP `get_current_view_elements` on the GR-FFL plan view: every crowd wall `MA0 Interior - 100mm` again, the outline walls `Generic - 200mm`; Type Properties of `BDS_INT_ARC_GYPS_100 mm` ▸ Fire Rating empty (by mouse, then Cancel); the pane's Doctor shows TWO `changeset_reverted row posted` lines (one per changeset); `b4101 GET "cde/ma2d/audit?entity_type=changeset&limit=2"`: two `changeset_reverted` rows, one per changeset id | The Undo list before and after (UNSURE 1: which name it shows); the two row ids and their guid counts |
| S-1 | All or nothing, and the D2 words. `b4101 GET "changesets/ma2d?status=proposed"` → withdraw every pending Promote changeset (`b4101 POST changesets/ma2d/<id>/withdraw '{}'`) — MA2c D2. Promote (DD) → **Yes**: the window opens on GR-FFL's two changesets again. From the reply of `b4101 GET "changesets/ma2d?status=proposed"`, pick one crowd wall whose every row (retype and attach) is in `(2/2)` — its `validate.identity.Name` `W <id>` appears in no row of `(1/2)` (C12: so `(1/2)` cannot fail first). Keep the review window open (it is modeless); in Revit, Manage ▸ Select by ID `<id>` ▸ Delete (one crowd wall). Back in the window: **Apply** | The dialog starts `Transaction failed and was rolled back:` and holds the prefix `changeset "Promote (DD) · GR-FFL (2/2)":` and the words `not in this model` (C12: not the executor's whole tail), then `Reported as declined: 2 of 2 changeset(s).` (C14), C2's line `This storey carried 2 type edit(s) (…). Other storeys of the same run that retype onto those types will fail the DD IDS check for that property until Promote plans again — decline them (untick all ▸ Apply), then run Promote (DD).` and the line `Run Promote (DD) again to plan this storey anew: it first opens any other Promote storey still waiting for review, and plans again once none is waiting.`; nothing of the storey is in the model (MCP on GR-FFL after closing the dialogs: the outline walls `Generic - 200mm` — they are `(1/2)`'s, rolled back with `(2/2)`; GYPS_100's Fire Rating empty); `b4101 GET "changesets/ma2d"`: both changesets `declined`. Then Promote (DD) again: it opens the next waiting Promote storey (`01-FFL`) first, as the words say; **untick every row ▸ Apply** — it was planned against GR-FFL's declined type edits (C2): the dialog reads `Declined 1 of 1 changeset(s) — nothing in the model changed.` (C6) with the `Run Promote (DD) again …` line; decline each other waiting Promote storey the same way, until Promote (DD) plans again (then answer **No**) | The dialog's words (C2's line, C6's line); both statuses; the MCP read |
| AST-1 | The aster-tower plan-only run (MA2 row 8, S3). In Revit: File ▸ Open, the aster-tower local `AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt` (from Revit's recent files) with **Detach from Central ▸ Detach and discard worksets** (it stays bound to `aster-tower`: the binding is in the model); Sentinel ▸ Promote (DD). The local file itself is not changed (a detached copy lives in memory only) | `Guideline: <label>`, where the label says no guideline is **installed** (C8: a label of "could not be loaded" or "did not parse" fails the row and records F-MA2d-n — the words would claim "not installed" for a guideline that was not read), and `No DD rule file is installed for "aster-tower" or its office — nothing to plan. Install one as guideline@n.`; nothing is filed (`b4101 GET "changesets/aster-tower?status=proposed"` lists no Promote changeset of this run) and no `lod_state` row is posted (`b4101 GET "cde/aster-tower/audit?entity_type=lod_state&limit=1"`: none newer than the run). Close the detached copy without saving | The dialog's text; the two replies |
| G2-A | Edit cost, model A (F2, F3). On `ma2d-ma0.rvt`: Promote (DD) → **Yes**; for each storey's review: read every row as a reviewer would, untick any you would not accept (write each one's reason), Apply, Place anyway where asked; time from the window opening to the result dialog; Promote again for the next storey (D2) until none waits | — (a measure, not a pass) | Per storey: rows filed, rows unticked (with reasons), elements and DD properties sent to a person, LOD state before/after, Revit warnings counted, the time; compared with G1's 25 unticks on storey 1 and about 2 min 20 s. Said once: the window cannot change a row. Reviewer: the drill runner (Claude), as in G1 |
| G2-B | Edit cost, model B (F2, F3, C4) — on `ma2d-a.rvt`, after S-1. GR-FFL's numbers are P-1/A-1's (A-1's window was read as a reviewer would). Then: Promote (DD) → **Yes** (it plans again: none waits); GR-FFL's window → tick the two type edits, Apply, Place anyway where asked (so 01-FFL's retypes see the type edits); Promote (DD) → 01-FFL's window: read every row as a reviewer would, untick any you would not accept (each with its reason), time it, Apply. Nothing else is applied for G2 | — (a measure, not a pass) | GR-FFL (from P-1/A-1) and 01-FFL: the numbers of G2-A |
| R26-1 | Revit 2026 (F5). Close Revit 2024. With the founder's OK: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026` (it deploys into Revit 2026); record the DLL's sha256. Open `ma2d-26.rvt` in Revit 2026 (it upgrades on open; not saved); Promote (DD) → **Yes**; Apply GR-FFL (pre-ticks only); one Undo | The review opens; `Applied <n> element(s)`; one Undo entry; one Undo takes it back (MCP: outline walls `Generic - 200mm`); the Doctor's `changeset_reverted row posted`. If Revit 2026 is not installed: **owed**, with that reason | The result; the Undo; the DLL hash |

Request bodies and the drill's files are kept in `Documents\Sentinel drills\ma2d\`. The rows run in the order above: A-1 follows P-1; U-1 follows A-1 (it undoes A-1's apply); S-1 follows U-1 on the same copy; G2-B follows S-1 on the same copy; G2-A and AST-1 are independent; R26-1 is last (it needs Revit 2024 closed).

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as session MA2d, with gaps named F-MA2d-n, each fixed on the branch ("fix(drill MA2d): …" with its check), G2's numbers in their own table for the founder's decision (F4), and the list of **owed** rows at its end.

**Closing list:**
- close Revit (2024 and 2026) without saving any scratch copy or the detached aster-tower copy;
- return the sign-in to the state found before the drill;
- stop the test bridge on 4101;
- restore the add-in's bridge settings: copy `bcf-config.json.ma2dbak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (and `-p:RevitVersion=2026` if R26-1 deployed), record each deployed DLL's sha256 beside the hashes recorded before the set-up. If the session's permission check refuses that build (as in MA2c), say so: the branch's build stays until the merge's deploy, and the founder's Revit then runs the branch's add-in against the master bridge — safe, since MA-2d changes no bridge vocabulary;
- list what the drill left on the shared ledger — the scratch office `ma2d-office` (`guideline@1`, `type_catalog@1`, `lod_matrix@1`, `ruleset@1`), the projects `ma2d`, `ma2d-ma0`, `ma2d-26`, the memberships, the changesets, the `lod_state`, `type_gap` and revert rows — left in place on purpose (scratch keys), as the earlier drills' were;
- list what the drill left on this PC outside the repository: the scratch projects' folders under `%AppData%\Sentinel\cache` (deleted: scratch keys only), the scratch copies and the drill's files in `Documents\Sentinel drills\ma2d\` (they stay, named, as the drill's evidence; never committed).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record;
- each F-MA2d-n fix is committed on the branch with its check, and Task 4 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does was deployed and its row run again live before the merge; a row whose fix was not run again is recorded as **owed**, not as passed;
- U-1 passed: one Undo entry took both changesets back and posted two `changeset_reverted` rows. If the Undo list shows two entries, or one Undo leaves `(2/2)`'s walls retyped, the storey was not one Sentinel action (XC-2): nothing is merged;
- S-1 passed: a failure in `(2/2)` left nothing of `(1/2)` in the model. If `(1/2)`'s walls stay retyped, the storey is not all or nothing: nothing is merged.
- (If P-1's precondition failed — GR-FFL filed one changeset — U-1 and S-1 are owed and the two lines above cannot hold: nothing is merged until the drill's layout files two changesets and they pass.)

**The design doc says what the drill proved (review C9)**, committed on the branch before the merge: in `docs/strategy/2026-09-30-model-automation-design.md`, replace both `BUILT on \`feature/ma2d-storey-undo\`, drill MA2d pending` with `LANDED in MA-2d (merge <date>), drill MA2d: <passed rows; owed rows>` — `git commit -m "docs(design): MA-2d - drill MA2d's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma2d-storey-undo -F - <<'EOF'
Merge feature/ma2d-storey-undo: MA-2d - one Undo per storey: a Promote storey filed as several changesets (Bodies' "(i/n)", read back by StoreyBatch from the name Promote writes - no bridge change) is reviewed in one window and applied in one ExternalEvent, inside one TransactionGroup named as the storey's Undo entry (RunChecked, Assimilate checked, SentinelUndo.RollBack - spec amendment S1); the DD IDS is judged on everything the storey applied (MA-2c F11 gone within a storey; across storeys its ceiling stays, and a declined storey names its type edits and what later storeys need - review C2), the BLOCK check runs once; every changeset, one alone too, runs in the group (review C10); any changeset that fails rolls the storey back and every changeset is declined; each changeset keeps its own changeset_applied row and is remembered under the group's name and its own; one lod_state after per storey. Every ChangesetClient request is built (its sign-in token too - review C1), sent and read on a pool thread (Send) - Promote's first Propose, the review's FetchProposed/FetchOne/MyRole/ReportResult, Ghost's Propose/Withdraw, the undo watcher. The decline dialog says Promote reopens a waiting storey before it plans again (MA2c D2). Drill MA2d: <the result, G2's numbers and the owed rows>. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order:** (1) the bridge — nothing: MA-2d changes no bridge code, and the master bridge on 4100 already takes several changesets of one name. (2) The add-in, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same with `-p:RevitVersion=<v>` for each other Revit version the founder uses. An older add-in still reviews each changeset of a storey on its own, as before. (3) The web app — nothing.

## UNSURE facts this drill settles

1. Which name Revit's Undo list and `GetTransactionNames` give an assimilated group of several changesets' transactions — the group's (`StoreyBatch.UndoName`) or an inner one. Both are remembered (E5); U-1 records which the list shows, and its two `changeset_reverted` rows prove the watcher matched.
2. Whether one Undo of the group takes back both changesets' transactions and the type edit (XC-2 for two executor transactions in one group). U-1.
3. Whether a failure in the second changeset rolls back the first's committed transaction inside the open group (`SentinelUndo.RollBack`). S-1.
4. Whether `ChangesetClient.Send` (the request built, sent and read on a pool thread, the caller waiting) changes any answer — review C1: the token is now read on a pool thread, under `UserSession`'s existing `lock (Gate)` and its cross-process mutex (taken and released on that one thread); the actor is still read on the caller's thread. Every row that files, reports or reverts; a failure would show as a 401/403, a `signed out — …` error from the token, or a missing actor.
5. Whether the review window and the DD IDS check stay usable at about 370 rows (no paging; the IDS reads every applied element). A-1's time.
6. Whether Revit 2026 is installed on this PC, and the B35 seed upgrades and runs Promote there. R26-1.
7. Whether 160 free-standing partitions on GR-FFL raise Revit warnings (they touch nothing) and whether the Location rule reads each as Interior (the planner's own words in P-1). Either way GR-FFL files two changesets (C3); P-1's precondition catches the case it does not.
8. What the model holds when a storey's later part is left pending by Revit (NotFinished) after earlier parts committed inside the group — the group is disposed, not rolled back (C17). No drill row can make Revit leave a commit pending on demand: owed, recorded if it ever happens (the dialog says `the storey's <n> changesets stay proposed`).

## Risks (each a ceiling stated in words)

- **The batch is read from a name.** A changeset posted with `source: "promote"` and a storey's exact name and part count joins that storey's window and its Undo (F1 A). Every row still shows with the bridge's own pre-tick and the person applies; the bridge records each source as a claim. A bridge `batch` field is under Next (F1 B).
- **Two runs of one storey are not batched (review C7).** Nothing in a changeset names its run, so when a part waits twice (two Promote runs from two PCs or sessions) or a part is missing, each part is reviewed alone — its own Undo entry, said in a dialog — never a guessed mix. Once a part was reviewed alone, the parts pending with it are never batched again in this Revit session (C13); another PC, or a restart between, can still batch two runs' leftovers (A1 alone, then B1 with A2). A run id in the name (the founder's: it changes the name) or a bridge `batch` field (Next) would close it and let such storeys batch again.
- **F11 across storeys (review C2).** A type edit rides in the first storey whose retypes land on its type; a later storey of the same run depends on it. If that storey is declined (or its type edit unticked), the later storeys fail the DD IDS for that property until Promote plans again. A declined storey says so (`CarriedEdits`); unticking only the type edit row of an applied storey is not said — the later storey's DD IDS dialog is then the words.
- **Revit still waits for the network.** `Send` moves the call off the API thread — the request and its sign-in token refresh too (C1) — but the command waits for the answer: a slow bridge holds Revit up to 8 s a read and 120 s a write, as before (C22's ceiling, now everywhere); a token refresh adds up to 18 s. A review flow that does not wait (the window answers when the report lands) is under Next.
- **One window for a whole storey.** About 370 rows in the drill, no paging; the window does not say which part a row is in (the ledger rows do). UNSURE 5.
- **All or nothing per storey.** One element that fails in any changeset declines the whole storey (S4); the person runs Promote again, and Promote first reopens any other waiting storey (D2: said).
- **Partly reviewed storeys.** If one part of a storey was reviewed by an older add-in, a part is missing: each remaining part is reviewed alone, its own Undo, said (C7).
- **Reports after the group is kept are one per changeset.** If the bridge takes the first and refuses the second (a network failure after the retry dialog), the model holds the storey while the ledger holds one row — the retry dialog's hazard words say so, as for Ghost's builds today.

## Next (out of scope here)

- **MA-2e**: DAT-3, ANV-1, ANV-2 — a floor plan and an RCP for each story level with the office view templates, view names from the View rule's tokens (refuse with the reason when a token is missing), every level and grid created pinned — in their OWN batch (B31: Revit may empty the Undo list after view actions; the ledger row is then the record and the review window says so). Its open questions, each with a recommended default: which views per story (the guideline's first FloorPlan entry and its CeilingPlan entry, one each; Annotate keeps the rest); token sources (a token is filled only from the guideline's view entry or the level's name when it passes the token's definition, else refused by name — on aster, LEVEL `L\d{2}` from "L1 - Architectural" is refused, SIM F44); what is pinned (existing story levels and all grids, pre-ticked in ANV-2's preview; `LEVEL_IS_BUILDING_STORY` is never set — that is DAT-2); a substitute for MH-LNK-01, which does not exist in code (a count in the result and a read of `Pinned`).
- **A bridge `batch` field** for a storey (F1 B), when an agent other than Promote files multi-part storeys.
- **A review flow that does not wait** on the network (Risks).
- **MA-3, MA-4** — after the founder's G2 decision (F4).
- Owed rows carried: a second account's approval, the signed-out actor, W-1, Revit 2027, a window U-value, LM-1.
