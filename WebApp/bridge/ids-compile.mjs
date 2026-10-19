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

import { notAValue } from "./changesets-typing.mjs";

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
    // Case ignored, as validateElement and the C# judge match a property (review): one property in two spellings is one.
    const once = (key) => !seen.has(key.toLowerCase()) && seen.add(key.toLowerCase());
    const require = (pset, name) => { if (once(`${pset}.${name}`)) properties.push({ pset, name, cardinality: "required" }); };
    const said = (p, reason) => { if (once(p)) unmatched.push({ category: row.category, property: p, reason }); };
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

const REQUIREMENT = /\b(shall|must|is required to|are required to|(?:is|are) to be|mandatory)\b/i;
const CARDINALITY_PROHIBITED = /\b(shall not|must not|is prohibited|are prohibited|no .{0,30} shall)\b/i;

/** Split prose into candidate requirement sentences, keeping list bullets intact. */
export function sentences(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    // Review C23: a short piece after a stop ("… shall be 60 min. or better.", "1 hr. minimum.") stays with the sentence before
    // it — dropped, it took the bound with it and the stored sentence read as a pinned value.
    .flatMap((line) => line.split(/(?<=[.;:])\s+/).reduce((out, s) => {
      if (out.length && s.trim().length <= 12) out[out.length - 1] += " " + s;
      else out.push(s);
      return out;
    }, []))
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
  // a quoted word in the value's place ("shall be 'FD30'") is the value, not a property name
  const quoted = sentence.match(/(?<!\bbe:?\s+)["“']([A-Za-z][A-Za-z0-9 _]{2,40})["”']/);
  if (quoted) return quoted[1].replace(/\s+/g, "");
  const camel = sentence.match(/\b([A-Z][a-z]+(?:[A-Z][a-z0-9]+)+)\b/);
  return camel ? camel[1] : null;
}

/** A required value: "shall be REI60", "shall be at least 60 minutes". */
function findValue(sentence) {
  // Review C23: a value may open with "-" (an FRL: -/60/60), hold a decimal point (1.5 hr: a stop ends it only before a blank or
  // the end) and EN 13501-2's subscript EI₁/EI₂. A value dropped here leaves a presence-only clause that the one-source weighing
  // cannot see (a catalogue value then written past "must be FD60"): "must be", "is to be", "shall be:", "shall have a fire rating
  // of", any run of blanks, a closing "!", and a decimal comma (0,18 — a comma ends the value only when no digit follows).
  const be = sentence.match(/\b(?:(?:shall|must|is\s+to|are\s+to)\s+be:?|(?:shall|must)\s+have\s+an?\s+[a-z][a-z -]{1,40}?\s+of)\s+(?:at least\s+|no less than\s+)?["“']?([A-Za-z0-9-][A-Za-z0-9₁₂ .,\-/]{0,24}?)["”']?\s*(?:[.!](?=\s|$)|,(?!\d)|;|$)/i);
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

  // Review C23 (context): a sentence is cut out of its document, and what stood around it — a heading, "Escape corridors:", a
  // hard-wrapped "or better.", an exception after it — narrows it without being in it. A value is cited from a sentence (Promote
  // writes it on every element of the class) only when the document said nothing else: every spec a whole-class one-value sentence
  // (notAValue), and nothing left once those sentences are taken out but blanks and bullet marks. Then each spec is source_alone.
  const whole = (sp) => { const p = sp.requirements.properties[0]; return p.value != null && notAValue(sp.source_sentence, p.value, sp.applicability.entity, `${p.pset}.${p.name}`) === null; };
  let rest = String(text || "").replace(/\r\n?/g, "\n");
  for (const sp of specs) rest = rest.replace(sp.source_sentence, "");
  if (specs.length && specs.every(whole) && /^[\s\-*•]*$/.test(rest)) for (const sp of specs) sp.source_alone = true;

  return {
    title,
    specifications: specs,
    unmatched,
    stats: { requirement_sentences: considered, compiled: specs.length, unmatched: unmatched.length },
    // Said on every output, because an IDS that silently covers half an EIR is worse than none.
    note: "A PROPOSAL, not a ruleset. Review every specification against its source_sentence, and read `unmatched` — those requirements are in the document and are NOT in this spec.",
  };
}

// ── The installed standards → an IDS (founder's 2026-10-19 decision Q5: "the whole loop stays in Sentinel") ─────────────
// The contract's required properties and the naming rules' level and parameter rules, compiled as matrixToIds compiles a
// matrix: deterministic, a proposal a lead installs (PUT …/artefacts/ids validates it and writes the ledger row), and nothing
// dropped silently — whatever an IDS cannot say, or Sentinel's IDS does not judge, is in `unmatched` with its reason and the
// check that still holds it. Spec: docs/superpowers/specs/2026-10-19-ids-from-standards.md.

/** The specifications this compiler makes carry `origin`; a regenerate replaces those and keeps every other one (an EIR's,
 *  a pack's, a hand-written upload's). */
export const GENERATED_ORIGINS = ["contract", "ruleset"];
const ENTITY_LABEL = { IFCBUILDINGSTOREY: "Levels", ...Object.fromEntries(Object.entries(CATEGORY_ENTITY).map(([c, e]) => [e, c])) };
const DEFAULT_TOKEN = "[A-Za-z0-9\\-]+"; // rule-engine.ts compiledPattern (C# CompiledPattern)
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A naming rule's name pattern as RuleEngine.compiledPattern builds it, its whitelist as exact alternatives; null when it checks nothing. */
export function rulePatternOf(r) {
  const defs = r.token_defs ?? {}, tokens = r.tokens ?? [];
  const alts = [
    ...(tokens.length ? [tokens.map((t) => (defs[t] !== undefined ? `(?:${defs[t]})` : DEFAULT_TOKEN)).join(escapeRe(r.separator ?? "_"))] : []),
    ...(r.whitelist ?? []).map(escapeRe),
  ];
  return alts.length ? `^(?:${alts.join("|")})$` : null;
}

/** The class a buildingSMART common set belongs to, as the contract's gate reads it (delivery-gate COMMON_PSET_RX): Pset_WallCommon →
 *  IFCWALL, Pset_AirTerminalTypeCommon → IFCAIRTERMINAL; any other set names no class → null. */
export const commonSetClass = (pset) => { const m = /^Pset_(.+)Common$/i.exec(pset); return m ? `IFC${m[1].toUpperCase().replace(/TYPE$/, "")}` : null; };

const facetKey = (entity, f) => [entity, f.pset === undefined ? "@" : f.pset ?? "*", f.name, f.cardinality, f.value ?? "", f.pattern ?? ""].join("|").toLowerCase();
const RULE_ELSEWHERE = {
  type: "a type's name is written on the IFC type object, and Sentinel's IDS judges placed elements",
  grid: "a grid line is not an element Sentinel's IDS judges",
  sheet: "sheets are not in an IFC model", view: "views are not in an IFC model",
  workset: "worksets are not in an IFC model", family: "a family's name is not an IFC attribute Sentinel's IDS judges",
};

/**
 * `contract`, `ruleset`, `naming`: the standard in force as {body, label, sha256}, or null. `current`: the IDS in force's body,
 * or null — its specifications this compiler did not make are kept, and a requirement one of them already makes is not repeated.
 * → {ids: {title, enforce, specifications, generated_from}, added, kept, unmatched: [{from, item, reason, checked_by?}]}.
 */
export function standardsToIds({ contract = null, ruleset = null, naming = null } = {}, { current = null } = {}) {
  const unmatched = [], made = new Map();
  const say = (from, item, reason, checked_by) => unmatched.push({ from, item, reason, ...(checked_by ? { checked_by } : {}) });
  const kept = (current?.specifications ?? []).filter((s) => !GENERATED_ORIGINS.includes(s?.origin));
  const already = new Map();
  for (const s of kept) for (const [k, list] of [["properties", s.requirements?.properties], ["attributes", s.requirements?.attributes]])
    for (const f of list ?? []) already.set(facetKey(s.applicability?.entity ?? "", k === "attributes" ? { ...f, pset: undefined } : f), s.name);
  const add = (origin, id, entity, list, facet, from, item) => {
    const dup = already.get(facetKey(entity, list === "attributes" ? { ...facet, pset: undefined } : facet));
    if (dup) return say(from, item, `already required by the IDS in force ('${dup}')`, "the IDS in force");
    const k = `${origin}|${id}|${entity}`;
    if (!made.has(k)) made.set(k, { name: `${ENTITY_LABEL[entity] ?? entity} · ${origin === "contract" ? `contract ${id}` : `naming ${id}`}`, origin, applicability: { entity }, requirements: { properties: [], attributes: [] } });
    const reqs = made.get(k).requirements[list];
    if (!reqs.some((f) => facetKey(entity, f) === facetKey(entity, facet))) reqs.push(facet);
  };

  if (contract) {
    const c = contract.body, by = "the contract's delivery gate (upload and publish)";
    const whole = "a whole-file rule — Sentinel's IDS judges each element, so it stays a contract rule";
    for (const p of c.required_properties) {
      const dot = p.indexOf(".");
      if (!(dot > 0 && dot < p.length - 1)) { say("contract", p, `names no property set: the contract checks it on whichever classes carry it, and an IDS must name the class — write it as Pset_WallCommon.${p}`, by); continue; }
      const pset = p.slice(0, dot), name = p.slice(dot + 1), entity = commonSetClass(pset);
      if (!entity) { say("contract", p, `${pset} is not a buildingSMART common set (Pset_<Class>Common), so it names no class: the contract checks it on whichever classes carry it`, by); continue; }
      add("contract", c.contract_key, entity, "properties", { pset, name, cardinality: "required" }, "contract", p);
    }
    for (const p of c.required_psets) say("contract", p, `a property set with no property named — Sentinel's IDS checks named properties; name the ones you need (e.g. ${p}.Reference) under required properties`, by);
    say("contract", `IFC schema ${c.ifc_schema}`, whole, by);
    for (const e of c.required_entities) say("contract", `${e.entity}: at least ${e.min_count}`, whole, by);
    for (const e of c.forbidden_entities) say("contract", `${e.entity}: at most ${e.max_count}, at most ${Math.round(e.max_ratio * 100)}% of building elements`, whole, by);
    if (c.require_georeference) say("contract", "georeference", whole, by);
    if (c.min_coverage != null && c.min_coverage < 1 && c.required_properties.length)
      say("contract", `coverage ${Math.round(c.min_coverage * 100)}%`, "the contract passes a class when that share of its elements carry each property; an IDS asks it of every element, so the IDS is stricter", by);
  }

  if (ruleset) {
    const by = "Sentinel's naming check in Revit";
    for (const r of ruleset.body.rules) {
      const item = `${r.id} (${r.target})`;
      if (r.target === "level") {
        const pattern = rulePatternOf(r);
        if (!pattern) { say("ruleset", item, "has no tokens or names to check", by); continue; }
        if (pattern.includes("{org}")) { say("ruleset", item, "uses {org}, which Revit fills with the office's code at check time — an IDS needs the name written out", by); continue; }
        add("ruleset", r.id, "IFCBUILDINGSTOREY", "attributes", { name: "Name", pattern, cardinality: "required" }, "ruleset", item);
        if (r.exclusions?.length) say("ruleset", `${item} exclusions`, "the names a rule skips cannot be said in an IDS — the IDS checks every level, so it is stricter", by);
      } else if (r.target === "parameter") {
        const cats = r.categories ?? [], ents = cats.map((x) => CATEGORY_ENTITY[x]);
        if (!r.parameter_name || r.parameter_name.includes("{org}")) { say("ruleset", item, "the parameter is named with {org}, which Revit fills with the office's code at check time — an IDS needs the name written out", by); continue; }
        if (!cats.length || ents.some((e) => !e)) { say("ruleset", item, `applies to ${cats.length ? cats.filter((x, i) => !ents[i]).join(", ") : "views or items"} — not a category Sentinel's IDS judges (${Object.keys(CATEGORY_ENTITY).join(", ")})`, by); continue; }
        for (const e of ents) add("ruleset", r.id, e, "properties", { pset: null, name: r.parameter_name, cardinality: "required" }, "ruleset", item);
      } else say("ruleset", item, RULE_ELSEWHERE[r.target] ?? `target '${r.target}' is not in an IFC model`, by);
    }
  }

  if (naming) say("naming", naming.body.title ?? naming.label, "names files (containers), not what is inside them — an IDS checks a file's contents", "the naming check at upload and publish");

  const generated = [...made.values()].filter((s) => s.requirements.properties.length || s.requirements.attributes.length);
  const from = (s) => (s ? { label: s.label, sha256: s.sha256 } : null);
  return {
    ids: {
      title: current?.title ?? "Sentinel standards IDS", enforce: current?.enforce ?? "warn",
      specifications: [...kept, ...generated],
      generated_from: { contract: from(contract), ruleset: from(ruleset), naming: from(naming) },
    },
    added: generated.length, kept: kept.length, unmatched,
  };
}

// ── The JSON spec → buildingSMART IDS 1.0 XML (for IfcTester, and for a consultant who wants the .ids file) ─────────────
const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A JS pattern (unanchored, as ids.ts tests it) → the XSD pattern IDS uses (always whole-string), or null when it uses what
 *  XSD has no word for (lookarounds, \b, back-references, lazy quantifiers, an anchor inside). */
export function toXsdPattern(js) {
  let s = String(js);
  if (/\(\?(?!:)|\\[bB1-9]|[*+?}]\?/.test(s)) return null;
  const start = s.startsWith("^"), end = /(^|[^\\])\$$/.test(s);
  s = s.slice(start ? 1 : 0, end ? -1 : undefined);
  let inClass = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === "[") inClass = true;
    else if (s[i] === "]") inClass = false;
    else if (!inClass && (s[i] === "^" || s[i] === "$")) return null;
  }
  s = s.replace(/\(\?:/g, "(");
  return `${start ? "" : ".*"}${s}${end ? "" : ".*"}`;
}

const IFC_VERSION = { IFC2X3: "IFC2X3", IFC4: "IFC4", IFC4X3: "IFC4X3_ADD2" };
const PLAIN_CLASS = /^IFC[A-Z0-9]+$/i;

/** → {xml, skipped: [{specification, requirement, reason}]}. A plain class applies with its standard-case subtypes (as the
 *  contract counts it, and as ids.ts's unanchored match reaches them); a regex class becomes an XSD pattern. */
export function idsToXml(ids, { ifcSchema = null, subtypes = {} } = {}) {
  const skipped = [];
  const value = (v, pattern) => (pattern != null
    ? `<xs:restriction base="xs:string"><xs:pattern value="${xmlEsc(pattern)}"/></xs:restriction>`
    : `<simpleValue>${xmlEsc(v)}</simpleValue>`);
  const versions = IFC_VERSION[ifcSchema] ?? "IFC2X3 IFC4";
  const specs = (ids.specifications ?? []).map((s) => {
    const raw = String(s.applicability?.entity ?? "IFC.*"), ent = PLAIN_CLASS.test(raw) ? raw.toUpperCase() : raw; // never upper-case a regex (\d → \D)
    const names = PLAIN_CLASS.test(ent) ? [ent, ...(subtypes[ent] ?? [])] : null;
    const entPattern = names ? null : toXsdPattern(ent);
    if (!names && !entPattern) { skipped.push({ specification: s.name, requirement: "(applicability)", reason: `the class pattern /${ent}/ has no XSD form` }); return ""; }
    const entityXml = names?.length === 1 ? value(names[0])
      : names ? `<xs:restriction base="xs:string">${names.map((n) => `<xs:enumeration value="${xmlEsc(n)}"/>`).join("")}</xs:restriction>`
      : value(null, entPattern);
    const pdt = s.applicability?.predefinedType ? `<predefinedType>${value(String(s.applicability.predefinedType).toUpperCase())}</predefinedType>` : "";
    const facet = (f, label, head) => {
      if (f.pattern == null && f.value == null) return head;
      const x = f.pattern != null ? toXsdPattern(f.pattern) : null;
      if (f.pattern != null && x == null) { skipped.push({ specification: s.name, requirement: label, reason: `the pattern /${f.pattern}/ has no XSD form` }); return null; }
      return `${head}<value>${value(f.value, x)}</value>`;
    };
    const reqs = [
      ...(s.requirements?.properties ?? []).map((p) => {
        const inner = facet(p, `${p.pset}.${p.name}`, `<propertySet>${p.pset ? value(p.pset) : value(null, ".+")}</propertySet><baseName>${value(p.name)}</baseName>`);
        return inner == null ? "" : `<property cardinality="${p.cardinality}">${inner}</property>`;
      }),
      ...(s.requirements?.attributes ?? []).map((a) => {
        const inner = facet(a, `@${a.name}`, `<name>${value(a.name)}</name>`);
        return inner == null ? "" : `<attribute cardinality="${a.cardinality}">${inner}</attribute>`;
      }),
    ].join("");
    return `<specification name="${xmlEsc(s.name)}" ifcVersion="${versions}"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name>${entityXml}</name>${pdt}</entity></applicability><requirements>${reqs}</requirements></specification>`;
  }).filter(Boolean).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">\n<info><title>${xmlEsc(ids.title ?? "Sentinel IDS")}</title></info>\n<specifications>\n${specs}\n</specifications>\n</ids>\n`;
  return { xml, skipped };
}
