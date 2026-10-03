// EIR/BEP prose → a proposed IDS specification.
//
// The loop this closes: a requirement written once, in a document, becomes the check that enforces
// it — in Revit and on the web — instead of being retyped by hand into a ruleset nobody can trace
// back to the clause it came from. "All fire doors shall carry a fire rating" is already a
// specification; it is just written in English.
//
// THREE RULES:
//  1. DETERMINISTIC. No model runs here. The repo's doctrine is "the LLM proposes, the deterministic
//     engine disposes" — a compiler that guessed would put guesses in the gate.
//  2. A PROPOSAL, NEVER AN INSTALL. The output is reviewed by a human before it becomes a ruleset,
//     and every specification carries the exact sentence it came from so that review is possible.
//  3. NOTHING IS DROPPED SILENTLY. A sentence that reads like a requirement but compiles to nothing
//     is returned in `unmatched`. A compiler that quietly ignored half a document would produce a
//     gate that looks complete and enforces half the EIR — the worst possible failure here.

/** IFC entity for the nouns a requirement actually uses. Extend as a project's vocabulary demands. */
export const ENTITY_VOCAB = [
  [/\b(fire|external|internal)?\s*doors?\b/i, "IFCDOOR"],
  [/\bwindows?\b/i, "IFCWINDOW"],
  [/\bwalls?\b/i, "IFCWALL"],
  [/\b(slabs?|floors?)\b/i, "IFCSLAB"],
  [/\broofs?\b/i, "IFCROOF"],
  [/\bcolumns?\b/i, "IFCCOLUMN"],
  [/\bbeams?\b/i, "IFCBEAM"],
  [/\b(spaces?|rooms?)\b/i, "IFCSPACE"],
  [/\bstairs?\b/i, "IFCSTAIR"],
  [/\brailings?\b/i, "IFCRAILING"],
  [/\bcurtain wall(s)?\b/i, "IFCCURTAINWALL"],
  [/\bpipes?\b/i, "IFCPIPESEGMENT"],
  [/\bducts?\b/i, "IFCDUCTSEGMENT"],
  [/\b(every|all|each) elements?\b/i, "IFCBUILDINGELEMENT"],
];

/** Everyday phrasing → the IFC property name a model actually carries. */
export const PROPERTY_VOCAB = [
  [/\bfire[- ]?ratings?\b/i, "FireRating"],
  [/\bacoustic ratings?\b/i, "AcousticRating"],
  [/\bthermal transmittances?\b|\bu[- ]?values?\b/i, "ThermalTransmittance"],
  [/\bload[- ]?bearing\b/i, "LoadBearing"],
  [/\bis ?external\b|\bexternal\/internal\b/i, "IsExternal"],
  [/\bcombustib\w+\b/i, "Combustible"],
  [/\bsurface spread of flame\b/i, "SurfaceSpreadOfFlame"],
  [/\bstatus\b/i, "Status"],
  [/\breference\b/i, "Reference"],
];

/** The buildingSMART common pset a property lives in for a given entity. When the prose names a
 *  property but no pset (the normal case in an EIR), the standard pset is the only honest inference —
 *  an adjudicator cannot look up "FireRating" without knowing where. Unknown pairs stay null and are
 *  reported as such, never guessed. */
export const STANDARD_PSETS = {
  IFCDOOR: { FireRating: "Pset_DoorCommon", IsExternal: "Pset_DoorCommon", Reference: "Pset_DoorCommon", AcousticRating: "Pset_DoorCommon", ThermalTransmittance: "Pset_DoorCommon" },
  IFCWINDOW: { ThermalTransmittance: "Pset_WindowCommon", IsExternal: "Pset_WindowCommon", Reference: "Pset_WindowCommon", FireRating: "Pset_WindowCommon", AcousticRating: "Pset_WindowCommon" },
  IFCWALL: { IsExternal: "Pset_WallCommon", LoadBearing: "Pset_WallCommon", FireRating: "Pset_WallCommon", Reference: "Pset_WallCommon", ThermalTransmittance: "Pset_WallCommon", AcousticRating: "Pset_WallCommon", Combustible: "Pset_WallCommon", SurfaceSpreadOfFlame: "Pset_WallCommon" },
  IFCSLAB: { IsExternal: "Pset_SlabCommon", LoadBearing: "Pset_SlabCommon", FireRating: "Pset_SlabCommon", Reference: "Pset_SlabCommon", ThermalTransmittance: "Pset_SlabCommon" },
  IFCROOF: { IsExternal: "Pset_RoofCommon", FireRating: "Pset_RoofCommon", Reference: "Pset_RoofCommon", ThermalTransmittance: "Pset_RoofCommon" },
  IFCCOLUMN: { LoadBearing: "Pset_ColumnCommon", FireRating: "Pset_ColumnCommon", Reference: "Pset_ColumnCommon", IsExternal: "Pset_ColumnCommon" },
  IFCBEAM: { LoadBearing: "Pset_BeamCommon", FireRating: "Pset_BeamCommon", Reference: "Pset_BeamCommon", IsExternal: "Pset_BeamCommon" },
  IFCSPACE: { Reference: "Pset_SpaceCommon", IsExternal: "Pset_SpaceCommon" },
  IFCSTAIR: { FireRating: "Pset_StairCommon", Reference: "Pset_StairCommon", IsExternal: "Pset_StairCommon" },
  IFCRAILING: { Reference: "Pset_RailingCommon", IsExternal: "Pset_RailingCommon" },
  IFCCURTAINWALL: { IsExternal: "Pset_CurtainWallCommon", FireRating: "Pset_CurtainWallCommon", Reference: "Pset_CurtainWallCommon", ThermalTransmittance: "Pset_CurtainWallCommon" },
  // MA-2b: a ceiling exports as IFCCOVERING — the lod_matrix's Ceilings row.
  IFCCOVERING: { FireRating: "Pset_CoveringCommon", AcousticRating: "Pset_CoveringCommon", Reference: "Pset_CoveringCommon", ThermalTransmittance: "Pset_CoveringCommon" },
};
export const standardPset = (entity, property) => STANDARD_PSETS[entity]?.[property] ?? null;

/** MA-2b: a lod_matrix row's Revit category → the IFC class its elements export as (GovernedElementExtractor's table). */
export const CATEGORY_ENTITY = { Walls: "IFCWALL", Floors: "IFCSLAB", Roofs: "IFCROOF", Ceilings: "IFCCOVERING", Doors: "IFCDOOR", Windows: "IFCWINDOW" };

/** MA-2b (design §3.4 step 5): the IDS of a matrix's DD stage, in the JSON shape compileIds writes — one specification per row
 *  that asks for properties, every property required. `matrix` is sentinel-core's parseLodMatrix answer. A qualified name
 *  ("Pset_WallCommon.FireRating") is required as written; a bare one ("FireRating") goes in its class's standard pset
 *  (STANDARD_PSETS), and one no standard pset holds is returned in `unmatched` with the reason — never dropped (rule 3 above);
 *  so is a qualified name in a standard set of another class only. A property named twice is required once.
 *  Deterministic, and a proposal of what to check: nothing here installs an ids@n. → {title, enforce: "warn", specifications, unmatched}. */
export function matrixToIds(matrix, { stage = "DD", label = null } = {}) {
  const specifications = [], unmatched = [];
  const standardSets = new Set(Object.values(STANDARD_PSETS).flatMap((m) => Object.values(m)));
  for (const row of matrix.rows) {
    const entity = CATEGORY_ENTITY[row.category];
    const ownSets = new Set(Object.values(STANDARD_PSETS[entity] ?? {}));
    const properties = [], seen = new Set();
    // A property the row names twice (bare and qualified) is required once; a standard set of another class only (a wall row
    // asking Pset_DoorCommon) is the matrix's slip — said in unmatched, never a requirement no element of the class can meet.
    const require = (pset, name) => { if (!seen.has(`${pset}.${name}`)) { seen.add(`${pset}.${name}`); properties.push({ pset, name, cardinality: "required" }); } };
    const said = (p, reason) => { if (!seen.has(p)) { seen.add(p); unmatched.push({ category: row.category, property: p, reason }); } };
    for (const p of row.properties) {
      const dot = p.indexOf(".");
      if (dot > 0 && dot < p.length - 1) {
        const pset = p.slice(0, dot);
        if (standardSets.has(pset) && !ownSets.has(pset)) said(p, `${pset} is not a standard set of ${entity} (${[...ownSets].join(", ") || "none"}) — name it in its class's set`);
        else require(pset, p.slice(dot + 1));
      } else if (standardPset(entity, p)) require(standardPset(entity, p), p);
      else said(p, `no standard property set holds ${p} for ${entity} — name it as Pset_X.${p}`);
    }
    if (properties.length) specifications.push({ name: `${row.category} · ${stage}`, applicability: { entity }, requirements: { properties, attributes: [] } });
  }
  return { title: `${matrix.standard_key} ${matrix.semver} · ${stage}${label ? ` (${label})` : ""}`, enforce: "warn", specifications, unmatched };
}

const REQUIREMENT = /\b(shall|must|is required to|are required to|mandatory)\b/i;
const CARDINALITY_PROHIBITED = /\b(shall not|must not|is prohibited|are prohibited|no .{0,30} shall)\b/i;

/** Split prose into candidate requirement sentences, keeping list bullets intact. */
export function sentences(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[.;:])\s+|\n+/)
    .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((s) => s.length > 12);
}

const firstMatch = (vocab, hay) => {
  for (const [re, value] of vocab) if (re.test(hay)) return value;
  return null;
};

/** An explicit Pset, written the way documents write it: "in Pset_WallCommon" or "Pset_BDS.Discipline". */
function findPset(sentence) {
  const dotted = sentence.match(/\b(Pset_[A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\b/);
  if (dotted) return { pset: dotted[1], property: dotted[2] };
  const plain = sentence.match(/\b(Pset_[A-Za-z0-9_]+)\b/);
  return plain ? { pset: plain[1], property: null } : null;
}

/** A CamelCase or quoted property name stated verbatim — always preferred over the vocabulary guess. */
function findExplicitProperty(sentence) {
  const quoted = sentence.match(/["“']([A-Za-z][A-Za-z0-9 _]{2,40})["”']/);
  if (quoted) return quoted[1].replace(/\s+/g, "");
  const camel = sentence.match(/\b([A-Z][a-z]+(?:[A-Z][a-z0-9]+)+)\b/);
  return camel ? camel[1] : null;
}

/** A required value: "shall be REI60", "shall be at least 60 minutes". */
function findValue(sentence) {
  const be = sentence.match(/\bshall be\s+(?:at least\s+|no less than\s+)?["“']?([A-Za-z0-9][A-Za-z0-9 .\-/]{0,24}?)["”']?\s*(?:\.|,|;|$)/i);
  if (!be) return null;
  const v = be[1].trim();
  // "recorded", "provided", "completed" describe the act of filling the field, not a value for it.
  if (/^(recorded|provided|completed|populated|used|issued|reviewed|checked|applied|maintained|agreed)$/i.test(v)) return null;
  return v;
}

/**
 * Compile a document into proposed IDS specifications.
 * Returns { specifications, unmatched, stats } — never throws on prose it cannot read.
 */
export function compileIds(text, { title = "Compiled from requirements" } = {}) {
  const specs = [];
  const unmatched = [];
  let considered = 0;

  for (const s of sentences(text)) {
    if (!REQUIREMENT.test(s)) continue;
    considered += 1;

    const entity = firstMatch(ENTITY_VOCAB, s);
    const psetHit = findPset(s);
    const property = (psetHit && psetHit.property) || findExplicitProperty(s) || firstMatch(PROPERTY_VOCAB, s);

    if (!entity || !property) {
      unmatched.push({
        sentence: s,
        reason: !entity && !property ? "no IFC entity and no property could be identified"
          : !entity ? "no IFC entity could be identified — name the element type the requirement applies to"
            : "no property could be identified — name the property, or write it as Pset_Name.PropertyName",
      });
      continue;
    }

    const prohibited = CARDINALITY_PROHIBITED.test(s);
    const value = prohibited ? null : findValue(s);
    // Confidence is about how much was READ rather than inferred: an explicit Pset and an explicit
    // property name is the strong case, a vocabulary match on both is the weak one. It is shown to
    // the reviewer, never used to auto-accept anything.
    const explicitProp = !!((psetHit && psetHit.property) || findExplicitProperty(s));
    const confidence = psetHit?.pset && explicitProp ? "high" : explicitProp || psetHit?.pset ? "medium" : "low";

    specs.push({
      name: `${entity.replace(/^IFC/, "")} — ${property}`,
      applicability: { entity },
      requirements: {
        properties: [{
          pset: psetHit?.pset || standardPset(entity, property),
          name: property,
          cardinality: prohibited ? "prohibited" : "required",
          ...(value ? { value } : {}),
        }],
      },
      confidence,
      source_sentence: s,          // the clause this came from — the whole point of review
    });
  }

  return {
    title,
    specifications: specs,
    unmatched,
    stats: { requirement_sentences: considered, compiled: specs.length, unmatched: unmatched.length },
    // Said on every output, because an IDS that silently covers half an EIR is worse than none.
    note: "A PROPOSAL, not a ruleset. Review every specification against its source_sentence, and read `unmatched` — those requirements are in the document and are NOT in this spec.",
  };
}
