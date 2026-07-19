// sentinel-core/carbon — the 6D core. PURE TS (no OBC/DOM). The same model quantities that drive 5D
// cost drive embodied carbon: multiply by kgCO₂e factors → a whole-project estimate + hotspots +
// intensity. The host adapter is shared with 5D (adapter/fragments-quantities.ts → ElementQuantities).
//
// Honesty: default factors are INDICATIVE (ICE-database ballpark) — clearly flagged for replacement with
// project EPD data. Gaps (missing Qto_, no factor) are surfaced, never hidden.

import factorsJson from "./carbon-factors.json";
import { describe, type ElementQuantities, type Measure } from "./quantities";

export interface CarbonFactor {
  match: string; // category or category:type
  measure: Measure;
  unit: string;
  factor: number; // kgCO₂e per unit of measure
}
export interface CarbonFactors {
  unit_label: string;
  source: string;
  factors: CarbonFactor[];
}

export interface CarbonLine {
  code: string;
  description: string;
  unit: string;
  qty: number;
  factor: number;
  kg: number; // kgCO₂e
  count: number;
  model_map: Record<string, number[]>;
}
export interface CarbonReport {
  unit_label: string;
  source: string;
  lines: CarbonLine[];
  total_kg: number;
  priced_count: number;
  no_factor: number; // elements with a quantity but no factor
  missing_qto: number; // elements whose factor needs a dimension the model didn't export
  gfa: number; // gross floor area (Σ slab area, m²) for the intensity metric
}

export const defaultFactors = factorsJson as CarbonFactors;

/** Takes only category + type_name so a revision snapshot can resolve a factor the same way (see revision-carbon.ts). */
export function resolveFactor(e: { category: string; type_name?: string }, f: CarbonFactors): CarbonFactor | undefined {
  const cat = (e.category || "").toUpperCase();
  if (e.type_name) {
    const key = `${cat}:${e.type_name}`.toUpperCase();
    const hit = f.factors.find((x) => x.match.toUpperCase() === key);
    if (hit) return hit;
  }
  return f.factors.find((x) => x.match.toUpperCase() === cat);
}

export function buildCarbon(quantities: ElementQuantities[], f: CarbonFactors): CarbonReport {
  const lines = new Map<string, CarbonLine>();
  let noFactor = 0, missing = 0, priced = 0, gfa = 0;

  for (const e of quantities) {
    if (/SLAB/i.test(e.category) && e.area != null) gfa += e.area; // GFA ≈ Σ slab area

    const rule = resolveFactor(e, f);
    if (!rule) { noFactor++; continue; }
    let qty: number;
    if (rule.measure === "count") {
      qty = e.count;
    } else {
      const dim = e[rule.measure];
      if (dim == null) { missing++; qty = 0; } else qty = dim;
    }
    priced++;

    let line = lines.get(rule.match);
    if (!line) {
      line = { code: rule.match, description: describe(rule.match), unit: rule.unit, qty: 0, factor: rule.factor, kg: 0, count: 0, model_map: {} };
      lines.set(rule.match, line);
    }
    line.qty += qty;
    line.count += 1;
    line.factor = rule.factor;
    (line.model_map[e.model_id] ??= []).push(e.local_id);
  }

  let total = 0;
  for (const line of lines.values()) { line.kg = line.qty * line.factor; total += line.kg; }
  const sorted = [...lines.values()].sort((a, b) => b.kg - a.kg);
  return {
    unit_label: f.unit_label, source: f.source, lines: sorted,
    total_kg: total, priced_count: priced, no_factor: noFactor, missing_qto: missing, gfa,
  };
}
