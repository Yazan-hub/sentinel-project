// MA-5a-3 — the drawing supervisor: a Node stand-in answers as sentinel-drawing (fixtures/drawing-standin.mjs), so every way a job ends is
// driven without .NET; one block runs the real worker on the drill plan when it is built (dotnet build drawing -c Release).
import { describe, it, expect } from "vitest";
import { spawn as nodeSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runDrawing, notSetUp, childEnv, EXE } from "./drawing-service.mjs";

const STANDIN = fileURLToPath(new URL("./fixtures/drawing-standin.mjs", import.meta.url));
const PLAN = fileURLToPath(new URL("../../drawing/fixtures/drill-plan-L00.pdf", import.meta.url));
const JOB = { job_id: "job-0001", items: [{ id: "ev-0001", kind: "drawing", path: "C:\\ev\\drawings\\plan.pdf", sha256: "ab".repeat(32) }], params: {}, seed: 1 };
const SECRETS = { BCF_TOKEN: "t", SUPABASE_SERVICE_KEY: "k", SUPABASE_JWT_SECRET: "j", THATOPEN_API_KEY: "a" };
const standin = (mode, calls) => (cmd, args, opts) => {
  const child = nodeSpawn(process.execPath, [STANDIN], { ...opts, env: { ...opts.env, STANDIN: mode } });
  calls.push({ cmd, args, opts, child });
  return child;
};
const run = (mode, calls = [], opts = {}) => {
  const logs = [];
  return runDrawing(JOB, { spawn: standin(mode, calls), exe: "C:/sentinel/sentinel-drawing.exe", env: { ...process.env, ...SECRETS }, log: (l) => logs.push(l), ...opts })
    .then((r) => ({ ...r, logs }));
};

describe("runDrawing (MA-5a-3) — the supervisor, with a Node stand-in for sentinel-drawing", () => {
  it("one job to its result: the exe with no argument and no shell, the job on stdin, an allow-listed environment (no bridge secret)", async () => {
    const calls = [], before = process.listenerCount("exit");
    const r = await run("ok", calls, { cwd: tmpdir() });
    expect(r).toMatchObject({ status: "done", stage: "done", pct: 100, version: "0.1.0-standin", refused: [], tools: [{ name: "sentinel-drawing", version: "0.1.0-standin", licence: "proprietary" }] });
    expect(r.result.candidates[0]).toMatchObject({ cid: "drawing-ev-0001-p1-wall-1", kind: "wall", evidence: ["ev-0001#page-1"] });
    expect(r.result.receipt.job).toEqual(JOB);
    expect(calls[0].cmd).toBe("C:/sentinel/sentinel-drawing.exe");
    expect(calls[0].args).toEqual([]);
    expect(calls[0].opts).toMatchObject({ shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], cwd: tmpdir() });
    for (const k of Object.keys(SECRETS)) expect(r.result.receipt.env).not.toContain(k);
    expect(Object.keys(childEnv({ ...SECRETS, SystemRoot: "C:\\Windows", APPDATA: "a", TEMP: "t", TMP: "t", PATH: "p" }))).toEqual(["SYSTEMROOT", "APPDATA", "TEMP", "TMP"]);
    expect(process.listenerCount("exit")).toBe(before);
    expect(r.logs).toEqual([]);
  });

  it("a refusal comes back as the worker said it — its items with why, no result", async () => {
    const r = await run("refuse");
    expect(r).toMatchObject({ status: "refused", refused: [{ id: "ev-0001", reason: "not the bytes admitted (sha256)" }] });
    expect(r.result).toBeUndefined();
  });

  it("a crash, an answer that is not JSON or not the contract's, and an overrun are failed jobs in words; the stderr goes to the log only", async () => {
    const crash = await run("crash");
    expect(crash).toMatchObject({ status: "failed", error: "sentinel-drawing stopped (exit 1) — see the bridge log; nothing it found was kept" });
    expect(crash.error).not.toContain("secret");
    expect(crash.logs[0]).toContain("FileNotFoundException");
    expect((await run("garbage")).error).toBe("sentinel-drawing's answer was not its contract's (status done or refused) — nothing it found was kept");
    expect((await run("badstatus")).error).toBe("sentinel-drawing's answer was not its contract's (status done or refused) — nothing it found was kept");
    const calls = [];
    const hang = await run("hang", calls, { jobMs: 300 });
    expect(hang).toMatchObject({ status: "failed", error: "the drawing read took longer than 1 min — it was stopped; nothing it found was kept" });
    expect(calls[0].child.exitCode !== null || calls[0].child.signalCode !== null).toBe(true); // killed, and gone before the answer
  });

  it("an exe that cannot start is a failed job in words; not set up is a 503's words", async () => {
    const r = await runDrawing(JOB, { exe: "C:/no/such/sentinel-drawing.exe", log: () => {} });
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/^sentinel-drawing could not start \(ENOENT\)/);
    expect(notSetUp({ exe: "sentinel-drawing.exe" })).toBe("sentinel-drawing is not set up on this PC: SENTINEL_DRAWING_EXE must be the absolute path of sentinel-drawing.exe — nothing was saved");
    expect(notSetUp({ exe: "C:/no/such/sentinel-drawing.exe" })).toBe("sentinel-drawing is not set up on this PC: build it in the bridge's checkout (dotnet build drawing -c Release) — nothing was saved");
  });
});

describe.skipIf(!existsSync(EXE))("the real sentinel-drawing on the drill plan (built: drawing/bin/Release)", () => {
  it("reads 5 walls and 2 doors in paper mm under the allow-listed environment", async () => {
    const sha = createHash("sha256").update(readFileSync(PLAN)).digest("hex");
    const r = await runDrawing({ ...JOB, items: [{ id: "ev-0007", kind: "drawing", path: PLAN, sha256: sha }] }, { cwd: tmpdir(), env: { ...process.env, ...SECRETS }, log: () => {} });
    expect(r).toMatchObject({ status: "done", version: "0.1.0", refused: [] });
    expect(r.result.candidates.filter((c) => c.kind === "wall")).toHaveLength(5);
    expect(r.result.candidates.filter((c) => c.kind === "door").map((c) => c.measured)).toEqual([
      { width_paper_mm: 18, tag_width_mm: 900, tag_height_mm: 2100 }, { width_paper_mm: 20, tag_width_mm: 1000, tag_height_mm: 2100 }]);
    expect(r.tools.map((t) => t.name)).toEqual(["sentinel-drawing", "PdfPig", ".NET"]);
  });
});
