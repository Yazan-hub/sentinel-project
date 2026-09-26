// Per-project standards as artefacts. Each install is an immutable `<kind>@<n>` document with a sha;
// a pointer document per kind names the version in force. Resolution for a judge is project → office →
// what the client sent → none, and the answer always says which one judged (never a server-wide file:
// the cohesion review of 2026-09-23 found SENTINEL_IDS silently outranking every project, D3).
//
// Deps are injected (the changesets-store idiom) so the sequencing is unit-tested without Supabase;
// the defaults are loaded lazily to keep cde-store → artefact-store → cde-store from being a cycle.
import { createHash } from "node:crypto";

export const STORE = "artefact";
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish"];

const err = (status, message) => Object.assign(new Error(message), { status });
/** Canonical JSON: keys sorted recursively. bridge_docs.data is jsonb and Postgres reorders object keys, so a
 *  hash over the raw stringify never matched the pointer after a round-trip (final review, phase 3). */
export const canonical = (o) => Array.isArray(o) ? `[${o.map(canonical).join(",")}]`
  : (o && typeof o === "object") ? `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`
  : JSON.stringify(o);
const sha256 = (o) => createHash("sha256").update(canonical(o)).digest("hex");

async function wire(deps = {}) {
  const cde = (deps.ensureProject && deps.docGet && deps.docInsert && deps.docUpsert && deps.audit) ? null : await import("./cde-store.mjs");
  const members = deps.requireMinRole ? null : await import("./members-store.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    docGet: deps.docGet || cde.docGet,
    // Writes go with the SERVICE key: migration 0030 lets members read artefacts but never write them, so the
    // install below (after requireMinRole) is the only way in. Reads stay forwarded (member-scoped).
    docInsert: deps.docInsert || ((s, p, id, data) => cde.docInsert(s, p, id, data, { service: true })),
    docUpsert: deps.docUpsert || ((s, p, id, data) => cde.docUpsert(s, p, id, data, { service: true })),
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
// Blank is JS whitespace plus U+0085 (NEL), which .NET's char.IsWhiteSpace has and JS trim does not; DeliveryContract.Text
// adds U+FEFF, which JS has and .NET does not. One set on both sides: the bridge never installs a key Revit reads as blank.
const filled = (v) => typeof v === "string" && /[^\s\u0085]/.test(v);
const bad = (kind, path, want) => err(400, `${kind}: ${path} ${want}`);

// Contract, layers, guideline, type catalogue (spec 2026-09-25 4b decision 4): what their judges read, nothing
// more. Every contract field is required — neither delivery gate fills a default, so Revit and intake read one
// contract one way. "Optional" means absent or null. The loaders in Revit repeat these checks on what they receive.
const IFC_SCHEMAS = ["IFC2X3", "IFC4"];                                  // what PlatformExporter can write
const IFC_ENTITY = /^IFC[A-Z0-9_]+$/;
const LAYER_CATEGORIES = ["Walls", "Floors", "Ceilings", "Doors", "Windows", "Columns", "Furniture"];
const MAX_CATALOG_TYPES = 20000;                                         // = office-store MAX_CATALOG_TYPES (importing it would load cde-store)
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const intCount = (v) => Number.isInteger(v) && v >= 0 && v <= 2147483647; // a C# int: a larger count would not load in Revit
const texts = (v) => Array.isArray(v) && v.every((s) => typeof s === "string");
const names = (v) => Array.isArray(v) && v.every(filled);
/** The array at `path` holds objects only; `each(item, "path[i]")` checks one. */
function objects(kind, path, v, each) {
  if (!Array.isArray(v)) throw bad(kind, path, "must be an array");
  v.forEach((x, i) => { if (!isObj(x)) throw bad(kind, `${path}[${i}]`, "must be an object"); each(x, `${path}[${i}]`); });
}

function standardHead(kind, body) {
  if (!filled(body.standard_key)) throw bad(kind, "standard_key", "must be a non-empty string");
  if (typeof body.semver !== "string" || !/^\d+\.\d+\.\d+$/.test(body.semver)) throw bad(kind, "semver", "must be x.y.z");
}

/** Kind-specific validation — every kind has a real check, so the bridge never installs a body its judge could
 *  not use. A failure is a 400 naming the path (`rules[3].mode`, `required_entities[0].min_count`). */
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
  if (kind === "contract") {
    if (!filled(body.contract_key)) throw bad(kind, "contract_key", "must be a non-empty string");
    if (!IFC_SCHEMAS.includes(body.ifc_schema)) throw bad(kind, "ifc_schema", `must be ${IFC_SCHEMAS.join(" | ")}`);
    const entity = (e, at) => { if (typeof e.entity !== "string" || !IFC_ENTITY.test(e.entity)) throw bad(kind, `${at}.entity`, "must be an IFC entity name in capitals, e.g. IFCWALL"); };
    objects(kind, "required_entities", body.required_entities, (e, at) => {
      entity(e, at);
      if (!intCount(e.min_count)) throw bad(kind, `${at}.min_count`, "must be an integer 0..2147483647");
    });
    for (const f of ["required_psets", "required_properties"]) if (!names(body[f])) throw bad(kind, f, "must be an array of non-empty strings");
    objects(kind, "forbidden_entities", body.forbidden_entities, (e, at) => {
      entity(e, at);
      if (!intCount(e.max_count)) throw bad(kind, `${at}.max_count`, "must be an integer 0..2147483647");
      if (typeof e.max_ratio !== "number" || !(e.max_ratio >= 0 && e.max_ratio <= 1)) throw bad(kind, `${at}.max_ratio`, "must be a number 0..1");
    });
    if (typeof body.require_georeference !== "boolean") throw bad(kind, "require_georeference", "must be true or false");
    // A C# int, as DeliveryContract.FromBody reads it.
    if (body.schema_version != null && !(Number.isInteger(body.schema_version) && body.schema_version >= -2147483648 && body.schema_version <= 2147483647))
      throw bad(kind, "schema_version", "must be an integer -2147483648..2147483647");
  }
  if (kind === "layers") {
    // enforce, extensions, params, disciplines, match and format stay in the body; Revit does not read them.
    if (!filled(body.standard)) throw bad(kind, "standard", "must be a non-empty string");
    if (!Array.isArray(body.layers) || !body.layers.length) throw bad(kind, "layers", "must be a non-empty array");
    objects(kind, "layers", body.layers, (l, at) => {
      if (!filled(l.layer)) throw bad(kind, `${at}.layer`, "must be a non-empty string");
      if (!LAYER_CATEGORIES.includes(l.category)) throw bad(kind, `${at}.category`, `must be ${LAYER_CATEGORIES.join(" | ")}`);
      if (l.family != null && typeof l.family !== "string") throw bad(kind, `${at}.family`, "must be a string");
      if (l.aliases != null && !texts(l.aliases)) throw bad(kind, `${at}.aliases`, "must be an array of strings");
    });
    if (body.ignore != null && !texts(body.ignore)) throw bad(kind, "ignore", "must be an array of strings");
  }
  if (kind === "guideline") {
    // What GuidelineMatcher.Resolve dereferences (elements[].rules[].use.family): a gap there is a crash, not a standard.
    if (!filled(body.standard)) throw bad(kind, "standard", "must be a non-empty string");
    if (!Array.isArray(body.elements) || !body.elements.length) throw bad(kind, "elements", "must be a non-empty array");
    objects(kind, "elements", body.elements, (e, at) => {
      if (!filled(e.category)) throw bad(kind, `${at}.category`, "must be a non-empty string");
      objects(kind, `${at}.rules`, e.rules, (r, rat) => {
        if (!isObj(r.when)) throw bad(kind, `${rat}.when`, "must be an object");
        if (!isObj(r.use) || !filled(r.use.family)) throw bad(kind, `${rat}.use.family`, "must be a non-empty string");
      });
      if (e.default != null && !(isObj(e.default) && filled(e.default.family))) throw bad(kind, `${at}.default.family`, "must be a non-empty string");
    });
    if (body.views != null && !Array.isArray(body.views)) throw bad(kind, "views", "must be an array");
    if (body.viewNaming != null && !isObj(body.viewNaming)) throw bad(kind, "viewNaming", "must be an object");
  }
  if (kind === "type_catalog") {
    if (!Array.isArray(body.types) || !body.types.length) throw bad(kind, "types", "must be a non-empty array");
    if (body.types.length > MAX_CATALOG_TYPES) throw bad(kind, "types", `must hold at most ${MAX_CATALOG_TYPES} entries (has ${body.types.length})`);
    objects(kind, "types", body.types, (t, at) => {
      for (const f of ["category", "type"]) if (!filled(t[f])) throw bad(kind, `${at}.${f}`, "must be a non-empty string");
      if (t.family != null && typeof t.family !== "string") throw bad(kind, `${at}.family`, "must be a string");
      if (t.system != null && typeof t.system !== "boolean") throw bad(kind, `${at}.system`, "must be true or false");
      for (const f of ["width_mm", "height_mm"]) if (t[f] != null && !Number.isFinite(t[f])) throw bad(kind, `${at}.${f}`, "must be a number or null");
    });
    // The harvest's top-level `source` travels as `template`: the PUT route lifts a top-level source into the pointer.
    if (body.template != null) {
      if (!isObj(body.template)) throw bad(kind, "template", "must be an object {title, path?, extracted_at?} (the harvest's source, renamed)");
      if (!filled(body.template.title)) throw bad(kind, "template.title", "must be a non-empty string");
      for (const f of ["path", "extracted_at"]) if (body.template[f] != null && typeof body.template[f] !== "string") throw bad(kind, `template.${f}`, "must be a string");
    }
    if (body.view_templates != null && !Array.isArray(body.view_templates)) throw bad(kind, "view_templates", "must be an array");
  }
  if (kind === "publish") {
    // The lead's auto-publish policy (cohesion phase 5, spec Decision 2): exactly {auto: boolean}; none installed = auto
    // off. A stray key is refused, not kept: a reader that skipped it would publish by a policy nobody can see.
    const stray = Object.keys(body).find((k) => k !== "auto");
    if (stray !== undefined) throw bad(kind, stray, "is not a publish field — the body is exactly {auto: true} or {auto: false}");
    if (typeof body.auto !== "boolean") throw bad(kind, "auto", "must be true or false");
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
 * bridge_docs artefact rows are bridge-only since migration 0030, but a document rewritten with the service
 * key must still show up as a different hash on every later verdict, and a pointer that disagrees is flagged.
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

/**
 * The answer of GET /cde/:key/artefacts/:kind (spec 2026-09-25 decision 2). 200 carries an ETag naming ref,
 * source and sha (source inside: the same body moving from office to project is a change); an If-None-Match
 * equal to it is a 304 with no body; a 404 says why — not_installed | no_project | unknown_kind — so a client
 * never reads a wrong key as "nothing installed". Returns { status, body?, etag? }; other errors (403) throw.
 */
export async function artefactReply(key, kind, ifNoneMatch, deps) {
  if (!KINDS.includes(kind)) return { status: 404, body: { message: `unknown artefact kind '${kind}' (expected one of ${KINDS.join(", ")})`, reason: "unknown_kind" } };
  let a;
  try { a = await resolveArtefact(key, kind, deps); }
  catch (e) { if (e?.status === 404) return { status: 404, body: { message: String(e.message), reason: "no_project" } }; throw e; }
  if (a.source === "none") return { status: 404, body: { message: `no ${kind} artefact installed for ${key} or its office (PUT /cde/${key}/artefacts/${kind})`, reason: "not_installed" } };
  const etag = `"${a.ref}:${a.source}:${a.sha256}"`;
  // ponytail: exact match only (one ETag, no list, no W/ or *) — the add-in sends back what it was given.
  if (ifNoneMatch === etag) return { status: 304, etag };
  return { status: 200, etag, body: { kind, version: Number(a.ref.split("@")[1]), ...a } };
}

/** What judged, in one line for a verdict row, evidence line, scan header or CLI: "naming@2 · office · 3f0737600a1b…"; "none" when nothing is installed. */
export const refLabel = ({ ref, source, sha256: sha } = {}) => [ref, source, sha && `${sha.slice(0, 12)}…`].filter(Boolean).join(" · ") || "none";

/**
 * The contract that judges `key` (Governed Intake; spec 2026-09-25 4b decision 6): the project's contract@n →
 * its office's → none, as resolveArtefact. The body is re-checked with the install validator, so one installed
 * before the validator existed (any object was accepted) is none with its reason — never a partial contract.
 * `label` is what every surface prints: "contract@1 · office · 3f0737600a1b…" or "none — <reason>".
 */
export async function resolveContract(key, deps) {
  const a = await resolveArtefact(key, "contract", deps);
  const none = (reason) => ({ body: null, ref: null, source: null, sha256: null, label: `none — ${reason}`, reason });
  if (a.source === "none") return none(`not installed for ${key} or its office`);
  try { validateArtefact("contract", a.body); } catch (e) { return none(`${refLabel(a)} did not parse: ${e.message}`); }
  return { body: a.body, ref: a.ref, source: a.source, sha256: a.sha256, label: refLabel(a), reason: null };
}

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
