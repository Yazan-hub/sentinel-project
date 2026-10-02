# MA-1a items 3–5 — walls level to level, the full stamp, the BLOCK check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three things change in what Sentinel places:
- **Walls go level to level (item 3).** A wall create without a `TopElevation` rises to the next Building Story above its base, with its top constrained there. This holds for every source that places through the executor: agents, Promote and Ghost Builder. Photo Massing does not yet: its walls stay unconnected at the estimate's storey height until MA-6 moves Massing onto the executor (C5). Ghost reads the drawing's Z from the import's own Z, so the audit's +18 m bug is gone. The 10 ft and 3000 mm constants are deleted.
- **Every element carries the full stamp (item 4).** Each element placed by a changeset, Ghost, Datum or Photo Massing carries the source file's sha, the layer, the rule, the approver, the ledger row and the time. A new **5 · Provenance** command shows the stamp of a picked element. A copy-pasted element reads "copied, not placed by Sentinel".
- **Batches are checked against BLOCK rules (item 5).** Before a Ghost build or a changeset is kept, Sentinel judges it with the same full scan the sync runs. If it adds BLOCK rows, the person is asked: "This batch will block your sync: N element(s)". They may go back (nothing is placed) or place anyway.

For the drill row "a batch that leaves a BLOCK property empty", parameter rules with `categories` now judge model elements. This is the full-scan half of SCAN-E1.

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md`:
- §7.2 MA-1 (1a) items 3–5 (`:1049-1051`), with drill rows `:1063-1065`;
- the `ruleset@n` row (`:277`), §2.4 steps 6 and 8 (`:338`, `:344`), and D19 (`:1339`);
- §6.4 Provenance (`:756-777`).

Also the audit's GHB-2 (`docs/strategy/2026-09-30-revit-addin-audit.md:910`, `:922`), SCAN-E1 (`:385`), and package 2's founder rule "a BLOCK rule stops the sync, not the edit" (`docs/superpowers/plans/2026-09-30-revit-package2-right-answers.md:19`). This plan does not touch items 6–8 (Next). Base: master `edca59c`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Architecture:** One pure next-story rule (`PromoteWallsPlanner.WallTop`, Promote's attach rule) decides every new wall's top. The executor applies it with attach's own two parameters. Ghost's planner applies it before filing, so a wall the executor would refuse becomes a named gap.

The stamp stays one Extensible Storage entity (same schema), now v2. Each changeset element carries an optional `provenance {layer, rule, source_sha256}` that the bridge keeps. The executor adds the changeset's proposal row (`adjudication.audit_id`), the signed-in actor and the time. Datum and Massing stamp inside their own transactions. A pure `Describe` is the reader.

The BLOCK check is the sync's own `ScanFull`, run before the batch and again while its `TransactionGroup` is still open, then diffed by rule and element. A modal choice follows in the same API call:
- Ghost asks after the documents' values are written. Go back abandons the build, and the review window stays open.
- Review AI Proposals and Promote wrap the executor in a group named as its transaction, but only when a BLOCK rule exists. Go back leaves the changeset proposed.

**Global constraints:**
- Branch `feature/ma1a-items3-5` from master `edca59c`; merge `--no-ff` only after every task's checks pass; push only under the standing push rule, after a secret scan of the range.
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`.
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; use the Edit tool for C# strings that contain escapes.
- No new dependencies and no new check project: extend `tools/promote-check` and the bridge's vitest files. `tools/session-check` compiles `ChangesetClient.cs`, and `tools/ghost-p2-check` compiles `GhostReviewWindow.cs`; both must stay green.
- Checks: `dotnet run --project tools/<name>` from the repo root; vitest from `WebApp` with `npx vitest run bridge/…`.
- No Revit, no deploy and no bridge restart during the tasks; the live drill is a separate session (last section).
- The community Revit MCP never writes; only the read-only `analyze_model_statistics`, and only in the drill.
- After each code task run `graphify update .` (per `C:/Users/yazan/CLAUDE.md`); if `graphify` is not on PATH, say so and move on.
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens); never commit a `.rvt`.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Line numbers are master `edca59c`'s and shift as tasks land: match the quoted text, not the number. The files are CRLF on disk, and the Edit tool matches the text.

**Dry run (planner, 2026-10-02):** every code step below was applied in order, task by task, to a fresh `git archive` export of `edca59c` in a scratch folder, and the checks were run after each task. The code blocks in this plan are the exact text that was applied. Results after each task:
- Both builds: `0 Error(s)` after every task. Revit 2024 shows 5 warnings and Revit 2026 shows 3, all of them master's.
- `promote-check`: `219/219` after Task 2 and `221/221` from Task 4 on (master `194/194`).
- `ghost-p2-check` `103/103`, `session-check` `47/47`, `ghost-standards-check` `146/146`, `wallpair-check` `9/9`, `massing-check` `13/13`, and `datum-check` `DATUM OK`, all as on master.
- The three changeset vitest files: `116/116` (master `114`). `changesets-logic.test.mjs` alone: `61` (master `59`).
- The full `bridge/` suite: `Tests 1628 passed | 1 skipped (1629)` on the dry-run tree (master `1626 passed | 1 skipped`).
- The Revit 2027 build (net10) also compiles, with `0 Error(s)`; it is not one of the required builds.
- The drill ruleset passes the bridge's `validateArtefact("ruleset", …)`.

Comments, the commit messages and the drill were not part of the dry run. Nothing in the repo was changed by it.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | What "the next story level" is | **A:** the lowest level above the wall's base with **Building Story** ticked (`LEVEL_IS_BUILDING_STORY`). This is Promote's attach rule, so one rule serves both. **B:** the next level of any kind. **C:** A, but skipping a story closer than some distance | **A.** One rule, already live (MA-0). A level that is not a Building Story (a parapet, a datum) is never a top. Ceiling: the BDS template marks every SSL and FFL level as a story, so a wall on `GR_SSL` (−300) rises only to `GR-FFL` (0), 300 mm. The office un-ticks Building Story on its slab levels, or the proposal sends a `TopElevation`. Drill I3-2 records it |
| F2 | A wall with no Building Story above its base and no `TopElevation` | **A:** unconnected at the height of the storey below (the story at the base minus the one under it), said in the summary. With no storey below either (a one-story model), the wall is refused by name, and Ghost names it a gap before filing. **B:** always refused (a gap for Ghost). **C:** keep a 3000 mm default | **A.** The task asks for "unconnected height when there is none", and the storey below is a fact of the model, not a constant. Ceiling: a one-story model cannot Ghost-build walls until it has a second story, or until the founder picks C |
| F3 | A proposal that sends an explicit `TopElevation` | **A:** unconnected at that height, as reviewed (today's behaviour). **B:** snap it to a story level within 0.5 mm | **A.** B would attach the MA-0 concept seed's walls at create (`make-concept.py:111`) and empty Promote's attach drill |
| F4 | Does the BLOCK check block, or only warn? | **A:** a choice. **Go back** is the default button, and closing the dialog also means go back. **Place anyway** keeps the batch; the sync stops later as it does today. **B:** refuse the batch. **C:** warn after placing, with no going back | **A.** The founder's rule is "a BLOCK rule stops the sync, not the edit" (package 2), and D19 says "the person may still place it knowingly" |
| F5 | What the stamp shows for an element placed while signed out | **A:** the approver is `UserSession.Actor` as is (`unsigned — <Windows user>`), and the reader adds "(not signed in — Standards ▸ Sign in names you)". **B:** placing needs a sign-in. **C:** leave the approver empty | **A.** This is the same actor every write already carries (XC-4). Unbound models and the machine credential keep working, and the stamp never invents a person |
| F6 | Photo Massing's source sha | **A:** one sha256 over the images the vision model read (the first 6): the sha of their `sha256  name` lines sorted by name. The layer is none, because Massing's layers are its own plan's, not a drawing's. **B:** a list of per-image shas | **A.** It fits the stamp's one field and does not depend on the order the images were read. The rule text names the massing-plan layer |
| F7 | Datum's path | **A:** Datum stamps in its own transaction: source `dwg`, no changeset, and no ledger row until item 7. **B:** Datum's levels and grids go through the executor as a changeset | **A.** With B, a bound Datum run would need the bridge and a contributor, and its dedupe and unique names would have to move. Item 7 gives Datum its ledger row |
| F8 | Which placers get the BLOCK check | **A:** Ghost Builder and every changeset (Review AI Proposals, Promote); Datum and Photo Massing in Next. **B:** Datum now too | **A.** The design names Ghost batches (`:277`) and changesets (`:344`). Datum creates levels, the likeliest trigger of a BLOCK naming rule, so it is the first in Next (with item 7). B is the same `Before` / `AddedSince` / `PlaceAnyway` calls around `builder.Build` in `Commands.Datum.cs`, inside a new TransactionGroup |
| F9 | Parameter rules with `categories` (the full-scan half of SCAN-E1) | **A:** in now, Revit only, in the full scan only (Scan Now, the sync, the BLOCK check). A parameter rule with categories judges the model elements of those categories; one without categories still judges views. **B:** keep SCAN-E1 deferred, and reword the drill row to a level-name rule | **A.** No rule target judges placed instances today, so "a batch that leaves a BLOCK property empty" cannot be built without it. The web scanner's parity is in Next |
| F10 | The web project for the BLOCK drill rows | **A:** a scratch web project `ma1a-block` with the drill ruleset (`demo/ghost-sample/ma1a-block-ruleset.json`). `demo` stays as it is for the item-3 and item-4 rows. **B:** install the BLOCK ruleset on `demo` | **A.** A BLOCK rule on `demo` would stop every `demo` member's sync, and an installed artefact version cannot be taken back. B33 used its own `ma0-bds` the same way |

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | One pure rule, `PromoteWallsPlanner.NextStory` / `WallTop`. `Plan` uses `NextStory` for attach, and the executor and Ghost's planner use `WallTop` for a create. A constrained top is set with attach's own two calls: `WALL_HEIGHT_TYPE` = the story, then `WALL_TOP_OFFSET` = 0 | The executor and Ghost cannot disagree: a wall the executor would refuse is a gap in Ghost's summary, never a whole-build decline. The attach calls are live on Revit 2024 (MA-0) |
| E2 | The executor's base with no `BaseElevation` is the level itself | Master used 0 mm, which put a named level's wall at minus its elevation. No known producer sends that shape, but an agent could |
| E3 | Ghost's drawing Z is measured from the import's own Z (`ImportInstance.GetTotalTransform().Origin.Z`): base = build level + (CAD Z − import Z). Walls are filed with no `TopElevation`. The ceiling Offset (step-2 F7) uses the same frame. Floor loops keep the drawing's Z, as before | GHB-2's "Z minus the level elevation" is the same thing when the plan was imported on the build level. This frame also puts a plan imported on L1 and built on L3 on L3, offset 0. Floors are placed on their level by `Floor.Create` (step-2 UNSURE 10, unchanged) |
| E4 | Stamp v2 keeps the same schema GUID and field, with `v: 2`. A later writer keeps `layer` and `source_sha256` from the element's own earlier stamp when it has none of its own (a Promote retype keeps the Ghost wall's drawing). `rule`, `approver`, `ledger_row`, `placed_at`, `changeset_id` and `source` are always the latest writer's. A writer with no changeset (Datum, Massing) adds nothing to `changeset_ids` | v1 stamps still read and merge. The reader names a v1 stamp's missing fields as older, never as empty |
| E5 | `ledger_row` is the changeset's `adjudication.audit_id`: its proposal row, stored by the bridge since A2 and known before placement. `AdjudicationDto.LedgerRow` reads it as a number or a string; any other value is no row, never a failed read. A local changeset has none | The `changeset_applied` row is written after the commit, so it cannot be stamped inside the changeset's transaction, and a later stamp write would be a second Undo entry. The proposal row is the one the receipt chain verifies |
| E6 | A changeset element may carry `provenance {layer, rule, source_sha256}`. The bridge validates it and keeps it as filed: text up to 256 or 500 characters, a 64-hex sha, any other key a 400. It is added to the element only when sent. Only Ghost sends it now | The bridge rebuilds each element field by field, so an unknown field would be dropped silently. Every other changeset's stored shape is unchanged |
| E7 | Ghost hashes the DWG only when this run imports it. A reused import (it may be older than the file, GHB-3) or an import picked from the model gives no sha, and the reader says "none recorded". Datum hashes the file the person picked; a Datum run that reads the imports already in the model gives no sha | The stamp never claims a sha for geometry that may not have come from those bytes. GHB-3 (link, and compare the sha before reuse) lifts this |
| E8 | The reader is **Model from Drawings ▸ 5 · Provenance**, a read-only command on the selected element (or one picked), built on the pure `ProvenanceStamp.Describe(json, uniqueId)` | The drill can read the stamp without the community MCP. Nothing writes |
| E9 | The BLOCK check runs `RuleEngineHost.ScanFull`, the sync's own call, before the batch and again after it, inside the batch's open `TransactionGroup` with no transaction open. It keeps the BLOCK rows that are new, keyed by rule and element id (or the element name for a row with no id). Neither scan runs when the ruleset has no BLOCK rule. When the ruleset has not loaded yet, the summary and the note say "BLOCK rules not checked …", never nothing | "A sync is stopped as predicted" then holds by construction, give or take `NotFixableHere`, which only drops other users' elements. Cost: two full scans per batch, and only when a BLOCK rule exists (Scan Now measured 88 ms on 1,092 elements) |
| E10 | **Ghost:** the check runs after step 5 (the documents' values can fill a BLOCK property) and before `Assimilate`. Go back is `Abandon`: the group is rolled back and the filed changesets are withdrawn. The review window then stays open for another Build (`GhostReviewWindow.Reopen`), and the local model is not released. **Review AI Proposals and Promote:** when a BLOCK rule exists, `ChangesetPlacementEvent` wraps the executor in a group named `UndoWatcher.TxName(cs)`, with `IsFailureHandlingForcedModal = false` (the F-S2-1 lesson). Go back rolls the group back and returns `NotRun`: the changeset stays proposed and nothing is reported | A check inside the executor before `Commit` would prompt once per 200-element Ghost chunk and miss the documents' values. A group cannot outlive one ExternalEvent call (`SentinelUndo.cs:7-8`), so the prompt is modal and in-call. Without a BLOCK rule the review path runs exactly as on master |
| E11 | Place anyway puts the headline in the summary or result dialog and in front of the result's note on the ledger. The bridge gets no new field | The design's BLOCK-result field on `POST …/result` (`:831`, `:883`) is in Next. The note is on the ledger today |
| E12 | A model that is not workshared gets the same check. Its headline ends "— once this model is workshared; it is not, so no sync runs today" | Same code path everywhere; no false alarm about a sync that cannot run |
| E13 | A parameter rule with categories is judged in `ScanFull` only. The DMU delta (`EvaluateSingle`) skips it | Otherwise the delta would judge views against a Furniture rule, and a REQUEST-mode rule would file rename requests (`SentinelUpdater.cs:112-119`). Type and Family rules are full-scan only already |

---

## Review amendments (2026-10-02, BINDING — they override any task text they contradict)

Two adversarial reviews (workflow wf_8e71c3a2-871) found the plan sound and raised the points below; C8 is the controller's.
Each belongs to the task named; its check runs with that task's checks. Report the real check totals.

- **C1 (Tasks 1, 2, 3 — important): the stamp cannot be spoofed through the bridge.** The executor takes `layer`, `rule` and
  `source_sha256` only from its **in-process caller**: `GhostChangesetBuild` passes its facts per `proposal_guid` (as it passes
  `WallsBefore`); `ChangesetPlacementEvent` (Review AI Proposals, Promote) passes none. The executor never reads
  `el.Provenance` from a changeset the bridge returned. The bridge may still keep `provenance` as a record, but only on op
  `create`, and it refuses control characters (`/[ -]/`) in its three fields; `Describe` collapses newlines in every
  field it prints. This also removes the "bridge must be updated first" risk: Ghost's stamp no longer depends on the bridge.
  Checks: a changeset whose element carries provenance but no in-process facts stamps none of it; a `rule` with a newline is a
  400 at the bridge; `Describe` prints one line per field.
- **C2 (Task 3 Step 5, Task 2 StampV2Checks — important): `rule` is never empty for a changeset element.** With no in-process
  rule, the stamp's rule is the element's own `reason` (Promote's DD rule text; an agent's stated reason), and `Describe`
  labels it `Reason given by the proposer (<source>):` so it never reads as an office rule. A Promote retype of a Ghost wall
  keeps the Ghost layer and sha (E4) and takes Promote's reason as the rule. Update the StampV2Checks expectations.
- **C3 (Task 5 Step 3 — minor): `ChangesetPlacementEvent.Execute` cannot throw.** Wrap the Before / RunChecked part in
  try/catch: roll the group back if it started and has not ended, then raise Completed with `NotRun = true` and an Error naming
  the exception (GhostBuilderExternalEvent's pattern).
- **C4 (Task 5 Step 1 — minor): a category key Sentinel cannot resolve is said, not silent.** Each unresolved key of a
  parameter rule's `categories` gives a Monitor note ("category X is not one Sentinel can resolve — rule not evaluated for
  it"), in the NeedsOrg style. One check.
- **C5 (Goal, Risks, Next — minor):** say that Photo Massing walls stay unconnected at the estimate's storey height until MA-6
  moves Massing onto the executor.
- **C6 (Tasks 3–4 — minor): one story projection.** `ChangesetExecutor.Stories(Document)` is `internal`; `GhostChangesetBuild`
  and `Commands.PromoteWalls` call it instead of their own `Select`.
- **C7 (Task 5 — minor): one BLOCK gate.** `BlockCheck.Rows(doc)` (null when nothing can block) is what both the pre-commit
  check and `App.OnSynchronizing` call; the sync's own `Has` / `Any(Block)` lines go. `NotFixableHere` stays sync-only (E9).
- **C8 (Task 4 — controller): Ghost's review opens on the drawing's own level.** Today the "Build on level" box defaults to
  the model's lowest level; on the BDS template that is `GR_SSL` (−300), where F1 A gives 300 mm walls. The default becomes
  the level at the import's elevation (within 1 mm; UNSURE 2), else the active plan view's level, else the lowest level. A
  pure pick function + one check. The person can still choose any level.

## Tasks (in order: bridge, pure half, executor, Ghost, BLOCK check, Datum/Massing/reader, drill file)

### Task 1 — Bridge: an element's provenance (item 4)

**Files:**
- Modify `WebApp/bridge/changesets-logic.mjs` (`:30`, before `:200`, `:182`, `:190`)
- Modify `WebApp/bridge/changesets-logic.test.mjs` (append)

**Interfaces:** `validateChangeset(body)` element output gains `provenance: {layer, rule, source_sha256}` (each `null` when not sent) **only when** the element sent one. Input rules: an object; keys `layer` (text ≤256), `rule` (text ≤500), `source_sha256` (64 lowercase hex); anything else is a 400 naming it.

- [ ] **Step 0: Branch and baselines.** Run `git checkout -b feature/ma1a-items3-5 edca59c`. Then record each check's master total, so later totals can be compared:
  - `dotnet run --project tools/promote-check`: expect `194/194 checks pass`;
  - `dotnet run --project tools/ghost-p2-check`: expect `103/103 checks pass`;
  - `dotnet run --project tools/session-check`: expect `47/47 checks pass`;
  - `ghost-standards-check`, `wallpair-check`, `massing-check` and `datum-check`: expect `146/146`, `9/9`, `13/13` and `DATUM OK`;
  - from `WebApp`, `npx vitest run bridge/`: expect `Tests  1626 passed | 1 skipped (1627)`;
  - both builds: `0 Error(s)`, with Revit 2024 at `5 Warning(s)` and Revit 2026 at `3 Warning(s)`.
- [ ] **Step 1: The fields a provenance may carry.** In `WebApp/bridge/changesets-logic.mjs`, replace

```js
const inRange = (n, lo, hi) => finite(n) && n >= lo && n <= hi;
```

with

```js
const inRange = (n, lo, hi) => finite(n) && n >= lo && n <= hi;
// MA-1a item 4: an element's provenance as its placer knows it (checkProvenance).
const PROVENANCE_FIELDS = ["layer", "rule", "source_sha256"];
const SHA256_HEX = /^[0-9a-f]{64}$/;
```

- [ ] **Step 2: The check.** In the same file, replace

```js
/** The elements a planner sent to a person instead of proposing a change: optional, at most 1000 rows of
```

with

```js
/** MA-1a item 4: where an element came from, as its placer knows it — the CAD layer, the rule that typed it and the source
 *  file's sha256 — kept as filed, so the add-in writes it into the element's provenance stamp. Optional, and each field
 *  optional; any other key or a malformed value is a 400, never dropped silently. */
function checkProvenance(p, at) {
  if (p == null) return null;
  if (typeof p !== "object" || Array.isArray(p)) throw err(400, `${at}: provenance must be an object`);
  const extra = Object.keys(p).filter((k) => !PROVENANCE_FIELDS.includes(k));
  if (extra.length) throw err(400, `${at}: provenance takes only ${PROVENANCE_FIELDS.join(", ")} (got ${extra.join(", ")})`);
  if (p.layer != null && !text(p.layer, 256)) throw err(400, `${at}: provenance.layer must be text of at most 256 characters`);
  if (p.rule != null && !text(p.rule, 500)) throw err(400, `${at}: provenance.rule must be text of at most 500 characters`);
  if (p.source_sha256 != null && !(typeof p.source_sha256 === "string" && SHA256_HEX.test(p.source_sha256)))
    throw err(400, `${at}: provenance.source_sha256 must be 64 lowercase hex characters (a sha256)`);
  return { layer: p.layer ?? null, rule: p.rule ?? null, source_sha256: p.source_sha256 ?? null };
}

/** The elements a planner sent to a person instead of proposing a change: optional, at most 1000 rows of
```

- [ ] **Step 3: Validate it, and keep it only when sent.** In the same file, make two replacements. First, replace

```js
    const proposal_guid = randomUUID();
    const identity = { ...validate.identity };
```

with

```js
    const provenance = checkProvenance(el.provenance, at);
    const proposal_guid = randomUUID();
    const identity = { ...validate.identity };
```

Second, replace

```js
      place: { ...el.place },
    };
  });
```

with

```js
      place: { ...el.place },
      ...(provenance ? { provenance } : {}), // MA-1a item 4: only when sent, so every other changeset reads as before
    };
  });
```

- [ ] **Step 4: Tests.** Append to `WebApp/bridge/changesets-logic.test.mjs`:

```js

// MA-1a item 4: an element's provenance (layer, rule, source file sha) rides on the changeset into the Revit stamp.
describe("validateChangeset — provenance (MA-1a item 4)", () => {
  const sha = "0123456789abcdef".repeat(4);
  it("keeps an element's layer, rule and source sha as filed, and adds no field when none is sent", () => {
    const v = validateChangeset(CS([wall({ provenance: { layer: "A-WALL-EXT", rule: "type by the guideline", source_sha256: sha } }), wall()]));
    expect(v.elements[0].provenance).toEqual({ layer: "A-WALL-EXT", rule: "type by the guideline", source_sha256: sha });
    expect(v.elements[1]).not.toHaveProperty("provenance");
    expect(validateChangeset(CS([wall({ provenance: { layer: "A-WALL" } })])).elements[0].provenance)
      .toEqual({ layer: "A-WALL", rule: null, source_sha256: null });
  });
  it("refuses a provenance it cannot keep — never drops it silently", () => {
    status400(() => validateChangeset(CS([wall({ provenance: "A-WALL" })])), /provenance must be an object/);
    status400(() => validateChangeset(CS([wall({ provenance: { layer: "A", sha } })])), /provenance takes only layer, rule, source_sha256 \(got sha\)/);
    status400(() => validateChangeset(CS([wall({ provenance: { source_sha256: sha.toUpperCase() } })])), /source_sha256 must be 64 lowercase hex/);
    status400(() => validateChangeset(CS([wall({ provenance: { layer: "x".repeat(257) } })])), /provenance\.layer must be text of at most 256/);
    status400(() => validateChangeset(CS([wall({ provenance: { rule: "" } })])), /provenance\.rule must be text of at most 500/);
  });
});
```

- [ ] **Step 5: Run.** From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs bridge/mcp-server.test.mjs`, expect `Tests  116 passed (116)` (master 114).
- [ ] **Step 6: Commit.**

```bash
git add WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-logic.test.mjs
git commit -F - <<'EOF'
feat(bridge): a changeset element may carry its provenance — layer, rule, source file sha — kept as filed (MA-1a item 4)

Validated (text caps, a 64-hex sha, unknown keys a 400) and kept on the element only when sent, so every other
changeset's stored shape is unchanged. The add-in writes it into the element's provenance stamp.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2 — The pure half: the next-story rule, the full stamp and its reader, the BLOCK diff (offline)

**Files:**
- Modify `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` (`:109`, before `:95`)
- Modify `SentinelAddin/Coordination/ChangesetClient.cs` (before `:87`, `:96`, `:104`)
- Replace `SentinelAddin/Engine/ProvenanceStamp.cs` whole
- Create `SentinelAddin/Engine/BlockCheck.cs`
- Modify `tools/promote-check/promote-check.csproj` (`:26`), `tools/promote-check/Check.cs` (`:35`), `tools/promote-check/Planner.cs` (`:284`)
- Create `tools/promote-check/Items.cs`

**Interfaces:**
- `PromoteWallsPlanner.NextStory(IReadOnlyList<LevelFact> levels, double baseMm) → LevelFact` (null = none).
- `PromoteWallsPlanner.WallTop(levels, baseMm, baseLevel, out string why) → (double TopMm, string TopLevel)?`. `TopLevel` set means a constrained top; null means unconnected at `TopMm`. A null result means refused, with `why`.
- `ProvenanceDto {Layer, Rule, SourceSha256}`; `ChangesetElementDto.Provenance`; `AdjudicationDto.AuditId : JsonElement?` and `AdjudicationDto.LedgerRow` (the id as text, or null).
- `ProvenanceStamp.Facts {Layer, Rule, SourceSha256, LedgerRow}`. The other members:
  - `Json(changesetId, source, guids, uniqueId, prior = null, Facts facts = null, string approver = null, string placedAt = null)`;
  - `Describe(json, uniqueId)`, `FileSha256(path)`, `FilesSha256(paths)` and `Now()`;
  - the Revit half, `Write(Element, changesetId, source, guids, Facts facts = null)`. Existing calls compile unchanged.
- `BlockCheck`. Pure: `Added(before, after)`, `Elements`, `Headline`, `Rows`, `PlacedAnyway`, `WentBack` and `NotLoaded`. Revit half: `Before(doc, out note)`, `AddedSince(doc, before)` and `PlaceAnyway(doc, added, what, rulesetRef)`.

- [ ] **Step 1: The next-story rule, shared.** In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, make two replacements. First, replace

```csharp
                var next = baseLevel == null ? null : levels.Where(l => l.IsStory && l.ElevationMm > baseLevel.ElevationMm + TolMm)
                                                            .OrderBy(l => l.ElevationMm).FirstOrDefault();
```

with

```csharp
                var next = baseLevel == null ? null : NextStory(levels, baseLevel.ElevationMm); // the executor's wall top too (MA-1a item 3)
```

Second, replace

```csharp
        /// <param name="docBasicWallTypes">The document's basic wall types: name (case-insensitive) → the type's Function.</param>
```

with

```csharp
        /// <summary>The story level a wall based at <paramref name="baseMm"/> rises to: the lowest Building Story more than 0.5 mm
        /// above it, or null. Promote's attach rule (MA-0), and since MA-1a item 3 the executor's wall top for every source.</summary>
        public static LevelFact NextStory(IReadOnlyList<LevelFact> levels, double baseMm) =>
            levels.Where(l => l != null && l.IsStory && l.ElevationMm > baseMm + TolMm).OrderBy(l => l.ElevationMm).FirstOrDefault();

        /// <summary>MA-1a item 3 (GHB-2): a new wall's top when its proposal sends no TopElevation. The next story above its base
        /// (TopLevel set: the executor constrains the top there, offset 0); with none, unconnected at the height of the storey
        /// below its base — the story at or under the base minus the story before that (founder decision F2); with neither,
        /// null and <paramref name="why"/>: the executor refuses the wall, Ghost's planner names it a gap. Never a constant.</summary>
        public static (double TopMm, string TopLevel)? WallTop(IReadOnlyList<LevelFact> levels, double baseMm, string baseLevel, out string why)
        {
            why = null;
            var next = NextStory(levels, baseMm);
            if (next != null) return (next.ElevationMm, next.Name);
            var at = levels.Where(l => l != null && l.IsStory && l.ElevationMm <= baseMm + TolMm).OrderByDescending(l => l.ElevationMm).FirstOrDefault();
            var under = at == null ? null : levels.Where(l => l != null && l.IsStory && l.ElevationMm < at.ElevationMm - TolMm)
                                                  .OrderByDescending(l => l.ElevationMm).FirstOrDefault();
            if (under != null) return (baseMm + at.ElevationMm - under.ElevationMm, null);
            why = $"no Building Story above {baseLevel}, and no storey below it to take a height from — tick Building Story on the level " +
                  "above (its Properties), add one (Datum from Drawings), or send a TopElevation";
            return null;
        }

        /// <param name="docBasicWallTypes">The document's basic wall types: name (case-insensitive) → the type's Function.</param>
```

- [ ] **Step 2: The provenance DTO.** In `SentinelAddin/Coordination/ChangesetClient.cs`, make three replacements. First, replace

```csharp
public sealed class ChangesetElementDto
{
```

with

```csharp
/// <summary>MA-1a item 4: where an element came from, as its placer knows it — the CAD layer, the rule that typed it, the
/// source file's sha256. The bridge keeps it as filed; the executor writes it into the element's provenance stamp.</summary>
public sealed class ProvenanceDto
{
    [JsonPropertyName("layer")] public string Layer { get; set; }
    [JsonPropertyName("rule")] public string Rule { get; set; }
    [JsonPropertyName("source_sha256")] public string SourceSha256 { get; set; }
}

public sealed class ChangesetElementDto
{
```

Second, replace

```csharp
    [JsonPropertyName("place")] public PlaceDto Place { get; set; }
    [JsonPropertyName("verdict")] public ElementVerdictDto Verdict { get; set; }
}
```

with

```csharp
    [JsonPropertyName("place")] public PlaceDto Place { get; set; }
    [JsonPropertyName("verdict")] public ElementVerdictDto Verdict { get; set; }
    /// <summary>MA-1a item 4: null for an agent's or Promote's element (they name no drawing).</summary>
    [JsonPropertyName("provenance")] public ProvenanceDto Provenance { get; set; }
}
```

Third, replace

```csharp
    [JsonPropertyName("unattributed")] public List<JsonElement> Unattributed { get; set; } = new();
}
```

with

```csharp
    [JsonPropertyName("unattributed")] public List<JsonElement> Unattributed { get; set; } = new();
    /// <summary>MA-1a item 4: the changeset's proposal row on the ledger ("Proposal &lt;verdict&gt;"; the bridge stores it as
    /// adjudication.audit_id). Read as it comes — a number from the ledger, null on a local changeset or an older bridge — so
    /// an odd value never breaks reading the changeset.</summary>
    [JsonPropertyName("audit_id")] public JsonElement? AuditId { get; set; }
    /// <summary>The ledger_row of every element this changeset places: the audit id as text, or null.</summary>
    [JsonIgnore] public string LedgerRow => AuditId is { ValueKind: JsonValueKind.Number or JsonValueKind.String } a ? a.ToString() : null;
}
```

- [ ] **Step 3: Replace `SentinelAddin/Engine/ProvenanceStamp.cs` whole** with

```csharp
#nullable disable
// MA-0: the provenance stamp (design §6.4) — an Extensible Storage entity on every element Sentinel placed or changed. One
// entity per element per schema, so a write MERGES the element's own earlier stamp: changeset_id and source are the latest
// writer's, proposal_guids and changeset_ids every changeset that touched the element (oldest first), and
// unique_id_at_placement stays the first placement's. Written inside the placer's own transaction (Ctrl+Z removes it too).
// The JSON is pure (tools/promote-check); SENTINEL_CHECK hides the Revit half, the DocPin pattern. A stamp whose
// unique_id_at_placement is not its element's is a copy's: it is not this element's history, is not merged, and reads
// "copied, not placed by Sentinel".
// MA-1a item 4 (v2): the full stamp — layer, rule, source_sha256, approver, ledger_row, placed_at — written by every placer:
// the changeset executor (agents, Promote, Ghost Builder), Datum from Drawings and Photo Massing (no changeset: changeset_id
// null, no ledger row until item 7). layer and source_sha256 keep an earlier write's value when the latest writer has none
// (a Promote retype keeps the Ghost wall's drawing); rule, approver, ledger_row and placed_at are the latest writer's.
// Describe is what Model from Drawings ▸ 5 · Provenance shows.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.ExtensibleStorage;
using Sentinel.Coordination;
#endif

namespace Sentinel.Engine
{
    public static class ProvenanceStamp
    {
        /// <summary>MA-1a item 4: what a placer knows about an element beyond its changeset. Every field may be null.</summary>
        public sealed class Facts
        {
            /// <summary>The CAD layer it was read from (Ghost Builder, Datum).</summary>
            public string Layer;
            /// <summary>What decided it, in words (the rule or pick that typed it).</summary>
            public string Rule;
            /// <summary>The sha256 (64 hex) of the source file it was read from, when Sentinel read that file.</summary>
            public string SourceSha256;
            /// <summary>The changeset's proposal row on the project ledger (adjudication.audit_id).</summary>
            public string LedgerRow;
        }

        /// <summary>The stored value, merged onto <paramref name="prior"/> (the element's stamp now, or null). Pure.</summary>
        public static string Json(string changesetId, string source, IEnumerable<string> proposalGuids, string uniqueId, string prior = null,
                                  Facts facts = null, string approver = null, string placedAt = null)
        {
            var ids = new List<string>();
            var guids = new List<string>();
            string layer = null, sha = null;
            try
            {
                using var d = JsonDocument.Parse(prior ?? "null");
                var r = d.RootElement;
                if (r.ValueKind == JsonValueKind.Object && Str(r, "unique_id_at_placement") == uniqueId)
                {
                    if (r.TryGetProperty("changeset_ids", out var a) && a.ValueKind == JsonValueKind.Array) ids.AddRange(a.EnumerateArray().Select(x => x.ToString()));
                    else if (Str(r, "changeset_id") is string one) ids.Add(one);
                    if (r.TryGetProperty("proposal_guids", out var g) && g.ValueKind == JsonValueKind.Array) guids.AddRange(g.EnumerateArray().Select(x => x.ToString()));
                    layer = Str(r, "layer");
                    sha = Str(r, "source_sha256");
                }
            }
            catch (Exception) { /* not a stamp: start afresh */ }
            if (changesetId != null && !ids.Contains(changesetId)) ids.Add(changesetId); // Datum and Massing file no changeset
            guids.AddRange((proposalGuids ?? Enumerable.Empty<string>()).Where(x => !guids.Contains(x)));
            return JsonSerializer.Serialize(new
            {
                v = 2,
                changeset_id = changesetId,
                source,
                proposal_guids = guids,
                unique_id_at_placement = uniqueId,
                changeset_ids = ids,
                layer = facts?.Layer ?? layer,
                rule = facts?.Rule,
                source_sha256 = facts?.SourceSha256 ?? sha,
                approver,
                ledger_row = facts?.LedgerRow,
                placed_at = placedAt,
            });
        }

        /// <summary>The source of the changeset that last stamped (e.g. "promote"), or null. Pure; never throws.</summary>
        public static string SourceOf(string json)
        {
            try { using var d = JsonDocument.Parse(json ?? "null"); return d.RootElement.ValueKind == JsonValueKind.Object ? Str(d.RootElement, "source") : null; }
            catch (Exception) { return null; }
        }

        /// <summary>MA-1a item 4: the stamp in words for a person, or why there is none. A stamp whose unique_id_at_placement is
        /// not <paramref name="uniqueId"/> came with a copy: "copied, not placed by Sentinel" (design §6.4). Pure; never throws.</summary>
        public static string Describe(string json, string uniqueId)
        {
            if (string.IsNullOrWhiteSpace(json)) return "No Sentinel provenance stamp — Sentinel did not place or change this element.";
            try
            {
                using var d = JsonDocument.Parse(json);
                var r = d.RootElement;
                if (r.ValueKind != JsonValueKind.Object) return "This element's Sentinel stamp cannot be read.";
                bool v1 = !(r.TryGetProperty("v", out var v) && v.ValueKind == JsonValueKind.Number && v.GetInt32() >= 2);
                string Or(string name, string none) => Str(r, name) is string s && s.Length > 0 ? s : v1 ? "not recorded (a stamp from before MA-1a item 4)" : none;
                var placedBy = Str(r, "unique_id_at_placement");
                var approver = Or("approver", "not recorded");
                var row = Str(r, "ledger_row");
                var at = Str(r, "placed_at");
                int n = r.TryGetProperty("changeset_ids", out var ids) && ids.ValueKind == JsonValueKind.Array ? ids.GetArrayLength() : 0;
                return string.Join("\n", new[]
                {
                    placedBy == uniqueId ? "Placed or changed by Sentinel."
                        : $"Copied, not placed by Sentinel — this stamp came with a copy of element {placedBy ?? "(unknown)"}; the lines below are that element's record, not this one's.",
                    "Source: " + (Str(r, "source") ?? "unknown"),
                    "Source file sha256: " + Or("source_sha256", "none recorded — Sentinel read no file for it (an agent's proposal, or a drawing already imported in the model)"),
                    "Layer: " + Or("layer", "none — not read from a drawing layer"),
                    "Rule: " + Or("rule", "not recorded"),
                    "Approver: " + approver + (approver.StartsWith("unsigned", StringComparison.Ordinal) ? " (not signed in — Standards ▸ Sign in names you)" : ""),
                    "Ledger row: " + (row != null ? "#" + row + " — the proposal row its changeset was filed with"
                                      : v1 ? "not recorded (a stamp from before MA-1a item 4)" : "none — not on a project ledger (an unbound model's local changeset, Datum or Photo Massing)"),
                    "Placed at: " + (at != null ? at + " (UTC, this PC's clock)" : v1 ? "not recorded (a stamp from before MA-1a item 4)" : "not recorded"),
                    "Changeset: " + (Str(r, "changeset_id") ?? "none") + (n > 1 ? $" (the latest of {n} that touched it)" : ""),
                });
            }
            catch (Exception) { return "This element's Sentinel stamp cannot be read."; }
        }

        /// <summary>MA-1a item 4: a file's sha256 (64 lowercase hex), or null when it cannot be read. Never throws.</summary>
        public static string FileSha256(string path)
        {
            try
            {
                using var sha = SHA256.Create();
                using var fs = File.OpenRead(path);
                return Hex(sha.ComputeHash(fs));
            }
            catch (Exception) { return null; }
        }

        /// <summary>MA-1a item 4 (founder decision F6): one sha256 over several files (Photo Massing's images) — the sha256 of
        /// their "sha256  name" lines sorted by name, as sha256sum prints them. Null when there is none or one cannot be read.</summary>
        public static string FilesSha256(IEnumerable<string> paths)
        {
            var lines = new List<string>();
            foreach (var p in (paths ?? Enumerable.Empty<string>()).OrderBy(x => Path.GetFileName(x), StringComparer.Ordinal))
            {
                var h = FileSha256(p);
                if (h == null) return null;
                lines.Add(h + "  " + Path.GetFileName(p));
            }
            if (lines.Count == 0) return null;
            using var sha = SHA256.Create();
            return Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(string.Join("\n", lines) + "\n")));
        }

        private static string Hex(byte[] b) => BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();

        /// <summary>The time a stamp records: UTC, to the second, from this PC's clock.</summary>
        public static string Now() => DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

        private static string Str(JsonElement o, string name) =>
            o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

#if !SENTINEL_CHECK
        // Fixed forever: a new Guid is a new schema, and stamps written under the old one become unreadable.
        private static readonly Guid SchemaGuid = new Guid("C25BA5C0-8AFC-47E2-A3AB-52B79ED5B1C7");
        private const string Field = "json";

        // SettingsManager's pattern. A schema name cannot hold dots, so the design's Sentinel.Provenance.v1 is written so.
        private static Schema GetSchema()
        {
            var existing = Schema.Lookup(SchemaGuid);
            if (existing != null) return existing;
            var b = new SchemaBuilder(SchemaGuid);
            b.SetSchemaName("SentinelProvenanceV1");
            b.SetReadAccessLevel(AccessLevel.Public);
            b.SetWriteAccessLevel(AccessLevel.Public);
            b.AddSimpleField(Field, typeof(string));
            return b.Finish();
        }

        /// <summary>Stamp <paramref name="e"/>, merging its own earlier stamp; the approver is the signed-in person
        /// (UserSession.Actor — "unsigned — &lt;Windows user&gt;" when nobody is; founder decision F5) and the time is now. The
        /// CALLER holds the open transaction (the placer's). API thread.</summary>
        public static void Write(Element e, string changesetId, string source, IEnumerable<string> proposalGuids, Facts facts = null)
        {
            var entity = new Entity(GetSchema());
            entity.Set(Field, Json(changesetId, source, proposalGuids, e.UniqueId, Read(e), facts, UserSession.Actor, Now()));
            e.SetEntity(entity);
        }

        /// <summary>The stamp JSON on <paramref name="e"/>, or null (none, or the schema is not in this session). Read-only:
        /// never creates the schema. API thread; never throws.</summary>
        public static string Read(Element e)
        {
            try
            {
                var s = Schema.Lookup(SchemaGuid);
                if (s == null || e == null) return null;
                var entity = e.GetEntity(s);
                return entity.IsValid() ? entity.Get<string>(Field) : null;
            }
            catch (Exception) { return null; }
        }
#endif
    }
}
```

- [ ] **Step 4: Create `SentinelAddin/Engine/BlockCheck.cs`**

```csharp
#nullable disable
// MA-1a item 5 (design §2.4 steps 6 and 8, D19): the BLOCK check before commit. A batch is judged by the same full scan a
// sync runs (App.OnSynchronizing: RuleEngineHost.ScanFull, its BLOCK rows), once before the batch and once after it is
// written, while its Undo group is still open. The BLOCK rows the batch adds are what "This batch will block your sync: N
// element(s)" counts; the person goes back (the group is rolled back — nothing is placed) or places anyway (founder decision
// F4: a BLOCK rule stops the sync, not the edit). No scan at all when the ruleset has no BLOCK rule. The diff and the words
// are pure (tools/promote-check); SENTINEL_CHECK hides the Revit half.
using System;
using System.Collections.Generic;
using System.Linq;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
#endif

namespace Sentinel.Engine
{
    public static class BlockCheck
    {
        /// <summary>Said when the ruleset has not landed yet — the check is never silently skipped.</summary>
        public const string NotLoaded = "BLOCK rules not checked before placing — this model's ruleset has not loaded yet (Scan Now loads it).";

        /// <summary>The BLOCK rows of <paramref name="after"/> that <paramref name="before"/> did not hold: what the batch adds. A row
        /// is its rule and its element — by id, or by name when it has none (a workset row) — so an element that already broke a
        /// rule is not counted again when the batch retypes or renames it. Pure.</summary>
        public static List<Violation> Added(IEnumerable<Violation> before, IEnumerable<Violation> after)
        {
            var had = new HashSet<string>((before ?? Enumerable.Empty<Violation>()).Where(v => v.Mode == EnforcementMode.Block).Select(Key));
            return (after ?? Enumerable.Empty<Violation>()).Where(v => v.Mode == EnforcementMode.Block && !had.Contains(Key(v))).ToList();
        }

        private static string Key(Violation v) => v.RuleId + "\n" + Element(v);
        private static string Element(Violation v) => v.ElementId > 0 ? v.ElementId.ToString() : v.ElementName;

        /// <summary>How many elements the rows name — an element that breaks two rules is one.</summary>
        public static int Elements(IReadOnlyList<Violation> added) => added.Select(Element).Distinct().Count();

        private static string Rules(IReadOnlyList<Violation> added) => string.Join(", ", added.Select(v => v.RuleId).Distinct());

        /// <summary>The design's words (§2.4 step 6), with the rules.</summary>
        public static string Headline(IReadOnlyList<Violation> added, bool workshared) =>
            $"This batch will block your sync: {Elements(added)} element(s) ({Rules(added)})" +
            (workshared ? "" : " — once this model is workshared; it is not, so no sync runs today");

        /// <summary>The rows, as the sync's dialog lists them: "• LB-01: MA0 Roof", at most <paramref name="max"/>.</summary>
        public static string Rows(IReadOnlyList<Violation> added, int max = 8) =>
            string.Join("\n", added.Take(max).Select(v => "• " + v.RuleId + ": " + v.ElementName)) +
            (added.Count > max ? $"\n… and {added.Count - max} more" : "");

        /// <summary>The summary and ledger-note line when the person placed the batch anyway.</summary>
        public static string PlacedAnyway(IReadOnlyList<Violation> added, bool workshared) =>
            Headline(added, workshared) + " — placed anyway, as the person chose; a sync stops until they are fixed.";

        /// <summary>The line when the person went back: nothing was placed.</summary>
        public static string WentBack(IReadOnlyList<Violation> added) =>
            $"You went back at the BLOCK check — nothing was placed. {Elements(added)} element(s) would have blocked your sync ({Rules(added)}).";

#if !SENTINEL_CHECK
        /// <summary>The full scan before a batch, or null when nothing can block it: no BLOCK rule in the ruleset (note null), or
        /// the ruleset has not loaded yet (note = <see cref="NotLoaded"/>). API thread; reads only, so it is safe inside an open
        /// TransactionGroup (RuleEngineHost opens no transaction).</summary>
        public static ScanReport Before(Document doc, out string note)
        {
            note = null;
            var engine = App.Engine;
            if (engine == null || !engine.Has(doc)) { note = NotLoaded; return null; }
            return engine.RulesetFor(doc).Rules.Any(r => r.Mode == EnforcementMode.Block) ? engine.ScanFull(doc) : null;
        }

        /// <summary>The BLOCK rows the batch added since <paramref name="before"/>, judged now by the sync's own scan. API thread.</summary>
        public static List<Violation> AddedSince(Document doc, ScanReport before) => Added(before.Violations, App.Engine.ScanFull(doc).Violations);

        /// <summary>Ask the person, modal, in the same API call (the batch's group still open, no transaction open): true = place
        /// anyway. Closing the dialog is going back — the safe answer.</summary>
        public static bool PlaceAnyway(Document doc, IReadOnlyList<Violation> added, string what, string rulesetRef)
        {
            var td = new TaskDialog("Sentinel — BLOCK check")
            {
                MainInstruction = Headline(added, doc.IsWorkshared),
                MainContent = Rows(added) + $"\n\nJudged by {rulesetRef ?? "this model's ruleset"} — the rules a sync runs. A BLOCK rule stops the sync, not the edit.",
                AllowCancellation = true,
            };
            td.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Go back", $"Nothing is placed: {what} is rolled back and the model stays as it was.");
            td.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Place anyway", "Fix these before you sync — Sentinel stops the sync until they are fixed.");
            td.DefaultButton = TaskDialogResult.CommandLink1;
            return td.Show() == TaskDialogResult.CommandLink2;
        }
#endif
    }
}
```

- [ ] **Step 5: promote-check compiles the BLOCK diff.** In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\Engine\UndoWatcher.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\Engine\UndoWatcher.cs" />
    <!-- MA-1a item 5: the BLOCK check's diff and words, over the rule engine's Violation -->
    <Compile Include="..\..\SentinelAddin\Engine\RuleModels.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\BlockCheck.cs" />
```

- [ ] **Step 6: The new checks run.** In `tools/promote-check/Check.cs`, replace

```csharp
        FilingChecks();
```

with

```csharp
        FilingChecks();
        LevelToLevelChecks();
        StampV2Checks();
        BlockChecks();
```

- [ ] **Step 7: The stamp has twelve fields now.** In `tools/promote-check/Planner.cs`, replace

```csharp
        Ok(j.Count == 6 && (int)j["v"] == 1 && (string)j["changeset_id"] == id && (string)j["source"] == "promote"
           && (string)j["unique_id_at_placement"] == "5a1c-0004c3f8",
           "the stamp JSON holds v, changeset_id, source, proposal_guids, unique_id_at_placement and changeset_ids");
```

with

```csharp
        Ok(j.Count == 12 && (int)j["v"] == 2 && (string)j["changeset_id"] == id && (string)j["source"] == "promote"
           && (string)j["unique_id_at_placement"] == "5a1c-0004c3f8",
           "the stamp JSON holds v (2), changeset_id, source, proposal_guids, unique_id_at_placement, changeset_ids and item 4's six fields");
```

- [ ] **Step 8: Create `tools/promote-check/Items.cs`**

```csharp
#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 11. MA-1a item 3: walls from level to level — the next-story rule the executor and Ghost's planner share ─────────
    static void LevelToLevelChecks()
    {
        Console.WriteLine("\nMA-1a item 3 — walls from level to level (PromoteWallsPlanner.NextStory / WallTop)");
        LevelFact L(string n, double mm, bool story = true) => new LevelFact { Name = n, ElevationMm = mm, IsStory = story };
        // The B35 drill model's levels (SIMULATION_ROOM_RUN B33), plus a level above the roof that is no Building Story.
        var b35 = new List<LevelFact> { L("GR_SSL", -300), L("GR-FFL", 0), L("01_SSL", 3000), L("01-FFL", 3300), L("MA0 Roof", 6300), L("Parapet", 7300, false) };
        var t = PromoteWallsPlanner.WallTop(b35, 0, "GR-FFL", out var why);
        Ok(t?.TopLevel == "01_SSL" && t?.TopMm == 3000 && why == null, "a wall on GR-FFL (0 mm) rises to 01_SSL, the next Building Story above it");
        Ok(PromoteWallsPlanner.WallTop(b35, -300, "GR_SSL", out _)?.TopLevel == "GR-FFL",
           "a wall on GR_SSL (−300) rises to GR-FFL (0): the next story, however close (founder decision F1)");
        Ok(PromoteWallsPlanner.WallTop(b35, 3000.3, "01_SSL", out _)?.TopLevel == "01-FFL", "a base within 0.5 mm of a story is on it: its top is the story above, never itself");
        var roof = PromoteWallsPlanner.WallTop(b35, 6300, "MA0 Roof", out why);
        Ok(roof?.TopLevel == null && roof?.TopMm == 9300 && why == null,
           "on the top story (Parapet is no Building Story) → unconnected at 3000 mm, the storey below's height (6300 − 3300; founder decision F2)");
        var one = PromoteWallsPlanner.WallTop(new List<LevelFact> { L("Level 1", 0) }, 0, "Level 1", out why);
        Ok(one == null && why.Contains("no Building Story above Level 1") && why.Contains("TopElevation"),
           "one story only → no top: refused with the reason (the executor declines, Ghost names a gap) — never a constant");
        Ok(PromoteWallsPlanner.WallTop(new List<LevelFact> { L("Level 1", 0), L("Level 2", 3000, false) }, 0, "Level 1", out _) == null,
           "a level above that is not a Building Story is no top (F1)");
        Ok(PromoteWallsPlanner.NextStory(b35, 0)?.Name == "01_SSL" && PromoteWallsPlanner.NextStory(b35, 6300) == null,
           "NextStory is Promote's attach rule: one rule for MA-0's attach and MA-1a's create");
    }

    // ── 12. MA-1a item 4: the full stamp (v2) and its reader ───────────────────────────────────────────────────────────
    static void StampV2Checks()
    {
        Console.WriteLine("\nMA-1a item 4 — the full provenance stamp (ProvenanceStamp v2) and its reader");
        const string uid = "5a1c-0004c3f8", sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        var ghost = ProvenanceStamp.Json("cs-1", "dwg", new[] { "g1" }, uid, null,
            new ProvenanceStamp.Facts { Layer = "A-WALL-EXT", Rule = "type by the guideline (guideline@3 · bds-office · 1a2b3c4d…)", SourceSha256 = sha, LedgerRow = "1287" },
            "yazan@example.com", "2026-10-02T12:00:00Z");
        var j = JsonNode.Parse(ghost).AsObject();
        Ok((string)j["layer"] == "A-WALL-EXT" && (string)j["source_sha256"] == sha && (string)j["ledger_row"] == "1287"
           && (string)j["approver"] == "yazan@example.com" && (string)j["placed_at"] == "2026-10-02T12:00:00Z" && ((string)j["rule"]).StartsWith("type by the guideline"),
           "a Ghost wall's stamp holds its layer, rule, source file sha, approver, ledger row and time");
        var promoted = JsonNode.Parse(ProvenanceStamp.Json("cs-2", "promote", new[] { "p1" }, uid, ghost, new ProvenanceStamp.Facts { LedgerRow = "1300" }, "lead@example.com", "2026-10-03T08:00:00Z")).AsObject();
        Ok((string)promoted["layer"] == "A-WALL-EXT" && (string)promoted["source_sha256"] == sha && promoted["rule"] == null
           && (string)promoted["ledger_row"] == "1300" && (string)promoted["approver"] == "lead@example.com" && (string)promoted["source"] == "promote",
           "a later change (Promote's retype) keeps the drawing's layer and sha; rule, approver, ledger row and source are the latest writer's");
        var datum = JsonNode.Parse(ProvenanceStamp.Json(null, "dwg", null, uid, null, new ProvenanceStamp.Facts { Layer = "A-ANNO-LEVL" }, "unsigned — yazan", "t")).AsObject();
        Ok(datum["changeset_id"] == null && datum["changeset_ids"].AsArray().Count == 0 && datum["proposal_guids"].AsArray().Count == 0,
           "a placer with no changeset (Datum, Massing) adds no null to changeset_ids");

        var said = ProvenanceStamp.Describe(ghost, uid);
        Ok(said.StartsWith("Placed or changed by Sentinel.") && said.Contains("Source: dwg") && said.Contains("Source file sha256: " + sha)
           && said.Contains("Layer: A-WALL-EXT") && said.Contains("Rule: type by the guideline") && said.Contains("Approver: yazan@example.com")
           && said.Contains("Ledger row: #1287") && said.Contains("Placed at: 2026-10-02T12:00:00Z (UTC, this PC's clock)"),
           "the reader shows the source file sha, layer, rule, approver and ledger row (drill row 'pick any wall')");
        Ok(ProvenanceStamp.Describe(ghost, "5a1c-0004c3f9").StartsWith("Copied, not placed by Sentinel — this stamp came with a copy of element 5a1c-0004c3f8"),
           "a stamp whose unique_id_at_placement is another element's reads as copied (drill row 'a copy-pasted wall')");
        var d2 = ProvenanceStamp.Describe(datum.ToJsonString(), uid);
        Ok(d2.Contains("(not signed in") && d2.Contains("Ledger row: none — not on a project ledger") && d2.Contains("Source file sha256: none recorded"),
           "signed out, no ledger row, no file read: each said in words, never left blank (founder decision F5)");
        var v1 = ProvenanceStamp.Describe(ProvenanceStamp.Json("seed-cs", "concept", new[] { "s1" }, uid).Replace("\"v\":2", "\"v\":1"), uid);
        Ok(v1.Contains("Layer: not recorded (a stamp from before MA-1a item 4)") && v1.Contains("Source: concept"), "a v1 stamp (MA-0) still reads, its missing fields named as older");
        Ok(ProvenanceStamp.Describe(null, uid).StartsWith("No Sentinel provenance stamp") && ProvenanceStamp.Describe("not json", uid).Contains("cannot be read"),
           "no stamp, or an unreadable one, is said so");

        AdjudicationDto A(string json) => JsonSerializer.Deserialize<AdjudicationDto>(json);
        Ok(A("{\"audit_id\":1287}").LedgerRow == "1287" && A("{\"audit_id\":\"1287\"}").LedgerRow == "1287" && A("{\"audit_id\":null}").LedgerRow == null
           && A("{}").LedgerRow == null && A("{\"audit_id\":{}}").LedgerRow == null,
           "the ledger row is the bridge's adjudication.audit_id, as a number or text; null, absent or odd is no row — never a failed read");

        var dir = Path.Combine(Path.GetTempPath(), "promote-check-sha");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "b.jpg"), "b");
        File.WriteAllText(Path.Combine(dir, "a.jpg"), "a");
        Ok(ProvenanceStamp.FileSha256(Path.Combine(dir, "a.jpg")) == "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"
           && ProvenanceStamp.FileSha256(Path.Combine(dir, "missing.jpg")) == null, "FileSha256 is the file's sha256 (\"a\" → ca978112…), null when unreadable");
        var both = ProvenanceStamp.FilesSha256(new[] { Path.Combine(dir, "b.jpg"), Path.Combine(dir, "a.jpg") });
        Ok(both != null && both == ProvenanceStamp.FilesSha256(new[] { Path.Combine(dir, "a.jpg"), Path.Combine(dir, "b.jpg") })
           && ProvenanceStamp.FilesSha256(new string[0]) == null && ProvenanceStamp.FilesSha256(new[] { Path.Combine(dir, "missing.jpg") }) == null,
           "FilesSha256 (Photo Massing's images) does not depend on the order read; null with no file or an unreadable one");
    }

    // ── 13. MA-1a item 5: the BLOCK check's diff and words ─────────────────────────────────────────────────────────────
    static void BlockChecks()
    {
        Console.WriteLine("\nMA-1a item 5 — the BLOCK check before commit (BlockCheck)");
        Violation V(string rule, EnforcementMode mode, long id, string name) => new Violation(rule, mode, id, name, "", null, null);
        var before = new List<Violation> { V("FN-01", EnforcementMode.Block, 100, "Desk [100]"), V("WS-01", EnforcementMode.Block, -1, "(missing) Shell"), V("VP-01", EnforcementMode.Warn, 7, "Plan") };
        var after = new List<Violation>(before)
        {
            V("FN-01", EnforcementMode.Block, 201, "Desk [201]"), V("FN-01", EnforcementMode.Block, 202, "Desk [202]"),
            V("LV-01", EnforcementMode.Block, 202, "Desk [202]"), V("VP-01", EnforcementMode.Warn, 203, "Plan 2"),
        };
        after[0] = V("FN-01", EnforcementMode.Block, 100, "Desk renamed [100]");
        var added = BlockCheck.Added(before, after);
        Ok(added.Count == 3 && added.All(v => v.ElementId == 201 || v.ElementId == 202), "the batch adds the new elements' BLOCK rows only — not a WARN row, not an element that already broke the rule (renamed or not)");
        Ok(BlockCheck.Elements(added) == 2, "an element breaking two rules counts once: N = 2");
        Ok(BlockCheck.Headline(added, true) == "This batch will block your sync: 2 element(s) (FN-01, LV-01)", "the design's words, with the rules");
        Ok(BlockCheck.Headline(added, false).EndsWith("— once this model is workshared; it is not, so no sync runs today"), "a model that is not workshared is told so — the same check, no false alarm about today's sync");
        Ok(BlockCheck.Rows(added, 2) == "• FN-01: Desk [201]\n• FN-01: Desk [202]\n… and 1 more", "the rows read as the sync's dialog lists them");
        Ok(BlockCheck.Added(before, before).Count == 0 && BlockCheck.Added(null, after).Count == 5, "nothing added → nothing to ask; no scan before → every BLOCK row after is new");
        Ok(BlockCheck.WentBack(added).StartsWith("You went back at the BLOCK check — nothing was placed. 2 element(s)") && BlockCheck.PlacedAnyway(added, true).Contains("placed anyway"),
           "the go-back and place-anyway lines");
    }
}
```

- [ ] **Step 9: Run the checks and both builds.**
  - `dotnet run --project tools/promote-check`: expect `219/219 checks pass` (25 new: 7 level-to-level, 11 stamp, 7 BLOCK).
  - `dotnet run --project tools/session-check`: expect `47/47 checks pass`.
  - Both builds: `0 Error(s)`, with `5 Warning(s)` (2024) and `3 Warning(s)` (2026), all master's.
- [ ] **Step 10: Commit.**

```bash
git add SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/Engine/ProvenanceStamp.cs SentinelAddin/Engine/BlockCheck.cs tools/promote-check/promote-check.csproj tools/promote-check/Check.cs tools/promote-check/Planner.cs tools/promote-check/Items.cs
git commit -F - <<'EOF'
feat(engine): the next-story rule, the full provenance stamp (v2) and its reader, the BLOCK diff — the pure half of MA-1a items 3–5

PromoteWallsPlanner.WallTop (Promote's attach rule for every new wall; on the top story the storey below's height; else a
refusal in words), stamp v2 (layer, rule, source_sha256, approver, ledger_row, placed_at; layer and sha carried from the
element's own earlier stamp), ProvenanceStamp.Describe ("copied, not placed by Sentinel" for a copy), FileSha256 and
FilesSha256, AdjudicationDto.LedgerRow, ProvenanceDto, and BlockCheck's diff and words. promote-check 219/219.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3 — The executor: walls level to level, the full stamp (items 3 and 4)

**Files:**
- Modify `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` (`:15`, `:54`, `:356-372`, `:564`)

**Interfaces:** no signature changes. A wall create without `TopElevation` now gets a constrained top, or an unconnected top on the top story, or a refusal. A create with no `BaseElevation` sits on its level. Every stamp carries the element's provenance, the proposal row, the approver and the time.

- [ ] **Step 1: The header says it.** In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
// each end that touches one, PlacementGeometry.EndsTouching); walls of the same changeset or build still join at corners.
```

with

```csharp
// each end that touches one, PlacementGeometry.EndsTouching); walls of the same changeset or build still join at corners.
// MA-1a item 3 (GHB-2): a wall create with no TopElevation rises to the next Building Story above its base, its top constrained
// there at offset 0 (PromoteWallsPlanner.WallTop — Promote's attach rule); on the top story it is unconnected at the storey
// below's height; with neither it is refused by name. An explicit TopElevation stays unconnected, as reviewed. With no
// BaseElevation the base is the level itself. Item 4: the stamp also carries the element's layer, rule and source file as
// filed (provenance), the changeset's proposal row on the ledger, the approver and the time.
```

- [ ] **Step 2: The levels as the rule reads them.** Replace

```csharp
    private static XYZ Pt(double[] p) => new XYZ(p[0] * MmToFeet, p[1] * MmToFeet, p[2] * MmToFeet);
```

with

```csharp
    private static XYZ Pt(double[] p) => new XYZ(p[0] * MmToFeet, p[1] * MmToFeet, p[2] * MmToFeet);

    // MA-1a item 3: the model's levels as the next-story rule reads them (Promote reads them the same way).
    private static List<LevelFact> Stories(Document doc) => new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
        .Select(l => new LevelFact { Name = l.Name, ElevationMm = l.Elevation / MmToFeet, IsStory = l.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.AsInteger() == 1 })
        .ToList();
```

- [ ] **Step 3: A wall's base and top (E1, E2, F2, F3).** Replace

```csharp
            foreach (var el in wallCreates)
            {
                at = Label(el);
                var c = el.Place.LocationCurve;
                var level = ResolveLevel(doc, el.Place);
                var wt = ResolveWallType(doc, el.Place.TypeName);
                var baseMm = el.Place.BaseElevation ?? 0;
                var topMm = el.Place.TopElevation ?? (baseMm + 3000);
```

with

```csharp
            List<LevelFact> stories = null; // read once, when the first wall needs its top (after this changeset's levels exist)
            foreach (var el in wallCreates)
            {
                at = Label(el);
                var c = el.Place.LocationCurve;
                var level = ResolveLevel(doc, el.Place);
                var wt = ResolveWallType(doc, el.Place.TypeName);
                // MA-1a item 3 (GHB-2): the base is BaseElevation, or the level itself (0 mm put a named level's wall at minus its
                // elevation). The top is TopElevation, unconnected, as reviewed; else the next Building Story above the base,
                // constrained there; on the top story, unconnected at the storey below's height (founder decision F2); else a
                // refusal in words — never a constant.
                var baseMm = el.Place.BaseElevation ?? level.Elevation / MmToFeet;
                Level topLevel = null;
                double topMm;
                if (el.Place.TopElevation is double sent) topMm = sent;
                else
                {
                    var top = PromoteWallsPlanner.WallTop(stories ??= Stories(doc), baseMm, level.Name, out var why)
                              ?? throw new InvalidOperationException($"wall \"{el.Validate?.Identity?.Name ?? el.ProposalGuid}\": {why}");
                    topMm = top.TopMm;
                    if (top.TopLevel != null) topLevel = LevelNamed(doc, top.TopLevel);
                }
```

- [ ] **Step 4: A constrained top uses attach's own parameters.** Replace

```csharp
                var wall = Wall.Create(doc, curve, wt.Id, level.Id, heightFt, offsetFt, false, false);
```

with

```csharp
                var wall = Wall.Create(doc, curve, wt.Id, level.Id, heightFt, offsetFt, false, false);
                if (topLevel != null)
                {
                    // Attach's own two parameters (MA-0, live on Revit 2024): the top follows the story level from now on.
                    Set(wall, BuiltInParameter.WALL_HEIGHT_TYPE, topLevel.Id);
                    Set(wall, BuiltInParameter.WALL_TOP_OFFSET, 0.0);
                }
```

- [ ] **Step 5: The full stamp (E4, E5).** Replace

```csharp
            at = "the provenance stamp";
            foreach (var g in result.Applied.GroupBy(a => a.RevitUniqueId))
                ProvenanceStamp.Write(doc.GetElement(g.Key), cs.Id, cs.Source, g.Select(a => a.ProposalGuid));
```

with

```csharp
            at = "the provenance stamp";
            // MA-1a item 4: plus the element's layer, rule and source file as filed (its provenance; null for an agent's or
            // Promote's element) and the changeset's proposal row on the ledger (null for a local changeset); the approver and
            // the time are the writer's (ProvenanceStamp.Write).
            var ledgerRow = cs.Adjudication?.LedgerRow;
            foreach (var g in result.Applied.GroupBy(a => a.RevitUniqueId))
            {
                var p = g.Select(a => toPlace.First(e => e.ProposalGuid == a.ProposalGuid).Provenance).FirstOrDefault(x => x != null);
                ProvenanceStamp.Write(doc.GetElement(g.Key), cs.Id, cs.Source, g.Select(a => a.ProposalGuid),
                                      new ProvenanceStamp.Facts { Layer = p?.Layer, Rule = p?.Rule, SourceSha256 = p?.SourceSha256, LedgerRow = ledgerRow });
            }
```

- [ ] **Step 6: Build and check.** Both builds: `0 Error(s)`, with `5` and `3 Warning(s)`. `promote-check` still reads `219/219`. There is no new offline check: the executor is Revit-bound, and its decisions (`WallTop`, `ProvenanceStamp.Json`) are checked in Task 2. Drill rows I3-1, I3-5 and I4-1 prove the wiring.
- [ ] **Step 7: Commit.**

```bash
git add SentinelAddin/GhostBuilder/ChangesetExecutor.cs
git commit -F - <<'EOF'
feat(executor): walls go level to level — no TopElevation tops the wall at the next Building Story; every stamp is the full one (MA-1a items 3–4)

A create without TopElevation is constrained to the next story above its base (attach's WALL_HEIGHT_TYPE /
WALL_TOP_OFFSET), unconnected at the storey below's height on the top story, refused by name with neither; an explicit
TopElevation stays unconnected, as reviewed; no BaseElevation = the level itself (was 0 mm). The 3000 mm default is gone.
Each stamp adds the element's provenance as filed, the changeset's proposal row (adjudication.audit_id), the approver and
the time.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4 — Ghost Builder: the drawing's Z, no 10 ft, each element's layer, rule and sha (items 3 and 4)

**Files:**
- Modify `SentinelAddin/GhostBuilder/GhostFiling.cs` (`:7`, `:46`, `:80`, `:84`)
- Modify `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` (`:44`, `:223`, `:225`, `:239`, `:247`, `:300`, `:350`)
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (`:117`, `:200`, `:229`, `:252`)
- Modify `SentinelAddin/Commands.GhostBuilder.cs` (`:71`, `:145`, `:168`, `:243`)
- Modify `tools/promote-check/Filing.cs` (`:16`, `:40`, `:86`, `:94`, `:105`)
- Replace `WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json` whole
- Modify `WebApp/bridge/changesets-logic.test.mjs` (`:560`)

**Interfaces:**
- `GhostFiling.WallBase(levelMm, cadZFt, importZFt)` replaces `WallElevations`.
- `GhostFiling.Wall(…, CurveDto run, double baseMm)` loses `topMm`.
- `GhostFiling.Rule(typedBy, mappingSource, guideline, layers)`.
- Every `GhostFiling` element carries `Provenance { Layer }`.
- `GhostChangesetBuild.Request` gains `ImportZFt`, `SourceSha256`, `GuidelineLabel` and `LayersLabel`.
- `GhostElement.TopElevation` stays: Photo Massing uses it. The DWG extractor no longer sets it.

- [ ] **Step 1: The filing half.** In `SentinelAddin/GhostBuilder/GhostFiling.cs`, make four replacements. First, replace

```csharp
// GhostChangesetBuild.
using System;
```

with

```csharp
// GhostChangesetBuild.
// MA-1a item 3 (GHB-2): a wall is filed with its base only — the drawing's Z read from the import's own Z — and the executor
// gives it its top (the next Building Story). Item 4: each element carries its provenance into its stamp: the layer here, the
// rule and the drawing's sha from the planner.
using System;
```

Second, replace

```csharp
        /// <summary>A wall's base and top in absolute mm, as the executor reads them: the CAD Z is the wall's offset from the
        /// build level (Ghost's rule since P1), and its height is CAD top − CAD base (10 ft when the drawing has none), at
        /// least ten times Revit's short-curve tolerance.</summary>
        public static (double Base, double Top) WallElevations(double levelMm, double cadBaseFt, double cadTopFt, double tolFt)
        {
            double b = levelMm + cadBaseFt * FtToMm;
            return (b, b + Math.Max(cadTopFt - cadBaseFt, tolFt * 10) * FtToMm);
        }
```

with

```csharp
        /// <summary>MA-1a item 3 (GHB-2): a DWG wall's base in absolute mm — the build level plus its drawing Z measured from the
        /// import's own Z (<paramref name="importZFt"/>, ImportInstance.GetTotalTransform().Origin.Z). The extractor reads the
        /// drawing in model coordinates, so a plan imported in a raised level's view carries that level's elevation in every Z;
        /// adding it to the build level again put Level 3 walls at +18 m (audit GHB-2). The top is the executor's.</summary>
        public static double WallBase(double levelMm, double cadZFt, double importZFt) => levelMm + (cadZFt - importZFt) * FtToMm;
```

Third, replace

```csharp
            Validate = new ValidateDto { Identity = new IdentityDto { Class = Kinds.Values.First(k => k.Kind == kind).Ifc, Name = Clip($"{layer} #{n}", 256) } },
            Place = place,
        };
```

with

```csharp
            Validate = new ValidateDto { Identity = new IdentityDto { Class = Kinds.Values.First(k => k.Kind == kind).Ifc, Name = Clip($"{layer} #{n}", 256) } },
            Place = place,
            Provenance = new ProvenanceDto { Layer = Clip(layer, 256) }, // MA-1a item 4: the planner adds the rule and the drawing's sha
        };
```

Fourth, replace

```csharp
        /// <param name="typedBy">"guideline", "mapping" or "reviewer" (ElementPlacementFactory.ResolveWallType).</param>
        public static ChangesetElementDto Wall(string layer, int n, string typedBy, string typeName, string level, CurveDto run, double baseMm, double topMm) =>
            Create("wall", layer, n, typedBy, new PlaceDto { TypeName = typeName, LevelName = level, LocationCurve = run, BaseElevation = baseMm, TopElevation = topMm });
```

with

```csharp
        /// <summary>MA-1a item 4: the stamp's rule for a Ghost element, in words — what typed it: the guideline (its artefact
        /// label), the reviewer's pick in Ghost's review, or the layer mapping and its tier (with the layers standard when the
        /// tier is the standard).</summary>
        /// <param name="typedBy">A wall's ElementPlacementFactory.ResolveWallType answer; null for any other kind.</param>
        /// <param name="mappingSource">LayerMapping.Source: standard, heuristic, llm, cache or reviewer.</param>
        public static string Rule(string typedBy, string mappingSource, string guideline, string layers) => Clip(
            typedBy == "guideline" ? $"type by the guideline ({guideline})"
            : typedBy == "reviewer" || mappingSource == "reviewer" ? "type picked by the reviewer in Ghost's review"
            : $"type by the layer mapping ({mappingSource ?? "unknown"}" + (mappingSource == "standard" ? $": {layers}" : "") + ")", 500);

        /// <param name="typedBy">"guideline", "mapping" or "reviewer" (ElementPlacementFactory.ResolveWallType).</param>
        /// <param name="baseMm">Absolute (<see cref="WallBase"/>). No TopElevation: the executor tops the wall (MA-1a item 3).</param>
        public static ChangesetElementDto Wall(string layer, int n, string typedBy, string typeName, string level, CurveDto run, double baseMm) =>
            Create("wall", layer, n, typedBy, new PlaceDto { TypeName = typeName, LevelName = level, LocationCurve = run, BaseElevation = baseMm });
```

- [ ] **Step 2: The request carries the import's Z, the drawing's sha and the standards' labels.** In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
            /// <summary>The drawing's name, for the changeset names.</summary>
            public string Drawing;
        }
```

with

```csharp
            /// <summary>The drawing's name, for the changeset names.</summary>
            public string Drawing;
            /// <summary>MA-1a item 3: the DWG import's own Z (ft) — the drawing's Z is read from it (GhostFiling.WallBase).</summary>
            public double ImportZFt;
            /// <summary>MA-1a item 4: the drawing file's sha256 when this run imported it; null when the import was already in the
            /// model (it may be older than the file — GHB-3) or was picked from the model (no file).</summary>
            public string SourceSha256;
            /// <summary>MA-1a item 4: the guideline and layers standards as the review header names them (artefact labels).</summary>
            public string GuidelineLabel, LayersLabel;
        }
```

- [ ] **Step 3: Each planned element gets its rule and sha.** In the same file, replace

```csharp
                int Next(string layer) => seq[layer] = seq.TryGetValue(layer, out int k) ? k + 1 : 1;
```

with

```csharp
                int Next(string layer) => seq[layer] = seq.TryGetValue(layer, out int k) ? k + 1 : 1;
                // MA-1a item 4: what the stamp records beyond the layer (GhostFiling) — the rule that typed it and the drawing's sha.
                ChangesetElementDto Prov(ChangesetElementDto dto, LayerMapping map, string typedBy)
                {
                    dto.Provenance.Rule = GhostFiling.Rule(typedBy, map.Source, r.GuidelineLabel, r.LayersLabel);
                    dto.Provenance.SourceSha256 = r.SourceSha256;
                    return dto;
                }
```

- [ ] **Step 4: Walls: the base from the import's Z, the top by the executor's rule, a gap where it refuses (F2).** In the same file, make three replacements. First, replace

```csharp
                foreach (var (el, map, type, typedBy) in walls)
                {
                    var (baseMm, topMm) = GhostFiling.WallElevations(levelMm, el.BaseElevation, el.TopElevation, tolFt);
```

with

```csharp
                // MA-1a item 3 (GHB-2): each wall's top is the executor's next-story rule, checked here, so a wall it would refuse is a
                // named gap, never a whole-build decline; one line per answer says where the walls go.
                var stories = levels.Select(l => new LevelFact { Name = l.Name, ElevationMm = l.Elevation * FtToMm,
                                                                 IsStory = l.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.AsInteger() == 1 }).ToList();
                var tops = new HashSet<string>();
                foreach (var (el, map, type, typedBy) in walls)
                {
                    double baseMm = GhostFiling.WallBase(levelMm, el.BaseElevation, r.ImportZFt);
                    var top = PromoteWallsPlanner.WallTop(stories, baseMm, level.Name, out string topWhy);
                    if (top == null)
                    {
                        report.WallGaps++;
                        report.Warnings.Add($"Walls on '{el.CadLayer}': {topWhy}; skipped.");
                        continue;
                    }
                    tops.Add(top.Value.TopLevel != null
                        ? $"Walls on {level.Name} rise to {top.Value.TopLevel}, the next Building Story above; their tops are attached to it (GHB-2)."
                        : $"Walls on {level.Name}: no Building Story above — unconnected, {top.Value.TopMm - baseMm:0} mm high, the storey below's height (founder decision F2).");
```

Second, replace

```csharp
                        plan.Add(new Planned { Map = map, What = $"Walls on '{el.CadLayer}'", Dto = GhostFiling.Wall(el.CadLayer, n, typedBy, type, level.Name, run, baseMm, topMm) });
```

with

```csharp
                        plan.Add(new Planned { Map = map, What = $"Walls on '{el.CadLayer}'", Dto = Prov(GhostFiling.Wall(el.CadLayer, n, typedBy, type, level.Name, run, baseMm), map, typedBy) });
```

Third, replace

```csharp
                    if (filedRuns == 0) report.SkippedNoGeometry++;
                }
```

with

```csharp
                    if (filedRuns == 0) report.SkippedNoGeometry++;
                }
                report.Warnings.AddRange(tops);
```

- [ ] **Step 5: Floors, ceilings and point families carry their provenance; the ceiling's height uses the same frame (E3).** In the same file, make two replacements. First, replace

```csharp
                        if (k.Kind == "floor")
                            plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Floor(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm, p.Z * FtToMm }).ToList()) });
                        else
                        {
                            double offsetMm = corners[0].Z * FtToMm; // F7: the drawing's height above the build level
                            plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Ceiling(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm }).ToList(), offsetMm) });
```

with

```csharp
                        if (k.Kind == "floor")
                            plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Floor(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm, p.Z * FtToMm }).ToList()), map, null) });
                        else
                        {
                            // F7: the drawing's height above the build level — measured from the import's own Z (MA-1a item 3), as walls are.
                            double offsetMm = (corners[0].Z - r.ImportZFt) * FtToMm;
                            plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Ceiling(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm }).ToList(), offsetMm), map, null) });
```

Second, replace

```csharp
                    plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Point(k.Kind, el.CadLayer, Next(el.CadLayer), sym.FamilyName, sym.Name, level.Name, x, y, levelMm) });
```

with

```csharp
                    plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Point(k.Kind, el.CadLayer, Next(el.CadLayer), sym.FamilyName, sym.Name, level.Name, x, y, levelMm), map, null) });
```

- [ ] **Step 6: The 10 ft constant goes.** In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, make four replacements. First, replace

```csharp
                                    BaseElevation = pts[0].Z,
                                    // Height driver in case this layer maps to Walls, not Floors.
                                    TopElevation = pts[0].Z + WallDefaultHeightFt
                                });
```

with

```csharp
                                    BaseElevation = pts[0].Z, // a wall's top is the executor's: the next story (MA-1a item 3)
                                });
```

Second, replace

```csharp
                BaseElevation = z,
                TopElevation = z + WallDefaultHeightFt
            });
```

with

```csharp
                BaseElevation = z, // a wall's top is the executor's: the next story (MA-1a item 3)
            });
```

Third, replace

```csharp
            return curves;
        }

        // LOD 200 default wall height when the 2D CAD carries no Z info (10 ft).
        // ponytail: hard-coded; lift to per-category config when projects vary floor-to-floor.
        private const double WallDefaultHeightFt = 10.0;
    }
```

with

```csharp
            return curves;
        }
    }
```

Fourth, replace

```csharp
        public double TopElevation { get; set; }         // walls: height driver
```

with

```csharp
        public double TopElevation { get; set; }         // Photo Massing's walls: height driver (a DWG wall's top is the executor's, MA-1a item 3)
```

- [ ] **Step 7: The command reads the import's Z and hashes a drawing it imports (E7).** In `SentinelAddin/Commands.GhostBuilder.cs`, make four replacements. First, replace

```csharp
        ImportInstance? cadLink = null;
```

with

```csharp
        ImportInstance? cadLink = null;
        string? sourceSha = null; // MA-1a item 4: the drawing's sha256 — only when this run imports it (a reused import may be older, GHB-3)
```

Second, replace

```csharp
                        return Result.Failed;
                    }
                    t.Commit();
```

with

```csharp
                        return Result.Failed;
                    }
                    t.Commit();
                    sourceSha = ProvenanceStamp.FileSha256(dwgPath);
```

Third, replace

```csharp
        string drawing = Path.GetFileNameWithoutExtension(doc.GetElement(cadLink.GetTypeId())?.Name ?? "drawing");
```

with

```csharp
        string drawing = Path.GetFileNameWithoutExtension(doc.GetElement(cadLink.GetTypeId())?.Name ?? "drawing");
        // MA-1a item 3 (GHB-2): the import's own Z — the extractor reads the drawing in model coordinates, raised by it.
        double importZFt = cadLink.GetTotalTransform().Origin.Z;
```

Fourth, replace

```csharp
                Guideline = standards!.Guideline, LibraryDir = libraryDir, Key = key, Drawing = drawing,
```

with

```csharp
                Guideline = standards!.Guideline, LibraryDir = libraryDir, Key = key, Drawing = drawing,
                ImportZFt = importZFt, SourceSha256 = sourceSha, GuidelineLabel = standards!.GuidelineSource.Label, LayersLabel = standards!.LayersSource.Label,
```

- [ ] **Step 8: promote-check's filing checks.** In `tools/promote-check/Filing.cs`, make five replacements. First, replace

```csharp
        var (b, t) = GhostFiling.WallElevations(3000, 0, 10, Tol);
        Ok(Math.Abs(b - 3000) < 1e-9 && Math.Abs(t - 6048) < 1e-9,
           "a 10 ft CAD wall at CAD Z 0 on a level at 3000 mm → base 3000, top 6048 (absolute mm: the CAD Z is the offset from the level)");
        var (b1, t1) = GhostFiling.WallElevations(0, 1, 1, Tol);
        Ok(Math.Abs(b1 - 304.8) < 1e-9 && t1 > b1, "a CAD wall with no height still rises ten short-curve tolerances — the executor refuses top ≤ base");
```

with

```csharp
        // MA-1a item 3 (GHB-2): the drawing's Z is read from the import's own Z, and a wall is filed with no top.
        Ok(Math.Abs(GhostFiling.WallBase(9000, 9000 / 304.8, 9000 / 304.8) - 9000) < 1e-6,
           "a plan imported on L3 (+9 m) and built on L3 → base 9000 mm, offset 0 (+18 m before: audit GHB-2)");
        Ok(Math.Abs(GhostFiling.WallBase(9000, 0, 0) - 9000) < 1e-9 && Math.Abs(GhostFiling.WallBase(3000, 1, 0) - 3304.8) < 1e-9,
           "a plan imported on L1 and built on L3 lands on L3; a CAD Z 1 ft above the import is 304.8 mm above the build level");
        Ok(GhostFiling.Wall("A-WALL", 1, "mapping", "Generic - 200mm", "Level 1", GhostFiling.Run(new double[] { 0, 0 }, new double[] { 5000, 0 }, null, 0, 1), 0)
               .Place.TopElevation == null,
           "a Ghost wall is filed with no TopElevation — the executor gives it the next story (no 10 ft constant)");
        // MA-1a item 4: the rule the stamp records.
        Ok(GhostFiling.Rule("guideline", "llm", "guideline@3 · x", "layers@1 · y") == "type by the guideline (guideline@3 · x)"
           && GhostFiling.Rule("mapping", "standard", "g", "layers@1 · y") == "type by the layer mapping (standard: layers@1 · y)"
           && GhostFiling.Rule(null, "llm", "g", "l") == "type by the layer mapping (llm)"
           && GhostFiling.Rule(null, "reviewer", "g", "l") == "type picked by the reviewer in Ghost's review",
           "the stamp's rule names what typed an element: the guideline (its artefact), the layer mapping's tier (the layers standard), or the reviewer");
```

Second, replace

```csharp
            : GhostFiling.Wall("A-WALL", i, "mapping", "Generic - 200mm", "Level 1", R(i, 0, i + 100, 0), 0, 3048)).ToList();
```

with

```csharp
            : GhostFiling.Wall("A-WALL", i, "mapping", "Generic - 200mm", "Level 1", R(i, 0, i + 100, 0), 0)).ToList();
```

Third, replace

```csharp
            GhostFiling.Wall("A-WALL-EXT", 1, "mapping", "Generic - 200mm", "Level 1", R(0, 0, 10000, 0), 0, 3048),
            GhostFiling.Wall("A-WALL-EXT", 2, "guideline", "Generic - 200mm", "Level 1",
                             GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 1000 }, 0, 1), 0, 3048),
```

with

```csharp
            GhostFiling.Wall("A-WALL-EXT", 1, "mapping", "Generic - 200mm", "Level 1", R(0, 0, 10000, 0), 0),
            GhostFiling.Wall("A-WALL-EXT", 2, "guideline", "Generic - 200mm", "Level 1",
                             GhostFiling.Run(new double[] { 0, 0 }, new double[] { 2000, 0 }, new double[] { 1000, 1000 }, 0, 1), 0),
```

Fourth, replace

```csharp
            GhostFiling.Point("furniture", "A-FURN", 1, "M_Desk", "1525 x 762mm", "Level 1", 2000, 2000, 0),
        };
```

with

```csharp
            GhostFiling.Point("furniture", "A-FURN", 1, "M_Desk", "1525 x 762mm", "Level 1", 2000, 2000, 0),
        };
        // MA-1a item 4: the planner adds the rule and the drawing's sha to the layer GhostFiling set (GhostChangesetBuild.Prov).
        els[0].Provenance.Rule = GhostFiling.Rule("mapping", "standard", "guideline@3 · bds-office · 1a2b3c4d…", "layers@1 · bds-office · 9f8e7d6c…");
        els[0].Provenance.SourceSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        els[1].Provenance.Rule = GhostFiling.Rule("guideline", "standard", "guideline@3 · bds-office · 1a2b3c4d…", "layers@1 · bds-office · 9f8e7d6c…");
        els[4].Provenance.Rule = GhostFiling.Rule(null, "reviewer", "none", "none");
```

Fifth, replace

```csharp
           && cs.Elements.Where(e => e.Kind is "column" or "furniture").All(e => e.Place.FamilyName != null && e.Place.Location?.Length == 3),
           "the fixture reads back into the add-in's DTOs: source dwg, the arc's mid point, columns and furniture with FamilyName and Location");
```

with

```csharp
           && cs.Elements.Where(e => e.Kind is "column" or "furniture").All(e => e.Place.FamilyName != null && e.Place.Location?.Length == 3)
           && cs.Elements.All(e => e.Provenance?.Layer != null && e.Place.TopElevation == null) && cs.Elements[0].Provenance.SourceSha256?.Length == 64,
           "the fixture reads back into the add-in's DTOs: source dwg, the arc's mid point, columns and furniture with FamilyName and Location, " +
           "every element's provenance, no wall TopElevation (MA-1a items 3–4)");
```

- [ ] **Step 9: Replace `WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json` whole** with

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
                 "LocationCurve": { "start": [0, 0, 0], "end": [10000, 0, 0] }, "BaseElevation": 0 },
      "provenance": { "layer": "A-WALL-EXT", "rule": "type by the layer mapping (standard: layers@1 · bds-office · 9f8e7d6c…)",
                      "source_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" }
    },
    {
      "kind": "wall", "op": "create", "reason": "Ghost Builder: wall on layer A-WALL-EXT, typed by the guideline",
      "validate": { "identity": { "Class": "IfcWall", "Name": "A-WALL-EXT #2" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "Level 1",
                 "LocationCurve": { "start": [0, 0, 0], "end": [2000, 0, 0], "mid": [1000, 1000, 0] }, "BaseElevation": 0 },
      "provenance": { "layer": "A-WALL-EXT", "rule": "type by the guideline (guideline@3 · bds-office · 1a2b3c4d…)" }
    },
    {
      "kind": "floor", "op": "create", "reason": "Ghost Builder: floor on layer A-FLOR",
      "validate": { "identity": { "Class": "IfcSlab", "Name": "A-FLOR #1" } },
      "place": { "TypeName": "Generic 150mm", "LevelName": "Level 1",
                 "LocationLoop": [[0, 0, 0], [10000, 0, 0], [10000, 7000, 0], [0, 7000, 0]] },
      "provenance": { "layer": "A-FLOR" }
    },
    {
      "kind": "ceiling", "op": "create", "reason": "Ghost Builder: ceiling on layer A-CLNG",
      "validate": { "identity": { "Class": "IfcCovering", "Name": "A-CLNG #1" } },
      "place": { "TypeName": "600 x 600mm Grid", "LevelName": "Level 1",
                 "Boundary": [[0, 0], [4000, 0], [4000, 7000], [0, 7000]], "Offset": 0 },
      "provenance": { "layer": "A-CLNG" }
    },
    {
      "kind": "door", "op": "create", "reason": "Ghost Builder: door on layer A-DOOR",
      "validate": { "identity": { "Class": "IfcDoor", "Name": "A-DOOR #1" } },
      "place": { "TypeName": "0915 x 2134mm", "LevelName": "Level 1", "FamilyName": "M_Single-Flush", "Location": [6450, 0, 0] },
      "provenance": { "layer": "A-DOOR", "rule": "type picked by the reviewer in Ghost's review" }
    },
    {
      "kind": "window", "op": "create", "reason": "Ghost Builder: window on layer A-GLAZ",
      "validate": { "identity": { "Class": "IfcWindow", "Name": "A-GLAZ #1" } },
      "place": { "TypeName": "0915 x 1220mm", "LevelName": "Level 1", "FamilyName": "M_Fixed", "Location": [10000, 3500, 0] },
      "provenance": { "layer": "A-GLAZ" }
    },
    {
      "kind": "column", "op": "create", "reason": "Ghost Builder: column on layer A-COLS",
      "validate": { "identity": { "Class": "IfcColumn", "Name": "A-COLS #1" } },
      "place": { "TypeName": "457 x 610mm", "LevelName": "Level 1", "FamilyName": "M_Rectangular Column", "Location": [5000, 3500, 0] },
      "provenance": { "layer": "A-COLS" }
    },
    {
      "kind": "furniture", "op": "create", "reason": "Ghost Builder: furniture on layer A-FURN",
      "validate": { "identity": { "Class": "IfcFurniture", "Name": "A-FURN #1" } },
      "place": { "TypeName": "1525 x 762mm", "LevelName": "Level 1", "FamilyName": "M_Desk", "Location": [2000, 2000, 0] },
      "provenance": { "layer": "A-FURN" }
    }
  ]
}
```

- [ ] **Step 10: The bridge keeps it.** In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
    expect(v.elements.map((e) => e.kind)).toEqual(["wall", "wall", "floor", "ceiling", "door", "window", "column", "furniture"]);
    expect(v.elements[1].place.LocationCurve.mid).toEqual([1000, 1000, 0]);
```

with

```js
    expect(v.elements.map((e) => e.kind)).toEqual(["wall", "wall", "floor", "ceiling", "door", "window", "column", "furniture"]);
    expect(v.elements[1].place.LocationCurve.mid).toEqual([1000, 1000, 0]);
    // MA-1a items 3–4: walls carry no TopElevation (the executor tops them); every element keeps its provenance as filed.
    expect(v.elements.filter((e) => e.kind === "wall").every((e) => e.place.TopElevation === undefined)).toBe(true);
    v.elements.forEach((el, i) => expect(el.provenance).toMatchObject(body.elements[i].provenance));
    expect(v.elements[0].provenance.source_sha256).toMatch(/^[0-9a-f]{64}$/);
```

- [ ] **Step 11: Run.**
  - `dotnet run --project tools/promote-check`: expect `221/221 checks pass`.
  - From `WebApp`, `npx vitest run bridge/changesets-logic.test.mjs`: expect `Tests  61 passed (61)`.
  - `ghost-p2-check` `103/103`, `session-check` `47/47`, `ghost-standards-check` `146/146`, `wallpair-check` `9/9`, `massing-check` `13/13`, `datum-check` `DATUM OK`.
  - Both builds: `0 Error(s)`, with `5` and `3 Warning(s)`.
  - `grep -rn "WallDefaultHeightFt\|WallElevations\|baseMm + 3000" SentinelAddin tools --include=*.cs` prints nothing.
- [ ] **Step 12: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostFiling.cs SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/Commands.GhostBuilder.cs tools/promote-check/Filing.cs WebApp/bridge/fixtures/changeset-ops/ghost-dwg-body.json WebApp/bridge/changesets-logic.test.mjs
git commit -F - <<'EOF'
feat(ghost): walls from level to level — the drawing's Z read from the import, no 10 ft, the top by the executor's rule; each element's layer, rule and drawing sha ride into its stamp (MA-1a items 3–4, GHB-2)

A plan imported on L3 and built on L3 lands at L3 + 0 (was +18 m). Walls are filed with no TopElevation; one the
executor would refuse (no story above, none below) is a named gap before filing, and the summary says where the walls go.
The DWG's sha is taken only when this run imports it (a reused import may be older — GHB-3).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5 — The BLOCK check before commit (item 5)

**Files:**
- Modify `SentinelAddin/Engine/RuleEngineHost.cs` (`:126`, `:195`, `:218`)
- Modify `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` (`:46`)
- Replace `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` whole
- Modify `SentinelAddin/Commands.ReviewChangesets.cs` (`:145`, `:153`)
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (`:353`)
- Modify `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` (`:17`, `:153`, `:421`, `:444`, `:471`)
- Modify `SentinelAddin/UI/GhostReviewWindow.cs` (`:444`, `:450`)
- Modify `SentinelAddin/Commands.GhostBuilder.cs` (`:261`)

**Interfaces:**
- `ChangesetExecutor.ExecutionResult.Block` (string).
- `GhostPlacementEngine.PlacementReport.WentBack` (bool).
- `GhostReviewWindow.Reopen(string status)`.
- A `parameter` rule with non-empty `categories` scans the model elements of those categories (full scan only).

- [ ] **Step 1: Parameter rules with categories judge model elements (F9, E13).** In `SentinelAddin/Engine/RuleEngineHost.cs`, make three replacements. First, replace

```csharp
    private static int ScanParameter(Document doc, Rule rule, string org, List<Violation> sink)
    {
        if (rule.ParameterName is null) return 0;
        int n = 0;
```

with

```csharp
    private static int ScanParameter(Document doc, Rule rule, string org, List<Violation> sink)
    {
        if (rule.ParameterName is null) return 0;
        int n = 0;
        // MA-1a item 5 (the full-scan half of SCAN-E1): a parameter rule WITH categories judges the model elements of those
        // categories (Walls, Furniture, …), so a batch that leaves a BLOCK property empty is caught before commit and at sync.
        // Full scan only: the DMU delta never judges it (a REQUEST rule there would file rename requests). A rule without
        // categories judges views, as before (VP-01).
        if (rule.Categories.Count > 0)
        {
            // ponytail: only the English keys Compat maps (a custom key matches nothing here); widen Compat's map when one is needed.
            var bics = rule.Categories.Select(Compat.ResolveCategoryKey).Where(b => b != BuiltInCategory.INVALID).Distinct().ToList();
            if (bics.Count == 0) return 0;
            foreach (Element e in new FilteredElementCollector(doc).WherePasses(new ElementMulticategoryFilter(bics)).WhereElementIsNotElementType())
            {
                if (IsExcluded(rule, e.Name)) continue;
                n++;
                CheckParameter(e, rule, org, sink, $"{e.Name} [{e.Id.IdValue()}]");
            }
            return n;
        }
```

Second, replace

```csharp
            case RuleTarget.Parameter when e is View pv && !pv.IsTemplate && IsUserView(pv):
```

with

```csharp
            case RuleTarget.Parameter when rule.Categories.Count == 0 && e is View pv && !pv.IsTemplate && IsUserView(pv): // MA-1a item 5: a rule with categories judges elements, in the full scan only
```

Third, replace

```csharp
    private static void CheckParameter(Element e, Rule rule, string org, List<Violation> sink)
    {
        if (rule.ParameterName is null) return;   // nothing to check (the live DMU path had no guard)
        if (!ParamValue.Filled(e, rule.ParameterName))  // by storage type, instance then type (SCAN-E1)
            sink.Add(Make(rule, org, e.Id.IdValue(), e.Name));
    }
```

with

```csharp
    private static void CheckParameter(Element e, Rule rule, string org, List<Violation> sink, string? name = null)
    {
        if (rule.ParameterName is null) return;   // nothing to check (the live DMU path had no guard)
        if (!ParamValue.Filled(e, rule.ParameterName))  // by storage type, instance then type (SCAN-E1)
            sink.Add(Make(rule, org, e.Id.IdValue(), name ?? e.Name));
    }
```

- [ ] **Step 2: The result carries the BLOCK line.** In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
        public string NotFinished { get; set; }
    }
```

with

```csharp
        public string NotFinished { get; set; }
        /// MA-1a item 5: the BLOCK check's line — placed anyway with N element(s) that will block a sync, or why BLOCK rules
        /// were not checked; null when none can fire. Set by ChangesetPlacementEvent; it rides on the result's note.
        public string Block { get; set; }
    }
```

- [ ] **Step 3: Replace `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` whole (E10)** with

```csharp
#nullable disable
// Revit API writes must NEVER run from Task.Run — the executor runs here, on the API context the
// ExternalEvent provides, mirroring GhostBuilderPlacementEvent's snapshot pattern.
// MA-1a item 5: when the model's ruleset has a BLOCK rule, the changeset runs inside a TransactionGroup named as its own
// transaction (one Undo entry, which the undo watcher finds by that name), and before the group is kept the BLOCK check asks
// "This batch will block your sync: N element(s)". Go back rolls the group back and the changeset stays proposed (NotRun);
// Place anyway keeps it, and the line rides on the result's note. Without a BLOCK rule nothing changes here.
using System;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder;

public sealed class ChangesetPlacementEvent : IExternalEventHandler
{
    public event Action<ChangesetExecutor.ExecutionResult> Completed;

    private ChangesetDto _cs;
    private HashSet<string> _ticked;
    private Document _doc;   // the model the review window was opened on (XC-1)

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc) { _cs = cs; _ticked = ticked; _doc = doc; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked; var doc = _doc;
        _cs = null; _ticked = null; _doc = null;
        if (cs == null || ticked == null || doc == null)
        {
            // A Raise without a staged request must still complete — a silent return would hang
            // any caller awaiting the callback.
            Completed?.Invoke(new ChangesetExecutor.ExecutionResult { Error = "no request staged", NotRun = true });
            return;
        }
        if (DocPin.Check(app, doc, "place the proposals") is { } refusal)
        {
            Completed?.Invoke(new ChangesetExecutor.ExecutionResult { Error = refusal, NotRun = true });
            return;
        }
        var before = BlockCheck.Before(doc, out var note);
        if (before == null)
        {
            var plain = new ChangesetExecutor().Execute(doc, cs, ticked);
            plain.Block = note; // "not checked — the ruleset has not loaded yet", or null: no BLOCK rule can fire
            Completed?.Invoke(plain);
            return;
        }
        Completed?.Invoke(RunChecked(doc, cs, ticked, before));
    }

    private static ChangesetExecutor.ExecutionResult RunChecked(Document doc, ChangesetDto cs, HashSet<string> ticked, ScanReport before)
    {
        using var group = new TransactionGroup(doc, UndoWatcher.TxName(cs.Name, cs.Id));
        group.Start();
        // F-S2-1: a group forces modal failure handling on its inner transactions unless told not to.
        group.IsFailureHandlingForcedModal = false;
        var result = new ChangesetExecutor().Execute(doc, cs, ticked);
        if (result.Error != null || result.NotFinished != null)
        {
            // ponytail: a Pending commit (NotFinished) is disposed with the group, as Ghost's build does; the executor's
            // all-or-nothing preprocessor answers every error, so Revit should never leave one pending.
            if (result.NotFinished == null) group.RollBack();
            return result;
        }
        var added = BlockCheck.AddedSince(doc, before);
        if (added.Count > 0 && !BlockCheck.PlaceAnyway(doc, added, $"changeset \"{cs.Name}\"", before.RulesetRef))
        {
            group.RollBack();
            return new ChangesetExecutor.ExecutionResult { NotRun = true, Error = BlockCheck.WentBack(added) };
        }
        if (group.Assimilate() != TransactionStatus.Committed)
            return new ChangesetExecutor.ExecutionResult { Error = $"Revit did not keep the changeset's Undo group (status {group.GetStatus()})" };
        if (added.Count > 0) result.Block = BlockCheck.PlacedAnyway(added, doc.IsWorkshared);
        return result;
    }

    public string GetName() => "Sentinel - AI Changeset Placement";
}
```

- [ ] **Step 4: Review AI Proposals (and Promote) say it, and the note carries it (E11).** In `SentinelAddin/Commands.ReviewChangesets.cs`, make two replacements. First, replace

```csharp
                var said = gone.Count == 0 ? note : $"{gone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
```

with

```csharp
                var said = gone.Count == 0 ? note : $"{gone.Count} element(s) removed by Revit at commit" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}");
                if (result.Block != null) said = result.Block + (string.IsNullOrEmpty(said) ? "" : " | " + said); // MA-1a item 5
```

Second, replace

```csharp
                    (warnings != null ? "\n\n" + warnings : ""));
```

with

```csharp
                    (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : ""));
```

Going back needs no change here: `NotRun` already shows "The proposals are still pending — run Review AI Proposals again on that model."

- [ ] **Step 5: Ghost's report can say "went back".** In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, replace

```csharp
            public int Stamped;
        }
```

with

```csharp
            public int Stamped;
            /// <summary>MA-1a item 5 (DWG): the person went back at the BLOCK check — nothing was built (NotBuilt says so) and the
            /// review stays open for another Build.</summary>
            public bool WentBack;
        }
```

- [ ] **Step 6: Ghost's build checks before its Undo is kept (E10).** In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, make five replacements. First, replace

```csharp
// (GhostBuilderPlacementEvent).
using System;
```

with

```csharp
// (GhostBuilderPlacementEvent).
// MA-1a item 5: when the ruleset has a BLOCK rule, the build is scanned before step 1 and again after step 3 (the documents'
// values included), with the group still open; if it adds BLOCK rows the person is asked "This batch will block your sync: N
// element(s)" — Go back abandons the build (nothing placed, filed changesets withdrawn) and the review stays open.
using System;
```

Second, replace

```csharp
            try
            {
                // ── 1. The families and types the reviewed rows need, before anything is filed (founder decision F4) ──────────
```

with

```csharp
            ScanReport blockBefore = null; // MA-1a item 5: the BLOCK rows before the build; null = nothing can block it
            string blockNote = null, blockLine = null;
            try
            {
                blockBefore = BlockCheck.Before(doc, out blockNote);
                // ── 1. The families and types the reviewed rows need, before anything is filed (founder decision F4) ──────────
```

Third, replace

```csharp
                // ── 6. One Undo entry, named as the first changeset's transaction ───────────────────────────────────────────
```

with

```csharp
                // ── 5b. MA-1a item 5: the BLOCK check — what this build adds, judged as a sync judges it, before the Undo is kept ──
                if (blockBefore != null)
                {
                    var added = BlockCheck.AddedSince(doc, blockBefore);
                    if (added.Count > 0)
                    {
                        if (!BlockCheck.PlaceAnyway(doc, added, "the whole build", blockBefore.RulesetRef))
                        {
                            // Go back: nothing placed, the filed changesets withdrawn; the review stays open for another Build.
                            var back = Abandon(BlockCheck.WentBack(added));
                            back.WentBack = true;
                            return back;
                        }
                        blockLine = BlockCheck.PlacedAnyway(added, doc.IsWorkshared);
                        report.Warnings.Insert(0, blockLine);
                    }
                }
                else if (blockNote != null)
                {
                    blockLine = blockNote;
                    report.Warnings.Add(blockNote);
                }

                // ── 6. One Undo entry, named as the first changeset's transaction ───────────────────────────────────────────
```

Fourth, replace

```csharp
                    if (!ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report)))
```

with

```csharp
                    if (!ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine)))
```

Fifth, replace

```csharp
        private static string Note(Request r, Level level, GhostPlacementEngine.PlacementReport report) =>
            $"Ghost Builder: {r.Drawing} on {level.Name}, as reviewed in Ghost's review" +
```

with

```csharp
        // MA-1a item 5: the BLOCK check's line (placed anyway, or not checked) rides on the note too.
        private static string Note(Request r, Level level, GhostPlacementEngine.PlacementReport report, string block) =>
            $"Ghost Builder: {r.Drawing} on {level.Name}, as reviewed in Ghost's review" + (block == null ? "" : "; " + block) +
```

- [ ] **Step 7: The review window takes another Build.** In `SentinelAddin/UI/GhostReviewWindow.cs`, make two replacements. First, replace

```csharp
        _build.IsEnabled = false;              // one build per review; the window closes when it completes
```

with

```csharp
        _build.IsEnabled = false;              // one build at a time; the window closes when it completes, or Reopen (MA-1a item 5)
```

Second, replace

```csharp
    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);
```

with

```csharp
    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);

    /// <summary>MA-1a item 5: the person went back at the BLOCK check — nothing was built; the review takes another Build.
    /// UI thread.</summary>
    public void Reopen(string status)
    {
        UpdateStatus(); // the Build button again, for the rows still ticked
        _status.Text = status;
    }
```

- [ ] **Step 8: Going back keeps the review open.** In `SentinelAddin/Commands.GhostBuilder.cs`, replace

```csharp
            review.Dispatcher.Invoke(() =>
            {
                Release();
                review.Close();
```

with

```csharp
            review.Dispatcher.Invoke(() =>
            {
                // MA-1a item 5: the person went back at the BLOCK check — nothing was built; the review stays open for another
                // Build, so the local model is kept (nothing released).
                if (error == null && report.WentBack) // with no error the report is never null
                {
                    building = false;
                    review.Reopen(report.NotBuilt + (report.Ledger != null ? " " + report.Ledger : ""));
                    return;
                }
                Release();
                review.Close();
```

- [ ] **Step 9: Build and check.** Both builds: `0 Error(s)`, with `5` and `3 Warning(s)`. (Written as `report?.WentBack`, the go-back test adds a CS8604 warning at `Summarize(report, …)`; the step's `report.WentBack` does not.) `ghost-p2-check` `103/103` (it compiles `GhostReviewWindow.cs`). `promote-check` `221/221`. The Revit half has no offline check; its decisions (`BlockCheck.Added`, the words) are Task 2's. Drill rows I5-1 to I5-4 prove the wiring.
- [ ] **Step 10: Commit.**

```bash
git add SentinelAddin/Engine/RuleEngineHost.cs SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/UI/GhostReviewWindow.cs SentinelAddin/Commands.GhostBuilder.cs
git commit -F - <<'EOF'
feat(block): the BLOCK check before commit — "This batch will block your sync: N element(s)"; go back or place anyway (MA-1a item 5)

The sync's own ScanFull before and after the batch, inside its still-open TransactionGroup, diffed by rule and element; no
scan without a BLOCK rule; "not checked" said when the ruleset has not loaded. Ghost asks after the documents' values,
before Assimilate — Go back abandons the build (filed changesets withdrawn) and the review stays open. Review AI Proposals
and Promote run in a group named as the changeset (only with a BLOCK rule) — Go back leaves it proposed. Place anyway puts
the line on the result's note. Parameter rules with categories now judge model elements (full scan only — SCAN-E1's scan half).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6 — Datum and Photo Massing stamp; the Provenance reader (item 4)

**Files:**
- Modify `SentinelAddin/GhostBuilder/DatumBuilder.cs` (`:12`, `:28`, `:39`, `:85`, `:105`, `:117`, `:122`, `:157`, `:173`, `:231`, `:258`)
- Modify `SentinelAddin/Commands.Datum.cs` (`:70`, `:94`)
- Modify `SentinelAddin/GhostBuilder/MassingVisionReader.cs` (`:61`, `:70`, `:145`)
- Modify `SentinelAddin/Commands.Massing.cs` (`:70`, `:88`, `:141`)
- Modify `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` (`:87`, `:145`)
- Create `SentinelAddin/Commands.Provenance.cs`
- Modify `SentinelAddin/App.cs` (`:494`)

**Interfaces:**
- `DatumBuilder.DatumResult` gains `LevelLayers`, `GridLayers` and `SourceSha256`.
- `CreateLevel` and `CreateGrid` return the element, or null when one is kept.
- `MassingVisionReader.MaxImages` (6); `Images` becomes `internal`.
- `MassingPlacementEvent.SetRequest(…, string imagesSha)`.
- `PlacePrepared(…, string imagesSha256 = null)`.
- `Sentinel.Commands.ProvenanceCommand`, ribbon button `Sentinel_Provenance`.

- [ ] **Step 1: Datum records the layers it read and stamps what it creates (F7).** In `SentinelAddin/GhostBuilder/DatumBuilder.cs`, make eleven replacements. First, replace

```csharp
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
```

with

```csharp
using Autodesk.Revit.DB;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
```

Second, replace

```csharp
            public int LevelsCreated, GridsCreated;
            public List<string> Warnings = new();
        }
```

with

```csharp
            public int LevelsCreated, GridsCreated;
            public List<string> Warnings = new();
            /// <summary>MA-1a item 4: the layers the levels and the grids were read from, and the drawing's sha256 when one picked
            /// file was read (the command sets it; null when the datum came from imports already in the model).</summary>
            public HashSet<string> LevelLayers = new(StringComparer.OrdinalIgnoreCase), GridLayers = new(StringComparer.OrdinalIgnoreCase);
            public string SourceSha256;
        }
```

Third, replace

```csharp
            var levelSegs = new List<Seg>();
            var gridSegs = new List<Seg>();
            foreach (var import in new FilteredElementCollector(_doc).OfClass(typeof(ImportInstance))
                                        .Cast<ImportInstance>())
            {
                CollectSegs(import, levelLayerKeyword, levelSegs);
                CollectSegs(import, gridLayerKeyword, gridSegs);
            }
            return Compute(levelSegs, gridSegs, levelLayerKeyword, gridLayerKeyword);
```

with

```csharp
            var levelSegs = new List<Seg>();
            var gridSegs = new List<Seg>();
            var res = new DatumResult(); // MA-1a item 4: it collects the layers read
            foreach (var import in new FilteredElementCollector(_doc).OfClass(typeof(ImportInstance))
                                        .Cast<ImportInstance>())
            {
                CollectSegs(import, levelLayerKeyword, levelSegs, res.LevelLayers);
                CollectSegs(import, gridLayerKeyword, gridSegs, res.GridLayers);
            }
            return Compute(levelSegs, gridSegs, levelLayerKeyword, gridLayerKeyword, res);
```

Fourth, replace

```csharp
            var read = new List<string>();
```

with

```csharp
            var read = new List<string>();
            var res = new DatumResult(); // MA-1a item 4: it collects the layers read
```

Fifth, replace

```csharp
                        CollectSegs(imp, levelLayerKeyword, levelSegs);
                        CollectSegs(imp, gridLayerKeyword, gridSegs);
```

with

```csharp
                        CollectSegs(imp, levelLayerKeyword, levelSegs, res.LevelLayers);
                        CollectSegs(imp, gridLayerKeyword, gridSegs, res.GridLayers);
```

Sixth, replace

```csharp
            var res = Compute(levelSegs, gridSegs, levelLayerKeyword, gridLayerKeyword);
```

with

```csharp
            Compute(levelSegs, gridSegs, levelLayerKeyword, gridLayerKeyword, res);
```

Seventh, replace

```csharp
        private DatumResult Compute(List<Seg> levelSegs, List<Seg> gridSegs, string levelKw, string gridKw)
        {
            var res = new DatumResult
            {
                Levels = DatumFromDrawing.Levels(levelSegs),
                Grids = DatumFromDrawing.Grids(gridSegs),
            };
```

with

```csharp
        private DatumResult Compute(List<Seg> levelSegs, List<Seg> gridSegs, string levelKw, string gridKw, DatumResult res)
        {
            res.Levels = DatumFromDrawing.Levels(levelSegs);
            res.Grids = DatumFromDrawing.Grids(gridSegs);
```

Eighth, replace

```csharp
                foreach (var lv in detected.Levels)
                    if (CreateLevel(lv, detected.Warnings)) detected.LevelsCreated++;
                foreach (var g in detected.Grids)
                    if (CreateGrid(g, detected.Warnings)) detected.GridsCreated++;
                t.Commit();
```

with

```csharp
                // MA-1a item 4: each level and grid it creates carries the full stamp — source dwg, no changeset, no ledger row
                // until item 7 — inside this transaction, so Ctrl+Z removes it with them.
                var levelFacts = new ProvenanceStamp.Facts { Layer = Layers(detected.LevelLayers), SourceSha256 = detected.SourceSha256,
                    Rule = "Datum from Drawings: a level line's height on a layer named LEVEL or LEVL (a section), read origin to origin" };
                var gridFacts = new ProvenanceStamp.Facts { Layer = Layers(detected.GridLayers), SourceSha256 = detected.SourceSha256,
                    Rule = "Datum from Drawings: a grid line on a layer named GRID (a plan), read origin to origin" };
                foreach (var lv in detected.Levels)
                    if (CreateLevel(lv, detected.Warnings) is Level level)
                    {
                        detected.LevelsCreated++;
                        ProvenanceStamp.Write(level, null, "dwg", null, levelFacts);
                    }
                foreach (var g in detected.Grids)
                    if (CreateGrid(g, detected.Warnings) is Grid grid)
                    {
                        detected.GridsCreated++;
                        ProvenanceStamp.Write(grid, null, "dwg", null, gridFacts);
                    }
                t.Commit();
```

Ninth, replace

```csharp
        private void CollectSegs(ImportInstance import, string layerKeyword, List<Seg> into)
        {
            if (string.IsNullOrWhiteSpace(layerKeyword)) return;
            GeometryElement geo = import.get_Geometry(new Options { ComputeReferences = false });
            if (geo == null) return;
            foreach (GeometryObject obj in geo)
            {
                if (obj is GeometryInstance gi)
                    foreach (GeometryObject n in gi.GetInstanceGeometry()) AddIfOnLayer(n, layerKeyword, into);
                else
                    AddIfOnLayer(obj, layerKeyword, into);
            }
        }

        private void AddIfOnLayer(GeometryObject o, string layerKeyword, List<Seg> into)
        {
            string layer = LayerOf(o);
            if (layer == null || !LayerMatches(layer, layerKeyword)) return;

            switch (o)
            {
                case Line line:
                    into.Add(ToSeg(line.GetEndPoint(0), line.GetEndPoint(1)));
                    break;
                case PolyLine poly:
                    var pts = poly.GetCoordinates();
                    for (int i = 0; i < pts.Count - 1; i++) into.Add(ToSeg(pts[i], pts[i + 1]));
                    break;
                // arcs/splines aren't level or grid datums — ignore
            }
        }
```

with

```csharp
        private void CollectSegs(ImportInstance import, string layerKeyword, List<Seg> into, HashSet<string> layers)
        {
            if (string.IsNullOrWhiteSpace(layerKeyword)) return;
            GeometryElement geo = import.get_Geometry(new Options { ComputeReferences = false });
            if (geo == null) return;
            foreach (GeometryObject obj in geo)
            {
                if (obj is GeometryInstance gi)
                    foreach (GeometryObject n in gi.GetInstanceGeometry()) AddIfOnLayer(n, layerKeyword, into, layers);
                else
                    AddIfOnLayer(obj, layerKeyword, into, layers);
            }
        }

        // MA-1a item 4: a layer that gave a line is recorded for the stamp (layers).
        private void AddIfOnLayer(GeometryObject o, string layerKeyword, List<Seg> into, HashSet<string> layers)
        {
            string layer = LayerOf(o);
            if (layer == null || !LayerMatches(layer, layerKeyword)) return;

            switch (o)
            {
                case Line line:
                    into.Add(ToSeg(line.GetEndPoint(0), line.GetEndPoint(1)));
                    layers.Add(layer);
                    break;
                case PolyLine poly:
                    var pts = poly.GetCoordinates();
                    for (int i = 0; i < pts.Count - 1; i++) into.Add(ToSeg(pts[i], pts[i + 1]));
                    layers.Add(layer);
                    break;
                // arcs/splines aren't level or grid datums — ignore
            }
        }

        private static string Layers(HashSet<string> layers) =>
            layers.Count == 0 ? null : string.Join(", ", layers.OrderBy(x => x, StringComparer.OrdinalIgnoreCase));
```

Tenth, replace

```csharp
        private bool CreateLevel(DetectedLevel lv, List<string> warnings)
        {
            double elevFt = lv.ElevationMm * MmToFeet;
            var existing = new FilteredElementCollector(_doc).OfClass(typeof(Level)).Cast<Level>()
                .FirstOrDefault(l => Math.Abs(l.Elevation - elevFt) < 0.01); // ~3mm
            if (existing != null)
            {
                warnings.Add($"Level at {lv.ElevationMm:0} mm already exists ('{existing.Name}') — kept.");
                return false;
            }
            var level = Level.Create(_doc, elevFt);
            try { level.Name = UniqueLevelName(lv.Name, level.Id); } catch { /* name clash/illegal — leave default */ }
            return true;
        }
```

with

```csharp
        // The level created, or null when one at that height is kept (MA-1a item 4: the caller stamps what it created).
        private Level CreateLevel(DetectedLevel lv, List<string> warnings)
        {
            double elevFt = lv.ElevationMm * MmToFeet;
            var existing = new FilteredElementCollector(_doc).OfClass(typeof(Level)).Cast<Level>()
                .FirstOrDefault(l => Math.Abs(l.Elevation - elevFt) < 0.01); // ~3mm
            if (existing != null)
            {
                warnings.Add($"Level at {lv.ElevationMm:0} mm already exists ('{existing.Name}') — kept.");
                return null;
            }
            var level = Level.Create(_doc, elevFt);
            try { level.Name = UniqueLevelName(lv.Name, level.Id); } catch { /* name clash/illegal — leave default */ }
            return level;
        }
```

Eleventh, replace

```csharp
        private bool CreateGrid(DetectedGrid g, List<string> warnings)
        {
            XYZ p1 = new XYZ(g.X1 * MmToFeet, g.Y1 * MmToFeet, 0);
            XYZ p2 = new XYZ(g.X2 * MmToFeet, g.Y2 * MmToFeet, 0);
            if (p1.DistanceTo(p2) < _doc.Application.ShortCurveTolerance)
            {
                warnings.Add($"Grid '{g.Name}' too short to create — skipped.");
                return false;
            }
            // A grid name must be unique; Revit throws on a clash. Skip if the label's taken.
            var taken = new FilteredElementCollector(_doc).OfClass(typeof(Grid)).Cast<Grid>()
                .Select(x => x.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (taken.Contains(g.Name))
            {
                warnings.Add($"Grid '{g.Name}' already exists — kept.");
                return false;
            }
            var grid = Grid.Create(_doc, Line.CreateBound(p1, p2));
            try { grid.Name = g.Name; } catch { /* clash/illegal — Revit auto-named it */ }
            return true;
        }
```

with

```csharp
        // The grid created, or null when it is skipped or kept (MA-1a item 4: the caller stamps what it created).
        private Grid CreateGrid(DetectedGrid g, List<string> warnings)
        {
            XYZ p1 = new XYZ(g.X1 * MmToFeet, g.Y1 * MmToFeet, 0);
            XYZ p2 = new XYZ(g.X2 * MmToFeet, g.Y2 * MmToFeet, 0);
            if (p1.DistanceTo(p2) < _doc.Application.ShortCurveTolerance)
            {
                warnings.Add($"Grid '{g.Name}' too short to create — skipped.");
                return null;
            }
            // A grid name must be unique; Revit throws on a clash. Skip if the label's taken.
            var taken = new FilteredElementCollector(_doc).OfClass(typeof(Grid)).Cast<Grid>()
                .Select(x => x.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (taken.Contains(g.Name))
            {
                warnings.Add($"Grid '{g.Name}' already exists — kept.");
                return null;
            }
            var grid = Grid.Create(_doc, Line.CreateBound(p1, p2));
            try { grid.Name = g.Name; } catch { /* clash/illegal — Revit auto-named it */ }
            return grid;
        }
```

- [ ] **Step 2: Datum's command hashes the picked drawing and says the elements are stamped.** In `SentinelAddin/Commands.Datum.cs`, make two replacements. First, replace

```csharp
            detected = builder.DetectFromFiles(new[] { pick.SelectedPath });
```

with

```csharp
            detected = builder.DetectFromFiles(new[] { pick.SelectedPath });
            detected.SourceSha256 = ProvenanceStamp.FileSha256(pick.SelectedPath); // MA-1a item 4: the file the datum was read from
```

Second, replace

```csharp
            $"Created {result.LevelsCreated} level(s) and {result.GridsCreated} grid(s)." +
```

with

```csharp
            $"Created {result.LevelsCreated} level(s) and {result.GridsCreated} grid(s), each stamped with where it came from (Model from Drawings ▸ 5 · Provenance reads it)." +
```

- [ ] **Step 3: Massing names how many images it reads.** In `SentinelAddin/GhostBuilder/MassingVisionReader.cs`, make three replacements. First, replace

```csharp
        public static int CountImages(string folder)
```

with

```csharp
        /// <summary>How many of the folder's images the vision model reads (the first ones Images lists).</summary>
        public const int MaxImages = 6;

        public static int CountImages(string folder)
```

Second, replace

```csharp
        public async Task<MassingEstimate> EstimateAsync(string folder, int maxImages = 6, CancellationToken ct = default)
```

with

```csharp
        public async Task<MassingEstimate> EstimateAsync(string folder, int maxImages = MaxImages, CancellationToken ct = default)
```

Third, replace

```csharp
        private static List<string> Images(string folder)
```

with

```csharp
        // Internal: Photo Massing's command hashes the images read for the stamp (MA-1a item 4).
        internal static List<string> Images(string folder)
```

- [ ] **Step 4: Massing hashes them and passes the sha to the build (F6).** In `SentinelAddin/Commands.Massing.cs`, make three replacements. First, replace

```csharp
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
```

with

```csharp
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
                // MA-1a item 4 (founder decision F6): one sha256 over the images the vision model read, for every element's stamp.
                string imagesSha = ProvenanceStamp.FilesSha256(MassingVisionReader.Images(folder).Take(MassingVisionReader.MaxImages));
```

Second, replace

```csharp
                        placementEvent.SetRequest(orchestrator, elements, mapping);
```

with

```csharp
                        placementEvent.SetRequest(orchestrator, elements, mapping, imagesSha);
```

Third, replace

```csharp
    private MappingResult _mapping;

    public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

    public void SetRequest(GhostBuilderOrchestrator orchestrator,
                           System.Collections.Generic.List<GhostElement> elements, MappingResult mapping)
    {
        _orchestrator = orchestrator; _elements = elements; _mapping = mapping;
    }

    public void Execute(UIApplication app)
    {
        var orch = _orchestrator; var els = _elements; var map = _mapping;
        _orchestrator = null; _elements = null; _mapping = null;
        try
        {
            if (orch == null) throw new InvalidOperationException("No massing request staged.");
            Completed?.Invoke(orch.PlacePrepared(els, map), null);
```

with

```csharp
    private MappingResult _mapping;
    private string _imagesSha; // MA-1a item 4: the images read, for the stamp

    public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

    public void SetRequest(GhostBuilderOrchestrator orchestrator,
                           System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, string imagesSha)
    {
        _orchestrator = orchestrator; _elements = elements; _mapping = mapping; _imagesSha = imagesSha;
    }

    public void Execute(UIApplication app)
    {
        var orch = _orchestrator; var els = _elements; var map = _mapping; var sha = _imagesSha;
        _orchestrator = null; _elements = null; _mapping = null; _imagesSha = null;
        try
        {
            if (orch == null) throw new InvalidOperationException("No massing request staged.");
            Completed?.Invoke(orch.PlacePrepared(els, map, imagesSha256: sha), null);
```

- [ ] **Step 5: Massing stamps every element it made, before commit.** In `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs`, make two replacements. First, replace

```csharp
        public GhostPlacementEngine.PlacementReport PlacePrepared(
            System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, Level level = null)
```

with

```csharp
        /// <param name="imagesSha256">MA-1a item 4: one sha256 over the images the vision model read, for each element's stamp.</param>
        public GhostPlacementEngine.PlacementReport PlacePrepared(
            System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, Level level = null, string imagesSha256 = null)
```

Second, replace

```csharp
                foreach (var (id, _) in report.NewElements) handler.Ours.Add(id.IdValue());
```

with

```csharp
                // MA-1a item 4: every element this build made carries the full stamp — source photo, no changeset, no ledger row until
                // item 7 — inside this transaction, so Ctrl+Z removes it with them. Its layers are the massing plan's own, not a drawing's.
                foreach (var (id, what) in report.NewElements)
                    if (_doc.GetElement(id) is Element made)
                        Sentinel.Engine.ProvenanceStamp.Write(made, null, "photo", null, new Sentinel.Engine.ProvenanceStamp.Facts
                        {
                            Rule = $"Photo Massing: {what} of the massing plan, from the vision model's estimate as corrected in the review",
                            SourceSha256 = imagesSha256,
                        });
                foreach (var (id, _) in report.NewElements) handler.Ours.Add(id.IdValue());
```

- [ ] **Step 6: Create `SentinelAddin/Commands.Provenance.cs` (E8)**

```csharp
#nullable disable
// MA-1a item 4: read one element's Sentinel provenance stamp in words (ProvenanceStamp.Describe) — source, source file sha256,
// layer, rule, approver, ledger row, time; a stamp that came with a copy reads "copied, not placed by Sentinel". Reads only:
// no transaction, no network.
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using Sentinel.Engine;

namespace Sentinel.Commands;

[Transaction(TransactionMode.ReadOnly)]
public sealed class ProvenanceCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        var selected = uidoc.Selection.GetElementIds();
        Element e;
        if (selected.Count == 1) e = doc.GetElement(selected.First());
        else
        {
            try { e = doc.GetElement(uidoc.Selection.PickObject(ObjectType.Element, "Pick an element to read its Sentinel provenance stamp")); }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return Result.Cancelled; }
        }
        if (e == null) return Result.Cancelled;
        TaskDialog.Show("Sentinel — Provenance",
            $"{e.Category?.Name ?? "Element"} {e.Id.IdValue()} — {e.Name}\n\n" + ProvenanceStamp.Describe(ProvenanceStamp.Read(e), e.UniqueId));
        return Result.Succeeded;
    }
}
```

- [ ] **Step 7: The ribbon button.** In `SentinelAddin/App.cs`, replace

```csharp
        Push(st, "Sentinel_Roi", "ROI\nDashboard", "Sentinel.Commands.RoiDashboardCommand", "roi",
```

with

```csharp
        Sub(chain, "Sentinel_Provenance", "5 · Provenance", "Sentinel.Commands.ProvenanceCommand", "ghost",
            "Read where the selected (or picked) element came from — Sentinel's provenance stamp: source, source file sha256, CAD layer, the rule that typed it, the approver, the ledger row and the time. A stamp that came with a copy reads \"copied, not placed by Sentinel\". Reads only.");
        Push(st, "Sentinel_Roi", "ROI\nDashboard", "Sentinel.Commands.RoiDashboardCommand", "roi",
```

- [ ] **Step 8: Build and check.**
  - Both builds: `0 Error(s)`, with `5` and `3 Warning(s)`.
  - `datum-check` `DATUM OK` and `massing-check` `13/13` (they compile only the pure halves, unchanged).
  - `promote-check` `221/221`.
- [ ] **Step 9: Commit.**

```bash
git add SentinelAddin/GhostBuilder/DatumBuilder.cs SentinelAddin/Commands.Datum.cs SentinelAddin/GhostBuilder/MassingVisionReader.cs SentinelAddin/Commands.Massing.cs SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs SentinelAddin/Commands.Provenance.cs SentinelAddin/App.cs
git commit -F - <<'EOF'
feat(provenance): Datum and Photo Massing stamp what they create; Model from Drawings ▸ 5 · Provenance reads any element's stamp (MA-1a item 4)

Datum: source dwg, the layers read, the picked drawing's sha, its keyword rule; Massing: source photo, one sha over the
images read, the massing plan's rule — both with no changeset and no ledger row until item 7, inside their own
transaction. The reader shows source, sha, layer, rule, approver, ledger row and time, and reads a copy's stamp as
"copied, not placed by Sentinel".

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 7 — Drill ruleset, graph, final checks, merge

**Files:**
- Create `demo/ghost-sample/ma1a-block-ruleset.json`. Ghost's evidence reads only `.pdf`, `.txt`, `.md` and `.csv` (`GhostEvidence.cs:30`), so the spec's evidence budget is untouched.

- [ ] **Step 1: Create `demo/ghost-sample/ma1a-block-ruleset.json`** (F10; the whitelist is the B35 model's levels, B33):

```json
{
  "schema_version": 1,
  "standard_key": "ma1a-item5-drill",
  "semver": "1.0.0",
  "org": "",
  "rules": [
    {
      "id": "MA1-FN-01", "target": "parameter", "mode": "block", "parameter_name": "Mark", "categories": ["Furniture"],
      "message_en": "Furniture '{name}': Mark is empty — the drill's BLOCK property (MA-1a item 5).",
      "doc_ref": "MA-1a item 5 drill"
    },
    {
      "id": "MA1-LV-01", "target": "level", "mode": "block", "whitelist": ["GR_SSL", "GR-FFL", "01_SSL", "01-FFL", "MA0 Roof"],
      "message_en": "Level '{name}' is not one of the drill model's levels (MA-1a item 5).",
      "doc_ref": "MA-1a item 5 drill"
    }
  ]
}
```

- [ ] **Step 2: The bridge accepts it.** From `WebApp`, run `node -e 'import("./bridge/artefact-store.mjs").then(m => { m.validateArtefact("ruleset", JSON.parse(require("fs").readFileSync("../demo/ghost-sample/ma1a-block-ruleset.json","utf8"))); console.log("valid ruleset") })'` and expect `valid ruleset`. Do not install it now: the drill installs it on its scratch project.
- [ ] **Step 3: Graph.** Run `graphify update .`. If it is not on PATH, record that in the merge message.
- [ ] **Step 4: Final checks.**
  - `promote-check` `221/221`, `ghost-p2-check` `103/103`, `session-check` `47/47`.
  - `ghost-standards-check` `146/146`, `wallpair-check` `9/9`, `massing-check` `13/13`, `datum-check` `DATUM OK`.
  - From `WebApp`, `npx vitest run bridge/`: expect `Tests  1628 passed | 1 skipped (1629)`.
  - Both builds: `0 Error(s)`, with Revit 2024 at `5 Warning(s)` and Revit 2026 at `3 Warning(s)`.
- [ ] **Step 5: Commit and merge.**

```bash
git add demo/ghost-sample/ma1a-block-ruleset.json
git commit -F - <<'EOF'
docs(drill): MA-1a item 5 drill ruleset — a BLOCK parameter rule on Furniture Mark and a BLOCK level whitelist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git checkout master
git merge --no-ff feature/ma1a-items3-5 -F - <<'EOF'
Merge feature/ma1a-items3-5: MA-1a items 3–5 — walls level to level for every source (GHB-2: the import's Z, the next Building Story, no 10 ft / 3000 mm), the full provenance stamp on every placer with the 5 · Provenance reader ("copied" for a copy), and the BLOCK check before commit ("This batch will block your sync: N element(s)", go back or place anyway; parameter rules with categories)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

**Deployment note:** the bridge must run this branch's `changesets-logic.mjs` before or with the add-in. A bridge on master drops every element's `provenance` without an error, so a Ghost stamp would lack its layer, rule and sha (R7).

---

## Live drill MA1a-I35 (Revit 2024, scratch copies only)

**Set-up (once):**
- **Build and bridge.**
  - Close Revit. Run `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, which deploys, and record `git rev-parse --short HEAD`. Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work.
  - Restart the **test bridge on 127.0.0.1:4101** on this branch. The founder's 4100 bridge is not touched.
  - Switch the add-in `serviceUrl` to 4101 for the session, and restore it after.
- **Scratch copies.**
  - Copy `%USERPROFILE%\Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 model) to `%USERPROFILE%\Documents\Sentinel drills\ma1a-i34-scratch.rvt`. Also make `ma1a-i5-scratch.rvt`.
  - Never open aster-tower, Demo, a pilot file or any founder file.
- **Bindings and sign-in.**
  - Bind `ma1a-i34-scratch.rvt` to web project `demo` in Project Setup. Record demo's ruleset (Scan Now's header) and whether it has a BLOCK rule. If it has one, the I3 and I4 builds will also ask the BLOCK question; answer Place anyway and record it.
  - Ghost source folder = `demo/ghost-sample`; Ollama running as in MA1a-S2; the `demo` mapping cache moved aside and restored after.
  - Sign in as a contributor or above (Standards ▸ Sign in), or stay signed out. Record which: it is the stamp's approver (F5).
- **Before each row, record:**
  - element counts per category, from `analyze_model_statistics` (read-only) or a schedule;
  - the last row id of `GET /cde/<key>/audit?entity_type=changeset`, read with the service token. Never print the token.
- **Checks on the copy.**
  - Its levels should be `GR_SSL −300, GR-FFL 0, 01_SSL 3000, 01-FFL 3300, MA0 Roof 6300`, all Building Story (B33). Record any difference.
  - It should have no `sample-plan` import (Insert ▸ Manage Links ▸ CAD Formats). Delete one if it is there, so the first Ghost run imports the file fresh and hashes it (E7).
- **The I5 copy and its project.**
  - Create web project `ma1a-block`, as B33 created `ma0-bds`. Install the drill ruleset from `WebApp`: `node bridge/artefact-import.mjs ../demo/ghost-sample/ma1a-block-ruleset.json --project ma1a-block --kind ruleset --actor drill`. If the copy's levels differ from the whitelist, correct the whitelist in a scratch copy of the file before installing.
  - Open `ma1a-i5-scratch.rvt`. Enable worksharing (Collaborate ▸ Collaborate ▸ Within your network), then Save As `Documents\Sentinel drills\ma1a-i5-central.rvt` as the central.
  - Bind it to `ma1a-block`. Scan Now should show no BLOCK row; record any (the baseline). Record the Furniture count; it is expected to be 0.
  - Load a `OneLevelBased` furniture family if the model has none (MA1a-S2's desk). Record its family and type.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| I3-1 Ghost walls rise to the next story | On `ma1a-i34-scratch.rvt`, run Ghost Builder ▸ `sample-plan.dxf` (the first import of it in this copy). Build level **GR-FFL**; pick types as MA1a-S2's S2-1, with A-DOOR unticked (the B33 seed's walls stand on GR-FFL, so a door point would lie over one of them and be a named gap, step-2 F9); Build. Overlap warnings with the seed's walls are expected, and are counted and kept | The Warnings list `Walls on GR-FFL rise to 01_SSL, the next Building Story above; their tops are attached to it (GHB-2).` Pick any new wall: Base Constraint GR-FFL, Base Offset 0, Top Constraint **Up to level: 01_SSL**, Top Offset 0, Unconnected Height greyed. No new wall is "Unconnected" | the line; one wall's four properties |
| I4-1 Pick any wall: the full stamp | Right after I3-1: select one of its walls and run Model from Drawings ▸ **5 · Provenance** | The dialog reads:<br>• `Placed or changed by Sentinel.`;<br>• `Source: dwg`;<br>• `Source file sha256:` = the sha of `demo/ghost-sample/sample-plan.dxf` (from `certutil -hashfile demo\ghost-sample\sample-plan.dxf SHA256`, lower case);<br>• `Layer: A-WALL-EXT` (or the wall's layer);<br>• `Rule: type by …`, naming the guideline, the mapping tier or the reviewer;<br>• `Approver:` the signed-in e-mail, or `unsigned — <user> (not signed in …)`;<br>• `Ledger row: #N`, where N is the changeset's `adjudication.audit_id` (`GET /changesets/demo/<id>`);<br>• `Placed at:` the build's time (UTC) | the dialog text, the certutil sha, the audit_id |
| I4-2 A copy-pasted wall reads as copied | Select the I4-1 wall, Ctrl+C, Ctrl+V and click a point clear of the building. Run 5 · Provenance on the copy, then on the original | The copy: `Copied, not placed by Sentinel — this stamp came with a copy of element <original's UniqueId>`. The original still: `Placed or changed by Sentinel.` If the copy reads `No Sentinel provenance stamp`, Revit did not carry the entity (UNSURE 1). Record it: the row then holds as "the copy is never claimed as Sentinel's" (design `:777`, "may carry") | both dialogs |
| I3-2 A slab level directly below (F1) | Ctrl+Z twice (I4-2's paste, then I3-1's build). Same run on build level **GR_SSL** (−300), with A-DOOR unticked (a 2.1 m door cannot fit a 300 mm wall) | Walls rise to GR-FFL: Top Constraint Up to level: GR-FFL, 300 mm high, as F1 A says | the line, the wall height. If the founder picks F1 B or C, this row changes |
| I3-3 The top story (F2) | Ctrl+Z I3-2. Same run on **MA0 Roof** (6300) | `Walls on MA0 Roof: no Building Story above — unconnected, 3000 mm high, the storey below's height (founder decision F2).` A wall's Top Constraint is Unconnected, Unconnected Height 3000 | the line, the wall's properties |
| I3-4 An import on a raised level (GHB-2, the MA1b row early) | Copy `sample-plan.dxf` to a scratch folder as `sample-plan-up.dxf`, and point the Ghost source folder at that folder. Open the **01-FFL** floor plan view. Run Ghost Builder ▸ `sample-plan-up.dxf`: it is imported into this view. Build level 01-FFL, with A-DOOR unticked as in I3-1 | Every wall: Base Constraint 01-FFL, **Base Offset 0** (+3300 or +6600 is the bug), Top Constraint Up to level: MA0 Roof. The import's own Properties show its base level | a wall's base offset and top; the import's base level and offset (UNSURE 2). Restore the source folder after |
| I3-5 Every source: a changeset wall | Ctrl+Z the Ghost builds. Write the body below to a scratch file, post it to `http://127.0.0.1:4101/changesets/demo` with the service token (as the B33 and B35 seeds were filed), then Review AI Proposals ▸ Apply both | "Applied 2 element(s)". `I3-A no top`: Base GR-FFL, offset 0 (no BaseElevation: the level itself, E2), Top Up to level 01_SSL. `I3-B explicit top`: Top Constraint Unconnected, height 2500 (F3) | both walls' properties; the audit rows |
| I4-3 Datum stamps a grid | Datum from Drawings ▸ `sample-grids.dxf` ▸ Yes. Run 5 · Provenance on a new grid | `Source: dwg`; `Layer: A-GRID`; `Source file sha256:` = sample-grids.dxf's sha; `Rule: Datum from Drawings: a grid line on a layer named GRID …`; `Ledger row: none — not on a project ledger …`; `Changeset: none`. If every grid is kept (already in the model), the row is not run: record it | the dialog, the sha |
| I4-4 Photo Massing stamps | Only with a folder of building photos (S2-9 had none): run Photo Massing, then 5 · Provenance on a massing wall | `Source: photo`, `Layer: none — not read from a drawing layer`, `Rule: Photo Massing: Walls on '…' of the massing plan …`, a 64-hex sha. Without photos: `not run` | the dialog, or "not run" |
| I5-1 A batch that leaves a BLOCK property empty: the warning, Go back | On `ma1a-i5-central.rvt` (bound to `ma1a-block`), run Ghost Builder ▸ `sample-plan-step2.dxf` on GR-FFL. Tick and type A-WALL-EXT, A-WALL-INT and A-FURN (the loaded desk) by hand, since `ma1a-block` has no layers standard (as MA1a-S2's S2-7). Build | The **Sentinel — BLOCK check** dialog: `This batch will block your sync: 2 element(s) (MA1-FN-01)`, rows `• MA1-FN-01: <desk type> [id]` ×2, `Judged by ruleset@1 …`. Click **Go back**: the review window stays open, its status reads `You went back at the BLOCK check — nothing was placed. 2 element(s) … Ledger: the 1 changeset(s) already filed were withdrawn.`, and Build is enabled. The counts are unchanged, there is no Ghost Undo entry, and the audit has the changeset's proposed row and its withdrawal | the dialog, the status, the counts, the audit rows |
| I5-2 Place anyway | In the same review, click Build again, then **Place anyway** | `Placed: N`, and the first Warnings line: `This batch will block your sync: 2 element(s) (MA1-FN-01) — placed anyway, as the person chose; a sync stops until they are fixed.` The `changeset_applied` note contains that line. Scan Now lists 2 MA1-FN-01 BLOCK rows | the summary, the audit note |
| I5-3 Review AI Proposals: go back, then place anyway | Post the level body below to `…/changesets/ma1a-block`. Review AI Proposals ▸ Apply: **Go back**. Review AI Proposals ▸ Apply again: **Place anyway**. Then Ctrl+Z, then Ctrl+Y | First Apply: the dialog shows `1 element(s) (MA1-LV-01)` and `• MA1-LV-01: MA1 Test`. After Go back: `You went back at the BLOCK check — nothing was placed. …`, then `The proposals are still pending`, and no level exists. Second Apply: `Applied 1 element(s) …` plus the BLOCK line, and the audit note starts `This batch will block your sync`. Revit shows no blocking warnings dialog (F-S2-1). One Undo entry, `Sentinel AI changeset: MA1a item 5 — one level [xxxxxxxx]`. Ctrl+Z gives one `changeset_reverted` row; Ctrl+Y gives a `redo` row | the dialogs, the Undo text, the audit rows (UNSURE 5) |
| I5-4 A sync is stopped as predicted | After I5-2 and I5-3, with I5-3's level re-done, run Synchronize Now | `Sentinel — Sync stopped: 3 BLOCK violation(s) (MA1-FN-01, MA1-LV-01)`, listing the 2 desks and `MA1 Test`, exactly the elements I5-2 and I5-3 predicted. The central's file time is unchanged. Then fill each desk's Mark, delete `MA1 Test`, and sync again: it runs | the dialog, the central time before and after |

I3-5 body (`TypeName` must be a basic wall type in the copy; `Generic - 200mm` is, per B33):

```json
{ "name": "MA1a item 3 — two walls", "source": "agent",
  "elements": [
    { "kind": "wall", "validate": { "identity": { "Class": "IfcWall", "Name": "I3-A no top" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [30000, 0, 0], "end": [34000, 0, 0] } } },
    { "kind": "wall", "validate": { "identity": { "Class": "IfcWall", "Name": "I3-B explicit top" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [30000, 2000, 0], "end": [34000, 2000, 0] },
                 "BaseElevation": 0, "TopElevation": 2500 } } ] }
```

I5-3 body:

```json
{ "name": "MA1a item 5 — one level", "source": "agent",
  "elements": [ { "kind": "level", "validate": { "identity": { "Class": "IfcBuildingStorey", "Name": "MA1 Test" } }, "place": { "BaseElevation": 9300 } } ] }
```

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as session MA1a-I35. Then:
- close Revit without saving;
- restore `serviceUrl` and the Ghost source folder;
- leave `ma1a-block` as a scratch project, and say so in the record.

## UNSURE facts this drill settles

1. Does Revit's copy and paste carry an element's Extensible Storage entity to the copy? (I4-2.) Either answer is designed for: a carried stamp reads "copied"; an uncarried one reads "no stamp".
2. Is `ImportInstance.GetTotalTransform().Origin.Z` the elevation of the plan view's level for a DWG imported with `Placement = Origin` into that view, so that CAD Z − import Z is the drawing's own Z? (I3-4.) If the origin's Z is 0 while the geometry sits at the level, walls on 01-FFL land at +3300; the row fails and names it.
3. Can `WALL_HEIGHT_TYPE` be set on a wall created in the same transaction, before any regeneration? (I3-1.) Attach sets it on existing walls (MA-0); a refusal here declines the changeset with `could not set WALL_HEIGHT_TYPE`.
4. Can a TaskDialog run between transactions while a `TransactionGroup` is open inside an ExternalEvent, and does Go back then leave no element, no type and no Undo entry? (I5-1, I5-3.)
5. What `GetTransactionNames()` reports on Undo of the review path's assimilated group, which is named exactly as its inner transaction? Either way it is one remembered name, so one row is expected (I5-3).
6. Does `Level.Create` default `LEVEL_IS_BUILDING_STORY` to Yes for levels made by a changeset or by Datum? B33's changeset level was a story. Datum's levels are not exercised here (I4-3 creates grids only); record it if seen.
7. How long does ScanFull take with a category-scoped parameter rule? Measured on the drill model only (the delay before the BLOCK dialog). A large model against the sync's 15 s budget is not measured.
8. Does the drill model already hold grids (I4-3) or furniture (I5 baseline)? If so, the rows record it and adapt.
9. Does `demo`'s ruleset carry a BLOCK rule? (Set-up.) If it does, the I3 and I4 builds ask too.

## Risks

- **Slab levels are stories (F1).** On the BDS template a wall on an SSL level rises only to the FFL level above, 300 mm. That is the rule working on a template that marks slab levels as Building Story. The fix is the template's (un-tick them) or the proposal's (a `TopElevation`).
- **One-story models (F2).** A model with a single Building Story cannot Ghost-build walls: each wall is a named gap. An agent changeset without `TopElevation` is declined with the reason. Before, both got 10 ft or 3000 mm.
- **Behaviour change for agents.** A wall create without `TopElevation` used to be 3000 mm unconnected. It is now constrained to the next story. A changeset with no `BaseElevation` on a named level used to sit at minus the level's elevation; it now sits on the level. No known producer sends either shape (the concept seed sends both elevations).
- **Photo Massing walls are not level to level (C5).** Massing places through its own engine, not the executor, so its walls stay unconnected at the estimate's storey height: a massing wall's top is not constrained to the next Building Story, and can miss it when the model's levels differ from the estimate. This holds until MA-6 moves Massing onto the executor.
- **The F-S2-1 regression can come back.** The review path's new group must keep `IsFailureHandlingForcedModal = false`, or Revit's blocking warnings dialog returns. Drill row I5-3 checks it, and only models with a BLOCK rule take that path.
- **The pane can go stale after Go back.** Inner commits inside the group already fed the DMU, so after Go back the pane can list rows for elements that no longer exist until the next Scan Now. Ghost's Decline path has the same ceiling.
- **The prediction can drift.** The sync judges with the ruleset installed at sync time and drops `NotFixableHere` rows. If a ruleset is reloaded between placing and syncing, the two answers can differ. The BLOCK dialog names the ruleset that judged it.
- **Bridge order (deployment note).** A bridge on master drops `provenance` silently. Deploy the bridge with the add-in, or Ghost stamps lack their layer, rule and sha (the reader then says "not recorded").
- **Sync time.** A category-scoped parameter rule makes every pre-sync scan walk every element of those categories. This is not measured on a large model (UNSURE 7).
- **Scanner parity.** The web scanner does not judge parameter rules by `categories` (`scanner.ts:81-97`). A ruleset with such a rule can score differently on the web and in Revit until the parity item in Next lands.
- **Promote counts copied stamps.** `PromoteWallsPlanner.cs:107` and `PromotePlanner.cs:163` count a copied element's `promote` stamp as Promote's own. This predates this plan; see Next.
- **Clock and approver.** `placed_at` comes from this PC's clock, and the approver is whoever is signed in at placement. The reader labels both.

## Next (out of scope here)

- MA-1a items 6–8:
  - **6**: the guideline's `placement` block (workset, phase, no design option), a ceiling height, and the office-template check;
  - **7**: XC-5 report calls and P1-9 Doctor rows. This gives Datum and Photo Massing a ledger row, so their stamps can name one;
  - **8**: `build:run` receipts, and contract 2's trust and pre-tick rules. This includes D19's bridge-side marks: warn before review, never pre-tick a BLOCK breaker unless its `set_parameter` rows are in the batch.
- MA-1b: GHB-1 (DWG door blocks hosted, rotated and snapped), MAS-4, and the MA1b drill wording (step-2 F8). Drill I3-4 already exercises MA1b's "an import in the Level 3 plan gives Base L3 and Top L4".
- The BLOCK check for Datum (F8, with item 7) and Photo Massing (with MA-6).
- MA-6: Photo Massing onto the executor. Until then its walls stay unconnected at the estimate's storey height, not level to level (C5).
- The design's structured BLOCK result on `POST /changesets/:key/:id/result` (`:831`, `:883`). Until then it rides in the note.
- The web scanner's parity for parameter rules with `categories`, and the rest of SCAN-E1 (the loader refuses a Parameter rule without `parameter_name`).
- Promote ignores a copied stamp (`unique_id_at_placement` ≠ the element's) when it counts "stamped by Promote".
- GHB-3: link the DWG and compare its sha before reuse. A reused import can then carry its sha.
- §6.4's shared parameters `Sentinel_Source`, `Sentinel_LOD` and `Sentinel_Status`, and the IFC `Sentinel_Evidence` pset.
- Refresh the pane after a Go back (and after Ghost's Decline).
- `ChangesetExecutor.cs` is still in no check project. Its decisions are pure (`WallTop`, `ProvenanceStamp`, `BlockCheck`, `PlacementGeometry`); its Revit half is drilled.
