import { describe, it, expect } from "vitest";
import { groupCategories, groupByModel, isBrowsable, type TreeRow } from "./project-tree";

const row = (modelId: string, localId: number, category: string, type: string, name: string): TreeRow => ({ modelId, localId, category, type, name });

describe("groupCategories", () => {
  it("buckets Category → Type → Instance with friendly labels, sorted naturally", () => {
    const t = groupCategories([row("A", 3, "IFCWALL", "W-200", "Wall 10"), row("A", 1, "IFCWALL", "W-200", "Wall 2"), row("A", 2, "IFCDOOR", "D1", "Door 1")]);
    expect(t.map((c) => [c.label, c.count])).toEqual([["Doors", 1], ["Walls", 2]]);
    expect(t[1].types[0].instances.map((i) => i.name)).toEqual(["Wall 2", "Wall 10"]);
  });
});

describe("isBrowsable", () => {
  it("keeps building elements and spatial containers, drops the project record, units, type objects and relationships", () => {
    expect(["IFCWALL", "IFCDOOR", "IFCBUILDINGELEMENTPROXY", "IFCBUILDINGSTOREY", "IFCSITE", "IFCBUILDING", "IFCSPACE"].filter(isBrowsable)).toHaveLength(7);
    expect(["IFCPROJECT", "IFCDERIVEDUNIT", "IFCSIUNIT", "IFCWALLTYPE", "IFCSLABTYPE", "IFCBUILDINGELEMENTPROXYTYPE", "IFCRELAGGREGATES", "IFCPROPERTYSET"].filter(isBrowsable)).toEqual([]);
  });
});

describe("groupByModel", () => {
  const rows = [row("ARC@v4", 1, "IFCWALL", "W-200", "Wall 1"), row("STR@v2", 1, "IFCWALL", "W-200", "Wall 1"), row("STR@v2", 2, "IFCCOLUMN", "C1", "Col 1")];
  it("gives each loaded model its own branch, in load order, and keeps the same type in two models apart", () => {
    const m = groupByModel(rows, ["STR@v2", "ARC@v4"]);
    expect(m.map((x) => [x.modelId, x.count])).toEqual([["STR@v2", 2], ["ARC@v4", 1]]);
    expect(m[0].categories.map((c) => c.label)).toEqual(["Columns", "Walls"]);
    expect(m[1].categories[0].types[0].instances).toEqual([{ modelId: "ARC@v4", localId: 1, name: "Wall 1" }]);
  });
  it("a loaded model with no building elements still shows, with 0", () => {
    expect(groupByModel([], ["EMPTY@v1"])).toEqual([{ modelId: "EMPTY@v1", categories: [], count: 0 }]);
  });
});
