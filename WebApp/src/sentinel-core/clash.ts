// sentinel-core/clash — PURE clash-detection core (no OBC/THREE/DOM). AABB broad-phase between two item
// sets via a 1D sweep-and-prune on X (prunes most pairs), then a full 3-axis overlap test with a minimum
// penetration tolerance to cut false positives from merely-touching boxes. Each clash carries a STABLE
// signature (sorted element-key pair) so re-runs can dedup against already-known/resolved clashes — only
// new, unresolved clashes surface. Narrow-phase mesh intersection is a later refinement.

export interface Aabb { min: [number, number, number]; max: [number, number, number]; }
export interface ClashItem { modelId: string; localId: number; guid?: string; box: Aabb; }
export interface Clash {
  id: string; // stable signature (sorted key pair)
  a: ClashItem;
  b: ClashItem;
  overlap: [number, number, number]; // penetration on each axis (m)
  volume: number; // overlap AABB volume (m^3) — rank clashes by this
  distance?: number; // clearance runs: the solids' distance (m), set once the Collider confirmed the pair
  touching?: boolean; // hard runs: the solids meet but the engine measured no overlap volume (a wall standing on a slab)
}

// Prefer the globally-unique IFC GlobalId so a clash signature SURVIVES a model re-export: both modelId
// (fragments load id) and localId shift between exports/reloads, but the GlobalId does not — that stability
// is what lets a resolved/approved clash stay resolved across revisions. Fall back to modelId:localId only
// when no GlobalId is available; the "g:" prefix keeps the two key spaces from ever colliding.
const keyOf = (i: ClashItem) => (i.guid ? `g:${i.guid}` : `${i.modelId}:${i.localId}`);
/** Order-independent signature for an element pair — the dedup key across runs. */
export function clashSignature(a: ClashItem, b: ClashItem): string {
  const ka = keyOf(a), kb = keyOf(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** 3-axis AABB overlap; null unless every axis overlaps by more than `tol` metres. */
export function boxesClash(a: Aabb, b: Aabb, tol: number): { overlap: [number, number, number]; volume: number } | null {
  const ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const oy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  if (ox <= tol || oy <= tol || oz <= tol) return null;
  return { overlap: [ox, oy, oz], volume: ox * oy * oz };
}

/**
 * Broad-phase clashes between two item sets. Sort both by min-x and sweep: each a is tested against the b-items
 * that started at or left of it and still reach it (the active list), then the b-items that start inside it.
 * `tol` = min penetration (m); `cap` bounds the result set (very dense models can produce huge counts).
 *
 * The active list drops each expired item on its own. A single start pointer (the sweep before 2026-10-21) could
 * only skip a contiguous prefix, so it stalled behind the first long element (a slab across the building) and every
 * later a re-scanned all b after it: 7.5 s for the hospital's 40k elements. Same pairs, same order.
 */
export function findClashes(setA: ClashItem[], setB: ClashItem[], tol = 0.02, cap = 20000): Clash[] {
  const a = [...setA].sort((p, q) => p.box.min[0] - q.box.min[0]);
  const b = [...setB].sort((p, q) => p.box.min[0] - q.box.min[0]);
  const out: Clash[] = [];
  const active: ClashItem[] = []; // b-items with min-x ≤ this a's, in min-x order
  let next = 0;
  const test = (ia: ClashItem, ib: ClashItem) => {
    const r = boxesClash(ia.box, ib.box, tol);
    if (!r) return false;
    out.push({ id: clashSignature(ia, ib), a: ia, b: ib, overlap: r.overlap, volume: r.volume });
    return out.length >= cap;
  };
  for (const ia of a) {
    while (next < b.length && b[next].box.min[0] <= ia.box.min[0]) active.push(b[next++]);
    let keep = 0;
    for (const ib of active) {
      if (ib.box.max[0] <= ia.box.min[0] + tol) continue; // left of this a, so of every later a too: dropped
      active[keep++] = ib;
      if (test(ia, ib)) return out;
    }
    active.length = keep;
    for (let j = next; j < b.length && b[j].box.min[0] < ia.box.max[0] - tol; j++) // sorted by min-x → no further X overlap
      if (test(ia, b[j])) return out;
  }
  return out;
}

/** Drop clashes whose signature is already known (raised / resolved) — leaves only new ones. */
export function dedupeClashes(clashes: Clash[], known: ReadonlySet<string>): Clash[] {
  const seen = new Set<string>();
  const out: Clash[] = [];
  for (const c of clashes) {
    if (known.has(c.id) || seen.has(c.id)) continue; // known across runs, or duplicate within this run
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export interface ClashComputation { total: number; clashes: Clash[]; }

/**
 * The whole CPU-bound clash pass over already-gathered item sets — the O(n²)-ish work that must run OFF the
 * main thread. Federated case (2+ models) clashes every model pair; a single set self-clashes (dropping an
 * element paired with itself; symmetric duplicates collapse in dedup). Returns the raw `total` (pre-dedup,
 * for reporting) plus new-only clashes ranked by penetration volume.
 *
 * PURE and self-contained on purpose: this is the single canonical algorithm. `adapter/clash-worker` runs it
 * on the main thread as the sync fallback AND ships a byte-faithful copy inside its blob worker — keep the two
 * in lock-step (the worker copy is duplicated because a minified `.toString()` would mangle helper references).
 */
export function computeClashRun(sets: ClashItem[][], known: ReadonlySet<string> = new Set(), tol = 0.02): ClashComputation {
  const all: Clash[] = [];
  if (sets.length >= 2) {
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++)
        all.push(...findClashes(sets[i], sets[j], tol)); // cross-model (federated) — the clean case
  } else if (sets[0]?.length) {
    for (const c of findClashes(sets[0], sets[0], tol))
      if (c.a.localId !== c.b.localId) all.push(c); // self-clash (noisier)
  }
  const clashes = dedupeClashes(all, known).sort((a, b) => b.volume - a.volume);
  return { total: all.length, clashes };
}
