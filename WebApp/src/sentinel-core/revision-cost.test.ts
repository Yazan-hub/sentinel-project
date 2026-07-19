import { describe, it, expect } from "vitest";
import { priceSnapshot, costDiff } from "./revision-cost";
import { diffSnapshots, type ElementSnapshot } from "./revision-diff";
import type { RateTable } from "./quantities";

// Two rates: walls priced by area, doors by count. Everything else is unpriced (→ 0).
const rates: RateTable = {
  currency: "SAR",
  rules: [
    { match: "IFCWALL", measure: "area", unit: "m2", rate: 100 },
    { match: "IFCDOOR", measure: "count", unit: "no", rate: 500 },
  ],
};

const wall = (guid: string, area: number): ElementSnapshot => ({ guid, category: "IFCWALL", quantities: { count: 1, area } });
const door = (guid: string): ElementSnapshot => ({ guid, category: "IFCDOOR", quantities: { count: 1 } });

describe("priceSnapshot", () => {
  it("prices by the rule's measure (area × rate)", () => {
    expect(priceSnapshot(wall("A", 10), rates)).toBe(1000);
  });
  it("prices count-measured elements per element", () => {
    expect(priceSnapshot(door("D"), rates)).toBe(500);
  });
  it("returns 0 for an element with no matching rate", () => {
    expect(priceSnapshot({ guid: "S", category: "IFCSLAB", quantities: { area: 50 } }, rates)).toBe(0);
  });
});

describe("costDiff", () => {
  it("surfaces gross churn even when the net nets to ~zero (the offsetting-swap defect)", () => {
    // One 10 m² wall deleted, an equal 10 m² wall added: bottom line flat, SAR 2000 of budget churned.
    const diff = diffSnapshots([wall("old", 10)], [wall("new", 10)]);
    const c = costDiff(diff, rates);
    expect(c.added).toBe(1);
    expect(c.deleted).toBe(1);
    expect(c.addedCost).toBe(1000);
    expect(c.deletedCost).toBe(1000);
    expect(c.net).toBe(0);      // a line-aggregated Δ shows this and stops — hiding both changes
    expect(c.gross).toBe(2000); // ...but SAR 2000 actually moved
  });

  it("signs a resized element's cost delta", () => {
    const diff = diffSnapshots([wall("A", 10)], [wall("A", 14)]); // +4 m² → +SAR 400
    const c = costDiff(diff, rates);
    expect(c.changed).toBe(1);
    expect(c.changedCost).toBe(400);
    expect(c.net).toBe(400);
    expect(c.gross).toBe(400);
  });

  it("combines add / delete / resize into net and gross", () => {
    const oldSet = [wall("A", 10), wall("B", 10), door("D1")]; // A, B, one door
    const newSet = [wall("A", 12), wall("C", 10), door("D1")]; // A +2m² (+200), B removed (−1000), C added (+1000)
    const c = costDiff(diffSnapshots(oldSet, newSet), rates);
    expect(c.added).toBe(1);
    expect(c.deleted).toBe(1);
    expect(c.changed).toBe(1);
    expect(c.net).toBe(1000 - 1000 + 200);          // +200
    expect(c.gross).toBe(1000 + 1000 + 200);         // 2200 churned
  });
});
