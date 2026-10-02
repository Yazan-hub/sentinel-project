# MA-1b — DWG door and window blocks become hosted doors; Photo Massing's review closes after the build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Two things change:
- **A door or window drawn as a block becomes a real door or window (GHB-1).** Ghost Builder reads the drawing's block inserts — where each sits, which way it is turned, whether it is mirrored. Each one on a Doors or Windows row becomes a door or window **hosted in the nearest wall of this build within half that wall's thickness**: moved onto the wall's line, standing in the middle of the opening, hinged and swinging the way the block is drawn, cutting its wall. A block with no wall near, or lying across its wall, is a gap named in the summary — never a free-standing door. The door rectangles Ghost reads today keep working, with the same half-thickness reach.
- **Photo Massing's review builds once (MAS-4).** Build is disabled by the click that builds, so a double-click gives one massing. The review closes when the build is kept; what was placed is selected and zoomed to, and the summary says how many elements are selected. When nothing was built, the review stays open with the person's numbers.

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md` §7.2 MA-1, "Delivers (1b)" (`:1055-1057`) and "Drill MA1b" (`:1069-1072`). The audit's rows: GHB-1 (`docs/strategy/2026-09-30-revit-addin-audit.md:921`, with its findings `:903-908`) and MAS-4 (`:954`, its bug row `:943`). The step-2 plan's decision F8 (`docs/superpowers/plans/2026-10-02-ma1a-step2-ghost-on-executor.md:57`) on the drill's duplicate line, and its F9 (`:58`) on walls already in the model. Base: master `11aa82c`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Architecture:**

*GHB-1.* The changeset path stays the one placement path: the reader files door and window elements, and `ChangesetExecutor` places them.
- **The contract** gains two place fields on a door or window create: `Rotation` (the plan angle of the block's X axis, degrees) and `Mirrored`. The bridge's validator and the add-in's `PlaceDto` gain them together; one shared fixture (`ghost-dwg-body.json`) is read by vitest and by `promote-check`. They are place fields, kept as posted; the bridge still sets every trust field itself.
- **The reader** (`GhostCadExtractor.AddBlocks`, Revit-bound) walks the import's symbol geometry: each block insert is a nested instance whose transform, composed with the import's, gives its point, angle and mirror. A block becomes one point element at the middle of what it draws. The walk that reads walls and outlines is not touched.
- **The planner** (`GhostChangesetBuild`) finds each door's wall with a pure rule (`PlacementGeometry.Snap`): the one straight wall of this build within half its thickness — for a block, the one running along the block — and moves the point onto that wall's line. Then it asks the executor's own host rule at the moved point, as today, so whatever the executor would refuse is a named gap before anything is filed.
- **The executor** hosts the instance exactly as today (the one straight basic wall within 1 mm of the point), then, for an element with `Rotation`, flips its hand and facing toward the block's directions where the family can. After the commit it measures what Revit holds — the angle between each instance and its block, and whether hinge side and swing side are as drawn — and the summary prints that, never what was planned.
- All the geometry is pure (`PlacementGeometry`: `Frame`, `BlockCentre`, `Snap`, `Axes`, `Turn`, `TurnLines`) and proven offline; the drill drawing's expected results are worked out twice — by the generator script and by the add-in's code — and must agree.

*MAS-4.* The one-build guard is inside the review window's `Emit()`; whether the review closes is a pure rule (`MassingPlanner.BuildKept`); the command closes or reopens the window and selects `report.NewElements` still in the model — the same elements "Placed" counts.

**Tech stack:** the Revit add-in in C# (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json); the Node bridge (`WebApp/bridge/*.mjs`, vitest beside the code); offline C# console checks (`tools/*-check`, `SENTINEL_CHECK`); a Python generator for the drill drawing (`demo/ghost-sample/make-sample.py`, no third-party library); the Supabase ledger (no migration).

**Global constraints:**
- Branch `feature/ma1b-dwg-doors` from master `11aa82c` (it holds this plan); merge `--no-ff` only after every task's checks pass **and the live drill MA1b is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - Placement is all-or-nothing and the commit check stays: a changeset lands whole or not at all, and nothing is reported that Revit did not commit. A door block's flip that a family cannot do is not an error (E4); everything Revit refuses still rolls the whole build back.
  - One Undo entry per build. The flips are inside the executor's own transaction.
  - Counts are honest: placed, gaps, removed by Revit. What the summary says of a door's direction is measured after the commit.
  - Nothing is erased silently; a duplicate block is not removed by Sentinel (F4). Every refusal and every gap says why, in plain words.
  - A stamp's facts come only from the in-process placer, never from what the bridge returned.
  - The bridge, not the caller, sets the trust fields. `Rotation` and `Mirrored` are place fields; any other key is still listed under `ignored`.
  - The placement block (workset, phase, never a design option) and the BLOCK check apply to the new doors and windows as to any element: they are created by the same executor, inside the same transaction and Undo group.
  - A Ghost door or window is hosted only in a wall this build creates (F9 A of the step-2 plan), and never stands free.
  - No new dependency. No network call on Revit's API thread beyond those Ghost Builder already makes there.
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s.
- No new check project: extend `tools/promote-check`, `tools/ghost-p2-check`, `tools/massing-check` and the bridge's vitest files. `session-check` compiles `ChangesetClient.cs`; `ghost-p2-check` reads `demo/ghost-sample` as evidence (Task 9 says what that means for its README).
- Checks: `dotnet run --project tools/<name>` from the repo root; vitest from `WebApp` with `npx vitest run bridge/…`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by a source scan and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session (the section after the tasks). Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100.
- The community Revit MCP never writes. Only in the drill, and only its read-only calls: `analyze_model_statistics`, `get_current_view_info`, `get_current_view_elements` and `get_selected_elements`. Never a create, delete, operate, colour, tag or `send_code_to_revit` call.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens); never commit a `.rvt`.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Line numbers are master `11aa82c`'s and shift as tasks land: match the quoted text, not the number. Some files are CRLF on disk and some LF: use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`.

**Dry run (planner, 2026-10-02):** every code step below was applied in order, task by task, to a fresh `git archive` export of master `11aa82c` in a scratch folder outside the repository, by a script that reads this plan's own code blocks (each "replace" matching its text exactly once). Each "see it fail" step was run and failed as written; the generator was run where Task 4 says; the checks were run after each task. The steps were then applied once more, start to finish, to a second fresh export, and the final checks run there. The code blocks in this plan are the exact text that was applied. Results:
- `promote-check`: `424` after Task 2, `426` after Task 3, `437` after Task 4, `441` after Task 5, `445` after Task 6, `451` after Task 7, `454/454` after Task 8 (master `395/395`).
- `ghost-p2-check` `106/106` (master `103`); `massing-check` `17/17` (master `14`).
- All 25 check projects pass on the final tree; the others as on master (`session-check` `47/47`, `wallpair-check` `9/9`, `ghost-standards-check` `147/147`, `guideline-check` `17/17`, `roi-check` `50/50`, `event-check` `44/44`, `heal-check` `9/9`, `annotate-check` `ALL PASS`, `datum-check` `DATUM OK`).
- The bridge: `changesets-logic.test.mjs` `76 passed` (master `75`); the full `bridge/` suite `Test Files  83 passed (83)`, `Tests  1679 passed | 1 skipped (1680)` (master `1678 passed | 1 skipped`).
- Builds: Revit 2024 `0 Error(s)`, `5 Warning(s)`; Revit 2026 `0 Error(s)`, `3 Warning(s)` — master's counts. Revit 2022 and Revit 2027 also compile with `0 Error(s)` (Task 6's block-name read has one branch for Revit 2021–2022 and one for 2023 and later); they are not required builds.
- The generator leaves `sample-plan.dxf`, `sample-plan-step2.dxf`, `sample-plan-planted.dxf` and `sample-spec.pdf` as on master, and writes the three new files; the drill's BLOCK ruleset passes the bridge's `validateArtefact`.

The dry run found three things the plan now carries. A check's expectation was wrong, not the code: a point past one wall's end near a corner is answered by the other wall ("the block is turned 90° from W2"), so that check now uses a wall with no neighbour. `ghost-p2-check` failed when the sample folder's README grew — the README is itself evidence, inside the same 6,000-character budget as the spec — so Task 9 rewords one line instead of adding a section. And the real test totals differ from the scouts' record (`changesets-logic` is 75 on master, not 73; the bridge suite 1678, not 1675). Not run: every line of the drill section, which only Revit can run; the commit commands. Nothing in the repository was changed by the dry run.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds option **A** of each. None needs an answer before the work starts.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | How far a drawn door or window may sit from its wall and still go into it | **A:** within half the wall's thickness of the wall's line, and — for a block — lying along the wall (within 5°). It is moved onto the wall's line. **B:** a wider reach (say the whole thickness) | **A.** It is the audit's rule (GHB-1). Ceiling: a door drawn further out than the wall's face is a named gap. A wall drawn in two pieces with the door in the gap between them has no wall under the door at all — see Risks, "Walls broken at openings" |
| F2 | Where the door stands along its wall | **A:** in the middle of what the block draws. A door block is usually inserted by its hinge; the middle of its leaf and swing is the middle of the opening. **B:** at the block's insertion point | **A.** With B every hinge-inserted door would sit half a leaf off. Ceiling: a block that also draws something beside the door (a tag, a long swing line) shifts the middle by half of that |
| F3 | The doors drawn as plain rectangles on a door layer (what Ghost reads today) | **A:** keep reading them, with the same half-thickness reach; they carry no angle, so Revit places them its own way round, as today. **B:** stop reading them — blocks only | **A.** The older samples and drill rows depend on them, and offices do draw doors as outlines. Ceiling: an outline says nothing about hinge or swing |
| F4 | Two door blocks on top of each other (a duplicate in the drawing) | **A:** both are filed; Revit decides, and the summary counts what it did — a warning it keeps ("identical instances in the same place"), or an element it removes at commit ("Placed N (1 deleted by Revit)"), or an error, which rolls the whole build back with Revit's reason. **B:** Sentinel names the second one as a duplicate and does not file it | **A.** It is the design's drill line, and the rule that Sentinel erases nothing on its own. Ceiling: if Revit answers a duplicate with an error, one stray duplicate block stops a whole build. Drill row B1-10 records which of the three Revit does; if it is the error, this decision comes back to the founder with B recommended |
| F5 | A door family that cannot be flipped the way its block is drawn (many window families have no hand flip) | **A:** it is placed in its wall as Revit placed it, and the summary names it: "hinge side not as drawn — its family could not be flipped that way; flip it by hand". **B:** nothing is built | **A.** One such family would otherwise stop every door of the drawing. Ceiling: that door is in the right wall at the right point, the wrong way round, until a person flips it |
| F6 | Photo Massing: the build was refused before anything was placed (the wrong model in front, a design option being edited, a workset missing), or Revit rolled it back | **A:** the review stays open, Build works again, the numbers the person corrected are kept, and the reason is in the message. **B:** the review closes on every outcome; the person runs Photo Massing again from the start | **A.** Reading the images again takes time, and the corrections would be lost. Ceiling: none known |
| F7 | Photo Massing: should the summary say how many elements are selected? | **A:** one line, "Selected: N element(s) — the massing just placed", to compare with "Placed: N" and with Revit's own selection count. **B:** select silently | **A.** It is the audit's test: "the count equals the selection" |
| F8 | A drawn door over a wall that was already in the model | **A:** a named gap, as today (the step-2 plan's F9 A: Ghost touches only its own elements). **B:** host it in the existing wall | **A.** Unchanged. B is a policy change the founder can ask for; the snap rule would then read the model's walls too |
| F9 | How a block says where the hinge is and which side the door swings to | **A:** by its own axes — the block's X axis runs from hinge to strike, and the door swings to its Y side — the way the sample's block is drawn. **B:** by reading the swing arc inside the block, whichever way the block was drawn | **A.** B is larger and belongs with sizing the door from the drawing (MA-2). Ceiling: an office whose door blocks are drawn another way round gets every door in the right wall at the right point, but hinged or swinging the other way — and the summary cannot know. Drill row B1-3 compares each placed door with the block drawn under it; the two calibration signs (E9) cover a family or a block library that reads the other way round as a whole |
| F10 | A window block's sill height | **A:** none is filed — a plan drawing gives none — so the window takes its type's own sill height. **B:** a sill height from the guideline | **A.** B needs a field the guideline does not have. Ceiling: every window sits at its type's default sill until a person sets it |

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The reader reads blocks from Revit's own import geometry, not from the drawing file | It works for a binary DWG and a DXF alike, and reads what Revit imported. Ceiling: it rests on how Revit shows an insert (UNSURE 1). If the drill shows Revit flattens blocks, the reader must parse the DXF's INSERTs itself — a finding that sends this task back to planning; the pure half (frame, centre, snap, axes) stays as it is |
| E2 | The direction travels as `place.Rotation` and `place.Mirrored`, not as `FlipFacing` / `FlipHand` | A flip is relative to how Revit first places the instance, which nobody knows before the instance exists. The executor reads the instance, then flips. The ledger records what the drawing said |
| E3 | `Rotation` with a flip is a 400; `Mirrored` needs `Rotation`; both only on a door or window create | Two ways to say one thing would let them disagree |
| E4 | With `Rotation`, a flip the family lacks is not an error; the explicit `FlipFacing` / `FlipHand` keep their refusal | F5. An agent that asks for a flip by name still gets it or a reason |
| E5 | What the summary says of a door's direction is measured after the commit and the recount (`ExecutionResult.Turned`) | Honest counts. A read that fails is recorded as unread; it never undoes a committed transaction |
| E6 | The snap is in Ghost's planner; the executor's host rule (1 mm) is unchanged | An agent's changeset is judged exactly as before; Ghost files a point that is already on the line |
| E7 | Half a wall's thickness is half its **type's** width | A wall drawn as one line has no measured thickness, and the type's width is what the wall will be |
| E8 | A block must run along its wall within 5°; a nearer wall wins over a farther one; two equally near is a person's decision; a point past a wall's end is not that wall's | The parallel test settles corners, where a hinge is often within half a thickness of the other wall. Sentinel never guesses a host |
| E9 | Two calibration signs, `PlacementGeometry.HandSign` and `FacingSign`, both +1 | Whether Revit's hand runs hinge to strike, and its facing points to the swing side, depends on the door family. Only the drill can say (UNSURE 5); the fix is one sign |
| E10 | A bridge that answers without a sent `Rotation` abandons the build (`GhostFiling.LostRotation`) | The executor places what the bridge returned. A bridge still on the old code drops the field and would place every door unturned, silently |
| E11 | The walk that reads walls and outlines is untouched; a block's own curves are not emitted | The proven path does not move. Ceiling, unchanged from today: a wall drawn inside a block is not read |
| E12 | A block's name is read where Revit gives one, and decides nothing | It is said in a gap's sentence. The row's type comes from the review, per layer, as for every point family |
| E13 | A block's layer is the insert's; with none, the layer of what it draws | UNSURE 2. The sample's window block has its lines on layer 0 to show which Revit gives |
| E14 | MAS-4's guard is inside `Emit()`, and the window's behaviour is checked in `ghost-p2-check` (constructed, never shown) | A guard only in the click handler could not be proven offline |
| E15 | A massing build Revit has not finished (Pending) closes the review | It may still land; offering Build again is the bug MAS-4 closes |
| E16 | The selection runs in the command's Completed handler, after the placement transaction, from `NewElements` still in the model | The same elements "Placed" counts. A refusal by Revit is one line of the summary |
| E17 | A column or furniture block is placed at the middle of what it draws, unhosted; its angle is not applied | GHB-1 is doors and windows. Before this plan such a block was not read at all. In Next |
| E18 | `Rotation` is 0 up to (not including) 360, to four decimals | One number for one direction; the bridge refuses 360 |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `WebApp/bridge/changesets-logic.mjs`, `changesets-logic.test.mjs` | 1 | `Rotation` and `Mirrored` on a door or window create, and their tests |
| `WebApp/bridge/mcp-server.mjs` | 1 | The tool's description |
| `SentinelAddin/GhostBuilder/PlacementGeometry.cs` | 2 | Pure: `Frame`, `BlockCentre`, `Snap`, `AxisOff`, `Axes`, `Opposes`, `Turn`, `TurnLines`, the two signs |
| `tools/promote-check/Blocks.cs` (new) | 2 | The geometry's checks |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 3 | `PlaceDto.Rotation`, `PlaceDto.Mirrored` |
| `SentinelAddin/GhostBuilder/GhostFiling.cs` | 3 | `Point` with a direction; `LostRotation` |
| `WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json` | 3 | The shared fixture's door is a mirrored block's |
| `tools/promote-check/Filing.cs` | 3 | The filing's checks, and the parity body |
| `demo/ghost-sample/make-sample.py` | 4 | `--ma1b`: the BLOCKS section, the INSERTs, the expected results |
| `demo/ghost-sample/sample-doors.dxf`, `sample-doors-planted.dxf`, `sample-doors-expected.json` (new, generated) | 4 | The drill's drawings and what each insert must become |
| `tools/promote-check/DoorSample.cs` (new) | 4 | The add-in's pure half over the drawing's numbers |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` | 5 | The flips; `ExecutionResult.Turned` |
| `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` | 5 | Review AI Proposals shows the lines |
| `tools/promote-check/Ma1bWiring.cs` (new) | 5–8 | The source scans |
| `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` | 6, 7 | `AddBlocks`, `GhostBlock`, `GhostElement.Block`; a comment |
| `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` | 6 | A layer of blocks only is a layer |
| `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` | 7 | The snap, the filing, the old-bridge refusal, the summary's lines |
| `SentinelAddin/Commands.GhostBuilder.cs` | 7 | The "Skipped" line's words |
| `SentinelAddin/GhostBuilder/MassingPlanner.cs` | 8 | Pure: `BuildKept`, the words |
| `SentinelAddin/UI/MassingReviewWindow.cs` | 8 | The one-build guard, `Reopen` |
| `SentinelAddin/Commands.Massing.cs` | 8 | Close or reopen; select and zoom |
| `tools/massing-check/Check.cs`, `tools/ghost-p2-check/Check.cs`, `ghost-p2-check.csproj` | 8 | MAS-4's checks |
| `tools/promote-check/Check.cs` | 2, 4, 5 | The calls |
| `demo/ghost-sample/README.md`, `ma1b-block-ruleset.json` (new) | 9 | The drill files named; the drill's BLOCK rule for doors |

---

## Tasks (in order: the contract — bridge, pure geometry, the add-in's DTO and filing; the drill drawing; the executor; the reader; the planner; MAS-4; then the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file. `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once.

### Task 1 — Bridge: a door or window create may carry the block's `Rotation` and `Mirrored`

**Files:**
- Modify `WebApp/bridge/changesets-logic.test.mjs` — the new fields' tests
- Modify `WebApp/bridge/changesets-logic.mjs` — `PLACE_KEPT`, `PLACE_FIELDS`, `checkPlace`
- Modify `WebApp/bridge/mcp-server.mjs` — the tool's description names the two fields

**Interfaces:** `place.Rotation` — a number of degrees, 0 up to (not including) 360: the plan direction of the drawn block's X axis, anticlockwise from +X. `place.Mirrored` — a boolean: the block is mirrored. Both on a `door` or `window` create only. `Mirrored` needs `Rotation`. `Rotation` with `FlipFacing` or `FlipHand` is a 400: they would say the same thing twice. Neither is a trust field: they are place fields, kept as posted, rebuilt by name like every other place field (item 8's rule C3) — a key of any other spelling is still listed under `ignored`.

- [ ] **Step 1: The failing tests.**

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
  it("FlipFacing and FlipHand are booleans on doors and windows", () => {
    status400(() => ok(door({ FlipFacing: "yes" })), /place\.FlipFacing must be true or false/);
    for (const b of [door, win]) for (const v of [true, false]) expect(ok(b({ FlipFacing: v, FlipHand: v })).place).toMatchObject({ FlipFacing: v, FlipHand: v });
  });
```

with

```js
  it("FlipFacing and FlipHand are booleans on doors and windows", () => {
    status400(() => ok(door({ FlipFacing: "yes" })), /place\.FlipFacing must be true or false/);
    for (const b of [door, win]) for (const v of [true, false]) expect(ok(b({ FlipFacing: v, FlipHand: v })).place).toMatchObject({ FlipFacing: v, FlipHand: v });
  });

  it("MA-1b: a door or window may carry a drawn block's Rotation (degrees, 0 up to 360) and Mirrored — never with a flip", () => {
    for (const b of [door, win]) {
      expect(ok(b({ Rotation: 0 })).place.Rotation).toBe(0);
      expect(ok(b({ Rotation: 225.5, Mirrored: true })).place).toMatchObject({ Rotation: 225.5, Mirrored: true });
      for (const r of [-1, 360, "90", NaN, null]) status400(() => ok(b({ Rotation: r })), /place\.Rotation must be a number of degrees from 0 up to \(not including\) 360/);
      status400(() => ok(b({ Rotation: 90, Mirrored: "yes" })), /place\.Mirrored must be true or false/);
      status400(() => ok(b({ Mirrored: true })), /place\.Mirrored needs place\.Rotation/);
      for (const f of ["FlipFacing", "FlipHand"])
        status400(() => ok(b({ Rotation: 90, [f]: false })), /place\.Rotation and place\.FlipFacing or place\.FlipHand say the same thing twice/);
    }
    status400(() => ok(roof({ Rotation: 90 })), /a roof takes no place\.Rotation/);
    status400(() => ok(wall({ place: { ...wall().place, Mirrored: true } })), /a wall takes no place\.Mirrored/);
    const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    status400(() => ok({ op: "retype", kind: "door", target: { unique_id: UID }, place: { FamilyName: "F", TypeName: "T", Rotation: 90 }, validate: { identity: { Class: "IfcDoor", Name: "D" } } }),
      /retype takes no place\.Rotation — only a create sets it/);
    // Item 8's rule holds: both are kept place fields, so neither is listed back as ignored.
    expect(validateChangeset(CS([door({ Rotation: 90, Mirrored: true })])).ignored).toEqual([]);
  });
```

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
      for (const f of ["SillHeight", "FlipFacing", "FlipHand", "Boundary", "Offset"]) status400(() => ok(b({ [f]: 1 })), new RegExp(`takes no place\\.${f}`));
```

with

```js
      for (const f of ["SillHeight", "FlipFacing", "FlipHand", "Rotation", "Mirrored", "Boundary", "Offset"]) status400(() => ok(b({ [f]: 1 })), new RegExp(`takes no place\\.${f}`));
```

- [ ] **Step 2: Run it, and see it fail.** From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs`. Expect `2 failed`: the new test (a posted `Rotation` is dropped and listed as ignored today, so `place.Rotation` is `undefined`), and "a column or furniture takes no sill, flip or outline" (a column's `Rotation` is not refused yet).

- [ ] **Step 3: The bridge keeps and checks the two fields.**

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
  "FamilyName", "Location", "SillHeight", "FlipFacing", "FlipHand", "Boundary", "BaseOffset", "Offset", "Mark", "Structural"];
```

with

```js
  "FamilyName", "Location", "SillHeight", "FlipFacing", "FlipHand", "Rotation", "Mirrored", "Boundary", "BaseOffset", "Offset", "Mark", "Structural"];
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
  SillHeight: ["window"], Boundary: ["roof", "ceiling"], BaseOffset: ["roof"], Offset: ["ceiling"],
```

with

```js
  SillHeight: ["window"], Boundary: ["roof", "ceiling"], BaseOffset: ["roof"], Offset: ["ceiling"],
  // MA-1b (GHB-1): a drawn block's direction — the plan angle of its X axis and whether it is mirrored. The add-in flips the
  // placed instance to that hinge side and swing side (ChangesetExecutor), and measures what Revit holds after the commit.
  Rotation: ["door", "window"], Mirrored: ["door", "window"],
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
  for (const f of ["Structural", "FlipFacing", "FlipHand"])
    if (place[f] !== undefined && typeof place[f] !== "boolean") throw err(400, `${at}: place.${f} must be true or false`);
```

with

```js
  for (const f of ["Structural", "FlipFacing", "FlipHand", "Mirrored"])
    if (place[f] !== undefined && typeof place[f] !== "boolean") throw err(400, `${at}: place.${f} must be true or false`);
  if (place.Rotation !== undefined) {
    if (!finite(place.Rotation) || place.Rotation < 0 || place.Rotation >= 360)
      throw err(400, `${at}: place.Rotation must be a number of degrees from 0 up to (not including) 360 — the plan direction of the drawn block's X axis`);
    if (place.FlipFacing !== undefined || place.FlipHand !== undefined)
      throw err(400, `${at}: place.Rotation and place.FlipFacing or place.FlipHand say the same thing twice — send the block's Rotation (and Mirrored), or the flips, not both`);
  }
  if (place.Mirrored !== undefined && place.Rotation === undefined)
    throw err(400, `${at}: place.Mirrored needs place.Rotation — a mirror is read about the block's own X axis`);
```

- [ ] **Step 4: The MCP tool says so.**

In `WebApp/bridge/mcp-server.mjs`, replace

```js
both: optional place.FlipFacing, place.FlipHand)
```

with

```js
both: optional place.FlipFacing, place.FlipHand — or, for an opening read from a drawn block, place.Rotation, the plan angle in degrees (0 up to 360) of the block's X axis, with optional place.Mirrored: the add-in then flips the instance to that hinge side and swing side, and neither flip may be sent with it)
```

- [ ] **Step 5: Run it, and see it pass.** From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs bridge/mcp-server.test.mjs`. Expect `Test Files  2 passed (2)` and `Tests  108 passed (108)` (`changesets-logic` 76, one more than master; `mcp-server` 32).

- [ ] **Step 6: Commit.**

```bash
git add WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-logic.test.mjs WebApp/bridge/mcp-server.mjs
git commit -F - <<'EOF'
feat(bridge): a door or window create may carry a drawn block's Rotation and Mirrored (MA-1b, GHB-1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 2 — The pure half of GHB-1: a block's frame, the wall it belongs to, the way it turns (offline)

**Files:**
- Create `tools/promote-check/Blocks.cs` — the checks
- Modify `tools/promote-check/Check.cs` — the call
- Modify `SentinelAddin/GhostBuilder/PlacementGeometry.cs` — the geometry

**Interfaces** (all in `PlacementGeometry`, millimetres and degrees, plan only, no Revit):
- `Frame(bxX, bxY, byX, byY)` → `(RotationDeg, Mirrored)`: a block insert's direction from its two axes as its transform gives them. `RotationDeg` is the plan angle of its X axis, 0 up to 360, to four decimals. `Mirrored` is true when the axes are left-handed.
- `BlockCentre(ox, oy, rotationDeg, drawn)` → `(X, Y)`: the middle of what the block draws, measured along its X axis from the insertion point — the middle of the opening when the block is inserted by its hinge. No drawn point: the insertion point.
- `Snap(walls, halfMm, level, x, y, axisDeg, out why)` → `(Wall, X, Y)?`: the one wall whose line passes within half its thickness (+ `HostTolMm`) of the point, beside the wall and not past its end, and — when `axisDeg` is given — along that axis within `ParallelTolDeg`; with the point moved onto the wall's line. None, a block across its wall, or two equally near: null and the reason in words.
- `AxisOff(aDeg, bDeg)` → the angle between two lines, 0 to 90.
- `Axes(rotationDeg, mirrored)` → `(Hx, Hy, Fx, Fy)`: the direction the placed instance's hand must have (the block's X axis: hinge to strike) and its facing (the block's Y axis: the side the leaf swings to), each multiplied by its calibration sign `HandSign`, `FacingSign`.
- `Opposes(ox, oy, tx, ty)` → the instance's direction points against the target's (a flip is needed).
- `Turn(label, rotationDeg, mirrored, handX, handY, facingX, facingY)` → `(Label, OffDeg, Hand, Facing)`: one placed instance against its block. `TurnLines(turned)` → the summary's lines.

- [ ] **Step 1: The failing check.**

Create `tools/promote-check/Blocks.cs`:

```csharp
#nullable disable
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 20. MA-1b (GHB-1): a DWG door or window block — its frame, the wall it belongs to, the way it turns (pure) ──────
    static void DoorBlockChecks()
    {
        Console.WriteLine("\nMA-1b block frame (PlacementGeometry.Frame, BlockCentre)");
        // A DXF INSERT's two axes in plan: the block's X and Y, scaled, then turned by its rotation.
        (double RotationDeg, bool Mirrored) F(double rot, double sx = 1, double sy = 1)
        {
            double a = rot * Math.PI / 180, c = Math.Cos(a), s = Math.Sin(a);
            return PlacementGeometry.Frame(c * sx, s * sx, -s * sy, c * sy);
        }
        bool Is((double RotationDeg, bool Mirrored) f, double rot, bool mirrored) => Math.Abs(f.RotationDeg - rot) < 1e-4 && f.Mirrored == mirrored;
        Ok(Is(F(0), 0, false) && Is(F(30), 30, false) && Is(F(225), 225, false), "an insert turned 0, 30 or 225 degrees reads that angle, not mirrored");
        Ok(Is(F(60, -1), 240, true), "an x scale of -1 at 60 degrees reads 240 degrees, mirrored (its X axis points the other way)");
        Ok(Is(F(165, 1, -1), 165, true), "a y scale of -1 at 165 degrees reads 165 degrees, mirrored");
        Ok(Is(F(10, -1, -1), 190, false), "both scales -1 is a half turn, not a mirror");
        Ok(F(359.99999999).RotationDeg == 0 && F(-0.00000001).RotationDeg == 0, "an angle a rounding away from 360 reads 0, never 360 (the bridge takes 0 up to 360)");

        var c0 = PlacementGeometry.BlockCentre(1000, 2000, 0, new[] { (1000.0, 2000.0), (1900.0, 2000.0), (1000.0, 2900.0) });
        Ok(Math.Abs(c0.X - 1450) < 1e-6 && Math.Abs(c0.Y - 2000) < 1e-6, "a door block inserted by its hinge: the middle of what it draws along its X axis is the middle of the opening");
        var c90 = PlacementGeometry.BlockCentre(0, 0, 90, new[] { (0.0, 0.0), (0.0, 900.0), (-900.0, 0.0) });
        Ok(Math.Abs(c90.X) < 1e-6 && Math.Abs(c90.Y - 450) < 1e-6, "the same block turned 90 degrees: the middle is 450 up its wall");
        Ok(PlacementGeometry.BlockCentre(5, 7, 30, null) == (5, 7) && PlacementGeometry.BlockCentre(5, 7, 30, new (double, double)[0]) == (5, 7),
           "a block that draws nothing stands at its insertion point");

        Console.WriteLine("\nMA-1b the wall a block belongs to (PlacementGeometry.Snap)");
        var walls = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>
        {
            ("W1", "L1", 0, 0, 4000, 0), ("W2", "L1", 4000, 0, 4000, 4000), ("W3", "L2", 0, 0, 4000, 0),
        };
        var half = new List<double> { 100, 100, 100 };
        string S(double x, double y, double? axis, string level = "L1", List<(string, string, double, double, double, double)> w = null, List<double> h = null)
        {
            var s = PlacementGeometry.Snap(w ?? walls, h ?? half, level, x, y, axis, out var why);
            return s == null ? why : $"{(w ?? walls)[s.Value.Wall].Item1} ({s.Value.X:0.###}, {s.Value.Y:0.###})";
        }
        Ok(S(2000, 60, 0) == "W1 (2000, 0)", "a block 60 mm off a 200 mm wall's line is moved onto the line");
        Ok(S(2000, 101, 0) == "W1 (2000, 0)" && S(2000, 102, 0) == "no straight wall of this build on L1 passes within half its thickness of (2000, 102)",
           "half the wall's thickness plus 1 mm is the reach: 101 mm snaps, 102 mm is no wall, in words");
        Ok(S(2000, 60, 180) == "W1 (2000, 0)" && S(2000, 60, 4) == "W1 (2000, 0)", "a block turned a half turn, or 4 degrees off, is still along its wall");
        Ok(S(2000, 60, 6) == "the block at (2000, 60) is turned 6° from W1 — a door or window lies along its wall (within 5°)"
           && S(2000, 60, 90).StartsWith("the block at (2000, 60) is turned 90° from W1"), "6 degrees off, or across the wall: a named gap, never a guess");
        Ok(S(2000, 60, null) == "W1 (2000, 0)", "a drawn outline has no axis: it snaps by distance alone");
        Ok(S(2000, 60, 0, "l2") == "W3 (2000, 0)" && S(2000, 60, 0, "L3").StartsWith("no straight wall of this build on L3"), "only walls of the build level count; level names compare as Revit's do");
        Ok(S(3950, 50, 0) == "W1 (3950, 0)" && S(3950, 50, 90) == "W2 (4000, 50)", "at a corner the block's axis picks its wall");
        Ok(S(3950, 50, null) == "2 walls of this build on L1 are equally near (3950, 50): W1, W2 — a person decides the host"
           && S(3950, 20, null) == "W1 (3950, 0)", "an outline at a corner: the nearer wall, or — equally near — a person decides");
        Ok(S(4090, 0, 0, "L2") == "no straight wall of this build on L2 passes within half its thickness of (4090, 0)", "a point past the wall's end is not that wall's opening");
        var twice = new List<(string, string, double, double, double, double)> { ("W1", "L1", 0, 0, 4000, 0), ("W1 again", "L1", 0, 0, 4000, 0) };
        Ok(S(2000, 0, 0, w: twice, h: new List<double> { 100, 100 }) == "2 walls of this build on L1 are equally near (2000, 0): W1, W1 again — a person decides the host",
           "two walls drawn on top of each other: named, a person decides");
        Ok(S(0, 0, 0, w: new List<(string, string, double, double, double, double)>(), h: new List<double>()).StartsWith("no straight wall of this build"), "no wall at all: a reason, no throw");
        Ok(S(2000, 149, 0, h: new List<double> { 150, 100, 100 }) == "W1 (2000, 0)", "a thicker wall reaches further: each wall's own half thickness");

        Console.WriteLine("\nMA-1b the way a block turns (PlacementGeometry.Axes, Opposes, AxisOff, Turn, TurnLines)");
        bool Near((double Hx, double Hy, double Fx, double Fy) a, double hx, double hy, double fx, double fy) =>
            Math.Abs(a.Hx - hx) + Math.Abs(a.Hy - hy) + Math.Abs(a.Fx - fx) + Math.Abs(a.Fy - fy) < 1e-9;
        Ok(PlacementGeometry.HandSign == 1 && PlacementGeometry.FacingSign == 1, "the two calibration signs are +1 until drill MA1b says otherwise (these checks assume it)");
        Ok(Near(PlacementGeometry.Axes(0, false), 1, 0, 0, 1) && Near(PlacementGeometry.Axes(90, false), 0, 1, -1, 0),
           "hand runs along the block's X axis; facing is its Y axis, to the left of it");
        Ok(Near(PlacementGeometry.Axes(0, true), 1, 0, 0, -1), "a mirrored block swings to the other side: its Y axis is to the right");
        Ok(PlacementGeometry.Opposes(-1, 0, 1, 0) && !PlacementGeometry.Opposes(1, 0, 1, 0) && !PlacementGeometry.Opposes(0, 1, 1, 0),
           "a direction against the target's needs a flip; with it, or square to it, none");
        Ok(PlacementGeometry.AxisOff(10, 190) == 0 && PlacementGeometry.AxisOff(0, 91) == 89 && PlacementGeometry.AxisOff(359, 1) == 2 && PlacementGeometry.AxisOff(-90, 90) == 0,
           "the angle between two lines is 0 to 90, whatever way each points");
        double c30 = Math.Cos(Math.PI / 6), s30 = Math.Sin(Math.PI / 6);
        var good = PlacementGeometry.Turn("door \"A-DOOR #1\"", 30, false, c30, s30, -s30, c30);
        var wrongHand = PlacementGeometry.Turn("door \"A-DOOR #2\"", 30, false, -c30, -s30, -s30, c30);
        var wrongBoth = PlacementGeometry.Turn("window \"A-GLAZ #1\"", 30, true, -c30, -s30, -s30, c30);
        Ok(good.OffDeg < 1e-9 && good.Hand && good.Facing && wrongHand.OffDeg < 1e-9 && !wrongHand.Hand && wrongHand.Facing && !wrongBoth.Hand && !wrongBoth.Facing,
           "a placed instance against its block: the angle between them, and whether hinge side and swing side are as drawn");
        Ok(PlacementGeometry.Turn("d", 30, false, 1, 0, 0, 1).OffDeg is > 29.999 and < 30.001, "an instance 30 degrees off its block reads 30");
        var lines = PlacementGeometry.TurnLines(new[] { good, wrongHand, wrongBoth, ("door \"A-DOOR #4\"", double.NaN, false, false) });
        Ok(lines.Count == 4
           && lines[0] == "Blocks: 4 door(s) and window(s) placed from drawn blocks — largest angle between one and its block 0.0°; hinge side and swing side as drawn on 1 of 4."
           && lines[1] == "  door \"A-DOOR #2\": hinge side not as drawn — its family could not be flipped that way; flip it by hand."
           && lines[2] == "  window \"A-GLAZ #1\": hinge side and swing side not as drawn — its family could not be flipped that way; flip it by hand."
           && lines[3] == "  door \"A-DOOR #4\": its direction could not be read back from Revit — compare it with the drawing.",
           "the summary: one line for the build, and one for each instance that is not as drawn or could not be read");
        Ok(PlacementGeometry.TurnLines(null).Count == 0 && PlacementGeometry.TurnLines(new (string, double, bool, bool)[0]).Count == 0, "a build with no block says nothing");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        FilingChecks();
```

with

```csharp
        FilingChecks();
        DoorBlockChecks();
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`. Expect a build failure: `error CS0117: 'PlacementGeometry' does not contain a definition for 'Frame'` (and the same for `BlockCentre`, `Snap`, `Axes`, `Opposes`, `AxisOff`, `Turn`, `TurnLines`, `HandSign`, `FacingSign`).

- [ ] **Step 3: The geometry.**

In `SentinelAddin/GhostBuilder/PlacementGeometry.cs`, replace

```csharp
    /// <summary>Distance (mm) from (x, y) to the segment — clamped to its ends, so a point past a wall's end is not on it.</summary>
```

with

```csharp
    // ── MA-1b (GHB-1): a DWG door or window block — its frame, the wall it belongs to, the way it turns ───────────────

    /// <summary>GHB-1: how far a block's X axis may turn from a wall's line and still be that wall's opening (degrees).</summary>
    public const double ParallelTolDeg = 5.0;

    /// <summary>GHB-1 calibration, one knob each. +1 = Revit's HandOrientation runs the way the block's X axis does (hinge to
    /// strike), and its FacingOrientation points to the side the block's Y axis does (the side the leaf swings to). Drill MA1b
    /// (row B1-3) compares each placed door with the block drawn under it: a door family that reads the other way round is one
    /// sign here, not a redesign.</summary>
    public const int HandSign = 1, FacingSign = 1;

    /// <summary>A block insert's direction from its two axes in plan, as its transform gives them (any length): the plan
    /// angle of its X axis in degrees, 0 up to (not including) 360, to four decimals — what place.Rotation carries — and
    /// whether the block is mirrored (its axes are left-handed: a negative X or Y scale, not both).</summary>
    public static (double RotationDeg, bool Mirrored) Frame(double bxX, double bxY, double byX, double byY)
    {
        double deg = Math.Round(Math.Atan2(bxY, bxX) * 180 / Math.PI, 4);
        if (deg < 0) deg += 360;
        if (deg >= 360 || deg == 0) deg = 0; // 359.99999… rounds up to 360; and never a negative zero
        return (deg, bxX * byY - bxY * byX < 0);
    }

    /// <summary>The middle of what a block draws, measured along its X axis from its insertion point (ox, oy): a door block
    /// inserted by its hinge draws from the hinge to the strike, so this is the middle of the opening — where Revit's door
    /// family has its origin. A block that draws nothing stands at its insertion point.</summary>
    public static (double X, double Y) BlockCentre(double ox, double oy, double rotationDeg, IEnumerable<(double X, double Y)> drawn)
    {
        double a = rotationDeg * Math.PI / 180, ux = Math.Cos(a), uy = Math.Sin(a), min = double.MaxValue, max = double.MinValue;
        foreach (var p in drawn ?? Enumerable.Empty<(double X, double Y)>())
        {
            double t = (p.X - ox) * ux + (p.Y - oy) * uy;
            min = Math.Min(min, t);
            max = Math.Max(max, t);
        }
        if (min > max) return (ox, oy);
        double mid = (min + max) / 2;
        return (ox + mid * ux, oy + mid * uy);
    }

    /// <summary>The angle between two lines in plan (degrees, 0 to 90), whatever way each points.</summary>
    public static double AxisOff(double aDeg, double bDeg)
    {
        double d = Math.Abs(aDeg - bDeg) % 180;
        return d > 90 ? 180 - d : d;
    }

    /// <summary>GHB-1: the wall a door or window at (x, y) belongs to — the one wall on <paramref name="level"/> whose line
    /// passes within half its thickness (<paramref name="halfMm"/>, one per wall, plus HostTolMm) of the point, with the
    /// point beside the wall and not past its end, and, when the opening is a block (<paramref name="axisDeg"/>, its X axis),
    /// running along that axis within ParallelTolDeg. Returns the wall's index and the point moved onto its line. No such
    /// wall, a block across its wall, or two walls equally near: null and <paramref name="why"/> in words — never a guess.
    /// A nearer wall wins over a farther one (a corner).</summary>
    public static (int Wall, double X, double Y)? Snap(IReadOnlyList<(string Label, string Level, double X0, double Y0, double X1, double Y1)> walls,
                                                       IReadOnlyList<double> halfMm, string level, double x, double y, double? axisDeg, out string why)
    {
        string at = $"({Mm(x)}, {Mm(y)})";
        var near = new List<(int I, double D, double Px, double Py)>();
        for (int i = 0; i < walls.Count; i++)
        {
            var w = walls[i];
            if (!string.Equals(w.Level, level, StringComparison.OrdinalIgnoreCase)) continue;
            double dx = w.X1 - w.X0, dy = w.Y1 - w.Y0, len2 = dx * dx + dy * dy;
            if (len2 == 0) continue;
            double t = ((x - w.X0) * dx + (y - w.Y0) * dy) / len2;
            if (t < 0 || t > 1) continue; // past the wall's end: not this wall's opening
            double px = w.X0 + t * dx, py = w.Y0 + t * dy, d = Math.Sqrt((px - x) * (px - x) + (py - y) * (py - y));
            if (d <= halfMm[i] + HostTolMm) near.Add((i, d, px, py));
        }
        if (near.Count == 0)
        {
            why = $"no straight wall of this build on {level} passes within half its thickness of {at}";
            return null;
        }
        var along = near.OrderBy(c => c.D).ToList();
        if (axisDeg is double axis)
        {
            double Off(int i) => AxisOff(Math.Atan2(walls[i].Y1 - walls[i].Y0, walls[i].X1 - walls[i].X0) * 180 / Math.PI, axis);
            int nearest = along[0].I;
            along = along.Where(c => Off(c.I) <= ParallelTolDeg).ToList();
            if (along.Count == 0)
            {
                why = $"the block at {at} is turned {Mm(Off(nearest))}° from {walls[nearest].Label} — a door or window lies along its wall (within {Mm(ParallelTolDeg)}°)";
                return null;
            }
        }
        var ties = along.Where(c => c.D - along[0].D <= HostTolMm).ToList();
        if (ties.Count > 1)
        {
            why = $"{ties.Count} walls of this build on {level} are equally near {at}: {string.Join(", ", ties.Select(c => walls[c.I].Label))} — a person decides the host";
            return null;
        }
        why = null;
        return (along[0].I, along[0].Px, along[0].Py);
    }

    /// <summary>GHB-1: the directions a door or window placed from a block must have — its hand (Hx, Hy): the block's X axis,
    /// hinge to strike; its facing (Fx, Fy): the block's Y axis, the side the leaf swings to (to the left of X, or to the right
    /// when mirrored). Each is multiplied by its calibration sign.</summary>
    public static (double Hx, double Hy, double Fx, double Fy) Axes(double rotationDeg, bool mirrored)
    {
        double a = rotationDeg * Math.PI / 180, hx = Math.Cos(a), hy = Math.Sin(a), side = mirrored ? -1 : 1;
        return (HandSign * hx, HandSign * hy, FacingSign * side * -hy, FacingSign * side * hx);
    }

    /// <summary>Whether a direction (ox, oy) points against the target (tx, ty) — the flip test. Square to it is not against it.</summary>
    public static bool Opposes(double ox, double oy, double tx, double ty) => ox * tx + oy * ty < 0;

    /// <summary>One placed door or window against the block it came from: the angle between its hand line and the block's X
    /// axis (0 to 90 degrees), and whether its hinge side (hand) and swing side (facing) are as drawn.</summary>
    public static (string Label, double OffDeg, bool Hand, bool Facing) Turn(string label, double rotationDeg, bool mirrored,
                                                                            double handX, double handY, double facingX, double facingY)
    {
        var (hx, hy, fx, fy) = Axes(rotationDeg, mirrored);
        return (label, AxisOff(Math.Atan2(handY, handX) * 180 / Math.PI, rotationDeg), !Opposes(handX, handY, hx, hy), !Opposes(facingX, facingY, fx, fy));
    }

    /// <summary>The summary's lines for the doors and windows a build placed from blocks: one for the build — how many, the
    /// largest angle between one and its block, how many have hinge side and swing side as drawn — then one for each that
    /// is not as drawn (its family has no such flip) or could not be read back (OffDeg NaN). Empty with no block.</summary>
    public static List<string> TurnLines(IReadOnlyList<(string Label, double OffDeg, bool Hand, bool Facing)> turned)
    {
        var lines = new List<string>();
        if (turned == null || turned.Count == 0) return lines;
        var read = turned.Where(t => !double.IsNaN(t.OffDeg)).ToList();
        double worst = read.Count == 0 ? 0 : read.Max(t => t.OffDeg);
        lines.Add($"Blocks: {turned.Count} door(s) and window(s) placed from drawn blocks — largest angle between one and its block " +
                  $"{worst.ToString("0.0", CultureInfo.InvariantCulture)}°; hinge side and swing side as drawn on {read.Count(t => t.Hand && t.Facing)} of {turned.Count}.");
        foreach (var t in turned)
        {
            if (double.IsNaN(t.OffDeg)) lines.Add($"  {t.Label}: its direction could not be read back from Revit — compare it with the drawing.");
            else if (!(t.Hand && t.Facing))
                lines.Add($"  {t.Label}: {(t.Hand ? "swing side" : t.Facing ? "hinge side" : "hinge side and swing side")} not as drawn — its family could not be flipped that way; flip it by hand.");
        }
        return lines;
    }

    /// <summary>Distance (mm) from (x, y) to the segment — clamped to its ends, so a point past a wall's end is not on it.</summary>
```

- [ ] **Step 4: Run it, and see it pass.** `dotnet run --project tools/promote-check`: expect `424/424 checks pass` (master `395`, plus 29). Then both builds — `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026` — at `0 Error(s)`.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/PlacementGeometry.cs tools/promote-check/Blocks.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(ghost): the pure half of GHB-1 - a block's frame, the wall it belongs to within half its thickness, the way it turns

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 3 — The add-in's DTO and Ghost's filing carry the block's direction; one shared fixture

**Files:**
- Modify `tools/promote-check/Filing.cs` — the checks, and the parity body
- Modify `WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json` — the fixture's door is a block's door
- Modify `SentinelAddin/Coordination/ChangesetClient.cs` — `PlaceDto.Rotation`, `PlaceDto.Mirrored`
- Modify `SentinelAddin/GhostBuilder/GhostFiling.cs` — `Point` takes them; `LostRotation`

**Interfaces:**
- `PlaceDto.Rotation` (`double?`), `PlaceDto.Mirrored` (`bool?`) — name for name with the bridge's `PLACE_KEPT` (Task 1).
- `GhostFiling.Point(kind, layer, n, family, typeName, level, x, y, levelMm, rotationDeg = null, mirrored = false)` — a block's door or window is filed with `Rotation`, and with `Mirrored` only when it is true; an outline's with neither; never a flip.
- `GhostFiling.LostRotation(sent, kept)` → true when the bridge's answer does not carry a `Rotation` (or `Mirrored`) that was sent: a bridge still on the old code drops the field, and the doors would be placed unturned.

- [ ] **Step 1: The failing check.**

In `tools/promote-check/Filing.cs`, replace

```csharp
        var local = GhostFiling.Local("Ghost Builder · plan · Level 1", chunks[2]);
```

with

```csharp
        // MA-1b (GHB-1): a block's door or window carries the block's direction; a drawn outline's carries none.
        var turned = GhostFiling.Point("door", "A-DOOR", 1, "F", "T", "Level 1", 0, 0, 0, 240, true).Place;
        var straightOn = GhostFiling.Point("window", "A-GLAZ", 1, "F", "T", "Level 1", 0, 0, 0, 90).Place;
        var outline = GhostFiling.Point("door", "A-DOOR", 2, "F", "T", "Level 1", 0, 0, 0).Place;
        Ok(turned.Rotation == 240 && turned.Mirrored == true && straightOn.Rotation == 90 && straightOn.Mirrored == null
           && outline.Rotation == null && outline.Mirrored == null && turned.FlipFacing == null && turned.FlipHand == null,
           "a block's door or window is filed with place.Rotation, and Mirrored only when it is mirrored; an outline's with neither; never a flip");
        var sent = new List<ChangesetElementDto>
        {
            GhostFiling.Point("door", "A-DOOR", 1, "F", "T", "Level 1", 0, 0, 0, 240, true),
            GhostFiling.Point("door", "A-DOOR", 2, "F", "T", "Level 1", 0, 0, 0),
        };
        List<ChangesetElementDto> Back() => JsonSerializer.Deserialize<List<ChangesetElementDto>>(JsonSerializer.Serialize(sent, ChangesetClient.WriteJson));
        var oldBridge = Back();
        oldBridge[0].Place.Rotation = null;
        oldBridge[0].Place.Mirrored = null;
        var unmirrored = Back();
        unmirrored[0].Place.Mirrored = null;
        Ok(!GhostFiling.LostRotation(sent, Back()) && GhostFiling.LostRotation(sent, oldBridge) && GhostFiling.LostRotation(sent, unmirrored),
           "a bridge that answers without a sent Rotation or Mirrored (one still on the old code) is seen before anything is placed");

        var local = GhostFiling.Local("Ghost Builder · plan · Level 1", chunks[2]);
```

In `tools/promote-check/Filing.cs`, replace

```csharp
            GhostFiling.Point("door", "A-DOOR", 1, "M_Single-Flush", "0915 x 2134mm", "Level 1", 6450, 0, 0),
            GhostFiling.Point("window", "A-GLAZ", 1, "M_Fixed", "0915 x 1220mm", "Level 1", 10000, 3500, 0),
```

with

```csharp
            GhostFiling.Point("door", "A-DOOR", 1, "M_Single-Flush", "0915 x 2134mm", "Level 1", 6450, 0, 0, 240, true), // MA-1b: a mirrored block's door
            GhostFiling.Point("window", "A-GLAZ", 1, "M_Fixed", "0915 x 1220mm", "Level 1", 10000, 3500, 0),
```

In `WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json`, replace

```json
      "place": { "TypeName": "0915 x 2134mm", "LevelName": "Level 1", "FamilyName": "M_Single-Flush", "Location": [6450, 0, 0] },
```

with

```json
      "place": { "TypeName": "0915 x 2134mm", "LevelName": "Level 1", "FamilyName": "M_Single-Flush", "Location": [6450, 0, 0],
                 "Rotation": 240, "Mirrored": true },
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`. Expect a build failure: `error CS1501: No overload for method 'Point' takes 11 arguments` (and `'PlaceDto' does not contain a definition for 'Rotation'`, `'GhostFiling' does not contain a definition for 'LostRotation'`).

- [ ] **Step 3: The DTO.**

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    [JsonPropertyName("FlipHand")] public bool? FlipHand { get; set; }
```

with

```csharp
    [JsonPropertyName("FlipHand")] public bool? FlipHand { get; set; }
    // create (MA-1b, GHB-1): a door or window read from a drawn block — the plan angle of the block's X axis (degrees, 0 up to
    // 360) and whether it is mirrored. The executor flips the instance to that hinge side and swing side; never sent with a flip.
    [JsonPropertyName("Rotation")] public double? Rotation { get; set; }
    [JsonPropertyName("Mirrored")] public bool? Mirrored { get; set; }
```

- [ ] **Step 4: The filing.**

In `SentinelAddin/GhostBuilder/GhostFiling.cs`, replace

```csharp
        /// <summary>A door, window, column or furniture at (x, y) on its level (z = the level's elevation): a door or window is
        /// hosted by the one wall under the point, a column or furniture stands unhosted.</summary>
        public static ChangesetElementDto Point(string kind, string layer, int n, string family, string typeName, string level,
                                                double x, double y, double levelMm) =>
            Create(kind, layer, n, null, new PlaceDto { FamilyName = family, TypeName = typeName, LevelName = level, Location = new[] { x, y, levelMm } });
```

with

```csharp
        /// <summary>A door, window, column or furniture at (x, y) on its level (z = the level's elevation): a door or window is
        /// hosted by the one wall under the point, a column or furniture stands unhosted. MA-1b (GHB-1): a door or window read
        /// from a drawn block carries the block's direction (<paramref name="rotationDeg"/>, PlacementGeometry.Frame's) and,
        /// only when it is, that it is mirrored; a drawn outline's carries neither.</summary>
        public static ChangesetElementDto Point(string kind, string layer, int n, string family, string typeName, string level,
                                                double x, double y, double levelMm, double? rotationDeg = null, bool mirrored = false) =>
            Create(kind, layer, n, null, new PlaceDto
            {
                FamilyName = family, TypeName = typeName, LevelName = level, Location = new[] { x, y, levelMm },
                Rotation = rotationDeg, Mirrored = rotationDeg != null && mirrored ? true : (bool?)null,
            });

        /// <summary>MA-1b (GHB-1): whether the bridge's answer lost a block's direction — an element sent with place.Rotation
        /// that came back without it, with another angle, or with another Mirrored. A bridge still on the code before MA-1b
        /// drops both fields ("ignored: not a field this bridge keeps"), and the executor, which places what the bridge
        /// returned, would place every such door unturned. Ghost's planner refuses the build instead.</summary>
        public static bool LostRotation(IReadOnlyList<ChangesetElementDto> sent, IReadOnlyList<ChangesetElementDto> kept) =>
            Enumerable.Range(0, Math.Min(sent.Count, kept.Count)).Any(i => sent[i].Place?.Rotation is double r
                && !(kept[i].Place?.Rotation is double k && Math.Abs(k - r) < 1e-6 && (kept[i].Place.Mirrored == true) == (sent[i].Place.Mirrored == true)));
```

- [ ] **Step 5: Run it, and see it pass.** `dotnet run --project tools/promote-check`: expect `426/426 checks pass`. From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs` — `76 passed` (the fixture test reads the new door). `dotnet run --project tools/session-check`: `47/47` (it compiles `ChangesetClient.cs`). Both builds at `0 Error(s)`.

- [ ] **Step 6: Commit.**

```bash
git add SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/GhostBuilder/GhostFiling.cs tools/promote-check/Filing.cs WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json
git commit -F - <<'EOF'
feat(ghost): PlaceDto and Ghost's filing carry a block's Rotation and Mirrored; a bridge that drops them is seen (MA-1b, GHB-1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 4 — The drill drawing: walls at known angles, a door block on each, and the expected results as data

**Files:**
- Create `tools/promote-check/DoorSample.cs` — the add-in's pure half run over the drawing's own numbers
- Modify `tools/promote-check/Check.cs` — the call
- Modify `demo/ghost-sample/make-sample.py` — `--ma1b`, `--ma1b --plant`; a BLOCKS section and INSERT entities in the DXF writer
- Create (by running the script) `demo/ghost-sample/sample-doors.dxf`, `demo/ghost-sample/sample-doors-planted.dxf`, `demo/ghost-sample/sample-doors-expected.json`

**What the drawing holds.** Eleven free-standing walls, each one line 4,000 mm long (typed 200 mm thick in the review), on a 7,000 mm grid that starts at (40000, 40000) — clear of what the drill model already holds. The first ten are at 0°, 15°, 30°, 45°, 60°, 90°, 120°, 135°, 150° and 165°. On each sits one `DOOR-900` block on layer `A-DOOR`, drawn hinge at its insertion point: the leaf open along the block's +Y, the swing arc from the strike to the open leaf — so the block's X axis runs hinge to strike, +Y is the side it swings to, and the middle of what it draws along X is the middle of the opening. Doors 4 and 8 are turned a half turn against their wall's direction; doors 5 and 7 are mirrored by an x scale of −1, door 10 by a y scale of −1; door 3 sits 60 mm and door 7 80 mm off the wall's centre line (inside half the thickness). The eleventh wall carries one `WIN-1200` block on layer `A-GLAZ`, whose own lines are on layer `0` (the common CAD habit — UNSURE 2). One more `DOOR-900` stands at the grid's twelfth spot, with no wall near. `--plant` adds a second insert on top of door 1: the planted duplicate.

- [ ] **Step 1: The failing check.**

Create `tools/promote-check/DoorSample.cs`:

```csharp
#nullable disable
using System.Text.Json;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 21. MA-1b drill data: the reader's pure half over make-sample.py --ma1b's own numbers ───────────────────────────
    // The script computes what each INSERT must become; this computes it again with the add-in's code (Frame, BlockCentre,
    // Snap, Axes) from the INSERT's raw values. Two independent workings of one drawing; drill MA1b compares Revit with both.
    static void DoorSampleChecks()
    {
        Console.WriteLine("\nMA-1b drill data (demo/ghost-sample/sample-doors-expected.json, make-sample.py --ma1b)");
        var path = Repo("demo", "ghost-sample", "sample-doors-expected.json");
        Ok(File.Exists(path), "the expected results are written beside the drawing");
        if (!File.Exists(path)) return;
        var doc = JsonDocument.Parse(File.ReadAllText(path)).RootElement;
        double half = doc.GetProperty("wall_thickness_mm").GetDouble() / 2;
        var walls = doc.GetProperty("walls").EnumerateArray().Select(w => ("wall " + w.GetProperty("n").GetInt32(), "L",
            w.GetProperty("start")[0].GetDouble(), w.GetProperty("start")[1].GetDouble(), w.GetProperty("end")[0].GetDouble(), w.GetProperty("end")[1].GetDouble())).ToList();
        var halves = walls.Select(_ => half).ToList();
        var blocks = doc.GetProperty("blocks").EnumerateArray().ToDictionary(b => b.GetProperty("name").GetString(), b => b);
        bool SameAngle(double a, double b) => Math.Abs(((a - b) % 360 + 540) % 360 - 180) < 0.001;

        // One INSERT as the extractor's pure half reads it: its axes from rotation and scale, the middle of what its block
        // draws, the wall that middle belongs to.
        (int Wall, double X, double Y, double Rot, bool Mirrored, string Why) Read(JsonElement b)
        {
            double a = b.GetProperty("dxf_rotation").GetDouble() * Math.PI / 180, sx = b.GetProperty("x_scale").GetDouble(), sy = b.GetProperty("y_scale").GetDouble();
            double ox = b.GetProperty("insert")[0].GetDouble(), oy = b.GetProperty("insert")[1].GetDouble();
            (double X, double Y) World(double bx, double by) =>
                (ox + Math.Cos(a) * sx * bx - Math.Sin(a) * sy * by, oy + Math.Sin(a) * sx * bx + Math.Cos(a) * sy * by);
            var (rot, mirrored) = PlacementGeometry.Frame(Math.Cos(a) * sx, Math.Sin(a) * sx, -Math.Sin(a) * sy, Math.Cos(a) * sy);
            var drawn = blocks[b.GetProperty("block").GetString()].GetProperty("drawn").EnumerateArray().Select(p => World(p[0].GetDouble(), p[1].GetDouble())).ToList();
            var c = PlacementGeometry.BlockCentre(ox, oy, rot, drawn);
            var s = PlacementGeometry.Snap(walls, halves, "L", c.X, c.Y, rot, out var why);
            return (s?.Wall ?? -1, s?.X ?? 0, s?.Y ?? 0, rot, mirrored, why);
        }
        bool AsExpected(JsonElement b)
        {
            var r = Read(b);
            var axes = PlacementGeometry.Axes(r.Rot, r.Mirrored);
            return r.Wall == b.GetProperty("wall").GetInt32() - 1
                && Math.Abs(r.X - b.GetProperty("at")[0].GetDouble()) < 0.01 && Math.Abs(r.Y - b.GetProperty("at")[1].GetDouble()) < 0.01
                && SameAngle(r.Rot, b.GetProperty("rotation").GetDouble()) && r.Mirrored == b.GetProperty("mirrored").GetBoolean()
                && SameAngle(Math.Atan2(axes.Hy, axes.Hx) * 180 / Math.PI, b.GetProperty("hinge_to_strike_deg").GetDouble())
                && SameAngle(Math.Atan2(axes.Fy, axes.Fx) * 180 / Math.PI, b.GetProperty("swing_side_deg").GetDouble());
        }

        var doors = doc.GetProperty("doors").EnumerateArray().ToList();
        Ok(walls.Count == 11 && doors.Count == 10, "11 walls and 10 door blocks");
        Ok(doors.Select(d => doc.GetProperty("walls")[d.GetProperty("wall").GetInt32() - 1].GetProperty("angle").GetInt32())
               .SequenceEqual(new[] { 0, 15, 30, 45, 60, 90, 120, 135, 150, 165 }), "the doors' walls are at the ten known angles");
        var wrong = doors.Where(d => !AsExpected(d)).Select(d => d.GetProperty("n").GetInt32()).ToList();
        Ok(wrong.Count == 0, "each door block reads — by Frame, BlockCentre, Snap and Axes — as the script expects: its wall, the point on the wall's line, " +
                             "its angle, its mirror, its hinge side and its swing side" + (wrong.Count == 0 ? "" : " → door(s) " + string.Join(", ", wrong)));
        Ok(doors.Count(d => d.GetProperty("mirrored").GetBoolean()) == 3
           && doors.Count(d => !SameAngle(d.GetProperty("rotation").GetDouble(), doc.GetProperty("walls")[d.GetProperty("wall").GetInt32() - 1].GetProperty("angle").GetInt32())) == 4
           && doors.Count(d => d.GetProperty("off_line_mm").GetDouble() != 0) == 2,
           "three doors are mirrored, four run against their wall's direction (two half turns, two x-mirrors), two are drawn off the centre line");
        Ok(doors.All(d => d.GetProperty("at").EnumerateArray().Select(v => v.GetDouble())
               .SequenceEqual(doc.GetProperty("walls")[d.GetProperty("wall").GetInt32() - 1].GetProperty("centre").EnumerateArray().Select(v => v.GetDouble()))),
           "every door belongs at its wall's centre — hinge-inserted, off-line or mirrored, the middle of the opening lands there");
        Ok(AsExpected(doc.GetProperty("window")) && blocks["WIN-1200"].GetProperty("layer").GetString() == "0",
           "the window block (its own lines on layer 0) reads as the script expects");
        var lone = Read(doc.GetProperty("no_wall"));
        Ok(lone.Wall == -1 && lone.Why.StartsWith("no straight wall of this build on L passes within half its thickness of"), "the block with no wall near is a gap, in words");

        int Inserts(string file) => File.ReadAllLines(Repo("demo", "ghost-sample", file)).Count(l => l == "INSERT");
        string main = doc.GetProperty("drawing").GetString(), planted = doc.GetProperty("planted_drawing").GetString();
        Ok(File.Exists(Repo("demo", "ghost-sample", main)) && Inserts(main) == 12, "sample-doors.dxf holds 12 inserts: 10 doors, the window, the one with no wall");
        Ok(File.Exists(Repo("demo", "ghost-sample", planted)) && Inserts(planted) == 13, "sample-doors-planted.dxf holds one more: the duplicate of door 1");
        var dxf = File.ReadAllLines(Repo("demo", "ghost-sample", main));
        Ok(dxf.Contains("BLOCKS") && dxf.Contains("DOOR-900") && dxf.Contains("WIN-1200") && dxf.Contains("ENDBLK"), "the drawing defines both blocks in a BLOCKS section");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        DoorBlockChecks();
```

with

```csharp
        DoorBlockChecks();
        DoorSampleChecks();
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`. Expect `426/427 checks pass` with `FAIL  the expected results are written beside the drawing`, exit code 1.

- [ ] **Step 3: The generator.**

In `demo/ghost-sample/make-sample.py`, replace

```python
      python demo/ghost-sample/make-sample.py --plant   (… plus the planted failing floor: sample-plan-planted.dxf)
```

with

```python
      python demo/ghost-sample/make-sample.py --plant   (… plus the planted failing floor: sample-plan-planted.dxf)
      python demo/ghost-sample/make-sample.py --ma1b    (MA-1b drill: sample-doors.dxf + sample-doors-expected.json)
      python demo/ghost-sample/make-sample.py --ma1b --plant   (… with the planted duplicate door: sample-doors-planted.dxf)
```

In `demo/ghost-sample/make-sample.py`, replace

```python
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
```

with

```python
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
```

In `demo/ghost-sample/make-sample.py`, replace

```python
BOWTIE = [("A-FLOR", [(12000, 5000), (14000, 7000), (14000, 5000), (12000, 7000), (12000, 5000)])]
```

with

```python
BOWTIE = [("A-FLOR", [(12000, 5000), (14000, 7000), (14000, 5000), (12000, 7000), (12000, 5000)])]

# MA-1b drill (GHB-1): door and window BLOCKS on walls at known angles. --ma1b writes sample-doors.dxf: eleven free-standing
# walls (one line each, typed 200 mm thick in the review) on a 7 m grid far from the origin, clear of what the drill model
# holds; a DOOR-900 block on each of the first ten, a WIN-1200 block on the eleventh, and one DOOR-900 with no wall near.
# The door block is drawn hinge at its insertion point: the closed leaf would lie along +X (hinge to strike), the leaf is
# drawn open along +Y, and the swing arc joins strike and open leaf — so the middle of what it draws, along X, is the middle
# of the opening, and +Y is the side it swings to. The window block's own lines are on layer 0 (the common CAD habit); the
# door block's are on A-DOOR. --ma1b --plant writes sample-doors-planted.dxf: one more insert on top of door 1.
# sample-doors-expected.json says what each insert must become. tools/promote-check works it out again with the add-in's own
# code, and drill MA1b compares the model with it.
MA1B_ORIGIN = (40000.0, 40000.0)
MA1B_ANGLES = [0, 15, 30, 45, 60, 90, 120, 135, 150, 165]
# One door per wall: (the insert's rotation minus its wall's angle, x scale, y scale, mm its middle sits left of the wall's line)
MA1B_DOORS = [(0, 1, 1, 0), (0, 1, 1, 0), (0, 1, 1, 60), (180, 1, 1, 0), (0, -1, 1, 0),
              (0, 1, 1, 0), (0, -1, 1, -80), (180, 1, 1, 0), (0, 1, 1, 0), (0, 1, -1, 0)]
WALL_LEN, WALL_THICK, DOOR_W, WIN_W = 4000.0, 200.0, 900.0, 1200.0
MA1B_BLOCKS = {
    "DOOR-900": {"layer": "A-DOOR", "lines": [(0, 0, 0, DOOR_W)], "arcs": [(0, 0, DOOR_W, 0, 90)]},
    "WIN-1200": {"layer": "0", "lines": [(0, -50, WIN_W, -50), (0, 50, WIN_W, 50), (0, -50, 0, 50), (WIN_W, -50, WIN_W, 50)], "arcs": []},
}
```

In `demo/ghost-sample/make-sample.py`, replace

```python
def dxf(polylines=POLYLINES, arcs=(), layers=LAYERS):
```

with

```python
def dxf(polylines=POLYLINES, arcs=(), layers=LAYERS, lines=None, blocks=None, inserts=()):
```

In `demo/ghost-sample/make-sample.py`, replace

```python
    g(0, "ENDTAB")
    g(0, "ENDSEC")

    g(0, "SECTION"); g(2, "ENTITIES")
    for layer, x1, y1, x2, y2 in LINES:
```

with

```python
    g(0, "ENDTAB")
    g(0, "ENDSEC")

    if blocks:
        # R12 block definitions: BLOCK, its entities in the block's own coordinates, ENDBLK. An INSERT below places one.
        g(0, "SECTION"); g(2, "BLOCKS")
        for name, b in blocks.items():
            g(0, "BLOCK"); g(8, "0"); g(2, name); g(70, 0); g(10, 0.0); g(20, 0.0); g(30, 0.0); g(3, name)
            for x1, y1, x2, y2 in b["lines"]:
                g(0, "LINE"); g(8, b["layer"])
                g(10, x1); g(20, y1); g(30, 0.0)
                g(11, x2); g(21, y2); g(31, 0.0)
            for cx, cy, r, a0, a1 in b["arcs"]:
                g(0, "ARC"); g(8, b["layer"])
                g(10, cx); g(20, cy); g(30, 0.0); g(40, r); g(50, a0); g(51, a1)
            g(0, "ENDBLK"); g(8, "0")
        g(0, "ENDSEC")

    g(0, "SECTION"); g(2, "ENTITIES")
    for layer, x1, y1, x2, y2 in (LINES if lines is None else lines):
```

In `demo/ghost-sample/make-sample.py`, replace

```python
        g(0, "SEQEND"); g(8, layer)
    g(0, "ENDSEC")
    g(0, "EOF")
```

with

```python
        g(0, "SEQEND"); g(8, layer)
    for layer, name, x, y, sx, sy, rot in inserts:
        # 41/42/43 = the x, y and z scale (a negative one mirrors the block), 50 = its rotation in degrees.
        g(0, "INSERT"); g(8, layer); g(2, name)
        g(10, x); g(20, y); g(30, 0.0)
        g(41, sx); g(42, sy); g(43, 1.0); g(50, rot)
    g(0, "ENDSEC")
    g(0, "EOF")
```

In `demo/ghost-sample/make-sample.py`, replace

```python
if __name__ == "__main__":
    if "--step2" in sys.argv or "--plant" in sys.argv:
```

with

```python
# ── MA-1b drill drawing and its expected results ──────────────────────────────────────────────────
def ma1b(plant):
    """Write sample-doors.dxf (planted: sample-doors-planted.dxf) and sample-doors-expected.json."""
    def unit(deg):
        return (math.cos(math.radians(deg)), math.sin(math.radians(deg)))

    def angle(v):   # a direction's plan angle, 0 up to 360, to four decimals — as the add-in reads a block's X axis
        return round(math.degrees(math.atan2(v[1], v[0])) % 360, 4) % 360 + 0.0

    def r3(v):      # the drawing and the expected results carry the same rounded numbers
        return [round(c, 3) + 0.0 for c in v]

    spots = [(MA1B_ORIGIN[0] + (i % 4) * 7000.0, MA1B_ORIGIN[1] + (i // 4) * 7000.0) for i in range(12)]
    walls, lines = [], []
    for i, deg in enumerate(MA1B_ANGLES + [0]):          # ten door walls, then the window's
        u, c = unit(deg), spots[i]
        a = r3((c[0] - WALL_LEN / 2 * u[0], c[1] - WALL_LEN / 2 * u[1]))
        b = r3((c[0] + WALL_LEN / 2 * u[0], c[1] + WALL_LEN / 2 * u[1]))
        lines.append(("A-WALL-INT", a[0], a[1], b[0], b[1]))
        walls.append({"n": i + 1, "angle": deg, "start": a, "end": b, "centre": r3(c)})

    def insert(n, layer, block, width, wall, turn, sx, sy, off):
        """One INSERT whose drawn middle sits `off` mm left of its wall's centre line, level with the wall's centre."""
        rot = (wall["angle"] + turn) % 360
        ux = unit(rot)
        bx, by = (ux[0] * sx, ux[1] * sx), (-ux[1] * sy, ux[0] * sy)   # the block's X and Y axes: scaled, then turned
        left = unit(wall["angle"] + 90)
        mid = (wall["centre"][0] + off * left[0], wall["centre"][1] + off * left[1])
        return {"n": n, "layer": layer, "block": block, "insert": r3((mid[0] - width / 2 * bx[0], mid[1] - width / 2 * bx[1])),
                "dxf_rotation": rot, "x_scale": sx, "y_scale": sy, "off_line_mm": off,
                # what it must become: hosted in this wall, at this point of its line, turned and mirrored like this
                "wall": wall["n"], "at": wall["centre"], "rotation": angle(bx), "mirrored": bx[0] * by[1] - bx[1] * by[0] < 0,
                "hinge_to_strike_deg": angle(bx), "swing_side_deg": angle(by)}

    doors = [insert(i + 1, "A-DOOR", "DOOR-900", DOOR_W, walls[i], *MA1B_DOORS[i]) for i in range(10)]
    window = insert(1, "A-GLAZ", "WIN-1200", WIN_W, walls[10], 0, 1, 1, 0)
    lone = {"layer": "A-DOOR", "block": "DOOR-900", "insert": r3(spots[11]), "dxf_rotation": 0, "x_scale": 1, "y_scale": 1, "wall": None}
    inserts = doors + [window, lone] + ([doors[0]] if plant else [])

    def drawn(b):   # the points a block draws, in its own coordinates: line ends, and seven points along each arc
        pts = [p for x1, y1, x2, y2 in b["lines"] for p in ((x1, y1), (x2, y2))]
        for cx, cy, r, a0, a1 in b["arcs"]:
            pts += [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / 6)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / 6))) for k in range(7)]
        return [r3(p) for p in pts]

    path = os.path.join(HERE, "sample-doors-planted.dxf" if plant else "sample-doors.dxf")
    with open(path, "w", newline="") as f:
        f.write(dxf([], (), ["A-WALL-INT", "A-DOOR", "A-GLAZ"], lines, MA1B_BLOCKS,
                    [(b["layer"], b["block"], b["insert"][0], b["insert"][1], b["x_scale"], b["y_scale"], b["dxf_rotation"]) for b in inserts]))
    print(f"wrote {path}  ({os.path.getsize(path):,} bytes)")

    expected = {
        "what": "make-sample.py --ma1b: what each block INSERT of sample-doors.dxf must become (MA-1b, GHB-1). "
                "Millimetres; degrees anticlockwise from +X, in plan.",
        "drawing": "sample-doors.dxf",
        "planted_drawing": "sample-doors-planted.dxf",
        "planted": "one more DOOR-900 insert on top of door 1: the same point, angle and scale",
        "wall_thickness_mm": WALL_THICK,
        "walls": walls,
        "blocks": [{"name": name, "layer": b["layer"], "drawn": drawn(b)} for name, b in MA1B_BLOCKS.items()],
        "doors": doors,
        "window": window,
        "no_wall": lone,
    }

    def entry(key, value):   # one list item per line: a row a person can read beside Revit
        if isinstance(value, list):
            return f' "{key}": [\n' + ",\n".join("  " + json.dumps(v) for v in value) + "\n ]"
        return f' "{key}": {json.dumps(value)}'

    json_path = os.path.join(HERE, "sample-doors-expected.json")
    with open(json_path, "w", newline="\n") as f:
        f.write("{\n" + ",\n".join(entry(k, v) for k, v in expected.items()) + "\n}\n")
    print(f"wrote {json_path}  ({os.path.getsize(json_path):,} bytes)")


if __name__ == "__main__":
    if "--ma1b" in sys.argv:
        ma1b("--plant" in sys.argv)
        sys.exit(0)
    if "--step2" in sys.argv or "--plant" in sys.argv:
```

- [ ] **Step 4: Write the drill files.** From the repo root:

```bash
python demo/ghost-sample/make-sample.py --ma1b
python demo/ghost-sample/make-sample.py --ma1b --plant
python demo/ghost-sample/make-sample.py && python demo/ghost-sample/make-sample.py --step2 && python demo/ghost-sample/make-sample.py --plant
git status --short demo/ghost-sample
```

Expect `wrote …sample-doors.dxf`, `wrote …sample-doors-planted.dxf` and, twice, `wrote …sample-doors-expected.json` (the same content both times). The third line re-writes the older samples through the changed writer: `git status` must list **only** the three new files as untracked — `sample-plan.dxf`, `sample-plan-step2.dxf`, `sample-plan-planted.dxf` and `sample-spec.pdf` unchanged. If one of those shows as modified, the writer changed an existing drawing: stop and fix it.

- [ ] **Step 5: Run it, and see it pass.** `dotnet run --project tools/promote-check`: expect `437/437 checks pass`. `dotnet run --project tools/ghost-p2-check`: `103/103` (it reads `sample-plan.dxf` and this folder's documents; a `.json` and a `.dxf` are not evidence — `GhostEvidence.cs:30`).

- [ ] **Step 6: Commit.**

```bash
git add demo/ghost-sample/make-sample.py demo/ghost-sample/sample-doors.dxf demo/ghost-sample/sample-doors-planted.dxf demo/ghost-sample/sample-doors-expected.json tools/promote-check/DoorSample.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(drill): make-sample.py --ma1b - ten door blocks at known angles, a window block, a block with no wall, a planted duplicate, and the expected results as data

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 5 — The executor turns a block's door: flips toward the drawing, and measures what Revit holds after the commit

**Files:**
- Create `tools/promote-check/Ma1bWiring.cs` — the source scan (the executor is Revit-bound: proven in the drill)
- Modify `tools/promote-check/Check.cs` — the call
- Modify `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` — the flips; `ExecutionResult.Turned`
- Modify `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` — Review AI Proposals shows the lines

**Interfaces:**
- A door or window create with `place.Rotation`: after it is hosted (the host rule is unchanged: the one straight basic wall within 1 mm of the point), the executor reads the instance's `HandOrientation` and `FacingOrientation` and flips hand and facing toward `PlacementGeometry.Axes(Rotation, Mirrored)` — only where the family can (`CanFlipHand`, `CanFlipFacing`). It never throws for a flip the family lacks: one unflippable family must not decline a whole build.
- `ExecutionResult.Turned` — `List<(string Label, double OffDeg, bool Hand, bool Facing)>`: each such instance **as Revit holds it after the commit**, measured by `PlacementGeometry.Turn`. A read that fails is recorded as `NaN`, and never undoes what was committed.
- The explicit `FlipFacing` / `FlipHand` booleans keep their refusal ("cannot flip its hand"): an agent that asks for a flip by name gets it or a reason.

- [ ] **Step 1: The failing check.**

Create `tools/promote-check/Ma1bWiring.cs`:

```csharp
#nullable disable

static partial class Check
{
    // ── 22. MA-1b: the Revit-bound wiring, as a source scan (proven live in drill MA1b) ────────────────────────────────
    static void Ma1bWiringChecks()
    {
        Console.WriteLine("\nMA-1b wiring (source scan: the executor, the reader, the planner, Photo Massing's review)");
        string executor = Src("GhostBuilder", "ChangesetExecutor.cs");
        Ok(executor.Contains("PlacementGeometry.Opposes(fi.HandOrientation.X, fi.HandOrientation.Y, hx, hy) && fi.CanFlipHand) fi.flipHand();")
           && executor.Contains("PlacementGeometry.Opposes(fi.FacingOrientation.X, fi.FacingOrientation.Y, fx, fy) && fi.CanFlipFacing) fi.flipFacing();"),
           "the executor flips a block's door toward the drawing's hinge side and swing side, only where its family can");
        int commit = executor.IndexOf("var status = t.Commit();", StringComparison.Ordinal), measured = executor.IndexOf("result.Turned.Add(PlacementGeometry.Turn(", StringComparison.Ordinal);
        Ok(commit > 0 && measured > commit, "what a placed door holds is measured after the commit, never promised before it");
        Ok(executor.Contains("catch (Exception) { result.Turned.Add((Label(el), double.NaN, false, false)); }"),
           "a direction that cannot be read back is recorded as unread — it never undoes what Revit committed");
        Ok(Src("GhostBuilder", "ChangesetPlacementEvent.cs").Contains("AddRange(PlacementGeometry.TurnLines(result.Turned))"),
           "Review AI Proposals shows the same lines for a changeset that carries a Rotation");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        TrustWiringChecks();
```

with

```csharp
        TrustWiringChecks();
        Ma1bWiringChecks();
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`. Expect `437/441 checks pass`: the four new lines `FAIL`.

- [ ] **Step 3: The result carries what was measured.**

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
        public List<string> Placement { get; set; }
    }
```

with

```csharp
        public List<string> Placement { get; set; }
        /// MA-1b (GHB-1): each door or window created with place.Rotation (read from a drawn block), as Revit holds it AFTER
        /// the commit — the angle between it and its block, and whether its hinge side and swing side are as drawn
        /// (PlacementGeometry.Turn). OffDeg NaN = it could not be read back. Empty when the changeset carried no Rotation.
        public List<(string Label, double OffDeg, bool Hand, bool Facing)> Turned { get; } = new();
    }
```

- [ ] **Step 4: The flips.**

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
                    if (el.Place.FlipHand == true && !(fi.CanFlipHand && fi.flipHand())) throw new InvalidOperationException($"{el.Kind} \"{name}\" cannot flip its hand");
                    SetMark(fi, el);
```

with

```csharp
                    if (el.Place.FlipHand == true && !(fi.CanFlipHand && fi.flipHand())) throw new InvalidOperationException($"{el.Kind} \"{name}\" cannot flip its hand");
                    // MA-1b (GHB-1): a door or window read from a drawn block — flipped toward the block's hinge side (hand) and
                    // swing side (facing), where its family can. A family with no such flip is left as Revit placed it: what the
                    // instance holds is measured after the commit (Turned) and said, so one such family never declines a build.
                    if (el.Place.Rotation is double rot)
                    {
                        doc.Regenerate(); // the orientations of an instance created in this transaction
                        var (hx, hy, fx, fy) = PlacementGeometry.Axes(rot, el.Place.Mirrored == true);
                        if (PlacementGeometry.Opposes(fi.HandOrientation.X, fi.HandOrientation.Y, hx, hy) && fi.CanFlipHand) fi.flipHand();
                        if (PlacementGeometry.Opposes(fi.FacingOrientation.X, fi.FacingOrientation.Y, fx, fy) && fi.CanFlipFacing) fi.flipFacing();
                    }
                    SetMark(fi, el);
```

- [ ] **Step 5: The measurement, after the commit and the recount.**

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
            foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) result.Warnings[kv.Key] = kv.Value;
            return result;
```

with

```csharp
            foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) result.Warnings[kv.Key] = kv.Value;
            // MA-1b (GHB-1): each door or window placed from a block, as Revit holds it now — the angle between it and its
            // block, its hinge side and swing side against the drawing's. Read after the commit and the recount (an element
            // Revit removed is in Gone, not here). The transaction is over: a read that throws is recorded as unread.
            foreach (var a in result.Applied)
            {
                var el = toPlace.First(e => e.ProposalGuid == a.ProposalGuid);
                if (!IsCreate(el) || !(el.Place?.Rotation is double rot)) continue;
                try
                {
                    var fi = (FamilyInstance)doc.GetElement(a.RevitUniqueId);
                    result.Turned.Add(PlacementGeometry.Turn(Label(el), rot, el.Place.Mirrored == true,
                        fi.HandOrientation.X, fi.HandOrientation.Y, fi.FacingOrientation.X, fi.FacingOrientation.Y));
                }
                catch (Exception) { result.Turned.Add((Label(el), double.NaN, false, false)); }
            }
            return result;
```

- [ ] **Step 6: Review AI Proposals shows the lines.**

In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, replace

```csharp
            if (plan != null && !result.NotRun && result.Error == null && result.NotFinished == null)
                result.Placement = plan.Lines(doc, result.Applied.Select(a => a.RevitUniqueId));
```

with

```csharp
            if (plan != null && !result.NotRun && result.Error == null && result.NotFinished == null)
                result.Placement = plan.Lines(doc, result.Applied.Select(a => a.RevitUniqueId));
            // MA-1b (GHB-1): how each door or window placed from a block sits against its block — a result of the changeset,
            // printed with the placement lines. Turned is filled only by a committed changeset.
            if (result.Turned.Count > 0)
                (result.Placement ??= new System.Collections.Generic.List<string>()).AddRange(PlacementGeometry.TurnLines(result.Turned));
```

- [ ] **Step 7: Run it, and see it pass.** `dotnet run --project tools/promote-check`: expect `441/441 checks pass`. Both builds at `0 Error(s)`.

- [ ] **Step 8: Commit.**

```bash
git add SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs tools/promote-check/Ma1bWiring.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(executor): a door or window with place.Rotation is flipped toward its block's hinge side and swing side, and measured after the commit (MA-1b, GHB-1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 6 — The reader: Ghost Builder reads the drawing's block inserts

**Files:**
- Modify `tools/promote-check/Ma1bWiring.cs` — the source scan
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` — `GhostCadExtractor.AddBlocks`, `GhostBlock`, `GhostElement.Block`
- Modify `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` — a layer of blocks only is still a layer

**How Revit shows a block (UNSURE 1 — drill row B1-1 settles it).** An imported drawing's geometry is one `GeometryInstance` (the import). Inside its symbol geometry, each block INSERT is expected to be a nested `GeometryInstance` whose `Transform` places the block in the drawing. The reader walks the **symbol** geometry and multiplies the transforms itself (`import.Transform × insert.Transform`), so no frame is guessed. From the composed transform it reads the insertion point, the angle and the mirror (`PlacementGeometry.Frame`); from the block's own curves — each point carried through the same transform — the middle of what it draws (`PlacementGeometry.BlockCentre`).

**What does not change.** The walk that reads lines, arcs and polylines (walls, slabs, outlines) is untouched: it still reads one level of the import through `GetInstanceGeometry()`, and still drops what is inside a block. So a block adds exactly one point element on its layer, and nothing else. The existing rectangle-on-`A-DOOR` reading stays (founder decision F3).

**Interfaces:**
- `GhostBlock` — `Name` (the block's name when Revit gives one, else null), `RotationDeg`, `Mirrored`.
- `GhostElement.Block` — set on a point element read from a block insert; null on everything else. Its `LocationPoint` is the middle of what the block draws (model feet).
- A block inside a block is part of the outer block (its curves count toward the outer block's middle); it is not an element of its own.
- A block's layer is the insert's own (the nested instance's graphics style); when Revit gives it none, the first layer one of its own curves names (UNSURE 2).

- [ ] **Step 1: The failing check.**

In `tools/promote-check/Ma1bWiring.cs`, replace

```csharp
        Ok(Src("GhostBuilder", "ChangesetPlacementEvent.cs").Contains("AddRange(PlacementGeometry.TurnLines(result.Turned))"),
           "Review AI Proposals shows the same lines for a changeset that carries a Rotation");
```

with

```csharp
        Ok(Src("GhostBuilder", "ChangesetPlacementEvent.cs").Contains("AddRange(PlacementGeometry.TurnLines(result.Turned))"),
           "Review AI Proposals shows the same lines for a changeset that carries a Rotation");

        string reader = Src("GhostBuilder", "GhostBuilder_ExtractionAndPlacement.cs");
        Ok(reader.Contains("Transform t = import.Transform.Multiply(gi.Transform);")
           && reader.Contains("PlacementGeometry.Frame(t.BasisX.X, t.BasisX.Y, t.BasisY.X, t.BasisY.Y)"),
           "the reader composes each insert's transform with the import's own, and takes the angle and the mirror from the composed axes");
        Ok(reader.Contains("PlacementGeometry.BlockCentre(t.Origin.X * FtToMm, t.Origin.Y * FtToMm, rotation, drawn)"),
           "a block stands at the middle of what it draws, not at its insertion point");
        Ok(reader.Contains("n is Curve || n is PolyLine || n is GeometryInstance"), "a drawing that holds only blocks gives no stray point at the import's origin");
        Ok(Src("GhostBuilder", "GhostBuilderOrchestrator.cs").Contains(".Concat(elements.Where(e => e.Block != null).Select(e => e.CadLayer))"),
           "a layer that holds only block inserts is still a row of the review");
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`. Expect `441/445 checks pass`: the four new lines `FAIL`.

- [ ] **Step 3: The block and the element.**

In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, replace

```csharp
    /// <summary>
    /// One CAD element resolved to geometry, ready to place. The extractor produces these
```

with

```csharp
    /// <summary>MA-1b (GHB-1): what a block INSERT of the drawing says beyond its point — its name when Revit gives one,
    /// the plan angle of its X axis (degrees, 0 up to 360) and whether it is mirrored (PlacementGeometry.Frame).</summary>
    public sealed class GhostBlock
    {
        public string Name { get; set; }
        public double RotationDeg { get; set; }
        public bool Mirrored { get; set; }
    }

    /// <summary>
    /// One CAD element resolved to geometry, ready to place. The extractor produces these
```

In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, replace

```csharp
        public double ThicknessMm { get; set; }          // walls: measured from the two drawn faces (0 = unpaired/unknown)
```

with

```csharp
        public double ThicknessMm { get; set; }          // walls: measured from the two drawn faces (0 = unpaired/unknown)
        public GhostBlock Block { get; set; }            // MA-1b: a block insert — LocationPoint is the middle of what it draws; null otherwise
```

- [ ] **Step 4: The walk.**

In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, replace

```csharp
                    bool hasCurve = nested.Any(n => n is Curve || n is PolyLine);
```

with

```csharp
                    // MA-1b: a nested instance (a block insert) is geometry too — AddBlocks reads it. Without this, a drawing
                    // that holds only blocks would give a stray point at the import's own origin.
                    bool hasCurve = nested.Any(n => n is Curve || n is PolyLine || n is GeometryInstance);
```

In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, replace

```csharp
                else
                {
                    Emit(obj, null);
                }
            }

            return results;
        }
```

with

```csharp
                else
                {
                    Emit(obj, null);
                }
            }

            AddBlocks(geo, results, LayerOf); // MA-1b (GHB-1): each block insert, as one point element
            return results;
        }

        private const double FtToMm = 304.8;

        /// <summary>
        /// MA-1b (GHB-1): every block INSERT of the drawing as ONE point element on the insert's layer — the middle of what
        /// the block draws (a door block inserted by its hinge stands at the middle of its opening), with the block's angle
        /// and mirror (GhostElement.Block). The import is one GeometryInstance; each insert is a nested GeometryInstance of
        /// its SYMBOL geometry, placed by its own Transform — composed here with the import's, so no frame is guessed. A block
        /// inside a block is part of the outer one. The curves inside a block are not emitted as elements (as before): a
        /// block is one thing. Points go through Transform.OfPoint, which takes any scale, a mirror included.
        /// </summary>
        private void AddBlocks(GeometryElement geo, List<GhostElement> results, Func<GeometryObject, string> layerOf)
        {
            // What a block draws, in model millimetres (plan), and the first layer one of its own curves names.
            string Gather(GeometryElement g, Transform t, List<(double X, double Y)> into)
            {
                string first = null;
                foreach (GeometryObject o in g)
                {
                    if (o is GeometryInstance n)
                    {
                        GeometryElement inner = n.GetSymbolGeometry();
                        string innerLayer = inner == null ? null : Gather(inner, t.Multiply(n.Transform), into);
                        first = first ?? innerLayer;
                        continue;
                    }
                    IList<XYZ> pts = o is PolyLine pl ? pl.GetCoordinates() : o is Curve c && c.IsBound ? c.Tessellate() : null;
                    if (pts == null) continue;
                    first = first ?? layerOf(o);
                    foreach (XYZ p in pts)
                    {
                        XYZ q = t.OfPoint(p);
                        into.Add((q.X * FtToMm, q.Y * FtToMm));
                    }
                }
                return first;
            }

            foreach (GeometryObject top in geo)
            {
                if (!(top is GeometryInstance import)) continue;
                GeometryElement drawing = import.GetSymbolGeometry();
                if (drawing == null) continue;
                foreach (GeometryObject o in drawing)
                {
                    if (!(o is GeometryInstance gi)) continue;
                    GeometryElement symbol = gi.GetSymbolGeometry();
                    if (symbol == null) continue;
                    Transform t = import.Transform.Multiply(gi.Transform);
                    var drawn = new List<(double X, double Y)>();
                    string ownLayer = Gather(symbol, t, drawn);
                    string layer = layerOf(gi) ?? ownLayer; // the insert's layer; with none, the layer of what it draws
                    if (layer == null) continue;
                    var (rotation, mirrored) = PlacementGeometry.Frame(t.BasisX.X, t.BasisX.Y, t.BasisY.X, t.BasisY.Y);
                    var (cx, cy) = PlacementGeometry.BlockCentre(t.Origin.X * FtToMm, t.Origin.Y * FtToMm, rotation, drawn);
                    results.Add(new GhostElement
                    {
                        CadLayer = layer,
                        LocationPoint = new XYZ(cx / FtToMm, cy / FtToMm, t.Origin.Z),
                        BaseElevation = t.Origin.Z,
                        Block = new GhostBlock { Name = BlockName(gi), RotationDeg = rotation, Mirrored = mirrored },
                    });
                }
            }
        }

        // The block's name, when Revit gives the nested instance's symbol one (drill MA1b records what it gives); else null.
        // It is said in a gap's sentence and decides nothing.
        private string BlockName(GeometryInstance gi)
        {
            try
            {
#if REVIT2023_OR_GREATER
                return _doc.GetElement(gi.GetSymbolGeometryId().SymbolId)?.Name;
#else
                return gi.Symbol?.Name;
#endif
            }
            catch (Exception) { return null; }
        }
```

- [ ] **Step 5: A layer of blocks only is still a layer.**

In `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs`, replace

```csharp
            return new Inputs
            {
                Layers   = _extractor.ExtractCadLayers(cadLink).ToList(),
                Elements = _extractor.ExtractGhostElements(cadLink).ToList(),
            };
```

with

```csharp
            var elements = _extractor.ExtractGhostElements(cadLink).ToList();
            // MA-1b: a layer that holds only block inserts has no curve of its own to name it (ExtractCadLayers reads curves) —
            // it is still a row of the review, counted one per insert.
            var layers = _extractor.ExtractCadLayers(cadLink)
                .Concat(elements.Where(e => e.Block != null).Select(e => e.CadLayer))
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            return new Inputs { Layers = layers, Elements = elements };
```

- [ ] **Step 6: Run it, and see it pass.** `dotnet run --project tools/promote-check`: expect `445/445 checks pass`. Both builds at `0 Error(s)` — the Revit 2024 build compiles `gi.GetSymbolGeometryId()`; a Revit 2021 or 2022 build would compile `gi.Symbol` (`dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2022 -p:DeployToRevit=false` proves that branch).

- [ ] **Step 7: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs tools/promote-check/Ma1bWiring.cs
git commit -F - <<'EOF'
feat(ghost): the extractor reads the drawing's block inserts - one point element each, with the block's angle and mirror (MA-1b, GHB-1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 7 — The planner: each door or window goes into its wall, on the wall's line, with its block's direction

**Files:**
- Modify `tools/promote-check/Ma1bWiring.cs` — the source scan
- Modify `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` — the snap, the filing, the old-bridge refusal, the summary's lines
- Modify `SentinelAddin/Commands.GhostBuilder.cs` — the summary's "Skipped" line
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` — `SkippedNoHost`'s comment

**The rule, in order, for each door or window of a ticked row** (a block's, or a drawn outline's):
1. Its point: the middle of what the block draws, or the outline's vertex average (as before).
2. `PlacementGeometry.Snap` over **this build's** straight walls on the build level, each with half its **type's** width: the one wall within half its thickness — for a block, the one that runs along the block's axis. None, a block across its wall, or two equally near: a named gap, counted in `Skipped`, never a free-standing door.
3. The point is moved onto that wall's line.
4. The executor's own host rule at the moved point, as before (`HostProblem`): a curved, curtain or stacked wall passing it, a wall already in the model under it (F9 A), or a second wall within 1 mm — each a named gap. So nothing is filed that the executor would refuse by rule.
5. Filed with the block's `Rotation` and `Mirrored` (an outline's door carries neither, and is placed as Revit places it, as before).

A column or furniture block is placed at the middle of what it draws, unhosted, as a drawn outline is; its angle is not applied (Next).

- [ ] **Step 1: The failing check.**

In `tools/promote-check/Ma1bWiring.cs`, replace

```csharp
        Ok(Src("GhostBuilder", "GhostBuilderOrchestrator.cs").Contains(".Concat(elements.Where(e => e.Block != null).Select(e => e.CadLayer))"),
           "a layer that holds only block inserts is still a row of the review");
```

with

```csharp
        Ok(Src("GhostBuilder", "GhostBuilderOrchestrator.cs").Contains(".Concat(elements.Where(e => e.Block != null).Select(e => e.CadLayer))"),
           "a layer that holds only block inserts is still a row of the review");

        string planner = Src("GhostBuilder", "GhostChangesetBuild.cs");
        int snap = planner.IndexOf("PlacementGeometry.Snap(straight, halves, level.Name, x, y, el.Block?.RotationDeg, out string hostWhy)", StringComparison.Ordinal);
        int hostRule = planner.IndexOf("hostWhy = HostProblem(x, y);", StringComparison.Ordinal);
        Ok(snap > 0 && hostRule > snap, "Ghost's planner snaps a door or window onto its wall, then asks the executor's own host rule at the moved point");
        Ok(planner.Contains("halves.Add(width / 2);") && planner.Contains("ChangesetExecutor.ResolveWallType(doc, type).Width * FtToMm"),
           "half a wall's thickness is half its TYPE's width — what the wall will be, also for a wall drawn as one line");
        Ok(planner.Contains("hosted ? el.Block?.RotationDeg : null, el.Block?.Mirrored == true"), "a hosted block is filed with its angle and mirror; an outline, a column or furniture with none");
        Ok(planner.Contains("if (GhostFiling.LostRotation(chunks[c], cs.Elements))"), "a bridge that dropped the angle abandons the build before anything is placed");
        Ok(planner.Contains("report.Placement.AddRange(PlacementGeometry.TurnLines(results.SelectMany(x => x.Turned).ToList()));"),
           "the summary says how the placed doors sit against their blocks, from what the executor measured after the commit");
        Ok(!planner.Contains("GHB-1, MA-1b)") && Src("Commands.GhostBuilder.cs").Contains("within half its thickness of the door or window"),
           "the gap's words no longer say the snap is still to come");
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`. Expect `445/451 checks pass`: the six new lines `FAIL`.

- [ ] **Step 3: Half of each wall's thickness.**

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                var straight = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>(); // this build's straight walls (mm)
```

with

```csharp
                var straight = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>(); // this build's straight walls (mm)
                // MA-1b (GHB-1): half of each one's thickness (mm), index for index with `straight` — half its TYPE's width: what
                // the wall will be, also for a wall drawn as one line (no measured thickness).
                var halves = new List<double>();
                var widths = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
```

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                        if (m == null) straight.Add(($"{el.CadLayer} #{n} (this build)", level.Name, run.Start[0], run.Start[1], run.End[0], run.End[1]));
                        else arcs.Add(c);
```

with

```csharp
                        if (m == null)
                        {
                            straight.Add(($"{el.CadLayer} #{n} (this build)", level.Name, run.Start[0], run.Start[1], run.End[0], run.End[1]));
                            if (!widths.TryGetValue(type, out double width)) widths[type] = width = ChangesetExecutor.ResolveWallType(doc, type).Width * FtToMm;
                            halves.Add(width / 2);
                        }
                        else arcs.Add(c);
```

- [ ] **Step 4: The snap and the filing.**

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                    // A door, window, column or furniture: the block's insertion point, or a drawn outline's centroid.
```

with

```csharp
                    // A door, window, column or furniture: the middle of what a block draws (MA-1b), or a drawn outline's centroid.
```

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                    double x = pt.X * FtToMm, y = pt.Y * FtToMm;
                    if (hosted && HostProblem(x, y) is string hostWhy)
                    {
                        report.SkippedNoHost++;
                        report.Warnings.Add($"{what}: {hostWhy} — not filed (snapping DWG door blocks onto walls is GHB-1, MA-1b).");
                        continue;
                    }
                    plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Point(k.Kind, el.CadLayer, Next(el.CadLayer), sym.FamilyName, sym.Name, level.Name, x, y, levelMm), map, null) });
```

with

```csharp
                    double x = pt.X * FtToMm, y = pt.Y * FtToMm;
                    if (hosted)
                    {
                        // MA-1b (GHB-1): the one straight wall of this build within half its thickness of the point — for a block,
                        // the one along the block's axis — and the point moved onto that wall's line. Then the executor's own
                        // host rule at the moved point (B2, F9 A), so whatever it would refuse is a named gap here, never a
                        // whole-build decline, and never a free-standing door.
                        string drawnAs = el.Block == null ? "" : $"block{(string.IsNullOrWhiteSpace(el.Block.Name) ? "" : " " + el.Block.Name.Trim())} at ({x:0}, {y:0}): ";
                        var snap = PlacementGeometry.Snap(straight, halves, level.Name, x, y, el.Block?.RotationDeg, out string hostWhy);
                        if (snap != null)
                        {
                            (x, y) = (snap.Value.X, snap.Value.Y);
                            hostWhy = HostProblem(x, y);
                        }
                        if (hostWhy != null)
                        {
                            report.SkippedNoHost++;
                            report.Warnings.Add($"{what}: {drawnAs}{hostWhy} — not filed.");
                            continue;
                        }
                    }
                    plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Point(k.Kind, el.CadLayer, Next(el.CadLayer), sym.FamilyName, sym.Name, level.Name, x, y, levelMm,
                        hosted ? el.Block?.RotationDeg : null, el.Block?.Mirrored == true), map, null) });
```

- [ ] **Step 5: A bridge that dropped the angle.** The executor places what the bridge returned. A bridge still on the code before Task 1 answers 201 without `Rotation` (it lists it under `ignored`); every door would then be placed unturned, silently. The build is abandoned instead, and what was filed is withdrawn.

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                    filed.Add(cs);
                }
                var planOf = new Dictionary<string, Planned>(StringComparer.Ordinal);
```

with

```csharp
                    filed.Add(cs);
                    // MA-1b (GHB-1): the bridge must have kept each block's angle — the executor places what it returned.
                    if (GhostFiling.LostRotation(chunks[c], cs.Elements))
                        return Abandon(GhostFailurePolicy.NotFiledLine("the bridge did not keep the door and window blocks' angle (place.Rotation) — it runs a build " +
                                                                        "older than this add-in. Restart the bridge on the current build, then build again"));
                }
                var planOf = new Dictionary<string, Planned>(StringComparer.Ordinal);
```

- [ ] **Step 6: The summary's lines.**

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                report.Placement.AddRange(placing.Lines(doc, applied.Select(a => a.RevitUniqueId)));
```

with

```csharp
                report.Placement.AddRange(placing.Lines(doc, applied.Select(a => a.RevitUniqueId)));
                // MA-1b (GHB-1): how the doors and windows placed from blocks sit against their blocks — what the executor
                // measured after each commit, never what was planned.
                report.Placement.AddRange(PlacementGeometry.TurnLines(results.SelectMany(x => x.Turned).ToList()));
```

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
// placeholder name, a door with no single straight wall of this build under it, a family of the wrong kind or host, a run
```

with

```csharp
// placeholder name, a door or window with no single straight wall of this build within half its thickness (MA-1b, GHB-1: a
// block is read with its angle, moved onto its wall's line and filed with place.Rotation), a family of the wrong kind or host, a run
```

In `SentinelAddin/Commands.GhostBuilder.cs`, replace

```csharp
            if (r.SkippedNoHost > 0) lines.AppendLine($"Skipped (no single straight wall of this build under the door or window): {r.SkippedNoHost}");
```

with

```csharp
            if (r.SkippedNoHost > 0) lines.AppendLine($"Skipped (no single straight wall of this build within half its thickness of the door or window, and along it): {r.SkippedNoHost}");
```

In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, replace

```csharp
            /// <summary>MA-1a step 2 (DWG): doors and windows not filed because no single straight wall lies under the point, or
            /// the one that does was already in the model (B2: only a wall this build creates hosts one).</summary>
```

with

```csharp
            /// <summary>MA-1a step 2 (DWG), MA-1b: doors and windows not filed because no single straight wall of this build lies
            /// within half its thickness of the point (for a block: along the block's axis), or the executor's host rule refuses
            /// the moved point — a wall already in the model under it (B2: only a wall this build creates hosts one), a second
            /// wall, a curved one.</summary>
```

- [ ] **Step 7: Run it, and see it pass.** `dotnet run --project tools/promote-check`: expect `451/451 checks pass`. `dotnet run --project tools/ghost-p2-check`: `103/103`. Both builds at `0 Error(s)`.

- [ ] **Step 8: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/Commands.GhostBuilder.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs tools/promote-check/Ma1bWiring.cs
git commit -F - <<'EOF'
feat(ghost): a DWG door or window is hosted in the wall of this build within half its thickness, on the wall's line, with its block's angle and mirror (MA-1b, GHB-1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 8 — MAS-4: Photo Massing's review builds once, closes when the build is kept, and what was placed is selected

**Files:**
- Modify `tools/massing-check/Check.cs` — the policy's checks
- Modify `tools/ghost-p2-check/ghost-p2-check.csproj`, `tools/ghost-p2-check/Check.cs` — the window's behaviour (constructed, never shown — as `GhostReviewWindow` is checked there)
- Modify `tools/promote-check/Ma1bWiring.cs` — the command's wiring, as a source scan
- Modify `SentinelAddin/GhostBuilder/MassingPlanner.cs` — the policy and the words (pure)
- Modify `SentinelAddin/UI/MassingReviewWindow.cs` — the one-build guard, `Reopen`
- Modify `SentinelAddin/Commands.Massing.cs` — close or reopen; select and zoom

**Interfaces:**
- `MassingPlanner.BuildKept(failed, rolledBack, notFinished, placed)` → the review closes: the build left something in the model, or Revit has not finished it (a second Build on top of an unfinished one is the bug this item closes). False — a refusal before the transaction, a rollback, or nothing placed — the review stays open with the person's numbers (founder decision F6).
- `MassingPlanner.ReopenStatus`, `MassingPlanner.SelectedLine(n)`, `MassingPlanner.NotSelectedLine(why)` — the words.
- `MassingReviewWindow.Emit()` — returns at once when Build is already disabled; else disables it, says "Building the massing…", and raises `BuildRequested`. `Reopen(status)` enables Build again. `CanBuild`, `StatusText` — read by the check.
- The selection is `report.NewElements` still in the model — the same elements `Placed` counts — so the count in the summary's "Selected" line equals "Placed" by construction, and Revit's own selection count shows whether it held.

- [ ] **Step 1: The failing checks.**

In `tools/massing-check/Check.cs`, replace

```csharp
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
```

with

```csharp
        // MAS-4: when a build's end closes the review, and what the summary says of the selection.
        Ok(MassingPlanner.BuildKept(false, false, false, 12) && MassingPlanner.BuildKept(false, false, true, 0),
           "MAS-4: the review closes when the build left something in the model — or when Revit has not finished it (never a second build on top)");
        Ok(!MassingPlanner.BuildKept(true, false, false, 0) && !MassingPlanner.BuildKept(false, true, false, 0) && !MassingPlanner.BuildKept(false, false, false, 0),
           "MAS-4: a refusal, a rollback or a build that placed nothing leaves the review open, the numbers kept");
        Ok(MassingPlanner.SelectedLine(12) == "Selected: 12 element(s) — the massing just placed; the view zooms to them."
           && MassingPlanner.NotSelectedLine("no view").StartsWith("Selected: nothing — Revit would not select the new elements (no view)")
           && MassingPlanner.ReopenStatus.Contains("Build again"),
           "MAS-4: the summary says how many elements are selected — the number to compare with Placed — or that none could be");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
```

In `tools/ghost-p2-check/ghost-p2-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\Updaters\DoctorPolicy.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\Updaters\DoctorPolicy.cs" />
    <!-- MAS-4: Photo Massing's review (WPF, no Revit API) and the planner types it shows -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\MassingPlanner.cs" />
    <Compile Include="..\..\SentinelAddin\UI\MassingReviewWindow.cs" />
```

In `tools/ghost-p2-check/Check.cs`, replace

```csharp
        Honest(); // MA-1a step 1: failure rule, family-type pick, review drop-down (Honest.cs)
```

with

```csharp
        // MAS-4: Photo Massing's review — one build per click; the command closes it, or reopens it with the reason.
        int builds = 0;
        var massing = new MassingReviewWindow(MassingPlanner.Validate(new MassingEstimate())); // constructed, never shown
        massing.BuildRequested += _ => builds++;
        massing.Emit();
        massing.Emit(); // the second click of a double-click
        Ok(builds == 1 && !massing.CanBuild && massing.StatusText == "Building the massing…",
           "MAS-4: a double-click on Build gives one massing — Build is disabled by the first click");
        massing.Reopen(MassingPlanner.ReopenStatus);
        Ok(massing.CanBuild && massing.StatusText == MassingPlanner.ReopenStatus, "MAS-4: a build that kept nothing reopens the review, the reason on its status line");
        massing.Emit();
        Ok(builds == 2 && !massing.CanBuild, "MAS-4: after a reopen, Build builds once more");

        Honest(); // MA-1a step 1: failure rule, family-type pick, review drop-down (Honest.cs)
```

In `tools/promote-check/Ma1bWiring.cs`, replace

```csharp
        Ok(!planner.Contains("GHB-1, MA-1b)") && Src("Commands.GhostBuilder.cs").Contains("within half its thickness of the door or window"),
           "the gap's words no longer say the snap is still to come");
```

with

```csharp
        Ok(!planner.Contains("GHB-1, MA-1b)") && Src("Commands.GhostBuilder.cs").Contains("within half its thickness of the door or window"),
           "the gap's words no longer say the snap is still to come");

        string massing = Src("Commands.Massing.cs"), massingReview = Src("UI", "MassingReviewWindow.cs");
        Ok(massingReview.Contains("if (!_build.IsEnabled) return;") && massingReview.Contains("_build.IsEnabled = false;"),
           "MAS-4: Photo Massing's Build is disabled by the click that builds");
        Ok(massing.Contains("MassingPlanner.BuildKept(error != null, report?.RolledBack != null, report?.NotFinished != null, report?.Placed ?? 0)")
           && massing.Contains("if (kept) review.Close();") && massing.Contains("else review.Reopen(MassingPlanner.ReopenStatus);"),
           "MAS-4: the command closes the review when the build is kept, and reopens it when nothing was built");
        Ok(massing.Contains("report.NewElements.Select(n => n.Id).Where(id => uidoc.Document.GetElement(id) != null)")
           && massing.Contains("uidoc.Selection.SetElementIds(ids);") && massing.Contains("uidoc.ShowElements(ids);"),
           "MAS-4: what was placed and is still in the model — the elements Placed counts — is selected and zoomed to");
```

- [ ] **Step 2: Run them, and see them fail.**
  - `dotnet run --project tools/massing-check`: a build failure, `error CS0117: 'MassingPlanner' does not contain a definition for 'BuildKept'`.
  - `dotnet run --project tools/ghost-p2-check`: a build failure, `error CS1061: 'MassingReviewWindow' does not contain a definition for 'CanBuild'` (and `Reopen`, `StatusText`).
  - `dotnet run --project tools/promote-check`: `451/454 checks pass`, the three MAS-4 lines `FAIL`.

- [ ] **Step 3: The policy and the words.**

In `SentinelAddin/GhostBuilder/MassingPlanner.cs`, replace

```csharp
        /// <summary>Fields a reviewer must confirm before building — anything `assumed` or below the bar.</summary>
```

with

```csharp
        /// <summary>MAS-4: whether a build's end closes the review. It closes when the build left something in the model
        /// (<paramref name="placed"/> &gt; 0), or when Revit has not finished the commit (<paramref name="notFinished"/>: it
        /// may still land, so a second Build must not be offered). A refusal before the transaction (<paramref name="failed"/>:
        /// the wrong model in front, a design option being edited, a workset the model lacks), a rollback, or a build that
        /// placed nothing leaves the review open with the reviewer's numbers — reading the images again takes time, and the
        /// corrections would be lost.</summary>
        public static bool BuildKept(bool failed, bool rolledBack, bool notFinished, int placed) =>
            !failed && !rolledBack && (notFinished || placed > 0);

        /// <summary>MAS-4: the review's status line when a build ended with nothing kept.</summary>
        public const string ReopenStatus = "Nothing was built — the reason is in the message just shown. Your numbers are kept: put it right, then Build again.";

        /// <summary>MAS-4: the summary's line for the selection made after a kept build — the count to compare with "Placed".</summary>
        public static string SelectedLine(int selected) => $"Selected: {selected} element(s) — the massing just placed; the view zooms to them.";

        /// <summary>MAS-4: the summary's line when Revit refused the selection or the zoom — the build stands.</summary>
        public static string NotSelectedLine(string why) => $"Selected: nothing — Revit would not select the new elements ({why}); the massing is placed.";

        /// <summary>Fields a reviewer must confirm before building — anything `assumed` or below the bar.</summary>
```

- [ ] **Step 4: The window.**

In `SentinelAddin/UI/MassingReviewWindow.cs`, replace

```csharp
    private readonly TextBlock _status;
```

with

```csharp
    private readonly TextBlock _status;
    private readonly Button _build; // MAS-4: disabled by the click that builds; Reopen enables it again
```

In `SentinelAddin/UI/MassingReviewWindow.cs`, replace

```csharp
        var build = new Button { Content = "Build massing ▶", Padding = new Thickness(12, 6, 12, 6), Margin = new Thickness(0, 6, 8, 0) };
        build.Click += (_, __) => Emit();
```

with

```csharp
        _build = new Button { Content = "Build massing ▶", Padding = new Thickness(12, 6, 12, 6), Margin = new Thickness(0, 6, 8, 0) };
        _build.Click += (_, __) => Emit();
```

In `SentinelAddin/UI/MassingReviewWindow.cs`, replace

```csharp
        buttons.Children.Add(build); buttons.Children.Add(cancel);
```

with

```csharp
        buttons.Children.Add(_build); buttons.Children.Add(cancel);
```

In `SentinelAddin/UI/MassingReviewWindow.cs`, replace

```csharp
    public void Emit()
    {
        foreach (var kv in _fields)
```

with

```csharp
    public void Emit()
    {
        // MAS-4: one build per click. A second click — the other half of a double-click, or one while Revit is still
        // placing — finds Build disabled and does nothing. The command closes this window when the build is kept, or
        // calls Reopen when nothing was built.
        if (!_build.IsEnabled) return;
        _build.IsEnabled = false;
        _status.Text = "Building the massing…";
        foreach (var kv in _fields)
```

In `SentinelAddin/UI/MassingReviewWindow.cs`, replace

```csharp
        BuildRequested?.Invoke(MassingPlanner.Validate(_estimate));
    }
}
```

with

```csharp
        BuildRequested?.Invoke(MassingPlanner.Validate(_estimate));
    }

    /// <summary>MAS-4: the build ended with nothing kept (refused, rolled back, or nothing placed) — Build works again, the
    /// numbers as the reviewer left them, and the status line says why.</summary>
    public void Reopen(string status)
    {
        _build.IsEnabled = true;
        _status.Text = status;
    }

    /// <summary>Whether a click on Build would build (the offline check reads it).</summary>
    public bool CanBuild => _build.IsEnabled;
    /// <summary>The status line under the numbers (the offline check reads it).</summary>
    public string StatusText => _status.Text;
}
```

- [ ] **Step 5: The command closes or reopens the review, and selects what was placed.**

In `SentinelAddin/Commands.Massing.cs`, replace

```csharp
        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
```

with

```csharp
        MassingReviewWindow review = null; // MAS-4: set when the review opens; closed below once a build is kept
        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
```

In `SentinelAddin/Commands.Massing.cs`, replace

```csharp
            TaskDialog.Show("Sentinel — Massing",
                error != null ? "Build failed: " + error.Message : Summarize(report, standards, templateLine));
        });
```

with

```csharp
            // MAS-4: a kept build closes the review (Build was disabled by the click, so no second massing lands on top) and
            // what it placed is selected and zoomed to, before the summary; a build that kept nothing — refused before the
            // transaction, rolled back, or nothing placed — leaves the review open with the reviewer's numbers.
            bool kept = MassingPlanner.BuildKept(error != null, report?.RolledBack != null, report?.NotFinished != null, report?.Placed ?? 0);
            string selected = kept && report.NotFinished == null ? SelectPlaced(uidoc, report) : null;
            if (review != null && review.IsVisible)
            {
                if (kept) review.Close();
                else review.Reopen(MassingPlanner.ReopenStatus);
            }
            TaskDialog.Show("Sentinel — Massing",
                error != null ? "Build failed: " + error.Message
                              : Summarize(report, standards, templateLine) + (selected == null ? "" : Environment.NewLine + selected));
        });
```

In `SentinelAddin/Commands.Massing.cs`, replace

```csharp
                    var review = new MassingReviewWindow(estimate);
```

with

```csharp
                    review = new MassingReviewWindow(estimate); // MAS-4: the Completed handler closes or reopens it
```

In `SentinelAddin/Commands.Massing.cs`, replace

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s, string template = null)
```

with

```csharp
    // MAS-4: select and zoom to what the build placed — NewElements still in the model, the same elements "Placed" counts,
    // so the line's count equals Placed. Runs inside the placement event, after its transaction ended (a selection is no
    // model change). DocPin.Check let the build run only in this command's own model, so uidoc is the active one. A refusal
    // by Revit (no view can show them) is one line of the summary; the build stands.
    private static string SelectPlaced(UIDocument uidoc, GhostPlacementEngine.PlacementReport report)
    {
        var ids = report.NewElements.Select(n => n.Id).Where(id => uidoc.Document.GetElement(id) != null).ToList();
        try
        {
            uidoc.Selection.SetElementIds(ids);
            uidoc.ShowElements(ids);
            return MassingPlanner.SelectedLine(ids.Count);
        }
        catch (Exception ex) { return MassingPlanner.NotSelectedLine(ex.Message); }
    }

    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s, string template = null)
```

- [ ] **Step 6: Run them, and see them pass.** `dotnet run --project tools/massing-check`: `17/17`. `dotnet run --project tools/ghost-p2-check`: `106/106`. `dotnet run --project tools/promote-check`: `454/454`. Both builds at `0 Error(s)`. The strings `promote-check` already scans in `Commands.Massing.cs` (the design-option refusal, `DocPin.Check`, the office-template count, the unread-guideline refusal, the report and the receipt) are untouched: its earlier lines still pass.

- [ ] **Step 7: Commit.**

```bash
git add SentinelAddin/GhostBuilder/MassingPlanner.cs SentinelAddin/UI/MassingReviewWindow.cs SentinelAddin/Commands.Massing.cs tools/massing-check/Check.cs tools/ghost-p2-check/ghost-p2-check.csproj tools/ghost-p2-check/Check.cs tools/promote-check/Ma1bWiring.cs
git commit -F - <<'EOF'
feat(massing): the review builds once per click, closes when the build is kept, and what was placed is selected and zoomed to (MAS-4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 9 — The sample's README, and the final checks (the merge follows the live drill)

**Files:**
- Modify `demo/ghost-sample/README.md` — the one line that names the drill files
- Create `demo/ghost-sample/ma1b-block-ruleset.json` — the drill's BLOCK rule for doors (row B1-11)

- [ ] **Step 1: The README.** Keep it short: `README.md` is itself evidence — Ghost Builder reads this folder's `.md` files into the same 6,000-character budget as the spec, and `ghost-p2-check` fails ("the whole spec reaches the evidence") when the README crowds the spec out. The dry run met exactly that: the budget has no room left, and even two added lines cut the spec's last line off. So the one line that names the drill files is reworded, not added to (it gets shorter). What each insert must become is in `sample-doors-expected.json` and in this plan, not here.

In `demo/ghost-sample/README.md`, replace

```markdown
`make-sample.py --step2` / `--plant` write the MA1a-S2 drill drawings (see the MA-1a step 2 plan).
```

with

```markdown
`make-sample.py --step2` / `--plant` / `--ma1b` write the drill drawings (see the MA-1a step 2 and MA-1b plans).
```

- [ ] **Step 2: The drill's BLOCK ruleset.** Drill row B1-11 needs a BLOCK rule a new door breaks: a door Ghost places has no Mark.

Create `demo/ghost-sample/ma1b-block-ruleset.json`:

```json
{
  "schema_version": 1,
  "standard_key": "ma1b-drill",
  "semver": "1.0.0",
  "org": "",
  "rules": [
    {
      "id": "MA1B-DR-01", "target": "parameter", "mode": "block", "parameter_name": "Mark", "categories": ["Doors"],
      "message_en": "Door '{name}': Mark is empty — the drill's BLOCK property (MA-1b).",
      "doc_ref": "MA-1b drill"
    }
  ]
}
```

From `WebApp`, run

```bash
node -e 'import("./bridge/artefact-store.mjs").then(m => { m.validateArtefact("ruleset", JSON.parse(require("fs").readFileSync("../demo/ghost-sample/ma1b-block-ruleset.json", "utf8"))); console.log("valid ruleset") })'
```

and expect `valid ruleset`. Do not install it now: the drill installs it on its scratch project.

- [ ] **Step 3: Final checks.**
  - `promote-check` `454/454` (master `395`); `ghost-p2-check` `106/106` (master `103`); `massing-check` `17/17` (master `14`).
  - `session-check` `47/47`, `wallpair-check` `9/9`, `ghost-standards-check` `147/147`, `guideline-check` `17/17`, `roi-check` `50/50`, `event-check` `44/44`, `heal-check` `9/9`, `annotate-check` `ALL PASS` and `datum-check` `DATUM OK`: as on master.
  - From `WebApp`, `npx vitest run bridge/`: expect `Test Files  83 passed (83)` and `Tests  1679 passed | 1 skipped (1680)` (master `1678 passed | 1 skipped`).
  - Both builds: `0 Error(s)`, with Revit 2024 at `5 Warning(s)` and Revit 2026 at `3 Warning(s)`.
  - `graphify` is not on PATH on this PC: say so in the merge message, and move on.

- [ ] **Step 4: Commit.** The merge is not part of this task: it follows the live drill (the section "Merge" after it).

```bash
git add demo/ghost-sample/README.md demo/ghost-sample/ma1b-block-ruleset.json
git commit -F - <<'EOF'
docs(drill): MA-1b drill data - the README names the drill files; a BLOCK ruleset a new door breaks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

## Live drill MA1b (Revit 2024, scratch copies only — on the branch, before the merge)

**Who does what.** The drill runner drives Revit by mouse. Two steps are the founder's, because they need a password: signing in (set-up) and signing out (closing list). If the founder is away, the drill runs in whichever state the PC is in, and the other state is recorded as **owed** — never as passed.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **M4-1 Photo Massing (MAS-4), live.** No folder of building photos is on this PC; MA1a-I68's Massing row (I7-9) is owed for the same reason. MAS-4 is proven offline: the window's one-build guard and reopen in `ghost-p2-check`, the close rule in `massing-check`, the command's wiring by source scan. The row is written below for the session that has images. It would be the first Massing build seen live, so it also carries I7-9.
- **Signed in or signed out**: whichever of the two this session does not run is owed for the actor on the build's ledger rows (B1-7).
- **A binary `.dwg`** with blocks. The drill's drawing is a DXF; Revit makes the same kind of import from both, but only a run shows it for blocks. Owed until a DWG with door blocks is at hand (no converter is installed here, and no founder or pilot file is opened).
- **A block library drawn another way round** (F9) and **a block whose insert sits on one layer and whose lines on another named layer**: the sample has one convention and the layer-0 case only.
- **A bridge still on the old code** (E10): the refusal "the bridge did not keep the door and window blocks' angle" is proven offline (`GhostFiling.LostRotation`); seeing it live needs a second bridge on master's code, which this drill does not start.
- **One row on Revit 2026 or 2027**, and **a wall type whose location line is not its centre line**.

The drill record ends with the list of owed rows, and each goes into the "owed" memory.

**Set-up (once):**
- **Build.** Close Revit. Run `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, which deploys the branch's build into Revit 2024 (the closing list says what stays deployed). Record `git rev-parse --short HEAD` and the deployed DLL's sha256 (`certutil -hashfile "<the deployed Sentinel.dll>" SHA256`, lower case). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work.
- **The add-in's bridge settings.** Before the first switch, copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma1bbak` beside it. The file holds the file token: never print it and never open it in a viewer.
- **The test bridge on 127.0.0.1:4101**, on the branch's code (it must keep `Rotation`: Task 1). From `WebApp`:
  - Probe which settings `config/.env` holds (names only, never a value):

    ```bash
    node -e 'import("./bridge/load-env.mjs").then(m => { const e = m.loadEnv(); for (const k of ["BCF_PORT", "BCF_EVENT_POLL_MS", "BCF_BASE"]) console.log(k, k in e ? "is set in config/.env — the shell cannot override it" : "is not in config/.env — the shell value is used") })'
    ```

  - If `BCF_PORT` is set in `config/.env`: stop, and ask the founder — the test bridge cannot be moved to 4101 from the shell, and the drill does not edit `config/.env`.
  - Start it in the background, event poll off: `BCF_PORT=4101 BCF_EVENT_POLL_MS=0 node bridge/bcf-service.mjs`. Its banner names port 4101, and `curl -s http://127.0.0.1:4101/health` answers. The founder's 4100 bridge is not touched, and no write route of it is called.
  - **Every bridge call of this drill names `http://127.0.0.1:4101` itself.** Define this helper once in the drill's shell (it reads the token through `load-env.mjs` and prints the reply only; a path is given without its leading slash):

    ```bash
    b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
    ```

  - Point the add-in at the test bridge, with a script that prints nothing of the file: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The scratch web projects.** Nothing is installed on `demo` or on any office.
  - `b4101 POST cde/projects '{"key":"ma1b"}'`, then install the drill guideline and catalogue MA1a-I68 used (the guideline sends walls and doors to the workset `MA1_Walls` and names none for windows; the catalogue holds `Generic - 200mm`, so the office-template check passes with "1 of 3"):
    - `b4101 PUT "cde/ma1b/artefacts/guideline?actor=drill" @../demo/ghost-sample/ma1a-i68-guideline.json`
    - `b4101 PUT "cde/ma1b/artefacts/type_catalog?actor=drill" @../demo/ghost-sample/ma1a-i68-catalog.json`
  - `b4101 POST cde/projects '{"key":"ma1b-block"}'`, then `b4101 PUT "cde/ma1b-block/artefacts/ruleset?actor=drill" @../demo/ghost-sample/ma1b-block-ruleset.json` (row B1-11). If the ruleset route differs, install it the way MA1a-I35 installed `ma1a-block-ruleset.json` on `ma1a-block`, and record the call.
- **Scratch copies** (in `%USERPROFILE%\Documents\Sentinel drills`, each a copy on disk of `%USERPROFILE%\Documents\sentinel-scratch\ma1\ma1-src_detached.rvt`, the B35 model). The file dialog refuses a typed name: copy the file on disk first, then open the copy.
  - `ma1b-central.rvt` — open it, enable worksharing (Collaborate ▸ Collaborate ▸ Within your network) and save: the copy becomes the central in place. Create the workset `MA1_Walls` (Collaborate ▸ Worksets ▸ New). Leave `Workset1` active. Bind it to `ma1b` (Project Setup).
  - `ma1b-level.rvt`, `ma1b-planted.rvt`, `ma1b-outline.rvt` — not workshared; each bound to `ma1b` in its own row.
  - `ma1b-block.rvt` — not workshared; bound to `ma1b-block`.
  - Never open aster-tower, Demo, a pilot file or any founder file.
- **Ghost source folder** = `demo/ghost-sample` in every copy (Project Setup); Ollama running as in MA1a-S2.
- **The types the rows are typed with** (picked by hand in the review; the drill guideline has no rules). Record the exact names used:
  - walls: `Generic - 200mm` (200 mm: half is 100 mm, which the two off-line doors need);
  - doors: `Door-Interior-Single-Flush_Panel-Wood : MA1 915 x 2134mm` (the B35 model's);
  - windows: a wall-hosted window type the model holds (the B35 seed placed three windows; record family and type). If the drop-down offers none, load one from the Revit library and record it.
- **Record before the first row:** whether the session is signed in; the Phase of the `GR-FFL` plan (expected `New Construction`); the active workset (`Workset1`); the levels (`GR_SSL` −300, `GR-FFL` 0, `01_SSL` 3000, `01-FFL` 3300, `MA0 Roof` 6300).
- **Before each row, record** the last row id of `b4101 GET "cde/ma1b/audit?limit=1"`.
- **Driving notes** (from MA1a-I35 and MA1a-I68): Select by ID needs its dialog on screen before typing — wait about 6 s. A contextual Modify tab appears only when the ribbon is not on Manage. Do not click in the drawing area with nothing in hand: a stray click picks the CAD import, and Delete removes it. Manage Links does not list CAD imports.

**How the drill reads a door's angle and side, by mouse.** A hosted door has no angle of its own in Properties; three readings are used, in this order:
1. **By eye, against the drawing.** The import stays in the plan under the model. Zoom to a door: Revit's door — its leaf and its swing arc — must lie over the block's leaf line and arc: hinge at the same end, swinging to the same side. This is the independent reading: it does not go through Sentinel's own arithmetic.
2. **The summary's line**, `Blocks: … largest angle between one and its block N°; hinge side and swing side as drawn on M of K.` — what the add-in measured from Revit's own instance after the commit, against the block's angle.
3. **The filed numbers.** `b4101 GET changesets/ma1b/<id>` lists each door's `place.Rotation` and `place.Mirrored`; they must equal `rotation` and `mirrored` of the same door in `demo/ghost-sample/sample-doors-expected.json`, and `place.Location` must equal its `at`. This shows the reader read each block right, in numbers.

Fallback when the import is hard to see under the walls: set the plan's Visual Style to Wireframe, or hide the walls in the view (select one wall ▸ right-click ▸ Hide in View ▸ Category; undo it with Reveal Hidden Elements). Fallback for a wall's own angle: Annotate ▸ Angular dimension between that wall and wall 1 (0°) reads the wall's angle; a door hosted in a wall runs along it.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| B1-1 The blocks are read (UNSURE 1, 2, 3) | On `ma1b-central.rvt`, in the `GR-FFL` plan: Ghost Builder ▸ `sample-doors.dxf`. Look at the review; build nothing yet | The review lists `A-WALL-INT` with `11 element(s)`, `A-DOOR` with `11 element(s)` (ten doors and the one with no wall) and `A-GLAZ` with `1 element(s)`. Zoom to the import: it shows the eleven walls, each door's leaf and arc — the mirrored and turned ones included — and the window's rectangle. **If `A-DOOR` is missing or shows 0**: Revit did not give the inserts as nested instances, or did not take the hand-written BLOCKS section — finding F-MA1b-1, the drill stops, and E1's fallback goes back to planning. **If the window is on a row named `0`** and not on `A-GLAZ`: Revit gives a block the layer of its own lines — record it as a finding (E13), tick that row as Windows instead, and go on | the three rows and their counts, word for word; a screenshot of the import; which layer the window came on |
| B1-2 Ten hosted doors that cut their walls | In that review: tick and type `A-WALL-INT` (the wall type), `A-DOOR` (the door type) and `A-GLAZ` (the window type) by hand; build level `GR-FFL`; Build | The summary holds:<br>• `Placed: 22` (11 walls, 10 doors, 1 window);<br>• `Skipped (no single straight wall of this build within half its thickness of the door or window, and along it): 1`;<br>• under Warnings: `Doors on 'A-DOOR': block … at (61450, 54000): no straight wall of this build on GR-FFL passes within half its thickness of (61450, 54000) — not filed.` — the block's name after the word `block` if Revit gave one (record what it gave);<br>• `Blocks: 11 door(s) and window(s) placed from drawn blocks — largest angle between one and its block 0.0°; hinge side and swing side as drawn on 11 of 11.` — or fewer than 11, each other one named on its own line (a window family with no hand flip is expected to be one: F5).<br>In the plan and in a 3D view each of the ten walls shows one door in an opening it cuts, at the wall's middle: no door stands free, and no door is at (61450, 54000). Select a door: the ribbon offers Pick New Host (a hosted element), and Properties ▸ Level is `GR-FFL`. One Undo entry | the summary word for word; a plan and a 3D screenshot; the Revit warning count |
| B1-3 Each rotation within 1°; mirrored blocks give the matching hand | Reading 1 (by eye) on all ten doors, door by door, against `sample-doors-expected.json`. Doors 4 and 8 are turned a half turn against their wall; doors 5, 7 and 10 are mirrored; doors 3 and 7 are drawn 60 and 80 mm off the line. Then readings 2 and 3 | **By eye:** on every door the Revit leaf and swing lie over the block's — the hinge at the block's hinge end (`hinge_to_strike_deg` points from hinge to strike), the swing on the block's side (`swing_side_deg`). **The summary** reads `largest angle … 0.0°` (pass: under 1.0°). **The filed numbers:** each door's `place.Rotation` equals `rotation` (0, 15, 30, 225, 240, 90, 300, 315, 150, 165), `place.Mirrored` is true for doors 5, 7 and 10 only, and `place.Location` equals `at` within 1 mm — also for doors 3 and 7, which the snap moved onto the line.<br>**If all ten are hinged at the wrong end, or all ten swing to the wrong side**, while the summary says "as drawn": the family reads the other way round — finding F-MA1b-n: change `HandSign` or `FacingSign` in `PlacementGeometry.cs` to −1 (and the check line that pins them), rebuild, deploy, run the row again, and record which sign it was (UNSURE 5). **If some are right and some wrong**: a real fault — record which doors, and stop | for each door: right or wrong at hinge and at swing; the summary's line; the ten filed rows beside the expected ones |
| B1-4 A block with no wall near is a gap by name | Nothing more to run: B1-2's summary | The `Skipped … : 1` line and the named warning of B1-2; the review counted it (11 on `A-DOOR`); no changeset element exists for it (`b4101 GET changesets/ma1b/<id>`: 10 doors) | the two lines; the changeset's door count |
| B1-5 The window block | B1-2's build | The window is in wall 11, in an opening, at the wall's middle. Its changeset element carries `Rotation` 0 and no `Mirrored`, and no `SillHeight`; Properties ▸ Sill Height is the type's default (F10: record it) | the window's host, sill height, and its line in the summary if it is not "as drawn" |
| B1-6 Workset and phase hold for doors | B1-2's build (the central is bound to `ma1b`, whose guideline sends walls and doors to `MA1_Walls`) | The summary's lines of their own: `Worksets: 21 on MA1_Walls · 1 left on the active workset (the guideline names no workset for Windows).` and `Phase: 22 element(s) set to "New Construction", the active view's phase …`. Select a door: Properties ▸ Workset `MA1_Walls`, Phase Created `New Construction`. The active workset is still `Workset1` | the two lines; one door's and the window's workset and phase |
| B1-7 The ledger report and the receipt count the doors | After B1-2: `b4101 GET "cde/ma1b/audit?entity_type=ghost_build"`, then `…entity_type=build` | One `ghost_build` row: `Ghost Builder placed 22 element(s) from sample-doors on GR-FFL`; `new_value.placed` 22, `skipped` 1, `wall_gaps` 0; `changesets` is the build's one id. One `build` row: action `build:run`, `reader` `ghost-builder`, `candidates` 23 (11 lines and 12 inserts), `gaps` 0, `claimed` true, `addin_sha256` = the deployed DLL's. The changeset's reply has `ignored` empty: `Rotation` and `Mirrored` are kept fields. Signed in: each row's `actor` is the signed-in e-mail; signed out: `unsigned — <Windows user>`; the other state is **owed** | both rows; the changeset's `ignored`; the actor |
| B1-8 One Undo removes the build | Ctrl+Z once | All 22 elements are gone; the import stays. `b4101 GET "cde/ma1b/audit?limit=5"`: one new `changeset_reverted` row, listing the build's 22 guids. No second row | the model's state; the row |
| B1-9 An import in the 01-FFL plan gives Base 01-FFL and Top MA0 Roof | Open `ma1b-level.rvt`, bind it to `ma1b`, open the `01-FFL` floor plan, Ghost Builder ▸ `sample-doors.dxf`. The review's level box opens on `01-FFL`. Type the three rows as in B1-2; Build | `Placed: 22`. A wall: Base Constraint `01-FFL`, Base Offset 0, Top Constraint `Up to level: MA0 Roof` — not `GR-FFL`, and not 3,300 mm too high. A door: Level `01-FFL`, Sill Height 0, in its wall. The gap's sentence names `01-FFL`. The summary says `Walls on 01-FFL rise to MA0 Roof, the next Building Story above …` | the level box; a wall's and a door's constraints; the summary |
| B1-10 The planted duplicate (F4; UNSURE 6) | Open `ma1b-planted.rvt`, bind it to `ma1b`, `GR-FFL` plan, Ghost Builder ▸ `sample-doors-planted.dxf`. `A-DOOR` shows `12 element(s)`. Type the rows; Build | **Record which of the three Revit does** — each is honest:<br>(a) Revit keeps both: `Placed: 23` and `Revit warnings raised by this build: 1 — …` (expected text: identical instances in the same place); wall 1 holds two doors on top of each other.<br>(b) Revit removes one at commit: `Placed: 22 (1 deleted by Revit: Doors on 'A-DOOR' — removed by Revit at commit)` — the design's line "Placed 9 (1 deleted by Revit)", with this drawing's numbers; the changeset's result lists that guid as rejected.<br>(c) Revit raises an error: `Nothing was built — …` with Revit's own reason, nothing in the model, the changeset declined. Then F4 goes back to the founder with B recommended (finding F-MA1b-n), and the row is recorded as "error", not as a pass.<br>In (a) and (b) the `Blocks:` line counts the doors still in the model | the summary word for word; which case; the Revit warning's text; wall 1's doors (select with Tab) |
| B1-11 The BLOCK check sees the doors | Open `ma1b-block.rvt`, bind it to `ma1b-block` (its ruleset blocks a door with no Mark), Scan Now once, `GR-FFL` plan, Ghost Builder ▸ `sample-doors.dxf`, type the rows, Build. At the dialog choose **Go back**. Then Build again and choose to place | First: **Sentinel — BLOCK check**: `This batch will block your sync: 10 element(s) (MA1B-DR-01)`. Go back: nothing is placed, the review stays open with Build enabled, and its status says the person went back. Second: placed anyway — `Placed: 22`, and the summary's first warning says 10 elements will block a sync | both dialogs; the review's status; the summary |
| B1-12 The drawn rectangles still work (F3) | Open `ma1b-outline.rvt`, bind it to `ma1b`, `GR-FFL` plan, Ghost Builder ▸ `sample-plan-step2.dxf`; type `A-WALL-EXT`, `A-WALL-INT`, `A-DOOR` and `A-FURN` as MA1a-S2 did (row S2-1); Build | As S2-1: both rectangle doors are placed, hosted in this build's walls; no `Blocks:` line (an outline has no angle). If a wall of the B35 model lies under a door's point, the door is a named gap by F8 — then say so, and run the row at the model's free end as S2 did | the summary; the two doors' hosts |
| B1-13 An agent's door with a Rotation | On `ma1b-central.rvt` (after B1-8's Undo), `GR-FFL` plan: post the B1-13 body below (`b4101 POST changesets/ma1b @<file>`), then post the second body. Review AI Proposals ▸ tick both elements of the first ▸ Apply | The first reply: 201; the door's `place` holds `Rotation` 180 and `Mirrored` true; `ignored` is empty. The second reply: 400, `… place.Rotation and place.FlipFacing or place.FlipHand say the same thing twice …`. After Apply: `Applied 2 element(s) …` and, with the placement lines, `Blocks: 1 door(s) and window(s) placed from drawn blocks — largest angle between one and its block 0.0°; hinge side and swing side as drawn on 1 of 1.` The door opens unticked in the review (an agent's create is never pre-ticked) | both replies; the dialog |
| M4-1 Photo Massing builds once (MAS-4) — **owed** | With a folder that holds at least one image (`.png`, `.jpg`, `.jpeg`, `.webp`) set as the Ghost source folder of a scratch copy: Photo Massing; correct the numbers in the review; **double-click** Build. Then run it again, enter a design option (Manage ▸ Design Options ▸ Edit Selected) while the review is open, and click Build | First: one massing (not two on top of each other); Build greys out on the first click and the status reads `Building the massing…`; the review closes by itself; the placed elements are selected and the view zooms to them; the summary ends `Selected: N element(s) — the massing just placed; the view zooms to them.` with N equal to `Placed: N` and to Revit's selection count (bottom right). Second: `Build failed: … design option …`; the review is still open, Build enabled, its status `Nothing was built — the reason is in the message just shown. Your numbers are kept: put it right, then Build again.`, the numbers as corrected | "owed", or: the element count before and after, the summary, Revit's selection count, the review's state (UNSURE 9, 10) |

B1-13 bodies. The wall is 30 m north of the sample's walls. First, a wall and a mirrored door turned a half turn:

```json
{ "name": "MA1b — an agent's wall and a turned door", "source": "agent",
  "elements": [
    { "kind": "wall", "validate": { "identity": { "Class": "IfcWall", "Name": "B1-13 wall" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [40000, 90000, 0], "end": [44000, 90000, 0] } } },
    { "kind": "door", "validate": { "identity": { "Class": "IfcDoor", "Name": "B1-13 door" } },
      "place": { "FamilyName": "Door-Interior-Single-Flush_Panel-Wood", "TypeName": "MA1 915 x 2134mm", "LevelName": "GR-FFL",
                 "Location": [42000, 90000, 0], "Rotation": 180, "Mirrored": true } } ] }
```

Second, a door that says it twice (answered 400; nothing is stored):

```json
{ "name": "MA1b — a rotation and a flip", "source": "agent",
  "elements": [
    { "kind": "door", "validate": { "identity": { "Class": "IfcDoor", "Name": "B1-13 twice" } },
      "place": { "FamilyName": "Door-Interior-Single-Flush_Panel-Wood", "TypeName": "MA1 915 x 2134mm", "LevelName": "GR-FFL",
                 "Location": [42000, 90000, 0], "Rotation": 90, "FlipHand": true } } ] }
```

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as session MA1b, with gaps named F-MA1b-n, each fixed on the branch, and the list of **owed** rows at its end. When B1-10's answer is known, reword the design's drill line (`docs/strategy/2026-09-30-model-automation-design.md:1072`) to what Revit did, with the session's name — the design said "Placed 9 (1 deleted by Revit)" before anyone had seen it. Then:
- close Revit without saving the scratch copies;
- the founder signs out (Standards ▸ Sign out), if the session was signed in;
- stop the test bridge on 4101;
- restore the add-in's bridge settings by copying `bcf-config.json.ma1bbak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only) and delete the backup;
- say which add-in build is deployed in Revit 2024: the branch's, when the merge follows at once; master's again (`git checkout master`, the same `dotnet build`) when the drill failed or the merge waits;
- list what the drill left on the shared ledger: the scratch projects `ma1b` and `ma1b-block` with their installed artefacts, any membership added for the sign-in, and the changesets and report rows of each row.

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record;
- each F-MA1b-n fix is committed on the branch, and Task 9 Step 3's checks were run again after the last fix;
- UNSURE 1 held (Revit gives a block insert as a nested instance). If it did not, the reader goes back to planning and nothing is merged;
- B1-10 did not end in case (c), or the founder answered F4.

```bash
git checkout master
git merge --no-ff feature/ma1b-dwg-doors -F - <<'EOF'
Merge feature/ma1b-dwg-doors: MA-1b - GHB-1: Ghost Builder reads the drawing's door and window block inserts (point, angle, mirror); each becomes a door or window hosted in the wall of this build within half its thickness, moved onto the wall's line, flipped to the block's hinge side and swing side (place.Rotation and place.Mirrored on the bridge and the add-in together), measured after the commit and said in the summary; a block with no wall near is a named gap. MAS-4: Photo Massing's review builds once per click, closes when the build is kept, and what was placed is selected and zoomed to (not drilled live: no photos on this PC). Drill MA1b recorded. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment note:** the bridge first, then the add-in. A bridge still on the old code answers a Ghost build that holds a door block with 201 and no `Rotation`; the new add-in sees that (`GhostFiling.LostRotation`) and builds nothing: "the bridge did not keep the door and window blocks' angle (place.Rotation) — it runs a build older than this add-in. Restart the bridge on the current build, then build again". A drawing with no door or window block builds as before against either bridge. Restarting the founder's bridge (`tools/bridge-start.cmd`) is the founder's step. The add-in is deployed to each Revit version by its own build (`-p:RevitVersion=…`, without `DeployToRevit=false`), with Revit closed.

## UNSURE facts this drill settles

1. Does Revit give a DWG or DXF block INSERT as a nested `GeometryInstance` inside the import's symbol geometry, with a `Transform` relative to the drawing — or does it flatten blocks into loose curves? (B1-1.) Everything in the reader rests on it. If it flattens them, the `A-DOOR` row is missing or counts 0, and E1's fallback (parse the DXF's INSERTs) goes back to planning.
2. Which layer does Revit report for an insert: the nested instance's own graphics style (the insert's layer), or none — and for lines drawn on layer 0 inside a block, the insert's layer or `0`? (B1-1: the window's row.)
3. Does Revit's importer take the hand-written R12 BLOCKS section and INSERT entities — rotation (code 50), a negative x or y scale (41, 42) — and draw the mirrored blocks mirrored? (B1-1: the import on screen.)
4. Is the composed transform's X axis the block's X axis in model coordinates when the import sits in a raised level's plan, and is its origin's XY the DXF's? (B1-9: the doors land in their walls on `01-FFL`.)
5. After `NewFamilyInstance(point, symbol, wall, level, NonStructural)`, which way do `HandOrientation` and `FacingOrientation` point, and on which side of them does the office door family hinge and swing? (B1-3, by eye.) It decides the two calibration signs (E9). Do `flipHand()` and `flipFacing()` work inside the open transaction, and does the door stay at its point?
6. What does Revit do with two identical doors at one point in one wall at commit: a warning it keeps, a silent removal (the only way "deleted by Revit" prints), or an error that rolls the build back? (B1-10.)
7. Does a door near an oblique wall's middle cut it cleanly at every one of the ten angles, with the wall's top attached to the next story? And what does Revit raise for a door closer to a wall's end than half its width? (B1-2; the second is not drilled — the sample's doors are at the walls' middles.)
8. What name does Revit give a nested block's symbol — the DWG's block name, a generated one, or none? (B1-2: the gap's sentence.) It decides nothing.
9. MAS-4: does WPF deliver the second click of a double-click to a button the first click disabled (expected: no)? And what did a double-click do before — one build or two? (M4-1, owed.)
10. MAS-4: what does `UIDocument.ShowElements` do with a multi-storey massing when the active view is a floor plan — zoom to what is visible, show Revit's own "no good view" dialog, or switch view — and is the selection still there, with the same count, after the summary dialog is closed? (M4-1, owed.)
11. Do Revit 2026 and 2027 give blocks the same way? Only a run settles it (owed).

## Risks

- **Walls broken at openings.** Many architects stop the wall lines at a door and start them again after it. Ghost then builds two wall pieces with a gap, no wall lies under the door, and the door is a named gap — every door of such a drawing. The sample's walls run through. Joining collinear wall pieces across an opening is GHB-6's ground and is not built here. The summary names each such door; it does not hide them.
- **The block convention is assumed (F9).** Hinge and swing are read from the block's axes. A block library drawn another way round gives doors in the right wall at the right point, hinged or swinging the other way, while the summary says "as drawn". Only the eye sees it (B1-3). Reading the swing arc is in Next.
- **The calibration signs are a guess until the drill (E9).** If the office door family reads hand or facing the other way round, every door comes out flipped the same wrong way until one sign is changed.
- **Revit may not give blocks as the reader expects (UNSURE 1).** Then no door block is read at all, the `A-DOOR` row is missing, and the reader needs the DXF fallback. Nothing wrong is placed in that case — nothing is placed.
- **A duplicate block may stop a build (F4).** If Revit raises an error for two doors at one point, the whole build is rolled back, with the reason. B1-10 records it.
- **A family that cannot flip (F5).** Its door is the wrong way round and said so in the summary. A person who does not read the summary does not know.
- **A middle that is not the opening's middle (F2).** A block that draws more than the door (a tag, a frame on one side) shifts the door by half the extra.
- **An outline door at a corner.** With the half-thickness reach, a rectangle whose centre lies within half a thickness of two walls is now "equally near" more often than under the old 1 mm rule; it is a named gap, as before.
- **A door past half the wall's thickness, or a block more than 5° off its wall, is not placed.** Named, counted, never guessed.
- **Old bridge, new add-in (E10).** A drawing with door blocks builds nothing until the bridge is restarted; the message says so.
- **One Regenerate per turned door.** The executor regenerates before it reads a new instance's orientation. A build of 200 door blocks regenerates 200 times; not measured. If it is felt, read all orientations after one regenerate (Next).
- **A wall whose location line is not its centre line.** The snap measures half the type's width either side of the location line; a wall placed on a face line reaches the full width one way. Ghost's own walls are created on their centre line, so the drill does not meet it.
- **MAS-4 is not seen live.** Its window behaviour is proven offline on a real WPF window that is never shown; the close, the selection and the zoom are proven by a source scan only. The first Massing build in Revit may show a `ShowElements` dialog or a lost selection (UNSURE 10).
- **A massing build Revit left Pending closes the review (E15).** If Revit then drops it, the person runs Photo Massing again from the start.

## Next (out of scope here)

- GHB-6: wall pieces joined across an opening, so a door drawn in a gap between two wall lines finds its wall.
- Reading the swing arc and the leaf inside a block: hinge and swing whatever way the block was drawn (F9 B), and the door's width from the drawing (MA-2 sizing).
- Hosting in a wall already in the model (F8 B); a duplicate named and not filed (F4 B), if the drill says Revit errors.
- A column's or furniture's block angle (E17): `RotateElement` about its point.
- A window's sill height from the guideline (F10 B).
- A DXF reader for inserts, if Revit flattens blocks (E1's fallback), or as a second witness.
- A wall drawn inside a block (E11): read, when a drawing needs it.
- One regenerate for all turned doors of a changeset, if 200 are slow.
- Photo Massing's live drill (M4-1 and MA1a-I68's I7-9), the BLOCK check for Photo Massing (with MA-6), and MA-6 itself: Photo Massing onto the executor.
- Select and zoom for Ghost Builder's own builds: MAS-4 asks it of Photo Massing only.
- Contract 2's other fields and operations, bridge typing (MA-2), and the rest of the items-6–8 plan's Next list.
