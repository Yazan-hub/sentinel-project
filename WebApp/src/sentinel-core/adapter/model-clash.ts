// sentinel-core/adapter/model-clash — run the pure clash core over loaded fragments models. Pulls each
// element's bounding box via model.getBoxes (worker-backed, so it's "headless" — no manual per-element
// work), restricted to solid building elements (skips spaces/openings/annotation). Federated case (2+
// models) clashes cross-model; a single model self-clashes (noisier). Dedup is the caller's `known` set.

import * as OBC from "@thatopen/components";
import { type ClashItem, type Clash } from "../clash";
import { runClashInWorker } from "./clash-worker";
import { candidateGroups, type ClashMode, type SolidHit } from "../clash-confirm";

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
  const sets = await Promise.all(models.map(itemsFor)); // gather boxes on the main thread (fragments-backed)
  const scanned = sets.reduce((a, s) => a + s.length, 0);
  // The O(n²) compare + dedup + sort runs OFF the main thread (falls back to sync when no Worker) — see clash-worker.
  const { total, clashes } = await runClashInWorker(sets, known, tol);
  return { modelCount: models.length, scanned, total, clashes };
}

/**
 * Check the candidates on the solids with the engine's Collider (spec 2026-09-28 Decision 1): one call per model pair,
 * carrying only that pair's candidate elements. Throws when the Collider cannot run — the caller then says the run is
 * boxes only, never passes boxes off as clashes.
 */
export async function confirmOnSolids(
  components: OBC.Components,
  cands: readonly Clash[],
  mode: ClashMode,
  onProgress?: (done: number, of: number) => void,
): Promise<SolidHit[]> {
  const collider = components.get(OBC.Collider);
  const opts: OBC.ClashOptions = mode.type === "hard" ? { type: "hard", calculateVolume: true } : { type: "clearance", tolerance: mode.distance };
  const hits: SolidHit[] = [];
  const groups = candidateGroups(cands);
  let done = 0;
  for (const g of groups) {
    const setA: OBC.ModelIdMap = { [g.modelA]: g.idsA };
    const setB: OBC.ModelIdMap = { [g.modelB]: g.idsB };
    for (const r of await collider.find(setA, setB, opts)) {
      hits.push({
        modelA: r.elementA.modelId, localA: r.elementA.localId, modelB: r.elementB.modelId, localB: r.elementB.localId,
        volume: r.type === "hard" ? r.volume : undefined, distance: r.type === "clearance" ? r.distance : undefined,
      });
    }
    onProgress?.(++done, groups.length);
  }
  return hits;
}
