# MA-5a — openings from wall-plane occupancy: sentinel-survey 0.5.0 proposes doors and windows on its scan walls, scored against a traced opening reference on Kladno; the bridge types them from the catalogue by size or files a gap; Revit places them as hosted ghosts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first slice of MA-5 (design `docs/strategy/2026-09-30-model-automation-design.md:1169-1187`, delivers line :1172 only: "Openings from wall-plane occupancy, as hosted catalogue doors and windows chosen by size (or a gap)"; drill line :1183: "The opening count is compared with a hand count"). Everything else of MA-5 — PdfPig (:1173), alignment and `inferred` ghosts (:1174-1176), rooms (:1177), `rehost` (:1178), GHB/DAT items (:1179), DWG revisions (:1180) — is OUT.

- **Measured first, changed last.** No opening number is claimed before the reference has openings. Task 0 gets them traced (by the founder, default) and scored; Task 1's code is written in the worktree with placeholder constants, run in memory against Kladno and the reference, and **committed only with the measured numbers** (MA-4h-3's protocol: GF tuned, 1F held out; a change is kept only when both rise and wall F1 does not fall).
- **The survey (0.5.0).** Each kept wall face's occupancy — the (along, height) grid `height_share` already projects — is computed **once** and reused three times: the height filter, the holes, and the merge of a face split by a doorway. A hole is a maximal empty rectangle ≥ 3 × 3 cells; one touching the floor row is a `door`, else a `window`. The pipeline emits `kind: "door" | "window"` candidates with a host cid, a point on the host's centreline, width, height and sill. (The class is a category, not a type: "the bridge types them" still holds.)
- **The bridge.** An opening is an element of its storey's changeset after the walls: `Location` on the host's trimmed line, `LevelName`, `SillHeight` on a window. Typed by an office rule when one matches, else **by size from the catalogue** (one row of the category named at the measured size ± 100 mm), else a gap whose `size` is "W x H mm" so the Holding Area closes it by catalogue, as Promote's do. A host that is a gap makes the opening a gap too, in words.
- **The add-in.** No code change: `ChangesetExecutor.cs:574-620` already hosts a door or window in the one wall under its point, after the walls of the same changeset. The add-in task is its gate rows.
- **Version.** sentinel-survey **0.5.0** (`service.py:25`, "A job read by 0.4.0 is proposed and overlaid as before; a measure of one fails in words"). Web: the "found" list and prose; the controller bumps the patch at the merge. No migration, no download, no install.

**Base:** `feature/ma5a-scan-openings` at master `266141c` (drill MA4h4 passed). Every file:line below was read at `266141c`.

## Global Constraints

- **House style.** Words are sentences; a refusal says what is needed and a write's refusal ends "nothing was saved". Comments name the slice ("MA-5a") and the reason. A `ponytail:` comment on every deliberate simplification names its ceiling and upgrade path. Exact words are pinned in tests.
- **Commits.** `feat(survey|bridge|web): MA-5a - …`, `docs: MA-5a - …`; a blank line; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Only on `feature/ma5a-scan-openings`.
- **Builders work in the worktree Task 0.5 makes** (`.claude/worktrees/ma5a`), never in the main checkout: the live 4100 bridge spawns `survey/service.py` from its own checkout (`survey-service.mjs:17`).
- **Tests.** From `WebApp`: `npx --no-install vitest run <files>`. From the worktree root: `"C:/Python314/python.exe" -B -m unittest discover -s survey -v`. Restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with `git checkout --` if a run rewrites its line endings.
- **The repo is PUBLIC.** Fixtures use `example.test`; no real e-mail or path (`%USERPROFILE%\…`, `%APPDATA%\…`, never expanded). No scan, slice image, trace or `reference.json` enters the repo.
- **The knob rule.** Every constant in Task 1 is a measurement: the T-3 table is in the commit message and the constant's comment, or the constant is not committed.
- **Teardown.** Remove the worktree's `node_modules` junction alone, check it is gone, then `git worktree remove`.
- **Revit.** Revit 2024, the drill building, a scratch copy (R-0). Never a pilot file, never aster-tower. The community Revit MCP is not used.

## Source of truth

- **Design:** :1169-1187 (above).
- **`survey/pipeline.py`:** :6-7 the words ("Candidates carry no type … openings are not proposed (MA-5)"); :36 `MIN_FACE` 1000; :37-38 `MIN_HEIGHT` 0.8, `HEIGHT_EDGE` 150; :39-40 the height ponytail ("faces x points — Kladno's GF: 118 faces over ~3 M points"); :41 `MAX_GAP` 300 ("a doorway; a closed door reads as wall"); :220-232 the run split at `MAX_GAP` and the `MIN_FACE` drop; :229 the 100 mm `coverage` bin; :302-306 `_centreline` (along face a, a's full length); :309-338 `pair`; :349-350 `fit`; :353-362 `height_share` (the (t, d, z) projection, 100 mm bins); :365-430 `measure`: :389 the storey band `st`, :390 the height filter, :394 `outline(P, f["band"], fs)`, :411-422 the wall candidate.
- **`survey/service.py`:** :25 `VERSION = "0.4.0"`; :29 the Kladno timings (200 s, 1.93 GB at 0.4.0); :32 `MAX_ELEMENTS`.
- **`survey/reference.py`:** :20-26 `CUT` 1200, `HALF` 300, `STEP` 50, `ANGLE` 5, `DS`; :71-74 `slice_png`; :89-91 `to_mm`; :116-134 `build` (wall/guessed ≥ 100 mm, floor rects, the storey fields); :166-182 `match`; :215-245 `score` (:228 `groups`).
- **`survey/trace.html`:** :9-11 the keys (w, g, f); :23 `COLOR`/`KEYS`; :87 the saved JSON (`image_sha256`, `traced_by`, `saved`, `minutes`, `lines`).
- **`survey/test_survey.py`:** :96-126 `building` (:122-123 the storey faces, :125 the outer faces); :482 `Survey.PARAMS`; :531-536 the candidate key set and `fit` keys (:536); :575 `Knobs`; :611-612 the doorway pieces; :614-626 the counter case.
- **`WebApp/bridge/survey-plan.mjs`:** :8-11 imports; :20 `NOT_MEASURED`; :85-87 `placeRefusal` reads `LocationCurve | LocationLoop | Boundary`; :152-175 `trimEnds` (`:173` `trim_mm: [round(−t0), round(t1)]`, start' = start + t0·u); :231-233 `planSurvey`'s `mine` and `trust`; :239-242 `trust` (`basis: "fit"`); :244-251 `gap`; :254-262 `trimmed`, `segs`, `typed`; :263-275 the walls loop (`:270` `place.LocationCurve` trimmed + `toModel`); :276-286 floors/ceilings; :294-298 the 200 bound; :320-332 `facesOf`; :355 `meshFaces`' comment ("an opening is drawn over; no survey wall has one before MA-5"); :404-414 `measurePlan`'s skip words.
- **`WebApp/bridge/changesets-logic.mjs`:** :13 `VOCABULARY` (door, window present); :74-80 `PLACE_FIELDS`; :84 `POINT_KINDS`; :159-162 `Location`/`SillHeight` checks; :312-316 `typeIt`; :319-328 TypeName/FamilyName/LevelName; :421 `typing: typed ? typed.typing : { typed_by: "caller" }`; :425 `fromJob` → `measured`, `trim_mm` only.
- **`WebApp/bridge/changesets-typing.mjs`:** :20 `KIND_CATEGORY` (Doors, Windows); :21 `FACTS_FIELDS`; :65-110 `makeTyper` (:78 `gap.size` thickness-only; :88-93 the one-row rule); :115 `KIND_ENTITY`.
- **`WebApp/bridge/holding-logic.mjs`:** :95 `typeGapId`; :98 `sectionOf` (`const`, not exported); :102-107 `catalogMatch` (want null → first row at the size).
- **`WebApp/bridge/changesets-store.mjs`:** :78-82 `needsTyping`; :278-292 decision 19 keyed on the job's ledger row (`:280`), the 409s.
- **`WebApp/bridge/build-jobs.mjs`:** :26 `KINDS`; :116 the kind refusal; :214 `counts`. Tests `build-jobs.test.mjs:94,101`.
- **`WebApp/src/setups/evidence.ts:127`** `FOUND`; `evidence.test.ts:133,141`; `files-panel.ts:609`; `mcp-server.mjs:136`.
- **`SentinelAddin/GhostBuilder/PlacementGeometry.cs:14-26`** `HostTolMm` 1.0, `Host` (none or two = refusal); **`ChangesetExecutor.cs:574-620`** openings after walls, `doc.Regenerate()`, `HostWalls(doc)`, z = the level's elevation (:583-584), `NewFamilyInstance(pt, sym, hosts[i], level)` (:606-608), `SillHeight` (:609); **`Coordination/ChangesetClient.cs:39-48`** the DTO (`Location`, `SillHeight`). **`GhostFiling.cs:173-183`** `Chunks` (walls before points). **`PromotePlanner.cs:384-386`** `params {HostFunction, Size: "W915 x H2134 mm"}`.
- **Catalogue (`demo/bds-pilot/bds-type-catalog.json`, counted for this plan):** Doors 49 rows — 16 at `2000 x 2100`, **13 at `1000 x 2100`** (BDS_EXT_1 PNL ×6, BDS_INT_1 PNL ×6, BDS_INT_FRAME_WOOD ×1), 4 unsized. Windows 29 rows — `3100x2900` ×4, `600 x 1300` ×2, `1200 x 2600` ×1, `800 x 1200` ×1 …; `sectionOf`'s regex reads both spellings. Guideline Doors rules match on `layer: "A-DOOR"` + `Location`/`Material`; Windows on `layer: "A-WIND"`: **no rule matches scan facts, so every scan opening types by size or is a gap.**

## Decisions

| # | Question | Decision (default where the founder's) |
|---|---|---|
| 1 | **Founder decision — who traces openings.** | **Default: the founder**, in `trace.html`, ~30-40 min (GF and 1F; MA-4h-2's trace of ~85 walls took the founder ~2 h). Alternative at the founder's request: Claude traces, with the bias disclosed in the notes (the tracer wrote the finder). The `traced_by` field records whoever did. |
| 2 | How an opening gets a reference | Two images per storey from `slice_png`: the existing **1200** cut (position and width: a two-click `o` line across each gap in a traced wall) and a new **sill** cut at floor + 700 ± 150 (`o` again where the gap is still open). `build` pairs them: an `o` at 1200 with an overlapping `o` at 700 (> 50 % along, same line within 200 mm) is a **door**, else a **window**. Sill and head are **not** in the reference: the sill is scored as a class, never in mm (critic 9). Founder decision: a head cut (floor + 2200 ± 150, ~15 min more) — **default no**; Next. |
| 3 | Scoring | `score()` gains `openings: {d: {tp, fp, fn, p, r, f1, storeys}}` through the same `match()` at DS (an opening is a segment: position + width), and `kind_agreement` (matched pairs whose class agrees / matched). A storey with walls traced but no `o` line scores openings as all-FP; a storey not traced is not scored. |
| 4 | A wall split by a doorway | Two kept faces on one line (angle ≤ 1°, offset ≤ CELL) with a gap ≤ `MERGE_GAP` (placeholder 2 500 mm) are **merged into one face when the gap's columns are filled above** (≥ 60 % of the rows above the lowest 3 are occupied in the joined grid: a lintel), before `outline` and `pair` (critic 11). This is a **wall-rule change** recorded under MA-4h's design row (critic 16); wall F1 on both storeys is a gate. A piece under `MIN_FACE` on either side is already lost (`pipeline.py:36`): a nib beside a door is not merged (ponytail). |
| 5 | What the pipeline emits | `kind: "door" | "window"` (not "opening": `VOCABULARY`, `KIND_ENTITY`, `POINT_KINDS` know these two; one mapping fewer). Door: the hole's lowest row is the grid's lowest row. Everything above the mid-slice is read from the storey band, so the lintel is seen. |
| 6 | Both faces | A paired wall's two grids each give holes; holes overlapping > 50 % along (mapped to the centreline) are one opening (the union); a hole on one face only is kept with `fit.faces_seen: 1` and `fit.coverage` of its border (an occluder reads the same as a hole — the honest ceiling, said in the comment and the reason). |
| 7 | Typing by size | Planner: `facts.params = {HostFunction, Size: "W<w> x H<h> mm"}` (`PromotePlanner.cs:385-386`'s shape; critic 10), width and height rounded to 10 mm; the typer first (an office rule may match). On a gap with `want: null`: the catalogue rows of the category whose `sectionOf` is within **± 100 mm of both** the measured width and height (one grid cell; said in the ponytail — critic 5's dead branch is gone). Exactly one row → typed, `typing.typed_by: "bridge-size"`. Several → a gap naming them (truncated to 500 chars). None → a gap with `size: "<w> x <h> mm"` (the measured size, so Holding closes it when the office adds a type at it). The catalogue reaches `planSurvey` as `catalog` from the store's resolved standard. |
| 8 | The typing record | `changesets-logic.mjs:421` → `typing: fromJob?.typing ?? (typed ? typed.typing : { typed_by: "caller" })`, pinned (critic 2). |
| 9 | A host that is a gap or filed | Host `typed[i].gap` → the opening is a gap too, reason "its host wall <cid> is a type gap — it is placed once the wall is"; its own group is by category + size, so it closes with the door type, and Apply waits on the wall. Host `again()`-filed (decision 19, same frame by the 409 at `:289`) → the opening is **proposed**: the executor finds the host among the model's walls. |
| 10 | Trust record of an opening | `accuracy: {status: "insufficient_data", basis: "framing", …}`, `pretick: false` (critic 14): no fit of its own, and sill/head have no reference. |
| 11 | Version and compatibility | 0.5.0; a 0.4.0 job proposes and overlays as before (no opening candidates: `mine` finds none). The reference's wall storeys: field-compare (`walls`, `ffl_mm`, `floor_samples_mm`, `cut_mm`, `origin_mm`, `image_sha256`) against the sha-`ce1a4f46…` file, never byte-equal (critic 8). |
| 12 | Time and memory | The grid is computed once per kept face and stored on it (`x["grid"]`); the merge computes a joined grid per collinear pair only. T-3 reports seconds and MB per row; K-1's ≤ 5 min and ≤ 2.5 GB are gates (critic 7). |
| 13 | The 200 bound | Unchanged. Kladno GF: 118 wall candidates, most gaps on BDS; openings add at most ~1 per 2 m of wall. R-1's count is recorded; a storey over 200 is MA-4h's Next. |
| 14 | Add-in | No change. The drill proves the existing path; the family must be loaded in the scratch model (R-0). |

## Task 0 — the opening reference, the harness, the worktree

**Files:** `survey/trace.html` (:9-11, :23), `survey/reference.py` (:116-134 `build`, :215-245 `score`, :250-275 `main`), `survey/test_survey.py` (the `Reference` cases), scratch `harness.py` (scratchpad, never in the repo).

- [ ] **0.5 Worktree.** `git worktree add .claude/worktrees/ma5a -b feature/ma5a-scan-openings master`; junction `WebApp/node_modules` as MA-4h did.
- [ ] **0.1 `trace.html`:** `KEYS.o = "opening"`, `COLOR.opening = "#38bdf8"`; the header comment: "o an opening (two clicks across the gap, on the wall's line: a doorway or a window on the 1200 image; on the 700 image only where the gap is still open at sill height)". Nothing else changes; the saved JSON already carries `lines[].kind`.
- [ ] **0.2 `reference.py`:**
  - `SILL_CUT = 700.0  # mm above the floor: a window's sill is above it, a door's threshold below — MA-5a; a window with a sill under 400 mm reads as a door (ponytail: a third cut tells them apart)`.
  - `main`: `slice` takes an optional 4th arg `sill` → the cut at `floor + SILL_CUT ± 150`.
  - `build(path, storeys)`: a storey may carry `sill_side` and `sill_trace` (loaded by `load_storey(name, png, sill_png=None)`); `openings = [{a, b, kind}]` where `kind = "door"` when an `o` at 1200 overlaps an `o` at 700 by `_overlap > 0.5` (reuse `pipeline._overlap`) within 200 mm, else `"window"`; a storey with no sill image: every `o` is `kind: None` (position scored, class not). New fields `openings`, `sill_cut_mm`, `sill_image_sha256`, `sill_trace_sha256`; an `o` line under 300 mm is a stray click, dropped.
  - `score`: `groups` (:228) also carry each storey's opening segments; after the wall loop, per d: `match(opening candidate segs, R_open, d)` where a candidate's segment is `Location ± width/2` along the host's direction; `openings[d] = {tp, fp, fn, p, r, f1, kind_agreement, storeys}`. Candidates of kind door/window on an unscored storey go to `not_scored`.
- [ ] **0.3 Tests (`test_survey.py`, `Reference`):** on the synthetic building of Task 1 (its `door`/`window` keywords): `build` from a trace with `o` lines on both images classes the door and the window; no sill image → `kind None`; `score` on hand-made candidates gives openings F1 1.0, and 0 when shifted 300 mm; `kind_agreement` 0.5 when one class is swapped; an `o` of 200 mm dropped. Pinned words: `"the trace was drawn on another image than its side record's"` (unchanged), new `"{name}: the sill trace was drawn on another image than its sill side record's"`.
- [ ] **0.4 The tracing (live, not a commit).** The controller makes the sill images for GF and 1F (`reference.py slice <las> <floor> <out.png> sill`), records both side `sha256`s; the founder (decision 1) traces `o` on the four images **before any opening candidate exists** (no 0.5.0 job has run); the trace `sha256`s and `saved` times go in the notes; `build` makes `reference-5a.json` beside the old one; the wall storeys field-compare equal to `ce1a4f46…`'s (decision 11); its `sha256` goes in the notes, and T-3 scores only against it.
- [ ] **0.6 The harness** (`<scratchpad>/harness.py`): `load` → `measure` on the Kladno file at `Survey.PARAMS` with the worktree's `pipeline`, `score` against `reference-5a.json`, printing wall F1 at 50/100/200 per storey, openings F1, `kind_agreement`, candidate counts per kind, wall-clock seconds and peak private MB (`psutil` is not installed: read `GetProcessMemoryInfo` via `ctypes`, as MA-4h's harness did). Not committed.

**Acceptance:** the Python suite green; `reference-5a.json` built from four traces with recorded shas; the harness prints a 0.4.0 baseline row (openings F1 0 — nothing proposed yet) within 5 min.

## Task 1 — sentinel-survey 0.5.0: occupancy, holes, the merge, the candidates

**Files:** `survey/pipeline.py` (:6-7, :36-41, :353-362, :389-394, :411-422), `survey/service.py:25,29`, `survey/test_survey.py` (:96-126, :531-536, `Knobs` :575+).

- [ ] **1.1 The grid, once per face** — replaces `height_share`:

```python
GRID = 100.0        # mm: the occupancy cell along a face and up it (coverage's bin, height_share's bin) — MA-5a
OPEN_MIN = 3        # cells: a hole narrower or lower is clutter or a scan shadow, not an opening (MEASURED: T-3)
DOOR_ROWS = 1       # a hole whose lowest row is within this of the grid's floor row is a door (MEASURED: T-3)
MERGE_GAP = 2500.0  # mm: two faces on one line this close are one wall across a doorway when the gap is filled above (MEASURED: T-3)
LINTEL = 0.6        # share of the gap's rows above its lowest OPEN_MIN that must be filled for the merge (MEASURED: T-3)


def occupancy(Q, seg, z0, z1):
    """MA-5a: the (along, height) occupancy of face seg between z0 and z1 — GRID mm cells, True where a point of Q lies within
    2 x CELL of the face. Computed once per kept face (measure stores it as x["grid"]) and read three times: the height share, the
    holes, the merge. ponytail: a cell is filled by one point; an occluder (a cupboard) and a true opening both read as empty cells —
    the hole's border says how credible it is, nothing more."""
    a, b = np.array(seg[:2]), np.array(seg[2:])
    L = float(np.linalg.norm(b - a)); u = (b - a) / L
    R = Q[:, :2] - a
    t, d = R @ u, R @ np.array([-u[1], u[0]])
    k = (t > 0) & (t < L) & (np.abs(d) <= 2 * CELL)
    nc, nr = max(1, math.ceil(L / GRID)), max(1, int((z1 - z0) / GRID))
    g = np.zeros((nr, nc), bool)
    g[np.minimum(((Q[k, 2] - z0) // GRID).astype(np.int64), nr - 1), np.minimum((t[k] // GRID).astype(np.int64), nc - 1)] = True
    return g


def height_share(g):
    return float(g.any(axis=1).mean())


def holes(g):
    """Maximal empty rectangles of g at least OPEN_MIN x OPEN_MIN: [(c0, c1, r0, r1)] in cells (c1, r1 exclusive). Row by row, each
    empty run of >= OPEN_MIN cells; runs of adjacent rows whose columns overlap by more than half are one hole (the intersection of
    their columns). ponytail: greedy, top-down — a hole shaped like an L is its larger box; an arch is its rectangle."""
```

  `holes` returns rectangles; a rectangle's border credibility `border = filled cells on its four sides / cells on them`.

- [ ] **1.2 `measure` (:389-394):** `st` as today; `for x in fs: x["grid"] = occupancy(st, x["seg"], zf + HEIGHT_EDGE, top - HEIGHT_EDGE)`; the filter `height_share(x["grid"]) >= MIN_HEIGHT`; then **`fs = merge_split(st, fs, zf + HEIGHT_EDGE, top - HEIGHT_EDGE)`** before `outline` (critic 11): for each pair of kept faces on one line (`_parallel` within 1°, `_perp` ≤ CELL, end-to-start gap ≤ `MERGE_GAP`), the joined segment's grid; if the gap's columns have ≥ `LINTEL` of their rows above the lowest `OPEN_MIN` filled, the pair becomes one face (`fit_line` on both point sets, `rmse`, `coverage` over the joined length, `grid` the joined one). Comment: "MA-5a (a wall rule, recorded under MA-4h): a face broken at a doorway by MAX_GAP is one wall when a lintel bridges the gap — measured on Kladno: <T-3>".
- [ ] **1.3 Candidates (:411-422):** after each wall is appended, its faces' holes → openings. Along is measured from `LocationCurve.start` along `u = (end − start)/L` (the centreline, not a face end: faces can sit half a thickness off, `_centreline`); a face's hole at along `[a0, a1]` maps by projecting its end points onto the centreline. Two faces' holes overlapping > 0.5 along (`_overlap`'s rule) → one opening: `along0 = min`, `along1 = max`, rows the union, `faces_seen: 2`; else `faces_seen: 1`.

```python
for m, (a0, a1, lo, hi, border, seen) in enumerate(openings, 1):
    sill, head = lo - zf, hi - zf  # mm above the storey's floor; a door's sill is HEIGHT_EDGE's strip, said as 0
    kind = "door" if lo <= zf + HEIGHT_EDGE + DOOR_ROWS * GRID else "window"
    mid = (a0 + a1) / 2
    out.append({"cid": f"scan-{name}-wall-{n}-{kind}-{m}", "kind": kind,
                "geometry": {"host": f"scan-{name}-wall-{n}", "storey": lv, "Location": [r(x1 + ux * mid), r(y1 + uy * mid), r(zf)], "along_mm": r(mid)},
                "measured": {"width_mm": r(a1 - a0), "height_mm": r(hi - lo), "sill_mm": 0 if kind == "door" else r(sill), "head_mm": r(head)},
                "evidence": refs(pts, f"slice-{name}"),
                "fit": {"inliers": int(border_cells), "rmse_mm": 0.0, "coverage": round(border, 3), "faces_seen": seen}})
```

  `pipeline.py:6-7`'s words become: "Candidates carry no type: the bridge types them (MA-4d; a door or window by its size, MA-5a). LOD 200 as found — never survey or permit grade (D7): a closed door reads as wall; a hole in a wall face is an opening or an occluder, said by its border (MA-5a); glazing is seen through, so a glazed door reads as a door and a curtain wall as no wall; swing, hinge, frame and lintel are not read; stairs are not read."
- [ ] **1.4 `service.py:25`:** `VERSION = "0.5.0"  # MA-5a: doors and windows from each wall face's occupancy, a face merged across a doorway. A job read by 0.4.0 is proposed and overlaid as before; a measure of one fails in words (changesets-store verify)`; :29 gains the live K-1 numbers at the drill.
- [ ] **1.5 Tests.**
  - `building(seed, spacing, ceilings, door=None, window=None)` (:96-126): `door = ((3000, 3900), (0, 2100))` masks the south wall's inner (`y = S`) and outer (`y = 0`) faces at those x and z; `window = ((2000, 3200), (900, 2100))` masks the east wall's inner (`x = X − E`) and outer (`x = X`) faces at those y and z; ground storey only. `Survey` keeps `building()` (no openings: every existing count holds — 8 walls, the key set at :533 unchanged for walls).
  - New class `Openings` on `building(door=…, window=…)`: still **8 walls** (the south wall merged, pinned: its `length_mm` ≈ 7 700 ± 150); exactly one `door` on the south wall's cid, `width_mm` 900 ± 100, `sill_mm` 0, `head_mm` 2 100 ± 100, `along_mm` ≈ 3 450 ± 100 from the centreline's start, `faces_seen` 2; one `window` on the east wall, width 1 200 ± 100, `sill_mm` 900 ± 100, `height_mm` 1 200 ± 100; none on L01 or the other walls; the key set `{"cid","kind","geometry","measured","evidence","fit"}` and `fit` keys `{"inliers","rmse_mm","coverage","faces_seen"}` for openings (walls keep :536's three); determinism (json-equal on a second run).
  - `Knobs`: a 1 200 mm hole with points missing only at z 900..1 900 on **one** face (an occluder's shadow): proposed as a window with `faces_seen: 1` and `coverage` < 0.5 (flagged, not promoted — the bridge reads `faces_seen`); the doorway case at :611-612 stays (two 700 mm pieces are still nothing: ponytail); a new case: two 3 m pieces 900 mm apart with a filled lintel → one face; with nothing above → two faces.
  - `test_the_words`: the new header words pinned where the old were.

**Measured first (T-3, before commit).** The harness, 0.5.0 code, placeholder constants above; then one knob at a time on GF, 1F held out:

| Row | Wall F1 100 mm GF / 1F | Openings F1 50/100/200 GF | 1F | kind_agreement | candidates door/window GF, 1F | s | MB |
|---|---|---|---|---|---|---|---|
| 0.4.0 (no openings) | 0.184 / 0.419 | 0 | 0 | — | 0 | 200 | 1 930 |
| 0.5.0 placeholders | | | | | | | |
| OPEN_MIN 2 / 4 | | | | | | | |
| LINTEL 0.5 / 0.8, MERGE_GAP 1 500 / 3 500 | | | | | | | |
| DOOR_ROWS 0 / 2 | | | | | | | |

Kept: the row where openings F1 at 100 mm rises on **both** storeys over the placeholders and wall F1 does not fall on either; seconds ≤ 300, MB ≤ 2 500 (gates). The numbers go in the constants' comments and the commit message. **Founder decision (default: take the kept row; if no row beats the placeholders on both storeys, ship the placeholders and say so in the design row).**

**Acceptance:** suite green; T-3 table in the commit; `pipeline.survey` on the synthetic building < 10 s.

## Task 2 — the bridge: the opening element, typing by size, the gaps

**Files:** `survey-plan.mjs` (:8-11, :20, :85-87, :239-251, :254-298, :355), `changesets-logic.mjs:421`, `changesets-typing.mjs` (no change: the typer stays; the size path is the planner's), `holding-logic.mjs:98` (export `sectionOf`), `changesets-store.mjs` (pass `catalog` to `planSurvey`, ~:299-306), `build-jobs.mjs:26,116,214`, tests.

- [ ] **2.1 `holding-logic.mjs:98`:** `export const sectionOf` (one word; the planner reuses it — do not copy the regex).
- [ ] **2.2 `build-jobs.mjs:26`:** `KINDS = ["level", "wall", "floor", "ceiling", "door", "window"]`; `:116` and `:214` follow. Tests `:94,101`: `counts: {…, door: 0, window: 0}`.
- [ ] **2.3 `survey-plan.mjs`:**
  - `placeRefusal` (:85-87): `g.Location ? [g.Location] : …` so an opening's point is range-checked.
  - `SIZE_BAND_MM = 100` with `// MA-5a: one occupancy cell (pipeline.GRID); ponytail: a wider band picks a neighbouring leaf size — a person decides past it`.
  - `typeBySize(catalog, category, w, h)` → `{row} | {rows} | null`: `catalog.types` of the category (`core.sameCategory` — the store passes the bundle's) whose `sectionOf(type)` is within `SIZE_BAND_MM` of both `w` and `h`; one → `row`; several → `rows`; none → null.
  - In `planSurvey`, after the walls loop and before floors (`:276`): for each `c` of `mine` with `kind` door/window: `again(c)` → skip; `hi = walls.findIndex(w => w.cid === c.geometry.host)`; host unknown → gap `{category, want: null, size, key: "host wall not on the job"}`; `typed[hi].gap` → `gap(c, {category: KIND_CATEGORY[c.kind], want: null, size, key: \`host ${walls[hi].cid} is a type gap\`})` with the reason `"type gap — its host wall ${host} is a type gap; it is placed once the wall is; it waits in the Holding Area"`; else:
    ```js
    const { width_mm: w, height_mm: h, sill_mm: sill } = c.measured, size = `${w} x ${h} mm`, hf = typed[hi].loc?.location;
    const facts = { params: { ...(hf ? { HostFunction: hf } : {}), Size: `W${w} x H${h} mm` } };
    let g = gapOf(type, c.kind, facts, c.cid, null), by = null;
    if (g && !g.want) { const s = typeBySize(catalog, KIND_CATEGORY[c.kind], w, h);
      if (s?.row) { by = s.row; g = null; }
      else if (s?.rows) g = { ...g, size, key: `${s.rows.length} ${KIND_CATEGORY[c.kind]} types are named within ${SIZE_BAND_MM} mm of ${size}: ${s.rows.map((r) => `${r.family} : ${r.type}`).join(", ")} — a person picks one`.slice(0, 500) };
      else g = { ...g, size, key: `no ${KIND_CATEGORY[c.kind]} type is named within ${SIZE_BAND_MM} mm of ${size}` }; }
    if (g) return gap(c, g);
    const L = trimmed[hi], tr = L.trim_mm[0] ?? 0, p = pointAlong(L.start, L.end, c.geometry.along_mm + tr); // start' = start + t0·u, trim_mm[0] = −t0
    elements.push({ op: "create", kind: c.kind, cid: c.cid, evidence: c.evidence, facts,
      validate: { identity: { Class: KIND_ENTITY[c.kind], Name: c.cid } },
      place: { LevelName: s.level, Location: [...M.xy(p), E], ...(by ? { FamilyName: by.family, TypeName: by.type } : {}), ...(c.kind === "window" ? { SillHeight: sill } : {}) },
      reason: (`scan ${c.kind} ${c.cid} in ${walls[hi].cid}: ${w} wide, ${h} high${c.kind === "window" ? `, sill ${sill}` : ""} mm as measured · hole border ${c.fit.coverage} (${c.fit.faces_seen} face(s) seen; a hole is an opening or an occluder) · ` +
        `${by ? `typed by size from the catalogue: ${by.family} : ${by.type}` : "typed by an office rule"} · sill and head not scored against a reference (MA-5a) · ${ref}`).slice(0, 500) });
    byCid.set(c.cid, { ...trust(c), accuracy: { ...trust(c).accuracy, status: "insufficient_data", basis: "framing" }, pretick: false,
      ...(by ? { typing: { typed_by: "bridge-size", type: by.type, family: by.family, size, band_mm: SIZE_BAND_MM, catalog: catalog.label, catalog_sha256: catalog.sha256 ?? null } } : {}) });
    ```
    `pointAlong(a, b, t)` = `a + t·û` in the scan frame (0.1 mm). The 500-char `key` with 13 "family : type" pairs **truncates**: the test pins the truncated form (critic 6).
  - `gap()` (:246-251): its reason already covers "no office rule types it (key)"; the host sentence above is a third branch keyed on `g.key.startsWith("host ")`.
  - `:355` `meshFaces` comment: "an opening is drawn over (MA-5a places doors and windows in the wall; its re-read stays the wall's box — the hole counts as unseen coverage in deviation)".
  - `measurePlan` (:404-414): the existing fallback `a ${el.kind} is not measured by sentinel-survey` is kept word for word; a test now asserts it for a door.
- [ ] **2.4 `changesets-logic.mjs:421`:** `typing: fromJob?.typing ?? (typed ? typed.typing : { typed_by: "caller" })`. Comment: "MA-5a: an element the planner typed by size records that, never 'caller'".
- [ ] **2.5 `changesets-store.mjs` (~:299-306):** the catalogue standard already resolved for the typer is passed as `catalog: {types, label, sha256}` plus `sameCategory` (the bundle's) into `planSurvey`. Builder verifies the exact lines.
- [ ] **2.6 Tests (`survey-plan.test.mjs`, the drill's job fixture gains the synthetic `door` and `window` candidates; a catalogue fixture with one `BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_900 x 2100 mm` and one `BDS_Window_1 Panel+FX : 1200x1200 mm`):**
  - the door and window are elements of GR-FFL's body after its walls; `Location` lies within 0.1 mm of the host's **trimmed** line (the fixture's south wall has `trim_mm[0] = −140`, `trimEnds` test :81) and `z = E`; the window carries `SillHeight: 900`, the door none; `FamilyName`/`TypeName` from the size row; `byCid` has `typing.typed_by: "bridge-size"`, `accuracy.status: "insufficient_data"`, `basis: "framing"`, `pretick: false`; `validateChangeset` keeps that typing (2.4) — pinned on the stored element.
  - two rows at the size (the BDS 1000 x 2100 fixture of 13) → a gap whose `key` begins `"13 Doors types are named within 100 mm of 1000 x 2100 mm: BDS_EXT_1 PNL : BDS_EXT_1 PNL_GLASS_1000 x 2100 mm, …"` and is 500 chars long; none → `key: "no Windows type is named within 100 mm of 1200 x 1200 mm"`, `size: "1200 x 1200 mm"`, and `typeGapGroups` with a catalogue holding `1200x1200 mm` **closes** it (`catalogMatch`, `holding-logic.test.mjs:132-138`'s shape).
  - host a gap → the opening's exception reason pinned: `"type gap — its host wall scan-L00-wall-2 is a type gap; it is placed once the wall is; it waits in the Holding Area"`; host filed (decision 19 fixture :67) and the opening not → the opening is proposed, the wall not.
  - `placeRefusal` on a far `Location`; determinism; a 0.4.0 result (no openings) plans as before (existing cases unchanged).
  - `measurePlan`: a placed door → skip `"a door is not measured by sentinel-survey"`.
- [ ] **2.7 Web:** `evidence.ts:127` `FOUND` adds `["door","door(s)"], ["window","window(s)"]`; `evidence.test.ts:133,141` the job line gains `0 door(s), 0 window(s)`; `files-panel.ts:609` "levels, walls, floors, ceilings, doors and windows"; `mcp-server.mjs:136` `kind: level|wall|floor|ceiling|door|window`.

**Acceptance:** `vitest run survey-plan.test.mjs changesets-logic.test.mjs changesets-store.test.mjs build-jobs.test.mjs holding-logic.test.mjs` and the web suite green; no `NOT_MEASURED` on an opening gap.

## Task 3 — the add-in: hosted placement as it stands (gates, no code)

**Files read, not changed:** `ChangesetExecutor.cs:574-620`, `PlacementGeometry.cs:14-26`, `GhostFiling.cs:173-183`, `ChangesetClient.cs:39-48`.

- [ ] **3.1** Confirm by reading: a create of kind door/window with `Location`, `LevelName`, `FamilyName`, `TypeName`, `SillHeight` is placed by `NewFamilyInstance(pt, sym, hosts[i], level)` into the one wall within 1 mm, after the same changeset's walls and `doc.Regenerate()`; the ghost stamp and `source: "sentinel-survey 0.5.0"` come from the body as for walls; Undo is the changeset's one transaction. Note each in the plan's gate list with the line read.
- [ ] **3.2 Gate (R-0):** the scratch model holds the families the fixture types to (`BDS_INT_1 PNL`, `BDS_Window_1 Panel+FX`) — loaded by the controller if absent (a load from the office's own family files already on this PC; nothing downloaded) — and the catalogue installed on the drill project names those types. Without them `CreateType` refuses in words and R-2 cannot pass.
- [ ] **3.3** If R-2 fails inside the executor (a wall-hosted family refused, a 2-host hit), the fix is a finding under this slice, built then — not pre-built.

## Drill MA5a

**Project:** `ma4c-drill` (the synthetic building; the BDS layer-free guideline and the catalogue installed, as MA4d P-0) for R-rows; `kladno-drill` for K-rows. Scan: `two-storey-openings.las` written by `building(door=…, window=…)` from the test's writer into the pack as a new item (admitted by the controller). **R-2 runs on a fresh scratch copy of the drill model with no survey walls in it** (critic 1): the new job is a new ledger row, so its 8 walls are proposed again and a second wall under the door's point would roll the changeset back.

| Row | What | Bar |
|---|---|---|
| T-0 | Four sill/plan images made, traced (decision 1), `reference-5a.json` built | shas and `saved` times in the notes, every save before the first 0.5.0 job; wall storeys field-equal to `ce1a4f46…` |
| T-3 | Harness table (Task 1) | the kept row rises on both storeys; wall F1 not down; ≤ 300 s, ≤ 2 500 MB |
| U-1 | Python suite; bridge + web suites | green; counts in the notes |
| K-1 | Live Kladno job on 0.5.0 (`kladno-drill`) | done ≤ 5 min wall-clock, peak ≤ 2.5 GB (gates); the receipt's `version` 0.5.0 |
| K-2 | `reference.py score result.json reference-5a.json` | equals T-3's kept row within 0.005; door/window counts per storey recorded against the trace's hand count (design :1183) |
| K-3 | Propose Kladno GF | elements ≤ 200 or the 413 in its words; the Holding rows name sizes ("W x H mm"), none `NOT_MEASURED` |
| R-0 | Scratch model, families loaded, catalogue installed | `CreateType` finds both |
| R-1 | Run survey on `two-storey-openings.las`, propose at frame 0 | one changeset for L00 with 8 walls, 1 door, 1 window after the walls; the door's reason says "typed by size from the catalogue"; the window's `SillHeight` 900 ± 100 |
| R-2 | Apply in Revit 2024 | 10 ghosts placed; the door's and window's `Host` is the south/east survey wall (read in Revit); the window's Sill Height 900 ± 1 of the filed value; one Undo removes all 10 |
| R-3 | The ledger | the stored element's `typing.typed_by` is `"bridge-size"` with the catalogue's label and sha; `pretick` false; `accuracy.basis` "framing" |
| H-1 | A run with the door type removed from the catalogue (the size fixture) | the Holding row `"no Doors type is named within 100 mm of 900 x 2100 mm"`; re-install the type → the row closes by catalogue |
| H-2 | A run with the south wall's type removed | the door's exception reason names its host gap; nothing placed for it |
| V-1 | verify:measured after R-2 | the door and window skipped with `"a door is not measured by sentinel-survey"`; the host wall measured; its coverage under 1.0 said in the notes (the hole) |

## As built and measured (2026-10-10)

**The opening reference (T-0).** Decision 1's default (the founder traces) was replaced under the founder's standing "continue on your own": a scratch tool listed every empty stretch ≥ 300 mm along the MA-4h wall lines on the 1200 and sill images (GF 50, 1F 28 candidates), and three readers labelled each none / door / window on 3.2 m crops of both images — Claude (who also wrote the finder) and two independent reviewers who saw neither each other's labels nor Claude's. **The reviewers agreed with each other on 98–100 % of candidates and with Claude on only 62 % (GF) and 79 % (1F): Claude over-called openings (24 on GF against their 9–10).** The majority of three is the reference: GF 7 doors + 2 windows, 1F 17 doors. `reference-5a.json` sha `61ee7e01…`; its wall storeys field-equal to `ce1a4f46…`; traces GF `acf5856e…` / sill `2daad53c…`, 1F `978a20b3…` / sill `abd7d66d…`; sill images GF `8e9d93ed…`, 1F `ab635ab3…`. The attic has no openings traced.

**T-3, one knob at a time** (kept only when opening F1 at 100 mm rose on GF and 1F and wall F1 did not fall; every number tuned on this one reference — 9 GF openings make GF's numbers coarse):

| Step | Openings F1 @100 GF / 1F | Walls @100 GF / 1F | Kept |
|---|---|---|---|
| 0.4.0 (no openings) | 0 / 0 | 0.184 / 0.419 | — |
| 0.5.0 placeholders (3 × 3 cells, merge, speck 2) | 0.014 / 0.112 | 0.204 / 0.497 | — |
| `OPEN_W` 5 | 0.020 / 0.131 | same | ✓ |
| `OPEN_W` 6 | 0.022 / 0.120 | same | ✗ (and a BDS window is 600 mm at the least) |
| `OPEN_H` 8 / **10** | 0.053 / 0.317 → **0.060 / 0.325** | same | ✓ |
| `MIN_BORDER` 0.3 / **0.5** | 0.083 / 0.351 → **0.100 / 0.394** | same | ✓ |
| + both faces seen | 0.095 / 0.686 | same | ✗ (GF falls) — the founder's call |
| `LINTEL` **0.5** (a wall rule) | 0.100 / 0.394 | 0.211 / 0.500 | ✓ |
| `MERGE_GAP` 1500 / 3500 | 0.100 / 0.400 both | 0.204 / 0.494 · 0.497 | ✗ |
| `DOOR_ROWS` 0 / 2; `SPECK` 1 / 3 | unchanged; 0.074 / 0.361, 0.093 / 0.382 | same | ✗ |

**At the kept knobs (in memory, 130 s):** openings F1 0.264 / 0.283 / 0.358 at 50 / 100 / 200 mm (P 0.188, R 0.577 at 100; GF 0.050 / 0.100 / 0.150, 1F 0.394 / 0.394 / 0.485); every matched opening's class right (kind_agreement 1.0); walls 0.299 / 0.357 / 0.396 (0.4.0: 0.245 / 0.304 / 0.340 — the merge across doorways). **The ceiling:** 4 of GF's 9 traced openings lie on a wall the survey finds at all (1F 16 of 17) — GF's opening recall is capped by its walls. Counts against the hand count (design :1183): GF 25 doors + 6 windows against 7 + 2, 1F 38 + 11 against 17 + 0.

**Changes from the plan, each measured or forced by a case:**
- **Two minimums, not one:** `OPEN_W` (along) and `OPEN_H` (up) — doors and windows are taller than wide.
- **`SPECK` 2:** a filled cell with ≤ 2 filled neighbours is stray points, not the face — a pair inside the drill's doorway shrank a 1000 mm door to 750 before it.
- **`MIN_BORDER` 0.5:** a hole is kept only when half its border holds the face (decision 6's credibility became a measured knob).
- **Jambs, sill and head at the middle of their boundary cell:** the empty cells alone undershoot by up to a cell a side (1200 read 1098).
- **The `Size` fact to the nearest 100 mm, not 10** (bridge): the scan measures to one 100 mm cell and an office names its doors at nominal 100 mm steps; at 10 mm an office rule at "W1000 x H2100 mm" never meets a scanned door. The measured mm stay in the reason.
- **The Holding Area** closes a survey opening's gap only when exactly one catalogue row lies in the band (review finding: the first exact-size row closed a 13-row group at once); Promote groups keep the exact size (D16).
- **Revit's review** words name `bridge-size` typing (`ChangesetClient.cs`, display only; promote-check pins it).

**The drill's buildings.** A job reads every admitted scan of its project, so the opening building cannot be added to `ma4c-drill` beside the plain one (the holes would be filled by the other scans). `two-storey-openings.las` (sha `0a6267a26e5e…`, seed 11, spacing 50) is the drill building 20 m east: an 800 × 1200 window (sill 900) in its east wall, a 1000 × 2100 door in its south wall. Surveyed alone at the kept knobs: 8 walls, window 803 × 1200 sill 900 (both faces, border 0.79), door 1050 × 2100 (both faces, border 0.75).

**BDS types doors only in interior walls.** The project's layer-free guideline has wall rules only, so an opening types by size: one BDS row at 800 × 1200 (`BDS_Window_1 Panel+FX : 800x1200 mm`) — typed; every door at a buildable height has 13 or 16 rows — a gap, "a person picks one". The office's elements guideline types interior doors (`HostFunction Interior` + nominal size); installing it beside the layer-free one is the office's standards decision (Next). R-2 therefore places the window hosted, and R-1 shows the door's Holding row.

## Risks

- **A hole is not an opening.** A cupboard, a radiator niche, a scanner shadow read as holes; a closed door reads as wall. The border coverage and `faces_seen` are on every reason; precision is the number to watch in K-2, and the design row says it.
- **Sill and head unscored.** The sill reaches Revit as `SillHeight` with no reference; the reason says so. A window with a sill under 400 mm reads as a door on the 700 cut (critic 13); the head cut is Next.
- **The size band.** ±100 mm picks the nearest catalogue leaf; two sizes 100 mm apart both match and the opening is a gap, by design. The BDS catalogue holds 13 doors at one size: Kladno's doors will mostly be "a person picks one" rows.
- **Time.** The grid per face is bounded by the height filter's own scan (one pass); the merge's joined grids are per collinear pair. K-1 is the gate; if it fails, the row is a finding, not a merge.
- **Decision 19.** Only the same job's row keeps its cids: a second scan of the same building proposes every wall again. R-2's scratch copy avoids the 2-host rollback; the live Kladno path is unaffected (no walls placed there).
- **The 200 bound** counts openings now; Kladno GF's typed elements are few (gaps), but a well-typed building reaches it sooner.
- **One tracer** (the founder, or Claude with the bias disclosed): the reference's openings carry the tracer's reading of a gap.

## Next

- The head cut (floor + 2200) for a scored head and sill class; sill in mm from a side-elevation image of each found opening only.
- A sloped-roof storey's height (MA-4h-4's Next) — the attic proposes nothing, so no openings there.
- Rooms, PDF, alignment, `rehost`, DWG revisions: MA-5b onward (design :1173-1180).
- Splitting a storey over 200 elements; a Holding row that lists all 13 rows unclipped.
- Normals from the scan to tell a nib from a doorway and glass from nothing.

## Critique applied

Accepted and built in: 1 (scratch copy, 8 walls + 2 openings in one changeset; "host filed" is a unit test only), 2 (`:421` passes `fromJob.typing`, pinned; R-3 depends on it), 3 (Task 1's code first, constants committed with T-3), 4 (`along + trim_mm[0]`, tested on a wall with trim −140), 5 (the dead ±100 branch is gone; the band is the catalogue search's explicit ±100 mm), 6 (13 rows counted from the file; the truncated 500-char key pinned), 7 (grid once per face, joined grids per pair only; seconds and MB per T-3 row; K-1 a gate), 8 (field compare, no byte-equality), 9 (sill/head unscored in the reason, `basis: "framing"`, class only; the head cut a founder decision, default no), 10 (`HostFunction` + `Size`), 11 (merge before `outline`), 12 (`:536`; the Knobs block's lines reread), 13 (reworded: a sill under 400 mm reads as a door), 14 (`insufficient_data`/`framing`, pinned), 15 (`sectionOf` exported), 16 (the merge recorded under MA-4h's wall rule).

Refuted: none. One narrowing: critic 9's head cut is not taken by default — it costs tracing before a single opening number exists; it is Next unless the founder asks for it at T-0.