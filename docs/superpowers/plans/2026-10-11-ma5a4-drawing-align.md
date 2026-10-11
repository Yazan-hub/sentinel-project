# MA-5a-4 — Drawing alignment and inferred ghosts (implementation plan)

> Executed natively (one session, one whole-branch review at the end), per the founder's "do all three in one run" (2026-10-11).

**Goal:** a lead turns a done `sentinel-drawing` job into ONE changeset per drawing by stating a 2-point alignment (two paper points and where
they are in the model, optionally a third to check), the level and its height; every ghost lands `inferred` and is never pre-ticked.

**Architecture:** the bridge computes the similarity (scale, turn, move) from the two points and expresses it as the scan frame
`{dx_mm, dy_mm, dz_mm, rotation_deg}` over paper × scale, so the survey planner's `toModel`, `placeRefusal`, `trimEnds`, `locate`, the typer
and the opening typing are reused unchanged. A new pure `drawing-plan.mjs` builds the body; `proposeFromJob` branches on the job's reader and
shares its guards, decision 19, the standards, `validateChangeset` (job trust by cid) and `fileValidated`.

**Spec:** docs/strategy/2026-09-30-model-automation-design.md (§ drawing alignment: "a 2-point similarity fit, confirmed by a person"; the
registration record `{method: "2-point similarity", rmse_mm, confirmed_by}`); the MA-5a-3 plan (2026-10-11-ma5a3-drawing-reader.md).

## Decisions

1. **Two points, plus an optional check point.** Two points fix a similarity exactly (no residual): `rmse_mm` is null. A third point's
   residual (`check_mm`) is the only measure of the alignment; over `CHECK_MAX_MM` (100 mm) it is refused in words.
2. **The alignment is recorded** on each changeset's job record (`job.alignment`) and on the planner's build:run row:
   `{method: "2-point similarity", item, points, check, scale, rotation_deg, dx_mm, dy_mm, dz_mm, check_mm, rmse_mm: null, confirmed_by}`.
3. **Typed coordinates now**; clicking points on the drawing is MA-5a-6.
4. **One storey per drawing.** The body names an existing level (`level`) or not; `elevation_mm` (the level's height in the model) is
   required. matchStoreys decides: named / matched (one published level within 20 mm) / created (`Drawing <item> <job-id>`).
5. **No wall height**: walls carry no TopElevation (the executor's default, the next storey up).
6. **A door's width from its drawn swing** (`width_paper_mm × scale`, to the nominal 100 mm); **its height from its tag**. No tag height →
   held ("its height is not drawn"). A tag width that disagrees with the drawn width by more than 100 mm → held (the scale is wrong or the
   tag is another door's).
7. **No Rotation/flip** on a door (the executor's default facing).
8. **Thickness in whole mm** (`round(thickness_paper_mm × scale)`), typed exactly (D16).
9. **Keep the cross-job 409** (another job's changeset still proposed), worded for scans and drawings.
10. **One item is one alignment**: an item proposed again with another alignment is a 409 naming the one filed.
11. **Every element `inferred`**: `accuracy {status: "inferred", basis: "drawing", from_job, scale, check_mm}`, `pretick: false` — a created
    level included. Revit's ChangesetTrust pre-ticks only `within_tolerance`, so nothing from a drawing is ever pre-ticked.
12. **No measure, no overlay**: verify and the scan overlay refuse a drawing changeset in words; the desk hides Measure and the overlay.
13. **Planner row** `drawing-planner 0.1.0`; changeset name `Drawing <job-id> · <item> · <level>`.

## Global constraints

- Refusals before the first write end "nothing was saved"; any key the body does not read is refused, never dropped.
- Points: finite numbers; paper within ±2000 mm; model within ±MAX_FRAME_MM; the two paper points ≥ 10 mm apart and the model points ≥ 100 mm.
- Scale between 1 and 2000 (1:1 to 1:2000); anything else is refused (a swapped point or mm/m mix-up).
- Fixtures use example.test only.

## Review focus

1. Two points swapped between paper and model (scale 1/50) → refused by the scale bounds, in words.
2. A job that read two PDFs and a body without `item` → refused, naming the items.
3. A door whose host wall is a type gap → held, never placed (same as a scan's).
4. A rotated alignment (θ = 90°) → walls and doors land turned; trimEnds still corners them (test pins coordinates).
5. Proposing the same item again with the same alignment files nothing new (decision 19) → the 409 "nothing new".

## Tasks

### Task 1 — drawing-plan.mjs (pure) + tests
- `readAlignBody(b, items)` → `{item, points, check, level, elevation_mm}` or 400.
- `alignFrom(p, m)` → `{scale, rotation_deg, dx_mm, dy_mm}`; `checkResidual(al, check)`.
- `planDrawing({job, candidates, align, manifest, type, filed, catalog, sameCategory})` → `{storeys:[…one…], groups, already_filed}` in
  planSurvey's shape. Reuses survey-plan's exports (`toModel`, `placeRefusal`, `trimEnds`, `matchStoreys`, `groupGaps`, `typeOpening`,
  `pointAlong`, `nominal`, `gapOf`) and `locate`.
- survey-plan.mjs: export the helpers; the door typing block becomes `typeOpening` (behaviour unchanged).
- Tests: drawing-plan.test.mjs on the drill plan's candidates (A (60,40)→(40000,0), B (220,160)→(48000,6000), check (220,40)→(48000,0) →
  scale 50, 0°, move (37000, −2000)); the review-focus inputs.

### Task 2 — proposeFromJob drawing branch + guards
- The 409 at changesets-store.mjs:269 becomes the drawing branch (same guards, budget, lock, stillAdmitted, decision 19, standards,
  manifest, validate, file). Record `job.alignment`; planner row `drawing-planner 0.1.0`.
- verifyChangeset and scanOverlay refuse a drawing changeset (409 in words).
- Fixture `fixtures/changeset-ops/contract2-drawing.json` + promote-check pin: every drawing create unticked, accuracy `inferred`.
- Tests: changesets-store.test.mjs (drawing proposal filed, refusals, verify/overlay refusals); the MA-5a-3 409 pin replaced.

### Task 3 — web
- evidence.ts: `alignBody`, `alignPreview(p1, p2, m1, m2)`, `drawingProposeLine`; files-panel Propose… on a drawing job with a drawing form
  (item, A/B paper + model, optional check, level, elevation) and a live preview line (scale 1:s, turn, move).
- review-desk: `trustWords` for basis "drawing"; `sourceWords` for a drawing job; `canMeasure` and the overlay only for survey changesets.
- package.json 1.0.75. Tests: evidence.test.ts, review-desk.test.ts.

### Task 4 — drill rows (combined with MA-5a-5/6, recorded once)
- P-0 the drill PDF admitted as ev-0007 (needs the founder's attestation (b) + request); P-1 Read drawings; W-1 Propose with the drill
  alignment → `Drawing job-NNNN · ev-0007 · <level>`: S/E walls CMU_300, N wall CMU_200, W wall 250 a gap, partition INT_ARC_CMU_100, D1
  `BDS_INT_1 PNL_WOOD_1000 x 2100 mm`, D2 a gap; nothing pre-ticked; R-1 Apply in Revit 2024.
