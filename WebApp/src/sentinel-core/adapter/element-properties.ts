// sentinel-core/adapter/element-properties — read ONE element's full IFC data from a loaded fragments
// model, parsed into a clean, grouped, IDS-ready shape for the Properties Palette (Phase 1). Handles the
// two IFC shapes the raw data mixes: Pset properties live under IsDefinedBy→HasProperties→NominalValue,
// quantity sets under IsDefinedBy→Quantities→<type>Value. Companion to fragments-facts.ts (which builds
// the many-element ElementFacts); this is the single-element, all-psets inspector.

import type * as FRAGS from "@thatopen/fragments";

export interface PropRow {
  name: string;
  value: string;
  type?: string; // the value's IFC type ("IFCLABEL"), where the reader carries it — an IDS dataType is judged against it
}
export interface PropGroup {
  name: string; // pset / quantity-set name, e.g. "Pset_WallCommon"
  rows: PropRow[];
}
export interface ElementProperties {
  modelId: string;
  localId: number;
  identity: {
    GlobalId?: string;
    Name?: string;
    Class?: string; // IFC class, e.g. IFCWALLSTANDARDCASE
    ObjectType?: string;
    PredefinedType?: string;
    Tag?: string;
    [attribute: string]: string | undefined; // any other direct attribute with a plain value (Description, LongName, …)
  };
  psets: PropGroup[]; // Pset_* property sets
  quantities: PropGroup[]; // Qto_* quantity sets
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const val = (o: any): string | undefined => {
  if (o == null) return undefined;
  if (!Array.isArray(o) && typeof o === "object" && "value" in o) {
    return o.value == null ? undefined : String(o.value);
  }
  return undefined;
};

/** getItemsData relations that reach every property and quantity VALUE: an element's sets and type (IsDefinedBy,
 *  IsTypedBy), a type's sets (HasPropertySets), each set's HasProperties / Quantities — and never a set's or a type's
 *  links back to the elements (DefinesOccurrence, ObjectTypeOf, Types) or its associations. A nested item takes its
 *  own relation's entry, else its parent's. `IsDefinedBy: {relations: false}`, as every reader here had it, returned
 *  each set's name with none of its values (seen 2026-09-29: aster-tower v3's COBie read 0/168 in the browser, 168/168
 *  on the bridge). Shared by every reader of Pset/Qto values. */
export const PSET_RELATIONS = {
  IsDefinedBy: { attributes: true, relations: true },
  IsTypedBy: { attributes: true, relations: true },
  HasPropertySets: { attributes: true, relations: true },
  HasProperties: { attributes: true, relations: false },
  Quantities: { attributes: true, relations: false },
  DefinesOccurrence: { attributes: false, relations: false },
  ObjectTypeOf: { attributes: false, relations: false },
  Types: { attributes: false, relations: false },
  HasAssociations: { attributes: false, relations: false },
};

// A quantity's IFC measure type, as IfcTester reads it off the schema (an IDS dataType on a Qto_ property); bridge/ifc-extract.mjs has the same.
const QTY_TYPES = { LengthValue: "IFCLENGTHMEASURE", AreaValue: "IFCAREAMEASURE", VolumeValue: "IFCVOLUMEMEASURE",
  CountValue: "IFCCOUNTMEASURE", WeightValue: "IFCMASSMEASURE" } as const;

/** getItemsData options that pull attributes + Pset/Qto sets (shared by single + bulk paths). */
export const PROPERTY_DATA_CONFIG = {
  attributesDefault: true,
  relations: PSET_RELATIONS,
  relationsDefault: { attributes: false, relations: false },
};

/** Extract a single element's identity + all property/quantity sets from a fragments model. */
export async function extractElementProperties(
  model: FRAGS.FragmentsModel,
  localId: number,
): Promise<ElementProperties> {
  const results = await model.getItemsData([localId], PROPERTY_DATA_CONFIG);
  return parseElementProperties(results?.[0], model.modelId, localId);
}

/** Pure parse of one raw ItemData record → ElementProperties. Lets the model validator bulk-fetch once. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseElementProperties(data: any, modelId: string, localId: number): ElementProperties {
  const identity: ElementProperties["identity"] = {
    GlobalId: val(data?.["_guid"]) ?? val(data?.["GlobalId"]),
    Name: val(data?.["Name"]),
    Class: val(data?.["_category"]) ?? val(data?.["category"]),
    ObjectType: val(data?.["ObjectType"]),
    PredefinedType: val(data?.["PredefinedType"]),
    Tag: val(data?.["Tag"]),
  };
  // Every other direct attribute with a plain value, so an IDS attribute facet can name any (Description, LongName, …).
  for (const [k, v] of Object.entries(data ?? {})) {
    if (!(k in identity) && !k.startsWith("_") && v && typeof v === "object" && !Array.isArray(v) && "value" in v
        && v.value != null && typeof v.value !== "object") identity[k] = String(v.value);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typeOf = (o: any): string | undefined => (typeof o?.type === "string" && /^IFC/i.test(o.type) ? o.type.toUpperCase() : undefined); // only an IFC type name

  const psets: PropGroup[] = [];
  const quantities: PropGroup[] = [];

  const definedBy = data?.["IsDefinedBy"];
  if (Array.isArray(definedBy)) {
    for (const set of definedBy) {
      const setName = val(set?.["Name"]) ?? "Property Set";
      const hasProps = set?.["HasProperties"];
      const qtys = set?.["Quantities"];

      if (Array.isArray(hasProps)) {
        const rows: PropRow[] = [];
        for (const p of hasProps) {
          const name = val(p?.["Name"]);
          const value = val(p?.["NominalValue"]) ?? val(p?.["Value"]);
          const type = typeOf(p?.["NominalValue"]);
          if (name && value != null) rows.push(type ? { name, value, type } : { name, value });
        }
        if (rows.length) psets.push({ name: setName, rows });
      }

      if (Array.isArray(qtys)) {
        const rows: PropRow[] = [];
        for (const q of qtys) {
          const name = val(q?.["Name"]);
          const key = (Object.keys(QTY_TYPES) as (keyof typeof QTY_TYPES)[]).find((k) => val(q?.[k]) != null);
          const value = key ? val(q[key]) : val(q?.["Value"]);
          if (name && value != null) rows.push(key ? { name, value, type: QTY_TYPES[key] } : { name, value });
        }
        if (rows.length) quantities.push({ name: setName, rows });
      }
    }
  }

  psets.sort((a, b) => a.name.localeCompare(b.name));
  quantities.sort((a, b) => a.name.localeCompare(b.name));
  return { modelId, localId, identity, psets, quantities };
}
