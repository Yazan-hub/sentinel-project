// sentinel-core/ids-parse — buildingSMART IDS 1.0 (.ids XML) → IdsSpec, every specification judged by IDS 1.0's rules (ids10).
// Uses the browser DOMParser and namespace-agnostic localName traversal so it tolerates the ids:/xs: prefixes real IDS files
// carry. Reads entity facets (name + predefinedType) in applicability or requirements, attribute, property, classification and
// material facets in either, values as simpleValue or xs:restriction (enumeration, pattern, bounds, length), facet cardinality,
// and specification cardinality (applicability minOccurs/maxOccurs). What it cannot judge — the partOf facet, a name given as a
// restriction, other restriction kinds — it names in `unsupported`, never drops: a dropped facet reads as a pass. (A facet the
// model's reader does not carry is said by unreadFacets, per model.)

import type { IdsSpec, IdsSpecification, IdsPropertyFacet, IdsAttributeFacet, IdsApplicability, IdsClassificationFacet, IdsMaterialFacet, Cardinality } from "./ids";

const isEl = (n: Node): n is Element => n.nodeType === 1;
const kids = (el: Element, name?: string): Element[] => Array.from(el.childNodes).filter(isEl).filter((c) => !name || c.localName === name);
const kid = (el: Element | undefined, name: string): Element | undefined => (el ? kids(el, name)[0] : undefined);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Read = Pick<IdsAttributeFacet, "value" | "pattern" | "enumeration" | "bounds" | "length"> & { other: string[] };

/** An idsValue element's content: a simpleValue, or an xs:restriction's enumeration / pattern / bounds / length (`other`: the rest). */
function readValue(c: Element | undefined): Read | null {
  if (!c) return null;
  const sv = kid(c, "simpleValue");
  if (sv) return { value: (sv.textContent ?? "").trim(), other: [] };
  const r = kid(c, "restriction");
  const out: Read = { other: [] };
  const patterns: string[] = [];
  for (const x of r ? kids(r) : []) {
    const v = x.getAttribute("value") || "";
    const n = x.localName;
    if (n === "enumeration") (out.enumeration ??= []).push(v);
    else if (n === "pattern") patterns.push(v);
    else if (/^(min|max)(In|Ex)clusive$/.test(n) && Number.isFinite(Number(v))) (out.bounds ??= {})[n as "minInclusive"] = Number(v);
    else if (/^(length|minLength|maxLength)$/.test(n) && Number.isInteger(Number(v))) (out.length ??= {})[n as "length"] = Number(v);
    else if (n !== "annotation") out.other.push(n);
  }
  // An XSD pattern matches the WHOLE value (IfcTester: fullmatch); several patterns must all match.
  if (patterns.length) out.pattern = patterns.length === 1 ? `^(?:${patterns[0]})$` : `^${patterns.map((p) => `(?=(?:${p})$)`).join("")}`;
  return out;
}

/** A name (property set, property, attribute, predefined type): one plain value, or a list / pattern as an anchored regex (a list
 *  and a pattern together must both hold); bounds or length on a name, or no value, go to `unsupported`. */
function nameOf(c: Element | undefined, what: string, say: (s: string) => void): { value: string; pattern?: string } {
  const r = readValue(c);
  if (r?.value != null) return { value: r.value };
  if (r && (r.enumeration || r.pattern) && !r.bounds && !r.length && !r.other.length) {
    const list = r.enumeration ? `^(?:${r.enumeration.map(escapeRe).join("|")})$` : null;
    return { value: "", pattern: list && r.pattern ? `(?=${list})${r.pattern}` : list ?? r.pattern };
  }
  say(`${what} given as ${r ? "a restriction Sentinel cannot read" : "no plain value"}`);
  return { value: "" };
}

function cardinalityOf(el: Element): Cardinality {
  const c = (el.getAttribute("cardinality") || "").toLowerCase();
  if (c === "required" || c === "prohibited" || c === "optional") return c as Cardinality;
  const min = el.getAttribute("minOccurs");
  const max = el.getAttribute("maxOccurs");
  if (max === "0") return "prohibited";
  if (min === "0") return "optional";
  return "required"; // IDS default: requirements are required unless stated otherwise
}

export function parseIds(xml: string): IdsSpec {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid IDS XML (parse error).");

  const title = doc.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim() || "IDS";
  const specifications: IdsSpecification[] = [];
  const unsupported: string[] = [];

  for (const specEl of Array.from(doc.getElementsByTagNameNS("*", "specification"))) {
    const name = specEl.getAttribute("name") || "Specification";
    // getAttribute: `||`, not `??` — a missing attribute is null in a browser and "" in xmldom (the Node harness).
    const say = (where: string) => (s: string) => unsupported.push(`${name}: ${s} (${where})`);
    const applEl = kid(specEl, "applicability");
    const reqEl = kid(specEl, "requirements");

    const entityOf = (e: Element, sayHere: (s: string) => void): IdsApplicability => {
      const n = readValue(kid(e, "name"));
      const out: IdsApplicability = {};
      if (n?.value != null) out.entity = `^${escapeRe(n.value)}$`; // the class itself, never a subtype (IFCWALL ≠ IFCWALLSTANDARDCASE)
      else if (n?.enumeration && !n.pattern && !n.bounds && !n.length) out.entity = `^(?:${n.enumeration.map(escapeRe).join("|")})$`;
      else if (n?.pattern && !n.enumeration && !n.bounds && !n.length) out.entity = n.pattern;
      else sayHere("an entity name Sentinel cannot read");
      if (n?.other.length) sayHere(`an entity name restricted by ${n.other.join(", ")}`);
      const pdt = kid(e, "predefinedType");
      const p = pdt ? nameOf(pdt, "a predefined type", sayHere) : null;
      if (p?.pattern) out.predefinedTypePattern = p.pattern;
      else if (p) out.predefinedType = p.value;
      return out;
    };
    const facets = (parent: Element | undefined, where: "applicability" | "requirements") => {
      const sayHere = say(where);
      const attributes: IdsAttributeFacet[] = [], properties: IdsPropertyFacet[] = [];
      const classifications: IdsClassificationFacet[] = [], materials: IdsMaterialFacet[] = [];
      let entity: IdsApplicability | undefined;
      for (const f of parent ? kids(parent) : []) {
        const card: Cardinality = where === "applicability" ? "required" : cardinalityOf(f);
        const v = readValue(kid(f, "value"));
        if (v?.other.length) sayHere(`a value restricted by ${v.other.join(", ")}`);
        const value = v ? { value: v.value, pattern: v.pattern, enumeration: v.enumeration, bounds: v.bounds, length: v.length } : {};
        if (f.localName === "entity") entity = entityOf(f, sayHere);
        else if (f.localName === "attribute") {
          const n = nameOf(kid(f, "name"), "an attribute name", sayHere);
          attributes.push({ name: n.value, ...(n.pattern ? { namePattern: n.pattern } : {}), ...value, cardinality: card });
        } else if (f.localName === "property") {
          const set = nameOf(kid(f, "propertySet"), "a property set name", sayHere), n = nameOf(kid(f, "baseName") ?? kid(f, "name"), "a property name", sayHere);
          properties.push({
            pset: set.value, name: n.value, ...(set.pattern ? { psetPattern: set.pattern } : {}), ...(n.pattern ? { namePattern: n.pattern } : {}),
            datatype: f.getAttribute("dataType") || undefined, ...value, cardinality: card,
          });
        } else if (f.localName === "classification") {
          const sys = readValue(kid(f, "system"));
          if (!sys) sayHere("a classification facet with no system"); // the IDS 1.0 XSD requires one
          if (sys?.other.length) sayHere(`a classification system restricted by ${sys.other.join(", ")}`);
          const { other: _, ...system } = sys ?? { other: [] };
          classifications.push({ ...value, system, cardinality: card });
        } else if (f.localName === "material") materials.push({ ...value, cardinality: card });
        else if (f.localName === "partOf") sayHere("the partOf facet — Sentinel does not read it yet");
      }
      return { entity, attributes, properties, classifications, materials };
    };

    const appl = facets(applEl, "applicability");
    const req = facets(reqEl, "requirements");
    // IDS 1.0 puts them on applicability, where the XSD's xs:occurs makes an unstated minOccurs 1 — a REQUIRED specification
    // (ids/fail-required_specifications_need_at_least_one_applicable_entity_2_2); IDS 0.9 drafts put them on the specification.
    const min = Number(applEl?.getAttribute("minOccurs") || specEl.getAttribute("minOccurs") || (applEl ? 1 : 0));
    const max = applEl?.getAttribute("maxOccurs") || specEl.getAttribute("maxOccurs") || "unbounded";
    const cardinality: Cardinality | undefined = max === "0" ? "prohibited" : min >= 1 ? "required" : undefined;
    const some = <K extends "attributes" | "properties" | "classifications" | "materials">(x: typeof appl, k: K) => (x[k].length ? { [k]: x[k] } : {});
    specifications.push({
      name,
      applicability: { ...(appl.entity ?? {}), ...some(appl, "attributes"), ...some(appl, "properties"), ...some(appl, "classifications"), ...some(appl, "materials") },
      requirements: { properties: req.properties, attributes: req.attributes, ...(req.entity ? { entity: req.entity } : {}), ...some(req, "classifications"), ...some(req, "materials") },
      ...(cardinality ? { cardinality } : {}),
      ids10: true,
    });
  }
  return { title, specifications, ...(unsupported.length ? { unsupported } : {}) };
}
