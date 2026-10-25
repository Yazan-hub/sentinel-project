// BIM Documents store — Supabase-backed structured documents (BEP/EIR) for the bridge.
// Thin PostgREST wrapper in the exact idiom of cde-store.mjs: state machine + append-only versions
// enforced here + in the DB (0020); every write audited into the project's hash-chained trail.
import { createHash, randomUUID } from "node:crypto";
import { sb, ensureProject, audit, isUuid, docGet, docInsert, docReplaceIfField } from "./cde-store.mjs";
import { loadTemplates, instantiateTemplate, validateTransition, validateDocTransition, buildSnapshot, maskVersion } from "./bimdocs-logic.mjs";
import { CHECKS, getCheck, runCheck, PLANNED_CHECKS } from "./check-registry.mjs";
import { requireDocAccess } from "./doc-access.mjs";
import { blocksOf, applyOldPanelBody, textBlock, validateBlock, emptyData, deriveBody, LIMITS } from "./doc-blocks.mjs";
import { resolveActor } from "./bridge-auth.mjs";
import { executability } from "./executability.mjs";
import { readiness, readinessPlan, ANSWERS } from "./readiness-logic.mjs";
import { getSnapshot, getScan } from "./office-store.mjs";

const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);
const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;
const h8 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 8);
/** A section body's size and short hash for its ledger row. It never throws, whatever was stored. */
const bodyFacts = (body) => {
  const text = typeof body === "string" ? body : body == null ? "" : (JSON.stringify(body) ?? "");
  return { body_chars: text.length, body_sha8: h8(text) };
};
/** The check ids of stored bindings, for a ledger row or a question: never throws, whatever was stored. */
const checkIds = (bindings) => (Array.isArray(bindings?.checks) ? bindings.checks.map((c) => (c && typeof c === "object" ? c.id ?? null : null)) : []);
const TOO_LARGE = "This document is too large to save (over 8 million characters); move some content to another document. Nothing was saved.";
const tooLarge = (sections) => JSON.stringify(sections).length > LIMITS.docChars;
// bim_documents has no signed-in UPDATE (0038): every document write below runs after this file's own role check and goes with
// the service key, filtered on the document as it was read. A write that came back with no row is a 409 in words, BEFORE its
// ledger row (H0 D5).
/** 0038: a document write — after the caller's role check, with the service key — lands only on the document as it was read:
 *  its own project plus `where` (its status, its updated_at). An edit, a transition or a publish that landed between the read
 *  and this write leaves no row: a 409 in words. */
async function writeDoc(doc, body, where) {
  const rows = await sb(`bim_documents?id=eq.${enc(doc.id)}&project_id=eq.${enc(doc.project_id)}${where}`,
    { method: "PATCH", body: { ...body, updated_at: new Date().toISOString() }, prefer: "return=representation", service: true });
  if (!Array.isArray(rows) || !rows.length) throw err(409, "the document changed or was issued meanwhile — nothing was saved");
  return rows[0];
}
/** A section write: the document still wip or shared and unchanged since it was read — always, whether or not the caller sent an updated_at.
 *  A write that takes the document over LIMITS.docChars characters AND grows it is refused before the write; one that keeps or
 *  shrinks its size always saves, so a document stored over the cap can still be reduced. */
function patchSections(doc, sections) {
  const size = JSON.stringify(sections).length;
  if (size > LIMITS.docChars && size > JSON.stringify(doc.sections).length) throw err(422, TOO_LARGE);
  return writeDoc(doc, { sections }, `&status=in.(wip,shared)&updated_at=eq.${enc(doc.updated_at)}`);
}
/** A status write: the document in the status and at the updated_at it was read with. */
const writeStatus = (doc, status) => writeDoc(doc, { status }, `&status=eq.${enc(doc.status)}&updated_at=eq.${enc(doc.updated_at)}`);

export const listTemplates = () =>
  loadTemplates().map((t) => ({ doc_type: t.doc_type, title: t.title, sections: t.sections.length }));

/** The start of every section write: read the document (a non-member gets the 404 here), ask for `level` on it, refuse a
 *  published or archived one, and refuse a write based on a stale copy (when the caller sent the updated_at it loaded). */
async function openForWrite(key, docId, level, updated_at) {
  const doc = await getDoc(key, docId);
  await requireDocAccess(key, doc, level);
  if (doc.status === "published" || doc.status === "archived") throw err(409, `document is ${doc.status}; revert to wip to edit`);
  if (updated_at && doc.updated_at !== updated_at) throw err(409, "stale write: document changed since you loaded it");
  return doc;
}

export async function listDocs(key) {
  const proj = await ensureProject(key);
  const docs = await sb(`bim_documents?project_id=eq.${enc(proj.id)}&order=updated_at.desc&select=id,doc_type,title,status,updated_at,bim_document_versions(count)`, { service: true }); // ensureProject refused a non-member; 0049 limits direct version reads
  return docs.map((d) => ({ ...d, version_count: d.bim_document_versions?.[0]?.count ?? 0, bim_document_versions: undefined }));
}

/** A caller's title or file name, when given: text of at most LIMITS.titleChars characters, before any call. */
const checkText = (v, what) => {
  if (v != null && (typeof v !== "string" || v.length > LIMITS.titleChars)) throw err(400, `${what} must be text of at most ${LIMITS.titleChars} characters`);
};

export async function createDoc(key, { doc_type, title, actor } = {}) {
  checkText(title, "a document title");
  const proj = await ensureProject(key);
  await requireDocAccess(key, null, "edit");
  const tpl = loadTemplates().find((t) => t.doc_type === doc_type);
  if (!tpl) throw err(400, `unknown doc_type '${doc_type}'`);
  // created_by is the signed-in caller's verified identity, never the body's name (bimdocs-3); the machine credential keeps its label.
  const body = { ...instantiateTemplate(tpl, { title, actor: resolveActor(actor, "web") }), project_id: proj.id };
  if (tooLarge(body.sections)) throw err(422, TOO_LARGE);
  const row = one(await sb("bim_documents", { method: "POST", body, prefer: "return=representation" }));
  await audit(proj.id, "bim_document", row.id, "created", actor || "web", null, { doc_type: row.doc_type, title: row.title });
  return row;
}

export async function getDoc(key, docId) {
  // A non-UUID docId would make PostgREST throw a uuid-cast error (surfaced as a 500). It can never
  // match a row, so it is the same 404 as a miss — decided before any network call.
  if (!isUuid(docId)) throw err(404, "document not found");
  const proj = await ensureProject(key);
  const row = one(await sb(`bim_documents?id=eq.${enc(docId)}&project_id=eq.${enc(proj.id)}`));
  if (!row) throw err(404, "document not found");
  return row;
}

export async function patchSection(key, docId, sectionId, { body, owner, state, updated_at, actor } = {}) {
  const doc = await openForWrite(key, docId, "edit", updated_at); // H0 (D4, ledger-1): editing a section is a contributor's
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  if (state !== undefined && state !== old.state && !validateTransition(old.state, state)) throw err(400, `invalid section transition ${old.state} → ${state}`);
  // A section lead change is a lead's; an unchanged owner (the old panel sends it on every save) asks nothing more.
  if (owner !== undefined && owner !== (old.owner ?? null)) await requireDocAccess(key, doc, "govern");
  // The old panel only saves text-only sections: the body goes into the one text block, else a 422 and nothing is written.
  const text = body !== undefined && body !== old.body ? applyOldPanelBody({ ...old, blocks: blocksOf(old) }, body) : {};
  const next = { ...old, ...text, ...(owner !== undefined && { owner }), ...(state !== undefined && { state }) };
  const sections = doc.sections.map((s, j) => (j === i ? next : s));
  const facts = [{ section: old.heading, state: old.state, owner: old.owner, ...bodyFacts(old.body) },
    { section: next.heading, state: next.state, owner: next.owner, ...bodyFacts(next.body) }];
  const row = await patchSections(doc, sections);
  await audit(doc.project_id, "bim_document", docId, "section_updated", actor || "web", ...facts);
  return row;
}

export async function transitionDoc(key, docId, { to, actor } = {}) {
  const doc = await getDoc(key, docId);
  await requireDocAccess(key, doc, "govern"); // publish/transition/bindings govern the record — lead and above
  if (!validateDocTransition(doc.status, to)) throw err(400, `invalid transition ${doc.status} → ${to}`);
  const row = await writeStatus(doc, to);
  await audit(doc.project_id, "bim_document", docId, "transitioned", actor || "web", { status: doc.status }, { status: to });
  return row;
}

/** Shown when the database refuses the version copy (a value the jsonb copy cannot hold exactly). */
export const PUBLISH_COPY_REFUSED = "This document holds a value that cannot be copied exactly into a version (for example a number too large to store). Save the section that holds it once, then publish again. Nothing was saved.";

export async function publishDoc(key, docId, { label, actor } = {}) {
  const doc = await getDoc(key, docId);
  await requireDocAccess(key, doc, "govern"); // publish/transition/bindings govern the record — lead and above
  if (doc.status !== "shared") throw err(400, `only shared documents can be published (current: ${doc.status})`);
  const versions = await sb(`bim_document_versions?document_id=eq.${enc(docId)}&select=version_no&order=version_no.desc&limit=1`, { service: true });
  const version_no = (one(versions)?.version_no || 0) + 1;
  // The status first, on the document as it was read: a write that landed meanwhile leaves no row (a 409) and no version
  // is recorded. The append-only version is then the snapshot of exactly what was published; if it cannot be recorded,
  // the document goes back to shared and the error stands.
  const issued = await writeStatus(doc, "published");
  // published_by is the append-only, contractual record of who issued this version: the signed-in lead's verified
  // identity, never the body's name (bimdocs-3). The machine credential keeps its label.
  try {
    await sb("bim_document_versions", { method: "POST", body: buildSnapshot(doc, label || `v${version_no}`, resolveActor(actor, "web"), version_no), service: true });
  } catch (e) {
    await writeStatus(issued, "shared").catch(() => {});
    if (/sections are not the document's current sections/.test(e?.message ?? "")) throw err(422, PUBLISH_COPY_REFUSED);
    throw e;
  }
  await audit(doc.project_id, "bim_document", docId, "published", actor || "web", null, { version_no, label: label || `v${version_no}` });
  return { version_no };
}

export async function listVersions(key, docId) {
  await getDoc(key, docId); // membership/existence gate
  return sb(`bim_document_versions?document_id=eq.${enc(docId)}&select=id,version_no,label,published_by,published_at,revision,stage,suitability,sha&order=version_no.desc`, { service: true });
}

export async function getVersion(key, docId, n) {
  const role = await requireDocAccess(key, await getDoc(key, docId), "read");
  const row = one(await sb(`bim_document_versions?document_id=eq.${enc(docId)}&version_no=eq.${enc(n)}`, { service: true }));
  if (!row) throw err(404, "version not found");
  return role === "viewer" ? maskVersion(row) : row;
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
    let heading;
    try { heading = cleanHeading(s.heading); } catch (e) { throw err(400, `sections[${i}]: ${e.message}`); } // names the bad index
    const body = s.body || "";
    if (typeof body !== "string") throw err(400, `sections[${i}].body must be text`); // the ingest ledger row reads it after the insert
    if (body.length > LIMITS.markdownChars) throw err(422, `The section "${heading}" is longer than 100,000 characters; split it before importing. Nothing was saved.`);
    const id = randomUUID();
    return {
      id,
      heading,
      guidance: s.guidance || "",
      body,
      blocks: [textBlock(body, `${id}.t0`)],
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
  checkText(source.name, "the source file name");
  for (const key of SOURCE_KEYS) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

export async function createDocFromIngest(key, { doc_type, title, sections, source, actor } = {}) {
  if (!doc_type) throw err(400, "doc_type is required");
  if (doc_type === "READINESS") throw err(422, "A readiness assessment is made from its template, not imported. Nothing was saved.");
  checkText(title, "a document title");
  const tpl = loadTemplates().find((t) => t.doc_type === doc_type);
  if (!tpl) throw err(400, `unknown doc_type '${doc_type}'`);
  const normalizedSections = validateSections(sections);
  if (normalizedSections.length > LIMITS.sectionsPerDoc) throw err(422, `A document holds at most ${LIMITS.sectionsPerDoc} sections. Nothing was saved.`);
  if (tooLarge(normalizedSections)) throw err(422, TOO_LARGE);
  const normalizedSource = normalizeSource(source);
  const proj = await ensureProject(key);
  await requireDocAccess(key, null, "edit");
  // H0 (bimdocs-4): the original must have been uploaded to THIS project — it lives in the project's own folder, so a
  // file_id copied from another project, or one from before H0, names nothing here.
  if (normalizedSource?.file_id !== undefined) {
    const { sourceFilePath } = await import("./bimdocs-ingest.mjs");
    try { sourceFilePath(proj.id, normalizedSource.file_id); }
    catch { throw err(400, "the original file was not uploaded to this project — ingest it here again; nothing was saved"); }
  }
  const body = {
    project_id: proj.id,
    doc_type,
    title: title || `Ingested ${doc_type}`,
    template_id: tpl.template_id,
    template_version: tpl.version,
    status: "wip",
    created_by: resolveActor(actor, "web"), // the verified identity, as createDoc (bimdocs-3)
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

/** The original uploaded file's descriptor for a document, or null when hand-authored — with the document's project id,
 *  whose folder holds the file (H0, bimdocs-4). */
export async function getSourceRef(key, docId) {
  const doc = await getDoc(key, docId);
  return doc.source ? { ...doc.source, project_id: doc.project_id } : null;
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
  const doc = await openForWrite(key, docId, "govern", updated_at); // publish/transition/bindings govern the record — lead and above
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  const sections = doc.sections.map((s, j) => (j === i ? { ...s, bindings: next } : s));
  const before = { section: old.heading, checks: checkIds(old.bindings) };
  const row = await patchSections(doc, sections);
  await audit(doc.project_id, "bim_document", docId, "section_bindings_set", actor || "web",
    before, { section: old.heading, checks: next.checks.map((c) => c.id) });
  return row;
}

// ── Readiness: declared answers and plan fields live ON the section ──────────────────────────────
export const MAX_ANSWER_NOTE_CHARS = 2000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A declared item's answer: yes | partial | no + note. Contributor and above; the author is the verified identity. */
export async function setSectionAnswer(key, docId, sectionId, { value, note, updated_at, actor } = {}) {
  if (!ANSWERS.includes(value)) throw err(400, `answer value must be one of ${ANSWERS.join(", ")}`);
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > MAX_ANSWER_NOTE_CHARS) throw err(400, `note too long (${text.length}; limit ${MAX_ANSWER_NOTE_CHARS})`);
  const doc = await openForWrite(key, docId, "edit", updated_at);
  if (doc.doc_type !== "READINESS") throw err(409, "answers belong to READINESS documents only");
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  if (old.kind !== "declared") throw err(409, "this item is measured by a check — it takes no declared answer");
  const answer = { value, note: text, by: resolveActor(actor, "web"), at: new Date().toISOString() };
  const sections = doc.sections.map((s, j) => (j === i ? { ...s, answer } : s));
  const row = await patchSections(doc, sections);
  await audit(doc.project_id, "bim_document", docId, "declared", actor || "web",
    { section: old.heading, value: old.answer?.value ?? null },
    { section: old.heading, value, note_chars: text.length });
  return row;
}

/** Plan fields for a readiness item: owner + due (ISO date) — the implementation plan, in place. Lead and above. */
export async function setSectionPlan(key, docId, sectionId, { owner, due, updated_at, actor } = {}) {
  if (due !== undefined && due !== null && !ISO_DATE.test(String(due))) throw err(400, "due must be an ISO date (YYYY-MM-DD) or null");
  if (owner !== undefined && owner !== null && typeof owner !== "string") throw err(400, "owner must be a string or null");
  const doc = await openForWrite(key, docId, "govern", updated_at);
  if (doc.doc_type !== "READINESS") throw err(409, "plan fields belong to READINESS documents only");
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) throw err(404, "section not found");
  const old = doc.sections[i];
  const next = { ...old, ...(owner !== undefined && { owner: owner === null ? null : owner.trim() || null }), ...(due !== undefined && { due }) };
  const sections = doc.sections.map((s, j) => (j === i ? next : s));
  const row = await patchSections(doc, sections);
  await audit(doc.project_id, "bim_document", docId, "plan_set", actor || "web",
    { section: old.heading, owner: old.owner ?? null, due: old.due ?? null },
    { section: old.heading, owner: next.owner ?? null, due: next.due ?? null });
  return row;
}

// ── Section structure — add, remove, rename, reorder: a lead's, each ledgered as a reserved document_structure_changed row.
const outline = (sections) => sections.map((s) => (s && typeof s === "object" ? { id: s.id ?? null, heading: s.heading ?? null } : null));
const cleanHeading = (h) => {
  const t = typeof h === "string" ? h.trim() : "";
  if (!t || t.length > 200) throw err(400, "a section needs a heading");
  return t;
};
const auditStructure = (doc, sections, extra, actor) =>
  audit(doc.project_id, "bim_document", doc.id, "document_structure_changed", actor || "web",
    { outline: outline(doc.sections) }, { ...extra, outline: outline(sections) });
/** The document, unless it is a readiness assessment: it keeps its fixed questions (spec section 16), so the eight section and
 *  block ops refuse it after openForWrite and before any write. */
const keepsQuestions = (doc) => {
  if (doc.doc_type === "READINESS") throw err(422, "A readiness assessment keeps its fixed questions; answer them in the Documents tab. Nothing was saved.");
  return doc;
};
const findSection = (doc, id) => {
  const i = doc.sections.findIndex((s) => s.id === id);
  if (i < 0) throw err(404, "section not found");
  return i;
};

export async function addSection(key, docId, { heading, guidance, after, updated_at, actor } = {}) {
  const h = cleanHeading(heading);
  if (guidance != null && (typeof guidance !== "string" || guidance.length > LIMITS.markdownChars))
    throw err(400, "a section's guidance must be text of at most 100,000 characters");
  const doc = keepsQuestions(await openForWrite(key, docId, "govern", updated_at));
  if (doc.sections.length >= LIMITS.sectionsPerDoc) throw err(422, `A document holds at most ${LIMITS.sectionsPerDoc} sections. Nothing was saved.`);
  const at = after === undefined ? doc.sections.length : after === null ? 0 : findSection(doc, after) + 1;
  const id = randomUUID();
  const fresh = { id, heading: h, guidance: guidance || "", body: "", state: "wip", owner: null, bindings: {}, blocks: [textBlock("", `${id}.t0`)] };
  const sections = [...doc.sections.slice(0, at), fresh, ...doc.sections.slice(at)];
  const row = await patchSections(doc, sections);
  await auditStructure(doc, sections, { op: "add", section_id: id }, actor);
  return row;
}

export async function removeSection(key, docId, sectionId, { confirm_bound, updated_at, actor } = {}) {
  const doc = keepsQuestions(await openForWrite(key, docId, "govern", updated_at));
  const i = findSection(doc, sectionId);
  if (doc.sections.length <= 1) throw err(422, "A document keeps at least one section. Nothing was saved.");
  const ids = checkIds(doc.sections[i].bindings).filter((id) => id != null);
  if (ids.length && confirm_bound !== true) throw err(422, `This section is bound to checks (${ids.join(", ")}); confirm to remove it. Nothing was saved.`);
  const sections = doc.sections.filter((_, j) => j !== i);
  const row = await patchSections(doc, sections);
  await auditStructure(doc, sections, { op: "remove", section_id: sectionId, ...(ids.length && { checks_removed: ids }) }, actor);
  return row;
}

export async function renameSection(key, docId, sectionId, { heading, updated_at, actor } = {}) {
  const h = cleanHeading(heading);
  const doc = keepsQuestions(await openForWrite(key, docId, "govern", updated_at));
  const i = findSection(doc, sectionId);
  const sections = doc.sections.map((s, j) => (j === i ? { ...s, heading: h } : s));
  const row = await patchSections(doc, sections);
  await auditStructure(doc, sections, { op: "rename", section_id: sectionId }, actor);
  return row;
}

export async function reorderSections(key, docId, { order, updated_at, actor } = {}) {
  const doc = keepsQuestions(await openForWrite(key, docId, "govern", updated_at));
  const have = new Set(doc.sections.map((s) => s.id));
  if (have.size !== doc.sections.length) throw err(422, "Two sections in this document share one id, so they cannot be reordered safely. Nothing was saved.");
  if (!Array.isArray(order) || order.length !== doc.sections.length || new Set(order).size !== order.length || !order.every((id) => have.has(id)))
    throw err(400, "the new order must name every section once");
  const sections = order.map((id) => doc.sections.find((s) => s.id === id));
  const row = await patchSections(doc, sections);
  await auditStructure(doc, sections, { op: "reorder" }, actor);
  return row;
}

// ── Block operations — a contributor's; each re-derives the section's plain-text body and ledgers block_changed.
const withBlocks = (section, blocks) => ({ ...section, blocks, body: deriveBody(blocks) });
const blockFacts = (s, extra) => ({ section: s.heading, ...extra, ...bodyFacts(s.body) });
const findBlock = (blocks, id) => {
  const i = blocks.findIndex((b) => b.id === id);
  if (i < 0) throw err(404, "block not found");
  return i;
};
/** The sections with the one at index `si` replaced (by position: two sections stored with one id stay apart). */
const swap = (doc, si, next) => doc.sections.map((s, j) => (j === si ? next : s));
const auditBlock = (doc, old, next, op, block, created, actor) =>
  audit(doc.project_id, "bim_document", doc.id, "block_changed", actor || "web",
    created ? null : blockFacts(old, { block_id: block?.id ?? null, kind: block?.kind ?? null }),
    blockFacts(next, { op, block_id: block?.id ?? null, kind: block?.kind ?? null }));

export async function addBlock(key, docId, sectionId, { kind, title, data, after, updated_at, actor } = {}) {
  const doc = keepsQuestions(await openForWrite(key, docId, "edit", updated_at));
  const si = findSection(doc, sectionId);
  const old = doc.sections[si];
  const blocks = blocksOf(old);
  if (blocks.length >= LIMITS.blocksPerSection) throw err(422, `A section holds at most ${LIMITS.blocksPerSection} blocks. Nothing was saved.`);
  const at = after === undefined ? blocks.length : after === null ? 0 : findBlock(blocks, after) + 1;
  const block = validateBlock({ id: randomUUID(), kind, title, data: data ?? emptyData(kind) });
  const next = withBlocks(old, [...blocks.slice(0, at), block, ...blocks.slice(at)]);
  const row = await patchSections(doc, swap(doc, si, next));
  await auditBlock(doc, old, next, "add", block, true, actor);
  return row;
}

export async function editBlock(key, docId, sectionId, blockId, { title, data, updated_at, actor } = {}) {
  const doc = keepsQuestions(await openForWrite(key, docId, "edit", updated_at));
  const si = findSection(doc, sectionId);
  const old = doc.sections[si];
  const blocks = blocksOf(old);
  const i = findBlock(blocks, blockId);
  const block = validateBlock({ ...blocks[i], ...(title !== undefined && { title }), ...(data !== undefined && { data }) });
  const next = withBlocks(old, blocks.map((b, j) => (j === i ? block : b)));
  const row = await patchSections(doc, swap(doc, si, next));
  await auditBlock(doc, old, next, "edit", block, false, actor);
  return row;
}

export async function removeBlock(key, docId, sectionId, blockId, { updated_at, actor } = {}) {
  const doc = keepsQuestions(await openForWrite(key, docId, "edit", updated_at));
  const si = findSection(doc, sectionId);
  const old = doc.sections[si];
  const blocks = blocksOf(old);
  const i = findBlock(blocks, blockId);
  const next = withBlocks(old, blocks.filter((_, j) => j !== i));
  const row = await patchSections(doc, swap(doc, si, next));
  await auditBlock(doc, old, next, "remove", blocks[i], false, actor);
  return row;
}

export async function reorderBlocks(key, docId, sectionId, { order, updated_at, actor } = {}) {
  const doc = keepsQuestions(await openForWrite(key, docId, "edit", updated_at));
  const si = findSection(doc, sectionId);
  const old = doc.sections[si];
  const blocks = blocksOf(old);
  const have = new Set(blocks.map((b) => b.id));
  if (have.size !== blocks.length) throw err(422, "Two parts of this section share one id, so they cannot be reordered safely. Nothing was saved.");
  if (!Array.isArray(order) || order.length !== blocks.length || new Set(order).size !== order.length || !order.every((id) => have.has(id)))
    throw err(400, "the new order must name every block once");
  const next = withBlocks(old, order.map((id) => blocks.find((b) => b.id === id)));
  const row = await patchSections(doc, swap(doc, si, next));
  await auditBlock(doc, old, next, "reorder", null, false, actor);
  return row;
}

// ── Section comments — OUTSIDE the document (store "doc_comments"): commenting on a PUBLISHED
// document must not touch its frozen bytes. Append-only; author is ALWAYS the verified identity.
const COMMENTS_STORE = "doc_comments";
export const MAX_COMMENT_CHARS = 4000;

export async function listComments(key, docId) {
  const doc = await getDoc(key, docId); // membership + isUuid + 404 in one place
  const bag = await docGet(COMMENTS_STORE, doc.project_id, docId);
  return bag?.comments || [];
}

export async function addComment(key, docId, sectionId, text, actor) {
  const doc = await getDoc(key, docId); // published/archived are FINE — we never write the doc row
  await requireDocAccess(key, doc, "comment"); // 0038: doc_comments is the bridge's alone — any member comments, checked here
  const section = doc.sections.find((s) => s.id === sectionId);
  if (!section) throw err(404, `section not found — available: ${doc.sections.map((s) => s.id).join(", ")}`);
  const body = typeof text === "string" ? text.trim() : "";
  if (!body) throw err(400, "comment text is required");
  if (body.length > MAX_COMMENT_CHARS) throw err(400, `comment too long (${body.length}; limit ${MAX_COMMENT_CHARS})`);
  const comment = {
    id: randomUUID(), section_id: sectionId,
    author: resolveActor(actor, "web"),   // verified identity outranks any claim, as everywhere
    text: body, created_at: new Date().toISOString(),
  };
  // Optimistic concurrency: two reviewers commenting simultaneously is THE use case, and a plain
  // read-modify-write would let the last write silently swallow the other's comment. The bag
  // carries a rev counter; the write is conditional on the rev we read (legacy bags: rev absent →
  // is.null condition). A lost race just re-reads and retries.
  for (let attempt = 0; attempt < 4; attempt++) {
    const bag = await docGet(COMMENTS_STORE, doc.project_id, docId);
    if (!bag) {
      try {
        await docInsert(COMMENTS_STORE, doc.project_id, docId, { comments: [comment], rev: 1 }, { service: true });
      } catch (e) {
        // A permission denial is not a lost race — retrying it four times and calling the store "busy"
        // hid an RLS mismatch for a whole walkthrough. Say what it is.
        if (e?.status === 401 || e?.status === 403) throw err(403, "you are not allowed to comment on this project");
        continue; // concurrent first-insert won — re-read and CAS onto it
      }
      await audit(doc.project_id, "bim_document", docId, "comment_added", actor || "web", null,
        { section: section.heading, chars: body.length });
      return comment;
    }
    const next = { comments: [...(bag.comments || []), comment], rev: (bag.rev || 0) + 1 };
    const won = await docReplaceIfField(COMMENTS_STORE, doc.project_id, docId, next, "rev",
      bag.rev === undefined ? null : String(bag.rev), { service: true });
    if (won) {
      await audit(doc.project_id, "bim_document", docId, "comment_added", actor || "web", null,
        { section: section.heading, chars: body.length });
      return comment;
    }
  }
  throw err(409, "comment store is busy — please retry");
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

/**
 * The executability report: how much of this document actually controls information production,
 * plus the strip test. READ-ONLY — no writes, no audit row, same posture as complianceReport.
 * Deliberately separate from compliance: this measures WIRING (does the clause govern anything),
 * compliance measures OUTCOME (does the project satisfy it). Conflating them would let a fully
 * wired, entirely failing BEP report as healthy.
 */
export async function executabilityReport(key, docId) {
  const doc = await getDoc(key, docId);
  return {
    ...executability(doc, CHECKS.map((c) => c.id), PLANNED_CHECKS.map((p) => p.id)),
    generated_at: new Date().toISOString(),
    variant: loadTemplates().find((t) => t.template_id === doc.template_id)?.variant ?? null,
  };
}

/**
 * The readiness report: bound checks run per measured item (same cap and honesty as complianceReport),
 * scored three ways, plan derived, evidence basis named. READ-ONLY.
 */
export async function readinessReport(key, docId) {
  const doc = await getDoc(key, docId);
  if (doc.doc_type !== "READINESS") throw err(409, "readiness reports are for READINESS documents only");
  const resultsBySection = {};
  const sections = [];
  let evaluated = 0;
  for (const s of doc.sections) {
    const bound = s.kind === "measured" ? (s.bindings?.checks || []) : [];
    const results = [];
    for (const b of bound) {
      results.push(evaluated < MAX_COMPLIANCE_CHECKS
        ? (evaluated += 1, await runCheck(b.id, key, b.params || {}))
        : { id: b.id, label: b.id, status: "not_checkable", count: 0, summary: "", evidence: [],
            reason: `Not evaluated: this document exceeds the ${MAX_COMPLIANCE_CHECKS}-check limit for a single run.` });
    }
    resultsBySection[s.id] = results;
    sections.push({ section_id: s.id, heading: s.heading, pillar: s.pillar ?? null, kind: s.kind ?? null, results });
  }
  const [snap, scan] = await Promise.all([getSnapshot(key).catch(() => null), getScan(key).catch(() => null)]);
  const score = readiness(doc, resultsBySection);
  const plan = readinessPlan(doc, score, new Date().toISOString().slice(0, 10));
  return {
    document_id: doc.id, title: doc.title, doc_type: doc.doc_type, generated_at: new Date().toISOString(),
    evidence: {
      snapshot: snap ? { source: snap.source, at: snap.at, received_at: snap.received_at,
        ruleset: snap.ruleset ? { standard_key: snap.ruleset.standard_key ?? null, semver: snap.ruleset.semver ?? null, ref: snap.ruleset.ref ?? null, sha256: snap.ruleset.sha256 ?? null } : null } : null,
      scan: scan ? { doc_title: scan.doc_title, at: scan.at, received_at: scan.received_at } : null,
    },
    score, plan, sections,
  };
}
