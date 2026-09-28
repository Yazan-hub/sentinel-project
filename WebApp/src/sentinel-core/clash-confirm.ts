// sentinel-core/clash-confirm — PURE (no OBC/THREE/DOM). The box broad-phase (clash.ts) proposes candidate pairs; the
// engine's Collider checks the solids of those candidates; this keeps only the pairs the solids confirm, counts what the
// boxes alone would have reported, and words the run. Spec 2026-09-28-3d-viewer-design.md Decisions 1-3.

import type { Clash } from "./clash";

export type ClashMode = { type: "hard" } | { type: "clearance"; distance: number };

/** One pair the Collider returned, reduced to what matching needs. */
export interface SolidHit {
  modelA: string; localA: number;
  modelB: string; localB: number;
  volume?: number;   // hard, when the engine computed it (m³)
  distance?: number; // clearance (m)
}

/** The candidates of one model pair (or one model against itself), as the Collider takes them. */
export interface CandidateGroup { modelA: string; modelB: string; idsA: Set<number>; idsB: Set<number>; }

const key = (m: string, l: number) => `${m}#${l}`;
const pairKey = (ma: string, la: number, mb: string, lb: number) => {
  const a = key(ma, la), b = key(mb, lb);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

/** Group candidate pairs by model pair, so each Collider call carries only elements that can clash. */
export function candidateGroups(cands: readonly Clash[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const c of cands) {
    const [x, y] = c.a.modelId <= c.b.modelId ? [c.a, c.b] : [c.b, c.a];
    const k = `${x.modelId}|${y.modelId}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { modelA: x.modelId, modelB: y.modelId, idsA: new Set(), idsB: new Set() }));
    g.idsA.add(x.localId);
    g.idsB.add(y.localId);
    if (x.modelId === y.modelId) { g.idsA.add(y.localId); g.idsB.add(x.localId); } // a self group is one set against itself
  }
  return [...groups.values()];
}

export interface ConfirmResult {
  clashes: Clash[];   // candidates the solids confirmed: overlaps by volume first, then the touching ones
  dropped: number;    // candidates whose boxes overlap but whose solids do not meet
  touching: number;   // hard: solids that meet with no measured overlap volume (listed last, marked)
}

/**
 * Keep the candidates the Collider confirmed. A hit that was never a candidate is ignored: a candidate is how the
 * register knows the pair (its signature, its box overlap); the Collider only says yes or no to it. Hard clashes take
 * the solids' volume when the engine measured one; a pair it measured none for is kept but marked `touching` and listed
 * after the overlaps (its box volume is not a clash volume). Found live on aster-tower: 2,552 of 3,635 hits had no
 * volume — walls standing on slabs. Clearance clashes are ranked by distance (closest first).
 */
export function confirm(cands: readonly Clash[], hits: readonly SolidHit[], mode: ClashMode): ConfirmResult {
  const byPair = new Map<string, SolidHit>();
  for (const h of hits) {
    if (h.modelA === h.modelB && h.localA === h.localB) continue; // an element against itself
    byPair.set(pairKey(h.modelA, h.localA, h.modelB, h.localB), h);
  }
  const kept: { c: Clash; h: SolidHit }[] = [];
  for (const c of cands) {
    const h = byPair.get(pairKey(c.a.modelId, c.a.localId, c.b.modelId, c.b.localId));
    if (h) kept.push({ c, h });
  }
  const clashes: Clash[] = kept.map(({ c, h }) => {
    if (mode.type === "clearance") return { ...c, volume: 0, distance: h.distance ?? 0 };
    if (typeof h.volume === "number" && h.volume > 0) return { ...c, volume: h.volume };
    return { ...c, volume: 0, touching: true };
  });
  if (mode.type === "clearance") clashes.sort((p, q) => (p.distance ?? 0) - (q.distance ?? 0));
  else clashes.sort((p, q) => Number(!!p.touching) - Number(!!q.touching) || q.volume - p.volume);
  return { clashes, dropped: cands.length - kept.length, touching: clashes.filter((c) => c.touching).length };
}

/** The panel's status after a run, in plain words. `solidsError` set = the exact check did not run (boxes only). */
export function runSentence(r: {
  modelCount: number; scanned: number; candidates: number; known: number;
  mode: ClashMode; confirmed?: ConfirmResult; solidsError?: string;
}): string {
  const what = r.mode.type === "hard" ? "clash(es)" : `element pair(s) closer than ${r.mode.distance} m`;
  const scope = r.modelCount < 2 ? "1 model against itself" : `${r.modelCount} models`;
  const head = `${scope} · ${r.scanned.toLocaleString("en-US")} elements`;
  const knownNote = r.known ? ` (${r.known} already in the register, not re-checked)` : "";
  if (r.solidsError !== undefined || !r.confirmed)
    return `${head} · ${r.candidates} ${what} by boxes only${knownNote} — the solids were not checked: ${r.solidsError || "no exact check"}.`;
  const c = r.confirmed;
  const split = r.mode.type === "hard" && c.touching ? ` (${c.clashes.length - c.touching} overlapping, ${c.touching} touching — no overlap volume)` : "";
  return `${head} · ${r.candidates} box overlap(s)${knownNote} → ${c.clashes.length} ${what} on the solids${split}, ${c.dropped} boxes only (dropped). Click one to isolate.`;
}
