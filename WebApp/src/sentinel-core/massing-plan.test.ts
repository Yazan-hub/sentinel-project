import { describe, it, expect } from "vitest";
import { planMassing } from "./massing-plan";
import { validateMassing, type EstimatedValue } from "./massing";

const v = (value: number): EstimatedValue => ({ value, confidence: 0.8, source: "photo" });

// A confident 12 x 8 m, 3-storey estimate with two front windows and a front door.
const estimate = validateMassing({
  footprintWidthMm: v(12000), footprintDepthMm: v(8000),
  storeys: v(3), storeyHeightMm: v(3200),
  facadesSeen: ["front"],
  openings: [
    { kind: "door", widthMm: v(1000), heightMm: v(2100), facade: "front" },
    { kind: "window", widthMm: v(1500), heightMm: v(1400), facade: "front" },
  ],
});

describe("massing-plan — a box of the right size", () => {
  const plan = planMassing(estimate);

  it("four perimeter walls per storey, three storeys", () => {
    expect(plan.walls.length).toBe(12);
    expect(plan.floors.length).toBe(3);
  });

  it("the footprint is centred and the right size", () => {
    const front = plan.walls[0]; // ground-storey south wall
    expect(front.x1).toBe(-6000);
    expect(front.x2).toBe(6000);
    expect(Math.abs(front.x2 - front.x1)).toBe(12000);      // width
    expect(plan.walls[1].y2 - plan.walls[1].y1).toBe(8000); // east wall = depth
  });

  it("storeys stack by the storey height", () => {
    expect(plan.walls[0].baseElevationMm).toBe(0);
    expect(plan.walls[4].baseElevationMm).toBe(3200);   // 2nd storey
    expect(plan.walls[8].baseElevationMm).toBe(6400);   // 3rd storey
    expect(plan.walls.every((w) => w.heightMm === 3200)).toBe(true);
  });

  it("perimeter walls are external, floors are floor-layer", () => {
    expect(plan.walls.every((w) => w.layer === "A-WALL-EXT")).toBe(true);
    expect(plan.floors.every((f) => f.layer === "A-FLOR")).toBe(true);
  });

  it("floor loops are closed rectangles", () => {
    const loop = plan.floors[0].loop;
    expect(loop.length).toBe(5);
    expect(loop[0]).toEqual(loop[loop.length - 1]); // closed
  });

  it("carries a default wall thickness the guideline will type", () => {
    expect(plan.walls.every((w) => w.thicknessMm === 200)).toBe(true);
    expect(planMassing(estimate, { defaultWallThicknessMm: 300 }).walls[0].thicknessMm).toBe(300);
  });
});

describe("massing-plan — openings on the seen façade only", () => {
  const plan = planMassing(estimate);

  it("puts the front openings on the ground front wall, evenly spread", () => {
    expect(plan.openings.length).toBe(2);
    expect(plan.openings.every((o) => o.wallIndex === 0)).toBe(true);
    // two openings → at 1/3 and 2/3 of the 12000 width
    expect(plan.openings[0].offsetMm).toBeCloseTo(4000);
    expect(plan.openings[1].offsetMm).toBeCloseTo(8000);
  });

  it("a window gets a sill, a door does not", () => {
    const door = plan.openings.find((o) => o.kind === "door")!;
    const win = plan.openings.find((o) => o.kind === "window")!;
    expect(door.sillMm).toBe(0);
    expect(win.sillMm).toBeGreaterThan(0);
    expect(win.layer).toBe("A-WIND");
    expect(door.layer).toBe("A-DOOR");
  });

  it("does not mirror openings onto façades the photo never showed", () => {
    const backWindow = validateMassing({
      footprintWidthMm: v(12000), footprintDepthMm: v(8000), storeys: v(1), storeyHeightMm: v(3000),
      facadesSeen: ["front"],
      openings: [{ kind: "window", widthMm: v(1500), heightMm: v(1400), facade: "back" }],
    });
    // the back opening was flagged assumed by validateMassing; the plan leaves it off the front wall
    expect(planMassing(backWindow).openings.length).toBe(0);
  });
});

describe("massing-plan — degenerate estimates don't explode", () => {
  it("a 1-storey all-assumed estimate still yields a valid box", () => {
    const plan = planMassing(validateMassing({}));
    expect(plan.floors.length).toBe(1);
    expect(plan.walls.length).toBe(4);
    expect(plan.walls.every((w) => Number.isFinite(w.x1) && Number.isFinite(w.heightMm))).toBe(true);
  });
});
