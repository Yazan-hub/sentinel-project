# MA-2c — set_parameter from a cited source, and type-gap groups in the Holding Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The third slice of MA-2 — "what goes to a person" — in two parts:
- **set_parameter, built once with [BP] P2-7.** A DD type the Promote plan lands elements on (one they already stand on, or a retype's target) whose LOD-matrix property is EMPTY on the TYPE (drill MA2b: every BDS wall and door type the DD rules produce has an empty Fire Rating) gets ONE `set_parameter` type edit — only when a cited source holds exactly one value for it: the type catalogue row of exactly that type (`type_catalog@n` `params`, harvested by display name: "Fire Rating"), or a whole-class clause of the installed `ids@n` (a specification whose applicability is the class alone and whose required property pins one exact value). Otherwise the property goes to a person — no source, sources that disagree, or no parameter Sentinel can write — and Promote counts it ("DD properties: 2 type edit(s) from a cited source (never pre-ticked) · 1 with no source — sent to a person (14 element(s) on those types)"). **Never a guess, never a new type.** The bridge, not the caller, checks the source against the installed artefact and writes its own record (`value_source {kind, ref, sha256}`); a set_parameter is never pre-ticked (a type edit reaches every element on the type, and its row says how many). The executor writes it after every retype and attach of the changeset, inside the changeset's transaction (the stale guard first — the value read now must be the plan's `from` — then a read-back as the IDS reads it), so the DD IDS checked before commit (MA-2b) sees it. Each value written rides on the `changeset_applied` ledger row (P2-7's `param:apply`, built once).
- **Type-gap groups.** A Promote run's type gaps (the held elements the office has no type for — the DD rule names a type the catalogue lacks, or no catalogue type is named at the element's size) are grouped by category and the type wanted (else the size) and posted as ONE `type_gap` row per run (claimed). The Holding Area (`GET /cde/:key/holding`) lists each group in its own section ("Type gaps (n)") until a lead dismisses it with a reason (`POST /cde/:key/holding/type-gaps/:group/dismiss`) or the type catalogue in force holds the type it wants.

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md` — MA-2 (`:1085-1086`: "A Promote plan with `retype`, `attach` and `set_parameter`" and "Type-gap groups in the Holding Area, with their close rule (size M)"), §3.3 op 4 (`:325`), §3.4 step 4 (`:336`), §3.5 (`:353`, `:356`), §6.3 operations and trust rules (`:734-753`), §6.4 the ledger table and "Type gaps in the Holding Area" (`:829`, `:837-843`), §6.8 routes (`:880`, `:885`), decisions D13, D16, D19 (`:1335-1340`); the blueprint `docs/strategy/2026-09-29-sentinel-blueprint.md` P2-7 (`:698-735`, `:1219`); drill MA2b's record (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md:1315-1362`). Base: master `6a87d9f`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (the split, F12):** MA-2c is set_parameter + type-gap groups (both "what goes to a person": most of the work is bridge, TS and pure C#, with one executor op on the Revit side). **MA-2d** (Next) is one Undo per storey, DAT-3/ANV-1/ANV-2 (their own batch, B31), the full drill MA2 and gate G2 — Revit transaction and ExternalEvent work that changes the review window from one changeset to one storey. The plan's file name keeps the orchestrator's (`…-gaps-undo-plans`); the Undo and the plans are under Next.

**Architecture:**

*The bridge checks the source.* `validateChangeset` (`changesets-logic.mjs`) gains the op `set_parameter` (the six Promote kinds): `target.unique_id` names the TYPE, `place.TypeName` (and a door's or window's `place.FamilyName`) names it, `parameter` ("Pset_X.Prop"), `revit_parameter`, `from` ("" when empty — the stale guard), `to`, and `value_source {kind: catalogue | clause}`. A `cite` callback — `changesets-typing.makeCiter`, built by the store from the project's `type_catalog@n` and `ids@n` (project → office, each re-checked by the install validator, as the typer's standards are) — checks that the cited artefact holds exactly `to` and returns the bridge's own record `{kind, ref, sha256}`; a source it cannot check, a person's value, a different value, two rows, two clause values — each a 400 in words. The caller's `value_source.ref` is listed under `ignored`. `pretickOf` never pre-ticks a set_parameter (founder decision F1). The store reads the catalogue and the ids@n only for a body that holds a set_parameter (`needsCiting`), and `reportResult` adds `values: [{proposal_guid, type, parameter, from, to, value_source}]` to the `changeset_applied` row (F4). The catalogue parameter table (`CATALOG_PARAM`: `Pset_WallCommon.FireRating` and `Pset_DoorCommon.FireRating` → "Fire Rating"), the IFC entity of each kind (`KIND_ENTITY`) and the reading of the clauses (`clauseValues`) have C# twins, held equal by one shared fixture, `WebApp/bridge/fixtures/changeset-ops/value-sources.json`, which vitest and `tools/promote-check` read.

*The add-in plans the values.* `GuidelineMatcher.CatalogEntry` gains `params` (kept as JSON) and `CatalogValue(category, family, type, param)`. A new pure file `GhostBuilder/PropertyPlanner.cs` holds `TypeValue` (Revit's read of one DD type's property on the TYPE), `Clauses` (the C# `clauseValues`), `PropertyPlanner.DdTypes` (the DD types the plans land elements on — `StoreyPlan.Settled`, recorded by both planners, then the retype targets) and `PropertyPlanner.Plan`, which adds a `set_parameter` ghost to the first storey that lands an element on the type (with its retypes: F11) or a row to `StoreyPlan.ToPerson`, and returns a `PropertyReport` (the header's line and one line per row). `PromoteWallsPlanner.Bodies` files a set_parameter element (its `validate.psets` carries the value, so the referee judges it) and the properties sent to a person as the changeset's exceptions. In Revit, `FixInPlaceService.OnType` finds where a DD property lives on a type (PsetMap's candidates on the type itself — never an instance-only lookup, never the wall's Function — real, writable, stored as text) and its value as the IDS reads it; `PromoteWallsCommand.TypeValues` reads the plan's DD types with it on the API thread; `FixInPlaceService.WriteOnType` is the executor's write (stale guard, set, read-back); `ChangesetExecutor` runs it after the attach loop; the DD IDS before commit leaves the type entries out (`kindOf`); `PromoteContext.Fetch` reads the ids@n's clauses off the API thread; the review window shows "type edit wall: BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating "" → "60 min" · from type_catalog@2 · office · … · Fire Rating".

*Type gaps.* `PromoteHeld.Gap` (a `TypeGap {Category, Want, Size, Key, Nearest}`) is set at the four `m.Gap(...)` holds of the two planners (`Plan1`, `Retype` and `Swap` gain `out TypeGap gap`). A new pure file `GhostBuilder/TypeGaps.cs` groups them (`TypeGaps.Group`, by category and Want, else Size) and words a group (`TypeGaps.Line`); `CommandReports.TypeGaps` is the row, posted by Promote on every run that has a gap (the read-only run too). The bridge adds `type_gap` to the Revit report types: `typeGapRow` checks every group, names it (`holding-logic.typeGapId`: sha256 of category and want, else size — the same gap on every run is one group), words the action `type_gap:run · N group(s), M element(s)` (a `hold:` action is Sentinel's own and never comes through the report route: S5) and marks the row claimed. `holding-logic.typeGapGroups` derives the open and closed groups (a lead's `hold:type_gap_dismissed <group>` row newer than the group's newest run, or the catalogue in force holding the type: `catalogMatch`); `readHolding` returns them as `type_gaps {open, closed, catalog}`; `dismissTypeGap` is the lead's route. The web's `holding.ts` reads and words them (`typeGapLine`, `typeGapClosedLine`, `dismissTypeGap`); `files-panel.ts` shows "Type gaps (n)" with Dismiss… for a lead.

**Tech stack:** the Revit add-in in C# (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8); the Node bridge (`WebApp/bridge/*.mjs`, vitest beside the code; the sentinel-core bundle `bridge/sentinel-core.mjs` is read, not rebuilt — no TS under `src/sentinel-core` changes); the That Open web app's TS (`WebApp/src/setups/holding.ts`, `files-panel.ts`); offline C# console checks (`tools/promote-check`, `SENTINEL_CHECK`); the Supabase ledger (no migration: `type_gap` is a row type, not a table).

## Global Constraints

- Branch `feature/ma2c-set-parameter-gaps` from master `6a87d9f` (it holds this plan); merge `--no-ff` only after every task's checks pass **and the live drill MA2c is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **Never a guess.** A value is written only as an installed artefact holds it — the catalogue row of exactly that type, or the one value the installed ids@n's whole-class clauses pin; the BRIDGE checks it and writes the record. No source, two sources that disagree, a parameter Sentinel cannot write: the property goes to a person, said in words and counted.
  - **Sentinel creates no types.** set_parameter writes a type the plan names that exists in the model; a type that is not exactly one type there is not read and not written.
  - **A type edit is never pre-ticked** (F1) and says how many elements read the type.
  - **A filled value is never overwritten**: only an empty one (as the IDS reads it on the type) is planned, and the executor refuses the write when the type no longer reads the plan's `from` (the changeset fails whole, as a retype's `type_before` does).
  - **Every Revit write inside the changeset's one transaction** (and, for a Promote changeset with a DD IDS, inside its TransactionGroup — XC-2: one Undo per Sentinel action). No new transaction, no new ExternalEvent.
  - **No network call on Revit's API thread** that was not there before: the ids@n is read inside `PromoteContext.Fetch` (always called inside `Task.Run`); `TypeValues` and `WriteOnType` are API-thread Revit reads and writes only. (Promote's existing `Propose`, `GovernedNotify.Report` and the review's `Report` keep their current threads — Risks.)
  - **The bridge holds the trust rules**: a posted `value_source.ref` is ignored and listed; the pre-tick, the source record and a type gap's id are the bridge's.
  - **Type gaps are derived from the ledger**, never stored as a list; a read that fails says "not read — …", never an empty list; a bridge before MA-2c lists none and the web says so.
  - **Bridge and add-in ship together**: an older add-in declines a changeset carrying a set_parameter ("the add-in is older than the bridge's vocabulary", `ChangesetExecutor.cs` unsupported-op guard), an older bridge refuses the op (400) and the `type_gap` report (400). The Merge section gives the order.
  - No new dependency, no migration, no new check project; `bridge/sentinel-core.mjs` is not rebuilt (nothing under `src/sentinel-core` changes).
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (`System`, `System.Collections.Generic` and `System.Linq` are global in the add-in's csproj for net48 too). C# 9 patterns (`is not`, `or`) are in use already.
- Checks: `dotnet run --project tools/promote-check` from the repo root; vitest from `WebApp` with `npx vitest run <files>`. A run of every file (`npx vitest run`) rewrites `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` (`lod-ids.test.mjs`, MA-2b) with the same content in LF line endings, which git then lists as modified: it is never part of this plan's commits (`git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json`).
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by a source scan and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session (the section after the tasks). Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100.
- The community Revit MCP never writes. Only in the drill, and only its read-only calls: `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`, `get_available_family_types` — never while a Revit command, a TaskDialog or a Sentinel window is open.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are master `6a87d9f`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs.

**Dry run (planner, 2026-10-03):** every code step below was applied in order, task by task, to a fresh `git archive` export of master `6a87d9f` in a scratch folder under the session's scratchpad — never in the repository — by a script that reads this document's `Create` and replace blocks as an implementer reads them (each replace matched its text exactly once, in the file's own line endings). Before each task's code its Step 1 was applied and its "see it fail" run made; after the code, its "see it pass" run. The totals in the steps are that run's, and the plan's code blocks are the exact text that was applied: after Task 7 the 37 files the plan touches equal (line endings aside) the isolated worktree where the code was first written and run.
- Master's own totals, measured first: `promote-check` `605/605`; `npm test` (`vitest run`, every file) `Test Files  141 passed (141)`, `Tests  2234 passed | 1 skipped (2235)`; the bridge suite `Test Files  89 passed (89)`, `Tests  1779 passed | 1 skipped (1780)`; `npx tsc --noEmit -p .` `18` errors, 0 in the files this plan touches; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`.
- Task 1: `Test Files  3 failed (3)`, `Tests  4 failed | 34 passed (38)` — the logic and typing files fail to load (`makeCiter` is not a function), and the store file's four new tests fail (the op is refused, `needsCiting` is not a function); then `Test Files  3 passed (3)`, `Tests  141 passed (141)`.
- Task 2: `promote-check` it fails to compile — `1 Error(s)`: `CSC : error CS2001: Source file '…\SentinelAddin\GhostBuilder\PropertyPlanner.cs' could not be found`; then `promote-check` `622/622`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`.
- Task 3: `promote-check` `622/628` (6 FAIL): the six scans of section 35 fail — nothing is wired yet; then `promote-check` `628/628`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`.
- Task 4: `promote-check` it fails to compile — `1 Error(s)`: `CSC : error CS2001: Source file '…\SentinelAddin\GhostBuilder\TypeGaps.cs' could not be found`; then `promote-check` `636/636`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`.
- Task 5: `Test Files  3 failed (3)`, `Tests  9 failed | 89 passed (98)`: the four new holding-logic tests (`typeGapId` is not a function), the four of `cde-store-holding` (no `type_gaps`, no `dismissTypeGap`, no route) and the `type_gap` row (400: not a Revit report type); then `Test Files  3 passed (3)`, `Tests  98 passed (98)`; the bridge suite `Test Files  89 passed (89)`, `Tests  1801 passed | 1 skipped (1802)`.
- Task 6: `Test Files  1 failed (1)`, `Tests  5 failed | 15 passed (20)`: the five new or changed tests (no `type_gaps`, no `typeGapLine`, `typeGapClosedLine`, `dismissTypeGap`); then `Test Files  1 passed (1)`, `Tests  20 passed (20)`; `npx tsc --noEmit -p .` `18` errors, 0 in the touched files (master's count).
- Final tree: every tracked check project passes — all 25 pass (`annotate-check ALL PASS`, `fixplace-check 55/55 checks pass`, `ghost-standards-check 177/177 checks pass`, `promote-check 636/636 checks pass`, `session-check 47/47 checks pass`, the rest as on master); `npm test` `Test Files  141 passed (141)`, `Tests  2260 passed | 1 skipped (2261)`; the bridge suite `Test Files  89 passed (89)`, `Tests  1801 passed | 1 skipped (1802)`; `tsc` `18` errors, 0 in the touched files (master's); builds Revit 2024 `0 Error(s)`, `5 Warning(s)`; 2026 `0 Error(s)`, `3 Warning(s)`; 2022 `0 Error(s)`, `3 Warning(s)`; 2027 `0 Error(s)`, `5 Warning(s)` — master's counts (2022 and 2027 are not required builds).

Writing the code found five things the tasks now carry: `t` is the executor's transaction, so the set_parameter loop names its type `type` (the first build: `CS0136`); a `hold:` action is Sentinel's own row (`cde-store.mjs RESERVED_ACTIONS`), so the first `type_gap` post was a 400 "hold: rows are written by Sentinel, not through this route" — the row's action is `type_gap:run · …` (S5); `LevelName` is not one of a create's own place fields (it rides on a retype unread, as before), so the refusal test pins `place.Mark`; the bridge refuses an empty key or a label that is not one line of at most 256 characters, so `TypeGaps` sends no key as null and cleans each label (a Mark is typed freely); and the web's `Holding` now always carries `type_gaps`, so both places `files-panel.ts` builds an empty one say `type_gaps: null` (tsc). Not run: every line of the drill section, which only Revit can run; the commit commands. Nothing on any of the repository's branches was changed by the dry run; only this plan is committed.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts. **F1 is the one to read first**: a type parameter is shared by every element on the type.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | Fire Rating is a TYPE parameter: writing it changes every element on the type, settled ones and the template's legend instances included | **A:** write the type — only when the source is the catalogue row of exactly that type or a whole-class clause (F2) — shown as a type edit that says how many elements read it ("0 in the model now, 14 more that this changeset retypes onto it"), never pre-ticked; else to a person. **B:** never write; every DD property goes to a person. **C:** duplicate the type and write the copy | **A.** The value is the office's own record for that type (or its EIR's rule for the whole class), the person sees the reach and ticks it. **C is refused**: "Sentinel creates no types". Ceiling: a type edit cannot be scoped to some elements; a mixed type needs a person |
| F2 | What counts as a "cited clause" | **A:** an installed `ids@n` specification whose applicability is its entity alone (no predefinedType, no other facet) and whose required property carries one exact `value` (not a pattern); two values for one class is no source ("they disagree"). Cited as `ids@n · <spec name> · "<source sentence>"`. **B:** no clause source until a clause→value artefact exists | **A.** It is the one installed artefact that pins a value today (`compileIds` writes `value` from "shall be REI60"). Ceiling: real fire ratings vary by wall type or compartment, so a whole-class clause is rare — a per-type clause artefact is under Next |
| F3 | How a person supplies a value in MA-2c | **A:** in Revit (Type Properties). Promote names each property with no source, counts it, and files it as a "sent to a person" row of the changeset; the bridge refuses `value_source` "person". **B:** a person's value filed as a changeset row from the web grid ([BP] P2-7) | **A.** The web grid is P2-7's, which reuses this op. Ceiling: the person's value is not on the ledger as a write until P2-7 |
| F4 | The ledger row of a written value ([BP] P2-7 asked for one `param:apply` row) | **A:** the existing `changeset_applied` row carries `values: [{proposal_guid, type, parameter, from, to, value_source}]` for each set_parameter applied. **B:** a separate `param:apply` row | **A.** "Changesets write no ledger row" is closed already; one row per apply, built once (S2) |
| F5 | Is a DD property a governed parameter (Change Requests)? | **A:** not in MA-2c. **B:** route FireRating through Change Requests | **A.** The Change Requests reject was flaky in B32 (SIM `:931`); a governed list is P2-7's |
| F6 | The type-gap group key (the design's "category, measured size band, key params") | **A:** category + the type the DD rule wants, else (no rule names one) the size no catalogue type is named at — exact, since the snap is 0 (D16, MA-2b F1 B). **B:** a size band | **A.** With exact matching a band groups nothing; the wanted type name carries the size. Ceiling: when the snap is turned on, the band returns with it |
| F7 | What closes a group | **A:** a lead's dismissal, or the type catalogue in force holding the type it wants (else a type of its category named at its size); a later run that does not report it does NOT close it, and one that reports it after a dismissal opens it again. **B:** a later run's silence closes it too | **A.** The design names only the two rules. Ceiling: a gap fixed by hand stays listed until dismissed |
| F8 | Who may dismiss a group | **A:** a lead or owner; the machine credential passes — the rule of the existing Holding Area dismissal (`dismissHold`, spec HOLD `:135`); the row records the actor. **B:** a signed-in lead only | **A.** One rule for both dismissals; B would also make the drill's dismissal need the founder's password. Ceiling: anyone holding the token can dismiss (as today for held files) |
| F9 | Who writes the type gaps | **A:** one Revit report per Promote run carrying every group (claimed), the bridge names each. **B:** one row per group | **A.** One run, one row, inside the 20-reports-a-minute budget (with `lod_state` now and the receipt) |
| F10 | D13 — a new size of an office type | **A:** the catalogue is edited first; a new catalogue closes the gap. No "approve new size" in MA-2c. **B:** a lead approves a new size from the Holding Area | **A.** Sentinel creates no types; the catalogue is the office's list |
| F11 | Where a type's set_parameter rides | **A:** on the changeset of the first storey that lands an element on the type, with its retypes, so the DD IDS checked before commit sees the value (D19's "in the same batch"). **B:** one separate "DD properties" changeset | **A.** A separate changeset would fail its retypes' IDS check first. Ceiling: a storey of more than 200 ghosts files several changesets; a type row lands in one of them (Risks) — MA-2d runs a storey's changesets together |
| F12 | The scope of MA-2c | **A:** set_parameter + type-gap groups; one Undo per storey, DAT-3/ANV-1/ANV-2, drill MA2 and G2 are MA-2d. **B:** all of MA-2 in one slice | **A**, the design scout's split. MA-2d's views may split into MA-2e if it grows |

## Review amendments (BINDING — they override any task text they contradict)

None yet. The plan's reviews number theirs C1…; the drill's fixes are D1… (commits "fix(drill MA2c): …", each with its check).

## Amendments to the spec's words (BINDING — they override any task text they contradict; numbered S1…, so the review amendments keep C1…)

- **S1 (P2-7's item shape, [BP] `:709-718`).** The blueprint's item `{kind: "set_parameter", guid, parameter, revit_parameter, from, to, reason, judged}` is a changeset element here: `op: "set_parameter"`, `kind` the element kind (wall … window), `target.unique_id` the TYPE's UniqueId, `place.TypeName` (and `FamilyName`) naming it, `parameter`, `revit_parameter`, `from`, `to`, `reason`, plus `value_source` (the bridge's record of the cited source). `judged` is the element's `verdict` (`attachVerdicts`): the value rides in `validate.psets`, so the referee judges it before staging.
- **S2 (`param:apply` → `changeset_applied.values`, F4).** "Each apply writes one `param:apply` row" ([BP] `:706`) is one `changeset_applied` row per apply, with each written value on it.
- **S3 (a failing value is shown, not refused, [BP] `:703`).** "A value that would fail IDS is refused on the web and never reaches Revit": a Promote set_parameter's value comes from a source the bridge checked, and the referee's verdict shows on its row; refusing a failing value at the web grid is P2-7's.
- **S4 (the stale guard at Apply, [BP] `:704`).** "If the current Revit value differs, the row shows as stale and cannot be ticked": in MA-2c the executor refuses the write at Apply ("stale: … reads "90 min" now, the plan read "" — re-run Promote") and the changeset fails whole and is reported declined, as a retype's `type_before` does. Marking a stale row in the review window before Apply needs a Revit read per row: under Next (P2-7).
- **S5 (the type-gap row, design `:829`).** The design's `hold:type_gap` row is `entity_type type_gap`, action `type_gap:run · N group(s), M element(s)`, ONE row per run holding every group (F9): a `hold:` action is Sentinel's own (`cde-store.mjs RESERVED_ACTIONS`) and never comes through the Revit report route. A lead's dismissal is `hold:type_gap_dismissed <group>`, written by the bridge's own route. No size band (F6); no evidence ids (MA-4).
- **S6 ("or a person", design `:325`).** A person supplies a value in Revit (F3); Promote names and counts what goes to them. The design's "existing Fix in Revit path" is reused as its table and its checks (`PsetMap`, `IsReal`, the read-back), not as `FixInPlaceService.Apply`, which runs its own transaction and request-store audit: the set_parameter write runs inside the changeset's transaction (`WriteOnType`).
- **S7 (type parameters only).** set_parameter writes the TYPE's own text parameter. The DD properties on the pilot are type parameters (Fire Rating); an instance parameter, a yes/no or a unit-bearing number (a window's U-value, "Heat Transfer Coefficient (U)") is "no writer" — a person sets it. Instance targets and numbers are P2-7's (Next).

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The caller sends `value_source {kind}` only; the bridge resolves the artefact itself and writes `{kind, ref, sha256}` | The source is a trust field: a client's ref would be a claim. The add-in's dialog shows its own words, the stored changeset the bridge's |
| E2 | `CATALOG_PARAM`, `KIND_ENTITY` and the clause reading live twice (`changesets-typing.mjs`, `PropertyPlanner.cs`) and are held equal by `fixtures/changeset-ops/value-sources.json` (6 clause cases) | The add-in plans the value (it must count "no source" before it files) and the bridge checks it; one fixture keeps the two readings one |
| E3 | `TypeValue.Current` is the value as the IDS reads it on the type (`GovernedElementExtractor.ReadEntry` on the type), "" when empty; the writer is the first PsetMap candidate the type itself holds (lookup that may fall to the type, or built-in), real (`IsReal`), writable, stored as String | Read and write agree with the referee; a phantom, read-only, yes/no or unit-bearing parameter is "no writer", never mis-set |
| E4 | The executor's set_parameter loop runs after the attach loop, inside the changeset's transaction; any failure fails the changeset whole | All-or-nothing, as every other op; the value lands on the type the retype just set (drill MA2b I-1) |
| E5 | The DD IDS check before commit leaves a set_parameter's applied entry out (`kindOf` without them) | The entry is a TYPE; the IDS judges the elements, which read the type's new value |
| E6 | A written type is stamped (`ProvenanceStamp.Write` through `Collect`), as every element a changeset touches | One rule; the stamp names the changeset that wrote the type (UNSURE 4) |
| E7 | A type gap's id is the bridge's (`typeGapId`: sha256 of category and want, else size, first 12 hex) | The client cannot name a group; the same gap on every run is one group |
| E8 | The Holding Area reads the type catalogue in force on every GET (`resolveArtefact`) for the close rule; a failed read leaves every group open and says "not read — …" as the section's close-rule line | The rule is "the catalogue in force", not an install event; nothing is closed on a read that failed |
| E9 | The web section is DOM in `files-panel.ts`, untested like "On hold"; its words and calls are `holding.ts`'s, tested | The house pattern of 6a |
| E10 | `PromoteHeld.Gap` is set only at the four `m.Gap(...)` holds | "Not loaded in this model" and "no DD rule for …" are not type gaps: a new catalogue closes neither |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `WebApp/bridge/changesets-logic.mjs`, `changesets-logic.test.mjs` | 1 | The op, `checkWrite`, the pre-tick rule |
| `WebApp/bridge/changesets-typing.mjs`, `changesets-typing.test.mjs` | 1 | `CATALOG_PARAM`, `KIND_ENTITY`, `clauseValues`, `makeCiter` |
| `WebApp/bridge/changesets-store.mjs`, `changesets-store.test.mjs` | 1 | `needsCiting`, `standardOf`, `citerFor`; `changeset_applied.values` |
| `WebApp/bridge/mcp-server.mjs` | 1 | The MCP tool's words for the op |
| `WebApp/bridge/fixtures/changeset-ops/value-sources.json` (new), `set-parameter-body.json` (new) | 1, 2 | The shared value sources; the add-in's body |
| `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` | 2 | `CatalogEntry.Params`, `CatalogValue` |
| `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, `PromotePlanner.cs` | 2, 4 | `PromoteGhost`'s write fields, `StoreyPlan.Settled` / `ToPerson`, the body; `PromoteHeld.Gap`, `TypeGap`, the gap holds |
| `SentinelAddin/GhostBuilder/PropertyPlanner.cs` (new) | 2 | `TypeValue`, `Clauses`, `PropertyRow`, `PropertyReport`, `PropertyPlanner` |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 2 | The DTO's write fields, `ValueSourceDto`; `PreTick` |
| `tools/promote-check/PropertyChecks.cs` (new), `Ma2cWiring.cs` (new), `TypeGapChecks.cs` (new), `Check.cs`, `promote-check.csproj` | 2, 3, 4 | Sections 33–36 |
| `SentinelAddin/Coordination/FixInPlaceService.cs` | 3 | `OnType`, `WriteOnType` |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, `ChangesetPlacementEvent.cs`, `PromoteContext.cs`, `Commands.PromoteWalls.cs`, `UI/ChangesetReviewWindow.cs` | 3, 4 | The write, the IDS check's kinds, the clauses' read, the type reads and the dialog, the row's words; the type-gap post |
| `SentinelAddin/GhostBuilder/TypeGaps.cs` (new), `Coordination/CommandReports.cs` | 4 | `TypeGapGroup`, `TypeGaps`; the `type_gap` row |
| `WebApp/bridge/holding-logic.mjs`, `cde-store.mjs`, `bcf-service.mjs`; `holding-logic.test.mjs`, `cde-store-holding.test.mjs`, `write-roles.test.mjs` | 5 | `typeGapId`, `catalogMatch`, `typeGapGroups`; `typeGapRow`, `readHolding`, `dismissTypeGap`; the route |
| `WebApp/src/setups/holding.ts`, `holding.test.ts`, `files-panel.ts` | 6 | The web's read, words and dismissal; the section |
| `docs/strategy/2026-09-30-model-automation-design.md` | 7 | What landed |

---

## Tasks (in order: the bridge op; its C# planner; the Revit wiring; the gaps in C#; the gaps on the bridge; the gaps on the web; the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file. `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once.

### Task 1 — Bridge: the set_parameter op, its source checked by the bridge, the value on the changeset_applied row

**Files:**
- Create `WebApp/bridge/fixtures/changeset-ops/value-sources.json` — the shared value sources (Task 2's C# reads it too)
- Create `WebApp/bridge/fixtures/changeset-ops/set-parameter-body.json` — the add-in's body (Task 2's `PropertyPlannerChecks` writes the same)
- Modify `WebApp/bridge/changesets-logic.mjs`, `changesets-typing.mjs`, `changesets-store.mjs`, `mcp-server.mjs`
- Test `WebApp/bridge/changesets-logic.test.mjs`, `changesets-typing.test.mjs`, `changesets-store.test.mjs`

**Interfaces:**
- Produces: `OPS` gains `"set_parameter"`, `OP_KINDS.set_parameter` = the six Promote kinds; `validateChangeset(body, { member, type, cite })` — `cite(kind, place, key, to, valueSource, at) → {kind, ref, sha256}` or a 400; an element's `parameter`, `revit_parameter`, `from`, `to`, `value_source`. `changesets-typing.mjs` exports `CATALOG_PARAM`, `KIND_ENTITY`, `clauseValues(ids, entity, key) → [{value, spec, sentence}]`, `makeCiter({catalog, ids}, core)`. `changesets-store.mjs` exports `needsCiting(body)`; `changeset_applied`'s new_value gains `values` when a set_parameter was applied.
- Consumes: the bundle's `sameCategory` (`bridge/sentinel-core.mjs`), `KIND_CATEGORY` (`changesets-typing.mjs`).

- [ ] **Step 1: The fixtures and the checks.**

`Create` `WebApp/bridge/fixtures/changeset-ops/value-sources.json`:

```json
{
  "_note": "MA-2c: where a set_parameter's value may come from. catalog_param and kind_entity are the add-in's PropertyPlanner.CatalogParam and PromoteWallsPlanner.Classes (upper-cased) and the bridge's CATALOG_PARAM and KIND_ENTITY; catalog is a type_catalog@n body (BDS rows, Fire Rating filled on two); ids is an ids@n body whose clauses the cases read. tools/promote-check and vitest read this file.",
  "catalog_param": { "Pset_WallCommon.FireRating": "Fire Rating", "Pset_DoorCommon.FireRating": "Fire Rating" },
  "kind_entity": { "wall": "IFCWALL", "floor": "IFCSLAB", "roof": "IFCROOF", "ceiling": "IFCCOVERING", "door": "IFCDOOR", "window": "IFCWINDOW" },
  "catalog": {
    "template": { "title": "MA2c value sources" },
    "types": [
      { "category": "Walls", "family": "Basic Wall", "type": "BDS_EXT_ARC_CMU_200 mm", "system": true, "width_mm": 200, "height_mm": null, "params": { "Assembly Code": "B2010", "Fire Rating": "60 min" } },
      { "category": "Walls", "family": "Basic Wall", "type": "BDS_INT_ARC_GYPS_100 mm", "system": true, "width_mm": 100, "height_mm": null, "params": { "Assembly Code": "C1010140" } },
      { "category": "Doors", "family": "BDS_INT_1 PNL", "type": "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", "system": false, "width_mm": 960, "height_mm": 1980, "params": { "Assembly Code": "C1020", "Type Mark": "47" } },
      { "category": "Doors", "family": "BDS_INT_2 PNL", "type": "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "system": false, "width_mm": 980, "height_mm": 2080, "params": { "Fire Rating": "FD60" } }
    ]
  },
  "ids": {
    "title": "MA2c clauses",
    "specifications": [
      { "name": "Doors carry FD30", "applicability": { "entity": "IFCDOOR" },
        "requirements": { "attributes": [], "properties": [{ "pset": "Pset_DoorCommon", "name": "FireRating", "value": "FD30", "cardinality": "required" }] },
        "source_sentence": "All doors shall be FD30." },
      { "name": "Fire walls carry REI60", "applicability": { "entity": "IFCWALL", "predefinedType": "SHEAR" },
        "requirements": { "attributes": [], "properties": [{ "pset": "Pset_WallCommon", "name": "FireRating", "value": "REI60", "cardinality": "required" }] } },
      { "name": "Windows carry a U-value", "applicability": { "entity": "IFCWINDOW" },
        "requirements": { "attributes": [], "properties": [{ "pset": "Pset_WindowCommon", "name": "ThermalTransmittance", "pattern": "^[0-9.]+$", "cardinality": "required" }] } },
      { "name": "Roofs are recorded", "applicability": { "entity": "^IFC(ROOF|SLAB)$" },
        "requirements": { "attributes": [], "properties": [{ "pset": "Pset_RoofCommon", "name": "FireRating", "value": "REI30", "cardinality": "required" }, { "pset": "Pset_RoofCommon", "name": "FireRating", "value": "REI60", "cardinality": "required" }] } },
      { "name": "Slabs are REI90", "applicability": { "entity": "^IFC(ROOF|SLAB)$" },
        "requirements": { "attributes": [], "properties": [{ "pset": "Pset_SlabCommon", "name": "FireRating", "value": "REI90", "cardinality": "optional" }] } }
    ]
  },
  "clauses": [
    { "name": "a whole-class clause pins one value", "entity": "IFCDOOR", "key": "Pset_DoorCommon.FireRating", "values": ["FD30"], "spec": "Doors carry FD30", "sentence": "All doors shall be FD30." },
    { "name": "a clause narrowed by a predefined type is not every wall's", "entity": "IFCWALL", "key": "Pset_WallCommon.FireRating", "values": [] },
    { "name": "a pattern is not a value", "entity": "IFCWINDOW", "key": "Pset_WindowCommon.ThermalTransmittance", "values": [] },
    { "name": "two values for one key are both read (the caller says they disagree)", "entity": "IFCROOF", "key": "Pset_RoofCommon.FireRating", "values": ["REI30", "REI60"], "spec": "Roofs are recorded", "sentence": null },
    { "name": "an optional property pins nothing", "entity": "IFCSLAB", "key": "Pset_SlabCommon.FireRating", "values": [] },
    { "name": "another class's clause is not this one's", "entity": "IFCCOVERING", "key": "Pset_DoorCommon.FireRating", "values": [] }
  ]
}
```

`Create` `WebApp/bridge/fixtures/changeset-ops/set-parameter-body.json` (the body Task 2's planner writes for its case — a Level 1 storey with a wall retyped to `BDS_EXT_ARC_CMU_200 mm`, a door swapped to `BDS_INT_1 PNL_WOOD_1000 x 2100 mm`, a settled `BDS_INT_ARC_GYPS_100 mm` wall and a settled `BDS_INT_2 PNL_WOOD_2000 x 2100 mm` door):

```json
{
  "name": "Promote (DD) · Level 1",
  "source": "promote",
  "actor": "yazan",
  "elements": [
    {
      "op": "retype",
      "kind": "wall",
      "target": {
        "unique_id": "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000190",
        "type_before": "Generic - 200mm"
      },
      "place": {
        "TypeName": "BDS_EXT_ARC_CMU_200 mm"
      },
      "reason": "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm",
      "validate": {
        "identity": {
          "Class": "IfcWall",
          "Name": "W 312312"
        }
      }
    },
    {
      "op": "retype",
      "kind": "door",
      "target": {
        "unique_id": "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000194",
        "type_before": "M_Single-Flush : MA1 1000 x 2100mm"
      },
      "place": {
        "TypeName": "BDS_INT_1 PNL_WOOD_1000 x 2100 mm",
        "FamilyName": "BDS_INT_1 PNL"
      },
      "reason": "DD doors: HostFunction Interior, Size W1000 x H2100 mm → BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm; sized by its type name (DR-1): after the swap the door's Width x Height read the new family's own",
      "validate": {
        "identity": {
          "Class": "IfcDoor",
          "Name": "Door 404"
        }
      }
    },
    {
      "op": "set_parameter",
      "kind": "wall",
      "target": {
        "unique_id": "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a01"
      },
      "place": {
        "TypeName": "BDS_EXT_ARC_CMU_200 mm"
      },
      "parameter": "Pset_WallCommon.FireRating",
      "revit_parameter": "Fire Rating",
      "from": "",
      "to": "60 min",
      "value_source": {
        "kind": "catalogue"
      },
      "reason": "DD walls: Pset_WallCommon.FireRating \"60 min\" from type_catalog@1 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating — a type edit: every element on BDS_EXT_ARC_CMU_200 mm reads it (0 in the model now, 1 more that this changeset retypes onto it)",
      "validate": {
        "identity": {
          "Class": "IfcWall",
          "Name": "type BDS_EXT_ARC_CMU_200 mm"
        },
        "psets": [
          {
            "name": "Pset_WallCommon",
            "rows": [
              {
                "name": "FireRating",
                "value": "60 min"
              }
            ]
          }
        ]
      }
    },
    {
      "op": "set_parameter",
      "kind": "door",
      "target": {
        "unique_id": "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a03"
      },
      "place": {
        "TypeName": "BDS_INT_1 PNL_WOOD_1000 x 2100 mm",
        "FamilyName": "BDS_INT_1 PNL"
      },
      "parameter": "Pset_DoorCommon.FireRating",
      "revit_parameter": "Fire Rating",
      "from": "",
      "to": "FD30",
      "value_source": {
        "kind": "clause"
      },
      "reason": "DD doors: Pset_DoorCommon.FireRating \"FD30\" from ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · \"All doors shall be FD30.\" — a type edit: every element on BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm reads it (0 in the model now, 1 more that this changeset retypes onto it)",
      "validate": {
        "identity": {
          "Class": "IfcDoor",
          "Name": "type BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm"
        },
        "psets": [
          {
            "name": "Pset_DoorCommon",
            "rows": [
              {
                "name": "FireRating",
                "value": "FD30"
              }
            ]
          }
        ]
      }
    }
  ],
  "exceptions": [
    {
      "unique_id": "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a02",
      "name": "type BDS_INT_ARC_GYPS_100 mm · Pset_WallCommon.FireRating",
      "reason": "no source for Pset_WallCommon.FireRating on BDS_INT_ARC_GYPS_100 mm — type_catalog@1 · office · fedcba987654… gives no Fire Rating for it, and no clause of ids@1 · project · 0a1b2c3d4e5f… pins one; a person fills it in Revit (Type Properties) — 1 element(s) on it"
    },
    {
      "unique_id": "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a04",
      "name": "type BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm · Pset_DoorCommon.FireRating",
      "reason": "the sources disagree on Pset_DoorCommon.FireRating for BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm: \"FD60\" (type_catalog@1 · office · fedcba987654… · BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm · Fire Rating); \"FD30\" (ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · \"All doors shall…"
    }
  ]
}
```

In `WebApp/bridge/changesets-typing.test.mjs`, replace

```js
import { makeTyper, checkFacts, saidOf, KIND_CATEGORY, FACTS_FIELDS } from "./changesets-typing.mjs";
```

with

```js
import { makeTyper, checkFacts, saidOf, KIND_CATEGORY, FACTS_FIELDS, CATALOG_PARAM, KIND_ENTITY, clauseValues, makeCiter } from "./changesets-typing.mjs";
```

In `WebApp/bridge/changesets-typing.test.mjs`, replace

```js
  it("saidOf puts the facts in words", () => {
    expect(saidOf({ thickness_mm: 200, params: { Function: "Exterior", Location: "Exterior" } })).toBe("Function Exterior, Location Exterior, 200 mm");
    expect(saidOf({ params: { Material: "Stone" } })).toBe("Material Stone");
    expect(saidOf(null)).toBe("no facts");
    expect(saidOf({})).toBe("no facts");
  });
});
```

with

```js
  it("saidOf puts the facts in words", () => {
    expect(saidOf({ thickness_mm: 200, params: { Function: "Exterior", Location: "Exterior" } })).toBe("Function Exterior, Location Exterior, 200 mm");
    expect(saidOf({ params: { Material: "Stone" } })).toBe("Material Stone");
    expect(saidOf(null)).toBe("no facts");
    expect(saidOf({})).toBe("no facts");
  });
});

// MA-2c: a set_parameter's value comes from a cited source the bridge checks — the catalogue row of exactly that type, or the one
// value every whole-class clause of the installed ids@n pins. The shared fixture is the add-in's reading too (tools/promote-check).
describe("changesets-typing — where a set_parameter's value comes from (MA-2c)", () => {
  const VS = read("./fixtures/changeset-ops/value-sources.json");
  const SRC = {
    catalog: { body: VS.catalog, label: "type_catalog@2 · office · fedcba987654…", sha256: "cd".repeat(32) },
    ids: { body: VS.ids, label: "ids@1 · project · 0a1b2c3d4e5f…", sha256: "ef".repeat(32) },
  };
  const cite = makeCiter(SRC, core);
  const WALL = { TypeName: "BDS_EXT_ARC_CMU_200 mm" };
  const DOOR = { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" };

  it("the catalogue parameter and the IFC entity of each kind are the shared fixture's (the add-in reads the same table)", () => {
    expect(CATALOG_PARAM).toEqual(VS.catalog_param);
    expect(KIND_ENTITY).toEqual(VS.kind_entity);
  });

  it("clauseValues reads every shared case as the add-in's Clauses does: a whole-class clause's one exact value, nothing else", () => {
    for (const c of VS.clauses) {
      const got = clauseValues(VS.ids, c.entity, c.key);
      expect(got.map((h) => h.value), c.name).toEqual(c.values);
      if (c.spec) expect(got[0], c.name).toMatchObject({ spec: c.spec, sentence: c.sentence });
    }
    expect(clauseValues(null, "IFCDOOR", "Pset_DoorCommon.FireRating")).toEqual([]);
    expect(clauseValues({ specifications: [{ name: "bad", applicability: { entity: "(" }, requirements: { properties: [] } }] }, "IFCDOOR", "x.y")).toEqual([]);
  });

  it("a catalogue source holds when exactly one row of that type gives exactly that value; the record names the catalogue, the type and the parameter", () => {
    expect(cite("wall", WALL, "Pset_WallCommon.FireRating", "60 min", { kind: "catalogue" }, "elements[1]"))
      .toEqual({ kind: "catalogue", ref: "type_catalog@2 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating", sha256: "cd".repeat(32) });
    refused(() => cite("wall", WALL, "Pset_WallCommon.FireRating", "120 min", { kind: "catalogue" }, "elements[1]"),
      /^elements\[1\]: set_parameter's value_source: type_catalog@2 · office · fedcba987654… gives BDS_EXT_ARC_CMU_200 mm Fire Rating "60 min", not "120 min" — a value is written only as its source holds it$/);
    refused(() => cite("wall", { TypeName: "BDS_INT_ARC_GYPS_100 mm" }, "Pset_WallCommon.FireRating", "30 min", { kind: "catalogue" }, "e"),
      /gives BDS_INT_ARC_GYPS_100 mm Fire Rating "", not "30 min"/);
    refused(() => cite("wall", { TypeName: "BDS_EXT_ARC_CMU_212 mm" }, "Pset_WallCommon.FireRating", "60 min", { kind: "catalogue" }, "e"),
      /type_catalog@2 · office · fedcba987654… has no row for Walls BDS_EXT_ARC_CMU_212 mm — one row is one source$/);
    refused(() => cite("door", { FamilyName: "BDS_INT_2 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" }, "Pset_DoorCommon.FireRating", "FD30", { kind: "catalogue" }, "e"),
      /has no row for Doors BDS_INT_2 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm/);
    refused(() => cite("window", { FamilyName: "W", TypeName: "T" }, "Pset_WindowCommon.ThermalTransmittance", "1.4", { kind: "catalogue" }, "e"),
      /the catalogue harvests no parameter for Pset_WindowCommon\.ThermalTransmittance — a person fills it$/);
    refused(() => makeCiter({ ...SRC, catalog: NONE("type_catalog") }, core)("wall", WALL, "Pset_WallCommon.FireRating", "60 min", { kind: "catalogue" }, "e"),
      /is the catalogue, and no type catalogue is installed for this project or its office \(none — not installed for ma2a or its office\): not checkable$/);
  });

  it("a clause source holds when the whole-class clauses pin exactly that one value; the record cites the clause's sentence", () => {
    expect(cite("door", DOOR, "Pset_DoorCommon.FireRating", "FD30", { kind: "clause" }, "elements[2]"))
      .toEqual({ kind: "clause", ref: 'ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · "All doors shall be FD30."', sha256: "ef".repeat(32) });
    refused(() => cite("door", DOOR, "Pset_DoorCommon.FireRating", "FD60", { kind: "clause" }, "e"), /ids@1 · project · 0a1b2c3d4e5f… pins "FD30" for Pset_DoorCommon\.FireRating, not "FD60"/);
    refused(() => cite("wall", WALL, "Pset_WallCommon.FireRating", "REI60", { kind: "clause" }, "e"),
      /no clause of ids@1 · project · 0a1b2c3d4e5f… pins one value of Pset_WallCommon\.FireRating for every IFCWALL$/);
    refused(() => cite("roof", { TypeName: "R" }, "Pset_RoofCommon.FireRating", "REI30", { kind: "clause" }, "e"),
      /the clauses of ids@1 · project · 0a1b2c3d4e5f… pin "REI30" and "REI60" for Pset_RoofCommon\.FireRating — they disagree; a person decides$/);
    refused(() => makeCiter({ ...SRC, ids: NONE("ids") }, core)("door", DOOR, "Pset_DoorCommon.FireRating", "FD30", { kind: "clause" }, "e"),
      /is a clause, and no ids@n is installed for this project or its office \(none — not installed for ma2a or its office\): not checkable$/);
  });
});
```

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
import { makeTyper } from "./changesets-typing.mjs";
```

with

```js
import { makeTyper, makeCiter } from "./changesets-typing.mjs";
```

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
  it("OPS is create, retype, attach; VOCABULARY is the MA-1 list", () => {
    expect(OPS).toEqual(["create", "retype", "attach"]);
    expect(VOCABULARY).toEqual(MA1);
  });

  it("OP_KINDS: create takes the vocabulary, retype six element kinds, attach walls only", () => {
    expect(OP_KINDS).toEqual({ create: VOCABULARY, retype: ["wall", "floor", "roof", "ceiling", "door", "window"], attach: ["wall"] });
  });
```

with

```js
  it("OPS is create, retype, attach, set_parameter (MA-2c); VOCABULARY is the MA-1 list", () => {
    expect(OPS).toEqual(["create", "retype", "attach", "set_parameter"]);
    expect(VOCABULARY).toEqual(MA1);
  });

  it("OP_KINDS: create takes the vocabulary, retype and set_parameter six element kinds, attach walls only", () => {
    const SIX = ["wall", "floor", "roof", "ceiling", "door", "window"];
    expect(OP_KINDS).toEqual({ create: VOCABULARY, retype: SIX, attach: ["wall"], set_parameter: SIX });
  });
```

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
    const design = { ...fx.posted, elements: [{ ...fx.posted.elements[0], facts: undefined, measured: { thickness_mm: 203, height_mm: 3050 } }] };
    status400(() => validateChangeset(design, { type: makeTyper(standards, core) }), /no rule of guideline@1 · office · 0123456789ab… matches a wall with no facts/);
  });
});
```

with

```js
    const design = { ...fx.posted, elements: [{ ...fx.posted.elements[0], facts: undefined, measured: { thickness_mm: 203, height_mm: 3050 } }] };
    status400(() => validateChangeset(design, { type: makeTyper(standards, core) }), /no rule of guideline@1 · office · 0123456789ab… matches a wall with no facts/);
  });
});

// MA-2c: set_parameter writes one value on an existing TYPE from a cited source — [BP] P2-7's item, built once. The bridge checks
// the source (cite, changesets-typing.makeCiter over the project's catalogue and ids@n) and writes its own record; it is never
// pre-ticked. The fixture is the body the add-in's PropertyPlanner files (tools/promote-check writes the same).
describe("validateChangeset — set_parameter (MA-2c)", () => {
  const TYPE_UID = "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a01";
  const VS = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/value-sources.json", import.meta.url), "utf8"));
  const cite = makeCiter({
    catalog: { body: VS.catalog, label: "type_catalog@1 · office · fedcba987654…", sha256: "cd".repeat(32) },
    ids: { body: VS.ids, label: "ids@1 · project · 0a1b2c3d4e5f…", sha256: "ef".repeat(32) },
  }, core);
  const write = (over = {}) => ({
    op: "set_parameter", kind: "wall", target: { unique_id: TYPE_UID }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
    parameter: "Pset_WallCommon.FireRating", revit_parameter: "Fire Rating", from: "", to: "60 min", value_source: { kind: "catalogue" },
    reason: "DD walls: from the catalogue", validate: { identity: { Class: "IfcWall", Name: "type BDS_EXT_ARC_CMU_200 mm" } },
    ...over,
  });

  it("keeps the parameter, from, to and the bridge's own value_source; a member's Promote post still never pre-ticks it", () => {
    const v = validateChangeset(CS([write()], { source: "promote" }), { member: true, cite });
    expect(v.elements[0]).toMatchObject({
      op: "set_parameter", kind: "wall", target: { unique_id: TYPE_UID, type_before: null }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
      parameter: "Pset_WallCommon.FireRating", revit_parameter: "Fire Rating", from: "", to: "60 min", pretick: false,
      value_source: { kind: "catalogue", ref: "type_catalog@1 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating", sha256: "cd".repeat(32) },
    });
    expect(v.ignored).toEqual([]);
  });

  it("a posted value_source.ref is not kept (the bridge writes the record) and is listed; a door's clause source cites its sentence", () => {
    const v = validateChangeset(CS([write({ value_source: { kind: "catalogue", ref: "trust me" } }),
      write({ kind: "door", place: { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" }, parameter: "Pset_DoorCommon.FireRating", to: "FD30", value_source: { kind: "clause" } })]), { cite });
    expect(v.ignored).toEqual([{ field: "elements[0].value_source.ref", why: "ignored: not a field this bridge keeps" }]);
    expect(v.elements[1].value_source.ref).toBe('ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · "All doors shall be FD30."');
  });

  it("each refusal says what is missing: the type, the family, the parameter, from, to, the source — and a source the bridge cannot check", () => {
    status400(() => validateChangeset(CS([write({ place: {} })]), { cite }), /^elements\[0\]: set_parameter needs place\.TypeName — the type whose parameter it writes$/);
    status400(() => validateChangeset(CS([write({ kind: "door", place: { TypeName: "T" } })]), { cite }), /a door set_parameter needs place\.FamilyName/);
    status400(() => validateChangeset(CS([write({ parameter: "FireRating" })]), { cite }), /set_parameter needs parameter, a "Pset_Name\.Property" key/);
    status400(() => validateChangeset(CS([write({ from: undefined })]), { cite }), /set_parameter needs from — the value the plan read, "" when empty \(the stale guard compares it\)/);
    status400(() => validateChangeset(CS([write({ to: " " })]), { cite }), /set_parameter needs to — one line of at most 500 characters/);
    status400(() => validateChangeset(CS([write({ to: "60\nmin" })]), { cite }), /set_parameter needs to/);
    status400(() => validateChangeset(CS([write({ from: "60 min" })]), { cite }), /set_parameter's to is its from — nothing to write/);
    status400(() => validateChangeset(CS([write({ value_source: { kind: "person" } })]), { cite }),
      /set_parameter needs value_source \{kind: catalogue \| clause\} — a value is written from a cited source, never a guess; a person types their own in Revit/);
    status400(() => validateChangeset(CS([write()])), /the bridge read no standards to check this value_source — nothing is written unchecked/);
    status400(() => validateChangeset(CS([write({ to: "120 min" })]), { cite }), /gives BDS_EXT_ARC_CMU_200 mm Fire Rating "60 min", not "120 min"/);
    status400(() => validateChangeset(CS([write({ target: { unique_id: TYPE_UID, type_before: "X" } })]), { cite }), /set_parameter takes no target\.type_before — its stale guard is from/);
    status400(() => validateChangeset(CS([write({ facts: { thickness_mm: 200 } })]), { cite }), /set_parameter takes no facts — nothing is typed/);
    status400(() => validateChangeset(CS([write({ place: { TypeName: "BDS_EXT_ARC_CMU_200 mm", Mark: "W1" } })]), { cite }), /set_parameter takes no place\.Mark — only a create sets it/);
  });

  it("one set_parameter per type and parameter; another op carrying a set_parameter's fields is refused, never dropped", () => {
    status400(() => validateChangeset(CS([write(), write()]), { cite }), /elements\[1\]: a second set_parameter for the same element and Pset_WallCommon\.FireRating/);
    status400(() => validateChangeset(CS([{ ...wall(), to: "60 min" }])), /^elements\[0\]: create takes no to — only a set_parameter writes a value$/);
    status400(() => validateChangeset(CS([{ op: "attach", kind: "wall", target: { unique_id: TYPE_UID }, place: { BaseLevel: "L1", TopLevel: "L2" },
      validate: { identity: { Class: "IfcWall" } }, parameter: "Pset_WallCommon.FireRating" }])), /attach takes no parameter/);
  });

  it("the shared fixture: the add-in's body passes, every write field kept, each source the bridge's record (tools/promote-check writes the same body)", () => {
    const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/set-parameter-body.json", import.meta.url), "utf8"));
    const v = validateChangeset(body, { member: true, cite });
    expect(v).toMatchObject({ name: body.name, source: "promote" });
    v.elements.forEach((el, i) => {
      const sent = body.elements[i];
      expect(el).toMatchObject({ kind: sent.kind, op: sent.op, reason: sent.reason, place: sent.place });
      if (sent.op === "set_parameter") {
        expect(el).toMatchObject({ parameter: sent.parameter, revit_parameter: sent.revit_parameter, from: sent.from, to: sent.to, pretick: false });
        expect(el.value_source.kind).toBe(sent.value_source.kind);
        expect(el.validate.psets).toEqual(sent.validate.psets);
      }
    });
    expect(body.elements.map((e) => e.op)).toEqual(["retype", "retype", "set_parameter", "set_parameter"]);
    expect(v.exceptions).toEqual(body.exceptions);
  });
});
```

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted, needsTyping } from "./changesets-store.mjs";
```

with

```js
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted, needsTyping, needsCiting } from "./changesets-store.mjs";
```

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
    const machine = await proposeChangeset("demo", body, "agent", baseDeps({ myRole: async () => "service" }));
    expect(machine.elements[0].pretick).toBe(false);
    expect(machine.claimed).toBe(true);
  });
});
```

with

```js
    const machine = await proposeChangeset("demo", body, "agent", baseDeps({ myRole: async () => "service" }));
    expect(machine.elements[0].pretick).toBe(false);
    expect(machine.claimed).toBe(true);
  });
});

// MA-2c: a set_parameter's value_source is checked against the project's installed type catalogue and ids@n (project → office)
// before anything is stored, and each value written rides on the changeset_applied row ([BP] P2-7's param:apply, built once).
describe("proposeChangeset — set_parameter's source, checked by the bridge (MA-2c)", () => {
  const VS = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/value-sources.json", import.meta.url), "utf8"));
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));
  const write = (over = {}) => ({
    op: "set_parameter", kind: "wall", target: { unique_id: "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a01" }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
    parameter: "Pset_WallCommon.FireRating", revit_parameter: "Fire Rating", from: "", to: "60 min", value_source: { kind: "catalogue" },
    validate: { identity: { Class: "IfcWall", Name: "type BDS_EXT_ARC_CMU_200 mm" } }, ...over,
  });

  it("reads the catalogue and the ids@n (never the guideline: nothing is typed) and stores the bridge's record of the source, never pre-ticked", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: VS.catalog, ids: VS.ids }), myRole: async () => "contributor" });
    const cs = await proposeChangeset("ma2c", { name: "Promote (DD) · Level 1", source: "promote", elements: [write()] }, "lead@office.example", deps);
    expect(deps.resolveArtefact.mock.calls.map((c) => c.slice(0, 2))).toEqual([["ma2c", "type_catalog"], ["ma2c", "ids"]]);
    expect(cs.elements[0]).toMatchObject({ parameter: "Pset_WallCommon.FireRating", from: "", to: "60 min", pretick: false,
      value_source: { kind: "catalogue", ref: "type_catalog@1 · office · abababababab… · BDS_EXT_ARC_CMU_200 mm · Fire Rating", sha256: "ab".repeat(32) } });
    expect(deps.saved.get(cs.id).elements[0].value_source.kind).toBe("catalogue");
  });

  it("a value its source does not hold, or a source that is not installed, is a 400 and nothing is stored", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: VS.catalog }) });
    await expect(proposeChangeset("ma2c", { name: "t", elements: [write({ to: "90 min" })] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/gives BDS_EXT_ARC_CMU_200 mm Fire Rating "60 min", not "90 min"/) });
    await expect(proposeChangeset("ma2c", { name: "t", elements: [write({ kind: "door", place: { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" },
      parameter: "Pset_DoorCommon.FireRating", to: "FD30", value_source: { kind: "clause" } })] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/is a clause, and no ids@n is installed for this project or its office \(none — not installed for ma2c or its office\): not checkable/) });
    expect(deps.docInsert).not.toHaveBeenCalled();
    expect(deps.adjudicateProposal).not.toHaveBeenCalled();
  });

  it("the changeset_applied row carries each value written — its type, parameter, from, to and source; a set_parameter left unticked is not on it", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: VS.catalog, ids: VS.ids }) });
    const door = write({ kind: "door", target: { unique_id: "5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-00000a03" }, place: { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" },
      parameter: "Pset_DoorCommon.FireRating", to: "FD30", value_source: { kind: "clause" } });
    const cs = await proposeChangeset("ma2c", { name: "t", source: "promote", elements: [write(), door] }, "agent", deps);
    const [w, d] = cs.elements;
    await reportResult("ma2c", cs.id, { applied: [{ proposal_guid: w.proposal_guid, revit_element_id: 401 }], rejected: [d.proposal_guid] }, "revit", deps);
    const row = deps.audit.mock.calls.find((c) => c[3] === "changeset_applied");
    expect(row[6].values).toEqual([{ proposal_guid: w.proposal_guid, type: "BDS_EXT_ARC_CMU_200 mm", parameter: "Pset_WallCommon.FireRating", from: "", to: "60 min", value_source: w.value_source }]);
    const plain = await proposeChangeset("demo", BODY, "agent", deps);
    await reportResult("demo", plain.id, { applied: plain.elements.map((e, i) => ({ proposal_guid: e.proposal_guid, revit_element_id: 10 + i })), rejected: [] }, "revit", deps);
    expect(deps.audit.mock.calls.filter((c) => c[3] === "changeset_applied").at(-1)[6]).not.toHaveProperty("values");
  });

  it("needsCiting: only a body with a set_parameter reads the catalogue and the ids@n; needsTyping never types one", () => {
    expect(needsCiting(BODY)).toBe(false);
    expect(needsCiting({ elements: [write()] })).toBe(true);
    expect(needsTyping({ elements: [write({ place: {} })] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them, and see them fail.** From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs bridge/changesets-typing.test.mjs` — `Test Files  3 failed (3)`, `Tests  4 failed | 34 passed (38)` — the logic and typing files fail to load (`makeCiter` is not a function), and the store file's four new tests fail (the op is refused, `needsCiting` is not a function).

- [ ] **Step 3: The op, the source check, the row.**

In `WebApp/bridge/changesets-typing.mjs`, replace

```js
        guideline: g.label, guideline_sha256: g.sha256 ?? null, catalog: c.label, catalog_sha256: c.sha256 ?? null,
      },
    };
  };
}
```

with

```js
        guideline: g.label, guideline_sha256: g.sha256 ?? null, catalog: c.label, catalog_sha256: c.sha256 ?? null,
      },
    };
  };
}

// ── MA-2c: where a set_parameter's value comes from. The bridge, not the caller, says it (the trust rule): the cited artefact
// must hold exactly the value posted — a catalogue row of exactly that type, or the one value every whole-class clause of the
// installed ids@n pins. Never a guess: no row, two rows, two values, another value — each a 400 in words. The add-in's
// PropertyPlanner reads the same two sources; fixtures/changeset-ops/value-sources.json holds both sides to one table and one
// reading of the clauses.

/** The catalogue parameter a DD property is harvested under (Build Office System reads "Fire Rating" by its display name,
 *  GoldenModelExtractor.InterestingParams). A property not here has no catalogue source: the harvest reads no thermal value. */
export const CATALOG_PARAM = { "Pset_WallCommon.FireRating": "Fire Rating", "Pset_DoorCommon.FireRating": "Fire Rating" };
/** The IFC entity each Promote kind is adjudicated as (PromoteWallsPlanner.Classes' Ifc, as an IDS writes it): what a clause's
 *  applicability must match. */
export const KIND_ENTITY = { wall: "IFCWALL", floor: "IFCSLAB", roof: "IFCROOF", ceiling: "IFCCOVERING", door: "IFCDOOR", window: "IFCWINDOW" };

/** The values an installed ids@n pins for `key` ("Pset_X.Prop") on EVERY element of `entity`: a cited clause is a specification
 *  whose applicability is its entity alone (another facet narrows it to some elements) and whose required property carries one
 *  exact value (a pattern is not a value). [{value, spec, sentence}] in the IDS's order; two values are both returned — the
 *  caller says they disagree. */
export function clauseValues(ids, entity, key) {
  const [pset, prop] = String(key).split(".");
  const out = [];
  for (const s of Array.isArray(ids?.specifications) ? ids.specifications : []) {
    const a = s?.applicability;
    if (!a || typeof a !== "object" || typeof a.entity !== "string" || Object.keys(a).some((k) => k !== "entity")) continue;
    let re;
    try { re = new RegExp(a.entity, "i"); } catch { continue; }
    if (!re.test(entity)) continue;
    for (const p of Array.isArray(s.requirements?.properties) ? s.requirements.properties : [])
      if (p?.pset === pset && p?.name === prop && p.cardinality === "required" && p.pattern == null && typeof p.value === "string" && p.value.trim())
        out.push({ value: p.value.trim(), spec: String(s.name ?? ""), sentence: typeof s.source_sentence === "string" ? s.source_sentence : null });
  }
  return out;
}

/** The check validateChangeset runs on a set_parameter's value_source. `standards` = {catalog, ids}, each {body (null = none
 *  installed, or one that did not parse), label, sha256} as the typer's; `core` = the bundle (sameCategory). Returns (kind, place,
 *  key, to, valueSource, at) → the bridge's own record {kind, ref, sha256}, or throws a 400 that says what does not hold. */
export function makeCiter({ catalog: c, ids: s }, core) {
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  return (kind, place, key, to, vs, at) => {
    const lead = `${at}: set_parameter's value_source`;
    const want = to.trim();
    const label = place.FamilyName ? `${place.FamilyName} : ${place.TypeName}` : place.TypeName;
    if (vs.kind === "catalogue") {
      if (!c.body) throw err(400, `${lead} is the catalogue, and no type catalogue is installed for this project or its office (${c.label}): not checkable`);
      const name = CATALOG_PARAM[key];
      if (!name) throw err(400, `${lead} is the catalogue, and the catalogue harvests no parameter for ${key} — a person fills it`);
      const cat = KIND_CATEGORY[kind];
      const rows = c.body.types.filter((r) => core.sameCategory(r, cat) && norm(r.type) === norm(place.TypeName)
        && (!place.FamilyName || norm(r.family) === norm(place.FamilyName)));
      if (rows.length !== 1) throw err(400, `${lead}: ${c.label} has ${rows.length ? `${rows.length} rows` : "no row"} for ${cat} ${label} — one row is one source`);
      const got = typeof rows[0].params?.[name] === "string" ? rows[0].params[name].trim() : "";
      if (got !== want) throw err(400, `${lead}: ${c.label} gives ${label} ${name} "${got}", not "${want}" — a value is written only as its source holds it`);
      return { kind: "catalogue", ref: `${c.label} · ${label} · ${name}`, sha256: c.sha256 ?? null };
    }
    if (!s.body) throw err(400, `${lead} is a clause, and no ids@n is installed for this project or its office (${s.label}): not checkable`);
    const hits = clauseValues(s.body, KIND_ENTITY[kind], key);
    const values = [...new Set(hits.map((h) => h.value))];
    if (values.length === 0) throw err(400, `${lead}: no clause of ${s.label} pins one value of ${key} for every ${KIND_ENTITY[kind]}`);
    if (values.length > 1) throw err(400, `${lead}: the clauses of ${s.label} pin ${values.map((v) => `"${v}"`).join(" and ")} for ${key} — they disagree; a person decides`);
    if (values[0] !== want) throw err(400, `${lead}: ${s.label} pins "${values[0]}" for ${key}, not "${want}" — a value is written only as its source holds it`);
    const h = hits[0];
    return { kind: "clause", ref: `${s.label} · ${h.spec}` + (h.sentence ? ` · "${h.sentence}"` : ""), sha256: s.sha256 ?? null };
  };
}
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
 *  an existing wall. An element without op is a create. */
export const OPS = ["create", "retype", "attach"];
/** The kinds each op takes. */
export const OP_KINDS = { create: VOCABULARY, retype: ["wall", "floor", "roof", "ceiling", "door", "window"], attach: ["wall"] };
```

with

```js
 *  an existing wall. An element without op is a create. MA-2c: set_parameter writes one value on an existing TYPE, named by its
 *  UniqueId, from a cited source the bridge checks (value_source) — [BP] P2-7's item, built once. */
export const OPS = ["create", "retype", "attach", "set_parameter"];
/** The kinds each op takes. */
export const OP_KINDS = { create: VOCABULARY, retype: ["wall", "floor", "roof", "ceiling", "door", "window"], attach: ["wall"],
  set_parameter: ["wall", "floor", "roof", "ceiling", "door", "window"] };
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence", "facts"]; // what an element is rebuilt from
```

with

```js
// MA-2c: a set_parameter's parameter, the Revit parameter's name, the value the plan read (from), the value to write (to) and
// where it comes from (value_source — the bridge checks it and writes its own record).
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence", "facts",
  "parameter", "revit_parameter", "from", "to", "value_source"]; // what an element is rebuilt from
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
 *  bridge cannot tell from any other holder of the token, earns no pre-tick by writing "promote". */
const pretickOf = (op, source, target, member) =>
  member === true && op !== "create" && source === "promote" && (op === "attach" || target?.type_before != null);
```

with

```js
 *  bridge cannot tell from any other holder of the token, earns no pre-tick by writing "promote". MA-2c: a set_parameter is
 *  never pre-ticked — a type edit reaches every element on the type (founder decision F1). */
const pretickOf = (op, source, target, member) =>
  member === true && source === "promote" && (op === "attach" || (op === "retype" && target?.type_before != null));

const PSET_KEY = /^Pset_[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;
const VALUE_SOURCES = ["catalogue", "clause"];

/** MA-2c (set_parameter, [BP] P2-7's item, built once): the type it writes (place.TypeName, and FamilyName for a door or
 *  window), the parameter ("Pset_X.Prop"), the Revit parameter's name, the value the plan read (`from`, "" when empty — the
 *  executor's stale guard compares it), the value to write and where it comes from. `cite` (changesets-typing.makeCiter) checks
 *  the source against the installed artefact and returns the bridge's own record; a source it cannot check is a 400 — nothing is
 *  written unchecked, and a person's own value is typed in Revit, not filed here. */
function checkWrite(el, place, at, cite) {
  if (!text(place.TypeName, 256)) throw err(400, `${at}: set_parameter needs place.TypeName — the type whose parameter it writes`);
  if ((el.kind === "door" || el.kind === "window") && !text(place.FamilyName, 256))
    throw err(400, `${at}: a ${el.kind} set_parameter needs place.FamilyName — a type name alone is not one type`);
  if (typeof el.parameter !== "string" || !PSET_KEY.test(el.parameter)) throw err(400, `${at}: set_parameter needs parameter, a "Pset_Name.Property" key`);
  if (el.revit_parameter != null && (!text(el.revit_parameter, 256) || CONTROL_CHAR.test(el.revit_parameter)))
    throw err(400, `${at}: revit_parameter must be one line of at most 256 characters`);
  if (typeof el.from !== "string" || el.from.length > 500 || CONTROL_CHAR.test(el.from))
    throw err(400, `${at}: set_parameter needs from — the value the plan read, "" when empty (the stale guard compares it)`);
  if (!text(el.to, 500) || CONTROL_CHAR.test(el.to)) throw err(400, `${at}: set_parameter needs to — one line of at most 500 characters`);
  if (el.to.trim() === el.from.trim()) throw err(400, `${at}: set_parameter's to is its from — nothing to write`);
  const vs = el.value_source;
  if (!vs || typeof vs !== "object" || Array.isArray(vs) || !VALUE_SOURCES.includes(vs.kind))
    throw err(400, `${at}: set_parameter needs value_source {kind: ${VALUE_SOURCES.join(" | ")}} — a value is written from a cited source, never a guess; a person types their own in Revit`);
  if (!cite) throw err(400, `${at}: the bridge read no standards to check this value_source — nothing is written unchecked`);
  return {
    parameter: el.parameter, revit_parameter: el.revit_parameter == null ? null : el.revit_parameter.trim(), from: el.from, to: el.to.trim(),
    value_source: cite(el.kind, place, el.parameter, el.to, vs, at),
  };
}
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
 *  Every element carries `typing` ({typed_by: "caller"} for one that named its type); a bridge-typed one is never pre-ticked. */
export function validateChangeset(body, { member = false, type = null } = {}) {
```

with

```js
 *  Every element carries `typing` ({typed_by: "caller"} for one that named its type); a bridge-typed one is never pre-ticked.
 *  MA-2c: with `cite` — changesets-typing.makeCiter over the project's type catalogue and ids@n — a set_parameter's value_source is
 *  checked and replaced by the bridge's own record; without one a set_parameter is a 400. */
export function validateChangeset(body, { member = false, type = null, cite = null } = {}) {
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
    nested(el.validate?.identity, null, `${at}.validate.identity`);
    const op = el.op ?? "create";
```

with

```js
    nested(el.validate?.identity, null, `${at}.validate.identity`);
    nested(el.value_source, ["kind"], `${at}.value_source`); // MA-2c: the bridge writes the rest of the record itself
    const op = el.op ?? "create";
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
    const facts = checkFacts(el.facts, at);
    if (facts && op === "attach") throw err(400, `${at}: attach takes no facts — nothing is typed`);
```

with

```js
    const facts = checkFacts(el.facts, at);
    if (facts && (op === "attach" || op === "set_parameter")) throw err(400, `${at}: ${op} takes no facts — nothing is typed`);
    // MA-2c: a set_parameter's own fields ride on no other op — each would be dropped silently.
    if (op !== "set_parameter")
      for (const f of ["parameter", "revit_parameter", "from", "to", "value_source"])
        if (el[f] !== undefined) throw err(400, `${at}: ${op} takes no ${f} — only a set_parameter writes a value`);
    let written = null; // a set_parameter's checked fields
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
      for (const f of Object.keys(PLACE_FIELDS))
        if (p[f] !== undefined && !(f === "FamilyName" && op === "retype" && PLACE_FIELDS.FamilyName.includes(el.kind)))
          throw err(400, `${at}: ${op} takes no place.${f} — only a create sets it`);
```

with

```js
      for (const f of Object.keys(PLACE_FIELDS))
        if (p[f] !== undefined && !(f === "FamilyName" && (op === "retype" || op === "set_parameter") && PLACE_FIELDS.FamilyName.includes(el.kind)))
          throw err(400, `${at}: ${op} takes no place.${f} — only a create sets it`);
      if (op === "set_parameter") {
        if (before !== null) throw err(400, `${at}: set_parameter takes no target.type_before — its stale guard is from`);
        written = checkWrite(el, place, at, cite);
      }
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
      const k = `${op}:${uid.toLowerCase()}`;
      if (seen.has(k)) throw err(400, `${at}: a second ${op} for the same element`);
```

with

```js
      // MA-2c: one set_parameter per type and parameter.
      const k = `${op}:${uid.toLowerCase()}` + (written ? `:${written.parameter.toLowerCase()}` : "");
      if (seen.has(k)) throw err(400, `${at}: a second ${op} for the same element` + (written ? ` and ${written.parameter}` : ""));
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
      validate: { identity, psets: entries(validate.psets, "psets"), quantities: entries(validate.quantities, "quantities") },
      place,
```

with

```js
      validate: { identity, psets: entries(validate.psets, "psets"), quantities: entries(validate.quantities, "quantities") },
      place,
      ...(written ?? {}), // MA-2c: a set_parameter's parameter, from, to and the bridge's value_source
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
import { makeTyper } from "./changesets-typing.mjs";
```

with

```js
import { makeTyper, makeCiter } from "./changesets-typing.mjs";
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
 *  grid, never an attach) that names no place.TypeName? Only then are the standards read. */
export const needsTyping = (body) => Array.isArray(body?.elements) && body.elements.some((e) => e && typeof e === "object"
  && (e.op ?? "create") !== "attach" && e.kind !== "level" && e.kind !== "grid"
  && !(e.place && typeof e.place === "object" && typeof e.place.TypeName === "string" && e.place.TypeName.trim() !== ""));

/** The typer for `key`: its guideline@n and type_catalog@n (project → office), each re-checked with the install validator — one
 *  installed before a check existed is none with its reason — and the bundle's resolver. The GET is the add-in's read too. */
async function typerFor(key, d) {
  const core = await import("./sentinel-core.mjs");
  const read = async (kind) => {
    const a = await d.resolveArtefact(key, kind);
    if (a.source === "none") return { body: null, label: `none — not installed for ${key} or its office`, sha256: null };
    try { validateArtefact(kind, a.body); } catch (e) { return { body: null, label: `none — ${refLabel(a)} did not parse: ${e.message}`, sha256: null }; }
    return { body: a.body, label: refLabel(a), sha256: a.sha256 };
  };
  const [guideline, catalog] = await Promise.all([read("guideline"), read("type_catalog")]);
  return makeTyper({ guideline, catalog }, core);
}
```

with

```js
 *  grid, never an attach or a set_parameter) that names no place.TypeName? Only then are the standards read. */
export const needsTyping = (body) => Array.isArray(body?.elements) && body.elements.some((e) => e && typeof e === "object"
  && !["attach", "set_parameter"].includes(e.op ?? "create") && e.kind !== "level" && e.kind !== "grid"
  && !(e.place && typeof e.place === "object" && typeof e.place.TypeName === "string" && e.place.TypeName.trim() !== ""));

/** MA-2c: does a posted body hold a set_parameter? Only then are the type catalogue and the ids@n read, to check its source. */
export const needsCiting = (body) => Array.isArray(body?.elements) && body.elements.some((e) => e?.op === "set_parameter");

/** One standard of `key` (project → office), re-checked with the install validator — one installed before a check existed is none
 *  with its reason. The GET is the add-in's read too. */
async function standardOf(key, kind, d) {
  const a = await d.resolveArtefact(key, kind);
  if (a.source === "none") return { body: null, label: `none — not installed for ${key} or its office`, sha256: null };
  try { validateArtefact(kind, a.body); } catch (e) { return { body: null, label: `none — ${refLabel(a)} did not parse: ${e.message}`, sha256: null }; }
  return { body: a.body, label: refLabel(a), sha256: a.sha256 };
}

/** The typer for `key`: its guideline@n and type_catalog@n and the bundle's resolver. */
async function typerFor(key, d) {
  const core = await import("./sentinel-core.mjs");
  const [guideline, catalog] = await Promise.all([standardOf(key, "guideline", d), standardOf(key, "type_catalog", d)]);
  return makeTyper({ guideline, catalog }, core);
}

/** MA-2c: the check of a set_parameter's source for `key`: its type_catalog@n and ids@n, and the bundle's category match. */
async function citerFor(key, d) {
  const core = await import("./sentinel-core.mjs");
  const [catalog, ids] = await Promise.all([standardOf(key, "type_catalog", d), standardOf(key, "ids", d)]);
  return makeCiter({ catalog, ids }, core);
}
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  const type = needsTyping(body) ? await typerFor(key, d) : null;
  const v = validateChangeset(body, { member: role != null && role !== "service", type }); // 400/413 before any changeset is stored
```

with

```js
  const type = needsTyping(body) ? await typerFor(key, d) : null;
  // MA-2c: a set_parameter's value is written only as an installed catalogue or clause holds it — the bridge checks the source.
  const cite = needsCiting(body) ? await citerFor(key, d) : null;
  const v = validateChangeset(body, { member: role != null && role !== "service", type, cite }); // 400/413 before any changeset is stored
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
    { status: "proposed" },
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note });
```

with

```js
  // MA-2c ([BP] P2-7's param:apply, built once): each value written — its type, parameter, from, to and the bridge's record of its
  // source — rides on the changeset_applied row.
  const done = new Set(appliedArr.map((a) => a.proposal_guid));
  const values = cs.elements.filter((e) => e.op === "set_parameter" && done.has(e.proposal_guid)).map((e) => ({
    proposal_guid: e.proposal_guid, type: e.place?.FamilyName ? `${e.place.FamilyName} : ${e.place.TypeName}` : e.place?.TypeName ?? null,
    parameter: e.parameter, from: e.from, to: e.to, value_source: e.value_source ?? null,
  }));
  await d.audit(proj.id, "changeset", id, "changeset_applied", actor || "revit",
    { status: "proposed" },
    { status, applied: updated.result.applied, rejected: rejectedArr.length, note: updated.result.note, ...(values.length ? { values } : {}) });
```

In `WebApp/bridge/mcp-server.mjs`, replace

```js
attach re-tops an existing wall (place.BaseLevel and place.TopLevel, two different level names); one of each per element.
```

with

```js
attach re-tops an existing wall (place.BaseLevel and place.TopLevel, two different level names); one of each per element. set_parameter writes one value on an existing TYPE named by target:{unique_id} with place.TypeName (and a door's or window's place.FamilyName): parameter \"Pset_Name.Property\", revit_parameter?, from (the value read on the type, \"\" when empty — Revit refuses the write when the type no longer reads it), to, and value_source {kind: catalogue | clause}; the bridge checks the value against the installed type catalogue's row of exactly that type, or the one value the installed ids@n's whole-class clauses pin, and refuses anything else (a person types their own value in Revit); one per type and parameter, never pre-ticked.
```

(The MCP tool's description is one string: the text to find sits inside it, so the replacement stays inside it.)

- [ ] **Step 4: Run them, and see them pass.** The same command — `Test Files  3 passed (3)`, `Tests  141 passed (141)`.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-logic.test.mjs WebApp/bridge/changesets-typing.mjs WebApp/bridge/changesets-typing.test.mjs WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-store.test.mjs WebApp/bridge/mcp-server.mjs WebApp/bridge/fixtures/changeset-ops/value-sources.json WebApp/bridge/fixtures/changeset-ops/set-parameter-body.json
git commit -F - <<'EOF'
feat(changesets): set_parameter - one value on a type from a cited source the bridge checks (catalogue row or whole-class ids@n clause), never pre-ticked, each value on the changeset_applied row (MA-2c, [BP] P2-7 built once)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 2 — C#: the DD properties Promote fills, from the catalogue or a clause, or a person — and the body it files

**Files:**
- Create `SentinelAddin/GhostBuilder/PropertyPlanner.cs` — `TypeValue`, `Clauses`, `PropertyRow`, `PropertyReport`, `PropertyPlanner`
- Modify `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` — `CatalogEntry.Params`, `CatalogValue`
- Modify `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` — `PromoteGhost`'s write fields, `StoreyPlan.Settled` / `ToPerson`, the walls' settled types, the body
- Modify `SentinelAddin/GhostBuilder/PromotePlanner.cs` — the other classes' settled types
- Modify `SentinelAddin/Coordination/ChangesetClient.cs` — the DTO's write fields, `ValueSourceDto`, `PreTick`
- Create `tools/promote-check/PropertyChecks.cs`; modify `tools/promote-check/Check.cs`, `promote-check.csproj`

**Interfaces:**
- Consumes: `fixtures/changeset-ops/value-sources.json` and `set-parameter-body.json` (Task 1).
- Produces: `GuidelineMatcher.CatalogValue(string category, string family, string type, string param) → string` (null = none); `TypeValue {Category, Family, Type, UniqueId, Key, Current, Param, NoWriter, Instances, Label}`; `Clauses.None(label)`, `Clauses.FromIds(json, label, out error)`, `Clauses.For(entity, key) → List<(Value, Spec, Sentence)>`, `Clauses.Label`, `Clauses.Installed`; `PropertyPlanner.CatalogParam`, `PropertyPlanner.Entity(category)`, `PropertyPlanner.DdTypes(plans, mx) → List<(Category, Family, Type)>`, `PropertyPlanner.Plan(plans, mx, values, m, clauses) → PropertyReport` (`Rows`, `Written`, `NoSource`, `NoSourceElements`, `Other`, `Line`, `Lines()`); `PromoteGhost.Parameter / RevitParameter / From / To / SourceKind`; `StoreyPlan.Settled`, `StoreyPlan.ToPerson`; `ChangesetElementDto.Parameter / RevitParameter / From / To / ValueSource`.

- [ ] **Step 1: The checks (sections 33 and 34).**

`Create` `tools/promote-check/PropertyChecks.cs`:

```csharp
#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    static JsonObject ValueSources() =>
        JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "value-sources.json"))).AsObject();

    // ── 33. MA-2c: where a set_parameter's value comes from — the add-in's reading of the shared fixture the bridge's
    //        changesets-typing reads (CATALOG_PARAM, KIND_ENTITY, clauseValues): one table, one reading of the clauses ─────────
    static void ValueSourceChecks()
    {
        Console.WriteLine("\nMA-2c — value sources (WebApp/bridge/fixtures/changeset-ops/value-sources.json)");
        var vs = ValueSources();
        var cp = vs["catalog_param"].AsObject();
        Ok(cp.Count == PropertyPlanner.CatalogParam.Count && cp.All(kv => PropertyPlanner.CatalogParam.TryGetValue(kv.Key, out var v) && v == (string)kv.Value),
           "the catalogue parameter of each DD property is the bridge's CATALOG_PARAM");
        var ke = vs["kind_entity"].AsObject();
        Ok(ke.Count == PromoteWallsPlanner.Classes.Count && ke.All(kv => PromoteWallsPlanner.Classes[kv.Key].Ifc.ToUpperInvariant() == (string)kv.Value)
           && PropertyPlanner.Entity("Ceilings") == "IFCCOVERING",
           "each Promote kind's IFC entity is the bridge's KIND_ENTITY");
        var cl = Clauses.FromIds(vs["ids"].ToJsonString(), "ids@1 · project · 0a1b2c3d4e5f…", out var err);
        var cases = vs["clauses"].AsArray();
        int same = 0;
        foreach (var c in cases)
        {
            var got = cl.For((string)c["entity"], (string)c["key"]);
            bool ok = got.Select(x => x.Value).SequenceEqual(c["values"].AsArray().Select(x => (string)x))
                      && (c["spec"] == null || (got[0].Spec == (string)c["spec"] && got[0].Sentence == (string)c["sentence"]));
            if (ok) same++;
            else Console.WriteLine($"        {(string)c["name"]}: got [{string.Join(", ", got.Select(x => x.Value))}]");
        }
        Ok(err == null && cl.Installed && cases.Count == 6 && same == cases.Count,
           $"every shared clause case ({same}/{cases.Count}) reads as the bridge's clauseValues: a whole-class clause's one exact value, nothing else");
        var bad = Clauses.FromIds("{", "ids@1 · project · 0a1b2c3d4e5f…", out var be);
        Ok(be != null && bad.For("IFCDOOR", "Pset_DoorCommon.FireRating").Count == 0 && bad.Label.StartsWith("ids@1 · project · 0a1b2c3d4e5f… did not parse: "),
           "an ids@n body that does not parse cites nothing, and says so");
        var m = GuidelineMatcher.FromBodies(null, vs["catalog"].ToJsonString(), out _, out var ce);
        Ok(ce == null && m.CatalogValue("Walls", null, "BDS_EXT_ARC_CMU_200 mm", "Fire Rating") == "60 min"
           && m.CatalogValue("Walls", null, "BDS_INT_ARC_GYPS_100 mm", "Fire Rating") == null
           && m.CatalogValue("Doors", "BDS_INT_2 PNL", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "Fire Rating") == "FD60"
           && m.CatalogValue("Doors", "BDS_INT_1 PNL", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "Fire Rating") == null,
           "a catalogue row gives its harvested parameter for exactly its type (and family): filled, or none");
        var real = GuidelineMatcher.FromBodies(null, File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        Ok(real.CatalogValue("Walls", null, "BDS_EXT_ARC_CMU_200 mm", "Fire Rating") == null && real.CatalogValue("Walls", null, "Interior - 121mm Partition (1-hr)", "Fire Rating") == "1 HR"
           && real.CatalogValue("Doors", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", "Fire Rating") == null,
           "the BDS pilot catalogue gives no Fire Rating for the types the DD rules produce (drill MA2b) — only its stock partitions carry one");
    }

    // ── 34. MA-2c: the DD properties Promote fills (PropertyPlanner) and the body it files, held to the fixture the bridge
    //        validates (WebApp/bridge/fixtures/changeset-ops/set-parameter-body.json) ─────────────────────────────────────────────
    static void PropertyPlannerChecks()
    {
        Console.WriteLine("\nMA-2c — the DD properties Promote fills (PropertyPlanner; WebApp/bridge/fixtures/changeset-ops/set-parameter-body.json)");
        var vs = ValueSources();
        var m = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json")), vs["catalog"].ToJsonString(), out _, out _);
        m.CatalogLabel = "type_catalog@1 · office · fedcba987654…";
        var mx = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd-ma2b.json")), out _);
        var clauses = Clauses.FromIds(vs["ids"].ToJsonString(), "ids@1 · project · 0a1b2c3d4e5f…", out _);
        string U(int n) => $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{n:x8}";
        ElementFact At(ElementFact f, int n) { f.UniqueId = U(n); return f; }
        var walls = new List<WallFact>
        {
            new WallFact { UniqueId = U(0x190), Label = "W 312312", TypeName = "Generic - 200mm", Function = "Exterior", WidthMm = 200, BaseLevel = "Level 1", TopLevel = "Level 2", IsBasic = true },
            new WallFact { UniqueId = U(0x191), Label = "W 312313", TypeName = "BDS_INT_ARC_GYPS_100 mm", Function = "Interior", WidthMm = 100, BaseLevel = "Level 1", TopLevel = "Level 2", IsBasic = true },
        };
        var others = new List<ElementFact>
        {
            At(Dw("door", "Door 404", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100), 0x194),
            At(Dw("door", "Door 405", "BDS_INT_2 PNL", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", 2000, 2100, host: "BDS_INT_ARC_GYPS_100 mm"), 0x195),
        };
        TypeValue TV(string cat, string fam, string type, int n, int instances, string current = "", string noWriter = null) => new TypeValue
        {
            Category = cat, Family = fam, Type = type, UniqueId = U(n), Key = cat == "Walls" ? "Pset_WallCommon.FireRating" : "Pset_DoorCommon.FireRating",
            Current = current, Param = "Fire Rating", NoWriter = noWriter, Instances = instances,
        };
        var values = new List<TypeValue>
        {
            TV("Walls", null, "BDS_EXT_ARC_CMU_200 mm", 0xa01, 0), TV("Walls", null, "BDS_INT_ARC_GYPS_100 mm", 0xa02, 1),
            TV("Doors", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", 0xa03, 0), TV("Doors", "BDS_INT_2 PNL", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", 0xa04, 1),
        };

        var plans = V1(m, others, walls);
        var types = PropertyPlanner.DdTypes(plans, mx);
        Ok(types.Select(t => t.Type).SequenceEqual(new[] { "BDS_INT_ARC_GYPS_100 mm", "BDS_INT_2 PNL_WOOD_2000 x 2100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" })
           && types[1].Family == "BDS_INT_2 PNL" && types[0].Family == null,
           "the DD types the plan lands elements on: the settled ones first, then the retype targets, once each (" + string.Join(", ", types.Select(t => t.Type)) + ")");
        var rep = PropertyPlanner.Plan(plans, mx, values, m, clauses);
        var p = plans.Single();
        string O(string type) => rep.Rows.FirstOrDefault(r => r.Label.EndsWith(type))?.Outcome;
        Ok(O("BDS_EXT_ARC_CMU_200 mm") == "write" && O("BDS_INT_1 PNL_WOOD_1000 x 2100 mm") == "write" && O("BDS_INT_ARC_GYPS_100 mm") == "no source"
           && O("BDS_INT_2 PNL_WOOD_2000 x 2100 mm") == "disagree" && rep.Rows.Count == 4,
           "a source writes; no source, and a catalogue and a clause that disagree, go to a person — never a pick");
        var cmu = p.Ghosts.Single(g => g.Op == "set_parameter" && g.TypeName == "BDS_EXT_ARC_CMU_200 mm");
        var door = p.Ghosts.Single(g => g.Op == "set_parameter" && g.FamilyName == "BDS_INT_1 PNL");
        Ok(cmu.Kind == "wall" && cmu.UniqueId == U(0xa01) && cmu.From == "" && cmu.To == "60 min" && cmu.SourceKind == "catalogue" && cmu.RevitParameter == "Fire Rating"
           && cmu.Reason == "DD walls: Pset_WallCommon.FireRating \"60 min\" from type_catalog@1 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating — a type edit: every element on BDS_EXT_ARC_CMU_200 mm reads it (0 in the model now, 1 more that this changeset retypes onto it)",
           "the catalogue row of exactly the target type gives the wall type's Fire Rating; the reason says it is a type edit and how many elements read it");
        Ok(door.Kind == "door" && door.To == "FD30" && door.SourceKind == "clause"
           && door.Reason.Contains("from ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · \"All doors shall be FD30.\""),
           "a whole-class clause of the installed ids@n gives the door type's Fire Rating, cited with its sentence");
        Ok(p.ToPerson.Count == 2 && p.ToPerson[0].UniqueId == U(0xa02) && p.ToPerson[0].Label == "type BDS_INT_ARC_GYPS_100 mm · Pset_WallCommon.FireRating"
           && p.ToPerson[0].Reason == "no source for Pset_WallCommon.FireRating on BDS_INT_ARC_GYPS_100 mm — type_catalog@1 · office · fedcba987654… gives no Fire Rating for it, and no clause of ids@1 · project · 0a1b2c3d4e5f… pins one; a person fills it in Revit (Type Properties) — 1 element(s) on it"
           && p.ToPerson[1].Reason.StartsWith("the sources disagree on Pset_DoorCommon.FireRating for BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm: \"FD60\" (type_catalog@1"),
           "each property sent to a person names the type, the property and why");
        Ok(rep.Line == "DD properties: 2 type edit(s) from a cited source (never pre-ticked) · 1 with no source — sent to a person (1 element(s) on those types) · 1 sent to a person for another reason"
           && rep.Lines()[2] == "✎ Walls · BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating → \"60 min\" (type_catalog@1 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating)",
           "Promote's header line counts what is written and what has no source (drill MA2 records it)");

        // Nothing written over a filled value, nothing for a property the type does not hold, nothing a writer cannot write.
        var filled = PropertyPlanner.Plan(V1(m, others, walls), mx, values.Select(v => v.Type == "BDS_EXT_ARC_CMU_200 mm" ? TV("Walls", null, v.Type, 0xa01, 0, "120 min") : v).ToList(), m, clauses);
        var notHeld = PropertyPlanner.Plan(V1(m, others, walls), mx, values.Where(v => v.Type != "BDS_EXT_ARC_CMU_200 mm").ToList(), m, clauses);
        var noWriter = V1(m, others, walls);
        var nw = PropertyPlanner.Plan(noWriter, mx, values.Select(v => v.Type == "BDS_EXT_ARC_CMU_200 mm" ? TV("Walls", null, v.Type, 0xa01, 0, "", "Fire Rating is read-only on the type") : v).ToList(), m, clauses);
        Ok(filled.Rows.All(r => r.Label != "BDS_EXT_ARC_CMU_200 mm") && notHeld.Rows.All(r => r.Label != "BDS_EXT_ARC_CMU_200 mm")
           && nw.Rows.Single(r => r.Label == "BDS_EXT_ARC_CMU_200 mm").Outcome == "no writer"
           && noWriter.Single().Ghosts.All(g => g.TypeName != "BDS_EXT_ARC_CMU_200 mm" || g.Op == "retype")
           && noWriter.Single().ToPerson.Any(h => h.Reason.EndsWith("but Fire Rating is read-only on the type — a person sets it in Revit")),
           "a filled value is left as it is; a property the type does not hold is not touched; one Revit cannot write goes to a person with the value and why");
        var none = PropertyPlanner.Plan(V1(m, others, walls), mx, values, m, Clauses.None("none — not installed for ma2c or its office"));
        Ok(none.Rows.Single(r => r.Label == "BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm").Why.Contains("and no ids@n is installed to cite (none — not installed for ma2c or its office)"),
           "with no ids@n installed, a property with no catalogue value says there is no clause to cite");

        // The body, held to the fixture the bridge validates; read back into the add-in's DTOs.
        var got = Json(PromoteWallsPlanner.Bodies(plans, "yazan", title: "Promote (DD)")).Single();
        var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "set-parameter-body.json");
        var text = File.Exists(path) ? File.ReadAllText(path) : "null";
        bool same = JsonNode.DeepEquals(got, JsonNode.Parse(text));
        Ok(same, "the planner's body with its set_parameter rows equals the fixture the bridge validates");
        if (!same) Console.WriteLine("        got: " + got.ToJsonString(new JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        var cs = same ? JsonSerializer.Deserialize<ChangesetDto>(text) : null;
        var sp = cs?.Elements.FirstOrDefault(e => e.Op == "set_parameter");
        Ok(sp != null && sp.Parameter == "Pset_WallCommon.FireRating" && sp.From == "" && sp.To == "60 min" && sp.ValueSource?.Kind == "catalogue"
           && sp.Target.UniqueId == U(0xa01) && sp.Place.TypeName == "BDS_EXT_ARC_CMU_200 mm" && cs.Exceptions.Count == 2,
           "a set_parameter reads into ChangesetElementDto (Parameter, From, To, ValueSource); the properties sent to a person into the exceptions");
        if (sp != null) sp.Pretick = true;
        Ok(sp != null && !ChangesetTrust.PreTick(cs, sp), "a set_parameter is never pre-ticked, whatever a bridge answers (founder decision F1)");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        Ma2bWiringChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        Ma2bWiringChecks();
        ValueSourceChecks();
        PropertyPlannerChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\LodState.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\LodState.cs" />
    <!-- MA-2c: the DD properties Promote fills from a cited source (set_parameter), or sends to a person -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\PropertyPlanner.cs" />
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` — it fails to compile — `1 Error(s)`: `CSC : error CS2001: Source file '…\SentinelAddin\GhostBuilder\PropertyPlanner.cs' could not be found`.

- [ ] **Step 3: The planner and the body.**

`Create` `SentinelAddin/GhostBuilder/PropertyPlanner.cs`:

```csharp
#nullable disable
// MA-2c — the DD properties Promote fills (design §3.3 op 4, [BP] P2-7's set_parameter built once), pure (no Revit API, no HTTP),
// so tools/promote-check drives it. A DD type the plan lands elements on — one they already stand on, or a retype's target — whose
// matrix property is EMPTY on the type gets one set_parameter type edit, when a cited source holds exactly one value for it: the
// catalogue row of exactly that type (type_catalog@n params, harvested by display name: CatalogParam) or an installed clause (an
// ids@n specification whose applicability is the whole class and whose required property pins one value: Clauses). Otherwise the
// property goes to a person with why — no source, sources that disagree, no parameter Sentinel can write — and is counted.
// NEVER A GUESS, NEVER A NEW TYPE: a value comes from an installed artefact, and the type is the one the plan names (Sentinel
// creates no types). A TYPE edit reaches every element on the type: the row says how many, and the bridge never pre-ticks it
// (founder decision F1). The bridge's changesets-typing (CATALOG_PARAM, clauseValues, makeCiter) reads the same two sources; the
// shared fixture WebApp/bridge/fixtures/changeset-ops/value-sources.json holds both sides to one table and one reading.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    /// <summary>One DD type's matrix property as Revit holds it on the TYPE (Commands.PromoteWalls.TypeValues, API thread).</summary>
    public sealed class TypeValue
    {
        /// <summary>Family: a door's or window's family; null for a system type (walls, floors, roofs, ceilings).</summary>
        public string Category, Family, Type, UniqueId, Key;
        /// <summary>The value as the IDS reads it on the type, "" when empty.</summary>
        public string Current;
        /// <summary>The Revit parameter that holds it on the type ("Fire Rating"), and why Sentinel cannot write it (null = it can).</summary>
        public string Param, NoWriter;
        /// <summary>The elements on the type in the model now.</summary>
        public int Instances;
        public string Label => Family == null ? Type : Family + " : " + Type;
    }

    /// <summary>The clauses of the installed ids@n a value may be cited from: a specification whose applicability is its entity
    /// alone (another facet narrows it to some elements) and whose required property carries one exact value (a pattern is not a
    /// value). The bridge's clauseValues reads them the same way.</summary>
    public sealed class Clauses
    {
        private sealed class Row { public string Entity, Pset, Prop, Value, Spec, Sentence; }
        private readonly List<Row> _rows = new List<Row>();
        /// <summary>The ids@n's label ("ids@1 · project · 0a1b2c3d4e5f…"), or why there is none.</summary>
        public string Label;
        /// <summary>An ids@n was read (it may still pin nothing).</summary>
        public bool Installed;

        public static Clauses None(string label) => new Clauses { Label = label };

        /// <summary>The ids@n body → its clauses; one that does not parse cites nothing, with <paramref name="error"/>. Never throws.</summary>
        public static Clauses FromIds(string json, string label, out string error)
        {
            error = null;
            var c = new Clauses { Label = label, Installed = true };
            try
            {
                using (var d = JsonDocument.Parse(json ?? ""))
                {
                    if (d.RootElement.ValueKind != JsonValueKind.Object || !d.RootElement.TryGetProperty("specifications", out var specs) || specs.ValueKind != JsonValueKind.Array) return c;
                    foreach (var s in specs.EnumerateArray())
                    {
                        if (s.ValueKind != JsonValueKind.Object || !s.TryGetProperty("applicability", out var a) || a.ValueKind != JsonValueKind.Object) continue;
                        if (a.EnumerateObject().Any(p => p.Name != "entity") || Str(a, "entity") is not string entity) continue;
                        if (!s.TryGetProperty("requirements", out var r) || r.ValueKind != JsonValueKind.Object
                            || !r.TryGetProperty("properties", out var props) || props.ValueKind != JsonValueKind.Array) continue;
                        foreach (var p in props.EnumerateArray())
                        {
                            if (p.ValueKind != JsonValueKind.Object || Str(p, "cardinality") != "required") continue;
                            if (p.TryGetProperty("pattern", out var pt) && pt.ValueKind != JsonValueKind.Null) continue;
                            var value = Str(p, "value")?.Trim();
                            if (string.IsNullOrEmpty(value) || Str(p, "pset") == null || Str(p, "name") == null) continue;
                            c._rows.Add(new Row { Entity = entity, Pset = Str(p, "pset"), Prop = Str(p, "name"), Value = value, Spec = Str(s, "name") ?? "", Sentence = Str(s, "source_sentence") });
                        }
                    }
                }
            }
            catch (Exception ex) { error = ex.Message; return None(label + " did not parse: " + ex.Message); }
            return c;
        }

        /// <summary>The values the clauses pin for <paramref name="key"/> ("Pset_X.Prop") on every <paramref name="entity"/>
        /// ("IFCDOOR"), in the IDS's order; two values are both returned — the caller says they disagree.</summary>
        public List<(string Value, string Spec, string Sentence)> For(string entity, string key)
        {
            int dot = (key ?? "").IndexOf('.');
            string pset = dot < 0 ? key : key.Substring(0, dot), prop = dot < 0 ? "" : key.Substring(dot + 1);
            var hits = new List<(string Value, string Spec, string Sentence)>();
            foreach (var r in _rows.Where(x => x.Pset == pset && x.Prop == prop))
            {
                bool match;
                try { match = Regex.IsMatch(entity ?? "", r.Entity, RegexOptions.IgnoreCase); }
                catch (ArgumentException) { match = false; } // a pattern .NET cannot read applies to nothing (the bridge skips it too)
                if (match) hits.Add((r.Value, r.Spec, r.Sentence));
            }
            return hits;
        }

        private static string Str(JsonElement o, string name) => o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    /// <summary>One DD type × property PropertyPlanner judged: "write" (a set_parameter ghost, Value from Ref), or sent to a person —
    /// "no source", "disagree", "no writer" — with Why. Elements = on the type in the model now plus those the plans retype onto it.</summary>
    public sealed class PropertyRow
    {
        public string Category, Label, Key, UniqueId, Outcome, Value, Ref, Why;
        public int Elements;
    }

    public sealed class PropertyReport
    {
        public List<PropertyRow> Rows = new List<PropertyRow>();
        public int Written => Rows.Count(r => r.Outcome == "write");
        public int NoSource => Rows.Count(r => r.Outcome == "no source");
        /// <summary>The elements on the types whose property has no source (drill MA2 records it).</summary>
        public int NoSourceElements => Rows.Where(r => r.Outcome == "no source").Sum(r => r.Elements);
        public int Other => Rows.Count(r => r.Outcome != "write" && r.Outcome != "no source");

        /// <summary>Promote's header line: "DD properties: 2 type edit(s) from a cited source (never pre-ticked) · 1 with no source —
        /// sent to a person (1 element(s) on those types) · 1 sent to a person for another reason".</summary>
        public string Line =>
            $"DD properties: {Written} type edit(s) from a cited source (never pre-ticked) · {NoSource} with no source — sent to a person ({NoSourceElements} element(s) on those types)" +
            (Other > 0 ? $" · {Other} sent to a person for another reason" : "");

        /// <summary>One line per row: "✎ Walls · BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating → "60 min" (type_catalog@1 · …)", or "→ a person: …".</summary>
        public List<string> Lines() => Rows.Select(r => r.Outcome == "write"
            ? $"✎ {r.Category} · {r.Label} · {r.Key} → \"{r.Value}\" ({r.Ref})"
            : "→ a person: " + r.Why).ToList();
    }

    public static class PropertyPlanner
    {
        /// <summary>The catalogue parameter a DD property is harvested under (Build Office System reads "Fire Rating" by display
        /// name, GoldenModelExtractor.InterestingParams) — the bridge's CATALOG_PARAM. A property not here has no catalogue source.</summary>
        public static readonly IReadOnlyDictionary<string, string> CatalogParam = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["Pset_WallCommon.FireRating"] = "Fire Rating", ["Pset_DoorCommon.FireRating"] = "Fire Rating",
        };

        /// <summary>The IFC entity a class is adjudicated as, as an IDS writes it ("IFCWALL") — the bridge's KIND_ENTITY.</summary>
        public static string Entity(string category) => PromoteWallsPlanner.Classes.Values.First(c => c.Category == category).Ifc.ToUpperInvariant();

        /// <summary>The DD types the plans land elements on, for the classes whose DD row asks properties: each storey's settled types,
        /// then its retype targets — once each, in that order.</summary>
        public static List<(string Category, string Family, string Type)> DdTypes(IReadOnlyList<StoreyPlan> plans, LodMatrix mx)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            return plans.SelectMany(Landed)
                .Where(t => mx.Properties.TryGetValue(t.Category, out var ps) && ps.Count > 0 && seen.Add(t.Category + "|" + t.Family + "|" + t.Type))
                .ToList();
        }

        private static IEnumerable<(string Category, string Family, string Type)> Landed(StoreyPlan p) =>
            p.Settled.Concat(p.Ghosts.Where(g => g.Op == "retype").Select(g => (PromoteWallsPlanner.Classes[g.Kind ?? "wall"].Category, g.FamilyName, g.TypeName)));

        private static bool Same(string a, string b) => string.Equals(a ?? "", b ?? "", StringComparison.OrdinalIgnoreCase);
        private static bool Onto(PromoteGhost g, string category, string family, string type) =>
            g.Op == "retype" && PromoteWallsPlanner.Classes[g.Kind ?? "wall"].Category == category && Same(g.FamilyName, family) && Same(g.TypeName, type);

        /// <summary>Each DD type × matrix property that is empty on the type: a set_parameter ghost on the first storey that lands an
        /// element on the type (with its retypes, so the DD IDS checked before commit sees the value), or a row sent to a person on
        /// that storey (StoreyPlan.ToPerson). A property the type does not hold (<see cref="TypeValue.Current"/> null: the IDS reads
        /// it elsewhere, or not at all) or holds filled is left as it is. <paramref name="values"/> are Revit's reads of the types.</summary>
        public static PropertyReport Plan(IReadOnlyList<StoreyPlan> plans, LodMatrix mx, IReadOnlyList<TypeValue> values, GuidelineMatcher m, Clauses clauses)
        {
            var report = new PropertyReport();
            var done = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var p in plans)
                foreach (var (cat, family, type) in Landed(p).ToList())
                {
                    if (!mx.Properties.TryGetValue(cat, out var keys)) continue;
                    foreach (var key in keys)
                    {
                        if (!done.Add(cat + "|" + family + "|" + type + "|" + key)) continue;
                        var v = values.FirstOrDefault(x => x.Category == cat && x.Key == key && Same(x.Family, family) && Same(x.Type, type));
                        if (v?.Current == null || v.Current.Length > 0) continue; // not held on the type, or filled
                        var row = new PropertyRow
                        {
                            Category = cat, Label = v.Label, Key = key, UniqueId = v.UniqueId,
                            Elements = v.Instances + plans.Sum(x => x.Ghosts.Count(g => Onto(g, cat, family, type))),
                        };
                        var found = new List<(string Value, string Kind, string Ref)>();
                        if (CatalogParam.TryGetValue(key, out var param) && m.CatalogValue(cat, family, type, param) is string cv)
                            found.Add((cv, "catalogue", $"{m.CatalogLabel} · {v.Label} · {param}"));
                        foreach (var c in clauses.For(Entity(cat), key))
                            found.Add((c.Value, "clause", $"{clauses.Label} · {c.Spec}" + (c.Sentence != null ? $" · \"{c.Sentence}\"" : "")));
                        var distinct = found.Select(f => f.Value).Distinct(StringComparer.Ordinal).ToList();
                        if (distinct.Count == 0)
                        {
                            row.Outcome = "no source";
                            row.Why = $"no source for {key} on {v.Label} — " +
                                      (param != null ? $"{m.CatalogLabel} gives no {param} for it" : "the catalogue harvests no value for it") + ", and " +
                                      (clauses.Installed ? $"no clause of {clauses.Label} pins one" : $"no ids@n is installed to cite ({clauses.Label})") +
                                      $"; a person fills it in Revit (Type Properties) — {row.Elements} element(s) on it";
                        }
                        else if (distinct.Count > 1)
                        {
                            row.Outcome = "disagree";
                            row.Why = $"the sources disagree on {key} for {v.Label}: " + string.Join("; ", found.Select(f => $"\"{f.Value}\" ({f.Ref})")) + " — a person decides";
                        }
                        else if (v.NoWriter != null)
                        {
                            row.Outcome = "no writer";
                            row.Value = distinct[0];
                            row.Ref = found[0].Ref;
                            row.Why = $"{key} on {v.Label}: \"{distinct[0]}\" ({found[0].Ref}), but {v.NoWriter} — a person sets it in Revit";
                        }
                        else
                        {
                            row.Outcome = "write";
                            row.Value = distinct[0];
                            row.Ref = found[0].Ref;
                            int here = p.Ghosts.Count(g => Onto(g, cat, family, type));
                            p.Ghosts.Add(new PromoteGhost
                            {
                                Op = "set_parameter", Kind = PromoteWallsPlanner.Classes.First(kv => kv.Value.Category == cat).Key, UniqueId = v.UniqueId,
                                Label = "type " + v.Label, TypeName = type, FamilyName = family, Parameter = key, RevitParameter = v.Param,
                                From = v.Current, To = distinct[0], SourceKind = found[0].Kind,
                                Reason = $"DD {cat.ToLowerInvariant()}: {key} \"{distinct[0]}\" from {found[0].Ref} — a type edit: every element on {v.Label} " +
                                         $"reads it ({v.Instances} in the model now, {here} more that this changeset retypes onto it)",
                            });
                        }
                        if (row.Outcome != "write") p.ToPerson.Add(new PromoteHeld { UniqueId = v.UniqueId, Label = $"type {v.Label} · {key}", Reason = row.Why });
                        report.Rows.Add(row);
                    }
                }
            return report;
        }
    }
}
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
        [JsonPropertyName("bic")]       public string Bic { get; set; }
    }
```

with

```csharp
        [JsonPropertyName("bic")]       public string Bic { get; set; }
        /// <summary>MA-2c: the type's harvested parameters by display name ("Fire Rating": "1 HR") — what set_parameter may cite
        /// (CatalogValue). Kept as JSON: the bridge does not check their shape, so a row whose params are not an object still
        /// reads, and gives no value.</summary>
        [JsonPropertyName("params")]    public JsonElement? Params { get; set; }
    }
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
        public bool CatalogHas(string category, string family, string type) =>
            _catalog.Any(c => SameCategory(c, category) && Norm(c.Family) == Norm(family) && Norm(c.Type) == Norm(type));
```

with

```csharp
        public bool CatalogHas(string category, string family, string type) =>
            _catalog.Any(c => SameCategory(c, category) && Norm(c.Family) == Norm(family) && Norm(c.Type) == Norm(type));

        /// <summary>MA-2c: the value set_parameter may write from the catalogue — the harvested parameter <paramref name="param"/> of
        /// exactly one row of the category with this type name (and this family, when given), filled; null otherwise (no row, two
        /// rows, no such parameter, empty). The bridge's makeCiter reads the same row the same way.</summary>
        public string CatalogValue(string category, string family, string type, string param)
        {
            var rows = _catalog.Where(c => SameCategory(c, category) && Norm(c.Type) == Norm(type) && (family == null || Norm(c.Family) == Norm(family))).ToList();
            if (rows.Count != 1 || !(rows[0].Params is JsonElement ps) || ps.ValueKind != JsonValueKind.Object
                || !ps.TryGetProperty(param, out var v) || v.ValueKind != JsonValueKind.String) return null;
            var s = v.GetString().Trim();
            return s.Length == 0 ? null : s;
        }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        /// model" (also the Reason's tail) — the office's template to fix. Null otherwise; never posted.</summary>
        public string Note;
    }
```

with

```csharp
        /// model" (also the Reason's tail) — the office's template to fix. Null otherwise; never posted.</summary>
        public string Note;
        /// <summary>MA-2c, a "set_parameter" (PropertyPlanner): the DD property ("Pset_WallCommon.FireRating"), the Revit parameter
        /// that holds it on the TYPE, the value the plan read there (From, "" when empty: the executor's stale guard), the value to
        /// write (To) and its source's kind ("catalogue" | "clause"). UniqueId is the TYPE's; TypeName and FamilyName name it.</summary>
        public string Parameter, RevitParameter, From, To, SourceKind;
    }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        /// reader (LodState.Read) counts, so the two never drift.</summary>
        public List<LodFact> Lod = new List<LodFact>();
    }
```

with

```csharp
        /// reader (LodState.Read) counts, so the two never drift.</summary>
        public List<LodFact> Lod = new List<LodFact>();
        /// <summary>MA-2c: the DD type each counted element already stands on (settled: a wall whose type is DD, a floor, roof,
        /// ceiling, door or window on a type a DD rule produces), one entry per element — with the retype targets, the types whose
        /// DD properties PropertyPlanner reads. Family: a door's or window's; null for a system type.</summary>
        public List<(string Category, string Family, string Type)> Settled = new List<(string Category, string Family, string Type)>();
        /// <summary>MA-2c: the DD properties sent to a person (PropertyPlanner) — no source, sources that disagree, no parameter
        /// Sentinel can write — one row per type and property, the TYPE's UniqueId. They ride on the changeset's exceptions.</summary>
        public List<PromoteHeld> ToPerson = new List<PromoteHeld>();
    }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                    if (typeOk && topOk) p.DdNow++;
                    p.Lod.Add(new LodFact { UniqueId = w.UniqueId, Category = "Walls", RulesOk = typeOk && topOk });
```

with

```csharp
                    if (typeOk && topOk) p.DdNow++;
                    if (typeOk) p.Settled.Add(("Walls", null, w.TypeName)); // MA-2c: its DD type's properties are read
                    p.Lod.Add(new LodFact { UniqueId = w.UniqueId, Category = "Walls", RulesOk = typeOk && topOk });
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        public static List<object> Bodies(IReadOnlyList<StoreyPlan> plans, string actor, int max = 200, string title = "Promote walls (DD)")
        {
            var carried = plans.Where(p => p.Ghosts.Count == 0)
                .SelectMany(p => p.Held.Select(h => new PromoteHeld { UniqueId = h.UniqueId, Label = $"{p.Storey} · {h.Label}", Reason = h.Reason }))
                .ToList();
            var bodies = new List<object>();
            foreach (var p in plans.Where(p => p.Ghosts.Count > 0))
            {
                var held = bodies.Count == 0 ? p.Held.Concat(carried).ToList() : p.Held;
```

with

```csharp
        public static List<object> Bodies(IReadOnlyList<StoreyPlan> plans, string actor, int max = 200, string title = "Promote walls (DD)")
        {
            // MA-2c: a storey's DD properties sent to a person ride with its held elements.
            var carried = plans.Where(p => p.Ghosts.Count == 0)
                .SelectMany(p => p.Held.Concat(p.ToPerson).Select(h => new PromoteHeld { UniqueId = h.UniqueId, Label = $"{p.Storey} · {h.Label}", Reason = h.Reason }))
                .ToList();
            var bodies = new List<object>();
            foreach (var p in plans.Where(p => p.Ghosts.Count > 0))
            {
                var held = p.Held.Concat(p.ToPerson).Concat(bodies.Count == 0 ? carried : new List<PromoteHeld>()).ToList();
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        private static object Element(PromoteGhost g) => new
        {
            op = g.Op,
            kind = g.Kind ?? "wall",
            target = new { unique_id = g.UniqueId, type_before = g.TypeBefore },
            place = g.Op == "retype" ? (object)new { g.TypeName, g.FamilyName } : new { g.BaseLevel, g.TopLevel },
            reason = Clip(g.Reason, 500),
            validate = new { identity = new { Class = Classes[g.Kind ?? "wall"].Ifc, Name = g.Label } },
        };
```

with

```csharp
        private static object Element(PromoteGhost g) => g.Op == "set_parameter" ? SetParameter(g) : new
        {
            op = g.Op,
            kind = g.Kind ?? "wall",
            target = new { unique_id = g.UniqueId, type_before = g.TypeBefore },
            place = g.Op == "retype" ? (object)new { g.TypeName, g.FamilyName } : new { g.BaseLevel, g.TopLevel },
            reason = Clip(g.Reason, 500),
            validate = new { identity = new { Class = Classes[g.Kind ?? "wall"].Ifc, Name = g.Label } },
        };

        // MA-2c: a type edit — the type it writes, the property, the value read and the value to write, and its source's kind (the
        // bridge checks it against the installed artefact and writes its own record). Its validate carries the value, so the
        // bridge's referee judges it before staging ([BP] P2-7 step 3).
        private static object SetParameter(PromoteGhost g) => new
        {
            op = g.Op,
            kind = g.Kind ?? "wall",
            target = new { unique_id = g.UniqueId },
            place = new { g.TypeName, g.FamilyName },
            parameter = g.Parameter,
            revit_parameter = g.RevitParameter,
            from = g.From,
            to = g.To,
            value_source = new { kind = g.SourceKind },
            reason = Clip(g.Reason, 500),
            validate = new
            {
                identity = new { Class = Classes[g.Kind ?? "wall"].Ifc, Name = g.Label },
                psets = new[] { new { name = g.Parameter.Split('.')[0], rows = new[] { new { name = g.Parameter.Split('.')[1], value = g.To } } } },
            },
        };
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                if (c.OfficeTyped == officeWas) p.Lod.Add(new LodFact { UniqueId = e.UniqueId, Category = cls.Category, RulesOk = c.DdNow > ddWas, Blocked = blocked });
```

with

```csharp
                if (c.OfficeTyped == officeWas) p.Lod.Add(new LodFact { UniqueId = e.UniqueId, Category = cls.Category, RulesOk = c.DdNow > ddWas, Blocked = blocked });
                // MA-2c: an element that stays on its DD type (no reason, no ghost, not office-typed) — its type's properties are read.
                if (reason == null && g == null && c.OfficeTyped == officeWas)
                    p.Settled.Add((cls.Category, e.Kind == "door" || e.Kind == "window" ? e.Family : null, e.TypeName));
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    [JsonPropertyName("typing")] public TypingDto Typing { get; set; }
}
```

with

```csharp
    [JsonPropertyName("typing")] public TypingDto Typing { get; set; }
    /// <summary>MA-2c, a "set_parameter" (Target.UniqueId names a TYPE): the DD property, the Revit parameter's name, the value the
    /// plan read on the type ("" when empty — the executor's stale guard compares it), the value to write, and the bridge's record
    /// of where the value comes from. Null on every other op.</summary>
    [JsonPropertyName("parameter")] public string Parameter { get; set; }
    [JsonPropertyName("revit_parameter")] public string RevitParameter { get; set; }
    [JsonPropertyName("from")] public string From { get; set; }
    [JsonPropertyName("to")] public string To { get; set; }
    [JsonPropertyName("value_source")] public ValueSourceDto ValueSource { get; set; }
}

/// <summary>MA-2c: where a set_parameter's value comes from, as the bridge checked it — "catalogue" or "clause", and the artefact,
/// row or clause it cites ("type_catalog@2 · office · … · BDS_EXT_ARC_CMU_200 mm · Fire Rating").</summary>
public sealed class ValueSourceDto
{
    [JsonPropertyName("kind")] public string Kind { get; set; }
    [JsonPropertyName("ref")] public string Ref { get; set; }
    [JsonPropertyName("sha256")] public string Sha256 { get; set; }
}
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    public static bool PreTick(ChangesetDto cs, ChangesetElementDto el)
    {
        if (el.Op is null or "create") return false;
```

with

```csharp
    public static bool PreTick(ChangesetDto cs, ChangesetElementDto el)
    {
        // MA-2c: a set_parameter is a TYPE edit — it reaches every element on the type — so it is never pre-ticked (founder decision F1).
        if (el.Op is null or "create" or "set_parameter") return false;
```

- [ ] **Step 4: Run it, and see it pass.** `promote-check` `622/622`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/PropertyPlanner.cs SentinelAddin/GhostBuilder/GuidelineMatcher.cs SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs SentinelAddin/GhostBuilder/PromotePlanner.cs SentinelAddin/Coordination/ChangesetClient.cs tools/promote-check/PropertyChecks.cs tools/promote-check/Check.cs tools/promote-check/promote-check.csproj
git commit -F - <<'EOF'
feat(promote): PropertyPlanner - an empty DD property on a DD type becomes a set_parameter type edit from the catalogue row or a whole-class clause, else goes to a person and is counted; the body held to the bridge's fixture (MA-2c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 3 — Revit-bound: the type reads, the write in the changeset's transaction, the clauses' read, the dialog and the review row

**Files:**
- Modify `SentinelAddin/Coordination/FixInPlaceService.cs` — `OnType`, `WriteOnType`
- Modify `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` — the set_parameter loop, `ParamTarget`
- Modify `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` — the DD IDS check's kinds leave the type entries out
- Modify `SentinelAddin/GhostBuilder/PromoteContext.cs` — `Clauses`, read in `Fetch`
- Modify `SentinelAddin/Commands.PromoteWalls.cs` — `TypeValues`, `PropertyPlanner.Plan` after the preflight, the dialog's lines
- Modify `SentinelAddin/UI/ChangesetReviewWindow.cs` — the row's words
- Create `tools/promote-check/Ma2cWiring.cs`; modify `tools/promote-check/Check.cs`

**Interfaces:**
- Consumes: Task 2's `PropertyPlanner`, `TypeValue`, `Clauses`, `PropertyReport`, `StoreyPlan.ToPerson`, `ChangesetElementDto`'s write fields.
- Produces: `FixInPlaceService.OnType(ElementType t, Document doc, PsetEntry entry) → (Parameter? P, string? Current, string? NoWriter)`; `FixInPlaceService.WriteOnType(Document doc, ElementType t, string key, string from, string to, string? org)` (throws on anything but a clean write); `PromoteWallsCommand.TypeValues(Document, IReadOnlyList<(string Category, string Family, string Type)>, LodMatrix) → List<TypeValue>`; `PromoteContext.Clauses`.

- [ ] **Step 1: The source scans (section 35).**

`Create` `tools/promote-check/Ma2cWiring.cs`:

```csharp
#nullable disable
static partial class Check
{
    // ── 35. MA-2c: the Revit-bound wiring of set_parameter, by source scan (the executor, the fix-in-place writer, the commands, the
    //        placement event and the review window compile in no check project; drill MA2c runs them) ────────────────────────────
    static void Ma2cWiringChecks()
    {
        Console.WriteLine("\nMA-2c — wiring (source scans)");
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        string exec = Src("GhostBuilder", "ChangesetExecutor.cs"), fix = Src("Coordination", "FixInPlaceService.cs"), place = Src("GhostBuilder", "ChangesetPlacementEvent.cs");
        string promote = Src("Commands.PromoteWalls.cs"), ctx = Src("GhostBuilder", "PromoteContext.cs"), window = Src("UI", "ChangesetReviewWindow.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);

        int attach = At(exec, "foreach (var el in toPlace.Where(e => e.Op == \"attach\"))"), write = At(exec, "foreach (var el in toPlace.Where(e => e.Op == \"set_parameter\"))");
        Ok(attach > 0 && write > attach && write < At(exec, "if (result.Applied.Count != toPlace.Count)")
           && exec.Contains("FixInPlaceService.WriteOnType(doc, type, el.Parameter, el.From, el.To, App.OrgFor(doc));") && exec.Contains("var type = ParamTarget(doc, el);"),
           "the executor writes each set_parameter after every retype and attach, inside the changeset's transaction, on the type the plan named");
        int stale = At(fix, "throw new InvalidOperationException($\"stale: {key} on type {t.Name} reads"), set = At(fix, "if (!p.Set(to))");
        Ok(stale > 0 && set > stale && At(fix, "reads back \\\"{back}\\\", not \\\"{to}\\\" — not written") > set
           && fix.Contains("entry.Candidates.Where(c => !c.InstanceOnly && (c.Kind == ParamKind.Lookup || c.Kind == ParamKind.BuiltIn))")
           && fix.Contains("p.StorageType != StorageType.String ?"),
           "the write is the stale guard (the value read now is the plan's from), then the set, then a read-back as the IDS reads it — on the type's own text parameter only");
        Ok(place.Contains(".Where(e => e.Op != \"set_parameter\").ToDictionary(e => e.ProposalGuid, e => e.Kind ?? \"wall\")"),
           "the DD IDS before commit judges the elements, never a set_parameter's type");
        Ok(ctx.Contains("var clauseTask = Task.Run(() => ArtefactClient.Resolve(key, \"ids\"));")
           && ctx.Contains("pc.Clauses = ids.Origin == \"none\" ? Clauses.None(ids.Label) : Clauses.FromIds(ids.BodyJson, ids.Label, out _);"),
           "the ids@n a clause is cited from is read with the rest of Promote's context, off the API thread");
        int refuse = At(promote, "PromotePlanner.Refuse(plans,"), plan = At(promote, "PropertyPlanner.Plan(plans, mx, TypeValues(doc, PropertyPlanner.DdTypes(plans, mx), mx), standards.Guideline, pc.Clauses)");
        Ok(refuse > 0 && plan > refuse && plan < At(promote, "PromoteWallsPlanner.Bodies(plans")
           && promote.Contains("FixInPlaceService.OnType(hits[0], doc, entry)") && promote.Contains("lodText + propText +")
           && promote.Contains("p.Held.Concat(p.ToPerson).Select(h =>"),
           "Promote reads the DD types' properties after its preflight and before it files, says what it writes and what goes to a person, and lists each");
        Ok(window.Contains("\"set_parameter\" => $\"type edit {el.Kind}:"),
           "the review window shows a set_parameter as a type edit: the parameter, from, to and the source");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        PropertyPlannerChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        PropertyPlannerChecks();
        Ma2cWiringChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` — `622/628` (6 FAIL): the six scans of section 35 fail — nothing is wired yet.

- [ ] **Step 3: The wiring.**

In `SentinelAddin/Coordination/FixInPlaceService.cs`, replace

```csharp
    /// `get_Parameter(BuiltInParameter)` can hand back a parameter the element does not actually own — a door
```

with

```csharp
    /// <summary>MA-2c (set_parameter, [BP] P2-7's write built once on this table): where a DD property lives on a TYPE — the first of
    /// PsetMap's candidates the type itself holds (a lookup that may fall to the type, or a built-in; never an instance-only lookup,
    /// never the wall's Function), its value as the IDS reads it on the type ("" when empty), and why Sentinel cannot write it there
    /// (null = it can: real, writable, stored as text). No such parameter → (null, null, null): the type does not hold the property.</summary>
    internal static (Parameter? P, string? Current, string? NoWriter) OnType(ElementType t, Document doc, PsetEntry entry)
    {
        foreach (var c in entry.Candidates.Where(c => !c.InstanceOnly && (c.Kind == ParamKind.Lookup || c.Kind == ParamKind.BuiltIn)))
        {
            Parameter? p = c.Kind == ParamKind.Lookup ? t.LookupParameter(c.Name)
                : Enum.TryParse<BuiltInParameter>(c.Name, out var bip) ? t.get_Parameter(bip) : null;
            if (p == null || !IsReal(t, p)) continue;
            string? why = p.IsReadOnly ? $"{p.Definition.Name} is read-only on the type"
                : p.StorageType != StorageType.String ? $"{p.Definition.Name} is stored as {p.StorageType} — set_parameter writes text only; set it in Revit's Type Properties"
                : null;
            return (p, GovernedElementExtractor.ReadEntry(t, doc, entry) ?? "", why);
        }
        return (null, null, null);
    }

    /// <summary>MA-2c: one set_parameter on a TYPE, inside the caller's transaction (the changeset's): the property's parameter on the
    /// type (<see cref="OnType"/>), the stale guard first — the value the IDS reads now must be the plan's <paramref name="from"/> —
    /// then the write, read back as the IDS reads it. Anything else throws, and the changeset fails whole (the executor's rule).</summary>
    internal static void WriteOnType(Document doc, ElementType t, string key, string from, string to, string? org)
    {
        var entry = PsetMap.Find(org, key) ?? throw new InvalidOperationException($"no parameter mapping for {key} — Sentinel does not know where this value lives");
        var (p, current, noWriter) = OnType(t, doc, entry);
        if (p == null) throw new InvalidOperationException($"type {t.Name} holds no parameter for {key} — re-run Promote");
        if (noWriter != null) throw new InvalidOperationException($"type {t.Name}: {noWriter}");
        if (!string.Equals(current, from ?? "", StringComparison.Ordinal))
            throw new InvalidOperationException($"stale: {key} on type {t.Name} reads \"{current}\" now, the plan read \"{from}\" — the model changed since the plan; re-run Promote");
        if (!p.Set(to)) throw new InvalidOperationException($"Revit refused \"{to}\" for {p.Definition.Name} on type {t.Name}");
        var back = GovernedElementExtractor.ReadEntry(t, doc, entry) ?? "";
        if (!string.Equals(back, to, StringComparison.Ordinal))
            throw new InvalidOperationException($"{p.Definition.Name} on type {t.Name} reads back \"{back}\", not \"{to}\" — not written");
    }

    /// `get_Parameter(BuiltInParameter)` can hand back a parameter the element does not actually own — a door
```

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
    /// "Family : Type" for a loadable family's type, the name otherwise — what the planner wrote as type_before.
```

with

```csharp
    /// MA-2c: the TYPE a set_parameter names by UniqueId — of its kind's category, and still the type the plan named (a renamed or
    /// replaced type fails the changeset, as a retype's type_before does).
    private static ElementType ParamTarget(Document doc, ChangesetElementDto el)
    {
        var uid = el.Target?.UniqueId;
        var t = (string.IsNullOrWhiteSpace(uid) ? null : doc.GetElement(uid)) as ElementType
                ?? throw new InvalidOperationException($"set_parameter: type {uid} is not in this model — re-run Promote");
        var named = el.Place?.FamilyName != null ? el.Place.FamilyName + " : " + el.Place.TypeName : el.Place?.TypeName;
        if (el.Kind == null || !PromoteWallsPlanner.Classes.TryGetValue(el.Kind, out var cls) || t.Category == null || !t.Category.MatchesCategoryKey(cls.Category)
            || !string.Equals(TypeLabel(t), named, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"set_parameter: {uid} is \"{TypeLabel(t)}\", not the {el.Kind} type \"{named}\" the plan named — re-run Promote");
        return t;
    }

    /// "Family : Type" for a loadable family's type, the name otherwise — what the planner wrote as type_before.
```

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
                Set(w, BuiltInParameter.WALL_TOP_OFFSET, 0.0);
                Collect(result, el, w);
            }
```

with

```csharp
                Set(w, BuiltInParameter.WALL_TOP_OFFSET, 0.0);
                Collect(result, el, w);
            }

            // MA-2c: set_parameter after every retype and attach, so a value lands on the type the retype just set (drill MA2b I-1: a
            // retype drops the concept type's value) and the DD IDS checked before commit sees it. The TYPE's own parameter, the stale
            // guard first (the value read now must be the plan's from), read back as the IDS reads it (FixInPlaceService).
            foreach (var el in toPlace.Where(e => e.Op == "set_parameter"))
            {
                at = Label(el);
                var type = ParamTarget(doc, el); // `t` is the transaction
                FixInPlaceService.WriteOnType(doc, type, el.Parameter, el.From, el.To, App.OrgFor(doc));
                Collect(result, el, type);
            }
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
                var kindOf = (cs.Elements ?? new List<ChangesetElementDto>()).ToDictionary(e => e.ProposalGuid, e => e.Kind ?? "wall");
```

with

```csharp
                // MA-2c: a set_parameter's applied entry is a TYPE — the IDS judges the elements, so it is left out (its value is
                // judged on the elements this changeset retyped onto the type).
                var kindOf = (cs.Elements ?? new List<ChangesetElementDto>()).Where(e => e.Op != "set_parameter").ToDictionary(e => e.ProposalGuid, e => e.Kind ?? "wall");
```

In `SentinelAddin/GhostBuilder/PromoteContext.cs`, replace

```csharp
        public StageIds Ids;
        public string IdsWhy;

        /// <summary>The three reads side by side. Blocking (the guideline and catalogue have their own caps, the matrix and the IDS
        /// 4 s); never throws. Call it OFF the API thread: Task.Run(() => PromoteContext.Fetch(key)).</summary>
        public static PromoteContext Fetch(string key)
        {
            var mxTask = Task.Run(() => ArtefactClient.Resolve(key, "lod_matrix"));
            var idsTask = Task.Run(() => { var json = ArtefactClient.StageIds(key, out var why); return (json, why); });
```

with

```csharp
        public StageIds Ids;
        public string IdsWhy;
        /// <summary>MA-2c: the clauses of the project's installed ids@n (project → office) a DD property's value may be cited from —
        /// none, with why, when it is not installed or does not parse.</summary>
        public Clauses Clauses;

        /// <summary>The reads side by side. Blocking (the guideline and catalogue have their own caps, the matrix, the DD IDS and the
        /// ids@n 4 s); never throws. Call it OFF the API thread: Task.Run(() => PromoteContext.Fetch(key)).</summary>
        public static PromoteContext Fetch(string key)
        {
            var mxTask = Task.Run(() => ArtefactClient.Resolve(key, "lod_matrix"));
            var idsTask = Task.Run(() => { var json = ArtefactClient.StageIds(key, out var why); return (json, why); });
            var clauseTask = Task.Run(() => ArtefactClient.Resolve(key, "ids"));
```

In `SentinelAddin/GhostBuilder/PromoteContext.cs`, replace

```csharp
            if (pc.Ids != null && StageIds.NotFrom(pc.Ids, pc.MxSha, pc.MxLabel) is string other) { pc.Ids = null; idsWhy = other; }
            pc.IdsWhy = idsWhy;
            return pc;
```

with

```csharp
            if (pc.Ids != null && StageIds.NotFrom(pc.Ids, pc.MxSha, pc.MxLabel) is string other) { pc.Ids = null; idsWhy = other; }
            pc.IdsWhy = idsWhy;
            var ids = clauseTask.GetAwaiter().GetResult();
            pc.Clauses = ids.Origin == "none" ? Clauses.None(ids.Label) : Clauses.FromIds(ids.BodyJson, ids.Label, out _);
            return pc;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        plannerClock.Stop();
        var actor = UserSession.Actor;
```

with

```csharp
        // MA-2c (design §3.3 op 4): the DD properties of the DD types the plan lands elements on, read on their TYPE (API thread,
        // read-only) — empty ones filled from a cited source as a set_parameter type edit, else sent to a person and counted.
        PropertyReport props = mx == null ? null
            : PropertyPlanner.Plan(plans, mx, TypeValues(doc, PropertyPlanner.DdTypes(plans, mx), mx), standards.Guideline, pc.Clauses);
        plannerClock.Stop();
        var actor = UserSession.Actor;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        var held = plans.SelectMany(p => p.Held.Select(h => $"{p.Storey} · {h.Label}: {h.Reason}")).ToList();
```

with

```csharp
        var held = plans.SelectMany(p => p.Held.Concat(p.ToPerson).Select(h => $"{p.Storey} · {h.Label}: {h.Reason}")).ToList();
        var propLines = props == null || props.Rows.Count == 0 ? new List<string>() : props.Lines();
        var propText = props == null ? "" : props.Rows.Count == 0 ? "\n\nDD properties: every one the DD types hold is filled, or the matrix asks none Sentinel reads on a type"
            : "\n\n" + props.Line + " — " + pc.Clauses.Label + "\n" + string.Join("\n", propLines.Take(12)) + (propLines.Count > 12 ? $"\n… and {propLines.Count - 12} more" : "");
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
                          "\n\n" + string.Join("\n", lines) + "\n\n" + ddNow + "\n" + lodText +
```

with

```csharp
                          "\n\n" + string.Join("\n", lines) + "\n\n" + ddNow + "\n" + lodText + propText +
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
    /// <summary>One wall's facts, read on the API thread. A stacked-wall member reads as not basic: Revit types it
```

with

```csharp
    /// <summary>MA-2c: each DD type's matrix properties as Revit holds them on the TYPE — the parameter there, its value as the IDS
    /// reads it, why Sentinel could not write it — with the elements on the type now. API thread, read-only. A type the plan names
    /// that is not one type here (none, or two of that name) is not read, so nothing is written to it; a property the type does not
    /// hold (an instance parameter, a wall's IsExternal from its Function) is not listed.</summary>
    internal static List<TypeValue> TypeValues(Document doc, IReadOnlyList<(string Category, string Family, string Type)> types, LodMatrix mx)
    {
        var list = new List<TypeValue>();
        if (types.Count == 0) return list;
        string org = App.OrgFor(doc);
        var onType = new Dictionary<long, int>();
        foreach (var x in new FilteredElementCollector(doc).WhereElementIsNotElementType())
        {
            var tid = x.GetTypeId().IdValue();
            onType[tid] = onType.TryGetValue(tid, out var n) ? n + 1 : 1;
        }
        foreach (var (cat, family, type) in types)
        {
            var bic = cat == "Walls" ? BuiltInCategory.OST_Walls : Others.First(o => PromoteWallsPlanner.Classes[o.Kind].Category == cat).Bic;
            var hits = new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>()
                .Where(t => string.Equals(t.Name, type, StringComparison.OrdinalIgnoreCase)
                            && (family == null || string.Equals((t as FamilySymbol)?.FamilyName, family, StringComparison.OrdinalIgnoreCase)))
                .ToList();
            if (hits.Count != 1) continue;
            foreach (var key in mx.Properties[cat])
            {
                var entry = PsetMap.Find(org, key);
                if (entry == null) continue; // no reader: the LOD state says "no Revit reader for …"
                var (p, current, noWriter) = FixInPlaceService.OnType(hits[0], doc, entry);
                if (p == null) continue;
                list.Add(new TypeValue
                {
                    Category = cat, Family = family, Type = type, UniqueId = hits[0].UniqueId, Key = key, Current = current,
                    Param = p.Definition.Name, NoWriter = noWriter, Instances = onType.TryGetValue(hits[0].Id.IdValue(), out var n) ? n : 0,
                });
            }
        }
        return list;
    }

    /// <summary>One wall's facts, read on the API thread. A stacked-wall member reads as not basic: Revit types it
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace

```csharp
                "attach" => $"attach: {name}  ·  {el.Place?.BaseLevel} → top {el.Place?.TopLevel}",
```

with

```csharp
                "attach" => $"attach: {name}  ·  {el.Place?.BaseLevel} → top {el.Place?.TopLevel}",
                // MA-2c: a TYPE edit — never pre-ticked; the reason (the tooltip) says how many elements read the type.
                "set_parameter" => $"type edit {el.Kind}: {(el.Place?.FamilyName != null ? el.Place.FamilyName + " : " : "")}{type}  ·  {el.Parameter} \"{el.From}\" → \"{el.To}\"  ·  from {el.ValueSource?.Ref ?? el.ValueSource?.Kind ?? "an unnamed source"}",
```

- [ ] **Step 4: Run it, and see it pass.** `promote-check` `628/628`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/Coordination/FixInPlaceService.cs SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs SentinelAddin/GhostBuilder/PromoteContext.cs SentinelAddin/Commands.PromoteWalls.cs SentinelAddin/UI/ChangesetReviewWindow.cs tools/promote-check/Ma2cWiring.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(promote): set_parameter in Revit - the DD types read on the type, the write after every retype in the changeset's transaction (stale guard, read-back), the clauses read off the API thread, the dialog's DD properties line and the review row (MA-2c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4 — C#: type-gap groups — the gap holds, grouped, posted as one type_gap row per Promote run

**Files:**
- Create `SentinelAddin/GhostBuilder/TypeGaps.cs` — `TypeGapGroup`, `TypeGaps`
- Modify `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` — `PromoteHeld.Gap`, `TypeGap`, the walls' gap hold
- Modify `SentinelAddin/GhostBuilder/PromotePlanner.cs` — `Plan1`, `Retype`, `Swap` give the gap
- Modify `SentinelAddin/Coordination/CommandReports.cs` — `TypeGaps`
- Modify `SentinelAddin/Commands.PromoteWalls.cs` — the post and the dialog's lines
- Create `tools/promote-check/TypeGapChecks.cs`; modify `tools/promote-check/Check.cs`, `promote-check.csproj`

**Interfaces:**
- Produces: `PromoteHeld.Gap` (a `TypeGap {Category, Want, Size, Key, Nearest}`); `TypeGaps.Group(IReadOnlyList<StoreyPlan>) → List<TypeGapGroup>` (`Category`, `Want`, `Size`, `Key` — null when none, `Elements`, `Labels`, `Nearest`); `TypeGaps.Line(TypeGapGroup)`; `TypeGaps.MaxGroups = 200`, `MaxLabels = 20`, `MaxNearest = 10`; `CommandReports.TypeGaps(groups, catalog, guideline, actor)` → `{entity_type: "type_gap", action: "type_gap:run · N group(s), M element(s)", new_value: {groups: [{category, want, size, key, elements, labels, nearest}], groups_total, catalog, guideline, source}}` — the body Task 5's `typeGapRow` checks.

- [ ] **Step 1: The checks (section 36).**

`Create` `tools/promote-check/TypeGapChecks.cs`:

```csharp
#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 36. MA-2c: type-gap groups (design §6.4) — the held elements the office has no type for, grouped by category and the type
    //        wanted (else the size), the one type_gap row a Promote run posts, and its wiring (source scan) ───────────────────────
    static void TypeGapChecks()
    {
        Console.WriteLine("\nMA-2c — type-gap groups (TypeGaps, CommandReports.TypeGaps)");
        var m = DdElementsMatcher();
        m.CatalogLabel = "type_catalog@1 · office · fedcba987654…";
        var walls = new List<WallFact>
        {
            W("W 125a", "Generic - 125mm", "Exterior", 125, top: "Level 2"), W("W 125b", "Generic - 125mm", "Exterior", 125, top: "Level 2"),
            W("W 200", "Generic - 200mm", "Exterior", 200, top: "Level 2"), W("W 300s", "Generic - 300mm", "Exterior", 300, top: "Level 2", structural: true),
        };
        var others = new List<ElementFact>
        {
            Fl("F250", "Concrete 250mm", "Interior", 250),
            Dw("door", "D915", "M_Single-Flush", "0915 x 2134mm", 915, 2134), Dw("door", "D916", "M_Single-Flush", "0915 x 2134mm", 915, 2134),
        };
        var plans = V1(m, others, walls);
        var gaps = TypeGaps.Group(plans);
        Ok(gaps.Count == 3 && gaps.Select(g => g.Category).SequenceEqual(new[] { "Walls", "Floors", "Doors" }),
           "the run's gaps fall into three groups, in the order the plan meets them: " + string.Join(" | ", gaps.Select(TypeGaps.Line)));
        var w = gaps[0];
        Ok(w.Want == "BDS_EXT_ARC_CMU_125 mm" && w.Size == "125 mm" && w.Elements == 2 && w.Key == "Function Exterior"
           && w.Labels.SequenceEqual(new[] { "Level 1 · W 125a", "Level 1 · W 125b" }) && w.Nearest.Contains("BDS_EXT_ARC_CMU_100 mm"),
           "two walls the rule types to a size the catalogue lacks are one group: the type it wants, the size, the facts, each element, the nearest types");
        Ok(gaps[1].Want == "BDS_INT_STR_CONC_250 mm" && gaps[1].Elements == 1 && gaps[2].Want == null && gaps[2].Size == "915 x 2134 mm" && gaps[2].Elements == 2,
           "a floor's wanted type is its own group; two doors no catalogue type is named at are one group by their size");
        Ok(TypeGaps.Line(gaps[2]) == "Doors: no type named at 915 x 2134 mm — 2 element(s) (HostFunction Interior, Size W915 x H2134 mm)"
           && TypeGaps.Line(w).StartsWith("Walls: \"BDS_EXT_ARC_CMU_125 mm\" is not in the catalogue — 2 element(s) (Function Exterior); nearest: "),
           "each group in words: what is missing, how many, from what facts, and the nearest types");
        var p = plans.Single();
        Ok(p.Held.Where(h => h.Gap != null).Select(h => h.Label).OrderBy(x => x).SequenceEqual(new[] { "D915", "D916", "F250", "W 125a", "W 125b" })
           && p.Held.Any(h => h.Label == "W 300s" && h.Gap == null),
           "only a gap hold carries a gap: structure, a type not loaded, a rule the guideline lacks are holds of their own");
        var row = JsonSerializer.SerializeToNode(CommandReports.TypeGaps(gaps, m.CatalogLabel, "guideline@1 · office · 0123456789ab…", "yazan")).AsObject();
        var g0 = row["new_value"]["groups"][0].AsObject();
        Ok((string)row["entity_type"] == "type_gap" && (string)row["action"] == "type_gap:run · 3 group(s), 5 element(s)" && (int)row["new_value"]["groups_total"] == 3
           && (string)g0["category"] == "Walls" && (string)g0["want"] == "BDS_EXT_ARC_CMU_125 mm" && (string)g0["size"] == "125 mm" && (int)g0["elements"] == 2
           && g0["labels"].AsArray().Count == 2 && (string)row["new_value"]["catalog"] == m.CatalogLabel,
           "one type_gap row per run: every group with its category, the type it wants or its size, its count, labels and nearest types, and the catalogue that judged");
        Ok(TypeGaps.Group(V1(m, new List<ElementFact>(), new List<WallFact> { W("W 200", "Generic - 200mm", "Exterior", 200, top: "Level 2") })).Count == 0,
           "a run with no gap has no group (and posts no row)");

        string promote = File.ReadAllText(Repo("SentinelAddin", "Commands.PromoteWalls.cs"));
        int post = promote.IndexOf("GovernedNotify.Report(\"Type gaps\", CommandReports.TypeGaps(gaps, standards.CatalogSource.Label, standards.GuidelineSource.Label, actor), key);", StringComparison.Ordinal);
        Ok(post > 0 && post < promote.IndexOf("dlg.Show()", StringComparison.Ordinal) && promote.Contains("if (gaps.Count > 0) GovernedNotify.Report(\"Type gaps\"")
           && promote.Contains("lodText + propText + gapText +"),
           "Promote posts its type gaps on every run that has one — the read-only run too — and lists the groups in its dialog");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        Ma2cWiringChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        Ma2cWiringChecks();
        TypeGapChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\PropertyPlanner.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\PropertyPlanner.cs" />
    <!-- MA-2c: a run's type gaps, grouped for the Holding Area -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\TypeGaps.cs" />
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` — it fails to compile — `1 Error(s)`: `CSC : error CS2001: Source file '…\SentinelAddin\GhostBuilder\TypeGaps.cs' could not be found`.

- [ ] **Step 3: The gaps, the groups, the row.**

`Create` `SentinelAddin/GhostBuilder/TypeGaps.cs`:

```csharp
#nullable disable
// MA-2c — type-gap groups (design §6.4 "Type gaps in the Holding Area"), pure, so tools/promote-check drives it. A Promote run's
// type gaps are the held elements the office has no type for (PromoteHeld.Gap: the DD rule names a type the catalogue lacks, or no
// catalogue type is named at the element's size). One run can hold hundreds, so they are grouped: by category and the type wanted,
// else the size — every element once. The run posts its groups as ONE type_gap row (CommandReports.TypeGaps); the bridge names each
// group and the Holding Area lists it until a lead dismisses it or an installed type_catalog@n holds the type (holding-logic.mjs).
// The snap is 0 (D16), so the size is exact: no band.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    public sealed class TypeGapGroup
    {
        public string Category, Want, Size, Key;
        public int Elements;
        /// <summary>"Storey · Label" of the first <see cref="TypeGaps.MaxLabels"/> elements; the catalogue's nearest types.</summary>
        public List<string> Labels = new List<string>(), Nearest = new List<string>();
    }

    public static class TypeGaps
    {
        /// <summary>The bridge's caps on one type_gap row (cde-store.mjs typeGapRow).</summary>
        public const int MaxGroups = 200, MaxLabels = 20, MaxNearest = 10;

        /// <summary>The run's gap groups, in the order the plans first meet them: each held element whose hold is a type gap, grouped
        /// by category and the type it wants (else its size); the facts its rules read (at most three), its labels and the nearest types.</summary>
        public static List<TypeGapGroup> Group(IReadOnlyList<StoreyPlan> plans) =>
            plans.SelectMany(p => p.Held.Where(h => h.Gap != null).Select(h => (p.Storey, Held: h)))
                .GroupBy(x => (x.Held.Gap.Category + "|" + (x.Held.Gap.Want != null ? "type " + x.Held.Gap.Want : "size " + x.Held.Gap.Size)).Trim().ToLowerInvariant())
                .Select(g =>
                {
                    var first = g.First().Held.Gap;
                    var elements = g.GroupBy(x => x.Held.UniqueId).Select(e => e.First()).ToList();
                    var key = string.Join("; ", g.Select(x => x.Held.Gap.Key).Where(k => !string.IsNullOrEmpty(k)).Distinct().Take(3));
                    return new TypeGapGroup
                    {
                        Category = first.Category, Want = first.Want, Size = first.Size,
                        Key = key.Length == 0 ? null : key, // the bridge refuses an empty key; none is null
                        Elements = elements.Count,
                        Labels = elements.Take(MaxLabels).Select(x => One(x.Storey + " · " + x.Held.Label)).ToList(),
                        Nearest = g.SelectMany(x => x.Held.Gap.Nearest ?? new List<string>()).Distinct().Take(MaxNearest).ToList(),
                    };
                })
                .ToList();

        // A label carries the element's Mark, which a person types freely: one line of at most 256 characters, as the bridge keeps it.
        private static string One(string s)
        {
            var t = new string(s.Select(ch => char.IsControl(ch) ? ' ' : ch).ToArray());
            return t.Length <= 256 ? t : t.Substring(0, 255) + "…";
        }

        /// <summary>One group in words: "Walls: "BDS_EXT_ARC_CMU_125 mm" is not in the catalogue — 2 element(s) (Function Exterior);
        /// nearest: BDS_EXT_ARC_CMU_100 mm, …", or "Doors: no type named at 915 x 2134 mm — 1 element(s) (…)".</summary>
        public static string Line(TypeGapGroup g) =>
            $"{g.Category}: " + (g.Want != null ? $"\"{g.Want}\" is not in the catalogue" : $"no type named at {g.Size}") +
            $" — {g.Elements} element(s)" + (string.IsNullOrEmpty(g.Key) ? "" : $" ({g.Key})") +
            (g.Nearest.Count > 0 ? "; nearest: " + string.Join(", ", g.Nearest.Take(3)) : "");
    }
}
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
    public sealed class PromoteHeld
    {
        public string UniqueId, Label, Reason;
    }
```

with

```csharp
    public sealed class PromoteHeld
    {
        public string UniqueId, Label, Reason;
        /// <summary>MA-2c: set when the hold is a TYPE GAP (the "gap: …" reasons): the office has no type for the element. TypeGaps
        /// groups them for the Holding Area. Null for every other hold.</summary>
        public TypeGap Gap;
    }

    /// <summary>MA-2c: why a held element is a type gap — its category; the type its DD rule asks for and the catalogue lacks (Want),
    /// or, with no rule to name one, the size no catalogue type is named at (Size, "915 x 2134 mm"); the facts the rule read (Key);
    /// the catalogue's nearest types. The Holding Area groups gaps by category and Want, else Size (design §6.4).</summary>
    public sealed class TypeGap
    {
        public string Category, Want, Size, Key;
        public List<string> Nearest = new List<string>();
    }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                    void Hold(string reason) => p.Held.Add(new PromoteHeld { UniqueId = w.UniqueId, Label = w.Label, Reason = reason });
```

with

```csharp
                    void Hold(string reason, TypeGap gap = null) => p.Held.Add(new PromoteHeld { UniqueId = w.UniqueId, Label = w.Label, Reason = reason, Gap = gap });
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                            else if (res.Source == "rule")
                                Hold(m.Gap($"{w.Label} ({w.TypeName}, {used})", res.Why));
```

with

```csharp
                            else if (res.Source == "rule") // MA-2c: a type gap when the rule names a type the catalogue lacks
                                Hold(m.Gap($"{w.Label} ({w.TypeName}, {used})", res.Why), string.IsNullOrWhiteSpace(res.Type) ? null
                                     : new TypeGap { Category = "Walls", Want = res.Type, Size = Mm(w.WidthMm, "0") + " mm", Key = used, Nearest = res.Available ?? new List<string>() });
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                var reason = Plan1(e, cls.Category, cls.Word.ToLowerInvariant(), level, oneType, office, docTypes, m, c, out var g, out var blocked);
```

with

```csharp
                var reason = Plan1(e, cls.Category, cls.Word.ToLowerInvariant(), level, oneType, office, docTypes, m, c, out var g, out var blocked, out var gap);
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                if (reason != null) p.Held.Add(new PromoteHeld { UniqueId = e.UniqueId, Label = e.Label, Reason = reason });
```

with

```csharp
                if (reason != null) p.Held.Add(new PromoteHeld { UniqueId = e.UniqueId, Label = e.Label, Reason = reason, Gap = gap });
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
        // (settled, counted in DD now; office-typed, taken out of the denominator).
        private static string Plan1(ElementFact e, string cat, string word, LevelFact level, ISet<string> oneType, string office,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, ClassCount c, out PromoteGhost g,
            out bool blocked)
        {
            g = null;
```

with

```csharp
        // (settled, counted in DD now; office-typed, taken out of the denominator). MA-2c: a type gap's facts in gap.
        private static string Plan1(ElementFact e, string cat, string word, LevelFact level, ISet<string> oneType, string office,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, ClassCount c, out PromoteGhost g,
            out bool blocked, out TypeGap gap)
        {
            g = null;
            gap = null;
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
            return family ? Swap(e, cat, oneType, office, docTypes, m, out g) : Retype(e, cat, word, docTypes, m, out g);
        }

        // Floors, roofs, ceilings: the DD rule's type at this element's thickness, loaded here with that same build-up.
        private static string Retype(ElementFact e, string cat, string word,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, out PromoteGhost g)
        {
            g = null;
```

with

```csharp
            return family ? Swap(e, cat, oneType, office, docTypes, m, out g, out gap) : Retype(e, cat, word, docTypes, m, out g, out gap);
        }

        // Floors, roofs, ceilings: the DD rule's type at this element's thickness, loaded here with that same build-up.
        private static string Retype(ElementFact e, string cat, string word,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, out PromoteGhost g, out TypeGap gap)
        {
            g = null;
            gap = null;
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
            if (res.Confidence != 1) return m.Gap($"{e.Label} ({e.TypeName}, {what}{size})", res.Why);
            IReadOnlyDictionary<string, double?> types = null;
```

with

```csharp
            if (res.Confidence != 1)
            {
                gap = new TypeGap { Category = cat, Want = res.Type, Size = t.HasValue ? Mm(t.Value, "0") + " mm" : null, Key = what, Nearest = res.Available ?? new List<string>() };
                return m.Gap($"{e.Label} ({e.TypeName}, {what}{size})", res.Why);
            }
            IReadOnlyDictionary<string, double?> types = null;
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, out PromoteGhost g)
        {
            g = null;
            if (e.HostTypeName == null)
```

with

```csharp
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, out PromoteGhost g, out TypeGap gap)
        {
            g = null;
            gap = null;
            if (e.HostTypeName == null)
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                return m.Gap($"{e.Label} ({e.Family} : {e.TypeName})", $"no {cat} type named at {size} in the catalogue");
            }
            if (string.IsNullOrWhiteSpace(res.Type)) return "the DD rule names no type — a person decides";
            if (res.Confidence != 1) return m.Gap($"{e.Label} ({e.Family} : {e.TypeName})", res.Why);
```

with

```csharp
                gap = new TypeGap { Category = cat, Size = size, Key = what };
                return m.Gap($"{e.Label} ({e.Family} : {e.TypeName})", $"no {cat} type named at {size} in the catalogue");
            }
            if (string.IsNullOrWhiteSpace(res.Type)) return "the DD rule names no type — a person decides";
            if (res.Confidence != 1)
            {
                gap = new TypeGap { Category = cat, Want = res.Type, Size = $"{Mm(w, "0")} x {Mm(h, "0")} mm", Key = what, Nearest = res.Available ?? new List<string>() };
                return m.Gap($"{e.Label} ({e.Family} : {e.TypeName})", res.Why);
            }
```

In `SentinelAddin/Coordination/CommandReports.cs`, replace

```csharp
        /// <summary>Reasons kept per LOD state row (a row's reasons can be one per element; the count stays true).</summary>
        public const int MaxReasons = 10;
```

with

```csharp
        /// <summary>Reasons kept per LOD state row (a row's reasons can be one per element; the count stays true).</summary>
        public const int MaxReasons = 10;

        /// <summary>MA-2c (design §6.4): one Promote run's type gaps — the groups of held elements the office has no type for, each
        /// with its category, the type it wants or its size, the facts its rules read, its element count, labels and the catalogue's
        /// nearest types — and which catalogue and guideline judged. The bridge names each group, words the action and marks the row
        /// claimed (cde-store.mjs typeGapRow); the Holding Area lists the groups.</summary>
        public static object TypeGaps(IReadOnlyList<TypeGapGroup> groups, string catalog, string guideline, string actor) =>
            Row("type_gap", actor, $"type_gap:run · {groups.Count} group(s), {groups.Sum(g => g.Elements)} element(s)", new
            {
                groups = groups.Take(GhostBuilder.TypeGaps.MaxGroups).Select(g => new
                {
                    category = g.Category, want = g.Want, size = g.Size, key = g.Key, elements = g.Elements,
                    labels = g.Labels.ToArray(), nearest = g.Nearest.ToArray(),
                }).ToArray(),
                groups_total = groups.Count, catalog, guideline, source = "revit",
            });
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        var bodies = PromoteWallsPlanner.Bodies(plans, actor, title: classes.Count == 1 && classes[0] == "Walls" ? "Promote walls (DD)" : "Promote (DD)");
```

with

```csharp
        // MA-2c (design §6.4): the run's type gaps — the held elements the office has no type for, grouped — as one type_gap row (the
        // Holding Area lists each group until a lead dismisses it or a catalogue with the type is installed); the read-only run too.
        var gaps = TypeGaps.Group(plans);
        if (gaps.Count > 0) GovernedNotify.Report("Type gaps", CommandReports.TypeGaps(gaps, standards.CatalogSource.Label, standards.GuidelineSource.Label, actor), key);
        var gapText = gaps.Count == 0 ? ""
            : $"\n\nType gaps (sent to the ledger — the Holding Area lists them; the pane's Doctor log says whether it was recorded): {gaps.Count} group(s), {gaps.Sum(g => g.Elements)} element(s)\n" +
              string.Join("\n", gaps.Take(8).Select(TypeGaps.Line)) + (gaps.Count > 8 ? $"\n… and {gaps.Count - 8} more" : "");
        var bodies = PromoteWallsPlanner.Bodies(plans, actor, title: classes.Count == 1 && classes[0] == "Walls" ? "Promote walls (DD)" : "Promote (DD)");
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
                          "\n\n" + string.Join("\n", lines) + "\n\n" + ddNow + "\n" + lodText + propText +
```

with

```csharp
                          "\n\n" + string.Join("\n", lines) + "\n\n" + ddNow + "\n" + lodText + propText + gapText +
```

- [ ] **Step 4: Run it, and see it pass.** `promote-check` `636/636`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`, Revit 2026 `0 Error(s)`, `3 Warning(s)`

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/TypeGaps.cs SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs SentinelAddin/GhostBuilder/PromotePlanner.cs SentinelAddin/Coordination/CommandReports.cs SentinelAddin/Commands.PromoteWalls.cs tools/promote-check/TypeGapChecks.cs tools/promote-check/Check.cs tools/promote-check/promote-check.csproj
git commit -F - <<'EOF'
feat(promote): type-gap groups - the gap holds grouped by category and the type wanted (else the size), one type_gap row per Promote run, the groups in the dialog (MA-2c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 5 — Bridge: the type_gap row, the groups derived, the catalogue's close rule, a lead's dismissal

**Files:**
- Modify `WebApp/bridge/holding-logic.mjs` — `TYPE_GAP_DISMISSAL`, `typeGapId`, `catalogMatch`, `typeGapGroups`
- Modify `WebApp/bridge/cde-store.mjs` — `type_gap` report type and `typeGapRow`; `readHolding`'s `type_gaps`, `catalogInForce`; `dismissTypeGap`
- Modify `WebApp/bridge/bcf-service.mjs` — the route
- Test `WebApp/bridge/holding-logic.test.mjs`, `cde-store-holding.test.mjs`, `write-roles.test.mjs`

**Interfaces:**
- Consumes: Task 4's row body.
- Produces: `typeGapId(g) → 12 hex`; `catalogMatch(types, g, sameCategory) → row | null`; `typeGapGroups(reportRows, dismissRows, catalog, sameCategory) → {open, closed, catalog}`; `readHolding(key)` → `{items, cleared_recent, type_gaps}`; `dismissTypeGap(key, group, {reason, actor}) → {id, hash}`; route `POST /cde/:key/holding/type-gaps/:group/dismiss`.

- [ ] **Step 1: The checks.**

In `WebApp/bridge/holding-logic.test.mjs`, replace

```js
import { heldItems, clearedRecent, clearedLabel, NAMING_NOTE } from "./holding-logic.mjs";
```

with

```js
import { heldItems, clearedRecent, clearedLabel, NAMING_NOTE, typeGapId, typeGapGroups, catalogMatch } from "./holding-logic.mjs";
```

In `WebApp/bridge/holding-logic.test.mjs`, replace

```js
    const list = clearedRecent(rows, [], versions);
    expect(list).toHaveLength(20);
    expect(list[0]).toMatchObject({ container_name: "F24.ifc" });
  });
});
```

with

```js
    const list = clearedRecent(rows, [], versions);
    expect(list).toHaveLength(20);
    expect(list[0]).toMatchObject({ container_name: "F24.ifc" });
  });
});

// MA-2c (design §6.4): a Promote run's type gaps, derived from its type_gap rows — open until a lead dismisses a group or the
// catalogue in force holds the type it wants; a later run that does not report a group does not close it.
describe("typeGapGroups — the Holding Area's type gaps", () => {
  const WALL = { category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", key: "Function Exterior", elements: 2, labels: ["GR-FFL · W 2051449", "GR-FFL · W 2051450"], nearest: ["BDS_EXT_ARC_CMU_100 mm"] };
  const DOOR = { category: "Doors", want: null, size: "915 x 2134 mm", key: "HostFunction Interior, Size W915 x H2134 mm", elements: 1, labels: ["GR-FFL · D 2069758"], nearest: [] };
  const run = (id, min, groups, actor = "lead@example.test") => ({ id, at: at(min), hash: hash(id), actor, action: `type_gap:run · ${groups.length} group(s)`, new_value: { groups: groups.map((g) => ({ id: typeGapId(g), ...g })), claimed: true } });
  const dismiss = (id, min, g, reason = "a template sample, not a design wall") => ({ id, at: at(min), hash: hash(id), actor: "lead@example.test", action: `hold:type_gap_dismissed ${typeGapId(g)}`, new_value: { group: typeGapId(g), reason } });
  const NO_CATALOG = { types: null, label: "none — not installed for ma2c or its office" };
  const same = (r, cat) => r.category === cat;

  it("a group's id is its category and the type it wants, else its size: the same gap on every run is one id", () => {
    expect(typeGapId(WALL)).toMatch(/^[0-9a-f]{12}$/);
    expect(typeGapId({ ...WALL, elements: 9, key: "Location Exterior" })).toBe(typeGapId(WALL));
    expect(typeGapId({ ...WALL, category: " walls ", want: "bds_ext_arc_cmu_125 MM" })).toBe(typeGapId(WALL));
    expect(typeGapId(DOOR)).not.toBe(typeGapId({ ...DOOR, size: "915 x 2032 mm" }));
  });

  it("every group a run reported is open, from its newest run — counted, with its runs; a later run without it does not close it", () => {
    const g = typeGapGroups([run(901, 1, [WALL, DOOR]), run(905, 5, [{ ...WALL, elements: 3 }])], [], NO_CATALOG, same);
    expect(g.open.map((x) => [x.category, x.elements, x.runs, x.ledger.id])).toEqual([["Walls", 3, 2, 905], ["Doors", 1, 1, 901]]);
    expect(g.open[0]).toMatchObject({ id: typeGapId(WALL), want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", at: at(5), actor: "lead@example.test" });
    expect(g).toMatchObject({ closed: [], catalog: "none — not installed for ma2c or its office" });
  });

  it("a lead's dismissal closes it with the reason; a run that reports it again opens it again", () => {
    const g = typeGapGroups([run(901, 1, [WALL, DOOR])], [dismiss(903, 3, DOOR)], NO_CATALOG, same);
    expect(g.open.map((x) => x.category)).toEqual(["Walls"]);
    expect(g.closed).toEqual([expect.objectContaining({ category: "Doors", closed_by: "dismissed", reason: "a template sample, not a design wall", closed_at: at(3), closed_by_actor: "lead@example.test", closed_ledger: { id: 903, hash: hash(903) } })]);
    expect(typeGapGroups([run(901, 1, [DOOR]), run(907, 7, [DOOR])], [dismiss(903, 3, DOOR)], NO_CATALOG, same).open).toHaveLength(1);
  });

  it("the catalogue in force closes a group when it holds the type it wants — or, wanting none, a type of its category named at its size", () => {
    const catalog = { types: [{ category: "Walls", family: "Basic Wall", type: "BDS_EXT_ARC_CMU_125 mm" }, { category: "Doors", family: "BDS_INT_1 PNL", type: "BDS_INT_1 PNL_WOOD_915 x 2134 mm" }], label: "type_catalog@3 · office · 0f0f0f0f0f0f…" };
    const g = typeGapGroups([run(901, 1, [WALL, DOOR])], [], catalog, same);
    expect(g.open).toEqual([]);
    expect(g.closed.map((x) => [x.category, x.closed_by, x.type, x.catalog])).toEqual([
      ["Walls", "catalogue", "BDS_EXT_ARC_CMU_125 mm", "type_catalog@3 · office · 0f0f0f0f0f0f…"], ["Doors", "catalogue", "BDS_INT_1 PNL_WOOD_915 x 2134 mm", "type_catalog@3 · office · 0f0f0f0f0f0f…"]]);
    expect(catalogMatch(catalog.types, { ...WALL, want: "BDS_EXT_ARC_CMU_212 mm" }, same)).toBeNull();
    expect(catalogMatch(catalog.types, { ...DOOR, category: "Windows" }, same)).toBeNull();
    expect(catalogMatch(null, WALL, same)).toBeNull();
  });
});
```

In `WebApp/bridge/cde-store-holding.test.mjs`, replace

```js
import { readHolding, dismissHold } from "./cde-store.mjs";
import { NAMING_NOTE } from "./holding-logic.mjs";
```

with

```js
import { readFileSync } from "node:fs";
import { readHolding, dismissHold, dismissTypeGap } from "./cde-store.mjs";
import { NAMING_NOTE, typeGapId } from "./holding-logic.mjs";
```

In `WebApp/bridge/cde-store-holding.test.mjs`, replace

```js
    expect((await readHolding("aster-tower")).items).toEqual([]);
    expect(db.audit_log.map((x) => x.action)).toEqual(["hold:naming tower final.ifc", "hold:dismissed tower final.ifc"]);
  });
});
```

with

```js
    expect((await readHolding("aster-tower")).items).toEqual([]);
    expect(db.audit_log.map((x) => x.action)).toEqual(["hold:naming tower final.ifc", "hold:dismissed tower final.ifc"]);
  });
});

// MA-2c (design §6.4, §6.8): the Holding Area's type gaps — read from Promote's type_gap rows beside the hold rows, the catalogue
// in force read for the close rule (none here: nothing is closed by it, and the reply says so); a lead dismisses a group.
describe("readHolding and dismissTypeGap — type-gap groups (MA-2c)", () => {
  const WALL = { category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", key: "Function Exterior", elements: 2, labels: ["GR-FFL · W 2051449"], nearest: [] };
  const gapRun = (id, min, groups) => ({ id, at: at(min), hash: hash(id), project_id: P, entity_type: "type_gap", entity_id: null, action: "type_gap:run · 1 group(s), 2 element(s)", actor: "lead@example.test",
    new_value: { groups: groups.map((g) => ({ id: typeGapId(g), ...g })), claimed: true } });

  it("the reply carries type_gaps {open, closed, catalog} read from every type_gap row; with no catalogue installed nothing is closed by one", async () => {
    db.audit_log.push(gapRun(901, 1, [WALL]));
    const r = await readHolding("aster-tower");
    expect(r.type_gaps).toEqual({ open: [expect.objectContaining({ id: typeGapId(WALL), category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", elements: 2, runs: 1, ledger: { id: 901, hash: hash(901) } })],
      closed: [], catalog: "none — not installed for aster-tower or its office" });
    expect(calls.some((c) => c.table === "audit_log" && /entity_type=eq\.type_gap/.test(c.query))).toBe(true);
  });

  it("a lead dismisses an open group with a reason: one hold:type_gap_dismissed row, the group closed with it; the type_gap row stays", async () => {
    db.audit_log.push(gapRun(901, 1, [WALL]));
    const id = typeGapId(WALL);
    const r = await dismissTypeGap("aster-tower", id, { reason: " a template sample ", actor: "lead@example.test" });
    const row = db.audit_log.at(-1);
    expect(row).toMatchObject({ entity_type: "hold", action: `hold:type_gap_dismissed ${id}`, actor: "lead@example.test",
      new_value: { group: id, reason: "a template sample", category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", elements: 2 } });
    expect(r).toEqual({ id: row.id, hash: row.hash });
    const after = (await readHolding("aster-tower")).type_gaps;
    expect(after.open).toEqual([]);
    expect(after.closed).toMatchObject([{ id, closed_by: "dismissed", reason: "a template sample" }]);
    expect((await readHolding("aster-tower")).items).toEqual([]); // a type-gap dismissal is no held file's
  });

  it("a contributor is refused before any read; no reason is a 400; a group that is not open is a 409 and nothing is written", async () => {
    state.role = "contributor";
    await expect(dismissTypeGap("aster-tower", "abc", { reason: "x" })).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
    state.role = "lead";
    await expect(dismissTypeGap("aster-tower", "abc", { reason: " " })).rejects.toMatchObject({ status: 400, message: "reason is required — a lead's dismissal says why, in at most 500 characters" });
    await expect(dismissTypeGap("aster-tower", "0123456789ab", { reason: "x" })).rejects.toMatchObject({ status: 409, message: "type-gap group 0123456789ab is not open on aster-tower" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("the route: POST /cde/:key/holding/type-gaps/:group/dismiss reaches dismissTypeGap (bcf-service.mjs)", () => {
    const src = readFileSync(new URL("./bcf-service.mjs", import.meta.url), "utf8");
    expect(src).toContain('if (p2 === "holding" && p3 === "type-gaps" && p4 && seg[5] === "dismiss" && !seg[6] && req.method === "POST")');
    expect(src).toContain("return send(res, 201, await cde.dismissTypeGap(p1, decodeURIComponent(p4), (await readBody(req)) || {}));");
  });
});
```

In `WebApp/bridge/write-roles.test.mjs`, replace

```js
  it("a share is null when nothing was counted, or when a class with a DD row was not run — a class with no DD row asks nothing", async () => {
```

with

```js
  // MA-2c: a type_gap row is one Promote run's gap groups — claimed like lod_state; the bridge names each group and words the action.
  it("a type_gap row lands under the verified identity, each group named by the bridge, claimed; a malformed one is refused (MA-2c)", async () => {
    const wall = { category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", key: "Function Exterior", elements: 2, labels: ["GR-FFL · W 1"], nearest: ["BDS_EXT_ARC_CMU_100 mm"] };
    const door = { category: "Doors", size: "915 x 2134 mm", elements: 1 };
    const r = await call("POST", A, "contributor", { entity_type: "type_gap", action: "anything", new_value: { groups: [wall, door], catalog: "type_catalog@1", claimed: false } });
    expect(r.status).toBe(201);
    const [row] = db.audit_log;
    expect([row.entity_type, row.action, row.actor]).toEqual(["type_gap", "type_gap:run · 2 group(s), 3 element(s)", "contributor@example.test"]);
    expect(row.new_value).toEqual({ catalog: "type_catalog@1", claimed: true, groups: [
      { id: expect.stringMatching(/^[0-9a-f]{12}$/), ...wall },
      { id: expect.stringMatching(/^[0-9a-f]{12}$/), category: "Doors", want: null, size: "915 x 2134 mm", key: null, elements: 1, labels: [], nearest: [] }] });
    for (const [v, message] of [
      ["2 gaps", "new_value is the run's gap groups, an object"],
      [{ groups: [] }, "groups is a list of 1 to 200 gap groups"],
      [{ groups: [{ category: "Walls", elements: 2 }] }, "groups[0] names the type it wants or the size it has (want or size)"],
      [{ groups: [{ ...wall, elements: 0 }] }, "groups[0].elements is a whole number ≥ 1"],
      [{ groups: [{ ...wall, key: "" }] }, "groups[0].key is one line of at most 500 characters"],
      [{ groups: [{ ...wall, labels: ["a\nb"] }] }, "groups[0].labels is a list of at most 50 one-line texts"],
    ]) expect(await call("POST", A, "machine", { entity_type: "type_gap", action: "x", new_value: v })).toEqual({ status: 400, body: { message: `a type_gap row's ${message} — nothing was saved` } });
    expect(db.audit_log).toHaveLength(1);
  });

  it("a share is null when nothing was counted, or when a class with a DD row was not run — a class with no DD row asks nothing", async () => {
```

- [ ] **Step 2: Run them, and see them fail.** From `WebApp`: `npx vitest run bridge/holding-logic.test.mjs bridge/cde-store-holding.test.mjs bridge/write-roles.test.mjs` — `Test Files  3 failed (3)`, `Tests  9 failed | 89 passed (98)`: the four new holding-logic tests (`typeGapId` is not a function), the four of `cde-store-holding` (no `type_gaps`, no `dismissTypeGap`, no route) and the `type_gap` row (400: not a Revit report type).

- [ ] **Step 3: The row, the groups, the route.**

In `WebApp/bridge/holding-logic.mjs`, replace

```js
export const NAMING_NOTE = "the corrected file carries a new name — a lead dismisses this entry once it is registered";
```

with

```js
import { createHash } from "node:crypto";

export const NAMING_NOTE = "the corrected file carries a new name — a lead dismisses this entry once it is registered";
```

In `WebApp/bridge/holding-logic.mjs`, replace

```js
export const clearedRecent = (holdRows, dismissRows, versionsByName) => walk(holdRows, dismissRows, versionsByName).cleared.slice(0, 20);
```

with

```js
export const clearedRecent = (holdRows, dismissRows, versionsByName) => walk(holdRows, dismissRows, versionsByName).cleared.slice(0, 20);

// ── MA-2c: type-gap groups (design §6.4). A Promote run posts its gap groups as one type_gap row (cde-store typeGapRow names each
// group); a group is open from the newest run that reported it until a lead dismisses it (a hold:type_gap_dismissed row) or the
// type catalogue in force holds the type it wants (else a type of its category named at its size). A later run that does not
// report a group does not close it (founder decision F7); a run that reports it after a dismissal opens it again.

export const TYPE_GAP_DISMISSAL = "hold:type_gap_dismissed ";
const norm = (s) => String(s ?? "").trim().toLowerCase();

/** A group's id: the same gap on every run is one id — its category and the type it wants, else its size. */
export const typeGapId = (g) => createHash("sha256").update(`${norm(g.category)}|${g.want ? `type ${norm(g.want)}` : `size ${norm(g.size)}`}`).digest("hex").slice(0, 12);

/** "915 x 2134 mm" → [915, 2134]; the add-in's TypeNameParse.TrySection. */
const sectionOf = (s) => { const m = /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*mm/i.exec(String(s ?? "")); return m ? [Number(m[1]), Number(m[2])] : null; };

/** The catalogue row that closes a group, or null: of its category (`sameCategory`, the bundle's — by name or BuiltInCategory), the
 *  type it wants by name; a group that wants no named type, a type named at its size. */
export function catalogMatch(types, g, sameCategory) {
  const rows = (Array.isArray(types) ? types : []).filter((r) => r && sameCategory(r, g.category));
  if (g.want) return rows.find((r) => norm(r.type) === norm(g.want)) ?? null;
  const want = sectionOf(g.size);
  return want ? rows.find((r) => { const s = sectionOf(r.type); return s && s[0] === want[0] && s[1] === want[1]; }) ?? null : null;
}

/** The type-gap groups, derived: `reportRows` the type_gap rows, `dismissRows` the hold rows (others are ignored), `catalog` the type
 *  catalogue in force {types, label} — types null when none is installed or it was not read (the label says which; nothing is
 *  then closed by it). → {open, closed (the newest 20), catalog}: each group {id, category, want, size, key, elements, labels,
 *  nearest, at, actor, ledger, runs}; a closed one adds closed_by "dismissed" (reason, closed_at, closed_by_actor, closed_ledger) or
 *  "catalogue" (type: the row that closes it, catalog: its label). Newest first. */
export function typeGapGroups(reportRows, dismissRows, catalog, sameCategory) {
  const order = (a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id ?? 0) - (b.id ?? 0);
  const seen = new Map();
  for (const r of [...(reportRows || [])].sort(order))
    for (const g of Array.isArray(r.new_value?.groups) ? r.new_value.groups : []) {
      const id = g.id ?? typeGapId(g);
      seen.set(id, {
        id, category: g.category, want: g.want ?? null, size: g.size ?? null, key: g.key ?? null, elements: g.elements,
        labels: g.labels ?? [], nearest: g.nearest ?? [], at: r.at, actor: r.actor ?? null, ledger: { id: r.id ?? null, hash: r.hash ?? null },
        runs: (seen.get(id)?.runs ?? 0) + 1,
      });
    }
  const dismissed = new Map(); // id → its newest dismissal
  for (const d of [...(dismissRows || [])].sort(order))
    if (String(d.action).startsWith(TYPE_GAP_DISMISSAL)) dismissed.set(d.new_value?.group ?? String(d.action).slice(TYPE_GAP_DISMISSAL.length), d);
  const open = [], closed = [];
  for (const g of seen.values()) {
    const d = dismissed.get(g.id);
    if (d && order(d, { at: g.at, id: g.ledger.id }) > 0) {
      closed.push({ ...g, closed_by: "dismissed", reason: d.new_value?.reason ?? null, closed_at: d.at, closed_by_actor: d.actor ?? null, closed_ledger: { id: d.id ?? null, hash: d.hash ?? null } });
      continue;
    }
    const hit = catalog?.types ? catalogMatch(catalog.types, g, sameCategory) : null;
    if (hit) { closed.push({ ...g, closed_by: "catalogue", type: hit.type, catalog: catalog.label }); continue; }
    open.push(g);
  }
  const newest = (a, b) => Date.parse(b.closed_at ?? b.at) - Date.parse(a.closed_at ?? a.at);
  return { open: open.sort(newest), closed: closed.sort(newest).slice(0, 20), catalog: catalog?.label ?? null };
}
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
import { createLimiter, createKeyedLimiter } from "./public-verify.mjs";
```

with

```js
import { createLimiter, createKeyedLimiter } from "./public-verify.mjs";
import { typeGapId } from "./holding-logic.mjs"; // MA-2c: a type-gap group's id
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
  // MA-2b: Promote's LOD state of the model, now or after an applied changeset (lodStateRow marks it claimed).
  "lod_state"];
```

with

```js
  // MA-2b: Promote's LOD state of the model, now or after an applied changeset (lodStateRow marks it claimed).
  "lod_state",
  // MA-2c: Promote's type gaps of one run, grouped (typeGapRow names each group and marks the row claimed).
  "type_gap"];

/** MA-2c (design §6.4): one Promote run's type gaps — groups of held elements the office has no type for — counted in Revit, not by
 *  the bridge: claimed, like lod_state, whoever posts it. Each group {category, want | size, key?, elements ≥ 1, labels?, nearest?}
 *  is kept name for name and given the bridge's own id (holding-logic typeGapId: the same gap on every run is one group); the
 *  bridge words the action. The Holding Area reads these rows (readHolding). Anything else is a 400. */
function typeGapRow(b) {
  const v = b.new_value;
  const no = (m) => Object.assign(new Error(`a type_gap row's ${m} — nothing was saved`), { status: 400 });
  const line = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max && !/[\u0000-\u001f]/.test(s);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw no("new_value is the run's gap groups, an object");
  if (!Array.isArray(v.groups) || v.groups.length < 1 || v.groups.length > 200) throw no("groups is a list of 1 to 200 gap groups");
  const groups = v.groups.map((g, i) => {
    const at = `groups[${i}]`;
    if (!g || typeof g !== "object" || Array.isArray(g)) throw no(`${at} is an object`);
    if (!line(g.category, 64)) throw no(`${at}.category is one line of at most 64 characters`);
    for (const [f, max] of [["want", 256], ["size", 64], ["key", 500]]) if (g[f] != null && !line(g[f], max)) throw no(`${at}.${f} is one line of at most ${max} characters`);
    if (g.want == null && g.size == null) throw no(`${at} names the type it wants or the size it has (want or size)`);
    if (!Number.isInteger(g.elements) || g.elements < 1) throw no(`${at}.elements is a whole number ≥ 1`);
    for (const f of ["labels", "nearest"])
      if (g[f] != null && !(Array.isArray(g[f]) && g[f].length <= 50 && g[f].every((s) => line(s, 256)))) throw no(`${at}.${f} is a list of at most 50 one-line texts`);
    const kept = { category: g.category.trim(), want: g.want?.trim() ?? null, size: g.size?.trim() ?? null, key: g.key ?? null, elements: g.elements, labels: g.labels ?? [], nearest: g.nearest ?? [] };
    return { id: typeGapId(kept), ...kept };
  });
  const n = groups.reduce((s, g) => s + g.elements, 0);
  // Not "hold:type_gap" (design §6.4): hold: actions are Sentinel's own rows (RESERVED_ACTIONS) and never come through this route.
  return { ...b, action: `type_gap:run · ${groups.length} group(s), ${n} element(s)`, new_value: { ...v, groups, claimed: true } };
}
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
  else if (type === "lod_state") b = lodStateRow(b);
```

with

```js
  else if (type === "lod_state") b = lodStateRow(b);
  else if (type === "type_gap") b = typeGapRow(b);
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
export async function readHolding(key) {
  const { heldItems, clearedRecent } = await import("./holding-logic.mjs");
  let rows, files, verdicts;
  try {
    rows = await auditAll(key, { entity_type: "hold" });
    [files, verdicts] = await Promise.all([listFiles(key), listVersionVerdictRows(key)]);
  } catch (e) {
    if (e?.status) throw e;
    console.error(`[holding] ${key}: ${e?.message || e}`);
    throw Object.assign(new Error("not read — the hold rows or the file list could not be read (the bridge log has the cause)"), { status: 502 });
  }
  const verdictOf = new Map();
  for (const r of verdicts) if (!verdictOf.has(r.version_id)) verdictOf.set(r.version_id, r.verdict); // newest first
  const versionsByName = {};
  for (const f of files) (versionsByName[f.iso_name] ||= []).push(...f.versions.map((v) => ({ id: v.id, created_at: v.created_at, verdict: verdictOf.get(v.id) ?? null })));
  return { items: heldItems(rows, rows, versionsByName), cleared_recent: clearedRecent(rows, rows, versionsByName) };
}
```

with

```js
export async function readHolding(key) {
  const { heldItems, clearedRecent, typeGapGroups } = await import("./holding-logic.mjs");
  let rows, gapRows, files, verdicts;
  try {
    rows = await auditAll(key, { entity_type: "hold" });
    gapRows = await auditAll(key, { entity_type: "type_gap" }); // MA-2c: Promote's type gaps, run by run
    [files, verdicts] = await Promise.all([listFiles(key), listVersionVerdictRows(key)]);
  } catch (e) {
    if (e?.status) throw e;
    console.error(`[holding] ${key}: ${e?.message || e}`);
    throw Object.assign(new Error("not read — the hold rows or the file list could not be read (the bridge log has the cause)"), { status: 502 });
  }
  const verdictOf = new Map();
  for (const r of verdicts) if (!verdictOf.has(r.version_id)) verdictOf.set(r.version_id, r.verdict); // newest first
  const versionsByName = {};
  for (const f of files) (versionsByName[f.iso_name] ||= []).push(...f.versions.map((v) => ({ id: v.id, created_at: v.created_at, verdict: verdictOf.get(v.id) ?? null })));
  const core = await import("./sentinel-core.mjs");
  return {
    items: heldItems(rows, rows, versionsByName), cleared_recent: clearedRecent(rows, rows, versionsByName),
    type_gaps: typeGapGroups(gapRows, rows, await catalogInForce(key), core.sameCategory),
  };
}

/** MA-2c: the type catalogue in force for `key` (project → office) as the type-gap close rule reads it — {types, label}; types null
 *  when none is installed or it could not be read or no longer passes the install check (the label says which: nothing is then
 *  closed by it, and the groups stay open). */
async function catalogInForce(key) {
  try {
    const { resolveArtefact, refLabel, validateArtefact } = await import("./artefact-store.mjs");
    const a = await resolveArtefact(key, "type_catalog");
    if (a.source === "none") return { types: null, label: `none — not installed for ${key} or its office` };
    validateArtefact("type_catalog", a.body);
    return { types: a.body.types, label: refLabel(a) };
  } catch (e) {
    return { types: null, label: `not read — ${e?.message || e}` };
  }
}

/** MA-2c: POST /cde/:key/holding/type-gaps/:group/dismiss {reason} (design §6.8) — a lead clears a type-gap group, as dismissHold
 *  clears a held file: lead or owner, the machine credential passes (founder decision F8: the existing dismissal's rule); a reason is
 *  required (≤ 500); only an open group (409 otherwise). One hold:type_gap_dismissed row, new_value {group, reason, category, want,
 *  size, elements}; the type_gap rows stay. → {id, hash} of that row. */
export async function dismissTypeGap(key, group, b = {}) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "lead");
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!reason || reason.length > 500) throw Object.assign(new Error("reason is required — a lead's dismissal says why, in at most 500 characters"), { status: 400 });
  const g = (await readHolding(key)).type_gaps.open.find((x) => x.id === group);
  if (!g) throw Object.assign(new Error(`type-gap group ${group} is not open on ${key}`), { status: 409 });
  const proj = await ensureProject(key);
  const row = await audit(proj.id, "hold", null, `hold:type_gap_dismissed ${group}`, b.actor || "web", null,
    { group, reason, category: g.category, want: g.want, size: g.size, elements: g.elements });
  return { id: row?.id ?? null, hash: row?.hash ?? null };
}
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
      if (p2 === "holding" && p3 === "dismiss" && !p4 && req.method === "POST") return send(res, 201, await cde.dismissHold(p1, (await readBody(req)) || {}));
```

with

```js
      if (p2 === "holding" && p3 === "dismiss" && !p4 && req.method === "POST") return send(res, 201, await cde.dismissHold(p1, (await readBody(req)) || {}));
      // MA-2c (design §6.8): the reply's type_gaps {open, closed, catalog} are Promote's type-gap groups. POST
      //   /cde/:key/holding/type-gaps/:group/dismiss {reason} → 201 {id, hash}: lead only (403), a reason required (400), an open group
      //   (409) — one hold:type_gap_dismissed row (cde-store.mjs dismissTypeGap).
      if (p2 === "holding" && p3 === "type-gaps" && p4 && seg[5] === "dismiss" && !seg[6] && req.method === "POST")
        return send(res, 201, await cde.dismissTypeGap(p1, decodeURIComponent(p4), (await readBody(req)) || {}));
```

- [ ] **Step 4: Run them, and see them pass.** The same command — `Test Files  3 passed (3)`, `Tests  98 passed (98)`; the bridge suite `Test Files  89 passed (89)`, `Tests  1801 passed | 1 skipped (1802)`

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/holding-logic.mjs WebApp/bridge/holding-logic.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store-holding.test.mjs WebApp/bridge/write-roles.test.mjs WebApp/bridge/bcf-service.mjs
git commit -F - <<'EOF'
feat(holding): type-gap groups - the type_gap row (claimed, each group named by the bridge), derived open and closed groups (a lead's dismissal, or the catalogue in force holding the type), POST /cde/:key/holding/type-gaps/:group/dismiss (MA-2c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 6 — Web: the Holding Area's "Type gaps (n)" section and a lead's dismissal

**Files:**
- Modify `WebApp/src/setups/holding.ts` — `TypeGap`, `TypeGaps`, `Holding.type_gaps`; `readHolding`; `typeGapLine`, `typeGapClosedLine`, `dismissTypeGap`
- Modify `WebApp/src/setups/files-panel.ts` — the section, its state and its buttons
- Test `WebApp/src/setups/holding.test.ts`

**Interfaces:**
- Consumes: Task 5's `GET /cde/:key/holding` reply (`type_gaps`) and dismissal route.
- Produces: `readHolding(baseUrl, key) → {items, cleared_recent, type_gaps: {open, closed, catalog} | null}` (null from a bridge before MA-2c); `typeGapLine(g)` (the add-in's `TypeGaps.Line` words); `typeGapClosedLine(g)`; `dismissTypeGap(baseUrl, key, group, reason) → LedgerRef`.

- [ ] **Step 1: The checks.**

In `WebApp/src/setups/holding.test.ts`, replace

```ts
import { uploadThroughIntake, uploadFailedLine, intakeLine, readHolding, dismissHold, resubmitFor, type IntakeReply, type Holding } from "./holding";
```

with

```ts
import { uploadThroughIntake, uploadFailedLine, intakeLine, readHolding, dismissHold, resubmitFor, type IntakeReply, type Holding,
  typeGapLine, typeGapClosedLine, dismissTypeGap, type TypeGap } from "./holding";
```

In `WebApp/src/setups/holding.test.ts`, replace

```ts
const rejected = (over: Partial<IntakeReply>): IntakeReply =>
  reply({ verdict: "rejected", stage: "ids", version: null, hold: { id: 915, hash: HOLD }, ...over });
```

with

```ts
const rejected = (over: Partial<IntakeReply>): IntakeReply =>
  reply({ verdict: "rejected", stage: "ids", version: null, hold: { id: 915, hash: HOLD }, ...over });
// MA-2c: one type-gap group as the bridge's GET /cde/:key/holding sends it.
const GAP: TypeGap = {
  id: "3c5d7e9f0a1b", category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", key: "Function Exterior", elements: 2,
  labels: ["GR-FFL · W 2051449", "GR-FFL · W 2051450"], nearest: ["BDS_EXT_ARC_CMU_100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_400 mm"],
  at: "2026-10-03T10:00:00Z", actor: "lead@example.com", ledger: { id: 950, hash: HOLD }, runs: 1,
};
```

In `WebApp/src/setups/holding.test.ts`, replace

```ts
      cleared_recent: [{ container_name: "B12-G.ifc", by: "recorded", version_id: "v-1", at: "2026-09-27T11:00:00Z" }],
    };
    bfetch.mockResolvedValue(res(200, h));
    expect(await readHolding("http://b/", "b12-hold")).toEqual(h);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/b12-hold/holding");
  });
```

with

```ts
      cleared_recent: [{ container_name: "B12-G.ifc", by: "recorded", version_id: "v-1", at: "2026-09-27T11:00:00Z" }],
      type_gaps: null,
    };
    bfetch.mockResolvedValue(res(200, { items: h.items, cleared_recent: h.cleared_recent })); // a bridge before MA-2c sends no type_gaps
    expect(await readHolding("http://b/", "b12-hold")).toEqual(h);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/b12-hold/holding");
  });

  it("MA-2c: the type-gap groups ride beside the holds, open and closed, with the catalogue the close rule read", async () => {
    const gaps = { open: [GAP], closed: [{ ...GAP, id: "0f0f0f0f0f0f", closed_by: "catalogue", type: "BDS_EXT_ARC_CMU_125 mm", catalog: "type_catalog@3 · office · 0f0f0f0f0f0f…" }], catalog: "type_catalog@3 · office · 0f0f0f0f0f0f…" };
    bfetch.mockResolvedValue(res(200, { items: [], cleared_recent: [], type_gaps: gaps }));
    expect((await readHolding("http://b", "ma2c")).type_gaps).toEqual(gaps);
    bfetch.mockResolvedValue(res(200, { items: [], cleared_recent: [], type_gaps: { open: [GAP] } }));
    expect((await readHolding("http://b", "ma2c")).type_gaps).toEqual({ open: [GAP], closed: [], catalog: null });
  });
```

In `WebApp/src/setups/holding.test.ts`, replace

```ts
describe("resubmitFor — how a held file is sent again", () => {
```

with

```ts
// MA-2c (design §6.4): Promote's type-gap groups in words — the add-in's TypeGaps.Line — and a lead's dismissal with a reason.
describe("type gaps — the Holding Area's own section (MA-2c)", () => {
  beforeEach(() => bfetch.mockReset());

  it("typeGapLine says what is missing, how many, from what facts and the nearest types — as the add-in's dialog does", () => {
    expect(typeGapLine(GAP)).toBe('Walls: "BDS_EXT_ARC_CMU_125 mm" is not in the catalogue — 2 element(s) (Function Exterior); nearest: BDS_EXT_ARC_CMU_100 mm, BDS_EXT_ARC_CMU_200 mm, BDS_EXT_ARC_CMU_300 mm');
    expect(typeGapLine({ ...GAP, want: null, size: "915 x 2134 mm", key: null, nearest: [], elements: 1, category: "Doors" })).toBe("Doors: no type named at 915 x 2134 mm — 1 element(s)");
  });

  it("typeGapClosedLine says how a group was closed: a lead's reason, or the catalogue that now holds the type", () => {
    expect(typeGapClosedLine({ ...GAP, closed_by: "dismissed", reason: "a template sample" })).toBe("dismissed — a template sample");
    expect(typeGapClosedLine({ ...GAP, closed_by: "catalogue", type: "BDS_EXT_ARC_CMU_125 mm", catalog: "type_catalog@3 · office · 0f0f0f0f0f0f…" }))
      .toBe("closed — type_catalog@3 · office · 0f0f0f0f0f0f… has BDS_EXT_ARC_CMU_125 mm");
  });

  it("dismissTypeGap posts the trimmed reason to the group's route and returns the row; a blank reason is never sent; a refusal says the bridge's words", async () => {
    bfetch.mockResolvedValue(res(201, { id: 960, hash: HOLD }));
    expect(await dismissTypeGap("http://b/", "ma2c", GAP.id, "  a template sample  ")).toEqual({ id: 960, hash: HOLD });
    expect(bfetch).toHaveBeenCalledWith(`http://b/cde/ma2c/holding/type-gaps/${GAP.id}/dismiss`, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ reason: "a template sample" });
    bfetch.mockReset();
    await expect(dismissTypeGap("http://b", "ma2c", GAP.id, " ")).rejects.toThrow("a dismissal needs a reason — the ledger records it");
    expect(bfetch).not.toHaveBeenCalled();
    bfetch.mockResolvedValue(res(409, { message: `type-gap group ${GAP.id} is not open on ma2c` }));
    await expect(dismissTypeGap("http://b", "ma2c", GAP.id, "why")).rejects.toThrow(`type-gap group ${GAP.id} is not open on ma2c`);
  });
});

describe("resubmitFor — how a held file is sent again", () => {
```

- [ ] **Step 2: Run it, and see it fail.** From `WebApp`: `npx vitest run src/setups/holding.test.ts` — `Test Files  1 failed (1)`, `Tests  5 failed | 15 passed (20)`: the five new or changed tests (no `type_gaps`, no `typeGapLine`, `typeGapClosedLine`, `dismissTypeGap`).

- [ ] **Step 3: The read, the words, the section.**

In `WebApp/src/setups/holding.ts`, replace

```ts
export interface ClearedItem { container_name: string; by: string; version_id: string; at: string; label?: string; }
export interface Holding { items: HeldItem[]; cleared_recent: ClearedItem[]; }
```

with

```ts
export interface ClearedItem { container_name: string; by: string; version_id: string; at: string; label?: string; }
/** MA-2c (design §6.4): one type-gap group — elements Promote held because the office has no type for them, from its type_gap
 *  rows: the type the rule wants (else the size), how many, from which facts, the catalogue's nearest types. Closed by a lead's
 *  dismissal (reason) or by the catalogue in force holding the type (type, catalog). */
export interface TypeGap {
  id: string; category: string; want: string | null; size: string | null; key: string | null; elements: number;
  labels: string[]; nearest: string[]; at: string; actor: string | null; ledger: LedgerRef; runs: number;
  closed_by?: "dismissed" | "catalogue"; reason?: string | null; closed_at?: string; type?: string; catalog?: string;
}
export interface TypeGaps { open: TypeGap[]; closed: TypeGap[]; catalog: string | null; }
/** type_gaps is null from a bridge before MA-2c (it lists none). */
export interface Holding { items: HeldItem[]; cleared_recent: ClearedItem[]; type_gaps: TypeGaps | null; }
```

In `WebApp/src/setups/holding.ts`, replace

```ts
  return { items: j.items, cleared_recent: Array.isArray(j.cleared_recent) ? j.cleared_recent : [] };
}
```

with

```ts
  const g = (j as { type_gaps?: TypeGaps | null }).type_gaps;
  return {
    items: j.items, cleared_recent: Array.isArray(j.cleared_recent) ? j.cleared_recent : [],
    type_gaps: g && Array.isArray(g.open) ? { open: g.open, closed: Array.isArray(g.closed) ? g.closed : [], catalog: g.catalog ?? null } : null,
  };
}

/** MA-2c: a type-gap group in words — the add-in's TypeGaps.Line: "Walls: "BDS_EXT_ARC_CMU_125 mm" is not in the catalogue — 2
 *  element(s) (Function Exterior); nearest: BDS_EXT_ARC_CMU_100 mm, …", or "Doors: no type named at 915 x 2134 mm — 1 element(s)". */
export function typeGapLine(g: TypeGap): string {
  return `${g.category}: ` + (g.want ? `"${g.want}" is not in the catalogue` : `no type named at ${g.size}`) + ` — ${g.elements} element(s)` +
    (g.key ? ` (${g.key})` : "") + (g.nearest?.length ? `; nearest: ${g.nearest.slice(0, 3).join(", ")}` : "");
}

/** MA-2c: how a closed group was closed: "dismissed — <reason>" or "closed — <catalogue> has <type>". */
export function typeGapClosedLine(g: TypeGap): string {
  return g.closed_by === "catalogue" ? `closed — ${g.catalog} has ${g.type}` : `dismissed — ${g.reason ?? "no reason recorded"}`;
}

/** MA-2c: POST /cde/:key/holding/type-gaps/:group/dismiss {reason} → the hold:type_gap_dismissed row {id, hash}. A blank reason is
 *  never sent; a refusal (a role below lead is a 403, a group no longer open a 409) throws the bridge's words. */
export async function dismissTypeGap(baseUrl: string, key: string, group: string, reason: string): Promise<LedgerRef> {
  const why = reason.trim();
  if (!why) throw new Error("a dismissal needs a reason — the ledger records it");
  const r = await bfetch(at(baseUrl, key, `holding/type-gaps/${encodeURIComponent(group)}/dismiss`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: why }),
  });
  const j = (await r.json().catch(() => null)) as (LedgerRef & { message?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.message || `HTTP ${r.status}`);
  return { id: j.id ?? null, hash: j.hash ?? null };
}
```

In `WebApp/src/setups/files-panel.ts`, replace

```ts
import { uploadThroughIntake, uploadFailedLine, intakeLine, readHolding, dismissHold, resubmitFor, STAGE_WORDS, SOURCE_WORDS, CLEARED_BY_RECORDED, type Holding, type HeldItem } from "./holding";
```

with

```ts
import { uploadThroughIntake, uploadFailedLine, intakeLine, readHolding, dismissHold, resubmitFor, STAGE_WORDS, SOURCE_WORDS, CLEARED_BY_RECORDED, type Holding, type HeldItem,
  typeGapLine, typeGapClosedLine, dismissTypeGap, type TypeGap } from "./holding";
```

In `WebApp/src/setups/files-panel.ts`, replace

```ts
  let holding: Holding = { items: [], cleared_recent: [] };
  let holdError: string | null = null;
  let showHeld = false;
  let dismissing: number | null = null;
```

with

```ts
  let holding: Holding = { items: [], cleared_recent: [], type_gaps: null };
  let holdError: string | null = null;
  let showHeld = false;
  let dismissing: number | null = null;
  // MA-2c: Promote's type gaps, read with the holds (holding.type_gaps); `gapDismissing` = the group whose reason input is open.
  let showGaps = false;
  let gapDismissing: string | null = null;
```

In `WebApp/src/setups/files-panel.ts`, replace

```ts
      dismissing = null;
      try { const h = await readHolding(base, key); if (mine !== seq) return; holding = h; holdError = null; }
      catch (e) { if (mine !== seq) return; holding = { items: [], cleared_recent: [] }; holdError = (e as Error).message; }
```

with

```ts
      dismissing = null; gapDismissing = null;
      try { const h = await readHolding(base, key); if (mine !== seq) return; holding = h; holdError = null; }
      catch (e) { if (mine !== seq) return; holding = { items: [], cleared_recent: [], type_gaps: null }; holdError = (e as Error).message; }
```

In `WebApp/src/setups/files-panel.ts`, replace

```ts
    html += heldSection() + deletedSection();
```

with

```ts
    html += heldSection() + gapSection() + deletedSection();
```

In `WebApp/src/setups/files-panel.ts`, replace

```ts
    root.querySelectorAll<HTMLElement>("[data-hdismissok]").forEach((n) =>
      n.addEventListener("click", () => void dismissHeld(Number(n.dataset.hdismissok))));
```

with

```ts
    root.querySelectorAll<HTMLElement>("[data-hdismissok]").forEach((n) =>
      n.addEventListener("click", () => void dismissHeld(Number(n.dataset.hdismissok))));
    root.querySelector("#fv-gaps-toggle")?.addEventListener("click", () => { showGaps = !showGaps; render(); });
    root.querySelectorAll<HTMLElement>("[data-gdismiss]").forEach((n) =>
      n.addEventListener("click", () => { gapDismissing = n.dataset.gdismiss!; render(); (root.querySelector("#fv-gap-input") as HTMLInputElement | null)?.focus(); }));
    root.querySelectorAll<HTMLElement>("[data-gcancel]").forEach((n) =>
      n.addEventListener("click", () => { gapDismissing = null; render(); }));
    root.querySelectorAll<HTMLElement>("[data-gdismissok]").forEach((n) =>
      n.addEventListener("click", () => void dismissGap(n.dataset.gdismissok!)));
```

In `WebApp/src/setups/files-panel.ts`, replace

```ts
  // "Deleted items (n)" — built like "On hold (n)": every member sees what is there, who deleted it and when; Restore is
```

with

```ts
  // MA-2c "Type gaps (n)" (design §6.4) — built like "On hold (n)": the groups of elements Promote held because the office has no
  // type for them, each with what is missing, how many, its facts and the nearest types; a lead dismisses one with a reason; one the
  // catalogue in force now holds is listed closed. A bridge before MA-2c lists none, and the section says so.
  function gapSection(): string {
    if (holdError) return "";
    const g = holding.type_gaps;
    if (!g) return '<div style="color:#71717a;font-size:11px;padding:.4rem .2rem">Type gaps: not listed — this bridge is older than MA-2c</div>';
    if (!g.open.length && !g.closed.length) return "";
    const toggle = `<button id="fv-gaps-toggle" style="border:none;background:transparent;color:#f59e0b;font:11px system-ui;cursor:pointer;padding:.4rem .2rem">${showGaps ? "▾" : "▸"} Type gaps (${g.open.length})</button>`;
    if (!showGaps) return toggle;
    const act = "border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.15rem .45rem;font:600 11px system-ui;cursor:pointer";
    const card = (x: TypeGap) => {
      const dismiss = !canGovernRole(role) ? ""
        : gapDismissing === x.id
          ? `<input id="fv-gap-input" maxlength="500" placeholder="Why dismiss it? The ledger records the reason." style="flex:1;min-width:10rem;background:#111;color:#eee;border:1px solid #f59e0b;border-radius:.25rem;padding:.2rem .4rem;font:12px system-ui"/>` +
            `<button data-gdismissok="${esc(x.id)}" style="${act};color:#fbbf24">Dismiss with this reason</button><button data-gcancel="${esc(x.id)}" style="${act}">Cancel</button>`
          : `<button data-gdismiss="${esc(x.id)}" style="${act}">Dismiss…</button>`;
      return `<div style="margin-bottom:.45rem;padding:.45rem .55rem;background:#1b1b21;border:1px solid #4a3a12;border-radius:.4rem;font-size:12px">` +
        `<div style="font-weight:600">${esc(typeGapLine(x))}</div>` +
        `<div style="color:#9ca3af;font-size:11px">${esc(x.labels.slice(0, 5).join(", "))}${x.elements > 5 ? ` … (${x.elements})` : ""} · Promote · ${esc(x.actor || "—")} · ${esc(when(x.at))}${x.runs > 1 ? ` · reported by ${x.runs} runs` : ""}</div>` +
        `<div style="color:#71717a;font-size:10.5px;font-family:ui-monospace,Consolas,monospace">${ledgerLine(x.ledger)}</div>` +
        `<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-top:.3rem"><span style="color:#9ca3af">Install a catalogue with the type, or dismiss it with a reason.</span><span style="flex:1"></span>${dismiss}</div></div>`;
    };
    return toggle + g.open.map(card).join("") +
      g.closed.map((x) => `<div style="color:#71717a;font-size:11px;padding:.15rem .2rem">✓ ${esc(typeGapLine(x))} — ${esc(typeGapClosedLine(x))}</div>`).join("") +
      `<div style="color:#71717a;font-size:10.5px;padding:.15rem .2rem">Close rule: ${esc(g.catalog ?? "no catalogue read")}</div>`;
  }

  async function dismissGap(id: string) {
    const x = holding.type_gaps?.open.find((g) => g.id === id);
    if (!x) return;
    const reason = (root.querySelector("#fv-gap-input") as HTMLInputElement | null)?.value ?? "";
    try {
      const row = await dismissTypeGap(base, pid(), id, reason);
      await load();
      status(`✓ Dismissed the type gap ${typeGapLine(x)} · ${ledgerLine(row)}`);
    } catch (e) { status(`Not dismissed — ${(e as Error).message}`); }
  }

  // "Deleted items (n)" — built like "On hold (n)": every member sees what is there, who deleted it and when; Restore is
```

In `WebApp/src/setups/files-panel.ts`, replace

```ts
    if (loadScope(pid()) === loadedScope && (dismissing != null || renaming || armed)) return;
```

with

```ts
    if (loadScope(pid()) === loadedScope && (dismissing != null || gapDismissing != null || renaming || armed)) return;
```

- [ ] **Step 4: Run it, and see it pass.** `Test Files  1 passed (1)`, `Tests  20 passed (20)`; `npx tsc --noEmit -p .` `18` errors, 0 in the touched files (master's count)

- [ ] **Step 5: Commit.**

```bash
git add WebApp/src/setups/holding.ts WebApp/src/setups/holding.test.ts WebApp/src/setups/files-panel.ts
git commit -F - <<'EOF'
feat(web): the Holding Area's Type gaps section - each group in the add-in's words, a lead's Dismiss with a reason, the closed ones and the catalogue the close rule read (MA-2c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 7 — Words: the design doc; the final checks

**Files:**
- Modify `docs/strategy/2026-09-30-model-automation-design.md`

- [ ] **Step 1: The design doc says what landed.**

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| 4 | Required properties through `set_parameter`. The value comes from the catalogue type, a cited spec clause or a person, never a guess. On the pilot data most DD properties have no source yet, so they go to a person | Existing Fix in Revit path (`FixInPlaceService`, BUILT live 42/42) | [BP] P2-7 | MA-2 |
```

with

```markdown
| 4 | Required properties through `set_parameter`. The value comes from the catalogue type, a cited spec clause or a person, never a guess. On the pilot data most DD properties have no source yet, so they go to a person. BUILT (MA-2c): a DD type the plan lands elements on whose matrix property is empty on the TYPE gets one `set_parameter` type edit when the catalogue row of exactly that type (`params`, by display name) or a whole-class clause of the installed `ids@n` (one exact value) gives it — the bridge checks the source and writes its own record; never pre-ticked (a type edit reaches every element on the type, and the row says how many). Otherwise the property goes to a person — no source, sources that disagree, no parameter Sentinel can write — and Promote counts it. A person types their own value in Revit; the web grid that files one is [BP] P2-7 | `FixInPlaceService.OnType` / `WriteOnType` (the same PsetMap table as Fix in Revit; stale guard, read-back) | [BP] P2-7 | MA-2 |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| `hold:type_gap` | One row per **gap group** per run | Category, measured size band, key params, element count, nearest catalogue types, evidence ids | TARGET (see below) |
```

with

```markdown
| `hold:type_gap` | One row per **gap group** per run | Category, measured size band, key params, element count, nearest catalogue types, evidence ids | BUILT (MA-2c) as one row per Promote **run** holding all its groups: entity_type `type_gap`, action `type_gap:run · N group(s), M element(s)` (`hold:` actions are Sentinel's own rows and never come through the Revit report route), claimed; each group {category, the type wanted or the size, key params, count, labels, nearest} named by the bridge; a lead's dismissal is `hold:type_gap_dismissed <group>`. No size band (the snap is 0, D16); no evidence ids yet (MA-4) |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
- Gaps are grouped per run by category, measured size band and key parameters (for example "Walls, external, 212–215 mm, 38 elements").
- A group closes when a newly installed `type_catalog@n` has a match, or when a lead dismisses it with a reason.
```

with

```markdown
- Gaps are grouped per run by category, measured size band and key parameters (for example "Walls, external, 212–215 mm, 38 elements"). BUILT (MA-2c): grouped by category and the type the DD rule wants (else, with no rule to name one, the size no catalogue type is named at) — the snap is 0, so the size is exact and the type name carries it ("Walls: "BDS_EXT_ARC_CMU_125 mm" is not in the catalogue — 2 element(s) (Function Exterior)").
- A group closes when a newly installed `type_catalog@n` has a match, or when a lead dismisses it with a reason. BUILT (MA-2c): the type catalogue in force (project → office) holding the wanted type by name in the category, or a type of the category named at the size; a run that no longer reports a group does not close it, and one that reports it after a dismissal opens it again.
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
- `POST /cde/:key/holding/type-gaps/:group/dismiss` `{reason}` (lead only).
```

with

```markdown
- `POST /cde/:key/holding/type-gaps/:group/dismiss` `{reason}` (lead only). BUILT (MA-2c; the machine credential passes, as on the existing dismissal).
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
- `GET /cde/:key/holding` returns the type-gap groups next to the container holds.
```

with

```markdown
- `GET /cde/:key/holding` returns the type-gap groups next to the container holds. BUILT (MA-2c): `type_gaps {open, closed, catalog}`.
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - A Promote plan with `retype`, `attach` and `set_parameter`.
  - Type-gap groups in the Holding Area, with their close rule (size M).
```

with

```markdown
  - A Promote plan with `retype`, `attach` and `set_parameter`. LANDED in MA-2c (2026-10-03, plan `docs/superpowers/plans/2026-10-03-ma2c-set-parameter-gaps-undo-plans.md`): `PropertyPlanner` files a `set_parameter` type edit for an empty DD property when the catalogue row of exactly that type or a whole-class `ids@n` clause gives one value (the bridge checks the source: `changesets-typing.makeCiter`), else sends it to a person with the count; the executor writes it after the retypes (stale guard, read-back); each value written rides on the `changeset_applied` row. Never pre-ticked.
  - Type-gap groups in the Holding Area, with their close rule (size M). LANDED in MA-2c: one `type_gap` row per Promote run, the Holding Area's "Type gaps (n)" section, closed by a lead's dismissal or a catalogue holding the type.
```

- [ ] **Step 2: The final checks** (from the repo root, the vitest ones from `WebApp`):
  - every tracked check project: `for p in $(git ls-files 'tools/*-check/*.csproj' | xargs -n1 dirname | sort -u); do dotnet run --project "$p"; done` — all 25 pass (`annotate-check ALL PASS`, `fixplace-check 55/55 checks pass`, `ghost-standards-check 177/177 checks pass`, `promote-check 636/636 checks pass`, `session-check 47/47 checks pass`, the rest as on master);
  - `npx vitest run` (every file) — `Test Files  141 passed (141)`, `Tests  2260 passed | 1 skipped (2261)`; the bridge suite `npx vitest run bridge` — `Test Files  89 passed (89)`, `Tests  1801 passed | 1 skipped (1802)`;
  - `npx tsc --noEmit -p .` — `18` errors, 0 in the touched files;
  - the builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` — `0 Error(s)`, `5 Warning(s)`; `-p:RevitVersion=2026` — `0 Error(s)`, `3 Warning(s)` (master's counts; 2022 and 2027 are not required builds and were checked in the dry run: `0 Error(s)`, `3 Warning(s)`, `0 Error(s)`, `5 Warning(s)`).

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -F - <<'EOF'
docs(design): MA-2c landed - set_parameter from a cited source, type-gap groups in the Holding Area (the row, the close rule, the dismissal)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Live drill MA2c (Revit 2024, scratch copies only — on the branch, before the merge)

**Who does what.** The drill runner drives Revit by mouse. Two steps are the founder's, because they need a password: signing in (set-up) and signing out (closing list). If the founder is away, the drill runs in whichever state the PC is in, and the other state is recorded as **owed** — never as passed. The sign-in state found before the drill is recorded, and the closing list returns the PC to it. Signed in, the account is first made a **lead** of the scratch projects (a changeset write needs contributor; the web dismissal of W-1 needs lead) — the set-up gives the commands. Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window (MA2b: three stray Revit instances blocked the redeploy).

**The Revit MCP in this drill:** only its read-only calls — `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`, `get_available_family_types` — and never while a Revit command, a TaskDialog or a Sentinel window is open (the review window is modeless: close it first). Type properties are read by mouse (Type Properties ▸ Identity Data, then **Cancel**), not by the MCP.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Signed in or signed out**: whichever this session does not run is owed (the actor on the changeset rows, on `changeset_applied.values` and on the `type_gap` row).
- **One Undo per storey, DAT-3/ANV-1/ANV-2, the full drill MA2 and gate G2**: MA-2d (Next). A second account approving a batch (MA2's row 7) needs the founder's password: owed to MA2.
- **A window U-value**: no BDS window type is a DD type on the seed (L-1 of MA2b: Windows 0 at DD), and "Heat Transfer Coefficient (U)" is a unit-bearing number (S7): the "no writer" branch is pinned offline only (UNSURE 2).
- **One row on Revit 2026 and one on Revit 2027**: the builds compile; the type write inside the open group is proven on 2024 only.
- **Carried from MA2b**: I-1's DD IDS dialog with F-MA2b-2's fix (every failing element named) — run again here in A-1 and recorded; W-1 of MA2b (the Next strip in the browser) stays owed unless W-1 below runs; a real office matrix (LM-1).

**Set-up (once):**
- **Build.** Close Revit. Record which add-in is deployed now: the sha256 of the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`, lower case). Run `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build into Revit 2024; the closing list puts master's back). Record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The add-in's bridge settings.** Copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma2cbak` beside it. The file holds the file token: never print it, never open it in a viewer.
- **The test bridge on 127.0.0.1:4101**, on the branch's code. From `WebApp`:
  - Probe which settings `config/.env` holds (names only, never a value):

    ```bash
    node -e 'import("./bridge/load-env.mjs").then(m => { const e = m.loadEnv(); for (const k of ["BCF_PORT", "BCF_EVENT_POLL_MS", "BCF_BASE"]) console.log(k, k in e ? "is set in config/.env — the shell cannot override it" : "is not in config/.env — the shell value is used") })'
    ```

  - If `BCF_PORT` is set in `config/.env`: stop, and ask the founder — the drill does not edit `config/.env`.
  - Start it in the background, event poll off: `BCF_PORT=4101 BCF_EVENT_POLL_MS=0 node bridge/bcf-service.mjs`. Its banner names port 4101, and `curl -s http://127.0.0.1:4101/health` answers. The founder's 4100 bridge is not touched, and no write route of it is called.
  - **Every bridge call of this drill names `http://127.0.0.1:4101` itself.** Define this helper once in the drill's shell (it reads the token through `load-env.mjs` and prints the status and the reply; a path is given without its leading slash; a body starting with `@` is a file):

    ```bash
    b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
    ```

  - Point the add-in at the test bridge with a script that prints nothing of the file: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The drill's standards**, written to `Documents\Sentinel drills\ma2c\` (never committed). From `WebApp`, after `D="$(cygpath -m "$HOME/Documents/Sentinel drills/ma2c")"; mkdir -p "$D"` (a Windows-form path, which node reads; a body file is passed as `"@$D/…"`, quoted for the space):
  - the office's catalogue edited first (F10): the BDS catalogue with a Fire Rating on the outline wall type — `node -e 'const fs = require("fs"), c = JSON.parse(fs.readFileSync("../demo/bds-pilot/bds-type-catalog.json", "utf8")); const r = c.types.filter(t => t.category === "Walls" && t.type === "BDS_EXT_ARC_CMU_200 mm"); if (r.length !== 1) throw new Error("rows: " + r.length); r[0].params = { ...r[0].params, "Fire Rating": "60 min" }; fs.writeFileSync(process.argv[1] + "/catalog-fr.json", JSON.stringify(c)); console.log("catalog-fr.json", c.types.length)' "$D"`;
  - a clause, as an ids@n compiled from "All doors shall be FD30." would read — `node -e 'require("fs").writeFileSync(process.argv[1] + "/ids-fd30.json", JSON.stringify({ title: "MA2c drill clause", enforce: "warn", specifications: [{ name: "Doors carry FD30", applicability: { entity: "IFCDOOR" }, requirements: { attributes: [], properties: [{ pset: "Pset_DoorCommon", name: "FireRating", value: "FD30", cardinality: "required" }] }, source_sentence: "All doors shall be FD30." }] })); console.log("ids-fd30.json")' "$D"`.
- **The scratch web projects.** Nothing is installed on `demo`, `bds-office` or any real office.
  - `b4101 POST cde/projects '{"key":"ma2c-office","kind":"office"}'`; `b4101 POST cde/projects '{"key":"ma2c","office_key":"ma2c-office"}'`; `b4101 POST cde/projects '{"key":"ma2c-b","office_key":"ma2c-office"}'` (the stale row's).
  - On the OFFICE: `b4101 PUT "cde/ma2c-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma2c-office/artefacts/type_catalog?actor=drill" "@$D/catalog-fr.json"` (201, `type_catalog@1`), `b4101 PUT "cde/ma2c-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`, `b4101 PUT "cde/ma2c-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json`.
  - On each PROJECT (`ma2c`, `ma2c-b`): `b4101 PUT "cde/<key>/artefacts/ids?actor=drill" "@$D/ids-fd30.json"` (201, `ids@1 · project`). Installed on the project, the clause also judges every element proposed there (the retype rows' badges read "rejected" for a door with no FD30 — the referee's verdict, not a refusal: S3).
  - **If the session is, or will be, signed in**: `b4101 POST cde/<key>/members '{"email":"<the account e-mail>","role":"lead"}'` for `ma2c`, `ma2c-b` and `ma2c-office`; record each reply.
- **The scratch models.** Two copies of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` — the PRE-Promote B35 seed — in `Documents\Sentinel drills\ma2c\`: `ma2c-a.rvt` bound to `ma2c`, `ma2c-b.rvt` bound to `ma2c-b` (Sentinel ▸ Project Setup).

**Record before the first row**, on `ma2c-a.rvt`: by mouse, Type Properties ▸ Identity Data ▸ **Fire Rating** of `BDS_EXT_ARC_CMU_200 mm`, `BDS_INT_ARC_GYPS_100 mm`, `BDS_INT_1 PNL_WOOD_1000 x 2100 mm`, `BDS_INT_2 PNL_WOOD_2000 x 2100 mm` (MA2b: all empty), then **Cancel**; with the MCP, `get_available_family_types` for Walls and Doors (the type count before — "zero types created" is read against it).

**Expected from the seed** (MA2b's record, `SIMULATION_ROOM_RUN_2026-09-22.md` session MA2b): 86 counted, 7 at DD now (8 %); on the GR-FFL changeset 14 outline walls → `BDS_EXT_ARC_CMU_200 mm`, 10 partitions → `BDS_INT_ARC_GYPS_100 mm`, 2 door swaps onto the BDS PNL_WOOD types, 20 attaches; after MA2b's apply, 9 of 86 at DD, with 18 walls (8 outline walls retyped and attached, 10 partitions) and 4 doors (2 swapped, 2 DD now) below only for a missing Fire Rating. With this drill's sources: the outline wall type gets "60 min" from the catalogue, every DD door type "FD30" from the clause, and `BDS_INT_ARC_GYPS_100 mm` has no source. So the LOD state after the GR-FFL apply should read **about 21 of 86 (24 %)** = 9 + 8 outline walls + 4 doors; the partitions stay below with `missing Pset_WallCommon.FireRating`. A difference is recorded with its reason, not by itself a failure.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| R-1 | `b4101 POST changesets/ma2c '{"name":"t","source":"agent","elements":[{"op":"set_parameter","kind":"wall","target":{"unique_id":"00000000-0000-0000-0000-000000000000-00000001"},"place":{"TypeName":"BDS_EXT_ARC_CMU_200 mm"},"parameter":"Pset_WallCommon.FireRating","from":"","to":"120 min","value_source":{"kind":"catalogue"},"validate":{"identity":{"Class":"IfcWall"}}}]}'`; the same with `"to":"60 min","value_source":{"kind":"person"}`; `b4101 GET cde/ma2c/holding` | 400 `elements[0]: set_parameter's value_source: type_catalog@1 · office · <sha12>… gives BDS_EXT_ARC_CMU_200 mm Fire Rating "60 min", not "120 min" — a value is written only as its source holds it`; 400 `… set_parameter needs value_source {kind: catalogue \| clause} — a value is written from a cited source, never a guess; a person types their own in Revit`; nothing stored (`GET changesets/ma2c` `[]`); the holding reply has `type_gaps: {open: [], closed: [], catalog: "type_catalog@1 · office · …"}` | The three replies |
| P-1 | Open `ma2c-a.rvt`; Sentinel ▸ Promote (DD); read the dialog; expand it; press **No** (the read-only run). The pane's Doctor log | The dialog has `DD properties: <w> type edit(s) from a cited source (never pre-ticked) · 1 with no source — sent to a person (<n> element(s) on those types)` with `<w>` = 1 wall type + every DD door type (expected 2–3: the two swap targets and the DD-now doors' types), the line `— ids@1 · project · …`, then `✎ Walls · BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating → "60 min" (type_catalog@1 · office · … · BDS_EXT_ARC_CMU_200 mm · Fire Rating)`, a `✎ Doors · <family> : <type> · Pset_DoorCommon.FireRating → "FD30" (ids@1 · project · … · Doors carry FD30 · "All doors shall be FD30.")` line per DD door type, and `→ a person: no source for Pset_WallCommon.FireRating on BDS_INT_ARC_GYPS_100 mm — type_catalog@1 · office · … gives no Fire Rating for it, and no clause of ids@1 · project · … pins one; a person fills it in Revit (Type Properties) — <n> element(s) on it`; and `Type gaps (sent to the ledger — …): <g> group(s), <e> element(s)` with one line per group (expected about five: the two 125 mm gap walls, F02 at 250 mm, R02 at 225 mm, C03, D04 at 915 x 2134 mm). Doctor: `Type gaps — Recorded: ledger #<id>` | The DD properties lines and the no-source count `<n>` (drill MA2 asks it); the gap lines; `<n>` element(s) against `get_available_family_types`/the template's instances (UNSURE 6) |
| P-2 | `b4101 GET "cde/ma2c/audit?entity_type=type_gap&limit=1"`; `b4101 GET cde/ma2c/holding` | One row: action `type_gap:run · <g> group(s), <e> element(s)`, `new_value.claimed` true, every group with a 12-hex `id`, its category, `want` or `size`, `key`, `elements`, `labels`, `nearest`; actor the account (signed in) or the machine label. The holding reply's `type_gaps.open` lists the same groups (`runs: 1`), `catalog` `type_catalog@1 · office · …` | The row id; the group ids |
| A-1 | Promote (DD) → **Yes**; the review opens on `Promote (DD) · GR-FFL`. Read every row; tick every row; **Apply**; at the DD IDS dialog read the tally and See details; **Place anyway** | The set_parameter rows are **unticked** when the window opens (never pre-ticked) and read `type edit wall: BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating "" → "60 min" · from type_catalog@1 · office · … · Fire Rating` (and one `type edit door: …` per DD door type), their tooltip `… a type edit: every element on … reads it (<k> in the model now, <m> more that this changeset retypes onto it)`; "Sent to a person" lists `type BDS_INT_ARC_GYPS_100 mm · Pset_WallCommon.FireRating — no source …` beside the held elements. The DD IDS dialog says `This changeset leaves N element(s) failing …` with N = 10 partitions + the 2 attach-only gap walls = **12** (MA2b's 28 less the 14 outline walls and 2 doors the type edits now fill); its tally names `Walls · DD: missing Pset_WallCommon.FireRating — 12 element(s)`; See details names each (F-MA2b-2's fix, live). The result: `Applied <48 + w> element(s) …`, the IDS line `… placed anyway …`, `LOD state after (sent to the ledger — …): DD → design: <a> of 86 at DD (<s>%) …` with `<a>` about 21 (24 %) | The rows' words; N and the tally; the LOD after line against 21 |
| A-2 | Close the result dialog and the review window. `b4101 GET "cde/ma2c/audit?entity_type=changeset&limit=3"`; by mouse, Type Properties of `BDS_EXT_ARC_CMU_200 mm` and of the DD door types (then Cancel); MCP `get_available_family_types` for Walls and Doors | The `changeset_applied` row's `new_value.values` lists each written type: `{type: "BDS_EXT_ARC_CMU_200 mm", parameter: "Pset_WallCommon.FireRating", from: "", to: "60 min", value_source: {kind: "catalogue", ref: "type_catalog@1 · office · … · BDS_EXT_ARC_CMU_200 mm · Fire Rating", sha256}}` and the doors' `FD30` from the clause; the types read `60 min` / `FD30` in Revit; the type counts equal the record before the first row (**zero types created**) | The row id and its values; the counts |
| S-1 | The stale guard (S4), on `ma2c-b.rvt`: Promote (DD) → **Yes**; the review opens on its GR-FFL changeset. **Before Apply**, by mouse: Type Properties of `BDS_EXT_ARC_CMU_200 mm` ▸ Fire Rating `90 min` ▸ OK. Tick every row; **Apply** | `Transaction failed and was rolled back: stale: Pset_WallCommon.FireRating on type BDS_EXT_ARC_CMU_200 mm reads "90 min" now, the plan read "" — the model changed since the plan; re-run Promote` … `Reported as declined.`; nothing of the changeset is in the model (the outline walls still `Generic - 200mm`: MCP on the GR-FFL plan view, after closing the dialogs); `b4101 GET changesets/ma2c-b` shows it `declined`. Then Promote (DD) again → No: no `✎ … BDS_EXT_ARC_CMU_200 mm` line (a filled value is not overwritten) | The refusal's words; the status; the second header |
| G-1 | The gaps' close rules. Pick the Doors group (`no type named at 915 x 2134 mm`) and the Walls group from P-2. `b4101 POST cde/ma2c/holding/type-gaps/<doors id>/dismiss '{"reason":"D04 is a template sample; the office does not use 915 doors"}'`; then install a catalogue that holds the Walls group's wanted type: `node -e 'const fs = require("fs"), c = JSON.parse(fs.readFileSync(process.argv[1] + "/catalog-fr.json", "utf8")); c.types.push({ category: "Walls", family: "Basic Wall", type: process.argv[2], system: true, width_mm: 125, height_mm: null, params: {} }); fs.writeFileSync(process.argv[1] + "/catalog-fr-125.json", JSON.stringify(c)); console.log("catalog-fr-125.json")' "$D" "<the Walls group's want>"`; `b4101 PUT "cde/ma2c-office/artefacts/type_catalog?actor=drill" "@$D/catalog-fr-125.json"` (201, `type_catalog@2`); `b4101 GET cde/ma2c/holding` | The dismissal 201 `{id, hash}` (a `hold:type_gap_dismissed <id>` row); the holding reply's `type_gaps.closed` lists the Doors group `closed_by: "dismissed"` with the reason, and the Walls group `closed_by: "catalogue"`, `type` the wanted name, `catalog: "type_catalog@2 · office · …"`; `catalog` is `type_catalog@2 · …`; the other groups stay open. A second dismissal of the Doors group is 409 `type-gap group <id> is not open on ma2c` | The replies |
| W-1 | The web Holding Area. From `WebApp`, in the background: `VITE_SENTINEL_SERVICE=http://127.0.0.1:4101 npm run dev`; open the URL its banner prints in Chrome (the founder's local-app route, signed in to the platform), project `ma2c`, Files | "Type gaps (n)" lists each open group in `typeGapLine`'s words with Dismiss… (a lead), the closed ones with `dismissed — <reason>` / `closed — type_catalog@2 · office · … has <type>`, and `Close rule: type_catalog@2 · …`. If the local app cannot run against the test bridge, record G-1's reply and mark the row **owed** | A screenshot, or "owed" with the reason |

Request bodies and the drill's files are kept in `Documents\Sentinel drills\ma2c\`. The rows run in the order above: P-1 needs the standards; A-1 follows P-1; S-1 is on the second copy; G-1 needs P-2's ids.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as session MA2c, with gaps named F-MA2c-n, each fixed on the branch ("fix(drill MA2c): …" with its check), and the list of **owed** rows at its end.

**Closing list:**
- close Revit without saving the scratch copies;
- return the sign-in to the state found before the drill (the founder signs out if the PC was signed out before);
- stop the test bridge on 4101, and the web dev server if W-1 started one;
- restore the add-in's bridge settings: copy `bcf-config.json.ma2cbak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed: `git checkout master`, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys master's build), record the deployed DLL's sha256 (it should equal the one recorded before the set-up's build), then `git checkout feature/ma2c-set-parameter-gaps`. The founder's Revit runs master's add-in against the master bridge until the merge and its deployment — never the branch's add-in against a bridge that refuses set_parameter and `type_gap`;
- list what the drill left on the shared ledger — the scratch office `ma2c-office` (`guideline@1`, `type_catalog@1` and `@2`, `lod_matrix@1`, `ruleset@1`), the projects `ma2c` and `ma2c-b` (`ids@1` each), the memberships, the changesets, the `lod_state`, `type_gap` and dismissal rows — left in place on purpose (scratch keys), as the earlier drills' were;
- list what the drill left on this PC outside the repository: the `ma2c` and `ma2c-b` folders under `%AppData%\Sentinel\cache` (deleted: scratch keys only), the two scratch copies and the drill's files in `Documents\Sentinel drills\ma2c\` (they stay, named, as the drill's evidence; never committed).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record;
- each F-MA2c-n fix is committed on the branch with its check, and Task 7 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does was deployed and its row run again live before the merge; a row whose fix was not run again is recorded as **owed**, not as passed;
- UNSURE 1 and 3 held: A-1's outline walls did not fail the DD IDS, and A-2 read the values back in Revit. If the IDS check before commit failed the outline walls, the write did not land inside the group: nothing is merged.

```bash
git checkout master
git merge --no-ff feature/ma2c-set-parameter-gaps -F - <<'EOF'
Merge feature/ma2c-set-parameter-gaps: MA-2c - set_parameter, built once with [BP] P2-7: an empty DD property on a DD type the Promote plan lands elements on becomes one type edit when the catalogue row of exactly that type or a whole-class clause of the installed ids@n gives one value - the bridge checks the source against the installed artefact and writes its own record (changesets-typing makeCiter; value-sources.json holds the C# PropertyPlanner to the same table and clause reading), never pre-ticked (a type edit reaches every element on the type and says how many); otherwise the property goes to a person (no source, sources that disagree, no writer) and Promote counts it. The executor writes it after every retype in the changeset's transaction (stale guard, read-back on the type's own text parameter, FixInPlaceService.OnType/WriteOnType); the DD IDS before commit sees the value; each value written rides on the changeset_applied row. Type-gap groups: Promote's gap holds grouped by category and the type wanted (else the size), one type_gap row per run (claimed, each group named by the bridge, action type_gap:run - hold: actions are Sentinel's own); the Holding Area lists them (GET /cde/:key/holding type_gaps, the web's Type gaps section) until a lead dismisses one (POST /cde/:key/holding/type-gaps/:group/dismiss) or the catalogue in force holds the type. Drill MA2c: <the result and the owed rows>. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order:** (1) the bridge — the founder restarts the 4100 bridge on master (`tools/bridge-start.cmd` is the founder's step). It must know set_parameter and `type_gap` before an add-in posts one: an older bridge refuses a Promote body with a set_parameter (400 `op "set_parameter" is not supported`, so nothing of that storey is filed) and the `type_gap` report (400). (2) Then the add-in, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same with `-p:RevitVersion=<v>` for each other Revit version the founder uses. (3) The web app: the Holding Area's Type gaps section ships with the next That Open publish (the founder's step); until then the web says nothing of type gaps, and the bridge's reply carries them.

## UNSURE facts this drill settles

1. Whether `FIRE_RATING` on a BDS `WallType` and `DOOR_FIRE_RATING` on a BDS door `FamilySymbol` are real, writable, String parameters (`OnType`), and `GovernedElementExtractor.ReadEntry` on the type reads them back. Settled by P-1 (the rows are type edits, not "no writer") and A-2.
2. Whether a window type's "Heat Transfer Coefficient (U)" is held on the type as a read-only or unit-bearing Double ("no writer", S7). No BDS window type is DD on the seed: owed.
3. Whether a type parameter written inside the changeset's transaction, inside the open TransactionGroup, is what `ExtractByIds` reads for the retyped elements before the group is kept (MA2b's UNSURE 2 held for retypes; this is a parameter set). Settled by A-1: N is 12, not 26.
4. Whether `ProvenanceStamp.Write` (extensible storage) takes an `ElementType` (E6). Settled by A-1: the apply succeeds; else F-MA2c-n (the stamp then skips types).
5. Whether the review window's set_parameter label fits (it trims with an ellipsis; the tooltip holds the reason). A-1.
6. How many elements read a BDS type in the template (the type edit's reach: legend and sample instances). Recorded at P-1 and A-1.
7. Whether the `type_gap` row lands inside the 20-reports-a-minute budget with `lod_state` now and the receipt in a quick run. Settled by P-1's Doctor line.

## Risks (each a ceiling stated in words)

- **A type edit reaches elements outside the batch** — settled elements on other storeys, the template's legend and sample instances. It is never pre-ticked and its row counts them (F1); a person decides.
- **"No source" dominates on the pilot.** The BDS catalogue carries no Fire Rating for any type the DD rules produce (drill MA2b), and no thermal value at all: without an office catalogue edit or a clause, every DD property goes to a person. That is the honest reading (design §3.5).
- **The catalogue parameter map has two entries**, by English display name ("Fire Rating"). A catalogue harvested in another language, or a property the harvest does not read, has no catalogue source — a person fills it. Widening the harvest is BOS's (Next).
- **A whole-class clause is rare.** Fire ratings vary by wall type and compartment; a clause narrowed by type or predefinedType is not read as a source (F2). A per-type clause artefact is under Next.
- **A storey of more than 200 ghosts** is several changesets; a type's set_parameter rides in one of them, and the retypes onto that type in another fail the DD IDS before commit until that one is applied. MA-2d runs a storey's changesets together.
- **The stale guard fails the whole changeset at Apply** (S4) — it is reported declined, and Promote is run again; the review window does not mark a stale row beforehand.
- **A gap fixed by hand stays listed** until a lead dismisses it (F7); the machine credential can dismiss (F8), as for held files today.
- **The Holding Area reads the catalogue in force on every GET** (E8): one more read per refresh of the Files panel.
- **The review window's "Sent to a person (n element(s))" counts a DD property row as one** (its UniqueId is the type's): the row itself says "type … · Pset_…", so nothing is hidden, but the count is of rows. A words fix if the drill finds it misleading (F-MA2c-n).
- **Promote's existing network calls on the API thread** (`ChangesetClient.Propose`, `GovernedNotify.Report`'s queue, the review's `Report`) are unchanged; MA-2c adds none, and moving them off the thread is MA-2d's (its storey batch reports several changesets).

## Next (out of scope here)

- **MA-2d**: one Undo per storey — all changesets of a storey in one ExternalEvent inside `SentinelUndo.Run` (the Ghost multi-changeset group pattern, `GhostChangesetBuild.cs`), the review window per storey, `UndoWatcher` under the storey's name, the LOD state after once per storey; DAT-3, ANV-1, ANV-2 in their own batch (B31; split to MA-2e if it grows); the full drill MA2 (incl. a scratch model of more than 200 walls on one storey, a second account's approval, the aster-tower plan-only run) and gate G2 (edit cost on the MA-0 model and one more — the founder names it).
- **[BP] P2-7**: the web parameter grid on this op — a person's value (`value_source` person, signed in), instance targets, numbers with units, a governed list through Change Requests, the review window marking a stale row before Apply.
- A per-type clause→value artefact (F2 B); thermal values in the catalogue harvest (Build Office System); D13's "approve a new size" (F10 B); evidence ids on the gap rows (MA-4); the size band when the snap is turned on (D16).
- D19's pre-tick: a BLOCK-breaking ghost pre-ticked when its fixing set_parameter rows ride in the same batch — no BLOCK rule fires on the pilot; not built.
- The Revit pane listing the open type gaps.
