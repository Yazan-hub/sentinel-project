// sentinel-core/adapter/project-tree — build a Revit-style browse tree (Category → Type → Instance)
// from every loaded fragments model. Reads each element's category (_category), type (ObjectType) and
// Name via getItemsData, then buckets them. Non-visual entities (relationships, property/material/geometry
// definitions) are filtered out so the tree shows only building elements — like Revit's model categories.

import type * as OBC from "@thatopen/components";

export interface TreeInstance { modelId: string; localId: number; name: string; }
export interface TreeType { name: string; instances: TreeInstance[]; }
export interface TreeCategory { category: string; label: string; types: TreeType[]; count: number; }

// Friendly labels for common IFC classes (Revit-ish names).
const LABELS: Record<string, string> = {
  IFCWALL: "Walls", IFCWALLSTANDARDCASE: "Walls", IFCSLAB: "Floors / Slabs", IFCROOF: "Roofs",
  IFCCOLUMN: "Columns", IFCBEAM: "Beams", IFCMEMBER: "Members", IFCPLATE: "Plates",
  IFCDOOR: "Doors", IFCWINDOW: "Windows", IFCCURTAINWALL: "Curtain Walls", IFCRAILING: "Railings",
  IFCSTAIR: "Stairs", IFCSTAIRFLIGHT: "Stair Flights", IFCRAMP: "Ramps", IFCCOVERING: "Coverings",
  IFCFURNISHINGELEMENT: "Furniture", IFCFURNITURE: "Furniture", IFCBUILDINGELEMENTPROXY: "Generic Models",
  IFCSPACE: "Spaces", IFCBUILDINGSTOREY: "Levels", IFCSITE: "Site",
  IFCFLOWTERMINAL: "MEP Terminals", IFCFLOWSEGMENT: "MEP Ducts / Pipes", IFCFLOWFITTING: "MEP Fittings",
  IFCLIGHTFIXTURE: "Lighting", IFCSANITARYTERMINAL: "Plumbing Fixtures", IFCPILE: "Piles",
  IFCFOOTING: "Foundations", IFCREINFORCINGBAR: "Rebar",
};
const labelFor = (cat: string) => LABELS[cat.toUpperCase()] ?? cat.replace(/^IFC/i, "");

// Categories that are NOT building elements (relationships, definitions, geometry primitives).
const SKIP = /^IFC(REL|PROPERTY|QUANTITY|ELEMENTQUANTITY|MATERIAL|STYLED?|PRESENTATION|SURFACESTYLE|OWNERHISTORY|APPLICATION|ORGANIZATION|PERSON|SIUNIT|UNITASSIGNMENT|GEOMETRICREP|CARTESIAN|DIRECTION|AXIS2|SHAPEREP|PRODUCTDEF|EXTRUDED|RECTANGLE|ARBITRARY|POLYLINE|POLYLOOP|FACE|CLOSEDSHELL|LOCALPLACEMENT|MAPPED|REPRESENTATIONMAP|COLOURRGB|CONVERSIONBASED)/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const val = (o: any): string | undefined => {
  if (o == null || Array.isArray(o) || typeof o !== "object" || !("value" in o)) return undefined;
  return o.value == null ? undefined : String(o.value);
};

export async function buildProjectTree(fragments: OBC.FragmentsManager): Promise<TreeCategory[]> {
  const cats = new Map<string, Map<string, TreeInstance[]>>();

  for (const model of fragments.list.values()) {
    const byCat = await model.getItemsOfCategories([/^IFC/i]);
    const ids = Object.values(byCat).flat();
    if (!ids.length) continue;
    const data = await model.getItemsData(ids, {
      attributesDefault: true,
      relationsDefault: { attributes: false, relations: false },
    });
    for (let i = 0; i < ids.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data[i] as any;
      const category = (val(d?.["_category"]) ?? val(d?.["category"]) ?? "Unknown").toUpperCase();
      if (SKIP.test(category)) continue;
      const type = val(d?.["ObjectType"]) || "(no type)";
      const name = val(d?.["Name"]) || `#${ids[i]}`;
      let types = cats.get(category);
      if (!types) { types = new Map(); cats.set(category, types); }
      let insts = types.get(type);
      if (!insts) { insts = []; types.set(type, insts); }
      insts.push({ modelId: model.modelId, localId: ids[i], name });
    }
  }

  const out: TreeCategory[] = [];
  for (const [category, types] of cats) {
    const t: TreeType[] = [];
    let count = 0;
    for (const [name, instances] of types) {
      instances.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      t.push({ name, instances });
      count += instances.length;
    }
    t.sort((a, b) => a.name.localeCompare(b.name));
    out.push({ category, label: labelFor(category), types: t, count });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
