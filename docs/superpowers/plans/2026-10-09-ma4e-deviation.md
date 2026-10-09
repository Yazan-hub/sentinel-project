# MA-4e — deviation: a placed survey changeset measured, as filed, against its job's own scan (sentinel-survey `POST /measure`), judged by the bridge against D7's 20 mm on p95, one `verify:measured` row per run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fifth slice of MA-4 (design `docs/strategy/2026-09-30-model-automation-design.md` ▸ MA-4, :1136-1160; the MA-4c plan's Next, `docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md:2339`; the MA-4d plan's Next, `docs/superpowers/plans/2026-10-08-ma4d-survey-to-changesets.md:1609`). On the web desk's "Recently decided in Revit", a signed-in **contributor** presses **Measure against the scan** under a survey changeset Revit placed. The bridge — never the caller — picks everything: the walls Revit placed (`result.applied`, less any the ledger says were undone in Revit), each **as filed** (the changeset's own geometry, which the executor places exactly: its line, its measured thickness, its base and top), moved back into the scan's frame by the inverse of the lead's frame; the job's own `build:run` row (MA-4c decision 11, `trustedJob`) with its params and seed; the scans that job read, still the admitted bytes. It runs sentinel-survey once on the bridge's one survey slot — `POST /measure`, polled and read as a job — which re-hashes every file before and after the read, rebuilds the job's own cloud (same items, order, voxel and seed) and gives, per wall, numbers only: points, p95 of |d|, the signed mean (+ = the scan outside the wall), coverage and the shares within 50 / 100 / 200 mm. The bridge judges each wall (rule 3): `within_tolerance` when p95 ≤ 20 mm (D7) with at least a quarter of its faces seen, else `out_of_tolerance`, `insufficient_data`, `missing`, or `not_measured` with why (a level, a floor or ceiling, an Undo in Revit). ONE `verify:measured` row per run that starts (done, failed or refused: the `build:run` precedent), entity_id the changeset, `claimed: false`, `basis: "deviation"`, `reference: "as filed"`, the placement's provenance (`placed_by`: who filed Revit's report); a press on the same inputs as the newest done row is a 409 (the numbers would repeat, so no second row); `verify:` is reserved on the open audit route. No doc write, no table, no migration, no add-in change. The ghost's pre-placement `accuracy` (basis `fit`) and its pre-tick stay as filed (the founder's answer to MA-4d open question 1).

**Architecture:**
- `survey/pipeline.py`: `load(items, params, seed)` — survey()'s read, factored out so a measure rebuilds the job's exact cloud; `deviation(P, elements, tols)` — rectangles in, numbers out (numpy only).
- `survey/service.py`: `POST /measure` (`read_measure`, `rectangle`) — the same process lifecycle, token, one-run slot, re-hash before and after; `run()` gains a measuring branch.
- `WebApp/bridge/survey-service.mjs`: `runSurvey(job, {path = "/jobs"})` — one option. `fixtures/survey-standin.mjs`: answers `/measure`.
- `WebApp/bridge/build-jobs.mjs`: `trustedJob` answers the row's `params` and `seed`; `stillAdmitted` (MA-4d decision 4's check, factored out of `proposeFromJob`); `measureJob` (one measure on the `running` slot); startJob's busy words name what runs.
- `WebApp/bridge/survey-plan.mjs` (pure): `toScan`, `facesOf`, `measurePlan`, `judge`, `measureRefusal`, `STATUSES`, `countWords`, `MIN_COVERAGE`.
- `WebApp/bridge/changesets-store.mjs`: `verifyChangeset` (the route's work); `proposeFromJob` calls `stillAdmitted`.
- `WebApp/bridge/cde-store.mjs`: `RESERVED_ACTIONS` gains `verify:`. `WebApp/bridge/bcf-service.mjs`: `POST /cde/:key/verify`.
- Web: `src/setups/review-desk.ts` — `readVerified`, `measureWords`, `verifiedView`, `canMeasure`, `postMeasure`, `measureLine`, `countWords`; Measure and the newest measure's lines in the decided block.

**Tech Stack:** Python 3.14 + numpy (`survey/`, `unittest`), Node bridge (ESM `.mjs`, vitest, deps injected, a Node stand-in for the service), TypeScript web (plain DOM, textContent only). No new npm or pip dependency, no download, **no migration, no new table** (design §6.11 :957: views derived from ledger rows), **no add-in change, no deploy of the add-in, no promote-check pin** (no DTO the add-in reads changes).

**Base:** `feature/ma4e-deviation` at master `be25b60`. Every file:line below was read at `be25b60`. The deviation math below was run in memory on this PC (Python `-B`, code on stdin, nothing written) against the drill's own `%APPDATA%\Sentinel\evidence\ma4c-drill\scans\two-storey.las` (sha `244cba9d…`; 47 699 points in, 47 672 after the 20 mm voxel, seed 1) with GR-FFL's three walls as filed: wall-1 3 512 points, p95 3.0 mm, mean 0.0, share 1 / 1 / 1, coverage 0.999; wall-2 3 523, 3.0, 0.0, 1 / 1 / 1, 1.0; wall-3 2 569, 3.0, 0.0, 1 / 1 / 1, 1.0. Wall-1 moved 30 / 60 / 120 / 1000 mm: p95 33.0 / 63.0 / 123.0 / null; share 1·1·1 / 0·1·1 / 0·0·1 / null; 1000 mm: 0 points, coverage 0.0. Modelled 400 mm thick: mean −50.0, p95 53.0, share 50 = 0.59. On `test_survey.building()` (2 mm normal noise): p95 3.9, mean 0.0; +60 mm 63.3 and 0 / 1 / 1; 400 thick −50.0 and 0.5 at 50. Review round 2 (run again the same way, coverage over every point a face owns): `building()` less its points at |y| < 10 (the south wall's outer face unscanned, an exterior wall in an interior scan), wall-1 at dy 0 / −150 / −250 / −300: 1 759 points each, p95 3.8 / 153.2 / 253.2 / 303.2, mean 0.0 / +150.0 / +250.0 / +300.0, coverage 0.5 each (the first draft's 200 mm cut gave 0.0 at −250 and −300, so `insufficient_data`); every both-faces number above is unchanged by the fix. On the drill's own bytes less their points at |y| < 10, wall-1 at dy −250: 1 752 points, p95 253.0, mean +250.0, shares 0 / 0 / 0, coverage 0.5. Every number pinned below comes from those runs.

## Global Constraints

- House style: words are sentences; a refusal says what is needed and ends "nothing was saved" (a run that started and stopped says which row records it and "nothing else was saved"); comments name the slice ("MA-4e") and the reason; a `ponytail:` comment on every deliberate simplification names its ceiling and upgrade path; exact words pinned in tests. The web bump is the controller's at the merge.
- Commit messages `feat(survey|bridge|web): MA-4e - …` or `docs: MA-4e - …`, a blank line, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only on `feature/ma4e-deviation`.
- Tests: `npx vitest run <files>` from `WebApp`; `C:\Python314\python.exe -B -m unittest discover -s survey -v` from the repo root (`-B`: no `__pycache__`). Never a bare `node bridge/bcf-service.mjs`. Restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with `git checkout -- bridge/fixtures/lod-matrix/ids-cases.json` if it shows as modified; never stage `WebApp/package-lock.json`. `npm run build` must build; `tsc` is not a gate (17 pre-existing errors; no new one). `contract-parity.test.mjs` and `dotnet run --project tools/promote-check` stay green untouched.
- The repo is PUBLIC: fixtures and tests use `example.test`; no real e-mail or user path in a test, fixture or doc (the evidence folder is named `%APPDATA%\…`, never expanded).
- **The trust rule (binding):** every number on a `verify:measured` row comes from sentinel-survey run by the bridge over the job's own scan, re-hashed; every status, `basis`, `reference`, `claimed` and the element list are the bridge's. Of the service's result per element the bridge takes only the five numbers (`points`, `p95_mm`, `mean_signed_mm`, `coverage`, `share_within` at its own tolerances) and sets its own fields after them; a result carrying any other key (a `status`, a `reason`) or a number out of range is a failed run on its row, never merged. The placed list is Revit's report (`result.applied`) and the row says who filed it (`placed_by`). The body is `{changeset}` only; any other key (`results`, `points`, `faces`, `elements`, a status) is a 400 in words, never dropped.
- **The bridge writes the ledger.** ONE `verify:measured` row per run that starts; none for a refusal before it (a replay of the newest done row's inputs is such a refusal: decision 11); the open audit route refuses `verify:`.
- **numpy and the standard library only** in `survey/` (the `NoNetwork` test). **One process per measure** (MA-4c decision 3 kept): no warm service in MA-4e (decision 12).
- **Deterministic:** the same changeset, row, bytes, params, seed and sentinel-survey version give the same numbers (a measure by another version than the job's is failed: decision 5).
- **No add-in change.** `SentinelAddin/` and `tools/promote-check` are not edited.

## Source of truth

- Design (D) at `be25b60`: §2.1 rules 3, 6, 7 (:166, :169-172, :173); §2.3 stage 7 (:243) and "What stage 7 measures against" (:250-254); §4 scans (:447, :453); §6.3 the accuracy example (:724); §6.6 `verify:measured` (:842); §6.8 `POST /cde/:key/verify {changeset, results[]}` (:892); §6.9 `POST /jobs` (:916), `POST /measure {points, elements: [{guid, mesh}]}` (:919), MA-4c S2/S3 (:931); §6.11 storage (:956-957) and roles (:959-972, the survey rows :964-965); MA-4 (:1136-1160; deviation :1144-1145; drill MA4's F1 and level error :1154); D7 (:1348).
- MA-4c plan: decisions 3 (lifetime), 5 (kill paths), 6 (a person starts a run), 7 (one at a time, budget), 8 (items), 11 (`build:run`, one per run that starts), Next (:2339). MA-4d plan: decisions 3 (the trust anchor), 4 (evidence), 5 (the frame: the lead's statement), 14 (accuracy on the fit), 16 (no Revit pre-tick), 18 (`changeset_` reserved), 19; Risks (:1599 an Undo leaves the doc applied); drill R-1/R-2 (:1583-1584); Next (:1609 — its "the pre-tick reads it" is superseded by the founder's answer at :1641: decision 14 here); open questions answered (:1636-1645).
- Code read at `be25b60`: `survey/pipeline.py` (all), `survey/service.py` (all), `survey/las.py:45-62`, `survey/test_survey.py:1-160, 250-398`; `WebApp/bridge/survey-service.mjs` (all), `fixtures/survey-standin.mjs` (all), `survey-service.test.mjs:1-40, 95-120`; `build-jobs.mjs` (all), `build-jobs.test.mjs:1-60, 191-215`; `survey-plan.mjs` (all); `changesets-store.mjs` (all), `changesets-store.test.mjs:1-37, 939-995`; `proposal-model.mjs` (all); `cde-store.mjs:27, 1125-1191, 1193-1230, 1350-1370, 1862-1868`; `bcf-service.mjs:1288-1300, 1680-1707, 1840-1896, 1908-1911`; `public-verify.mjs:19-21`; `evidence-store.mjs:19-38, 157-168, 316-323`; `write-roles.test.mjs:1129-1147`; `SentinelAddin/GhostBuilder/ChangesetExecutor.cs:91, 101-123, 431-479, 703-741`; `PlacementGeometry.cs:59`; `src/setups/review-desk.ts` (all), `review-desk.test.ts:1-30, 155-215`; `src/setups/bridge-fetch.ts:78-83`; `WebApp/scripts/make-two-storey-las.mjs:1-30`; `fixtures/changeset-ops/contract2-survey.json`; `%APPDATA%/Sentinel/jobs/ma4c-drill/job-0002/` and the drill scan (read only).

## Decisions (the founder's defaults; built on unless overruled)

| # | Decision | Default taken here |
|---|---|---|
| 1 | What "placed" is measured as | **As filed**: each placed element's geometry as its changeset holds it — the executor places exactly that (`Wall.Create` on the `LocationCurve`, the exact type whose width is `facts.thickness_mm` under D16, base the level, top `TopElevation` unconnected: `ChangesetExecutor.cs:440-466`; drill MA4d R-1 saw base offset 0, top 2800, corners at (47 850, 150) and (47 850, 5 900)). The row says `reference: "as filed"`; the desk says "not re-read from Revit: a wall moved since, Revit's joins, the type's width in Revit and the lead's frame are not seen". What it adds over the fit: the full storey height (the fit read only the mid-storey slice ±300 mm, `pipeline.py:22`), bowed or leaning faces (MA-4d :1603), the trimmed ends' line. What it cannot see: a wall moved in Revit after Apply, a model closed unsaved, a wrong frame (forward and back by one statement), a location line other than Wall Centerline, a type whose real Width is not `facts.thickness_mm` (the executor resolves the type by name only). The last two are drill row R-1's, **run first, as a gate before the merge**: either one failing stops the slice before `facesOf` is merged. Which ghosts count as placed is Revit's report (`result.applied`); the row copies who filed it (`placed_by {reported_by, reported_role}`, the bridge's own reading at `reportResult`, `changesets-store.mjs:423-424`), and the desk says "the machine credential's report" when it was. A Revit re-read (the solid via `ClashManager.GetMainSolid` + `Face.Triangulate`, posted on `AppliedEntry.mesh`, C# and a 2021–2027 deploy) is MA-4f's, beside the overlay and Revit's pre-tick — and it would be the client's claim (`reference: "revit (claimed)"`), where as-filed geometry is the bridge's own stored, job-tied doc. Open question 1 |
| 2 | What is measured | **Walls only**: both faces are known (the line ± half the measured thickness), so every scan point near the wall has a face of its own. Levels → `not_measured` ("a level has no face to measure — its height against the scan is MA-4h's level error"); floors and ceilings → `not_measured` ("one face of a floor is seen; its other is its type's, which no scan measured, and the slab beyond would count against it — MA-4h"): measured in memory, the L01 slab 200 mm above L00's ceiling put every ceiling's p95 at ~200 mm. With the BDS standards floors and ceilings are gaps anyway (never placed). Doors and windows are not in survey changesets (MA-5) |
| 3 | Who, and when | **On demand, a signed-in contributor or above**; the machine credential is a 403 ("needs a person"). Why contributor, not lead: a measure states nothing about the model (unlike MA-4d's frame and levels, decision 1 there) and changes nothing; it is a run on the PC's CPU that names who asked — exactly MA-4c decision 6's "Start a survey job" (contributor, signed in). Why not automatic after Revit's report: `reportResult` would wait on a Python run (Revit's Report retries a 503 and stops at a 409), the report may come from the machine credential (no person to name), and one slot with no queue would refuse a survey job started meanwhile. ponytail: on demand only; automatic after `changeset_applied` when a job queue exists |
| 4 | The route | `POST /cde/:key/verify {changeset}` → 200 — design §6.8's path; **spec amendment S1**: no `results[]` (the bridge measures; a caller's results would be a claim, and Revit's re-read is MA-4f's). Synchronous, bounded by `JOB_MS` (10 min); the drill scan takes seconds. ponytail: a 202 and a record when Kladno's measure outlasts a request (MA-4h). Not public: `isPublicRoute` matches only `/receipt/<key>/verify` (`public-verify.mjs:20-21`) |
| 5 | The trust anchor | The changeset's `job` (bridge-written since 0037, `claimed: false`) → `trustedJob(key, cs.job.id)` (MA-4c decision 11, unchanged) whose row id and result sha equal the changeset's `job.ledger_id` and `job.result_sha256` (a job id repeats across jobs folders: decision 19 of MA-4d) → **the row's** `params` and `seed` (never job.json's) → every scan the row says it read is still the admitted bytes (`stillAdmitted`, MA-4d decision 4's check factored out, words unchanged) and still readable (`pickItems`) → the service re-hashes each file before and after the read. Items go in the order the job sent them, so the seeded sample past 10 M points is the same. The row's `job` names the job row's `version`; a measure the service ran at another version is **failed** on its row ("its cloud is not known to be the job's; run the survey again"): an upgrade that changes the read, the voxel or `MAX_POINTS` (MA-4h) must not pass for the job's own cloud |
| 6 | An Undo in Revit | `reportReverted` writes a row and leaves the doc `applied` (`changesets-store.mjs:474-495`). Before a measure the bridge reads the changeset's `changeset_` rows (reserved since MA-4d, so the bridge's): a guid whose newest `changeset_reverted` row is an `undo` is `not_measured` ("undone in Revit (ledger #n) — nothing placed to measure"); nothing left to send is a 409. The read is one page of 1 000; a changeset with more `changeset_` rows than that (a long run of Undo/Redo reports) is a 503 in words, never a cut read that could miss the newest Undo (the desk's `readLedger` refuses the same case). The same read names the `changeset_applied` row (`applied_row`) and the newest `changeset_reverted` row (`reverted_row`, or null) on the verify row. The desk hides Measure when the report's newest revert is an undo |
| 7 | The service contract (§6.9) | **Spec amendment S2:** `POST /measure {job_id, items, params: {voxel_mm, storey_min_mm, tolerances_mm}, seed, elements: [{guid, faces}]}` → 202, polled at `GET /jobs/:id`, read at `GET /jobs/:id/result` — items, not points (no evidence byte crosses a route; the body is capped at 1 MB; `read_job` already validates the items and params); `faces`, not `mesh`: planar rectangles `[p0, p1, p3]` in mm in the scan's frame, `(p1 − p0) × (p3 − p0)` out of the element (numpy only — triangles wait for openings, MA-5, and roofs, MA-6). Every item it was sent must be read again, or the whole measure is `refused` (a subset would be another cloud). **Spec amendment S3:** the result is numbers only — the status is the bridge's (rule 3), so §6.9's `status` moves to the bridge |
| 8 | The measure | Per face: points over its interior (**200 mm in from every edge** — the floor, the ceiling, the slab above, a join, a free end and the next storey are not judged) and within **400 mm** of its plane (twice the largest tolerance, so the 200 mm share is not 1 by construction); each point goes to the **nearest such face of any element sent** (a wall's other face, a neighbour's face take their own points). `d` signed, **+ when the scan lies outside the element**. Per element: `points`; `p95_mm` = the 95th percentile of \|d\| (numpy's default, linear); `mean_signed_mm` (a shifted wall reads + on one face and − on the other: ≈ 0; a wall modelled too thick reads − on both); `share_within {"50","100","200"}` = the share of its points within each (cloud-to-model, design :724's reading); `coverage` = the share of its faces' 200 mm interior cells holding a point it owns (within 400 mm) — every point the face owns, so a wall placed 200 to 400 mm off a face seen from one side reads coverage 0.5 and p95 decides (`out_of_tolerance`), never 0 and `insufficient_data` (Base, review round 2; 100 mm cells on the drill's 100 mm grid leave a quarter empty by chance). 0.1 mm and 3 decimals; numbers null with no point; coverage null with no interior. ponytail: v0.1's fixed knobs (named on the receipt and the row: `measure {band_mm, edge_mm, cell_mm}`), each tuned by MA-4h on Kladno |
| 9 | The verdict | The bridge's (`judge`): `not_measured` (no face interior: under 400 mm on a side), `missing` (no point: "not built where it stands, or not scanned there"), `insufficient_data` (coverage < **0.25**: a wall seen from one side, ≈ 0.5, is judged on that face, however far off it sits within 400 mm), else `within_tolerance` when p95 ≤ `TOLERANCE_MM` (20, D7) or `out_of_tolerance`. Words "within tolerance (20 mm, p95)"; never "survey grade", "permit grade" or an LOA band (D7; the LOA band per element is MA-8). One target for every class (D7); a per-class `lod_matrix` tolerance (refused today, MA-2b S7) or the contract tolerance field is MA-8. `inferred` stays MA-5's. Open question 2 (the minimum) |
| 10 | The row | `audit()`: entity_type `changeset`, entity_id the changeset id (the desk reads by entity_id), action `verify:measured <job-id> · sentinel-survey <version> · <done|failed|refused>` plus ` · <counts>` when done; new_value in Interfaces (`claimed: false`, `model_calls: 0`, `tokens: 0`; `tools` with their licences, §6.10; `placed_by` — Revit's report's `reported_by` and `reported_role`, so a placement the machine credential reported never reads as a person's or the bridge's; `reverted_row` and `faces_sha256` — what decision 11's replay check compares). One per run that starts — done, failed (the run's words) or refused (the service's per item) — the `build:run` precedent; none for a refusal before the run. A changeset holds at most 200 elements (`MAX_CHANGESET_ELEMENTS`), which bounds the row. **`verify:` is reserved** (`RESERVED_ACTIONS`): no client posts one (grep: none in `WebApp/src`, `SentinelAddin`, `survey`); without it the machine credential could post a row the desk reads as the bridge's (the MA-4d decision 18 precedent) |
| 11 | Where the result lives | **Only on the row.** No changeset-doc write (no CAS, no `review_rev` churn on an applied doc), no table, no migration — design §6.11 :956: "the views are derived from the ledger". The desk reads the newest `verify:measured` row per changeset: one read per survey report it shows (at most `DECIDED_MAX`, `limit=1`, in parallel — `journey-store.mjs:48`'s newest-row read), so a busy report never cuts a quiet one's and a failed read is that one report's "not read — …". **A replay is refused:** the measure is deterministic, so before the run the bridge reads the changeset's newest `verify:measured` row (`limit: 1`); when it is `done` and its `job.ledger_id`, `evidence` shas, `applied_row`, `reverted_row` and `faces_sha256` (sha256 of what is sent) all equal this run's, the press is a 409 "… was measured on these same inputs as ledger #n — the same bytes, seed and geometry give the same numbers; nothing was saved". A failed or refused newest row, an Undo or a Redo in Revit, or a changed job measures again; the newest wins on the desk; the ledger keeps every one. ponytail: a new sentinel-survey version (or a changed target in the bridge) is re-measured only once an input changes — a "measure anyway" when the founder asks for one |
| 12 | Service lifetime | **Cold: one process per measure** (MA-4c decision 3 kept; the slice title's "may stay warm" allows it, nothing needs it): one person-triggered measure per changeset is not quick-call traffic, and its cost is two hashes and a read of the scan, not Python's start (1–2 s against `READY_MS` 20 s). Same lifecycle and kill paths (`READY_MS`, `JOB_MS`, `BUSY_MS`, the bridge's `exit`, the stdin watchdog), same per-start token, same `running` slot as survey jobs: a measure and a job never share the CPU (409 in words either way). ponytail: a warm service with a cloud cache keyed on (the items' shas, voxel, seed), an idle timeout and a memory bound when verify runs per Apply in bulk (MA-4h) |
| 13 | Budget | `takeWriteBudget("survey jobs", {perUser: 6, all: 12})` — the survey jobs' own bucket: one budget for the PC's CPU |
| 14 | The ghost's accuracy and the pre-tick | **Unchanged.** `accuracy {basis: "fit", …}` and `pretick` stay as filed (the founder, MA-4d open question 1: "the 20 mm judged before placement on the larger of the fit rmse and face_dev_mm; MA-4e adds verify:measured"); a deviation measured after placement cannot feed the pre-tick of the ghost it measures, and Revit pre-ticks no create until MA-4f. The MA-4d plan's Next line "the pre-tick reads it" is superseded. A pre-placement deviation per candidate at job time (tolerances already go to `/jobs`, `build-jobs.mjs:177`) is MA-4f's, with Revit's pre-tick |
| 15 | Level error, drill MA4's F1 | **The computed level error (code) and F1 are MA-4h's**, as three plans assign them (MA-4a :48, MA-4c :2339, MA-4d :74, :1609): F1 at 5/10/20 cm is detection against a hand-built reference, not this per-element share; the design gets a note at :1154 (Task 9). **The drill measures the level error by hand** (R-1, read only, no code): each level's Elevation in `ma4d.rvt` against its storey's height in the model frame (the job-0002 level candidate's `BaseElevation` in `result.json` plus the frame's `dz_mm` 0 — the storey record's `elevation_mm`), recorded as "level error GR-FFL: N mm; Scan L01: 0 mm (created at the scan's height)" in the session notes and the design's MA-4 drill note. A wall's vertical faces do not depend on its base, and the 200 mm margin keeps the base out: a named, unchecked level (GR-FFL) does not move a wall's deviation; the row states `storey {level, how, checked, delta_mm}` |
| 16 | Web | The review desk's "Recently decided in Revit" (`recent()`): under a placed survey report, the newest measure's head and one line per placed element; **Measure against the scan** / **Measure again** for a signed-in contributor or above while the report is not undone in Revit; one press, one run (disabled, "Measuring…"). Nothing else on the web changes (Evidence ▸ Survey lists jobs, not placements; the Holding Area holds gaps, not placed walls) |
| 17 | MCP | No tool: a measure is a person's (3); `sentinel_changeset_status` is unchanged |

## Scope

In: `pipeline.load` and `pipeline.deviation`; the service's `POST /measure`; `runSurvey`'s path; `trustedJob`'s params and seed; `stillAdmitted`; `measureJob`; the pure plan, verdict and checks in `survey-plan.mjs`; `verifyChangeset` and its route; `verify:` reserved; the desk's Measure and lines; the design amendments; drill MA4e.

Out (see Next): a Revit re-read of placed geometry and `results[]` (MA-4f); a deviation-based pre-tick, Revit's pre-tick, the scan overlay (MA-4f); a computed frame (MA-4g); floors, ceilings, level error, wall F1, a warm service, an async verify, the knobs tuned, Kladno's run time and memory (MA-4h); a deviation heat map in the web desk (MA-4i); openings and faces with holes, matching scan walls to existing walls (MA-5); the LOA band, a per-class tolerance, the Federation Gate tolerance rule, one BCF topic per failing element (MA-8); automatic verify after Apply; out-of-tolerance walls to the Holding Area.

## Interfaces

```text
Route (small JSON; behind the auth gate like every /cde/ route)
  POST /cde/:key/verify {changeset: <uuid>}
       → 200 {changeset: {id, name}, status: "done",
              counts: {within_tolerance, out_of_tolerance, missing, insufficient_data, not_measured},
              elements: [{proposal_guid, revit_unique_id, cid, kind, status, basis: "deviation", reason?,
                          points?, p95_mm?, mean_signed_mm?, share_within?, coverage?}],
              ledger: {id, hash}}
  Refusals before the run, in this order (each ends "nothing was saved"; a callee's words get it appended):
  403 the machine credential; 403 below contributor; 400 the body; 429; 404 the changeset; 409 not a survey changeset; 409 not placed;
  400/404/409 the job (trustedJob); 409 not the job it was built from; 409 no params or seed on its row; 409 a scan changed (stillAdmitted)
  or not readable (pickItems' reason); 503 its ledger rows not read, or more changeset_ rows than one read returns; 409 nothing to measure
  (each reason); 409 measured on these same inputs (a replay: decision 11); 503 sentinel-survey not set up; 409 a survey job or a measure running.
  After the run (its row written): 409 refused, 502 failed (the run's words; a result not the contract's shape — a key beyond the five numbers,
  a number out of range; a service version not the job's) — each naming the row ("ledger #n records the run; nothing else was saved");
  502 the row not taken ("nothing was saved; measure it again").

sentinel-survey (one process per measure; 127.0.0.1, a per-start token, the stdin watchdog — MA-4c decisions 3-5)
  POST /measure {job_id: "measure-<changeset id>", items: [{id, kind: "scan", path, sha256}]  (the row's read, in the order sent),
                 params: {voxel_mm, storey_min_mm, tolerances_mm: [50, 100, 200]}, seed,
                 elements: [{guid, faces: [[p0, p1, p3], …]}]}                                  → 202 {job_id, status: "queued"}
  GET /jobs/:id → {status: queued|running|done|failed|refused, stage, pct, refused, error?}
  GET /jobs/:id/result → {elements: [{guid, points, p95_mm, mean_signed_mm, share_within: {"50", "100", "200"}, coverage}], derived: [],
                          receipt: {tools, params, seed, started, finished, cpu_s, points_in, points_used,
                                    measure: {band_mm: 400, edge_mm: 200, cell_mm: 200}, units}}

Bridge
  survey-service  runSurvey(job, {path = "/jobs", …})
  build-jobs      trustedJob(key, id) → row gains {params, seed}; stillAdmitted(row, pack, id) → [{id, sha256}] | 409;
                  measureJob(key, jobId, payload, deps?) → runSurvey's record | 503 | 409
  survey-plan     toScan(frame) → {xy, z}; facesOf(el, S) → {faces} | {why}; measurePlan(cs, undone) → {send, skip, placed};
                  judge(m, measure) → {status, reason?}; measureRefusal(result, send, tols) → null | what (a key beyond the five numbers, a number
                  out of range); STATUSES; countWords(counts); MIN_COVERAGE = 0.25
  changesets-store verifyChangeset(key, body, actor, deps?)

Row (audit(), the bridge's; the open audit route refuses every action starting verify:)
  entity_type changeset, entity_id <changeset id>,
  action "verify:measured job-0002 · sentinel-survey 0.1.0 · done · 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured"
  new_value {changeset: {id, name}, applied_row, reverted_row, placed_by: {reported_by, reported_role}, faces_sha256, status,
             job: {id, ledger_id, result_sha256, version}, evidence: [{id, sha256}], reader, version, tools,
             params, seed, tolerances_mm, target_mm: 20, min_coverage: 0.25, measure: {band_mm, edge_mm, cell_mm}, reference: "as filed",
             frame, storey: {level, how, checked, delta_mm}, sign: "+ = the scan outside the element's face", started, finished, cpu_s,
             points_in, points_used, counts, elements: [as the reply], model_calls: 0, tokens: 0, claimed: false, error?}

Web (review-desk.ts; every string by textContent)
  readVerified(base, key, ids) → Map<id, VerifyRecord | Error | null>   one GET per id, in parallel:
                                 /cde/:key/audit?entity_type=changeset&action_prefix=verify:measured&limit=1&entity_id=<id>
  postMeasure(base, key, id) → MeasureReply              POST /cde/:key/verify {changeset}
  measureWords(m, target?), verifiedView(cs, rec), canMeasure(cs, role, rows), measureLine(r), countWords(n)
```

## File map

| File | Change |
|---|---|
| `survey/pipeline.py` (:38-54; after :354), `survey/test_survey.py` (imports; after `Voxel` :250; `InProcess` :316; `Service` :258) | `load`, `deviation`; `Deviation` tests; the service's measure tests |
| `survey/service.py` (:7-19 imports; after :27; :74-109; after :128; :178, :184) | `MAX_ELEMENTS`, `MAX_FACES`, `rectangle`, `read_measure`; `run`'s measuring branch; `/measure` |
| `WebApp/bridge/survey-service.mjs` (:42-46, :81) | `path` |
| `WebApp/bridge/fixtures/survey-standin.mjs` (:22-26, :38-43) | answers `/measure` |
| `WebApp/bridge/survey-service.test.mjs` (in the stand-in describe; in the real block after :118) | a measure through the stand-in; the drill's walls for real |
| `WebApp/bridge/build-jobs.mjs` (:33, :154, after :124, :292-293, after :294), `build-jobs.test.mjs` (:206; a new describe) | `stillAdmitted`, `measureJob`, params and seed, the busy words |
| `WebApp/bridge/survey-plan.mjs` (after :63; at the end), `survey-plan.test.mjs` (a new describe) | `toScan`, `facesOf`, `measurePlan`, `judge`, `measureRefusal`, `STATUSES`, `countWords`, `MIN_COVERAGE` |
| `WebApp/bridge/changesets-store.mjs` (:4 `createHash`; :12 imports; :269-276; after :361), `changesets-store.test.mjs` (imports; a new describe at the end) | `verifyChangeset`; `proposeFromJob` → `stillAdmitted` |
| `WebApp/bridge/cde-store.mjs` (:1207-1211) | `"verify:"` appended to `RESERVED_ACTIONS` |
| `WebApp/bridge/bcf-service.mjs` (before :1691) | the route |
| `WebApp/bridge/write-roles.test.mjs` (after :1147) | one `describe` |
| `WebApp/src/setups/review-desk.ts`, `review-desk.test.ts` (:204, :208; a new describe) | the desk |
| `docs/strategy/2026-09-30-model-automation-design.md` | Task 9 |

---

### Task 1 — Survey: the job's cloud again (`load`), and deviation

**Files:** modify `survey/pipeline.py`, `survey/test_survey.py`.

- [ ] **Step 1: the tests first** — `test_survey.py`: add `import math` to the imports; after `building()` (:78):
```python
def wall_faces(start, end, t, z0, z1):
    """MA-4e: a wall's two long faces as survey-plan.mjs facesOf builds them — [p0, p1, p3], (p1 − p0) × (p3 − p0) out of the wall."""
    (ax, ay), (bx, by) = start, end
    L = math.hypot(bx - ax, by - ay)
    nx, ny = -(by - ay) / L * t / 2, (bx - ax) / L * t / 2
    return [[[ax + nx, ay + ny, z0], [ax + nx, ay + ny, z1], [bx + nx, by + ny, z0]],
            [[ax - nx, ay - ny, z0], [bx - nx, by - ny, z0], [ax - nx, ay - ny, z1]]]
```
  and after `class Voxel` (:250):
```python
class Deviation(unittest.TestCase):
    """MA-4e: pipeline.deviation on the drill building (2 mm of noise across each face) — numbers only, the bridge judges (survey-plan judge).
    Pinned from the in-memory run of the plan (Base)."""
    TOLS = [50, 100, 200]

    @classmethod
    def setUpClass(cls):
        cls.P = building()

    def wall(self, dy=0, t=300, guid="wall-1"):  # the south wall as filed (trimmed to x 125..7850, y 150), moved dy in y
        return {"guid": guid, "faces": wall_faces((125, 150 + dy), (7850, 150 + dy), t, 0, 2800)}

    def test_a_wall_where_it_was_scanned_is_a_few_mm_off_both_faces_seen_numbers_only(self):
        (m,) = pipeline.deviation(self.P, [self.wall()], self.TOLS)
        self.assertEqual(set(m), {"guid", "points", "p95_mm", "mean_signed_mm", "share_within", "coverage"})  # no status: the bridge's
        self.assertLess(m["p95_mm"], 5.0)  # |N(0, 2)|'s p95 is 3.9 mm
        self.assertLess(abs(m["mean_signed_mm"]), 0.5)
        self.assertEqual(m["share_within"], {"50": 1.0, "100": 1.0, "200": 1.0})
        self.assertGreaterEqual(m["coverage"], 0.98)
        self.assertGreater(m["points"], 3000)  # both faces, 200 mm in from every edge — the floor, the ceiling and the corners left out

    def test_a_wall_moved_60_mm_is_60_off_plus_on_one_face_minus_on_the_other(self):
        (m,) = pipeline.deviation(self.P, [self.wall(dy=60)], self.TOLS)
        self.assertTrue(58 < m["p95_mm"] < 66, m)
        self.assertLess(abs(m["mean_signed_mm"]), 2.0)
        self.assertEqual(m["share_within"], {"50": 0.0, "100": 1.0, "200": 1.0})

    def test_a_wall_modelled_100_mm_too_thick_reads_minus_50_the_scan_inside_it(self):
        (m,) = pipeline.deviation(self.P, [self.wall(t=400)], self.TOLS)
        self.assertTrue(-52 < m["mean_signed_mm"] < -48, m)
        self.assertTrue(50 < m["p95_mm"] < 57, m)

    def test_a_wall_where_nothing_was_scanned_has_no_point_and_its_cells_counted_empty(self):
        (m,) = pipeline.deviation(self.P, [self.wall(dy=1000)], self.TOLS)  # faces at y 1 000 and 1 300: the nearest scan face is 700 mm off
        self.assertEqual((m["points"], m["p95_mm"], m["mean_signed_mm"], m["share_within"], m["coverage"]), (0, None, None, None, 0.0))

    def test_a_wall_seen_from_one_side_250_mm_off_is_judged_on_that_face_not_unseen(self):
        # The south wall's outer face (y 0) not scanned — an exterior wall in an interior scan; the wall placed 250 mm off. Every point the
        # face owns (within 400 mm) counts for coverage, so p95 decides (out of tolerance), never insufficient data. Base, review round 2.
        P = self.P[np.abs(self.P[:, 1]) >= 10]
        (m,) = pipeline.deviation(P, [self.wall(dy=-250)], self.TOLS)
        self.assertAlmostEqual(m["coverage"], 0.5, delta=0.02)
        self.assertTrue(250 < m["p95_mm"] < 257, m)
        self.assertTrue(248 < m["mean_signed_mm"] < 252, m)
        self.assertEqual(m["share_within"], {"50": 0.0, "100": 0.0, "200": 0.0})

    def test_a_face_under_400_mm_has_no_interior(self):
        (m,) = pipeline.deviation(self.P, [{"guid": "stub", "faces": wall_faces((125, 150), (450, 150), 300, 0, 2800)}], self.TOLS)
        self.assertEqual((m["points"], m["coverage"]), (0, None))

    def test_each_point_goes_to_the_nearest_face_of_every_element_sent(self):
        east = {"guid": "wall-3", "faces": wall_faces((7850, 150), (7850, 5900), 300, 0, 2800)}
        a, b = pipeline.deviation(self.P, [self.wall(), east], self.TOLS)
        self.assertEqual([a["guid"], b["guid"]], ["wall-1", "wall-3"])
        self.assertLess(max(a["p95_mm"], b["p95_mm"]), 5.0)

    def test_load_gives_the_cloud_survey_measured_the_same_twice(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
            path = os.path.join(d, "b.las")
            write_las(path, building())
            items = [{"id": "ev-0001", "path": path, "head": las.read_header(path)}]
            P1, _, n = pipeline.load(items, {"voxel_mm": 20}, 1)
            P2, _, _ = pipeline.load(items, {"voxel_mm": 20}, 1)
            _, stats = pipeline.survey(items, {"voxel_mm": 20, "storey_min_mm": 2000}, 1)
        np.testing.assert_array_equal(P1, P2)
        self.assertEqual((n, len(P1)), (stats["points_in"], stats["points_used"]))
```
  Run `C:\Python314\python.exe -B -m unittest discover -s survey -k Deviation -v` from the repo root → fails (no `deviation`, no `load`).
- [ ] **Step 2: the code** — `pipeline.py`, survey() (:38-54) becomes:
```python
def load(items, params, seed, progress=lambda stage, pct: None):
    """The cloud survey() measures: every item read (a seeded sample past MAX_POINTS), one building at most, one point per voxel_mm cube.
    MA-4e: the same items in the same order, voxel_mm and seed give the same points — deviation reads exactly the cloud a job's candidates
    came from. items: [{id, path, head}], hashed and headed by the service. → (P mm, src, points_in); las.Refused in words past MAX_SPAN."""
    points_in = sum(i["head"]["count"] for i in items)
    share, rng = min(1.0, MAX_POINTS / points_in), np.random.default_rng(seed)
    progress("reading", 10)
    clouds = [las.read_points_mm(i["path"], i["head"], share, rng) for i in items]
    P = np.concatenate(clouds)
    span = float(np.ptp(P[:, :2], axis=0).max())
    if span > MAX_SPAN:
        raise las.Refused(f"the scans span {span / 1000:.0f} m in plan — sentinel-survey 0.1 reads one building (at most "
                          f"{MAX_SPAN / 1000:.0f} m across); a larger site waits for MA-4h")
    src = np.concatenate([np.full(len(c), k) for k, c in enumerate(clouds)])
    P, src = voxel(P, src, float(params["voxel_mm"]))
    return P, src, points_in


def survey(items, params, seed, progress=lambda stage, pct: None):
    """items: [{id, path, head}], hashed and headed by the service. → (candidates, {points_in, points_used}); las.Refused in words when
    the scans span more than one building."""
    P, src, points_in = load(items, params, seed, progress)
    progress("storeys", 30)
    out = measure(P, src, [i["id"] for i in items], float(params["storey_min_mm"]), progress)
    return out, {"points_in": int(points_in), "points_used": int(len(P))}
```
  and at the end of the file:
```python
# ── MA-4e: deviation (design §6.9 POST /measure) — how far the job's own cloud sits from each placed element's faces. Numbers only: the
#    bridge judges (rule 3). v0.1's fixed knobs, named on the receipt (receipt.measure); each one MA-4h tunes on Kladno. ──
EDGE = 200.0      # mm: a face is read this far in from every edge — the floor, the ceiling, the slab above, a join and a free end are not judged
DEV_CELL = 200.0  # mm: coverage cells on a face, filled by any point the face owns (100 mm cells on the drill's 100 mm grid leave a quarter empty by chance)


def deviation(P, elements, tols, progress=lambda stage, pct: None):
    """P: the job's cloud (mm, the scan's frame). elements: [{guid, faces: [[p0, p1, p3], …]}] — rectangles in the scan's frame, p1 and p3 the
    corners next to p0, (p1 − p0) × (p3 − p0) pointing out of the element. A point counts for a face when it lies over the face's interior
    (EDGE in from every edge) within BAND = 2 × the largest tolerance of its plane, and goes to the nearest such face of every element sent
    (a wall's other face and a neighbour's face take their own points). d is its signed distance: + when the scan lies outside the element.
    → per element, in the order sent: {guid, points, p95_mm (of |d|), mean_signed_mm, share_within {tol: share of its points with |d| ≤ tol},
    coverage (its faces' interior cells holding a point it owns — within BAND, so a face seen but placed far off still counts as seen and
    p95 judges it)} — 0.1 mm and 3 decimals; the numbers null with no
    point, coverage null when no face has an interior.
    ponytail: each face is a pass over the cloud cropped to the elements' box (faces x points) — fine for a storey of 200 walls; a plan-grid
    index when MA-4h measures Kladno. Clutter, or an element not placed, within BAND of a face's interior counts against it (the honest
    reading: the scan is not the model). ~1 GB at the 10 M point cap (the crop and three per-point arrays) — MA-4h measures it."""
    band = 2.0 * float(max(tols))
    F = []  # (element, origin, u, |u|, v, |v|, outward normal)
    for k, e in enumerate(elements):
        for p0, p1, p3 in e["faces"]:
            o = np.asarray(p0, float)
            a, b = np.asarray(p1, float) - o, np.asarray(p3, float) - o
            la, lb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
            F.append((k, o, a / la, la, b / lb, lb, np.cross(a, b) / (la * lb)))
    box = lambda o, u, la, v, lb: np.array([o, o + u * la, o + v * lb, o + u * la + v * lb])  # noqa: E731
    corners = np.concatenate([box(o, u, la, v, lb) for (_, o, u, la, v, lb, _) in F])
    Q = P[np.all((P >= corners.min(axis=0) - band) & (P <= corners.max(axis=0) + band), axis=1)]
    best, owner, sd = np.full(len(Q), np.inf), np.full(len(Q), -1, np.int64), np.zeros(len(Q))
    for i, (_, o, u, la, v, lb, n) in enumerate(F):
        c = box(o, u, la, v, lb)
        idx = np.flatnonzero(np.all((Q >= c.min(axis=0) - band) & (Q <= c.max(axis=0) + band), axis=1))
        R = Q[idx] - o
        s, t, d = R @ u, R @ v, R @ n
        ok = (s >= EDGE) & (s <= la - EDGE) & (t >= EDGE) & (t <= lb - EDGE) & (np.abs(d) <= band) & (np.abs(d) < best[idx])
        j = idx[ok]
        best[j], owner[j], sd[j] = np.abs(d[ok]), i, d[ok]
        progress("measuring", 40 + 50 * (i + 1) // len(F))
    out = []
    for k, e in enumerate(elements):
        ds, filled, cells = [], 0, 0
        for i, (kk, o, u, la, v, lb, _) in enumerate(F):
            nu, nv = math.ceil((la - 2 * EDGE) / DEV_CELL), math.ceil((lb - 2 * EDGE) / DEV_CELL)
            if kk != k or nu <= 0 or nv <= 0:
                continue
            j = np.flatnonzero(owner == i)
            ds.append(sd[j])
            cells += nu * nv
            R = Q[j] - o  # every point the face owns (already within BAND): a face seen but far off is seen, and p95 judges it
            cu = np.minimum(np.floor((R @ u - EDGE) / DEV_CELL), nu - 1).astype(np.int64)
            cv = np.minimum(np.floor((R @ v - EDGE) / DEV_CELL), nv - 1).astype(np.int64)
            filled += np.unique(cu * nv + cv).size
        d = np.concatenate(ds) if ds else np.zeros(0)
        a = np.abs(d)
        out.append({"guid": e["guid"], "points": int(d.size),
                    "p95_mm": round(float(np.percentile(a, 95)), 1) + 0.0 if d.size else None,  # + 0.0: never -0.0
                    "mean_signed_mm": round(float(d.mean()), 1) + 0.0 if d.size else None,
                    "share_within": {str(t): round(float((a <= t).mean()), 3) for t in tols} if d.size else None,
                    "coverage": round(filled / cells, 3) if cells else None})
    return out
```
  (`box` may be written as a nested `def` if the linter objects to the lambda.) Run the Deviation tests → pass; the whole suite → pass (survey() unchanged in output: `test_survey`'s Survey and Service cases).
- [ ] **Step 3: commit** — `feat(survey): MA-4e - load (the job's own cloud again) and deviation per element: p95, signed mean, shares within the bands, coverage — numbers only`

### Task 2 — Survey: `POST /measure`

**Files:** modify `survey/service.py`, `survey/test_survey.py`.

- [ ] **Step 1: the tests first** — `test_survey.py`, in `class InProcess` (after :363):
```python
    MEASURE = {"voxel_mm": 20, "storey_min_mm": 2000, "tolerances_mm": [50, 100, 200]}

    def run_measure(self, items, elements):
        service.JOB.clear()
        service.JOB.update(id="measure-1", status="queued", stage="queued", pct=0, refused=[])
        with contextlib.redirect_stderr(io.StringIO()):
            service.run({"job_id": "measure-1", "items": items, "params": self.MEASURE, "seed": 1, "elements": elements})
        return service.JOB

    def test_a_measure_reads_the_jobs_cloud_again_and_gives_numbers_and_its_knobs(self):
        item = self.item(building())
        job = self.run_measure([item], [{"guid": "wall-1", "faces": wall_faces((125, 150), (7850, 150), 300, 0, 2800)}])
        self.assertEqual(job["status"], "done", job)
        (m,) = job["result"]["elements"]
        self.assertLess(m["p95_mm"], 5.0)
        self.assertNotIn("candidates", job["result"])
        self.assertEqual(job["result"]["receipt"]["measure"], {"band_mm": 400, "edge_mm": 200.0, "cell_mm": 200.0})
        self.assertEqual(job["result"]["receipt"]["seed"], 1)

    def test_a_measure_with_one_item_not_read_measures_nothing(self):
        item = self.item(building())
        job = self.run_measure([item, {**item, "id": "ev-0002", "sha256": "0" * 64}], [{"guid": "w", "faces": wall_faces((125, 150), (7850, 150), 300, 0, 2800)}])
        self.assertEqual((job["status"], [r["id"] for r in job["refused"]]), ("refused", ["ev-0002"]))
        self.assertNotIn("result", job)

    def test_read_measure_refuses_in_words(self):
        good = {"job_id": "measure-1", "items": [{"id": "ev-0001", "kind": "scan", "path": "x", "sha256": "a" * 64}], "params": dict(self.MEASURE), "seed": 1,
                "elements": [{"guid": "w", "faces": wall_faces((0, 0), (5000, 0), 200, 0, 2800)}]}
        self.assertEqual(service.read_measure(good)["elements"][0]["guid"], "w")
        for bad, words in (({**good, "params": {"voxel_mm": 20, "storey_min_mm": 2000}}, "params.tolerances_mm must be 1 to 5 whole numbers of mm from 1 to 1000, rising"),
                           ({**good, "params": {**self.MEASURE, "tolerances_mm": [200, 50]}}, "params.tolerances_mm must be 1 to 5 whole numbers of mm from 1 to 1000, rising"),
                           ({**good, "elements": []}, "elements must be 1 to 200 [{guid, faces}]"),
                           ({**good, "elements": [good["elements"][0]] * 2}, "elements[1].guid must be a text of 1 to 128 characters, each once"),
                           ({**good, "elements": [{"guid": "w", "faces": [[[0, 0, 0], [1000, 0, 0], [500, 0, 2800]]]}]},
                            "elements[0].faces must be 1 to 12 rectangles [p0, p1, p3] of [x, y, z] mm — both sides at least 1 mm, square at p0"),
                           ({**good, "elements": [{"guid": "w", "faces": [[[0, 0, 0], [1000, 0, 0], [0, 0, float("nan")]]]}]},
                            "elements[0].faces must be 1 to 12 rectangles [p0, p1, p3] of [x, y, z] mm — both sides at least 1 mm, square at p0")):
            with self.assertRaises(ValueError) as e:
                service.read_measure(bad)
            self.assertEqual(str(e.exception), words)
```
  and in `class Service`, after the job test (:338):
```python
    def test_a_measure_over_http_is_this_processs_one_run_polled_as_a_job(self):
        path = os.path.join(self.data.name, "two-storey.las")
        write_las(path, building())
        with open(path, "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        _, port, _ = self.start()
        body = {"job_id": "measure-1", "items": [{"id": "ev-0001", "kind": "scan", "path": path, "sha256": sha}],
                "params": {"voxel_mm": 20, "storey_min_mm": 2000, "tolerances_mm": [50, 100, 200]}, "seed": 1,
                "elements": [{"guid": "wall-1", "faces": wall_faces((125, 150), (7850, 150), 300, 0, 2800)}]}
        self.assertEqual(self.call(port, "POST", "/measure", {**body, "elements": []})[0], 400)
        self.assertEqual(self.call(port, "POST", "/measure", body)[0], 202)
        self.assertEqual(self.call(port, "POST", "/jobs", body)[0], 409)  # one run per process, a job or a measure
        for _ in range(200):
            status = self.call(port, "GET", "/jobs/measure-1")[1]
            if status["status"] in ("done", "failed", "refused"):
                break
            time.sleep(0.1)
        self.assertEqual(status["status"], "done", status)
        self.assertLess(self.call(port, "GET", "/jobs/measure-1/result")[1]["elements"][0]["p95_mm"], 5.0)
        self.assertEqual(os.listdir(self.cwd.name), [])
```
  Run → fails (`read_measure` absent; `/measure` 404).
- [ ] **Step 2: the code** — `service.py`: `import math` (after `import json`; `NoNetwork` allows it); after `MAX_POINTS_IN` (:27):
```python
MAX_ELEMENTS = 200  # MA-4e: a changeset holds at most 200 elements (changesets-logic MAX_CHANGESET_ELEMENTS)
MAX_FACES = 12      # per element: a wall sends two
```
  after `read_job` (:128):
```python
def rectangle(f):
    """MA-4e: a face [p0, p1, p3] — three points of three finite numbers (mm), both sides at least 1 mm, square at p0."""
    if not (isinstance(f, list) and len(f) == 3 and all(isinstance(p, list) and len(p) == 3 and all(
            isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in p) for p in f)):
        return False
    a, b = [f[1][k] - f[0][k] for k in range(3)], [f[2][k] - f[0][k] for k in range(3)]
    la, lb = math.hypot(*a), math.hypot(*b)
    return la >= 1 and lb >= 1 and abs(sum(x * y for x, y in zip(a, b))) <= 1e-3 * la * lb


def read_measure(b):
    """MA-4e: POST /measure's body — a job's (read_job: the job's own items, params and seed, so the cloud is the one its candidates came
    from) plus params.tolerances_mm and the elements, each its faces in the scan's frame; or ValueError in words."""
    m = read_job(b)
    t = m["params"].get("tolerances_mm")
    if not (isinstance(t, list) and 1 <= len(t) <= 5 and all(isinstance(x, int) and not isinstance(x, bool) and 1 <= x <= 1000 for x in t)
            and t == sorted(set(t))):
        raise ValueError("params.tolerances_mm must be 1 to 5 whole numbers of mm from 1 to 1000, rising")
    els = b.get("elements")
    if not isinstance(els, list) or not 1 <= len(els) <= MAX_ELEMENTS:
        raise ValueError(f"elements must be 1 to {MAX_ELEMENTS} [{{guid, faces}}]")
    seen = set()
    for n, e in enumerate(els):
        if not isinstance(e, dict) or not isinstance(e.get("guid"), str) or not 0 < len(e["guid"]) <= 128 or e["guid"] in seen:
            raise ValueError(f"elements[{n}].guid must be a text of 1 to 128 characters, each once")
        seen.add(e["guid"])
        fs = e.get("faces")
        if not isinstance(fs, list) or not 1 <= len(fs) <= MAX_FACES or not all(rectangle(f) for f in fs):
            raise ValueError(f"elements[{n}].faces must be 1 to {MAX_FACES} rectangles [p0, p1, p3] of [x, y, z] mm — both sides at least 1 mm, square at p0")
    return {**m, "elements": els}
```
  `run()` (:74-109): after `started, cpu0 = …` add `measuring = "elements" in job  # MA-4e: a measure re-reads a job's cloud — every item it read must be read again, or nothing is measured`; `if not ok:` → `if not ok or (measuring and JOB["refused"]):`; the survey call (:88) becomes:
```python
        def progress(stage, pct):
            JOB.update(stage=stage, pct=pct)
        if measuring:
            P, _, points_in = pipeline.load(ok, job["params"], job["seed"], progress)
            tol = job["params"]["tolerances_mm"]
            out = {"elements": pipeline.deviation(P, job["elements"], tol, progress), "derived": []}
            stats = {"points_in": int(points_in), "points_used": int(len(P)),
                     "measure": {"band_mm": 2 * max(tol), "edge_mm": pipeline.EDGE, "cell_mm": pipeline.DEV_CELL}}
        else:
            candidates, stats = pipeline.survey(ok, job["params"], job["seed"], progress)
            out = {"candidates": candidates, "derived": []}
```
  and `JOB["result"] = {"candidates": candidates, "derived": [], "receipt": {…}}` (:95) → `JOB["result"] = {**out, "receipt": {…unchanged…}}`. `do_POST` (:178): `if self.path not in ("/jobs", "/measure"):  # MA-4e: a measure is this process's one run too, polled at /jobs/:id`; (:184) `job = (read_measure if self.path == "/measure" else read_job)(json.loads(self.rfile.read(n) or b"null"))`. The module header gains one line: `# MA-4e: POST /measure — a job's own cloud read again and measured against a placed changeset's faces (numbers only; the bridge judges).`
  Run the suite → pass (`NoNetwork` included).
- [ ] **Step 3: commit** — `feat(survey): MA-4e - POST /measure: the job's items, params and seed read again, each element's faces measured, polled as a job; one run per process`

### Task 3 — Bridge: `runSurvey` posts a measure

**Files:** modify `WebApp/bridge/survey-service.mjs`, `fixtures/survey-standin.mjs`; test `survey-service.test.mjs`.

- [ ] **Step 1: the test first** — in the stand-in describe (after the first `it`):
```js
  it("MA-4e: a measure is posted to /measure and polled and read as a job — the same start, token, bounds and stop", async () => {
    const calls = [];
    const r = await runSurvey({ ...JOB, job_id: "measure-c1", elements: [{ guid: "g1", faces: [] }] },
      { spawn: standin("ok", calls), python: "C:/py/python.exe", env: process.env, pollMs: 20, log: () => {}, path: "/measure" });
    expect(r).toMatchObject({ status: "done", result: { elements: [{ guid: "g1", p95_mm: 2.9 }], receipt: { posted: "/measure" } } });
    await gone(calls[0].child);
  });
```
  Run → fails.
- [ ] **Step 2: the code** — `survey-service.mjs` :42-46: the doc line → `/** One job — or (MA-4e) one measure, \`path: "/measure"\`, polled and read as a job — start to end: …`; the options gain `path = "/jobs",` after `cwd,`; :81 → `await call("POST", path, job);`. The stand-in: the POST branch (:22) → `if (req.method === "POST" && (req.url === "/jobs" || req.url === "/measure")) { // MA-4e: a measure is posted to /measure`, its `end` handler → `job = { ...JSON.parse(b), posted: req.url };`; in the result branch (:38), first:
```js
      if (job.elements) return send(200, { elements: job.elements.map((e) => ({ guid: e.guid, points: 12, p95_mm: 2.9, mean_signed_mm: 0.1, share_within: { 50: 1, 100: 1, 200: 1 }, coverage: 1 })),
        derived: [], receipt: { seed: job.seed, posted: job.posted, measure: { band_mm: 400, edge_mm: 200, cell_mm: 200 } } });
```
  Run `npx vitest run bridge/survey-service.test.mjs` → pass.
- [ ] **Step 3: commit** — `feat(bridge): MA-4e - runSurvey posts a measure to /measure (one option); the stand-in answers it`

### Task 4 — Bridge: the job's params and seed, `stillAdmitted`, `measureJob`

**Files:** modify `WebApp/bridge/build-jobs.mjs`; test `build-jobs.test.mjs`.

- [ ] **Step 1: the tests first** — import `measureJob, stillAdmitted`; (a) at :206 → `expect(t.row).toEqual({ …the same…, result_sha256: SHA, params: null, seed: null });` and after it:
```js
  it("(a2) MA-4e: the row's params and seed, never job.json's — the cloud the job measured is read again from the anchored row", async () => {
    lay({ params: { voxel_mm: 50 }, seed: 9 });
    expect((await trust(ROW({}, { params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1 }))).row).toMatchObject({ params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1 });
  });
```
  and at the end of the file:
```js
describe("stillAdmitted and measureJob (MA-4e)", () => {
  const ROW = { items: [{ id: "ev-0001", sha256: "1".repeat(64) }], read: ["ev-0001"] };
  it("stillAdmitted: the read items, still the bytes the job read, or MA-4d's words", () => {
    expect(stillAdmitted(ROW, { items: [{ id: "ev-0001", sha256: "1".repeat(64), state: "admitted" }] }, "job-0001")).toEqual([{ id: "ev-0001", sha256: "1".repeat(64) }]);
    expect(() => stillAdmitted(ROW, { items: [] }, "job-0001")).toThrow("ev-0001 is not the bytes job-0001 read (it is no longer in the pack) — survey the admitted scan again; nothing was saved");
  });
  const P = { job_id: "measure-c1", items: [], params: {}, seed: 1, elements: [] };
  it("one measure on the bridge's one survey slot: /measure in the job's folder; a job meanwhile is a 409; the slot free after", async () => {
    const r = measureJob("demo", "job-0001", P, deps());
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect([runs[0].job, runs[0].opts]).toEqual([P, { cwd: join(root, "demo", "job-0001"), path: "/measure" }]);
    await expect(start()).rejects.toMatchObject({ status: 409, message: "a measure is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    runs[0].ok({ status: "done", result: { elements: [] } }); runs.pop();
    expect(await r).toMatchObject({ status: "done" });
    await expect(start()).resolves.toMatchObject({ job: { id: "job-0001" } });
  });
  it("a job running is a 409 for a measure; sentinel-survey not set up is a 503 — neither starts anything", async () => {
    await start();
    await expect(measureJob("demo", "job-0001", P, deps())).rejects.toMatchObject({ status: 409, message: "a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    await finish({ status: "failed", stage: "stopped", pct: 0, error: "the test" });
    await expect(measureJob("demo", "job-0001", P, deps({ notSetUp: () => "sentinel-survey is not set up on this PC: … — nothing was saved" })))
      .rejects.toMatchObject({ status: 503, message: "sentinel-survey is not set up on this PC: … — nothing was saved" });
    expect(runs).toHaveLength(0);
  });
});
```
  Run → fails.
- [ ] **Step 2: the code** — `build-jobs.mjs`: :33 → `let running = null; // {key, id, done, what?} — MA-4e: a measure holds it too (id null, what "a measure")`; :154 → `if (running) throw err(409, \`${running.what ?? "a survey job"} is already running on this bridge (one at a time) — try again when it ends; nothing was saved\`);`; after `resultRefusal` (:124):
```js
/** MA-4d decision 4, shared with MA-4e's measure: every item the job read is still the bytes it read — in the pack the ROW names (never
 *  job.json's), not flagged changed, with the sha on its row. → [{id, sha256}], or a 409 in words. Pure. */
export function stillAdmitted(row, pack, id) {
  return row.read.map((rid) => {
    const sent = row.items.find((i) => i.id === rid), now = pack.items.find((i) => i.id === rid);
    const why = !sent ? "its row lists it as read but not as sent" : !now ? "it is no longer in the pack" : now.state === "changed" ? "Re-check flagged it changed"
      : now.sha256 !== sent.sha256 ? "its sha256 in the pack is not the one the job read" : null;
    if (why) throw err(409, `${rid} is not the bytes ${id} read (${why}) — survey the admitted scan again; nothing was saved`);
    return { id: rid, sha256: sent.sha256 };
  });
}
```
  `trustedJob`'s return (:292-293) gains `params: v.params ?? null, seed: Number.isInteger(v.seed) ? v.seed : null` (its doc names them: "MA-4e: and the row's params and seed — a measure reads the job's cloud again from the anchored row"); at the end of the file:
```js
/** MA-4e: one measure (sentinel-survey's POST /measure, polled and read as a job) on the bridge's one survey slot — the `running` lock, so a
 *  measure and a survey job never share the PC's CPU; the service started for it and stopped after (runSurvey). `jobId`: the job whose folder
 *  is its cwd (the service writes nothing there). → runSurvey's record (it never rejects once started); before the start a 503 (not set up) or
 *  a 409 (a job or a measure running), each ending "nothing was saved". The caller (changesets-store verifyChangeset) checks the person, the
 *  changeset and the bytes, and writes the row.
 *  ponytail: a cold process per measure (start-up 1-2 s beside two hashes and a read of the scan; MA-4c decision 3 kept); a warm service with
 *  a cloud cache keyed on (the items' shas, voxel, seed), an idle timeout and a memory bound when verify runs per Apply in bulk (MA-4h). */
export async function measureJob(key, jobId, payload, deps = {}) {
  const d = await wire(deps);
  const notSet = d.notSetUp();
  if (notSet) throw err(503, notSet);
  if (running) throw err(409, `${running.what ?? "a survey job"} is already running on this bridge (one at a time) — try again when it ends; nothing was saved`);
  let release;
  running = { key, id: null, what: "a measure", done: new Promise((r) => { release = r; }) }; // checked and taken with no await between
  try { return await d.runSurvey(payload, { cwd: join(projectDir(d.root, key), jobId), path: "/measure" }); }
  finally { running = null; release(); }
}
```
  (`readRecord`'s "mine" never matches `id: null`: a job.json left running by an earlier process still reads as failed.) Run `npx vitest run bridge/build-jobs.test.mjs` → pass.
- [ ] **Step 3: commit** — `feat(bridge): MA-4e - trustedJob answers the row's params and seed; stillAdmitted shared; measureJob on the one survey slot`

### Task 5 — Bridge: the pure half (`survey-plan.mjs`)

**Files:** modify `WebApp/bridge/survey-plan.mjs`; tests `survey-plan.test.mjs`, `survey-service.test.mjs` (the real block).

- [ ] **Step 1: the tests first** — `survey-plan.test.mjs` (import `toModel, toScan, facesOf, measurePlan, judge, measureRefusal, countWords`):
```js
describe("MA-4e — a placed wall as filed, back in the scan's frame; the bridge's verdict", () => {
  const ZERO = { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 0 }, F = { dx_mm: 40000, dy_mm: -2500, dz_mm: 150, rotation_deg: 30 };
  const W1 = { kind: "wall", facts: { thickness_mm: 300 }, place: { LocationCurve: { start: [40125, 150, 0], end: [47850, 150, 0] }, TopElevation: 2800 } };
  it("toScan undoes toModel (0.1 mm each way)", () => {
    const M = toModel(F), S = toScan(F);
    for (const p of [[0, 0], [8000, 6000], [-1234.5, 777]]) S.xy(M.xy(p)).forEach((v, k) => expect(Math.abs(v - p[k])).toBeLessThanOrEqual(0.2));
    expect(S.z(M.z(2800))).toBe(2800);
  });
  it("facesOf: GR-FFL's wall-1 as filed — two faces 150 mm each side of its line, base to top, out of the wall; why not, in words", () => {
    expect(facesOf(W1, toScan(ZERO))).toEqual({ faces: [[[125, 300, 0], [125, 300, 2800], [7850, 300, 0]], [[125, 0, 0], [7850, 0, 0], [125, 0, 2800]]] });
    expect(facesOf({ ...W1, facts: {} }, toScan(ZERO))).toEqual({ why: "its line, measured thickness or top is not on the changeset" });
    expect(facesOf({ ...W1, place: { ...W1.place, TopElevation: 0 } }, toScan(ZERO))).toEqual({ why: "its line is shorter than 1 mm, or its top not above its base" });
  });
  it("measurePlan: the walls Revit placed are sent; an Undo in Revit, a level and a floor are not, each with why; placed lists every applied ghost", () => {
    const wall = (g, end) => ({ proposal_guid: g, kind: "wall", cid: `c-${g}`, facts: { thickness_mm: 200 }, place: { LocationCurve: { start: [0, 0, 0], end }, TopElevation: 2800 } });
    const cs = { job: { frame: { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 } },
      elements: [wall("w", [5000, 0, 0]), wall("u", [0, 5000, 0]), { proposal_guid: "l", kind: "level", cid: "c-l" }, { proposal_guid: "f", kind: "floor", cid: "c-f" }, wall("r", [0, -5000, 0])],
      result: { applied: ["w", "u", "l", "f"].map((g) => ({ proposal_guid: g, revit_unique_id: `U-${g}` })), rejected: ["r"] } };
    const p = measurePlan(cs, (g) => (g === "u" ? 2211 : null));
    expect(p.send.map((s) => s.guid)).toEqual(["w"]);
    expect(p.skip).toEqual([
      { proposal_guid: "u", reason: "undone in Revit (ledger #2211) — nothing placed to measure" },
      { proposal_guid: "l", reason: "a level has no face to measure — its height against the scan is MA-4h's level error" },
      { proposal_guid: "f", reason: "one face of a floor is seen; its other is its type's, which no scan measured, and the slab beyond would count against it — MA-4h" }]);
    expect(p.placed.map((x) => [x.proposal_guid, x.revit_unique_id, x.cid, x.kind])).toEqual([["w", "U-w", "c-w", "wall"], ["u", "U-u", "c-u", "wall"], ["l", "U-l", "c-l", "level"], ["f", "U-f", "c-f", "floor"]]);
  });
  it("judge: p95 against D7's 20 mm; missing, insufficient data and not measured in words — never a pass without points", () => {
    const K = { band_mm: 400, edge_mm: 200, cell_mm: 200 }, M = { points: 3512, p95_mm: 20, coverage: 0.999 };
    expect(judge(M, K)).toEqual({ status: "within_tolerance" });
    expect(judge({ ...M, p95_mm: 20.1 }, K)).toEqual({ status: "out_of_tolerance" });
    expect(judge({ ...M, coverage: 0.2 }, K)).toEqual({ status: "insufficient_data", reason: "20% of its faces seen — under the 25% a verdict needs" });
    expect(judge({ points: 1759, p95_mm: 253.2, coverage: 0.5 }, K)).toEqual({ status: "out_of_tolerance" }); // one face seen, 250 mm off (Base)
    expect(judge({ points: 0, p95_mm: null, coverage: 0 }, K)).toEqual({ status: "missing", reason: "no scan point within 400 mm of its faces — not built where it stands, or not scanned there" });
    expect(judge({ points: 0, p95_mm: null, coverage: null }, K)).toEqual({ status: "not_measured", reason: "no face interior to measure — each face is read 200 mm in from every edge" });
    expect(countWords({ within_tolerance: 3 })).toBe("3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured");
  });
  it("measureRefusal: one result per element sent, in order, the five numbers only and in range, its knobs on the receipt", () => {
    const send = [{ guid: "a" }], T = [50, 100, 200];
    const ok = { elements: [{ guid: "a", points: 3, p95_mm: 1, mean_signed_mm: 0, coverage: 1, share_within: { 50: 1, 100: 1, 200: 1 } }], receipt: { measure: { band_mm: 400, edge_mm: 200, cell_mm: 200 } } };
    const el = (o) => ({ ...ok, elements: [{ ...ok.elements[0], ...o }] });
    expect(measureRefusal(ok, send, T)).toBeNull();
    expect(measureRefusal(null, send, T)).toBe("receipt.measure");
    expect(measureRefusal({ ...ok, elements: [] }, send, T)).toBe("not one result per element sent");
    expect([measureRefusal(el({ guid: "b" }), send, T), measureRefusal(el({ points: -1 }), send, T), measureRefusal(el({ p95_mm: "3" }), send, T), measureRefusal(el({ share_within: { 50: 1 } }), send, T)])
      .toEqual(["elements[0].guid", "elements[0].points", "elements[0]'s numbers", "elements[0].share_within"]);
    // Rule 3: a service that sends its own verdict is refused, never merged — p95 63 is never within tolerance.
    expect([measureRefusal(el({ status: "within_tolerance", p95_mm: 63 }), send, T), measureRefusal(el({ coverage: 5 }), send, T),
      measureRefusal(el({ p95_mm: -1 }), send, T), measureRefusal(el({ share_within: { 50: -1, 100: 1, 200: 1 } }), send, T)])
      .toEqual(["elements[0] carries status (the verdict is the bridge's)", "elements[0]'s numbers", "elements[0]'s numbers", "elements[0].share_within"]);
  });
});
```
  `survey-service.test.mjs`, in the real block (after :118; import `readFileSync`, and `measurePlan, judge` from `./survey-plan.mjs`):
```js
  it("MA-4e: GR-FFL's walls as filed against the drill's own bytes — each within a few mm; wall-1 moved 60 mm reads 60, shares 0 / 1 / 1", async () => {
    const stored = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/contract2-survey.json", import.meta.url), "utf8")).stored;
    const cs = { ...stored, status: "applied", elements: stored.elements.map((e, i) => ({ ...e, proposal_guid: `g${i + 1}`, facts: { thickness_mm: [300, 200, 300][i] } })),
      result: { applied: [1, 2, 3].map((n) => ({ proposal_guid: `g${n}`, revit_unique_id: `u${n}` })) } };
    const moved = { ...cs, elements: cs.elements.map((e, i) => (i ? e : { ...e, place: { ...e.place, LocationCurve: { start: [40125, 210, 0], end: [47850, 210, 0] } } })) };
    const measure = async (c) => {
      const r = await runSurvey({ ...job(SHA), job_id: "measure-1", elements: measurePlan(c).send }, { python: PY, cwd: dir, path: "/measure" });
      expect(r.status).toBe("done");
      return r.result;
    };
    const a = await measure(cs);
    expect(a.elements.map((m) => judge(m, a.receipt.measure).status)).toEqual(["within_tolerance", "within_tolerance", "within_tolerance"]);
    expect(a.elements.map((m) => [m.p95_mm, m.mean_signed_mm, m.share_within, m.points])).toEqual([
      [3, 0, { 50: 1, 100: 1, 200: 1 }, 3512], [3, 0, { 50: 1, 100: 1, 200: 1 }, 3523], [3, 0, { 50: 1, 100: 1, 200: 1 }, 2569]]);
    const b = await measure(moved);
    expect([b.elements[0].p95_mm, b.elements[0].share_within, judge(b.elements[0], b.receipt.measure).status]).toEqual([63, { 50: 0, 100: 1, 200: 1 }, "out_of_tolerance"]);
  }, 60_000);
```
  (`twoStoreyLas()` with its defaults is the drill's own `two-storey.las`: sha `244cba9d…`; the numbers are the in-memory run's — Base.) Run → fails.
- [ ] **Step 2: the code** — `survey-plan.mjs`, after `toModel` (:63):
```js
/** MA-4e: the lead's frame backwards — model (Revit internal) mm → the scan's mm: moved back, then turned back (toModel's inverse). Only the
 *  four frame keys are read (the stored frame also carries stated_by).
 *  ponytail: one statement both ways — a measure as filed cannot see a wrong frame; MA-4g computes it. */
export function toScan(f) {
  const a = (f.rotation_deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { xy: ([x, y]) => { const X = x - f.dx_mm, Y = y - f.dy_mm; return [r1(c * X + s * Y), r1(c * Y - s * X)]; }, z: (z) => r1(z - f.dz_mm) };
}
```
  and at the end of the file:
```js
// ── MA-4e: deviation after placement (design §6.6 verify:measured, §6.9 POST /measure). The service measures; the bridge picks what is measured
//    and judges it (rule 3). ──

/** Rule 6's statuses a measure gives, in the order the words count them. */
export const STATUSES = ["within_tolerance", "out_of_tolerance", "missing", "insufficient_data", "not_measured"];
/** "3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured". Pure. */
export const countWords = (n) => STATUSES.map((s) => `${n[s] ?? 0} ${s.replace(/_/g, " ")}`).join(", ");
/** A measured wall below this share of its faces' interior seen is insufficient_data, never judged.
 *  ponytail: one share for every class (D7 sets none) — a wall seen from one side reads about 0.5 and is judged on that face; the founder
 *  sets it, MA-4h tunes it on Kladno. */
export const MIN_COVERAGE = 0.25;

/** The faces sentinel-survey measures a placed wall by, as filed: its line, its measured thickness (exact typing, D16: the placed type's width),
 *  its base (the line's z) and its top — the box the executor places (Wall.Create's default location line, Wall Centerline, and the type's
 *  Width equal to facts.thickness_mm: drill MA4e R-1 reads both before this merges — a gate), back in the scan's frame. Each face [p0, p1, p3] (p1 and p3 the corners next to p0), (p1 − p0) × (p3 − p0) out of the wall: +
 *  is the scan outside it. → {faces} or {why}. Pure.
 *  ponytail: the line's box — Revit's joins and a free end are not drawn; the service reads 200 mm in from every edge, so neither is judged. */
export function facesOf(el, S) {
  const p = el.place ?? {}, c = p.LocationCurve, t = el.facts?.thickness_mm;
  if (!Array.isArray(c?.start) || !Array.isArray(c?.end) || !Number.isFinite(c.start[2]) || !(t > 0) || !Number.isFinite(p.TopElevation))
    return { why: "its line, measured thickness or top is not on the changeset" };
  const [ax, ay] = S.xy(c.start), [bx, by] = S.xy(c.end), zb = S.z(c.start[2]), zt = S.z(p.TopElevation);
  const L = Math.hypot(bx - ax, by - ay);
  if (!(L >= 1) || !(zt > zb)) return { why: "its line is shorter than 1 mm, or its top not above its base" };
  const nx = (-(by - ay) / L) * (t / 2), ny = ((bx - ax) / L) * (t / 2);
  const at = (x, y, z) => [r1(x), r1(y), z];
  return { faces: [
    [at(ax + nx, ay + ny, zb), at(ax + nx, ay + ny, zt), at(bx + nx, by + ny, zb)],    // the face on the line's left, out to the left
    [at(ax - nx, ay - ny, zb), at(bx - nx, by - ny, zb), at(ax - nx, ay - ny, zt)]] }; // the face on its right, out to the right
}

/** What a measure sends for a placed survey changeset: per element Revit placed (result.applied, in its order) its faces in the scan's frame,
 *  or why not — an Undo in Revit (`undone(guid)`: the ledger id when the guid's newest changeset_reverted row is an undo, else null), a level,
 *  a floor or ceiling, a wall whose geometry is not on the changeset. Pure. → {send: [{guid, faces}], skip: [{proposal_guid, reason}],
 *  placed: [{proposal_guid, revit_unique_id, cid, kind}]}
 *  ponytail: walls only — a floor's or ceiling's other face is its type's, which no scan measured, and the slab beyond counts against its one
 *  face (measured: ~200 mm on the drill); a depth from its type is MA-4h's. */
export function measurePlan(cs, undone = () => null) {
  const S = toScan(cs.job.frame), send = [], skip = [], placed = [];
  for (const a of cs.result?.applied ?? []) {
    const el = (cs.elements ?? []).find((e) => e.proposal_guid === a.proposal_guid), u = undone(a.proposal_guid);
    placed.push({ proposal_guid: a.proposal_guid, revit_unique_id: a.revit_unique_id ?? null, cid: el?.cid ?? null, kind: el?.kind ?? null });
    const f = u != null ? { why: `undone in Revit (ledger #${u}) — nothing placed to measure` }
      : el?.kind === "wall" ? facesOf(el, S)
      : el?.kind === "level" ? { why: "a level has no face to measure — its height against the scan is MA-4h's level error" }
      : el?.kind === "floor" || el?.kind === "ceiling" ? { why: `one face of a ${el.kind} is seen; its other is its type's, which no scan measured, and the slab beyond would count against it — MA-4h` }
      : { why: el ? `a ${el.kind} is not measured by sentinel-survey 0.1` : "not on the changeset" };
    if (f.faces) send.push({ guid: a.proposal_guid, faces: f.faces }); else skip.push({ proposal_guid: a.proposal_guid, reason: f.why });
  }
  return { send, skip, placed };
}

/** The bridge's verdict on one element sentinel-survey measured (rule 3: the service measures, the bridge judges) — p95 against D7's
 *  TOLERANCE_MM. `k`: the service's receipt.measure {band_mm, edge_mm}. → {status, reason?}. Pure. */
export function judge(m, k) {
  if (m.coverage == null) return { status: "not_measured", reason: `no face interior to measure — each face is read ${k.edge_mm} mm in from every edge` };
  if (!m.points) return { status: "missing", reason: `no scan point within ${k.band_mm} mm of its faces — not built where it stands, or not scanned there` };
  if (m.coverage < MIN_COVERAGE) return { status: "insufficient_data", reason: `${Math.round(m.coverage * 1000) / 10}% of its faces seen — under the ${MIN_COVERAGE * 100}% a verdict needs` };
  return { status: m.p95_mm <= TOLERANCE_MM ? "within_tolerance" : "out_of_tolerance" };
}

/** The keys a measured element may carry (spec amendment S3: numbers only) — anything else, a status above all, is the bridge's. */
const MEASURE_KEYS = new Set(["guid", "points", "p95_mm", "mean_signed_mm", "share_within", "coverage"]);
const share = (v) => Number.isFinite(v) && v >= 0 && v <= 1;

/** null when a measure's result has the contract's shape — one entry per element sent, in order, the five numbers only (or null), each in
 *  range, its knobs on the receipt — else what is wrong (the bridge keeps nothing it could not judge; a verdict sent by the service is refused,
 *  never merged: rule 3). Pure. */
export function measureRefusal(res, send, tols) {
  const k = res?.receipt?.measure;
  if (!Number.isFinite(k?.band_mm) || !Number.isFinite(k?.edge_mm)) return "receipt.measure";
  if (!Array.isArray(res.elements) || res.elements.length !== send.length) return "not one result per element sent";
  for (const [i, m] of res.elements.entries()) {
    const at = `elements[${i}]`;
    const extra = Object.keys(m ?? {}).find((x) => !MEASURE_KEYS.has(x));
    if (extra) return `${at} carries ${extra.slice(0, 64)} (the verdict is the bridge's)`;
    if (m?.guid !== send[i].guid) return `${at}.guid`;
    if (!Number.isInteger(m.points) || m.points < 0) return `${at}.points`;
    if (![m.p95_mm, m.mean_signed_mm, m.coverage].every((v) => v === null || Number.isFinite(v)) || m.p95_mm < 0 || (m.coverage !== null && !share(m.coverage)))
      return `${at}'s numbers`;
    if (m.points > 0 && (!Number.isFinite(m.p95_mm) || !tols.every((t) => share(m.share_within?.[t])))) return `${at}.share_within`;
  }
  return null;
}
```
  Also update the ponytail on `TOLERANCE_MM` (:17-18) → `ponytail: one constant for both, and MA-4e's p95 verdict (judge); a per-class tolerance (lod_matrix or the contract's) is MA-8's.` Run `npx vitest run bridge/survey-plan.test.mjs bridge/survey-service.test.mjs` → pass (the real block runs on this PC: `C:\Python314`).
- [ ] **Step 3: commit** — `feat(bridge): MA-4e - a placed wall's faces as filed, back in the scan's frame; what is measured and why not; the bridge's verdict on p95 against D7's 20 mm`

### Task 6 — Bridge: `verifyChangeset`

**Files:** modify `WebApp/bridge/changesets-store.mjs`; test `changesets-store.test.mjs`.

- [ ] **Step 1: the tests first** — imports gain `verifyChangeset`, `import { resolve } from "node:path"; import { tmpdir } from "node:os"; import { createHash } from "node:crypto";`; at the end of the file:
```js
describe("verifyChangeset (MA-4e): a signed-in contributor measures a placed survey changeset, as filed, against its job's own scan", () => {
  const STORED = readRepo("WebApp/bridge/fixtures/changeset-ops/contract2-survey.json").stored;
  const EV = "e1".repeat(32), ID = "5b1c6f3e-2a4d-4e8f-9c1a-7d2e3f4a5b6c", DIR = resolve(tmpdir(), "sentinel-ev-ma4e");
  // GR-FFL as the drill holds it: applied (#2210, reported by a signed-in lead), its level named and not checked, three walls placed.
  const CS = { ...STORED, id: ID, status: "applied", job: { ...STORED.job, storey: { ...STORED.job.storey, how: "named", checked: false, from: null, delta_mm: null } },
    elements: STORED.elements.map((e, i) => ({ ...e, proposal_guid: `g${i + 1}`, facts: { thickness_mm: [300, 200, 300][i] } })),
    result: { applied: [1, 2, 3].map((n) => ({ proposal_guid: `g${n}`, revit_element_id: 900 + n, revit_unique_id: `u${n}` })), rejected: [],
      reported_by: "lead@example.test", reported_role: "lead" } };
  const ROW = { ledger: { id: 2201, hash: "13".repeat(32) }, reader: "sentinel-survey", version: "0.1.0", pack_id: "evp-0001",
    items: [{ id: "ev-0001", sha256: EV }, { id: "ev-0002", sha256: "e2".repeat(32) }], read: ["ev-0001"], result_sha256: CS.job.result_sha256,
    params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1 };
  const SCAN = { id: "ev-0001", kind: "scan", format: "las", path: "scans/two-storey.las", sha256: EV, state: "admitted", surveyable: true, allowed_uses: { geometry_extraction: true } };
  const NUMS = (o = {}) => ({ points: 3512, p95_mm: 3, mean_signed_mm: 0, share_within: { 50: 1, 100: 1, 200: 1 }, coverage: 0.999, ...o });
  const KNOBS = { band_mm: 400, edge_mm: 200, cell_mm: 200 };
  const DONE = (each = () => ({})) => vi.fn(async (_k, _j, p) => ({ status: "done", version: "0.1.0", refused: [], tools: [{ name: "sentinel-survey", version: "0.1.0", licence: "LicenseRef-Sentinel" }],
    result: { elements: p.elements.map((e, i) => ({ guid: e.guid, ...NUMS(each(i)) })), derived: [],
      receipt: { started: "2026-10-09T10:00:00Z", finished: "2026-10-09T10:00:02Z", cpu_s: 0.6, points_in: 47699, points_used: 47672, measure: KNOBS } } }));
  // The drill's rows: an Undo (#2211), then a Redo (#2212) — the newest decides; #2210 the report.
  const ROWS = [{ id: 2212, action: "changeset_reverted", new_value: { op: "redo", guids: ["g1", "g2", "g3"] } }, { id: 2211, action: "changeset_reverted", new_value: { op: "undo", guids: ["g1", "g2", "g3"] } },
    { id: 2210, action: "changeset_applied" }, { id: 2205, action: "changeset_proposed" }];
  // listAudit by prefix: the changeset_ rows (whole), and the newest verify:measured row (none: never measured).
  const audits = (rows = ROWS, verify = []) => vi.fn(async (_k, q) => (q.action_prefix === "verify:measured" ? { rows: verify.slice(0, 1), total: verify.length } : { rows, total: rows.length }));
  const vdeps = (over = {}, cs = CS) => { const deps = baseDeps({ myRole: vi.fn(async () => "contributor"), requireMinRole: vi.fn(async () => "contributor"), takeWriteBudget: vi.fn(),
    trustedJob: vi.fn(async () => ({ row: ROW })), readPack: vi.fn(async () => ({ pack: { items: [SCAN] }, folder: { path: DIR } })),
    listAudit: audits(), measureJob: DONE(), audit: vi.fn(async () => ({ id: 2300, hash: "ab".repeat(32) })), ...over }); deps.saved.set(ID, cs); return deps; };
  const firstRow = async () => { const deps = vdeps(); await verify(deps); return { id: 2300, new_value: deps.audit.mock.calls[0][6] }; }; // (a)'s row, as the ledger holds it
  const verify = (deps, body = { changeset: ID }) => verifyChangeset("ma4c-drill", body, "web", deps);

  it("(a) the walls Revit placed, as filed, back in the scan's frame; the job's own items, params and seed; ONE verify:measured row; no doc write", async () => {
    const deps = vdeps();
    const r = await verify(deps);
    expect(deps.measureJob.mock.calls[0]).toEqual(["ma4c-drill", "job-0002", { job_id: `measure-${ID}`,
      items: [{ id: "ev-0001", kind: "scan", path: resolve(DIR, "scans/two-storey.las"), sha256: EV }],
      params: { voxel_mm: 20, storey_min_mm: 2000, tolerances_mm: [50, 100, 200] }, seed: 1, elements: [
        { guid: "g1", faces: [[[125, 300, 0], [125, 300, 2800], [7850, 300, 0]], [[125, 0, 0], [7850, 0, 0], [125, 0, 2800]]] },
        { guid: "g2", faces: [[[125, 6000, 0], [125, 6000, 2800], [7850, 6000, 0]], [[125, 5800, 0], [7850, 5800, 0], [125, 5800, 2800]]] },
        { guid: "g3", faces: [[[7700, 150, 0], [7700, 150, 2800], [7700, 5900, 0]], [[8000, 150, 0], [8000, 5900, 0], [8000, 150, 2800]]] }] }]);
    expect(deps.listAudit.mock.calls.map((c) => c[1])).toEqual([{ entity_type: "changeset", action_prefix: "changeset_", entity_id: ID, limit: 1000 },
      { entity_type: "changeset", action_prefix: "verify:measured", entity_id: ID, limit: 1 }]);
    expect(deps.audit).toHaveBeenCalledTimes(1);
    const [pid, et, eid, action, actor, old, v] = deps.audit.mock.calls[0];
    expect([pid, et, eid, action, actor, old]).toEqual(["p1", "changeset", ID,
      "verify:measured job-0002 · sentinel-survey 0.1.0 · done · 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured", "web", null]);
    expect(v).toMatchObject({ changeset: { id: ID, name: "Survey job-0002 · GR-FFL" }, applied_row: 2210, reverted_row: 2212,
      placed_by: { reported_by: "lead@example.test", reported_role: "lead" }, // Revit's report's provenance: the placed list is the add-in's, said so
      faces_sha256: createHash("sha256").update(JSON.stringify(deps.measureJob.mock.calls[0][2].elements)).digest("hex"),
      status: "done", job: { id: "job-0002", ledger_id: 2201, result_sha256: CS.job.result_sha256, version: "0.1.0" },
      evidence: [{ id: "ev-0001", sha256: EV }], reader: "sentinel-survey", version: "0.1.0", params: ROW.params, seed: 1, tolerances_mm: [50, 100, 200], target_mm: 20, min_coverage: 0.25,
      measure: KNOBS, reference: "as filed", frame: CS.job.frame, storey: { level: "GR-FFL", how: "named", checked: false, delta_mm: null }, sign: "+ = the scan outside the element's face",
      points_in: 47699, points_used: 47672, counts: { within_tolerance: 3, out_of_tolerance: 0, missing: 0, insufficient_data: 0, not_measured: 0 }, model_calls: 0, tokens: 0, claimed: false });
    expect(v.elements[0]).toEqual({ proposal_guid: "g1", revit_unique_id: "u1", cid: "scan-L00-wall-1", kind: "wall", status: "within_tolerance", basis: "deviation", ...NUMS() });
    expect(r).toEqual({ changeset: { id: ID, name: "Survey job-0002 · GR-FFL" }, status: "done", counts: v.counts, elements: v.elements, ledger: { id: 2300, hash: "ab".repeat(32) } });
    expect([deps.docInsert.mock.calls.length, deps.docReplaceIfField.mock.calls.length]).toEqual([0, 0]);
  });
  it("(b) the bridge's verdicts: out of tolerance, missing, and an element undone in Revit not measured — counted on the row", async () => {
    const deps = vdeps({ listAudit: audits([{ id: 2215, action: "changeset_reverted", new_value: { op: "undo", guids: ["g3"] } }, ...ROWS]),
      measureJob: DONE((i) => (i ? { points: 0, p95_mm: null, mean_signed_mm: null, share_within: null, coverage: 0 } : { p95_mm: 63, share_within: { 50: 0, 100: 1, 200: 1 } })) });
    const r = await verify(deps);
    expect(deps.measureJob.mock.calls[0][2].elements.map((e) => e.guid)).toEqual(["g1", "g2"]);
    expect(r.elements.map((e) => [e.status, e.reason ?? null])).toEqual([["out_of_tolerance", null],
      ["missing", "no scan point within 400 mm of its faces — not built where it stands, or not scanned there"], ["not_measured", "undone in Revit (ledger #2215) — nothing placed to measure"]]);
    expect(deps.audit.mock.calls[0][3]).toBe("verify:measured job-0002 · sentinel-survey 0.1.0 · done · 0 within tolerance, 1 out of tolerance, 1 missing, 0 insufficient data, 1 not measured");
  });
  it("(c) refused before the run, each in words ending 'nothing was saved' — nothing measured, no row", async () => {
    const quiet = async (over, message, status = 409, body = { changeset: ID }, cs = CS) => {
      const deps = vdeps(over, cs);
      await expect(verify(deps, body)).rejects.toMatchObject({ status, message });
      expect([deps.measureJob.mock.calls.length, deps.audit.mock.calls.length]).toEqual([0, 0]);
    };
    await quiet({ myRole: vi.fn(async () => "service") }, "measuring a changeset against its scan needs a person — it reads the whole scan, and its row names who asked: sign in. Nothing was saved.", 403);
    await quiet({ requireMinRole: vi.fn(async () => { throw Object.assign(new Error("this action requires the contributor role (you are viewer)"), { status: 403 }); }) },
      "this action requires the contributor role (you are viewer) — measuring a placed changeset against its scan is a contributor's; nothing was saved", 403);
    await quiet({}, "results is not a measure field — the bridge measures what Revit placed, as filed, against its job's own scan; send {changeset} — nothing was saved", 400, { changeset: ID, results: [] });
    await quiet({}, "changeset must be a changeset's id (a uuid) — nothing was saved", 400, { changeset: "x" });
    await quiet({}, "no changeset 00000000-0000-4000-8000-000000000000 on ma4c-drill — nothing was saved", 404, { changeset: "00000000-0000-4000-8000-000000000000" });
    await quiet({}, "Survey job-0002 · GR-FFL was not built from a survey job — there is no scan to measure it against — nothing was saved", 409, undefined, { ...CS, job: null, claimed: true });
    await quiet({}, "Survey job-0002 · GR-FFL is proposed — only what Revit placed is measured — nothing was saved", 409, undefined, { ...CS, status: "proposed" });
    await quiet({ trustedJob: vi.fn(async () => { throw Object.assign(new Error("job-0002's result is not trusted: … — run the survey again; nothing was saved"), { status: 409 }); }) },
      "job-0002's result is not trusted: … — run the survey again; nothing was saved");
    await quiet({ trustedJob: vi.fn(async () => ({ row: { ...ROW, ledger: { id: 2299, hash: "x" } } })) },
      "job-0002 on this PC is ledger #2299, not the job Survey job-0002 · GR-FFL was built from (ledger #2201) — its scan cannot be read again here — nothing was saved");
    await quiet({ trustedJob: vi.fn(async () => ({ row: { ...ROW, seed: null } })) },
      "ledger #2201 holds no params or seed — the cloud job-0002 measured cannot be read again; run the survey again — nothing was saved");
    await quiet({ readPack: vi.fn(async () => ({ pack: { items: [{ ...SCAN, state: "changed" }] }, folder: { path: DIR } })) },
      "ev-0001 is not the bytes job-0002 read (Re-check flagged it changed) — survey the admitted scan again; nothing was saved");
    await quiet({ readPack: vi.fn(async () => ({ pack: { items: [{ ...SCAN, allowed_uses: { geometry_extraction: false } }] }, folder: { path: DIR } })) },
      "ev-0001 cannot be read again (its allowed uses exclude geometry extraction) — survey the admitted scan again — nothing was saved");
    await quiet({ listAudit: vi.fn(async () => { throw new Error("timeout"); }) },
      "Survey job-0002 · GR-FFL's ledger rows could not be read (timeout) — an Undo in Revit or an earlier measure would be missed — nothing was saved", 503);
    await quiet({ listAudit: vi.fn(async () => ({ rows: ROWS, total: 1500 })) }, // a cut read could miss the newest Undo
      "Survey job-0002 · GR-FFL has more ledger rows (1500) than one read returns — an Undo in Revit could be missed — nothing was saved", 503);
    await quiet({ listAudit: audits([{ id: 2213, action: "changeset_reverted", new_value: { op: "undo", guids: ["g1", "g2", "g3"] } }, ...ROWS]) },
      "nothing of Survey job-0002 · GR-FFL can be measured: undone in Revit (ledger #2213) — nothing placed to measure — nothing was saved");
    // A replay: the newest done row was measured on these same inputs — the numbers would repeat, so no second row.
    const done = await firstRow();
    await quiet({ listAudit: audits(ROWS, [done]) },
      "Survey job-0002 · GR-FFL was measured on these same inputs as ledger #2300 — the same bytes, seed and geometry give the same numbers; nothing was saved");
    // Any changed input measures again: a Redo in Revit since (a new reverted_row), or a newest row that did not finish.
    for (const over of [{ listAudit: audits([{ id: 2216, action: "changeset_reverted", new_value: { op: "redo", guids: ["g1", "g2", "g3"] } }, ...ROWS], [done]) },
      { listAudit: audits(ROWS, [{ id: 2301, new_value: { ...done.new_value, status: "failed" } }]) }]) {
      const deps = vdeps(over);
      await verify(deps);
      expect(deps.audit).toHaveBeenCalledTimes(1);
    }
  });
  it("(d) busy: a job or a measure running is the slot's 409 — no row", async () => {
    const deps = vdeps({ measureJob: vi.fn(async () => { throw Object.assign(new Error("a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved"), { status: 409 }); }) });
    await expect(verify(deps)).rejects.toMatchObject({ status: 409, message: "a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    expect(deps.audit).not.toHaveBeenCalled();
  });
  it("(e) a run that starts always leaves its row: refused (409) and failed (502) name it; a result not the contract's shape, a verdict from the service and another version than the job's fail; a row the ledger refuses is a 502, nothing saved", async () => {
    const run = async (r, message, status) => {
      const deps = vdeps({ measureJob: vi.fn(async () => r) });
      await expect(verify(deps)).rejects.toMatchObject({ status, message });
      return deps.audit.mock.calls;
    };
    let rows = await run({ status: "refused", version: "0.1.0", refused: [{ id: "ev-0001", reason: "changed since admitted (its sha256 is not the pack's) — Re-check flags it" }] },
      "Survey job-0002 · GR-FFL was not measured: the scan was not read again — ev-0001: changed since admitted (its sha256 is not the pack's) — Re-check flags it — ledger #2300 records the run; nothing else was saved", 409);
    expect([rows.length, rows[0][3], rows[0][6].status, rows[0][6].elements]).toEqual([1, "verify:measured job-0002 · sentinel-survey 0.1.0 · refused", "refused", []]);
    rows = await run({ status: "failed", version: "0.1.0", error: "the survey took longer than 10 min — it was stopped; nothing it found was kept" },
      "the measure of Survey job-0002 · GR-FFL did not finish: the survey took longer than 10 min — it was stopped; nothing it found was kept — ledger #2300 records the run; nothing else was saved", 502);
    expect(rows[0][3]).toBe("verify:measured job-0002 · sentinel-survey 0.1.0 · failed");
    await run({ status: "done", version: "0.1.0", result: { elements: [{ guid: "g9" }], receipt: { measure: KNOBS } } },
      "the measure of Survey job-0002 · GR-FFL did not finish: sentinel-survey's measure is not the contract's shape (not one result per element sent) — nothing it measured was kept — ledger #2300 records the run; nothing else was saved", 502);
    // Rule 3: a verdict sent by the service is refused, never merged — p95 63 never reads within tolerance.
    const three = (o) => ["g1", "g2", "g3"].map((guid) => ({ guid, ...NUMS(), ...o }));
    rows = await run({ status: "done", version: "0.1.0", result: { elements: three({ p95_mm: 63, status: "within_tolerance" }), receipt: { measure: KNOBS } } },
      "the measure of Survey job-0002 · GR-FFL did not finish: sentinel-survey's measure is not the contract's shape (elements[0] carries status (the verdict is the bridge's)) — nothing it measured was kept — ledger #2300 records the run; nothing else was saved", 502);
    expect([rows[0][6].status, rows[0][6].elements]).toEqual(["failed", []]);
    // The job's own cloud only from the version that read it: another version may read, sample or voxel differently.
    rows = await run({ status: "done", version: "0.2.0", result: { elements: three(), receipt: { measure: KNOBS } } },
      "the measure of Survey job-0002 · GR-FFL did not finish: the job was read by sentinel-survey 0.1.0 and this measure ran 0.2.0 — its cloud is not known to be the job's; run the survey again — nothing it measured was kept — ledger #2300 records the run; nothing else was saved", 502);
    expect([rows[0][3], rows[0][6].job.version, rows[0][6].elements]).toEqual(["verify:measured job-0002 · sentinel-survey 0.2.0 · failed", "0.1.0", []]);
    await expect(verify(vdeps({ audit: vi.fn(async () => { throw new Error("ledger down"); }) }))).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL was measured, but the ledger did not take its row (ledger down) — nothing was saved; measure it again" });
  });
});
```
  Run `npx vitest run bridge/changesets-store.test.mjs` → fails.
- [ ] **Step 2: the code** — `changesets-store.mjs` :4 → `import { randomUUID, createHash } from "node:crypto";`; :12 → `import { readProposeBody, planSurvey, PLANNER, PLANNER_VERSION, measurePlan, judge, measureRefusal, countWords, STATUSES, MIN_COVERAGE, TOLERANCE_MM } from "./survey-plan.mjs";` and after it `import { stillAdmitted, pickItems, trustedJob as jobOf, measureJob as measureOf, TOLERANCES_MM, READER } from "./build-jobs.mjs";` (build-jobs imports nothing of this module: no cycle). In `proposeFromJob`'s `prepare()` the inline check (:269-276) becomes `const { pack } = await readPack(key, row.pack_id); const evidence = stillAdmitted(row, pack, id);` (its words unchanged; the MA-4d tests (b) at :985-987 stay green). After `proposeFromJob` (:361):
```js
/** MA-4e: POST /cde/:key/verify {changeset} → 200. A signed-in contributor measures a placed survey changeset against the scan its job read
 *  (design §6.6 verify:measured, §6.8 S1, §6.9 S2/S3): the bridge picks everything — the walls Revit placed (result.applied, less an Undo in
 *  Revit: each guid's newest changeset_reverted row), each AS FILED (the changeset's own geometry, which the executor places exactly), back
 *  in the scan's frame (the inverse of the lead's frame); the job's own row (trustedJob, MA-4c decision 11) and its params and seed; the scans
 *  it read, still the admitted bytes. sentinel-survey measures (measureJob: one run on the bridge's one survey slot), the bridge judges each
 *  element (rule 3) and writes ONE verify:measured row per run that starts (done, failed or refused — the build:run precedent). Nothing else
 *  is written: no doc, no table. Refusals before the run, each ending "nothing was saved", in this order: 403 (the machine credential; below
 *  contributor), 400 (the body), 429, 404 (the changeset), 409 (not a survey changeset; not placed), 400/404/409 (the job), 409 (not the job
 *  it was built from; no params or seed), 409 (a scan changed or unreadable), 503 (its ledger rows: not read, or more than one read returns),
 *  409 (nothing to measure), 409 (a replay: measured on these same inputs), 503/409 (the service not set up; busy). After the run: refused
 *  409, failed 502 (the run's words; another sentinel-survey version than the job's; a result not the contract's shape), each naming its row.
 *  ponytail: as filed, not re-read — a wall moved in Revit after Apply, a model closed unsaved and a wrong frame are not seen; Revit's re-read
 *  is MA-4f's (its results[] would be the add-in's claim). Synchronous, bounded by the survey's JOB_MS — a 202 and a record when Kladno's
 *  measure outlasts a request (MA-4h). */
export async function verifyChangeset(key, b, actor, deps = {}) {
  const d = wire(deps);
  const trustedJob = deps.trustedJob ?? jobOf, measureJob = deps.measureJob ?? measureOf;
  const readPack = deps.readPack ?? (await import("./evidence-store.mjs")).readPack;
  const listAudit = deps.listAudit ?? cde.listAudit;
  if ((await d.myRole(key)) === "service")
    throw err(403, "measuring a changeset against its scan needs a person — it reads the whole scan, and its row names who asked: sign in. Nothing was saved.");
  try { await d.requireMinRole(key, "contributor"); }
  catch (e) { throw e.status === 403 ? err(403, `${e.message} — measuring a placed changeset against its scan is a contributor's; nothing was saved`) : unsaved(e); }
  const bad = (m) => err(400, `${m} — nothing was saved`);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("the body is {changeset}");
  for (const k of Object.keys(b))
    if (k !== "changeset") throw bad(`${k.slice(0, 64)} is not a measure field — the bridge measures what Revit placed, as filed, against its job's own scan; send {changeset}`);
  if (!cde.isUuid(b.changeset)) throw bad("changeset must be a changeset's id (a uuid)");
  d.takeWriteBudget("survey jobs", { perUser: 6, all: 12 }); // a measure is a survey run: one budget for the PC's CPU (its 429 says "nothing was saved")
  let x;
  try { x = await prepare(b.changeset); } catch (e) { throw unsaved(e); } // nothing is written before the run
  const { proj, cs, row, evidence, items, applied, reverted, faces, plan } = x;
  let r;
  try { r = await measureJob(key, cs.job.id, { job_id: `measure-${cs.id}`, items, params: { ...row.params, tolerances_mm: TOLERANCES_MM }, seed: row.seed, elements: plan.send }); }
  catch (e) { throw unsaved(e); } // not set up (503), busy (409): before the run

  let status = r.status, error = r.error ?? null;
  // The job's own cloud only from the version that read it: another may read, sample or voxel differently (MA-4h tunes them).
  if (status === "done" && r.version !== row.version) {
    status = "failed";
    error = `the job was read by sentinel-survey ${row.version ?? "(no version)"} and this measure ran ${r.version ?? "(no version)"} — its cloud is not known to be the job's; run the survey again — nothing it measured was kept`;
  }
  const shape = status === "done" ? measureRefusal(r.result, plan.send, TOLERANCES_MM) : null;
  if (shape) { status = "failed"; error = `sentinel-survey's measure is not the contract's shape (${shape}) — nothing it measured was kept`; }
  if (status === "refused") error = `the scan was not read again — ${(r.refused ?? []).map((i) => `${i.id}: ${i.reason}`).join("; ")}`;
  const rc = (status === "done" && r.result.receipt) || {};
  const got = new Map(status === "done" ? r.result.elements.map((m) => [m.guid, m]) : []);
  const why = new Map(plan.skip.map((s) => [s.proposal_guid, s.reason]));
  // Rule 3: the service gave numbers; the verdict on each placed element is the bridge's.
  const elements = status !== "done" ? [] : plan.placed.map((p) => {
    const m = got.get(p.proposal_guid);
    if (!m) return { ...p, status: "not_measured", basis: "deviation", reason: why.get(p.proposal_guid) };
    // Only the five numbers (measureRefusal let no other key through), shares at the bridge's own tolerances; the verdict last, the bridge's.
    const nums = { points: m.points, p95_mm: m.p95_mm, mean_signed_mm: m.mean_signed_mm, coverage: m.coverage,
      share_within: m.points ? Object.fromEntries(TOLERANCES_MM.map((t) => [String(t), m.share_within[t]])) : null };
    return { ...p, ...nums, ...judge(m, rc.measure), basis: "deviation" };
  });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, elements.filter((e) => e.status === s).length]));
  const s = cs.job.storey ?? {};
  const value = {
    changeset: { id: cs.id, name: cs.name }, applied_row: applied, reverted_row: reverted,
    // Which ghosts count as placed is Revit's report: who filed it, as the bridge read it at reportResult (the machine credential's is "service").
    placed_by: { reported_by: cs.result?.reported_by ?? null, reported_role: cs.result?.reported_role ?? null }, faces_sha256: faces,
    status, job: { id: cs.job.id, ledger_id: row.ledger.id, result_sha256: row.result_sha256, version: row.version ?? null },
    evidence, reader: READER, version: r.version ?? null, tools: r.tools ?? [], params: row.params, seed: row.seed,
    tolerances_mm: TOLERANCES_MM, target_mm: TOLERANCE_MM, min_coverage: MIN_COVERAGE, measure: rc.measure ?? null,
    // As filed: the changeset's own geometry, which the executor places exactly — not re-read from Revit (MA-4f); the frame is the lead's statement.
    reference: "as filed", frame: cs.job.frame, storey: { level: s.level ?? null, how: s.how ?? null, checked: s.checked ?? null, delta_mm: s.delta_mm ?? null },
    sign: "+ = the scan outside the element's face", started: rc.started ?? null, finished: rc.finished ?? null, cpu_s: rc.cpu_s ?? null,
    points_in: rc.points_in ?? null, points_used: rc.points_used ?? null, counts, elements, model_calls: 0, tokens: 0, claimed: false, ...(error ? { error } : {}),
  };
  let written;
  try {
    written = await d.audit(proj.id, "changeset", cs.id, `verify:measured ${cs.job.id} · ${READER} ${r.version ?? "(no version)"} · ${status}${status === "done" ? ` · ${countWords(counts)}` : ""}`,
      actor || "web", null, value);
  } catch (e) { throw err(502, `${cs.name} was measured, but the ledger did not take its row (${e.message}) — nothing was saved; measure it again`); }
  const ledger = ledgerRef(written);
  if (status === "refused") throw err(409, `${cs.name} was not measured: ${error} — ledger #${ledger?.id ?? "?"} records the run; nothing else was saved`);
  if (status !== "done") throw err(502, `the measure of ${cs.name} did not finish: ${error} — ledger #${ledger?.id ?? "?"} records the run; nothing else was saved`);
  return { changeset: { id: cs.id, name: cs.name }, status, counts, elements, ledger };

  /** Everything before the run: the changeset, its job's row, the bytes, its Undo rows, what is measured, and whether it is a replay. */
  async function prepare(id) {
    const proj = await d.ensureProject(key);
    const cs = await d.docGet(STORE, proj.id, id);
    if (!cs) throw err(404, `no changeset ${id} on ${key}`);
    if (!cs.job || cs.claimed !== false) throw err(409, `${cs.name} was not built from a survey job — there is no scan to measure it against`);
    if (cs.status !== "applied" && cs.status !== "partially_applied") throw err(409, `${cs.name} is ${String(cs.status).replace("_", " ")} — only what Revit placed is measured`);
    const { row } = await trustedJob(key, cs.job.id);
    // A job id repeats across jobs folders (MA-4d decision 19): the row must be the one this changeset was built from.
    if (row.ledger.id !== cs.job.ledger_id || row.result_sha256 !== cs.job.result_sha256)
      throw err(409, `${cs.job.id} on this PC is ledger #${row.ledger.id}, not the job ${cs.name} was built from (ledger #${cs.job.ledger_id}) — its scan cannot be read again here`);
    if (!row.params || !Number.isInteger(row.seed))
      throw err(409, `ledger #${row.ledger.id} holds no params or seed — the cloud ${cs.job.id} measured cannot be read again; run the survey again`);
    const { pack, folder } = await readPack(key, row.pack_id);
    const evidence = stillAdmitted(row, pack, cs.job.id);
    // The job's cloud again: what its row says it read, in the order it sent them (the seeded sample follows the order), at the row's sha —
    // sentinel-survey re-hashes each file before and after the read.
    const { take, refused } = pickItems(pack, folder.path);
    const items = row.items.filter((i) => row.read.includes(i.id)).map((i) => {
      const t = take.find((y) => y.id === i.id);
      if (!t) throw err(409, `${i.id} cannot be read again (${refused.find((y) => y.id === i.id)?.reason ?? "not a scan sentinel-survey reads"}) — survey the admitted scan again`);
      return { id: i.id, kind: "scan", path: t.path, sha256: i.sha256 };
    });
    const read = async (action_prefix, limit) => {
      try { return await listAudit(key, { entity_type: "changeset", action_prefix, entity_id: cs.id, limit }); }
      catch (e) { throw err(503, `${cs.name}'s ledger rows could not be read (${e.message}) — an Undo in Revit or an earlier measure would be missed`); }
    };
    // Its changeset_ rows, whole or not at all (rows come newest first; a cut read could miss the newest Undo — readLedger on the desk refuses it too).
    const page = await read("changeset_", 1000), rows = page.rows ?? [];
    if ((page.total ?? 0) > rows.length) throw err(503, `${cs.name} has more ledger rows (${page.total}) than one read returns — an Undo in Revit could be missed`);
    // An Undo in Revit leaves the doc applied (reportReverted writes a row only): each placed guid's newest changeset_reverted row decides.
    const last = new Map();
    for (const y of rows) if (y.action === "changeset_reverted") for (const g of y.new_value?.guids ?? []) if (!last.has(g)) last.set(g, y);
    const plan = measurePlan(cs, (g) => (last.get(g)?.new_value?.op === "undo" ? last.get(g).id : null));
    if (!plan.send.length) throw err(409, `nothing of ${cs.name} can be measured: ${[...new Set(plan.skip.map((y) => y.reason))].join("; ")}`);
    const applied = rows.find((y) => y.action === "changeset_applied")?.id ?? null, reverted = rows.find((y) => y.action === "changeset_reverted")?.id ?? null;
    const faces = createHash("sha256").update(JSON.stringify(plan.send)).digest("hex");
    // A replay (decision 11): the measure is deterministic, so a done row on these same inputs is not written twice.
    // ponytail: a new sentinel-survey version (or a changed target here) is re-measured only once an input changes; a "measure anyway" when asked.
    const [prev] = (await read("verify:measured", 1)).rows ?? [];
    const pv = prev?.new_value;
    if (pv?.status === "done" && pv.job?.ledger_id === row.ledger.id && JSON.stringify(pv.evidence) === JSON.stringify(evidence)
      && pv.applied_row === applied && pv.reverted_row === reverted && pv.faces_sha256 === faces)
      throw err(409, `${cs.name} was measured on these same inputs as ledger #${prev.id} — the same bytes, seed and geometry give the same numbers; nothing was saved`);
    return { proj, cs, row, evidence, items, applied, reverted, faces, plan };
  }
}
```
  Run `npx vitest run bridge/changesets-store.test.mjs` → pass (the MA-4d block included).
- [ ] **Step 3: commit** — `feat(bridge): MA-4e - verifyChangeset: a placed survey changeset measured as filed against its job's own scan, judged by the bridge, one verify:measured row per run`

### Task 7 — Bridge: `verify:` reserved, the route, who may use it

**Files:** modify `WebApp/bridge/cde-store.mjs` (:1207-1211), `WebApp/bridge/bcf-service.mjs` (before :1691); test `write-roles.test.mjs` (after :1147).

- [ ] **Step 1: the test first** — `write-roles.test.mjs`:
```js
describe("measuring a placed changeset (MA-4e): a signed-in contributor; a verify: row is the bridge's", () => {
  const V = "/cde/demo/verify";
  it("the machine credential and a viewer may not; a contributor meets the body's own refusal — no row", async () => {
    const rows = db.audit_log.length;
    expect(await call("POST", V, "machine", { changeset: "x" })).toEqual({ status: 403, body: { message: "measuring a changeset against its scan needs a person — it reads the whole scan, and its row names who asked: sign in. Nothing was saved." } });
    expect((await call("POST", V, "viewer", { changeset: "x" })).status).toBe(403);
    expect(await call("POST", V, "contributor", { changeset: "x", results: [] })).toEqual({ status: 400, body: { message: "results is not a measure field — the bridge measures what Revit placed, as filed, against its job's own scan; send {changeset} — nothing was saved" } });
    expect(db.audit_log.length).toBe(rows);
  });
  it("verify: rows are the bridge's: the machine credential cannot post a verify:measured through the open route, nor a lead a note that passes for one", async () => {
    const rows = db.audit_log.length;
    expect(await call("POST", "/cde/demo/audit", "machine", { entity_type: "changeset", entity_id: "c1", action: "verify:measured job-0002 · sentinel-survey 0.1.0 · done", new_value: { claimed: false, elements: [] } }))
      .toEqual({ status: 400, body: { message: "verify: rows are written by Sentinel, not through this route" } });
    expect((await call("POST", "/cde/demo/audit", "lead", { action: " Verify:measured c1" })).body.message).toBe("verify: rows are written by Sentinel, not through this route");
    expect(db.audit_log.length).toBe(rows);
  });
});
```
  Run `npx vitest run bridge/write-roles.test.mjs` → fails.
- [ ] **Step 2: the code** — `cde-store.mjs`, the comment block before `RESERVED_ACTIONS` gains `// MA-4e: verify:measured is the bridge's measure of a placed changeset (changesets-store verifyChangeset) — the desk reads the newest one by entity_id as fact; no client posts a verify: row.` and the list ends `…, "evidence:", "attestation:", "verify:"];`. `bcf-service.mjs`, before the MA-4d block (:1691):
```js
      // MA-4e: POST /cde/:key/verify {changeset} → 200 — a signed-in contributor measures a placed survey changeset, as filed, against its job's
      //   own scan (changesets-store verifyChangeset); design §6.8's route with spec amendment S1 (no results[]: the bridge measures; a Revit
      //   re-read is MA-4f's). Not public: isPublicRoute matches only /receipt/<key>/verify.
      if (p2 === "verify" && !p3 && req.method === "POST") {
        const cs = await import("./changesets-store.mjs");
        return send(res, 200, await cs.verifyChangeset(p1, (await readBody(req, { max: SMALL_JSON })) || {}, "web"));
      }
```
  Run `npx vitest run bridge/write-roles.test.mjs bridge/ledger-write.test.mjs` → pass.
- [ ] **Step 3: commit** — `feat(bridge): MA-4e - POST /cde/:key/verify (a signed-in contributor); every verify: row reserved to the bridge`

### Task 8 — Web: Measure on the desk, and the newest measure in words

**Files:** modify `WebApp/src/setups/review-desk.ts`; test `review-desk.test.ts`.

- [ ] **Step 1: the tests first** — `review-desk.test.ts`: the pins at :204 and :208 name the new call — `'try { tail = recent(decided, ledger, role.role, verified); } catch (e) { tail = el("div", \`Reports not shown — ${(e as Error).message}\`, "color:#fca5a5"); }'` and `src.split("recent(decided, ledger, role.role, verified)")`; the import gains `measureWords, verifiedView, readVerified, postMeasure, measureLine, canMeasure, countWords, type VerifyRecord, type Measured`; at the end of the file:
```ts
describe("measured against the scan (MA-4e)", () => {
  beforeEach(() => { bfetch.mockReset(); bwrite.mockReset(); });
  const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
  const W: Ghost = { proposal_guid: "g1", kind: "wall", op: "create", cid: "scan-L00-wall-1", place: { TypeName: "BDS_EXT_ARC_CMU_300 mm", LevelName: "GR-FFL" }, validate: { identity: { Name: "scan-L00-wall-1" } } };
  const IN: Measured = { proposal_guid: "g1", kind: "wall", status: "within_tolerance", points: 3512, p95_mm: 3, mean_signed_mm: 0, coverage: 0.999, share_within: { 50: 1, 100: 1, 200: 1 } };
  it("measureWords: the verdict against 20 mm on p95, the numbers, the sign said; a reason — never a made-up zero", () => {
    expect(measureWords(IN)).toBe("within tolerance (20 mm, p95) · p95 3 mm · mean 0 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 100% / 100% / 100% · 3512 points");
    expect(measureWords({ ...IN, status: "out_of_tolerance", p95_mm: 63, mean_signed_mm: 0.2, share_within: { 50: 0, 100: 1, 200: 1 } }))
      .toBe("out of tolerance (20 mm, p95) · p95 63 mm · mean +0.2 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 0% / 100% / 100% · 3512 points");
    expect(measureWords({ proposal_guid: "g2", status: "missing", points: 0, p95_mm: null, mean_signed_mm: null, coverage: 0, share_within: null, reason: "no scan point within 400 mm of its faces — not built where it stands, or not scanned there" }))
      .toBe("missing · 0% of its faces seen · no scan point within 400 mm of its faces — not built where it stands, or not scanned there");
    expect(measureWords({ proposal_guid: "g3", status: "not_measured", reason: "undone in Revit (ledger #2211) — nothing placed to measure" })).toBe("not measured · undone in Revit (ledger #2211) — nothing placed to measure");
  });
  it("verifiedView: the head — as filed, who reported the placement, the counts or why it did not finish, its row, when, who — and a line per placed element; null never measured; a failed read said", () => {
    const cs = { id: A, name: "Survey job-0002 · GR-FFL", source: "sentinel-survey 0.1.0", status: "applied", created_at: "", elements: [W] } as PendingChangeset;
    const rec: VerifyRecord = { id: 2300, at: "2026-10-09T10:00:02.000Z", actor: "lead@example.test", status: "done", reference: "as filed", target_mm: 20,
      placed_by: { reported_by: "lead@example.test", reported_role: "lead" },
      counts: { within_tolerance: 1, not_measured: 1 }, elements: [IN, { proposal_guid: "g9", status: "not_measured", reason: "a level has no face to measure — its height against the scan is MA-4h's level error" }] };
    const AS_FILED = "Measured against the scan as filed (the changeset's geometry, which Revit placed exactly — not re-read from Revit: a wall moved since, Revit's joins, the type's width in Revit and the lead's frame are not seen) · placed as Revit reported (by lead@example.test)";
    expect(verifiedView(cs, rec)).toEqual({ head: `${AS_FILED} · 1 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 1 not measured · ledger #2300 · 2026-10-09 10:00 UTC · by lead@example.test`,
      lines: [{ line: ghostLine(W), words: measureWords(IN) }, { line: "g9", words: "not measured · a level has no face to measure — its height against the scan is MA-4h's level error" }] });
    expect(verifiedView(cs, { ...rec, placed_by: { reported_by: "revit", reported_role: "service" } })!.head)
      .toContain(" · placed as Revit reported (by revit) — the machine credential's report · ");
    expect(verifiedView(cs, null)).toBeNull();
    expect(verifiedView(cs, { ...rec, status: "failed", error: "the survey took longer than 10 min — it was stopped; nothing it found was kept", elements: [] })!.head)
      .toBe(`${AS_FILED} · did not finish — the survey took longer than 10 min — it was stopped; nothing it found was kept · ledger #2300 · 2026-10-09 10:00 UTC · by lead@example.test`);
    expect(verifiedView(cs, new Error("not read — HTTP 500"))).toEqual({ head: "Measure not read — HTTP 500", lines: [] });
  });
  it("readVerified reads each changeset's newest verify:measured row on its own (limit 1, in parallel): a busy report never cuts a quiet one's; a failed read is that report's 'not read — …'; none asked is no read", async () => {
    expect((await readVerified("http://b", "demo", [])).size).toBe(0);
    expect(bfetch).not.toHaveBeenCalled();
    bfetch.mockResolvedValueOnce(res(200, { rows: [
      { id: 2302, entity_id: A, at: "2026-10-09T11:00:00Z", actor: "x@example.test", new_value: { status: "done", reference: "as filed", target_mm: 20, counts: { within_tolerance: 3 }, elements: [IN] } }], total: 300 }))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(res(200, { rows: [], total: 0 }));
    const m = await readVerified("http://b/", "demo key", [A, B, C]);
    expect(m.get(A)).toEqual({ id: 2302, at: "2026-10-09T11:00:00Z", actor: "x@example.test", status: "done", reference: "as filed", target_mm: 20, counts: { within_tolerance: 3 }, elements: [IN] });
    expect([m.get(B), m.get(C)]).toEqual([new Error("not read — timeout"), null]);
    expect(bfetch.mock.calls.map((c) => c[0])).toEqual([A, B, C].map((id) => `http://b/cde/demo%20key/audit?entity_type=changeset&action_prefix=verify:measured&limit=1&entity_id=${id}`));
  });
  it("postMeasure sends the changeset id only to /cde/:key/verify; measureLine says what was judged and its row", async () => {
    bwrite.mockResolvedValueOnce({ changeset: { id: A, name: "Survey job-0002 · GR-FFL" }, status: "done", counts: { within_tolerance: 3 }, elements: [], ledger: { id: 2300, hash: "h" } });
    const r = await postMeasure("http://b/", "demo", A);
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeset: A }) });
    expect(measureLine(r)).toBe("✓ Measured Survey job-0002 · GR-FFL against the scan as filed — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2300");
    expect(countWords({})).toBe("0 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured");
  });
  it("canMeasure: a placed survey changeset, a signed-in contributor or above, not undone in Revit — the bridge holds the same rules", () => {
    const cs = { id: A, name: "n", source: "s", status: "applied", created_at: "", elements: [], job: { id: "job-0002", ledger_id: 2201 } } as PendingChangeset;
    expect(["viewer", "contributor", "lead", "owner", "service"].map((r) => canMeasure(cs, r, null))).toEqual([false, true, true, true, false]);
    expect(canMeasure({ ...cs, status: "partially_applied" }, "contributor", { row: 1, reverted: { id: 2, op: "redo" } })).toBe(true);
    expect(canMeasure(cs, "contributor", { row: 1, reverted: { id: 2, op: "undo" } })).toBe(false);
    expect(canMeasure(cs, "contributor", new Error("not read"))).toBe(true); // the bridge reads the Undo rows itself
    expect([canMeasure({ ...cs, job: null }, "lead", null), canMeasure({ ...cs, status: "declined" }, "lead", null)]).toEqual([false, false]);
  });
  it("the desk reads the newest measure after the ledger rows, and Measure sits behind canMeasure with one press, one run (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("const verified = decided instanceof Error ? new Map<string, VerifyRecord | Error | null>() : await readVerified(base, key, decided.slice(0, DECIDED_MAX).filter((c) => c.job).map((c) => c.id));");
    expect(src).toContain("if (canMeasure(cs, role, ledger instanceof Error ? ledger : ledger.get(cs.id) ?? null)) {");
    expect(src).toContain('go.disabled = true; go.textContent = "Measuring…";');
  });
});
```
  Run `npx vitest run src/setups/review-desk.test.ts` → fails.
- [ ] **Step 2: the code** — `review-desk.ts`: the header comment gains `// MA-4e: under a placed survey report, its newest measure against the scan (the bridge's verify:measured row) and Measure — a signed-in contributor's.`; after `LedgerRef` (:62):
```ts
/** MA-4e: one placed element as the bridge judged it against the scan (a verify:measured row's element). */
export interface Measured {
  proposal_guid: string; kind?: string | null; status: string; points?: number; p95_mm?: number | null; mean_signed_mm?: number | null;
  coverage?: number | null; share_within?: Record<string, number> | null; reason?: string;
}
/** MA-4e: the newest verify:measured row of a changeset. */
export interface VerifyRecord {
  id: number; at: string; actor: string; status: string; reference?: string; target_mm?: number; counts?: Record<string, number>; error?: string;
  placed_by?: { reported_by?: string | null; reported_role?: string | null } | null; elements: Measured[];
}
/** MA-4e: what POST /cde/:key/verify answers. */
export interface MeasureReply { changeset: { id: string; name: string }; status: string; counts: Record<string, number>; elements: Measured[]; ledger: LedgerRef | null; }
```
  `readLedger` (:169-186) is rewritten over a shared reader (same words, same pinned URL):
```ts
/** GET …/audit → its rows and total; any failure throws "not read — <why>", never an empty list. */
async function auditRows<T>(url: string): Promise<{ rows: T[]; total: number }> {
  let r: Response;
  try { r = await bfetch(url); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { rows?: T[]; total?: number; message?: string } | null;
  if (!r.ok || !Array.isArray(j?.rows)) throw new Error(`not read — ${j?.message || (r.ok ? "the bridge answered without rows" : `HTTP ${r.status}`)}`);
  return { rows: j.rows, total: j.total ?? 0 };
}
```
  and `readLedger`'s body from the fetch to the total check becomes `const j = await auditRows<{ id: number; entity_id: string; action: string; new_value?: { op?: unknown } | null }>(\`${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/audit?entity_type=changeset&action_prefix=changeset_&entity_id=${ids.map(encodeURIComponent).join(",")}&limit=1000\`); if (j.total > j.rows.length) throw new Error(\`not read — the ledger holds more rows for these reports (${j.total}) than one read returns\`);` (the loop unchanged). After `rowWords` (:253):
```ts
// ── MA-4e: measured against the scan — the bridge's verify:measured rows ("verify:" is reserved on the open audit route). Every string here
//    is rendered with textContent. ──

/** The newest verify:measured row of each changeset asked — one read per changeset, newest first, limit 1, in parallel (journey-store's
 *  newest-row read; readLedger's is pinned to changeset_ rows): a report measured often never cuts a quiet one's. → per id its record, null
 *  (never measured) or that one read's "not read — …" Error, never a guess. None asked is no read.
 *  ponytail: one read per survey report shown (at most DECIDED_MAX); a ledger view of the newest row per entity if the desk shows more. */
export async function readVerified(base: string, key: string, ids: string[]): Promise<Map<string, VerifyRecord | Error | null>> {
  const at = `${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/audit?entity_type=changeset&action_prefix=verify:measured&limit=1&entity_id=`;
  return new Map(await Promise.all(ids.map(async (id): Promise<[string, VerifyRecord | Error | null]> => {
    try {
      const [x] = (await auditRows<{ id: number; at: string; actor: string; new_value?: Partial<VerifyRecord> | null }>(at + encodeURIComponent(id))).rows;
      if (!x) return [id, null];
      const v = x.new_value ?? {};
      return [id, { id: x.id, at: x.at, actor: x.actor, status: String(v.status ?? ""), reference: v.reference, target_mm: v.target_mm, counts: v.counts, error: v.error,
        placed_by: v.placed_by, elements: Array.isArray(v.elements) ? v.elements : [] }];
    } catch (e) { return [id, e as Error]; }
  })));
}

const MEASURED = ["within_tolerance", "out_of_tolerance", "missing", "insufficient_data", "not_measured"];
/** "3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured" — the bridge's count words (survey-plan countWords). Pure. */
export const countWords = (n: Record<string, number>): string => MEASURED.map((s) => `${n[s] ?? 0} ${s.replace(/_/g, " ")}`).join(", ");

/** One measured element in words: the verdict against the target on p95, the numbers sentinel-survey gave, the bridge's reason — a number it
 *  did not give is left out, never a zero. Pure. */
export function measureWords(m: Measured, target = 20): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`, sw = m.share_within;
  const judged = m.status === "within_tolerance" || m.status === "out_of_tolerance";
  return [`${m.status.replace(/_/g, " ")}${judged ? ` (${target} mm, p95)` : ""}`,
    ...(m.p95_mm != null ? [`p95 ${m.p95_mm} mm`] : []),
    ...(m.mean_signed_mm != null ? [`mean ${m.mean_signed_mm > 0 ? "+" : ""}${m.mean_signed_mm} mm (+ = the scan outside it)`] : []),
    ...(m.coverage != null ? [`${pct(m.coverage)} of its faces seen`] : []),
    ...(sw ? [`within ${Object.keys(sw).join(" / ")} mm: ${Object.values(sw).map(pct).join(" / ")}`] : []),
    ...(m.points ? [`${m.points} points`] : []),
    ...(m.reason ? [m.reason] : [])].join(" · ");
}

/** A changeset's newest measure in words: the head (as filed, who reported the placement, the counts or why it did not finish, its row, when,
 *  who) and a line per placed element (ghostLine, then measureWords); null when it was never measured; the read's own failure as the head. Pure. */
export function verifiedView(cs: PendingChangeset, rec: VerifyRecord | null | Error): { head: string; lines: { line: string; words: string }[] } | null {
  if (rec instanceof Error) return { head: `Measure ${rec.message}`, lines: [] };
  if (!rec) return null;
  const when = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(rec.at ?? "") ? `${rec.at.slice(0, 10)} ${rec.at.slice(11, 16)} UTC` : "an unknown time";
  const what = rec.status === "done" ? countWords(rec.counts ?? {}) : `did not finish — ${rec.error ?? "no reason on its row"}`;
  const filed = rec.reference === "as filed" ? " as filed (the changeset's geometry, which Revit placed exactly — not re-read from Revit: a wall moved since, Revit's joins, the type's width in Revit and the lead's frame are not seen)" : "";
  // Which walls count as placed is Revit's report, not the bridge's measure: who filed it, and the machine credential's said so.
  const pb = rec.placed_by, placed = `placed as Revit reported${pb?.reported_by ? ` (by ${pb.reported_by})` : ""}${pb?.reported_role === "service" ? " — the machine credential's report" : ""}`;
  const byGuid = new Map((cs.elements ?? []).map((e) => [e.proposal_guid, e]));
  return {
    head: `Measured against the scan${filed} · ${placed} · ${what} · ledger #${rec.id} · ${when} · by ${rec.actor || "an unknown account"}`,
    lines: rec.elements.map((m) => { const el = byGuid.get(m.proposal_guid); return { line: el ? ghostLine(el) : m.proposal_guid, words: measureWords(m, rec.target_mm) }; }),
  };
}

/** Who sees Measure on a report: a placed survey changeset (its job; applied or partially), a signed-in contributor or above (never the
 *  machine credential), not undone in Revit since (its newest changeset_reverted row). The bridge holds the same rules. Pure. */
export const canMeasure = (cs: PendingChangeset, role: string, rows: LedgerRows | null | Error): boolean =>
  !!cs.job && (cs.status === "applied" || cs.status === "partially_applied") && canDecide(role) && !(rows && !(rows instanceof Error) && rows.reverted?.op === "undo");

/** POST /cde/:key/verify {changeset} — the id only: the bridge picks the elements, their geometry, the scan and the seed. A refusal throws the
 *  bridge's words. */
export const postMeasure = (base: string, key: string, id: string): Promise<MeasureReply> =>
  bwrite(`${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeset: id }) });

/** The status line after Measure. Pure. */
export const measureLine = (r: MeasureReply): string => `✓ Measured ${r.changeset.name} against the scan as filed — ${countWords(r.counts)} · ${rowWords(r)}`;
```
  `recent` (:388): the signature → `(decided: PendingChangeset[] | Error, ledger: Map<string, LedgerRows> | Error, role: string, verified: Map<string, VerifyRecord | Error | null>): HTMLElement`; inside the loop, after the declined rows and before `box.append(one)`:
```ts
      // MA-4e: a placed survey changeset's newest measure, and Measure — one press, one run (the service may start cold).
      if (cs.job) {
        const mv = verifiedView(cs, verified.get(cs.id) ?? null);
        if (mv) {
          one.append(el("div", mv.head, "margin:.3rem 0 .1rem;color:#8b93a1"));
          for (const m of mv.lines) one.append(el("div", m.line), el("div", m.words, "color:#8b93a1;font-size:11px"));
        }
        if (canMeasure(cs, role, ledger instanceof Error ? ledger : ledger.get(cs.id) ?? null)) {
          const go = btn(mv?.lines.length ? "Measure again" : "Measure against the scan", async () => {
            if (go.disabled) return;
            go.disabled = true; go.textContent = "Measuring…";
            try { say(measureLine(await postMeasure(base, activePid(), cs.id))); }
            catch (e) { say(`Not measured — ${(e as Error).message}`, true); }
            void show();
          });
          one.append(go);
        }
      }
```
  `show()`: after the ledger read and its `if (mine !== seq) return;` (:432):
```ts
    // MA-4e: the newest measure of each placed survey changeset shown — one read each; a failed one is said under its own report, never a guess.
    const verified = decided instanceof Error ? new Map<string, VerifyRecord | Error | null>() : await readVerified(base, key, decided.slice(0, DECIDED_MAX).filter((c) => c.job).map((c) => c.id));
    if (mine !== seq) return;
```
  and the build of the tail → `try { tail = recent(decided, ledger, role.role, verified); } catch (e) { tail = el("div", \`Reports not shown — ${(e as Error).message}\`, "color:#fca5a5"); }`. Run `npx vitest run src/setups/review-desk.test.ts src/setups/html-sinks.test.ts` → pass (C13: no markup sink); `npm run build` builds.
- [ ] **Step 3: commit** — `feat(web): MA-4e - Measure against the scan on a placed survey report; the newest measure in words`

### Task 9 — Docs: the design amendments

**Files:** modify `docs/strategy/2026-09-30-model-automation-design.md`.

- [ ] **Step 1:**
  - `:172` (rule 6, the MA-4d bullet) append: ` MA-4e BUILT: \`verify:measured\` judges each placed wall of a survey changeset as filed — the changeset's own geometry, which the executor places exactly, back in the scan's frame — against the job's own cloud: \`within_tolerance\` when p95 ≤ 20 mm (D7) with at least a quarter of its faces seen, else \`out_of_tolerance\`, \`insufficient_data\`, \`missing\` (no point within 400 mm) or \`not_measured\` (a level, a floor or ceiling, an Undo in Revit) — \`basis: "deviation"\`, \`reference: "as filed"\`. The ghost's pre-placement \`accuracy\` (basis fit) and its pre-tick are unchanged.`
  - `:243` (stage 7's status cell) `Re-read, deviation and LOD state: MISSING` → `Deviation: BUILT for the walls of a placed survey changeset, as filed (MA-4e: \`POST /cde/:key/verify\`, \`verify:measured\`). Re-read and LOD state: MISSING (the re-read: MA-4f)`.
  - `:453` append: ` BUILT in MA-4e for walls: p95, the signed mean, coverage and the shares within 50 / 100 / 200 mm of the job's own cloud (numpy).`
  - `:842` (`verify:measured`) the status `TARGET` → `BUILT (MA-4e): entity_type \`changeset\`, entity_id the changeset, action \`verify:measured <job-id> · sentinel-survey <version> · <done|failed|refused>\` (with the counts when done), one per run that starts (a press on the same inputs as the newest done row is a 409, no row); new_value {changeset, applied_row, reverted_row, placed_by {reported_by, reported_role} (who filed Revit's report — the placed list is the add-in's), faces_sha256, status, job {id, ledger_id, result_sha256, version} (a measure by another sentinel-survey version than the job's is failed), evidence [{id, sha256}], reader, version, tools, params, seed, tolerances_mm, target_mm 20, min_coverage 0.25, measure {band_mm, edge_mm, cell_mm}, reference "as filed", frame, storey, sign, started, finished, cpu_s, points_in, points_used, counts, elements [{proposal_guid, revit_unique_id, cid, kind, status, basis "deviation", points, p95_mm, mean_signed_mm, coverage, share_within, reason?}], model_calls 0, tokens 0, claimed false}; written by the bridge only (the open audit route refuses \`verify:\`); the desk reads the newest by entity_id. Walls only; floors, ceilings and levels \`not_measured\` (MA-4h).`
  - after `:846` add `- MA-4e: every \`verify:\` row is the bridge's too — the open audit route refuses the prefix (the desk reads the newest \`verify:measured\` row by entity_id as fact).`
  - `:892` append: ` MA-4e spec amendment S1: BUILT as \`{changeset}\` only → 200 — a signed-in contributor (the machine credential is a 403); the bridge picks the elements Revit placed (less an Undo in Revit), their geometry as filed, the job's own scan, params and seed; any other key is a 400 in words. \`results[]\` (Revit's re-read of what it placed) is MA-4f's — posted by the add-in, it would be the client's claim. Synchronous, bounded by the survey's 10 min; a 202 and a record when Kladno's measure outlasts a request (MA-4h).`
  - `:919` append: ` MA-4e spec amendment S2: BUILT as \`{job_id, items: [{id, kind, path, sha256}], params: {voxel_mm, storey_min_mm, tolerances_mm}, seed, elements: [{guid, faces: [[p0, p1, p3], …]}]}\` → 202, polled and read as a job: the items, params and seed are the job's own (its row's), so the cloud is the one its candidates came from — no point crosses a route (the body is capped at 1 MB); each face a rectangle in the scan's frame, (p1 − p0) × (p3 − p0) out of the element (a mesh waits for openings, MA-5, and roofs, MA-6). A point counts for the nearest face of any element sent, over the face's interior (200 mm in from every edge) and within 400 mm (twice the largest tolerance); share_within is over those points; coverage the share of 200 mm interior cells holding a point it owns (within 400 mm); + is the scan outside the element. Spec amendment S3: the result is numbers only, \`{guid, points, p95_mm, mean_signed_mm, share_within, coverage}\` — the status is the bridge's (rule 3): a result carrying any other key is refused as not the contract's shape, never merged. One process per measure, on the bridge's one survey slot.`
  - after `:965` add the row `| Measure a placed survey changeset against its scan | contributor, signed in (by name); the machine credential is a 403 (MA-4e) |`.
  - under `:1145` add `    - MA-4e: deviation per placed wall (p95, the signed mean, coverage, the shares within 5, 10 and 20 cm) — \`verify:measured\`; floors, ceilings and levels wait for MA-4h.`
  - under `:1154` add `    - MA-4h (Kladno), as the MA-4c and MA-4d plans assign it: F1 is detection against a hand-built reference — not MA-4e's per-element shares within 5, 10 and 20 cm; the computed level error likewise. Drill MA4e read the level error by hand (R-1): level error GR-FFL: <N> mm; Scan L01: 0 mm (created at the scan's height).` — `<N>` is filled in from R-1 when the design rows go to LANDED (the controller, at the merge).
- [ ] **Step 2: commit** — `docs: MA-4e - the design: verify:measured built (as filed, walls, the bridge's verdict), the verify route (S1), POST /measure (S2) and numbers only (S3), the contributor's row, drill MA4's F1 kept for MA-4h`

### Task 10 — Final checks (nothing to commit)

From `WebApp`: `npx vitest run 2>&1 | tail -6` (all pass; restore the fixture if listed), `npm run build 2>&1 | tail -3`, `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` (17). From the repo root: `C:\Python314\python.exe -B -m unittest discover -s survey -v` (all pass; `git status` shows no `__pycache__`), `dotnet run --project tools/promote-check` (all pass, unchanged), `git diff --stat master -- SentinelAddin tools` → nothing, `git status --short` shows only `.claude/`, `ab.html` and the pre-existing `package-lock.json`. `git diff --name-only master | grep migrations/` → nothing. Report the totals and `git log --oneline master..HEAD` (nine commits).

## Live drill MA4e (the controller; every row before the merge)

**Every row runs before the merge.** Revit's add-in reports to the **4100 bridge on master** throughout (Propose, Apply, Undo and Redo reports are MA-4d's, on master; MA-4e changes nothing the add-in calls; the add-in's config points at 4100 on loopback; no config is changed). The machine rows (V-) and every **Measure** run on a drill copy of the bridge at **4101 on the branch** and the local web app against it (the founder's session for the person rows: a measure names a person); both bridges read the same hosted ledger and the same `%APPDATA%\Sentinel` folders. **R-1 runs first and is a gate.** Project `ma4c-drill` (office `ma2e-office`), job-0002 (#2201), changeset `Survey job-0002 · GR-FFL` (#2205 proposed, #2210 applied, #2211 Undo, #2212 Redo). Never `aster-tower`, Demo, a pilot file or a founder file. Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work (check before closing; if a Revit window holds unsaved changes, stop and ask). `ma4d.rvt` stays open from R-1 to R-3 and is closed unsaved at the end.

- **R-1 Revit 2024: a fresh placement, the location line, the type's width and the level error — FIRST, a gate (needs nothing of MA-4e; may run while the build is under way)** — the founder (lead), on the web app against 4100: **Propose** job-0002 again, frame 40000/0/0/0, levels blank → `✓ Proposed job-0002 — 1 changeset(s), 4 ghost(s) … · 3 already filed (not proposed again) …` (as MA-4d R-3); record the new `Survey job-0002 · Scan L01 job-0002` id (not the withdrawn one of MA-4d R-2/R-3). Open `%USERPROFILE%\Documents\Sentinel drills\ma4d.rvt` (saved before any placement), Review AI Proposals → that changeset → tick the four → Apply (one Undo). Through the read-only Revit MCP, on each placed wall: Location Line (`WALL_KEY_REF_PARAM`) reads **Wall Centerline** (0) and its type's **Width** equals the ghost's `facts.thickness_mm` (300 / 200 / 300, from `b4100 GET changesets/ma4c-drill/<id>`) — the two things `facesOf` rests on; base offset 0, top unconnected at 5800, level `Scan L01 job-0002` at 3000. **Gate:** a location line other than Wall Centerline, or a Width other than `facts.thickness_mm`, stops the slice before Task 5 (`facesOf`) merges — v1's faces would be off by up to half a thickness, or by the width gap; the founder decides. **The level error, by hand (decision 15):** read the Elevation (`Level.Elevation`, the value `Level.Create` sets) of `GR-FFL` and of `Scan L01 job-0002`; compare each with its storey's height in the model frame — the job-0002 level candidate's `BaseElevation` in `result.json` (L00, L01) plus the frame's `dz_mm` (0), which is also each changeset's `job.storey.elevation_mm` — and record `level error GR-FFL: N mm; Scan L01: 0 mm (created at the scan's height)` in the session notes (and, at LANDED, in the design's MA-4 drill note: Task 9). GR-FFL is filed `named, checked: false, delta_mm: null`: this is the number the row only calls "not checked".
- **V-0 set-up (read only)** — `certutil -hashfile %APPDATA%\Sentinel\evidence\ma4c-drill\scans\two-storey.las SHA256` → `244cba9d…`; `…\jobs\ma4c-drill\job-0002\result.json` → `70c9845a…` (#2201's `result_sha256`). `b4101 GET "cde/ma4c-drill/audit?entity_type=changeset&action_prefix=changeset_&limit=50"` → record GR-FFL's changeset id (#2210's entity_id), that its newest `changeset_reverted` is #2212 (`redo`), and #2210's `reported_by` / `reported_role` (`b4101 GET changesets/ma4c-drill/<id>` → `result`). `b4101 GET changesets/ma4c-drill/<id>` → `applied`, `job.storey {GR-FFL, named, checked false}`, three walls with `facts.thickness_mm` 300 / 200 / 300. **No `verify:` row anywhere on the ledger** (until MA-4e ships, the open audit route stores any non-reserved action, so a forged row would read as the bridge's): read only, through the Supabase MCP, `select project_id, count(*) from audit_log where lower(btrim(action)) like 'verify:%' group by 1` → no rows. If any appear: list them in the session notes and stop before the merge — the desk then needs a floor (verify rows with an id below the first one this drill writes said "written before MA-4e reserved verify: — not the bridge's measure"), built only if needed. Record the ledger count.
- **V-1 refusals, no row** — the machine credential `b4101 POST cde/ma4c-drill/verify {changeset: <id>}` → 403 `measuring a changeset against its scan needs a person — …`; the founder (the browser console on the local web app, `bwrite`): `{changeset: <id>, results: []}` → 400 `results is not a measure field — …`; `{changeset: "x"}` → 400; a withdrawn `Survey job-0002 · Scan L01 job-0002` (MA-4d R-2/R-3) → 409 `… is withdrawn — only what Revit placed is measured — nothing was saved`. The machine credential `POST cde/ma4c-drill/audit {entity_type: changeset, entity_id: <id>, action: "verify:measured job-0002 · sentinel-survey 0.1.0 · done", new_value: {claimed: false}}` → 400 `verify: rows are written by Sentinel, not through this route`. The ledger count is unchanged.
- **V-2 measure GR-FFL** — the founder: Review desk ↻ → Recently decided in Revit → `Survey job-0002 · GR-FFL` → **Measure against the scan** → `Measuring…` → `✓ Measured Survey job-0002 · GR-FFL against the scan as filed — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #N`; under the report `Measured against the scan as filed (… the type's width in Revit and the lead's frame are not seen) · placed as Revit reported (by <#2210's reported_by>)` (plus ` — the machine credential's report` if #2210's `reported_role` is `service`) ` · 3 within tolerance, … · ledger #N · <time> · by <the founder>` and per wall `scan-L00-wall-1 · BDS_EXT_ARC_CMU_300 mm · GR-FFL` / `within tolerance (20 mm, p95) · p95 3 mm · mean 0 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 100% / 100% / 100% · 3512 points` (wall-2 3523 points, wall-3 2569); the button now reads **Measure again**. No python.exe child of the bridge is left after the reply (`tasklist`). **The replay:** press **Measure again** at once → `Not measured — Survey job-0002 · GR-FFL was measured on these same inputs as ledger #N — the same bytes, seed and geometry give the same numbers; nothing was saved`; the ledger count is up by one (V-2's row) and no more.
- **V-3 the row** — `b4101 GET "cde/ma4c-drill/audit?entity_type=changeset&action_prefix=verify:&entity_id=<id>"` → one row: action `verify:measured job-0002 · sentinel-survey 0.1.0 · done · 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured`, actor the founder; new_value `applied_row 2210`, `reverted_row 2212`, `placed_by {#2210's reported_by, reported_role}`, `faces_sha256` (64 hex), `job {job-0002, 2201, 70c9845a…, version 0.1.0}`, `evidence [{ev-0001, 244cba9d…}]`, `params {voxel_mm 20, storey_min_mm 2000}`, `seed 1`, `tolerances_mm [50, 100, 200]`, `target_mm 20`, `min_coverage 0.25`, `measure {400, 200, 200}`, `reference "as filed"`, `frame {40000, 0, 0, 0, stated_by the founder}`, `storey {GR-FFL, named, false, null}`, `points_in 47699`, `points_used 47672`, three walls each `{proposal_guid, revit_unique_id (= #2210's from_job), cid, kind wall, status within_tolerance, basis deviation, p95_mm 3, mean_signed_mm 0, share_within 1/1/1}` with points 3512 / 3523 / 2569 and coverage 0.999 / 1 / 1 (this plan's in-memory numbers on the same bytes), `claimed false`, `model_calls 0`, `tokens 0`. Said plainly in the session notes: the ledger's last word on these walls is the Redo #2212, while the scratch copy was closed unsaved (MA-4d R-2) — the row is what was filed and placed, not what a saved model holds (Risks).
- **V-4 the bands (planted offsets, straight to the measuring code on the drill's own bytes; nothing written, no row)** — Git Bash, from `survey/`: `C:/Python314/python.exe -B - "$APPDATA/Sentinel/evidence/ma4c-drill/scans/two-storey.las" <<'PY'` with
```python
import json, sys, numpy as np, las, pipeline
p = sys.argv[1]
P, _, _ = pipeline.load([{"id": "ev-0001", "path": p, "head": las.read_header(p)}], {"voxel_mm": 20}, 1)
def wall(dy, t=300):  # GR-FFL's wall-1 as filed, back in the scan's frame: x 125..7850, y 150 + dy, z 0..2800
    y, h = 150 + dy, t / 2
    return {"guid": f"dy{dy}-t{t}", "faces": [[[125, y + h, 0], [125, y + h, 2800], [7850, y + h, 0]], [[125, y - h, 0], [7850, y - h, 0], [125, y - h, 2800]]]}
for dy, t in ((0, 300), (30, 300), (60, 300), (120, 300), (1000, 300), (0, 400)):
    print(json.dumps(pipeline.deviation(P, [wall(dy, t)], [50, 100, 200])[0]))
# one face seen (the outer face at y 0 dropped, an exterior wall in an interior scan), the wall placed 250 mm off
print(json.dumps(pipeline.deviation(P[np.abs(P[:, 1]) >= 10], [wall(-250)], [50, 100, 200])[0]))
PY
```
  → p95 3 / 33 / 63 / 123 / null / 53 / 253; share_within 1·1·1 / 1·1·1 / 0·1·1 / 0·0·1 / null / 0.59·1·1 / 0·0·0; points 3512 then 0 at 1000 mm (coverage 0.0), 1752 one-sided (coverage 0.5); mean 0 / 0.1 / 0.2 / 0.3 / null / −50 / +250. The bridge's `judge` reads within / out / out / out / missing / out / out (pinned in `survey-plan.test.mjs`): a 30 mm wall is out of tolerance yet 100% within 50 mm — the bands and the verdict are two readings; a wall seen from one side and placed 250 mm off is judged on that face, never "insufficient data".
- **R-2 measure L01** — the founder, on the local web app against 4101: desk ↻ → the R-1 `Survey job-0002 · Scan L01 job-0002` → **Measure against the scan** → `… — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 1 not measured · ledger #N` (the level: `a level has no face to measure — …`); p95 about 3 mm each; the row's `storey {Scan L01 job-0002, created, true, 0}`, `reverted_row null`.
- **R-3 an Undo in Revit** — Ctrl+Z in `ma4d.rvt` → a `changeset_reverted {op: undo}` row (via 4100); desk ↻ → the report says `undone in Revit after the report (ledger #n)` and shows **no Measure**. Ctrl+Y → `{op: redo}`; ↻ → **Measure again** → a second `verify:measured` row (its `reverted_row` the Redo's id: a changed input, so no replay refusal), the newest shown. Close the scratch copy without saving. `Survey job-0002 · Scan L01 job-0002` stays `applied` on the bridge (drill data).
- **Merge, then V-5** — merge, restart the 4100 bridge on master, publish the web, design rows to LANDED with the drill's ledger ids and R-1's level error (Task 9's `:1154` note), a secret scan of the range, push. **V-5 (read only, after the restart):** the V-0 count again → only `ma4c-drill`, and only this drill's rows (V-2, R-2, R-3); any other `verify:` row (written through the open route on 4100 before the restart) is listed and handled as in V-0. Then `b4100 POST cde/ma4c-drill/audit {action: "verify:measured …"}` with the machine credential → 400 `verify: rows are written by Sentinel, not through this route`.

## Risks

- **As filed, not as Revit holds it.** A wall moved or edited after Apply, a model closed unsaved after Apply (V-3), Revit's joins and the type's width in Revit are not seen; the row says `reference: "as filed"` and the desk says what it cannot see. MA-4f re-reads the placed solid (the add-in's claim, said so), which shows all four.
- **The placed list is Revit's report.** Which ghosts were placed, and their `revit_unique_id`, come from `reportResult`, which the machine credential may file; the row copies `placed_by {reported_by, reported_role}` and the desk says "the machine credential's report" when it was. The geometry and the numbers stay the bridge's.
- **The frame is one statement both ways.** Forward and back by the lead's frame cancels: a wrong frame is invisible to the measure (MA-4d decision 5); the overlay and the desk's 3D show it before Apply; MA-4g computes it.
- **Wall Centerline and the type's width are assumed** (`Wall.Create`'s default, which `ChangesetExecutor.cs:475` already relies on; the executor resolves the type by name only and never checks its Width against `facts.thickness_mm`). R-1 reads both live, **first, as a gate**: either one off stops the slice before `facesOf` merges.
- **The base on a named, unchecked level** is the scan's height as filed, Revit's level as placed: a wall's vertical faces and the 200 mm margin make its deviation independent of the base; a wrong level is MA-4h's level error or MA-4f's re-read. The row states the storey and whether it was checked.
- **Clutter and elements not placed** within 400 mm of a face's interior count against it: furniture against a wall, a type-gap partition meeting it mid-length (its end faces project onto the wall). p95 rises and the wall reads out of tolerance — the honest reading (the scan is not the model); MA-4h tunes the band on Kladno, MA-5 matches scan walls to model walls.
- **A wall seen from one side** reads coverage ≈ 0.5 and is judged on that face (open question 2), however far off within 400 mm: coverage counts every point a face owns (pinned: 250 mm off reads p95 253, coverage 0.5, `out_of_tolerance`). A wall under 400 mm on a side has no interior: `not_measured`.
- **Floors and ceilings** placed by an office rule are `not_measured` (their other face is their type's; the slab beyond counts) until MA-4h gives them a depth.
- **A synchronous request**: the drill's measure takes seconds; a Funnel or browser may cut a long one. MA-4h's Kladno measure → a 202 and a record.
- **One slot**: a measure and a survey job exclude each other (409 in words either way); no queue.
- **Memory**: about 1 GB at the 10 M point cap (the crop and three per-point arrays). MA-4h measures it.
- **An Undo the add-in did not report** (Revit emptied its Undo list: rule 5's exception) is not known to the bridge; the ledger is the record.
- **Another PC or a reused job id**: the measure runs where the job ran — the row id is checked (409 otherwise).
- **numpy's percentile** is a tool behaviour; the row names numpy's version and licence (`tools`).
- **The desk's read**: one `limit=1` ledger read per survey report shown (at most `DECIDED_MAX`, in parallel), so no report's measures cut another's; a failed read is that report's "not read — …", never a guess.
- **Repeat presses**: a press on the same inputs as the newest done row is a 409 (no row), so the ledger grows only when an input changes (an Undo or a Redo, a new job). The 6/min budget still counts the press. A new sentinel-survey version is re-measured only once an input changes (ponytail).
- **`verify:` rows from before the reservation**: until MA-4e ships, the open route stores any action not reserved. V-0 and V-5 count every `verify:` row on the ledger; any not written by the drill is listed and the desk gets a floor before verify rows are read as fact.
- **A long Undo/Redo history**: more than 1 000 `changeset_` rows on one changeset is a 503 in words, never a cut read that could miss the newest Undo.
- **A sentinel-survey upgrade**: a measure run by another version than the job's is failed on its row ("its cloud is not known to be the job's"); the job must be surveyed again.

## Next (out of scope here)

- **MA-4f** — the decimated scan overlay in Revit; Revit's pre-tick of a measured create (one line in `ChangesetTrust.PreTick` when `Claimed == false` and the accuracy is `within_tolerance`, `Trust.cs` flipped; deploy 2021–2027); **Revit's re-read** for verify: `AppliedEntry.mesh` (`[JsonIgnore(WhenWritingNull)]`, so every other body stays byte-identical) packed from `ClashManager.GetMainSolid` + `Face.Triangulate` after the recount (`ChangesetExecutor.cs:724`), only for `cs.Claimed == false`, its catch leaving it null; the bridge validates it and keeps its sha; `reference: "revit (claimed)"` — it shows a wall moved since, Revit's joins, the location line and the type's real width, none of which the as-filed measure sees; promote-check `Ma4e.cs` pins (the body key absent when null; the read after `t.Commit()`; the round trip through `UnreportedResults`). A pre-placement deviation per candidate at job time (the tolerances already go to `/jobs`) if the founder wants the pre-tick on deviation.
- **MA-4g** — E57, LAZ, the CRS; a computed frame (then counted in the tolerance and visible to a measure).
- **MA-4h** — Kladno: run time and memory, a plan-grid index for deviation, a warm service with a cloud cache, a 202 verify with a record, the knobs (band, edge, cells, the coverage minimum) tuned, floors and ceilings with a depth from their type, the level error and wall F1 against a hand reference, a storey over 200 elements.
- **MA-4i** — the scan in the web desk (a deviation heat map needs it). **MA-5** — openings (faces with holes, so coverage and missing count them), scan walls matched to existing walls. **MA-8** — the LOA band per element (after the USIBD read, D7), a per-class tolerance, the Federation Gate tolerance rule, one BCF topic per failing element.
- Later: verify after Apply automatically once a job queue exists; out-of-tolerance walls held in the Holding Area if the founder wants a gate on them.

## Critique applied (review round 2)

- **Feasibility (important) — coverage on every point a face owns.** `deviation`'s coverage line is `R = Q[j] - o` (points already within 400 mm); the first draft's 200 mm cut read a one-sided wall 200–400 mm off as coverage 0.0 → `insufficient_data`. Re-run in memory (Base): `building()` less |y| < 10, wall-1 at −250 → 1 759 points, p95 253.2, mean +250.0, coverage 0.5; the drill's bytes the same way → 1 752, 253.0, +250.0, 0.5; every both-faces number unchanged. Decision 8, the docstring, `DEV_CELL`'s comment and Task 9's S2 say "a point it owns (within 400 mm)"; a `Deviation` test and a `judge` pin ({1759, 253.2, 0.5} → `out_of_tolerance`); a V-4 line and a Risks line.
- **Feasibility (minor) — the desk reads the newest row per changeset.** `readVerified` makes one `…&action_prefix=verify:measured&limit=1&entity_id=<id>` read per survey report shown, in parallel (`journey-store.mjs:48`'s pattern), and returns per id a record, null or that read's Error; it never throws, so `show()` drops the `.catch`. The test: one id found (total 300 — never "cut"), one read failed, one never measured; the URLs pinned.
- **Feasibility (minor) — R-1 first, a gate.** R-1 (Propose job-0002 for L01, Apply in `ma4d.rvt`, Location Line and the type's Width) runs first, on the 4100 bridge on master; either check failing stops the slice before `facesOf` merges. Going further than asked: **every drill row now runs before the merge** (the add-in reports to 4100 on master, the measures run on 4101 on the branch), so no `verify:measured` row precedes the gate. "The type's width in Revit" is in the desk's words, decision 1, Risks, open question 1 and MA-4f's Next line.
- **Trust (important) — only the five numbers; the bridge's fields last.** `verifyChangeset` builds `nums` from `points`, `p95_mm`, `mean_signed_mm`, `coverage` and `share_within` at `TOLERANCES_MM`, then spreads `judge(…)` and `basis` after them; `measureRefusal` refuses any key outside the six (`elements[i] carries <key> (the verdict is the bridge's)`), coverage or a share outside 0..1 and p95 < 0. Pinned in `survey-plan.test.mjs` (a stand-in element carrying `status: "within_tolerance"` with p95 63 is refused) and end to end in `changesets-store.test.mjs` (e) (a failed row, no elements).
- **Trust (important) — a replay is refused.** `prepare()` reads the newest `verify:measured` row (`limit: 1`); a `done` row whose `job.ledger_id`, evidence shas, `applied_row`, `reverted_row` and `faces_sha256` equal this run's is a 409 "… was measured on these same inputs as ledger #n — the same bytes, seed and geometry give the same numbers; nothing was saved". The row gains `reverted_row` and `faces_sha256`; a ponytail names the version ceiling. Pinned in (c): the replay refused with no row; a Redo since, or a failed newest row, measures again. Drill V-2 presses again at once; R-3's Redo still gets its second row. Decision 11, Interfaces, Risks.
- **Trust (important) — the level error in the drill.** R-1 reads the Elevation of GR-FFL and `Scan L01 job-0002` and compares each with its storey's height in the model frame (`result.json`'s `BaseElevation` + `dz_mm` 0 = the storey's `elevation_mm`), recorded in the session notes and Task 9's `:1154` note at LANDED. Decision 15 says the drill measures it by hand; the computed level error stays MA-4h's. No code.
- **Trust (minor) — a cut `changeset_` read is a 503.** `prepare()` keeps the page and refuses when `total > rows.length` ("… has more ledger rows (n) than one read returns — an Undo in Revit could be missed"); the read's failure words now also name an earlier measure. Pinned in (c). Decision 6, Risks.
- **Trust (minor) — the job's version.** The row's `job` carries `version: row.version`; a `done` run whose service version is not the job's is failed ("the job was read by sentinel-survey X and this measure ran Y — its cloud is not known to be the job's; run the survey again — nothing it measured was kept"), its row still written. Pinned in (e). Decision 5, the Deterministic constraint, Risks.
- **Trust (minor) — a cut desk read.** Answered by the per-id `limit=1` read above: there is no cut page left to misread, and a busy report cannot take a quiet one's measure down.
- **Trust (minor) — `verify:` rows from before the reservation.** V-0 counts `verify:%` rows across the whole ledger (read-only SQL); V-5 counts again after the 4100 restart (closing the window between V-0 and the restart). Any row not the drill's is listed and stops the merge; the desk's floor is built only then.
- **Trust (minor) — the placement's provenance.** The row carries `placed_by {reported_by, reported_role}` from Revit's report; the desk head says "placed as Revit reported (by X)", plus "— the machine credential's report" for `service`. Pinned in (a) and in the desk's `verifiedView` test.

## Critique not taken

- **`placed_by.row`** — not repeated: the row already carries the same id as `applied_row` (decision 6), which the replay check compares. `placed_by` holds `reported_by` and `reported_role` only.
- **"Keep the newest row per id from one cut read"** (the alternative in the desk-read finding) — not taken; the per-id `limit=1` read is the critique's first option and leaves no cut page at all.
- **Building the desk's floor for pre-reservation `verify:` rows now** — not built: V-0 and V-5 show whether any exist; it is built only if one does (ponytail: no code for a row the ledger does not hold).

## Open questions (the founder's to decide; the defaults above are built unless overruled) — both answered 2026-10-09: the defaults stand

Decided defaults, not questions: a contributor measures, on demand (3); the route takes `{changeset}` only (4); walls only (2); the bridge judges and the service gives numbers (7, 9); the row is the record, no doc write (10, 11); cold, one process per measure (12); the pre-tick stays on the fit, as answered for MA-4d (14); drill MA4's F1 and the computed level error stay with MA-4h, the drill reads the level error by hand (15); a replay on the same inputs is refused (11).

1. **What "placed" means in MA-4e.** The default measures each placed wall **as filed** — the changeset's geometry, which the executor places exactly — with `basis: "deviation"`, `reference: "as filed"`, and the desk saying "not re-read from Revit: a wall moved since, Revit's joins, the type's width in Revit and the lead's frame are not seen" (drill R-1 checks the location line and the width once, as a gate). It runs today with no add-in change, and on the drill even though the scratch copy was never saved. Rule 6 says `verify:measured` "judges the placed element"; as filed meets that only as far as Revit keeps what it placed. Accept as filed for MA-4e, with Revit's re-read (C#, a 2021–2027 deploy, the add-in's claim) in MA-4f — or hold `verify:measured` until the add-in re-reads?
   **ANSWERED (the founder, 2026-10-09): "as filed" is accepted for MA-4e — Revit's re-read is MA-4f's.** Built as the default (decision 1).
2. **The numbers that decide a verdict.** Defaults: a wall needs at least **25%** of its faces' interior seen to be judged (a wall scanned from one side, ≈ 50%, is judged on that face; 50% would demand both faces); points count within **400 mm** of a face, read **200 mm** in from every edge; `share_within` is over those points (cloud-to-model — the reading behind design :724's 0.98 at p95 14); coverage on 200 mm cells. D7 sets the 20 mm on p95 and nothing else. Accept these as v0.1's (MA-4h tunes them on Kladno), or set another coverage minimum?
   **ANSWERED (the founder, 2026-10-09): the v0.1 numbers are kept** — within tolerance at p95 ≤ 20 mm with coverage ≥ 0.25, the 400 mm band, 200 mm edges, 200 mm cells (decisions 8 and 9; MA-4h tunes them on Kladno).
