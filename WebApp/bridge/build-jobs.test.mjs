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
      params: { voxel_mm: 20, storey_min_mm: 2000, tolerances_mm: [50, 100, 200] }, seed: 1 });
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
