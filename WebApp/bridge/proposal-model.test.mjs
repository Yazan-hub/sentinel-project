// MA-3d2 — the proposal model: the creates as the IFC writer's boxes, in the executor's frame (Revit mm Z-up -> three.js m Y-up).
import { describe, it, expect } from "vitest";
import { proposalElements, proposalFrag } from "./proposal-model.mjs";

const create = (kind, place, extra = {}) => ({ op: "create", kind, proposal_guid: `g-${kind}`, place, ...extra });
const near = (a, b) => expect(a).toHaveLength(b.length) && a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
const wall = (over = {}) => create("wall", { LocationCurve: { start: [60000, 70000], end: [70000, 70000] }, BaseElevation: 0, TopElevation: 3000, ...over });

describe("proposalElements", () => {
  it("a wall along +X: length, height, default 200 mm thickness, centre at its midpoint", () => {
    const r = proposalElements({ elements: [wall()] });
    const e = r.elements[0];
    expect(e.kind).toBe("wall");
    expect(e.size.x).toBeCloseTo(10, 9); expect(e.size.y).toBeCloseTo(3, 9); expect(e.size.z).toBeCloseTo(0.2, 9);
    near(e.position, [65, 1.5, -70]);
    expect(e.rotationY).toBeCloseTo(0, 9);
    expect(r).toMatchObject({ creates: 1, drawn: 1, skipped: [] });
  });
  it("a wall along +Y turns a quarter and sits at negative z", () => {
    const e = proposalElements({ elements: [create("wall", { LocationCurve: { start: [0, 0], end: [0, 4000] }, BaseElevation: 0, TopElevation: 3000 })] }).elements[0];
    expect(e.rotationY).toBeCloseTo(Math.PI / 2, 9);
    expect(e.position[2]).toBeCloseTo(-2, 9);
  });
  it("a wall with no top is 3 m high", () => {
    const e = proposalElements({ elements: [wall({ TopElevation: undefined })] }).elements[0];
    expect(e.size.y).toBeCloseTo(3, 9);
  });
  it("a floor is a slab whose top sits at its level", () => {
    const e = proposalElements({ elements: [create("floor", { Boundary: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], BaseElevation: 3000, Thickness: 300 })] }).elements[0];
    expect(e.kind).toBe("slab");
    expect(e.size.x).toBeCloseTo(6, 9); expect(e.size.y).toBeCloseTo(0.3, 9); expect(e.size.z).toBeCloseTo(4, 9);
    near(e.position, [3, 2.85, -2]);
  });
  it("a ceiling hangs at its offset", () => {
    const e = proposalElements({ elements: [create("ceiling", { Boundary: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], BaseElevation: 0, Offset: 2700 })] }).elements[0];
    expect(e.position[1]).toBeCloseTo(2.8, 9);
  });
  it("a grid and a door are skipped in words; a retype is not a create", () => {
    const r = proposalElements({ elements: [create("grid", {}), create("door", {}), { op: "retype", kind: "wall" }] });
    expect(r.creates).toBe(2); expect(r.drawn).toBe(0);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped[0]).toContain("a grid — not drawn");
  });
});

describe("proposalFrag", () => {
  it("returns the converted bytes and counts; null when nothing is drawable", async () => {
    const deps = { buildIfc: () => "ISO", ifcBytesToFrag: async () => Uint8Array.of(1, 2, 3) };
    const r = await proposalFrag({ elements: [wall()] }, () => null, deps);
    expect([...r.bytes]).toEqual([1, 2, 3]); expect(r.drawn).toBe(1);
    expect((await proposalFrag({ elements: [create("grid", {})] }, () => null, deps)).bytes).toBeNull();
  });
  it("the real pipeline once: the core bundle's IFC through web-ifc to fragments", async () => {
    const r = await proposalFrag({ elements: [wall()] }, () => null);
    expect(r.bytes.length).toBeGreaterThan(500);
  }, 60_000);
});
