// sentinel-core/adapter/model-clash — run the pure clash core over loaded fragments models. Pulls each
// element's bounding box via model.getBoxes (worker-backed, so it's "headless" — no manual per-element
// work), restricted to solid building elements (skips spaces/openings/annotation). Federated case (2+
// models) clashes cross-model; a single model self-clashes (noisier). Dedup is the caller's `known` set.

import type * as OBC from "@thatopen/components";
import { findClashes, dedupeClashes, type ClashItem, type Clash } from "../clash";

// Solid building elements worth clashing (discipline-agnostic); skip spaces/openings/grids/annotation.
const CLASHABLE = /^IFC(WALL|WALLSTANDARDCASE|SLAB|ROOF|COLUMN|BEAM|MEMBER|PLATE|DOOR|WINDOW|STAIR|STAIRFLIGHT|RAMP|RAILING|CURTAINWALL|COVERING|FOOTING|PILE|REINFORCINGBAR|FLOWSEGMENT|FLOWFITTING|FLOWTERMINAL|DUCTSEGMENT|PIPESEGMENT|CABLECARRIERSEGMENT|BUILDINGELEMENTPROXY)/i;

// Unwrap a fragments attribute ({value} | scalar) and pull the IFC GlobalId (`_guid` or `GlobalId`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attrVal = (a: any) => (a && typeof a === "object" && "value" in a ? a.value : a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickGuid(d: any): string | undefined {
  const g = attrVal(d?.["_guid"]) ?? attrVal(d?.["GlobalId"]);
  return g == null ? undefined : String(g);
}

async function itemsFor(model: {
  modelId: string;
  getItemsOfCategories: (r: RegExp[]) => Promise<Record<string, number[]>>;
  getBoxes: (ids: number[]) => Promise<{ min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; isEmpty: () => boolean }[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getItemsData: (ids: number[], config: unknown) => Promise<any[]>;
}): Promise<ClashItem[]> {
  const byCat = await model.getItemsOfCategories([CLASHABLE]);
  const ids = Object.values(byCat).flat();
  if (!ids.length) return [];
  const boxes = await model.getBoxes(ids);
  // Fetch each element's IFC GlobalId so the clash signature is revision-stable (see clash.ts::keyOf).
  // Same call shape as clash-panel's raise-time guid lookup; degrade gracefully to localId if unavailable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] = [];
  try {
    data = await model.getItemsData(ids, { attributesDefault: true, relationsDefault: { attributes: false, relations: false } });
  } catch { /* no guids → keyOf falls back to modelId:localId */ }
  const items: ClashItem[] = [];
  for (let i = 0; i < ids.length; i++) {
    const b = boxes[i];
    if (!b || b.isEmpty()) continue;
    items.push({
      modelId: model.modelId, localId: ids[i], guid: pickGuid(data[i]),
      box: { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] },
    });
  }
  return items;
}

export interface ClashRun { modelCount: number; scanned: number; total: number; clashes: Clash[]; }

export async function runClash(
  fragments: OBC.FragmentsManager,
  known: ReadonlySet<string>,
  tol = 0.02,
): Promise<ClashRun> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const models = [...fragments.list.values()] as any[];
  const sets = await Promise.all(models.map(itemsFor));
  const scanned = sets.reduce((a, s) => a + s.length, 0);
  const all: Clash[] = [];
  if (models.length >= 2) {
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
      all.push(...findClashes(sets[i], sets[j], tol)); // cross-model (federated) — the clean case
    }
  } else if (sets[0]?.length) {
    for (const c of findClashes(sets[0], sets[0], tol)) if (c.a.localId !== c.b.localId) all.push(c); // self-clash (noisier)
  }
  const clashes = dedupeClashes(all, known).sort((a, b) => b.volume - a.volume);
  return { modelCount: models.length, scanned, total: all.length, clashes };
}
