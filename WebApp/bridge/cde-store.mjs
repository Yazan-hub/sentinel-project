import { randomUUID } from "node:crypto";
// Sentinel CDE store — Supabase-backed ISO 19650 information-container access for the bridge (C3).
// Zero-dep: talks to Supabase PostgREST + RPC over fetch with the SERVICE key (server-side only, never
// the browser). The state machine, published-immutability, and hash-chained audit all live in the DB
// (migrations 0001/0002) — this module is a thin REST wrapper the web app's CDE panel calls via the bridge.
//
// Config (config/.env, never committed):
//   SUPABASE_URL=https://<ref>.supabase.co
//   SUPABASE_SERVICE_KEY=<service_role secret from Supabase → Project Settings → API>

import { loadEnv } from "./thatopen-client.mjs";
import { normalizeAgent, buildReceipt, verifyReceipt } from "./agent-provenance.mjs";
import { currentUserToken, currentActor, resolveActor } from "./bridge-auth.mjs";

const env = { ...process.env, ...loadEnv() }; // config/.env is authoritative
const URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_KEY || "";
const ANON = env.SUPABASE_ANON_KEY || ""; // enables JWT-forwarding when set; without it the bridge stays service-key only

export const cdeConfigured = () => !!(URL && KEY);

/** Client-supplied ids go into uuid-typed PostgREST filters; a non-UUID makes Postgres throw a cast
 *  error that surfaces as a 500. Guard at every entry point that takes a caller's id: a malformed id
 *  can never match a row, so it is a plain 404 — decided before any network call. */
export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));
/** True once JWT-forwarding is armed (anon key present). Forwarding still only kicks in per-request when a
 *  caller actually presents a Supabase JWT; otherwise sb() uses the service key. */
export const forwardingConfigured = () => !!ANON;

// Forward the caller's Supabase JWT (RLS-enforced) when one is present AND forwarding is armed; else use the
// service key. `service: true` FORCES the service key for privileged writes that RLS blocks for authed users
// (audit_log inserts, bridge_events) — those must bypass RLS by design.
// `count: true` adds Prefer count=exact and returns { data, total }: total is the N of Content-Range "a-b/N", or of
// "*/N" for an empty page or a 416 (an offset past the end), both data []. A reply with no N is an error, never a
// planned or estimated count.
export async function sb(path, { method = "GET", body, prefer, service = false, count = false } = {}) {
  if (!cdeConfigured()) throw new Error("CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  const userToken = service ? null : currentUserToken();
  const useUser = !!(userToken && ANON);
  const headers = {
    apikey: useUser ? ANON : KEY,
    Authorization: `Bearer ${useUser ? userToken : KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer || count) headers.Prefer = [prefer, count && "count=exact"].filter(Boolean).join(",");
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
  if (count && (r.ok || r.status === 416)) {
    const range = r.headers.get("content-range") || "";
    const m = /^(\*|\d+-\d+)\/(\d+)$/.exec(range);
    if (!m) throw new Error(`Supabase gave no exact count (Content-Range: ${range || "none"})`);
    return { data: m[1] === "*" ? [] : data, total: Number(m[2]) };
  }
  if (!r.ok) {
    const err = new Error(`Supabase ${r.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    // Surface auth/permission failures with their real client status instead of a generic 500, so a caller
    // whose forwarded JWT is missing/expired/invalid gets a 401 (→ the web app can prompt re-login) and an
    // RLS/row-security denial gets a 403. Routes propagate this via `e?.status || 500`. Other upstream codes
    // (e.g. a malformed query) stay 500 by default — they signal a bridge bug, not a client-fixable one.
    if (r.status === 401 || r.status === 403) err.status = r.status;
    err.body = data; // PostgREST's { code, message, … } — lets a caller map a function's own refusal (transition)
    throw err;
  }
  return data;
}

/** Resolve a project KEY to its CDE row. Projects are created ONLY through the web hub's explicit
 *  "+ New project" (createProject) — an unknown key here is a 404, never an implicit INSERT. (The old
 *  create-on-first-use left test residue: every script that touched a key spawned a project row.) The
 *  single exception is "default", the system fallback every unconfigured publish lands in — that one
 *  self-heals so a wiped database can't brick zero-config publishing.
 *  Multi-user safe: when a caller's JWT is being forwarded (RLS on), existence is checked with the SERVICE
 *  key (authoritative — sees every project regardless of membership), then a forwarded RLS-filtered read
 *  confirms the caller is a member. A non-member gets a 403. */
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
  if (key !== "default") {
    const e = new Error(`Project "${key}" does not exist — create it in the web app (Projects → + New project) first.`);
    e.status = 404;
    throw e;
  }
  // "default" self-heals. return=minimal on purpose: the returning-select policy (is_member) can't yet see
  // the owner membership the trigger just created, so return=representation would 42501. Re-fetch with the
  // service key.
  await sb(`projects`, { method: "POST", body: { key, name: key }, prefer: "return=minimal" });
  const created = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`, { service: true });
  return created[0];
}

// ── Sentinel project metadata (migration 0007) — the governed-project store, unified into the Supabase
// `projects` row's `metadata` jsonb (was the per-machine bridge/project-store.json). The bridge maps this to
// the same JSON shape the web app already expects, so consolidating is transparent to callers.
export const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
const defaultMeta = () => ({
  stage: "design", standards_pack: "",
  dimensions: { "2d": true, "3d": true, "4d": false, "5d": true, "6d": false, "7d": false },
  gates: {}, snapshot: {}, updated_at: new Date().toISOString(),
});
/** Merge a patch into project metadata with the same field semantics as the old local store (deep-merge
 *  dimensions/snapshot, replace the rest). `name` is handled separately (a real column). */
function mergeMeta(meta, patch) {
  const out = { ...meta };
  // active_ruleset is retired (cohesion phase 3): the scan ruleset and the naming pack are artefacts
  // (PUT /cde/:key/artefacts/:kind). A value already in the column is left in place and read by nothing.
  for (const k of ["stage", "standards_pack", "rate_pack", "boq_baseline", "carbon_baseline"]) if (patch[k] !== undefined) out[k] = patch[k];
  if (patch.dimensions) out.dimensions = { ...(meta.dimensions || {}), ...patch.dimensions };
  if (patch.snapshot) out.snapshot = { ...(meta.snapshot || {}), ...patch.snapshot };
  out.updated_at = new Date().toISOString();
  return out;
}
/** Test seam: mergeMeta is module-private by design; this exposes it for unit tests only. */
export const mergeMetaForTest = mergeMeta;
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
  // Refuse rather than silently drop: a stale client that still "installs" a pack this way must see it failed.
  if (patch.active_ruleset !== undefined) throw Object.assign(new Error("active_ruleset is retired — install the scan ruleset with PUT /cde/:key/artefacts/ruleset and the naming pack with PUT /cde/:key/artefacts/naming"), { status: 400 });
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

/** Every project's identity and office relation, service-key read (the office helpers need to see rows the
 *  caller is not a member of, e.g. a project's office). Rows from before migration 0029 have no kind/office_key. */
export async function listProjectRows() {
  let rows;
  try {
    rows = await sb(`projects?select=id,key,name,kind,office_key&order=created_at.asc`, { service: true });
  } catch (e) {
    if (!/column .* does not exist|42703/.test(String(e?.message || e))) throw e;
    rows = await sb(`projects?select=id,key,name&order=created_at.asc`, { service: true });
  }
  return (rows || []).map((r) => ({ id: r.id, key: r.key, name: r.name, kind: r.kind ?? "project", office_key: r.office_key ?? null }));
}
export { officeKeyOf, listOfficeProjects, projectScope } from "./office-scope.mjs";

/** List every CDE project (newest first) with a container count — the hub's card data. */
export async function listProjects() {
  // PostgREST embeds an aggregate as information_containers:[{count}].
  let rows;
  try {
    rows = await sb(
      `projects?select=id,key,name,appointing_party,status_scheme,created_at,metadata,kind,office_key,information_containers(count)&order=created_at.desc`,
    );
  } catch (e) {
    if (!/column .* does not exist|42703/.test(String(e?.message || e))) throw e;
    rows = await sb(
      `projects?select=id,key,name,appointing_party,status_scheme,created_at,metadata,information_containers(count)&order=created_at.desc`,
    );
  }
  const byKey = new Map(rows.map((p) => [p.key, p.name]));
  return (rows || []).map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    appointing_party: p.appointing_party ?? null,
    status_scheme: p.status_scheme ?? null,
    created_at: p.created_at,
    settings: p.metadata?.settings ?? null, // Forma-style settings (owner, address, archived, …)
    container_count: Array.isArray(p.information_containers) ? p.information_containers[0]?.count ?? 0 : 0,
    kind: p.kind ?? "project",
    office_key: p.office_key ?? null,
    office_name: p.office_key ? byKey.get(p.office_key) ?? null : null,
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
  // return=minimal on purpose (same trap ensureProject documents): under a FORWARDED session the
  // returning-select runs the is_member policy before the owner-membership row the insert trigger
  // just created is visible → 42501/403 and the whole insert rolls back. Insert minimal, then
  // re-fetch with the service key.
  await sb(`projects`, {
    method: "POST",
    body: {
      key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null,
      kind: b.kind === "office" ? "office" : "project", office_key: b.office_key || null,
    },
    prefer: "return=minimal",
  });
  const row = (await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`, { service: true }))[0];
  await ensureFolders(row.id);
  await audit(row.id, "project", row.id, "created", b.actor || "web", null,
    { key, name: row.name, kind: row.kind, office_key: row.office_key ?? null });
  return row;
}

// Forma-style project settings live under metadata.settings so they never collide with the governance
// fields (stage/gates/dimensions/snapshot) that share the same jsonb column.
const SETTINGS_FIELDS = [
  "address", "location", "owner", "project_number", "project_type",
  "start_date", "completion_date", "project_value", "archived",
];

/** Update a project's identity + Forma-style settings (rename, owner, address, dates, archive…).
 *  The key is never changed — it's the stable identifier every store hangs off. RLS (when a JWT is
 *  forwarded) requires the 'lead' role via projects_update. */
export async function updateProject(key, patch = {}, actor) {
  const proj = await ensureProject(key);
  const body = {};
  if (patch.name !== undefined && String(patch.name).trim()) body.name = String(patch.name).trim();
  if (patch.appointing_party !== undefined) body.appointing_party = patch.appointing_party || null;
  if (patch.office_key !== undefined) body.office_key = patch.office_key ? String(patch.office_key).trim() : null;
  if (patch.kind !== undefined) {
    if (!["project", "office"].includes(patch.kind)) { const e = new Error("kind must be project or office"); e.status = 400; throw e; }
    body.kind = patch.kind;
  }

  const hasSettings = SETTINGS_FIELDS.some((f) => patch[f] !== undefined);
  if (hasSettings) {
    const meta = (proj.metadata && Object.keys(proj.metadata).length) ? proj.metadata : defaultMeta();
    const settings = { ...(meta.settings || {}) };
    for (const f of SETTINGS_FIELDS) if (patch[f] !== undefined) settings[f] = patch[f];
    body.metadata = { ...meta, settings, updated_at: new Date().toISOString() };
  }
  if (!Object.keys(body).length) return proj;

  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body, prefer: "return=representation" }))[0];
  await audit(proj.id, "project", proj.id, "updated", actor || "web", null,
    {
      key, ...(body.name ? { name: body.name } : {}), ...(hasSettings ? { settings: body.metadata.settings } : {}),
      ...(body.office_key !== undefined ? { office_key: { from: proj.office_key ?? null, to: body.office_key } } : {}),
      ...(body.kind !== undefined ? { kind: { from: proj.kind ?? "project", to: body.kind } } : {}),
    });
  return row;
}

/** Delete a project and everything the schema cascades (containers, versions, folders, parties,
 *  memberships, transmittals, snapshots). Deliberately preserved: the audit_log trail (immutable
 *  evidence, undeletable by design). Projects with PUBLISHED versions cannot be deleted — the DB's
 *  trg_protect_published raises, surfaced here as a 409 with an archive-instead message. RLS (when a
 *  JWT is forwarded) requires the 'owner' role via projects_delete. */
export async function deleteProject(key, actor) {
  const proj = await ensureProject(key);
  // Best-effort cleanup of the text-keyed side stores first (no FK → they'd orphan silently).
  for (const store of ["clash", "rfi", "tender", "keystore"]) {
    try { await docDeleteProject(store, key); } catch { /* side store cleanup must not block the delete */ }
  }
  try { await sb(`bcf_topics?project_id=eq.${encodeURIComponent(key)}`, { method: "DELETE", prefer: "return=minimal", service: true }); }
  catch { /* best-effort */ }

  // The audit row is written BEFORE the delete (audit_log has no FK, so it survives — the golden thread).
  await audit(proj.id, "project", proj.id, "deleted", actor || "web", { key, name: proj.name }, null);
  try {
    await sb(`projects?id=eq.${proj.id}`, { method: "DELETE", prefer: "return=minimal" });
  } catch (e) {
    if (String(e?.message || "").includes("published versions are immutable")) {
      const err = new Error("This project has PUBLISHED versions, which are immutable by design — the project cannot be hard-deleted. Archive it instead (Settings → Danger zone).");
      err.status = 409;
      throw err;
    }
    throw e;
  }
  return { deleted: true, key };
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
  const row = (await sb(`folders?id=eq.${encodeURIComponent(folderId)}`, {
    method: "PATCH", body: { name: (b.name || "").trim() }, prefer: "return=representation",
  }))[0];
  if (row) await audit(row.project_id, "folder", row.id, "renamed", b.actor || "web", null, { name: row.name });
  return row;
}

export async function deleteFolder(folderId, b = {}) {
  const found = (await sb(`folders?id=eq.${encodeURIComponent(folderId)}&select=*`))?.[0];
  if (!found) return { ok: false, message: "Folder not found" };
  if (found.kind === "root") return { ok: false, message: "The root folder can't be deleted" };
  await sb(`folders?id=eq.${encodeURIComponent(folderId)}`, { method: "DELETE" }); // cascades to subfolders; containers unfiled (set null)
  await audit(found.project_id, "folder", folderId, "deleted", b.actor || "web", { name: found.name }, null);
  return { ok: true };
}

/** File a container into a folder (folder_id null = project root / unfiled). */
export async function moveContainer(containerId, b) {
  const row = (await sb(`information_containers?id=eq.${encodeURIComponent(containerId)}`, {
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
    body: { container_id: c.id, revision: b.revision || "P01", state: "wip", suitability: b.suitability || "S0", author: resolveActor(b.author), file_ref: b.file_ref },
    prefer: "return=representation",
  }))[0];
  await audit(proj.id, "container", c.id, "created", b.author, null, { iso_name: b.iso_name });
  return { ...c, container_versions: [v] };
}

export async function addVersion(container_id, b) {
  return (await sb(`container_versions`, {
    method: "POST",
    body: { container_id, revision: b.revision, state: "wip", suitability: b.suitability || "S0", author: resolveActor(b.author), notes: b.notes, file_ref: b.file_ref },
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
  const rows = await sb(`information_containers?project_id=eq.${proj.id}&select=id,iso_name,title,discipline,container_type,parent_id,created_at,container_versions(id,revision,state,suitability,author,notes,size_bytes,sha256,platform_item_id,file_ref,is_live,superseded,created_at)&order=created_at.desc`);
  return (Array.isArray(rows) ? rows : []).map((c) => {
    const versions = (c.container_versions || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return {
      id: c.id, iso_name: c.iso_name, title: c.title, discipline: c.discipline, container_type: c.container_type,
      parent_id: c.parent_id ?? null, // linked model → nests under this host container in the file tree
      created_at: c.created_at, version_count: versions.length,
      live_version_id: versions.find((v) => v.is_live)?.id ?? null,
      versions,
    };
  });
}

/** Flip the live pointer: mark one version live, all its siblings not-live (partial-unique-safe: clear first). */
export async function setLiveVersion(version_id, actor) {
  if (!isUuid(version_id)) { const e = new Error("version not found"); e.status = 404; throw e; }
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

/** Resolve a container within a project (404 when absent / not this project's). */
async function containerOf(key, container_id) {
  const proj = await ensureProject(key);
  const rows = await sb(`information_containers?id=eq.${encodeURIComponent(container_id)}&project_id=eq.${proj.id}&select=id,iso_name,container_versions(id,state)`);
  const c = Array.isArray(rows) ? rows[0] : null;
  if (!c) { const e = new Error("file not found in this project"); e.status = 404; throw e; }
  return { proj, c };
}

/** Rename a file (its ISO container name + title). Audited; versions/history untouched. */
export async function renameFile(key, container_id, name, actor) {
  const clean = String(name || "").trim();
  if (!clean) { const e = new Error("a file name is required"); e.status = 400; throw e; }
  const { proj, c } = await containerOf(key, container_id);
  await sb(`information_containers?id=eq.${c.id}`, { method: "PATCH", body: { iso_name: clean, title: clean }, prefer: "return=minimal" });
  await audit(proj.id, "container", c.id, "renamed", actor || "web", { iso_name: c.iso_name }, { iso_name: clean });
  return { ok: true, iso_name: clean };
}

/** Archive a file, governance-consistent: PUBLISHED versions transition to 'archived' (the only legal ISO
 *  move — they stay on the record, immutable); wip/shared drafts are deleted. The file then holds only
 *  archived versions and the web hides it behind the "archived" toggle. */
export async function archiveFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  const versions = c.container_versions || [];
  let archived = 0, discarded = 0;
  for (const v of versions) {
    if (v.state === "published") { await transition(key, v.id, "archived", { actor: actor || "web", note: "file archived" }); archived++; }
    else if (v.state !== "archived") { await sb(`container_versions?id=eq.${v.id}`, { method: "DELETE", prefer: "return=minimal" }); discarded++; }
  }
  await audit(proj.id, "container", c.id, "archived", actor || "web", null, { iso_name: c.iso_name, archived, discarded });
  return { ok: true, archived, discarded };
}

/** Restore an archived file: archived versions return to 'published' (the state they held before
 *  archiving — only published versions survive the archive step) through cde_transition's archived→published
 *  move (migration 0031): lead-only for a signed-in caller, one state: row per version. A refusal stops the loop
 *  in the function's words (transition). */
export async function unarchiveFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  let restored = 0;
  for (const v of c.container_versions || []) {
    if (v.state !== "archived") continue;
    await transition(key, v.id, "published", { actor: actor || "web", note: "file restored" });
    restored++;
  }
  await audit(proj.id, "container", c.id, "unarchived", actor || "web", null, { iso_name: c.iso_name, restored });
  return { ok: true, restored };
}

/** Delete a file (container + versions, cascading). PUBLISHED versions are immutable — the DB trigger
 *  refuses, surfaced as a 409 telling the caller to archive instead. Audit trail survives (no FK). */
export async function deleteFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  await audit(proj.id, "container", c.id, "deleted", actor || "web", { iso_name: c.iso_name }, null);
  try {
    await sb(`information_containers?id=eq.${c.id}`, { method: "DELETE", prefer: "return=minimal" });
  } catch (e) {
    if (String(e?.message || "").includes("published versions are immutable")) {
      const err = new Error("This file has PUBLISHED versions, which are immutable by design — it cannot be deleted. Archive it instead.");
      err.status = 409;
      throw err;
    }
    throw e;
  }
  return { deleted: true, iso_name: c.iso_name };
}

/** Register an uploaded file as a new version. Create-or-append by file name; the new version becomes live and
 *  always starts in wip (a body's `state` is ignored — publishing is cde_transition's, migration 0031). */
export async function registerFileVersion(key, b = {}) {
  const proj = await ensureProject(key);
  const name = (b.name || b.iso_name || "").trim();
  if (!name) { const e = new Error("name required"); e.status = 400; throw e; }

  const existing = await sb(`information_containers?project_id=eq.${proj.id}&iso_name=eq.${encodeURIComponent(name)}&select=id,parent_id,container_versions(id,revision,is_live,platform_item_id)`);
  let container = Array.isArray(existing) ? existing[0] : null;

  // Host→link nesting (0019): a linked model names its host file; resolve it in the same project and
  // record parent_id so the web file tree nests the link under its host. Best-effort — a host that
  // hasn't registered yet (upload order isn't guaranteed) just leaves the link top-level.
  let parentId = null;
  if (b.parent_name) {
    const host = await sb(`information_containers?project_id=eq.${proj.id}&iso_name=eq.${encodeURIComponent(String(b.parent_name).trim())}&select=id`);
    parentId = Array.isArray(host) && host[0] ? host[0].id : null;
  }
  if (container && parentId && container.parent_id !== parentId) {
    // Existing file republished as a link (or host registered after the link) — adopt the nesting.
    await sb(`information_containers?id=eq.${container.id}`, { method: "PATCH", body: { parent_id: parentId }, prefer: "return=minimal" });
  }

  // Geometry link, opt-in: only `attach_geometry: true` (the outbox watcher's pre-5b sidecar, which carries no
  // version_id) attaches the platform item to the file's live version that has no geometry yet, so the version
  // Governed Publish registered gets its geometry. Every other caller lands as its own version: a web upload
  // whose name matched a Revit-judged version once attached onto it (files-panel.ts), and an intake's verdict
  // once landed on a stale row (phase 5 spec, Decision 6).
  if (container && b.platform_item_id && b.attach_geometry === true) {
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
      body: { project_id: proj.id, iso_name: name, title: b.title || name, discipline: b.discipline || null, container_type: "model", parent_id: parentId },
      prefer: "return=representation",
    }))[0];
    await audit(proj.id, "container", container.id, "created", b.author || "web", null, { iso_name: name, ...(parentId ? { link_of: b.parent_name } : {}) });
  }

  // Next revision label: honour a supplied one, else v{N+1} across the file's existing versions.
  const priorCount = (container.container_versions || []).length;
  const revision = b.revision || `v${priorCount + 1}`;

  const version = (await sb(`container_versions`, {
    method: "POST",
    body: {
      container_id: container.id, revision, state: "wip", suitability: b.suitability || "S0",
      author: resolveActor(b.author, "web"), notes: b.notes || null, file_ref: b.file_ref || null,
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

/** The outbox watcher's attach (spec Decision 6): put an uploaded platform item on the version a sidecar names, by
 *  id — only a version of `key`'s project, and only while it has no geometry (platform_item_id is written once; the
 *  PATCH is filtered on is.null, so a concurrent attach cannot overwrite). Audited "geometry linked" (actor outbox);
 *  returns the version and the ledger row's id. 400 for a blank item or a version not on `key`, 409 when the version
 *  already has geometry — each decided before any write. */
export async function attachGeometry(key, versionId, platformItemId) {
  const item = String(platformItemId ?? "").trim();
  const notOnKey = () => Object.assign(new Error(`version ${versionId} is not on ${key}`), { status: 400 });
  if (!item) { const e = new Error("platform_item_id required"); e.status = 400; throw e; }
  if (!isUuid(versionId)) throw notOnKey();
  const proj = await ensureProject(key);
  const v = (await sb(`container_versions?id=eq.${versionId}&select=id,container_id,revision,is_live,platform_item_id`))?.[0];
  const c = v && (await sb(`information_containers?id=eq.${v.container_id}&project_id=eq.${proj.id}&select=iso_name`))?.[0];
  if (!c) throw notOnKey();
  const done = v.platform_item_id ? [] : await sb(`container_versions?id=eq.${v.id}&platform_item_id=is.null`, { method: "PATCH", body: { platform_item_id: item }, prefer: "return=representation" });
  if (!done?.length) {
    const e = new Error(`version ${v.id} already has geometry${v.platform_item_id ? ` (platform item ${v.platform_item_id})` : ""} — a version's geometry is attached once`);
    e.status = 409;
    throw e;
  }
  const row = await audit(proj.id, "file_version", v.id, "geometry linked", "outbox", null, { file: c.iso_name, platform_item_id: item, by: "version_id" });
  return { container_id: v.container_id, iso_name: c.iso_name, linked: true, version: { id: v.id, revision: v.revision, platform_item_id: item, is_live: v.is_live }, audit_id: row?.id ?? null };
}

/** The version when it is on the key's project: { proj, version: { id, container_id, revision, state } }. Any
 *  other id — another project's version, an unknown or malformed one — is a 400 "version <id> is not on <key>". */
export async function versionOnKey(key, version_id) {
  const proj = await ensureProject(key);
  const rows = isUuid(version_id)
    ? await sb(`container_versions?id=eq.${version_id}&select=id,container_id,revision,state,information_containers(project_id)`)
    : [];
  const v = Array.isArray(rows) ? rows[0] : null;
  if (!v || v.information_containers?.project_id !== proj.id) {
    const e = new Error(`version ${version_id} is not on ${key}`); e.status = 400; throw e;
  }
  return { proj, version: { id: v.id, container_id: v.container_id, revision: v.revision, state: v.state } };
}

// cde_transition's raises (migration 0031) → the caller's status, in the function's own words: a refusal (P0001:
// the state machine, the verdict guard, the state trigger) is a 409; an unknown version (no_data_found) a 404; a
// role refusal (insufficient_privilege) a 403. Anything else stays the bridge's error (a 500 at the route, scrubbed).
const TRANSITION_REFUSAL = { P0001: 409, P0002: 404, "42501": 403 };

/** Run the DB state machine (validates the move and the verdict, writes the state: row, enforces immutability).
 *  `key` given → the version must be on that project (versionOnKey); the keyless route and the assistant pass
 *  null. `override` is the lead's reason to publish a version without an accepted verdict that measured
 *  something: sent only when not blank, and cde_transition takes it only from a signed-in lead. */
export async function transition(key, version_id, new_state, { actor, note, override } = {}) {
  if (!isUuid(version_id)) { const e = new Error("version not found"); e.status = 404; throw e; }
  // The reason is recorded word for word on the state: row, so only a string is one ({} or 5 would be "[object Object]"/"5").
  if (override != null && typeof override !== "string") { const e = new Error("override must be a string — the lead's reason to publish"); e.status = 400; throw e; }
  if (key) await versionOnKey(key, version_id);
  // ISO 19650 state changes are the governed trail's spine — stamp the verified identity, not the claim.
  const body = { p_version: version_id, p_new_state: new_state, p_actor: resolveActor(actor, "web"), p_note: note };
  const reason = String(override ?? "").trim();
  if (reason) body.p_override = reason;
  try {
    return await sb(`rpc/cde_transition`, { method: "POST", body });
  } catch (e) {
    const status = TRANSITION_REFUSAL[e?.body?.code];
    if (status) { const r = new Error(e.body.message); r.status = status; throw r; }
    throw e;
  }
}

/** The ledger read's page: 200 rows unless asked, never more than 1000 (the db-max-rows SNAP_PAGE assumes). */
export const AUDIT_LIMIT = 200, AUDIT_MAX = 1000;

/** GET /cde/:key/audit's query → { filter, limit, offset } for PostgREST. Pure; a bad value throws a 400 before any
 *  read. entity_type and actor match exactly; action_prefix → like.<p>* with LIKE's \ % _ escaped (PostgREST turns
 *  every * into %, so a * cannot be matched literally and is refused); entity_id is a uuid or a comma list (→ in.());
 *  since / until → at=gte. / at=lt.; limit defaults to 200 and is clamped to 1000; offset ≥ 0. A blank value is no
 *  filter; other keys are ignored. */
export function auditQuery(f = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const has = (k) => f[k] !== undefined && f[k] !== null && String(f[k]).trim() !== "";
  const val = (k) => String(f[k]).trim();
  let filter = "";
  if (has("entity_type")) filter += `&entity_type=eq.${encodeURIComponent(val("entity_type"))}`;
  if (has("action_prefix")) {
    const p = String(f.action_prefix);
    if (p.includes("*")) throw bad("action_prefix cannot contain * (PostgREST reads every * as a wildcard)");
    filter += `&action=like.${encodeURIComponent(p.replace(/[\\%_]/g, "\\$&"))}*`;
  }
  if (has("entity_id")) {
    const ids = val("entity_id").split(",").map((s) => s.trim());
    if (!ids.every(isUuid)) throw bad("entity_id must be a uuid or a comma list of uuids");
    filter += ids.length === 1 ? `&entity_id=eq.${ids[0]}` : `&entity_id=in.(${ids.join(",")})`;
  }
  if (has("actor")) filter += `&actor=eq.${encodeURIComponent(val("actor"))}`;
  for (const [k, op] of [["since", "gte"], ["until", "lt"]]) {
    if (!has(k)) continue;
    const t = Date.parse(val(k));
    if (Number.isNaN(t)) throw bad(`${k} must be a date or date-time`);
    filter += `&at=${op}.${encodeURIComponent(new Date(t).toISOString())}`;
  }
  const int = (k, dflt, min) => {
    if (!has(k)) return dflt;
    const n = Number(val(k));
    if (!Number.isInteger(n) || n < min) throw bad(`${k} must be an integer ≥ ${min}`);
    return n;
  };
  return { filter, limit: Math.min(int("limit", AUDIT_LIMIT, 1), AUDIT_MAX), offset: int("offset", 0, 0) };
}

/** The project's ledger rows, newest first, filtered and paged: { rows, total, limit, offset }. `total` is the exact
 *  count of rows matching the filter (not of the page), so a reader that got fewer rows than the total knows it. */
export async function listAudit(key, filters = {}) {
  const { filter, limit, offset } = auditQuery(filters);
  const proj = await ensureProject(key);
  const { data, total } = await sb(`audit_log?project_id=eq.${proj.id}${filter}&select=*&order=id.desc&limit=${limit}&offset=${offset}`, { count: true });
  return { rows: data, total, limit, offset };
}

export async function audit(project_id, entity_type, entity_id, action, actor, oldv, newv) {
  // audit_log has no authed-insert policy (writes bypass RLS by design) → force the service key.
  // A forwarded JWT's verified identity outranks any client-asserted actor (anti audit-trail poisoning, F3);
  // with no JWT (Revit/service path) we keep the supplied actor so the pilot is unaffected.
  // return=representation: the caller gets the row the ledger stored ({id, at, hash, …}), so a line can name
  // "ledger #id"; null when no row came back — never a made-up id. Callers that ignore the value are unchanged.
  const rows = await sb(`audit_log`, { method: "POST", body: { project_id, entity_type, entity_id, action, actor: resolveActor(actor), old_value: oldv, new_value: newv }, prefer: "return=representation", service: true });
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** Ledger rows Sentinel writes itself and then reads as fact (spec Decision 7): cde_transition's `state:` rows and
 *  recordVersionVerdict's `verdict:` stamps (the transition guard and ids.last_verdict read them), the stage gate
 *  (`gate:`, entity_type stage_gate) and ROI (`roi:`). The open audit route may not write them. */
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:"];

/** Record an audit event by project KEY (golden thread) — the DB trigger hash-chains it (tamper-evident). A reserved
 *  row (an action starting with one of RESERVED_ACTIONS, or entity_type stage_gate; case and surrounding spaces
 *  ignored) is a 400 before any read. */
export async function recordAudit(key, b) {
  const type = String(b.entity_type ?? "").trim().toLowerCase();
  const action = String(b.action ?? "").trim().toLowerCase();
  const reserved = type === "stage_gate" ? "stage_gate" : RESERVED_ACTIONS.find((p) => action.startsWith(p));
  if (reserved) { const e = new Error(`${reserved} rows are written by Sentinel, not through this route`); e.status = 400; throw e; }
  const proj = await ensureProject(key);
  return (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id,
      entity_type: b.entity_type || "event",
      entity_id: b.entity_id ?? null,
      action: b.action || "recorded",
      // Same anti-poisoning rule as audit(): a signed-in caller's verified identity outranks the claim.
      // This route (POST /cde/:key/audit) previously wrote the claim raw — the one audit_log sink that did.
      actor: resolveActor(b.actor),
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
      uploaded_by: resolveActor(b.uploaded_by),
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

/**
 * The per-revision delta: what changed between two take-offs, priced and carbon-costed.
 *
 * Defaults to the two newest revisions, which is the "what did this publish just do" question.
 * Returns a `not_comparable` answer rather than a zero when there is only one revision — a single
 * baseline has nothing to be different from, and reporting "no change" would be a fabricated pass.
 */
export async function revisionDelta(key, { from, to } = {}) {
  const revs = await listRevisions(key);
  const byId = new Map((revs || []).map((r) => [r.id, r]));
  const newer = to ? byId.get(to) : revs?.[0];
  const older = from ? byId.get(from) : revs?.[1];
  if (!newer || !older) {
    return {
      comparable: false,
      reason: !revs?.length
        ? "This project has no take-off revisions yet, so there is nothing to compare."
        : revs.length === 1
          ? "Only one revision exists — a baseline has nothing to be different from."
          : "One of the requested revisions does not belong to this project.",
      revisions: (revs || []).slice(0, 10),
    };
  }

  const [oldRows, newRows, c] = await Promise.all([getRevisionSnapshots(older.id), getRevisionSnapshots(newer.id), core()]);
  const toSnap = (r) => {
    const quantities = {};
    for (const m of ["count", "length", "area", "volume", "weight"]) if (r[m] != null) quantities[m] = Number(r[m]);
    return { guid: r.guid, category: r.category, type_name: r.type_name, quantities };
  };
  const diff = c.diffSnapshots(oldRows.map(toSnap), newRows.map(toSnap));
  const summary = c.summarizeDiff(diff);
  const rates = c.defaultRates, factors = c.defaultFactors;
  const cost = c.costDiff(diff, rates);
  const carbon = c.carbonDiff(diff, factors);
  const { deltaHeadline } = await import("./revision-delta.mjs");
  return {
    comparable: true,
    from: { id: older.id, rev_code: older.rev_code, uploaded_at: older.uploaded_at, element_count: older.element_count },
    to: { id: newer.id, rev_code: newer.rev_code, uploaded_at: newer.uploaded_at, element_count: newer.element_count },
    summary, cost, carbon,
    ...deltaHeadline(summary, cost, carbon, {
      currency: rates?.currency ?? null,
      rates: rates?.title || "bridge default rate table",
      carbon_factors: factors?.source || "bridge default carbon factors",
    }),
  };
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

/** The one sentence every naming judge gives when nothing is installed — the install route included. */
export const NO_NAMING_REASON = "no naming standard installed for this project or its office (PUT /cde/:key/artefacts/naming)";

/**
 * The naming ruleset a PROJECT is governed by: its `naming` artefact, else its office's, else none.
 * There is no bridge default and no env-var file (cohesion phase 3): `none` is an answer the judges
 * report as not_checkable, never a pilot's pack. `ref`/`sha256` say exactly which version judged.
 * Errors propagate — a resolver failure is an `error`, not a silent "none" (runCheck reports it).
 */
export async function projectNamingRuleset(key, deps = {}) {
  const resolveArtefact = deps.resolveArtefact || (await import("./artefact-store.mjs")).resolveArtefact;
  const r = await resolveArtefact(key, "naming");
  return { ruleset: r.body ?? null, source: r.source, ref: r.ref, sha256: r.sha256 };
}

/**
 * One ledger entry, by id, scoped to the project — the backing read for a receipt check.
 * Returns null rather than throwing: "no such entry" is an answer a verifier needs to hear.
 */
export async function getAuditEntry(key, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0) return null;
  const proj = await ensureProject(key);
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&id=eq.${n}&select=*`);
  return (Array.isArray(rows) ? rows[0] : rows) ?? null;
}

/** The row an anonymous receipt check names (cohesion phase 4c), or null. Service key only, whatever
 *  Authorization the caller sent; never ensureProject — no "default" self-heal, no key-specific 404 or 403.
 *  An unknown key still costs the second read (against the nil uuid), so it takes as long as an unknown id. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export async function publicAuditRow(key, id) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const proj = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=id`, { service: true });
  const pid = Array.isArray(proj) && proj[0]?.id ? proj[0].id : NIL_UUID;
  const rows = await sb(`audit_log?id=eq.${id}&project_id=eq.${pid}&select=id,at,hash,new_value`, { service: true });
  return (Array.isArray(rows) ? rows[0] : null) ?? null;
}

/** Re-derive the receipt for a recorded adjudication straight from the ledger. */
export async function receiptFor(key, id) {
  const row = await getAuditEntry(key, id);
  return row ? buildReceipt(row, { project_key: key }) : null;
}

/** Check a receipt a client is holding against the ledger entry it names. */
export async function checkReceipt(key, receipt) {
  const row = receipt && receipt.audit_id !== undefined ? await getAuditEntry(key, receipt.audit_id) : null;
  return verifyReceipt(receipt, row);
}

/** The failure list a caller gets back, with honest totals. Unfiltered: the first 200 of everything.
 *  With `requirement` (fix-in-place checks one requirement at a time): only that requirement's failures,
 *  up to 1000. `failures_total` / `failures_matched` are the counts BEFORE slicing, so a client can tell
 *  "no failure came back" from "the list was cut off" without guessing at the cap. Pure. */
export function selectFailures(failures, requirement) {
  const all = Array.isArray(failures) ? failures : [];
  const filtered = typeof requirement === "string" && requirement.trim()
    ? all.filter((f) => String(f?.requirement ?? "").toLowerCase() === requirement.trim().toLowerCase())
    : null;
  const chosen = filtered ?? all;
  const cap = filtered ? 1000 : 200;
  return { failures: chosen.slice(0, cap), failures_total: all.length, failures_matched: chosen.length };
}

/** Judge a container name by a naming ruleset; null when none is in force or it is off. A missing
 *  enforce is reject (plan constraint) and the result records the enforce actually applied. */
export function judgeContainerName(validate, name, rs) {
  const enforce = rs?.enforce ?? "reject";
  if (!rs || enforce === "off") return null;
  return { ...validate(name, rs), enforce };
}

/** POST /cde/:key/propose's `register` (cohesion phase 5a, spec 2026-09-26 Decision 3), or null when absent. The name
 *  registered is the name the naming standard judged, so it must equal container_name; size_bytes and sha256 tie the
 *  version to the file that was judged. Pure: a bad body is a 400 before any read or ledger row. */
function readRegister(b) {
  if (b.register === undefined || b.register === null) return null;
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const r = b.register;
  if (typeof r !== "object" || Array.isArray(r)) throw bad("register must be {name, size_bytes, sha256}");
  if (b.version_id) throw bad("pass version_id (stamp an existing version) or register (register a new one), not both");
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) throw bad("register.name is required");
  if (name !== b.container_name) throw bad("register.name must equal container_name — the name the naming standard judges is the name registered");
  if (!Number.isSafeInteger(r.size_bytes) || r.size_bytes < 0) throw bad("register.size_bytes must be a whole number of bytes");
  if (typeof r.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(r.sha256)) throw bad("register.sha256 must be 64 hex characters");
  return { name, size_bytes: r.size_bytes, sha256: r.sha256.toLowerCase() };
}

/** Adjudicate a proposal (POST /cde/:key/propose, intake, the AI tools, MCP, changesets): validate `elements` (the
 *  ElementProperties shape) against the IDS — the project's installed artefact → the office's → the caller's `ids` →
 *  none, named in ids_source / ids_ref — and the container name against the naming standard, write one proposal row,
 *  and return { verdict, downgraded, summary, failures, naming, ids_*, audit_id, version, verdict_audit_id,
 *  verdict_hash, receipt } (verdict_hash: the verdict row's own chain hash, so Revit can print its receipt; null when
 *  nothing was stamped).
 *  No IDS → "recorded"; accepted with nothing in scope → "recorded", downgraded "nothing in scope". `version_id` stamps
 *  the key's own version (another's is a 400); `register` registers a wip version on accepted or recorded and stamps
 *  it (readRegister). A stamp is what publishing reads (migration 0031), so an IDS or a naming ruleset the caller sent
 *  together with version_id or register is a 400: only what is installed on the project or its office stamps. Every
 *  400 comes before any ledger row. */
export async function adjudicateProposal(key, b = {}) {
  const reg = readRegister(b);
  // The naming twin of the client-IDS rule below: a caller's own ruleset (even {fields: [], enforce: "off"}) may judge
  // a plain proposal, never the name a stamped or registered version carries. Pure, so before any read.
  if (b.naming != null && (b.version_id || reg)) {
    throw Object.assign(new Error(`a version's name is judged only by the naming standard installed on ${key} or its office — send no naming ruleset, or propose without version_id/register`), { status: 400 });
  }
  const proj = await ensureProject(key);
  // A verdict is stamped only on a version of the project that judged it (spec Decision 4): another project's version,
  // an unknown id and a malformed one are the same 400, before any ledger row (versionOnKey, Task 1).
  if (b.version_id) await versionOnKey(key, b.version_id);
  const c = await core();
  const elements = Array.isArray(b.elements) ? b.elements : [];
  const { resolveIdsSpec } = await import("./artefact-store.mjs");
  const resolved = await resolveIdsSpec(key, b);
  const spec = resolved.spec, idsSource = resolved.source, clientIdsIgnored = resolved.client_ids_ignored;
  // An IDS the caller sent may judge a plain proposal, but its verdict never lands on a version (controller amendment,
  // 5a): a stamp is what publishing reads, so only the project's or office's installed IDS may make one. Refused
  // before any ledger row, registration or stamp.
  if (idsSource === "client" && (b.version_id || reg)) {
    throw Object.assign(new Error(`a version is stamped only by the IDS installed on ${key} or its office — install one (Packs or Documents ▸ EIR ▸ Install on this project) or propose without version_id/register`), { status: 400 });
  }
  // Delegate to the pure, unit-tested referee core (same code the browser uses).
  const adj = c.adjudicate(spec, elements);
  const { summary, failures } = adj;
  let verdict = adj.verdict;

  // IDS enforcement: adjudicate is a pure validator; the ruleset's `enforce` decides whether element-check
  // failures block the publish. "reject" (default) → failures reject; "warn" → publish but keep the failures
  // as tracked warnings (still raised as BCF so the team sees them); "off" → ignore them entirely.
  const idsEnforce = (spec && typeof spec.enforce === "string") ? spec.enforce : "reject";
  let warned = false;
  if (verdict === "rejected" && idsEnforce !== "reject") {
    verdict = "accepted";
    warned = idsEnforce === "warn" && failures.length > 0;
  }

  // Naming gate: if the caller supplies the container/file name, validate it against the (swappable) naming
  // ruleset and fold the result into the verdict per the ruleset's enforcement level. `reject` → a bad name
  // fails the whole publish (even if the IDS passed); `warn` → recorded but doesn't block; `off`/absent → skip.
  let naming = null, namingProv = { naming_ref: null };
  if (b.container_name) {
    // The project's naming artefact (project → office) governs the name — the same source naming.containers
    // reads. A client-sent ruleset is still honoured (it is the model's own name check) and recorded as
    // "client". Nothing installed → the name is not judged and the verdict row says so (naming_ref null).
    const client = b.naming && typeof b.naming === "object" && Array.isArray(b.naming.fields);
    const named = client ? { ruleset: b.naming, source: "client", ref: "client", sha256: null } : await projectNamingRuleset(key);
    namingProv = { naming_ref: named.ref ?? null, naming_source: named.source, naming_sha256: named.sha256 ?? null, ...(named.ruleset ? {} : { naming_reason: NO_NAMING_REASON }) };
    const rs = named.ruleset;
    naming = judgeContainerName(c.validateContainerName, b.container_name, rs);
    if (naming && !naming.ok && naming.enforce === "reject") verdict = "rejected";
  }

  // Nothing in scope is recorded (spec Decision 4), decided here once for every caller — /propose, intake, the AI
  // tools, MCP, changesets: an installed IDS that found no element in its scope measured nothing, so it is never
  // "accepted". Decided before the proposal row and any stamp; the row and the reply say why.
  const downgraded = verdict === "accepted" && summary.in_scope === 0 ? "nothing in scope" : null;
  if (downgraded) verdict = "recorded";
  // A forwarded JWT's verified identity outranks the client-asserted actor (anti audit-trail poisoning, F3);
  // no JWT (Revit/agent/service) falls back to the supplied value so the pilot is unaffected.
  const trustedActor = resolveActor(b.actor ?? b.source, "agent");
  // CLAIMED, never verified (see agent-provenance.mjs). Recorded so that "which model proposed this,
  // from which prompt" is answerable later — the question every AI-authored-BIM thread ends on.
  const agent = normalizeAgent(b.agent);
  const audit = (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id, entity_type: "proposal", entity_id: null,
      action: `Proposal ${verdict}${b.source ? " from " + b.source : ""}`,
      actor: trustedActor, old_value: null,
      new_value: { source: b.source ?? null, verdict, ...(downgraded ? { downgraded } : {}), summary, note: b.note ?? null, failures: failures.slice(0, 50), naming, ...namingProv, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, ...(agent ? { agent } : {}), ...(clientIdsIgnored ? { client_ids_ignored: true } : {}) },
    },
    prefer: "return=representation", service: true, // audit_log bypasses RLS by design
  }))[0];
  // The verdict on a file version (entity_id = version id, action "verdict:<verdict>"): the Versions panel's badge and
  // what the transition guard reads (migration 0031). `version_id` stamps an existing version of this project (checked
  // above). `register` (one adjudication per publish, spec Decision 3) registers the version on an accepted or recorded
  // verdict — always wip, never attached to another version's geometry — and stamps this same result on it: one
  // proposal row, one registration, one verdict row. A rejected verdict registers nothing. A failure here throws (a
  // 500, its message scrubbed): the proposal row stays on the ledger, and a version left without its stamp cannot be
  // published without a signed-in lead's reason.
  const judged = { verdict, summary, failures, naming, warned, agent, downgraded, ids_ref: resolved.ref, naming_ref: namingProv.naming_ref };
  let version = null, stamp = null;
  if (reg && verdict !== "rejected") {
    const r = await registerFileVersion(key, { ...reg, author: trustedActor, attach_geometry: false });
    version = { id: r.version.id, container_id: r.container_id, revision: r.version.revision, state: r.version.state };
    stamp = await recordVersionVerdict(key, version.id, judged, trustedActor);
  } else if (b.version_id) stamp = await recordVersionVerdict(key, b.version_id, judged, trustedActor);
  return {
    verdict, downgraded, summary, ...selectFailures(failures, b.failures_requirement), naming, ...namingProv, warned,
    ids_enforce: idsEnforce, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, client_ids_ignored: clientIdsIgnored,
    audit_id: audit?.id ?? null, recorded_at: audit?.at ?? null,
    version, verdict_audit_id: stamp?.id ?? null, verdict_hash: stamp?.hash ?? null,
    agent,
    // The shareable proof. Anchored on the audit row's own chain hash, so it is checkable against a
    // ledger that cannot be rewritten — see POST /receipt/:key/verify.
    receipt: buildReceipt(audit, { project_key: key }),
  };
}

/** Stamp a verdict on a specific file version so the Versions panel badges the row
 *  (entity_id = version id, action "verdict:<verdict>"). Separate from the proposal row on purpose. Returns the
 *  ledger row: its id is the verdict_audit_id /propose answers and the one the state: row names when the version is
 *  published (migration 0031). */
export async function recordVersionVerdict(key, version_id, r, actor) {
  const proj = await ensureProject(key);
  return (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id, entity_type: "file_version", entity_id: version_id,
      action: `verdict:${r.verdict}`, actor: resolveActor(actor, "web"), old_value: null,
      new_value: { ids: r.summary?.ids, summary: r.summary, failures: (r.failures || []).slice(0, 20), naming: r.naming ?? null, warned: !!r.warned, ids_ref: r.ids_ref ?? null, naming_ref: r.naming_ref ?? null, ...(r.downgraded ? { downgraded: r.downgraded } : {}), ...(r.agent ? { agent: r.agent } : {}) },
    },
    prefer: "return=representation", service: true,
  }))[0];
}

/** Latest governed verdict per version id (from the "verdict:<v>" rows recordVersionVerdict writes);
 *  null when a version was never judged — the Federation Gate treats that as not judged, never as a pass. */
export async function versionVerdicts(key, versionIds = []) {
  const out = {};
  for (const id of versionIds) out[id] = null;
  const ids = versionIds.filter(isUuid);
  if (!ids.length) return out;
  const proj = await ensureProject(key);
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&entity_type=eq.file_version&action=like.verdict:*&entity_id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,entity_id,action&order=id.desc`);
  for (const r of rows || []) if (out[r.entity_id] === null) out[r.entity_id] = String(r.action).replace(/^verdict:/, "");
  return out;
}

/** Every governed verdict row of a project, newest first: [{ id, version_id, verdict }]. One read answers both
 *  "any verdict yet" and "the latest verdict of each live version", with the audit id each one needs as
 *  evidence (the journey, Next strip spec §1 — versionVerdicts keeps only the verdict word). */
export async function listVersionVerdictRows(key) {
  const proj = await ensureProject(key);
  // ponytail: unbounded read of the verdict rows; filter by the live version ids if a project's verdict history grows large.
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&entity_type=eq.file_version&action=like.verdict:*&select=id,entity_id,action&order=id.desc`);
  return (rows || []).map((r) => ({ id: r.id, version_id: r.entity_id, verdict: String(r.action).replace(/^verdict:/, "") }));
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
export async function docUpsert(store, pid, docId, data, { service = false } = {}) {
  await sb(`bridge_docs?${DOC_CONFLICT}`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal", service });
  return data;
}
/** Compare-and-swap replace: overwrite the doc ONLY if its current data->>status equals
 *  `expectedStatus`. Returns the data on success, null when the condition lost (0 rows patched) —
 *  the caller re-reads and 409s. Closes the docGet→check→docUpsert race for status transitions. */
export async function docReplaceIfStatus(store, pid, docId, data, expectedStatus) {
  return docReplaceIfField(store, pid, docId, data, "status", expectedStatus);
}
/** Generic CAS replace: overwrite the doc ONLY if data->>field currently equals `expected`
 *  (pass null for "the key is absent" — legacy rows). Returns data on success, null when the
 *  condition lost. The concurrency primitive behind changeset transitions and comment appends. */
export async function docReplaceIfField(store, pid, docId, data, field, expected) {
  const cond = expected === null ? `data->>${enc(field)}=is.null` : `data->>${enc(field)}=eq.${enc(expected)}`;
  const rows = await sb(
    `bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&doc_id=eq.${enc(docId)}&${cond}`,
    { method: "PATCH", body: { data, updated_at: new Date().toISOString() }, prefer: "return=representation" },
  );
  return Array.isArray(rows) && rows.length ? data : null;
}
/** Create-only insert (no merge) → PostgREST 409 on PK conflict. Used for the crypto keystore so a concurrent
 *  first-setup can't clobber a DEK that already encrypted files. */
export async function docInsert(store, pid, docId, data, { service = false } = {}) {
  await sb(`bridge_docs`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data }, prefer: "return=minimal", service });
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
/** The canonical BCF topic shape. Every producer must go through this — the web Issues panel, the
 *  Revit BcfSyncManager and the governed fail→BCF hook all expect these exact fields, and `guid` is
 *  NOT NULL in the database. A caller that hand-rolls a partial object gets a 23502 at insert time.
 *  Lives here, beside bcfCreateTopic, so the AI tool registry and the HTTP routes share one definition. */
export function newTopicObject(pid, b = {}, now = new Date().toISOString()) {
  // Server-assigned authorship, as the BCF-API spec intends: a signed-in caller's verified identity
  // outranks the claimed creation_author; machine callers (BCF_TOKEN — the Revit pilot, Governed
  // Publish) keep their self-label.
  const author = resolveActor(b.creation_author, "web");
  return {
    guid: b.guid || randomUUID(), project_id: pid, model: b.model || "",
    title: b.title || "Untitled", topic_type: b.topic_type || "Issue",
    topic_status: b.topic_status || "Open", priority: b.priority || "Normal",
    assigned_to: b.assigned_to || "", due_date: b.due_date || null,
    stage: b.stage || "", description: b.description || "",
    creation_author: author, creation_date: now, modified_date: now,
    labels: b.labels || [], comments: [], viewpoints: [],
    history: [{ date: now, author, action: "Created" }],
  };
}

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
