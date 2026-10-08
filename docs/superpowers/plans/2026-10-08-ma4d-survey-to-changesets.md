# MA-4d — survey candidates to typed changesets per storey: the bridge builds them from a trusted job (MA-4c decision 11), a lead states the frame and the levels, walls trimmed and read inside or outside, typed exactly (D16), gaps grouped in the Holding Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fourth slice of MA-4 (design `docs/strategy/2026-09-30-model-automation-design.md` ▸ MA-4, :1129-1149; the MA-4c plan's Next, `docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md:2338`). A signed-in **lead** presses **Propose…** under a done survey job (Files ▸ Evidence ▸ Survey), states where the scan sits in the model (a move and a turn from the model's internal origin; all zeros when the scan is registered to it) and, optionally, which existing Revit level each scanned storey is. The bridge — never the caller — reads the job's `result.json`, trusts it only by MA-4c decision 11's predicate against its `build:run` row, checks that every scan it read is still the admitted bytes, and builds **one changeset per storey**: the storey's level (matched to the lead's name, else to a published IFC level within 20 mm, else created), each wall with its ends trimmed to the corners, read inside or outside by the office's own rule (`WallLocation`, ported), and **typed exactly** by the project's typer from `facts.thickness_mm = measured.thickness_mm` (D16: no snap, zero types created); floors and ceilings typed only if an office rule types them without a thickness. Every candidate that does not type is a **gap**: listed on its storey's changeset as "sent to a person" and grouped in ONE bridge-written `type_gap` row (claimed false, with the job id and evidence ids) for the Holding Area. Each element carries the job's `measured` block as stored, `accuracy` judged on the fit and on how far the scanned faces sit from the ghost's faces (`face_dev_mm`) against D7's 20 mm, and the bridge's `pretick`; the changeset carries `claimed: false` and the job in its own field (`job`; `source` stays the string `sentinel-survey 0.1.0` for deployed add-ins). The `changeset_proposed` and `changeset_applied` rows name the job, its row and each element's evidence and its sha; ONE planner `build:run` row closes the run. A job is proposed per candidate — what its own row already filed (proposed or placed) is never proposed twice; a scan another job placed is named, not refused — and one proposal runs at a time per project. Every `changeset_` row is reserved to the bridge (the open audit route refuses the prefix). The web desk shows the trust words; `proposal-model.mjs` draws walls at their thickness. No add-in change: deployed add-ins 2021–2027 place what is filed, and open every create unticked.

**Architecture:**
- `WebApp/bridge/wall-location.mjs` (new, pure): `locate(walls, i)` — `SentinelAddin/GhostBuilder/WallLocation.cs` ported rule for rule (the office guideline's own words: "an outside wall — one side looks out of the storey's outline").
- `WebApp/bridge/survey-plan.mjs` (new, pure): `readProposeBody`, `toModel`, `matchStoreys`, `trimEnds`, `groupGaps`, `planSurvey` — the job's candidates to per-storey changeset bodies, the bridge's trust record per element (`byCid`) and the gap groups. Deterministic.
- `WebApp/bridge/build-jobs.mjs`: `trustedJob(key, id)` — decision 11's predicate (the row job.ledger.id names, read with `getAuditEntry`; never a row matched on `new_value.job_id`; never an open-route row), `result.json` re-hashed against the ROW's sha, its cids unique, the pack id taken from the ROW.
- `WebApp/bridge/changesets-typing.mjs`: every typer refusal a candidate can earn carries `.gap {category, want, size, key, nearest}`; the words are unchanged.
- `WebApp/bridge/changesets-logic.mjs`: `validateChangeset(body, {…, job})` — an internal option no body can reach: the job's `measured`, `trim_mm`, `accuracy`, `pretick` per element, `claimed: false`, `job` on the changeset. `NO_JOB`'s words.
- `WebApp/bridge/changesets-store.mjs`: `proposeChangeset` split at the validation (`fileValidated`, shared); `proposeFromJob(key, id, body, actor)` (the route's work: one at a time per project, per candidate, a stop half way named from the store re-listed); `manifestLevels`; `reportResult` names the job on a survey changeset's `changeset_applied` row.
- `WebApp/bridge/cde-store.mjs`: `RESERVED_ACTIONS` gains the prefix `changeset_` — the rows drill MA4 and the desk read as fact are the bridge's only.
- `WebApp/bridge/holding-logic.mjs`: a group carries its run's `job_id` and its `evidence`. `WebApp/bridge/proposal-model.mjs`: thickness from `facts.thickness_mm`.
- `WebApp/bridge/bcf-service.mjs`: `POST /cde/:key/build/jobs/:id/propose` (small JSON).
- `tools/promote-check/Trust.cs`: reads the new shared fixture `fixtures/changeset-ops/contract2-survey.json` into the DEPLOYED `ChangesetDto` (the pin; no add-in source changes).
- Web: `src/setups/evidence.ts` (`proposeBody`, `proposeFromJob`, `proposeLine`, `evidenceControls.propose`), `files-panel.ts` (Propose… and its form; the gap card's job and evidence), `holding.ts` (two optional fields), `review-desk.ts` (`trustWords`, `sourceWords`).

**Tech Stack:** Node bridge (ESM `.mjs`, vitest, deps injected), TypeScript web (plain DOM), C# only in the `tools/promote-check` test project (net, reads the deployed DTO). No new npm or pip dependency, no download, **no migration, no new table** (design §6.11 :950: changesets, gaps and rows use the existing changeset store and ledger), **no add-in change, no deploy**.

**Base:** `feature/ma4d-survey-to-changesets` at master `7ca5f65`. Every file:line below was read at `7ca5f65`. The pure planner (`trimEnds`, the `locate` port against `LayerFreePlanner.cs`'s 18 cases, `matchStoreys`, `planSurvey` with the real typer over the BDS layer-free guideline and catalogue) was run in memory on this PC against the drill's own `job-0002/result.json`, and each storey body it built passed `validateChangeset` as it is at `7ca5f65`; every number pinned below comes from that run.

## Global Constraints

- House style: words are sentences; a refusal says what is needed and ends "nothing was saved" (a filing stopped half way says what WAS filed instead); comments name the slice ("MA-4d") and the reason; a `ponytail:` comment on every deliberate simplification names its ceiling and upgrade path; exact words pinned in tests. The web bump is the controller's at the merge.
- Commit messages `feat(bridge|web|tools): MA-4d - …` or `docs: MA-4d - …`, a blank line, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only on `feature/ma4d-survey-to-changesets`.
- Tests: `npx vitest run <files>` from `WebApp`; `dotnet run --project tools/promote-check` from the repo root. Never a bare `node bridge/bcf-service.mjs`. Restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with `git checkout -- bridge/fixtures/lod-matrix/ids-cases.json` if it shows as modified; never stage `WebApp/package-lock.json`. `npm run build` must build; `tsc` is not a gate (17 pre-existing errors; no new one). `contract-parity.test.mjs` stays green untouched.
- The repo is PUBLIC: fixtures use `example.test`; no real e-mail or user path in a test, fixture or doc. The drill fixture `fixtures/survey/job-0002-result.json` holds candidates and a receipt only (no path, no actor) — check before committing.
- **The trust rule (binding):** `measured`, `accuracy` (with `face_dev_mm`), `pretick`, `claimed`, `typing`, `trim_mm`, the `job` field (with its `overlaps`) and every evidence sha are stamped by the bridge; a reader shows a job id only from a row the bridge wrote (`claimed: false`). The propose body carries only `{frame, levels?}`; any other key is a 400 in words. A `POST /changesets/:key` body that names `source.job_id` or sends `measured` is still trusted for nothing (decision 2).
- **The bridge writes the ledger.** Zero types are created: exact typing (D16), a candidate that does not type is a gap; the executor never makes a type (`ChangesetExecutor.cs:155-162`).
- **No add-in change.** `SentinelAddin/` is not edited; the deployed add-ins 2021–2027 read every new field as unknown (System.Text.Json defaults) or as the type they already know. The one C# edit is the `tools/promote-check` pin (Task 10).

## Source of truth

- Design (D) at `7ca5f65` — the anchors in the MA-4c plan's Next are about 4 lines early since MA-4c Task 10: §2.1 rules 2, 3, 6 (:163-171); D16 typing (:58-60, :287, :1347); §6.3 contract v2 body :684-711, bridge-added fields :713-730 (the accuracy example :723), the typing note :732-735, trust rules :737-740, pre-tick rule :753-759; §6.6 rows: `build:run` :832, `hold:type_gap` :833, `changeset_applied` (extended) :836, `changeset_reverted` :837; type gaps in the Holding Area :841-844; §6.8 routes :874-889 (MA-4c S1 :879); §6.11 storage and roles :950-964; MA-4 :1129-1149, drill MA4 :1142-1149; D7 (20 mm) :1338. Stale inside D: :679 ("listed in `contract-parity.test.mjs`" — the changeset parity is `PLACE_KEPT`, `changesets-logic.mjs:53-56`, and the shared `fixtures/changeset-ops/*.json` held by `tools/promote-check`), :1135 (":681-705", ":728" now read :686-711 and :733) — Task 12 corrects both.
- MA-4c plan: decision 11 (:53, the predicate), decision 12 (:54, unpaired walls), decision 13 (:55, the candidate keys), S-2 (:2311, the drill building), Risks (:2324-2332), Next (:2338). MA-4a plan :53 (12b, gaps as groups), :62 (evidence-id checks; NOTICE), Next :1123.
- Code read at `7ca5f65`: `changesets-logic.mjs:41-64, 172-196, 244-434`, `changesets-store.mjs:16-29, 86-169, 175-198, 222-292`, `changesets-typing.mjs:20-97`, `build-jobs.mjs` (all), `holding-logic.mjs:85-151`, `proposal-model.mjs` (all), `cde-store.mjs:1129-1180, 1183-1191, 1256-1357, 1488-1548, 1858-1866`, `manifest-store.mjs:8-19, 86-119`, `ifc-manifest.mjs:124-131`, `evidence-store.mjs:91-117, 157-169, 316-323`, `bcf-service.mjs:1691-1700`, `members-store.mjs:145-162`, `SentinelAddin/Coordination/ChangesetClient.cs:105-230, 470-494`, `SentinelAddin/GhostBuilder/WallLocation.cs`, `ChangesetExecutor.cs:91, 124-226, 408-508`, `StoreyBatch.cs:36-58`, `tools/promote-check/Trust.cs`, `LayerFreePlanner.cs:1-90`, `fixtures/changeset-ops/contract2-trust.json`, `src/setups/{evidence,files-panel,review-desk,holding}.ts`, `demo/bds-pilot/{bds-dd-layerfree-guideline,bds-type-catalog}.json`, `%APPDATA%/Sentinel/jobs/ma4c-drill/job-0002/{job,result}.json` (read only). Review round 2 also read: `cde-store.mjs:1195-1217` (RESERVED_ACTIONS, recordAudit), `:1280-1291` (typeGapRow keeps `...v`), `:1345-1366` (recordNote), `changesets-store.mjs:295-327` (withdraw, reportReverted: a row only), `build-jobs.mjs:32-35, 48-60, 104-136`, `build-jobs.test.mjs:11-52`, `evidence-store.mjs:104-117, 202-204, 289-291`, `ledger-write.test.mjs:84-85`, `survey/pipeline.py:231-358` (pair at 5°, the centreline, the faces), the add-in's `/audit` posters (`GovernedNotify.cs`, `CommandReports.cs`, `BuildReceipt.cs`, `HealRecord.cs`; Undo → `ChangesetClient.cs:647`); `faceDev` and `trimEnds`' `to` run on job-0002's result in memory (all faces 0 mm off; `to` as pinned).

## Decisions (the founder's defaults; built on unless overruled)

| # | Decision | Default taken here |
|---|---|---|
| 1 | Who turns a job into proposals, and how | **The bridge builds the changesets itself from `result.json`, on a signed-in lead's request**: `POST /cde/:key/build/jobs/:id/propose {frame, levels?}`. The machine credential is a 403 ("needs a person"), a contributor or viewer a 403. Why a lead, not a contributor: the request carries two statements no check can verify before Revit — where the scan sits in the model and which level a storey is — and every pre-tick rests on them; the nearest precedents (attestations, a gap's dismissal, a new size, `lod_matrix`) are a lead's (design :954-964). A contributor still starts the job (MA-4c) and ticks in Revit. Why not the MCP or a script: the machine credential cannot be told from any holder of the token (`changesets-logic.mjs:42-45`), and design :896 allows no agent write beyond proposing |
| 2 | An external contract-2 `POST /changesets` naming `source.job_id` | **Still trusted for nothing.** `measured` stays ignored (`NOT_MEASURED`), `source.job_id` is listed with new words pointing at the propose route, the changeset stays `claimed: true`, nothing is pre-ticked. This closes the gap the design leaves at :739 (a job's trusted `measured` block copied onto a wall placed elsewhere) by construction — only the bridge builds a job-backed element, from the job's own geometry — and resolves the agent tension (design :739 vs :759 vs `mcp-server.mjs:102`) the same way: an agent's post is never measured. ponytail: one way in; a third-party reader whose body is bound to the job's candidates by cid (after the frame and the trims) is Next |
| 3 | The trust anchor | MA-4c decision 11, exactly (`trustedJob`): the row is the one `job.ledger.id` names, read with `getAuditEntry(key, id)` (scoped to the key's project); `entity_type` build; the action starts `build:run <the id in the path> · sentinel-survey ` and ends `· done`; `new_value.status` done; `new_value.claimed === false`; `new_value.result_sha256` equals the sha256 of `result.json` read NOW. Never a row found by `new_value.job_id`; an open-route receipt (action exactly `build:run`, claimed true) never passes; a run whose ledger write failed (no `ledger.id`) is never trusted. The result is re-checked for the contract's shape against the row's `read` (every evidence ref names an item the row says was read), and its cids must be unique (each element's trust record is bound to it by cid). The pack id is the ROW's `pack_id`, never job.json's |
| 4 | Evidence | Each element keeps the candidate's refs (`ev-0001#slice-L00`); the shas come from the accepted row's `items`, for the items in its `read`. **An item the job read must still be the admitted bytes**: in the pack the row names, not flagged `changed`, with the sha the row names — else a 409 "survey the admitted scan again" (a changed scan backs nothing). The changeset's `job.evidence` and the rows carry `[{id, sha256}]` |
| 5 | The scan-to-model frame (smallest honest v1) | **The lead's statement, per proposal:** `frame {dx_mm, dy_mm, dz_mm, rotation_deg}` — model = turn the scan point anticlockwise by `rotation_deg` about the scan's origin, then move it by (dx, dy, dz); all zeros states "registered to the internal origin" (the drill's synthetic scan). Required, never defaulted; stored on every changeset (`job.frame` with `stated_by`, the bridge's reading of the caller) and on the planner row. No artefact kind, no new field elsewhere. Its error is NOT inside the 20 mm (the bridge cannot measure it); the desk and every row name it as the lead's statement. ponytail: a per-proposal statement; a project frame artefact when several jobs share one, and a computed frame from MA-4g (the scan's CRS + the model's `IfcMapConversion`, `ifc-manifest.mjs:146-160`, or a registration report's rmse — then counted in the tolerance). A frame read from Revit's survey point would need new C# (`ActiveProjectLocation`), so it is not taken |
| 6 | Storeys to levels | A level the lead names in `levels {"<storey cid>": "<Revit level name>"}` wins: checked (±20 mm) when a live IFC manifest holds that name, else "named, its height not checked". An unnamed storey matches the ONE level name of the live IFC manifests within **20 mm** (D7) of its height in the model's frame (two names → 400 "name one"), else is **created** as `Scan <Lnn> <job-id>` (e.g. `Scan L01 job-0002`: unique per job, legal in Revit) at the scan's height. Every model with a live IFC manifest is read (federated projects: the reply names the model each match came from). ponytail: the IFC export's storey Elevation is taken in Revit's internal frame — a model exported from another base is off by its height (Risks); the lead's names win |
| 7 | Pre-tick on a storey whose level height is unchecked | Nothing on it is pre-ticked (the words say why). A created level is at the scan's height, so it is checked |
| 8 | Wall base and top | Base: the storey's level (`LevelName`, no `BaseElevation`): a level matched within 20 mm is the floor. Top: `TopElevation` absolute (the scan's top + dz): an unconnected top, faithful to the measurement, with no dependency on a level another storey's changeset creates. The DD row's `top: next_story_level` is not met (LOD 200 as found); Promote's `attach` does it later. `LocationCurve` / `LocationLoop` z = the level's elevation (the executor and `levelsOf` read it) |
| 9 | One changeset per storey | Named `Survey <job-id> · <level>` (never `promote`, never ` (i/n)`: StoreyBatch keys on Source `promote`), source `sentinel-survey <version>` (a string), contract 2, the level create first when the storey's level is created, the storey's gaps as `exceptions`. A storey with no typed element files nothing (its level is not created). Over 200 elements is a 413 — ponytail: a split needs StoreyBatch to accept the survey source for one Undo (C#), MA-4h with Kladno |
| 10 | Wall ends | **Trimmed to the corners**, in the scan's frame before the frame: an end of a paired wall moves along its own line to where it meets the nearest non-parallel (≥ 10°) paired wall's centreline, when that point is within that wall's thickness + 50 mm of the end and on that wall (extended by this one's thickness + 50 mm). The survey's centreline runs face *a*'s full length (up to half a thickness long or short, plus the fit, `pipeline.py:303-306`); trimmed ends meet, and Revit joins walls of one changeset whose ends meet. Every wall is trimmed against every paired wall, gaps included: an end trimmed to a type gap's centreline stays a free end until the gap is placed (the corner then closes), and its `reason` says so ("the start to scan-L00-wall-4's centreline: a type gap, not placed"). Recorded per element (`trim_mm [start, end]`, + = longer) and in `reason`. ponytail: end-to-centreline only — a mitre, a wall meeting two at one end, a door gap are Revit's or MA-5's (GHB-6) |
| 11 | Inside or outside | `wall-location.mjs` — `WallLocation.Locate` ported rule for rule, its 18 cases copied from `LayerFreePlanner.cs`; run on the storey's trimmed walls (an unpaired wall is a barrier of width 0). Read → `facts.params.Location`; unread → no param, the reason in the gap's key and the wall's reason. The rule the layer-free guideline already states ("one side looks out of the storey's outline") — not a guess (rule 2: a closed list, read by measuring code). ponytail: two copies of one rule (C# and JS) held by the same cases; a fixture both read when either changes again |
| 12 | Typing | Per candidate, by the project's typer (`makeTyper` over guideline@n and type_catalog@n, project → office), the same typer instance used again by `validateChangeset`: `facts {thickness_mm: measured.thickness_mm, params: {Location}}` for a wall; no facts for a floor or ceiling (typed only by a rule that names a type without `{thickness}`). Exact (D16): the bridge reads no `type_snap_mm` (0 by default; Promote alone reads it). A wall of one face seen (no thickness) is a gap without typing. No guideline or no catalogue → 409 (the whole proposal: gaps of "no standards" are not gaps) |
| 13 | Gaps | Every refusal a candidate can earn carries `.gap` from the typer. Grouped by category and the wanted type, else the size (`typeGapId`, exact sizes: no band while the snap is 0 — design :843's band is D16's), at most 50 labels (`<level> · <cid>`), nearest and evidence refs. ONE bridge-written row per proposal: entity_type `type_gap`, action `type_gap:run <job-id> · survey-planner · N group(s), M element(s)`, `{groups, source: "sentinel-survey", job {id, ledger_id, result_sha256}, guideline, catalog, claimed: false}` — distinguishable from the open route's `type_gap:run · …` (claimed true). A survey gap and a Promote gap wanting the same type are ONE group (one missing office type), shown with the newest run's source and job. Floors and ceilings of a scan: size "thickness not measured" (never closed by the catalogue: a lead dismisses, or the office adds a rule) |
| 14 | Accuracy (the 20 mm) | `TOLERANCE_MM = 20` (D7) in `survey-plan.mjs`, used for the level match and the fit: `accuracy {status, basis: "fit", from_job, fit_rmse_mm, face_dev_mm, coverage, target_mm: 20}` — `within_tolerance` when `max(fit rmse, face_dev_mm)` ≤ 20 mm, `out_of_tolerance` above, `insufficient_data` with no fit. The fit rmse is each face's inliers against that face's OWN fitted line; `pair()` accepts faces up to 5° apart and the ghost is face a's direction through the mean of the four ends (`pipeline.py:251-258`), so a 2 mm fit can hide a face ~260 mm off the ghost on a 6 m wall. `face_dev_mm` (walls; null else) closes that from `result.json` alone: the largest distance from each `geometry.faces` end to the ghost's face on its side (the untrimmed centreline offset by ± thickness / 2). The drill's faces are parallel: `face_dev_mm` 0 on every wall (computed at planning). A measured verdict (rule 6), said as such by `basis`. ponytail: the faces' ends, not their points (a bowed face is MA-4e's deviation); the fit, not deviation — MA-4e's `verify:measured` adds p95 and coverage against the placed element (`basis: "deviation"`); a `lod_matrix` field per class when the founder wants one |
| 15 | Pre-tick (the bridge's half of design :753-759) | `pretick = within_tolerance && the storey's level checked && (a level, or a wall with a measured thickness)` — every size its type decides was measured (a floor's or ceiling's thickness never is: never pre-ticked). Conflicts and BLOCK are checked in Revit at Apply (design :345). MA-2a's "a bridge-typed element is never pre-ticked" keeps holding for a POSTed body (its facts are the poster's claim); a job's facts are the measurement the bridge re-hashed |
| 16 | Pre-tick in Revit | **No add-in change.** `ChangesetTrust.PreTick` opens every create unticked whatever the bridge says (`ChangesetClient.cs:219`) — the safe direction: the pre-tick shows on the web desk; in Revit a person ticks every scan wall. The pin (Task 10) proves the deployed DTO reads the survey shape and still opens it unticked |
| 17 | `claimed` and the job field | A job-built changeset is `claimed: false` (the bridge built it; Revit shows the plain source). `job {id, ledger_id, ledger_hash, result_sha256, reader, planner, frame, storey, evidence, overlaps}` on the changeset doc (`overlaps`: decision 19). Elements carry `measured` (the job's block, verbatim), `trim_mm` (walls), `cid`, `evidence` |
| 18 | Ledger rows | `changeset_proposed` gains `job {id, ledger_id, result_sha256}`, `evidence [{id, sha256}]` and `from_job [{proposal_guid, cid, evidence}]`; `changeset_applied` (a survey changeset) gains the same, per placed ghost with its `revit_unique_id` — drill MA4's "each wall's ledger row lists its evidence sha and its job id"; the `type_gap` row (13); ONE planner row `build:run <job-id> · survey-planner 0.1.0 · proposed` (entity_type build, claimed false, model_calls 0, tokens 0, the survey row, frame, storeys, changesets, gaps, already_filed, overlaps, the standards' labels and shas) — never mistaken for the job's own row (decision 11's prefix is `· sentinel-survey `) and unforgeable through the open route (`buildRunRow` words it `build:run`). **Every `changeset_` row is reserved** (`RESERVED_ACTIONS` gains the prefix; today only `changeset_reviewed` and `changeset_reopened` are, `cde-store.mjs:1207`): the machine credential could otherwise post a `changeset_applied` row naming a job and evidence that the ledger cannot tell from the bridge's, and the desk reads those rows by entity_id (`review-desk.ts:138`). No client posts them through `/audit` (the add-in posts build, naming, family_heal and the XC-5 report types; its Undo goes to `POST /changesets/:key/:id/reverted`) — the MA-3a C5 precedent |
| 19 | Proposing a job again | **Per candidate, keyed on the job's row.** A job's changesets are those whose `job.ledger_id` is its accepted row's id (hash-chained, unique — a job id is not: a deleted jobs folder reuses `job-0002`, a second PC has its own `job-0001`). A cid on one of them that is `proposed`, `applied` or `partially_applied`, less the guids Revit rejected (`result.rejected`), is **filed**: dropped from the bodies (never proposed twice) but still trimmed against and read inside or outside against; a storey with a filed changeset keeps that changeset's `job.storey` level (`how: "filed"`, checked as recorded; a created level is not created twice). Refused (409, nothing was saved): when nothing new is left to file and the job filed before ("nothing new to propose … an applied one stays applied here after an Undo in Revit — run the survey again to propose it afresh"; `reportReverted` leaves the doc `applied`, `changesets-store.mjs:305-327`); when the frame differs from the one the job was filed with (one job is one frame); while another job's changeset is still `proposed` (both would propose the same walls). Another job's **applied** changesets that share an `{id, sha256}` with this proposal's evidence are **named, not refused** (`job.overlaps`, the 201 reply, the planner row, the desk: "the same scan ev-0001 was placed before by Survey job-0001 · GR-FFL") — an Undo cannot move a doc off applied, so a refusal there would be for ever. A job that types nothing files its gaps alone. Withdrawn or declined changesets do not count: a wrong frame is fixed by withdrawing and proposing again. One proposal at a time per project (a module `Set` held from the job read through the planner row — the evidence-store `admitting` / build-jobs `running` precedent), so a double-click or two leads cannot file one job twice. The changeset store is the authority (bridge-written since migration 0037); no flag on job.json. ponytail: creates only — a scan already placed by another job is proposed again and only named (MA-5 matches scan walls to model walls); the lock is one bridge process (a per-job unique doc key when two bridges serve one project); status from the newest `changeset_reverted` when an Undo must reopen a job |
| 20 | Budget | `takeWriteBudget("survey proposals", {perUser: 6, all: 12})` — the survey-jobs precedent |
| 21 | `proposal-model.mjs` | Thickness from `facts.thickness_mm` (the place never holds one: `Thickness` is not in `PLACE_KEPT`, so the old read could not match); the two tests that set `place.Thickness` move to `facts` |
| 22 | NOTICE | MA-7's (design §4.4 :493 ties it to web evidence; drill MA7 :1200). The office's own scans carry no third-party credits. MA-4a plan :62's assignment is closed here |
| 23 | MCP | No tool: proposing from a job is a person's (1); `sentinel_changeset_status` already lists the survey changesets |
| 24 | Web | Files ▸ Evidence ▸ Survey: **Propose…** beside Candidates for a lead (never the machine session) on a done job — a small form (the frame's four numbers, one level name per scanned storey) and one status line; the desk shows the job and trust words; the Holding Area's gap card shows the job and evidence. No poll; the desk refreshes with ↻ |
| 25 | Drill data | `ma4c-drill` (office `ma2e-office`), its job-0002 (#2201). The office has `guideline@1` = the layer-based `bds-guideline.json` and no type catalogue (MA-2e plan :1404), so the drill installs on the **project** the layer-free `guideline` (`demo/bds-pilot/bds-dd-layerfree-guideline.json`) and `type_catalog` (`demo/bds-pilot/bds-type-catalog.json`): standards, not types — the catalogue lists types the office already has (`BDS_EXT_ARC_CMU_200/300 mm`; no 250). Revit: a scratch copy of the B35 model (BDS types loaded) bound to `ma4c-drill`, frame `dx_mm 40000` to land clear of its 24 × 12 m layout |

## Scope

In: `trustedJob`; the propose route and its refusals; the planner (frame, storeys, trims, inside/outside, typing, gaps, trust records); `validateChangeset`'s `job` option; the shared filing; the `type_gap` and planner rows; the `changeset_proposed` / `changeset_applied` extensions; holding groups with job and evidence; `proposal-model.mjs` thickness; the web Propose form, desk words and gap card; the promote-check pin; the design amendments; drill MA4's rows (a)-(d) that fall here (every wall typed or in a gap group; zero types created; each wall's row lists its evidence sha and job id; storey L0 placed as one Undo in Revit 2024 and Ctrl+Z writes the reverted rows).

Out (see Next): `POST /measure`, deviation, `verify:measured`, p95 (MA-4e); the scan overlay in Revit (MA-4f); E57, LAZ, CRS, a computed frame, a registration report's rmse (MA-4g); Kladno, run time, wall F1, level error, a storey over 200 elements, size bands (MA-4h); web tiles (MA-4i); openings, mitred joins GHB-6, matching scan walls to walls already in the model (MA-5); NOTICE (MA-7); an external reader's job-backed POST; the add-in's pre-tick of measured creates.

## Interfaces

```text
Route (small JSON; behind the auth gate like every /cde/ route)
  POST /cde/:key/build/jobs/:id/propose
       {frame: {dx_mm, dy_mm (±10 000 000), dz_mm (±100 000), rotation_deg [0, 360)}, levels?: {"<storey cid>": "<Revit level name>"}}
       → 201 {job, survey_row: {id, hash}, frame,
              storeys: [{cid, level, how: named|matched|created|filed, elevation_mm, delta_mm|null, checked, from|null, changeset: id|null}],
              changesets: [{id, name, elements, preticked}], gaps: {groups, elements, ledger: {id, hash}|null},
              already_filed: n, overlaps: [{changeset, job_id, evidence: [id]}], ledger: {id, hash}}
  Refusals before anything is written, in this order (each ends "nothing was saved" — a callee's own words get it appended):
  403 the machine credential; 403 below lead; 429; 409 a survey proposal is being filed on this project; 400/404/409 the job
  (trustedJob); 400 the body; 409 an item it read changed (its pack read failing: the pack's words); 503 the changesets not read;
  409 filed with another frame; 409 another job's proposed; 409 no guideline or catalogue; 503 the published levels not read;
  400/413 the plan (a storey's validation: "<name>: …"); 409 nothing new to propose.
  Filing stopped half way (a storey, the type-gap row, the planner row): 502 naming what WAS filed, from the store listed again.

trustedJob(key, id) → {job (job.json), row: {ledger: {id, hash}, reader, version, pack_id, items: [{id, sha256}], read: [id], result_sha256}, result}

A stored survey changeset (changeset doc; the add-in's ChangesetDto reads it, unknown fields ignored)
  {name: "Survey job-0002 · GR-FFL", source: "sentinel-survey 0.1.0", contract: 2, claimed: false, status: "proposed", …,
   job: {id, ledger_id, ledger_hash, result_sha256, reader: "sentinel-survey 0.1.0", planner: "survey-planner 0.1.0",
         frame: {dx_mm, dy_mm, dz_mm, rotation_deg, stated_by}, storey: {cid, level, how, elevation_mm, delta_mm, checked, from},
         evidence: [{id, sha256}], overlaps: [{changeset, job_id, evidence: [id]}]},
   exceptions: [{unique_id: <cid>, name: "<kind> <cid>", reason: "type gap — …; it waits in the Holding Area"}],
   elements: [{op: "create", kind, cid, evidence: ["ev-0001#slice-L00"], reason, facts?, typing (bridge), place, validate,
               measured (the job's, verbatim), trim_mm? [start, end],
               accuracy {status, basis: "fit", from_job, fit_rmse_mm, face_dev_mm (walls; null else), coverage, target_mm: 20}, pretick}]}

Rows (audit(), the bridge's; the open audit route refuses every action starting changeset_)
  changeset_proposed  + {job: {id, ledger_id, result_sha256}, evidence: [{id, sha256}], from_job: [{proposal_guid, cid, evidence}]}
  changeset_applied   + {job, evidence, from_job: [{proposal_guid, revit_unique_id, cid, evidence}]}   (a survey changeset only)
  type_gap            action "type_gap:run job-0002 · survey-planner · 3 group(s), 6 element(s)",
                      {groups: [{id, category, want, size, key, elements, labels, nearest, evidence}], source, job, guideline, catalog, claimed: false}
  build               action "build:run job-0002 · survey-planner 0.1.0 · proposed",
                      {job_id, planner, version, survey_row, result_sha256, frame, storeys, changesets, gaps, already_filed, overlaps,
                       guideline, guideline_sha256, catalog, catalog_sha256, model_calls: 0, tokens: 0, claimed: false}
```

## File map

| File | Change |
|---|---|
| `WebApp/bridge/fixtures/survey/job-0002-result.json` | new — the drill's `result.json`, byte for byte (sha256 `70c9845a…`) |
| `WebApp/bridge/wall-location.mjs`, `wall-location.test.mjs` | new |
| `WebApp/bridge/survey-plan.mjs`, `survey-plan.test.mjs` | new |
| `WebApp/bridge/changesets-typing.mjs` (:65-97), `changesets-typing.test.mjs` | `.gap` on the candidate refusals; one `describe` |
| `WebApp/bridge/build-jobs.mjs` (wire :48-60; after `readJob`), `build-jobs.test.mjs` | `trustedJob`; one `describe` |
| `WebApp/bridge/changesets-logic.mjs` (:64, :244, :385-386, :414-433), `changesets-logic.test.mjs` (:694; a new `describe`) | the `job` option; `NO_JOB` |
| `WebApp/bridge/fixtures/changeset-ops/contract2-trust.json` (:23), `contract2-typed-body.json` (:31) | `NO_JOB`'s words (both hold them in `stored.ignored`; `changesets-logic.test.mjs:910-916` holds the second with `toMatchObject`, which compares array items exactly; promote-check does not read the `ignored` words) |
| `WebApp/bridge/fixtures/changeset-ops/contract2-survey.json` | new — the shared survey shape (vitest and promote-check) |
| `WebApp/bridge/changesets-store.mjs` (:9, :107-169, :283-291; new functions), `changesets-store.test.mjs` | `fileValidated`, `proposeFromJob`, `manifestLevels`; the applied row |
| `WebApp/bridge/holding-logic.mjs` (:125), `holding-logic.test.mjs` | `job_id`, `evidence` |
| `WebApp/bridge/proposal-model.mjs` (:41, :55), `proposal-model.test.mjs` (:29, :109; one test) | thickness from facts |
| `WebApp/bridge/bcf-service.mjs` (before :1691) | the route |
| `WebApp/bridge/cde-store.mjs` (:1207) | `"changeset_"` appended to `RESERVED_ACTIONS` |
| `WebApp/bridge/write-roles.test.mjs` (after :1135) | one `describe` (the route's roles; a forged `changeset_applied` refused) |
| `tools/promote-check/Trust.cs` (after :26) | the survey pin |
| `WebApp/src/setups/evidence.ts`, `evidence.test.ts` | `proposeBody`, `proposeFromJob`, `proposeLine`, `ProposeReply`, `evidenceControls.propose` |
| `WebApp/src/setups/files-panel.ts` | Propose… and its form (its button disabled while it runs); the Survey intro; the gap card |
| `WebApp/src/setups/holding.ts` (:22-30) | `job_id?`, `evidence?` |
| `WebApp/src/setups/review-desk.ts`, `review-desk.test.ts` | `DeskJob`, Ghost and PendingChangeset fields, `trustWords`, `sourceWords`, two render lines |
| `docs/strategy/2026-09-30-model-automation-design.md` | Task 12 |

---

### Task 1 — The drill's result as a fixture

**Files:** create `WebApp/bridge/fixtures/survey/job-0002-result.json`.

- [ ] **Step 1:** `New-Item -ItemType Directory -Force WebApp\bridge\fixtures\survey; Copy-Item "$env:APPDATA\Sentinel\jobs\ma4c-drill\job-0002\result.json" WebApp\bridge\fixtures\survey\job-0002-result.json` (PowerShell; the RESULT only — never `job.json`, which names a person). `certutil -hashfile WebApp\bridge\fixtures\survey\job-0002-result.json SHA256` → `70c9845a19417feb6c483674f0e1359911a46d630adb3135491d95618c0397d0`. `Select-String -Path … -Pattern '@|Users|AppData'` → nothing. 14 candidates: levels at 0 and 3000; on L00 walls 300 (y 150), 200 (y 5900), 300 (x 7850, `scan-L00-wall-3`), 250 (x 125, `scan-L00-wall-4`); on L01 the same with `wall-3` the 250 at x 125 and `wall-4` the 300 at x 7850; a floor and a ceiling per storey.
- [ ] **Step 2: commit** — `feat(bridge): MA-4d - the drill's job-0002 result as a test fixture`

### Task 2 — Bridge: inside or outside (`WallLocation` ported)

**Files:** create `WebApp/bridge/wall-location.mjs`, `WebApp/bridge/wall-location.test.mjs`.

- [ ] **Step 1: the test first** — `wall-location.test.mjs` (the cases and expectations of `tools/promote-check/LayerFreePlanner.cs:30-90`, its `Concept()` at :15-23):
```js
// MA-4d — WallLocation.Locate ported (wall-location.mjs): tools/promote-check/LayerFreePlanner.cs's cases and words, so the bridge reads a
// survey wall inside or outside exactly as Promote reads a Revit wall.
import { describe, it, expect } from "vitest";
import { locate, EXTERIOR, INTERIOR } from "./wall-location.mjs";

const Seg = (x0, y0, x1, y1, width = 200) => ({ x0, y0, x1, y1, width });
// make-concept.py's layout: a 24 x 12 m outline of eight walls, ten partitions off the corridor, two free-standing gap walls in it.
const Concept = () => {
  const s = [Seg(0, 0, 12000, 0), Seg(12000, 0, 24000, 0), Seg(24000, 0, 24000, 6000), Seg(24000, 6000, 24000, 12000),
    Seg(24000, 12000, 12000, 12000), Seg(12000, 12000, 0, 12000), Seg(0, 12000, 0, 6000), Seg(0, 6000, 0, 0)];
  for (const x of [4000, 8000, 12000, 16000, 20000]) { s.push(Seg(x, 0, x, 4500, 100)); s.push(Seg(x, 7500, x, 12000, 100)); }
  s.push(Seg(2000, 6000, 6000, 6000, 125)); s.push(Seg(18000, 6000, 22000, 6000, 125));
  return s;
};
const L = (w, i) => locate(w, i).location, W = (w, i) => locate(w, i).why;
const OVERLAP = "its sample point lies beyond another wall's centreline (overlapping walls) — a person decides";
const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);

describe("locate — WallLocation.Locate, rule for rule (MA-4d)", () => {
  it("the concept layout: eight outline walls Exterior, ten partitions and the two gap walls Interior", () => {
    const c = Concept();
    expect(range(0, 8).map((i) => L(c, i))).toEqual(Array(8).fill(EXTERIOR));
    expect(range(8, 20).map((i) => L(c, i))).toEqual(Array(12).fill(INTERIOR));
  });
  it("unknown, in the C# words: free-standing, too few walls, too short, no line", () => {
    const free = Concept(); free.push(Seg(30000, 0, 34000, 0));
    expect(W(free, 20)).toBe("both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it");
    expect(W([Seg(0, 0, 5000, 0), Seg(5000, 0, 5000, 5000), Seg(5000, 5000, 0, 5000)], 0)).toBe("only 2 other wall(s) on the storey — no outline to be inside or outside of");
    const short = Concept(); short.push(Seg(6000, 2000, 6300, 2000, 100));
    expect(W(short, 20)).toBe("300 mm long — too short to look out from (under 500 mm)");
    const none = Concept(); none.push(null);
    expect([W(none, 20), L(none, 0)]).toEqual(["no location line was read", EXTERIOR]);
  });
  it("an L and a U read every wall Exterior; a closed courtyard reads Interior (the ceiling the C# file states)", () => {
    const l = [Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 6000), Seg(12000, 6000, 6000, 6000), Seg(6000, 6000, 6000, 12000), Seg(6000, 12000, 0, 12000), Seg(0, 12000, 0, 0)];
    expect(range(0, 6).map((i) => L(l, i))).toEqual(Array(6).fill(EXTERIOR));
    const u = [Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 12000, 12000), Seg(12000, 12000, 12000, 4000),
      Seg(12000, 4000, 6000, 4000), Seg(6000, 4000, 6000, 12000), Seg(6000, 12000, 0, 12000), Seg(0, 12000, 0, 0)];
    expect(range(0, 8).map((i) => L(u, i))).toEqual(Array(8).fill(EXTERIOR));
    const o = [Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 0, 12000), Seg(0, 12000, 0, 0),
      Seg(6000, 4000, 12000, 4000), Seg(12000, 4000, 12000, 8000), Seg(12000, 8000, 6000, 8000), Seg(6000, 8000, 6000, 4000)];
    expect(range(0, 8).map((i) => L(o, i))).toEqual([...Array(4).fill(EXTERIOR), ...Array(4).fill(INTERIOR)]);
  });
  it("overlaps are a person's (C23); a lining is read past (F-MA2a-1); a wall of unknown width, an equal leaf, a 60 mm wall and a skewed one are no linings", () => {
    const thick = [Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 8000), Seg(12000, 8000, 0, 8000), Seg(0, 8000, 0, 0, 600), Seg(100, 1000, 100, 7000, 100)];
    expect([W(thick, 4), W(thick, 3), L(thick, 0), L(thick, 1), L(thick, 2)]).toEqual([OVERLAP, OVERLAP, EXTERIOR, EXTERIOR, EXTERIOR]);
    const abut = [...thick]; abut[4] = Seg(350, 1000, 350, 7000, 100);
    expect([L(abut, 4), W(abut, 3)]).toEqual([INTERIOR, OVERLAP]);
    const deep = [...thick]; deep[4] = Seg(200, 1000, 200, 7000, 100);
    expect(W(deep, 4)).toBe("its body overlaps a parallel wall's body (a wall drawn inside another) — a person decides");
    const lined = Concept(); lined.push(Seg(16520, -134, 24520, -134, 6));
    expect(range(0, 8).map((i) => L(lined, i))).toEqual(Array(8).fill(EXTERIOR));
    const finish = Concept(); finish.push(Seg(16520, -110, 24520, -110, 20)); finish.push(Seg(16520, -126, 24520, -126, 6));
    expect(L(finish, 1)).toBe(EXTERIOR);
    const thickLining = Concept(); thickLining.push(Seg(16520, -134, 24520, -134, 60));
    const leaves = Concept(); leaves[1] = Seg(12000, 0, 24000, 0, 100); leaves.push(Seg(12000, 150, 24000, 150, 100));
    const skew = Concept(); skew.push(Seg(16520, -234, 24520, 0, 6));
    const stacked = [Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 8000), Seg(12000, 8000, 0, 8000), Seg(0, 8000, 0, 0, 0), Seg(100, 1000, 100, 7000, 100)];
    expect([L(thickLining, 1), L(leaves, 1), L(leaves, 20), W(skew, 1), W(stacked, 4)]).toEqual([null, null, null, OVERLAP, OVERLAP]);
  });
});
```
Run: `npx vitest run bridge/wall-location.test.mjs` → fails (no module).
- [ ] **Step 2: the code** — `wall-location.mjs`:
```js
// MA-4d — inside or outside, read from the storey's own walls: SentinelAddin/GhostBuilder/WallLocation.cs (MA-2a, with drill MA2a's linings
// and review C23's overlaps) ported rule for rule, so a survey wall is typed by the same office rule Promote types a Revit wall by — the
// layer-free guideline's "an outside wall — one side looks out of the storey's outline". Pure 2D in millimetres; the cases are
// tools/promote-check/LayerFreePlanner.cs's (wall-location.test.mjs). The C# header says what "outside" means and the ceilings it states (a
// closed courtyard reads Interior; a ray escaping through a door gap reads that side open). Not ported: the curved-wall refusal — a survey
// wall is a straight centreline.
// ponytail: two copies of one rule held by the same cases, not by one fixture both read; a shared fixture when either changes again.
export const EXTERIOR = "Exterior", INTERIOR = "Interior";
const CLEAR_MM = 100;          // the sample points sit half the width plus this beyond each face
const MIN_LENGTH_MM = 500;     // shorter: its middle is too near its ends to look out from
const MIN_OTHERS = 3;          // fewer other walls is no outline
const TOL_MM = 1;              // a ray meets a wall within this
const LINING_MAX_MM = 50;      // a lining (a finish, a membrane drawn as a wall) is at most this thick
const PARALLEL_SIN = 0.0174524; // sin 1°

/** Wall `i` of the storey's `walls` ({x0, y0, x1, y1, width} in mm; null = a wall with no line read, skipped as a barrier) →
 *  {location: "Exterior" | "Interior" | null, why: null | the reason in words}. */
export function locate(walls, i) {
  const w = walls[i];
  if (!w) return { location: null, why: "no location line was read" };
  const others = walls.filter((x, j) => j !== i && x).length;
  if (others < MIN_OTHERS) return { location: null, why: `only ${others} other wall(s) on the storey — no outline to be inside or outside of` };
  const dx = w.x1 - w.x0, dy = w.y1 - w.y0, len = Math.hypot(dx, dy);
  if (len < MIN_LENGTH_MM) return { location: null, why: `${Math.round(len)} mm long — too short to look out from (under ${MIN_LENGTH_MM} mm)` };
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const mx = (w.x0 + w.x1) / 2, my = (w.y0 + w.y1) / 2, halfW = Math.max(0, w.width) / 2;
  const offPlus = sideOffset(walls, i, mx, my, nx, ny, ux, uy, halfW), offMinus = sideOffset(walls, i, mx, my, -nx, -ny, ux, uy, halfW);
  if (Number.isNaN(offPlus) || Number.isNaN(offMinus))
    return { location: null, why: "its sample point lies beyond another wall's centreline (overlapping walls) — a person decides" };
  if (insideAnother(walls, i, mx, my, ux, uy, halfW))
    return { location: null, why: "its body overlaps a parallel wall's body (a wall drawn inside another) — a person decides" };
  const plusOpen = open(walls, i, mx + nx * offPlus, my + ny * offPlus, nx, ny, ux, uy);
  const minusOpen = open(walls, i, mx - nx * offMinus, my - ny * offMinus, -nx, -ny, ux, uy);
  if (plusOpen !== minusOpen) return { location: EXTERIOR, why: null };
  if (!plusOpen) return { location: INTERIOR, why: null };
  return { location: null, why: "both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it" };
}

// A side is open when a ray from its sample point — away from the wall, or along the wall either way — meets no other wall.
const open = (walls, i, px, py, ax, ay, ux, uy) => !hits(walls, i, px, py, ax, ay) || !hits(walls, i, px, py, ux, uy) || !hits(walls, i, px, py, -ux, -uy);
const hits = (walls, i, px, py, dx, dy) => walls.some((s, j) => j !== i && s && rayMeets(px, py, dx, dy, s));

/** Does the ray p + t·d (t > TOL_MM) meet segment s within TOL_MM? A proper crossing, or — parallel to it — an end of it on the ray. */
function rayMeets(px, py, dx, dy, s) {
  const ex = s.x1 - s.x0, ey = s.y1 - s.y0, rx = s.x0 - px, ry = s.y0 - py, den = dx * ey - dy * ex, elen = Math.hypot(ex, ey);
  if (elen < 1e-9) return onRay(px, py, dx, dy, s.x0, s.y0);
  if (Math.abs(den) < 1e-9 * elen) return onRay(px, py, dx, dy, s.x0, s.y0) || onRay(px, py, dx, dy, s.x1, s.y1);
  const t = (rx * ey - ry * ex) / den, u = (rx * dy - ry * dx) / den, slack = TOL_MM / elen;
  return t > TOL_MM && u >= -slack && u <= 1 + slack;
}
function onRay(px, py, dx, dy, qx, qy) {
  const vx = qx - px, vy = qy - py, t = vx * dx + vy * dy;
  return t > TOL_MM && Math.abs(vx * dy - vy * dx) <= TOL_MM;
}

/** How far beyond the wall's line one side's sample point sits: half its width plus CLEAR_MM, moved past each lining its sample segment
 *  crosses; NaN when it crosses a wall that is no lining (overlapping walls, C23). */
function sideOffset(walls, i, mx, my, sx, sy, ux, uy, halfW) {
  let off = halfW + CLEAR_MM;
  for (let pass = 0; pass <= walls.length; pass++) { // each pass moves past at least one more lining, or ends
    let moved = false;
    for (let j = 0; j < walls.length; j++) {
      const o = walls[j];
      if (j === i || !o) continue;
      const t = crossT(mx, my, mx + sx * off, my + sy * off, o);
      if (Number.isNaN(t)) continue;
      const ex = o.x1 - o.x0, ey = o.y1 - o.y0, el = Math.hypot(ex, ey), d = t * off, half = Math.max(0, o.width) / 2;
      // A lining: parallel, of known width, at most LINING_MAX_MM and thinner than this wall, its body starting at or past this wall's face.
      const lining = el >= 1e-9 && Math.abs(ux * ey - uy * ex) / el <= PARALLEL_SIN && o.width > 0 && o.width <= LINING_MAX_MM
        && o.width < 2 * halfW && d - half >= halfW - TOL_MM;
      if (!lining) return NaN;
      if (d + half + CLEAR_MM > off + TOL_MM) { off = d + half + CLEAR_MM; moved = true; }
    }
    if (!moved) return off;
  }
  return NaN;
}

/** Does this wall's body overlap a parallel wall's body (of known width) where its middle is? Abutting face to face is no overlap. */
function insideAnother(walls, i, mx, my, ux, uy, halfW) {
  return walls.some((o, j) => {
    if (j === i || !o || !(o.width > 0)) return false;
    const ex = o.x1 - o.x0, ey = o.y1 - o.y0, el = Math.hypot(ex, ey);
    if (el < 1e-9 || Math.abs(ux * ey - uy * ex) / el > PARALLEL_SIN) return false;
    const along = ((mx - o.x0) * ex + (my - o.y0) * ey) / (el * el), slack = TOL_MM / el;
    if (along < -slack || along > 1 + slack) return false;
    return Math.abs((mx - o.x0) * ey - (my - o.y0) * ex) / el < halfW + o.width / 2 - TOL_MM;
  });
}

/** Where segment a→b crosses segment s, as a fraction of a→b (past a, at most b), or NaN. */
function crossT(ax, ay, bx, by, s) {
  const dx = bx - ax, dy = by - ay, ex = s.x1 - s.x0, ey = s.y1 - s.y0, rx = s.x0 - ax, ry = s.y0 - ay, den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9 * Math.sqrt((dx * dx + dy * dy) * (ex * ex + ey * ey))) return NaN;
  const t = (rx * ey - ry * ex) / den, u = (rx * dy - ry * dx) / den;
  return t > 0 && t <= 1 && u >= 0 && u <= 1 ? t : NaN;
}
```
Run → passes (all 18 C# cases ran green in memory at planning).
- [ ] **Step 3: commit** — `feat(bridge): MA-4d - WallLocation ported: a survey wall read inside or outside by the office's own rule`

### Task 3 — Bridge: the typer's refusals carry their gap

**Files:** modify `WebApp/bridge/changesets-typing.mjs` (`makeTyper`, :65-97); test `changesets-typing.test.mjs`.

- [ ] **Step 1: the test first** — append to `changesets-typing.test.mjs` (uses its `type`, `STANDARDS`, `NONE`, `makeTyper`, `core`):
```js
describe("changesets-typing — every refusal a candidate can earn carries its gap (MA-4d)", () => {
  const gapOf = (t, kind, facts) => { try { t(kind, facts, "x"); return "typed"; } catch (e) { return e.gap; } };
  it("a size the catalogue lacks: the type the rule wants, the size, the facts, the sizes the catalogue has — the words unchanged", () => {
    expect(gapOf(type, "wall", { thickness_mm: 250, params: { Location: "Exterior" } })).toEqual({ category: "Walls", want: "BDS_EXT_ARC_CMU_250 mm", size: "250 mm",
      key: "Location Exterior, 250 mm", nearest: ["BDS_EXT_ARC_CMU_100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_400 mm"] });
    refused(() => type("wall", { thickness_mm: 250, params: { Location: "Exterior" } }, "x"), /"BDS_EXT_ARC_CMU_250 mm" .* is not in type_catalog@1/);
  });
  it("no rule, or a {thickness} rule with no thickness: no type wanted — the size when sent, and the facts", () => {
    expect(gapOf(type, "wall", { thickness_mm: 250 })).toEqual({ category: "Walls", want: null, size: "250 mm", key: "250 mm", nearest: [] });
    expect(gapOf(type, "floor", null)).toEqual({ category: "Floors", want: null, size: null, key: "no facts", nearest: [] });
    expect(gapOf(type, "wall", { params: { Location: "Exterior" } })).toEqual({ category: "Walls", want: null, size: null, key: "Location Exterior", nearest: [] });
  });
  it("no guideline or no catalogue is no gap — the standards are missing, not a type", () => {
    expect(gapOf(makeTyper({ ...STANDARDS, guideline: NONE("guideline") }, core), "wall", { thickness_mm: 300 })).toBeUndefined();
    expect(gapOf(makeTyper({ ...STANDARDS, catalog: NONE("type_catalog") }, core), "wall", { thickness_mm: 300 })).toBeUndefined();
  });
  it("a typed candidate is typed (gapOf says so)", () => expect(gapOf(type, "wall", { thickness_mm: 300, params: { Location: "Exterior" } })).toBe("typed"));
});
```
- [ ] **Step 2: the code** — in `makeTyper`, after `const said = saidOf(facts);` (:76):
```js
    // MA-4d: each refusal a candidate can earn says what is missing as data too — the Holding Area groups it (survey-plan groupGaps); the
    // words stay the 400's. No guideline or no catalogue (above) carries none: the standards are missing, not a type.
    const gap = (want, nearest = []) => ({ category, want, size: facts?.thickness_mm !== undefined ? `${Math.round(facts.thickness_mm)} mm` : null, key: said, nearest });
    const no = (message, g) => Object.assign(err(400, message), { gap: g });
```
and replace the five `throw err(400, …)` after it: `none` and `default` → `throw no(…, gap(null))`; `!r.type` → `throw no(…, gap(null))`; `r.confidence < 1` → `throw no(…, gap(r.type, r.available ?? []))`; the family pair (C20) → `throw no(…, gap(`${r.family} : ${r.type}`, [...new Set(rows.map((t) => `${t.family} : ${r.type}`))]))` (a "Family : Type" want never closes by catalogue name, as it must not). The message strings are not touched. Run the file → passes; the existing typing tests stay green.
- [ ] **Step 3: commit** — `feat(bridge): MA-4d - a typing refusal carries its gap (category, want, size, facts, nearest)`

### Task 4 — Bridge: `trustedJob` (MA-4c decision 11)

**Files:** modify `WebApp/bridge/build-jobs.mjs`; test `build-jobs.test.mjs`.

- [ ] **Step 1: the test first** — `build-jobs.test.mjs`: import `trustedJob`; append (uses the file's `root`, `RESULT`, `sha` and its `deps()`, which is built when each test runs — after `beforeEach` set `root` — so `jobsRoot` is the temp folder, never `%APPDATA%\Sentinel\jobs`; `deps()` injects `requireMinRole`, `audit`, `runSurvey` and `notSetUp`, so `wire` imports no store):
```js
describe("trustedJob (MA-4d) — decision 11: the row job.ledger.id names, the job's own, re-hashed now; never by new_value.job_id", () => {
  const BYTES = Buffer.from(JSON.stringify(RESULT)), SHA = sha(BYTES), H = "13".repeat(32);
  const ROW = (over = {}, v = {}) => ({ id: 2201, hash: H, entity_type: "build", action: "build:run job-0001 · sentinel-survey 0.1.0 · done", ...over,
    new_value: { job_id: "job-0001", reader: "sentinel-survey", version: "0.1.0", status: "done", pack_id: "evp-0001", items: [{ id: "ev-0001", sha256: "1".repeat(64) }], read: ["ev-0001"], result_sha256: SHA, claimed: false, ...v } });
  const lay = (rec = {}, bytes = BYTES) => {
    const dir = join(root, "demo", "job-0001");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "result.json"), bytes);
    writeFileSync(join(dir, "job.json"), JSON.stringify({ id: "job-0001", project: "demo", status: "done", pack_id: "evp-0001", result_sha256: SHA, ledger: { id: 2201, hash: H }, ...rec }));
  };
  // deps() per call (review): the file's root is set in beforeEach, after this describe is collected. The caller (proposeFromJob) checks the role.
  const trust = (row) => trustedJob("demo", "job-0001", deps({ getAuditEntry: async (key, id) => (key === "demo" && id === 2201 ? row : null) }));
  const untrusted = (why) => ({ status: 409, message: `job-0001's result is not trusted: ${why} — run the survey again; nothing was saved` });
  const NOT_OWN = "ledger #2201 is not job-0001's own build:run row (the bridge's: build:run job-0001 · sentinel-survey … · done, claimed false)";
  const CHANGED = "its result.json does not hash to the sha256 on ledger #2201 — it changed after the job";

  it("(a) the job's own row: the result, the row's pack, items and read, its id and hash — the pack id is the ROW's, not job.json's", async () => {
    lay({ pack_id: "evp-9999" });
    const t = await trust(ROW());
    expect(t.row).toEqual({ ledger: { id: 2201, hash: H }, reader: "sentinel-survey", version: "0.1.0", pack_id: "evp-0001", items: [{ id: "ev-0001", sha256: "1".repeat(64) }], read: ["ev-0001"], result_sha256: SHA });
    expect(t.result.candidates).toHaveLength(2);
  });
  it("(b) never trusted: an open-route receipt, another job's row that names this job in new_value.job_id, a failed action, a failed status, a claimed row, another type, no row", async () => {
    lay();
    for (const row of [ROW({ action: "build:run" }, { claimed: true }), ROW({ action: "build:run job-0002 · sentinel-survey 0.1.0 · done" }),
      ROW({ action: "build:run job-0001 · sentinel-survey 0.1.0 · failed" }), ROW({}, { status: "failed" }), // each check alone (review)
      ROW({}, { claimed: true }), ROW({ entity_type: "event" }), null])
      await expect(trust(row)).rejects.toMatchObject(untrusted(NOT_OWN));
    await expect(trust(ROW({}, { result_sha256: "f".repeat(64) }))).rejects.toMatchObject(untrusted(CHANGED));
  });
  it("(c) a result.json edited after the job — with job.json's own sha edited to match — is not trusted; nor a run whose row was never written; nor one cid twice", async () => {
    const edited = Buffer.from(JSON.stringify({ ...RESULT, candidates: RESULT.candidates.map((c) => ({ ...c, measured: { ...c.measured, thickness_mm: 250 } })) }));
    lay({ result_sha256: sha(edited) }, edited);
    await expect(trust(ROW())).rejects.toMatchObject(untrusted(CHANGED));
    lay({ ledger: { id: null, hash: null } });
    await expect(trust(ROW())).rejects.toMatchObject(untrusted("its build:run row was never written (the ledger write failed when it ran)"));
    // each element's trust record is bound to it by cid: a cid twice would stamp one candidate's measurement on another's geometry
    const twice = Buffer.from(JSON.stringify({ ...RESULT, candidates: [...RESULT.candidates, RESULT.candidates[1]] }));
    lay({ result_sha256: sha(twice) }, twice);
    await expect(trust(ROW({}, { result_sha256: sha(twice) }))).rejects.toMatchObject(untrusted("its result names one cid twice"));
  });
  it("(d) a job that is not there, not done, or not named job-NNNN", async () => {
    await expect(trust(ROW())).rejects.toMatchObject({ status: 404, message: "no survey job job-0001 on demo — nothing was saved" });
    lay({ status: "failed" });
    await expect(trust(ROW())).rejects.toMatchObject({ status: 409, message: "job-0001 is failed — only a done survey job is proposed; nothing was saved" });
    await expect(trustedJob("demo", "nope", deps())).rejects.toMatchObject({ status: 400, message: "a survey job is named job-NNNN — nothing was saved" });
  });
});
```
- [ ] **Step 2: the code** — in `wire` (:48-60) add `getAuditEntry: deps.getAuditEntry || (async (k, n) => (await import("./cde-store.mjs")).getAuditEntry(k, n)),` (lazy: the existing tests inject `audit` only). After `readJob`:
```js
/** MA-4d (MA-4c decision 11): a done survey job whose result the bridge may build changesets from — anchored on the hash-chained row, never on
 *  job.json alone (editable on the PC). The row is the one job.ledger.id names, read for THIS project (getAuditEntry is scoped to the key), and
 *  must be the job's own: entity_type build, an action that starts `build:run <the id in the path> · sentinel-survey ` and ends `· done`,
 *  new_value.status done and new_value.claimed === false (an open-route receipt is action exactly build:run, claimed true: never), and its
 *  result_sha256 the sha256 of result.json read now. A row is never found by new_value.job_id. The result is held to the contract's shape over
 *  what the row says was read (every evidence ref names a read item), its cids unique. → {job, row: {ledger, reader, version, pack_id, items, read, result_sha256}, result},
 *  or a 400/404/409 in words. The caller checks the role (proposeFromJob: a signed-in lead). */
export async function trustedJob(key, id, deps = {}) {
  const d = await wire(deps);
  if (!JOB_ID.test(String(id))) throw err(400, "a survey job is named job-NNNN — nothing was saved");
  const dir = join(projectDir(d.root, key), id);
  const job = readRecord(dir, key, id);
  if (!job) throw err(404, `no survey job ${id} on ${key} — nothing was saved`);
  if (job.status !== "done") throw err(409, `${id} is ${job.status} — only a done survey job is proposed; nothing was saved`);
  const untrusted = (why) => err(409, `${id}'s result is not trusted: ${why} — run the survey again; nothing was saved`);
  const rowId = job.ledger?.id;
  if (!Number.isInteger(rowId)) throw untrusted("its build:run row was never written (the ledger write failed when it ran)");
  const row = await d.getAuditEntry(key, rowId);
  const v = row?.new_value ?? {};
  if (!row || row.entity_type !== "build" || !String(row.action).startsWith(`build:run ${id} · ${READER} `) || !String(row.action).endsWith(" · done")
    || v.status !== "done" || v.claimed !== false || typeof v.result_sha256 !== "string")
    throw untrusted(`ledger #${rowId} is not ${id}'s own build:run row (the bridge's: build:run ${id} · ${READER} … · done, claimed false)`);
  let bytes;
  try { bytes = readFileSync(join(dir, "result.json")); } catch { throw untrusted("its result.json is missing"); }
  if (sha(bytes) !== v.result_sha256) throw untrusted(`its result.json does not hash to the sha256 on ledger #${rowId} — it changed after the job`);
  const result = JSON.parse(bytes);
  const items = Array.isArray(v.items) ? v.items : [], read = Array.isArray(v.read) ? v.read : [];
  const bad = resultRefusal(result, read);
  if (bad) throw untrusted(`its result is not the contract's shape over what ledger #${rowId} says was read (${bad})`);
  // Each element's trust record is bound to it by cid (survey-plan byCid): one cid twice would carry a measurement onto other geometry.
  const cids = result.candidates.map((c) => c.cid);
  if (new Set(cids).size !== cids.length) throw untrusted("its result names one cid twice");
  // The pack is the ROW's (buildRunValue writes pack_id), never job.json's: the hash-chained row is the anchor.
  return { job, row: { ledger: { id: row.id, hash: row.hash ?? null }, reader: v.reader ?? READER, version: v.version ?? null, pack_id: v.pack_id ?? null,
    items, read, result_sha256: v.result_sha256 }, result };
}
```
Also reword `readJob`'s doc comment tail: "MA-4d's trust check is `trustedJob`, against the build:run row". Run `npx vitest run bridge/build-jobs.test.mjs` → passes.
- [ ] **Step 3: commit** — `feat(bridge): MA-4d - trustedJob: a survey job's result trusted only by its own build:run row (decision 11)`

### Task 5 — Bridge: the planner (`survey-plan.mjs`)

**Files:** create `WebApp/bridge/survey-plan.mjs`, `WebApp/bridge/survey-plan.test.mjs`.

- [ ] **Step 1: the test first** — `survey-plan.test.mjs`:
```js
// MA-4d — the pure half of proposing from a survey job, on the drill's own job-0002 result (fixtures/survey/job-0002-result.json: the synthetic
// two-storey building, walls 300/200/300/250 mm) and the real typer over the BDS layer-free guideline and catalogue.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { validateChangeset } from "./changesets-logic.mjs";
import { typeGapId } from "./holding-logic.mjs";
import { readProposeBody, toModel, matchStoreys, trimEnds, planSurvey } from "./survey-plan.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const RESULT = read("./fixtures/survey/job-0002-result.json");
const type = makeTyper({
  guideline: { body: read("../../demo/bds-pilot/bds-dd-layerfree-guideline.json"), label: "guideline@1 · project · 0123456789ab…", sha256: "ab".repeat(32) },
  catalog: { body: read("../../demo/bds-pilot/bds-type-catalog.json"), label: "type_catalog@1 · project · fedcba987654…", sha256: "cd".repeat(32) } }, core);
const JOB = { id: "job-0002", ledger: { id: 2201, hash: "13".repeat(32) }, reader: "sentinel-survey", version: "0.1.0" };
const ZERO = { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 }, EAST = { ...ZERO, dx_mm: 40000 };
const LEVELS = ["scan-L00-level", "scan-L01-level"];
const LV = RESULT.candidates.filter((c) => c.kind === "level");
const no = (fn, status, message) => { try { fn(); } catch (e) { expect([e.status, e.message]).toEqual([status, message]); return; } throw new Error("no throw"); };

describe("readProposeBody — the lead states two things; the bridge builds the rest", () => {
  it("a frame of four numbers and the levels the lead names, trimmed", () => {
    expect(readProposeBody({ frame: EAST, levels: { "scan-L00-level": " GR-FFL " } }, LEVELS)).toEqual({ frame: EAST, levels: { "scan-L00-level": "GR-FFL" } });
    expect(readProposeBody({ frame: ZERO }, LEVELS)).toEqual({ frame: ZERO, levels: {} });
  });
  it("anything else is refused in words, never dropped", () => {
    no(() => readProposeBody({ frame: ZERO, measured: {} }, LEVELS), 400, "measured is not a proposal field — the bridge builds every changeset from the job's own result; send {frame, levels?} — nothing was saved");
    no(() => readProposeBody({}, LEVELS), 400, "frame is required — where the scan sits in the model: {dx_mm, dy_mm, dz_mm, rotation_deg}, the move and turn from the model's internal origin to the scan's origin ({0, 0, 0, 0} when the scan is registered to the internal origin) — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, scale: 1 } }, LEVELS), 400, "frame.scale is not read — a frame is {dx_mm, dy_mm, dz_mm, rotation_deg} — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, dx_mm: 2e7 } }, LEVELS), 400, "frame.dx_mm must be a number of mm within ±10000000 (a scan in a national grid is read with its CRS from MA-4g) — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, dy_mm: "0" } }, LEVELS), 400, "frame.dy_mm must be a number of mm within ±10000000 (a scan in a national grid is read with its CRS from MA-4g) — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, rotation_deg: 360 } }, LEVELS), 400, "frame.rotation_deg must be degrees from 0 up to (not including) 360, anticlockwise in plan — nothing was saved");
    no(() => readProposeBody({ frame: ZERO, levels: { "scan-L09-level": "L09" } }, LEVELS), 400, "levels names scan-L09-level, which is not a storey of this job (scan-L00-level, scan-L01-level) — nothing was saved");
    no(() => readProposeBody({ frame: ZERO, levels: { "scan-L00-level": "GR:FFL" } }, LEVELS), 400, "levels.scan-L00-level must be a Revit level's name — one line of at most 256 characters, without \\ : { } [ ] | ; < > ? ` ~ — nothing was saved");
    no(() => readProposeBody({ frame: ZERO, levels: { "scan-L00-level": "GR-FFL", "scan-L01-level": "gr-ffl" } }, LEVELS), 400, "levels names gr-ffl for both scan-L00-level and scan-L01-level — a level is one storey — nothing was saved");
  });
});

describe("toModel — turned anticlockwise about the scan's origin, then moved; 0.1 mm", () => {
  it("zeros are the identity; 90° and a move", () => {
    expect([toModel(ZERO).xy([125, 150]), toModel(ZERO).z(3000)]).toEqual([[125, 150], 3000]);
    const m = toModel({ dx_mm: 1000, dy_mm: 2000, dz_mm: -50, rotation_deg: 90 });
    expect([m.xy([125, 150]), m.z(3000)]).toEqual([[850, 2125], 2950]);
  });
});

describe("matchStoreys — the lead's level, else one published level within 20 mm, else a new one", () => {
  const PUB = [{ name: "GR-FFL", elevation_mm: 0, from: "ARC.ifc P01" }, { name: "01-FFL", elevation_mm: 3012, from: "ARC.ifc P01" }];
  it("named (checked only when a published model holds it), matched, created — lowest first", () => {
    expect(matchStoreys(LV, ZERO, { "scan-L00-level": "GR-FFL" }, [], "job-0002")).toEqual([
      { cid: "scan-L00-level", scan_mm: 0, level: "GR-FFL", how: "named", elevation_mm: 0, delta_mm: null, checked: false, from: null },
      { cid: "scan-L01-level", scan_mm: 3000, level: "Scan L01 job-0002", how: "created", elevation_mm: 3000, delta_mm: 0, checked: true, from: null }]);
    expect(matchStoreys(LV, ZERO, {}, PUB, "job-0002").map((s) => [s.level, s.how, s.delta_mm, s.checked])).toEqual([["GR-FFL", "matched", 0, true], ["01-FFL", "matched", 12, true]]);
    expect(matchStoreys(LV, ZERO, { "scan-L01-level": "01-FFL" }, PUB, "job-0002")[1]).toMatchObject({ level: "01-FFL", how: "named", elevation_mm: 3012, delta_mm: 12, checked: true });
    expect(matchStoreys(LV, { ...ZERO, dz_mm: 3300 }, {}, PUB, "job-0002").map((s) => [s.level, s.elevation_mm])).toEqual([["Scan L00 job-0002", 3300], ["Scan L01 job-0002", 6300]]);
  });
  it("refused in words: a named level too far, two published levels at one height, two storeys on one level", () => {
    no(() => matchStoreys(LV, ZERO, { "scan-L01-level": "01-FFL" }, [{ name: "01-FFL", elevation_mm: 3300, from: "ARC.ifc P01" }], "job-0002"), 400,
      "01-FFL is at 3300 mm in ARC.ifc P01 and the scan's storey scan-L01-level at 3000 mm in the model's frame — 300 mm apart, more than the 20 mm a match allows (D7); name the level at that height, or leave the storey out of levels to have it created — nothing was saved");
    no(() => matchStoreys(LV, ZERO, {}, [{ name: "L00", elevation_mm: 5, from: "ARC.ifc" }, { name: "B00", elevation_mm: -10, from: "STR.ifc" }], "job-0002"), 400,
      "the published models have L00 and B00 within 20 mm of the scan's storey scan-L00-level (0 mm in the model's frame) — name one in levels — nothing was saved");
    no(() => matchStoreys(LV, ZERO, { "scan-L01-level": "Scan L00 job-0002" }, [], "job-0002"), 400,
      "the storeys scan-L00-level and scan-L01-level would both be Scan L00 job-0002 — name each in levels — nothing was saved");
  });
  it("decision 19: a storey this job filed keeps its level (never created twice); naming another for it is refused", () => {
    const FILED = new Map([["scan-L01-level", { cid: "scan-L01-level", level: "Scan L01 job-0002", how: "created", elevation_mm: 3000, delta_mm: 0, checked: true, from: null }]]);
    expect(matchStoreys(LV, ZERO, {}, [], "job-0002", FILED)[1]).toEqual({ cid: "scan-L01-level", scan_mm: 3000, level: "Scan L01 job-0002", how: "filed", elevation_mm: 3000, delta_mm: 0, checked: true, from: null });
    no(() => matchStoreys(LV, ZERO, { "scan-L01-level": "01-FFL" }, [], "job-0002", FILED), 400,
      "scan-L01-level was filed on Scan L01 job-0002 — leave it out of levels, or run the survey again to propose it afresh — nothing was saved");
  });
});

describe("trimEnds — every end to where the centrelines meet", () => {
  const S = (x0, y0, x1, y1, width) => ({ start: [x0, y0, 0], end: [x1, y1, 0], width });
  it("the drill's L00 corners (the survey's centrelines run face a's full length)", () => {
    const walls = RESULT.candidates.filter((c) => c.kind === "wall" && c.geometry.storey === "scan-L00-level")
      .map((c) => ({ start: c.geometry.LocationCurve.start, end: c.geometry.LocationCurve.end, width: c.measured.thickness_mm }));
    expect(trimEnds(walls)).toEqual([ // `to`: the wall each end was trimmed to (an index into walls), so a reason can name a gap's
      { start: [125, 150, 0], end: [7850, 150, 0], trim_mm: [-140, -136], to: [3, 2] }, { start: [125, 5900, 0], end: [7850, 5900, 0], trim_mm: [-139, -137], to: [3, 2] },
      { start: [7850, 150, 0], end: [7850, 5900, 0], trim_mm: [-99, -97], to: [0, 1] }, { start: [125, 150, 0], end: [125, 5900, 0], trim_mm: [-85, -89], to: [0, 1] }]);
  });
  it("a T: an end short of a wall is lengthened to its centreline; a free end, a parallel wall and a wall of one face seen are left as measured", () => {
    const t = trimEnds([S(0, 0, 5000, 0, 200), S(5100, -2000, 5100, 3000, 0), S(0, 300, 5000, 300, 200), S(2500, 450, 2500, 4000, 100)]);
    expect(t.map((w) => [w.trim_mm, w.to])).toEqual([[[0, 0], [null, null]], [[0, 0], [null, null]], [[0, 0], [null, null]], [[150, 0], [2, null]]]);
    expect(t[3].start).toEqual([2500, 300, 0]);
  });
});

describe("planSurvey — the drill's job-0002, frame 40 m east, L00 named GR-FFL (no published IFC)", () => {
  const plan = () => planSurvey({ job: JOB, candidates: RESULT.candidates, frame: EAST, levels: { "scan-L00-level": "GR-FFL" }, manifest: [], type });
  it("one body per storey: GR-FFL's three typed walls, unchecked (nothing pre-ticked); L01's new level and three walls, pre-ticked", () => {
    const p = plan();
    const [a, b] = p.storeys;
    expect(a.body.name).toBe("Survey job-0002 · GR-FFL");
    expect(a.body.elements.map((e) => [e.cid, e.kind, e.facts?.thickness_mm, e.place.LocationCurve])).toEqual([
      ["scan-L00-wall-1", "wall", 300, { start: [40125, 150, 0], end: [47850, 150, 0] }],
      ["scan-L00-wall-2", "wall", 200, { start: [40125, 5900, 0], end: [47850, 5900, 0] }],
      ["scan-L00-wall-3", "wall", 300, { start: [47850, 150, 0], end: [47850, 5900, 0] }]]);
    expect(a.body.elements[0]).toMatchObject({ op: "create", facts: { params: { Location: "Exterior" } }, place: { LevelName: "GR-FFL", TopElevation: 2800 },
      reason: "scan wall scan-L00-wall-1: 300 mm thick, 2800 mm high, 8001 mm long as measured · fit 2 mm rms · Location Exterior · ends -140 / -136 mm to the corners (the start to scan-L00-wall-4's centreline: a type gap, not placed) · job-0002 (ledger #2201)" });
    expect(a.body.elements[2].reason).toContain(" · ends -99 / -97 mm to the corners · "); // wall-3 meets two placed walls: nothing to say
    expect([...a.byCid.values()].map((t) => [t.pretick, t.accuracy.status])).toEqual(Array(3).fill([false, "within_tolerance"]));
    expect(a.body.exceptions.map((x) => x.unique_id)).toEqual(["scan-L00-wall-4", "scan-L00-floor", "scan-L00-ceiling"]);
    expect(a.body.exceptions[0].reason).toBe("type gap — BDS_EXT_ARC_CMU_250 mm is not in the type catalogue; it waits in the Holding Area");
    expect(b.body.name).toBe("Survey job-0002 · Scan L01 job-0002");
    expect(b.body.elements[0]).toEqual({ op: "create", kind: "level", cid: "scan-L01-level", evidence: ["ev-0001#floor-L01"],
      validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: "Scan L01 job-0002" } }, place: { BaseElevation: 3000, Name: "Scan L01 job-0002" },
      reason: "scan storey scan-L01-level at 3000 mm (fit 3.4 mm rms) · a new level at 3000 mm in the model · job-0002 (ledger #2201)" });
    expect(b.body.elements.map((e) => e.cid)).toEqual(["scan-L01-level", "scan-L01-wall-1", "scan-L01-wall-2", "scan-L01-wall-4"]);
    expect([...b.byCid.values()].every((t) => t.pretick)).toBe(true);
    expect(b.byCid.get("scan-L01-wall-1")).toMatchObject({ measured: { thickness_mm: 300 }, trim_mm: [-148, -130],
      accuracy: { status: "within_tolerance", basis: "fit", from_job: "job-0002", fit_rmse_mm: 1.8, face_dev_mm: 0, coverage: 1, target_mm: 20 } });
    expect(b.byCid.get("scan-L01-level").accuracy.face_dev_mm).toBeNull();
  });
  it("the 20 mm: a fit over it, no fit, or a face turned 3° off the ghost (each face on its own line within 2 mm) is never pre-ticked", () => {
    // pair() accepts faces up to 5° apart and the fit is each face against its OWN line: face_dev_mm measures them against the ghost's faces.
    const off = RESULT.candidates.map((c) => (c.cid === "scan-L01-wall-1" ? { ...c, geometry: { ...c.geometry, faces: [c.geometry.faces[0], [253, 106, 7661, 494]] } }
      : c.cid === "scan-L01-wall-2" ? { ...c, fit: { ...c.fit, rmse_mm: 25 } } : c.cid === "scan-L01-wall-4" ? { ...c, fit: undefined } : c));
    const b = planSurvey({ job: JOB, candidates: off, frame: EAST, levels: { "scan-L00-level": "GR-FFL" }, manifest: [], type }).storeys[1].byCid;
    expect(["scan-L01-wall-1", "scan-L01-wall-2", "scan-L01-wall-4"].map((cid) => { const t = b.get(cid); return [t.pretick, t.accuracy.status, t.accuracy.fit_rmse_mm, t.accuracy.face_dev_mm]; }))
      .toEqual([[false, "out_of_tolerance", 1.8, 194], [false, "out_of_tolerance", 25, 0], [false, "insufficient_data", null, 0]]);
    expect(b.get("scan-L01-level").pretick).toBe(true);
  });
  it("every body is a changeset the bridge stores as it is (validateChangeset, the same typer)", () => {
    for (const s of plan().storeys) expect(validateChangeset(s.body, { member: true, type }).elements).toHaveLength(s.body.elements.length);
  });
  it("the gaps: the 250 mm walls want a type the catalogue lacks; scan floors and ceilings have no office rule — one group each, with the evidence", () => {
    const want = { category: "Walls", want: "BDS_EXT_ARC_CMU_250 mm", size: "250 mm" };
    expect(plan().groups).toEqual([
      { id: typeGapId(want), ...want, key: "Location Exterior, 250 mm", elements: 2, labels: ["GR-FFL · scan-L00-wall-4", "Scan L01 job-0002 · scan-L01-wall-3"],
        nearest: ["BDS_EXT_ARC_CMU_100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_400 mm"], evidence: ["ev-0001#slice-L00", "ev-0001#slice-L01"] },
      { id: typeGapId({ category: "Floors", size: "thickness not measured" }), category: "Floors", want: null, size: "thickness not measured", key: "no facts", elements: 2,
        labels: ["GR-FFL · scan-L00-floor", "Scan L01 job-0002 · scan-L01-floor"], nearest: [], evidence: ["ev-0001#floor-L00", "ev-0001#floor-L01"] },
      { id: typeGapId({ category: "Ceilings", size: "thickness not measured" }), category: "Ceilings", want: null, size: "thickness not measured", key: "no facts", elements: 2,
        labels: ["GR-FFL · scan-L00-ceiling", "Scan L01 job-0002 · scan-L01-ceiling"], nearest: [], evidence: ["ev-0001#ceiling-L00", "ev-0001#ceiling-L01"] }]);
  });
  it("deterministic; a turned frame and a published GR-FFL: the storey matched and pre-ticked", () => {
    expect(JSON.stringify(plan(), (k, v) => (v instanceof Map ? [...v] : v))).toBe(JSON.stringify(plan(), (k, v) => (v instanceof Map ? [...v] : v)));
    const p = planSurvey({ job: JOB, candidates: RESULT.candidates, frame: { dx_mm: 1000, dy_mm: 2000, dz_mm: 0, rotation_deg: 90 }, levels: {},
      manifest: [{ name: "GR-FFL", elevation_mm: 0, from: "ARC.ifc P01" }], type });
    expect(p.storeys[0].storey).toMatchObject({ level: "GR-FFL", how: "matched", checked: true, from: "ARC.ifc P01" });
    expect(p.storeys[0].body.elements[0].place.LocationCurve).toEqual({ start: [850, 2125, 0], end: [850, 9850, 0] });
    expect([...p.storeys[0].byCid.values()].every((t) => t.pretick)).toBe(true);
  });
  it("a wall of one face seen is a gap without typing; a storey of only gaps files nothing (its level is not created)", () => {
    const one = RESULT.candidates.map((c) => (c.cid === "scan-L00-wall-1" ? { ...c, measured: { length_mm: 8001, height_mm: 2800 } } : c));
    const p = planSurvey({ job: JOB, candidates: one, frame: ZERO, levels: {}, manifest: [], type });
    expect(p.groups.find((g) => g.labels.includes("Scan L00 job-0002 · scan-L00-wall-1"))).toMatchObject({ category: "Walls", want: null, size: "thickness not measured", key: "one face seen" });
    const bare = RESULT.candidates.filter((c) => c.kind === "level" || c.kind === "floor");
    expect(planSurvey({ job: JOB, candidates: bare, frame: ZERO, levels: {}, manifest: [], type }).storeys.map((s) => s.body)).toEqual([null, null]);
  });
});
```
- [ ] **Step 2: the code** — `survey-plan.mjs`:
```js
// MA-4d — survey candidates to changesets, the pure half (design §6.3, §6.6, §6.7; plan docs/superpowers/plans/2026-10-08-ma4d-survey-to-changesets.md).
// A done sentinel-survey job whose result the bridge trusts (build-jobs trustedJob: MA-4c decision 11) becomes, per storey, ONE changeset of
// creates the bridge builds itself from result.json — never a body's geometry or measurement. The lead states two things: where the scan
// sits in the model (frame) and, optionally, which existing level a storey is (levels). Walls are trimmed to their corners, read inside or
// outside (wall-location.mjs, the office's own rule) and typed exactly (D16) by the project's typer; a candidate that does not type is a
// gap — grouped for the Holding Area and listed on its storey's changeset as an exception. Pure and deterministic: the same job, frame,
// levels, published levels and standards give the same bodies (the proposal_guids are validateChangeset's).
import { MAX_CHANGESET_ELEMENTS } from "./changesets-logic.mjs";
import { KIND_ENTITY } from "./changesets-typing.mjs";
import { typeGapId } from "./holding-logic.mjs";
import { locate } from "./wall-location.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const bad = (m) => err(400, `${m} — nothing was saved`);
export const PLANNER = "survey-planner";
export const PLANNER_VERSION = "0.1.0";
/** D7: the pre-tick tolerance (on the fit) and the level match's.
 *  ponytail: one constant for both; a lod_matrix field per class when the founder wants one — MA-4e then judges p95 deviation against it. */
export const TOLERANCE_MM = 20;
export const NOT_MEASURED = "thickness not measured";
const MAX_XY_MM = 10_000_000; // 10 km: a scan farther from the internal origin is in a national grid — its CRS is read from MA-4g
const MAX_Z_MM = 100_000;
const FRAME = ["dx_mm", "dy_mm", "dz_mm", "rotation_deg"];
const REVIT_BAD = /[\\:{}[\]|;<>?`~\u0000-\u001f]/; // what Revit refuses in a name
const r1 = (v) => Math.round(v * 10) / 10 || 0; // 0.1 mm, never -0

/** POST …/propose's body → {frame, levels}, or a 400 in words. `levelCids`: the job's storeys. Only the lead's two statements are read;
 *  anything else (a geometry, a measurement, a trust field, a job id) is refused, never dropped — the bridge builds the rest. */
export function readProposeBody(b, levelCids) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("the body is {frame, levels?}");
  for (const k of Object.keys(b))
    if (k !== "frame" && k !== "levels") throw bad(`${k.slice(0, 64)} is not a proposal field — the bridge builds every changeset from the job's own result; send {frame, levels?}`);
  const f = b.frame;
  if (!f || typeof f !== "object" || Array.isArray(f))
    throw bad("frame is required — where the scan sits in the model: {dx_mm, dy_mm, dz_mm, rotation_deg}, the move and turn from the model's internal origin to the scan's origin ({0, 0, 0, 0} when the scan is registered to the internal origin)");
  for (const k of Object.keys(f)) if (!FRAME.includes(k)) throw bad(`frame.${k.slice(0, 64)} is not read — a frame is {dx_mm, dy_mm, dz_mm, rotation_deg}`);
  for (const [k, max] of [["dx_mm", MAX_XY_MM], ["dy_mm", MAX_XY_MM], ["dz_mm", MAX_Z_MM]])
    if (!Number.isFinite(f[k]) || Math.abs(f[k]) > max) throw bad(`frame.${k} must be a number of mm within ±${max} (a scan in a national grid is read with its CRS from MA-4g)`);
  if (!Number.isFinite(f.rotation_deg) || f.rotation_deg < 0 || f.rotation_deg >= 360)
    throw bad("frame.rotation_deg must be degrees from 0 up to (not including) 360, anticlockwise in plan");
  const levels = {}, used = new Map();
  if (b.levels != null) {
    if (typeof b.levels !== "object" || Array.isArray(b.levels)) throw bad('levels is {"<storey cid>": "<an existing Revit level\'s name>"}');
    for (const [cid, name] of Object.entries(b.levels)) {
      if (!levelCids.includes(cid)) throw bad(`levels names ${cid.slice(0, 64)}, which is not a storey of this job (${levelCids.join(", ")})`);
      if (typeof name !== "string" || !name.trim() || name.length > 256 || REVIT_BAD.test(name))
        throw bad(`levels.${cid} must be a Revit level's name — one line of at most 256 characters, without \\ : { } [ ] | ; < > ? \` ~`);
      const k = name.trim().toLowerCase();
      if (used.has(k)) throw bad(`levels names ${name.trim()} for both ${used.get(k)} and ${cid} — a level is one storey`);
      used.set(k, cid);
      levels[cid] = name.trim();
    }
  }
  return { frame: { dx_mm: f.dx_mm, dy_mm: f.dy_mm, dz_mm: f.dz_mm, rotation_deg: f.rotation_deg }, levels };
}

/** The lead's frame as a point map, scan mm → model (Revit internal) mm: turned anticlockwise about the scan's origin, then moved.
 *  ponytail: the lead's stated frame, unmeasured and outside D7's 20 mm; MA-4g computes it (scan CRS + IfcMapConversion or a registration
 *  report's rmse, then counted in the tolerance); a project frame artefact when jobs share one. */
export function toModel(f) {
  const a = (f.rotation_deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { xy: ([x, y]) => [r1(c * x - s * y + f.dx_mm), r1(s * x + c * y + f.dy_mm)], z: (z) => r1(z + f.dz_mm) };
}

/** Each storey's level in the model, lowest first: the one the lead named (its height checked when a published IFC holds the name); else the
 *  ONE level name of the published IFCs within TOLERANCE_MM of the storey's height in the model's frame; else a new level the changeset
 *  creates there, `Scan <Lnn> <job-id>`. `manifest`: [{name, elevation_mm, from}]. → [{cid, scan_mm, level, how, elevation_mm, delta_mm,
 *  checked, from}] or a 400 in words. `filedStoreys` (decision 19): cid → the storey record of a changeset this job already filed — that
 *  storey keeps its level (`how: "filed"`, checked as recorded), so a created level is never created twice.
 *  ponytail: a published storey Elevation is taken in Revit's internal frame (an IFC exported from another base is off by its height: `from`
 *  names the model, and the lead's names win); MA-4g reads the shared coordinates.
 *  ponytail: a created level whose changeset is still proposed is not created again — apply that storey's first changeset first. */
export function matchStoreys(levelCands, frame, named, manifest, jobId, filedStoreys = new Map()) {
  const M = toModel(frame);
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const out = [...levelCands].sort((a, b) => a.geometry.BaseElevation - b.geometry.BaseElevation).map((c) => {
    const z = M.z(c.geometry.BaseElevation), base = { cid: c.cid, scan_mm: c.geometry.BaseElevation };
    const name = named[c.cid];
    const was = filedStoreys.get(c.cid);
    if (was) {
      if (name && !same(name, was.level)) throw bad(`${c.cid} was filed on ${was.level} — leave it out of levels, or run the survey again to propose it afresh`);
      return { ...base, level: was.level, how: "filed", elevation_mm: was.elevation_mm, delta_mm: was.delta_mm, checked: was.checked, from: was.from };
    }
    if (name) {
      const hit = manifest.find((l) => same(l.name, name));
      if (!hit) return { ...base, level: name, how: "named", elevation_mm: z, delta_mm: null, checked: false, from: null };
      const d = r1(hit.elevation_mm - z);
      if (Math.abs(d) > TOLERANCE_MM)
        throw bad(`${hit.name} is at ${hit.elevation_mm} mm in ${hit.from} and the scan's storey ${c.cid} at ${z} mm in the model's frame — ${Math.abs(d)} mm apart, more than the ${TOLERANCE_MM} mm a match allows (D7); name the level at that height, or leave the storey out of levels to have it created`);
      return { ...base, level: hit.name, how: "named", elevation_mm: hit.elevation_mm, delta_mm: d, checked: true, from: hit.from };
    }
    const near = manifest.filter((l) => Math.abs(l.elevation_mm - z) <= TOLERANCE_MM);
    const names = [...new Set(near.map((l) => l.name))];
    if (names.length > 1) throw bad(`the published models have ${names.join(" and ")} within ${TOLERANCE_MM} mm of the scan's storey ${c.cid} (${z} mm in the model's frame) — name one in levels`);
    if (names.length === 1) return { ...base, level: near[0].name, how: "matched", elevation_mm: near[0].elevation_mm, delta_mm: r1(near[0].elevation_mm - z), checked: true, from: near[0].from };
    return { ...base, level: `Scan ${/L\d+/.exec(c.cid)?.[0] ?? c.cid} ${jobId}`, how: "created", elevation_mm: z, delta_mm: 0, checked: true, from: null };
  });
  const seen = new Map();
  for (const s of out) {
    const k = s.level.toLowerCase();
    if (seen.has(k)) throw bad(`the storeys ${seen.get(k)} and ${s.cid} would both be ${s.level} — name each in levels`);
    seen.set(k, s.cid);
  }
  return out;
}

/** Wall ends moved to the corners, in the scan's frame: an end of a paired wall goes along its own line to where it meets the nearest
 *  non-parallel (≥ 10°) paired wall's centreline, when that point is within that wall's thickness + 50 mm of the end and on that wall
 *  (extended by this wall's thickness + 50 mm). The survey's centreline runs face a's full length (pipeline.py:303-306: up to half a
 *  thickness long or short at a corner, plus the fit); ends that meet are joined by Revit within one changeset. The lines never move, so
 *  the order does not matter. walls [{start, end, width}] → [{start, end, trim_mm: [start, end], to: [j | null, j | null]}] (+ = longer;
 *  `to`: the wall each end was trimmed to, an index into walls — a type gap's is named in the reason).
 *  ponytail: end-to-centreline only — a mitre, a wall meeting two at one end, a door gap are Revit's or MA-5's (GHB-6). */
export function trimEnds(walls) {
  const SLACK = 50, SIN_MIN = Math.sin(Math.PI / 18);
  return walls.map((w, i) => {
    const keep = { start: w.start, end: w.end, trim_mm: [0, 0], to: [null, null] };
    if (!(w.width > 0)) return keep;
    const dx = w.end[0] - w.start[0], dy = w.end[1] - w.start[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const [[t0, j0], [t1, j1]] = [w.start, w.end].map((e) => {
      let best = null, to = null;
      walls.forEach((o, j) => {
        if (j === i || !(o.width > 0)) return;
        const ex = o.end[0] - o.start[0], ey = o.end[1] - o.start[1], el = Math.hypot(ex, ey), den = ux * ey - uy * ex;
        if (Math.abs(den) < SIN_MIN * el) return; // parallel, or nearly
        const rx = o.start[0] - e[0], ry = o.start[1] - e[1];
        const t = (rx * ey - ry * ex) / den, v = (rx * uy - ry * ux) / den, slack = (w.width + SLACK) / el; // e + t·u = o.start + v·(o.end − o.start)
        if (Math.abs(t) > o.width + SLACK || v < -slack || v > 1 + slack) return;
        if (best === null || Math.abs(t) < Math.abs(best)) { best = t; to = j; }
      });
      return [best ?? 0, to];
    });
    if (len - t0 + t1 < 1) return keep;
    const at = (p, t) => [r1(p[0] + t * ux), r1(p[1] + t * uy), p[2]];
    return { start: at(w.start, t0), end: at(w.end, t1), trim_mm: [Math.round(-t0) || 0, Math.round(t1) || 0], to: [j0, j1] };
  });
}

/** MA-4d (review): how far a paired wall's scanned faces sit from the ghost's faces — the untrimmed centreline offset by half the thickness
 *  each side — the largest over the faces' ends, in mm (0.1); null without a centreline, a thickness or faces. The fit's rmse is each face
 *  against its OWN fitted line, and pair() accepts faces up to 5° apart, so a 2 mm fit can hide a face hundreds of mm off the ghost. Read
 *  from result.json's geometry.faces (scan frame), no point cloud.
 *  ponytail: the faces' ends, not their points — a bowed face is MA-4e's deviation against the placed element. */
function faceDev(c) {
  const L = c.geometry?.LocationCurve, t = c.measured?.thickness_mm, F = c.geometry?.faces;
  if (!L || !Number.isFinite(t) || !Array.isArray(F) || !F.length) return null;
  const dx = L.end[0] - L.start[0], dy = L.end[1] - L.start[1], len = Math.hypot(dx, dy);
  let dev = 0;
  for (const f of F) for (const [x, y] of [[f[0], f[1]], [f[2], f[3]]])
    dev = Math.max(dev, Math.abs(Math.abs(dx * (y - L.start[1]) - dy * (x - L.start[0])) / len - t / 2));
  return r1(dev);
}

/** null when the typer types it, else its gap (changesets-typing attaches one to every refusal a candidate can earn); any other fault — no
 *  standards, a code fault — is thrown and refuses the whole proposal in its own words. */
function gapOf(type, kind, facts, cid, why) {
  try { type(kind, facts, cid); return null; } catch (e) {
    if (!e.gap) throw e;
    return { ...e.gap, key: why ? `${e.gap.key}; inside or outside not read: ${why}`.slice(0, 500) : e.gap.key };
  }
}

/** The gaps as the Holding Area's groups: one per category and wanted type, else size (typeGapId — exact sizes, no band while the D16 snap is
 *  0), at most 50 labels and evidence refs, in a fixed order. */
export function groupGaps(gaps) {
  const by = new Map();
  for (const g of gaps) {
    const id = typeGapId(g);
    const x = by.get(id) ?? { id, category: g.category, want: g.want ?? null, size: g.size ?? null, key: g.key ? String(g.key).slice(0, 500) : null,
      elements: 0, labels: [], nearest: (g.nearest ?? []).slice(0, 50), evidence: [] };
    x.elements++;
    if (x.labels.length < 50) x.labels.push(g.label);
    for (const e of g.evidence) if (x.evidence.length < 50 && !x.evidence.includes(e)) x.evidence.push(e);
    by.set(id, x);
  }
  if (by.size > 200) throw err(413, `the job leaves ${by.size} type-gap groups — over the 200 one Holding Area row holds; MA-4h splits it — nothing was saved`);
  return [...by.values()];
}

/** The plan of one trusted job → {storeys: [{storey, body | null, byCid, exceptions}], groups, already_filed}. `job` {id, ledger: {id},
 *  reader, version}; `type` the project's typer (the same instance validateChangeset then types with); `manifest` the published levels;
 *  `filed` (decision 19) {cids, storeys}: what this job already filed — not proposed again, but every wall still trims and reads inside or
 *  outside against it. byCid: the bridge's trust record of each element it built — validateChangeset stamps it, never a body. Throws 400/413
 *  in words; writes nothing. */
export function planSurvey({ job, candidates, frame, levels: named = {}, manifest = [], type, filed = { cids: new Set(), storeys: new Map() } }) {
  const M = toModel(frame);
  const ref = `${job.id} (ledger #${job.ledger.id})`;
  const fit = (c) => (Number.isFinite(c.fit?.rmse_mm) ? `fit ${c.fit.rmse_mm} mm rms` : "no fit");
  const gaps = [];
  let already = 0;
  const again = (c) => { if (!filed.cids.has(c.cid)) return false; already++; return true; };
  const storeys = matchStoreys(candidates.filter((c) => c.kind === "level"), frame, named, manifest, job.id, filed.storeys).map((s) => {
    const E = s.elevation_mm, elements = [], byCid = new Map(), exceptions = [];
    const mine = candidates.filter((c) => c.kind !== "level" && c.geometry?.storey === s.cid);
    // The trust record: the job's measured block as stored; the accuracy judged on the fit (each face's inliers against its own line) AND on
    // how far the faces sit from the ghost's (faceDev) — design rule 6's measured verdict, said by `basis`; the pre-tick, the bridge's half of
    // design :753-759 (conflicts and BLOCK are checked in Revit at Apply): within D7's 20 mm, the storey's level height checked, every size
    // its type decides measured.
    // ponytail: the fit and the faces' ends, not deviation — MA-4e's verify:measured adds p95 and coverage against the placed element.
    const trust = (c, extra = {}) => {
      const rms = c.fit?.rmse_mm, dev = c.kind === "wall" ? faceDev(c) : null;
      const status = !Number.isFinite(rms) ? "insufficient_data" : Math.max(rms, dev ?? 0) <= TOLERANCE_MM ? "within_tolerance" : "out_of_tolerance";
      const sized = c.kind === "level" || (c.kind === "wall" && Number.isFinite(c.measured?.thickness_mm));
      return { measured: c.measured, accuracy: { status, basis: "fit", from_job: job.id, fit_rmse_mm: Number.isFinite(rms) ? rms : null, face_dev_mm: dev,
        coverage: c.fit?.coverage ?? null, target_mm: TOLERANCE_MM }, pretick: status === "within_tolerance" && s.checked && sized, ...extra };
    };
    const gap = (c, g) => {
      gaps.push({ ...g, size: g.size ?? (g.want ? null : NOT_MEASURED), label: `${s.level} · ${c.cid}`.slice(0, 256), evidence: c.evidence });
      exceptions.push({ unique_id: c.cid.slice(0, 64), name: `${c.kind} ${c.cid}`.slice(0, 256),
        reason: `type gap — ${g.want ? `${g.want} is not in the type catalogue` : `no office rule types it (${g.key})`}; it waits in the Holding Area`.slice(0, 300) });
    };
    const walls = mine.filter((c) => c.kind === "wall");
    const trimmed = trimEnds(walls.map((c) => ({ start: c.geometry.LocationCurve.start, end: c.geometry.LocationCurve.end, width: c.measured.thickness_mm ?? 0 })));
    const segs = trimmed.map((t, i) => ({ x0: t.start[0], y0: t.start[1], x1: t.end[0], y1: t.end[1], width: walls[i].measured.thickness_mm ?? 0 }));
    // Every wall's facts and gap first, so a wall trimmed to a gap's centreline can say so (the corner closes once the gap is placed).
    const typed = walls.map((c, i) => {
      const t = c.measured.thickness_mm;
      if (!Number.isFinite(t)) return { gap: { category: "Walls", want: null, size: NOT_MEASURED, key: "one face seen", nearest: [] } };
      const loc = locate(segs, i), facts = { thickness_mm: t, ...(loc.location ? { params: { Location: loc.location } } : {}) };
      return { facts, loc, gap: gapOf(type, "wall", facts, c.cid, loc.why) };
    });
    walls.forEach((c, i) => {
      if (again(c)) return;
      const { facts, loc, gap: g } = typed[i];
      if (g) return gap(c, g);
      const tr = trimmed[i].trim_mm;
      const toGap = trimmed[i].to.map((j, k) => (j != null && typed[j].gap ? `the ${k ? "end" : "start"} to ${walls[j].cid}'s centreline: a type gap, not placed` : null)).filter(Boolean);
      elements.push({ op: "create", kind: "wall", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: KIND_ENTITY.wall, Name: c.cid } },
        place: { LevelName: s.level, LocationCurve: { start: [...M.xy(trimmed[i].start), E], end: [...M.xy(trimmed[i].end), E] }, TopElevation: M.z(c.geometry.TopElevation) },
        reason: (`scan wall ${c.cid}: ${facts.thickness_mm} mm thick, ${c.measured.height_mm} mm high, ${c.measured.length_mm} mm long as measured · ${fit(c)} · ` +
          `${loc.location ? `Location ${loc.location}` : `inside or outside not read (${loc.why})`} · ends ${tr.join(" / ")} mm to the corners` +
          `${toGap.length ? ` (${toGap.join("; ")})` : ""} · ${ref}`).slice(0, 500) });
      byCid.set(c.cid, trust(c, { trim_mm: tr }));
    });
    for (const c of mine.filter((x) => x.kind === "floor" || x.kind === "ceiling")) {
      if (again(c)) continue;
      const g = gapOf(type, c.kind, null, c.cid, null);
      if (g) { gap(c, g); continue; }
      const place = c.kind === "floor"
        ? { LevelName: s.level, LocationLoop: c.geometry.LocationLoop.map((p) => [...M.xy(p), E]) }
        : { LevelName: s.level, Boundary: c.geometry.Boundary.map((p) => M.xy(p)), Offset: r1(M.z(c.measured.elevation_mm) - E) };
      elements.push({ op: "create", kind: c.kind, cid: c.cid, evidence: c.evidence, validate: { identity: { Class: KIND_ENTITY[c.kind], Name: c.cid } }, place,
        reason: `scan ${c.kind} ${c.cid}: ${c.measured.area_m2} m² at ${c.measured.elevation_mm} mm as measured · ${fit(c)} · its thickness is the type's (the scan sees one face) · ${ref}`.slice(0, 500) });
      byCid.set(c.cid, trust(c));
    }
    if (!elements.length) return { storey: s, body: null, byCid, exceptions };
    if (s.how === "created") {
      const lv = candidates.find((c) => c.cid === s.cid);
      elements.unshift({ op: "create", kind: "level", cid: s.cid, evidence: lv.evidence, validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: s.level } },
        place: { BaseElevation: E, Name: s.level }, reason: `scan storey ${s.cid} at ${s.scan_mm} mm (${fit(lv)}) · a new level at ${E} mm in the model · ${ref}`.slice(0, 500) });
      byCid.set(s.cid, trust(lv));
    }
    // ponytail: one changeset (one Undo) per storey; a storey over 200 needs StoreyBatch to accept the survey source (C#) — MA-4h with Kladno.
    if (elements.length > MAX_CHANGESET_ELEMENTS)
      throw err(413, `${s.cid} would file ${elements.length} elements on ${s.level} — over the ${MAX_CHANGESET_ELEMENTS} one changeset (one Undo) holds; splitting a storey waits for MA-4h — nothing was saved`);
    return { storey: s, byCid, exceptions, body: { name: `Survey ${job.id} · ${s.level}`, contract: 2, source: `${job.reader} ${job.version}`, elements, exceptions } };
  });
  return { storeys, groups: groupGaps(gaps), already_filed: already };
}
```
Run `npx vitest run bridge/survey-plan.test.mjs bridge/wall-location.test.mjs` → passes (needs Tasks 1-3).
- [ ] **Step 3: commit** — `feat(bridge): MA-4d - the survey planner: frame, storeys to levels, corners, inside or outside, exact typing, gaps grouped`

### Task 6 — Bridge: `validateChangeset`'s `job` option; `NO_JOB`

**Files:** modify `WebApp/bridge/changesets-logic.mjs`, `fixtures/changeset-ops/contract2-trust.json` (:23), `fixtures/changeset-ops/contract2-typed-body.json` (:31); test `changesets-logic.test.mjs` (:694 and a new `describe`).

- [ ] **Step 1: the test first** — `changesets-logic.test.mjs:694`, `contract2-trust.json:23` and `contract2-typed-body.json:31` (its `stored.ignored`, held by `changesets-logic.test.mjs:910-916` with `toMatchObject`, which compares array items exactly) take the new `NO_JOB` words (Step 2): `{ "field": "source.job_id", "why": "ignored: a job named in a body backs nothing — the bridge files a survey job's changesets itself (POST /cde/:key/build/jobs/:id/propose); the source is marked claimed" }`. promote-check's `LayerFreePlanner.cs` reads the second fixture but not its `ignored` words: no C# change. `grep -rn "no survey job the bridge ran is named by it" WebApp tools` → nothing after the step. Append:
```js
describe("validateChangeset — a changeset the bridge built from a survey job (MA-4d)", () => {
  const W = { op: "create", kind: "wall", cid: "scan-L00-wall-1", evidence: ["ev-0001#slice-L00"], validate: { identity: { Class: "IFCWALL", Name: "scan-L00-wall-1" } },
    place: { TypeName: "BDS_EXT_ARC_CMU_300 mm", LevelName: "GR-FFL", LocationCurve: { start: [40125, 150, 0], end: [47850, 150, 0] }, TopElevation: 2800 } };
  const TRUST = { measured: { length_mm: 8001, height_mm: 2800, thickness_mm: 300 }, pretick: true, trim_mm: [-140, -136],
    accuracy: { status: "within_tolerance", basis: "fit", from_job: "job-0002", fit_rmse_mm: 2, coverage: 1, target_mm: 20 } };
  const JOB = { record: { id: "job-0002", ledger_id: 2201 }, byCid: new Map([["scan-L00-wall-1", TRUST]]) };
  it("takes measured, the trims, the accuracy and the pre-tick from the bridge's record; the changeset is not claimed and names its job", () => {
    const v = validateChangeset({ name: "Survey job-0002 · GR-FFL", source: "sentinel-survey 0.1.0", contract: 2, elements: [W] }, { member: true, job: JOB });
    expect(v).toMatchObject({ claimed: false, job: JOB.record, ignored: [] });
    expect(v.elements[0]).toMatchObject({ measured: TRUST.measured, trim_mm: [-140, -136], accuracy: TRUST.accuracy, pretick: true });
  });
  it("an element that is no candidate of the job is refused (the bridge's own guard)", () => {
    status400(() => validateChangeset({ name: "x", elements: [{ ...W, cid: "scan-L09-wall-1" }] }, { job: JOB }), /scan-L09-wall-1 is not a candidate of job-0002/);
  });
  it("a body cannot reach it: a posted job, source.job_id, measured or pretick is listed; the changeset stays claimed; nothing is measured", () => {
    const v = validateChangeset({ name: "x", source: { reader: "sentinel-survey 0.1", job_id: "job-0002" }, job: JOB.record,
      elements: [{ ...W, measured: TRUST.measured, pretick: true }] }, { member: true });
    expect(v).toMatchObject({ claimed: true, source: "sentinel-survey 0.1" });
    expect(v).not.toHaveProperty("job");
    expect(v.elements[0]).toMatchObject({ pretick: false, accuracy: { status: "not_measured" } });
    expect(v.elements[0]).not.toHaveProperty("measured");
    expect(v.ignored.map((i) => i.field)).toEqual(["job", "source.job_id", "elements[0].measured", "elements[0].pretick"]);
  });
});
```
- [ ] **Step 2: the code** —
  - `:64` → `const NO_JOB = "ignored: a job named in a body backs nothing — the bridge files a survey job's changesets itself (POST /cde/:key/build/jobs/:id/propose); the source is marked claimed";` (`NOT_MEASURED` keeps its words: still true for every body).
  - `:244` → `export function validateChangeset(body, { member = false, type = null, cite = null, job = null } = {}) {`; the doc comment gains: ` *  MA-4d: with \`job\` — {record, byCid}, built by changesets-store proposeFromJob from a job trustedJob accepted, never from a body (the
 *  route calls proposeChangeset, which passes none) — each element takes the job's measured block, its trims, accuracy and pre-tick from the
 *  bridge's record by cid, and the changeset is not claimed and carries the job as \`job\`.`
  - after the evidence check (:386):
```js
    // MA-4d: an element the bridge built from a survey job it trusts (proposeFromJob) — its trust record, by cid; the body was the bridge's.
    const fromJob = job ? job.byCid.get(el.cid?.trim()) : null;
    if (job && !fromJob) throw err(400, `${at}: ${el.cid ?? "an element"} is not a candidate of ${job.record.id} — nothing was saved`);
```
  - in the element's return, before `pretick` (:419): `...(fromJob ? { measured: fromJob.measured, ...(fromJob.trim_mm ? { trim_mm: fromJob.trim_mm } : {}) } : {}),`; and
```js
      // MA-1a item 8 … MA-2a: an element the bridge typed from POSTED facts is never pre-ticked for that (the poster's claim). MA-4d: one it built
      // from a job carries the job's decision — its facts are the measurement the bridge re-hashed (survey-plan's trust record).
      pretick: fromJob ? fromJob.pretick : typed ? false : pretickOf(op, source, target, member),
      accuracy: fromJob ? fromJob.accuracy : { status: "not_measured" },
```
  - the changeset's return (:431-432): `// The source is the caller's claim, unless the bridge built the changeset from a survey job it ran (MA-4d).` `claimed: !job,` and after `ignored`: `...(job ? { job: job.record } : {}),`.
  Run `npx vitest run bridge/changesets-logic.test.mjs` → passes (both shared-fixture tests with the new words).
- [ ] **Step 3: commit** — `feat(bridge): MA-4d - validateChangeset takes a job's trust record (internal only); a job named in a body backs nothing`

### Task 7 — Bridge: `proposeFromJob`, the shared filing, the rows

**Files:** modify `WebApp/bridge/changesets-store.mjs`; create `fixtures/changeset-ops/contract2-survey.json`; test `changesets-store.test.mjs`.

- [ ] **Step 1: the fixture** — `contract2-survey.json` (the GR-FFL storey as `proposeFromJob` stores it in Step 2's test (a), on the drill's numbers):
```json
{
  "_comment": "MA-4d: the first storey changeset proposeFromJob stores from the drill's job-0002 (fixtures/survey/job-0002-result.json), frame dx 40000, GR-FFL published at 0 mm. vitest holds the stored doc to `stored` (toMatchObject, changesets-store.test.mjs); tools/promote-check (Trust.cs) reads it into the deployed ChangesetDto.",
  "stored": {
    "name": "Survey job-0002 · GR-FFL", "source": "sentinel-survey 0.1.0", "status": "proposed", "claimed": false, "contract": 2,
    "job": { "id": "job-0002", "ledger_id": 2201, "result_sha256": "70c9845a19417feb6c483674f0e1359911a46d630adb3135491d95618c0397d0",
      "reader": "sentinel-survey 0.1.0", "planner": "survey-planner 0.1.0", "frame": { "dx_mm": 40000, "dy_mm": 0, "dz_mm": 0, "rotation_deg": 0 },
      "storey": { "cid": "scan-L00-level", "level": "GR-FFL", "how": "matched", "elevation_mm": 0, "delta_mm": 0, "checked": true, "from": "ARC.ifc P01" },
      "evidence": [{ "id": "ev-0001", "sha256": "e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1" }], "overlaps": [] },
    "exceptions": [
      { "unique_id": "scan-L00-wall-4", "name": "wall scan-L00-wall-4", "reason": "type gap — BDS_EXT_ARC_CMU_250 mm is not in the type catalogue; it waits in the Holding Area" },
      { "unique_id": "scan-L00-floor", "name": "floor scan-L00-floor", "reason": "type gap — no office rule types it (no facts); it waits in the Holding Area" },
      { "unique_id": "scan-L00-ceiling", "name": "ceiling scan-L00-ceiling", "reason": "type gap — no office rule types it (no facts); it waits in the Holding Area" }
    ],
    "elements": [
      { "kind": "wall", "op": "create", "cid": "scan-L00-wall-1", "evidence": ["ev-0001#slice-L00"], "pretick": true, "trim_mm": [-140, -136],
        "measured": { "length_mm": 8001, "height_mm": 2800, "thickness_mm": 300 },
        "accuracy": { "status": "within_tolerance", "basis": "fit", "from_job": "job-0002", "fit_rmse_mm": 2, "face_dev_mm": 0, "coverage": 1, "target_mm": 20 },
        "facts": { "thickness_mm": 300, "params": { "Location": "Exterior" } }, "typing": { "typed_by": "bridge", "type": "BDS_EXT_ARC_CMU_300 mm", "family": "Basic Wall" },
        "validate": { "identity": { "Class": "IFCWALL", "Name": "scan-L00-wall-1" } },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_300 mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [40125, 150, 0], "end": [47850, 150, 0] }, "TopElevation": 2800 } },
      { "kind": "wall", "op": "create", "cid": "scan-L00-wall-2", "evidence": ["ev-0001#slice-L00"], "pretick": true, "trim_mm": [-139, -137],
        "measured": { "length_mm": 8001, "height_mm": 2800, "thickness_mm": 200 },
        "accuracy": { "status": "within_tolerance", "basis": "fit", "from_job": "job-0002", "fit_rmse_mm": 1.9, "face_dev_mm": 0, "coverage": 1, "target_mm": 20 },
        "typing": { "typed_by": "bridge", "type": "BDS_EXT_ARC_CMU_200 mm", "family": "Basic Wall" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_200 mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [40125, 5900, 0], "end": [47850, 5900, 0] }, "TopElevation": 2800 } },
      { "kind": "wall", "op": "create", "cid": "scan-L00-wall-3", "evidence": ["ev-0001#slice-L00"], "pretick": true, "trim_mm": [-99, -97],
        "measured": { "length_mm": 5946, "height_mm": 2800, "thickness_mm": 300 },
        "accuracy": { "status": "within_tolerance", "basis": "fit", "from_job": "job-0002", "fit_rmse_mm": 1.8, "face_dev_mm": 0, "coverage": 1, "target_mm": 20 },
        "typing": { "typed_by": "bridge", "type": "BDS_EXT_ARC_CMU_300 mm", "family": "Basic Wall" },
        "place": { "TypeName": "BDS_EXT_ARC_CMU_300 mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [47850, 150, 0], "end": [47850, 5900, 0] }, "TopElevation": 2800 } }
    ]
  }
}
```
- [ ] **Step 2: the test first** — append to `changesets-store.test.mjs` (import `proposeFromJob`; uses the file's `baseDeps`, `readRepo`, `installed`, `NONE`):
```js
describe("proposeFromJob (MA-4d): a lead turns a trusted survey job into changesets per storey; the bridge builds and stamps them", () => {
  const RESULT = readRepo("WebApp/bridge/fixtures/survey/job-0002-result.json");
  const EV = "e1".repeat(32);
  const TRUSTED = { job: { id: "job-0002", pack_id: "evp-9999", status: "done" }, result: RESULT, // job.json's pack id is never read: the row's is
    row: { ledger: { id: 2201, hash: "13".repeat(32) }, reader: "sentinel-survey", version: "0.1.0", pack_id: "evp-0001", items: [{ id: "ev-0001", sha256: EV }, { id: "ev-0002", sha256: "e2".repeat(32) }],
      read: ["ev-0001"], result_sha256: "70c9845a19417feb6c483674f0e1359911a46d630adb3135491d95618c0397d0" } };
  const STD = { guideline: readRepo("demo/bds-pilot/bds-dd-layerfree-guideline.json"), type_catalog: readRepo("demo/bds-pilot/bds-type-catalog.json") };
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));
  const belowMin = (you) => vi.fn(async (_key, min) => { throw Object.assign(new Error(`this action requires the ${min} role (you are ${you})`), { status: 403 }); });
  const FRAME = { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 0 };
  const sdeps = (over = {}) => { let n = 3000; return baseDeps({
    myRole: vi.fn(async () => "lead"), requireMinRole: vi.fn(async () => "lead"), takeWriteBudget: vi.fn(), resolveArtefact: resolving(STD),
    trustedJob: vi.fn(async () => TRUSTED), readPack: vi.fn(async () => ({ pack: { items: [{ id: "ev-0001", sha256: EV, state: "admitted" }] } })),
    manifestLevels: vi.fn(async () => [{ name: "GR-FFL", elevation_mm: 0, from: "ARC.ifc P01" }]),
    audit: vi.fn(async () => ({ id: ++n, hash: "ab".repeat(32) })), ...over }); };
  const propose = (deps, body = { frame: FRAME }) => proposeFromJob("ma4c-drill", "job-0002", body, "web", deps);
  /** job-0002's two storey changesets as a first proposal stores them — the earlier changesets of the decision-19 cases. */
  const firstDocs = async () => { const d0 = sdeps(); await propose(d0); return [...d0.saved.values()]; };

  it("(a) one changeset per storey, built and stamped by the bridge; the gaps in one type_gap row; then the planner's build:run row", async () => {
    const deps = sdeps();
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Survey job-0002 · GR-FFL", 3, 3], ["Survey job-0002 · Scan L01 job-0002", 4, 4]]);
    expect(r.storeys.map((s) => [s.cid, s.level, s.how, s.checked, s.changeset != null])).toEqual([["scan-L00-level", "GR-FFL", "matched", true, true], ["scan-L01-level", "Scan L01 job-0002", "created", true, true]]);
    expect(r).toMatchObject({ job: "job-0002", survey_row: { id: 2201 }, gaps: { groups: 3, elements: 6, ledger: { id: 3003 } }, already_filed: 0, overlaps: [], ledger: { id: 3004 } });
    expect([...deps.saved.values()][0]).toMatchObject(readRepo("WebApp/bridge/fixtures/changeset-ops/contract2-survey.json").stored); // Trust.cs reads the same
    expect(deps.audit.mock.calls.map((c) => [c[1], c[3]])).toEqual([["changeset", "changeset_proposed"], ["changeset", "changeset_proposed"],
      ["type_gap", "type_gap:run job-0002 · survey-planner · 3 group(s), 6 element(s)"], ["build", "build:run job-0002 · survey-planner 0.1.0 · proposed"]]);
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ claimed: false, job: { id: "job-0002", ledger_id: 2201 }, evidence: [{ id: "ev-0001", sha256: EV }],
      from_job: [{ cid: "scan-L00-wall-1", evidence: ["ev-0001#slice-L00"] }, { cid: "scan-L00-wall-2" }, { cid: "scan-L00-wall-3" }] });
    expect(deps.audit.mock.calls[2][6]).toMatchObject({ claimed: false, source: "sentinel-survey", job: { id: "job-0002", ledger_id: 2201 },
      groups: [{ want: "BDS_EXT_ARC_CMU_250 mm", evidence: ["ev-0001#slice-L00", "ev-0001#slice-L01"] }, { category: "Floors" }, { category: "Ceilings" }] });
    expect(deps.audit.mock.calls[3][6]).toMatchObject({ job_id: "job-0002", survey_row: { id: 2201 }, frame: FRAME, claimed: false, model_calls: 0, tokens: 0, gaps: { groups: 3, elements: 6 } });
  });
  it("(b) refused before anything is written, each in words", async () => {
    const quiet = async (over, message, status = 409, body = { frame: FRAME }) => {
      const deps = sdeps(over);
      await expect(propose(deps, body)).rejects.toMatchObject({ status, message });
      expect([deps.docInsert.mock.calls.length, deps.audit.mock.calls.length, deps.adjudicateProposal.mock.calls.length]).toEqual([0, 0, 0]);
    };
    await quiet({ myRole: vi.fn(async () => "service") }, "proposing from a survey job needs a person — the frame and levels it states are a lead's, and its pre-ticks rest on them: sign in. Nothing was saved.", 403);
    await quiet({ requireMinRole: belowMin("contributor") }, "this action requires the lead role (you are contributor) — proposing from a survey job is a lead's: the frame and levels it states decide where every ghost lands; nothing was saved", 403);
    await quiet({ trustedJob: vi.fn(async () => { throw Object.assign(new Error("job-0002's result is not trusted: … — run the survey again; nothing was saved"), { status: 409 }); }) },
      "job-0002's result is not trusted: … — run the survey again; nothing was saved");
    await quiet({}, "pretick is not a proposal field — the bridge builds every changeset from the job's own result; send {frame, levels?} — nothing was saved", 400, { frame: FRAME, pretick: true });
    const pack = (items) => ({ readPack: vi.fn(async (_k, id) => (id === "evp-0001" ? { pack: { items } } : null)) }); // the ROW's pack id
    await quiet(pack([{ id: "ev-0001", sha256: EV, state: "changed" }]), "ev-0001 is not the bytes job-0002 read (Re-check flagged it changed) — survey the admitted scan again; nothing was saved");
    await quiet(pack([{ id: "ev-0001", sha256: "f".repeat(64), state: "admitted" }]), "ev-0001 is not the bytes job-0002 read (its sha256 in the pack is not the one the job read) — survey the admitted scan again; nothing was saved");
    await quiet(pack([]), "ev-0001 is not the bytes job-0002 read (it is no longer in the pack) — survey the admitted scan again; nothing was saved");
    await quiet({ readPack: vi.fn(async () => { throw Object.assign(new Error("ma4c-drill has no evidence pack — an office row holds none"), { status: 409 }); }) },
      "ma4c-drill has no evidence pack — an office row holds none — nothing was saved"); // a callee's words get the house ending
    const docs = await firstDocs();
    await quiet({ docList: vi.fn(async () => docs) }, "nothing new to propose from job-0002 — every candidate that types is filed already (Survey job-0002 · GR-FFL: proposed; Survey job-0002 · Scan L01 job-0002: proposed): withdraw a proposed one on the Review desk to propose it again; an applied one stays applied here after an Undo in Revit — run the survey again to propose it afresh; nothing was saved");
    await quiet({ docList: vi.fn(async () => docs.map((c) => ({ ...c, status: "applied" }))) }, expect.stringContaining("(Survey job-0002 · GR-FFL: applied; Survey job-0002 · Scan L01 job-0002: applied)"));
    await quiet({ docList: vi.fn(async () => docs) }, "Survey job-0002 · GR-FFL (proposed) was filed from job-0002 with the scan moved 40000, 0, 0 mm, turned 0° — send that frame (one job is one frame), or run the survey again to propose it afresh; nothing was saved", 409, { frame: { ...FRAME, dx_mm: 0 } });
    const other = docs.map((c) => ({ ...c, name: c.name.replace("job-0002", "job-0001"), job: { ...c.job, id: "job-0001", ledger_id: 2200 } }));
    await quiet({ docList: vi.fn(async () => other) }, "Survey job-0001 · GR-FFL (from job-0001) is still proposed — decide or withdraw it before proposing another survey job: both would propose the same walls; nothing was saved");
    await quiet({ resolveArtefact: resolving({ guideline: STD.guideline }) }, expect.stringMatching(/^a survey's candidates are typed from the project's guideline and type catalogue, exactly \(D16\) — guideline: guideline@1 · office · .+; type catalogue: none — .+; install both on the project or its office first\. Nothing was saved$/));
    await quiet({ manifestLevels: vi.fn(async () => { throw new Error("the manifest store is down"); }) },
      "the published models' levels could not be read (the manifest store is down) — nothing was saved; send it again", 503);
  });
  it("(c) a job whose changesets were withdrawn or declined is proposed again (a wrong frame is fixed that way)", async () => {
    const deps = sdeps({ docList: vi.fn(async () => [{ id: "c0", name: "Survey job-0002 · GR-FFL", status: "withdrawn", job: { id: "job-0002", ledger_id: 2201 } }]) });
    expect((await propose(deps)).changesets).toHaveLength(2);
  });
  it("(d) a level the lead names that no published model holds: its height is not checked, so nothing on that storey is pre-ticked", async () => {
    const deps = sdeps({ manifestLevels: vi.fn(async () => []) });
    const r = await propose(deps, { frame: FRAME, levels: { "scan-L00-level": "GR-FFL" } });
    expect(r.changesets.map((c) => c.preticked)).toEqual([0, 4]);
    expect([...deps.saved.values()][0].job.storey).toMatchObject({ level: "GR-FFL", how: "named", checked: false });
  });
  it("(e) Revit's result on a survey changeset: changeset_applied names the job, the evidence shas and each placed wall's reader id and evidence", async () => {
    const deps = sdeps();
    await propose(deps);
    const cs = [...deps.saved.values()][0];
    await reportResult("ma4c-drill", cs.id, { applied: cs.elements.map((e, i) => ({ proposal_guid: e.proposal_guid, revit_element_id: 900 + i, revit_unique_id: `u-${i}` })), rejected: [], review_rev: 0 }, "revit", deps);
    expect(deps.audit.mock.calls.at(-1)[6]).toMatchObject({ status: "applied", job: { id: "job-0002", ledger_id: 2201 }, evidence: [{ id: "ev-0001", sha256: EV }],
      from_job: [{ cid: "scan-L00-wall-1", evidence: ["ev-0001#slice-L00"], revit_unique_id: "u-0" }, { cid: "scan-L00-wall-2" }, { cid: "scan-L00-wall-3" }] });
  });
  it("(f) a filing the store stops half way says what WAS filed (the store listed again) and what to do", async () => {
    const deps = sdeps(); let n = 0; const insert = deps.docInsert;
    deps.docInsert = vi.fn(async (...a) => { if (++n === 2) throw new Error("the store is down"); return insert(...a); });
    await expect(propose(deps)).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL was filed; the filing stopped at Survey job-0002 · Scan L01 job-0002 (the store is down) — withdraw it on the Review desk, then propose job-0002 again" });
  });
  it("(g) the type-gap row failing after the filing says what was filed — never a raw 5xx (decision 19 would refuse the retry)", async () => {
    const deps = sdeps(); let n = 0; const write = deps.audit;
    deps.audit = vi.fn(async (...a) => { if (++n === 3) throw new Error("the ledger is down"); return write(...a); });
    await expect(propose(deps)).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL, Survey job-0002 · Scan L01 job-0002 were filed; the type-gap row was not written (the ledger is down) — withdraw them on the Review desk, then propose job-0002 again" });
  });
  it("(h) a doc stored before its changeset_proposed row failed is named as filed (the first storey too)", async () => {
    const deps = sdeps(); deps.audit = vi.fn(async () => { throw new Error("the ledger is down"); });
    await expect(propose(deps)).rejects.toMatchObject({ status: 502,
      message: "Survey job-0002 · GR-FFL was filed; the filing stopped at Survey job-0002 · GR-FFL (the ledger is down) — withdraw it on the Review desk, then propose job-0002 again" });
  });
  it("(i) two at once (a double-click, two leads): one files, the other is a 409 before anything is written — one job never filed twice", async () => {
    const deps = sdeps();
    const [a, b] = await Promise.allSettled([propose(deps), propose(deps)]);
    expect([a.status, b.status]).toEqual(["fulfilled", "rejected"]);
    expect(b.reason).toMatchObject({ status: 409, message: "a survey proposal is being filed on ma4c-drill — try again when it ends; nothing was saved" });
    expect(deps.saved.size).toBe(2);
    expect((await propose(sdeps())).changesets).toHaveLength(2); // released when it ends
  });
  it("(j) decision 19 per candidate: GR-FFL placed in Revit, the office then adds the 250 mm type — only the walls not filed are proposed, on the levels they were filed on", async () => {
    const [gr, l1] = await firstDocs();
    const placed = { ...gr, status: "applied", result: { applied: gr.elements.map((e) => ({ proposal_guid: e.proposal_guid })), rejected: [] } };
    const W250 = { category: "Walls", family: "Basic Wall", type: "BDS_EXT_ARC_CMU_250 mm", system: true, width_mm: 250, height_mm: null, params: { "Assembly Code": "B2010" } };
    const deps = sdeps({ docList: vi.fn(async () => [placed, l1]),
      resolveArtefact: resolving({ ...STD, type_catalog: { ...STD.type_catalog, types: [...STD.type_catalog.types, W250] } }) });
    const r = await propose(deps);
    expect(r.changesets.map((c) => [c.name, c.elements, c.preticked])).toEqual([["Survey job-0002 · GR-FFL", 1, 1], ["Survey job-0002 · Scan L01 job-0002", 1, 1]]);
    expect([...deps.saved.values()].map((c) => c.elements.map((e) => [e.cid, e.place.TypeName]))).toEqual([[["scan-L00-wall-4", "BDS_EXT_ARC_CMU_250 mm"]], [["scan-L01-wall-3", "BDS_EXT_ARC_CMU_250 mm"]]]);
    expect(r.storeys.map((s) => [s.level, s.how])).toEqual([["GR-FFL", "filed"], ["Scan L01 job-0002", "filed"]]); // L01's level is not created twice
    expect(r).toMatchObject({ already_filed: 6, gaps: { groups: 2, elements: 4 } });
  });
  it("(k) the same job id from another jobs folder is another job (keyed on its row); a scan it placed is named, never refused", async () => {
    const elsewhere = (await firstDocs()).map((c) => ({ ...c, status: "applied", job: { ...c.job, ledger_id: 1999 } }));
    const deps = sdeps({ docList: vi.fn(async () => elsewhere) });
    const r = await propose(deps);
    const overlaps = [{ changeset: "Survey job-0002 · GR-FFL", job_id: "job-0002", evidence: ["ev-0001"] }, { changeset: "Survey job-0002 · Scan L01 job-0002", job_id: "job-0002", evidence: ["ev-0001"] }];
    expect(r).toMatchObject({ already_filed: 0, overlaps });
    expect(r.changesets).toHaveLength(2);
    expect([...deps.saved.values()][0].job.overlaps).toEqual(overlaps);
    expect(deps.audit.mock.calls.at(-1)[6]).toMatchObject({ overlaps });
  });
});
```
- [ ] **Step 3: the code** — `changesets-store.mjs`:
  - imports (:9-11): `import { readProposeBody, planSurvey, PLANNER, PLANNER_VERSION } from "./survey-plan.mjs";` (`makeTyper`, `resolveActor` are imported already).
  - split `proposeChangeset` at the validation: lines :121-168 (from `const proj = await d.ensureProject(key);` to `return changeset;`) move unchanged into `async function fileValidated(d, key, v, body, actor)` (doc: `/** MA-4d: the filing of a validated changeset — the earlier changesets read, the referee, the carried declines, the doc, ONE changeset_proposed row. proposeChangeset's second half, shared with proposeFromJob (whose body the bridge built). */`), and `proposeChangeset` ends `return fileValidated(d, key, v, body, actor);`. Inside `fileValidated`, the stored doc gains, after the `contract` spread, `...(v.job ? { job: v.job } : {}), // MA-4d: the survey job the bridge built it from — never a body's`, and the `changeset_proposed` row's new_value gains:
```js
      // MA-4d (drill MA4: "each wall's ledger row lists its evidence sha and its job id"): the job, its evidence shas, and each element's reader
      // id and evidence refs — the bridge's, from the job it trusted.
      ...(v.job ? { job: { id: v.job.id, ledger_id: v.job.ledger_id, result_sha256: v.job.result_sha256 }, evidence: v.job.evidence,
        from_job: changeset.elements.map((e) => ({ proposal_guid: e.proposal_guid, cid: e.cid ?? null, evidence: e.evidence ?? [] })) } : {}),
```
  - `reportResult`'s `changeset_applied` new_value (after `values`, :283) gains:
```js
      // MA-4d: a survey changeset's row names its job and, per ghost placed, its Revit id, reader id and evidence (from the stored changeset).
      ...(cs.job ? { job: { id: cs.job.id, ledger_id: cs.job.ledger_id, result_sha256: cs.job.result_sha256 }, evidence: cs.job.evidence,
        from_job: updated.result.applied.map((a) => { const e = cs.elements.find((x) => x.proposal_guid === a.proposal_guid);
          return { proposal_guid: a.proposal_guid, revit_unique_id: a.revit_unique_id, cid: e?.cid ?? null, evidence: e?.evidence ?? [] }; }) } : {}),
```
  - after `previewChangesets`:
```js
const storeyRecord = (s) => ({ cid: s.cid, level: s.level, how: s.how, elevation_mm: s.elevation_mm, delta_mm: s.delta_mm, checked: s.checked, from: s.from });
const FILED = ["proposed", "applied", "partially_applied"]; // decision 19: a cid on one of these (less what Revit rejected) is filed
const FRAME_KEYS = ["dx_mm", "dy_mm", "dz_mm", "rotation_deg"];
// MA-4d (review): the projects a survey proposal is being filed on — decision 19's read of the changesets and the filing are one step per
// project, so a double-click or two leads at once cannot file one job twice (the evidence-store admitting / rechecking, build-jobs running
// precedent). ponytail: one bridge process — a second bridge on this PC (4101) can still race; a per-job unique doc key when two bridges serve one project.
const proposing = new Set();
/** The house rule: a refusal before the first write ends "nothing was saved" — a callee's own words (readPack, validateChangeset, the
 *  typer, a store read) get it appended. */
const unsaved = (e) => (/nothing was saved/i.test(e.message) ? e : err(e.status ?? 503, `${e.message} — nothing was saved`));

/** MA-4d: the levels of every live IFC model's manifest, [{name, elevation_mm, from}] — what an unnamed storey is matched to. A project with
 *  no published IFC has none (every unnamed storey is then created). One manifest doc read per live model. */
async function manifestLevels(key, d) {
  const ms = await import("./manifest-store.mjs");
  const proj = await d.ensureProject(key);
  const out = [];
  for (const m of await ms.liveModelVersions(key)) {
    const doc = await d.docGet(ms.STORE, proj.id, m.version_id);
    for (const l of doc?.levels ?? []) out.push({ name: l.name, elevation_mm: l.elevation_mm, from: `${m.container}${m.revision ? ` ${m.revision}` : ""}` });
  }
  return out;
}

/** MA-4d: POST /cde/:key/build/jobs/:id/propose {frame, levels?} → 201. A signed-in lead turns a done survey job into one changeset per storey
 *  that the bridge builds from the job's own result (survey-plan planSurvey) — measured, accuracy, pre-tick and claimed: false stamped by the
 *  bridge, the job in its own field (`job`; the source stays a string for deployed add-ins) — and its gaps into ONE type_gap row for the
 *  Holding Area; then ONE planner build:run row. Per candidate (decision 19): what this job's row already filed is not proposed again.
 *  Refusals before anything is written, each ending "nothing was saved" (unsaved), in this order: 403 (the machine credential; below lead),
 *  429, 409 (a proposal being filed on this project), 400/404/409 (the job: trustedJob, MA-4c decision 11), 400 (the body), 409 (an item it
 *  read changed), 503 (the changesets not read), 409 (another frame; another job's proposed), 409 (no guideline or catalogue), 503 (the
 *  published levels not read), 400/413 (the plan; a storey's validation), 409 (nothing new). Every storey is validated before the first is
 *  filed: only the store or the ledger can stop a filing half way — a 502 naming what WAS filed (the store listed again), logged. */
export async function proposeFromJob(key, id, b, actor, deps = {}) {
  const d = wire(deps);
  const trustedJob = deps.trustedJob ?? (await import("./build-jobs.mjs")).trustedJob;
  const readPack = deps.readPack ?? (await import("./evidence-store.mjs")).readPack;
  const levelsOf = deps.manifestLevels ?? ((k) => manifestLevels(k, d));
  if ((await d.myRole(key)) === "service")
    throw err(403, "proposing from a survey job needs a person — the frame and levels it states are a lead's, and its pre-ticks rest on them: sign in. Nothing was saved.");
  try { await d.requireMinRole(key, "lead"); }
  catch (e) { throw e.status === 403 ? err(403, `${e.message} — proposing from a survey job is a lead's: the frame and levels it states decide where every ghost lands; nothing was saved`) : unsaved(e); }
  d.takeWriteBudget("survey proposals", { perUser: 6, all: 12 }); // its 429 says "nothing was saved"
  if (proposing.has(key)) throw err(409, `a survey proposal is being filed on ${key} — try again when it ends; nothing was saved`);
  proposing.add(key); // taken and checked with no await between: two calls cannot both pass
  try {
    let x;
    try { x = await prepare(); } catch (e) { throw unsaved(e); } // nothing is written before prepare returns
    return await file(x);
  } finally { proposing.delete(key); }

  /** Everything before the first write: the job, the body, the scans, decision 19, the standards, the plan, each storey validated. */
  async function prepare() {
    const { row, result } = await trustedJob(key, id);
    const { frame, levels } = readProposeBody(b, result.candidates.filter((c) => c.kind === "level").map((c) => c.cid));
    // Every item the job read must still be the bytes it read: in the pack the ROW names (job.json is never the anchor), not flagged, with
    // the sha on its row.
    const { pack } = await readPack(key, row.pack_id);
    const evidence = row.read.map((rid) => {
      const sent = row.items.find((i) => i.id === rid), now = pack.items.find((i) => i.id === rid);
      const why = !sent ? "its row lists it as read but not as sent" : !now ? "it is no longer in the pack" : now.state === "changed" ? "Re-check flagged it changed"
        : now.sha256 !== sent.sha256 ? "its sha256 in the pack is not the one the job read" : null;
      if (why) throw err(409, `${rid} is not the bytes ${id} read (${why}) — survey the admitted scan again; nothing was saved`);
      return { id: rid, sha256: sent.sha256 };
    });
    const proj = await d.ensureProject(key);
    let earlier;
    try { earlier = await d.docList(STORE, proj.id); }
    catch (e) { throw err(503, `the project's changesets could not be read (${e.message}) — nothing was saved; send it again`); }
    // Decision 19, per candidate, keyed on this job's ROW (job.ledger_id: hash-chained, unique — a job id repeats across jobs folders): a cid
    // on a proposed or placed changeset of it, less what Revit rejected, is filed — not proposed again; its storey keeps the level it was filed on.
    const mine = earlier.filter((c) => c.job?.ledger_id === row.ledger.id && FILED.includes(c.status));
    const filed = { cids: new Set(), storeys: new Map() };
    for (const c of mine) {
      const rejected = new Set(c.result?.rejected ?? []);
      for (const e of c.elements ?? []) if (e.cid && !rejected.has(e.proposal_guid)) filed.cids.add(e.cid);
      if (c.job.storey?.cid) filed.storeys.set(c.job.storey.cid, c.job.storey);
    }
    const moved = mine.find((c) => FRAME_KEYS.some((k) => c.job.frame?.[k] !== frame[k])); // one job is one frame
    if (moved) {
      const f = moved.job.frame;
      throw err(409, `${moved.name} (${moved.status.replace("_", " ")}) was filed from ${id} with the scan moved ${f.dx_mm}, ${f.dy_mm}, ${f.dz_mm} mm, turned ${f.rotation_deg}° — send that frame (one job is one frame), or run the survey again to propose it afresh; nothing was saved`);
    }
    const other = earlier.find((c) => c.job?.ledger_id != null && c.job.ledger_id !== row.ledger.id && c.status === "proposed");
    if (other) throw err(409, `${other.name} (from ${other.job.id}) is still proposed — decide or withdraw it before proposing another survey job: both would propose the same walls; nothing was saved`);
    // Another job's placed changesets on the same scan bytes are named, never refused: an Undo in Revit leaves a changeset applied here.
    // ponytail: creates only — a scan already placed by another job is proposed again and only named; MA-5 matches scan walls to model
    // walls; status from the newest changeset_reverted when Undo must reopen a job.
    const onScan = (e) => evidence.some((x) => x.id === e.id && x.sha256 === e.sha256);
    const overlaps = earlier.filter((c) => c.job?.ledger_id != null && c.job.ledger_id !== row.ledger.id && ["applied", "partially_applied"].includes(c.status)
      && (c.job.evidence ?? []).some(onScan)).slice(0, 20).map((c) => ({ changeset: c.name, job_id: c.job.id, evidence: c.job.evidence.filter(onScan).map((e) => e.id) }));
    const [guideline, catalog] = await Promise.all([standardOf(key, "guideline", d), standardOf(key, "type_catalog", d)]);
    if (!guideline.body || !catalog.body)
      throw err(409, `a survey's candidates are typed from the project's guideline and type catalogue, exactly (D16) — guideline: ${guideline.label}; type catalogue: ${catalog.label}; install both on the project or its office first. Nothing was saved`);
    const type = makeTyper({ guideline, catalog }, await import("./sentinel-core.mjs"));
    let manifest;
    try { manifest = await levelsOf(key); }
    catch (e) { throw err(503, `the published models' levels could not be read (${e.message}) — nothing was saved; send it again`); }
    const plan = planSurvey({ job: { id, ledger: row.ledger, reader: row.reader, version: row.version }, candidates: result.candidates, frame, levels, manifest, type, filed });
    const by = resolveActor(actor, "web");
    const record = (s) => ({ id, ledger_id: row.ledger.id, ledger_hash: row.ledger.hash, result_sha256: row.result_sha256, reader: `${row.reader} ${row.version}`,
      planner: `${PLANNER} ${PLANNER_VERSION}`, frame: { ...frame, stated_by: by }, storey: storeyRecord(s), evidence, overlaps });
    const ready = plan.storeys.filter((p) => p.body).map((p) => {
      try { return { p, v: validateChangeset(p.body, { member: true, type, job: { record: record(p.storey), byCid: p.byCid } }) }; }
      catch (e) { throw err(e.status ?? 400, `${p.body.name}: ${e.message}`); } // unsaved() then ends it "nothing was saved"
    });
    if (!ready.length && mine.length) // a job that types nothing and filed nothing files its gaps alone
      throw err(409, `nothing new to propose from ${id} — every candidate that types is filed already (${mine.map((c) => `${c.name}: ${c.status.replace("_", " ")}`).join("; ")}): withdraw a proposed one on the Review desk to propose it again; an applied one stays applied here after an Undo in Revit — run the survey again to propose it afresh; nothing was saved`);
    return { proj, row, frame, before: new Set(earlier.map((c) => c.id)), overlaps, guideline, catalog, plan, ready, by };
  }

  /** The writes: each storey's changeset (fileValidated), the type_gap row, the planner row — a stop half way says what WAS filed. */
  async function file({ proj, row, frame, before, overlaps, guideline, catalog, plan, ready, by }) {
    const filed = [];
    // The house rule for a filing stopped half way: name what WAS filed — the store listed again, so a doc stored before its row failed is
    // named too — and log why (the bridge log).
    const halfWay = async (what, e) => {
      console.warn(`[MA-4d] propose ${key} ${id}: ${what} (${e.message})`);
      let names;
      try { names = (await d.docList(STORE, proj.id)).filter((c) => !before.has(c.id) && c.job?.ledger_id === row.ledger.id).map((c) => c.name); }
      catch { names = filed.map((c) => c.name); } // the list failed too: what this call saw filed
      return err(502, names.length
        ? `${names.join(", ")} ${names.length === 1 ? "was" : "were"} filed; ${what} (${e.message}) — withdraw ${names.length === 1 ? "it" : "them"} on the Review desk, then propose ${id} again`
        : `no changeset of ${id} was stored: ${what} (${e.message}) — propose it again`);
    };
    for (const { p, v } of ready) {
      try { filed.push(await fileValidated(d, key, v, p.body, actor)); }
      catch (e) { throw await halfWay(`the filing stopped at ${p.body.name}`, e); }
    }
    const jobRef = { id, ledger_id: row.ledger.id, result_sha256: row.result_sha256 };
    const n = plan.groups.reduce((s, g) => s + g.elements, 0);
    // The type_gap row is the bridge's (claimed false): the open route's are claimed and worded `type_gap:run · …` (cde-store typeGapRow).
    let gapRow = null, done;
    try {
      if (plan.groups.length) gapRow = await d.audit(proj.id, "type_gap", null, `type_gap:run ${id} · ${PLANNER} · ${plan.groups.length} group(s), ${n} element(s)`, actor || "web", null,
        { groups: plan.groups, source: row.reader, job: jobRef, guideline: guideline.label, catalog: catalog.label, claimed: false });
    } catch (e) { throw await halfWay("the type-gap row was not written", e); }
    const changesets = filed.map((c) => ({ id: c.id, name: c.name, elements: c.elements.length, preticked: c.elements.filter((e) => e.pretick).length }));
    const storeys = plan.storeys.map((p) => ({ ...storeyRecord(p.storey), changeset: filed.find((c) => c.job.storey.cid === p.storey.cid)?.id ?? null }));
    const gaps = { groups: plan.groups.length, elements: n, ledger: ledgerRef(gapRow) };
    // The planner run's own build:run row (design :832) — never mistaken for the job's (decision 11's prefix is `· sentinel-survey `).
    try {
      done = await d.audit(proj.id, "build", null, `build:run ${id} · ${PLANNER} ${PLANNER_VERSION} · proposed`, actor || "web", null, {
        job_id: id, planner: PLANNER, version: PLANNER_VERSION, survey_row: row.ledger, result_sha256: row.result_sha256, frame: { ...frame, stated_by: by },
        storeys, changesets, gaps, already_filed: plan.already_filed, overlaps, guideline: guideline.label, guideline_sha256: guideline.sha256,
        catalog: catalog.label, catalog_sha256: catalog.sha256, model_calls: 0, tokens: 0, claimed: false });
    } catch (e) { throw await halfWay("the planner's build:run row was not written", e); }
    return { job: id, survey_row: row.ledger, frame, storeys, changesets, gaps, already_filed: plan.already_filed, overlaps, ledger: ledgerRef(done) };
  }
}
```
  Run `npx vitest run bridge/changesets-store.test.mjs bridge/changesets-logic.test.mjs` → passes (the existing `proposeChangeset` tests unchanged).
- [ ] **Step 4: commit** — `feat(bridge): MA-4d - proposeFromJob: changesets per storey built by the bridge, the gaps' row, the planner's build:run row; rows name the job and evidence`

### Task 8 — Bridge: gap groups carry the job; the proposal model draws the thickness

**Files:** modify `WebApp/bridge/holding-logic.mjs` (:125), `WebApp/bridge/proposal-model.mjs` (:41, :55); tests `holding-logic.test.mjs`, `proposal-model.test.mjs` (:29, :109).

- [ ] **Step 1: the tests first** — `holding-logic.test.mjs`, in the `typeGapGroups` describe:
```js
  it("MA-4d: a survey run's group carries its job and evidence ids; a Promote run's carries none", () => {
    const SCAN = { category: "Walls", want: "BDS_EXT_ARC_CMU_250 mm", size: "250 mm", key: "Location Exterior, 250 mm", elements: 2,
      labels: ["GR-FFL · scan-L00-wall-4", "Scan L01 job-0002 · scan-L01-wall-3"], nearest: [], evidence: ["ev-0001#slice-L00", "ev-0001#slice-L01"] };
    const survey = { id: 950, at: at(9), hash: hash(950), actor: "lead@example.test", action: "type_gap:run job-0002 · survey-planner · 1 group(s), 2 element(s)",
      new_value: { groups: [{ id: typeGapId(SCAN), ...SCAN }], source: "sentinel-survey", job: { id: "job-0002", ledger_id: 2201 }, claimed: false } };
    expect(typeGapGroups([survey], [], NO_CATALOG, same).open[0]).toMatchObject({ job_id: "job-0002", evidence: SCAN.evidence, source: "sentinel-survey", claimed: false, elements: 2 });
    expect(typeGapGroups([run(901, 1, [WALL])], [], NO_CATALOG, same).open[0]).toMatchObject({ job_id: null, evidence: [] });
    // the open route's typeGapRow keeps a poster's other keys ({...v, groups, claimed: true}): a claimed row naming a job shows none
    const forged = { ...survey, id: 951, new_value: { ...survey.new_value, claimed: true } };
    expect(typeGapGroups([forged], [], NO_CATALOG, same).open[0]).toMatchObject({ job_id: null, evidence: [], claimed: true });
  });
```
`proposal-model.test.mjs`: `:29` → `create("floor", { Boundary: […], BaseElevation: 3000 }, { facts: { thickness_mm: 300 } })`; `:109` → `create("wall", { LocationCurve: { start: [0, 0, 0], end: [0, 5000, 0] } }, { facts: { thickness_mm: 300 } })`; and add in `describe("proposalElements — Next")`:
```js
  it("MA-4d: a wall's thickness is its facts.thickness_mm (a survey's measurement); a place.Thickness is never stored (PLACE_KEPT), so not read", () => {
    const at300 = proposalElements({ elements: [create("wall", { LocationCurve: { start: [0, 0, 0], end: [8000, 0, 0] }, BaseElevation: 0, TopElevation: 2800 }, { facts: { thickness_mm: 300 } })] });
    expect(at300.elements[0].size.z).toBeCloseTo(0.3, 9);
    expect(proposalElements({ elements: [wall({ Thickness: 300 })] }).elements[0].size.z).toBeCloseTo(0.2, 9);
  });
```
- [ ] **Step 2: the code** — `holding-logic.mjs:125`, after `claimed`:
```js
        // MA-4d: a survey run's job and the group's evidence ids (design §6.6) — the newest run's, as its source and claim are — read only from
        // a row the bridge wrote (claimed false): the open route's typeGapRow keeps a poster's other keys, and a job id is a trust field.
        // ponytail: one group per missing type across survey and Promote runs, showing the newest run's job and evidence; per-run evidence lists when a lead needs both.
        job_id: r.new_value?.claimed === false ? r.new_value?.job?.id ?? null : null,
        evidence: r.new_value?.claimed === false && Array.isArray(g.evidence) ? g.evidence : [],
```
  extend the `typeGapGroups` doc list with `job_id, evidence`. `proposal-model.mjs`: add after the constants `/** MA-4d: a wall's or slab's thickness — the facts the bridge typed it from (a survey's measurement, or a poster's fact); the place holds none (PLACE_KEPT has no Thickness). */ const thicknessOf = (el) => (el.facts?.thickness_mm > 0 ? el.facts.thickness_mm : SKETCH_THICKNESS_MM);`; `:41` → `const thick = thicknessOf(el);`; `:55` → `const thickMm = thicknessOf(el);`. Run both files → pass.
- [ ] **Step 3: commit** — `feat(bridge): MA-4d - gap groups carry their job and evidence; the proposal model draws a wall at its facts' thickness`

### Task 9 — Bridge: the route, and who may use it

**Files:** modify `WebApp/bridge/bcf-service.mjs` (before :1691); test `write-roles.test.mjs` (after :1135).

- [ ] **Step 1: the test first** — `write-roles.test.mjs`:
```js
describe("survey proposals (MA-4d): a signed-in lead only; every refusal before anything is written", () => {
  const P = "/cde/demo/build/jobs/job-0001/propose", B = { frame: { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 } };
  it("the machine credential, a viewer and a contributor may not; a lead meets the job's own refusal — no row, no changeset", async () => {
    const rows = db.audit_log.length;
    expect(await call("POST", P, "machine", B)).toEqual({ status: 403, body: { message: "proposing from a survey job needs a person — the frame and levels it states are a lead's, and its pre-ticks rest on them: sign in. Nothing was saved." } });
    expect(await call("POST", P, "contributor", B)).toEqual({ status: 403, body: { message: "this action requires the lead role (you are contributor) — proposing from a survey job is a lead's: the frame and levels it states decide where every ghost lands; nothing was saved" } });
    expect((await call("POST", P, "viewer", B)).status).toBe(403);
    expect(await call("POST", P, "lead", B)).toEqual({ status: 404, body: { message: "no survey job job-0001 on demo — nothing was saved" } });
    expect(await call("POST", "/cde/demo/build/jobs/nope/propose", "lead", B)).toEqual({ status: 400, body: { message: "a survey job is named job-NNNN — nothing was saved" } });
    expect(db.audit_log.length).toBe(rows);
  });
  it("a changeset_ row is the bridge's: the machine credential cannot post a changeset_applied naming a job through the open route", async () => {
    const rows = db.audit_log.length;
    expect(await call("POST", "/cde/demo/audit", "machine", { entity_type: "changeset", entity_id: "c1", action: "changeset_applied", new_value: { job: { id: "job-0002" }, evidence: [{ id: "ev-0001", sha256: "e1".repeat(32) }] } }))
      .toEqual({ status: 400, body: { message: "changeset_ rows are written by Sentinel, not through this route" } });
    expect((await call("POST", "/cde/demo/audit", "lead", { action: " Changeset_Reverted c1" })).body.message).toBe("changeset_ rows are written by Sentinel, not through this route"); // a lead's note
    expect(db.audit_log.length).toBe(rows);
  });
});
```
- [ ] **Step 2: the code** — `cde-store.mjs:1207`: append the prefix, after the two entries whose own words `ledger-write.test.mjs:84-85` pin (`find` returns the first prefix that matches, so those two keep their words):
```js
// MA-4d (review): every changeset_ row is the bridge's (changesets-store audit(), never this route) — drill MA4 reads changeset_proposed and
// changeset_applied as the record of a survey's evidence and job, and the desk reads changeset_applied / _reverted by entity_id. No client
// posts one here: the add-in posts build, naming, family_heal and the XC-5 report types; its Undo goes to POST /changesets/:key/:id/reverted.
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:", "hold:", "review:", "changeset_reviewed", "changeset_reopened", "changeset_", "geometry linked", "evidence:", "attestation:"];
```
  Then `bcf-service.mjs`, before the MA-4c block (:1691):
```js
      // MA-4d: POST /cde/:key/build/jobs/:id/propose {frame, levels?} → 201 — a signed-in lead turns a done survey job into one changeset per
      //   storey that the bridge builds from the job's result (changesets-store proposeFromJob); the machine credential is a 403. Its own branch:
      //   the jobs block below ends at :id (`!seg[5]`).
      if (p2 === "build" && p3 === "jobs" && p4 && seg[5] === "propose" && !seg[6] && req.method === "POST") {
        const cs = await import("./changesets-store.mjs");
        return send(res, 201, await cs.proposeFromJob(p1, p4, (await readBody(req, { max: SMALL_JSON })) || {}, "web"));
      }
```
Run `npx vitest run bridge/write-roles.test.mjs bridge/ledger-write.test.mjs` → passes (the two pinned changeset_ words unchanged).
- [ ] **Step 3: commit** — `feat(bridge): MA-4d - POST /cde/:key/build/jobs/:id/propose (a signed-in lead); every changeset_ row reserved to the bridge`

### Task 10 — The pin: the deployed DTO reads a survey changeset (no add-in change)

**Files:** modify `tools/promote-check/Trust.cs` (after :26).

- [ ] **Step 1:**
```csharp
        // MA-4d: a survey changeset as proposeFromJob stores it on the drill's numbers — the shared fixture contract2-survey.json, whose `stored`
        // vitest holds the stored doc to. The DEPLOYED ChangesetDto reads it (its job, measured and trim_mm are fields it does not know: ignored);
        // the source is not a claim; the bridge's pre-tick is read — and Revit still opens every create unticked (no add-in change in MA-4d).
        string survey;
        using (var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "contract2-survey.json"))))
            survey = fx.RootElement.GetProperty("stored").GetRawText();
        var sv = JsonSerializer.Deserialize<ChangesetDto>(survey);
        Ok(sv.Claimed == false && ChangesetTrust.SourceLabel(sv) == "sentinel-survey 0.1.0" && sv.Elements.Count == 3 && sv.Exceptions.Count == 3,
           "MA-4d: a survey changeset reads — its job, measured and trims ignored; its source is no claim; its gaps are sent to a person");
        Ok(sv.Elements.All(e => e.Pretick == true && ChangesetTrust.Accuracy(e) == "within tolerance" && ChangesetTrust.Typing(e) != null && e.Cid != null && !ChangesetTrust.PreTick(sv, e)),
           "…each wall pre-ticked by the bridge, within tolerance, typed by the bridge — and opened unticked: a person ticks a create");
```
Run `dotnet run --project tools/promote-check` → all pass (two more checks than on master).
- [ ] **Step 2: commit** — `test(tools): MA-4d - promote-check reads a survey changeset into the deployed ChangesetDto`

### Task 11 — Web: Propose…, the desk's words, the gap card

**Files:** modify `WebApp/src/setups/evidence.ts`, `files-panel.ts`, `holding.ts`, `review-desk.ts`; tests `evidence.test.ts`, `review-desk.test.ts`.

- [ ] **Step 1: the tests first** — `evidence.test.ts` (import `proposeBody, proposeFromJob, proposeLine, type ProposeReply`):
```ts
describe("survey proposals (MA-4d)", () => {
  const FRAME = { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 0 };
  const REPLY: ProposeReply = { job: "job-0002", survey_row: { id: 2201, hash: HASH }, frame: FRAME,
    storeys: [{ cid: "scan-L00-level", level: "GR-FFL", how: "named", elevation_mm: 0, delta_mm: null, checked: false, from: null, changeset: "c1" },
      { cid: "scan-L01-level", level: "Scan L01 job-0002", how: "created", elevation_mm: 3000, delta_mm: 0, checked: true, from: null, changeset: "c2" }],
    changesets: [{ id: "c1", name: "Survey job-0002 · GR-FFL", elements: 3, preticked: 0 }, { id: "c2", name: "Survey job-0002 · Scan L01 job-0002", elements: 4, preticked: 4 }],
    gaps: { groups: 3, elements: 6, ledger: { id: 2209, hash: HASH } }, already_filed: 0, overlaps: [], ledger: { id: 2210, hash: HASH } };
  it("proposeBody: numbers as typed (a blank is 0; anything else the bridge refuses in words), a level only where one is named", () => {
    expect(proposeBody({ dx: "40000", dy: "", dz: " 0 ", rot: "0", levels: [["scan-L00-level", " GR-FFL "], ["scan-L01-level", "  "]] }))
      .toEqual({ frame: FRAME, levels: { "scan-L00-level": "GR-FFL" } });
    expect(proposeBody({ dx: "4 m", dy: "0", dz: "0", rot: "0", levels: [] })).toEqual({ frame: { ...FRAME, dx_mm: NaN } });
  });
  it("Propose posts to …/build/jobs/:id/propose; the line counts what was filed, pre-ticked and held, and how each storey met its level", async () => {
    bwrite.mockResolvedValue(REPLY);
    const r = await proposeFromJob("http://b", "demo", "job-0002", { frame: FRAME });
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/build/jobs/job-0002/propose", expect.objectContaining({ method: "POST", body: JSON.stringify({ frame: FRAME }) }));
    expect(proposeLine(r)).toBe("✓ Proposed job-0002 — 2 changeset(s), 7 ghost(s), 4 pre-ticked on the Review desk (Revit leaves every create for a person to tick) · " +
      "3 type-gap group(s), 6 element(s) in the Holding Area · scan-L00-level → GR-FFL (named, its height not checked); scan-L01-level → Scan L01 job-0002 (created) · " +
      "ledger #2210 · receipt abababababababab… — Review ▸ ↻");
    expect(proposeLine({ ...REPLY, already_filed: 6, overlaps: [{ changeset: "Survey job-0001 · GR-FFL", job_id: "job-0001", evidence: ["ev-0001"] }] }))
      .toContain(" · 6 already filed (not proposed again) · the same scan was placed before by Survey job-0001 · GR-FFL · ledger #2210");
  });
  it("evidenceControls: Propose is a lead's, never the machine session's", () => {
    expect(["viewer", "contributor", "lead", "owner", "service"].map((r) => evidenceControls(r).propose)).toEqual([false, false, true, true, false]);
  });
});
```
`review-desk.test.ts` (import `trustWords, sourceWords, type Ghost`):
```ts
describe("survey ghosts (MA-4d)", () => {
  const G: Ghost = { proposal_guid: "g1", kind: "wall", op: "create", cid: "scan-L00-wall-1", evidence: ["ev-0001#slice-L00"], pretick: true, trim_mm: [-140, -136],
    measured: { thickness_mm: 300, height_mm: 2800 }, accuracy: { status: "within_tolerance", basis: "fit", from_job: "job-0002", fit_rmse_mm: 2, face_dev_mm: 0, target_mm: 20 },
    place: { TypeName: "BDS_EXT_ARC_CMU_300 mm", LevelName: "GR-FFL" }, validate: { identity: { Name: "scan-L00-wall-1" } } };
  it("trustWords: what was measured, from which job, the fit and the faces against D7's 20 mm, the pre-tick, the trims, the evidence — nothing for an unmeasured ghost", () => {
    expect(trustWords(G)).toBe("measured from job-0002 · 300 mm thick · fit 2 mm rms · faces 0 mm off · within tolerance (20 mm) · pre-ticked · ends -140 / -136 mm to the corners · evidence ev-0001#slice-L00");
    expect(trustWords({ ...G, pretick: false })).toContain(" · not pre-ticked · ");
    expect(trustWords({ proposal_guid: "g2", kind: "wall", accuracy: { status: "not_measured" } })).toBe("");
  });
  it("sourceWords: the job, its row, the frame and who stated it, the storey's level and whether its height was checked", () => {
    const cs = { id: "c", name: "Survey job-0002 · GR-FFL", source: "sentinel-survey 0.1.0", claimed: false, status: "proposed", created_at: "", elements: [G],
      job: { id: "job-0002", ledger_id: 2201, frame: { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 0, stated_by: "lead@example.test" }, storey: { level: "GR-FFL", how: "named", checked: false } } } as PendingChangeset;
    expect(sourceWords(cs)).toBe("from survey job-0002 (ledger #2201) · the scan moved 40000, 0, 0 mm, turned 0°, stated by lead@example.test · storey GR-FFL (named — its height not checked: nothing here is pre-ticked)");
    expect(sourceWords({ ...cs, job: { id: "job-0002", ledger_id: 2201, frame: { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 }, storey: { level: "Scan L01 job-0002", how: "created", checked: true } } }))
      .toBe("from survey job-0002 (ledger #2201) · the scan at the model's internal origin · storey Scan L01 job-0002 (created)");
    expect(sourceWords({ ...cs, job: { ...cs.job!, overlaps: [{ changeset: "Survey job-0001 · GR-FFL", job_id: "job-0001", evidence: ["ev-0001"] }] } }))
      .toMatch(/ · the same scan ev-0001 was placed before by Survey job-0001 · GR-FFL$/);
    expect(sourceWords({ ...cs, job: null })).toBe("");
  });
});
```
- [ ] **Step 2: the code** —
  - `evidence.ts`: `evidenceControls` gains `propose: canGovernRole(role) && role !== "service",` (its comment: "MA-4d: Propose a lead's, never the machine session's — the frame and levels it states are a person's"); after `readJob`:
```ts
/** MA-4d: what POST …/build/jobs/:id/propose answers. */
export interface ProposeReply {
  job: string; survey_row: Ledger; frame: { dx_mm: number; dy_mm: number; dz_mm: number; rotation_deg: number };
  storeys: { cid: string; level: string; how: "named" | "matched" | "created" | "filed"; elevation_mm: number; delta_mm: number | null; checked: boolean; from: string | null; changeset: string | null }[];
  changesets: { id: string; name: string; elements: number; preticked: number }[];
  gaps: { groups: number; elements: number; ledger: Ledger | null }; ledger: Ledger;
  /** Decision 19: candidates this job filed before (not proposed again); another job's placed changesets on the same scan bytes. */
  already_filed: number; overlaps: { changeset: string; job_id: string; evidence: string[] }[];
}
/** The lead's form → the body: numbers as typed (a blank is 0; anything else the bridge refuses in words), a level only where one is named. Pure. */
export function proposeBody(v: { dx: string; dy: string; dz: string; rot: string; levels: [string, string][] }) {
  const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const levels = Object.fromEntries(v.levels.filter(([, name]) => name.trim()).map(([cid, name]) => [cid, name.trim()]));
  return { frame: { dx_mm: n(v.dx), dy_mm: n(v.dy), dz_mm: n(v.dz), rotation_deg: n(v.rot) }, ...(Object.keys(levels).length ? { levels } : {}) };
}
/** Propose: the bridge builds the changesets from the job's own result — only the frame and the levels go from here. */
export const proposeFromJob = (base: string, key: string, id: string, body: ReturnType<typeof proposeBody>) =>
  post<ProposeReply>(base, key, `build/jobs/${encodeURIComponent(id)}/propose`, body);
/** The status line after Propose. Pure. */
export function proposeLine(r: ProposeReply): string {
  const ghosts = r.changesets.reduce((s, c) => s + c.elements, 0), pre = r.changesets.reduce((s, c) => s + c.preticked, 0);
  const levels = r.storeys.map((s) => `${s.cid} → ${s.level} (${s.how}${s.checked ? "" : ", its height not checked"})`).join("; ");
  const again = r.already_filed ? ` · ${r.already_filed} already filed (not proposed again)` : "";
  const placed = r.overlaps.length ? ` · the same scan was placed before by ${r.overlaps.map((o) => o.changeset).join(", ")}` : "";
  return `✓ Proposed ${r.job} — ${r.changesets.length} changeset(s), ${ghosts} ghost(s), ${pre} pre-ticked on the Review desk (Revit leaves every create for a person to tick) · ` +
    `${r.gaps.groups} type-gap group(s), ${r.gaps.elements} element(s) in the Holding Area · ${levels}${again}${placed} · ${ledgerLine(r.ledger)} — Review ▸ ↻`;
}
```
(`proposeBody`'s NaN goes as JSON `null`: the bridge answers `frame.dx_mm must be a number of mm …`.)
  - `files-panel.ts`: `:19` imports `proposeBody, proposeFromJob, proposeLine`; state after `:88`: `// MA-4d: the done job a lead is proposing (its form open) and its storeys (read with the job). let proposing: string | null = null; let proposeLevels: Candidate[] | null = null;`; `load()` (:214) → `jobOpen = null; jobCands = null; proposing = null; proposeLevels = null;`; wiring after the `[data-evjob]` block (:301):
```ts
    root.querySelectorAll<HTMLElement>("[data-evpropose]").forEach((n) => n.addEventListener("click", async () => {
      const id = n.dataset.evpropose!;
      if (proposing === id) { proposing = null; proposeLevels = null; render(); return; }
      const mine = seq;
      try {
        const r = await readJob(base, pid(), id);
        if (mine !== seq) return;
        if (r.result_error) { status(`Not proposed — ${r.result_error}`); return; }
        proposing = id; proposeLevels = (r.candidates ?? []).filter((c) => c.kind === "level"); render();
      } catch (e) { if (mine === seq) status(`Not proposed — ${(e as Error).message}`); }
    }));
    root.querySelector<HTMLButtonElement>("#fv-pr-ok")?.addEventListener("click", (ev) => {
      // MA-4d (review): one press, one proposal — the bridge's per-project lock is the guard; this is the courtesy (evAct's load() re-renders it).
      const btn = ev.currentTarget as HTMLButtonElement;
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = "Proposing…";
      const v = (s: string) => (root.querySelector(s) as HTMLInputElement | null)?.value ?? "";
      const levels = [...root.querySelectorAll<HTMLInputElement>("[data-prlevel]")].map((i) => [i.dataset.prlevel!, i.value] as [string, string]);
      const body = proposeBody({ dx: v("#fv-pr-dx"), dy: v("#fv-pr-dy"), dz: v("#fv-pr-dz"), rot: v("#fv-pr-rot"), levels });
      const id = proposing!;
      void evAct(async () => proposeLine(await proposeFromJob(base, pid(), id, body)));
    });
```
  and in the Survey block (:561-565): the intro's last sentence → `A lead proposes a done job: the bridge types its candidates exactly (the office's catalogue) into one changeset per storey for review, and holds the rest as type gaps.`; after the Candidates button:
```ts
            (j.status === "done" && j.candidates_total && can.propose ? `<div style="padding:.1rem .2rem"><button data-evpropose="${esc(j.id)}" style="${act}">${proposing === j.id ? "Cancel proposal" : "Propose…"}</button></div>` : "") +
            (proposing === j.id ? proposeForm(proposeLevels ?? []) : "") +
```
  with, inside `evidenceSection` after `inp` (:529):
```ts
    // MA-4d: the lead's two statements — where the scan sits in the model, and which existing level each scanned storey is (blank: matched from
    // a published IFC within 20 mm, or created). Everything else the bridge builds from the job.
    const proposeForm = (levels: Candidate[]) =>
      line("Where the scan sits in the model: the move and turn from the model's internal origin to the scan's origin (all 0 when the scan is registered to it). You state it; every ghost lands by it.", "#9ca3af") +
      `<div style="display:flex;gap:.3rem;flex-wrap:wrap;align-items:center;font-size:11px;padding:.15rem .2rem">x <input id="fv-pr-dx" value="0" style="${inp};width:6rem"/> y <input id="fv-pr-dy" value="0" style="${inp};width:6rem"/> z <input id="fv-pr-dz" value="0" style="${inp};width:5rem"/> mm, turned <input id="fv-pr-rot" value="0" style="${inp};width:4rem"/> °</div>` +
      levels.map((c) => `<div style="display:flex;gap:.3rem;align-items:center;font-size:11px;padding:.1rem .2rem"><span>${esc(c.cid)} at ${esc(String(c.geometry.BaseElevation))} mm (scan) → existing level</span><input data-prlevel="${esc(c.cid)}" placeholder="blank: a published level within 20 mm, or a new one" style="${inp};flex:1"/></div>`).join("") +
      `<div style="padding:.15rem .2rem"><button id="fv-pr-ok" style="${act};color:#c4b5fd">Propose</button></div>`;
```
  the gap card (:476-477) appends after the claim text: `${x.job_id ? ` · from survey ${esc(x.job_id)}` : ""}${x.evidence?.length ? ` · evidence ${esc(x.evidence.slice(0, 3).join(", "))}` : ""}`.
  - `holding.ts` `TypeGap` (:26): `/** MA-4d: a survey run's job and the group's evidence ids. */ job_id?: string | null; evidence?: string[];`.
  - `review-desk.ts`: after `GhostReview`:
```ts
/** MA-4d: the survey job a changeset was built from by the bridge (its `job` field; the source stays a string). */
export interface DeskJob {
  id: string; ledger_id: number | null;
  frame?: { dx_mm: number; dy_mm: number; dz_mm: number; rotation_deg: number; stated_by?: string };
  storey?: { level: string; how: string; checked: boolean };
  /** Decision 19: another job's placed changesets on the same scan bytes — named, never refused. */
  overlaps?: { changeset: string; job_id: string; evidence: string[] }[];
}
```
  `Ghost` gains `cid?: string; evidence?: string[]; pretick?: boolean; trim_mm?: number[]; measured?: Record<string, number>; accuracy?: { status: string; basis?: string; from_job?: string; fit_rmse_mm?: number | null; face_dev_mm?: number | null; target_mm?: number } | null;`; `PendingChangeset` gains `job?: DeskJob | null;`. After `reviewWords`:
```ts
/** MA-4d: a ghost the bridge built from a survey job, in words — what was measured, from which job, the fit and the faces against D7's 20 mm, whether the
 *  bridge pre-ticked it, its trimmed ends and its evidence; "" for a ghost nothing measured. Pure. */
export function trustWords(el: Ghost): string {
  const a = el.accuracy;
  if (!a?.from_job) return "";
  const t = el.measured?.thickness_mm, trim = el.trim_mm ?? [];
  return [`measured from ${a.from_job}`, ...(t != null ? [`${t} mm thick`] : []), ...(a.fit_rmse_mm != null ? [`fit ${a.fit_rmse_mm} mm rms`] : []),
    ...(a.face_dev_mm != null ? [`faces ${a.face_dev_mm} mm off`] : []), `${a.status.replace(/_/g, " ")}${a.target_mm != null ? ` (${a.target_mm} mm)` : ""}`, el.pretick ? "pre-ticked" : "not pre-ticked",
    ...(trim.some((v) => v !== 0) ? [`ends ${trim.join(" / ")} mm to the corners`] : []),
    ...(el.evidence?.length ? [`evidence ${el.evidence.slice(0, 3).join(", ")}`] : [])].join(" · ");
}
/** MA-4d: a survey changeset's origin in words — its job and row, the lead's frame and who stated it, how its storey met its level, and
 *  another job's placed changesets on the same scan (decision 19: named, never refused). "" else. Pure. */
export function sourceWords(cs: PendingChangeset): string {
  const j = cs.job;
  if (!j) return "";
  const f = j.frame, s = j.storey;
  const frame = f ? ` · the scan ${f.dx_mm || f.dy_mm || f.dz_mm || f.rotation_deg ? `moved ${f.dx_mm}, ${f.dy_mm}, ${f.dz_mm} mm, turned ${f.rotation_deg}°` : "at the model's internal origin"}${f.stated_by ? `, stated by ${f.stated_by}` : ""}` : "";
  const o = j.overlaps ?? [];
  const again = o.length ? ` · the same scan ${[...new Set(o.flatMap((x) => x.evidence))].join(", ")} was placed before by ${o.map((x) => x.changeset).join(", ")}` : "";
  return `from survey ${j.id} (ledger #${j.ledger_id ?? "?"})${frame}${s ? ` · storey ${s.level} (${s.how}${s.checked ? "" : " — its height not checked: nothing here is pre-ticked"})` : ""}${again}`;
}
```
  render: after `box.append(hrow);` (:414) `for (const cs of s.changesets) { const w = sourceWords(cs); if (w) box.append(el("div", w, "color:#8b93a1;font-size:11px")); }`; after the `words.append(…)` line (:424) `const tw = trustWords(x.el); if (tw) words.append(el("div", tw, "color:#8b93a1;font-size:11px"));` (textContent: no escaping here).
  Run `npx vitest run src/setups/evidence.test.ts src/setups/review-desk.test.ts src/setups/html-sinks.test.ts` → pass; `npm run build` builds.
- [ ] **Step 3: commit** — `feat(web): MA-4d - Propose… under a done survey job (a lead's frame and levels); the desk's trust words; the gap card's job and evidence`

### Task 12 — Docs: the design amendments

**Files:** modify `docs/strategy/2026-09-30-model-automation-design.md`.

- [ ] **Step 1:**
  - `:169` rule 6: append ` MA-4d: a scan ghost's \`within_tolerance\` before placement is judged on its fit (each face's inlier points against its own line) and on \`face_dev_mm\` (how far the scanned faces' ends sit from the ghost's faces): \`accuracy.basis: "fit"\`; \`verify:measured\` (MA-4e) judges the placed element (\`basis: "deviation"\`).`
  - `:679` → `**Field changes** (the changeset parity is \`PLACE_KEPT\`, \`changesets-logic.mjs\`, name for name with the add-in's \`PlaceDto\`, and the shared fixtures \`WebApp/bridge/fixtures/changeset-ops/*.json\` that vitest and \`tools/promote-check\` both read — \`contract-parity.test.mjs\` pins the delivery gate):`
  - after `:740` add `- MA-4d spec amendment S1 (trust): \`measured\` counts only on a changeset the bridge builds itself from a survey job it trusts — \`POST /cde/:key/build/jobs/:id/propose\`: the job's own \`build:run\` row by MA-4c decision 11's predicate, \`result.json\` re-hashed against it, every scan it read still the admitted bytes; the elements are the job's candidates (trimmed, then moved by the lead's frame), so a trusted measurement cannot travel with other geometry. A body that names \`source.job_id\` backs nothing (listed: "a job named in a body backs nothing — …"); an agent's post is never measured. A third-party reader's job-backed post (bound to the candidates by cid) is later.`
  - after `:759` add `MA-4d (BUILT): the bridge's half for scan creates — within D7's 20 mm on the fit and the faces (\`face_dev_mm\`), the storey's level height checked (matched to a published level, or created), every size the type decides measured (a wall's thickness; never a floor's or ceiling's). Conflicts and BLOCK stay Revit's at Apply. Deployed add-ins open every create unticked whatever the bridge says (\`ChangesetTrust.PreTick\`); the web desk shows the pre-tick.`
  - `:832` append: ` MA-4d: the planner's run is its own row, \`build:run <job-id> · survey-planner 0.1.0 · proposed\` (claimed false; the survey row, frame, storeys, changesets, gaps, the standards' labels and shas, model_calls 0).`
  - `:833` append: ` MA-4d BUILT for survey jobs: a bridge-written row per proposal, action \`type_gap:run <job-id> · survey-planner · N group(s), M element(s)\`, claimed false, with the job {id, ledger_id, result_sha256} and each group's evidence ids; groups are exact sizes (no band while the snap is 0); a survey gap and a Promote gap that want the same type are one group.`
  - `:836` Status → `PARTLY BUILT (MA-4d): a survey changeset's row names its job, the evidence shas and, per ghost placed, its Revit UniqueId, reader id and evidence; the approver, warnings and BLOCK result stay TARGET.`
  - after `:837` add `- MA-4d: every \`changeset_\` row (proposed, applied, withdrawn, reverted, reviewed, reopened) is the bridge's — the open audit route refuses the prefix, since drill MA4 and the desk read these rows as fact (the MA-3a C5 precedent, widened).`
  - after `:879` add `- MA-4d spec amendment S2: \`POST /cde/:key/build/jobs/:id/propose\` {frame: {dx_mm, dy_mm, dz_mm, rotation_deg}, levels?: {storey cid: Revit level name}} → 201 — a signed-in lead (the machine credential and a contributor are 403s); the bridge builds one changeset per storey (\`Survey <job-id> · <level>\`, source \`sentinel-survey <version>\`, \`claimed: false\`, the job in its own \`job\` field), its gaps into one \`type_gap\` row, then one planner \`build:run\` row; per candidate — what the job's row already filed (proposed or placed, not rejected in Revit) is not proposed again, its storeys keep their levels; refused when nothing new is left, with a frame other than the job's, or while another job's changeset is proposed; another job's placed changesets on the same scan bytes are named, not refused; one proposal at a time per project; budgeted (6 per user, 12 in all, a minute).`
  - after `:957` add the row `| Turn a survey job into proposals (state its frame and levels) | lead, signed in (by name); the machine credential is a 403 (MA-4d) |`.
  - under `:1138` add `    - Met in MA-4d: one bridge-written \`type_gap\` row per proposal, with the job id and evidence ids; each gap also rides on its storey's changeset as "sent to a person".`
  - under `:1147` add `    - Met in MA-4d by \`changeset_proposed\` (job, evidence shas, each element's reader id and evidence) and \`changeset_applied\` (the same per ghost placed).`
  - `:1135` (the stale ":681-705" and ":728") → ":686-711" and ":733".
- [ ] **Step 2: commit** — `docs: MA-4d - the design: measured only on a bridge-built changeset (S1), the propose route (S2), pre-tick and accuracy as built, the planner and gap rows, the lead's row`

### Task 13 — Final checks (nothing to commit)

From `WebApp`: `npx vitest run 2>&1 | tail -6` (all pass; restore the fixture if listed), `npm run build 2>&1 | tail -3`, `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` (17). From the repo root: `dotnet run --project tools/promote-check` (all pass), `git diff --stat master -- SentinelAddin` → nothing, `git status --short` shows only `.claude/`, `ab.html` and the pre-existing `package-lock.json`. `grep -rn "migrations/" $(git diff --name-only master)` → nothing (no migration). Report the totals and `git log --oneline master..HEAD` (twelve commits).

## Live drill MA4d (the controller, after the build)

Machine rows (P-) on a drill copy of the bridge at **4101 on the branch** and the local web app against it (the founder's session for the person rows: a lead's proposal names a person); Revit rows (R-) **after the merge**, on the 4100 bridge restarted on master (the add-in's config points at 4100 on loopback; no config is changed). Project `ma4c-drill` (office `ma2e-office`), its job-0002 (#2201). Never `aster-tower`, Demo, a pilot file or a founder file. Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work (check before closing; if a Revit window holds unsaved changes, stop and ask).

- **P-0 set-up** — record `GET /cde/ma2e-office/artefacts/guideline` and `…/type_catalog` (expected `guideline@1` = bds-guideline.json, no catalogue: 404). Install on the **project**, with the machine credential as drill MA2e did: `b4101 PUT "cde/ma4c-drill/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-layerfree-guideline.json` and `b4101 PUT "cde/ma4c-drill/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json` → `guideline@n · project`, `type_catalog@n · project`. Standards only: no type is made anywhere. `GET /cde/ma4c-drill/manifests` → none (no published IFC). `certutil -hashfile %APPDATA%\Sentinel\jobs\ma4c-drill\job-0002\result.json SHA256` → `70c9845a…` (= #2201's `result_sha256`). Revit set-up (read-only until R-1): copy `%USERPROFILE%\Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` on disk to `%USERPROFILE%\Documents\Sentinel drills\ma4d.rvt`, open the copy in Revit 2024, bind it to `ma4c-drill` (Sentinel ▸ Project Setup); through the read-only Revit MCP record every level's name, `Elevation` and `ProjectElevation` (expected `GR-FFL` at 0 with both equal — if `Elevation ≠ ProjectElevation`, stop: the frame's dz must carry the difference), that `BDS_EXT_ARC_CMU_200 mm` and `BDS_EXT_ARC_CMU_300 mm` are loaded basic wall types (if one is missing, stop and ask: the drill does not load or make a type), the wall-type count, and that nothing stands in x 40 000–48 000 × y 0–6 000 mm on `GR-FFL`. Save the scratch copy (it is the drill's file).
- **P-1 refusals, no row, no changeset** — the machine credential `POST /cde/ma4c-drill/build/jobs/job-0002/propose {frame:{…zeros}}` → 403 "proposing from a survey job needs a person — …"; a contributor → 403 "this action requires the lead role (you are contributor) — …"; the lead: `{frame, pretick: true}` → 400 `pretick is not a proposal field — …`; no frame → 400 `frame is required — …`; `job-0099` → 404; then, on job-0001 (scratch data): change one byte of its `result.json` (a trailing space), propose → 409 `job-0001's result is not trusted: its result.json does not hash to the sha256 on ledger #2200 — it changed after the job — …`, restore it (certutil equals #2200's sha again); copy its `job.json`, set `ledger.id` to the forged open-route row #2188, propose → 409 `… ledger #2188 is not job-0001's own build:run row …`, restore the copy. The machine credential `POST /cde/ma4c-drill/audit {entity_type: changeset, entity_id: x, action: changeset_applied, new_value: {job: {id: job-0002}}}` → 400 `changeset_ rows are written by Sentinel, not through this route`. The ledger count and the changeset list are unchanged.
- **P-2 propose** — the founder (lead): Files ▸ Evidence ▸ Survey ▸ job-0002 ▸ **Propose…** → x `40000`, y `0`, z `0`, turned `0`; `scan-L00-level` → `GR-FFL`; `scan-L01-level` blank → **Propose** → `✓ Proposed job-0002 — 2 changeset(s), 7 ghost(s), 4 pre-ticked on the Review desk (Revit leaves every create for a person to tick) · 3 type-gap group(s), 6 element(s) in the Holding Area · scan-L00-level → GR-FFL (named, its height not checked); scan-L01-level → Scan L01 job-0002 (created) · ledger #N · receipt … — Review ▸ ↻`.
- **P-3 the rows** — `GET /cde/ma4c-drill/audit?since=<P-2>`: two `changeset_proposed` (`claimed: false`, `job {id: job-0002, ledger_id: 2201, result_sha256: 70c9845a…}`, `evidence [{id: ev-0001, sha256: <ev-0001's admitted sha>}]`, `from_job` per wall with `ev-0001#slice-L00`/`-L01`), their adjudication rows, one `type_gap` row `type_gap:run job-0002 · survey-planner · 3 group(s), 6 element(s)` (claimed false, job, groups: `BDS_EXT_ARC_CMU_250 mm` ×2 with `ev-0001#slice-L00`, `ev-0001#slice-L01`; Floors ×2; Ceilings ×2), one `build:run job-0002 · survey-planner 0.1.0 · proposed` (claimed false, `survey_row {id: 2201}`, frame with `stated_by` the founder, the two standards' labels and shas). No row was matched on `new_value.job_id`: #2201 is the one job.ledger.id names. **Zero types:** the catalogue's wall rows are unchanged (`GET …/artefacts/type_catalog` same sha as P-0).
- **P-4 once** — **Propose** job-0002 again (the same frame) → `Not done — nothing new to propose from job-0002 — every candidate that types is filed already (Survey job-0002 · GR-FFL: proposed; Survey job-0002 · Scan L01 job-0002: proposed): withdraw a proposed one on the Review desk to propose it again; an applied one stays applied here after an Undo in Revit — run the survey again to propose it afresh; nothing was saved`; with x `0` → `Not done — Survey job-0002 · GR-FFL (proposed) was filed from job-0002 with the scan moved 40000, 0, 0 mm, turned 0° — send that frame (one job is one frame), …; nothing was saved`; job-0001 → `Not done — Survey job-0002 · <a level> (from job-0002) is still proposed — decide or withdraw it before proposing another survey job: both would propose the same walls; nothing was saved`.
- **P-5 Holding Area** — Type gaps (3): `Walls: "BDS_EXT_ARC_CMU_250 mm" …` with `GR-FFL · scan-L00-wall-4, Scan L01 job-0002 · scan-L01-wall-3 · reported by <the founder> · sentinel-survey · … · from survey job-0002 · evidence ev-0001#slice-L00, ev-0001#slice-L01`, no "(claimed …)"; Floors and Ceilings "thickness not measured".
- **P-6 Review desk** (↻) — two storey boxes, `Survey job-0002 · GR-FFL` (3 ghosts) and `Survey job-0002 · Scan L01 job-0002` (4); under each, `from survey job-0002 (ledger #2201) · the scan moved 40000, 0, 0 mm, turned 0°, stated by <the founder> · storey GR-FFL (named — its height not checked: nothing here is pre-ticked)` / `… · storey Scan L01 job-0002 (created)`; per wall, e.g. `measured from job-0002 · 300 mm thick · fit 2 mm rms · faces 0 mm off · within tolerance (20 mm) · not pre-ticked · ends -140 / -136 mm to the corners · evidence ev-0001#slice-L00` (L01's: `pre-ticked`). **Show creates in 3D** on L01: the walls drawn 300 / 200 / 300 mm thick (not the 200 mm sketch), 2800 high, at x 40 125–47 850.
- Merge, restart the 4100 bridge on master, publish the web, design rows to LANDED with the drill's ledger ids, a secret scan of the range, push.
- **R-1 Revit 2024, storey L0 as one Undo** — the scratch copy, Review AI Proposals → `Survey job-0002 · GR-FFL` → three rows, **all unticked** (the deployed add-in: a create is never pre-ticked), source `sentinel-survey 0.1.0` with no "(claimed …)", each `· within tolerance`, `typed by the bridge from the facts posted (guideline@n · project · …)`, the reason as the tooltip (walls 1 and 2: `… ends -140 / -136 mm to the corners (the start to scan-L00-wall-4's centreline: a type gap, not placed) …`); three "Sent to a person" rows (wall-4, the floor, the ceiling); the ghost overlay outlines at x 40 125–47 850. Tick the three, Apply → one Undo entry; the walls are `BDS_EXT_ARC_CMU_300 mm`, `_200 mm`, `_300 mm` on `GR-FFL`, base offset 0, top unconnected at 2800; **two corners joined**, at (47 850, 150) and (47 850, 5 900); walls 1 and 2 have **free ends** at (40 125, 150) and (40 125, 5 900) — cut back to wall-4's centreline, 125 mm short of the scanned outer face at x 40 000, because wall-4 (250 mm) is a type gap and not placed (that corner closes when it is); the wall-type count equals P-0's (**zero types created**). The `changeset_applied` row: `job {id: job-0002, ledger_id: 2201, …}`, `evidence [{ev-0001, sha}]`, `from_job` with each wall's `revit_unique_id`, `cid` and `ev-0001#slice-L00` — **each wall's ledger row lists its evidence sha and its job id**.
- **R-2 Ctrl+Z** → the walls go; a `changeset_reverted` row `{op: undo, guids: the three, count: 3}`. Ctrl+Y → `{op: redo, …}`. Close the scratch copy without saving the placement (it is drill data); withdraw `Survey job-0002 · Scan L01 job-0002` (`POST /changesets/ma4c-drill/<id>/withdraw`, the machine credential). `Survey job-0002 · GR-FFL` stays `applied` on the bridge (an Undo writes a row only).
- **R-3 decision 19 per candidate** (the founder's session, against 4100) — **Propose** job-0002 again, frame 40000/0/0/0, levels blank → `✓ Proposed job-0002 — 1 changeset(s), 4 ghost(s), 4 pre-ticked … · 3 type-gap group(s), 6 element(s) in the Holding Area · scan-L00-level → GR-FFL (filed, its height not checked); scan-L01-level → Scan L01 job-0002 (created) · 3 already filed (not proposed again) · ledger #N …`: only L01 is filed again (its level create and walls 1, 2, 4); GR-FFL's three placed walls are not proposed twice and no `Survey job-0002 · GR-FFL` is filed (nothing new there: wall-4 is still a gap). Withdraw the new L01 changeset so the project is left with nothing proposed.

## Risks

- **The frame is the lead's statement.** A wrong move or turn lands every ghost wrong; the bridge cannot measure it, and it is outside the 20 mm. The overlay (MA-3c) and the desk's 3D show it before Apply; withdraw and propose again. MA-4g computes it from the scan's CRS and the model's map conversion.
- **A published IFC's frame.** Manifest storey elevations are the IFC export's (`ifc-manifest.mjs:125-131`); an export from the project base or survey point is off by that height, so an automatic match can pick a wrong level or none (then a duplicate level is created). The reply names the model; the lead's `levels` win.
- **`Level.Elevation` is Revit's level frame.** The executor creates and reads levels by `Elevation` (`ChangesetExecutor.cs:408-414`); a model whose levels measure from the survey point needs that offset in dz. P-0 records `Elevation` against `ProjectElevation`.
- **Revit never pre-ticks a create** (`ChangesetClient.cs:219`): the bridge's pre-tick is the web desk's only. Fail-safe; a C# change is Next.
- **Revit's typing words say "the facts posted"** (`ChangesetTrust.Typing`) for facts the bridge measured — cosmetic, no C# change.
- **Inside or outside is the C# rule's ceilings**: a closed courtyard reads Interior; a ray through a door gap reads a side open. The reason says what was read; a person sees the type before ticking.
- **Exact sizes split noisy thicknesses** into one group per millimetre (no band while D16's snap is 0); the drill's walls are exact.
- **Floors and ceilings** of a scan carry no thickness: typed only by an office rule that names a fixed type, never pre-ticked; with the BDS standards they are gaps ("thickness not measured") that only a dismissal or a new rule closes.
- **Survey and Promote gaps that want one type are one group**: the card shows the newest run's source and job; alternating runs can re-open a dismissal (C5) — the behaviour MA-2c already has.
- **Creates only.** Proposing a scan of a storey already modelled proposes every wall again; matching scan walls to model walls is MA-5 or later. Two jobs of one building cannot both be proposed at once (decision 19); a job run again on a scan another job already placed proposes every wall again — named on the reply, the planner row and the desk ("the same scan ev-0001 was placed before by …"), never refused (an Undo leaves a changeset `applied` on the bridge, so a refusal would be for ever). A person decides on the desk.
- **An Undo in Revit does not reopen a job's candidates**: `reportReverted` writes a row and leaves the doc `applied`, so an undone wall counts as filed — "run the survey again to propose it afresh" (a new job, its own row). Status from the newest `changeset_reverted` is Next.
- **A re-proposed storey whose created level is still only proposed** files walls on a level its first changeset creates: apply that storey's first changeset first (the ponytail on `matchStoreys`).
- **The proposal lock is one bridge process.** The drill copy at 4101 and the 4100 bridge serving one project could still race; a per-job unique doc key when two bridges serve one project.
- **A filing stopped half way** (the store or the ledger down between storeys, or at the type-gap or planner row): a 502 names what WAS filed, from the store listed again (a doc stored before its row failed is named too), and the bridge log says why; withdraw it and propose again (decision 19 then proposes everything again).
- **`face_dev_mm` reads the faces' ends**, not their points: a bowed face between straight ends passes; MA-4e's deviation against the placed element catches it.
- **A storey over 200 elements** is a 413 (MA-4h).
- **job.json is editable on the PC**: its `ledger.id` can name another row, which the predicate refuses (the path's job id, the project, the action, claimed, the sha). `result.json` edited after the job fails the sha.

## Next (out of scope here)

- **MA-4e** — `POST /measure`, `verify:measured` (p95, coverage, deviation at 5/10/20 cm): `accuracy.basis` becomes `deviation`; the pre-tick reads it. **MA-4f** — the decimated scan overlay in Revit; then the add-in's pre-tick of a measured create (one line in `ChangesetTrust.PreTick` when `Claimed == false` and the accuracy is `within_tolerance`, pinned by flipping `Trust.cs`'s "a create is never pre-ticked"; deploy 2021–2027). **MA-4g** — E57, LAZ, the CRS; a computed frame (the scan's CRS + `IfcMapConversion`, or a registration report with its rmse — counted in the tolerance). **MA-4h** — Kladno: run time, level error, wall F1, a storey over 200 (StoreyBatch accepting the survey source: C#), size bands. **MA-4i** — the scan in the web desk. **MA-5** — openings, mitred joins (GHB-6), scan walls matched to existing walls (retype or attach instead of create). **MA-7** — NOTICE.
- An external reader's contract-2 post bound to a job's candidates by cid (geometry compared after the frame and trims); a project frame artefact when several jobs share one frame; a shared WallLocation fixture read by both C# and JS.
- A changeset's status from its newest `changeset_reverted` row, so an Undo in Revit reopens a job's candidates (decision 19 then proposes them again without a new survey run); a per-job unique doc key so two bridges serving one project cannot both file a job.

## Critique applied (review round 2)

- **F1 trustedJob's test deps** (Task 4): the `D` object built at collection time (`jobsRoot` undefined → the real `%APPDATA%\Sentinel\jobs`) is gone; every call uses the file's own `deps()`, built per test after `beforeEach` sets `root`.
- **F2 NO_JOB in `contract2-typed-body.json:31`** (Task 6, File map): updated with the other two copies; `grep` after the step finds none of the old words; no C# change (promote-check does not read `ignored`).
- **F3 + T3 decision 19 per candidate, keyed on the row** (decision 19, Tasks 5 and 7, Risks, Next, drill P-4 and R-3): a cid this job's row (`job.ledger_id`, not the reusable job id) filed on a proposed or placed changeset, less `result.rejected`, is dropped but still trimmed and located against; a filed storey keeps its level (`how: "filed"`); 409 only when nothing new is left (words name the Undo); another job's applied changesets on the same scan bytes are `overlaps`, named on the changeset's `job`, the reply, the planner row and the desk, never refused; the ponytail names creates-only, MA-5 and status-from-revert. Store tests (j) and (k). Added with it: a re-proposal must send the frame the job was filed with (one job is one frame), else 409 — without it two storeys of one scan could land in two frames.
- **F4 `face_dev_mm`** (decisions 14/15, Task 5, fixture, desk, Open question 1): judged as `max(fit rmse, face_dev_mm)`; computed on the drill's result at planning: 0 on all eight walls, so no drill number moves; a test turns face b 3° → 194 mm, `out_of_tolerance`, not pre-ticked.
- **F5 + T4 gap card's job from a bridge row only** (Task 8): `job_id` and `evidence` read only when `claimed === false`; a test pins a claimed row naming a job → `job_id: null`; the ponytail on the newest-run collapse.
- **F6 + T7(c) trailing writes** (Task 7): the type-gap and planner rows are wrapped into the 502 shape that names what WAS filed, logged; test (g).
- **F7 + T7(a) "nothing was saved"** (Task 7): everything before the first write runs in `prepare()`, whose every refusal passes `unsaved()` (a callee's words — readPack's out-of-scope 409, a typer or validateChangeset 400/413 prefixed with the storey's name, a store read — get the ending); the manifest read is its own 503 in words; tests for the pack's words and the manifest.
- **F8 tests that could not fail** (Tasks 4, 5, 7): rmse 25 and no fit in planSurvey; the evidence check's other-sha and empty-pack branches; `· failed` with status done and `· done` with status failed, each alone.
- **F9 R-1 and the trim reason** (decision 10, Task 5, drill R-1): `trimEnds` returns `to`; a wall trimmed to a gap's centreline says "the start to scan-L00-wall-4's centreline: a type gap, not placed"; R-1 expects two joined corners and two free ends at x 40 125.
- **T1 the lock** (decision 19, Task 7, Task 11): a module `Set` per project key, 409 in words, released in `finally`; test (i) fires two at once (one 201, one 409, released after); the Propose button is disabled while it runs. Taken right after the role checks and the budget — before the job read, so the whole read-check-file span is inside it (the critique said from the docList read; earlier is a superset and the same one line).
- **T2 `changeset_` reserved** (decision 18, Task 9, Task 12, drill P-1): verified no client posts one through `/audit` (add-in, MCP, web). Appended as a prefix AFTER `changeset_reviewed` / `changeset_reopened` rather than replacing them, so `ledger-write.test.mjs:84-85`'s pinned words stay green with no test edit; the new rows answer "changeset_ rows are written by Sentinel, not through this route".
- **T5 one cid twice** (Task 4): `trustedJob` refuses a result whose cids repeat; test in (c).
- **T6 the pack id** (decision 3, Task 4, Task 7): the ROW's `pack_id`; the store test sets job.json's to `evp-9999` so a read of it would fail.
- **T7(b) a doc stored before its row failed** (Task 7): the half-way 502 lists the store again (`!before.has(id)` and this row's ledger id), so it is named; test (h).
- **T8 ponytails in code** (Task 5, Task 8): on `toModel` (the lead's stated frame; MA-4g) and on the gap card's `job_id` line.

## Critique not taken

- **"409 nothing new to propose only when no typed candidate is left"** — taken, narrowed: the 409 fires when nothing new is left AND this job filed before. A job that types nothing at all (every wall a gap on its first proposal) still files its gaps alone to the Holding Area, as before; refusing it would leave its gaps with no way in.
- **Replacing `changeset_reviewed` / `changeset_reopened` with the prefix** — the prefix is appended instead (same protection, no change to two pinned test words); see T2 above.

## Open questions (ANSWERED by the founder, 2026-10-09 — all three defaults stand, built as written)

Decided defaults, not questions: a lead proposes (decision 1); the bridge alone builds job-backed changesets (2); levels named, matched within 20 mm or created (6); walls trimmed (10) and read inside or outside by the office's own rule (11); exact typing, gaps grouped by exact size (12, 13); per candidate, never one candidate twice, a scan another job placed named not refused (19); every `changeset_` row reserved (18); NOTICE is MA-7's (22); the drill standards installed on the project (25).

1. **D7's 20 mm before MA-4e.** The default judges `within_tolerance` on `max(fit rmse, face_dev_mm)` — the fit is each face's inliers against its own line, `face_dev_mm` how far the scanned faces' ends sit from the ghost's faces (`basis: "fit"`) — and pre-ticks on it; deviation of the placed element (p95, coverage) waits for MA-4e. Accept this reading of D7, or keep every scan ghost `not_measured` and unticked until MA-4e?
   - **Answered: accepted** — the 20 mm judged before placement on the larger of the fit rmse and `face_dev_mm`; MA-4e adds `verify:measured`.
2. **Revit's pre-tick of scan walls.** Default: none in MA-4d (no add-in change; the web desk shows it; a person ticks every create in Revit). Should Revit open measured, within-tolerance creates ticked — a one-line add-in change and a deploy to 2021–2027 (proposed for MA-4f, beside the scan overlay)?
   - **Answered: no add-in change in MA-4d** — Revit keeps opening scan walls unticked; a pre-tick in Revit waits for MA-4f.
3. **The design's external path.** §6.3 (:739) lets a body naming `source.job_id` earn trust when its values match the job; MA-4d builds only the bridge-built path and refuses the other (S1). Accept the amendment?
   - **Answered: accepted** — only the bridge builds changesets from a job; an outside body naming a job is trusted for nothing.
