// MA-2a: bridge typing — full contract 2. An element posted without place.TypeName is typed here from the project's
// guideline@n and type_catalog@n (artefact-store resolveArtefact: project → office) and the FACTS the poster gave about it —
// its category (from its kind), its thickness and its parameters (Function, Location, Material, …) exactly as posted. The
// bridge measures nothing and reads no model: the facts are the poster's claim, kept on the element as a record.
//
// EXACT OR A 400 (D16, as Promote). The type is an office rule's answer at confidence 1 whose type the catalogue holds; anything
// else is a refusal that names what is missing — no guideline, no catalogue, no matching rule, a {thickness} type with no
// thickness sent, a type the catalogue lacks (with the sizes it has). A category default (confidence 0.6) is not an office
// rule and is refused too: nothing is guessed. The same resolver the add-in's GuidelineMatcher mirrors (sentinel-core.mjs, the
// bundle of src/sentinel-core; the shared layer-free fixture holds both to one answer) decides.
//
// Pure: the resolved bodies and the bundle are handed in, so changesets-logic.test.mjs and this module's own test run without
// a store. changesets-store builds the typer only when a post needs one.
const err = (status, message) => Object.assign(new Error(message), { status });
const text = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max;
const CONTROL_CHAR = /[\u0000-\u001f]/;

/** The guideline category each typed changeset kind is resolved under (PlacementPolicy.CategoriesOf names the same ones). A
 *  level or grid is never typed. */
export const KIND_CATEGORY = { wall: "Walls", floor: "Floors", roof: "Roofs", ceiling: "Ceilings", door: "Doors", window: "Windows", column: "Columns", furniture: "Furniture" };
export const FACTS_FIELDS = ["thickness_mm", "params"];
export const MAX_FACT_PARAMS = 20;
export const MAX_THICKNESS_MM = 10000;

/** An element's `facts` as posted → { thickness_mm?, params? } kept name for name, or a 400 naming the fault; null when none
 *  was sent. A stray key is a 400, never dropped: a fact the bridge does not read would be a fact the poster thinks it typed by. */
export function checkFacts(f, at) {
  if (f == null) return null;
  if (typeof f !== "object" || Array.isArray(f)) throw err(400, `${at}: facts must be an object {thickness_mm?, params?}`);
  const extra = Object.keys(f).filter((k) => !FACTS_FIELDS.includes(k));
  if (extra.length) throw err(400, `${at}: facts takes only ${FACTS_FIELDS.join(" and ")} (got ${extra.join(", ")})`);
  const out = {};
  if (f.thickness_mm !== undefined) {
    if (!(typeof f.thickness_mm === "number" && Number.isFinite(f.thickness_mm) && f.thickness_mm > 0 && f.thickness_mm <= MAX_THICKNESS_MM))
      throw err(400, `${at}: facts.thickness_mm must be a number of mm above 0 and at most ${MAX_THICKNESS_MM}`);
    out.thickness_mm = f.thickness_mm;
  }
  if (f.params !== undefined) {
    if (!f.params || typeof f.params !== "object" || Array.isArray(f.params)) throw err(400, `${at}: facts.params must be an object of parameter name: value`);
    const keys = Object.keys(f.params);
    if (keys.length > MAX_FACT_PARAMS) throw err(400, `${at}: facts.params holds at most ${MAX_FACT_PARAMS} parameters (got ${keys.length})`);
    for (const k of keys) {
      if (!text(k, 64) || CONTROL_CHAR.test(k)) throw err(400, `${at}: facts.params has a parameter name that is not one line of at most 64 characters`);
      if (!text(f.params[k], 256) || CONTROL_CHAR.test(f.params[k])) throw err(400, `${at}: facts.params.${k.replace(CONTROL_CHAR, " ").slice(0, 64)} must be one line of text of at most 256 characters`);
    }
    out.params = { ...f.params };
  }
  return out;
}

/** The facts in words, for a refusal: "Function Exterior, Location Exterior, 200 mm"; "no facts" when none were sent. */
export function saidOf(facts) {
  const parts = Object.entries(facts?.params ?? {}).map(([k, v]) => `${k} ${v}`);
  if (facts?.thickness_mm !== undefined) parts.push(`${facts.thickness_mm} mm`);
  return parts.length ? parts.join(", ") : "no facts";
}

/**
 * The typer validateChangeset calls for an element without place.TypeName. `standards` = { guideline, catalog }, each
 * { body (null = none installed, or one that did not parse), label (artefact-store refLabel, or "none — <reason>"), sha256 };
 * `core` = the sentinel-core bundle. Returns (kind, facts, at) → { TypeName, FamilyName, typing }, or throws a 400 that says
 * exactly what is missing. `typing` is the bridge's record: who typed it, the type and family, the rule's own words, the
 * conditions it matched, the input it was given, and which guideline and catalogue decided (label and sha).
 */
export function makeTyper({ guideline: g, catalog: c }, core) {
  return (kind, facts, at) => {
    const category = KIND_CATEGORY[kind];
    const lead = `${at}: a ${kind} without place.TypeName is typed by the bridge from the project's guideline and type catalogue — `;
    const send = "; send place.TypeName, or ";
    if (!category) throw err(400, `${lead}a ${kind} is not typed`);
    if (!g.body) throw err(400, `${lead}no guideline is installed for this project or its office (${g.label}): not checkable${send}install guideline@n`);
    if (!c.body) throw err(400, `${lead}no type catalogue is installed for this project or its office (${c.label}): a type is chosen from the catalogue only (D16)${send}install type_catalog@n`);
    const input = { category, params: facts?.params ?? {}, ...(facts?.thickness_mm !== undefined ? { thicknessMm: facts.thickness_mm } : {}) };
    const r = core.resolveWithCatalog(g.body, input, c.body.types);
    const said = saidOf(facts);
    if (r.source === "none") throw err(400, `${lead}no rule of ${g.label} matches a ${kind} with ${said}${send}add a layer-free rule for it`);
    if (r.source === "default") throw err(400, `${lead}only the ${category} default of ${g.label} would apply (confidence 0.6) — Sentinel types by an office rule only${send}write a rule for ${said}`);
    if (!r.type) throw err(400, `${lead}the rule of ${g.label} for ${said} names its type with {thickness} and no thickness was sent${send}send facts.thickness_mm`);
    if (r.confidence < 1)
      throw err(400, `${lead}"${r.type}" (the rule of ${g.label} for ${said}) is not in ${c.label}` +
        (r.available?.length ? ` — the catalogue has ${r.available.join(", ")}` : " and the catalogue has no other size of it") + `${send}pick one of those`);
    // The resolver checks the TYPE name in the category; a door's or window's type name repeats across families (the add-in has
    // CatalogHas(category, family, type) for this). The pair must be one catalogue row, or Apply fails on a family:type the model
    // does not hold — or places the wrong pair (review of MA-2a, C20).
    const norm = (s) => (s ?? "").trim().toLowerCase();
    const rows = c.body.types.filter((t) => core.sameCategory(t, category) && norm(t.type) === norm(r.type));
    if (!rows.some((t) => norm(t.family) === norm(r.family)))
      throw err(400, `${lead}"${r.family} : ${r.type}" (the rule of ${g.label} for ${said}) is not one type in ${c.label} — the catalogue holds ${r.type} under ${[...new Set(rows.map((t) => t.family))].join(", ")}${send}name that family in the rule`);
    return {
      TypeName: r.type, FamilyName: r.family,
      typing: {
        typed_by: "bridge", type: r.type, family: r.family, rule: r.why ?? null, matched: r.matched ?? [], input,
        guideline: g.label, guideline_sha256: g.sha256 ?? null, catalog: c.label, catalog_sha256: c.sha256 ?? null,
      },
    };
  };
}

// ── MA-2c: where a set_parameter's value comes from. The bridge, not the caller, says it (the trust rule): the cited artefact
// must hold exactly the value posted — a catalogue row of exactly that type, or the one value every whole-class clause of the
// installed ids@n pins. Never a guess: no row, two rows, two values, another value — each a 400 in words. The add-in's
// PropertyPlanner reads the same two sources; fixtures/changeset-ops/value-sources.json holds both sides to one table and one
// reading of the clauses.

/** The catalogue parameter a DD property is harvested under (Build Office System reads "Fire Rating" by its display name,
 *  GoldenModelExtractor.InterestingParams). A property not here has no catalogue source: the harvest reads no thermal value. */
export const CATALOG_PARAM = { "Pset_WallCommon.FireRating": "Fire Rating", "Pset_DoorCommon.FireRating": "Fire Rating" };
/** The IFC entity each Promote kind is adjudicated as (PromoteWallsPlanner.Classes' Ifc, as an IDS writes it): what a clause's
 *  applicability must match. */
export const KIND_ENTITY = { wall: "IFCWALL", floor: "IFCSLAB", roof: "IFCROOF", ceiling: "IFCCOVERING", door: "IFCDOOR", window: "IFCWINDOW" };
/** Review amendment C1: the property set a set_parameter of each kind writes — the class's own common set. The catalogue's "Fire
 *  Rating" of a wall is no door's: a key of another class's set is refused (checkWrite). */
export const KIND_PSET = { wall: "Pset_WallCommon", floor: "Pset_SlabCommon", roof: "Pset_RoofCommon", ceiling: "Pset_CoveringCommon", door: "Pset_DoorCommon", window: "Pset_WindowCommon" };
/** Review amendment C23: the one shape a cited clause value has, an allow-list (a list of bound phrases, C18, could never be
 *  complete). ONE rating token: a classification code from the list (EN 13501-2 R, E, EI, EI1, EI2, EW, RE, REI, REW and their -M;
 *  BS 476 FD; DIN T and F; Rw), a space or hyphen or nothing, 1-3 digits, then up to two classification suffixes (S, Sa, Sm, S200,
 *  C, C0-C5, M: FD30S, FD 30 S, EI 60-C5, EI30-C5Sa, REI 120-M) — FD30, REI 60, EI-30, EI2 30, REI-M 90. Or ONE number with an
 *  optional time unit, hyphenated or not (60, 60 min, 120 minutes, 2 hr, 1-hour, 90-minute), a whole and a fraction of hours
 *  (1 1/2 hr), or an AS 1530.4 FRL (60/60/60, -/60/60). Anything else — "above FD30", "NLT 60", "c 60", "FD30 or FD60", "min" — is
 *  not this shape and goes to a person. ASCII only (checked apart: notAValue). The add-in's Clauses.OneValue is the same pattern. */
export const ONE_VALUE = /^(?:(?:FD|T|F|Rw|R|R?EI?[12]?W?(?:-M)?)[ -]?[0-9]{1,3}(?:[ -]?(?:S(?:a|m|200)?|C[0-5]?|M)){0,2}|[0-9]{1,4}(?:\.[0-9]{1,2})?(?:[ -]?(?:mins?|minutes?|h|hrs?|hours?))?|[0-9]{1,2}[ -][13]\/[24] ?(?:h|hrs?|hours?)|(?:[0-9]{2,3}|-)\/(?:[0-9]{2,3}|-)\/(?:[0-9]{2,3}|-))(?![\s\S])/i;
/** Review C23: the noun each IFC entity is named by in a whole-class sentence — "All doors shall be FD30." states a value of
 *  every IFCDOOR, "All windows shall be FD30." states none. The add-in's Clauses.ClassNoun is the same table. */
export const CLASS_NOUN = { IFCWALL: ["walls"], IFCDOOR: ["doors"], IFCWINDOW: ["windows"], IFCSLAB: ["slabs", "floors"], IFCROOF: ["roofs"], IFCCOVERING: ["ceilings", "coverings"] };
const ASCII_TRIM = /^[ \t\r\n]+|[ \t\r\n]+(?![\s\S])/g;
/** "Pset_DoorCommon.FireRating" → "fire rating": the property as a sentence names it. */
const propWords = (key) => (String(key ?? "").split(".")[1] ?? "").replace(/[^A-Za-z0-9]/g, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
/** Review C23 (final): the one wording a clause with a sentence is cited in, an allow-list on the whole sentence — "[The <property>
 *  of] [all|every|each|the] <the entity's noun> shall|must be <value>[.|!]", the value optionally quoted, ASCII, words apart by
 *  spaces. Nothing may stand before the class (a place, a condition, an exception, "some of"), between "be" and the value (a bound,
 *  a negation, a qualifier) or after it (a choice, a narrowing); the noun is the clause's own entity's. Group 2 = the value as the
 *  sentence states it; null = an entity with no noun. The add-in's Clauses.Worded builds the same pattern. */
export function wordedAs(entity, key) {
  const nouns = CLASS_NOUN[entity];
  if (!nouns) return null;
  const prop = propWords(key);
  const noun = nouns.map((w) => w.slice(0, -1) + "s?").join("|");
  return new RegExp("^(?:the +" + (prop ? prop.replace(/ /g, " +") : "(?!)") + " +of +)?(?:(?:all|every|each|the) +)?(?:" + noun
    + ") +(?:shall|must) +be +([\"']?)(.+?)\\1[.!]?(?![\\s\\S])", "i");
}
/** Why a clause is not a cited value, in the planner's words (null = it is one): the value is not ONE value (C23), or its sentence
 *  is not worded as every `entity` carrying exactly this value of `key` (wordedAs). A hand-written IDS has no sentence: the value's
 *  shape alone. The add-in's Clauses.NotAValue answers every value_cases row the same. */
export function notAValue(sentence, value, entity, key) {
  const v = String(value ?? "").replace(ASCII_TRIM, "");
  if (/[^ -~]/.test(v) || !ONE_VALUE.test(v)) return `"${v}" is not one value (a bound, a choice or a qualifier) — a person decides`;
  if (sentence == null) return null;
  const m = /[^ -~]/.test(sentence) ? null : wordedAs(entity, key)?.exec(sentence);
  if (m) return m[2] === v ? null : `it states "${m[2]}", not "${v}" — a person decides`;
  const prop = propWords(key);
  return `it is not worded "${prop ? `the ${prop} of ` : ""}all ${CLASS_NOUN[entity]?.[0] ?? entity} shall be ${v}." — a person decides`;
}

/** Review C23: an applicability entity is a regex both the bridge (JS) and the add-in (.NET) read — and they read alike only
 *  names, groups, alternation and anchors ("IFCDOOR", "^IFC(ROOF|SLAB)$"). "(?i)ifcdoor", "\AIFCDOOR" or "IFC[^]*" mean
 *  different things in each, so they apply to nothing on both sides. The add-in's Clauses.EntityPattern is the same. */
export const ENTITY_PATTERN = /^[A-Za-z0-9_|()^$]+$/;

/** Every required exact-value clause on `key` ("Pset_X.Prop") whose applicability is `entity` alone, in the IDS's order:
 *  [{value, spec, sentence, why}] — why null = a cited value (notAValue). */
function clauseReadings(ids, entity, key) {
  const [pset, prop] = String(key).split(".");
  const out = [];
  for (const s of Array.isArray(ids?.specifications) ? ids.specifications : []) {
    const a = s?.applicability;
    if (!a || typeof a !== "object" || typeof a.entity !== "string" || Object.keys(a).some((k) => k !== "entity")) continue;
    if (!ENTITY_PATTERN.test(a.entity)) continue; // C23: a pattern outside what JS and .NET read alike applies to nothing
    let re;
    try { re = new RegExp(a.entity, "i"); } catch { continue; }
    if (!re.test(entity)) continue;
    for (const p of Array.isArray(s.requirements?.properties) ? s.requirements.properties : [])
      if (p?.pset === pset && p?.name === prop && p.cardinality === "required" && p.pattern == null && typeof p.value === "string" && p.value.replace(ASCII_TRIM, "")) {
        const sentence = typeof s.source_sentence === "string" ? s.source_sentence : null;
        out.push({ value: p.value.replace(ASCII_TRIM, ""), spec: String(s.name ?? ""), sentence, why: notAValue(sentence, p.value, entity, key) });
      }
  }
  return out;
}

/** The values an installed ids@n pins for `key` ("Pset_X.Prop") on EVERY element of `entity`: a cited clause is a specification
 *  whose applicability is its entity alone (another facet narrows it to some elements) and whose required property carries one
 *  exact value (a pattern is not a value; nor is a bound, a choice, a qualifier, nor a clause whose sentence narrows the class:
 *  C7, C18, C23). [{value, spec, sentence}] in the IDS's order; two values are both returned — the caller says they disagree. */
export function clauseValues(ids, entity, key) {
  return clauseReadings(ids, entity, key).filter((h) => !h.why).map(({ value, spec, sentence }) => ({ value, spec, sentence }));
}

/** The check validateChangeset runs on a set_parameter's value_source. `standards` = {catalog, ids}, each {body (null = none
 *  installed, or one that did not parse), label, sha256} as the typer's; `core` = the bundle (sameCategory). Returns (kind, place,
 *  key, to, valueSource, at) → the bridge's own record {kind, ref, sha256}, or throws a 400 that says what does not hold.
 *  Review amendment C1: BOTH sources are read whichever is cited — a catalogue row and a clause that hold different values are a
 *  400 "the sources disagree", as the add-in's PropertyPlanner sends them to a person: the bridge holds the rule, not the caller. */
export function makeCiter({ catalog: c, ids: s }, core) {
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const refOf = (h) => `${s.label} · ${h.spec}` + (h.sentence ? ` · "${h.sentence}"` : "");
  return (kind, place, key, to, vs, at) => {
    const lead = `${at}: set_parameter's value_source`;
    const want = to.trim();
    const label = place.FamilyName ? `${place.FamilyName} : ${place.TypeName}` : place.TypeName;
    // What each source holds for this type and key, read before either is judged.
    const name = CATALOG_PARAM[key];
    const cat = KIND_CATEGORY[kind];
    const rows = c.body && name ? c.body.types.filter((r) => core.sameCategory(r, cat) && norm(r.type) === norm(place.TypeName)
      && (!place.FamilyName || norm(r.family) === norm(place.FamilyName))) : [];
    const fromCatalog = rows.length === 1 && typeof rows[0].params?.[name] === "string" ? rows[0].params[name].trim() : "";
    const catalogRef = `${c.label} · ${label} · ${name}`;
    const hits = s.body ? clauseValues(s.body, KIND_ENTITY[kind], key) : [];
    const disagree = (a, h) => err(400, `${lead}: the sources disagree on ${key} for ${label}: "${a}" (${catalogRef}) and "${h.value}" (${refOf(h)}) — a person decides`);
    if (vs.kind === "catalogue") {
      if (!c.body) throw err(400, `${lead} is the catalogue, and no type catalogue is installed for this project or its office (${c.label}): not checkable`);
      if (!name) throw err(400, `${lead} is the catalogue, and the catalogue harvests no parameter for ${key} — a person fills it`);
      if (rows.length !== 1) throw err(400, `${lead}: ${c.label} has ${rows.length ? `${rows.length} rows` : "no row"} for ${cat} ${label} — one row is one source`);
      if (fromCatalog !== want) throw err(400, `${lead}: ${c.label} gives ${label} ${name} "${fromCatalog}", not "${want}" — a value is written only as its source holds it`);
      const other = hits.find((h) => h.value !== want);
      if (other) throw disagree(want, other);
      return { kind: "catalogue", ref: catalogRef, sha256: c.sha256 ?? null };
    }
    if (!s.body) throw err(400, `${lead} is a clause, and no ids@n is installed for this project or its office (${s.label}): not checkable`);
    const values = [...new Set(hits.map((h) => h.value))];
    if (values.length === 0) {
      const r = clauseReadings(s.body, KIND_ENTITY[kind], key).find((h) => h.why); // C23: a clause that is not a value says why
      throw err(400, `${lead}: no clause of ${s.label} pins one value of ${key} for every ${KIND_ENTITY[kind]}` + (r ? ` — ${r.spec} ("${r.sentence ?? r.value}"): ${r.why}` : ""));
    }
    if (values.length > 1) throw err(400, `${lead}: the clauses of ${s.label} pin ${values.map((v) => `"${v}"`).join(" and ")} for ${key} — they disagree; a person decides`);
    if (values[0] !== want) throw err(400, `${lead}: ${s.label} pins "${values[0]}" for ${key}, not "${want}" — a value is written only as its source holds it`);
    if (fromCatalog && fromCatalog !== want) throw disagree(fromCatalog, hits[0]);
    return { kind: "clause", ref: refOf(hits[0]), sha256: s.sha256 ?? null };
  };
}
