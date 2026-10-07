// MA-3d2 — the proposal model: the creates as the IFC writer's boxes, in the executor's frame (Revit mm Z-up -> three.js m Y-up).
import { describe, it, expect } from "vitest";
import { proposalElements, proposalFrag, levelsOf, storeyModel } from "./proposal-model.mjs";

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
  it("a create with no op is a create; a wall whose ends are not arrays is skipped in words", () => {
    const r = proposalElements({ elements: [{ kind: "wall", proposal_guid: "w0", place: { LocationCurve: { start: [0, 0], end: [5000, 0] } } }, create("wall", { LocationCurve: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } })] });
    expect(r.creates).toBe(2); expect(r.drawn).toBe(1);
    expect(r.skipped[0]).toContain(": a wall with no line");
  });
});

describe("proposalFrag", () => {
  it("returns the converted bytes and counts; null when nothing is drawable", async () => {
    const deps = { buildIfc: () => "ISO", ifcBytesToFrag: async () => Uint8Array.of(1, 2, 3) };
    const r = await proposalFrag({ elements: [wall()] }, () => null, deps);
    expect([...r.bytes]).toEqual([1, 2, 3]); expect(r.drawn).toBe(1);
    expect((await proposalFrag({ elements: [create("grid", {})] }, () => null, deps)).bytes).toBeNull();
  });
  it("the real pipeline once: the core bundle's IFC through web-ifc to fragments — a wall, an L-shaped floor and a door", async () => {
    const L = [[0, 0, 0], [8000, 0, 0], [8000, 3000, 0], [3000, 3000, 0], [3000, 6000, 0], [0, 6000, 0]];
    const cs = { elements: [wall(), create("floor", { LocationLoop: L, LevelName: "L1" }), create("door", { Location: [65000, 70000, 0], LevelName: "L1", TypeName: "0915 x 2134" })] };
    const r = await proposalFrag(cs, levelsOf(cs));
    expect(r).toMatchObject({ creates: 3, drawn: 3, skipped: [] });
    expect(r.bytes.length).toBeGreaterThan(500);
  }, 60_000);
});

// MA-3d2 Next: levels from the changeset, slab outlines, doors and windows on their host.
describe("storeyModel (MA-3d3)", () => {
  it("a storey's parts become one changeset: the creates in filing order, the name without its part, the ids kept", () => {
    const a = { id: "a", name: "Level 2 (1/2)", elements: [create("level", { BaseElevation: 3000 }, { validate: { identity: { Name: "L2" } } })] };
    const b = { id: "b", name: "Level 2 (2/2)", elements: [create("wall", { LocationCurve: { start: [0, 0], end: [4000, 0] }, LevelName: "L2" })] };
    const s = storeyModel([a, b]);
    expect(s).toMatchObject({ id: "storey", name: "Level 2", parts: ["a", "b"] });
    expect(s.elements).toHaveLength(2);
    // a level filed in part 1 places part 2's wall
    expect(proposalElements(s, levelsOf(s)).elements[0].position[1]).toBeCloseTo(4.5, 9);
    expect(storeyModel([]).name).toBe(""); expect(storeyModel([{ id: "x", name: "Roof" }]).elements).toEqual([]);
  });
});

describe("levelsOf", () => {
  it("a level create names its elevation; a floor's loop, a wall's line and a door's point tell their level's z; an unknown level is null", () => {
    const lv = levelsOf({ elements: [
      create("level", { BaseElevation: 3200 }, { validate: { identity: { Name: "L2" } } }),
      create("floor", { LocationLoop: [[0, 0, 0], [1, 0, 0], [1, 1, 0]], LevelName: "L1" }),
      create("wall", { LocationCurve: { start: [0, 0, 6400], end: [1, 0, 6400] }, BaseLevel: "L3" }),
      create("door", { Location: [0, 0, 9600], LevelName: "L4" }),
      { op: "retype", kind: "wall", place: { LocationCurve: { start: [0, 0, 1] }, LevelName: "L9" } },
    ] });
    expect(lv({ LevelName: "L2" })).toBe(3200); expect(lv({ LevelName: "L1" })).toBe(0); expect(lv({ BaseLevel: "L3" })).toBe(6400);
    expect(lv({ LevelName: "L4" })).toBe(9600); expect(lv({ LevelName: "L9" })).toBeNull(); expect(lv({})).toBeNull();
  });
  it("a wall naming only its level stands at that level's elevation", () => {
    const cs = { elements: [create("level", { BaseElevation: 3000 }, { validate: { identity: { Name: "L2" } } }), create("wall", { LocationCurve: { start: [0, 0], end: [4000, 0] }, LevelName: "L2" })] };
    const e = proposalElements(cs, levelsOf(cs)).elements[0];
    expect(e.position[1]).toBeCloseTo(4.5, 9); // 3000 + 3000/2
  });
});

describe("proposalElements — Next", () => {
  it("a floor's outline is its own polygon about the box centre, its base the loop's z", () => {
    const L = [[0, 0, 3000], [8000, 0, 3000], [8000, 3000, 3000], [3000, 3000, 3000], [3000, 6000, 3000], [0, 6000, 3000], [0, 0, 3000]];
    const e = proposalElements({ elements: [create("floor", { LocationLoop: L })] }).elements[0];
    expect(e.footprint).toHaveLength(6); // the closing point dropped
    near(e.footprint[2], [4, 0]); near(e.footprint[4], [-1, 3]);
    expect(e.position[1]).toBeCloseTo(2.9, 9); // 3000 − 200/2
  });
  it("a door turns to the wall under it and takes its thickness; its size is read from the type name", () => {
    const cs = { elements: [create("wall", { LocationCurve: { start: [0, 0, 0], end: [0, 5000, 0] }, Thickness: 300 }), create("door", { Location: [0, 2000, 0], TypeName: "Single-Flush : 1000 x 2100" })] };
    const d = proposalElements(cs).elements[1];
    expect(d.kind).toBe("door");
    expect(d.rotationY).toBeCloseTo(Math.PI / 2, 9); expect(d.size.z).toBeCloseTo(0.3, 9);
    expect(d.size.x).toBeCloseTo(1, 9); expect(d.size.y).toBeCloseTo(2.1, 9);
    near(d.position, [0, 1.05, -2]);
  });
  it("a door off every wall is sketched unturned at 915 x 2134 x 200; a window sits on its sill", () => {
    const r = proposalElements({ elements: [create("door", { Location: [9000, 9000, 0] }), create("window", { Location: [1000, 0, 3000], SillHeight: 800 })] });
    const [d, w] = r.elements;
    expect(d.rotationY).toBe(0); expect(d.size.x).toBeCloseTo(0.915, 9); expect(d.size.y).toBeCloseTo(2.134, 9); expect(d.size.z).toBeCloseTo(0.2, 9);
    expect(w.kind).toBe("window"); expect(w.position[1]).toBeCloseTo(3 + 0.8 + 0.5, 9);
    expect(r.drawn).toBe(2);
  });
  it("a door with no point is skipped in words", () => {
    expect(proposalElements({ elements: [create("door", {})] }).skipped[0]).toContain("a door with no point");
  });
});
