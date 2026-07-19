// sentinel-core/revision-diff — PURE TS (no OBC/DOM/THREE). The shared revision-tracking engine: a generic
// per-element snapshot diff keyed on the IFC GlobalId, which is STABLE across a model re-export (unlike the
// fragments model_id and IFC local_id — see clash.ts::keyOf). One engine serves 5D cost (quantity Δ per
// element → per BoQ line), 6D carbon (same, on carbon factors), and clash provenance.
//
// Why element-level, not aggregate: because it diffs by GlobalId, offsetting changes (one wall added + an
// equal one deleted) are reported as +1 added / -1 deleted and NEVER net to zero and vanish — the exact
// defect in the line-aggregated cost baseline (docs/competitive-build-specs.md §4).

import type { ElementQuantities, Measure } from "./quantities";

const MEASURES: Measure[] = ["count", "length", "area", "volume", "weight"];

/** A storable, revision-stable snapshot of one element (the row persisted to element_snapshots). */
export interface ElementSnapshot {
  guid: string; // IFC GlobalId — the stable join key
  category?: string;
  type_name?: string;
  quantities: Partial<Record<Measure, number>>;
}

export interface MeasureDelta { measure: Measure; old: number; new: number; delta: number; }
export interface ChangedElement { guid: string; before: ElementSnapshot; after: ElementSnapshot; deltas: MeasureDelta[]; }
export interface RevisionDiff {
  added: ElementSnapshot[]; // guid present in the new revision only
  deleted: ElementSnapshot[]; // guid present in the old revision only
  changed: ChangedElement[]; // guid in both, a quantity moved beyond epsilon
  unchanged: number; // count only
}
export interface DiffSummary { added: number; deleted: number; changed: number; unchanged: number; }

/** Convert the 5D take-off shape into a stable snapshot (drops undefined measures so the JSON stays clean). */
export function snapshotFromQuantities(qs: ElementQuantities[]): ElementSnapshot[] {
  return qs.map((e) => ({
    guid: e.guid,
    category: e.category,
    type_name: e.type_name,
    quantities: pruned({ count: e.count, length: e.length, area: e.area, volume: e.volume, weight: e.weight }),
  }));
}

function pruned(q: Partial<Record<Measure, number | undefined>>): Partial<Record<Measure, number>> {
  const out: Partial<Record<Measure, number>> = {};
  for (const m of MEASURES) {
    const v = q[m];
    if (v != null) out[m] = v;
  }
  return out;
}

/** Index by GlobalId, first occurrence wins (GlobalIds are unique; duplicates are ignored defensively). */
function indexByGuid(set: ElementSnapshot[]): Map<string, ElementSnapshot> {
  const m = new Map<string, ElementSnapshot>();
  for (const s of set) if (s.guid && !m.has(s.guid)) m.set(s.guid, s);
  return m;
}

function measureDeltas(before: ElementSnapshot, after: ElementSnapshot, eps: number): MeasureDelta[] {
  const out: MeasureDelta[] = [];
  for (const m of MEASURES) {
    const o = before.quantities[m] ?? 0;
    const n = after.quantities[m] ?? 0;
    if (Math.abs(n - o) > eps) out.push({ measure: m, old: o, new: n, delta: n - o });
  }
  return out;
}

/**
 * Diff two element-snapshot sets by GlobalId. `epsilon` (default 1e-6) absorbs float jitter in Qto values.
 * Deterministic; each bucket preserves first-occurrence input order (Map iteration order).
 */
export function diffSnapshots(oldSet: ElementSnapshot[], newSet: ElementSnapshot[], epsilon = 1e-6): RevisionDiff {
  const oldByGuid = indexByGuid(oldSet);
  const newByGuid = indexByGuid(newSet);
  const added: ElementSnapshot[] = [];
  const changed: ChangedElement[] = [];
  const deleted: ElementSnapshot[] = [];
  let unchanged = 0;

  for (const [guid, after] of newByGuid) {
    const before = oldByGuid.get(guid);
    if (!before) { added.push(after); continue; }
    const deltas = measureDeltas(before, after, epsilon);
    if (deltas.length) changed.push({ guid, before, after, deltas });
    else unchanged++;
  }
  for (const [guid, before] of oldByGuid) {
    if (!newByGuid.has(guid)) deleted.push(before);
  }
  return { added, deleted, changed, unchanged };
}

export function summarizeDiff(d: RevisionDiff): DiffSummary {
  return { added: d.added.length, deleted: d.deleted.length, changed: d.changed.length, unchanged: d.unchanged };
}

/** Net change of one measure across the whole diff (added +, deleted −, changed by its delta). */
export function netDelta(d: RevisionDiff, measure: Measure): number {
  let net = 0;
  for (const s of d.added) net += s.quantities[measure] ?? 0;
  for (const s of d.deleted) net -= s.quantities[measure] ?? 0;
  for (const c of d.changed) {
    const m = c.deltas.find((x) => x.measure === measure);
    if (m) net += m.delta;
  }
  return net;
}
