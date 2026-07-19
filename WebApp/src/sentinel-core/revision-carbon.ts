// sentinel-core/revision-carbon — PURE TS (no OBC/DOM). Prices a GlobalId revision diff in embodied
// carbon. The 6D twin of revision-cost.ts: same engine, carbon factors instead of rates. Surfaces the
// number a line-aggregated Δ hides — GROSS kgCO₂e churn vs NET change. Swapping a concrete element for an
// equal-carbon one nets ~0 on the bottom line yet moved real embodied carbon; carbonDiff() shows both.

import { resolveFactor, type CarbonFactors } from "./carbon";
import type { ElementSnapshot, RevisionDiff } from "./revision-diff";

/** Embodied carbon (kgCO₂e) of one snapshot at the given factors (0 if no factor matches — mirrors buildCarbon). */
export function carbonOfSnapshot(s: ElementSnapshot, f: CarbonFactors): number {
  const rule = resolveFactor({ category: s.category ?? "", type_name: s.type_name }, f);
  if (!rule) return 0;
  const qty = rule.measure === "count" ? (s.quantities.count ?? 1) : (s.quantities[rule.measure] ?? 0);
  return qty * rule.factor;
}

export interface DiffCarbon {
  addedKg: number;   // Σ kgCO₂e of elements only in the new revision
  deletedKg: number; // Σ kgCO₂e of elements only in the old revision
  changedKg: number; // Σ (after − before) — signed
  net: number;       // addedKg − deletedKg + changedKg (true bottom-line move)
  gross: number;     // addedKg + deletedKg + Σ|changed move| (carbon that actually churned)
  added: number;
  deleted: number;
  changed: number;
}

/** Price a revision diff in kgCO₂e at ONE factor set (both sides), isolating composition change from factor edits. */
export function carbonDiff(diff: RevisionDiff, f: CarbonFactors): DiffCarbon {
  let addedKg = 0, deletedKg = 0, changedKg = 0, changedGross = 0;
  for (const s of diff.added) addedKg += carbonOfSnapshot(s, f);
  for (const s of diff.deleted) deletedKg += carbonOfSnapshot(s, f);
  for (const c of diff.changed) {
    const d = carbonOfSnapshot(c.after, f) - carbonOfSnapshot(c.before, f);
    changedKg += d;
    changedGross += Math.abs(d);
  }
  return {
    addedKg, deletedKg, changedKg,
    net: addedKg - deletedKg + changedKg,
    gross: addedKg + deletedKg + changedGross,
    added: diff.added.length, deleted: diff.deleted.length, changed: diff.changed.length,
  };
}
