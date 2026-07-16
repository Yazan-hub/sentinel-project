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

export async function listContainers(key) {
  const proj = await ensureProject(key);
  return sb(`information_containers?project_id=eq.${proj.id}&select=*,container_versions(*)&order=created_at.desc`);
}

export async function createContainer(key, b) {
  const proj = await ensureProject(key);
  const c = (await sb(`information_containers`, {
    method: "POST",
    body: { project_id: proj.id, iso_name: b.iso_name, title: b.title, discipline: b.discipline, container_type: b.container_type || "model" },
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
