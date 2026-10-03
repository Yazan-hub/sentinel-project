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
    return {
      TypeName: r.type, FamilyName: r.family,
      typing: {
        typed_by: "bridge", type: r.type, family: r.family, rule: r.why ?? null, matched: r.matched ?? [], input,
        guideline: g.label, guideline_sha256: g.sha256 ?? null, catalog: c.label, catalog_sha256: c.sha256 ?? null,
      },
    };
  };
}
