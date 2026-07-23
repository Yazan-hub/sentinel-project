// sentinel-core/guideline — the Office Modelling Guideline: which family + TYPE to place, per element,
// per condition. PURE (no OBC/DOM/node), so the same decision runs in the browser, on the bridge, and —
// once ported — in the Revit add-in.
//
// WHY THIS EXISTS. `layers.ts` answers "is this a wall?" from a DWG layer. It cannot answer "WHICH wall" —
// `bds-layers.json` carries exactly one family per layer, so every A-WALL-EXT line becomes the same type
// regardless of fire rating, thickness or level. A real modeller picks from the office's standard set based
// on what the element actually is. That knowledge exists in every practice; this file makes it data.
//
// DETERMINISTIC BY DESIGN. Type selection is a LOOKUP, not a judgement. The same inputs must yield the same
// type on every run — if a model can't be rebuilt identically, the audit trail that says "this element was
// accepted" is worth nothing. The AI's job is to AUTHOR the guideline (proposed from the office's documents,
// approved by a human) and to fill gaps it doesn't cover, flagged low-confidence. Never to choose at build time.
//
// FIRST MATCH WINS, so rules are ordered most-specific-first. That is a sorted lookup table, deliberately not
// a rules engine: an office standard is a list of "in this case, use that", and anything more expressive
// becomes something nobody in the practice can read or maintain.

/** One condition. Every field present must match; absent fields are wildcards. */
export interface GuidelineWhen {
  layer?: string;                                  // DWG layer, case-insensitive
  level?: string;                                  // e.g. "Ground", "Roof"
  discipline?: string;                             // "A" | "S" | "M" …
  /** Parameter values the element already carries (from the spec, the DWG, or IDS). Case-insensitive
   *  on the name; the value matches on a case-insensitive substring, so "FR60" hits "FR60 / REI60". */
  params?: Record<string, string>;
}

export interface GuidelineUse {
  family: string;
  type?: string;
  /**
   * A type name with `{thickness}` substituted from the measured geometry, e.g.
   * `"BDS_EXT_ARC_CMU_{thickness} mm"`. This exists because the BDS template's wall names encode a
   * thickness that MATCHES the real Width parameter (32/32 conforming types) — so the office rule only
   * has to decide the MATERIAL, and the drawing supplies the size. Writing one rule per thickness would
   * be 14 rules per material saying the same thing.
   */
  typePattern?: string;
  /** Parameters this choice implies — seeded onto the element, same shape layers.ts already uses. */
  params?: Record<string, string | number | boolean>;
}

export interface GuidelineRule {
  when: GuidelineWhen;
  use: GuidelineUse;
  why?: string;                                    // shown in the review gate, so a reviewer sees the reason
}

export interface GuidelineElement {
  category: string;                                // "Walls" | "Floors" | … (matches layers.ts categories)
  rules: GuidelineRule[];
  /** Used when no rule matches. Without one, an unmatched element is reported as a gap, not guessed. */
  default?: GuidelineUse;
}

/** Drawing graphics — the half that makes 2D come out annotated. Consumed by the view generator, not by
 *  placement, but it lives in the same document because it is the same office decision. */
export interface GuidelineGraphics {
  dimensionStyle?: string;
  textStyle?: string;
  /** Element category → the tag family to place in views. */
  tags?: Record<string, string>;
}

export interface GuidelineViewStandard {
  use: string;                                     // "GA Plan" | "RCP" | "Section" …
  template?: string;                               // Revit view template name
  scale?: string;
  detailLevel?: "Coarse" | "Medium" | "Fine";
  tag?: string[];                                  // categories to tag automatically
}

export interface Guideline {
  standard: string;
  office?: string;
  version?: number;
  /** Sections that already exist as their own files — referenced, never duplicated. */
  references?: { layers?: string; ids?: string; naming?: string };
  elements: GuidelineElement[];
  graphics?: GuidelineGraphics;
  views?: GuidelineViewStandard[];
}

export interface Resolution {
  family: string;
  type?: string;
  params: Record<string, string | number | boolean>;
  /** "rule" = an explicit office rule matched · "default" = the category fallback · "none" = a real gap. */
  source: "rule" | "default" | "none";
  /** 1 for an explicit rule (the office decided this), 0.6 for a default (plausible, unconfirmed),
   *  0 for a gap. Feeds the review gate's pre-tick threshold, same as layers.ts confidence. */
  confidence: number;
  why?: string;
  /** How specific the winning rule was — useful when explaining why one rule beat another. */
  matched?: string[];
  /** Set when the resolved type is NOT in the template. The review gate shows these so a human picks,
   *  rather than the builder inventing a type or silently snapping to the nearest size. */
  available?: string[];
}

export interface ResolveInput {
  category: string;
  layer?: string;
  level?: string;
  discipline?: string;
  params?: Record<string, string>;
  /** Measured from the drawing (mm) — fills `{thickness}` in a typePattern. */
  thicknessMm?: number;
}

/** One row of the template's harvested type catalogue (bds-type-catalog.json). */
export interface CatalogType {
  category: string;
  family: string;
  type: string;
  width_mm?: number | null;
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

/** Resolve `use` to a concrete type name: an explicit `type` wins, else `{thickness}` is substituted
 *  from the measured geometry. Returns undefined when a pattern has no measurement to fill it. */
function fillPattern(use: GuidelineUse, input: ResolveInput): string | undefined {
  if (use.type) return use.type;
  if (!use.typePattern) return undefined;
  if (input.thicknessMm === undefined || input.thicknessMm === null) return undefined;
  // Round to the nearest mm — a DWG measurement is never exactly 200.0, and template names are integers.
  return use.typePattern.replace(/\{thickness\}/g, String(Math.round(input.thicknessMm)));
}

/** Types in the catalogue that a pattern could produce — the options a reviewer picks from when the
 *  measured size has no matching type. Ordered by size so the list reads sensibly. */
function patternRegex(pattern: string): RegExp {
  // Split on the placeholder FIRST, then escape each literal part — escaping the whole string and
  // trying to un-escape the placeholder afterwards is where this goes wrong.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + pattern.split("{thickness}").map(esc).join("(\\d+)") + "$", "i");
}

function patternOptions(pattern: string, catalog: CatalogType[]): string[] {
  const rx = patternRegex(pattern);
  return catalog
    .map((c) => c.type)
    .filter((t) => rx.test(t))
    .sort((a, b) => Number(a.match(rx)?.[1] ?? 0) - Number(b.match(rx)?.[1] ?? 0));
}

/** Does `when` match the input? Every stated field must match; unstated fields are wildcards. */
function matches(when: GuidelineWhen, input: ResolveInput): string[] | null {
  const hit: string[] = [];
  if (when.layer !== undefined) {
    if (norm(when.layer) !== norm(input.layer)) return null;
    hit.push("layer");
  }
  if (when.level !== undefined) {
    if (norm(when.level) !== norm(input.level)) return null;
    hit.push("level");
  }
  if (when.discipline !== undefined) {
    if (norm(when.discipline) !== norm(input.discipline)) return null;
    hit.push("discipline");
  }
  for (const [k, v] of Object.entries(when.params ?? {})) {
    // Case-insensitive on the parameter NAME — a spec may say "Fire Rating" where the model says
    // "FireRating" — and substring on the value, so "FR60" matches "FR60 / REI60".
    const key = Object.keys(input.params ?? {}).find((n) => norm(n).replace(/\s+/g, "") === norm(k).replace(/\s+/g, ""));
    if (key === undefined) return null;
    if (!norm((input.params ?? {})[key]).includes(norm(v))) return null;
    hit.push(`param:${k}`);
  }
  return hit;
}

/** How many conditions a rule states — used only to keep authoring forgiving (see resolveType). */
const specificity = (w: GuidelineWhen) =>
  (w.layer ? 1 : 0) + (w.level ? 1 : 0) + (w.discipline ? 1 : 0) + Object.keys(w.params ?? {}).length;

/**
 * Pick the family + type for one element. First matching rule wins, in document order — the office's own
 * ordering is authoritative, because that is how a written standard reads.
 *
 * One forgiveness: rules that state MORE conditions are tried first within the category. Authors write
 * "external walls are X, and FR60 external walls are Y" in that natural order and expect the second to
 * win; ordering by specificity means they get that without having to think about precedence.
 */
/**
 * Resolve, then CHECK the answer against the template's real type catalogue.
 *
 * This is the guard that makes the original mistake impossible: a guideline written from a document
 * named `BDS_Wall_Ext_200_FR60`, a type that does not exist, and the builder would have provisioned an
 * invented type on first run. Here, a type the template lacks comes back with `available` listing what
 * the template DOES have, and confidence dropped — so the review gate asks a human instead of guessing.
 */
export function resolveWithCatalog(
  guideline: Guideline,
  input: ResolveInput,
  catalog: CatalogType[],
): Resolution {
  const r = resolveType(guideline, input);
  if (r.source === "none" || !r.type) return r;

  const inCatalog = catalog.some(
    (c) => norm(c.type) === norm(r.type) && norm(c.category) === norm(input.category),
  );
  if (inCatalog) return r;

  // Find the rule that produced this, so we can offer what its pattern COULD produce.
  const el = guideline.elements.find((e) => norm(e.category) === norm(input.category));
  const pattern = el?.rules.find((x) => x.use.typePattern && matches(x.when, input))?.use.typePattern;
  const options = pattern
    ? patternOptions(pattern, catalog.filter((c) => norm(c.category) === norm(input.category)))
    : [];

  return {
    ...r,
    confidence: 0,
    available: options,
    why:
      `"${r.type}" is not in the template. ` +
      (options.length
        ? `Available: ${options.join(", ")}.`
        : "No comparable type found — the office standard may need this type added."),
  };
}

/** Every type a guideline names that the template does NOT contain. Run this when a guideline is
 *  authored or edited: it is the difference between a standard and a wish list. */
export function validateAgainstCatalog(guideline: Guideline, catalog: CatalogType[]): string[] {
  const errs: string[] = [];
  for (const el of guideline.elements) {
    const inCat = catalog.filter((c) => norm(c.category) === norm(el.category));
    if (!inCat.length) {
      errs.push(`"${el.category}" — the template has no types in this category at all.`);
      continue;
    }
    const check = (use: GuidelineUse, label: string) => {
      if (!inCat.some((c) => norm(c.family) === norm(use.family)))
        errs.push(`${label}: family "${use.family}" is not in the template.`);
      if (use.type && !inCat.some((c) => norm(c.type) === norm(use.type)))
        errs.push(`${label}: type "${use.type}" is not in the template.`);
      if (use.typePattern && !patternOptions(use.typePattern, inCat).length)
        errs.push(`${label}: pattern "${use.typePattern}" matches no type in the template.`);
    };
    el.rules.forEach((r, i) => check(r.use, `${el.category} rule ${i + 1}`));
    if (el.default) check(el.default, `${el.category} default`);
  }
  return errs;
}

export function resolveType(guideline: Guideline, input: ResolveInput): Resolution {
  const el = guideline.elements.find((e) => norm(e.category) === norm(input.category));
  if (!el) return { family: "", params: {}, source: "none", confidence: 0 };

  const ordered = el.rules
    .map((rule, i) => ({ rule, i }))
    .sort((a, b) => specificity(b.rule.when) - specificity(a.rule.when) || a.i - b.i);

  for (const { rule } of ordered) {
    const hit = matches(rule.when, input);
    if (hit) {
      return {
        family: rule.use.family,
        type: fillPattern(rule.use, input),
        params: rule.use.params ?? {},
        source: "rule",
        confidence: 1,
        why: rule.why,
        matched: hit,
      };
    }
  }

  if (el.default) {
    return {
      family: el.default.family,
      type: el.default.type,
      params: el.default.params ?? {},
      source: "default",
      confidence: 0.6,
      why: `No office rule matched — fell back to the ${el.category} default.`,
    };
  }
  return { family: "", params: {}, source: "none", confidence: 0 };
}

/** Every (category, layer) the guideline does NOT cover. The honest gap list an office works through
 *  when adopting the standard, and the input to "what should the AI propose next?". */
export function coverageGaps(guideline: Guideline, seen: ResolveInput[]): ResolveInput[] {
  return seen.filter((s) => resolveType(guideline, s).source === "none");
}

/** Structural problems worth blocking on before a guideline is trusted to build anything. */
export function validateGuideline(g: Guideline): string[] {
  const errs: string[] = [];
  if (!g.standard) errs.push("Guideline has no `standard` name.");
  if (!g.elements?.length) errs.push("Guideline defines no elements.");
  for (const el of g.elements ?? []) {
    if (!el.category) errs.push("An element block has no `category`.");
    if (!el.rules?.length && !el.default) errs.push(`"${el.category}" has neither rules nor a default.`);
    for (const r of el.rules ?? []) {
      if (!r.use?.family) errs.push(`A rule in "${el.category}" has no family to place.`);
      if (!Object.keys(r.when ?? {}).length)
        errs.push(`A rule in "${el.category}" has an empty \`when\` — it would match everything; use \`default\`.`);
    }
  }
  return errs;
}
