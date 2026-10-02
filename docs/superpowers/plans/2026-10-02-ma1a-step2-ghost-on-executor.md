# MA-1a step 2 — Ghost Builder on the changeset executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ghost Builder stops placing through its own path. A DWG build files its reviewed rows as changesets with source `dwg`, and `ChangesetExecutor` places them: one ledger row format, one provenance stamp, one undo watcher. The executor keeps all-or-nothing and the commit check, and gains Ghost's honesty at commit:
- warnings are counted, never erased;
- any error rolls the changeset back;
- survivors are recounted after the commit.

Ghost keeps every capability it has today:
- the types a build adds;
- arc walls;
- columns and furniture;
- the spec values from the project's documents;
- builds larger than 200 elements;
- unbound models.

Its old placement path for DWG is deleted.

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md` §2.4 "The order in MA-1", step 2 (`:260-265`), and §7.2 MA-1 (1a) item 2 (`:1048`). Drill rows `:1060-1062` and `:265`. The step-1 plan `docs/superpowers/plans/2026-10-01-ma1a-ghost-honest-build.md`: "What step 2 replaces" (`:102-121`) and amendments A1–A8 (`:60-100`), which stay binding. Drill MA1a-S1 is in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` (`:998-1019`). Base: master `0059841`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Architecture:** A Revit-free `GhostFiling` (proved offline by `promote-check` against a bridge fixture that vitest validates too) turns each reviewed Ghost row into an exact changeset element — millimetres, absolute elevations, exact type and family names — and cuts ≤200-element chunks, hosts first. `GhostChangesetBuild.Run` then does the whole build on the API thread inside ONE `TransactionGroup`, assimilated into one Undo entry named as the first changeset's transaction: Ghost's own types step (preloader, provisioners, guideline sizes), a plan that turns every executor refusal-by-rule into a named gap, filing (an unbound model runs a local changeset), each changeset through `ChangesetExecutor`, then the documents' values (P2/A7); any filing failure or Revit error rolls the whole group back. The executor commits through `GhostFailureHandler` in all-or-nothing mode with a survivor recount, the global Doctor skips every changeset transaction, and Photo Massing keeps its own path until MA-6 (F5).

**Global constraints:**
- Branch `feature/ma1a-step2-ghost-executor` from master `0059841`; merge `--no-ff` only after every task's checks pass; push only under the standing push rule, after a secret scan of the range.
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`.
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; use the Edit tool for C# strings that contain escapes.
- No new dependencies and no new check project: extend `tools/promote-check`, `tools/ghost-p2-check` and the bridge's vitest files; `tools/session-check` also compiles `ChangesetClient.cs` and must stay green.
- Checks: `dotnet run --project tools/<name>` from the repo root; vitest from `WebApp` with `npx vitest run bridge/…`.
- No Revit, no deploy and no bridge restart during the tasks; the live drill is a separate session (last section).
- The community Revit MCP never writes (A8); only the read-only `analyze_model_statistics`, and only in the drill.
- After each code task run `graphify update .` (per `C:/Users/yazan/CLAUDE.md`); if `graphify` is not on PATH, say so and move on.
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens); never commit a `.rvt`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are master `0059841`'s and shift as tasks land: match the quoted text, not the number (files are CRLF on disk; the Edit tool matches the text).

**Dry run (planner, 2026-10-02):** every code step below was applied in order to a `git archive` export of `0059841` in a scratch folder and re-verified after the last edit to this plan:
- both builds `0 Error(s)`; Revit 2024 warnings 6 on master, 6 after Task 3, 5 after Task 4 (master's `ElementId(int)` CS0618 goes with the deleted `Place(…, long)`); Revit 2026 3, all master's;
- `promote-check` 178/178 (master 160), `ghost-p2-check` 91/91 (master 87), `session-check` 47/47 (master 47);
- the three changeset vitest files 114/114 (master 108); master's full `bridge/` suite is `1620 passed | 1 skipped`, so the expected totals below are that plus the new tests (the export lacks the migrations the full suite needs).

Only comment and README edits were not part of the dry run. Nothing in the repo was changed by it.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | How many human gates a Ghost build has | **A:** one. Ghost's review Build files the changesets and applies them at once; the ticked layers are the human tick (the REFEREE RULE comment says so). **B:** two. File, then Review AI Proposals ticks each element (Promote's pattern) | **A.** Each layer was already reviewed, with the types forecast. The changeset window has no Tick-all and pre-ticks a create only when the IDS accepted it, so a 200-element build would take 200 manual ticks. The types the build adds exist only inside its Undo group (F4), so a later, separate Apply could not find them |
| F2 | IDS verdicts on a Ghost changeset | **A:** built as reviewed. The summary counts the elements that failed the project's IDS, and each verdict stays on its changeset. **B:** IDS-rejected elements are reported rejected and not built. **C:** any rejection stops the whole build | **A.** Today Ghost ignores the IDS entirely, so A only adds a record. A Ghost element carries no property sets, so B or C would stop every Ghost build on a project whose IDS requires a property. Item 8 (contract 2: drawing-only ghosts are never pre-ticked) revisits this |
| F3 | Unbound or offline models | **A:** a bound model must file. It needs a reachable bridge and contributor or above; otherwise nothing is built, and the reason is given. An unbound model runs the same executor on a local changeset: stamped `dwg`, one Undo, no ledger, and the summary says so. **B:** Ghost always requires a bound project, as Promote does | **A.** Keeps today's unbound Ghost without a third placement path. A bound model's change always reaches its ledger. Ceiling: a bound model with the bridge down cannot build from a DWG |
| F4 | Where the types a build adds are made (D13 has no default) | **A:** Ghost's own types step, before filing, in its own transaction inside the build's one Undo group. It runs the preloader, the wall and floor provisioners, and the guideline sizes at the measured thickness. The types are listed in the review forecast (as today) and in the summary, and named in each changeset's result note. Ctrl+Z removes them with the build; a failed build leaves none. **B:** a separate committed transaction before filing. It is its own Undo entry, and the types survive Ctrl+Z. **C:** no type creation until a lead approves new sizes in the Holding Area (D13); gaps only | **A.** Same capability and Undo shape as today, and the executor keeps "creates no types". The review's forecast is the approval, as in step 1. D13's Holding Area row replaces this when it is built |
| F5 | Photo Massing | **A:** it keeps its own path (`PlacePrepared`, the factory, `GhostFailureHandler`'s step-1 rule) until MA-6 moves the massing shell onto changesets (design `:1171`; item 4 `:1050` still lists Massing as a separate placer). **B:** move it now | **A.** Its placeholder default types (step-1 E5) conflict with the executor's D16 rule. Its multi-storey openings all sit on one level, which conflicts with the executor's P1 host rule. Moving Massing is a policy change, not a refactor. The DWG half of Ghost's path is deleted now; Massing is the one other placer left, named, and MA-6 retires it |
| F6 | Columns and furniture | **A:** new create kinds `column` and `furniture`, in the bridge and the executor. Each is placed unhosted on its level with the exact family and type. **B:** named gaps until a later item | **A.** Ghost places them today. Without new kinds, Ghost's old path would have to survive for them |
| F7 | Ceiling height (the bridge requires `Offset`; a DWG gives none) | **A:** the outline's drawing Z, read as its height above the build level (0 on a flat plan), with a Note to set it. **B:** ceilings become gaps until the guideline's placement block (item 6) gives a height. **C:** a fixed 2700 mm | **A.** It is the drawing's own number, not a guess (placement-slice P4). The drill records where it lands. What height Ghost's old `Ceiling.Create` gave was never measured (UNSURE 5) |
| F8 | Design drill MA1b row "A planted duplicate reports 'Placed 9 (1 deleted by Revit)'" (`:1072`) | **A:** reword it when MA-1b is planned: "a planted duplicate is a warning, counted and kept; a planted error rolls the build back whole". **B:** keep it | **A.** Under P1-3 and the all-or-nothing executor, that row cannot pass as written (step-1 plan `:1809`, `:1835`). This plan does not edit the design |
| F9 | A DWG door or window whose point lies on a wall that was **already in the model** (not one this build creates) | **A:** a named gap: "a wall already in the model lies under the point — a Ghost door or window is hosted only in a wall this build creates". **B:** host it in the existing wall (cuts an opening in a user element) | **A.** Ghost touches only its own elements (step 1's promise and S2-1's pass text). B is a policy change the founder can ask for later |

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | `GhostFailurePolicy.DoctorSkips` matches four kinds of transaction: Massing's `Ghost Builder - LOD 200`, the DWG build's `Ghost Builder - types` and `Ghost Builder - parameters`, and **every** `Sentinel AI changeset: …`, not only `dwg` ones | The transaction name carries no trustworthy source: it embeds the changeset's free-text name. Every changeset now counts and keeps its warnings (E2), so P1-3 holds for all. Ceiling: an agent's or Promote's duplicate-Mark warning is no longer erased; it stays visible in Review Warnings |
| E2 | The executor's transaction gets `GhostFailureHandler { AllOrNothing = true }`, plus `SetClearAfterRollback(true)` and `SetForcedModalHandling(false)`. A warning is counted; any error or corruption rolls back. A Pending commit becomes `NotFinished` and is never reported. <br>B1: a DWG build's `Ghost Builder - types` and `Ghost Builder - parameters` transactions get the same options (`GhostFailureHandler.AllOrNothingOn`), and their warnings are counted with the build's; a rolled-back types transaction abandons the build (nothing filed), a rolled-back parameters transaction leaves the elements standing with the "values not written" warning | Step-1 plan `:106` named this, and step-1 F1 B arrives here. Nothing is resolved or deleted, and Revit's modal "Delete Element(s)" half-commit can no longer happen anywhere in a DWG build |
| E3 | After a Committed status, an applied element Revit no longer holds goes to `Gone`. It is reported rejected and never applied. Warnings are counted with `GhostFailurePolicy.CountWarnings` | Step-1 plan `:107`. All-or-nothing makes `Gone` empty in practice; the recount keeps the ledger true if it is not |
| E4 | One Undo per build. A `TransactionGroup` is named `UndoWatcher.TxName(first changeset)` and assimilated. Each changeset is remembered under that name AND its own. `UndoWatcher` holds a list per name, and `Hits` dedupes by changeset id. `SentinelUndo.Run` is not used | Revit names the assimilated Undo item after the group (RevitAPI `TransactionGroup.Assimilate`). Which name `GetTransactionNames` reports on Undo is UNSURE (2); with both remembered, either works and gives one row. `SentinelUndo`'s `Sentinel: …` name would break the watcher |
| E5 | A build over 200 elements becomes chunks of ≤200: walls, floors and ceilings first, then doors, windows, columns and furniture. All chunks run inside the one group, so the build is all-or-nothing across chunks; one chunk's failure reports every chunk declined. A filing failure withdraws what was already filed | This is the bridge's 200 cap, and its 200-guid reverted cap. An opening's host is created by an earlier chunk in the same group, and the executor looks for hosts among all of the model's walls |
| E6 | Before filing, the plan turns every refusal the executor makes **by rule** into a named gap: <br>• a missing, ambiguous or non-basic type, or a synthetic `Generic …` name; <br>• a door or window with no single straight wall under it (`PlacementGeometry.Host` over the model's walls and this build's), or a curved, curtain or stacked wall at the point; <br>• a family of the wrong placement type; <br>• a run shorter than the short-curve tolerance. <br>It does **not** re-implement Revit's own geometry checks: an outline Revit cannot make into a floor rolls the build back, named. Nor the bridge's `outlineProblem` for ceilings: a 400 stops the filing, named | One bad DWG row is a gap, not a whole-build decline (step 1 skipped per element). Ceiling: a dirty slab outline declines the whole build. Upgrade path: port `outlineProblem` into the plan if drills show dirty outlines are common; the drill's plant then needs a new failing element |
| E7 | Arc walls: `CurveDto.Mid`, `LocationCurve.mid` in the bridge (walls only), and `Arc.Create(start, end, mid)` in the executor. Arcs are flattened to the base, as lines are | Keeps Ghost's curved DWG walls with three small changes |
| E8 | Units: absolute mm, and `LevelName` is always sent, so the executor never picks the nearest level. <br>• Walls: base = level elevation + CAD Z (Ghost's offset rule); top = base + max(CAD height, 10 × tolerance), which is 3048 mm on a flat drawing, as before (not the executor's 3000 mm default). <br>• Floor loops keep the drawing's Z, as before. <br>• Points sit at the level's elevation (the executor's rule for doors and windows; columns and furniture follow it) | Walls and floors do not move relative to step 1. Points do not move on a flat drawing built on a level at elevation 0 (the sample). Step 1 passed a block's CAD Z as an absolute point, so on a level above 0 its point families stood below that level; they now stand on it, like its walls. Floor Z handling off level 0 stays unverified (UNSURE 10) |
| E9 | The spec values (P2) are written by Ghost after the executor, in `Ghost Builder - parameters` inside the same Undo, through the factory's `ApplyParams` with A7 (types this build added only). The changeset gets no new place field | No bridge or DTO change, and A7 is unchanged. `set_parameter` stays MA-2 |
| E10 | Floor types are the model's floor types only (`FloorType` minus `IsFoundationSlab` — the same set as the `OST_Floors` types, since a foundation slab type is `OST_StructuralFoundation`), and more than one hit is a person's decision. This holds in the executor, the floor provisioner, `GhostTypeCreator.CreateFloorType`, the plan and the review drop-down. Ceilings already resolve among `OST_Ceilings` types with `CreateType`'s 0/1/many rule | A carried item: a foundation slab that shares a floor type's name is never picked, cloned from or offered |
| E11 | Wall typing reuses `ElementPlacementFactory.ResolveWallType` (now `internal`), and the plan reuses `Centroid`, `TryBuildClosedLoop` and `ApplyParams`. The factory lives on for Massing (F5); MA-6 moves these four with it | "Delete a path instead of adding a third": no second copy of the reviewer > guideline > mapping rule |
| E12 | Before filing, the family's `FamilyPlacementType` must fit its kind: a door or window `OneLevelBasedHosted`; furniture `OneLevelBased`; a column `OneLevelBased` or `TwoLevelsBased` (Revit's column families have a base and a top level). Anything else is a named gap | The executor refuses a door that does not land in its wall, and that refusal would roll back the whole build; a gap names it first. Ceiling: a work-plane-based furniture family is a gap, where step 1 tried `NewFamilyInstance` on the level and skipped it if Revit threw. A column is placed as step 1 placed it (`NewFamilyInstance` on the build level; its top constraint is Revit's default) |
| E13 | The summary gains `Provenance: N of M placed element(s) stamped as source dwg`, read back with `ProvenanceStamp.Read` after the build | The drill can see the stamp without the community MCP (A8) and without a new command |
| E14 | The executor's host finder is shared as `ChangesetExecutor.HostWalls` and `OddNear`, with no behaviour change | The plan checks openings with exactly the executor's rule |

## Review amendments (2026-10-02, BINDING — they override any task text they contradict)

Two adversarial reviews (workflow wf_06eaa6f5-8a6) found the plan sound and raised the points below. Each belongs to the task
named; its check runs with that task's checks. Expected check totals change accordingly — report the real totals.

- **B1 (Task 4 Step 4, important): the types and parameters transactions get the same failure options as the executor.**
  `Ghost Builder - types` and `Ghost Builder - parameters` each get `new GhostFailureHandler { AllOrNothing = true }`,
  `SetClearAfterRollback(true)` and `SetForcedModalHandling(false)`; each handler's `CountWarnings(SeenWarnings, ∅)` is added
  to the build's warning count. A rolled-back types transaction goes to Abandon (nothing filed); a rolled-back parameters
  transaction ends in the existing "values not written; elements stand" warning. E2 gains one line saying so. Revit's modal
  "Delete Element(s)" can then not appear anywhere in a DWG build.
- **B2 (Task 4 Step 4 `HostProblem`, important; founder decision F9 A): never host in a pre-existing wall.** Keep the
  model's walls in the candidate list (ambiguity is still detected), but a hit on a wall that was already in the model is a
  named gap with F9's text. Only walls this build creates can host. S2-1's pass text stays "no pre-existing element changes".
  One offline check: an opening over a pre-existing wall only → that gap.
- **B3 (Tasks 2–3, important): a rolled-back build names its culprit.** In all-or-nothing mode the handler keeps the failing
  and additional ids of the failure that rolled back (`RolledBackIds`). After a RolledBack commit the executor maps those ids
  through `result.Applied` (RevitElementId → ProposalGuid → element) to `Label(el)` and puts the labels in `Error`, e.g.
  `wall "A-WALL-EXT #12"`, so the person knows which layer to untick. One ghost-p2-check assertion that the reason carries
  the names (pure helper over plain ids).
- **B4 (Task 4 Decline/filing, minor): ledger honesty.** Count `ReviewChangesetsCommand.Report` successes in Decline; every
  changeset not recorded is named in the Ledger line ("still proposed — withdraw it on the web"), after trying `Withdraw` as a
  fallback. When Propose fails with a transport error (not a 4xx), say that a changeset may exist on the bridge.
- **B5 (E12, minor):** a door or window family must also be **wall**-hosted (its family's host is a wall), else a named gap —
  a roof-, floor- or ceiling-hosted window (skylight) never reaches the executor.
- **B6 (Risks, minor):** add: on dirty drawings, a commit-time Revit error (Can't make Wall, Can't keep elements joined —
  between Ghost walls or a Ghost wall and a user wall) now declines the whole build, named (B3); step 1 deleted only the
  failing new element. Record S2-1/S2-5 against it.
- **B7 (Task 4 planner, minor): one copy of each type rule.** Make `ResolveWallType`, `ResolveFloorType`, `CreateType` and
  `SymbolsOf` (or a static form) `internal static`; the planner calls them inside `try { … } catch (InvalidOperationException
  ex) { gap = ex.Message; }`, so its gap reason is the executor's own refusal text. Delete the planner's copies (`IsBasic`,
  `FloorTypeProblem`, `CeilingTypeProblem`, `Symbols`).
- **B8 (Task 2 FilingChecks, minor): C#↔JS parity of the 200 cap.** Assert that `WebApp/bridge/changesets-logic.mjs`
  contains `MAX_CHANGESET_ELEMENTS = {GhostFiling.MaxElements};`.
- **B9 (drill S2-8, minor):** Ctrl+Z S2-5's build before S2-8 (or record N walls per copy); the row must be passable.
- **B10 (Risks + Next, minor):** add: filed chunks are ordinary `proposed` changesets until Ghost's run reports them; a
  member on another model bound to the same project could apply one in that window. Next: a bridge claim status
  (`applying`) set at filing.
- **B11 (Task 2 `GhostFiling.Run`, minor):** delete the unreachable "an arc whose ends meet" test and its wording; merge its
  promote-check row into the short-run row.

## What this deletes, and what stays

| Today | After step 2 |
|---|---|
| `GhostBuilderOrchestrator.Place(Inputs, MappingResult, Level)` and `Place(…, long levelId)`: DWG placement, in one `Ghost Builder - LOD 200` transaction | **Deleted.** `GhostBuilderPlacementEvent` calls `GhostChangesetBuild.Run` |
| DWG elements created by `GhostPlacementEngine` / `ElementPlacementFactory.Place` | `ChangesetExecutor`'s creators (wall, floor, ceiling, door, window, and the new column and furniture) |
| `GhostFailureHandler`'s delete-ours rule on DWG builds | Massing only. DWG commits go through the same handler in all-or-nothing mode, inside the executor |
| Ghost's own "Placed" recount and warning count | The executor's recount and warnings (E2, E3) |
| No provenance stamp, no ledger row, no undo watcher for Ghost | The executor's stamp (`source: dwg`); `changeset_proposed` and `changeset_applied` rows; `changeset_reverted` on Ctrl+Z |
| **Stays until MA-6 (F5):** `PlacePrepared`, `GhostPlacementEngine`, `ElementPlacementFactory.Place`, `GhostFailureHandler`'s step-1 rule and the `Ghost Builder - LOD 200` name | MA-6 files the massing shell as changesets, and these then go |

---

## Tasks (in order: bridge, pure half, executor, Ghost, drill files)

### Task 1 — Bridge: column, furniture and arc walls

**Files:**
- Modify `WebApp/bridge/changesets-logic.mjs` (`:5-6`, `:9-10`, `:31-35`, `:87`, `:97-98`, `:137-140`)
- Modify `WebApp/bridge/changesets-logic.test.mjs` (`:25-29`, `:59-63`, `:269`, before `:453`)
- Modify `WebApp/bridge/mcp-server.mjs` (`:101`)
- Modify `WebApp/bridge/mcp-server.test.mjs` (`:148`)

**Interfaces:**
- `VOCABULARY = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture"]`. Because `OP_KINDS.create` is `VOCABULARY`, `OP_KINDS.retype` and `OP_KINDS.attach` stay as they are.
- New place fields:
  - `FamilyName`, `Location` and `Mark` are accepted on `column` and `furniture`;
  - `LocationCurve.mid` (a finite `[x,y,z]`) is accepted on `wall` only.
- New create rules: `column` and `furniture` need `TypeName`, `FamilyName`, `LevelName` and a finite `[x,y,z]` `Location`.

- [ ] **Step 0: Branch and baselines.** Run `git checkout -b feature/ma1a-step2-ghost-executor 0059841`. Then record each check's master total, so later totals can be compared:
  - `dotnet run --project tools/promote-check`, expect `160/160 checks pass`;
  - `dotnet run --project tools/ghost-p2-check`, expect `87/87 checks pass`;
  - `dotnet run --project tools/session-check`, expect `47/47 checks pass`;
  - `dotnet run --project tools/ghost-standards-check`, `dotnet run --project tools/wallpair-check` and `dotnet run --project tools/massing-check`, expect `146/146`, `9/9` and `13/13 checks pass` (none of them compiles a file this plan changes);
  - from `WebApp`, `npx vitest run bridge/`, expect `Tests  1620 passed | 1 skipped (1621)`.
- [ ] **Step 1: The referee rule names Ghost's gate (F1).** In `WebApp/bridge/changesets-logic.mjs`, replace

```js
// THE REFEREE RULE: nothing in this feature creates model data. A changeset is a PROPOSAL — the
// Revit add-in executes only what a human ticks, and only after re-checking the status.
```

with

```js
// THE REFEREE RULE: nothing in this feature creates model data. A changeset is a PROPOSAL — the
// Revit add-in executes only what a human ticks, and only after re-checking the status. A Ghost Builder
// build (source "dwg", MA-1a step 2) is ticked in Ghost's own review, layer by layer, before it is filed,
// and the add-in runs it as filed.
```

- [ ] **Step 2: Vocabulary and place fields.** In the same file, replace

```js
// MA-1 placement slice: roof, ceiling, door, window
export const VOCABULARY = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window"];
```

with

```js
// MA-1 placement slice: roof, ceiling, door, window. MA-1a step 2: column, furniture — Ghost Builder's unhosted point families.
export const VOCABULARY = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture"];
```

and replace

```js
const PLACE_FIELDS = {
  FamilyName: ["door", "window"], Mark: ["wall", "floor", "roof", "ceiling", "door", "window"], Structural: ["floor"],
  Location: ["door", "window"], FlipFacing: ["door", "window"], FlipHand: ["door", "window"], SillHeight: ["window"],
  Boundary: ["roof", "ceiling"], BaseOffset: ["roof"], Offset: ["ceiling"],
};
```

with

```js
const PLACE_FIELDS = {
  FamilyName: ["door", "window", "column", "furniture"], Mark: ["wall", "floor", "roof", "ceiling", "door", "window", "column", "furniture"],
  Structural: ["floor"], Location: ["door", "window", "column", "furniture"], FlipFacing: ["door", "window"], FlipHand: ["door", "window"],
  SillHeight: ["window"], Boundary: ["roof", "ceiling"], BaseOffset: ["roof"], Offset: ["ceiling"],
};
// The point kinds: a family placed at place.Location on its level — a door or window in the one wall under it, a column or
// furniture unhosted (MA-1a step 2).
const POINT_KINDS = ["door", "window", "column", "furniture"];
```

- [ ] **Step 3: Arc walls and point kinds in `checkPlace`.** Replace

```js
    if (c.start.every((v, i) => v === c.end[i])) throw err(400, `${at}: ${kind} LocationCurve start and end are identical (zero-length)`);
```

with

```js
    if (c.start.every((v, i) => v === c.end[i])) throw err(400, `${at}: ${kind} LocationCurve start and end are identical (zero-length)`);
    // MA-1a step 2: an arc wall carries one more point on its arc (Ghost Builder's curved DWG walls); a grid stays straight.
    if (c.mid !== undefined && (kind !== "wall" || !point(c.mid))) throw err(400, `${at}: place.LocationCurve.mid is a wall's point on its arc, a finite [x,y,z]`);
```

and replace

```js
  } else if (kind === "door" || kind === "window") {
    if (!point(place.Location)) throw err(400, `${at}: a ${kind} needs place.Location, the finite [x,y,z] point on its host wall's location line (z = its level's elevation)`);
```

with

```js
  } else if (POINT_KINDS.includes(kind)) {
    if (!point(place.Location)) throw err(400, kind === "door" || kind === "window"
      ? `${at}: a ${kind} needs place.Location, the finite [x,y,z] point on its host wall's location line (z = its level's elevation)`
      : `${at}: a ${kind} needs place.Location, the finite [x,y,z] point it stands on (z = its level's elevation)`);
```

- [ ] **Step 4: Create rules.** Replace

```js
      if ((el.kind === "door" || el.kind === "window") && !text(el.place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.FamilyName — a type name alone is not one type`);
      if (["roof", "ceiling", "door", "window"].includes(el.kind) && !text(el.place.LevelName, 256))
```

with

```js
      if (POINT_KINDS.includes(el.kind) && !text(el.place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.FamilyName — a type name alone is not one type`);
      if (["roof", "ceiling", ...POINT_KINDS].includes(el.kind) && !text(el.place.LevelName, 256))
```

- [ ] **Step 5: The MCP tool says the new words.** In `WebApp/bridge/mcp-server.mjs`, inside the `sentinel_propose_changeset` description, make two replacements. First, replace

```
Element kinds: wall, floor, level, grid, roof, ceiling, door, window. Geometry in millimetres, project-internal coordinates: walls/grids need place.LocationCurve {start:[x,y,z], end:[x,y,z]};
```

with

```
Element kinds: wall, floor, level, grid, roof, ceiling, door, window, column, furniture. Geometry in millimetres, project-internal coordinates: walls/grids need place.LocationCurve {start:[x,y,z], end:[x,y,z]} (an arc wall adds mid:[x,y,z], a point on its arc);
```

Second, replace

```
(a window: optional place.SillHeight; both: optional place.FlipFacing, place.FlipHand).
```

with

```
(a window: optional place.SillHeight; both: optional place.FlipFacing, place.FlipHand); columns and furniture place.FamilyName, place.LevelName and place.Location [x,y,z], unhosted on that level, z = the level's elevation.
```

- [ ] **Step 6: Tests.** In `WebApp/bridge/changesets-logic.test.mjs`, make four changes.

First, replace

```js
const MA1 = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window"];

describe("VOCABULARY", () => {
  it("is the MA-1 list", () => expect(VOCABULARY).toEqual(MA1));
```

with

```js
// MA-1a step 2 adds column and furniture (Ghost Builder's unhosted point families).
const MA1 = ["wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture"];

describe("VOCABULARY", () => {
  it("is the MA-1 list, with MA-1a step 2's column and furniture", () => expect(VOCABULARY).toEqual(MA1));
```

Second, two tests used `column` as the example of a kind outside the vocabulary; they now use `beam`. Replace

```js
    try { validateChangeset(CS([wall(), { ...wall(), kind: "column" }])); throw new Error("no throw"); }
    catch (e) {
      expect(e.status).toBe(400);
      expect(e.message).toMatch(/\[1\]/);
      expect(e.message).toMatch(/wall, floor, level, grid, roof, ceiling, door, window/);
```

with

```js
    try { validateChangeset(CS([wall(), { ...wall(), kind: "beam" }])); throw new Error("no throw"); }
    catch (e) {
      expect(e.status).toBe(400);
      expect(e.message).toMatch(/\[1\]/);
      expect(e.message).toMatch(/wall, floor, level, grid, roof, ceiling, door, window, column, furniture/);
```

Third, replace

```js
    status400(() => validateChangeset(CS([wall({ kind: "column" })])), /kind "column" is not supported — allowed: wall, floor, level, grid, roof, ceiling, door, window/);
```

with

```js
    status400(() => validateChangeset(CS([wall({ kind: "beam" })])), /kind "beam" is not supported — allowed: wall, floor, level, grid, roof, ceiling, door, window, column, furniture/);
```

Fourth, insert this block immediately before the line `// The body the Revit planner files (PromoteWallsPlanner.Bodies), shared with tools/promote-check:`:

```js
// MA-1a step 2: Ghost Builder files its DWG rows as changesets — columns and furniture stand on their level unhosted, and a
// curved DWG wall carries one more point on its arc.
describe("validateChangeset — MA-1a step 2 (Ghost Builder: column, furniture, arc walls)", () => {
  const make = (kind, Class, Name, base) => (over = {}) => ({ kind, validate: { identity: { Class, Name } }, place: { ...base, ...over } });
  const column = make("column", "IfcColumn", "A-COLS #1", { LevelName: "Level 1", FamilyName: "M_Rectangular Column", TypeName: "450 x 600mm", Location: [1000, 2000, 0] });
  const furniture = make("furniture", "IfcFurniture", "A-FURN #1", { LevelName: "Level 1", FamilyName: "M_Desk", TypeName: "1525 x 762mm", Location: [3000, 2000, 0], Mark: "D1" });
  const arc = (mid) => wall({ place: { ...wall().place, LocationCurve: { start: [0, 0, 0], end: [2000, 0, 0], mid } } });
  const ok = (el) => validateChangeset(CS([el])).elements[0];

  it("passes a column and a furniture create and keeps its place", () => {
    for (const b of [column, furniture]) {
      const sent = b();
      expect(ok(sent)).toMatchObject({ kind: sent.kind, op: "create", target: null });
      expect(ok(sent).place).toEqual(sent.place);
    }
  });

  it("a column or furniture needs FamilyName, TypeName, LevelName and a finite [x,y,z] Location", () => {
    for (const b of [column, furniture]) {
      for (const f of ["FamilyName", "TypeName", "LevelName", "Location"]) status400(() => ok(b({ [f]: undefined })), new RegExp(`needs place\\.${f}`));
      status400(() => ok(b({ Location: [1, 2] })), /needs place\.Location, the finite \[x,y,z\] point it stands on/);
    }
  });

  it("a column or furniture takes no sill, flip or outline", () => {
    for (const b of [column, furniture])
      for (const f of ["SillHeight", "FlipFacing", "FlipHand", "Boundary", "Offset"]) status400(() => ok(b({ [f]: 1 })), new RegExp(`takes no place\\.${f}`));
  });

  it("column and furniture are create-only", () => {
    const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    for (const kind of ["column", "furniture"])
      status400(() => ok({ op: "retype", kind, target: { unique_id: UID }, place: { FamilyName: "F", TypeName: "T" }, validate: { identity: { Class: "IfcColumn", Name: "C" } } }),
        new RegExp(`kind "${kind}" is not supported for retype`));
  });

  it("a wall may carry LocationCurve.mid, a finite [x,y,z] on its arc; a grid may not", () => {
    expect(ok(arc([1000, 1000, 0])).place.LocationCurve).toEqual({ start: [0, 0, 0], end: [2000, 0, 0], mid: [1000, 1000, 0] });
    for (const bad of [[1000, 1000], [NaN, 0, 0], "mid"]) status400(() => ok(arc(bad)), /LocationCurve\.mid is a wall's point on its arc/);
    const grid = { kind: "grid", validate: { identity: { Class: "IFCGRID", Name: "A" } }, place: { LocationCurve: { start: [0, 0, 0], end: [0, 9000, 0], mid: [10, 4500, 0] } } };
    status400(() => ok(grid), /LocationCurve\.mid is a wall's point on its arc/);
  });
});

```

In `WebApp/bridge/mcp-server.test.mjs`, replace

```js
    expect(t.description).toMatch(/roof, ceiling, door, window/);
```

with

```js
    expect(t.description).toMatch(/roof, ceiling, door, window/);
    expect(t.description).toMatch(/door, window, column, furniture/); // MA-1a step 2
    expect(t.description).toMatch(/mid:\[x,y,z\]/);
```

- [ ] **Step 7: Run the bridge tests.** From `WebApp`:
  - run `npx vitest run bridge/changesets-logic.test.mjs bridge/mcp-server.test.mjs bridge/changesets-store.test.mjs`; expect `Tests  113 passed (113)` (master 108; 5 new tests);
  - run `npx vitest run bridge/`; expect `Tests  1625 passed | 1 skipped (1626)`.
- [ ] **Step 8: Commit.**

```bash
git add WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-logic.test.mjs WebApp/bridge/mcp-server.mjs WebApp/bridge/mcp-server.test.mjs
git commit -F - <<'EOF'
feat(bridge): column and furniture creates, arc walls (LocationCurve.mid) — MA-1a step 2

Ghost Builder's unhosted point families and curved DWG walls get changeset words: column and furniture need FamilyName,
TypeName, LevelName and Location; a wall's LocationCurve may carry mid, a point on its arc; a grid may not. The referee
rule names Ghost's own review as the tick for a dwg build.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2 — The pure filing half, the Doctor's predicate, one Undo over many changesets (offline)

**Files:**
- Create `SentinelAddin/GhostBuilder/GhostFiling.cs`
- Modify `SentinelAddin/Coordination/ChangesetClient.cs` (`:17-21`, before `:229`)
- Modify `SentinelAddin/GhostBuilder/GhostFailurePolicy.cs` (`:99-105`)
- Modify `SentinelAddin/Engine/UndoWatcher.cs` (`:29`, `:35-46`)
- Create `tools/promote-check/Filing.cs`
- Modify `tools/promote-check/promote-check.csproj` (`:20`), `tools/promote-check/Check.cs` (`:34`)
- Modify `tools/ghost-p2-check/Honest.cs` (`:82-83`)
- Create `WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json`
- Modify `WebApp/bridge/changesets-logic.test.mjs` (append)

**Interfaces** (namespace `Sentinel.GhostBuilder`, `public static class GhostFiling`):
- `const string Source = "dwg"`, `const int MaxElements = 200`
- `static readonly IReadOnlyDictionary<string, (string Kind, string Ifc)> Kinds`. It maps Walls→wall/IfcWall, Floors→floor/IfcSlab, Ceilings→ceiling/IfcCovering, Doors→door/IfcDoor, Windows→window/IfcWindow, Columns→column/IfcColumn and Furniture→furniture/IfcFurniture.
- `static string SyntheticHint(string name)`
- `static (double Base, double Top) WallElevations(double levelMm, double cadBaseFt, double cadTopFt, double tolFt)`
- `static CurveDto Run(double[] a, double[] b, double[] mid, double z, double tolMm)` (a, b, mid are `[x,y]` in mm; null when too short)
- `static ChangesetElementDto Wall(string layer, int n, string typedBy, string typeName, string level, CurveDto run, double baseMm, double topMm)`
- `static ChangesetElementDto Floor(string layer, int n, string typeName, string level, IReadOnlyList<double[]> loopMm)`
- `static ChangesetElementDto Ceiling(string layer, int n, string typeName, string level, IReadOnlyList<double[]> outlineMm, double offsetMm)`
- `static ChangesetElementDto Point(string kind, string layer, int n, string family, string typeName, string level, double x, double y, double levelMm)`
- `static List<List<ChangesetElementDto>> Chunks(IReadOnlyList<ChangesetElementDto> els, int max = MaxElements)`
- `static string Name(string drawing, string level, int i, int n)`
- `static object Body(string name, string actor, IReadOnlyList<ChangesetElementDto> els)`
- `static ChangesetDto Local(string name, IReadOnlyList<ChangesetElementDto> els)`

Changes to existing types:
- `CurveDto.Mid` (`[JsonPropertyName("mid")] double[]`)
- `ChangesetClient.Withdraw(BcfConfig cfg, string projectKey, string id, out string error)` → bool
- `GhostFailurePolicy`:
  - `const string TypesTxName = "Ghost Builder - types"`
  - `const string ParamsTxName = "Ghost Builder - parameters"`
  - `const string ChangesetTxPrefix = "Sentinel AI changeset: "`
  - `static bool DoctorSkips(string)` (widened)
  - `static Act DecideAllOrNothing(Severity)`
  - `static string AllOrNothingReason(string description, Severity severity)`
  - `static string NotFiledLine(string reason)`
- `UndoWatcher.Remember`/`Hits`: same signatures, but a name may now hold several changesets, and `Hits` is distinct by changeset id.

- [ ] **Step 1: Create `SentinelAddin/GhostBuilder/GhostFiling.cs`**

```csharp
#nullable disable
// MA-1a step 2 (design §2.4 step 2): Ghost Builder files its reviewed rows as changesets with source "dwg", and
// ChangesetExecutor places them — this is the pure half. The changeset element each Ghost row becomes (millimetres, absolute
// elevations, exact type names), the chunks the bridge's 200-element cap allows (hosts before what they host), the POST
// body, and the local changeset an unbound model runs through the same executor without a ledger. No Revit API, so
// tools/promote-check proves it offline against the bridge's fixture (ghost-dwg-body.json); the Revit half is
// GhostChangesetBuild.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder
{
    public static class GhostFiling
    {
        /// <summary>The changeset source of a DWG build (the bridge stores it; the executor stamps it on every element).</summary>
        public const string Source = "dwg";
        /// <summary>The bridge's MAX_CHANGESET_ELEMENTS (changesets-logic.mjs): a larger body is a 413.</summary>
        public const int MaxElements = 200;
        private const double FtToMm = 304.8;

        /// <summary>A Ghost row's category → the changeset kind and the IFC class it is adjudicated as. A category not here
        /// is not filed (the summary says so).</summary>
        public static readonly IReadOnlyDictionary<string, (string Kind, string Ifc)> Kinds =
            new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase)
            {
                ["Walls"] = ("wall", "IfcWall"), ["Floors"] = ("floor", "IfcSlab"), ["Ceilings"] = ("ceiling", "IfcCovering"),
                ["Doors"] = ("door", "IfcDoor"), ["Windows"] = ("window", "IfcWindow"),
                ["Columns"] = ("column", "IfcColumn"), ["Furniture"] = ("furniture", "IfcFurniture"),
            };

        private static readonly HashSet<string> Synthetic = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Generic Wall", "Generic Door", "Generic Window", "Generic Floor", "Generic Ceiling", "Generic Column", "Generic Furniture",
            "Generic Model",
        };

        /// <summary>The words added to a gap when the row's name is one of the placeholders the layer standard's matcher or the
        /// local model's normaliser writes ("Generic Door", …) — no model has them; empty otherwise.</summary>
        public static string SyntheticHint(string name) =>
            name != null && Synthetic.Contains(name.Trim())
                ? $" — \"{name.Trim()}\" is a placeholder the layer mapping wrote, not a type in this model; pick a loaded type in the review"
                : "";

        /// <summary>A wall's base and top in absolute mm, as the executor reads them: the CAD Z is the wall's offset from the
        /// build level (Ghost's rule since P1), and its height is CAD top − CAD base (10 ft when the drawing has none), at
        /// least ten times Revit's short-curve tolerance.</summary>
        public static (double Base, double Top) WallElevations(double levelMm, double cadBaseFt, double cadTopFt, double tolFt)
        {
            double b = levelMm + cadBaseFt * FtToMm;
            return (b, b + Math.Max(cadTopFt - cadBaseFt, tolFt * 10) * FtToMm);
        }

        /// <summary>One wall run, flat at <paramref name="z"/> (mm): a line from <paramref name="a"/> to <paramref name="b"/>
        /// ([x,y] mm), or an arc through <paramref name="mid"/> — null when, flattened, it is shorter than
        /// <paramref name="tolMm"/> (a near-vertical or degenerate CAD segment, which Wall.Create refuses) or an arc whose ends
        /// meet.</summary>
        public static CurveDto Run(double[] a, double[] b, double[] mid, double z, double tolMm)
        {
            double L(double[] p, double[] q) => Math.Sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]));
            if (L(a, b) < tolMm) return null;
            if (mid != null && L(a, mid) + L(mid, b) < tolMm) return null;
            return new CurveDto
            {
                Start = new[] { a[0], a[1], z }, End = new[] { b[0], b[1], z },
                Mid = mid == null ? null : new[] { mid[0], mid[1], z },
            };
        }

        // Each element is named "<layer> #<n>" (n counts this build's elements of that layer) and says where it came from.
        private static ChangesetElementDto Create(string kind, string layer, int n, string typedBy, PlaceDto place) => new ChangesetElementDto
        {
            Kind = kind, Op = "create",
            Reason = Clip($"Ghost Builder: {kind} on layer {layer}" + (typedBy == null ? "" : $", typed by the {typedBy}"), 500),
            Validate = new ValidateDto { Identity = new IdentityDto { Class = Kinds.Values.First(k => k.Kind == kind).Ifc, Name = Clip($"{layer} #{n}", 256) } },
            Place = place,
        };

        /// <param name="typedBy">"guideline", "mapping" or "reviewer" (ElementPlacementFactory.ResolveWallType).</param>
        public static ChangesetElementDto Wall(string layer, int n, string typedBy, string typeName, string level, CurveDto run, double baseMm, double topMm) =>
            Create("wall", layer, n, typedBy, new PlaceDto { TypeName = typeName, LevelName = level, LocationCurve = run, BaseElevation = baseMm, TopElevation = topMm });

        /// <param name="loopMm">The outline's corners [x,y,z] mm, as drawn (the executor closes the loop).</param>
        public static ChangesetElementDto Floor(string layer, int n, string typeName, string level, IReadOnlyList<double[]> loopMm) =>
            Create("floor", layer, n, null, new PlaceDto
            {
                TypeName = typeName, LevelName = level, LocationLoop = loopMm.Select(p => new[] { p[0], p[1], p[2] }).ToArray(),
            });

        /// <param name="offsetMm">Its height above the level (the bridge requires one; founder decision F7: the drawing's).</param>
        public static ChangesetElementDto Ceiling(string layer, int n, string typeName, string level, IReadOnlyList<double[]> outlineMm, double offsetMm) =>
            Create("ceiling", layer, n, null, new PlaceDto
            {
                TypeName = typeName, LevelName = level, Boundary = outlineMm.Select(p => new[] { p[0], p[1] }).ToArray(), Offset = offsetMm,
            });

        /// <summary>A door, window, column or furniture at (x, y) on its level (z = the level's elevation): a door or window is
        /// hosted by the one wall under the point, a column or furniture stands unhosted.</summary>
        public static ChangesetElementDto Point(string kind, string layer, int n, string family, string typeName, string level,
                                                double x, double y, double levelMm) =>
            Create(kind, layer, n, null, new PlaceDto { FamilyName = family, TypeName = typeName, LevelName = level, Location = new[] { x, y, levelMm } });

        private static bool IsPoint(string kind) => kind == "door" || kind == "window" || kind == "column" || kind == "furniture";

        /// <summary>The elements, at most <paramref name="max"/> per changeset: every wall, floor and ceiling before any door,
        /// window, column or furniture, each in the order planned — the chunks run in this order inside one Undo, so an
        /// opening's host already exists when its chunk runs (the executor looks for hosts among all the model's walls).</summary>
        public static List<List<ChangesetElementDto>> Chunks(IReadOnlyList<ChangesetElementDto> els, int max = MaxElements)
        {
            var ordered = els.Where(e => !IsPoint(e.Kind)).Concat(els.Where(e => IsPoint(e.Kind))).ToList();
            var chunks = new List<List<ChangesetElementDto>>();
            for (int i = 0; i < ordered.Count; i += max) chunks.Add(ordered.Skip(i).Take(max).ToList());
            return chunks;
        }

        /// <summary>"Ghost Builder · plan · Level 1", with "(2/3)" when the build is several changesets.</summary>
        public static string Name(string drawing, string level, int i, int n) =>
            $"Ghost Builder · {(string.IsNullOrWhiteSpace(drawing) ? "drawing" : drawing.Trim())} · {level}" + (n > 1 ? $" ({i + 1}/{n})" : "");

        /// <summary>The POST /changesets/:key body (serialised with ChangesetClient.WriteJson: nulls left out).</summary>
        public static object Body(string name, string actor, IReadOnlyList<ChangesetElementDto> els) =>
            new { name, source = Source, actor, elements = els };

        /// <summary>An unbound model's changeset: the same elements with local guids and id, never filed — the executor runs it
        /// and stamps it as source dwg; no ledger row exists.</summary>
        public static ChangesetDto Local(string name, IReadOnlyList<ChangesetElementDto> els)
        {
            var cs = new ChangesetDto { Id = Guid.NewGuid().ToString(), Name = name, Source = Source, Status = "local" };
            foreach (var e in els)
            {
                e.ProposalGuid = Guid.NewGuid().ToString();
                cs.Elements.Add(e);
            }
            return cs;
        }

        private static string Clip(string s, int max) => s == null || s.Length <= max ? s : s.Substring(0, max - 1) + "…";
    }
}
```

- [ ] **Step 2: The arc's point, and Withdraw.** In `SentinelAddin/Coordination/ChangesetClient.cs`, make two replacements. First, replace

```csharp
    [JsonPropertyName("end")] public double[] End { get; set; }
}
```

with

```csharp
    [JsonPropertyName("end")] public double[] End { get; set; }
    /// <summary>MA-1a step 2: a point on an arc wall between its ends (a curved DWG wall); null = a straight line.</summary>
    [JsonPropertyName("mid")] public double[] Mid { get; set; }
}
```

Second, replace

```csharp
    /// <summary>A person undid or redid an applied changeset in Revit:
```

with

```csharp
    /// <summary>Withdraw a proposed changeset (POST /changesets/:key/:id/withdraw → 200): a Ghost build that filed some of its
    /// changesets and then could not file the rest takes them back, so none is left for a later review to apply.</summary>
    public static bool Withdraw(BcfConfig cfg, string projectKey, string id, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/withdraw",
             JsonSerializer.Serialize(new { actor = UserSession.Actor }, WriteJson), 200, out _, out error);

    /// <summary>A person undid or redid an applied changeset in Revit:
```

- [ ] **Step 3: The Doctor's predicate and the all-or-nothing rule (E1, E2).** In `SentinelAddin/GhostBuilder/GhostFailurePolicy.cs`, replace

```csharp
        /// <summary>The Ghost transaction's name (DWG and massing) — unchanged; step 2 renames it with the changeset.</summary>
        public const string TxName = "Ghost Builder - LOD 200";

        /// <summary>A4: the global Doctor (FailureInterceptor) leaves this transaction's warnings alone — Ghost counts them and
        /// leaves them in the model ([BP] P1-3). Step 2 must widen this to the executor's transaction for Ghost-sourced
        /// changesets, or P1-3 regresses.</summary>
        public static bool DoctorSkips(string transactionName) => transactionName == TxName;
```

with

```csharp
        /// <summary>Photo Massing's transaction name (it keeps its own path until MA-6). A DWG build no longer uses it: it runs
        /// as changesets (GhostChangesetBuild).</summary>
        public const string TxName = "Ghost Builder - LOD 200";

        /// <summary>MA-1a step 2: a DWG build's two own transactions inside its one Undo — the types and families its rows
        /// need, before the changesets run, and the document values (P2) after.</summary>
        public const string TypesTxName = "Ghost Builder - types";
        public const string ParamsTxName = "Ghost Builder - parameters";

        /// <summary>Every changeset the executor runs is named UndoWatcher.TxName(…), which starts with this (promote-check
        /// proves the two agree).</summary>
        public const string ChangesetTxPrefix = "Sentinel AI changeset: ";

        /// <summary>A4, widened in MA-1a step 2: the global Doctor (FailureInterceptor) leaves these transactions' warnings
        /// alone — massing's, a DWG build's types and parameters, and EVERY changeset's (Ghost's are changesets now; the
        /// name carries no source, and a changeset counts its warnings and leaves them in the model too, [BP] P1-3).</summary>
        public static bool DoctorSkips(string transactionName) =>
            transactionName == TxName || transactionName == TypesTxName || transactionName == ParamsTxName
            || (transactionName != null && transactionName.StartsWith(ChangesetTxPrefix, StringComparison.Ordinal));

        /// <summary>MA-1a step 2: the changeset executor's rule (founder decision F1 B of step 1, which arrives here): a
        /// warning is counted and left to Revit; any error rolls the whole changeset back — nothing is deleted or resolved.</summary>
        public static Act DecideAllOrNothing(Severity severity) => severity == Severity.Warning ? Act.Count : Act.RollBack;

        /// <summary>Why a changeset was rolled back at commit, in words.</summary>
        public static string AllOrNothingReason(string description, Severity severity)
        {
            string what = string.IsNullOrWhiteSpace(description) ? "a Revit failure" : description.Trim();
            return what + (severity == Severity.Corruption
                ? " (Revit reports document corruption)"
                : " (a Revit error at commit: the changeset is all or nothing, so none of it was kept)");
        }

        /// <summary>MA-1a step 2: a DWG build that could not be filed as changesets — nothing exists.</summary>
        public static string NotFiledLine(string reason) =>
            "Nothing was built — the build could not be filed as a changeset, so Sentinel rolled it back (no element, type or family was added): " + reason;
```

- [ ] **Step 4: One Undo name over several changesets (E4).** In `SentinelAddin/Engine/UndoWatcher.cs`, replace

```csharp
        private static readonly ConcurrentDictionary<string, Entry> Registry = new ConcurrentDictionary<string, Entry>(StringComparer.Ordinal);
```

with

```csharp
        // MA-1a step 2: one Undo name may cover several changesets — a Ghost build over 200 elements is several changesets run
        // inside one TransactionGroup, assimilated into one Undo entry named as the first changeset.
        private static readonly ConcurrentDictionary<string, List<Entry>> Registry = new ConcurrentDictionary<string, List<Entry>>(StringComparer.Ordinal);
```

and replace

```csharp
        /// <summary>Remember a changeset whose result the bridge accepted.</summary>
        public static void Remember(string tx, string key, string changesetId, IEnumerable<string> guids)
        {
            var list = (guids ?? Enumerable.Empty<string>()).Where(g => !string.IsNullOrEmpty(g)).Distinct().ToList();
            if (string.IsNullOrEmpty(tx) || list.Count == 0) return;
            Registry[tx] = new Entry { Key = key, ChangesetId = changesetId, Guids = list };
        }

        /// <summary>The remembered changesets among <paramref name="names"/>; unknown names are ignored.</summary>
        public static List<Entry> Hits(IEnumerable<string> names) =>
            (names ?? Enumerable.Empty<string>()).Distinct(StringComparer.Ordinal)
                .Select(n => Registry.TryGetValue(n, out var e) ? e : null).Where(e => e != null).ToList();
```

with

```csharp
        /// <summary>Remember a changeset whose result the bridge accepted, under the Undo name that removes it. Remembering the
        /// same changeset again under the same name replaces it; another changeset under that name is added beside it.</summary>
        public static void Remember(string tx, string key, string changesetId, IEnumerable<string> guids)
        {
            var list = (guids ?? Enumerable.Empty<string>()).Where(g => !string.IsNullOrEmpty(g)).Distinct().ToList();
            if (string.IsNullOrEmpty(tx) || list.Count == 0) return;
            var entry = new Entry { Key = key, ChangesetId = changesetId, Guids = list };
            Registry.AddOrUpdate(tx, _ => new List<Entry> { entry },
                (_, old) => old.Where(o => o.ChangesetId != changesetId).Concat(new[] { entry }).ToList());
        }

        /// <summary>The remembered changesets among <paramref name="names"/>, each once (a Ghost build is remembered under its
        /// Undo entry's name and under each changeset's own transaction name, whichever Revit reports); unknown names are
        /// ignored.</summary>
        public static List<Entry> Hits(IEnumerable<string> names) =>
            (names ?? Enumerable.Empty<string>()).Distinct(StringComparer.Ordinal)
                .SelectMany(n => Registry.TryGetValue(n, out var es) ? es : new List<Entry>())
                .GroupBy(e => e.ChangesetId ?? "", StringComparer.Ordinal).Select(g => g.First()).ToList();
```

- [ ] **Step 5: promote-check compiles the filing half and the Doctor rule.** In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\PlacementGeometry.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\PlacementGeometry.cs" />
    <!-- MA-1a step 2: Ghost Builder's changeset bodies, and the Doctor's skip rule they must agree with -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostFiling.cs" />
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostFailurePolicy.cs" />
```

In `tools/promote-check/Check.cs`, replace

```csharp
        PlacementChecks();
```

with

```csharp
        PlacementChecks();
        FilingChecks();
```

- [ ] **Step 6: Create `tools/promote-check/Filing.cs`**

```csharp
#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 10. MA-1a step 2: Ghost Builder files changesets (GhostFiling), the Doctor skips them, one Undo covers many ────────
    static void FilingChecks()
    {
        Console.WriteLine("\nMA-1a step 2 — Ghost Builder files changesets (GhostFiling)");
        const double Tol = 0.0026; // Revit's ShortCurveTolerance, about 0.79 mm, in feet

        var (b, t) = GhostFiling.WallElevations(3000, 0, 10, Tol);
        Ok(Math.Abs(b - 3000) < 1e-9 && Math.Abs(t - 6048) < 1e-9,
           "a 10 ft CAD wall at CAD Z 0 on a level at 3000 mm → base 3000, top 6048 (absolute mm: the CAD Z is the offset from the level)");
        var (b1, t1) = GhostFiling.WallElevations(0, 1, 1, Tol);
        Ok(Math.Abs(b1 - 304.8) < 1e-9 && t1 > b1, "a CAD wall with no height still rises ten short-curve tolerances — the executor refuses top ≤ base");

        var line = GhostFiling.Run(new double[] { 0, 0 }, new double[] { 5000, 0 }, null, 3000, Tol * 304.8);
        Ok(line != null && line.Mid == null && line.Start.SequenceEqual(new double[] { 0, 0, 3000 }) && line.End.SequenceEqual(new double[] { 5000, 0, 3000 }),
           "a line is filed flat at its base elevation, with no mid point");
        Ok(GhostFiling.Run(new double[] { 0, 0 }, new double[] { 0.5, 0 }, null, 0, Tol * 304.8) == null,
           "a run shorter than Revit's short-curve tolerance once flat (a near-vertical CAD line) is not filed");
        var arc = GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 1000 }, 0, Tol * 304.8);
        Ok(arc?.Mid != null && arc.Mid.SequenceEqual(new double[] { 1000, 1000, 0 }), "an arc wall carries its mid point, flat at the base");
        Ok(GhostFiling.Run(new double[] { 0, 0 }, new double[] { 0, 0.1 }, new double[] { 1000, 1000 }, 0, Tol * 304.8) == null,
           "an arc whose ends meet is not a wall run");

        Ok(GhostFiling.SyntheticHint("Generic Door").Contains("placeholder the layer mapping wrote") && GhostFiling.SyntheticHint(" generic wall ").Length > 0
           && GhostFiling.SyntheticHint("Generic - 200mm") == "" && GhostFiling.SyntheticHint(null) == "",
           "a synthetic 'Generic Door'/'Generic Wall' name is named as a placeholder; a real type such as 'Generic - 200mm' is not");

        CurveDto R(double x0, double y0, double x1, double y1) => GhostFiling.Run(new[] { x0, y0 }, new[] { x1, y1 }, null, 0, 1);
        var mixed = Enumerable.Range(0, 450).Select(i => i % 3 == 0
            ? GhostFiling.Point("door", "A-DOOR", i, "M_Single-Flush", "0915 x 2134mm", "Level 1", i, 0, 0)
            : GhostFiling.Wall("A-WALL", i, "mapping", "Generic - 200mm", "Level 1", R(i, 0, i + 100, 0), 0, 3048)).ToList();
        var chunks = GhostFiling.Chunks(mixed);
        var flat = chunks.SelectMany(c => c).ToList();
        Ok(chunks.Select(c => c.Count).SequenceEqual(new[] { 200, 200, 50 }), "450 elements → changesets of 200, 200 and 50 (the bridge's cap)");
        Ok(flat.FindIndex(e => e.Kind == "door") == 300 && flat.Skip(300).All(e => e.Kind == "door") && flat.Count == 450,
           "every wall is filed before any door: an opening's host exists when its changeset runs");
        Ok(flat.Where(e => e.Kind == "wall").Select(e => e.Validate.Identity.Name).Take(2).SequenceEqual(new[] { "A-WALL #1", "A-WALL #2" }),
           "the plan's order is kept within a kind");

        var local = GhostFiling.Local("Ghost Builder · plan · Level 1", chunks[2]);
        Ok(local.Source == "dwg" && Guid.TryParse(local.Id, out _) && local.Elements.Count == 50
           && local.Elements.All(e => Guid.TryParse(e.ProposalGuid, out _)) && local.Elements.Select(e => e.ProposalGuid).Distinct().Count() == 50,
           "an unbound model's changeset is local: source dwg, its own id, a distinct guid per element");
        Ok(GhostFiling.Name("plan", "Level 1", 0, 1) == "Ghost Builder · plan · Level 1" && GhostFiling.Name(" ", "L2", 1, 3) == "Ghost Builder · drawing · L2 (2/3)",
           "changeset names: the drawing and the level, and (i/n) when there are several");

        const string id = "3f2a9c8b-1d0e-4f5a-8b7c-6d5e4f3a2b1c";
        Ok(GhostFailurePolicy.DoctorSkips(UndoWatcher.TxName(GhostFiling.Name("plan", "Level 1", 0, 1), id))
           && GhostFailurePolicy.DoctorSkips(UndoWatcher.TxName("Promote walls (DD) · Level 1", id)) && !GhostFailurePolicy.DoctorSkips("Sentinel — import DWG plan"),
           "the Doctor skips every changeset's transaction (UndoWatcher.TxName starts with GhostFailurePolicy.ChangesetTxPrefix), not the DWG import");

        // One Undo entry over several changesets: remembered under the group's name and each changeset's own name, one hit each.
        const string id2 = "7b1e0c2d-9a8f-4e3d-a2b1-c0d9e8f7a6b5";
        string g = UndoWatcher.TxName("Ghost Builder · plan · Level 1 (1/2)", id), own2 = UndoWatcher.TxName("Ghost Builder · plan · Level 1 (2/2)", id2);
        UndoWatcher.Remember(g, "demo", id, new[] { "a1", "a2" });
        UndoWatcher.Remember(g, "demo", id2, new[] { "b1" });
        UndoWatcher.Remember(own2, "demo", id2, new[] { "b1" });
        var both = UndoWatcher.Hits(new[] { g });
        Ok(both.Count == 2 && both.Select(h => h.ChangesetId).SequenceEqual(new[] { id, id2 }), "one Undo name can cover two changesets: both are hits");
        Ok(UndoWatcher.Hits(new[] { g, own2 }).Count == 2, "a changeset remembered under two names that Revit both reports is one hit (no second ledger row)");
        UndoWatcher.Remember(g, "demo", id, new[] { "a1" });
        Ok(UndoWatcher.Hits(new[] { g }).Single(h => h.ChangesetId == id).Guids.SequenceEqual(new[] { "a1" }), "remembering the same changeset again replaces it");

        Console.WriteLine("\nMA-1a step 2 parity (WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json)");
        var els = new List<ChangesetElementDto>
        {
            GhostFiling.Wall("A-WALL-EXT", 1, "mapping", "Generic - 200mm", "Level 1", R(0, 0, 10000, 0), 0, 3048),
            GhostFiling.Wall("A-WALL-EXT", 2, "guideline", "Generic - 200mm", "Level 1",
                             GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 1000 }, 0, 1), 0, 3048),
            GhostFiling.Floor("A-FLOR", 1, "Generic 150mm", "Level 1", new[] { new double[] { 0, 0, 0 }, new double[] { 10000, 0, 0 }, new double[] { 10000, 7000, 0 }, new double[] { 0, 7000, 0 } }),
            GhostFiling.Ceiling("A-CLNG", 1, "600 x 600mm Grid", "Level 1", new[] { new double[] { 0, 0 }, new double[] { 4000, 0 }, new double[] { 4000, 7000 }, new double[] { 0, 7000 } }, 0),
            GhostFiling.Point("door", "A-DOOR", 1, "M_Single-Flush", "0915 x 2134mm", "Level 1", 6450, 0, 0),
            GhostFiling.Point("window", "A-GLAZ", 1, "M_Fixed", "0915 x 1220mm", "Level 1", 10000, 3500, 0),
            GhostFiling.Point("column", "A-COLS", 1, "M_Rectangular Column", "457 x 610mm", "Level 1", 5000, 3500, 0),
            GhostFiling.Point("furniture", "A-FURN", 1, "M_Desk", "1525 x 762mm", "Level 1", 2000, 2000, 0),
        };
        var got = JsonSerializer.SerializeToNode(GhostFiling.Body("Ghost Builder · sample-plan · Level 1", "yazan", els), ChangesetClient.WriteJson);
        var path = Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ghost-dwg-body.json");
        var text = File.Exists(path) ? File.ReadAllText(path) : "null";
        bool same = JsonNode.DeepEquals(got, JsonNode.Parse(text));
        Ok(same, "GhostFiling's body equals the fixture the bridge validates (wall, arc wall, floor, ceiling, door, window, column, furniture)");
        if (!same) Console.WriteLine("        got: " + got.ToJsonString(new JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        var cs = same ? JsonSerializer.Deserialize<ChangesetDto>(text) : null;
        Ok(cs?.Source == "dwg" && cs.Elements.Count == 8 && cs.Elements[1].Place.LocationCurve.Mid.SequenceEqual(new double[] { 1000, 1000, 0 })
           && cs.Elements.Where(e => e.Kind is "column" or "furniture").All(e => e.Place.FamilyName != null && e.Place.Location?.Length == 3),
           "the fixture reads back into the add-in's DTOs: source dwg, the arc's mid point, columns and furniture with FamilyName and Location");
    }
}
```

- [ ] **Step 7: Create `WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json`** (LF, per `.gitattributes`)

```json
{
  "name": "Ghost Builder · sample-plan · Level 1",
  "source": "dwg",
  "actor": "yazan",
  "elements": [
    {
      "kind": "wall", "op": "create", "reason": "Ghost Builder: wall on layer A-WALL-EXT, typed by the mapping",
      "validate": { "identity": { "Class": "IfcWall", "Name": "A-WALL-EXT #1" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "Level 1",
                 "LocationCurve": { "start": [0, 0, 0], "end": [10000, 0, 0] }, "BaseElevation": 0, "TopElevation": 3048 }
    },
    {
      "kind": "wall", "op": "create", "reason": "Ghost Builder: wall on layer A-WALL-EXT, typed by the guideline",
      "validate": { "identity": { "Class": "IfcWall", "Name": "A-WALL-EXT #2" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "Level 1",
                 "LocationCurve": { "start": [0, 0, 0], "end": [2000, 0, 0], "mid": [1000, 1000, 0] }, "BaseElevation": 0, "TopElevation": 3048 }
    },
    {
      "kind": "floor", "op": "create", "reason": "Ghost Builder: floor on layer A-FLOR",
      "validate": { "identity": { "Class": "IfcSlab", "Name": "A-FLOR #1" } },
      "place": { "TypeName": "Generic 150mm", "LevelName": "Level 1",
                 "LocationLoop": [[0, 0, 0], [10000, 0, 0], [10000, 7000, 0], [0, 7000, 0]] }
    },
    {
      "kind": "ceiling", "op": "create", "reason": "Ghost Builder: ceiling on layer A-CLNG",
      "validate": { "identity": { "Class": "IfcCovering", "Name": "A-CLNG #1" } },
      "place": { "TypeName": "600 x 600mm Grid", "LevelName": "Level 1",
                 "Boundary": [[0, 0], [4000, 0], [4000, 7000], [0, 7000]], "Offset": 0 }
    },
    {
      "kind": "door", "op": "create", "reason": "Ghost Builder: door on layer A-DOOR",
      "validate": { "identity": { "Class": "IfcDoor", "Name": "A-DOOR #1" } },
      "place": { "TypeName": "0915 x 2134mm", "LevelName": "Level 1", "FamilyName": "M_Single-Flush", "Location": [6450, 0, 0] }
    },
    {
      "kind": "window", "op": "create", "reason": "Ghost Builder: window on layer A-GLAZ",
      "validate": { "identity": { "Class": "IfcWindow", "Name": "A-GLAZ #1" } },
      "place": { "TypeName": "0915 x 1220mm", "LevelName": "Level 1", "FamilyName": "M_Fixed", "Location": [10000, 3500, 0] }
    },
    {
      "kind": "column", "op": "create", "reason": "Ghost Builder: column on layer A-COLS",
      "validate": { "identity": { "Class": "IfcColumn", "Name": "A-COLS #1" } },
      "place": { "TypeName": "457 x 610mm", "LevelName": "Level 1", "FamilyName": "M_Rectangular Column", "Location": [5000, 3500, 0] }
    },
    {
      "kind": "furniture", "op": "create", "reason": "Ghost Builder: furniture on layer A-FURN",
      "validate": { "identity": { "Class": "IfcFurniture", "Name": "A-FURN #1" } },
      "place": { "TypeName": "1525 x 762mm", "LevelName": "Level 1", "FamilyName": "M_Desk", "Location": [2000, 2000, 0] }
    }
  ]
}
```

- [ ] **Step 8: The bridge keeps every field of it.** Append to `WebApp/bridge/changesets-logic.test.mjs`:

```js

// MA-1a step 2: the body Ghost Builder files (GhostFiling.Body); tools/promote-check writes the same body and reads it back.
describe("ghost-dwg-body parity fixture (MA-1a step 2)", () => {
  const body = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/ghost-dwg-body.json", import.meta.url), "utf8"));
  it("passes validateChangeset as source dwg and keeps every place field — the arc's mid point, columns and furniture", () => {
    const v = validateChangeset(body);
    expect(v).toMatchObject({ name: body.name, source: "dwg" });
    v.elements.forEach((el, i) => {
      const sent = body.elements[i];
      expect(el).toMatchObject({ kind: sent.kind, op: "create", reason: sent.reason, place: sent.place });
      expect(el.validate.identity).toMatchObject(sent.validate.identity);
    });
    expect(v.elements.map((e) => e.kind)).toEqual(["wall", "wall", "floor", "ceiling", "door", "window", "column", "furniture"]);
    expect(v.elements[1].place.LocationCurve.mid).toEqual([1000, 1000, 0]);
  });
});
```

- [ ] **Step 9: ghost-p2-check proves the widened Doctor rule and the executor's rule.** In `tools/ghost-p2-check/Honest.cs`, replace

```csharp
        Ok(GhostFailurePolicy.DoctorSkips("Ghost Builder - LOD 200") && !GhostFailurePolicy.DoctorSkips("Sentinel: Fix") && !GhostFailurePolicy.DoctorSkips(null!),
           "A4: the Doctor skips the Ghost transaction only — it never erases a warning Ghost counts");
```

with

```csharp
        Ok(GhostFailurePolicy.DoctorSkips("Ghost Builder - LOD 200") && !GhostFailurePolicy.DoctorSkips("Sentinel: Fix") && !GhostFailurePolicy.DoctorSkips(null!),
           "A4: the Doctor skips the Ghost transaction — it never erases a warning Ghost counts");
        // MA-1a step 2: a DWG build is changesets now, plus its own types and parameters transactions inside the one Undo.
        Ok(GhostFailurePolicy.DoctorSkips(GhostFailurePolicy.TypesTxName) && GhostFailurePolicy.DoctorSkips(GhostFailurePolicy.ParamsTxName)
           && GhostFailurePolicy.DoctorSkips("Sentinel AI changeset: Ghost Builder · plan · Level 1 [3f2a9c8b]")
           && !GhostFailurePolicy.DoctorSkips("Sentinel — import DWG plan") && !GhostFailurePolicy.DoctorSkips("sentinel ai changeset: x"),
           "step 2: the Doctor also skips a DWG build's types and parameters transactions and every changeset's — and nothing else");
        Ok(GhostFailurePolicy.DecideAllOrNothing(W) == GhostFailurePolicy.Act.Count && GhostFailurePolicy.DecideAllOrNothing(E) == GhostFailurePolicy.Act.RollBack
           && GhostFailurePolicy.DecideAllOrNothing(GhostFailurePolicy.Severity.Corruption) == GhostFailurePolicy.Act.RollBack,
           "step 2: the executor's rule — a warning is counted, any error rolls the whole changeset back (never Resolve, never DeleteOurs)");
        Ok(GhostFailurePolicy.AllOrNothingReason("Can't make Floor.", E) == "Can't make Floor. (a Revit error at commit: the changeset is all or nothing, so none of it was kept)"
           && GhostFailurePolicy.AllOrNothingReason(" ", GhostFailurePolicy.Severity.Corruption) == "a Revit failure (Revit reports document corruption)",
           "step 2: a changeset rolled back at commit says why");
        Ok(GhostFailurePolicy.NotFiledLine("Bridge 403: viewer").StartsWith("Nothing was built — the build could not be filed as a changeset")
           && GhostFailurePolicy.NotFiledLine("Bridge 403: viewer").EndsWith("(no element, type or family was added): Bridge 403: viewer"),
           "step 2: a build that could not be filed reads as nothing built, with the bridge's reason");
```

- [ ] **Step 10: Run the checks.**
  - `dotnet run --project tools/promote-check`: expect `178/178 checks pass` (160 + 18).
  - `dotnet run --project tools/ghost-p2-check`: expect `91/91 checks pass` (87 + 4).
  - `dotnet run --project tools/session-check`: expect `47/47 checks pass` (it compiles the changed `ChangesetClient.cs`).
  - From `WebApp`, `npx vitest run bridge/changesets-logic.test.mjs bridge/mcp-server.test.mjs bridge/changesets-store.test.mjs`: expect `Tests  114 passed (114)`.
  - `npx vitest run bridge/`: expect `Tests  1626 passed | 1 skipped (1627)`.
  - Both add-in builds: `0 Error(s)`; Revit 2024 `6 Warning(s)`, Revit 2026 `3 Warning(s)` (master's).
- [ ] **Step 11: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostFiling.cs SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/GhostBuilder/GhostFailurePolicy.cs SentinelAddin/Engine/UndoWatcher.cs tools/promote-check/Filing.cs tools/promote-check/promote-check.csproj tools/promote-check/Check.cs tools/ghost-p2-check/Honest.cs WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json WebApp/bridge/changesets-logic.test.mjs
git commit -F - <<'EOF'
feat(ghost): the pure filing half — Ghost rows as dwg changeset elements, chunks, local changesets; Doctor skips every changeset; one Undo over many (MA-1a step 2)

GhostFiling turns a reviewed row into exact changeset elements (absolute mm, LevelName always, arc walls with mid, columns
and furniture), chunks of 200 with hosts first, the POST body (fixture parity with the bridge) and an unbound model's local
changeset. DoctorSkips widens to Ghost's types/parameters transactions and every changeset; DecideAllOrNothing is the
executor's commit rule; UndoWatcher holds several changesets per Undo name, one hit each.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3 — The executor: all-or-nothing at commit, the recount, floors, arcs, columns and furniture

**Files:**
- Modify `SentinelAddin/GhostBuilder/GhostFailureHandler.cs` (`:30`, `:52-58`)
- Modify `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` (`:9-10`, `:31-34`, `:74-80`, `:252-254`, `:287-289`, `:370-380`, `:391-397`, `:413-416`, `:476-480`)
- Modify `SentinelAddin/Commands.ReviewChangesets.cs` (`:120-125`, `:252-256`, `:266-267`)

**Interfaces:**
- `GhostFailureHandler.AllOrNothing` (public bool field; false keeps step 1's rule for Massing).
- `ChangesetExecutor.ExecutionResult` gains:
  - `List<AppliedEntry> Gone { get; }`
  - `Dictionary<string, int> Warnings { get; }`
  - `string NotFinished { get; set; }`
- `internal static (List<Wall> Hosts, List<Wall> Odd, List<(string Label, string Level, double X0, double Y0, double X1, double Y1)> Lines) ChangesetExecutor.HostWalls(Document doc)`
- `internal static Wall ChangesetExecutor.OddNear(IEnumerable<Wall> odd, ElementId levelId, double xMm, double yMm)`
- `ReviewChangesetsCommand.Report(...)`: `private` → `internal` (same signature).

- [ ] **Step 1: The handler's all-or-nothing mode.** In `SentinelAddin/GhostBuilder/GhostFailureHandler.cs`, replace

```csharp
        /// <summary>Set when this handler rolled the build back: why, in words.</summary>
        public string RolledBack { get; private set; }
```

with

```csharp
        /// <summary>Set when this handler rolled the build back: why, in words.</summary>
        public string RolledBack { get; private set; }
        /// <summary>MA-1a step 2: the changeset executor's rule (GhostFailurePolicy.DecideAllOrNothing) — any error rolls the
        /// whole changeset back; nothing is resolved or deleted. Warnings are counted the same way. Off for Photo Massing.</summary>
        public bool AllOrNothing;
```

and replace

```csharp
                    var act = GhostFailurePolicy.Decide(severity, f.HasResolutions(), failing, additional, Ours, _resolved.Contains(key));
                    if (act == GhostFailurePolicy.Act.Count)
                    {
                        SeenWarnings.Add((key, text, named)); // counted after the commit; Revit keeps the warning
                        continue;
                    }
                    if (act == GhostFailurePolicy.Act.RollBack)
                        return RollBack(GhostFailurePolicy.RollBackReason(text, severity, named.Where(i => !Ours.Contains(i)).ToList()));
```

with

```csharp
                    var act = AllOrNothing
                        ? GhostFailurePolicy.DecideAllOrNothing(severity)
                        : GhostFailurePolicy.Decide(severity, f.HasResolutions(), failing, additional, Ours, _resolved.Contains(key));
                    if (act == GhostFailurePolicy.Act.Count)
                    {
                        SeenWarnings.Add((key, text, named)); // counted after the commit; Revit keeps the warning
                        continue;
                    }
                    if (act == GhostFailurePolicy.Act.RollBack)
                        return RollBack(AllOrNothing
                            ? GhostFailurePolicy.AllOrNothingReason(text, severity)
                            : GhostFailurePolicy.RollBackReason(text, severity, named.Where(i => !Ours.Contains(i)).ToList()));
```

- [ ] **Step 2: The executor's header and result.** In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
// ceiling; any create but a level or grid may carry a Mark, a floor Structural.
```

with

```csharp
// ceiling; any create but a level or grid may carry a Mark, a floor Structural.
// MA-1a step 2: Ghost Builder's DWG builds run here too (GhostChangesetBuild): a column or furniture create (unhosted on its
// level) and an arc wall (LocationCurve.mid). Commit-time failures go through the all-or-nothing preprocessor (a warning is
// counted and left in the model, any error rolls the changeset back), and what survived the commit is recounted.
```

and replace

```csharp
        /// Nothing was attempted (the model was switched or closed): the changeset stays pending — never reported
        /// as declined, never as applied.
        public bool NotRun { get; set; }
    }
```

with

```csharp
        /// Nothing was attempted (the model was switched or closed): the changeset stays pending — never reported
        /// as declined, never as applied.
        public bool NotRun { get; set; }
        /// MA-1a step 2: applied elements Revit no longer holds after the commit (the recount) — reported as rejected, never as
        /// applied. Empty when every element survived, which all-or-nothing makes the rule.
        public List<AppliedEntry> Gone { get; } = new();
        /// MA-1a step 2: the Revit warnings this changeset raised, counted by text — left in the model, never erased ([BP] P1-3).
        public Dictionary<string, int> Warnings { get; } = new();
        /// A6: Commit returned neither Committed nor RolledBack (Pending, …) — Revit may still finish or drop it, so nothing is
        /// reported and nothing recounted; this is the whole result.
        public string NotFinished { get; set; }
    }
```

- [ ] **Step 3: Floor types are floor types (E10); the host finder is shared (E14).** Replace

```csharp
    private static FloorType ResolveFloorType(Document doc, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var types = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().ToList();
        return types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException($"floor type \"{typeName}\" does not exist in this model — load it (Sentinel creates no types), or re-propose with the exact name of a loaded type");
    }
```

with

```csharp
    // MA-1a step 2: a floor's type among the model's FLOOR types only — a foundation slab type of the same name is another
    // thing (OfClass(FloorType) holds both) — and, as CreateType does, more than one is a person's decision.
    private static FloorType ResolveFloorType(Document doc, string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException(NoTypeName);
        var hits = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>()
            .Where(t => !t.IsFoundationSlab && string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)).ToList();
        if (hits.Count == 0) throw new InvalidOperationException($"floor type \"{typeName}\" does not exist in this model — load it (Sentinel creates no types), or re-propose with the exact name of a loaded type");
        if (hits.Count > 1) throw new InvalidOperationException($"{hits.Count} floor types are named \"{typeName}\" in this model — a person decides");
        return hits[0];
    }

    /// MA-1: the walls a door or window may be hosted by — Basic, not a stacked member, straight — with each one's plan line
    /// (mm) for PlacementGeometry.Host, and every other wall with a location line (one of those near the point is a refusal).
    /// Also Ghost's planner (GhostChangesetBuild), which checks a DWG opening before it is filed.
    internal static (List<Wall> Hosts, List<Wall> Odd, List<(string Label, string Level, double X0, double Y0, double X1, double Y1)> Lines) HostWalls(Document doc)
    {
        var walls = new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>().Where(w => w.Location is LocationCurve).ToList();
        bool Plain(Wall w) => w.WallType.Kind == WallKind.Basic && !w.IsStackedWallMember && ((LocationCurve)w.Location).Curve is Line;
        var hosts = walls.Where(Plain).ToList();
        var lines = hosts.Select(w =>
        {
            var c = ((LocationCurve)w.Location).Curve;
            XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1);
            return ("wall " + w.Id.IdValue(), (doc.GetElement(w.LevelId) as Level)?.Name, a.X / MmToFeet, a.Y / MmToFeet, b.X / MmToFeet, b.Y / MmToFeet);
        }).ToList();
        return (hosts, walls.Where(w => !Plain(w)).ToList(), lines);
    }

    /// A wall of <paramref name="odd"/> on the level whose location curve passes within HostTolMm of (x, y) mm, or null.
    internal static Wall OddNear(IEnumerable<Wall> odd, ElementId levelId, double xMm, double yMm) => odd.FirstOrDefault(w =>
    {
        var c = ((LocationCurve)w.Location).Curve;
        return w.LevelId.Equals(levelId)
               && c.Distance(new XYZ(xMm * MmToFeet, yMm * MmToFeet, c.GetEndPoint(0).Z)) <= PlacementGeometry.HostTolMm * MmToFeet;
    });
```

- [ ] **Step 4: The commit goes through the all-or-nothing preprocessor (E2).** Replace

```csharp
        using var t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id)); // the undo watcher finds it by this name
        t.Start();
        try
```

with

```csharp
        using var t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id)); // the undo watcher finds it by this name
        t.Start();
        // MA-1a step 2: Revit's commit-time failures go through the all-or-nothing rule — a warning is counted and left in the
        // model, any error rolls the whole changeset back (never Revit's modal dialog, never a person's "Delete Element(s)"
        // half-commit). Non-modal: the warnings Revit keeps are shown the ordinary, dismissable way. The global Doctor skips
        // this transaction (GhostFailurePolicy.DoctorSkips).
        var handler = new GhostFailureHandler { AllOrNothing = true };
        var fho = t.GetFailureHandlingOptions();
        fho.SetFailuresPreprocessor(handler);
        fho.SetClearAfterRollback(true);
        fho.SetForcedModalHandling(false);
        t.SetFailureHandlingOptions(fho);
        try
```

- [ ] **Step 5: Arc walls (E7).** Replace

```csharp
                var heightFt = (topMm - baseMm) * MmToFeet;
                var offsetFt = baseMm * MmToFeet - level.Elevation;
                var wall = Wall.Create(doc, Line.CreateBound(Pt(c.Start), Pt(c.End)), wt.Id, level.Id, heightFt, offsetFt, false, false);
```

with

```csharp
                var heightFt = (topMm - baseMm) * MmToFeet;
                var offsetFt = baseMm * MmToFeet - level.Elevation;
                // MA-1a step 2: a curved DWG wall carries a point on its arc (LocationCurve.mid).
                var curve = c.Mid != null ? (Curve)Arc.Create(Pt(c.Start), Pt(c.End), Pt(c.Mid)) : Line.CreateBound(Pt(c.Start), Pt(c.End));
                var wall = Wall.Create(doc, curve, wt.Id, level.Id, heightFt, offsetFt, false, false);
```

- [ ] **Step 6: The openings use the shared finder.** Replace

```csharp
                doc.Regenerate();
                var walls = new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>().Where(w => w.Location is LocationCurve).ToList();
                bool Plain(Wall w) => w.WallType.Kind == WallKind.Basic && !w.IsStackedWallMember && ((LocationCurve)w.Location).Curve is Line;
                var hosts = walls.Where(Plain).ToList();
                var odd = walls.Where(w => !Plain(w)).ToList();
                var lines = hosts.Select(w =>
                {
                    var c = ((LocationCurve)w.Location).Curve;
                    XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1);
                    return ("wall " + w.Id.IdValue(), (doc.GetElement(w.LevelId) as Level)?.Name, a.X / MmToFeet, a.Y / MmToFeet, b.X / MmToFeet, b.Y / MmToFeet);
                }).ToList();
                foreach (var el in openings)
```

with

```csharp
                doc.Regenerate();
                var (hosts, odd, lines) = HostWalls(doc);
                foreach (var el in openings)
```

and replace

```csharp
                    var near = odd.FirstOrDefault(w =>
                    {
                        var c = ((LocationCurve)w.Location).Curve;
                        return w.LevelId.Equals(level.Id)
                               && c.Distance(new XYZ(p[0] * MmToFeet, p[1] * MmToFeet, c.GetEndPoint(0).Z)) <= PlacementGeometry.HostTolMm * MmToFeet;
                    });
                    if (near != null)
```

with

```csharp
                    var near = OddNear(odd, level.Id, p[0], p[1]);
                    if (near != null)
```

- [ ] **Step 7: Columns and furniture (F6).** Replace

```csharp
                    SetMark(fi, el);
                    Collect(result, el, fi);
                }
            }

            // MA-0: retype before attach.
```

with

```csharp
                    SetMark(fi, el);
                    Collect(result, el, fi);
                }
            }

            // MA-1a step 2: a column or furniture stands unhosted on its level at its point (Ghost Builder's point families): the
            // one loaded (family, type) it names, activated inside this transaction, z = the level's elevation.
            foreach (var el in toPlace.Where(e => IsCreate(e) && e.Kind is "column" or "furniture"))
            {
                at = Label(el);
                var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
                var level = ResolveLevel(doc, el.Place);
                var p = el.Place.Location ?? throw new InvalidOperationException($"{el.Kind} \"{name}\" has no Location");
                if (Math.Abs(p[2] * MmToFeet - level.Elevation) > TolFt)
                    throw new InvalidOperationException($"{el.Kind} \"{name}\": Location z {Mm(p[2])} mm is not {level.Name}'s elevation {Mm(level.Elevation / MmToFeet)} mm — a {el.Kind} stands on its level");
                var sym = (FamilySymbol)CreateType(doc, el.Kind == "column" ? BuiltInCategory.OST_Columns : BuiltInCategory.OST_Furniture,
                                                   el.Kind, el.Place.FamilyName, el.Place.TypeName);
                if (!sym.IsActive) { sym.Activate(); doc.Regenerate(); }
                var fi = doc.Create.NewFamilyInstance(Pt(p), sym, level, StructuralType.NonStructural);
                SetMark(fi, el);
                Collect(result, el, fi);
            }

            // MA-0: retype before attach.
```

- [ ] **Step 8: The commit check, Pending, and the recount (E3).** Replace

```csharp
            // Revit's failure resolution can roll a transaction back WITHOUT throwing — reporting
            // the collected ids then would be the "some failed silently" lie this file forbids.
            if (t.Commit() != TransactionStatus.Committed)
                return new ExecutionResult { Error = "Revit did not commit the transaction (failure resolution rolled it back)" };
            return result;
```

with

```csharp
            // Revit's failure resolution can roll a transaction back WITHOUT throwing — reporting
            // the collected ids then would be the "some failed silently" lie this file forbids.
            var status = t.Commit();
            if (status == TransactionStatus.RolledBack)
                return new ExecutionResult { Error = "Revit did not commit the transaction (failure resolution rolled it back)" + (handler.RolledBack != null ? ": " + handler.RolledBack : "") };
            // A6: Pending (or any other status) — Revit may still finish or drop it: nothing is reported, nothing recounted.
            if (status != TransactionStatus.Committed)
                return new ExecutionResult { NotFinished = GhostFailurePolicy.NotFinishedLine(status.ToString()) };
            // MA-1a step 2: the recount — an element Revit no longer holds after the commit is reported as rejected, never
            // as applied; a warning that named it went with it. The rest are counted, left in the model, never erased.
            var gone = new HashSet<long>();
            foreach (var a in result.Applied.Where(a => doc.GetElement(a.RevitUniqueId) == null).ToList())
            {
                result.Applied.Remove(a);
                result.Gone.Add(a);
                gone.Add(a.RevitElementId);
            }
            foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) result.Warnings[kv.Key] = kv.Value;
            return result;
```

- [ ] **Step 9: Review AI Proposals reports what the executor now knows.** In `SentinelAddin/Commands.ReviewChangesets.cs`, make three replacements. First, replace

```csharp
                if (result.NotRun)
                {
                    TaskDialog.Show("Sentinel — AI proposals", result.Error + "\n\nThe proposals are still pending — run Review AI Proposals again on that model.");
                    return;
                }
```

with

```csharp
                if (result.NotRun)
                {
                    TaskDialog.Show("Sentinel — AI proposals", result.Error + "\n\nThe proposals are still pending — run Review AI Proposals again on that model.");
                    return;
                }
                if (result.NotFinished != null)
                {
                    // A6: Revit may still finish or drop the transaction — reporting either way could be a lie.
                    TaskDialog.Show("Sentinel — AI proposals", result.NotFinished +
                        "\n\nNothing was reported: the changeset stays proposed. Check the model before reviewing it again — a second Apply could duplicate what Revit finishes.");
                    return;
                }
```

Second, replace

```csharp
                // Only a result the bridge holds is watched: an Undo then posts changeset_reverted for these guids.
                if (Report(cfg, key, cs.Id, result.Applied, unticked, note))
                    UndoWatcher.Remember(UndoWatcher.TxName(fresh.Name, fresh.Id), key, fresh.Id, result.Applied.Select(a => a.ProposalGuid));
                TaskDialog.Show("Sentinel — AI proposals",
                    $"Applied {result.Applied.Count} element(s) from \"{cs.Name}\"." + (unticked.Count > 0 ? $"\n{unticked.Count} unticked element(s) reported as rejected." : ""));
```

with

```csharp
                // MA-1a step 2: an element Revit removed at commit is reported as rejected, with the reason in the note.
                var gone = result.Gone.Select(a => a.ProposalGuid).ToList();
                var rejected = unticked.Concat(gone).Distinct().ToList();
                var said = gone.Count == 0 ? note : $"{gone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
                // Only a result the bridge holds is watched: an Undo then posts changeset_reverted for these guids.
                if (Report(cfg, key, cs.Id, result.Applied, rejected, said))
                    UndoWatcher.Remember(UndoWatcher.TxName(fresh.Name, fresh.Id), key, fresh.Id, result.Applied.Select(a => a.ProposalGuid));
                var warnings = GhostFailurePolicy.WarningsLine(result.Warnings);
                TaskDialog.Show("Sentinel — AI proposals",
                    $"Applied {result.Applied.Count} element(s) from \"{cs.Name}\"." + (unticked.Count > 0 ? $"\n{unticked.Count} unticked element(s) reported as rejected." : "") +
                    (gone.Count > 0 ? $"\n{gone.Count} element(s) removed by Revit at commit — reported as rejected." : "") +
                    (warnings != null ? "\n\n" + warnings : ""));
```

Third, replace

```csharp
    /// <summary>True when the bridge recorded the result.</summary>
    private static bool Report(
```

with

```csharp
    /// <summary>True when the bridge recorded the result. Also Ghost Builder's (GhostChangesetBuild), with the same retry
    /// dialog.</summary>
    internal static bool Report(
```

- [ ] **Step 10: Build and check.** Both builds: `0 Error(s)`; Revit 2024 `6 Warning(s)`, Revit 2026 `3 Warning(s)`. The 2024 `CS0618` at `ChangesetExecutor.Collect` (`IntegerValue`) is master's. `promote-check` still reads `178/178`, and `ghost-p2-check` `91/91`. There is no new offline check: the executor is Revit-bound, and its decisions (`DecideAllOrNothing`, `CountWarnings`) are checked in Task 2 and step 1. Drill rows S2-1, S2-4 and S2-5 prove the wiring.
- [ ] **Step 11: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostFailureHandler.cs SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/Commands.ReviewChangesets.cs
git commit -F - <<'EOF'
feat(executor): all-or-nothing failure preprocessor, survivor recount, warnings counted; floor types only; arc walls; column and furniture creates (MA-1a step 2)

Every changeset commit now goes through GhostFailureHandler in all-or-nothing mode (warnings counted and kept, any error
rolls back, non-modal), Pending is never reported, and an element gone after the commit is reported rejected. A floor type
is never a foundation slab and never ambiguous. Arc walls (LocationCurve.mid); unhosted column and furniture creates. The
host finder is shared for Ghost's planner. Review AI Proposals shows the warnings and reports the gone as rejected.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4 — Ghost Builder files changesets; its own DWG placement path is deleted

**Files:**
- Create `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`
- Replace `SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs`
- Modify `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` (`:18-19`, `:34-37`, `:79-139`)
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (`:341-344`)
- Modify `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` (`:143`, `:352`, `:472`, `:550`)
- Modify `SentinelAddin/GhostBuilder/GhostFloorTypeProvisioner.cs` (`:41`), `SentinelAddin/GhostBuilder/GhostTypeCreator.cs` (`:86`)
- Modify `SentinelAddin/Commands.GhostBuilder.cs` (`:31-32`, `:165`, `:231-237`, `:346-348`, `:361`, `:409-437`)

**Interfaces:**
- `public static class GhostChangesetBuild`, with:
  - `public sealed class Request { Document Doc; List<GhostElement> Elements; MappingResult Mapping; long LevelId = -1; GuidelineMatcher Guideline; string LibraryDir; string Key = ""; string Drawing; }`
  - `public static GhostPlacementEngine.PlacementReport Run(UIApplication app, Request r)`: API thread only.
- `GhostBuilderPlacementEvent.SetRequest(GhostChangesetBuild.Request request)`, which replaces `SetRequest(orchestrator, inputs, mapping, levelId)`.
- `GhostPlacementEngine.PlacementReport` gains `string NotBuilt`, `string Ledger`, `int SkippedNoHost` and `int Stamped`.
- `ElementPlacementFactory.ResolveWallType`, `Centroid`, `ApplyParams` and `TryBuildClosedLoop` change from `private` to `internal`; their bodies are unchanged.
- Deleted: `GhostBuilderOrchestrator.Place(Inputs, MappingResult, Level)` and `Place(Inputs, MappingResult, long)`.

- [ ] **Step 1: The factory's typing and helpers are shared (E11).** In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs`, change only the access modifier on these four lines (the bodies stay):
  - `        private string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason, out string typedBy)` becomes `        internal string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason, out string typedBy)`
  - `        private static XYZ Centroid(IList<Curve> loop)` becomes `        internal static XYZ Centroid(IList<Curve> loop)`
  - `        private void ApplyParams(Element e, LayerMapping map)` becomes `        internal void ApplyParams(Element e, LayerMapping map)`
  - `        private static bool TryBuildClosedLoop(GhostElement el, out CurveLoop loop)` becomes `        internal static bool TryBuildClosedLoop(GhostElement el, out CurveLoop loop)`
- [ ] **Step 2: Floor provisioning ignores foundation slabs (E10).** Make two one-line replacements:
  - In `SentinelAddin/GhostBuilder/GhostFloorTypeProvisioner.cs`, replace `                new FilteredElementCollector(_doc).OfClass(typeof(FloorType)).Cast<FloorType>().Select(f => f.Name),` with `                new FilteredElementCollector(_doc).OfClass(typeof(FloorType)).Cast<FloorType>().Where(f => !f.IsFoundationSlab).Select(f => f.Name),`
  - In `SentinelAddin/GhostBuilder/GhostTypeCreator.cs` (`CreateFloorType`), replace `            var floors = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().ToList();` with `            var floors = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().Where(f => !f.IsFoundationSlab).ToList();`
- [ ] **Step 3: The report says what a changeset build did.** In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, replace

```csharp
            /// <summary>A6: set when Commit returned neither Committed nor RolledBack (Pending, …) — the whole report
            /// (GhostFailurePolicy.NotFinishedLine). Nothing was recounted, and nothing else here is true.</summary>
            public string NotFinished;
        }
```

with

```csharp
            /// <summary>A6: set when Commit returned neither Committed nor RolledBack (Pending, …) — the whole report
            /// (GhostFailurePolicy.NotFinishedLine). Nothing was recounted, and nothing else here is true.</summary>
            public string NotFinished;
            /// <summary>MA-1a step 2 (DWG): the whole line when nothing was built — not filed, rolled back, refused or nothing to
            /// build. Placed and the type lines are then untrue; Warnings still name every row that gave no element.</summary>
            public string NotBuilt;
            /// <summary>MA-1a step 2 (DWG): which changesets carry the build on the project's ledger, or why none does.</summary>
            public string Ledger;
            /// <summary>MA-1a step 2 (DWG): doors and windows not filed because no single straight wall lies under the point.</summary>
            public int SkippedNoHost;
            /// <summary>MA-1a step 2 (DWG): placed elements whose provenance stamp reads source dwg after the build.</summary>
            public int Stamped;
        }
```

- [ ] **Step 4: Create `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`**

```csharp
#nullable disable
// MA-1a step 2 (design §2.4 step 2, §7.2 MA-1 (1a) item 2): Ghost Builder places through ChangesetExecutor — one placement
// path, one ledger row format, one provenance stamp, one undo watcher. Build plans the reviewed rows into changeset elements
// with exact names (GhostFiling), files them as changesets with source "dwg" (a model not bound to a web project runs the
// same executor on a local changeset, with no ledger), and runs them. Everything happens inside ONE TransactionGroup,
// assimilated into one Undo entry named as the first changeset's transaction, so the undo watcher posts changeset_reverted:
//   1. "Ghost Builder - types": the families and types the rows need — the preloader, the wall and floor provisioners and
//      the guideline's sizes cloned at the measured thickness (Ghost's own type stage; the executor creates none);
//   2. each changeset's executor transaction — all or nothing, the commit checked, every element stamped;
//   3. "Ghost Builder - parameters": the values the project's documents gave each layer (P2; A7: a type only if this
//      build added it).
// Before filing, the plan turns into named gaps whatever the executor would refuse by rule (a missing or ambiguous type, a
// placeholder name, a door with no single straight wall under it, a family of the wrong kind, a run too short to be a wall),
// so one bad row is not a whole-build decline. Whatever Revit itself refuses still rolls the whole group back: nothing is
// left — no element, no type, no family. API thread only (GhostBuilderPlacementEvent).
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Commands;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public static class GhostChangesetBuild
    {
        public sealed class Request
        {
            public Document Doc;
            public List<GhostElement> Elements;
            /// <summary>The ticked rows, as the review emitted them (copies with the reviewer's picks).</summary>
            public MappingResult Mapping;
            /// <summary>The review's level; -1 or a level no longer in the model = the lowest level, said in the summary.</summary>
            public long LevelId = -1;
            public GuidelineMatcher Guideline;
            /// <summary>The Ghost family library, or null (no preload).</summary>
            public string LibraryDir;
            /// <summary>The web project's key; "" = not bound — the executor runs a local changeset and nothing is filed.</summary>
            public string Key = "";
            /// <summary>The drawing's name, for the changeset names.</summary>
            public string Drawing;
        }

        private const double FtToMm = 304.8;

        // One planned element: its changeset element, the reviewed row it came from, and what it is in words.
        private sealed class Planned
        {
            public ChangesetElementDto Dto;
            public LayerMapping Map;
            public string What;
        }

        public static GhostPlacementEngine.PlacementReport Run(UIApplication app, Request r)
        {
            var report = new GhostPlacementEngine.PlacementReport();
            var doc = r.Doc;
            if (DocPin.Check(app, doc, "build from the drawing") is { } refusal) { report.NotBuilt = refusal; return report; }
            var rows = (r.Mapping?.Mappings ?? new List<LayerMapping>())
                .Where(m => m != null && !m.Ignore && !string.IsNullOrWhiteSpace(m.CadLayer)).ToList();
            if (rows.Count == 0) { report.NotBuilt = "Nothing was built — no layer was ticked."; return report; }
            var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().OrderBy(l => l.Elevation).ToList();
            if (levels.Count == 0) { report.NotBuilt = "Nothing was built — the model has no level."; return report; }
            var level = r.LevelId >= 0 ? doc.GetElement(r.LevelId.ToElementId()) as Level : null;
            if (level == null)
            {
                if (r.LevelId >= 0) report.Warnings.Add($"Chosen level no longer exists — built on {levels[0].Name} instead.");
                level = levels[0];
            }

            var mapping = new MappingResult { Mappings = rows };
            var byLayer = rows.GroupBy(m => m.CadLayer, StringComparer.OrdinalIgnoreCase)
                              .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase); // the first row wins, as before
            // The drawn faces of each wall become one centreline with its measured thickness (unchanged from the old Build).
            var elements = GhostWallPairer.PairWalls(r.Elements, mapping);
            bool bound = !string.IsNullOrEmpty(r.Key);
            var cfg = bound ? BcfConfig.Load() : null;
            var filed = new List<ChangesetDto>();
            bool executing = false, done = false;
            double tolFt = doc.Application.ShortCurveTolerance, levelMm = level.Elevation * FtToMm;
            const string localLedger = "Ledger: none — this model is not bound to a web project (Project Setup binds it); the build ran " +
                                       "through the changeset executor as a local changeset (source dwg, stamped), as one Undo step.";
            const string noLedger = "Ledger: none — this model is not bound to a web project; nothing was filed.";

            using var group = new TransactionGroup(doc, "Ghost Builder");
            group.Start();

            // Nothing ran yet: roll the group back (the types too) and withdraw what was filed — no changeset is left for a
            // later review to apply.
            GhostPlacementEngine.PlacementReport Abandon(string line)
            {
                if (group.HasStarted() && !group.HasEnded()) group.RollBack();
                var kept = new List<string>();
                if (bound) foreach (var cs in filed) if (!ChangesetClient.Withdraw(cfg, r.Key, cs.Id, out _)) kept.Add(Short(cs.Id));
                report.NotBuilt = line;
                report.Ledger = kept.Count > 0
                    ? $"Ledger: changeset(s) {string.Join(", ", kept)} were filed and could not be withdrawn — withdraw them on the web before anyone reviews them."
                    : bound && filed.Count > 0 ? $"Ledger: the {filed.Count} changeset(s) already filed were withdrawn." : null;
                return report;
            }

            // A changeset failed in Revit: the whole build is rolled back, and every filed changeset is reported declined.
            GhostPlacementEngine.PlacementReport Decline(ChangesetDto failing, string error)
            {
                if (group.HasStarted() && !group.HasEnded()) group.RollBack();
                if (bound)
                    foreach (var cs in filed)
                        ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, new List<AppliedEntry>(), cs.Elements.Select(e => e.ProposalGuid).ToList(),
                            cs == failing ? $"Revit transaction failed — rolled back: {error}"
                                          : $"not applied — the Ghost build is all or nothing and {(failing == null ? "it" : "changeset " + Short(failing.Id))} failed: {error}");
                report.NotBuilt = GhostFailurePolicy.NotBuiltLine(error);
                report.Ledger = bound ? $"Ledger: {filed.Count} changeset(s) reported as declined, with the reason." : noLedger;
                return report;
            }

            try
            {
                // ── 1. The families and types the reviewed rows need, before anything is filed (founder decision F4) ──────────
                var typesBefore = new HashSet<long>(new FilteredElementCollector(doc).WhereElementIsElementType().ToElementIds().Select(i => i.IdValue()));
                var walls = new List<(GhostElement El, LayerMapping Map, string Type, string TypedBy)>();
                var basic = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                bool IsBasic(string n)
                {
                    if (n == null) return false;
                    if (basic.Contains(n)) return true;
                    bool ok = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
                        .Any(w => w.Kind == WallKind.Basic && string.Equals(w.Name, n, StringComparison.OrdinalIgnoreCase));
                    if (ok) basic.Add(n);
                    return ok;
                }
                using (var t = new Transaction(doc, GhostFailurePolicy.TypesTxName))
                {
                    t.Start();
                    if (r.LibraryDir != null)
                    {
                        var pre = new GhostFamilyPreloader(doc, r.LibraryDir).Preload(mapping);
                        if (pre.Loaded > 0) doc.Regenerate();
                        report.Warnings.AddRange(pre.Warnings);
                        report.CreatedTypes.AddRange(pre.LoadedNames.Select(n => $"family {n} (loaded from the Ghost family library)"));
                    }
                    var wallProv = new GhostWallTypeProvisioner(doc, r.Guideline).Provision(mapping);
                    if (wallProv.Created > 0) doc.Regenerate();
                    var floorProv = new GhostFloorTypeProvisioner(doc, r.Guideline).Provision(mapping);
                    if (floorProv.Created > 0) doc.Regenerate();
                    report.TypeGaps = wallProv.Gaps + floorProv.Gaps;
                    report.Warnings.AddRange(wallProv.Warnings);
                    report.Warnings.AddRange(floorProv.Warnings);
                    report.CreatedTypes.AddRange(wallProv.CreatedNames.Select(n => $"{n} (wall type the layer mapping names)"));
                    report.CreatedTypes.AddRange(floorProv.CreatedNames.Select(n => $"{n} (floor type the layer mapping names)"));

                    // Each wall's type: the reviewer's pick, else the guideline at the measured thickness (a size the model lacks
                    // is cloned here from its catalogue sibling), else the mapping — ElementPlacementFactory's rule, unchanged.
                    var typer = new ElementPlacementFactory(doc, level, WallTypes(doc), guideline: r.Guideline);
                    foreach (var el in elements)
                    {
                        if (!byLayer.TryGetValue(el.CadLayer ?? "", out var map) || !string.Equals(map.Category, "Walls", StringComparison.OrdinalIgnoreCase)) continue;
                        string type = typer.ResolveWallType(el, map, out string gap, out string typedBy);
                        if (gap == null && !IsBasic(type))
                            gap = type == null ? "the layer mapping names no wall type"
                                : $"WallType '{type}' is not a basic wall type in this model{GhostFiling.SyntheticHint(type)}";
                        if (gap != null)
                        {
                            report.WallGaps++;
                            report.SkippedUnknownFamily++;
                            report.Warnings.Add($"Wall on '{el.CadLayer}': {gap.TrimEnd('.')}; skipped.");
                            continue;
                        }
                        walls.Add((el, map, type, typedBy));
                    }
                    report.CreatedTypes.AddRange(typer.CreatedTypes);
                    report.Warnings.AddRange(typer.Notes);
                    if (t.Commit() != TransactionStatus.Committed)
                        return Abandon(GhostFailurePolicy.NotBuiltLine("Revit did not commit the types and families this build needs"));
                }

                // ── 2. What each reviewed element becomes — reads only; a refusal by rule is a named gap, never a filing ──────
                var plan = new List<Planned>();
                var straight = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>(); // this build's straight walls (mm)
                var arcs = new List<Curve>();                                                                         // this build's curved walls (ft)
                var seq = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                int Next(string layer) => seq[layer] = seq.TryGetValue(layer, out int k) ? k + 1 : 1;

                foreach (var (el, map, type, typedBy) in walls)
                {
                    var (baseMm, topMm) = GhostFiling.WallElevations(levelMm, el.BaseElevation, el.TopElevation, tolFt);
                    var runs = el.LocationCurve != null && el.LocationCurve.IsBound ? new List<Curve> { el.LocationCurve }
                             : (el.LocationLoop ?? new List<Curve>()).Where(c => c != null && c.IsBound).ToList();
                    int filedRuns = 0;
                    foreach (var c in runs)
                    {
                        if (!(c is Line) && !(c is Arc)) continue;
                        XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1), m = c is Arc ? c.Evaluate(0.5, true) : null;
                        var run = GhostFiling.Run(new[] { a.X * FtToMm, a.Y * FtToMm }, new[] { b.X * FtToMm, b.Y * FtToMm },
                                                  m == null ? null : new[] { m.X * FtToMm, m.Y * FtToMm }, baseMm, tolFt * FtToMm);
                        if (run == null) continue;
                        int n = Next(el.CadLayer);
                        plan.Add(new Planned { Map = map, What = $"Walls on '{el.CadLayer}'", Dto = GhostFiling.Wall(el.CadLayer, n, typedBy, type, level.Name, run, baseMm, topMm) });
                        if (m == null) straight.Add(($"{el.CadLayer} #{n} (this build)", level.Name, run.Start[0], run.Start[1], run.End[0], run.End[1]));
                        else arcs.Add(c);
                        filedRuns++;
                        if (typedBy == "guideline") report.WallsByGuideline++;
                        else if (typedBy == "reviewer") report.WallsByReviewer++;
                        else report.WallsByMapping++;
                    }
                    if (filedRuns == 0) report.SkippedNoGeometry++;
                }

                var symbols = new Dictionary<string, List<FamilySymbol>>(StringComparer.OrdinalIgnoreCase);
                List<FamilySymbol> Symbols(string category)
                {
                    if (symbols.TryGetValue(category, out var s)) return s;
                    var bic = Compat.ResolveCategoryKey(category);
                    return symbols[category] = bic == BuiltInCategory.INVALID ? new List<FamilySymbol>()
                        : new FilteredElementCollector(doc).OfCategory(bic).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>().ToList();
                }
                // The executor's own host rule, checked before filing: the one straight basic wall under the point — the model's
                // and this build's — and no curved, curtain or stacked wall passing it.
                var (_, odd, docLines) = ChangesetExecutor.HostWalls(doc);
                var hostLines = docLines.Concat(straight).ToList();
                string HostProblem(double x, double y)
                {
                    var near = ChangesetExecutor.OddNear(odd, level.Id, x, y);
                    if (near != null) return $"a curved, curtain or stacked wall (wall {near.Id.IdValue()}) passes the point — Sentinel hosts a door or window in one straight basic wall only";
                    if (arcs.Any(c => c.Distance(new XYZ(x / FtToMm, y / FtToMm, c.GetEndPoint(0).Z)) <= PlacementGeometry.HostTolMm / FtToMm))
                        return "a curved wall of this build passes the point — Sentinel hosts a door or window in one straight basic wall only";
                    return PlacementGeometry.Host(hostLines, level.Name, x, y, out string why) < 0 ? why : null;
                }

                foreach (var el in elements)
                {
                    if (!byLayer.TryGetValue(el.CadLayer ?? "", out var map)) continue; // a layer nobody ticked
                    if (string.Equals(map.Category, "Walls", StringComparison.OrdinalIgnoreCase)) continue; // planned above
                    if (!GhostFiling.Kinds.TryGetValue(map.Category ?? "", out var k))
                    {
                        report.Warnings.Add($"Category '{map.Category}' (layer '{el.CadLayer}') not handled at LOD 200; skipped.");
                        continue;
                    }
                    string what = $"{map.Category} on '{el.CadLayer}'";
                    if (k.Kind == "floor" || k.Kind == "ceiling")
                    {
                        string slab = k.Kind == "floor" ? "Floor" : "Ceiling";
#if !REVIT2022_OR_GREATER
                        if (k.Kind == "ceiling")
                        {
                            report.Warnings.Add($"Ceiling creation is not supported by the Revit 2021 API (layer '{el.CadLayer}'); skipped.");
                            continue;
                        }
#endif
                        if (!ElementPlacementFactory.TryBuildClosedLoop(el, out CurveLoop loop))
                        {
                            report.SkippedNoGeometry++;
                            report.Warnings.Add($"{slab} on layer '{el.CadLayer}' skipped: its CAD geometry is not a closed polyline, so no boundary loop could be formed.");
                            continue;
                        }
                        string name = map.BdsFamilyType ?? map.BdsFamily;
                        string why = k.Kind == "floor" ? FloorTypeProblem(doc, name) : CeilingTypeProblem(doc, name);
                        if (why != null)
                        {
                            report.SkippedUnknownFamily++;
                            report.Warnings.Add($"{slab} on '{el.CadLayer}': {why}{GhostFiling.SyntheticHint(name)}; skipped.");
                            continue;
                        }
                        var corners = loop.Select(c => c.GetEndPoint(0)).ToList();
                        if (k.Kind == "floor")
                            plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Floor(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm, p.Z * FtToMm }).ToList()) });
                        else
                        {
                            double offsetMm = corners[0].Z * FtToMm; // F7: the drawing's height above the build level
                            plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Ceiling(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm }).ToList(), offsetMm) });
                            report.Warnings.Add($"Ceilings on '{el.CadLayer}' are placed {offsetMm:0} mm above {level.Name}, the drawing's height (founder decision F7) — set the ceiling height where the drawing gives none.");
                        }
                        continue;
                    }

                    // A door, window, column or furniture: the block's insertion point, or a drawn outline's centroid.
                    XYZ pt = el.LocationPoint ?? ElementPlacementFactory.Centroid(el.LocationLoop);
                    if (pt == null) { report.SkippedNoGeometry++; continue; }
                    var syms = Symbols(map.Category);
                    int i = GhostTypePick.Pick(syms.Select(s => (s.FamilyName, s.Name)).ToList(), map.Category, map.BdsFamily, map.BdsFamilyType, out string pickWhy);
                    if (i < 0)
                    {
                        report.SkippedUnknownFamily++;
                        report.Warnings.Add($"{what}: {pickWhy}{GhostFiling.SyntheticHint(map.BdsFamily)}; skipped.");
                        continue;
                    }
                    var sym = syms[i];
                    bool hosted = k.Kind == "door" || k.Kind == "window";
                    var placement = sym.Family.FamilyPlacementType;
                    // E12: a door or window sits in the wall under it; furniture stands on its level; a column stands on its
                    // level too, and Revit's column families are two-level based (base and top level).
                    bool fits = hosted ? placement == FamilyPlacementType.OneLevelBasedHosted
                              : placement == FamilyPlacementType.OneLevelBased || (k.Kind == "column" && placement == FamilyPlacementType.TwoLevelsBased);
                    if (!fits)
                    {
                        report.SkippedUnknownFamily++;
                        report.Warnings.Add($"{what}: \"{sym.FamilyName} : {sym.Name}\" is a {placement} family — Sentinel places a {k.Kind} " +
                                            (hosted ? "in the one wall under its point" : "unhosted on its level") + "; pick another type in the review; skipped.");
                        continue;
                    }
                    double x = pt.X * FtToMm, y = pt.Y * FtToMm;
                    if (hosted && HostProblem(x, y) is string hostWhy)
                    {
                        report.SkippedNoHost++;
                        report.Warnings.Add($"{what}: {hostWhy} — not filed (snapping DWG door blocks onto walls is GHB-1, MA-1b).");
                        continue;
                    }
                    plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Point(k.Kind, el.CadLayer, Next(el.CadLayer), sym.FamilyName, sym.Name, level.Name, x, y, levelMm) });
                }

                if (plan.Count == 0)
                    return Abandon("Nothing was built — no ticked row gave an element Sentinel can place (each reason is listed below); the types step was rolled back too.");

                // ── 3. File: changesets of at most 200, hosts first (unbound: local changesets, no ledger) ───────────────────
                var chunks = GhostFiling.Chunks(plan.Select(p => p.Dto).ToList());
                var byDto = plan.ToDictionary(p => p.Dto); // reference identity: the bridge answers element by element, in order
                for (int c = 0; c < chunks.Count; c++)
                {
                    string name = GhostFiling.Name(r.Drawing, level.Name, c, chunks.Count);
                    if (!bound) { filed.Add(GhostFiling.Local(name, chunks[c])); continue; }
                    var cs = ChangesetClient.Propose(cfg, r.Key, GhostFiling.Body(name, UserSession.Actor, chunks[c]), out string err);
                    if (cs == null || cs.Elements.Count != chunks[c].Count)
                    {
                        if (cs != null) filed.Add(cs); // filed, but not as sent: withdraw it with the rest
                        bool signIn = err != null && (err.StartsWith("Bridge 401") || err.StartsWith("Bridge 403"));
                        return Abandon(GhostFailurePolicy.NotFiledLine((err ?? "the bridge answered with a different number of elements") +
                                                                        (signIn ? " — sign in (Standards ▸ Sign in) as a contributor on this project" : "")));
                    }
                    filed.Add(cs);
                }
                var planOf = new Dictionary<string, Planned>(StringComparer.Ordinal);
                for (int c = 0; c < filed.Count; c++)
                    for (int j = 0; j < chunks[c].Count; j++) planOf[filed[c].Elements[j].ProposalGuid] = byDto[chunks[c][j]];
                int idsRejected = filed.Sum(cs => cs.Elements.Count(e => e.Verdict?.Status == "rejected"));

                // ── 4. Run: each changeset through the executor, in order; any failure declines the whole build ──────────────
                executing = true;
                var results = new List<ChangesetExecutor.ExecutionResult>();
                foreach (var cs in filed)
                {
                    var res = new ChangesetExecutor().Execute(doc, cs, new HashSet<string>(cs.Elements.Select(e => e.ProposalGuid)));
                    // ponytail: Pending inside the group — nothing is reported, and the group is disposed unfinished; the
                    // executor's all-or-nothing preprocessor answers every error, so Revit should never leave one pending.
                    if (res.NotFinished != null)
                    {
                        report.NotBuilt = res.NotFinished;
                        report.Ledger = bound ? $"Ledger: {filed.Count} changeset(s) left proposed and unreported — check the model, then withdraw them on the web." : noLedger;
                        return report;
                    }
                    if (res.Error != null) return Decline(cs, res.Error);
                    results.Add(res);
                }

                // ── 5. The documents' values on what was placed (P2, A7), inside the same Undo ─────────────────────────────────
                var applied = results.SelectMany(x => x.Applied).ToList();
                var placed = applied.Select(a => (a, e: doc.GetElement(a.RevitUniqueId))).Where(x => x.e != null).ToList();
                if (placed.Any(x => planOf[x.a.ProposalGuid].Map.Params?.Count > 0))
                    using (var t = new Transaction(doc, GhostFailurePolicy.ParamsTxName))
                    {
                        t.Start();
                        var writer = new ElementPlacementFactory(doc, level, null) { TypesBefore = typesBefore };
                        foreach (var (a, e) in placed) writer.NewElements.Add((e.Id, planOf[a.ProposalGuid].What)); // A7: this build's own instances
                        foreach (var (a, e) in placed)
                            if (planOf[a.ProposalGuid].Map.Params?.Count > 0) writer.ApplyParams(e, planOf[a.ProposalGuid].Map);
                        report.Warnings.AddRange(writer.Notes);
                        if (t.Commit() != TransactionStatus.Committed)
                            report.Warnings.Add("The documents' values (P2) were not written — Revit did not commit them; the elements stand as placed.");
                    }

                // ── 6. One Undo entry, named as the first changeset's transaction ───────────────────────────────────────────
                string undo = UndoWatcher.TxName(filed[0].Name, filed[0].Id);
                group.SetName(undo);
                if (group.Assimilate() != TransactionStatus.Committed)
                {
                    report.NotBuilt = GhostFailurePolicy.NotFinishedLine(group.GetStatus().ToString());
                    return report;
                }
                done = true;

                // ── 7. The ledger: each changeset's result, then the undo watcher (only for a result the bridge holds) ────────
                int recorded = 0;
                for (int c = 0; c < filed.Count; c++)
                {
                    var cs = filed[c];
                    var res = results[c];
                    foreach (var g in res.Gone) report.DeletedByRevit.Add(planOf[g.ProposalGuid].What + " — removed by Revit at commit");
                    foreach (var kv in res.Warnings) report.RevitWarnings[kv.Key] = (report.RevitWarnings.TryGetValue(kv.Key, out int w) ? w : 0) + kv.Value;
                    if (!bound) continue;
                    var guids = res.Applied.Select(a => a.ProposalGuid).ToList();
                    if (!ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report)))
                        continue;
                    recorded++;
                    UndoWatcher.Remember(undo, r.Key, cs.Id, guids);                         // the Undo entry's name (the group's)
                    UndoWatcher.Remember(UndoWatcher.TxName(cs.Name, cs.Id), r.Key, cs.Id, guids); // and its own, whichever Revit reports
                }
                report.Placed = applied.Count;
                report.Stamped = applied.Count(a => ProvenanceStamp.SourceOf(ProvenanceStamp.Read(doc.GetElement(a.RevitUniqueId))) == GhostFiling.Source);
                report.Ledger = !bound ? localLedger
                    : $"Ledger: {recorded} of {filed.Count} changeset(s) recorded on {r.Key} (source dwg: {string.Join(", ", filed.Select(f => Short(f.Id)))})" +
                      (recorded == filed.Count ? " — one Ctrl+Z undoes the whole build and posts changeset_reverted."
                                               : " — a result was NOT recorded (see the message before this one); do not apply that changeset again in Review AI Proposals.");
                if (idsRejected > 0)
                    report.Warnings.Insert(0, $"IDS: {idsRejected} element(s) did not pass the project's IDS — built as reviewed in Ghost's review (founder decision F2); each verdict is on its changeset.");
                return report;
            }
            catch (Exception ex) when (!done)
            {
                string why = $"{ex.GetType().Name}: {ex.Message}";
                return executing ? Decline(null, why) : Abandon(GhostFailurePolicy.NotBuiltLine(why));
            }
        }

        // The ledger note on each changeset's result: what was built from, and the types this build added (not elements of
        // any changeset, so named here).
        private static string Note(Request r, Level level, GhostPlacementEngine.PlacementReport report) =>
            $"Ghost Builder: {r.Drawing} on {level.Name}, as reviewed in Ghost's review" +
            (report.CreatedTypes.Count == 0 ? "" : "; types added with this build: " + string.Join("; ", report.CreatedTypes.Take(10)) +
                                                   (report.CreatedTypes.Count > 10 ? $" (+{report.CreatedTypes.Count - 10} more)" : ""));

        // Every wall type by name, as GhostPlacementEngine reads them for the typing rule.
        private static Dictionary<string, WallType> WallTypes(Document doc) =>
            new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
                .GroupBy(w => w.Name, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        // The executor's rules, before filing: one FLOOR type of that name (a foundation slab is not one), one ceiling type.
        private static string FloorTypeProblem(Document doc, string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "the layer mapping names no floor type";
            int n = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>()
                .Count(t => !t.IsFoundationSlab && string.Equals(t.Name, name, StringComparison.OrdinalIgnoreCase));
            return n == 1 ? null : n == 0 ? $"FloorType '{name}' not found" : $"{n} floor types are named \"{name}\" — a person decides";
        }

        private static string CeilingTypeProblem(Document doc, string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "the layer mapping names no ceiling type";
            int n = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Ceilings).WhereElementIsElementType()
                .Count(t => string.Equals(t.Name, name, StringComparison.OrdinalIgnoreCase));
            return n == 1 ? null : n == 0 ? $"CeilingType '{name}' not found" : $"{n} ceiling types are named \"{name}\" — a person decides";
        }

        private static string Short(string id) => (id ?? "").Substring(0, Math.Min(8, (id ?? "").Length));
    }
}
```

- [ ] **Step 5: Replace `SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs` whole**

```csharp
#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using Autodesk.Revit.UI;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// PHASE 3 handoff. The review's Build stages the reviewed rows here and Raise()s; Revit then calls Execute() ON THE API
    /// THREAD — the only place a model may change. MA-1a step 2: the build is planned, filed as changesets (source dwg) and
    /// placed by ChangesetExecutor, all in GhostChangesetBuild.Run, which checks first that the model the review was opened
    /// on is still the active one (DocPin).
    /// </summary>
    public sealed class GhostBuilderPlacementEvent : IExternalEventHandler
    {
        /// The document's office code, set by the command that creates this handler (it names the event only).
        public string Org = "";

        // Per-raise payload, staged on the UI thread just before Raise().
        private GhostChangesetBuild.Request _request;

        /// <summary>Fired on the API thread after the build. Report null when an error is passed.</summary>
        public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

        /// <summary>Stage the reviewed rows for the next Raise().</summary>
        public void SetRequest(GhostChangesetBuild.Request request) => _request = request;

        public void Execute(UIApplication app)
        {
            // Snapshot + clear so a stale payload can't be reused.
            var request = _request;
            _request = null;
            try
            {
                if (request == null) throw new InvalidOperationException("No request staged. Call SetRequest() before Raise().");
                Completed?.Invoke(GhostChangesetBuild.Run(app, request), null);
            }
            catch (Exception ex)
            {
                // Never let an exception escape Execute() — Revit treats it as a fatal add-in fault.
                Completed?.Invoke(null, ex);
            }
        }

        public string GetName() => Sentinel.Engine.OrgNames.GhostEventName(Org);
    }
}
```

- [ ] **Step 6: Delete the orchestrator's DWG placement.** In `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs`, make three replacements. First, replace

```csharp
    ///   • Place(inputs, mapping)  — Revit API WRITES (Wall.Create, family placement) inside one
    ///                               transaction. API thread ONLY — must run via ExternalEvent.
```

with

```csharp
    ///   • PlacePrepared(els, map) — Photo Massing's Revit API WRITES inside one transaction. API thread
    ///                               ONLY — must run via ExternalEvent. A DWG build is placed by
    ///                               GhostChangesetBuild through ChangesetExecutor (MA-1a step 2).
```

Second, replace

```csharp
        /// <summary>The Ghost transaction's name (DWG and massing) — also how the global Doctor (FailureInterceptor) knows to
        /// leave this build's warnings alone ([BP] P1-3, GhostFailurePolicy.DoctorSkips). Unchanged; step 2 renames it with
        /// the changeset.</summary>
```

with

```csharp
        /// <summary>Photo Massing's transaction name — also how the global Doctor (FailureInterceptor) knows to leave its
        /// warnings alone ([BP] P1-3, GhostFailurePolicy.DoctorSkips). A DWG build's transactions are its changesets'.</summary>
```

Third, replace the whole block from `        /// <summary>\n        /// PHASE 3 — geometry creation inside one transaction.` through the end of `Place(Inputs inputs, MappingResult mapping, long levelId)` and the `PlacePrepared` doc comment. That is master `:79-139`, beginning

```csharp
        /// <summary>
        /// PHASE 3 — geometry creation inside one transaction. Revit API writes: API thread ONLY,
        /// must be invoked from an IExternalEventHandler.Execute. Never from Task.Run.
        /// </summary>
        public GhostPlacementEngine.PlacementReport Place(Inputs inputs, MappingResult mapping, Level level = null)
```

and ending

```csharp
        /// <summary>
        /// Place already-prepared elements + mapping, WITHOUT the DWG face-pairing pass — for callers that
        /// bring their own geometry with thickness already set (photo massing). Same transaction,
        /// provisioners, guideline and audit as a DWG build, so a massing is governed identically.
        /// </summary>
```

Replace it with

```csharp
        // MA-1a step 2: a DWG build no longer places here — it pairs, plans and files changesets that ChangesetExecutor
        // places (GhostChangesetBuild, raised by GhostBuilderPlacementEvent); Place(Inputs, …) was deleted with that move.

        /// <summary>
        /// Photo Massing's placement (founder decision F5: Massing keeps this path until MA-6 moves it onto changesets):
        /// already-prepared elements + mapping, without the DWG face-pairing pass, in one transaction with the provisioners,
        /// the guideline, placeholder types and GhostFailureHandler's honest-build rule.
        /// </summary>
```

`PlacePrepared` itself is unchanged. Run `grep -rn "\.Place(inputs\|orchestrator!*\.Place(" SentinelAddin`: it must print nothing.
- [ ] **Step 7: The command stages a changeset build.** In `SentinelAddin/Commands.GhostBuilder.cs`, make five replacements. First, replace

```csharp
///   • ExternalEvent (API thread): geometry placement (Wall.Create etc.), the only place Revit
///     API writes are legal. Reads and writes never touch the background thread.
```

with

```csharp
///   • ExternalEvent (API thread): the build — planned, filed as changesets (source dwg) and placed by
///     ChangesetExecutor (GhostChangesetBuild, MA-1a step 2), the only place Revit API writes are legal.
///     Reads and writes never touch the background thread.
```

Second, replace

```csharp
        if (cadLink is null) return Result.Cancelled;
```

with

```csharp
        if (cadLink is null) return Result.Cancelled;
        // The drawing's name, for the changesets the build files (MA-1a step 2).
        string drawing = Path.GetFileNameWithoutExtension(doc.GetElement(cadLink.GetTypeId())?.Name ?? "drawing");
```

Third, replace

```csharp
            mapper?.Remember(review.Choices); // GHB-5: the reviewer's picks and ignores, for this project's next run
            placementEvent.SetRequest(orchestrator!, inputs, approved, levelId);
            externalEvent.Raise();
```

with

```csharp
            mapper?.Remember(review.Choices); // GHB-5: the reviewer's picks and ignores, for this project's next run
            // MA-1a step 2: Build is the one human gate — the ticked rows are filed as changesets (source dwg) and placed by
            // ChangesetExecutor; an unbound model runs the same executor on a local changeset, with no ledger.
            placementEvent.SetRequest(new GhostChangesetBuild.Request
            {
                Doc = doc, Elements = inputs.Elements, Mapping = approved, LevelId = levelId,
                Guideline = standards!.Guideline, LibraryDir = libraryDir, Key = key, Drawing = drawing,
            });
            externalEvent.Raise();
```

Fourth, the review drop-down offers floor types only (E10). Replace

```csharp
    /// <summary>GHB-5: what each review row's type drop-down offers, read on the API thread as plain strings (the review
    /// window is Revit-free): basic wall, floor and ceiling types by name; door, window, column and furniture types as
    /// family : type. Basic walls only, as ChangesetExecutor resolves them, so a pick stays valid when Ghost moves onto it.</summary>
```

with

```csharp
    /// <summary>GHB-5: what each review row's type drop-down offers, read on the API thread as plain strings (the review
    /// window is Revit-free): basic wall, floor and ceiling types by name; door, window, column and furniture types as
    /// family : type. Basic walls only and floors without foundation slabs, as ChangesetExecutor resolves them, so a pick
    /// is one the executor places.</summary>
```

and replace

```csharp
            ["Floors"] = Names(new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>()),
```

with

```csharp
            ["Floors"] = Names(new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().Where(f => !f.IsFoundationSlab)),
```

Fifth, in `Summarize`, replace

```csharp
        lines.AppendLine();
        // Revit did not commit (the failure handler rolled back, or the commit failed): nothing exists, nothing else is true.
        if (r.RolledBack != null) return lines.AppendLine(GhostFailurePolicy.NotBuiltLine(r.RolledBack)).ToString();
        // A6: Revit has not finished the build (Pending, …): nothing was recounted, so nothing else here is true either.
        if (r.NotFinished != null) return lines.AppendLine(r.NotFinished).ToString();
        // GHB-5: Placed is what exists after the commit; what Revit removed is named with the failure that named it.
        lines.AppendLine(GhostFailurePolicy.PlacedLine(r.Placed, r.DeletedByRevit));
        lines.AppendLine(WallsLine(r, s));
        if (r.TypeGaps > 0) lines.AppendLine($"Types: {r.TypeGaps} named by the layer mapping not created (each named below with its reason)");
        if (r.SkippedLowConfidence > 0) lines.AppendLine($"Skipped (low confidence): {r.SkippedLowConfidence}");
        if (r.SkippedUnknownFamily > 0) lines.AppendLine($"Skipped (type or family not in the model): {r.SkippedUnknownFamily}");
        if (r.SkippedNoGeometry > 0)    lines.AppendLine($"Skipped (no geometry): {r.SkippedNoGeometry}");
        var revitWarnings = GhostFailurePolicy.WarningsLine(r.RevitWarnings);
        if (revitWarnings != null) lines.AppendLine(revitWarnings);
        if (r.CreatedTypes.Count > 0)
        {
            // The office type library was extended — show it plainly; this is a deliberate change to the model's
            // type library, not a placement side-effect.
            lines.AppendLine().AppendLine($"Added {r.CreatedTypes.Count} type(s) or family(ies) to the model:");
            foreach (var t in r.CreatedTypes) lines.AppendLine($"  + {t}");
        }
        if (r.Warnings.Count > 0)
```

with

```csharp
        lines.AppendLine();
        // MA-1a step 2: nothing was built (refused, not filed, rolled back by Revit, not finished, or nothing to build) —
        // that line and the ledger line; the reasons below still name every row that gave no element. Nothing else is true.
        if (r.NotBuilt != null)
        {
            lines.AppendLine(r.NotBuilt);
            if (r.Ledger != null) lines.AppendLine(r.Ledger);
        }
        else
        {
            // GHB-5: Placed is what exists after the commit (the executor's recount); what Revit removed is named.
            lines.AppendLine(GhostFailurePolicy.PlacedLine(r.Placed, r.DeletedByRevit));
            lines.AppendLine(WallsLine(r, s));
            if (r.TypeGaps > 0) lines.AppendLine($"Types: {r.TypeGaps} named by the layer mapping not created (each named below with its reason)");
            if (r.SkippedUnknownFamily > 0) lines.AppendLine($"Skipped (type or family not in the model): {r.SkippedUnknownFamily}");
            if (r.SkippedNoHost > 0) lines.AppendLine($"Skipped (no single straight wall under the door or window): {r.SkippedNoHost}");
            if (r.SkippedNoGeometry > 0) lines.AppendLine($"Skipped (no geometry): {r.SkippedNoGeometry}");
            lines.AppendLine($"Provenance: {r.Stamped} of {r.Placed} placed element(s) stamped as source dwg");
            var revitWarnings = GhostFailurePolicy.WarningsLine(r.RevitWarnings);
            if (revitWarnings != null) lines.AppendLine(revitWarnings);
            if (r.Ledger != null) lines.AppendLine(r.Ledger);
            if (r.CreatedTypes.Count > 0)
            {
                // The office type library was extended — show it plainly; this is a deliberate change to the model's
                // type library, not a placement side-effect. Inside the build's one Undo: Ctrl+Z removes them too.
                lines.AppendLine().AppendLine($"Added {r.CreatedTypes.Count} type(s) or family(ies) to the model:");
                foreach (var t in r.CreatedTypes) lines.AppendLine($"  + {t}");
            }
        }
        if (r.Warnings.Count > 0)
```

- [ ] **Step 8: Build and check.**
  - Both builds: `0 Error(s)`. Revit 2024 now shows `5 Warning(s)`: master's `CS0618` in the deleted `Place(…, long levelId)` is gone. Revit 2026 shows `3 Warning(s)`.
  - `promote-check` `178/178`, `ghost-p2-check` `91/91`.
  - `ghost-standards-check` `146/146`, `wallpair-check` `9/9`, `massing-check` `13/13` (unchanged from Task 1 Step 0).
  - Run `grep -rn "GhostFailurePolicy.TxName\|GhostBuilderOrchestrator.TxName" SentinelAddin --include=*.cs`. It prints one line, `GhostBuilderOrchestrator.cs:37: public const string TxName = GhostFailurePolicy.TxName;` — the name only `PlacePrepared` (Massing) still uses.
- [ ] **Step 9: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/GhostBuilder/ElementPlacementFactory.cs SentinelAddin/GhostBuilder/GhostFloorTypeProvisioner.cs SentinelAddin/GhostBuilder/GhostTypeCreator.cs SentinelAddin/Commands.GhostBuilder.cs
git commit -F - <<'EOF'
feat(ghost): Ghost Builder files dwg changesets and ChangesetExecutor places them — the DWG placement path is deleted (MA-1a step 2)

Build is the one human gate: Ghost's types step (preload, provisioners, guideline sizes), a plan that turns every rule
refusal into a named gap, filing (chunks of 200, hosts first; unbound = a local changeset, no ledger), the executor per
changeset, then the documents' values — all in one TransactionGroup assimilated into one Undo named as the first
changeset, remembered for the undo watcher. Any filing failure, refusal or Revit error rolls the whole build back and
leaves nothing. GhostBuilderOrchestrator.Place is deleted; Photo Massing keeps PlacePrepared until MA-6.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5 — Drill files, sample README, graph, merge

**Files:**
- Modify `demo/ghost-sample/make-sample.py` (`:4`, `:19`, after `:54`, `:83`, `:98-99`, `:109`, `:160`)
- Create `demo/ghost-sample/sample-plan-step2.dxf` and `demo/ghost-sample/sample-plan-planted.dxf` (generated)
- Modify `demo/ghost-sample/README.md` (`:21`, `:53`, before `## Verified offline`)

- [ ] **Step 1: The generator writes the two drill drawings.** In `demo/ghost-sample/make-sample.py`, make seven replacements.

First, replace

```python
Run:  python demo/ghost-sample/make-sample.py
```

with

```python
Run:  python demo/ghost-sample/make-sample.py
      python demo/ghost-sample/make-sample.py --step2   (MA-1a step 2 drill: sample-plan-step2.dxf)
      python demo/ghost-sample/make-sample.py --plant   (… plus the planted failing floor: sample-plan-planted.dxf)
```

Second, replace `import os` (the first import line) with

```python
import os
import sys
```

Third, replace

```python
LAYERS = ["A-WALL-EXT", "A-WALL-INT", "A-FLOR", "A-DOOR", "EXTERIOR-ENVELOPE", "A-ANNO", "DEFPOINTS"]
```

with

```python
LAYERS = ["A-WALL-EXT", "A-WALL-INT", "A-FLOR", "A-DOOR", "EXTERIOR-ENVELOPE", "A-ANNO", "DEFPOINTS"]

# MA-1a step 2 drill. --step2 adds two IDENTICAL furniture outlines at one point (Revit's "identical instances" warning, one
# of the three the global Doctor would erase or resolve — it must leave this build's alone), a ceiling outline over the east
# room (a ceiling at the drawing's height, founder decision F7) and a free-standing curved wall (an arc wall through the
# executor). --plant adds, on the slab layer, a closed outline that crosses itself: Revit cannot make a floor from it, so the
# build must roll back whole — the planted failing element (drill row S2-4).
STEP2 = [("A-FURN", rect(7000, 4500, 1500, 750)), ("A-FURN", rect(7000, 4500, 1500, 750)), ("A-CLNG", rect(4000, 0, 6000, 7000))]
ARCS = [("A-WALL-EXT", 13000, 3000, 1000, 0, 180)]   # (layer, centre x, centre y, radius, start deg, end deg)
BOWTIE = [("A-FLOR", [(12000, 5000), (14000, 7000), (14000, 5000), (12000, 7000), (12000, 5000)])]
```

Fourth, replace

```python
def dxf():
```

with

```python
def dxf(polylines=POLYLINES, arcs=(), layers=LAYERS):
```

Fifth, replace

```python
    g(0, "TABLE"); g(2, "LAYER"); g(70, len(LAYERS))
    for i, name in enumerate(LAYERS):
```

with

```python
    g(0, "TABLE"); g(2, "LAYER"); g(70, len(layers))
    for i, name in enumerate(layers):
```

Sixth, replace

```python
    for layer, pts in POLYLINES:
```

with

```python
    for layer, cx, cy, r, a0, a1 in arcs:
        g(0, "ARC"); g(8, layer)
        g(10, cx); g(20, cy); g(30, 0.0); g(40, r); g(50, a0); g(51, a1)
    for layer, pts in polylines:
```

Seventh, replace

```python
if __name__ == "__main__":
```

with

```python
if __name__ == "__main__":
    if "--step2" in sys.argv or "--plant" in sys.argv:
        plant = "--plant" in sys.argv
        path = os.path.join(HERE, "sample-plan-planted.dxf" if plant else "sample-plan-step2.dxf")
        with open(path, "w", newline="") as f:
            f.write(dxf(POLYLINES + STEP2 + (BOWTIE if plant else []), ARCS, LAYERS + ["A-FURN", "A-CLNG"]))
        print(f"wrote {path}  ({os.path.getsize(path):,} bytes)")
        sys.exit(0)
```

- [ ] **Step 2: Generate.** Run `python demo/ghost-sample/make-sample.py --step2`, which should print `… sample-plan-step2.dxf  (3,545 bytes)`. Then run `python demo/ghost-sample/make-sample.py --plant`, which should print `… sample-plan-planted.dxf  (3,892 bytes)`. Do not run it without a flag: `git status` must show no change to `sample-plan.dxf` or `sample-spec.pdf`.
- [ ] **Step 3: README.** In `demo/ghost-sample/README.md`, make three changes.

  *As built (2026-10-02):* the three changes went in shortened. `GhostEvidence.FromFolder` reads `README.md` before `sample-spec.pdf` into one 6000-character budget, and the text below pushed the README past it, so the spec dropped out of the evidence (ghost-p2-check "the spec PDF is cited as a source" failed). The drill drawings are described in `make-sample.py`, and ghost-p2-check now asserts that the spec's last line (`FD30`) reaches the evidence.

First, replace

```markdown
| `A-DOOR` | 2 closed rectangles | The centroid path for point families. Places only the ONE loaded door type the mapping or the review names (pick it in the row's drop-down); a family that is not loaded, or one with several types and none named, is skipped and named in the summary — never the first door family loaded (MA-1a). |
```

with

```markdown
| `A-DOOR` | 2 closed rectangles | The centroid path for point families. Places only the ONE loaded door type the mapping or the review names (pick it in the row's drop-down); a family that is not loaded, or one with several types and none named, is skipped and named in the summary — never the first door family loaded (MA-1a). Since MA-1a step 2 each door is hosted by the one straight wall under its centroid (both centroids lie on a wall line); a point with no single wall under it is skipped and named, never guessed. |
```

Second, replace

```markdown
| **One** Ctrl+Z removes the whole build | Confirms the single-transaction design; if it takes several, that's a real regression. |
```

with

```markdown
| **One** Ctrl+Z removes the whole build — elements and the types it added; on a bound model the Doctor panel then says `changeset_reverted row posted` | Since MA-1a step 2 a build is one or more changesets (source `dwg`) inside one Undo entry, `Sentinel AI changeset: Ghost Builder · <drawing> · <level> […]`. If it takes several Ctrl+Z, that's a real regression. |
```

Third, insert before `## Verified offline`:

```markdown
## MA-1a step 2 drill files

`python make-sample.py --step2` writes `sample-plan-step2.dxf`. It holds the plan above plus:
- two identical `A-FURN` outlines at one point: Revit's "identical instances" warning, which the Doctor must leave;
- an `A-CLNG` outline over the east room: a ceiling at the drawing's height;
- a free-standing arc on `A-WALL-EXT`: a curved wall.

`--plant` writes `sample-plan-planted.dxf`: the same, plus an `A-FLOR` outline that crosses itself. Revit cannot make that floor, so the whole build must roll back and leave nothing (design §2.4's drill row). See drill MA1a-S2 in `docs/superpowers/plans/2026-10-02-ma1a-step2-ghost-on-executor.md`.

```

- [ ] **Step 4: Graph.** Run `graphify update .`. If it is not on PATH, record that in the merge message.
- [ ] **Step 5: Final checks.**
  - `dotnet run --project tools/promote-check`: `178/178 checks pass`.
  - `dotnet run --project tools/ghost-p2-check`: `91/91 checks pass`.
  - `dotnet run --project tools/session-check`: `47/47 checks pass`; `ghost-standards-check` `146/146`, `wallpair-check` `9/9`, `massing-check` `13/13`.
  - From `WebApp`, `npx vitest run bridge/`: `Tests  1626 passed | 1 skipped (1627)`.
  - Both builds: `0 Error(s)`, with Revit 2024 at `5 Warning(s)` and Revit 2026 at `3 Warning(s)`.
- [ ] **Step 6: Commit and merge.**

```bash
git add demo/ghost-sample/make-sample.py demo/ghost-sample/sample-plan-step2.dxf demo/ghost-sample/sample-plan-planted.dxf demo/ghost-sample/README.md
git commit -F - <<'EOF'
docs(ghost): MA-1a step 2 drill drawings — identical furniture, a ceiling, an arc wall, and a planted self-crossing slab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git checkout master
git merge --no-ff feature/ma1a-step2-ghost-executor -F - <<'EOF'
Merge feature/ma1a-step2-ghost-executor: MA-1a step 2 — Ghost Builder files dwg changesets and ChangesetExecutor places them (one gate, one Undo, stamped, on the ledger); executor all-or-nothing at commit with warnings counted and a survivor recount; Doctor skips changesets; column/furniture/arc creates; DWG placement path deleted, Massing on its own until MA-6

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Live drill MA1a-S2 (Revit 2024, scratch copy only)

**Set-up (once):**
- Close Revit. Run `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, which deploys, and record `git rev-parse --short HEAD`. Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work.
- Copy `%USERPROFILE%\Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 model) to `%USERPROFILE%\Documents\Sentinel drills\ma1a-s2-scratch.rvt`, and make a second copy `ma1a-s2-unbound.rvt`. Never open aster-tower, Demo, a pilot file or any founder file.
- The bridge must be running (`tools/bridge-start.cmd`). On the bound copy only, in Project Setup, bind it to web project `demo`; it inherits `layers@1` from bds-office.
- Sign-in: sign in as a contributor or above (Standards ▸ Sign in), or stay signed out (the machine credential reads as `service`). Record which.
- Settings:
  - Ghost source folder = `demo/ghost-sample`;
  - Ghost family library: empty;
  - Ollama running with `qwen2.5:7b-instruct`.
- Run `python demo/ghost-sample/make-sample.py --step2` and `--plant`, if Task 5 was not merged.
- Loaded families: if the model has no furniture family that is `OneLevelBased`, load one from the Revit 2024 library (for example a desk) through Insert ▸ Load Family. If it has no wall-hosted door family with a type, load one (for example `Single-Flush`). Record both family and type names. The community MCP never writes (A8).
- Before each row, record:
  - the Manage ▸ Review Warnings count;
  - element counts per category, by `analyze_model_statistics` (read-only) or a schedule;
  - the last row id of `GET /cde/demo/audit?entity_type=changeset`, read with the service token. Never print the token.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| S2-1 One changeset, source dwg, one Undo | Run Ghost Builder ▸ `sample-plan.dxf` on the bound copy. Pick, as in S1-4: the two basic wall types, a floor type and the door `<family> : <type>`. Then Build | The summary shows: <br>• `Placed: N`, with N = the count delta; <br>• `Provenance: N of N placed element(s) stamped as source dwg`; <br>• `Ledger: 1 of 1 changeset(s) recorded on demo (source dwg: xxxxxxxx) — one Ctrl+Z…`. <br>The audit has `changeset_proposed` (`source: dwg`) and `changeset_applied` (`status: applied`, N applied). Edit ▸ Undo's newest entry is exactly `Sentinel AI changeset: Ghost Builder · sample-plan · <level> [xxxxxxxx]`: one entry for the whole build, with the DWG import its own earlier entry if imported this run. Each of the 2 doors has a wall as its host (Properties or a section: the door cuts its wall). No door, wall or floor of the model existing before changed | N, the audit row ids, the Undo entry text, each door's host |
| S2-2 Ctrl+Z writes one `changeset_reverted` row with the guids | Press Ctrl+Z once after S2-1. Then press Ctrl+Y | After Ctrl+Z: the counts are back to before S2-1, and so are the types S2-1 added. The Doctor panel shows `Undo watcher: undo of changeset xxxxxxxx — changeset_reverted row posted (N guid(s))`. The audit gains one `changeset_reverted` row `{op: "undo", guids: [N guids], count: N}` with the same guids as `changeset_applied`. Ctrl+Y gives a `redo` row | the rows, and whether one or two Doctor lines appeared (UNSURE 2) |
| S2-3 Every placed element carries the stamp | S2-1's summary, and S2-5's | `Provenance: X of Y` with X = Y = Placed in both. A shortfall is a fail, and the elements are named by category | the two lines |
| S2-4 A planted failing element leaves no elements and erases no warnings | Record the Review Warnings count W0, the counts, and the wall and floor type lists (Project Browser). Run Ghost Builder ▸ `sample-plan-planted.dxf`, tick every row including `A-FLOR`, pick types as in S2-1, then Build | The summary starts `Nothing was built — Revit rolled the build back, so the model is as it was before Build:` and names `floor "A-FLOR #2"` (or Revit's commit-time error, with `(a Revit error at commit: …)`). Afterwards: <br>• every count is unchanged; <br>• no new wall or floor type is in the type lists, because the types step rolled back too; <br>• Review Warnings = W0; <br>• there is no new Ghost entry in the Undo list. <br>The audit shows `changeset_applied` with `status: declined` and the note `Revit transaction failed — rolled back: …` | W0 and after, the summary's first lines, the audit row. If the bow-tie floor IS built, record it and mark UNSURE 1 failed (see the note below) |
| S2-5 The Doctor still skips Ghost builds; arc wall; ceiling; furniture | Record W0. Run Ghost Builder ▸ `sample-plan-step2.dxf` on the bound copy. Tick `A-FURN` with the loaded furniture type and `A-CLNG` with a ceiling type, plus the S2-1 picks. Leave the arc (on `A-WALL-EXT`) as typed. Then Build | Two furniture instances stand at one point and both survive. The summary's `Revit warnings raised by this build: K — left in the model…` lists `There are identical instances in the same place` if Revit raises it (UNSURE 4). Review Warnings after = W0 + K. The Doctor panel has no `Resolved:`/`Suppressed:` line for this build. The `A-WALL-EXT` arc is one curved wall. The ceiling exists, and the summary says `placed 0 mm above <level>, the drawing's height` | K, both Review Warnings counts, the Doctor lines, the ceiling's Height Offset From Level, and a screenshot of the arc wall |
| S2-6 A row with no loaded type is a gap, not a decline | In S2-5's run, untick nothing but set `A-DOOR` to "as proposed" (`BDS_Door`, not loaded) | The summary reads `Doors on 'A-DOOR': … "BDS_Door" is not loaded in this model …; skipped.  (×2)` and `Skipped (type or family not in the model): 2`. Everything else in S2-5 is placed (design `:1062`) | the summary lines |
| S2-7 Unbound model: the same executor, no ledger | Open `ma1a-s2-unbound.rvt` (not bound). Run Ghost Builder ▸ `sample-plan.dxf` with S2-1's picks, then Build | `Placed: N`. `Provenance: N of N … source dwg`. `Ledger: none — this model is not bound to a web project…`. One Undo entry `Sentinel AI changeset: Ghost Builder · sample-plan · <level> […]`. The audit is unchanged. Ctrl+Z removes the build and writes no Doctor `changeset_reverted` line | the summary, the Undo text |
| S2-8 Re-run on top: doors become named gaps, warnings kept | On the bound copy, first press Ctrl+Z once to undo S2-5's build (B9: its walls are a second copy of the plan's, so with them each door would have three walls under it, not two); check that the newest Undo entry left is S2-1's build (redo it if undone). Then run `sample-plan.dxf` again with S2-1's picks | The doors are not filed: `Doors on 'A-DOOR': 2 walls on <level> pass within 1 mm of (…) … — not filed (snapping DWG door blocks onto walls is GHB-1, MA-1b).` and `Skipped (no single straight wall under the door or window): 2`. Walls and floor are placed. The overlap warnings are counted and kept (Review Warnings + K). Every S2-1 element still exists | the summary, K |
| S2-9 Photo Massing still works | Photo Massing on a scratch copy, with a folder of building photos | The summary is as before, with Placed and the placeholder Notes. The Undo entry is `Ghost Builder - LOD 200`. If there are no photos on the PC, record `not run` as S1-9 did | the Notes |

**S2-4 note (A8):** the plant is the DXF's self-crossing slab outline. It is never planted through the community MCP. If Revit builds the bow-tie floor (UNSURE 1), there is no other DXF-only plant that the plan does not filter by rule (E6). Record the row as not proven live and raise it with the founder. Ceiling: the rule is then proven only by the executor's catch and the all-or-nothing preprocessor, by code reading.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as session MA1a-S2. Close Revit without saving.

## UNSURE facts this drill settles

1. Does `Floor.Create` throw for a single self-crossing loop? Or does Revit raise a commit-time error, or build it? Both of the first two roll back (S2-4); the third leaves the plant unproven. Before that: `CurveLoop.Create` is expected to accept the bow-tie (it checks contiguity, not self-crossing); if it refuses it, the summary names `A-FLOR` under "Skipped (no geometry)" instead, the rest is built, and the plant is unproven the same way.
2. Which name `DocumentChangedEventArgs.GetTransactionNames()` returns on Undo of an assimilated `TransactionGroup`: the group's or the inner transactions'. The watcher remembers both, and `Hits` gives one row either way (S2-2).
3. Does the global Doctor's `FailuresProcessing` see the inner transactions' names (`Ghost Builder - types`, `Sentinel AI changeset: …`) inside a group (S2-5)?
4. Do two identical unhosted furniture instances raise `DuplicateInstances` (S2-5)? If not, K has no Doctor-relevant warning; record that and the Doctor row stands on its log lines alone.
5. Where a ceiling lands with `CEILING_HEIGHTABOVELEVEL_PARAM = 0`. What height Ghost's old `Ceiling.Create` gave without an offset was never measured (F7, S2-5).
6. Whether Ghost's DWG doors were wall-hosted before step 2 (S1 did not record it). Now they are hosted by rule (S2-1).
7. Whether a window placed hosted at its level with no `SillHeight` takes its family's default sill. The sample has no window, so this is not exercised; record "not seen".
8. Whether wall joins move a planned wall's location line, so that the plan's host check passes and the executor's fails. If so, the whole build declines; S2-1's doors show it does not happen on the sample.
9. Whether `SetForcedModalHandling(false)` on the executor's transaction shows Revit's warnings non-modally from an ExternalEvent, as for step 1's S1-8 (S2-5).
10. Unchanged from step 1: `Floor.Create`'s handling of a loop at CAD Z on a level whose elevation is not 0. The plan keeps the drawing's Z (E8).
11. Whether `Arc.Create(start, end, mid)` with the DXF arc's mid point (`Evaluate(0.5, true)`) gives the same curve as the drawing (S2-5).
12. Whether the model's column families report `TwoLevelsBased` (E12) and where an unhosted column's top lands. The sample has no column, so this is not exercised; record "not seen".

## Risks

- **Bound models need the bridge and a contributor.** On a bound model, a Ghost build now needs the bridge and contributor or above; offline or as a viewer, nothing is built (F3).
- **Dirty slab outlines decline whole builds.** A slab outline Revit refuses, or a ceiling outline the bridge refuses, now declines the whole build, where step 1 skipped that one element (E6). The summary names it; the person unticks the layer or fixes the drawing.
- **Other changesets change too.** Agent and Promote changesets now roll back on any commit-time error, with no Revit dialog. Their duplicate-Mark warnings are no longer erased by the Doctor (E1, E2). B35-style agent seeds should still apply; re-run B35's seed once on a scratch copy if convenient.
- **Re-runs drop doors.** Re-running Ghost on top of its own build files no doors (two walls under each point, S2-8), and walls duplicate as before.
- **Large builds file several changesets.** A build over 200 elements is several changesets. If a result report fails midway, the bridge holds some changesets applied and some proposed; the retry dialog and the ledger line say so.
- **The IDS is advisory for Ghost** until item 8 (F2).
- **Types are not ledger elements.** The types a build adds are named only in the result note, not as ledger elements (F4). D13's Holding Area replaces this.
- **Two placers remain until MA-6:** the executor, and Massing's `PlacePrepared` (F5).
- **Models are not pinned on the bridge.** A filed changeset carries no model identity. Ghost applies at once, but a changeset left proposed by a report failure could be applied on another model bound to `demo` through Review AI Proposals.
- **Commit-time errors on dirty drawings decline whole builds (B6).** A commit-time Revit error ("Can't make Wall", "Can't keep elements joined" — between two Ghost walls, or a Ghost wall and a user's wall) now declines the whole build, named (B3); step 1 deleted only the failing new element. Record it against S2-1 and S2-5: if either declines this way on the sample, the row fails and the culprit's label is recorded.
- **Filed chunks are ordinary proposed changesets until Ghost's run reports them (B10).** Between filing and the report, a member on another model bound to the same project could apply one through Review AI Proposals.

## Next (out of scope here)

- MA-1a items 3–8:
  - **3**: GHB-2, walls from level to level, for every source;
  - **4**: the full provenance stamp (source file sha, layer, rule, approver, ledger row) and the "copied" read;
  - **5**: the BLOCK check before commit;
  - **6**: the guideline's `placement` block (workset, phase, no design option), a ceiling height, and the office-template check;
  - **7**: XC-5 report calls and P1-9 Doctor rows;
  - **8**: `build:run` receipts and contract-2 trust and pre-tick rules (revisits F2).
- MA-1b: the DWG door-block reader (GHB-1: rotation, swing, snap onto the wall), MAS-4, and the drill MA1b wording (F8).
- MA-6: Photo Massing through changesets, which deletes `PlacePrepared`, `GhostPlacementEngine`, `ElementPlacementFactory.Place` and the step-1 failure rule (F5).
- D13: new type sizes as lead-approved Holding Area rows, replacing Ghost's types step (F4).
- Port the bridge's `outlineProblem` into Ghost's plan if drills show dirty outlines (E6).
- Model identity on create changesets.
- A bridge claim status (`applying`) set at filing, so a Ghost build's chunks cannot be applied elsewhere before its run reports them (B10).
- `ChangesetExecutor.cs` is still in no check project. Its decisions are pure (`GhostFailurePolicy`, `PlacementGeometry`); its Revit half is drilled.
- Step-1 leftovers: `GhostTypeCreator.CreateColumnType`/`TryParseSection` dead code, the preloader's system-family noise, and the stale comment at `GhostBuilder_Architecture.cs:335-340`.
