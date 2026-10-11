// MA-5a-3 — the bridge's drawing supervisor (plan docs/superpowers/plans/2026-10-11-ma5a3-drawing-reader.md). It runs sentinel-drawing
// (drawing/: .NET 8 with PdfPig) for ONE job: the exe spawned without a shell, the job JSON on its stdin, its result JSON on its stdout,
// one stderr line when it fails (the bridge log only — it may name a path). Its environment is an allow-list (config/.env is merged into
// process.env: a plain spawn would hand it every secret); it is killed on the job's bound and on the bridge's exit. One-shot, not a
// service: a plan is read in well under a second. Deps injected: every ending is tested with a Node stand-in (fixtures/drawing-standin.mjs).
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

/** The worker: SENTINEL_DRAWING_EXE in config/.env, else the Release build in the bridge's own checkout. Never PATH. */
export const EXE = fileURLToPath(new URL("../../drawing/bin/Release/net8.0/sentinel-drawing.exe", import.meta.url));
export const exePath = () => process.env.SENTINEL_DRAWING_EXE || EXE;
// ponytail: one wall-clock bound for every job (the drill plan reads in 0.2 s CPU); set it by page count when real sets near it.
export const DRAWING_MS = 2 * 60_000;
const OUT_MAX = 64 * 1024 * 1024; // more than any plan's candidates: the worker's stdout is not read past this
const EXIT_MS = 5_000;            // how long a job's end waits for the exe to be gone
const TAIL = 4000;                // the last stderr characters, for the bridge log only

/** Why sentinel-drawing cannot start on this PC (a 503's words), or null. Checked before a job folder is made. */
export function notSetUp({ exe = exePath() } = {}) {
  if (!isAbsolute(exe)) return "sentinel-drawing is not set up on this PC: SENTINEL_DRAWING_EXE must be the absolute path of sentinel-drawing.exe — nothing was saved";
  if (!existsSync(exe)) return "sentinel-drawing is not set up on this PC: build it in the bridge's checkout (dotnet build drawing -c Release) — nothing was saved";
  return null;
}

/** The child's whole environment: what Windows and .NET need (the runtime is found from the registry), APPDATA, the temp folders. */
export const childEnv = (env) => Object.fromEntries(Object.entries({
  SYSTEMROOT: env.SYSTEMROOT ?? env.SystemRoot, APPDATA: env.APPDATA, TEMP: env.TEMP, TMP: env.TMP,
}).filter(([, v]) => v));

/** One job start to end: → {status: done | failed | refused, stage, pct, refused, error?, result?, tools?, version?}. Never rejects: an exe
 *  that cannot start, crashes, overruns or answers what is not JSON is a failed job in words (its stderr goes to the bridge log). */
export function runDrawing(job, { cwd, exe = exePath(), spawn = nodeSpawn, env = process.env, jobMs = DRAWING_MS,
  log = (l) => console.warn(`[drawing] ${l}`) } = {}) {
  return new Promise((resolve) => {
    let child = null, done = false, size = 0, tail = "", timer;
    const out = [];
    const alive = () => child && child.pid !== undefined && child.exitCode === null && child.signalCode === null;
    const kill = () => { if (alive()) { try { child.kill(); } catch { /* gone */ } } };
    const end = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      process.removeListener("exit", kill);
      kill();
      if (r.status === "failed") log(`${job.job_id}: ${r.error}${tail.trim() ? ` — its stderr ends: ${tail.trim().slice(-1000)}` : ""}`);
      const answer = { refused: [], ...r };
      if (!alive()) return resolve(answer);
      // Settled once the exe is gone (bounded): the job folder is its cwd.
      const t = setTimeout(() => resolve(answer), EXIT_MS);
      child.once("close", () => { clearTimeout(t); resolve(answer); });
    };
    const failed = (error) => end({ status: "failed", stage: "stopped", pct: 0, error });
    timer = setTimeout(() => failed(`the drawing read took longer than ${Math.ceil(jobMs / 60_000)} min — it was stopped; nothing it found was kept`), jobMs);
    try {
      child = spawn(exe, [], { cwd, env: childEnv(env), stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false });
    } catch (e) { return failed(`sentinel-drawing could not start (${e?.code || e?.message})`); }
    process.once("exit", kill);
    child.on("error", (e) => failed(`sentinel-drawing could not start (${e?.code || e?.message}) — SENTINEL_DRAWING_EXE must name sentinel-drawing.exe`));
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (d) => { tail = (tail + d).slice(-TAIL); });
    child.stdout?.on("data", (d) => {
      if (done) return;
      size += d.length;
      if (size > OUT_MAX) return failed(`sentinel-drawing's answer is over ${OUT_MAX / 1024 / 1024} MB — it was stopped; nothing it found was kept`);
      out.push(d);
    });
    // "close", not "exit": its pipes are drained by then — the whole answer is in `out`, the stderr tail is whole.
    child.on("close", (code) => {
      if (done) return;
      if (code !== 0) return failed(`sentinel-drawing stopped (exit ${code}) — see the bridge log; nothing it found was kept`);
      let r = null;
      try { r = JSON.parse(Buffer.concat(out).toString("utf8")); } catch { /* not JSON */ }
      if (!r || !["done", "refused"].includes(r.status)) return failed("sentinel-drawing's answer was not its contract's (status done or refused) — nothing it found was kept");
      end({ status: r.status, stage: "done", pct: 100, refused: Array.isArray(r.refused) ? r.refused : [], tools: Array.isArray(r.tools) ? r.tools : [],
        version: typeof r.version === "string" ? r.version : null, ...(r.status === "done" ? { result: r.result ?? null } : {}) });
    });
    child.stdin?.on("error", () => {}); // an EPIPE once the exe is gone is no error here: its exit says what happened
    child.stdin?.end(JSON.stringify(job));
  });
}
