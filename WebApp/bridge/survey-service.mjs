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
// ponytail: one wall-clock bound for every job — MA-4h, Kladno (250.5 M points): 157 s in memory, 216 s live (0.3.0: 181 s live); set it by point count when a scan nears it.
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

/** The child's whole environment: what Windows needs, APPDATA (numpy is in the user site, %APPDATA%\Python; MA-4g's wheels in %APPDATA%\Sentinel\survey-lib, las.LIB), the temp folders, the token. */
export const childEnv = (env, token) => Object.fromEntries(Object.entries({
  SYSTEMROOT: env.SYSTEMROOT ?? env.SystemRoot, APPDATA: env.APPDATA, TEMP: env.TEMP, TMP: env.TMP, SENTINEL_SURVEY_TOKEN: token,
}).filter(([, v]) => v));

/** One job — or (MA-4e) one measure, `path: "/measure"`, polled and read as a job — start to end: → {status: done | failed | refused,
 *  stage, pct, refused, error?, result?, tools?, version?}. Never rejects: a service that cannot start, stops, overruns or answers wrongly
 *  is a failed job in words (its stderr goes to the bridge log). */
export function runSurvey(job, { cwd, path = "/jobs", onProgress = () => {}, python = pythonPath(), script = SCRIPT, spawn = nodeSpawn, fetch = globalThis.fetch,
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
      child.once("close", () => { clearTimeout(t); resolve(out); });
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
        await call("POST", path, job);
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
    // "close", not "exit": its pipes are drained by then, so the stderr tail end() logs holds the traceback that says why.
    child.on("close", (code) => failed(port === null
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
