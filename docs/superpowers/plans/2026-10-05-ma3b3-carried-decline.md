# MA-3b3 — A decline carried forward to the next filing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The MA-3b2b plan's "Next ▸ MA-3b3" (`docs/superpowers/plans/2026-10-04-ma3b2b-desk-reasons-closed-window.md`), as one drillable slice:
- **A decline is carried forward (founder decision: option A — the bridge stamps it at filing).** When a changeset is proposed, a ghost that proposes the same change as one declined before on the project — a web decline still standing, or a row rejected in Revit **with a reason for that ghost, reported by a signed-in member** (C1) — is filed already declined: `review = {state: "declined", …, rev: 0, carried_from: {changeset, name, proposal_guid, origin: "web" | "revit"}}`, with the earlier decline's words, who made it and where it came from. The match is the bridge's, on what it stored; a posted `review` is never kept. A re-opened decline is not carried. What cannot be matched safely is not carried and **said**: counted on the changeset (`carry`), on the filing's one ledger row, and in Revit's review window.
- **It opens declined everywhere, with words that name its origin.** Revit's Review AI Proposals shows it unticked and locked (no logic change: `ChangesetTrust.DeclinedOnWeb` reads the state); the row, the header, the picker line and the group header say it was carried, and from where. The web desk says the same; a lead re-opens it there as any decline.
- **The Revit "ticked" lock (MA-3a F2 C / S4) is decided: not built** — moved to Next with the reason (F6).
- **Drill MA3b3** — short: one script row on the test bridge, three Revit rows on Revit 2024, one web row.

**Source of truth:** the MA-3b2b plan's Next; the MA-3b plan's Next (`docs/superpowers/plans/2026-10-04-ma3b-revit-review-no-wait.md` ▸ MA-3b3: options A and B); the MA-3a plan (`docs/superpowers/plans/2026-10-04-ma3a-binding-web-decline.md`): amendment C4 ("a decline binds its changeset only — … carrying it is MA-3b"), F2, S4, and its Risks line "A decline inside Apply's seconds"; `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` ▸ sessions MA3a … MA3b2b. Base: `feature/ma3b3-carried-decline` at master `64d81f7` (MA-3b2b merged). Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight — one drillable slice, about 230 lines with its checks):** the pure matcher and its fixture; its wiring into `proposeChangeset`; the reporter's role stored with a result (C1); the store's list read in pages (C3); the words in Revit and on the web desk. Left to **Next** with reasons: the "ticked" lock; a Revit decline with no reason carried (it needs Revit to say which rows a person unticked); Promote not filing a storey whose every ghost is carried; a declined create carried; a `status`/`limit` on the bridge's list; MA-3b4; MA-3c/d.

**Architecture:**

*Bridge, pure (`changesets-logic.mjs`; vitest).* `carryKey(el)` — what a ghost changes, as one text: the op, the kind, the target's UniqueId in lower case, and what it sets (a retype's `place.TypeName` and `place.FamilyName`; an attach's `place.BaseLevel` and `place.TopLevel`; a set_parameter's `parameter` and `to`). Null for a create. `carryDeclines(elements, earlier)` reads every earlier changeset as one decision per ghost and sorts the decisions by **when each was made** (C2); the newest decision on a key stands (applied → nothing; declined on the web → carried; rejected in Revit with its own reason, reported by a signed-in member → carried, with that member's role (C1); the same reported by the machine credential, or with no role stored → not carried, counted `unverified`; re-opened → nothing; rejected with no reason → not carried, counted). It answers the elements stamped, the carried list, and three counts (`no_reason`, `creates`, `unverified`). `declineWords(review)` says a decline's origin for a refusal.

*Bridge, store (`changesets-store.mjs`; vitest).* `proposeChangeset` reads the project's changesets (`docList`, already injected) **before** the referee writes anything — a read that fails is a 503 in words and nothing is filed —, stamps the elements after `attachVerdicts`, stores `carry: {carried, no_reason, creates, unverified}` on the doc when any is above 0, and puts `carried`, `carried_from` and `not_carried` on the filing's own `changeset_proposed` row. A result that applies a carried ghost is the 409 — with or without a `review_rev` (C6); its words name the origin. `reportResult` stores the role the bridge read for the reporter (`result.reported_role`: a member's role, or `"service"` — C1). `reopenGhost` is unchanged; its row gains `carried_from`. `cde-store.docList` reads in pages of 1000 (C3). **No new route, no new table, no migration.**

*Revit (`ChangesetClient.cs`, `StoreyBatch.cs`, `ChangesetReviewWindow.cs`; promote-check §48).* `ReviewDto.CarriedFrom`, `ChangesetDto.Carry`. `ChangesetTrust.ReviewLine` and `DeclinedHeader` name the origin (MA-3a's C4 sentence is replaced); `DeclinedCount` gives the picker line and the group header one count ("2 declined (2 carried)"); `NotCarriedLine` says what the bridge could not carry. No Revit API call, no HTTP call, no model write is added.

*Web (`review-desk.ts`; vitest).* `declinedBy` names a carried decline's origin in `reviewWords` and in "Recently decided in Revit"; the intro no longer says a declined ghost is proposed again undecided. `1.0.42` → `1.0.43`; **the publish is the founder's**.

**Tech Stack:** the Node bridge (`WebApp/bridge`, ES modules, vitest 2); the C# add-in (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF); the offline check `tools/promote-check`; the web app (TypeScript, That Open, vitest 2). The Supabase ledger is written through the bridge's existing `audit` and `docInsert`.

## Global Constraints

- Branch `feature/ma3b3-carried-decline` (it holds this plan, on `64d81f7`); merge `--no-ff` into master only after every task's checks pass **and the live drill MA3b3 is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **The bridge holds the trust rule and the add-in re-checks.** The carry is decided by the bridge from its own stored documents. A posted `review` is not kept (`validateChangeset` lists it under `ignored`); no client field can claim a decline or clear one. Revit's lock is `ChangesetTrust.DeclinedOnWeb` (the state), unchanged; Apply's re-check on fresh copies (`DeclinedTicked`) is unchanged.
  - **Never a guess.** A rejection in Revit with no reason for the ghost is not a decline (the stored result cannot tell an unticked row from an element Revit removed at commit or an Apply that rolled back). A create is never matched. A read of the earlier changesets that fails refuses the filing.
  - **Words are said, never silent.** What was carried and what was not is on the 201 reply, on the stored changeset, on the ledger row and in Revit's window.
  - **Claimed vs verified.** A carried decline's `by`, `role`, `at` and `reason` are copied from what the bridge stored for the earlier decline; a Revit decline's `role` is the role the bridge itself read for the reporter when the result came in (`result.reported_role`, C1) — a result the machine credential reported (its `actor` is whatever the caller posts), or one with no role stored, is never a decline.
  - **Nothing MA-3a … MA-3b2b hold is loosened**: `review_rev` swaps, the 409 for a decline Revit had seen, the machine credential never reviews, a lead re-opens, the record before the send, one Apply per window; no `GetAwaiter().GetResult()` and no `.Wait(` is added to `Commands.ReviewChangesets.cs`.
  - **Every Revit write stays inside one TransactionGroup per Sentinel action (XC-2)**: this slice writes nothing to the model.
  - **Text, never HTML** on the desk: no `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` in `review-desk.ts`.
  - **No new route, no new database table, no migration, no new HTTP call in the add-in.**
- After the add-in task, the builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false` for 2022–2027. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (net48 has only `System`, `System.Collections.Generic`, `System.Linq` as global usings).
- Checks: from `WebApp`, `npx vitest run <files>`; from the repo root, `dotnet run --project tools/promote-check`. A full vitest run rewrites `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with LF only: when `git diff --ignore-all-space --stat` on it is empty, `git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by source scans and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100; never publish to the That Open platform (the publish is the founder's, after the merge).
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never print the founder's e-mail address (a carried decline shows the earlier decliner's account on screen — a record of a drill row says "the founder's account" or `<account>`, never the address; no screenshot of the desk or of the review window's rows); never commit a `.rvt`. The repository is PUBLIC. The fixtures use `example.com` accounts only.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Line numbers are `64d81f7`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs. A new file may be written with LF (git normalises it).

**Dry run (planner, 2026-10-04 — before the review amendments; the totals in the steps are the amender's run below).** A detached worktree of `feature/ma3b3-carried-decline` at `64d81f7` in the session's scratchpad (`scratchpad/ma3b3/dry`, `WebApp/node_modules` linked in as a junction; the junction, then the worktree, removed afterwards — never the repository). The brief asked for Tasks 1–2; **Tasks 1–4's code** was applied, in order, **from this document's code blocks** (a script holds each block once; it applied them — each replace matched its text exactly once — and wrote them into this plan), each "see it fail" run before its code and each "see it pass" run after. The totals in the steps are this run's:
- Base, measured first: `bridge/changesets-review.test.mjs` `22 passed (22)`, `bridge/changesets-store.test.mjs` `57 passed (57)`, `src/setups/review-desk.test.ts` `19 passed (19)`; `promote-check` `769/769` (the brief said 695/695 and the MA-3b2b plan 766/766 — both from before MA-3b2b's last review fixes).
- Task 1: `8 failed | 22 passed (30)` (`TypeError: carryDeclines is not a function`, and the like) → `30 passed (30)`.
- Task 2: `5 failed | 57 passed (62)` → `62 passed (62)`; the full `npx vitest run` `143 passed (143)` files, `2347 passed | 1 skipped (2348)` (master 2334 + 13); `ids-cases.json` rewritten LF-only with no other change and restored.
- Task 3: the build fails (`error CS1061: 'ReviewDto' does not contain a definition for 'CarriedFrom'`, `error CS0117: 'ChangesetTrust' does not contain a definition for 'DeclinedCount'`, and the like) → `779/779 checks pass` (769 + 10); builds with `-p:DeployToRevit=false`: 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — master's own counts.
- Task 4: `3 failed | 19 passed (22)` → `22 passed (22)`; `npx tsc --noEmit -p .` names no error in `review-desk.ts` or its test, and the same count of errors before and after (18 in the scratch tree: the checkout's 17 and `./generated/fragments-worker`, a generated file a fresh worktree does not hold).
- Task 5 (final): the full `npx vitest run` `143 passed (143)` files, `2350 passed | 1 skipped (2351)` (master 2334 + 16); all 26 check projects: the 25 that count `2396/2396` (master 2386 + 10), `datum-check` `DATUM OK`.
- Not run: the drill (a test bridge, Revit, the local app), the drill's script `b1.mjs` (it needs the test bridge running), the design-doc edit of Task 5 and the tasks' commit commands.

**Dry run again (amender, 2026-10-04, after review amendments C1–C11).** A fresh detached worktree of `feature/ma3b3-carried-decline` at `616040a` in the scratchpad (`scratchpad/ma3b3/dry`, `WebApp/node_modules` as a junction; the junction, then the worktree, removed afterwards). A script read **this document** and applied every "Create / replace … with / add at the end" block of Tasks 1–5 in order (each replace matched its text exactly once), each test step before its code step; then the tree was reset and all five tasks were applied once more from the final document — the same diff, byte for byte. The totals in the steps are this run's:
- Task 1: `11 failed | 22 passed (33)` → `33 passed (33)` (8 planner cases + C1, C2, C7).
- Task 2: `7 failed | 64 passed (71)` over the store's file and `cde-store-oracle.test.mjs` → `71 passed (71)`; the full run `143 passed (143)` files, `2352 passed | 1 skipped (2353)` (master 2334 + 18).
- Task 3: the build fails (`CS1061` `CarriedFrom`, `Carry`; `CS0117` `DeclinedCount`, `NotCarriedLine`; `CS0246` `CarryDto`) → `779/779 checks pass`; builds with `-p:DeployToRevit=false`: 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — master's own counts.
- Task 4: `3 failed | 19 passed (22)` → `22 passed (22)`; `npx tsc --noEmit -p .` 18 `error TS` lines before and after in the scratch tree, none in `review-desk.ts` or its test.
- Task 5 (final, on the tree applied from the final document): the full `npx vitest run` `143 passed (143)` files, `2355 passed | 1 skipped (2356)` (master 2334 + 21); `ids-cases.json` rewritten LF-only with no other change and restored; all 26 check projects: the 25 that count `2396/2396`, `datum-check` `DATUM OK`.
- Not run: the drill, its script `b1.mjs`, and the tasks' commit commands.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts. **F1 is made** (the founder's "A"). **F7 is not a default: it needs the founder's explicit words in chat.**

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | Where a decline is carried | **A:** the bridge stamps the `review` at filing (trust stays in the bridge; Revit and the desk read it as any decline). **B:** Promote files the ghost as an exception row with the decline's words (add-in only) | **A — made by the founder** |
| F2 | Which Revit rejections are a decline that carries | **A:** only a ghost the stored result holds a reason for (`result.reasons[guid]`, MA-3b2's group reason box). A rejection with no reason of its own is **not carried, counted and said** ("rejected in Revit before with no reason of their own — proposed again, undecided … A reason in the group's box makes a decline carry."). **B:** every rejected ghost, with or without a reason (the brief's words). **C:** B, after Revit sends which rows a person unticked (a new result field; Next) | **A** — `result.rejected` also holds every ghost of an Apply that rolled back and every element Revit removed at commit (`Commands.ReviewChangesets.cs`: the rollback reports `f.Elements` all rejected; `oneGone` joins the unticked rows). Under B a rolled-back storey would be filed fully declined on the next Promote run — ghosts the reviewer had **ticked** — and only a lead could re-open them, one by one. A Decline all whose only words are the changeset's note is not carried either (same shape as a rollback); a reason in a group's box is. S1 |
| F3 | When several changesets hold the same change | **A:** the newest decision stands (by **when the decision was made** — C2: a web decline's or a re-open's `review.at`, a result's `reported_at`; never the changeset's `created_at`, unless a decision holds no time): applied since → nothing (C12: unless the bridge recorded that apply as made over a standing decline — then the decline stands); re-opened → nothing; declined → carried. A rejection with no reason never replaces a decline that stands. **B:** any decline ever made stands | **A** — B would carry a decline a lead re-opened, or one the office later applied |
| F4 | The read of the earlier changesets fails | **A:** the filing is refused — a 503 in words, before the referee writes its row; send it again. **B:** file undecided and say the carry was not checked | **A** — filing undecided is a guess that nothing was declined; Promote says "not filed" with the bridge's words and the next run files it |
| F5 | The ledger row | **A:** the filing's own `changeset_proposed` row carries `carried: n`, `carried_from: [{proposal_guid, name, origin, from, from_name, from_guid}]` and `not_carried: {no_reason, creates, unverified}` (absent when all are 0). **B:** a second row, `changeset_carried` | **A** — one row per filing, as the brief asks ("one ledger row saying how many were carried"); a second write could fail after the changeset is stored, leaving a carry the ledger lacks. S3 |
| F6 | The Revit "ticked" lock (MA-3a F2 C / S4) | **A:** not built; Next. **B:** build it now | **A** — since MA-3b the report cannot be lost (the record before the send) and Apply re-checks fresh copies; what remains is a web decline landing in the seconds between that re-check and the report, which is already recorded (`applied_over_late_decline`, on the doc and the row) and said in Revit with the Undo hint. The lock needs new bridge state, a lock and an unlock route, the desk refusing a decline on a locked ghost, an expiry for a Revit that crashed, and web rows in the drill — for a gap never yet seen live (MA3a's "late decline applied over" row is still owed). S6 |
| F7 | The Revit rows of the drill run on the branch build deployed to Revit 2024 | The founder's explicit OK in chat for this drill — one OK covers the deploy and the put-back — or R-1, R-2, R-3 and W-1 are **owed** | none — without the OK only B-1 runs |
| F8 | A storey whose every ghost is carried | **A:** it is still filed, every row locked; Revit reports it with Decline all (the note it needs is the reviewer's); the next Promote run files it again. **B:** Promote does not file it (the add-in reads the declines before filing) | **A** — B is option B's territory (F1) and a second place holding the rule; Next, when reviewers meet it. Risks says the loop |
| F9 (review, C6) | A result with **no `review_rev`** (a script; an add-in from before MA-3a) that applies a **carried** ghost | **A:** refused (409) — the decline was on the 201 reply of the filing, so "the bridge cannot tell whether it was seen" (MA-3a C2) is not true of it. **B:** recorded as `applied_over_decline_unchecked`, as MA-3a C2 does for any decline — and the apply then clears the decline for every later filing | **A** — B lets any caller that leaves `review_rev` out apply a carried decline and erase it. The ceiling of A: an add-in from before MA-3a (it shows no review and ticks the ghost) changes the model and its report is then refused — Risks. Every add-in the founder deployed since MA-3a sends `review_rev` |

## Amendments to the brief's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (the brief, "a Revit decline with or without a reason").** With a reason only (F2 A). "Never a guess" and the brief's own "what cannot be matched safely is not carried and said" decide it: without a reason the stored result does not say a person declined the ghost. The reviewer is told, in the window, that a reason makes a decline carry. Carrying a reasonless untick is Next (it needs one more result field from Revit).
- **S2 (the brief, "the same (`target.unique_id`, `op`, `place.TypeName` / `to`)").** The key also holds the kind; a retype's `place.FamilyName` (a door's or window's type name alone is not one type); an attach's `place.BaseLevel` and `place.TopLevel` (an attach has no TypeName and no `to` — an attach to another storey is another proposal); and a set_parameter's `parameter` (without it two parameters with the same value collide). The UniqueId is compared in lower case, as `validateChangeset` does; values are compared as stored (trimmed, case kept); type, family and level names are trimmed and compared in lower case (C13: the add-in's own rule).
- **S3 (the brief, "one ledger row saying how many were carried").** That row is the filing's `changeset_proposed` row (F5 A), not a second one.
- **S4 (the brief, "the earlier decline's words, who") — replaced by C1.** For a Revit decline "who" is the result's `reported_by`, the time its `reported_at`, and the role its `reported_role` — the role the bridge read for the caller when the result came in ("declined in Revit by `<account>` (contributor)"). A result reported by the machine credential, or stored before this slice (no role), is not a decline.
- **S5 (the brief, "what cannot be matched safely is not carried and said") — amended by C1 and C7.** Three counts: `no_reason` — this filing's ghosts whose newest earlier decision is a Revit rejection with no reason of its own; `unverified` — those whose newest earlier decision is a Revit rejection with a reason that no signed-in member reported (C1); `creates` — this filing's creates of the same kind, type and level as a create declined before on the project (C7; a create names no existing element, so none is matched). All three are on the changeset (`carry`), on the row (`not_carried`) and in Revit's window (`NotCarriedLine`).
- **S6 (the brief, item 2: the "ticked" lock).** Decided in this plan: not built (F6 A); Next, with the reason.
- **S7 (the scout, "adding `review` to `TRUST_FIELDS`").** Not done: a posted `review` is already listed as "ignored: not a field this bridge keeps" and never stored; a vitest case holds it (Task 2). The trust fixture is untouched.
- **S8 (the scout, "`decidedView` naming a carried decline's origin: Next").** Done here, one line: without it a carried Revit decline reads `web, <account> (<role>): …` under Recently decided — called the web's, which it is not — the brief allows a web change where a carried decline would read wrongly.

## Review amendments (BINDING — the critic's findings, 2026-10-04; each is also written into the task text it changes, and overrides anything below that still contradicts it)

- **C1 (critical — the machine credential must never make a binding decline).** `resolveActor` is `currentActor() || claimed || fallback` (`bridge-auth.mjs:39`): under the machine credential a result's `reported_by` is whatever the caller posts, and `reportResult` lets the service credential through. So: `reportResult` reads `const role = await d.myRole(key)` and stores it as `result.reported_role` (a member's role, or `"service"`). `carryDeclines` takes a Revit rejection with a reason as a decline **only** when `result.reported_role` is a member's role (a string, not empty, not `"service"`); the carried review's `role` is that role (this replaces S4's null). Otherwise the ghost is not carried and is counted in a new count, `unverified` — on `carry`, on the row's `not_carried` and in `NotCarriedLine`: "n ghost(s) here were rejected in Revit before with a reason, by a caller the bridge did not know as a signed-in member (the machine credential, or a report from before this version) — not carried: proposed again, undecided." (the critic's words said "a caller that was not signed in"; a result stored before this slice may have come from a signed-in person and holds no role — the words say both, never a guess). The same rule decides whether a declined **create** counts (C7). The fixture: cs-a's result gains `"reported_role": "contributor"`, and a fourth earlier changeset (cs-d) is reported by `"service"` with a reason (n-8: not carried, `unverified: 1`). Vitest: a service-reported reason, and one with no role, carry nothing and count 1. Drill row B-1 (the machine credential) asserts the **negative**: `carry {"carried":0,"no_reason":1,"creates":0,"unverified":1}`, W 1's review null. The positive carry is live only in R-2 — without F7's OK the carry itself is proven **offline only**, and the Merge section says so.
- **C2 (important — "the newest decision" is by when it was made).** `carryDeclines` builds one event per earlier ghost, `{key, at, …}`, and sorts the events by `at` (same moment: a decline before a clear, so the clear stands). `at` is `review.at` for a web decline and for a re-open, `result.reported_at` for applied, a Revit reason and a rejection with no reason; `cs.created_at` only when that time is missing. A carried copy keeps the first decline's `at` (as before), so it never outranks a later re-open. E6 and F3 say "by decision time". Two vitest cases: a changeset filed earlier and applied **after** a later changeset's decline (nothing carried); a re-open on the origin after a later filing took the carried copy (nothing carried).
- **C3 (important — a cut read would carry stale declines).** `cde-store.docList` had no `limit`/`offset`; a reply capped by the database (PostgREST's `max-rows`, 1000 by default; this project's setting was not read) is silent, and with the ascending order it drops the **newest** changesets — the ones holding the re-opens and the applies. `docList` now reads pages of 1000 (`order=created_at.asc,doc_id.asc&limit=1000&offset=n`) until a short page; every caller gets it. One vitest case (1000 rows, then 3). UNSURE 5 is removed from the drill. Ceiling, said in Risks: a database whose `max-rows` was set **below** 1000 still cuts on the first page.
- **C4 (important — Revit's wait grows with the project's history).** Promote files on Revit's thread and waits (`GetResult`; MA-3b4, Next), one filing per storey part, and each filing now reads every changeset the project holds. No code here. R-2 records the seconds from Promote's **Yes** to the review window and how many changesets the project held (`b4101 GET changesets/ma3b3`, counted). Risks names it a UI-thread wait this slice lengthens; if it is felt, Next's index of declines moves up.
- **C5 (minor — where a carried decline can be re-opened).** `reopenDecline` is for a proposed changeset only. `DeclinedHeader` and the desk's intro say "a lead re-opens one on the web desk while its changeset is still proposed"; Risks says what that means with F8.
- **C6 (minor — a result with no `review_rev` must not apply and clear a carried decline).** In `resultConflicts` an entry with `carried_from` is `refused` whatever `seen` is, also when there is none; the 409 says "the changeset was filed with it declined (review_rev 0)". E1 is corrected. The founder's choice is F9 (default A: refuse).
- **C7 (minor — `creates` never cleared).** A create is counted only when a create of the same `kind`, `place.TypeName` and level (`place.LevelName`, or a wall's `place.BaseLevel`) was declined before (on the web, or in Revit with a reason by a signed-in member) and not applied by that changeset. Its words say that, and that it is proposed again, undecided.
- **C8 (minor — words wrong for a Revit-origin decline).** The reason box's tooltip: "not for a row already declined (its reason stands)". `DeclinedTicked`'s first line: "n ticked ghost(s) were declined after this window opened:". §40's literal follows; §48's source scan holds both.
- **C9 (minor — R-1 may leave R-2 unpassable).** R-2's "rejected … with no reason of their own" line and `not_carried.no_reason` are expected only if R-1 unticked a row with no reason (the storey had a second group); otherwise that part is recorded **owed**, not failed.
- **C10 (minor — a group's reason reaches rows the reviewer never touched).** A group's reason goes to every unticked, enabled row of the group, including one that opened unticked; each is then carried as that person's decline. Risks says it; the reason box's tooltip says the reason "is carried to the next filing".
- **C11 (minor — a decline landing between the read and the insert).** One Risks line: a web decline or a report that lands after `proposeChangeset` read the store and before it inserted the changeset is not carried to that filing; it is to the next.

**Rejected:** none. Two findings are applied with other words than the critic's, each with its reason above: C1's line (a result from before this slice is not "a caller that was not signed in"), and C4's count (read through the bridge's list, since the test bridge logs nothing without new code).

**Review fixes (three independent reviews of the built branch, 2026-10-04; each with its check, in `fix: review, MA-3b3 - …` commits):**
- **C12 (important — an apply the bridge recorded as made over a standing decline is not a clear).** `carryDeclines` took every guid in `result.applied` as a clear — also one the same result lists under `applied_over_late_decline` or `applied_over_decline_unchecked`, an apply the bridge itself recorded as made OVER a decline. Revit's `LateDeclines` then says "— Undo", and `reportReverted` writes a ledger row only, so after the Undo the next filing carried nothing and counted nothing: the reviewer's decline was gone. Now such an apply is no clear: the decline (a person's decision) stands and is carried; F3's "applied since → nothing" reads with that exception. The alternative — `reportReverted` writing `result.reverted` and only a reverted apply standing as no clear — was not built: it is new doc state for the same end, and without the Undo the model holds the change, so Promote does not propose it again. Vitest: pure (late and unchecked), and the store's probe (decline → late apply → undo → the next filing carries).
- **C13 (minor — `carryKey` compares names as the add-in resolves them).** A type's, a family's and a level's name are lower-cased in the key (`ChangesetExecutor` resolves each `OrdinalIgnoreCase`, so a case-different re-proposal by a script was the declined change in Revit and dodged the carry); a set_parameter's value stays as stored. S2's "case kept" and the Risks line read with that. The carryKey vitest holds it. `createLike` (a count, never a lock) is left as stored.
- **C14 (minor — the `changeset_applied` row names a carried decline).** Beside `declined_on_web: n` the row carries `declined_before: k` — how many of those the bridge had carried (a web decline, or Revit's) — absent when none (E4). The doc's `result.declined_on_web` already carries `carried_from` per entry. One store vitest case.
- **C15 (minor — `declineWords` for an origin it does not know).** "declined before by …", as Revit's `ReviewLine` and the desk's `declinedBy` say; the bridge stores only `web` and `revit` today. One vitest line.
- **C16 (minor — the desk's `reviewWords` printed "(null)" for an accepted or re-opened review with no role).** `who` follows `declinedBy`'s rule (the role is left out when absent), so E10 is true for every state. One desk vitest case.
- **Rejected:** the 503's `(${e.message})` (the store's own words ride in the refusal — the precedent of `changesets-store.mjs`'s 502, no secret in them, and Promote's "not filed" dialog then says the cause, timeout or status, which the founder reads); "a targeted vitest run leaves `sentinel-core.mjs` modified" (not reproduced on the branch: `sentinel-core-bundle.test.mjs` only imports the bundle, no test under `bridge` or `src` runs esbuild, and after `npx vitest run bridge` only `ids-cases.json` is flagged).

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | A carried review is at `rev: 0` | The changeset is filed at `review_rev: 0`; `resultConflicts` refuses an applied decline when `rev <= seen`, so a carried ghost is refused for any `review_rev` Revit claims. C6: a result with no `review_rev` is refused too — the decline was on the filing's 201 reply (F9) |
| E2 | `docList` runs after `ensureProject` and before `adjudicateProposal` | The referee writes its own proposal row; a read that fails must leave nothing behind |
| E3 | `carried_from` is copied, never chained | A decline carried twice still names the changeset the person decided on. A Revit decline with a reason on a ghost a lead had re-opened is a new decline: its own origin |
| E4 | `carry` and the row's fields are absent when every count is 0 | Every changeset that carries nothing reads exactly as before this slice (existing tests compare whole documents) |
| E5 | The stamped ghost keeps the bridge's `pretick` | `ChangesetTrust.PreTick` returns false for a declined review; after a lead's re-open the ghost's own pre-tick is back, as in MA-3a |
| E6 | `carryDeclines` sorts the **decisions** itself, by when each was made (C2) | The store answers changesets by `created_at`; a decision on an older changeset can be newer than one on a later changeset, and the rule must not depend on the store's order |
| E7 | One whole-store read per filing | A `ponytail:` comment names the ceiling (Promote files one changeset per storey part); a `status`/`limit` on the list or an index of declines is Next |
| E8 | `DeclinedOnWeb` keeps its name | It reads the state; renaming it touches 12 call sites and 4 check files for no behaviour. Its words now come from `ReviewLine` / `DeclinedCount` |
| E9 | The picker line and the group header say "n declined on the web" when none is carried, "n declined (k carried)" otherwise | Every existing literal in promote-check stays true; a Revit-origin decline is never called the web's |
| E10 | The desk's `GhostReview.role` becomes `string \| null` | A guard only since C1 (a carried Revit decline holds the reporter's role): the desk never prints "(null)" for a review whose role it was not given |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `WebApp/bridge/fixtures/changeset-ops/ma3b3-carry.json` (new) | 1 | `earlier` (four stored changesets), `changeset` (the next filing as stored: two carried reviews, `carry`), `carried` (the row's list) — read by vitest (bridge and desk) and by promote-check |
| `WebApp/bridge/changesets-review.test.mjs` | 1 | the matcher's cases |
| `WebApp/bridge/changesets-logic.mjs` | 1 | `carryKey`, `carryDeclines`, `declineWords`; `resultConflicts`' entry and `reopenDecline`'s row carry `carried_from` |
| `WebApp/bridge/changesets-store.test.mjs` | 2 | file, decline in Revit, file again: the stamp, the row, the 409, a lead's re-open, a posted review, a failed read |
| `WebApp/bridge/changesets-store.mjs` | 2 | `proposeChangeset`: the read, the stamp, `carry`, the row's fields; `reportResult`: `reported_role` (C1), the 409's words |
| `WebApp/bridge/cde-store.mjs` | 2 | `docList` reads in pages (C3) |
| `WebApp/bridge/cde-store-oracle.test.mjs` | 2 | `docList`'s paging |
| `tools/promote-check/Ma3b3.cs` (new) | 3 | §48 — the fixture as the add-in reads it, every word, the scans |
| `tools/promote-check/Check.cs` | 3 | the new section's call |
| `tools/promote-check/Ma3aReview.cs` | 3 | §40's `DeclinedHeader` literal (the C4 sentence replaced; where a lead re-opens) and `DeclinedTicked`'s first line (C8) |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 3 | `CarriedFromDto`, `CarryDto`; `ReviewLine`, `DeclinedHeader`, `DeclinedCount`, `NotCarriedLine` |
| `SentinelAddin/GhostBuilder/StoreyBatch.cs` | 3 | the picker line's count; `Merge` sums `Carry` |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | 3 | the not-carried line above the rows; the group header's count; the reason box's tooltip (C8, C10) |
| `WebApp/src/setups/review-desk.test.ts` | 4 | a carried decline's words; the intro |
| `WebApp/src/setups/review-desk.ts` | 4 | `CarriedFrom`, `declinedBy`, `reviewWords`, `decidedView`'s line, the intro |
| `WebApp/package.json` | 4 | `1.0.42` → `1.0.43` |
| `docs/strategy/2026-09-30-model-automation-design.md` | 5 | what was built |

---

## Tasks (in order: the bridge's pure matcher; its wiring; Revit's words; the desk's words; the design doc and the final checks. The merge follows the live drill)

### Task 1 — Bridge, pure: `carryKey`, `carryDeclines`, `declineWords`

**Files:**
- Create: `WebApp/bridge/fixtures/changeset-ops/ma3b3-carry.json`
- Modify: `WebApp/bridge/changesets-review.test.mjs` (the import at `:6`; a new `describe` at the end)
- Modify: `WebApp/bridge/changesets-logic.mjs` (`resultConflicts`' `entry` near `:613` and its applied loop (C6); `reopenDecline`'s `row` near `:595`; the new functions at the end)

**Interfaces:**
- Consumes: `reviewState(el)`, `reviewRev(cs)`, `ghostName(el)` (module-private), `reopenDecline`, `resultConflicts` — all in `changesets-logic.mjs`.
- Produces (Task 2 and the fixture's readers rely on these):
  - `carryKey(el) → string | null`
  - `carryDeclines(elements, earlier) → { elements, carried: [{proposal_guid, name, origin, from, from_name, from_guid}], no_reason: number, creates: number, unverified: number }` (C1: `unverified`; a Revit decline carries only when the stored `result.reported_role` is a member's role, and the review's `role` is that role) — `elements` are the input elements, each carried one with `review: {state: "declined", action: "decline", reason, by, role, at, rev: 0, carried_from: {changeset, name, proposal_guid, origin}}`
  - `declineWords(review | conflictEntry) → string`
  - `resultConflicts(...)` entries and `reopenDecline(...).row` gain `carried_from` when the review has one; an applied entry with `carried_from` is `refused` whatever `seen` is (C6).

- [ ] **Step 1: The fixture.** Create `WebApp/bridge/fixtures/changeset-ops/ma3b3-carry.json`:

```json
{
  "_": "MA-3b3: a decline carried forward (changesets-logic carryDeclines). `earlier` is what the project's changeset store holds, oldest first; `changeset` is the next filing as the bridge stores it — vitest proves its elements' reviews, its `carry` and `carried` (the ledger row's list) from `earlier` and the same elements without a review. tools/promote-check and the web desk's test read `changeset` as the add-in and the desk do. n-1: declined on the web before (a-1). n-2: declined in Revit before with a reason, reported by a signed-in contributor (a-2; its UniqueId is posted in capitals; cs-b's decline is of another type and does not match). n-3: rejected in Revit before with no reason of its own (a-3) — not carried, counted. n-4: applied before (a-4). n-5: a lead re-opened its decline (a-5). n-6: a create — never matched; the project holds an earlier declined create (a-6), so it is counted. n-7: declined in Revit (a-7), then applied by a later changeset (c-1) — the newest decision stands. n-8: rejected in Revit before with a reason, but reported by the machine credential (d-1, reported_role service) — not carried, counted (unverified).",
  "earlier": [
    {
      "id": "cs-a", "name": "Promote (DD) · GR-FFL", "source": "promote", "claimed": true, "status": "partially_applied",
      "created_at": "2026-10-04T08:00:00.000Z", "updated_at": "2026-10-04T10:00:00.000Z", "review_rev": 4,
      "elements": [
        { "proposal_guid": "a-1", "kind": "wall", "op": "retype", "pretick": true,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": "Generic - 200mm" },
          "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } },
          "review": { "state": "declined", "action": "decline", "reason": "wrong type: W 1 is a party wall", "by": "reviewer@example.com", "role": "contributor", "at": "2026-10-04T09:00:00.000Z", "rev": 1 } },
        { "proposal_guid": "a-2", "kind": "wall", "op": "retype", "pretick": true,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c401", "type_before": "Generic - 200mm" },
          "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 2" } } },
        { "proposal_guid": "a-3", "kind": "wall", "op": "retype", "pretick": true,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c402", "type_before": "Generic - 200mm" },
          "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 3" } } },
        { "proposal_guid": "a-4", "kind": "wall", "op": "attach", "pretick": true,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": null },
          "place": { "BaseLevel": "GR-FFL", "TopLevel": "01-FFL" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } } },
        { "proposal_guid": "a-5", "kind": "wall", "op": "retype", "pretick": true,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c405", "type_before": "Generic - 200mm" },
          "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 5" } },
          "review": { "state": "proposed", "action": "reopen", "reason": "the client confirmed W 5 is external", "by": "lead@example.com", "role": "lead", "at": "2026-10-04T09:30:00.000Z", "rev": 3 } },
        { "proposal_guid": "a-6", "kind": "wall", "op": "create", "pretick": false, "target": null,
          "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [0, 0, 0], "end": [5000, 0, 0] } },
          "validate": { "identity": { "Class": "IfcWall", "Name": "W 9" } },
          "review": { "state": "declined", "action": "decline", "reason": "W 9 is not in the brief", "by": "reviewer@example.com", "role": "contributor", "at": "2026-10-04T09:00:00.000Z", "rev": 1 } },
        { "proposal_guid": "a-7", "kind": "wall", "op": "retype", "pretick": true,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c406", "type_before": "Generic - 200mm" },
          "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 6" } } }
      ],
      "exceptions": [],
      "result": {
        "applied": [{ "proposal_guid": "a-4", "revit_element_id": 312312, "revit_unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" }],
        "rejected": ["a-1", "a-2", "a-3", "a-5", "a-6", "a-7"], "note": "GR-FFL reviewed in Revit",
        "reported_at": "2026-10-04T10:00:00.000Z", "reported_by": "modeller@example.com", "reported_role": "contributor", "review_rev_seen": { "value": 3, "claimed": true },
        "declined_on_web": [
          { "proposal_guid": "a-1", "name": "retype wall \"W 1\"", "by": "reviewer@example.com", "role": "contributor", "reason": "wrong type: W 1 is a party wall", "rev": 1 },
          { "proposal_guid": "a-6", "name": "create wall \"W 9\"", "by": "reviewer@example.com", "role": "contributor", "reason": "W 9 is not in the brief", "rev": 1 }
        ],
        "applied_over_late_decline": [], "applied_over_decline_unchecked": [],
        "reasons": { "a-2": "W 2 is demolished in the next package", "a-7": "W 6 waits for the structural model" }
      }
    },
    {
      "id": "cs-b", "name": "Core walls (agent)", "source": "mcp", "claimed": true, "status": "proposed",
      "created_at": "2026-10-04T11:00:00.000Z", "updated_at": "2026-10-04T11:30:00.000Z", "review_rev": 1,
      "elements": [
        { "proposal_guid": "b-1", "kind": "wall", "op": "retype", "pretick": false,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c401", "type_before": "Generic - 200mm" },
          "place": { "TypeName": "BDS_INT_ARC_CMU_100 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 2" } },
          "review": { "state": "declined", "action": "decline", "reason": "W 2 is not an internal wall", "by": "reviewer@example.com", "role": "contributor", "at": "2026-10-04T11:30:00.000Z", "rev": 1 } }
      ],
      "exceptions": [], "result": null
    },
    {
      "id": "cs-c", "name": "Promote (DD) · GR-FFL", "source": "promote", "claimed": true, "status": "applied",
      "created_at": "2026-10-04T12:00:00.000Z", "updated_at": "2026-10-04T12:10:00.000Z", "review_rev": 1,
      "elements": [
        { "proposal_guid": "c-1", "kind": "wall", "op": "retype", "pretick": true,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c406", "type_before": "Generic - 200mm" },
          "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 6" } } }
      ],
      "exceptions": [],
      "result": {
        "applied": [{ "proposal_guid": "c-1", "revit_element_id": 312838, "revit_unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c406" }],
        "rejected": [], "note": null, "reported_at": "2026-10-04T12:10:00.000Z", "reported_by": "modeller@example.com", "reported_role": "contributor", "review_rev_seen": { "value": 0, "claimed": true },
        "declined_on_web": [], "applied_over_late_decline": [], "applied_over_decline_unchecked": []
      }
    },
    {
      "id": "cs-d", "name": "Partitions (script)", "source": "mcp", "claimed": true, "status": "declined",
      "created_at": "2026-10-04T12:30:00.000Z", "updated_at": "2026-10-04T12:40:00.000Z", "review_rev": 1,
      "elements": [
        { "proposal_guid": "d-1", "kind": "wall", "op": "retype", "pretick": false,
          "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c407", "type_before": "Generic - 200mm" },
          "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 7" } } }
      ],
      "exceptions": [],
      "result": {
        "applied": [], "rejected": ["d-1"], "note": "declined by a script", "reported_at": "2026-10-04T12:40:00.000Z", "reported_by": "lead@example.com", "reported_role": "service",
        "review_rev_seen": { "value": 0, "claimed": true }, "declined_on_web": [], "applied_over_late_decline": [], "applied_over_decline_unchecked": [],
        "reasons": { "d-1": "W 7 stays as modelled" }
      }
    }
  ],
  "changeset": {
    "id": "cs-ma3b3", "name": "Promote (DD) · GR-FFL", "source": "promote", "claimed": true, "status": "proposed",
    "created_at": "2026-10-04T13:00:00.000Z", "updated_at": "2026-10-04T13:00:00.000Z", "review_rev": 0,
    "elements": [
      { "proposal_guid": "n-1", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } },
        "review": { "state": "declined", "action": "decline", "reason": "wrong type: W 1 is a party wall", "by": "reviewer@example.com", "role": "contributor", "at": "2026-10-04T09:00:00.000Z", "rev": 0,
          "carried_from": { "changeset": "cs-a", "name": "Promote (DD) · GR-FFL", "proposal_guid": "a-1", "origin": "web" } } },
      { "proposal_guid": "n-2", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5A1C2B3D-1111-2222-3333-444455556666-0004C401", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 2" } },
        "review": { "state": "declined", "action": "decline", "reason": "W 2 is demolished in the next package", "by": "modeller@example.com", "role": "contributor", "at": "2026-10-04T10:00:00.000Z", "rev": 0,
          "carried_from": { "changeset": "cs-a", "name": "Promote (DD) · GR-FFL", "proposal_guid": "a-2", "origin": "revit" } } },
      { "proposal_guid": "n-3", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c402", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 3" } } },
      { "proposal_guid": "n-4", "kind": "wall", "op": "attach", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": null },
        "place": { "BaseLevel": "GR-FFL", "TopLevel": "01-FFL" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } } },
      { "proposal_guid": "n-5", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c405", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 5" } } },
      { "proposal_guid": "n-6", "kind": "wall", "op": "create", "pretick": false, "target": null,
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [0, 0, 0], "end": [5000, 0, 0] } },
        "validate": { "identity": { "Class": "IfcWall", "Name": "W 9" } } },
      { "proposal_guid": "n-7", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c406", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 6" } } },
      { "proposal_guid": "n-8", "kind": "wall", "op": "retype", "pretick": true,
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c407", "type_before": "Generic - 200mm" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm" }, "validate": { "identity": { "Class": "IfcWall", "Name": "W 7" } } }
    ],
    "carry": { "carried": 2, "no_reason": 1, "creates": 1, "unverified": 1 },
    "exceptions": [], "result": null
  },
  "carried": [
    { "proposal_guid": "n-1", "name": "retype wall \"W 1\"", "origin": "web", "from": "cs-a", "from_name": "Promote (DD) · GR-FFL", "from_guid": "a-1" },
    { "proposal_guid": "n-2", "name": "retype wall \"W 2\"", "origin": "revit", "from": "cs-a", "from_name": "Promote (DD) · GR-FFL", "from_guid": "a-2" }
  ]
}
```

- [ ] **Step 2: The failing tests.** In `WebApp/bridge/changesets-review.test.mjs`, replace the import:

```js
import { REVIEW_STATES, reviewState, reviewRev, reviewNext, applyDecisions, reopenDecline, resultConflicts, resultReasons } from "./changesets-logic.mjs";
```

with:

```js
import { REVIEW_STATES, reviewState, reviewRev, reviewNext, applyDecisions, reopenDecline, resultConflicts, resultReasons,
  carryKey, carryDeclines, declineWords } from "./changesets-logic.mjs";
```

and add at the end of the file:

```js
describe("carryDeclines — a decline carried to the next filing (MA-3b3)", () => {
  const c3 = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/ma3b3-carry.json", import.meta.url), "utf8"));
  const bare = (cs) => cs.elements.map(({ review, ...e }) => e);
  const counts = (o) => ({ carried: o.carried.length, no_reason: o.no_reason, creates: o.creates, unverified: o.unverified });
  /** `cs` as a signed-in contributor's Revit reported it: these guids rejected (the rest applied), with these reasons. */
  const reported = (cs, rejected, reasons) => ({ ...cs, status: "partially_applied", review_rev: reviewRev(cs) + 1, result: {
    applied: cs.elements.filter((e) => !rejected.includes(e.proposal_guid)).map((e) => ({ proposal_guid: e.proposal_guid, revit_element_id: 1 })),
    rejected, note: null, reported_at: "2026-10-04T14:00:00.000Z", reported_by: "second@example.com", reported_role: "contributor", ...(reasons ? { reasons } : {}) } });
  const W2 = c3.changeset.elements[1];

  it("the shared fixture: a web decline and a Revit decline with a reason are stamped on the same change; the rest is not, and is counted", () => {
    const out = carryDeclines(bare(c3.changeset), c3.earlier);
    expect(out.elements).toEqual(c3.changeset.elements);
    expect(counts(out)).toEqual(c3.changeset.carry);
    expect(out.carried).toEqual(c3.carried);
    expect(out.elements.filter((e) => e.review).map((e) => [e.proposal_guid, e.review.rev, e.review.role, e.review.carried_from.origin]))
      .toEqual([["n-1", 0, "contributor", "web"], ["n-2", 0, "contributor", "revit"]]);
  });

  it("the newest decision stands whatever order the store answers in; the input is not changed", () => {
    const els = bare(c3.changeset), copy = JSON.parse(JSON.stringify(els));
    expect(carryDeclines(els, [...c3.earlier].reverse()).elements).toEqual(c3.changeset.elements);
    expect(els).toEqual(copy);
  });

  it("nothing earlier, or nothing that matches: the elements are answered as they came and nothing is counted", () => {
    for (const earlier of [[], null, undefined, [c3.earlier[1]]]) {
      const out = carryDeclines(bare(c3.changeset), earlier);
      expect(out.elements).toEqual(bare(c3.changeset));
      expect(counts(out)).toEqual({ carried: 0, no_reason: 0, creates: 0, unverified: 0 });
    }
  });

  it("a carried decline Revit then reports as rejected is carried again from its FIRST origin (never chained)", () => {
    const again = carryDeclines(bare(c3.changeset), [...c3.earlier, reported(c3.changeset, ["n-1", "n-2", "n-3"], null)]);
    expect(again.elements).toEqual(c3.changeset.elements);
    expect(again.carried).toEqual(c3.carried);
    expect(counts(again)).toEqual({ carried: 2, no_reason: 1, creates: 1, unverified: 0 }); // n-8 was applied by that report: nothing stands
  });

  it("a re-opened decline is not carried; a Revit decline with a reason after the re-open is, as Revit's own", () => {
    const re = reopenDecline(c3.changeset, "n-1", "W 1 is external after all", LEAD);
    expect(re.row.carried_from).toEqual(c3.changeset.elements[0].review.carried_from);
    const open = carryDeclines(bare(c3.changeset), [...c3.earlier, re.updated]);
    expect(open.carried.map((x) => x.proposal_guid)).toEqual(["n-2"]);
    expect(open.elements[0].review).toBeUndefined();
    const later = carryDeclines(bare(c3.changeset), [...c3.earlier, reported(re.updated, ["n-1"], { "n-1": "still a party wall" })]);
    expect(later.elements[0].review).toEqual({ state: "declined", action: "decline", reason: "still a party wall", by: "second@example.com", role: "contributor",
      at: "2026-10-04T14:00:00.000Z", rev: 0, carried_from: { changeset: "cs-ma3b3", name: "Promote (DD) · GR-FFL", proposal_guid: "n-1", origin: "revit" } });
    expect(later.elements[1].review).toBeUndefined(); // n-2 was applied by that report (over its decline): nothing stands
  });

  it("a rejection with no reason of its own is never a decline: a rolled-back Apply carries nothing, and never replaces a decline that stands", () => {
    const { review, ...w2 } = W2;
    const rolledBack = { id: "cs-old", name: "Promote (DD) · GR-FFL", status: "declined", created_at: "2026-10-04T12:30:00.000Z", elements: [{ ...w2, proposal_guid: "o-1" }],
      result: { applied: [], rejected: ["o-1"], note: "Revit transaction failed — rolled back: a wall could not be joined", reported_at: "2026-10-04T12:31:00.000Z", reported_by: "modeller@example.com" } };
    const alone = carryDeclines([w2], [rolledBack]);
    expect(alone.elements).toEqual([w2]);
    expect(counts(alone)).toEqual({ carried: 0, no_reason: 1, creates: 0, unverified: 0 });
    expect(carryDeclines([w2], [...c3.earlier, rolledBack]).elements[0].review).toEqual(review); // cs-a's decline with a reason still stands
  });

  it("carryKey: the element, the op and what it sets — a create, or a ghost that is not whole, has none", () => {
    const uid = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    const retype = (place, kind = "wall", id = uid) => carryKey({ kind, op: "retype", target: { unique_id: id }, place });
    expect(retype({ TypeName: "T" })).toBe(retype({ TypeName: " T " }, "wall", uid.toUpperCase()));
    expect(retype({ TypeName: "T" })).not.toBe(retype({ TypeName: "t" }));
    expect(retype({ TypeName: "T", FamilyName: "F" }, "door")).not.toBe(retype({ TypeName: "T", FamilyName: "G" }, "door"));
    expect(retype({})).toBeNull();
    const attach = (place) => carryKey({ kind: "wall", op: "attach", target: { unique_id: uid }, place });
    expect(attach({ BaseLevel: "GR-FFL", TopLevel: "01-FFL" })).not.toBe(attach({ BaseLevel: "GR-FFL", TopLevel: "02-FFL" }));
    expect(attach({ BaseLevel: "GR-FFL" })).toBeNull();
    expect(attach({ BaseLevel: "GR-FFL", TopLevel: "01-FFL" })).not.toBe(retype({ TypeName: "GR-FFL", FamilyName: "01-FFL" }));
    const set = (parameter, to) => carryKey({ kind: "wall", op: "set_parameter", target: { unique_id: uid }, place: { TypeName: "T" }, parameter, to });
    expect(set("FireRating", "60 min")).toBe(set("firerating", "60 min"));
    expect(set("FireRating", "60 min")).not.toBe(set("FireRating", "90 min"));
    expect(set("FireRating", "60 min")).not.toBe(set("AcousticRating", "60 min"));
    expect(set("FireRating", undefined)).toBeNull();
    expect(carryKey({ kind: "wall", op: "create", target: null, place: { TypeName: "T" } })).toBeNull();
    expect(carryKey(null)).toBeNull();
  });

  it("a result that applies a carried decline is refused whatever review_rev it claims, and the refusal says where the decline was made", () => {
    const hit = resultConflicts(c3.changeset, ["n-1", "n-2"], ["n-3", "n-4", "n-5", "n-6", "n-7", "n-8"], 0);
    expect(hit.refused.map((x) => [x.proposal_guid, x.rev, x.carried_from.origin])).toEqual([["n-1", 0, "web"], ["n-2", 0, "revit"]]);
    expect(declineWords(hit.refused[0])).toBe('declined on the web by reviewer@example.com (contributor) in "Promote (DD) · GR-FFL" and carried here by the bridge');
    expect(declineWords(hit.refused[1])).toBe('declined in Revit by modeller@example.com (contributor) in "Promote (DD) · GR-FFL" and carried here by the bridge');
    expect(declineWords(fx.after.elements[0].review)).toBe("declined on the web by reviewer@example.com (contributor)");
    expect(resultConflicts(fx.after, [], ["g-1"], 1).declined_on_web[0]).not.toHaveProperty("carried_from");
    // C6: a result with no review_rev — the carried decline was on the filing's 201 reply, so it is refused, never "unchecked".
    const blind = resultConflicts(c3.changeset, ["n-1"], [], undefined);
    expect([blind.refused.map((x) => x.proposal_guid), blind.unchecked]).toEqual([["n-1"], []]);
  });

  it("C1: a Revit reason is a decline only when a signed-in member reported it — the machine credential's, or a result with no role stored, carries nothing and is counted", () => {
    const { review, ...w2 } = W2;
    const script = (role) => ({ id: "cs-s", name: "Script", status: "declined", created_at: "2026-10-04T12:30:00.000Z", elements: [{ ...w2, proposal_guid: "s-1" }],
      result: { applied: [], rejected: ["s-1"], note: null, reported_at: "2026-10-04T12:31:00.000Z", reported_by: "lead@example.com", ...(role ? { reported_role: role } : {}),
        reasons: { "s-1": "claimed under a lead's name" } } });
    for (const role of ["service", null]) {
      const out = carryDeclines([w2], [script(role)]);
      expect(out.elements).toEqual([w2]);
      expect(counts(out)).toEqual({ carried: 0, no_reason: 0, creates: 0, unverified: 1 });
    }
    expect(carryDeclines([w2], [script("lead")]).elements[0].review).toMatchObject({ by: "lead@example.com", role: "lead", reason: "claimed under a lead's name" });
    expect(carryDeclines([w2], [...c3.earlier, script("service")]).elements[0].review).toEqual(review); // it never replaces a decline that stands
  });

  it("C2: the newest DECISION stands, by when it was made — not by when its changeset was filed", () => {
    const { review, ...w2 } = W2;
    const X = { id: "cs-x", name: "X", status: "proposed", created_at: "2026-10-05T08:00:00.000Z", review_rev: 0, elements: [{ ...w2, proposal_guid: "x-1" }], result: null };
    const declinedAt = (cs, g, at) => ({ ...cs, elements: cs.elements.map((e) => (e.proposal_guid === g
      ? { ...e, review: { state: "declined", action: "decline", reason: "no", by: "reviewer@example.com", role: "contributor", at, rev: 1 } } : e)) });
    // X is filed at 08:00 and waits; Y, filed at 09:00 with the same change, is declined on the web at 09:10; X is applied in Revit at 11:00.
    const Y = declinedAt({ ...X, id: "cs-y", name: "Y", created_at: "2026-10-05T09:00:00.000Z", elements: [{ ...w2, proposal_guid: "y-1" }] }, "y-1", "2026-10-05T09:10:00.000Z");
    const appliedAt = (at) => ({ ...X, status: "applied", result: { applied: [{ proposal_guid: "x-1", revit_element_id: 1 }], rejected: [], reported_at: at, reported_by: "modeller@example.com", reported_role: "contributor" } });
    expect(carryDeclines([w2], [X, Y]).carried).toHaveLength(1);
    expect(carryDeclines([w2], [appliedAt("2026-10-05T11:00:00.000Z"), Y]).carried).toEqual([]);
    expect(carryDeclines([w2], [appliedAt("2026-10-05T09:10:00.000Z"), Y]).carried).toEqual([]); // the same moment: the clear stands
    expect(carryDeclines([w2], [appliedAt("2026-10-05T09:05:00.000Z"), Y]).carried).toHaveLength(1); // applied first, declined after
    // The origin X is declined at 09:00 and still proposed; B, filed at 10:00, holds the carried copy; a lead re-opens on X at 12:00.
    const origin = declinedAt(X, "x-1", "2026-10-05T09:00:00.000Z");
    const B = { ...X, id: "cs-b2", created_at: "2026-10-05T10:00:00.000Z", elements: carryDeclines([{ ...w2, proposal_guid: "b-9" }], [origin]).elements };
    expect(B.elements[0].review).toMatchObject({ at: "2026-10-05T09:00:00.000Z", carried_from: { changeset: "cs-x" } });
    const reopened = reopenDecline(origin, "x-1", "retype it after all", { ...LEAD, at: "2026-10-05T12:00:00.000Z" }).updated;
    expect(carryDeclines([w2], [origin, B]).carried).toHaveLength(1);
    expect(carryDeclines([w2], [reopened, B]).carried).toEqual([]);
  });

  it("C7: a create is counted only when a create of the same kind, type and level was declined before", () => {
    const n6 = bare(c3.changeset)[5];
    expect(carryDeclines([n6], c3.earlier).creates).toBe(1);
    expect(carryDeclines([{ ...n6, place: { ...n6.place, TypeName: "BDS_INT_ARC_CMU_100 mm" } }, { ...n6, place: { ...n6.place, LevelName: "01-FFL" } }, { ...n6, kind: "floor" }], c3.earlier).creates).toBe(0);
    expect(carryDeclines([n6], [c3.earlier[3]]).creates).toBe(0); // no declined create on the project: nothing is said
  });
});
```

- [ ] **Step 3: See them fail.** From `WebApp`: `npx vitest run bridge/changesets-review.test.mjs` → `11 failed | 22 passed (33)` — `TypeError: carryDeclines is not a function` (and `carryKey`, `declineWords`).

- [ ] **Step 4: The code.** In `WebApp/bridge/changesets-logic.mjs`, in `resultConflicts`, replace:

```js
    return { proposal_guid: g, name: ghostName(e), by: e.review.by, role: e.review.role, reason: e.review.reason, rev: e.review.rev };
```

with:

```js
    return { proposal_guid: g, name: ghostName(e), by: e.review.by, role: e.review.role, reason: e.review.reason, rev: e.review.rev,
      ...(e.review.carried_from ? { carried_from: e.review.carried_from } : {}) }; // MA-3b3: a carried decline says where it was made
```

In `resultConflicts`' applied loop (C6), replace:

```js
  for (const g of appliedGuids) { const x = entry(g); if (x) (none ? unchecked : x.rev <= seen ? refused : late).push(x); }
```

with:

```js
  // MA-3b3 (C6): a carried decline was on the filing's 201 reply — every result saw it, with or without a review_rev: refused.
  for (const g of appliedGuids) { const x = entry(g); if (x) (x.carried_from ? refused : none ? unchecked : x.rev <= seen ? refused : late).push(x); }
```

In `reopenDecline`, replace:

```js
    row: { proposal_guid: guid, name: ghostName(el), declined_by: el.review.by, declined_reason: el.review.reason, reason: why },
```

with:

```js
    row: { proposal_guid: guid, name: ghostName(el), declined_by: el.review.by, declined_reason: el.review.reason, reason: why,
      ...(el.review.carried_from ? { carried_from: el.review.carried_from } : {}) }, // MA-3b3: the ledger says a carried decline was re-opened
```

And add at the end of the file:

```js
// ── MA-3b3: a decline carried forward (founder decision: option A — the bridge stamps it at filing). A ghost that proposes the same
//    change as one declined before on the project is filed already declined, with the earlier decline's words, who made it and the
//    changeset it came from (review.carried_from). The match is the bridge's, on what it stored — never a posted claim. Revit and the
//    web desk read the stamp as any decline: unticked and locked; a lead re-opens it on the web desk.

/** What a ghost changes, as one text — the element, the op and what it sets: a retype's type (and family), an attach's two levels, a
 *  set_parameter's parameter and value. The UniqueId is compared in lower case (validateChangeset's own rule). Null for a create (it
 *  names no existing element) and for anything not whole: such a ghost is never matched, so never carried. */
export function carryKey(el) {
  const uid = el?.target?.unique_id, p = el?.place ?? {};
  if (typeof uid !== "string" || uid === "") return null;
  const one = (s) => (typeof s === "string" && s.trim() !== "" ? s.trim() : null);
  const head = [el.op, el.kind, uid.toLowerCase()];
  if (el.op === "retype") return one(p.TypeName) ? JSON.stringify([...head, one(p.TypeName), one(p.FamilyName)]) : null;
  if (el.op === "attach") return one(p.BaseLevel) && one(p.TopLevel) ? JSON.stringify([...head, one(p.BaseLevel), one(p.TopLevel)]) : null;
  if (el.op === "set_parameter") return one(el.parameter) && typeof el.to === "string" ? JSON.stringify([...head, one(el.parameter).toLowerCase(), el.to]) : null;
  return null;
}

/** MA-3b3 (C1): the role the bridge itself read for a result's reporter when the result came in (reportResult stores it as
 *  result.reported_role) — a member's role; null for the machine credential ("service": the MCP server, a script, a signed-out PC —
 *  its `reported_by` is whatever the caller posted) and for a result stored before MA-3b3 (no role stored). */
const reporterRole = (r) => (typeof r?.reported_role === "string" && r.reported_role !== "" && r.reported_role !== "service" ? r.reported_role : null);

/** MA-3b3 (C7): a create as far as it can be compared — its kind, type and level. Never a match (a create names no existing element):
 *  only whether a create like it was declined before, so that is said. */
const createLike = (el) => JSON.stringify([el?.kind ?? null, el?.place?.TypeName ?? null, el?.place?.LevelName ?? el?.place?.BaseLevel ?? null]);

/** The elements of a new filing, each stamped with the decline that stands for the same change on the project. `earlier` is every
 *  changeset the project holds (any status). Each earlier ghost gives ONE decision, with the time it was made (C2: a web decline's or
 *  a re-open's review.at, a result's reported_at; the changeset's created_at only when that time is missing); the decisions are
 *  sorted by that time — never by when their changesets were filed — and the NEWEST decision on a change stands (the same moment: a
 *  decline before a clear, so the clear stands):
 *    · applied since (in a result's applied list) — nothing stands;
 *    · declined on the web and not re-opened — carried (the web's reason, reviewer, role and time);
 *    · rejected by Revit with a reason for that ghost (result.reasons), reported by a signed-in member (C1: result.reported_role is
 *      a member's role) — carried (that reason, the reporter, that role, the report's time);
 *    · the same, reported by the machine credential or with no role stored — NOT carried and counted (`unverified`): under the
 *      machine credential the reporter's name is the caller's claim, and a binding decline is a signed-in person's;
 *    · re-opened by a lead — nothing stands (a re-opened decline is not carried);
 *    · rejected by Revit with no reason of its own — NOT carried and counted (`no_reason`): the stored result cannot tell a row a
 *      person unticked from an element Revit removed at commit or an Apply that rolled back (all three are `rejected`).
 *  Neither count ever replaces a decline that stands. A decline already carried keeps its first origin and its first time
 *  (carried_from is copied, never chained), so a later re-open of the origin outranks every copy. A carried review is at rev 0 — the
 *  revision the changeset is filed at — and a result that applies it is refused (resultConflicts).
 *  `creates` (C7): the creates of this filing of the same kind, type and level as a create declined before and not applied by its
 *  changeset — none can be matched, and that is said.
 *  Answers {elements, carried: [{proposal_guid, name, origin, from, from_name, from_guid}], no_reason, creates, unverified}. Pure. */
export function carryDeclines(elements, earlier) {
  const events = []; // one decision per earlier ghost: {key, at, review} | {key, at, clear} | {key, at, unsaid} | {key, at, unverified}
  const declinedCreates = new Set();
  for (const cs of earlier ?? []) {
    const r = cs?.result ?? null;
    const applied = new Set((r?.applied ?? []).map((a) => a?.proposal_guid));
    const rejected = new Set(r?.rejected ?? []);
    const why = (g) => (r?.reasons && Object.prototype.hasOwnProperty.call(r.reasons, g) && typeof r.reasons[g] === "string" ? r.reasons[g] : null);
    const role = reporterRole(r);
    const at = (t) => String(t ?? cs?.created_at ?? "");
    for (const el of cs?.elements ?? []) {
      const g = el?.proposal_guid, key = carryKey(el);
      const web = reviewState(el) === "declined", reasoned = rejected.has(g) && why(g) != null;
      if (!key) { if (!el?.target && !applied.has(g) && (web || (reasoned && role))) declinedCreates.add(createLike(el)); continue; }
      const decline = (reason, by, as, when, origin) => ({ state: "declined", action: "decline", reason, by, role: as, at: when, rev: 0,
        carried_from: el.review?.carried_from ?? { changeset: cs.id, name: cs.name, proposal_guid: g, origin } });
      if (applied.has(g)) events.push({ key, at: at(r.reported_at), clear: true });
      else if (web) events.push({ key, at: at(el.review.at), review: decline(el.review.reason, el.review.by, el.review.role ?? null, el.review.at, "web") });
      else if (reasoned && role) events.push({ key, at: at(r.reported_at), review: { ...decline(why(g), r.reported_by ?? "an unknown account", role, r.reported_at ?? null, "revit"),
        carried_from: { changeset: cs.id, name: cs.name, proposal_guid: g, origin: "revit" } } }); // Revit's own, newer decline: its own origin
      else if (reasoned) events.push({ key, at: at(r.reported_at), unverified: true });
      else if (el.review?.action === "reopen") events.push({ key, at: at(el.review.at), clear: true });
      else if (rejected.has(g)) events.push({ key, at: at(r.reported_at), unsaid: true });
    }
  }
  // C2: by decision time (ISO text compares as time); the same moment: a decline before a clear. The sort is stable.
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.clear ? 1 : 0) - (b.clear ? 1 : 0)));
  const standing = new Map(); // carryKey → the newest decision; a count (unsaid, unverified) never replaces a decline that stands
  for (const e of events) if (e.review || e.clear || !standing.get(e.key)?.review) standing.set(e.key, e);
  const carried = [];
  let noReason = 0, unverified = 0, creates = 0;
  const out = (elements ?? []).map((el) => {
    const key = carryKey(el);
    if (!key) { if (!el?.target && declinedCreates.has(createLike(el))) creates++; return el; }
    const s = standing.get(key);
    if (s?.review) {
      const from = s.review.carried_from;
      carried.push({ proposal_guid: el.proposal_guid, name: ghostName(el), origin: from.origin, from: from.changeset, from_name: from.name, from_guid: from.proposal_guid });
      return { ...el, review: s.review };
    }
    if (s?.unsaid) noReason++;
    else if (s?.unverified) unverified++;
    return el;
  });
  return { elements: out, carried, no_reason: noReason, creates, unverified };
}

/** A decline in words, for a refusal: where it was made and by whom — and, for a carried one, the changeset it was carried from. */
export const declineWords = (r) => (r?.carried_from
  ? `declined ${r.carried_from.origin === "revit" ? "in Revit" : "on the web"} by ${r.by}${r.role ? ` (${r.role})` : ""} in "${r.carried_from.name}" and carried here by the bridge`
  : `declined on the web by ${r?.by} (${r?.role})`);
```

- [ ] **Step 5: See them pass.** From `WebApp`: `npx vitest run bridge/changesets-review.test.mjs` → `33 passed (33)`.

- [ ] **Step 6: Commit.**

```bash
git add WebApp/bridge/fixtures/changeset-ops/ma3b3-carry.json WebApp/bridge/changesets-review.test.mjs WebApp/bridge/changesets-logic.mjs
git commit -m "feat(bridge): MA-3b3 - the pure matcher of a carried decline: carryKey (the element, the op and what it sets; a create has none), carryDeclines (the newest decision on a change stands, by when it was made: a web decline, or a Revit rejection with its own reason that a signed-in member reported, is stamped on the next filing with who, why and where from; applied or re-opened is not; a rejection with no reason, and a reason the machine credential reported, are counted, never carried; a create is counted when one like it was declined), declineWords; a result applying a carried decline is refused with or without a review_rev; the shared fixture ma3b3-carry.json" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2 — Bridge, store: `proposeChangeset` stamps the carry; the row; the 409's words

**Files:**
- Modify: `WebApp/bridge/changesets-store.test.mjs` (a new `describe` at the end)
- Modify: `WebApp/bridge/changesets-store.mjs` (the import at `:7-8`; `proposeChangeset` `:107-152`; `reportResult`: the role read near `:176`, the 409 near `:200`, `reported_role` near `:212`)
- Modify: `WebApp/bridge/cde-store-oracle.test.mjs` (the import at `:16`; a new `describe` at the end) and `WebApp/bridge/cde-store.mjs` (`docList` `:1932-1936`) — C3

**Interfaces:**
- Consumes: `carryDeclines(elements, earlier)`, `declineWords(entry)` (Task 1); `d.docList(STORE, proj.id)` (already in `wire`).
- Produces: a stored changeset whose carried ghosts hold `review` with `carried_from`, and — when any count is above 0 — `carry: {carried, no_reason, creates, unverified}`; the `changeset_proposed` row's `carried`, `carried_from`, `not_carried`; a stored result's `reported_role` (C1: the reporter's role as the bridge read it, or `"service"`); `docList` answering every row of a store, in pages (C3). Tasks 3 and 4 read `review.carried_from` and `carry`.

- [ ] **Step 1: The failing tests.** Add at the end of `WebApp/bridge/changesets-store.test.mjs`:

```js
describe("MA-3b3 — a decline carried to the next filing (the bridge stamps it at filing)", () => {
  const retype = (n, type = "BDS_EXT_ARC_CMU_200 mm") => ({ kind: "wall", op: "retype",
    target: { unique_id: `5a1c2b3d-1111-2222-3333-444455556666-0004c40${n}`, type_before: "Generic - 200mm" },
    place: { TypeName: type }, validate: { identity: { Class: "IFCWALL", Name: `W ${n}` } } });
  const STOREY = () => ({ name: "Promote (DD) · GR-FFL", source: "promote", elements: [retype(1), retype(2), retype(3)] });
  const rows = (deps, action) => deps.audit.mock.calls.filter((c) => c[3] === action);
  /** A filed and reported: W 1 rejected with a reason, W 2 rejected with none, W 3 applied. The report is a signed-in member's
   *  (`role`), or — with null — the machine credential's (C1). Answers {deps, A}. */
  const declinedInRevit = async (role = "contributor") => {
    const deps = baseDeps({ audit: vi.fn(async () => ({ id: 1, hash: "ab".repeat(32) })) });
    const A = await proposeChangeset("demo", STOREY(), "modeller", deps);
    const [g1, g2, g3] = A.elements.map((e) => e.proposal_guid);
    if (role) deps.myRole = as(role);
    await reportResult("demo", A.id, { applied: [{ proposal_guid: g3, revit_element_id: 5 }], rejected: [g1, g2], review_rev: 0, reasons: { [g1]: "W 1 stays as modelled" } }, "modeller", deps);
    delete deps.myRole;
    return { deps, A };
  };

  it("a ghost Revit declined before with a reason is filed already declined, with the reason, who and where from; ONE row says how many", async () => {
    const { deps, A } = await declinedInRevit();
    expect(A.carry).toBeUndefined();
    expect(A.elements.some((e) => e.review)).toBe(false);
    expect(rows(deps, "changeset_proposed")[0][6]).not.toHaveProperty("carried");
    const told = deps.saved.get(A.id).result;
    expect(told.reported_role).toBe("contributor"); // C1: the role the bridge read for the reporter, stored with the result

    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    expect(B.review_rev).toBe(0);
    expect(B.elements[0].review).toEqual({ state: "declined", action: "decline", reason: "W 1 stays as modelled", by: told.reported_by, role: "contributor", at: told.reported_at, rev: 0,
      carried_from: { changeset: A.id, name: "Promote (DD) · GR-FFL", proposal_guid: A.elements[0].proposal_guid, origin: "revit" } });
    expect(B.elements[1].review).toBeUndefined(); // rejected before with no reason of its own: not carried, counted
    expect(B.elements[2].review).toBeUndefined(); // applied before
    expect(B.carry).toEqual({ carried: 1, no_reason: 1, creates: 0, unverified: 0 });
    expect(deps.saved.get(B.id)).toEqual(B);
    const proposed = rows(deps, "changeset_proposed");
    expect(proposed).toHaveLength(2); // one row per filing — the carry rides on it
    expect(proposed[1][6]).toMatchObject({ elements: 3, carried: 1, not_carried: { no_reason: 1, creates: 0, unverified: 0 },
      carried_from: [{ proposal_guid: B.elements[0].proposal_guid, name: 'retype wall "W 1"', origin: "revit", from: A.id, from_name: "Promote (DD) · GR-FFL", from_guid: A.elements[0].proposal_guid }] });
  });

  it("C1: a reason reported under the machine credential is never a decline — whatever name the caller posts: nothing is carried, and it is counted and said", async () => {
    const { deps, A } = await declinedInRevit(null);
    expect(deps.saved.get(A.id).result.reported_role).toBe("service");
    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    expect(B.elements.some((e) => e.review)).toBe(false);
    expect(B.carry).toEqual({ carried: 0, no_reason: 1, creates: 0, unverified: 1 });
    expect(rows(deps, "changeset_proposed")[1][6]).toMatchObject({ carried: 0, carried_from: [], not_carried: { no_reason: 1, creates: 0, unverified: 1 } });
  });

  it("a result that applies the carried ghost is a 409 that says where it was declined — with or without a review_rev (C6); nothing is written", async () => {
    const { deps } = await declinedInRevit();
    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    const [g1, g2, g3] = B.elements.map((e) => e.proposal_guid);
    const by = B.elements[0].review.by;
    await expect(reportResult("demo", B.id, { applied: [{ proposal_guid: g1, revit_element_id: 7 }], rejected: [g2, g3], review_rev: 0 }, "modeller", deps))
      .rejects.toMatchObject({ status: 409, message: `retype wall "W 1" was declined in Revit by ${by} (contributor) in "Promote (DD) · GR-FFL" and carried here by the bridge: "W 1 stays as modelled" — the changeset was filed with it declined (review_rev 0); Revit refuses that tick, so this result is refused. Nothing was recorded; the changeset stays proposed` });
    await expect(reportResult("demo", B.id, { applied: [{ proposal_guid: g1, revit_element_id: 7 }], rejected: [g2, g3] }, "a-script", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining("the changeset was filed with it declined (review_rev 0)") });
    expect(deps.saved.get(B.id).status).toBe("proposed");
  });

  it("a lead re-opens a carried decline as any decline (the row says it was carried), and the next filing does not carry it", async () => {
    const { deps, A } = await declinedInRevit();
    const B = await proposeChangeset("demo", STOREY(), "modeller", deps);
    deps.myRole = as("lead");
    const out = await reopenGhost("demo", B.id, { proposal_guid: B.elements[0].proposal_guid, reason: "W 1 is retyped after all" }, "lead@example.com", deps);
    delete deps.myRole;
    expect(out.changeset.elements[0].review).toMatchObject({ state: "proposed", action: "reopen" });
    expect(rows(deps, "changeset_reopened")[0][6]).toMatchObject({ declined_reason: "W 1 stays as modelled", carried_from: { changeset: A.id, origin: "revit" } });
    await withdrawChangeset("demo", B.id, "modeller", deps);
    const C = await proposeChangeset("demo", STOREY(), "modeller", deps);
    expect(C.elements.some((e) => e.review)).toBe(false);
    expect(C.carry).toEqual({ carried: 0, no_reason: 1, creates: 0, unverified: 0 });
  });

  it("the match is the bridge's: a posted review neither claims a decline nor clears one", async () => {
    const { deps } = await declinedInRevit();
    const body = STOREY();
    body.elements[0].review = { state: "proposed", action: "reopen", reason: "cleared by the caller" };
    body.elements[2].review = { state: "declined", action: "decline", reason: "claimed by the caller", by: "x", role: "lead" };
    const B = await proposeChangeset("demo", body, "modeller", deps);
    expect(B.elements[0].review).toMatchObject({ state: "declined", reason: "W 1 stays as modelled" });
    expect(B.elements[2].review).toBeUndefined();
    expect(B.ignored.map((x) => x.field)).toEqual(["elements[0].review", "elements[2].review"]);
  });

  it("the earlier changesets not read: a 503 in words, and nothing is filed — no referee row, no changeset, no ledger row", async () => {
    const deps = baseDeps({ docList: vi.fn(async () => { throw new Error("timeout"); }) });
    await expect(proposeChangeset("demo", STOREY(), "modeller", deps)).rejects.toMatchObject({ status: 503,
      message: "the project's earlier changesets could not be read (timeout) — nothing was filed: a decline made before could not be carried to this changeset; send it again" });
    expect(deps.adjudicateProposal).not.toHaveBeenCalled();
    expect(deps.docInsert).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });
});
```

C3 — in `WebApp/bridge/cde-store-oracle.test.mjs`, replace the import:

```js
import { ensureProject, createProject, projectNotFound, docListLazy, bcfListTopics } from "./cde-store.mjs";
```

with:

```js
import { ensureProject, createProject, projectNotFound, docList, docListLazy, bcfListTopics } from "./cde-store.mjs";
```

and add at the end of the file:

```js
// MA-3b3 (C3): the database caps one reply (PostgREST max-rows); with the ascending order a cut read drops the NEWEST documents
// without a word — for changesets, the ones that hold the re-opens and the applies.
describe("docList — reads a store in pages", () => {
  it("a full page is followed by the next one; a short page ends the read; every row is answered, in order", async () => {
    const asked = [];
    globalThis.fetch = vi.fn(async (url) => {
      const q = new URL(String(url)).searchParams;
      asked.push([q.get("order"), q.get("limit"), q.get("offset")]);
      const offset = Number(q.get("offset"));
      return new Response(JSON.stringify(Array.from({ length: offset === 0 ? 1000 : 3 }, (_, i) => ({ data: { n: offset + i } }))), { status: 200 });
    });
    const rows = await docList("changeset", "p1");
    expect(rows).toHaveLength(1003);
    expect([rows[0], rows[999], rows[1002]]).toEqual([{ n: 0 }, { n: 999 }, { n: 1002 }]);
    expect(asked).toEqual([["created_at.asc,doc_id.asc", "1000", "0"], ["created_at.asc,doc_id.asc", "1000", "1000"]]);
  });
});
```

- [ ] **Step 2: See them fail.** From `WebApp`: `npx vitest run bridge/changesets-store.test.mjs bridge/cde-store-oracle.test.mjs` → `7 failed | 64 passed (71)` (6 in the store's file, 1 in the oracle's).

- [ ] **Step 3: The code.** In `WebApp/bridge/changesets-store.mjs`, eight replacements. The import — replace:

```js
  reviewRev, applyDecisions, reopenDecline, resultConflicts, resultReasons } from "./changesets-logic.mjs";
```

with:

```js
  reviewRev, applyDecisions, reopenDecline, resultConflicts, resultReasons, carryDeclines, declineWords } from "./changesets-logic.mjs";
```

In `proposeChangeset`, the read — replace:

```js
  const proj = await d.ensureProject(key);

  // Reuse the referee as-is: it resolves the project's installed IDS (artefact-store) and writes its own
```

with:

```js
  const proj = await d.ensureProject(key);
  // MA-3b3: every changeset the project holds, read before anything is written — a ghost declined before is filed already declined
  // (carryDeclines). A read that fails refuses the filing: filing it undecided would be a guess that nothing was declined.
  // ponytail: one whole-store read per filing (Promote files one changeset per storey part); a status/limit on the list, or an
  // index of declines, when a project's changesets make it heavy.
  let earlier;
  try { earlier = await d.docList(STORE, proj.id); }
  catch (e) { throw err(503, `the project's earlier changesets could not be read (${e.message}) — nothing was filed: a decline made before could not be carried to this changeset; send it again`); }

  // Reuse the referee as-is: it resolves the project's installed IDS (artefact-store) and writes its own
```

The stamp — replace:

```js
  const now = new Date().toISOString();
  const changeset = {
```

with:

```js
  // MA-3b3: the match is the bridge's, on the elements it validated and typed and on what it stored — never a posted claim (a
  // posted `review` is not kept: validateChangeset lists it under `ignored`).
  const carry = carryDeclines(attachVerdicts(v.elements, adj), earlier);
  const carrySaid = carry.carried.length + carry.no_reason + carry.creates + carry.unverified > 0;
  const now = new Date().toISOString();
  const changeset = {
```

The elements — replace:

```js
    elements: attachVerdicts(v.elements, adj),
```

with:

```js
    elements: carry.elements,
    // MA-3b3: how many ghosts were filed already declined, and how many could not be (rejected in Revit before with no reason of
    // their own; with a reason no signed-in member reported — C1; creates like one declined before — C7) — on the 201 reply and
    // every later read. Absent when all are 0.
    ...(carrySaid ? { carry: { carried: carry.carried.length, no_reason: carry.no_reason, creates: carry.creates, unverified: carry.unverified } } : {}),
```

The row — replace:

```js
      claimed: v.claimed, ignored: v.ignored.length, typed: v.elements.filter((e) => e.typing?.typed_by === "bridge").length });
  return changeset;
```

with:

```js
      claimed: v.claimed, ignored: v.ignored.length, typed: v.elements.filter((e) => e.typing?.typed_by === "bridge").length,
      // MA-3b3: the ONE row of the filing says how many declines were carried, each with where it came from, and what was not.
      ...(carrySaid ? { carried: carry.carried.length, carried_from: carry.carried, not_carried: { no_reason: carry.no_reason, creates: carry.creates, unverified: carry.unverified } } : {}) });
  return changeset;
```

In `reportResult`, the reporter's role (C1) — replace:

```js
  await d.requireMinRole(key, "contributor");
  const proj = await d.ensureProject(key);
  const appliedArr = Array.isArray(applied) ? applied : [];
```

with:

```js
  await d.requireMinRole(key, "contributor");
  // MA-3b3 (C1): the role the bridge reads for this caller — a member's, or "service" for the machine credential (whose `actor` is
  // the caller's claim). Stored with the result: only a member's reason is a decline that is carried to the next filing.
  const role = await d.myRole(key);
  const proj = await d.ensureProject(key);
  const appliedArr = Array.isArray(applied) ? applied : [];
```

and replace:

```js
        reported_at: new Date().toISOString(), reported_by: resolveActor(actor, "revit"),
```

with:

```js
        reported_at: new Date().toISOString(), reported_by: resolveActor(actor, "revit"),
        reported_role: role ?? null, // MA-3b3 (C1): the bridge's own reading — never a posted field
```

In `reportResult`, the 409 — replace:

```js
      throw err(409, conflicts.refused.map((x) => `${x.name} was declined on the web by ${x.by} (${x.role}): "${x.reason}" — review_rev ${x.rev}, which this result says Revit re-checked`).join("; ") +
```

with:

```js
      // MA-3b3: a carried decline names its origin; C6: it was on the filing's 201 reply, so it is refused whatever the result claims.
      throw err(409, conflicts.refused.map((x) => `${x.name} was ${declineWords(x)}: "${x.reason}" — ${x.carried_from ? "the changeset was filed with it declined (review_rev 0)" : `review_rev ${x.rev}, which this result says Revit re-checked`}`).join("; ") +
```

C3 — in `WebApp/bridge/cde-store.mjs`, replace:

```js
/** List a store's documents for a project (data objects, insertion order). */
export async function docList(store, pid) {
  const rows = await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&select=data&order=created_at.asc`);
  return (rows || []).map((r) => r.data);
}
```

with:

```js
/** List a store's documents for a project (data objects, insertion order). MA-3b3 (C3): read in pages — the database caps one
 *  reply (PostgREST max-rows), and with this order a cut read would drop the NEWEST documents without a word.
 *  ponytail: a short page ends the read — a database whose max-rows is set below DOC_PAGE would still cut on page one; ask for the
 *  exact count (sb's `count`) if that setting is ever lowered. */
const DOC_PAGE = 1000;
export async function docList(store, pid) {
  const out = [];
  for (let offset = 0; ; offset += DOC_PAGE) {
    const rows = (await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&select=data&order=created_at.asc,doc_id.asc&limit=${DOC_PAGE}&offset=${offset}`)) || [];
    out.push(...rows.map((r) => r.data));
    if (rows.length < DOC_PAGE) return out;
  }
}
```

- [ ] **Step 4: See them pass.** From `WebApp`: `npx vitest run bridge/changesets-store.test.mjs bridge/cde-store-oracle.test.mjs` → `71 passed (71)`. Then the whole suite, because every caller of `proposeChangeset` now reads the store and every caller of `docList` now pages: `npx vitest run` → `143 passed (143)` files, `2352 passed | 1 skipped (2353)`; restore `ids-cases.json` (Global Constraints).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/changesets-store.test.mjs WebApp/bridge/changesets-store.mjs WebApp/bridge/cde-store-oracle.test.mjs WebApp/bridge/cde-store.mjs
git commit -m "feat(bridge): MA-3b3 - a decline is carried at filing: proposeChangeset reads the project's changesets before anything is written (a failed read is a 503, nothing filed), stamps each ghost declined before (a web decline, or a Revit rejection with its own reason that a signed-in member reported) with the decline's words, who and where from, stores what was and was not carried on the changeset, and says it on the filing's one changeset_proposed row; a result stores the reporter's role as the bridge read it, and the machine credential's reason is never a decline; a result applying a carried ghost is the 409, with or without a review_rev, in words that name its origin; a posted review is never kept; docList reads a store in pages" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3 — Revit: a carried decline's words (pure, promote-check §48)

**Files:**
- Create: `tools/promote-check/Ma3b3.cs`
- Modify: `tools/promote-check/Check.cs` (the call list near `:72`)
- Modify: `tools/promote-check/Ma3aReview.cs` (`:43`, the `DeclinedHeader` literal; `:48`, `DeclinedTicked`'s first line — C8)
- Modify: `SentinelAddin/Coordination/ChangesetClient.cs` (`ReviewDto` near `:144`; `ChangesetDto` near `:424`; `ReviewLine` `:341`; `DeclinedHeader` `:347-353`; `DeclinedTicked` `:361` — C8)
- Modify: `SentinelAddin/GhostBuilder/StoreyBatch.cs` (`Line` `:83-85`; `Merge` near `:116`)
- Modify: `SentinelAddin/UI/ChangesetReviewWindow.cs` (`:90`; the reason box's tooltip `:221` — C8, C10; `:231-232`)

**Interfaces:**
- Consumes: the fixture's `changeset` (Task 1), as the bridge stores it (Task 2).
- Produces: `ReviewDto.CarriedFrom` (`CarriedFromDto {Changeset, Name, ProposalGuid, Origin}`), `ChangesetDto.Carry` (`CarryDto {Carried, NoReason, Creates, Unverified}`), `ChangesetTrust.DeclinedCount(IEnumerable<ChangesetElementDto>) → string`, `ChangesetTrust.NotCarriedLine(ChangesetDto) → string`.

- [ ] **Step 1: The failing check.** Create `tools/promote-check/Ma3b3.cs`:

```csharp
#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 48. MA-3b3: a decline carried forward — the add-in reads the stamp the bridge files (the shared fixture
    //        WebApp/bridge/fixtures/changeset-ops/ma3b3-carry.json, whose `changeset` vitest proves carryDeclines makes): the ghost
    //        opens unticked and locked as any decline, and every word names where the decline was made ───────────────────────────
    static void Ma3b3CarryChecks()
    {
        Console.WriteLine("\nMA-3b3 — a carried decline as Revit reads it");
        using var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ma3b3-carry.json")));
        ChangesetDto Read() => JsonSerializer.Deserialize<ChangesetDto>(fx.RootElement.GetProperty("changeset").GetRawText());
        var cs = Read();
        using var fa = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ma3a-review.json")));
        var web = JsonSerializer.Deserialize<ChangesetDto>(fa.RootElement.GetProperty("after").GetRawText());
        ChangesetElementDto G(string g) => cs.Elements.Single(e => e.ProposalGuid == g);
        const string storey = "Promote (DD) · GR-FFL";

        Ok(G("n-1").Review.CarriedFrom is { Changeset: "cs-a", Name: storey, ProposalGuid: "a-1", Origin: "web" } && G("n-1").Review.Rev == 0
           && G("n-2").Review.CarriedFrom is { Changeset: "cs-a", ProposalGuid: "a-2", Origin: "revit" } && G("n-2").Review.Role == "contributor"
           && cs.Carry is { Carried: 2, NoReason: 1, Creates: 1, Unverified: 1 } && web.Carry == null && web.Elements[0].Review.CarriedFrom == null,
           "a carried review reads with where it came from, and the changeset with what was and was not carried; a changeset without either reads null");
        Ok(ChangesetTrust.DeclinedOnWeb(G("n-1")) && ChangesetTrust.DeclinedOnWeb(G("n-2")) && !ChangesetTrust.PreTick(cs, G("n-1")) && !ChangesetTrust.PreTick(cs, G("n-2"))
           && G("n-1").Pretick == true && ChangesetTrust.PreTick(cs, G("n-3")) && !ChangesetTrust.DeclinedOnWeb(G("n-3")),
           "a carried decline binds as any decline: never ticked, whatever its pre-tick; a ghost that was not carried keeps its own");

        Ok(ChangesetTrust.ReviewLine(G("n-1")) == "declined on the web by reviewer@example.com (contributor) in \"Promote (DD) · GR-FFL\", carried here by the bridge: wrong type: W 1 is a party wall · a lead may re-open it on the web desk"
           && ChangesetTrust.ReviewLine(G("n-2")) == "declined in Revit by modeller@example.com (contributor) in \"Promote (DD) · GR-FFL\", carried here by the bridge: W 2 is demolished in the next package · a lead may re-open it on the web desk",
           "a carried row says where the decline was made (the web, or Revit), by whom, in which changeset, and that the bridge carried it");
        var odd = Read().Elements[0];
        odd.Review.CarriedFrom.Origin = "a script";
        Ok(ChangesetTrust.ReviewLine(odd).StartsWith("declined before by reviewer@example.com (contributor) in \"Promote (DD) · GR-FFL\", carried here by the bridge: "),
           "an origin the add-in does not know is said as 'before', never guessed");

        Ok(ChangesetTrust.DeclinedHeader(cs) == "2 ghost(s) declined (2 carried here by the bridge from an earlier changeset) — shown unticked with the reason; they cannot be ticked here (a lead re-opens one on the web desk while its changeset is still proposed). Apply reports them as rejected; the changeset stays proposed until Revit reports it. A decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason).",
           "the window's header counts the carried declines and says a decline is carried (MA-3a's C4 sentence is gone)");
        Ok(ChangesetTrust.DeclinedCount(cs.Elements) == "2 declined (2 carried)" && ChangesetTrust.DeclinedCount(web.Elements) == "2 declined on the web"
           && ChangesetTrust.DeclinedCount(new[] { G("n-3") }) == null
           && StoreyBatch.Line(new[] { cs }, new DateTime(2026, 10, 4, 15, 0, 0, DateTimeKind.Utc)).EndsWith(" · 2 declined (2 carried)"),
           "the picker's line and a group's header count the declines and say how many were carried — 'on the web' only when none was");

        Ok(ChangesetTrust.NotCarriedLine(cs) == "1 ghost(s) here were rejected in Revit before with no reason of their own — proposed again, undecided: the bridge cannot tell an unticked row from an element Revit removed or an Apply that rolled back. A reason in the group's box makes a decline carry.\n1 ghost(s) here were rejected in Revit before with a reason, by a caller the bridge did not know as a signed-in member (the machine credential, or a report from before this version) — not carried: proposed again, undecided.\n1 create(s) here are of the same kind, type and level as a create declined before on this project — a create names no existing element, so the bridge cannot tell whether it is the same one: proposed again, undecided."
           && ChangesetTrust.NotCarriedLine(web) == null && ChangesetTrust.NotCarriedLine(new ChangesetDto { Carry = new CarryDto { Carried = 3 } }) == null,
           "what the bridge could not carry is said — a rejection with no reason of its own, a reason no signed-in member reported (C1), a create like one declined before (C7) — and nothing is said when there is none");
        var second = Read(); second.Id = "cs-2"; second.Name = storey + " (2/2)"; cs.Name = storey + " (1/2)";
        var storeyOfTwo = StoreyBatch.Merge(new[] { cs, second });
        cs.Name = storey;
        Ok(storeyOfTwo.Carry is { Carried: 4, NoReason: 2, Creates: 2, Unverified: 2 } && ChangesetTrust.NotCarriedLine(storeyOfTwo).StartsWith("2 ghost(s) here were rejected in Revit before")
           && StoreyBatch.Merge(new[] { web, web }).Carry == null,
           "a storey's parts are counted together");

        var refused = ChangesetTrust.DeclinedTicked(new[] { cs }, new HashSet<string> { "n-2", "n-3" });
        Ok(refused != null && refused.StartsWith("1 ticked ghost(s) were declined after this window opened:\n")
           && refused.Contains("· retype wall \"W 2\" — declined in Revit by modeller@example.com (contributor) in \"Promote (DD) · GR-FFL\", carried here by the bridge: W 2 is demolished in the next package"),
           "Apply's re-check refuses a ticked carried decline with the same words, and never calls a Revit decline the web's (C8)");

        string window = Src("UI", "ChangesetReviewWindow.cs"), batch = Src("GhostBuilder", "StoreyBatch.cs"), client = Src("Coordination", "ChangesetClient.cs");
        Ok(window.Contains("if (ChangesetTrust.NotCarriedLine(_cs) is string notCarried)") && window.Contains("string declinedHere = ChangesetTrust.DeclinedCount(group);")
           && batch.Contains("ChangesetTrust.DeclinedCount(els) is { } declined") && !window.Contains("declined on the web\" : \"\")") && !batch.Contains("declined on the web\" : \"\")")
           && !client.Contains("a new Promote run proposes a declined ghost again, undecided")
           && window.Contains("carried to the next filing") && window.Contains("not for a row already declined (its reason stands)") && !window.Contains("the web's reason stands")
           && !client.Contains("were declined on the web after this window opened"),
           "the window says what was not carried, the group header and the picker line use the one count, no source says a declined ghost is proposed again undecided, and the reason box and Apply's refusal never call every decline the web's (C8, C10; source scan)");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b2bWiringChecks();
```

with:

```csharp
        Ma3b2bWiringChecks();
        Ma3b3CarryChecks();
```

In `tools/promote-check/Ma3aReview.cs`, three replacements inside its literals. `DeclinedTicked`'s first line (C8) — replace:

```text
"1 ticked ghost(s) were declined on the web after this window opened:\n
```

with:

```text
"1 ticked ghost(s) were declined after this window opened:\n
```

Where a lead re-opens (C5) — replace:

```text
they cannot be ticked here (a lead may re-open one on the web desk). Apply reports them as rejected;
```

with:

```text
they cannot be ticked here (a lead re-opens one on the web desk while its changeset is still proposed). Apply reports them as rejected;
```

And the C4 sentence — replace:

```text
Apply reports them as rejected; the changeset stays proposed until Revit reports it — a new Promote run proposes a declined ghost again, undecided."
```

with:

```text
Apply reports them as rejected; the changeset stays proposed until Revit reports it. A decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason)."
```

- [ ] **Step 2: See it fail.** From the repo root: `dotnet run --project tools/promote-check` → the build fails: `error CS1061: 'ReviewDto' does not contain a definition for 'CarriedFrom'`, `error CS1061: 'ChangesetDto' does not contain a definition for 'Carry'`, `error CS0117: 'ChangesetTrust' does not contain a definition for 'DeclinedCount'` (and `'NotCarriedLine'`).

- [ ] **Step 3: The code.** In `SentinelAddin/Coordination/ChangesetClient.cs`, five replacements. `ReviewDto`'s end — replace:

```csharp
    /// <summary>The changeset's review_rev this decision was written at.</summary>
    [JsonPropertyName("rev")] public int? Rev { get; set; }
}
```

with:

```csharp
    /// <summary>The changeset's review_rev this decision was written at (0 on a carried decline: the revision the changeset was filed at).</summary>
    [JsonPropertyName("rev")] public int? Rev { get; set; }
    /// <summary>MA-3b3: set when the bridge filed this ghost already declined — the decline was made before, on another changeset of
    /// the project (changesets-logic.mjs carryDeclines). Null on a decline made on this changeset, and from a bridge before MA-3b3.</summary>
    [JsonPropertyName("carried_from")] public CarriedFromDto CarriedFrom { get; set; }
}

/// <summary>MA-3b3: where a carried decline was made — the changeset (its id and name), the ghost there, and "web" (the review desk)
/// or "revit" (a row rejected in Revit with a reason).</summary>
public sealed class CarriedFromDto
{
    [JsonPropertyName("changeset")] public string Changeset { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("origin")] public string Origin { get; set; }
}

/// <summary>MA-3b3: what the bridge carried at filing, counted — ghosts filed already declined; ghosts rejected in Revit before with
/// no reason of their own (not carried); creates of the same kind, type and level as a create declined before (never matched);
/// ghosts rejected in Revit before with a reason that no signed-in member reported (not carried — review C1).</summary>
public sealed class CarryDto
{
    [JsonPropertyName("carried")] public int Carried { get; set; }
    [JsonPropertyName("no_reason")] public int NoReason { get; set; }
    [JsonPropertyName("creates")] public int Creates { get; set; }
    [JsonPropertyName("unverified")] public int Unverified { get; set; }
}
```

`ChangesetDto`'s end — replace:

```csharp
    [JsonPropertyName("result")] public JsonElement? Result { get; set; }
}
```

with:

```csharp
    [JsonPropertyName("result")] public JsonElement? Result { get; set; }
    /// <summary>MA-3b3: what the bridge carried when it filed this changeset; null when there was nothing to say, and from a bridge
    /// before MA-3b3.</summary>
    [JsonPropertyName("carry")] public CarryDto Carry { get; set; }
}
```

In `ReviewLine` — replace:

```csharp
        if (r.State == "declined") return $"declined on the web by {Who(r)}: {r.Reason} · a lead may re-open it on the web desk";
```

with:

```csharp
        // MA-3b3: a carried decline says where it was made (the web, or Revit), in which changeset, and that the bridge carried it.
        if (r.State == "declined")
            return (r.CarriedFrom is { } c
                ? $"declined {(c.Origin == "revit" ? "in Revit" : c.Origin == "web" ? "on the web" : "before")} by {Who(r)} in \"{c.Name}\", carried here by the bridge"
                : $"declined on the web by {Who(r)}") + $": {r.Reason} · a lead may re-open it on the web desk";
```

In `DeclinedHeader` — replace:

```csharp
        int n = (cs.Elements ?? new List<ChangesetElementDto>()).Count(DeclinedOnWeb);
        // C4: a decline binds its changeset only — a Promote re-run proposes the same ghost again, undecided (carrying it is MA-3b).
        return n == 0 ? null : $"{n} ghost(s) declined on the web — shown unticked with the reason; they cannot be ticked here (a lead may re-open one on the web desk). " +
                               "Apply reports them as rejected; the changeset stays proposed until Revit reports it — a new Promote run proposes a declined ghost again, undecided.";
    }
```

with:

```csharp
        var declined = (cs.Elements ?? new List<ChangesetElementDto>()).Where(DeclinedOnWeb).ToList();
        int n = declined.Count, k = declined.Count(e => e.Review.CarriedFrom != null);
        // MA-3b3 (replaces MA-3a's C4): the bridge carries a decline to the next changeset that proposes the same change.
        // C5: a re-open is for a changeset that is still proposed (changesets-logic reopenDecline).
        return n == 0 ? null : $"{n} ghost(s) declined{(k == 0 ? " on the web" : $" ({k} carried here by the bridge from an earlier changeset)")} — shown unticked with the reason; they cannot be ticked here (a lead re-opens one on the web desk while its changeset is still proposed). " +
                               "Apply reports them as rejected; the changeset stays proposed until Revit reports it. A decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason).";
    }

    /// <summary>MA-3b3: the declines among <paramref name="els"/>, counted for a picker line or a group header — "3 declined on the web",
    /// or "3 declined (2 carried)" when the bridge carried some from an earlier changeset; null when none is declined.</summary>
    public static string DeclinedCount(IEnumerable<ChangesetElementDto> els)
    {
        var declined = (els ?? Enumerable.Empty<ChangesetElementDto>()).Where(DeclinedOnWeb).ToList();
        int k = declined.Count(e => e.Review.CarriedFrom != null);
        return declined.Count == 0 ? null : k == 0 ? $"{declined.Count} declined on the web" : $"{declined.Count} declined ({k} carried)";
    }

    /// <summary>MA-3b3: what the bridge could not carry when it filed <paramref name="cs"/>, in words; null when there is nothing to say.</summary>
    public static string NotCarriedLine(ChangesetDto cs)
    {
        var c = cs?.Carry;
        if (c == null) return null;
        var said = new List<string>();
        if (c.NoReason > 0)
            said.Add($"{c.NoReason} ghost(s) here were rejected in Revit before with no reason of their own — proposed again, undecided: the bridge cannot tell an unticked row from an element Revit removed or an Apply that rolled back. A reason in the group's box makes a decline carry.");
        if (c.Unverified > 0) // C1: a binding decline is a signed-in person's — under the machine credential the reporter's name is a claim
            said.Add($"{c.Unverified} ghost(s) here were rejected in Revit before with a reason, by a caller the bridge did not know as a signed-in member (the machine credential, or a report from before this version) — not carried: proposed again, undecided.");
        if (c.Creates > 0) // C7: only creates like one declined before
            said.Add($"{c.Creates} create(s) here are of the same kind, type and level as a create declined before on this project — a create names no existing element, so the bridge cannot tell whether it is the same one: proposed again, undecided.");
        return said.Count == 0 ? null : string.Join("\n", said);
    }
```

In `DeclinedTicked` (C8: a carried decline may be Revit's own) — replace:

```csharp
        return hit.Count == 0 ? null : $"{hit.Count} ticked ghost(s) were declined on the web after this window opened:\n" +
```

with:

```csharp
        return hit.Count == 0 ? null : $"{hit.Count} ticked ghost(s) were declined after this window opened:\n" +
```

In `SentinelAddin/GhostBuilder/StoreyBatch.cs`, in `Line` — replace:

```csharp
        int declined = els.Count(ChangesetTrust.DeclinedOnWeb);
        return $"{cs.Name} — {cs.Source}{(cs.Claimed == true ? " (claimed)" : "")} · {Age(cs.CreatedAt, nowUtc)} · {els.Count} ghost(s): {V("accepted")} accepted, {V("rejected")} rejected, {V("recorded")} recorded" +
               (declined > 0 ? $" · {declined} declined on the web" : "");
```

with:

```csharp
        return $"{cs.Name} — {cs.Source}{(cs.Claimed == true ? " (claimed)" : "")} · {Age(cs.CreatedAt, nowUtc)} · {els.Count} ghost(s): {V("accepted")} accepted, {V("rejected")} rejected, {V("recorded")} recorded" +
               (ChangesetTrust.DeclinedCount(els) is { } declined ? " · " + declined : ""); // MA-3b3: "(n carried)" when the bridge carried some
```

and in `Merge` — replace:

```csharp
            Exceptions = batch.SelectMany(c => c.Exceptions ?? new List<ExceptionRowDto>()).ToList(),
```

with:

```csharp
            Exceptions = batch.SelectMany(c => c.Exceptions ?? new List<ExceptionRowDto>()).ToList(),
            // MA-3b3: what the bridge carried, and could not, counted over the storey's parts.
            Carry = batch.All(c => c.Carry == null) ? null : new CarryDto
            {
                Carried = batch.Sum(c => c.Carry?.Carried ?? 0), NoReason = batch.Sum(c => c.Carry?.NoReason ?? 0), Creates = batch.Sum(c => c.Carry?.Creates ?? 0),
                Unverified = batch.Sum(c => c.Carry?.Unverified ?? 0),
            },
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs` — replace:

```csharp
            head.Children.Add(new TextBlock { Text = "⚠ " + declinedLine, Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
```

with:

```csharp
            head.Children.Add(new TextBlock { Text = "⚠ " + declinedLine, Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
        // MA-3b3: what the bridge could not carry from an earlier decline, said once above the rows.
        if (ChangesetTrust.NotCarriedLine(_cs) is string notCarried)
            head.Children.Add(new TextBlock { Text = notCarried, Foreground = Brushes.Khaki, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
```

the reason box's tooltip (C8: a carried decline may be Revit's own; C10: a reason makes the decline carry) — replace:

```csharp
                                    ToolTip = "Optional, one line: why this group's unticked rows are declined. Recorded for each of them with the result — not for a row declined on the web (the web's reason stands)." };
```

with:

```csharp
                                    ToolTip = "Optional, one line: why this group's unticked rows are declined. Recorded for each of them with the result and, when Revit is signed in, carried to the next filing: the next changeset that proposes the same change files the row already declined — not for a row already declined (its reason stands)." };
```

and replace:

```csharp
            int declinedHere = group.Count(ChangesetTrust.DeclinedOnWeb);
            _headers.Add(() => groupBox.Header = $"{what} ({boxes.Count}) · {boxes.Count(b => b.IsChecked == true)} ticked" + (declinedHere > 0 ? $" · {declinedHere} declined on the web" : ""));
```

with:

```csharp
            string declinedHere = ChangesetTrust.DeclinedCount(group); // MA-3b3: "(n carried)" when the bridge carried some
            _headers.Add(() => groupBox.Header = $"{what} ({boxes.Count}) · {boxes.Count(b => b.IsChecked == true)} ticked" + (declinedHere != null ? " · " + declinedHere : ""));
```

- [ ] **Step 4: See it pass.** From the repo root: `dotnet run --project tools/promote-check` → `779/779 checks pass`.

- [ ] **Step 5: The builds** (never a deploy):

```bash
for v in 2022 2023 2024 2025 2026 2027; do printf "%s: " $v; dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Warning\(s\)|Error\(s\)" | tr -s ' \n' ' '; echo; done
```

Expected: `0 Error(s)` for each; warnings 2022 `3`, 2023 `3`, 2024 `5`, 2025 `1`, 2026 `1`, 2027 `3` (master's own counts).

- [ ] **Step 6: Commit.**

```bash
git add tools/promote-check/Ma3b3.cs tools/promote-check/Check.cs tools/promote-check/Ma3aReview.cs SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/GhostBuilder/StoreyBatch.cs SentinelAddin/UI/ChangesetReviewWindow.cs
git commit -m "feat(addin): MA-3b3 - Review AI Proposals says a carried decline: the row names where it was declined (the web, or Revit), by whom, in which changeset, and that the bridge carried it; the header counts the carried ones and says a decline is carried (MA-3a's C4 sentence is gone); the picker line and the group header say how many were carried; what the bridge could not carry (a rejection with no reason of its own, a reason no signed-in member reported, a create like one declined before) is said above the rows; the reason box says a reason is carried, and neither it nor Apply's refusal calls every decline the web's; no lock logic changed; promote-check section 48 reads the shared fixture (779)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4 — Web: the desk's words for a carried decline; 1.0.43

**Files:**
- Modify: `WebApp/src/setups/review-desk.test.ts` (the import at `:11`; a new `describe` at the end)
- Modify: `WebApp/src/setups/review-desk.ts` (`GhostReview` `:14`; `DeskResult` `:26`; `reviewWords` `:71-79`; `decidedView` near `:167`; the intro near `:288`)
- Modify: `WebApp/package.json` (`:3`)

**Interfaces:**
- Consumes: the fixture's `changeset` (Task 1).
- Produces: `CarriedFrom`, `declinedBy(r) → string` (exported).

- [ ] **Step 1: The failing tests.** In `WebApp/src/setups/review-desk.test.ts`, replace the import's first line:

```ts
import { storeyOf, groupDesk, ghostLine, reviewWords, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset,
```

with:

```ts
import { storeyOf, groupDesk, ghostLine, reviewWords, declinedBy, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset,
```

and add at the end of the file:

```ts
describe("MA-3b3 — a carried decline on the desk", () => {
  const c3 = JSON.parse(readFileSync(new URL("../../bridge/fixtures/changeset-ops/ma3b3-carry.json", import.meta.url), "utf8"));
  const carried = c3.changeset as PendingChangeset;

  it("says where the decline was made, by whom, in which changeset, and that the bridge carried it; it binds as any decline", () => {
    const [n1, n2, n3] = carried.elements;
    expect(reviewWords(n1)).toBe('declined on the web by reviewer@example.com (contributor) in "Promote (DD) · GR-FFL", carried here by the bridge: wrong type: W 1 is a party wall — binds: Revit shows it unticked and refuses the tick');
    expect(reviewWords(n2)).toBe('declined in Revit by modeller@example.com (contributor) in "Promote (DD) · GR-FFL", carried here by the bridge: W 2 is demolished in the next package — binds: Revit shows it unticked and refuses the tick');
    expect(reviewWords(n3)).toBe("waiting — nobody decided on the web");
    expect(declinedBy({ by: "x", role: null, carried_from: { changeset: "c", name: "N", proposal_guid: "g", origin: "a script" } })).toBe('declined before by x in "N", carried here by the bridge');
    expect(declinedBy(after.elements[0].review!)).toBe("declined by reviewer@example.com (contributor)");
  });

  it("Recently decided: a carried decline the report rejected is said with its origin, never as the web's", () => {
    const r = carried.elements[1].review!;
    const v = decidedView({ ...carried, status: "declined", result: { applied: [], rejected: ["n-2"], note: "x", reported_at: "2026-10-04T14:00:00.000Z", reported_by: "modeller@example.com",
      declined_on_web: [{ proposal_guid: "n-2", by: r.by, role: r.role, reason: r.reason!, carried_from: r.carried_from }] } }, null);
    expect(v.declined[0].why).toEqual(['declined in Revit by modeller@example.com (contributor) in "Promote (DD) · GR-FFL", carried here by the bridge: W 2 is demolished in the next package']);
  });

  it("the desk's intro says a decline is carried (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("a decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason); a lead re-opens it here while its changeset is still proposed.");
    expect(src).not.toContain("a new Promote run proposes a declined ghost again, undecided");
  });
});
```

- [ ] **Step 2: See them fail.** From `WebApp`: `npx vitest run src/setups/review-desk.test.ts` → `3 failed | 19 passed (22)`.

- [ ] **Step 3: The code.** In `WebApp/src/setups/review-desk.ts`, six replacements. The type — replace:

```ts
export interface GhostReview { state: "proposed" | "accepted" | "declined"; action: "accept" | "decline" | "reopen"; reason: string | null; by: string; role: string; at: string; rev: number; }
```

with:

```ts
/** MA-3b3: where a carried decline was made — the earlier changeset, the ghost there, and "web" or "revit". */
export interface CarriedFrom { changeset: string; name: string; proposal_guid: string; origin: string; }
/** `carried_from` is set when the bridge filed the ghost already declined; a decline carried from Revit holds the reporter's role as
 *  the bridge read it (review C1). `role` may be null on a review whose role the desk was not given — it is then left out, never printed. */
export interface GhostReview { state: "proposed" | "accepted" | "declined"; action: "accept" | "decline" | "reopen"; reason: string | null; by: string; role: string | null; at: string; rev: number; carried_from?: CarriedFrom | null; }
```

In `DeskResult` — replace:

```ts
  declined_on_web?: { proposal_guid: string; by: string; role: string; reason: string }[];
```

with:

```ts
  declined_on_web?: { proposal_guid: string; by: string; role: string | null; reason: string; carried_from?: CarriedFrom | null }[];
```

Above `reviewWords` — replace:

```ts
/** The web desk's decision in words (Revit's ChangesetTrust.ReviewLine, from the desk's side); "waiting" when nobody decided. */
```

with:

```ts
/** MA-3b3: who declined, and — for a decline the bridge carried from an earlier changeset — where it was made (the web, or Revit) and
 *  in which changeset. An origin the desk does not know is "before", never guessed. */
export const declinedBy = (r: { by: string; role: string | null; carried_from?: CarriedFrom | null }): string => {
  const who = r.role ? `${r.by} (${r.role})` : r.by, c = r.carried_from;
  return c ? `declined ${c.origin === "revit" ? "in Revit" : c.origin === "web" ? "on the web" : "before"} by ${who} in "${c.name}", carried here by the bridge` : `declined by ${who}`;
};

/** The web desk's decision in words (Revit's ChangesetTrust.ReviewLine, from the desk's side); "waiting" when nobody decided. */
```

In `reviewWords` — replace:

```ts
  const who = `${r.by} (${r.role})`;
  if (r.state === "declined") return `declined by ${who}: ${r.reason} — binds: Revit shows it unticked and refuses the tick`;
```

with:

```ts
  const who = `${r.by} (${r.role})`;
  if (r.state === "declined") return `${declinedBy(r)}: ${r.reason} — binds: Revit shows it unticked and refuses the tick`;
```

In `decidedView` — replace:

```ts
      if (w) why.push(`web, ${w.by} (${w.role}): ${w.reason}`);
```

with:

```ts
      if (w) why.push(w.carried_from ? `${declinedBy(w)}: ${w.reason}` : `web, ${w.by} (${w.role}): ${w.reason}`); // MA-3b3: a carried decline names its origin
```

In `show()`'s intro — replace the end of the sentence:

```text
A changeset stays proposed until Revit applies or declines it — a new Promote run proposes a declined ghost again, undecided.", "color:#8b93a1;margin-bottom:.5rem"));
```

with:

```text
A changeset stays proposed until Revit applies or declines it — a decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason); a lead re-opens it here while its changeset is still proposed.", "color:#8b93a1;margin-bottom:.5rem"));
```

In `WebApp/package.json` — replace:

```json
  "version": "1.0.42",
```

with:

```json
  "version": "1.0.43",
```

- [ ] **Step 4: See them pass.** From `WebApp`: `npx vitest run src/setups/review-desk.test.ts` → `22 passed (22)`. `npx tsc --noEmit -p . 2>&1 | grep review-desk` → no line (the count of `error TS` lines is the same before and after: the checkout's 17 are elsewhere and unchanged).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/src/setups/review-desk.test.ts WebApp/src/setups/review-desk.ts WebApp/package.json
git commit -m "feat(web): MA-3b3 - the review desk says a carried decline: where it was declined (the web, or Revit), by whom, in which changeset, and that the bridge carried it - on the row and under Recently decided in Revit; the intro says a decline is carried, and that a lead re-opens it while its changeset is still proposed; 1.0.43" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5 — Words: the design doc; the final checks

**Files:**
- Modify: `docs/strategy/2026-09-30-model-automation-design.md` (the end of the line at `:1106`)

- [ ] **Step 1: The design doc says what was built.** In `docs/strategy/2026-09-30-model-automation-design.md`, replace:

```markdown
a Decline all whose reply was lost is taken on Retry report, not called refused.
```

with:

```markdown
a Decline all whose reply was lost is taken on Retry report, not called refused. A decline carried forward: BUILT on `feature/ma3b3-carried-decline` (MA-3b3), drill MA3b3 pending — the bridge stamps it at filing (founder decision A): a ghost that proposes the same change (the element, the op, and the type, the levels or the parameter and value it sets) as one declined before on the project — a web decline still standing, or a row rejected in Revit with a reason for it that a signed-in member reported (the bridge stores the reporter's role with a result, `result.reported_role`; the machine credential's reason is never a decline) — is filed already declined, with the decline's words, who made it and the changeset it came from (`review.carried_from`); the newest decision stands, by when it was made (applied since, or re-opened by a lead: not carried); a rejection with no reason of its own, a reason no signed-in member reported and a create are not carried, and that is counted on the changeset (`carry`), on the filing's `changeset_proposed` row and in Revit's window; a result that applies a carried ghost is refused, with or without a `review_rev`; Revit and the web desk show it unticked and locked with its origin, and a lead re-opens it on the desk while its changeset is still proposed; the store's list reads in pages. The Revit "ticked" lock (MA-3a F2 C) is not built: the gap it closes is recorded and said since MA-3a, and the report cannot be lost since MA-3b.
```

- [ ] **Step 2: The final checks.** From `WebApp`: `npx vitest run` → `143 passed (143)` files, `2355 passed | 1 skipped (2356)`; restore `ids-cases.json` (Global Constraints). From the repo root, every check project:

```bash
for d in tools/*-check; do ls $d/*.csproj >/dev/null 2>&1 || continue; printf "%s: " $(basename $d); dotnet run --project $d 2>&1 | grep -E "checks? pass|DATUM OK" | tail -1; done
```

Expected: 26 lines — `promote-check: 779/779 checks pass`, the other 24 that count as on master (together with it `2396/2396`) — and `datum-check: DATUM OK`. `tools/rvtinfo-check` has no project and is skipped.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -m "docs: MA-3b3 - the design doc says what was built (a decline carried forward by the bridge at filing; the ticked lock not built, with the reason); drill MA3b3 pending" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Live drill MA3b3 (one script row on the test bridge; three Revit rows on Revit 2024 on the branch's build; one web row on a local desk against the test bridge — before the merge)

**The founder's OK first (F7).** The Revit rows' set-up deploys the branch's add-in into Revit 2024. That needs the founder's explicit OK in chat for this drill; without it R-1, R-2, R-3 and W-1 are **owed** and only B-1 runs — and then **the carry itself is proven offline only** (C1: B-1 holds the machine credential, whose reason is never a decline; a decline that carries needs a signed-in Revit). The one OK covers the deploy and the put-back. The founder's 4100 bridge is **not** touched and not restarted for the drill: every row runs against the test bridge on `127.0.0.1:4101`, which runs this checkout's (the branch's) bridge code.

**Who does what.** B-1 is the runner's, by script. The Revit rows: the runner drives Revit by mouse (or UI Automation's Invoke), Revit signed in (Standards ▸ Sign in — the founder's). **Focus-sensitive steps** — reading the review window, typing a reason, reading a TaskDialog — happen while Revit is in front, or are the founder's: a script cannot take focus from Chrome, and Revit's owned review window hides from UI Automation while Revit is in the background (a hidden window looked closed in MA3a). TaskDialog buttons have no UIA Invoke (`WindowPattern.Close` works). Revit's Undo list opens at its dropdown (`133,10`): read it, **never click an entry**. The pane's grid virtualizes (read it through `ScrollPattern`). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window. Open the scratch copy from Revit's Open dialog; never save it. The web row is read on the founder's signed-in desk (port 4002) — the founder's, or the runner reading that tab only through page script that returns `document.body.innerText.replace(/[^\s@]+@[^\s@]+/g, "<account>")` (no screenshot, no page-text or accessibility read of that tab); the runner types no password and signs nobody in. **The record never quotes an address**: a carried row shows the earlier decliner's account — written `<account>`. No screenshot of the review window's rows either; they are read as text (UI Automation) and the address replaced before anything is recorded.

**The Revit MCP in this drill:** only its read-only calls, never while a Revit command, a TaskDialog or a Sentinel window is open.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run (tight scope); the code is the same on net8/net10 and builds there (Task 3).
- **The published app**: not run — the publish is the founder's, after the merge; W-1 runs on a local desk.
- **A web decline carried** (origin `web`): not provoked live — it needs a decline on the desk, a report from Revit and a third Promote run; checked offline (the shared fixture: vitest, promote-check §48). If the founder wants it, it is one more loop after R-3 and the record says so.
- **A set_parameter and an attach carried**, **a door's or window's retype**: checked offline (vitest `carryKey`); the live rows carry wall retypes.
- **A create not matched** (`creates`), **a failed read of the earlier changesets** (the 503), **a storey whose every ghost is carried** (F8), **a result applying a carried ghost** (the 409, with and without a `review_rev` — the add-in never ticks one, and B-1's script cannot make a carried ghost: C1), **a decline re-opened on its origin after a later filing took the copy, and a changeset applied after a later one's decline** (C2), **a store of more than 1000 changesets** (C3): checked offline (vitest), not provoked live.
- **A second account**: the carried row's "by" is the founder's own account in this drill (one account).
- **MA3b2b's owed rows** (a report opened on the desk and Refresh live, the picker's closed-window gap), MA3b2's and MA3b's stay owed; this drill does not carry them.

**Set-up (once; the deploy only after the founder's OK):**
- **The test bridge on 127.0.0.1:4101.** The `bridge-test` preview server (`.claude/launch.json`; `node <scratchpad>/bridge-test.mjs`, `cwd` `WebApp`) — three lines, written again if the file is gone: `process.env.BCF_PORT = "4101"; process.env.BCF_EVENT_POLL_MS = "0"; await import("file:///C:/Users/yazan/Claude/Projects/Co%20BIM%20Assistant/sentinel-project/WebApp/bridge/bcf-service.mjs");`. `curl -s http://127.0.0.1:4101/health` answers. It must be started (or restarted) on this branch after Task 2. Every bridge call of the runner names `http://127.0.0.1:4101` through the helper (the machine credential, read through `load-env.mjs`, never printed), from `WebApp`:

  ```bash
  b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
  ```

- **The scratch web projects** (fresh keys): `b4101 POST cde/projects '{"key":"ma3b3-office","kind":"office"}'`, `b4101 POST cde/projects '{"key":"ma3b3","office_key":"ma3b3-office"}'`, `b4101 POST cde/projects '{"key":"ma3b3-b1","office_key":"ma3b3-office"}'`; on the office: `b4101 PUT "cde/ma3b3-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma3b3-office/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json`, `b4101 PUT "cde/ma3b3-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`, `b4101 PUT "cde/ma3b3-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json` (each 201). The founder's membership on `ma3b3` as a **lead** (W-1 re-opens; the e-mail never reaches a command line, a log or the record): the founder writes `{"email":"<their account>","role":"lead"}` to `<scratchpad>/ma3b3/member.json`; the runner sends `b4101 POST cde/ma3b3/members @<scratchpad>/ma3b3/member.json | grep -oE '^[0-9]+|"user_id":"[^"]*"'` (the status and the `user_id` only) and deletes the file.
- **B-1's script**, `<scratchpad>/ma3b3/b1.mjs` (not in the repository; run from `WebApp`: `node <scratchpad>/ma3b3/b1.mjs`):

  ```js
  // Drill MA3b3 row B-1 (review C1): the machine credential's reason is NOT a decline that carries — the filing is read, counted and
  // said, and nothing is stamped. The test bridge 127.0.0.1:4101, by script (the machine credential; never the 4100 bridge).
  import { pathToFileURL } from "node:url";
  const { loadEnv } = await import(pathToFileURL(process.cwd() + "/bridge/load-env.mjs").href);
  const token = loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "";
  const KEY = process.argv[2] || "ma3b3-b1", BASE = "http://127.0.0.1:4101";
  const mask = (s) => String(s).replace(/[^\s@"]+@[^\s@"]+/g, "<account>");
  const call = async (method, path, body) => {
    const r = await fetch(`${BASE}/${path}`, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const retype = (n) => ({ kind: "wall", op: "retype", target: { unique_id: `5a1c2b3d-1111-2222-3333-444455556666-0004c40${n}`, type_before: "Generic - 200mm" },
    place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" }, validate: { identity: { Class: "IfcWall", Name: `W ${n}` } } });
  const storey = () => ({ name: "Drill MA3b3 · B-1", source: "drill-ma3b3", actor: "drill-ma3b3", elements: [retype(1), retype(2), retype(3)] });
  const A = await call("POST", `changesets/${KEY}`, storey());
  console.log("A filed", A.status, "carry", JSON.stringify(A.body?.carry ?? null), "reviews", A.body?.elements?.filter((e) => e.review).length);
  const [a1, a2, a3] = A.body.elements.map((e) => e.proposal_guid);
  const R = await call("POST", `changesets/${KEY}/${A.body.id}/result`, { actor: "drill-ma3b3", applied: [{ proposal_guid: a3, revit_element_id: 5 }], rejected: [a1, a2], review_rev: 0, reasons: { [a1]: "drill MA3b3 B-1: W 1 stays as modelled" } });
  console.log("A reported", R.status, R.body?.status, "reported_role", R.body?.result?.reported_role);
  const B = await call("POST", `changesets/${KEY}`, storey());
  console.log("B filed", B.status, "carry", JSON.stringify(B.body?.carry ?? null));
  console.log(B.body?.elements?.map((e, i) => `B W ${i + 1} review ${mask(JSON.stringify(e.review ?? null))}`).join(" · "));
  const rows = await call("GET", `cde/${KEY}/audit?entity_type=changeset&action_prefix=changeset_proposed&entity_id=${B.body.id}&limit=3`);
  console.log("B ledger", rows.status, mask(JSON.stringify(rows.body)).slice(0, 1500));
  const W = await call("POST", `changesets/${KEY}/${B.body.id}/withdraw`, { actor: "drill-ma3b3" });
  console.log("B withdrawn", W.status, W.body?.status);
  ```

  It is run once per key: a second run on the same key would count the first run's rejections into its own "A" (then pass another fresh key as its argument, created first).
- **The desk for W-1 on port 4002, against 4101** (port 4000 stays the founder's): a preview server `ma3b3-desk`, added to `.claude/launch.json` and removed in the closing list — `node <scratchpad>/desk-4002.mjs`, port 4002. MA3a's file is still in the scratchpad; if it is gone, write it again:

  ```js
  // Drill MA3b3: the web desk on port 4002 against the test bridge 4101. Not in the repo. Port 4000 stays the founder's.
  import { spawn } from "node:child_process";
  const cwd = "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp";
  const env = { ...process.env, VITE_SENTINEL_SERVICE: "http://127.0.0.1:4101" };
  const run = (cmd) => new Promise((ok, no) => spawn(cmd, { cwd, env, shell: true, stdio: "inherit" }).on("exit", (c) => (c === 0 ? ok() : no(new Error(cmd + " exited " + c)))));
  await run("node scripts/build-fragments-worker.mjs");
  await run("npx thatopen serve --port 4002");
  ```

  The founder signs in on `http://localhost:4002` (their own typing).
- **The add-in's bridge settings.** With Revit closed: copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma3b3bak` beside it (never print it, never open it in a viewer); point it at the test bridge: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The deploy (after the founder's OK).** Record the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`) and which commit it is, if known. `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build); record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The scratch model**: `Documents\Sentinel drills\ma3b3\ma3b3-a.rvt`, a copy of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), opened from Revit's Open dialog, bound with Sentinel ▸ Project Setup to `ma3b3`, never saved. A floor plan of GR-FFL is the active view.
- **Promote once**: Sentinel ▸ Promote (DD) → **Yes**. Record what it filed (drill MA3b2b: GR-FFL 48 ghosts — `retype wall (24)` first — 01-FFL 40, MA0 Roof 1). The review window it opens is R-1's.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| B-1 — the machine credential never makes a decline that carries (C1); the read, the counts and the row, on the bridge alone | From `WebApp`: `node <scratchpad>/ma3b3/b1.mjs` | `A filed 201 carry null reviews 0`; `A reported 200 partially_applied reported_role service`; `B filed 201 carry {"carried":0,"no_reason":1,"creates":0,"unverified":1}`; `B W 1 review null · B W 2 review null · B W 3 review null`; `B ledger 200` and the one `changeset_proposed` row of B holds `"carried":0`, `"carried_from":[]`, `"not_carried":{"no_reason":1,"creates":0,"unverified":1}`; `B withdrawn 200 withdrawn`. **Fails, named:** a `review` on W 1 — the machine credential made a binding decline (C1 is broken: stop, do not merge) | The script's lines (accounts masked by the script); the ledger row's id |
| R-1 — a decline with a reason, and one without | In the review window Promote opened on GR-FFL (Revit in front): in the first group (`retype wall`), untick **two** rows and put `drill MA3b3: these two stay as modelled` in the group's reason box (the founder types it, or UIA `ValuePattern.SetValue`); in another group (or, if the storey has one group only, nowhere), untick **one** row and leave that group's reason box empty. Press **Apply … ticked in Revit**; at the DD IDS dialog, **Place anyway**. Read the window when the report has landed. Note the three unticked rows' names. Close the window. Then, so Promote may run again: `b4101 GET "changesets/ma3b3?status=proposed"` (ids and names only) and `b4101 POST changesets/ma3b3/<id>/withdraw '{"actor":"drill-ma3b3"}'` for 01-FFL and MA0 Roof (a withdrawal decides nothing: neither is carried) | The window says the report landed (`reported (ledger #<n>)`) and `2 decline reason(s) recorded with it.` `b4101 GET changesets/ma3b3/<GR-FFL id>`: `partially_applied`, `result.reasons` 2 entries, and `result.reported_role` is the signed-in account's role on `ma3b3` (`lead`, from the set-up's membership) — **if it reads `service`, Revit was not signed in: nothing will be carried (C1); sign in (the founder's) and run the drill again from "Promote once" on a fresh scratch copy**; the two withdrawals answer 200. If the storey had one group only, no row was unticked without a reason: say so in the record (C9) | The window's last words; `<n>`; `reported_role`; the unticked rows' names, and whether one was unticked with no reason; the withdrawals' statuses |
| R-2 — the next Promote run files them carried | Count the project's changesets first: `b4101 GET changesets/ma3b3` (the number only — C4). Sentinel ▸ Promote (DD) → **Yes** (Revit in front) and **time the wait** from **Yes** to the review window, in seconds (C4). In the review window it opens on GR-FFL, read: the header lines above the rows, the two carried rows (their tick, whether it can be clicked, their line), the row that was unticked with no reason (if R-1 had one), the group header. Try to tick one carried row. Close the window with × (nothing is applied or declined). Run Review AI Proposals and read the picker's GR-FFL line; close the picker | The storey holds the ghosts R-1 rejected (and whatever else Promote plans). The two carried rows are **unticked and cannot be ticked**, each reading `declined in Revit by <account> (lead) in "Promote (DD) · GR-FFL", carried here by the bridge: drill MA3b3: these two stay as modelled · a lead may re-open it on the web desk`. The header: `⚠ 2 ghost(s) declined (2 carried here by the bridge from an earlier changeset) — … (a lead re-opens one on the web desk while its changeset is still proposed). … A decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason).` The group header ends `· 2 declined (2 carried)`; the picker's line ends `· 2 declined (2 carried)`. `b4101 GET "cde/ma3b3/audit?entity_type=changeset&action_prefix=changeset_proposed&limit=3"`: GR-FFL's new row holds `"carried":2`. **Only if R-1 unticked a row with no reason (C9):** the window also says `1 ghost(s) here were rejected in Revit before with no reason of their own — proposed again, undecided: … A reason in the group's box makes a decline carry.`, that row is tickable (pre-ticked as Promote's own rule says), and the row holds `"not_carried":{"no_reason":1,…}`; if R-1 had none, that part is recorded **owed**, not failed. **Fails, each named:** a carried row that is ticked or can be ticked (the lock); a row that says `declined on the web by` (the add-in in Revit is not the branch's — check the DLL's sha256); no carried row and the window says `2 ghost(s) here were rejected in Revit before with a reason, by a caller the bridge did not know as a signed-in member …` (R-1's report was the machine credential's: Revit was not signed in — C1 working, the drill's set-up wrong); no carried row and no such line (the test bridge is not on the branch's code — restart `bridge-test`) | The seconds from **Yes** to the window and the number of changesets the project held (C4); the header's lines and the two rows' lines as text (accounts as `<account>`); the group header; the picker line; the row's id |
| W-1 — the desk says it, and a lead re-opens it | On `http://localhost:4002`, signed in (a lead on `ma3b3`), project `ma3b3`, the **Review** tab. Read the desk (the masked page script). On the first carried ghost: type `drill MA3b3 W-1: retype it after all` in the reason box and press **Re-open** | Under GR-FFL, the two carried ghosts read `declined in Revit by <account> (lead) in "Promote (DD) · GR-FFL", carried here by the bridge: drill MA3b3: these two stay as modelled — binds: Revit shows it unticked and refuses the tick`, their ticks disabled, a **Re-open** button on each; the ghost R-1 unticked with no reason (if it had one) reads `waiting — nobody decided on the web`. The intro says `… a decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason); a lead re-opens it here while its changeset is still proposed.` After Re-open: `Re-opened · ledger #<m> — Revit may tick it again.` and the ghost reads `re-opened by <account> (lead): drill MA3b3 W-1: retype it after all`. If the founder is not signed in or not a lead there, the desk says so in words and the row is **owed**, not failed | The three ghosts' lines (as `<account>`); `<m>`. **No screenshot** |
| R-3 — Revit obeys the re-open, and still refuses the other | Review AI Proposals ▸ GR-FFL ▸ **Review** (Revit in front). Read the two rows. Tick the re-opened one if it is not ticked; leave the still-carried one; press **Apply … ticked in Revit**; at the DD IDS dialog, **Place anyway**. Read the window. `b4101 GET changesets/ma3b3/<the new GR-FFL id>` (status, `result.declined_on_web`) | The re-opened row reads `re-opened on the web by <account> (lead): drill MA3b3 W-1: retype it after all` and can be ticked; the other is still locked with its carried line; the header now says `1 ghost(s) declined (1 carried here by the bridge from an earlier changeset)`. After Apply: the report lands (`reported (ledger #<k>)`), no 409. GET: `partially_applied` (the carried ghost is rejected), `result.declined_on_web` one entry with `"carried_from":{…"origin":"revit"…}` | The two rows' lines; the window's last words; `<k>`; the status |

The rows run in the order B-1, R-1, R-2, W-1, R-3. If Promote filed other names or counts than drill MA3b2b's, the rows use what it filed and the record says so.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA3b3 — a decline carried forward, live (<date> ~hh:mm → hh:mm local, branch feature/ma3b3-carried-decline <sha>, Claude driving Revit 2024, the founder on the desk)`: the Setup paragraph (the test bridge on 4101 on the branch's code; the deploy on the founder's OK with the DLL sha before and after; settings at 127.0.0.1:4101; the scratch office and projects, the membership as a lead, the sign-in state, the scratch copy, not saved; the desk on 4002), the table `| Row | Result | Evidence |` with **pass**/fail/owed and the words quoted (never an address), plus ledger `#n`; then F-MA3b3-n findings each fixed on the branch ("fix(drill MA3b3): …" with its check) and their shas, and the **owed** rows at its end.

**Closing list:**
- close Revit without saving the scratch copy;
- stop `ma3b3-desk` and `bridge-test`; remove the `ma3b3-desk` entry from `.claude/launch.json` (`bridge-test` stays as it was); the founder's 4100 bridge and the `web-dev` preview are not touched;
- restore the add-in's bridge settings: copy `bcf-config.json.ma3b3bak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed — **a deploy too: only under the founder's same explicit OK**: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, and record the deployed DLL's sha256 beside the hash recorded before. Without that OK, say so: the branch's add-in stays until the merge's deploy — safe: it differs from master's only in this slice's words;
- list what the drill left on the shared ledger — the scratch office `ma3b3-office` (four artefacts), the projects `ma3b3` and `ma3b3-b1`, the membership, the changesets (B-1's A reported and B withdrawn; GR-FFL reported twice, 01-FFL and MA0 Roof withdrawn, and whatever R-2's run filed for them — withdrawn too, by `b4101 … /withdraw`) and their rows — left in place on purpose (scratch keys);
- list what the drill left on this PC outside the repository: `%AppData%\Sentinel\unreported\ma3b3\` (deleted with its files, if any), `%AppData%\Sentinel\cache\ma3b3*` (deleted: scratch keys only), the scratch copy in `Documents\Sentinel drills\ma3b3\` (kept, named, as evidence; never committed), `<scratchpad>/ma3b3/` (`b1.mjs`; not the repository).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record — **B-1 is never owed at the merge** (it needs no deploy: it proves on a running bridge the read of the earlier changesets, the counts, the filing's row, the stored `reported_role`, and that the machine credential's reason is not carried — C1); R-1, R-2, R-3 and W-1 may be owed only because the founder gave no deploy OK — then the merge message says **the carry itself** (a member's decline in Revit stamped on the next filing), Revit's words and the desk's are **built and proven offline only, not live** (C1: no script can make a decline that carries);
- each F-MA3b3-n fix is committed on the branch with its check, and Task 5 Step 2's checks were run again after the last fix;
- a fix that changes what the bridge, Revit or the desk does was run again live before the merge; a row whose fix was not run again is **owed**, not passed.

**The design doc says what the drill proved**, committed on the branch before the merge: replace ``BUILT on `feature/ma3b3-carried-decline` (MA-3b3), drill MA3b3 pending`` with `LANDED in MA-3b3 (merge <date>), drill MA3b3: <passed rows; owed rows>` — `git commit -m "docs: MA-3b3 - drill MA3b3's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma3b3-carried-decline -F - <<'EOF'
Merge feature/ma3b3-carried-decline: MA-3b3 - a decline carried forward (founder decision A: the bridge stamps it at filing): a ghost that proposes the same change (the element, the op, and the type, the levels or the parameter and value it sets) as one declined before on the project - a web decline still standing, or a row rejected in Revit with a reason for it that a signed-in member reported (a result stores the reporter's role as the bridge read it; the machine credential's reason is never a decline) - is filed already declined, with the decline's words, who made it and the changeset it came from; the newest decision stands, by when it was made (applied since or re-opened: not carried); a rejection with no reason of its own, a reason no signed-in member reported and a create are not carried, and that is counted on the changeset, on the filing's changeset_proposed row and in Revit's window; a failed read of the earlier changesets refuses the filing (503), and the store's list reads in pages; a result applying a carried ghost is the 409, with or without a review_rev, naming its origin; Revit and the web desk show it unticked and locked with its origin, and a lead re-opens it on the desk while its changeset is still proposed (web 1.0.43, the publish is the founder's). The Revit "ticked" lock (MA-3a F2 C) is not built: Next, with the reason. Drill MA3b3: <the result and the owed rows>. 26 checks, vitest <n>, builds 2022-2027 0 errors. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order:**
1. **The bridge — the founder's restart of the 4100 bridge on master** (bridge files changed: `changesets-logic.mjs`, `changesets-store.mjs`, `cde-store.mjs`). Until then nothing is carried: a filing is stored as before. **A result reported before the restart holds no `reported_role`, so its reasons are never carried** (C1; counted `unverified` and said) — every decline made in Revit before this deployment, the earlier drills' included, stays where it is; web declines carry from the first filing. After a bridge restart the public relay needs the founder's Funnel toggle (as after every restart). No migration.
2. **The add-in**, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same for each other Revit version the founder uses. An add-in from before this slice on the new bridge is **safe**: a carried ghost opens unticked and locked (the state is what it reads); only its words are wrong for a Revit-origin decline (`declined on the web by <account>`), and its header still says a declined ghost is proposed again undecided. The new add-in on the old bridge says "A decline is carried" before the bridge does it — so the bridge goes first.
3. **The web app — the founder's publish** (`npm run publish` from `WebApp`, version 1.0.43). Until then the published desk (1.0.42) shows a carried Revit decline as `declined by <account> (<role>): …`, without its origin, and keeps the old intro; the lock and Re-open work.

## UNSURE facts this drill settles

1. Whether the database takes the `changeset_proposed` row with its three new fields (the bridge's `audit` takes any `new_value`; a constraint on the ledger table was not read) — B-1's `B ledger` line.
2. Whether `GET /cde/:key/audit` with `entity_id=<a changeset id>` and `action_prefix=changeset_proposed` answers the machine credential as it does for `changeset_applied` (MA3b2b used that form) — B-1.
3. Whether Promote, run again after R-1, plans the three rejected walls again with the **same** `place.TypeName` (the key needs it; the planner is deterministic on an unchanged wall — not proven on a model where the other 45 ghosts were just applied) — R-2. If a row comes back with another type it is not carried, and the record says which.
4. Whether a group's reason reaches both unticked rows of R-1 (`result.reasons` 2 entries) — R-1's GET.
5. What `reported_by` and `reported_role` hold for a signed-in Revit (the account, per H4, and its role on the project: `reportResult`'s `d.myRole(key)` under the user's token the add-in sends) — R-1's GET, and the carried row's `<account> (lead)` in R-2.
6. Whether the read of the project's changesets answers a signed-in contributor at filing (`docList` under the user's token; the picker's list is the same read and has answered since MA-3a) — R-2: the carried rows are there only if it did; a refusal is the 503, in Promote's "not filed" words.
7. How long Promote's filing waits now (C4) — R-2's seconds and count.

(Review C3 removed the earlier item 5 — "whether `docList` answers every changeset in one read": the read pages now and a vitest case holds it. Not read: the database's `max-rows` setting — Risks.)

## Risks (each a ceiling stated in words)

- **A decline with no reason is not carried** (F2 A): a reviewer who unticks rows and types no reason sees them proposed again, pre-ticked as before. Said in the window, with what to do. Carrying them needs Revit to send which rows a person unticked (Next).
- **A Decline all whose only words are the note is not carried** (same shape as a rolled-back Apply). A reason in a group's box is. Said by the same line on the next run.
- **A storey whose every ghost is carried is filed again on every Promote run** (F8 A) and must be declined again in Revit (Decline all needs a note), or re-opened by a lead. Promote opens a pending Promote changeset before it plans, so such a storey stands in the way until it is reported. Next: Promote does not file it.
- **One whole-store read per filing, on Revit's thread** (E7, C4): Promote files one changeset per storey part and waits for each (`GetResult`; MA-3b4), and each filing now downloads every changeset document the project ever held, in full — a UI-thread wait this slice lengthens, growing with the project's history. Measured once, small, in R-2. If it is felt: Next's index of declines moves up.
- **The paged read ends at a short page** (C3): a database whose `max-rows` was set below 1000 would cut the first page, and the cut drops the newest changesets (the re-opens and the applies) — a stale carry. Supabase's default is 1000; this project's setting was not read. The fix then is the exact count (`sb`'s `count`).
- **A decline landing between the read and the insert is not carried to that filing** (C11): a web decline or a Revit report that lands after `proposeChangeset` read the store and before it inserted the changeset is missed by it; the next filing carries it.
- **A carried decline can be re-opened only while its changeset is proposed** (C5): once Revit has reported the changeset, the lead waits for the next Promote filing, re-opens there, and the reviewer applies in Revit. With F8 that is one more round. Said in the header and on the desk.
- **A group's reason reaches rows the reviewer never touched** (C10): it goes to every unticked, enabled row of the group — one that opened unticked too — and each is then carried as that person's decline. MA-3b2's rule, now with a longer reach; the reason box's tooltip says the reason is carried.
- **A decline made in Revit while signed out is not carried** (C1): the report is the machine credential's. Said on the next filing ("by a caller the bridge did not know as a signed-in member"); so is every Revit decline from before this deployment.
- **An add-in from before MA-3a that applies a carried ghost** (F9 A): it shows no review, ticks the ghost, changes the model, and its report (no `review_rev`) is refused with the 409 — the model and the ledger then disagree until a person reports again from a current add-in. Every add-in deployed since MA-3a sends `review_rev` and locks the row.
- **A read that fails refuses the filing** (F4 A): a Promote run on a flaky connection files fewer storeys and says which; the next run files the rest.
- **The carried "by" is another person's account on screen** in Revit and on the desk — it is already on the earlier changeset and its ledger row. Not new data; a new place.
- **Type names are compared as stored, apart from case** (S2, C13): a type renamed in the office's catalogue between two runs is another proposal — not carried; correct, and it may surprise.
- **A wall deleted and modelled again has a new UniqueId**: its earlier decline is not carried.
- **A decline is carried across sources**: a ghost an MCP agent proposes is filed declined when Promote's same change was declined, and the other way round — intended (the decision is about the change, not the proposer).
- **Two filings at the same moment** read the store before either is inserted: neither sees the other; both are stamped from the same earlier declines. No decline is lost.
- **`LateDeclines` (Revit) never names a carried decline** since C6: a result that applies one is refused, never recorded as late or unchecked.
- **An add-in or a published desk from before this slice** shows a carried decline locked, with words that miss its origin (Merge ▸ Deployment).
- **A decline landing inside Apply's seconds** is still applied and recorded as late (MA-3a F2 A); the "ticked" lock that would close it is not built (F6).

## Not settled (for the founder or the reviewer)

- **F2** — whether a Revit rejection with no reason should carry after all (the brief's words). The plan builds A and says why; B is one line in `carryDeclines` (drop the `why(g) != null` condition) and would also carry rolled-back Applies and elements Revit removed.
- **F7** — the OK for the deploy and the put-back. Without it the carry itself is proven offline only (C1).
- **F9** — whether a result with no `review_rev` that applies a carried ghost is refused (A, built) or recorded as unchecked (B: MA-3a C2 kept for add-ins from before MA-3a — and the apply then clears the decline).
- **The database's `max-rows`** — not read (C3's ceiling).
- **Promote's behaviour with a pending Promote changeset before it plans** — the plan relies on MA-3b2b's drill (Promote opens the pending one); the critic did not re-read it, nor did the amender.
- **F8** — whether a fully carried storey should be filed at all.
- **The brief's base total** (`promote-check 695/695`) is stale: the measured base is `769/769`.
- **Whether a withdrawn changeset's standing web decline should carry** — the plan carries it (a person decided on the change; the withdrawal was of the changeset). A reviewer may want it dropped.

## Next (out of scope here)

- **The Revit "ticked" lock** (MA-3a F2 C / S4): new bridge state per ghost, a lock and an unlock route, the desk refusing a decline on a locked ghost, an expiry for a Revit that crashed, web rows in its drill — for the seconds between Apply's re-check and the report, a gap already recorded (`applied_over_late_decline`) and said. Also the duplicate across two PCs (MA-3b's "Records are per PC"). Build when a late decline is seen in real use. Size M.
- **A Revit decline with no reason carried** (F2 C): the result gains `unticked: [guid]` — the rows a person unticked, apart from elements Revit removed and a rolled-back Apply — stored by the bridge beside `rejected`; `carryDeclines` then carries them with the words "no reason given in Revit". Add-in (`ResultOf`, `UnreportedResults.Record`), bridge validator, fixture. Size S–M.
- **Promote does not file a storey whose every ghost is carried**, and **Promote's "File n changeset(s)?" dialog says how many will be carried**: the add-in reads the project's declines before filing (a second place for the rule, or a bridge "preview" route). Size M.
- **A declined create carried**: a create names no element; it would need a geometric match — a guess today. With MA-3c's ghost overlay, perhaps.
- **`listChangesets` with `status` and `limit`, or an index of declines**: when one whole-store read per filing proves heavy (also MA-3b2b's desk read). Size S.
- **The ledger panel names a carried decline's origin**: words only; when seen.
- **A Revit decline made while signed out, carried**: it would need the add-in to prove who is at the PC without a session — not planned; sign in.
- **`WebApp/package-lock.json`'s own version** (`1.0.30`): `npm install --package-lock-only`, its own commit.
- **MA-3b4 — nothing in modelling waits**: a waiting result sent by itself on `DocumentOpened`; Ghost Builder writes the same record before its report and stops waiting; Promote's reads (`Commands.PromoteWalls.cs:49`, `:61`) and its filing (`:191`) off the thread.
- **MA-3c — the ghost overlay** and **MA-3d — web highlights and the proposal model**: as in the MA-3a plan's Next.
- Owed rows carried: MA3b2b's (a report opened on the desk and Refresh live, the picker's closed-window gap); MA3b2's Show on a create and on a type edit, and the tab refusal; MA3b's R-5; Revit 2025–2027 for the review (MA-3a … MA-3b3); MA3a's D-4 second account and a late decline applied over; and from MA2e — Revit 2025–2027 for Annotate, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy.
