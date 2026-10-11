// MA-4c — survey jobs (design §6.8, §6.9, §6.11; plan docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md): the work of
// POST/GET /cde/:key/build/jobs. A signed-in contributor of an office project starts sentinel-survey on the admitted scans of the pack in
// force (LAS, LAZ, E57 — MA-4g; every other scan is listed in `refused`, with why); one job runs at a time on this bridge. A job is a folder,
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
/** MA-5a-3: the second reader — sentinel-drawing (drawing/, .NET with PdfPig) on the admitted vector PDF plans; drawing-service.mjs runs it.
 *  Its candidates are walls and doors in paper millimetres (units "paper_mm"): proposed with a 2-point alignment, MA-5a-4. */
export const DRAWING = "sentinel-drawing";
export const READERS = [READER, DRAWING];
const DRAWING_KINDS = ["wall", "door", "room"]; // MA-5b-1: room labels
export const DEFAULT_PARAMS = { voxel_mm: 20, storey_min_mm: 2000 };
// [low, high, why]: a coarser voxel leaves a wall face too sparse for the survey's 20 mm cells (4 of the drill's 8 walls lost their
// thickness at 200 mm, measured) — the service bounds it the same way (read_job).
const BOUNDS = { voxel_mm: [5, 50, " (a wall face needs a point at least every 50 mm)"], storey_min_mm: [1500, 6000, ""] };
const FIELDS = ["pack", "readers", "params"]; // a body's whole vocabulary: the rest is the bridge's
export const TOLERANCES_MM = [20, 50, 100, 200]; // the contract's (§6.9); deviation reads them from MA-4e; MA-5a-2: 20 is the per-face verdict's (survey-plan DEVIATION_MM) — the band stays 2 x 200
/** The bridge's seed, never a body's: the same evidence and parameters give the same candidates (§6.9). */
export const SEED = 1;
const KINDS = ["level", "wall", "floor", "ceiling", "door", "window"]; // MA-5a: sentinel-survey 0.5.0 proposes doors and windows on its walls
/** MA-5a (review): the kinds a reader of `version` looks for — before 0.5.0 no door or window, so its job's counts name none (the web's found
 *  list leaves out a kind its counts lack, never "0 door(s)" from a job that never looked). */
const kindsOf = (version) => { const [a, b] = String(version ?? "").split(".").map(Number); return a > 0 || b >= 5 ? KINDS : KINDS.slice(0, 4); };
// review (MA-5b-1): sentinel-drawing reads rooms from 0.2.0 — never "0 room(s)" from a reader that never looked
const drawingKindsOf = (version) => { const [a, b] = String(version ?? "").split(".").map(Number); return a > 0 || b >= 2 ? DRAWING_KINDS : DRAWING_KINDS.slice(0, 2); };
const MAX_CANDIDATES = 5000;
const LISTED = 20;
const JOB_ID = /^job-\d{4,}$/; // job-10000 follows job-9999 (nextId pads to 4, never cuts)
const byNewest = (a, b) => Number(b.slice(4)) - Number(a.slice(4));
// ponytail: one survey at a time for the whole bridge (the office PC's CPU is the scarce thing); a queue when one PC serves two offices.
// One bridge per jobs folder: a second bridge on this PC (a drill copy) reads the other's running job as stopped.
let running = null; // {key, id, done, what?} — MA-4e: a measure holds it too (id null, what "a measure")
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
  const drw = deps.runDrawing && deps.notSetUpDrawing ? null : await import("./drawing-service.mjs");
  return {
    surveyStart: deps.surveyStart || surveyStart,
    requireMinRole: deps.requireMinRole || members.requireMinRole,
    audit: deps.audit || cde.audit,
    getAuditEntry: deps.getAuditEntry || (async (k, n) => (await import("./cde-store.mjs")).getAuditEntry(k, n)),
    runSurvey: deps.runSurvey || svc.runSurvey,
    notSetUp: deps.notSetUp || svc.notSetUp,
    runDrawing: deps.runDrawing || drw.runDrawing,
    notSetUpDrawing: deps.notSetUpDrawing || drw.notSetUp,
    root: deps.jobsRoot ?? jobsRoot(),
    now: deps.now || (() => new Date().toISOString()),
  };
}

/** POST's body → {pack, reader, params}, or a 400 in words. The web sends {pack} (a survey) or {pack, readers: ["sentinel-drawing"]}
 *  (MA-5a-3); readers and params default. Any other key is refused, never dropped: the items, the seed and who started it are the
 *  bridge's, and a caller who sent them must not think it chose them. sentinel-drawing takes no parameter. */
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
  if (!Array.isArray(readers) || readers.length !== 1 || !READERS.includes(readers[0])) throw bad(`readers must be ["${READER}"] or ["${DRAWING}"] — one reader a job (or leave it out: ${READER})`);
  const reader = readers[0];
  const p = b.params ?? {};
  if (reader === DRAWING) {
    if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).length) throw bad(`${DRAWING} takes no parameter — send {pack, readers: ["${DRAWING}"]}`);
    return { pack: b.pack.trim(), reader, params: {} };
  }
  if (!p || typeof p !== "object" || Array.isArray(p)) throw bad("params must be an object {voxel_mm?, storey_min_mm?}");
  const params = { ...DEFAULT_PARAMS };
  for (const [k, v] of Object.entries(p)) {
    if (k === "snap_mm") throw bad(D16);
    if (!Object.hasOwn(BOUNDS, k)) throw bad(`${k} is not a survey parameter — voxel_mm and storey_min_mm are`);
    const [lo, hi, why] = BOUNDS[k];
    if (!Number.isInteger(v) || v < lo || v > hi) throw bad(`params.${k} must be a whole number of millimetres from ${lo} to ${hi}${why}`);
    params[k] = v;
  }
  return { pack: b.pack.trim(), reader, params };
}

/** The pack's scans: every surveyable one, sent to sentinel-survey (absolute paths, checked inside the evidence folder; MA-4g: LAS, LAZ and
 *  E57 alike — the service picks the reader from the bytes and refuses what it cannot, in words), and every other scan with why. Photos
 *  and drawings are not scans and are not listed. MA-5a-3, `reader` sentinel-drawing: the pack's drawings instead — a PDF is sent; a DWG or
 *  DXF is Ghost Builder's (it reads one in Revit), a PNG or JPG a raster plan (C10) — each listed with why. */
export function pickItems(pack, dir, reader = READER) {
  const take = [], refused = [];
  const kind = reader === DRAWING ? "drawing" : "scan";
  for (const i of pack.items.filter((x) => x.kind === kind)) {
    const why = i.state === "changed" ? "changed since admitted (Re-check flagged it) — admit the same bytes again"
      : kind === "drawing" && ["dwg", "dxf"].includes(i.format) ? `a .${i.format} is read by Ghost Builder in Revit (Model from Drawings) — ${DRAWING} reads PDF`
      : kind === "drawing" && i.format !== "pdf" ? `a .${i.format} drawing is raster — out of scope (C10); ${DRAWING} reads vector PDF`
      : kind === "scan" && !i.surveyable ? `not surveyable (a .${i.format})`
      : i.allowed_uses?.geometry_extraction !== true ? "its allowed uses exclude geometry extraction"
      : null;
    if (why) { refused.push({ id: i.id, reason: why }); continue; }
    try { take.push({ id: i.id, kind, path: insideFolder(dir, i.path), sha256: i.sha256, rel: i.path }); }
    catch (e) { if (e.status !== 400) throw e; refused.push({ id: i.id, reason: "not inside the evidence folder any more (a link or junction) — Re-check flags it" }); }
  }
  return { take, refused };
}

/** null when `r` has the contract's shape (§6.9: candidates without a type, each naming items of this job), else what is wrong — the
 *  bridge keeps nothing it could not read back. MA-5a-3: a drawing job's are walls and doors, each in paper millimetres; MA-5b-1: and rooms. */
export function resultRefusal(r, ids, reader = READER) {
  if (!r || typeof r !== "object" || !Array.isArray(r.candidates)) return "no candidates list";
  if (r.candidates.length > MAX_CANDIDATES) return `over ${MAX_CANDIDATES} candidates`;
  for (const [n, c] of r.candidates.entries()) {
    const at = `candidates[${n}]`;
    if (!c || typeof c !== "object") return at;
    if (typeof c.cid !== "string" || !/^[^\u0000-\u001f]{1,256}$/.test(c.cid)) return `${at}.cid`;
    if (!(reader === DRAWING ? DRAWING_KINDS : KINDS).includes(c.kind)) return `${at}.kind`;
    if (!c.geometry || typeof c.geometry !== "object") return `${at}.geometry`;
    if (reader === DRAWING && c.geometry.units !== "paper_mm") return `${at}.geometry.units (a drawing's candidates are in paper_mm)`;
    if ("type" in c || "TypeName" in c.geometry) return `${at} carries a type (the service does no typing)`;
    if (!c.measured || typeof c.measured !== "object" || !Object.values(c.measured).every(Number.isFinite)) return `${at}.measured`;
    // MA-5b-1: a room's name becomes its name in Revit — one line each, bounded; the walls round it name this result's walls
    if (c.kind === "room") {
      const g = c.geometry, line = (x, max) => typeof x === "string" && x.trim() !== "" && x.length <= max && !/[\u0000-\u001f]/.test(x);
      if (!Array.isArray(g.Location) || g.Location.length !== 2 || !g.Location.every(Number.isFinite)) return `${at}.geometry.Location`;
      if (!line(g.name, 256)) return `${at}.geometry.name`;
      if (g.number !== undefined && !line(g.number, 16)) return `${at}.geometry.number`;
      if (!Array.isArray(g.walls) || g.walls.length > 4 || !g.walls.every((w) => line(w, 256))) return `${at}.geometry.walls`;
      if (g.also !== undefined && (!Array.isArray(g.also) || g.also.length > 8 || !g.also.every((w) => line(w, 256)))) return `${at}.geometry.also`;
    }
    if (!Array.isArray(c.evidence) || !c.evidence.length || !c.evidence.every((e) => typeof e === "string" && ids.includes(e.split("#")[0]))) return `${at}.evidence`;
  }
  if (!Array.isArray(r.derived) || !r.receipt || typeof r.receipt !== "object") return "derived or receipt";
  return null;
}

/** MA-4d decision 4, shared with MA-4e's measure: every item the job read is still the bytes it read — in the pack the ROW names (never
 *  job.json's), not flagged changed, with the sha on its row. → [{id, sha256}], or a 409 in words. Pure. */
export function stillAdmitted(row, pack, id) {
  return row.read.map((rid) => {
    const sent = row.items.find((i) => i.id === rid), now = pack.items.find((i) => i.id === rid);
    const why = !sent ? "its row lists it as read but not as sent" : !now ? "it is no longer in the pack" : now.state === "changed" ? "Re-check flagged it changed"
      : now.sha256 !== sent.sha256 ? "its sha256 in the pack is not the one the job read" : null;
    if (why) throw err(409, `${rid} is not the bytes ${id} read (${why}) — ${row.reader === DRAWING ? "read the admitted drawing" : "survey the admitted scan"} again; nothing was saved`);
    return { id: rid, sha256: sent.sha256 };
  });
}

/** The build:run row's new_value (design §6.6): what ran, on which bytes, with which tools and licences, what it found — never the
 *  candidates themselves (they stay in result.json; its sha256 is here). claimed: false — the bridge ran it (the add-in's receipts are
 *  claimed: true, and the open route can write no other build: row). */
export function buildRunValue(job, receipt) {
  const ms = Date.parse(job.finished_at) - Date.parse(job.started_at);
  return {
    job_id: job.id, reader: job.reader.name, version: job.reader.version, status: job.status, pack_id: job.pack_id, pack_version: job.pack_version,
    items: job.items.map(({ id, sha256 }) => ({ id, sha256 })), read: job.read ?? [], refused: job.refused, tools: job.tools, params: job.params, seed: job.seed,
    started: receipt.started ?? job.started_at, finished: receipt.finished ?? job.finished_at, minutes: Number.isFinite(ms) ? Math.round(ms / 600) / 100 : null,
    cpu_s: receipt.cpu_s ?? null, points_in: receipt.points_in ?? null, points_used: receipt.points_used ?? null,
    model_calls: 0, tokens: 0, candidates: job.counts ?? null,
    gaps: null, // typing — and so gaps — is MA-4d's
    result_sha256: job.result_sha256 ?? null, claimed: false, ...(job.error ? { error: job.error } : {}), ...(job.notes ? { notes: job.notes } : {}),
  };
}

/** POST /cde/:key/build/jobs {pack, readers?, params?} → 202 {job}. Refusals before anything is written, in this order: 400 (the body),
 *  403 (the machine credential; below contributor; a project of no office), 400 (an office row), 429, 404 (not the pack in force), 409
 *  (no scan sentinel-survey is sent — each with why), 503 (sentinel-survey not set up here), 409 (a job running on this bridge). Then the job's
 *  folder and record; the run goes on after the answer (GET shows it). */
export async function startJob(key, b = {}, deps = {}) {
  const d = await wire(deps);
  const body = readStartBody(b);
  const drawing = body.reader === DRAWING;
  const { proj, pack, version, dir } = await d.surveyStart(key, body.pack);
  const { take, refused } = pickItems(pack, dir, body.reader);
  if (!take.length) {
    const listed = refused.length ? ` — ${refused.map((x) => `${x.id}: ${x.reason}`).join("; ")}` : null;
    throw err(409, drawing
      ? `no admitted drawing in ${body.pack} that ${DRAWING} reads${listed ?? " — admit a vector .pdf plan under Evidence first (a drawing answers an Ask the owner request)"}; nothing was saved`
      : `no admitted scan in ${body.pack} that sentinel-survey reads${listed ?? " — admit a .las, .laz or .e57 under Evidence first"}; nothing was saved`);
  }
  const notSet = drawing ? d.notSetUpDrawing() : d.notSetUp();
  if (notSet) throw err(503, notSet);
  // One slot for both readers and MA-4e's measure: the office PC's CPU is the scarce thing.
  if (running) throw err(409, `${running.what ?? "a survey job"} is already running on this bridge (one at a time) — try again when it ends; nothing was saved`);
  const root = projectDir(d.root, key);
  mkdirSync(root, { recursive: true });
  const id = nextId("job", readdirSync(root).filter((n) => JOB_ID.test(n)).map((n) => ({ id: n })));
  try { mkdirSync(join(root, id)); } // not recursive: a second bridge on this PC cannot take the same id
  catch (e) { if (e.code === "EEXIST") throw err(409, `${id} was just taken by another bridge on this PC — try again; nothing was saved`); throw e; }
  const job = {
    id, project: key, pack_id: body.pack, pack_version: version, reader: { name: body.reader, version: null }, status: "queued", stage: "queued", pct: 0,
    items: take.map((t) => ({ id: t.id, path: t.rel, sha256: t.sha256 })), refused, params: body.params, seed: SEED,
    started_by: resolveActor(null, "machine"), started_at: d.now(),
  };
  save(d, key, job);
  const answer = { job: { ...job } };
  running = { key, id, ...(drawing ? { what: "a drawing job" } : {}) };
  running.done = runJob(d, proj, key, job, take)
    .catch((e) => console.error(`${drawing ? "[drawing]" : "[survey]"} ${key} ${id}: its record was not finished — ${e?.message || e}`)) // never an unhandled rejection
    .finally(() => { running = null; });
  return answer;
}

async function runJob(d, proj, key, job, take) {
  let last = "";
  const name = job.reader.name, tag = name === DRAWING ? "[drawing]" : "[survey]";
  const items = take.map(({ id, kind, path, sha256 }) => ({ id, kind, path, sha256 }));
  const r = name === DRAWING
    // One-shot, no progress: the worker answers once (drawing-service.mjs).
    ? await d.runDrawing({ job_id: job.id, items, params: {}, seed: job.seed }, { cwd: join(d.root, key, job.id) })
    : await d.runSurvey(
    { job_id: job.id, items, params: { ...job.params, tolerances_mm: TOLERANCES_MM }, seed: job.seed },
    { cwd: join(d.root, key, job.id), onProgress: (p) => {
      // A finished status is written once, below, with its result.json, sha256 and row: saved from here, a bridge stopped in between
      // would leave a "done" with no result for ever (readRecord reads only queued and running as failed).
      const status = ["done", "failed", "refused"].includes(p.status) ? "running" : p.status;
      const now = `${status}|${p.stage}|${p.pct}`;
      if (now === last) return;
      last = now;
      // Best effort: a progress save that fails (EPERM from an indexer, ENOSPC) is logged, never the job's error — its words name the path.
      try { save(d, key, Object.assign(job, { status, stage: p.stage, pct: p.pct })); }
      catch (e) { console.warn(`${tag} ${key} ${job.id}: progress not saved — ${e?.code || e?.message}`); }
    } });
  let status = r.status, error = r.error ?? null;
  const result = status === "done" ? r.result : null;
  // A done run with no result (a 200 whose body was not JSON) is checked too: resultRefusal(null) is "no candidates list".
  const bad = status === "done" ? resultRefusal(result, job.items.map((i) => i.id), name) : null;
  if (bad) { status = "failed"; error = `${name}'s result is not the contract's shape (${bad}) — nothing it found was kept`; }
  const notRead = new Set((r.refused ?? []).map((x) => x.id));
  if (status === "done") {
    const bytes = Buffer.from(JSON.stringify(result));
    // Final review: a result that cannot be kept (EPERM from an indexer, ENOSPC) fails the run in words that name no path — and the
    // run still gets its build:run row below, so a started job always leaves one.
    try {
      writeAtomic(join(d.root, key, job.id, "result.json"), bytes);
      // MA-5a-3 (review): a drawing the worker read but found nothing on says why (one weight, nothing drawn) — on the record and the
      // row, so the lead sees it without opening a result that has no candidate.
      const notes = name === DRAWING && Array.isArray(result.receipt?.items)
        ? result.receipt.items.filter((i) => typeof i?.why === "string").map((i) => ({ id: String(i.id), why: i.why.slice(0, 300) })) : [];
      if (notes.length) job.notes = notes;
      Object.assign(job, { result_sha256: sha(bytes), candidates_total: result.candidates.length,
        counts: Object.fromEntries((name === DRAWING ? drawingKindsOf(r.version) : kindsOf(r.version)).map((k) => [k, result.candidates.filter((c) => c.kind === k).length])) });
    } catch (e) {
      status = "failed";
      error = `the result could not be kept on this PC (${e?.code || "the write failed"}) — nothing it found was kept`;
    }
  }
  Object.assign(job, { status, stage: "done", pct: status === "done" ? 100 : job.pct, refused: [...job.refused, ...(r.refused ?? [])],
    read: status === "done" ? job.items.map((i) => i.id).filter((id) => !notRead.has(id)) : [], // what the result was measured from
    reader: { name, version: r.version ?? null }, tools: r.tools ?? [], finished_at: d.now(), ...(error ? { error } : {}) });
  const keep = () => { try { save(d, key, job); } catch (e) { console.warn(`${tag} ${key} ${job.id}: record not saved — ${e?.code || e?.message}`); } };
  keep(); // a record that cannot be saved is logged; the row is still written
  const row = await d.audit(proj.id, "build", null, `build:run ${job.id} · ${name} ${job.reader.version ?? "(no version)"} · ${status}`,
    job.started_by, null, buildRunValue(job, (status === "done" && result.receipt) || {}));
  job.ledger = { id: row?.id ?? null, hash: row?.hash ?? null };
  keep();
  console.log(`${tag} ${key} ${job.id}: ${status}${job.counts ? ` — ${job.candidates_total} candidate(s)` : ""} · ledger #${job.ledger.id}`);
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
 *  courtesy check only; MA-4d's trust check is `trustedJob`, against the build:run row. Any member. */
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

/** MA-4d (MA-4c decision 11): a done survey job whose result the bridge may build changesets from — anchored on the hash-chained row, never on
 *  job.json alone (editable on the PC). The row is the one job.ledger.id names, read for THIS project (getAuditEntry is scoped to the key), and
 *  must be the job's own: entity_type build, an action that starts `build:run <the id in the path> · <a reader> ` and ends `· done` (MA-5a-3:
 *  sentinel-survey or sentinel-drawing — the row says which, never job.json; its new_value.reader the same),
 *  new_value.status done and new_value.claimed === false (an open-route receipt is action exactly build:run, claimed true: never), and its
 *  result_sha256 the sha256 of result.json read now. A row is never found by new_value.job_id. The result is held to the contract's shape over
 *  what the row says was read (every evidence ref names a read item), its cids unique. → {job, row: {ledger, reader, version, pack_id, items, read, result_sha256,
 *  params, seed}, result}, or a 400/404/409 in words. The caller checks the role (proposeFromJob: a signed-in lead). MA-4e: and the row's params
 *  and seed (null when absent) — a measure reads the job's cloud again from the anchored row. */
export async function trustedJob(key, id, deps = {}) {
  const d = await wire(deps);
  if (!JOB_ID.test(String(id))) throw err(400, "a survey job is named job-NNNN — nothing was saved");
  const dir = join(projectDir(d.root, key), id);
  const job = readRecord(dir, key, id);
  if (!job) throw err(404, `no survey job ${id} on ${key} — nothing was saved`);
  if (job.status !== "done") throw err(409, `${id} is ${job.status} — only a done survey job is proposed; nothing was saved`);
  const untrusted = (why) => err(409, `${id}'s result is not trusted: ${why} — run the survey again; nothing was saved`);
  const rowId = job.ledger?.id;
  if (!Number.isInteger(rowId)) throw untrusted("its build:run row was never written (the ledger write failed when it ran)");
  const row = await d.getAuditEntry(key, rowId);
  const v = row?.new_value ?? {};
  const reader = READERS.find((n) => String(row?.action).startsWith(`build:run ${id} · ${n} `));
  if (!row || !reader || row.entity_type !== "build" || !String(row.action).endsWith(" · done") || (v.reader ?? READER) !== reader
    || v.status !== "done" || v.claimed !== false || typeof v.result_sha256 !== "string")
    throw untrusted(`ledger #${rowId} is not ${id}'s own build:run row (the bridge's: build:run ${id} · ${READER} or ${DRAWING} … · done, claimed false)`);
  let bytes;
  try { bytes = readFileSync(join(dir, "result.json")); } catch { throw untrusted("its result.json is missing"); }
  if (sha(bytes) !== v.result_sha256) throw untrusted(`its result.json does not hash to the sha256 on ledger #${rowId} — it changed after the job`);
  const result = JSON.parse(bytes);
  const items = Array.isArray(v.items) ? v.items : [], read = Array.isArray(v.read) ? v.read : [];
  const bad = resultRefusal(result, read, reader);
  if (bad) throw untrusted(`its result is not the contract's shape over what ledger #${rowId} says was read (${bad})`);
  // Each element's trust record is bound to it by cid (survey-plan byCid): one cid twice would carry a measurement onto other geometry.
  const cids = result.candidates.map((c) => c.cid);
  if (new Set(cids).size !== cids.length) throw untrusted("its result names one cid twice");
  // The pack is the ROW's (buildRunValue writes pack_id), never job.json's: the hash-chained row is the anchor.
  return { job, row: { ledger: { id: row.id, hash: row.hash ?? null }, reader, version: v.version ?? null, pack_id: v.pack_id ?? null,
    items, read, result_sha256: v.result_sha256, params: v.params ?? null, seed: Number.isInteger(v.seed) ? v.seed : null }, result };
}

/** MA-4e: one measure (sentinel-survey's POST /measure, polled and read as a job) on the bridge's one survey slot — the `running` lock, so a
 *  measure and a survey job never share the PC's CPU; the service started for it and stopped after (runSurvey). `jobId`: the job whose folder
 *  is its cwd (the service writes nothing there). → runSurvey's record (it never rejects once started); before the start a 503 (not set up) or
 *  a 409 (a job or a measure running), each ending "nothing was saved". The caller (changesets-store verifyChangeset) checks the person, the
 *  changeset and the bytes, and writes the row.
 *  ponytail: a cold process per measure (start-up ~1 s beside two hashes and a read of the scan; MA-4c decision 3 kept) — MA-4h,
 *  Kladno: a verify ~41 s, an overlay ~21 s; a warm service with a cloud cache keyed on (the items' shas, voxel, seed) when verify runs per Apply in bulk.
 *  MA-4f: the scan overlay runs here too ({path: "/cloud", what: "a scan overlay"}). */
export async function measureJob(key, jobId, payload, deps = {}, { path = "/measure", what = "a measure" } = {}) {
  const d = await wire(deps);
  const notSet = d.notSetUp();
  if (notSet) throw err(503, notSet);
  if (running) throw err(409, `${running.what ?? "a survey job"} is already running on this bridge (one at a time) — try again when it ends; nothing was saved`);
  let release;
  running = { key, id: null, what, done: new Promise((r) => { release = r; }) }; // checked and taken with no await between
  try { return await d.runSurvey(payload, { cwd: join(projectDir(d.root, key), jobId), path }); }
  finally { running = null; release(); }
}
