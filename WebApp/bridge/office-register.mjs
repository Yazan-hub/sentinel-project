// The office register (R1c, spec 2026-10-24 §4 Office register): the office's own standard — who does which information-management
// function, the software, hardware, past projects, training and terms it can show a client. Lines marked `publish` may enter a
// project's documents (live-resolve.mjs reads them through publishedLines); everything else stays here.
// Stored in bridge_docs store `office_register` (NOT `artefact`): the generic artefact routes and inheritance never see it, and
// migration 0051 lets only leads of the office read the rows directly. Versions are append-only: office_register@n + a pointer.
// Deps are injected (the members-store idiom) so the sequencing is unit-tested without Supabase.
import { canonicalSha256 } from "./canonical.mjs";
import { resolveActor } from "./bridge-auth.mjs";
import { ifMatchValue, staleChange } from "./artefact-store.mjs";

export const STORE = "office_register";
export const PARTS = ["people", "software", "hardware", "past_projects", "training", "terms"];
export const PART_WORDS = { people: "People and functions", software: "Software", hardware: "Hardware and IT", past_projects: "Past projects", training: "Training plan", terms: "Terms" };
const PART_FIELDS = { people: ["function", "who", "competence"], software: ["name", "version", "use"], hardware: ["item", "spec"], past_projects: ["name", "year", "role"], training: ["course", "who"], terms: ["term", "meaning"] };
const COMMON = ["id", "publish", "evidence", "evidence_note", "owner", "due"];
const MAX_LINES = 200, MAX_TEXT = 500;
const EMAIL = /@[^\s@]+\.[^\s@]+/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const err = (status, message) => Object.assign(new Error(message), { status });
const bad = (at, want) => err(400, `${at} ${want}`);
const validDate = (s) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The register body, checked: exactly the six parts, each a list of at most 200 lines. 400 in words naming `part[i].field`. */
export function validateRegister(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "the register must be an object with one list per part");
  const stray = Object.keys(body).find((k) => !PARTS.includes(k));
  if (stray !== undefined) throw bad(stray, "is not a part of the register — the parts are people, software, hardware, past_projects, training and terms");
  const ids = new Set();
  for (const part of PARTS) {
    const lines = body[part];
    if (!Array.isArray(lines)) throw bad(part, "must be a list of lines (it may be empty)");
    if (lines.length > MAX_LINES) throw bad(part, `holds ${lines.length} lines — at most ${MAX_LINES}`);
    lines.forEach((l, i) => {
      const at = `${part}[${i}]`;
      if (!l || typeof l !== "object" || Array.isArray(l)) throw bad(at, "must be a line with fields");
      const allowed = [...COMMON, ...PART_FIELDS[part]];
      const unknown = Object.keys(l).find((k) => !allowed.includes(k));
      if (unknown !== undefined) throw bad(`${at}.${unknown}`, `is not a field of a ${PART_WORDS[part]} line`);
      for (const [k, v] of Object.entries(l)) {
        if (k === "publish") { if (typeof v !== "boolean") throw bad(`${at}.publish`, "must be yes or no"); continue; }
        if (typeof v !== "string") throw bad(`${at}.${k}`, "must be text");
        if (v.length > MAX_TEXT) throw bad(`${at}.${k}`, `is longer than ${MAX_TEXT} characters`);
        if (EMAIL.test(v)) throw err(400, "the register holds names and roles, not e-mail addresses");
      }
      if (typeof l.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(l.id)) throw bad(`${at}.id`, "must be 1 to 40 lower-case letters, digits or dashes, starting with a letter or digit");
      if (ids.has(l.id)) throw bad(`${at}.id`, `repeats another line's id (${l.id}) — each line has its own`);
      ids.add(l.id);
      if (typeof l.publish !== "boolean") throw bad(`${at}.publish`, "must be yes or no");
      if (l.evidence !== "evidenced" && l.evidence !== "committed") throw bad(`${at}.evidence`, "must be Evidenced or Committed");
      for (const k of ["evidence_note", "owner", "due", ...PART_FIELDS[part]]) if (typeof l[k] !== "string") throw bad(`${at}.${k}`, "is missing");
      if (l.due !== "" && !validDate(l.due)) throw bad(`${at}.due`, "must be a date as YYYY-MM-DD");
      if (l.evidence === "committed" && (!l.owner.trim() || !l.due)) throw bad(`${at}`, "is committed, so it needs an owner and a due date");
    });
  }
  return body;
}

const wire = async (deps = {}) => {
  const needCde = !(deps.ensureProject && deps.docGet && deps.docInsert && deps.docUpsert && deps.audit);
  const cde = needCde ? await import("./cde-store.mjs") : null;
  const members = deps.requireMinRole ? null : await import("./members-store.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    // The register is read and written with the SERVICE key after the bridge's own lead check (migration 0051: no signed-in write policy exists).
    docGet: deps.docGet || ((pid, id) => cde.sb(`bridge_docs?store=eq.${STORE}&project_id=eq.${encodeURIComponent(pid)}&doc_id=eq.${encodeURIComponent(id)}&select=data`, { service: true }).then((r) => r?.[0]?.data ?? null)),
    docInsert: deps.docInsert || ((pid, id, data) => cde.docInsert(STORE, pid, id, data, { service: true })),
    docUpsert: deps.docUpsert || ((pid, id, data) => cde.docUpsert(STORE, pid, id, data, { service: true })),
    audit: deps.audit || cde.audit,
    requireMinRole: deps.requireMinRole || members.requireMinRole,
  };
};

/** The caller must be a lead or above of THIS office project; the project must be an office. → the project row. */
async function officeFor(d, key) {
  await d.requireMinRole(key, "lead"); // before any read
  const proj = await d.ensureProject(key);
  if (proj.kind !== "office") throw err(400, "the office register belongs to an office — open the office, not a project");
  return proj;
}

/** → {version, sha256, installed_by, installed_at, body} | null. */
export async function getRegister(officeKey, deps) {
  const d = await wire(deps);
  const proj = await officeFor(d, officeKey);
  const ptr = await d.docGet(proj.id, STORE);
  if (!ptr) return null;
  const doc = await d.docGet(proj.id, `${STORE}@${ptr.version}`);
  return doc ? { ...ptr, body: doc.body } : null;
}

const count = (body) => PARTS.reduce((n, p) => n + body[p].length, 0);
const countPublished = (body) => PARTS.reduce((n, p) => n + body[p].filter((l) => l.publish).length, 0);

/** Install office_register@n+1 and its pointer; one ledger row. `ifMatch` is the sha the editor read, or "none". */
export async function putRegister(officeKey, body, { actor, ifMatch } = {}, deps) {
  const d = await wire(deps);
  const proj = await officeFor(d, officeKey);
  validateRegister(body);
  const prev = await d.docGet(proj.id, STORE);
  const want = ifMatchValue(ifMatch);
  if (want != null && want !== (prev?.sha256 ?? "none")) throw staleChange("the office register was", prev?.installed_by, prev?.installed_at);
  const version = (prev?.version || 0) + 1;
  const sha256 = canonicalSha256(body);
  const pointer = { version, sha256, installed_by: resolveActor(actor, "web"), installed_at: new Date().toISOString() };
  try { await d.docInsert(proj.id, `${STORE}@${version}`, { ...pointer, body }); }
  catch (e) { if (e?.status === 409 || e?.body?.code === "23505") throw err(409, "another change to the office register landed at the same moment — read it again and retry; nothing was saved"); throw e; }
  await d.docUpsert(proj.id, STORE, pointer);
  await d.audit(proj.id, "office_register", null, "office_register_installed", pointer.installed_by, { version: version - 1 },
    { version, sha256, lines: count(body), published_lines: countPublished(body) });
  return pointer;
}

/** The lines marked `publish` — a SERVICE read with no caller check: only the resolver calls it, with the office id of the project
 *  being resolved (never an id a caller sent). → [{part, ...line}], one part or all. */
export async function publishedLines(officeId, part, deps) {
  const d = await wire(deps);
  const ptr = await d.docGet(officeId, STORE);
  if (!ptr) return [];
  const doc = await d.docGet(officeId, `${STORE}@${ptr.version}`);
  const body = doc?.body;
  if (!body) return [];
  return (part ? [part] : PARTS).flatMap((p) => (body[p] || []).filter((l) => l.publish === true).map((l) => ({ part: p, ...l })));
}
