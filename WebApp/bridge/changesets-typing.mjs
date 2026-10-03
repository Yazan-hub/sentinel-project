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
/** Review amendment C23 (values): the one shape a cited clause value has — an allow-list PER PROPERTY, each code with its own
 *  periods and suffixes (a list of bound phrases, C18, could never be complete; one shape for every code let "Rw 45", "T 200 mm",
 *  "EI 30-C0-C5", "REI 0" and "-/-/-" through as fire ratings). A FireRating is ONE rating as its standard writes it: BS 476 FD20,
 *  30, 60, 90, 120 and its S (FD30S, FD 30 S); an EN 13501-2 code (R, E, EI, EI1, EI2, EW, RE, REI, REW; -M before the period or
 *  after it) with one of its periods (15 20 30 45 60 90 120 180 240 360), then at most one C/C0-C5 and one Sa/Sm/S200 in that order
 *  (EI 60-C5, EI30-C5Sa, REI-M 90, REI 120-M); DIN 4102 T30, T30-1-RS, T 90-2, F90-A, F 30-AB (periods 30 60 90 120 180); 1-999
 *  minutes or 1-6 hours with a unit, hyphenated or not (60 min, 90-minute, 2 hr, 1-hour, 1.5 hr), or a fraction of an hour as IBC
 *  writes it (3/4-hour, 1/3 hour, 1-1/2-hour, 1 1/2 hr); or an AS 1530.4 FRL with at least one period (-/60/60; -/-/- requires
 *  nothing). A bare number, a zero period, a suffix the code does not take — not one. An AcousticRating is Rw and whole dB (Rw 45,
 *  Rw 45 dB) or an ASTM E413 STC (STC 45: C23 gate); a ThermalTransmittance one positive number below 10 (1.4, or 0,18 as
 *  EN ISO 6946 writes it). Any other property has no shape: a person fills it. ASCII
 *  only (checked apart: notAValue). The add-in's Clauses.ValueShape holds the same patterns; the shared value_cases pin both.
 *  Review C23 (codes): each EN 13501-2 code takes only its own suffixes — R and RE none; REI, REW and EI -M (mechanical impact);
 *  E, EI, EI1, EI2 and EW C/C0-C5 and Sa/Sm/S200 (doors and shutters), periods to 240 (360 is R's, RE's, REI's and REW's only);
 *  DIN 4102-3 W 30-W 90 (-A, -AB, -B) and DIN 4102-13 G 30-G 120 too; minutes are a standard period (15 20 30 45 60 90 120 180 240
 *  360), hours 1 2 3 4 6, 1.5 or 1/3 1/2 3/4 1-1/2; an FRL's periods are 30 60 90 120 180 240; BS 476-22 integrity/insulation
 *  (30/30, 60/30, 60/0), the insulation never longer than the integrity. "R 30-C5", "E 15-M", "11/22/33", "1 min" and "6.99 h"
 *  are not one. EN 13501-2's subscript EI₁/EI₂ is read as EI1/EI2 (notAValue). */
export const VALUE_SHAPE = {
  FireRating: /^(?:FD ?(?:20|30|60|90|120)(?:[ -]?S)?|(?:RE|R)[ -]?(?:15|20|30|45|60|90|120|180|240|360)|(?:REI|REW)(?:-M[ -]?(?:15|20|30|45|60|90|120|180|240|360)|[ -]?(?:15|20|30|45|60|90|120|180|240|360)(?:-M)?)|EI(?:-M[ -]?(?:15|20|30|45|60|90|120|180|240)|[ -]?(?:15|20|30|45|60|90|120|180|240)-M)|(?:EI[12]?|EW|E)[ -]?(?:15|20|30|45|60|90|120|180|240)(?:[ -]?C[0-5]?)?(?:[ -]?S(?:a|m|200))?|T ?(?:30|60|90|120|180)(?:-[12])?(?:-RS)?|F ?(?:30|60|90|120|180)(?:-(?:A|AB|B))?|W ?(?:30|60|90)(?:-(?:A|AB|B))?|G ?(?:30|60|90|120)|(?:15|20|30|45|60|90|120|180|240|360)[ -]?(?:mins?|minutes?)|(?:[1-4]|6|1\.5|(?:1[ -])?1\/2|1\/3|3\/4)[ -]?(?:h|hrs?|hours?)|(?!-\/-\/-)(?:30|60|90|120|180|240|-)\/(?:30|60|90|120|180|240|-)\/(?:30|60|90|120|180|240|-)|30\/(?:0|30)|60\/(?:0|30|60)|90\/(?:0|30|60|90)|120\/(?:0|30|60|90|120)|180\/(?:0|30|60|90|120|180)|240\/(?:0|30|60|90|120|180|240))(?![\s\S])/i,
  AcousticRating: /^(?:Rw ?[1-9][0-9](?: ?dB)?|STC[ -]?[1-9][0-9])(?![\s\S])/i,
  // a decimal comma takes 1-2 digits: "1,400" is a thousands separator in English and 1.4 under EN ISO 6946 — not one value
  ThermalTransmittance: /^(?=[0-9.,]*[1-9])[0-9](?:\.[0-9]{1,3}|,[0-9]{1,2})?(?![\s\S])/,
};
/** Review C23: the noun each IFC entity is named by in a whole-class sentence — "All doors shall be FD30." states a value of
 *  every IFCDOOR, "All windows shall be FD30." states none. The add-in's Clauses.ClassNoun is the same table. */
export const CLASS_NOUN = { IFCWALL: ["walls"], IFCDOOR: ["doors"], IFCWINDOW: ["windows"], IFCSLAB: ["slabs", "floors"], IFCROOF: ["roofs"], IFCCOVERING: ["ceilings", "coverings"] };
const ASCII_TRIM = /^[ \t\r\n]+|[ \t\r\n]+(?![\s\S])/g;
/** "Pset_DoorCommon.FireRating" → "fire rating": the property as a sentence names it. */
const propWords = (key) => (String(key ?? "").split(".")[1] ?? "").replace(/[^A-Za-z0-9]/g, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
/** Review C23 (final): the one wording a clause with a sentence is cited in, an allow-list on the whole sentence — "[The <property>
 *  of] [all] <the entity's plural> | every|each <its singular> shall|must be <value>[.|!]", the value optionally quoted, ASCII, words apart by
 *  spaces. Nothing may stand before the class (a place, a condition, an exception, "some of"), between "be" and the value (a bound,
 *  a negation, a qualifier) or after it (a choice, a narrowing); the noun is the clause's own entity's. Group 2 = the value as the
 *  sentence states it; null = an entity with no noun. The add-in's Clauses.Worded builds the same pattern. */
export function wordedAs(entity, key) {
  const nouns = CLASS_NOUN[entity];
  if (!nouns) return null;
  const prop = propWords(key);
  // Review C23 (wording): "all doors" / "doors" or "every door" / "each door" — never "the door(s)": one door, or doors named before.
  return new RegExp("^(?:the +" + (prop ? prop.replace(/ /g, " +") : "(?!)") + " +of +)?(?:(?:all +)?(?:" + nouns.join("|") + ")|(?:every|each) +(?:"
    + nouns.map((w) => w.slice(0, -1)).join("|") + ")) +(?:shall|must) +be +([\"']?)(.+?)\\1[.!]?(?![\\s\\S])", "i");
}
/** Review C23 (codes): EN 13501-2 prints EI₁/EI₂ with a subscript, and a PDF pastes it so — read as EI1/EI2, the one non-ASCII
 *  the shape and the wording take (the add-in's Clauses.Flat). The value is still written as its source holds it. */
const flat = (s) => s.replace(/(EI)([₁₂])/g, (_, e, d) => e + String.fromCharCode(d.charCodeAt(0) - 0x2050));
/** Why a clause is not a cited value, in the planner's words (null = it is one): the value is not ONE value (C23), or its sentence
 *  is not worded as every `entity` carrying exactly this value of `key` (wordedAs). A hand-written IDS has no sentence: the value's
 *  shape alone. The add-in's Clauses.NotAValue answers every value_cases row the same. */
export function notAValue(sentence, value, entity, key) {
  const v = flat(String(value ?? "")); // C23 (gate): untrimmed — the gate holds an element to "FD30 " as written, so it is not one value
  const parts = String(key ?? "").split("."), p = parts[1]; // review C23: "Pset_X.Prop" — one dot, as the add-in reads it
  if (/[^ -~]/.test(v) || parts.length !== 2 || !Object.hasOwn(VALUE_SHAPE, p) || !VALUE_SHAPE[p].test(v)) return `"${v}" is not one value (a bound, a choice or a qualifier) — a person decides`;
  if (sentence == null) return null;
  sentence = flat(sentence);
  const m = /[^ -~]/.test(sentence) ? null : wordedAs(entity, key)?.exec(sentence);
  if (m) return m[2] === v ? null : `it states "${m[2]}", not "${v}" — a person decides`;
  const prop = propWords(key);
  return `it is not worded "${prop ? `the ${prop} of ` : ""}all ${CLASS_NOUN[entity]?.[0] ?? entity} shall be ${v}." — a person decides`;
}

/** Review C23: an applicability entity is a regex both the bridge (JS) and the add-in (.NET) read — and they read alike only
 *  names, groups, alternation and anchors ("IFCDOOR", "^IFC(ROOF|SLAB)$"). Any other entity ("IFCDOOR.*", ".*", "IFCDOORS?",
 *  "[I]FCDOOR", a number) the gate still reads as its own regex (ids.ts applies), so it MAY apply to every element of the class:
 *  weighed, never cited (C23 gate). The add-in's Clauses.EntityPattern is the same. */
export const ENTITY_PATTERN = /^[A-Za-z0-9_|()^$]+$/;

/** Review C23 (context): a stored sentence is cut out of its document — a heading above it ("Doors to protected stairs"), a place
 *  before a colon or a semicolon, a hard-wrapped "or better.", a bullet's lead-in, an exception after it ("Doors to plant rooms are
 *  excluded.") all narrow it and are not in it. So a clause with a sentence is cited only when compileIds marked it source_alone:
 *  its document said nothing but whole-class one-value sentences (compileIds). The add-in's Clauses.NotAlone is the same words. */
export const NOT_ALONE = "its document says more than whole-class values (a heading, a place, a condition or an exception may narrow it) — a person decides";

/** Review C23 (whole class): the IFC classes an element of each entity is exported as — Revit's IFC2x3 writes every basic wall as
 *  IFCWALLSTANDARDCASE (IfcDeliveryGate.Subtypes), and the gate (ids.ts applies) tests the pattern on that class. A clause is the
 *  whole class's only when its pattern matches the entity AND each of these: "^IFCWALL$" is no IFCWALLSTANDARDCASE's. The add-in's
 *  Clauses.Subtypes is the same table. */
export const ENTITY_SUBTYPES = { IFCWALL: ["IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE"], IFCSLAB: ["IFCSLABSTANDARDCASE", "IFCSLABELEMENTEDCASE"],
  IFCDOOR: ["IFCDOORSTANDARDCASE"], IFCWINDOW: ["IFCWINDOWSTANDARDCASE"], IFCROOF: [], IFCCOVERING: [] };
/** Review C23 (one source): a clause on the key that may apply to some elements of the class, and is not a whole-class required
 *  value — a narrower applicability (a predefined type, a subtype only), an optional or a prohibited property, a pattern. The gate
 *  holds the written value to it too, so a value it does not pin is never written past it: a person decides. */
export const NOT_WHOLE = "it says more of this property than one value on every element of the class (a narrower applicability, an optional or prohibited property, a pattern, or the property under no set or another spelling) — a person decides";
/** Review C23: a source_sentence that is there but not text (a list, an object) is no sentence to read — never "no sentence". */
export const NOT_TEXT = "its source_sentence is not text — a person decides";

/** Every clause on `key` ("Pset_X.Prop") that may apply to an element of `entity` and says something of its value, in the IDS's
 *  order: [{value, spec, sentence, why}]. A whole-class required exact value is judged (notAValue, NOT_ALONE, NOT_TEXT; why null =
 *  a cited value); any other is NOT_WHOLE, its value the one it demands (null: a pattern, or prohibited). A clause demanding only
 *  that the property is there says nothing of its value and is not read. */
function clauseReadings(ids, entity, key) {
  const parts = String(key).split(".");
  if (parts.length !== 2) return []; // review C23: one dot — the add-in reads "Pset_X.Prop.Y" the same way (nothing)
  const [pset, prop] = parts;
  const classes = [entity, ...(ENTITY_SUBTYPES[entity] ?? [])];
  // C23 (gate): how ids.ts propValue finds the row — no set (null, "", left out) searches every group, and set and name compare
  // ignoring case. "exact" = this key as written (the only one cited); "may" = the gate may read this key under it (another case,
  // not ASCII, not text), or the document names it in another spelling ("Fire Rating", "Pset DoorCommon") — weighed, never cited;
  // null = another property.
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const reads = (x, want) => (typeof x !== "string" || /[^ -~]/.test(x) ? "may" : x === want ? "exact" : norm(x) === norm(want) ? "may" : null);
  const out = [];
  for (const s of Array.isArray(ids?.specifications) ? ids.specifications : []) {
    if (!s || typeof s !== "object") continue;
    // C23 (gate): ids.ts applies reads applicability.entity (and predefinedType) — a missing, string or array applicability, no
    // entity, or one outside ENTITY_PATTERN (the gate's own regex) may apply to every element: weighed, never cited.
    const a = s.applicability, ent = a != null && typeof a === "object" ? a.entity : undefined;
    let whole = false;
    if (typeof ent === "string" && ENTITY_PATTERN.test(ent)) {
      let re;
      try { re = new RegExp(ent, "i"); } catch { continue; } // the gate then reads it as a literal name: no class's
      const hit = classes.filter((c) => re.test(c)).length;
      if (!hit) continue;
      whole = hit === classes.length && Object.keys(a).every((k) => k === "entity");
    }
    const spec = String(s.name ?? ""), sentence = typeof s.source_sentence === "string" ? s.source_sentence : null;
    for (const p of Array.isArray(s.requirements?.properties) ? s.requirements.properties : []) {
      if (!p || typeof p !== "object") continue;
      const inSet = p.pset ? reads(p.pset, pset) : "may", named = reads(p.name, prop);
      if (!inSet || !named) continue;
      // C23 (gate): the value untrimmed — the gate holds an element to "FD30 " as written, so it is no cited "FD30"
      if (whole && inSet === "exact" && named === "exact" && p.cardinality === "required" && p.pattern == null && typeof p.value === "string" && p.value !== "")
        out.push({ value: p.value, spec, sentence,
          why: s.source_sentence != null && sentence == null ? NOT_TEXT
            : notAValue(sentence, p.value, entity, key) ?? (sentence != null && s.source_alone !== true ? NOT_ALONE : null) });
      else if (p.cardinality === "prohibited" || p.pattern != null || p.value != null)
        out.push({ value: p.cardinality === "prohibited" || p.pattern != null || typeof p.value !== "string" ? null : p.value, spec, sentence, why: NOT_WHOLE });
    }
  }
  return out;
}

/** Review C23 (one source): the first clause on `key` for `entity` that is not cited and does not demand exactly `value` — a
 *  value is never written past a clause of the same ids@n that the gate would hold it to (null = none). The add-in's
 *  Clauses.SaysMore is the same. */
export function saysMore(ids, entity, key, value) {
  return clauseReadings(ids, entity, key).find((h) => h.why && h.value !== value) ?? null;
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
  // Review C23 (exactly that type): ASCII blanks off and ASCII letters folded only, as the add-in's GuidelineMatcher.Exact — JS and
  // .NET trim (U+0085, U+FEFF) and fold (the Kelvin sign, ẞ) differently, and a row of another name is not that type's.
  const norm = (v) => String(v ?? "").replace(ASCII_TRIM, "").replace(/[A-Z]/g, (ch) => ch.toLowerCase());
  const refOf = (h) => `${s.label} · ${h.spec}` + (h.sentence ? ` · "${h.sentence}"` : "");
  return (kind, place, key, to, vs, at) => {
    const lead = `${at}: set_parameter's value_source`;
    const want = to.replace(ASCII_TRIM, ""); // review C23: ASCII blanks only, as the add-in — JS and .NET trim differ (U+0085, U+FEFF)
    const label = place.FamilyName ? `${place.FamilyName} : ${place.TypeName}` : place.TypeName;
    // What each source holds for this type and key, read before either is judged.
    const name = CATALOG_PARAM[key];
    const cat = KIND_CATEGORY[kind];
    const rows = c.body && name ? c.body.types.filter((r) => core.sameCategory(r, cat) && norm(r.type) === norm(place.TypeName)
      && (!place.FamilyName || norm(r.family) === norm(place.FamilyName))) : [];
    const fromCatalog = rows.length === 1 && typeof rows[0].params?.[name] === "string" ? rows[0].params[name].replace(ASCII_TRIM, "") : "";
    const catalogRef = `${c.label} · ${label} · ${name}`;
    const readings = s.body ? clauseReadings(s.body, KIND_ENTITY[kind], key) : [];
    const hits = readings.filter((h) => !h.why);
    const shown = (h) => `${h.spec} ("${h.sentence ?? h.value ?? "no value"}")`;
    // C23 (one source): a clause of the ids@n the gate holds the type's elements to, which does not pin the value — a person decides.
    const more = (v) => { const h = readings.find((r) => r.why && r.value !== v);
      if (h) throw err(400, `${lead}: ${s.label} · ${shown(h)} also speaks of ${key} for ${KIND_ENTITY[kind]}, and not as "${v}": ${h.why}`); };
    const disagree = (a, h) => err(400, `${lead}: the sources disagree on ${key} for ${label}: "${a}" (${catalogRef}) and "${h.value}" (${refOf(h)}) — a person decides`);
    if (vs.kind === "catalogue") {
      if (!c.body) throw err(400, `${lead} is the catalogue, and no type catalogue is installed for this project or its office (${c.label}): not checkable`);
      if (!name) throw err(400, `${lead} is the catalogue, and the catalogue harvests no parameter for ${key} — a person fills it`);
      if (rows.length !== 1) throw err(400, `${lead}: ${c.label} has ${rows.length ? `${rows.length} rows` : "no row"} for ${cat} ${label} — one row is one source`);
      if (fromCatalog !== want) throw err(400, `${lead}: ${c.label} gives ${label} ${name} "${fromCatalog}", not "${want}" — a value is written only as its source holds it`);
      // C23: a catalogue value is held to the same one-value shape as a clause's — "TBC", "FD30 or FD60", "min. 60 min" are not one
      const nv = notAValue(null, want, KIND_ENTITY[kind], key);
      if (nv) throw err(400, `${lead}: ${c.label} gives ${label} ${name} ${nv}`);
      const other = hits.find((h) => h.value !== want);
      if (other) throw disagree(want, other);
      more(want);
      return { kind: "catalogue", ref: catalogRef, sha256: c.sha256 ?? null };
    }
    if (!s.body) throw err(400, `${lead} is a clause, and no ids@n is installed for this project or its office (${s.label}): not checkable`);
    const values = [...new Set(hits.map((h) => h.value))];
    if (values.length === 0) {
      const r = readings.find((h) => h.why && h.why !== NOT_WHOLE); // C23: a whole-class clause that is not a value says why
      throw err(400, `${lead}: no clause of ${s.label} pins one value of ${key} for every ${KIND_ENTITY[kind]}` + (r ? ` — ${shown(r)}: ${r.why}` : ""));
    }
    if (values.length > 1) throw err(400, `${lead}: the clauses of ${s.label} pin ${values.map((v) => `"${v}"`).join(" and ")} for ${key} — they disagree; a person decides`);
    if (values[0] !== want) throw err(400, `${lead}: ${s.label} pins "${values[0]}" for ${key}, not "${want}" — a value is written only as its source holds it`);
    if (fromCatalog && fromCatalog !== want) throw disagree(fromCatalog, hits[0]);
    more(want);
    return { kind: "clause", ref: refOf(hits[0]), sha256: s.sha256 ?? null };
  };
}
