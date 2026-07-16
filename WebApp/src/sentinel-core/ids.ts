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
  const cls = (el.identity.Class ?? "").toUpperCase();
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
  return el.identity[key];
}

function propValue(el: ElementProperties, pset: string, name: string): string | undefined {
  const groups = [...el.psets, ...el.quantities];
  const g = groups.find((x) => x.name.toLowerCase() === pset.toLowerCase());
  const row = g?.rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
  return row?.value;
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

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
