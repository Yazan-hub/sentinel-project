// Per-project standards as artefacts. Each install is an immutable `<kind>@<n>` document with a sha;
// a pointer document per kind names the version in force. Resolution for a judge is project → office →
// what the client sent → none, and the answer always says which one judged (never a server-wide file:
// the cohesion review of 2026-09-23 found SENTINEL_IDS silently outranking every project, D3).
//
// Deps are injected (the changesets-store idiom) so the sequencing is unit-tested without Supabase;
// the defaults are loaded lazily to keep cde-store → artefact-store → cde-store from being a cycle.
import { createHash } from "node:crypto";

export const STORE = "artefact";
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog"];

const err = (status, message) => Object.assign(new Error(message), { status });
const sha256 = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");

async function wire(deps = {}) {
  const cde = (deps.ensureProject && deps.docGet && deps.docInsert && deps.docUpsert && deps.audit) ? null : await import("./cde-store.mjs");
  const members = deps.requireMinRole ? null : await import("./members-store.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    docGet: deps.docGet || cde.docGet,
    docInsert: deps.docInsert || cde.docInsert,
    docUpsert: deps.docUpsert || cde.docUpsert,
    audit: deps.audit || cde.audit,
    requireMinRole: deps.requireMinRole || members.requireMinRole,
    officeKeyOf: deps.officeKeyOf || (await import("./office-scope.mjs")).officeKeyOf,
    officeArtefact: deps.officeArtefact || officeArtefactAsService,
  };
}

/** The office's current artefact, read with the SERVICE key: inheriting it is the point, and a member of the
 *  child project need not be a member of the office (ensureProject would 403, bridge_docs RLS would hide it). */
async function officeArtefactAsService(officeKey, kind) {
  const { sb } = await import("./cde-store.mjs");
  const rows = await sb(`projects?key=eq.${encodeURIComponent(officeKey)}&select=id`, { service: true });
  const pid = rows?.[0]?.id;
  if (!pid) return null;
  const get = async (docId) => (await sb(`bridge_docs?store=eq.${STORE}&project_id=eq.${pid}&doc_id=eq.${encodeURIComponent(docId)}&select=data`, { service: true }))?.[0]?.data ?? null;
  const pointer = await get(kind);
  return pointer ? get(`${kind}@${pointer.version}`) : null;
}

// The scan ruleset's vocabulary: the targets the web adapter and the add-in scan (`type` is FG-02's type
// rule) and the enforcement ladder of sentinel-core/types.ts and Engine/RuleModels.cs.
const RULE_TARGETS = ["workset", "view", "parameter", "sheet", "family", "type", "level", "grid"];
const RULE_MODES = ["monitor", "warn", "request", "block"];
const ENFORCE = ["reject", "warn", "off"];
const filled = (v) => typeof v === "string" && v.trim() !== "";
const bad = (kind, path, want) => err(400, `${kind}: ${path} ${want}`);

function standardHead(kind, body) {
  if (!filled(body.standard_key)) throw bad(kind, "standard_key", "must be a non-empty string");
  if (typeof body.semver !== "string" || !/^\d+\.\d+\.\d+$/.test(body.semver)) throw bad(kind, "semver", "must be x.y.z");
}

/** Kind-specific validation: `ids`, `ruleset` and `naming` have real checks; the other kinds accept any
 *  object until they get a judge. A failure is a 400 naming the path (`rules[3].mode`). */
export function validateArtefact(kind, body) {
  if (!KINDS.includes(kind)) throw err(400, `unknown artefact kind '${kind}' (expected one of ${KINDS.join(", ")})`);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "artefact body must be a JSON object");
  if (kind === "ids") {
    // A zero-spec compile installs as a silent pass-everything IDS (adjudicate() has nothing to check),
    // which reports "accepted" for every model — a gate-only pass dressed as an IDS pass (the honesty
    // rule). Reject it here so an empty compile can never become an artefact.
    if (!Array.isArray(body.specifications) || body.specifications.length === 0) throw err(400, "an IDS artefact needs at least one specification in `specifications: [...]` (the JSON spec shape; raw .ids XML is not accepted server-side)");
    if (body.enforce !== undefined && !ENFORCE.includes(body.enforce)) throw err(400, "ids.enforce must be reject | warn | off");
  }
  if (kind === "ruleset") {
    standardHead(kind, body);
    if (body.org !== undefined && typeof body.org !== "string") throw bad(kind, "org", "must be a string");
    if (!Array.isArray(body.rules) || !body.rules.length) throw bad(kind, "rules", "must be a non-empty array");
    body.rules.forEach((r, i) => {
      const at = `rules[${i}]`;
      if (!r || typeof r !== "object") throw bad(kind, at, "must be an object");
      if (!filled(r.id)) throw bad(kind, `${at}.id`, "must be a non-empty string");
      if (!RULE_TARGETS.includes(r.target)) throw bad(kind, `${at}.target`, `must be ${RULE_TARGETS.join(" | ")}`);
      if (!RULE_MODES.includes(r.mode)) throw bad(kind, `${at}.mode`, `must be ${RULE_MODES.join(" | ")}`);
    });
  }
  if (kind === "naming") {
    standardHead(kind, body);
    if (!filled(body.title)) throw bad(kind, "title", "must be a non-empty string");
    if (typeof body.separator !== "string" || body.separator.length !== 1) throw bad(kind, "separator", "must be one character");
    if (!Array.isArray(body.fields) || !body.fields.length) throw bad(kind, "fields", "must be a non-empty array");
    body.fields.forEach((f, i) => {
      const at = `fields[${i}]`;
      if (!f || typeof f !== "object") throw bad(kind, at, "must be an object");
      if (!filled(f.key)) throw bad(kind, `${at}.key`, "must be a non-empty string");
      if (!filled(f.label)) throw bad(kind, `${at}.label`, "must be a non-empty string");
      if (!filled(f.pattern) && !(Array.isArray(f.enum) && f.enum.length)) throw bad(kind, at, "needs a pattern or a non-empty enum[]");
    });
    if (body.enforce !== undefined && !ENFORCE.includes(body.enforce)) throw bad(kind, "enforce", "must be reject | warn | off");
    if (body.strip_extensions !== undefined && !(Array.isArray(body.strip_extensions) && body.strip_extensions.every((e) => typeof e === "string")))
      throw bad(kind, "strip_extensions", "must be an array of strings");
  }
  return true;
}

export async function putArtefact(key, kind, body, { actor, source } = {}, deps) {
  validateArtefact(kind, body);
  const d = await wire(deps);
  await d.requireMinRole(key, "lead");
  const proj = await d.ensureProject(key);
  const prev = await d.docGet(STORE, proj.id, kind);
  const version = (prev?.version || 0) + 1;
  const pointer = {
    kind, version, sha256: sha256(body),
    installed_by: actor || "web", installed_at: new Date().toISOString(),
    source: source && typeof source === "object" ? source : null,
  };
  await d.docInsert(STORE, proj.id, `${kind}@${version}`, { ...pointer, body });
  await d.docUpsert(STORE, proj.id, kind, pointer);
  await d.audit(proj.id, "artefact", null, `artefact_installed ${kind}@${version}`, pointer.installed_by, prev, pointer);
  return pointer;
}

export async function getArtefact(key, kind, deps) {
  if (!KINDS.includes(kind)) throw err(404, `unknown artefact kind '${kind}'`);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const pointer = await d.docGet(STORE, proj.id, kind);
  if (!pointer) return null;
  return d.docGet(STORE, proj.id, `${kind}@${pointer.version}`);
}

export async function getArtefactVersion(key, kind, version, deps) {
  if (!KINDS.includes(kind)) throw err(404, `unknown artefact kind '${kind}'`);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  return d.docGet(STORE, proj.id, `${kind}@${Number(version)}`);
}

export async function listArtefacts(key, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const out = {};
  for (const kind of KINDS) out[kind] = (await d.docGet(STORE, proj.id, kind)) ?? null;
  return out;
}

/**
 * The artefact of `kind` that judges `key`: the project's own → its office's → none. The answer names
 * which one judged (`source`, `ref`) and the sha of the BODY that judges, not the pointer's copy:
 * bridge_docs is member-writable through PostgREST (migration 0028), so a rewritten document must show
 * up as a different hash on every later verdict, and a pointer that disagrees is flagged.
 */
export async function resolveArtefact(key, kind, deps) {
  const d = await wire(deps);
  const stamp = (doc, source) => {
    const bodySha = sha256(doc.body);
    return { body: doc.body, source, ref: `${kind}@${doc.version}`, sha256: bodySha, pointer_sha_mismatch: bodySha !== doc.sha256 };
  };
  const own = await getArtefact(key, kind, deps);
  if (own) return stamp(own, "project");
  const officeKey = await d.officeKeyOf(key);
  if (officeKey) {
    const office = await d.officeArtefact(officeKey, kind);
    if (office) return stamp(office, "office");
  }
  return { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };
}

/** What judged, in one line for a verdict row, evidence line, scan header or CLI: "naming@2 · office · 3f0737600a1b…"; "none" when nothing is installed. */
export const refLabel = ({ ref, source, sha256: sha } = {}) => [ref, source, sha && `${sha.slice(0, 12)}…`].filter(Boolean).join(" · ") || "none";

/**
 * The IDS a judge must use for `key`: project → office (resolveArtefact) → client → none. Returns the spec
 * and its provenance; `client_ids_ignored` is true when a client sent one but an installed artefact outranked it.
 */
export async function resolveIdsSpec(key, body = {}, deps) {
  const clientSent = body.ids !== undefined && body.ids !== null;
  const a = await resolveArtefact(key, "ids", deps);
  if (a.source !== "none") return { spec: a.body, source: a.source, ref: a.ref, sha256: a.sha256, pointer_sha_mismatch: a.pointer_sha_mismatch, client_ids_ignored: clientSent };
  if (clientSent) {
    if (typeof body.ids === "string") throw err(400, "Submit the IDS as a JSON spec {title, specifications:[…]} — raw .ids XML is parsed browser-side only.");
    return { spec: body.ids, source: "client", ref: null, sha256: sha256(body.ids), client_ids_ignored: false };
  }
  return { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false };
}
