# MA-3b2 — a reason per declined ghost, zoom to row, and the bridge's failures in plain words Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first entry of the MA-3b plan's "Next" (`docs/superpowers/plans/2026-10-04-ma3b-revit-review-no-wait.md` ▸ Next ▸ MA-3b2), as one drillable slice, and the drill MA3b2:
- **A reason per declined ghost in Revit.** Each group of the review window ("retype wall (24)") has one reason box. On Apply or Decline all, its reason is recorded for that group's unticked rows — the result's optional `reasons {proposal_guid: text}`. The bridge validates each (a key the result rejects; one line of at most 500 characters — the web desk's rule), stores them on the result beside `declined_on_web` and puts them on the `changeset_applied` ledger row. The window says how many the bridge kept, counted from its reply (claimed vs verified). A result kept on this PC keeps its reasons, so one sent again later carries them.
- **Zoom to row.** Each row has **Show**: a retype's or attach's element is selected and shown (`App.Events.SelectAndShow`, a new overload by UniqueId that says when the element is gone); a create zooms the active view to where it would be placed (`UIView.ZoomAndCenterRectangle` around its place); a type edit has no place in the model — its Show is disabled and says so. No transaction, no bridge call.
- **The bridge's failures in plain words** (drill MA3b's finding: `Couldn't reach the bridge: A task was canceled.`). The changeset client says a timeout as `the bridge did not answer within 8 s` (reads) or `… within 120 s` (writes), and a connection that failed by its cause — once, where the words are made, so the picker, Apply's re-check, the role check, Promote and Ghost Builder all say it.
- **Drill MA3b2** — short: Revit 2024, one scratch copy of the B35 seed, the test bridge behind a small drill proxy on `127.0.0.1:4101`, no web rows (Z-1 … Z-4). Z-4 carries MA3b's owed rows: **C8 live** (an Undo while a report waits → `changeset_reverted`) and **the report's own hold**.

**Source of truth:** `docs/superpowers/plans/2026-10-04-ma3b-revit-review-no-wait.md` ▸ Next ▸ MA-3b2 and its review amendments C1–C16; `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` ▸ `## Session MA3b` (the wording finding, R-A2, the owed rows); `docs/strategy/2026-09-30-revit-addin-audit.md` — AI-5 (`:355`), AI-2 (`:352`); `docs/strategy/2026-09-30-model-automation-design.md` — MA-3, Revit side (`:1106`). Base: `feature/ma3b2-decline-reasons` at master `b6772e9` (MA-3b merged). Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight, as the founder asks — one drillable slice):** the bridge's `reasons` (validate, store, ledger row), the window's reason boxes and Show, the reasons on every report of the review, the plain words. Left to **Next** with reasons: MA-3b2b (Revit's reasons shown on the web desk — it needs a new "recently decided" section, web rows and a That Open publish), a reason box per row, MA-3b3, MA-3b4, MA-3c/d.

**Architecture:**

*Bridge (vitest).* A pure `resultReasons(rejectedGuids, reasons)` in `changesets-logic.mjs` reuses `reasonOf`; `changesets-store.mjs reportResult` reads `reasons` from the body, validates it inside the `rewrite` callback (before anything is written), stores `result.reasons` when there is one and adds it to the `changeset_applied` row. The shared fixture `fixtures/changeset-ops/ma3a-review.json` gains `revit_reasons` (the body, what is stored, and the one-line rule), read by vitest and by promote-check.

*Pure (add-in, promote-check §44).* In `ChangesetTrust`: `DeclineReason(text, out problem)` (the bridge's rule, held in the window before Apply), `ReasonsLine(reply, sent)`, `BridgeWords(err | exception, seconds)`, `PlaceBox(place)`, `NoPlace`, `GhostName` made public. `ChangesetClient.ResultBody(…, reasons)` builds the result's body; `ReportResult` gains an optional `reasons`. `UnreportedResults.Record.Reasons`; `UnreportedResults.Outcome` reads its error through `BridgeWords`. `StoreyBatch.Own(cs, reasons)` splits a storey's reasons per changeset.

*Revit (scans §45; the drill).* `ChangesetReviewWindow`: a reason box on its own row in each group (C4), read-only from the press (C2), refused when it has no unticked row to go with (C3); `DecideRequested` carries the reasons map, `ShowRequested` per row, `Shown(words)` on its own line. `ReviewChangesetsCommand`: `Decide` takes the reasons, `ResultOf` puts each changeset's own on its record, `ReportAll` sends `r.Reasons` and says `ReasonsLine`; `window.ShowRequested` runs the zoom through `App.Events`. `RevitEventHub.SelectAndShow(doc, uniqueId, said)`.

**Tech Stack:** C# add-in (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF built in code); the offline check `tools/promote-check`; the Node bridge (ESM, vitest 2).

## Global Constraints

- Branch `feature/ma3b2-decline-reasons` (it holds this plan, on `b6772e9`); merge `--no-ff` into master only after every task's checks pass **and the live drill MA3b2 is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **No network call on Revit's API thread, and no wait for one in the review**: no `GetAwaiter().GetResult()` and no `.Wait(` in `Commands.ReviewChangesets.cs` (§43 still scans it); no new HTTP call — `Ma2dWiring` still counts 4 `() => Req(` and 3 GET sends; Show makes no bridge call.
  - **Nothing MA-3b holds is loosened**: the record before the send, one Apply per window, the guard (`Hold();` three times, `Release();` three times), `window.Say(` three times in the command — Show speaks through `window.Shown`, never the status line that holds the result.
  - **A result Revit applied is never refused for a reason the window accepted** (C8): the window holds the bridge's rule (one fixture — `ChangesetTrust.DeclineReason` against the bridge's `reasonOf`) and refuses *before* Apply what the bridge would refuse; every reason sent is for a ghost the result rejects (`StoreyBatch.Own`). A 400 on `reasons` is a bug, and it loses the record (Risks).
  - **Claimed vs verified.** The window counts the reasons the bridge's reply holds, never the ones it sent.
  - **Words are said, never silent.** Every Show says what it did or why it could not; a bridge that kept fewer reasons than were sent is said; a reason with no unticked row to carry it is refused in words (C3); a reason box cannot be typed in once its reasons were taken (C2).
  - **Never a guess.** "The bridge did not answer" is said only of a request that timed out — never of a sign-in that failed before the bridge was asked (C1).
  - **The bridge holds the rule** (one line, at most 500 characters, a key the result rejects); the add-in re-checks it.
  - **Every Revit write stays inside one TransactionGroup per Sentinel action (XC-2)**: Show writes nothing (a selection and a zoom); the placement event is unchanged.
  - **No new database table, no migration, no web change.**
- After the add-in task, the builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false` for 2022–2027. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (net48 has only `System`, `System.Collections.Generic`, `System.Linq` as global usings).
- Checks: from `WebApp`, `npx vitest run <files>`; from the repo root, `dotnet run --project tools/promote-check`. A full vitest run rewrites `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with LF only: when `git diff --ignore-all-space --stat` on it is empty, `git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by source scans and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100; never publish to the That Open platform.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never print the founder's e-mail address; never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (this session's attribution line; the planner's brief named another model — see "Not settled").
- Line numbers are `b6772e9`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs. A new file may be written with LF (git normalises it).

**Dry run (planner, 2026-10-04).** A detached worktree of `feature/ma3b2-decline-reasons` at `b6772e9` in the session's scratchpad (`scratchpad/ma3b2/dry`, `WebApp/node_modules` linked in as a junction; removed afterwards — never the repository). The brief asked for Tasks 1–2; **all four tasks** were applied, in order, **from this document's code blocks** (a script holds each block once; it applied them — each replace matched its text exactly once — and wrote them into this plan), each task's "see it fail" run made before its code and its "see it pass" run after. The totals in the steps are those runs':
- Base, measured first: the three changeset vitest files `3 passed (3)` files, `167 passed (167)`; `promote-check` `738/738` (the brief said 695/695 — that was before MA-3b's two reviews).
- Task 1: `2 failed | 1 passed (3)` files, `6 failed | 167 passed (173)` (`TypeError: resultReasons is not a function`) → `3 passed (3)`, `173 passed (173)`; `vitest run bridge` `91 passed (91)` files, `1860 passed | 1 skipped (1861)`; `src/setups/review-desk.test.ts` (it reads the same fixture) `10 passed (10)`; `ids-cases.json` rewritten LF-only with no other change and restored.
- Task 2: `promote-check` does not compile (`CS0117: 'ChangesetTrust' does not contain a definition for 'DeclineReason'`, and `CS0122` on `GhostName`) → `747/747 checks pass`; `session-check` `47/47`.
- Task 3: `742/753 checks pass` (the 5 rewritten scans of §39/§41/§43 and the 6 of §45 fail on the old code) → `753/753 checks pass`; builds 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — master's own counts, none in a file MA-3b2 touches.
- Task 4 (final): the full `npx vitest run` `143 passed (143)` files, `2325 passed | 1 skipped (2326)`; all 26 check projects: the 25 that count `2370/2370` (master 2355 + 15), `datum-check` `DATUM OK`.
- The drill's proxy script (set-up) was run against a stand-in on 4102: a plain POST passed through, a `slow` POST `…/result` was delayed, a `slow` GET was not, `silent` answered nothing.
- Not run: the drill (Revit and the founder) and the commit commands.

**Dry run again (amender, 2026-10-04, after the review amendments C1–C13).** The same kind of detached worktree at `4580361` (`scratchpad/ma3b2/dry`, `WebApp/node_modules` as a junction; removed afterwards). A script read **this document's own code blocks** (`Create` / `In <file>, replace … with`) and applied them step by step — 56 blocks, each matched its text exactly once — with each "see it fail" run before the code and each "see it pass" run after:
- Task 1: `2 failed | 1 passed (3)` files (the failed-test count line was not re-read; the test count is unchanged, 6 new) → `3 passed (3)`, `173 passed (173)`; `vitest run bridge` `91 passed (91)` files; `src/setups/review-desk.test.ts` `1 passed (1)` file; `ids-cases.json` restored.
- Task 2: `promote-check` does not compile (`CS0117` on `DeclineReason`, `ReasonsLine`, `BridgeWords`, `PlaceBox`, `NoPlace`, `MaxReason`, `ReasonRule`, `ResultBody`, `Record.Reasons`; `CS0122` on `GhostName`) → `747/747 checks pass` (C1's cases sit inside §44's existing check: still 9); `session-check` `47/47`.
- Task 3: `740/753 checks pass` (13 fail: 7 older checks whose quoted lines change — C2 adds two of §43's — and §45's 6) → `753/753 checks pass`; builds with `-p:DeployToRevit=false`: 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` (`ActiveGraphicalView`, the `DockPanel` row and `Reasons(bool)` compile on net48, net8 and net10).
- Task 4: the full `npx vitest run` `143 passed (143)` files, `2325 passed | 1 skipped (2326)`; all 26 check projects: the 25 that count `2370/2370`, `datum-check` `DATUM OK`.
- The amended proxy (C5), with `SLOW_MS=1500` against a stand-in on 4102: a plain POST `…/result` passed at once; with `slow`, a GET passed at once, the first POST `…/result` took 1.5 s, the second passed at once; `silent` answered nothing.
- Not run: the drill and the tasks' commit commands.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts; **F4 changes the entry's words and wants the founder's confirmation before the merge.**

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | Where a reason is typed | **A:** one reason box per group; it is recorded for each of that group's unticked rows. **B:** a box on every row | **A** — a storey has 48 rows; a reviewer declines by group ("these tops stay unattached"). Stored per ghost either way, so B can come later with no contract change |
| F2 | Decline all (nothing ticked) | **A:** the note is still required, as R-4 proved; group reasons are extra. **B:** a reason in every group also satisfies it | **A** — the smallest change; MA-3b's words and R-4 stay true |
| F3 | A reason Revit sends for a ghost the web also declined | **A:** kept in `result.reasons`, beside the web's in `declined_on_web`. **B:** the bridge refuses the result (400) | **A** — the window never sends one for a row it shows declined; the only way one arrives is a web decline that landed while the report was on the way, and B would then refuse a result Revit already applied (its elements in the model, nothing on the ledger) |
| F4 | "Shown on the web review desk" (the entry's words) | **A:** not in this slice: the desk lists only *proposed* changesets, and a changeset leaves it the moment Revit reports. The reasons are on the stored result (`GET /changesets/:key/:id`) and on the `changeset_applied` ledger row; showing them is MA-3b2b. **B:** build a "recently decided" section now (a second read, web rows, a That Open publish) | **A** — B is a web slice with its own drill, against "MA-3b is Revit-only: no web rows" |
| F5 | Where the plain words are made | **A:** in the changeset client's four `catch` lines, so every caller says them (the picker, Apply's re-check, the role, Promote, Ghost Builder, the report). **B:** only at the picker's line | **A** — one place; no caller changes |
| F6 | Show on a create | **A:** zoom the active view to the rectangle around its place; the words name the view and say a plan of its level shows it best. **B:** find and open a plan view of its level | **A** — B opens views the person did not ask for; a view that cannot be zoomed is said |

## Amendments to the spec's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (the entry, "shown on the web review desk").** Not built here (F4 A): the desk reads only proposed changesets (`review-desk.ts readPending`), so a reported one has no surface. MA-3b2 stores the reasons and puts them on the ledger row; MA-3b2b shows them.
- **S2 (the entry, "a reason per declined ghost in Revit").** Typed once per group, stored per ghost (F1 A).
- **S3 (the entry, "the bridge validates each key is in `rejected`" and the scout's "refuse a reason on a web-declined ghost").** A key must be a ghost the result rejects; one the web also declined is kept, not refused (F3 A).
- **S4 (the entry, "App.Events.SelectAndShow for a target").** A new overload by UniqueId that says its outcome; the id overload stays silent for its three callers. A `set_parameter` targets a type: no Show.
- **S5 (the entry, "the bridge did not answer within N s").** Said by the client for every caller (F5 A), N from the client's own timeouts (8 s reads, 120 s writes); a connection that failed says `the connection failed — <the cause>` instead of `An error occurred while sending the request.`
- **S6 (the scout, "the rolled-back path sends no reasons").** **Overridden by C14.** Was: kept: when Revit rolls the storey back, every ghost is rejected by Revit, not by the reviewer; the note carries the reviewer's note as before.

## Review amendments (BINDING — the critic's review of `4580361`, 2026-10-04; each is also written into the task text it changes, and where the two differ the amendment wins)

No critical finding. C1–C6 important, C7–C13 minor; none rejected.

- **C1 (Task 2 — never a guess).** `BridgeWords` said "the bridge did not answer" of any message holding "canceled" — also of a sign-in refresh that timed out before the bridge was asked (`UserSession.cs:152`, `:177`: `session not refreshed — retrying (Supabase not reached: A task was canceled.)`). Binding: `BridgeWords(Exception ex, int seconds)` ends `: string.IsNullOrWhiteSpace(ex?.Message) ? "the bridge did not answer" : ex.Message` — never the string overload; the string overload rewrites only a **whole-message** timeout (`"A task was canceled."`, `"The operation was canceled."`, or one that starts `The request was canceled due to the configured HttpClient.Timeout`). §44 checks the session's words pass unchanged through `BridgeWords(Exception)` and do not read "the bridge did not answer" through `UnreportedResults.Outcome` (this also narrows master's own heuristic there).
- **C2 (Task 3 — a reason typed after Apply was silently dropped).** The reasons are taken at the press. Binding: `Applying` sets `IsReadOnly = true` on every reason box and `Reopen` sets it back (`Reasons(bool)`). The amender adds the same at the press itself (`Decide`, beside `_go.IsEnabled = false`), undone by `Refused` when nothing was applied — the re-check is the same gap, a few seconds earlier. §45 scans all four.
- **C3 (Task 3 — a reason with no row to carry it was silent).** Binding: in the window's `Decide`, a group with a reason and no row that is unticked and may be ticked here (none unticked, or every unticked one declined on the web) is refused before anything is sent: `The reason for "<group>" has no unticked row to go with — untick the rows it is for, or clear it. Nothing was sent.` §45 scans it; Z-2 presses it; the Risk bullet is gone.
- **C4 (Task 3 — the reason box did not fit the bar).** Binding: the reason is on its own row under the buttons — a `DockPanel` (`whyRow`), the label docked left, the `TextBox` filling, no fixed `Width` — added to `body` between `bar` and `groupRows`. §45 pins `MaxLength = ChangesetTrust.MaxReason`, not a width.
- **C5 (drill — Z-4's 60 s was too short).** Binding: the proxy's delay is 95 s by default (`SLOW_MS`, under the 120 s write timeout) and it delays **only the first** `POST …/result` it sees while `slow` is set (`let slowed = false`), so a storey filed as several parts waits once. Z-4's report arrives 90–115 s after Place anyway.
- **C6 (drill — Z-2 could poison Z-4).** Binding: Z-2 declines the first group after `retype wall` whose header does not start with `set_parameter` (a type edit; prefer `attach`). If only type edits follow, 3 rows of `retype wall` are unticked by hand and the reason goes in that group's box.
- **C7 (Task 1 — a test that asserted nothing when nothing threw).** Binding: a `thrown(f)` helper and `toMatchObject({ status: 400 })`.
- **C8 (Global Constraints — the invariant overstated).** Binding: reworded as above ("…never refused for a reason the window accepted… a 400 on `reasons` is a bug, and it loses the record"). No bridge change.
- **C9 (Task 1 — a ghost keyed `__proto__` would lose its reason).** Binding: `resultReasons` collects into `Object.create(null)` and returns `{ ...out }`; one assertion pins it.
- **C10 (Task 3 — the create zoom in a non-graphical view).** Binding: `uidoc.ActiveGraphicalView` for the id and the name, null-checked, with the "cannot be zoomed" words. §45 follows.
- **C11 (drill — Z-1 rested on a screenshot).** Binding: Z-1 also records the Properties palette's type selector after Show; if it does not show one wall (`Walls (1)`), the row fails.
- **C12 (drill — the closing list's master rebuild is a deploy).** Binding: it runs only under the founder's same explicit OK; otherwise the stated fallback.
- **C13 (Next — MA-3b2b).** Binding: Revit's reasons are free text — rendered as text (`textContent`), never as HTML.

**After the build — three reviews of `4e3cd47` (2026-10-04). C14 and C16 important, the rest minor.**

- **C14 (a rolled-back Apply dropped the reviewer's reasons without a word — overrides S6).** The rows the reviewer unticked were declined by the reviewer, the window showed their reason as taken, and a rolled-back changeset is rejected for good. Binding: the rolled-back result carries `StoreyBatch.Own(f, reasons)` (every key an unticked ghost, which the result rejects), so `ReasonsLine` says what the bridge kept. §45 scans it and that no result of the review passes `null` for its reasons.
- **C15 (a result the bridge had already taken said nothing of its reasons).** `taken ?? $"…" + ReasonsLine(…)`: `+` binds tighter than `??`. Binding: the words are parenthesised and, when the 409 is this result landed earlier, the count is read from the stored result (`UnreportedResults.StoredReply(stored)`). §44 counts through it; §45 scans both lines.
- **C16 (MA-3b's stamp check could drop a record on another file's evidence).** A record's model is its central's path (every local shares it) or a never-saved model's title (every one is "Project1"): in another copy the stamps are absent, the bridge says proposed, the record went, and a second Apply would duplicate what the first copy still holds. Binding: the record keeps the file's own `Document.PathName` (`path`; "" when never saved; absent on older records, which behave as before). When no stamp is found and this is not that file — or it was never saved — `UnreportedResults.Elsewhere` keeps the record and says so, with the file to delete once the changeset's status is checked; the bridge is not asked. §42 checks the words and the two wiring lines. Ceiling: an Undo in a never-saved model keeps its record until that file is deleted by hand.
- **C17 (a reason whose only unticked rows have no proposal_guid passed C3's refusal).** Binding: the refusal tests the rows the reason is assigned to (`&& x.El.ProposalGuid != null`). §45's line follows.
- **C18 (Decline all took a note that is blank to the eye).** Binding: the window and the command test the note with `ChangesetTrust.Blank` (the reasons' own blank test: spaces and format characters); several lines or a long note is still a note. §44 checks it; §42's two scan lines follow.
- **C19 (§44's body check crashed the run when the body lost `reasons`).** Binding: read with `TryGetProperty` — a counted FAIL.
- Not changed: a Decline all that landed with its reply lost still reads "the bridge refused it" on Retry report (MA-3b's C1 takes only a result with applied ghosts; §42 pins it) — a known understatement, nothing lost; an exception after `Applying` on the decline path leaves the window without Apply (not reachable by any input found).

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | `resultReasons` runs inside `reportResult`'s `rewrite` callback, after the coverage check | A 400 is thrown before anything is written; it needs only the validated `rejected` list |
| E2 | `result.reasons` and the row's `reasons` exist only when there is one | Every existing `toEqual` on a result stays true; "absent" reads as none everywhere |
| E3 | The body writes `"reasons": null` when there is none | `ReportResult` serialises with the default options (as `review_rev: null` today); the bridge reads null as none; a bridge before MA-3b2 ignores the field |
| E4 | `ReportResult`'s `reasons` is an optional last parameter | Ghost Builder's `Report` (its own path, MA-3b4) compiles unchanged and sends none |
| E5 | The reason rule is one fixture (`revit_reasons.rule`) run by vitest through `resultReasons` and by promote-check through `ChangesetTrust.DeclineReason` | The two sides cannot drift: a reason Revit sends is one the bridge keeps. Where they differ the add-in is the stricter (it calls U+0085 blank and sends nothing) |
| E6 | Show speaks on its own line (`Shown`), above the note | The status line holds the result ("reported (ledger #n)") — a Show after Apply must not replace it; §43's `window.Say(` count stays 3 |
| E7 | The zoom rectangle is the place's points ± 1 m in plan, in the model's internal coordinates (mm ÷ 304.8), as `ChangesetExecutor.Pt` places them (`:91`) | Pure (`PlaceBox`, §44). Ceiling: a 3D or section view zooms to the same two corners and may show little; said in the words |
| E8 | `BridgeWords(Exception)` reads `OperationCanceledException` as the timeout and `HttpRequestException` by its innermost message; any other exception keeps its own words (C1) | net48 and net8 both cancel on the client's timeout; the innermost message is the socket's ("…actively refused it 127.0.0.1:4101"). A sign-in failure inside the request (`SessionException`) is not the bridge's silence. Ceiling: the socket's message is Windows', in its language |
| E9 | Nine lines of older scans that quote a changed line are rewritten with it (§39 ×2, §41 ×2, §43 ×5 — one in Task 2, eight in Task 3; three of §43's are C2's `Refused`, `Applying`, `Reopen`) | They pin the code they name; the new text is the old plus the reasons |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `WebApp/bridge/changesets-logic.mjs` | 1 | `resultReasons` (exported, pure) |
| `WebApp/bridge/changesets-store.mjs` | 1 | `reportResult` reads, validates, stores `reasons`; the row carries them |
| `WebApp/bridge/fixtures/changeset-ops/ma3a-review.json` | 1 | `revit_reasons` (`result`, `stored`, `rule`) |
| `WebApp/bridge/changesets-review.test.mjs`, `changesets-store.test.mjs` | 1 | 4 + 2 tests |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 2 | `ChangesetTrust.DeclineReason`, `ReasonsLine`, `BridgeWords` ×2, `PlaceBox`, `NoPlace`, `MaxReason`, `ReasonRule`, `GhostName` public; `ChangesetClient.ResultBody`; `ReportResult(…, reasons)`; the four `catch` lines |
| `SentinelAddin/Engine/UnreportedResults.cs` | 2 | `Record.Reasons`; `Outcome` through `BridgeWords` |
| `SentinelAddin/GhostBuilder/StoreyBatch.cs` | 2 | `Own(cs, reasons)` |
| `tools/promote-check/Ma3b2Reasons.cs` (new), `Check.cs`, `Ma3aReview.cs` | 2 | §44 (9 checks); §41's scan of the body follows it |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | 3 | the reason boxes, `ShowRequested`, `Shown`, the reasons on `DecideRequested` |
| `SentinelAddin/Commands.ReviewChangesets.cs` | 3 | `Decide(…, reasons)`, `ResultOf(…, reasons)`, `ReportAll` sends and says them, the Show handler |
| `SentinelAddin/RevitEventHub.cs` | 3 | `SelectAndShow(doc, uniqueId, said)` |
| `tools/promote-check/Ma3b2Wiring.cs` (new), `Check.cs`, `Ma3bDesk.cs`, `Ma2dWiring.cs`, `Ma3aReview.cs` | 3 | §45 (6 scans); eight older scan lines follow the lines they quote |
| `docs/strategy/2026-09-30-model-automation-design.md` | 4 | what was built, drill pending |

---

## Tasks (in order: the bridge; the pure pieces; the Revit wiring; the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file. `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once (some are part of a longer line).

### Task 1 — Bridge: a result carries a reason per declined ghost

**Files:**
- Modify `WebApp/bridge/changesets-logic.mjs`, `WebApp/bridge/changesets-store.mjs`
- Modify `WebApp/bridge/fixtures/changeset-ops/ma3a-review.json`
- Test `WebApp/bridge/changesets-review.test.mjs`, `WebApp/bridge/changesets-store.test.mjs`

**Interfaces:**
- Consumes: `reasonOf(r, need, what)` (`changesets-logic.mjs:540`, not exported: trimmed, one line, at most `MAX_REVIEW_REASON` = 500; blank → null), `err(status, message)`, `rewrite(d, pid, id, decide)` (`changesets-store.mjs:34` — it answers `{ before, ...decide's answer }`).
- Produces: `resultReasons(rejectedGuids, reasons)` → `{guid: text}` or `null`; throws 400 `reasons must be {proposal_guid: reason} — one line for each ghost this result rejects`, 400 `reasons names "<g>", which this result does not reject — a reason is for a declined ghost`, 400 `a reason is one line of at most 500 characters`. `POST /changesets/:key/:id/result` accepts `reasons`; the stored `result.reasons` and the `changeset_applied` row's `reasons` exist only when one was kept. The fixture's `revit_reasons.rule` is what Task 2's `ChangesetTrust.DeclineReason` is checked against, and `revit_reasons.stored` what `ReasonsLine` counts.

- [ ] **Step 1: The failing tests and the fixture.**

In `WebApp/bridge/fixtures/changeset-ops/ma3a-review.json`, replace:

```json
      "applied_over_decline_unchecked": []
    }
  }
}
```

with:

```json
      "applied_over_decline_unchecked": []
    }
  },
  "revit_reasons": {
    "_": "MA-3b2: Revit's reason per declined ghost, on a result against `after` (g-1 and g-4 declined on the web, g-2 accepted). `result` is the body Revit posts; `stored` is what the bridge keeps as result.reasons and on the changeset_applied row: trimmed, a blank one dropped, and one for a ghost the web also declined kept beside the web's. `rule` is the one-line rule both sides hold (changesets-logic reasonOf; ChangesetTrust.DeclineReason, read by tools/promote-check): `ok` false is refused, `clean` is what is kept (null: blank, not kept).",
    "result": {
      "applied": [{ "proposal_guid": "g-2", "revit_element_id": 312312, "revit_unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" }],
      "rejected": ["g-1", "g-3", "g-4"], "note": "GR-FFL reviewed in Revit", "review_rev": 1,
      "reasons": { "g-3": "  W 2 is demolished in the next package  ", "g-4": "   ", "g-1": "a party wall, as the web desk said" }
    },
    "stored": { "g-3": "W 2 is demolished in the next package", "g-1": "a party wall, as the web desk said" },
    "rule": [
      { "text": "  kept as typed  ", "ok": true, "clean": "kept as typed" },
      { "text": " \u200b ", "ok": true, "clean": null },
      { "text": "two\nlines", "ok": false },
      { "text": "a\ttab", "ok": false },
      { "text": "a line\u2028separator", "ok": false }
    ]
  }
}
```

In `WebApp/bridge/changesets-review.test.mjs`, replace:

```js
import { REVIEW_STATES, reviewState, reviewRev, reviewNext, applyDecisions, reopenDecline, resultConflicts } from "./changesets-logic.mjs";
```

with:

```js
import { REVIEW_STATES, reviewState, reviewRev, reviewNext, applyDecisions, reopenDecline, resultConflicts, resultReasons } from "./changesets-logic.mjs";
```

In `WebApp/bridge/changesets-review.test.mjs`, replace:

```js
    expect(() => resultConflicts(fx.after, [], ["g-1"], "1")).toThrow(/review_rev/);
  });
});
```

with:

```js
    expect(() => resultConflicts(fx.after, [], ["g-1"], "1")).toThrow(/review_rev/);
  });
});

describe("resultReasons — Revit's reason per declined ghost (MA-3b2)", () => {
  const rr = fx.revit_reasons;
  it("the shared fixture: each reason is trimmed, a blank one is dropped, and one for a ghost the web also declined is kept", () => {
    expect(resultReasons(rr.result.rejected, rr.result.reasons)).toEqual(rr.stored);
  });

  it("none sent, or only blank ones, is null — nothing is stored", () => {
    expect(resultReasons(["g-1"], undefined)).toBeNull();
    expect(resultReasons(["g-1"], null)).toBeNull();
    expect(resultReasons(["g-1"], {})).toBeNull();
    expect(resultReasons(["g-1"], { "g-1": "  " })).toBeNull();
  });

  it("the one-line rule is the web desk's (the fixture's `rule`, which tools/promote-check reads for ChangesetTrust.DeclineReason)", () => {
    for (const c of rr.rule) {
      if (c.ok) expect(resultReasons(["g"], { g: c.text })).toEqual(c.clean == null ? null : { g: c.clean });
      else expect(() => resultReasons(["g"], { g: c.text })).toThrow(/a reason is one line of at most 500 characters/);
    }
    expect(resultReasons(["g"], { g: "x".repeat(500) })).toEqual({ g: "x".repeat(500) });
    expect(() => resultReasons(["g"], { g: "x".repeat(501) })).toThrow(/a reason is one line of at most 500 characters/);
    expect(() => resultReasons(["g"], { g: 7 })).toThrow(/a reason is one line/);
  });

  it("a reason for a ghost the result does not reject, and a `reasons` that is not an object, are 400s in words", () => {
    expect(() => resultReasons(["g-1"], { "g-2": "applied, not declined" })).toThrow(/reasons names "g-2", which this result does not reject — a reason is for a declined ghost/);
    expect(() => resultReasons(["g-1"], JSON.parse('{"__proto__":"x"}'))).toThrow(/reasons names "__proto__"/);
    expect(() => resultReasons(["g-1"], ["g-1"])).toThrow(/reasons must be \{proposal_guid: reason\} — one line for each ghost this result rejects/);
    expect(() => resultReasons(["g-1"], "why")).toThrow(/reasons must be/);
    const thrown = (f) => { try { f(); } catch (e) { return e; } return null; }; // review C7: fails when nothing is thrown
    expect(thrown(() => resultReasons(["g-1"], { nope: "x" }))).toMatchObject({ status: 400 });
    // review C9: a ghost keyed __proto__ keeps its reason (an own key, never the prototype)
    expect(Object.keys(resultReasons(["__proto__"], JSON.parse('{"__proto__":"kept"}')))).toEqual(["__proto__"]);
  });
});
```

In `WebApp/bridge/changesets-store.test.mjs`, replace:

```js
    // C8: "late" rests on the client's claimed revision — the hash-chained row says so, not only the doc.
    expect(deps.audit.mock.calls[0][6].review_rev_seen).toEqual({ value: 2, claimed: true });
  });
```

with:

```js
    // C8: "late" rests on the client's claimed revision — the hash-chained row says so, not only the doc.
    expect(deps.audit.mock.calls[0][6].review_rev_seen).toEqual({ value: 2, claimed: true });
  });

  it("MA-3b2, the shared fixture: Revit's reason per declined ghost is stored on the result and rides on the changeset_applied row; a result without one stores none", async () => {
    const rr = fx.revit_reasons;
    const deps = seeded(fx.after);
    const out = await reportResult("demo", "cs-ma3a", rr.result, "revit", deps);
    expect(out.status).toBe("partially_applied");
    expect(out.result.reasons).toEqual(rr.stored);
    expect(deps.saved.get("cs-ma3a").result.reasons).toEqual(rr.stored);
    expect(out.result.declined_on_web.map((x) => x.proposal_guid)).toEqual(["g-1", "g-4"]); // the web's reasons stand beside Revit's
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ status: "partially_applied", rejected: 3, note: "GR-FFL reviewed in Revit", reasons: rr.stored });
    const plain = seeded(fx.after);
    const none = await reportResult("demo", "cs-ma3a", { ...rr.result, reasons: undefined }, "revit", plain);
    expect(none.result).not.toHaveProperty("reasons");
    expect(plain.audit.mock.calls[0][6]).not.toHaveProperty("reasons");
  });

  it("MA-3b2: a reason for a ghost the result does not reject, or one that is not one line, is a 400 — nothing is written and no row", async () => {
    const rr = fx.revit_reasons;
    const deps = seeded(fx.after);
    await expect(reportResult("demo", "cs-ma3a", { ...rr.result, reasons: { "g-2": "applied, not declined" } }, "revit", deps))
      .rejects.toMatchObject({ status: 400, message: 'reasons names "g-2", which this result does not reject — a reason is for a declined ghost' });
    await expect(reportResult("demo", "cs-ma3a", { ...rr.result, reasons: { "g-3": "two\nlines" } }, "revit", deps))
      .rejects.toMatchObject({ status: 400, message: "a reason is one line of at most 500 characters" });
    expect(deps.docReplaceIfField).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: See them fail.** From `WebApp`: `npx vitest run bridge/changesets-store.test.mjs bridge/changesets-review.test.mjs bridge/changesets-logic.test.mjs`
Expected: `2 failed | 1 passed (3)` files, `6 failed | 167 passed (173)` — `TypeError: resultReasons is not a function` (the two store tests fail on the missing `result.reasons` and the 400s that do not come).

- [ ] **Step 3: The code.**

In `WebApp/bridge/changesets-logic.mjs`, replace:

```js
  for (const g of rejectedGuids) { const x = entry(g); if (x) declinedOnWeb.push(x); }
  return { refused, late, unchecked, declined_on_web: declinedOnWeb };
}
```

with:

```js
  for (const g of rejectedGuids) { const x = entry(g); if (x) declinedOnWeb.push(x); }
  return { refused, late, unchecked, declined_on_web: declinedOnWeb };
}

/** MA-3b2: Revit's reason per declined ghost — the result's optional `reasons` {proposal_guid: text}. Each key is a ghost this result
 *  rejects; each value is one line (reasonOf, the web desk's rule). A blank one is dropped; none left is null (nothing is stored). A
 *  reason for a ghost the web also declined is kept beside the web's (declined_on_web): refusing it would refuse a result Revit has
 *  already applied, over a decline that landed while its report was on the way. */
export function resultReasons(rejectedGuids, reasons) {
  if (reasons == null) return null;
  if (typeof reasons !== "object" || Array.isArray(reasons)) throw err(400, "reasons must be {proposal_guid: reason} — one line for each ghost this result rejects");
  const rejected = new Set(rejectedGuids);
  const out = Object.create(null); // review C9: `out["__proto__"] = …` on a plain object would be swallowed
  for (const [g, r] of Object.entries(reasons)) {
    if (!rejected.has(g)) throw err(400, `reasons names "${g}", which this result does not reject — a reason is for a declined ghost`);
    const why = reasonOf(r, false, "a decline");
    if (why != null) out[g] = why;
  }
  return Object.keys(out).length ? { ...out } : null;
}
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
  reviewRev, applyDecisions, reopenDecline, resultConflicts } from "./changesets-logic.mjs";
```

with:

```js
  reviewRev, applyDecisions, reopenDecline, resultConflicts, resultReasons } from "./changesets-logic.mjs";
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
export async function reportResult(key, id, { applied, rejected, note, review_rev } = {}, actor, deps) {
```

with:

```js
export async function reportResult(key, id, { applied, rejected, note, review_rev, reasons } = {}, actor, deps) {
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
  const { before: cs, updated, conflicts } = await rewrite(d, proj.id, id, (cs) => {
```

with:

```js
  const { before: cs, updated, conflicts, why } = await rewrite(d, proj.id, id, (cs) => {
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
    const status = deriveResultStatus(appliedArr.length, rejectedArr.length, cs.elements.length);
    return { conflicts, updated: {
```

with:

```js
    // MA-3b2: Revit's reason per declined ghost — validated before anything is written, stored beside the web's declines.
    const why = resultReasons(rejectedArr, reasons);
    const status = deriveResultStatus(appliedArr.length, rejectedArr.length, cs.elements.length);
    return { conflicts, why, updated: {
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
        declined_on_web: conflicts.declined_on_web, applied_over_late_decline: conflicts.late, applied_over_decline_unchecked: conflicts.unchecked,
      },
```

with:

```js
        declined_on_web: conflicts.declined_on_web, applied_over_late_decline: conflicts.late, applied_over_decline_unchecked: conflicts.unchecked,
        ...(why ? { reasons: why } : {}),
      },
```

In `WebApp/bridge/changesets-store.mjs`, replace:

```js
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note, ...(values.length ? { values } : {}),
```

with:

```js
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note, ...(values.length ? { values } : {}),
      ...(why ? { reasons: why } : {}), // MA-3b2: Revit's reason per declined ghost, as stored
```

- [ ] **Step 4: See them pass.** From `WebApp`: the same command → `3 passed (3)` files, `173 passed (173)`. Then `npx vitest run bridge` → `91 passed (91)` files, `1860 passed | 1 skipped (1861)`, and `npx vitest run src/setups/review-desk.test.ts` → `10 passed (10)` (it reads the same fixture); restore `ids-cases.json` (Global Constraints).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-review.test.mjs WebApp/bridge/changesets-store.test.mjs WebApp/bridge/fixtures/changeset-ops/ma3a-review.json
git commit -m "feat(bridge): MA-3b2 - a changeset result carries a reason per declined ghost (reasons {proposal_guid: text}): each a ghost the result rejects, one line of at most 500 characters, stored on the result beside declined_on_web and on the changeset_applied row" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2 — Revit, pure: the reason rule, the split per changeset, the body, the record, the plain words, the place a row shows

**Files:**
- Modify `SentinelAddin/Coordination/ChangesetClient.cs`, `SentinelAddin/Engine/UnreportedResults.cs`, `SentinelAddin/GhostBuilder/StoreyBatch.cs`
- Create `tools/promote-check/Ma3b2Reasons.cs`; modify `tools/promote-check/Check.cs`, `tools/promote-check/Ma3aReview.cs`

**Interfaces:**
- Consumes: Task 1's fixture (`revit_reasons.rule`, `revit_reasons.stored`); `StoreyBatch.Own(ChangesetDto, IEnumerable<string>)`; `ChangesetClient.ReadHttp` (8 s) and `WriteHttp` (120 s); promote-check's `Ok`, `Repo`, `Src`.
- Produces (Task 3 uses each by these names):
  - `ChangesetTrust.MaxReason` (500), `ChangesetTrust.ReasonRule`, `string ChangesetTrust.DeclineReason(string text, out string problem)` — the cleaned reason, or null when blank; `problem` is `ReasonRule` when refused.
  - `string ChangesetTrust.ReasonsLine(string reply, int sent)` — `""`, `"\n<k> decline reason(s) recorded with it."`, or the ⚠ line.
  - `string ChangesetTrust.BridgeWords(string err, int seconds)` and `BridgeWords(Exception ex, int seconds)`.
  - `double[][] ChangesetTrust.PlaceBox(PlaceDto p, double marginMm = 1000)` — `{min{x,y,z}, max{x,y,z}}` in mm, or null.
  - `ChangesetTrust.NoPlace` (const), `public static string ChangesetTrust.GhostName(ChangesetElementDto e)`.
  - `ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, reviewRev, out reply, out error, Dictionary<string, string> reasons = null)`; `internal static string ChangesetClient.ResultBody(applied, rejected, note, reviewRev, reasons)`.
  - `UnreportedResults.Record.Reasons` (`Dictionary<string, string>`, null when none).
  - `Dictionary<string, string> StoreyBatch.Own(ChangesetDto cs, IReadOnlyDictionary<string, string> reasons)` — null when none is the changeset's.

- [ ] **Step 1: The failing checks (§44).**

Create `tools/promote-check/Ma3b2Reasons.cs`:

```csharp
#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 44. MA-3b2: a reason per declined ghost (the rule, the split per changeset, the body, the record, what the bridge kept), the
    //        place a row shows, and the bridge's failures in plain words (pure) ───────────────────────────────────────────────────
    static void Ma3b2ReasonChecks()
    {
        Console.WriteLine("\nMA-3b2 — a reason per declined ghost, the place a row shows, the bridge's failures in plain words");
        using var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ma3a-review.json")));
        var rr = fx.RootElement.GetProperty("revit_reasons");
        var after = JsonSerializer.Deserialize<ChangesetDto>(fx.RootElement.GetProperty("after").GetRawText());

        // The one-line rule, as the bridge holds it (the fixture's `rule`, which vitest runs through resultReasons).
        bool rule = true;
        foreach (var c in rr.GetProperty("rule").EnumerateArray())
        {
            var clean = ChangesetTrust.DeclineReason(c.GetProperty("text").GetString(), out var problem);
            string want = c.TryGetProperty("clean", out var w) && w.ValueKind == JsonValueKind.String ? w.GetString() : null;
            rule &= c.GetProperty("ok").GetBoolean() ? problem == null && clean == want : problem == ChangesetTrust.ReasonRule && clean == null;
        }
        string long500 = new string('x', 500);
        Ok(rule && rr.GetProperty("rule").GetArrayLength() == 5 && ChangesetTrust.ReasonRule == "a reason is one line of at most 500 characters" && ChangesetTrust.MaxReason == 500
           && ChangesetTrust.DeclineReason(long500, out var p500) == long500 && p500 == null
           && ChangesetTrust.DeclineReason(long500 + "x", out var p501) == null && p501 == ChangesetTrust.ReasonRule
           && ChangesetTrust.DeclineReason(null, out var pNull) == null && pNull == null,
           "a decline reason is cleaned as the bridge cleans it (the shared fixture's rule): trimmed; blank is none; two lines, a control character or more than 500 characters is refused before anything is sent");

        // A storey's reasons, split back to the changeset each ghost is reported on (StoreyBatch.Own's rule).
        var part1 = new ChangesetDto { Id = "p1", Elements = after.Elements.Take(2).ToList() }; // g-1, g-2
        var part2 = new ChangesetDto { Id = "p2", Elements = after.Elements.Skip(2).ToList() }; // g-3, g-4
        var typed = new Dictionary<string, string> { ["g-3"] = "W 2 is demolished in the next package", ["g-1"] = "a party wall", ["zz"] = "not a ghost" };
        var own1 = StoreyBatch.Own(part1, typed);
        var own2 = StoreyBatch.Own(part2, typed);
        Ok(own1 != null && own1.Count == 1 && own1["g-1"] == "a party wall" && own2 != null && own2.Count == 1 && own2["g-3"] == "W 2 is demolished in the next package"
           && StoreyBatch.Own(part1, new Dictionary<string, string> { ["g-3"] = "x" }) == null && StoreyBatch.Own(part1, (Dictionary<string, string>)null) == null,
           "a storey's reasons are split back to the changeset each ghost is reported on; none for a changeset is null (its report sends none)");

        // The body Revit posts, and the record that is sent again later.
        var applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "g-2", RevitElementId = 312312, RevitUniqueId = "u-2" } };
        var rejected = new List<string> { "g-1", "g-3", "g-4" };
        using var body = JsonDocument.Parse(ChangesetClient.ResultBody(applied, rejected, "GR-FFL reviewed in Revit", 1, own2));
        using var bare = JsonDocument.Parse(ChangesetClient.ResultBody(applied, rejected, null, null, null));
        Ok(body.RootElement.GetProperty("reasons").GetProperty("g-3").GetString() == "W 2 is demolished in the next package" && body.RootElement.GetProperty("reasons").EnumerateObject().Count() == 1
           && body.RootElement.GetProperty("review_rev").GetInt32() == 1 && body.RootElement.GetProperty("applied")[0].GetProperty("proposal_guid").GetString() == "g-2"
           && body.RootElement.GetProperty("rejected").GetArrayLength() == 3 && body.RootElement.TryGetProperty("actor", out _)
           && bare.RootElement.GetProperty("reasons").ValueKind == JsonValueKind.Null && bare.RootElement.GetProperty("review_rev").ValueKind == JsonValueKind.Null,
           "the result's body carries reasons {proposal_guid: text} beside applied, rejected, note, actor and review_rev; with none it is null, which the bridge reads as none");

        var root = Path.Combine(Path.GetTempPath(), "ma3b2-check-" + Guid.NewGuid().ToString("N"));
        var was = UnreportedResults.Root;
        UnreportedResults.Root = root;
        try
        {
            var rec = new UnreportedResults.Record { Key = "ma3b2", ChangesetId = "c-1", Name = "Promote (DD) · GR-FFL", Doc = @"C:\models\a.rvt", Applied = applied, Rejected = rejected, Reasons = own2, At = "2026-10-04T12:00:00Z" };
            bool wrote = UnreportedResults.Write(rec);
            var back = UnreportedResults.Read("ma3b2", "c-1");
            File.WriteAllText(UnreportedResults.PathFor("ma3b2", "c-0"), "{\"key\":\"ma3b2\",\"changeset_id\":\"c-0\",\"name\":\"before MA-3b2\",\"applied\":[],\"rejected\":[\"g\"]}");
            var old = UnreportedResults.Read("ma3b2", "c-0");
            Ok(wrote && back?.Reasons != null && back.Reasons.Count == 1 && back.Reasons["g-3"] == "W 2 is demolished in the next package" && old != null && old.Reasons == null,
               "a result kept on this PC keeps its reasons, so one sent again later carries them; a record written before MA-3b2 reads with none");
        }
        finally
        {
            UnreportedResults.Root = was;
            try { Directory.Delete(root, true); } catch (Exception) { /* a temp folder */ }
        }

        // Claimed vs verified: the words count the reasons the bridge's reply holds, never the ones sent.
        string reply = "{\"id\":\"c\",\"status\":\"partially_applied\",\"result\":{\"note\":null,\"reasons\":" + rr.GetProperty("stored").GetRawText() + "},\"ledger\":{\"id\":1801}}";
        const string notKept = " — a bridge before MA-3b2 keeps none, and a blank one is never kept; what it did not keep is not on the ledger.";
        Ok(ChangesetTrust.ReasonsLine(reply, 2) == "\n2 decline reason(s) recorded with it." && ChangesetTrust.ReasonsLine(reply, 0) == "" && ChangesetTrust.ReasonsLine(null, 0) == ""
           && ChangesetTrust.ReasonsLine(reply, 3) == "\n⚠ 3 decline reason(s) were sent and the bridge kept 2" + notKept
           && ChangesetTrust.ReasonsLine("{\"id\":\"c\",\"result\":{\"note\":null}}", 2) == "\n⚠ 2 decline reason(s) were sent and the bridge kept 0" + notKept
           && ChangesetTrust.ReasonsLine("not json", 1) == "\n⚠ 1 decline reason(s) were sent and the bridge kept 0" + notKept,
           "a reported result says how many decline reasons the bridge kept — read from its reply (claimed vs verified); a bridge that kept fewer than were sent is said");

        // The bridge's failures in plain words (drill MA3b's finding: "Couldn't reach the bridge: A task was canceled.").
        const string notRefreshed = "session not refreshed — retrying (Supabase not reached: A task was canceled.)"; // UserSession.cs:152, :177
        var refusedConnection = new HttpRequestException("An error occurred while sending the request.",
            new InvalidOperationException("Unable to connect to the remote server", new InvalidOperationException("No connection could be made because the target machine actively refused it 127.0.0.1:4101")));
        Ok(ChangesetTrust.BridgeWords("A task was canceled.", 8) == "the bridge did not answer within 8 s"
           && ChangesetTrust.BridgeWords("The request was canceled due to the configured HttpClient.Timeout of 120 seconds elapsing.", 120) == "the bridge did not answer within 120 s"
           && ChangesetTrust.BridgeWords(new TaskCanceledException(), 8) == "the bridge did not answer within 8 s"
           && ChangesetTrust.BridgeWords(new OperationCanceledException("anything"), 120) == "the bridge did not answer within 120 s"
           && ChangesetTrust.BridgeWords(refusedConnection, 8) == "the connection failed — No connection could be made because the target machine actively refused it 127.0.0.1:4101"
           && ChangesetTrust.BridgeWords(new JsonException("'<' is an invalid start of a value."), 8) == "'<' is an invalid start of a value."
           && ChangesetTrust.BridgeWords("Bridge 409: {\"message\":\"the changeset was canceled\"}", 8) == "Bridge 409: {\"message\":\"the changeset was canceled\"}"
           && ChangesetTrust.BridgeWords((string)null, 8) == "the bridge did not answer" && ChangesetTrust.BridgeWords("  ", 8) == "the bridge did not answer"
           // Review C1 (never a guess): a sign-in refresh that timed out before the bridge was asked keeps its own words — everywhere.
           && ChangesetTrust.BridgeWords("The operation was canceled.", 8) == "the bridge did not answer within 8 s"
           && ChangesetTrust.BridgeWords(new InvalidOperationException(notRefreshed), 8) == notRefreshed && ChangesetTrust.BridgeWords(notRefreshed, 120) == notRefreshed
           && ChangesetTrust.BridgeWords(new InvalidOperationException(""), 8) == "the bridge did not answer"
           && UnreportedResults.Outcome(notRefreshed, 1) is var kept && !kept.Drop && kept.Words.StartsWith("not reported: " + notRefreshed, StringComparison.Ordinal) && !kept.Words.Contains("the bridge did not answer")
           && UnreportedResults.Outcome("A task was canceled.", 1).Words.StartsWith("not reported: the bridge did not answer within 120 s", StringComparison.Ordinal),
           "a request that timed out reads \"the bridge did not answer within N s\" (net48's and net8's words, or the exception itself), a refused connection names its cause, the bridge's own words are never rewritten, and a sign-in that failed before the bridge was asked is never said as the bridge's silence");
        string client = Src("Coordination", "ChangesetClient.cs"), unreported = Src("Engine", "UnreportedResults.cs");
        int reads = 0;
        for (int i = 0; (i = client.IndexOf("error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds);", i, StringComparison.Ordinal)) >= 0; i++) reads++;
        Ok(reads == 3 && client.Contains("catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)WriteHttp.Timeout.TotalSeconds); return false; }")
           && unreported.Contains("var err = ChangesetTrust.BridgeWords(error, 120);")
           && client.Contains("ResultBody(applied, rejected, note, reviewRev, reasons), 200, out reply, out error);"),
           "every read (the pending list, the re-check, the role) and every write of the changeset client says its failure in those words, with its own timeout; the result is posted with ResultBody");

        // Zoom to row: the rectangle a create's row shows, from its place (mm, with a margin); none when the place has no point.
        var wall = ChangesetTrust.PlaceBox(new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0, 3000 }, End = new double[] { 5000, 0, 3000 } } });
        var arc = ChangesetTrust.PlaceBox(new PlaceDto { LocationCurve = new CurveDto { Start = new double[] { 0, 0, 0 }, End = new double[] { 4000, 0, 0 }, Mid = new double[] { 2000, 2000, 0 } } }, 0);
        var door = ChangesetTrust.PlaceBox(new PlaceDto { Location = new double[] { 2500, 100, 0 } });
        var roof = ChangesetTrust.PlaceBox(new PlaceDto { Boundary = new[] { new double[] { 0, 0 }, new double[] { 8000, 0 }, new double[] { 8000, 6000 } }, BaseElevation = 6000 }, 500);
        Ok(wall != null && wall[0].SequenceEqual(new double[] { -1000, -1000, 3000 }) && wall[1].SequenceEqual(new double[] { 6000, 1000, 3000 })
           && arc[0].SequenceEqual(new double[] { 0, 0, 0 }) && arc[1].SequenceEqual(new double[] { 4000, 2000, 0 })
           && door[0].SequenceEqual(new double[] { 1500, -900, 0 }) && door[1].SequenceEqual(new double[] { 3500, 1100, 0 })
           && roof[0].SequenceEqual(new double[] { -500, -500, 6000 }) && roof[1].SequenceEqual(new double[] { 8500, 6500, 6000 })
           && ChangesetTrust.PlaceBox(new PlaceDto { Name = "03-FFL", BaseElevation = 9000 }) == null && ChangesetTrust.PlaceBox(null) == null,
           "a create's row shows the rectangle around its place — a wall's line (an arc's middle point too), a door's point, a roof's outline — 1 m wider on each side; a level or a grid has no place to show");
        Ok(ChangesetTrust.GhostName(after.Elements[0]) == "retype wall \"W 1\"" && ChangesetTrust.GhostName(new ChangesetElementDto { ProposalGuid = "g-9", Kind = "door" }) == "create door \"g-9\""
           && ChangesetTrust.NoPlace == "A type edit has no place in the model — it reaches every element on its type (the row says how many).",
           "a row's Show names its ghost as the bridge's refusals do, and a type edit says it has no place");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3bWiringChecks();
```

with:

```csharp
        Ma3bWiringChecks();
        Ma3b2ReasonChecks();
```

In `tools/promote-check/Ma3aReview.cs`, replace:

```csharp
           && client.Contains("JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev })")
```

with:

```csharp
           && client.Contains("JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev, reasons })") // MA-3b2: and the reasons
```

- [ ] **Step 2: See it fail.** From the repo root: `dotnet run --project tools/promote-check`
Expected: it does not compile — `error CS0117: 'ChangesetTrust' does not contain a definition for 'DeclineReason'` (and for `ReasonsLine`, `BridgeWords`, `PlaceBox`, `NoPlace`, `MaxReason`, `ReasonRule`; `CS0122` on `GhostName`).

- [ ] **Step 3: The code.**

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace:

```csharp
    private static string Who(ReviewDto r) => (r.By ?? "someone") + (string.IsNullOrWhiteSpace(r.Role) ? "" : $" ({r.Role})");

    /// <summary>A ghost as the bridge's refusals name it (changesets-logic ghostName): retype wall "W 1".</summary>
    private static string GhostName(ChangesetElementDto e) => $"{e.Op ?? "create"} {e.Kind} \"{e.Validate?.Identity?.Name ?? e.ProposalGuid}\"";
```

with:

```csharp
    private static string Who(ReviewDto r) => (r.By ?? "someone") + (string.IsNullOrWhiteSpace(r.Role) ? "" : $" ({r.Role})");

    /// <summary>A ghost as the bridge's refusals name it (changesets-logic ghostName): retype wall "W 1".</summary>
    public static string GhostName(ChangesetElementDto e) => $"{e.Op ?? "create"} {e.Kind} \"{e.Validate?.Identity?.Name ?? e.ProposalGuid}\"";

    /// <summary>MA-3b2: the bridge's rule for a reason (changesets-logic MAX_REVIEW_REASON and reasonOf's refusal).</summary>
    public const int MaxReason = 500;
    public const string ReasonRule = "a reason is one line of at most 500 characters";

    /// <summary>MA-3b2: a decline reason as the bridge will keep it — trimmed; null when blank (none is sent). <paramref name="problem"/>
    /// is <see cref="ReasonRule"/> when the bridge would refuse it (more than one line, a control character, over 500 characters):
    /// refused in the window before Apply, because a result the bridge refuses after Revit placed its elements is not reported.</summary>
    public static string DeclineReason(string text, out string problem)
    {
        problem = null;
        if (text == null || text.All(c => char.IsWhiteSpace(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.Format)) return null;
        if (text.Length > MaxReason || text.Any(c => char.IsControl(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.LineSeparator
                                                     || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.ParagraphSeparator))
        {
            problem = ReasonRule;
            return null;
        }
        return text.Trim();
    }

    /// <summary>MA-3b2 (claimed vs verified): what a reported result says of its decline reasons — counted from the bridge's reply (the
    /// stored result.reasons), never from what was sent; "" when none was sent.</summary>
    public static string ReasonsLine(string reply, int sent)
    {
        if (sent <= 0) return "";
        int kept = 0;
        try
        {
            using var doc = JsonDocument.Parse(reply ?? "");
            if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("result", out var r) && r.ValueKind == JsonValueKind.Object
                && r.TryGetProperty("reasons", out var m) && m.ValueKind == JsonValueKind.Object) kept = m.EnumerateObject().Count();
        }
        catch (JsonException) { /* not JSON: none can be counted */ }
        return kept >= sent ? $"\n{kept} decline reason(s) recorded with it."
            : $"\n⚠ {sent} decline reason(s) were sent and the bridge kept {kept} — a bridge before MA-3b2 keeps none, and a blank one is never kept; what it did not keep is not on the ledger.";
    }

    /// <summary>MA-3b2 (drill MA3b's finding): a request's failure in plain words. A timeout — net48's "A task was canceled.", net8's
    /// "…canceled due to the configured HttpClient.Timeout…" — reads "the bridge did not answer within N s"; the bridge's own words
    /// ("Bridge 409: …") are never rewritten. Review C1 (never a guess): only a message that IS the timeout is rewritten — one that
    /// merely holds "canceled" (a sign-in refresh that timed out before the bridge was asked: "… (Supabase not reached: A task was
    /// canceled.)") keeps its own words.</summary>
    public static string BridgeWords(string err, int seconds) =>
        string.IsNullOrWhiteSpace(err) ? "the bridge did not answer"
        : err == "A task was canceled." || err == "The operation was canceled." || err.StartsWith("The request was canceled due to the configured HttpClient.Timeout", StringComparison.Ordinal)
            ? $"the bridge did not answer within {seconds} s"
        : err;

    /// <summary>…and of the exception itself: a cancelled request is the timeout; a request that never connected names its cause (the
    /// innermost message: "No connection could be made because the target machine actively refused it …"), not "An error occurred
    /// while sending the request." Review C1: any other exception (the session's, a reply that is not JSON) keeps its own message —
    /// never through the string overload.</summary>
    public static string BridgeWords(Exception ex, int seconds) =>
        ex is OperationCanceledException ? $"the bridge did not answer within {seconds} s"
        : ex is HttpRequestException ? "the connection failed — " + ex.GetBaseException().Message
        : string.IsNullOrWhiteSpace(ex?.Message) ? "the bridge did not answer" : ex.Message;

    /// <summary>MA-3b2: a type edit's row has no Show.</summary>
    public const string NoPlace = "A type edit has no place in the model — it reaches every element on its type (the row says how many).";

    /// <summary>MA-3b2 (zoom to row): the rectangle a create's row shows — the least and greatest corner {x, y, z} in mm around every point
    /// of its place (a wall's line and an arc's middle point, a floor's loop, a roof's or ceiling's outline, a door's point),
    /// <paramref name="marginMm"/> wider on each side in plan; z from the points, else the place's base elevation, else 0. Null when
    /// the place has no point (a level, a grid).</summary>
    public static double[][] PlaceBox(PlaceDto p, double marginMm = 1000)
    {
        if (p == null) return null;
        var pts = new List<double[]>();
        void Add(double[] q) { if (q != null && q.Length >= 2) pts.Add(q); }
        Add(p.LocationCurve?.Start); Add(p.LocationCurve?.End); Add(p.LocationCurve?.Mid);
        foreach (var q in p.LocationLoop ?? new double[0][]) Add(q);
        foreach (var q in p.Boundary ?? new double[0][]) Add(q);
        Add(p.Location);
        if (pts.Count == 0) return null;
        double Z(double[] q) => q.Length >= 3 ? q[2] : p.BaseElevation ?? 0;
        return new[]
        {
            new[] { pts.Min(q => q[0]) - marginMm, pts.Min(q => q[1]) - marginMm, pts.Min(Z) },
            new[] { pts.Max(q => q[0]) + marginMm, pts.Max(q => q[1]) + marginMm, pts.Max(Z) },
        };
    }
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace:

```csharp
            var list = JsonSerializer.Deserialize<List<ChangesetDto>>(body) ?? new List<ChangesetDto>();
            return list.OrderBy(c => c.CreatedAt, StringComparer.Ordinal).ToList(); // FIFO — oldest first
        }
        catch (Exception ex) { error = ex.Message; return null; }
```

with:

```csharp
            var list = JsonSerializer.Deserialize<List<ChangesetDto>>(body) ?? new List<ChangesetDto>();
            return list.OrderBy(c => c.CreatedAt, StringComparer.Ordinal).ToList(); // FIFO — oldest first
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds); return null; }
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace:

```csharp
            return JsonSerializer.Deserialize<ChangesetDto>(body);
        }
        catch (Exception ex) { error = ex.Message; return null; }
    }

    /// <summary>MA-3a: <paramref name="reviewRev"/> is the review_rev Apply re-checked (null: no revision was re-checked — the bridge records any decline it applied as applied_over_decline_unchecked, C2);
    /// <paramref name="reply"/> is the bridge's answer, the stored changeset (ChangesetTrust.LateDeclines reads it).</summary>
    public static bool ReportResult(BcfConfig cfg, string projectKey, string id,
        List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, out string reply, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/result",
             JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev }), 200, out reply, out error);
```

with:

```csharp
            return JsonSerializer.Deserialize<ChangesetDto>(body);
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds); return null; }
    }

    /// <summary>MA-3a: <paramref name="reviewRev"/> is the review_rev Apply re-checked (null: no revision was re-checked — the bridge records any decline it applied as applied_over_decline_unchecked, C2);
    /// <paramref name="reply"/> is the bridge's answer, the stored changeset (ChangesetTrust.LateDeclines reads it). MA-3b2:
    /// <paramref name="reasons"/> is the reviewer's reason per rejected ghost ({proposal_guid: one line}); null sends none.</summary>
    public static bool ReportResult(BcfConfig cfg, string projectKey, string id,
        List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, out string reply, out string error, Dictionary<string, string> reasons = null) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/result",
             ResultBody(applied, rejected, note, reviewRev, reasons), 200, out reply, out error);

    /// <summary>The result's body (tools/promote-check reads it). `reasons` is written as null when there is none: the bridge reads
    /// null as none, and a bridge before MA-3b2 ignores the field.</summary>
    internal static string ResultBody(List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, Dictionary<string, string> reasons) =>
        JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev, reasons });
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace:

```csharp
            if ((int)resp.StatusCode != expect) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return false; }
            return true;
        }
        catch (Exception ex) { error = ex.Message; return false; }
```

with:

```csharp
            if ((int)resp.StatusCode != expect) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return false; }
            return true;
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)WriteHttp.Timeout.TotalSeconds); return false; }
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace:

```csharp
            return doc.RootElement.TryGetProperty("role", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : "";
        }
        catch (Exception ex) { error = ex.Message; return null; }
```

with:

```csharp
            return doc.RootElement.TryGetProperty("role", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : "";
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds); return null; }
```

In `SentinelAddin/Engine/UnreportedResults.cs`, replace:

```csharp
            var err = string.IsNullOrWhiteSpace(error) ? "the bridge did not answer" : error;
            bool Is(params string[] codes) => codes.Any(c => err.StartsWith("Bridge " + c, StringComparison.Ordinal));
            // Review M4: the 120 s write timeout reads "A task was canceled." (net48) or "…canceled due to the configured HttpClient.Timeout…"
            // (net8) — said as what it is; a bridge's own words are never rewritten.
            if (!err.StartsWith("Bridge ", StringComparison.Ordinal) && err.IndexOf("canceled", StringComparison.OrdinalIgnoreCase) >= 0)
                err = "the bridge did not answer within 120 s";
```

with:

```csharp
            // Review M4, MA-3b2: a timeout is said as what it is (ChangesetTrust.BridgeWords — the client says it so already; net48's and
            // net8's own timeout words are read the same way); a bridge's own words are never rewritten, nor a sign-in failure's (C1).
            var err = ChangesetTrust.BridgeWords(error, 120);
            bool Is(params string[] codes) => codes.Any(c => err.StartsWith("Bridge " + c, StringComparison.Ordinal));
```

In `SentinelAddin/Engine/UnreportedResults.cs`, replace:

```csharp
            [JsonPropertyName("note")] public string Note { get; set; }
```

with:

```csharp
            [JsonPropertyName("note")] public string Note { get; set; }
            /// <summary>MA-3b2: the reviewer's reason per rejected ghost ({proposal_guid: one line}); null when none was typed, and on a
            /// record written before MA-3b2.</summary>
            [JsonPropertyName("reasons")] public Dictionary<string, string> Reasons { get; set; }
```

In `SentinelAddin/GhostBuilder/StoreyBatch.cs`, replace:

```csharp
        return (guids ?? Enumerable.Empty<string>()).Where(mine.Contains).ToList();
    }
```

with:

```csharp
        return (guids ?? Enumerable.Empty<string>()).Where(mine.Contains).ToList();
    }

    /// <summary>MA-3b2: the reasons of <paramref name="reasons"/> ({proposal_guid: text}) that are for <paramref name="cs"/>'s own
    /// elements — a storey's decline reasons, split back as its unticks are. Null when none is (the report then sends none).</summary>
    public static Dictionary<string, string> Own(ChangesetDto cs, IReadOnlyDictionary<string, string> reasons)
    {
        var mine = Own(cs, reasons?.Keys);
        return mine.Count == 0 ? null : mine.ToDictionary(g => g, g => reasons[g]);
    }
```

- [ ] **Step 4: See it pass.** `dotnet run --project tools/promote-check` → `747/747 checks pass` (738 + §44's 9). `dotnet run --project tools/session-check` → `47/47 checks pass` (it compiles a file this task changes).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/Engine/UnreportedResults.cs SentinelAddin/GhostBuilder/StoreyBatch.cs tools/promote-check/Ma3b2Reasons.cs tools/promote-check/Check.cs tools/promote-check/Ma3aReview.cs
git commit -m "feat(addin): MA-3b2, pure - a decline reason cleaned by the bridge's rule, a storey's reasons split per changeset, the result's body and the kept record carry them, the words count what the bridge kept; a timeout reads 'the bridge did not answer within N s' and a failed connection names its cause, at the client; the rectangle a create's row shows" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3 — Revit: the reason boxes, the reasons on every report, Show

**Files:**
- Modify `SentinelAddin/UI/ChangesetReviewWindow.cs`, `SentinelAddin/Commands.ReviewChangesets.cs`, `SentinelAddin/RevitEventHub.cs`
- Create `tools/promote-check/Ma3b2Wiring.cs`; modify `tools/promote-check/Check.cs`, `Ma3bDesk.cs`, `Ma2dWiring.cs`, `Ma3aReview.cs`

**Interfaces:**
- Consumes: everything Task 2 produces (by the names above); `RevitEventHub.Enqueue(Document doc, string what, Action<UIApplication, Document> job, Action<string>? onRefused = null)` (`RevitEventHub.cs:28` — DocPin: the job runs only while `doc` is Revit's active document; a refusal is logged and handed to `onRefused`); the window's `Say`, `Ui`, `_gone`, `_rows`, `_go`.
- Produces: `ChangesetReviewWindow.DecideRequested` is `Action<List<string>, List<string>, string, Dictionary<string, string>>`; `event Action<ChangesetElementDto> ShowRequested`; `void Shown(string words)` (any thread); `RevitEventHub.SelectAndShow(Document doc, string uniqueId, Action<string?> said)` — `said(null)` once shown, else the reason.

- [ ] **Step 1: The failing scans (§45), and the eight older scan lines that quote a line this task changes.**

Create `tools/promote-check/Ma3b2Wiring.cs`:

```csharp
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
        int noRow = At(window, "if (!g.Rows.Any(x => x.Box.IsChecked != true && x.Box.IsEnabled)) { Say($\"The reason for \\\"{g.What}\\\" has no unticked row to go with — untick the rows it is for, or clear it. Nothing was sent.\"); return; }");
        int press = At(window, "_go.IsEnabled = false; Reasons(true);");
        Ok(window.Contains("public event Action<List<string>, List<string>, string, Dictionary<string, string>> DecideRequested;")
           // Review C4: the box is on its own row under the buttons, filling it — no fixed width to clip.
           && window.Contains("var why = new TextBox { MaxLength = ChangesetTrust.MaxReason,") && !window.Contains("Width = 220") && window.Contains("_groups.Add((group.Key, why, mine));")
           && window.Contains("whyRow.Children.Add(whyLabel); whyRow.Children.Add(why);") && window.Contains("body.Children.Add(bar); body.Children.Add(whyRow); body.Children.Add(groupRows);")
           && window.Contains("var reason = ChangesetTrust.DeclineReason(g.Reason.Text, out var problem);") && refuse > 0 && refuse < noRow && noRow < press
           // Review C2: the reasons are taken at the press — the boxes are read-only from then on, and editable again only when nothing was applied.
           && window.Contains("private void Reasons(bool taken) { foreach (var g in _groups) g.Reason.IsReadOnly = taken; }")
           && window.Contains("public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; if (!_applied) Reasons(false); });")
           && window.Contains("public void Applying(string words) => Ui(() => { _applied = true; _go.IsEnabled = false; Reasons(true); Say(words); });")
           && window.Contains("public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Reasons(false); Say(words); });")
           && window.Contains("foreach (var r in g.Rows.Where(x => x.Box.IsChecked != true && x.Box.IsEnabled && x.El.ProposalGuid != null)) reasons[r.El.ProposalGuid] = reason;")
           && window.Contains("DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? \"\", reasons);"),
           "each group has one reason box on its own row: its reason goes to that group's unticked rows that may be ticked here (never a row the web declined); one the bridge would refuse, or one with no such row, is refused by the window before anything is sent; the boxes are read-only once their reasons were taken");
        Ok(review.Contains("window.DecideRequested += (ticked, unticked, note, reasons) => Task.Run(() => Decide(ticked, unticked, note, reasons));")
           && review.Contains("ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null, StoreyBatch.Own(f, reasons))")
           && review.Contains("records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }, StoreyBatch.Own(one, reasons)));")
           && review.Contains("(string.IsNullOrEmpty(note) ? \"\" : $\" | reviewer: {note}\"), null, here, null, null)).ToList()), rep =>")
           && review.Contains("Undo = undo ?? new List<string>(), At = ProvenanceStamp.Now(), Reasons = reasons,"),
           "a partial Apply and a Decline all carry each changeset's own reasons on its result and its record; a rolled-back storey sends none (Revit declined those, not the reviewer)");
        Ok(review.Contains("var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err, r.Reasons);")
           && review.Contains("+ ChangesetTrust.ReasonsLine(reply, r.Reasons?.Count ?? 0) +"),
           "every report of the review sends its record's reasons — one sent again later too — and says how many the bridge kept, from its reply");

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
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b2ReasonChecks();
```

with:

```csharp
        Ma3b2ReasonChecks();
        Ma3b2WiringChecks();
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
review.Contains("window.DecideRequested += (ticked, unticked, note) => Task.Run(() => Decide(ticked, unticked, note));")
```

with:

```csharp
review.Contains("window.DecideRequested += (ticked, unticked, note, reasons) => Task.Run(() => Decide(ticked, unticked, note, reasons));") // MA-3b2: and the reasons
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
        Ok(reportAll > 0 && pool > reportAll && At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err);") > pool
```

with:

```csharp
        Ok(reportAll > 0 && pool > reportAll && At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err, r.Reasons);") > pool
```

In `tools/promote-check/Ma3bDesk.cs`, replace (review C2 — §43 quotes the three lines that now lock and unlock the reason boxes):

```csharp
window.Contains("public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; });")
```

with:

```csharp
window.Contains("public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; if (!_applied) Reasons(false); });")
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
window.Contains("public void Applying(string words) => Ui(() => { _applied = true; _go.IsEnabled = false; Say(words); });")
```

with:

```csharp
window.Contains("public void Applying(string words) => Ui(() => { _applied = true; _go.IsEnabled = false; Reasons(true); Say(words); });")
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
window.Contains("public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Say(words); });")
```

with:

```csharp
window.Contains("public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Reasons(false); Say(words); });")
```

In `tools/promote-check/Ma2dWiring.cs`, replace:

```csharp
        int reported = At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err);");
```

with:

```csharp
        int reported = At(review, "var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err, r.Reasons);"); // MA-3b2: and the reasons
```

In `tools/promote-check/Ma2dWiring.cs`, replace:

```csharp
           && review.Contains("ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null)")
```

with:

```csharp
           && review.Contains("ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null, StoreyBatch.Own(f, reasons))") // MA-3b2: each part's own reasons
```

In `tools/promote-check/Ma3aReview.cs`, replace:

```csharp
        Ok(review.Contains("records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }));") // MA-3b: sent by ReportAll
```

with:

```csharp
        Ok(review.Contains("records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }, StoreyBatch.Own(one, reasons)));") // MA-3b: sent by ReportAll; MA-3b2: with its reasons
```

- [ ] **Step 2: See them fail.** `dotnet run --project tools/promote-check` → `740/753 checks pass`: 13 fail on the old code — the seven older checks whose quoted lines are rewritten (§39, §41, §43; two of §43's are C2's) and §45's six.

- [ ] **Step 3: The code.**

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
// ticked is Decline all, which needs a reason (the note).
```

with:

```csharp
// ticked is Decline all, which needs a reason (the note).
// MA-3b2: each group has one reason box — its reason is recorded for that group's unticked rows (result.reasons, beside the note); it is
// taken at the press (read-only from then on), and one with no unticked row to go with is refused in words — and each row has Show:
// select and zoom to its element, or to where a create would be placed.
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
    public event Action<List<string>, List<string>, string> DecideRequested;
```

with:

```csharp
    /// <summary>The ticked, the unticked, the note, and (MA-3b2) a reason per unticked ghost — {proposal_guid: one line}, from each group's
    /// reason box; empty when none was typed.</summary>
    public event Action<List<string>, List<string>, string, Dictionary<string, string>> DecideRequested;
    /// <summary>MA-3b2: a row's Show — the command selects and zooms to its element, or to where a create would be placed.</summary>
    public event Action<ChangesetElementDto> ShowRequested;
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
    private readonly List<Action> _headers = new();
```

with:

```csharp
    private readonly List<Action> _headers = new();
    // MA-3b2: each group's reason box with its rows; and the line a row's Show speaks on — never the status line, which holds the result.
    private readonly List<(string What, TextBox Reason, List<(CheckBox Box, ChangesetElementDto El)> Rows)> _groups = new();
    private readonly TextBlock _shown = new() { Foreground = Brushes.Gray, TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed, Margin = new Thickness(0, 0, 0, 4) };
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
        foot.Children.Add(new TextBlock { Text = "Reviewer note (recorded with the result; Decline all needs one):", Foreground = Brushes.Gray });
```

with:

```csharp
        foot.Children.Add(_shown);
        foot.Children.Add(new TextBlock { Text = "Reviewer note (recorded with the result; Decline all needs one):", Foreground = Brushes.Gray });
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
            var boxes = new List<CheckBox>();
```

with:

```csharp
            var boxes = new List<CheckBox>();
            var mine = new List<(CheckBox Box, ChangesetElementDto El)>(); // MA-3b2: this group's rows, for its reason
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
                boxes.Add(box);
```

with:

```csharp
                boxes.Add(box);
                mine.Add((box, el));
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
                var badge = MakeBadge(el.Verdict);
                DockPanel.SetDock(badge, Dock.Right);
                row.Children.Add(badge);
```

with:

```csharp
                var badge = MakeBadge(el.Verdict);
                DockPanel.SetDock(badge, Dock.Right);
                row.Children.Add(badge);

                // MA-3b2 (zoom to row): the command selects and zooms to the row's element, or to where a create would be placed. A type
                // edit has no place in the model: its Show is disabled and says so.
                var show = new Button
                {
                    Content = "Show", Padding = new Thickness(6, 0, 6, 0), Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center,
                    ToolTip = "Select and zoom to it in the model — a create: zoom the active view to where it would be placed.",
                };
                if (el.Op == "set_parameter") { show.IsEnabled = false; show.ToolTip = ChangesetTrust.NoPlace; ToolTipService.SetShowOnDisabled(show, true); }
                show.Click += (_, _) => ShowRequested?.Invoke(el);
                DockPanel.SetDock(show, Dock.Right);
                row.Children.Add(show);
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace (review C4 — the reason has its own row; the bar is a horizontal StackPanel, which clips):

```csharp
            bar.Children.Add(tick); bar.Children.Add(untick);
            var body = new StackPanel();
            body.Children.Add(bar); body.Children.Add(groupRows);
```

with:

```csharp
            bar.Children.Add(tick); bar.Children.Add(untick);
            // MA-3b2: one reason for this group's unticked rows — recorded per ghost with the result (result.reasons) and on its ledger row.
            // Review C4: on its own row under the buttons, the box filling it (no fixed width: the bar clips, it does not wrap).
            var why = new TextBox { MaxLength = ChangesetTrust.MaxReason, VerticalContentAlignment = VerticalAlignment.Center,
                                    ToolTip = "Optional, one line: why this group's unticked rows are declined. Recorded for each of them with the result — not for a row declined on the web (the web's reason stands)." };
            var whyLabel = new TextBlock { Text = "Reason for the unticked here:", Foreground = Brushes.Gray, Margin = new Thickness(0, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center };
            var whyRow = new DockPanel { Margin = new Thickness(0, 0, 0, 4) };
            DockPanel.SetDock(whyLabel, Dock.Left);
            whyRow.Children.Add(whyLabel); whyRow.Children.Add(why);
            _groups.Add((group.Key, why, mine));
            var body = new StackPanel();
            body.Children.Add(bar); body.Children.Add(whyRow); body.Children.Add(groupRows);
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
        _go.IsEnabled = false;
        Say("Re-checking with the bridge…");
        DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? "");
    }
```

with:

```csharp
        // MA-3b2: each group's reason goes to its unticked rows that may be ticked here (a row the web declined keeps the web's reason). One
        // the bridge would refuse is refused here, before anything is sent — a result refused after Revit placed its elements is not reported.
        var reasons = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var g in _groups)
        {
            var reason = ChangesetTrust.DeclineReason(g.Reason.Text, out var problem);
            if (problem != null) { Say($"The reason for \"{g.What}\" was not taken — {problem}. Nothing was sent."); return; }
            if (reason == null) continue;
            // Review C3 (words are said, never silent): a reason with no row to carry it — none unticked, or every unticked one declined on the web.
            if (!g.Rows.Any(x => x.Box.IsChecked != true && x.Box.IsEnabled)) { Say($"The reason for \"{g.What}\" has no unticked row to go with — untick the rows it is for, or clear it. Nothing was sent."); return; }
            foreach (var r in g.Rows.Where(x => x.Box.IsChecked != true && x.Box.IsEnabled && x.El.ProposalGuid != null)) reasons[r.El.ProposalGuid] = reason;
        }
        _go.IsEnabled = false; Reasons(true); // review C2: the reasons are taken here — a box typed in afterwards would look recorded and not be
        Say("Re-checking with the bridge…");
        DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? "", reasons);
    }

    /// <summary>Review C2: the reason boxes are read-only once their reasons were taken (the press), and editable again only when nothing
    /// was applied (Refused, Reopen) — the next press takes them afresh.</summary>
    private void Reasons(bool taken) { foreach (var g in _groups) g.Reason.IsReadOnly = taken; }
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace (review C2):

```csharp
    public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; });
```

with:

```csharp
    public void Refused(string words) => Ui(() => { Say(words); _go.IsEnabled = !_applied; if (!_applied) Reasons(false); });
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace (review C2):

```csharp
    public void Applying(string words) => Ui(() => { _applied = true; _go.IsEnabled = false; Say(words); });
```

with:

```csharp
    public void Applying(string words) => Ui(() => { _applied = true; _go.IsEnabled = false; Reasons(true); Say(words); });
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace (review C2):

```csharp
    public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Say(words); });
```

with:

```csharp
    public void Reopen(string words) => Ui(() => { _applied = false; _go.IsEnabled = true; Reasons(false); Say(words); });
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace:

```csharp
    public void Retry(bool offered) => Ui(() => { _retry.Visibility = offered ? Visibility.Visible : Visibility.Collapsed; _retry.IsEnabled = offered; });
```

with:

```csharp
    public void Retry(bool offered) => Ui(() => { _retry.Visibility = offered ? Visibility.Visible : Visibility.Collapsed; _retry.IsEnabled = offered; });

    /// <summary>MA-3b2: what a row's Show did, on its own line above the note (the status line keeps the result). Any thread; nothing
    /// once the window is closed — it is about the view, not a result.</summary>
    public void Shown(string words) => Ui(() =>
    {
        if (_gone) return;
        _shown.Text = words ?? "";
        _shown.Visibility = string.IsNullOrEmpty(words) ? Visibility.Collapsed : Visibility.Visible;
    });
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    private static UnreportedResults.Record ResultOf(string key, ChangesetDto cs, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, string doc, List<string> undo) =>
        new UnreportedResults.Record
        {
            Key = key, ChangesetId = cs.Id, Name = cs.Name, Doc = doc, Applied = applied, Rejected = rejected, Note = note, ReviewRev = reviewRev,
            Undo = undo ?? new List<string>(), At = ProvenanceStamp.Now(),
        };
```

with:

```csharp
    // MA-3b2: reasons — the reviewer's reason per rejected ghost of this changeset (StoreyBatch.Own); null when none was typed.
    private static UnreportedResults.Record ResultOf(string key, ChangesetDto cs, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, string doc, List<string> undo,
                                                     Dictionary<string, string> reasons) =>
        new UnreportedResults.Record
        {
            Key = key, ChangesetId = cs.Id, Name = cs.Name, Doc = doc, Applied = applied, Rejected = rejected, Note = note, ReviewRev = reviewRev,
            Undo = undo ?? new List<string>(), At = ProvenanceStamp.Now(), Reasons = reasons,
        };
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                    var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err);
```

with:

```csharp
                    var landed = ChangesetClient.ReportResult(cfg, r.Key, r.ChangesetId, r.Applied, r.Rejected, r.Note, r.ReviewRev, out var reply, out var err, r.Reasons);
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                        rep.Words.Add(taken ?? $"\"{r.Name}\": reported ({ChangesetTrust.LedgerOf(reply)})." + (ChangesetTrust.LateDeclines(reply) is { } late ? "\n" + late : ""));
```

with:

```csharp
                        // MA-3b2: the decline reasons the bridge kept, counted from its reply (claimed vs verified).
                        rep.Words.Add(taken ?? $"\"{r.Name}\": reported ({ChangesetTrust.LedgerOf(reply)})." + ChangesetTrust.ReasonsLine(reply, r.Reasons?.Count ?? 0) + (ChangesetTrust.LateDeclines(reply) is { } late ? "\n" + late : ""));
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
        async Task Decide(List<string> ticked, List<string> unticked, string note)
```

with:

```csharp
        async Task Decide(List<string> ticked, List<string> unticked, string note, Dictionary<string, string> reasons)
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                    Send(ReportAll(cfg, fresh.Select(f => ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null)).ToList()), rep =>
```

with:

```csharp
                    Send(ReportAll(cfg, fresh.Select(f => ResultOf(key, f, new List<AppliedEntry>(), StoreyBatch.Own(f, unticked), note, null, here, null, StoreyBatch.Own(f, reasons))).ToList()), rep =>
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                                $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"), null, here, null)).ToList()), rep =>
```

with:

```csharp
                                $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"), null, here, null, null)).ToList()), rep =>
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                        records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }));
```

with:

```csharp
                        records.Add(ResultOf(key, one, res.Applied, rejected, said, one.ReviewRev, here, new List<string> { undo, UndoWatcher.TxName(one.Name, one.Id) }, StoreyBatch.Own(one, reasons)));
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
        window.DecideRequested += (ticked, unticked, note) => Task.Run(() => Decide(ticked, unticked, note));
```

with:

```csharp
        window.DecideRequested += (ticked, unticked, note, reasons) => Task.Run(() => Decide(ticked, unticked, note, reasons));
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
        window.Show();
        return true;
```

with:

```csharp
        // MA-3b2 (zoom to row): a retype's or attach's element is selected and shown; a create's place is zoomed to in the active view
        // (ChangesetTrust.PlaceBox — mm in the model's internal coordinates, as the executor places it). On Revit's thread through the event
        // hub (DocPin: only while this model is the active one); no transaction, no bridge call; every outcome is said on the window.
        window.ShowRequested += el =>
        {
            var name = ChangesetTrust.GhostName(el);
            if (!string.IsNullOrWhiteSpace(el.Target?.UniqueId))
            {
                App.Events.SelectAndShow(doc, el.Target.UniqueId, gone => window.Shown(gone == null ? $"Showing {name}." : $"{name}: {gone}"));
                return;
            }
            var box = ChangesetTrust.PlaceBox(el.Place);
            if (box == null) { window.Shown($"{name}: its proposal carries no place to show."); return; }
            App.Events.Enqueue(doc, "show the place", (ui, _) =>
            {
                try
                {
                    var uidoc = ui.ActiveUIDocument;
                    var active = uidoc.ActiveGraphicalView; // review C10: a schedule or the project browser is not a view to zoom
                    var view = active == null ? null : uidoc.GetOpenUIViews().FirstOrDefault(v => v.ViewId == active.Id);
                    if (view == null) { window.Shown($"{name}: the active view cannot be zoomed — open a plan view and press Show again."); return; }
                    const double ft = 1.0 / 304.8;
                    view.ZoomAndCenterRectangle(new XYZ(box[0][0] * ft, box[0][1] * ft, box[0][2] * ft), new XYZ(box[1][0] * ft, box[1][1] * ft, box[1][2] * ft));
                    window.Shown($"Showing where {name} would be placed, in the active view ({active.Name}) — a plan of its level shows it best.");
                }
                catch (Exception ex) { window.Shown($"{name}: could not be shown — {ex.GetType().Name}: {ex.Message}"); }
            }, refusal => window.Shown(refusal));
        };
        window.Show();
        return true;
```

In `SentinelAddin/RevitEventHub.cs`, replace:

```csharp
        uidoc.Selection.SetElementIds([id]);
        uidoc.ShowElements(id);
    });
```

with:

```csharp
        uidoc.Selection.SetElementIds([id]);
        uidoc.ShowElements(id);
    });

    /// <summary>MA-3b2 (zoom to row): by UniqueId, and said — <paramref name="said"/> gets null once the element is selected and shown,
    /// else why not: it is gone from the model, the model is not the active one (DocPin's words), or Revit could not show it. The id
    /// overload above stays silent for its callers.</summary>
    public void SelectAndShow(Document doc, string uniqueId, Action<string?> said) => Enqueue(doc, "show the element", (uiapp, d) =>
    {
        try
        {
            if (d.GetElement(uniqueId) is not { } e) { said("not in this model now (deleted, or changed since the proposal was planned)."); return; }
            var uidoc = uiapp.ActiveUIDocument!;
            uidoc.Selection.SetElementIds([e.Id]);
            uidoc.ShowElements(e.Id);
            said(null);
        }
        catch (Exception ex) { said($"could not be shown — {ex.GetType().Name}: {ex.Message}"); }
    }, said);
```

- [ ] **Step 4: See them pass, and build.** `dotnet run --project tools/promote-check` → `753/753 checks pass`. Then, from the repo root:

```bash
for v in 2022 2023 2024 2025 2026 2027; do printf "%s: " $v; dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Warning\(s\)|Error\(s\)" | tr -d '\r' | tr '\n' ' '; echo; done
```

Expected: `0 Error(s)` for each; warnings 2022 `3`, 2023 `3`, 2024 `5`, 2025 `1`, 2026 `1`, 2027 `3` (master's own — none in a file this task touches).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/UI/ChangesetReviewWindow.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/RevitEventHub.cs tools/promote-check/Ma3b2Wiring.cs tools/promote-check/Check.cs tools/promote-check/Ma3bDesk.cs tools/promote-check/Ma2dWiring.cs tools/promote-check/Ma3aReview.cs
git commit -m "feat(addin): MA-3b2 - the review window has one reason box per group (recorded for that group's unticked rows on the result and its kept record; refused before Apply when the bridge would refuse it or when it has no unticked row to go with; read-only once taken; the window says how many the bridge kept) and Show on every row (select and zoom to a retype's or attach's element, zoom the active view to a create's place; a type edit says it has none) - on Revit's thread through the event hub, no transaction, no bridge call" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4 — Words: the design doc; the final checks

**Files:**
- Modify `docs/strategy/2026-09-30-model-automation-design.md`

- [ ] **Step 1: The design doc says what was built.** (The text to find is the end of the line at `:1106`.)

In `docs/strategy/2026-09-30-model-automation-design.md`, replace:

```markdown
Decline all needs a reason, and each report names its ledger row. A reason per declined ghost and zoom to row are MA-3b2.
```

with:

```markdown
Decline all needs a reason, and each report names its ledger row. A reason per declined ghost and zoom to row: BUILT on `feature/ma3b2-decline-reasons` (MA-3b2), drill MA3b2 pending — each group of the review window has one reason box, recorded for that group's unticked rows as the result's `reasons {proposal_guid: text}` (the bridge validates each as one line, stores it beside `declined_on_web` and on the `changeset_applied` row; the window says how many the bridge kept); each row has Show (select and zoom to a retype's or attach's element; zoom the active view to where a create would be placed); a bridge that does not answer is said in plain words (`the bridge did not answer within 8 s`). Revit's reasons on the web desk are MA-3b2b.
```

- [ ] **Step 2: The final checks.** From `WebApp`: `npx vitest run` → `143 passed (143)` files, `2325 passed | 1 skipped (2326)`; restore `ids-cases.json`. From the repo root, every check project:

```bash
for d in tools/*-check; do ls $d/*.csproj >/dev/null 2>&1 || continue; printf "%s: " $(basename $d); dotnet run --project $d 2>&1 | grep -E "checks? pass|DATUM OK" | tail -1; done
```

Expected: 26 lines, each `n/n checks pass` — `promote-check: 753/753`, `session-check: 47/47`, the other 23 as on master (together `2370/2370`) — and `datum-check: DATUM OK`. `tools/rvtinfo-check` has no project and is skipped.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -m "docs: MA-3b2 - the design doc says what was built (a reason per declined ghost, Show on every row, the bridge's failures in plain words); drill MA3b2 pending" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Live drill MA3b2 (Revit 2024, one scratch copy, the test bridge behind the drill proxy, no web rows — on the branch, before the merge)

**The founder's OK first.** The set-up's build deploys the branch's add-in into Revit 2024. That needs the founder's explicit OK in chat for this drill; without it, nothing below runs and every row is **owed**.

**Who does what.** The drill runner drives Revit by mouse (or UI Automation's Invoke, as in MA2c–MA3b) and the bridge calls. Revit is signed in (the founder; Standards ▸ Sign in, their password — the founder's). **Focus-sensitive steps** — clicking in Revit's view, **Ctrl+Z**, reading the review window, looking at what Show did — happen while Revit is in front, or are the founder's: a script cannot take focus from Chrome, and Revit's owned windows hide from UI Automation while Revit is in the background (a hidden window looked closed in MA3a). TaskDialog buttons have no UIA Invoke (`WindowPattern.Close` works). Revit's Undo list opens at its dropdown (`133,10`): read it, **never click an entry** (a click undoes) — Z-4's one Undo is **Ctrl+Z**, pressed once. The pane's grid virtualizes (read it through `ScrollPattern`). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window. Open the scratch copy from Revit's Open dialog.

**The Revit MCP in this drill:** only its read-only calls, never while a Revit command, a TaskDialog or a Sentinel window is open.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run (tight scope); the code is the same on net8/net10 and builds there (Task 3).
- **Revit's reasons on the web desk**: not built — MA-3b2b (F4).
- **A reason on a Decline all**, **a reason on a storey of several changesets** (split per part), **a reason sent to a bridge before MA-3b2** (the ⚠ line), **a result sent again later with its reasons**: checked offline (§44, §45, vitest), not provoked.
- **Show on an element that is gone**, **Show while another model is active** (DocPin's words), **Show in a view that cannot be zoomed**: checked by scan (§45), not provoked.
- **Show on a type edit** (disabled, with its words): a row of Z-1 only if the storey Promote files carries a type edit; otherwise owed (scan only).
- **R-5** of MA3b (a waiting result undone, then asked of the bridge — `Gone`'s path): still owed; Z-4 is the other path (the result lands, then its Undo is posted).
- **Z-4** needs one Ctrl+Z, an Undo-list read, the window closed, a ribbon press and a TaskDialog read inside a 95-second wait (review C5): what is not done in time stays **owed** (C8 live, or the hold) and the row records what was seen.

**Set-up (once):**
- **Build.** Close Revit. Record the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`, lower case). With the founder's OK: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build); record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The add-in's bridge settings.** Copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma3b2bak` beside it (never print it, never open it in a viewer); point it at the drill's port: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The test bridge on 127.0.0.1:4102, behind the drill proxy on 4101** (drill MA3b's R-A2: no port is handed between two processes mid-row). Two preview servers, added to `.claude/launch.json` beside `bridge-test` and removed in the closing list:
  - `ma3b2-bridge` — `node <scratchpad>/ma3b2/bridge-4102.mjs`, `cwd` `WebApp`, port 4102; the file is three lines: `process.env.BCF_PORT = "4102"; process.env.BCF_EVENT_POLL_MS = "0"; await import("file:///C:/Users/yazan/Claude/Projects/Co%20BIM%20Assistant/sentinel-project/WebApp/bridge/bcf-service.mjs");` (this checkout's bridge — the branch's, Task 1). Its banner names port 4102.
  - `ma3b2-proxy` — `node <scratchpad>/ma3b2/proxy.mjs`, port 4101, with `SLOW_MS=95000` (the script's default; review C5 — under the client's 120 s write timeout). The amender left the file there; if it is gone, write it again:

    ```js
    // Drill MA3b2's door: 127.0.0.1:4101 -> the test bridge on 127.0.0.1:4102. A file beside this script sets its mood:
    // "slow" delays the answer to the FIRST POST .../result by 95 s (the bridge has taken it; Revit still waits; a storey filed as
    // several parts waits once - review C5; restart the proxy to delay another); "silent" answers nothing.
    import http from "node:http";
    import { existsSync } from "node:fs";
    const mood = (m) => existsSync(new URL(m, import.meta.url));
    const SLOW_MS = Number(process.env.SLOW_MS || 95000);
    let slowed = false;
    http.createServer((req, res) => {
      if (mood("silent")) return; // accepted, never answered
      const slow = !slowed && mood("slow") && req.method === "POST" && req.url.endsWith("/result");
      if (slow) slowed = true;
      const wait = slow ? SLOW_MS : 0;
      const up = http.request({ host: "127.0.0.1", port: 4102, method: req.method, path: req.url, headers: req.headers }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => setTimeout(() => { res.writeHead(r.statusCode, r.headers); res.end(Buffer.concat(chunks)); }, wait));
      });
      up.on("error", (e) => { res.writeHead(502, { "Content-Type": "text/plain" }); res.end("drill proxy: the test bridge on 4102 did not answer - " + e.message); });
      req.pipe(up);
    }).listen(4101, "127.0.0.1", () => console.log("drill proxy on 127.0.0.1:4101 -> 4102"));
    ```

    A mood is an empty file beside it: `touch <scratchpad>/ma3b2/slow` / `rm …/slow`, the same for `silent`. Neither exists at the start.
  - `curl -s http://127.0.0.1:4101/health` answers through the proxy. The founder's 4100 bridge is not touched. Every bridge call of the runner names `http://127.0.0.1:4101` through MA2e's helper (the machine credential, read through `load-env.mjs`, never printed):

  ```bash
  b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
  ```

- **The scratch web projects** (from `WebApp`; fresh keys — `ma3b`'s storeys are already decided): `b4101 POST cde/projects '{"key":"ma3b2-office","kind":"office"}'`, `b4101 POST cde/projects '{"key":"ma3b2","office_key":"ma3b2-office"}'`; on the OFFICE: `b4101 PUT "cde/ma3b2-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma3b2-office/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json`, `b4101 PUT "cde/ma3b2-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`, `b4101 PUT "cde/ma3b2-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json` (each 201). The founder's membership (the e-mail never reaches a command line, a log or the record): the founder writes `{"email":"<their account>","role":"contributor"}` to `<scratchpad>/ma3b2/member.json`; the runner sends `b4101 POST cde/ma3b2/members @<scratchpad>/ma3b2/member.json | grep -oE '^[0-9]+|"user_id":"[^"]*"'` (the status and the `user_id` only; record those) and deletes the file.
- **The scratch model**: `Documents\Sentinel drills\ma3b2\ma3b2-a.rvt`, a copy of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), opened from Revit's Open dialog, bound with Sentinel ▸ Project Setup to `ma3b2` (current-project scope), never saved. A floor plan of GR-FFL is the active view.
- **Promote once**: Sentinel ▸ Promote (DD) → **Yes**; close the review window it opens with ×. Record what it filed (drill MA3b: GR-FFL 48 ghosts — `retype wall (24)` first — 01-FFL 40, MA0 Roof 1, a create).

| Row | Steps | Pass when | Record |
|---|---|---|---|
| Z-1 — Show | Review AI Proposals ▸ GR-FFL ▸ **Review**. With Revit in front: press **Show** on the first `retype wall` row; look at the view; read the Properties palette's type selector; read the grey line above the note. If the window has a `set_parameter` group: read its row's Show (UIA `IsEnabled`, and its tooltip by hovering). Close the window with × (nothing is declined). Review AI Proposals ▸ MA0 Roof ▸ **Review**; press **Show** on its row; look at the view; read the line; close with × | The line reads `Showing retype wall "<name>".` and Revit shows that wall selected: the Properties palette's type selector reads `Walls (1)` (review C11 — the line alone is a claim; if the palette does not show one wall, the row **fails**) and the view is on it. A type edit's Show is disabled and says `A type edit has no place in the model — it reaches every element on its type (the row says how many).` (owed when the storey has none). The roof's line reads `Showing where create roof "<name>" would be placed, in the active view (<view name>) — a plan of its level shows it best.` and the active view is zoomed to the building's outline. Neither window's status line changed; the Undo list is unchanged (Show writes nothing) | Each line; the Properties palette's type selector after the wall's Show; a screenshot of the view after each Show; the Undo list before and after |
| Z-2 — reasons | Review AI Proposals ▸ GR-FFL ▸ **Review**. Pick `<G>` (review C6): the first group after `retype wall (24)` whose header does not start with `set_parameter` (a type edit — declining one makes later storeys' retypes onto its types fail the DD IDS and muddies Z-4); prefer `attach`; record its header. If only type edits follow, `<G>` is `retype wall`: untick 3 of its rows by hand in place of **Untick group** below. **First (review C3), with `<G>` still ticked:** put `drill MA3b2: no row yet` in its reason box (on its own row under Tick group / Untick group); press **Apply … ticked in Revit**; read the status line. **Then:** **Untick group**; put `tab<TAB>here` in its reason box (UIA `ValuePattern.SetValue` with a real tab character, or paste); press **Apply … ticked in Revit**. Then replace the box's text with `drill MA3b2: these stay as they are until the slab is set`; press Apply; at the DD IDS dialog, **Place anyway**. When the window's words arrive: `b4101 GET changesets/ma3b2/<GR-FFL id>`, `b4101 GET "cde/ma3b2/audit?entity_type=changeset&limit=3"` | The press with nothing unticked in `<G>`, at once, no bridge call: `The reason for "<G>" has no unticked row to go with — untick the rows it is for, or clear it. Nothing was sent.`, Apply still enabled, the box still editable. The tab press, at once, no bridge call: `The reason for "<G>" was not taken — a reason is one line of at most 500 characters. Nothing was sent.`, Apply still enabled. The last: the reason box is read-only from the press (UIA `ValuePattern.IsReadOnly`, review C2); `Applied <a> element(s) from "Promote (DD) · GR-FFL".` … `"Promote (DD) · GR-FFL": reported (ledger #<n>).` and, on the next line, `<k> decline reason(s) recorded with it.` — `<k>` the unticked rows of `<G>` (its row count; 3 on the fallback), `<a>` = 48 − `<k>`. GET: `"status":"partially_applied"`, `result.rejected` `<k>` guids, `result.reasons` an object of `<k>` keys — each a rejected guid, each value the typed line. The newest audit row is `changeset_applied` #`<n>` and its after-object carries the same `reasons` | The window's text all three times; the box's read-only state after the last press; `<G>`, `<k>`, `<a>`; the ledger id; GET's `result.reasons` (two entries quoted, the count of the rest); the audit row's `reasons` count |
| Z-3 — plain words | `touch <scratchpad>/ma3b2/silent`; Review AI Proposals; wait 10 s; read the picker; close it. `rm …/silent`; stop the `ma3b2-proxy` preview; Review AI Proposals; read the picker; close it. Start `ma3b2-proxy` again | The first picker: `Couldn't reach the bridge:` then `the bridge did not answer within 8 s` (never `A task was canceled.`). The second: `Couldn't reach the bridge:` then `the connection failed — <the cause, naming 127.0.0.1:4101>` (never `An error occurred while sending the request.`) | Both pickers' text, whole (UNSURE 4) |
| Z-4 — C8 live and the report's own hold | Review AI Proposals ▸ 01-FFL ▸ **Review** (all ticked). `touch <scratchpad>/ma3b2/slow`. Press **Apply 40 ticked in Revit**; at the DD IDS dialog, **Place anyway**; note the time. As soon as the window reads `Reporting to the bridge…`, with Revit in front (click Revit's title bar): **Ctrl+Z** once (the founder's, or the runner's while Revit is in front); read the Undo list (never click an entry). Close the review window with ×; press Review AI Proposals on the ribbon; read the TaskDialog and close it (`WindowPattern.Close`). Wait for the report's own TaskDialog (about 95 s after Place anyway — the proxy delays only the first `/result`, so a storey filed as several parts waits once; review C5); read it, close it; note the time. `rm …/slow`. `b4101 GET changesets/ma3b2/<01-FFL id>`, `b4101 GET "cde/ma3b2/audit?entity_type=changeset&limit=4"`; list `%AppData%\Sentinel\unreported\ma3b2\` | Revit takes the Ctrl+Z while the report waits: the Undo list no longer holds `Sentinel AI changeset: Promote (DD) · 01-FFL […]`. **The hold:** with the window closed and the report still out, the ribbon answers `A review window is open, or a result is still being reported to the bridge — finish or close the window, or wait for its report (two minutes at most), then run Review AI Proposals again.` **C8:** the report's TaskDialog reads `Applied 40 element(s) from "Promote (DD) · 01-FFL".` … `"Promote (DD) · 01-FFL": reported (ledger #<m>).` and `"Promote (DD) · 01-FFL": undone in Revit while its report was in flight — a changeset_reverted row (undo) was posted for its 40 element(s).`; it arrives 90–115 s after Place anyway (review C5). GET: `"status":"applied"`; the two newest audit rows are `changeset_reverted` (op `undo`, 40 guids) above `changeset_applied` #`<m>`; the folder holds no file | The Undo list before and after Ctrl+Z; the ribbon's words; the TaskDialog's text; the two times; the two audit rows' ids and actions; the folder listing |

The rows run in the order Z-1, Z-2, Z-3, Z-4 on the same session. If Promote filed other names or counts than drill MA3b's, the rows use what it filed and the record says so.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA3b2 — a reason per declined ghost, zoom to row, plain bridge words, live (<date> ~hh:mm → hh:mm local, branch feature/ma3b2-decline-reasons <sha>, Claude driving Revit 2024)`: the Setup paragraph (deploy on the founder's OK with the DLL sha before and after, settings at 127.0.0.1:4101, the proxy and the bridge on 4102, the scratch office and project, the membership, the sign-in state, the scratch copy, not saved), the table `| Row | Result | Evidence |` with **pass**/fail and the window's and the picker's text quoted, plus ledger `#n`; then Z-amendments, F-MA3b2-n findings each fixed on the branch ("fix(drill MA3b2): …" with its check) and their shas, and the **owed** rows at its end.

**Closing list:**
- close Revit without saving the scratch copy;
- stop `ma3b2-proxy` and `ma3b2-bridge`; delete the `slow` and `silent` files if either is left; remove the two entries from `.claude/launch.json`; the founder's 4100 bridge is not touched;
- restore the add-in's bridge settings: copy `bcf-config.json.ma3b2bak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed — **a deploy too: only under the founder's same explicit OK (review C12)**: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, and record the deployed DLL's sha256 beside the hash recorded before. Without that OK, or if the session's permission check refuses that build, say so: the branch's add-in stays until the merge's deploy — safe: with master's 4100 bridge a reason is sent, not kept, and the window says so (`⚠ … the bridge kept 0`);
- list what the drill left on the shared ledger — the scratch office `ma3b2-office` (`guideline@1`, `type_catalog@1`, `lod_matrix@1`, `ruleset@1`), the project `ma3b2`, the membership, the changesets (GR-FFL partially applied, 01-FFL applied and reverted, MA0 Roof proposed) and their rows — left in place on purpose (scratch keys);
- list what the drill left on this PC outside the repository: `%AppData%\Sentinel\unreported\ma3b2\` (deleted with its files, if any: a scratch key), `%AppData%\Sentinel\cache\ma3b2*` (deleted: scratch keys only), the scratch copy in `Documents\Sentinel drills\ma3b2\` (kept, named, as evidence; never committed), `<scratchpad>/ma3b2/` (the proxy and the bridge script; not the repository).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record — **Z-2 is never owed at the merge**: without it nothing proves live that a reason typed in Revit reaches the result and the ledger row; the merge waits for a session that runs it. Z-4 may be owed (it carries MA3b's owed rows; the code is MA-3b's, merged);
- the founder confirmed F4 (Revit's reasons on the web desk are MA-3b2b), or asked for B — then B is its own plan and this merge still stands;
- each F-MA3b2-n fix is committed on the branch with its check, and Task 4 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does was deployed and its row run again live before the merge; a row whose fix was not run again is **owed**, not passed.

**The design doc says what the drill proved**, committed on the branch before the merge: replace `BUILT on \`feature/ma3b2-decline-reasons\` (MA-3b2), drill MA3b2 pending` with `LANDED in MA-3b2 (merge <date>), drill MA3b2: <passed rows; owed rows>` — `git commit -m "docs: MA-3b2 - drill MA3b2's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma3b2-decline-reasons -F - <<'EOF'
Merge feature/ma3b2-decline-reasons: MA-3b2 - a reason per declined ghost, zoom to row, and the bridge's failures in plain words: each group of Revit's review window has one reason box, recorded for that group's unticked rows as the result's reasons {proposal_guid: text} - the bridge validates each (a ghost the result rejects, one line of at most 500 characters), stores it beside declined_on_web and on the changeset_applied row, and the window says how many it kept; a result kept on this PC keeps its reasons; every row has Show (select and zoom to a retype's or attach's element, zoom the active view to a create's place; a type edit says it has none); the changeset client says a timeout as "the bridge did not answer within N s" and a failed connection by its cause, for every caller. Revit's reasons on the web desk are MA-3b2b (founder decision F4). Drill MA3b2: <the result and the owed rows>. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order** (either order works — a bridge before MA-3b2 ignores `reasons`, and the add-in then says `⚠ … the bridge kept 0`; an add-in before MA-3b2 sends none — the bridge first, so the first reason typed after the deploy is kept):
1. **The bridge — the founder restarts the 4100 bridge** on master (`changesets-logic.mjs` and `changesets-store.mjs` changed; no bundle rebuild, no migration).
2. **The add-in**, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same for each other Revit version the founder uses.
3. No web publish (no web change).

## UNSURE facts this drill settles

1. Whether `UIView.ZoomAndCenterRectangle` on the active floor plan shows the rectangle `PlaceBox` gives (model points in internal coordinates), and what a 3D view does with the same corners — Z-1.
2. Whether `ShowElements` on a wall in the active plan zooms without Revit's own "no good view" dialog — Z-1.
3. Whether the reason row (the label, the box filling the rest — review C4) reads well under the buttons in the 640 px window, and whether a disabled Show's tooltip shows (`ToolTipService.SetShowOnDisabled`) — Z-1, Z-2. A reason box that cannot be reached or read is a finding, not cosmetic.
4. The words net48 gives for a refused connection (expected the socket's `No connection could be made because the target machine actively refused it 127.0.0.1:4101`) and for the 8-second read timeout (expected the cancelled request → `the bridge did not answer within 8 s`) — Z-3 records them whole.
5. Whether the B35 seed's GR-FFL storey carries a `set_parameter` row (a type edit's disabled Show) — Z-1.
6. Whether UI Automation can put text into the group's reason box (`ValuePattern`), a tab included — Z-2; if not, the founder types the reason and the refusal half of Z-2 is owed (checked offline, §44/§45).
7. Whether Revit takes Ctrl+Z while the review window is open and its report waits, and whether the Undo of a storey's group fires the watcher's `Seen` with the group's name (`UndoWatcher.Expect` holds both names) — Z-4.
8. Whether net48 reuses a kept-alive socket to the proxy across its stop and start (MA3b's UNSURE 7) — Z-3's second picker says; a stale socket would read as a failed connection too, which is the truth.

## Risks (each a ceiling stated in words)

- **A result whose reasons the bridge refuses (400) loses its record** (`Outcome`: a 400 never heals), with its elements in the model — MA-3b's words say so. The window refuses such a reason before Apply by the same fixture rule (E5), and every key is a rejected ghost by construction; the ceiling is a bug in either (review C8: the bridge still refuses rather than dropping a bad reason — dropping is more scope than it is worth here).
- **Revit's reasons are not on the web desk** (F4): a web reviewer sees them only in the ledger row's body or by `GET`. MA-3b2b.
- **The audit panel prints a row's action, not its body** (`cde-panel.ts renderAudit`): the reasons are on the row, not on that screen.
- **Show on a create zooms the active view only** (F6 A): in a 3D or section view, or a plan of another level, it may show little; the words name the view and say a plan of its level shows it best. A proposal whose place has no point (a level, a grid) says it has no place to show.
- **Show is refused while another model is the active one** (DocPin) — said on the window's line, and in the Doctor log.
- **`the connection failed — <cause>` carries Windows' own sentence** (E8), in Windows' language; a proxy or a TLS failure would read as its innermost message.
- **The plain words reach Ghost Builder's and Promote's dialogs too** (F5 A) — the same client; their flows are unchanged (their waits are MA-3b4). A sign-in that fails inside a request keeps the session's own words there (review C1).
- **A row ticked or unticked after the press is not locked** (MA-3b's, unchanged): only the reason boxes are read-only from the press (review C2).
- **A bridge before MA-3b2 keeps no reason**: the window says `⚠ <n> decline reason(s) were sent and the bridge kept 0 …`; they are then only in that window (and in the kept record while the result waits).

## Not settled (for the founder or the reviewer)

- **F4** — the entry said "shown on the web review desk"; this plan does not build that. Confirm A, or ask for B as its own slice.
- **The commit trailer.** The planner's brief names `Claude Opus 5.5`; this session's attribution line is `Claude Fable 5.1`, and the brief carries no user authority over it. The plan's commands use the session's line; change them if the founder wants the other.
- **Whether the storey Promote files on a fresh key matches drill MA3b's** (48 / 40 / 1, a `set_parameter` row or none): the rows use what it files.

## Next (out of scope here)

- **MA-3b2b — Revit's reasons on the web desk** (web + a small bridge read). The desk reads `GET /changesets/:key?status=proposed` only; a "recently decided" section needs a second read (`listChangesets` takes any status), rows that show `result.reasons` and `result.note` beside `declined_on_web`, web rows in a drill and a That Open publish. `result.reasons` is free text typed in Revit: render it as text (`textContent`), never as HTML (review C13). Optionally the ledger panel prints a `changeset_applied` row's reasons. Why later: a web slice with web rows; the ledger row carries the reasons meanwhile. Size S.
- **A reason box per row** (F1 B): when reviewers ask; no contract change (`reasons` is already per ghost).
- **MA-3b3 — the Revit "ticked" lock and the carried decline** (Revit + bridge + web desk): as in the MA-3b plan's Next (bridge state and a route; the desk refusing a decline on a locked ghost; C4's carry-forward with the founder's A/B). Size M–L.
- **MA-3b4 — nothing in modelling waits**: a waiting result sent by itself on `DocumentOpened` with a line in the pane's Doctor log; Ghost Builder writes the same record before its report and stops waiting (and sends reasons, if it ever declines by reason); Promote's reads (`Commands.PromoteWalls.cs:49`, `:61`) and its filing (`:191`) off the thread.
- **MA-3c — the ghost overlay** and **MA-3d — web highlights and the proposal model**: as in the MA-3a plan's Next.
- Owed rows carried: MA3b's R-5; Revit 2025–2027 for the review (MA-3a, MA-3b, MA-3b2); MA3a's D-4 second account and a late decline applied over; and from MA2e — Revit 2025–2027 for Annotate, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy.
