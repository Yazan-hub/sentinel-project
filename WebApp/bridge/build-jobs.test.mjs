// MA-4c — survey jobs on temp folders, deps injected: which scans a job reads and why the rest are refused, the job folder and its record,
// one job at a time, the build:run row (done, failed, refused) with the result's sha256, the result read back and re-hashed.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
