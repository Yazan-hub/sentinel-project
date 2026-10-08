# MA-4c — sentinel-survey v0.1 (numpy, plain LAS, 127.0.0.1 only) and the bridge's job supervisor: storeys, walls, floors and ceilings as untyped candidates, `build:run` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The third slice of MA-4 (design `docs/strategy/2026-09-30-model-automation-design.md` ▸ MA-4, :1125-1145; the MA-4a plan's Next, `docs/superpowers/plans/2026-10-08-ma4a-evidence-pack.md:1122`). A signed-in contributor presses **Run survey** under Files ▸ Evidence. The bridge picks every admitted, surveyable LAS scan of the pack in force (every other scan is listed as refused, with why), makes a job folder, and starts **sentinel-survey** — a Python service on this PC, numpy and the standard library only, listening on 127.0.0.1 on a port it picks, answering only that start's token — for that one job. The service re-hashes each file before the read (a changed one is refused) and after it (a change during the read fails the job), reads plain LAS 1.2-1.4 in chunks, and measures, in each slice's local frame: **storeys** from a height histogram, **walls** from a mid-storey density slice (faces by a Hough transform and a least-squares fit, paired by `WallPairing`'s rule ported to Python), **floors and ceilings** as oriented rectangles. The candidates carry **no type** (typing is MA-4d). The bridge keeps the result (`result.json`, its sha256 on the job record) and writes **one `build:run` row** per run (done, failed or refused) — the bridge's own row, `claimed: false`, never the add-in's claimed receipt. The service is stopped when the job ends, when it overruns, when the bridge exits, and — for a bridge killed hard — by its own stdin watchdog. The web shows the jobs and a done job's candidates; MCP gains the read-only `sentinel_build_status`.

**Architecture:**
- `survey/` (new, top level — sentinel-survey; Python 3.14 + numpy 2.4.6 already on the PC, nothing downloaded): `las.py` (the plain LAS reader), `pipeline.py` (the measuring code and the `WallPairing` port), `service.py` (the HTTP service, one job per process), `test_survey.py` (unittest on synthetic LAS made in the test).
- `WebApp/bridge/survey-service.mjs` (new): `runSurvey(job, deps)` — spawns `python.exe -E -B survey/service.py` without a shell, with an allow-listed environment, reads `{port, version}` from its first stdout line, drives `GET /health`, `POST /jobs`, polls `GET /jobs/:id`, fetches the result, stops the child. `notSetUp()`, `childEnv()`. Deps injected; tested with a Node stand-in (`fixtures/survey-standin.mjs`) and once with the real Python.
- `WebApp/bridge/build-jobs.mjs` (new): the routes' work — `startJob`, `listJobs`, `readJob` — the item filter, the job folder (`SENTINEL_JOBS_ROOT`, default `%APPDATA%/Sentinel/jobs/<key>/<job-id>/`), one job at a time per bridge, the result kept and re-hashed, the `build:run` row.
- `WebApp/bridge/evidence-store.mjs`: `surveyStart(key, packId)` — the checks before a job (a person, a contributor of an office project, the budget, the pack in force), reusing `wire`, `officeProject` and `packOf`.
- `WebApp/bridge/bcf-service.mjs`: `POST/GET /cde/:key/build/jobs`, `GET /cde/:key/build/jobs/:id` beside the evidence routes.
- `WebApp/bridge/mcp-server.mjs`: `sentinel_build_status` (read-only).
- Web: `src/setups/evidence.ts` (types, pure lines, three calls), `files-panel.ts` (a Survey block inside Evidence: the jobs, Run survey, Candidates on demand).
- `WebApp/scripts/make-two-storey-las.mjs` (new): the drill's synthetic two-storey building (walls of known thickness and place), deterministic.

**Tech Stack:** Python 3.14.2 (`C:\Python314\python.exe`, PSF-2.0) with numpy 2.4.6 (user site; BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0) and the standard library (`http.server`, `json`, `hashlib`, `hmac`, `struct`, `threading`); Python's `unittest`. Node bridge (vitest; `node:child_process` spawn — the bridge's first runtime child process, the founder's OK). TypeScript web (plain DOM). No new npm or pip dependency, no download, no migration, no new table (design :947), no add-in change.

**Base:** `feature/ma4c-sentinel-survey` at master `271ea24`. Repo root: the checkout. Every file:line below was read at `271ea24`. Every Python number in this plan (storeys, thicknesses, determinism, the cap) and the drill file's sha256 were checked by running the code below in memory against Python 3.14.2 / numpy 2.4.6 on this PC.

## Global Constraints

- House style: words are sentences; a refusal says what is needed and ends "nothing was saved"; comments name the slice ("MA-4c") and the reason; a `ponytail:` comment on every deliberate simplification names its ceiling and upgrade path; exact words pinned in tests. The web bump (1.0.64) is the controller's at the merge.
- Commit messages `feat(survey|bridge|web|scripts): MA-4c - …` or `docs: MA-4c - …`, a blank line, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only on `feature/ma4c-sentinel-survey`.
- Tests: `npx vitest run <files>` from `WebApp`; Python from the repo root: `C:\Python314\python.exe -B -m unittest discover -s survey -v` (`-B`: no `__pycache__`). Never a bare `node bridge/bcf-service.mjs`. Restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with `git checkout -- bridge/fixtures/lod-matrix/ids-cases.json` if it shows as modified; never stage `WebApp/package-lock.json`. `npm run build` must build; `tsc` is not a gate (17 pre-existing errors; no new one).
- The repo is PUBLIC: fixtures use `example.test`; no path with a real user name in a test or a doc (temp folders only).
- **The trust rule (binding):** a job's `items`, `read`, `seed`, `started_by`, `started_at`, `status`, `result_sha256`, `reader`, `tools` and its `build:run` row are set by the bridge (and the service it ran), never taken from a body. A body sends only `{pack, readers?, params?: {voxel_mm?, storey_min_mm?}}`; any other key, at the top or in `params` (`seed`, `items`, `started_by`, `snap_mm`, …), is a 400 in words.
- **The bridge writes the ledger; the survey never does.** The service writes no file at all (its result comes back over HTTP), makes no network call (only `http.server`, pinned by an import test), never talks to Revit, does no typing.
- **No evidence byte leaves the PC:** the routes take small JSON (`SMALL_JSON`); the bridge names files on this PC to a process on this PC bound to 127.0.0.1 — never the Funnel, never Supabase, never That Open.
- **The child process:** an absolute `python.exe` (`SENTINEL_PYTHON`, default `C:\Python314\python.exe`; a relative or bare name is refused in words — spawn would search the cwd and PATH), `shell: false`, `windowsHide: true`, flags `-E -B` (not `-I`/`-s`: numpy is in the user site, found through `APPDATA`), an allow-listed environment (`SYSTEMROOT`, `APPDATA`, `TEMP`, `TMP`, `SENTINEL_SURVEY_TOKEN` — never `BCF_TOKEN`, `SUPABASE_*`, `THATOPEN_*`: `config/.env` is merged into `process.env`, `bcf-service.mjs:31`), stdout and stderr drained, killed on the job's end, its wall-clock bound, the bridge's `exit` event and (hard kill) its stdin watchdog; a job is not over until its python.exe has exited (5 s bound). One job at a time per bridge.
- Never print a token or an e-mail. Never run Revit. No download, no `pip install`.

## Source of truth

- Design (D): §2.1 rules 2, 3, 7 (:163-172); the scan section (:440-471); §6.2 manifest rules (:668-672); §6.3 contract v2 (:678-733); §6.6 `build:run` (:831); §6.8 routes and MCP (:877, :893-896); §6.9 the service contract (:898-926); §6.10 licences (:928-938); §6.11 storage and roles (:940-960); D4, D7, D11, D16 (:1330-1342); MA-4 (:1125-1145).
- The MA-4a plan (`2026-10-08-ma4a-evidence-pack.md`): decision 5 (Open3D dropped), decision 12c (who admits), Next (:1122).
- Code read at `271ea24`: `evidence-store.mjs:21-124, 189-311`, `evidence-logic.mjs:27-57, 129, 202`, `cde-store.mjs:1183-1357`, `doc-text.mjs:13-53`, `bcf-service.mjs:31, 70-98, 268-293, 541-575, 1287-1296, 1671-1691, 1814-1820`, `write-roles.test.mjs:98-151, 737-830, 1024-1082`, `mcp-server.mjs:126-133, 162-177, 244-248`, `changesets-logic.mjs:60-64`, `SentinelAddin/GhostBuilder/WallPairing.cs`, `tools/wallpair-check/Check.cs`, `files-panel.ts:76-87, 200-210, 277-279, 476-542`, `evidence.ts`, `html-sinks.test.ts`.

## Decisions (the founder's defaults; built on unless overruled)

| # | Decision | Default taken here |
|---|---|---|
| 1 | Where the Python lives | `survey/` at the repo root: `las.py`, `pipeline.py`, `service.py`, `test_survey.py`. Run in place from the checkout (the bridge runs from it too); `__pycache__/` git-ignored and never written (`-B`) |
| 2 | How the bridge finds Python | `SENTINEL_PYTHON` in `config/.env` (merged into `process.env`; the file wins over the shell's environment, `load-env.mjs:9-24`), default `C:\Python314\python.exe`; an absolute path only (`notSetUp` refuses a bare or relative name — spawn would resolve it through the cwd and PATH). Absent, relative (or `survey/service.py` absent) → a 503 in words before anything is written. The PC boots without Python: the service is started on a job, never at `listen()` |
| 3 | Service lifetime | **One process per job**: started for the job, stopped after. No idle service, no restart logic, memory returned after every job. ponytail: a warm service when MA-4e's `/measure` needs quick calls |
| 4 | Port and auth | Python binds `('127.0.0.1', 0)` and prints `{"port", "version"}` on one stdout line (no racy free-port probe, no firewall prompt); a 32-byte token per start in `SENTINEL_SURVEY_TOKEN`, compared with `hmac.compare_digest` on every request (any local process can reach a loopback port) |
| 5 | Kill paths | settle-once `end()` (the `doc-text.mjs` shape): the job's end, `READY_MS` 20 s to start, `JOB_MS` 10 min wall clock, the bridge's `process` `exit` event (covers SIGINT/SIGTERM's `process.exit`), and the stdin watchdog in Python (`taskkill /f` on the bridge or a closed console closes the pipe → `os._exit(3)`). No grandchildren, so no tree kill. `end()` settles only once the child has exited (bounded at 5 s): the job folder is its cwd, and the next job must not meet the last python.exe. A poll that times out (`CALL_MS` 10 s) is a busy service, asked again; only `BUSY_MS` 60 s of silence fails the job (numpy can hold Python's lock for seconds on a big cloud) |
| 6 | Who starts a job | **A signed-in contributor or above of an office project; the machine credential is a 403** ("a survey job needs a person — its build:run row names who started it: sign in. Nothing was saved."). Why: the result is what MA-4d will trust for `measured` and pre-tick, so the run names a person (as an admission does, MA-4a 12c); the MCP server and any local script hold the machine credential, and design :896 allows no write tool beyond proposing — so no agent can start CPU-heavy jobs; and the web is the only surface in 4c. Reads: any member (viewer), the machine credential too (MCP) |
| 7 | Concurrency and budget | One job at a time for the whole bridge (a 409 in words; the PC's CPU is the scarce thing, the `doc-text.mjs` flag); `takeWriteBudget("survey jobs", {perUser: 6, all: 12})` — the Re-check precedent |
| 8 | Which items | The bridge picks, from the pack in force, every `kind: scan` item that is not `changed`, is `surveyable`, allows `geometry_extraction`, and is `.las`; every other scan goes in the job's `refused` with why (`.laz`/`.e57` "read from MA-4g", `.rcp` not surveyable, flagged, uses). None left → a 409 naming each, nothing started. The service refuses, per item, a changed sha, a `.las` whose point format carries the LAZ bits, a non-LAS, LAS 1.0/1.1, a truncated file, a file over 300 million points; it fails the job when a file's sha moved during the read (re-hashed after), or when the scans span more than 300 m in plan (one building per job). The job keeps `items` (what was sent) and, once ended, `read` (what the result was measured from) |
| 9 | Job storage | Disk only, no table (D :947): `<SENTINEL_JOBS_ROOT or %APPDATA%/Sentinel/jobs>/<key>/<job-id>/job.json` (the bridge's record) and `result.json` (the result as it came, tmp-then-rename); kept after the run (no retention in 4c). `readJob` re-hashes `result.json` against `result_sha256`, which the `build:run` row also carries — the ledger row is MA-4d's anchor (`job.json` is editable on the PC; the hash-chained row is not) |
| 10 | Job ids | Per project, `job-0001` (`nextId` over the folder names; `/^job-\d{4,}$/`, so `job-10000` follows `job-9999`; listed newest first by number); the folder is made with a non-recursive `mkdir` (EEXIST → 409), so two bridges on one PC never share an id |
| 11 | The `build:run` row | `audit()` directly: entity_type `build`, action `build:run <job-id> · sentinel-survey <version> · <status>`, actor the starter, `new_value.claimed: false` and `result_sha256`. One per run that starts (done, failed, refused); none for a refusal before the start, none for a job the bridge died with. **Not reserved:** the open route can only ever write exactly `build:run` with `claimed: true` (`buildRunRow`, `cde-store.mjs:1320-1325`) and refuses any other `build:` action (:1352-1353), so a job row cannot be forged; reserving `build` would break the add-in's MA-1a receipts (`write-roles.test.mjs:758-765`). **The predicate MA-4d must use to accept a job's row** (pinned here, because the open route keeps any `new_value` — a row whose `new_value.job_id` names a job proves nothing): the row's id is `job.ledger.id`, its project is the job's, entity_type `build`, its action starts `build:run <job-id> · sentinel-survey `, `new_value.claimed === false`, and `new_value.result_sha256` equals the sha256 of `result.json` re-hashed then. An open-route row (action exactly `build:run`, claimed true) is never accepted. `readJob` checks only `job.json`'s copy (editable on the PC) and says so in its words |
| 12 | Wall shape | The survey pairs (design :448 vs :912, resolved): faces from the slice go through `pair()`, a rule-for-rule port of `WallPairing.Pair` (tested on `tools/wallpair-check/Check.cs`'s eight cases), longest face first so face *a* is the longer; a wall candidate is the paired centreline + `thickness_mm`, its faces kept in `geometry.faces`. An unpaired face is a wall candidate with no `thickness_mm` (WallPairing's honest 0), never dropped. `max_thickness` 600 mm for a scan (a corridor is not a wall; WallPairing allows 1000 on drawings) |
| 13 | Candidate frame and keys | Millimetres, the scan's own frame (no CRS, no transform; the Hough runs in each slice's local frame and gives its faces back in the scan's), LAS taken as metres (no VLR read). Geometry uses the contract's own keys so MA-4d copies, not translates: a level `{BaseElevation}`, a floor `{LocationLoop, storey}`, a ceiling `{Boundary, Offset (its height above its level, as `changesets-logic.mjs:77` and the propose tool take it), storey}` with its elevation under `measured`, a wall `{LocationCurve (z = base), BaseElevation, TopElevation, storey, faces}`; cids `scan-L00-level`, `scan-L00-floor`, `scan-L00-ceiling[-n]`, `scan-L00-wall-n`; evidence `ev-NNNN#slice-L00` / `#floor-L00` / `#ceiling-L00` |
| 14 | `snap_mm` | Dropped from the contract's params: the service does no typing, and catalogue snapping is the bridge's D16 policy (`type_snap_mm: 0`). In a body it is a 400 naming D16 |
| 15 | Seed | The bridge's constant `1`, on the job, the row and the receipt; used only by the seeded point cap. A body's `seed` (top level or in `params`) is a 400 |
| 16 | Registration | Not built (design :465, "Do not build registration"). The design's two "MA-4c" registration pointers (:671-672) are re-pointed (Task 10) |
| 17 | Licences | Every receipt and row lists each tool with the licence its package declares (numpy's `License-Expression`, read at run time). The §6.10 allow-list gains 0BSD, Zlib, CC0-1.0 (numpy's bundled parts) and PSF-2.0 (CPython) — all permissive; accepted by the founder on 2026-10-08. `tools/licence-check` stays unassigned (TARGET, no slice) |
| 18 | MCP | `sentinel_build_status` (read-only; list, or one job with its candidates) in 4c. No tool starts a job |
| 19 | Web | The smallest surface: inside Evidence, a Survey block — every returned job in one line, Candidates on demand for a done job, **Run survey** for a contributor signed in when no job runs. No poll, no SSE (↻ shows progress); no Holding Area, journey or Next-strip change |
| 20 | Gaps | Absent: `build:run.gaps` is `null` and the job has none — gaps exist only after typing (MA-4d) |
| 21 | Drill data | `make-two-storey-las.mjs` (new; the tiny script stays for MA-4a's record). The drill runs on a new project `ma4c-drill`: `ma4a-drill`'s pack holds `tiny.las`, whose two 10 × 10 m slabs would merge into the survey and items cannot be removed |

## Scope

In: sentinel-survey v0.1 (plain LAS, storeys, walls, floors, ceilings as untyped candidates, determinism, the refusals); the supervisor; the job routes, folder and record; `build:run`; the web Survey block; `sentinel_build_status`; the drill generator; the design amendments.

Out (see Next): typing, changesets, gap groups, `measured` trusted on a changeset, pre-tick (MA-4d); `POST /measure` and deviation (MA-4e); the Revit overlay (MA-4f); E57, LAZ, CRS (MA-4g); Kladno, run time and memory at scale, a site wider than 300 m, a read lock on the scans (MA-4h); web tiles (MA-4i); openings (MA-5); photos (MA-7); `tools/licence-check`; a job queue; job retention.

## Interfaces

```text
Bridge routes (small JSON; behind the auth gate like every /cde/ route)
  POST /cde/:key/build/jobs {pack: "evp-0001", readers?: ["sentinel-survey"], params?: {voxel_mm?: 5..50 = 20, storey_min_mm?: 1500..6000 = 2000}}
       → 202 {job}     (any other key, top level or in params, is a 400 in words)
  GET  /cde/:key/build/jobs        → 200 {jobs: [job…]}  newest first, at most 20
  GET  /cde/:key/build/jobs/:id    → 200 {job} | {job, candidates, derived, receipt} (done) | {job, result_error}

job (job.json) {id, project, pack_id, pack_version, reader: {name: "sentinel-survey", version}, status: queued|running|done|failed|refused,
  stage, pct, items: [{id, path, sha256}] (sent), refused: [{id, reason}], params, seed: 1, started_by, started_at,
  finished_at?, read?: [id] (ended: what the result was measured from — items less the refused when done, else []),
  tools?: [{name, version, licence}], error?, counts?: {level, wall, floor, ceiling}, candidates_total?, result_sha256?, ledger?: {id, hash}}

Bridge → service (design §6.9; one process per job; Authorization: Bearer <token>)
  stdout line 1   {"port": 51234, "version": "0.1.0"}
  GET  /health    → {version, tools: [{name: "sentinel-survey", version, licence: "LicenseRef-Sentinel"},
                                      {name: "python", version, licence: "PSF-2.0"}, {name: "numpy", version, licence: <declared>}]}
  POST /jobs      {job_id, items: [{id, kind: "scan", path: <absolute, inside the evidence folder>, sha256}],
                   params: {voxel_mm: 5..50, storey_min_mm, tolerances_mm: [50, 100, 200]}, seed} → 202 | 400 | 409 (one job per process)
  GET  /jobs/:id  → {status, stage, pct, refused: [{id, reason}], error?}
  GET  /jobs/:id/result → {candidates, derived: [], receipt: {tools, params, seed, started, finished, cpu_s, points_in, points_used, units}}

Candidates (no type; millimetres; the scan's frame)
  {cid: "scan-L00-level", kind: "level", geometry: {BaseElevation}, measured: {elevation_mm}, evidence: ["ev-0001#floor-L00"], fit}
  {cid: "scan-L00-floor", kind: "floor", geometry: {LocationLoop: [[x, y, z] ×4], storey: "scan-L00-level"}, measured: {elevation_mm, area_m2}, …}
  {cid: "scan-L00-ceiling", kind: "ceiling", geometry: {Boundary: [[x, y] ×4], Offset (height above its level), storey}, measured: {elevation_mm, height_mm, area_m2}, …}
  {cid: "scan-L00-wall-1", kind: "wall", geometry: {LocationCurve: {start: [x, y, zf], end: [x, y, zf]}, BaseElevation, TopElevation, storey,
     faces: [[x1, y1, x2, y2], …]}, measured: {length_mm, height_mm, thickness_mm? (absent: one face seen)}, evidence: ["ev-0001#slice-L00"], fit}
  fit: {inliers, rmse_mm, coverage}

build:run row  entity_type "build", entity_id null, action "build:run job-0001 · sentinel-survey 0.1.0 · done", actor the starter,
  new_value {job_id, reader, version, status, pack_id, pack_version, items: [{id, sha256}] (sent), read: [id], refused, tools, params, seed, started, finished,
  minutes, cpu_s, points_in, points_used, model_calls: 0, tokens: 0, candidates: {level, wall, floor, ceiling} | null, gaps: null,
  result_sha256 | null, claimed: false, error?}
```

## File map

| File | Change |
|---|---|
| `survey/las.py`, `survey/pipeline.py`, `survey/service.py`, `survey/test_survey.py` | new |
| `.gitignore` | `__pycache__/` |
| `WebApp/scripts/make-two-storey-las.mjs` | new (drill data; imported by a test) |
| `WebApp/bridge/survey-service.mjs`, `survey-service.test.mjs`, `fixtures/survey-standin.mjs` | new |
| `WebApp/bridge/build-jobs.mjs`, `build-jobs.test.mjs` | new |
| `WebApp/bridge/evidence-store.mjs` | `surveyStart` after `recheckRun` (:293-311) |
| `WebApp/bridge/evidence-store.test.mjs` | `:7` import; a new `describe` |
| `WebApp/bridge/bcf-service.mjs` | the build-jobs block after the evidence block (`:1689`, before `:1691`) |
| `WebApp/bridge/write-roles.test.mjs` | `:12` `existsSync`; `:115` env `SENTINEL_PYTHON`; a new `describe` after `:1082` |
| `WebApp/bridge/mcp-server.mjs`, `mcp-server.test.mjs` | a TOOLS entry after `:133`, a `callTool` branch after `:248`; counts `:17`, `:140` → 14; one test |
| `docs/mcp-server.md` | one row after `sentinel_changeset_status` (:22) |
| `WebApp/src/setups/evidence.ts`, `evidence.test.ts` | survey types, lines and calls; `evidenceControls.survey`; tests |
| `WebApp/src/setups/files-panel.ts` | `:18` import; state after `:81`; the jobs read after `:206`; wiring after `:279`; the Survey block in `evidenceSection` (`:541-542`) |
| `docs/strategy/2026-09-30-model-automation-design.md` | :446, :450, :451, :671, :672, :831, :877, :895, :921, :924, :929, :945, :953, :1132 (Task 10) |

---

### Task 1 — survey: the plain LAS reader

**Files:** create `survey/las.py`, `survey/test_survey.py`.

- [ ] **Step 1: the test first** — `survey/test_survey.py` (the whole file grows over Tasks 1-3; its header, helpers and the `Las` class now):
```python
# MA-4c — sentinel-survey 0.1's self-checks, run from the repo root: C:\Python314\python.exe -B -m unittest discover -s survey -v.
# The LAS reader, the WallPairing port (tools/wallpair-check/Check.cs's cases), the measuring code on a synthetic two-storey building
# written as a LAS here, determinism, and the service as the bridge runs it (its token, a changed file refused, the stdin watchdog, no
# file written, no network import). numpy and the standard library only.
import ast
import contextlib
import hashlib
import io
import json
import os
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from unittest import mock

import numpy as np

import las

HERE = os.path.dirname(os.path.abspath(__file__))


def write_las(path, P, minor=2, fmt=0, rec_len=20, laz=False, scale=(0.001, 0.001, 0.001), origin=(0.0, 0.0, 0.0)):
    """P (mm) as a plain LAS in metres — records (P/1000 - origin)/scale, per axis as real files do: a header and the records, no VLR."""
    size = {2: 227, 3: 235, 4: 375}[minor]
    h = bytearray(size)
    h[0:4], h[24], h[25] = b"LASF", 1, minor
    struct.pack_into("<HII", h, 94, size, size, 0)
    struct.pack_into("<BHI", h, 104, fmt | (0x80 if laz else 0), rec_len, len(P) if minor < 4 else 0)
    struct.pack_into("<3d", h, 131, *scale)
    struct.pack_into("<3d", h, 155, *origin)
    if minor == 4:
        struct.pack_into("<Q", h, 247, len(P))
    rec = np.zeros(len(P), np.dtype({"names": ["x", "y", "z"], "formats": ["<i4"] * 3, "offsets": [0, 4, 8], "itemsize": rec_len}))
    for k, a in enumerate("xyz"):
        rec[a] = np.rint((P[:, k] / 1000.0 - origin[k]) / scale[k]).astype(np.int32)
    with open(path, "wb") as f:
        f.write(bytes(h) + rec.tobytes())


def building(seed=7, spacing=100.0):
    """The drill building (mm), every face scanned: outer faces x 0..8000, y 0..6000, z 0..6000; walls west 250, south 300, north 200
    and east 300 thick; L00 floor 0, ceiling 2800; L01 floor 3000, ceiling 5800. A jittered grid, 2 mm of noise across each surface."""
    rng = np.random.default_rng(seed)

    def grid(a0, a1, b0, b1):
        A, B = np.meshgrid(np.arange(a0, a1, spacing), np.arange(b0, b1, spacing))
        a, b = A.ravel() + rng.uniform(0, spacing, A.size), B.ravel() + rng.uniform(0, spacing, A.size)
        m = (a < a1) & (b < b1)
        return a[m], b[m]

    def flat(x0, x1, y0, y1, z):
        x, y = grid(x0, x1, y0, y1)
        return np.stack([x, y, z + rng.normal(0, 2, x.size)], 1)

    def wall_x(x, y0, y1, z0, z1):
        y, z = grid(y0, y1, z0, z1)
        return np.stack([x + rng.normal(0, 2, y.size), y, z], 1)

    def wall_y(y, x0, x1, z0, z1):
        x, z = grid(x0, x1, z0, z1)
        return np.stack([x, y + rng.normal(0, 2, x.size), z], 1)

    W, S, N, E, X, Y = 250, 300, 200, 300, 8000, 6000
    parts = []
    for zf, zc in ((0, 2800), (3000, 5800)):
        parts += [flat(W, X - E, S, Y - N, zf), flat(W, X - E, S, Y - N, zc), wall_x(W, S, Y - N, zf, zc), wall_x(X - E, S, Y - N, zf, zc),
                  wall_y(S, W, X - E, zf, zc), wall_y(Y - N, W, X - E, zf, zc)]
    parts += [wall_x(0, 0, Y, 0, 6000), wall_x(X, 0, Y, 0, 6000), wall_y(0, 0, X, 0, 6000), wall_y(Y, 0, X, 0, 6000)]
    return np.concatenate(parts)


class Las(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.tmp.cleanup)

    def path(self, name):
        return os.path.join(self.tmp.name, name)

    def test_reads_las_1_2_to_1_4_in_millimetres_with_each_axis_scale_and_offset(self):
        scale, origin = (0.001, 0.0005, 0.01), (450000.0, 5500000.0, 250.0)  # a national-grid origin, a scale per axis, as real files have
        P = np.array(origin) * 1000 + np.array([[1000.0, 2000.0, 3000.0], [4500.0, -6250.0, 1.0]])
        for minor, fmt, rec_len in ((2, 0, 20), (3, 1, 28), (4, 6, 30)):
            p = self.path(f"a{minor}.las")
            write_las(p, P, minor, fmt, rec_len, scale=scale, origin=origin)
            head = las.read_header(p)
            self.assertEqual(head["count"], 2)
            got = las.read_points_mm(p, head)
            for k in range(3):  # within half a scale step on each axis: 0.5, 0.25 and 5 mm
                np.testing.assert_allclose(got[:, k], P[:, k], rtol=0, atol=scale[k] * 500 + 1e-6)

    def test_a_capped_read_is_the_same_whatever_the_chunk(self):
        p = self.path("chunks.las")
        write_las(p, np.random.default_rng(2).uniform(0, 9000, (5000, 3)))
        head = las.read_header(p)
        whole = las.read_points_mm(p, head, 0.3, np.random.default_rng(1))
        with mock.patch.object(las, "CHUNK", 7):
            np.testing.assert_array_equal(las.read_points_mm(p, head, 0.3, np.random.default_rng(1)), whole)

    def test_refuses_what_0_1_does_not_read_in_words(self):
        write_las(self.path("ok.las"), np.zeros((3, 3)))
        with open(self.path("ok.las"), "rb") as f:
            good = f.read()
        laz, old = bytearray(good), bytearray(good)
        laz[104] |= 0x80
        old[25] = 1
        for head, size, words in ((bytes(laz), len(good), "compressed (LAZ)"), (b"ASTM-E57" + good[8:], len(good), "not a LAS file"),
                                  (bytes(old), len(good), "LAS 1.1 is not read"), (good, len(good) - 1, "truncated")):
            with self.assertRaises(las.Refused) as e:
                las.parse_header(head[:375], size)
            self.assertIn(words, str(e.exception))
        write_las(self.path("none.las"), np.zeros((0, 3)))
        with self.assertRaisesRegex(las.Refused, "holds no points"):
            las.read_header(self.path("none.las"))
```
Run `C:\Python314\python.exe -B -m unittest discover -s survey -v` → fails (no `las`).
- [ ] **Step 2: `survey/las.py`:**
```python
# MA-4c — sentinel-survey 0.1's LAS reader (design §6.9; plan docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md): plain,
# uncompressed LAS 1.2 to 1.4, any point format 0-10 (a record's first 12 bytes are X, Y, Z in all of them), numpy and struct only.
# ponytail: no VLR is read, so no CRS — the coordinates are taken as metres in the scan's own frame (a LAS in US survey feet would read
# 3.28x too large; the receipt says "metres assumed"). The CRS (WKT or GeoTIFF keys) is read with laspy from MA-4g, with E57 and LAZ.
import os
import struct

import numpy as np

CHUNK = 8_000_000  # records per read: the sampling mask and the copies stay ~200 MB whatever the file's size


class Refused(Exception):
    """A file this version does not read (its words go in the job's refused[{id, reason}]), or a job it cannot measure (its error)."""


def parse_header(h, size):
    """The fields the reader needs, from a header's first bytes `h` (up to 375) of a file of `size` bytes; Refused in words otherwise."""
    if len(h) < 227 or h[:4] != b"LASF":
        raise Refused("not a LAS file (it does not begin LASF)")
    major, minor = h[24], h[25]
    if major != 1 or minor not in (2, 3, 4):
        raise Refused(f"LAS {major}.{minor} is not read — sentinel-survey 0.1 reads LAS 1.2 to 1.4")
    header_size, offset = struct.unpack_from("<HI", h, 94)
    fmt, rec_len, count = struct.unpack_from("<BHI", h, 104)
    if fmt & 0xC0:
        raise Refused("its points are compressed (LAZ) — sentinel-survey 0.1 reads plain LAS; LAZ is read from MA-4g")
    if fmt > 10 or rec_len < 12:
        raise Refused(f"point format {fmt} with {rec_len}-byte records is not a LAS point record")
    if minor == 4 and header_size >= 375 and len(h) >= 255:
        count = struct.unpack_from("<Q", h, 247)[0] or count
    if count == 0:
        raise Refused("the file holds no points")
    if offset + count * rec_len > size:
        raise Refused("the file is shorter than its header says (truncated)")
    return {"count": count, "offset": offset, "rec_len": rec_len,
            "scale": struct.unpack_from("<3d", h, 131), "origin": struct.unpack_from("<3d", h, 155)}


def read_header(path):
    with open(path, "rb") as f:
        return parse_header(f.read(375), os.path.getsize(path))


def read_points_mm(path, head, share=1.0, rng=None):
    """Every point's x, y, z in millimetres (N x 3 float64) — or, past the point cap, a seeded `share` of them (the same every run).
    Read CHUNK records at a time, so memory follows the points kept, never the file: the mask is drawn per chunk, and consecutive
    draws of one generator are the same stream however it is cut — the same points as one draw over the whole file."""
    dt = np.dtype({"names": ["x", "y", "z"], "formats": ["<i4"] * 3, "offsets": [0, 4, 8], "itemsize": head["rec_len"]})
    rec = np.memmap(path, dtype=dt, mode="r", offset=head["offset"], shape=(head["count"],))
    try:
        parts = []
        for a in range(0, head["count"], CHUNK):
            part = rec[a:a + CHUNK]
            if share < 1.0:
                part = part[rng.random(len(part)) < share]  # fancy indexing copies the kept records
            parts.append(np.stack([(part[k].astype(np.float64) * s + o) * 1000.0
                                   for k, s, o in zip("xyz", head["scale"], head["origin"])], axis=1))
            del part
        return np.concatenate(parts)
    finally:
        del rec  # Windows keeps a mapped file locked; nothing returned is a view of it (astype copies)
```
Run the tests → `Las` passes. (In this task the test file's header leaves out `import pipeline` — a missing module fails the whole file's import, `-k` cannot skip it; Task 2 Step 1 adds the line.)
- [ ] **Step 3: `.gitignore`** — append `__pycache__/` (Python never writes one under `-B`; a run without it must not dirty the tree).
- [ ] **Step 4: commit** — `feat(survey): MA-4c - sentinel-survey's plain LAS reader (1.2-1.4, numpy and struct; LAZ, E57, LAS 1.1 and truncated files refused in words)`

### Task 2 — survey: the measuring code and the WallPairing port

**Files:** create `survey/pipeline.py`; modify `survey/test_survey.py`.

- [ ] **Step 1: the tests** — add `import pipeline` after `import las` in the header, and append to `test_survey.py`:
```python
class Pair(unittest.TestCase):
    """tools/wallpair-check/Check.cs's cases, rule for rule: the port gives what WallPairing.cs gives."""

    def test_two_faces_are_one_wall_with_its_thickness_and_centreline(self):
        w = pipeline.pair([(0, 0, 5000, 0), (0, 200, 5000, 200)])
        self.assertEqual(len(w), 1)
        self.assertAlmostEqual(w[0][4], 200, places=2)
        self.assertAlmostEqual(w[0][1], 100)
        self.assertAlmostEqual(w[0][3], 100)

    def test_a_rooms_opposite_walls_stay_two_unpaired_lines(self):
        self.assertEqual([x[4] for x in pipeline.pair([(0, 0, 5000, 0), (0, 4000, 5000, 4000)], max_thickness=1000)], [0.0, 0.0])

    def test_a_reversed_face_pairs(self):
        w = pipeline.pair([(0, 0, 3000, 0), (3000, 300, 0, 300)])
        self.assertEqual(len(w), 1)
        self.assertAlmostEqual(w[0][4], 300, places=2)

    def test_collinear_end_to_end_faces_do_not_pair(self):
        self.assertTrue(all(x[4] == 0 for x in pipeline.pair([(0, 0, 2000, 0), (2000, 0, 4000, 0)])))

    def test_each_face_takes_its_closest_partner(self):
        w = pipeline.pair([(0, 0, 6000, 0), (0, 100, 6000, 100), (0, 500, 6000, 500), (0, 800, 6000, 800)])
        self.assertEqual(sorted(round(x[4]) for x in w), [100, 300])

    def test_a_lone_face_is_kept_with_no_thickness(self):
        self.assertEqual(pipeline.pair([(0, 0, 1000, 0)]), [(0, 0, 1000, 0, 0.0, 0, -1)])

    def test_two_degrees_of_drift_still_pairs(self):
        self.assertEqual(len(pipeline.pair([(0, 0, 5000, 0), (0, 200, 5000, 375)])), 1)


class Survey(unittest.TestCase):
    PARAMS = {"voxel_mm": 20, "storey_min_mm": 2000}

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        path = os.path.join(cls.tmp.name, "two-storey.las")
        write_las(path, building())
        cls.items = [{"id": "ev-0001", "path": path, "head": las.read_header(path)}]
        cls.found, cls.stats = pipeline.survey(cls.items, cls.PARAMS, 1)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def of(self, kind):
        return [c for c in self.found if c["kind"] == kind]

    def near(self, got, want, delta):
        self.assertEqual(len(got), len(want), got)
        for g, w in zip(got, want):
            self.assertAlmostEqual(g, w, delta=delta)

    def test_two_storeys_with_their_floors_and_ceilings(self):
        self.assertEqual([c["cid"] for c in self.of("level")], ["scan-L00-level", "scan-L01-level"])
        self.near([c["measured"]["elevation_mm"] for c in self.of("level")], [0, 3000], 5)
        self.near([c["measured"]["elevation_mm"] for c in self.of("ceiling")], [2800, 5800], 5)
        self.near([c["measured"]["height_mm"] for c in self.of("ceiling")], [2800, 2800], 5)
        self.near([c["geometry"]["Offset"] for c in self.of("ceiling")], [2800, 2800], 5)  # the contract's key: height above its level
        self.assertEqual([c["geometry"]["storey"] for c in self.of("floor")], ["scan-L00-level", "scan-L01-level"])
        for f in self.of("floor") + self.of("ceiling"):
            corners = f["geometry"].get("LocationLoop") or f["geometry"]["Boundary"]
            xs, ys = sorted(p[0] for p in corners), sorted(p[1] for p in corners)
            self.near([xs[0], xs[-1], ys[0], ys[-1]], [250, 7700, 300, 5800], 100)  # the inner faces; ~40 mm inside them (NEAR_FACE)
            self.assertGreater(f["fit"]["coverage"], 0.9)

    def test_eight_walls_with_their_thickness_and_place(self):
        walls = self.of("wall")
        self.assertEqual(len(walls), 8)
        want = {("y", 150): 300, ("y", 5900): 200, ("x", 125): 250, ("x", 7850): 300}  # the centreline's axis and place → thickness
        for w in walls:
            s, e = w["geometry"]["LocationCurve"]["start"], w["geometry"]["LocationCurve"]["end"]
            key = ("y", round((s[1] + e[1]) / 50) * 25) if abs(e[1] - s[1]) < abs(e[0] - s[0]) else ("x", round((s[0] + e[0]) / 50) * 25)
            self.assertIn(key, want, w["cid"])
            self.assertAlmostEqual(w["measured"]["thickness_mm"], want[key], delta=10)
            self.assertAlmostEqual(w["measured"]["height_mm"], 2800, delta=5)
            self.assertEqual(s[2], w["geometry"]["BaseElevation"])
            self.assertEqual(len(w["geometry"]["faces"]), 2)
            self.assertTrue(w["evidence"] and all(x.startswith("ev-0001#slice-L0") for x in w["evidence"]))

    def test_no_candidate_carries_a_type_and_each_names_its_evidence(self):
        for c in self.found:
            self.assertEqual(set(c), {"cid", "kind", "geometry", "measured", "evidence", "fit"})
            self.assertNotIn("TypeName", c["geometry"])
            self.assertTrue(c["evidence"] and all(x.startswith("ev-0001#") for x in c["evidence"]))
            self.assertEqual(set(c["fit"]), {"inliers", "rmse_mm", "coverage"})

    def test_the_same_points_params_and_seed_give_the_same_candidates(self):
        again, stats = pipeline.survey(self.items, self.PARAMS, 1)
        self.assertEqual(json.dumps(again), json.dumps(self.found))
        self.assertEqual(stats, self.stats)

    def test_past_the_point_cap_a_seeded_sample_the_same_every_run(self):
        cap = pipeline.MAX_POINTS
        pipeline.MAX_POINTS = 20_000
        try:
            a, sa = pipeline.survey(self.items, self.PARAMS, 5)
            b, _ = pipeline.survey(self.items, self.PARAMS, 5)
        finally:
            pipeline.MAX_POINTS = cap
        self.assertEqual(json.dumps(a), json.dumps(b))
        self.assertLess(sa["points_used"], 21_000)
        self.near(sorted(w["measured"]["thickness_mm"] for w in a if w["kind"] == "wall"), [200, 200, 250, 250, 300, 300, 300, 300], 10)

    def test_a_scan_in_national_grid_coordinates_gives_the_same_building_in_its_own_frame(self):
        off = np.array([450_000_000.0, 5_500_000_000.0, 250_000.0])  # mm: E 450 km, N 5500 km, 250 m up — a UTM-like registered scan
        path = os.path.join(self.tmp.name, "utm.las")
        write_las(path, building() + off, origin=tuple(off / 1000))
        found, _ = pipeline.survey([{"id": "ev-0001", "path": path, "head": las.read_header(path)}], self.PARAMS, 1)
        self.near([c["measured"]["elevation_mm"] for c in found if c["kind"] == "level"], [250_000, 253_000], 5)
        self.near(sorted(c["measured"].get("thickness_mm", 0) for c in found if c["kind"] == "wall"), [200, 200, 250, 250, 300, 300, 300, 300], 10)
        s = next(c for c in found if c["kind"] == "wall")["geometry"]["LocationCurve"]["start"]
        self.assertGreater(min(s[0] - off[0], s[1] - off[1]), -500)  # the output stays in the scan's own (absolute) frame
        self.assertLess(max(s[0] - off[0], s[1] - off[1]), 8500)

    def test_scans_wider_than_one_building_are_refused_in_words(self):
        path = os.path.join(self.tmp.name, "site.las")
        write_las(path, np.array([[0.0, 0.0, 0.0], [400_000.0, 0.0, 0.0]]))
        with self.assertRaises(las.Refused) as e:
            pipeline.survey([{"id": "ev-0001", "path": path, "head": las.read_header(path)}], self.PARAMS, 1)
        self.assertEqual(str(e.exception), "the scans span 400 m in plan — sentinel-survey 0.1 reads one building (at most 300 m across); "
                                           "a larger site waits for MA-4h")


class Voxel(unittest.TestCase):
    def test_one_point_per_cube_the_first_in_reading_order_as_the_row_sort_gives(self):
        P = np.random.default_rng(3).uniform(-5000, 5000, (20000, 3))
        got, _ = pipeline.voxel(P, np.zeros(len(P), np.int64), 50.0)
        _, first = np.unique(np.floor(P / 50).astype(np.int64), axis=0, return_index=True)
        np.testing.assert_array_equal(got, P[np.sort(first)])
```
(Checked in memory at `271ea24`: levels 0 / 3000, ceilings 2800 / 5800, thicknesses 300, 200, 300, 250 per storey, floors ~39.9 m² about 40-45 mm inside the walls, wall rms ≈ 2 mm, deterministic; capped at 20,000 points the same thicknesses; ~0.35 s CPU. The review's fixes — the Hough in a local frame, the one-key voxel, the chunked mask — were run the same way: the same eight thicknesses at the origin and at every offset up to the UTM one, ~0.27 s each; voxel at the 10 M cap 2.0 s with no stall of a sleeping thread, against 12.2 s and a 10.8 s stall before.)
- [ ] **Step 2: `survey/pipeline.py`:**
```python
# MA-4c — sentinel-survey 0.1's measuring code (design §2.1 rule 2: geometry from measuring code, never a language or vision model;
# §6.9): storeys from a height histogram, walls from a density slice per storey (faces found by a Hough transform and fitted by total
# least squares, then paired by WallPairing's rule — ported below), floors and ceilings as oriented rectangles. numpy only; the same
# points, params and seed give the same candidates (no randomness but the seeded point cap). Millimetres in the scan's own frame (no CRS,
# no transform). Candidates carry no type: the bridge types them (MA-4d). LOD 200 as found — never survey or permit grade (D7): a closed
# door reads as wall, openings are not proposed (MA-5), stairs are not read.
import math

import numpy as np

import las

# v0.1's fixed choices (a job sets voxel_mm and storey_min_mm). Each is a ceiling MA-4h measures on a real scan (Kladno).
Z_BIN = 10.0            # mm: the height histogram's bin
PLANE_BAND = 25.0       # mm: a horizontal surface's points lie within this of its height
PEAK = 8.0              # a surface's bin holds at least PEAK x the median non-empty bin (walls put a few points in every bin)
MIN_PLANE_POINTS = 200
# ponytail: a horizontal surface under 2 m2, or under a quarter of the largest, is furniture and is not proposed — a small mezzanine is
# lost with it. MA-4h tunes it on a real scan.
MIN_PLANE_M2 = 2.0
SLAB_MAX = 600.0        # mm: a surface this close above a ceiling is the slab's top — the next storey's floor
SLICE_HALF = 300.0      # mm: the wall slice is mid-storey +-300 mm (ponytail: furniture taller than mid-storey reads as a wall face)
CELL = 20.0             # mm: the slice's grid; a face is its points within CELL of a line (why voxel_mm stops at 50: at 200 mm,
                        # 4 of the drill's 8 walls lost their thickness, measured; the bridge and read_job both bound it)
MIN_FACE = 500.0        # mm: a shorter face is not proposed
MAX_GAP = 300.0         # mm: a face breaks where its line is empty for longer (a doorway; a closed door reads as wall)
END_GAP = 100.0         # mm: a piece shorter than this at a face's end, past an empty stretch, is another face crossing the line
MAX_WALL = 600.0        # mm: faces further apart are two walls (a corridor), not one — WallPairing allows 1000 on drawings
NEAR_FACE = 40.0        # mm: a floor or ceiling point this close to a wall face of its storey is the wall's
# ponytail: at most 10 million points are held in memory (a seeded sample beyond, read in chunks — las.CHUNK; no memory bound on
# Windows without a Job Object); MA-4h measures the cap on the 6.5 GB Kladno run.
MAX_POINTS = 10_000_000
# ponytail: one building per job — the Hough accumulator is 360 x (2 x span / CELL) votes, ~170 MB at 300 m (twice, with bincount's);
# a site, a campus or a long infrastructure scan waits for MA-4h's tiled slices.
MAX_SPAN = 300_000.0    # mm in plan


def survey(items, params, seed, progress=lambda stage, pct: None):
    """items: [{id, path, head}], hashed and headed by the service. → (candidates, {points_in, points_used}); las.Refused in words when
    the scans span more than one building."""
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
    progress("storeys", 30)
    out = measure(P, src, [i["id"] for i in items], float(params["storey_min_mm"]), progress)
    return out, {"points_in": int(points_in), "points_used": int(len(P))}


def voxel(P, src, mm):
    """One point per mm-sided cube, the first in reading order — the same points every run. The cubes are keyed by one int64, counted
    from the cloud's lowest corner: numpy sorts a 1-D int64 without holding Python's lock (the service still answers the bridge's polls),
    where np.unique over rows held it 12 s at the 10 M cap (measured on this PC)."""
    k = np.floor(P / mm).astype(np.int64)
    k -= k.min(axis=0)
    n = k.max(axis=0) + 1
    if int(n[0]) * int(n[1]) * int(n[2]) < 2**62:
        _, first = np.unique((k[:, 0] * n[1] + k[:, 1]) * n[2] + k[:, 2], return_index=True)
    else:  # ponytail: a cloud too tall to key in 62 bits (only a stray point km away in z, the plan span is capped) takes the row sort,
        _, first = np.unique(k, axis=0, return_index=True)  # which holds the lock; the bridge's poll grace (BUSY_MS) covers it
    first.sort()
    return P[first], src[first]


def surfaces(P):
    """Horizontal surfaces from the height histogram: [{z, band (mask), area_m2}], furniture-sized ones dropped."""
    z = P[:, 2]
    lo = math.floor(z.min() / Z_BIN) * Z_BIN
    h = np.bincount(((z - lo) // Z_BIN).astype(np.int64))
    hot = np.flatnonzero(h >= max(MIN_PLANE_POINTS, PEAK * np.median(h[h > 0])))
    out = []
    for g in np.split(hot, np.flatnonzero(np.diff(hot) > 2) + 1) if hot.size else []:
        z0 = lo + (g[np.argmax(h[g])] + 0.5) * Z_BIN
        zp = float(np.median(z[np.abs(z - z0) <= PLANE_BAND]))
        band = np.abs(z - zp) <= PLANE_BAND
        area = len(np.unique(np.floor(P[band, :2] / 100).astype(np.int64), axis=0)) * 0.01
        out.append({"z": zp, "band": band, "area_m2": area})
    big = max((s["area_m2"] for s in out), default=0.0)
    return [s for s in out if s["area_m2"] >= max(MIN_PLANE_M2, big / 4)]


def classify(found, storey_min):
    """Floors and ceilings, walking up: the lowest surface is a floor; one within SLAB_MAX above a ceiling is the next floor; one at least
    storey_min above the last floor is a ceiling; any other is not proposed.
    ponytail: by the gaps alone — a split level, a mezzanine, or terrain scanned outside the building is mislabelled; the scanner's
    positions (E57, MA-4g) settle which side a surface was seen from."""
    floors, ceilings, prev = [], [], None
    for s in sorted(found, key=lambda s: s["z"]):
        if prev is None or (prev["kind"] == "ceiling" and s["z"] - prev["z"] <= SLAB_MAX):
            s["kind"] = "floor"
            floors.append(s)
        elif s["z"] - floors[-1]["z"] >= storey_min:
            s["kind"] = "ceiling"
            ceilings.append(s)
        else:
            continue
        prev = s
    return floors, ceilings


def fit_line(Q):
    """Total least squares: centre, unit direction (pointing +x), unit normal."""
    c = Q.mean(axis=0)
    d = np.linalg.eigh(np.cov((Q - c).T))[1][:, 1]
    if d[0] < -1e-12 or (abs(d[0]) <= 1e-12 and d[1] < 0):
        d = -d
    return c, d, np.array([-d[1], d[0]])


def trim(tt):
    """The indices of sorted positions tt, less the short pieces at either end past an END_GAP (another face crossing the line)."""
    pieces = np.split(np.arange(len(tt)), np.flatnonzero(np.diff(tt) > END_GAP) + 1)
    while len(pieces) > 1 and tt[pieces[0][-1]] - tt[pieces[0][0]] < END_GAP:
        pieces.pop(0)
    while len(pieces) > 1 and tt[pieces[-1][-1]] - tt[pieces[-1][0]] < END_GAP:
        pieces.pop()
    return np.concatenate(pieces)


def faces(XY):
    """Wall faces in a slice's plan points (mm), longest first: {seg (x1, y1, x2, y2), len, points, rmse, coverage}. The Hough runs in
    the slice's local frame (its lowest corner at 0), so the accumulator follows the slice's size, never its distance from the scan's
    origin (a UTM easting asked for 1.56 TiB); each seg is given back in the scan's own frame.
    ponytail: the Hough transform runs again after each face over the cells left (faces x cells x 360 votes) — fine for a house; MA-4h
    measures a real building."""
    if len(XY) == 0:
        return []
    org = XY.min(axis=0)
    XY = XY - org
    C = (np.unique(np.floor(XY / CELL).astype(np.int64), axis=0) + 0.5) * CELL
    alive, used = np.ones(len(C), bool), np.zeros(len(XY), bool)
    th = np.radians(np.arange(0, 180, 0.5))
    cs, sn = np.cos(th), np.sin(th)
    R = float(np.abs(C).sum(axis=1).max()) + CELL
    nr = int(2 * R / CELL) + 2
    out = []
    while alive.sum() >= MIN_FACE / CELL:
        A = C[alive]
        acc = np.zeros(len(th) * nr, np.int64)
        for t0 in range(0, len(th), 30):  # 30 angles at a time: memory stays cells x 30
            rho = np.rint((A[:, :1] * cs[t0:t0 + 30] + A[:, 1:] * sn[t0:t0 + 30] + R) / CELL).astype(np.int64)
            acc += np.bincount((np.arange(t0, t0 + rho.shape[1]) * nr + rho).ravel(), minlength=len(acc))
        k = int(acc.argmax())
        if acc[k] < MIN_FACE / CELL:
            break
        t, r = divmod(k, nr)
        n0, rho0 = np.array([cs[t], sn[t]]), r * CELL - R
        alive &= ~(np.abs(C @ n0 - rho0) <= CELL)  # the peak's own cells always go: the loop ends
        sel = ~used & (np.abs(XY @ n0 - rho0) <= CELL)
        for _ in range(3):  # the 0.5° peak, refitted on its points until the whole face is in
            if sel.sum() < 3:
                break
            c, d, n = fit_line(XY[sel])
            sel = ~used & (np.abs((XY - c) @ n) <= CELL)
        if sel.sum() < 3:
            continue
        alive &= ~(np.abs((C - c) @ n) <= 1.5 * CELL)
        idx = np.flatnonzero(sel)
        tt = (XY[idx] - c) @ d
        o = np.argsort(tt, kind="stable")
        idx, tt = idx[o], tt[o]
        for run in np.split(np.arange(len(idx)), np.flatnonzero(np.diff(tt) > MAX_GAP) + 1):
            run = run[trim(tt[run])]
            if tt[run[-1]] - tt[run[0]] < MIN_FACE:
                continue
            pts = idx[run]
            cr, dr, nm = fit_line(XY[pts])
            tr, res = (XY[pts] - cr) @ dr, (XY[pts] - cr) @ nm
            a, b = cr + dr * tr.min(), cr + dr * tr.max()
            ln = float(tr.max() - tr.min())
            cover = np.unique(np.floor((tr - tr.min()) / 100)).size / max(1, math.ceil(ln / 100))
            out.append({"seg": (float(a[0] + org[0]), float(a[1] + org[1]), float(b[0] + org[0]), float(b[1] + org[1])), "len": ln, "points": pts,
                        "rmse": rms(res), "coverage": min(1.0, cover)})
            used[pts] = True
    return sorted(out, key=lambda f: -f["len"])


def seg_dist(XY, s):
    a, b = np.array(s[:2]), np.array(s[2:])
    d = b - a
    t = np.clip(((XY - a) @ d) / (d @ d), 0.0, 1.0)
    return np.linalg.norm(XY - (a + t[:, None] * d), axis=1)


def extent(w, other):
    """w's range over the 50 mm columns holding at least a fifth as many filled cells as the fullest — a stray point does not stretch it."""
    b = np.floor((w - w.min()) / 50).astype(np.int64)
    cells = np.unique(np.stack([b, np.floor((other - other.min()) / 50).astype(np.int64)], 1), axis=0)
    n = np.bincount(cells[:, 0])
    ok = np.flatnonzero(n >= 0.2 * n.max())
    m = (b >= ok[0]) & (b <= ok[-1])
    return float(w[m].min()), float(w[m].max())


def outline(P, band, fs):
    """A floor's or ceiling's outline: an oriented rectangle around its points less those within NEAR_FACE of a wall face of its storey,
    turned to the storey's longest face (else the smallest over 0.5° steps). None when fewer than 3 points are left.
    ponytail: a rectangle — an L-shaped floor reads as its bounding rectangle, said by its coverage; the outline of the filled cells
    (Douglas-Peucker) waits for MA-4h. It sits up to ~NEAR_FACE inside its walls."""
    idx = np.flatnonzero(band)
    for f in fs:
        idx = idx[seg_dist(P[idx, :2], f["seg"]) > NEAR_FACE]
    if len(idx) < 3:
        return None
    XY = P[idx, :2]
    if fs:
        s = fs[0]["seg"]
        ang = math.atan2(s[3] - s[1], s[2] - s[0]) % (math.pi / 2)
    else:
        def size(a):
            return np.ptp(XY @ np.array([math.cos(a), math.sin(a)])) * np.ptp(XY @ np.array([-math.sin(a), math.cos(a)]))
        ang = min((math.radians(k / 2) for k in range(180)), key=size)
    c, s_ = math.cos(ang), math.sin(ang)
    u, v = XY @ np.array([c, s_]), XY @ np.array([-s_, c])
    (u0, u1), (v0, v1) = extent(u, v), extent(v, u)
    m = (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)
    filled = len(np.unique(np.stack([np.floor((u[m] - u0) / 200), np.floor((v[m] - v0) / 200)], 1), axis=0))
    cover = min(1.0, filled / max(1, math.ceil((u1 - u0) / 200) * math.ceil((v1 - v0) / 200)))
    corners = [(uu * c - vv * s_, uu * s_ + vv * c) for uu, vv in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
    return {"corners": corners, "area": (u1 - u0) * (v1 - v0), "cover": cover, "points": idx[m]}


# ── WallPairing.Pair (SentinelAddin/GhostBuilder/WallPairing.cs), rule for rule — tools/wallpair-check/Check.cs's cases are Pair's tests ──
def _len(s):
    return math.hypot(s[2] - s[0], s[3] - s[1])


def _parallel(a, b, cos_tol):  # |cos| — same or opposite direction both count
    return abs(((a[2] - a[0]) * (b[2] - b[0]) + (a[3] - a[1]) * (b[3] - b[1])) / (_len(a) * _len(b))) >= cos_tol


def _perp(a, b):  # b's midpoint to a's infinite line: the thickness, once parallel and overlapping
    mx, my = (b[0] + b[2]) * 0.5, (b[1] + b[3]) * 0.5
    return abs((a[2] - a[0]) * (my - a[1]) - (a[3] - a[1]) * (mx - a[0])) / _len(a)


def _overlap(a, b):  # the share of the shorter segment covered, measured along a
    la = _len(a)
    ux, uy = (a[2] - a[0]) / la, (a[3] - a[1]) / la
    b0, b1 = sorted(((b[0] - a[0]) * ux + (b[1] - a[1]) * uy, (b[2] - a[0]) * ux + (b[3] - a[1]) * uy))
    return max(0.0, min(la, b1) - max(0.0, b0)) / min(la, _len(b))


def _centreline(a, b, gap, i, j):  # through the mean of the four ends, along a, a's full length
    mx, my = (a[0] + b[0] + a[2] + b[2]) * 0.25, (a[1] + b[1] + a[3] + b[3]) * 0.25
    la = _len(a)
    ux, uy, half = (a[2] - a[0]) / la, (a[3] - a[1]) / la, la * 0.5
    return (mx - ux * half, my - uy * half, mx + ux * half, my + uy * half, gap, i, j)


def pair(segs, max_thickness=1000.0, angle_tol_deg=5.0, min_overlap=0.5):
    """Greedy but deterministic in input order: each face takes its closest valid later partner. → [(cx1, cy1, cx2, cy2, thickness, i, j)];
    a face left over comes back as itself, thickness 0, j = -1 (never dropped)."""
    walls, used = [], [False] * len(segs)
    cos_tol = math.cos(math.radians(angle_tol_deg))
    for i, a in enumerate(segs):
        if used[i]:
            continue
        if _len(a) < 1e-6:
            used[i] = True
            continue
        best, best_gap = -1, math.inf
        for j in range(i + 1, len(segs)):
            b = segs[j]
            if used[j] or _len(b) < 1e-6:
                continue
            if not _parallel(a, b, cos_tol) or _overlap(a, b) < min_overlap:
                continue
            gap = _perp(a, b)
            if gap < 1e-6 or gap > max_thickness:
                continue
            if gap < best_gap:
                best, best_gap = j, gap
        if best >= 0:
            used[i] = used[best] = True
            walls.append(_centreline(a, segs[best], best_gap, i, best))
    for i, a in enumerate(segs):
        if not used[i] and _len(a) >= 1e-6:
            walls.append((*a, 0.0, i, -1))
    return walls


def r(v):
    return int(round(float(v)))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def fit(n, rmse, cover):
    return {"inliers": int(n), "rmse_mm": round(float(rmse), 1), "coverage": round(float(cover), 3)}


def measure(P, src, ids, storey_min, progress=lambda stage, pct: None):
    """The candidates of one registered cloud P (mm); src[i] is point i's item, an index into ids. Per storey, bottom up: its level, its
    floor, its ceilings, its walls. A wall's top is its storey's first ceiling, else the next floor, else the highest point.
    ponytail: a wall's ends follow WallPairing's centreline (face a's full length) — at a corner up to half a thickness long or short;
    MA-4d decides whether to trim walls to their intersections."""
    floors, ceilings = classify(surfaces(P), storey_min)

    def refs(pts, frag):
        return [f"{ids[k]}#{frag}" for k in sorted(set(src[pts].tolist()))]

    out = []
    for k, f in enumerate(floors):
        name, zf = f"L{k:02d}", f["z"]
        lv = f"scan-{name}-level"
        nxt = floors[k + 1]["z"] if k + 1 < len(floors) else None
        cs = [c for c in ceilings if c["z"] > zf and (nxt is None or c["z"] < nxt)]
        top = cs[0]["z"] if cs else nxt if nxt is not None else float(P[:, 2].max())
        sl = np.flatnonzero(np.abs(P[:, 2] - (zf + top) / 2) <= SLICE_HALF)
        fs = faces(P[sl, :2])
        for x in fs:
            x["points"] = sl[x["points"]]
        band = np.flatnonzero(f["band"])
        o = outline(P, f["band"], fs)
        out.append({"cid": lv, "kind": "level", "geometry": {"BaseElevation": r(zf)}, "measured": {"elevation_mm": r(zf)},
                    "evidence": refs(band, f"floor-{name}"), "fit": fit(len(band), rms(P[band, 2] - zf), o["cover"] if o else 0.0)})
        if o:
            out.append({"cid": f"scan-{name}-floor", "kind": "floor",
                        "geometry": {"LocationLoop": [[r(x), r(y), r(zf)] for x, y in o["corners"]], "storey": lv},
                        "measured": {"elevation_mm": r(zf), "area_m2": round(o["area"] / 1e6, 2)},
                        "evidence": refs(o["points"], f"floor-{name}"),
                        "fit": fit(len(o["points"]), rms(P[o["points"], 2] - zf), o["cover"])})
        for n, c in enumerate(cs, 1):
            oc = outline(P, c["band"], fs)
            if oc:
                out.append({"cid": f"scan-{name}-ceiling" + (f"-{n}" if n > 1 else ""), "kind": "ceiling",
                            "geometry": {"Boundary": [[r(x), r(y)] for x, y in oc["corners"]], "Offset": r(c["z"] - zf), "storey": lv},
                            "measured": {"elevation_mm": r(c["z"]), "height_mm": r(c["z"] - zf), "area_m2": round(oc["area"] / 1e6, 2)},
                            "evidence": refs(oc["points"], f"ceiling-{name}"),
                            "fit": fit(len(oc["points"]), rms(P[oc["points"], 2] - c["z"]), oc["cover"])})
        for n, (x1, y1, x2, y2, t, i, j) in enumerate(pair([x["seg"] for x in fs], max_thickness=MAX_WALL), 1):
            two = [fs[i]] + ([fs[j]] if j >= 0 else [])
            pts = np.concatenate([x["points"] for x in two])
            out.append({"cid": f"scan-{name}-wall-{n}", "kind": "wall",
                        "geometry": {"LocationCurve": {"start": [r(x1), r(y1), r(zf)], "end": [r(x2), r(y2), r(zf)]},
                                     "BaseElevation": r(zf), "TopElevation": r(top), "storey": lv,
                                     "faces": [[r(v) for v in x["seg"]] for x in two]},
                        "measured": {"length_mm": r(math.hypot(x2 - x1, y2 - y1)), "height_mm": r(top - zf),
                                     **({"thickness_mm": r(t)} if j >= 0 else {})},
                        "evidence": refs(pts, f"slice-{name}"),
                        "fit": fit(len(pts), math.sqrt(sum(len(x["points"]) * x["rmse"] ** 2 for x in two) / len(pts)),
                                   min(x["coverage"] for x in two))})
        progress("walls", 30 + 60 * (k + 1) // len(floors))
    return out
```
Run the tests → `Las`, `Pair`, `Survey` pass.
- [ ] **Step 3: commit** — `feat(survey): MA-4c - storeys from a height histogram, walls from a mid-storey slice paired by WallPairing's rule (a Python port), floors and ceilings as oriented rectangles; untyped candidates in the contract's keys; deterministic`

### Task 3 — survey: the service

**Files:** create `survey/service.py`; modify `survey/test_survey.py`.

- [ ] **Step 1: the tests** — add `import service` after `import pipeline` in the header, and append:
```python
class Service(unittest.TestCase):
    """service.py as the bridge runs it: -E -B, an allow-listed environment, a token, its stdin held."""
    TOKEN = "t" * 64

    def setUp(self):
        self.cwd = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.data = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.cwd.cleanup)
        self.addCleanup(self.data.cleanup)

    def start(self):
        env = {"SYSTEMROOT": os.environ.get("SYSTEMROOT", ""), "APPDATA": os.environ.get("APPDATA", ""), "SENTINEL_SURVEY_TOKEN": self.TOKEN}
        p = subprocess.Popen([sys.executable, "-E", "-B", os.path.join(HERE, "service.py")], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, env={k: v for k, v in env.items() if v}, cwd=self.cwd.name)

        def stop():
            if p.poll() is None:
                p.kill()
            p.wait(10)
            p.stdout.close()
            if not p.stdin.closed:
                p.stdin.close()
        self.addCleanup(stop)
        line = json.loads(p.stdout.readline())
        return p, line["port"], line["version"]

    def call(self, port, method, path, body=None, token=None):
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method, data=None if body is None else json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {token or self.TOKEN}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as e:
            with e:  # closed here, not left to the garbage collector (a ResourceWarning in the run)
                return e.code, json.loads(e.read())

    def test_health_answers_only_its_token_and_names_each_tool_with_its_licence(self):
        _, port, version = self.start()
        self.assertEqual(version, "0.1.0")
        self.assertEqual(self.call(port, "GET", "/health", token="nope")[0], 401)
        code, health = self.call(port, "GET", "/health")
        self.assertEqual([t["name"] for t in health["tools"]], ["sentinel-survey", "python", "numpy"])
        self.assertTrue(all(t["licence"] for t in health["tools"]))

    def test_a_job_on_the_las_a_changed_file_refused_in_words_and_no_file_written(self):
        path = os.path.join(self.data.name, "two-storey.las")
        write_las(path, building())
        with open(path, "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        _, port, _ = self.start()
        body = {"job_id": "job-0001", "items": [{"id": "ev-0001", "kind": "scan", "path": path, "sha256": sha},
                                                {"id": "ev-0002", "kind": "scan", "path": path, "sha256": "0" * 64}],
                "params": {"voxel_mm": 20, "storey_min_mm": 2000, "tolerances_mm": [50, 100, 200]}, "seed": 1}
        self.assertEqual(self.call(port, "POST", "/jobs", body)[0], 202)
        self.assertEqual(self.call(port, "POST", "/jobs", body)[0], 409)  # one job per process
        for _ in range(200):
            status = self.call(port, "GET", "/jobs/job-0001")[1]
            if status["status"] in ("done", "failed", "refused"):
                break
            time.sleep(0.1)
        self.assertEqual(status["status"], "done", status)
        self.assertEqual(status["refused"], [{"id": "ev-0002", "reason": "changed since admitted (its sha256 is not the pack's) — Re-check flags it"}])
        result = self.call(port, "GET", "/jobs/job-0001/result")[1]
        self.assertEqual(len([c for c in result["candidates"] if c["kind"] == "wall"]), 8)
        self.assertEqual((result["receipt"]["seed"], result["receipt"]["units"]), (1, "metres assumed (no CRS read)"))
        self.assertEqual(os.listdir(self.cwd.name), [])  # it writes nothing — not even in its own folder

    def test_it_exits_when_the_bridge_goes(self):
        p, _, _ = self.start()
        p.stdin.close()  # what a bridge ended by any route (taskkill /f too) does to the pipe
        self.assertEqual(p.wait(10), 3)


class InProcess(unittest.TestCase):
    """service.py's parts in this process: its listener, a file gone or changed around the read, the point limit."""

    def setUp(self):
        self.data = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.data.cleanup)
        self.addCleanup(service.JOB.clear)

    def item(self, P):
        path = os.path.join(self.data.name, "a.las")
        write_las(path, P)
        with open(path, "rb") as f:
            return {"id": "ev-0001", "kind": "scan", "path": path, "sha256": hashlib.sha256(f.read()).hexdigest()}

    def run_job(self, item):
        service.JOB.clear()
        service.JOB.update(id="job-0001", status="queued", stage="queued", pct=0, refused=[])
        with contextlib.redirect_stderr(io.StringIO()):  # a traceback is the bridge log's
            service.run({"job_id": "job-0001", "items": [item], "params": {"voxel_mm": 20, "storey_min_mm": 2000}, "seed": 1})
        return service.JOB

    def test_the_listener_shares_its_port_with_no_one_and_drops_an_idle_connection(self):
        server = service.Server(("127.0.0.1", 0), service.Handler)
        self.addCleanup(server.server_close)
        self.assertEqual(server.socket.getsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR), 0)
        self.assertEqual((server.daemon_threads, service.Handler.timeout), (True, 10))

    def test_a_file_gone_after_its_hash_fails_in_words_that_name_no_path(self):
        item = self.item(np.zeros((5, 3)))
        head = las.read_header(item["path"])
        os.remove(item["path"])
        with mock.patch.object(service, "check", return_value=(head, None)):
            job = self.run_job(item)
        self.assertEqual(job["status"], "failed")
        self.assertTrue(job["error"].startswith("a scan was not read ("), job["error"])
        self.assertNotIn(os.sep, job["error"])
        self.assertNotIn("a.las", job["error"])

    def test_a_file_changed_while_it_was_read_keeps_nothing(self):
        item = self.item(np.zeros((5, 3)))

        def rewrite(*_):
            with open(item["path"], "ab") as f:
                f.write(b"\0")
            return [], {"points_in": 5, "points_used": 5}
        with mock.patch.object(service.pipeline, "survey", side_effect=rewrite):
            job = self.run_job(item)
        self.assertEqual((job["status"], job["error"]), ("failed", "ev-0001 changed while it was read — nothing it found was kept"))
        self.assertNotIn("result", job)

    def test_a_file_over_the_point_limit_is_refused_in_words(self):
        item = self.item(np.zeros((5, 3)))
        with mock.patch.object(service, "MAX_POINTS_IN", 4):
            self.assertEqual(service.check(item), (None, "5 points — sentinel-survey 0.1 reads at most 4 in one file; a larger scan waits for MA-4h"))


class NoNetwork(unittest.TestCase):
    def test_the_service_imports_numpy_and_the_standard_library_only_and_no_client(self):
        allowed = {"numpy", "las", "pipeline", "hashlib", "hmac", "json", "os", "sys", "threading", "time", "datetime", "http.server",
                   "struct", "math", "importlib.metadata", "platform", "traceback"}
        for name in ("las.py", "pipeline.py", "service.py"):
            with open(os.path.join(HERE, name), encoding="utf-8") as f:
                tree = ast.parse(f.read())
            used = {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
            used |= {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
            self.assertLessEqual(used, allowed, name)  # no socket, urllib, http.client: it listens, it never calls out
```
- [ ] **Step 2: `survey/service.py`:**
```python
# MA-4c — sentinel-survey 0.1 (design §6.9): the service the bridge starts for ONE survey job and stops after it
# (WebApp/bridge/survey-service.mjs). It listens on 127.0.0.1 only, on a port it picks (one JSON line on stdout), answers only the
# bridge's per-start token, makes no network call, writes no file (its result goes back over HTTP and the bridge keeps it), re-hashes
# every input before the read (a changed one is refused) and after it (a change during the read fails the job), does no typing, never writes the ledger, never talks to Revit — and exits when the bridge does
# (its stdin closes, a hard kill too). numpy and the standard library only. Run: python -E -B service.py (never -I: numpy is in the
# user site).
import hashlib
import hmac
import json
import os
import sys
import threading
import time
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import las
import pipeline

VERSION = "0.1.0"
TOKEN = os.environ.get("SENTINEL_SURVEY_TOKEN", "")
MAX_BODY = 1 << 20
# ponytail: one file is at most 300 million points: it is hashed twice and read in chunks, which must fit the bridge's 10 min job limit.
# The Kladno scan (MA-4h) has 250.5 million points (LAS 1.2, format 2, 6.5 GB); MA-4h measures its run time against that limit and
# sets this cap.
MAX_POINTS_IN = 300_000_000
JOB = {}  # this process's one job: {id, status, stage, pct, refused, error?, result?}
LOCK = threading.Lock()


def tools():
    """Each tool with the licence its package declares (the build:run receipt lists them, design §6.10)."""
    import importlib.metadata
    import platform
    import numpy
    md = importlib.metadata.metadata("numpy")
    return [{"name": "sentinel-survey", "version": VERSION, "licence": "LicenseRef-Sentinel"},
            {"name": "python", "version": platform.python_version(), "licence": "PSF-2.0"},
            {"name": "numpy", "version": numpy.__version__, "licence": md.get("License-Expression") or md.get("License") or "not declared"}]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def check(item):
    """(its header, None) when the item is read, else (None, why not in words).
    ponytail: hashed before the read and again after it (run) — a change made and undone inside the read is not caught; a read lock
    on the file (MA-4h) closes that if it ever matters."""
    if item["kind"] != "scan":
        return None, f"a {item['kind']} is not surveyed by sentinel-survey 0.1 (scans only)"
    try:
        if sha256(item["path"]) != item["sha256"]:
            return None, "changed since admitted (its sha256 is not the pack's) — Re-check flags it"
        head = las.read_header(item["path"])
        if head["count"] > MAX_POINTS_IN:
            return None, f"{head['count']:,} points — sentinel-survey 0.1 reads at most {MAX_POINTS_IN:,} in one file; a larger scan waits for MA-4h"
        return head, None
    except las.Refused as e:
        return None, str(e)
    except OSError as e:
        return None, f"not read ({e.strerror or type(e).__name__})"  # strerror names no path


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def run(job):
    started, cpu0 = now(), time.process_time()
    try:
        JOB.update(status="running", stage="hashing", pct=5)
        ok = []
        for item in job["items"]:
            head, why = check(item)
            if why:
                JOB["refused"].append({"id": item["id"], "reason": why})
            else:
                ok.append({**item, "head": head})
        if not ok:
            JOB.update(status="refused", stage="done", pct=100)
            return
        candidates, stats = pipeline.survey(ok, job["params"], job["seed"], lambda stage, pct: JOB.update(stage=stage, pct=pct))
        JOB.update(stage="re-hashing", pct=95)  # a file changed during the read: what was measured is not what was admitted
        moved = [i["id"] for i in ok if sha256(i["path"]) != i["sha256"]]
        if moved:
            JOB.update(status="failed", error=f"{', '.join(moved)} changed while {'it was' if len(moved) == 1 else 'they were'} read"
                                              " — nothing it found was kept")
            return
        JOB["result"] = {"candidates": candidates, "derived": [], "receipt": {
            "tools": tools(), "params": job["params"], "seed": job["seed"], "started": started, "finished": now(),
            "cpu_s": round(time.process_time() - cpu0, 2), **stats, "units": "metres assumed (no CRS read)"}}
        JOB.update(status="done", stage="done", pct=100)
    # The job fails in words; the service stays up for the bridge to read it. The error goes into job.json, every viewer's read over
    # the Funnel and the build:run row in the hosted ledger, so it names no path (a Windows path carries the user's name): the
    # traceback goes to stderr, which only the bridge log sees.
    except las.Refused as e:  # the job's own words (one building at most)
        JOB.update(status="failed", error=str(e))
    except OSError as e:  # a file gone or locked after its hash
        traceback.print_exc()
        JOB.update(status="failed", error=f"a scan was not read ({e.strerror or type(e).__name__}) — nothing it found was kept")
    except Exception as e:
        traceback.print_exc()
        JOB.update(status="failed", error=f"{type(e).__name__}: {e}"[:500])


def read_job(b):
    """POST /jobs's body, or ValueError in words (the bridge sends the contract; this is its own check)."""
    if not isinstance(b, dict) or not isinstance(b.get("job_id"), str):
        raise ValueError("job_id is required")
    items = b.get("items")
    if not isinstance(items, list) or not items or not all(
            isinstance(i, dict) and all(isinstance(i.get(k), str) for k in ("id", "kind", "path", "sha256")) for i in items):
        raise ValueError("items must be [{id, kind, path, sha256}]")
    p = b.get("params")
    if not isinstance(p, dict):
        raise ValueError("params must be an object")
    for k, lo, hi in (("voxel_mm", 5, 50), ("storey_min_mm", 1500, 6000)):  # voxel: a wall face needs a point at least every 50 mm
        if not isinstance(p.get(k), int) or not lo <= p[k] <= hi:
            raise ValueError(f"params.{k} must be a whole number from {lo} to {hi}")
    if not isinstance(b.get("seed"), int):
        raise ValueError("seed must be a whole number")
    return {"job_id": b["job_id"], "items": items, "params": p, "seed": b["seed"]}


class Server(ThreadingHTTPServer):
    """Port 0 never needs reuse: HTTPServer's SO_REUSEADDR is turned off, so this listener asks for no shared port.
    ponytail: SO_EXCLUSIVEADDRUSE is not set (it needs `socket`, which the no-client test keeps out): a process of the same Windows
    account could still bind over the port — that account can already read this process's environment (the token) and the evidence
    files; set it if the service ever runs under an account of its own."""
    allow_reuse_address = False
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    timeout = 10  # s: an idle local connection does not hold a thread for the life of the job

    def log_message(self, *args):
        pass  # the bridge logs; nothing here is printed

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def allowed(self):
        if TOKEN and hmac.compare_digest(self.headers.get("Authorization", "").encode(), f"Bearer {TOKEN}".encode()):
            return True
        self.reply(401, {"message": "not the bridge's token"})
        return False

    def do_GET(self):
        if not self.allowed():
            return
        parts = self.path.strip("/").split("/")
        if parts == ["health"]:
            return self.reply(200, {"version": VERSION, "tools": tools()})
        if len(parts) in (2, 3) and parts[0] == "jobs" and JOB.get("id") == parts[1]:
            if len(parts) == 2:
                return self.reply(200, {k: JOB[k] for k in ("status", "stage", "pct", "refused", "error") if k in JOB})
            if parts[2] == "result":
                if "result" in JOB:
                    return self.reply(200, JOB["result"])
                return self.reply(409, {"message": f"job {parts[1]} is {JOB['status']} — it has no result"})
        self.reply(404, {"message": "not found"})

    def do_POST(self):
        if not self.allowed():
            return
        if self.path != "/jobs":
            return self.reply(404, {"message": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            return self.reply(413, {"message": "a job is at most 1 MB of JSON"})
        try:
            job = read_job(json.loads(self.rfile.read(n) or b"null"))
        except ValueError as e:  # a JSONDecodeError is a ValueError
            return self.reply(400, {"message": str(e)})
        with LOCK:
            if JOB:
                return self.reply(409, {"message": "this service runs one job — the bridge starts another for the next"})
            JOB.update(id=job["job_id"], status="queued", stage="queued", pct=0, refused=[])
        threading.Thread(target=run, args=(job,), daemon=True).start()
        self.reply(202, {"job_id": job["job_id"], "status": "queued"})


def main():
    if not TOKEN:
        sys.exit("sentinel-survey: no SENTINEL_SURVEY_TOKEN — the bridge starts this service; it never runs open")
    # The bridge holds our stdin and never writes to it: when the bridge ends by any route (taskkill /f, a closed console too), the pipe
    # closes and this exits — no orphan keeps its port, its CPU or its memory.
    threading.Thread(target=lambda: (sys.stdin.buffer.read(), os._exit(3)), daemon=True).start()
    server = Server(("127.0.0.1", 0), Handler)  # loopback only, a port the OS picks (no firewall prompt)
    print(json.dumps({"port": server.server_address[1], "version": VERSION}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
```
Run `C:\Python314\python.exe -B -m unittest discover -s survey -v` → all pass; `git status --short survey` shows no `__pycache__`.
- [ ] **Step 3: commit** — `feat(survey): MA-4c - the sentinel-survey service: 127.0.0.1 on a port it picks, a per-start token, one job per process, a changed file refused, no file written, no network import, exits when its stdin closes`

### Task 4 — the drill's two-storey LAS

**Files:** create `WebApp/scripts/make-two-storey-las.mjs`.

- [ ] **Step 1:**
```js
// MA-4c drill (Session MA4c): a synthetic LAS 1.2 (point format 0, metres at scale 0.001, no VLR) of a small two-storey building whose
// walls, floors and ceilings sit at known places (mm): outer faces x 0..8000, y 0..6000, z 0..6000; walls west 250, south 300, north 200
// and east 300 thick; storey L00 floor 0, ceiling 2800; L01 floor 3000 (a 200 mm slab), ceiling 5800. Every face is scanned, inside and
// out: a 100 mm grid jittered by a seeded generator (mulberry32 — the same bytes every run), +-3 mm of noise across each surface.
// Supersedes make-tiny-las.mjs for the survey (two slabs and no wall). Usage: node scripts/make-two-storey-las.mjs <out.las> [--laz-bit]
// (--laz-bit sets the compression bit of the point format: the bytes say LAZ, so sentinel-survey must refuse the file in words).
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The drill building's LAS bytes (a Buffer). */
export function twoStoreyLas({ spacing = 100, seed = 1, lazBit = false } = {}) {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pts = [];
  const sheet = (a0, a1, b0, b1, put) => {
    for (let a = a0; a < a1; a += spacing) for (let b = b0; b < b1; b += spacing) {
      const u = a + rand() * spacing, v = b + rand() * spacing, n = (rand() - 0.5) * 6;
      if (u < a1 && v < b1) put(u, v, n);
    }
  };
  const W = 250, S = 300, N = 200, E = 300, X = 8000, Y = 6000, H = 6000;
  for (const [zf, zc] of [[0, 2800], [3000, 5800]]) {
    for (const z of [zf, zc]) sheet(W, X - E, S, Y - N, (x, y, n) => pts.push([x, y, z + n]));   // floor, ceiling
    sheet(S, Y - N, zf, zc, (y, z, n) => pts.push([W + n, y, z]));                                // inner faces
    sheet(S, Y - N, zf, zc, (y, z, n) => pts.push([X - E + n, y, z]));
    sheet(W, X - E, zf, zc, (x, z, n) => pts.push([x, S + n, z]));
    sheet(W, X - E, zf, zc, (x, z, n) => pts.push([x, Y - N + n, z]));
  }
  sheet(0, Y, 0, H, (y, z, n) => pts.push([n, y, z]));                                            // outer faces
  sheet(0, Y, 0, H, (y, z, n) => pts.push([X + n, y, z]));
  sheet(0, X, 0, H, (x, z, n) => pts.push([x, n, z]));
  sheet(0, X, 0, H, (x, z, n) => pts.push([x, Y + n, z]));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], Math.round(p[k])); hi[k] = Math.max(hi[k], Math.round(p[k])); }
  const HEADER = 227, REC = 20;
  const b = Buffer.alloc(HEADER + pts.length * REC);
  let o = 0;
  const str = (t, n) => { b.write(t, o, n, "ascii"); o += n; };
  const u8 = (v) => { b.writeUInt8(v, o); o += 1; };
  const u16 = (v) => { b.writeUInt16LE(v, o); o += 2; };
  const u32 = (v) => { b.writeUInt32LE(v, o); o += 4; };
  const i32 = (v) => { b.writeInt32LE(v, o); o += 4; };
  const f64 = (v) => { b.writeDoubleLE(v, o); o += 8; };
  str("LASF", 4); u16(0); u16(0); o += 16;                              // signature, file source id, global encoding, GUID
  u8(1); u8(2);                                                         // version 1.2
  str("Sentinel MA-4c drill", 32); str("make-two-storey-las.mjs", 32); // system identifier, generating software
  u16(281); u16(2026);                                                  // creation day of year (2026-10-08), year
  u16(HEADER); u32(HEADER); u32(0);                                     // header size, offset to the points, no VLRs
  u8(lazBit ? 0x80 : 0); u16(REC); u32(pts.length);                     // point format 0 (LAZ bit on request), record length, count
  u32(pts.length); o += 16;                                             // points by return: every point a first return
  for (let k = 0; k < 3; k++) f64(0.001);                               // x, y, z scale (1 mm)
  for (let k = 0; k < 3; k++) f64(0);                                   // x, y, z offset
  for (let k = 0; k < 3; k++) { f64(hi[k] / 1000); f64(lo[k] / 1000); } // max x, min x, max y, min y, max z, min z
  if (o !== HEADER) throw new Error(`header is ${o} bytes, not ${HEADER}`);
  for (const [x, y, z] of pts) { i32(Math.round(x)); i32(Math.round(y)); i32(Math.round(z)); u16(0); u8(9); u8(2); u8(0); u8(0); u16(0); }
  return b;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  if (!out) { console.error("Usage: node scripts/make-two-storey-las.mjs <out.las> [--laz-bit]"); process.exit(2); }
  const b = twoStoreyLas({ lazBit: process.argv.includes("--laz-bit") });
  writeFileSync(out, b);
  console.log(`${out}: ${(b.length - 227) / 20} points, ${b.length} bytes`);
}
```
Run it twice into the scratchpad and compare (`node scripts/make-two-storey-las.mjs <scratch>/a.las`, `…/b.las`, `cmp`) → `47699 points, 954207 bytes`; `certutil -hashfile <scratch>/a.las SHA256` → `244cba9d98c707576e3c9a621deb5537904be7b2978626563fd6ed5145c8bc0d` (checked in memory at `271ea24`; through `las.py` and `pipeline.py` it gives floors 0 / 3000, ceilings 2800 / 5800, and walls 300, 200, 300, 250 and 300, 200, 250, 300).
- [ ] **Step 2: commit** — `feat(scripts): MA-4c - make-two-storey-las.mjs: the drill's synthetic two-storey building (walls of known thickness and place), deterministic; --laz-bit for the LAZ refusal`

### Task 5 — Bridge: the survey supervisor

**Files:** create `WebApp/bridge/survey-service.mjs`, `WebApp/bridge/fixtures/survey-standin.mjs`, `WebApp/bridge/survey-service.test.mjs`.

- [ ] **Step 1: the stand-in** — `fixtures/survey-standin.mjs`:
```js
// MA-4c — a stand-in for sentinel-survey (survey-service.test.mjs): the §6.9 contract over HTTP on 127.0.0.1, in Node, so every way a
// job ends is driven without Python. STANDIN = ok | silent | badline | exit | slow | refuse | denied | stall (its first poll answered
// 400 ms late, as numpy holding Python's lock does) | frozen (no poll answered). Like service.py it says its port on
// one stdout line, answers only SENTINEL_SURVEY_TOKEN and exits when its stdin closes. Its result's receipt lists its environment's
// NAMES (never values), so a test sees that no bridge secret reached it.
import { createServer } from "node:http";

const mode = process.env.STANDIN || "ok";
const token = process.env.SENTINEL_SURVEY_TOKEN;
process.stdin.resume();
process.stdin.on("end", () => process.exit(3));
if (mode === "silent") setInterval(() => {}, 1000);
else if (mode === "badline") { console.log("starting…"); setInterval(() => {}, 1000); }
else {
  let job = null, polls = 0;
  const server = createServer((req, res) => {
    res.on("error", () => {}); // a late answer to a poll the supervisor gave up on is dropped, never a crash
    const send = (code, body) => { if (!res.destroyed) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); } };
    if (mode === "denied" || req.headers.authorization !== `Bearer ${token}`) return send(401, { message: "not the bridge's token" });
    if (req.method === "GET" && req.url === "/health") return send(200, { version: "0.1.0-standin", tools: [{ name: "standin", version: "1", licence: "MIT" }] });
    if (req.method === "POST" && req.url === "/jobs") {
      let b = "";
      req.on("data", (c) => { b += c; });
      req.on("end", () => { job = JSON.parse(b); send(202, { job_id: job.job_id, status: "queued" }); });
      return;
    }
    if (job && req.url === `/jobs/${job.job_id}`) {
      polls += 1;
      if (mode === "frozen") return; // never answers a poll
      if (mode === "stall" && polls === 1) { setTimeout(() => send(200, { status: "running", stage: "walls", pct: 60, refused: [] }), 400); return; }
      if (mode === "exit") { setTimeout(() => process.exit(3), 5); return send(200, { status: "running", stage: "reading", pct: 10, refused: [] }); }
      if (mode === "slow" || polls < 2) return send(200, { status: "running", stage: "walls", pct: 60, refused: [] });
      if (mode === "refuse") return send(200, { status: "refused", stage: "done", pct: 100, refused: job.items.map((i) => ({ id: i.id, reason: "the stand-in refuses it" })) });
      return send(200, { status: "done", stage: "done", pct: 100, refused: [] });
    }
    if (job && req.url === `/jobs/${job.job_id}/result`) {
      return send(200, {
        candidates: [{ cid: "scan-L00-level", kind: "level", geometry: { BaseElevation: 0 }, measured: { elevation_mm: 0 }, evidence: [`${job.items[0].id}#floor-L00`], fit: { inliers: 1, rmse_mm: 0, coverage: 1 } }],
        derived: [], receipt: { seed: job.seed, params: job.params, points_in: 1, points_used: 1, cpu_s: 0, env: Object.keys(process.env).sort() },
      });
    }
    send(404, { message: "not found" });
  });
  server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port, version: "0.1.0-standin" })));
}
```
- [ ] **Step 2: the tests** — `survey-service.test.mjs`:
```js
// MA-4c — the survey supervisor: a Node stand-in speaks the §6.9 contract (fixtures/survey-standin.mjs), so every way a job ends is driven
// without Python; one block runs the real sentinel-survey when this PC has Python with numpy (SENTINEL_PYTHON, else C:\Python314).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSurvey, notSetUp, childEnv, SCRIPT, DEFAULT_PYTHON } from "./survey-service.mjs";
import { twoStoreyLas } from "../scripts/make-two-storey-las.mjs";

const STANDIN = fileURLToPath(new URL("./fixtures/survey-standin.mjs", import.meta.url));
const JOB = { job_id: "job-0001", items: [{ id: "ev-0001", kind: "scan", path: join(tmpdir(), "a.las"), sha256: "ab".repeat(32) }],
  params: { voxel_mm: 20, storey_min_mm: 2000, tolerances_mm: [50, 100, 200] }, seed: 1 };
const SECRETS = { BCF_TOKEN: "t", SUPABASE_SERVICE_KEY: "k", SUPABASE_JWT_SECRET: "j", THATOPEN_API_KEY: "a" };
/** A spawn that runs the stand-in in `mode` and records what the supervisor asked for. */
const standin = (mode, calls) => (cmd, args, opts) => {
  const child = nodeSpawn(process.execPath, [STANDIN], { ...opts, env: { ...opts.env, STANDIN: mode } });
  calls.push({ cmd, args, opts, child });
  return child;
};
const gone = (child) => new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once("exit", r)));
const run = (mode, calls = [], opts = {}) =>
  runSurvey(JOB, { spawn: standin(mode, calls), python: "C:/py/python.exe", env: { ...process.env, ...SECRETS }, pollMs: 20, log: () => {}, ...opts });

describe("runSurvey (MA-4c) — the supervisor, with a Node stand-in for sentinel-survey", () => {
  it("runs one job to its result: no shell, -E -B and the script, an allow-listed environment (no bridge secret), progress, the child stopped after", async () => {
    const calls = [], seen = [], before = process.listenerCount("exit");
    const r = await run("ok", calls, { onProgress: (p) => seen.push(p) });
    expect(r).toMatchObject({ status: "done", version: "0.1.0-standin", refused: [], tools: [{ name: "standin", version: "1", licence: "MIT" }] });
    expect(r.result.candidates[0]).toMatchObject({ cid: "scan-L00-level", kind: "level", evidence: ["ev-0001#floor-L00"] });
    expect(r.result.receipt).toMatchObject({ seed: 1, params: JOB.params });
    expect(calls[0].cmd).toBe("C:/py/python.exe");
    expect(calls[0].args).toEqual(["-E", "-B", SCRIPT]);
    expect(calls[0].opts).toMatchObject({ shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    for (const k of Object.keys(SECRETS)) expect(r.result.receipt.env).not.toContain(k);
    expect(r.result.receipt.env).toContain("SENTINEL_SURVEY_TOKEN");
    expect(seen[0]).toEqual({ status: "running", stage: "walls", pct: 60 });
    expect(seen.at(-1).status).toBe("done");
    await gone(calls[0].child);
    expect(process.listenerCount("exit")).toBe(before);
  });

  it("every other ending is a failed or refused job in words, the child stopped — never a throw", async () => {
    const cases = [
      ["silent", { readyMs: 300 }, { status: "failed", error: "sentinel-survey did not start within 1 s" }],
      ["badline", {}, { status: "failed", error: "sentinel-survey did not say its port" }],
      ["exit", { pollMs: 200 }, { status: "failed", error: "sentinel-survey stopped (exit 3) before the job ended — see the bridge log" }],
      ["slow", { jobMs: 300 }, { status: "failed", error: "the survey took longer than 1 min — it was stopped; nothing it found was kept" }],
      ["refuse", {}, { status: "refused", refused: [{ id: "ev-0001", reason: "the stand-in refuses it" }] }],
      ["denied", {}, { status: "failed", error: "sentinel-survey answered 401 — not the bridge's token" }],
      ["stall", { callMs: 150 }, { status: "done", refused: [] }], // a poll past callMs is a busy service, asked again
      ["frozen", { callMs: 150, busyMs: 450 }, { status: "failed", error: "sentinel-survey did not answer for 1 s — it was stopped; nothing it found was kept" }],
    ];
    for (const [mode, opts, want] of cases) {
      const calls = [];
      expect(await run(mode, calls, opts), mode).toMatchObject(want);
      expect(calls[0].child.exitCode !== null || calls[0].child.signalCode !== null, `${mode}: the child is gone when the job ends`).toBe(true);
    }
  });

  it("no python.exe at that path: a failed job in words, not a crash", async () => {
    const r = await runSurvey(JOB, { python: join(tmpdir(), "no-such-python.exe"), pollMs: 20, log: () => {} });
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/^sentinel-survey could not start \(ENOENT\)/);
  });

  it("notSetUp says what is missing, in words; null when both are there", () => {
    expect(notSetUp({ python: "python.exe" })) // a bare name: spawn would search the cwd, then PATH
      .toBe("sentinel-survey is not set up on this PC: SENTINEL_PYTHON must be the absolute path of a python.exe — nothing was saved");
    expect(notSetUp({ python: join(tmpdir(), "no-such-python.exe") }))
      .toBe("sentinel-survey is not set up on this PC: no Python where SENTINEL_PYTHON in config/.env points (C:\\Python314\\python.exe by default) — nothing was saved");
    expect(notSetUp({ python: process.execPath, script: join(tmpdir(), "no-such.py") }))
      .toBe("sentinel-survey is not set up on this PC: survey/service.py is missing from the bridge's checkout — nothing was saved");
    expect(notSetUp({ python: process.execPath })).toBeNull();
  });

  it("childEnv passes only what Windows and numpy's user site need, and the token", () => {
    expect(childEnv({ SYSTEMROOT: "C:\\Windows", APPDATA: "A", TEMP: "T", TMP: "T", PATH: "P", HOME: "H", ...SECRETS }, "tok"))
      .toEqual({ SYSTEMROOT: "C:\\Windows", APPDATA: "A", TEMP: "T", TMP: "T", SENTINEL_SURVEY_TOKEN: "tok" });
  });
});

const PY = process.env.SENTINEL_PYTHON || DEFAULT_PYTHON;
const real = existsSync(PY) && spawnSync(PY, ["-E", "-B", "-c", "import numpy"], { env: childEnv(process.env, "x"), windowsHide: true }).status === 0;

describe.skipIf(!real)("sentinel-survey for real (Python with numpy on this PC)", () => {
  let dir;
  const LAS = twoStoreyLas(), SHA = createHash("sha256").update(LAS).digest("hex");
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "sentinel-survey-")); writeFileSync(join(dir, "two-storey.las"), LAS); });
  afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const job = (sha) => ({ ...JOB, items: [{ id: "ev-0001", kind: "scan", path: join(dir, "two-storey.las"), sha256: sha }] });
  const near = (got, want, d) => { expect(got).toHaveLength(want.length); got.forEach((g, i) => expect(Math.abs(g - want[i])).toBeLessThanOrEqual(d)); };

  it("the drill building: two storeys, eight walls of known thickness, two floors and two ceilings — the same candidates twice", async () => {
    const a = await runSurvey(job(SHA), { python: PY, cwd: dir }), b = await runSurvey(job(SHA), { python: PY, cwd: dir });
    expect(a.status).toBe("done");
    const of = (k) => a.result.candidates.filter((c) => c.kind === k);
    near(of("level").map((c) => c.measured.elevation_mm), [0, 3000], 5);
    near(of("ceiling").map((c) => c.measured.elevation_mm), [2800, 5800], 5);
    expect(of("floor")).toHaveLength(2);
    near(of("wall").map((c) => c.measured.thickness_mm).sort((x, y) => x - y), [200, 200, 250, 250, 300, 300, 300, 300], 10);
    expect(a.tools.map((t) => t.name)).toEqual(["sentinel-survey", "python", "numpy"]);
    expect(JSON.stringify(b.result.candidates)).toBe(JSON.stringify(a.result.candidates));
  }, 60_000);

  it("a changed file is refused by the service in words, and the job is refused", async () => {
    const r = await runSurvey(job("0".repeat(64)), { python: PY, cwd: dir });
    expect(r).toMatchObject({ status: "refused", refused: [{ id: "ev-0001", reason: "changed since admitted (its sha256 is not the pack's) — Re-check flags it" }] });
  }, 60_000);
});
```
Run `npx vitest run bridge/survey-service.test.mjs` → fails (no module).
- [ ] **Step 3: `survey-service.mjs`:**
```js
// MA-4c — the bridge's survey supervisor (design §6.9; plan docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md). It starts
// sentinel-survey (survey/service.py: Python with numpy) for ONE job and stops it after — the bridge's first runtime child process (the
// founder's OK, 2026-10-08). The interpreter is an absolute path (SENTINEL_PYTHON), spawned without a shell; its environment is an
// allow-list (config/.env is merged into process.env, so a plain spawn would hand Python every secret); it listens on 127.0.0.1 on a
// port it picks and answers only this start's token. It is stopped on every way out: the job's end, its bounds, the bridge's exit
// (process "exit": SIGINT/SIGTERM end in process.exit) — and, for a bridge killed hard (taskkill /f, a closed console), by its own stdin
// watchdog. Deps injected (spawn, fetch, paths, bounds): every ending is tested with a Node stand-in (fixtures/survey-standin.mjs).
import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

/** The interpreter: SENTINEL_PYTHON in config/.env — an absolute python.exe whose user site has numpy — else this default. Never PATH. */
export const DEFAULT_PYTHON = "C:\\Python314\\python.exe";
export const pythonPath = () => process.env.SENTINEL_PYTHON || DEFAULT_PYTHON;
export const SCRIPT = fileURLToPath(new URL("../../survey/service.py", import.meta.url));
export const READY_MS = 20_000; // Python up, numpy imported, its port said
// ponytail: one wall-clock bound for every job; MA-4h measures a real scan and sets it by point count.
export const JOB_MS = 10 * 60_000;
export const POLL_MS = 500;
const CALL_MS = 10_000; // one HTTP call to the service
// A poll that times out is a busy service (numpy holds Python's lock while it sorts rows: seconds on a big cloud), asked again; this much
// silence in a row fails the job. JOB_MS stays the job's real bound.
const BUSY_MS = 60_000;
const EXIT_MS = 5_000;  // how long a job's end waits for its python.exe to be gone
const TAIL = 4000;      // the last stderr characters, for the bridge log only (they may name a path; a caller never sees them)

/** Why sentinel-survey cannot start on this PC (a 503's words), or null. Checked before a job folder is made. */
export function notSetUp({ python = pythonPath(), script = SCRIPT } = {}) {
  if (!isAbsolute(python)) return "sentinel-survey is not set up on this PC: SENTINEL_PYTHON must be the absolute path of a python.exe — nothing was saved";
  if (!existsSync(python)) return "sentinel-survey is not set up on this PC: no Python where SENTINEL_PYTHON in config/.env points (C:\\Python314\\python.exe by default) — nothing was saved";
  if (!existsSync(script)) return "sentinel-survey is not set up on this PC: survey/service.py is missing from the bridge's checkout — nothing was saved";
  return null;
}

/** The child's whole environment: what Windows needs, APPDATA (numpy is in the user site, %APPDATA%\Python), the temp folders, the token. */
export const childEnv = (env, token) => Object.fromEntries(Object.entries({
  SYSTEMROOT: env.SYSTEMROOT ?? env.SystemRoot, APPDATA: env.APPDATA, TEMP: env.TEMP, TMP: env.TMP, SENTINEL_SURVEY_TOKEN: token,
}).filter(([, v]) => v));

/** One job, start to end: → {status: done | failed | refused, stage, pct, refused, error?, result?, tools?, version?}. Never rejects: a
 *  service that cannot start, stops, overruns or answers wrongly is a failed job in words (its stderr goes to the bridge log). */
export function runSurvey(job, { cwd, onProgress = () => {}, python = pythonPath(), script = SCRIPT, spawn = nodeSpawn, fetch = globalThis.fetch,
  env = process.env, readyMs = READY_MS, jobMs = JOB_MS, pollMs = POLL_MS, callMs = CALL_MS, busyMs = BUSY_MS,
  log = (l) => console.warn(`[survey] ${l}`) } = {}) {
  return new Promise((resolve) => {
    const token = randomBytes(32).toString("hex");
    let child = null, port = null, done = false, first = "", tail = "", readyTimer, jobTimer;
    const alive = () => child && child.pid !== undefined && child.exitCode === null && child.signalCode === null;
    const kill = () => { if (alive()) { try { child.kill(); } catch { /* gone */ } } };
    const end = (r) => {
      if (done) return;
      done = true;
      clearTimeout(readyTimer);
      clearTimeout(jobTimer);
      process.removeListener("exit", kill);
      kill();
      if (r.status === "failed") log(`${job.job_id}: ${r.error}${tail.trim() ? ` — its stderr ends: ${tail.trim().slice(-1000)}` : ""}`);
      // Settled once the child is gone (bounded): the job folder is its cwd, and the next job must not meet this python.exe.
      const out = { refused: [], ...r };
      if (!alive()) return resolve(out);
      const t = setTimeout(() => resolve(out), EXIT_MS);
      child.once("exit", () => { clearTimeout(t); resolve(out); });
    };
    const failed = (error) => end({ status: "failed", stage: "stopped", pct: 0, error });
    const call = async (method, path, body) => {
      const r = await fetch(`http://127.0.0.1:${port}${path}`, {
        method, signal: AbortSignal.timeout(callMs),
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`sentinel-survey answered ${r.status}${j?.message ? ` — ${j.message}` : ""}`);
      return j;
    };
    const drive = async () => {
      try {
        const health = await call("GET", "/health");
        const meta = { version: health.version, tools: health.tools };
        await call("POST", "/jobs", job);
        const at = `/jobs/${encodeURIComponent(job.job_id)}`;
        let quiet = 0;
        while (!done) {
          let s;
          try { s = await call("GET", at); quiet = 0; } catch (e) {
            if (e?.name !== "TimeoutError" || done) throw e;
            if (++quiet * callMs < busyMs) continue; // busy, not gone
            throw new Error(`sentinel-survey did not answer for ${Math.ceil(busyMs / 1000)} s — it was stopped; nothing it found was kept`);
          }
          if (done) return;
          onProgress({ status: s.status, stage: s.stage, pct: s.pct });
          if (s.status === "done") return end({ ...s, ...meta, result: await call("GET", `${at}/result`) });
          if (s.status === "failed" || s.status === "refused") return end({ ...s, ...meta });
          await new Promise((r) => setTimeout(r, pollMs));
        }
      } catch (e) {
        failed(e?.name === "TimeoutError" ? `sentinel-survey did not answer within ${Math.ceil(callMs / 1000)} s` : String(e?.message || e));
      }
    };
    readyTimer = setTimeout(() => failed(`sentinel-survey did not start within ${Math.ceil(readyMs / 1000)} s`), readyMs);
    jobTimer = setTimeout(() => failed(`the survey took longer than ${Math.ceil(jobMs / 60_000)} min — it was stopped; nothing it found was kept`), jobMs);
    try {
      child = spawn(python, ["-E", "-B", script], { cwd, env: childEnv(env, token), stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false });
    } catch (e) { return failed(`sentinel-survey could not start (${e?.code || e?.message})`); }
    process.once("exit", kill);
    child.on("error", (e) => failed(`sentinel-survey could not start (${e?.code || e?.message}) — SENTINEL_PYTHON must name a python.exe`));
    child.on("exit", (code) => failed(port === null
      ? `sentinel-survey did not start (exit ${code}) — see the bridge log; numpy must import under SENTINEL_PYTHON`
      : `sentinel-survey stopped (exit ${code}) before the job ended — see the bridge log`));
    child.stdin?.on("error", () => {}); // the watchdog's pipe is never written; an EPIPE once Python is gone is no error here
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (d) => { tail = (tail + d).slice(-TAIL); });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d) => {
      if (port !== null || done) return; // drained from here on: a full pipe would block Python
      first += d;
      const nl = first.indexOf("\n");
      if (nl < 0) { if (first.length > 1000) failed("sentinel-survey did not say its port"); return; }
      let p = null;
      try { p = JSON.parse(first.slice(0, nl)).port; } catch { /* not JSON */ }
      if (!Number.isInteger(p) || p < 1 || p > 65535) return failed("sentinel-survey did not say its port");
      port = p;
      clearTimeout(readyTimer);
      void drive();
    });
  });
}
```
Run `npx vitest run bridge/survey-service.test.mjs` → passes; on this PC the real-Python block runs (not skipped).
- [ ] **Step 4: commit** — `feat(bridge): MA-4c - the survey supervisor: sentinel-survey started per job without a shell, an allow-listed environment and a per-start token, its port read from stdout, stopped on every way out; tested with a Node stand-in and the real Python`

### Task 6 — Bridge: survey jobs (the checks, the folder, the record, `build:run`)

**Files:** modify `WebApp/bridge/evidence-store.mjs`, `WebApp/bridge/evidence-store.test.mjs`; create `WebApp/bridge/build-jobs.mjs`, `WebApp/bridge/build-jobs.test.mjs`.

- [ ] **Step 1: `surveyStart`** — append to `evidence-store.mjs` (after `recheckRun`, :311):
```js
/** MA-4c: the checks before a survey job starts (build-jobs.mjs), in this order: a person (the machine credential is a 403 — the job's
 *  build:run row names who started it, and its result is what a changeset's `measured` will be checked against, MA-4d), a contributor
 *  or above of a project that belongs to an office, the budget, the pack in force. → {proj, pack, version, dir}; no file is read here. */
export async function surveyStart(key, packId, deps) {
  const d = await wire(deps);
  if ((await d.myRole(key)) === "service") throw err(403, "a survey job needs a person — its build:run row names who started it: sign in. Nothing was saved.");
  const proj = await officeProject(d, key, "contributor");
  d.takeWriteBudget("survey jobs", { perUser: 6, all: 12 });
  const { pack, version } = await packOf(d, key, packId);
  return { proj, pack, version, dir: evidenceDir(key, d.root) };
}
```
`evidence-store.test.mjs:7` imports `surveyStart` too; add:
```js
describe("surveyStart (MA-4c): the checks before a survey job", () => {
  it("a person, a contributor of an office project, the budget, the pack in force — in that order; no file read", async () => {
    await ready();
    role = "service";
    await expect(surveyStart("demo", "evp-0001", deps())).rejects.toMatchObject({ status: 403, message: "a survey job needs a person — its build:run row names who started it: sign in. Nothing was saved." });
    role = "viewer";
    await expect(surveyStart("demo", "evp-0001", deps())).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    role = "contributor";
    await expect(surveyStart("office", "evp-0001", deps())).rejects.toMatchObject({ status: 400, message: "an evidence pack belongs to a project, not an office — make it on the project; nothing was saved" });
    await expect(surveyStart("demo", "evp-0002", deps())).rejects.toMatchObject({ status: 404, message: "demo's evidence pack is evp-0001, not evp-0002 — nothing was saved" });
    const s = await surveyStart("demo", "evp-0001", deps());
    expect(s).toMatchObject({ proj: { id: "uuid-demo" }, pack: { pack_id: "evp-0001" }, version: 4, dir: join(root, "demo") });
    expect(budgets).toContainEqual(["survey jobs", { perUser: 6, all: 12 }]);
  });
});
```
(`ready()` makes the pack and signs (a), (c), (d): `evidence_pack@4`.)
- [ ] **Step 2: the tests** — `build-jobs.test.mjs`:
```js
// MA-4c — survey jobs on temp folders, deps injected: which scans a job reads and why the rest are refused, the job folder and its record,
// one job at a time, the build:run row (done, failed, refused) with the result's sha256, the result read back and re-hashed.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startJob, listJobs, readJob, readStartBody, resultRefusal, current } from "./build-jobs.mjs";
import { USES } from "./evidence-logic.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const item = (id, path, over = {}) => ({ id, kind: "scan", format: path.split(".").pop(), path, sha256: id.slice(-1).repeat(64), surveyable: true, allowed_uses: { ...USES }, ...over });
const TOOLS = [{ name: "sentinel-survey", version: "0.1.0", licence: "LicenseRef-Sentinel" }, { name: "numpy", version: "2.4.6", licence: "BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0" }];
const RESULT = {
  candidates: [
    { cid: "scan-L00-level", kind: "level", geometry: { BaseElevation: 0 }, measured: { elevation_mm: 0 }, evidence: ["ev-0001#floor-L00"], fit: { inliers: 9, rmse_mm: 1.5, coverage: 0.9 } },
    { cid: "scan-L00-wall-1", kind: "wall", geometry: { LocationCurve: { start: [0, 150, 0], end: [8000, 150, 0] }, BaseElevation: 0, TopElevation: 2800, storey: "scan-L00-level", faces: [[0, 0, 8000, 0], [250, 300, 7700, 300]] },
      measured: { length_mm: 8000, height_mm: 2800, thickness_mm: 300 }, evidence: ["ev-0001#slice-L00"], fit: { inliers: 900, rmse_mm: 2.1, coverage: 1 } }],
  derived: [], receipt: { started: "2026-10-08T10:00:00Z", finished: "2026-10-08T10:00:02Z", cpu_s: 0.4, points_in: 47699, points_used: 47680, seed: 1 },
};
let root, ev, PACK, audits, runs, role;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sentinel-jobs-"));
  ev = mkdtempSync(join(tmpdir(), "sentinel-ev-"));
  mkdirSync(join(ev, "scans"));
  for (const f of ["a.las", "b.laz", "c.rcp", "d.las", "e.las"]) writeFileSync(join(ev, "scans", f), "x");
  PACK = { pack_id: "evp-0001", items: [
    item("ev-0001", "scans/a.las"), item("ev-0002", "scans/b.laz"), item("ev-0003", "scans/c.rcp", { surveyable: false }),
    item("ev-0004", "scans/d.las", { state: "changed" }), item("ev-0005", "scans/e.las", { allowed_uses: { ...USES, geometry_extraction: false } }),
    { id: "ev-0006", kind: "photo", format: "jpg", path: "photos/p.jpg", sha256: "6".repeat(64), surveyable: true, allowed_uses: { ...USES } }] };
  audits = []; runs = []; role = "contributor";
});
afterEach(async () => {
  for (const r of runs) r.ok({ status: "failed", stage: "stopped", pct: 0, error: "the test ended" }); // settles a run left open
  await current();
  rmSync(root, { recursive: true, force: true }); rmSync(ev, { recursive: true, force: true });
});
const deps = (over = {}) => ({
  jobsRoot: root, now: () => "2026-10-08T10:00:00.000Z",
  surveyStart: async (key, packId) => {
    if (role === "service") throw Object.assign(new Error("a survey job needs a person — its build:run row names who started it: sign in. Nothing was saved."), { status: 403 });
    if (packId !== "evp-0001") throw Object.assign(new Error(`${key}'s evidence pack is evp-0001, not ${packId} — nothing was saved`), { status: 404 });
    return { proj: { id: `uuid-${key}` }, pack: PACK, version: 9, dir: ev };
  },
  requireMinRole: async () => role,
  audit: async (pid, et, eid, action, actor, _o, v) => { audits.push({ pid, et, eid, action, actor, v }); return { id: 100 + audits.length, hash: "cd".repeat(32) }; },
  notSetUp: () => null,
  runSurvey: (job, opts) => new Promise((ok) => runs.push({ job, opts, ok })),
  ...over,
});
const start = (b = { pack: "evp-0001" }, over) => startJob("demo", b, deps(over));
const finish = async (r) => { runs.at(-1).ok(r); runs.pop(); await current(); };
const rec = (id = "job-0001") => JSON.parse(readFileSync(join(root, "demo", id, "job.json"), "utf8"));

describe("survey jobs (MA-4c)", () => {
  it("(a) a job reads the admitted LAS scans of the pack in force; every other scan is refused with why; the folder and its record", async () => {
    const { job } = await start();
    expect(job).toMatchObject({ id: "job-0001", project: "demo", pack_id: "evp-0001", pack_version: 9, status: "queued", seed: 1, started_by: "machine",
      params: { voxel_mm: 20, storey_min_mm: 2000 }, items: [{ id: "ev-0001", path: "scans/a.las", sha256: "1".repeat(64) }] });
    expect(job.refused).toEqual([
      { id: "ev-0002", reason: "a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS" },
      { id: "ev-0003", reason: "not surveyable (a .rcp)" },
      { id: "ev-0004", reason: "changed since admitted (Re-check flagged it) — admit the same bytes again" },
      { id: "ev-0005", reason: "its allowed uses exclude geometry extraction" }]);
    expect(rec().status).toBe("queued");
    expect(runs[0].job).toEqual({ job_id: "job-0001", items: [{ id: "ev-0001", kind: "scan", path: join(ev, "scans", "a.las"), sha256: "1".repeat(64) }],
      params: { voxel_mm: 20, storey_min_mm: 2000, tolerances_mm: [50, 100, 200] }, seed: 1 });
    expect(runs[0].opts.cwd).toBe(join(root, "demo", "job-0001"));
  });

  it("(b) the run's end: result.json, its sha256 on the record and on ONE build:run row — the bridge's (claimed false), never the candidates", async () => {
    await start();
    runs[0].opts.onProgress({ status: "running", stage: "walls", pct: 60 });
    expect(rec()).toMatchObject({ status: "running", stage: "walls", pct: 60 });
    await finish({ status: "done", stage: "done", pct: 100, refused: [], result: RESULT, tools: TOOLS, version: "0.1.0" });
    const bytes = readFileSync(join(root, "demo", "job-0001", "result.json"));
    expect(rec()).toMatchObject({ status: "done", pct: 100, result_sha256: sha(bytes), candidates_total: 2, counts: { level: 1, wall: 1, floor: 0, ceiling: 0 },
      reader: { name: "sentinel-survey", version: "0.1.0" }, tools: TOOLS, ledger: { id: 101, hash: "cd".repeat(32) } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ pid: "uuid-demo", et: "build", eid: null, action: "build:run job-0001 · sentinel-survey 0.1.0 · done", actor: "machine" });
    expect(audits[0].v).toEqual({ job_id: "job-0001", reader: "sentinel-survey", version: "0.1.0", status: "done", pack_id: "evp-0001", pack_version: 9,
      items: [{ id: "ev-0001", sha256: "1".repeat(64) }], read: ["ev-0001"], refused: rec().refused, tools: TOOLS, params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1,
      started: "2026-10-08T10:00:00Z", finished: "2026-10-08T10:00:02Z", minutes: 0, cpu_s: 0.4, points_in: 47699, points_used: 47680,
      model_calls: 0, tokens: 0, candidates: { level: 1, wall: 1, floor: 0, ceiling: 0 }, gaps: null, result_sha256: sha(bytes), claimed: false });
  });

  it("(c) one job at a time on this bridge — a second is a 409 with nothing made; after it ends the next is job-0002", async () => {
    await start();
    await expect(start()).rejects.toMatchObject({ status: 409, message: "a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    expect(existsSync(join(root, "demo", "job-0002"))).toBe(false);
    await finish({ status: "refused", stage: "done", pct: 100, refused: [{ id: "ev-0001", reason: "changed since admitted (its sha256 is not the pack's) — Re-check flags it" }], tools: TOOLS, version: "0.1.0" });
    expect(audits[0].action).toBe("build:run job-0001 · sentinel-survey 0.1.0 · refused");
    expect(audits[0].v).toMatchObject({ status: "refused", items: [{ id: "ev-0001", sha256: "1".repeat(64) }], read: [], result_sha256: null, candidates: null });
    expect(rec()).toMatchObject({ status: "refused", read: [] }); // sent, refused by the service: never said to be read
    expect(audits[0].v.refused.at(-1)).toEqual({ id: "ev-0001", reason: "changed since admitted (its sha256 is not the pack's) — Re-check flags it" });
    expect((await start()).job.id).toBe("job-0002");
  });

  it("(d) a failed run writes its row with its words; a result not in the contract's shape fails and keeps no result.json", async () => {
    await start();
    await finish({ status: "failed", stage: "stopped", pct: 0, error: "the survey took longer than 10 min — it was stopped; nothing it found was kept" });
    expect(audits[0].action).toBe("build:run job-0001 · sentinel-survey (no version) · failed");
    expect(audits[0].v.error).toBe("the survey took longer than 10 min — it was stopped; nothing it found was kept");
    await start();
    await finish({ status: "done", stage: "done", pct: 100, refused: [], tools: TOOLS, version: "0.1.0", result: { ...RESULT, candidates: [{ ...RESULT.candidates[0], type: "EXT-200" }] } });
    expect(rec("job-0002")).toMatchObject({ status: "failed", error: "sentinel-survey's result is not the contract's shape (candidates[0] carries a type (the service does no typing)) — nothing it found was kept" });
    expect(existsSync(join(root, "demo", "job-0002", "result.json"))).toBe(false);
    await start(); // a 200 whose body was not JSON reaches here as a done run with no result
    await finish({ status: "done", stage: "done", pct: 100, refused: [], tools: TOOLS, version: "0.1.0", result: null });
    expect(rec("job-0003")).toMatchObject({ status: "failed", read: [], error: "sentinel-survey's result is not the contract's shape (no candidates list) — nothing it found was kept" });
    expect(audits.map((a) => a.action)).toEqual(["build:run job-0001 · sentinel-survey (no version) · failed",
      "build:run job-0002 · sentinel-survey 0.1.0 · failed", "build:run job-0003 · sentinel-survey 0.1.0 · failed"]);
    expect(resultRefusal({ ...RESULT, candidates: [{ ...RESULT.candidates[0], evidence: ["ev-0009#floor-L00"] }] }, ["ev-0001"])).toBe("candidates[0].evidence");
    expect(resultRefusal(RESULT, ["ev-0001"])).toBeNull();
  });

  it("(e) refused before anything is written: no scan v0.1 reads (each with why), sentinel-survey not set up, the machine credential", async () => {
    const nothing = () => { expect(existsSync(join(root, "demo"))).toBe(false); expect(runs).toHaveLength(0); expect(audits).toHaveLength(0); };
    PACK.items = PACK.items.filter((i) => i.id !== "ev-0001");
    await expect(start()).rejects.toMatchObject({ status: 409, message: "no admitted LAS scan in evp-0001 that sentinel-survey 0.1 reads — ev-0002: a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS; ev-0003: not surveyable (a .rcp); ev-0004: changed since admitted (Re-check flagged it) — admit the same bytes again; ev-0005: its allowed uses exclude geometry extraction; nothing was saved" });
    PACK.items = [];
    await expect(start()).rejects.toMatchObject({ status: 409, message: "no admitted LAS scan in evp-0001 that sentinel-survey 0.1 reads — admit a .las under Evidence first; nothing was saved" });
    PACK.items = [item("ev-0001", "scans/a.las")];
    await expect(start(undefined, { notSetUp: () => "sentinel-survey is not set up on this PC: no Python … — nothing was saved" })).rejects.toMatchObject({ status: 503 });
    role = "service";
    await expect(start()).rejects.toMatchObject({ status: 403 });
    nothing();
  });

  it("(f) the body: the pack named; readers only sentinel-survey; params in bounds; any other key — snap_mm, seed, items, started_by — refused in words", () => {
    expect(readStartBody({ pack: " evp-0001 " })).toEqual({ pack: "evp-0001", params: { voxel_mm: 20, storey_min_mm: 2000 } });
    expect(readStartBody({ pack: "evp-0001", readers: ["sentinel-survey"], params: { voxel_mm: 10 } }).params).toEqual({ voxel_mm: 10, storey_min_mm: 2000 });
    const no = (b) => { try { readStartBody(b); } catch (e) { return [e.status, e.message]; } return null; };
    const D16 = "snap_mm is not a survey parameter: snapping to a catalogue size is the bridge's typing policy (D16, type_snap_mm), MA-4d — nothing was saved";
    const field = (k) => `${k} is not a survey job field — the bridge picks the items, the seed and who started it; send {pack, readers?, params?} — nothing was saved`;
    expect(no({})).toEqual([400, "pack must name the evidence pack in force (evp-0001) — nothing was saved"]);
    expect(no({ pack: "evp-0001", readers: ["laspy"] })).toEqual([400, 'readers must be ["sentinel-survey"] — the one reader in MA-4c (or leave it out) — nothing was saved']);
    expect(no({ pack: "evp-0001", params: { snap_mm: 15 } })).toEqual([400, D16]);
    expect(no({ pack: "evp-0001", snap_mm: 15 })).toEqual([400, D16]);
    for (const v of [1, 200]) expect(no({ pack: "evp-0001", params: { voxel_mm: v } })).toEqual([400, "params.voxel_mm must be a whole number of millimetres from 5 to 50 (a wall face needs a point at least every 50 mm) — nothing was saved"]);
    expect(no({ pack: "evp-0001", params: { seed: 7 } })).toEqual([400, "seed is not a survey parameter — voxel_mm and storey_min_mm are — nothing was saved"]);
    expect(no({ pack: "evp-0001", seed: 7 })).toEqual([400, field("seed")]);
    expect(no({ pack: "evp-0001", items: [] })).toEqual([400, field("items")]);
    expect(no({ pack: "evp-0001", started_by: "someone@example.test" })).toEqual([400, field("started_by")]);
  });

  it("(g) reads: the list newest first; a done job with its candidates; a result.json changed since is said, not shown; a job left running by an earlier bridge reads failed", async () => {
    expect(await listJobs("demo", deps())).toEqual({ jobs: [] });
    await start();
    await finish({ status: "done", stage: "done", pct: 100, refused: [], result: RESULT, tools: TOOLS, version: "0.1.0" });
    const one = await readJob("demo", "job-0001", deps());
    expect(one).toMatchObject({ job: { id: "job-0001", status: "done" }, candidates: RESULT.candidates, derived: [], receipt: RESULT.receipt });
    writeFileSync(join(root, "demo", "job-0001", "result.json"), JSON.stringify({ ...RESULT, candidates: [] }));
    expect(await readJob("demo", "job-0001", deps())).toEqual({ job: rec(), result_error: "its result.json does not match the sha256 on its record — it changed after the job; its candidates are not shown" });
    for (const id of ["job-0002", "job-10000"]) { // a job left running by an earlier bridge; past job-9999 the ids go on, newest first by number
      mkdirSync(join(root, "demo", id));
      writeFileSync(join(root, "demo", id, "job.json"), JSON.stringify({ id, status: "running", stage: "walls", pct: 60, items: [], refused: [] }));
    }
    const { jobs } = await listJobs("demo", deps());
    expect(jobs.map((j) => [j.id, j.status])).toEqual([["job-10000", "failed"], ["job-0002", "failed"], ["job-0001", "done"]]);
    expect(jobs[1].error).toBe("the bridge stopped while it ran — nothing it found was kept; run it again");
    await start();
    expect(runs.at(-1).job.job_id).toBe("job-10001");
    await expect(readJob("demo", "nope", deps())).rejects.toMatchObject({ status: 400, message: "a survey job is named job-NNNN — nothing was saved" });
    await expect(readJob("demo", "job-0042", deps())).rejects.toMatchObject({ status: 404, message: "no survey job job-0042 on demo — nothing was saved" });
  });
});
```
- [ ] **Step 3: `build-jobs.mjs`:**
```js
// MA-4c — survey jobs (design §6.8, §6.9, §6.11; plan docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md): the work of
// POST/GET /cde/:key/build/jobs. A signed-in contributor of an office project starts sentinel-survey on the admitted LAS scans of the pack
// in force (every other scan is listed in `refused`, with why); one job runs at a time on this bridge. A job is a folder,
// <SENTINEL_JOBS_ROOT or %APPDATA%/Sentinel/jobs>/<key>/<job-id>/: job.json (the bridge's record) and, once done, result.json (the
// service's result as it came). Every run that starts writes ONE build:run row — done, failed or refused — carrying the result's sha256:
// what MA-4d checks a changeset's `measured` against (readJob re-hashes it; the hash-chained row, not the editable job.json, is the anchor).
// The service writes no file and never the ledger; no evidence byte crosses a route. No table, no migration (design §6.11).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveActor } from "./bridge-auth.mjs";
import { nextId } from "./evidence-logic.mjs";
import { insideFolder, surveyStart } from "./evidence-store.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
export const READER = "sentinel-survey";
export const DEFAULT_PARAMS = { voxel_mm: 20, storey_min_mm: 2000 };
// [low, high, why]: a coarser voxel leaves a wall face too sparse for the survey's 20 mm cells (4 of the drill's 8 walls lost their
// thickness at 200 mm, measured) — the service bounds it the same way (read_job).
const BOUNDS = { voxel_mm: [5, 50, " (a wall face needs a point at least every 50 mm)"], storey_min_mm: [1500, 6000, ""] };
const FIELDS = ["pack", "readers", "params"]; // a body's whole vocabulary: the rest is the bridge's
export const TOLERANCES_MM = [50, 100, 200]; // the contract's (§6.9); deviation reads them from MA-4e
/** The bridge's seed, never a body's: the same evidence and parameters give the same candidates (§6.9). */
export const SEED = 1;
const KINDS = ["level", "wall", "floor", "ceiling"];
const MAX_CANDIDATES = 5000;
const LISTED = 20;
const JOB_ID = /^job-\d{4,}$/; // job-10000 follows job-9999 (nextId pads to 4, never cuts)
const byNewest = (a, b) => Number(b.slice(4)) - Number(a.slice(4));
// ponytail: one survey at a time for the whole bridge (the office PC's CPU is the scarce thing); a queue when one PC serves two offices.
// One bridge per jobs folder: a second bridge on this PC (a drill copy) reads the other's running job as stopped.
let running = null; // {key, id, done}
/** Settles when the running job's record is finished (tests). */
export const current = () => running?.done ?? Promise.resolve();

export const jobsRoot = () => process.env.SENTINEL_JOBS_ROOT
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "jobs");
const projectDir = (root, key) => {
  if (!/^[a-z0-9-]{1,128}$/.test(String(key))) throw err(400, "a project key is letters, digits and dashes — nothing was saved");
  return join(root, key);
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** tmp, then rename: a bridge stopped mid-write leaves the last whole file. */
const writeAtomic = (file, data) => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, data); renameSync(tmp, file); };
const save = (d, key, job) => writeAtomic(join(d.root, key, job.id, "job.json"), JSON.stringify(job, null, 2));

async function wire(deps = {}) {
  const members = deps.requireMinRole ? null : await import("./members-store.mjs");
  const cde = deps.audit ? null : await import("./cde-store.mjs");
  const svc = deps.runSurvey && deps.notSetUp ? null : await import("./survey-service.mjs");
  return {
    surveyStart: deps.surveyStart || surveyStart,
    requireMinRole: deps.requireMinRole || members.requireMinRole,
    audit: deps.audit || cde.audit,
    runSurvey: deps.runSurvey || svc.runSurvey,
    notSetUp: deps.notSetUp || svc.notSetUp,
    root: deps.jobsRoot ?? jobsRoot(),
    now: deps.now || (() => new Date().toISOString()),
  };
}

/** POST's body → {pack, params}, or a 400 in words. The web sends {pack}; readers and params default. Any other key is refused, never
 *  dropped: the items, the seed and who started it are the bridge's, and a caller who sent them must not think it chose them. */
export function readStartBody(b = {}) {
  const bad = (m) => err(400, `${m} — nothing was saved`);
  const D16 = "snap_mm is not a survey parameter: snapping to a catalogue size is the bridge's typing policy (D16, type_snap_mm), MA-4d";
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("the body must be {pack, readers?, params?}");
  for (const k of Object.keys(b)) {
    if (k === "snap_mm") throw bad(D16);
    if (!FIELDS.includes(k)) throw bad(`${k} is not a survey job field — the bridge picks the items, the seed and who started it; send {pack, readers?, params?}`);
  }
  if (typeof b.pack !== "string" || !b.pack.trim()) throw bad("pack must name the evidence pack in force (evp-0001)");
  const readers = b.readers ?? [READER];
  if (!Array.isArray(readers) || readers.length !== 1 || readers[0] !== READER) throw bad(`readers must be ["${READER}"] — the one reader in MA-4c (or leave it out)`);
  const p = b.params ?? {};
  if (!p || typeof p !== "object" || Array.isArray(p)) throw bad("params must be an object {voxel_mm?, storey_min_mm?}");
  const params = { ...DEFAULT_PARAMS };
  for (const [k, v] of Object.entries(p)) {
    if (k === "snap_mm") throw bad(D16);
    if (!BOUNDS[k]) throw bad(`${k} is not a survey parameter — voxel_mm and storey_min_mm are`);
    const [lo, hi, why] = BOUNDS[k];
    if (!Number.isInteger(v) || v < lo || v > hi) throw bad(`params.${k} must be a whole number of millimetres from ${lo} to ${hi}${why}`);
    params[k] = v;
  }
  return { pack: b.pack.trim(), params };
}

/** The pack's scans: what v0.1 reads (absolute paths, checked inside the evidence folder) and every other scan with why. Photos and
 *  drawings are not scans and are not listed. */
export function pickItems(pack, dir) {
  const take = [], refused = [];
  for (const i of pack.items.filter((x) => x.kind === "scan")) {
    const why = i.state === "changed" ? "changed since admitted (Re-check flagged it) — admit the same bytes again"
      : !i.surveyable ? `not surveyable (a .${i.format})`
      : i.allowed_uses?.geometry_extraction !== true ? "its allowed uses exclude geometry extraction"
      : i.format !== "las" ? `a .${i.format} is read from MA-4g — sentinel-survey 0.1 reads plain LAS`
      : null;
    if (why) { refused.push({ id: i.id, reason: why }); continue; }
    try { take.push({ id: i.id, kind: "scan", path: insideFolder(dir, i.path), sha256: i.sha256, rel: i.path }); }
    catch (e) { if (e.status !== 400) throw e; refused.push({ id: i.id, reason: "not inside the evidence folder any more (a link or junction) — Re-check flags it" }); }
  }
  return { take, refused };
}

/** null when `r` has the contract's shape (§6.9: candidates without a type, each naming items of this job), else what is wrong — the
 *  bridge keeps nothing it could not read back. */
export function resultRefusal(r, ids) {
  if (!r || typeof r !== "object" || !Array.isArray(r.candidates)) return "no candidates list";
  if (r.candidates.length > MAX_CANDIDATES) return `over ${MAX_CANDIDATES} candidates`;
  for (const [n, c] of r.candidates.entries()) {
    const at = `candidates[${n}]`;
    if (!c || typeof c !== "object") return at;
    if (typeof c.cid !== "string" || !/^[^\u0000-\u001f]{1,256}$/.test(c.cid)) return `${at}.cid`;
    if (!KINDS.includes(c.kind)) return `${at}.kind`;
    if (!c.geometry || typeof c.geometry !== "object") return `${at}.geometry`;
    if ("type" in c || "TypeName" in c.geometry) return `${at} carries a type (the service does no typing)`;
    if (!c.measured || typeof c.measured !== "object" || !Object.values(c.measured).every(Number.isFinite)) return `${at}.measured`;
    if (!Array.isArray(c.evidence) || !c.evidence.length || !c.evidence.every((e) => typeof e === "string" && ids.includes(e.split("#")[0]))) return `${at}.evidence`;
  }
  if (!Array.isArray(r.derived) || !r.receipt || typeof r.receipt !== "object") return "derived or receipt";
  return null;
}

/** The build:run row's new_value (design §6.6): what ran, on which bytes, with which tools and licences, what it found — never the
 *  candidates themselves (they stay in result.json; its sha256 is here). claimed: false — the bridge ran it (the add-in's receipts are
 *  claimed: true, and the open route can write no other build: row). */
export function buildRunValue(job, receipt) {
  const ms = Date.parse(job.finished_at) - Date.parse(job.started_at);
  return {
    job_id: job.id, reader: READER, version: job.reader.version, status: job.status, pack_id: job.pack_id, pack_version: job.pack_version,
    items: job.items.map(({ id, sha256 }) => ({ id, sha256 })), read: job.read ?? [], refused: job.refused, tools: job.tools, params: job.params, seed: job.seed,
    started: receipt.started ?? job.started_at, finished: receipt.finished ?? job.finished_at, minutes: Number.isFinite(ms) ? Math.round(ms / 600) / 100 : null,
    cpu_s: receipt.cpu_s ?? null, points_in: receipt.points_in ?? null, points_used: receipt.points_used ?? null,
    model_calls: 0, tokens: 0, candidates: job.counts ?? null,
    gaps: null, // typing — and so gaps — is MA-4d's
    result_sha256: job.result_sha256 ?? null, claimed: false, ...(job.error ? { error: job.error } : {}),
  };
}

/** POST /cde/:key/build/jobs {pack, readers?, params?} → 202 {job}. Refusals before anything is written, in this order: 400 (the body),
 *  403 (the machine credential; below contributor; a project of no office), 400 (an office row), 429, 404 (not the pack in force), 409
 *  (no scan v0.1 reads — each with why), 503 (sentinel-survey not set up here), 409 (a job running on this bridge). Then the job's
 *  folder and record; the run goes on after the answer (GET shows it). */
export async function startJob(key, b = {}, deps = {}) {
  const d = await wire(deps);
  const body = readStartBody(b);
  const { proj, pack, version, dir } = await d.surveyStart(key, body.pack);
  const { take, refused } = pickItems(pack, dir);
  if (!take.length) throw err(409, `no admitted LAS scan in ${body.pack} that sentinel-survey 0.1 reads${refused.length ? ` — ${refused.map((x) => `${x.id}: ${x.reason}`).join("; ")}` : " — admit a .las under Evidence first"}; nothing was saved`);
  const notSet = d.notSetUp();
  if (notSet) throw err(503, notSet);
  if (running) throw err(409, "a survey job is already running on this bridge (one at a time) — try again when it ends; nothing was saved");
  const root = projectDir(d.root, key);
  mkdirSync(root, { recursive: true });
  const id = nextId("job", readdirSync(root).filter((n) => JOB_ID.test(n)).map((n) => ({ id: n })));
  try { mkdirSync(join(root, id)); } // not recursive: a second bridge on this PC cannot take the same id
  catch (e) { if (e.code === "EEXIST") throw err(409, `${id} was just taken by another bridge on this PC — try again; nothing was saved`); throw e; }
  const job = {
    id, project: key, pack_id: body.pack, pack_version: version, reader: { name: READER, version: null }, status: "queued", stage: "queued", pct: 0,
    items: take.map((t) => ({ id: t.id, path: t.rel, sha256: t.sha256 })), refused, params: body.params, seed: SEED,
    started_by: resolveActor(null, "machine"), started_at: d.now(),
  };
  save(d, key, job);
  const answer = { job: { ...job } };
  running = { key, id };
  running.done = runJob(d, proj, key, job, take)
    .catch((e) => console.error(`[survey] ${key} ${id}: its record was not finished — ${e?.message || e}`)) // never an unhandled rejection
    .finally(() => { running = null; });
  return answer;
}

async function runJob(d, proj, key, job, take) {
  let last = "";
  const r = await d.runSurvey(
    { job_id: job.id, items: take.map(({ id, kind, path, sha256 }) => ({ id, kind, path, sha256 })), params: { ...job.params, tolerances_mm: TOLERANCES_MM }, seed: job.seed },
    { cwd: join(d.root, key, job.id), onProgress: (p) => {
      const now = `${p.status}|${p.stage}|${p.pct}`;
      if (now !== last) { last = now; save(d, key, Object.assign(job, { status: p.status, stage: p.stage, pct: p.pct })); }
    } });
  let status = r.status, error = r.error ?? null;
  const result = status === "done" ? r.result : null;
  // A done run with no result (a 200 whose body was not JSON) is checked too: resultRefusal(null) is "no candidates list".
  const bad = status === "done" ? resultRefusal(result, job.items.map((i) => i.id)) : null;
  if (bad) { status = "failed"; error = `sentinel-survey's result is not the contract's shape (${bad}) — nothing it found was kept`; }
  const notRead = new Set((r.refused ?? []).map((x) => x.id));
  if (status === "done") {
    const bytes = Buffer.from(JSON.stringify(result));
    writeAtomic(join(d.root, key, job.id, "result.json"), bytes);
    Object.assign(job, { result_sha256: sha(bytes), candidates_total: result.candidates.length,
      counts: Object.fromEntries(KINDS.map((k) => [k, result.candidates.filter((c) => c.kind === k).length])) });
  }
  Object.assign(job, { status, stage: "done", pct: status === "done" ? 100 : job.pct, refused: [...job.refused, ...(r.refused ?? [])],
    read: status === "done" ? job.items.map((i) => i.id).filter((id) => !notRead.has(id)) : [], // what the result was measured from
    reader: { name: READER, version: r.version ?? null }, tools: r.tools ?? [], finished_at: d.now(), ...(error ? { error } : {}) });
  save(d, key, job);
  const row = await d.audit(proj.id, "build", null, `build:run ${job.id} · ${READER} ${job.reader.version ?? "(no version)"} · ${status}`,
    job.started_by, null, buildRunValue(job, (status === "done" && result.receipt) || {}));
  job.ledger = { id: row?.id ?? null, hash: row?.hash ?? null };
  save(d, key, job);
  console.log(`[survey] ${key} ${job.id}: ${status}${job.counts ? ` — ${job.candidates_total} candidate(s)` : ""} · ledger #${job.ledger.id}`);
}

/** A job's record, or null when its folder has none (a start cut short). One left queued or running by an earlier process reads as
 *  failed: the bridge stopped while it ran (its service died with it — the stdin watchdog), and nothing it found was kept. */
function readRecord(dir, key, id) {
  let job;
  try { job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8")); } catch { return null; }
  const mine = running?.key === key && running?.id === id;
  return ["queued", "running"].includes(job.status) && !mine
    ? { ...job, status: "failed", error: "the bridge stopped while it ran — nothing it found was kept; run it again" }
    : job;
}

/** GET /cde/:key/build/jobs → {jobs}: the newest LISTED, no candidates. Any member (the machine credential too: MCP). */
export async function listJobs(key, deps = {}) {
  const d = await wire(deps);
  await d.requireMinRole(key, "viewer");
  const root = projectDir(d.root, key);
  if (!existsSync(root)) return { jobs: [] };
  const ids = readdirSync(root).filter((n) => JOB_ID.test(n)).sort(byNewest).slice(0, LISTED);
  return { jobs: ids.map((id) => readRecord(join(root, id), key, id)).filter(Boolean) };
}

/** GET /cde/:key/build/jobs/:id → {job}, or once done {job, candidates, derived, receipt}: result.json re-hashed against the sha256 on
 *  its record — a file changed since is `result_error`, its candidates not given. The record is editable on the PC, so this is a
 *  courtesy check only; MA-4d's trust check is against the build:run row by decision 11's predicate. Any member. */
export async function readJob(key, id, deps = {}) {
  const d = await wire(deps);
  await d.requireMinRole(key, "viewer");
  if (!JOB_ID.test(String(id))) throw err(400, "a survey job is named job-NNNN — nothing was saved");
  const dir = join(projectDir(d.root, key), id);
  const job = readRecord(dir, key, id);
  if (!job) throw err(404, `no survey job ${id} on ${key} — nothing was saved`);
  if (job.status !== "done") return { job };
  let bytes;
  try { bytes = readFileSync(join(dir, "result.json")); } catch { return { job, result_error: "its result.json is missing — its candidates cannot be shown" }; }
  if (sha(bytes) !== job.result_sha256) return { job, result_error: "its result.json does not match the sha256 on its record — it changed after the job; its candidates are not shown" };
  const { candidates, derived, receipt } = JSON.parse(bytes);
  return { job, candidates, derived, receipt };
}
```
Run `npx vitest run bridge/build-jobs.test.mjs bridge/evidence-store.test.mjs` → pass.
- [ ] **Step 4: commit** — `feat(bridge): MA-4c - survey jobs: a contributor starts one on the admitted LAS scans of the pack in force (the rest refused with why), one at a time, a job folder with its record and result, one build:run row per run carrying the result's sha256 (claimed false)`

### Task 7 — Bridge: the routes and who may use them

**Files:** modify `WebApp/bridge/bcf-service.mjs` (after `:1689`), `WebApp/bridge/write-roles.test.mjs`.

- [ ] **Step 1: the route** — after the evidence block's closing `}` (`:1690`), before `// Manifests` (`:1691`):
```js
      // MA-4c: survey jobs (design §6.8, §6.9). POST /cde/:key/build/jobs {pack, readers?, params?} → 202 {job} (a signed-in contributor of an
      //   office project; the machine credential is a 403; one job at a time on this bridge). GET /cde/:key/build/jobs → the newest 20 (any
      //   member); GET …/build/jobs/:id → one, with its candidates once done. Small JSON only: the bridge names evidence files on this PC to
      //   sentinel-survey on this PC (build-jobs.mjs, survey-service.mjs); no evidence byte crosses this route.
      if (p2 === "build" && p3 === "jobs" && !seg[5]) {
        const bj = await import("./build-jobs.mjs");
        if (!p4 && req.method === "POST") return send(res, 202, await bj.startJob(p1, (await readBody(req, { max: SMALL_JSON })) || {}));
        if (!p4 && req.method === "GET") return send(res, 200, await bj.listJobs(p1));
        if (p4 && req.method === "GET") return send(res, 200, await bj.readJob(p1, p4));
      }
```
(Every refusal a caller should read is a 4xx or 503 in words; `send()` scrubs only a 500, :268-293. The routes inherit the auth gate; nothing is added to `isPublicOpenRoute`.)
- [ ] **Step 2: write-roles** — `:12` adds `existsSync` to the `node:fs` import; the env (`:115`) gains `SENTINEL_PYTHON: join(tmp, "no-python.exe"), // MA-4c: no sentinel-survey here — a start is refused before any spawn`. After the evidence `describe` (`:1082`):
```js
describe("survey jobs (MA-4c): who starts and reads; every refusal before anything is written", () => {
  const DIR = () => join(tmp, "appdata", "Sentinel", "evidence", "demo");
  const JOBS = () => join(tmp, "appdata", "Sentinel", "jobs", "demo");
  const J = "/cde/demo/build/jobs";
  const LAS = Buffer.concat([Buffer.from("LASF"), Buffer.alloc(400, 7)]);
  beforeEach(() => { db.projects[0].office_key = "office"; rmSync(DIR(), { recursive: true, force: true }); rmSync(JOBS(), { recursive: true, force: true }); });
  const admit = async (f) => {
    writeFileSync(join(DIR(), "scans", f), LAS);
    expect((await call("POST", "/cde/demo/evidence/evp-0001/items", "contributor", { path: `scans/${f}`, kind: "scan", registration: { method: "registered in source" } })).status).toBe(201);
  };

  it("the machine credential and a viewer may not start one; a .laz alone is a 409 naming why; with a .las, a PC without Python is a 503 — no row, no job folder", async () => {
    await call("POST", "/cde/demo/evidence", "lead", {});
    for (const code of ["a", "c"]) await call("POST", "/cde/demo/evidence/evp-0001/attest", "lead", { code });
    mkdirSync(join(DIR(), "scans"), { recursive: true });
    await admit("site.laz");
    const rows = db.audit_log.length;
    expect(await call("POST", J, "machine", { pack: "evp-0001" })).toEqual({ status: 403, body: { message: "a survey job needs a person — its build:run row names who started it: sign in. Nothing was saved." } });
    expect(await call("POST", J, "viewer", { pack: "evp-0001" })).toEqual(refused("contributor", "viewer"));
    expect(await call("POST", J, "contributor", { pack: "evp-0001" })).toEqual({ status: 409, body: { message: "no admitted LAS scan in evp-0001 that sentinel-survey 0.1 reads — ev-0001: a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS; nothing was saved" } });
    expect(db.audit_log.length).toBe(rows);
    await admit("tiny.las");
    const rows2 = db.audit_log.length;
    expect(await call("POST", J, "contributor", { pack: "evp-0001" })).toEqual({ status: 503, body: { message: "sentinel-survey is not set up on this PC: no Python where SENTINEL_PYTHON in config/.env points (C:\\Python314\\python.exe by default) — nothing was saved" } });
    expect((await call("POST", J, "contributor", { pack: "evp-0002" })).status).toBe(404);
    expect(await call("POST", J, "contributor", { pack: "evp-0001", params: { snap_mm: 5 } })).toEqual({ status: 400, body: { message: "snap_mm is not a survey parameter: snapping to a catalogue size is the bridge's typing policy (D16, type_snap_mm), MA-4d — nothing was saved" } });
    expect(await call("POST", J, "contributor", { pack: "evp-0001", items: [{ id: "ev-0001" }] })).toEqual({ status: 400, body: { message: "items is not a survey job field — the bridge picks the items, the seed and who started it; send {pack, readers?, params?} — nothing was saved" } });
    expect(db.audit_log.length).toBe(rows2);
    expect(existsSync(JOBS())).toBe(false);
  });

  it("reads: any member lists (none yet) and reads by id; a stranger may not; a job row cannot be forged through the open route", async () => {
    expect(await call("GET", J, "viewer")).toEqual({ status: 200, body: { jobs: [] } });
    expect(await call("GET", `${J}/job-0001`, "viewer")).toEqual({ status: 404, body: { message: "no survey job job-0001 on demo — nothing was saved" } });
    expect(await call("GET", `${J}/nope`, "viewer")).toEqual({ status: 400, body: { message: "a survey job is named job-NNNN — nothing was saved" } });
    expect((await call("GET", J, "stranger")).status).toBe(403);
    expect((await call("GET", J, "machine")).status).toBe(200);
    const forged = await call("POST", "/cde/demo/audit", "machine", { entity_type: "build", action: "build:run job-0001 · sentinel-survey 0.1.0 · done", new_value: { job_id: "job-0001", claimed: false, result_sha256: "ab".repeat(32) } });
    expect(forged.status).toBe(201);
    expect([db.audit_log.at(-1).action, db.audit_log.at(-1).new_value.claimed]).toEqual(["build:run", true]); // a claimed receipt, never a job row
    expect(await call("POST", "/cde/demo/audit", "machine", { entity_type: "event", action: "build:run job-0001" })).toEqual({ status: 400, body: { message: 'build: rows are receipts (entity_type "build") — nothing was saved' } });
  });
});
```
Run `npx vitest run bridge/write-roles.test.mjs bridge/build-jobs.test.mjs`.
- [ ] **Step 3: commit** — `feat(bridge): MA-4c - POST/GET /cde/:key/build/jobs and GET …/:id: a contributor starts, any member reads, the machine credential reads only; every refusal in words before anything is written`

### Task 8 — MCP: `sentinel_build_status`

**Files:** modify `WebApp/bridge/mcp-server.mjs`, `WebApp/bridge/mcp-server.test.mjs`, `docs/mcp-server.md`.

- [ ] **Step 1:** TOOLS, after `sentinel_changeset_status` (`:133`):
```js
  {
    name: "sentinel_build_status",
    description: "Read a project's survey jobs (MA-4c: sentinel-survey, run by the bridge on this PC over the evidence pack's admitted LAS scans). Pass `job` (e.g. job-0001) for one job with its candidates — untyped geometry {cid, kind: level|wall|floor|ceiling, geometry, measured, evidence[], fit} in millimetres in the scan's own frame — and its receipt; omit it for the newest jobs first: status (queued, running, done, failed, refused), stage, pct, the scans read (ids, sha256), the scans refused with why, and once ended the build:run ledger row. Candidates carry no type and propose nothing (typing and changesets are MA-4d); LOD 200 as found, never survey grade. Read-only: no tool starts a survey — a contributor starts it on the web (Files ▸ Evidence ▸ Run survey).",
    inputSchema: {
      type: "object", required: ["project"],
      properties: { project: { type: "string", description: "the project key" }, job: { type: "string", description: "optional: a job id (job-NNNN) — that job with its candidates" } },
    },
  },
```
`callTool`, after the `sentinel_changeset_status` branch (`:248`):
```js
  if (name === "sentinel_build_status") {
    const project = need(args, "project");
    return await getJson(`/cde/${enc(project)}/build/jobs${args.job ? `/${enc(need(args, "job"))}` : ""}`);
  }
```
- [ ] **Step 2: tests** — `toHaveLength(13)` → `14` at `:17` and `:140`; add to `describe("changeset tools")`:
```js
  it("build status (MA-4c) reads a project's survey jobs, or one with its candidates — read-only; a missing project is refused before any fetch", async () => {
    const fetch = vi.fn(async () => okJson({ jobs: [] }));
    await callTool("sentinel_build_status", { project: "demo" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/demo\/build\/jobs$/);
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
    await callTool("sentinel_build_status", { project: "demo", job: "job-0001" }, { fetch });
    expect(fetch.mock.calls[1][0]).toMatch(/\/cde\/demo\/build\/jobs\/job-0001$/);
    await expect(callTool("sentinel_build_status", {}, { fetch })).rejects.toThrow(/project is required/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
```
`docs/mcp-server.md`, after the `sentinel_changeset_status` row (:22):
`| \`sentinel_build_status\` | A project's survey jobs (sentinel-survey, run by the bridge on the evidence pack's admitted LAS scans), newest first, or one by \`job\` with its untyped candidates and receipt. Read-only — a contributor starts a survey on the web; no MCP tool starts one. |`
Run `npx vitest run bridge/mcp-server.test.mjs`.
- [ ] **Step 3: commit** — `feat(bridge): MA-4c - sentinel_build_status (MCP, read-only): a project's survey jobs, or one with its candidates`

### Task 9 — Web: the Survey block in Evidence

**Files:** modify `WebApp/src/setups/evidence.ts`, `WebApp/src/setups/evidence.test.ts`, `WebApp/src/setups/files-panel.ts`.

- [ ] **Step 1: `evidence.ts`** — `evidenceControls` (:76-79) gains `survey: canEditRole(role) && role !== "service",` (a job names a person, like Sign and Ask). Append:
```ts
/** MA-4c: a survey job as the bridge keeps it (GET /cde/:key/build/jobs); its candidates are read on demand (readJob). */
export interface SurveyJob {
  id: string; status: "queued" | "running" | "done" | "failed" | "refused"; stage: string; pct: number;
  items: { id: string; path: string; sha256: string }[]; read?: string[]; refused: { id: string; reason: string }[];
  started_by: string; started_at: string; finished_at?: string; error?: string;
  counts?: Record<string, number>; candidates_total?: number; ledger?: Ledger;
}
/** An untyped candidate (design §6.9): whatever the reader measured, in mm (an area in m²). */
export interface Candidate {
  cid: string; kind: string; geometry: Record<string, unknown>; measured: Record<string, number>; evidence: string[];
  fit?: { inliers: number; rmse_mm: number; coverage: number };
}
export interface JobRead { job: SurveyJob; candidates?: Candidate[]; result_error?: string; }
/** The pack's scans a survey may read: admitted, surveyable, not changed. Which formats v0.1 reads is the bridge's to say, per item. Pure. */
export const surveyableScans = (pack: EvidencePack) => pack.items.filter((i) => i.kind === "scan" && i.surveyable && i.state !== "changed");
const FOUND: [string, string][] = [["level", "level(s)"], ["wall", "wall(s)"], ["floor", "floor(s)"], ["ceiling", "ceiling(s)"]];
/** A job in one line: its state, what it read (a done job: only what its result was measured from; one running: what it is reading;
 *  else what it was given) and refused, what it found, who and when, its ledger row. Pure. */
export function jobLine(j: SurveyJob): string {
  const live = j.status === "queued" || j.status === "running";
  const state = live ? `${j.status} · ${j.stage} ${j.pct}%` : j.status;
  const given = j.items.map((i) => i.id).join(", ") || "nothing";
  const what = j.status === "done" ? `read ${(j.read ?? []).join(", ") || "nothing"}` : live ? `reading ${given}` : `given ${given}`;
  const refused = j.refused.length ? ` · refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : "";
  const found = j.counts ? ` · ${FOUND.map(([k, w]) => `${j.counts![k] ?? 0} ${w}`).join(", ")}` : "";
  return `${j.id} · ${state} · ${what}${refused}${found}${j.error ? ` · ${j.error}` : ""}` +
    ` · by ${j.started_by} · ${j.started_at.replace("T", " ").slice(0, 16)}${j.ledger ? ` · ${ledgerLine(j.ledger)}` : ""}`;
}
/** One untyped candidate in one line — generic over what it measured, its fit, the evidence it came from. Pure. */
export function candidateLine(c: Candidate): string {
  const m = Object.entries(c.measured).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ");
  const fit = c.fit ? ` · fit ${c.fit.rmse_mm} mm rms, ${Math.round(c.fit.coverage * 100)}% covered` : "";
  const one = Array.isArray(c.geometry.faces) && c.geometry.faces.length === 1 ? " · one face seen: its thickness is unknown" : "";
  return `${c.cid} · ${c.kind} · ${m}${fit}${one} · from ${c.evidence.join(", ")}`;
}
/** The status line after Run survey. Pure. */
export function surveyStartLine(j: SurveyJob): string {
  return `✓ Started ${j.id} — sentinel-survey reads ${j.items.map((i) => `${i.id} (${i.path})`).join(", ")}` +
    `${j.refused.length ? `; refused ${j.refused.map((r) => `${r.id} (${r.reason})`).join("; ")}` : ""} — ↻ for its progress.`;
}
/** Run survey: the bridge picks every admitted, surveyable scan of the pack in force (no item list, readers or params from here). */
export const startSurvey = (base: string, key: string) => post<{ job: SurveyJob }>(base, key, "build/jobs", { pack: PACK_ID });
/** The project's survey jobs, newest first; any failure throws "not read — …" (the section says it; the pack still shows). */
export async function readJobs(base: string, key: string): Promise<SurveyJob[]> {
  let r: Response;
  try { r = await bfetch(at(base, key, "build/jobs")); } catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { jobs?: SurveyJob[]; message?: string } | null;
  if (!r.ok || !Array.isArray(j?.jobs)) throw new Error(`not read — ${j?.message || `HTTP ${r.status}`}`);
  return j.jobs;
}
/** One job, with its candidates once done (bwrite: a GET whose refusal words are thrown). */
export const readJob = (base: string, key: string, id: string) => bwrite<JobRead>(at(base, key, `build/jobs/${encodeURIComponent(id)}`));
```
- [ ] **Step 2: `evidence.test.ts`** — the `evidenceControls` test (:73-80) gains `survey`: `all` adds `survey: true`; contributor `{ …, survey: true }`; viewer `{ …, survey: false }`; service `{ ...all, sign: false, ask: false, survey: false }`; its title adds "Run survey a contributor's, never the machine session's". Imports add `jobLine, candidateLine, surveyStartLine, surveyableScans, startSurvey, readJobs, type SurveyJob`. Add:
```ts
describe("the survey (MA-4c)", () => {
  const JOB: SurveyJob = {
    id: "job-0001", status: "done", stage: "done", pct: 100, items: [{ id: "ev-0001", path: "scans/two-storey.las", sha256: "a".repeat(64) }], read: ["ev-0001"],
    refused: [{ id: "ev-0002", reason: "a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS" }], started_by: "contributor@example.test",
    started_at: "2026-10-08T10:00:00.000Z", counts: { level: 2, wall: 8, floor: 2, ceiling: 2 }, candidates_total: 14, ledger: { id: 2201, hash: HASH },
  };
  it("surveyableScans: admitted scans that are surveyable and not changed — no photo, no RCP, no flagged scan", () => {
    const pack: EvidencePack = { ...PACK, items: [ITEM, { ...ITEM, id: "ev-0002", format: "rcp", surveyable: false }, { ...ITEM, id: "ev-0003", state: "changed" },
      { ...ITEM, id: "ev-0004", kind: "photo", format: "jpg" }] };
    expect(surveyableScans(pack).map((i) => i.id)).toEqual(["ev-0001"]);
  });
  it("jobLine: the state, what was read (never a file the service refused) and refused, what was found, who, when and the ledger row", () => {
    expect(jobLine(JOB)).toBe("job-0001 · done · read ev-0001 · refused ev-0002 (a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS) · 2 level(s), 8 wall(s), 2 floor(s), 2 ceiling(s) · by contributor@example.test · 2026-10-08 10:00 · ledger #2201 · receipt abababababababab…");
    const lazBit = { id: "ev-0003", reason: "its points are compressed (LAZ) — sentinel-survey 0.1 reads plain LAS; LAZ is read from MA-4g" };
    expect(jobLine({ ...JOB, items: [...JOB.items, { id: "ev-0003", path: "scans/compressed.las", sha256: "c".repeat(64) }], refused: [lazBit], counts: undefined, ledger: undefined }))
      .toBe("job-0001 · done · read ev-0001 · refused ev-0003 (its points are compressed (LAZ) — sentinel-survey 0.1 reads plain LAS; LAZ is read from MA-4g) · by contributor@example.test · 2026-10-08 10:00");
    expect(jobLine({ ...JOB, status: "running", stage: "walls", pct: 60, read: undefined, refused: [], counts: undefined, ledger: undefined }))
      .toBe("job-0001 · running · walls 60% · reading ev-0001 · by contributor@example.test · 2026-10-08 10:00");
    expect(jobLine({ ...JOB, status: "failed", read: [], refused: [], counts: undefined, error: "the bridge stopped while it ran — nothing it found was kept; run it again" }))
      .toBe("job-0001 · failed · given ev-0001 · the bridge stopped while it ran — nothing it found was kept; run it again · by contributor@example.test · 2026-10-08 10:00 · ledger #2201 · receipt abababababababab…");
  });
  it("candidateLine is generic over what was measured, and says when one face was seen", () => {
    expect(candidateLine({ cid: "scan-L00-wall-1", kind: "wall", geometry: { faces: [[0, 0, 8000, 0], [250, 300, 7700, 300]] }, measured: { length_mm: 8003, height_mm: 2800, thickness_mm: 300 }, evidence: ["ev-0001#slice-L00"], fit: { inliers: 934, rmse_mm: 2.2, coverage: 1 } }))
      .toBe("scan-L00-wall-1 · wall · length mm 8003, height mm 2800, thickness mm 300 · fit 2.2 mm rms, 100% covered · from ev-0001#slice-L00");
    expect(candidateLine({ cid: "scan-L00-wall-5", kind: "wall", geometry: { faces: [[0, 0, 900, 0]] }, measured: { length_mm: 900, height_mm: 2800 }, evidence: ["ev-0001#slice-L00"] }))
      .toBe("scan-L00-wall-5 · wall · length mm 900, height mm 2800 · one face seen: its thickness is unknown · from ev-0001#slice-L00");
  });
  it("Run survey posts {pack: evp-0001} to …/build/jobs; the line names what it reads and refused", async () => {
    bwrite.mockResolvedValue({ job: { ...JOB, status: "queued" } });
    const r = await startSurvey("http://b", "demo");
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/build/jobs", expect.objectContaining({ method: "POST", body: JSON.stringify({ pack: "evp-0001" }) }));
    expect(surveyStartLine(r.job)).toBe("✓ Started job-0001 — sentinel-survey reads ev-0001 (scans/two-storey.las); refused ev-0002 (a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS) — ↻ for its progress.");
  });
  it("readJobs: the list, or 'not read — …'", async () => {
    bfetch.mockResolvedValue(res(200, { jobs: [JOB] }));
    expect(await readJobs("http://b", "demo")).toEqual([JOB]);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/demo/build/jobs");
    bfetch.mockResolvedValue(res(403, { message: "this action requires the viewer role (you are not a member)" }));
    await expect(readJobs("http://b", "demo")).rejects.toThrow("not read — this action requires the viewer role (you are not a member)");
    bfetch.mockRejectedValue(new Error("bridge offline"));
    await expect(readJobs("http://b", "demo")).rejects.toThrow("not read — bridge offline");
  });
});
```
- [ ] **Step 3: `files-panel.ts`** —
  - `:18` import adds `startSurvey, readJobs, readJob, jobLine, candidateLine, surveyStartLine, surveyableScans, type SurveyJob, type Candidate`.
  - State, after `:81` (`let admitting…`):
```ts
  // MA-4c: the project's survey jobs (read after the pack; a failure says "Survey: not read — …" and leaves the pack shown) and the done
  // job whose candidates are open (read on demand).
  let jobs: SurveyJob[] | null = null;
  let jobsError: string | null = null;
  let jobOpen: string | null = null;
  let jobCands: Candidate[] | null = null;
```
  - `load()`, after the evidence read (`:206`):
```ts
      jobOpen = null; jobCands = null;
      try { const js = evidence ? await readJobs(base, key) : null; if (mine !== seq) return; jobs = js; jobsError = null; }
      catch (e) { if (mine !== seq) return; jobs = null; jobsError = (e as Error).message; }
```
  - Wiring, after `#fv-ev-recheck` (`:279`):
```ts
    root.querySelector("#fv-ev-survey")?.addEventListener("click", () => void evAct(async () => surveyStartLine((await startSurvey(base, pid())).job)));
    root.querySelectorAll<HTMLElement>("[data-evjob]").forEach((n) => n.addEventListener("click", async () => {
      const id = n.dataset.evjob!;
      if (jobOpen === id) { jobOpen = null; jobCands = null; render(); return; }
      const mine = seq;
      try {
        const r = await readJob(base, pid(), id);
        if (mine !== seq) return;
        if (r.result_error) { status(`Candidates not shown — ${r.result_error}`); return; }
        jobOpen = id; jobCands = r.candidates ?? []; render();
      } catch (e) { if (mine === seq) status(`Candidates not read — ${(e as Error).message}`); }
    }));
```
  - `evidenceSection()`: before the `return toggle + …` (`:536`) add
```ts
    // MA-4c "Survey": every job the bridge returned (newest first) and, for a contributor signed in, Run survey when none runs; a done job's
    // candidates on demand. No poll: ↻ shows a running job's progress.
    const busy = (jobs ?? []).some((j) => j.status === "queued" || j.status === "running");
    const jobColor = (s: string) => (s === "done" ? "#cbd5e1" : s === "failed" ? "#fca5a5" : "#9ca3af");
    const survey = line("Survey — sentinel-survey reads the admitted LAS scans on this PC: levels, walls, floors and ceilings, LOD 200 as found (never survey grade). Candidates carry no type until MA-4d.", "#9ca3af") +
      (jobsError ? line(`Survey: ${esc(jobsError)}`, "#fbbf24")
        : (jobs ?? []).map((j) => line(esc(jobLine(j)), jobColor(j.status)) +
            (j.status === "done" && j.candidates_total ? `<div style="padding:.1rem .2rem"><button data-evjob="${esc(j.id)}" style="${act}">${jobOpen === j.id ? "Hide candidates" : "Candidates"}</button></div>` : "") +
            (jobOpen === j.id ? (jobCands ?? []).map((c) => line(esc(candidateLine(c)), "#cbd5e1")).join("") : "")).join("") || line("no survey yet")) +
      (can.survey && !busy && surveyableScans(pack).length ? `<div style="margin-top:.35rem"><button id="fv-ev-survey" style="${act}">Run survey</button></div>`
        : can.survey && busy ? line("A survey is running — ↻ for its progress.") : "");
```
  and the section's end (`:541-542`) becomes `…: line(\`A contributor or above admits and re-checks — ${esc(roleSaid)}.\`)) + survey + "</div>";`.
  (html-sinks: attribute values are `esc(j.id)` or the `act` constant; text lines go through `esc(...)`; `status(...)` lines are raw.)
- [ ] **Step 4:** `npx vitest run src/setups/evidence.test.ts src/setups/html-sinks.test.ts`; `npm run build`.
- [ ] **Step 5: commit** — `feat(web): MA-4c - Evidence ▸ Survey: the survey jobs in one line each, a done job's candidates on demand, Run survey for a contributor signed in`

### Task 10 — Docs: the design amendments

**Files:** modify `docs/strategy/2026-09-30-model-automation-design.md`.

- [ ] **Step 1:** —
  - `:446` → `- **v0.1 (MA-4c) is numpy and the Python standard library only, reading plain LAS 1.2–1.4** (nothing downloaded; Open3D dropped, MA-4a decision 5). laspy and pye57 (E57, LAZ, the CRS) come with MA-4g's download OK; PDAL, COPC, TEASER++, COLMAP and the detection models wait for a packaging spike in MA-7.`
  - after `:450` add `- BUILT in MA-4c: storeys, walls (faces in a mid-storey slice, paired by WallPairing's rule ported to Python — a wall candidate is the paired centreline and thickness, its faces in \`geometry.faces\`; MA-4c spec amendment S3 settles :448 against :458), floors and ceilings (oriented rectangles), as untyped candidates in the contract's keys, the scan's own frame.`
  - `:451` append ` — MA-4e (\`POST /measure\`), not v0.1.`
  - `:671` "no registration until a measured one, MA-4c" → "no registration — drawing alignment by 2 points is MA-5".
  - `:672` "`rmse_mm` waits for a measured registration (MA-4c)" → "`rmse_mm` comes from a registered scan's report (MA-4g reads E57 and its report; sentinel-survey does not register — §4.3 \"Do not build registration\")".
  - `:831` Status → `BUILT in MA-4c for sentinel-survey jobs: written by the bridge only — entity_type \`build\`, action \`build:run <job-id> · sentinel-survey <version> · <status>\` (the open route can write only exactly \`build:run\`, claimed), new_value {job_id, reader, version, status, pack_id, pack_version, items [{id, sha256}] (sent), read [id] (what the result was measured from), refused, tools [{name, version, licence}], params, seed, started, finished, minutes, cpu_s, points_in, points_used, model_calls 0, tokens 0, candidates {level, wall, floor, ceiling}, gaps null (typing is MA-4d), result_sha256, claimed false}; one per run that starts (done, failed, refused). A job's row is accepted (MA-4d) only by its id on the job record, its action prefix \`build:run <job-id> · sentinel-survey \`, claimed false and a matching result_sha256 — never an open-route \`build:run\` row. The add-in's receipts (MA-1a item 8) stay claimed. The controller turns BUILT into LANDED with the drill's rows.`
  - after `:877` add `- MA-4c spec amendment S1: \`POST /cde/:key/build/jobs\` {pack, readers?: ["sentinel-survey"], params?: {voxel_mm, storey_min_mm}} → 202 {job} — a signed-in contributor of an office project (the machine credential is a 403: the run names a person, and no agent may start one), one job at a time per bridge (409), budgeted (6 per user, 12 in all, a minute); the bridge picks every admitted scan of the pack in force and lists in \`refused\` what v0.1 cannot read (flagged, not surveyable, no geometry_extraction, not .las); \`voxel_mm\` is 5–50 (a wall face needs a point at least every 50 mm); \`snap_mm\` is not a survey parameter (catalogue snapping is the bridge's D16 policy) and any other body key (\`seed\`, \`items\`, \`started_by\`) is refused in words; \`GET /cde/:key/build/jobs\` → the newest 20 (any member); \`GET …/:id\` → {job, candidates, derived, receipt}; \`gaps\` come with typing (MA-4d).`
  - `:895` append ` — \`sentinel_build_status\` BUILT in MA-4c (read-only).`
  - after `:921` add `- MA-4c spec amendment S2: the bridge starts one service process per job and stops it after (\`survey-service.mjs\`, \`SENTINEL_PYTHON\`, spawned \`-E -B\` without a shell and with an allow-listed environment); the service binds 127.0.0.1 on a port it picks (one JSON line on stdout), answers only that start's token, exits when its stdin closes (the bridge gone, a hard kill too), and writes no file: its result comes back over HTTP and the bridge keeps it as \`<SENTINEL_JOBS_ROOT or %APPDATA%/Sentinel/jobs>/<key>/<job-id>/result.json\`, its sha256 on the build:run row. Params are {voxel_mm, storey_min_mm, tolerances_mm} (no \`snap_mm\`); the seed is the bridge's. MA-4c spec amendment S3: a candidate's geometry uses the contract's keys and millimetres in the scan's own frame (no CRS, no transform; the service measures in a local frame and gives the scan's back) — a wall {LocationCurve (z = base), BaseElevation, TopElevation, storey, faces}, a level {BaseElevation}, a floor {LocationLoop, storey}, a ceiling {Boundary, Offset (its height above its level), storey}. The service re-hashes every input before and after the read, refuses a file over 300 million points, and fails a job whose scans span more than 300 m in plan (one building).`
  - `:924` → `- **v0.1 (MA-4c): numpy only** (BSD-3-Clause, with 0BSD, MIT, Zlib and CC0-1.0 parts) on CPython (PSF-2.0). From MA-4g, pip wheels: laspy (BSD-style), pye57 (MIT). Open3D dropped (MA-4a decision 5).`
  - `:929` append ` MA-4c adds 0BSD, Zlib and CC0-1.0 (parts of numpy) and PSF-2.0 (CPython) — all permissive; accepted by the founder on 2026-10-08.`
  - `:945` → `- **Build jobs:** the bridge's job folder (\`SENTINEL_JOBS_ROOT\`, default \`%APPDATA%/Sentinel/jobs/<key>/<job-id>/\`: job.json, result.json), kept after the run — MA-4d checks a changeset's \`measured\` against it. Their receipts go on the ledger (\`build:run\`, with the result's sha256).`
  - after `:953` add the row `| Start a survey job | contributor, signed in (by name); the machine credential is a 403 (MA-4c) |`.
  - under `:1132` add `    - Met in MA-4c for storeys, walls, floors and ceilings (numpy, plain LAS); deviation moved to MA-4e (\`POST /measure\`); E57 and LAZ to MA-4g.`
- [ ] **Step 2: commit** — `docs: MA-4c - the design: v0.1 is numpy and plain LAS, build:run built, the build-jobs routes (S1), the one-process service and the result kept (S2), the candidate keys and frame (S3), registration re-pointed, the licence list, who starts a survey`

### Task 11 — Final checks (nothing to commit)

From `WebApp`: `npx vitest run 2>&1 | tail -6` (all pass — the real-Python block ran on this PC; restore the fixture if listed), `npm run build 2>&1 | tail -3`, `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` (17). From the repo root: `C:\Python314\python.exe -B -m unittest discover -s survey -v` (all pass), `git status --short` shows only `.claude/`, `ab.html` and the pre-existing `package-lock.json` (no `__pycache__`, no `.tmp`). `grep -rn "child_process" WebApp/bridge --include=*.mjs | grep -v test` → only `survey-service.mjs`. `grep -rn "socket\|urllib\|http.client" survey/las.py survey/pipeline.py survey/service.py` → nothing. Report the totals and `git log --oneline master..HEAD` (ten commits).

## Live drill MA4c (the controller, after the build)

On a drill copy of the bridge at 4101 on the branch, then the local web app (the founder's session for the person rows: a job names a person). Project: **a new drill project `ma4c-drill` attached to the office** — not `ma4a-drill` (its `tiny.las` would merge into the survey; items cannot be removed) and never `aster-tower`. A lead makes the pack and signs (a) and (c). Files go in **by hand** into `%APPDATA%\Sentinel\evidence\ma4c-drill\scans\`: `two-storey.las` (`node WebApp/scripts/make-two-storey-las.mjs …`), `compressed.las` (the same with `--laz-bit`), `site.laz` (a copy of `two-storey.las`); each admitted with method "registered in source" → `ev-0001`, `ev-0002`, `ev-0003`.

- **S-0 install record** — `C:\Python314\python.exe -E -B -c "import sys, numpy; print(sys.version.split()[0], numpy.__version__)"` → `3.14.2 2.4.6`; nothing installed or downloaded (0 steps: numpy was already in the user site); `C:\Python314\python.exe -B -m unittest discover -s survey -v` passes; record the time of both (the design's install row).
- **S-1** A contributor: Files ▸ Evidence ▸ **Run survey** → `✓ Started job-0001 — sentinel-survey reads ev-0001 (scans/two-storey.las), ev-0002 (scans/compressed.las); refused ev-0003 (a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS) — ↻ for its progress.` ↻ → `job-0001 · done · read ev-0001 · refused ev-0003 (…); ev-0002 (its points are compressed (LAZ) — sentinel-survey 0.1 reads plain LAS; LAZ is read from MA-4g) · 2 level(s), 8 wall(s), 2 floor(s), 2 ceiling(s) · by <the founder> · … · ledger #N`. While it runs, the python.exe child's connections are watched (`Get-NetTCPConnection -OwningProcess <its pid>` every 200 ms): only 127.0.0.1 (its listener and the bridge's calls) — no remote address; the 4101 bridge's own: loopback and the Supabase REST host only.
- **S-2** **Candidates** (also `GET /cde/ma4c-drill/build/jobs/job-0001` as a viewer): levels 0 and 3000; ceilings 2800 and 5800 (height 2800, `geometry.Offset` 2800); 8 walls — thickness 300 at y 150, 200 at y 5900, 250 at x 125, 300 at x 7850 on each storey, height 2800, two faces each; two floors ≈ 39.9 m² within 100 mm inside 250..7700 × 300..5800; every evidence ref `ev-0001#…` (ev-0002 was refused). `certutil -hashfile %APPDATA%\Sentinel\jobs\ma4c-drill\job-0001\result.json SHA256` equals the record's `result_sha256` and the row's.
- **S-3** The `build:run` row: entity_type `build`, action `build:run job-0001 · sentinel-survey 0.1.0 · done`, actor the founder, `claimed: false`, items ev-0001 and ev-0002 with their shas (sent), `read: ["ev-0001"]`, tools `sentinel-survey 0.1.0 LicenseRef-Sentinel`, `python 3.14.2 PSF-2.0`, `numpy 2.4.6 BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`, seed 1, params, `points_in` 47699, `cpu_s`, `gaps: null`.
- **S-4** Determinism: **Run survey** again → `job-0002`; its `candidates` equal job-0001's (`node -e` comparing the two `result.json` candidates as JSON); the result shas differ only through the receipt's times.
- **S-5** Refusals, no row for any: the machine credential `POST …/build/jobs {pack:"evp-0001"}` → 403 `a survey job needs a person — …`; a viewer → 403; `{pack:"evp-0001", params:{snap_mm:5}}` → 400 (D16 words); `{pack:"evp-0001", seed:7}` → 400 `seed is not a survey job field — …`; `GET …/build/jobs/job-0099` → 404 `no survey job job-0099 on ma4c-drill — nothing was saved`.
- **S-6** In the **drill copy's** `config/.env` (the one its `load-env.mjs` reads: that file wins over the shell's environment, so a shell variable would not show this) set `SENTINEL_PYTHON=C:\nowhere\python.exe` (add the line, or change it if the founder has set one), restart the 4101 bridge → **Run survey** → `Not done — sentinel-survey is not set up on this PC: no Python where SENTINEL_PYTHON …`; then `SENTINEL_PYTHON=python.exe` → `… SENTINEL_PYTHON must be the absolute path of a python.exe — nothing was saved`; no job folder, no row for either. Restore the file as it was and restart.
- **S-7** Kill paths: in one PowerShell line, POST a job (a contributor's JWT, or the web button) and `taskkill /pid <4101 bridge pid> /f` at once → within 2 s no python.exe child of it is left (`Get-CimInstance Win32_Process -Filter "Name='python.exe'"` with that ParentProcessId → none: the stdin watchdog). Restart the bridge → that job reads `failed · given ev-0001, ev-0002 · the bridge stopped while it ran — nothing it found was kept; run it again`, with no build:run row (Risks). A Ctrl+C on a bridge mid-job: the child goes with it (`exit` event).
- **S-8** The open route: machine `POST /cde/ma4c-drill/audit {entity_type:"build", action:"build:run job-0001 · sentinel-survey 0.1.0 · done", new_value:{claimed:false}}` → stored as `build:run`, `claimed: true`; `{entity_type:"event", action:"build:run job-0001"}` → 400.
- **S-9** A viewer sees the Survey lines and Candidates, no Run survey; a contributor sees Run survey only when no job runs (`A survey is running — ↻ for its progress.` while one does).
- **S-10** MCP: `sentinel_build_status {project:"ma4c-drill"}` lists both jobs; `{…, job:"job-0001"}` returns the 14 candidates.
- Merge, restart the 4100 bridge on master, publish web 1.0.64, the design row :831 to LANDED with the drill's ledger ids, a secret scan of the range, push.

## Risks

- **LAS units are assumed metres** (no VLR, no CRS read): a LAS in US survey feet reads 3.28× too large. The receipt says `metres assumed (no CRS read)`; MA-4g reads the CRS.
- **The scan's frame is not Revit's.** Candidates are in the scan's registered frame; the changeset executor places in internal-origin millimetres with no transform. The drill LAS sits at the origin, so this stays hidden until real data — MA-4d's question (Next).
- **Hashed before and after the read.** A file changed during the read fails the job in words (`… changed while it was read — nothing it found was kept`); a change made and undone inside the read is not caught (`ponytail:` in `check`; a read lock is MA-4h's if it matters). Each file is hashed twice: minutes on a 6.5 GB scan, inside `JOB_MS`.
- **No memory bound on Windows** (no Job Object from Node): what bounds Python is the point cap (10 million kept, a seeded sample beyond), the chunked read (8 million records at a time, so the sampling mask follows the chunk, never the file) and the refusal of a file over 300 million points — about 1-1.5 GB at the cap whatever the file's size; the plan span cap (300 m) bounds the Hough accumulator (~170 MB). The 10 min wall clock bounds time. MA-4h measures all of them on Kladno.
- **A long numpy step holds Python's lock** and the service cannot answer a poll meanwhile: the voxel sort no longer does (one int64 key: 2.0 s at the cap, no stall, against 12.2 s and a 10.8 s stall before); the remaining row sorts (surfaces, cells) are over a band or a slice, and the supervisor treats a timed-out poll as busy for up to `BUSY_MS` (60 s) before failing the job.
- **A run whose ledger write fails** (Supabase down after the survey): `result.json` and the record exist, the record has no `ledger`; MA-4d trusts only a result whose sha the row carries, so it is not trusted. The bridge log says why; run it again.
- **A job the bridge dies with has no `build:run` row** (nothing was alive to write it); its record reads failed.
- **Two bridges on one PC** (4100 and a 4101 drill copy) share the jobs folder: ids never clash (`mkdir`), but each reads the other's running job as stopped. Drill on one bridge at a time.
- **Measuring ceilings (each `ponytail:` in `pipeline.py`):** floor vs ceiling by the gaps alone (terrain, mezzanines, split levels mislabelled); furniture under 2 m² dropped, taller than mid-storey read as wall faces; a closed door reads as wall; a corridor under 600 mm or a wall over 600 mm misread; floors and ceilings are rectangles (an L-shape reads as its bounding rectangle, with its coverage) about 40 mm inside their walls; wall ends follow WallPairing's centreline (up to half a thickness long or short at a corner); the Hough loop is faces × cells × 360, in each slice's local frame (a national-grid scan costs what one at the origin does; tested at a UTM-like offset); one building per job (at most 300 m across); `voxel_mm` at most 50. Honest ceiling of the design (:467-471) holds: LOD 200 as found.
- **Determinism is per machine:** the same input, params and seed give the same candidates here (tested); another CPU's BLAS could move a last millimetre. MA-4d checks one job's stored result, never a re-run.
- **Python's stderr may name a path** (a traceback): it goes to the bridge log only. A job's `error` reaches job.json, every viewer over the Funnel and the hosted ledger, so the service words a file error without its path (`a scan was not read (No such file or directory) — …`, tested by deleting a file between hash and read); any other error is `Type: message` (numpy's own messages name no file).

## Next (out of scope here)

- **MA-4d** — survey candidates to typed changesets per storey: storeys matched to existing levels (the IFC manifest's `levels`, a tolerance) or created; `facts.thickness_mm` from `measured.thickness_mm` and bridge typing per candidate (`makeTyper`), gaps split out before filing and grouped in the Holding Area with evidence and job ids; `measured` trusted only when `source.job_id` names a job whose `result.json` re-hashes to the `result_sha256` on its `build:run` row, the row found and accepted by decision 11's predicate (its id is `job.ledger.id`, the job's project, entity_type `build`, action starting `build:run <job-id> · sentinel-survey `, `claimed === false`) — never a row matched on `new_value.job_id`, and never an open-route row (action exactly `build:run`, claimed true); the job id in its own field (`source` stays a string for deployed add-ins); pre-tick within 20 mm; the scan-frame → Revit-internal transform (registration report, a lead's transform, or the survey point); `proposal-model.mjs` reading `facts.thickness_mm`; wall ends trimmed to intersections or not.
- **MA-4e** — `POST /measure` and `verify:measured` (the service may stay warm then). **MA-4f** — the decimated scan overlay in Revit (`derived` files then). **MA-4g** — E57, LAZ and the CRS (laspy, pye57; the founder's download OK). **MA-4h** — Kladno: run time, memory, the point cap and the 300-million-point file limit, the 300 m span (tiled slices for a site), the Hough cost, wall F1 against a hand reference, a read lock against a change undone inside the read, the job bound. **MA-4i** — the scan in the web desk.
- Later: `tools/licence-check` (unassigned); a job queue; a retention rule for job folders; the office worker that pulls jobs from a hosted bridge after P2-0 (D11) — the trust anchor is the result's sha on a ledger row, which a pull worker can write too.

## Open questions (the founder's to decide; the defaults above are built unless overruled)

**Answered 2026-10-08:** 1 — the allow-list default accepted by the founder; 2 — no firewall or system setting is changed (the founder's to make, if ever); 3 — the drill project `ma4c-drill` is made by the controller, the person rows run in the founder's session.

Who starts a survey (decision 6: a signed-in contributor; the machine credential reads only) and keeping job folders (kept; a retention rule waits for MA-4h's Kladno sizes, Next) are decided defaults, not questions.

1. **The licence allow-list.** numpy declares `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` and CPython is PSF-2.0 — outside §6.10's list as written. Default: add 0BSD, Zlib, CC0-1.0 and PSF-2.0 (all permissive) to the list.
2. **"No internet access" for the service.** It is enforced by the code (no client import, pinned by a test) and watched in the drill (S-1). A Windows Firewall outbound block on `C:\Python314\python.exe` would enforce it on the PC, but it is a system setting that affects every use of that interpreter — yours to make or not.
3. **The drill project** `ma4c-drill` (new, attached to the office) and your session for the person rows (S-1 to S-4, S-9).

## Critique applied

Feasibility:
- **[critical] Hough accumulator sized by absolute coordinates** — `faces()` runs in the slice's local frame (`org = XY.min(axis=0)`, added back to each seg; named `org` because `o` is already the argsort in that function — caught when the plan's Python was re-run), so the output stays in the scan's frame; a Survey test on the building at a UTM-like offset (E 450 km, N 5500 km, 250 m, written through a LAS origin) expects the same levels (offset by z), the same eight thicknesses and absolute wall coordinates.
- **[critical] voxel holds the GIL / a poll timeout fails the job** — `voxel()` keys each cube by one int64 (guarded by `n.prod() < 2**62`, the row sort as fallback; a Voxel test pins it equal to the row sort); the supervisor treats a timed-out poll as busy and fails only after `BUSY_MS` (60 s) of silence (`callMs`/`busyMs` injectable); stand-in modes `stall` (one poll answered past `callMs`, the job still ends done) and `frozen` (the grace runs out, failed in words).
- **[important] `end()` resolved before the child exited** — it settles once the child is gone, bounded at 5 s (`EXIT_MS`), at once when it never spawned (`pid` undefined); the endings test asserts the child is gone when each job ends.
- **[minor] a done run with a null result** — `resultRefusal` runs for every done run; test (d) adds it (a failed record, one `build:run` row).
- **[minor] top-level body keys** (merged with trust's) — every key but `pack`, `readers`, `params` is a 400 in words; a top-level `snap_mm` gets the D16 words; test (f) and write-roles pin `seed`, `items`, `started_by`.
- **[minor] `write_las` origin and scale** — per-axis `scale`/`origin` parameters; the 1.2-1.4 test uses `(0.001, 0.0005, 0.01)` at `(450000, 5500000, 250)` and asserts within half a scale step.
- **[minor] voxel_mm 200 loses walls** — bounded 5-50 in `readStartBody` and `read_job`, the words naming why.
- **[minor] a refused item listed as read** — the record and the row keep `items` (sent) and gain `read` (done: items less the refused; else []); `jobLine` says "read" (done), "reading" (running) or "given" (failed, refused); S-1 expects `read ev-0001`.
- **[minor] ceiling geometry** — `{Boundary, Offset, storey}` (Offset = height above its level, the contract's key), elevation under `measured`; decision 13, Interfaces, S3 and the Survey test updated.
- **[minor] readJob refusals** (merged with trust's) — both end "— nothing was saved"; tests (g) and write-roles updated.
- **[minor] S-6 and config/.env** — S-6 edits the drill copy's `config/.env`, then restores it; decision 2 says the file wins.

Trust:
- **[important] Hough memory at site-grid offsets** — the local frame above, plus a plan-span cap: scans wider than 300 m fail the job in words (`las.Refused`, checked once on the read cloud before the voxel); tested.
- **[important] the point cap did not bound memory** — `read_points_mm` reads and samples 8 million records at a time (the same points whatever the chunk: a test patches `CHUNK` to 7); `service.check` refuses a file over 300 million points in words (a test patches the limit); the Risks figure is corrected.
- **[minor] readJob's words claimed a ledger check** — reworded to "the sha256 on its record"; decision 11, Next and the design's :831 pin MA-4d's predicate for accepting a job's row (id, project, entity_type, action prefix, `claimed === false`, matching sha) and say an open-route row is never accepted.
- **[minor] bare `SENTINEL_PYTHON`** — `notSetUp` refuses a non-absolute path in words; a test pins `python.exe`; S-6 shows it live.
- **[minor] SO_REUSEADDR and idle connections** — `Server(ThreadingHTTPServer)` with `allow_reuse_address = False`, `daemon_threads = True`; `Handler.timeout = 10`; a unittest asserts `SO_REUSEADDR == 0`.
- **[minor] a path in a job's error** — `run()` words an `OSError` as `a scan was not read (<strerror>) — nothing it found was kept`, a `las.Refused` as its own words, anything else as `Type: message`; the traceback goes to stderr (the bridge log); a unittest deletes the file between hash and read and asserts no separator and no file name.
- **[minor] hashed, then read** — `run()` re-hashes every read item after the survey and fails the job in words if one moved; the ponytail now names the residual case (a change undone inside the read); a unittest rewrites the file inside a patched survey.
- **[minor] job-10000 and the sort** — `/^job-\d{4,}$/`, newest first by number; test (g) makes `job-10000` and sees `job-10001` next.

Every Python change above was re-run from this plan's own code blocks in a scratch folder: 26 tests pass, the real service included.

## Critique not taken

- **SO_EXCLUSIVEADDRUSE (trust, the optional half of the SO_REUSEADDR finding).** Setting it needs `import socket` in `service.py`, which the no-client import test exists to keep out; and the only process it would stop is one of the same Windows account, which can already read the service's environment (the token) and the evidence files. Kept as a `ponytail:` on `Server` (set it if the service ever runs under an account of its own).
- **The words "larger scans wait for MA-4h's chunked reader" (trust, memory).** The reader is chunked now, so the refusal says "a larger scan waits for MA-4h" (the limit is about time — two hashes and a chunked read inside `JOB_MS` — not memory).
- **"The storey fails" for a slice wider than 300 m (trust, Hough memory).** The span is checked once on the whole read cloud and fails the job: a cloud that wide is not one building, and failing one storey would keep a partial result of the rest.
