// MA-4c — the survey supervisor: a Node stand-in speaks the §6.9 contract (fixtures/survey-standin.mjs), so every way a job ends is driven
// without Python; one block runs the real sentinel-survey when this PC has Python with numpy (SENTINEL_PYTHON, else C:\Python314).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSurvey, notSetUp, childEnv, SCRIPT, DEFAULT_PYTHON } from "./survey-service.mjs";
import { twoStoreyLas } from "../scripts/make-two-storey-las.mjs";
import { measurePlan, judge } from "./survey-plan.mjs";

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

  it("MA-4e: a measure is posted to /measure and polled and read as a job — the same start, token, bounds and stop", async () => {
    const calls = [];
    const r = await runSurvey({ ...JOB, job_id: "measure-c1", elements: [{ guid: "g1", faces: [] }] },
      { spawn: standin("ok", calls), python: "C:/py/python.exe", env: process.env, pollMs: 20, log: () => {}, path: "/measure" });
    expect(r).toMatchObject({ status: "done", result: { elements: [{ guid: "g1", p95_mm: 2.9 }], receipt: { posted: "/measure" } } });
    await gone(calls[0].child);
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

  it("a service that dies before its port: a failed job in words; the bridge log gets its whole stderr tail (settled on close)", async () => {
    const lines = [], r = await run("crash", [], { log: (l) => lines.push(l) });
    expect(r).toMatchObject({ status: "failed", error: "sentinel-survey did not start (exit 1) — see the bridge log; numpy must import under SENTINEL_PYTHON" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("No module named 'numpy'");
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
    expect(a.tools.map((t) => t.name).slice(0, 3)).toEqual(["sentinel-survey", "python", "numpy"]); // MA-4g: the wheels follow when installed
    expect(JSON.stringify(b.result.candidates)).toBe(JSON.stringify(a.result.candidates));
  }, 60_000);

  it("a changed file is refused by the service in words, and the job is refused", async () => {
    const r = await runSurvey(job("0".repeat(64)), { python: PY, cwd: dir });
    expect(r).toMatchObject({ status: "refused", refused: [{ id: "ev-0001", reason: "changed since admitted (its sha256 is not the pack's) — Re-check flags it" }] });
  }, 60_000);

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
});
