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
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { runWithAuth } from "./bridge-auth.mjs";

const PORT = Number(process.env.BCF_PORT) || 4100;
// Week-0 hardening: bind to loopback by default (each user runs the bridge locally). Only set
// BCF_HOST=0.0.0.0 behind real auth + a reverse proxy. CORS defaults to * for dev; lock it to the
// platform origin in shared/hosted deployments via BCF_CORS_ORIGIN.
const HOST = process.env.BCF_HOST || "127.0.0.1";
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
const originAllowed = (origin) => CORS_WILDCARD || (!!origin && CORS_ALLOW.includes(origin));
const MAX_UPLOAD = (Number(process.env.BCF_MAX_UPLOAD_MB) || 2048) * 1024 * 1024;

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
const TOKEN = process.env.BCF_TOKEN || ""; // if set, require "Authorization: Bearer <TOKEN>"
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

const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
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

// ── Clash status store (Coordination): server-side dedup + a status lifecycle, replacing the per-browser
// localStorage "known" set so a resolved/raised clash stays hidden for the whole team, not just one machine.
// Records are keyed on the clash SIGNATURE (GlobalId pair — stable across a re-export; see clash.ts::keyOf).
const CLASH_STORE = process.env.SENTINEL_CLASH_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "clash-store.json");
/** @type {{clashes: any[]}} */
let cldb = loadJson(CLASH_STORE, { clashes: [] });
const persistClash = () => writeJsonAtomic(CLASH_STORE, cldb);
const CLASH_STATUSES = ["raised", "reviewed", "approved", "resolved"]; // new→raised→reviewed→approved→resolved
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
}
async function updateClashStatusCde(cde, pid, signature, status) {
  if (!signature || !CLASH_STATUSES.includes(status)) return false;
  const rec = await cde.docGet("clash", pid, signature);
  if (!rec) return false;
  rec.status = status; rec.updated_at = new Date().toISOString();
  await cde.docUpsert("clash", pid, signature, rec);
  return true;
}

const send = (res, code, body) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
  // res._cors is the per-request allowed origin (set in the handler); only reflect an allowlisted origin so a
  // foreign page can neither read responses nor pass a mutation preflight.
  if (res._cors) { headers["Access-Control-Allow-Origin"] = res._cors; if (res._cors !== "*") headers["Vary"] = "Origin"; }
  res.writeHead(code, headers);
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
});
const readRaw = (req) => new Promise((resolve, reject) => {
  const chunks = []; let total = 0;
  req.on("data", (c) => {
    total += c.length;
    if (total > MAX_UPLOAD) { req.destroy(); reject(new Error(`payload exceeds ${Math.round(MAX_UPLOAD / 1048576)} MB cap`)); return; }
    chunks.push(c);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

// ── SSE live sync: clients subscribe per project; changes are pushed to them instantly ──
const sseClients = new Map(); // project -> Set<res>
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
createServer((req, res) => {
  const auth = req.headers.authorization || "";
  const userJwt = (!TOKEN && auth.startsWith("Bearer ")) ? auth.slice(7) : null;
  runWithAuth(userJwt, () => handleRequest(req, res));
}).listen(PORT, HOST, () => {
  console.log(`Sentinel BCF-API 3.0 listening on http://${HOST}:${PORT}  (store: ${STORE})`);
  console.log(`[bridge] CSRF origin-gate: ${CORS_WILDCARD ? "DISABLED (wildcard)" : "on — mutations restricted to " + CORS_ALLOW.join(", ")}`);
  console.log(`[bridge] bind: ${HOST} · auth token: ${TOKEN ? "required" : "off"}`);
  if (CORS_WILDCARD) console.warn("[bridge] WARNING: BCF_CORS_ORIGIN=* disables CSRF protection — set it to your app origin(s) for production.");
  if (HOST !== "127.0.0.1" && !TOKEN) console.warn("[bridge] WARNING: non-loopback bind without BCF_TOKEN — the service-key proxy is network-exposed. Set BCF_TOKEN.");
  import("./cde-store.mjs").then((cde) => console.log(`[bridge] JWT-forwarding: ${cde.forwardingConfigured() ? "armed (forwards a caller's Supabase JWT → RLS)" : "off (service key; set SUPABASE_ANON_KEY to arm)"}`)).catch(() => {});
  startEventPoll(); // cross-machine SSE fan-out (no-op without Supabase)
});

async function handleRequest(req, res) {
  const origin = req.headers.origin;
  // Per-request CORS origin: echo an allowlisted origin (or "*" only in wildcard/dev mode); otherwise none.
  res._cors = CORS_WILDCARD ? (origin || "*") : (originAllowed(origin) ? origin : "");

  if (req.method === "OPTIONS") return send(res, 204); // preflight: send() reflects res._cors (denies foreign origins)

  // CSRF gate: refuse state-changing requests from a browser origin that isn't allowlisted. A request with no
  // Origin (Revit plugin, curl, server-to-server) is a non-browser caller and is allowed through.
  if ((req.method === "POST" || req.method === "PUT" || req.method === "DELETE") && origin && !originAllowed(origin)) {
    return send(res, 403, { message: "Origin not allowed" });
  }
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: "Unauthorized" });

  const url = new URL(req.url, "http://localhost");

  // Health/posture (no secrets): confirms config without ever returning keys.
  if (url.pathname === "/health" && req.method === "GET") {
    let cdeConfigured = false;
    try { cdeConfigured = (await import("./cde-store.mjs")).cdeConfigured(); } catch { /* */ }
    return send(res, 200, {
      ok: true, host: HOST, token: !!TOKEN, cde_configured: cdeConfigured,
      cors: CORS_WILDCARD ? "wildcard (INSECURE)" : "allowlist", origins: CORS_WILDCARD ? "*" : CORS_ALLOW,
    });
  }

  // ── SSE live stream: GET /events?project=<pid> (kept open; pushes topic/CDE changes) ──
  if (url.pathname === "/events" && req.method === "GET") {
    const project = url.searchParams.get("project") || "default";
    const sseHeaders = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" };
    if (res._cors) sseHeaders["Access-Control-Allow-Origin"] = res._cors; // allowlisted origin only
    res.writeHead(200, sseHeaders);
    res.write(": connected\n\n");
    let set = sseClients.get(project);
    if (!set) { set = new Set(); sseClients.set(project, set); }
    set.add(res);
    const ka = setInterval(() => { try { res.write(": ka\n\n"); } catch { /* */ } }, 25000);
    req.on("close", () => { clearInterval(ka); set.delete(res); });
    return; // keep the stream open — do NOT call send()
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
          const m = JSON.parse(readFileSync(mf, "utf8"));
          const sheets = (m.sheets || []).map((s) => ({ ...s, url: `/sheets/img/${encodeURIComponent(set)}/${encodeURIComponent(s.file)}` }));
          sets.push({ set, title: m.title ?? set, exportedAt: m.exportedAt ?? null, count: sheets.length, sheets });
        } catch { /* skip a malformed manifest */ }
      }
    } catch { /* SHEETS_ROOT doesn't exist yet — no sheets published */ }
    sets.sort((a, b) => String(b.exportedAt).localeCompare(String(a.exportedAt)));
    return send(res, 200, { root: SHEETS_ROOT, sets });
  }
  // GET /sheets/img/:set/:file → serve one PNG (path-traversal-guarded via basename()).
  const simg = url.pathname.match(/^\/sheets\/img\/([^/]+)\/([^/]+)$/);
  if (simg && req.method === "GET") {
    const set = basename(decodeURIComponent(simg[1]));
    const file = basename(decodeURIComponent(simg[2]));
    if (extname(file).toLowerCase() !== ".png") return send(res, 404, { message: "Not found" });
    const path = join(SHEETS_ROOT, set, file);
    try {
      const buf = readFileSync(path);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(buf);
    } catch {
      return send(res, 404, { message: "Sheet image not found" });
    }
  }

  // ── Sentinel project store: /projects[/:pid[/gate/:stage]] ──
  // Single source of truth = Supabase projects.metadata (0007) when the CDE is configured (team-wide);
  // else the per-machine local JSON store. Existing local metadata is lazy-migrated into Supabase on first
  // read (the `seed`), and the local file is kept as an untouched backup.
  const pm = url.pathname.match(/^\/projects(?:\/([^/]+))?(?:\/gate\/([^/]+))?$/);
  if (pm) {
    const [, ppid, gateStage] = pm;
    try {
      const cde = await import("./cde-store.mjs");
      const useCde = cde.cdeConfigured();
      const localSeed = (pid) => { const l = pdb.projects.find((p) => p.project_id === pid); if (!l) return undefined; const { project_id, name, ...meta } = l; return meta; };

      if (req.method === "GET" && !ppid) {
        if (!useCde) return send(res, 200, pdb.projects);
        // Union-safe: migrate any local project not yet in Supabase so none vanish from the switcher.
        const remote = await cde.listProjectMeta();
        const known = new Set(remote.map((r) => r.project_id));
        const missing = pdb.projects.filter((l) => !known.has(l.project_id));
        for (const l of missing) { const { project_id, name, ...meta } = l; await cde.getProjectMeta(project_id, meta); }
        return send(res, 200, missing.length ? await cde.listProjectMeta() : remote);
      }
      if (req.method === "GET" && ppid && !gateStage) return send(res, 200, useCde ? await cde.getProjectMeta(ppid, localSeed(ppid)) : getProject(ppid));
      if (req.method === "PUT" && ppid && !gateStage) {
        const b = await readBody(req);
        if (useCde) return send(res, 200, await cde.patchProjectMeta(ppid, b));
        const p = getProject(ppid); // local fallback (original behaviour)
        for (const k of ["name", "stage", "standards_pack"]) if (b[k] !== undefined) p[k] = b[k];
        if (b.dimensions) p.dimensions = { ...p.dimensions, ...b.dimensions };
        if (b.snapshot) p.snapshot = { ...p.snapshot, ...b.snapshot };
        if (b.rate_pack) p.rate_pack = b.rate_pack;             // 5D: the project's editable rate library
        if (b.boq_baseline) p.boq_baseline = b.boq_baseline;    // 5D: cost baseline reference
        if (b.carbon_baseline) p.carbon_baseline = b.carbon_baseline; // 6D: carbon baseline (was dropped — fixed)
        p.updated_at = new Date().toISOString();
        persistProj(); return send(res, 200, p);
      }
      if (req.method === "POST" && ppid && gateStage) {
        const b = await readBody(req);
        if (useCde) return send(res, 200, await cde.recordGate(ppid, gateStage, b));
        const p = getProject(ppid); // local fallback
        p.gates[gateStage] = { status: b.status || "hold", checks: b.checks || [], at: new Date().toISOString() };
        if (b.status === "pass" && b.advance_to && STAGES.includes(b.advance_to)) p.stage = b.advance_to;
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
          creation_author: b.creation_author || "web", creation_date: now, modified_date: now,
          history: [{ date: now, author: b.creation_author || "web", action: "Raised" }],
        };
        if (useCde) await cde.docUpsert("rfi", rpid, rfi.guid, rfi); else { rdb.rfis.push(rfi); persistRfi(); }
        return send(res, 201, rfi);
      }
      const rfi = useCde ? await cde.docGet("rfi", rpid, rguid) : rdb.rfis.find((r) => inP(r) && r.guid === rguid);
      if (!rfi) return send(res, 404, { message: "RFI not found" });
      rfi.history = rfi.history || [];
      if (req.method === "PUT") {
        const b = await readBody(req); const who = b.author || "web"; const now = new Date().toISOString();
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
      if (req.method === "GET" && !kid) return send(res, 200, packs);
      if (req.method === "POST" && !kid) { // publish (create or update)
        const b = await readBody(req); const now = new Date().toISOString();
        const id = `${b.key}@${b.version}`;
        const existing = packs.find((p) => p.id === id);
        const pack = {
          id, key: b.key, version: b.version, name: b.name || b.key, description: b.description || "",
          author: b.author || "anon", tags: b.tags || [], ruleset: b.ruleset || { rules: [] },
          installs: existing?.installs || 0, forks: existing?.forks || 0,
          forked_from: b.forked_from || existing?.forked_from || null, created_at: existing?.created_at || now,
        };
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
        const fork = { ...pack, id: nid, key: b.key || pack.key, version: b.version || "fork", name: b.name || pack.name + " (fork)", author: b.author || "anon", installs: 0, forks: 0, forked_from: pack.id, created_at: now };
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
      const listTenders = async () => (useCde ? await cde.docListLazy("tender", tpid, tndb.tenders.filter(inP), (t) => t.guid) : tndb.tenders.filter(inP));
      if (req.method === "GET" && !tguid) return send(res, 200, await listTenders());
      if (req.method === "POST" && !tguid) {
        const b = await readBody(req); const now = new Date().toISOString();
        const t = {
          guid: randomUUID(), project_id: tpid, title: b.title || "Tender", status: "Issued",
          due_date: b.due_date || null, currency: b.currency || "",
          scope: Array.isArray(b.scope) ? b.scope : [], estimate_total: b.estimate_total || 0,
          bids: [], awarded_to: "", creation_date: now, modified_date: now,
          history: [{ date: now, author: b.author || "web", action: "Tender issued" }],
        };
        if (useCde) await cde.docUpsert("tender", tpid, t.guid, t); else { tndb.tenders.push(t); persistTender(); }
        return send(res, 201, t);
      }
      const t = useCde ? await cde.docGet("tender", tpid, tguid) : tndb.tenders.find((x) => inP(x) && x.guid === tguid);
      if (!t) return send(res, 404, { message: "Tender not found" });
      t.history = t.history || [];
      const saveTender = async () => { if (useCde) await cde.docUpsert("tender", tpid, t.guid, t); else persistTender(); };
      if (req.method === "POST" && tsub === "bids") {
        const b = await readBody(req); const now = new Date().toISOString();
        const rates = b.rates || {};
        const bid = { id: randomUUID(), bidder: b.bidder || "Bidder", submitted_date: now, rates, total: bidTotal(t.scope, rates) };
        t.bids.push(bid); t.history.push({ date: now, author: b.bidder || "web", action: `Bid received: ${b.bidder || "Bidder"}` });
        t.modified_date = now; await saveTender(); return send(res, 201, bid);
      }
      if (req.method === "PUT") {
        const b = await readBody(req); const now = new Date().toISOString(); const who = b.author || "web";
        if (b.status && b.status !== t.status) { t.history.push({ date: now, author: who, action: `Status: ${t.status} → ${b.status}` }); t.status = b.status; }
        if (b.awarded_to !== undefined && b.awarded_to !== t.awarded_to) { t.awarded_to = b.awarded_to; t.status = "Awarded"; t.history.push({ date: now, author: who, action: `Awarded to ${b.awarded_to}` }); }
        t.modified_date = now; await saveTender(); return send(res, 200, t);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
  }

  // ── IFC upload → That Open Platform (Phase C: browser bakes → bridge uploads; token stays server-side) ──
  //   POST /ifc?name=<x.ifc>&version=<vN>&projectId=<id>   body = raw .ifc bytes
  // The browser can't hold THATOPEN_API_KEY, so it POSTs the baked IFC here; the bridge converts it to
  // fragments and uploads via the same @thatopen/services client the outbox watcher uses.
  if (url.pathname === "/ifc" && req.method === "POST") {
    try {
      if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { message: `File too large (> ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
      const bytes = await readRaw(req);
      if (!bytes.length) return send(res, 400, { message: "Empty body — POST the .ifc file as the request body." });
      const name = url.searchParams.get("name") || "sentinel-model.ifc";
      const versionTag = url.searchParams.get("version") || "v1";

      // Lazy-load the upload deps so the BCF service still boots if they're absent.
      const { getConfig, createClient, uploadBytes } = await import("./thatopen-client.mjs");
      let cfg;
      try { cfg = getConfig(); }
      catch (e) { return send(res, 503, { message: String(e?.message || e) }); } // not configured → clear message
      const projectId = url.searchParams.get("projectId") || cfg.projectId;
      const client = createClient(cfg);

      // Convert IFC → fragments locally and upload the viewable .frag; fall back to the raw .ifc.
      try {
        const { ifcBytesToFrag } = await import("./ifc-to-frag.mjs");
        const frag = await ifcBytesToFrag(new Uint8Array(bytes));
        const fragName = name.replace(/\.ifc$/i, ".frag");
        const { result, size } = await uploadBytes(client, projectId, frag, fragName, versionTag);
        return send(res, 200, { ok: true, format: "frag", name: fragName, itemId: result?.item?._id, bytes: size });
      } catch (convErr) {
        const { result, size } = await uploadBytes(client, projectId, new Uint8Array(bytes), name, versionTag);
        return send(res, 200, { ok: true, format: "ifc", name, itemId: result?.item?._id, bytes: size, note: `frag conversion failed (${convErr?.message || convErr}); uploaded raw IFC` });
      }
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
  }

  // ── Encrypted file blobs (Phase 2, private CDE): POST /cde/files (store ciphertext) · GET /cde/files/:id ──
  // The body is already AES-GCM ciphertext (IV‖ct) from the browser; we store/serve opaque bytes only.
  // Deliberately ABOVE the Supabase /cde/ block so it never hits the service-key 503 guard.
  if (url.pathname === "/cde/files" && req.method === "POST") {
    try {
      if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { message: `File too large (> ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
      const bytes = await readRaw(req);
      if (!bytes.length) return send(res, 400, { message: "Empty body" });
      const id = randomUUID();
      mkdirSync(CDE_FILES_ROOT, { recursive: true });
      writeFileSync(join(CDE_FILES_ROOT, `${id}.bin`), bytes);
      return send(res, 201, { id, size: bytes.length });
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
  }
  const fm = url.pathname.match(/^\/cde\/files\/([A-Za-z0-9-]+)$/);
  if (fm && req.method === "GET") {
    const file = join(CDE_FILES_ROOT, `${basename(fm[1])}.bin`); // basename() guards path traversal
    try {
      const buf = readFileSync(file);
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
      return res.end(buf);
    } catch { return send(res, 404, { message: "Blob not found" }); }
  }

  // ── CDE (ISO 19650) — Supabase-backed information containers, states, audit, transmittals (C3) ──
  //   GET/POST /cde/:key/containers · GET /cde/:key/audit · GET/POST /cde/:key/transmittals
  //   POST /cde/containers/:cid/versions · POST /cde/versions/:vid/transition  { state, actor, note }
  if (url.pathname.startsWith("/cde/")) {
    const cde = await import("./cde-store.mjs");
    if (!cde.cdeConfigured()) {
      return send(res, 503, { message: "CDE not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env, then restart the service." });
    }
    try {
      const seg = url.pathname.split("/").filter(Boolean); // ['cde', p1, p2, p3]
      const p1 = seg[1], p2 = seg[2], p3 = seg[3];
      // Projects hub: GET/POST /cde/projects — reserved key, safe because every per-project
      // route carries a p2 segment (/cde/:key/containers…), so a bare /cde/projects can't collide.
      if (p1 === "projects" && !p2) {
        if (req.method === "GET") return send(res, 200, await cde.listProjects());
        if (req.method === "POST") return send(res, 201, await cde.createProject(await readBody(req)));
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
      if (p2 === "audit" && req.method === "GET") return send(res, 200, await cde.listAudit(p1));
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordAudit(p1, await readBody(req)));
      // The propose API (referee): POST /cde/:key/propose { source, actor?, ids?, elements[], note? }
      //   → { verdict: accepted|rejected|recorded, summary, failures[], audit_id }. Agents propose; the
      //   governed core (IDS + rules) adjudicates deterministically and records the verdict immutably.
      if (p2 === "propose" && !p3 && req.method === "POST") return send(res, 200, await cde.adjudicateProposal(p1, await readBody(req)));
      // Element snapshots (revision tracking, migration 0005):
      //   POST /cde/:key/snapshots  { rev_code?, model_id?, uploaded_by?, container_version_id?, snapshots:[{guid,category,type_name,count,length,area,volume,weight}] }
      //   GET  /cde/:key/snapshots            → revision metadata (newest first, the baseline picker)
      //   GET  /cde/:key/snapshots/:revId     → that revision's element rows (for diffing / rehydrating a baseline)
      if (p2 === "snapshots" && !p3) {
        if (req.method === "GET") return send(res, 200, await cde.listRevisions(p1));
        if (req.method === "POST") return send(res, 201, await cde.createRevision(p1, await readBody(req)));
      }
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
      if (p1 === "versions" && p3 === "transition" && req.method === "POST") {
        const body = await readBody(req);
        return send(res, 200, await cde.transition(p2, body.state, body.actor, body.note));
      }
      return send(res, 404, { message: "CDE route not found" });
    } catch (e) { return send(res, e?.status || 500, { message: String(e?.message || e) }); }
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
      if (req.method === "POST" && sub === "reset") {
        if (useCde) await cde.docDeleteProject("clash", cpid); else { cldb.clashes = cldb.clashes.filter((c) => c.project !== cpid); persistClash(); }
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && !sub) {
        const items = (await readBody(req)).items;
        if (useCde) await upsertClashesCde(cde, cpid, items); else upsertClashes(cpid, items);
        return send(res, 201, { items: useCde ? await cde.docList("clash", cpid) : clashItems(cpid) });
      }
      if (req.method === "PUT" && !sub) {
        const b = await readBody(req);
        const ok = useCde ? await updateClashStatusCde(cde, cpid, b.signature, b.status) : updateClashStatus(cpid, b.signature, b.status);
        return send(res, 200, { ok });
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
      const topic = {
        guid: b.guid || randomUUID(), project_id: pid, model: b.model || "",
        title: b.title || "Untitled", topic_type: b.topic_type || "Issue",
        topic_status: b.topic_status || "Open", priority: b.priority || "Normal",
        assigned_to: b.assigned_to || "", due_date: b.due_date || null,
        stage: b.stage || "", description: b.description || "",
        creation_author: b.creation_author || "web", creation_date: now, modified_date: now,
        labels: b.labels || [], comments: [], viewpoints: [],
        history: [{ date: now, author: b.creation_author || "web", action: "Created" }],
      };
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
      const who = b.author || "web";
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
      const c = { guid: randomUUID(), date: now, author: b.author || "web",
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
    return send(res, 500, { message: String(e?.message || e) });
  }
}
