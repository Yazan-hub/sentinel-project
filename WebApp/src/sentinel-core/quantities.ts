// sentinel-core/quantities — the 5D core. PURE TS (no OBC/DOM/THREE): quantity types,
// the rate library, and BoQ aggregation. The host seam that READS quantities from a
// Fragments model lives in ./adapter/fragments-quantities.ts (the only file that imports OBC),
// exactly like scanner.ts ↔ adapter/fragments-facts.ts.
//
// Thesis (Phase 1, 5D quick-win): quantities come from the model, so the cost plan can't drift
// from design. Gaps are surfaced, never hidden — silent under-counting reads as false precision.

import ratesJson from "./rates.json";

export type Measure = "count" | "length" | "area" | "volume" | "weight";

/** Per-element quantities, SI units (m, m², m³, kg). Built by the adapter from IFC Qto_ sets. */
export interface ElementQuantities {
  guid: string;
  local_id: number;
  model_id: string;
  category: string; // "IFCWALL"
  type_name?: string;
  count: number; // always ≥ 1
  length?: number;
  area?: number;
  volume?: number;
  weight?: number;
  /** true if ANY dimensional quantity (length/area/volume/weight) was read from a Qto_ set. */
  has_qto: boolean;
}

/** One rate-library rule. `match` is a category ("IFCWALL") or category:type ("IFCWALL:Exterior 300mm"). */
export interface RateRule {
  match: string;
  measure: Measure;
  unit: string;
  rate: number;
}
export interface RateTable {
  currency: string;
  rules: RateRule[];
}

export interface BoQLine {
  code: string; // the matched rule key
  description: string; // human-friendly
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  count: number; // element count in this line
  /** model_id → local_ids, so the panel can isolate the line's elements in the viewer. */
  model_map: Record<string, number[]>;
}
export interface BoQ {
  currency: string;
  lines: BoQLine[];
  total: number;
  priced_count: number;
  /** elements with a quantity but no matching rate (value not in the total). */
  unpriced_count: number;
  /** elements whose rate needs a dimension the model didn't export (Qto_ missing). */
  missing_qto: number;
}

/** The bundled default rate library (editable in the panel). */
export const defaultRates = ratesJson as RateTable;

/** Most-specific match wins: category:type first, then category. Takes only the fields it needs so a
 *  revision snapshot (category + type_name, no local_id/measures) can be priced the same way (see revision-cost.ts). */
export function resolveRate(e: { category: string; type_name?: string }, rates: RateTable): RateRule | undefined {
  const cat = (e.category || "").toUpperCase();
  if (e.type_name) {
    const key = `${cat}:${e.type_name}`.toUpperCase();
    const hit = rates.rules.find((r) => r.match.toUpperCase() === key);
    if (hit) return hit;
  }
  return rates.rules.find((r) => r.match.toUpperCase() === cat);
}

/** Group priced elements into BoQ lines; amount = qty × rate. Gaps counted, not hidden. */
export function buildBoQ(quantities: ElementQuantities[], rates: RateTable): BoQ {
  const lines = new Map<string, BoQLine>();
  let unpriced = 0;
  let missing = 0;
  let priced = 0;

  for (const e of quantities) {
    const rule = resolveRate(e, rates);
    if (!rule) {
      unpriced++;
      continue;
    }
    let qty: number;
    if (rule.measure === "count") {
      qty = e.count;
    } else {
      const dim = e[rule.measure];
      if (dim == null) {
        missing++;
        qty = 0;
      } else {
        qty = dim;
      }
    }
    priced++;

    let line = lines.get(rule.match);
    if (!line) {
      line = {
        code: rule.match,
        description: describe(rule.match),
        unit: rule.unit,
        qty: 0,
        rate: rule.rate,
        amount: 0,
        count: 0,
        model_map: {},
      };
      lines.set(rule.match, line);
    }
    line.qty += qty;
    line.count += 1;
    line.rate = rule.rate; // honour edited rate
    (line.model_map[e.model_id] ??= []).push(e.local_id);
  }

  let total = 0;
  for (const line of lines.values()) {
    line.amount = line.qty * line.rate;
    total += line.amount;
  }
  const sorted = [...lines.values()].sort((a, b) => b.amount - a.amount);
  return {
    currency: rates.currency,
    lines: sorted,
    total,
    priced_count: priced,
    unpriced_count: unpriced,
    missing_qto: missing,
  };
}

/** "IFCWALL" → "Walls"; "IFCWALL:Ext 300" → "Walls — Ext 300". Friendly BoQ descriptions. */
export function describe(match: string): string {
  const [cat, type] = match.split(":");
  const key = cat.toUpperCase().replace(/^IFC/, "");
  const base = FRIENDLY[key] ?? titleCase(key);
  return type ? `${base} — ${type}` : base;
}

const FRIENDLY: Record<string, string> = {
  WALL: "Walls",
  WALLSTANDARDCASE: "Walls",
  SLAB: "Slabs",
  BEAM: "Beams",
  COLUMN: "Columns",
  DOOR: "Doors",
  WINDOW: "Windows",
  ROOF: "Roofs",
  STAIR: "Stairs",
  COVERING: "Finishes / coverings",
  RAILING: "Railings",
  PLATE: "Plates",
  MEMBER: "Members",
};

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
