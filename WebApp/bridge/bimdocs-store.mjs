// BIM Documents store — Supabase-backed structured documents (BEP/EIR) for the bridge.
// Thin PostgREST wrapper in the exact idiom of cde-store.mjs: state machine + append-only versions
// enforced here + in the DB (0020); every write audited into the project's hash-chained trail.
import { createHash, randomUUID } from "node:crypto";
import { sb, ensureProject, audit } from "./cde-store.mjs";
import { loadTemplates, instantiateTemplate, validateTransition, buildSnapshot } from "./bimdocs-logic.mjs";
import { getCheck, runCheck, PLANNED_CHECKS } from "./check-registry.mjs";

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
  const tpl = loadTemplates().find((t) => t.doc_type === doc_type);
  if (!tpl) throw err(400, `unknown doc_type '${doc_type}'`);
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

const PLANNED_BINDABLE = new Set(PLANNED_CHECKS.map((p) => p.id));

/**
 * Validate and normalise a section's bindings. The ONLY accepted shape is {checks:[{id, params?}]};
 * `{}` (or omitted) means unbound. A planned (not-yet-implemented) check id is deliberately bindable —
 * the section then reports "not checkable" with the reason, which is an honest statement of coverage.
 */
export function validateBindings(bindings) {
  if (bindings === undefined) return { checks: [] };
  if (typeof bindings !== "object" || bindings === null || Array.isArray(bindings)) throw err(400, "bindings must be an object shaped {checks:[{id, params?}]}");
  const raw = bindings.checks;
  if (raw === undefined) return { checks: [] };
  if (!Array.isArray(raw)) throw err(400, "bindings.checks must be an array");
  const checks = raw.map((c, i) => {
    if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.id !== "string" || !c.id)
      throw err(400, `bindings.checks[${i}] must be an object with a string id`);
    if (!getCheck(c.id) && !PLANNED_BINDABLE.has(c.id))
      throw err(400, `unknown check id '${c.id}'`);
    if (c.params !== undefined && (typeof c.params !== "object" || c.params === null || Array.isArray(c.params)))
      throw err(400, `bindings.checks[${i}].params must be an object`);
    return { id: c.id, params: c.params || {} };
  });
  return { checks };
}

/** Persist one section's bindings. Same guards as patchSection: no editing a published/archived doc. */
export async function setSectionBindings(key, docId, sectionId, payload = {}) {
  const { bindings, updated_at, actor } = payload;
  // A missing `bindings` key used to fall through validateBindings' undefined-default and silently
  // WIPE the section's bindings to empty with a 200. A PUT to this route must say what it means:
  // {bindings:{checks:[...]}} to set, {bindings:{checks:[]}} to clear explicitly.
  if (bindings === undefined)
    throw err(400, payload.checks !== undefined
      ? "missing the 'bindings' wrapper — send {bindings:{checks:[...]}}, not {checks:[...]}"
      : "bindings is required — {bindings:{checks:[{id, params?}]}}; send {bindings:{checks:[]}} to clear");
  const next = validateBindings(bindings); // validate BEFORE any network call
  const doc = await getDoc(key, docId);
  if (doc.status === "published" || doc.status === "archived") throw err(409, `document is ${doc.status}; revert to wip to edit`);
  if (updated_at && doc.updated_at !== updated_at) throw err(409, "stale write: document changed since you loaded it");
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  const sections = doc.sections.map((s, j) => (j === i ? { ...s, bindings: next } : s));
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}`, { method: "PATCH", body: { sections, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(doc.project_id, "bim_document", docId, "section_bindings_set", actor || "web",
    { section: old.heading, checks: (old.bindings?.checks || []).map((c) => c.id) },
    { section: old.heading, checks: next.checks.map((c) => c.id) });
  return row;
}

/** Cap on bound checks evaluated per compliance run — bounds a doc's latency to O(cap), not O(bindings). */
export const MAX_COMPLIANCE_CHECKS = 100;

/**
 * Evaluate every bound check on a document against live project state. READ-ONLY: no writes, no audit
 * row — a compliance view is a read model, not an event. Unbound sections appear with an empty
 * results list so the UI can show honest coverage (how much of the document is actually wired).
 * Total checks evaluated across the whole document is capped at MAX_COMPLIANCE_CHECKS; anything beyond
 * that is reported as not_checkable naming the cap, never silently dropped (honesty over truncation).
 */
export async function complianceReport(key, docId) {
  const doc = await getDoc(key, docId);
  const sections = [];
  const summary = { sections: doc.sections.length, bound: 0, met: 0, violations: 0, not_checkable: 0, error: 0 };
  let evaluated = 0;
  for (const s of doc.sections) {
    const bound = s.bindings?.checks || [];
    if (bound.length) summary.bound += 1;
    const results = [];
    for (const b of bound) {
      const r = evaluated < MAX_COMPLIANCE_CHECKS
        ? (evaluated += 1, await runCheck(b.id, key, b.params || {}))
        : { id: b.id, label: b.id, status: "not_checkable", count: 0, summary: "", evidence: [],
            reason: `Not evaluated: this document exceeds the ${MAX_COMPLIANCE_CHECKS}-check limit for a single compliance run.` };
      summary[r.status] = (summary[r.status] || 0) + 1;
      results.push(r);
    }
    sections.push({ section_id: s.id, heading: s.heading, results });
  }
  return { document_id: doc.id, title: doc.title, doc_type: doc.doc_type, generated_at: new Date().toISOString(), summary, sections };
}
