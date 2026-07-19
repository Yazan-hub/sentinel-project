import { describe, it, expect } from "vitest";
import { carbonOfSnapshot, carbonDiff } from "./revision-carbon";
import { diffSnapshots, type ElementSnapshot } from "./revision-diff";
import type { CarbonFactors } from "./carbon";

// Concrete slabs by volume (300 kgCO₂e/m³), doors by count (40 kgCO₂e each); everything else unfactored → 0.
const factors: CarbonFactors = {
  unit_label: "kgCO₂e",
  source: "test",
  factors: [
    { match: "IFCSLAB", measure: "volume", unit: "m3", factor: 300 },
    { match: "IFCDOOR", measure: "count", unit: "no", factor: 40 },
  ],
};

const slab = (guid: string, volume: number): ElementSnapshot => ({ guid, category: "IFCSLAB", quantities: { count: 1, volume } });
const door = (guid: string): ElementSnapshot => ({ guid, category: "IFCDOOR", quantities: { count: 1 } });

describe("carbonOfSnapshot", () => {
  it("prices by the factor's measure (volume × factor)", () => {
    expect(carbonOfSnapshot(slab("A", 2), factors)).toBe(600);
  });
  it("prices count-measured elements per element", () => {
    expect(carbonOfSnapshot(door("D"), factors)).toBe(40);
  });
  it("returns 0 when no factor matches", () => {
    expect(carbonOfSnapshot({ guid: "W", category: "IFCWALL", quantities: { area: 5 } }, factors)).toBe(0);
  });
});

describe("carbonDiff", () => {
  it("surfaces gross carbon churn even when the net is ~zero (the offsetting-swap defect)", () => {
    // One 2 m³ slab deleted, an equal 2 m³ slab added: bottom line flat, 1200 kgCO₂e churned.
    const diff = diffSnapshots([slab("old", 2)], [slab("new", 2)]);
    const c = carbonDiff(diff, factors);
    expect(c.added).toBe(1);
    expect(c.deleted).toBe(1);
    expect(c.net).toBe(0);
    expect(c.gross).toBe(1200);
  });

  it("combines add / delete / resize into net and gross kgCO₂e", () => {
    const oldSet = [slab("A", 2), slab("B", 2), door("D1")]; // A 600, B 600, door 40
    const newSet = [slab("A", 3), slab("C", 2), door("D1")]; // A +1m³ (+300), B removed (−600), C added (+600)
    const c = carbonDiff(diffSnapshots(oldSet, newSet), factors);
    expect(c.added).toBe(1);
    expect(c.deleted).toBe(1);
    expect(c.changed).toBe(1);
    expect(c.net).toBe(600 - 600 + 300); // +300
    expect(c.gross).toBe(600 + 600 + 300); // 1500 churned
  });
});
