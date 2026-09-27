// Sentinel BCF Sync — minimal OpenCDE BCF-API 3.0 service (zero dependencies).
// The store the web viewer POSTs topics/viewpoints to, and the Revit plugin's BcfSyncManager
// GETs from. JSON-file persistence (%APPDATA%\Sentinel\bcf-store.json). Dev-grade: single project
// store, permissive CORS, optional bearer. Swap the file store for Postgres (Module 2) for prod.
//
// Run:  node bridge/bcf-service.mjs        (listens on :4100, override with BCF_PORT)
//
// Endpoints (subset of BCF-API 3.0):
//   GET    /bcf/3.0/projects/:pid/topics?status=&model=       list topics (with viewpoints)
//   POST   /bcf/3.0/projects/:pid/topics                      create topic  { title, topic_type, model, ... }
//   PUT    /bcf/3.0/projects/:pid/topics/:guid                update       { topic_status }
//   POST   /bcf/3.0/projects/:pid/topics/:guid/comments       add comment  { comment, author, viewpoint_guid }
//   POST   /bcf/3.0/projects/:pid/topics/:guid/viewpoints     add viewpoint { perspective_camera, components, ... }

import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, statSync, existsSync, createReadStream } from "node:fs";
import { join, dirname, basename, extname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { pipeline } from "node:stream";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { runWithAuth, resolveActor, currentSub, currentUserToken } from "./bridge-auth.mjs";
import { loadEnv } from "./load-env.mjs";
import { verifyJwt, initJwks } from "./verify-jwt.mjs";
import { corsOrigin } from "./cors-origin.mjs";
import { isPublicRoute, parsePublicVerify, comparePublic, createLimiter, createKeyedLimiter, clientAddress, callerKey, readCapped } from "./public-verify.mjs";
import { readBody, readRaw, holdUpload, SMALL_JSON, startRefusal, SERVER_LIMITS } from "./request-limits.mjs";

// config/.env is NOT loaded into process.env by Node — merge it here (before any process.env
// read below) so the documented activation procedure (set BCF_TOKEN in config/.env) actually
// arms the auth gate. File values win for keys they define, matching cde-store.mjs/ai-gateway.mjs.
for (const [k, v] of Object.entries(loadEnv())) process.env[k] = v;

const PORT = Number(process.env.BCF_PORT) || 4100;
// Week-0 hardening: bind to loopback by default (each user runs the bridge locally). Only set
// BCF_HOST=0.0.0.0 behind real auth + a reverse proxy. CORS defaults to * for dev; lock it to the
// platform origin in shared/hosted deployments via BCF_CORS_ORIGIN.
const HOST = process.env.BCF_HOST || "127.0.0.1";
// Beyond loopback the bridge faces the network: it does not start without a gate that is armed and can verify and
// forward a sign-in (D9). On loopback the legacy single-desktop modes still start.
const refusal = startRefusal(process.env);
if (refusal) { console.error(`[bridge] ${refusal}`); process.exit(1); }
// CSRF hardening: the bridge holds the Supabase SERVICE key (full RLS bypass), so a malicious web page must
// not be able to drive state-changing requests against it. We allowlist the app's web origin(s); browser
// mutations (POST/PUT/DELETE) from any other origin are refused. Non-browser clients (the Revit plugin, curl)
// send no Origin header and are unaffected. Override with BCF_CORS_ORIGIN=<comma-separated list>; the literal
// "*" DISABLES the gate (dev only — insecure, logged loudly at startup).
const DEFAULT_CORS = [
  "https://platform.thatopen.com",
  "http://localhost:5173", "http://127.0.0.1:5173", // vite dev
  "http://localhost:3000", "http://127.0.0.1:3000",
];
const CORS_RAW = process.env.BCF_CORS_ORIGIN || "";
const CORS_WILDCARD = CORS_RAW === "*";
const CORS_ALLOW = CORS_RAW && !CORS_WILDCARD ? CORS_RAW.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_CORS;
// The origin a request may use is decided by cors-origin.mjs (the platform's sandboxed app frame sends
// Origin: null, accepted only with an allowlisted Referer). A refused null origin is logged once per Referer
// origin, so a platform frame hosted somewhere new shows up in the log instead of as a silent CORS failure.
const nullOriginSeen = new Set();
const warnNullOrigin = (referer) => {
  let from = "none";
  try { if (referer) from = new URL(referer).origin; } catch { from = "unparseable"; }
  if (nullOriginSeen.has(from)) return;
  nullOriginSeen.add(from);
  console.warn(`[bridge] refused Origin: null from Referer ${from} — if that is the platform's app frame, add it to BCF_CORS_ORIGIN`);
};
// EIR/BEP documents are text, not IFC models — cap far below the 2 GB upload cap so one huge upload can't hold
// an ingest request open indefinitely feeding sequential local-model calls (see MAX_INGEST_CHUNKS in bimdocs-ingest.mjs).
const MAX_DOC_UPLOAD = (Number(process.env.SENTINEL_MAX_DOC_MB) || 32) * 1024 * 1024;
// Encrypted CDE attachments (POST /cde/files): drawings and documents, not models — far below the 2 GB upload cap (request-limits uploadCap). H0 (cde-8).
const MAX_BLOB = (Number(process.env.SENTINEL_MAX_BLOB_MB) || 100) * 1024 * 1024;

// Crash-safe JSON persistence: write a temp file then atomically rename, so a crash mid-write can never
// truncate the store. On read, a genuine ENOENT starts empty silently, but a CORRUPT/unreadable file is
// preserved aside (.corrupt-*) and logged loudly — never silently reinterpreted as "first run" (which
// would drop all data).
const writeJsonAtomic = (file, obj) => {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, file);
};
const loadJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    if (e && e.code === "ENOENT") return fallback; // genuine first run
    try { renameSync(file, `${file}.corrupt-${process.pid}`); } catch { /* best effort */ }
    process.stderr.write(`[bridge] WARN: ${file} unreadable (${e && e.message}); preserved as .corrupt-* and starting empty\n`);
    return fallback;
  }
};

// Sheet PNGs the Revit plugin renders (sheets never survive IFC export). One sub-folder per model, each with
// a manifest.json + <number>.png files. Served read-only to the web app's BIM Tools → Sheets tab.
const SHEETS_ROOT = process.env.SENTINEL_SHEETS
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "sheets");
// Published-view PNGs the Revit plugin renders (a curated subset the user picks in Publish Views —
// unlike Sheets, not everything). One sub-folder per model, each with a manifest.json + <type>_<name>.png
// files. Served read-only to the web app's BIM Tools → Views tab.
const VIEWS_ROOT = process.env.SENTINEL_VIEWS
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "views");
const TOKEN = process.env.BCF_TOKEN || ""; // if set, require "Authorization: Bearer <TOKEN>"
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
/** The shared machine credential, compared in constant time (byte lengths first: timingSafeEqual throws on a
 *  mismatch); never matches while BCF_TOKEN is unset. */
const TOKEN_BYTES = Buffer.from(TOKEN);
const isToken = (bearer) => {
  const b = Buffer.from(bearer);
  return !!TOKEN && b.length === TOKEN_BYTES.length && timingSafeEqual(b, TOKEN_BYTES);
};
const STORE = process.env.BCF_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "bcf-store.json");

// Encrypted CDE file blobs (Phase 2 — private CDE). The browser encrypts client-side and uploads ONLY
// ciphertext; we persist each as an opaque <id>.bin. Zero-knowledge: the bridge never sees a key, the
// plaintext, or even the filename. Independent of Supabase, so encrypted storage works without the CDE
// service key. Override the location with SENTINEL_CDE_FILES.
const CDE_FILES_ROOT = process.env.SENTINEL_CDE_FILES
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "cde-files");

/** @type {{topics: any[]}} */
let db = loadJson(STORE, { topics: [] });
const persist = () => writeJsonAtomic(STORE, db);

// ── Sentinel project store (Phase 1 — the governed-dataset metadata the platform doesn't model) ──
const PROJ_STORE = process.env.SENTINEL_PROJECT_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "project-store.json");
/** @type {{projects: any[]}} */
let pdb = loadJson(PROJ_STORE, { projects: [] });
const persistProj = () => writeJsonAtomic(PROJ_STORE, pdb);

const defaultProject = (pid) => ({
  project_id: pid, name: pid, stage: "design", standards_pack: "",
  dimensions: { "2d": true, "3d": true, "4d": false, "5d": true, "6d": false, "7d": false },
  gates: {}, snapshot: {}, updated_at: new Date().toISOString(),
});
const getProject = (pid) => {
  let p = pdb.projects.find((x) => x.project_id === pid);
  if (!p) { p = defaultProject(pid); pdb.projects.push(p); persistProj(); }
  return p;
};

// ── RFIs / approvals (Phase 2 — coordination objects beside BCF topics) ──
const RFI_STORE = process.env.SENTINEL_RFI_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "rfi-store.json");
/** @type {{rfis: any[]}} */
let rdb = loadJson(RFI_STORE, { rfis: [] });
const persistRfi = () => writeJsonAtomic(RFI_STORE, rdb);

// ── Tenders / bids (Phase 4 — BoQ-driven tendering, front of the lifecycle) ──
const TENDER_STORE = process.env.SENTINEL_TENDER_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "tender-store.json");
/** @type {{tenders: any[]}} */
let tndb = loadJson(TENDER_STORE, { tenders: [] });
const persistTender = () => writeJsonAtomic(TENDER_STORE, tndb);
/** A bid's total = Σ line.qty × (bid rate for that line, else the estimate rate). */
const bidTotal = (scope, rates) => scope.reduce((s, l) => s + l.qty * (rates[l.code] != null ? Number(rates[l.code]) : l.rate), 0);

// ── Standards-pack marketplace (Phase 4 — forkable/versioned/shareable standards) ──
const PACK_STORE = process.env.SENTINEL_PACK_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "pack-store.json");
/** @type {{packs: any[]}} */
let pkdb = loadJson(PACK_STORE, { packs: [] });
const persistPack = () => writeJsonAtomic(PACK_STORE, pkdb);
/** A registry record from a publish body (or a seed file). `naming` rides along so an install can put it on the project. */
const packRecord = (b, existing, author) => ({
  id: `${b.key}@${b.version}`, key: b.key, version: b.version, name: b.name || b.key, description: b.description || "",
  author, tags: b.tags || [], ruleset: b.ruleset || { rules: [] }, naming: b.naming || null,
  installs: existing?.installs || 0, forks: existing?.forks || 0,
  forked_from: b.forked_from || existing?.forked_from || null, created_at: existing?.created_at || new Date().toISOString(),
});
/** Seed packs are data (WebApp/packs/*.json): offered in an empty marketplace, enforced only once installed. */
const SEED_PACK_DIR = join(import.meta.dirname, "..", "packs");
const readSeedPacks = () => {
  try { return readdirSync(SEED_PACK_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(SEED_PACK_DIR, f), "utf8"))); }
  catch (e) { console.warn(`[packs] no seed packs read from ${SEED_PACK_DIR}: ${e?.message || e}`); return []; }
};

// ── Clash status store (Coordination): server-side dedup + a status lifecycle, replacing the per-browser
// localStorage "known" set so a resolved/raised clash stays hidden for the whole team, not just one machine.
// Records are keyed on the clash SIGNATURE (GlobalId pair — stable across a re-export; see clash.ts::keyOf).
const CLASH_STORE = process.env.SENTINEL_CLASH_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "clash-store.json");
/** @type {{clashes: any[]}} */
let cldb = loadJson(CLASH_STORE, { clashes: [] });
const persistClash = () => writeJsonAtomic(CLASH_STORE, cldb);
const CLASH_STATUSES = ["raised", "reviewed", "approved", "resolved"]; // new→raised→reviewed→approved→resolved
const MAX_CLASH_ITEMS = 500; // one POST /clash/:pid; the web raises at most 100 at a time (clash-panel.ts raise)
const clashItems = (pid) => cldb.clashes.filter((c) => c.project === pid);
/** Upsert a batch of clash records (raise-time). Merge by signature; unknown status defaults to "raised". */
const upsertClashes = (pid, items) => {
  const now = new Date().toISOString();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.signature) continue;
    const status = CLASH_STATUSES.includes(it.status) ? it.status : "raised";
    let rec = cldb.clashes.find((c) => c.project === pid && c.signature === it.signature);
    if (!rec) {
      cldb.clashes.push({ project: pid, signature: it.signature, status, volume: it.volume ?? null, label: it.label ?? null, bcf_guid: it.bcf_guid ?? null, elements: it.elements ?? null, overlap: it.overlap ?? null, created_at: now, updated_at: now });
    } else {
      rec.status = status;
      if (it.bcf_guid) rec.bcf_guid = it.bcf_guid;
      if (it.volume != null) rec.volume = it.volume;
      if (it.label) rec.label = it.label;
      if (it.elements) rec.elements = it.elements; // provenance (captured once at raise; preserved on status updates)
      if (it.overlap) rec.overlap = it.overlap;
      rec.updated_at = now;
    }
  }
  persistClash();
};
const updateClashStatus = (pid, signature, status) => {
  if (!signature || !CLASH_STATUSES.includes(status)) return false;
  const rec = cldb.clashes.find((c) => c.project === pid && c.signature === signature);
  if (!rec) return false;
  rec.status = status; rec.updated_at = new Date().toISOString(); persistClash();
  return true;
};
// Supabase-backed twins (migration 0009) — identical merge semantics over bridge_docs (store="clash").
async function upsertClashesCde(cde, pid, items) {
  const now = new Date().toISOString();
  const bySig = new Map((await cde.docList("clash", pid)).map((r) => [r.signature, r]));
  // Collapse within-batch duplicate signatures (a bulk upsert can't touch the same PK twice) — merging
  // sequentially exactly like the local upserter's shared map.
  const touched = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.signature) continue;
    const status = CLASH_STATUSES.includes(it.status) ? it.status : "raised";
    const prev = touched.get(it.signature) || bySig.get(it.signature);
    touched.set(it.signature, prev
      ? { ...prev, status, bcf_guid: it.bcf_guid || prev.bcf_guid, volume: it.volume != null ? it.volume : prev.volume, label: it.label || prev.label, elements: it.elements || prev.elements, overlap: it.overlap || prev.overlap, updated_at: now }
      : { project: pid, signature: it.signature, status, volume: it.volume ?? null, label: it.label ?? null, bcf_guid: it.bcf_guid ?? null, elements: it.elements ?? null, overlap: it.overlap ?? null, created_at: now, updated_at: now });
  }
  await cde.docUpsertMany("clash", pid, [...touched].map(([sig, data]) => ({ doc_id: sig, data })));
  // The records this call added (their signature was not on the register): each gets a "Clash raised" ledger row.
  return [...touched].filter(([sig]) => !bySig.has(sig)).map(([, rec]) => rec);
}
async function updateClashStatusCde(cde, pid, signature, status) {
  if (!signature || !CLASH_STATUSES.includes(status)) return false;
  const rec = await cde.docGet("clash", pid, signature);
  if (!rec) return false;
  const from = rec.status;
  rec.status = status; rec.updated_at = new Date().toISOString();
  await cde.docUpsert("clash", pid, signature, rec);
  return { from, label: rec.label ?? null }; // what moved, for its ledger row
}

// res._cors is the per-request allowed origin (set in handleRequest); only reflect an allowlisted origin so
// a foreign page can neither read responses nor pass a mutation preflight. Shared by send() AND the two
// binary routes (sheet PNGs, CDE blobs) — those used a hardcoded "*" (F11), which let any site the user
// happened to visit read sheets and document blobs straight out of the loopback bridge.
const corsHeaders = (res) => (res._cors
  ? { "Access-Control-Allow-Origin": res._cors, ...(res._cors === "*" ? {} : { Vary: res._cors === "null" ? "Origin, Referer" : "Origin" }) }
  : {});

/** The request declared a body (a length, or chunked) that has not all arrived yet. A bodiless GET or OPTIONS answered
 *  in the same tick it arrived is not complete yet either, and keeps its connection. */
const bodyPending = (req) => !!req && !req.complete && (!!req.headers["transfer-encoding"] || Number(req.headers["content-length"]) > 0);
const send = (res, code, body, extra) => {
  // F14 (schema disclosure): a raw PostgREST/Postgres error names tables, columns and constraints, and the
  // bridge echoed one at ~10 call sites. Scrub it ONCE here instead — every current and future 5xx is
  // covered, and a new route can't reintroduce the leak. Exactly 500 is scrubbed, so the deliberate 4xx
  // and 503 guidance ("CDE not configured — set SUPABASE_URL…") still reaches the user. The real text is
  // logged server-side, where it is a diagnostic rather than a disclosure.
  if (code === 500 && body && typeof body.message === "string") {
    // The route, without its query (a query can carry a file name or a note): a 500 that does not say where it
    // happened cannot be traced from the log.
    const where = res.req ? `${res.req.method} ${String(res.req.url || "").split("?")[0]}` : "";
    console.error(`[bridge] 500${where ? " " + where : ""}: ${body.message}`);
    body = { ...body, message: "Internal error — see the bridge log." };
  }
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    ...corsHeaders(res),
    // An answer given before the whole body arrived (a 401, a 413, a 408, a refusal of a raw upload before its first
    // byte) closes the connection: Node would otherwise drain the rest on the caller's behalf, for up to the 30 min
    // request timeout, and 256 such sockets are every socket the server accepts.
    ...(code === 401 || code === 413 || bodyPending(res.req) ? { Connection: "close" } : {}),
    ...extra,
  };
  res.writeHead(code, headers);
  res.end(body === undefined ? "" : JSON.stringify(body));
};

// ── SSE live sync: clients subscribe per project; changes are pushed to them instantly ──
const sseClients = new Map(); // project -> Set<res>
// F14: the fan-out was unbounded — anything that could reach the port could hold open arbitrarily many streams, each
// with a 25s keep-alive timer, until the bridge ran out of sockets. MAX_SSE caps the total for every caller but the
// machine credential (Revit and MCP live sync must never be locked out by browser streams); SSE_PER_USER caps one
// signed-in account (D7, events-2), so one account cannot take the whole budget from the office.
// ponytail: several accounts still reach MAX_SSE together until sign-up is closed (D1); a per-office cap if that bites.
const MAX_SSE = Number(process.env.BCF_MAX_SSE) || 64;
const SSE_PER_USER = 8;
const sseByUser = new Map(); // JWT sub -> open streams
const sseCount = () => { let n = 0; for (const s of sseClients.values()) n += s.size; return n; };
const INSTANCE_ID = randomUUID();                              // this bridge's id (skips its own events on poll)
const EVENT_POLL_MS = Number(process.env.BCF_EVENT_POLL_MS ?? 3000); // 0 disables the cross-machine feed

/** Push to THIS bridge's SSE clients only. */
function broadcastLocal(project, payload) {
  const set = sseClients.get(project);
  if (!set || !set.size) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const r of set) { try { r.write(line); } catch { /* dropped connection */ } }
}
/** Local push + cross-machine fan-out: record the event so OTHER bridges' poll loops re-broadcast it. */
function broadcast(project, payload) {
  broadcastLocal(project, payload);
  if (EVENT_POLL_MS > 0) {
    import("./cde-store.mjs").then((cde) => { if (cde.cdeConfigured()) cde.emitEvent(project, INSTANCE_ID, payload).catch(() => {}); }).catch(() => {});
  }
}
// The governed-core validators (bundled from src/sentinel-core → sentinel-core.mjs) — the SAME pure code the
// browser + propose API use; lazy-loaded so a plain BCF-only run never touches it.
let _core = null;
const loadCore = async () => (_core ??= await import("./sentinel-core.mjs"));

/** The canonical BCF-3.0 topic object — one shape shared by the POST /topics route and the governed
 *  fail→BCF hook, so a machine-raised issue is byte-identical to a hand-raised one (same fields the web
 *  Issues panel + Revit BcfSyncManager expect). */
// newTopicObject now lives in cde-store.mjs so the AI tool registry shares the exact same shape.

/** G2 — governed fail→BCF. On a REJECT verdict, surface each failing IDS requirement as a BCF topic
 *  (deduped against still-open IDS topics), with the failing elements as a viewpoint selection, and record
 *  the golden-thread audit. Topics live-sync to the web Issues panel and Revit via broadcast() — this closes
 *  the reject→fix→re-publish loop. Callers reach this only inside the /cde/ block, where CDE is guaranteed
 *  configured, so it goes straight to the Supabase-backed BCF store. Mirrors visibility-panel's raise path. */
async function raiseGovernedFailureTopics(cde, pid, result, opts = {}) {
  const author = resolveActor(opts.author, "Governed Publish");
  const idsTitle = result?.summary?.ids || "IDS";
  // Which requirements already have an OPEN IDS topic → dedup keys (BCF-title parsing stays here; it's the
  // BCF-shape-specific inverse of the `IDS: <key> (N failing)` subject built below).
  let existing = [];
  try { existing = await cde.bcfListTopics(pid, { status: "all" }); } catch { /* offline — raise anyway */ }
  const openReqs = (existing || [])
    .filter((t) => /^IDS:/.test(t?.title || "") && t?.topic_status !== "Closed" && t?.topic_status !== "Resolved" && !t?.superseded_by)
    .map((t) => String(t.title).replace(/^IDS:\s*/, "").replace(/\s*\(\d+ failing\)\s*$/, ""));
  // Pure, unit-tested grouping + dedup (sentinel-core) — one issue per still-open failing requirement.
  const core = await loadCore();
  const groups = core.groupFailuresForBcf(result.failures || [], openReqs);
  if (!groups.length) return { raised: 0, skipped: openReqs.length, topics: [] };
  const now = new Date().toISOString();
  const raised = [];
  for (const g of groups) {
    const topic = cde.newTopicObject(pid, {
      title: `IDS: ${g.key} (${g.count} failing)`, topic_type: "Issue", priority: "High",
      creation_author: author,
      description: `IDS “${idsTitle}” — ${g.count} element(s) fail: ${g.key}.` +
        (result.ids_ref ? ` Judged by ${result.ids_ref} (${result.ids_source}).` : "") +
        (g.guids.length ? ` Sample GUIDs: ${g.guids.slice(0, 10).join(", ")}` : ""),
    }, now);
    // F51: which IDS raised this topic, so a later install can mark it superseded. ids_source matters:
    // project and office versions are separate counters.
    topic.ids_ref = result.ids_ref ?? null;
    topic.ids_source = result.ids_source ?? null;
    if (g.guids.length) {
      topic.viewpoints.push({
        guid: randomUUID(), perspective_camera: null,
        components: { selection: g.guids.slice(0, 500).map((x) => ({ ifc_guid: x })) },
        clipping_planes: [], snapshot: null,
      });
    }
    await cde.bcfCreateTopic(topic);
    broadcast(pid, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
    try {
      await cde.recordAudit(pid, {
        entity_type: "ids_validation", actor: author, action: `Issue raised: ${g.key}`,
        new_value: { spec: idsTitle, requirement: g.key, failing: g.count, bcf_guid: topic.guid, ids_ref: topic.ids_ref, ids_source: topic.ids_source },
      });
    } catch { /* audit is best-effort — the topic is already live */ }
    raised.push({ guid: topic.guid, title: topic.title });
  }
  return { raised: raised.length, skipped: openReqs.length, topics: raised };
}

/** F51: installing ids@n MARKS the open IDS topics it supersedes (superseded_by = the new ref) and never
 *  closes them — a superseded topic may still be a real defect. One audit row lists the guids. */
async function markSupersededIdsTopics(cde, pid, newRef, actor, pick = "supersededBy") {
  const hits = (await import("./ids-supersede.mjs"))[pick](await cde.bcfListTopics(pid, { status: "all" }), newRef);
  if (!hits.length) return [];
  const now = new Date().toISOString();
  for (const t of hits) {
    t.superseded_by = newRef;
    t.history = t.history || [];
    t.history.push({ date: now, author: actor, action: `Superseded by ${newRef}` });
    t.modified_date = now;
    await cde.bcfSaveTopic(t);
    broadcast(pid, { type: "topic", action: "updated", guid: t.guid, status: t.topic_status });
  }
  const guids = hits.map((t) => t.guid);
  await cde.recordAudit(pid, { entity_type: "ids_validation", actor, action: `IDS topics superseded by ${newRef}`, new_value: { superseded_by: newRef, topics: guids } });
  return guids;
}

/** The lead's one-click "close all as superseded": every open IDS topic carrying a superseded_by mark is
 *  closed with a history line naming the IDS that superseded it; one audit row lists them. */
async function closeSupersededIdsTopics(cde, pid, actor) {
  const { closableSuperseded } = await import("./ids-supersede.mjs");
  const hits = closableSuperseded(await cde.bcfListTopics(pid, { status: "all" }));
  const now = new Date().toISOString();
  for (const t of hits) {
    t.history = t.history || [];
    t.history.push({ date: now, author: actor, action: `Status: ${t.topic_status || "—"} → Closed (superseded by ${t.superseded_by})` });
    t.topic_status = "Closed";
    t.modified_date = now;
    await cde.bcfSaveTopic(t);
    broadcast(pid, { type: "topic", action: "updated", guid: t.guid, status: t.topic_status });
  }
  const closed = hits.map((t) => ({ guid: t.guid, superseded_by: t.superseded_by }));
  if (closed.length) await cde.recordAudit(pid, { entity_type: "ids_validation", actor, action: `Superseded IDS topics closed (${closed.length})`, new_value: { closed } });
  return { closed: closed.length, topics: closed };
}

/** One BCF topic per failing Federation Gate check, de-duplicated by title against open ones. The
 *  description quotes the evidence rows — the coordinator gets the models and values, not a summary. */
async function raiseFederationTopics(cde, pid, run, opts = {}) {
  const author = resolveActor(opts.author, "Federation Gate");
  let existing = [];
  try { existing = await cde.bcfListTopics(pid, { status: "all" }); } catch { /* offline — raise anyway */ }
  const open = new Set((existing || [])
    .filter((t) => /^Federation:/.test(t?.title || "") && t?.topic_status !== "Closed" && t?.topic_status !== "Resolved")
    .map((t) => String(t.title).replace(/\s*\(\d+\)\s*$/, "")));
  const failing = run.result.checks.filter((c) => c.status === "fail");
  const now = new Date().toISOString();
  const raised = [];
  let dedup = 0, error = null;
  for (const c of failing) {
    const base = `Federation: ${c.id} ${c.title}`;
    if (open.has(base)) { dedup++; continue; }
    const topic = cde.newTopicObject(pid, {
      title: `${base} (${c.evidence.length})`, topic_type: "Issue", priority: "High", creation_author: author,
      description: `${c.reason || c.title}. Models: ${run.set.map((s) => s.container).join(", ")}.\n` + c.evidence.slice(0, 20).map((e) => JSON.stringify(e)).join("\n"),
    }, now);
    // Keep whatever raised before a failure — a topic already created must still be counted and
    // reported, not lost behind an exception that aborts the whole call (the caller only sees {raised: 0}).
    try {
      await cde.bcfCreateTopic(topic);
      broadcast(pid, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
      raised.push(topic.guid);
    } catch (e) {
      error = String(e?.message || e);
      break;
    }
  }
  return { raised: raised.length, skipped: dedup, topics: raised, ...(error ? { error } : {}) };
}

/** Poll the shared event feed and re-broadcast other bridges' events to our local clients (near-real-time). */
async function startEventPoll() {
  if (EVENT_POLL_MS <= 0) return;
  let cde; try { cde = await import("./cde-store.mjs"); } catch { return; }
  if (!cde.cdeConfigured()) return; // no cross-machine feed without Supabase (local SSE still works)
  let lastId = 0; try { lastId = await cde.maxEventId(); } catch { /* start from 0 */ }
  setInterval(async () => {
    try {
      for (const ev of await cde.pollEvents(lastId)) {
        const id = Number(ev.id); if (id > lastId) lastId = id;
        if (ev.origin !== INSTANCE_ID) broadcastLocal(ev.project_id, ev.payload); // NOT broadcast() — no re-publish loop
      }
    } catch { /* transient network — try again next tick */ }
  }, EVENT_POLL_MS);
  setInterval(() => { cde.pruneEvents().catch(() => {}); }, 60000); // retention
  console.log(`[bridge] cross-machine event feed: on (poll ${EVENT_POLL_MS}ms · instance ${INSTANCE_ID.slice(0, 8)})`);
}

// Extract the caller's forwarded Supabase session JWT (when the BCF_TOKEN gate isn't in use) and run the
// whole request inside that auth context, so cde-store's sb() forwards it to PostgREST (RLS per-user) when
// forwarding is armed. No JWT → service key (current behaviour). Non-browser callers (Revit) send none.
const server = createServer((req, res) => {
  // One error boundary for every request: a throw that escapes the handler — sync here, or a rejection of the async
  // handleRequest — must answer this caller, never end the process (Node exits on an unhandled rejection). A request
  // target of "//" makes `new URL(req.url, …)` throw, so one anonymous `GET //` or `OPTIONS //` used to stop the bridge.
  const failed = (e) => {
    const bad = e?.code === "ERR_INVALID_URL";
    // A refusal thrown outside a route's own try (a body over its cap, a full upload slot) keeps its status.
    const status = bad ? 400 : e?.status >= 400 && e?.status < 600 ? e.status : 500;
    try { if (res.headersSent) res.end(); else send(res, status, { message: bad ? "Bad request" : String(e?.message || e) }); }
    catch { /* the socket is already gone */ }
  };
  try {
    const auth = req.headers.authorization || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    // A Supabase JWT that verifies → forward for per-user RLS. The opaque BCF_TOKEN (if configured) marks a trusted
    // desktop client and must never be forwarded as a user token. Forwarding and BCF_TOKEN coexist, so the SPA keeps
    // per-user RLS with the token gate armed. With SUPABASE_JWT_SECRET empty no JWT is accepted (D9): an unverified
    // one would hand the bridge a sub and an email the caller wrote themselves.
    const userJwt = (bearer && !isToken(bearer) && JWT_SECRET && verifyJwt(bearer, JWT_SECRET)) ? bearer : null;
    runWithAuth(userJwt, () => handleRequest(req, res)).catch(failed);
  } catch (e) { failed(e); }
});
Object.assign(server, SERVER_LIMITS);
server.listen(PORT, HOST, () => {
  // Supabase projects on asymmetric signing keys sign USER SESSIONS with ES256 — the JWKS makes
  // those verifiable at the gate. Without it, arming SUPABASE_JWT_SECRET 401s every signed-in user.
  initJwks(process.env.SUPABASE_URL);
  console.log(`Sentinel BCF-API 3.0 listening on http://${HOST}:${PORT}  (store: ${STORE})`);
  console.log(`[bridge] CSRF origin-gate: ${CORS_WILDCARD ? "DISABLED (wildcard)" : "on — mutations restricted to " + CORS_ALLOW.join(", ")}`);
  console.log(`[bridge] bind: ${HOST} · auth gate: ${TOKEN ? "ARMED (JWT or BCF_TOKEN required; GET /health exempt; POST /receipt/:key/verify answers anyone hash-only)" : "off (legacy service-key — set BCF_TOKEN to close the anonymous fall-open)"}`);
  if (CORS_WILDCARD) console.warn("[bridge] WARNING: BCF_CORS_ORIGIN=* disables CSRF protection — set it to your app origin(s) for production.");
  if (TOKEN && !JWT_SECRET) console.warn("[bridge] WARNING: BCF_TOKEN set without SUPABASE_JWT_SECRET — no sign-in is accepted, so every signed-in web user gets 401. Set SUPABASE_JWT_SECRET.");
  if (JWT_SECRET && !TOKEN) console.warn("[bridge] WARNING: SUPABASE_JWT_SECRET set without BCF_TOKEN — a wrong secret silently downgrades signed-in users to the service key; arm BCF_TOKEN or unset the secret.");
  import("./cde-store.mjs").then((cde) => console.log(`[bridge] JWT-forwarding: ${cde.forwardingConfigured() ? "armed (forwards a caller's Supabase JWT → RLS)" : "off (service key; set SUPABASE_ANON_KEY to arm)"}`)).catch(() => {});
  // Platform API-token health-check: one cheap authenticated read at startup so a revoked/rotated
  // THATOPEN_API_KEY is caught LOUDLY here instead of as a confusing 401 "Token not found" on the first
  // upload. Non-fatal — BCF/CDE keep working; only platform uploads + Open-3D geometry need the token.
  (async () => {
    let m, cfg;
    try { m = await import("./thatopen-client.mjs"); } catch { return; }
    try { cfg = m.getConfig(); } catch { return; } // not configured → a separate, already-clear 503 on use
    try {
      await m.createClient(cfg).listFolders(cfg.projectId);
      console.log(`[bridge] platform token: valid ✓ (project ${cfg.projectId})`);
    } catch (e) {
      console.warn(`[bridge] ⚠ platform token REJECTED (${String(e?.message || e).slice(0, 50)}) — uploads & Open-3D will fail until fixed. Regenerate THATOPEN_API_KEY (dashboard → Data → API Tokens) in config/.env, then restart.`);
    }
  })();
  startEventPoll(); // cross-machine SSE fan-out (no-op without Supabase)
});
// A service manager stops the bridge with SIGTERM, a console with Ctrl+C (SIGINT): take no new connection, give the
// ones in flight up to 5 s to answer (the stores write synchronously, so no write is cut in half), then exit.
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  console.log(`[bridge] ${signal}: closing — no new connections, up to 5 s for the ones in flight`);
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 5000).unref();
});

// ── Public receipt check (cohesion phase 4c): POST /receipt/:key/verify from a caller the auth gate would refuse.
// Any page may ask (Access-Control-Allow-Origin: *, no credentials read or allowed); the answer is hash-only
// (public-verify.mjs). At most 8 KB a check, 60 checks a minute per caller address and 600 across every caller (a
// check is one indexed read); the log line names the method, the path and the outcome, never the body. At most 32
// checks read their body at once, each within 3 s (readCapped), and at most 2 of them from one caller (callerKey: an
// IPv4 address, an IPv6 /64): anonymous callers never hold more than 32 of the server's 256 sockets, and filling
// those 32 takes 16 sources, not one.
const publicPerCaller = createKeyedLimiter({ max: 60, windowMs: 60000 });
const publicLimiter = createLimiter({ max: 600, windowMs: 60000 });
const MAX_PUBLIC_READS = 32, MAX_PUBLIC_READS_PER_CALLER = 2;
let publicReads = 0;
const publicReadsBy = new Map();
async function publicReceiptVerify(req, res, url) {
  res._cors = "*";
  if (req.method === "OPTIONS") {
    // A member's preflight carries no Authorization either, so it lands here too: an allowlisted origin keeps its
    // Private Network Access grant (as on every other route), a foreign one gets none.
    if (req.headers["access-control-request-private-network"] === "true"
        && corsOrigin(req.headers.origin, req.headers.referer, { allow: CORS_ALLOW, wildcard: CORS_WILDCARD, armed: !!TOKEN }))
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    return send(res, 204);
  }
  const done = (code, body, outcome, extra) => {
    console.log(`[receipt] public ${req.method} ${url.pathname} → ${outcome}`);
    return send(res, code, body, extra);
  };
  const who = callerKey(clientAddress(req));
  if (publicReads >= MAX_PUBLIC_READS || (publicReadsBy.get(who) || 0) >= MAX_PUBLIC_READS_PER_CALLER)
    return done(429, { message: "Too many receipt checks at once — try again in a moment" }, "429 (busy)");
  // The caller's own window first: a caller over it does not use up the shared one.
  if (!publicPerCaller.take(who) || !publicLimiter.take()) return done(429, { message: "Too many receipt checks — try again within a minute" }, "429");
  let text;
  publicReads++;
  publicReadsBy.set(who, (publicReadsBy.get(who) || 0) + 1);
  try { text = await readCapped(req); }
  catch (e) { return done(e.status, { message: e.message }, String(e.status)); } // not whole within 3 s (408), or cut off (400)
  finally {
    publicReads--;
    const left = publicReadsBy.get(who) - 1;
    if (left) publicReadsBy.set(who, left); else publicReadsBy.delete(who);
  }
  // The rest of an over-cap body is drained, not read, and the connection closes after the 413.
  if (text === null) return done(413, { message: "A receipt check is at most 8 KB" }, "413", { Connection: "close" });
  let claim;
  try { claim = parsePublicVerify(text ? JSON.parse(text) : null); }
  catch (e) { return done(400, { message: e?.status === 400 ? e.message : "send {audit_id, ledger_hash} or a whole receipt as JSON" }, "400"); }
  try {
    let key = null;
    try { key = decodeURIComponent(url.pathname.split("/")[2]); } catch { /* a malformed escape names no project */ }
    const cde = await import("./cde-store.mjs");
    const reply = comparePublic(key === null ? null : await cde.publicAuditRow(key, claim.audit_id), claim, key);
    return done(200, reply, reply.matches ? "match" : "no match");
  } catch (e) {
    return done(500, { message: `public receipt check failed: ${e?.message || e}` }, "500"); // send() logs it, then scrubs it
  }
}

/** H0 (D2): an upload that spends the founder's platform storage or disk names its project in the query, and the caller
 *  is checked against that project (members-store requireSpend) before one byte of the body is read. */
async function requireSpendFor(key, param) {
  if (!key) throw Object.assign(new Error(`name the project: ?${param}=<project key> — nothing was uploaded`), { status: 400 });
  if (!(await import("./cde-store.mjs")).cdeConfigured())
    throw Object.assign(new Error("CDE not configured — an upload is checked against its project's office, so the bridge needs SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env."), { status: 503 });
  return (await import("./members-store.mjs")).requireSpend(key);
}

// The routes that fall back to the per-machine JSON stores when the CDE is not configured.
const LOCAL_STORE_ROUTE = /^\/(projects|rfis|packs|tenders|clash|bcf)(\/|$)/;

async function handleRequest(req, res) {
  const origin = req.headers.origin;
  const url = new URL(req.url, "http://localhost");
  // The credential the auth gate below accepts: the shared BCF_TOKEN, or the Supabase JWT the server callback
  // verified and put in this request's auth context.
  const bearer = (req.headers.authorization || "").startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const credentialOk = isToken(bearer) || !!currentUserToken();
  // With the gate armed, a caller it would refuse may still ask whether a receipt is on the ledger: answered
  // hash-only, ahead of the CSRF and bearer gates. A caller with a credential takes the /receipt route below and
  // gets today's full reply; with the gate off every caller already does.
  if (TOKEN && !credentialOk && isPublicRoute(req.method, url.pathname)) return publicReceiptVerify(req, res, url);
  // Per-request CORS origin: echo an allowlisted origin (or "*" only in wildcard/dev mode); otherwise none.
  res._cors = corsOrigin(origin, req.headers.referer, { allow: CORS_ALLOW, wildcard: CORS_WILDCARD, armed: !!TOKEN });
  if (origin === "null" && !res._cors) warnNullOrigin(req.headers.referer);

  if (req.method === "OPTIONS") {
    // Chrome Private Network Access: a public origin (the platform) calling a private
    // address (the tailnet bridge) must be granted explicitly in the preflight, or
    // Chrome blocks the request before it ever reaches us. Allowlisted origins only.
    if (req.headers["access-control-request-private-network"] === "true" && res._cors)
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    return send(res, 204); // preflight: send() reflects res._cors (denies foreign origins)
  }

  // CSRF gate: refuse state-changing requests from a browser origin that isn't allowlisted. A request with no
  // Origin (Revit plugin, curl, server-to-server) is a non-browser caller and is allowed through.
  if ((req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") && origin && !res._cors) {
    return send(res, 403, { message: "Origin not allowed" });
  }

  // Auth gate (F2): when BCF_TOKEN is configured, close the anonymous service-key fall-open. Every route
  // except /health must present EITHER a forwarded Supabase JWT (→ per-user RLS) OR the shared BCF_TOKEN
  // (→ trusted desktop client, e.g. Revit). The SSE feed is no longer exempt: the web reads it as a fetch
  // stream with the Authorization header (bridge-fetch.ts bridgeEvents) and Revit already sends its bearer,
  // so the feed stays closed even when the bridge is reachable from the internet.
  // With BCF_TOKEN unset, behaviour is unchanged (legacy service-key mode). Activation = set BCF_TOKEN.
  // (POST /receipt/:key/verify from a caller with neither was already answered hash-only, above.)
  if (TOKEN) {
    const exempt = url.pathname === "/health" && req.method === "GET";
    if (!exempt && !credentialOk) {
      // Why-log for rejected calls: no secrets, just the credential's shape.
      const why = !bearer ? "no-bearer"
        : bearer.split(".").length === 3 ? "jwt-rejected" : "token-mismatch";
      console.warn(`[bridge] 401 ${req.method} ${url.pathname} (${why}, origin: ${req.headers.origin || "none"})`);
      return send(res, 401, { message: "Unauthorized" });
    }
  }

  // Gate armed, CDE not configured: the local JSON stores behind these routes know no members, so a signed-in caller
  // would read and write every project in them. They stay the single desktop's (the machine credential); a signed-in
  // caller gets a 503 in words (D9).
  if (TOKEN && currentUserToken() && LOCAL_STORE_ROUTE.test(url.pathname) && !(await import("./cde-store.mjs")).cdeConfigured())
    return send(res, 503, { message: "the team store is not configured on this bridge (SUPABASE_URL + SUPABASE_SERVICE_KEY) — a signed-in user cannot use the single-desktop files; nothing was read or saved" });

  // Health (no secrets, no posture): up, gate armed, CDE configured. The bind host and the CORS allowlist are in the
  // startup log, not on a route anyone on the internet can read.
  if (url.pathname === "/health" && req.method === "GET") {
    let cdeConfigured = false;
    try { cdeConfigured = (await import("./cde-store.mjs")).cdeConfigured(); } catch { /* */ }
    return send(res, 200, { ok: true, token: !!TOKEN, cde_configured: cdeConfigured });
  }

  // ── SSE live stream: GET /events?project=<key> (kept open; pushes topic/CDE changes) ──
  // D7 (events-1): a signed-in caller names the project and must be at least its viewer — a non-member gets the unknown
  // key's 404 (ensureProject), so the feed neither leaks live issue titles nor confirms a key. The machine credential
  // passes as service. Membership is checked first and nothing awaits between the caps and the add, so two opens at
  // once cannot both slip under a cap.
  if (url.pathname === "/events" && req.method === "GET") {
    const signedIn = !!currentUserToken();
    if (signedIn && !url.searchParams.get("project")) return send(res, 400, { message: "Name the project: /events?project=<key>" });
    const project = url.searchParams.get("project") || "default";
    try { await (await import("./members-store.mjs")).requireMinRole(project, "viewer"); }
    catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
    if (req.socket.destroyed) return; // the caller left while membership was checked: nothing to hold open
    const sub = signedIn ? currentSub() || "" : null;
    if (!isToken(bearer) && sseCount() >= MAX_SSE) return send(res, 503, { message: "Too many live connections" });
    if (sub !== null && (sseByUser.get(sub) || 0) >= SSE_PER_USER)
      return send(res, 429, { message: `Too many live connections for this account (${SSE_PER_USER}) — close another Sentinel tab or window` });
    const sseHeaders = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" };
    if (res._cors) sseHeaders["Access-Control-Allow-Origin"] = res._cors; // allowlisted origin only
    res.writeHead(200, sseHeaders);
    res.write(": connected\n\n");
    let set = sseClients.get(project);
    if (!set) { set = new Set(); sseClients.set(project, set); }
    set.add(res);
    if (sub !== null) sseByUser.set(sub, (sseByUser.get(sub) || 0) + 1);
    const ka = setInterval(() => { try { res.write(": ka\n\n"); } catch { /* */ } }, 25000);
    req.on("close", () => {
      clearInterval(ka);
      set.delete(res);
      if (!set.size) sseClients.delete(project); // events-2: an emptied project leaves no entry behind
      if (sub !== null) { const n = sseByUser.get(sub) - 1; if (n > 0) sseByUser.set(sub, n); else sseByUser.delete(sub); }
    });
    return; // keep the stream open — do NOT call send()
  }

  // ── AI gateway: GET /ai/providers · GET /ai/tools · POST /ai/run-tool · GET /ai/models · POST /ai/chat ──
  // The one seam every AI feature calls. Provider keys stay on the bridge; the SPA never holds one
  // and never talks to a provider directly. Cloud providers need a key AND SENTINEL_AI_CLOUD=1 —
  // local (Ollama) is the default and needs neither. A cloud call also needs a trusted caller and a listed model, and
  // every signed-in call spends from the AI budget (ai-gateway chat(), H0 D2). Lazily imported so a bridge with no AI
  // configured never pays for loading the SDK.
  if (url.pathname === "/ai/providers" && req.method === "GET") {
    const ai = await import("./ai-gateway.mjs");
    // A caller who may not use cloud AI sees why on each cloud row — never whether a paid key is armed.
    let may;
    try { may = await (await import("./members-store.mjs")).canUseCloudAi(); }
    catch (e) { may = { ok: false, why: `Cloud AI unavailable — the office check failed: ${String(e?.message || e).slice(0, 120)}` }; }
    return send(res, 200, { providers: ai.listProviders({ cloudRefusal: may.ok ? null : may.why }) });
  }
  // What the AI is allowed to do, and which of those need a human tick. The UI renders the gate from
  // this, so a tool added to the registry shows up in both the agent and the MCP server with no
  // further wiring.
  if (url.pathname === "/ai/tools" && req.method === "GET") {
    const t = await import("./ai-tools.mjs");
    return send(res, 200, {
      tools: t.TOOLS.map(({ name, description, policy, input_schema }) => ({ name, description, policy, input_schema })),
    });
  }
  // Run ONE tool. `approved:true` is the human's tick from the review gate: without it a write-policy tool is refused,
  // so a missing gate fails loudly. It is not a permission — runTool checks the caller's role on the project the call
  // names (H0, D10). The body is one tool call, at most SMALL_JSON (1 MB).
  if (url.pathname === "/ai/run-tool" && req.method === "POST") {
    const t = await import("./ai-tools.mjs");
    try {
      const { name, args, approved } = await readBody(req, { max: SMALL_JSON });
      return send(res, 200, { name, result: await t.runTool(name, args || {}, { allowWrites: approved === true }) });
    } catch (e) {
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
  if (url.pathname === "/ai/models" && req.method === "GET") {
    const ai = await import("./ai-gateway.mjs");
    try {
      return send(res, 200, { models: await ai.listModels(url.searchParams.get("provider") || "local") });
    } catch (e) {
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
  if (url.pathname === "/ai/chat" && req.method === "POST") {
    const ai = await import("./ai-gateway.mjs");
    try {
      return send(res, 200, await ai.chat(await readBody(req, { max: SMALL_JSON })));
    } catch (e) {
      // A blocked provider, a refused caller (403), the budget (429), an over-size body (413) or an unreachable local
      // model is the caller's problem to fix and the message says how — pass it through rather than a generic 500.
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // D7 (sheets-1): sheet and view PNGs are client drawings from every project Revit published on this machine, in one
  // folder per machine. Until the lists are scoped to project members (H3), only the machine credential and platform
  // admins may list or open them. The refusal is in words the panels show — never an empty list that reads as "nothing
  // published". isPlatformAdmin is true for the machine credential; a check that throws grants nothing.
  const renders = /^\/(sheets|views)(?:\/|$)/.exec(url.pathname);
  if (renders && req.method === "GET") {
    let admin = false;
    try { admin = await (await import("./members-store.mjs")).isPlatformAdmin(); } catch { /* not answered: not an admin */ }
    if (!admin) return send(res, 403, { message: `${renders[1] === "sheets" ? "Revit sheets" : "Published views"} are shown only to platform admins for now — they are not yet scoped to project members.` });
  }

  // ── Revit sheets (rendered PNGs the plugin pushes): GET /sheets  +  GET /sheets/img/:set/:file ──
  // GET /sheets → all sheet sets with their manifests (each sheet carries a ready-to-use image url).
  if (url.pathname === "/sheets" && req.method === "GET") {
    const sets = [];
    try {
      for (const set of readdirSync(SHEETS_ROOT)) {
        const dir = join(SHEETS_ROOT, set);
        let st; try { st = statSync(dir); } catch { continue; }
        if (!st.isDirectory()) continue;
        const mf = join(dir, "manifest.json");
        if (!existsSync(mf)) continue;
        try {
          // strip the UTF-8 BOM the plugin's Encoding.UTF8 writer prepends — JSON.parse rejects it
          const m = JSON.parse(readFileSync(mf, "utf8").replace(/^﻿/, ""));
          const sheets = (m.sheets || []).map((s) => ({ ...s, url: `/sheets/img/${encodeURIComponent(set)}/${encodeURIComponent(s.file)}` }));
          sets.push({ set, title: m.title ?? set, project: m.project ?? null, exportedAt: m.exportedAt ?? null, count: sheets.length, sheets });
        } catch { /* skip a malformed manifest */ }
      }
    } catch { /* SHEETS_ROOT doesn't exist yet — no sheets published */ }
    sets.sort((a, b) => String(b.exportedAt).localeCompare(String(a.exportedAt)));
    return send(res, 200, { sets }); // no root: a reply never carries an absolute local path (D7)
  }
  // GET /sheets/img/:set/:file → serve one PNG (path-traversal-guarded via basename()).
  const simg = url.pathname.match(/^\/sheets\/img\/([^/]+)\/([^/]+)$/);
  if (simg && req.method === "GET") {
    const set = basename(decodeURIComponent(simg[1]));
    const file = basename(decodeURIComponent(simg[2]));
    if (extname(file).toLowerCase() !== ".png") return send(res, 404, { message: "Not found" });
    const path = join(SHEETS_ROOT, set, file);
    // Defence-in-depth (F14/CWE-22): basename() lets "." and ".." through, so confirm the resolved path
    // actually stays inside SHEETS_ROOT before reading it.
    if (!resolve(path).startsWith(resolve(SHEETS_ROOT) + sep)) return send(res, 404, { message: "Not found" });
    try {
      const buf = readFileSync(path);
      // No ACAO:* here (F11) — a plain <img src> needs no CORS header at all, and a fetch() from the
      // allowlisted app origin is still served by the reflection.
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
        ...corsHeaders(res),
      });
      return res.end(buf);
    } catch {
      return send(res, 404, { message: "Sheet image not found" });
    }
  }

  // ── Published Revit views (rendered PNGs, curated in Publish Views): GET /views  +  GET /views/img/:set/:file ──
  // GET /views → all view sets with their manifests (each view carries a ready-to-use image url).
  if (url.pathname === "/views" && req.method === "GET") {
    const sets = [];
    try {
      for (const set of readdirSync(VIEWS_ROOT)) {
        const dir = join(VIEWS_ROOT, set);
        let st; try { st = statSync(dir); } catch { continue; }
        if (!st.isDirectory()) continue;
        const mf = join(dir, "manifest.json");
        if (!existsSync(mf)) continue;
        try {
          // strip the UTF-8 BOM the plugin's Encoding.UTF8 writer prepends — JSON.parse rejects it
          const m = JSON.parse(readFileSync(mf, "utf8").replace(/^﻿/, ""));
          const views = (m.views || []).map((v) => ({ ...v, url: `/views/img/${encodeURIComponent(set)}/${encodeURIComponent(v.file)}` }));
          sets.push({ set, title: m.title ?? set, project: m.project ?? null, exportedAt: m.exportedAt ?? null, count: views.length, views });
        } catch { /* skip a malformed manifest */ }
      }
    } catch { /* VIEWS_ROOT doesn't exist yet — no views published */ }
    sets.sort((a, b) => String(b.exportedAt).localeCompare(String(a.exportedAt)));
    return send(res, 200, { sets }); // no root: a reply never carries an absolute local path (D7)
  }
  // GET /views/img/:set/:file → serve one PNG (path-traversal-guarded via basename()).
  const vimg = url.pathname.match(/^\/views\/img\/([^/]+)\/([^/]+)$/);
  if (vimg && req.method === "GET") {
    const set = basename(decodeURIComponent(vimg[1]));
    const file = basename(decodeURIComponent(vimg[2]));
    if (extname(file).toLowerCase() !== ".png") return send(res, 404, { message: "Not found" });
    const path = join(VIEWS_ROOT, set, file);
    // Defence-in-depth (F14/CWE-22): basename() lets "." and ".." through, so confirm the resolved path
    // actually stays inside VIEWS_ROOT before reading it.
    if (!resolve(path).startsWith(resolve(VIEWS_ROOT) + sep)) return send(res, 404, { message: "Not found" });
    try {
      const buf = readFileSync(path);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
        ...corsHeaders(res),
      });
      return res.end(buf);
    } catch {
      return send(res, 404, { message: "View image not found" });
    }
  }

  // ── Sentinel project store: /projects[/:pid] ──
  // Single source of truth = Supabase projects.metadata (0007) when the CDE is configured (team-wide);
  // else the per-machine local JSON store. Existing local metadata is lazy-migrated into Supabase on first
  // read (the `seed`), and the local file is kept as an untouched backup. The stage and the gates in a
  // project's shape come from the ledger (cde-store.mjs projectStage/projectGates, phase 5c); the gate is run
  // with POST /cde/:key/gate — the old POST /projects/:pid/gate/:stage is gone (a 404 like any unknown path).
  const pm = url.pathname.match(/^\/projects(?:\/([^/]+))?$/);
  if (pm) {
    const [, ppid] = pm;
    try {
      const cde = await import("./cde-store.mjs");
      const useCde = cde.cdeConfigured();
      const localSeed = (pid) => { const l = pdb.projects.find((p) => p.project_id === pid); if (!l) return undefined; const { project_id, name, ...meta } = l; return meta; };

      if (req.method === "GET" && !ppid) {
        if (!useCde) return send(res, 200, pdb.projects);
        const remote = await cde.listProjectMeta();
        // projects-2: the local file is this machine's history, so only the machine credential migrates it. A signed-in
        // caller gets the projects they are a member of; a local key they could not see used to fail their whole list.
        if (currentUserToken()) return send(res, 200, remote);
        // Union-safe: migrate any local project not yet in Supabase so none vanish from the switcher.
        const known = new Set(remote.map((r) => r.project_id));
        const missing = pdb.projects.filter((l) => !known.has(l.project_id));
        // A local row whose project no longer exists in the CDE (a deleted smoke project) must not fail the
        // whole list: skip it and say so, once per request.
        let migrated = 0;
        for (const l of missing) {
          const { project_id, name, ...meta } = l;
          try { await cde.getProjectMeta(project_id, meta); migrated++; }
          catch (e) { if (e?.status === 404) console.warn(`[projects] local row '${project_id}' has no CDE project — skipped`); else throw e; }
        }
        return send(res, 200, migrated ? await cde.listProjectMeta() : remote);
      }
      if (req.method === "GET" && ppid) return send(res, 200, useCde ? await cde.getProjectMeta(ppid, localSeed(ppid)) : getProject(ppid));
      if (req.method === "PUT" && ppid) {
        const b = await readBody(req);
        if (useCde) return send(res, 200, await cde.patchProjectMeta(ppid, b));
        const p = getProject(ppid); // local fallback (original behaviour)
        for (const k of ["name", "standards_pack"]) if (b[k] !== undefined) p[k] = b[k];
        if (b.dimensions) p.dimensions = { ...p.dimensions, ...b.dimensions };
        if (b.snapshot) p.snapshot = { ...p.snapshot, ...b.snapshot };
        if (b.rate_pack) p.rate_pack = b.rate_pack;             // 5D: the project's editable rate library
        if (b.boq_baseline) p.boq_baseline = b.boq_baseline;    // 5D: cost baseline reference
        if (b.carbon_baseline) p.carbon_baseline = b.carbon_baseline; // 6D: carbon baseline (was dropped — fixed)
        p.updated_at = new Date().toISOString();
        persistProj(); return send(res, 200, p);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
  }

  // ── RFIs: /rfis/:pid[/:guid] ──
  const rm = url.pathname.match(/^\/rfis\/([^/]+)(?:\/([^/]+))?$/);
  if (rm) {
    const [, rpid, rguid] = rm;
    const inP = (r) => r.project_id === rpid;
    try {
      const cde = await import("./cde-store.mjs");
      const useCde = cde.cdeConfigured();
      // H0 (D4, rfis-1): raising and answering an RFI is a contributor's work; a viewer writes nothing. Asked before the
      // body is read; the machine credential passes as service.
      if (req.method !== "GET") await (await import("./members-store.mjs")).requireMinRole(rpid, "contributor");
      const listRfis = async () => (useCde ? await cde.docListLazy("rfi", rpid, rdb.rfis.filter(inP), (r) => r.guid) : rdb.rfis.filter(inP));
      if (req.method === "GET" && !rguid) {
        const status = url.searchParams.get("status");
        return send(res, 200, (await listRfis()).filter((r) => (!status || status === "all") ? true : r.status === status));
      }
      if (req.method === "POST" && !rguid) {
        const b = await readBody(req); const now = new Date().toISOString();
        const num = (await listRfis()).length + 1;
        const rfi = {
          guid: randomUUID(), project_id: rpid, number: `RFI-${String(num).padStart(3, "0")}`,
          subject: b.subject || "Untitled", question: b.question || "", status: "Open",
          discipline: b.discipline || "", assigned_to: b.assigned_to || "", due_date: b.due_date || null,
          answer: "", model: b.model || "", linked: b.linked || [],
          creation_author: resolveActor(b.creation_author, "web"), creation_date: now, modified_date: now,
          history: [{ date: now, author: resolveActor(b.creation_author, "web"), action: "Raised" }],
        };
        if (useCde) await cde.docUpsert("rfi", rpid, rfi.guid, rfi); else { rdb.rfis.push(rfi); persistRfi(); }
        return send(res, 201, rfi);
      }
      const rfi = useCde ? await cde.docGet("rfi", rpid, rguid) : rdb.rfis.find((r) => inP(r) && r.guid === rguid);
      if (!rfi) return send(res, 404, { message: "RFI not found" });
      rfi.history = rfi.history || [];
      if (req.method === "PUT") {
        const b = await readBody(req); const who = resolveActor(b.author, "web"); const now = new Date().toISOString();
        if (b.answer !== undefined && b.answer !== rfi.answer) {
          rfi.answer = b.answer; rfi.history.push({ date: now, author: who, action: "Answered" });
          if (rfi.status === "Open") rfi.status = "Answered";
        }
        for (const [k, label] of [["status", "Status"], ["assigned_to", "Assignee"], ["due_date", "Due date"], ["discipline", "Discipline"]]) {
          if (b[k] !== undefined && b[k] !== rfi[k]) { rfi.history.push({ date: now, author: who, action: `${label}: ${rfi[k] || "—"} → ${b[k] || "—"}` }); rfi[k] = b[k]; }
        }
        rfi.modified_date = now;
        if (useCde) await cde.docUpsert("rfi", rpid, rfi.guid, rfi); else persistRfi();
        return send(res, 200, rfi);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
  }

  // ── Standards-pack marketplace: /packs[/:id[/install|fork]] ──
  const km = url.pathname.match(/^\/packs(?:\/([^/]+))?(?:\/(install|fork))?$/);
  if (km) {
    const [, kid, ksub] = km;
    try {
      const cde = await import("./cde-store.mjs");
      const useCde = cde.cdeConfigured();
      // Global store (project_id=""). One list call (which also lazy-migrates) gives the current set to find in.
      const packs = useCde ? await cde.docListLazy("pack", "", pkdb.packs, (p) => p.id) : pkdb.packs;
      const savePack = async (pk) => { if (useCde) await cde.docUpsert("pack", "", pk.id, pk); else persistPack(); };
      if (req.method === "GET" && !kid) {
        if (!packs.length) { // first run: seed from the data files (was the panel's job, with the pilot's ruleset in code)
          for (const b of readSeedPacks()) {
            const pk = packRecord(b, null, b.author || "seed");
            if (useCde) { await cde.docUpsert("pack", "", pk.id, pk); packs.push(pk); } else pkdb.packs.push(pk);
          }
          if (!useCde) persistPack();
        }
        return send(res, 200, packs);
      }
      if (req.method === "POST" && !kid) { // publish (create or update)
        const b = await readBody(req);
        const id = `${b.key}@${b.version}`;
        const existing = packs.find((p) => p.id === id);
        const pack = packRecord(b, existing, resolveActor(b.author, "anon"));
        if (useCde) await cde.docUpsert("pack", "", id, pack); else { if (existing) Object.assign(existing, pack); else pkdb.packs.push(pack); persistPack(); }
        return send(res, 201, pack);
      }
      if (kid && !ksub && req.method === "GET") return send(res, 200, packs.find((p) => p.id === kid) || null);
      const pack = packs.find((p) => p.id === kid);
      if (!pack) return send(res, 404, { message: "Pack not found" });
      if (req.method === "POST" && ksub === "install") { pack.installs = (pack.installs || 0) + 1; await savePack(pack); return send(res, 200, pack); }
      if (req.method === "POST" && ksub === "fork") {
        const b = await readBody(req); const now = new Date().toISOString();
        const nid = `${b.key || pack.key}@${b.version || "fork"}`;
        const fork = { ...pack, id: nid, key: b.key || pack.key, version: b.version || "fork", name: b.name || pack.name + " (fork)", author: resolveActor(b.author, "anon"), installs: 0, forks: 0, forked_from: pack.id, created_at: now };
        pack.forks = (pack.forks || 0) + 1;
        if (useCde) { await cde.docUpsert("pack", "", pack.id, pack); await cde.docUpsert("pack", "", fork.id, fork); } else { pkdb.packs.push(fork); persistPack(); }
        return send(res, 201, fork);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
  }

  // ── Tenders: /tenders/:pid[/:guid[/bids]] ──
  const tm = url.pathname.match(/^\/tenders\/([^/]+)(?:\/([^/]+))?(?:\/(bids))?$/);
  if (tm) {
    const [, tpid, tguid, tsub] = tm;
    const inP = (t) => t.project_id === tpid;
    try {
      const cde = await import("./cde-store.mjs");
      const useCde = cde.cdeConfigured();
      // H0 (D4, tenders-1): issuing and awarding a tender is a lead's governance; entering a bid is a contributor's work;
      // a viewer writes nothing. Asked before the body is read; the machine credential passes as service.
      if (req.method !== "GET") await (await import("./members-store.mjs")).requireMinRole(tpid, req.method === "POST" && tsub === "bids" ? "contributor" : "lead");
      // Written with the service key after that check: one tender document carries the award and the bids together, so
      // the database cannot tell a lead's award from a contributor's bid — the bridge decides, and the store can be closed
      // to direct writes (migration 0033).
      const saveDoc = (t) => cde.docUpsert("tender", tpid, t.guid, t, { service: true });
      const listTenders = async () => (useCde ? await cde.docListLazy("tender", tpid, tndb.tenders.filter(inP), (t) => t.guid) : tndb.tenders.filter(inP));
      if (req.method === "GET" && !tguid) return send(res, 200, await listTenders());
      if (req.method === "POST" && !tguid) {
        const b = await readBody(req); const now = new Date().toISOString();
        const t = {
          guid: randomUUID(), project_id: tpid, title: b.title || "Tender", status: "Issued",
          due_date: b.due_date || null, currency: b.currency || "",
          scope: Array.isArray(b.scope) ? b.scope : [], estimate_total: b.estimate_total || 0,
          bids: [], awarded_to: "", creation_date: now, modified_date: now,
          history: [{ date: now, author: resolveActor(b.author, "web"), action: "Tender issued" }],
        };
        if (useCde) await saveDoc(t); else { tndb.tenders.push(t); persistTender(); }
        return send(res, 201, t);
      }
      const t = useCde ? await cde.docGet("tender", tpid, tguid) : tndb.tenders.find((x) => inP(x) && x.guid === tguid);
      if (!t) return send(res, 404, { message: "Tender not found" });
      t.history = t.history || [];
      const saveTender = async () => { if (useCde) await saveDoc(t); else persistTender(); };
      if (req.method === "POST" && tsub === "bids") {
        // An awarded tender takes no more bids (tenders-2): the award is the decision the bids were for.
        if (t.status === "Awarded") return send(res, 409, { message: `tender ${t.title} is awarded to ${t.awarded_to} — it takes no more bids` });
        const b = await readBody(req); const now = new Date().toISOString();
        const rates = b.rates || {};
        // bidder is the firm the bid is for (the team keys bids in for outside firms — tender-panel's "Bidder name");
        // submitted_by is who entered it: the verified sign-in for a signed-in caller (D6), the machine's own label else.
        const bid = { id: randomUUID(), bidder: b.bidder || "Bidder", submitted_by: resolveActor(b.submitted_by, "web"), submitted_date: now, rates, total: bidTotal(t.scope, rates) };
        t.bids.push(bid); t.history.push({ date: now, author: bid.submitted_by, action: `Bid received: ${bid.bidder}` });
        t.modified_date = now; await saveTender(); return send(res, 201, bid);
      }
      // Only the tender's own path awards (uncovered-3): PUT /tenders/:pid/:guid/bids was a second URL for the same write.
      if (req.method === "PUT" && !tsub) {
        const b = await readBody(req); const now = new Date().toISOString(); const who = resolveActor(b.author, "web");
        if (b.status && b.status !== t.status) { t.history.push({ date: now, author: who, action: `Status: ${t.status} → ${b.status}` }); t.status = b.status; }
        if (b.awarded_to !== undefined && b.awarded_to !== t.awarded_to) { t.awarded_to = b.awarded_to; t.status = "Awarded"; t.history.push({ date: now, author: who, action: `Awarded to ${b.awarded_to}` }); }
        t.modified_date = now; await saveTender(); return send(res, 200, t);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
  }

  // ── IFC upload → That Open Platform (Phase C: browser bakes → bridge uploads; token stays server-side) ──
  //   POST /ifc?name=<x.ifc>&version=<vN>&projectId=<Sentinel project key>   body = raw .ifc bytes
  // The browser can't hold THATOPEN_API_KEY, so it POSTs the baked IFC here; the bridge converts it to
  // fragments and uploads via the same @thatopen/services client the outbox watcher uses. That spends the founder's
  // platform storage, so the caller must be trusted for the project it names before one byte is read (H0, D2).
  if (url.pathname === "/ifc" && req.method === "POST") {
    try {
      await requireSpendFor(url.searchParams.get("projectId"), "projectId");
      holdUpload(req, res, currentSub()); // held until this answer is done
      const bytes = await readRaw(req);
      if (!bytes.length) return send(res, 400, { message: "Empty body — POST the .ifc file as the request body." });
      // Only an IFC reaches the platform: the shared publish path uploads the raw bytes when conversion fails (Governed
      // Intake relies on that fallback), so a body that is not a STEP file is refused here.
      const { uploadIfcAsFrag, isIfcStep } = await import("./platform-publish.mjs");
      if (!isIfcStep(bytes)) return send(res, 400, { message: "Not an IFC file — it must start with ISO-10303-21; nothing was uploaded." });
      const name = url.searchParams.get("name") || "sentinel-model.ifc";
      const versionTag = url.searchParams.get("version") || "v1";
      let out;
      try { out = await uploadIfcAsFrag(bytes, name, versionTag); }
      catch (e) {
        const msg = String(e?.message || e);
        // A revoked/rotated platform token 401s "Token not found" here — turn that into an actionable message. Only the
        // upload's errors: a refused caller above keeps its own 401/403 words.
        if (e?.status === 401 || /token not found|unauthor/i.test(msg))
          return send(res, 401, { message: `Platform API token invalid or expired — regenerate THATOPEN_API_KEY (dashboard → Data → API Tokens) in config/.env and restart the bridge. [${msg.slice(0, 40)}]` });
        throw e;
      }
      return send(res, 200, out);
    } catch (e) {
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // ── Encrypted file blobs (Phase 2, private CDE): POST /cde/files?project=<key> · GET /cde/files/:id?project=<key> ──
  // The body is already AES-GCM ciphertext (IV‖ct) from the browser; we store/serve opaque bytes only. Each blob lives
  // in its project's folder (CDE_FILES_ROOT/<project id>/<id>.bin): storing one spends the founder's disk, so the
  // caller must be trusted for that project before one byte is read (H0 D2, cdefiles-1), and reading one needs
  // membership of it (cdefiles-2). Above the /cde/ block: these routes answer their own 503 when the CDE is off.
  if (url.pathname === "/cde/files" && req.method === "POST") {
    try {
      const proj = await requireSpendFor(url.searchParams.get("project"), "project");
      holdUpload(req, res, currentSub()); // held until this answer is done
      const bytes = await readRaw(req, { max: MAX_BLOB });
      if (!bytes.length) return send(res, 400, { message: "Empty body — nothing was stored." });
      const id = randomUUID();
      const dir = join(CDE_FILES_ROOT, proj.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.bin`), bytes);
      return send(res, 201, { id, size: bytes.length });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[cde] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
  const fm = url.pathname.match(/^\/cde\/files\/([A-Za-z0-9-]+)$/);
  if (fm && req.method === "GET") {
    try {
      const key = url.searchParams.get("project");
      const name = `${basename(fm[1])}.bin`; // basename() guards path traversal
      let file = null;
      if (key) {
        const cde = await import("./cde-store.mjs");
        if (!cde.cdeConfigured()) return send(res, 503, { message: "CDE not configured — encrypted files are stored per project, so the bridge needs SUPABASE_URL + SUPABASE_SERVICE_KEY." });
        file = join(CDE_FILES_ROOT, (await cde.ensureProject(key)).id, name); // a non-member is refused here
      }
      // Blobs stored before H0 sit unbound in the root folder: only the machine credential still reads those.
      if (!currentUserToken() && (!file || !existsSync(file))) file = join(CDE_FILES_ROOT, name);
      if (!file) return send(res, 400, { message: "name the project: GET /cde/files/<id>?project=<project key>" });
      if (!existsSync(file)) return send(res, 404, { message: "Blob not found" });
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-cache", ...corsHeaders(res) });
      // Streamed: parallel reads of a large blob never hold it whole in memory. pipeline(), not .pipe(): a client that
      // aborts mid-download must close the file handle too, or aborted downloads leak fds towards EMFILE.
      return pipeline(createReadStream(file), res, () => {});
    } catch (e) {
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // ── CDE (ISO 19650) — Supabase-backed information containers, states, audit, transmittals (C3) ──
  //   GET/POST /cde/:key/containers · GET /cde/:key/audit · GET/POST /cde/:key/transmittals · POST /cde/:key/gate
  //   POST /cde/containers/:cid/versions · POST /cde/versions/:vid/transition  { state, actor, note, override? }
  if (url.pathname.startsWith("/cde/")) {
    const cde = await import("./cde-store.mjs");
    if (!cde.cdeConfigured()) {
      return send(res, 503, { message: "CDE not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env, then restart the service." });
    }
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['cde', p1, p2, p3]
      const p1 = seg[1], p2 = seg[2], p3 = seg[3]; const p4 = seg[4];
      // Projects hub: GET/POST /cde/projects — reserved key, safe because every per-project
      // route carries a p2 segment (/cde/:key/containers…), so a bare /cde/projects can't collide.
      if (p1 === "projects" && !p2) {
        if (req.method === "GET") return send(res, 200, await cde.listProjects());
        if (req.method === "POST") return send(res, 201, await cde.createProject(await readBody(req)));
      }
      // Project administration (Forma-style): PATCH = rename / settings (metadata.settings), DELETE = hard
      // delete (cascades; 409 when published versions exist — those are immutable, archive instead).
      if (p1 === "projects" && p2 && !p3) {
        const key = decodeURIComponent(p2);
        if (req.method === "PATCH") {
          const b = await readBody(req);
          if (b?.kind !== undefined) { const m = await import("./members-store.mjs"); await m.requireMinRole(key, "owner"); }
          return send(res, 200, await cde.updateProject(key, b, b?.actor));
        }
        if (req.method === "DELETE") return send(res, 200, await cde.deleteProject(key, "web"));
      }
      // GET /cde/projects/:key/scope — the office relation and, for an office, its projects' keys, read with the service
      // key (projectScope). D7 (cde-9, cde-rem-8): a signed-in caller must be a member of the project or of its office;
      // absent and not-yours are one 404 (projectNotFound). The check is here, not in projectScope: journey-store,
      // check-registry and the artefact PUT call projectScope after their own checks.
      if (p1 === "projects" && p2 && p3 === "scope" && req.method === "GET") {
        const key = decodeURIComponent(p2);
        let scope = null;
        try { scope = await cde.projectScope(key); } catch (e) { if (e?.status !== 404) throw e; }
        if (scope && currentUserToken()) {
          const keys = [key, scope.office_key].filter(Boolean).map(encodeURIComponent).join(",");
          const mine = await cde.sb(`projects?key=in.(${keys})&select=key`); // forwarded → RLS: only the caller's own projects
          if (!mine?.length) scope = null;
        }
        if (!scope) throw cde.projectNotFound(key);
        return send(res, 200, scope);
      }
      // ── Office intake: the add-in's standards pack + type catalogue ("snapshot") and scan reports.
      //    Latest wins; each receipt is audited; the readiness checks (office.*) read them.
      if (p2 === "office" && p3 === "snapshot" && req.method === "POST") {
        const office = await import("./office-store.mjs");
        const b = await readBody(req);
        return send(res, 201, await office.saveSnapshot(p1, b, b.actor || "revit"));
      }
      if (p2 === "office" && p3 === "scan" && req.method === "POST") {
        const office = await import("./office-store.mjs");
        const b = await readBody(req);
        return send(res, 201, await office.saveScan(p1, b, b.actor || "revit"));
      }
      if (p2 === "office" && p3 === "snapshot" && req.method === "GET") {
        const office = await import("./office-store.mjs");
        const s = await office.getSnapshot(p1);
        return s ? send(res, 200, s) : send(res, 404, { message: "no office snapshot received for this project yet" });
      }
      if (p2 === "office" && p3 === "scan" && req.method === "GET") {
        const office = await import("./office-store.mjs");
        const s = await office.getScan(p1);
        return s ? send(res, 200, s) : send(res, 404, { message: "no scan report received for this project yet" });
      }
      // ── Members: add-by-email (sign-up-first), roles, last-owner guard. Writes ride the
      // forwarded session so 0004's lead-gate RLS decides; /me tells the UI what to render.
      if (p2 === "members" && !p3 && req.method === "GET") {
        const members = await import("./members-store.mjs");
        return send(res, 200, await members.listMembers(p1));
      }
      if (p2 === "members" && p3 === "me" && req.method === "GET") {
        const members = await import("./members-store.mjs");
        return send(res, 200, { role: await members.myRole(p1) });
      }
      if (p2 === "members" && !p3 && req.method === "POST") {
        const members = await import("./members-store.mjs");
        const b = await readBody(req);
        return send(res, 201, await members.addMember(p1, b, b.actor || "web"));
      }
      if (p2 === "members" && p3 && p3 !== "me" && req.method === "PATCH") {
        const members = await import("./members-store.mjs");
        const b = await readBody(req);
        return send(res, 200, await members.changeRole(p1, p3, b.role, b.actor || "web"));
      }
      if (p2 === "members" && p3 && p3 !== "me" && req.method === "DELETE") {
        const members = await import("./members-store.mjs");
        const b = await readBody(req);
        return send(res, 200, await members.removeMember(p1, p3, b.actor || "web"));
      }
      if (p2 === "containers" && !p3) {
        if (req.method === "GET") return send(res, 200, await cde.listContainers(p1));
        if (req.method === "POST") return send(res, 201, await cde.createContainer(p1, await readBody(req)));
      }
      // File versioning (migration 0011): a file = a container, each upload = a version, one `is_live` pointer.
      //   GET  /cde/:key/files                          → files + version history (newest first, live flagged)
      //   POST /cde/:key/files  { name, revision?, author?, size_bytes?, sha256?, platform_item_id?, notes? }
      //        → create-or-append a version (becomes live). Same rows the CDE panel shows (one source of truth).
      //   POST /cde/:key/files/set-live  { version_id, actor? }  → flip the live pointer to another version.
      if (p2 === "files" && !p3) {
        if (req.method === "GET") return send(res, 200, await cde.listFiles(p1));
        if (req.method === "POST") return send(res, 201, await cde.registerFileVersion(p1, await readBody(req)));
      }
      if (p2 === "files" && p3 === "set-live" && req.method === "POST") {
        const b = await readBody(req);
        return send(res, 200, await cde.setLiveVersion(b.version_id, b.actor));
      }
      // Per-file admin (Forma-style): rename · archive (published → 'archived', drafts discarded) ·
      // delete (409 when published versions exist — immutable, archive instead).
      if (p2 === "files" && p3 === "rename" && req.method === "POST") {
        const b = await readBody(req);
        return send(res, 200, await cde.renameFile(p1, b.container_id, b.name, b.actor));
      }
      if (p2 === "files" && p3 === "archive" && req.method === "POST") {
        const b = await readBody(req);
        return send(res, 200, await cde.archiveFile(p1, b.container_id, b.actor));
      }
      if (p2 === "files" && p3 === "unarchive" && req.method === "POST") {
        const b = await readBody(req);
        return send(res, 200, await cde.unarchiveFile(p1, b.container_id, b.actor));
      }
      if (p2 === "files" && p3 === "delete" && req.method === "POST") {
        const b = await readBody(req);
        return send(res, 200, await cde.deleteFile(p1, b.container_id, b.actor));
      }
      // GET /cde/:key/audit?entity_type=&action_prefix=&entity_id=&actor=&since=&until=&limit=&offset=
      //   → { rows, total, limit, offset }, newest first; total is exact; a bad filter is a 400 (cde-store.mjs auditQuery).
      if (p2 === "audit" && req.method === "GET") return send(res, 200, await cde.listAudit(p1, Object.fromEntries(url.searchParams)));
      // POST /cde/:key/audit {entity_type, action, actor?, entity_id?, old_value?, new_value?} → 201 the stored row.
      //   verdict:, gate:, roi:, state:, hold: and review: actions and stage_gate, hold, delivery_gate and review rows are
      //   Sentinel's own → 400 (cde-store.mjs recordAudit).
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordAudit(p1, await readBody(req)));
      // The stage gate (cohesion phase 5c, spec Decision 10): POST /cde/:key/gate {stage, actor?} → the run — {stage, status:
      //   pass|hold|not_checkable, checks[{label, ok, na, detail, source}], next_stage, ledger: {id, hash}}. Lead only (403);
      //   the bridge measures the gate's inputs itself and writes the stage_gate row (cde-store.mjs runStageGate); the
      //   project's stage is then its newest gate:pass row (GET /projects/:key). A stage outside the six is a 400; not
      //   the current stage a 409. The actor is the signed-in identity, else the claim, else web — as every ledger sink.
      if (p2 === "gate" && !p3 && req.method === "POST") {
        const b = (await readBody(req)) || {};
        if (!cde.STAGES.includes(b.stage)) return send(res, 400, { message: `stage must be one of ${cde.STAGES.join(", ")}` });
        return send(res, 200, await cde.runStageGate(p1, b.stage, b.actor));
      }
      // Revit's delivery gate (phase 6a, spec 2026-09-27 Decision 5): POST /cde/:key/delivery-gate {file, result, passed,
      //   contract, contract_ref, contract_source, contract_sha256, schema, entities, failures[], sha256, size_bytes,
      //   source: revit|auto-publish|check, publish} → 201 {id, hash, hold: {id, hash} | null}. The machine credential
      //   only (a signed-in caller is a 403); a bad field a 400; a FAIL with publish true is also held (hold:gate).
      if (p2 === "delivery-gate" && !p3 && req.method === "POST") return send(res, 201, await cde.recordDeliveryGate(p1, (await readBody(req)) || {}));
      // The Holding Area (phase 6a, spec 2026-09-27 Decisions 7-8): GET /cde/:key/holding → 200 {items, cleared_recent},
      //   derived from the hold rows and the registered versions; a read that fails is a 502 "not read — …", never an
      //   empty list. POST /cde/:key/holding/dismiss {container_name, reason} → 201 {id, hash}: lead only (403), a reason
      //   required (400), a name on hold (409) — one hold:dismissed row (cde-store.mjs readHolding, dismissHold).
      if (p2 === "holding" && !p3 && req.method === "GET") return send(res, 200, await cde.readHolding(p1));
      if (p2 === "holding" && p3 === "dismiss" && !p4 && req.method === "POST") return send(res, 201, await cde.dismissHold(p1, (await readBody(req)) || {}));
      // The review chain (phase 6b, spec 2026-09-27 Decisions 12-14). GET /cde/:key/reviews → 200 {items}: the open chains
      //   on the project's shared versions, each with the step it waits on, the approvals so far and whether this caller
      //   may decide it (can_decide, why_not); a read that fails is a 502 "not read — …", never an empty list (cde-store.mjs
      //   readReviews). POST /cde/:key/versions/:vid/review {decision: approve|reject, note} → 200 review_decide's answer
      //   {id, hash, decision, step, of, name, role, published, state, container_name, bcf}: a signed-in person's only (a
      //   403 before any call — the machine never decides); the database's refusals in its words (409 / 404 / 403). A
      //   rejection raises one BCF topic "Review: <container> rejected at step <k> — <note>", best-effort: bcf {guid}, or
      //   {error} — it never fails the decision; null on an approval.
      if (p2 === "reviews" && !p3 && req.method === "GET") return send(res, 200, await cde.readReviews(p1));
      if (p2 === "versions" && p3 && p4 === "review" && !seg[5] && req.method === "POST") {
        const b = (await readBody(req)) || {};
        const r = await cde.reviewDecide(p1, p3, { decision: b.decision, note: b.note });
        let bcf = null;
        if (r.decision === "reject") {
          try {
            const { rejectionTopic } = await import("./review-logic.mjs");
            const topic = cde.newTopicObject(p1, { ...rejectionTopic(r, b.note), topic_type: "Issue", priority: "High" }, new Date().toISOString());
            await cde.bcfCreateTopic(topic);
            broadcast(p1, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
            bcf = { guid: topic.guid };
          } catch (e) { bcf = { error: String(e?.message || e) }; }
        }
        return send(res, 200, { ...r, bcf });
      }
      // The propose API (referee): POST /cde/:key/propose { source, actor?, ids?, elements[], note?, container_name?,
      //   version_id? | register?: {name, size_bytes, sha256}, gate_row_id?, raise_bcf? }
      //   → { verdict: accepted|rejected|recorded, downgraded, summary, failures[], audit_id, version, verdict_audit_id, hold, bcf? }.
      //   hold: a rejected register from a caller who could register it, judged by the installed standards, is held
      //   (hold:naming | hold:ids) — {id, hash} of that row, else null (phase 6a).
      //   Agents propose; the governed core (IDS + rules) adjudicates deterministically and records the verdict
      //   immutably. Nothing in scope answers recorded (downgraded "nothing in scope"); a version_id must be this
      //   project's (400) and needs the lead role (403; phase 6b — a stamp lets a version into a review chain); register
      //   registers the version on accepted/recorded and stamps it (cde-store adjudicateProposal);
      //   a client-sent IDS or naming ruleset never stamps or registers a version (400).
      //   G2: on a REJECT, each failing requirement auto-opens as a BCF issue (live-synced to web + Revit),
      //   unless the caller passes raise_bcf:false. Best-effort — a BCF hiccup never changes the verdict.
      if (p2 === "propose" && !p3 && req.method === "POST") {
        const b = await readBody(req);
        const result = await cde.adjudicateProposal(p1, b);
        // Raise a BCF issue per failing requirement whenever there ARE element failures and the IDS isn't "off"
        // — covers both a hard reject AND a warn (published-but-flagged), so warned checks are still tracked.
        if ((result.failures?.length > 0) && result.ids_enforce !== "off" && b.raise_bcf !== false) {
          try { result.bcf = await raiseGovernedFailureTopics(cde, p1, result, { author: b.actor || b.source }); }
          catch (e) { result.bcf = { raised: 0, error: String(e?.message || e) }; }
        }
        return send(res, 200, result);
      }
      // Project artefacts (standards in force): the store every judge reads through (cohesion phases 1 and 3).
      //   GET /cde/:key/artefacts (this project's own pointers) · GET /cde/:key/artefacts/:kind (project → office → 404;
      //   the answer names source, ref and sha) · GET /cde/:key/artefacts/:kind/:version
      //   PUT /cde/:key/artefacts/:kind  body = the artefact JSON (ids: {title, specifications, enforce?};
      //   ruleset: {standard_key, semver, rules}; naming: {standard_key, semver, title, separator, fields};
      //   contract, layers, guideline, type_catalog: the shapes artefact-store validateArtefact checks — 400 names the field;
      //   publish: exactly {auto: true} or {auto: false}, the lead's auto-publish policy, read by the add-in from phase 5b)
      if (p2 === "artefacts") {
        const art = await import("./artefact-store.mjs");
        // POST /cde/:key/artefacts/ids/close-superseded — lead only, audited (F51). Before the GET routes so
        // the p4 segment is never read as a version.
        if (p3 === "ids" && p4 === "close-superseded" && req.method === "POST") {
          const { requireMinRole } = await import("./members-store.mjs");
          await requireMinRole(p1, "lead");
          const b = await readBody(req);
          return send(res, 200, await closeSupersededIdsTopics(cde, p1, resolveActor(b?.actor || url.searchParams.get("actor"), "web")));
        }
        if (!p3 && req.method === "GET") return send(res, 200, await art.listArtefacts(p1));
        if (p3 && !p4 && req.method === "GET") {
          const r = await art.artefactReply(p1, p3, req.headers["if-none-match"]);
          return send(res, r.status, r.body, r.etag && { ETag: r.etag });
        }
        if (p3 && p4 && req.method === "GET") {
          const a = await art.getArtefactVersion(p1, p3, p4);
          return a ? send(res, 200, a) : send(res, 404, { message: `no ${p3}@${p4} for ${p1}` });
        }
        if (p3 && !p4 && req.method === "PUT") {
          const body = await readBody(req);
          const actor = url.searchParams.get("actor") || body?.installed_by || "web";
          const source = body?.source && typeof body.source === "object" ? body.source : undefined;
          const { source: _s, installed_by: _i, ...artefact } = body || {};
          const pointer = await art.putArtefact(p1, p3, artefact, { actor, source });
          // F51: a new IDS marks the open IDS topics it supersedes. Best-effort — the install already stands.
          if (p3 === "ids") {
            try {
              const ref = `ids@${pointer.version}`, who = resolveActor(actor, "web");
              pointer.superseded_topics = await markSupersededIdsTopics(cde, p1, ref, who);
              // An office install also supersedes the office-raised topics of every project in its scope.
              const { projectScope } = await import("./office-scope.mjs");
              const scope = await projectScope(p1);
              if (scope.kind === "office")
                for (const k of scope.keys.slice(1)) pointer.superseded_topics.push(...await markSupersededIdsTopics(cde, k, ref, who, "supersededByOffice"));
            }
            catch (e) { pointer.superseded_error = String(e?.message || e); }
          }
          return send(res, 201, pointer);
        }
      }
      // Governed Intake: the whole Governed Publish loop for an IFC from any source (no Revit).
      //   POST /cde/:key/intake?name=<ISO name.ifc>&source=<who>[&actor=&revision=&note=&raise_bcf=false
      //        &agent_model=&agent_tool=&agent_prompt_sha256=]   body = raw .ifc bytes
      if (p2 === "intake" && !p3 && req.method === "POST") {
        // A trusted caller first (D2): the key is in the URL, so a refusal reads no byte of the upload.
        const { requireSpend } = await import("./members-store.mjs");
        await requireSpend(p1);
        holdUpload(req, res, currentSub()); // held until this answer is done
        const bytes = await readRaw(req);
        const q = (k) => url.searchParams.get(k) || undefined;
        const agent = (q("agent_model") || q("agent_tool") || q("agent_prompt_sha256")) ? { kind: "agent", model: q("agent_model"), tool: q("agent_tool"), prompt_sha256: q("agent_prompt_sha256") } : undefined;
        const { runIntake } = await import("./intake-logic.mjs");
        const { checkDelivery, gateNotChecked } = await import("./delivery-gate.mjs");
        const { extractElements } = await import("./ifc-extract.mjs");
        const { uploadIfcAsFrag } = await import("./platform-publish.mjs");
        const art = await import("./artefact-store.mjs");
        const deps = {
          // project → office → none, re-checked (spec 2026-09-25 4b decision 6): the office's contract judges intake as it judges Revit.
          loadContract: (key) => art.resolveContract(key),
          checkDelivery, gateNotChecked, extractElements,
          adjudicate: (key, body, opts) => cde.adjudicateProposal(key, body, opts),
          // Best-effort, same as the /propose route: a BCF hiccup after the verdict is already on the
          // ledger must not 500 the whole intake and drop the caller's audit_id/receipt.
          raiseBcf: async (key, result, opts) => {
            try { return await raiseGovernedFailureTopics(cde, key, result, opts); }
            catch (e) { return { raised: 0, error: String(e?.message || e) }; }
          },
          uploadIfc: uploadIfcAsFrag,
          registerFileVersion: (key, body) => cde.registerFileVersion(key, body),
          recordVersionVerdict: (key, vid, result, actor) => cde.recordVersionVerdict(key, vid, result, actor),
          audit: async (key, action, actor, value) => { const proj = await cde.ensureProject(key); return cde.audit(proj.id, "delivery_gate", null, action, actor, null, value); },
          // A gate FAIL is held only when the caller could register the file (spec 2026-09-27 Decision 4).
          writeHold: (key, h) => cde.holdIfCouldRegister(key, h),
        };
        const result = await runIntake(deps, { key: p1, name: q("name"), bytes, source: q("source"), actor: q("actor"), revision: q("revision"), note: q("note"), agent, raise_bcf: q("raise_bcf") !== "false" });
        // A published version gets its manifest for the Federation Gate. Never fails the publish.
        if (result.version?.version_id) {
          try {
            const { captureManifest } = await import("./manifest-store.mjs");
            result.manifest = await captureManifest(p1, result.version.version_id, bytes, { actor: q("actor") || q("source"), source: "intake", rev_code: result.version.revision });
          } catch (e) {
            console.warn(`[intake] manifest capture failed for version ${result.version.version_id}: ${e?.message || e}`);
            result.manifest = { error: String(e?.message || e) };
          }
        }
        return send(res, 200, result);
      }
      // Manifests (Federation Gate inputs): GET /cde/:key/manifests · POST /cde/:key/manifests/:versionId (body = IFC bytes, backfill)
      if (p2 === "manifests") {
        const ms = await import("./manifest-store.mjs");
        if (!p3 && req.method === "GET") return send(res, 200, await ms.listManifests(p1));
        if (p3 && req.method === "POST") {
          if (!cde.isUuid(p3)) return send(res, 400, { message: "not a version id" });
          // A backfill rewrites a Federation Gate input: a lead's call (D4), made before a byte of the IFC is read — and,
          // like every upload, a trusted caller's (D2): a lead of a project anyone can make by signing up is not enough.
          const { requireMinRole, requireSpend } = await import("./members-store.mjs");
          await requireMinRole(p1, "lead");
          await requireSpend(p1);
          holdUpload(req, res, currentSub()); // held until this answer is done
          const bytes = await readRaw(req);
          if (!bytes.length) return send(res, 400, { message: "Empty body — POST the .ifc file as the request body." });
          return send(res, 201, await ms.captureManifest(p1, p3, bytes, { actor: url.searchParams.get("actor") || "cli", source: "backfill", rev_code: url.searchParams.get("revision") || null }));
        }
      }
      // Federation Gate: GET /cde/:key/federation · POST /cde/:key/federation/run { versions?, raise_bcf? }
      if (p2 === "federation") {
        const fed = await import("./federation-store.mjs");
        if (!p3 && req.method === "GET") return send(res, 200, await fed.getFederation(p1));
        if (p3 === "run" && !p4 && req.method === "POST") {
          const body = (await readBody(req)) || {};
          const actor = url.searchParams.get("actor") || body.actor || "web";
          const run = await fed.runFederation(p1, { versions: body.versions }, { actor });
          if (run.result.verdict === "fail" && body.raise_bcf !== false) {
            try { run.bcf = await raiseFederationTopics(cde, p1, run, { author: actor }); }
            catch (e) { run.bcf = { raised: 0, error: String(e?.message || e) }; }
          }
          return send(res, 200, run);
        }
      }
      // The Next strip (spec 2026-09-24 §2): GET /cde/:key/journey — read-only; any member (getJourney's
      // ensureProject gate, the same check every /cde/:key read has). Standards in force, steps with evidence, next.
      if (p2 === "journey" && !p3 && req.method === "GET") {
        const { getJourney } = await import("./journey-store.mjs");
        return send(res, 200, await getJourney(p1));
      }
      // Element snapshots (revision tracking, migration 0005):
      //   POST /cde/:key/snapshots  { rev_code?, model_id?, uploaded_by?, container_version_id?, snapshots:[{guid,category,type_name,count,length,area,volume,weight}] }
      //   GET  /cde/:key/snapshots            → revision metadata (newest first, the baseline picker)
      //   GET  /cde/:key/snapshots/:revId     → that revision's element rows (for diffing / rehydrating a baseline)
      if (p2 === "snapshots" && !p3) {
        if (req.method === "GET") return send(res, 200, await cde.listRevisions(p1));
        if (req.method === "POST") return send(res, 201, await cde.createRevision(p1, await readBody(req)));
      }
      //   GET  /cde/:key/snapshots/delta?from=&to=  → what changed between two revisions, priced and
      //        carbon-costed by REFERENCE (must precede the :revId read below — "delta" is not an id)
      if (p2 === "snapshots" && p3 === "delta" && req.method === "GET")
        return send(res, 200, await cde.revisionDelta(p1, { from: url.searchParams.get("from") || undefined, to: url.searchParams.get("to") || undefined }));
      if (p2 === "snapshots" && p3 && req.method === "GET") return send(res, 200, await cde.getRevisionSnapshots(p3));
      // IFC5-aligned ECS export of the governed element graph: GET /cde/:key/element-graph[?revision=<id>]
      if (p2 === "element-graph" && !p3 && req.method === "GET") return send(res, 200, await cde.getElementGraph(p1, url.searchParams.get("revision") || undefined));
      // E2E crypto keystore (envelope scheme): the server-side wrapped DEK + salt for a project. Useless
      //   without the passphrase (zero-knowledge). GET → keystore|null · POST → create-only (409 if exists) ·
      //   PUT → replace (passphrase re-key).
      if (p2 === "keystore" && !p3) {
        if (req.method === "GET") return send(res, 200, (await cde.docGet("keystore", p1, "keystore")) ?? null);
        if (req.method === "POST") {
          try { await cde.docInsert("keystore", p1, "keystore", await readBody(req)); return send(res, 201, { ok: true }); }
          catch (e) { const m = String(e?.message || e); return send(res, /409|duplicate|conflict/i.test(m) ? 409 : 500, { message: m }); }
        }
        if (req.method === "PUT") { await cde.docUpsert("keystore", p1, "keystore", await readBody(req)); return send(res, 200, { ok: true }); }
      }
      // Folders (per-project tree): GET/POST /cde/:key/folders · PUT/DELETE /cde/folders/:fid · PUT /cde/containers/:cid/folder
      if (p2 === "folders" && !p3) {
        if (req.method === "GET") return send(res, 200, await cde.listFolders(p1));
        if (req.method === "POST") return send(res, 201, await cde.createFolder(p1, await readBody(req)));
      }
      if (p1 === "folders" && p2 && !p3) {
        if (req.method === "PUT") return send(res, 200, await cde.renameFolder(p2, await readBody(req)));
        if (req.method === "DELETE") return send(res, 200, await cde.deleteFolder(p2, await readBody(req)));
      }
      if (p1 === "containers" && p2 && p3 === "folder" && req.method === "PUT") {
        return send(res, 200, await cde.moveContainer(p2, await readBody(req)));
      }
      if (p2 === "transmittals") {
        if (req.method === "GET") return send(res, 200, await cde.listTransmittals(p1));
        if (req.method === "POST") return send(res, 201, await cde.createTransmittal(p1, await readBody(req)));
      }
      if (p1 === "containers" && p3 === "versions" && req.method === "POST") {
        return send(res, 201, await cde.addVersion(p2, await readBody(req)));
      }
      // override: the lead's reason to publish a version with no accepted verdict that measured something, passed
      // through as given (a non-string is a 400); cde_transition (0031) takes it only from a signed-in lead. A refusal
      // is a 409 in the function's words, a role refusal a 403, an unknown version a 404 (cde-store.mjs transition).
      if (p1 === "versions" && p3 === "transition" && req.method === "POST") {
        const body = await readBody(req);
        return send(res, 200, await cde.transition(null, p2, body.state, { actor: body.actor, note: body.note, override: body.override }));
      }
      return send(res, 404, { message: "CDE route not found" });
    } catch (e) {
      // Log server-side so a 500 on a real-model propose (a character Postgres rejects in element data) is
      // diagnosable instead of vanishing into a generic dialog on the Revit side. Auth failures stay quiet.
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[cde] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // ── Governed AI modeling: staged element changesets (propose → human ticks in Revit → result) ──
  //   POST /changesets/:key            · GET /changesets/:key?status=proposed
  //   GET  /changesets/:key/:id        · POST /changesets/:key/:id/result { applied, rejected, note }
  //   POST /changesets/:key/:id/withdraw
  // The module dispatchers below match the whole first segment — /bimdocs, never /bimdocsZZ — so a rule keyed on a
  // route (a rate limit, a proxy allowlist, a log alert) sees the route it names.
  const top = url.pathname.split("/")[1];
  if (top === "changesets") {
    const ch = await import("./changesets-store.mjs");
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['changesets', key, id?, action?]
      const [, key, p2, p3] = seg;
      const body = req.method === "POST" ? await readBody(req) : {};
      const actor = body.actor || (p3 === "result" ? "revit" : "agent");
      if (!key) return send(res, 404, { message: "changesets route not found" });

      if (!p2 && req.method === "GET") return send(res, 200, await ch.listChangesets(key, { status: url.searchParams.get("status") || undefined }));
      if (!p2 && req.method === "POST") return send(res, 201, await ch.proposeChangeset(key, body, actor));
      if (p2 && !p3 && req.method === "GET") return send(res, 200, await ch.getChangeset(key, p2));
      if (p2 && p3 === "result" && req.method === "POST") return send(res, 200, await ch.reportResult(key, p2, body, actor));
      if (p2 && p3 === "withdraw" && req.method === "POST") return send(res, 200, await ch.withdrawChangeset(key, p2, actor));
      return send(res, 404, { message: "changesets route not found" });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[changesets] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // ── Verdict receipts: the shareable proof that an adjudication is on the ledger ──
  //   GET  /receipt/:key/:auditId   → the receipt for a recorded adjudication
  //   POST /receipt/:key/verify { receipt } → { matches, reasons, ledger }   (a bearer or member JWT; an armed
  //   bridge answers every other caller hash-only in publicReceiptVerify, before the gates — phase 4c)
  //   Both are READ-ONLY. Verification is offered as a service precisely so a client does not have
  //   to take the receipt-holder's word for it.
  if (top === "receipt") {
    const cde = await import("./cde-store.mjs");
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['receipt', key, idOrVerify]
      const [, key, tail] = seg;
      if (!key) return send(res, 404, { message: "receipt route not found" });
      if (tail === "verify" && req.method === "POST") {
        const body = await readBody(req);
        return send(res, 200, await cde.checkReceipt(key, body.receipt ?? body));
      }
      if (tail && req.method === "GET") {
        const receipt = await cde.receiptFor(key, tail);
        if (!receipt) return send(res, 404, { message: "no ledger entry with that audit id on this project" });
        return send(res, 200, { receipt });
      }
      return send(res, 404, { message: "receipt route not found" });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[receipt] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // ── Task teams: the ISO 19650 responsibility matrix a TIDP belongs to ──
  //   GET/POST /teams/:key · PATCH/DELETE /teams/:key/:id
  //   Role gating is RLS's job (0026: members read, leads write) — the bridge forwards the session.
  if (top === "teams") {
    const tt = await import("./task-teams-store.mjs");
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['teams', key, id]
      const [, key, id] = seg;
      const body = ["POST", "PATCH"].includes(req.method) ? await readBody(req) : {};
      const actor = body.actor || "web";
      if (!key) return send(res, 404, { message: "teams route not found" });

      if (!id && req.method === "GET") return send(res, 200, await tt.listTeams(key));
      if (!id && req.method === "POST") return send(res, 201, await tt.createTeam(key, body, actor));
      if (id && req.method === "PATCH") return send(res, 200, await tt.updateTeam(key, id, body, actor));
      if (id && req.method === "DELETE") return send(res, 200, await tt.deleteTeam(key, id, actor));
      return send(res, 404, { message: "teams route not found" });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[teams] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // ── MIDP/TIDP deliverables: planned rows + derived planned-vs-actual status ──
  //   GET  /deliverables/:key            · GET /deliverables/:key/status (derived, read-only)
  //   GET  /deliverables/:key/tidp       (the same rows grouped by task team, rolled into the MIDP)
  //   GET  /deliverables/:key/report     (the weekly information-delivery status report, markdown)
  //   POST /deliverables/:key/rebaseline { rows: [{container_name, due_date}], apply?: true }
  //        — without `apply` this is a read-only preview of what moving the programme would do.
  //   POST /deliverables/:key            · POST /deliverables/:key/import { rows: [...] }
  //   PATCH/DELETE /deliverables/:key/:id
  if (top === "deliverables") {
    const dl = await import("./deliverables-store.mjs");
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['deliverables', key, p2]
      const [, key, p2] = seg;
      const body = ["POST", "PATCH"].includes(req.method) ? await readBody(req) : {};
      const actor = body.actor || "web";
      if (!key) return send(res, 404, { message: "deliverables route not found" });

      if (!p2 && req.method === "GET") return send(res, 200, await dl.listDeliverables(key));
      if (p2 === "status" && req.method === "GET") return send(res, 200, await dl.deliverableStatus(key));
      if (p2 === "tidp" && req.method === "GET") return send(res, 200, await dl.tidpReport(key));
      if (p2 === "report" && req.method === "GET") return send(res, 200, await dl.weeklyReportMarkdown(key));
      if (p2 === "rebaseline" && req.method === "POST")
        return send(res, 200, body.apply
          ? await dl.rebaselineApply(key, body.rows, actor)
          : await dl.rebaselinePreview(key, body.rows));
      if (!p2 && req.method === "POST") return send(res, 201, await dl.createDeliverable(key, body, actor));
      if (p2 === "import" && req.method === "POST") return send(res, 201, await dl.importDeliverables(key, body.rows, actor));
      if (p2 && !["status", "import", "tidp", "report", "rebaseline"].includes(p2) && req.method === "PATCH")
        return send(res, 200, await dl.updateDeliverable(key, p2, body, actor));
      if (p2 && !["status", "import", "tidp", "report", "rebaseline"].includes(p2) && req.method === "DELETE")
        return send(res, 200, await dl.deleteDeliverable(key, p2, actor));
      return send(res, 404, { message: "deliverables route not found" });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[deliverables] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // ── BIM Documents (BEP/EIR) — structured ISO 19650 documents, versioned & audited ──
  //   GET  /bimdocs/templates · POST /bimdocs/compile-ids { text } (prose → proposed IDS, installs nothing)
  //   GET  /bimdocs/:key · POST /bimdocs/:key { doc_type, title }
  //   GET  /bimdocs/:key/:docId
  //   PATCH /bimdocs/:key/:docId/section/:sectionId { body?, owner?, state?, updated_at }
  //   POST /bimdocs/:key/:docId/section/:sectionId/draft { provider?, model? } · POST /bimdocs/:key/:docId/integrity { provider?, model? }
  //   POST /bimdocs/:key/:docId/transition { to } · POST /bimdocs/:key/:docId/publish { label }
  //   GET  /bimdocs/:key/:docId/executability  (the strip test — how much of the doc controls anything)
  //   GET  /bimdocs/:key/:docId/versions · GET /bimdocs/:key/:docId/versions/:n
  if (top === "bimdocs") {
    const bimdocs = await import("./bimdocs-store.mjs");
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['bimdocs', p1, p2, p3, p4]
      const [, p1, p2, p3, p4] = seg;
      const isRawUpload = p2 === "ingest" && !p3;
      // compile-ids runs synchronously over the whole text: a prompt-sized cap keeps one body from stalling the bridge.
      const body = !isRawUpload && ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req, { max: p1 === "compile-ids" ? SMALL_JSON : undefined }) : {};
      const actor = body.actor || "web";

      // Ingest: raw document bytes -> AI mapping proposal. Writes nothing; /ingest/commit does.
      if (p2 === "ingest" && !p3 && req.method === "POST") {
        // A trusted caller first (D2: a stored original spends the founder's disk and the model's time); the key is in
        // the URL, so a refusal reads no byte of the upload. The project row is kept for ingestDocument (SPEND-9).
        const { requireSpend } = await import("./members-store.mjs");
        const proj = await requireSpend(p1);
        holdUpload(req, res, currentSub()); // held until this answer is done
        const raw = await readRaw(req, { max: MAX_DOC_UPLOAD });
        if (!raw.length) return send(res, 400, { message: "empty upload" });
        const ingest = await import("./bimdocs-ingest.mjs");
        const name = url.searchParams.get("name") || "document.pdf";
        const docType = url.searchParams.get("doc_type") || "EIR";
        return send(res, 200, await ingest.ingestDocument(raw, { filename: name, doc_type: docType }));
      }
      if (p2 === "ingest" && p3 === "commit" && req.method === "POST") {
        return send(res, 201, await bimdocs.createDocFromIngest(p1, { ...body, actor }));
      }
      if (p3 === "source" && req.method === "GET") {
        const ref = await bimdocs.getSourceRef(p1, p2);
        if (!ref) return send(res, 404, { message: "this document has no original file" });
        const ingest = await import("./bimdocs-ingest.mjs");
        const { readFileSync } = await import("node:fs");
        const buf = readFileSync(ingest.sourceFilePath(ref.file_id));
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(ref.name)}"`,
          "Cache-Control": "no-cache",
          ...corsHeaders(res),
        });
        return res.end(buf);
      }

      if (p1 === "templates" && req.method === "GET") return send(res, 200, bimdocs.listTemplates());
      // POST /bimdocs/compile-ids { text } → proposed IDS specifications compiled from requirement prose.
      // Deterministic and READ-ONLY: it installs nothing. The caller reviews `specifications` against
      // each `source_sentence`, and reads `unmatched` — those requirements are in the document and
      // are NOT in the spec.
      if (p1 === "compile-ids" && req.method === "POST") {
        const { compileIds } = await import("./ids-compile.mjs");
        return send(res, 200, compileIds(body.text, { title: body.title }));
      }
      // Enforcement wiring: the check registry, binding suggestions, binding writes, compliance reads.
      if (p1 === "checks" && !p2 && req.method === "GET") {
        const { listChecks } = await import("./check-registry.mjs");
        return send(res, 200, listChecks());
      }
      if (p3 === "bindings" && p4 === "suggest" && req.method === "POST") {
        const { suggestBindings } = await import("./binding-suggest.mjs");
        const doc = await bimdocs.getDoc(p1, p2);
        return send(res, 200, suggestBindings(doc.sections));
      }
      if (p3 === "section" && p4 && seg[5] === "bindings" && req.method === "PUT")
        return send(res, 200, await bimdocs.setSectionBindings(p1, p2, p4, { ...body, actor }));
      if (p3 === "section" && p4 && seg[5] === "answer" && req.method === "PUT")
        return send(res, 200, await bimdocs.setSectionAnswer(p1, p2, p4, { ...body, actor }));
      if (p3 === "section" && p4 && seg[5] === "plan" && req.method === "PUT")
        return send(res, 200, await bimdocs.setSectionPlan(p1, p2, p4, { ...body, actor }));
      if (p3 === "compliance" && !p4 && req.method === "GET")
        return send(res, 200, await bimdocs.complianceReport(p1, p2));
      if (p3 === "executability" && req.method === "GET")
        return send(res, 200, await bimdocs.executabilityReport(p1, p2));
      if (p3 === "readiness" && req.method === "GET") {
        const rep = await bimdocs.readinessReport(p1, p2);
        if (url.searchParams.get("format") === "md") {
          const { readinessMarkdown } = await import("./readiness-logic.mjs");
          res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="readiness-${p2.slice(0, 8)}.md"`, ...corsHeaders(res) });
          return res.end(readinessMarkdown(rep));
        }
        return send(res, 200, rep);
      }
      if (p1 && p2 && p3 === "comments" && req.method === "GET")
        return send(res, 200, await bimdocs.listComments(p1, p2));
      if (p1 && p2 && p3 === "section" && p4 && seg[5] === "comments" && req.method === "POST") {
        // Any MEMBER may comment (that's the viewer's whole affordance) — membership is enforced
        // by getDoc's ensureProject under a forwarded session; machine callers trusted as ever.
        return send(res, 201, await bimdocs.addComment(p1, p2, p4, body.text, actor));
      }
      if (p1 && !p2 && req.method === "GET") return send(res, 200, await bimdocs.listDocs(p1));
      if (p1 && !p2 && req.method === "POST") return send(res, 201, await bimdocs.createDoc(p1, { ...body, actor }));
      if (p1 && p2 && !p3 && req.method === "GET") return send(res, 200, await bimdocs.getDoc(p1, p2));
      // AI proposals — read-only: nothing here writes; an accepted draft is saved via the normal
      // section PATCH. POST because they trigger slow/paid AI work (mirrors /ingest).
      if (p1 && p2 && p3 === "section" && p4 && seg[5] === "draft" && req.method === "POST") {
        const ai = await import("./bimdocs-ai.mjs");
        return send(res, 200, await ai.draftSection(p1, p2, p4, body || {}));
      }
      if (p1 && p2 && p3 === "integrity" && !p4 && req.method === "POST") {
        const ai = await import("./bimdocs-ai.mjs");
        return send(res, 200, await ai.integrityReport(p1, p2, body || {}));
      }
      if (p3 === "section" && p4 && req.method === "PATCH")
        return send(res, 200, await bimdocs.patchSection(p1, p2, p4, { ...body, actor }));
      if (p3 === "transition" && req.method === "POST")
        return send(res, 200, await bimdocs.transitionDoc(p1, p2, { ...body, actor }));
      if (p3 === "publish" && req.method === "POST")
        return send(res, 200, await bimdocs.publishDoc(p1, p2, { ...body, actor }));
      if (p3 === "versions" && !p4 && req.method === "GET") return send(res, 200, await bimdocs.listVersions(p1, p2));
      if (p3 === "versions" && p4 && req.method === "GET") return send(res, 200, await bimdocs.getVersion(p1, p2, p4));
      return send(res, 404, { message: "bimdocs route not found" });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[bimdocs] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }

  // ── Clash status: GET/POST/PUT /clash/:pid · POST /clash/:pid/reset ──
  //   GET  → { items:[{signature,status,volume,label,bcf_guid,...}] }  (the team-wide "known" set)
  //   POST → upsert body { items:[...] } (raise-time)   ·   PUT → body { signature, status } (lifecycle)
  //   POST /clash/:pid/reset → clear this project's records (re-surface all)
  const cm = url.pathname.match(/^\/clash\/([^/]+)(?:\/(reset))?$/);
  if (cm) {
    const [, cpid, sub] = cm;
    try {
      const cde = await import("./cde-store.mjs");
      const useCde = cde.cdeConfigured(); // Supabase (0009) when configured — genuinely team-wide; local file fallback + lazy migration
      if (req.method === "GET" && !sub)
        return send(res, 200, { items: useCde ? await cde.docListLazy("clash", cpid, cldb.clashes.filter((c) => c.project === cpid), (c) => c.signature) : clashItems(cpid) });
      // H0 (D4, clash-1): recording clashes and moving their status is a contributor's work; clearing the register is a
      // lead's (it re-surfaces every clash and changes the stage gate's hard-clash count). Asked before the body is read;
      // the machine credential passes as service. Each change is on the ledger, by the verified identity: the web wrote
      // these rows itself through POST /cde/:key/audit, which is a lead's notes since D11. A row that fails to write is
      // logged — the register write it records already stands.
      if (req.method === "POST" || req.method === "PUT") await (await import("./members-store.mjs")).requireMinRole(cpid, sub === "reset" ? "lead" : "contributor");
      const ledger = async (action, value) => {
        if (!useCde) return;
        try { await cde.recordAudit(cpid, { entity_type: "clash", actor: "Clash", action, new_value: value }); }
        catch (e) { console.warn(`[clash] ledger row "${action}" not written: ${e?.message || e}`); }
      };
      if (req.method === "POST" && sub === "reset") {
        if (useCde) await cde.docDeleteProject("clash", cpid); else { cldb.clashes = cldb.clashes.filter((c) => c.project !== cpid); persistClash(); }
        await ledger("Clash register reset — every clash re-surfaces on the next run", null);
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && !sub) {
        const items = (await readBody(req)).items;
        if (Array.isArray(items) && items.length > MAX_CLASH_ITEMS) return send(res, 400, { message: `at most ${MAX_CLASH_ITEMS} clash records a request — nothing was saved` });
        const added = useCde ? await upsertClashesCde(cde, cpid, items) : (upsertClashes(cpid, items), []);
        for (const it of added) await ledger(`Clash raised: ${it.label ?? it.signature}`, { signature: it.signature, volume: it.volume, overlap: it.overlap, elements: it.elements, bcf_guid: it.bcf_guid });
        return send(res, 201, { items: useCde ? await cde.docList("clash", cpid) : clashItems(cpid) });
      }
      if (req.method === "PUT" && !sub) {
        const b = await readBody(req);
        const moved = useCde ? await updateClashStatusCde(cde, cpid, b.signature, b.status) : updateClashStatus(cpid, b.signature, b.status);
        if (moved?.from) await ledger(`Clash ${moved.from} → ${b.status}: ${moved.label ?? b.signature}`, { signature: b.signature, status: b.status });
        return send(res, 200, { ok: !!moved });
      }
      return send(res, 405, { message: "method not allowed" });
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
  }

  // /bcf/3.0/projects/:pid/topics[/:guid[/comments|/viewpoints]]
  const m = url.pathname.match(/^\/bcf\/3\.0\/projects\/([^/]+)\/topics(?:\/([^/]+))?(?:\/(comments|viewpoints))?$/);
  if (!m) return send(res, 404, { message: "Not found" });
  const [, pid, guid, sub] = m;
  const inProject = (t) => t.project_id === pid;

  try {
    // Topics live in Supabase (team-wide, 0008) when the CDE is configured — with lazy migration of the local
    // file on first list — else the per-machine local store. Topic construction/mutation is identical either
    // way (so the BCF-API shape the web panel + Revit BcfSyncManager parse is byte-for-byte the same); only
    // where the topic is read from / written to differs. The local bcf-store.json is kept as a backup.
    const cde = await import("./cde-store.mjs");
    const useCde = cde.cdeConfigured();

    // GET topics (filter by status + model) — what BcfSyncManager.FetchActiveAsync calls
    if (req.method === "GET" && !guid) {
      const status = url.searchParams.get("status");
      const model = url.searchParams.get("model");
      if (useCde) return send(res, 200, await cde.bcfListTopics(pid, { status, model }, db.topics.filter(inProject)));
      // no status → non-Closed (the working set); status=all → everything; else exact match.
      const list = db.topics.filter(inProject)
        .filter((t) => (!status ? t.topic_status !== "Closed" : status === "all" ? true : t.topic_status === status))
        .filter((t) => !model || t.model === model);
      return send(res, 200, list);
    }
    // POST new topic
    if (req.method === "POST" && !guid) {
      const b = await readBody(req);
      const now = new Date().toISOString();
      const topic = cde.newTopicObject(pid, b, now);
      if (useCde) await cde.bcfCreateTopic(topic); else { db.topics.push(topic); persist(); }
      broadcast(pid, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
      return send(res, 201, topic);
    }
    const topic = useCde ? await cde.bcfGetTopic(pid, guid) : db.topics.find((t) => inProject(t) && t.guid === guid);
    if (!topic) return send(res, 404, { message: "Topic not found" });
    topic.history = topic.history || []; // back-compat for topics created before history existed
    const saveTopic = async () => { if (useCde) await cde.bcfSaveTopic(topic); else persist(); };

    // PUT — edit fields (status/priority/assignee/etc.); each change is logged to history.
    if (req.method === "PUT" && guid && !sub) {
      const b = await readBody(req);
      const who = resolveActor(b.author, "web");
      const now = new Date().toISOString();
      for (const [k, label] of [["topic_status", "Status"], ["priority", "Priority"], ["assigned_to", "Assignee"], ["due_date", "Due date"], ["title", "Title"], ["description", "Description"]]) {
        if (b[k] !== undefined && b[k] !== topic[k]) {
          topic.history.push({ date: now, author: who, action: `${label}: ${topic[k] || "—"} → ${b[k] || "—"}` });
          topic[k] = b[k];
        }
      }
      if (b.resolved_by_version) topic.resolved_by_version = b.resolved_by_version;
      topic.modified_date = now;
      await saveTopic();
      broadcast(pid, { type: "topic", action: "updated", guid: topic.guid, status: topic.topic_status });
      return send(res, 200, topic);
    }
    // POST comment
    if (req.method === "POST" && sub === "comments") {
      const b = await readBody(req);
      const now = new Date().toISOString();
      const c = { guid: randomUUID(), date: now, author: resolveActor(b.author, "web"),
        comment: b.comment || "", viewpoint_guid: b.viewpoint_guid || null };
      topic.comments.push(c);
      topic.history.push({ date: now, author: c.author, action: "Comment added" });
      topic.modified_date = now;
      await saveTopic();
      broadcast(pid, { type: "topic", action: "comment", guid: topic.guid });
      return send(res, 201, c);
    }
    // POST viewpoint (camera + selected GlobalIds)
    if (req.method === "POST" && sub === "viewpoints") {
      const b = await readBody(req);
      const v = { guid: b.guid || randomUUID(), perspective_camera: b.perspective_camera || null,
        components: b.components || { selection: [] }, clipping_planes: b.clipping_planes || [],
        snapshot: b.snapshot || null };
      topic.viewpoints.push(v);
      await saveTopic();
      broadcast(pid, { type: "topic", action: "viewpoint", guid: topic.guid });
      return send(res, 201, v);
    }
    return send(res, 405, { message: "Method not allowed" });
  } catch (e) {
    return send(res, e?.status || 500, { message: String(e?.message || e) });
  }
}
