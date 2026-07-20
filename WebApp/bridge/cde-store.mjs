// Sentinel CDE store — Supabase-backed ISO 19650 information-container access for the bridge (C3).
// Zero-dep: talks to Supabase PostgREST + RPC over fetch with the SERVICE key (server-side only, never
// the browser). The state machine, published-immutability, and hash-chained audit all live in the DB
// (migrations 0001/0002) — this module is a thin REST wrapper the web app's CDE panel calls via the bridge.
//
// Config (config/.env, never committed):
//   SUPABASE_URL=https://<ref>.supabase.co
//   SUPABASE_SERVICE_KEY=<service_role secret from Supabase → Project Settings → API>

import { readFileSync } from "node:fs";
import { loadEnv } from "./thatopen-client.mjs";
import { currentUserToken } from "./bridge-auth.mjs";

const env = { ...process.env, ...loadEnv() }; // config/.env is authoritative
const URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_KEY || "";
const ANON = env.SUPABASE_ANON_KEY || ""; // enables JWT-forwarding when set; without it the bridge stays service-key only

export const cdeConfigured = () => !!(URL && KEY);
/** True once JWT-forwarding is armed (anon key present). Forwarding still only kicks in per-request when a
 *  caller actually presents a Supabase JWT; otherwise sb() uses the service key. */
export const forwardingConfigured = () => !!ANON;

// Forward the caller's Supabase JWT (RLS-enforced) when one is present AND forwarding is armed; else use the
// service key. `service: true` FORCES the service key for privileged writes that RLS blocks for authed users
// (audit_log inserts, bridge_events) — those must bypass RLS by design.
async function sb(path, { method = "GET", body, prefer, service = false } = {}) {
  if (!cdeConfigured()) throw new Error("CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  const userToken = service ? null : currentUserToken();
  const useUser = !!(userToken && ANON);
  const headers = {
    apikey: useUser ? ANON : KEY,
    Authorization: `Bearer ${useUser ? userToken : KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  // Postgres text/JSONB cannot hold a NUL () — error 22P05 "unsupported Unicode escape sequence". Real
  // authoring tools (Revit among them) occasionally emit a stray NUL inside an element name / parameter value,
  // which then rides into an audit/snapshot/BCF write and 500s the whole request. A NUL in a BIM string is
  // always spurious, so strip it from every write payload here, at the single Supabase write chokepoint.
  // Also strip LONE UTF-16 surrogates (\uD800–\uDFFF): Postgres jsonb rejects them too (22P05). Valid surrogate
  // PAIRS are emitted by JSON.stringify as literal characters (never as \u escapes), so any \uD8xx–\uDFxx escape
  // in the serialized output is a lone surrogate and safe to drop.
  const payload = body
    ? JSON.stringify(body).replace(/\\u0000/g, "").replace(/\\ud[89a-f][0-9a-f]{2}/gi, "")
    : undefined;
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers, body: payload });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const err = new Error(`Supabase ${r.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    // Surface auth/permission failures with their real client status instead of a generic 500, so a caller
    // whose forwarded JWT is missing/expired/invalid gets a 401 (→ the web app can prompt re-login) and an
    // RLS/row-security denial gets a 403. Routes propagate this via `e?.status || 500`. Other upstream codes
    // (e.g. a malformed query) stay 500 by default — they signal a bridge bug, not a client-fixable one.
    if (r.status === 401 || r.status === 403) err.status = r.status;
    throw err;
  }
  return data;
}

/** Map the platform projectId (string key) to a CDE project row, creating it on first use.
 *  Multi-user safe: when a caller's JWT is being forwarded (RLS on), existence is checked with the SERVICE
 *  key (authoritative — sees every project regardless of membership), then a forwarded RLS-filtered read
 *  confirms the caller is a member. A non-member gets a 403 instead of accidentally RE-creating an
 *  RLS-hidden project (the old bug: the forwarded SELECT returned empty → INSERT). No JWT (Revit/service /
 *  dormant forwarding) → the membership gate is skipped, behaviour unchanged. */
export async function ensureProject(key) {
  const forwarding = !!(currentUserToken() && ANON);
  const found = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`, { service: true }); // authoritative
  if (found?.length) {
    const proj = found[0];
    if (forwarding) {
      const visible = await sb(`projects?id=eq.${proj.id}&select=id`); // forwarded → RLS; a member sees it, a non-member doesn't
      if (!visible?.length) { const e = new Error("Not authorized: you are not a member of this project"); e.status = 403; throw e; }
    }
    return proj;
  }
  // Doesn't exist → create it. Forwarded (when armed) so the owner-bootstrap trigger makes the caller owner.
  // return=minimal on purpose: the returning-select policy (is_member) can't yet see the owner membership the
  // trigger just created, so return=representation would 42501. Re-fetch authoritatively with the service key.
  await sb(`projects`, { method: "POST", body: { key, name: key }, prefer: "return=minimal" });
  const created = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`, { service: true });
  return created[0];
}

// ── Sentinel project metadata (migration 0007) — the governed-project store, unified into the Supabase
// `projects` row's `metadata` jsonb (was the per-machine bridge/project-store.json). The bridge maps this to
// the same JSON shape the web app already expects, so consolidating is transparent to callers.
const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
const defaultMeta = () => ({
  stage: "design", standards_pack: "",
  dimensions: { "2d": true, "3d": true, "4d": false, "5d": true, "6d": false, "7d": false },
  gates: {}, snapshot: {}, updated_at: new Date().toISOString(),
});
/** Merge a patch into project metadata with the same field semantics as the old local store (deep-merge
 *  dimensions/snapshot, replace the rest). `name` is handled separately (a real column). */
function mergeMeta(meta, patch) {
  const out = { ...meta };
  for (const k of ["stage", "standards_pack", "rate_pack", "boq_baseline", "carbon_baseline"]) if (patch[k] !== undefined) out[k] = patch[k];
  if (patch.dimensions) out.dimensions = { ...(meta.dimensions || {}), ...patch.dimensions };
  if (patch.snapshot) out.snapshot = { ...(meta.snapshot || {}), ...patch.snapshot };
  out.updated_at = new Date().toISOString();
  return out;
}
// Always present the core governance fields (stage/dimensions/gates/snapshot) even if a migrated row's
// metadata was partial — so consumers never see a null where the local store used to default them.
const toProjectShape = (row) => ({ project_id: row.key, name: row.name, ...defaultMeta(), ...(row.metadata || {}) });

/** Read one project in the web app's shape. `seed` (optional) backfills metadata on first access (one-time
 *  migration from the local store); if the row already has metadata, `seed` is ignored. */
export async function getProjectMeta(key, seed) {
  const proj = await ensureProject(key);
  if (proj.metadata && Object.keys(proj.metadata).length > 0) return toProjectShape(proj);
  const metadata = { ...defaultMeta(), ...(seed && Object.keys(seed).length ? seed : {}) }; // complete metadata on seed
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body: { metadata }, prefer: "return=representation" }))[0];
  return toProjectShape(row);
}

/** List every project in the web app's shape (project switcher / hub). Core fields defaulted via toProjectShape. */
export async function listProjectMeta() {
  const rows = await sb(`projects?select=key,name,metadata&order=created_at.desc`);
  return (rows || []).map(toProjectShape);
}

/** Patch a project's metadata (stage/dims/snapshot/rate_pack/boq_baseline/carbon_baseline/name). */
export async function patchProjectMeta(key, patch = {}) {
  const proj = await ensureProject(key);
  const metadata = mergeMeta((proj.metadata && Object.keys(proj.metadata).length) ? proj.metadata : defaultMeta(), patch);
  const body = { metadata };
  if (patch.name !== undefined) body.name = patch.name;
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body, prefer: "return=representation" }))[0];
  return toProjectShape(row);
}

/** Record a stage gate result; on pass+advance_to, move the project's stage. */
export async function recordGate(key, stage, b = {}) {
  const proj = await ensureProject(key);
  const meta = (proj.metadata && Object.keys(proj.metadata).length) ? proj.metadata : defaultMeta();
  const gates = { ...(meta.gates || {}), [stage]: { status: b.status || "hold", checks: b.checks || [], at: new Date().toISOString() } };
  const next = { ...meta, gates, updated_at: new Date().toISOString() };
  if (b.status === "pass" && b.advance_to && STAGES.includes(b.advance_to)) next.stage = b.advance_to;
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body: { metadata: next }, prefer: "return=representation" }))[0];
  return toProjectShape(row);
}

// ── Projects hub (the "which project?" layer above the per-project CDE board) ──────────────────────────

/** Slugify a free-text name into a stable, URL-safe project key. */
function slugKey(s) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** List every CDE project (newest first) with a container count — the hub's card data. */
export async function listProjects() {
  // PostgREST embeds an aggregate as information_containers:[{count}].
  const rows = await sb(
    `projects?select=id,key,name,appointing_party,status_scheme,created_at,information_containers(count)&order=created_at.desc`,
  );
  return (rows || []).map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    appointing_party: p.appointing_party ?? null,
    status_scheme: p.status_scheme ?? null,
    created_at: p.created_at,
    container_count: Array.isArray(p.information_containers) ? p.information_containers[0]?.count ?? 0 : 0,
  }));
}

/** Create a CDE project (idempotent on the derived key) and seed its default folder tree. */
export async function createProject(b = {}) {
  const key = slugKey(b.key || b.name);
  if (!key) throw new Error("A project name or key is required");
  const existing = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`);
  if (existing?.length) {
    await ensureFolders(existing[0].id);
    return existing[0];
  }
  const row = (await sb(`projects`, {
    method: "POST",
    body: { key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null },
    prefer: "return=representation",
  }))[0];
  await ensureFolders(row.id);
  await audit(row.id, "project", row.id, "created", b.actor || "web", null, { key, name: row.name });
  return row;
}

// ── Folders (ACC/Forma-style "Project Files" tree, per project) ───────────────────────────────────────
// Default seed for a new project. Purely organizational — the ISO 19650 state lives on container_versions.
const DEFAULT_TREE = ["Architecture", "Structure", "MEP", "Civil", "Shared", "Incoming", "Reports"];

/** Seed the default folder tree the first time a project is touched (idempotent — no-op if folders exist). */
export async function ensureFolders(projectId) {
  const existing = await sb(`folders?project_id=eq.${projectId}&select=id&limit=1`);
  if (existing?.length) return;
  const root = (await sb(`folders`, {
    method: "POST",
    body: { project_id: projectId, parent_id: null, name: "Project Files", kind: "root", sort: 0 },
    prefer: "return=representation",
  }))[0];
  await sb(`folders`, {
    method: "POST",
    body: DEFAULT_TREE.map((name, i) => ({ project_id: projectId, parent_id: root.id, name, kind: "folder", sort: i })),
  });
}

export async function listFolders(key) {
  const proj = await ensureProject(key);
  await ensureFolders(proj.id);
  return sb(`folders?project_id=eq.${proj.id}&select=*&order=sort.asc,name.asc`);
}

export async function createFolder(key, b) {
  const proj = await ensureProject(key);
  const row = (await sb(`folders`, {
    method: "POST",
    body: { project_id: proj.id, parent_id: b.parent_id || null, name: (b.name || "New folder").trim(), kind: "folder", sort: b.sort || 0 },
    prefer: "return=representation",
  }))[0];
  await audit(proj.id, "folder", row.id, "created", b.actor || "web", null, { name: row.name, parent_id: b.parent_id || null });
  return row;
}

export async function renameFolder(folderId, b) {
  const row = (await sb(`folders?id=eq.${folderId}`, {
    method: "PATCH", body: { name: (b.name || "").trim() }, prefer: "return=representation",
  }))[0];
  if (row) await audit(row.project_id, "folder", row.id, "renamed", b.actor || "web", null, { name: row.name });
  return row;
}

export async function deleteFolder(folderId, b = {}) {
  const found = (await sb(`folders?id=eq.${folderId}&select=*`))?.[0];
  if (!found) return { ok: false, message: "Folder not found" };
  if (found.kind === "root") return { ok: false, message: "The root folder can't be deleted" };
  await sb(`folders?id=eq.${folderId}`, { method: "DELETE" }); // cascades to subfolders; containers unfiled (set null)
  await audit(found.project_id, "folder", folderId, "deleted", b.actor || "web", { name: found.name }, null);
  return { ok: true };
}

/** File a container into a folder (folder_id null = project root / unfiled). */
export async function moveContainer(containerId, b) {
  const row = (await sb(`information_containers?id=eq.${containerId}`, {
    method: "PATCH", body: { folder_id: b.folder_id || null }, prefer: "return=representation",
  }))[0];
  if (row) await audit(row.project_id, "container", row.id, "moved", b.actor || "web", null, { folder_id: b.folder_id || null });
  return row;
}

export async function listContainers(key) {
  const proj = await ensureProject(key);
  return sb(`information_containers?project_id=eq.${proj.id}&select=*,container_versions(*)&order=created_at.desc`);
}

export async function createContainer(key, b) {
  const proj = await ensureProject(key);
  const c = (await sb(`information_containers`, {
    method: "POST",
    body: { project_id: proj.id, folder_id: b.folder_id || null, iso_name: b.iso_name, title: b.title, discipline: b.discipline, container_type: b.container_type || "model" },
    prefer: "return=representation",
  }))[0];
  const v = (await sb(`container_versions`, {
    method: "POST",
    body: { container_id: c.id, revision: b.revision || "P01", state: "wip", suitability: b.suitability || "S0", author: b.author, file_ref: b.file_ref },
    prefer: "return=representation",
  }))[0];
  await audit(proj.id, "container", c.id, "created", b.author, null, { iso_name: b.iso_name });
  return { ...c, container_versions: [v] };
}

export async function addVersion(container_id, b) {
  return (await sb(`container_versions`, {
    method: "POST",
    body: { container_id, revision: b.revision, state: "wip", suitability: b.suitability || "S0", author: b.author, notes: b.notes, file_ref: b.file_ref },
    prefer: "return=representation",
  }))[0];
}

// ── File versioning (migration 0011) ───────────────────────────────────────────────────────────────────
// A "file" is an information_container; each upload appends a container_version carrying the blob facts
// (size, sha256, platform item id) and a single `is_live` pointer per file. Built on the same rows the CDE
// panel shows (one source of truth) — this is just the file/blob-centric view of them.

/** List a project's files (containers) with their version history, newest version first, live flagged. */
export async function listFiles(key) {
  const proj = await ensureProject(key);
  const rows = await sb(`information_containers?project_id=eq.${proj.id}&select=id,iso_name,title,discipline,container_type,created_at,container_versions(id,revision,state,suitability,author,notes,size_bytes,sha256,platform_item_id,file_ref,is_live,superseded,created_at)&order=created_at.desc`);
  return (Array.isArray(rows) ? rows : []).map((c) => {
    const versions = (c.container_versions || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return {
      id: c.id, iso_name: c.iso_name, title: c.title, discipline: c.discipline, container_type: c.container_type,
      created_at: c.created_at, version_count: versions.length,
      live_version_id: versions.find((v) => v.is_live)?.id ?? null,
      versions,
    };
  });
}

/** Flip the live pointer: mark one version live, all its siblings not-live (partial-unique-safe: clear first). */
export async function setLiveVersion(version_id, actor) {
  const rows = await sb(`container_versions?id=eq.${encodeURIComponent(version_id)}&select=id,container_id,revision`);
  const v = Array.isArray(rows) ? rows[0] : null;
  if (!v) { const e = new Error("version not found"); e.status = 404; throw e; }
  // Clear the container's current live row FIRST so the partial unique index never sees two live rows.
  await sb(`container_versions?container_id=eq.${v.container_id}&is_live=eq.true`, { method: "PATCH", body: { is_live: false }, prefer: "return=minimal" });
  await sb(`container_versions?id=eq.${encodeURIComponent(version_id)}`, { method: "PATCH", body: { is_live: true }, prefer: "return=minimal" });
  const c = await sb(`information_containers?id=eq.${v.container_id}&select=project_id,iso_name`);
  const meta = Array.isArray(c) ? c[0] : null;
  if (meta) await audit(meta.project_id, "file_version", version_id, "set live", actor || "web", null, { file: meta.iso_name, revision: v.revision });
  return { ok: true, version_id, container_id: v.container_id };
}

/** Register an uploaded file as a new version. Create-or-append by file name; the new version becomes live. */
export async function registerFileVersion(key, b = {}) {
  const proj = await ensureProject(key);
  const name = (b.name || b.iso_name || "").trim();
  if (!name) { const e = new Error("name required"); e.status = 400; throw e; }

  const existing = await sb(`information_containers?project_id=eq.${proj.id}&iso_name=eq.${encodeURIComponent(name)}&select=id,container_versions(id,revision,is_live,platform_item_id)`);
  let container = Array.isArray(existing) ? existing[0] : null;

  // Geometry link: Governed Publish creates the version at publish time (verdict-badged, but no platform
  // geometry yet); the outbox watcher then uploads the IFC and calls back here with the platform item id. If
  // the file's live version has no geometry yet, ATTACH the item to it rather than appending a second,
  // unbadged version — so the badged version gets its geometry and "Open 3D" lights up.
  if (container && b.platform_item_id) {
    const liveNoGeom = (container.container_versions || []).find((v) => v.is_live && !v.platform_item_id);
    if (liveNoGeom) {
      await sb(`container_versions?id=eq.${liveNoGeom.id}`, { method: "PATCH", body: { platform_item_id: b.platform_item_id }, prefer: "return=minimal" });
      await audit(proj.id, "file_version", liveNoGeom.id, "geometry linked", b.author || "web", null, { file: name, platform_item_id: b.platform_item_id });
      return { container_id: container.id, iso_name: name, linked: true, version: { id: liveNoGeom.id, revision: liveNoGeom.revision, platform_item_id: b.platform_item_id, is_live: true } };
    }
  }

  if (!container) {
    container = (await sb(`information_containers`, {
      method: "POST",
      body: { project_id: proj.id, iso_name: name, title: b.title || name, discipline: b.discipline || null, container_type: "model" },
      prefer: "return=representation",
    }))[0];
    await audit(proj.id, "container", container.id, "created", b.author || "web", null, { iso_name: name });
  }

  // Next revision label: honour a supplied one, else v{N+1} across the file's existing versions.
  const priorCount = (container.container_versions || []).length;
  const revision = b.revision || `v${priorCount + 1}`;

  const version = (await sb(`container_versions`, {
    method: "POST",
    body: {
      container_id: container.id, revision, state: b.state || "wip", suitability: b.suitability || "S0",
      author: b.author || "web", notes: b.notes || null, file_ref: b.file_ref || null,
      platform_item_id: b.platform_item_id || null,
      size_bytes: b.size_bytes != null ? Number(b.size_bytes) : null,
      sha256: b.sha256 || null, is_live: false,
    },
    prefer: "return=representation",
  }))[0];

  await setLiveVersion(version.id, b.author || "web");
  await audit(proj.id, "file_version", version.id, "uploaded", b.author || "web", null,
    { file: name, revision, size_bytes: version.size_bytes, platform_item_id: version.platform_item_id });
  return { container_id: container.id, iso_name: name, version: { ...version, is_live: true } };
}

/** Run the DB state machine (validates the transition, writes the audit row, enforces immutability). */
export async function transition(version_id, new_state, actor, note) {
  return sb(`rpc/cde_transition`, { method: "POST", body: { p_version: version_id, p_new_state: new_state, p_actor: actor, p_note: note } });
}

export async function listAudit(key) {
  const proj = await ensureProject(key);
  return sb(`audit_log?project_id=eq.${proj.id}&select=*&order=id.desc&limit=200`);
}

export async function audit(project_id, entity_type, entity_id, action, actor, oldv, newv) {
  // audit_log has no authed-insert policy (writes bypass RLS by design) → force the service key.
  return sb(`audit_log`, { method: "POST", body: { project_id, entity_type, entity_id, action, actor, old_value: oldv, new_value: newv }, service: true });
}

/** Record an audit event by project KEY (golden thread) — the DB trigger hash-chains it (tamper-evident). */
export async function recordAudit(key, b) {
  const proj = await ensureProject(key);
  return (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id,
      entity_type: b.entity_type || "event",
      entity_id: b.entity_id ?? null,
      action: b.action || "recorded",
      actor: b.actor ?? null,
      old_value: b.old_value ?? null,
      new_value: b.new_value ?? null,
    },
    prefer: "return=representation",
    service: true, // audit_log bypasses RLS by design
  }))[0];
}

// ── Element snapshots (revision tracking) — migration 0005 ─────────────────────────────────────────────
// Persist per-element, per-revision quantities keyed on the IFC GlobalId. The shared revision-diff engine
// (WebApp/src/sentinel-core/revision-diff.ts) diffs two revisions on guid to serve 5D cost, 6D carbon, and
// clash provenance. APPEND-ONLY: each ingest = one model_revisions row + a batch of element_snapshots.

const MAX_SNAPSHOTS = 200000;              // safety cap per revision (a very large federated model)
const SNAP_INSERT_CHUNK = 2000;            // rows per PostgREST insert (keep each request modest)
const SNAP_PAGE = 1000;                     // read page size (matches Supabase's default db-max-rows)
const snapNum = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Ingest a model revision + its element snapshots. Returns { revision_id, element_count, rev_code, uploaded_at }. */
/** The project's live file version, but only if EXACTLY one exists (so auto-linking can't mislink). */
async function soleLiveVersionId(projectId) {
  const conts = await sb(`information_containers?project_id=eq.${projectId}&select=id`);
  const ids = (Array.isArray(conts) ? conts : []).map((c) => c.id);
  if (!ids.length) return null;
  const live = await sb(`container_versions?is_live=eq.true&container_id=in.(${ids.join(",")})&select=id`);
  return Array.isArray(live) && live.length === 1 ? live[0].id : null;
}

export async function createRevision(key, b = {}) {
  const proj = await ensureProject(key);
  // Link this take-off to a file version so the Versions panel can diff versions (migration 0011). Honour an
  // explicit id; else auto-link to the sole live version — a captured baseline belongs to the live file.
  const containerVersionId = b.container_version_id || (await soleLiveVersionId(proj.id));
  const snaps = Array.isArray(b.snapshots) ? b.snapshots : [];
  if (snaps.length > MAX_SNAPSHOTS) throw new Error(`too many snapshots (${snaps.length} > ${MAX_SNAPSHOTS})`);
  // Normalize + drop guid-less rows (guid is NOT NULL and the join key), then de-dupe on guid within the batch
  // (PK is (revision_id, guid) — a dup would 409 the whole insert; first occurrence wins, matching the diff engine).
  const seen = new Set();
  const deduped = snaps
    .map((s) => ({
      guid: s && s.guid != null ? String(s.guid) : "",
      category: s?.category ?? null, type_name: s?.type_name ?? null,
      count: snapNum(s?.count), length: snapNum(s?.length), area: snapNum(s?.area), volume: snapNum(s?.volume), weight: snapNum(s?.weight),
    }))
    .filter((r) => r.guid && (seen.has(r.guid) ? false : (seen.add(r.guid), true)));
  // Write the revision header with the count we will actually persist, so element_count never overstates.
  const rev = (await sb(`model_revisions`, {
    method: "POST",
    body: {
      project_id: proj.id,
      container_version_id: containerVersionId,
      rev_code: b.rev_code || null,
      model_id: b.model_id || null,
      element_count: deduped.length,
      uploaded_by: b.uploaded_by || null,
    },
    prefer: "return=representation",
  }))[0];
  for (let i = 0; i < deduped.length; i += SNAP_INSERT_CHUNK) {
    const chunk = deduped.slice(i, i + SNAP_INSERT_CHUNK).map((r) => ({ ...r, revision_id: rev.id, project_id: proj.id }));
    await sb(`element_snapshots`, { method: "POST", body: chunk, prefer: "return=minimal" });
  }
  await audit(proj.id, "revision", rev.id, "snapshot ingested", b.uploaded_by || "web", null,
    { rev_code: rev.rev_code, model_id: rev.model_id, element_count: deduped.length });
  return { revision_id: rev.id, element_count: deduped.length, rev_code: rev.rev_code, uploaded_at: rev.uploaded_at };
}

/** List a project's revision metadata (newest first) — the baseline picker. No per-element rows. */
export async function listRevisions(key) {
  const proj = await ensureProject(key);
  return sb(`model_revisions?project_id=eq.${proj.id}&select=id,rev_code,model_id,element_count,container_version_id,uploaded_by,uploaded_at&order=uploaded_at.desc&limit=200`);
}

/** IFC5-aligned ECS export of the governed element graph for a project (default = latest revision). */
export async function getElementGraph(key, revisionId) {
  const revs = await listRevisions(key);
  const rev = revisionId ? (revs.find((r) => r.id === revisionId) ?? { id: revisionId }) : (revs[0] ?? null);
  if (!rev) return { revision: null, graph: { schema: "sentinel.element-graph/1", layer: key, count: 0, elements: [] } };
  const rows = await getRevisionSnapshots(rev.id);
  const measures = ["count", "length", "area", "volume", "weight"];
  const snaps = rows.map((r) => {
    const quantities = {};
    for (const m of measures) if (r[m] != null) quantities[m] = Number(r[m]);
    return { guid: r.guid, category: r.category, type_name: r.type_name, quantities };
  });
  const c = await core();
  return { revision: rev, graph: c.toElementGraph(snaps, `${key}${rev.rev_code ? "@" + rev.rev_code : ""}`) };
}

/** Fetch one revision's element snapshots (for diffing / rehydrating a baseline). Pages past db-max-rows. */
export async function getRevisionSnapshots(revisionId) {
  const rid = encodeURIComponent(revisionId);
  const out = [];
  for (let offset = 0; ; offset += SNAP_PAGE) {
    const batch = await sb(`element_snapshots?revision_id=eq.${rid}&select=guid,category,type_name,count,length,area,volume,weight&order=guid.asc&limit=${SNAP_PAGE}&offset=${offset}`);
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    if (batch.length < SNAP_PAGE) break;
  }
  return out;
}

// ── Cross-machine event feed (migration 0010) — bridges fan out SSE via a shared table ─────────────────
/** Record an SSE event so other bridges' poll loops re-broadcast it to their own clients. */
export async function emitEvent(project, origin, payload) {
  // bridge_events is service-only (RLS denies authed writes) → force the service key.
  await sb(`bridge_events`, { method: "POST", body: { project_id: project, origin, payload }, prefer: "return=minimal", service: true });
}
/** The current tip id — a bridge starts polling from here so it never replays history at startup. */
export async function maxEventId() {
  const r = await sb(`bridge_events?select=id&order=id.desc&limit=1`, { service: true });
  return r?.[0]?.id ? Number(r[0].id) : 0;
}
/** Events after `afterId` (ascending), for the poll loop. */
export async function pollEvents(afterId) {
  return (await sb(`bridge_events?id=gt.${Number(afterId) || 0}&select=id,project_id,origin,payload&order=id.asc&limit=500`, { service: true })) || [];
}
/** Drop events older than `olderThanMs` (they're only for live fan-out). */
export async function pruneEvents(olderThanMs = 600000) {
  await sb(`bridge_events?created_at=lt.${new Date(Date.now() - olderThanMs).toISOString()}`, { method: "DELETE", prefer: "return=minimal", service: true });
}

// ── The "propose API" (referee layer) — an agent/tool PROPOSES; Sentinel adjudicates deterministically with
// the SAME governed-core validators the browser uses (bundled to sentinel-core.mjs) and records the verdict
// immutably. Let a thousand generators propose; this is where their output becomes TRUE (or is rejected). ──
let _core = null;
const core = async () => (_core ??= await import("./sentinel-core.mjs"));

// Swappable container-naming ruleset (bridge/naming-ruleset.json) — the office's ISO 19650 naming convention
// as DATA, not code. Cached; missing/invalid → null (naming gate simply off). A caller may also pass an inline
// ruleset in the propose body to override per-request.
let _naming; // undefined = not yet loaded, null = absent/invalid
function defaultNamingRuleset() {
  if (_naming !== undefined) return _naming;
  try {
    // NOTE: `URL` is shadowed in this module (const URL = SUPABASE_URL), so use import.meta.dirname, not new URL().
    const rs = JSON.parse(readFileSync(`${import.meta.dirname}/naming-ruleset.json`, "utf8"));
    _naming = Array.isArray(rs?.fields) && rs.separator ? rs : null;
    if (_naming) console.error("[naming] ruleset:", _naming.title, "| enforce:", _naming.enforce);
  } catch (e) { _naming = null; console.error("[naming] ruleset load FAILED:", e?.message || e); }
  return _naming;
}
const resolveNamingRuleset = (inline) =>
  (inline && typeof inline === "object" && Array.isArray(inline.fields)) ? inline : defaultNamingRuleset();

/** Adjudicate a proposal: validate `elements` against an IDS (JSON spec or .ids XML string), record an
 *  immutable audit verdict, return { verdict, summary, failures, audit_id }. No IDS → the proposal is
 *  just "recorded". Elements use the ElementProperties shape ({identity:{Class,GlobalId,…}, psets, quantities}). */
export async function adjudicateProposal(key, b = {}) {
  const c = await core();
  const elements = Array.isArray(b.elements) ? b.elements : [];
  let spec = null;
  if (b.ids) {
    if (typeof b.ids === "string") {
      // parseIds() needs a DOM (browser). Server-side, require a JSON IdsSpec rather than 500 on raw .ids XML.
      try { spec = c.parseIds(b.ids); }
      catch { const e = new Error("Submit the IDS as a JSON spec {title, specifications:[…]} — raw .ids XML is parsed browser-side only."); e.status = 400; throw e; }
    } else spec = b.ids;
  }
  // Delegate to the pure, unit-tested referee core (same code the browser uses).
  const adj = c.adjudicate(spec, elements);
  const { summary, failures } = adj;
  let verdict = adj.verdict;

  // Naming gate: if the caller supplies the container/file name, validate it against the (swappable) naming
  // ruleset and fold the result into the verdict per the ruleset's enforcement level. `reject` → a bad name
  // fails the whole publish (even if the IDS passed); `warn` → recorded but doesn't block; `off`/absent → skip.
  let naming = null;
  if (b.container_name) {
    const rs = resolveNamingRuleset(b.naming);
    if (rs && rs.enforce !== "off") {
      naming = c.validateContainerName(b.container_name, rs);
      naming.enforce = rs.enforce;
      if (!naming.ok && rs.enforce === "reject") verdict = "rejected";
    }
  }

  const proj = await ensureProject(key);
  const audit = (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id, entity_type: "proposal", entity_id: null,
      action: `Proposal ${verdict}${b.source ? " from " + b.source : ""}`,
      actor: b.actor ?? b.source ?? "agent", old_value: null,
      new_value: { source: b.source ?? null, verdict, summary, note: b.note ?? null, failures: failures.slice(0, 50), naming },
    },
    prefer: "return=representation", service: true, // audit_log bypasses RLS by design
  }))[0];
  // When the proposal is about a specific file version (the Governed Publish loop), ALSO record the verdict
  // against that version's id so the Versions panel can show a ✓/✗ badge on the row (entity_id = version id,
  // action "verdict:<verdict>"). Kept separate from the proposal record above so the agent/propose surface is
  // unchanged when no version is in play.
  if (b.version_id) {
    await sb(`audit_log`, {
      method: "POST",
      body: {
        project_id: proj.id, entity_type: "file_version", entity_id: b.version_id,
        action: `verdict:${verdict}`, actor: b.actor ?? b.source ?? "agent", old_value: null,
        new_value: { ids: summary.ids, summary, failures: failures.slice(0, 20), naming },
      },
      prefer: "return=minimal", service: true,
    });
  }
  return { verdict, summary, failures: failures.slice(0, 200), naming, audit_id: audit?.id ?? null, recorded_at: audit?.at ?? null };
}

// ── Generic document store (migration 0009) — backs the clash/RFI/tender/pack stores as JSONB documents.
const enc = encodeURIComponent;
const DOC_CONFLICT = "on_conflict=store,project_id,doc_id";

/** List a store's documents for a project (data objects, insertion order). */
export async function docList(store, pid) {
  const rows = await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&select=data&order=created_at.asc`);
  return (rows || []).map((r) => r.data);
}
/** Same, but lazy-migrate the local file into Supabase the first time a store/project with no rows is read. */
export async function docListLazy(store, pid, localDocs, idOf) {
  let rows = await docList(store, pid);
  if (!rows.length && Array.isArray(localDocs) && localDocs.length) {
    await sb(`bridge_docs`, { method: "POST", body: localDocs.map((d) => ({ store, project_id: pid, doc_id: String(idOf(d)), data: d })), prefer: "return=minimal" });
    rows = await docList(store, pid);
  }
  return rows;
}
export async function docGet(store, pid, docId) {
  const rows = await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&doc_id=eq.${enc(docId)}&select=data`);
  return rows?.[0]?.data ?? null;
}
export async function docUpsert(store, pid, docId, data) {
  await sb(`bridge_docs?${DOC_CONFLICT}`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal" });
  return data;
}
/** Create-only insert (no merge) → PostgREST 409 on PK conflict. Used for the crypto keystore so a concurrent
 *  first-setup can't clobber a DEK that already encrypted files. */
export async function docInsert(store, pid, docId, data) {
  await sb(`bridge_docs`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data }, prefer: "return=minimal" });
}
export async function docUpsertMany(store, pid, items) { // items: [{doc_id, data}]
  if (!items.length) return;
  await sb(`bridge_docs?${DOC_CONFLICT}`, { method: "POST", body: items.map((i) => ({ store, project_id: pid, doc_id: String(i.doc_id), data: i.data, updated_at: new Date().toISOString() })), prefer: "resolution=merge-duplicates,return=minimal" });
}
export async function docDeleteProject(store, pid) {
  await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}`, { method: "DELETE", prefer: "return=minimal" });
}

// ── BCF topics (migration 0008) — team-wide topic store. One JSONB document per topic so the exact BCF-API
// shape is preserved; the bridge keeps all topic construction/mutation, cde-store only persists. ────────────
const bcfRow = (t) => ({ guid: t.guid, project_id: t.project_id, topic_status: t.topic_status, model: t.model || "", data: t });

/** List a project's topics (full objects), same status/model filter as the local store. `localTopics`
 *  (optional) lazy-migrates the local file into Supabase the first time a project with no rows is listed. */
export async function bcfListTopics(pid, { status, model } = {}, localTopics) {
  const q = `bcf_topics?project_id=eq.${encodeURIComponent(pid)}&select=data&order=created_at.asc`;
  let rows = await sb(q);
  if ((!rows || !rows.length) && Array.isArray(localTopics) && localTopics.length) {
    await sb(`bcf_topics`, { method: "POST", body: localTopics.map(bcfRow), prefer: "return=minimal" });
    rows = await sb(q);
  }
  return (rows || [])
    .map((r) => r.data)
    .filter((t) => (!status ? t.topic_status !== "Closed" : status === "all" ? true : t.topic_status === status))
    .filter((t) => !model || t.model === model);
}

/** Fetch one topic object (or null). */
export async function bcfGetTopic(pid, guid) {
  const rows = await sb(`bcf_topics?guid=eq.${encodeURIComponent(guid)}&project_id=eq.${encodeURIComponent(pid)}&select=data`);
  return rows?.[0]?.data ?? null;
}

/** Insert a freshly-built topic. */
export async function bcfCreateTopic(topic) {
  await sb(`bcf_topics`, { method: "POST", body: bcfRow(topic), prefer: "return=minimal" });
  return topic;
}

/** Persist a mutated topic (update / comment / viewpoint all read-modify-write the whole document). */
export async function bcfSaveTopic(topic) {
  await sb(`bcf_topics?guid=eq.${encodeURIComponent(topic.guid)}`, {
    method: "PATCH",
    body: { data: topic, topic_status: topic.topic_status, model: topic.model || "", modified_at: new Date().toISOString() },
    prefer: "return=minimal",
  });
  return topic;
}

export async function listTransmittals(key) {
  const proj = await ensureProject(key);
  return sb(`transmittals?project_id=eq.${proj.id}&select=*&order=issued_at.desc`);
}

export async function createTransmittal(key, b) {
  const proj = await ensureProject(key);
  return (await sb(`transmittals`, {
    method: "POST",
    body: { project_id: proj.id, reference: b.reference, sender: b.sender, recipients: b.recipients || [], purpose: b.purpose, suitability: b.suitability, version_ids: b.version_ids || [], note: b.note },
    prefer: "return=representation",
  }))[0];
}
