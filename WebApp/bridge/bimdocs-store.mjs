// BIM Documents store — Supabase-backed structured documents (BEP/EIR) for the bridge.
// Thin PostgREST wrapper in the exact idiom of cde-store.mjs: state machine + append-only versions
// enforced here + in the DB (0020); every write audited into the project's hash-chained trail.
import { createHash, randomUUID } from "node:crypto";
import { sb, ensureProject, audit } from "./cde-store.mjs";
import { loadTemplates, instantiateTemplate, validateTransition, buildSnapshot } from "./bimdocs-logic.mjs";

const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);
const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;
const h8 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 8);

export const listTemplates = () =>
  loadTemplates().map((t) => ({ doc_type: t.doc_type, title: t.title, sections: t.sections.length }));

export async function listDocs(key) {
  const proj = await ensureProject(key);
  const docs = await sb(`bim_documents?project_id=eq.${enc(proj.id)}&order=updated_at.desc&select=id,doc_type,title,status,updated_at,bim_document_versions(count)`);
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
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}&project_id=eq.${enc(proj.id)}`));
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
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "section_updated", actor || "web",
    { section: old.heading, state: old.state, owner: old.owner, body_chars: old.body.length, body_sha8: h8(old.body) },
    { section: next.heading, state: next.state, owner: next.owner, body_chars: next.body.length, body_sha8: h8(next.body) });
  return row;
}

export async function transitionDoc(key, docId, { to, actor } = {}) {
  const doc = await getDoc(key, docId);
  if (!validateTransition(doc.status, to)) throw err(400, `invalid transition ${doc.status} → ${to}`);
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { status: to, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "transitioned", actor || "web", { status: doc.status }, { status: to });
  return row;
}

export async function publishDoc(key, docId, { label, actor } = {}) {
  const doc = await getDoc(key, docId);
  if (doc.status !== "shared") throw err(400, `only shared documents can be published (current: ${doc.status})`);
  const versions = await sb(`bim_document_versions?document_id=eq.${enc(docId)}&select=version_no&order=version_no.desc&limit=1`);
  const version_no = (one(versions)?.version_no || 0) + 1;
  await sb("bim_document_versions", { method: "POST", body: buildSnapshot(doc, label || `v${version_no}`, actor || "web", version_no) });
  await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { status: "published", updated_at: new Date().toISOString() } });
  await audit(doc.project_id, "bim_document", docId, "published", actor || "web", null, { version_no, label: label || `v${version_no}` });
  return { version_no };
}

export async function listVersions(key, docId) {
  await getDoc(key, docId); // membership/existence gate
  return sb(`bim_document_versions?document_id=eq.${enc(docId)}&select=id,version_no,label,published_by,published_at&order=version_no.desc`);
}

export async function getVersion(key, docId, n) {
  await getDoc(key, docId);
  const row = one(await sb(`bim_document_versions?document_id=eq.${enc(docId)}&version_no=eq.${enc(n)}`));
  if (!row) throw err(404, "version not found");
  return row;
}

/**
 * Create a document with sections already populated — the ingestion commit. Phase 1's createDoc only
 * instantiates an EMPTY template, and a create-then-N×patchSection loop would spray N audit rows and
 * N stale-write round-trips for what is a single user action. One insert, one audit row.
 * `sections` is [{heading, guidance, body}]; ids and the frozen section shape are assigned here.
 */
const SOURCE_KEYS = ["file_id", "name", "kind", "pages", "ingested_at"];

/** Validate+normalize the [{heading, guidance, body}] ingestion payload. Throws err(400, ...) naming the bad index. */
export function validateSections(sections) {
  if (!Array.isArray(sections) || !sections.length) throw err(400, "sections are required");
  return sections.map((s, i) => {
    if (typeof s !== "object" || s === null || Array.isArray(s)) throw err(400, `sections[${i}] must be an object`);
    if (!s.heading) throw err(400, `sections[${i}].heading is required`);
    return {
      id: randomUUID(),
      heading: s.heading,
      guidance: s.guidance || "",
      body: s.body || "",
      state: "wip",
      owner: null,
      bindings: {}, // reserved for sub-project 3 — never populated by ingestion
    };
  });
}

/** Validate+strip the source descriptor to the documented shape (0021_bim_documents_source.sql), or null. */
export function normalizeSource(source) {
  if (source === undefined || source === null) return null;
  if (typeof source !== "object" || Array.isArray(source)) throw err(400, "source must be an object");
  const out = {};
  for (const key of SOURCE_KEYS) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

export async function createDocFromIngest(key, { doc_type, title, sections, source, actor } = {}) {
  if (!doc_type) throw err(400, "doc_type is required");
  const normalizedSections = validateSections(sections);
  const normalizedSource = normalizeSource(source);
  const proj = await ensureProject(key);
  const body = {
    project_id: proj.id,
    doc_type,
    title: title || `Ingested ${doc_type}`,
    status: "wip",
    created_by: actor || "web",
    source: normalizedSource,
    sections: normalizedSections,
  };
  const row = one(await sb("bim_documents", { method: "POST", body, prefer: "return=representation" }));
  await audit(proj.id, "bim_document", row.id, "ingested", actor || "web", null, {
    doc_type: row.doc_type,
    title: row.title,
    source_file: source?.name || null,
    sections_populated: body.sections.filter((s) => s.body.trim()).length,
    sections_total: body.sections.length,
  });
  return row;
}

/** The original uploaded file's descriptor for a document, or null when hand-authored. */
export async function getSourceRef(key, docId) {
  const doc = await getDoc(key, docId);
  return doc.source || null;
}
