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

export async function itemsFor(model: {
  modelId: string;
  getItemsOfCategories: (r: RegExp[]) => Promise<Record<string, number[]>>;
  getBoxes: (ids: number[]) => Promise<{ min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; isEmpty: () => boolean }[]>;
  getGuidsByLocalIds: (ids: number[]) => Promise<(string | null)[]>;
}): Promise<ClashItem[]> {
  const byCat = await model.getItemsOfCategories([CLASHABLE]);
  const ids = Object.values(byCat).flat();
  if (!ids.length) return [];
  const boxes = await model.getBoxes(ids);
  // Each element's IFC GlobalId, so the clash signature is revision-stable (see clash.ts::keyOf), and nothing else: every
  // attribute of every element, read only for this one, cost the engine ~40× more (123 ms vs 3 ms for the hospital's 15,557
  // architecture elements, large-model benchmark 2026-10-21). Degrade gracefully to localId if unavailable.
  let guids: (string | null)[] = [];
  try { guids = await model.getGuidsByLocalIds(ids); } catch { /* no guids → keyOf falls back to modelId:localId */ }
  const items: ClashItem[] = [];
  for (let i = 0; i < ids.length; i++) {
    const b = boxes[i];
    if (!b || b.isEmpty()) continue;
    items.push({
      modelId: model.modelId, localId: ids[i], guid: guids[i] ?? undefined,
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
  const t0 = performance.now();
  const sets = await Promise.all(models.map(itemsFor)); // gather boxes on the main thread (fragments-backed)
  const scanned = sets.reduce((a, s) => a + s.length, 0);
  const t1 = performance.now();
  // The O(n²) compare + dedup + sort runs OFF the main thread (falls back to sync when no Worker) — see clash-worker.
  const { total, clashes } = await runClashInWorker(sets, known, tol);
  // eslint-disable-next-line no-console
  console.log(`[Sentinel] clash boxes ${scanned} element(s) of ${models.length} model(s): read ${ms(t1 - t0)}, compare ${ms(performance.now() - t1)}`); // a string: the sandboxed console is where a benchmark reads it
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
  const t0 = performance.now();
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
  // eslint-disable-next-line no-console
  console.log(`[Sentinel] clash solids ${cands.length} candidate(s) in ${groups.length} model pair(s): ${ms(performance.now() - t0)}`);
  return hits;
}

const ms = (t: number) => `${(t / 1000).toFixed(1)} s`;
