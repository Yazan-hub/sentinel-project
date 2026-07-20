import { describe, it, expect } from "vitest";
import { toElementGraph } from "./element-graph";
import type { ElementSnapshot } from "./revision-diff";

const snap = (guid: string, category: string, quantities: ElementSnapshot["quantities"], type_name?: string): ElementSnapshot => ({ guid, category, type_name, quantities });

describe("toElementGraph (ECS-over-JSON, IFC5-aligned)", () => {
  it("maps snapshots to entities keyed on GlobalId with typed components", () => {
    const g = toElementGraph([
      snap("W1", "IFCWALL", { count: 1, area: 12.5 }, "Basic Wall:200mm"),
      snap("B1", "IFCBEAM", { count: 1, length: 6 }),
    ], "proj@P02");
    expect(g.schema).toBe("sentinel.element-graph/1");
    expect(g.layer).toBe("proj@P02");
    expect(g.count).toBe(2);
    expect(g.elements[0]).toEqual({ id: "W1", components: { identity: { class: "IFCWALL", type: "Basic Wall:200mm" }, quantities: { count: 1, area: 12.5 } } });
    expect(g.elements[1].components.identity).toEqual({ class: "IFCBEAM" }); // no type → omitted
  });

  it("omits an empty quantities component and drops guid-less snapshots", () => {
    const g = toElementGraph([snap("A", "IFCSLAB", {}), snap("", "IFCWALL", { area: 1 })]);
    expect(g.count).toBe(1);
    expect(g.elements[0]).toEqual({ id: "A", components: { identity: { class: "IFCSLAB" } } }); // no quantities key
  });

  it("handles an empty set", () => {
    expect(toElementGraph([])).toEqual({ schema: "sentinel.element-graph/1", layer: "base", count: 0, elements: [] });
  });
});
