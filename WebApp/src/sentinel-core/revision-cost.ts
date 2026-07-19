// sentinel-core/revision-cost — PURE TS (no OBC/DOM). Prices a GlobalId revision diff against the rate
// library. This is the 5D consumer of revision-diff.ts: it turns element-level added/deleted/changed into
// money, exposing the number a line-aggregated Δ hides — GROSS churn vs NET change. A batch of walls swapped
// for equal-cost walls nets to ~0 on the bottom line yet moved real budget; costDiff() surfaces both.

import { resolveRate, type RateTable } from "./quantities";
import type { ElementSnapshot, RevisionDiff } from "./revision-diff";

/** Cost of one element snapshot at the given rates (0 if no rule matches — mirrors buildBoQ's unpriced rule). */
export function priceSnapshot(s: ElementSnapshot, rates: RateTable): number {
  const rule = resolveRate({ category: s.category ?? "", type_name: s.type_name }, rates);
  if (!rule) return 0;
  const qty = rule.measure === "count" ? (s.quantities.count ?? 1) : (s.quantities[rule.measure] ?? 0);
  return qty * rule.rate;
}

export interface DiffCost {
  addedCost: number;   // Σ price of elements only in the new revision
  deletedCost: number; // Σ price of elements only in the old revision
  changedCost: number; // Σ (price(after) − price(before)) — signed
  net: number;         // addedCost − deletedCost + changedCost (the true bottom-line move)
  gross: number;       // addedCost + deletedCost + Σ|changed move| (budget that actually churned)
  added: number;
  deleted: number;
  changed: number;
}

/**
 * Price a revision diff at ONE rate table (current rates for both sides), so the result isolates
 * composition change from any rate edits. `net` is the bottom-line move; `gross` is how much budget
 * actually churned — when gross ≫ |net|, offsetting swaps moved money the line totals can't show.
 */
export function costDiff(diff: RevisionDiff, rates: RateTable): DiffCost {
  let addedCost = 0, deletedCost = 0, changedCost = 0, changedGross = 0;
  for (const s of diff.added) addedCost += priceSnapshot(s, rates);
  for (const s of diff.deleted) deletedCost += priceSnapshot(s, rates);
  for (const c of diff.changed) {
    const d = priceSnapshot(c.after, rates) - priceSnapshot(c.before, rates);
    changedCost += d;
    changedGross += Math.abs(d);
  }
  return {
    addedCost, deletedCost, changedCost,
    net: addedCost - deletedCost + changedCost,
    gross: addedCost + deletedCost + changedGross,
    added: diff.added.length, deleted: diff.deleted.length, changed: diff.changed.length,
  };
}
