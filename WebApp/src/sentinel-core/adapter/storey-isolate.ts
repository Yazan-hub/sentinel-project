// sentinel-core/adapter/storey-isolate — isolate a building level in the 3D model by NAME (coordinate-free).
// Used by the Sheets viewer's "click a plan viewport → isolate that level in 3D" link. We match the Revit
// level name (from the sheet's viewport) against IfcBuildingStorey names in the loaded fragments, collect the
// elements that storey contains (via the spatial-containment relation), and hand back a ModelIdMap the caller
// can pass to Hider.isolate + Highlighter. Name-based so it works regardless of Revit↔IFC coordinate offsets.

import type * as OBC from "@thatopen/components";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const val = (o: any): string | undefined =>
  o && !Array.isArray(o) && typeof o === "object" && "value" in o && o.value != null ? String(o.value) : undefined;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Relation keys under which a storey lists the elements it contains, across fragment/IFC data shapes.
const CONTAINS_KEYS = ["ContainsElements", "IsDecomposedBy", "IfcRelContainedInSpatialStructure"];

export interface StoreyIsolation {
  matched: string | null;        // the storey name we matched (null if none)
  map: OBC.ModelIdMap;           // elements to isolate
  count: number;                 // total localIds collected
  storeys: string[];             // all storey names found (for a helpful "did you mean" message)
}

/**
 * Find the IfcBuildingStorey whose name matches `levelName` (exact, then contains) and collect its contained
 * elements across all loaded models. Returns an empty map (matched=null) if no storey matches.
 */
export async function isolateStoreyByName(
  fragments: OBC.FragmentsManager,
  levelName: string,
): Promise<StoreyIsolation> {
  const target = norm(levelName);
  const map: OBC.ModelIdMap = {};
  const storeys: string[] = [];
  let matched: string | null = null;
  let count = 0;

  for (const model of fragments.list.values()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = model as any;
    let byCat: Record<string, number[]> = {};
    try { byCat = await m.getItemsOfCategories([/^IFCBUILDINGSTOREY$/i]); } catch { continue; }
    const storeyIds = Object.values(byCat).flat();
    if (!storeyIds.length) continue;

    // Pull each storey with its Name + relations, so we can match by name and read contained elements.
    let data: unknown[] = [];
    try {
      data = await m.getItemsData(storeyIds, {
        attributesDefault: true,
        relations: { ContainsElements: { attributes: true, relations: false }, IsDecomposedBy: { attributes: true, relations: false } },
      });
    } catch {
      try { data = await m.getItemsData(storeyIds, { attributesDefault: true }); } catch { data = []; }
    }

    for (const d of data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec = d as any;
      const name = val(rec?.Name) ?? val(rec?.LongName) ?? "";
      if (name) storeys.push(name);
      const isMatch = name && (norm(name) === target || norm(name).includes(target) || target.includes(norm(name)));
      if (!isMatch) continue;
      matched = name;

      // Collect contained element localIds from whichever relation shape is present.
      const ids = new Set<number>();
      for (const key of CONTAINS_KEYS) {
        const rel = rec?.[key];
        if (!Array.isArray(rel)) continue;
        for (const child of rel) {
          const lid = typeof child?.localId === "number" ? child.localId
            : typeof child?._localId === "number" ? child._localId
            : typeof child === "number" ? child : undefined;
          if (typeof lid === "number") ids.add(lid);
        }
      }
      if (ids.size) {
        map[m.modelId] ??= new Set<number>();
        for (const id of ids) (map[m.modelId] as Set<number>).add(id);
        count += ids.size;
      }
    }
  }

  return { matched, map, count, storeys };
}
