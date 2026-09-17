// Office intake — what the Revit add-in sends about an OFFICE (not a project): the standards pack +
// type catalogue harvested from the office template ("snapshot"), and scan reports of a live model.
// Both land in bridge_docs, latest wins, and each receipt is an audit row — the readiness checks read
// them (office.*). Validation is pure and names the offending field; nothing partial is ever stored.
import { ensureProject, docUpsert, docGet, audit } from "./cde-store.mjs";
import { requireMinRole } from "./members-store.mjs";
import { resolveActor } from "./bridge-auth.mjs";

export const SNAPSHOT_STORE = "office_snapshot";
export const SCAN_STORE = "office_scan";
export const LATEST = "latest";
export const MAX_CATALOG_TYPES = 20000;
export const MAX_SCAN_VIOLATIONS = 5000;
const MODES = ["monitor", "warn", "request", "block"];
const SOURCE_KINDS = ["template", "model"];

const err = (status, message) => Object.assign(new Error(message), { status });
const str = (v, field, { max = 500, optional = false } = {}) => {
  if (v === undefined || v === null) { if (optional) return ""; throw err(400, `${field} is required`); }
  if (typeof v !== "string") throw err(400, `${field} must be a string`);
  const t = v.trim();
  if (!t && !optional) throw err(400, `${field} is required`);
  if (t.length > max) throw err(400, `${field} too long (limit ${max})`);
  return t;
};
const isoTs = (v, field) => {
  const t = str(v, field);
  if (Number.isNaN(new Date(t).getTime())) throw err(400, `${field} must be an ISO timestamp`);
  return new Date(t).toISOString();
};
const arr = (v, field) => { if (!Array.isArray(v)) throw err(400, `${field} must be an array`); return v; };
const obj = (v, field) => { if (!v || typeof v !== "object" || Array.isArray(v)) throw err(400, `${field} must be an object`); return v; };

/** Validate + normalise a snapshot body. Pure. */
export function validateSnapshot(body) {
  const b = obj(body, "body");
  const source = obj(b.source, "source");
  const kind = str(source.kind, "source.kind");
  if (!SOURCE_KINDS.includes(kind)) throw err(400, `source.kind must be one of ${SOURCE_KINDS.join(", ")}`);
  const pack = obj(b.pack, "pack");
  const worksets = arr(pack.worksets ?? [], "pack.worksets").map((w, i) => ({ name: str(obj(w, `pack.worksets[${i}]`).name, `pack.worksets[${i}].name`) }));
  const shared = arr(pack.shared_parameters ?? [], "pack.shared_parameters").map((p, i) => ({
    name: str(obj(p, `pack.shared_parameters[${i}]`).name, `pack.shared_parameters[${i}].name`),
    binding: str(p.binding, `pack.shared_parameters[${i}].binding`, { optional: true }) || "instance",
  }));
  const catalog = obj(b.catalog, "catalog");
  const types = arr(catalog.types ?? [], "catalog.types");
  if (types.length > MAX_CATALOG_TYPES) throw err(413, `catalog.types has ${types.length} entries (limit ${MAX_CATALOG_TYPES})`);
  const normTypes = types.map((t, i) => {
    const o = obj(t, `catalog.types[${i}]`);
    const num = (v, f) => (v === undefined || v === null ? null : (typeof v === "number" && Number.isFinite(v) ? v : (() => { throw err(400, `${f} must be a number or null`); })()));
    return {
      category: str(o.category, `catalog.types[${i}].category`),
      family: str(o.family, `catalog.types[${i}].family`, { optional: true }),
      type: str(o.type, `catalog.types[${i}].type`),
      system: !!o.system,
      width_mm: num(o.width_mm, `catalog.types[${i}].width_mm`),
      height_mm: num(o.height_mm, `catalog.types[${i}].height_mm`),
    };
  });
  let ruleset = null;
  if (b.ruleset !== undefined && b.ruleset !== null) {
    const r = obj(b.ruleset, "ruleset");
    ruleset = { org: str(r.org, "ruleset.org", { optional: true }), rules: arr(r.rules ?? [], "ruleset.rules").map((x, i) => obj(x, `ruleset.rules[${i}]`)) };
  }
  return {
    source: { kind, title: str(source.title, "source.title"), revit_version: str(source.revit_version, "source.revit_version", { optional: true }) },
    pack: { worksets, shared_parameters: shared },
    catalog: { count: normTypes.length, types: normTypes },
    ruleset,
    at: isoTs(b.at, "at"),
  };
}

/** Validate + normalise a scan report body. Pure. Violations are capped; the true count and the
 * true per-mode totals (over ALL violations, not just the kept slice) are kept — a scan with more
 * than MAX_SCAN_VIOLATIONS entries must not under-report block/warn counts by truncation. */
export function validateScan(body) {
  const b = obj(body, "body");
  const violations = arr(b.violations ?? [], "violations");
  const by_mode = { monitor: 0, warn: 0, request: 0, block: 0 };
  const kept = violations.map((v, i) => {
    const o = obj(v, `violations[${i}]`);
    const mode = str(o.mode, `violations[${i}].mode`).toLowerCase();
    if (!MODES.includes(mode)) throw err(400, `violations[${i}].mode must be one of ${MODES.join(", ")}`);
    by_mode[mode]++;
    if (i >= MAX_SCAN_VIOLATIONS) return null;
    return {
      rule_id: str(o.rule_id, `violations[${i}].rule_id`, { max: 40 }),
      mode,
      element_id: Number.isInteger(o.element_id) ? o.element_id : -1,
      element_name: str(o.element_name, `violations[${i}].element_name`, { optional: true }),
      message: str(o.message, `violations[${i}].message`, { optional: true, max: 1000 }),
    };
  }).filter((v) => v !== null);
  return {
    doc_title: str(b.doc_title, "doc_title"),
    at: isoTs(b.at, "at"),
    duration_ms: Number.isFinite(b.duration_ms) ? b.duration_ms : 0,
    elements_checked: Number.isInteger(b.elements_checked) ? b.elements_checked : 0,
    violations: kept,
    violations_total: violations.length,
    by_mode,
  };
}

export async function saveSnapshot(key, body, actor) {
  const snap = validateSnapshot(body);                  // 400 before any network call
  await requireMinRole(key, "contributor");
  const proj = await ensureProject(key);
  const stored = { ...snap, received_at: new Date().toISOString(), received_by: resolveActor(actor, "revit") };
  await docUpsert(SNAPSHOT_STORE, proj.id, LATEST, stored);
  // audit_log.entity_id is a uuid: the office IS the project, so the project id is the entity (doc_id "latest" is not a uuid).
  await audit(proj.id, "office", proj.id, "office_snapshot_received", actor || "revit", null,
    { source: stored.source, worksets: stored.pack.worksets.length, shared_parameters: stored.pack.shared_parameters.length, types: stored.catalog.count, org: stored.ruleset?.org ?? null, at: stored.at });
  return { ok: true, received_at: stored.received_at, types: stored.catalog.count, worksets: stored.pack.worksets.length };
}

export async function saveScan(key, body, actor) {
  const scan = validateScan(body);
  await requireMinRole(key, "contributor");
  const proj = await ensureProject(key);
  const stored = { ...scan, received_at: new Date().toISOString(), received_by: resolveActor(actor, "revit") };
  await docUpsert(SCAN_STORE, proj.id, LATEST, stored);
  const byMode = stored.violations.reduce((m, v) => ((m[v.mode] = (m[v.mode] || 0) + 1), m), {});
  await audit(proj.id, "office", proj.id, "office_scan_received", actor || "revit", null,
    { doc_title: stored.doc_title, elements_checked: stored.elements_checked, violations: stored.violations_total, by_mode: byMode, at: stored.at });
  return { ok: true, received_at: stored.received_at, violations: stored.violations_total };
}

export async function getSnapshot(key) { const proj = await ensureProject(key); return (await docGet(SNAPSHOT_STORE, proj.id, LATEST)) ?? null; }
export async function getScan(key) { const proj = await ensureProject(key); return (await docGet(SCAN_STORE, proj.id, LATEST)) ?? null; }
