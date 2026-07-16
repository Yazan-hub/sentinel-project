// sentinel-core/ids-parse — buildingSMART IDS (.ids XML) → IdsSpec. Uses the browser DOMParser and
// namespace-agnostic localName traversal (getElementsByTagNameNS("*", …)) so it tolerates the ids:/xs:
// prefixes real IDS files carry. Handles the common shape: applicability→entity, requirements→property /
// attribute, with simpleValue or xs:restriction/xs:pattern values and cardinality (or minOccurs/maxOccurs).

import type { IdsSpec, IdsSpecification, IdsPropertyFacet, IdsAttributeFacet, Cardinality } from "./ids";

const nsTags = (root: Element | Document, name: string): Element[] =>
  Array.from(root.getElementsByTagNameNS("*", name));
const firstTag = (root: Element | Document, name: string): Element | undefined =>
  root.getElementsByTagNameNS("*", name)[0] ?? undefined;

/** Read a facet's { value } (simpleValue) or { pattern } (xs:restriction/xs:pattern) from a child element. */
function facetOf(parent: Element | undefined, childName: string): { value?: string; pattern?: string } {
  if (!parent) return {};
  const c = firstTag(parent, childName);
  if (!c) return {};
  const sv = firstTag(c, "simpleValue");
  if (sv?.textContent) return { value: sv.textContent.trim() };
  const pat = firstTag(c, "pattern"); // xs:pattern value="..."
  if (pat) return { pattern: pat.getAttribute("value") ?? undefined };
  return {};
}

function cardinalityOf(el: Element): Cardinality {
  const c = (el.getAttribute("cardinality") || "").toLowerCase();
  if (c === "required" || c === "prohibited" || c === "optional") return c as Cardinality;
  const min = el.getAttribute("minOccurs");
  const max = el.getAttribute("maxOccurs");
  if (max === "0") return "prohibited";
  if (min && Number(min) >= 1) return "required";
  return "required"; // IDS default: requirements are required unless stated otherwise
}

export function parseIds(xml: string): IdsSpec {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid IDS XML (parse error).");

  const title = firstTag(doc, "title")?.textContent?.trim() || "IDS";
  const specifications: IdsSpecification[] = [];

  for (const specEl of nsTags(doc, "specification")) {
    const name = specEl.getAttribute("name") || "Specification";
    const applEl = firstTag(specEl, "applicability");
    const reqEl = firstTag(specEl, "requirements");

    // applicability: entity name + optional predefinedType
    const entityEl = applEl ? firstTag(applEl, "entity") : undefined;
    const entity = facetOf(entityEl, "name").value ?? facetOf(entityEl, "name").pattern;
    const predefinedType = facetOf(entityEl, "predefinedType").value;

    const properties: IdsPropertyFacet[] = [];
    const attributes: IdsAttributeFacet[] = [];
    if (reqEl) {
      for (const p of nsTags(reqEl, "property")) {
        const pset = facetOf(p, "propertySet");
        const base = facetOf(p, "baseName").value ? facetOf(p, "baseName") : facetOf(p, "name");
        const v = facetOf(p, "value");
        properties.push({
          pset: pset.value ?? "",
          name: base.value ?? "",
          datatype: p.getAttribute("dataType") ?? undefined,
          value: v.value,
          pattern: v.pattern,
          cardinality: cardinalityOf(p),
        });
      }
      for (const a of nsTags(reqEl, "attribute")) {
        const nm = facetOf(a, "name");
        const v = facetOf(a, "value");
        attributes.push({ name: nm.value ?? "", value: v.value, pattern: v.pattern, cardinality: cardinalityOf(a) });
      }
    }
    specifications.push({ name, applicability: { entity, predefinedType }, requirements: { properties, attributes } });
  }
  return { title, specifications };
}
