import { describe, it, expect } from "vitest";
import { buildBoQ, resolveRate, deriveQuantitiesFromBox, type RateTable, type ElementQuantities } from "./quantities";

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
  it("prices geometry-estimated elements and tallies/flags them", () => {
    const boq = buildBoQ(
      [e("IFCWALL", { area: 10, estimated: true }), e("IFCWALL", { area: 5 })],
      rates,
    );
    expect(boq.total).toBe(15 * 100); // both priced, estimate included in the total
    expect(boq.estimated_count).toBe(1); // only the geometry-derived one
    expect(boq.lines.find((l) => l.code === "IFCWALL")?.estimated).toBe(true); // line carries the flag
  });
  it("does not flag a count-priced element even if it is estimated", () => {
    const boq = buildBoQ([e("IFCDOOR", { estimated: true })], rates); // doors priced by count
    expect(boq.estimated_count).toBe(0);
    expect(boq.lines.find((l) => l.code === "IFCDOOR")?.estimated).toBeUndefined();
  });
});

describe("deriveQuantitiesFromBox (Qto_ fallback)", () => {
  const box = (dx: number, dy: number, dz: number) => ({ min: { x: 0, y: 0, z: 0 }, max: { x: dx, y: dy, z: dz } });
  it("slab footprint: area = two largest extents, volume = all three", () => {
    const d = deriveQuantitiesFromBox(box(8, 5, 0.2)); // 8×5 slab, 200mm thick
    expect(d.area).toBeCloseTo(40); // footprint 8×5 (thickness excluded)
    expect(d.volume).toBeCloseTo(8); // 8×5×0.2
    expect(d.length).toBe(8);
  });
  it("wall face: area = length × height (thickness excluded)", () => {
    const d = deriveQuantitiesFromBox(box(6, 0.3, 3)); // 6 long, 300mm thick, 3 high
    expect(d.area).toBeCloseTo(18); // 6×3
    expect(d.volume).toBeCloseTo(5.4); // 6×3×0.3
  });
  it("clamps negative/degenerate extents to zero", () => {
    const d = deriveQuantitiesFromBox({ min: { x: 5, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } });
    expect(d.volume).toBe(0);
    expect(d.area).toBe(0);
  });
});
