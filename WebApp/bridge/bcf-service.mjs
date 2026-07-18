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
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.BCF_PORT) || 4100;

// Sheet PNGs the Revit plugin renders (sheets never survive IFC export). One sub-folder per model, each with
// a manifest.json + <number>.png files. Served read-only to the web app's BIM Tools → Sheets tab.
const SHEETS_ROOT = process.env.SENTINEL_SHEETS
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "sheets");
const TOKEN = process.env.BCF_TOKEN || ""; // if set, require "Authorization: Bearer <TOKEN>"
const STORE = process.env.BCF_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "bcf-store.json");

/** @type {{topics: any[]}} */
let db = { topics: [] };
try { db = JSON.parse(readFileSync(STORE, "utf8")); } catch { /* first run */ }
const persist = () => { mkdirSync(dirname(STORE), { recursive: true }); writeFileSync(STORE, JSON.stringify(db, null, 2)); };

// ── Sentinel project store (Phase 1 — the governed-dataset metadata the platform doesn't model) ──
const PROJ_STORE = process.env.SENTINEL_PROJECT_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "project-store.json");
/** @type {{projects: any[]}} */
let pdb = { projects: [] };
try { pdb = JSON.parse(readFileSync(PROJ_STORE, "utf8")); } catch { /* first run */ }
const persistProj = () => { mkdirSync(dirname(PROJ_STORE), { recursive: true }); writeFileSync(PROJ_STORE, JSON.stringify(pdb, null, 2)); };

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
let rdb = { rfis: [] };
try { rdb = JSON.parse(readFileSync(RFI_STORE, "utf8")); } catch { /* first run */ }
const persistRfi = () => { mkdirSync(dirname(RFI_STORE), { recursive: true }); writeFileSync(RFI_STORE, JSON.stringify(rdb, null, 2)); };

// ── Tenders / bids (Phase 4 — BoQ-driven tendering, front of the lifecycle) ──
const TENDER_STORE = process.env.SENTINEL_TENDER_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "tender-store.json");
/** @type {{tenders: any[]}} */
let tndb = { tenders: [] };
try { tndb = JSON.parse(readFileSync(TENDER_STORE, "utf8")); } catch { /* first run */ }
const persistTender = () => { mkdirSync(dirname(TENDER_STORE), { recursive: true }); writeFileSync(TENDER_STORE, JSON.stringify(tndb, null, 2)); };
/** A bid's total = Σ line.qty × (bid rate for that line, else the estimate rate). */
const bidTotal = (scope, rates) => scope.reduce((s, l) => s + l.qty * (rates[l.code] != null ? Number(rates[l.code]) : l.rate), 0);

// ── Standards-pack marketplace (Phase 4 — forkable/versioned/shareable standards) ──
const PACK_STORE = process.env.SENTINEL_PACK_STORE
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "pack-store.json");
/** @type {{packs: any[]}} */
let pkdb = { packs: [] };
try { pkdb = JSON.parse(readFileSync(PACK_STORE, "utf8")); } catch { /* first run */ }
const persistPack = () => { mkdirSync(dirname(PACK_STORE), { recursive: true }); writeFileSync(PACK_STORE, JSON.stringify(pkdb, null, 2)); };

const send = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",                    // dev; restrict to the platform origin in prod
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
});
const readRaw = (req) => new Promise((resolve, reject) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject);
});

// ── SSE live sync: clients subscribe per project; changes are pushed to them instantly ──
const sseClients = new Map(); // project -> Set<res>
function broadcast(project, payload) {
  const set = sseClients.get(project);
  if (!set || !set.size) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const r of set) { try { r.write(line); } catch { /* dropped connection */ } }
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: "Unauthorized" });

  const url = new URL(req.url, "http://localhost");

  // ── SSE live stream: GET /events?project=<pid> (kept open; pushes topic/CDE changes) ──
  if (url.pathname === "/events" && req.method === "GET") {
    const project = url.searchParams.get("project") || "default";
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
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
  const pm = url.pathname.match(/^\/projects(?:\/([^/]+))?(?:\/gate\/([^/]+))?$/);
  if (pm) {
    const [, ppid, gateStage] = pm;
    try {
      if (req.method === "GET" && !ppid) return send(res, 200, pdb.projects);              // list (multi-project home)
      if (req.method === "GET" && ppid && !gateStage) return send(res, 200, getProject(ppid));
      if (req.method === "PUT" && ppid && !gateStage) {                                     // patch stage/dims/snapshot
        const b = await readBody(req);
        const p = getProject(ppid);
        for (const k of ["name", "stage", "standards_pack"]) if (b[k] !== undefined) p[k] = b[k];
        if (b.dimensions) p.dimensions = { ...p.dimensions, ...b.dimensions };
        if (b.snapshot) p.snapshot = { ...p.snapshot, ...b.snapshot };
        if (b.rate_pack) p.rate_pack = b.rate_pack;        // 5D: the project's editable rate library
        if (b.boq_baseline) p.boq_baseline = b.boq_baseline; // 5D: cost baseline for change tracking
        p.updated_at = new Date().toISOString();
        persistProj(); return send(res, 200, p);
      }
      if (req.method === "POST" && ppid && gateStage) {                                     // record a gate result
        const b = await readBody(req);
        const p = getProject(ppid);
        p.gates[gateStage] = { status: b.status || "hold", checks: b.checks || [], at: new Date().toISOString() };
        if (b.status === "pass" && b.advance_to && STAGES.includes(b.advance_to)) p.stage = b.advance_to;
        p.updated_at = new Date().toISOString();
        persistProj(); return send(res, 200, p);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, 500, { message: String(e?.message || e) }); }
  }

  // ── RFIs: /rfis/:pid[/:guid] ──
  const rm = url.pathname.match(/^\/rfis\/([^/]+)(?:\/([^/]+))?$/);
  if (rm) {
    const [, rpid, rguid] = rm;
    const inP = (r) => r.project_id === rpid;
    try {
      if (req.method === "GET" && !rguid) {
        const status = url.searchParams.get("status");
        return send(res, 200, rdb.rfis.filter(inP).filter((r) => (!status || status === "all") ? true : r.status === status));
      }
      if (req.method === "POST" && !rguid) {
        const b = await readBody(req); const now = new Date().toISOString();
        const num = rdb.rfis.filter(inP).length + 1;
        const rfi = {
          guid: randomUUID(), project_id: rpid, number: `RFI-${String(num).padStart(3, "0")}`,
          subject: b.subject || "Untitled", question: b.question || "", status: "Open",
          discipline: b.discipline || "", assigned_to: b.assigned_to || "", due_date: b.due_date || null,
          answer: "", model: b.model || "", linked: b.linked || [],
          creation_author: b.creation_author || "web", creation_date: now, modified_date: now,
          history: [{ date: now, author: b.creation_author || "web", action: "Raised" }],
        };
        rdb.rfis.push(rfi); persistRfi(); return send(res, 201, rfi);
      }
      const rfi = rdb.rfis.find((r) => inP(r) && r.guid === rguid);
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
        rfi.modified_date = now; persistRfi(); return send(res, 200, rfi);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, 500, { message: String(e?.message || e) }); }
  }

  // ── Standards-pack marketplace: /packs[/:id[/install|fork]] ──
  const km = url.pathname.match(/^\/packs(?:\/([^/]+))?(?:\/(install|fork))?$/);
  if (km) {
    const [, kid, ksub] = km;
    try {
      if (req.method === "GET" && !kid) return send(res, 200, pkdb.packs);
      if (req.method === "POST" && !kid) { // publish (create or update)
        const b = await readBody(req); const now = new Date().toISOString();
        const id = `${b.key}@${b.version}`;
        const existing = pkdb.packs.find((p) => p.id === id);
        const pack = {
          id, key: b.key, version: b.version, name: b.name || b.key, description: b.description || "",
          author: b.author || "anon", tags: b.tags || [], ruleset: b.ruleset || { rules: [] },
          installs: existing?.installs || 0, forks: existing?.forks || 0,
          forked_from: b.forked_from || existing?.forked_from || null, created_at: existing?.created_at || now,
        };
        if (existing) Object.assign(existing, pack); else pkdb.packs.push(pack);
        persistPack(); return send(res, 201, pack);
      }
      if (kid && !ksub && req.method === "GET") return send(res, 200, pkdb.packs.find((p) => p.id === kid) || null);
      const pack = pkdb.packs.find((p) => p.id === kid);
      if (!pack) return send(res, 404, { message: "Pack not found" });
      if (req.method === "POST" && ksub === "install") { pack.installs = (pack.installs || 0) + 1; persistPack(); return send(res, 200, pack); }
      if (req.method === "POST" && ksub === "fork") {
        const b = await readBody(req); const now = new Date().toISOString();
        const nid = `${b.key || pack.key}@${b.version || "fork"}`;
        const fork = { ...pack, id: nid, key: b.key || pack.key, version: b.version || "fork", name: b.name || pack.name + " (fork)", author: b.author || "anon", installs: 0, forks: 0, forked_from: pack.id, created_at: now };
        pack.forks = (pack.forks || 0) + 1; pkdb.packs.push(fork); persistPack(); return send(res, 201, fork);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, 500, { message: String(e?.message || e) }); }
  }

  // ── Tenders: /tenders/:pid[/:guid[/bids]] ──
  const tm = url.pathname.match(/^\/tenders\/([^/]+)(?:\/([^/]+))?(?:\/(bids))?$/);
  if (tm) {
    const [, tpid, tguid, tsub] = tm;
    const inP = (t) => t.project_id === tpid;
    try {
      if (req.method === "GET" && !tguid) return send(res, 200, tndb.tenders.filter(inP));
      if (req.method === "POST" && !tguid) {
        const b = await readBody(req); const now = new Date().toISOString();
        const t = {
          guid: randomUUID(), project_id: tpid, title: b.title || "Tender", status: "Issued",
          due_date: b.due_date || null, currency: b.currency || "",
          scope: Array.isArray(b.scope) ? b.scope : [], estimate_total: b.estimate_total || 0,
          bids: [], awarded_to: "", creation_date: now, modified_date: now,
          history: [{ date: now, author: b.author || "web", action: "Tender issued" }],
        };
        tndb.tenders.push(t); persistTender(); return send(res, 201, t);
      }
      const t = tndb.tenders.find((x) => inP(x) && x.guid === tguid);
      if (!t) return send(res, 404, { message: "Tender not found" });
      t.history = t.history || [];
      if (req.method === "POST" && tsub === "bids") {
        const b = await readBody(req); const now = new Date().toISOString();
        const rates = b.rates || {};
        const bid = { id: randomUUID(), bidder: b.bidder || "Bidder", submitted_date: now, rates, total: bidTotal(t.scope, rates) };
        t.bids.push(bid); t.history.push({ date: now, author: b.bidder || "web", action: `Bid received: ${b.bidder || "Bidder"}` });
        t.modified_date = now; persistTender(); return send(res, 201, bid);
      }
      if (req.method === "PUT") {
        const b = await readBody(req); const now = new Date().toISOString(); const who = b.author || "web";
        if (b.status && b.status !== t.status) { t.history.push({ date: now, author: who, action: `Status: ${t.status} → ${b.status}` }); t.status = b.status; }
        if (b.awarded_to !== undefined && b.awarded_to !== t.awarded_to) { t.awarded_to = b.awarded_to; t.status = "Awarded"; t.history.push({ date: now, author: who, action: `Awarded to ${b.awarded_to}` }); }
        t.modified_date = now; persistTender(); return send(res, 200, t);
      }
      return send(res, 405, { message: "Method not allowed" });
    } catch (e) { return send(res, 500, { message: String(e?.message || e) }); }
  }

  // ── IFC upload → That Open Platform (Phase C: browser bakes → bridge uploads; token stays server-side) ──
  //   POST /ifc?name=<x.ifc>&version=<vN>&projectId=<id>   body = raw .ifc bytes
  // The browser can't hold THATOPEN_API_KEY, so it POSTs the baked IFC here; the bridge converts it to
  // fragments and uploads via the same @thatopen/services client the outbox watcher uses.
  if (url.pathname === "/ifc" && req.method === "POST") {
    try {
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
    } catch (e) { return send(res, 500, { message: String(e?.message || e) }); }
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
      if (p2 === "containers" && !p3) {
        if (req.method === "GET") return send(res, 200, await cde.listContainers(p1));
        if (req.method === "POST") return send(res, 201, await cde.createContainer(p1, await readBody(req)));
      }
      if (p2 === "audit" && req.method === "GET") return send(res, 200, await cde.listAudit(p1));
      if (p2 === "audit" && req.method === "POST") return send(res, 201, await cde.recordAudit(p1, await readBody(req)));
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
    } catch (e) { return send(res, 500, { message: String(e?.message || e) }); }
  }

  // /bcf/3.0/projects/:pid/topics[/:guid[/comments|/viewpoints]]
  const m = url.pathname.match(/^\/bcf\/3\.0\/projects\/([^/]+)\/topics(?:\/([^/]+))?(?:\/(comments|viewpoints))?$/);
  if (!m) return send(res, 404, { message: "Not found" });
  const [, pid, guid, sub] = m;
  const inProject = (t) => t.project_id === pid;

  try {
    // GET topics (filter by status + model) — what BcfSyncManager.FetchActiveAsync calls
    if (req.method === "GET" && !guid) {
      const status = url.searchParams.get("status");
      const model = url.searchParams.get("model");
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
      db.topics.push(topic); persist();
      broadcast(pid, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
      return send(res, 201, topic);
    }
    const topic = db.topics.find((t) => inProject(t) && t.guid === guid);
    if (!topic) return send(res, 404, { message: "Topic not found" });
    topic.history = topic.history || []; // back-compat for topics created before history existed

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
      persist();
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
      persist();
      broadcast(pid, { type: "topic", action: "comment", guid: topic.guid });
      return send(res, 201, c);
    }
    // POST viewpoint (camera + selected GlobalIds)
    if (req.method === "POST" && sub === "viewpoints") {
      const b = await readBody(req);
      const v = { guid: b.guid || randomUUID(), perspective_camera: b.perspective_camera || null,
        components: b.components || { selection: [] }, clipping_planes: b.clipping_planes || [],
        snapshot: b.snapshot || null };
      topic.viewpoints.push(v); persist();
      broadcast(pid, { type: "topic", action: "viewpoint", guid: topic.guid });
      return send(res, 201, v);
    }
    return send(res, 405, { message: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { message: String(e?.message || e) });
  }
}).listen(PORT, () => console.log(`Sentinel BCF-API 3.0 listening on http://localhost:${PORT}  (store: ${STORE})`));
