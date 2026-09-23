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

/** Kind-specific validation. Only `ids` has a real check today; other kinds accept any object. */
export function validateArtefact(kind, body) {
  if (!KINDS.includes(kind)) throw err(400, `unknown artefact kind '${kind}' (expected one of ${KINDS.join(", ")})`);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "artefact body must be a JSON object");
  if (kind === "ids") {
    // A zero-spec compile installs as a silent pass-everything IDS (adjudicate() has nothing to check),
    // which reports "accepted" for every model — a gate-only pass dressed as an IDS pass (the honesty
    // rule). Reject it here so an empty compile can never become an artefact.
    if (!Array.isArray(body.specifications) || body.specifications.length === 0) throw err(400, "an IDS artefact needs at least one specification in `specifications: [...]` (the JSON spec shape; raw .ids XML is not accepted server-side)");
    if (body.enforce !== undefined && !["reject", "warn", "off"].includes(body.enforce)) throw err(400, "ids.enforce must be reject | warn | off");
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
 * The IDS a judge must use for `key`: project → office → client → none. Returns the spec and its
 * provenance; `client_ids_ignored` is true when a client sent one but an installed artefact outranked it.
 */
export async function resolveIdsSpec(key, body = {}, deps) {
  const d = await wire(deps);
  const clientSent = body.ids !== undefined && body.ids !== null;
  // The sha the ledger records is computed from the BODY that judges, not copied from the pointer:
  // bridge_docs is member-writable through PostgREST (migration 0028), so a rewritten document must
  // show up as a different hash on every later verdict, and a pointer that disagrees is flagged.
  const stamp = (doc, source) => {
    const bodySha = sha256(doc.body);
    return { spec: doc.body, source, ref: `ids@${doc.version}`, sha256: bodySha, pointer_sha_mismatch: bodySha !== doc.sha256, client_ids_ignored: clientSent };
  };
  const own = await getArtefact(key, "ids", deps);
  if (own) return stamp(own, "project");
  const officeKey = await d.officeKeyOf(key);
  if (officeKey) {
    const office = await d.officeArtefact(officeKey, "ids");
    if (office) return stamp(office, "office");
  }
  if (clientSent) {
    if (typeof body.ids === "string") throw err(400, "Submit the IDS as a JSON spec {title, specifications:[…]} — raw .ids XML is parsed browser-side only.");
    return { spec: body.ids, source: "client", ref: null, sha256: sha256(body.ids), client_ids_ignored: false };
  }
  return { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false };
}
