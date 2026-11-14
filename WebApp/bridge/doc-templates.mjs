// Office document templates (R3, Task 5; design 2026-10-24 §4 Templates): the templates an office keeps for its BEPs and EIRs, as ONE office
// artefact, doc_templates@n — every template of the office in the disk-template shape, so instantiateTemplate runs unchanged. A document made
// from one records template_id "office-<id>" and the artefact's version. Pure: no I/O and no store imports (artefact-store validates through
// this file, so it must not reach back into the stores); the stores compose these.
import { validateBlock, blocksOf, emptyData, LIMITS } from "./doc-blocks.mjs";

export const MAX_TEMPLATES = 20, MAX_NAME = 120, MAX_WHEN = 400;
export const TEMPLATE_ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const SUFFIX_RE = /^[a-z0-9-]{1,40}$/;
const CHECK_ID_RE = /^[a-z][a-z0-9_.]{0,59}$/;
const TYPES = ["BEP", "EIR"];
export const ONLY_BEP_EIR = "Only a BEP or an EIR can be an office template.";

const bad = (at, what) => Object.assign(new Error(`${at} ${what}`), { status: 400 });
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The check ids a binding may name: the registry registers them when it loads (it cannot be imported from here — artefact-store imports this
// file and the registry imports artefact-store). Until it has, a binding is checked for its shape only.
let KNOWN_CHECKS = null;
export const knowChecks = (ids) => { KNOWN_CHECKS = ids ? new Set(ids) : null; };

/** A template section's bindings → {checks: [{id, params}]}: each a known check id (bindable planned ones too), params an object. */
function bindingsOf(v, at) {
  if (v === undefined) return { checks: [] };
  if (!isObj(v)) throw bad(at, "must be an object shaped {checks:[{id, params?}]}");
  if (v.checks === undefined) return { checks: [] };
  if (!Array.isArray(v.checks)) throw bad(`${at}.checks`, "must be a list");
  return { checks: v.checks.map((c, i) => {
    if (!isObj(c) || typeof c.id !== "string" || !CHECK_ID_RE.test(c.id)) throw bad(`${at}.checks[${i}]`, "must be an object with a check id");
    if (KNOWN_CHECKS && !KNOWN_CHECKS.has(c.id)) throw bad(`${at}.checks[${i}]`, `names an unknown check id '${c.id}'`);
    if (c.params !== undefined && !isObj(c.params)) throw bad(`${at}.checks[${i}].params`, "must be an object");
    return { id: c.id, params: c.params ?? {} };
  }) };
}

/** A block of a template, checked as every block is, id dropped (a document gets fresh ones) → {kind, title, data}. */
function blockOf(raw, at) {
  if (!isObj(raw)) throw bad(at, "must be a block");
  const { kind, title, data } = validateBlock({ ...raw, id: "t" }, at);
  return { kind, title, data };
}

/** The office's templates, checked (400 in words naming the place) → the body, normalised: {templates: [{id, doc_type, name, when_to_use, variant, sections, starts?}]}. */
export function validateDocTemplates(body) {
  if (!isObj(body)) throw bad("the templates", "must be an object {templates: [...]}");
  if (!Array.isArray(body.templates)) throw bad("templates", "must be a list (it may be empty)");
  if (body.templates.length > MAX_TEMPLATES) throw bad("templates", `holds ${body.templates.length} templates — at most ${MAX_TEMPLATES}`);
  const ids = new Set();
  const templates = body.templates.map((t, i) => {
    const at = `templates[${i}]`;
    if (!isObj(t)) throw bad(at, "must be a template");
    if (typeof t.id !== "string" || !TEMPLATE_ID_RE.test(t.id)) throw bad(`${at}.id`, "must be 2 to 41 lower-case letters, digits or dashes, starting with a letter");
    if (ids.has(t.id)) throw bad(`${at}.id`, `repeats another template's id (${t.id})`);
    ids.add(t.id);
    if (!TYPES.includes(t.doc_type)) throw Object.assign(new Error(ONLY_BEP_EIR), { status: 400 });
    if (typeof t.name !== "string" || !t.name.trim()) throw bad(`${at}.name`, "needs a name");
    if (t.name.length > MAX_NAME) throw bad(`${at}.name`, `is longer than ${MAX_NAME} characters`);
    const when_to_use = t.when_to_use ?? "";
    if (typeof when_to_use !== "string" || when_to_use.length > MAX_WHEN) throw bad(`${at}.when_to_use`, `must be text of at most ${MAX_WHEN} characters`);
    const variant = t.variant ?? null;
    if (variant !== null && variant !== "minimal" && variant !== "full") throw bad(`${at}.variant`, "must be minimal, full or empty");
    if (!Array.isArray(t.sections) || !t.sections.length) throw bad(`${at}.sections`, "must hold at least one section");
    if (t.sections.length > LIMITS.sectionsPerDoc) throw bad(`${at}.sections`, `holds at most ${LIMITS.sectionsPerDoc} sections`);
    const keys = new Set();
    const sections = t.sections.map((s, j) => {
      const sat = `${at}.sections[${j}]`;
      if (!isObj(s)) throw bad(sat, "must be a section");
      if (typeof s.key !== "string" || !KEY_RE.test(s.key)) throw bad(`${sat}.key`, "must be 1 to 60 lower-case letters, digits or dashes");
      if (keys.has(s.key)) throw bad(`${sat}.key`, `repeats another section's key (${s.key})`);
      keys.add(s.key);
      if (typeof s.heading !== "string" || !s.heading.trim() || s.heading.length > LIMITS.titleChars) throw bad(`${sat}.heading`, `must be a heading of at most ${LIMITS.titleChars} characters`);
      const guidance = s.guidance ?? "";
      if (typeof guidance !== "string" || guidance.length > LIMITS.cellChars) throw bad(`${sat}.guidance`, `must be text of at most ${LIMITS.cellChars} characters`);
      if (!Array.isArray(s.blocks ?? [])) throw bad(`${sat}.blocks`, "must be a list");
      if ((s.blocks ?? []).length > LIMITS.blocksPerSection) throw bad(`${sat}.blocks`, `holds at most ${LIMITS.blocksPerSection} blocks`);
      return { key: s.key, heading: s.heading, guidance, blocks: (s.blocks ?? []).map((b, k) => blockOf(b, `${sat}.blocks[${k}]`)), bindings: bindingsOf(s.bindings, `${sat}.bindings`) };
    });
    let starts;
    if (t.starts !== undefined) {
      if (!isObj(t.starts)) throw bad(`${at}.starts`, "must be an object");
      starts = {};
      for (const [name, st] of Object.entries(t.starts)) {
        if (name !== "no_eir" || !isObj(st) || !Array.isArray(st.blocks)) throw bad(`${at}.starts.${name}`, "is not a start a template can carry");
        starts[name] = { ...(typeof st.section === "string" ? { section: st.section } : {}), blocks: st.blocks.map((b, k) => {
          if (!isObj(b) || typeof b.id_suffix !== "string" || !SUFFIX_RE.test(b.id_suffix)) throw bad(`${at}.starts.${name}.blocks[${k}].id_suffix`, "must be 1 to 40 lower-case letters, digits or dashes");
          return { id_suffix: b.id_suffix, ...blockOf(b, `${at}.starts.${name}.blocks[${k}]`) };
        }) };
      }
    }
    return { id: t.id, doc_type: t.doc_type, name: t.name, when_to_use, variant, sections, ...(starts ? { starts } : {}) };
  });
  return { templates };
}

/** "Structure only": a block's frame without what was written in it — table columns, matrix preset and columns, fact labels, live-list source
 *  and filter, reference roles and the naming fields stay; rows, marks, text, proposed changes, clauses and LOIN rows go. */
function structureOf(b) {
  const d = b.data ?? {};
  const data = b.kind === "table" ? { ...d, rows: [] }
    : b.kind === "matrix" ? { ...d, rows: [] }
    : b.kind === "references" ? { rows: (d.rows ?? []).map((r) => ({ id: r.id, role: r.role, title: "", version: "", sha: null, issuer: "", received: null, incorporated_in: [] })) }
    : ["text", "proposed_changes", "eir_link", "loin"].includes(b.kind) ? emptyData(b.kind)
    : d; // facts, live_view, naming: a frame already
  return { kind: b.kind, title: b.title ?? "", data };
}

/** A document's own structure as an office template entry. `sourceTemplate`: the template the document was made from (its starts are carried,
 *  so a BEP saved from the comprehensive one still has its start), or null. `keep_content`: its text and rows travel too. Not validated here —
 *  validateDocTemplates is the one gate, at the install. */
export function templateFromDocument(doc, sourceTemplate, { id, name, when_to_use = "", variant = null, keep_content = false } = {}) {
  const taken = new Set();
  const sections = (doc.sections ?? []).map((s, i) => {
    const base = String(s.template_key || s.heading || "").toLowerCase().replace(/^\d+\.\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || `section-${i + 1}`;
    let key = base, n = 2;
    while (taken.has(key)) key = `${base}-${n++}`;
    taken.add(key);
    const blocks = blocksOf(s).map((b) => (keep_content ? { kind: b.kind, title: b.title ?? "", data: b.data } : structureOf(b)));
    return { key, heading: s.heading, guidance: s.guidance ?? "", blocks, bindings: { checks: (s.bindings?.checks ?? []).map((c) => ({ id: c.id, params: c.params ?? {} })) } };
  });
  const starts = sourceTemplate?.starts && Object.keys(sourceTemplate.starts).length ? sourceTemplate.starts : undefined;
  return { id, doc_type: doc.doc_type, name, when_to_use, variant, sections, ...(starts ? { starts } : {}) };
}

/** The office's templates in the disk-template shape, ready for instantiateTemplate and pickStart: template_id "office-<id>", the artefact's
 *  version, `office: true`. `art`: the stored artefact ({body, version}) or resolveArtefact's answer ({body, ref}). A template that no
 *  longer validates (a check id a later release dropped) is left out alone — the others stay; a template list never throws.
 *  The id has a dash, not a colon: bim_documents.template_id allows only lower-case words joined by dashes (0049), and no shipped
 *  template's file name starts with "office-" (bimdocs-templates.test.mjs holds that). */
export function officeTemplates(art) {
  if (!art?.body) return [];
  const one = (t) => { try { return validateDocTemplates({ templates: [t] }).templates; } catch { return []; } };
  const version = art.version ?? (Number(String(art.ref ?? "").split("@")[1]) || 1);
  return (Array.isArray(art.body.templates) ? art.body.templates : []).flatMap(one).map((t) => ({
    template_id: `office-${t.id}`, doc_type: t.doc_type, title: t.name, name: t.name, variant: t.variant, when_to_use: t.when_to_use,
    default: false, office: true, version, sections: t.sections, starts: t.starts ?? {},
  }));
}

/** A template id for a name: lower-case words joined by dashes, at most 41 characters, unique among `taken`. */
export function templateIdFor(name, taken) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "").slice(0, 36) || "template";
  const stem = base.length < 2 ? `${base}-t` : base;
  let id = stem, n = 2;
  while (taken.has(id)) id = `${stem}-${n++}`;
  return id;
}
