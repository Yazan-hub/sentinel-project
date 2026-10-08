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
    getAuditEntry: deps.getAuditEntry || (async (k, n) => (await import("./cde-store.mjs")).getAuditEntry(k, n)),
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
    if (!Object.hasOwn(BOUNDS, k)) throw bad(`${k} is not a survey parameter — voxel_mm and storey_min_mm are`);
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
      // A finished status is written once, below, with its result.json, sha256 and row: saved from here, a bridge stopped in between
      // would leave a "done" with no result for ever (readRecord reads only queued and running as failed).
      const status = ["done", "failed", "refused"].includes(p.status) ? "running" : p.status;
      const now = `${status}|${p.stage}|${p.pct}`;
      if (now === last) return;
      last = now;
      // Best effort: a progress save that fails (EPERM from an indexer, ENOSPC) is logged, never the job's error — its words name the path.
      try { save(d, key, Object.assign(job, { status, stage: p.stage, pct: p.pct })); }
      catch (e) { console.warn(`[survey] ${key} ${job.id}: progress not saved — ${e?.code || e?.message}`); }
    } });
  let status = r.status, error = r.error ?? null;
  const result = status === "done" ? r.result : null;
  // A done run with no result (a 200 whose body was not JSON) is checked too: resultRefusal(null) is "no candidates list".
  const bad = status === "done" ? resultRefusal(result, job.items.map((i) => i.id)) : null;
  if (bad) { status = "failed"; error = `sentinel-survey's result is not the contract's shape (${bad}) — nothing it found was kept`; }
  const notRead = new Set((r.refused ?? []).map((x) => x.id));
  if (status === "done") {
    const bytes = Buffer.from(JSON.stringify(result));
    // Final review: a result that cannot be kept (EPERM from an indexer, ENOSPC) fails the run in words that name no path — and the
    // run still gets its build:run row below, so a started job always leaves one.
    try {
      writeAtomic(join(d.root, key, job.id, "result.json"), bytes);
      Object.assign(job, { result_sha256: sha(bytes), candidates_total: result.candidates.length,
        counts: Object.fromEntries(KINDS.map((k) => [k, result.candidates.filter((c) => c.kind === k).length])) });
    } catch (e) {
      status = "failed";
      error = `the result could not be kept on this PC (${e?.code || "the write failed"}) — nothing it found was kept`;
    }
  }
  Object.assign(job, { status, stage: "done", pct: status === "done" ? 100 : job.pct, refused: [...job.refused, ...(r.refused ?? [])],
    read: status === "done" ? job.items.map((i) => i.id).filter((id) => !notRead.has(id)) : [], // what the result was measured from
    reader: { name: READER, version: r.version ?? null }, tools: r.tools ?? [], finished_at: d.now(), ...(error ? { error } : {}) });
  const keep = () => { try { save(d, key, job); } catch (e) { console.warn(`[survey] ${key} ${job.id}: record not saved — ${e?.code || e?.message}`); } };
  keep(); // a record that cannot be saved is logged; the row is still written
  const row = await d.audit(proj.id, "build", null, `build:run ${job.id} · ${READER} ${job.reader.version ?? "(no version)"} · ${status}`,
    job.started_by, null, buildRunValue(job, (status === "done" && result.receipt) || {}));
  job.ledger = { id: row?.id ?? null, hash: row?.hash ?? null };
  keep();
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
 *  must be the job's own: entity_type build, an action that starts `build:run <the id in the path> · sentinel-survey ` and ends `· done`,
 *  new_value.status done and new_value.claimed === false (an open-route receipt is action exactly build:run, claimed true: never), and its
 *  result_sha256 the sha256 of result.json read now. A row is never found by new_value.job_id. The result is held to the contract's shape over
 *  what the row says was read (every evidence ref names a read item), its cids unique. → {job, row: {ledger, reader, version, pack_id, items, read, result_sha256}, result},
 *  or a 400/404/409 in words. The caller checks the role (proposeFromJob: a signed-in lead). */
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
  if (!row || row.entity_type !== "build" || !String(row.action).startsWith(`build:run ${id} · ${READER} `) || !String(row.action).endsWith(" · done")
    || v.status !== "done" || v.claimed !== false || typeof v.result_sha256 !== "string")
    throw untrusted(`ledger #${rowId} is not ${id}'s own build:run row (the bridge's: build:run ${id} · ${READER} … · done, claimed false)`);
  let bytes;
  try { bytes = readFileSync(join(dir, "result.json")); } catch { throw untrusted("its result.json is missing"); }
  if (sha(bytes) !== v.result_sha256) throw untrusted(`its result.json does not hash to the sha256 on ledger #${rowId} — it changed after the job`);
  const result = JSON.parse(bytes);
  const items = Array.isArray(v.items) ? v.items : [], read = Array.isArray(v.read) ? v.read : [];
  const bad = resultRefusal(result, read);
  if (bad) throw untrusted(`its result is not the contract's shape over what ledger #${rowId} says was read (${bad})`);
  // Each element's trust record is bound to it by cid (survey-plan byCid): one cid twice would carry a measurement onto other geometry.
  const cids = result.candidates.map((c) => c.cid);
  if (new Set(cids).size !== cids.length) throw untrusted("its result names one cid twice");
  // The pack is the ROW's (buildRunValue writes pack_id), never job.json's: the hash-chained row is the anchor.
  return { job, row: { ledger: { id: row.id, hash: row.hash ?? null }, reader: v.reader ?? READER, version: v.version ?? null, pack_id: v.pack_id ?? null,
    items, read, result_sha256: v.result_sha256 }, result };
}
