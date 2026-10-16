// MA-7-7 — the photo bytes of an evidence pack (D-7-6): the one module that runs the blur tool and streams a photo's bytes. evidence-store.mjs stays
// byte-free (its test (h)); this one has its own offline pin (photo-store.test.mjs (x)): no fetch, no upload, no remote module, bytes only by
// pipeline(createReadStream(...), res), and no wildcard CORS header (the F11 rule — a plain <img> needs no CORS header, and the app's
// own origin is served by corsHeaders' reflection, which the caller passes in).
import { execFile } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath } from "node:url";
import { pythonPath } from "./survey-service.mjs";

export const BLUR_SCRIPT = fileURLToPath(new URL("../../survey/blur.py", import.meta.url));
export const BLUR_MS = 60_000; // one photo: Pillow reads, fills and re-encodes it in a second or two; this only bounds a stuck child

/** Why the blur tool cannot run on this PC (a 503's words), or null. */
export function blurNotSetUp({ python = pythonPath(), script = BLUR_SCRIPT } = {}) {
  if (!isAbsolute(python)) return "the blur tool is not set up on this PC: SENTINEL_PYTHON must be the absolute path of a python.exe — nothing was saved";
  if (!existsSync(python)) return "the blur tool is not set up on this PC: no Python where SENTINEL_PYTHON in config/.env points (C:\\Python314\\python.exe by default) — nothing was saved";
  if (!existsSync(script)) return "the blur tool is not set up on this PC: survey/blur.py is missing from the bridge's checkout — nothing was saved";
  return null;
}

/** Run sentinel-blur (survey/blur.py) on `src`, writing `dst` (`shown`: {w, h} the marker showed, or undefined); → its answer {width, height, areas, version, tools}. The child gets an allow-listed
 *  environment (config/.env is merged into process.env — a plain spawn would hand it every secret), no shell, no network use, and is killed at
 *  BLUR_MS. A 422 in words when the file is not an image; a 503 when the tool is not set up; the child's stderr goes to the log only. */
export function runBlur(src, dst, boxes, shown, { python = pythonPath(), script = BLUR_SCRIPT, env = process.env, execFileFn = execFile, ms = BLUR_MS } = {}) {
  const off = blurNotSetUp({ python, script });
  if (off) return Promise.reject(Object.assign(new Error(off), { status: 503 }));
  const childEnv = Object.fromEntries(Object.entries({ SYSTEMROOT: env.SYSTEMROOT ?? env.SystemRoot, APPDATA: env.APPDATA, TEMP: env.TEMP, TMP: env.TMP }).filter(([, v]) => v));
  return new Promise((ok, no) => {
    execFileFn(python, ["-B", script, src, dst, JSON.stringify(boxes), ...(shown ? [`${shown.w}x${shown.h}`] : [])], { env: childEnv, timeout: ms, windowsHide: true, maxBuffer: 64 * 1024 }, (e, stdout, stderr) => {
      let r = null;
      try { r = JSON.parse(String(stdout).trim().split("\n").pop()); } catch { /* not JSON: the tool died */ }
      if (r?.ok) return ok(r);
      if (r && r.ok === false) return no(Object.assign(new Error(`this photo could not be blurred (${String(r.error).slice(0, 160)}) — nothing was saved`), { status: 422 }));
      if (stderr) console.warn(`[blur] ${String(stderr).trim().slice(-600)}`);
      no(Object.assign(new Error(e?.killed ? "the blur tool took too long and was stopped — nothing was saved" : "the blur tool failed — nothing was saved"), { status: 500 }));
    });
  });
}

/** MA-7-16: ask sentinel-blur (`--detect`) for face boxes in `src`; → {width, height, faces: [{x, y, w, h, score}], source_sha256, method: "detector+person", version, tools}. A proposal only:
 *  nothing is written, and the person confirms, removes and adds boxes (plates are theirs) before runBlur. The model is found by path (USERPROFILE is handed to the child for that,
 *  nothing else) and checked by sha256 inside the tool; a 503 in words when it is missing or not the approved file, so the person marks by hand. */
export function runDetect(src, { python = pythonPath(), script = BLUR_SCRIPT, env = process.env, execFileFn = execFile, ms = BLUR_MS } = {}) {
  const off = blurNotSetUp({ python, script });
  if (off) return Promise.reject(Object.assign(new Error(off.replace("the blur tool", "the face detector").replace("nothing was saved", "nothing was proposed; mark the faces by hand")), { status: 503 }));
  const childEnv = Object.fromEntries(Object.entries({ SYSTEMROOT: env.SYSTEMROOT ?? env.SystemRoot, APPDATA: env.APPDATA, TEMP: env.TEMP, TMP: env.TMP, USERPROFILE: env.USERPROFILE }).filter(([, v]) => v));
  return new Promise((ok, no) => {
    execFileFn(python, ["-B", script, "--detect", src], { env: childEnv, timeout: ms, windowsHide: true, maxBuffer: 256 * 1024 }, (e, stdout, stderr) => {
      let r = null;
      try { r = JSON.parse(String(stdout).trim().split("\n").pop()); } catch { /* not JSON: the tool died */ }
      if (r?.ok && Array.isArray(r.faces)) return ok(r);
      if (r && r.ok === false) return no(Object.assign(new Error(String(r.error).replace(/^ValueError: /, "").slice(0, 160)), { status: /not set up|approved/.test(String(r.error)) ? 503 : 422 }));
      if (stderr) console.warn(`[blur --detect] ${String(stderr).trim().slice(-600)}`);
      no(Object.assign(new Error(e?.killed ? "the face detector took too long and was stopped — nothing was proposed" : "the face detector failed — nothing was proposed"), { status: 500 }));
    });
  });
}

export const OPENINGS_SCRIPT = fileURLToPath(new URL("../../photo/openings.py", import.meta.url));
export const OPENINGS_MS = 300_000; // two models load from disk (R29, offline) and run on one photo; this only bounds a stuck child

/** MA-7-20: run photo/openings.py --judge on a job file (one job or a list); → its answer ({verdicts, unmatched} or {answers: [{evidence, verdicts, unmatched}]}, tools, version). ADVICE: the caller records it, nothing here changes a ghost. The child gets an
 *  allow-listed environment (no config/.env secrets): the photo-lib on PYTHONPATH, USERPROFILE for the local model folders, and the offline switches (R29) set here as well as in the script. */
export function runJudge(jobFile, { python = pythonPath(), script = OPENINGS_SCRIPT, env = process.env, execFileFn = execFile, ms = OPENINGS_MS } = {}) {
  if (!isAbsolute(python) || !existsSync(python) || !existsSync(script)) return Promise.reject(Object.assign(new Error("the openings tool is not set up on this PC (Python 3.14 with the photo-lib, photo/openings.py) — nothing was advised"), { status: 503 }));
  const lib = env.APPDATA ? `${env.APPDATA}\\Sentinel\\photo-lib` : undefined;
  const childEnv = Object.fromEntries(Object.entries({ SYSTEMROOT: env.SYSTEMROOT ?? env.SystemRoot, APPDATA: env.APPDATA, TEMP: env.TEMP, TMP: env.TMP, USERPROFILE: env.USERPROFILE,
    SENTINEL_MA7_MODELS: env.SENTINEL_MA7_MODELS, PYTHONPATH: lib, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" }).filter(([, v]) => v));
  return new Promise((ok, no) => {
    execFileFn(python, ["-B", script, "--judge", jobFile], { env: childEnv, timeout: ms, windowsHide: true, maxBuffer: 1024 * 1024 }, (e, stdout, stderr) => {
      let r = null;
      try { r = JSON.parse(String(stdout).trim().split("\n").pop()); } catch { /* not JSON: the tool died */ }
      if (r?.ok && (Array.isArray(r.verdicts) || Array.isArray(r.answers))) return ok(r);
      if (r && r.ok === false) return no(Object.assign(new Error(String(r.error).slice(0, 160)), { status: /not set up|approved|sha256/.test(String(r.error)) ? 503 : 422 }));
      if (stderr) console.warn(`[openings --judge] ${String(stderr).trim().slice(-600)}`);
      no(Object.assign(new Error(e?.killed ? "the openings tool took too long and was stopped — nothing was advised" : "the openings tool failed — nothing was advised"), { status: 500 }));
    });
  });
}

/** Stream `file` as `type`. `headers`: the caller's Cache-Control and its corsHeaders(res). */
export function sendBytes(res, file, type, headers = {}) {
  res.writeHead(200, { "Content-Type": type, "Content-Length": statSync(file).size, "X-Content-Type-Options": "nosniff", ...headers });
  return pipeline(createReadStream(file), res, () => {});
}
