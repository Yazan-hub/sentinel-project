// sentinel-core/adapter/element-properties — read ONE element's full IFC data from a loaded fragments
// model, parsed into a clean, grouped, IDS-ready shape for the Properties Palette (Phase 1). Handles the
// two IFC shapes the raw data mixes: Pset properties live under IsDefinedBy→HasProperties→NominalValue,
// quantity sets under IsDefinedBy→Quantities→<type>Value. Companion to fragments-facts.ts (which builds
// the many-element ElementFacts); this is the single-element, all-psets inspector.

import type * as FRAGS from "@thatopen/fragments";

export interface PropRow {
  name: string;
  value: string;
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

/** Extract a single element's identity + all property/quantity sets from a fragments model. */
export async function extractElementProperties(
  model: FRAGS.FragmentsModel,
  localId: number,
): Promise<ElementProperties> {
  const results = await model.getItemsData([localId], {
    attributesDefault: true,
    relations: {
      IsDefinedBy: { attributes: true, relations: false },
      IsTypedBy: { attributes: true, relations: false },
    },
    relationsDefault: { attributes: false, relations: false },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = results?.[0] as any;

  const identity = {
    GlobalId: val(data?.["_guid"]) ?? val(data?.["GlobalId"]),
    Name: val(data?.["Name"]),
    Class: val(data?.["_category"]) ?? val(data?.["category"]),
    ObjectType: val(data?.["ObjectType"]),
    PredefinedType: val(data?.["PredefinedType"]),
    Tag: val(data?.["Tag"]),
  };

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
          if (name && value != null) rows.push({ name, value });
        }
        if (rows.length) psets.push({ name: setName, rows });
      }

      if (Array.isArray(qtys)) {
        const rows: PropRow[] = [];
        for (const q of qtys) {
          const name = val(q?.["Name"]);
          const value =
            val(q?.["LengthValue"]) ?? val(q?.["AreaValue"]) ?? val(q?.["VolumeValue"]) ??
            val(q?.["CountValue"]) ?? val(q?.["WeightValue"]) ?? val(q?.["Value"]);
          if (name && value != null) rows.push({ name, value });
        }
        if (rows.length) quantities.push({ name: setName, rows });
      }
    }
  }

  psets.sort((a, b) => a.name.localeCompare(b.name));
  quantities.sort((a, b) => a.name.localeCompare(b.name));
  return { modelId: model.modelId, localId, identity, psets, quantities };
}
