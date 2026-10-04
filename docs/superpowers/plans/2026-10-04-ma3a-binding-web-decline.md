# MA-3a — a binding web decline: the review desk, the bridge's review states, and Revit obeying them Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first slice of MA-3 (Review desk) — the review states of design §6.6 and founder decision D17, end to end, with no new rendering technology — and the drill MA3a:
- **The bridge holds the rules.** Each ghost of a changeset gets a web review state — proposed, accepted or declined — on the changeset doc (`elements[i].review`, the doc's `review_rev`), and every desk post writes ONE `changeset_reviewed` ledger row; a lead's re-open writes ONE `changeset_reopened` row. A decline needs a reason. Only a signed-in person reviews: the machine credential (the add-in signed out, the MCP agent, any script holding `BCF_TOKEN`) gets a 403 that says "sign in" (as `reviewDecide` does for model versions); a contributor or above accepts or declines; only a lead or owner re-opens a decline. Nothing is decided once the changeset is not proposed.
- **A web decline binds, a web accept is advice.** Revit's review window shows a declined ghost unticked, disabled, with `declined on the web by <who> (<role>): <reason> · a lead may re-open it on the web desk`; an accepted one reads as advice and keeps the bridge's pre-tick. Apply re-checks the fresh copies: a ticked ghost declined after the window opened refuses the whole Apply, naming it — nothing is created. The result carries the `review_rev` Apply re-checked: the bridge refuses (409) a result that applies a decline Revit had seen, and records one that landed after the re-check as `applied_over_late_decline` — said in Revit and kept on the result and the `changeset_applied` row. A result with no `review_rev` (an add-in before MA-3a, a script) is never judged late: each decline it applied is recorded as `applied_over_decline_unchecked` — the bridge cannot tell whether it was seen (C2).
- **The changeset doc is the bridge's alone (C1).** Migration 0037 takes the `changeset` store's signed-in writer away (0034's pattern), and the bridge writes every changeset doc with the service key after its own role check — a member can no longer re-open a decline by writing the doc straight through Supabase. The `changeset_reviewed` and `changeset_reopened` actions are reserved on the open audit route (C5).
- **No lost update (gotcha 1).** Every write of a changeset doc — a result, a withdraw, a review, a re-open — swaps on `review_rev` and bumps it; a lost swap reads again and decides again on the new doc (three in a row: a 503 in words, which Revit's `Report` offers to retry — C3). Today's result and withdraw swap on `status` only, so a web decision written between their read and their write would be lost silently.
- **The web review desk** (`WebApp/src/setups/review-desk.ts`, tab "Review" in BIM tools): the ghosts waiting in Revit's review, by storey (a Promote storey's ` (i/n)` parts together, StoreyBatch's rule) and by what they do; tick ghosts, Accept or Decline (a reason) in one post per changeset; a lead's Re-open. Plain DOM, no 3D (ghosts in the viewer are MA-3d). It takes the tab of the **Modeling studio, which is retired** (`model-panel.ts` deleted — it skipped Governed Intake; its local sketches are no longer shown).
- **Drill MA3a** — short: Revit 2024, a scratch copy of the B35 seed, the test bridge on `127.0.0.1:4101`, the web desk on a local dev server on port 4002 built against 4101 in one founder session (rows D-1 … D-5).

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md` — MA-3 (`:1102-1120`), the review states (§6.6, `:844-850`), the ledger rows `changeset_reviewed` / `changeset_reopened` (`:830-831`), the routes (`:876-877`), storage (`:942`), who may do what (`:945-956`), D17 (`:1338`), the two-account risk row (`:1368`); `docs/strategy/2026-09-30-revit-addin-audit.md` — AI-2 (`:352`), AI-5 (`:355`), the review findings (`:343-345`); the MA-2d plan's Risks (`docs/superpowers/plans/2026-10-03-ma2d-storey-undo-plans.md`). Base: `feature/ma3-review-desk` at `32605ca` (master `57b6295` + gate G2's decision). Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight, as the founder asks):** the review states and the desk's decisions, the bridge's trust rules, Revit obeying them in the existing window, the desk as a list. Left to Next (named under **Next**): MA-3b (the Revit desk that does not wait — AI-2, AI-5's picker, grouping, per-row decline reasons, zoom), MA-3c (the DirectContext3D ghost overlay — AI-4, GHB-4), MA-3d (web highlights by GlobalId, the proposal model, the Editor spike), a Revit "ticked" lock, and carrying a decline forward to a Promote re-run (C4).

**Architecture:**

*Pure (bridge).* `WebApp/bridge/changesets-logic.mjs` gains `REVIEW_STATES`, `reviewState(el)`, `reviewRev(cs)`, `reviewNext(state, action)`, `applyDecisions(cs, decisions, who)`, `reopenDecline(cs, guid, reason, who)` and `resultConflicts(cs, appliedGuids, rejectedGuids, seen)`. A shared fixture, `WebApp/bridge/fixtures/changeset-ops/ma3a-review.json`, holds one changeset before and after the desk's decisions, a lead's re-open, and a result reply over a late decline: vitest proves the bridge makes it, promote-check reads it as the add-in does (house rule 2, JSON contracts).

*Store and routes (bridge).* `changesets-store.mjs`'s writes go through one `rewrite(d, pid, id, decide)` — read, decide, `docReplaceIfField(…, "review_rev", <the revision read>, { service: true })`, three tries; the filing's `docInsert` is a service write too (C1). `WebApp/db/migrations/0037_changeset_bridge_only.sql` leaves the `changeset` store no signed-in writer; `cde-store.mjs` reserves the two new actions on the open audit route (C5). `reviewChangeset` and `reopenGhost` are new; `reportResult` takes `review_rev` and judges the result with `resultConflicts`. Two routes in `bcf-service.mjs`: `POST /changesets/:key/:id/review` and `/reopen`.

*Revit.* `ChangesetClient.cs` reads `review` (`ReviewDto`) and `review_rev`; `ChangesetTrust` gains `DeclinedOnWeb`, `ReviewLine`, `DeclinedHeader`, `DeclinedTicked`, `LateDeclines`, and `PreTick` returns false for a declined ghost; `ReportResult` sends `review_rev` and returns the reply. The window disables a declined row and leads it with the review line; `DecideRequested` refuses a declined tick on the fresh copies before anything runs; `Report` says a late or unchecked decline the bridge recorded; Ghost Builder's applying `Report` sends the `review_rev` its filing reply carried (C2). No new HTTP call: `Ma2dWiring`'s counts hold.

*Web.* `review-desk.ts` — pure helpers (`storeyOf`, `groupDesk`, `ghostLine`, `reviewWords`, `canDecide`, `canReopen`, `rowWords`, `postsFor` — C6), the bridge calls (`readPending`, `postReview`, `postReopen`) and the panel (`reviewDeskPanel`); mounted in `main.ts` where the Model tab was.

**Tech Stack:** Node bridge (ESM, vitest 2); C# add-in (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF built in code); the offline check `tools/promote-check`; TypeScript web app on That Open (`WebApp/src`, vitest in node, plain DOM).

## Global Constraints

- Branch `feature/ma3-review-desk` (it holds this plan, on `32605ca`); merge `--no-ff` into master only after every task's checks pass **and the live drill MA3a is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **The bridge holds the trust rules.** A review or re-open is a signed-in person's: the machine credential's is a 403 before anything is read. The add-in re-checks a decline on the fresh copies; the bridge re-checks the result — never trusted from a client.
  - **A web decline binds; a web accept is advice** (D17). An accept never changes a pre-tick; a create and a set_parameter are still never pre-ticked.
  - **Words are said, never silent.** A refusal names the ghost, the reviewer, the role and the reason; a decline Revit could not see and applied anyway is said in Revit, on the result and on the ledger row.
  - **Nothing is lost.** Every write of a changeset doc swaps on `review_rev`; no write overwrites another's decision.
  - **No network call on Revit's API thread** (house rule): no new HTTP call in the add-in — the result's body gains a field and its reply is read; every request stays inside `ChangesetClient.Send`'s pool thread (`Ma2dWiring` still counts 4 `() => Req(` and 3 GET sends).
  - **No Revit write is added.** Refusing an Apply creates nothing (the window's `DecideRequested` returns before `handler.SetRequest`).
  - **No new database table** (design `:943`). **One migration, 0037 (C1, overriding this plan's earlier "no migration")**: it redefines `bridge_docs_floor` only; it is applied on the founder's "apply" (never by a task), after the bridge that writes changesets with the service key runs.
- After the add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s.
- Checks: from `WebApp`, `npx vitest run <files>`; from the repo root, `dotnet run --project tools/promote-check`. A full vitest run rewrites `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with LF only: when `git diff --ignore-all-space --stat` on it is empty, `git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json`.
- A test never calls the real store: `baseDeps` in `changesets-store.test.mjs` mocks `docReplaceIfField` and makes `docReplaceIfStatus` throw (Task 2), so a test that reaches a write without its mock fails — it never sends a PATCH with the bridge's `config/.env`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound and web-UI wiring is checked by source scans and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100; never publish to the That Open platform.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are `32605ca`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs. A new file may be written with LF (git normalises it).

**Dry run (planner, 2026-10-04).** A detached worktree of `feature/ma3-review-desk` at `32605ca` in the session's scratchpad (`scratchpad/ma3/dry`, `WebApp/node_modules` linked in as a junction; removed afterwards — never the repository). Every code step of **Tasks 1–4** was applied in order (the brief asked for Tasks 1–2; 3 and 4 were applied too, so no step of this plan is unbuilt code), each task's Step 1 first and its "see it fail" run made, then its code and its "see it pass" run. After the plan was written, the worktree was reset to `32605ca` and Tasks 1–2 were applied again **from this document's text** by a script that reads its `Create`, replace, replace-every and add-at-the-end blocks as an implementer does (each replace matched its text exactly once), with each "see it fail" and "see it pass" run: the same totals. Tasks 3–4 were then applied from the text the same way (and `model-panel.ts` removed): the tree was identical, line endings aside, to the first run's, whose checks are below. The totals in the steps are those runs':
- Base totals, measured first: `vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs` `2 passed (2)` files, `132 passed (132)` tests; `vitest run bridge` `89 passed (89)` files, `1812 passed | 1 skipped (1813)`; `vitest run src` `54 passed (54)` files, `475 passed (475)`; the full `npx vitest run` `2267 passed | 1 skipped`; `promote-check` `678/678`.
- Task 1: `17 failed (17)` → `17 passed (17)`; with the logic tests `111 passed (111)`.
- Task 2: `25 failed | 26 passed (51)` (the 13 new tests, and 12 existing ones whose write now reaches the `docReplaceIfStatus` tripwire) → `51 passed (51)`; `vitest run bridge` `90 passed (90)` files, `1842 passed | 1 skipped (1843)`; `ids-cases.json` was rewritten LF-only with no other change and restored.
- Task 3: `promote-check` fails to compile (`CS1061: 'ChangesetElementDto' does not contain a definition for 'Review'`, `CS1061: 'ChangesetDto' does not contain a definition for 'ReviewRev'`, `CS0117: 'ChangesetTrust' does not contain a definition for 'DeclinedOnWeb'`, `CS0246: 'ReviewDto'`) → `694/694 checks pass`; `session-check` (it compiles `ChangesetClient.cs` too) `47/47`; builds 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — no warning in a file MA-3a touches (master's own).
- Task 4: `Failed to load url ./review-desk` (no tests) → `8 passed (8)`; `vitest run src` `55 passed (55)`, `483 passed (483)`; `npx tsc --noEmit -p tsconfig.json` 18 errors before and after, the same files (master's: `main.ts` 2 — the generated fragments worker and `ComponentsLike` —, `rule-engine.ts`, `scanner.ts`, `crypto*.ts`, `secure-store.ts`, `auth.ts`, `cobie-panel.ts`, `packs-panel.ts`, `verify-jwt.test.ts`), none in `review-desk.ts`.
- After Tasks 1–4: the full `npx vitest run` `2305 passed | 1 skipped (2306)`.
- Task 5: its eight replaces were applied from the text in the worktree, each matching exactly once (`16` lines changed, 8 out, 8 in). Not run: the drill, which needs Revit and the founder, and the commit commands. Nothing on any branch of the repository was changed by the dry run; only this plan is committed.

**Dry run after the review amendments (amender, 2026-10-04)** — these totals supersede the ones above where they differ. A fresh detached worktree at `eb3516f` (`scratchpad/ma3/amd`, `node_modules` linked; removed afterwards); Tasks 1–5 applied from this document's amended text by the same block-reading script (every replace matched exactly once), each "see it fail" and "see it pass" run:
- Task 1: `17 failed (17)` → with the logic tests `111 passed (111)` (unchanged counts; C2 rewrote one test).
- Task 2: `32 failed | 54 passed (86)` over the store, ledger-write and migration-0037 files → the five files `197 passed (197)`; `vitest run bridge` `91 passed (91)` files, `1849 passed | 1 skipped (1850)`; `ids-cases.json` rewritten LF-only with no other change and restored.
- Task 3: the same four compile errors → `promote-check` `695/695`; `session-check` `47/47`; builds 2022 `0`/`3`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` (errors/warnings, `-p:DeployToRevit=false`), no warning in a file MA-3a touches.
- Task 4: `Failed to load url ./review-desk` → `1 failed | 8 passed (9)` → `9 passed (9)`; `vitest run src` `55 passed (55)`, `484 passed (484)`; `tsc` 18 errors before and after, none in `review-desk.ts`.
- Task 5: eight replaces, each once. The full `npx vitest run` `143 passed (143)` files, `2313 passed | 1 skipped (2314)`; all 26 `tools/*-check` pass (`promote-check` `695/695`, the other 25 as on `32605ca`).
- Not run: `0037_probe.sql` (no database here; it needs the founder's "apply" — F7) and the drill.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | Who may review and re-open on the web (Q1). `requireMinRole` lets the machine credential through ("service"), so any `BCF_TOKEN` holder — the MCP agent included — could decline or re-open | **A:** a signed-in person only: the machine credential's post is a 403 `… on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)`; then contributor to decide, lead or owner to re-open (design `:952-953`). **B:** the machine credential passes, as on the other changeset routes | **A** — the precedent is `reviewDecide` (`cde-store.mjs:1398-1401`); the MCP server keeps "no write tool beyond proposing" (§6.8) |
| F2 | A decline that lands after Revit's re-check at Apply (gotcha 2): Revit is placing, and refusing its report would leave elements in the model unreported | **A:** Revit sends the `review_rev` it re-checked. A result applying a ghost declined at or before it is a 409 (the add-in refuses that tick, so a client that did not is refused and said); one declined after it is recorded as `applied_over_late_decline` (on the result, on the `changeset_applied` row, and said in Revit). **B:** always refuse. **C:** a Revit "ticked" lock before Apply | **A.** A result with no `review_rev` (an add-in before MA-3a; a script) is **unchecked** (C2): each decline it applied is recorded as `applied_over_decline_unchecked`, with the words "the reporting client sent no review_rev — the bridge cannot tell whether it saw the decline" — never refused (the elements are already placed) and never called late (that would be a guess). Ghost Builder's own build sends the `review_rev` its filing reply carried (0). C is Next |
| F3 | Where decisions live (Q3; design `:942` says "ledger rows; the views are derived from the ledger") | **A:** on the changeset doc (each ghost's `review`, the doc's `review_rev`) and as `changeset_reviewed` / `changeset_reopened` rows. **B:** ledger rows only, derived per read | **A** (spec amendment S1) — the add-in already reads the doc, and the bridge must judge a result against the decisions in the same swap; a derived view would be a second read and a race. The rows stay the record |
| F4 | Changing a decision (Q5) | **A:** proposed → accepted or declined, accepted → declined: any signed-in contributor; declined → proposed: only a lead's re-open; a repeat (accept an accepted ghost, decline a declined one) is a 409; nothing once the changeset is not proposed. **B:** any step by anyone | **A.** Each post is all or none; each is a ledger row |
| F5 | The Modeling studio (Q12) | **A:** delete `model-panel.ts` and its tab; the desk takes the slot; keep `sentinel-core/ifc-writer.ts` (MA-3d writes the proposal IFC from it). **B:** keep both | **A.** Sketches saved in a browser's local storage (`sentinel:model:<pid>`) are no longer shown; the tab's comment in `main.ts` says so |
| F6 | The drill's web rows (the desk needs the founder's platform sign-in, and port 4000 is held by the founder's `thatopen serve`) | **A:** one founder session: `thatopen serve --port 4002` built against the test bridge on 4101; the founder signs in on the desk. **B:** owed | **A.** Without the founder, D-2 … D-4 are **owed** — and since only a signed-in person can decline (F1), D-3 (the binding in Revit) cannot run either: **the merge waits for that session** |
| F7 | Migration 0037 (C1: the `changeset` store loses its signed-in writer) | **A:** the founder says "apply" before the drill: the controller applies it after the test bridge with service writes is up (the founder's 4100 bridge on master still forwards a signed-in person's changeset writes, which 0037 then refuses — see the Deployment order), and runs `probes/0037_probe.sql`; its result is written into the migration's header. **B:** after the merge, with the deployment | **B** — applying it while the founder's 4100 bridge runs master's store would make a signed-in person's Revit result or withdraw lose its swap on 4100 (0 rows patched, a 409) until the bridge restarts on the merged code; the drill's rows do not need it (the binding is the bridge's and Revit's). The probe is then **owed** at the merge, and the web app's publish waits for the apply (Deployment) |

## Amendments to the spec's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (design `:942`, "review decisions: ledger rows. The views are derived from the ledger").** A web review decision is kept on the changeset doc — each ghost's `review: {state, action, reason, by, role, at, rev}` and the doc's `review_rev` — as `status` is today; the `changeset_reviewed` and `changeset_reopened` rows are the record. Still no new table (F3).
- **S2 (design `:877`, `POST /changesets/:key/:id/reopen {guid, reason}`).** The body is `{proposal_guid, reason}` — the name every changeset route and the decisions use.
- **S3 (design `:876`, `{decisions[]}`; `:830`, "for each ghost").** One post is one changeset, all or none: `{decisions: [{proposal_guid, decision: accept | decline, reason}]}`; ONE `changeset_reviewed` row per post, its `decisions` naming each ghost's step (`from`, `to`, `reason`), with the reviewer and the role. The desk sends one post per changeset of a storey.
- **S4 (§6.6 state 4, "In Revit: ticked, then applied, or reverted").** In MA-3a `ticked` is not stored on the bridge: Revit's window is the tick, `applied` is the result, `reverted` is the `changeset_reverted` rows. A Revit "ticked" lock is Next (F2 C).

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | Every write of a changeset doc is `rewrite`: read, decide, swap on `review_rev` (a service write — C1), three tries, then a **503** `the changeset changed three times while this was being written — nothing was saved; send it again` (C3) | The decision is made again on the doc the swap lost to, so a result is judged against a decline that landed during its write. 503 is not in `Report`'s no-retry list, so Revit offers Retry with its existing duplicate warning |
| E2 | A doc from before MA-3a (no `review_rev`) swaps on the field being absent (`docReplaceIfField`'s `null`), and reads as revision 0 | No migration of stored docs |
| E3 | The desk's posts share one write budget, `changeset reviews`, 60 a minute per person and 300 for all (`takeWriteBudget`, as `changeset reverts`) | Each post is a ledger row |
| E4 | `baseDeps` keeps a `docReplaceIfStatus` that throws | A test whose write is not mocked fails in words, never with a PATCH to the bridge's Supabase |
| E5 | The desk ticks ghosts and posts once per changeset; Re-open is per ghost | One ledger row per decision post; a storey's parts are separate changesets |
| E6 | The window leads a decided row with its review line (`declined on the web by …  ·  retype wall: W 1 …`) and puts it first in the tooltip | The row's text trims with an ellipsis; the decline's reason must never be the part cut off |
| E7 | `Report`'s `reviewRev` is optional; Ghost Builder's applying call sends `cs.ReviewRev`, the revision its filing reply carried (0) — C2; its all-or-nothing rollback call applies nothing and sends none | Ghost Builder files and applies in one flow and shows no web decision: a decline that lands in between is later than revision 0, so it is judged late (true: Ghost Builder never saw it), not unchecked |

## The scout's gotchas, settled (G1–G11)

G1 the lost update: E1. G2 a decline after the re-check: F2 A. G3 the window is a snapshot: Apply's `DeclinedTicked` on the fresh copies (Task 3). G4 Promote opens its review straight after filing: the drill closes the window (D-1). G5 a changeset whose every ghost is declined stays proposed until Revit reports it: said by the window's header and by the desk. G6/G7 ghost sizes and coordinates: MA-3d. G8 the Editor: MA-3d's spike. G9 DirectContext3D: MA-3c. G10 the machine credential: F1 A. G11 AI-2's unreported record: MA-3b.

## Review amendments (BINDING — the plan review of 2026-10-04; the task text below already carries each one)

The review found one critical, five important and two minor points. Each amendment is written into the task text it changes; where the two differ, this section wins.

- **C1 (critical — a contributor could undo a binding decline by writing the changeset doc directly; it overrides the constraint "no migration").** 0033/0034 leave `bridge_docs_floor('changeset') = 'contributor'`, so a signed-in member with the public anon key and their own JWT could PATCH a changeset doc through Supabase — set a declined ghost back to proposed (a re-open by a non-lead, no `changeset_reopened` row), delete a `review`, forge `review.by` — and Revit would obey it. Task 2 adds `WebApp/db/migrations/0037_changeset_bridge_only.sql` (0034's pattern: `bridge_docs_floor` without `'changeset'`; reads unchanged) and `probes/0037_probe.sql` (the floors; a signed-in contributor's direct update of a changeset doc patches 0 rows and a direct insert is refused by row-level security; the control `rfi` update patches 1 row; rolled back). `cde.docReplaceIfField` gains a 7th parameter `{ service = false } = {}` passed to `sb`; `changesets-store`'s writes pass `{ service: true }`, always after its own role check — `proposeChangeset`'s `docInsert` and `rewrite`'s swap. Store tests: `mock.calls[i][6]` / `docInsert`'s `[4]` are `{service: true}` (one new test), and every `.slice(4)` became `.slice(4, 6)`. `migration-0037.test.mjs` scans the SQL, the probe and the store (as `migration-0033.test.mjs` does). Deployment: the bridge with service writes first, then the founder's "apply" of 0037 and its probe (recorded in the migration's header), then the add-in, then the publish (F7). Merge condition: the probe passed live or is named owed.
- **C2 (important — a result without `review_rev` dodged the 409, and "late" was a guess).** `resultConflicts` with `seen == null` puts each applied decline in a new list `unchecked` (never `late`, never `refused`); `reportResult` stores `result.applied_over_decline_unchecked`, and the `changeset_applied` row carries it with `unchecked_why: "the reporting client sent no review_rev — the bridge cannot tell whether it saw the decline"`. `review_rev_seen` is stored as `{value, claimed: true}`. Ghost Builder's applying `Report` sends `cs.ReviewRev`, the revision its filing reply carried (0). `ChangesetTrust.LateDeclines` also says the unchecked list (one new promote-check check). The fixture's `late_reply` carries `review_rev_seen: {value: 2, claimed: true}` and `applied_over_decline_unchecked: []`; the vitest "no review_rev" tests expect `unchecked`.
- **C3 (important — three lost swaps answered 409, so Revit stopped reporting with elements placed).** `rewrite`'s exhaustion is `err(503, …)` with the same words; 503 is not in `Report`'s no-retry list, so Revit offers Retry with its duplicate warning. The store test expects `status: 503`; E1's ceiling sentence and the matching Risks line are deleted.
- **C4 (important — a decline binds its changeset only; a Promote re-run proposes the ghost again, undecided and pre-ticked).** Words now, code in MA-3b: a Risks line; `DeclinedHeader` and the desk's intro line end with "— a new Promote run proposes a declined ghost again, undecided"; Next ▸ MA-3b carries the decline forward by (`target.unique_id`, `op`, `place.TypeName`/`to`).
- **C5 (important — the ledger rows the plan calls the record could be forged through the open audit route).** `RESERVED_ACTIONS` in `cde-store.mjs` gains `"changeset_reviewed", "changeset_reopened"`; `ledger-write.test.mjs` gains two rows (`changeset_reviewed rows are written by Sentinel, not through this route` and the re-open's). The Next item and the Risks line are removed.
- **C6 (minor — one repeat refused a whole changeset).** `review-desk.ts` gains the pure `postsFor(ticked, decision)`: one post per changeset, leaving out a ghost whose `review?.state` is already the decision's target; the status line says `<n> already accepted|declined — not sent`. One test in `review-desk.test.ts`.
- **D1 (important — D-3's late decline had nothing left to decline).** D-3's late decline targets a ghost D-2 did not decline that is ticked in Revit — an attach or a retype (signed out: tick it first); D-1 records the attach guids too.
- **D2 (important — one account made lead contradicted D-2's `(contributor)`).** The founder's account is added as `contributor`; with one account, D-4 starts with `b4101 PATCH cde/ma3a/members/<user_id> '{"role":"lead"}'` (the existing role-change route; the reply recorded). With two accounts the second is added as `lead` at set-up.
- **M2 (minor — Task 4 rides on the founder's session).** No change: Task 4 stays (a decline cannot be made otherwise — the machine credential gets a 403), and D-3 stays a merge blocker. Task 5 Step 2's totals were measured again after C1–C6 (the amended dry run above).

**Rejected, with the reason:** C1's sentence "until 0037 is applied, the desk's header says 'a decline binds in Revit; until migration 0037 a project member can still edit it outside Sentinel'". The desk cannot know whether 0037 is applied (no route reports a migration), so a fixed sentence would stay after the apply and become false — a guess, against the house rule. In its place the deployment orders the web app's publish after the apply (step 4 waits for step 2), so no published desk offers a decline while the hole is open; the Risks line says the hole in words, and the merge message says whether 0037 is applied or owed.

---

## File map

| File | Task | What it holds |
|---|---|---|
| `WebApp/bridge/changesets-logic.mjs` | 1 | `REVIEW_STATES`, `MAX_REVIEW_REASON`, `reviewState`, `reviewRev`, `reviewNext`, `applyDecisions`, `reopenDecline`, `resultConflicts` |
| `WebApp/bridge/fixtures/changeset-ops/ma3a-review.json` (new) | 1 | The shared fixture: `before`, `decisions`, `who`, `after`, `reopen`, `reopened_review`, `late_reply` |
| `WebApp/bridge/changesets-review.test.mjs` (new) | 1 | The review states (17 tests) |
| `WebApp/bridge/changesets-store.mjs` | 2 | `rewrite`, `reviewer`, `ledgerRef`; `review_rev: 0` at filing; `reportResult` (judged, swapped on `review_rev`), `withdrawChangeset` (swapped); `reviewChangeset`, `reopenGhost` |
| `WebApp/bridge/changesets-store.test.mjs` | 2 | `docReplaceIfField` mocks (and the tripwire); 14 new tests |
| `WebApp/bridge/bcf-service.mjs` | 2 | `POST /changesets/:key/:id/review`, `/reopen`; the actor's fallback `web` |
| `WebApp/bridge/cde-store.mjs`, `ledger-write.test.mjs` | 2 | `docReplaceIfField(…, { service })` (C1); `changeset_reviewed`, `changeset_reopened` reserved (C5), 2 tests |
| `WebApp/db/migrations/0037_changeset_bridge_only.sql`, `probes/0037_probe.sql`, `WebApp/bridge/migration-0037.test.mjs` (new) | 2 | The changeset store bridge-only (C1), written, not applied; its probe; 4 tests |
| `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` | 3 | The applying `Report` sends `cs.ReviewRev` (C2) |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 3 | `ReviewDto`, `ChangesetElementDto.Review`, `ChangesetDto.ReviewRev`; `ChangesetTrust` (`PreTick`, `DeclinedOnWeb`, `ReviewLine`, `DeclinedHeader`, `DeclinedTicked`, `LateDeclines`); `ReportResult(…, reviewRev, out reply, out error)` |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | 3 | The declines' header; a declined row disabled; the review line leading each decided row |
| `SentinelAddin/Commands.ReviewChangesets.cs` | 3 | Apply refuses a declined tick on the fresh copies; the result sends `one.ReviewRev`; `Report` says a late decline |
| `tools/promote-check/Ma3aReview.cs` (new), `Check.cs`, `Ma2dWiring.cs` | 3 | Sections 40 (14 checks) and 41 (3 scans); one scan string updated |
| `WebApp/src/setups/review-desk.ts` (new), `review-desk.test.ts` (new) | 4 | The desk; its 9 tests |
| `WebApp/src/main.ts`; `WebApp/src/setups/model-panel.ts` (deleted) | 4 | The Review tab where the Model tab was |
| `docs/strategy/2026-09-30-model-automation-design.md` | 5 | What was built, drill pending |

---

## Tasks (in order: the review states, pure; the store and the routes; Revit obeys; the web desk; the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file. `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once. `In <file>, replace every` is a replace-all (the Edit tool's `replace_all`).

### Task 1 — Bridge, pure: the review states (`changesets-logic.mjs`)

**Files:**
- Create `WebApp/bridge/fixtures/changeset-ops/ma3a-review.json`
- Create `WebApp/bridge/changesets-review.test.mjs`
- Modify `WebApp/bridge/changesets-logic.mjs` (after `deriveResultStatus`, the file's last function)

**Interfaces:**
- Consumes: `err(status, message)`, `CONTROL_CHAR` and `MAX_CHANGESET_ELEMENTS` (200), already in `changesets-logic.mjs`.
- Produces (Task 2 imports them; the fixture is read by Tasks 2, 3 and 4):
  - `REVIEW_STATES = ["proposed", "accepted", "declined"]`, `MAX_REVIEW_REASON = 500`.
  - `reviewState(el) → "proposed" | "accepted" | "declined"` (`el.review?.state ?? "proposed"`); `reviewRev(cs) → number` (`cs.review_rev` when an integer, else 0).
  - `reviewNext(state, action: "accept" | "decline" | "reopen") → state`, else throws 409 in words.
  - `applyDecisions(cs, decisions: [{proposal_guid, decision, reason?}], who: {by, role, at}) → {updated, rows: [{proposal_guid, name, from, to, reason}]}` — throws 400 (shape, reason) / 409 (status, step).
  - `reopenDecline(cs, guid, reason, who) → {updated, row: {proposal_guid, name, declined_by, declined_reason, reason}}`.
  - `resultConflicts(cs, appliedGuids, rejectedGuids, seen) → {refused, late, unchecked, declined_on_web}`, each entry `{proposal_guid, name, by, role, reason, rev}` — throws 400 when `seen` is given and is not an integer 0…`reviewRev(cs)`; `seen` null/undefined puts every applied decline in `unchecked`, never `refused` or `late` (C2).
  - A ghost's name, everywhere it is said: `` `${op ?? "create"} ${kind} "${validate.identity.Name ?? proposal_guid}"` `` — e.g. `retype wall "W 1"`.

- [ ] **Step 1: The fixture and the failing tests.**

Create `WebApp/bridge/fixtures/changeset-ops/ma3a-review.json`:

```json
{
  "_": "MA-3a: one Promote changeset before and after the web desk's decisions (changesets-logic applyDecisions; vitest proves `after` from `before`, `decisions` and `who`), then a lead's re-open of the first decline (`reopened`, from reopenDecline), and a result reply that applied a ghost over a decline Revit could not see (`late_reply`). tools/promote-check reads `after`, `reopened` and `late_reply` as the add-in does.",
  "before": {
    "id": "cs-ma3a", "name": "Promote (DD) · GR-FFL", "source": "promote", "claimed": true, "status": "proposed",
    "created_at": "2026-10-04T08:00:00.000Z", "updated_at": "2026-10-04T08:00:00.000Z", "review_rev": 0,
    "elements": [
      { "proposal_guid": "g-1", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } } },
      { "proposal_guid": "g-2", "kind": "wall", "op": "attach", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" },
        "place": { "BaseLevel": "GR-FFL", "TopLevel": "01-FFL" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } } },
      { "proposal_guid": "g-3", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c401", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 2" } } },
      { "proposal_guid": "g-4", "kind": "wall", "op": "set_parameter", "pretick": false,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c500" },
        "place": { "FamilyName": "Basic Wall", "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "parameter": "FireRating", "revit_parameter": "Fire Rating", "from": "", "to": "60 min",
        "validate": { "identity": { "Class": "IfcWallType", "Name": "BDS_EXT_ARC_CMU_200 mm" } } }
    ],
    "exceptions": [], "result": null
  },
  "decisions": [
    { "proposal_guid": "g-1", "decision": "decline", "reason": "wrong type: W 1 is a party wall" },
    { "proposal_guid": "g-2", "decision": "accept" },
    { "proposal_guid": "g-4", "decision": "decline", "reason": "no fire strategy issued yet" }
  ],
  "who": { "by": "reviewer@example.com", "role": "contributor", "at": "2026-10-04T09:00:00.000Z" },
  "after": {
    "id": "cs-ma3a", "name": "Promote (DD) · GR-FFL", "source": "promote", "claimed": true, "status": "proposed",
    "created_at": "2026-10-04T08:00:00.000Z", "updated_at": "2026-10-04T09:00:00.000Z", "review_rev": 1,
    "elements": [
      { "proposal_guid": "g-1", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } },
        "review": { "state": "declined", "action": "decline", "reason": "wrong type: W 1 is a party wall", "by": "reviewer@example.com", "role": "contributor", "at": "2026-10-04T09:00:00.000Z", "rev": 1 } },
      { "proposal_guid": "g-2", "kind": "wall", "op": "attach", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" },
        "place": { "BaseLevel": "GR-FFL", "TopLevel": "01-FFL" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } },
        "review": { "state": "accepted", "action": "accept", "reason": null, "by": "reviewer@example.com", "role": "contributor", "at": "2026-10-04T09:00:00.000Z", "rev": 1 } },
      { "proposal_guid": "g-3", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c401", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 2" } } },
      { "proposal_guid": "g-4", "kind": "wall", "op": "set_parameter", "pretick": false,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c500" },
        "place": { "FamilyName": "Basic Wall", "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "parameter": "FireRating", "revit_parameter": "Fire Rating", "from": "", "to": "60 min",
        "validate": { "identity": { "Class": "IfcWallType", "Name": "BDS_EXT_ARC_CMU_200 mm" } },
        "review": { "state": "declined", "action": "decline", "reason": "no fire strategy issued yet", "by": "reviewer@example.com", "role": "contributor", "at": "2026-10-04T09:00:00.000Z", "rev": 1 } }
    ],
    "exceptions": [], "result": null
  },
  "reopen": { "proposal_guid": "g-1", "reason": "party wall confirmed external by the client", "who": { "by": "lead@example.com", "role": "lead", "at": "2026-10-04T10:00:00.000Z" } },
  "reopened_review": { "state": "proposed", "action": "reopen", "reason": "party wall confirmed external by the client", "by": "lead@example.com", "role": "lead", "at": "2026-10-04T10:00:00.000Z", "rev": 2 },
  "late_reply": {
    "id": "cs-ma3a", "status": "partially_applied", "review_rev": 4,
    "result": {
      "applied": [{ "proposal_guid": "g-3", "revit_element_id": 2051449, "revit_unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c401" }],
      "rejected": ["g-1", "g-2", "g-4"], "note": null, "review_rev_seen": { "value": 2, "claimed": true },
      "declined_on_web": [{ "proposal_guid": "g-4", "name": "set_parameter wall \"BDS_EXT_ARC_CMU_200 mm\"", "by": "reviewer@example.com", "role": "contributor", "reason": "no fire strategy issued yet", "rev": 1 }],
      "applied_over_late_decline": [{ "proposal_guid": "g-3", "name": "retype wall \"W 2\"", "by": "reviewer@example.com", "role": "contributor", "reason": "W 2 is demolished", "rev": 3 }],
      "applied_over_decline_unchecked": []
    }
  }
}
```

Create `WebApp/bridge/changesets-review.test.mjs`:

```js
// MA-3a (design §6.6, founder decision D17): the review states, one per ghost. A web decline binds (Revit shows it unticked with
// the reason and refuses the tick), a web accept is advice, only a lead re-opens a decline, and nothing is decided once Revit
// reported. Pure: changesets-logic.mjs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REVIEW_STATES, reviewState, reviewRev, reviewNext, applyDecisions, reopenDecline, resultConflicts } from "./changesets-logic.mjs";

const fx = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/ma3a-review.json", import.meta.url), "utf8"));
const WHO = fx.who;
const LEAD = fx.reopen.who;
const decline = (proposal_guid, reason = "not this one") => ({ proposal_guid, decision: "decline", reason });
const accept = (proposal_guid) => ({ proposal_guid, decision: "accept" });

describe("review states (design §6.6)", () => {
  it("are proposed, accepted and declined; a ghost nobody decided is proposed; a doc from before MA-3a is at revision 0", () => {
    expect(REVIEW_STATES).toEqual(["proposed", "accepted", "declined"]);
    expect(reviewState(fx.before.elements[0])).toBe("proposed");
    expect(reviewRev({})).toBe(0);
    expect(reviewRev(fx.after)).toBe(1);
  });

  it("proposed → accepted or declined; accepted → declined; declined → proposed only by a re-open", () => {
    expect(reviewNext("proposed", "accept")).toBe("accepted");
    expect(reviewNext("proposed", "decline")).toBe("declined");
    expect(reviewNext("accepted", "decline")).toBe("declined");
    expect(reviewNext("declined", "reopen")).toBe("proposed");
  });

  it("every other step is a 409 in words", () => {
    expect(() => reviewNext("declined", "accept")).toThrow(/this ghost is declined — only a lead may re-open it, then it can be accepted/);
    expect(() => reviewNext("declined", "decline")).toThrow(/this ghost is already declined/);
    expect(() => reviewNext("accepted", "accept")).toThrow(/this ghost is already accepted/);
    expect(() => reviewNext("proposed", "reopen")).toThrow(/only a declined ghost can be re-opened \(this one is proposed\)/);
    expect(() => reviewNext("accepted", "reopen")).toThrow(/only a declined ghost can be re-opened \(this one is accepted\)/);
    try { reviewNext("accepted", "accept"); } catch (e) { expect(e.status).toBe(409); }
  });
});

describe("applyDecisions — the web desk's decisions on one changeset, all or none", () => {
  it("the shared fixture: `after` is what the bridge stores from `before`, `decisions` and `who` (tools/promote-check reads it)", () => {
    const { updated, rows } = applyDecisions(fx.before, fx.decisions, WHO);
    expect(updated).toEqual(fx.after);
    expect(rows).toEqual([
      { proposal_guid: "g-1", name: 'retype wall "W 1"', from: "proposed", to: "declined", reason: "wrong type: W 1 is a party wall" },
      { proposal_guid: "g-2", name: 'attach wall "W 1"', from: "proposed", to: "accepted", reason: null },
      { proposal_guid: "g-4", name: 'set_parameter wall "BDS_EXT_ARC_CMU_200 mm"', from: "proposed", to: "declined", reason: "no fire strategy issued yet" },
    ]);
  });

  it("does not change its input", () => {
    const before = JSON.parse(JSON.stringify(fx.before));
    applyDecisions(before, fx.decisions, WHO);
    expect(before).toEqual(fx.before);
  });

  it("a decline needs a reason; a reason is one line of at most 500 characters", () => {
    expect(() => applyDecisions(fx.before, [decline("g-1", "  ")], WHO)).toThrow(/a decline needs a reason — the ledger records it and Revit shows it/);
    expect(() => applyDecisions(fx.before, [{ proposal_guid: "g-1", decision: "decline" }], WHO)).toThrow(/a decline needs a reason/);
    expect(() => applyDecisions(fx.before, [decline("g-1", "x".repeat(501))], WHO)).toThrow(/a reason is one line of at most 500 characters/);
    expect(() => applyDecisions(fx.before, [decline("g-1", "two\nlines")], WHO)).toThrow(/one line/);
    try { applyDecisions(fx.before, [decline("g-1", "")], WHO); } catch (e) { expect(e.status).toBe(400); }
  });

  it("an unknown or repeated guid, a decision that is not accept or decline, and an empty or oversized list are 400s", () => {
    expect(() => applyDecisions(fx.before, [accept("nope")], WHO)).toThrow(/decisions\[0\]: unknown proposal_guid "nope"/);
    expect(() => applyDecisions(fx.before, [accept("g-1"), decline("g-1")], WHO)).toThrow(/proposal_guid "g-1" appears twice in the decisions/);
    expect(() => applyDecisions(fx.before, [{ proposal_guid: "g-1", decision: "reopen" }], WHO)).toThrow(/decisions\[0\]\.decision must be accept or decline/);
    expect(() => applyDecisions(fx.before, [], WHO)).toThrow(/decisions must be 1–200 entries/);
    expect(() => applyDecisions(fx.before, "g-1", WHO)).toThrow(/decisions must be 1–200 entries/);
  });

  it("one refused step refuses the whole post, naming the ghost (all or none)", () => {
    let e;
    try { applyDecisions(fx.after, [accept("g-3"), accept("g-1")], WHO); } catch (x) { e = x; }
    expect(e.status).toBe(409);
    expect(e.message).toBe('retype wall "W 1": this ghost is declined — only a lead may re-open it, then it can be accepted');
  });

  it("an accepted ghost may still be declined; the revision goes up by one per post", () => {
    const { updated } = applyDecisions(fx.after, [decline("g-2", "attach to the roof instead")], { ...WHO, at: "2026-10-04T09:30:00.000Z" });
    expect(updated.review_rev).toBe(2);
    expect(updated.elements[1].review).toEqual({ state: "declined", action: "decline", reason: "attach to the roof instead", by: WHO.by, role: "contributor", at: "2026-10-04T09:30:00.000Z", rev: 2 });
  });

  it("nothing is decided once the changeset is not proposed (Revit reported, or it was withdrawn)", () => {
    for (const status of ["applied", "partially_applied", "declined", "withdrawn"])
      expect(() => applyDecisions({ ...fx.before, status }, [accept("g-1")], WHO)).toThrow(new RegExp(`changeset is ${status} — the web desk decides only while it is proposed`));
  });
});

describe("reopenDecline — a lead re-opens one decline", () => {
  it("the declined ghost is proposed again, with the lead's reason and what it re-opened", () => {
    const { updated, row } = reopenDecline(fx.after, fx.reopen.proposal_guid, fx.reopen.reason, LEAD);
    expect(updated.review_rev).toBe(2);
    expect(updated.updated_at).toBe(LEAD.at);
    expect(updated.elements[0].review).toEqual(fx.reopened_review);
    expect(updated.elements.slice(1)).toEqual(fx.after.elements.slice(1));
    expect(row).toEqual({ proposal_guid: "g-1", name: 'retype wall "W 1"', declined_by: WHO.by, declined_reason: "wrong type: W 1 is a party wall", reason: fx.reopen.reason });
  });

  it("needs a reason, a known guid, a declined ghost and a proposed changeset", () => {
    expect(() => reopenDecline(fx.after, "g-1", " ", LEAD)).toThrow(/a re-open needs a reason/);
    expect(() => reopenDecline(fx.after, "nope", "why", LEAD)).toThrow(/unknown proposal_guid "nope"/);
    expect(() => reopenDecline(fx.after, "g-2", "why", LEAD)).toThrow(/attach wall "W 1": only a declined ghost can be re-opened \(this one is accepted\)/);
    expect(() => reopenDecline({ ...fx.after, status: "applied" }, "g-1", "why", LEAD)).toThrow(/changeset is applied — the web desk decides only while it is proposed/);
  });
});

describe("resultConflicts — Revit's result against the web's declines (Q2)", () => {
  // fx.after: g-1 and g-4 declined at revision 1.
  it("applying a ghost declined at or before the revision Revit re-checked is refused (Revit showed it declined)", () => {
    const c = resultConflicts(fx.after, ["g-1", "g-3"], ["g-2", "g-4"], 1);
    expect(c.refused).toEqual([{ proposal_guid: "g-1", name: 'retype wall "W 1"', by: WHO.by, role: "contributor", reason: "wrong type: W 1 is a party wall", rev: 1 }]);
    expect(c.late).toEqual([]);
  });

  it("a ghost declined after that revision was applied over a decline Revit could not see: recorded, not refused", () => {
    const c = resultConflicts(fx.after, ["g-1"], ["g-2", "g-3", "g-4"], 0);
    expect(c.refused).toEqual([]);
    expect(c.late.map((x) => x.proposal_guid)).toEqual(["g-1"]);
  });

  it("no review_rev (an add-in before MA-3a, a script) is unchecked: never refused, never called late (C2)", () => {
    const c = resultConflicts(fx.after, ["g-1", "g-4"], ["g-2", "g-3"], undefined);
    expect(c.unchecked.map((x) => x.proposal_guid)).toEqual(["g-1", "g-4"]);
    expect([c.refused, c.late]).toEqual([[], []]);
    expect(resultConflicts(fx.after, ["g-1", "g-4"], ["g-2", "g-3"], null).unchecked.length).toBe(2);
    expect(resultConflicts(fx.after, ["g-1"], ["g-2", "g-3", "g-4"], 0).unchecked).toEqual([]); // a revision sent is judged
  });

  it("declined ghosts the result rejects are listed with the web's reason", () => {
    const c = resultConflicts(fx.after, ["g-3"], ["g-1", "g-2", "g-4"], 1);
    expect(c.declined_on_web.map((x) => [x.proposal_guid, x.reason])).toEqual([["g-1", "wrong type: W 1 is a party wall"], ["g-4", "no fire strategy issued yet"]]);
    expect(c.refused).toEqual([]);
  });

  it("a review_rev that is not 0 to the changeset's revision is a 400", () => {
    expect(() => resultConflicts(fx.after, [], ["g-1", "g-2", "g-3", "g-4"], 2)).toThrow(/review_rev must be the review revision Revit re-checked \(0–1\)/);
    expect(() => resultConflicts(fx.after, [], ["g-1"], -1)).toThrow(/review_rev/);
    expect(() => resultConflicts(fx.after, [], ["g-1"], "1")).toThrow(/review_rev/);
  });
});
```

- [ ] **Step 2: See it fail.** From `WebApp`: `npx vitest run bridge/changesets-review.test.mjs` → `Tests  17 failed (17)` (`REVIEW_STATES` undefined, `reviewNext is not a function`, …).

- [ ] **Step 3: The review states.**

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
  if (appliedCount === 0) return "declined";
  return "partially_applied";
}
```

with

```js
  if (appliedCount === 0) return "declined";
  return "partially_applied";
}

// ── MA-3a: the review states of design §6.6, one per ghost — the web desk's half (Revit's tick, apply and revert are its result and
//    its changeset_reverted rows). A ghost's `review` is absent while nobody decided: proposed. A web decline BINDS: Revit shows the
//    ghost unticked with the reason and refuses the tick, and the bridge refuses a result that applies a decline Revit had seen. A web
//    accept is advice. Only a lead re-opens a decline (founder decision D17). Nothing is decided once the changeset is not proposed.
//    `review_rev` counts the doc's writes: every write bumps it and swaps on it (changesets-store), and Revit sends the one it re-checked.
export const REVIEW_STATES = ["proposed", "accepted", "declined"];
export const MAX_REVIEW_REASON = 500;

/** A ghost's review state: its review's, else proposed. */
export const reviewState = (el) => el?.review?.state ?? "proposed";
/** The changeset's review revision; 0 on a doc from before MA-3a. */
export const reviewRev = (cs) => (Number.isInteger(cs?.review_rev) ? cs.review_rev : 0);
/** A ghost as the desk, the ledger and Revit's refusals name it: `retype wall "W 1"`. */
const ghostName = (el) => `${el.op ?? "create"} ${el.kind} "${el.validate?.identity?.Name ?? el.proposal_guid}"`;

/** The state `action` (accept | decline | reopen) takes a ghost in `state` to, or a 409 in words. */
export function reviewNext(state, action) {
  if (action === "reopen") {
    if (state === "declined") return "proposed";
    throw err(409, `only a declined ghost can be re-opened (this one is ${state})`);
  }
  const to = action === "accept" ? "accepted" : "declined";
  if (state === to) throw err(409, `this ghost is already ${state}`);
  if (state === "declined") throw err(409, "this ghost is declined — only a lead may re-open it, then it can be accepted");
  return to;
}

/** A reason as the ledger keeps it: trimmed, one line, at most MAX_REVIEW_REASON characters; null when blank and not needed. */
function reasonOf(r, need, what) {
  if (r == null || (typeof r === "string" && r.trim() === "")) {
    if (need) throw err(400, `${what} needs a reason — the ledger records it and Revit shows it`);
    return null;
  }
  if (typeof r !== "string" || r.length > MAX_REVIEW_REASON || CONTROL_CHAR.test(r)) throw err(400, `a reason is one line of at most ${MAX_REVIEW_REASON} characters`);
  return r.trim();
}

const proposedOnly = (cs) => {
  if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status} — the web desk decides only while it is proposed`);
};

/** The web desk's decisions on one changeset — [{proposal_guid, decision: accept | decline, reason}] — all or none. `who` is {by, role,
 *  at}. Answers the changeset as it is to be stored (each decided ghost's review, the revision bumped) and one ledger entry per ghost. */
export function applyDecisions(cs, decisions, who) {
  proposedOnly(cs);
  if (!Array.isArray(decisions) || !decisions.length || decisions.length > MAX_CHANGESET_ELEMENTS)
    throw err(400, `decisions must be 1–${MAX_CHANGESET_ELEMENTS} entries`);
  const byGuid = new Map(cs.elements.map((e) => [e.proposal_guid, e]));
  const rev = reviewRev(cs) + 1;
  const next = new Map();
  const rows = [];
  for (const [i, x] of decisions.entries()) {
    const g = x?.proposal_guid;
    if (typeof g !== "string" || !byGuid.has(g)) throw err(400, `decisions[${i}]: unknown proposal_guid "${g}"`);
    if (next.has(g)) throw err(400, `proposal_guid "${g}" appears twice in the decisions`);
    if (x.decision !== "accept" && x.decision !== "decline") throw err(400, `decisions[${i}].decision must be accept or decline`);
    const el = byGuid.get(g);
    const from = reviewState(el);
    let to;
    try { to = reviewNext(from, x.decision); } catch (e) { throw err(e.status, `${ghostName(el)}: ${e.message}`); }
    const reason = reasonOf(x.reason, x.decision === "decline", "a decline");
    next.set(g, { state: to, action: x.decision, reason, by: who.by, role: who.role, at: who.at, rev });
    rows.push({ proposal_guid: g, name: ghostName(el), from, to, reason });
  }
  const elements = cs.elements.map((e) => (next.has(e.proposal_guid) ? { ...e, review: next.get(e.proposal_guid) } : e));
  return { updated: { ...cs, updated_at: who.at, review_rev: rev, elements }, rows };
}

/** A lead re-opens one declined ghost: proposed again, with the lead's reason. Answers the changeset to store and the ledger entry
 *  (what it re-opened: who declined it and why). The role is the store's check. */
export function reopenDecline(cs, guid, reason, who) {
  proposedOnly(cs);
  const el = cs.elements.find((e) => e.proposal_guid === guid);
  if (!el) throw err(400, `unknown proposal_guid "${guid}"`);
  try { reviewNext(reviewState(el), "reopen"); } catch (e) { throw err(e.status, `${ghostName(el)}: ${e.message}`); }
  const why = reasonOf(reason, true, "a re-open");
  const rev = reviewRev(cs) + 1;
  const review = { state: "proposed", action: "reopen", reason: why, by: who.by, role: who.role, at: who.at, rev };
  const elements = cs.elements.map((e) => (e === el ? { ...e, review } : e));
  return {
    updated: { ...cs, updated_at: who.at, review_rev: rev, elements },
    row: { proposal_guid: guid, name: ghostName(el), declined_by: el.review.by, declined_reason: el.review.reason, reason: why },
  };
}

/** Revit's result against the web's declines (Q2). `seen` is the review_rev Revit re-checked before Apply (a claim the bridge cannot
 *  verify). Applying a ghost declined at or before `seen` is refused — Revit showed it declined and refuses that tick, so a client
 *  that did not is refused and said. One declined after `seen` was applied over a decline Revit could not see: recorded (late) and
 *  said. No `seen` at all (an add-in before MA-3a, a script — review amendment C2): the bridge cannot tell whether the decline was
 *  seen, so each applied decline is `unchecked` — recorded, never refused, never called late. Declined ghosts the result rejects are
 *  listed with the web's reason. */
export function resultConflicts(cs, appliedGuids, rejectedGuids, seen) {
  const none = seen == null;
  if (!none && (!Number.isInteger(seen) || seen < 0 || seen > reviewRev(cs)))
    throw err(400, `review_rev must be the review revision Revit re-checked (0–${reviewRev(cs)})`);
  const byGuid = new Map(cs.elements.map((e) => [e.proposal_guid, e]));
  const entry = (g) => {
    const e = byGuid.get(g);
    if (reviewState(e) !== "declined") return null;
    return { proposal_guid: g, name: ghostName(e), by: e.review.by, role: e.review.role, reason: e.review.reason, rev: e.review.rev };
  };
  const refused = [], late = [], unchecked = [], declinedOnWeb = [];
  for (const g of appliedGuids) { const x = entry(g); if (x) (none ? unchecked : x.rev <= seen ? refused : late).push(x); }
  for (const g of rejectedGuids) { const x = entry(g); if (x) declinedOnWeb.push(x); }
  return { refused, late, unchecked, declined_on_web: declinedOnWeb };
}
```

- [ ] **Step 4: See it pass.** From `WebApp`: `npx vitest run bridge/changesets-review.test.mjs bridge/changesets-logic.test.mjs` → `Test Files  2 passed (2)`, `Tests  111 passed (111)` (17 new, the logic file's 94 unchanged).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-review.test.mjs WebApp/bridge/fixtures/changeset-ops/ma3a-review.json
git commit -F - <<'EOF'
feat(bridge): MA-3a - the review states of design 6.6, pure: proposed, accepted, declined per ghost; a decline needs a reason, only a re-open takes a decline back, a repeat is a 409, nothing once the changeset is not proposed; the desk's decisions all or none; a result judged against the web's declines (refused when Revit had seen one, late when it could not, unchecked when the result names no revision); a shared fixture the add-in reads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 2 — Bridge, store and routes: every write swaps on `review_rev`; the review and re-open routes; the result judged

**Files:**
- Modify `WebApp/bridge/changesets-store.mjs`
- Modify `WebApp/bridge/changesets-store.test.mjs`
- Modify `WebApp/bridge/bcf-service.mjs` (the `changesets` block, `:1608-1635`)
- Modify `WebApp/bridge/cde-store.mjs` (`docReplaceIfField` takes `{ service }` — C1; `RESERVED_ACTIONS` — C5), `WebApp/bridge/ledger-write.test.mjs` (C5)
- Create `WebApp/db/migrations/0037_changeset_bridge_only.sql`, `WebApp/db/migrations/probes/0037_probe.sql`, `WebApp/bridge/migration-0037.test.mjs` (C1)

**Interfaces:**
- Consumes (Task 1): `reviewRev`, `applyDecisions`, `reopenDecline`, `resultConflicts`; the fixture. From the codebase: `cde.docReplaceIfField(store, pid, docId, data, field, expected, { service } = {})` (`cde-store.mjs:1962`; `expected` null = the key absent; answers the data, or null when the swap lost; the 7th parameter is this task's, C1), `cde.docInsert(store, pid, docId, data, { service })`, `members.ROLE_RANK`, `myRole(key)` (`"service"` for the machine credential, a role, or null), `resolveActor(claimed, fallback)`, `takeWriteBudget(what, {perUser, all})`, `audit(...)` → the stored row `{id, hash, …}` or null.
- Produces:
  - `reviewChangeset(key, id, {decisions}, actor, deps) → {changeset, ledger: {id, hash} | null}` — 403 (machine credential, below contributor), 400/409 from `applyDecisions`, 404.
  - `reopenGhost(key, id, {proposal_guid, reason}, actor, deps) → {changeset, ledger}` — 403 below lead.
  - `reportResult(key, id, {applied, rejected, note, review_rev}, actor, deps)` → the stored changeset; its `result` gains `review_rev_seen` (`{value, claimed: true}` — the number sent, a claim — or null), `declined_on_web`, `applied_over_late_decline` and `applied_over_decline_unchecked` (arrays of Task 1's entries; C2); a 409 when an applied ghost was declined at or before `review_rev`.
  - Every stored changeset has `review_rev` (0 at filing; +1 per write). Every changeset doc write — the filing's `docInsert` and `rewrite`'s swap — passes `{ service: true }`, always after the store's own role check (C1).
  - Three lost swaps in a row: a 503 (C3).
  - `recordAudit` refuses `changeset_reviewed` and `changeset_reopened` (400, `<action> rows are written by Sentinel, not through this route`) — C5.
  - Migration 0037: `bridge_docs_floor` without `'changeset'` (no signed-in writer; reads unchanged) — C1; written, never applied by a task.
  - Routes: `POST /changesets/:key/:id/review` → 200 `{changeset, ledger}`; `POST /changesets/:key/:id/reopen` → 200 `{changeset, ledger}`.
  - Ledger rows: `changeset_reviewed` — old `{review_rev}`, new `{review_rev, reviewer, role, decisions: [{proposal_guid, name, from, to, reason}]}`; `changeset_reopened` — old `{review_rev, state: "declined"}`, new `{review_rev, lead, role, proposal_guid, name, declined_by, declined_reason, reason}`; `changeset_applied` gains `declined_on_web` (a count) and, when any, `applied_over_late_decline`, and `applied_over_decline_unchecked` with `unchecked_why` (C2).

- [ ] **Step 1: The failing tests.**

In `WebApp/bridge/changesets-store.test.mjs`, replace every `docReplaceIfStatus` with `docReplaceIfField` (13 occurrences; the Edit tool's `replace_all`).

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
    docReplaceIfField: vi.fn(async (store, pid, id, data) => { saved.set(id, data); return data; }),
```

with

```js
    docReplaceIfField: vi.fn(async (store, pid, id, data) => { saved.set(id, data); return data; }),
    // MA-3a: every write swaps on review_rev (docReplaceIfField); a call of the status-only swap is a test failure, never a network call.
    docReplaceIfStatus: vi.fn(async () => { throw new Error("MA-3a: a changeset write swaps on review_rev — docReplaceIfStatus is not called"); }),
```

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
    expect(deps.docReplaceIfField.mock.calls[0][4]).toBe("proposed"); // expectedStatus threaded
```

with

```js
    expect(deps.docReplaceIfField.mock.calls[0].slice(4, 6)).toEqual(["review_rev", 0]); // MA-3a: the swap is on review_rev (it was on status)
```

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted, needsTyping, needsCiting } from "./changesets-store.mjs";
```

with

```js
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted, needsTyping, needsCiting,
  reviewChangeset, reopenGhost } from "./changesets-store.mjs";
```

At the end of `WebApp/bridge/changesets-store.test.mjs`, after its last line (`});`, closing the `needsCiting` describe), add:

```js

// MA-3a: the web desk's review loop. Every write of a changeset doc swaps on review_rev (gotcha 1: a status-only swap lost a web
// decision written between a read and a write); a review or re-open is a signed-in person's (Q1); Revit's result is judged against
// the web's declines (Q2).
describe("MA-3a — every write swaps on review_rev", () => {
  const twoWalls = async (deps) => proposeChangeset("demo", BODY, "agent", deps);

  it("a changeset is filed at revision 0; a result and a withdraw each swap on the revision they read and bump it", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    expect(deps.saved.get(cs.id).review_rev).toBe(0);
    const out = await reportResult("demo", cs.id, { applied: [], rejected: cs.elements.map((e) => e.proposal_guid) }, "r", deps);
    expect(deps.docReplaceIfField.mock.calls[0].slice(0, 3)).toEqual(["changeset", "p1", cs.id]);
    expect(deps.docReplaceIfField.mock.calls[0].slice(4, 6)).toEqual(["review_rev", 0]);
    expect(out.review_rev).toBe(1);
    const cs2 = await twoWalls(deps);
    expect((await withdrawChangeset("demo", cs2.id, "agent", deps)).review_rev).toBe(1);
    expect(deps.docReplaceIfField.mock.calls[1].slice(4, 6)).toEqual(["review_rev", 0]);
  });

  it("every changeset doc write is the bridge's, with the service key, after its own role check (C1, migration 0037)", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    expect(deps.docInsert.mock.calls[0][4]).toEqual({ service: true });
    await withdrawChangeset("demo", cs.id, "agent", deps);
    expect(deps.docReplaceIfField.mock.calls[0][6]).toEqual({ service: true });
  });

  it("a doc from before MA-3a (no review_rev) swaps on the field being absent", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    const { review_rev, ...legacy } = deps.saved.get(cs.id);
    deps.saved.set(cs.id, legacy);
    await withdrawChangeset("demo", cs.id, "agent", deps);
    expect(deps.docReplaceIfField.mock.calls[0].slice(4, 6)).toEqual(["review_rev", null]);
    expect(deps.saved.get(cs.id).review_rev).toBe(1);
  });

  it("a web decline written between the result's read and its write is kept: the swap loses, the result is decided again on the new doc", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    const [a, b] = cs.elements.map((e) => e.proposal_guid);
    const declined = { ...cs, review_rev: 1, elements: cs.elements.map((e) => e.proposal_guid === b
      ? { ...e, review: { state: "declined", action: "decline", reason: "not here", by: "web@example.com", role: "contributor", at: "t", rev: 1 } } : e) };
    const real = deps.docReplaceIfField;
    deps.docReplaceIfField = vi.fn()
      .mockImplementationOnce(async () => { deps.saved.set(cs.id, declined); return null; }) // the web's write lands first
      .mockImplementation(real);
    const out = await reportResult("demo", cs.id, { applied: [{ proposal_guid: a, revit_element_id: 5 }], rejected: [b], review_rev: 0 }, "revit", deps);
    expect(deps.docReplaceIfField.mock.calls.map((c) => c[5])).toEqual([0, 1]);
    expect(out.review_rev).toBe(2);
    expect(out.elements[1].review.state).toBe("declined"); // not overwritten
    expect(out.result.declined_on_web).toEqual([{ proposal_guid: b, name: 'create wall "W1"', by: "web@example.com", role: "contributor", reason: "not here", rev: 1 }]);
  });

  it("three lost swaps in a row are a 503 in words — Revit's Report offers Retry (C3) — and nothing is recorded", async () => {
    const deps = baseDeps();
    const cs = await twoWalls(deps);
    deps.docReplaceIfField = vi.fn(async () => null);
    deps.audit.mockClear();
    await expect(withdrawChangeset("demo", cs.id, "agent", deps))
      .rejects.toMatchObject({ status: 503, message: "the changeset changed three times while this was being written — nothing was saved; send it again" });
    expect(deps.docReplaceIfField).toHaveBeenCalledTimes(3);
    expect(deps.audit).not.toHaveBeenCalled();
  });
});

const ma3a = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/ma3a-review.json", import.meta.url), "utf8"));
/** A changeset doc already stored (a copy), and the deps that read it. */
const seededWith = (doc, over = {}) => { const deps = baseDeps(over); deps.saved.set(doc.id, JSON.parse(JSON.stringify(doc))); return deps; };
/** myRole answering these roles, one per call. */
const as = (...roles) => { const f = vi.fn(); for (const r of roles) f.mockResolvedValueOnce(r); return f; };

describe("MA-3a — reviewChangeset and reopenGhost: a signed-in person, contributor to decide, lead to re-open", () => {
  const fx = ma3a;
  const seeded = (doc = fx.before, over = {}) => seededWith(doc, over);

  it("the machine credential never reviews or re-opens: a 403 that says sign in, before anything is read", async () => {
    const deps = seeded(); // no myRole mock: the real check, no signed-in user → service
    deps.docGet.mockClear();
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, "agent", deps))
      .rejects.toMatchObject({ status: 403, message: "accepting or declining a ghost on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)" });
    await expect(reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: "why" }, "agent", deps))
      .rejects.toMatchObject({ status: 403, message: "re-opening a declined ghost on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)" });
    expect(deps.docGet).not.toHaveBeenCalled();
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
  });

  it("a viewer or a non-member decides nothing; a contributor re-opens nothing", async () => {
    const deps = seeded(fx.after, { myRole: as("viewer", null, "contributor") });
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, "v", deps))
      .rejects.toMatchObject({ status: 403, message: "accepting or declining a ghost requires the contributor role (you are viewer)" });
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, "n", deps))
      .rejects.toMatchObject({ status: 403, message: "accepting or declining a ghost requires the contributor role (you are not a member)" });
    await expect(reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: "why" }, "c", deps))
      .rejects.toMatchObject({ status: 403, message: "re-opening a declined ghost requires the lead role (you are contributor)" });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
  });

  it("a contributor's decisions are stored on the doc (the fixture's `after`) and written as ONE changeset_reviewed row", async () => {
    const deps = seeded(fx.before, { myRole: as("contributor"), audit: vi.fn(async () => ({ id: 1201, hash: "ab".repeat(32) })) });
    const out = await reviewChangeset("demo", "cs-ma3a", { decisions: fx.decisions }, fx.who.by, deps);
    const stored = deps.saved.get("cs-ma3a");
    expect({ ...stored, updated_at: fx.after.updated_at, elements: stored.elements.map((e) => e.review ? { ...e, review: { ...e.review, at: fx.who.at } } : e) }).toEqual(fx.after);
    expect(out.changeset).toEqual(stored);
    expect(out.ledger).toEqual({ id: 1201, hash: "ab".repeat(32) });
    expect(deps.audit).toHaveBeenCalledOnce();
    const [pid, type, id, action, actor, before, after] = deps.audit.mock.calls[0];
    expect([pid, type, id, action, actor, before]).toEqual(["p1", "changeset", "cs-ma3a", "changeset_reviewed", fx.who.by, { review_rev: 0 }]);
    expect(after).toMatchObject({ review_rev: 1, reviewer: fx.who.by, role: "contributor" });
    expect(after.decisions.map((d) => [d.proposal_guid, d.to, d.reason])).toEqual([["g-1", "declined", "wrong type: W 1 is a party wall"], ["g-2", "accepted", null], ["g-4", "declined", "no fire strategy issued yet"]]);
  });

  it("a refused step writes nothing and no row (all or none)", async () => {
    const deps = seeded(fx.after, { myRole: as("lead") });
    await expect(reviewChangeset("demo", "cs-ma3a", { decisions: [{ proposal_guid: "g-3", decision: "accept" }, { proposal_guid: "g-1", decision: "accept" }] }, "l", deps))
      .rejects.toMatchObject({ status: 409, message: 'retype wall "W 1": this ghost is declined — only a lead may re-open it, then it can be accepted' });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("a lead re-opens a decline: proposed again on the doc, ONE changeset_reopened row naming who declined it", async () => {
    const deps = seeded(fx.after, { myRole: as("lead") });
    const out = await reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: fx.reopen.reason }, fx.reopen.who.by, deps);
    expect({ ...out.changeset.elements[0].review, at: fx.reopen.who.at }).toEqual(fx.reopened_review);
    expect(out.changeset.review_rev).toBe(2);
    const row = deps.audit.mock.calls[0];
    expect(row.slice(3, 6)).toEqual(["changeset_reopened", fx.reopen.who.by, { review_rev: 1, state: "declined" }]);
    expect(row[6]).toEqual({ review_rev: 2, lead: fx.reopen.who.by, role: "lead", proposal_guid: "g-1", name: 'retype wall "W 1"',
      declined_by: fx.who.by, declined_reason: "wrong type: W 1 is a party wall", reason: fx.reopen.reason });
  });
});

describe("MA-3a — Revit's result against the web's declines (Q2)", () => {
  const fx = ma3a;
  const seeded = seededWith;
  const applied = (g, id = 7) => ({ proposal_guid: g, revit_element_id: id });

  it("applying a ghost Revit had seen declined is a 409 naming it; nothing is written and no row", async () => {
    const deps = seeded(fx.after);
    await expect(reportResult("demo", "cs-ma3a", { applied: [applied("g-1")], rejected: ["g-2", "g-3", "g-4"], review_rev: 1 }, "revit", deps))
      .rejects.toMatchObject({ status: 409, message: 'retype wall "W 1" was declined on the web by reviewer@example.com (contributor): "wrong type: W 1 is a party wall" — review_rev 1, which this result says Revit re-checked; Revit refuses that tick, so this result is refused. Nothing was recorded; the changeset stays proposed' });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("the shared fixture: a ghost declined after Revit's re-check is applied over the decline, recorded on the result and the row", async () => {
    const deps = seeded(fx.after, { myRole: as("lead", "contributor") });
    await reopenGhost("demo", "cs-ma3a", { proposal_guid: "g-1", reason: fx.reopen.reason }, "lead@example.com", deps); // revision 2 — Revit re-checks here
    await reviewChangeset("demo", "cs-ma3a", { decisions: [{ proposal_guid: "g-3", decision: "decline", reason: "W 2 is demolished" }] }, "reviewer@example.com", deps); // 3
    deps.audit.mockClear();
    const out = await reportResult("demo", "cs-ma3a", { applied: [applied("g-3", 2051449)], rejected: ["g-1", "g-2", "g-4"], review_rev: 2 }, "revit", deps);
    const want = fx.late_reply;
    expect(out.status).toBe(want.status);
    expect(out.review_rev).toBe(want.review_rev);
    expect(out.result.review_rev_seen).toEqual(want.result.review_rev_seen); // {value: 2, claimed: true} — the client's claim (C2)
    expect(out.result.declined_on_web).toEqual(want.result.declined_on_web);
    expect(out.result.applied_over_late_decline).toEqual(want.result.applied_over_late_decline);
    expect(out.result.applied_over_decline_unchecked).toEqual(want.result.applied_over_decline_unchecked);
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ status: "partially_applied", declined_on_web: 1, applied_over_late_decline: want.result.applied_over_late_decline });
    expect(deps.audit.mock.calls[0][6]).not.toHaveProperty("applied_over_decline_unchecked");
  });

  it("a result without review_rev (an add-in before MA-3a, a script) lands; a decline it applied is recorded as unchecked, never late (C2)", async () => {
    const deps = seeded(fx.after);
    const out = await reportResult("demo", "cs-ma3a", { applied: [applied("g-1"), applied("g-2", 8)], rejected: ["g-3", "g-4"] }, "revit", deps);
    expect(out.result.review_rev_seen).toBeNull();
    expect(out.result.applied_over_late_decline).toEqual([]);
    expect(out.result.applied_over_decline_unchecked.map((x) => x.proposal_guid)).toEqual(["g-1"]);
    const row = deps.audit.mock.calls[0][6];
    expect(row.applied_over_decline_unchecked.map((x) => x.proposal_guid)).toEqual(["g-1"]);
    expect(row.unchecked_why).toBe("the reporting client sent no review_rev — the bridge cannot tell whether it saw the decline");
    expect(row).not.toHaveProperty("applied_over_late_decline");
  });
});

describe("MA-3a — the routes", () => {
  it("POST /changesets/:key/:id/review and /reopen reach the store, as a person on the web (actor fallback web)", () => {
    const src = readFileSync(new URL("./bcf-service.mjs", import.meta.url), "utf8");
    expect(src).toContain('if (p2 && p3 === "review" && req.method === "POST") return send(res, 200, await ch.reviewChangeset(key, p2, body, actor));');
    expect(src).toContain('if (p2 && p3 === "reopen" && req.method === "POST") return send(res, 200, await ch.reopenGhost(key, p2, body, actor));');
    expect(src).toContain('const actor = body.actor || (["result", "reverted"].includes(p3) ? "revit" : ["review", "reopen"].includes(p3) ? "web" : "agent");');
  });
});
```

In `WebApp/bridge/ledger-write.test.mjs`, replace

```js
    [{ entity_type: " Platform_Gate ", action: "recorded" }, "platform_gate rows are written by Sentinel, not through this route"],
```

with

```js
    [{ entity_type: " Platform_Gate ", action: "recorded" }, "platform_gate rows are written by Sentinel, not through this route"],
    // MA-3a (review amendment C5): the web desk's decisions and a lead's re-open are the bridge's rows — the record of a binding decline.
    [{ entity_type: "changeset", action: "changeset_reviewed" }, "changeset_reviewed rows are written by Sentinel, not through this route"],
    [{ entity_type: "changeset", action: " Changeset_Reopened" }, "changeset_reopened rows are written by Sentinel, not through this route"],
```

Create `WebApp/bridge/migration-0037.test.mjs`:

```js
// Migration 0037 (MA-3a, review amendment C1): the changeset store is the bridge's alone. A web decline binds Revit through the
// changeset doc, so a member must not be able to write that doc straight through PostgREST with the public anon key and their own
// JWT (re-open a decline, delete a review, forge review.by). Applied by the controller on the founder's "apply" — never by a test.
// This pins the text the probe and the bridge rely on, as migration-0033.test.mjs does for 0033.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0037_changeset_bridge_only.sql");
const PROBE = read("../db/migrations/probes/0037_probe.sql");
const STORE = read("./changesets-store.mjs");
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

describe("migration 0037 — the changeset store is written by the bridge alone (written, not applied)", () => {
  it("is marked not yet applied and redefines bridge_docs_floor only — no table, policy, grant or drop", () => {
    expect(SQL).toContain("NOT YET APPLIED");
    expect(code).toContain("create or replace function public.bridge_docs_floor(p_store text) returns text\n  language sql immutable set search_path = public as $$");
    expect(code).not.toMatch(/\b(drop|grant|revoke|create\s+table|create\s+policy|alter\s+table)\b/i);
  });

  it("names every store 0034 named except changeset, at the same floors, with no else", () => {
    const floor = code.slice(code.indexOf("function public.bridge_docs_floor"));
    expect([...floor.matchAll(/when '([a-z_]+)'\s+then '([a-z]+)'/g)].map((m) => `${m[1]}=${m[2]}`))
      .toEqual(["doc_comments=viewer", "rfi=contributor", "office_snapshot=contributor", "office_scan=contributor"]);
    expect(floor).not.toMatch(/\belse\b/);
    expect(floor).not.toContain("'changeset'");
  });

  it("the probe checks the floors, a contributor's refused direct write of a changeset doc and the rfi control, and rolls back", () => {
    for (const w of ["changeset has no signed-in writer", "rfi still contributor", "doc_comments still viewer", "office_snapshot still contributor", "office_scan still contributor",
      "a contributor's direct update of a changeset doc patches 0 rows", "a contributor's direct insert of a changeset doc is refused", "the control rfi update patches 1 row", "PROBE 0037:"])
      expect(PROBE).toContain(w);
    expect(PROBE).toContain("set local role authenticated;");
  });

  it("the bridge writes every changeset doc with the service key, so it is safe on either side of the apply", () => {
    expect(STORE).toContain("await d.docInsert(STORE, proj.id, changeset.id, changeset, { service: true });");
    expect(STORE).toContain('await d.docReplaceIfField(STORE, pid, id, out.updated, "review_rev", Number.isInteger(cs.review_rev) ? cs.review_rev : null, { service: true })');
    expect(STORE).not.toContain("docReplaceIfStatus");
  });
});
```

- [ ] **Step 2: See it fail.** From `WebApp`: `npx vitest run bridge/changesets-store.test.mjs bridge/ledger-write.test.mjs bridge/migration-0037.test.mjs` → `Test Files  3 failed (3)`, `Tests  32 failed | 54 passed (86)`: in the store, the 14 new tests (`reviewChangeset is not a function`, no `review_rev`, …) and 12 existing ones whose result or withdraw now reaches the tripwire (`MA-3a: a changeset write swaps on review_rev — docReplaceIfStatus is not called`); the 2 new reserved actions (C5); the 4 migration-0037 tests (no file yet — C1).

- [ ] **Step 3: The store.**

In `WebApp/bridge/changesets-store.mjs`, replace

```js
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures } from "./changesets-logic.mjs";
```

with

```js
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures,
  reviewRev, applyDecisions, reopenDecline, resultConflicts } from "./changesets-logic.mjs";
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  docReplaceIfStatus: deps.docReplaceIfStatus || cde.docReplaceIfStatus,
```

with

```js
  docReplaceIfField: deps.docReplaceIfField || cde.docReplaceIfField,
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
  resolveArtefact: deps.resolveArtefact || resolveArtefact,
});
```

with

```js
  takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
  resolveArtefact: deps.resolveArtefact || resolveArtefact,
});

/** MA-3a (gotcha 1): every write of a changeset doc is read → decided → swapped on review_rev, which each write bumps — a web
 *  decision written between a read and a write is never overwritten (the status-only swap it replaces lost one). A lost swap reads
 *  again and decides again on the new doc; three in a row are a 409. A doc from before MA-3a has no review_rev: its first write
 *  swaps on the field being absent. `decide(cs)` throws its 400/409 in words, or answers {updated, …} — answered with `before`. */
async function rewrite(d, pid, id, decide) {
  for (let i = 0; i < 3; i++) {
    const cs = await d.docGet(STORE, pid, id);
    if (!cs) throw err(404, "changeset not found");
    const out = decide(cs);
    // C1 (migration 0037): the changeset store has no signed-in writer — the bridge writes it with the service key, after its own
    // role check (every caller of rewrite checks first), so a member cannot re-open a decline by writing the doc themselves.
    if (await d.docReplaceIfField(STORE, pid, id, out.updated, "review_rev", Number.isInteger(cs.review_rev) ? cs.review_rev : null, { service: true }))
      return { before: cs, ...out };
  }
  // C3: a 503, not a 409 — Revit's Report stops at a 409 ("retrying cannot fix this"), and a send after these writes would land.
  throw err(503, "the changeset changed three times while this was being written — nothing was saved; send it again");
}

/** MA-3a (Q1, design §6.11): a web review decision is a signed-in person's — the machine credential (the add-in signed out, the MCP
 *  agent, any script holding the token) never accepts, declines or re-opens, as a version review is never the machine's
 *  (cde-store reviewDecide). Then the role: contributor to decide, lead to re-open. Answers the role. */
async function reviewer(d, key, min, what) {
  const role = await d.myRole(key);
  if (role === "service") throw err(403, `${what} on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)`);
  if (!role || (members.ROLE_RANK[role] || 0) < members.ROLE_RANK[min]) throw err(403, `${what} requires the ${min} role (you are ${role || "not a member"})`);
  return role;
}

const ledgerRef = (row) => (row ? { id: row.id ?? null, hash: row.hash ?? null } : null);

/** C2: the words a changeset_applied row carries when a result with no review_rev applied a web decline. */
const UNCHECKED_WHY = "the reporting client sent no review_rev — the bridge cannot tell whether it saw the decline";
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
    status: "proposed", created_at: now, updated_at: now,
```

with

```js
    status: "proposed", created_at: now, updated_at: now, review_rev: 0, // MA-3a: bumped and swapped on by every later write
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  await d.docInsert(STORE, proj.id, changeset.id, changeset);
```

with

```js
  await d.docInsert(STORE, proj.id, changeset.id, changeset, { service: true }); // C1 (migration 0037): the bridge's write, after the role check above
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
export async function reportResult(key, id, { applied, rejected, note } = {}, actor, deps) {
  const d = wire(deps);
  // A result says what a human ticked in Revit and is written once. H4: Revit signs in per user, so it is that user's
  // contributor check (the machine credential still passes as service); a viewer reports nothing, before any read.
  await d.requireMinRole(key, "contributor");
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status} — a result can be reported exactly once, from proposed`);

  const appliedArr = Array.isArray(applied) ? applied : [];
  const rejectedArr = Array.isArray(rejected) ? rejected : [];
  for (const [i, a] of appliedArr.entries()) {
    if (!a || typeof a.proposal_guid !== "string" || !Number.isInteger(a.revit_element_id) || a.revit_element_id <= 0)
      throw err(400, `applied[${i}] must be {proposal_guid, revit_element_id}`);
  }
  const known = new Set(cs.elements.map((e) => e.proposal_guid));
  const seen = new Set();
  for (const g of [...appliedArr.map((a) => a.proposal_guid), ...rejectedArr]) {
    if (!known.has(g)) throw err(400, `unknown proposal_guid "${g}"`);
    if (seen.has(g)) throw err(400, `proposal_guid "${g}" appears twice in the result`);
    seen.add(g);
  }
  if (seen.size !== cs.elements.length)
    throw err(400, `result must account for every element (${seen.size} of ${cs.elements.length} covered)`);

  const status = deriveResultStatus(appliedArr.length, rejectedArr.length, cs.elements.length);
  const updated = {
    ...cs, status, updated_at: new Date().toISOString(),
    result: {
      applied: appliedArr.map((a) => ({ proposal_guid: a.proposal_guid, revit_element_id: Number(a.revit_element_id), revit_unique_id: a.revit_unique_id ?? null })),
      rejected: rejectedArr, note: typeof note === "string" && note.trim() ? note.trim() : null,
      reported_at: new Date().toISOString(), reported_by: resolveActor(actor, "revit"),
    },
  };
  // CAS: the write itself re-checks status server-side, so a concurrent withdraw/report can't
  // both land. The loser re-reads and 409s with the winner's status; no audit row for the loser.
  const won = await d.docReplaceIfStatus(STORE, proj.id, id, updated, "proposed");
  if (!won) {
    const now2 = await d.docGet(STORE, proj.id, id);
    throw err(409, `changeset is ${now2?.status ?? "gone"} — a result can be reported exactly once, from proposed`);
  }
```

with

```js
export async function reportResult(key, id, { applied, rejected, note, review_rev } = {}, actor, deps) {
  const d = wire(deps);
  // A result says what a human ticked in Revit and is written once. H4: Revit signs in per user, so it is that user's
  // contributor check (the machine credential still passes as service); a viewer reports nothing, before any read.
  await d.requireMinRole(key, "contributor");
  const proj = await d.ensureProject(key);
  const appliedArr = Array.isArray(applied) ? applied : [];
  const rejectedArr = Array.isArray(rejected) ? rejected : [];

  // CAS (MA-3a: on review_rev, rewrite): a concurrent withdraw or report can't both land — the loser reads the winner's status and
  // 409s, with no audit row — and a web decision written in between is kept, and judged.
  const { before: cs, updated, conflicts } = await rewrite(d, proj.id, id, (cs) => {
    if (cs.status !== "proposed") throw err(409, `changeset is ${cs.status} — a result can be reported exactly once, from proposed`);
    for (const [i, a] of appliedArr.entries()) {
      if (!a || typeof a.proposal_guid !== "string" || !Number.isInteger(a.revit_element_id) || a.revit_element_id <= 0)
        throw err(400, `applied[${i}] must be {proposal_guid, revit_element_id}`);
    }
    const known = new Set(cs.elements.map((e) => e.proposal_guid));
    const seen = new Set();
    for (const g of [...appliedArr.map((a) => a.proposal_guid), ...rejectedArr]) {
      if (!known.has(g)) throw err(400, `unknown proposal_guid "${g}"`);
      if (seen.has(g)) throw err(400, `proposal_guid "${g}" appears twice in the result`);
      seen.add(g);
    }
    if (seen.size !== cs.elements.length)
      throw err(400, `result must account for every element (${seen.size} of ${cs.elements.length} covered)`);
    // MA-3a (Q2): a web decline Revit had seen binds — applying it is refused; one that landed after Revit's re-check is recorded.
    const conflicts = resultConflicts(cs, appliedArr.map((a) => a.proposal_guid), rejectedArr, review_rev);
    if (conflicts.refused.length)
      throw err(409, conflicts.refused.map((x) => `${x.name} was declined on the web by ${x.by} (${x.role}): "${x.reason}" — review_rev ${x.rev}, which this result says Revit re-checked`).join("; ") +
        "; Revit refuses that tick, so this result is refused. Nothing was recorded; the changeset stays proposed");
    const status = deriveResultStatus(appliedArr.length, rejectedArr.length, cs.elements.length);
    return { conflicts, updated: {
      ...cs, status, updated_at: new Date().toISOString(), review_rev: reviewRev(cs) + 1,
      result: {
        applied: appliedArr.map((a) => ({ proposal_guid: a.proposal_guid, revit_element_id: Number(a.revit_element_id), revit_unique_id: a.revit_unique_id ?? null })),
        rejected: rejectedArr, note: typeof note === "string" && note.trim() ? note.trim() : null,
        reported_at: new Date().toISOString(), reported_by: resolveActor(actor, "revit"),
        // C2: the revision is the client's claim; a result without one is unchecked, never late.
        review_rev_seen: review_rev == null ? null : { value: review_rev, claimed: true },
        declined_on_web: conflicts.declined_on_web, applied_over_late_decline: conflicts.late, applied_over_decline_unchecked: conflicts.unchecked,
      },
    } };
  });
  const status = updated.status;
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note, ...(values.length ? { values } : {}) });
  return updated;
}
```

with

```js
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note, ...(values.length ? { values } : {}),
      // MA-3a: the web's declines the result rejected (counted), and any ghost applied over a decline Revit could not see (named).
      declined_on_web: conflicts.declined_on_web.length, ...(conflicts.late.length ? { applied_over_late_decline: conflicts.late } : {}),
      ...(conflicts.unchecked.length ? { applied_over_decline_unchecked: conflicts.unchecked, unchecked_why: UNCHECKED_WHY } : {}) });
  return updated;
}
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  const proj = await d.ensureProject(key);
  const cs = await d.docGet(STORE, proj.id, id);
  if (!cs) throw err(404, "changeset not found");
  if (!canWithdraw(cs.status)) throw err(409, `changeset is ${cs.status} — only a proposed changeset can be withdrawn`);
  const updated = { ...cs, status: "withdrawn", updated_at: new Date().toISOString() };
  // CAS: same guard as reportResult — a concurrent report/withdraw can't both land.
  const won = await d.docReplaceIfStatus(STORE, proj.id, id, updated, "proposed");
  if (!won) {
    const now2 = await d.docGet(STORE, proj.id, id);
    throw err(409, `changeset is ${now2?.status ?? "gone"} — only a proposed changeset can be withdrawn`);
  }
  await d.audit(
```

with

```js
  const proj = await d.ensureProject(key);
  // CAS: same guard as reportResult (rewrite, on review_rev) — a concurrent report/withdraw can't both land.
  const { updated } = await rewrite(d, proj.id, id, (cs) => {
    if (!canWithdraw(cs.status)) throw err(409, `changeset is ${cs.status} — only a proposed changeset can be withdrawn`);
    return { updated: { ...cs, status: "withdrawn", updated_at: new Date().toISOString(), review_rev: reviewRev(cs) + 1 } };
  });
  await d.audit(
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  return d.audit(proj.id, "changeset", id, "changeset_reverted", actor || "revit", { status: cs.status }, { op, guids, count: guids.length });
}
```

with

```js
  return d.audit(proj.id, "changeset", id, "changeset_reverted", actor || "revit", { status: cs.status }, { op, guids, count: guids.length });
}

/** MA-3a: POST /changesets/:key/:id/review {decisions: [{proposal_guid, decision: accept | decline, reason}]} — the web desk's
 *  decisions, all or none, while the changeset is proposed (design §6.6). A signed-in contributor or above (Q1). Stored on each
 *  ghost's `review` (Revit reads it: a decline binds, an accept is advice) and written as ONE changeset_reviewed row naming each
 *  ghost's step, the reviewer and the role. Answers {changeset, ledger: {id, hash}}. */
export async function reviewChangeset(key, id, { decisions } = {}, actor, deps) {
  const d = wire(deps);
  const role = await reviewer(d, key, "contributor", "accepting or declining a ghost");
  d.takeWriteBudget("changeset reviews", { perUser: 60, all: 300 });
  const proj = await d.ensureProject(key);
  const who = { by: resolveActor(actor, "web"), role, at: new Date().toISOString() };
  const { before, updated, rows } = await rewrite(d, proj.id, id, (cs) => applyDecisions(cs, decisions, who));
  const row = await d.audit(proj.id, "changeset", id, "changeset_reviewed", actor || "web", { review_rev: reviewRev(before) },
    { review_rev: updated.review_rev, reviewer: who.by, role, decisions: rows });
  return { changeset: updated, ledger: ledgerRef(row) };
}

/** MA-3a: POST /changesets/:key/:id/reopen {proposal_guid, reason} — a signed-in lead or owner re-opens one web decline (D17): the
 *  ghost is proposed again, and Revit may tick it. ONE changeset_reopened row names it, who declined it and why, and the lead's
 *  reason. Answers {changeset, ledger: {id, hash}}. */
export async function reopenGhost(key, id, { proposal_guid, reason } = {}, actor, deps) {
  const d = wire(deps);
  const role = await reviewer(d, key, "lead", "re-opening a declined ghost");
  d.takeWriteBudget("changeset reviews", { perUser: 60, all: 300 });
  const proj = await d.ensureProject(key);
  const who = { by: resolveActor(actor, "web"), role, at: new Date().toISOString() };
  const { before, updated, row } = await rewrite(d, proj.id, id, (cs) => reopenDecline(cs, proposal_guid, reason, who));
  const ledger = await d.audit(proj.id, "changeset", id, "changeset_reopened", actor || "web", { review_rev: reviewRev(before), state: "declined" },
    { review_rev: updated.review_rev, lead: who.by, role, ...row });
  return { changeset: updated, ledger: ledgerRef(ledger) };
}
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
export async function docReplaceIfField(store, pid, docId, data, field, expected) {
  const cond = expected === null ? `data->>${enc(field)}=is.null` : `data->>${enc(field)}=eq.${enc(expected)}`;
  const rows = await sb(
    `bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&doc_id=eq.${enc(docId)}&${cond}`,
    { method: "PATCH", body: { data, updated_at: new Date().toISOString() }, prefer: "return=representation" },
  );
```

with

```js
export async function docReplaceIfField(store, pid, docId, data, field, expected, { service = false } = {}) {
  const cond = expected === null ? `data->>${enc(field)}=is.null` : `data->>${enc(field)}=eq.${enc(expected)}`;
  const rows = await sb(
    `bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&doc_id=eq.${enc(docId)}&${cond}`,
    // MA-3a (C1): `service` for a store with no signed-in writer (changeset, migration 0037) — the caller checked the role first.
    { method: "PATCH", body: { data, updated_at: new Date().toISOString() }, prefer: "return=representation", service },
  );
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:", "hold:", "review:"];
```

with

```js
// MA-3a (review amendment C5): changeset_reviewed and changeset_reopened are the record of the web desk's decisions and a lead's
// re-open (changesets-store reviewChangeset / reopenGhost) — never written through the open route.
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:", "hold:", "review:", "changeset_reviewed", "changeset_reopened"];
```

Create `WebApp/db/migrations/0037_changeset_bridge_only.sql`:

```sql
-- 0037_changeset_bridge_only.sql — the changeset store is written by the bridge alone (MA-3a, review amendment C1).
--
-- Why: MA-3a makes a web decline BIND in Revit through the changeset doc (each ghost's `review`, the doc's `review_rev` —
-- spec amendment S1). 0033 left the 'changeset' store's floor at 'contributor', so a signed-in contributor could PATCH a
-- changeset doc straight through PostgREST with the public anon key and their own JWT, skipping the bridge: set a declined
-- ghost back to proposed (a re-open by a non-lead, with no changeset_reopened row), delete a review, or write review.by as
-- someone else — and Revit would obey the forged doc. 0034 closed the same hole for the clash register. After this,
-- 'changeset' joins 'clash', 'tender', 'manifest', 'federation' and 'keystore': no signed-in writer; the bridge writes it with
-- the service key after its own role check (contributor to propose, report, withdraw, accept or decline; lead to re-open).
--
-- NOT YET APPLIED — apply on the founder's "apply", AFTER the bridge that writes changesets with the service key runs (MA-3a's
-- changesets-store.mjs: docInsert and rewrite pass { service: true }). A bridge before MA-3a forwards a signed-in person's
-- changeset writes, which this refuses (an insert: 42501; a swap: 0 rows patched, a 409). Then run probes/0037_probe.sql and
-- record its result here.
--
-- Reads are unchanged (any member reads a changeset: bridge_docs_read, 0033). Deletes: bridge_docs_delete asks for a non-null
-- floor, so a signed-in lead no longer deletes changeset rows directly either (the bridge deletes nothing of them).
--
-- ROLLBACK (if needed): re-run 0034's bridge_docs_floor (the 'changeset' line back at 'contributor').

create or replace function public.bridge_docs_floor(p_store text) returns text
  language sql immutable set search_path = public as $$
  select case p_store
    when 'doc_comments'    then 'viewer'
    when 'rfi'             then 'contributor'
    when 'office_snapshot' then 'contributor'
    when 'office_scan'     then 'contributor'
  end;
$$;
```

Create `WebApp/db/migrations/probes/0037_probe.sql`:

```sql
-- probes/0037_probe.sql — run after 0037 is applied. Part 1: every row must read true. Part 2: one DO block that builds a
-- project with a contributor, a changeset doc and an rfi doc (the service key), then, signed in as the contributor under
-- `set local role authenticated` (row-level security applies as it does to a PostgREST call), tries a direct update and a
-- direct insert of a changeset doc and a control update of the rfi doc; it ALWAYS raises its summary, so everything it wrote
-- rolls back. "PROBE 0037: 3 of 3 as expected." is the pass. It writes no audit row.

select 'changeset has no signed-in writer' as check, public.bridge_docs_floor('changeset') is null as ok
union all select 'rfi still contributor', public.bridge_docs_floor('rfi') = 'contributor'
union all select 'doc_comments still viewer', public.bridge_docs_floor('doc_comments') = 'viewer'
union all select 'office_snapshot still contributor', public.bridge_docs_floor('office_snapshot') = 'contributor'
union all select 'office_scan still contributor', public.bridge_docs_floor('office_scan') = 'contributor'
union all select 'clash still bridge-only', public.bridge_docs_floor('clash') is null;

do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  p uuid;
  u_con uuid := gen_random_uuid();
  j_con text := json_build_object('sub', u_con, 'email', 'contributor@probe.invalid', 'role', 'authenticated')::text;
  w_rls text := '42501 new row violates row-level security policy for table "bridge_docs"';
  outcome text;
  rc int;
  n int := 0;
  failed text[] := '{}';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name) values ('probe-0037-p-' || sfx, 'probe 0037 p') returning id into p;
  insert into public.memberships(project_id, user_id, role) values (p, u_con, 'contributor');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('changeset', p::text, 'probe-cs', '{"status":"proposed","review_rev":1,"elements":[{"proposal_guid":"g","review":{"state":"declined"}}]}'),
    ('rfi', p::text, 'probe-rfi', '{"probe":true}');
  perform set_config('request.jwt.claims', j_con, true);

  -- R1 a contributor's direct update of a changeset doc patches 0 rows (the re-open the bridge refuses a non-lead)
  n := n + 1;
  begin set local role authenticated;
    update public.bridge_docs set data = '{"status":"proposed","review_rev":2,"elements":[{"proposal_guid":"g","review":{"state":"proposed","action":"reopen"}}]}'
     where store = 'changeset' and project_id = p::text and doc_id = 'probe-cs';
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0' then failed := failed || ('R1 a contributor''s direct update of a changeset doc patches 0 rows: ' || coalesce(outcome, 'null')); end if;

  -- R2 a contributor's direct insert of a changeset doc is refused by row-level security
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('changeset', p::text, 'probe-cs-2', '{"status":"proposed"}');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('R2 a contributor''s direct insert of a changeset doc is refused: ' || coalesce(outcome, 'null')); end if;

  -- R3 the control rfi update patches 1 row (the contributor's floor there is unchanged)
  n := n + 1;
  begin set local role authenticated;
    update public.bridge_docs set data = '{"probe":"updated"}' where store = 'rfi' and project_id = p::text and doc_id = 'probe-rfi';
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('R3 the control rfi update patches 1 row: ' || coalesce(outcome, 'null')); end if;

  perform set_config('request.jwt.claims', '', true);
  if (select data->'elements'->0->'review'->>'state' from public.bridge_docs where store = 'changeset' and project_id = p::text and doc_id = 'probe-cs') is distinct from 'declined' then
    failed := failed || 'R1 the changeset doc changed'::text;
  end if;

  raise exception 'PROBE 0037: % of % as expected%. Everything above is rolled back (the project, the membership, both bridge_docs rows); no audit row was written.',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
```

- [ ] **Step 4: The routes.**

In `WebApp/bridge/bcf-service.mjs`, replace

```js
  //   POST /changesets/:key/:id/withdraw · POST /changesets/:key/:id/reverted { op: undo|redo, guids } → a ledger row
```

with

```js
  //   POST /changesets/:key/:id/withdraw · POST /changesets/:key/:id/reverted { op: undo|redo, guids } → a ledger row
  //   POST /changesets/:key/:id/review { decisions: [{proposal_guid, decision, reason}] } · POST /changesets/:key/:id/reopen { proposal_guid, reason }
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
      const actor = body.actor || (["result", "reverted"].includes(p3) ? "revit" : "agent");
```

with

```js
      const actor = body.actor || (["result", "reverted"].includes(p3) ? "revit" : ["review", "reopen"].includes(p3) ? "web" : "agent");
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
      if (p2 && p3 === "reverted" && req.method === "POST") return send(res, 201, await ch.reportReverted(key, p2, body, actor));
```

with

```js
      if (p2 && p3 === "reverted" && req.method === "POST") return send(res, 201, await ch.reportReverted(key, p2, body, actor));
      // MA-3a: the web desk — a signed-in contributor's decisions; a signed-in lead's re-open of a decline (changesets-store).
      if (p2 && p3 === "review" && req.method === "POST") return send(res, 200, await ch.reviewChangeset(key, p2, body, actor));
      if (p2 && p3 === "reopen" && req.method === "POST") return send(res, 200, await ch.reopenGhost(key, p2, body, actor));
```

- [ ] **Step 5: See it pass.** From `WebApp`: `npx vitest run bridge/changesets-store.test.mjs bridge/changesets-review.test.mjs bridge/changesets-logic.test.mjs bridge/ledger-write.test.mjs bridge/migration-0037.test.mjs` → `Test Files  5 passed (5)`, `Tests  197 passed (197)`; then `npx vitest run bridge` → `Test Files  91 passed (91)`, `Tests  1849 passed | 1 skipped (1850)` (the MCP server, the write-role and typing tests unchanged). Then `git status --short`: if `bridge/fixtures/lod-matrix/ids-cases.json` shows modified and `git diff --ignore-all-space --stat` on it is empty, `git checkout -- bridge/fixtures/lod-matrix/ids-cases.json`.

- [ ] **Step 6: Commit.**

```bash
git add WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-store.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/ledger-write.test.mjs WebApp/bridge/migration-0037.test.mjs WebApp/db/migrations/0037_changeset_bridge_only.sql WebApp/db/migrations/probes/0037_probe.sql
git commit -F - <<'EOF'
feat(bridge): MA-3a - POST /changesets/:key/:id/review and /reopen: a signed-in contributor accepts or declines (a decline needs a reason), a signed-in lead re-opens, the machine credential never (403, sign in); decisions on the changeset doc and one changeset_reviewed / changeset_reopened row, both actions reserved on the open audit route; every changeset write swaps on review_rev with the service key (a web decision is never lost under a result or a withdraw; three lost swaps a 503); migration 0037 (written, not applied) leaves the changeset store no signed-in writer, with its probe; a result that applies a decline Revit had seen is refused, one that landed after Revit's re-check is recorded as applied_over_late_decline, one with no review_rev as applied_over_decline_unchecked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 3 — Revit: the window and Apply obey the web's declines

**Files:**
- Modify `SentinelAddin/Coordination/ChangesetClient.cs`
- Modify `SentinelAddin/UI/ChangesetReviewWindow.cs`
- Modify `SentinelAddin/Commands.ReviewChangesets.cs`
- Modify `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` (C2: the applying `Report` sends `cs.ReviewRev`)
- Create `tools/promote-check/Ma3aReview.cs`; modify `tools/promote-check/Check.cs`, `tools/promote-check/Ma2dWiring.cs`

**Interfaces:**
- Consumes: the bridge's `review` and `review_rev` (Task 2); the fixture (Task 1). In the add-in: `ChangesetClient.Post(cfg, path, payload, expect, out body, out error)`, `UserSession.Actor`, `StoreyBatch.Merge` (it keeps each part's element objects, so their `Review` reaches the window), `Src(...)`/`Repo(...)`/`Ok(...)` in promote-check.
- Produces:
  - `ReviewDto {State, Action, Reason, By, Role, At, Rev (int?)}`; `ChangesetElementDto.Review`; `ChangesetDto.ReviewRev (int?)`.
  - `ChangesetTrust.DeclinedOnWeb(el) → bool`, `ReviewLine(el) → string|null`, `DeclinedHeader(cs) → string|null`, `DeclinedTicked(IEnumerable<ChangesetDto> fresh, ICollection<string> ticked) → string|null`, `LateDeclines(string reply) → string|null` (the late list and, C2, the unchecked list); `PreTick` false for a declined ghost.
  - `ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, int? reviewRev, out string reply, out string error)`; `ReviewChangesetsCommand.Report(…, string note, int? reviewRev = null)`.

- [ ] **Step 1: The failing checks.**

Create `tools/promote-check/Ma3aReview.cs`:

```csharp
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
        Ok(refused == "1 ticked ghost(s) were declined on the web after this window opened:\n· retype wall \"W 1\" — declined on the web by reviewer@example.com (contributor): wrong type: W 1 is a party wall · a lead may re-open it on the web desk\n\nNothing was created. Run Review AI Proposals again: they open unticked, with the reason.",
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
        Ok(review.Contains("if (!Report(cfg, key, one.Id, res.Applied, rejected, said, one.ReviewRev)) continue;")
           && review.Contains("if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, reviewRev, out var reply, out var err))")
           && review.Contains("if (ChangesetTrust.LateDeclines(reply) is { } late) TaskDialog.Show(\"Sentinel — AI proposals\", late);")
           && client.Contains("JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev })")
           && ghost.Contains("res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine), cs.ReviewRev))"),
           "the result carries the review_rev Apply re-checked (Ghost Builder's, the one its filing reply carried — C2), and a late or unchecked decline the bridge recorded is said");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        Ma2dStoreyWiringChecks();
```

with

```csharp
        Ma2dStoreyWiringChecks();
        Ma3aReviewChecks();
        Ma3aWiringChecks();
```

In `tools/promote-check/Ma2dWiring.cs`, replace

```csharp
        int reported = At(review, "if (!Report(cfg, key, one.Id, res.Applied, rejected, said)) continue;");
```

with

```csharp
        int reported = At(review, "if (!Report(cfg, key, one.Id, res.Applied, rejected, said, one.ReviewRev)) continue;"); // MA-3a: with the revision Apply re-checked
```

- [ ] **Step 2: See it fail.** From the repo root: `dotnet run --project tools/promote-check` → the build fails: `Ma3aReview.cs(…): error CS1061: 'ChangesetDto' does not contain a definition for 'ReviewRev'`, `error CS1061: 'ChangesetElementDto' does not contain a definition for 'Review'`, `error CS0117: 'ChangesetTrust' does not contain a definition for 'DeclinedOnWeb'`, `error CS0246: The type or namespace name 'ReviewDto' could not be found`.

- [ ] **Step 3: The client.**

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    [JsonPropertyName("value_source")] public ValueSourceDto ValueSource { get; set; }
}
```

with

```csharp
    [JsonPropertyName("value_source")] public ValueSourceDto ValueSource { get; set; }
    /// <summary>MA-3a (design §6.6, D17): the web desk's decision on this ghost, as the bridge stores it; null while nobody decided
    /// (proposed) and from a bridge before MA-3a. A decline binds (ChangesetTrust.PreTick, the window, Apply's re-check); an accept is
    /// advice.</summary>
    [JsonPropertyName("review")] public ReviewDto Review { get; set; }
}

/// <summary>MA-3a: one web desk decision on a ghost (changesets-logic.mjs applyDecisions / reopenDecline).</summary>
public sealed class ReviewDto
{
    /// <summary>"accepted", "declined", or "proposed" after a lead's re-open.</summary>
    [JsonPropertyName("state")] public string State { get; set; }
    /// <summary>"accept", "decline" or "reopen".</summary>
    [JsonPropertyName("action")] public string Action { get; set; }
    [JsonPropertyName("reason")] public string Reason { get; set; }
    [JsonPropertyName("by")] public string By { get; set; }
    [JsonPropertyName("role")] public string Role { get; set; }
    [JsonPropertyName("at")] public string At { get; set; }
    /// <summary>The changeset's review_rev this decision was written at.</summary>
    [JsonPropertyName("rev")] public int? Rev { get; set; }
}
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
        // MA-2c: a set_parameter is a TYPE edit — it reaches every element on the type — so it is never pre-ticked (founder decision F1).
        if (el.Op is null or "create" or "set_parameter") return false;
```

with

```csharp
        // MA-3a (design §6.6, D17): a web decline binds — never ticked, whatever else holds. A web accept changes nothing here (advice).
        if (DeclinedOnWeb(el)) return false;
        // MA-2c: a set_parameter is a TYPE edit — it reaches every element on the type — so it is never pre-ticked (founder decision F1).
        if (el.Op is null or "create" or "set_parameter") return false;
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    /// <summary>The changeset's source as the review shows it: a claim is said to be one.</summary>
    public static string SourceLabel(ChangesetDto cs) =>
        cs.Source + (cs.Claimed == true ? " (claimed — the bridge records who a changeset says it is from, and cannot verify it)" : "");
}
```

with

```csharp
    /// <summary>The changeset's source as the review shows it: a claim is said to be one.</summary>
    public static string SourceLabel(ChangesetDto cs) =>
        cs.Source + (cs.Claimed == true ? " (claimed — the bridge records who a changeset says it is from, and cannot verify it)" : "");

    /// <summary>MA-3a: whether the web desk declined this ghost — it binds: never ticked, and Apply refuses it.</summary>
    public static bool DeclinedOnWeb(ChangesetElementDto el) => el?.Review?.State == "declined";

    private static string Who(ReviewDto r) => (r.By ?? "someone") + (string.IsNullOrWhiteSpace(r.Role) ? "" : $" ({r.Role})");

    /// <summary>A ghost as the bridge's refusals name it (changesets-logic ghostName): retype wall "W 1".</summary>
    private static string GhostName(ChangesetElementDto e) => $"{e.Op ?? "create"} {e.Kind} \"{e.Validate?.Identity?.Name ?? e.ProposalGuid}\"";

    /// <summary>MA-3a: the row's words for the web desk's decision; null when nobody decided.</summary>
    public static string ReviewLine(ChangesetElementDto el)
    {
        var r = el?.Review;
        if (r == null) return null;
        if (r.State == "declined") return $"declined on the web by {Who(r)}: {r.Reason} · a lead may re-open it on the web desk";
        if (r.State == "accepted") return $"accepted on the web by {Who(r)}" + (string.IsNullOrWhiteSpace(r.Reason) ? "" : $": {r.Reason}") + " — advice: it still needs your tick";
        return r.Action == "reopen" ? $"re-opened on the web by {Who(r)}: {r.Reason}" : null;
    }

    /// <summary>MA-3a: the window's header when the web declined ghosts of <paramref name="cs"/>; null when none did.</summary>
    public static string DeclinedHeader(ChangesetDto cs)
    {
        int n = (cs.Elements ?? new List<ChangesetElementDto>()).Count(DeclinedOnWeb);
        // C4: a decline binds its changeset only — a Promote re-run proposes the same ghost again, undecided (carrying it is MA-3b).
        return n == 0 ? null : $"{n} ghost(s) declined on the web — shown unticked with the reason; they cannot be ticked here (a lead may re-open one on the web desk). " +
                               "Apply reports them as rejected; the changeset stays proposed until Revit reports it — a new Promote run proposes a declined ghost again, undecided.";
    }

    /// <summary>MA-3a: Apply's re-check on the fresh copies — the ticked ghosts the web declined (one may land after the window opened).
    /// The refusal's words (nothing is created), or null when none is.</summary>
    public static string DeclinedTicked(IEnumerable<ChangesetDto> fresh, ICollection<string> ticked)
    {
        var hit = (fresh ?? Enumerable.Empty<ChangesetDto>()).SelectMany(c => c.Elements ?? new List<ChangesetElementDto>())
            .Where(e => ticked.Contains(e.ProposalGuid) && DeclinedOnWeb(e)).ToList();
        return hit.Count == 0 ? null : $"{hit.Count} ticked ghost(s) were declined on the web after this window opened:\n" +
            string.Join("\n", hit.Select(e => $"· {GhostName(e)} — {ReviewLine(e)}")) +
            "\n\nNothing was created. Run Review AI Proposals again: they open unticked, with the reason.";
    }

    /// <summary>MA-3a (Q2): the bridge's reply to a result — the ghosts it recorded as applied over a decline that landed after Apply's
    /// re-check, and (C2) over a decline it could not judge because the result carried no review_rev, in words; null when there is none
    /// (or the reply is not JSON: the result was recorded either way).</summary>
    public static string LateDeclines(string reply)
    {
        try
        {
            using var doc = JsonDocument.Parse(reply ?? "");
            if (doc.RootElement.ValueKind != JsonValueKind.Object || !doc.RootElement.TryGetProperty("result", out var r) || r.ValueKind != JsonValueKind.Object) return null;
            string S(JsonElement x, string p) => x.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : "?";
            List<JsonElement> Arr(string p) => r.TryGetProperty(p, out var a) && a.ValueKind == JsonValueKind.Array ? a.EnumerateArray().ToList() : new List<JsonElement>();
            string Lines(List<JsonElement> xs) => string.Join("\n", xs.Select(x => $"· {S(x, "name")} — declined on the web by {S(x, "by")} ({S(x, "role")}): {S(x, "reason")}"));
            var late = Arr("applied_over_late_decline");
            var unchecked_ = Arr("applied_over_decline_unchecked");
            var said = new List<string>();
            if (late.Count > 0)
                said.Add($"{late.Count} ghost(s) were declined on the web after Apply re-checked them, and were applied:\n" + Lines(late) +
                         "\n\nThe bridge recorded the apply over the decline (changeset_applied). Undo in Revit if the decline should stand.");
            if (unchecked_.Count > 0)
                said.Add($"{unchecked_.Count} ghost(s) declined on the web were applied, and this result carried no review_rev — the bridge cannot tell whether the decline was seen:\n" + Lines(unchecked_) +
                         "\n\nThe bridge recorded it as unchecked (changeset_applied). Undo in Revit if the decline should stand.");
            return said.Count == 0 ? null : string.Join("\n\n", said);
        }
        catch (JsonException) { return null; }
    }
}
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    [JsonPropertyName("created_at")] public string CreatedAt { get; set; }
    [JsonPropertyName("adjudication")] public AdjudicationDto Adjudication { get; set; }
```

with

```csharp
    [JsonPropertyName("created_at")] public string CreatedAt { get; set; }
    /// <summary>MA-3a: the doc's review revision (every bridge write bumps it); the result sends back the one Apply re-checked. Null from a
    /// bridge before MA-3a.</summary>
    [JsonPropertyName("review_rev")] public int? ReviewRev { get; set; }
    [JsonPropertyName("adjudication")] public AdjudicationDto Adjudication { get; set; }
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    public static bool ReportResult(BcfConfig cfg, string projectKey, string id,
        List<AppliedEntry> applied, List<string> rejected, string note, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/result",
             JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor }), 200, out _, out error);
```

with

```csharp
    /// <summary>MA-3a: <paramref name="reviewRev"/> is the review_rev Apply re-checked (null: Ghost Builder's own build — the bridge reads 0);
    /// <paramref name="reply"/> is the bridge's answer, the stored changeset (ChangesetTrust.LateDeclines reads it).</summary>
    public static bool ReportResult(BcfConfig cfg, string projectKey, string id,
        List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, out string reply, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/result",
             JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev }), 200, out reply, out error);
```

- [ ] **Step 4: The window.**

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace

```csharp
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);
```

with

```csharp
        // MA-3a: the web desk's declines, said once above the rows.
        if (ChangesetTrust.DeclinedHeader(_cs) is string declinedLine)
            head.Children.Add(new TextBlock { Text = "⚠ " + declinedLine, Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace

```csharp
            _rows.Add((box, el));
            DockPanel.SetDock(box, Dock.Left);
```

with

```csharp
            // MA-3a (design §6.6, D17): a web decline binds — the row opens unticked (PreTick) and cannot be ticked here; a lead re-opens it
            // on the web desk. Apply re-checks the fresh copy (ReviewChangesetsCommand).
            box.IsEnabled = !ChangesetTrust.DeclinedOnWeb(el);
            _rows.Add((box, el));
            DockPanel.SetDock(box, Dock.Left);
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace

```csharp
            if (!string.IsNullOrWhiteSpace(el.Reason)) label.ToolTip = el.Reason;
```

with

```csharp
            if (!string.IsNullOrWhiteSpace(el.Reason)) label.ToolTip = el.Reason;
            // MA-3a: the web desk's decision leads the row (the ellipsis never trims it) and is the tooltip's first line.
            if (ChangesetTrust.ReviewLine(el) is string reviewLine)
            {
                label.Text = reviewLine + "  ·  " + label.Text;
                label.ToolTip = reviewLine + (string.IsNullOrWhiteSpace(el.Reason) ? "" : "\n" + el.Reason);
                if (!box.IsEnabled) label.Foreground = Brushes.Orange;
            }
```

- [ ] **Step 5: Apply and the report.**

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                fresh.Add(f);
            }

```

with

```csharp
                fresh.Add(f);
            }

            // MA-3a (design §6.6, D17): a web decline binds. The window shows one unticked and refuses its tick; one that landed after the
            // window opened is caught here, on the fresh copies — the whole Apply is refused and nothing is created.
            if (ChangesetTrust.DeclinedTicked(fresh, ticked) is { } declinedTicked)
            {
                TaskDialog.Show("Sentinel — AI proposals", declinedTicked);
                return;
            }

```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                    if (!Report(cfg, key, one.Id, res.Applied, rejected, said)) continue;
```

with

```csharp
                    if (!Report(cfg, key, one.Id, res.Applied, rejected, said, one.ReviewRev)) continue; // MA-3a: the revision Apply re-checked
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
    /// <summary>True when the bridge recorded the result. Also Ghost Builder's (GhostChangesetBuild), with the same retry
    /// dialog.</summary>
    internal static bool Report(BcfConfig cfg, string key, string id, List<AppliedEntry> applied, List<string> rejected, string note)
    {
        while (true)
        {
            if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, out var err)) return true;
```

with

```csharp
    /// <summary>True when the bridge recorded the result. Also Ghost Builder's (GhostChangesetBuild), with the same retry
    /// dialog. MA-3a: <paramref name="reviewRev"/> is the changeset's review_rev Apply re-checked (Ghost Builder's own build sends none).</summary>
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
```

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                    if (!ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine)))
```

with

```csharp
                    // MA-3a (C2): the review_rev the filing reply carried (0) — a web decline that landed since is judged late, never unchecked.
                    if (!ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine), cs.ReviewRev))
```

- [ ] **Step 6: See it pass.** From the repo root: `dotnet run --project tools/promote-check` → `695/695 checks pass` (678 + section 40's 14 + section 41's 3); `dotnet run --project tools/session-check` → `47/47 checks pass` (it compiles `ChangesetClient.cs`). Then `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` → `0 Error(s)` (dry run: `5 Warning(s)`, all master's) and `-p:RevitVersion=2026` → `0 Error(s)` (`1 Warning(s)`); no warning names `ChangesetClient.cs`, `ChangesetReviewWindow.cs`, `Commands.ReviewChangesets.cs` or `GhostChangesetBuild.cs`.

- [ ] **Step 7: Commit.**

```bash
git add SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/UI/ChangesetReviewWindow.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/GhostBuilder/GhostChangesetBuild.cs tools/promote-check/Ma3aReview.cs tools/promote-check/Check.cs tools/promote-check/Ma2dWiring.cs
git commit -F - <<'EOF'
feat(addin): MA-3a - Review AI Proposals obeys the web desk: a declined ghost opens unticked and disabled with who declined it, the role and the reason (a web accept is advice, its pre-tick kept); Apply re-checks the fresh copies and refuses the whole Apply on a ticked ghost declined after the window opened (nothing created); the result carries the review_rev Apply re-checked (Ghost Builder's, the one its filing reply carried), and a late or unchecked decline the bridge recorded is said; the window says a Promote re-run proposes a declined ghost again, undecided; promote-check sections 40-41 read the shared fixture (695)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4 — Web: the review desk; the Modeling studio retired

**Files:**
- Create `WebApp/src/setups/review-desk.ts`, `WebApp/src/setups/review-desk.test.ts`
- Modify `WebApp/src/main.ts` (`:22`, `:247-249`, `:378`)
- Delete `WebApp/src/setups/model-panel.ts`

**Interfaces:**
- Consumes: the routes (Task 2), the fixture (Task 1); `bfetch`, `bwrite` (`bridge-fetch.ts`), `myRoleRead`, `roleWords` (`my-role.ts`), `activePid`, `onActiveProjectChange` (`active-project.ts`; a sign-in change re-reads through `refreshActiveProject`, `main.ts:347`), `SERVICE_URL`.
- Produces: `reviewDeskPanel(opts?: {baseUrl?: string}): HTMLElement` and the pure `storeyOf`, `whatOf`, `groupDesk`, `ghostLine`, `reviewWords`, `canDecide`, `canReopen`, `rowWords`, `postsFor` (C6), `readPending`, `postReview`, `postReopen`; the types `PendingChangeset`, `Ghost`, `GhostReview`.

- [ ] **Step 1: The failing tests.** Create `WebApp/src/setups/review-desk.test.ts`:

```ts
// MA-3a: the review desk groups what waits in Revit by storey and by what it does, says each web decision in words (a decline binds,
// an accept is advice), never sends a decline without a reason, and lets only a signed-in person decide (a lead re-open). The
// Modeling studio is retired: the desk takes its tab.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const { bfetch, bwrite } = vi.hoisted(() => ({ bfetch: vi.fn(), bwrite: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch, bwrite }));
vi.mock("./active-project", () => ({ activePid: () => "demo", onActiveProjectChange: () => () => {} }));

import { storeyOf, groupDesk, ghostLine, reviewWords, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset } from "./review-desk";

const fx = JSON.parse(readFileSync(new URL("../../bridge/fixtures/changeset-ops/ma3a-review.json", import.meta.url), "utf8"));
const after = fx.after as PendingChangeset;
const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const part = (name: string, created_at: string, kind = "wall", op = "retype"): PendingChangeset =>
  ({ ...after, id: name, name, created_at, elements: [{ ...after.elements[2], proposal_guid: name + "-g", kind, op }] });

describe("groupDesk — by storey, then by what the ghosts do", () => {
  it("a Promote storey's parts (i/n) are one storey; groups are per op and kind; storeys oldest first", () => {
    expect(storeyOf("Promote (DD) · GR-FFL (2/3)")).toBe("Promote (DD) · GR-FFL");
    expect(storeyOf("Promote (DD) · GR-FFL")).toBe("Promote (DD) · GR-FFL");
    expect(storeyOf("Core walls (a) (1/x)")).toBe("Core walls (a) (1/x)");
    const desk = groupDesk([part("Promote (DD) · 01-FFL", "2026-10-04T08:05:00Z"), part("Promote (DD) · GR-FFL (2/2)", "2026-10-04T08:01:00Z", "wall", "attach"),
      part("Promote (DD) · GR-FFL (1/2)", "2026-10-04T08:00:00Z")]);
    expect(desk.map((s) => [s.storey, s.changesets.map((c) => c.name), s.groups.map((g) => [g.what, g.ghosts.length])])).toEqual([
      ["Promote (DD) · GR-FFL", ["Promote (DD) · GR-FFL (1/2)", "Promote (DD) · GR-FFL (2/2)"], [["retype wall", 1], ["attach wall", 1]]],
      ["Promote (DD) · 01-FFL", ["Promote (DD) · 01-FFL"], [["retype wall", 1]]],
    ]);
    expect(groupDesk([after])[0].groups.map((g) => [g.what, g.ghosts.length])).toEqual([["retype wall", 2], ["attach wall", 1], ["set_parameter wall", 1]]);
  });
});

describe("words", () => {
  it("each ghost as Revit's row says it, shortened", () => {
    const [g1, g2, , g4] = after.elements;
    expect(ghostLine(g1)).toBe("W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm");
    expect(ghostLine(g2)).toBe("W 1 · GR-FFL → top 01-FFL");
    expect(ghostLine(g4)).toBe('Basic Wall : BDS_EXT_ARC_CMU_200 mm · FireRating "" → "60 min" (a type edit: it reaches every element of the type)');
    expect(ghostLine({ proposal_guid: "x", kind: "floor", place: { TypeName: "Generic 150mm", LevelName: "L1" } })).toBe("x · Generic 150mm · L1");
  });

  it("a decline binds, an accept is advice, a re-open is said; nobody decided is waiting", () => {
    const [g1, g2, g3] = after.elements;
    expect(reviewWords(g1)).toBe("declined by reviewer@example.com (contributor): wrong type: W 1 is a party wall — binds: Revit shows it unticked and refuses the tick");
    expect(reviewWords(g2)).toBe("accepted by reviewer@example.com (contributor) — advice: Revit still asks for the tick");
    expect(reviewWords(g3)).toBe("waiting — nobody decided on the web");
    expect(reviewWords({ ...g1, review: fx.reopened_review })).toBe("re-opened by lead@example.com (lead): party wall confirmed external by the client");
  });

  it("only a signed-in contributor or above decides, only a lead or owner re-opens; the machine credential never", () => {
    expect(["owner", "lead", "contributor"].every(canDecide) && !canDecide("viewer") && !canDecide("service")).toBe(true);
    expect(canReopen("lead") && canReopen("owner") && !canReopen("contributor") && !canReopen("service")).toBe(true);
    expect(rowWords({ ledger: { id: 1201, hash: "ab" } })).toBe("ledger #1201");
    expect(rowWords({ ledger: null })).toBe("the bridge named no ledger row");
  });

  it("one post per changeset; a ghost already in the decision's state is not sent, and counted (C6: a repeat would refuse the whole post)", () => {
    const [, g2, g3] = after.elements;
    const ticked = new Map([[g2.proposal_guid, { cs: after, el: g2 }], [g3.proposal_guid, { cs: after, el: g3 }]]);
    const a = postsFor(ticked, "accept");
    expect([[...a.posts], a.already]).toEqual([[["cs-ma3a", ["g-3"]]], 1]);
    const d = postsFor(ticked, "decline");
    expect([[...d.posts], d.already]).toEqual([[["cs-ma3a", ["g-2", "g-3"]]], 0]);
  });
});

describe("the bridge calls", () => {
  beforeEach(() => { bfetch.mockReset(); bwrite.mockReset(); });

  it("readPending asks for the proposed changesets; a failure is 'not read — …', never an empty list", async () => {
    bfetch.mockResolvedValueOnce(res(200, [after]));
    expect(await readPending("http://b/", "demo key")).toEqual([after]);
    expect(bfetch.mock.calls[0][0]).toBe("http://b/changesets/demo%20key?status=proposed");
    bfetch.mockResolvedValueOnce(res(403, { message: "not a member" }));
    await expect(readPending("http://b", "demo")).rejects.toThrow("not read — not a member");
    bfetch.mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(readPending("http://b", "demo")).rejects.toThrow("not read — Failed to fetch");
  });

  it("postReview sends one decisions[] for the ticked ghosts; a decline without a reason is never sent", async () => {
    await expect(postReview("http://b", "demo", "cs-ma3a", "decline", ["g-1"], "  ")).rejects.toThrow("a decline needs a reason — the ledger records it and Revit shows it");
    await expect(postReview("http://b", "demo", "cs-ma3a", "accept", [], "")).rejects.toThrow("tick a ghost first");
    expect(bwrite).not.toHaveBeenCalled();
    bwrite.mockResolvedValueOnce({ ledger: { id: 9, hash: "h" } });
    await postReview("http://b", "demo", "cs-ma3a", "decline", ["g-1", "g-4"], " wrong type ");
    expect(bwrite.mock.calls[0][0]).toBe("http://b/changesets/demo/cs-ma3a/review");
    expect(JSON.parse(bwrite.mock.calls[0][1].body)).toEqual({ decisions: [{ proposal_guid: "g-1", decision: "decline", reason: "wrong type" }, { proposal_guid: "g-4", decision: "decline", reason: "wrong type" }] });
    bwrite.mockResolvedValueOnce({ ledger: null });
    await postReview("http://b", "demo", "cs-ma3a", "accept", ["g-2"], "");
    expect(JSON.parse(bwrite.mock.calls[1][1].body)).toEqual({ decisions: [{ proposal_guid: "g-2", decision: "accept" }] });
  });

  it("postReopen needs a reason and names the ghost", async () => {
    await expect(postReopen("http://b", "demo", "cs-ma3a", "g-1", "")).rejects.toThrow("a re-open needs a reason — the ledger records it");
    bwrite.mockResolvedValueOnce({ ledger: { id: 10, hash: "h" } });
    await postReopen("http://b", "demo", "cs-ma3a", "g-1", "confirmed external");
    expect(bwrite.mock.calls[0][0]).toBe("http://b/changesets/demo/cs-ma3a/reopen");
    expect(JSON.parse(bwrite.mock.calls[0][1].body)).toEqual({ proposal_guid: "g-1", reason: "confirmed external" });
  });
});

describe("the Modeling studio is retired; the desk takes its tab (source scan)", () => {
  it("main.ts mounts the review desk where the Model tab was, and model-panel.ts is gone", () => {
    const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    expect(main).toContain('import { reviewDeskPanel } from "./setups/review-desk";');
    expect(main).toContain("const reviewEl = reviewDeskPanel({ baseUrl: SERVICE_URL });");
    expect(main).toContain('{ label: "Review", el: reviewEl },');
    expect(main).not.toContain("model-panel");
    expect(main).not.toContain('label: "Model"');
    expect(existsSync(new URL("./model-panel.ts", import.meta.url))).toBe(false);
  });
});
```

- [ ] **Step 2: See it fail.** From `WebApp`: `npx vitest run src/setups/review-desk.test.ts` → `Error: Failed to load url ./review-desk … Does the file exist?`, `Tests  no tests`.

- [ ] **Step 3: The desk.** Create `WebApp/src/setups/review-desk.ts`:

```ts
// review-desk — the web side of a changeset's review (MA-3a, design §6.6, founder decision D17). The ghosts waiting in Revit's
// review (GET /changesets/:key?status=proposed), grouped by storey (a Promote storey's parts, " (i/n)", as Revit's StoreyBatch
// groups them) and by what they do. A signed-in contributor accepts or declines the ticked ghosts — a decline needs a reason and
// BINDS: Revit shows it unticked with the reason and refuses the tick; an accept is advice. A signed-in lead re-opens a decline.
// POST /changesets/:key/:id/review and /reopen; the bridge holds the rules (the machine credential never reviews). A list that was
// not read says "not read — …", never that nothing waits. No 3D here: ghosts in the viewer are MA-3d.
import { bfetch, bwrite } from "./bridge-fetch";
import { myRoleRead, roleWords } from "./my-role";
import { activePid, onActiveProjectChange } from "./active-project";
import { SERVICE_URL } from "../config";

export interface GhostReview { state: "proposed" | "accepted" | "declined"; action: "accept" | "decline" | "reopen"; reason: string | null; by: string; role: string; at: string; rev: number; }
export interface Ghost {
  proposal_guid: string; kind: string; op?: string | null;
  target?: { unique_id?: string; type_before?: string } | null;
  place?: { TypeName?: string; FamilyName?: string; LevelName?: string; BaseLevel?: string; TopLevel?: string } | null;
  validate?: { identity?: { Name?: string } } | null;
  parameter?: string; from?: string; to?: string;
  review?: GhostReview | null;
}
export interface PendingChangeset { id: string; name: string; source: string; claimed?: boolean; status: string; created_at: string; review_rev?: number; elements: Ghost[]; }
export interface DeskGroup { what: string; ghosts: { cs: PendingChangeset; el: Ghost }[]; }
export interface DeskStorey { storey: string; changesets: PendingChangeset[]; groups: DeskGroup[]; }
export interface LedgerRef { id: number | null; hash: string | null; }

// Revit's StoreyBatch.Part: " (i/n)" at the end of a Promote storey's part (ASCII digits).
const PART = / \(([0-9]{1,4})\/([0-9]{1,4})\)$/;
/** A changeset's storey: its name without " (i/n)" (StoreyBatch.StoreyOf). */
export const storeyOf = (name: string): string => (name ?? "").replace(PART, "");

/** What a ghost does, as a group heading: "retype wall", "attach wall", "set_parameter wall", "create floor". */
export const whatOf = (el: Ghost): string => `${el.op ?? "create"} ${el.kind}`;

/** The pending changesets as the desk shows them: by storey (oldest first, a storey's parts together), then by what the ghosts do. */
export function groupDesk(pending: PendingChangeset[]): DeskStorey[] {
  const storeys = new Map<string, DeskStorey>();
  for (const cs of [...pending].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
    const key = storeyOf(cs.name);
    const s = storeys.get(key) ?? { storey: key, changesets: [], groups: [] };
    storeys.set(key, s);
    s.changesets.push(cs);
    for (const el of cs.elements ?? []) {
      let g = s.groups.find((x) => x.what === whatOf(el));
      if (!g) s.groups.push((g = { what: whatOf(el), ghosts: [] }));
      g.ghosts.push({ cs, el });
    }
  }
  return [...storeys.values()];
}

/** One ghost in words — Revit's review row, shortened: `W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm`. */
export function ghostLine(el: Ghost): string {
  const name = el.validate?.identity?.Name ?? el.proposal_guid;
  const type = (el.place?.FamilyName ? el.place.FamilyName + " : " : "") + (el.place?.TypeName ?? "?");
  switch (el.op) {
    case "retype": return `${name} · ${el.target?.type_before ?? "?"} → ${type}`;
    case "attach": return `${name} · ${el.place?.BaseLevel ?? "?"} → top ${el.place?.TopLevel ?? "?"}`;
    case "set_parameter": return `${type} · ${el.parameter} "${el.from ?? ""}" → "${el.to ?? ""}" (a type edit: it reaches every element of the type)`;
    default: return `${name}${el.place?.TypeName ? " · " + type : ""}${el.place?.LevelName ? " · " + el.place.LevelName : ""}`;
  }
}

/** The web desk's decision in words (Revit's ChangesetTrust.ReviewLine, from the desk's side); "waiting" when nobody decided. */
export function reviewWords(el: Ghost): string {
  const r = el.review;
  if (!r || (r.state === "proposed" && r.action !== "reopen")) return "waiting — nobody decided on the web";
  const who = `${r.by} (${r.role})`;
  if (r.state === "declined") return `declined by ${who}: ${r.reason} — binds: Revit shows it unticked and refuses the tick`;
  if (r.state === "accepted") return `accepted by ${who}${r.reason ? ": " + r.reason : ""} — advice: Revit still asks for the tick`;
  return `re-opened by ${who}: ${r.reason}`;
}

/** Who may accept or decline on the desk: a signed-in contributor or above. The machine credential ("service") never reviews (Q1). */
export const canDecide = (role: string): boolean => ["owner", "lead", "contributor"].includes(role);
/** Who may re-open a decline: a signed-in lead or owner. */
export const canReopen = (role: string): boolean => ["owner", "lead"].includes(role);

const at = (base: string, key: string, path = "") => `${base.replace(/\/$/, "")}/changesets/${encodeURIComponent(key)}${path}`;

/** GET /changesets/:key?status=proposed. Any failure throws "not read — <why>", never an empty list. */
export async function readPending(base: string, key: string): Promise<PendingChangeset[]> {
  let r: Response;
  try { r = await bfetch(at(base, key, "?status=proposed")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as PendingChangeset[] | { message?: string } | null;
  if (!r.ok || !Array.isArray(j)) throw new Error(`not read — ${(j as { message?: string } | null)?.message || (r.ok ? "the bridge answered without a list" : `HTTP ${r.status}`)}`);
  return j;
}

/** POST /changesets/:key/:id/review {decisions}. A decline with a blank reason is never sent; a refusal throws the bridge's words. */
export async function postReview(base: string, key: string, id: string, decision: "accept" | "decline", guids: string[], reason: string): Promise<{ ledger: LedgerRef | null }> {
  const why = reason.trim();
  if (!guids.length) throw new Error("tick a ghost first");
  if (decision === "decline" && !why) throw new Error("a decline needs a reason — the ledger records it and Revit shows it");
  return bwrite(at(base, key, `/${encodeURIComponent(id)}/review`), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisions: guids.map((g) => ({ proposal_guid: g, decision, ...(why ? { reason: why } : {}) })) }),
  });
}

/** POST /changesets/:key/:id/reopen {proposal_guid, reason} — a lead's. A blank reason is never sent. */
export async function postReopen(base: string, key: string, id: string, guid: string, reason: string): Promise<{ ledger: LedgerRef | null }> {
  const why = reason.trim();
  if (!why) throw new Error("a re-open needs a reason — the ledger records it");
  return bwrite(at(base, key, `/${encodeURIComponent(id)}/reopen`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_guid: guid, reason: why }),
  });
}

/** The desk's posts for the ticked ghosts: one per changeset (all or none on the bridge — a storey's parts are separate changesets),
 *  leaving out a ghost already in the state the decision leads to: a repeat is a 409 that would refuse its whole post (C6). */
export function postsFor(ticked: Map<string, { cs: PendingChangeset; el: Ghost }>, decision: "accept" | "decline"): { posts: Map<string, string[]>; already: number } {
  const target = decision === "accept" ? "accepted" : "declined";
  const posts = new Map<string, string[]>();
  let already = 0;
  for (const [g, x] of ticked) {
    if (x.el.review?.state === target) { already++; continue; }
    posts.set(x.cs.id, [...(posts.get(x.cs.id) ?? []), g]);
  }
  return { posts, already };
}

/** "ledger #1201" when the bridge named the row; else that it did not. */
export const rowWords = (r: { ledger: LedgerRef | null } | null): string => (r?.ledger?.id != null ? `ledger #${r.ledger.id}` : "the bridge named no ledger row");

/** The desk: plain DOM, re-read on a project or person change (main.ts → refreshActiveProject). */
export function reviewDeskPanel(opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;background:#16161a;color:#c9cfda;font:12px system-ui";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;overflow:auto;padding:.6rem";
  const status = document.createElement("div");
  status.style.cssText = "padding:.3rem .6rem;color:#93c5fd";
  root.append(bar, status, body);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", css = ""): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.style.cssText = css;
    return e;
  };
  const btn = (label: string, onClick: () => void) => { const b = el("button", label, "border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.35rem;padding:.25rem .55rem;font:600 11px system-ui;cursor:pointer"); b.onclick = onClick; return b; };
  const reason = el("input", "", "flex:1;min-width:10rem;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui");
  reason.placeholder = "Reason (a decline needs one; one line)";
  const ticked = new Map<string, { cs: PendingChangeset; el: Ghost }>();
  const say = (text: string, bad = false) => { status.textContent = text; status.style.color = bad ? "#fca5a5" : "#93c5fd"; };
  let seq = 0;

  const decide = async (decision: "accept" | "decline") => {
    // One post per changeset (all or none on the bridge); a ghost already accepted (or declined) is not sent again (C6).
    const { posts, already } = postsFor(ticked, decision);
    const skipped = already ? `${already} already ${decision === "accept" ? "accepted" : "declined"} — not sent` : "";
    if (!posts.size) return say(skipped ? skipped + "." : "Tick a ghost first.", true);
    const done: string[] = [];
    try {
      for (const [id, guids] of posts) done.push(`${guids.length} ${decision === "accept" ? "accepted" : "declined"} · ${rowWords(await postReview(base, activePid(), id, decision, guids, reason.value))}`);
      reason.value = "";
      say([...done, ...(skipped ? [skipped] : [])].join("; ") + (decision === "decline" ? " — Revit now shows them unticked with the reason and refuses the tick." : " — advice: Revit still asks for the tick."));
    } catch (e) { say(`${done.length ? done.join("; ") + "; then " : ""}not recorded — ${(e as Error).message}`, true); }
    void show();
  };

  async function show(): Promise<void> {
    const mine = ++seq, key = activePid();
    ticked.clear();
    body.replaceChildren(el("div", "Reading…"));
    const [role, pending] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e)]);
    if (mine !== seq) return;
    bar.replaceChildren(el("b", `Review desk · ${key}`), el("span", roleWords(role), "color:#8b93a1"));
    if (canDecide(role.role)) bar.append(reason, btn("Accept ticked", () => void decide("accept")), btn("Decline ticked", () => void decide("decline")));
    else bar.append(el("span", role.role === "service" ? "· sign in to accept or decline — the machine credential never reviews" : "· read-only: accepting or declining needs contributor", "color:#fbbf24"));
    if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5")); return; }
    if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project.")); return; }
    body.replaceChildren(el("div", "A decline binds: Revit shows the ghost unticked with your reason and refuses the tick. An accept is advice. A changeset stays proposed until Revit applies or declines it — a new Promote run proposes a declined ghost again, undecided.", "color:#8b93a1;margin-bottom:.5rem"));
    for (const s of groupDesk(pending)) {
      const box = el("details", "", "margin:.4rem 0;border:1px solid #2a2a30;border-radius:.35rem;padding:.3rem .5rem");
      box.open = true;
      box.append(el("summary", `${s.storey} — ${s.groups.reduce((n, g) => n + g.ghosts.length, 0)} ghost(s) in ${s.changesets.length} changeset(s)`, "cursor:pointer;font-weight:600"));
      for (const g of s.groups) {
        box.append(el("div", `${g.what} (${g.ghosts.length})`, "margin:.4rem 0 .2rem;color:#8b93a1"));
        for (const x of g.ghosts) {
          const row = el("div", "", "display:flex;gap:.4rem;align-items:flex-start;padding:.15rem 0");
          const tick = el("input");
          tick.type = "checkbox";
          tick.disabled = !canDecide(role.role) || x.el.review?.state === "declined";
          tick.onchange = () => { if (tick.checked) ticked.set(x.el.proposal_guid, x); else ticked.delete(x.el.proposal_guid); };
          const words = el("div", "");
          words.append(el("div", ghostLine(x.el)), el("div", reviewWords(x.el), `color:${x.el.review?.state === "declined" ? "#fca5a5" : x.el.review?.state === "accepted" ? "#86efac" : "#8b93a1"}`));
          row.append(tick, words);
          if (x.el.review?.state === "declined" && canReopen(role.role))
            row.append(btn("Re-open", async () => {
              try { say(`Re-opened · ${rowWords(await postReopen(base, key, x.cs.id, x.el.proposal_guid, reason.value))} — Revit may tick it again.`); reason.value = ""; }
              catch (e) { say(`not recorded — ${(e as Error).message}`, true); }
              void show();
            }));
          box.append(row);
        }
      }
      body.append(box);
    }
  }
  onActiveProjectChange(() => void show());
  void show();
  return root;
}
```

- [ ] **Step 4: See the desk's checks pass but the retirement's fail.** `npx vitest run src/setups/review-desk.test.ts` → `Tests  1 failed | 8 passed (9)` (the source scan: `main.ts` does not mount the desk yet).

- [ ] **Step 5: The tab; the studio retired.**

In `WebApp/src/main.ts`, replace

```ts
import { modelPanel } from "./setups/model-panel";
```

with

```ts
import { reviewDeskPanel } from "./setups/review-desk";
```

In `WebApp/src/main.ts`, replace

```ts
  // In-browser 3D Modeling studio — author walls/columns/slabs, transform-edit, measure + markup,
  // all on the shared OBC world. Built once so its authored geometry survives layout switches.
  const modelEl = modelPanel(components, { baseUrl: SERVICE_URL });
```

with

```ts
  // MA-3a: the review desk — what waits in Revit's review, by storey; a signed-in contributor accepts or declines (a decline binds
  // the Revit tick), a lead re-opens. It replaces the Modeling studio (retired: it skipped Governed Intake; its local sketches are
  // no longer shown).
  const reviewEl = reviewDeskPanel({ baseUrl: SERVICE_URL });
```

In `WebApp/src/main.ts`, replace

```ts
    { label: "Model", el: modelEl },
```

with

```ts
    { label: "Review", el: reviewEl },
```

Then `git rm WebApp/src/setups/model-panel.ts` (754 lines; its only importer was `main.ts`; `sentinel-core/ifc-writer.ts` stays for MA-3d).

- [ ] **Step 6: See it pass.** From `WebApp`: `npx vitest run src/setups/review-desk.test.ts` → `Tests  9 passed (9)`; `npx vitest run src` → `Test Files  55 passed (55)`, `Tests  484 passed (484)`; `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` → `18`, and `npx tsc --noEmit -p tsconfig.json 2>&1 | grep review-desk` prints nothing (the 18 are master's, listed in the dry-run note).

- [ ] **Step 7: Commit.**

```bash
git add WebApp/src/setups/review-desk.ts WebApp/src/setups/review-desk.test.ts WebApp/src/main.ts WebApp/src/setups/model-panel.ts
git commit -F - <<'EOF'
feat(web): MA-3a - the review desk (BIM tools > Review): the ghosts waiting in Revit's review, by storey and by what they do, each with its web decision in words; a signed-in contributor ticks and accepts or declines (a reason; one post per changeset), a lead re-opens; a list not read says so; the Modeling studio retired (model-panel.ts deleted - it skipped Governed Intake; local sketches no longer shown)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 5 — Words: the design doc; the final checks

**Files:**
- Modify `docs/strategy/2026-09-30-model-automation-design.md`

- [ ] **Step 1: The design doc says what was built.**

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| `changeset_reviewed` | Web desk decisions | For each ghost: accepted or declined, reason, reviewer, role | TARGET |
```

with

```markdown
| `changeset_reviewed` | Web desk decisions | For each ghost: accepted or declined, reason, reviewer, role | BUILT on `feature/ma3-review-desk` (MA-3a), drill MA3a pending: ONE row per desk post (one changeset, all or none — spec amendment S3), entity_type `changeset`, new value {review_rev, reviewer, role, decisions: [{proposal_guid, name, from, to, reason}]}; the decisions are also on the changeset doc (S1) |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| `changeset_reopened` | A lead re-opens a web decline | guid, reason, lead | TARGET |
```

with

```markdown
| `changeset_reopened` | A lead re-opens a web decline | guid, reason, lead | BUILT on `feature/ma3-review-desk` (MA-3a), drill MA3a pending: new value {review_rev, lead, role, proposal_guid, name, declined_by, declined_reason, reason} |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
**Review states, one per ghost** (in `changesets-logic.mjs`, with tests; TARGET, MA-3)
```

with

```markdown
**Review states, one per ghost** (in `changesets-logic.mjs`, with tests; BUILT on `feature/ma3-review-desk` (MA-3a), drill MA3a pending — `reviewNext`, `applyDecisions`, `reopenDecline`, `resultConflicts`: a ghost's `review` and the doc's `review_rev` on the changeset doc, every write swapping on `review_rev`; the machine credential never reviews; a result that applies a decline Revit had seen is refused, one declined after Revit's re-check is recorded as `applied_over_late_decline` and said, one applied by a result with no `review_rev` as `applied_over_decline_unchecked`; a decline binds its changeset only — a Promote re-run proposes the ghost again, undecided (carrying it forward is MA-3b); `ticked` is not stored in MA-3a — spec amendment S4)
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
- `POST /changesets/:key/:id/review` `{decisions[]}` (the web desk; follows the review states).
```

with

```markdown
- `POST /changesets/:key/:id/review` `{decisions[]}` (the web desk; follows the review states). BUILT (MA-3a): `{decisions: [{proposal_guid, decision: accept | decline, reason}]}`, a signed-in contributor or above; the machine credential is a 403 ("sign in").
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
- `POST /changesets/:key/:id/reopen` `{guid, reason}` (lead only).
```

with

```markdown
- `POST /changesets/:key/:id/reopen` `{guid, reason}` (lead only). BUILT (MA-3a) as `{proposal_guid, reason}` (spec amendment S2), a signed-in lead or owner.
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
- **LOD state, type gaps and review decisions:** ledger rows. The views are derived from the ledger, as the Holding Area is today.
```

with

```markdown
- **LOD state, type gaps and review decisions:** ledger rows. The views are derived from the ledger, as the Holding Area is today. MA-3a (spec amendment S1): a web review decision is also kept on the changeset doc (each ghost's `review`, the doc's `review_rev`), as `status` is — the add-in reads the doc, and the bridge judges a result against it in the same swap; the `changeset_reviewed` and `changeset_reopened` rows are the record (reserved on the open audit route). Migration 0037 (written; applied on the founder's "apply") leaves the `changeset` store no signed-in writer — the bridge writes it with the service key after its own role check, so a member cannot re-open a decline by writing the doc outside Sentinel.
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - The review states of section 6.6, in `changesets-logic.mjs`, with tests.
```

with

```markdown
  - The review states of section 6.6, in `changesets-logic.mjs`, with tests. BUILT on `feature/ma3-review-desk` (MA-3a), drill MA3a pending: the web review desk (BIM tools ▸ Review) lists, accepts, declines and re-opens; Revit's review obeys a decline.
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - The Modeling studio is retired.
```

with

```markdown
  - The Modeling studio is retired. BUILT (MA-3a): `model-panel.ts` deleted, the review desk takes its tab; sketches in a browser's local storage are no longer shown; `ifc-writer.ts` is kept for the proposal model.
```

- [ ] **Step 2: The final checks** (all from this branch, Tasks 1–4 applied). From `WebApp`: `npx vitest run` → `Test Files  143 passed (143)`, `Tests  2313 passed | 1 skipped (2314)`; restore `ids-cases.json` as in Task 2 Step 5. From the repo root: every check project —

```bash
for p in tools/*-check; do printf '%s: ' "$p"; dotnet run --project "$p" 2>&1 | tail -1; done
```

— each prints its pass line (`promote-check`: `695/695 checks pass`; `session-check`: `47/47 checks pass`; the other 24 as on `32605ca`). The add-in for every Revit version, none deployed:

```bash
for v in 2022 2023 2024 2025 2026 2027; do printf '%s: ' "$v"; dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Error\(s\)"; done
```

— each `0 Error(s)`; no warning names a file MA-3a touches (dry run: 2022 `3`, 2023 `3`, 2024 `5`, 2025 `1`, 2026 `1`, 2027 `3` warnings, all master's).

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -F - <<'EOF'
docs(design): MA-3a built on feature/ma3-review-desk, drill MA3a pending - the review states, the routes, the ledger rows, decisions on the changeset doc (spec amendments S1-S4), migration 0037 written (the changeset store bridge-only), the review desk, the Modeling studio retired

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Live drill MA3a (Revit 2024, a scratch copy, the test bridge, one founder session — on the branch, before the merge)

**The founder's OK first.** The set-up's build deploys the branch's add-in into Revit 2024. That needs the founder's explicit OK in chat for this drill; without it, nothing below runs and every row is **owed**.

**Who does what.** The drill runner drives Revit by mouse (or UI Automation's Invoke, as in MA2c–MA2e) and the bridge calls. **The founder** signs in — on the web desk (a signed-in person is the only one who can decline, F1) and, if the PC is signed out, in Revit (Standards ▸ Sign in; their password). Without the founder, only D-1 and D-5 run; D-2, D-3 and D-4 are **owed** and the merge waits (F6). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window. Open the scratch copy from Revit's Open dialog or Recent (MA2d D1).

**The Revit MCP in this drill:** only its read-only calls — `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`, `get_available_family_types` — and never while a Revit command, a TaskDialog or a Sentinel window is open. Switch it on again after each Revit start (MA2e D3).

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run (tight scope); the code is the same on net8/net10 and builds there (Task 5).
- **A second account** for D-4: if the founder has one account, the re-open is made by the same person as the decline (made lead) — the two-account half of D-4 (design `:1368`) is **owed**.
- **The published app**: the desk runs on a local dev server against 4101; the published app is the founder's publish after the merge (Merge).
- **A late decline applied over** (F2 A's recorded path, needs a decline to land inside Apply's seconds): proven offline (vitest, the shared fixture; promote-check's `LateDeclines`), not provokable on demand — owed, recorded if it happens.
- **Ghost Builder's own build** (it now sends its filing reply's `review_rev`, C2) and **a result with no `review_rev`** (`applied_over_decline_unchecked`): checked offline (vitest, promote-check) — not run.
- **Migration 0037 and its probe** (C1, F7): not part of the drill's rows; applied on the founder's "apply" with the deployment (F7 B) — owed at the merge unless the founder chose F7 A.

**Set-up (once):**
- **Build.** Close Revit. Record the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`, lower case). With the founder's OK: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build); record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The add-in's bridge settings.** Copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma3abak` beside it (never print it, never open it in a viewer); point it at the test bridge: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The test bridge on 127.0.0.1:4101**, running this branch's bridge (Tasks 1–2). From `WebApp`:
  - Probe which settings `config/.env` holds (names only, never a value):

    ```bash
    node -e 'import("./bridge/load-env.mjs").then(m => { const e = m.loadEnv(); for (const k of ["BCF_PORT", "BCF_EVENT_POLL_MS", "BCF_CORS_ORIGIN", "SUPABASE_ANON_KEY"]) console.log(k, k in e ? "is set in config/.env" : "is not in config/.env") })'
    ```

  - `BCF_PORT` set in `config/.env`: stop, and ask the founder (the drill does not edit `config/.env`). `SUPABASE_ANON_KEY` not set: a signed-in person's request cannot be forwarded — D-2 … D-4 are **owed** (F1 needs a signed-in person). `BCF_CORS_ORIGIN` set in `config/.env`: the desk's origin must be in it — ask the founder before D-2; otherwise the shell gives it below.
  - Start it in the background: `BCF_PORT=4101 BCF_EVENT_POLL_MS=0 BCF_CORS_ORIGIN=https://platform.thatopen.com,http://localhost:4002,http://127.0.0.1:4002 node bridge/bcf-service.mjs`. Its banner names port 4101, and `curl -s http://127.0.0.1:4101/health` answers. The founder's 4100 bridge is not touched.
  - Every bridge call of this drill names `http://127.0.0.1:4101`, through MA2e's helper (it reads the token through `load-env.mjs`; the machine credential):

    ```bash
    b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
    ```

- **The scratch web projects** (nothing on `demo`, `bds-office` or a real office): `b4101 POST cde/projects '{"key":"ma3a-office","kind":"office"}'`, `b4101 POST cde/projects '{"key":"ma3a","office_key":"ma3a-office"}'`; on the OFFICE: `b4101 PUT "cde/ma3a-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma3a-office/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json`, `b4101 PUT "cde/ma3a-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`, `b4101 PUT "cde/ma3a-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json` (each 201). Memberships, with the e-mails the founder gives (D2): `b4101 POST cde/ma3a/members '{"email":"<the founder account>","role":"contributor"}'` — always `contributor`, so D-2's `(contributor)` holds — and, for a second account, `'{"email":"<the second account>","role":"lead"}'`. Record each reply (it names the `user_id`). With one account, the founder's is made lead only just before D-4 (D-4's first step; its two-account half owed).
- **The web desk on port 4002**, the founder present. From `WebApp`, in its own shell (port 4000 stays the founder's): `VITE_SENTINEL_SERVICE=http://127.0.0.1:4101 npx thatopen serve --port 4002` (if `npm run dev`'s first step, `node scripts/build-fragments-worker.mjs`, has not run in this checkout, run it once first). The founder opens the local app as they open the 4000 one, on port 4002, signs in, picks project `ma3a`, opens BIM tools ▸ **Review**: the bar reads `Review desk · ma3a` and `your role: contributor` (or `lead`). If the platform's local-app route cannot load port 4002, or the desk's calls are refused (the bridge log names a refused Origin), stop: D-2 … D-4 are **owed** with that reason (UNSURE 1–2).
- **The scratch model**: `Documents\Sentinel drills\ma3a\ma3a-a.rvt`, a copy of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), opened from Revit's Open dialog, bound with Sentinel ▸ Project Setup to `ma3a` (current-project scope), never saved. Record the sign-in state found in Revit (Standards).

| Row | Steps | Pass when | Record |
|---|---|---|---|
| D-1 | On `ma3a-a.rvt`: Sentinel ▸ Promote (DD) → **Yes**. The review window opens: **close it** (the title bar's ×) — G4. `b4101 GET "changesets/ma3a?status=proposed"` | Closing writes nothing (the Undo list's top entry as before). The reply lists the GR-FFL changeset(s) (`Promote (DD) · GR-FFL`, or its ` (i/n)` parts), each `"review_rev":0`, no element with `review` | The changeset ids; three retype guids and their `W <id>` names; the attach guids and their names (D1: D-3's late decline needs a ghost D-2 does not decline); which rows the window had pre-ticked (signed in: the retypes and attaches; signed out: none — record which) |
| D-5 | The machine credential: `b4101 POST changesets/ma3a/<id>/review '{"decisions":[{"proposal_guid":"<a retype guid>","decision":"decline","reason":"drill"}]}'`; `b4101 POST changesets/ma3a/<id>/reopen '{"proposal_guid":"<the same>","reason":"drill"}'`; `b4101 GET changesets/ma3a/<id>` | `403 {"message":"accepting or declining a ghost on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)"}` and `403 … re-opening a declined ghost on the web desk is a signed-in person's — sign in …`; the changeset still `"review_rev":0`; no `changeset_reviewed` row (`b4101 GET "cde/ma3a/audit?entity_type=changeset&limit=5"`) | Both replies; the audit rows' actions |
| D-2 | The founder, on the desk: the storey `Promote (DD) · GR-FFL — <n> ghost(s) in <k> changeset(s)`, groups `retype wall (…)`, `attach wall (…)` …, every ghost `waiting — nobody decided on the web`. Tick the three retypes from D-1; reason `drill MA3a: wrong type`; **Decline ticked** | The status line `3 declined · ledger #<n> — Revit now shows them unticked with the reason and refuses the tick.`; after the re-read the three read `declined by <founder> (contributor): drill MA3a: wrong type — binds: …`; `b4101 GET changesets/ma3a/<id>`: those three `review.state` `declined`, `"review_rev":1`; the audit list's newest row `changeset_reviewed` naming the founder, the role and the three guids `from` `proposed` `to` `declined` | The ledger row id; the desk's text |
| D-3 | In Revit: Sentinel ▸ Review AI Proposals (the GR-FFL storey). Read the window; press **Tick suggested**; click a declined row's box. Then leave the window open; on the desk, decline a ghost D-2 did not decline that is ticked in Revit — an attach or a retype (D1; signed out: tick it in Revit first; reason `drill MA3a: late`); back in Revit, **Apply ticked in Revit** | The header `⚠ 3 ghost(s) declined on the web — shown unticked with the reason; they cannot be ticked here …` ending `— a new Promote run proposes a declined ghost again, undecided.` (C4); the three rows lead with `declined on the web by <founder> (contributor): drill MA3a: wrong type · a lead may re-open it on the web desk`, unticked, their boxes disabled (a click does nothing; Tick suggested leaves them unticked). At Apply ONE dialog: `1 ticked ghost(s) were declined on the web after this window opened:` / `· <attach or retype> wall "W <id>" — declined on the web by … drill MA3a: late …` / `Nothing was created. Run Review AI Proposals again: they open unticked, with the reason.`; the Undo list unchanged; `b4101 GET changesets/ma3a/<id>` still `"status":"proposed"` | The window's header and rows (text); the dialog; the Undo list before and after |
| D-4 | With one account (D2): first `b4101 PATCH cde/ma3a/members/<the founder's user_id> '{"role":"lead"}'` (the existing role-change route; record the reply `200 {"user_id":…,"role":"lead"}`) and re-read the desk (its bar reads `lead`). The lead (the second account, or the founder made lead): on the desk, the first declined retype ▸ reason `drill MA3a: re-opened` ▸ **Re-open**. A contributor account sees no Re-open button (read its rows). In Revit: Review AI Proposals; **Apply ticked in Revit** with the pre-ticks (Place anyway where asked) | `Re-opened · ledger #<n> — Revit may tick it again.`; the row reads `re-opened by <lead> (lead): drill MA3a: re-opened`; in Revit that row is enabled and (signed in) pre-ticked again, reading `re-opened on the web by <lead> (lead): …`, the other three declined rows as in D-3; the result `Applied <a> element(s) …`; `b4101 GET changesets/ma3a/<id>`: `"status":"partially_applied"`, `result.declined_on_web` the three still declined (with the web's reasons), `result.review_rev_seen` `{"value":<the revision Revit re-checked>,"claimed":true}`, `applied_over_late_decline` and `applied_over_decline_unchecked` both `[]`; the audit rows `changeset_reopened` (naming the lead, who declined it and why) and `changeset_applied` (naming the Revit actor) | The ledger ids; the result dialog; whether the re-open and the decline were two accounts (else owed) |

The rows run in the order D-1, D-5, D-2, D-3, D-4 on the same copy.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA3a — the binding web decline, live (<date> ~hh:mm → hh:mm local, branch feature/ma3-review-desk <sha>, Claude driving Revit 2024, the founder on the desk)`: the Setup paragraph (deploy on the founder's OK with the DLL sha before and after, settings at 127.0.0.1:4101, the scratch office and project, the memberships, the sign-in states, the desk's port, the scratch copy, not saved), the table `| Row | Result | Evidence |` with **pass**/fail, the dialogs' and the desk's text quoted, plus ledger `#n`; then D-amendments, F-MA3a-n findings each fixed on the branch ("fix(drill MA3a): …" with its check) and their shas, and the **owed** rows at its end.

**Closing list:**
- close Revit without saving the scratch copy;
- stop the desk's dev server on 4002; the founder's 4000 server is not touched;
- return the sign-in to the state found before the drill (the founder);
- stop the test bridge on 4101;
- restore the add-in's bridge settings: copy `bcf-config.json.ma3abak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, and record the deployed DLL's sha256 beside the hash recorded before. If the session's permission check refuses that build, say so: the branch's add-in stays until the merge's deploy — safe: master's 4100 bridge ignores the result's `review_rev`, and with no `review` on its changesets the branch's add-in behaves as master's;
- list what the drill left on the shared ledger — the scratch office `ma3a-office` (`guideline@1`, `type_catalog@1`, `lod_matrix@1`, `ruleset@1`), the project `ma3a`, the memberships, the changesets and their rows — left in place on purpose (scratch keys);
- list what the drill left on this PC outside the repository: `%AppData%\Sentinel\cache\ma3a*` (deleted: scratch keys only), the scratch copy in `Documents\Sentinel drills\ma3a\` (kept, named, as evidence; never committed).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record — D-3 is never owed at the merge: without it nothing proves the binding live (F6), and the merge waits for the founder's session;
- each F-MA3a-n fix is committed on the branch with its check, and Task 5 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does was deployed and its row run again live before the merge; a row whose fix was not run again is **owed**, not passed;
- D-3 passed: a declined ghost could not be ticked, and a decline made after the window opened refused the Apply with nothing created. If anything was created, nothing is merged;
- D-5 passed: the machine credential's decline and re-open were 403s and the doc was unchanged. If either landed, nothing is merged;
- migration 0037's probe (C1): either it passed live (`PROBE 0037: 3 of 3 as expected.` and every row of its first query true, recorded in the migration's header) or it is named **owed** in the drill record and the merge message — and then the web app's publish waits for the apply (Deployment).

**The design doc says what the drill proved**, committed on the branch before the merge: replace every `BUILT on \`feature/ma3-review-desk\` (MA-3a), drill MA3a pending` with `LANDED in MA-3a (merge <date>), drill MA3a: <passed rows; owed rows>` — `git commit -m "docs: MA-3a - drill MA3a's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma3-review-desk -F - <<'EOF'
Merge feature/ma3-review-desk: MA-3a - a binding web decline (design 6.6, founder decision D17): the review states per ghost on the changeset doc (review, review_rev - spec amendment S1) and one changeset_reviewed / changeset_reopened ledger row per post; POST /changesets/:key/:id/review (a signed-in contributor; a decline needs a reason) and /reopen (a signed-in lead); the machine credential never reviews (403, sign in - F1); every changeset write swaps on review_rev with the service key, so a web decision is never lost under a result or a withdraw (three lost swaps a 503); migration 0037 leaves the changeset store no signed-in writer (review amendment C1; <applied, probe 3 of 3 | owed - the publish waits for it>) and the two rows are reserved on the open audit route (C5); a result that applies a decline Revit had seen is refused, one declined after Revit's re-check is recorded as applied_over_late_decline and said, one with no review_rev as applied_over_decline_unchecked (F2, C2); Review AI Proposals shows a declined ghost unticked and disabled with who, the role and the reason, keeps an accept as advice, and refuses the whole Apply on a decline that landed after the window opened (nothing created); the web review desk (BIM tools > Review) lists the ghosts by storey and kind, accepts, declines and re-opens; the Modeling studio retired. Drill MA3a: <the result and the owed rows>. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order** (an add-in before MA-3a ignores `review`, so a web decline binds only in an MA-3a add-in — the add-in goes before the desk is published; and a bridge before MA-3a forwards a signed-in person's changeset writes, which 0037 refuses — the bridge goes before the migration, C1):
1. **The bridge — the founder restarts the 4100 bridge** on master (`changesets-logic.mjs`, `changesets-store.mjs`, `cde-store.mjs`, `bcf-service.mjs` changed; no bundle rebuild). It writes every changeset doc with the service key, so it is safe on either side of 0037. An older add-in keeps working against it: its result has no `review_rev` (never refused; a decline it applied is recorded as `applied_over_decline_unchecked`).
2. **Migration 0037 — the founder's "apply"** (C1; skip when F7 A applied it already): the controller applies `0037_changeset_bridge_only.sql`, runs `probes/0037_probe.sql`, writes the result into the migration's header (as 0034's) and commits it. Never before step 1.
3. **The add-in**, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same for each other Revit version the founder uses.
4. **The web app — the founder's publish** (`npm run publish`), only after step 2: until then the published app keeps its Model tab and nobody declines on the web, so no published desk offers a decline a member could still undo outside Sentinel.

## UNSURE facts this drill settles

1. Whether the platform's local-app route loads a dev server on port 4002 (the founder's runs on 4000) and which Origin the desk's calls carry to 4101 (an opaque frame sends `Origin: null` with the platform's Referer — accepted when `https://platform.thatopen.com` is in `BCF_CORS_ORIGIN`). D-2's set-up; if not, D-2 … D-4 are owed with the reason.
2. Whether `thatopen serve` takes `VITE_SENTINEL_SERVICE` from the shell over `WebApp/.env` (Vite keeps an existing process variable). The desk's calls reach 4101: the test bridge's log shows them.
3. Whether a disabled WPF `CheckBox` row still shows its label's tooltip in Revit 2024 (cosmetic: the row's text leads with the decline either way). D-3.
4. Whether the founder's 4100 bridge, if it runs from this working tree, loads the branch's `changesets-store.mjs` on its first changesets call (the route imports it dynamically). Compatible either way: the branch's store reads a doc without `review_rev` and a result without it. Checked in the bridge log after the drill, never by a write to 4100.

## Risks (each a ceiling stated in words)

- **An add-in before MA-3a ignores `review`**: in it a web decline does not bind. Its result has no `review_rev`, so the bridge records any decline it applied as `applied_over_decline_unchecked` (C2 — never "late", which would be a guess) and the desk shows the result; the deployment order puts the add-in before the desk's publish. A script holding `BCF_TOKEN` can do the same: recorded and named on the row, never refused (the elements are already placed).
- **A decline binds its changeset.** A Promote re-run re-proposes the same ghost undecided and pre-ticked; carrying a decline forward by (`target.unique_id`, `op`, `place.TypeName`/`to`) is MA-3b (C4). The window's header and the desk say so.
- **Until migration 0037 is applied** a project member can still write a changeset doc outside Sentinel (straight through Supabase) and so undo a decline; the web app's publish waits for the apply (Deployment, C1). The hole predates MA-3a (any doc field was writable); 0037 closes it.
- **The window is a snapshot.** A decline after it opened is caught at Apply on the fresh copies — the whole Apply is refused, said; the person opens the review again (the ticks are lost: the window closes on Decide, audit `:345` — MA-3b keeps it open).
- **A decline inside Apply's seconds** (after the re-check, before the report) is applied and recorded as late, said in Revit and on the row (F2 A). A Revit "ticked" lock is Next.
- **The desk reads every proposed changeset at once** (at most 200 ghosts each, no paging) and re-reads after each post; a project with hundreds of pending changesets is slow to draw.
- **One person, two roles**: with one account the drill's decline and re-open are the same person; the two-account row stays owed until a second account exists (design `:1368`).

## Next (out of scope here)

- **MA-3b — the Revit desk that does not wait** (Revit only): AI-5's picker of every pending changeset (age, source, verdict counts; a Promote storey as one entry); rows grouped by storey and kind with tick/untick per group; a reason per decline in Revit (the result's optional `reasons {guid: text}`, stored beside `declined_on_web`); the window open until the report lands ("Declined — reported (ledger …)"); zoom to row (`App.Events.SelectAndShow` for a target, `ZoomAndCenterRectangle` for a create); AI-2 — Apply and the report off the UI thread with no `GetResult`, the guard held until the report lands, an "applied, unreported" record in a local file per document retried on the next open; a Revit "ticked" lock (F2 C, S4); a decline carried forward to a Promote re-run — a ghost with the same (`target.unique_id`, `op`, `place.TypeName`/`to`) as a declined one opens declined, with the decline's words (C4).
- **MA-3c — the ghost overlay** (Revit only): a pure `GhostOverlayGeometry` and a `DirectContext3D` server registered at `Open` and removed through an ExternalEvent on `Closed`; a tick highlights; no transaction; builds 2022–2027; drill MA3 row 1; GHB-4's preview reuses it.
- **MA-3d — web highlights and the proposal model**: the one-hour spike (does a bridge-made `.frag` load and colour as its own model in fragments-beta 3.5.9; the coordinate frame); Promote ghosts highlighted by `target.ifc_guid` (sent by the add-in) in the newest published version with "model version X; Revit may be newer"; creates through an extended `ifc-writer.ts` with the `Sentinel_Evidence` pset, served as `proposal.frag`; drill MA3 rows 2 and 4. `PointCloudLoader`/`SplatLoader` wait for MA-4's evidence; the IDS cross-check is dropped (`ids.ts` judges).
- Owed rows carried: Revit 2025–2027 for the review, D-4's second account, the late-decline path live; and from MA2e — Revit 2025–2027 for Annotate, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy.
