// MA-6-7 — the IFC geometry reader against the hand-written two-storey fixture, other length units, the repo's own writer (the
// round trip the proposal model makes), and a file that tries to loop the reader.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readIfcGeometry, IFC, VERSION } from "./ifc-geometry.mjs";
import { proposalElements, levelsOf } from "./proposal-model.mjs";
import { buildIfc } from "./sentinel-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(resolve(here, "fixtures/ifc-geometry/concept-2storey.ifc"), "utf8");
const read = (t) => readIfcGeometry(Buffer.from(t, "utf8"));
const byName = (r, n) => r.walls.find((w) => w.name === n) ?? r.floors.find((f) => f.name === n);
const near = (a, b, tol = 0.1) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const gid = (k) => ("CN2" + k).padEnd(22, "0");
const area = (loop) => Math.abs(loop.reduce((s, q, i) => s + q[0] * loop[(i + 1) % loop.length][1] - loop[(i + 1) % loop.length][0] * q[1], 0)) / 2;

describe("readIfcGeometry — the concept fixture", () => {
  it("reads two levels by placed height", async () => {
    const r = await read(text);
    expect([r.reader, r.version, r.schema]).toEqual([IFC, VERSION, "IFC4"]);
    expect(r.levels.map((l) => [l.cid, l.name, l.elevation_mm])).toEqual([["L00", "CN L00", 0], ["L01", "CN L01", 3500]]);
    expect(r.hint).toEqual({ site: { at_mm: [0, 0, 0], rotation_deg: 0 }, map_conversion: null, storey_elevation_mismatch: [], context_wcs_not_origin: false });
  });

  it("puts every centre line where the layer usage says, on both signs, and on a wall placed (-1,0,0)", async () => {
    const r = await read(text);
    const w = (n) => byName(r, n);
    // NEGATIVE with +150 on a 300 wall: the Axis is the centre line (what Revit's Golden Nugget export writes)
    expect(w("W1 south")).toMatchObject({ start: [0, 0], end: [20000, 0], thickness_mm: 300, thickness_from: "layers", storey: "L00", body: "extrusion", height_mm: 3500, base_mm: 0, ifc_class: "IFCWALLSTANDARDCASE" });
    // POSITIVE with 0: the Axis is a face, so the centre sits half a thickness along local y = (0,-1) of a wall placed (-1,0,0)
    expect(w("W2 north")).toMatchObject({ start: [20000, 11850], end: [0, 11850], thickness_mm: 300, thickness_from: "layers" });
    expect(w("W3 east")).toMatchObject({ start: [20000, 0], end: [20000, 12000], thickness_mm: 300 });
  });

  it("takes the thickness from layers, the type's layers, BaseQuantities Width, then the body", async () => {
    const r = await read(text);
    expect(byName(r, "W4 partition")).toMatchObject({ start: [8000, 0], end: [8000, 12000], thickness_mm: 150, thickness_from: "base_quantities", ifc_class: "IFCWALL" });
    expect(byName(r, "W7 typed")).toMatchObject({ start: [10000, 2000], end: [16000, 2000], thickness_mm: 200, thickness_from: "type_layers", note: "centre not stated (no layer-set usage)" });
    expect(byName(r, "W6 rect only")).toMatchObject({ start: [1000, 6000], end: [7000, 6000], thickness_mm: 200, thickness_from: "body" });
    expect(byName(r, "W9 profile only")).toMatchObject({ start: [-125, 10000], end: [-125, 15000], thickness_mm: 250, thickness_from: "body" });
    expect(byName(r, "W8 trimmed")).toMatchObject({ start: [0, 8000], end: [6000, 8000], thickness_mm: 300 });
  });

  it("marks a clipped wall and reads IsExternal as true, false or null", async () => {
    const r = await read(text);
    expect(byName(r, "W3 east")).toMatchObject({ clipped: true, height_mm: 3500, is_external: false });
    expect(byName(r, "W1 south")).toMatchObject({ clipped: false, is_external: true });
    expect(byName(r, "W2 north").is_external).toBe(true);
    expect(byName(r, "W4 partition").is_external).toBeNull();
  });

  it("reads a floor extruded down (its top is 0), an L as an indexed poly curve, and counts a hole", async () => {
    const r = await read(text);
    expect(byName(r, "F1 down")).toMatchObject({ top_mm: 0, thickness_mm: 300, storey: "L00" });
    const l = byName(r, "F2 L");
    expect(l.loop).toHaveLength(6);
    expect(area(l.loop)).toBe(192e6);
    expect(l).toMatchObject({ top_mm: 3500, storey: "L01", voids: 0 });
    expect(byName(r, "F3 void")).toMatchObject({ voids: 1, loop: [[0, 0], [20000, 0], [20000, 12000], [0, 12000]] });
    expect(r.floors.map((f) => f.name).sort()).toEqual(["F1 down", "F2 L", "F3 void"]);
  });

  it("lists what it did not read, each with its words, and no opening", async () => {
    const r = await read(text);
    expect(r.not_read.map((n) => [n.ifc_class, n.storey, n.why]).sort()).toEqual([
      ["IFCCOLUMN", "L00", "an IfcColumn — the IFC planner reads walls and floors (MA-6); a person places it"],
      ["IFCDOOR", "L00", "an IfcDoor — the IFC planner reads walls and floors (MA-6); a person places it"],
      ["IFCSLAB", "L01", "1 hole(s) — not proposed"],
      ["IFCSLAB", "L01", "a roof slab — roofs are not proposed"],
      ["IFCWALL", "L00", "no height: no extrusion, no brep, no tessellated body, no base quantity Height"],
      ["IFCWALL", "L00", "no thickness: no material layers, no base quantity Width, no rectangular body"],
    ]);
    expect(JSON.stringify(r.not_read)).not.toMatch(/Opening/i);
  });

  it("a wall with no height at all is not read, never filed with a null", async () => {
    const r = await read(text);
    expect(byName(r, "W10 axis only")).toBeUndefined();
    expect(r.not_read.find((n) => n.global_id === gid("WX"))?.why).toBe("no height: no extrusion, no brep, no tessellated body, no base quantity Height");
    for (const w of r.walls) for (const k of ["height_mm", "base_mm", "thickness_mm"]) expect(Number.isFinite(w[k])).toBe(true);
  });
});

describe("readIfcGeometry — units", () => {
  // the same building written in another unit: every length-bearing number divided by what one unit is in millimetres
  const SCALED = /^#\d+=(IFCCARTESIANPOINT|IFCCARTESIANPOINTLIST2D|IFCRECTANGLEPROFILEDEF|IFCEXTRUDEDAREASOLID|IFCMATERIALLAYER|IFCMATERIALLAYERSETUSAGE|IFCQUANTITYLENGTH|IFCBUILDINGSTOREY|IFCVECTOR|IFCDOOR)\(/;
  const rewrite = (k, unitLine) => text.split("\n").map((l) => (SCALED.test(l) ? l.replace(/(?<![A-Z])-?\d+\.\d*(?:E-?\d+)?/g, (n) => String(Number(n) / k)) : l)).join("\n").replace("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)", unitLine);
  const same = async (t, k) => {
    const [a, b] = [await read(text), await read(t)];
    expect(b.mm_per_unit).toBe(k);
    delete a.mm_per_unit; delete b.mm_per_unit;
    expect(b).toEqual(a);
  };
  it("metre gives the same millimetres", async () => same(rewrite(1000, "IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), 1000));
  it("a foot is 304.8", async () => {
    const foot = "IFCCONVERSIONBASEDUNIT(#9001,.LENGTHUNIT.,'FOOT',#9002)";
    const t = rewrite(304.8, foot).replace("ENDSEC;\nEND-ISO", "#9000=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);\n#9001=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);\n#9002=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#9000);\nENDSEC;\nEND-ISO");
    await same(t, 304.8);
  });
});

describe("readIfcGeometry — the repo's own writer", () => {
  it("round trip: a changeset's creates → proposalElements → buildIfc → reader, within 1 mm", async () => {
    const cs = JSON.parse(readFileSync(resolve(here, "fixtures/changeset-ops/shell-body.json"), "utf8"));
    const plan = proposalElements(cs, levelsOf(cs));
    const r = await read(buildIfc(plan.elements, { timestamp: 0 }));
    expect(r.levels).toHaveLength(1);
    const walls = cs.elements.filter((e) => e.kind === "wall"), floors = cs.elements.filter((e) => e.kind === "floor");   // the roof is on a level this changeset does not tell, so the proposal model skips it
    expect(r.walls).toHaveLength(walls.length);
    for (const w of walls) {
      const c = w.place.LocationCurve;
      const hit = r.walls.find((x) => near(x.start, c.start.slice(0, 2), 1) && near(x.end, c.end.slice(0, 2), 1));
      expect(hit, JSON.stringify(c)).toBeTruthy();
      expect(hit).toMatchObject({ thickness_mm: 200, thickness_from: "base_quantities", storey: "L00" });
    }
    expect(r.floors).toHaveLength(floors.length);
    for (const f of floors) {
      const loop = (f.place.Boundary ?? f.place.LocationLoop).map((q) => q.slice(0, 2));
      expect(r.floors.some((x) => x.loop.length === loop.length && x.loop.every((q, i) => near(q, loop[i], 1))), JSON.stringify(loop)).toBe(true);
    }
    expect(r.not_read).toEqual([]);
  });
});

describe("readIfcGeometry — a hostile file", () => {
  const idOf = (t, tag) => /#(\d+)=/.exec(t.split("\n").find((l) => l.includes(tag)))[1];
  it("a placement that is its own parent stops at depth 64", async () => {
    const wall = text.split("\n").find((l) => l.includes(`'${gid("W1")}'`));
    const pl = wall.split(",").slice(-4, -3)[0].replace(/\D/g, "");   // ObjectPlacement: #pl,#repr,$,.STANDARD.)
    const t = text.replace(new RegExp(`#${pl}=IFCLOCALPLACEMENT\\(#\\d+,`), `#${pl}=IFCLOCALPLACEMENT(#${pl},`);
    expect((await read(t)).not_read.find((n) => n.global_id === gid("W1"))?.why).toBe("placement chain loops");
  });
  it("a clipping result that clips itself stops at depth 64", async () => {
    const id = idOf(text, "IFCBOOLEANCLIPPINGRESULT");
    const t = text.replace(new RegExp(`#${id}=IFCBOOLEANCLIPPINGRESULT\\(.DIFFERENCE.,#\\d+,`), `#${id}=IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#${id},`);
    expect((await read(t)).not_read.find((n) => n.global_id === gid("W3"))?.why).toBe("clipping nested too deep");
  });
  it("a repeated GlobalId sends the second element to not_read", async () => {
    const r = await read(text.replace("'CN2W300000000000000000'", "'CN2W200000000000000000'"));
    expect(r.not_read.some((n) => n.global_id === "CN2W200000000000000000" && n.why === "GlobalId repeated")).toBe(true);
  });
});
