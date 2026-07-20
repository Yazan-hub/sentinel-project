import { describe, it, expect } from "vitest";
import { buildCarbon, resolveFactor, type CarbonFactors } from "./carbon";
import type { ElementQuantities } from "./quantities";

const factors: CarbonFactors = {
  unit_label: "kgCO₂e",
  source: "test",
  factors: [
    { match: "IFCWALL", measure: "area", unit: "m2", factor: 50 },
    { match: "IFCSLAB", measure: "volume", unit: "m3", factor: 300 },
    { match: "IFCDOOR", measure: "count", unit: "no", factor: 40 },
  ],
};
const e = (category: string, o: Partial<ElementQuantities> = {}): ElementQuantities => ({ guid: "g", local_id: 1, model_id: "m", category, count: 1, has_qto: true, ...o });

describe("resolveFactor", () => {
  it("matches by category", () => {
    expect(resolveFactor({ category: "IFCSLAB" }, factors)?.factor).toBe(300);
    expect(resolveFactor({ category: "IFCROOF" }, factors)).toBeUndefined();
  });
});

describe("buildCarbon", () => {
  it("multiplies quantity by factor and totals kgCO₂e", () => {
    const r = buildCarbon([e("IFCWALL", { area: 10 }), e("IFCSLAB", { area: 40, volume: 2 }), e("IFCDOOR")], factors);
    expect(r.total_kg).toBe(10 * 50 + 2 * 300 + 1 * 40); // 1140
    expect(r.priced_count).toBe(3);
  });
  it("derives GFA from Σ slab area (for the intensity metric)", () => {
    const r = buildCarbon([e("IFCSLAB", { area: 40, volume: 2 }), e("IFCSLAB", { area: 60, volume: 3 })], factors);
    expect(r.gfa).toBe(100);
  });
  it("counts elements with no factor (excluded from the total)", () => {
    const r = buildCarbon([e("IFCWALL", { area: 5 }), e("IFCROOF", { area: 9 })], factors);
    expect(r.no_factor).toBe(1);
    expect(r.total_kg).toBe(250);
  });
  it("counts missing_qto when the factor needs a measure the element lacks", () => {
    const r = buildCarbon([e("IFCWALL", { area: undefined })], factors);
    expect(r.missing_qto).toBe(1);
    expect(r.total_kg).toBe(0);
  });
});
