import { describe, it, expect } from "vitest";
import { buildBoQ, resolveRate, type RateTable, type ElementQuantities } from "./quantities";

const rates: RateTable = {
  currency: "SAR",
  rules: [
    { match: "IFCWALL", measure: "area", unit: "m2", rate: 100 },
    { match: "IFCWALL:Exterior 300", measure: "area", unit: "m2", rate: 150 },
    { match: "IFCDOOR", measure: "count", unit: "no", rate: 500 },
  ],
};
const e = (category: string, o: Partial<ElementQuantities> = {}): ElementQuantities => ({ guid: "g", local_id: 1, model_id: "m", category, count: 1, has_qto: true, ...o });

describe("resolveRate (most-specific wins)", () => {
  it("prefers category:type over category", () => {
    expect(resolveRate({ category: "IFCWALL", type_name: "Exterior 300" }, rates)?.rate).toBe(150);
    expect(resolveRate({ category: "IFCWALL" }, rates)?.rate).toBe(100);
  });
  it("returns undefined when no rule matches", () => {
    expect(resolveRate({ category: "IFCBEAM" }, rates)).toBeUndefined();
  });
});

describe("buildBoQ", () => {
  it("prices by measure and totals qty × rate", () => {
    const boq = buildBoQ([e("IFCWALL", { area: 10 }), e("IFCDOOR")], rates);
    expect(boq.total).toBe(10 * 100 + 500);
    expect(boq.priced_count).toBe(2);
    expect(boq.lines.find((l) => l.code === "IFCWALL")?.amount).toBe(1000);
  });
  it("aggregates same-rule elements into one line and sums qty/count", () => {
    const boq = buildBoQ([e("IFCWALL", { area: 4 }), e("IFCWALL", { area: 6 })], rates);
    const line = boq.lines.find((l) => l.code === "IFCWALL");
    expect(line?.count).toBe(2);
    expect(line?.qty).toBe(10);
    expect(line?.amount).toBe(1000);
  });
  it("counts unpriced elements (no rule) and excludes them from the total", () => {
    const boq = buildBoQ([e("IFCWALL", { area: 5 }), e("IFCBEAM", { length: 3 })], rates);
    expect(boq.unpriced_count).toBe(1);
    expect(boq.total).toBe(500);
  });
  it("counts missing_qto when the rate needs a measure the element lacks (qty 0)", () => {
    const boq = buildBoQ([e("IFCWALL", { area: undefined })], rates); // wall priced by area, no area
    expect(boq.missing_qto).toBe(1);
    expect(boq.total).toBe(0);
    expect(boq.lines.find((l) => l.code === "IFCWALL")?.qty).toBe(0);
  });
});
