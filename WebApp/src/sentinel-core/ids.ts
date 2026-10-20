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
  /** An .ids set or property named by a pattern or a list (parseIds: an anchored regex, in place of `pset` / `name`): every
   *  matching set must hold a matching property, and every matching value must meet the facet (IfcTester's reading). */
  psetPattern?: string;
  namePattern?: string;
}
/** A required/prohibited ATTRIBUTE (Name, Tag, ObjectType, …). */
export interface IdsAttributeFacet extends IdsValueRestrictions {
  name: string;
  value?: string;
  pattern?: string;
  cardinality: Cardinality;
  namePattern?: string; // attributes named by a pattern or a list (parseIds): every matching one is judged
}
/** One IDS value: a simpleValue or the restrictions (parseIds). */
export type IdsValue = IdsValueRestrictions & { value?: string; pattern?: string };
/** An IDS 1.0 classification facet (parseIds): a reference whose Identification (IFC2X3: ItemReference) meets `value`, if
 *  given, and one whose system's Name meets `system` — each judged on its own over every reference, as IfcTester does. */
export interface IdsClassificationFacet extends IdsValue { system: IdsValue; cardinality: Cardinality }
/** An IDS 1.0 material facet (parseIds): any material; with a value, one of its names or categories (ElementProperties.material). */
export interface IdsMaterialFacet extends IdsValue { cardinality: Cardinality }
/** An IDS 1.0 partOf facet (parseIds): an ancestor through `relation` ("" = any, IfcTester's get_parent walk) of the entity, if
 *  given, judged on the first ancestor of that class (ElementProperties.partOf). */
export interface IdsPartOfFacet { relation: string; entity?: IdsApplicability; cardinality: Cardinality }
export interface IdsApplicability {
  entity?: string; // IFC class (regex, case-insensitive), e.g. "IFCWALL"
  predefinedType?: string;
  predefinedTypePattern?: string; // a predefined type given as a pattern or a list (parseIds: an anchored regex)
  /** IDS 1.0 lets applicability hold attribute, property, classification and material facets too: an element applies only when it meets each. */
  attributes?: IdsAttributeFacet[];
  properties?: IdsPropertyFacet[];
  classifications?: IdsClassificationFacet[];
  materials?: IdsMaterialFacet[];
  partOfs?: IdsPartOfFacet[];
}
export interface IdsSpecification {
  name: string;
  applicability: IdsApplicability;
  /** `entity`: an entity facet among the requirements — the element must be that class. */
  requirements: { properties: IdsPropertyFacet[]; attributes: IdsAttributeFacet[]; entity?: IdsApplicability;
    classifications?: IdsClassificationFacet[]; materials?: IdsMaterialFacet[]; partOfs?: IdsPartOfFacet[] };
  /** IDS 1.0 specification cardinality (applicability minOccurs/maxOccurs): "required" = at least one element must apply (judged
   *  on a whole model only, judgeModel); "prohibited" = no element may apply. Absent = optional. */
  cardinality?: Cardinality;
  /** The IFC schemas the specification names (ifcVersion). Metadata only: it never changes a verdict (IDS 1.0 v1.0.0,
   *  ids/pass-specification_version_is_purely_metadata_…); versionNotes says when a model's schema is not among them. */
  ifcVersion?: string[];
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
  for (const a of spec.applicability.attributes ?? []) checkFacet({ ...a, cardinality: "required" }, attrValues(el, a), spec, attrLabel(a), unmet);
  for (const p of spec.applicability.properties ?? []) checkFacet({ ...p, cardinality: "required" }, propRows(el, p, spec.ids10), spec, propLabel(p), unmet);
  for (const c of spec.applicability.classifications ?? []) checkClassification({ ...c, cardinality: "required" }, el, spec, unmet);
  for (const m of spec.applicability.materials ?? []) checkMaterial({ ...m, cardinality: "required" }, el, spec, unmet);
  for (const p of spec.applicability.partOfs ?? []) checkPartOf({ ...p, cardinality: "required" }, el, spec, unmet);
  return unmet.length === 0;
}

function isEntity(a: IdsApplicability, el: ElementProperties, ids10?: boolean): boolean {
  const cls = (el.identity?.Class ?? "").toUpperCase();
  if (a.entity) {
    const flags = ids10 ? "" : "i"; // IDS 1.0 names classes in upper case: "IfcWall" matches nothing (entities_must_be_specified_as_uppercase_strings)
    let re: RegExp;
    try { re = new RegExp(a.entity, flags); } catch { re = new RegExp(escapeRe(a.entity), flags); }
    // IFC2X3 (IfcTester): an occurrence is also the class its type names — an IfcWallStandardCase typed by an IfcWallType is an IFCWALL.
    const fromType = ids10 && el.schema === "IFC2X3" && el.type?.Class ? el.type.Class.toUpperCase().replace(/(TYPE|STYLE)$/, "") : "";
    if (!re.test(cls) && !(fromType && re.test(fromType))) return false;
  }
  if (a.predefinedType) {
    const pt = el.identity?.PredefinedType ?? "";
    if (!ids10) return pt.toUpperCase() === a.predefinedType.toUpperCase();
    if (a.predefinedType === "USERDEFINED") return pt === "USERDEFINED" || el.type?.PredefinedType === "USERDEFINED";
    return predefinedOf(el) === a.predefinedType; // compared as written
  }
  if (a.predefinedTypePattern) return safeRe(a.predefinedTypePattern).test(predefinedOf(el));
  return true;
}

/** IDS 1.0's predefined type, as IfcOpenShell's get_predefined_type reads it: the type object's when it states one (inherited —
 *  entity/pass-inherited_predefined_types_should_pass), else the element's own; a USERDEFINED or unstated one is named by
 *  ElementType or ProcessType (a type object) or ObjectType (an occurrence). */
function predefinedOf(el: ElementProperties): string {
  const t = el.type;
  if (t) {
    const p = t.PredefinedType && t.PredefinedType !== "USERDEFINED" ? t.PredefinedType : t.ElementType ?? t.ProcessType;
    if (p && p !== "NOTDEFINED") return p;
  }
  const own = el.identity?.PredefinedType;
  return (own && own !== "USERDEFINED" ? own : el.identity?.ObjectType ?? el.identity?.ElementType ?? el.identity?.ProcessType) ?? "";
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
    for (const a of s.requirements?.attributes ?? []) checkFacet(a, attrValues(el, a), s, attrLabel(a), failures);
    for (const p of s.requirements?.properties ?? []) checkFacet(p, propRows(el, p, s.ids10), s, propLabel(p), failures);
    for (const c of s.requirements?.classifications ?? []) checkClassification(c, el, s, failures);
    for (const m of s.requirements?.materials ?? []) checkMaterial(m, el, s, failures);
    for (const p of s.requirements?.partOfs ?? []) checkPartOf(p, el, s, failures);
  }
  return { inScope, pass: failures.length === 0, failures };
}

/** IDS partOf as IfcTester reads it (ifcopenshell.util.element): for each element, its ancestors per relation, from every element's
 *  direct parents (`parents`, localIds in `els`) — aggregates and nests walked up; the container, direct else the container of its
 *  parent; the group; an opening's voided element, or the voided element of the opening an element fills; any relation (""): the
 *  get_parent walk, a group where nothing else is. A relation no element's reader carries stays unset (unreadFacets says so). A
 *  parent outside `els` ends a chain (ponytail: intake reads 13 classes, and judges no partOf). */
export function partOfChains(els: ElementProperties[]): void {
  type Link = keyof NonNullable<ElementProperties["parents"]>;
  const byId = new Map(els.map((e) => [e.localId, e]));
  const links: Link[] = ["aggregate", "nest", "container", "group", "fills", "voids"];
  const has = Object.fromEntries(links.map((k) => [k, els.some((e) => e.parents?.[k] !== undefined)])) as Record<Link, boolean>; // once: not per element
  const carried = (...ks: Link[]) => ks.every((k) => has[k]);
  const up = (e: ElementProperties | undefined, k: Link) => { const id = e?.parents?.[k]; return id == null ? undefined : byId.get(id); };
  const parentOf = (e: ElementProperties) => up(e, "container") ?? up(e, "aggregate") ?? up(e, "nest") ?? up(e, "fills") ?? up(e, "voids");
  const walk = (e: ElementProperties, step: (x: ElementProperties) => ElementProperties | undefined) => {
    const out: ElementProperties[] = [], seen = new Set([e]);
    for (let p = step(e); p && !seen.has(p); p = step(p)) { seen.add(p); out.push(p); }
    return out;
  };
  const chain = (xs: (ElementProperties | undefined)[]) => xs.filter((x): x is ElementProperties => !!x).map((a) => ({ Class: (a.identity?.Class ?? "").toUpperCase(), PredefinedType: predefinedOf(a) }));
  // Without fills and voids (the viewer), an element found in no container may still be in one through an opening it fills — unless
  // the top of its walk is spatial or a type, which fills nothing: then "none" is known; else this element's containment is unknown.
  const fillsNothing = (x: ElementProperties) => /^IFC(PROJECT|PROJECTLIBRARY|SITE|BUILDING|BUILDINGSTOREY|SPACE|EXTERNALSPATIALELEMENT|SPATIALZONE|FACILITY|FACILITYPART|BRIDGE|BRIDGEPART|ROAD|ROADPART|RAILWAY|RAILWAYPART|MARINEFACILITY|MARINEPART|TUNNEL|TUNNELPART)$|(TYPE|STYLE)$/i.test(x.identity?.Class ?? "");
  const containment = (e: ElementProperties) => {
    const path = [e, ...walk(e, parentOf)], c = path.map((x) => up(x, "container")).find(Boolean);
    return c ? chain([c]) : carried("fills", "voids") || fillsNothing(path[path.length - 1]) ? [] : undefined;
  };
  for (const e of els) {
    const voided = /^IFCOPENING(ELEMENT|STANDARDCASE)$/i.test(e.identity?.Class ?? "") ? up(e, "voids") : up(up(e, "fills"), "voids");
    e.partOf = {
      ...(carried("aggregate") ? { IFCRELAGGREGATES: chain(walk(e, (x) => up(x, "aggregate"))) } : {}),
      ...(carried("nest") ? { IFCRELNESTS: chain(walk(e, (x) => up(x, "nest"))) } : {}),
      ...(carried("container", "aggregate", "nest") ? { IFCRELCONTAINEDINSPATIALSTRUCTURE: containment(e) } : {}),
      ...(carried("group") ? { IFCRELASSIGNSTOGROUP: chain([up(e, "group")]) } : {}),
      ...(carried("fills", "voids") ? { "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT": chain([voided]) } : {}),
      ...(carried("container", "aggregate", "nest", "fills", "voids", "group") ? { "": chain(walk(e, (x) => parentOf(x) ?? up(x, "group"))) } : {}),
    };
  }
}

/** The specifications that name what this model's reader cannot read: a facet it carries for no element (the viewer's fragments
 *  model drops classifications), or a value compared in SI units whose unit it cannot read (it drops IfcConversionBasedUnit:
 *  feet). Judging them would read every element as unclassified, or a length in feet as metres, so they are said as "not checked". */
export function unreadFacets(spec: IdsSpec, els: ElementProperties[]): { specification: IdsSpecification; facets: string[] }[] {
  const has = (s: IdsSpecification, k: "classifications" | "materials") => !!(s.applicability[k]?.length || s.requirements[k]?.length);
  const carried = { classifications: els.some((e) => e.classifications), materials: els.some((e) => e.material !== undefined) };
  return (spec.specifications ?? []).map((s) => ({ specification: s, facets: [
    ...(["classifications", "materials"] as const).filter((k) => has(s, k) && !carried[k]).map((k) => `the ${k === "classifications" ? "classification" : "material"} facet`),
    // partOf: unknown for an element in scope (for an applicability facet, for any element: its scope is what is unknown).
    ...[...(s.applicability.partOfs ?? []).map((p) => [p, true] as const), ...(s.requirements.partOfs ?? []).map((p) => [p, false] as const)]
      .filter(([p, inAppl]) => els.some((e) => e.partOf?.[p.relation] === undefined && (inAppl || applies(s, e))))
      .map(([p]) => `the partOf facet through ${p.relation || "any relation"}`),
    ...(s.ids10 ? [...(s.applicability.properties ?? []), ...(s.requirements.properties ?? [])] : [])
      .filter((p) => stated(p) && els.some((e) => propRows(e, p, true, true).some((r) => r?.si === null || r?.values?.some((v) => v.si === null))))
      .map((p) => `the unit of ${propLabel(p)} (IDS compares in SI units)`),
    // A property the reader saw but could not read (That Open's fragments importer keeps an enumerated, list, bounded or table
    // value as an empty item, name and all): where the facet's property is not among the readable rows of a set that holds one.
    ...(s.ids10 ? [...(s.applicability.properties ?? []), ...(s.requirements.properties ?? [])] : [])
      .filter((p) => els.some((e) => !propRows(e, p, true, true).length && [...(e.psets ?? []), ...(e.quantities ?? [])]
        .some((g) => g?.unread && (p.psetPattern ? safeRe(p.psetPattern).test(g.name ?? "") : p.pset == null || g.name === p.pset))))
      .map((p) => `${propLabel(p)}: its set holds a property value this reader cannot read`),
  ] })).filter((x) => x.facets.length);
}

// ── helpers ──────────────────────────────────────────────────────────────────
// written: the value before SI conversion; values: a multi-value property's (PropRow.values)
type Actual = { value?: string; type?: string; si?: string | null; written?: string; values?: { value: string; type?: string; si?: string | null; column?: string }[] } | undefined;
type Facet = IdsAttributeFacet & { datatype?: string };

/** `actuals`: every value the facet names on the element (one, unless its names are a pattern); none = absent. */
function checkFacet(f: Facet, actuals: Actual[], s: IdsSpecification, label: string, out: Failure[]): void {
  const present = actuals.filter((a): a is NonNullable<Actual> & { value: string } => a?.value != null && a.value !== "");
  const push = (reason: string) => out.push({ specification: s.name, requirement: label, reason });
  // IDS 1.0: an attribute that exists but holds "" fails, optional or not (an_optional_attribute_fails_if_empty); an empty
  // property counts as absent. (An attribute facet is the one without a property set.)
  if (s.ids10 && !present.length && actuals.some((a) => a?.value === "") && !("pset" in f)) { if (f.cardinality !== "prohibited") push("is empty"); return; }
  const wrong = present.flatMap((a) => (a.values ? multiMismatches(f, a, s.ids10)
    : mismatches(f, a.value, a.type, s.ids10).map((m) => (a.written != null ? `${m} (in SI units; "${a.written}" as written)` : m))));
  const v = present[0]?.value;
  if (f.cardinality === "prohibited") {
    // IDS 1.0: a prohibited facet fails only where the required one would pass — "shall not be X" allows every other value.
    if (present.length && !wrong.length) push(f.value != null || f.pattern != null || f.enumeration || f.bounds || f.length ? `is "${v}", which it must not be` : `must be ABSENT but is "${v}"`);
    return;
  }
  if (!present.length) {
    if (f.cardinality === "required") push("REQUIRED but missing");
    return; // optional + absent → fine
  }
  for (const w of wrong) push(w); // present → value / pattern / restriction checks (apply to required and optional-present)
}

/** IfcTester's classification facet: some reference (own, else the type's per system; with every reference above it) meets the
 *  value, if given, and some reference's system meets the system. Optional and none → fine; prohibited fails where required passes. */
function checkClassification(f: IdsClassificationFacet, el: ElementProperties, s: IdsSpecification, out: Failure[]): void {
  const refs = el.classifications ?? [];
  const ok = (!stated(f) || refs.some((r) => r.value != null && fits(f, r.value, s.ids10))) && refs.some((r) => r.system != null && fits(f.system, r.system, s.ids10));
  const label = `classification ${says(f.system)}${stated(f) ? ` ${says(f)}` : ""}`;
  const actual = refs.map((r) => `${r.system ?? "no system"} ${r.value ?? ""}`.trim()).join(", ");
  judgeHas(f.cardinality, refs.length > 0, ok, label, actual, s, out);
}

/** IfcTester's material facet: the element's material (own, else its type's); with a value, one of its names or categories. */
function checkMaterial(f: IdsMaterialFacet, el: ElementProperties, s: IdsSpecification, out: Failure[]): void {
  const m = el.material ?? null;
  judgeHas(f.cardinality, m != null, m != null && (!stated(f) || m.some((v) => fits(f, v, s.ids10))), `material${stated(f) ? ` ${says(f)}` : ""}`, (m ?? []).join(", ") || "unnamed", s, out);
}

/** IfcTester's partOf facet: the first ancestor through the relation of the entity's class, and its predefined type. */
function checkPartOf(f: IdsPartOfFacet, el: ElementProperties, s: IdsSpecification, out: Failure[]): void {
  const chain = el.partOf?.[f.relation] ?? [];
  const as = (a: { Class: string; PredefinedType: string }) => ({ identity: { Class: a.Class, PredefinedType: a.PredefinedType } }) as ElementProperties;
  const hit = f.entity?.entity ? chain.find((a) => isEntity({ entity: f.entity!.entity }, as(a), true)) : chain[0];
  const ok = !!hit && (!f.entity || isEntity({ ...f.entity, entity: undefined }, as(hit), true));
  const want = [f.entity?.entity && `/${f.entity.entity}/`, f.entity?.predefinedType ?? (f.entity?.predefinedTypePattern && `/${f.entity.predefinedTypePattern}/`)].filter(Boolean).join(" ");
  judgeHas(f.cardinality, chain.length > 0, ok, `partOf ${f.relation || "any relation"}${want ? ` ${want}` : ""}`,
    chain.map((a) => (a.PredefinedType ? `${a.Class}.${a.PredefinedType}` : a.Class)).join(" < ") || "none", s, out);
}

function judgeHas(card: Cardinality, present: boolean, ok: boolean, label: string, actual: string, s: IdsSpecification, out: Failure[]): void {
  const push = (reason: string) => out.push({ specification: s.name, requirement: label, reason });
  if (card === "prohibited") { if (ok) push(`is ${actual}, which it must not be`); return; }
  if (!present) { if (card === "required") push("REQUIRED but missing"); return; }
  if (!ok) push(`is ${actual}, required ${label}`);
}

const stated = (v: IdsValue) => v.value != null || v.pattern != null || !!v.enumeration || !!v.bounds || !!v.length;
const fits = (v: IdsValue, actual: string, ids10?: boolean) => !mismatches({ ...v, name: "", cardinality: "required" }, actual, undefined, ids10).length;
const says = (v: IdsValue) => (v.value != null ? `"${v.value}"` : v.pattern != null ? `/${v.pattern}/` : v.enumeration ? `one of ${v.enumeration.join(", ")}` : "a restricted value");

/** An enumerated, list, bounded or table property (PropRow.values), as IfcTester reads it: the dataType against its value type
 *  (a table: only the columns of that type are compared, and none is a failure); the value met by any one value, in SI units. */
function multiMismatches(f: Facet, a: NonNullable<Actual>, ids10?: boolean): string[] {
  const values = a.values ?? [], table = values.some((v) => v.column), dt = ids10 ? f.datatype?.toUpperCase() : undefined;
  if (dt && !table && a.type && a.type.toUpperCase() !== dt) return [`is a ${a.type}, required ${f.datatype}`];
  const vs = table && dt ? values.filter((v) => v.type?.toUpperCase() === dt) : values;
  if (!vs.length) return [`has no ${f.datatype} value (a table of ${[...new Set(values.map((v) => v.type))].join(", ")})`];
  const each = vs.map((v) => mismatches({ ...f, datatype: undefined }, ids10 && v.si != null ? v.si : v.value, v.type, ids10));
  return each.some((m) => !m.length) ? [] : [`none of its values (${vs.map((v) => v.value).join(", ")}) meets it: ${each[0].join("; ")}`];
}

const attrLabel = (a: IdsAttributeFacet) => `@${a.namePattern ? `/${a.namePattern}/` : a.name}`;
const propLabel = (p: IdsPropertyFacet) => `${p.psetPattern ? `/${p.psetPattern}/` : p.pset}.${p.namePattern ? `/${p.namePattern}/` : p.name}`;
function safeRe(p: string): RegExp { try { return new RegExp(p); } catch { return /(?!)/; } } // a pattern that does not compile matches nothing

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
    // ids10: a bound takes IDS 1.0's tolerance (tolerance/*_range_*): an inclusive bound loosens by it, an exclusive one tightens
    // by it — a value exactly one tolerance past an exclusive bound passes (the float slack is given the permissive way each time).
    const loose = (x: number) => (ids10 ? band(x) * (1 + FLOAT_SLACK) : 0), tight = (x: number) => band(x) * (1 - FLOAT_SLACK);
    const ok = n != null && !(b.minInclusive != null && n < b.minInclusive - loose(b.minInclusive)) && !(b.maxInclusive != null && n > b.maxInclusive + loose(b.maxInclusive))
      && !(b.minExclusive != null && (ids10 ? n < b.minExclusive + tight(b.minExclusive) : n <= b.minExclusive))
      && !(b.maxExclusive != null && (ids10 ? n > b.maxExclusive - tight(b.maxExclusive) : n >= b.maxExclusive));
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

/** IDS 1.0's numeric tolerance, as its tolerance test cases pin it: 1e-6 relative plus 1e-6 absolute (|a − w| ≤ |w|·1e-6 + 1e-6).
 *  The cases sit exactly on that edge, so each comparison gives binary floating point a billionth of the band. */
const band = (w: number): number => Math.abs(w) * 1e-6 + 1e-6;
const FLOAT_SLACK = 1e-9;

/** Sentinel's own IDS: text case-insensitive. IDS 1.0: text exact; two numbers within the tolerance. */
function same(actual: string, want: string, ids10?: boolean): boolean {
  if (!ids10) return actual.toLowerCase() === want.toLowerCase();
  if (actual === want) return true;
  const a = num(actual), w = num(want);
  return a != null && w != null && Math.abs(a - w) <= band(w) * (1 + FLOAT_SLACK);
}

function attrValues(el: ElementProperties, a: IdsAttributeFacet): Actual[] {
  if (!a.namePattern) return [{ value: el.identity?.[a.name] }];
  const re = safeRe(a.namePattern); // every attribute the pattern names ("Class" is Sentinel's, not an IFC attribute)
  return Object.entries(el.identity ?? {}).filter(([k, v]) => k !== "Class" && v != null && re.test(k)).map(([, v]) => ({ value: v }));
}

// Null-safe throughout: a proposed element from any producer may carry a malformed pset/quantity group (no
// name, no rows) — the referee must treat that as "property absent", never throw. A crash here would 500 the
// whole propose call on one bad element (which is exactly what a real Revit payload did).
function propRows(el: ElementProperties, p: IdsPropertyFacet, ids10?: boolean, raw?: boolean): Actual[] {
  // IDS 1.0 compares a value in SI units (PropRow.si, where the file's unit is not SI); `raw` keeps the rows as read.
  if (ids10 && !raw) return propRows(el, p, true, true).map((r) => (r && "si" in r && r.si != null ? { ...r, value: r.si, written: r.value } : r));
  const groups = [...(el.psets ?? []), ...(el.quantities ?? [])];
  const eq = (a: string | undefined, b: string) => (ids10 ? (a ?? "") === b : (a ?? "").toLowerCase() === b.toLowerCase()); // IDS 1.0 names are case-sensitive
  if (p.psetPattern || p.namePattern) {
    // IfcTester's reading of a set or property named by a pattern: every matching set must hold a matching property (one that
    // does not makes the property missing), and every matching property's value is judged.
    const setOk = p.psetPattern ? ((n: string) => safeRe(p.psetPattern!).test(n)) : (n: string) => eq(n, String(p.pset ?? ""));
    const nameOk = p.namePattern ? ((n: string) => safeRe(p.namePattern!).test(n)) : (n: string) => eq(n, p.name);
    const rows: Actual[] = [];
    for (const g of groups.filter((x) => setOk(x?.name ?? ""))) {
      const r = (g?.rows ?? []).filter((x) => nameOk(x?.name ?? ""));
      if (!r.length) return [];
      rows.push(...r);
    }
    return rows;
  }
  // No pset named (a compiled requirement the prose did not locate): the property is searched in every
  // group rather than throwing on null — a requirement must yield a verdict or a reason, never a crash.
  // (Ported from the bridge bundle, fix a738e1d, which had been applied to the bundle only — F27.)
  const candidates = p.pset ? groups.filter((x) => eq(x?.name, String(p.pset))) : groups;
  for (const g of candidates) {
    const row = g?.rows?.find((r) => eq(r?.name, p.name));
    if (row) return [row];
  }
  return [];
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

/** The specifications written for other IFC schemas than the model's (ifcVersion), said beside the verdict — never a verdict:
 *  IDS 1.0 v1.0.0 treats the version as metadata (ids/pass-specification_version_is_purely_metadata_…), as IfcTester does. */
export function versionNotes(spec: IdsSpec, schema: string | undefined): string[] {
  const s = (schema ?? "").toUpperCase();
  return s ? (spec.specifications ?? []).filter((x) => x.ifcVersion?.length && !x.ifcVersion.includes(s))
    .map((x) => `${x.name}: written for ${x.ifcVersion!.join(", ")}, the model is ${s} — judged anyway (IDS 1.0: the version is metadata)`) : [];
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
