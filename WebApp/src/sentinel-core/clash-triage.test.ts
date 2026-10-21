import { describe, it, expect } from "vitest";
import { plainCategory, disciplineOf, yieldingSide, kindOf, groupHits, groupTitle, groupInstruction, type TriageHit } from "./clash-triage";

const box = (x: number, s = 1) => ({ min: [x, 0, 0] as [number, number, number], max: [x + s, s, s] as [number, number, number] });
const MEP = "AT-SEN-ZZ-ZZ-M3-M-0001@P01", STR = "AT-SEN-ZZ-ZZ-M3-S-0001@P01", ARC = "AT-SEN-ZZ-ZZ-M3-A-0001@P01";
const hit = (id: string, a: Partial<TriageHit["a"]>, b: Partial<TriageHit["b"]>, extra: Partial<TriageHit> = {}): TriageHit =>
  ({ id, a: { modelId: MEP, ...a }, b: { modelId: STR, ...b }, volume: 0.01, ...extra });

describe("clash triage", () => {
  it("names categories in plain words, never the IFC code alone", () => {
    expect(plainCategory("IFCDUCTSEGMENT")).toBe("Duct");
    expect(plainCategory("IFCWALLSTANDARDCASE")).toBe("Wall");
    expect(plainCategory("IFCFLOWSEGMENT", "Rect Duct 400x200")).toBe("Duct");
    expect(plainCategory("IFCFLOWCONTROLLER")).toBe("Flowcontroller");
    expect(plainCategory(null)).toBe("Unknown element");
  });

  it("reads the discipline from the ISO role field, else from the element type", () => {
    expect(disciplineOf({ modelId: MEP })).toBe("Mechanical");
    expect(disciplineOf({ modelId: STR })).toBe("Structure");
    expect(disciplineOf({ modelId: "tower.ifc", category: "IFCBEAM" })).toBe("Structure");
    expect(disciplineOf({ modelId: "tower.ifc", category: "IFCPIPESEGMENT" })).toBe("Services");
    expect(disciplineOf({ modelId: "tower.ifc", category: "IFCDOOR" })).toBe("Architecture");
  });

  it("structure never yields; services yield first", () => {
    expect(yieldingSide(hit("1", { category: "IFCDUCTSEGMENT" }, { category: "IFCBEAM" }))).toBe("a");
    expect(yieldingSide(hit("2", { modelId: STR, category: "IFCBEAM" }, { modelId: ARC, category: "IFCWALL" }))).toBe("b");
  });

  it("classifies duplicates (same type, same box) and touching (no overlap volume)", () => {
    expect(kindOf(hit("d", { modelId: ARC, category: "IFCSLAB", box: box(0) }, { category: "IFCSLAB", box: box(0.004) }))).toBe("duplicate");
    expect(kindOf(hit("n", { modelId: ARC, category: "IFCSLAB", box: box(0) }, { category: "IFCSLAB", box: box(0.5) }))).toBe("clash");
    expect(kindOf(hit("t", { category: "IFCWALL" }, { category: "IFCSLAB" }, { touching: true, volume: 0 }))).toBe("touching");
    expect(kindOf(hit("c", { category: "IFCWALL" }, { category: "IFCSLAB" }, { volume: 0, distance: 0.03 }))).toBe("clash"); // clearance run
    expect(kindOf(hit("i", { category: "IFCWALL" }, { category: "IFCSLAB" }, { volume: 0, bcf_guid: "x" }))).toBe("clash"); // imported
  });

  it("groups by kind × pair × level × yielding discipline, with counts, biggest first", () => {
    const hits = [
      hit("1", { category: "IFCDUCTSEGMENT", level: "Level 03" }, { category: "IFCBEAM", level: "L3" }),
      hit("2", { category: "IFCBEAM", modelId: STR, level: "L3" }, { category: "IFCDUCTSEGMENT", modelId: MEP, level: "Level 03" }),
      hit("3", { category: "IFCDUCTSEGMENT", level: "Level 04" }, { category: "IFCBEAM" }),
      hit("4", { category: "IFCWALL", modelId: ARC }, { category: "IFCSLAB" }, { touching: true, volume: 0 }),
    ];
    const g = groupHits(hits);
    expect(g.map((x) => [groupTitle(x), x.hits.length])).toEqual([
      ["Beam × Duct · Level 03 · Mechanical", 2],
      ["Beam × Duct · Level 04 · Mechanical", 1],
      ["Touching Slab × Wall · No level · Architecture", 1],
    ]);
    expect(groupInstruction(g[0])).toMatch(/structure is not moved/);
  });

  it("a duplicate's instruction never asks to remove the structural copy", () => {
    const [g] = groupHits([hit("d", { modelId: ARC, category: "IFCCOLUMN", box: box(0) }, { category: "IFCCOLUMN", box: box(0) })]);
    expect(g.kind).toBe("duplicate");
    expect(g.discipline).toBe("Architecture");
    expect(groupInstruction(g)).toMatch(/Remove the copy in the Architecture model — never the structural copy/);
  });

  it("pair only: one group per kind × pair, levels counted, every yielding discipline named", () => {
    const hits = [
      hit("1", { category: "IFCDUCTSEGMENT", level: "Level 03" }, { category: "IFCBEAM" }),
      hit("2", { category: "IFCDUCTSEGMENT", level: "Level 04" }, { category: "IFCBEAM" }),
      hit("3", { category: "IFCBEAM", modelId: STR, level: "Level 04" }, { category: "IFCDUCTSEGMENT", modelId: STR }), // structure yields
      hit("4", { category: "IFCWALL", modelId: ARC }, { category: "IFCSLAB" }, { touching: true, volume: 0 }),
    ];
    const g = groupHits(hits, "pair");
    expect(g.map((x) => [x.key, groupTitle(x), x.hits.length])).toEqual([
      ["clash|Beam × Duct", "Beam × Duct · 2 levels · Mechanical / Structure", 3],
      ["touching|Slab × Wall", "Touching Slab × Wall · No level · Architecture", 1],
    ]);
    expect(groupInstruction(g[0])).toMatch(/structure is never moved without the structural engineer/);
    expect(groupHits(hits).length).toBe(4); // the full view is unchanged
  });
});
