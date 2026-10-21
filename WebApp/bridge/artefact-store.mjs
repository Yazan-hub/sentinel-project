// Per-project standards as artefacts. Each install is an immutable `<kind>@<n>` document with a sha;
// a pointer document per kind names the version in force. Resolution for a judge is project → office →
// what the client sent → none, and the answer always says which one judged (never a server-wide file:
// the cohesion review of 2026-09-23 found SENTINEL_IDS silently outranking every project, D3).
//
// Deps are injected (the changesets-store idiom) so the sequencing is unit-tested without Supabase;
// the defaults are loaded lazily to keep cde-store → artefact-store → cde-store from being a cycle.
import { canonical, canonicalSha256 as sha256 } from "./canonical.mjs";
import { resolveActor } from "./bridge-auth.mjs";
import { parseLodMatrix } from "./sentinel-core.mjs"; // MA-2b: the one lod_matrix reader (src/sentinel-core/lod-matrix.ts)
import { validatePack } from "./evidence-logic.mjs"; // MA-4a: the evidence_pack validator (pure, no cycle)
import { validateRecipe } from "./recipe-logic.mjs"; // MA-8-13: the recipe validator (pure, no cycle)

export const STORE = "artefact";
export const KINDS = ["ids", "ruleset", "naming", "contract", "guideline", "layers", "type_catalog", "publish", "roi", "review", "carbon_factors", "lod_matrix", "evidence_pack", "ifc_export", "recipe", "protection", "ai_policy"];
// MA-8-6 (P1-11): the data types the Revit 2027 IFC exporter's DefaultUserDefinedParameterSets.txt lists (read on this PC). The add-in
// writes that file's format from an ifc_export body, so a type the exporter does not know never installs. SentinelAddin/Engine/IfcExportMapping.cs mirrors this.
export const IFC_EXPORT_TYPES = ["Acceleration", "AngularVelocity", "Area", "AreaDensity", "Boolean", "ClassificationReference", "ColorTemperature", "Count", "Currency",
  "DynamicViscosity", "ElectricCurrent", "ElectricVoltage", "Energy", "ElectricalEfficacy", "Force", "Frequency", "HeatFluxDensity", "HeatingValue", "Identifier", "Illuminance",
  "Integer", "IonConcentration", "IsothermalMoistureCapacity", "Label", "Length", "LinearForce", "LinearMoment", "LinearStiffness", "LinearVelocity", "Logical", "LuminousFlux",
  "LuminousIntensity", "Mass", "MassDensity", "MassFlowRate", "MassPerLength", "ModulusOfElasticity", "MoistureDiffusivity", "MomentOfInertia", "NormalisedRatio", "Numeric",
  "PlanarForce", "PlaneAngle", "PositiveLength", "PositivePlaneAngle", "PositiveRatio", "Power", "Pressure", "Ratio", "Real", "RotationalFrequency", "SoundPower", "SoundPressure",
  "SpecificHeatCapacity", "Text", "ThermalConductivity", "ThermalExpansionCoefficient", "ThermalResistance", "ThermalTransmittance", "ThermodynamicTemperature", "Time", "Torque",
  "VaporPermeability", "Volume", "VolumetricFlowRate", "WarpingConstant"];
const CARBON_MEASURES = ["count", "length", "area", "volume", "weight"];

const err = (status, message) => Object.assign(new Error(message), { status });
/** Human-error guards §2 (spec 2026-10-21): a write whose If-Match names what the client read, when another write landed first — a 412
 *  in words: "<what> changed by <who> at 2026-10-21 14:02 UTC — reload; nothing was saved". `what` carries its verb ("protection was"). */
export const staleChange = (what, by, iso) => err(412, `${what} changed by ${by || "someone"} at ${iso ? `${String(iso).slice(0, 10)} ${String(iso).slice(11, 16)} UTC` : "a time not recorded"} — reload to see it; nothing was saved`);
/** An If-Match value as sent — the quotes and a weak W/ taken off; null when none was sent. */
export const ifMatchValue = (h) => (h == null || String(h).trim() === "" ? null : String(h).trim().replace(/^W\//, "").replace(/^"(.*)"$/, "$1"));
/** Canonical JSON (keys sorted recursively) and its sha256 live in canonical.mjs, shared with the delivery-gate component. */
export { canonical };

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
export async function officeArtefactAsService(officeKey, kind, version) {
  const { sb } = await import("./cde-store.mjs");
  const rows = await sb(`projects?key=eq.${encodeURIComponent(officeKey)}&select=id`, { service: true });
  const pid = rows?.[0]?.id;
  if (!pid) return null;
  const get = async (docId) => (await sb(`bridge_docs?store=eq.${STORE}&project_id=eq.${pid}&doc_id=eq.${encodeURIComponent(docId)}&select=data`, { service: true }))?.[0]?.data ?? null;
  if (version !== undefined) return get(`${kind}@${version}`); // MA-8-13: one named version (a recipe is run by {version, scope})
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
// SEC-4 (S29): a ruleset's token_defs and exclusions are patterns the add-in and the web compile and match. Bounded here, in
// length and count, and compiled in JS ({org} stands in for the office code) — so one that would not compile never installs.
const MAX_PATTERN = 512, MAX_PATTERNS = 64;
// SEC-5: a layer ignore glob becomes ".*" per "*" (sentinel-core layers.ts globToRegex) — its stars are bounded
// too: at most 3 (the repository's globs hold 2 at most).
const MAX_STARS = 3;
function rulePattern(kind, path, p) {
  if (typeof p !== "string") throw bad(kind, path, "must be a string");
  if (p.length > MAX_PATTERN) throw bad(kind, path, `is longer than ${MAX_PATTERN} characters`);
  try { new RegExp(p.split("{org}").join("ORG")); }
  catch (e) { throw bad(kind, path, `does not compile as a pattern (${e.message}) — write it without .NET-only syntax such as a leading (?i)`); }
}

// Contract, layers, guideline, type catalogue (spec 2026-09-25 4b decision 4): what their judges read, nothing
// more. Every contract field is required — neither delivery gate fills a default, so Revit and intake read one
// contract one way. "Optional" means absent or null. The loaders in Revit repeat these checks on what they receive.
const IFC_SCHEMAS = ["IFC2X3", "IFC4"];                                  // what PlatformExporter can write
const ROI_FIELDS = ["currency", "hourly_rate", "minutes", "basis"];       // the roi body (spec 2026-09-26 Decision 9)
const ROI_KINDS = ["delivery_gate", "naming", "family_heal"];             // the ledger rows the ROI dashboard counts
const REVIEW_STEP = ["name", "role", "approvals"];                       // a review step (spec 2026-09-27 Decision 10)
const REVIEW_ROLES = ["contributor", "lead", "owner"];                    // the least role an approver of the step holds
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
    // SEC-5 (S29): the class each specification applies to and each facet's pattern are compiled by the IDS validator.
    body.specifications.forEach((s, i) => {
      const at = `specifications[${i}]`;
      if (!isObj(s)) throw bad(kind, at, "must be an object");
      // An entity pattern JS cannot compile applies to nothing, in the web and in Revit alike (MA-2c review C23): bounded, not compiled.
      const ent = s.applicability?.entity;
      if (ent != null && (typeof ent !== "string" || ent.length > MAX_PATTERN)) throw bad(kind, `${at}.applicability.entity`, `must be a string of at most ${MAX_PATTERN} characters`);
      for (const f of ["properties", "attributes"]) {
        const list = s.requirements?.[f];
        if (Array.isArray(list)) list.forEach((x, j) => { if (x?.pattern != null) rulePattern(kind, `${at}.requirements.${f}[${j}].pattern`, x.pattern); });
      }
    });
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
      if (r.token_defs !== undefined) {
        if (!r.token_defs || typeof r.token_defs !== "object" || Array.isArray(r.token_defs)) throw bad(kind, `${at}.token_defs`, "must be an object of patterns");
        const defs = Object.entries(r.token_defs);
        if (defs.length > MAX_PATTERNS) throw bad(kind, `${at}.token_defs`, `holds more than ${MAX_PATTERNS} patterns`);
        for (const [t, p] of defs) rulePattern(kind, `${at}.token_defs.${t}`, p);
      }
      if (r.exclusions !== undefined) {
        if (!Array.isArray(r.exclusions)) throw bad(kind, `${at}.exclusions`, "must be a list of patterns");
        if (r.exclusions.length > MAX_PATTERNS) throw bad(kind, `${at}.exclusions`, `holds more than ${MAX_PATTERNS} patterns`);
        r.exclusions.forEach((p, j) => rulePattern(kind, `${at}.exclusions[${j}]`, p));
      }
    });
  }
  if (kind === "naming") {
    standardHead(kind, body);
    if (!filled(body.title)) throw bad(kind, "title", "must be a non-empty string");
    if (typeof body.separator !== "string" || body.separator.length !== 1) throw bad(kind, "separator", "must be one character");
    if (!Array.isArray(body.fields) || !body.fields.length) throw bad(kind, "fields", "must be a non-empty array");
    if (body.fields.length > MAX_PATTERNS) throw bad(kind, "fields", `holds more than ${MAX_PATTERNS} fields`);
    body.fields.forEach((f, i) => {
      const at = `fields[${i}]`;
      if (!f || typeof f !== "object") throw bad(kind, at, "must be an object");
      if (!filled(f.key)) throw bad(kind, `${at}.key`, "must be a non-empty string");
      if (!filled(f.label)) throw bad(kind, `${at}.label`, "must be a non-empty string");
      if (!filled(f.pattern) && !(Array.isArray(f.enum) && f.enum.length)) throw bad(kind, at, "needs a pattern or a non-empty enum[]");
      if (f.pattern != null) rulePattern(kind, `${at}.pattern`, f.pattern); // SEC-5: the naming judges compile it
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
    // GATE-E2: the share of a class's elements that must carry each required pset and property; absent or null is 1.
    if (body.min_coverage != null && !(typeof body.min_coverage === "number" && body.min_coverage >= 0 && body.min_coverage <= 1))
      throw bad(kind, "min_coverage", "must be a number 0..1");
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
    const globs = (path, v) => {
      if (!texts(v)) throw bad(kind, path, "must be an array of strings");
      if (v.length > MAX_PATTERNS) throw bad(kind, path, `holds more than ${MAX_PATTERNS} globs`);
      v.forEach((g, i) => {
        if (g.length > MAX_PATTERN) throw bad(kind, `${path}[${i}]`, `is longer than ${MAX_PATTERN} characters`);
        if (g.split("*").length - 1 > MAX_STARS) throw bad(kind, `${path}[${i}]`, `holds more than ${MAX_STARS} * wildcards`);
      });
    };
    if (body.ignore != null) globs("ignore", body.ignore);
    // MA-5b-7 (DAT-1): where Datum from Drawings reads levels and grids — layer globs as ignore's, the grid letters it skips, the
    // merge tolerances. Checked alike by sentinel-core layers.ts and the add-in's LayerRulesetMatcher.
    if (body.datum != null) {
      const d = body.datum;
      if (!isObj(d)) throw bad(kind, "datum", "must be an object");
      for (const k of ["levels", "grids"]) if (d[k] != null) globs(`datum.${k}`, d[k]);
      if (!d.levels?.length && !d.grids?.length) throw bad(kind, "datum", "must name level or grid layers (datum.levels or datum.grids)");
      if (d.skip_letters != null && !(texts(d.skip_letters) && d.skip_letters.every((s) => /^[A-Z]$/.test(s))))
        throw bad(kind, "datum.skip_letters", "must be an array of single capital letters A-Z");
      for (const k of ["level_merge_mm", "grid_merge_mm"])
        if (d[k] != null && !(typeof d[k] === "number" && d[k] >= 1 && d[k] <= 1000)) throw bad(kind, `datum.${k}`, "must be a number of millimetres 1..1000");
    }
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
        // MA-2a: a rule that states no condition would match every element the bridge types. Refused at install only, as the
        // strictest of the three validators (review C12): guideline.ts validateGuideline refuses only `when: {}`, the add-in's
        // CheckGuideline neither — it reads an installed body as it is.
        if (!["layer", "level", "discipline"].some((f) => filled(r.when[f])) && !(isObj(r.when.params) && Object.keys(r.when.params).length))
          throw bad(kind, `${rat}.when`, "names no condition (layer, level, discipline or params) — it would match every element; use default");
        // A when field present but blank (null, "") is a stated condition to guideline.ts matches() and a wildcard to the add-in's
        // Matches: one installed rule, two answers. A params name or value that is not a non-empty string: a number threw in the
        // bridge typer (a 500 with no words) and made the add-in read the whole guideline as none; null or "" matched every element
        // carrying the parameter (review of MA-2a, C19).
        for (const f of ["layer", "level", "discipline"])
          if (f in r.when && !filled(r.when[f])) throw bad(kind, `${rat}.when.${f}`, "is present but blank — leave it out or name it");
        if (isObj(r.when.params))
          for (const [k, v] of Object.entries(r.when.params))
            if (!filled(k) || !filled(v)) throw bad(kind, `${rat}.when.params.${k}`, "must be a non-empty string, name and value (the value is matched by substring)");
      });
      if (e.default != null && !(isObj(e.default) && filled(e.default.family))) throw bad(kind, `${at}.default.family`, "must be a non-empty string");
      // MA-8-10: a Stairs element names the office's stair type and its run width in every rule and the default. Checked by
      // GuidelineMatcher.CheckGuideline in the same words (tools/promote-check runs both against fixtures/guideline-stairs/cases.json).
      if (String(e.category).trim().toLowerCase() === "stairs") {
        const stairUse = (u, uat) => {
          if (!filled(u.type)) throw bad(kind, `${uat}.type`, "must be a non-empty string — the office's stair type");
          const w = isObj(u.params) ? u.params.width_mm : undefined;
          if (!(typeof w === "number" && Number.isFinite(w) && w >= 300 && w <= 5000)) throw bad(kind, `${uat}.params.width_mm`, "must be a number of millimetres from 300 to 5000 — the stair's run width");
        };
        e.rules.forEach((r, j) => stairUse(r.use, `${at}.rules[${j}].use`));
        if (e.default != null) stairUse(e.default, `${at}.default`);
      }
    });
    if (body.views != null && !Array.isArray(body.views)) throw bad(kind, "views", "must be an array");
    if (body.viewNaming != null && !isObj(body.viewNaming)) throw bad(kind, "viewNaming", "must be an object");
    // MA-8-12 (ANV-4): the sheets block — the title block, the sheet number and name patterns Annotate fills for one level. Checked
    // by GuidelineMatcher.CheckGuideline in the same words (tools/annotate-check runs both against fixtures/guideline-sheets/cases.json).
    if (body.sheets != null) {
      const sh = body.sheets;
      if (!isObj(sh)) throw bad(kind, "sheets", "must be an object");
      const extra = Object.keys(sh).find((k) => k !== "titleBlock" && k !== "number" && k !== "name");
      if (extra !== undefined) throw bad(kind, `sheets.${extra}`, "is not a sheets field (titleBlock, number, name)");
      for (const [f, max] of [["titleBlock", 256], ["number", 128], ["name", 128]]) {
        if (!filled(sh[f])) throw bad(kind, `sheets.${f}`, "must be a non-empty string");
        if (/[\r\n]/.test(sh[f])) throw bad(kind, `sheets.${f}`, "must be one line");
        if (sh[f].length > max) throw bad(kind, `sheets.${f}`, `must be at most ${max} characters`);
        if (f === "titleBlock") {
          const at = sh[f].indexOf(" : ");
          if (at < 0 || !filled(sh[f].slice(0, at)) || !filled(sh[f].slice(at + 3))) throw bad(kind, "sheets.titleBlock", 'must be "Family : Type"');
        } else {
          const token = [...sh[f].matchAll(/\{([^{}]*)\}/g)].map((m) => m[0]).find((t) => !["{level}", "{use}", "{prefix}", "{n}"].includes(t));
          if (token !== undefined) throw bad(kind, `sheets.${f}`, `holds ${token}, which is not a sheet token ({level}, {use}, {prefix}, {n})`);
        }
      }
      if (!sh.number.includes("{level}")) throw bad(kind, "sheets.number", "must hold {level}");
    }
    // MA-1a item 6: where a placed element goes — the workset its category names, and the phase. Optional; a block the
    // add-in could not read as written is a 400 here (GuidelineMatcher.CheckGuideline refuses the same, in the same words).
    // No design-option field: Sentinel never places into a design option, whatever a guideline says.
    if (body.placement != null) {
      const p = body.placement;
      if (!isObj(p)) throw bad(kind, "placement", "must be an object");
      const extra = Object.keys(p).find((k) => k !== "worksets" && k !== "phase");
      if (extra !== undefined) throw bad(kind, `placement.${extra}`, "is not a placement field (worksets, phase)");
      if (p.worksets != null) {
        if (!isObj(p.worksets)) throw bad(kind, "placement.worksets", "must be an object of category: workset name");
        // Review amendment C8: a key is a category Sentinel places (GuidelineMatcher.PlacementCategories, the same list),
        // named once — case and padding ignored. A misspelt key would install and then leave every element of that
        // category on the active workset.
        const categories = ["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows", "Columns", "Furniture", "Levels", "Grids", "Structural Framing"]; // MA-6-3: a beam's
        const named = new Set();
        for (const [category, name] of Object.entries(p.worksets)) {
          // A byte-order mark is padding to JavaScript's trim() and a character to .NET's Trim(): refused here, as the add-in
          // refuses it, so a pasted key never installs and then stops every placement.
          const canon = category.includes("\uFEFF") ? undefined : categories.find((c) => c.toLowerCase() === category.trim().toLowerCase());
          if (!canon) throw bad(kind, `placement.worksets.${category}`, `is not a category Sentinel places (${categories.join(", ")})`);
          if (named.has(canon)) throw bad(kind, `placement.worksets.${category}`, `names the category ${canon} a second time`);
          named.add(canon);
          if (!filled(name)) throw bad(kind, `placement.worksets.${category}`, "must be a non-empty workset name");
        }
      }
      if (p.phase != null && p.phase !== "view") throw bad(kind, "placement.phase", 'must be "view" (the phase of the view the person builds in)');
    }
  }
  if (kind === "type_catalog") {
    if (!Array.isArray(body.types) || !body.types.length) throw bad(kind, "types", "must be a non-empty array");
    if (body.types.length > MAX_CATALOG_TYPES) throw bad(kind, "types", `must hold at most ${MAX_CATALOG_TYPES} entries (has ${body.types.length})`);
    objects(kind, "types", body.types, (t, at) => {
      for (const f of ["category", "type"]) if (!filled(t[f])) throw bad(kind, `${at}.${f}`, "must be a non-empty string");
      if (t.family != null && typeof t.family !== "string") throw bad(kind, `${at}.family`, "must be a string");
      if (t.system != null && typeof t.system !== "boolean") throw bad(kind, `${at}.system`, "must be true or false");
      for (const f of ["width_mm", "height_mm"]) if (t[f] != null && !Number.isFinite(t[f])) throw bad(kind, `${at}.${f}`, "must be a number or null");
      // MA-2a (BOS-5): the row's BuiltInCategory, as Build Office System writes it since MA-2a; a type_catalog@1 without it still installs.
      if (t.bic != null && typeof t.bic !== "string") throw bad(kind, `${at}.bic`, "must be a string (a BuiltInCategory name)");
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
  if (kind === "protection") {
    // Roadmap item 1, slice B: what no changeset may edit in Revit — the add-in keeps such a row as it stands and says why. Every field is
    // required, so a policy says what it protects in full (the add-in's built-in default applies only when none is installed or read).
    const stray = Object.keys(body).find((k) => !["categories", "worksets", "structural_hosts"].includes(k));
    if (stray !== undefined) throw bad(kind, stray, "is not a protection field — the body is {categories, worksets, structural_hosts}");
    if (!Array.isArray(body.categories)) throw bad(kind, "categories", "must be a list (empty protects no category)");
    body.categories.forEach((c, i) => { if (typeof c !== "string" || !/^OST_[A-Za-z]+$/.test(c)) throw bad(kind, `categories[${i}]`, "must be a Revit category name such as OST_Levels"); });
    if (!Array.isArray(body.worksets)) throw bad(kind, "worksets", "must be a list (empty protects no workset)");
    body.worksets.forEach((w, i) => { if (typeof w !== "string" || !w.trim() || w.length > 120) throw bad(kind, `worksets[${i}]`, "must be a workset name or pattern (* matches any run of characters) of 1 to 120 characters"); });
    if (typeof body.structural_hosts !== "boolean") throw bad(kind, "structural_hosts", "must be true or false");
  }
  if (kind === "ai_policy") {
    // AI privacy (spec 2026-10-20): an office's or project's two switches, read by ai-policy.mjs (office OR project). Exactly
    // two booleans: a stray key is refused, not kept — a reader that skipped it would enforce a policy nobody can see.
    const stray = Object.keys(body).find((k) => k !== "local_only" && k !== "redact");
    if (stray !== undefined) throw bad(kind, stray, "is not an AI policy field — the body is exactly {local_only, redact}");
    for (const k of ["local_only", "redact"]) if (typeof body[k] !== "boolean") throw bad(kind, k, "must be true or false");
  }
  if (kind === "carbon_factors") {
    // The project's embodied-carbon factors (item 6, 6D): what every carbon figure multiplies by, and named on it —
    // installed like any standard (versioned, sha'd, on the ledger), resolved project → office.
    const stray = Object.keys(body).find((k) => !["label", "unit_label", "factors"].includes(k));
    if (stray !== undefined) throw bad(kind, stray, "is not a carbon_factors field — the body is {label, unit_label?, factors}");
    if (typeof body.label !== "string" || !body.label.trim() || body.label.length > 300) throw bad(kind, "label", "must name the factors' source (EPD, EC3, ICE …) in 1 to 300 characters");
    if (body.unit_label !== undefined && typeof body.unit_label !== "string") throw bad(kind, "unit_label", "must be a string");
    if (!Array.isArray(body.factors) || !body.factors.length) throw bad(kind, "factors", "needs at least one {match, measure, unit, factor}");
    body.factors.forEach((f, i) => {
      if (!isObj(f)) throw bad(kind, `factors[${i}]`, "must be an object {match, measure, unit, factor}");
      if (typeof f.match !== "string" || !f.match.trim()) throw bad(kind, `factors[${i}].match`, "must name an IFC category or category:type");
      if (!CARBON_MEASURES.includes(f.measure)) throw bad(kind, `factors[${i}].measure`, `must be one of ${CARBON_MEASURES.join(", ")}`);
      if (typeof f.unit !== "string") throw bad(kind, `factors[${i}].unit`, "must be a string (m³, m², …)");
      if (typeof f.factor !== "number" || !Number.isFinite(f.factor) || f.factor < 0) throw bad(kind, `factors[${i}].factor`, "must be a number ≥ 0 (kgCO₂e per unit)");
    });
  }
  if (kind === "roi") {
    // The office's rate card (cohesion phase 5c, spec Decision 9): what the Revit ROI dashboard multiplies the ledger's
    // counts by — minutes saved per delivery gate run, per naming rename, per family heal, at hourly_rate in currency.
    // Any other key at either level is refused, not kept: money would then rest on a number no reader shows.
    const stray = Object.keys(body).find((k) => !ROI_FIELDS.includes(k));
    if (stray !== undefined) throw bad(kind, stray, "is not a roi field — the body is {currency, hourly_rate, minutes, basis?}");
    if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) throw bad(kind, "currency", "must be three capital letters, e.g. EUR");
    if (typeof body.hourly_rate !== "number" || !Number.isFinite(body.hourly_rate) || body.hourly_rate <= 0) throw bad(kind, "hourly_rate", "must be a number greater than 0");
    if (!isObj(body.minutes)) throw bad(kind, "minutes", "must be an object {delivery_gate?, naming?, family_heal?}");
    const strayKind = Object.keys(body.minutes).find((k) => !ROI_KINDS.includes(k));
    if (strayKind !== undefined) throw bad(kind, `minutes.${strayKind}`, "is not a counted kind — the ledger counts delivery_gate, naming and family_heal only");
    if (!Object.keys(body.minutes).length) throw bad(kind, "minutes", "needs at least one of delivery_gate, naming, family_heal");
    for (const k of ROI_KINDS) if (body.minutes[k] !== undefined && !(typeof body.minutes[k] === "number" && Number.isFinite(body.minutes[k]) && body.minutes[k] >= 0)) throw bad(kind, `minutes.${k}`, "must be a number ≥ 0");
    if (body.basis != null && !(typeof body.basis === "string" && body.basis.length <= 500)) throw bad(kind, "basis", "must be a string of at most 500 characters");
  }
  if (kind === "review") {
    // The review chain's template (phase 6b, spec 2026-09-27 Decision 10): exactly {steps}, 0-6 steps, each exactly {name,
    // role, approvals}. The database reads it (review_template, migration 0032) and a chain snapshots it at the share, so
    // a key it would not read is refused, not kept. steps [] is no chain: a project's own review@n with no steps turns
    // its office's off. approvals: the distinct people the step needs, which is how a step runs in parallel.
    const stray = Object.keys(body).find((k) => k !== "steps");
    if (stray !== undefined) throw bad(kind, stray, "is not a review field — the body is exactly {steps: [{name, role, approvals}]}");
    if (!Array.isArray(body.steps) || body.steps.length > 6) throw bad(kind, "steps", "must be an array of 0 to 6 steps");
    objects(kind, "steps", body.steps, (s, at) => {
      const strayStep = Object.keys(s).find((k) => !REVIEW_STEP.includes(k));
      if (strayStep !== undefined) throw bad(kind, `${at}.${strayStep}`, "is not a step field — a step is exactly {name, role, approvals}");
      if (!filled(s.name) || s.name.length > 80) throw bad(kind, `${at}.name`, "must be a non-empty string of at most 80 characters");
      if (!REVIEW_ROLES.includes(s.role)) throw bad(kind, `${at}.role`, "must be contributor, lead or owner");
      if (!(Number.isInteger(s.approvals) && s.approvals >= 1 && s.approvals <= 5)) throw bad(kind, `${at}.approvals`, "must be an integer 1..5");
    });
  }
  if (kind === "lod_matrix") {
    // The office's LOD matrix (Promote v1, MA-2b): per class, what DD means, the stage map (D18) and the snap (D16). One reader,
    // sentinel-core's parseLodMatrix (bundled); the add-in's LodMatrix.FromBody is its twin (fixtures/lod-matrix/cases.json).
    try { parseLodMatrix(body); } catch (e) { throw err(400, `lod_matrix: ${e.message}`); }
  }
  if (kind === "evidence_pack") {
    // MA-4a (design §6.2): the manifest only — the files stay in the project's evidence folder. Every write is the bridge's own fold.
    validatePack(body);
  }
  if (kind === "recipe") validateRecipe(body); // MA-8-13
  if (kind === "ifc_export") {
    // MA-8-6 (P1-11): the office's property-set mapping for the IFC export. The add-in writes the exporter's tab-separated file from it at export
    // time, so a tab, CR or LF in any name would add psets to that file: refused here, as IfcExportMapping.cs refuses it.
    const stray = Object.keys(body).find((k) => !["label", "psets", "common_psets", "export_as"].includes(k));
    if (stray !== undefined) throw bad(kind, stray, "is not an ifc_export field — the body is {label, psets, common_psets?, export_as?}");
    if (!filled(body.label) || body.label.length > 300) throw bad(kind, "label", "must be 1 to 300 characters");
    if (body.common_psets != null && typeof body.common_psets !== "boolean") throw bad(kind, "common_psets", "must be true or false");
    // export_as (2026-10-21): the IFC class a Revit family's types export as. The add-in writes Revit's own "Export Type to IFC As" (and "Type IFC
    // Predefined Type") inside the export's rolled-back transaction, so the model is never changed. A row is {family, type?, ifc_class, predefined_type?}.
    if (body.export_as != null && (!Array.isArray(body.export_as) || body.export_as.length > 256)) throw bad(kind, "export_as", "must be an array of at most 256 rows");
    const exportAs = body.export_as ?? [];
    const line = (v) => typeof v === "string" && filled(v) && v.length <= 256 && !/[\t\r\n]/.test(v);
    const rowKeys = new Set();
    objects(kind, "export_as", exportAs, (r, at) => {
      const strayR = Object.keys(r).find((k) => !["family", "type", "ifc_class", "predefined_type"].includes(k));
      if (strayR !== undefined) throw bad(kind, `${at}.${strayR}`, "is not an export_as field — a row is exactly {family, type?, ifc_class, predefined_type?}");
      if (!line(r.family)) throw bad(kind, `${at}.family`, "must be one line of 1 to 256 characters with no tab or line break");
      if (r.type != null && !line(r.type)) throw bad(kind, `${at}.type`, "must be one line of 1 to 256 characters with no tab or line break, or left out (every type of the family)");
      if (typeof r.ifc_class !== "string" || !/^Ifc[A-Z][A-Za-z0-9]*$/.test(r.ifc_class)) throw bad(kind, `${at}.ifc_class`, "must be an IFC class in the exporter's spelling (IfcMember, not IFCMEMBER)");
      if (r.predefined_type != null && !(typeof r.predefined_type === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(r.predefined_type)))
        throw bad(kind, `${at}.predefined_type`, "must be an IFC predefined type in capitals (MULLION, USERDEFINED), or left out");
      const k = `${r.family.toLowerCase()}\t${(r.type ?? "").toLowerCase()}`;
      if (rowKeys.has(k)) throw bad(kind, at, "repeats another row's family and type — each family (and type) is mapped once (compared without case)");
      rowKeys.add(k);
    });
    if (!Array.isArray(body.psets) || (!body.psets.length && !exportAs.length) || body.psets.length > 64) throw bad(kind, "psets", "must be an array of 1 to 64 property sets");
    const setNames = new Set();
    objects(kind, "psets", body.psets, (ps, at) => {
      const strayPs = Object.keys(ps).find((k) => !["name", "level", "classes", "properties"].includes(k));
      if (strayPs !== undefined) throw bad(kind, `${at}.${strayPs}`, "is not a property-set field — a set is exactly {name, level, classes, properties}");
      if (typeof ps.name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(ps.name)) throw bad(kind, `${at}.name`, "must be letters, digits and _ only, starting with a letter, up to 64 characters");
      if (setNames.has(ps.name.toLowerCase())) throw bad(kind, `${at}.name`, "repeats another property set's name — each set name is used once (compared without case)");
      setNames.add(ps.name.toLowerCase());
      if (ps.level !== "instance" && ps.level !== "type") throw bad(kind, `${at}.level`, 'must be "instance" or "type"');
      if (!Array.isArray(ps.classes) || !ps.classes.length || ps.classes.length > 32 || !ps.classes.every((c) => typeof c === "string" && /^Ifc[A-Z][A-Za-z0-9]*$/.test(c)))
        throw bad(kind, `${at}.classes`, "must be 1 to 32 IFC classes in the exporter's spelling (IfcWall, not IFCWALL)");
      if (!Array.isArray(ps.properties) || !ps.properties.length || ps.properties.length > 64) throw bad(kind, `${at}.properties`, "must be an array of 1 to 64 properties");
      const propNames = new Set();
      objects(kind, `${at}.properties`, ps.properties, (pr, pat) => {
        const strayPr = Object.keys(pr).find((k) => !["name", "type", "revit_parameter"].includes(k));
        if (strayPr !== undefined) throw bad(kind, `${pat}.${strayPr}`, "is not a property field — a property is exactly {name, type, revit_parameter?}");
        if (typeof pr.name !== "string" || !/^[A-Za-z][A-Za-z0-9_ ]{0,63}$/.test(pr.name)) throw bad(kind, `${pat}.name`, "must be letters, digits, _ and spaces only, starting with a letter, up to 64 characters");
        if (propNames.has(pr.name.toLowerCase())) throw bad(kind, `${pat}.name`, "repeats another property in this set — each property name is used once per set (compared without case)");
        propNames.add(pr.name.toLowerCase());
        if (!IFC_EXPORT_TYPES.includes(pr.type)) throw bad(kind, `${pat}.type`, `must be a data type the Revit IFC exporter knows (Text, Label, Boolean, Integer, Real, Length …)`);
        if (pr.revit_parameter != null && !(typeof pr.revit_parameter === "string" && pr.revit_parameter.length >= 1 && pr.revit_parameter.length <= 256 && !/[\t\r\n]/.test(pr.revit_parameter)))
          throw bad(kind, `${pat}.revit_parameter`, "must be one line of 1 to 256 characters with no tab or line break");
      });
    });
  }
  return true;
}

/** The standards a pack installs (Packs ▸ Install: the ruleset, then each of these it carries). */
export const PACK_KINDS = ["naming", "ids", "layers", "contract"];
/** Each standard a pack carries through its kind's validator, as an install would: null, or the first refusal's words.
 *  The registry takes no pack its install would refuse (a broken offer — the July stub bds-house@1.4.1 was one). */
export function packRefusal(pack) {
  try {
    validateArtefact("ruleset", pack?.ruleset);
    for (const kind of PACK_KINDS) if (pack?.[kind]) validateArtefact(kind, pack[kind]);
    return null;
  } catch (e) { return e?.message || String(e); }
}

// SEC-4: a contract installs under a plain name — the rule the delivery-gate component (1.0.7) reads a mirrored contract by,
// so a contract Sentinel installs is never "Not checked" on the platform for its name. Install only: a contract installed
// before this rule still judges intake and Revit (resolveContract reads it through validateArtefact).
const PLAIN_NAME = /^[A-Za-z0-9._@-]{1,100}$/;

// MA-4a: two writes of one kind at once meet docInsert's create-only kind@n (the database's 409, or a test double's).
const RACE = (kind) => `another change to ${kind} landed at the same moment — read it again and retry; nothing was saved`;
const PROJECT_ONLY = ["evidence_pack", "recipe"]; // MA-4a: a project never inherits its office's evidence

/** kind@n+1, the pointer and the artefact_installed row — putArtefact's and foldArtefact's one writer. */
async function installVersion(d, proj, kind, body, prev, { actor, source }) {
  const version = (prev?.version || 0) + 1;
  const pointer = {
    kind, version, sha256: sha256(body),
    // Shown in Settings as who installed the standard, and carried into the ledger row's new_value: the signed-in lead's
    // verified identity, never ?actor or body.installed_by (cde-13). The machine credential keeps its label.
    installed_by: resolveActor(actor, "web"), installed_at: new Date().toISOString(),
    source: source && typeof source === "object" ? source : null,
  };
  try { await d.docInsert(STORE, proj.id, `${kind}@${version}`, { ...pointer, body }); }
  catch (e) { if (e?.status === 409 || e?.body?.code === "23505") throw err(409, RACE(kind)); throw e; }
  await d.docUpsert(STORE, proj.id, kind, pointer);
  // AI privacy: the ledger row of a switch says what was switched (two booleans), not only its hash.
  await d.audit(proj.id, "artefact", null, `artefact_installed ${kind}@${version}`, pointer.installed_by, prev, kind === "ai_policy" ? { ...pointer, body } : pointer);
  return pointer;
}

export async function putArtefact(key, kind, body, { actor, source, ifMatch } = {}, deps) {
  // MA-4a spec amendment S1: an evidence pack's items carry the bridge's hashes and attestations, so it changes only through the
  // evidence routes (evidence-store.mjs → foldArtefact) — never a hand PUT, a lead's included.
  if (kind === "evidence_pack") throw err(400, "evidence packs change only through the evidence routes; nothing was saved");
  // MA-8-13 (D13): a recipe's body is a verified run's and its approvals are the bridge's rows — it changes only through the recipe routes.
  if (kind === "recipe") throw err(400, "recipes change only through the recipe routes (draft, approve) — nothing was saved");
  validateArtefact(kind, body);
  if (kind === "contract" && !PLAIN_NAME.test(body.contract_key))
    throw bad(kind, "contract_key", "must be a plain name (letters, digits, . _ @ -), up to 100 characters");
  // MA-8-2: FG-07 reads tolerance_mm. Install only (as PLAIN_NAME): a contract installed before the bridge read it may hold any value and must
  // still judge intake; FG-07 alone says "not set" for a value outside the range. The delivery gates and Revit ignore it.
  if (kind === "contract" && body.tolerance_mm != null && !(typeof body.tolerance_mm === "number" && Number.isFinite(body.tolerance_mm) && body.tolerance_mm >= 1 && body.tolerance_mm <= 1000))
    throw bad(kind, "tolerance_mm", "must be a number of millimetres from 1 to 1000");
  const d = await wire(deps);
  await d.requireMinRole(key, "lead");
  const proj = await d.ensureProject(key);
  // Human-error guards §2: If-Match is the sha of the artefact in force for `key` as the client read it, or "none" — another install
  // since (here or on its office) is a 412 naming who and when. None sent is written as before (scripts, the MCP server, older add-ins).
  const want = ifMatchValue(ifMatch);
  if (want != null) {
    const now = await resolveArtefact(key, kind, deps);
    if (want !== (now.sha256 ?? "none")) {
      if (now.source === "none") throw err(412, `the ${kind} this was read from is no longer in force on ${key} — reload to see it; nothing was saved`);
      const doc = now.source === "project" ? await getArtefact(key, kind, deps) : await d.officeArtefact(await d.officeKeyOf(key), kind);
      throw staleChange(`${kind} was`, doc?.installed_by, doc?.installed_at);
    }
  }
  const prev = await d.docGet(STORE, proj.id, kind);
  return installVersion(d, proj, kind, body, prev, { actor, source });
}

/** MA-4a: the bridge's own write of a kind whose route checked the caller itself (evidence_pack: a contributor's admission, a lead's
 *  signature — evidence-store.mjs). Validated as every install; no role check here. `expectVersion` is the version the caller read (0
 *  for none): another write since is a 409 in words, and two at once meet the create-only kind@n. → the pointer. */
export async function foldArtefact(key, kind, body, { actor, expectVersion }, deps) {
  validateArtefact(kind, body);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const prev = await d.docGet(STORE, proj.id, kind);
  if ((prev?.version || 0) !== expectVersion) throw err(409, RACE(kind));
  return installVersion(d, proj, kind, body, prev, { actor, source: null });
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
  // MA-4a: evidence is the project's own — never its office's (PROJECT_ONLY).
  if (officeKey && !PROJECT_ONLY.includes(kind)) {
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

/** MA-2b (design §3.4 step 5): GET /cde/:key/artefacts/lod_matrix/ids — the DD stage IDS of `key`'s lod_matrix@n (project →
 *  office), made by matrixToIds from the one parser's reading, with the matrix that made it: {matrix: label, sha256, stage: "DD",
 *  project_stage (its stage_map, D18), ids, unmatched}. Derived on every read and never installed as ids@n, so it cannot outrank
 *  or clash with the project's own IDS. 404 when no matrix is installed; 409 when the one installed no longer parses. */
export async function lodMatrixIds(key, deps) {
  const a = await resolveArtefact(key, "lod_matrix", deps);
  if (a.source === "none") throw err(404, `no lod_matrix installed for ${key} or its office`);
  let m;
  try { m = parseLodMatrix(a.body); } catch (e) { throw err(409, `${refLabel(a)} did not parse: ${e.message}`); }
  const { matrixToIds } = await import("./ids-compile.mjs");
  const { unmatched, ...ids } = matrixToIds(m, { label: refLabel(a) });
  return { matrix: refLabel(a), sha256: a.sha256, stage: "DD", project_stage: m.stage_map.DD, ids, unmatched };
}

/** Q5 (2026-10-19): GET /cde/:key/artefacts/ids/generated — the IDS made from the standards in force (contract, ruleset, naming;
 *  project → office) by standardsToIds, with the IDS in force's other specifications kept. A proposal: never installed here — a
 *  lead installs it through PUT …/artefacts/ids (validated, ledger row). `up_to_date`: the IDS in force was made from these very
 *  standards (true/false), or was not generated (null). `xml`: the same IDS as buildingSMART IDS 1.0, `xml_skipped` what it lacks. */
export async function generatedIds(key, deps) {
  const { standardsToIds, idsToXml } = await import("./ids-compile.mjs");
  const broken = [];
  const read = async (kind) => {
    const a = await resolveArtefact(key, kind, deps);
    if (a.source === "none") return null;
    try { validateArtefact(kind, a.body); } catch (e) { broken.push({ from: kind, item: refLabel(a), reason: `did not parse, so nothing of it is in the IDS: ${e.message}` }); return null; }
    return { body: a.body, label: refLabel(a), sha256: a.sha256 };
  };
  const [contract, ruleset, naming] = [await read("contract"), await read("ruleset"), await read("naming")];
  const current = await resolveArtefact(key, "ids", deps);
  const out = standardsToIds({ contract, ruleset, naming }, { current: current.body });
  const was = current.body?.generated_from;
  const up_to_date = was ? ["contract", "ruleset", "naming"].every((k) => (was[k]?.sha256 ?? null) === (out.ids.generated_from[k]?.sha256 ?? null)) : null;
  const { xml, skipped } = idsToXml(out.ids, { ifcSchema: contract?.body.ifc_schema });
  return { ...out, unmatched: [...broken, ...out.unmatched], current: current.ref ? refLabel(current) : null, up_to_date, xml, xml_skipped: skipped };
}

/** POST /cde/:key/artefacts/ids/eir {text, title} — an EIR's requirement prose compiled (compileIds) and merged into the IDS in force
 *  (eirToIds): the generated specifications and generated_from stay, the last compile's are replaced. A proposal, as generatedIds:
 *  a lead installs `ids` through PUT …/artefacts/ids. `xml`: that IDS as buildingSMART IDS 1.0 (Download .ids), `xml_skipped` what
 *  it lacks. → compileIds's answer + {ids, added, kept, skipped, current, xml, xml_skipped}. */
export async function eirIds(key, { text, title } = {}, deps) {
  const { compileIds, eirToIds, idsToXml } = await import("./ids-compile.mjs");
  const compiled = compileIds(text, { title });
  const current = await resolveArtefact(key, "ids", deps);
  const out = eirToIds(compiled, { current: current.body });
  const { xml, skipped } = idsToXml(out.ids, { ifcSchema: (await resolveArtefact(key, "contract", deps)).body?.ifc_schema });
  return { ...compiled, ...out, current: current.ref ? refLabel(current) : null, xml, xml_skipped: skipped };
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
