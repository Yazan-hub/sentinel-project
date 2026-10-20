// sentinel-core/ids — Information Delivery Specification (buildingSMART IDS) model + validator. PURE TS
// (no OBC/DOM). Given a parsed IdsSpec and an element's extracted properties, decide pass/fail per
// specification and explain WHY. This is the deterministic core of KF-B (IDS validation + colour-coding);
// the XML parser is ids-parse.ts, the model runner is adapter/model-validate.ts.

import type { ElementProperties } from "./adapter/element-properties";

export type Cardinality = "required" | "optional" | "prohibited";

/** The value restrictions an .ids file can state beyond one value or one pattern (parseIds): the value is one of `enumeration`,
 *  within `bounds` (a number), of `length` characters. Judged in either mode; only parseIds writes them. */
interface IdsValueRestrictions {
  enumeration?: string[];
  bounds?: { minInclusive?: number; maxInclusive?: number; minExclusive?: number; maxExclusive?: number };
  length?: { length?: number; minLength?: number; maxLength?: number };
}
/** A required/prohibited PROPERTY in a property set (Pset_ or Qto_). */
export interface IdsPropertyFacet extends IdsValueRestrictions {
  pset: string | null; // property-set name, e.g. "Pset_WallCommon"; null = search every group (a compiled requirement that named none)
  name: string; // property name, e.g. "IsExternal"
  datatype?: string; // e.g. "IFCBOOLEAN": judged in an ids10 specification when the reader carried the value's type
  value?: string; // exact required value (case-insensitive; ids10: case-sensitive, a number within 1e-6)
  pattern?: string; // regex the value must match
  cardinality: Cardinality;
}
/** A required/prohibited ATTRIBUTE (Name, Tag, ObjectType, …). */
export interface IdsAttributeFacet extends IdsValueRestrictions {
  name: string;
  value?: string;
  pattern?: string;
  cardinality: Cardinality;
}
export interface IdsApplicability {
  entity?: string; // IFC class (regex, case-insensitive), e.g. "IFCWALL"
  predefinedType?: string;
  /** IDS 1.0 lets applicability hold attribute and property facets too: an element applies only when it meets each. */
  attributes?: IdsAttributeFacet[];
  properties?: IdsPropertyFacet[];
}
export interface IdsSpecification {
  name: string;
  applicability: IdsApplicability;
  /** `entity`: an entity facet among the requirements — the element must be that class. */
  requirements: { properties: IdsPropertyFacet[]; attributes: IdsAttributeFacet[]; entity?: IdsApplicability };
  /** IDS 1.0 specification cardinality (applicability minOccurs/maxOccurs): "required" = at least one element must apply (judged
   *  on a whole model only, judgeModel); "prohibited" = no element may apply. Absent = optional. */
  cardinality?: Cardinality;
  /** Read from an .ids file (parseIds): judged by IDS 1.0's rules as IfcTester reads them — names and text case-sensitive, a
   *  number within 1e-6, the dataType, a USERDEFINED predefined type read from ObjectType. Sentinel's own IDS keeps its looser rules. */
  ids10?: boolean;
}
export interface IdsSpec {
  title: string;
  /** How the Governed Publish gate treats element-check failures. Applied by the bridge (adjudicate stays a
   *  pure validator): "reject" (default) fails the publish; "warn" publishes but records + raises the failures
   *  as tracked issues; "off" ignores them. Lets a pilot loosen data checks at early schematic, then tighten. */
  enforce?: "reject" | "warn" | "off";
  specifications: IdsSpecification[];
  /** What parseIds read but Sentinel cannot judge ("Walls: the classification facet in requirements"): said on screen, and a
   *  verdict on such an IDS is not a full IDS 1.0 verdict. */
  unsupported?: string[];
}

export interface Failure {
  specification: string;
  requirement: string; // e.g. "Pset_WallCommon.IsExternal"
  reason: string;
}
export interface ElementResult {
  inScope: boolean; // did any specification apply?
  pass: boolean;
  failures: Failure[];
}

/** Does a specification's applicability target this element? Its entity, and every attribute/property facet it holds. */
export function applies(spec: IdsSpecification, el: ElementProperties): boolean {
  if (!isEntity(spec.applicability, el, spec.ids10)) return false;
  const unmet: Failure[] = [];
  for (const a of spec.applicability.attributes ?? []) checkFacet({ ...a, cardinality: "required" }, attrValue(el, a.name), spec, `@${a.name}`, unmet);
  for (const p of spec.applicability.properties ?? []) checkFacet({ ...p, cardinality: "required" }, propRow(el, p.pset, p.name, spec.ids10), spec, `${p.pset}.${p.name}`, unmet);
  return unmet.length === 0;
}

function isEntity(a: IdsApplicability, el: ElementProperties, ids10?: boolean): boolean {
  const cls = (el.identity?.Class ?? "").toUpperCase();
  if (a.entity) {
    let re: RegExp;
    try { re = new RegExp(a.entity, "i"); } catch { re = new RegExp(escapeRe(a.entity), "i"); }
    if (!re.test(cls)) return false;
  }
  if (a.predefinedType) {
    const pt = el.identity?.PredefinedType ?? "";
    if (!ids10) return pt.toUpperCase() === a.predefinedType.toUpperCase();
    // IDS 1.0 (IfcTester's get_predefined_type): a USERDEFINED element's type is its ObjectType, compared as written.
    return (pt === "USERDEFINED" && a.predefinedType !== "USERDEFINED" ? el.identity?.ObjectType ?? "" : pt) === a.predefinedType;
  }
  return true;
}

/** Validate one element against every applicable specification. */
export function validateElement(spec: IdsSpec, el: ElementProperties): ElementResult {
  const failures: Failure[] = [];
  let inScope = false;

  for (const s of spec.specifications ?? []) {
    if (!applies(s, el)) continue;
    inScope = true;
    if (s.cardinality === "prohibited") { // IDS 1.0: a prohibited specification's requirements are not judged — matching it fails
      failures.push({ specification: s.name, requirement: "(applicability)", reason: "the specification is PROHIBITED: no element may match it" });
      continue;
    }
    const ent = s.requirements?.entity;
    if (ent && !isEntity(ent, el, s.ids10)) {
      failures.push({ specification: s.name, requirement: "@class", reason: `is ${el.identity?.Class ?? "no class"}${el.identity?.PredefinedType ? ` (${el.identity.PredefinedType})` : ""}, required /${ent.entity}/${ent.predefinedType ? ` (${ent.predefinedType})` : ""}` });
    }
    for (const a of s.requirements?.attributes ?? []) checkFacet(a, attrValue(el, a.name), s, `@${a.name}`, failures);
    for (const p of s.requirements?.properties ?? []) checkFacet(p, propRow(el, p.pset, p.name, s.ids10), s, `${p.pset}.${p.name}`, failures);
  }
  return { inScope, pass: failures.length === 0, failures };
}

// ── helpers ──────────────────────────────────────────────────────────────────
type Actual = { value?: string; type?: string } | undefined;
type Facet = IdsAttributeFacet & { datatype?: string };

function checkFacet(f: Facet, actual: Actual, s: IdsSpecification, label: string, out: Failure[]): void {
  const v = actual?.value;
  const present = v != null && v !== "";
  const push = (reason: string) => out.push({ specification: s.name, requirement: label, reason });
  const wrong = present ? mismatches(f, String(v), actual?.type, s.ids10) : [];
  if (f.cardinality === "prohibited") {
    // IDS 1.0: a prohibited facet fails only where the required one would pass — "shall not be X" allows every other value.
    if (present && !wrong.length) push(f.value != null || f.pattern != null || f.enumeration || f.bounds || f.length ? `is "${v}", which it must not be` : `must be ABSENT but is "${v}"`);
    return;
  }
  if (!present) {
    if (f.cardinality === "required") push("REQUIRED but missing");
    return; // optional + absent → fine
  }
  for (const w of wrong) push(w); // present → value / pattern / restriction checks (apply to required and optional-present)
}

/** Why a present value does not meet the facet; [] when it does. */
function mismatches(f: Facet, v: string, type: string | undefined, ids10?: boolean): string[] {
  const out: string[] = [];
  // dataType is judged where the reader carried the value's IFC type (the bridge's web-ifc reader does).
  if (ids10 && f.datatype && type && type.toUpperCase() !== f.datatype.toUpperCase()) out.push(`is a ${type}, required ${f.datatype}`);
  if (f.value != null && !same(v, f.value, ids10)) out.push(`is "${v}", required "${f.value}"`);
  if (f.pattern != null) {
    // SEC-5: a pattern that does not compile is never a pass (the bridge refuses one on install since SEC-5).
    let ok = false, broken = false;
    try { ok = new RegExp(f.pattern).test(v); } catch { broken = true; }
    if (!ok) out.push(broken ? `the requirement's pattern /${f.pattern}/ does not compile — not a pass` : `is "${v}", must match /${f.pattern}/`);
  }
  if (f.enumeration && !f.enumeration.some((e) => same(v, e, ids10))) out.push(`is "${v}", required one of ${f.enumeration.map((e) => `"${e}"`).join(", ")}`);
  const b = f.bounds;
  if (b) {
    const n = num(v);
    const ok = n != null && !(b.minInclusive != null && n < b.minInclusive) && !(b.maxInclusive != null && n > b.maxInclusive)
      && !(b.minExclusive != null && n <= b.minExclusive) && !(b.maxExclusive != null && n >= b.maxExclusive);
    const words = [b.minInclusive != null && `≥ ${b.minInclusive}`, b.minExclusive != null && `> ${b.minExclusive}`,
      b.maxInclusive != null && `≤ ${b.maxInclusive}`, b.maxExclusive != null && `< ${b.maxExclusive}`].filter(Boolean).join(" and ");
    if (!ok) out.push(`is "${v}", required a number ${words}`);
  }
  const l = f.length;
  if (l) {
    const n = [...v].length; // characters, as IDS (and Python's len) count them — not UTF-16 units
    if ((l.length != null && n !== l.length) || (l.minLength != null && n < l.minLength) || (l.maxLength != null && n > l.maxLength))
      out.push(`is ${n} character(s) long, required ${[l.length != null && `exactly ${l.length}`, l.minLength != null && `at least ${l.minLength}`, l.maxLength != null && `at most ${l.maxLength}`].filter(Boolean).join(" and ")}`);
  }
  return out;
}

const num = (s: string): number | null => (s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

/** Sentinel's own IDS: text case-insensitive. IDS 1.0 (IfcTester's is_x): text exact; two numbers within a relative 1e-6. */
function same(actual: string, want: string, ids10?: boolean): boolean {
  if (!ids10) return actual.toLowerCase() === want.toLowerCase();
  if (actual === want) return true;
  const a = num(actual), w = num(want);
  return a != null && w != null && Math.abs(a - w) <= Math.abs(w) * 1e-6;
}

function attrValue(el: ElementProperties, name: string): Actual {
  return { value: el.identity?.[name] };
}

// Null-safe throughout: a proposed element from any producer may carry a malformed pset/quantity group (no
// name, no rows) — the referee must treat that as "property absent", never throw. A crash here would 500 the
// whole propose call on one bad element (which is exactly what a real Revit payload did).
function propRow(el: ElementProperties, pset: string | null | undefined, name: string, ids10?: boolean): Actual {
  const groups = [...(el.psets ?? []), ...(el.quantities ?? [])];
  const eq = (a: string | undefined, b: string) => (ids10 ? (a ?? "") === b : (a ?? "").toLowerCase() === b.toLowerCase()); // IDS 1.0 names are case-sensitive
  // No pset named (a compiled requirement the prose did not locate): the property is searched in every
  // group rather than throwing on null — a requirement must yield a verdict or a reason, never a crash.
  // (Ported from the bridge bundle, fix a738e1d, which had been applied to the bundle only — F27.)
  const candidates = pset ? groups.filter((x) => eq(x?.name, String(pset))) : groups;
  for (const g of candidates) {
    const row = g?.rows?.find((r) => eq(r?.name, name));
    if (row) return row;
  }
  return undefined;
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ── Adjudication (the "referee") — validate a SET of proposed elements against an IDS and return a single
// verdict. Pure; the bridge's propose API wraps this + records the verdict immutably. ────────────────────
export interface AdjudicationSummary {
  elements: number;
  in_scope: number; // elements at least one specification applied to
  passing: number;
  failing: number;
  ids: string | null;
}
export interface Adjudication {
  verdict: "accepted" | "rejected" | "recorded"; // recorded = no IDS supplied (just logged, not judged)
  summary: AdjudicationSummary;
  failures: (Failure & { element: string | number | null })[];
}

/** Adjudicate a proposal: validate `elements` against `spec`. No spec → verdict "recorded" (nothing judged). */
export function adjudicate(spec: IdsSpec | null, elements: ElementProperties[]): Adjudication {
  const failures: Adjudication["failures"] = [];
  let inScope = 0, passing = 0;
  if (spec) {
    for (const el of elements) {
      const res = validateElement(spec, el);
      if (!res.inScope) continue;
      inScope++;
      if (res.pass) passing++;
      else for (const f of res.failures) failures.push({ element: el.identity.GlobalId ?? el.localId ?? null, ...f });
    }
  }
  return {
    verdict: spec ? (failures.length === 0 ? "accepted" : "rejected") : "recorded",
    summary: { elements: elements.length, in_scope: inScope, passing, failing: inScope - passing, ids: spec?.title ?? null },
    failures,
  };
}

/** The "required" specifications (IDS 1.0 minOccurs ≥ 1) no element of a WHOLE model applies to — the model fails each. Only a
 *  whole model can lack an element (a file checked on its own, a model loaded in the viewer); a changeset or an intake's class
 *  subset cannot, so adjudicate never asks this. */
export function missingRequired(spec: IdsSpec, elements: ElementProperties[]): Failure[] {
  return (spec.specifications ?? []).filter((s) => s.cardinality === "required" && !elements.some((el) => applies(s, el)))
    .map((s) => ({ specification: s.name, requirement: "(applicability)", reason: "REQUIRED: at least one element must match it, and none in the model does" }));
}

/** A whole model judged by an IDS: every element (adjudicate) and every required specification (missingRequired). */
export function judgeModel(spec: IdsSpec, elements: ElementProperties[]): { pass: boolean; failures: Adjudication["failures"] } {
  const failures = [...adjudicate(spec, elements).failures, ...missingRequired(spec, elements).map((f) => ({ element: null, ...f }))];
  return { pass: failures.length === 0, failures };
}

/** The dedup key of an already-raised `IDS: <requirement> (N failing)` BCF topic title — the inverse of the
 *  title groupFailuresForBcf's caller builds, so a re-publish skips a requirement that already has an open
 *  issue. PURE, and the ONE place this parsing lives (H0 minor N33): the bridge's raiseGovernedFailureTopics
 *  and the web IDS panel (visibility-panel) each parsed the same regex independently, untested. */
export function raisedIdsTitleKey(title: string): string {
  return String(title).replace(/^IDS:\s*/, "").trimEnd().replace(/\(\d+ failing\)$/, "").trimEnd();
}

// ── Failure → BCF grouping (the "governed reject raises one issue per broken requirement" decision) ─────────
/** One BCF issue's worth of failures: a "<specification> — <requirement>" key, how many elements broke it,
 *  and their GlobalIds (the viewpoint selection). `key` doubles as the human-readable topic subject. */
export interface RequirementGroup {
  key: string;
  count: number;
  guids: string[];
}

/**
 * Group adjudication failures into one issue per failing requirement, dropping requirements that already have
 * an open issue (idempotent on re-publish). PURE — the caller builds/persists the actual BCF topics and owns
 * the BCF-specific title parsing that yields `openRequirements`. Shared by the bridge's governed fail→BCF hook
 * (G2) and the web IDS panel so the grouping/dedup rule lives in one tested place, not duplicated per caller.
 */
export function groupFailuresForBcf(
  failures: (Failure & { element?: string | number | null })[],
  openRequirements: Iterable<string> = [],
): RequirementGroup[] {
  const open = new Set<string>(typeof openRequirements === "string" ? [openRequirements] : openRequirements);
  const groups = new Map<string, RequirementGroup>();
  for (const f of failures) {
    const key = `${f.specification} — ${f.requirement}`;
    let g = groups.get(key);
    if (!g) { g = { key, count: 0, guids: [] }; groups.set(key, g); }
    g.count++;
    if (f.element != null && f.element !== "") g.guids.push(String(f.element));
  }
  return [...groups.values()].filter((g) => !open.has(g.key));
}

/** A tiny built-in IDS so the feature is testable immediately without an .ids file. */
export const DEMO_IDS: IdsSpec = {
  title: "Sentinel demo IDS (starter checks)",
  specifications: [
    {
      name: "All elements must be named",
      applicability: { entity: "^IFC" },
      requirements: { attributes: [{ name: "Name", cardinality: "required" }], properties: [] },
    },
    {
      name: "Walls carry Pset_WallCommon.IsExternal",
      applicability: { entity: "IFCWALL" },
      requirements: {
        attributes: [],
        properties: [{ pset: "Pset_WallCommon", name: "IsExternal", cardinality: "required" }],
      },
    },
    {
      name: "Doors carry a FireRating",
      applicability: { entity: "IFCDOOR" },
      requirements: {
        attributes: [],
        properties: [{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }],
      },
    },
  ],
};
