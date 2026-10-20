// sentinel-core/ids-parse — buildingSMART IDS 1.0 (.ids XML) → IdsSpec, every specification judged by IDS 1.0's rules (ids10).
// Uses the browser DOMParser and namespace-agnostic localName traversal so it tolerates the ids:/xs: prefixes real IDS files
// carry. Reads entity facets (name + predefinedType) in applicability or requirements, attribute and property facets in either,
// values as simpleValue or xs:restriction (enumeration, pattern, bounds, length), facet cardinality, and specification
// cardinality (applicability minOccurs/maxOccurs). What it cannot judge — classification, material and partOf facets, a name
// given as a restriction, other restriction kinds — it names in `unsupported`, never drops: a dropped facet reads as a pass.

import type { IdsSpec, IdsSpecification, IdsPropertyFacet, IdsAttributeFacet, IdsApplicability, Cardinality } from "./ids";

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

/** A name (property set, property, attribute, predefined type) that must be one plain value; else what it was, for `unsupported`. */
function plainName(c: Element | undefined, what: string, say: (s: string) => void): string {
  const r = readValue(c);
  if (r?.value != null) return r.value;
  say(`${what} given as ${r && (r.enumeration || r.pattern) ? "a list or a pattern" : "no plain value"}`);
  return "";
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
      if (pdt) out.predefinedType = plainName(pdt, "a predefined type", sayHere);
      return out;
    };
    const facets = (parent: Element | undefined, where: "applicability" | "requirements") => {
      const sayHere = say(where);
      const attributes: IdsAttributeFacet[] = [], properties: IdsPropertyFacet[] = [];
      let entity: IdsApplicability | undefined;
      for (const f of parent ? kids(parent) : []) {
        const card: Cardinality = where === "applicability" ? "required" : cardinalityOf(f);
        const v = readValue(kid(f, "value"));
        if (v?.other.length) sayHere(`a value restricted by ${v.other.join(", ")}`);
        const value = v ? { value: v.value, pattern: v.pattern, enumeration: v.enumeration, bounds: v.bounds, length: v.length } : {};
        if (f.localName === "entity") entity = entityOf(f, sayHere);
        else if (f.localName === "attribute") attributes.push({ name: plainName(kid(f, "name"), "an attribute name", sayHere), ...value, cardinality: card });
        else if (f.localName === "property") properties.push({
          pset: plainName(kid(f, "propertySet"), "a property set name", sayHere),
          name: plainName(kid(f, "baseName") ?? kid(f, "name"), "a property name", sayHere),
          datatype: f.getAttribute("dataType") || undefined, ...value, cardinality: card,
        });
        else if (["classification", "material", "partOf"].includes(f.localName)) sayHere(`the ${f.localName} facet — Sentinel does not read it yet`);
      }
      return { entity, attributes, properties };
    };

    const appl = facets(applEl, "applicability");
    const req = facets(reqEl, "requirements");
    // IDS 1.0 puts them on applicability; IDS 0.9 drafts, still in circulation, on the specification.
    const min = Number(applEl?.getAttribute("minOccurs") || specEl.getAttribute("minOccurs") || 0);
    const max = applEl?.getAttribute("maxOccurs") || specEl.getAttribute("maxOccurs") || "unbounded";
    const cardinality: Cardinality | undefined = max === "0" ? "prohibited" : min >= 1 ? "required" : undefined;
    specifications.push({
      name,
      applicability: { ...(appl.entity ?? {}), ...(appl.attributes.length ? { attributes: appl.attributes } : {}), ...(appl.properties.length ? { properties: appl.properties } : {}) },
      requirements: { properties: req.properties, attributes: req.attributes, ...(req.entity ? { entity: req.entity } : {}) },
      ...(cardinality ? { cardinality } : {}),
      ids10: true,
    });
  }
  return { title, specifications, ...(unsupported.length ? { unsupported } : {}) };
}
