import { describe, it, expect } from "vitest";
import {
  diffSnapshots,
  snapshotFromQuantities,
  summarizeDiff,
  netDelta,
  type ElementSnapshot,
} from "./revision-diff";
import type { ElementQuantities } from "./quantities";

const snap = (
  guid: string,
  quantities: ElementSnapshot["quantities"],
  category = "IFCWALL",
): ElementSnapshot => ({ guid, category, quantities });

describe("snapshotFromQuantities", () => {
  it("maps take-off rows and prunes undefined measures", () => {
    const eq: ElementQuantities = {
      guid: "G1",
      local_id: 1,
      model_id: "arch_v1",
      category: "IFCWALL",
      type_name: "Basic Wall:200mm",
      count: 1,
      area: 12.5,
      has_qto: true,
    };
    const [s] = snapshotFromQuantities([eq]);
    expect(s.guid).toBe("G1");
    expect(s.category).toBe("IFCWALL");
    expect(s.type_name).toBe("Basic Wall:200mm");
    expect(s.quantities).toEqual({ count: 1, area: 12.5 }); // no length/volume/weight keys emitted
  });
});

describe("diffSnapshots", () => {
  it("classifies added / deleted / changed / unchanged by GlobalId", () => {
    const oldSet = [snap("A", { area: 10 }), snap("B", { area: 10 }), snap("C", { area: 5 })];
    const newSet = [snap("A", { area: 10 }), snap("C", { area: 8 }), snap("D", { area: 3 })];
    const d = diffSnapshots(oldSet, newSet);
    expect(summarizeDiff(d)).toEqual({ added: 1, deleted: 1, changed: 1, unchanged: 1 });
    expect(d.added.map((s) => s.guid)).toEqual(["D"]);
    expect(d.deleted.map((s) => s.guid)).toEqual(["B"]);
    expect(d.changed[0].guid).toBe("C");
    expect(d.changed[0].deltas).toEqual([{ measure: "area", old: 5, new: 8, delta: 3 }]);
  });

  // THE defect this slice exists to fix: a line-aggregated diff nets offsetting changes to zero and hides
  // both elements. Element-level diffing by GlobalId reports the swap honestly (+1 added / -1 deleted).
  it("does NOT let offsetting changes cancel out", () => {
    const oldSet = [snap("wallB", { area: 10 })]; // one wall deleted...
    const newSet = [snap("wallC", { area: 10 })]; // ...and an equal-area one added in its place
    const d = diffSnapshots(oldSet, newSet);
    expect(d.added.map((s) => s.guid)).toEqual(["wallC"]);
    expect(d.deleted.map((s) => s.guid)).toEqual(["wallB"]);
    expect(d.changed).toHaveLength(0);
    // Net area is flat, but the two real changes are still surfaced — not swallowed.
    expect(netDelta(d, "area")).toBe(0);
    expect(d.added.length + d.deleted.length).toBe(2);
  });

  it("absorbs float jitter within epsilon", () => {
    const d = diffSnapshots([snap("A", { volume: 3.0 })], [snap("A", { volume: 3.0 + 1e-9 })]);
    expect(d.changed).toHaveLength(0);
    expect(d.unchanged).toBe(1);
  });

  it("treats a missing measure as 0 when computing a delta", () => {
    const d = diffSnapshots([snap("A", {})], [snap("A", { area: 4 })]);
    expect(d.changed[0].deltas).toEqual([{ measure: "area", old: 0, new: 4, delta: 4 }]);
  });

  it("dedupes duplicate GlobalIds (first occurrence wins)", () => {
    const d = diffSnapshots([snap("A", { area: 1 })], [snap("A", { area: 1 }), snap("A", { area: 999 })]);
    expect(d.unchanged).toBe(1);
    expect(d.changed).toHaveLength(0);
  });

  it("ignores snapshots with an empty guid", () => {
    const d = diffSnapshots([snap("", { area: 1 })], [snap("", { area: 2 }), snap("A", { area: 3 })]);
    expect(d.added.map((s) => s.guid)).toEqual(["A"]);
    expect(d.deleted).toHaveLength(0);
    expect(d.changed).toHaveLength(0);
  });
});

describe("netDelta", () => {
  it("sums added (+), deleted (−) and per-element changed deltas", () => {
    const oldSet = [snap("A", { volume: 5 }), snap("B", { volume: 4 })];
    const newSet = [snap("A", { volume: 9 }), snap("C", { volume: 2 })]; // A +4, B −4 (deleted), C +2 (added)
    const d = diffSnapshots(oldSet, newSet);
    expect(netDelta(d, "volume")).toBe(2); // 4 + 2 − 4
  });
});
