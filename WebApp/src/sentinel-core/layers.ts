// sentinel-core/layers — DWG layer → build-category mapping + compliance. PURE (no OBC/DOM/node). Given a CAD
// layer name and a swappable layer ruleset (bds-layers.json — the BDS DWG Layer Standard as data, not code),
// decide deterministically what a layer is (Walls/Doors/…), which family + IDS params it seeds, and whether the
// name is on-standard. This is GhostBuilder's "deterministic-first" backbone: compliant layers map with NO AI
// call (confidence 1); only the genuine gaps (unrecognized names) are flagged `needsAI` for the interpreter.
// See docs/BDS_DWG_LAYER_STANDARD.md and the GhostBuilder v2 spec.

export type LayerEnforce = "reject" | "warn" | "off";

export interface LayerDef {
  layer: string;                                        // canonical name, e.g. "A-WALL-EXT"
  category: string;                                     // GhostBuilder build category, e.g. "Walls"
  family?: string;                                      // suggested BDS family
  params?: Record<string, string | number | boolean>;  // IDS params seeded onto the element
  requires?: string[];                                  // IDS params this layer flags as REQUIRED
  aliases?: string[];                                   // known non-standard names that map here
}

export interface LayerExtension {
  layer: string; major?: string; note?: string;
  params?: Record<string, string | number | boolean>;
}

export interface LayerRuleset {
  standard: string;
  format?: string;
  enforce: LayerEnforce;
  match?: { caseInsensitive?: boolean; trim?: boolean };
  ignore?: string[];                        // globs (with *) for non-model layers (annotation, grids…)
  disciplines?: Record<string, string>;     // e.g. { A: "Architectural", S: "Structural" }
  layers: LayerDef[];
  extensions?: LayerExtension[];
}

export type LayerMatchKind = "exact" | "alias" | "extension" | "pattern" | "ignored" | "none";

export interface LayerMapping {
  input: string;
  normalized: string;
  kind: LayerMatchKind;
  compliant: boolean;   // is the NAME itself on-standard?
  ignored: boolean;     // non-model layer → skip, not an error
  category?: string;    // GhostBuilder category when mappable
  family?: string;
  params?: Record<string, string | number | boolean>;
  requires?: string[];
  confidence: number;   // 1 exact/ignored · .9 extension · .95 alias · .7 pattern · 0 none
  suggestion?: string;  // canonical rename for an alias / near-miss
  needsAI: boolean;     // deterministic pass couldn't confidently map → send to the interpreter
  reason?: string;
}

export interface LayerValidation {
  standard: string;
  enforce: LayerEnforce;
  verdict: "ok" | "warn" | "rejected";
  total: number;
  counts: { compliant: number; ignored: number; nonCompliant: number; needsAI: number };
  nonCompliant: { input: string; suggestion?: string; reason?: string }[];
  needsAI: string[];
  mappings: LayerMapping[];
}

// Major group → GhostBuilder category, for format-conformant layers not explicitly listed in the ruleset.
const MAJOR_CATEGORY: Record<string, string> = {
  WALL: "Walls", DOOR: "Doors", WIND: "Windows", GLAZ: "Windows",
  FLOR: "Floors", SLAB: "Floors", CLNG: "Ceilings", COLS: "Columns",
  FURN: "Furniture", EQPM: "Furniture",
  BEAM: "(extension)", STRS: "(extension)", ROOF: "(extension)", DUCT: "(extension)", PIPE: "(extension)",
};
const MINOR_PARAMS: Record<string, Record<string, boolean>> = {
  EXT: { IsExternal: true }, INT: { IsExternal: false },
};
const MINOR_REQUIRES: Record<string, string[]> = { FIRE: ["FireRating"] };

function globToRegex(glob: string): RegExp | null {
  try {
    const rx = glob.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${rx}$`, "i");
  } catch { return null; }
}

/** Map ONE CAD layer name against a ruleset. Pure; never throws. */
export function mapLayer(raw: string, rs: LayerRuleset): LayerMapping {
  const ci = rs.match?.caseInsensitive !== false;
  const norm = (s: string) => { let v = s ?? ""; if (rs.match?.trim !== false) v = v.trim(); return ci ? v.toUpperCase() : v; };
  const input = raw ?? "";
  const normalized = norm(input);
  const base: LayerMapping = { input, normalized, kind: "none", compliant: false, ignored: false, confidence: 0, needsAI: true };

  if (!normalized) return { ...base, reason: "empty layer name" };

  // 1 · ignore globs — non-model layers are fine to skip, never an error
  for (const g of rs.ignore ?? []) {
    const rx = globToRegex(ci ? g.toUpperCase() : g);
    if (rx && rx.test(normalized)) return { ...base, kind: "ignored", compliant: true, ignored: true, confidence: 1, needsAI: false, reason: "non-model layer (ignored)" };
  }

  // 2 · exact canonical match
  const exact = rs.layers.find((l) => norm(l.layer) === normalized);
  if (exact) return { ...base, kind: "exact", compliant: true, confidence: 1, needsAI: false, category: exact.category, family: exact.family, params: exact.params, requires: exact.requires };

  // 3 · known alias → maps confidently, but the NAME is non-standard (suggest the rename)
  const aliased = rs.layers.find((l) => (l.aliases ?? []).some((a) => norm(a) === normalized));
  if (aliased) return { ...base, kind: "alias", compliant: false, confidence: 0.95, needsAI: false, category: aliased.category, family: aliased.family, params: aliased.params, requires: aliased.requires, suggestion: aliased.layer, reason: `non-standard name — maps to ${aliased.layer}` };

  // 4 · declared extension (recognized, but may not be a v1 build category)
  const ext = (rs.extensions ?? []).find((e) => norm(e.layer) === normalized);
  if (ext) {
    const cat = MAJOR_CATEGORY[ext.major ?? ""] ?? "(extension)";
    return { ...base, kind: "extension", compliant: true, confidence: 0.9, needsAI: cat === "(extension)", category: cat, params: ext.params, reason: ext.note ?? "extension layer" };
  }

  // 5 · format-conformant parse: D-MAJR-MINR[-STATUS]
  const parts = normalized.split("-");
  if (parts.length >= 2 && (rs.disciplines ? parts[0] in rs.disciplines : parts[0].length === 1)) {
    const major = parts[1];
    const minor = parts[2];
    const cat = MAJOR_CATEGORY[major];
    if (cat && cat !== "(extension)") {
      const params: Record<string, string | number | boolean> = { Discipline: parts[0], ...(MINOR_PARAMS[minor] ?? {}) };
      return { ...base, kind: "pattern", compliant: true, confidence: 0.7, needsAI: false, category: cat, params, requires: MINOR_REQUIRES[minor], reason: "standard format — derived mapping" };
    }
    // conforms to the format but the major group isn't a known model element
    return { ...base, kind: "pattern", compliant: true, confidence: 0, needsAI: true, reason: `standard format but unrecognized element '${major}'` };
  }

  // 6 · unrecognized → needs the interpreter; offer a keyword-based rename hint
  return { ...base, kind: "none", compliant: false, needsAI: true, confidence: 0, suggestion: guessRename(normalized), reason: "unrecognized layer name" };
}

function guessRename(name: string): string | undefined {
  const n = name.toUpperCase();
  const hit = (kw: string) => n.includes(kw);
  if (hit("EXT") && hit("WALL")) return "A-WALL-EXT";
  if (hit("WALL")) return "A-WALL-INT";
  if (hit("DOOR")) return "A-DOOR";
  if (hit("WIND") || hit("GLAZ")) return "A-WIND";
  if (hit("FLOOR") || hit("FLOR") || hit("SLAB")) return "A-FLOR";
  if (hit("CEIL") || hit("CLNG")) return "A-CLNG";
  if (hit("COL")) return "A-COLS";
  if (hit("FURN")) return "A-FURN";
  return undefined;
}

/** Validate + map a whole DWG's layer list. Pure; never throws. */
export function validateLayers(names: string[], rs: LayerRuleset): LayerValidation {
  const mappings = (names ?? []).map((n) => mapLayer(n, rs));
  const nonCompliant = mappings.filter((m) => !m.compliant && !m.ignored);
  const needsAI = mappings.filter((m) => m.needsAI && !m.ignored);
  const counts = {
    compliant: mappings.filter((m) => m.compliant && !m.ignored).length,
    ignored: mappings.filter((m) => m.ignored).length,
    nonCompliant: nonCompliant.length,
    needsAI: needsAI.length,
  };
  const verdict: LayerValidation["verdict"] =
    rs.enforce === "off" ? "ok"
      : rs.enforce === "reject" && nonCompliant.length > 0 ? "rejected"
        : nonCompliant.length > 0 ? "warn" : "ok";
  return {
    standard: rs.standard,
    enforce: rs.enforce,
    verdict,
    total: mappings.length,
    counts,
    nonCompliant: nonCompliant.map((m) => ({ input: m.input, suggestion: m.suggestion, reason: m.reason })),
    needsAI: needsAI.map((m) => m.input),
    mappings,
  };
}
