// Sentinel CDE store — Supabase-backed ISO 19650 information-container access for the bridge (C3).
// Zero-dep: talks to Supabase PostgREST + RPC over fetch with the SERVICE key (server-side only, never
// the browser). The state machine, published-immutability, and hash-chained audit all live in the DB
// (migrations 0001/0002) — this module is a thin REST wrapper the web app's CDE panel calls via the bridge.
//
// Config (config/.env, never committed):
//   SUPABASE_URL=https://<ref>.supabase.co
//   SUPABASE_SERVICE_KEY=<service_role secret from Supabase → Project Settings → API>

import { loadEnv } from "./thatopen-client.mjs";

const env = { ...process.env, ...loadEnv() }; // config/.env is authoritative
const URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_KEY || "";

export const cdeConfigured = () => !!(URL && KEY);

async function sb(path, { method = "GET", body, prefer } = {}) {
  if (!cdeConfigured()) throw new Error("CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

/** Map the platform projectId (string key) to a CDE project row, creating it on first use. */
export async function ensureProject(key) {
  const found = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`);
  if (found?.length) return found[0];
  const created = await sb(`projects`, { method: "POST", body: { key, name: key }, prefer: "return=representation" });
  return created[0];
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

/** Run the DB state machine (validates the transition, writes the audit row, enforces immutability). */
export async function transition(version_id, new_state, actor, note) {
  return sb(`rpc/cde_transition`, { method: "POST", body: { p_version: version_id, p_new_state: new_state, p_actor: actor, p_note: note } });
}

export async function listAudit(key) {
  const proj = await ensureProject(key);
  return sb(`audit_log?project_id=eq.${proj.id}&select=*&order=id.desc&limit=200`);
}

export async function audit(project_id, entity_type, entity_id, action, actor, oldv, newv) {
  return sb(`audit_log`, { method: "POST", body: { project_id, entity_type, entity_id, action, actor, old_value: oldv, new_value: newv } });
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
export async function createRevision(key, b = {}) {
  const proj = await ensureProject(key);
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
      container_version_id: b.container_version_id || null,
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
