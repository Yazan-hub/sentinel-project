// sentinel-core/ids — Information Delivery Specification (buildingSMART IDS) model + validator. PURE TS
// (no OBC/DOM). Given a parsed IdsSpec and an element's extracted properties, decide pass/fail per
// specification and explain WHY. This is the deterministic core of KF-B (IDS validation + colour-coding);
// the XML parser is ids-parse.ts, the model runner is adapter/model-validate.ts.

import type { ElementProperties } from "./adapter/element-properties";

export type Cardinality = "required" | "optional" | "prohibited";

/** A required/prohibited PROPERTY in a property set (Pset_ or Qto_). */
export interface IdsPropertyFacet {
  pset: string; // property-set name, e.g. "Pset_WallCommon"
  name: string; // property name, e.g. "IsExternal"
  datatype?: string; // e.g. "IFCBOOLEAN" (informational for now)
  value?: string; // exact required value (case-insensitive)
  pattern?: string; // regex the value must match
  cardinality: Cardinality;
}
/** A required/prohibited ATTRIBUTE (Name, Tag, ObjectType, …). */
export interface IdsAttributeFacet {
  name: string;
  value?: string;
  pattern?: string;
  cardinality: Cardinality;
}
export interface IdsApplicability {
  entity?: string; // IFC class (regex, case-insensitive), e.g. "IFCWALL"
  predefinedType?: string;
}
export interface IdsSpecification {
  name: string;
  applicability: IdsApplicability;
  requirements: { properties: IdsPropertyFacet[]; attributes: IdsAttributeFacet[] };
}
export interface IdsSpec {
  title: string;
  /** How the Governed Publish gate treats element-check failures. Applied by the bridge (adjudicate stays a
   *  pure validator): "reject" (default) fails the publish; "warn" publishes but records + raises the failures
   *  as tracked issues; "off" ignores them. Lets a pilot loosen data checks at early schematic, then tighten. */
  enforce?: "reject" | "warn" | "off";
  specifications: IdsSpecification[];
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

/** Does a specification's applicability target this element? */
export function applies(spec: IdsSpecification, el: ElementProperties): boolean {
  const cls = (el.identity?.Class ?? "").toUpperCase();
  if (spec.applicability.entity) {
    let re: RegExp;
    try { re = new RegExp(spec.applicability.entity, "i"); } catch { re = new RegExp(escapeRe(spec.applicability.entity), "i"); }
    if (!re.test(cls)) return false;
  }
  if (spec.applicability.predefinedType &&
      (el.identity.PredefinedType ?? "").toUpperCase() !== spec.applicability.predefinedType.toUpperCase()) {
    return false;
  }
  return true;
}

/** Validate one element against every applicable specification. */
export function validateElement(spec: IdsSpec, el: ElementProperties): ElementResult {
  const failures: Failure[] = [];
  let inScope = false;

  for (const s of spec.specifications) {
    if (!applies(s, el)) continue;
    inScope = true;

    for (const a of s.requirements.attributes) {
      const actual = attrValue(el, a.name);
      checkFacet(a.cardinality, a.value, a.pattern, actual, s.name, `@${a.name}`, failures);
    }
    for (const p of s.requirements.properties) {
      const actual = propValue(el, p.pset, p.name);
      checkFacet(p.cardinality, p.value, p.pattern, actual, s.name, `${p.pset}.${p.name}`, failures);
    }
  }
  return { inScope, pass: failures.length === 0, failures };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function checkFacet(
  card: Cardinality, wantValue: string | undefined, wantPattern: string | undefined,
  actual: string | undefined, specName: string, label: string, out: Failure[],
): void {
  const present = actual != null && actual !== "";
  if (card === "prohibited") {
    if (present) out.push({ specification: specName, requirement: label, reason: `must be ABSENT but is "${actual}"` });
    return;
  }
  if (!present) {
    if (card === "required") out.push({ specification: specName, requirement: label, reason: "REQUIRED but missing" });
    return; // optional + absent → fine
  }
  // present → value / pattern checks (apply to required and optional-present)
  if (wantValue != null && String(actual).toLowerCase() !== wantValue.toLowerCase()) {
    out.push({ specification: specName, requirement: label, reason: `is "${actual}", required "${wantValue}"` });
  }
  if (wantPattern != null) {
    let ok = false;
    try { ok = new RegExp(wantPattern).test(String(actual)); } catch { ok = true; /* bad pattern → skip */ }
    if (!ok) out.push({ specification: specName, requirement: label, reason: `is "${actual}", must match /${wantPattern}/` });
  }
}

function attrValue(el: ElementProperties, name: string): string | undefined {
  const key = name as keyof ElementProperties["identity"];
  return el.identity?.[key];
}

// Null-safe throughout: a proposed element from any producer may carry a malformed pset/quantity group (no
// name, no rows) — the referee must treat that as "property absent", never throw. A crash here would 500 the
// whole propose call on one bad element (which is exactly what a real Revit payload did).
function propValue(el: ElementProperties, pset: string, name: string): string | undefined {
  const groups = [...(el.psets ?? []), ...(el.quantities ?? [])];
  const g = groups.find((x) => (x?.name ?? "").toLowerCase() === pset.toLowerCase());
  const row = g?.rows?.find((r) => (r?.name ?? "").toLowerCase() === name.toLowerCase());
  return row?.value;
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
