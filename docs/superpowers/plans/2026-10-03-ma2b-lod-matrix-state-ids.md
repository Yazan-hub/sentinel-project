# MA-2b — lod_matrix stage_map and type_snap_mm, the LOD state reader, matrixToIds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three things change, the second slice of MA-2:
- **The matrix gains its stage map and its snap.** `lod_matrix@n` may carry `stage_map` — the matrix's stages (concept, SD, DD, CD) mapped to Sentinel's project stages (tender, design, coord, constr, hand, oper); absent, or in part, it takes D18's default (concept, SD and DD → design; CD → coord), and a later stage never maps to an earlier project stage — and, on a row's DD, `type_snap_mm`: a whole number of millimetres from 0 to 50, default 0 = today's exact match (D16); a door or window never snaps. There is ONE reader in TS — `parseLodMatrix` in `WebApp/src/sentinel-core/lod-matrix.ts`, which the bridge's install check runs through the bundle — and its C# twin `LodMatrix.FromBody`. Both accept and refuse the same bodies in the same words, pinned by one shared fixture, `WebApp/bridge/fixtures/lod-matrix/cases.json` (24 cases), which vitest, the bundle test and `tools/promote-check` read. A v0 matrix (Promote v1's) reads exactly as before. With a limit above 0, Promote snaps a wall, floor, roof or ceiling whose size the catalogue lacks to the nearest catalogue size of its rule's pattern within the limit, and says so on the row ("snapped 12 mm (type_snap_mm 15, D16): each face moves up to 6 mm"). The bridge holds the snap to the project's matrix and never pre-ticks it; the executor lets the faces move by exactly the snap filed, and no more. The value is the founder's (D16): 0 is the default, and the drill uses 15 on a throwaway project only.
- **The LOD state reader.** An element's LOD state is the highest matrix stage whose rules it passes (design §3.2). Promote checks the DD stage only, so each element Promote counts is **at DD**, **below DD** (the rules it fails give the reasons), **blocked** (held for a reason Promote cannot act on: a group, a design option, structure, not a basic wall, not on a Building Story, not editable) or **not measured** (a rule whose fact Sentinel cannot read: a property with no Revit reader, the DD IDS not read, an element exported as another IFC class) — never guessed. It is read in Revit from the facts Promote already reads (its plan's per-element verdicts, `StoreyPlan.Lod`) and from the DD stage IDS judged on the elements the rules pass. It is counted per level and class ("Level 1 · Walls: 38 at DD, 212 below, 14 blocked, 0 not measured (…)"), shown in Promote's header ("LOD state now", step 2) and after a Promote changeset is applied ("LOD state after", step 10), and posted each time as ONE `lod_state` ledger row — the read-only run too. The Revit Live Coordination pane and the web Next strip print the newest row's line from the journey reply (the ledger is the source, design `:941`). The design → coord stage gate gains the row "LOD state: elements at the DD row ≥ 90%", which reads that row's share — "not measured" until a row exists (P1-10).
- **matrixToIds.** `ids-compile.mjs` gains `matrixToIds`: the matrix's DD properties become an IDS in compileIds' JSON shape — one specification per class, a bare property placed by `STANDARD_PSETS` (which gains IFCCOVERING for ceilings), what it cannot place returned in `unmatched`, never dropped. The bridge serves it derived, never installed as `ids@n`, at `GET /cde/:key/artefacts/lod_matrix/ids`. Revit checks a Promote changeset's applied elements against it before commit, inside the changeset's TransactionGroup where the BLOCK check runs. An element that fails is said in words with its rule ("W 312312 (Walls · DD): missing Pset_WallCommon.FireRating"), and the person goes back (nothing is placed; the changeset stays proposed) or places anyway (the result's note says so). A property Revit cannot read is "not checked", never passed.

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md` — MA-2 (`:1074-1099`: "What stays here: `stage_map`, `type_snap_mm`, `tools/lod-check`, … and the LOD state reader"; its Delivers lines `:1080`, `:1083` and `:1086`), §3.2 "LOD state for each element" (`:305-316`), §3.4 steps 2, 5 and 10 (`:332-346`), §6.5 "LOD matrix artefact" (`:780-815`), the artefact table (`:279`), the snap notes (`:287`, `:729`), the ledger rows (`:834`, `:941`), P1-10 (`:1259`), and decisions D16 (`:1336`) and D18 (`:1338`). Base: master `6cea6be`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Architecture:**

*One reader, one fixture.* `parseLodMatrix(body)` is pure TS and either returns `{standard_key, semver, draft, stage_map, rows: [{category, dd, properties, type_snap_mm}]}` or throws an `Error` whose message names the path ("rows[1].DD.type_snap_mm must be 0 for Doors — …"). The bridge's `validateArtefact("lod_matrix", …)` calls it from the bundle (`bridge/sentinel-core.mjs`) and prefixes `lod_matrix: `; its two old constants (`LOD_CATEGORIES`, `LOD_DD`) go. `LodMatrix.FromBody` is rewritten to the same order of checks and the same words, and gains `StageMap` (every matrix stage → its project stage) and `SnapMm` (category → limit). A row's snap is kept OUT of its `Dd` string, so `LodMatrix.Classes`' exact comparison with Promote v1's rules (`V1`, GN-4) is unchanged: a snapped Walls row still runs. The shared fixture is hand-written (each case a body and the error, or the stage map and snaps it reads to); `lod-matrix.test.ts` runs the TS source over it, `sentinel-core-bundle.test.mjs` holds the bundle to the source on it (a stale bundle fails), `artefact-store.test.mjs` runs the install check over it, and `promote-check`'s new section `LodMatrixParityChecks` runs the C# twin over it — this section is the design's "tools/lod-check" (F8). The stage lists are one list (D18): `STAGES` in sentinel-core, the gate's keys and `cde-store`'s `STAGES` are held equal by tests.

*The snap (D16).* `PromotePlanner.SnapTo(res, mm, limit)` acts only on a rule's answer the catalogue lacks (confidence 0, `Available` = the catalogue's sizes of that rule's pattern): it picks the size nearest the element's within the limit (a tie: the smaller), names that type at confidence 1, and returns the named size. The walls planner and the floor, roof and ceiling planner call it; with a limit the whole-millimetre hold is lifted (a snap absorbs it); a floor's build-up is checked against the size it snaps to. The ghost carries `SnapFromMm`/`SnapToMm`, the reason says how far, and the body posts `snap: {from_mm, to_mm}` (absent on every exact element, so `promote-body.json` and `promote-body-v1.json` are unchanged). The bridge reads the project's `lod_matrix@n` only when a post carries a snap (`snapLimitFor`, project → office, through the one parser), refuses a snap beyond the row's limit — or any snap with no matrix that allows one — in words, stores `snap: {from_mm, to_mm, by_mm, limit_mm, matrix}`, and never pre-ticks it. `ChangesetExecutor.Unsafe` and Promote's preflight take the snap: a face may move only when the element is still the thickness filed and the target is the size it snapped to, both within 0.5 mm. Ghost Builder and the bridge's typer stay exact: the matrix is Promote's.

*The LOD state.* Each storey plan records one `LodFact` per element it counts (`StoreyPlan.Lod` — the "DD now" denominator, element by element: walls at every whole-wall hold mark `Blocked`, the end of the wall's checks marks `RulesOk` = type and top are DD; the other classes mark the same from the counters "DD now" reads; an element on another office type is not a fact). `LodState.Read(plans, mx, ids, idsWhy, props, notRun)` is pure: a blocked fact is blocked (its first hold reason); a fact whose rules fail is below DD (its hold reasons, else what Promote proposes: a retype, an attach); a fact whose rules pass is at DD when its class asks no property, else judged by the DD IDS — missing → below ("missing Pset_WallCommon.FireRating"), not read → not measured ("no Revit reader for …"), placed by matrixToIds nowhere → not measured, IDS not read → not measured with why, exported as another IFC class → not measured. The report gives the per-level-and-class rows (with reasons and counts), the classes Promote did not run (named, never counted), the share at DD (whole percent, rounded down; null when nothing was counted) and one line, "DD → design: 38 of 264 at DD (14%) · 212 below · 14 blocked · 0 not measured". In Revit, `PromoteWallsCommand.LodStateOf` reads the properties of the elements whose rules pass through `GovernedElementExtractor.ExtractByIds` (as the IDS reads an element) and judges them with `StageIds.Judge`; `LodStateAfter` reads the facts again (`ReadFacts`, now shared by Promote) and plans again.

*The ledger row and its readers.* `CommandReports.LodState(report, changesets, actor)` is the row: `entity_type lod_state`, action `lod:state now · <line>` or `lod:state after · <line>`, the counts, the share, the project stage the matrix's `stage_map` ties DD to, the labels of the matrix, the IDS and the guideline, and the rows (at most 50, each with at most 10 reasons of at most 200 characters beside their true totals). The bridge adds `lod_state` to the Revit report types (a signed-in contributor writes it; the machine credential too) and marks it claimed for every caller (`lodStateRow`, the build:run rule). `GET /cde/:key/journey` gains `lod_state: {line, share, at, ledger}` from the newest row (`lodStateOf`: "LOD state: <line> — Revit's count (claimed), <actor>, <when> · ledger #<id>", or "LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)", or "LOD state: unavailable — <error>"; null for an office). The web Next strip prints it as a third line (`lodLine`), the Revit pane as a line under the next step (`JourneyInfo.LodLine`). The stage gate's `GATE_DEFS.design` gains `lodState ≥ 90`; `stage-gate.mjs readLodState` reads the newest row (not measured, in words, when there is none, when its matrix maps DD to another stage than design, or when it counted nothing).

*matrixToIds and the check before commit.* `matrixToIds(matrix)` turns each row's DD properties into one specification (`<Category> · DD`, its IFC entity from `CATEGORY_ENTITY` — Ceilings → IFCCOVERING — every property required; a qualified name as written, a bare one through `standardPset`, else `unmatched`). `lodMatrixIds(key)` serves it with the matrix's label (404 when none is installed; 409 when the installed one no longer parses). In Revit, `PromoteContext.Fetch(key)` reads the standards, the matrix and this IDS side by side, always inside `Task.Run`; Promote uses it for its header, and Review AI Proposals fetches it for a changeset whose source is `promote`. `ChangesetPlacementEvent` then runs that changeset inside its checked TransactionGroup even with no BLOCK rule: after the executor writes and before the BLOCK check, `PromoteContext.JudgeApplied` reads each applied element through the extractor and judges it; any failure asks "This changeset leaves N element(s) failing the DD IDS made from <matrix>" with Go back / Place anyway (the BLOCK check's pattern). The C# judge `StageIds` is held to sentinel-core's `validateElement` by `fixtures/lod-matrix/ids-cases.json`, which the vitest of `matrixToIds` writes.

**Tech stack:** the Revit add-in in C# (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8); the Node bridge (`WebApp/bridge/*.mjs`, vitest beside the code); `WebApp/bridge/sentinel-core.mjs`, a BUNDLE esbuild writes from `WebApp/src/sentinel-core/*.ts` (`npm run build:bridge-core`; the TS is the source, the bundle is committed too); the That Open web app's TS (`WebApp/src/setups/next-strip.ts`, `project-shell.ts`); offline C# console checks (`tools/*-check`, `SENTINEL_CHECK`); the Supabase ledger (no migration: `lod_state` is a row type, not a table).

**Global constraints:**
- Branch `feature/ma2b-lod-matrix-state` from master `6cea6be` (it holds this plan); merge `--no-ff` only after every task's checks pass **and the live drill MA2b is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - One TS reader and one C# twin, pinned by one shared fixture: `lod-matrix/cases.json` is read by vitest (source and bundle), by the install check and by `promote-check`; a new case lands on every side together (each pins the count, 24).
  - A v0 matrix keeps working: `bds-lod-matrix-dd.json` installs, parses to D18's stage map with every snap 0, and Promote runs the same classes with the same "DD now" as before.
  - Nothing is guessed: a stage is passed only when every one of its rules was read and met. A property Revit cannot read, an IDS that was not read, an element exported as another class are "not measured", named; a class Promote does not run is named, never counted.
  - The ledger is the source of the web line and the pane line: both print the newest `lod_state` row's line from the journey reply; neither counts anything itself.
  - The snap is the founder's (D16): 0 by default; a snap the project's matrix does not allow is refused by the bridge; a snapped element is never pre-ticked; the executor lets a face move by the filed snap only.
  - matrixToIds' IDS is derived, never installed as `ids@n`: the project's own IDS and its adjudication at propose time are untouched.
  - No network call on Revit's API thread: `PromoteContext.Fetch` (the matrix, the IDS, the standards) runs inside `Task.Run` in both commands; the judging on the API thread is read-only.
  - No new dependency, no migration, no new check project.
  - The bundle `WebApp/bridge/sentinel-core.mjs` is rebuilt by `npm run build:bridge-core` in the same commit as any TS change under `src/sentinel-core` (Tasks 1 and 6), and `bridge/sentinel-core-bundle.test.mjs` fails on a stale one.
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (`System`, `System.Collections.Generic` and `System.Linq` are global in the add-in's csproj for net48 too).
- No new check project: extend `tools/promote-check` (it compiles `LodMatrix` through `PromotePlanner.cs`, the planners, `CommandReports`, `ChangesetClient`; it gains `LodState.cs`, `GovElement.cs`, `PsetMap.cs`) and the vitest files. `artefact-cache-check` (compiles `GovernedQuery.cs`) and `session-check` (compiles `ChangesetClient.cs`) are run after the tasks that touch those files.
- Checks: `dotnet run --project tools/<name>` from the repo root; vitest from `WebApp` with `npx vitest run <files>`; the bundle with `npm run build:bridge-core` from `WebApp`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by a source scan and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session (the section after the tasks). Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100.
- The community Revit MCP never writes. Only in the drill, and only its read-only calls: `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens); never commit a `.rvt`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are master `6cea6be`'s and shift as tasks land: match the quoted text, not the number. The source files are CRLF on disk, the docs hold a few odd bytes: use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs.

**Dry run (planner, 2026-10-03):** every code step below was applied in order, task by task, to a fresh `git archive` export of master `6cea6be` in a scratch folder under the session's scratchpad — never in the repository — by a script that reads this document's `Create` and replace blocks as an implementer reads them (each replace matched its text exactly once; each file kept its line endings; a new file is CRLF, a fixture LF). Before each task's code its Step 1 was applied and its "see it fail" run made; after the code, its "see it pass" run. The tree that came out was compared with the tree the code was written in (line endings aside): identical. The totals in the steps are that run's, and the plan's code blocks are the exact text that was applied.
- Master's own totals, measured first: `promote-check` `569/569`; the bridge suite `Test Files  85 passed (85)`, `Tests  1716 passed | 1 skipped (1717)`; `npm test` (`vitest run`, every file) `139 passed`, `2159 passed | 1 skipped (2160)`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`; Revit 2026 `0 Error(s)`, `3 Warning(s)`.
- Task 1: `3 failed (3)`, `19 failed | 193 passed (212)`; the bundle rebuilt at `69.3kb`; then `3 passed (3)`, `243 passed (243)`; `promote-check` still `569/569`.
- Task 2: `promote-check` fails to compile (`StageMap`, `SnapMm`, `Stages`, `MatrixStages` missing: `10 Error(s)`), then `573/573`; both builds as on master.
- Task 3: `promote-check` fails to compile (`SnapToMm`, `SnapFromMm`, `Snap`, the two `Plan` overloads: `12 Error(s)`); the two changeset files `2 failed (2)`, `5 failed | 122 passed (127)`; then `582/582` and `127 passed (127)`; `session-check` `47/47`; both builds as on master.
- Task 4: `lod-ids.test.mjs` cannot load (`1 failed | 1 passed (2)`, `18 passed (18)`); then `3 passed (3)`, `234 passed (234)`; the run writes `ids-cases.json` (8 elements), the same bytes on every run.
- Task 5: `promote-check` fails to compile (`LodState.cs` could not be found: `1 Error(s)`), then `596/596`; both builds as on master.
- Task 6: the eight files `7 failed | 1 passed (8)`, `14 failed | 195 passed (209)`; the bundle rebuilt at `69.6kb`; then `8 passed (8)`, `209 passed (209)`; the bridge suite `Test Files  86 passed (86)`, `Tests  1748 passed | 1 skipped (1749)`.
- Task 7: `promote-check` fails to compile (`StageIds` has no `Line`, `NotChecked`, `WentBack`, `PlacedAnyway`: `6 Error(s)`), then `605/605`; `artefact-cache-check` `55/55`; `session-check` `47/47`; both builds as on master.
- Task 8: `artefact-store.test.mjs` `1 failed | 211 passed (212)` (the drill's matrix does not exist yet), then `212 passed (212)`.
- Final tree: all 25 tracked check projects pass (`promote-check` `605/605`, `artefact-cache-check` `55/55`, `session-check` `47/47`, `fixplace-check` `55/55`, `publish-check` `124/124`, `ghost-standards-check` `177/177`, `gate-check` `219/219`, `ghost-p2-check` `107/107`, the rest as on master); `npm test` `141 passed`, `2221 passed | 1 skipped (2222)`; the bridge suite `86 passed`, `1748 passed | 1 skipped (1749)`; `npm run build:bridge-core` leaves the bundle unchanged (`69.6kb`); builds Revit 2024 `0 Error(s)`, `5 Warning(s)`; 2026 `0`, `3`; 2022 `0`, `3`; 2027 `0`, `5` — master's counts (2022 and 2027 are not required builds).

Writing the code found four things the tasks now carry: two existing bridge tests pin the design gate's three checks (`cde-store-gate.test.mjs`, `check-registry.test.mjs`) and take the fourth in Task 6; MA-2a's executor scan (`Ma2aWiring.cs`) pins the sentence a filed snap now extends (Task 3) and MA-1a's placement scan (`PlacementBlock.cs`) the `SetRequest` call the Promote context now extends (Task 7); and `PromoteContext` must be public — it is a parameter of the placement event's public `SetRequest` (`CS0051` when internal). Not run: every line of the drill section, which only Revit can run; the commit commands. Nothing in the repository was changed by the dry run.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds option **A** of each. None needs an answer before the work starts. **F1 is the one to read first**: it is D16, the snap.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | Snapping a size the catalogue lacks to its nearest size (D16) — "a 212 mm wall is a 200 mm wall" | **A:** the matrix says it per class (`type_snap_mm` on a row's DD), **0 by default — the exact match, as today**. Above 0, Promote picks the catalogue's nearest size of the same rule within that many millimetres, says on the row how far ("snapped 12 mm … each face moves up to 6 mm"), and the row is never pre-ticked; the bridge refuses a snap the project's matrix does not allow; Revit moves the faces by exactly that snap at Apply, and refuses anything else. **B:** read the field but never snap until you decide | **A, with 0.** The mechanism is ready and does nothing until you set a number on a real office; the drill uses 15 on a throwaway project only. Ceiling: a door or window never snaps (they are matched by the W x H in their type name); a snap moves the wall's faces, so a hosted door's or a room's edge moves with them — that is why it is never pre-ticked |
| F2 | Do the matrix's DD properties count in the LOD state? | **A:** yes, strictly — an element is at DD only when its DD rules pass AND each DD property is filled; a property Revit cannot read today makes it "not measured", named, never "at DD". **B:** rules only; properties reported beside | **A.** It is the honesty rule: the state never reads higher than what was checked. Ceiling: today's draft `bds-lod-matrix-dd.json` asks for properties Revit cannot read (wall LoadBearing and ThermalTransmittance, every slab, roof and covering property, door and window IsExternal) — with it, those classes read "not measured" until LM-1 trims them or a reader is added. The drill's `bds-lod-matrix-dd-ma2b.json` asks only for what Revit reads |
| F3 | Which matrix stages are checked | **A:** DD only. Rows stay `{category, DD}`; a concept, SD or CD block on a row is refused until there is a check for it, and the LOD state reads "at DD", "below DD", "blocked" or "not measured". `stage_map` ties DD to its project stage. **B:** accept the other stages unchecked | **A.** "A key Promote does not read is refused" stays true; an unchecked stage would read as met. Ceiling: no element reads "at CD" until MA-2's later slices check CD |
| F4 | When a `lod_state` row is written | **A:** on every Promote run with a matrix — the read-only "No" run too (nothing in the model changes; the ledger records the count) — and after every applied Promote changeset. **B:** only when changesets are filed, and after Apply | **A.** The gate and the strips need a measurement even when nothing is filed. Ceiling: each Promote run adds one row (and Apply one more), inside the existing budget of 20 Revit reports a minute per person |
| F5 | The design → coord gate's bar for the LOD state | **A:** 90 % of the counted elements at DD. **B:** 100 % | **A.** The count keeps blocked elements (groups, structure) and not-measured ones as "not at DD", so 100 % is unreachable while any is held. The design gate cannot pass on the bridge today anyway: model health, compliance and BLOCK violations have no server source. Ceiling: the newest row from any model bound to the project wins (one model per project is assumed) |
| F6 | An element that fails the DD IDS before commit | **A:** said with its rule; the person chooses Go back (nothing placed, the changeset stays proposed) or Place anyway (the note on the ledger says so) — the BLOCK check's pattern. **B:** always block. **C:** report only, never ask | **A.** A missing fire rating at DD is a gap to fill, not always a reason to stop the retype; the person decides with the rule in front of them. Ceiling: the elements placed anyway stay "below DD" in the LOD state until their values are filled |
| F7 | "LOD 200 / 300" numbers in the line (design §3.2's example) | **A:** not added — the line names the stage ("38 at DD"). **B:** add a display-only `lod` number per stage | **A.** The matrix carries no LOD numbers today, and v0's validator refused them; a number nobody wrote would be decoration. Add it when a second stage is checked |
| F8 | Where the design's "tools/lod-check" lives | **A:** a section of `tools/promote-check`, which already compiles `LodMatrix` and reads the other shared fixtures. **B:** a new `tools/lod-check` project | **A.** No new project for one section; the merge message and the design say where it is |

## Amendments to the spec's words (BINDING — they override any task text they contradict)

- **S1 (rows by Revit category, design §6.5).** The design's example keys a row by IFC class with a `function`; v0 keyed rows by Revit category on purpose (the Promote v1 plan's E4: Promote and `guideline@n` are keyed by category), and MA-2b extends that shape. `matrixToIds` maps each category to its IFC class (`CATEGORY_ENTITY`). Task 8 says so in the artefact table.
- **S2 (the line names the stage, not an LOD number).** §3.2's example ("212 walls at LOD 200, 38 at 300, 14 blocked") reads here "… at DD, … below, … blocked, … not measured": the matrix carries no LOD numbers (F7).
- **S3 (`tools/lod-check` is a section of `promote-check`).** The design names a new check project; the parity check is `LodMatrixParityChecks` in the project that already compiles `LodMatrix` (F8).
- **S4 (no LOD state on sync).** The design's ledger table (`:834`) says "after Promote and on sync"; this plan records it after every Promote run and every applied Promote changeset. A count on every sync would read every class's facts and properties on every sync; it is under Next.
- **S5 (P1-10's gate input lands early).** The design leaves it to P1-10 and the founder; the plan adds the check now, reading "not measured" until a row exists, with the bar the founder's (F5). The design gate cannot pass on the bridge today anyway (health, compliance and BLOCK violations have no server source), so nothing that passes now starts failing.
- **S6 (a snapped type is never pre-ticked).** The design (`:287`) allows a pre-tick when the snap is within the measurement noise; no measurement noise is measured yet (survey jobs are MA-4), so a snapped element is never pre-ticked.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | `parseLodMatrix` lives in `src/sentinel-core/lod-matrix.ts`, exported through `bridge-entry.ts`; `artefact-store.mjs` imports it statically from the bundle | One reader, which the bridge already ships; `stage-gate.mjs` imports the bundle the same way |
| E2 | `LodMatrix.FromBody` is as strict as the bridge: it now requires `standard_key` and `semver` and refuses unknown keys, in the TS words | Every installed matrix already passed the bridge's stricter check, so no installed body reads differently; a body that would install and then not parse in Revit is the failure this removes |
| E3 | A row's `type_snap_mm` is kept out of `LodMatrix.Dd` | `LodMatrix.Classes` compares `Dd` with `V1` exactly (GN-4); a snap is not a rule Promote checks, so a snapped Walls row must still run |
| E4 | `type_snap_mm` is 0 to 50 mm, whole; above 0 is refused on Doors and Windows | A snap is measurement noise or a near size, never another type (50 mm is a quarter of the thinnest BDS CMU); a door is matched by its name's W x H, which has no thickness to snap |
| E5 | `SnapTo` picks only from the rule's own `Available` (the catalogue's sizes of that pattern), nearest first, the smaller on a tie | Never across patterns: a snap never turns a CMU wall into a gypsum one; the tie rule is deterministic and pinned |
| E6 | Snapping is Promote's alone | The matrix is Promote's artefact; Ghost Builder and the bridge's typer stay exact, as MA-2a left them |
| E7 | The bridge reads `lod_matrix@n` only when a post carries `snap` (`snapLimitFor`, through the one parser) and stores `{from_mm, to_mm, by_mm, limit_mm, matrix}`; a snapped element's `pretick` is false | The snap widens the executor's face guard, so the bridge — not the poster — decides whether the project's matrix allows it; the stored matrix label says which one did |
| E8 | `ChangesetExecutor.Unsafe(…, snapFromMm, snapToMm)`: a face may move only when the element's current width is `from_mm` and the target's is `to_mm`, both within 0.5 mm | The MA-2a guard (review C3) stays for every exact retype and for every claim that does not match the model |
| E9 | `StoreyPlan.Lod` records one `LodFact` per counted element, set where "DD now" is counted | The LOD state and "DD now" read the same verdicts and cannot drift; the check pins `Lod.Count == Walls` and the rules-only count `== DdNow` |
| E10 | Reasons are grouped by their exact text; a hold's reason as Promote wrote it, a proposal's as "not on a DD type — Promote proposes a retype" / "top not at the next story — Promote proposes an attach", a property's as "missing X" / "no Revit reader for X"; the row keeps at most 10 per class and level, 200 characters each, beside the true total | Promote's own words, so a person can find the element in the dialog; the cap keeps a 264-wall storey's row far under the route's 256 KB |
| E11 | `matrixToIds` lives in `ids-compile.mjs` beside `STANDARD_PSETS` (design §3.4 step 5), with `CATEGORY_ENTITY` (Ceilings → IFCCOVERING) and `IFCCOVERING` added to `STANDARD_PSETS` | `compileIds` reads prose and is not reused; the IDS shape is compileIds' JSON (no `confidence`, no `source_sentence`: nothing was compiled from prose) |
| E12 | `GET /cde/:key/artefacts/lod_matrix/ids` is derived on every read and never installed as `ids@n`; before the version route, so "ids" is never read as a version | The project's own IDS keeps judging proposals; a derived IDS cannot outrank or clash with it |
| E13 | `StageIds.Judge` reads "not read" from `PsetMap` (the entry for that key and IFC class), "missing" from the extracted values; `ids-cases.json` is written by vitest from `validateElement` through the bundle, and the C# failures (missing and not read, in order) must equal TS's | One judge's verdict, two places; "not read" is the C#-only split TS cannot see (TS calls both "missing") |
| E14 | `lod_state` joins `REVIT_REPORT_TYPES`; `lodStateRow` marks it `claimed: true` for every caller and refuses a count that is not an object | Revit counted it, the bridge did not — the build:run rule (MA-1a item 8) |
| E15 | The journey's `lod_state` comes from `listAudit(key, {entity_type: "lod_state", limit: 1})` inside the journey's allSettled; an office gets null | A ledger read that fails costs only its line ("unavailable — …"), never a step |
| E16 | `readLodState` returns not measured when the newest row's `project_stage` is not `design` | D18: only a stage the matrix maps to design feeds the design gate; another mapping is said, never read as the design share |
| E17 | `PromoteContext.Fetch` is called only inside `Task.Run` (a source scan counts every call site) | The design's "no network call on Revit's API thread" (MA-2a's rule) |
| E18 | A Promote changeset runs in `RunChecked` when its DD IDS was read, even with no BLOCK rule; the IDS check comes before the BLOCK check | Going back needs the group; the design orders step 5 (IDS) before step 6 (BLOCK) |
| E19 | The LOD state after is read in the review's result handler (on the API thread, inside the placement event), only for a `promote` changeset with an element applied, and posted as one more `lod_state` row | Step 10; the handler already reports the result there. Ceiling: it reads every class's facts again (UNSURE 5) |
| E20 | The pane's line is one more TextBlock under the next step, filled by the journey refresh that already runs (document activation, sync, the ↻ button) | No new trigger and no API-thread work; the row may land a moment after Promote posts it, so the drill presses ↻ (UNSURE 4) |
| E21 | `STAGES` is exported from sentinel-core; `cde-store.mjs` keeps its own copy, held equal by `stage-gate.test.mjs` | D18's one list for the gate, without touching every web copy; the web's copies (project-shell, owner-panel, deliverables) are under Next |
| E22 | `classifyGate`'s sentence ("N of M gate metrics have no server source") is not reworded | Its evidence lines carry each check's own source ("not measured — the newest lod_state ledger row not read"); the summary's wording is a known ceiling, under Risks |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `WebApp/src/sentinel-core/lod-matrix.ts` (new), `lod-matrix.test.ts` (new), `bridge-entry.ts` | 1 | `parseLodMatrix`, `STAGES`, `MATRIX_STAGES`, `DEFAULT_STAGE_MAP`, `MAX_SNAP_MM`; the export |
| `WebApp/bridge/fixtures/lod-matrix/cases.json` (new) | 1 | The 24 shared cases |
| `WebApp/bridge/artefact-store.mjs`, `artefact-store.test.mjs`, `sentinel-core-bundle.test.mjs`, `sentinel-core.mjs` (rebuilt) | 1 | The install check through the one reader; its tests; the bundle |
| `SentinelAddin/GhostBuilder/PromotePlanner.cs` | 2, 3, 5 | `LodMatrix.FromBody` (the twin), `StageMap`, `SnapMm`; `SnapTo`, `SnapWords`; the other classes' `LodFact` |
| `tools/promote-check/LodMatrixChecks.cs` (new), `Check.cs`, `Classes.cs` | 2 | The parity section (the design's "tools/lod-check") |
| `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` | 3, 5 | The walls' snap and body field; `StoreyPlan.Lod`, the walls' `LodFact` |
| `WebApp/bridge/changesets-logic.mjs`, `changesets-store.mjs` and their tests | 3 | `snap` on an element, `checkSnap`, `snapLimitFor` |
| `SentinelAddin/Coordination/ChangesetClient.cs`, `GhostBuilder/ChangesetExecutor.cs`, `Commands.PromoteWalls.cs` | 3 | `SnapDto`; `Unsafe` with the snap; the preflight and the planner call |
| `tools/promote-check/SnapChecks.cs` (new), `Ma2aWiring.cs` | 3 | The snap's checks; the MA-2a scan's words |
| `WebApp/bridge/ids-compile.mjs`, `artefact-store.mjs`, `bcf-service.mjs`, `lod-ids.test.mjs` (new), `fixtures/lod-matrix/ids-cases.json` (new, generated) | 4 | `matrixToIds`, `CATEGORY_ENTITY`, IFCCOVERING; `lodMatrixIds`; the route; the parity fixture |
| `SentinelAddin/GhostBuilder/LodState.cs` (new), `Coordination/CommandReports.cs` | 5, 7 | `LodFact`, `StageIds`, `LodClassRow`, `LodStateReport`, `LodState.Read`; the check's words; the `lod_state` row |
| `tools/promote-check/LodStateChecks.cs` (new), `promote-check.csproj` | 5, 7 | The IDS parity and the LOD state checks |
| `WebApp/bridge/cde-store.mjs`, `journey-store.mjs`, `stage-gate.mjs`, `bcf-service.mjs`; `src/sentinel-core/gates.ts`; `src/setups/project-shell.ts`, `next-strip.ts`; their tests, `cde-store-gate.test.mjs`, `check-registry.test.mjs`, `write-roles.test.mjs` | 6 | The report type; the journey's line; the gate's metric; the web strip's line |
| `SentinelAddin/GhostBuilder/PromoteContext.cs` (new), `ChangesetPlacementEvent.cs`, `Commands.ReviewChangesets.cs`, `Commands.PromoteWalls.cs`, `Coordination/ArtefactClient.cs`, `GovernedQuery.cs`, `UI/SentinelPanelViewModel.cs`, `UI/SentinelPanel.xaml` | 7 | The fetch, the check before commit, now and after, the pane's line |
| `tools/promote-check/Ma2bWiring.cs` (new), `PlacementBlock.cs` | 7 | The source scans |
| `demo/bds-pilot/bds-lod-matrix-dd-ma2b.json` (new), `demo/bds-pilot/README.md`, `docs/strategy/2026-09-30-model-automation-design.md` | 8 | The drill's matrix; the words |

---

## Tasks (in order: the TS reader; its C# twin; the snap; matrixToIds; the LOD state reader; the ledger row and its readers; the Revit-bound wiring; the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file. `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once.

### Task 1 — TS: one lod_matrix reader with stage_map and type_snap_mm, the shared cases, the install check through the bundle

**Files:**
- Create `WebApp/bridge/fixtures/lod-matrix/cases.json` — the 24 shared cases (one per line: a body and its error, or the stage map and snaps it reads to)
- Create `WebApp/src/sentinel-core/lod-matrix.test.ts` — the TS reader over the cases and the demo matrix
- Create `WebApp/src/sentinel-core/lod-matrix.ts` — `parseLodMatrix`
- Modify `WebApp/src/sentinel-core/bridge-entry.ts` — the export
- Modify `WebApp/bridge/artefact-store.mjs` — the `lod_matrix` branch calls `parseLodMatrix`; `LOD_CATEGORIES` and `LOD_DD` go
- Modify `WebApp/bridge/artefact-store.test.mjs`, `WebApp/bridge/sentinel-core-bundle.test.mjs`
- Rebuild `WebApp/bridge/sentinel-core.mjs`

**Interfaces:** `parseLodMatrix(body: unknown): LodMatrix` — throws `Error("<path> <want>")`. `LodMatrix = {standard_key, semver, draft: boolean, stage_map: Record<string, string>, rows: LodRow[]}`; `LodRow = {category, dd: Record<string, string> (the DD rules: type, level, top, host), properties: string[], type_snap_mm: number}`. `STAGES = ["tender", "design", "coord", "constr", "hand", "oper"]`, `MATRIX_STAGES = ["concept", "SD", "DD", "CD"]`, `DEFAULT_STAGE_MAP = {concept: design, SD: design, DD: design, CD: coord}`, `LOD_CATEGORIES`, `MAX_SNAP_MM = 50`. The words every reader uses (the fixture holds all of them): `"<k> is not a lod_matrix field — the body is {standard_key, semver, status?, stage_map?, rows}"`, `"stage_map must be an object of matrix stage: project stage"`, `"stage_map.<k> is not a matrix stage — concept, SD, DD, CD"`, `"stage_map.<k> must be tender | design | coord | constr | hand | oper"`, `"stage_map.<k> maps to <v>, before <prev>'s <pv> — a later matrix stage never maps to an earlier project stage"`, `"rows[i].<k> is not a row field — a row is {category, DD} (Promote checks the DD stage only; stage_map names the others)"`, `"rows[i].DD.type_snap_mm must be a whole number of millimetres, 0 to 50 (D16: 0 keeps the exact match)"`, `"rows[i].DD.type_snap_mm must be 0 for Doors — a door or window is matched by its type name's W x H, never snapped"`, `"rows[i].DD.<k> is not a DD rule Promote reads — type, level, top, host, properties, type_snap_mm"`, `"rows[i].DD.properties must be an array of non-empty strings"`, and v0's words for the rest.

- [ ] **Step 1: The shared cases and the failing tests.**

`Create` `WebApp/bridge/fixtures/lod-matrix/cases.json`:

```json
[
  {"name":"a v0 matrix (Promote v1's): the D18 stage map, no snap","body":{"standard_key":"T-LOD-001","semver":"1.0.0","status":"draft","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":null,"stage_map":{"concept":"design","SD":"design","DD":"design","CD":"coord"},"snap":{"Walls":0,"Doors":0}},
  {"name":"stage_map names some stages: the others keep the D18 default","body":{"standard_key":"T-LOD-001","semver":"1.0.0","stage_map":{"DD":"design","CD":"coord"},"rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":null,"stage_map":{"concept":"design","SD":"design","DD":"design","CD":"coord"},"snap":{"Walls":0,"Doors":0}},
  {"name":"stage_map moves CD to constr","body":{"standard_key":"T-LOD-001","semver":"1.0.0","stage_map":{"CD":"constr"},"rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":null,"stage_map":{"concept":"design","SD":"design","DD":"design","CD":"constr"},"snap":{"Walls":0,"Doors":0}},
  {"name":"type_snap_mm 15 on Walls (D16: the founder's value)","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level","type_snap_mm":15}}]},"error":null,"stage_map":{"concept":"design","SD":"design","DD":"design","CD":"coord"},"snap":{"Walls":15}},
  {"name":"type_snap_mm 0 on Doors","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"],"type_snap_mm":0}}]},"error":null,"stage_map":{"concept":"design","SD":"design","DD":"design","CD":"coord"},"snap":{"Doors":0}},
  {"name":"a stages list is not read","body":{"standard_key":"T-LOD-001","semver":"1.0.0","stages":["concept","SD","DD","CD"],"rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":"stages is not a lod_matrix field — the body is {standard_key, semver, status?, stage_map?, rows}"},
  {"name":"semver","body":{"standard_key":"T-LOD-001","semver":"1","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":"semver must be x.y.z"},
  {"name":"status","body":{"standard_key":"T-LOD-001","semver":"1.0.0","status":"final","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":"status must be draft or approved"},
  {"name":"stage_map is an object","body":{"standard_key":"T-LOD-001","semver":"1.0.0","stage_map":["DD"],"rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":"stage_map must be an object of matrix stage: project stage"},
  {"name":"stage_map names a matrix stage","body":{"standard_key":"T-LOD-001","semver":"1.0.0","stage_map":{"LOD300":"design"},"rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":"stage_map.LOD300 is not a matrix stage — concept, SD, DD, CD"},
  {"name":"stage_map names a project stage","body":{"standard_key":"T-LOD-001","semver":"1.0.0","stage_map":{"CD":"construction"},"rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":"stage_map.CD must be tender | design | coord | constr | hand | oper"},
  {"name":"stage_map never runs backwards","body":{"standard_key":"T-LOD-001","semver":"1.0.0","stage_map":{"SD":"coord"},"rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"]}}]},"error":"stage_map.DD maps to design, before SD's coord — a later matrix stage never maps to an earlier project stage"},
  {"name":"rows","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[]},"error":"rows must be a non-empty array"},
  {"name":"a CD stage on a row is not read","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"},"CD":{"properties":["Pset_WallCommon.AcousticRating"]}}]},"error":"rows[0].CD is not a row field — a row is {category, DD} (Promote checks the DD stage only; stage_map names the others)"},
  {"name":"category","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Stairs","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}}]},"error":"rows[0].category must be Walls | Floors | Roofs | Ceilings | Doors | Windows"},
  {"name":"one row per class","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}}]},"error":"rows[1].category appears twice — one row per class"},
  {"name":"a lod number is not read","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level","lod":300}}]},"error":"rows[0].DD.lod is not a DD rule Promote reads — type, level, top, host, properties, type_snap_mm"},
  {"name":"a DD rule's value","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"roof"}}]},"error":"rows[0].DD.top must be next_story_level"},
  {"name":"DD.type is required","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"level":"story_level"}}]},"error":"rows[0].DD.type is required — DD means typed by a guideline rule"},
  {"name":"properties","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level","properties":[""]}}]},"error":"rows[0].DD.properties must be an array of non-empty strings"},
  {"name":"type_snap_mm is whole millimetres","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level","type_snap_mm":12.5}}]},"error":"rows[0].DD.type_snap_mm must be a whole number of millimetres, 0 to 50 (D16: 0 keeps the exact match)"},
  {"name":"type_snap_mm is at most 50","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level","type_snap_mm":60}}]},"error":"rows[0].DD.type_snap_mm must be a whole number of millimetres, 0 to 50 (D16: 0 keeps the exact match)"},
  {"name":"type_snap_mm is a number","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level","type_snap_mm":"15"}}]},"error":"rows[0].DD.type_snap_mm must be a whole number of millimetres, 0 to 50 (D16: 0 keeps the exact match)"},
  {"name":"a door is never snapped","body":{"standard_key":"T-LOD-001","semver":"1.0.0","rows":[{"category":"Walls","DD":{"type":"guideline_rule","level":"story_level","top":"next_story_level"}},{"category":"Doors","DD":{"type":"guideline_rule","level":"story_level","host":"wall","properties":["Pset_DoorCommon.FireRating"],"type_snap_mm":5}}]},"error":"rows[1].DD.type_snap_mm must be 0 for Doors — a door or window is matched by its type name's W x H, never snapped"}
]
```

`Create` `WebApp/src/sentinel-core/lod-matrix.test.ts`:

```ts
// MA-2b: the one lod_matrix@n reader. The cases are shared with the add-in's twin (tools/promote-check reads the same file
// into LodMatrix.FromBody) and with the bundle (bridge/sentinel-core-bundle.test.mjs), so all three accept and refuse the
// same bodies in the same words, and read the same stage map and snap.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseLodMatrix, DEFAULT_STAGE_MAP, STAGES } from "./lod-matrix";
import { GATE_DEFS } from "./gates";

type Case = { name: string; body: unknown; error: string | null; stage_map?: Record<string, string>; snap?: Record<string, number> };
const CASES: Case[] = JSON.parse(readFileSync("bridge/fixtures/lod-matrix/cases.json", "utf8"));
const snapOf = (m: ReturnType<typeof parseLodMatrix>) => Object.fromEntries(m.rows.map((r) => [r.category, r.type_snap_mm]));

describe("parseLodMatrix (MA-2b, TS ↔ C# ↔ bridge bundle)", () => {
  it("holds 24 cases, both kinds", () => {
    expect(CASES.length).toBe(24);
    expect(CASES.filter((c) => c.error === null).length).toBe(5);
  });
  it.each(CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    if (c.error !== null) {
      let said: string | null = null;
      try { parseLodMatrix(c.body); } catch (e) { said = (e as Error).message; }
      expect(said).toBe(c.error);
      return;
    }
    const m = parseLodMatrix(c.body);
    expect(m.stage_map).toEqual(c.stage_map);
    expect(snapOf(m)).toEqual(c.snap);
  });
  it("the demo matrix (a v0 body) reads as before: DRAFT, D18's stage map, every row exact, properties kept, DD rules apart", () => {
    const m = parseLodMatrix(JSON.parse(readFileSync("../demo/bds-pilot/bds-lod-matrix-dd.json", "utf8")));
    expect(m.draft).toBe(true);
    expect(m.stage_map).toEqual(DEFAULT_STAGE_MAP);
    expect(m.rows.map((r) => r.category)).toEqual(["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"]);
    expect(m.rows.every((r) => r.type_snap_mm === 0)).toBe(true);
    expect(m.rows[4]).toEqual({ category: "Doors", dd: { type: "guideline_rule", level: "story_level", host: "wall" }, type_snap_mm: 0,
      properties: ["Pset_DoorCommon.IsExternal", "Pset_DoorCommon.FireRating"] });
  });
  it("one stage list (D18): the gate's stages are the matrix's project stages", () => {
    expect(Object.keys(GATE_DEFS).every((s) => STAGES.includes(s))).toBe(true);
    expect(Object.values(DEFAULT_STAGE_MAP).every((s) => STAGES.includes(s))).toBe(true);
  });
});
```

In `WebApp/bridge/artefact-store.test.mjs`, replace

```js

describe("validateArtefact — lod_matrix (Promote v1)", () => {
  const ok = readRepoJson("demo/bds-pilot/bds-lod-matrix-dd.json");
  const row = (i, over) => withItem(ok, "rows", i, over);
  it("the demo matrix installs", () => {
    expect(fails("lod_matrix", ok)).toBeNull();
```

with

```js

describe("validateArtefact — lod_matrix (Promote v1, MA-2b)", () => {
  const ok = readRepoJson("demo/bds-pilot/bds-lod-matrix-dd.json");
  const row = (i, over) => withItem(ok, "rows", i, over);
  // MA-2b: the install check is sentinel-core's parseLodMatrix (the bundle); the add-in's LodMatrix.FromBody reads the same cases.
  const cases = JSON.parse(readFileSync(new URL("./fixtures/lod-matrix/cases.json", import.meta.url), "utf8"));
  it("the demo matrix (a v0 body) installs as before", () => {
    expect(fails("lod_matrix", ok)).toBeNull();
```

In `WebApp/bridge/artefact-store.test.mjs`, replace

```js
  });
  it.each([
    [{ ...ok, source: "x" }, "lod_matrix: source is not a lod_matrix field — the body is {standard_key, semver, status?, rows}"],
    [{ ...ok, semver: "1" }, "lod_matrix: semver must be x.y.z"],
    [{ ...ok, status: "final" }, "lod_matrix: status must be draft or approved"],
    [{ ...ok, rows: [] }, "lod_matrix: rows must be a non-empty array"],
    [row(0, { DD: { ...ok.rows[0].DD, joins: "clean" } }), "lod_matrix: rows[0].DD.joins is not a DD rule Promote reads — type, level, top, host, properties"],
    [row(0, { DD: { ...ok.rows[0].DD, top: "roof" } }), "lod_matrix: rows[0].DD.top must be next_story_level"],
    [row(1, { category: "Walls" }), "lod_matrix: rows[1].category appears twice — one row per class"],
    [row(1, { category: "Stairs" }), "lod_matrix: rows[1].category must be Walls | Floors | Roofs | Ceilings | Doors | Windows"],
    [row(1, { CD: {} }), "lod_matrix: rows[1].CD is not a row field — a row is {category, DD} (v0 knows the DD stage only)"],
    [row(1, { DD: { level: "story_level" } }), "lod_matrix: rows[1].DD.type is required — DD means typed by a guideline rule"],
    [row(1, { DD: { ...ok.rows[1].DD, properties: [""] } }), "lod_matrix: rows[1].DD.properties must be an array of non-empty strings (listed for a person, not enforced)"],
    [row(1, { DD: { ...ok.rows[1].DD, constructor: "x" } }), "lod_matrix: rows[1].DD.constructor is not a DD rule Promote reads — type, level, top, host, properties"],
  ])("a matrix Promote would not read as written is refused in words (%#)", (body, message) => {
```

with

```js
  });
  it.each(cases.map((c) => [c.name, c]))("the shared case: %s", (_name, c) => {
    if (c.error === null) expect(validateArtefact("lod_matrix", c.body)).toBe(true);
    else expect(fails("lod_matrix", c.body)).toMatchObject({ status: 400, message: `lod_matrix: ${c.error}` });
  });
  it.each([
    [{ ...ok, source: "x" }, "lod_matrix: source is not a lod_matrix field — the body is {standard_key, semver, status?, stage_map?, rows}"],
    [row(0, { DD: { ...ok.rows[0].DD, joins: "clean" } }), "lod_matrix: rows[0].DD.joins is not a DD rule Promote reads — type, level, top, host, properties, type_snap_mm"],
    [row(1, { DD: { ...ok.rows[1].DD, constructor: "x" } }), "lod_matrix: rows[1].DD.constructor is not a DD rule Promote reads — type, level, top, host, properties, type_snap_mm"],
  ])("a matrix Promote would not read as written is refused in words (%#)", (body, message) => {
```

In `WebApp/bridge/sentinel-core-bundle.test.mjs`, replace

```js
import * as source from "../src/sentinel-core/guideline";

```

with

```js
import * as source from "../src/sentinel-core/guideline";
import * as lodSource from "../src/sentinel-core/lod-matrix";

```

In `WebApp/bridge/sentinel-core-bundle.test.mjs`, replace

```js
    expect(bundle.CATEGORY_BIC).toEqual(source.CATEGORY_BIC);
  });
```

with

```js
    expect(bundle.CATEGORY_BIC).toEqual(source.CATEGORY_BIC);
  });

  // MA-2b: the install check runs parseLodMatrix from the bundle — every shared case, the same answer and the same words.
  it("reads every lod_matrix case as the TS source does — rebuild the bundle when this fails", () => {
    const cases = read("./fixtures/lod-matrix/cases.json");
    expect(cases.length).toBe(24);
    const run = (f, body) => { try { return f(body); } catch (e) { return { error: e.message }; } };
    for (const c of cases) expect(run(bundle.parseLodMatrix, c.body), c.name).toEqual(run(lodSource.parseLodMatrix, c.body));
    expect(bundle.STAGES).toEqual(lodSource.STAGES);
  });
```

- [ ] **Step 2: Run them, and see them fail.** From `WebApp`: `npx vitest run src/sentinel-core/lod-matrix bridge/sentinel-core-bundle.test.mjs bridge/artefact-store.test.mjs` — `Test Files  3 failed (3)`, `Tests  19 failed | 193 passed (212)`: `lod-matrix.test.ts` cannot load (`./lod-matrix` does not exist); the bundle has no `parseLodMatrix`; the install check refuses `stage_map` and `type_snap_mm` and words the rest the v0 way.

- [ ] **Step 3: The reader, the export, the install check through it; then rebuild the bundle.**

`Create` `WebApp/src/sentinel-core/lod-matrix.ts`:

```ts
// sentinel-core/lod-matrix — the ONE reader of lod_matrix@n (MA-2b). PURE TS. The bridge's install check
// (bridge/artefact-store.mjs validateArtefact) runs it through the bundle; the add-in's C# twin
// (SentinelAddin/GhostBuilder/PromotePlanner.cs LodMatrix.FromBody) accepts and refuses the same bodies in the same
// words — both read WebApp/bridge/fixtures/lod-matrix/cases.json. Rows are keyed by Revit category, as guideline@n.
// Promote checks the DD stage only: a key it does not read is refused, so the LOD state never reads higher than what
// was checked. stage_map ties the matrix's stages to Sentinel's project stages (D18); type_snap_mm is a row's snap
// limit, 0 = the exact match (D16: a higher value is the founder's).

/** Sentinel's project stages, in order — the keys of GATE_DEFS (cde-store STAGES is the same list). */
export const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
/** The matrix's design stages, in order. */
export const MATRIX_STAGES = ["concept", "SD", "DD", "CD"];
/** D18: concept, SD and DD → design; CD → coord. A matrix's stage_map names some or all of them. */
export const DEFAULT_STAGE_MAP: Record<string, string> = { concept: "design", SD: "design", DD: "design", CD: "coord" };
export const LOD_CATEGORIES = ["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"];
/** The DD rules Promote reads, and the one value each may take. */
const LOD_DD: Record<string, string[]> = { type: ["guideline_rule"], level: ["story_level"], top: ["next_story_level"], host: ["wall"] };
/** A snap is measurement noise or a near size, never another type. */
export const MAX_SNAP_MM = 50;

export interface LodRow {
  category: string;
  /** The DD rules Promote checks (type, level, top, host) — never properties or type_snap_mm. */
  dd: Record<string, string>;
  /** The properties DD asks for ("Pset_WallCommon.FireRating"); matrixToIds makes them the stage IDS. */
  properties: string[];
  /** 0 = the exact match (D16). */
  type_snap_mm: number;
}
export interface LodMatrix {
  standard_key: string;
  semver: string;
  draft: boolean;
  /** Every matrix stage → its project stage: the body's stage_map over DEFAULT_STAGE_MAP. */
  stage_map: Record<string, string>;
  rows: LodRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const filled = (v: unknown): v is string => typeof v === "string" && /[^\s\u0085]/.test(v);
const bad = (path: string, want: string) => new Error(`${path} ${want}`);

/** A lod_matrix@n body → the matrix, or an Error whose message names the path ("rows[1].DD.type_snap_mm must be …"). */
export function parseLodMatrix(body: unknown): LodMatrix {
  if (!isObj(body)) throw bad("the body", "must be a JSON object");
  const stray = Object.keys(body).find((k) => !["standard_key", "semver", "status", "stage_map", "rows"].includes(k));
  if (stray !== undefined) throw bad(stray, "is not a lod_matrix field — the body is {standard_key, semver, status?, stage_map?, rows}");
  if (!filled(body.standard_key)) throw bad("standard_key", "must be a non-empty string");
  if (typeof body.semver !== "string" || !/^\d+\.\d+\.\d+$/.test(body.semver)) throw bad("semver", "must be x.y.z");
  if (body.status != null && body.status !== "draft" && body.status !== "approved") throw bad("status", "must be draft or approved");

  const stage_map: Record<string, string> = { ...DEFAULT_STAGE_MAP };
  if (body.stage_map != null) {
    if (!isObj(body.stage_map)) throw bad("stage_map", "must be an object of matrix stage: project stage");
    for (const [k, v] of Object.entries(body.stage_map)) {
      if (!MATRIX_STAGES.includes(k)) throw bad(`stage_map.${k}`, `is not a matrix stage — ${MATRIX_STAGES.join(", ")}`);
      if (typeof v !== "string" || !STAGES.includes(v)) throw bad(`stage_map.${k}`, `must be ${STAGES.join(" | ")}`);
      stage_map[k] = v;
    }
    for (let i = 1; i < MATRIX_STAGES.length; i++) {
      const [prev, k] = [MATRIX_STAGES[i - 1], MATRIX_STAGES[i]];
      if (STAGES.indexOf(stage_map[k]) < STAGES.indexOf(stage_map[prev]))
        throw bad(`stage_map.${k}`, `maps to ${stage_map[k]}, before ${prev}'s ${stage_map[prev]} — a later matrix stage never maps to an earlier project stage`);
    }
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) throw bad("rows", "must be a non-empty array");
  const seen = new Set<string>();
  const rows = body.rows.map((r: unknown, i: number): LodRow => {
    const at = `rows[${i}]`;
    if (!isObj(r)) throw bad(at, "must be an object");
    const strayRow = Object.keys(r).find((k) => k !== "category" && k !== "DD");
    if (strayRow !== undefined) throw bad(`${at}.${strayRow}`, "is not a row field — a row is {category, DD} (Promote checks the DD stage only; stage_map names the others)");
    if (typeof r.category !== "string" || !LOD_CATEGORIES.includes(r.category)) throw bad(`${at}.category`, `must be ${LOD_CATEGORIES.join(" | ")}`);
    if (seen.has(r.category)) throw bad(`${at}.category`, "appears twice — one row per class");
    seen.add(r.category);
    if (!isObj(r.DD)) throw bad(`${at}.DD`, "must be an object");
    const row: LodRow = { category: r.category, dd: {}, properties: [], type_snap_mm: 0 };
    for (const [k, v] of Object.entries(r.DD)) {
      if (k === "properties") {
        if (!Array.isArray(v) || !v.every(filled)) throw bad(`${at}.DD.properties`, "must be an array of non-empty strings");
        row.properties = [...v];
      } else if (k === "type_snap_mm") {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_SNAP_MM)
          throw bad(`${at}.DD.type_snap_mm`, `must be a whole number of millimetres, 0 to ${MAX_SNAP_MM} (D16: 0 keeps the exact match)`);
        if (v > 0 && (r.category === "Doors" || r.category === "Windows"))
          throw bad(`${at}.DD.type_snap_mm`, `must be 0 for ${r.category} — a door or window is matched by its type name's W x H, never snapped`);
        row.type_snap_mm = v;
      } else if (!Object.prototype.hasOwnProperty.call(LOD_DD, k)) {
        throw bad(`${at}.DD.${k}`, `is not a DD rule Promote reads — ${[...Object.keys(LOD_DD), "properties", "type_snap_mm"].join(", ")}`);
      } else if (!LOD_DD[k].includes(v as string)) {
        throw bad(`${at}.DD.${k}`, `must be ${LOD_DD[k].join(" | ")}`);
      } else row.dd[k] = v as string;
    }
    if (row.dd.type === undefined) throw bad(`${at}.DD.type`, "is required — DD means typed by a guideline rule");
    return row;
  });
  return { standard_key: body.standard_key, semver: body.semver, draft: body.status === "draft", stage_map, rows };
}
```

In `WebApp/bridge/artefact-store.mjs`, replace

```js
import { resolveActor } from "./bridge-auth.mjs";

```

with

```js
import { resolveActor } from "./bridge-auth.mjs";
import { parseLodMatrix } from "./sentinel-core.mjs"; // MA-2b: the one lod_matrix reader (src/sentinel-core/lod-matrix.ts)

```

In `WebApp/bridge/artefact-store.mjs`, replace

```js
const LAYER_CATEGORIES = ["Walls", "Floors", "Ceilings", "Doors", "Windows", "Columns", "Furniture"];
const LOD_CATEGORIES = ["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"];          // what Promote v1 promotes
const LOD_DD = { type: ["guideline_rule"], level: ["story_level"], top: ["next_story_level"], host: ["wall"] }; // what it reads
const MAX_CATALOG_TYPES = 20000;                                         // = office-store MAX_CATALOG_TYPES (importing it would load cde-store)
```

with

```js
const LAYER_CATEGORIES = ["Walls", "Floors", "Ceilings", "Doors", "Windows", "Columns", "Furniture"];
const MAX_CATALOG_TYPES = 20000;                                         // = office-store MAX_CATALOG_TYPES (importing it would load cde-store)
```

In `WebApp/bridge/artefact-store.mjs`, replace

```js
  if (kind === "lod_matrix") {
    // The office's LOD matrix v0 (Promote v1): per class, what DD means — only rules Promote checks. A key it would not read is
    // refused, not kept: "DD now" must never read higher than what was checked. rows are keyed by Revit category, as guideline@n.
    const stray = Object.keys(body).find((k) => !["standard_key", "semver", "status", "rows"].includes(k));
    if (stray !== undefined) throw bad(kind, stray, "is not a lod_matrix field — the body is {standard_key, semver, status?, rows}");
    standardHead(kind, body);
    if (body.status != null && !["draft", "approved"].includes(body.status)) throw bad(kind, "status", "must be draft or approved");
    if (!Array.isArray(body.rows) || !body.rows.length) throw bad(kind, "rows", "must be a non-empty array");
    const seen = new Set();
    objects(kind, "rows", body.rows, (r, at) => {
      const strayRow = Object.keys(r).find((k) => k !== "category" && k !== "DD");
      if (strayRow !== undefined) throw bad(kind, `${at}.${strayRow}`, "is not a row field — a row is {category, DD} (v0 knows the DD stage only)");
      if (!LOD_CATEGORIES.includes(r.category)) throw bad(kind, `${at}.category`, `must be ${LOD_CATEGORIES.join(" | ")}`);
      if (seen.has(r.category)) throw bad(kind, `${at}.category`, "appears twice — one row per class");
      seen.add(r.category);
      if (!isObj(r.DD)) throw bad(kind, `${at}.DD`, "must be an object");
      for (const [k, v] of Object.entries(r.DD)) {
        if (k === "properties") { if (!names(v)) throw bad(kind, `${at}.DD.properties`, "must be an array of non-empty strings (listed for a person, not enforced)"); continue; }
        if (!Object.hasOwn(LOD_DD, k)) throw bad(kind, `${at}.DD.${k}`, `is not a DD rule Promote reads — ${[...Object.keys(LOD_DD), "properties"].join(", ")}`);
        if (!LOD_DD[k].includes(v)) throw bad(kind, `${at}.DD.${k}`, `must be ${LOD_DD[k].join(" | ")}`);
      }
      if (r.DD.type === undefined) throw bad(kind, `${at}.DD.type`, "is required — DD means typed by a guideline rule");
    });
  }
```

with

```js
  if (kind === "lod_matrix") {
    // The office's LOD matrix (Promote v1, MA-2b): per class, what DD means, the stage map (D18) and the snap (D16). One reader,
    // sentinel-core's parseLodMatrix (bundled); the add-in's LodMatrix.FromBody is its twin (fixtures/lod-matrix/cases.json).
    try { parseLodMatrix(body); } catch (e) { throw err(400, `lod_matrix: ${e.message}`); }
  }
```

In `WebApp/src/sentinel-core/bridge-entry.ts`, replace

```ts
export { checkFederation, nameShape, raisedFederationTitleKey } from "./federation";

```

with

```ts
export { checkFederation, nameShape, raisedFederationTitleKey } from "./federation";
export { parseLodMatrix, STAGES, MATRIX_STAGES, DEFAULT_STAGE_MAP } from "./lod-matrix"; // MA-2b: the one lod_matrix reader
export type { LodMatrix, LodRow } from "./lod-matrix";

```

Then, from `WebApp`: `npm run build:bridge-core` — `bridge\sentinel-core.mjs  69.3kb`.

- [ ] **Step 4: Run them, and see them pass.** The same command — `Test Files  3 passed (3)`, `Tests  243 passed (243)`. `dotnet run --project tools/promote-check` is still `569/569` (nothing on the C# side changed yet).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/src/sentinel-core/lod-matrix.ts WebApp/src/sentinel-core/lod-matrix.test.ts WebApp/src/sentinel-core/bridge-entry.ts WebApp/bridge/fixtures/lod-matrix/cases.json WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/sentinel-core-bundle.test.mjs WebApp/bridge/sentinel-core.mjs
git commit -F - <<'EOF'
feat(lod_matrix): one reader with stage_map and type_snap_mm (MA-2b) - parseLodMatrix in sentinel-core, the install check through the bundle, 24 shared cases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 2 — C#: LodMatrix.FromBody is the reader's twin, read on the shared cases (the design's "tools/lod-check")

**Files:**
- Create `tools/promote-check/LodMatrixChecks.cs` — `LodMatrixParityChecks`
- Modify `tools/promote-check/Check.cs` — the call; `tools/promote-check/Classes.cs` — the v0 check's error words
- Modify `SentinelAddin/GhostBuilder/PromotePlanner.cs` — `LodMatrix`

**Interfaces:** `LodMatrix.Stages`, `LodMatrix.MatrixStages` (string[]), `LodMatrix.DefaultStageMap`, `LodMatrix.MaxSnapMm = 50`; per matrix `StageMap` (`Dictionary<string, string>`, all four matrix stages) and `SnapMm` (`Dictionary<string, int>`, category → limit). `FromBody` keeps its contract (null and the error, never a partial matrix, never throws) and gives `parseLodMatrix`'s words.

- [ ] **Step 1: The parity section and the v0 check's new words.**

`Create` `tools/promote-check/LodMatrixChecks.cs`:

```csharp
#nullable disable
using System.Text.Json.Nodes;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 28. MA-2b: the lod_matrix twin — LodMatrix.FromBody against the cases sentinel-core's parseLodMatrix and the bridge's
    //        install check read (WebApp/bridge/fixtures/lod-matrix/cases.json): the same bodies accepted and refused, in the
    //        same words, with the same stage map (D18) and snap (D16). This section is the design's "tools/lod-check". ─────
    static void LodMatrixParityChecks()
    {
        Console.WriteLine("\nMA-2b — lod_matrix: the C# twin of parseLodMatrix (WebApp/bridge/fixtures/lod-matrix/cases.json)");
        var cases = JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "lod-matrix", "cases.json"))).AsArray();
        int same = 0;
        foreach (var c in cases)
        {
            var mx = LodMatrix.FromBody(c["body"].ToJsonString(), out var err);
            string want = (string)c["error"];
            bool ok = want != null
                ? mx == null && err == want
                : mx != null && err == null
                  && mx.StageMap.Count == 4 && c["stage_map"].AsObject().All(kv => mx.StageMap[kv.Key] == (string)kv.Value)
                  && mx.SnapMm.Count == c["snap"].AsObject().Count && c["snap"].AsObject().All(kv => mx.SnapMm[kv.Key] == (int)kv.Value);
            if (ok) same++;
            else Console.WriteLine($"        {(string)c["name"]}: got {(mx == null ? "error \"" + err + "\"" : "a matrix")}, want {(want == null ? "a matrix" : "\"" + want + "\"")}");
        }
        Ok(cases.Count == 24 && same == cases.Count, $"every shared lod_matrix case ({same}/{cases.Count}): the same answer and the same words as the TS reader");

        var demo = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd.json")), out var de);
        Ok(de == null && demo.SnapMm.Values.All(v => v == 0) && demo.StageMap["DD"] == "design" && demo.StageMap["CD"] == "coord",
           "the demo matrix (a v0 body): every row exact (snap 0), the D18 stage map");
        var snapped = JsonNode.Parse(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd.json"))).AsObject();
        snapped["rows"][0]["DD"]["type_snap_mm"] = 15;
        var notRun = new List<string>();
        var sm = LodMatrix.FromBody(snapped.ToJsonString(), out _);
        Ok(sm.SnapMm["Walls"] == 15 && sm.Dd["Walls"] == LodMatrix.V1["Walls"] && LodMatrix.Classes(sm, "lod_matrix@3", DdElementsMatcher(), notRun).Contains("Walls"),
           "a snap is kept apart from the DD rules: the Walls row still reads as Promote v1's, so Walls run (GN-4 untouched)");
        Ok(LodMatrix.Stages.SequenceEqual(new[] { "tender", "design", "coord", "constr", "hand", "oper" }) && LodMatrix.MatrixStages.SequenceEqual(new[] { "concept", "SD", "DD", "CD" }),
           "one stage list (D18): the project stages and the matrix stages, in order");
    }

    static GuidelineMatcher DdElementsMatcher() =>
        GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json")),
                                    File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        Ma2aWiringChecks();
```

with

```csharp
        Ma2aWiringChecks();
        LodMatrixParityChecks();
```

In `tools/promote-check/Classes.cs`, replace

```csharp
        Ok(LodMatrix.FromBody("{\"rows\":{}}", out var bad) == null && bad == "rows must be an array" && LodMatrix.FromBody("", out var empty) == null && empty != null,
           "a body it cannot read is an error, never a partial matrix");
```

with

```csharp
        Ok(LodMatrix.FromBody("{\"standard_key\":\"X\",\"semver\":\"1.0.0\",\"rows\":{}}", out var bad) == null && bad == "rows must be a non-empty array"
           && LodMatrix.FromBody("", out var empty) == null && empty != null,
           "a body it cannot read is an error, never a partial matrix");
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` fails to compile — `10 Error(s)`: `'LodMatrix' does not contain a definition for 'StageMap'`, `… 'SnapMm'`, `… 'Stages'`, `… 'MatrixStages'`.

- [ ] **Step 3: The twin.**

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
using System.Text.Json;
using Sentinel.Engine;
```

with

```csharp
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Engine;
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp

    /// <summary>lod_matrix@n v0 as Promote v1 reads it: per class (Revit category, as guideline@n), what DD means. The bridge
    /// refused any key Promote does not read at install; a row that still asks for something else is not run (GN-4), so
    /// "DD now" never reads higher than what was checked. properties are listed for a person, never enforced.</summary>
    public sealed class LodMatrix
```

with

```csharp

    /// <summary>lod_matrix@n as Promote reads it: per class (Revit category, as guideline@n), what DD means; since MA-2b also the
    /// stage map (D18) and each row's snap (D16). The C# twin of sentinel-core's parseLodMatrix (lod-matrix.ts): it accepts and
    /// refuses the same bodies in the same words — tools/promote-check and vitest read WebApp/bridge/fixtures/lod-matrix/cases.json.
    /// A row that asks for something Promote does not check is not run (GN-4), so the LOD state never reads higher than what was
    /// checked. properties are what the stage IDS (the bridge's matrixToIds) and the LOD state ask of an element.</summary>
    public sealed class LodMatrix
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp

        public bool Draft;
        /// <summary>Category → its DD row without properties, as one sorted string "host=wall; level=story_level; type=guideline_rule".</summary>
        public Dictionary<string, string> Dd = new Dictionary<string, string>(StringComparer.Ordinal);
        public Dictionary<string, List<string>> Properties = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        /// <summary>The raw lod_matrix@n body → the matrix, or null with <paramref name="error"/> naming the field. Never throws.</summary>
        public static LodMatrix FromBody(string json, out string error)
```

with

```csharp

        /// <summary>Sentinel's project stages, in order (sentinel-core STAGES; GATE_DEFS is keyed by them).</summary>
        public static readonly string[] Stages = { "tender", "design", "coord", "constr", "hand", "oper" };
        /// <summary>The matrix's design stages, in order.</summary>
        public static readonly string[] MatrixStages = { "concept", "SD", "DD", "CD" };
        /// <summary>D18: concept, SD and DD → design; CD → coord.</summary>
        public static readonly IReadOnlyDictionary<string, string> DefaultStageMap = new Dictionary<string, string>(StringComparer.Ordinal)
        { ["concept"] = "design", ["SD"] = "design", ["DD"] = "design", ["CD"] = "coord" };
        /// <summary>A snap is measurement noise or a near size, never another type.</summary>
        public const int MaxSnapMm = 50;
        private static readonly Dictionary<string, string> DdRules = new Dictionary<string, string>(StringComparer.Ordinal)
        { ["type"] = "guideline_rule", ["level"] = "story_level", ["top"] = "next_story_level", ["host"] = "wall" };

        public bool Draft;
        /// <summary>Category → its DD rules (no properties, no snap), as one sorted string "host=wall; level=story_level; type=guideline_rule".</summary>
        public Dictionary<string, string> Dd = new Dictionary<string, string>(StringComparer.Ordinal);
        public Dictionary<string, List<string>> Properties = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        /// <summary>MA-2b: every matrix stage → its project stage (the body's stage_map over <see cref="DefaultStageMap"/>).</summary>
        public Dictionary<string, string> StageMap = new Dictionary<string, string>(StringComparer.Ordinal);
        /// <summary>MA-2b: category → its DD row's type_snap_mm (0 = the exact match, D16).</summary>
        public Dictionary<string, int> SnapMm = new Dictionary<string, int>(StringComparer.Ordinal);

        /// <summary>The raw lod_matrix@n body → the matrix, or null with <paramref name="error"/> in parseLodMatrix's words
        /// ("rows[1].DD.type_snap_mm must be …"). Never throws; never a partial matrix.</summary>
        public static LodMatrix FromBody(string json, out string error)
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                    var b = d.RootElement;
                    if (b.ValueKind != JsonValueKind.Object) throw new InvalidDataException("the body must be a JSON object");
                    if (!b.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array) throw new InvalidDataException("rows must be an array");
                    var mx = new LodMatrix
                    {
                        Draft = b.TryGetProperty("status", out var st) && st.ValueKind == JsonValueKind.String
                                && string.Equals(st.GetString(), "draft", StringComparison.OrdinalIgnoreCase),
                    };
                    int i = 0;
```

with

```csharp
                    var b = d.RootElement;
                    if (b.ValueKind != JsonValueKind.Object) throw Bad("the body", "must be a JSON object");
                    foreach (var p in b.EnumerateObject())
                        if (Array.IndexOf(new[] { "standard_key", "semver", "status", "stage_map", "rows" }, p.Name) < 0)
                            throw Bad(p.Name, "is not a lod_matrix field — the body is {standard_key, semver, status?, stage_map?, rows}");
                    if (!(b.TryGetProperty("standard_key", out var sk) && Filled(sk))) throw Bad("standard_key", "must be a non-empty string");
                    if (!(b.TryGetProperty("semver", out var sv) && sv.ValueKind == JsonValueKind.String && Regex.IsMatch(sv.GetString(), @"^\d+\.\d+\.\d+$")))
                        throw Bad("semver", "must be x.y.z");
                    if (Present(b, "status", out var st) && !(st.ValueKind == JsonValueKind.String && (st.GetString() == "draft" || st.GetString() == "approved")))
                        throw Bad("status", "must be draft or approved");
                    var mx = new LodMatrix
                    {
                        Draft = Present(b, "status", out st) && st.GetString() == "draft",
                        StageMap = DefaultStageMap.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal),
                    };

                    if (Present(b, "stage_map", out var sm))
                    {
                        if (sm.ValueKind != JsonValueKind.Object) throw Bad("stage_map", "must be an object of matrix stage: project stage");
                        foreach (var kv in sm.EnumerateObject())
                        {
                            if (Array.IndexOf(MatrixStages, kv.Name) < 0) throw Bad("stage_map." + kv.Name, "is not a matrix stage — " + string.Join(", ", MatrixStages));
                            if (kv.Value.ValueKind != JsonValueKind.String || Array.IndexOf(Stages, kv.Value.GetString()) < 0)
                                throw Bad("stage_map." + kv.Name, "must be " + string.Join(" | ", Stages));
                            mx.StageMap[kv.Name] = kv.Value.GetString();
                        }
                        for (int s = 1; s < MatrixStages.Length; s++)
                        {
                            string prev = MatrixStages[s - 1], k = MatrixStages[s];
                            if (Array.IndexOf(Stages, mx.StageMap[k]) < Array.IndexOf(Stages, mx.StageMap[prev]))
                                throw Bad("stage_map." + k, $"maps to {mx.StageMap[k]}, before {prev}'s {mx.StageMap[prev]} — a later matrix stage never maps to an earlier project stage");
                        }
                    }

                    if (!(b.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array && rows.GetArrayLength() > 0))
                        throw Bad("rows", "must be a non-empty array");
                    int i = 0;
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                        string at = "rows[" + i++ + "]";
                        if (r.ValueKind != JsonValueKind.Object) throw new InvalidDataException(at + " must be an object");
                        if (!r.TryGetProperty("category", out var c) || c.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(c.GetString()))
                            throw new InvalidDataException(at + ".category must be a non-empty string");
                        if (!r.TryGetProperty("DD", out var dd) || dd.ValueKind != JsonValueKind.Object) throw new InvalidDataException(at + ".DD must be an object");
                        var keys = new List<string>();
                        var props = new List<string>();
                        foreach (var kv in dd.EnumerateObject())
```

with

```csharp
                        string at = "rows[" + i++ + "]";
                        if (r.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                        foreach (var p in r.EnumerateObject())
                            if (p.Name != "category" && p.Name != "DD")
                                throw Bad(at + "." + p.Name, "is not a row field — a row is {category, DD} (Promote checks the DD stage only; stage_map names the others)");
                        string cat = r.TryGetProperty("category", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
                        if (cat == null || Array.IndexOf(Order, cat) < 0) throw Bad(at + ".category", "must be " + string.Join(" | ", Order));
                        if (mx.Dd.ContainsKey(cat)) throw Bad(at + ".category", "appears twice — one row per class");
                        if (!r.TryGetProperty("DD", out var dd) || dd.ValueKind != JsonValueKind.Object) throw Bad(at + ".DD", "must be an object");
                        var keys = new List<string>();
                        var props = new List<string>();
                        int snap = 0;
                        foreach (var kv in dd.EnumerateObject())
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                            {
                                if (kv.Value.ValueKind != JsonValueKind.Array || kv.Value.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String))
                                    throw new InvalidDataException(at + ".DD.properties must be an array of strings");
                                props.AddRange(kv.Value.EnumerateArray().Select(x => x.GetString()));
                            }
                            else if (kv.Value.ValueKind != JsonValueKind.String) throw new InvalidDataException(at + ".DD." + kv.Name + " must be a string");
                            else keys.Add(kv.Name + "=" + kv.Value.GetString());
                        }
                        keys.Sort(StringComparer.Ordinal);
                        mx.Dd[c.GetString()] = string.Join("; ", keys);
                        mx.Properties[c.GetString()] = props;
                    }
```

with

```csharp
                            {
                                if (kv.Value.ValueKind != JsonValueKind.Array || kv.Value.EnumerateArray().Any(x => !Filled(x)))
                                    throw Bad(at + ".DD.properties", "must be an array of non-empty strings");
                                props.AddRange(kv.Value.EnumerateArray().Select(x => x.GetString()));
                            }
                            else if (kv.Name == "type_snap_mm")
                            {
                                if (!(kv.Value.ValueKind == JsonValueKind.Number && kv.Value.TryGetDouble(out var v) && v == Math.Floor(v) && v >= 0 && v <= MaxSnapMm))
                                    throw Bad(at + ".DD.type_snap_mm", $"must be a whole number of millimetres, 0 to {MaxSnapMm} (D16: 0 keeps the exact match)");
                                snap = (int)kv.Value.GetDouble();
                                if (snap > 0 && (cat == "Doors" || cat == "Windows"))
                                    throw Bad(at + ".DD.type_snap_mm", $"must be 0 for {cat} — a door or window is matched by its type name's W x H, never snapped");
                            }
                            else if (!DdRules.TryGetValue(kv.Name, out var want))
                                throw Bad(at + ".DD." + kv.Name, "is not a DD rule Promote reads — " + string.Join(", ", DdRules.Keys.Concat(new[] { "properties", "type_snap_mm" })));
                            else if (kv.Value.ValueKind != JsonValueKind.String || kv.Value.GetString() != want)
                                throw Bad(at + ".DD." + kv.Name, "must be " + want);
                            else keys.Add(kv.Name + "=" + want);
                        }
                        if (!keys.Any(k => k.StartsWith("type=", StringComparison.Ordinal))) throw Bad(at + ".DD.type", "is required — DD means typed by a guideline rule");
                        keys.Sort(StringComparer.Ordinal);
                        mx.Dd[cat] = string.Join("; ", keys);
                        mx.Properties[cat] = props;
                        mx.SnapMm[cat] = snap;
                    }
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
            catch (Exception ex) { error = ex.Message; return null; }
        }

        /// <summary>The classes Promote runs, in <see cref="Order"/>; each class left out gets its reason in <paramref name="notRun"/>.
```

with

```csharp
            catch (Exception ex) { error = ex.Message; return null; }
        }

        private static InvalidDataException Bad(string path, string want) => new InvalidDataException(path + " " + want);
        // Optional = absent or null, as the bridge reads it.
        private static bool Present(JsonElement o, string name, out JsonElement v) => o.TryGetProperty(name, out v) && v.ValueKind != JsonValueKind.Null;
        // Blank as the bridge's filled() reads it: a string with a character that is not white space.
        private static bool Filled(JsonElement v) => v.ValueKind == JsonValueKind.String && v.GetString().Any(ch => !char.IsWhiteSpace(ch) && ch != '﻿');

        /// <summary>The classes Promote runs, in <see cref="Order"/>; each class left out gets its reason in <paramref name="notRun"/>.
```

- [ ] **Step 4: Run it, and see it pass.** `promote-check` — `573/573`, with "every shared lod_matrix case (24/24): the same answer and the same words as the TS reader". Both builds: Revit 2024 `0 Error(s)`, `5 Warning(s)`; Revit 2026 `0 Error(s)`, `3 Warning(s)`.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/PromotePlanner.cs tools/promote-check/LodMatrixChecks.cs tools/promote-check/Check.cs tools/promote-check/Classes.cs
git commit -F - <<'EOF'
feat(lod_matrix): LodMatrix.FromBody is parseLodMatrix's twin - the stage map and the snap, the same words, held by the shared cases in promote-check (MA-2b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 3 — The snap (D16): Promote snaps within the matrix's limit, the bridge holds it to the matrix, the executor moves a face by the filed snap only

**Files:**
- Create `tools/promote-check/SnapChecks.cs`; modify `tools/promote-check/Check.cs`, `tools/promote-check/Ma2aWiring.cs` (the executor's sentence now names a filed snap)
- Modify `WebApp/bridge/changesets-logic.test.mjs`, `WebApp/bridge/changesets-store.test.mjs`
- Modify `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, `SentinelAddin/GhostBuilder/PromotePlanner.cs` — the snap in both planners, the body's `snap`
- Modify `WebApp/bridge/changesets-logic.mjs`, `WebApp/bridge/changesets-store.mjs` — `checkSnap`, `snapLimitFor`
- Modify `SentinelAddin/Coordination/ChangesetClient.cs` (`SnapDto`), `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` (`Unsafe`), `SentinelAddin/Commands.PromoteWalls.cs` (the preflight and the planner call)

**Interfaces:** `PromoteGhost.SnapFromMm`, `SnapToMm` (`double?`). `PromoteWallsPlanner.Plan(…, m, IReadOnlyDictionary<string, int> snapMm = null)`; `PromotePlanner.Plan(…, m, IReadOnlyDictionary<string, int> snapMm = null)`; `PromotePlanner.SnapTo(GuidelineResolution res, double mm, int limitMm): double?`; `PromotePlanner.SnapWords(double fromMm, double? toMm, int limitMm)` → `" — snapped 12 mm (type_snap_mm 15, D16): each face moves up to 6 mm"`. The body: `snap: {from_mm, to_mm}` on a snapped retype only. The bridge: `validateChangeset(body, {member, type, snapLimit})` — `snapLimit(kind) → {limit_mm, matrix}`; the stored element's `snap: {from_mm, to_mm, by_mm, limit_mm, matrix}`; the refusals `"<at>: snap rides on a wall's, floor's, roof's or ceiling's retype only — {from_mm, to_mm}"`, `"<at>: snap.<k> is not a snap field — {from_mm, to_mm}"`, `"<at>: snap.from_mm and snap.to_mm are millimetres, 1 to 10000"`, `"<at>: a <by> mm snap is more than <matrix> allows for <Category> (type_snap_mm <n>) — snapping is the office's decision (D16); send the exact type"`. The add-in: `ChangesetElementDto.Snap` (`SnapDto {FromMm, ToMm, LimitMm, Matrix}`); `ChangesetExecutor.Unsafe(e, kind, cur, nt, double? snapFromMm = null, double? snapToMm = null)`.

- [ ] **Step 1: The failing checks.**

`Create` `tools/promote-check/SnapChecks.cs`:

```csharp
#nullable disable
using System.Text.Json.Nodes;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 29. MA-2b (D16): type_snap_mm — 0 keeps the exact match (a 212 mm wall is a gap); a matrix's limit snaps it to the
    //        catalogue's nearest size within the limit, says so on the reason, and posts the snap on the element ─────────────
    static void SnapChecks(GuidelineMatcher m, GuidelineMatcher m2)
    {
        Console.WriteLine("\nMA-2b — type_snap_mm (D16): exact by default, a snap only within the matrix's limit");
        PromoteGhost G(List<StoreyPlan> ps, string label) => ps.SelectMany(p => p.Ghosts).FirstOrDefault(g => g.Label == label && g.Op == "retype");
        string H(List<StoreyPlan> ps, string label) => ps.SelectMany(p => p.Held).FirstOrDefault(h => h.Label == label)?.Reason;
        var snap15 = new Dictionary<string, int> { ["Walls"] = 15, ["Floors"] = 15 };
        List<StoreyPlan> Walls(IReadOnlyDictionary<string, int> snap, params WallFact[] ws) => PromoteWallsPlanner.Plan(ws.ToList(), Levels, DocTypes, m, snap);

        var exact = Walls(null, W("S212", "Generic - 212mm", "Exterior", 212));
        Ok(G(exact, "S212") == null && H(exact, "S212")?.StartsWith("gap: S212 (Generic - 212mm, Function Exterior) — \"BDS_EXT_ARC_CMU_212 mm\" is not in") == true,
           "type_snap_mm 0 (no matrix, or its default): a 212 mm wall stays a gap with the sizes the catalogue has — today's exact match");
        var snapped = Walls(snap15, W("S212", "Generic - 212mm", "Exterior", 212));
        var g = G(snapped, "S212");
        Ok(g?.TypeName == "BDS_EXT_ARC_CMU_200 mm" && g.SnapFromMm == 212 && g.SnapToMm == 200
           && g.Reason == "DD walls v0: Function Exterior, 212 mm → BDS_EXT_ARC_CMU_200 mm — snapped 12 mm (type_snap_mm 15, D16): each face moves up to 6 mm",
           "type_snap_mm 15: the 212 mm wall snaps to BDS_EXT_ARC_CMU_200 mm, and its reason says by how much and why");
        Ok(G(Walls(new Dictionary<string, int> { ["Walls"] = 10 }, W("S212", "Generic - 212mm", "Exterior", 212)), "S212") == null,
           "type_snap_mm 10: 12 mm is beyond the limit — the gap it was");
        var tie = G(Walls(new Dictionary<string, int> { ["Walls"] = 50 }, W("S250", "Generic - 250mm", "Exterior", 250)), "S250");
        Ok(tie?.TypeName == "BDS_EXT_ARC_CMU_200 mm" && tie.SnapToMm == 200, "a tie (250 mm between 200 and 300 within 50) takes the smaller size");
        var frac = W("S199", "Generic - 200mm", "Exterior", 199.4);
        Ok(H(Walls(null, frac), "S199")?.Contains("is not a whole millimetre — exact match only (D16)") == true
           && G(Walls(snap15, frac), "S199")?.SnapToMm == 200, "a width that is not a whole millimetre is held when exact, and snaps within a limit");
        var floors = PromotePlanner.Plan(new[] { "Floors" }, new List<WallFact>(), new List<ElementFact> { Fl("F290", "Generic 290mm", "Interior", 290) },
                                         Levels, DocTypes, V1Types(), m2, snap15);
        var f = G(floors, "F290");
        Ok(f?.TypeName == "BDS_INT_STR_CONC_300 mm" && f.SnapFromMm == 290 && f.SnapToMm == 300 && f.Reason.EndsWith("— snapped 10 mm (type_snap_mm 15, D16): each face moves up to 5 mm"),
           "a floor snaps the same way (290 → BDS_INT_STR_CONC_300 mm), its build-up checked against the size it snaps to");
        var body = Json(PromoteWallsPlanner.Bodies(snapped, "yazan")).Single();
        var els = body["elements"].AsArray();
        Ok(els.Count == 2 && els[0]["snap"]?.ToJsonString() == "{\"from_mm\":212,\"to_mm\":200}" && els[1]["snap"] == null,
           "the body: the snapped retype carries snap {from_mm, to_mm}; the attach carries none (an exact retype neither — promote-body.json is unchanged)");

        // The stored element the add-in reads back (the bridge adds by_mm, limit_mm and the matrix that allowed it).
        var stored = System.Text.Json.JsonSerializer.Deserialize<Sentinel.Coordination.ChangesetElementDto>(
            "{\"op\":\"retype\",\"kind\":\"wall\",\"snap\":{\"from_mm\":212,\"to_mm\":200,\"by_mm\":12,\"limit_mm\":15,\"matrix\":\"lod_matrix@2 · office · abababababab…\"}}");
        Ok(stored.Snap?.FromMm == 212 && stored.Snap.ToMm == 200 && stored.Snap.LimitMm == 15 && stored.Snap.Matrix.StartsWith("lod_matrix@2"),
           "ChangesetElementDto reads the stored snap: from, to, the limit and the matrix that allowed it");
        string exec = File.ReadAllText(Repo("SentinelAddin", "GhostBuilder", "ChangesetExecutor.cs"));
        string cmd = File.ReadAllText(Repo("SentinelAddin", "Commands.PromoteWalls.cs"));
        Ok(exec.Contains("var no = Unsafe(e, el.Kind, cur, nt, el.Snap?.FromMm, el.Snap?.ToMm);")
           && exec.Contains("bool Snapped(double wasFt, double nowFt) => snapFromMm.HasValue && snapToMm.HasValue")
           && cmd.Contains("ChangesetExecutor.Unsafe(e, g.Kind ?? \"wall\", doc.GetElement(e.GetTypeId()) as ElementType, nt, g.SnapFromMm, g.SnapToMm)")
           && cmd.Contains("standards.Guideline, mx?.SnapMm);"),
           "source scan: the executor and Promote's preflight let a face move by the filed snap only — the wall's thickness and the target's both as filed");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        LodMatrixParityChecks();
```

with

```csharp
        LodMatrixParityChecks();
        SnapChecks(m, m2);
```

In `tools/promote-check/Ma2aWiring.cs`, replace

```csharp
           && executor.Contains("mm — a retype would move a face; a person decides\";"),
```

with

```csharp
           && executor.Contains("mm — a retype would move a face{Filed()}; a person decides\";"), // MA-2b: the words name a filed snap
```

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
    status400(() => validateChangeset(design, { type: makeTyper(standards, core) }), /no rule of guideline@1 · office · 0123456789ab… matches a wall with no facts/);
  });
});
```

with

```js
    status400(() => validateChangeset(design, { type: makeTyper(standards, core) }), /no rule of guideline@1 · office · 0123456789ab… matches a wall with no facts/);
  });
});

// MA-2b (D16): a retype the matrix's type_snap_mm snapped says so in `snap`; the bridge holds it to the project's lod_matrix@n
// (the snapLimit the store reads) and never pre-ticks it — a snap moves the wall's faces.
describe("validateChangeset — a snapped retype (MA-2b, D16)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f9";
  const snapped = (snap = { from_mm: 212, to_mm: 200 }, over = {}) => ({
    name: "Promote (DD) · Level 1", source: "promote",
    elements: [{
      op: "retype", kind: "wall", target: { unique_id: UID, type_before: "Generic - 212mm" }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
      validate: { identity: { Class: "IfcWall", Name: "W 1" } }, snap, ...over,
    }],
  });
  const limit = (mm) => () => ({ limit_mm: mm, matrix: "lod_matrix@2 · office · abababababab…" });
  const status400 = (f, re) => { try { f(); } catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(re); return; } throw new Error("no 400"); };

  it("within the matrix's limit: kept with the limit and the matrix that allowed it, and never pre-ticked (even a member's Promote retype)", () => {
    const el = validateChangeset(snapped(), { member: true, snapLimit: limit(15) }).elements[0];
    expect(el.snap).toEqual({ from_mm: 212, to_mm: 200, by_mm: 12, limit_mm: 15, matrix: "lod_matrix@2 · office · abababababab…" });
    expect(el.pretick).toBe(false);
    expect(validateChangeset(snapped(null), { member: true }).elements[0]).toMatchObject({ pretick: true }); // the same retype, exact
    expect(validateChangeset(snapped(null), { member: true }).elements[0]).not.toHaveProperty("snap");
  });
  it("beyond the limit, or with no matrix that allows one, is refused in words (D16: the office's decision)", () => {
    status400(() => validateChangeset(snapped(), { snapLimit: limit(10) }),
      /elements\[0\]: a 12 mm snap is more than lod_matrix@2 · office · abababababab… allows for Walls \(type_snap_mm 10\) — snapping is the office's decision \(D16\); send the exact type/);
    status400(() => validateChangeset(snapped()), /a 12 mm snap is more than no lod_matrix@n allows for Walls \(type_snap_mm 0\)/);
  });
  it("a snap rides on a wall's, floor's, roof's or ceiling's retype only, as {from_mm, to_mm}", () => {
    status400(() => validateChangeset(snapped({ from_mm: 212, to_mm: 200 }, { op: "attach", place: { BaseLevel: "L1", TopLevel: "L2" } }), { snapLimit: limit(15) }),
      /elements\[0\]: snap rides on a wall's, floor's, roof's or ceiling's retype only — \{from_mm, to_mm\}/);
    status400(() => validateChangeset(snapped({ from_mm: 212, to_mm: 200, limit_mm: 50 }), { snapLimit: limit(15) }), /snap\.limit_mm is not a snap field — \{from_mm, to_mm\}/);
    status400(() => validateChangeset(snapped({ from_mm: "212", to_mm: 200 }), { snapLimit: limit(15) }), /snap\.from_mm and snap\.to_mm are millimetres, 1 to 10000/);
  });
});
```

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
describe("result + withdraw lifecycle", () => {
```

with

```js
// MA-2b (D16): a snapped retype is held to the project's lod_matrix@n (project → office), read only when a post carries a snap.
describe("proposeChangeset — a snapped retype (MA-2b, D16)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3fa";
  const body = { name: "Promote (DD) · Level 1", source: "promote", elements: [{
    op: "retype", kind: "wall", target: { unique_id: UID, type_before: "Generic - 212mm" }, place: { TypeName: "BDS_EXT_ARC_CMU_200 mm" },
    validate: { identity: { Class: "IfcWall", Name: "W 1" } }, snap: { from_mm: 212, to_mm: 200 } }] };
  const matrix = (snap) => { const m = readRepo("demo/bds-pilot/bds-lod-matrix-dd.json"); m.rows[0].DD.type_snap_mm = snap; return m; };
  const resolving = (m) => vi.fn(async (key, kind) => (kind === "lod_matrix" && m ? installed(kind, m) : NONE));

  it("reads the project's lod_matrix@n and stores the snap with the limit that allowed it, unticked", async () => {
    const deps = baseDeps({ resolveArtefact: resolving(matrix(15)) });
    const cs = await proposeChangeset("ma2b", body, "agent", deps);
    expect(deps.resolveArtefact.mock.calls.map((c) => c.slice(0, 2))).toEqual([["ma2b", "lod_matrix"]]);
    expect(cs.elements[0]).toMatchObject({ pretick: false, snap: { from_mm: 212, to_mm: 200, by_mm: 12, limit_mm: 15, matrix: "lod_matrix@1 · office · abababababab…" } });
  });
  it("a matrix with snap 0 (the default), or none installed, refuses it in words; a post with no snap reads no matrix", async () => {
    await expect(proposeChangeset("ma2b", body, "agent", baseDeps({ resolveArtefact: resolving(matrix(0)) })))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining("a 12 mm snap is more than lod_matrix@1 · office · abababababab… allows for Walls (type_snap_mm 0)") });
    await expect(proposeChangeset("ma2b", body, "agent", baseDeps({ resolveArtefact: resolving(null) })))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining("more than none — not installed for ma2b or its office allows for Walls") });
    const deps = baseDeps({ resolveArtefact: resolving(matrix(15)) });
    await proposeChangeset("ma2b", BODY, "agent", deps);
    expect(deps.resolveArtefact).not.toHaveBeenCalled();
  });
});

describe("result + withdraw lifecycle", () => {
```

- [ ] **Step 2: Run them, and see them fail.** `dotnet run --project tools/promote-check` fails to compile — `12 Error(s)`: `'PromoteGhost' does not contain a definition for 'SnapToMm'` / `'SnapFromMm'`, `'ChangesetElementDto' does not contain a definition for 'Snap'`, `No overload for method 'Plan' takes 8 arguments` / `5 arguments`. From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs` — `Test Files  2 failed (2)`, `Tests  5 failed | 122 passed (127)` (a `snap` is not kept, so nothing is refused and the stored element has none).

- [ ] **Step 3: The snap in the planners, the bridge and the executor.**

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        /// <summary>A retype whose target's Function in this model disagrees with the wall's side as the rule decided it (the
        /// Location it matched; else, on a mixed storey, the wall's Function): "&lt;target&gt; is Function &lt;X&gt; in this
        /// model" (also the Reason's tail) — the office's template to fix. Null otherwise; never posted.</summary>
        public string Note;
    }
```

with

```csharp
        /// <summary>A retype whose target's Function in this model disagrees with the wall's side as the rule decided it (the
        /// Location it matched; else, on a mixed storey, the wall's Function): "&lt;target&gt; is Function &lt;X&gt; in this
        /// model" (also the Reason's tail) — the office's template to fix. Null otherwise; never posted.</summary>
        public string Note;
        /// <summary>MA-2b (D16): a retype the matrix's type_snap_mm snapped — the element's thickness and the target's named
        /// thickness. Null = an exact retype. Posted as the element's `snap`; the bridge holds it to the project's lod_matrix@n and
        /// never pre-ticks it, and the executor lets the faces move by exactly this much.</summary>
        public double? SnapFromMm, SnapToMm;
    }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        /// <param name="docBasicWallTypes">The document's basic wall types: name (case-insensitive) → the type's Function.</param>
        public static List<StoreyPlan> Plan(IReadOnlyList<WallFact> walls, IReadOnlyList<LevelFact> levels,
                                            IReadOnlyDictionary<string, string> docBasicWallTypes, GuidelineMatcher m)
        {
```

with

```csharp
        /// <param name="docBasicWallTypes">The document's basic wall types: name (case-insensitive) → the type's Function.</param>
        /// <param name="snapMm">MA-2b: the matrix's type_snap_mm by category (LodMatrix.SnapMm); null or 0 = the exact match (D16).</param>
        public static List<StoreyPlan> Plan(IReadOnlyList<WallFact> walls, IReadOnlyList<LevelFact> levels,
                                            IReadOnlyDictionary<string, string> docBasicWallTypes, GuidelineMatcher m,
                                            IReadOnlyDictionary<string, int> snapMm = null)
        {
            int snap = snapMm != null && snapMm.TryGetValue("Walls", out var sw) ? sw : 0;
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                    else if (Math.Abs(w.WidthMm - Math.Round(w.WidthMm)) > 0.001)
                        Hold($"width {Mm(w.WidthMm, "0.###")} mm is not a whole millimetre — exact match only (D16)");
```

with

```csharp
                    else if (snap == 0 && Math.Abs(w.WidthMm - Math.Round(w.WidthMm)) > 0.001)
                        Hold($"width {Mm(w.WidthMm, "0.###")} mm is not a whole millimetre — exact match only (D16)");
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                            var res = m.Resolve(new GuidelineInput { Category = "Walls", Params = ps, ThicknessMm = w.WidthMm });
                            string used = What(ps, res.Matched);
```

with

```csharp
                            var res = m.Resolve(new GuidelineInput { Category = "Walls", Params = ps, ThicknessMm = w.WidthMm });
                            string used = What(ps, res.Matched);
                            // MA-2b (D16): a size the catalogue lacks snaps to its nearest size within the matrix's limit, or stays a gap.
                            double? snapTo = PromotePlanner.SnapTo(res, w.WidthMm, snap);
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                                    retypes.Add(new PromoteGhost
                                    {
                                        Op = "retype", UniqueId = w.UniqueId, Label = w.Label, TypeBefore = w.TypeName, TypeName = res.Type,
                                        Reason = $"DD walls v0: {used}, {Mm(w.WidthMm, "0")} mm → {res.Type}" + (note == null ? "" : " — note: " + note),
                                        Note = note,
                                    });
```

with

```csharp
                                    retypes.Add(new PromoteGhost
                                    {
                                        Op = "retype", UniqueId = w.UniqueId, Label = w.Label, TypeBefore = w.TypeName, TypeName = res.Type,
                                        Reason = $"DD walls v0: {used}, {Mm(w.WidthMm, "0")} mm → {res.Type}" + PromotePlanner.SnapWords(w.WidthMm, snapTo, snap)
                                                 + (note == null ? "" : " — note: " + note),
                                        Note = note,
                                        SnapFromMm = snapTo == null ? (double?)null : w.WidthMm, SnapToMm = snapTo,
                                    });
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
            reason = Clip(g.Reason, 500),
            validate = new { identity = new { Class = Classes[g.Kind ?? "wall"].Ifc, Name = g.Label } },
        };
```

with

```csharp
            reason = Clip(g.Reason, 500),
            validate = new { identity = new { Class = Classes[g.Kind ?? "wall"].Ifc, Name = g.Label } },
            // MA-2b (D16): a snapped retype says so; the bridge checks it against the project's lod_matrix@n and never pre-ticks it.
            snap = g.SnapToMm == null ? null : (object)new { from_mm = Math.Round(g.SnapFromMm.Value, 1), to_mm = g.SnapToMm.Value },
        };
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
        public static List<StoreyPlan> Plan(IReadOnlyCollection<string> classes, IReadOnlyList<WallFact> walls, IReadOnlyList<ElementFact> others,
            IReadOnlyList<LevelFact> levels, IReadOnlyDictionary<string, string> docBasicWallTypes,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m)
        {
            // The walls are planned even when Walls do not run: a door's location reads its host storey's one-type verdict.
            var wallPlans = PromoteWallsPlanner.Plan(walls ?? new List<WallFact>(), levels, docBasicWallTypes, m);
```

with

```csharp
        /// <param name="snapMm">MA-2b: the matrix's type_snap_mm by category (LodMatrix.SnapMm); null = every class exact (D16).</param>
        public static List<StoreyPlan> Plan(IReadOnlyCollection<string> classes, IReadOnlyList<WallFact> walls, IReadOnlyList<ElementFact> others,
            IReadOnlyList<LevelFact> levels, IReadOnlyDictionary<string, string> docBasicWallTypes,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m,
            IReadOnlyDictionary<string, int> snapMm = null)
        {
            // The walls are planned even when Walls do not run: a door's location reads its host storey's one-type verdict.
            var wallPlans = PromoteWallsPlanner.Plan(walls ?? new List<WallFact>(), levels, docBasicWallTypes, m, snapMm);
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                var reason = Plan1(e, cls.Category, cls.Word.ToLowerInvariant(), level, oneType, office, docTypes, m, c, out var g);
```

with

```csharp
                int snap = snapMm != null && snapMm.TryGetValue(cls.Category, out var sn) ? sn : 0;
                var reason = Plan1(e, cls.Category, cls.Word.ToLowerInvariant(), level, oneType, office, docTypes, m, c, snap, out var g);
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
        private static string Plan1(ElementFact e, string cat, string word, LevelFact level, ISet<string> oneType, string office,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, ClassCount c, out PromoteGhost g)
```

with

```csharp
        private static string Plan1(ElementFact e, string cat, string word, LevelFact level, ISet<string> oneType, string office,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, ClassCount c, int snap, out PromoteGhost g)
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
            var t = e.ThicknessMm;
            if (t.HasValue && !Whole(t.Value)) return $"thickness {Mm(t.Value, "0.###")} mm is not a whole millimetre — exact match only (D16)";
```

with

```csharp
            return family ? Swap(e, cat, oneType, office, docTypes, m, out g) : Retype(e, cat, word, docTypes, m, snap, out g);
        }

        /// <summary>MA-2b (D16): the named thickness a resolution snaps to — of the catalogue's sizes for the rule's pattern
        /// (<see cref="GuidelineResolution.Available"/>, which the matcher lists for a size the catalogue lacks), the one nearest
        /// <paramref name="mm"/> within <paramref name="limitMm"/> (a tie: the smaller size); the resolution then names that type
        /// at confidence 1. Null — the gap it was — when the limit is 0, the rule answered exactly, or no size is that near.</summary>
        public static double? SnapTo(GuidelineResolution res, double mm, int limitMm)
        {
            if (limitMm <= 0 || res == null || res.Source != "rule" || res.Confidence != 0 || res.Available == null) return null;
            var near = res.Available.Select(t => (Type: t, Mm: TypeNameParse.ThicknessMm(t)))
                .Where(x => Math.Abs(x.Mm - mm) <= limitMm + 0.001)
                .OrderBy(x => Math.Abs(x.Mm - mm)).ThenBy(x => x.Mm).ToList();
            if (near.Count == 0) return null;
            res.Type = near[0].Type;
            res.Confidence = 1;
            res.Why = $"snapped to the catalogue's nearest size within type_snap_mm {limitMm} (D16)";
            return near[0].Mm;
        }

        /// <summary>A snapped retype's words on its reason: " — snapped 12 mm (type_snap_mm 15, D16): each face moves up to 6 mm".</summary>
        public static string SnapWords(double fromMm, double? toMm, int limitMm) => toMm == null ? ""
            : $" — snapped {Mm(Math.Abs(fromMm - toMm.Value), "0.#")} mm (type_snap_mm {limitMm}, D16): each face moves up to {Mm(Math.Abs(fromMm - toMm.Value) / 2, "0.#")} mm";

        // Floors, roofs, ceilings: the DD rule's type at this element's thickness, loaded here with that same build-up.
        private static string Retype(ElementFact e, string cat, string word,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, int snap, out PromoteGhost g)
        {
            g = null;
            var t = e.ThicknessMm;
            if (snap == 0 && t.HasValue && !Whole(t.Value)) return $"thickness {Mm(t.Value, "0.###")} mm is not a whole millimetre — exact match only (D16)";
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
            var res = m.Resolve(new GuidelineInput { Category = cat, Params = ps, ThicknessMm = t });
            if (res.Source != "rule") return $"no DD rule for {what} in {m.Standard}";
            if (string.IsNullOrWhiteSpace(res.Type)) return "no build-up thickness to fill the DD rule's type — a person decides";
            if (res.Confidence != 1) return m.Gap($"{e.Label} ({e.TypeName}, {what}{size})", res.Why);
            IReadOnlyDictionary<string, double?> types = null;
            if (docTypes == null || !docTypes.TryGetValue(cat, out types) || types == null || !types.TryGetValue(res.Type, out var build))
                return $"\"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types";
            // The harvest never recorded a floor's build-up: the name alone is unverified, and a retype must never move a face.
            if (t.HasValue && !(build.HasValue && Math.Abs(build.Value - t.Value) <= TolMm))
                return $"\"{res.Type}\" {(build.HasValue ? "is " + Mm(build.Value, "0.#") + " mm thick" : "has no build-up")} in this model, " +
                       $"the {word} is {Mm(t.Value, "0")} mm — a retype would move a face; a person decides";
            g = new PromoteGhost
            {
                Op = "retype", Kind = e.Kind, UniqueId = e.UniqueId, Label = e.Label, TypeBefore = e.TypeName, TypeName = res.Type,
                Reason = $"DD {cat.ToLowerInvariant()}: {what}{size} → {res.Type}",
            };
            return null;
        }
```

with

```csharp
            var res = m.Resolve(new GuidelineInput { Category = cat, Params = ps, ThicknessMm = t });
            if (res.Source != "rule") return $"no DD rule for {what} in {m.Standard}";
            if (string.IsNullOrWhiteSpace(res.Type)) return "no build-up thickness to fill the DD rule's type — a person decides";
            double? snapTo = t.HasValue ? SnapTo(res, t.Value, snap) : null; // MA-2b (D16)
            if (res.Confidence != 1) return m.Gap($"{e.Label} ({e.TypeName}, {what}{size})", res.Why);
            IReadOnlyDictionary<string, double?> types = null;
            if (docTypes == null || !docTypes.TryGetValue(cat, out types) || types == null || !types.TryGetValue(res.Type, out var build))
                return $"\"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types";
            // The harvest never recorded a floor's build-up: the name alone is unverified, and a retype must never move a face —
            // a snapped one only by its snap (the target's build-up is its named size).
            if (t.HasValue && !(build.HasValue && Math.Abs(build.Value - (snapTo ?? t.Value)) <= TolMm))
                return $"\"{res.Type}\" {(build.HasValue ? "is " + Mm(build.Value, "0.#") + " mm thick" : "has no build-up")} in this model, " +
                       $"the {word} is {Mm(t.Value, "0")} mm — a retype would move a face; a person decides";
            g = new PromoteGhost
            {
                Op = "retype", Kind = e.Kind, UniqueId = e.UniqueId, Label = e.Label, TypeBefore = e.TypeName, TypeName = res.Type,
                Reason = $"DD {cat.ToLowerInvariant()}: {what}{size} → {res.Type}" + SnapWords(t ?? 0, snapTo, snap),
                SnapFromMm = snapTo == null ? (double?)null : t, SnapToMm = snapTo,
            };
            return null;
        }
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
import { checkFacts } from "./changesets-typing.mjs";
```

with

```js
import { checkFacts, KIND_CATEGORY } from "./changesets-typing.mjs";
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence", "facts"]; // what an element is rebuilt from
```

with

```js
// MA-2b (D16): `snap` — a retype the matrix's type_snap_mm snapped ({from_mm, to_mm}), held to the project's lod_matrix@n.
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence", "facts", "snap"]; // what an element is rebuilt from
const SNAP_KINDS = ["wall", "floor", "roof", "ceiling"]; // sized by a thickness; a door or window is never snapped (lod_matrix)
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
 *  Every element carries `typing` ({typed_by: "caller"} for one that named its type); a bridge-typed one is never pre-ticked. */
export function validateChangeset(body, { member = false, type = null } = {}) {
```

with

```js
 *  Every element carries `typing` ({typed_by: "caller"} for one that named its type); a bridge-typed one is never pre-ticked.
 *  MA-2b (D16): with `snapLimit` — kind → {limit_mm, matrix}, the project's lod_matrix@n as the store read it — a retype's
 *  `snap` is kept within that limit, or refused; without one any snap is refused. A snapped element is never pre-ticked. */
export function validateChangeset(body, { member = false, type = null, snapLimit = null } = {}) {
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
    const facts = checkFacts(el.facts, at);
    if (facts && op === "attach") throw err(400, `${at}: attach takes no facts — nothing is typed`);
```

with

```js
    const facts = checkFacts(el.facts, at);
    if (facts && op === "attach") throw err(400, `${at}: attach takes no facts — nothing is typed`);
    const snap = checkSnap(el.snap, op, el.kind, at, snapLimit);
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
      ...(facts ? { facts } : {}),
      typing: typed ? typed.typing : { typed_by: "caller" },
```

with

```js
      ...(facts ? { facts } : {}),
      typing: typed ? typed.typing : { typed_by: "caller" },
      ...(snap ? { snap } : {}), // MA-2b: only on a snapped retype, so every other element reads as before
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
      pretick: typed ? false : pretickOf(op, source, target, member),
```

with

```js
      pretick: typed || snap ? false : pretickOf(op, source, target, member),
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
/** MA-1a item 4: where an element came from, as its placer knows it — the CAD layer, the rule that typed it and the source
```

with

```js
/** MA-2b (D16): a retype's snap — {from_mm, to_mm}, the element's thickness and the size it snapped to — checked against
 *  `limitOf(kind)` (the project's lod_matrix@n: {limit_mm, matrix}) → the stored record {from_mm, to_mm, by_mm, limit_mm,
 *  matrix}, or null when none was posted. A 400 in words when it is not a thickness kind's retype, or more than the limit. */
function checkSnap(s, op, kind, at, limitOf) {
  if (s == null) return null;
  if (typeof s !== "object" || Array.isArray(s) || op !== "retype" || !SNAP_KINDS.includes(kind))
    throw err(400, `${at}: snap rides on a wall's, floor's, roof's or ceiling's retype only — {from_mm, to_mm}`);
  const stray = Object.keys(s).find((k) => k !== "from_mm" && k !== "to_mm");
  if (stray !== undefined) throw err(400, `${at}: snap.${stray} is not a snap field — {from_mm, to_mm}`);
  if (!inRange(s.from_mm, 1, 10000) || !inRange(s.to_mm, 1, 10000)) throw err(400, `${at}: snap.from_mm and snap.to_mm are millimetres, 1 to 10000`);
  const by = Math.round(Math.abs(s.from_mm - s.to_mm) * 10) / 10;
  const lim = limitOf ? limitOf(kind) : { limit_mm: 0, matrix: "no lod_matrix@n" };
  if (by > lim.limit_mm)
    throw err(400, `${at}: a ${by} mm snap is more than ${lim.matrix} allows for ${KIND_CATEGORY[kind]} (type_snap_mm ${lim.limit_mm}) — snapping is the office's decision (D16); send the exact type`);
  return { from_mm: s.from_mm, to_mm: s.to_mm, by_mm: by, limit_mm: lim.limit_mm, matrix: lim.matrix };
}

/** MA-1a item 4: where an element came from, as its placer knows it — the CAD layer, the rule that typed it and the source
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
import { makeTyper } from "./changesets-typing.mjs";
```

with

```js
import { makeTyper, KIND_CATEGORY } from "./changesets-typing.mjs";
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
export async function proposeChangeset(key, body, actor, deps) {
```

with

```js
/** MA-2b (D16): the snap limit of `key` — its lod_matrix@n (project → office), read by the one parser — as kind → {limit_mm, matrix}.
 *  None installed, or one that does not parse, allows no snap (limit 0) and is named in the refusal. */
async function snapLimitFor(key, d) {
  const core = await import("./sentinel-core.mjs");
  const a = await d.resolveArtefact(key, "lod_matrix");
  let m = null, matrix = `none — not installed for ${key} or its office`;
  if (a.source !== "none") {
    try { m = core.parseLodMatrix(a.body); matrix = refLabel(a); } catch (e) { matrix = `none — ${refLabel(a)} did not parse: ${e.message}`; }
  }
  return (kind) => ({ limit_mm: m?.rows.find((r) => r.category === KIND_CATEGORY[kind])?.type_snap_mm ?? 0, matrix });
}

export async function proposeChangeset(key, body, actor, deps) {
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  const type = needsTyping(body) ? await typerFor(key, d) : null;
  const v = validateChangeset(body, { member: role != null && role !== "service", type }); // 400/413 before any changeset is stored
```

with

```js
  const type = needsTyping(body) ? await typerFor(key, d) : null;
  // MA-2b (D16): a snapped retype is held to the project's lod_matrix@n, read only when a post carries a snap.
  const snapLimit = Array.isArray(body?.elements) && body.elements.some((e) => e?.snap != null) ? await snapLimitFor(key, d) : null;
  const v = validateChangeset(body, { member: role != null && role !== "service", type, snapLimit }); // 400/413 before any changeset is stored
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    [JsonPropertyName("typing")] public TypingDto Typing { get; set; }
}
```

with

```csharp
    [JsonPropertyName("typing")] public TypingDto Typing { get; set; }
    /// <summary>MA-2b (D16): a retype the project's lod_matrix@n snapped — held to its type_snap_mm by the bridge; null on an exact
    /// element. The executor lets the faces move by this snap and no more (ChangesetExecutor.Unsafe).</summary>
    [JsonPropertyName("snap")] public SnapDto Snap { get; set; }
}

public sealed class SnapDto
{
    [JsonPropertyName("from_mm")] public double FromMm { get; set; }
    [JsonPropertyName("to_mm")] public double ToMm { get; set; }
    [JsonPropertyName("limit_mm")] public int LimitMm { get; set; }
    /// <summary>The bridge's refLabel of the lod_matrix@n that allowed it.</summary>
    [JsonPropertyName("matrix")] public string Matrix { get; set; }
}
```

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
    internal static string Unsafe(Element e, string kind, ElementType cur, ElementType nt)
    {
        string what = $"{kind} {e.UniqueId}";
```

with

```csharp
    /// MA-2b (D16): a retype the project's lod_matrix@n snapped (<paramref name="snapFromMm"/> → <paramref name="snapToMm"/>, held to its
    /// type_snap_mm by the bridge) may move its faces by that snap and no more: the element must still be the thickness filed, and
    /// the target the size it snapped to.
    internal static string Unsafe(Element e, string kind, ElementType cur, ElementType nt, double? snapFromMm = null, double? snapToMm = null)
    {
        string what = $"{kind} {e.UniqueId}";
        bool Snapped(double wasFt, double nowFt) => snapFromMm.HasValue && snapToMm.HasValue
            && Math.Abs(wasFt - snapFromMm.Value * MmToFeet) <= TolFt && Math.Abs(nowFt - snapToMm.Value * MmToFeet) <= TolFt;
        string Filed() => snapFromMm.HasValue && snapToMm.HasValue ? $" (the snap filed was {Mm(snapFromMm.Value)} → {Mm(snapToMm.Value)} mm)" : "";
```

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
            if (cur is WallType cw && nt is WallType nw && cw.Kind == WallKind.Basic && nw.Kind == WallKind.Basic && Math.Abs(nw.Width - cw.Width) > TolFt)
                return $"\"{nt.Name}\" is {Mm(nw.Width / MmToFeet)} mm thick, {what} is {Mm(cw.Width / MmToFeet)} mm — a retype would move a face; a person decides";
```

with

```csharp
            if (cur is WallType cw && nt is WallType nw && cw.Kind == WallKind.Basic && nw.Kind == WallKind.Basic && Math.Abs(nw.Width - cw.Width) > TolFt
                && !Snapped(cw.Width, nw.Width))
                return $"\"{nt.Name}\" is {Mm(nw.Width / MmToFeet)} mm thick, {what} is {Mm(cw.Width / MmToFeet)} mm — a retype would move a face{Filed()}; a person decides";
```

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
            if (now == null || Math.Abs(now.GetWidth() - was.GetWidth()) > TolFt)
                return $"\"{nt.Name}\" {(now == null ? "has no build-up" : "is " + Mm(now.GetWidth() / MmToFeet) + " mm thick")}, " +
                       $"{what} is {Mm(was.GetWidth() / MmToFeet)} mm — a retype would move a face; a person decides";
```

with

```csharp
            if (now == null || (Math.Abs(now.GetWidth() - was.GetWidth()) > TolFt && !Snapped(was.GetWidth(), now.GetWidth())))
                return $"\"{nt.Name}\" {(now == null ? "has no build-up" : "is " + Mm(now.GetWidth() / MmToFeet) + " mm thick")}, " +
                       $"{what} is {Mm(was.GetWidth() / MmToFeet)} mm — a retype would move a face{Filed()}; a person decides";
```

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
                var no = Unsafe(e, el.Kind, cur, nt);
```

with

```csharp
                var no = Unsafe(e, el.Kind, cur, nt, el.Snap?.FromMm, el.Snap?.ToMm);
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
                return ChangesetExecutor.Unsafe(e, g.Kind ?? "wall", doc.GetElement(e.GetTypeId()) as ElementType, nt)
```

with

```csharp
                return ChangesetExecutor.Unsafe(e, g.Kind ?? "wall", doc.GetElement(e.GetTypeId()) as ElementType, nt, g.SnapFromMm, g.SnapToMm)
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        var plans = PromotePlanner.Plan(classes, walls, others, levels, docTypes, classTypes, standards.Guideline);
```

with

```csharp
        var plans = PromotePlanner.Plan(classes, walls, others, levels, docTypes, classTypes, standards.Guideline, mx?.SnapMm); // MA-2b: the snap (D16)
```

- [ ] **Step 4: Run them, and see them pass.** `promote-check` — `582/582` (the snap's eight checks; MA-2a's executor scan reads the new sentence); vitest — `Test Files  2 passed (2)`, `Tests  127 passed (127)`; `session-check` (compiles `ChangesetClient.cs`) `47/47`; both builds as in Task 2. `promote-body.json` and `promote-body-v1.json` are unchanged: an exact element posts no `snap`.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs SentinelAddin/GhostBuilder/PromotePlanner.cs SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/Commands.PromoteWalls.cs WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-logic.test.mjs WebApp/bridge/changesets-store.test.mjs tools/promote-check/SnapChecks.cs tools/promote-check/Check.cs tools/promote-check/Ma2aWiring.cs
git commit -F - <<'EOF'
feat(promote): type_snap_mm (D16) - 0 keeps the exact match; within a matrix's limit Promote snaps to the nearest catalogue size, the bridge holds the snap to the project's lod_matrix and never pre-ticks it, the executor moves a face by the filed snap only (MA-2b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4 — matrixToIds: the DD stage IDS made from the matrix, served derived, and the shared fixture for the add-in's judge

**Files:**
- Create `WebApp/bridge/lod-ids.test.mjs` — matrixToIds, its route function, and the fixture it writes (`WebApp/bridge/fixtures/lod-matrix/ids-cases.json`, generated, committed)
- Modify `WebApp/bridge/ids-compile.mjs` — `IFCCOVERING` in `STANDARD_PSETS`, `CATEGORY_ENTITY`, `matrixToIds`
- Modify `WebApp/bridge/artefact-store.mjs` — `lodMatrixIds`; `WebApp/bridge/bcf-service.mjs` — the route

**Interfaces:** `matrixToIds(matrix, {stage = "DD", label = null}) → {title: "<standard_key> <semver> · DD (<label>)", enforce: "warn", specifications: [{name: "<Category> · DD", applicability: {entity}, requirements: {properties: [{pset, name, cardinality: "required"}], attributes: []}}], unmatched: [{category, property, reason}]}`. `lodMatrixIds(key, deps) → {matrix: label, sha256, stage: "DD", project_stage, ids, unmatched}`; 404 `"no lod_matrix installed for <key> or its office"`; 409 `"<label> did not parse: <reason>"`. Route: `GET /cde/:key/artefacts/lod_matrix/ids` (any member).

- [ ] **Step 1: The failing test.**

`Create` `WebApp/bridge/lod-ids.test.mjs`:

```js
// MA-2b (design §3.4 step 5): the DD stage IDS made from a lod_matrix — matrixToIds, beside STANDARD_PSETS in ids-compile.mjs —
// and the route the add-in reads it from. The test judges a set of elements, shaped as Revit's GovernedElementExtractor writes
// them, with sentinel-core's validateElement (the bundle the bridge adjudicates with), and writes the elements and the failures
// to fixtures/lod-matrix/ids-cases.json — tools/promote-check holds the add-in's C# judge (StageIds) to the same answers.
// Written to a temp name and renamed into place, so a parallel worker never reads half a file.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { matrixToIds, CATEGORY_ENTITY, STANDARD_PSETS } from "./ids-compile.mjs";
import { parseLodMatrix, validateElement } from "./sentinel-core.mjs";
import { lodMatrixIds, putArtefact } from "./artefact-store.mjs";

const OUT = new URL("./fixtures/lod-matrix/ids-cases.json", import.meta.url);
const MATRIX = {
  standard_key: "MA2B-LOD-001", semver: "0.1.0", status: "draft", stage_map: { CD: "coord" },
  rows: [
    { category: "Walls", DD: { type: "guideline_rule", level: "story_level", top: "next_story_level", properties: ["Pset_WallCommon.FireRating", "IsExternal", "Pset_WallCommon.LoadBearing"] } },
    { category: "Floors", DD: { type: "guideline_rule", level: "story_level", properties: ["Combustible"] } },
    { category: "Ceilings", DD: { type: "guideline_rule", level: "story_level", properties: ["AcousticRating"] } },
    { category: "Doors", DD: { type: "guideline_rule", level: "story_level", host: "wall", properties: ["Pset_DoorCommon.FireRating"] } },
    { category: "Windows", DD: { type: "guideline_rule", level: "story_level", host: "wall" } },
  ],
};
const el = (name, Class, rows) => ({ name, identity: { Class, Name: name }, psets: rows.length ? [{ name: rows[0][0], rows: rows.map(([, n, v]) => ({ name: n, value: v })) }] : [] });
const ELEMENTS = [
  el("wall rated", "IFCWALL", [["Pset_WallCommon", "IsExternal", "True"], ["Pset_WallCommon", "FireRating", "60"]]),
  el("wall unrated", "IFCWALL", [["Pset_WallCommon", "IsExternal", "False"]]),
  el("wall blank rating", "IFCWALL", [["Pset_WallCommon", "IsExternal", "True"], ["Pset_WallCommon", "FireRating", ""]]),
  el("door rated", "IFCDOOR", [["Pset_DoorCommon", "FireRating", "FD30"]]),
  el("door unrated", "IFCDOOR", []),
  el("ceiling", "IFCCOVERING", []),
  el("window", "IFCWINDOW", []),
  el("column", "IFCCOLUMN", []),
];

describe("matrixToIds (MA-2b)", () => {
  const out = matrixToIds(parseLodMatrix(MATRIX), { label: "lod_matrix@1 · office · abababababab…" });
  it("one specification per row that asks for properties, in compileIds' IDS shape, warn — a qualified name as written, a bare one in its class's standard pset", () => {
    expect(out.title).toBe("MA2B-LOD-001 0.1.0 · DD (lod_matrix@1 · office · abababababab…)");
    expect(out.enforce).toBe("warn");
    expect(out.specifications.map((s) => [s.name, s.applicability.entity])).toEqual([
      ["Walls · DD", "IFCWALL"], ["Ceilings · DD", "IFCCOVERING"], ["Doors · DD", "IFCDOOR"]]);
    expect(out.specifications[0].requirements).toEqual({ attributes: [], properties: [
      { pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" },
      { pset: "Pset_WallCommon", name: "IsExternal", cardinality: "required" },
      { pset: "Pset_WallCommon", name: "LoadBearing", cardinality: "required" }] });
    expect(out.specifications[1].requirements.properties).toEqual([{ pset: "Pset_CoveringCommon", name: "AcousticRating", cardinality: "required" }]);
  });
  it("a bare name no standard pset holds for the class is said in unmatched, never dropped; Floors keep no specification", () => {
    expect(out.unmatched).toEqual([{ category: "Floors", property: "Combustible", reason: "no standard property set holds Combustible for IFCSLAB — name it as Pset_X.Combustible" }]);
    expect(STANDARD_PSETS.IFCCOVERING.FireRating).toBe("Pset_CoveringCommon"); // ceilings: the matrix's Ceilings row
    expect(Object.keys(CATEGORY_ENTITY)).toEqual(["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"]);
  });
  it("judged by validateElement, written to the shared fixture the add-in's StageIds reads", () => {
    const ids = { title: out.title, enforce: out.enforce, specifications: out.specifications };
    const cases = ELEMENTS.map((e) => { const r = validateElement(ids, e); return { ...e, in_scope: r.inScope, failures: r.failures.map((f) => f.requirement) }; });
    expect(cases.map((c) => [c.name, c.failures])).toEqual([
      ["wall rated", ["Pset_WallCommon.LoadBearing"]],
      ["wall unrated", ["Pset_WallCommon.FireRating", "Pset_WallCommon.LoadBearing"]],
      ["wall blank rating", ["Pset_WallCommon.FireRating", "Pset_WallCommon.LoadBearing"]],
      ["door rated", []], ["door unrated", ["Pset_DoorCommon.FireRating"]],
      ["ceiling", ["Pset_CoveringCommon.AcousticRating"]], ["window", []], ["column", []]]);
    const tmp = new URL("./fixtures/lod-matrix/ids-cases.json.tmp", import.meta.url);
    writeFileSync(tmp, JSON.stringify({ ids, unmatched: out.unmatched, cases }, null, 2) + "\n");
    renameSync(tmp, OUT);
    expect(JSON.parse(readFileSync(OUT, "utf8")).cases).toHaveLength(8);
  });
});

describe("lodMatrixIds — GET /cde/:key/artefacts/lod_matrix/ids (MA-2b)", () => {
  const mem = (parentKey = null) => {
    const docs = new Map(), k = (s, p, d) => `${s}|${p}|${d}`;
    return {
      ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
      docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
      docInsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      audit: async () => {}, requireMinRole: async () => {},
      officeKeyOf: async () => parentKey,
      officeArtefact: async (key, kind) => { const p = docs.get(k("artefact", `uuid-${key}`, kind)); return p ? docs.get(k("artefact", `uuid-${key}`, `${kind}@${p.version}`)) ?? null : null; },
    };
  };
  it("derives the DD IDS from the matrix in force (project → office), names it, and installs nothing", async () => {
    const d = mem("ma2b-office");
    await putArtefact("ma2b-office", "lod_matrix", MATRIX, { actor: "lead" }, d);
    const r = await lodMatrixIds("ma2b", d);
    expect(r.matrix).toMatch(/^lod_matrix@1 · office · [0-9a-f]{12}…$/);
    expect(r).toMatchObject({ stage: "DD", project_stage: "design", unmatched: [{ category: "Floors", property: "Combustible" }] });
    expect(r.ids.specifications).toHaveLength(3);
    expect(r.ids.title).toBe(`MA2B-LOD-001 0.1.0 · DD (${r.matrix})`);
    await expect(lodMatrixIds("ma2b-orphan", mem())).rejects.toMatchObject({ status: 404, message: "no lod_matrix installed for ma2b-orphan or its office" });
  });
});
```

- [ ] **Step 2: Run it, and see it fail.** From `WebApp`: `npx vitest run bridge/lod-ids.test.mjs bridge/ids-compile.test.mjs` — `Test Files  1 failed | 1 passed (2)`, `Tests  18 passed (18)`: `lod-ids.test.mjs` cannot load (`matrixToIds` is not exported by `ids-compile.mjs`).

- [ ] **Step 3: matrixToIds, its route function and the route.**

In `WebApp/bridge/ids-compile.mjs`, replace

```js
  IFCCURTAINWALL: { IsExternal: "Pset_CurtainWallCommon", FireRating: "Pset_CurtainWallCommon", Reference: "Pset_CurtainWallCommon", ThermalTransmittance: "Pset_CurtainWallCommon" },
};
export const standardPset = (entity, property) => STANDARD_PSETS[entity]?.[property] ?? null;
```

with

```js
  IFCCURTAINWALL: { IsExternal: "Pset_CurtainWallCommon", FireRating: "Pset_CurtainWallCommon", Reference: "Pset_CurtainWallCommon", ThermalTransmittance: "Pset_CurtainWallCommon" },
  // MA-2b: a ceiling exports as IFCCOVERING — the lod_matrix's Ceilings row.
  IFCCOVERING: { FireRating: "Pset_CoveringCommon", AcousticRating: "Pset_CoveringCommon", Reference: "Pset_CoveringCommon", ThermalTransmittance: "Pset_CoveringCommon" },
};
export const standardPset = (entity, property) => STANDARD_PSETS[entity]?.[property] ?? null;

/** MA-2b: a lod_matrix row's Revit category → the IFC class its elements export as (GovernedElementExtractor's table). */
export const CATEGORY_ENTITY = { Walls: "IFCWALL", Floors: "IFCSLAB", Roofs: "IFCROOF", Ceilings: "IFCCOVERING", Doors: "IFCDOOR", Windows: "IFCWINDOW" };

/** MA-2b (design §3.4 step 5): the IDS of a matrix's DD stage, in the JSON shape compileIds writes — one specification per row
 *  that asks for properties, every property required. `matrix` is sentinel-core's parseLodMatrix answer. A qualified name
 *  ("Pset_WallCommon.FireRating") is required as written; a bare one ("FireRating") goes in its class's standard pset
 *  (STANDARD_PSETS), and one no standard pset holds is returned in `unmatched` with the reason — never dropped (rule 3 above).
 *  Deterministic, and a proposal of what to check: nothing here installs an ids@n. → {title, enforce: "warn", specifications, unmatched}. */
export function matrixToIds(matrix, { stage = "DD", label = null } = {}) {
  const specifications = [], unmatched = [];
  for (const row of matrix.rows) {
    const entity = CATEGORY_ENTITY[row.category];
    const properties = [];
    for (const p of row.properties) {
      const dot = p.indexOf(".");
      if (dot > 0 && dot < p.length - 1) properties.push({ pset: p.slice(0, dot), name: p.slice(dot + 1), cardinality: "required" });
      else if (standardPset(entity, p)) properties.push({ pset: standardPset(entity, p), name: p, cardinality: "required" });
      else unmatched.push({ category: row.category, property: p, reason: `no standard property set holds ${p} for ${entity} — name it as Pset_X.${p}` });
    }
    if (properties.length) specifications.push({ name: `${row.category} · ${stage}`, applicability: { entity }, requirements: { properties, attributes: [] } });
  }
  return { title: `${matrix.standard_key} ${matrix.semver} · ${stage}${label ? ` (${label})` : ""}`, enforce: "warn", specifications, unmatched };
}
```

In `WebApp/bridge/artefact-store.mjs`, replace

```js
/**
 * The IDS a judge must use for `key`: project → office (resolveArtefact) → client → none. Returns the spec
```

with

```js
/** MA-2b (design §3.4 step 5): GET /cde/:key/artefacts/lod_matrix/ids — the DD stage IDS of `key`'s lod_matrix@n (project →
 *  office), made by matrixToIds from the one parser's reading, with the matrix that made it: {matrix: label, sha256, stage: "DD",
 *  project_stage (its stage_map, D18), ids, unmatched}. Derived on every read and never installed as ids@n, so it cannot outrank
 *  or clash with the project's own IDS. 404 when no matrix is installed; 409 when the one installed no longer parses. */
export async function lodMatrixIds(key, deps) {
  const a = await resolveArtefact(key, "lod_matrix", deps);
  if (a.source === "none") throw err(404, `no lod_matrix installed for ${key} or its office`);
  let m;
  try { m = parseLodMatrix(a.body); } catch (e) { throw err(409, `${refLabel(a)} did not parse: ${e.message}`); }
  const { matrixToIds } = await import("./ids-compile.mjs");
  const { unmatched, ...ids } = matrixToIds(m, { label: refLabel(a) });
  return { matrix: refLabel(a), sha256: a.sha256, stage: "DD", project_stage: m.stage_map.DD, ids, unmatched };
}

/**
 * The IDS a judge must use for `key`: project → office (resolveArtefact) → client → none. Returns the spec
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
        if (!p3 && req.method === "GET") return send(res, 200, await art.listArtefacts(p1));
```

with

```js
        if (!p3 && req.method === "GET") return send(res, 200, await art.listArtefacts(p1));
        // MA-2b: GET /cde/:key/artefacts/lod_matrix/ids — the DD stage IDS made from the matrix in force (never installed as ids@n).
        // Before the version GET, so "ids" is never read as a version. Any member, as every artefact read.
        if (p3 === "lod_matrix" && p4 === "ids" && req.method === "GET") return send(res, 200, await art.lodMatrixIds(p1));
```

- [ ] **Step 4: Run it, and see it pass.** `npx vitest run bridge/lod-ids.test.mjs bridge/ids-compile.test.mjs bridge/artefact-store.test.mjs` — `Test Files  3 passed (3)`, `Tests  234 passed (234)`. The run writes `bridge/fixtures/lod-matrix/ids-cases.json` (8 elements); a second run rewrites it byte for byte.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/ids-compile.mjs WebApp/bridge/artefact-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/lod-ids.test.mjs WebApp/bridge/fixtures/lod-matrix/ids-cases.json
git commit -F - <<'EOF'
feat(ids): matrixToIds - the DD stage IDS made from the lod_matrix, served derived at GET /cde/:key/artefacts/lod_matrix/ids, and the shared fixture for the add-in's judge (MA-2b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 5 — Pure C#: the LOD state reader and the stage IDS judge, and the lod_state row

**Files:**
- Create `tools/promote-check/LodStateChecks.cs` — `StageIdsChecks`, `LodStateChecks`; modify `tools/promote-check/Check.cs`, `tools/promote-check/promote-check.csproj` (compiles `LodState.cs`, `GovElement.cs`, `PsetMap.cs`)
- Create `SentinelAddin/GhostBuilder/LodState.cs` — `LodFact`, `StageIds`, `LodClassRow`, `LodStateReport`, `LodState`
- Modify `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` — `StoreyPlan.Lod`, the walls' facts; `SentinelAddin/GhostBuilder/PromotePlanner.cs` — the other classes' facts (`Plan1`'s `out bool blocked`)
- Modify `SentinelAddin/Coordination/CommandReports.cs` — `LodState`, `MaxReasons`

**Interfaces:** `LodFact {UniqueId, Category, RulesOk, Blocked}`; `StoreyPlan.Lod: List<LodFact>`. `StageIds.FromReply(json, out error)`, `StageIds.FromIds(JsonElement)`, `For(category) → Spec`, `Judge(ifcClass, values, org) → Verdict {Class, InScope, Failed, Missing, NotRead}`, `ValuesOf(GovElement)`. `LodState.Read(plans, mx, ids, idsWhy, props, notRun) → LodStateReport {When, Stage, ProjectStage, Matrix, Ids, Guideline, Rows, NotRun, Total, At, Below, Blocked, NotMeasured, Share, Line, LevelLines(int reasons = 2)}`. `CommandReports.LodState(LodStateReport r, IReadOnlyList<string> changesetIds, string actor)` → `{entity_type: "lod_state", actor, action: "lod:state <when> · <line>", new_value: {when, stage, project_stage, matrix, ids, guideline, line, share, total, at, below, blocked, not_measured, rows: [{level, category, total, at, below, blocked, not_measured, reasons: [{reason, count}], reasons_total}], rows_total, not_run, changesets, source: "revit"}}`.

- [ ] **Step 1: The failing checks.**

`Create` `tools/promote-check/LodStateChecks.cs`:

```csharp
#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 30. MA-2b: the stage IDS judge (StageIds) held to sentinel-core's validateElement on the shared fixture the bridge's
    //        matrixToIds test writes (WebApp/bridge/fixtures/lod-matrix/ids-cases.json) — and what Revit cannot read is "not
    //        read", never passed ──────────────────────────────────────────────────────────────────────────────────────────
    static void StageIdsChecks()
    {
        Console.WriteLine("\nMA-2b — the DD stage IDS judge (WebApp/bridge/fixtures/lod-matrix/ids-cases.json)");
        var fx = JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "lod-matrix", "ids-cases.json")));
        var ids = StageIds.FromIds(JsonDocument.Parse(fx["ids"].ToJsonString()).RootElement);
        Ok(ids.Specs.Select(s => s.Name).SequenceEqual(new[] { "Walls · DD", "Ceilings · DD", "Doors · DD" }) && ids.For("Walls").Entity == "IFCWALL"
           && ids.For("Walls").Required.SequenceEqual(new[] { "Pset_WallCommon.FireRating", "Pset_WallCommon.IsExternal", "Pset_WallCommon.LoadBearing" }),
           "the IDS reads as matrixToIds wrote it: one specification per class, its entity, its required properties");
        StageIds.Verdict V(string name)
        {
            var c = fx["cases"].AsArray().First(x => (string)x["name"] == name);
            var g = new GovElement { identity = new GovIdentity { Class = (string)c["identity"]["Class"] } };
            foreach (var ps in c["psets"].AsArray())
                g.psets.Add(new GovGroup { name = (string)ps["name"], rows = ps["rows"].AsArray().Select(r => new GovRow { name = (string)r["name"], value = (string)r["value"] }).ToList() });
            return ids.Judge(g.identity.Class, StageIds.ValuesOf(g), null);
        }
        int same = 0;
        foreach (var c in fx["cases"].AsArray())
        {
            var v = V((string)c["name"]);
            if (v.InScope == (bool)c["in_scope"] && v.Failed.SequenceEqual(c["failures"].AsArray().Select(x => (string)x))) same++;
            else Console.WriteLine($"        {(string)c["name"]}: C# [{string.Join(", ", v.Failed)}] in scope {v.InScope}");
        }
        Ok(fx["cases"].AsArray().Count == 8 && same == 8, $"every shared element ({same}/8): the same requirements fail as in validateElement, and the same elements are in scope");
        Ok(V("wall rated").Missing.Count == 0 && V("wall rated").NotRead.SequenceEqual(new[] { "Pset_WallCommon.LoadBearing" })
           && V("wall unrated").Missing.SequenceEqual(new[] { "Pset_WallCommon.FireRating" }) && V("door unrated").Missing.SequenceEqual(new[] { "Pset_DoorCommon.FireRating" })
           && V("ceiling").NotRead.SequenceEqual(new[] { "Pset_CoveringCommon.AcousticRating" }),
           "a property Revit reads and finds empty is MISSING; one Sentinel has no reader for (LoadBearing, a ceiling's AcousticRating) is NOT READ — never passed, never failed");
        var reply = StageIds.FromReply("{\"matrix\":\"lod_matrix@1 · office · abababababab…\",\"ids\":" + fx["ids"].ToJsonString() + ",\"unmatched\":" + fx["unmatched"].ToJsonString() + "}", out var re);
        Ok(re == null && reply.Matrix == "lod_matrix@1 · office · abababababab…"
           && reply.Unmatched.SequenceEqual(new[] { "Floors: Combustible — no standard property set holds Combustible for IFCSLAB — name it as Pset_X.Combustible" })
           && StageIds.FromReply("{\"message\":\"no lod_matrix\"}", out var bad) == null && bad.StartsWith("the DD IDS reply could not be read"),
           "the route's reply reads with the matrix's label and what matrixToIds could not place; a reply it cannot read is said, never an empty IDS");
    }

    // ── 31. MA-2b: the LOD state reader — at DD, below, blocked, not measured, per level and class, from Promote's own facts ──
    static void LodStateChecks(GuidelineMatcher m, GuidelineMatcher m2)
    {
        Console.WriteLine("\nMA-2b — the LOD state (LodState.Read over Promote's plan)");
        var mx = LodMatrix.FromBody(File.ReadAllText(Repo("demo", "bds-pilot", "bds-lod-matrix-dd.json")), out _);
        mx.Properties["Walls"] = new List<string> { "Pset_WallCommon.FireRating" };
        StageIds Ids(params string[] wallProps) => StageIds.FromIds(JsonDocument.Parse(
            "{\"title\":\"t\",\"specifications\":[{\"name\":\"Walls · DD\",\"applicability\":{\"entity\":\"IFCWALL\"},\"requirements\":{\"properties\":[" +
            string.Join(",", wallProps.Select(p => $"{{\"pset\":\"{p.Split('.')[0]}\",\"name\":\"{p.Split('.')[1]}\",\"cardinality\":\"required\"}}")) + "]}}]}").RootElement);
        var walls = new List<WallFact>
        {
            W("OK1", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("OK2", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2"),
            W("E1", "Generic - 200mm", "Exterior", 200),
            W("GRP1", "Generic - 200mm", "Exterior", 200, group: true),
            W("CW1", "Curtain Wall", "Exterior", 0, basic: false),
            W("BDS1", "BDS_EXT_ARC_STONE_300 mm", "Exterior", 300), // another office type: not counted
        };
        var plans = PromoteWallsPlanner.Plan(walls, Levels, DocTypes, m);
        string U(string label) => walls.First(w => w.Label == label).UniqueId;
        Dictionary<string, StageIds.Verdict> Props(StageIds ids, Dictionary<string, string> ok1, Dictionary<string, string> ok2) => new Dictionary<string, StageIds.Verdict>
        { [U("OK1")] = ids.Judge("IFCWALL", ok1, null), [U("OK2")] = ids.Judge("IFCWALL", ok2, null) };
        var rated = new Dictionary<string, string> { ["Pset_WallCommon.FireRating"] = "60" };
        var fire = Ids("Pset_WallCommon.FireRating");

        var r = LodState.Read(plans, mx, fire, null, Props(fire, rated, new Dictionary<string, string>()), null);
        var row = r.Rows.Single();
        Ok(row.Level == "Level 1" && row.Category == "Walls" && row.Total == 5 && row.At == 1 && row.Below == 2 && row.Blocked == 2 && row.NotMeasured == 0
           && row.Total == plans[0].Walls && plans[0].DdNow == 2,
           "Level 1 · Walls: 5 counted (the DD-now denominator — the other office type left out), 1 at DD, 2 below, 2 blocked; DD now (rules only) was 2");
        Ok(row.Reasons.Any(kv => kv.Key == "missing Pset_WallCommon.FireRating" && kv.Value == 1)
           && row.Reasons.Any(kv => kv.Key == "in a group — Sentinel does not edit group members")
           && row.Reasons.Any(kv => kv.Key == "not a basic wall — Promote v0 types basic walls only")
           && row.Reasons.Any(kv => kv.Key == "not on a DD type — Promote proposes a retype") && row.Reasons.Any(kv => kv.Key == "top not at the next story — Promote proposes an attach"),
           "the reasons: a missing property, the two blocks, and what Promote proposes for the concept wall");
        Ok(r.Line == "DD → design: 1 of 5 at DD (20%) · 2 below · 2 blocked · 0 not measured" && r.Share == 20,
           "the line every surface prints: the stage, its project stage (D18), the counts and the share");
        Ok(r.LevelLines()[0].StartsWith("Level 1 · Walls: 1 at DD, 2 below, 2 blocked, 0 not measured (") && r.LevelLines()[0].EndsWith("; …)"),
           "per level and class: the counts and the two commonest reasons");

        var twoProps = Ids("Pset_WallCommon.FireRating", "Pset_WallCommon.LoadBearing");
        mx.Properties["Walls"] = new List<string> { "Pset_WallCommon.FireRating", "Pset_WallCommon.LoadBearing" };
        var nr = LodState.Read(plans, mx, twoProps, null, Props(twoProps, rated, rated), null).Rows.Single();
        Ok(nr.At == 0 && nr.NotMeasured == 2 && nr.Reasons.Any(kv => kv.Key == "no Revit reader for Pset_WallCommon.LoadBearing" && kv.Value == 2),
           "a property Revit cannot read makes the wall NOT MEASURED, named — never at DD");
        var none = LodState.Read(plans, mx, null, "bridge unreachable (timed out after 4 s)", new Dictionary<string, StageIds.Verdict>(), null).Rows.Single();
        Ok(none.At == 0 && none.NotMeasured == 2 && none.Reasons.Any(kv => kv.Key == "the DD IDS was not read: bridge unreachable (timed out after 4 s)"),
           "with the DD IDS not read, the walls the rules pass are NOT MEASURED, with why");
        mx.Properties["Walls"] = new List<string>();
        var rulesOnly = LodState.Read(plans, mx, null, "no matrix ids", new Dictionary<string, StageIds.Verdict>(), new[] { "Floors: no DD row in the LOD matrix" });
        Ok(rulesOnly.At == 2 && rulesOnly.Line.EndsWith(" · Floors not measured"), "a class whose DD asks no property is at DD by its rules alone; a class not run is named not measured");
        var exported = LodState.Read(plans, new LodMatrix { StageMap = mx.StageMap, Properties = { ["Walls"] = new List<string> { "Pset_WallCommon.FireRating" } } },
                                     fire, null, new Dictionary<string, StageIds.Verdict> { [U("OK1")] = fire.Judge("IFCCOVERING", rated, null), [U("OK2")] = fire.Judge("IFCWALL", rated, null) }, null).Rows.Single();
        Ok(exported.At == 1 && exported.NotMeasured == 1 && exported.Reasons.Any(kv => kv.Key == "exported as IFCCOVERING, which the DD IDS for Walls (IFCWALL) does not judge"),
           "a wall exported as another IFC class is NOT MEASURED — the DD IDS does not apply to it");

        var doors = V1(m2, new[]
        {
            Dw("door", "D1", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", 1000, 2100, host: "BDS_INT_ARC_GYPS_100 mm"),
            Dw("door", "D2", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, set: f => f.InGroup = true),
        }, classes: new[] { "Doors" });
        Ok(doors[0].Lod.Count == doors[0].Others["Doors"].Total && doors[0].Lod.Single(f => f.Blocked).Category == "Doors" && doors[0].Lod.Count(f => f.RulesOk) == doors[0].Others["Doors"].DdNow,
           "doors: one fact per counted door — the grouped one blocked, the settled hosted one at DD by its rules, as DD now counts them");

        mx.StageMap["DD"] = "coord";
        var body = JsonSerializer.Serialize(CommandReports.LodState(LodState.Read(plans, new LodMatrix { StageMap = mx.StageMap }, null, "x", new Dictionary<string, StageIds.Verdict>(), null),
                                                                     new[] { "cs-1" }, "lead@office.example"));
        var j = JsonNode.Parse(body);
        Ok((string)j["entity_type"] == "lod_state" && (string)j["action"] == "lod:state now · DD → coord: 2 of 5 at DD (40%) · 1 below · 2 blocked · 0 not measured"
           && (int)j["new_value"]["share"] == 40 && (int)j["new_value"]["total"] == 5 && (string)j["new_value"]["project_stage"] == "coord"
           && (string)j["new_value"]["rows"][0]["category"] == "Walls" && (int)j["new_value"]["rows"][0]["blocked"] == 2 && (int)j["new_value"]["rows_total"] == 1
           && (string)j["new_value"]["changesets"][0] == "cs-1" && (string)j["new_value"]["source"] == "revit",
           "one lod_state row per run: the line as its action, the share, the project stage the matrix maps DD to, the rows with their reasons");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        SnapChecks(m, m2);
```

with

```csharp
        SnapChecks(m, m2);
        StageIdsChecks();
        LodStateChecks(m, m2);
```

In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\WallLocation.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\WallLocation.cs" />
    <!-- MA-2b: the LOD state reader and the stage IDS judge, over the extractor's element shape and the pset table -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\LodState.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\GovElement.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\PsetMap.cs" />
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` fails to compile — `1 Error(s)`: `CS2001 Source file '…\SentinelAddin\GhostBuilder\LodState.cs' could not be found`.

- [ ] **Step 3: The reader, the judge, the facts and the row.**

`Create` `SentinelAddin/GhostBuilder/LodState.cs`:

```csharp
#nullable disable
// MA-2b — the LOD state reader and the stage IDS judge, pure (no Revit API, no HTTP), so tools/promote-check drives both.
//
// AN ELEMENT'S LOD STATE (design §3.2) is the highest matrix stage whose rules it passes; Promote checks the DD stage only,
// so an element is AT DD, BELOW DD (the rules it fails give the reasons), BLOCKED (held for a reason Promote cannot act on:
// a group, a design option, structure, not a basic wall, not on a Building Story, not editable) or NOT MEASURED (a rule
// whose fact Sentinel cannot read — a property with no Revit reader, the stage IDS not read, an element exported as another
// IFC class). Nothing is guessed: a stage is passed only when every one of its rules was read and met. The facts are the
// ones Promote already read (its plan's per-element verdicts, StoreyPlan.Lod) and the stage IDS judged on the elements the
// rules pass; the counts go to Promote's header, one lod_state ledger row (CommandReports.LodState), and from the ledger to
// the pane, the Next strip and the stage gate.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    /// <summary>One element as Promote's plan judged it against the matrix's DD rules (StoreyPlan.Lod): RulesOk = its type and
    /// top (doors and windows: type and host) are DD; Blocked = held whole for a reason Promote cannot act on. An element on the
    /// office's other types is not a fact (it is left out of the count, as Promote leaves it out of "DD now").</summary>
    public sealed class LodFact
    {
        public string UniqueId, Category;
        public bool RulesOk, Blocked;
    }

    /// <summary>MA-2b (design §3.4 step 5): the DD stage IDS the bridge makes from the lod_matrix (matrixToIds, GET
    /// /cde/:key/artefacts/lod_matrix/ids), judged on what Revit reads. A required property passes when its pset row is present
    /// and not empty (sentinel-core validateElement); it is MISSING when Sentinel reads it and it is absent; it is NOT READ —
    /// never passed, never failed — when Sentinel has no reader for it on that IFC class (PsetMap). tools/promote-check holds
    /// Judge to validateElement on WebApp/bridge/fixtures/lod-matrix/ids-cases.json.</summary>
    public sealed class StageIds
    {
        public sealed class Spec { public string Name, Entity; public List<string> Required = new List<string>(); }
        public sealed class Verdict
        {
            public string Class;
            public bool InScope;
            /// <summary>Every requirement that did not pass, in the IDS's order (validateElement's failures).</summary>
            public List<string> Failed = new List<string>();
            public List<string> Missing = new List<string>(), NotRead = new List<string>();
        }

        public string Title, Matrix;
        public List<Spec> Specs = new List<Spec>();
        /// <summary>The matrix's properties matrixToIds could not place, as "Floors: Combustible — no standard property set …".</summary>
        public List<string> Unmatched = new List<string>();

        /// <summary>The route's reply {matrix, ids, unmatched} → the IDS, or null with <paramref name="error"/>. Never throws.</summary>
        public static StageIds FromReply(string json, out string error)
        {
            error = null;
            try
            {
                using (var d = JsonDocument.Parse(json ?? ""))
                {
                    var r = d.RootElement;
                    var s = FromIds(r.GetProperty("ids"));
                    s.Matrix = r.TryGetProperty("matrix", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null;
                    if (r.TryGetProperty("unmatched", out var u) && u.ValueKind == JsonValueKind.Array)
                        s.Unmatched = u.EnumerateArray().Select(x => $"{x.GetProperty("category").GetString()}: {x.GetProperty("property").GetString()} — {x.GetProperty("reason").GetString()}").ToList();
                    return s;
                }
            }
            catch (Exception ex) { error = "the DD IDS reply could not be read (" + ex.Message + ")"; return null; }
        }

        /// <summary>An IDS in the JSON spec shape → its specifications' entities and required "Pset.Prop" keys.</summary>
        public static StageIds FromIds(JsonElement ids)
        {
            var s = new StageIds { Title = ids.TryGetProperty("title", out var t) ? t.GetString() : null };
            foreach (var spec in ids.GetProperty("specifications").EnumerateArray())
            {
                var one = new Spec { Name = spec.GetProperty("name").GetString(), Entity = spec.GetProperty("applicability").GetProperty("entity").GetString() };
                foreach (var p in spec.GetProperty("requirements").GetProperty("properties").EnumerateArray())
                    if (p.GetProperty("cardinality").GetString() == "required") one.Required.Add(p.GetProperty("pset").GetString() + "." + p.GetProperty("name").GetString());
                s.Specs.Add(one);
            }
            return s;
        }

        /// <summary>The specification of a lod_matrix category (matrixToIds names it "&lt;Category&gt; · DD"), or null.</summary>
        public Spec For(string category) => Specs.FirstOrDefault(x => x.Name == category + " · DD");

        /// <summary>One element, as GovernedElementExtractor read it: its IFC class and its "Pset.Prop" values.</summary>
        public Verdict Judge(string ifcClass, IReadOnlyDictionary<string, string> values, string org)
        {
            var v = new Verdict { Class = ifcClass };
            var entries = PsetMap.Entries(org);
            foreach (var spec in Specs.Where(x => Regex.IsMatch(ifcClass ?? "", x.Entity ?? "", RegexOptions.IgnoreCase)))
            {
                v.InScope = true;
                foreach (var key in spec.Required)
                {
                    bool read = entries.Any(e => string.Equals(e.Key, key, StringComparison.OrdinalIgnoreCase)
                                                 && (e.Classes.Length == 0 || e.Classes.Contains(ifcClass, StringComparer.OrdinalIgnoreCase)));
                    if (values != null && values.TryGetValue(key, out var val) && !string.IsNullOrEmpty(val)) continue;
                    v.Failed.Add(key);
                    (read ? v.Missing : v.NotRead).Add(key);
                }
            }
            return v;
        }

        /// <summary>An extracted element's values, "Pset.Prop" → value (the first row of a name, case ignored).</summary>
        public static Dictionary<string, string> ValuesOf(GovElement e)
        {
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var g in e?.psets ?? new List<GovGroup>())
                foreach (var r in g.rows ?? new List<GovRow>())
                    if (!d.ContainsKey(g.name + "." + r.name)) d[g.name + "." + r.name] = r.value;
            return d;
        }
    }

    /// <summary>One level and one class: its elements by LOD state, the reasons with their counts (most first).</summary>
    public sealed class LodClassRow
    {
        public string Level, Category;
        public int Total, At, Below, Blocked, NotMeasured;
        public List<KeyValuePair<string, int>> Reasons = new List<KeyValuePair<string, int>>();
    }

    public sealed class LodStateReport
    {
        /// <summary>"now" (Promote's header, step 2) or "after" (a Promote changeset applied, step 10).</summary>
        public string When = "now";
        /// <summary>The matrix stage checked and the project stage the matrix's stage_map ties it to (D18).</summary>
        public string Stage = "DD", ProjectStage;
        /// <summary>The labels of what judged: the lod_matrix, the DD IDS (or why it was not read), the guideline.</summary>
        public string Matrix, Ids, Guideline;
        public List<LodClassRow> Rows = new List<LodClassRow>();
        /// <summary>The classes not measured at all, with the reason (Promote did not run them: LodMatrix.Classes).</summary>
        public List<string> NotRun = new List<string>();

        public int Total => Rows.Sum(r => r.Total);
        public int At => Rows.Sum(r => r.At);
        public int Below => Rows.Sum(r => r.Below);
        public int Blocked => Rows.Sum(r => r.Blocked);
        public int NotMeasured => Rows.Sum(r => r.NotMeasured);
        /// <summary>The share at DD, whole percent rounded down; null when nothing was counted (not measured, never 0).</summary>
        public int? Share => Total == 0 ? (int?)null : At * 100 / Total;

        /// <summary>The one line the pane, the Next strip and the web print: "DD → design: 38 of 264 at DD (14%) · 212 below · 14
        /// blocked · 0 not measured" (+ " · Floors, Roofs not measured").</summary>
        public string Line =>
            $"{Stage} → {ProjectStage}: {At} of {Total} at {Stage}" + (Share is int s ? $" ({s}%)" : "") +
            $" · {Below} below · {Blocked} blocked · {NotMeasured} not measured" +
            (NotRun.Count > 0 ? " · " + string.Join(", ", NotRun.Select(n => n.Split(':')[0])) + " not measured" : "");

        /// <summary>Per level and class: "Level 3 · Walls: 38 at DD, 212 below, 14 blocked, 0 not measured (in a group ×10; …)".</summary>
        public List<string> LevelLines(int reasons = 2) => Rows.Select(r =>
            $"{r.Level} · {r.Category}: {r.At} at {Stage}, {r.Below} below, {r.Blocked} blocked, {r.NotMeasured} not measured" +
            (r.Reasons.Count == 0 ? "" : " (" + string.Join("; ", r.Reasons.Take(reasons).Select(kv => kv.Key + " ×" + kv.Value.ToString(CultureInfo.InvariantCulture)))
                                         + (r.Reasons.Count > reasons ? "; …" : "") + ")")).ToList();
    }

    public static class LodState
    {
        /// <summary>Promote's plans → the LOD state per level and class. <paramref name="mx"/> is the parsed matrix (its stage map
        /// and each class's properties); <paramref name="ids"/> the DD IDS, or null with <paramref name="idsWhy"/> saying why it was
        /// not read; <paramref name="props"/> the IDS verdict of each element whose DD rules pass (the elements read).</summary>
        public static LodStateReport Read(IReadOnlyList<StoreyPlan> plans, LodMatrix mx, StageIds ids, string idsWhy,
                                          IReadOnlyDictionary<string, StageIds.Verdict> props, IEnumerable<string> notRun)
        {
            var r = new LodStateReport { ProjectStage = mx.StageMap["DD"], NotRun = (notRun ?? Enumerable.Empty<string>()).ToList() };
            foreach (var p in plans)
                foreach (var cat in LodMatrix.Order)
                {
                    var facts = p.Lod.Where(f => f.Category == cat).ToList();
                    if (facts.Count == 0) continue;
                    var row = new LodClassRow { Level = p.Storey, Category = cat, Total = facts.Count };
                    var reasons = new Dictionary<string, int>(StringComparer.Ordinal);
                    void Why(string reason) => reasons[reason] = reasons.TryGetValue(reason, out var n) ? n + 1 : 1;
                    var asks = mx.Properties.TryGetValue(cat, out var ps) ? ps : new List<string>();
                    var unmatched = ids?.Unmatched.Where(u => u.StartsWith(cat + ": ", StringComparison.Ordinal)).ToList() ?? new List<string>();
                    foreach (var f in facts)
                    {
                        var held = p.Held.Where(h => h.UniqueId == f.UniqueId).Select(h => h.Reason).ToList();
                        if (f.Blocked) { row.Blocked++; held.Take(1).ToList().ForEach(Why); continue; }
                        if (!f.RulesOk)
                        {
                            row.Below++;
                            held.ForEach(Why);
                            if (held.Count == 0)
                                foreach (var g in p.Ghosts.Where(x => x.UniqueId == f.UniqueId))
                                    Why(g.Op == "attach" ? "top not at the next story — Promote proposes an attach" : "not on a DD type — Promote proposes a retype");
                            continue;
                        }
                        if (asks.Count == 0) { row.At++; continue; }
                        if (ids == null) { row.NotMeasured++; Why("the DD IDS was not read: " + idsWhy); continue; }
                        var spec = ids.For(cat);
                        props.TryGetValue(f.UniqueId, out var v);
                        if (spec != null && (v == null || !v.InScope))
                        {
                            row.NotMeasured++;
                            Why(v == null ? "its properties were not read" : $"exported as {v.Class}, which the DD IDS for {cat} ({spec.Entity}) does not judge");
                        }
                        else if (v != null && v.Missing.Count > 0) { row.Below++; v.Missing.ForEach(m => Why("missing " + m)); }
                        else if (v != null && v.NotRead.Count > 0) { row.NotMeasured++; v.NotRead.ForEach(m => Why("no Revit reader for " + m)); }
                        else if (unmatched.Count > 0) { row.NotMeasured++; unmatched.ForEach(u => Why("not in the DD IDS: " + u.Substring(cat.Length + 2))); }
                        else row.At++;
                    }
                    row.Reasons = reasons.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal).ToList();
                    r.Rows.Add(row);
                }
            return r;
        }
    }
}
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        public List<PromoteGhost> Ghosts = new List<PromoteGhost>();
        public List<PromoteHeld> Held = new List<PromoteHeld>();
    }
```

with

```csharp
        public List<PromoteGhost> Ghosts = new List<PromoteGhost>();
        public List<PromoteHeld> Held = new List<PromoteHeld>();
        /// <summary>MA-2b: every counted element's DD verdict (the "DD now" denominator, element by element) — what the LOD state
        /// reader (LodState.Read) counts, so the two never drift.</summary>
        public List<LodFact> Lod = new List<LodFact>();
    }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                    var w = ws[k];
                    void Hold(string reason) => p.Held.Add(new PromoteHeld { UniqueId = w.UniqueId, Label = w.Label, Reason = reason });

                    // Whole-wall holds: nothing is proposed for these walls.
                    if (!w.IsBasic) { Hold("not a basic wall — Promote v0 types basic walls only"); continue; }
                    if (w.InGroup) { Hold("in a group — Sentinel does not edit group members"); continue; }
                    if (w.InOption) { Hold("in a design option — Sentinel does not edit design options"); continue; }
                    if (baseLevel == null || !baseLevel.IsStory)
                    {
                        Hold($"base level {w.BaseLevel} is not a Building Story — Promote plans storey by storey");
                        continue;
                    }
```

with

```csharp
                    var w = ws[k];
                    void Hold(string reason) => p.Held.Add(new PromoteHeld { UniqueId = w.UniqueId, Label = w.Label, Reason = reason });
                    // MA-2b: a whole-wall hold is BLOCKED in the LOD state — Promote cannot act on it, whatever the matrix says.
                    void Block(string reason) { Hold(reason); p.Lod.Add(new LodFact { UniqueId = w.UniqueId, Category = "Walls", Blocked = true }); }

                    // Whole-wall holds: nothing is proposed for these walls.
                    if (!w.IsBasic) { Block("not a basic wall — Promote v0 types basic walls only"); continue; }
                    if (w.InGroup) { Block("in a group — Sentinel does not edit group members"); continue; }
                    if (w.InOption) { Block("in a design option — Sentinel does not edit design options"); continue; }
                    if (baseLevel == null || !baseLevel.IsStory)
                    {
                        Block($"base level {w.BaseLevel} is not a Building Story — Promote plans storey by storey");
                        continue;
                    }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                    if (!typeOk && w.Structural) { Hold("structural wall — Promote v0 does not retype or re-top structure; a person decides"); continue; }
```

with

```csharp
                    if (!typeOk && w.Structural) { Block("structural wall — Promote v0 does not retype or re-top structure; a person decides"); continue; }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                    if (typeOk && topOk) p.DdNow++;
```

with

```csharp
                    if (typeOk && topOk) p.DdNow++;
                    p.Lod.Add(new LodFact { UniqueId = w.UniqueId, Category = "Walls", RulesOk = typeOk && topOk });
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                int snap = snapMm != null && snapMm.TryGetValue(cls.Category, out var sn) ? sn : 0;
                var reason = Plan1(e, cls.Category, cls.Word.ToLowerInvariant(), level, oneType, office, docTypes, m, c, snap, out var g);
```

with

```csharp
                int snap = snapMm != null && snapMm.TryGetValue(cls.Category, out var sn) ? sn : 0;
                int ddWas = c.DdNow, officeWas = c.OfficeTyped;
                var reason = Plan1(e, cls.Category, cls.Word.ToLowerInvariant(), level, oneType, office, docTypes, m, c, snap, out var g, out var blocked);
                // MA-2b: the element's DD verdict for the LOD state — the same counters "DD now" reads; an office-typed one is not counted.
                if (c.OfficeTyped == officeWas) p.Lod.Add(new LodFact { UniqueId = e.UniqueId, Category = cls.Category, RulesOk = c.DdNow > ddWas, Blocked = blocked });
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, ClassCount c, int snap, out PromoteGhost g)
        {
            g = null;
            bool family = e.Kind == "door" || e.Kind == "window";
            if (e.NotEditable != null) return $"{e.NotEditable} — Sentinel does not retype it; a person decides";
            if (e.InGroup) return "in a group — Sentinel does not edit group members";
            if (e.InOption) return "in a design option — Sentinel does not edit design options";
            if (level == null || !level.IsStory) return $"level {e.Level} is not a Building Story — Promote plans storey by storey";
```

with

```csharp
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, ClassCount c, int snap, out PromoteGhost g,
            out bool blocked)
        {
            g = null;
            bool family = e.Kind == "door" || e.Kind == "window";
            // MA-2b: these holds are BLOCKED in the LOD state — Promote cannot act on them.
            blocked = true;
            if (e.NotEditable != null) return $"{e.NotEditable} — Sentinel does not retype it; a person decides";
            if (e.InGroup) return "in a group — Sentinel does not edit group members";
            if (e.InOption) return "in a design option — Sentinel does not edit design options";
            if (level == null || !level.IsStory) return $"level {e.Level} is not a Building Story — Promote plans storey by storey";
            blocked = false;
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
            if (e.Kind == "floor" && e.Structural) return "structural floor — Promote v1 does not retype structure; a person decides";
```

with

```csharp
            if (e.Kind == "floor" && e.Structural) { blocked = true; return "structural floor — Promote v1 does not retype structure; a person decides"; }
```

In `SentinelAddin/Coordination/CommandReports.cs`, replace

```csharp
        /// <summary>What the Doctor resolved in one window (DoctorBuffer), with Revit's own fix, in committed transactions.</summary>
```

with

```csharp
        /// <summary>MA-2b: the LOD state of one Promote run ("now", every run — the read-only one too) or of one applied Promote
        /// changeset ("after"): the line, the share, the stage map's project stage, and per level and class the counts with their
        /// reasons (each list at most MaxNames rows and MaxReasons reasons beside its true total). The bridge marks it claimed.</summary>
        public static object LodState(LodStateReport r, IReadOnlyList<string> changesetIds, string actor) =>
            Row("lod_state", actor, $"lod:state {r.When} · {r.Line}", new
            {
                when = r.When, stage = r.Stage, project_stage = r.ProjectStage, matrix = r.Matrix, ids = r.Ids, guideline = r.Guideline,
                line = r.Line, share = r.Share, total = r.Total, at = r.At, below = r.Below, blocked = r.Blocked, not_measured = r.NotMeasured,
                rows = r.Rows.Take(MaxNames).Select(x => new
                {
                    level = x.Level, category = x.Category, total = x.Total, at = x.At, below = x.Below, blocked = x.Blocked, not_measured = x.NotMeasured,
                    reasons = x.Reasons.Take(MaxReasons).Select(kv => new { reason = kv.Key.Length <= 200 ? kv.Key : kv.Key.Substring(0, 199) + "…", count = kv.Value }).ToArray(),
                    reasons_total = x.Reasons.Count,
                }).ToArray(),
                rows_total = r.Rows.Count,
                not_run = r.NotRun.Take(MaxNames).ToArray(),
                changesets = (changesetIds ?? new string[0]).Take(MaxNames).ToArray(),
                source = "revit",
            });

        /// <summary>Reasons kept per LOD state row (a row's reasons can be one per element; the count stays true).</summary>
        public const int MaxReasons = 10;

        /// <summary>What the Doctor resolved in one window (DoctorBuffer), with Revit's own fix, in committed transactions.</summary>
```

In `SentinelAddin/Coordination/CommandReports.cs`, replace

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
```

with

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder; // MA-2b: LodStateReport
```

- [ ] **Step 4: Run it, and see it pass.** `promote-check` — `596/596` ("every shared element (8/8): the same requirements fail as in validateElement…", "Level 1 · Walls: 5 counted…", "one lod_state row per run…"); both builds as in Task 2.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/LodState.cs SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs SentinelAddin/GhostBuilder/PromotePlanner.cs SentinelAddin/Coordination/CommandReports.cs tools/promote-check/LodStateChecks.cs tools/promote-check/Check.cs tools/promote-check/promote-check.csproj
git commit -F - <<'EOF'
feat(lod): the LOD state reader - at DD, below, blocked or not measured per level and class from Promote's own facts, the DD IDS judged on what Revit reads (StageIds, held to validateElement), and the lod_state row (MA-2b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 6 — The bridge and the web: the lod_state row is a Revit report (claimed), the journey's LOD line, the design gate's LOD state, the Next strip's line

**Files:**
- Modify the tests: `WebApp/bridge/write-roles.test.mjs`, `journey-store.test.mjs`, `stage-gate.test.mjs`, `cde-store-gate.test.mjs`, `check-registry.test.mjs`; `WebApp/src/sentinel-core/gates.test.ts`; `WebApp/src/setups/next-strip.test.ts`
- Modify `WebApp/bridge/cde-store.mjs` (`lod_state` in `REVIT_REPORT_TYPES`, `lodStateRow`), `bcf-service.mjs` (the route's comment), `journey-store.mjs` (`listAudit`, `lodStateOf`, `lod_state`), `stage-gate.mjs` (`SOURCED`, `readLodState`)
- Modify `WebApp/src/sentinel-core/gates.ts` (`lodState`), `WebApp/src/setups/project-shell.ts` (`lodState: null` in the preview), `WebApp/src/setups/next-strip.ts` (`lod_state`, `lodLine`, `#ns-lod`)
- Rebuild `WebApp/bridge/sentinel-core.mjs`

**Interfaces:** the journey reply's `lod_state: {line, share, at, ledger: {id, hash}} | null`; `lodStateOf(fact)` (exported from `journey-store.mjs`); `readLodState(key, deps) → {share, source}` (exported from `stage-gate.mjs`); `Metric` adds `"lodState"`, `GateMetrics.lodState: number | null`, `GATE_DEFS.design` adds `{metric: "lodState", op: ">=", value: 90, label: "LOD state: elements at the DD row ≥ 90%"}`; `lodLine(j: Journey): string`.

- [ ] **Step 1: The failing tests.**

In `WebApp/bridge/write-roles.test.mjs`, replace

```js
// MA-1a items 7 and 8: the Revit report route takes the modelling commands' reports (one row per run, counts and actor)
// and the build:run receipt, under the limits it already has. One bridge copy serves this whole file, so the report
// budget (20 per user a minute) is shared across these tests: the contributor posts 9, the owner 21.
```

with

```js
// MA-1a items 7 and 8: the Revit report route takes the modelling commands' reports (one row per run, counts and actor)
// and the build:run receipt, under the limits it already has. One bridge copy serves this whole file, so the report
// budget (20 per user a minute) is shared across these tests: the contributor posts 10, the owner 21. MA-2b adds the
// lod_state row, marked claimed like the receipt.
```

In `WebApp/bridge/write-roles.test.mjs`, replace

```js
  it("a receipt that is not an object, and a build: action under another type, are refused — nothing is saved", async () => {
```

with

```js
  it("a lod_state row is Promote's count in Revit: a contributor's lands under the verified identity, marked claimed by the bridge (MA-2b)", async () => {
    const r = await call("POST", A, "contributor", { entity_type: "lod_state", actor: "x", action: "lod:state now · DD → design: 1 of 5 at DD (20%)", new_value: { share: 20, claimed: false } });
    expect(r.status).toBe(201);
    expect(await call("POST", A, "machine", { entity_type: "lod_state", action: "lod:state now", new_value: "20%" }))
      .toEqual({ status: 400, body: { message: "a lod_state row's new_value is the count, an object — nothing was saved" } });
    expect(db.audit_log.map((a) => [a.entity_type, a.actor, a.new_value])).toEqual([["lod_state", "contributor@example.test", { share: 20, claimed: true }]]);
  });

  it("a receipt that is not an object, and a build: action under another type, are refused — nothing is saved", async () => {
```

In `WebApp/bridge/journey-store.test.mjs`, replace

```js
    listTransmittals: vi.fn(async () => []),
    ...over,
  };
}
```

with

```js
    listTransmittals: vi.fn(async () => []),
    listAudit: vi.fn(async () => ({ rows: [], total: 0, limit: 1, offset: 0 })),
    ...over,
  };
}
```

In `WebApp/bridge/journey-store.test.mjs`, replace

```js
  it("a non-member is refused before any fact is read", async () => {
```

with

```js
  it("MA-2b: the LOD state line is the newest lod_state row's — Revit's count, claimed, with its ledger id — or not measured, in words", async () => {
    const row = { id: 4242, hash: "h".repeat(64), actor: "lead@office.example", at: "2026-10-03T09:15:00.000Z", action: "lod:state now · …",
      new_value: { line: "DD → design: 38 of 264 at DD (14%) · 212 below · 14 blocked · 0 not measured", share: 14, claimed: true } };
    const d = memDeps({ listAudit: vi.fn(async () => ({ rows: [row], total: 3, limit: 1, offset: 0 })) });
    const j = await getJourney("aster-villa", d);
    expect(d.listAudit).toHaveBeenCalledWith("aster-villa", { entity_type: "lod_state", limit: 1 });
    expect(j.lod_state).toEqual({ line: "LOD state: DD → design: 38 of 264 at DD (14%) · 212 below · 14 blocked · 0 not measured — Revit's count (claimed), lead@office.example, 2026-10-03 09:15 · ledger #4242",
      share: 14, at: row.at, ledger: { id: 4242, hash: row.hash } });
    expect((await getJourney("aster-villa", memDeps())).lod_state).toEqual({ line: "LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)", share: null, at: null, ledger: null });
    const down = await getJourney("aster-villa", memDeps({ listAudit: async () => { throw new Error("ledger down"); } }));
    expect(down.lod_state.line).toBe("LOD state: unavailable — ledger down");
    expect(down.done).toBe(6); // the ledger read costs no step
    expect((await getJourney("aster-office", memDeps())).lod_state).toBeNull(); // an office has no model
  });
  it("a non-member is refused before any fact is read", async () => {
```

In `WebApp/src/sentinel-core/gates.test.ts`, replace

```ts
const M = (over: Partial<GateMetrics> = {}): GateMetrics => ({
  health: null, compliance: null, blockViolations: 0, hardClashes: 0,
  openIssues: 0, openRfis: 0, hasStandardsPack: false, cobieComplete: null, ...over,
});
```

with

```ts
const M = (over: Partial<GateMetrics> = {}): GateMetrics => ({
  health: null, compliance: null, blockViolations: 0, hardClashes: 0,
  openIssues: 0, openRfis: 0, hasStandardsPack: false, cobieComplete: null, lodState: 100, ...over,
});

describe("the design gate's LOD state (MA-2b, design §3.2: the share at the DD row's LOD)", () => {
  const met = { health: 85, compliance: 75, blockViolations: 0 };
  it("not measured until a lod_state row exists — the gate is not checkable, never a pass", () => {
    const r = evaluateGate("design", M({ ...met, lodState: null }));
    expect(r.checks.at(-1)).toEqual({ label: "LOD state: elements at the DD row ≥ 90%", ok: false, na: true, detail: "no data" });
    expect(r.status).toBe("not_checkable");
  });
  it("a measured share below the bar holds the gate; at or above it, the check is met", () => {
    expect(evaluateGate("design", M({ ...met, lodState: 89 })).status).toBe("hold");
    expect(evaluateGate("design", M({ ...met, lodState: 90 })).checks.at(-1)).toMatchObject({ ok: true, na: false, detail: "90" });
  });
});
```

In `WebApp/bridge/stage-gate.test.mjs`, replace

```js
import { measureGate, readGateInputs, readCobie, NO_SERVER_SOURCE } from "./stage-gate.mjs";
import { STAGES } from "./cde-store.mjs";
```

with

```js
import { measureGate, readGateInputs, readCobie, readLodState, NO_SERVER_SOURCE } from "./stage-gate.mjs";
import { STAGES } from "./cde-store.mjs";
import { STAGES as CORE_STAGES } from "./sentinel-core.mjs";
```

In `WebApp/bridge/stage-gate.test.mjs`, replace

```js
    expect(g.checks.map((c) => [c.label, c.na, c.source])).toEqual([
      ["Model health ≥ 80%", true, NO_SERVER_SOURCE],
      ["No 'block' violations", true, NO_SERVER_SOURCE],
      ["Standards compliance ≥ 70%", true, NO_SERVER_SOURCE],
    ]);
  });
```

with

```js
    expect(g.checks.map((c) => [c.label, c.na, c.source])).toEqual([
      ["Model health ≥ 80%", true, NO_SERVER_SOURCE],
      ["No 'block' violations", true, NO_SERVER_SOURCE],
      ["Standards compliance ≥ 70%", true, NO_SERVER_SOURCE],
      ["LOD state: elements at the DD row ≥ 90%", true, "not measured — the newest lod_state ledger row not read"],
    ]);
  });
  it("MA-2b: the LOD state check reads the share the newest lod_state row measured, and names the row", () => {
    const g = measureGate("design", { ...ALL, lodState: 94, lodSource: "lod_state ledger #4242 — DD → design: 248 of 264 at DD (94%)" });
    expect(g.checks.at(-1)).toEqual({ label: "LOD state: elements at the DD row ≥ 90%", ok: true, na: false, detail: "94", source: "lod_state ledger #4242 — DD → design: 248 of 264 at DD (94%)" });
    expect(g.status).toBe("not_checkable"); // health, compliance and block violations still have no server source
    expect(STAGES).toEqual(CORE_STAGES); // one stage list (D18): the store's, the matrix's and the gate's
  });
```

In `WebApp/bridge/stage-gate.test.mjs`, replace

```js
    readCobie: vi.fn(async () => ({ readiness: 97, source: "COBie on the live models: T.ifc v2 97/100" })),
    ...over,
  });
  it("counts open topics (not Closed/Resolved), open RFIs (not Closed) and unresolved clashes; the ruleset from the resolver", async () => {
    const d = deps();
    expect(await readGateInputs("aster-tower", d)).toEqual({ hasStandardsPack: true, openIssues: 2, openRfis: 2, hardClashes: 3, cobieComplete: 97, cobieSource: "COBie on the live models: T.ifc v2 97/100" });
```

with

```js
    readCobie: vi.fn(async () => ({ readiness: 97, source: "COBie on the live models: T.ifc v2 97/100" })),
    readLodState: vi.fn(async () => ({ share: 94, source: "lod_state ledger #4242" })),
    ...over,
  });
  it("counts open topics (not Closed/Resolved), open RFIs (not Closed) and unresolved clashes; the ruleset from the resolver", async () => {
    const d = deps();
    expect(await readGateInputs("aster-tower", d)).toEqual({ hasStandardsPack: true, openIssues: 2, openRfis: 2, hardClashes: 3, cobieComplete: 97, cobieSource: "COBie on the live models: T.ifc v2 97/100",
      lodState: 94, lodSource: "lod_state ledger #4242" });
```

In `WebApp/bridge/stage-gate.test.mjs`, replace

```js
describe("readCobie — hand-over measured on the live models' manifests, never a readiness nobody measured", () => {
```

with

```js
describe("readLodState — the design gate's LOD state from the newest lod_state ledger row (MA-2b)", () => {
  const row = (over = {}) => ({ id: 4242, actor: "lead@office.example", at: "2026-10-03T09:15:00.000Z",
    new_value: { line: "DD → design: 248 of 264 at DD (94%) · 16 below · 0 blocked · 0 not measured", share: 94, project_stage: "design", claimed: true, ...over } });
  const reading = (rows) => ({ listAudit: vi.fn(async () => ({ rows, total: rows.length, limit: 1, offset: 0 })) });
  it("the newest row's share, its source naming the row, the line and that Revit claimed it", async () => {
    const d = reading([row()]);
    expect(await readLodState("aster-tower", d)).toEqual({ share: 94,
      source: "lod_state ledger #4242 — DD → design: 248 of 264 at DD (94%) · 16 below · 0 blocked · 0 not measured (Revit's count, claimed: lead@office.example, 2026-10-03T09:15:00.000Z)" });
    expect(d.listAudit).toHaveBeenCalledWith("aster-tower", { entity_type: "lod_state", limit: 1 });
  });
  it.each([
    ["no row yet", [], "LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)"],
    ["a matrix that maps DD past design", [row({ project_stage: "coord" })], "LOD state: not measured — lod_state ledger #4242 measured DD, which its lod_matrix maps to coord, not design"],
    ["a row that counted nothing", [row({ share: null })], "LOD state: not measured — lod_state ledger #4242 counted no element"],
  ])("%s is not measured, in words", async (_what, rows, source) => {
    expect(await readLodState("p", reading(rows))).toEqual({ share: null, source });
  });
});

describe("readCobie — hand-over measured on the live models' manifests, never a readiness nobody measured", () => {
```

In `WebApp/src/setups/next-strip.test.ts`, replace

```ts
import { fetchJourney, standardsLine, nextLine, stepDetail, tabIndex, type Journey, type JourneyStep } from "./next-strip";
```

with

```ts
import { fetchJourney, standardsLine, nextLine, stepDetail, tabIndex, lodLine, type Journey, type JourneyStep } from "./next-strip";
```

In `WebApp/src/setups/next-strip.test.ts`, replace

```ts
  it("is -1 when the label is absent or null", () => {
    expect(tabIndex(labels, "Nope")).toBe(-1);
    expect(tabIndex(labels, null)).toBe(-1);
  });
});
```

with

```ts
  it("is -1 when the label is absent or null", () => {
    expect(tabIndex(labels, "Nope")).toBe(-1);
    expect(tabIndex(labels, null)).toBe(-1);
  });
});

describe("lodLine (MA-2b)", () => {
  it("prints the bridge's line from the newest lod_state row as is; an office (or a bridge before MA-2b) has none", () => {
    const line = "LOD state: DD → design: 38 of 264 at DD (14%) · 212 below · 14 blocked · 0 not measured — Revit's count (claimed), lead@office.example, 2026-10-03 09:15 · ledger #4242";
    expect(lodLine(journey({ lod_state: { line, share: 14, at: "2026-10-03T09:15:00.000Z", ledger: { id: 4242, hash: null } } }))).toBe(line);
    expect(lodLine(journey({ lod_state: null }))).toBe("");
    expect(lodLine(journey())).toBe("");
  });
});
```

In `WebApp/bridge/cde-store-gate.test.mjs`, replace

```js
    expect(r.checks.map((c) => c.source)).toEqual([NO_SOURCE, NO_SOURCE, NO_SOURCE]);
```

with

```js
    // MA-2b: the fourth check is the LOD state; no lod_state row was read here, so it is not measured, in words.
    expect(r.checks.map((c) => c.source)).toEqual([NO_SOURCE, NO_SOURCE, NO_SOURCE, "not measured — the newest lod_state ledger row not read"]);
```

In `WebApp/bridge/check-registry.test.mjs`, replace

```js
  it("tender with a ruleset artefact is met; design is not checkable, naming the three metrics with no server source", async () => {
    gateState.stage = "tender";
    expect(await getCheck("gate.stage").run("aster-tower")).toMatchObject({ status: "met", summary: "The “tender” stage gate passes." });
    gateState.stage = "design";
    const r = await getCheck("gate.stage").run("aster-tower");
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toBe("3 of 3 gate metrics have no server source (Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70%) — the gate cannot be confirmed.");
    expect(r.evidence.map((e) => e.detail)).toEqual(Array(3).fill("not measured — no server source: the browser scan is not persisted"));
  });
```

with

```js
  it("tender with a ruleset artefact is met; design is not checkable, naming the three metrics with no server source and the LOD state not read", async () => {
    gateState.stage = "tender";
    expect(await getCheck("gate.stage").run("aster-tower")).toMatchObject({ status: "met", summary: "The “tender” stage gate passes." });
    gateState.stage = "design";
    const r = await getCheck("gate.stage").run("aster-tower");
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toBe("4 of 4 gate metrics have no server source (Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70%, LOD state: elements at the DD row ≥ 90%) — the gate cannot be confirmed.");
    expect(r.evidence.map((e) => e.detail)).toEqual([...Array(3).fill("not measured — no server source: the browser scan is not persisted"), "not measured — the newest lod_state ledger row not read"]);
  });
```

- [ ] **Step 2: Run them, and see them fail.** From `WebApp`: `npx vitest run bridge/write-roles.test.mjs bridge/journey-store.test.mjs bridge/stage-gate.test.mjs bridge/cde-store-gate.test.mjs bridge/check-registry.test.mjs src/sentinel-core/gates src/setups/next-strip bridge/sentinel-core-bundle.test.mjs` — `Test Files  7 failed | 1 passed (8)`, `Tests  14 failed | 195 passed (209)`.

- [ ] **Step 3: The report type, the journey's line, the gate's metric, the strip's line; then rebuild the bundle.**

In `WebApp/bridge/cde-store.mjs`, replace

```js
  // MA-1a item 8: a reader's or planner's run receipt (buildRunRow words its action build:run and marks it claimed).
  "build"];
```

with

```js
  // MA-1a item 8: a reader's or planner's run receipt (buildRunRow words its action build:run and marks it claimed).
  "build",
  // MA-2b: Promote's LOD state of the model, now or after an applied changeset (lodStateRow marks it claimed).
  "lod_state"];

/** MA-2b: a lod_state row is Promote's count of the model's LOD state — read in Revit, not measured by the bridge — so whoever
 *  posts it, the bridge marks it claimed (the build:run rule). The journey line and the design gate's LOD check read the newest
 *  one. A count that is not an object is a 400. */
function lodStateRow(b) {
  const v = b.new_value;
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Object.assign(new Error("a lod_state row's new_value is the count, an object — nothing was saved"), { status: 400 });
  return { ...b, new_value: { ...v, claimed: true } };
}
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
  if (type === "build") b = buildRunRow(b);
  else if (String(b.action ?? "").trim().toLowerCase().startsWith("build:"))
```

with

```js
  if (type === "build") b = buildRunRow(b);
  else if (type === "lod_state") b = lodStateRow(b);
  else if (String(b.action ?? "").trim().toLowerCase().startsWith("build:"))
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
      //   contributor a Revit report (REVIT_REPORT_TYPES: naming, family_heal, the modelling commands' reports of MA-1a
      //   item 7, and item 8's build receipt, which the bridge words build:run and marks claimed for every caller); a
```

with

```js
      //   contributor a Revit report (REVIT_REPORT_TYPES: naming, family_heal, the modelling commands' reports of MA-1a
      //   item 7, item 8's build receipt, which the bridge words build:run and marks claimed for every caller, and MA-2b's
      //   lod_state row, marked claimed too); a
```

In `WebApp/bridge/journey-store.mjs`, replace

```js
    listTransmittals: await pick("listTransmittals", "./cde-store.mjs"),
  };
}
```

with

```js
    listTransmittals: await pick("listTransmittals", "./cde-store.mjs"),
    listAudit: await pick("listAudit", "./cde-store.mjs"),
  };
}

/** MA-2b: the LOD state line — the newest lod_state row's (Promote's count in Revit, marked claimed by the bridge), so the web
 *  strip and the Revit pane print the ledger, one wording (design :941: the views are derived from the ledger). */
export function lodStateOf(fact) {
  if (!fact.ok) return { line: `LOD state: unavailable — ${fact.error}`, share: null, at: null, ledger: null };
  const row = fact.value?.rows?.[0];
  if (!row) return { line: "LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)", share: null, at: null, ledger: null };
  const v = row.new_value ?? {};
  return {
    line: `LOD state: ${v.line ?? row.action} — Revit's count (claimed), ${row.actor}, ${String(row.at).slice(0, 16).replace("T", " ")} · ledger #${row.id}`,
    share: typeof v.share === "number" ? v.share : null, at: row.at, ledger: { id: row.id, hash: row.hash ?? null },
  };
}
```

In `WebApp/bridge/journey-store.mjs`, replace

```js
          federation: run(() => d.getFederation(key)), transmittals: run(() => d.listTransmittals(key)),
        }),
```

with

```js
          federation: run(() => d.getFederation(key)), transmittals: run(() => d.listTransmittals(key)),
          lod: run(() => d.listAudit(key, { entity_type: "lod_state", limit: 1 })), // MA-2b: the LOD state line, from the ledger
        }),
```

In `WebApp/bridge/journey-store.mjs`, replace

```js
  return { key, kind: j.kind, office_key: scope.office_key, standards, steps: j.steps, next: j.next, done: j.done, total: j.total };
```

with

```js
  return { key, kind: j.kind, office_key: scope.office_key, standards, steps: j.steps, next: j.next, done: j.done, total: j.total,
    lod_state: scope.kind === "office" ? null : lodStateOf(facts.lod) };
```

In `WebApp/src/sentinel-core/gates.ts`, replace

```ts
  | "openIssues" | "openRfis" | "hasStandardsPack" | "cobieComplete";
```

with

```ts
  | "openIssues" | "openRfis" | "hasStandardsPack" | "cobieComplete" | "lodState";
```

In `WebApp/src/sentinel-core/gates.ts`, replace

```ts
  cobieComplete: number | null; // 7D handover readiness % (from the project snapshot)
}
```

with

```ts
  cobieComplete: number | null; // 7D handover readiness % (from the project snapshot)
  /** MA-2b: the share (%) of counted elements at the DD row of the lod_matrix — the newest lod_state ledger row's (Promote's
   *  count in Revit); null until one exists ("LOD state: not measured", design §3.2). */
  lodState: number | null;
}
```

In `WebApp/src/sentinel-core/gates.ts`, replace

```ts
    { metric: "compliance", op: ">=", value: 70, label: "Standards compliance ≥ 70%" },
  ],
```

with

```ts
    { metric: "compliance", op: ">=", value: 70, label: "Standards compliance ≥ 70%" },
    // MA-2b (design §3.2, D18, blueprint P1-10): the design → coord gate reads the share at the DD row's LOD. 90 % is the
    // founder's to change (decision F5): elements Promote cannot act on (groups, structure) stay in the count.
    { metric: "lodState", op: ">=", value: 90, label: "LOD state: elements at the DD row ≥ 90%" },
  ],
```

In `WebApp/bridge/stage-gate.mjs`, replace

```js
const SOURCE = { hasStandardsPack: "ruleset artefact", openIssues: "BCF topics (bcf-store)", openRfis: "RFI store", hardClashes: "clash store", cobieComplete: "COBie on the live models" };
```

with

```js
const SOURCE = { hasStandardsPack: "ruleset artefact", openIssues: "BCF topics (bcf-store)", openRfis: "RFI store", hardClashes: "clash store", cobieComplete: "COBie on the live models",
  lodState: "the newest lod_state ledger row" }; // MA-2b
// The metrics whose reader names its own source (the models it read, the ledger row it read) in this input.
const SOURCED = { cobieComplete: "cobieSource", lodState: "lodSource" };
```

In `WebApp/bridge/stage-gate.mjs`, replace

```js
    cobieComplete: count(inputs.cobieComplete),
```

with

```js
    cobieComplete: count(inputs.cobieComplete), lodState: count(inputs.lodState),
```

In `WebApp/bridge/stage-gate.mjs`, replace

```js
    const source = !SOURCE[metric] ? NO_SERVER_SOURCE
      : metric === "cobieComplete" ? (inputs.cobieSource ?? (c.na ? `not measured — ${SOURCE[metric]} not read` : SOURCE[metric]))
      : c.na ? `not measured — ${SOURCE[metric]} not read` : SOURCE[metric];
```

with

```js
    const source = !SOURCE[metric] ? NO_SERVER_SOURCE
      : SOURCED[metric] ? (inputs[SOURCED[metric]] ?? (c.na ? `not measured — ${SOURCE[metric]} not read` : SOURCE[metric]))
      : c.na ? `not measured — ${SOURCE[metric]} not read` : SOURCE[metric];
```

In `WebApp/bridge/stage-gate.mjs`, replace

```js
  const [ruleset, topics, rfis, clashes, cobie] = await Promise.all([
    resolveArtefact(key, "ruleset"), bcfListTopics(key, { status: "all" }), docList("rfi", key), docList("clash", key),
    (deps.readCobie || readCobie)(key),
  ]);
  return {
    cobieComplete: cobie.readiness, cobieSource: cobie.source,
```

with

```js
  const [ruleset, topics, rfis, clashes, cobie, lod] = await Promise.all([
    resolveArtefact(key, "ruleset"), bcfListTopics(key, { status: "all" }), docList("rfi", key), docList("clash", key),
    (deps.readCobie || readCobie)(key), (deps.readLodState || readLodState)(key),
  ]);
  return {
    cobieComplete: cobie.readiness, cobieSource: cobie.source,
    lodState: lod.share, lodSource: lod.source, // MA-2b
```

In `WebApp/bridge/stage-gate.mjs`, replace

```js
/** COBie hand-over completeness of the project's live IFC models, from their manifests (captured with the governed
```

with

```js
/** MA-2b (design §3.2, D18): the design → coord gate's LOD state — the share at the DD row from the newest lod_state ledger row
 *  (Promote's count in Revit; the bridge marked it claimed): {share, source}. null (not measured) when there is no row yet, when
 *  the row's matrix maps DD to another project stage than design, or when it counted no element; the source says which. */
export async function readLodState(key, deps = {}) {
  const listAudit = deps.listAudit || (await import("./cde-store.mjs")).listAudit;
  const row = (await listAudit(key, { entity_type: "lod_state", limit: 1 })).rows?.[0];
  if (!row) return { share: null, source: "LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)" };
  const v = row.new_value ?? {};
  if (v.project_stage !== "design")
    return { share: null, source: `LOD state: not measured — lod_state ledger #${row.id} measured DD, which its lod_matrix maps to ${v.project_stage}, not design` };
  if (typeof v.share !== "number") return { share: null, source: `LOD state: not measured — lod_state ledger #${row.id} counted no element` };
  return { share: v.share, source: `lod_state ledger #${row.id} — ${v.line} (Revit's count, claimed: ${row.actor}, ${row.at})` };
}

/** COBie hand-over completeness of the project's live IFC models, from their manifests (captured with the governed
```

In `WebApp/src/setups/project-shell.ts`, replace

```ts
    cobieComplete: (project?.snapshot?.handover_readiness as number) ?? null, // 7D readiness (from snapshot)
  });
```

with

```ts
    cobieComplete: (project?.snapshot?.handover_readiness as number) ?? null, // 7D readiness (from snapshot)
    lodState: null, // MA-2b: measured on the bridge from the newest lod_state ledger row — Run gate reads it
  });
```

In `WebApp/src/setups/next-strip.ts`, replace

```ts
export interface Journey {
  key: string; kind: "office" | "project"; office_key: string | null;
  standards: { ids: JourneyRef; ruleset: JourneyRef; naming: JourneyRef };
  steps: JourneyStep[]; next: string | null; done: number; total: number;
}
```

with

```ts
export interface Journey {
  key: string; kind: "office" | "project"; office_key: string | null;
  standards: { ids: JourneyRef; ruleset: JourneyRef; naming: JourneyRef };
  steps: JourneyStep[]; next: string | null; done: number; total: number;
  /** MA-2b: the newest lod_state ledger row's line (null for an office; absent from a bridge before MA-2b). */
  lod_state?: { line: string; share: number | null; at: string | null; ledger: { id: number; hash: string | null } | null } | null;
}
```

In `WebApp/src/setups/next-strip.ts`, replace

```ts
/** B2: one line per step for the Guide's journey list, chosen by status — a todo's own reason never reads as "Not checkable". */
```

with

```ts
/** MA-2b: "LOD state: …" exactly as the bridge words it from the newest lod_state ledger row — the line the Revit pane prints
 *  too; "" when there is none to print (an office). */
export const lodLine = (j: Journey): string => j.lod_state?.line ?? "";

/** B2: one line per step for the Guide's journey list, chosen by status — a todo's own reason never reads as "Not checkable". */
```

In `WebApp/src/setups/next-strip.ts`, replace

```ts
    '<div id="ns-std" style="color:#9ca3af"></div>' +
```

with

```ts
    '<div id="ns-std" style="color:#9ca3af"></div>' +
    '<div id="ns-lod" style="color:#9ca3af"></div>' +
```

In `WebApp/src/setups/next-strip.ts`, replace

```ts
    el("ns-next").textContent = "";
    el("ns-open").style.display = "none";
```

with

```ts
    el("ns-next").textContent = "";
    el("ns-lod").textContent = "";
    el("ns-open").style.display = "none";
```

In `WebApp/src/setups/next-strip.ts`, replace

```ts
      el("ns-std").textContent = standardsLine(j);
```

with

```ts
      el("ns-std").textContent = standardsLine(j);
      el("ns-lod").textContent = lodLine(j);
```

Then, from `WebApp`: `npm run build:bridge-core` — `bridge\sentinel-core.mjs  69.6kb`.

- [ ] **Step 4: Run them, and see them pass.** The same command — `Test Files  8 passed (8)`, `Tests  209 passed (209)`; `npx vitest run bridge/` — `Test Files  86 passed (86)`, `Tests  1748 passed | 1 skipped (1749)`.

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/journey-store.mjs WebApp/bridge/stage-gate.mjs WebApp/src/sentinel-core/gates.ts WebApp/src/setups/project-shell.ts WebApp/src/setups/next-strip.ts WebApp/bridge/sentinel-core.mjs WebApp/bridge/write-roles.test.mjs WebApp/bridge/journey-store.test.mjs WebApp/bridge/stage-gate.test.mjs WebApp/bridge/cde-store-gate.test.mjs WebApp/bridge/check-registry.test.mjs WebApp/src/sentinel-core/gates.test.ts WebApp/src/setups/next-strip.test.ts
git commit -F - <<'EOF'
feat(lod): the lod_state row is a Revit report the bridge marks claimed; the journey's LOD state line from the newest row (the web Next strip prints it); the design gate reads its share, "not measured" until one exists (MA-2b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 7 — Revit-bound: Promote's LOD state now, the DD IDS checked before commit, the LOD state after, the pane's line

**Files:**
- Create `tools/promote-check/Ma2bWiring.cs`; modify `tools/promote-check/Check.cs`, `tools/promote-check/LodStateChecks.cs` (the check's words), `tools/promote-check/PlacementBlock.cs` (the review passes the Promote context)
- Modify `SentinelAddin/GhostBuilder/LodState.cs` — `StageIds.Line`, `Headline`, `WentBack`, `PlacedAnyway`, `NotChecked`
- Create `SentinelAddin/GhostBuilder/PromoteContext.cs` — `Fetch`, `JudgeApplied`, `PlaceAnyway`
- Modify `SentinelAddin/Coordination/ArtefactClient.cs` (`StageIds`), `SentinelAddin/Commands.PromoteWalls.cs` (`ReadFacts`, `LodStateOf`, `LodStateAfter`, the header, the row), `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` (`ExecutionResult.Ids`), `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` (the check before commit), `SentinelAddin/Commands.ReviewChangesets.cs` (the fetch, the note, the LOD state after), `SentinelAddin/Coordination/GovernedQuery.cs` (`JourneyInfo.LodLine`), `SentinelAddin/UI/SentinelPanelViewModel.cs`, `SentinelAddin/UI/SentinelPanel.xaml`

**Interfaces:** `PromoteContext {Standards, Mx, MxLabel, Classes, NotRun, Ids, IdsWhy}`, `PromoteContext.Fetch(key)` (blocking; called inside `Task.Run` only), `PromoteContext.JudgeApplied(doc, ids, applied, kindOf) → (Fails, NotRead)`, `PromoteContext.PlaceAnyway(fails, matrix, what)`. `ArtefactClient.StageIds(key, out why)`. `PromoteWallsCommand.ReadFacts(doc, classes)`, `LodStateOf(doc, plans, pc, when)`, `LodStateAfter(doc, pc)`. `ChangesetPlacementEvent.SetRequest(cs, ticked, doc, placement = null, promote = null)`. `ExecutionResult.Ids`. `JourneyInfo.LodLine`; `SentinelPanelViewModel.LodLine`. The words: `StageIds.Line` → `"W 312312 (Walls · DD): missing Pset_WallCommon.FireRating"`; `Headline` → `"This changeset leaves N element(s) failing the DD IDS made from <matrix>"`; `WentBack` → `"You went back at the DD IDS check — nothing was placed. N element(s) would have failed the DD IDS made from <matrix>."`; `PlacedAnyway` → the headline + `" — placed anyway, as the person chose: …"`; `NotChecked` → `"DD IDS: not checked for <requirements> — Sentinel has no Revit reader for them, so they are neither passed nor failed"`; a Promote changeset whose IDS was not read: `"DD IDS: not checked — <why>"`.

- [ ] **Step 1: The failing checks (the words, and the wiring by source scan).**

`Create` `tools/promote-check/Ma2bWiring.cs`:

```csharp
#nullable disable
static partial class Check
{
    // ── 32. MA-2b: the Revit-bound wiring, by source scan (the commands, the placement event, the pane and the HTTP client
    //        compile in no check project; drill MA2b runs them) ───────────────────────────────────────────────────────────
    static void Ma2bWiringChecks()
    {
        Console.WriteLine("\nMA-2b — wiring (source scans)");
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        string promote = Src("Commands.PromoteWalls.cs"), review = Src("Commands.ReviewChangesets.cs"), place = Src("GhostBuilder", "ChangesetPlacementEvent.cs");
        string ctx = Src("GhostBuilder", "PromoteContext.cs");
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        Ok(Count(promote, "PromoteContext.Fetch(") == 1 && promote.Contains("Task.Run(() => PromoteContext.Fetch(key))")
           && Count(review, "PromoteContext.Fetch(") == 1 && review.Contains("Task.Run(() => PromoteContext.Fetch(key))")
           && ctx.Contains("ArtefactClient.StageIds(key, out var why)") && Src("Coordination", "ArtefactClient.cs").Contains("\"/artefacts/lod_matrix/ids\""),
           "no network call on Revit's API thread: the matrix and the DD IDS (GET …/artefacts/lod_matrix/ids) are read inside Task.Run, in Promote and in the review");
        Ok(promote.Contains("var lod = LodStateOf(doc, plans, pc, \"now\");") && promote.IndexOf("GovernedNotify.Report(\"LOD state now\"", StringComparison.Ordinal) > 0
           && promote.IndexOf("GovernedNotify.Report(\"LOD state now\"", StringComparison.Ordinal) < promote.IndexOf("dlg.Show()", StringComparison.Ordinal)
           && promote.Contains("\"\\n\\n\" + ddNow + \"\\n\" + lodText"),
           "Promote's header shows the LOD state now (step 2), and its lod_state row is posted on every run with a matrix — the read-only run too");
        Ok(promote.Contains("GovernedElementExtractor.ExtractByIds(doc, doc.Title, ruled.Select(x => x.Element.Id), org)")
           && promote.Contains("var r = LodState.Read(plans, pc.Mx, pc.Ids, pc.IdsWhy, props, pc.NotRun);")
           && promote.Contains("var plans = PromotePlanner.Plan(pc.Classes, walls, others, levels, docTypes, classTypes, pc.Standards.Guideline, pc.Mx?.SnapMm);"),
           "the LOD state reads the facts Promote reads, and the DD IDS judges the elements the rules pass, through the extractor");
        int judged = place.IndexOf("PromoteContext.JudgeApplied(doc, ids, result.Applied, kindOf)", StringComparison.Ordinal);
        Ok(judged > 0 && judged < place.IndexOf("BlockCheck.AddedSince(doc, before)", StringComparison.Ordinal)
           && judged < place.IndexOf("group.Assimilate()", StringComparison.Ordinal)
           && place.Contains("return new ChangesetExecutor.ExecutionResult { NotRun = true, Error = StageIds.WentBack(fails.Count, ids.Matrix) };")
           && place.Contains("if (before == null && promote?.Ids == null)") && place.Contains("result.Ids = \"DD IDS: not checked — \" + promote.IdsWhy;"),
           "the DD IDS is checked before commit where the BLOCK check runs (step 5): going back rolls the group back; a check that could not run is said");
        int afterAt = review.IndexOf("PromoteWallsCommand.LodStateAfter(doc, promote)", StringComparison.Ordinal);
        Ok(afterAt > review.IndexOf("onDone = result =>", StringComparison.Ordinal) && review.Contains("GovernedNotify.Report(\"LOD state after\"")
           && review.Contains("handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);"),
           "after a Promote changeset is applied, the LOD state after is read on the API thread and posted as one more lod_state row (step 10)");
        Ok(Src("UI", "SentinelPanel.xaml").Contains("<TextBlock Text=\"{Binding LodLine}\"") && Src("Coordination", "GovernedQuery.cs").Contains("LodLine = Str(Obj(root, \"lod_state\"), \"line\") ?? \"\",")
           && Count(Src("UI", "SentinelPanelViewModel.cs"), "ScanRulesetLine = LodLine = \"\";") == 3,
           "the Live Coordination pane prints the journey's LOD state line — the ledger's, as the web strip does — and clears it with the others");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        LodStateChecks(m, m2);
```

with

```csharp
        LodStateChecks(m, m2);
        Ma2bWiringChecks();
```

In `tools/promote-check/LodStateChecks.cs`, replace

```csharp
           "the route's reply reads with the matrix's label and what matrixToIds could not place; a reply it cannot read is said, never an empty IDS");
    }
```

with

```csharp
           "the route's reply reads with the matrix's label and what matrixToIds could not place; a reply it cannot read is said, never an empty IDS");

        // The check before commit's words (design §3.4 step 5): what fails is said, with its rule; what cannot be read is said too.
        var unrated = V("wall unrated");
        var fails = new List<string> { StageIds.Line("W 312312", "Walls · DD", unrated) };
        Ok(fails[0] == "W 312312 (Walls · DD): missing Pset_WallCommon.FireRating" && StageIds.Line("W 1", "Walls · DD", V("wall rated")) == null,
           "an element that fails is one line: its label, the specification (the class and stage) and every missing property");
        Ok(StageIds.WentBack(1, "lod_matrix@2 · office · abababababab…") == "You went back at the DD IDS check — nothing was placed. 1 element(s) would have failed the DD IDS made from lod_matrix@2 · office · abababababab…."
           && StageIds.PlacedAnyway(fails, "lod_matrix@2") == "This changeset leaves 1 element(s) failing the DD IDS made from lod_matrix@2 — placed anyway, as the person chose: W 312312 (Walls · DD): missing Pset_WallCommon.FireRating",
           "going back and placing anyway are said in words, naming the matrix the IDS was made from");
        Ok(StageIds.NotChecked(unrated.NotRead.Concat(V("wall rated").NotRead)) == "DD IDS: not checked for Pset_WallCommon.LoadBearing — Sentinel has no Revit reader for them, so they are neither passed nor failed"
           && StageIds.NotChecked(new string[0]) == null,
           "a property Revit cannot read is said beside the answer — never dropped, never passed");
    }
```

In `tools/promote-check/PlacementBlock.cs`, replace

```csharp
           && Src("Commands.ReviewChangesets.cs").Contains("handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement);"),
```

with

```csharp
           && Src("Commands.ReviewChangesets.cs").Contains("handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);"), // MA-2b: + the DD IDS
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check` fails to compile — `6 Error(s)`: `'StageIds' does not contain a definition for 'Line'`, `… 'NotChecked'`, `… 'WentBack'`, `… 'PlacedAnyway'`.

- [ ] **Step 3: The wiring.**

In `SentinelAddin/GhostBuilder/LodState.cs`, replace

```csharp
        /// <summary>An extracted element's values, "Pset.Prop" → value (the first row of a name, case ignored).</summary>
```

with

```csharp
        // ── the check before commit's words (design §3.4 step 5): what fails is said, never silently dropped ──────────────────

        /// <summary>One element that fails: "W 312312 (Walls · DD): missing Pset_WallCommon.FireRating"; null when nothing is missing.</summary>
        public static string Line(string label, string spec, Verdict v) =>
            v.Missing.Count == 0 ? null : $"{label} ({spec}): missing {string.Join(", ", v.Missing)}";

        public static string Headline(int n, string matrix) => $"This changeset leaves {n} element(s) failing the DD IDS made from {matrix}";

        /// <summary>The line when the person went back: nothing was placed.</summary>
        public static string WentBack(int n, string matrix) =>
            $"You went back at the DD IDS check — nothing was placed. {n} element(s) would have failed the DD IDS made from {matrix}.";

        /// <summary>The summary and ledger-note line when the person placed it anyway, the first five elements named.</summary>
        public static string PlacedAnyway(IReadOnlyList<string> fails, string matrix) =>
            Headline(fails.Count, matrix) + " — placed anyway, as the person chose: " + string.Join("; ", fails.Take(5)) +
            (fails.Count > 5 ? $"; … and {fails.Count - 5} more" : "");

        /// <summary>What the check could not judge, said beside its answer: "DD IDS: not checked for Pset_WallCommon.LoadBearing — …".</summary>
        public static string NotChecked(IEnumerable<string> notRead)
        {
            var n = notRead.Distinct(StringComparer.Ordinal).ToList();
            return n.Count == 0 ? null : "DD IDS: not checked for " + string.Join(", ", n) + " — Sentinel has no Revit reader for them, so they are neither passed nor failed";
        }

        /// <summary>An extracted element's values, "Pset.Prop" → value (the first row of a name, case ignored).</summary>
```

In `SentinelAddin/Coordination/ArtefactClient.cs`, replace

```csharp
        /// <summary>The bridge's answer → the artefact in force, updating the cache. Pure but for the cache writes.</summary>
```

with

```csharp
        /// <summary>MA-2b: GET /cde/:key/artefacts/lod_matrix/ids — the DD stage IDS the bridge makes from the matrix in force
        /// (matrixToIds; never installed as ids@n). The reply's JSON, or null with <paramref name="why"/>: the bridge's own words on a
        /// refusal ("HTTP 404: no lod_matrix installed for …"), else the transport error. Blocking (4 s), never throws; run it OFF
        /// the API thread (PromoteContext.Fetch).</summary>
        public static string? StageIds(string key, out string? why)
        {
            why = null;
            try
            {
                var cfg = BcfConfig.Load();
                using var cts = new CancellationTokenSource(DefaultTimeout);
                using var msg = new HttpRequestMessage(HttpMethod.Get,
                    (cfg.ServiceUrl ?? "").TrimEnd('/') + "/cde/" + Uri.EscapeDataString((key ?? "").Trim()) + "/artefacts/lod_matrix/ids");
                if (!string.IsNullOrWhiteSpace(cfg.ServiceToken)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                using var resp = Http.SendAsync(msg, cts.Token).GetAwaiter().GetResult();
                var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (resp.IsSuccessStatusCode) return text;
                string? said = null;
                try { using var d = JsonDocument.Parse(text); if (d.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String) said = m.GetString(); } catch { }
                why = $"HTTP {(int)resp.StatusCode}: {said ?? resp.ReasonPhrase}";
                return null;
            }
            catch (Exception e)
            {
                why = e is OperationCanceledException ? "timed out after " + DefaultTimeout.TotalSeconds.ToString("0.#", CultureInfo.InvariantCulture) + " s"
                    : (e.InnerException?.Message ?? e.Message);
                return null;
            }
        }

        /// <summary>The bridge's answer → the artefact in force, updating the cache. Pure but for the cache writes.</summary>
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        // The standards and the LOD matrix (off the API thread, the Annotate pattern), then the facts (on it).
        var mxTask = Task.Run(() => ArtefactClient.Resolve(key, "lod_matrix"));
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false)).GetAwaiter().GetResult();
```

with

```csharp
        // The standards, the LOD matrix and (MA-2b) its DD stage IDS, off the API thread (the Annotate pattern) — PromoteContext, which
        // the review's check before commit reads too — then the facts (on it).
        var pc = Task.Run(() => PromoteContext.Fetch(key)).GetAwaiter().GetResult();
        var standards = pc.Standards;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        var mxSource = mxTask.GetAwaiter().GetResult();
        LodMatrix mx = null;
        if (mxSource.Origin != "none")
        {
            mx = LodMatrix.FromBody(mxSource.BodyJson ?? "", out var mxErr); // a body it cannot read is none, never a partial matrix
            if (mxErr != null) mxSource = ArtefactClient.None("lod_matrix", $"{mxSource.Label} did not parse: {mxErr}");
        }
        var notRun = new List<string>();
        var classes = LodMatrix.Classes(mx, mxSource.Label, standards.Guideline, notRun);
        // With no matrix the header says "walls only"; otherwise each class left out is named below the plan.
        var header = standards.Header + "\n" + (mx == null ? notRun[0] : "LOD matrix: " + mxSource.Label + (mx.Draft ? " (DRAFT)" : ""));
        if (mx == null) notRun.Clear();
        header += "\n" + PlacementPolicy.TemplateLine(standards.Guideline.HasCatalog, officeHave, officeAll, standards.CatalogSource.Label);

        var docTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); // basic wall type → its Function
        foreach (var t in new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().Where(t => t.Kind == WallKind.Basic))
            docTypes[t.Name] = t.Function.ToString();
        // The document's types per class, never across classes (BDS_INT_ARC_GYPS_50 mm is both a wall and a ceiling type).
        var classTypes = new Dictionary<string, IReadOnlyDictionary<string, double?>>(StringComparer.Ordinal);
        foreach (var (kind, bic) in Others.Where(o => classes.Contains(PromoteWallsPlanner.Classes[o.Kind].Category)))
        {
            var d = new Dictionary<string, double?>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>())
                d[ChangesetExecutor.TypeLabel(t)] = (t as HostObjAttributes)?.GetCompoundStructure() is CompoundStructure cs ? cs.GetWidth() * FtToMm : (double?)null;
            classTypes[PromoteWallsPlanner.Classes[kind].Category] = d;
        }
        var levels = ChangesetExecutor.Stories(doc); // the one projection of the model's levels (MA-1a review amendment C6)
        // Walls are read for doors too: a door's location reads its host storey's one-type verdict.
        var walls = classes.Contains("Walls") || classes.Contains("Doors")
            ? new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>().Select(w => Fact(doc, w)).ToList()
            : new List<WallFact>();
        var others = Others.Where(o => classes.Contains(PromoteWallsPlanner.Classes[o.Kind].Category))
            .SelectMany(o => new FilteredElementCollector(doc).OfCategory(o.Bic).WhereElementIsNotElementType().Select(e => OtherFact(doc, e, o.Kind)))
            .ToList();
        if ((classes.Contains("Walls") ? walls.Count : 0) + others.Count == 0)
```

with

```csharp
        LodMatrix mx = pc.Mx;
        var notRun = pc.NotRun.ToList();
        var classes = pc.Classes;
        // With no matrix the header says "walls only"; otherwise each class left out is named below the plan.
        var header = standards.Header + "\n" + (mx == null ? notRun[0] : "LOD matrix: " + pc.MxLabel + (mx.Draft ? " (DRAFT)" : ""));
        if (mx == null) notRun.Clear();
        header += "\n" + PlacementPolicy.TemplateLine(standards.Guideline.HasCatalog, officeHave, officeAll, standards.CatalogSource.Label);

        var (walls, others, docTypes, classTypes, levels) = ReadFacts(doc, classes);
        if ((classes.Contains("Walls") ? walls.Count : 0) + others.Count == 0)
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
        plannerClock.Stop();
        var actor = UserSession.Actor;
```

with

```csharp
        plannerClock.Stop();
        var actor = UserSession.Actor;
        // MA-2b, design §3.4 step 2: the LOD state now — one lod_state row per run, the read-only one too (the gate reads it).
        var lod = LodStateOf(doc, plans, pc, "now");
        if (lod != null) GovernedNotify.Report("LOD state now", CommandReports.LodState(lod, null, actor), key);
        var lodLines = lod == null ? new List<string>() : lod.LevelLines();
        var lodText = lod == null ? $"LOD state: not measured — no lod_matrix@n to measure against ({pc.MxLabel})"
            : "LOD state now (recorded on the ledger): " + lod.Line + "\n" + string.Join("\n", lodLines.Take(12)) + (lodLines.Count > 12 ? $"\n… and {lodLines.Count - 12} more" : "");
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
                          "\n\n" + string.Join("\n", lines) + "\n\n" + ddNow +
                          (asks.Count > 0 ? "\n\nDD also asks (listed for a person, not checked by Promote" + (mx.Draft ? "; DRAFT, decision LM-1" : "") + "):\n" + string.Join("\n", asks) : "") +
```

with

```csharp
                          "\n\n" + string.Join("\n", lines) + "\n\n" + ddNow + "\n" + lodText +
                          (asks.Count > 0 ? "\n\nDD also asks (the DD IDS: counted in the LOD state, checked again before commit" + (mx.Draft ? "; DRAFT, decision LM-1" : "") + "):\n" + string.Join("\n", asks) +
                                            (pc.Ids == null ? "\nDD IDS: not read — " + pc.IdsWhy : pc.Ids.Unmatched.Count > 0 ? "\nNot in the DD IDS: " + string.Join("; ", pc.Ids.Unmatched) : "") : "") +
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
                          (bodies.Count > 0 ? "\n\nNo = a read-only run: nothing is filed, nothing changes."
```

with

```csharp
                          (bodies.Count > 0 ? "\n\nNo = a read-only run: nothing is filed, nothing in the model changes" + (lod != null ? " (the LOD state above is on the ledger)." : ".")
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
            receipt.Parameters["lod_matrix"] = mxSource.Label;
```

with

```csharp
            receipt.Parameters["lod_matrix"] = pc.MxLabel;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
    /// <summary>One wall's facts, read on the API thread. A stacked-wall member reads as not basic: Revit types it
```

with

```csharp
    /// <summary>The facts Promote plans from, read on the API thread for the classes that run: the walls (read for doors too: a door's
    /// location reads its host storey's one-type verdict), the other classes' elements, the document's basic wall types → their
    /// Function, its types per class (never across classes: BDS_INT_ARC_GYPS_50 mm is both a wall and a ceiling type) → build-up
    /// mm, and its story levels. MA-2b: Promote's run and the LOD state after a Promote changeset read them the same way.</summary>
    internal static (List<WallFact> Walls, List<ElementFact> Others, Dictionary<string, string> DocTypes,
                     Dictionary<string, IReadOnlyDictionary<string, double?>> ClassTypes, List<LevelFact> Levels) ReadFacts(Document doc, IReadOnlyCollection<string> classes)
    {
        var docTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); // basic wall type → its Function
        foreach (var t in new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().Where(t => t.Kind == WallKind.Basic))
            docTypes[t.Name] = t.Function.ToString();
        var classTypes = new Dictionary<string, IReadOnlyDictionary<string, double?>>(StringComparer.Ordinal);
        foreach (var (kind, bic) in Others.Where(o => classes.Contains(PromoteWallsPlanner.Classes[o.Kind].Category)))
        {
            var d = new Dictionary<string, double?>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>())
                d[ChangesetExecutor.TypeLabel(t)] = (t as HostObjAttributes)?.GetCompoundStructure() is CompoundStructure cs ? cs.GetWidth() * FtToMm : (double?)null;
            classTypes[PromoteWallsPlanner.Classes[kind].Category] = d;
        }
        var levels = ChangesetExecutor.Stories(doc); // the one projection of the model's levels (MA-1a review amendment C6)
        var walls = classes.Contains("Walls") || classes.Contains("Doors")
            ? new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>().Select(w => Fact(doc, w)).ToList()
            : new List<WallFact>();
        var others = Others.Where(o => classes.Contains(PromoteWallsPlanner.Classes[o.Kind].Category))
            .SelectMany(o => new FilteredElementCollector(doc).OfCategory(o.Bic).WhereElementIsNotElementType().Select(e => OtherFact(doc, e, o.Kind)))
            .ToList();
        return (walls, others, docTypes, classTypes, levels);
    }

    /// <summary>MA-2b (design §3.4 steps 2 and 10): the LOD state of these plans — the DD stage IDS judged, on the API thread and
    /// read-only, on every element whose DD rules pass and whose class asks for properties (read through GovernedElementExtractor,
    /// as the IDS reads an element). Null with no lod_matrix: there is nothing to measure against.</summary>
    internal static LodStateReport LodStateOf(Document doc, IReadOnlyList<StoreyPlan> plans, PromoteContext pc, string when)
    {
        if (pc.Mx == null) return null;
        string org = App.OrgFor(doc);
        var props = new Dictionary<string, StageIds.Verdict>(StringComparer.Ordinal);
        if (pc.Ids != null)
        {
            var ruled = plans.SelectMany(p => p.Lod)
                .Where(f => f.RulesOk && pc.Mx.Properties.TryGetValue(f.Category, out var ps) && ps.Count > 0)
                .Select(f => (f.UniqueId, Element: doc.GetElement(f.UniqueId))).Where(x => x.Element != null).ToList();
            var read = GovernedElementExtractor.ExtractByIds(doc, doc.Title, ruled.Select(x => x.Element.Id), org); // in the ids' order
            for (int i = 0; i < ruled.Count && i < read.Count; i++)
                props[ruled[i].UniqueId] = pc.Ids.Judge(read[i].identity.Class, StageIds.ValuesOf(read[i]), org);
        }
        var r = LodState.Read(plans, pc.Mx, pc.Ids, pc.IdsWhy, props, pc.NotRun);
        r.When = when;
        r.Matrix = pc.MxLabel;
        r.Guideline = pc.Standards.GuidelineSource.Label;
        r.Ids = pc.Ids != null ? "DD IDS made from " + pc.Ids.Matrix : "DD IDS not read — " + pc.IdsWhy;
        return r;
    }

    /// <summary>MA-2b, design §3.4 step 10: the LOD state after a Promote changeset was applied — the facts read again and planned
    /// again, as Promote reads them. API thread (the review's result handler runs inside the placement event).</summary>
    internal static LodStateReport LodStateAfter(Document doc, PromoteContext pc)
    {
        var (walls, others, docTypes, classTypes, levels) = ReadFacts(doc, pc.Classes);
        var plans = PromotePlanner.Plan(pc.Classes, walls, others, levels, docTypes, classTypes, pc.Standards.Guideline, pc.Mx?.SnapMm);
        return LodStateOf(doc, plans, pc, "after");
    }

    /// <summary>One wall's facts, read on the API thread. A stacked-wall member reads as not basic: Revit types it
```

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
        /// MA-1a item 6: what the placement block did to the created elements — worksets, phase — or why it did nothing;
```

with

```csharp
        /// MA-2b: the DD IDS check's line (design §3.4 step 5) — placed anyway with N element(s) failing, and what it could not read
        /// — or why it did not run; null on a changeset that is not Promote's. Set by ChangesetPlacementEvent; it rides on the note.
        public string Ids { get; set; }
        /// MA-1a item 6: what the placement block did to the created elements — worksets, phase — or why it did nothing;
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
    private GuidelinePlacement _placement; // MA-1a item 6: the project's placement block, fetched by the caller; null = none

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc, GuidelinePlacement placement = null)
    { _cs = cs; _ticked = ticked; _doc = doc; _placement = placement; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked; var doc = _doc; var placement = _placement;
        _cs = null; _ticked = null; _doc = null; _placement = null;
```

with

```csharp
    private GuidelinePlacement _placement; // MA-1a item 6: the project's placement block, fetched by the caller; null = none
    private PromoteContext _promote;       // MA-2b: a Promote changeset's DD IDS, fetched by the caller; null = not Promote's

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc, GuidelinePlacement placement = null, PromoteContext promote = null)
    { _cs = cs; _ticked = ticked; _doc = doc; _placement = placement; _promote = promote; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked; var doc = _doc; var placement = _placement; var promote = _promote;
        _cs = null; _ticked = null; _doc = null; _placement = null; _promote = null;
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
            var before = BlockCheck.Before(doc, out var note);
            if (before == null)
            {
                result = new ChangesetExecutor { Placement = plan }.Execute(doc, cs, ticked);
                result.Block = note; // "not checked — the ruleset has not loaded yet", or null: no BLOCK rule can fire
            }
            else result = RunChecked(doc, cs, ticked, before, plan);
```

with

```csharp
            var before = BlockCheck.Before(doc, out var note);
            // MA-2b (design §3.4 step 5): a Promote changeset with a DD IDS runs in the checked group too, so the person can go back.
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
            // A Promote changeset whose DD IDS could not be read is placed as before, and the result says it was not checked.
            if (promote != null && promote.Ids == null && !result.NotRun) result.Ids = "DD IDS: not checked — " + promote.IdsWhy;
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
    private static ChangesetExecutor.ExecutionResult RunChecked(Document doc, ChangesetDto cs, HashSet<string> ticked, ScanReport before, PlacementPlan plan)
    {
```

with

```csharp
    /// MA-2b: <paramref name="before"/> is null when no BLOCK rule can fire, <paramref name="ids"/> when the changeset is not Promote's
    /// (or its DD IDS was not read); the group runs when either check does.
    private static ChangesetExecutor.ExecutionResult RunChecked(Document doc, ChangesetDto cs, HashSet<string> ticked, ScanReport before, PlacementPlan plan, StageIds ids = null)
    {
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
            var added = BlockCheck.AddedSince(doc, before);
```

with

```csharp
            // MA-2b (design §3.4 step 5): the DD IDS made from the matrix, judged on what this changeset applied — before the BLOCK
            // check and before the group is kept. Going back rolls everything back; the changeset stays proposed.
            string idsLine = null;
            if (ids != null)
            {
                var kindOf = (cs.Elements ?? new List<ChangesetElementDto>()).ToDictionary(e => e.ProposalGuid, e => e.Kind ?? "wall");
                var (fails, notRead) = PromoteContext.JudgeApplied(doc, ids, result.Applied, kindOf);
                if (fails.Count > 0 && !PromoteContext.PlaceAnyway(fails, ids.Matrix, $"changeset \"{cs.Name}\""))
                {
                    SentinelUndo.RollBack(group, doc);
                    return new ChangesetExecutor.ExecutionResult { NotRun = true, Error = StageIds.WentBack(fails.Count, ids.Matrix) };
                }
                var said = new[] { fails.Count > 0 ? StageIds.PlacedAnyway(fails, ids.Matrix) : null, StageIds.NotChecked(notRead) }.Where(x => x != null).ToList();
                idsLine = said.Count > 0 ? string.Join(" ", said) : $"DD IDS: every element passed ({ids.Matrix})";
            }
            var added = before == null ? new List<Violation>() : BlockCheck.AddedSince(doc, before);
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
            result.Block = block;
            return result;
```

with

```csharp
            result.Block = block;
            result.Ids = idsLine;
            return result;
```

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
using System;
using System.Collections.Generic;
```

with

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
```

with

```csharp
                if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
                if (result.Ids != null) said = result.Ids + (string.IsNullOrEmpty(said) ? "" : " | " + said);     // MA-2b
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                if (Report(cfg, key, cs.Id, result.Applied, rejected, said))
                    UndoWatcher.Remember(UndoWatcher.TxName(fresh.Name, fresh.Id), key, fresh.Id, result.Applied.Select(a => a.ProposalGuid));
```

with

```csharp
                if (Report(cfg, key, cs.Id, result.Applied, rejected, said))
                    UndoWatcher.Remember(UndoWatcher.TxName(fresh.Name, fresh.Id), key, fresh.Id, result.Applied.Select(a => a.ProposalGuid));
                // MA-2b, design §3.4 step 10: the LOD state after a Promote changeset, read again on this (the API) thread — one more
                // lod_state row, which the gate and the strips read as the newest.
                string after = null;
                if (promote != null && result.Applied.Count > 0)
                {
                    try
                    {
                        var lod = PromoteWallsCommand.LodStateAfter(doc, promote);
                        if (lod != null)
                        {
                            GovernedNotify.Report("LOD state after", CommandReports.LodState(lod, new[] { fresh.Id }, UserSession.Actor), key);
                            after = "LOD state after (recorded on the ledger): " + lod.Line;
                        }
                    }
                    catch (Exception ex) { after = "LOD state after: not read — " + ex.Message; }
                }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
                    (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : "") +
```

with

```csharp
                    (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : "") +
                    (result.Ids != null ? "\n\n" + result.Ids : "") + (after != null ? "\n\n" + after : "") +
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
            handler.Completed += onDone;
            handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement);
```

with

```csharp
            handler.Completed += onDone;
            handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
            Action<ChangesetExecutor.ExecutionResult> onDone = null;
```

with

```csharp
            // MA-2b (design §3.4 steps 5 and 10): a Promote changeset is checked against the DD IDS made from the LOD matrix before
            // commit, and its LOD state after is recorded — both from what PromoteContext reads, fetched off this thread.
            var promote = fresh.Source == "promote" ? Task.Run(() => PromoteContext.Fetch(key)).GetAwaiter().GetResult() : null;
            Action<ChangesetExecutor.ExecutionResult> onDone = null;
```

In `SentinelAddin/Coordination/GovernedQuery.cs`, replace

```csharp
            public string? RulesetLabel; // "unavailable — …" when the bridge could not read the standards
        }
```

with

```csharp
            public string? RulesetLabel; // "unavailable — …" when the bridge could not read the standards
            /// <summary>MA-2b: "LOD state: …" exactly as the bridge words it from the newest lod_state ledger row (the web strip prints
            /// the same); "" for an office, or from a bridge before MA-2b.</summary>
            public string LodLine = "";
        }
```

In `SentinelAddin/Coordination/GovernedQuery.cs`, replace

```csharp
                    RulesetLabel = Str(rs, "label"),
                };
```

with

```csharp
                    RulesetLabel = Str(rs, "label"),
                    LodLine = Str(Obj(root, "lod_state"), "line") ?? "",
                };
```

In `SentinelAddin/UI/SentinelPanelViewModel.cs`, replace

```csharp
    private string _scanRulesetLine = "";
    public string ScanRulesetLine { get => _scanRulesetLine; private set { _scanRulesetLine = value; OnChanged(); } }
```

with

```csharp
    private string _scanRulesetLine = "";
    public string ScanRulesetLine { get => _scanRulesetLine; private set { _scanRulesetLine = value; OnChanged(); } }
    private string _lodLine = "";
    /// MA-2b: "LOD state: …" from the newest lod_state ledger row, as the journey words it (the web's Next strip prints the same).
    public string LodLine { get => _lodLine; private set { _lodLine = value; OnChanged(); } }
```

In `SentinelAddin/UI/SentinelPanelViewModel.cs`, replace

```csharp
            JourneyKey = $"Journey · {projectKey} — loading…";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = "";
```

with

```csharp
            JourneyKey = $"Journey · {projectKey} — loading…";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = LodLine = "";
```

In `SentinelAddin/UI/SentinelPanelViewModel.cs`, replace

```csharp
            StandardsLine = j?.StandardsLine ?? "";
```

with

```csharp
            StandardsLine = j?.StandardsLine ?? "";
            LodLine = j?.LodLine ?? "";
```

In `SentinelAddin/UI/SentinelPanelViewModel.cs`, replace

```csharp
            JourneyKey = "Journey — not bound — Sentinel ▸ Project Setup";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = "";
```

with

```csharp
            JourneyKey = "Journey — not bound — Sentinel ▸ Project Setup";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = LodLine = "";
```

In `SentinelAddin/UI/SentinelPanelViewModel.cs`, replace

```csharp
            JourneyKey = "Journey — loading…";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = "";
```

with

```csharp
            JourneyKey = "Journey — loading…";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = LodLine = "";
```

In `SentinelAddin/UI/SentinelPanel.xaml`, replace

```xml
                    <TextBlock Text="{Binding NextLine}" FontSize="11" TextWrapping="Wrap"/>
```

with

```xml
                    <TextBlock Text="{Binding NextLine}" FontSize="11" TextWrapping="Wrap"/>
                    <TextBlock Text="{Binding LodLine}" FontSize="11" TextWrapping="Wrap"/>
```

`Create` `SentinelAddin/GhostBuilder/PromoteContext.cs`:

```csharp
#nullable disable
// MA-2b — what Promote's LOD state and its check before commit read: the standards, the lod_matrix and the DD stage IDS the
// bridge makes from it (matrixToIds, GET /cde/:key/artefacts/lod_matrix/ids). Fetch runs OFF the API thread (the callers wrap it
// in Task.Run — the Annotate pattern); the judging runs ON it, read-only (GovernedElementExtractor), inside the changeset's open
// TransactionGroup when it checks before commit, the way the BLOCK check runs.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public sealed class PromoteContext
    {
        public GhostStandards Standards;
        /// <summary>The parsed lod_matrix@n, or null (none installed, or one that did not parse: <see cref="MxLabel"/> says which).</summary>
        public LodMatrix Mx;
        public string MxLabel;
        /// <summary>The classes Promote runs, and why the others do not (LodMatrix.Classes).</summary>
        public List<string> Classes, NotRun = new List<string>();
        /// <summary>The DD stage IDS, or null with <see cref="IdsWhy"/> (no matrix, a refusal, the bridge unreachable).</summary>
        public StageIds Ids;
        public string IdsWhy;

        /// <summary>The three reads side by side. Blocking (the guideline and catalogue have their own caps, the matrix and the IDS
        /// 4 s); never throws. Call it OFF the API thread: Task.Run(() => PromoteContext.Fetch(key)).</summary>
        public static PromoteContext Fetch(string key)
        {
            var mxTask = Task.Run(() => ArtefactClient.Resolve(key, "lod_matrix"));
            var idsTask = Task.Run(() => { var json = ArtefactClient.StageIds(key, out var why); return (json, why); });
            var pc = new PromoteContext { Standards = GhostStandards.Load(key, layers: false) };
            var src = mxTask.GetAwaiter().GetResult();
            if (src.Origin != "none")
            {
                pc.Mx = LodMatrix.FromBody(src.BodyJson ?? "", out var err); // a body it cannot read is none, never a partial matrix
                if (err != null) src = ArtefactClient.None("lod_matrix", $"{src.Label} did not parse: {err}");
            }
            pc.MxLabel = src.Label;
            pc.Classes = LodMatrix.Classes(pc.Mx, pc.MxLabel, pc.Standards.Guideline, pc.NotRun);
            var (idsJson, idsWhy) = idsTask.GetAwaiter().GetResult();
            if (idsJson != null) pc.Ids = StageIds.FromReply(idsJson, out idsWhy);
            pc.IdsWhy = idsWhy;
            return pc;
        }

        /// <summary>Design §3.4 step 5, the check before commit: the DD IDS judged on every element this changeset applied, read as
        /// the IDS reads it. The lines of the elements that fail ("W 312 (Walls · DD): missing Pset_WallCommon.FireRating") and the
        /// requirements Revit cannot read. API thread, read-only — safe inside the open TransactionGroup.</summary>
        public static (List<string> Fails, List<string> NotRead) JudgeApplied(Document doc, StageIds ids, IEnumerable<AppliedEntry> applied, IReadOnlyDictionary<string, string> kindOf)
        {
            var fails = new List<string>();
            var notRead = new List<string>();
            string org = App.OrgFor(doc);
            foreach (var a in applied.GroupBy(x => x.RevitUniqueId).Select(g => g.First()))
            {
                if (!kindOf.TryGetValue(a.ProposalGuid, out var kind) || !PromoteWallsPlanner.Classes.TryGetValue(kind ?? "wall", out var cls)) continue;
                var spec = ids.For(cls.Category);
                if (spec == null || doc.GetElement(a.RevitUniqueId) is not Element e) continue;
                var g = GovernedElementExtractor.ExtractByIds(doc, doc.Title, new[] { e.Id }, org).FirstOrDefault();
                if (g == null) continue;
                string label = cls.Word + " " + e.Id.IdValue();
                var v = ids.Judge(g.identity.Class, StageIds.ValuesOf(g), org);
                if (!v.InScope) notRead.Add($"{label} (exported as {g.identity.Class})");
                if (StageIds.Line(label, spec.Name, v) is string line) fails.Add(line);
                notRead.AddRange(v.NotRead);
            }
            return (fails, notRead);
        }

        /// <summary>Ask the person, modal, in the same API call (the group still open): true = place anyway. Closing is going back.</summary>
        public static bool PlaceAnyway(IReadOnlyList<string> fails, string matrix, string what)
        {
            var td = new TaskDialog("Sentinel — DD IDS check")
            {
                MainInstruction = StageIds.Headline(fails.Count, matrix),
                MainContent = string.Join("\n", fails.Take(8).Select(f => "• " + f)) + (fails.Count > 8 ? $"\n… and {fails.Count - 8} more" : "") +
                              "\n\nThe DD IDS is made from the LOD matrix's properties (matrixToIds). A missing value is a gap at DD, not an error in the model.",
                AllowCancellation = true,
            };
            td.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Go back", $"Nothing is placed: {what} is rolled back and the model stays as it was.");
            td.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Place anyway", "The elements stay below DD in the LOD state until the values are filled.");
            td.DefaultButton = TaskDialogResult.CommandLink1;
            return td.Show() == TaskDialogResult.CommandLink2;
        }
    }
}
```

- [ ] **Step 4: Run it, and see it pass.** `promote-check` — `605/605` (the check's words, and the six wiring scans: the fetch inside `Task.Run`, now before the dialog, the extractor read, the check before commit ahead of the BLOCK check and the group's commit, after in the result handler, the pane's line); `artefact-cache-check` (compiles `GovernedQuery.cs`) `55/55`; `session-check` `47/47`; both builds: Revit 2024 `0 Error(s)`, `5 Warning(s)`; Revit 2026 `0 Error(s)`, `3 Warning(s)`.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/LodState.cs SentinelAddin/GhostBuilder/PromoteContext.cs SentinelAddin/Coordination/ArtefactClient.cs SentinelAddin/Commands.PromoteWalls.cs SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/Coordination/GovernedQuery.cs SentinelAddin/UI/SentinelPanelViewModel.cs SentinelAddin/UI/SentinelPanel.xaml tools/promote-check/Ma2bWiring.cs tools/promote-check/Check.cs tools/promote-check/LodStateChecks.cs tools/promote-check/PlacementBlock.cs
git commit -F - <<'EOF'
feat(promote): the LOD state now in Promote's header and after an applied Promote changeset, one lod_state row each; the DD IDS made from the matrix checked before commit where the BLOCK check runs (go back or place anyway); the pane prints the ledger's LOD state line (MA-2b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 8 — Words: the drill's matrix, the design doc, the README; the final checks

**Files:**
- Modify `WebApp/bridge/artefact-store.test.mjs` — the drill's matrix installs
- Create `demo/bds-pilot/bds-lod-matrix-dd-ma2b.json` — DRAFT v0.2.0: `stage_map`, `type_snap_mm: 0` on Walls, only the properties Revit reads
- Modify `demo/bds-pilot/README.md`, `docs/strategy/2026-09-30-model-automation-design.md` (`:279`, `:834`, `:1080`, `:1083`, `:1086`, `:1259`)

- [ ] **Step 1: The failing check.**

In `WebApp/bridge/artefact-store.test.mjs`, replace

```js
    expect(validateArtefact("lod_matrix", readRepoJson("demo/bds-pilot/bds-lod-matrix-dd.json"))).toBe(true);
```

with

```js
    expect(validateArtefact("lod_matrix", readRepoJson("demo/bds-pilot/bds-lod-matrix-dd.json"))).toBe(true);
    expect(validateArtefact("lod_matrix", readRepoJson("demo/bds-pilot/bds-lod-matrix-dd-ma2b.json"))).toBe(true); // MA-2b: stage_map, type_snap_mm
```

- [ ] **Step 2: Run it, and see it fail.** From `WebApp`: `npx vitest run bridge/artefact-store.test.mjs` — `Test Files  1 failed (1)`, `Tests  1 failed | 211 passed (212)` (`ENOENT … bds-lod-matrix-dd-ma2b.json`).

- [ ] **Step 3: The drill's matrix and the words.**

`Create` `demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`:

```json
{
  "standard_key": "BDS-LOD-001",
  "semver": "0.2.0",
  "status": "draft",
  "stage_map": { "concept": "design", "SD": "design", "DD": "design", "CD": "coord" },
  "rows": [
    { "category": "Walls", "DD": { "type": "guideline_rule", "level": "story_level", "top": "next_story_level", "type_snap_mm": 0, "properties": ["Pset_WallCommon.FireRating", "Pset_WallCommon.IsExternal"] } },
    { "category": "Floors", "DD": { "type": "guideline_rule", "level": "story_level" } },
    { "category": "Roofs", "DD": { "type": "guideline_rule", "level": "story_level" } },
    { "category": "Ceilings", "DD": { "type": "guideline_rule", "level": "story_level" } },
    { "category": "Doors", "DD": { "type": "guideline_rule", "level": "story_level", "host": "wall", "properties": ["Pset_DoorCommon.FireRating"] } },
    { "category": "Windows", "DD": { "type": "guideline_rule", "level": "story_level", "host": "wall", "properties": ["Pset_WindowCommon.ThermalTransmittance"] } }
  ]
}
```

In `demo/bds-pilot/README.md`, replace

```markdown
| `bds-lod-matrix-dd.json` | Revit **Promote (DD)** v1 — the project's `lod_matrix@n` |
```

with

```markdown
| `bds-lod-matrix-dd-ma2b.json` | Revit **Promote (DD)**, MA-2b — the drill's `lod_matrix@n` | **DRAFT** v0.2.0: the v0 rows plus `stage_map` (D18: concept, SD, DD → design; CD → coord) and `type_snap_mm: 0` on Walls (the exact match, D16 — a higher value is the founder's), and only properties Revit can read today (`Pset_WallCommon.FireRating`, `Pset_WallCommon.IsExternal`, `Pset_DoorCommon.FireRating`, `Pset_WindowCommon.ThermalTransmittance`), so the LOD state can read an element AT DD. The bridge makes the DD IDS from it (`GET /cde/:key/artefacts/lod_matrix/ids`, matrixToIds; never installed as `ids@n`); Promote counts the LOD state with it and checks it before commit. Not for a real office until LM-1 is decided. |
| `bds-lod-matrix-dd.json` | Revit **Promote (DD)** v1 — the project's `lod_matrix@n` |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| `lod_matrix@n` | Stage targets for each element class, mapped to the project stages | v0 BUILT (Promote v1): DD only, rows by Revit category; stage_map, type_snap_mm, lod numbers: TARGET |
```

with

```markdown
| `lod_matrix@n` | Stage targets for each element class, mapped to the project stages | BUILT: v0 (Promote v1: DD only, rows by Revit category); MA-2b: `stage_map` (D18's default when absent), `type_snap_mm` per row (0 = exact, D16), one TS reader (`sentinel-core/lod-matrix.ts`) and its C# twin pinned by `WebApp/bridge/fixtures/lod-matrix/cases.json`; lod numbers and stages other than DD: TARGET |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| `lod:state` | After Promote and on sync | Counts per level × class × LOD; matrix sha | TARGET |
```

with

```markdown
| `lod:state` | After Promote and on sync | Counts per level × class × LOD; matrix sha | BUILT (MA-2b): entity_type `lod_state`, action `lod:state now · …` (every Promote run with a matrix, the read-only one too) or `lod:state after · …` (an applied Promote changeset); the bridge marks it claimed; counts per level × class (at DD, below, blocked, not measured, with reasons) and the matrix label. Not on sync |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| P1-10 stage gate inputs | After MA-2 | `lod:state` becomes a named input of the `design` → `coord` gate. Until then that row reads "not measured". The founder decides this within P1-10 |
```

with

```markdown
| P1-10 stage gate inputs | After MA-2 | `lod:state` becomes a named input of the `design` → `coord` gate. Until then that row reads "not measured". The founder decides this within P1-10. BUILT EARLY (MA-2b): `GATE_DEFS.design` reads the share at DD from the newest `lod_state` row (bar 90 %, the founder's — plan F5); "LOD state: not measured" until a row exists |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - The `lod_matrix` kind, with `stage_map` and `type_snap_mm`, C# and TS parsers, and a `tools/lod-check` parity check.
```

with

```markdown
  - The `lod_matrix` kind, with `stage_map` and `type_snap_mm`, C# and TS parsers, and a `tools/lod-check` parity check. LANDED in MA-2b (2026-10-03): `parseLodMatrix` (sentinel-core, bundled, the bridge's install check) and `LodMatrix.FromBody` read one shared cases file; the parity check is a section of `tools/promote-check` (the project that compiles `LodMatrix`), not a new project. A snap above 0 is applied by Promote within the row's limit, held to the matrix by the bridge, never pre-ticked; the value is the founder's (D16).
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - The LOD state reader, plus a line in the pane, the Next strip and the web (C4).
```

with

```markdown
  - The LOD state reader, plus a line in the pane, the Next strip and the web (C4). LANDED in MA-2b: read in Revit from Promote's own facts (`LodState`), one `lod_state` ledger row per run and per applied Promote changeset; the pane and the web strip print the newest row's line from the journey; the stage gate reads its share.
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - `matrixToIds` (S): a stage IDS checked before commit.
```

with

```markdown
  - `matrixToIds` (S): a stage IDS checked before commit. LANDED in MA-2b: `ids-compile.mjs matrixToIds`, served as `GET /cde/:key/artefacts/lod_matrix/ids` (derived, never installed as `ids@n`); Revit judges a Promote changeset's applied elements with it inside the changeset's group, before the BLOCK check — a failure is said with its rule and the person may go back; a property Revit cannot read is "not checked", never passed.
```

- [ ] **Step 4: Run everything, and see it pass.** The same command — `Test Files  1 passed (1)`, `Tests  212 passed (212)`. From the repo root, every check project — `for d in tools/*-check; do dotnet run --project $d; done` — all pass (25 tracked projects; `tools/rvtinfo-check` is a 26th folder on this PC that git does not track — run it too if it is there, and say so): `promote-check` `605/605`, `artefact-cache-check` `55/55`, `session-check` `47/47`, `fixplace-check` `55/55`, `publish-check` `124/124`, `ghost-standards-check` `177/177`, `gate-check` `219/219`, `ghost-p2-check` `107/107`, `guideline-check` `17/17`, `datum-check` `DATUM OK`, `annotate-check` `ALL PASS`, the others as on master. From `WebApp`: `npm test` — `141 passed`, `2221 passed | 1 skipped (2222)`; `npx vitest run bridge/` — `Test Files  86 passed (86)`, `Tests  1748 passed | 1 skipped (1749)`; `npm run build:bridge-core` leaves `bridge/sentinel-core.mjs` unchanged. Both builds with `-p:DeployToRevit=false`: Revit 2024 `0 Error(s)`, `5 Warning(s)`; Revit 2026 `0 Error(s)`, `3 Warning(s)` (2022 and 2027 also compile with `0 Error(s)`; they are not required). `git status` shows nothing but these commits: no `.rvt`, no `config/.env`, no `%AppData%` file.

- [ ] **Step 5: Commit.**

```bash
git add demo/bds-pilot/bds-lod-matrix-dd-ma2b.json demo/bds-pilot/README.md docs/strategy/2026-09-30-model-automation-design.md WebApp/bridge/artefact-store.test.mjs
git commit -F - <<'EOF'
docs: MA-2b landed - lod_matrix stage_map and type_snap_mm, the LOD state reader and its ledger row, matrixToIds checked before commit - in the design doc and the pilot README; the drill's DRAFT matrix

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Live drill MA2b (Revit 2024, scratch copies only — on the branch, before the merge)

**Who does what.** The drill runner drives Revit by mouse. Two steps are the founder's, because they need a password: signing in (set-up) and signing out (closing list). If the founder is away, the drill runs in whichever state the PC is in, and the other state is recorded as **owed** — never as passed. The sign-in state found before the drill is recorded, and the closing list returns the PC to it. Signed in, the account is first made a contributor of the scratch projects (a changeset write and a `lod_state` row need that role) — MA2a's set-up step.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Signed in or signed out**: whichever of the two this session does not run is owed — for the actor on the `lod_state` rows (signed in: the verified email; signed out: the machine credential's label) and for who may post them.
- **One row on Revit 2026 and one on Revit 2027**: the builds compile; the extractor read inside the open group and the snap's face guard are proven on 2024 only.
- **A real office's matrix (decision LM-1)**: `bds-lod-matrix-dd.json`'s properties are placeholders; the drill uses `bds-lod-matrix-dd-ma2b.json`, which asks only for what Revit reads. On the draft, Floors, Roofs and Ceilings would read "not measured" (F2's ceiling) — owed until LM-1.
- **Floors, roofs and ceilings snapping, live**: pinned offline (Task 3); the drill snaps a wall only.
- **A model whose types carry IfcExportAs overrides** (UNSURE 3): none on the seed; the "exported as another IFC class" reading is pinned offline.
- **The web Next strip in the founder's Chrome**, if W-1 cannot point the local web app at the test bridge: the journey reply the strip prints verbatim is recorded instead, and the visual row is owed.
- **The LOD state on sync** (design `:834` names it): not built here (spec amendment S4).

The drill record ends with the list of owed rows, and each goes into the "owed" memory.

**Set-up (once):**
- **Build.** Close Revit. Run `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, which deploys the branch's build into Revit 2024 (the closing list says what stays deployed). Record `git rev-parse --short HEAD` and the deployed DLL's sha256 (`certutil -hashfile "<the deployed Sentinel.dll>" SHA256`, lower case). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work.
- **The add-in's bridge settings.** Before the first switch, copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma2bbak` beside it. The file holds the file token: never print it and never open it in a viewer.
- **The test bridge on 127.0.0.1:4101**, on the branch's code (it must know `lod_state`, the snap and the IDS route). From `WebApp`:
  - Probe which settings `config/.env` holds (names only, never a value):

    ```bash
    node -e 'import("./bridge/load-env.mjs").then(m => { const e = m.loadEnv(); for (const k of ["BCF_PORT", "BCF_EVENT_POLL_MS", "BCF_BASE"]) console.log(k, k in e ? "is set in config/.env — the shell cannot override it" : "is not in config/.env — the shell value is used") })'
    ```

  - If `BCF_PORT` is set in `config/.env`: stop, and ask the founder — the test bridge cannot be moved to 4101 from the shell, and the drill does not edit `config/.env`.
  - Start it in the background, event poll off: `BCF_PORT=4101 BCF_EVENT_POLL_MS=0 node bridge/bcf-service.mjs`. Its banner names port 4101, and `curl -s http://127.0.0.1:4101/health` answers. The founder's 4100 bridge is not touched, and no write route of it is called.
  - **Every bridge call of this drill names `http://127.0.0.1:4101` itself.** Define this helper once in the drill's shell (it reads the token through `load-env.mjs` and prints the status and the reply; a path is given without its leading slash; a body starting with `@` is a file):

    ```bash
    b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
    ```

  - Point the add-in at the test bridge, with a script that prints nothing of the file: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The scratch web projects.** Nothing is installed on `demo`, `bds-office` or any real office. The machine credential is a platform admin for these calls (migration 0033), so it may make an office and attach projects to it:
  - `b4101 POST cde/projects '{"key":"ma2b-office","kind":"office"}'`; `b4101 POST cde/projects '{"key":"ma2b","office_key":"ma2b-office"}'` — the main rows'; `b4101 POST cde/projects '{"key":"ma2b-snap","office_key":"ma2b-office"}'` — the throwaway snap project; `b4101 POST cde/projects '{"key":"ma2b-none"}'` — no office, no matrix.
  - On the OFFICE (both `ma2b` and `ma2b-snap` inherit them): `b4101 PUT "cde/ma2b-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma2b-office/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json`, `b4101 PUT "cde/ma2b-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json` (201, `lod_matrix@1`), and the pilot's ruleset for the tender gate `b4101 PUT "cde/ma2b-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json` (its rules are monitor, request and warn: no BLOCK rule, so the BLOCK check stays quiet and the DD IDS check is seen alone).
  - On `ma2b-snap` ONLY (the throwaway: D16's value is the founder's): write `%USERPROFILE%\Documents\Sentinel drills\ma2b\lod-matrix-snap15.json` from the drill's matrix with Walls' `type_snap_mm` set to 15 — `node -e 'const fs = require("fs"), m = JSON.parse(fs.readFileSync("../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json", "utf8")); m.rows[0].DD.type_snap_mm = 15; fs.mkdirSync(process.argv[1], { recursive: true }); fs.writeFileSync(process.argv[1] + "/lod-matrix-snap15.json", JSON.stringify(m, null, 2)); console.log("written")' "$USERPROFILE/Documents/Sentinel drills/ma2b"` — and `b4101 PUT "cde/ma2b-snap/artefacts/lod_matrix?actor=drill" "@$USERPROFILE/Documents/Sentinel drills/ma2b/lod-matrix-snap15.json"` (201; the project's matrix outranks the office's for `ma2b-snap` alone).
  - On `ma2b-none`: the same guideline and catalogue PUT on the project itself; no matrix.
  - Signed in: make the account a contributor of `ma2b`, `ma2b-snap` and `ma2b-none` (MA2a's step).
- **The scratch models.** Three copies of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` — the PRE-Promote B35 seed (outline `Generic - 200mm`, partitions `MA0 Interior - 100mm`, gap walls `Generic - 125mm`; levels GR_SSL −300, GR-FFL 0, 01_SSL 3000, 01-FFL 3300, MA0 Roof 6300; 01-FFL is the clean storey) — in `Documents\Sentinel drills\ma2b\`: `ma2b-a.rvt` bound to `ma2b`, `ma2b-b.rvt` bound to `ma2b-snap`, `ma2b-c.rvt` bound to `ma2b-none` (Sentinel ▸ Project Setup, as in MA2a).

**Record before the first row** (read-only MCP, on `ma2b-a.rvt`, 01-FFL plan view): the wall count by type; whether the BDS wall types the DD rules produce (`BDS_EXT_ARC_CMU_200 mm`, `BDS_INT_ARC_GYPS_100 mm`) carry a Fire Rating (type parameter `Fire Rating`) — UNSURE 1; the door and window counts. Promote's own "DD now" line in L-1 is the cross-check.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| R-1 | `b4101 GET cde/ma2b/artefacts/lod_matrix/ids`; `b4101 GET cde/ma2b-none/artefacts/lod_matrix/ids`; `b4101 PUT "cde/ma2b-none/artefacts/lod_matrix?actor=drill" '{"standard_key":"X","semver":"1.0.0","stage_map":{"SD":"coord"},"rows":[{"category":"Walls","DD":{"type":"guideline_rule"}}]}'` | 200: `matrix` is `lod_matrix@1 · office · <sha12>…`, `project_stage` `design`, `ids.specifications` names `Walls · DD`, `Doors · DD`, `Windows · DD`, `unmatched` `[]`; 404 `no lod_matrix installed for ma2b-none or its office`; the PUT is 400 `lod_matrix: stage_map.DD maps to design, before SD's coord — a later matrix stage never maps to an earlier project stage` and installs nothing | The three replies |
| G-0 | `b4101 POST cde/ma2b/gate '{"stage":"tender"}'` (pass: the ruleset), then `b4101 POST cde/ma2b/gate '{"stage":"design"}'` | The design run lists four checks; the fourth is `LOD state: elements at the DD row ≥ 90%`, `na: true`, source `LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)`; status `not_checkable` | The design run's checks and its ledger id |
| N-1 | Open `ma2b-c.rvt`; Sentinel ▸ Promote (DD); read the dialog; press No (or OK). `b4101 GET "cde/ma2b-none/audit?entity_type=lod_state&limit=1"`; the pane's ↻ | The header says `LOD matrix: none — not installed for ma2b-none or its office — walls only (MA-0 rules)` and `LOD state: not measured — no lod_matrix@n to measure against (none — …)`; no `lod_state` row (`rows: []`); the pane's line reads `LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)` | The header lines; the pane line |
| L-1 | Open `ma2b-a.rvt`; Promote (DD); read the dialog; expand it; press **No** (the read-only run). `b4101 GET "cde/ma2b/audit?entity_type=lod_state&limit=1"` | The header has `LOD matrix: lod_matrix@1 · office · … (DRAFT)`, the `DD now — …` line, then `LOD state now (recorded on the ledger): DD → design: <a> of <n> at DD (<s>%) · <b> below · <k> blocked · <m> not measured` and one line per level and class; each level line's four counts add up to its count, and the lines add up to the header's; walls at DD ≤ the walls' DD now; `DD also asks (the DD IDS: …)` lists the matrix's properties. The ledger row: `entity_type lod_state`, action `lod:state now · DD → design: …` (the same line), `new_value.claimed` true, `project_stage` `design`, the actor (signed in: the email) | The header's LOD lines; the row's id, actor, share; the seconds the dialog took to appear (UNSURE 5) |
| L-2 | In the Live Coordination pane press ↻. `b4101 GET cde/ma2b/journey` | The pane shows `LOD state: DD → design: … — Revit's count (claimed), <actor>, <time> · ledger #<id>` under the next step, the same text as the reply's `lod_state.line`, `lod_state.ledger.id` the L-1 row | The line; whether it wraps in the docked pane (UNSURE 9) |
| W-1 | The web Next strip. If the local web app can run against the test bridge (`VITE_SENTINEL_SERVICE=http://127.0.0.1:4101`, the founder's local-app route in Chrome, signed in to the platform), open project `ma2b`. Otherwise record the journey reply of L-2 and mark the visual row owed | The strip's third line is the journey's `lod_state.line`, word for word (`lodLine`) | A screenshot, or "owed" with the reason |
| G-1 | `b4101 POST cde/ma2b/gate '{"stage":"design"}'` again | The LOD check is measured: `na: false`, `detail` the L-1 share, `ok` per the 90 % bar, source `lod_state ledger #<L-1 id> — DD → design: … (Revit's count, claimed: <actor>, <at>)`; the gate stays `not_checkable` (health, compliance, block violations) | The check row |
| I-1 | On `ma2b-a.rvt`: if the record before the first row shows both target types carry a Fire Rating, open Edit Type on `BDS_INT_ARC_GYPS_100 mm` (this scratch copy only) and clear its Fire Rating, so the partitions retyped to it must fail. Promote (DD) → **Yes**; the review opens on the first storey's changeset: tick every retype and attach; **Apply** | A dialog `This changeset leaves N element(s) failing the DD IDS made from lod_matrix@1 · office · …` lists `W <id> (Walls · DD): missing Pset_WallCommon.FireRating` lines; **Go back** → `You went back at the DD IDS check — nothing was placed. N element(s) would have failed …`, "still pending"; `b4101 GET changesets/ma2b` shows it `proposed`; the walls' types are unchanged (MCP read) | The dialog's lines; N |
| I-2 | Review AI Proposals again (the same changeset); tick the same; **Apply**; at the DD IDS dialog **Place anyway** | The result dialog says `Applied …`, the line `… — placed anyway, as the person chose: W …` (and `DD IDS: not checked for …` only for a property Revit cannot read — none in this matrix), and `LOD state after (recorded on the ledger): DD → design: …`; the changeset's result note on the bridge starts with the IDS line; a `lod_state` row `lod:state after · …` with `changesets` = [this id] | The after line; the row id |
| L-3 | Pane ↻; `b4101 POST cde/ma2b/gate '{"stage":"design"}'` | The pane shows the after row; the walls retyped and attached moved from below to at DD, except those on the cleared type, which read below with `missing Pset_WallCommon.FireRating`; the gate's LOD check reads the after row's share | L-1 → L-3 counts per level and class |
| S-1 | On `ma2b-a.rvt` (snap 0): duplicate `Generic - 200mm` as `Generic - 212mm` (Edit Type ▸ Duplicate; Structure: core 212 mm; Function Exterior), and draw one new wall with it on 01-FFL (Base 01-FFL, Top unconnected). Promote (DD) | That wall is sent to a person: `gap: W <id> (Generic - 212mm, Function Exterior) — "BDS_EXT_ARC_CMU_212 mm" is not in type_catalog@1 · office · … Available: …` — no retype for it (today's exact match) | The held line |
| S-2 | On `ma2b-b.rvt` (bound to `ma2b-snap`, its own matrix with snap 15): make the same `Generic - 212mm` type and draw the same wall; Promote (DD) → Yes; the review opens on the first storey's changeset — Review AI Proposals again until the 01-FFL one is open; tick only that wall's retype and attach | The dialog's retype reads `→ BDS_EXT_ARC_CMU_200 mm — snapped 12 mm (type_snap_mm 15, D16): each face moves up to 6 mm`; in the review that row is NOT ticked; `b4101 GET changesets/ma2b-snap` shows the element's `snap` `{from_mm: 212, to_mm: 200, by_mm: 12, limit_mm: 15, matrix: "lod_matrix@1 · project · …"}` and `pretick: false`. Tick it and Apply (Place anyway if the DD IDS asks): the wall is `BDS_EXT_ARC_CMU_200 mm`, 200 mm wide (MCP read), its faces 6 mm in each side | The reply; the width before and after |
| S-3 | Post S-2's changeset body to `ma2b` (the office's matrix, snap 0): save the element from S-2's GET (its `op`, `kind`, `target`, `place`, `validate`, `snap: {from_mm, to_mm}`) as `Documents\Sentinel drills\ma2b\snap-to-ma2b.json` with `name` and `source: "promote"`, then `b4101 POST changesets/ma2b "@…/snap-to-ma2b.json"` | 400 `elements[0]: a 12 mm snap is more than lod_matrix@1 · office · … allows for Walls (type_snap_mm 0) — snapping is the office's decision (D16); send the exact type`; nothing stored | The reply |

Request bodies are kept in `Documents\Sentinel drills\ma2b\`. The rows run in the order above: G-0 needs the ruleset; G-1 and L-2 need L-1's row; I-2 needs I-1's changeset; S-1 and S-2 each draw their own new wall.

**Closing list:** copy `bcf-config.json.ma2bbak` back over `bcf-config.json` (serviceUrl restored) and say so; stop the 4101 bridge; the scratch projects `ma2b-office`, `ma2b`, `ma2b-snap`, `ma2b-none` and their ledger rows stay (scratch; listed in the record with the row ids); the `.rvt` copies stay in `Documents\Sentinel drills\ma2b\` (never committed); the branch's add-in stays deployed until the merge redeploys master (said in the record); signing out, if the founder signed in for the drill, is the founder's.

## Merge (after the drill)

- Every row passed, or is named owed with its reason. Each fix found by the drill is a commit "fix(drill MA2b): …" with its check, the full sweep re-run; a fix that changes Revit behaviour is deployed and its row re-run, otherwise it is owed.
- `git merge --no-ff feature/ma2b-lod-matrix-state` with a one-paragraph message: what MA-2b built (the matrix's stage map and snap, one reader and its twin on one fixture; the LOD state now and after on the ledger, read by the pane, the Next strip and the design gate; matrixToIds checked before commit), the drill's result and its owed rows, and "graphify is not on PATH on this PC: the graph was not updated".
- Push only under the standing push rule, after a secret scan of the range.
- Deployment: the bridge first (it must know `lod_state` before an add-in posts one — an older bridge refuses a signed-in contributor's `lod_state` row as "a signed-in caller writes notes only", and GovernedNotify logs "Not recorded"; and it must know the IDS route — an older bridge answers 404 and Promote's header says "DD IDS not read"), then the add-in.

## UNSURE facts this drill settles

1. Whether the BDS wall, door and window types the DD rules produce carry a Fire Rating (and a window a U-value under a PsetMap candidate) — the real DD IDS pass rate. Settled by the record before L-1, and by I-1.
2. Whether `GovernedElementExtractor.ExtractByIds` inside the open TransactionGroup reads the retyped type's parameters before the group is kept. Settled by I-1 (the failing lines name the target type's missing rating, not the concept type's).
3. Whether an `IFC_EXPORT_ELEMENT_AS` / `IfcExportAs` override on a BDS type moves a wall or a ceiling to another IFC class (the DD IDS would then not judge it: "not measured"). Recorded in L-1's reasons; none expected on the seed.
4. Whether the pane picks up the new row soon enough after Promote posts it (the post is fire-and-forget). L-2 presses ↻; a sync or document switch refreshes it too.
5. How long Promote's header takes with the property reads, and the LOD state after's second read of every class. L-1 and I-2 record the seconds on the B35 model; a real office model is under Risks.
6. Whether Promote's receipt, the `lod_state` now row and the after row stay inside the 20-reports-a-minute budget in a quick drill. Settled by every row's Doctor log line ("Recorded: ledger #…").
7. Whether `Generic - 212mm` can be made on the seed (Edit Type ▸ Duplicate with a 212 mm core). Settled by S-1.
8. Whether `BDS_EXT_ARC_CMU_200 mm`'s `WallType.Width` is exactly its named 200 mm (the snap guard compares it with 0.5 mm). Settled by S-2's Apply: a mismatch reads "a retype would move a face (the snap filed was 212 → 200 mm)".
9. Whether the LOD line fits the docked pane (MA2a's UNSURE 9: long lines showed only when widened). L-2.

## Risks (each a ceiling stated in words)

- **The share counts held elements as not at DD.** Groups, design options, structure and elements on non-story levels are "blocked" and stay in the count, so a model with many of them cannot reach the 90 % bar until a person resolves them. F5 says it; the gate's source line names the row.
- **"Not measured" can dominate.** With today's draft matrix most DD properties have no Revit reader (F2): those classes read "not measured" until LM-1 trims the list or PsetMap gains readers. That is the honest reading, not a fault.
- **The newest row wins.** The journey line and the gate read the newest `lod_state` row of the project, from any model bound to it, now or after — one model per project is assumed.
- **A snap moves faces.** At a limit above 0 a wall's faces move by up to half the snap each side; hosted doors move with them and room boundaries follow. It is never pre-ticked, the reason says by how much, and the value is the founder's (D16). Floors, roofs and ceilings snap the same way, and are drilled offline only.
- **The review waits for four reads** (guideline, catalogue, matrix, IDS) when a Promote changeset is applied — off the API thread, but the window waits for them, as it already waits for the guideline's placement block. The catalogue is an ETag-cached read.
- **The LOD state after reads every class again** on the API thread, after the changeset is kept. On a large office model this is the slowest part of an Apply (UNSURE 5).
- **The gate summary's sentence** ("N of M gate metrics have no server source") also counts the LOD check when no row exists; its evidence line says the true source (E22).
- **One stage list, partly.** sentinel-core's `STAGES`, the gate's keys and the bridge's `STAGES` are held equal by tests; the web's own copies (project-shell, owner-panel, deliverables-panel) are not touched (Next).
- **A matrix installed before this plan** that the old, looser C# reader accepted but the bridge refused cannot exist (the bridge always refused first); a body edited in the database by hand would read "did not parse", named, and Promote runs walls only.

## Next (out of scope here)

- MA-2's remaining slices: the Promote plan with `set_parameter` (a missing DD property filled from the catalogue type, a cited clause or a person — never a guess), type-gap groups in the Holding Area, one Undo per storey, DAT-3/ANV-1/ANV-2, drill MA2 and gate G2.
- Checking a second stage (CD) and the LOD numbers it would show (F3, F7); the LOD state on sync (S4).
- PsetMap readers for the matrix's other properties (after LM-1), so fewer classes read "not measured".
- The web's stage-list copies on sentinel-core's `STAGES`; `classifyGate`'s summary wording; a pane refresh right after Promote posts its row.
- The MCP read tool `sentinel_lod_state` (design `:544`).
