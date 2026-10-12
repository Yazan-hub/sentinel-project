// MA-4c — survey jobs on temp folders, deps injected: which scans a job reads and why the rest are refused, the job folder and its record,
// one job at a time, the build:run row (done, failed, refused) with the result's sha256, the result read back and re-hashed.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startJob, listJobs, readJob, readStartBody, resultRefusal, current, trustedJob, measureJob, stillAdmitted } from "./build-jobs.mjs";
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
// MA-5a-3: a sentinel-drawing result — paper mm, page 1
const DRESULT = {
  candidates: [
    { cid: "drawing-ev-0011-p1-wall-1", kind: "wall", geometry: { LocationCurve: { start: [60, 43], end: [220, 43] }, faces: [[60, 40, 220, 40], [65, 46, 214, 46]], page: 1, units: "paper_mm" },
      measured: { length_paper_mm: 160, thickness_paper_mm: 6 }, evidence: ["ev-0011#page-1"] },
    { cid: "drawing-ev-0011-p1-wall-1-door-1", kind: "door", geometry: { host: "drawing-ev-0011-p1-wall-1", Location: [129, 43], direction: [0, 1], along_paper_mm: 69, swing_centre: [120, 46], page: 1, units: "paper_mm" },
      measured: { width_paper_mm: 18, tag_width_mm: 900, tag_height_mm: 2100 }, evidence: ["ev-0011#page-1"] }],
  derived: [], receipt: { started: "2026-10-11T10:00:00Z", finished: "2026-10-11T10:00:01Z", cpu_s: 0.2, items: [{ id: "ev-0011", pages: 1, page_read: 1 }] },
};
const DTOOLS = [{ name: "sentinel-drawing", version: "0.1.0", licence: "proprietary" }, { name: "PdfPig", version: "0.1.16", licence: "Apache-2.0" }];
const drawingItem = (id, path, over = {}) => ({ id, kind: "drawing", format: path.split(".").pop(), path, sha256: id.slice(-1).repeat(64), surveyable: false,
  allowed_uses: { ...USES }, licence: "holder-permission", request_id: "req-0001", ...over });
let root, ev, PACK, audits, runs, role;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sentinel-jobs-"));
  ev = mkdtempSync(join(tmpdir(), "sentinel-ev-"));
  mkdirSync(join(ev, "scans"));
  for (const f of ["a.las", "b.laz", "c.rcp", "d.las", "e.las"]) writeFileSync(join(ev, "scans", f), "x");
  PACK = { pack_id: "evp-0001", items: [
    item("ev-0001", "scans/a.las"), item("ev-0003", "scans/c.rcp", { surveyable: false }),
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
  notSetUpDrawing: () => null,
  runDrawing: (job, opts) => new Promise((ok) => runs.push({ job, opts, ok, drawing: true })),
  ...over,
});
const start = (b = { pack: "evp-0001" }, over) => startJob("demo", b, deps(over));
const finish = async (r) => { runs.at(-1).ok(r); runs.pop(); await current(); };
const rec = (id = "job-0001") => JSON.parse(readFileSync(join(root, "demo", id, "job.json"), "utf8"));

describe("survey jobs (MA-4c)", () => {
  it("(a) a job reads the admitted scans of the pack in force; every other scan is refused with why; the folder and its record", async () => {
    const { job } = await start();
    expect(job).toMatchObject({ id: "job-0001", project: "demo", pack_id: "evp-0001", pack_version: 9, status: "queued", seed: 1, started_by: "machine",
      params: { voxel_mm: 20, storey_min_mm: 2000 }, items: [{ id: "ev-0001", path: "scans/a.las", sha256: "1".repeat(64) }] });
    expect(job.refused).toEqual([
      { id: "ev-0003", reason: "not surveyable (a .rcp)" },
      { id: "ev-0004", reason: "changed since admitted (Re-check flagged it) — admit the same bytes again" },
      { id: "ev-0005", reason: "its allowed uses exclude geometry extraction" }]);
    expect(rec().status).toBe("queued");
    expect(runs[0].job).toEqual({ job_id: "job-0001", items: [{ id: "ev-0001", kind: "scan", path: join(ev, "scans", "a.las"), sha256: "1".repeat(64) }],
      params: { voxel_mm: 20, storey_min_mm: 2000, tolerances_mm: [20, 50, 100, 200] }, seed: 1 });
    expect(runs[0].opts.cwd).toBe(join(root, "demo", "job-0001"));
  });

  it("(a2) MA-4g: a .laz and an .e57 are sent like a .las — sentinel-survey reads each by its bytes and refuses what it cannot, in words", async () => {
    PACK.items.push(item("ev-0002", "scans/b.laz"), item("ev-0007", "scans/f.e57"));
    const { job } = await start();
    expect(job.items.map((i) => i.id)).toEqual(["ev-0001", "ev-0002", "ev-0007"]);
    expect(job.refused.map((r) => r.id)).toEqual(["ev-0003", "ev-0004", "ev-0005"]);
    expect(runs[0].job.items).toEqual([
      { id: "ev-0001", kind: "scan", path: join(ev, "scans", "a.las"), sha256: "1".repeat(64) },
      { id: "ev-0002", kind: "scan", path: join(ev, "scans", "b.laz"), sha256: "2".repeat(64) },
      { id: "ev-0007", kind: "scan", path: join(ev, "scans", "f.e57"), sha256: "7".repeat(64) }]);
  });

  it("(b) the run's end: result.json, its sha256 on the record and on ONE build:run row — the bridge's (claimed false), never the candidates", async () => {
    await start();
    runs[0].opts.onProgress({ status: "running", stage: "walls", pct: 60 });
    expect(rec()).toMatchObject({ status: "running", stage: "walls", pct: 60 });
    const tmp = join(root, "demo", "job-0001", `job.json.${process.pid}.tmp`), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mkdirSync(tmp); // a progress save that fails (EISDIR here; EPERM from an indexer): logged, never the job's error
    expect(() => runs[0].opts.onProgress({ status: "running", stage: "floors", pct: 80 })).not.toThrow();
    expect(warn).toHaveBeenCalledWith("[survey] demo job-0001: progress not saved — EISDIR");
    warn.mockRestore(); rmSync(tmp, { recursive: true });
    runs[0].opts.onProgress({ status: "done", stage: "done", pct: 100 }); // the service's end is written with its result, below — never from here
    expect(rec()).toMatchObject({ status: "running", stage: "done", pct: 100 });
    await finish({ status: "done", stage: "done", pct: 100, refused: [], result: RESULT, tools: TOOLS, version: "0.1.0" });
    const bytes = readFileSync(join(root, "demo", "job-0001", "result.json"));
    expect(rec()).toMatchObject({ status: "done", pct: 100, result_sha256: sha(bytes), candidates_total: 2, counts: { level: 1, wall: 1, floor: 0, ceiling: 0 },
      reader: { name: "sentinel-survey", version: "0.1.0" }, tools: TOOLS, ledger: { id: 101, hash: "cd".repeat(32) } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ pid: "uuid-demo", et: "build", eid: null, action: "build:run job-0001 · sentinel-survey 0.1.0 · done", actor: "machine" });
    expect(audits[0].v).toEqual({ job_id: "job-0001", reader: "sentinel-survey", version: "0.1.0", status: "done", pack_id: "evp-0001", pack_version: 9,
      items: [{ id: "ev-0001", sha256: "1".repeat(64) }], read: ["ev-0001"], refused: rec().refused, tools: TOOLS, params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1,
      started: "2026-10-08T10:00:00Z", finished: "2026-10-08T10:00:02Z", minutes: 0, cpu_s: 0.4, points_in: 47699, points_used: 47680,
      model_calls: 0, tokens: 0, candidates: { level: 1, wall: 1, floor: 0, ceiling: 0 }, gaps: null, result_sha256: sha(bytes), claimed: false }); // MA-5a: a 0.1.0 reader never looked for doors
  });

  it("(b2) MA-5a: a 0.5.0 reader's counts name doors and windows, none found included — a reader before it never looked (review)", async () => {
    await start();
    await finish({ status: "done", stage: "done", pct: 100, refused: [], result: RESULT, tools: TOOLS, version: "0.5.0" });
    expect(rec().counts).toEqual({ level: 1, wall: 1, floor: 0, ceiling: 0, door: 0, window: 0 });
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
    // MA-5a: sentinel-survey 0.5.0's doors and windows are read; a kind it does not propose is not
    const door = { cid: "scan-L00-wall-1-door-1", kind: "door", geometry: { host: "scan-L00-wall-1", storey: "scan-L00-level", direction: [1, 0], Location: [3450, 150, 0], along_mm: 3465 },
      measured: { width_mm: 900, height_mm: 2100, sill_mm: 0, head_mm: 2100 }, evidence: ["ev-0001#slice-L00"], fit: { inliers: 56, rmse_mm: 0, coverage: 0.875, faces_seen: 2 } };
    expect(resultRefusal({ ...RESULT, candidates: [...RESULT.candidates, door, { ...door, cid: "scan-L00-wall-1-window-1", kind: "window" }] }, ["ev-0001"])).toBeNull();
    expect(resultRefusal({ ...RESULT, candidates: [{ ...door, kind: "skylight" }] }, ["ev-0001"])).toBe("candidates[0].kind");
  });

  it("(e) refused before anything is written: no scan sentinel-survey is sent (each with why), sentinel-survey not set up, the machine credential", async () => {
    const nothing = () => { expect(existsSync(join(root, "demo"))).toBe(false); expect(runs).toHaveLength(0); expect(audits).toHaveLength(0); };
    PACK.items = PACK.items.filter((i) => i.id !== "ev-0001");
    await expect(start()).rejects.toMatchObject({ status: 409, message: "no admitted scan in evp-0001 that sentinel-survey reads — ev-0003: not surveyable (a .rcp); ev-0004: changed since admitted (Re-check flagged it) — admit the same bytes again; ev-0005: its allowed uses exclude geometry extraction; nothing was saved" });
    PACK.items = [];
    await expect(start()).rejects.toMatchObject({ status: 409, message: "no admitted scan in evp-0001 that sentinel-survey reads — admit a .las, .laz or .e57 under Evidence first; nothing was saved" });
    PACK.items = [item("ev-0001", "scans/a.las")];
    await expect(start(undefined, { notSetUp: () => "sentinel-survey is not set up on this PC: no Python … — nothing was saved" })).rejects.toMatchObject({ status: 503 });
    role = "service";
    await expect(start()).rejects.toMatchObject({ status: 403 });
    nothing();
  });

  it("(f) the body: the pack named; readers only sentinel-survey; params in bounds; any other key — snap_mm, seed, items, started_by — refused in words", () => {
    expect(readStartBody({ pack: " evp-0001 " })).toEqual({ pack: "evp-0001", reader: "sentinel-survey", params: { voxel_mm: 20, storey_min_mm: 2000 } });
    // MA-5a-3: the second reader takes no parameter
    expect(readStartBody({ pack: "evp-0001", readers: ["sentinel-drawing"] })).toEqual({ pack: "evp-0001", reader: "sentinel-drawing", params: {} });
    expect(readStartBody({ pack: "evp-0001", readers: ["sentinel-drawing"], params: {} }).params).toEqual({});
    expect(readStartBody({ pack: "evp-0001", readers: ["sentinel-survey"], params: { voxel_mm: 10 } }).params).toEqual({ voxel_mm: 10, storey_min_mm: 2000 });
    const no = (b) => { try { readStartBody(b); } catch (e) { return [e.status, e.message]; } return null; };
    const D16 = "snap_mm is not a survey parameter: snapping to a catalogue size is the bridge's typing policy (D16, type_snap_mm), MA-4d — nothing was saved";
    const field = (k) => `${k} is not a survey job field — the bridge picks the items, the seed and who started it; send {pack, readers?, params?} — nothing was saved`;
    expect(no({})).toEqual([400, "pack must name the evidence pack in force (evp-0001) — nothing was saved"]);
    const READERS = 'readers must be ["sentinel-survey"], ["sentinel-drawing"] or ["sentinel-ifc"] — one reader a job (or leave it out: sentinel-survey) — nothing was saved';
    expect(no({ pack: "evp-0001", readers: ["laspy"] })).toEqual([400, READERS]);
    expect(no({ pack: "evp-0001", readers: ["sentinel-survey", "sentinel-drawing"] })).toEqual([400, READERS]);
    expect(no({ pack: "evp-0001", readers: ["sentinel-drawing"], params: { voxel_mm: 20 } })).toEqual([400, 'sentinel-drawing takes no parameter — send {pack, readers: ["sentinel-drawing"]} — nothing was saved']);
    expect(no({ pack: "evp-0001", params: { snap_mm: 15 } })).toEqual([400, D16]);
    expect(no({ pack: "evp-0001", snap_mm: 15 })).toEqual([400, D16]);
    for (const v of [1, 200]) expect(no({ pack: "evp-0001", params: { voxel_mm: v } })).toEqual([400, "params.voxel_mm must be a whole number of millimetres from 5 to 50 (a wall face needs a point at least every 50 mm) — nothing was saved"]);
    expect(no({ pack: "evp-0001", params: { seed: 7 } })).toEqual([400, "seed is not a survey parameter — voxel_mm and storey_min_mm are — nothing was saved"]);
    expect(no({ pack: "evp-0001", params: { constructor: 5 } })).toEqual([400, "constructor is not a survey parameter — voxel_mm and storey_min_mm are — nothing was saved"]);
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

  it("(h) final review: a result that cannot be kept fails the run in words naming no path, and the run still writes its build:run row", async () => {
    await start();
    mkdirSync(join(root, "demo", "job-0001", "result.json")); // a folder where result.json goes: the rename onto it fails (EPERM, EISDIR)
    await finish({ status: "done", stage: "done", pct: 100, refused: [], result: RESULT, tools: TOOLS, version: "0.1.0" });
    const r = rec();
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/^the result could not be kept on this PC \((EPERM|EISDIR|EEXIST|ENOTEMPTY|EACCES)\) — nothing it found was kept$/);
    expect(r.error).not.toContain(root);
    expect(r).toMatchObject({ read: [], ledger: { id: 101 } });
    expect(r.result_sha256).toBeUndefined();
    expect(audits.map((a) => a.action)).toEqual(["build:run job-0001 · sentinel-survey 0.1.0 · failed"]);
    expect(audits[0].v).toMatchObject({ status: "failed", result_sha256: null, candidates: null, error: r.error });
  });
});

describe("drawing jobs (MA-5a-3) — sentinel-drawing on the pack's admitted PDFs, one slot with the survey", () => {
  const drawings = () => {
    mkdirSync(join(ev, "drawings"));
    for (const f of ["A-101.pdf", "A-101.dwg", "b.dxf", "scan.png", "old.pdf", "notes.pdf"]) writeFileSync(join(ev, "drawings", f), "x");
    PACK.items.push(drawingItem("ev-0011", "drawings/A-101.pdf"), drawingItem("ev-0012", "drawings/A-101.dwg"), drawingItem("ev-0016", "drawings/b.dxf"),
      drawingItem("ev-0013", "drawings/scan.png"), drawingItem("ev-0014", "drawings/old.pdf", { state: "changed" }),
      drawingItem("ev-0015", "drawings/notes.pdf", { allowed_uses: { ...USES, geometry_extraction: false } }));
  };
  const startD = (over) => start({ pack: "evp-0001", readers: ["sentinel-drawing"] }, over);

  it("(a) reads the admitted PDFs — a DWG or DXF is Ghost Builder's, a PNG raster (C10), a changed one and one whose uses exclude geometry are refused; scans are not its", async () => {
    drawings();
    const { job } = await startD();
    expect(job).toMatchObject({ id: "job-0001", reader: { name: "sentinel-drawing", version: null }, params: {}, seed: 1, items: [{ id: "ev-0011", path: "drawings/A-101.pdf", sha256: "1".repeat(64) }] });
    expect(job.refused).toEqual([
      { id: "ev-0012", reason: "a .dwg is read by Ghost Builder in Revit (Model from Drawings) — sentinel-drawing reads PDF" },
      { id: "ev-0016", reason: "a .dxf is read by Ghost Builder in Revit (Model from Drawings) — sentinel-drawing reads PDF" },
      { id: "ev-0013", reason: "a .png drawing is raster — out of scope (C10); sentinel-drawing reads vector PDF" },
      { id: "ev-0014", reason: "changed since admitted (Re-check flagged it) — admit the same bytes again" },
      { id: "ev-0015", reason: "its allowed uses exclude geometry extraction" }]);
    expect(runs[0]).toMatchObject({ drawing: true, job: { job_id: "job-0001", items: [{ id: "ev-0011", kind: "drawing", path: join(ev, "drawings", "A-101.pdf"), sha256: "1".repeat(64) }], params: {}, seed: 1 },
      opts: { cwd: join(root, "demo", "job-0001") } });
    expect(Object.keys(runs[0].opts)).toEqual(["cwd"]);
  });

  it("(b) one slot: a survey or a measure meanwhile is a 409 naming the drawing job; its end writes result.json and ONE build:run row naming sentinel-drawing (claimed false)", async () => {
    drawings();
    await startD();
    await expect(start()).rejects.toMatchObject({ status: 409, message: "a drawing job is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    await expect(measureJob("demo", "job-0001", { job_id: "m" }, deps())).rejects.toMatchObject({ status: 409, message: "a drawing job is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    await finish({ status: "done", stage: "done", pct: 100, refused: [], result: DRESULT, tools: DTOOLS, version: "0.1.0" });
    const bytes = readFileSync(join(root, "demo", "job-0001", "result.json"));
    expect(rec()).toMatchObject({ status: "done", read: ["ev-0011"], counts: { wall: 1, door: 1 }, candidates_total: 2, result_sha256: sha(bytes),
      reader: { name: "sentinel-drawing", version: "0.1.0" }, tools: DTOOLS, ledger: { id: 101 } });
    expect(rec().counts).toEqual({ wall: 1, door: 1 }); // MA-5b-1 review: a 0.1.0 reader never looked for rooms — no "0 room(s)"
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("build:run job-0001 · sentinel-drawing 0.1.0 · done");
    expect(audits[0].v).toMatchObject({ job_id: "job-0001", reader: "sentinel-drawing", version: "0.1.0", status: "done", params: {}, seed: 1, items: [{ id: "ev-0011", sha256: "1".repeat(64) }],
      read: ["ev-0011"], candidates: { wall: 1, door: 1 }, cpu_s: 0.2, points_in: null, result_sha256: sha(bytes), claimed: false });
    expect((await start()).job).toMatchObject({ id: "job-0002", reader: { name: "sentinel-survey" } }); // the slot is free after
  });

  it("(c) refused before anything is written: no PDF it reads (each with why, or what to admit), not set up — and its result held to walls and doors in paper mm", async () => {
    await expect(startD()).rejects.toMatchObject({ status: 409, message: "no admitted drawing in evp-0001 that sentinel-drawing reads — admit a vector .pdf plan under Evidence first (a drawing answers an Ask the owner request); nothing was saved" });
    mkdirSync(join(ev, "drawings"));
    writeFileSync(join(ev, "drawings", "A-101.dwg"), "x");
    PACK.items.push(drawingItem("ev-0012", "drawings/A-101.dwg"));
    await expect(startD()).rejects.toMatchObject({ status: 409, message: "no admitted drawing in evp-0001 that sentinel-drawing reads — ev-0012: a .dwg is read by Ghost Builder in Revit (Model from Drawings) — sentinel-drawing reads PDF; nothing was saved" });
    writeFileSync(join(ev, "drawings", "A-101.pdf"), "x");
    PACK.items.push(drawingItem("ev-0011", "drawings/A-101.pdf"));
    await expect(startD({ notSetUpDrawing: () => "sentinel-drawing is not set up on this PC: build it … — nothing was saved", notSetUp: () => "never asked" }))
      .rejects.toMatchObject({ status: 503, message: "sentinel-drawing is not set up on this PC: build it … — nothing was saved" });
    expect(existsSync(join(root, "demo"))).toBe(false);
    expect(resultRefusal(DRESULT, ["ev-0011"], "sentinel-drawing")).toBeNull();
    expect(resultRefusal({ ...DRESULT, candidates: [{ ...DRESULT.candidates[0], geometry: { ...DRESULT.candidates[0].geometry, units: undefined } }] }, ["ev-0011"], "sentinel-drawing"))
      .toBe("candidates[0].geometry.units (a drawing's candidates are in paper_mm)");
    expect(resultRefusal(RESULT, ["ev-0001"], "sentinel-drawing")).toBe("candidates[0].kind"); // a level is not a drawing's
    // MA-5b-1: a room's name becomes a Revit name — each field one line, bounded; its walls are its result's cids
    const room = { cid: "drawing-ev-0011-p1-room-1", kind: "room", geometry: { Location: [94.5, 105.3], name: "OFFICE", number: "101", also: ["FFL +0.00"],
      walls: ["drawing-ev-0011-p1-wall-1"], page: 1, units: "paper_mm" }, measured: { text_height_paper_mm: 2.6 }, evidence: ["ev-0011#page-1"] };
    const withRoom = (g) => ({ ...DRESULT, candidates: [{ ...room, geometry: { ...room.geometry, ...g } }] });
    expect(resultRefusal(withRoom({}), ["ev-0011"], "sentinel-drawing")).toBeNull();
    expect(resultRefusal(withRoom({ number: undefined, also: undefined }), ["ev-0011"], "sentinel-drawing")).toBeNull();
    for (const [g, why] of [[{ name: "" }, "name"], [{ name: "OFF\nICE" }, "name"], [{ name: "x".repeat(257) }, "name"], [{ number: "1".repeat(17) }, "number"],
      [{ number: 101 }, "number"], [{ Location: [1] }, "Location"], [{ Location: [1, Infinity] }, "Location"], [{ walls: ["a", "b", "c", "d", "e"] }, "walls"],
      [{ walls: undefined }, "walls"], [{ also: Array(9).fill("x") }, "also"], [{ also: ["\u0007"] }, "also"]])
      expect(resultRefusal(withRoom(g), ["ev-0011"], "sentinel-drawing"), why).toBe(`candidates[0].geometry.${why}`);
    expect(resultRefusal({ ...RESULT, candidates: [{ ...room, evidence: ["ev-0001#x"], geometry: { ...room.geometry, units: undefined } }] }, ["ev-0001"])).toBe("candidates[0].kind"); // not a survey's
    await startD();
    await finish({ status: "done", stage: "done", pct: 100, refused: [], tools: DTOOLS, version: "0.1.0", result: { ...DRESULT, candidates: [{ ...DRESULT.candidates[0], kind: "window" }] } });
    expect(rec()).toMatchObject({ status: "failed", error: "sentinel-drawing's result is not the contract's shape (candidates[0].kind) — nothing it found was kept" });
    expect(audits[0].action).toBe("build:run job-0001 · sentinel-drawing 0.1.0 · failed");
  });

  it("(d) review: a drawing read with nothing found says why — the receipt's per-item why on the record and on the build:run row", async () => {
    drawings();
    await startD();
    const why = "one line weight on the page — walls are not told from the rest";
    await finish({ status: "done", stage: "done", pct: 100, refused: [], tools: DTOOLS, version: "0.1.0",
      result: { ...DRESULT, candidates: [], receipt: { ...DRESULT.receipt, items: [{ id: "ev-0011", pages: 1, page_read: 1, walls: 0, doors: 0, why }] } } });
    expect(rec()).toMatchObject({ status: "done", candidates_total: 0, counts: { wall: 0, door: 0 }, notes: [{ id: "ev-0011", why }] });
    expect(audits[0].v.notes).toEqual([{ id: "ev-0011", why }]);
    await start(); // a survey's row carries none
    await finish({ status: "done", stage: "done", pct: 100, refused: [], result: RESULT, tools: TOOLS, version: "0.6.0" });
    expect(audits[1].v.notes).toBeUndefined();
  });
});

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
  const NOT_OWN = "ledger #2201 is not job-0001's own build:run row (the bridge's: build:run job-0001 · sentinel-survey, sentinel-drawing or sentinel-ifc … · done, claimed false)";
  const CHANGED = "its result.json does not hash to the sha256 on ledger #2201 — it changed after the job";

  it("(a) the job's own row: the result, the row's pack, items and read, its id and hash — the pack id is the ROW's, not job.json's", async () => {
    lay({ pack_id: "evp-9999" });
    const t = await trust(ROW());
    expect(t.row).toEqual({ ledger: { id: 2201, hash: H }, reader: "sentinel-survey", version: "0.1.0", pack_id: "evp-0001", items: [{ id: "ev-0001", sha256: "1".repeat(64) }], read: ["ev-0001"], result_sha256: SHA, params: null, seed: null });
    expect(t.result.candidates).toHaveLength(2);
  });
  it("(a2) MA-4e: the row's params and seed, never job.json's — the cloud the job measured is read again from the anchored row", async () => {
    lay({ params: { voxel_mm: 50 }, seed: 9 });
    expect((await trust(ROW({}, { params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1 }))).row).toMatchObject({ params: { voxel_mm: 20, storey_min_mm: 2000 }, seed: 1 });
  });
  it("(b) never trusted: an open-route receipt, another job's row that names this job in new_value.job_id, a failed action, a failed status, a claimed row, another type, no row", async () => {
    lay();
    for (const row of [ROW({ action: "build:run" }, { claimed: true }), ROW({ action: "build:run job-0002 · sentinel-survey 0.1.0 · done" }),
      ROW({ action: "build:run job-0001 · sentinel-survey 0.1.0 · failed" }), ROW({}, { status: "failed" }), // each check alone (review)
      ROW({}, { claimed: true }), ROW({ entity_type: "event" }), null])
      await expect(trust(row)).rejects.toMatchObject(untrusted(NOT_OWN));
    await expect(trust(ROW({}, { result_sha256: "f".repeat(64) }))).rejects.toMatchObject(untrusted(CHANGED));
  });
  it("(c) a result.json edited after the job — with job.json's own sha edited to match — is not trusted; nor a run whose row was never written; nor one cid twice; nor a result citing an item the row says was not read", async () => {
    const edited = Buffer.from(JSON.stringify({ ...RESULT, candidates: RESULT.candidates.map((c) => ({ ...c, measured: { ...c.measured, thickness_mm: 250 } })) }));
    lay({ result_sha256: sha(edited) }, edited);
    await expect(trust(ROW())).rejects.toMatchObject(untrusted(CHANGED));
    lay({ ledger: { id: null, hash: null } });
    await expect(trust(ROW())).rejects.toMatchObject(untrusted("its build:run row was never written (the ledger write failed when it ran)"));
    // each element's trust record is bound to it by cid: a cid twice would stamp one candidate's measurement on another's geometry
    const twice = Buffer.from(JSON.stringify({ ...RESULT, candidates: [...RESULT.candidates, RESULT.candidates[1]] }));
    lay({ result_sha256: sha(twice) }, twice);
    await expect(trust(ROW({}, { result_sha256: sha(twice) }))).rejects.toMatchObject(untrusted("its result names one cid twice"));
    // the result is held to what the ROW says was read, never to the items sent (decision 3; final review)
    lay();
    const OFF_READ = untrusted("its result is not the contract's shape over what ledger #2201 says was read (candidates[0].evidence)");
    await expect(trust(ROW({}, { read: ["ev-0002"] }))).rejects.toMatchObject(OFF_READ);
    await expect(trust(ROW({}, { items: [{ id: "ev-0001", sha256: "1".repeat(64) }, { id: "ev-0002", sha256: "2".repeat(64) }], read: ["ev-0002"] }))).rejects.toMatchObject(OFF_READ);
  });
  it("(e) MA-5a-3: a drawing job's own row is trusted and names its reader — the ROW's, never job.json's; a row whose action and new_value disagree on the reader is not; a drawing row holds its result to paper mm", async () => {
    const D = Buffer.from(JSON.stringify(DRESULT)), DSHA = sha(D);
    const DROW = (over = {}, v = {}) => ROW({ action: "build:run job-0001 · sentinel-drawing 0.1.0 · done", ...over }, { reader: "sentinel-drawing", read: ["ev-0011"], items: [{ id: "ev-0011", sha256: "1".repeat(64) }], result_sha256: DSHA, ...v });
    lay({ result_sha256: DSHA, reader: { name: "sentinel-survey" } }, D);
    expect((await trust(DROW())).row).toMatchObject({ reader: "sentinel-drawing", version: "0.1.0", read: ["ev-0011"] });
    await expect(trust(DROW({}, { reader: "sentinel-survey" }))).rejects.toMatchObject(untrusted(NOT_OWN));
    await expect(trust(DROW({ action: "build:run job-0001 · sentinel-drawingx 0.1.0 · done" }))).rejects.toMatchObject(untrusted(NOT_OWN));
    lay(); // a survey's result under a drawing's row: a level is not a drawing's
    await expect(trust(DROW({}, { result_sha256: SHA, read: ["ev-0001"] }))).rejects.toMatchObject(
      untrusted("its result is not the contract's shape over what ledger #2201 says was read (candidates[0].kind)"));
    lay();
    expect((await trust(ROW({}, { reader: undefined }))).row.reader).toBe("sentinel-survey"); // a row from before MA-5a-3 names no reader: the survey's
  });

  it("(d) a job that is not there, not done, or not named job-NNNN", async () => {
    await expect(trust(ROW())).rejects.toMatchObject({ status: 404, message: "no survey job job-0001 on demo — nothing was saved" });
    lay({ status: "failed" });
    await expect(trust(ROW())).rejects.toMatchObject({ status: 409, message: "job-0001 is failed — only a done survey job is proposed; nothing was saved" });
    await expect(trustedJob("demo", "nope", deps())).rejects.toMatchObject({ status: 400, message: "a survey job is named job-NNNN — nothing was saved" });
  });
});

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
  it("MA-4f: the scan overlay takes the same slot — /cloud in the job's folder, and its own words to a job started meanwhile", async () => {
    const r = measureJob("demo", "job-0001", { job_id: "scan-c1", items: [], params: {}, seed: 1, cloud: {} }, deps(), { path: "/cloud", what: "a scan overlay" });
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0].opts).toEqual({ cwd: join(root, "demo", "job-0001"), path: "/cloud" });
    await expect(start()).rejects.toMatchObject({ status: 409, message: "a scan overlay is already running on this bridge (one at a time) — try again when it ends; nothing was saved" });
    runs[0].ok({ status: "done", result: { points: [] } }); runs.pop();
    expect(await r).toMatchObject({ status: "done" });
  });
});

describe("IFC jobs (MA-6-8) — sentinel-ifc in this process on the newest admitted concept IFC", () => {
  const FIX = readFileSync(new URL("./fixtures/ifc-geometry/concept-2storey.ifc", import.meta.url));
  const model = (id, path, over = {}) => ({ id, kind: "model", format: "ifc", path, sha256: sha(FIX), surveyable: false, allowed_uses: { ...USES }, ...over });
  const lay = (over = {}) => { mkdirSync(join(ev, "model")); writeFileSync(join(ev, "model", "old.ifc"), FIX); writeFileSync(join(ev, "model", "concept.ifc"), FIX); PACK.items.push(model("ev-0020", "model/old.ifc", over), model("ev-0021", "model/concept.ifc")); };
  const startI = (over) => start({ pack: "evp-0001", readers: ["sentinel-ifc"] }, over);
  const ITOOLS = [{ name: "sentinel-ifc", version: "0.1.0", licence: "proprietary" }, { name: "web-ifc", version: "0.0.77", licence: "MPL-2.0" }];
  const IRESULT = { candidates: [
    { cid: "L00", kind: "level", geometry: { BaseElevation: 0, name: "CN L00", global_id: "G".repeat(22) }, measured: { elevation_mm: 0 }, evidence: ["ev-0021#" + "G".repeat(22)] },
    { cid: "W".repeat(22), kind: "wall", geometry: { storey: "L00", LocationCurve: { start: [0, 0], end: [8000, 0] }, BaseElevation: 0, TopElevation: 3500 }, measured: { thickness_mm: 300, height_mm: 3500, length_mm: 8000 }, evidence: ["ev-0021#" + "W".repeat(22)] }],
    derived: [], receipt: { cpu_s: 0.3, not_read: [{ global_id: "C".repeat(22), ifc_class: "IFCCOLUMN", storey: "L00", why: "an IfcColumn — the IFC planner reads walls and floors (MA-6); a person places it" }] } };
  const ok = (result = IRESULT) => async () => ({ status: "done", version: "0.1.0", tools: ITOOLS, refused: [], result });

  it("(a) the body takes no parameter; the newest admitted model is read and the older one refused; no model is a 409 in words", async () => {
    expect(readStartBody({ pack: "evp-0001", readers: ["sentinel-ifc"] })).toEqual({ pack: "evp-0001", reader: "sentinel-ifc", params: {} });
    expect(() => readStartBody({ pack: "evp-0001", readers: ["sentinel-ifc"], params: { voxel_mm: 20 } })).toThrow('sentinel-ifc takes no parameter — send {pack, readers: ["sentinel-ifc"]} — nothing was saved');
    await expect(startI()).rejects.toMatchObject({ status: 409, message: "no admitted concept IFC in evp-0001 — admit a .ifc under Evidence first; nothing was saved" });
    lay();
    let seen;
    const { job } = await startI({ notSetUp: () => "survey not set up", runIfc: async (j) => { seen = j; return ok()(); } }); // the IFC reader needs no set-up
    await current();
    expect(job.items).toEqual([{ id: "ev-0021", path: "model/concept.ifc", sha256: sha(FIX) }]);
    expect(job.refused).toEqual([{ id: "ev-0020", reason: "an older concept — one IFC a job: the newest admitted is read" }]);
    expect(seen).toEqual({ job_id: "job-0001", items: [{ id: "ev-0021", kind: "model", path: join(ev, "model", "concept.ifc"), sha256: sha(FIX) }], params: {}, seed: 1 });
  });

  it("(b) the run writes ONE build:run row naming sentinel-ifc with its not_read, counts of levels, walls and floors; trustedJob accepts it", async () => {
    lay();
    await startI({ runIfc: ok() });
    await current();
    expect(rec()).toMatchObject({ status: "done", reader: { name: "sentinel-ifc", version: "0.1.0" }, counts: { level: 1, wall: 1, floor: 0 }, candidates_total: 2, tools: ITOOLS });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("build:run job-0001 · sentinel-ifc 0.1.0 · done");
    expect(audits[0].v).toMatchObject({ reader: "sentinel-ifc", status: "done", claimed: false, cpu_s: 0.3, not_read_total: 1, not_read: [{ ifc_class: "IFCCOLUMN", storey: "L00" }], read: ["ev-0021"], candidates: { level: 1, wall: 1, floor: 0 } });
    const t = await trustedJob("demo", "job-0001", deps({ getAuditEntry: async () => ({ id: 101, hash: "cd".repeat(32), entity_type: "build", action: audits[0].action, new_value: audits[0].v }) }));
    expect(t.row).toMatchObject({ reader: "sentinel-ifc", version: "0.1.0", read: ["ev-0021"] });
    expect(t.result.receipt.not_read).toHaveLength(1);
  });

  it("(c) an IFC door candidate is refused (a failed run, nothing kept); a sha mismatch is refused by the real reader; a read of the fixture finds its levels, walls and floors", async () => {
    expect(resultRefusal({ ...IRESULT, candidates: [{ ...IRESULT.candidates[1], kind: "door" }] }, ["ev-0021"], "sentinel-ifc")).toBe("candidates[0].kind");
    expect(resultRefusal(IRESULT, ["ev-0021"], "sentinel-ifc")).toBe(null);
    expect(resultRefusal({ ...IRESULT, candidates: [{ ...IRESULT.candidates[1], measured: { thickness_mm: null } }] }, ["ev-0021"], "sentinel-ifc")).toBe("candidates[0].measured");
    lay();
    PACK.items.find((i) => i.id === "ev-0021").sha256 = "f".repeat(64);
    await startI();   // the real runIfc: the bytes on disk are not the bytes admitted
    await current();
    expect(rec()).toMatchObject({ status: "refused", refused: [{ id: "ev-0020", reason: "an older concept — one IFC a job: the newest admitted is read" }, { id: "ev-0021", reason: "not the bytes admitted (sha256)" }] });
    expect(audits[0].action).toBe("build:run job-0001 · sentinel-ifc 0.1.0 · refused");
    PACK.items.find((i) => i.id === "ev-0021").sha256 = sha(FIX);
    await startI();
    await current();
    expect(rec("job-0002")).toMatchObject({ status: "done", counts: { level: 2, wall: 8, floor: 3 }, reader: { name: "sentinel-ifc", version: "0.1.0" } });
    expect(rec("job-0002").tools.map((t) => t.name)).toEqual(["sentinel-ifc", "web-ifc", "Node"]);
    expect(audits[1].v.not_read.length).toBeGreaterThan(0);
  });
});
