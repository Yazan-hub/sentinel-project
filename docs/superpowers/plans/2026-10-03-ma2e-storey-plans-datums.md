# MA-2e — a floor plan and an RCP for each story level, named by the View rule, and the story levels and grids pinned Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fifth and last slice of MA-2 — audit rows DAT-3, ANV-1 and ANV-2 — in Annotate (Sentinel ▸ 3 · Annotate Views), and the drill MA2e:
- **ANV-1 — names from the View rule.** A guideline view entry may carry `tokens` (`{"DISC": "ARC", "LEVEL": "{level}", "TYPE": "PLAN", "DESC": "GA"}`): the name is the project's View rule's tokens in the rule's order, each value from the entry, `{level}` the level's name verbatim, each value judged by its token's definition. An entry without `tokens` keeps today's `WIP_<namePrefix>_<LEVEL>`. Every name is judged as Scan Now judges it (the ruleset Scan Now already holds for the document, `RuleRegex`) **before** anything is created, and a row is refused with its reason — a token missing, a value or the level's name failing its definition, the name failing the rule, a character Revit refuses, the same name as an earlier row, the name already in the model. A created view then raises no View naming violation and no change request (closes F44).
- **ANV-2 — a preview, story levels first, one view's failure alone.** One window lists levels × the guideline's FloorPlan and CeilingPlan entries with each row's name, template status and refusal; a story level × the guideline's first FloorPlan entry and first CeilingPlan entry are pre-ticked, everything else is listed unticked (a person decides). Each view is created in its own `SubTransaction`: one that throws is rolled back alone, named in the result, and the rest are created. The view type is the model's default (no longer the first one found); a view the Project Browser parameters could not route is counted.
- **DAT-3 — the story levels and grids pinned.** The same window lists every unpinned level and grid; story levels and grids are pre-ticked, a level that is not a Building Story is listed unticked, one another user owns or one changed in central is listed unticked with the reason (review C7). After the commit Sentinel reads `Pinned` back from the model and says `Pinned now: x/y story level(s), p/q other level(s), a/b grid(s) … links are not checked` (review C6) — the substitute for MH-LNK-01, which is not in code. `LEVEL_IS_BUILDING_STORY` is read, never set (DAT-2).
- **One Sentinel action, B31 said.** Annotate's writes run in one `SentinelUndo.Run(doc, "Annotate views", …)` (XC-2). Revit may empty its Undo list once views are named (B31): in every model the preview and the result say that the annotate ledger row is then the record (spec amendment S1, review C3). Whether the group was kept or not, the model is read back (review C2), and the ledger row names the views and datums it holds, what was refused, failed and unrouted, whether Revit kept the Undo group, and which guideline and ruleset planned and named the views (review C4). With the ruleset not loaded yet, Annotate refuses before it plans (review C1).
- **The TS twin retired.** `planViews` in `WebApp/src/sentinel-core/guideline.ts` has no caller; it and its test go (founder decision F5); the bridge bundle is rebuilt.
- **Drill MA2e** — short: Revit 2024, scratch copies of the B35 seed, the test bridge on `127.0.0.1:4101`; rows V-1, V-1R, U-1, V-2, V-3 (AST-1 and WS-1 retired by review C10 and C3).

**Source of truth:** `docs/strategy/2026-09-30-revit-addin-audit.md` — DAT-3 (`:889`), ANV-1 (`:982`), ANV-2 (`:983`), Annotate's findings (`:961-970`); `docs/strategy/2026-09-30-model-automation-design.md` — §2.1 rule 5 and its B31 exception (`:168`), the MA-2 row (`:283`), op 1 (`:322`), MA-2 delivers (`:1089`), the B31 risk row (`:1355`); the MA-2d plan's Next (`docs/superpowers/plans/2026-10-03-ma2d-storey-undo-plans.md:1392`); blueprint MH-LNK-01 (`docs/strategy/2026-09-29-sentinel-blueprint.md:452`) and R-07 (`:785`); `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` — F44 (`:127`), B31's Undo finding (`:892`, `:904`, `:934`). Base: master `5e249da`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight, as the founder asks):** Annotate only — no new command, no Datum write (Datum's result names Annotate as the next step), no bridge route, no web change, no migration. Left to Next: `token_aliases` as a LEVEL source, ANV-3 (copy missing templates), ANV-4 (sheets), ANV-5 (tags), DAT-1, DAT-2 (the Building Story flag), links and a real MH-LNK-01 rule, Datum pinning at creation, a TS view planner.

**Architecture:**

*The plan, pure.* `SentinelAddin/GhostBuilder/ViewPlanner.cs` is rewritten (no Revit types; `tools/annotate-check` drives it). `Plan(views, naming, levels, ruleset, existing)` takes the levels as `(Name, IsStory)` lowest first (the command maps `ChangesetExecutor.Stories(doc)`, the one projection), the ruleset Scan Now holds for the document and the names already in the model, and returns one `PlannedView` per level × plannable entry with `PreTicked` and `Refusal`. The name check is Scan Now's (`RuleEngineHost.CheckName`): an excluded or whitelisted name passes, a whitelist-only rule passes nothing else, else `RuleRegex.Matches`, for every View rule with tokens or a whitelist; a rule that needs the office code with `ruleset.org` empty refuses the row in words (review C5). `Pins(datums)` gives the pin rows from `DatumFact`s; `RuleLine`, `PinnedLine` and `UndoWords` are the preview's and the result's words. `GuidelineViewStandard` gains `Tokens` (`tokens`); the bridge stores a guideline's view entries as they are (`artefact-store.mjs:189-190` checks only that `views` is an array), so no bridge change.

*The command.* `SentinelAddin/Commands.Annotate.cs` reads the guideline (off-thread, as today), the levels (`ChangesetExecutor.Stories`), the cached ruleset (`App.Engine.RulesetFor` / `SourceFor` — no network call; refused while `App.Engine.Has(doc)` is false, review C1), the views and templates, the model's default plan and ceiling plan view types, and every level and grid (pinned, owner); shows `AnnotatePreviewWindow` (new, `SentinelAddin/UI/`, ViewPickWindow's code-only idiom); writes the ticked rows inside `SentinelUndo.Run(doc, "Annotate views", …)` — one `Transaction`, one `SubTransaction` per view, then the pins; reads the views and `Pinned` back, kept or not (review C2); posts one `annotate` row (`CommandReports.Annotate`, new fields; the bridge's `recordRevitReport` checks only the action's length and the value's size) and shows the result.

**Tech stack:** the Revit add-in in C# (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF built in code); the offline C# console checks `tools/annotate-check` and `tools/promote-check`; TypeScript and vitest in `WebApp/` for the retirement only (`npm run build:bridge-core` rebuilds `WebApp/bridge/sentinel-core.mjs`).

## Global Constraints

- Branch `feature/ma2e-storey-plans` from master `5e249da` (it holds this plan); merge `--no-ff` only after every task's checks pass **and the live drill MA2e is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **One Sentinel action, one Undo group (XC-2).** Annotate's writes — every view and every pin — run inside ONE `SentinelUndo.Run(doc, "Annotate views", …)`, in ONE `Transaction`; nothing is written outside it. B31's exception is said in words, never silent (S1).
  - **A person decides.** Nothing is written before the preview's **Create**; Cancel writes nothing. Only rows the person leaves ticked are created or pinned; a refused row cannot be ticked.
  - **Sentinel never picks a name by guess.** A token is filled only from the guideline's view entry, `{level}` by the level's name verbatim; a value that fails its token's definition is refused by name — never mapped (`token_aliases` is Next). A name that Scan Now's View rule would flag is never created.
  - **Claimed vs verified.** What is pinned is read back from the model after the commit (`Pinned now: …`); the counts in the result and the ledger row are what Revit kept, never what was ticked.
  - **No network call on Revit's API thread.** The guideline stays `Task.Run(() => GhostStandards.Load(…))`; the ruleset is the engine's cached copy (no call); `GovernedNotify.Report` stays fire-and-forget.
  - **The bridge is unchanged.** It already stores a view entry's extra field and an `annotate` row's extra fields.
  - **`LEVEL_IS_BUILDING_STORY` is never written** (DAT-2): Annotate reads it through `ChangesetExecutor.Stories`.
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s. C# `latest` (tuples, `is string s`, `using var`) is in use already.
- Checks: `dotnet run --project tools/annotate-check` and `dotnet run --project tools/promote-check` from the repo root. Task 3 runs vitest on `src/sentinel-core` only; if anyone runs the full vitest suite, it rewrites `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with LF only: `git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json` when its content is unchanged.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by a source scan and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100.
- The community Revit MCP never writes. Only in the drill, and only its read-only calls: `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`, `get_available_family_types` — never while a Revit command, a TaskDialog or a Sentinel window is open.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are master `5e249da`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs.

**Dry run (planner, 2026-10-03; its totals are before the review — the amender's run, last in this list, gives the totals the steps now carry).** Every code step of Tasks 1 and 2 was applied in order to a detached worktree of `feature/ma2e-storey-plans` at master `5e249da` in the session's scratchpad — never in the repository — by a script that reads this document's `Create` and replace blocks as an implementer reads them (each replace matched its text exactly once, in the file's own line endings). Before each task's code its Step 1 was applied and its "see it fail" run made; after the code, its "see it pass" run. The totals in the steps are that run's; the worktree was removed afterwards.
- Master's own totals, measured first: `annotate-check` `ALL PASS` (16 checks; it printed no total before this plan); `promote-check` `677/677`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`; `vitest run src/sentinel-core` `31 passed (31)` files, `279 passed (279)` tests.
- Task 1: `annotate-check` fails to compile (`CS1501: No overload for method 'Plan' takes 5 arguments`, `CS1061: 'PlannedView' does not contain a definition for 'PreTicked'`); then `40/40 checks pass`, `ALL PASS`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`. Two fixes went into this plan from that run, before the totals above: the check `a level that is not a Building Story …` had demanded no refusal on Roof, where the second PP entry is (rightly) a duplicate; and `RuleModels.cs`'s `string?` raised eight `CS8632` warnings in a project with `Nullable` `disable` — the csproj now says `annotations`.
- Task 2: `annotate-check` `41/48` (7 FAIL — every new scan but F4's, which the interim call of Task 1 already satisfies); `promote-check` fails to compile (`CS1501: No overload for method 'Annotate' takes 12 arguments`); then `annotate-check` `48/48`, `ALL PASS`, `promote-check` `677/677`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `1 Warning(s)` — the warnings on Revit 2026 vary with the build's state (master: `3` after a fresh build, `0` after a `--no-incremental` one); the rule is **no warning in a file MA-2e touches** — the dry run's full rebuild listed only master's: on 2024 `ChangesetExecutor.cs` and `Commands.GhostBuilder.cs` CS0618, `Commands.BcfIssues.cs` CS4014, `RuleRegex.cs` CS8602 ×2; on 2026 `Commands.BcfIssues.cs` CS4014. One fix went into this plan from that run: the first pass gave `promote-check` `676/677`, because its scan at `Reports.cs:128` pinned the old command's `if (t.Commit() != TransactionStatus.Committed)`; Step 1 now replaces it with the kept-group scan.
- After the fixes, the worktree was reset and Tasks 1–2 applied again from this document's final text: the same totals (`40/40`; `41/48` and `CS1501`; `48/48`, `677/677`; both builds `0 Error(s)`).
- Tasks 3 and 4: each replace's text was found exactly once in its file (read only, not applied); their expected totals are computed from master's (279 − the 4 tests of `view-plan.test.ts`). Not run: every line of the drill section, which only Revit can run, and the commit commands. Nothing on any branch of the repository was changed by the dry run; only this plan is committed.
- **Amender's dry run (2026-10-03, after review amendments C1–C11).** A detached worktree of master `5e249da` in the session's scratchpad (`scratchpad/ma2e/wt`, removed afterwards; never the repository), the same reading script, each task's Step 1 then its "see it fail" run, then its code and its "see it pass" run, all from this document's amended text. Task 1: `CS1501` / `CS1061` / `CS0117` → `44/44`, `ALL PASS`, `annotate-check` builds with `0 Warning(s)`; builds 2024 `0 Error(s)` `5 Warning(s)`, 2026 `0 Error(s)` `3 Warning(s)` (two are master's `CS8600` in `Commands.Annotate.cs`'s old lines). Task 2: `44/53` (`9 FAILED`) and `promote-check` `CS1501 … takes 16 arguments` → `53/53`, `ALL PASS`, `promote-check` `678/678`; builds 2022–2027 `0 Error(s)`, no warning in an MA-2e file (Task 4 Step 2 lists them). One fix went in from the first pass: the `Reports.cs` check's local `many` clashed with a later local of that name (`CS0128`) — it is `annotateMany`. Task 3 (run this time, `WebApp/node_modules` linked in): a rebuild before the task changed nothing (master's bundle is current); after it `src/sentinel-core` `30 passed (30)` / `275 passed (275)`, the bundle `0` added and `23` removed lines (all `PLANNABLE` / `planViews`), `grep -c planViews` `0`, `vitest run bridge` `89 passed (89)` files, `1812 passed | 1 skipped (1813)` tests; `ids-cases.json` was rewritten LF-only with no other change and restored. Task 4: Step 1's four replaces matched once each; Step 2 with Tasks 1–3 applied: all 26 check projects pass. The drill and the commits were not run.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | Where ANV-1's token values come from (nothing in the data says which token a guideline field fills: `viewNaming.structure` is documentation only and its tokens — STATUS, TYPE, LEVEL, DESCRIPTION — match neither ruleset; mapping `namePrefix` → TYPE would be a guess, and on aster "FP" fails TYPE `PLAN\|…`) | **A:** an optional `tokens` map on a guideline view entry, e.g. `{"DISC": "ARC", "LEVEL": "{level}", "TYPE": "PLAN", "DESC": "GA"}`; `{level}` is the level's name verbatim; each value must pass its token's definition and the whole name every View rule with tokens. **B:** map by token-name convention (a guess). **C:** A plus the ruleset's `token_aliases` for LEVEL ("L1 - Architectural" → "L01") | **A.** An entry without `tokens` keeps today's fixed name, still judged by the View rule (the BDS names pass as they are). A missing token is refused by name (`'GA Plan' gives no DISC — VN-01 needs it; add it to the entry's tokens`); a level that fails its definition is refused (`LEVEL 'L1 - Architectural' does not pass L\d{2}\|LRF\|XX (VN-01) — the level's name is used as it is: rename the level, or give the entry another LEVEL`). No View rule with tokens installed: fixed names are created and the preview says `View names not checked: …`; an entry with `tokens` is refused (nothing orders them). C is under Next |
| F2 | Which views per story (ANV-2's "story levels are pre-ticked") | **A:** one window; rows are levels × the guideline's plannable entries; pre-ticked: story levels × (the first FloorPlan entry, the first CeilingPlan entry); everything else listed unticked. **B:** only the two entries are listed | **A.** Annotate keeps the rest in the same window: no new command. On the BDS guideline: GA Plan and RCP pre-ticked; PP, BUA, QA, END listed; `Presentation Plan (no colour)` refused (`same name as 'Presentation Plan' on <level>`, K5) |
| F3 | Where pinning happens (DAT-3 is a Datum row) | **A:** Annotate's preview pins unpinned story levels and all grids, pre-ticked. **B:** Datum also pins what it creates | **A only** — one code path and one count. Datum's result names Annotate as the next step; DAT-3's acceptance holds after Datum → Annotate (spec amendment S2) |
| F4 | Which ruleset judges the names | **A:** the engine's cached ruleset for the document (`App.Engine.RulesetFor`, what Scan Now judges by). **B:** a fresh fetch | **A** — Scan Now's own rule, no network call. Still loading (`App.Engine.Has(doc)` false) → Annotate refuses, saying so — `Run Scan Now, then Annotate again. Nothing was created.`; it never treats "not loaded" as none (review C1). An installed none plans the fixed names and the preview says they are not checked |
| F5 | The TS twin `planViews` (no caller: exported and bundled, used by no route) | **A:** retire `planViews`, `PlannedView`, `PLANNABLE` and `view-plan.test.ts`; rebuild the bundle. **B:** port the token naming to TS with a shared fixture | **A.** The bridge never plans views; rule 2 (JSON contracts) returns if a web planner is ever built (Next). `GuidelineViewStandard` in TS gains `tokens?` so the type twin stays true |
| F6 | The view type a view is created with | **A:** the model's default (`GetDefaultElementTypeId(ElementTypeGroup.ViewTypeFloorPlan / ViewTypeCeilingPlan)`). **B:** the first `ViewFamilyType` of the family (today) | **A.** None → the row is refused by name (`this model has no default ceiling plan view type`) |
| F7 | A pin on a datum another user owns (a workshared model) | **A:** pre-check `WorksharingUtils.GetCheckoutStatus`; the row is listed unticked with the owner. **B:** rely on the commit | **A** — B would roll every view back with one owned grid (K9). A datum changed or deleted in central (`WorksharingUtils.GetModelUpdatesStatus` `UpdatedInCentral` / `DeletedInCentral`) is listed unticked too: `changed in central — reload latest, then pin it` (review C7). Ceiling: the owner can change between the preview and Create (Risks). Not provokable on the drill's detached copies: owed |
| ~~F8~~ | *Struck by review C3:* B31's words are said in every model, so no workshared row is needed to decide them; WS-1 is gone from the drill | — | — |

## Amendments to the spec's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (XC-2's exception, design `:168`: "Revit may empty the Undo list after view actions (B31). There the ledger row is the record, and the review window says so").** Annotate runs as one `SentinelUndo.Run(doc, "Annotate views", …)` — the views and the pins in one group: a flush empties the whole stack, so a separate group for the pins gains nothing (K8). **Amended by review C3 (no condition — the design states none, and "may" is true in every model):** in every model the preview and the result say `ViewPlanner.UndoWords()`: `Revit may empty its Undo list after views are named (B31) — if Edit ▸ Undo does not list "Sentinel: Annotate views", the annotate ledger row is the record: it names the views and datums to delete or unpin by hand.` The drill records a non-workshared model's Undo list (U-1, UNSURE 1) as a record, whatever it shows.
- **S2 (DAT-3: "Pin every level and grid created").** Annotate pins (F3 A): its preview lists every unpinned level and grid; story levels and grids are pre-ticked, a level that is not a Building Story is listed unticked. Datum does not pin; its result names Annotate as the next step. "Each new story level has one floor plan and one RCP" holds after Datum → Annotate.
- **S3 (DAT-3's acceptance "MH-LNK-01 reports 0 unpinned").** MH-LNK-01 is not in code. Its substitute is the result's read-back (review C6: every level, as MH-LNK-01 covers every `Level`): `Pinned now: x/y story level(s), p/q other level(s), a/b grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).` — passing when x = y and a = b; p/q is recorded, never hidden. Links (`RevitLinkInstance`, K7) are Next.
- **S4 (ANV-2: "Story levels are pre-ticked"; "Only story-level views are created").** Pre-ticked: a story level × the guideline's first FloorPlan entry and first CeilingPlan entry (F2). Only story-level views are created when the pre-ticks are applied; the person may tick others (K6: a person decides).
- **S5 (design `:322`: "story levels flagged").** Read, never set: `LEVEL_IS_BUILDING_STORY` is DAT-2's. A model with no story level gets nothing pre-ticked, and the preview says so.

## Review amendments (BINDING — from the plan's review, 2026-10-03; each is applied in the task text it changes, and that text matches it)

The review found no compile blocker; C1 critical, C2–C5 important, C6–C11 minor. None was rejected; where the text applied differs from the review's wording, the reason is given in the amendment.

- **C1 (critical) — "not loaded yet" is never read as no ruleset.** `RuleEngineHost.Entry` answers a document whose ruleset has not landed with `RulesetStore.None()`; read as none, Annotate would pre-tick fixed `WIP_` names that the View rule then flags (F44 back). Before `ViewPlanner.Plan`, `Commands.Annotate.cs` refuses: `if (App.Engine is not RuleEngineHost engine || !engine.Has(doc))` → `The project's ruleset has not loaded yet, so the view names cannot be judged by Scan Now's rule. Run Scan Now, then Annotate again. Nothing was created.` (`Result.Cancelled`). An installed none (`Has` true) keeps F4's `View names not checked` words. F4 amended. *Applied as a pattern variable* (`engine`), not `App.Engine.Has`, so the nullable `App.Engine` raises no CS8602; the annotate-check F4 scan asserts `!engine.Has(doc)` comes before `ViewPlanner.Plan(` and that `RulesetStore.None()` is gone from the command. UNSURE 5 is settled in code. Task 2 Step 1 and Step 3.
- **C2 (important) — read back, kept or not.** The `SentinelUndo.Run` call is wrapped in `try … catch (Autodesk.Revit.Exceptions.InvalidOperationException ex)`; after it, kept or not, the command reads `var present = …OfClass(typeof(ViewPlan))…` (the run's names, templates excluded) and the ticked pins' `Pinned`. Not kept and nothing present → `Nothing was created or pinned — <why>` + `Read back from the model: no view or pin of this run is in it — the model is as it was.` (`Result.Failed`). Not kept but something present → the result opens with `Revit committed the views but did not keep the Undo group (B31?): <n> view(s) and <m> pin(s) are in the model — the annotate ledger row is the record.`, the row is sent with `undo_group_kept = false`, `Result.Succeeded`. The result's and the row's counts are the read-back's. promote-check's kept-group scan asserts the catch and that the read-back comes before `if (!kept`. Task 2 Step 1 and Step 3.
- **C3 (important) — B31's words in every model.** `ViewPlanner.UndoWords()` takes no argument: `Revit may empty its Undo list after views are named (B31) — if Edit ▸ Undo does not list "Sentinel: Annotate views", the annotate ledger row is the record: it names the views and datums to delete or unpin by hand.` — said in the preview and the result (`CountOf(ann, "ViewPlanner.UndoWords()") == 2`). S1 amended; F8 and WS-1 struck; U-1's "F-MA2e-n: UndoWords ignores workshared" branch struck — U-1 is a record. UNSURE 1 becomes U-1's record; *UNSURE 7 (a workshared copy) cannot be a record of U-1, which is not workshared: it is owed with F7.* Tasks 1, 2, the drill.
- **C4 (important) — the row is a record that names things.** `CommandReports.Annotate(IReadOnlyList<string> views, int levels, int skippedExisting, int refused, int failed, int unrouted, int pinnedLevels, int pinnedGrids, int warnings, int storyLevels, IReadOnlyList<long> pinnedIds, string pinnedNow, bool undoGroupKept, string guideline, string ruleset, string actor)` — 16 arguments; `new_value` gains `views`, `pinned_ids`, `pinned_now`, `undo_group_kept`, all from the read-back (C2). *Applied with the file's own rule* ("a list holds at most N entries beside its true total"): `views_created` is the true total beside `views` (at most `CommandReports.MaxRecord` = 200, the review's number), so no `views_truncated` flag; `pinned_ids` is capped the same way. promote-check pins the body and the cap (678 checks). V-1's pass adds: `views` equals the dialog's created names, `pinned_now` equals its line. Task 2, the drill.
- **C5 (important) — Scan Now's `CheckName`, whole.** `ViewRules` keeps `Target == View && (Tokens.Count > 0 || Whitelist.Count > 0)`; the name is still built from the first rule with tokens. `Passes`: a rule with no tokens passes only a whitelisted (or excluded) name. `NameOf`: a rule that `RuleRegex.NeedsOrg` with `ruleset.org` empty refuses the row: `<id> needs an office code and ruleset.org is empty — the name cannot be judged; set the office code` (fails closed; Scan Now leaves such a rule unevaluated). `RuleLine`'s none words become `no View rule with tokens or a whitelist`. Three new annotate-check checks (a whitelist-only rule refuses an unlisted name; an excluded name passes although the pattern fails; an `{org}` rule with no org is refused in those words). Task 1.
- **C6 (minor) — the read-back counts every level.** `PinnedLine(storiesPinned, stories, otherLevelsPinned, otherLevels, gridsPinned, grids)` → `Pinned now: x/y story level(s), p/q other level(s), a/b grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).` S3 passes when x = y and a = b; p/q is recorded. S3, Tasks 1, 2, 4, the drill.
- **C7 (minor) — out-of-date datums.** A datum `WorksharingUtils.GetModelUpdatesStatus` reports `UpdatedInCentral` or `DeletedInCentral` is listed unticked: `changed in central — reload latest, then pin it`. *Applied as its own field* `DatumFact.ChangedInCentral`, not by overloading `OwnedBy` (whose words read `owned by <user>`); the F7 check covers it. Owed in the drill: "F7, owned or out-of-date datums: not provokable on a detached copy". Tasks 1, 2, the drill.
- **C8 (minor) — every Revit version builds.** Task 4 Step 2 builds `-p:RevitVersion=2022` through `2027`, each `-p:DeployToRevit=false`, each `0 Error(s)` and no warning in an MA-2e file (the amender's dry run: so).
- **C9 (minor) — the rebuilt bundle drops only `planViews`.** Task 3 Step 3: `git diff --numstat bridge/sentinel-core.mjs` shows 0 added lines and every removed line in the `PLANNABLE` / `planViews` region; else restore the bundle and keep only `tokens?`. The amender's dry run: master's bundle is current; `0	23`.
- **C10 (minor) — AST-1 retired.** An annotate-check scan: `ViewPlanner.NothingToPlan(` comes before `new AnnotatePreviewWindow(` (with the three `NothingToPlan` checks). The drill is V-1, V-1R, U-1, V-2, V-3. Task 2 Step 1, the drill.
- **C11 (minor) — four smaller points.** (a) Task 1's commit message says the command's call is interim, superseded by Task 2. (b) The row's action says `across N level(s)`, N the distinct levels of the views created (the `levels` argument); `story_levels` stays a field. (c) The F6 scan asserts `!ann.Contains("OfClass(typeof(ViewFamilyType))")`. (d) An entry naming a token the first View rule lacks is refused: `'GA Plan' gives DISCIPLINE, which VN-01 does not have (its tokens: DISC, LEVEL, TYPE, DESC)` — one check. Tasks 1, 2.

- **C12 (important, the code review) — a guard's scan pins its return.** The scans for Cancel (`if (pick.ShowDialog() != true) return Result.Cancelled;`), the no-guideline refusal (`TaskDialog.Show(Title, nothing);` then `return Result.Cancelled;`) and C1's "not loaded yet" refusal (`… Nothing was created.");` then `return Result.Cancelled;`) now hold the return, line breaks normalised; before, each passed with its return removed. Mutation-proven: each removal fails its scan (`52/53`).
- **C13 (important, the code review) — promote-check's C2 scan pins the read-back and its guard.** It now also requires `var present = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan))`, `pinnedNow` built from `doc.GetElement(…)` and `e.Pinned`, and `if (!kept && present.Count + pinnedNow.Count == 0)`. Mutation-proven: `var present = created.ToList();` or a bare `if (!kept)` fails it (`677/678`).
- **C14 (minor, the code review) — a whitelisted or excluded name is judged as Scan Now judges it.** `NameOf` refused a row whose token value failed its definition before the whole name was judged, so `ARC_Level 1` on VN-WT's whitelist was refused although `CheckName` passes it. The name is now built; a token's refusal stands only when the ordering rule neither excludes nor whitelists the name (`ViewPlanner.Admits`, which `Passes` uses too); its words are unchanged. One annotate-check check (`54/54`).
Totals after C1–C11: `annotate-check` 44 plan checks + 9 wiring scans = `53/53`; `promote-check` `678/678`.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The planner lists every row; a refused row is shown greyed with its reason and cannot be ticked | "Words are said, never silent": today the second PP entry is "skipped existing" in silence (K5) |
| E2 | The name check mirrors Scan Now's `CheckName` (exclusions, whitelist, a whitelist-only rule passing nothing else, then `RuleRegex.Matches`) for every View rule with tokens or a whitelist (review C5); the name is built from the first rule with tokens; a token the entry gives that this rule lacks is refused by name (review C11) | Scan Now's answer is ANV-1's acceptance. Ceiling: an office with two View rules of different token orders gets names from the first; the second may refuse them (said by row) |
| E3 | `NamingUtils.IsValidName` is Revit API, so the pure planner tests Revit's prohibited characters `\:{}[]\|;<>?`~` itself (annotate-check covers ':'), and the command asks Revit again per view inside its `SubTransaction` | Two answers, the same list; a difference shows as a failed row in the result, never a silent one |
| E4 | One `SubTransaction` per view inside the one `Transaction`; a throw rolls back that view only. The pins have a try each, no sub-transaction (setting `Pinned` either changes the element or throws) | ANV-2's per-view try/catch without leaving the group |
| E5 | A duplicate name is checked across all rows (not per level): an entry whose tokens do not use `{level}` names every level alike, and the second row is refused | Never created twice, never thrown by `View.Name` |
| E6 | `PlannedView.TemplateInModel` is set by the command (a model fact); the planner stays model-free | The preview shows `template … not in this model — created without it` before Create |

## The scout's conflicts, settled (K1–K10)

K1 the View rule is `ruleset@n` VN-01 (not `naming@n`): read the engine's cached ruleset (F4). K2 token sources: F1 A. K3 DAT-3's views and pins land in Annotate: S2. K4 "flagged" vs "never set": S5; the drill records whether the B35 seed's levels read as Building Story (UNSURE 2). K5 the duplicate PP name: refused by name (E1). K6 a person decides: S4. K7 links: S3, Next. K8 B31, one group: S1 (said in every model, review C3). K9 owned datums: F7 A. K10 the ViewPlanner header's "CONFORMANCE REFERENCE": rewritten in Task 1; the TS twin retired in Task 3 (F5).

---

## File map

| File | Task | What it holds |
|---|---|---|
| `SentinelAddin/GhostBuilder/ViewPlanner.cs` (rewritten) | 1 | `PlannedView` (+ `IsStory`, `TemplateInModel`, `PreTicked`, `Refusal`), `DatumFact`, `PinRow`; `Plan`, `Pins`, `RuleLine`, `PinnedLine`, `UndoWords`, `NothingToPlan`, `Existing`, `Prohibited` |
| `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` | 1 | `GuidelineViewStandard.Tokens` |
| `tools/annotate-check/Check.cs` (rewritten), `annotate-check.csproj` | 1, 2 | The plan's checks (44); the wiring's source scans (9) |
| `SentinelAddin/Commands.Annotate.cs` | 1 (interim call), 2 (rewritten) | The ruleset-loaded refusal (C1), the preview, the one group, a `SubTransaction` per view, the pins, the read-back kept or not (C2), the row |
| `SentinelAddin/UI/AnnotatePreviewWindow.cs` (new) | 2 | The preview: views by level, the pins, the words |
| `SentinelAddin/Coordination/CommandReports.cs`, `tools/promote-check/Reports.cs` | 2 | `Annotate`'s new fields (the views and datums named, C4) and its pinned body; the read-back scan (C2) |
| `SentinelAddin/Commands.Datum.cs` | 2 | The result names Annotate as the next step (F3) |
| `WebApp/src/sentinel-core/guideline.ts`, `view-plan.test.ts` (deleted), `WebApp/bridge/sentinel-core.mjs` (rebuilt) | 3 | `planViews` retired; `tokens?` on the TS type |
| `docs/strategy/2026-09-30-model-automation-design.md`, `docs/strategy/2026-09-30-revit-addin-audit.md` | 4 | What was built, drill pending |

---

## Tasks (in order: the plan, pure; the command and its window; the TS twin retired; the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file (for a file that exists, it replaces the whole file). `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once.

### Task 1 — C#: Annotate's plan, pure (`ViewPlanner`)

**Files:**
- Modify (rewrite) `SentinelAddin/GhostBuilder/ViewPlanner.cs`
- Modify `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` — `GuidelineViewStandard.Tokens`
- Modify `SentinelAddin/Commands.Annotate.cs` — the one call of `Plan`, interim (Task 2 rewrites the command)
- Modify (rewrite) `tools/annotate-check/Check.cs`; modify `tools/annotate-check/annotate-check.csproj`

**Interfaces:**
- Consumes: `Rule`, `Ruleset`, `RuleTarget` (`SentinelAddin/Engine/RuleModels.cs`); `RuleRegex.Matches(Rule, string org, string text, out string error)`, `RuleRegex.DefWithOrg(string def, string org)`, `RuleRegex.TextWithOrg(string text, string org)`, `RuleRegex.NeedsOrg(Rule)` (`SentinelAddin/Engine/RuleRegex.cs`); `GuidelineViewStandard`, `GuidelineViewNaming`, `GuidelineMatcher.FromBodies` (`GuidelineMatcher.cs`).
- Produces (namespace `Sentinel.GhostBuilder`): `ViewPlanner.Plan(List<GuidelineViewStandard> views, GuidelineViewNaming naming, IReadOnlyList<(string Name, bool IsStory)> levels, Ruleset ruleset, ICollection<string> existing) → List<PlannedView>`; `PlannedView { string Name; string Use; string ViewType; string LevelName; bool IsStory; string Template; bool TemplateInModel; string BrowserStatus; bool PreTicked; string Refusal }` (all settable); `DatumFact { long Id; string Kind /* "Level" | "Grid" */; string Name; bool IsStory; bool Pinned; string OwnedBy; bool ChangedInCentral }`; `PinRow { long Id; string Label; bool PreTicked; string Refusal }`; `ViewPlanner.Pins(IEnumerable<DatumFact>) → List<PinRow>`; `ViewPlanner.RuleLine(Ruleset, string rulesetLabel) → string`; `ViewPlanner.PinnedLine(int storiesPinned, int stories, int otherLevelsPinned, int otherLevels, int gridsPinned, int grids) → string` (review C6); `ViewPlanner.UndoWords() → string` (every model, review C3); `ViewPlanner.NothingToPlan(…)` unchanged; `const string ViewPlanner.Existing`, `const string ViewPlanner.Prohibited`; `GuidelineViewStandard.Tokens` (`Dictionary<string, string>`, JSON `tokens`).

- [ ] **Step 1: The checks.**

In `tools/annotate-check/annotate-check.csproj`, replace

```xml
    <Nullable>disable</Nullable>
```

with

```xml
    <!-- MA-2e: RuleModels.cs carries nullable annotations (string?): read them, warn on nothing -->
    <Nullable>annotations</Nullable>
```

In `tools/annotate-check/annotate-check.csproj`, replace

```xml
    <RootNamespace>Sentinel.Checks</RootNamespace>
```

with

```xml
    <RootNamespace>Sentinel.Checks</RootNamespace>
    <!-- MA-2e: RuleModels.cs uses System.Linq without naming it (the add-in's global usings) -->
    <ImplicitUsings>enable</ImplicitUsings>
```

In `tools/annotate-check/annotate-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\ViewPlanner.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\ViewPlanner.cs" />
    <!-- MA-2e: the View rule and its one token compiler (ANV-1) -->
    <Compile Include="..\..\SentinelAddin\Engine\RuleModels.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\RuleRegex.cs" />
```

`Create` `tools/annotate-check/Check.cs` (it replaces the whole file):

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

int failed = 0, total = 0;
void Check(string name, bool ok)
{
    total++;
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}");
    if (!ok) failed++;
}

// Resolve the repo root from the SOURCE tree, not the working directory — same idiom as
// tools/guideline-check/Check.cs, so `dotnet run --project` works regardless of cwd.
string root = AppContext.BaseDirectory;
for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
    root = Path.GetFullPath(Path.Combine(root, ".."));

// The two View rules on the data, read as RulesetStore reads a ruleset@n body (snake_case enums, any case).
var rsOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true, Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) } };
Ruleset Rs(params string[] path) => JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(new[] { root }.Concat(path).ToArray())), rsOpts);
var bdsRules = Rs("demo", "bds-pilot", "ruleset.json");
var astRules = Rs("demo", "aster", "ruleset-AST.json");
var none = new Ruleset();

var views = new List<GuidelineViewStandard>
{
    new() { Use = "GA Plan", WipTemplate = "01.100_WIP_FLOOR_PLANS", ViewType = "FloorPlan", NamePrefix = "FP" },
    new() { Use = "RCP", WipTemplate = "01.100_WIP_RCP", ViewType = "CeilingPlan", NamePrefix = "RCP" },
    new() { Use = "Section", WipTemplate = "01.100_WIP_SECTIONS", ViewType = "Section", NamePrefix = "SEC" },
    new() { Use = "Coordination", ViewType = "FloorPlan" },
};
var naming = new GuidelineViewNaming
{
    Structure = "[STATUS]_[TYPE]_[LEVEL]_[DESCRIPTION]",
    StatusPrefixes = new() { ["WIP_"] = "01_WIP_VIEWS", ["SH_"] = "02_SHEET_VIEWS" },
};
var two = new List<(string, bool)> { ("Level 0", true), ("Level 1", true) };

var plans = ViewPlanner.Plan(views, naming, two, none, null);
Check("2 plannable entries x 2 levels = 4", plans.Count == 4);
var ga0 = plans.Find(p => p.Use == "GA Plan" && p.LevelName == "Level 0");
Check("GA Plan Level 0 exists", ga0 != null);
Check("name follows [STATUS]_[TYPE]_[LEVEL]", ga0?.Name == "WIP_FP_LEVEL-0");
Check("template carried", ga0?.Template == "01.100_WIP_FLOOR_PLANS");
Check("browser status resolved from statusPrefixes", ga0?.BrowserStatus == "01_WIP_VIEWS");
Check("sections skipped", !plans.Exists(p => p.Use == "Section"));
Check("no-prefix entries skipped", !plans.Exists(p => p.Use == "Coordination"));
Check("null views -> empty", ViewPlanner.Plan(null, naming, two, none, null).Count == 0);
Check("no levels -> empty", ViewPlanner.Plan(views, naming, new List<(string, bool)>(), none, null).Count == 0);

// Annotate's refusal names the guideline in force (cohesion 4b-2): none, or one without views, plans nothing.
Check("none refuses in the spec's words",
    ViewPlanner.NothingToPlan("none — not installed for p-none or its office", false, null)
    == "Guideline: none — not installed for p-none or its office. Nothing to plan — install a guideline@n with a views section on the project or its office.");
Check("a guideline without views refuses, naming it",
    ViewPlanner.NothingToPlan("guideline@1 · office · 0123456789ab…", true, new List<GuidelineViewStandard>())
    == "Guideline: guideline@1 · office · 0123456789ab… has no views section. Nothing to plan — install a guideline@n with a views section on the project or its office.");
Check("a guideline with views plans", ViewPlanner.NothingToPlan("guideline@1 · office · 0123456789ab…", true, views) == null);

// the pilot's guideline (demo/bds-pilot/, what B7 installs as the pilot office's guideline@1) parses with the new sections
var m = GuidelineMatcher.FromBodies(File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "bds-guideline.json")), null, out var guidelineError, out _);
Check("BDS guideline loads" + (guidelineError == null ? "" : " — " + guidelineError), m.HasGuideline);
Check("BDS views section deserialized", m.Views != null && m.Views.Count > 0);
Check("BDS GA Plan wipTemplate", m.Views?.Find(v => v.Use == "GA Plan")?.WipTemplate == "01.100_WIP_FLOOR_PLANS");
Check("BDS door tag family", m.Graphics?.Tags?["Doors"]?.Family == "BDS_Door Tag");

// ── MA-2e (ANV-2, F2): story levels × the first FloorPlan and CeilingPlan entries pre-ticked; the rest listed ──
var bdsLevels = new List<(string, bool)> { ("GR-FFL", true), ("01-FFL", true), ("Roof", false) };
var bds = ViewPlanner.Plan(m.Views, m.ViewNaming, bdsLevels, bdsRules, new HashSet<string>());
Check("BDS: 7 plannable entries x 3 levels = 21 rows (Structural Plan and Model Management have no namePrefix or tokens)", bds.Count == 21);
Check("only story levels x GA Plan and RCP are pre-ticked",
    bds.Where(p => p.PreTicked).Select(p => p.Name).SequenceEqual(new[] { "WIP_FP_GR-FFL", "WIP_RCP_GR-FFL", "WIP_FP_01-FFL", "WIP_RCP_01-FFL" }));
Check("a level that is not a Building Story is listed, not pre-ticked, refused only for the duplicate name",
    bds.Where(p => p.LevelName == "Roof").All(p => !p.PreTicked && !p.IsStory && (p.Refusal == null) == (p.Use != "Presentation Plan (no colour)")));
var pp2 = bds.Find(p => p.Use == "Presentation Plan (no colour)" && p.LevelName == "GR-FFL");
Check("K5: the second PP entry is refused by name, not skipped in silence", pp2?.Refusal == "same name as 'Presentation Plan' on GR-FFL" && !pp2.PreTicked);
Check("every other BDS name passes VN-01 as it is (Scan Now's rule)", bds.Count(p => p.Refusal != null) == 3);
Check("the rule line names VN-01 and the ruleset",
    ViewPlanner.RuleLine(bdsRules, "ruleset@1 · office · ab12…") == "View names are checked against VN-01 (ruleset ruleset@1 · office · ab12…) — Scan Now's own rule.");
var again = ViewPlanner.Plan(m.Views, m.ViewNaming, bdsLevels, bdsRules, new HashSet<string> { "WIP_FP_GR-FFL" });
Check("a name a view or a template already holds is listed as such, unticked",
    again[0].Refusal == ViewPlanner.Existing && !again[0].PreTicked && again.Count(p => p.PreTicked) == 3);

// ANV-2's acceptance: a ':' in the prefix is reported and skipped, and the rest are still created
var colon = new List<GuidelineViewStandard>
{
    new() { Use = "GA Plan", ViewType = "FloorPlan", NamePrefix = "F:P" },
    new() { Use = "RCP", ViewType = "CeilingPlan", NamePrefix = "RCP" },
};
var cp = ViewPlanner.Plan(colon, naming, two, bdsRules, null);
Check("ANV-2: a ':' in the prefix is reported and that row refused", cp[0].Refusal == "'WIP_F:P_LEVEL-0' holds ':', which Revit does not allow in a view name" && !cp[0].PreTicked);
Check("...and the rest are still planned and pre-ticked", cp.Count(p => p.PreTicked) == 2 && cp.Where(p => p.Use == "RCP").All(p => p.PreTicked));

// ANV-1 (F1 A): the View rule's tokens, from the entry and the level, never a guess
var tokened = new List<GuidelineViewStandard>
{
    new() { Use = "GA Plan", ViewType = "FloorPlan", NamePrefix = "FP", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "{level}", ["TYPE"] = "PLAN", ["DESC"] = "GA" } },
    new() { Use = "RCP", ViewType = "CeilingPlan", NamePrefix = "RCP", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "{level}", ["TYPE"] = "RCP", ["DESC"] = "Ceiling" } },
};
var ast = ViewPlanner.Plan(tokened, naming, new List<(string, bool)> { ("L1 - Architectural", true), ("L01", true) }, astRules, null);
Check("ANV-1: the name is the View rule's tokens in its order, from the entry and the level",
    ast.Find(p => p.LevelName == "L01" && p.Use == "GA Plan")?.Name == "ARC_L01_PLAN_GA" && ast.Find(p => p.LevelName == "L01" && p.Use == "RCP")?.Name == "ARC_L01_RCP_Ceiling");
Check("...both pass VN-01 and are pre-ticked", ast.Where(p => p.LevelName == "L01").All(p => p.Refusal == null && p.PreTicked));
Check("F44: a level name that fails LEVEL is refused by name, never mapped by a guess",
    ast.Find(p => p.LevelName == "L1 - Architectural" && p.Use == "GA Plan")?.Refusal
    == @"LEVEL 'L1 - Architectural' does not pass L\d{2}|LRF|XX (VN-01) — the level's name is used as it is: rename the level, or give the entry another LEVEL");
var l01 = new List<(string, bool)> { ("L01", true) };
var noDisc = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["LEVEL"] = "{level}", ["TYPE"] = "PLAN", ["DESC"] = "GA" } } };
Check("a token the entry does not give is refused by name",
    ViewPlanner.Plan(noDisc, naming, l01, astRules, null)[0].Refusal == "'GA Plan' gives no DISC — VN-01 needs it; add it to the entry's tokens");
var fp = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "{level}", ["TYPE"] = "FP", ["DESC"] = "GA" } } };
Check("a value that fails its token's definition is refused, naming the definition",
    ViewPlanner.Plan(fp, naming, l01, astRules, null)[0].Refusal == "TYPE 'FP' does not pass PLAN|RCP|SEC|ELEV|DET|3D|SCH (VN-01)");
var fixedAst = ViewPlanner.Plan(views, naming, l01, astRules, null);
Check("F44: a fixed WIP_ name the project's View rule refuses is never created",
    fixedAst[0].Refusal == "'WIP_FP_L01' does not pass VN-01: View 'WIP_FP_L01' does not match [DISCIPLINE]_[LEVEL]_[TYPE]_[DESCRIPTION]." && !fixedAst.Any(p => p.PreTicked));
Check("no View rule: a fixed name is planned and the line says it is not checked",
    ViewPlanner.Plan(views, naming, two, none, null).Count(p => p.PreTicked) == 4
    && ViewPlanner.RuleLine(none, "none — not installed for p-none or its office") == "View names not checked: no View rule with tokens or a whitelist in the ruleset (none — not installed for p-none or its office).");
Check("no View rule: an entry named by tokens is refused, since nothing orders them",
    ViewPlanner.Plan(tokened, naming, two, none, null).All(p => p.Refusal == "'" + p.Use + "' names its view by tokens, but no View rule with tokens is installed to order them"));
var flat = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "XX", ["TYPE"] = "PLAN", ["DESC"] = "GA" } } };
var fl = ViewPlanner.Plan(flat, naming, new List<(string, bool)> { ("L01", true), ("L02", true) }, astRules, null);
Check("E5: an entry without {level} names every level alike: the second row is refused, not created twice", fl[0].Refusal == null && fl[1].Refusal == "same name as 'GA Plan' on L01");
var parsed = JsonSerializer.Deserialize<GuidelineViewStandard>("{\"use\":\"GA Plan\",\"viewType\":\"FloorPlan\",\"tokens\":{\"DISC\":\"ARC\",\"LEVEL\":\"{level}\"}}");
Check("a guideline view entry's tokens deserialize", parsed.Tokens?["LEVEL"] == "{level}" && parsed.Tokens.Count == 2);

// ── review C5: Scan Now's CheckName, whole — a whitelist-only View rule, an exclusion, a rule that needs the office code ──
var wl = new Ruleset { Rules = { new Rule { Id = "VN-WL", Target = RuleTarget.View, Whitelist = { "GA-PLAN" }, MessageEn = "View '{name}' is not on the list." } } };
Check("C5: a whitelist-only View rule refuses a name it does not list, as Scan Now would flag it",
    ViewPlanner.Plan(views, naming, l01, wl, null)[0].Refusal == "'WIP_FP_L01' does not pass VN-WL: View 'WIP_FP_L01' is not on the list.");
var excluded = Rs("demo", "aster", "ruleset-AST.json");
excluded.Rules.First(r => r.Id == "VN-01").Exclusions.Add("^WIP_");
Check("C5: an excluded name passes although the pattern fails (Scan Now skips it)", ViewPlanner.Plan(views, naming, l01, excluded, null)[0].Refusal == null);
var orgRule = new Ruleset { Rules = { new Rule { Id = "VN-ORG", Target = RuleTarget.View, Tokens = { "ORG", "LEVEL" }, TokenDefs = { ["ORG"] = "{org}", ["LEVEL"] = @"L\d{2}" } } } };
Check("C5: a rule that needs the office code, with ruleset.org empty, refuses in words (fails closed, never a literal {org})",
    ViewPlanner.Plan(views, naming, l01, orgRule, null).All(p => p.Refusal == "VN-ORG needs an office code and ruleset.org is empty — the name cannot be judged; set the office code"));
var extraTok = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["DISCIPLINE"] = "ARC", ["DISC"] = "ARC", ["LEVEL"] = "{level}", ["TYPE"] = "PLAN", ["DESC"] = "GA" } } };
Check("C11: a token the View rule does not have is refused by name, never dropped in silence",
    ViewPlanner.Plan(extraTok, naming, l01, astRules, null)[0].Refusal == "'GA Plan' gives DISCIPLINE, which VN-01 does not have (its tokens: DISC, LEVEL, TYPE, DESC)");

// ── MA-2e (DAT-3, F3 A, F7): the pin rows, the read-back and the B31 words ──
var pinRows = ViewPlanner.Pins(new[]
{
    new DatumFact { Id = 1, Kind = "Level", Name = "GR-FFL", IsStory = true },
    new DatumFact { Id = 2, Kind = "Level", Name = "01-FFL", IsStory = true, Pinned = true },
    new DatumFact { Id = 3, Kind = "Level", Name = "Roof", IsStory = false },
    new DatumFact { Id = 4, Kind = "Grid", Name = "A" },
    new DatumFact { Id = 5, Kind = "Grid", Name = "B", OwnedBy = "anna" },
    new DatumFact { Id = 6, Kind = "Grid", Name = "C", ChangedInCentral = true },
});
Check("DAT-3: every unpinned level and grid is listed; one already pinned is not", pinRows.Select(p => p.Id).SequenceEqual(new long[] { 1, 3, 4, 5, 6 }));
Check("...story levels and grids pre-ticked; a level that is not a story listed unticked",
    pinRows.Where(p => p.PreTicked).Select(p => p.Id).SequenceEqual(new long[] { 1, 4 }) && pinRows[1].Label == "Level 'Roof' (not a Building Story)" && pinRows[2].Label == "Grid 'A'");
Check("F7 (review C7): a datum another user owns, or one changed in central, is listed unticked with the reason",
    pinRows[3].Refusal == "owned by anna in this workshared model — pin it once they relinquish it" && !pinRows[3].PreTicked
    && pinRows[4].Refusal == "changed in central — reload latest, then pin it" && !pinRows[4].PreTicked);
Check("S3 (review C6): the MH-LNK-01 substitute reads every level and grid from the model and says links are not checked",
    ViewPlanner.PinnedLine(2, 2, 0, 1, 3, 4) == "Pinned now: 2/2 story level(s), 0/1 other level(s), 3/4 grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).");
Check("S1 (review C3): the B31 words, in every model",
    ViewPlanner.UndoWords() == "Revit may empty its Undo list after views are named (B31) — if Edit ▸ Undo does not list \"Sentinel: Annotate views\", the annotate ledger row is the record: it names the views and datums to delete or unpin by hand.");

Console.WriteLine($"{total - failed}/{total} checks pass");
Console.WriteLine(failed == 0 ? "ALL PASS" : $"{failed} FAILED");
return failed == 0 ? 0 : 1;
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/annotate-check` — it fails to compile: `error CS1501: No overload for method 'Plan' takes 5 arguments`, `CS1061: 'PlannedView' does not contain a definition for 'PreTicked'` (and for `Refusal`, `IsStory`), `CS0117: 'GuidelineViewStandard' does not contain a definition for 'Tokens'` (dry run).

- [ ] **Step 3: The plan.**

`Create` `SentinelAddin/GhostBuilder/ViewPlanner.cs` (it replaces the whole file):

```csharp
#nullable disable
// MA-2e (audit DAT-3, ANV-1, ANV-2): Annotate's plan, pure — no Revit types, so tools/annotate-check drives it offline.
// Rows are levels × the guideline's plannable view entries (FloorPlan, CeilingPlan; an entry with a namePrefix or tokens).
// A row's name is the entry's `tokens` in the order of the project's View rule (founder decision F1 A: a token is filled
// only from the entry, "{level}" by the level's name verbatim, and each value must pass its token's definition), or today's
// fixed WIP_<namePrefix>_<LEVEL>. Every name is judged as Scan Now judges it (RuleEngineHost.CheckName: exclusions, whitelist,
// RuleRegex) before anything is created, so a created view raises no View naming violation (closes F44). A row is refused,
// with the reason, when a token is missing, a value fails its definition, the name fails a View rule, holds a character Revit
// refuses in a view name, repeats an earlier row's name, or is already in the model. Pre-ticked (F2): a story level × the
// first FloorPlan entry and the first CeilingPlan entry; everything else is listed unticked — a person decides. The pin rows
// (DAT-3, F3 A) and the words of the preview and the result are here too. This is the only view planner: the TS planViews
// had no caller and was retired in MA-2e (F5).
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public sealed class PlannedView
    {
        /// <summary>Null when the row was refused before a name could be built (a token missing or failing).</summary>
        public string Name { get; set; }
        public string Use { get; set; }
        public string ViewType { get; set; }
        public string LevelName { get; set; }
        public bool IsStory { get; set; }
        public string Template { get; set; }
        /// <summary>Set by the command: the view template the entry names is in the model.</summary>
        public bool TemplateInModel { get; set; }
        public string BrowserStatus { get; set; }
        /// <summary>Ticked when the preview opens (F2); never on a refused row.</summary>
        public bool PreTicked { get; set; }
        /// <summary>Why the row cannot be created, in words; null when it can.</summary>
        public string Refusal { get; set; }
    }

    /// <summary>A level or a grid as the pin rows read it (DAT-3).</summary>
    public sealed class DatumFact
    {
        public long Id;
        /// <summary>"Level" or "Grid".</summary>
        public string Kind;
        public string Name;
        /// <summary>Levels only: LEVEL_IS_BUILDING_STORY, read (ChangesetExecutor.Stories), never set (DAT-2).</summary>
        public bool IsStory;
        public bool Pinned;
        /// <summary>Another user who owns it in a workshared model, else null (F7).</summary>
        public string OwnedBy;
        /// <summary>Changed or deleted in central since this copy loaded (F7, review C7): pinning it would fail the commit.</summary>
        public bool ChangedInCentral;
    }

    public sealed class PinRow
    {
        public long Id { get; set; }
        public string Label { get; set; }
        public bool PreTicked { get; set; }
        public string Refusal { get; set; }
    }

    public static class ViewPlanner
    {
        private static readonly HashSet<string> Plannable = new HashSet<string> { "FloorPlan", "CeilingPlan" };

        /// <summary>The characters Revit refuses in a view name (NamingUtils.IsValidName's list; the command asks Revit too, E3).</summary>
        public const string Prohibited = "\\:{}[]|;<>?`~";
        /// <summary>In an entry's token value: the level's name, verbatim (F1 A).</summary>
        public const string LevelToken = "{level}";
        public const string Existing = "already in the model (a view or a view template holds this name)";

        /// <summary>Annotate's rows: <paramref name="levels"/> (lowest first, as the command reads them) × the guideline's plannable
        /// entries, in the guideline's order. <paramref name="ruleset"/> is the one Scan Now judges the document by (null or none: the
        /// names are not checked, and an entry named by tokens is refused); <paramref name="existing"/> the names the model holds.</summary>
        public static List<PlannedView> Plan(List<GuidelineViewStandard> views, GuidelineViewNaming naming,
            IReadOnlyList<(string Name, bool IsStory)> levels, Ruleset ruleset, ICollection<string> existing)
        {
            var outp = new List<PlannedView>();
            if (views == null || levels == null || levels.Count == 0) return outp;

            const string status = "WIP_";
            string browserStatus = null;
            naming?.StatusPrefixes?.TryGetValue(status, out browserStatus);

            var rules = ViewRules(ruleset);
            var entries = views.Where(v => v != null && Plannable.Contains(v.ViewType ?? "")
                && (!string.IsNullOrWhiteSpace(v.NamePrefix) || (v.Tokens != null && v.Tokens.Count > 0))).ToList();
            // F2: the first FloorPlan entry and the first CeilingPlan entry, in the guideline's order.
            var first = new HashSet<GuidelineViewStandard>(entries.GroupBy(v => v.ViewType).Select(g => g.First()));
            var named = new Dictionary<string, string>(); // a name → the row that took it first: "'GA Plan' on GR-FFL" (E5)
            foreach (var (level, isStory) in levels)
                foreach (var v in entries)
                {
                    string refusal = NameOf(v, level, rules, ruleset?.Org, out string name);
                    if (refusal == null && named.TryGetValue(name, out var earlier)) refusal = "same name as " + earlier;
                    if (refusal == null && existing != null && existing.Contains(name)) refusal = Existing;
                    if (name != null && !named.ContainsKey(name)) named[name] = $"'{v.Use}' on {level}";
                    outp.Add(new PlannedView
                    {
                        Name = name, Use = v.Use, ViewType = v.ViewType, LevelName = level, IsStory = isStory,
                        Template = v.WipTemplate, BrowserStatus = browserStatus, Refusal = refusal,
                        PreTicked = refusal == null && isStory && first.Contains(v),
                    });
                }
            return outp;
        }

        // The name of one row, or why there is none / why it is refused.
        private static string NameOf(GuidelineViewStandard v, string level, List<Rule> rules, string org, out string name)
        {
            name = null;
            // Review C5: a rule that needs the office code cannot be judged without one (Scan Now leaves it unevaluated) — fail closed, said.
            var noOrg = rules.FirstOrDefault(r => RuleRegex.NeedsOrg(r) && string.IsNullOrWhiteSpace(org));
            if (noOrg != null) return $"{noOrg.Id} needs an office code and ruleset.org is empty — the name cannot be judged; set the office code";
            if (v.Tokens != null && v.Tokens.Count > 0)
            {
                // E2: the first View rule WITH tokens orders them (a whitelist-only rule only judges, review C5).
                var rule = rules.FirstOrDefault(r => r.Tokens.Count > 0);
                if (rule == null) return $"'{v.Use}' names its view by tokens, but no View rule with tokens is installed to order them";
                // Review C11: a token the rule does not have is refused, never dropped in silence.
                var extra = v.Tokens.Keys.FirstOrDefault(k => !rule.Tokens.Contains(k));
                if (extra != null) return $"'{v.Use}' gives {extra}, which {rule.Id} does not have (its tokens: {string.Join(", ", rule.Tokens)})";
                var parts = new List<string>();
                foreach (var t in rule.Tokens)
                {
                    if (!v.Tokens.TryGetValue(t, out var raw) || string.IsNullOrWhiteSpace(raw))
                        return $"'{v.Use}' gives no {t} — {rule.Id} needs it; add it to the entry's tokens";
                    string value = raw.Replace(LevelToken, level);
                    if (rule.TokenDefs.TryGetValue(t, out var def) && !Accepts(def, org, value))
                        return $"{t} '{value}' does not pass {def} ({rule.Id})"
                             + (raw.Contains(LevelToken) ? $" — the level's name is used as it is: rename the level, or give the entry another {t}" : "");
                    parts.Add(value);
                }
                name = string.Join(rule.Separator, parts);
            }
            else name = "WIP_" + v.NamePrefix + "_" + Regex.Replace(level.Trim().ToUpperInvariant(), @"\s+", "-");

            int bad = name.IndexOfAny(Prohibited.ToCharArray());
            if (bad >= 0) return $"'{name}' holds '{name[bad]}', which Revit does not allow in a view name";
            foreach (var r in rules)
                if (!Passes(r, org, name, out string error))
                    return error != null ? $"{r.Id}: {error}" : $"'{name}' does not pass {r.Id}: " + RuleRegex.TextWithOrg(r.MessageEn ?? "", org).Replace("{name}", name);
            return null;
        }

        // One token's value against its definition, anchored (NamingProposer's TokenSlot.Accepts).
        private static bool Accepts(string def, string org, string value)
        {
            try { return Regex.IsMatch(value, "^(?:" + RuleRegex.DefWithOrg(def, org) + ")$", RegexOptions.CultureInvariant); }
            catch (System.ArgumentException) { return false; } // a malformed definition fails closed (BG-5)
        }

        // Scan Now's own judgement (RuleEngineHost.CheckName): an excluded or whitelisted name passes; a whitelist-only rule
        // passes nothing else (review C5); else the rule's pattern.
        private static bool Passes(Rule r, string org, string name, out string error)
        {
            error = null;
            if ((r.Exclusions ?? new List<string>()).Any(x => Regex.IsMatch(name, x))) return true;
            if (r.Whitelist != null && r.Whitelist.Contains(name)) return true;
            if (r.Tokens.Count == 0) return false;
            return RuleRegex.Matches(r, org, name, out error);
        }

        // The View rules Scan Now judges a name by: with tokens, or with a whitelist (review C5); lists never null below.
        private static List<Rule> ViewRules(Ruleset ruleset) =>
            (ruleset?.Rules ?? new List<Rule>()).Where(r => r != null && r.Target == RuleTarget.View && r.Tokens != null && r.Whitelist != null
                && (r.Tokens.Count > 0 || r.Whitelist.Count > 0)).ToList();

        /// <summary>The preview's and the result's line on what judged the names (F4).</summary>
        public static string RuleLine(Ruleset ruleset, string rulesetLabel)
        {
            var ids = ViewRules(ruleset).Select(r => r.Id).ToList();
            return ids.Count > 0
                ? $"View names are checked against {string.Join(", ", ids)} (ruleset {rulesetLabel}) — Scan Now's own rule."
                : $"View names not checked: no View rule with tokens or a whitelist in the ruleset ({rulesetLabel}).";
        }

        /// <summary>DAT-3 (F3 A, F7): every unpinned level and grid. Story levels and grids are pre-ticked; a level that is not a
        /// Building Story is listed unticked; one another user owns, or one changed in central (review C7), is listed unticked with
        /// the reason. A pinned one is not listed.</summary>
        public static List<PinRow> Pins(IEnumerable<DatumFact> datums) =>
            (datums ?? Enumerable.Empty<DatumFact>()).Where(d => d != null && !d.Pinned).Select(d => new PinRow
            {
                Id = d.Id,
                Label = d.Kind == "Level" ? $"Level '{d.Name}'" + (d.IsStory ? "" : " (not a Building Story)") : $"Grid '{d.Name}'",
                Refusal = d.OwnedBy != null ? $"owned by {d.OwnedBy} in this workshared model — pin it once they relinquish it"
                        : d.ChangedInCentral ? "changed in central — reload latest, then pin it" : null,
                PreTicked = d.OwnedBy == null && !d.ChangedInCentral && (d.Kind != "Level" || d.IsStory),
            }).ToList();

        /// <summary>S3 (review C6): the substitute for MH-LNK-01 (not in code) — every level, as MH-LNK-01 would read them, and every
        /// grid, read from the model after the commit.</summary>
        public static string PinnedLine(int storiesPinned, int stories, int otherLevelsPinned, int otherLevels, int gridsPinned, int grids) =>
            $"Pinned now: {storiesPinned}/{stories} story level(s), {otherLevelsPinned}/{otherLevels} other level(s), {gridsPinned}/{grids} grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).";

        /// <summary>S1 (review C3): B31's exception to one Undo per action, in words, in every model — "may" is true in all of them.</summary>
        public static string UndoWords() =>
            "Revit may empty its Undo list after views are named (B31) — if Edit ▸ Undo does not list \"Sentinel: Annotate views\", the annotate ledger row is the record: it names the views and datums to delete or unpin by hand.";

        /// <summary>Why Annotate has nothing to plan, or null when it has: the guideline is none — its label says why
        /// ("none — not installed for demo or its office") — or it has no views section. Annotate never plans another
        /// office's views in their place (cohesion 4b-2, F44).</summary>
        public static string NothingToPlan(string guidelineLabel, bool installed, List<GuidelineViewStandard> views)
        {
            const string install = " Nothing to plan — install a guideline@n with a views section on the project or its office.";
            if (!installed) return "Guideline: " + guidelineLabel + "." + install;
            if (views == null || views.Count == 0) return "Guideline: " + guidelineLabel + " has no views section." + install;
            return null;
        }
    }
}
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
        [JsonPropertyName("tag")]           public List<string> Tag { get; set; }
    }
```

with

```csharp
        [JsonPropertyName("tag")]           public List<string> Tag { get; set; }
        /// <summary>MA-2e (ANV-1, founder decision F1 A): the View rule's tokens this entry fills ("DISC": "ARC", "LEVEL":
        /// "{level}", …); "{level}" is the level's name, verbatim. Absent → the fixed WIP_&lt;namePrefix&gt;_&lt;LEVEL&gt; name.</summary>
        [JsonPropertyName("tokens")]        public Dictionary<string, string> Tokens { get; set; }
    }
```

In `SentinelAddin/Commands.Annotate.cs`, replace

```csharp
        var plans = ViewPlanner.Plan(guideline.Views, guideline.ViewNaming,
            levels.Select(l => l.Name).ToList());
```

with

```csharp
        // MA-2e Task 1, interim (Task 2 rewrites this command): every level, the rows the plan does not refuse.
        var plans = ViewPlanner.Plan(guideline.Views, guideline.ViewNaming,
            levels.Select(l => (l.Name, true)).ToList(), App.Engine?.RulesetFor(doc), null)
            .Where(p => p.Refusal == null).ToList();
```

- [ ] **Step 4: Run it, and see it pass.** `dotnet run --project tools/annotate-check` — `44/44 checks pass` then `ALL PASS`, no compiler warning (dry run). Then both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` — `0 Error(s)`, `5 Warning(s)` (master's); `-p:RevitVersion=2026` — `0 Error(s)`, `3 Warning(s)` (dry run; none in a line this task wrote — on 2026 two are master's `CS8600` in `Commands.Annotate.cs`'s old `TryGetValue` lines, which Task 2 rewrites).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/ViewPlanner.cs SentinelAddin/GhostBuilder/GuidelineMatcher.cs SentinelAddin/Commands.Annotate.cs tools/annotate-check/Check.cs tools/annotate-check/annotate-check.csproj
git commit -F - <<'EOF'
feat(annotate): MA-2e - ViewPlanner: names from the View rule's tokens or the fixed WIP_ name, judged as Scan Now judges them, refused with the reason; story levels x the first plan and ceiling plan entries pre-ticked; the pin rows and the words. Commands.Annotate's call is interim, superseded by Task 2 (it drops refused rows; never deployed)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 2 — Revit-bound: the preview, one group, a SubTransaction per view, the pins read back, the row

**Files:**
- Modify (rewrite) `SentinelAddin/Commands.Annotate.cs`
- Create `SentinelAddin/UI/AnnotatePreviewWindow.cs`
- Modify `SentinelAddin/Coordination/CommandReports.cs` — `Annotate`
- Modify `SentinelAddin/Commands.Datum.cs` — the result's last line (F3)
- Modify `tools/annotate-check/Check.cs` (the wiring's scans), `tools/promote-check/Reports.cs` (`Annotate`'s pinned body, and its scan of the old commit check)

**Interfaces:**
- Consumes: Task 1's `ViewPlanner.Plan`, `Pins`, `RuleLine`, `PinnedLine`, `UndoWords`, `Existing`, `PlannedView`, `DatumFact`, `PinRow`; `ChangesetExecutor.Stories(Document) → List<LevelFact { Name, ElevationMm, IsStory }>`; `SentinelUndo.Run(Document, string, Func<bool>) → bool`; `App.Engine.RulesetFor(Document)`, `App.Engine.SourceFor(Document).Label`, `App.OrgFor(Document)`; `RulesetStore.None()`; `OrgNames.MainGroupParams(string) → string[]`; `ViewGenerator.SetFirstMatch(Element, string[], string) → bool`; `DialogOwner.Attach(Window, ExternalCommandData)`; `GovernedNotify.Report(string, object, string)`; `Compat.IdValue()` / `ToElementId()`.
- Produces: `AnnotatePreviewWindow(IReadOnlyList<PlannedView> views, IReadOnlyList<PinRow> pins, IReadOnlyList<string> words)` with `IReadOnlyList<PlannedView> Views` and `IReadOnlyList<PinRow> Pins` (the ticked rows) after `ShowDialog() == true`; `CommandReports.Annotate(IReadOnlyList<string> views, int levels, int skippedExisting, int refused, int failed, int unrouted, int pinnedLevels, int pinnedGrids, int warnings, int storyLevels, IReadOnlyList<long> pinnedIds, string pinnedNow, bool undoGroupKept, string guideline, string ruleset, string actor)` — 16 arguments (review C4, C11): `views` and `pinnedIds` as read back from the model (review C2), `levels` the distinct levels of the views created.
- Also consumes (reviews C1, C2, C7): `App.Engine.Has(Document)` (`RuleEngineHost`: false means "not loaded yet"); `Autodesk.Revit.Exceptions.InvalidOperationException`; `WorksharingUtils.GetModelUpdatesStatus(Document, ElementId) → ModelUpdatesStatus`.

- [ ] **Step 1: The checks.**

In `tools/annotate-check/Check.cs`, replace

```csharp
Console.WriteLine($"{total - failed}/{total} checks pass");
```

with

```csharp
// ── MA-2e: Annotate's wiring, by source scan (Revit-bound; proven in drill MA2e) ──
string Src(params string[] p) => File.ReadAllText(Path.Combine(new[] { root, "SentinelAddin" }.Concat(p).ToArray()));
int CountOf(string s, string what) { int n = 0; for (int i = s.IndexOf(what); i >= 0; i = s.IndexOf(what, i + what.Length)) n++; return n; }
var ann = Src("Commands.Annotate.cs");
int run = ann.IndexOf("SentinelUndo.Run(doc, \"Annotate views\"");
int shown = ann.IndexOf("pick.ShowDialog() != true");
int pinLoop = ann.IndexOf("foreach (var pin in pick.Pins)");
Check("XC-2/S1: Annotate writes inside one SentinelUndo group, and its one Transaction is inside it",
    run > 0 && CountOf(ann, "new Transaction(") == 1 && ann.IndexOf("new Transaction(") > run);
Check("ANV-2: each view in its own SubTransaction, rolled back alone on a throw, Revit asked for the name",
    ann.Contains("using var st = new SubTransaction(doc);") && ann.Contains("if (st.HasStarted() && !st.HasEnded()) st.RollBack();") && ann.Contains("NamingUtils.IsValidName(p.Name)"));
Check("F6: the model's default plan and ceiling plan view types, never the first one found",
    ann.Contains("GetDefaultElementTypeId(ElementTypeGroup.ViewTypeFloorPlan)") && ann.Contains("GetDefaultElementTypeId(ElementTypeGroup.ViewTypeCeilingPlan)") && !ann.Contains("OfClass(typeof(ViewFamilyType))"));
Check("DAT-3: only ticked pins are pinned; Building Story is read through the one projection, never set (DAT-2)",
    CountOf(ann, ".Pinned = true") == 1 && pinLoop > run && pinLoop < ann.IndexOf(".Pinned = true") && ann.Contains("ChangesetExecutor.Stories(doc)") && !ann.Contains("LEVEL_IS_BUILDING_STORY"));
int loaded = ann.IndexOf("!engine.Has(doc)");
Check("F4 (review C1): the ruleset is Scan Now's cached one — no network call — and 'not loaded yet' refuses before the plan, never read as none",
    ann.Contains("engine.RulesetFor(doc)") && !ann.Contains("RulesetStore.Load(") && !ann.Contains("RulesetStore.None()")
    && loaded > 0 && loaded < ann.IndexOf("ViewPlanner.Plan("));
Check("a person decides: the preview opens before anything is written, and Cancel writes nothing", shown > 0 && shown < run);
Check("the result counts the views it could not route, reads the pins back and says B31 in words, in the preview and the result (review C3: every model)",
    ann.Contains("ViewGenerator.SetFirstMatch(view, routeParams, p.BrowserStatus)") && ann.Contains("if (!routed) unrouted++;")
    && ann.Contains("ViewPlanner.PinnedLine(") && CountOf(ann, "ViewPlanner.UndoWords()") == 2);
int nothingAt = ann.IndexOf("ViewPlanner.NothingToPlan(");
Check("review C10: with no guideline (or no views section) Annotate refuses before any preview opens (the 4b-2 guard, AST-1 retired)",
    nothingAt > 0 && nothingAt < ann.IndexOf("new AnnotatePreviewWindow("));
Check("F3: Datum's result names Annotate as the next step", Src("Commands.Datum.cs").Contains("Next: 3 · Annotate Views"));

Console.WriteLine($"{total - failed}/{total} checks pass");
```

In `tools/promote-check/Reports.cs`, replace

```csharp
        var annotate = Json(CommandReports.Annotate(6, 2, 1, 3, "guideline@3 · office · 0123…", "a"));
        Ok(annotate.GetProperty("entity_type").GetString() == "annotate" && annotate.GetProperty("action").GetString() == "Annotate created 6 view(s) across 3 level(s)"
           && annotate.GetProperty("new_value").GetProperty("skipped_existing").GetInt32() == 2 && annotate.GetProperty("new_value").GetProperty("guideline").GetString() == "guideline@3 · office · 0123…",
           "an Annotate run is one annotate row, naming the guideline that planned the views");
```

with

```csharp
        var created6 = new[] { "WIP_FP_GR-FFL", "WIP_RCP_GR-FFL", "WIP_FP_01-FFL", "WIP_RCP_01-FFL", "WIP_FP_02-FFL", "WIP_RCP_02-FFL" };
        const string pinnedNow = "Pinned now: 3/3 story level(s), 0/1 other level(s), 4/4 grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).";
        var annotate = Json(CommandReports.Annotate(created6, 3, 2, 3, 1, 1, 2, 4, 1, 3, new long[] { 11, 12, 21, 22, 23, 24 }, pinnedNow, false,
            "guideline@3 · office · 0123…", "ruleset@2 · office · 4567…", "a"));
        var av = annotate.GetProperty("new_value");
        Ok(annotate.GetProperty("entity_type").GetString() == "annotate" && annotate.GetProperty("action").GetString() == "Annotate created 6 view(s) and pinned 6 datum(s) across 3 level(s)"
           && av.GetProperty("views_created").GetInt32() == 6 && av.GetProperty("views").GetArrayLength() == 6 && av.GetProperty("views")[5].GetString() == "WIP_RCP_02-FFL"
           && av.GetProperty("skipped_existing").GetInt32() == 2 && av.GetProperty("refused").GetInt32() == 3
           && av.GetProperty("failed").GetInt32() == 1 && av.GetProperty("unrouted").GetInt32() == 1 && av.GetProperty("pinned_levels").GetInt32() == 2
           && av.GetProperty("pinned_grids").GetInt32() == 4 && av.GetProperty("pinned_ids").GetArrayLength() == 6 && av.GetProperty("pinned_ids")[0].GetInt64() == 11
           && av.GetProperty("pinned_now").GetString() == pinnedNow && !av.GetProperty("undo_group_kept").GetBoolean() && av.GetProperty("story_levels").GetInt32() == 3
           && av.GetProperty("guideline").GetString() == "guideline@3 · office · 0123…" && av.GetProperty("ruleset").GetString() == "ruleset@2 · office · 4567…",
           "an Annotate run is one annotate row: the views and datums read back (named — the record when Revit did not keep the Undo group, B31), rows refused or failed or unrouted, and the guideline and ruleset that planned and named them (MA-2e, review C4)");
        var annotateMany = Json(CommandReports.Annotate(Enumerable.Range(0, 205).Select(i => "V" + i).ToList(), 1, 0, 0, 0, 0, 0, 0, 0, 1, new long[0], pinnedNow, true, "g", "r", "a"))
            .GetProperty("new_value");
        Ok(annotateMany.GetProperty("views_created").GetInt32() == 205 && annotateMany.GetProperty("views").GetArrayLength() == CommandReports.MaxRecord && annotateMany.GetProperty("undo_group_kept").GetBoolean(),
           "an Annotate row names at most MaxRecord views beside their true total (review C4)");
```

In `tools/promote-check/Reports.cs`, replace

```csharp
        Ok(Src("Commands.Annotate.cs").Contains("if (t.Commit() != TransactionStatus.Committed)"), "Annotate reports only a transaction Revit committed, and says so when it did not");
```

with

```csharp
        string annSrc = Src("Commands.Annotate.cs");
        int readBack = annSrc.IndexOf("var present = "), notKept = annSrc.IndexOf("if (!kept");
        Ok(annSrc.Contains("committed = t.Commit() == TransactionStatus.Committed;") && annSrc.Contains("catch (Autodesk.Revit.Exceptions.InvalidOperationException")
           && readBack > 0 && readBack < notKept && notKept < annSrc.IndexOf("GovernedNotify.Report(\"Annotate\""),
           "Annotate reads the model back after its group, kept or not (a group that throws too), says 'the model is as it was' only when the read-back finds nothing, and reports what it read (MA-2e, review C2)");
```

- [ ] **Step 2: Run them, and see them fail.** `dotnet run --project tools/annotate-check` — `44/53 checks pass`, `9 FAILED`: every new scan (F4's too, since review C1: the interim call has no `!engine.Has(doc)`) (dry run). `dotnet run --project tools/promote-check` — it fails to compile: `Reports.cs(41,44): error CS1501: No overload for method 'Annotate' takes 16 arguments`, and `CS0117: 'CommandReports' does not contain a definition for 'MaxRecord'` (dry run).

- [ ] **Step 3: The row, the window, the command, Datum's line.**

In `SentinelAddin/Coordination/CommandReports.cs`, replace

```csharp
        public static object Annotate(int created, int skippedExisting, int warnings, int levels, string guideline, string actor) =>
            Row("annotate", actor, $"Annotate created {created} view(s) across {levels} level(s)",
                new { views_created = created, skipped_existing = skippedExisting, warnings, levels, guideline, source = "revit" });
```

with

```csharp
        /// <summary>Review C4: the views and datums an Annotate row names — the record B31 may leave (one view and one RCP for each
        /// of 100 storeys), beside their true totals.</summary>
        public const int MaxRecord = 200;

        /// <summary>MA-2e: one Annotate run, as read back from the model after its group (review C2, C4) — the views it holds, named
        /// (a view that failed was rolled back alone), on how many levels; the datums pinned, by id, and the read-back line; whether
        /// Revit kept the Undo group (B31: when not, this row is the record); the rows the plan refused (already in the model, or
        /// with a reason), the views no Project Browser parameter routed, and the guideline and the ruleset that planned and named them.</summary>
        public static object Annotate(IReadOnlyList<string> views, int levels, int skippedExisting, int refused, int failed, int unrouted,
                                      int pinnedLevels, int pinnedGrids, int warnings, int storyLevels, IReadOnlyList<long> pinnedIds,
                                      string pinnedNow, bool undoGroupKept, string guideline, string ruleset, string actor) =>
            Row("annotate", actor, $"Annotate created {views.Count} view(s) and pinned {pinnedLevels + pinnedGrids} datum(s) across {levels} level(s)", new
            {
                views_created = views.Count, views = views.Take(MaxRecord).ToArray(), skipped_existing = skippedExisting, refused, failed, unrouted,
                pinned_levels = pinnedLevels, pinned_grids = pinnedGrids, pinned_ids = pinnedIds.Take(MaxRecord).ToArray(), pinned_now = pinnedNow,
                undo_group_kept = undoGroupKept, warnings, story_levels = storyLevels, guideline, ruleset, source = "revit",
            });
```

`Create` `SentinelAddin/UI/AnnotatePreviewWindow.cs`:

```csharp
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.GhostBuilder;

namespace Sentinel.UI;

/// <summary>
/// MA-2e (audit ANV-2, DAT-3): Annotate's preview — one group per level (lowest first) with a row per planned view (its name, the
/// guideline entry, the template's status), then one group of the unpinned levels and grids. A refused row is greyed, says why
/// and cannot be ticked (E1). The words above the rows name the guideline, the View rule that judged the names and B31 (spec
/// amendment S1, review C3). Modal and built in code, ViewPickWindow's idiom: ShowDialog() == true means
/// Create was pressed; <see cref="Views"/> and <see cref="Pins"/> hold the ticked rows.
/// </summary>
public sealed class AnnotatePreviewWindow : Window
{
    private readonly List<(CheckBox Box, PlannedView View)> _views = new();
    private readonly List<(CheckBox Box, PinRow Pin)> _pins = new();
    private readonly TextBlock _status = new() { Margin = new Thickness(0, 8, 0, 0), TextWrapping = TextWrapping.Wrap };
    private static readonly System.Windows.Media.Brush Greyed = new SolidColorBrush(System.Windows.Media.Color.FromRgb(128, 128, 128));

    public IReadOnlyList<PlannedView> Views { get; private set; } = new List<PlannedView>();
    public IReadOnlyList<PinRow> Pins { get; private set; } = new List<PinRow>();

    public AnnotatePreviewWindow(IReadOnlyList<PlannedView> views, IReadOnlyList<PinRow> pins, IReadOnlyList<string> words)
    {
        Title = "Sentinel — Annotate: views and pins";
        Width = 760; Height = 680; MinWidth = 480; MinHeight = 380;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var header = new TextBlock
        {
            Text = string.Join("\n", words) + "\n\nPre-ticked: a floor plan and an RCP for each story level (the guideline's first FloorPlan and " +
                   "CeilingPlan entries), and every unpinned story level and grid. The rest are listed for you to tick; a greyed row says why it cannot be created.",
            TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 8),
        };

        var tree = new TreeView { BorderThickness = new Thickness(0) };
        foreach (var level in views.GroupBy(v => v.LevelName))
        {
            bool story = level.First().IsStory;
            var node = new TreeViewItem
            {
                Header = $"{level.Key}{(story ? "" : " — not a Building Story")} — {level.Count()} view(s)",
                IsExpanded = story, FontWeight = FontWeights.Bold,
            };
            foreach (var v in level)
            {
                string template = string.IsNullOrWhiteSpace(v.Template) ? "no template named"
                    : v.TemplateInModel ? "template " + v.Template : "template " + v.Template + " not in this model — created without it";
                var box = Row(node, $"{v.Name ?? "(no name)"}  ·  {v.Use}  ·  {template}", v.PreTicked, v.Refusal);
                if (v.Refusal == null) _views.Add((box, v));
            }
            tree.Items.Add(node);
        }
        var pinNode = new TreeViewItem { Header = $"Pin — {pins.Count} unpinned level(s) and grid(s)", IsExpanded = true, FontWeight = FontWeights.Bold };
        foreach (var p in pins)
        {
            var box = Row(pinNode, p.Label, p.PreTicked, p.Refusal);
            if (p.Refusal == null) _pins.Add((box, p));
        }
        tree.Items.Add(pinNode);

        var create = new Button { Content = "Create ▶", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0), IsDefault = true };
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(10, 5, 10, 5), IsCancel = true };
        create.Click += (_, __) => Accept();
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
        buttons.Children.Add(create);
        buttons.Children.Add(cancel);
        var footer = new StackPanel();
        footer.Children.Add(_status);
        footer.Children.Add(buttons);

        var root = new DockPanel { Margin = new Thickness(14) };
        DockPanel.SetDock(header, Dock.Top);
        DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(header);
        root.Children.Add(footer);
        root.Children.Add(tree);
        Content = root;
        ShowCount();
    }

    private CheckBox Row(TreeViewItem node, string text, bool ticked, string? refusal)
    {
        var box = new CheckBox { IsChecked = refusal == null && ticked, IsEnabled = refusal == null, VerticalAlignment = VerticalAlignment.Center };
        box.Click += (_, __) => ShowCount();
        var label = new TextBlock
        {
            Text = refusal == null ? text : text + "  —  " + refusal,
            Margin = new Thickness(6, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.Normal,
        };
        if (refusal != null) label.Foreground = Greyed;
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(box);
        row.Children.Add(label);
        node.Items.Add(new TreeViewItem { Header = row, Focusable = false, FontWeight = FontWeights.Normal });
        return box;
    }

    private void ShowCount() =>
        _status.Text = $"{_views.Count(r => r.Box.IsChecked == true)} of {_views.Count} creatable view(s) and " +
                       $"{_pins.Count(r => r.Box.IsChecked == true)} of {_pins.Count} datum(s) to pin are ticked.";

    private void Accept()
    {
        Views = _views.Where(r => r.Box.IsChecked == true).Select(r => r.View).ToList();
        Pins = _pins.Where(r => r.Box.IsChecked == true).Select(r => r.Pin).ToList();
        DialogResult = true;
        Close();
    }
}
```

`Create` `SentinelAddin/Commands.Annotate.cs` (it replaces the whole file):

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Annotate — step 3 of the datum → model → annotate chain (MA-2e: audit DAT-3, ANV-1, ANV-2). Plans the WIP plan views the
/// `views` section of the guideline@n installed on the document's web project (or its office) prescribes — levels × its
/// FloorPlan and CeilingPlan entries, each named from the project's View rule tokens or the fixed WIP_ name and judged by Scan
/// Now's own rule before anything is created (ViewPlanner) — and the unpinned levels and grids; shows them in one preview (a
/// story level × the first floor plan and ceiling plan entries, and story levels and grids, pre-ticked; a refused row says why);
/// writes the ticked rows inside one SentinelUndo group, each view in its own SubTransaction so one failure rolls back that view
/// only; then reads back what the model holds, kept or not (review C2). With no guideline it refuses and names the none — it never
/// plans another office's views (cohesion 4b-2, F44); with the ruleset not loaded yet it refuses too (review C1). B31 (spec
/// amendment S1, review C3): Revit may empty its Undo list after views are named, so the preview and the result always say the
/// annotate ledger row, which names the views and datums, is then the record.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class AnnotateViewsCommand : IExternalCommand
{
    private const string Title = "Sentinel — Annotate";

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        // guideline@n for this document's project (or its office): the key is read here on the API thread, the GET
        // runs off it and the command waits (4 s cap), as Governed Publish waits on /propose.
        string key = ProjectContext.For(doc).Key;
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false)).GetAwaiter().GetResult();
        var guideline = standards.Guideline;
        string guidelineLabel = standards.GuidelineSource.Label;

        var nothing = ViewPlanner.NothingToPlan(guidelineLabel, standards.GuidelineSource.Origin != "none", guideline.Views);
        if (nothing != null)
        {
            TaskDialog.Show(Title, nothing);
            return Result.Cancelled;
        }

        // The levels as the next-story rule reads them — the one projection (MA-1a review C6) — lowest first. Building Story is
        // read there, never set here (DAT-2).
        var stories = ChangesetExecutor.Stories(doc).OrderBy(l => l.ElevationMm).ToList();
        if (stories.Count == 0)
        {
            TaskDialog.Show(Title, "No Levels in the model — run Datum from Drawings first.");
            return Result.Cancelled;
        }
        var storyNames = new HashSet<string>(stories.Where(l => l.IsStory).Select(l => l.Name));

        // ANV-1 (F4, review C1): the ruleset Scan Now judges this document by, as App.ReloadRuleset cached it — no network call
        // here. "Not loaded yet" is never read as none (the names would go unjudged): Annotate refuses, saying so. An installed
        // none (Has is true) plans the fixed names, and the preview says they are not checked.
        if (App.Engine is not RuleEngineHost engine || !engine.Has(doc))
        {
            TaskDialog.Show(Title, "The project's ruleset has not loaded yet, so the view names cannot be judged by Scan Now's rule. Run Scan Now, then Annotate again. Nothing was created.");
            return Result.Cancelled;
        }
        var ruleset = engine.RulesetFor(doc);
        string rulesetLabel = engine.SourceFor(doc).Label;

        var allViews = new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().ToList();
        // Template names too: View.Name = … throws when a VIEW TEMPLATE already holds that name.
        var taken = new HashSet<string>(allViews.Select(v => v.Name));
        var templates = allViews.Where(v => v.IsTemplate).GroupBy(v => v.Name).ToDictionary(g => g.Key, g => g.First());
        var plans = ViewPlanner.Plan(guideline.Views, guideline.ViewNaming, stories.Select(l => (l.Name, l.IsStory)).ToList(), ruleset, taken);
        if (plans.Count == 0)
        {
            TaskDialog.Show(Title, $"Guideline: {guidelineLabel}\nIts views section has no plannable (FloorPlan/CeilingPlan) entries — nothing to create.");
            return Result.Cancelled;
        }

        // F6: the model's default floor plan and ceiling plan view types; none → the row is refused by name.
        var viewType = new Dictionary<string, ElementId>
        {
            ["FloorPlan"] = doc.GetDefaultElementTypeId(ElementTypeGroup.ViewTypeFloorPlan),
            ["CeilingPlan"] = doc.GetDefaultElementTypeId(ElementTypeGroup.ViewTypeCeilingPlan),
        };
        foreach (var p in plans)
        {
            p.TemplateInModel = !string.IsNullOrWhiteSpace(p.Template) && templates.ContainsKey(p.Template);
            if (p.Refusal == null && viewType[p.ViewType] == ElementId.InvalidElementId)
            {
                p.Refusal = $"this model has no default {(p.ViewType == "CeilingPlan" ? "ceiling plan" : "floor plan")} view type";
                p.PreTicked = false;
            }
        }

        // DAT-3 (F3 A, F7, review C7): every unpinned level and grid; one another user owns, or one changed or deleted in central
        // (either would fail the commit and roll every view back), is listed unticked with the reason.
        var datums = new FilteredElementCollector(doc).OfClass(typeof(Level)).ToElements()
            .Concat(new FilteredElementCollector(doc).OfClass(typeof(Grid)).ToElements())
            .Select(e => new DatumFact
            {
                Id = e.Id.IdValue(), Kind = e is Level ? "Level" : "Grid", Name = e.Name, Pinned = e.Pinned,
                IsStory = e is Level && storyNames.Contains(e.Name),
                OwnedBy = doc.IsWorkshared && WorksharingUtils.GetCheckoutStatus(doc, e.Id) == CheckoutStatus.OwnedByOtherUser
                    ? WorksharingUtils.GetWorksharingTooltipInfo(doc, e.Id).Owner : null,
                ChangedInCentral = doc.IsWorkshared
                    && WorksharingUtils.GetModelUpdatesStatus(doc, e.Id) is ModelUpdatesStatus.UpdatedInCentral or ModelUpdatesStatus.DeletedInCentral,
            }).ToList();
        var pins = ViewPlanner.Pins(datums);

        var words = new List<string> { "Guideline: " + guidelineLabel, ViewPlanner.RuleLine(ruleset, rulesetLabel) };
        if (storyNames.Count == 0) words.Add("No level in this model is a Building Story — nothing is pre-ticked; tick the rows you want.");
        words.Add(ViewPlanner.UndoWords());

        // A person decides: nothing is written before Create; Cancel writes nothing.
        var pick = new AnnotatePreviewWindow(plans, pins, words);
        DialogOwner.Attach(pick, c);
        if (pick.ShowDialog() != true) return Result.Cancelled;
        if (pick.Views.Count + pick.Pins.Count == 0)
        {
            TaskDialog.Show(Title, "Nothing was ticked — nothing was created or pinned.");
            return Result.Cancelled;
        }

        var levelId = new FilteredElementCollector(doc).OfClass(typeof(Level)).ToElements()
            .GroupBy(l => l.Name).ToDictionary(g => g.Key, g => g.First().Id);
        string[] routeParams = OrgNames.MainGroupParams(App.OrgFor(doc));
        var created = new List<string>();
        var failed = new List<string>();
        var warnings = new List<string>();
        int unrouted = 0, claimedPins = 0;
        bool committed = false, kept;
        string? thrown = null;
        // XC-2 and spec amendment S1: one Sentinel action, one group — the views and the pins.
        try
        {
            kept = SentinelUndo.Run(doc, "Annotate views", () =>
            {
                using var t = new Transaction(doc, "Sentinel — Annotate: guideline views");
                t.Start();
                foreach (var p in pick.Views)
                {
                    // ANV-2 (E4): one view's failure rolls back that view only and is named; the rest are still created.
                    using var st = new SubTransaction(doc);
                    st.Start();
                    try
                    {
                        if (!NamingUtils.IsValidName(p.Name)) throw new InvalidOperationException("Revit refuses this view name");
                        var view = ViewPlan.Create(doc, viewType[p.ViewType], levelId[p.LevelName]);
                        view.Name = p.Name;
                        if (p.TemplateInModel) view.ViewTemplateId = templates[p.Template].Id;
                        bool routed = string.IsNullOrWhiteSpace(p.BrowserStatus) || ViewGenerator.SetFirstMatch(view, routeParams, p.BrowserStatus);
                        if (st.Commit() != TransactionStatus.Committed) throw new InvalidOperationException("Revit did not commit this view");
                        created.Add(p.Name);
                        if (!routed) unrouted++;
                        if (!p.TemplateInModel && !string.IsNullOrWhiteSpace(p.Template))
                            warnings.Add($"View template '{p.Template}' not in this model — '{p.Name}' created without it.");
                    }
                    catch (Exception ex)
                    {
                        if (st.HasStarted() && !st.HasEnded()) st.RollBack();
                        failed.Add($"'{p.Name}': {ex.Message}");
                    }
                }
                foreach (var pin in pick.Pins)
                {
                    try
                    {
                        var e = doc.GetElement(pin.Id.ToElementId()) ?? throw new InvalidOperationException("no longer in the model");
                        e.Pinned = true;
                        claimedPins++;
                    }
                    catch (Exception ex) { failed.Add($"{pin.Label}: {ex.Message}"); }
                }
                committed = t.Commit() == TransactionStatus.Committed;
                return committed && created.Count + claimedPins > 0;
            });
        }
        // Review C2: a group whose commit or rollback Revit refuses gets the same read-back as one not kept.
        catch (Autodesk.Revit.Exceptions.InvalidOperationException ex) { kept = false; thrown = ex.Message; }

        // Review C2 — claimed vs verified: what the model holds after the group, kept or not, is what the result and the row say.
        var present = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<View>()
            .Where(v => !v.IsTemplate && created.Contains(v.Name)).Select(v => v.Name).ToList();
        var pinnedNow = pick.Pins.Select(p => doc.GetElement(p.Id.ToElementId())).Where(e => e != null && e.Pinned).ToList();
        int pinnedLevels = pinnedNow.Count(e => e is Level), pinnedGrids = pinnedNow.Count - pinnedLevels;
        if (!kept && present.Count + pinnedNow.Count == 0)
        {
            string why = thrown != null ? "Revit refused the Undo group: " + thrown
                : !committed ? "Revit did not commit the transaction (a view or a datum it needs may be owned by another user)."
                : created.Count + claimedPins == 0 ? "every ticked row failed:\n  • " + string.Join("\n  • ", failed)
                : "Revit did not keep the Undo group.";
            TaskDialog.Show(Title, "Nothing was created or pinned — " + why + "\nRead back from the model: no view or pin of this run is in it — the model is as it was.");
            return Result.Failed;
        }

        // S3 (review C6) — the substitute for MH-LNK-01 (not in code): every level and grid, read after the commit; links are not read (K7).
        var levelsNow = new FilteredElementCollector(doc).OfClass(typeof(Level)).ToElements();
        var storiesNow = levelsNow.Where(l => storyNames.Contains(l.Name)).ToList();
        var othersNow = levelsNow.Where(l => !storyNames.Contains(l.Name)).ToList();
        var gridsNow = new FilteredElementCollector(doc).OfClass(typeof(Grid)).ToElements();
        string pinnedLine = ViewPlanner.PinnedLine(storiesNow.Count(l => l.Pinned), storiesNow.Count, othersNow.Count(l => l.Pinned), othersNow.Count,
            gridsNow.Count(g => g.Pinned), gridsNow.Count);

        int skippedExisting = plans.Count(p => p.Refusal == ViewPlanner.Existing);
        int refused = plans.Count(p => p.Refusal != null) - skippedExisting;
        int levelsWithViews = pick.Views.Where(p => present.Contains(p.Name)).Select(p => p.LevelName).Distinct().Count();
        // MA-1a item 7: one annotate row for the run, sent off this thread; the pane's log says what the ledger answered. Review C4: it
        // names the views and datums the model holds, so it is the record when Revit did not keep the Undo group (B31).
        GovernedNotify.Report("Annotate", CommandReports.Annotate(present, levelsWithViews, skippedExisting, refused, failed.Count, unrouted, pinnedLevels, pinnedGrids,
            warnings.Count, storyNames.Count, pinnedNow.Select(e => e.Id.IdValue()).ToList(), pinnedLine, kept, guidelineLabel, rulesetLabel, UserSession.Actor), key);

        var sb = new StringBuilder();
        if (!kept)
            sb.AppendLine($"Revit committed the views but did not keep the Undo group (B31?): {present.Count} view(s) and {pinnedNow.Count} pin(s) are in the model — the annotate ledger row is the record.").AppendLine();
        sb.AppendLine(words[0]).AppendLine(words[1]);
        sb.AppendLine($"Created: {present.Count} view(s). Pinned: {pinnedLevels} level(s) and {pinnedGrids} grid(s).");
        sb.AppendLine(pinnedLine);
        if (skippedExisting + refused > 0) sb.AppendLine($"Not created, as the preview said: {skippedExisting} already in the model, {refused} refused with a reason.");
        if (unrouted > 0) sb.AppendLine($"Not routed in the Project Browser: {unrouted} view(s) — no writable {string.Join(" / ", routeParams)} parameter.");
        if (failed.Count > 0)
        {
            sb.AppendLine().AppendLine("Failed (each rolled back alone; the rest were kept):");
            foreach (var f in failed) sb.AppendLine("  • " + f);
        }
        if (warnings.Count > 0)
        {
            sb.AppendLine().AppendLine("Warnings:");
            foreach (var g in warnings.GroupBy(w => w))
                sb.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        sb.AppendLine().AppendLine(ViewPlanner.UndoWords());
        sb.AppendLine().Append("Scan Now judges the new view names by the same rule.");
        TaskDialog.Show(Title, sb.ToString());
        return Result.Succeeded;
    }
}
```

In `SentinelAddin/Commands.Datum.cs`, replace

```csharp
            "\n\nRename them to your office's own labels in the Project Browser if needed, then model — " +
            "elements will host to these levels.");
```

with

```csharp
            "\n\nRename them to your office's own labels in the Project Browser if needed, then model — " +
            "elements will host to these levels." +
            "\n\nNext: 3 · Annotate Views pins the story levels and grids and makes a floor plan and an RCP for each story level (it shows the rows first).");
```

- [ ] **Step 4: Run them, and see them pass.** `dotnet run --project tools/annotate-check` — `53/53 checks pass` then `ALL PASS` (dry run). `dotnet run --project tools/promote-check` — `678/678 checks pass` (dry run: master's 677 and the `MaxRecord` cap's check, review C4). Then both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` — `0 Error(s)`, `5 Warning(s)` (master's); `-p:RevitVersion=2026` — `0 Error(s)` (the warnings on Revit 2026 vary with the build's state; the rule is **no warning in a file MA-2e touches** — the dry run's `--no-incremental` rebuilds listed only master's: on 2024 `ChangesetExecutor.cs` and `Commands.GhostBuilder.cs` CS0618, `Commands.BcfIssues.cs` CS4014, `RuleRegex.cs` CS8602 ×2; on 2026 `Commands.BcfIssues.cs` CS4014).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/Commands.Annotate.cs SentinelAddin/UI/AnnotatePreviewWindow.cs SentinelAddin/Coordination/CommandReports.cs SentinelAddin/Commands.Datum.cs tools/annotate-check/Check.cs tools/promote-check/Reports.cs
git commit -F - <<'EOF'
feat(annotate): MA-2e - one preview (views by level, unpinned levels and grids, refusals said), one SentinelUndo group with a SubTransaction per view, the default view types, the pins read back, the annotate row's new fields; Datum names Annotate as the next step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 3 — TS: the view planner's twin retired (F5)

**Files:**
- Modify `WebApp/src/sentinel-core/guideline.ts` — `tokens?` on `GuidelineViewStandard`; the `structure` comment; `PlannedView`, `PLANNABLE`, `planViews` deleted
- Delete `WebApp/src/sentinel-core/view-plan.test.ts`
- Rebuild `WebApp/bridge/sentinel-core.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GuidelineViewStandard.tokens?: Record<string, string>` (TS). `planViews` and `PlannedView` no longer exported (no caller: `grep -rn "planViews\|PlannedView" WebApp/src WebApp/bridge --include=*.ts --include=*.mjs` showed only `guideline.ts`, `view-plan.test.ts` and the bundle).

- [ ] **Step 1: The check.** The retirement's check is that nothing else used the twin: delete the test first and see the core suite still pass. `git rm WebApp/src/sentinel-core/view-plan.test.ts`; then from `WebApp`: `npx vitest run src/sentinel-core` — `30 passed (30)` files, `275 passed (275)` tests (master: 31 and 279; `view-plan.test.ts` held 4).

- [ ] **Step 2: The twin.**

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
  namePrefix?: string;                              // e.g. "FP" — absent means not plannable
  tag?: string[];                                   // categories to tag automatically
}
```

with

```ts
  namePrefix?: string;                              // e.g. "FP" — absent (and no tokens) means not plannable
  tag?: string[];                                   // categories to tag automatically
  // MA-2e (ANV-1, F1 A): the View rule's tokens this entry fills, e.g. {DISC: "ARC", LEVEL: "{level}", TYPE: "PLAN", DESC: "GA"};
  // "{level}" is the level's name verbatim. Read by the add-in's ViewPlanner (the only view planner).
  tokens?: Record<string, string>;
}
```

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
  // Documentation only for now — the actual naming is fixed to [STATUS]_[TYPE]_[LEVEL] (see planViews /
  // SentinelAddin ViewPlanner.cs); this field isn't read to drive that format.
```

with

```ts
  // Documentation only — a view's name is the View rule's tokens from the entry's `tokens`, or the fixed
  // WIP_<namePrefix>_<LEVEL> (SentinelAddin ViewPlanner.cs, MA-2e); this field isn't read to drive either.
```

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
/** One planned WIP view, one per plannable guideline entry per level. */
export interface PlannedView {
  name: string;
  use: string;
  viewType: string;
  levelName: string;
  template?: string;
  browserStatus?: string;
}

```

with nothing (the empty string).

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
const PLANNABLE = new Set(["FloorPlan", "CeilingPlan"]);

/** Deterministic WIP view plan: one view per plannable guideline entry per level.
 *  Name follows the office structure [STATUS]_[TYPE]_[LEVEL] (description omitted). */
export function planViews(
  views: GuidelineViewStandard[] | undefined,
  naming: GuidelineViewNaming | undefined,
  levelNames: string[],
): PlannedView[] {
  if (!views || !naming || levelNames.length === 0) return [];
  const status = "WIP_";
  const browserStatus = naming.statusPrefixes?.[status];
  const out: PlannedView[] = [];
  for (const v of views) {
    if (!v.namePrefix || !PLANNABLE.has(v.viewType)) continue;
    for (const level of levelNames) {
      const levelToken = level.trim().toUpperCase().replace(/\s+/g, "-");
      out.push({
        name: `${status}${v.namePrefix}_${levelToken}`,
        use: v.use,
        viewType: v.viewType,
        levelName: level,
        template: v.wipTemplate,
        browserStatus,
      });
    }
  }
  return out;
}
```

with nothing (the empty string). The file then ends in a blank line (`}`, then an empty line): remove it, so the file ends in `}` and one line break.

- [ ] **Step 3: Rebuild the bundle, and see the core pass.** From `WebApp`: `npm run build:bridge-core` (esbuild: `bridge/sentinel-core.mjs` written, no error); `grep -c planViews bridge/sentinel-core.mjs` prints `0` (master: `2`); **review C9:** `git diff --numstat bridge/sentinel-core.mjs` prints `0	23` — 0 lines added, and every removed line is in the `PLANNABLE` / `planViews` region or the `planViews,` export (dry run: exactly that; master's bundle was current against `src`, a rebuild before Task 3 changed nothing). Otherwise stop: `git checkout -- bridge/sentinel-core.mjs`, keep only the `tokens?` change (restore `planViews`, `PLANNABLE`, `PlannedView` and `view-plan.test.ts`; types are erased, so `tokens?` alone needs no rebuild) and say so in the commit — the retirement then waits for a bundle that is current; `npx vitest run src/sentinel-core` — `30 passed (30)`, `275 passed (275)`; `npx vitest run bridge` — every file passes (it imports the rebuilt bundle). Then `git status --short`: if `bridge/fixtures/lod-matrix/ids-cases.json` shows modified and `git diff --ignore-all-space --stat` on it is empty, `git checkout -- bridge/fixtures/lod-matrix/ids-cases.json`.

- [ ] **Step 4: Commit.**

```bash
git add WebApp/src/sentinel-core/guideline.ts WebApp/src/sentinel-core/view-plan.test.ts WebApp/bridge/sentinel-core.mjs
git commit -F - <<'EOF'
refactor(core): MA-2e - the TS view planner retired (planViews had no caller; the add-in's ViewPlanner is the only one); a guideline view entry's tokens typed; bridge bundle rebuilt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4 — Words: the design doc and the audit; the final checks

**Files:**
- Modify `docs/strategy/2026-09-30-model-automation-design.md`
- Modify `docs/strategy/2026-09-30-revit-addin-audit.md`

- [ ] **Step 1: The design doc and the audit say what was built.**

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - DAT-3, ANV-1, ANV-2: plans for each story with the office templates, datums pinned. They run as their own batch, because Revit may empty the Undo list after view actions. Moved to MA-2e (MA-2d plan, founder decision F7).
```

with

```markdown
  - DAT-3, ANV-1, ANV-2: plans for each story with the office templates, datums pinned. They run as their own batch, because Revit may empty the Undo list after view actions. Moved to MA-2e (MA-2d plan, founder decision F7). BUILT on `feature/ma2e-storey-plans`, drill MA2e pending (plan `docs/superpowers/plans/2026-10-03-ma2e-storey-plans-datums.md`): Annotate's one preview lists levels × the guideline's plan and ceiling plan entries (story levels × the first of each pre-ticked) and the unpinned levels and grids (story levels and grids pre-ticked); names come from the View rule's tokens on the guideline's view entry (`tokens`, `{level}` verbatim) or the fixed `WIP_` name, judged by Scan Now's rule before anything is created and refused with the reason; one `SentinelUndo` group, a `SubTransaction` per view; the views and `Pinned` read back after the group, kept or not (MH-LNK-01's substitute, every level and grid; links not checked); the preview and the result say B31's words in every model, and the `annotate` row names the views and datums, so it is the record when Revit empties its Undo list; with the ruleset not loaded yet Annotate refuses.
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| 1 | Datum right: story levels flagged and pinned, one plan per story. View actions may empty Revit's Undo list (B31), so they run in their own batch | `ViewPlan.Create`, `Element.Pinned` | DAT-3, ANV-1, ANV-2 | MA-2 |
```

with

```markdown
| 1 | Datum right: story levels flagged and pinned, one plan per story. View actions may empty Revit's Undo list (B31), so they run in their own batch. MA-2e: pinned and planned in Annotate (BUILT on `feature/ma2e-storey-plans`, drill MA2e pending); the flag is read, never set (DAT-2) | `ViewPlan.Create`, `Element.Pinned` | DAT-3, ANV-1, ANV-2 | MA-2 |
```

In `docs/strategy/2026-09-30-revit-addin-audit.md`, replace

```markdown
| DAT-3 | Floor and ceiling plans for each story level. Pin every level and grid created. | S | med | `ViewPlan.Create`, `Element.Pinned` | Each new story level has one floor plan and one RCP, and MH-LNK-01 reports 0 unpinned. | MH-LNK-01, R-07 |
```

with

```markdown
| DAT-3 | Floor and ceiling plans for each story level. Pin every level and grid created. | S | med | `ViewPlan.Create`, `Element.Pinned` | Each new story level has one floor plan and one RCP, and MH-LNK-01 reports 0 unpinned. **MA-2e (BUILT on `feature/ma2e-storey-plans`, drill MA2e pending):** in Annotate, after Datum (spec amendment S2); MH-LNK-01 is not in code — the result's `Pinned now: x/y story level(s), p/q other level(s), a/b grid(s)` read-back stands in (S3). | MH-LNK-01, R-07 |
```

In `docs/strategy/2026-09-30-revit-addin-audit.md`, replace

```markdown
| ANV-1 | Fill the project's View rule tokens from the guideline and the level. Refuse, with the reason, when a token is missing. | M | high | `ViewPlan.Create`, `View.Name`; existing token compiler | Scan Now reports 0 View naming violations for the created views (closes F44). | — |
| ANV-2 | Preview levels × types with name, template status and validity. Story levels are pre-ticked. A per-view try/catch. | S | high | `LEVEL_IS_BUILDING_STORY`, `NamingUtils.IsValidName` (in 2021 API), `ViewPlan.Create` | Only story-level views are created. A ":" in the prefix is reported and skipped, and the rest are still created. | — |
```

with

```markdown
| ANV-1 | Fill the project's View rule tokens from the guideline and the level. Refuse, with the reason, when a token is missing. | M | high | `ViewPlan.Create`, `View.Name`; existing token compiler | Scan Now reports 0 View naming violations for the created views (closes F44). **MA-2e (BUILT on `feature/ma2e-storey-plans`, drill MA2e pending):** a guideline view entry's `tokens` (`{level}` verbatim, founder decision F1 A), judged by Scan Now's cached ruleset before create. | — |
| ANV-2 | Preview levels × types with name, template status and validity. Story levels are pre-ticked. A per-view try/catch. | S | high | `LEVEL_IS_BUILDING_STORY`, `NamingUtils.IsValidName` (in 2021 API), `ViewPlan.Create` | Only story-level views are created. A ":" in the prefix is reported and skipped, and the rest are still created. **MA-2e (BUILT on `feature/ma2e-storey-plans`, drill MA2e pending):** story levels × the first FloorPlan and CeilingPlan entries pre-ticked (S4); a `SubTransaction` per view. | — |
```

- [ ] **Step 2: The final checks.** From the repo root, every tracked check project (26):

```bash
for d in tools/*-check; do printf '%s: ' "$d"; dotnet run --project "$d" 2>&1 | tail -1; done
```

Expected: every line ends in a pass (`annotate-check` `ALL PASS` after `53/53 checks pass`, `promote-check` `678/678 checks pass`, `datum-check DATUM OK`, `pane-layout-check 349/349`, the rest as on master — the amender's dry run, Tasks 1–3 applied: all 26 pass). **Review C8:** builds Revit 2022, 2023, 2024, 2025, 2026 and 2027 (as MA-2d's merge did; MA-2e adds net48-sensitive code), each `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false`: `0 Error(s)`, and no warning in a file MA-2e touches (dry run, `--no-incremental`: 2022 and 2023 `3 Warning(s)` — `Commands.BcfIssues.cs` CS4014, `RuleRegex.cs` CS8602 ×2; 2024 `5` — those and `ChangesetExecutor.cs`, `Commands.GhostBuilder.cs` CS0618; 2025 and 2026 `1` — CS4014; 2027 `3` — CS4014 and `NU1510` on the csproj's package references; all master's). `git status --short` shows nothing but the two docs (restore `ids-cases.json` as in Global Constraints if a vitest run touched it).

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md docs/strategy/2026-09-30-revit-addin-audit.md
git commit -F - <<'EOF'
docs: MA-2e - the design doc and the audit rows DAT-3, ANV-1, ANV-2 say what was built (drill MA2e pending)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Live drill MA2e (Revit 2024, scratch copies only — on the branch, before the merge)

**The founder's OK first.** The set-up's build deploys the branch's add-in into Revit 2024. That needs the founder's explicit OK in chat for this drill; without it, nothing below runs and every row is **owed**.

**Who does what.** The drill runner drives Revit by mouse (or UI Automation's Invoke, as in MA2c/MA2d). The drill runs in whichever sign-in state the PC is in; the state found is recorded, and the other state is **owed** (the actor on the `annotate` row) — never passed. Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window. Open the scratch copies from Revit's Open dialog or Recent: the `.rvt` association drops the file (MA2d D1).

**The Revit MCP in this drill:** only its read-only calls — `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`, `get_available_family_types` — and never while a Revit command, a TaskDialog or a Sentinel window is open.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run in this drill (tight scope); the code is the same on net8/net10 and builds there (Task 4). Owed.
- **Signed in or signed out**: whichever this session does not run (the `annotate` row's actor).
- **A view that throws inside its SubTransaction** (the per-view catch, E4): no row can make `ViewPlan.Create` throw on demand once the planner refuses ':' and duplicates; owed, recorded if it ever happens (UNSURE 6). V-3 proves the ':' row refused and the rest created.
- **WS-1** — retired by review C3 (B31's words are said in every model; no workshared row is needed). UNSURE 7 (pinning in a workshared copy) is owed with F7.
- **F7, owned or out-of-date datums** (review C7): not provokable on a detached copy — owed.
- **AST-1** — retired by review C10: the 4b-2 guard is unchanged and checked offline (three `NothingToPlan` checks and the scan that it refuses before the preview opens); not required for the merge.
- **A real MH-LNK-01 rule and links** (S3, K7): Next.
- **`token_aliases` as a LEVEL source** (F1 C): Next.

**Set-up (once):**
- **Build.** Close Revit. Record the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`, lower case) and the commit it was built from, if known — else "unknown". With the founder's OK: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build into Revit 2024; the closing list puts master's back). Record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The add-in's bridge settings.** Copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma2ebak` beside it. The file holds the file token: never print it, never open it in a viewer.
- **The test bridge on 127.0.0.1:4101** (4101 keeps the drill's scratch keys off the founder's 4100). From `WebApp`:
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
- **The drill's files**, in `Documents\Sentinel drills\ma2e\` (never committed). From `WebApp`, after `D="$(cygpath -m "$HOME/Documents/Sentinel drills/ma2e")"; mkdir -p "$D"`:
  - the aster-style guideline (V-2): the BDS guideline with `tokens` on GA Plan and RCP — `node -e 'const fs = require("fs"), d = process.argv[1], g = JSON.parse(fs.readFileSync("../demo/bds-pilot/bds-guideline.json", "utf8")), pick = u => { const r = g.views.filter(v => v.use === u); if (r.length !== 1) throw new Error(u + " entries: " + r.length); return r[0]; }; pick("GA Plan").tokens = { DISC: "ARC", LEVEL: "{level}", TYPE: "PLAN", DESC: "GA" }; pick("RCP").tokens = { DISC: "ARC", LEVEL: "{level}", TYPE: "RCP", DESC: "Ceiling" }; fs.writeFileSync(d + "/guideline-ast.json", JSON.stringify(g)); console.log("guideline-ast.json", g.views.length)' "$D"` — prints `guideline-ast.json 16`;
  - the ':' guideline (V-3): `node -e 'const fs = require("fs"), d = process.argv[1], g = JSON.parse(fs.readFileSync("../demo/bds-pilot/bds-guideline.json", "utf8")), r = g.views.filter(v => v.use === "GA Plan"); if (r.length !== 1) throw new Error("GA Plan entries: " + r.length); r[0].namePrefix = "F:P"; fs.writeFileSync(d + "/guideline-colon.json", JSON.stringify(g)); console.log("guideline-colon.json", g.views.length)' "$D"` — prints `guideline-colon.json 16`.
- **The scratch web projects.** Nothing is installed on `demo`, `bds-office` or any real office.
  - `b4101 POST cde/projects '{"key":"ma2e-office","kind":"office"}'`; then, each `{"key":"<k>","office_key":"ma2e-office"}`, the projects `ma2e` (V-1), `ma2e-ast` (V-2), `ma2e-colon` (V-3).
  - On the OFFICE: `b4101 PUT "cde/ma2e-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-guideline.json` (201, `guideline@1`), `b4101 PUT "cde/ma2e-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json` (201, `ruleset@1`).
  - On `ma2e-ast` (its own, over the office's): `b4101 PUT "cde/ma2e-ast/artefacts/guideline?actor=drill" "@$D/guideline-ast.json"`, `b4101 PUT "cde/ma2e-ast/artefacts/ruleset?actor=drill" @../demo/aster/ruleset-AST.json`. On `ma2e-colon`: `b4101 PUT "cde/ma2e-colon/artefacts/guideline?actor=drill" "@$D/guideline-colon.json"`. Each answers 201; a refusal of the `tokens` field is F-MA2e-n (the scout found the bridge checks only that `views` is an array).
  - **If the session is signed in**: `b4101 POST cde/<key>/members '{"email":"<the account e-mail>","role":"lead"}'` for the office and the three projects; record each reply.
- **The scratch models**, in `Documents\Sentinel drills\ma2e\`, each a copy of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), opened from Revit's Open dialog, bound with Sentinel ▸ Project Setup (current-project scope), never saved: `ma2e-a.rvt` → `ma2e`; `ma2e-b.rvt` → `ma2e-ast`; `ma2e-c.rvt` → `ma2e-colon`.
- After binding each model, run **Scan Now** once (it loads the ruleset Annotate reads, F4; before it lands Annotate refuses — review C1, checked offline).

**Record before the first row**, on `ma2e-a.rvt`: Scan Now's View naming rows (VN-01: their count and the names); the pane's pending change requests (their count); Revit's Undo list (the arrow beside Undo: its entries, or that it is empty); by mouse, each level's **Building Story** (select it in an elevation, Properties) and whether it is pinned, and each grid's pin — K4, UNSURE 2.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| V-1 | On `ma2e-a.rvt`: Sentinel ▸ 3 · Annotate Views; read the preview; **Create** with the pre-ticks only | The preview's words: `Guideline: guideline@1 · office · …`, `View names are checked against VN-01 (ruleset ruleset@1 · office · …) — Scan Now's own rule.`, and the B31 line `Revit may empty its Undo list after views are named (B31) — if Edit ▸ Undo does not list "Sentinel: Annotate views", …` (review C3: every model); per story level, `WIP_FP_<LEVEL>` and `WIP_RCP_<LEVEL>` ticked, the PP, BUA, QA and END rows unticked, `Presentation Plan (no colour)` greyed with `same name as 'Presentation Plan' on <level>`; a level that is not a Building Story collapsed, every row unticked; the Pin group: every unpinned story level and grid ticked. After Create, ONE result dialog: `Created: <2 × story levels> view(s). Pinned: <k> level(s) and <g> grid(s).` and `Pinned now: s/s story level(s), p/q other level(s), g/g grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).` (S3: x = y and a = b; p/q recorded); the B31 line; no `Failed` block and no `did not keep the Undo group` line; Scan Now: the VN-01 rows are the ones recorded before — none names a created view (ANV-1, closes F44); the pane's pending change requests: the count recorded before (the DMU raised none, UNSURE 4); `b4101 GET "cde/ma2e/audit?entity_type=annotate&limit=1"`: ONE row whose `views_created`, `pinned_levels`, `pinned_grids` match the dialog, `views` equals the dialog's created names (review C4), `pinned_ids` has `pinned_levels + pinned_grids` ids, `pinned_now` equals the dialog's `Pinned now:` line, `undo_group_kept` is `true`, `ruleset` names `ruleset@1`, `story_levels` = the story levels | The preview's words and its row counts per group; the result's text; the VN-01 and change-request counts before and after; the row's id and fields; the Undo list after (its top entry `Sentinel: Annotate views`, or empty — UNSURE 1); whether Revit warned |
| V-1R | Run Annotate again on `ma2e-a.rvt`; read; **Cancel** | Every row V-1 created reads `already in the model (a view or a view template holds this name)`, greyed; the Pin group lists no story level and no grid it pinned; Cancel writes nothing (the Undo list as after V-1) | The two groups' counts |
| U-1 | Edit ▸ Undo once (if the list is not empty); run Annotate; read; **Cancel** | One Undo takes every view and pin of V-1 back: the preview lists V-1's rows as creatable and its datums as unpinned again. **If the Undo list was empty after V-1** (Revit flushed it in a model that is not workshared): U-1 is a record, not a failure of XC-2 — the B31 words were already said (review C3), and V-1's row names what to delete or unpin by hand | The Undo list before and after; the preview's counts |
| V-2 | On `ma2e-b.rvt` (project `ma2e-ast`: the aster ruleset, the guideline with `tokens`): Annotate; read; **Cancel**. Then rename the level `GR-FFL` to `L00` in the scratch copy (in an elevation; answer **No** to renaming its views); Annotate again; **Create** with the pre-ticks | First preview: `View names are checked against VN-01 (ruleset ruleset@1 · project · …)`; every GA Plan and RCP row refused `LEVEL '<level>' does not pass L\d{2}\|LRF\|XX (VN-01) — the level's name is used as it is: rename the level, or give the entry another LEVEL`; every fixed-name row refused `'WIP_…' does not pass VN-01: View 'WIP_…' does not match [DISCIPLINE]_[LEVEL]_[TYPE]_[DESCRIPTION].`; no view row ticked. Second: `ARC_L00_PLAN_GA` and `ARC_L00_RCP_Ceiling` ticked; after Create, `Created: 2 view(s).`; Scan Now: no VN-01 row names either; no new pending change request | Both previews' words; the result; the Scan Now and change-request counts |
| V-3 | On `ma2e-c.rvt` (project `ma2e-colon`, GA Plan's prefix `F:P`): Annotate; read; **Create** with the pre-ticks | Each GA Plan row greyed `'WIP_F:P_<LEVEL>' holds ':', which Revit does not allow in a view name`; each story level's `WIP_RCP_<LEVEL>` ticked; after Create, `Created: <story levels> view(s).` and no `Failed` block (ANV-2: the ':' row reported and skipped, the rest created) | The preview's words; the result |

The rows run in the order above: V-1R and U-1 follow V-1 on the same copy; V-2 and V-3 are independent (AST-1 and WS-1 retired: reviews C10, C3).

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA2e — storey plans and datums, live (<date> ~hh:mm → hh:mm local, branch feature/ma2e-storey-plans <sha>, Claude driving Revit 2024)`: the Setup paragraph (deploy on the founder's OK with the DLL sha before and after, settings pointed at 127.0.0.1:4101, the scratch office and projects with the artefact shas, the sign-in state, the scratch copies, none saved), the "Record before the first row" line, the table `| Row | Result | Evidence |` with **pass**/fail and the dialogs' text quoted, plus ledger `#n`; then D-amendments, F-MA2e-n findings each fixed on the branch ("fix(drill MA2e): …" with its check) and their shas, and the **owed** rows at its end.

**Closing list:**
- close Revit without saving any scratch copy;
- return the sign-in to the state found before the drill;
- stop the test bridge on 4101;
- restore the add-in's bridge settings: copy `bcf-config.json.ma2ebak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, and record the deployed DLL's sha256 beside the hash recorded before the set-up. If the session's permission check refuses that build (as in MA2c), say so: the branch's build stays until the merge's deploy — safe, since MA-2e changes no bridge vocabulary;
- list what the drill left on the shared ledger — the scratch office `ma2e-office` (`guideline@1`, `ruleset@1`), the projects `ma2e`, `ma2e-ast` (`guideline@1`, `ruleset@1`), `ma2e-colon` (`guideline@1`), the memberships and the `annotate` rows — left in place on purpose (scratch keys), as the earlier drills' were;
- list what the drill left on this PC outside the repository: the scratch projects' folders under `%AppData%\Sentinel\cache` (deleted: scratch keys only), the scratch copies and the drill's files in `Documents\Sentinel drills\ma2e\` (they stay, named, as the drill's evidence; never committed).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record;
- each F-MA2e-n fix is committed on the branch with its check, and Task 4 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does was deployed and its row run again live before the merge; a row whose fix was not run again is recorded as **owed**, not as passed;
- V-1 passed: only story-level views were pre-ticked and created, the read-back said x/x and a/a, the `annotate` row named the created views and the dialog's `Pinned now:` line (review C4), and Scan Now named none of the created views (ANV-1's acceptance). If a created view is a VN-01 row, the name check is not Scan Now's: nothing is merged;
- V-2 passed: no view was created under a name the aster rule refuses, and the renamed level's two views pass. If a refused row was created, nothing is merged;
- V-3 passed: the ':' row was refused and the rest created (ANV-2's acceptance).

**The design doc and the audit say what the drill proved**, committed on the branch before the merge: in `docs/strategy/2026-09-30-model-automation-design.md` and `docs/strategy/2026-09-30-revit-addin-audit.md`, replace every `BUILT on \`feature/ma2e-storey-plans\`, drill MA2e pending` with `LANDED in MA-2e (merge <date>), drill MA2e: <passed rows; owed rows>` — `git commit -m "docs: MA-2e - drill MA2e's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma2e-storey-plans -F - <<'EOF'
Merge feature/ma2e-storey-plans: MA-2e - a floor plan and an RCP for each story level, named by the View rule, and the story levels and grids pinned (audit DAT-3, ANV-1, ANV-2), all in Annotate: one preview lists levels x the guideline's plan and ceiling plan entries (story levels x the first of each pre-ticked, the rest listed) and the unpinned levels and grids (story levels and grids pre-ticked; one another user owns, or one changed in central, listed with the reason); a name is the View rule's tokens from the guideline view entry's new "tokens" ({level} verbatim - founder decision F1 A) or the fixed WIP_ name, judged by Scan Now's cached ruleset (CheckName whole: exclusions, whitelist, whitelist-only rules, the office code) before anything is created and refused with the reason (a token missing or one the rule lacks, a level or value failing its definition, the rule, a ':' Revit refuses, a duplicate, already in the model); refused while the ruleset has not loaded; one SentinelUndo group (XC-2) with a SubTransaction per view (one failure rolls back that view only), the model's default view types, routing failures counted, the views and Pinned read back after the group, kept or not (MH-LNK-01's substitute, every level and grid; links not checked); B31 said in every model (spec amendment S1); the annotate row names the views and datums read back, whether Revit kept the Undo group, and carries refused, failed, unrouted and the ruleset - the record when Revit empties its Undo list; Datum names Annotate as the next step. The TS planViews twin (no caller) retired, the bridge bundle rebuilt (0 lines added). Review amendments C1-C11. Drill MA2e: <the result and the owed rows>. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order:** (1) the bridge — nothing is needed: the rebuilt `sentinel-core.mjs` only drops `planViews`, which no route calls (Task 3 Step 3 checks it: 0 lines added, review C9), and loads at the bridge's next restart; the master bridge on 4100 already stores a view entry's `tokens` and the `annotate` row's new fields. (2) The add-in, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same with `-p:RevitVersion=<v>` for each other Revit version the founder uses. An older add-in ignores `tokens` and keeps its fixed names. (3) The web app — nothing.

## UNSURE facts this drill settles

1. Whether Revit empties its Undo list after `ViewPlan.Create` + `View.Name` in a model that is **not** workshared (B31 was seen in the workshared aster model, and after a manual rename there). A record, not a pass (review C3: the words are said in every model): V-1's Undo list, U-1.
2. Whether the B35 seed's levels (and Datum's `Level.Create` levels) read as Building Story (K4). The record before the first row; V-1's groups.
3. Whether `GetDefaultElementTypeId(ElementTypeGroup.ViewTypeCeilingPlan)` gives a type in the seed (F6). V-1: no `this model has no default ceiling plan view type` row.
4. Whether the DMU (`SentinelUpdater`) raises no change request for a created view whose name passes VN-01. V-1, V-2.
5. ~~Whether the engine's cached ruleset is loaded when Annotate runs right after a model is opened and bound (F4).~~ Settled in code by review C1: before it lands Annotate refuses, saying so (annotate-check's F4 scan); V-1's rule line names VN-01.
6. Whether a `SubTransaction` rolled back after a throw inside the one `Transaction` leaves the other views (E4). Not provokable on demand: owed, recorded if a `Failed` block ever appears.
7. Whether `Pinned = true` on a level or grid in a detached workshared copy needs no checkout prompt. Owed with F7 (WS-1 retired, review C3).

## Risks (each a ceiling stated in words)

- **B31.** Revit may empty its Undo list once views are named (seen in a workshared model); then one Undo cannot take Annotate back — the preview and the result say so in every model, and the `annotate` row, which names the views and datums (at most `MaxRecord` = 200 each, beside their totals), is the record (S1, reviews C3, C4). If Revit commits but does not keep the group, the read-back says what is in the model (review C2).
- **The level's name is used verbatim** (F1 A). A level named `L1 - Architectural` fails a LEVEL token of `L\d{2}` and is refused by name; the person renames the level or the office writes another value — `token_aliases` as a source is Next.
- **The first View rule orders the tokens** (E2). An office with two View rules of different token orders gets names from the first; the second may refuse them, row by row, said.
- **The cached ruleset** (F4) is the one Scan Now judges by; a ruleset changed on the web after it loaded is not seen until Scan Now reloads it — the names are then judged by the rule Scan Now still uses, consistently.
- **Pre-ticks follow the guideline's order** (F2): the first FloorPlan and CeilingPlan entries. An office whose first FloorPlan entry is not its GA plan gets that entry pre-ticked; every row is shown and the person decides.
- **A model with no Building Story level** gets nothing pre-ticked; the preview says so.
- **Ownership can change between the preview and Create** (F7): a datum another user takes (or changes in central) in between fails the commit, and the whole run rolls back, said in the dialog; the read-back confirms nothing stayed (review C2).
- **MH-LNK-01's substitute reads levels and grids only** (S3, K7; every level, review C6); links are not read and the line says so.
- **A missing template** still creates the view, without the template, and says so in the preview and the result (ANV-3 copies templates: Next).

## Next (out of scope here)

- `token_aliases` as a LEVEL source (F1 C); ANV-3 (copy missing templates), ANV-4 (sheets), ANV-5 (tags) — MA-8.
- DAT-1; DAT-2 (set the Building Story flag); a real MH-LNK-01 rule with links (`RevitLinkInstance`); Datum pinning at creation (F3 B).
- A TS view planner with a shared fixture, if the web ever plans views (F5 B).
- Owed rows carried: Revit 2025–2027 for Annotate, the signed-out actor, the per-view throw path, F7's owned or changed-in-central datums and UNSURE 7 (review C7); and from MA2d — a second account's approval, W-1, a real concept model for G2.
