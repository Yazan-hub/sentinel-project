// sentinel-core/massing-plan — turn a reviewed Massing Estimate into a concrete BUILD PLAN: the wall
// centrelines, floor loops and opening positions that GhostBuilder places. PURE (no DOM/OBC/node), so the
// plan is generated identically in the browser and, ported, in the add-in — and every coordinate is
// offline-testable before any Revit call.
//
// The estimate is WHAT the building is (footprint, storeys, height); the plan is WHERE every element
// goes, in millimetres. It carries no types — GhostBuilder's guideline chooses those from the layer +
// the wall thickness this plan sets — so a massing built this way still goes through the same governed,
// audited placement as a DWG build. Nothing here is Revit-specific; it's rectangles and elevations.

import type { MassingEstimate } from "./massing";

/** One wall to place: a centreline in plan (mm), its thickness, height, base elevation, and DWG layer so
 *  the guideline resolves the same type it would for a drawn wall. */
export interface PlanWall {
  x1: number; y1: number; x2: number; y2: number;
  thicknessMm: number;
  heightMm: number;
  baseElevationMm: number;
  layer: string;                 // "A-WALL-EXT" — perimeter massing is external by default
}

export interface PlanFloor {
  loop: Array<[number, number]>; // closed rectangle in plan (mm)
  baseElevationMm: number;
  layer: string;                 // "A-FLOR"
}

/** An opening to cut/host in a wall: which wall (by index in walls[]), how far along it, and its size. */
export interface PlanOpening {
  kind: string;                  // "door" | "window"
  wallIndex: number;
  offsetMm: number;              // distance from the wall's start point to the opening centre
  widthMm: number;
  heightMm: number;
  sillMm: number;                // 0 for a door; a window's sill height above the storey floor
  layer: string;                 // "A-DOOR" | "A-WIND"
}

export interface MassingPlan {
  walls: PlanWall[];
  floors: PlanFloor[];
  openings: PlanOpening[];
  /** Carried through so the built model records it came from a photo estimate, not a measured drawing. */
  provenance: "photo";
}

export interface PlanOptions {
  /** Wall thickness for massing when the estimate has none (a photo can't measure it). The guideline
   *  turns this into a real type; 200 mm is the BDS external default. */
  defaultWallThicknessMm?: number;
  /** Origin: the footprint is centred here. Default (0,0). */
  originX?: number;
  originY?: number;
}

/**
 * Generate the build plan. A rectangular footprint centred at the origin, one ring of four perimeter
 * walls per storey, a floor slab per storey, and the estimate's openings distributed along the front
 * (south, y = −D/2) façade of the ground storey.
 *
 * Massing is LOD 100–200 on purpose: a photo supports a box and storeys, not an internal wall layout, so
 * the plan is the envelope. Internal walls come from a DWG plan when there is one — that's the whole point
 * of keeping this on the same governed pipeline instead of a parallel one.
 */
export function planMassing(m: MassingEstimate, opts: PlanOptions = {}): MassingPlan {
  const t = opts.defaultWallThicknessMm ?? 200;
  const ox = opts.originX ?? 0;
  const oy = opts.originY ?? 0;

  const W = m.footprintWidthMm.value;
  const D = m.footprintDepthMm.value;
  const storeys = Math.max(1, Math.round(m.storeys.value));
  const h = m.storeyHeightMm.value;

  // Rectangle corners, centred at the origin. SW, SE, NE, NW (counter-clockwise from the front-left).
  const x0 = ox - W / 2, x1 = ox + W / 2;
  const y0 = oy - D / 2, y1 = oy + D / 2;

  const walls: PlanWall[] = [];
  const floors: PlanFloor[] = [];

  for (let s = 0; s < storeys; s++) {
    const base = s * h;
    // Four perimeter walls, each running along an edge. The front (south) wall is walls[4*s + 0].
    const edges: Array<[number, number, number, number]> = [
      [x0, y0, x1, y0], // south (front)
      [x1, y0, x1, y1], // east
      [x1, y1, x0, y1], // north
      [x0, y1, x0, y0], // west
    ];
    for (const [a, b, c, d] of edges) {
      walls.push({ x1: a, y1: b, x2: c, y2: d, thicknessMm: t, heightMm: h, baseElevationMm: base, layer: "A-WALL-EXT" });
    }
    floors.push({
      loop: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
      baseElevationMm: base,
      layer: "A-FLOR",
    });
  }

  // Openings on the ground-storey front wall (index 0), spread evenly along its length. A photo only
  // ever shows a façade or two, so this is where the seen openings honestly belong; other façades are
  // left blank rather than mirrored (the estimate already flagged unseen ones as assumptions).
  const openings: PlanOpening[] = [];
  const frontOpenings = m.openings.filter((o) => o.facade === "front" || m.facadesSeen.includes(o.facade));
  frontOpenings.forEach((o, i) => {
    const frac = (i + 1) / (frontOpenings.length + 1); // even spacing, no opening at the corners
    openings.push({
      kind: o.kind,
      wallIndex: 0,                       // ground-storey front wall
      offsetMm: frac * W,
      widthMm: o.widthMm.value,
      heightMm: o.heightMm.value,
      sillMm: o.kind === "window" ? 900 : 0,
      layer: o.kind === "window" ? "A-WIND" : "A-DOOR",
    });
  });

  return { walls, floors, openings, provenance: "photo" };
}

/** A one-line human summary of what a plan will build — shown in the reviewer above the numbers. */
export function describePlan(p: MassingPlan): string {
  const storeys = p.floors.length;
  const perimeter = p.walls.length / Math.max(1, storeys);
  return `${storeys} storey(s) · ${p.walls.length} perimeter walls (${perimeter}/storey) · ` +
         `${p.floors.length} floor slab(s) · ${p.openings.length} opening(s) on the front façade`;
}
