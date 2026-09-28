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

/** One element as the tree reads it. */
export interface TreeRow { modelId: string; localId: number; category: string; type: string; name: string; }
/** A loaded model's own branch: its categories, as the single-model tree shows them. */
export interface TreeModelNode { modelId: string; categories: TreeCategory[]; count: number; }

/** PURE: bucket rows into Category → Type → Instance, sorted by label, type name and instance name. */
export function groupCategories(rows: readonly TreeRow[]): TreeCategory[] {
  const cats = new Map<string, Map<string, TreeInstance[]>>();
  for (const r of rows) {
    let types = cats.get(r.category);
    if (!types) { types = new Map(); cats.set(r.category, types); }
    let insts = types.get(r.type);
    if (!insts) { insts = []; types.set(r.type, insts); }
    insts.push({ modelId: r.modelId, localId: r.localId, name: r.name });
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

/** PURE: one branch per model, in the order the models were loaded; a model with no rows is kept (count 0) so the tree
 *  shows every loaded model, and the same type name in two models stays two rows. */
export function groupByModel(rows: readonly TreeRow[], modelOrder: readonly string[]): TreeModelNode[] {
  const byModel = new Map<string, TreeRow[]>(modelOrder.map((m) => [m, []]));
  for (const r of rows) (byModel.get(r.modelId) ?? byModel.set(r.modelId, []).get(r.modelId)!).push(r);
  return [...byModel].map(([modelId, rs]) => ({ modelId, categories: groupCategories(rs), count: rs.length }));
}

/** Read every loaded model's building elements (category, ObjectType, Name). */
export async function readTreeRows(fragments: OBC.FragmentsManager): Promise<TreeRow[]> {
  const rows: TreeRow[] = [];
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
      rows.push({ modelId: model.modelId, localId: ids[i], category, type: val(d?.["ObjectType"]) || "(no type)", name: val(d?.["Name"]) || `#${ids[i]}` });
    }
  }
  return rows;
}

/** Every loaded model merged by category (Revit's Visibility/Graphics view of the federation). */
export async function buildProjectTree(fragments: OBC.FragmentsManager): Promise<TreeCategory[]> {
  return groupCategories(await readTreeRows(fragments));
}

/** One branch per loaded model (the federation as the Browser shows it). */
export async function buildModelTree(fragments: OBC.FragmentsManager): Promise<TreeModelNode[]> {
  return groupByModel(await readTreeRows(fragments), [...fragments.list.keys()].map(String));
}
