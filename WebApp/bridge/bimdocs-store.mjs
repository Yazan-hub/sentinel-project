// BIM Documents store — Supabase-backed structured documents (BEP/EIR) for the bridge.
// Thin PostgREST wrapper in the exact idiom of cde-store.mjs: state machine + append-only versions
// enforced here + in the DB (0020); every write audited into the project's hash-chained trail.
import { sb, ensureProject, audit } from "./cde-store.mjs";
import { loadTemplates, instantiateTemplate, validateTransition, buildSnapshot } from "./bimdocs-logic.mjs";

const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);
const err = (status, message) => Object.assign(new Error(message), { status });

export const listTemplates = () =>
  loadTemplates().map((t) => ({ doc_type: t.doc_type, title: t.title, sections: t.sections.length }));

export async function listDocs(key) {
  const proj = await ensureProject(key);
  const docs = await sb(`bim_documents?project_id=eq.${proj.id}&order=updated_at.desc&select=id,doc_type,title,status,updated_at,bim_document_versions(count)`);
  return docs.map((d) => ({ ...d, version_count: d.bim_document_versions?.[0]?.count ?? 0, bim_document_versions: undefined }));
}

export async function createDoc(key, { doc_type, title, actor } = {}) {
  const proj = await ensureProject(key);
  const tpl = loadTemplates().find((t) => t.doc_type === doc_type);
  if (!tpl) throw err(400, `unknown doc_type '${doc_type}'`);
  const body = { ...instantiateTemplate(tpl, { title, actor }), project_id: proj.id };
  const row = one(await sb("bim_documents", { method: "POST", body, prefer: "return=representation" }));
  await audit(proj.id, "bim_document", row.id, "created", actor || "web", null, { doc_type: row.doc_type, title: row.title });
  return row;
}

export async function getDoc(key, docId) {
  const proj = await ensureProject(key);
  const row = one(await sb(`bim_documents?id=eq.${docId}&project_id=eq.${proj.id}`));
  if (!row) throw err(404, "document not found");
  return row;
}

export async function patchSection(key, docId, sectionId, { body, owner, state, updated_at, actor } = {}) {
  const doc = await getDoc(key, docId);
  if (doc.status === "published" || doc.status === "archived") throw err(409, `document is ${doc.status}; revert to wip to edit`);
  if (updated_at && doc.updated_at !== updated_at) throw err(409, "stale write: document changed since you loaded it");
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  if (state && state !== old.state && !validateTransition(old.state, state)) throw err(400, `invalid section transition ${old.state} → ${state}`);
  const next = { ...old, ...(body !== undefined && { body }), ...(owner !== undefined && { owner }), ...(state !== undefined && { state }) };
  const sections = doc.sections.map((s, j) => (j === i ? next : s));
  const row = one(await sb(`bim_documents?id=eq.${docId}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "section_updated", actor || "web",
    { section: old.heading, state: old.state }, { section: next.heading, state: next.state });
  return row;
}

export async function transitionDoc(key, docId, { to, actor } = {}) {
  const doc = await getDoc(key, docId);
  if (!validateTransition(doc.status, to)) throw err(400, `invalid transition ${doc.status} → ${to}`);
  const row = one(await sb(`bim_documents?id=eq.${docId}`, { method: "PATCH", body: { status: to, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "transitioned", actor || "web", { status: doc.status }, { status: to });
  return row;
}

export async function publishDoc(key, docId, { label, actor } = {}) {
  const doc = await getDoc(key, docId);
  if (doc.status !== "shared") throw err(400, `only shared documents can be published (current: ${doc.status})`);
  const versions = await sb(`bim_document_versions?document_id=eq.${docId}&select=version_no&order=version_no.desc&limit=1`);
  const version_no = (one(versions)?.version_no || 0) + 1;
  await sb("bim_document_versions", { method: "POST", body: buildSnapshot(doc, label || `v${version_no}`, actor || "web", version_no) });
  await sb(`bim_documents?id=eq.${docId}`, { method: "PATCH", body: { status: "published", updated_at: new Date().toISOString() } });
  await audit(doc.project_id, "bim_document", docId, "published", actor || "web", null, { version_no, label: label || `v${version_no}` });
  return { version_no };
}

export async function listVersions(key, docId) {
  await getDoc(key, docId); // membership/existence gate
  return sb(`bim_document_versions?document_id=eq.${docId}&select=id,version_no,label,published_by,published_at&order=version_no.desc`);
}

export async function getVersion(key, docId, n) {
  await getDoc(key, docId);
  const row = one(await sb(`bim_document_versions?document_id=eq.${docId}&version_no=eq.${n}`));
  if (!row) throw err(404, "version not found");
  return row;
}
