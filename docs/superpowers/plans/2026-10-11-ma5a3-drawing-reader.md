# MA-5a-3: The Drawing Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lead runs `sentinel-drawing` on the admitted vector PDF plans of a project and sees, as a done job on the ledger, the walls (paired faces, joined across door gaps) and doors (swing arcs, with any "W x H" tag) the plan draws — in paper millimetres, untyped, unproposed.

**Architecture:** A one-shot .NET 8 console program `drawing/` (`sentinel-drawing` 0.1.0: job JSON on stdin, result JSON on stdout) reads page 1 of each admitted PDF with PdfPig 0.1.16 (`Page.Paths`, words) and pairs wall faces with the add-in's own `WallPairing.cs` (linked source — the pairing stays rule for rule). The bridge runs it as a second reader of the existing job system (`build-jobs.mjs`: `readers: ["sentinel-drawing"]`, the same `running` slot, folder, `result.json`, sha256 and `build:run` row) through a small supervisor (`drawing-service.mjs`). The web lists drawing jobs beside survey jobs and starts one ("Read drawings"). Proposing a drawing job — the 2-point alignment, `inferred` ghosts — is MA-5a-4.

**Tech Stack:** C# / .NET 8 + PdfPig 0.1.16 (in the NuGet cache since the add-in restored it — nothing downloaded), Node ESM bridge (vitest), TypeScript web (vitest), Python 3 stdlib (the drill plan generator).

**Spec:** `docs/strategy/2026-09-30-model-automation-design.md` (MA-5 Delivers: "The vector PDF reader (PdfPig)"; C9; the dependency line "Vector PDF reader (PdfPig) | Revit add-in, or a small .NET worker next to the bridge (decided in the MA-5 plan)"; rule 2 — geometry only from measuring code; C10 — raster plans out of scope) and the scope map of 2026-10-11 (workflow `wf_2b51537b-b82`).

## Decisions (the MA-5 plan's to make, made here)

1. **Where it runs: a .NET worker the bridge runs** (not the add-in): its result is the bridge's own (`claimed: false`, like sentinel-survey's) — an add-in receipt is claimed by rule (`cde-store.mjs:1325-1330`); drawing and scan candidates then meet on the bridge, where MA-5a-5's conflicts and BCF topic run. One-shot (stdin → stdout), not a service: a plan is read in well under a second.
2. **Paper millimetres, no scale.** The reader states what is drawn (1 pt = 25.4 / 72 mm); the scale and placement are the lead's 2-point alignment at Propose (MA-5a-4). Every measured key says its unit (`thickness_paper_mm`).
3. **Wall faces = the page's heaviest strokes.** A PDF has no layers; a CAD plot draws cut walls heaviest. ponytail: a plan whose walls are not its heaviest lines reads no walls; a page in one line weight reads none and says so in the receipt (walls cannot be told from the title block). A classification spike is MA-5a-4+'s if real sets need it.
4. **Doors = quarter-circle swing arcs** (a cubic Bézier spanning 90° ± 10°) whose centre lies on a wall face's end at a gap of the arc's radius (± 10 %). Two collinear walls of one thickness either side of that gap are **one wall through the door** (Revit hosts a door in one wall — the drawing's twin of the scan's lintel merge, `pipeline.merge_split`). A tag text "W x H" (two 3–4 digit numbers) within 3 radii of the door is kept as `tag_width_mm` / `tag_height_mm` (real mm, the drawing's own words). Windows: not read in 0.1.0.
5. **PDFs only.** A drawing pack item in dwg or dxf is refused in words (Ghost Builder reads DWG in Revit); png / jpg is raster (C10).
6. **Proposing a drawing job is refused in words** until MA-5a-4.

## Global Constraints

- Reader name `sentinel-drawing`, VERSION `"0.1.0"`; PdfPig pinned `0.1.16` exactly (not `0.1.*`).
- No download: PdfPig 0.1.16 is in `%USERPROFILE%\.nuget\packages\pdfpig\0.1.16`; `dotnet build` restores offline from it.
- The worker gets an allow-list environment (SYSTEMROOT, TEMP, TMP, APPDATA) — never config/.env's secrets; no shell; killed on the bridge's exit and after `DRAWING_MS` (2 min).
- Every item's bytes are re-hashed by the worker against the sha256 the bridge sent; a mismatch is a refused item in words.
- Fixtures and generated drawings carry no address (example.test only, and none needed).
- Web 1.0.74; no add-in change, no migration.

## Review Focus

1. **A plan with door arcs but its walls in the same weight as everything else** → no walls, no doors, and the receipt says why. Test in Task 2.
2. **A door arc with no wall gap of its radius** (a furniture arc, a revolving symbol) → no door. Test in Task 2.
3. **A changed or swapped file between admission and the job** → the item refused (sha256), the job refused if nothing is left, in words. Test in Task 2 and Task 3.
4. **A drawing pack with only a DWG or a PNG** → "Read drawings" refused in words naming why each was not read. Test in Task 3.
5. **Propose on a drawing job (the web or the MCP)** → a 409 in words, nothing written. Test in Task 3.

---

### Task 1: The drill plan generator (`drawing/make_drill_plan.py`)

**Files:** Create `drawing/make_drill_plan.py`, `drawing/fixtures/drill-plan-L00.pdf`, `drawing/fixtures/drill-plan-L00.expected.json`, `drawing/test_make_drill_plan.py`.

The drill building of `WebApp/scripts/make-two-storey-las.mjs` / `survey/test_survey.py building()` drawn as a vector plan of L00 at 1:50 on A4 landscape (842 × 595 pt), origin of the building at page (60 mm, 40 mm):
- walls 0.7 pt, as face lines with gaps: south 0..8000 × 0..300 (a 900 door gap at x 3000..3900), north 0..8000 × 5800..6000, west 0..250 × 0..6000, east 7700..8000 × 0..6000; an interior partition 100 mm at x 4000..4100 from y 300 to y 5800 with a 1000 door gap at y 2000..3000;
- door leaves (0.25 pt) and quarter-circle swing arcs (0.25 pt, one cubic Bézier each, k = 0.5523) hinged at x 3000 (south) and y 2000 (partition); tags "D2 900x2100" and "D1 1000x2100" (Helvetica 7 pt) beside them;
- a border (0.35 pt) and a title block rectangle (0.35 pt) with "Drill building L00 - 1:50 - Sentinel drill" text;
- alignment marks: crosses (0.25 pt) at building (0, 0) and (8000, 6000) labelled "A" and "B".
Expected JSON: the 5 walls (centreline in paper mm, thickness 6 / 4 / 5 / 6 / 2 paper mm = 300 / 200 / 250 / 300 / 100 mm), the 2 doors (width 18 / 20 paper mm, tags), the marks' paper positions (for MA-5a-4).

- [ ] **Step 1:** the generator — stdlib only, the `pdf()` writer of `demo/ghost-sample/make-sample.py` extended with path operators `w m l S c` and text; deterministic (no date in the file).
- [ ] **Step 2:** `drawing/test_make_drill_plan.py` (unittest): two runs write the same bytes; the file starts `%PDF-1.4`; the expected JSON parses and names 5 walls and 2 doors.
- [ ] **Step 3:** run it, commit the fixture PDF (a few KB) and expected JSON with the generator.

### Task 2: `sentinel-drawing` 0.1.0 (`drawing/`)

**Files:** Create `drawing/sentinel-drawing.csproj`, `drawing/Program.cs`, `drawing/PlanReader.cs`; create `tools/drawing-check/drawing-check.csproj`, `tools/drawing-check/Check.cs`.

**Interfaces:**
- stdin: `{job_id, items: [{id, kind: "drawing", path, sha256}], params: {}, seed}`.
- stdout (exit 0): `{status: "done" | "refused", version: "0.1.0", tools: [{name, version, licence}], refused: [{id, reason}], result?: {candidates, derived: [], receipt}}`; exit ≠ 0 with a stderr line = a failed job.
- A wall candidate: `{cid: "drawing-<item>-p1-wall-N", kind: "wall", geometry: {LocationCurve: {start: [x, y], end: [x, y]}, faces: [[x1, y1, x2, y2], …], page: 1, units: "paper_mm"}, measured: {length_paper_mm, thickness_paper_mm?}, evidence: ["<item>#page-1"]}`.
- A door candidate: `{cid: "drawing-<item>-p1-wall-N-door-M", kind: "door", geometry: {host: <wall cid>, Location: [x, y], direction: [ux, uy], along_paper_mm, swing_centre: [x, y], page: 1, units: "paper_mm"}, measured: {width_paper_mm, tag_width_mm?, tag_height_mm?}, evidence: ["<item>#page-1"]}`.
- receipt: `{started, finished, cpu_s, items: [{id, pages, page_read: 1, size_paper_mm: [w, h], strokes, wall_weight_pt, faces, arcs, why?}]}`.

- [ ] **Step 1: the check first** (`tools/drawing-check`, net8, links `drawing/PlanReader.cs` + `SentinelAddin/GhostBuilder/WallPairing.cs`, PdfPig 0.1.16; `Ok(cond, words)` like `tools/wallpair-check`):
  - the fixture plan: 5 walls, thicknesses ×50 within 1 mm of 300 / 200 / 250 / 300 / 100; the south and partition walls each **one** wall through their door gap; 2 doors, widths ×50 within 10 mm of 900 / 1000, each hosted in the wall its gap splits, tags 900x2100 / 1000x2100; the border, title block and marks read as no wall;
  - one line weight (the fixture's content with every `w` set to 0.7) → 0 walls, 0 doors, `why` = "one line weight on the page — walls are not told from the rest";
  - an arc with no wall gap of its radius → no door; a gap with no arc → no door, the two walls stay two;
  - a sha256 that is not the file's → refused "not the bytes admitted (sha256)"; a file that is not a PDF → refused "not a PDF PdfPig can open";
  - a two-page PDF → page 1 read, `pages: 2`.
- [ ] **Step 2:** `dotnet run --project tools/drawing-check` → fails (no `PlanReader`).
- [ ] **Step 3: implement** `PlanReader` (pure: page → strokes → faces → `WallPairing.Pair(faces, maxThicknessMm: 25 /*paper mm*/, angleTolDeg: 2)` → join across door gaps → doors → tags) and `Program` (stdin/stdout, sha256, refusals, receipt, tools: sentinel-drawing / PdfPig 0.1.16 Apache-2.0 / .NET 8 MIT). Knobs, each with its reason: `PAIR_MAX_PAPER_MM 25` (a 1250 mm wall at 1:50), `MIN_FACE_PAPER_MM 4` (a 200 mm stub at 1:50), `ARC_SPAN 90° ± 10°`, `GAP_TOL 10 %`, `TAG_REACH 3 r`.
- [ ] **Step 4:** the check passes; `dotnet build drawing -c Release` → `drawing/bin/Release/net8.0/sentinel-drawing.exe`; a job piped to it on the fixture prints the expected reading.
- [ ] **Step 5:** commit.

### Task 3: The bridge runs it (`drawing-service.mjs`, `build-jobs.mjs`)

**Files:** Create `WebApp/bridge/drawing-service.mjs`, `WebApp/bridge/fixtures/drawing-standin.mjs`, `WebApp/bridge/drawing-service.test.mjs`; modify `WebApp/bridge/build-jobs.mjs`, `WebApp/bridge/build-jobs.test.mjs`, `WebApp/bridge/changesets-store.mjs` (+ test), `WebApp/bridge/mcp-server.mjs` (if it names the reader).

**Interfaces:** `runDrawing(job, {exe, spawn, env, jobMs, log}) → {status, version, tools, refused, result?, error?}` (never rejects); `notSetUpDrawing({exe}) → string | null`; `READERS = ["sentinel-survey", "sentinel-drawing"]`; a job record's `reader: {name, version}`; `trustedJob` → `row.reader`.

- [ ] **Step 1: tests first** — drawing-service (a Node stand-in for the exe, as `fixtures/survey-standin.mjs`): done, refused, a non-zero exit (failed, stderr to the log only), unparseable stdout (failed in words), the time bound (killed, failed), the env allow-list (no `BCF_TOKEN`); build-jobs: `readers: ["sentinel-drawing"]` accepted, any params refused for it; `pickItems` for drawings — a pdf taken, a dwg / dxf refused "Ghost Builder reads a DWG in Revit (Model from Drawings) — sentinel-drawing reads PDF", a png / jpg refused "a raster drawing is out of scope (C10)", a changed one refused; no PDF → 409 in words; the row `build:run job-NNNN · sentinel-drawing 0.1.0 · done`, `reader: "sentinel-drawing"`; the counts `{wall, door}`; `resultRefusal` holds a drawing job to its kinds and `units: "paper_mm"`; `trustedJob` accepts either reader's own row and says which; one job at a time across both readers; `proposeFromJob` on a drawing job → 409 "a drawing job is proposed with its 2-point alignment — MA-5a-4; nothing was saved".
- [ ] **Step 2:** vitest → fails.
- [ ] **Step 3: implement** — `drawing-service.mjs`; `build-jobs.mjs` generalised by reader; `startJob` picks the runner by reader; `proposeFromJob` refuses a drawing job.
- [ ] **Step 4:** vitest (bridge) → pass.
- [ ] **Step 5:** commit.

### Task 4: The web (1.0.74)

**Files:** Modify `WebApp/src/setups/evidence.ts` (+ test), `WebApp/src/setups/files-panel.ts`, `WebApp/package.json`.

- [ ] **Step 1: tests first** — `jobLine` names a drawing job's reader and counts walls and doors; `readableDrawings(pack)`; `drawingStartLine`; `candidateLine` on a paper-mm candidate.
- [ ] **Step 2:** vitest → fails.
- [ ] **Step 3: implement** — `startDrawing(base, key)` posts `{pack, readers: ["sentinel-drawing"]}`; the section's words add one sentence for drawings; "Read drawings" beside "Run survey" when a contributor is signed in, nothing runs and the pack has a readable PDF; a drawing job's line has Candidates but no Propose… (its words: "proposed with its 2-point alignment — MA-5a-4"). `package.json` 1.0.74.
- [ ] **Step 4:** vitest (all) → pass; `tsc` — no new error in a touched file.
- [ ] **Step 5:** commit (feat(web) + chore(web): 1.0.74).

### Task 5: Review, merge, deploy, drill

- [ ] **Step 1:** whole-branch review (three lenses + a skeptic per important finding); fix what survives.
- [ ] **Step 2:** merge `--no-ff`; `dotnet build drawing -c Release` in the main checkout; restart 4100; publish web 1.0.74; secret scan; push.
- [ ] **Step 3: Drill MA5a3** (after the founder's Funnel refresh), on `ma4a-drill` (its pack holds req-0001 and the founder's attestations (a) att-0001 and (b) att-0004 — no new signature):

| Row | What | Bar |
|---|---|---|
| G-1 | Copy `drawing/fixtures/drill-plan-L00.pdf` into `%APPDATA%\Sentinel\evidence\ma4a-drill\drawings\`; **Admit** it as a drawing under req-0001 | admitted (a pdf drawing, holder-permission, req-0001) on the ledger |
| D-1 | **Read drawings** | a done job `sentinel-drawing 0.1.0`: the drill plan's 5 walls and 2 doors as the expected JSON (×50 within the check's tolerances); A-101.pdf read with what its page holds, or no walls and the receipt's why; one `build:run` row, `claimed: false`, the result's sha256 |
| D-2 | **Candidates** on the job | each wall and door in paper mm, its evidence `ev-NNNN#page-1` |
| D-3 | **Propose…** absent on the drawing job; the route itself → 409 in words | nothing written |
| D-4 | A survey job still runs and proposes as before (one slot) | unchanged |

- [ ] **Step 4:** record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; the design's MA-5 Delivers line; memory; push.

## Self-review

- Spec: the vector PDF reader (Task 2), job plumbing and trust (Task 3), the lead's view (Task 4), the drill data (Task 1), the drill (Task 5). The alignment, `inferred` ghosts, conflicts, BCF and the click UI are named as MA-5a-4 / 5 / 6 and refused in words where a caller could reach them.
- Types: `reader: {name, version}` (job record) → `row.reader` (trustedJob) → the web's `SurveyJob.reader`; `units: "paper_mm"` on every drawing candidate; cids `drawing-<item>-p1-wall-N[-door-M]`.
- Review Focus lines 1–5 each have a test in Tasks 2–3.
