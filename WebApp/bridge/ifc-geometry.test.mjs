// MA-6-7 — the IFC geometry reader against the hand-written two-storey fixture, other length units, the repo's own writer (the
// round trip the proposal model makes), and a file that tries to loop the reader.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readIfcGeometry, runIfc, IFC, VERSION } from "./ifc-geometry.mjs";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
    expect(r.hint).toEqual({ site: { at_mm: [0, 0, 0], rotation_deg: 0 }, map_conversion: null, storey_elevation_mismatch: [], context_wcs_not_origin: false, length_unit_assumed: false });
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
    expect(byName(r, "W7 typed")).toMatchObject({ start: [10000, 2000], end: [16000, 2000], thickness_mm: 200, thickness_from: "type_layers" });   // MA-6-8 review: its body centres the line, so the note is not needed
    expect(byName(r, "W7 typed").note).toBeUndefined();
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

// MA-6-7 review fixes — each variant edits one line of the fixture, the way the hostile-file tests do.
const edit = (...pairs) => pairs.reduce((t, [a, b]) => { if (!t.includes(a)) throw new Error(`fixture has no ${a}`); return t.replace(a, () => b); }, text);
const addLines = (t, lines) => t.replace("ENDSEC;\nEND-ISO", () => `${lines.join("\n")}\nENDSEC;\nEND-ISO`);
const why = (r, id) => r.not_read.filter((n) => n.global_id === id).map((n) => n.why);
const FOOT = "IFCCONVERSIONBASEDUNIT(#9001,.LENGTHUNIT.,'FOOT',#9002)";
const footWith = (k) => addLines(edit(["IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)", FOOT]), ["#9000=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", "#9001=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);", `#9002=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(${k}),#9000);`]);

describe("readIfcGeometry — a length unit it cannot trust", () => {
  it("a conversion factor of 0 or below, or an SI prefix it does not know, refuses the whole file", async () => {
    await expect(read(footWith("0."))).rejects.toThrow(/length unit/);
    await expect(read(footWith("-0.3048"))).rejects.toThrow(/length unit/);
    await expect(read(edit(["IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)", "IFCSIUNIT(*,.LENGTHUNIT.,.NANO.,.METRE.)"]))).rejects.toThrow(/length unit/);
  });
  it("no unit in the project: a unit elsewhere in the file is used; none at all reads metres and says so", async () => {
    const scan = await read(edit(["IFCUNITASSIGNMENT((#10))", "IFCUNITASSIGNMENT(())"]));
    expect([scan.mm_per_unit, scan.hint.length_unit_assumed]).toEqual([1, false]);
    const none = await read(edit(["IFCUNITASSIGNMENT((#10))", "IFCUNITASSIGNMENT(())"], ["IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)", "IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"]));
    expect([none.mm_per_unit, none.hint.length_unit_assumed]).toEqual([1000, true]);
  });
});

describe("readIfcGeometry — geometry that Revit could not build", () => {
  it("a sideways extrusion files no 0 mm slab or wall", async () => {
    const r = await read(edit(["#236=IFCEXTRUDEDAREASOLID(#233,#235,#5,300.)", "#236=IFCEXTRUDEDAREASOLID(#233,#235,#2,300.)"], ["#39=IFCEXTRUDEDAREASOLID(#36,#38,#1,3500.)", "#39=IFCEXTRUDEDAREASOLID(#36,#38,#2,3500.)"]));
    expect(byName(r, "F1 down")).toBeUndefined();
    expect(why(r, gid("F1"))).toEqual(["a floor whose body is extruded off vertical"]);
    expect(byName(r, "W1 south")).toBeUndefined();
    expect(why(r, gid("W1"))).toEqual(["no height: no extrusion, no brep, no tessellated body, no base quantity Height"]);
  });
  it("a wall axis with no length, repeated outline points and an outline with no area", async () => {
    const r = await read(edit(["#42=IFCPOLYLINE((#40,#41))", "#42=IFCPOLYLINE((#40,#40))"], ["#232=IFCPOLYLINE((#228,#229,#230,#231,#228))", "#232=IFCPOLYLINE((#228,#229,#229,#230,#231,#228))"], ["#205=IFCPOLYLINE((#201,#202,#203,#204,#201))", "#205=IFCPOLYLINE((#201,#202,#201,#202,#201))"]));
    expect(why(r, gid("W1"))).toEqual(["a wall whose axis has no length"]);
    expect(byName(r, "F1 down").loop).toEqual([[0, 0], [20000, 0], [20000, 12000], [0, 12000]]);
    expect(why(r, gid("W9"))).toEqual(["an outline with no area"]);
  });
  it("a floor with two sketch loops is not read as one", async () => {
    const r = await read(addLines(edit(["#237=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#236))", "#237=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#236,#329))"]), ["#329=IFCEXTRUDEDAREASOLID(#233,#235,#5,300.);"]));
    expect(byName(r, "F1 down")).toBeUndefined();
    expect(why(r, gid("F1"))).toEqual(["a body of 2 solids — one outline only"]);
  });
  it("openings that cut a floor, and one no door fills in a wall, are said", async () => {
    const t = addLines(text, ["#327=IFCOPENINGELEMENT('CN2O200000000000000000',$,'O2',$,$,#227,$,$,.OPENING.);", "#328=IFCRELVOIDSELEMENT('CN2V300000000000000000',$,$,$,#239,#327);", "#329=IFCOPENINGELEMENT('CN2O300000000000000000',$,'O3',$,$,#101,$,$,.OPENING.);", "#330=IFCRELVOIDSELEMENT('CN2V400000000000000000',$,$,$,#117,#329);"]);
    const r = await read(t);
    expect(byName(r, "F1 down").voids).toBe(1);
    expect(why(r, gid("F1"))).toEqual(["1 opening(s) — not proposed"]);
    expect(byName(r, "W4 partition")).toBeTruthy();
    expect(why(r, gid("W4"))).toEqual(["1 unfilled opening(s) — not proposed"]);
    expect(why(r, gid("W1"))).toEqual([]);   // its opening has a door in it
  });
  it("a GlobalId that is not an IFC GlobalId leaves as the entity number; a name leaves as one short line", async () => {
    const r = await read(edit(["'CN2W100000000000000000'", `'${"x".repeat(5000)}'`], ["'W2 north'", `'A\\X\\0A${"n".repeat(300)}'`], ["'CN2S100000000000000000'", "'bad id'"]));
    expect(r.walls.some((w) => w.global_id === "#46")).toBe(true);
    expect(r.levels[1].global_id).toBe("#24");
    const w2 = r.walls.find((w) => w.global_id === gid("W2"));
    expect(w2.name.length).toBeLessThanOrEqual(256);
    expect(w2.name).not.toMatch(/\p{Cc}/u);
    expect(r.walls.every((w) => w.global_id.length <= 22)).toBe(true);
  });
});

describe("readIfcGeometry — the smaller rules", () => {
  it("an IfcLineIndex of three indices is straight; an IfcArcIndex is a curve", async () => {
    const seg = (a) => edit(["#241=IFCINDEXEDPOLYCURVE(#240,$,.F.)", `#241=IFCINDEXEDPOLYCURVE(#240,(${a}),.F.)`]);
    const r = await read(seg("IFCLINEINDEX((1,2,3)),IFCLINEINDEX((3,4)),IFCLINEINDEX((4,5,6))"));
    expect(area(byName(r, "F2 L").loop)).toBe(192e6);
    expect(why(await read(seg("IFCLINEINDEX((1,2,3)),IFCARCINDEX((3,4,5)),IFCLINEINDEX((5,6))")), gid("F2"))).toEqual(["a curved outline — straight edges only"]);
  });
  it("a round hole is counted and does not cost the floor", async () => {
    const r = await read(edit(["#261=IFCPOLYLINE((#257,#258,#259,#260,#257))", "#261=IFCCIRCLE(#35,500.)"]));
    expect(byName(r, "F3 void")).toMatchObject({ voids: 1 });
    expect(why(r, gid("F3"))).toEqual(["1 hole(s) — not proposed"]);
  });
  it("a tilted body keeps a wall that has an Axis and quantities; a tilted placement refuses", async () => {
    const r = await read(edit(["#100=IFCAXIS2PLACEMENT3D(#99,#1,#2)", "#100=IFCAXIS2PLACEMENT3D(#99,#2,#1)"]));
    expect(why(r, gid("W4"))).toEqual(["placed tilted"]);
    const r2 = await read(edit(["#109=IFCAXIS2PLACEMENT3D(#108,$,$)", "#109=IFCAXIS2PLACEMENT3D(#108,#2,#1)"]));
    expect(byName(r2, "W4 partition")).toMatchObject({ height_mm: 3500, thickness_mm: 150, body: "quantities", note: "body not read — a body placed tilted" });
  });
  it("a body-only wall runs along the edge pair its quantity thickness fits", async () => {
    const t = addLines(edit(["#148=IFCRECTANGLEPROFILEDEF(.AREA.,$,#147,6000.,200.)", "#148=IFCRECTANGLEPROFILEDEF(.AREA.,$,#147,250.,300.)"]), ["#335=IFCQUANTITYLENGTH('Width',$,$,300.,$);", "#336=IFCELEMENTQUANTITY('CN2Q600000000000000000',$,'Qto_WallBaseQuantities',$,$,(#335));", "#337=IFCRELDEFINESBYPROPERTIES('CN2Q6R0000000000000000',$,$,$,(#154),#336);"]);
    expect(byName(await read(t), "W6 rect only")).toMatchObject({ start: [3875, 6000], end: [4125, 6000], thickness_mm: 300, thickness_from: "base_quantities" });
  });
  it("a tessellated body gives the z range; a curved axis is a curved wall", async () => {
    const t = addLines(edit(["#115=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#110))", "#115=IFCSHAPEREPRESENTATION(#9,'Body','Tessellation',(#333))"]), ["#333=IFCTRIANGULATEDFACESET(#334,$,.T.,((1,2,3)),$);", "#334=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(0.,0.,3500.)));"]);
    expect(byName(await read(t), "W4 partition")).toMatchObject({ body: "tessellated", height_mm: 3500, base_mm: 0 });
    expect(why(await read(edit(["#42=IFCPOLYLINE((#40,#41))", "#42=IFCCIRCLE(#35,5000.)"])), gid("W1"))).toEqual(["a curved wall — straight walls only"]);
  });
  it("hints: a storey whose Elevation differs from its placement, and a map conversion", async () => {
    const r = await read(addLines(edit(["$,$,.ELEMENT.,3500.);", "$,$,.ELEMENT.,3000.);"]), ["#331=IFCPROJECTEDCRS('EPSG:25832',$,$,$,$,$,#10);", "#332=IFCMAPCONVERSION(#9,#331,500000.,5000000.,10.,1.,0.,1.);"]));
    expect(r.hint.storey_elevation_mismatch).toEqual([{ cid: "L01", name: "CN L01", elevation_attr_mm: 3000, placed_mm: 3500 }]);
    expect(r.hint.map_conversion).toEqual({ eastings: 500000, northings: 5000000, height: 10, x_axis_abscissa: 1, x_axis_ordinate: 0, scale: 1 });
  });
});

// MA-6-8 — two real Revit 2024 exports of the same two-storey concept (scrubbed to example.test): IFC2x3 CV2.0 and IFC4 Reference View.
describe("readIfcGeometry — Revit 2024 exports", () => {
  const rev = (n) => readFileSync(resolve(here, `fixtures/ifc-geometry/${n}.ifc`));
  const LINES = [[[0, 0], [20000, 0]], [[20000, 0], [20000, 12000]], [[20000, 12000], [0, 12000]], [[0, 12000], [0, 0]]];
  const sameLine = (w, a, b) => (near(w.start, a, 1) && near(w.end, b, 1)) || (near(w.start, b, 1) && near(w.end, a, 1));
  const lines9 = (r) => {
    expect(r.walls).toHaveLength(9);
    for (const [a, b] of LINES) expect(r.walls.filter((w) => sameLine(w, a, b)).map((w) => w.storey).sort()).toEqual(["L02", "L04"]);
    expect(r.walls.filter((w) => sameLine(w, [8000, 0], [8000, 12000]))).toHaveLength(1);
    expect(r.walls.filter((w) => w.thickness_mm === 300)).toHaveLength(8);
    expect(r.walls.filter((w) => w.thickness_mm === 150)).toHaveLength(1);
  };
  it("CV2: 9 walls, thickness from layers, 2 floors of 4 corners, the column, door, roof and roof slab said", async () => {
    const r = await readIfcGeometry(rev("revit2024-concept-cv2"));
    lines9(r);
    expect(new Set(r.walls.map((w) => w.thickness_from))).toEqual(new Set(["layers"]));
    expect(r.floors.map((f) => [f.loop.length, area(f.loop) / 1e6])).toEqual([[4, 240], [4, 240]]);
    const said = r.not_read.map((n) => n.ifc_class).sort();
    for (const c of ["IFCCOLUMN", "IFCDOOR", "IFCROOF", "IFCSLAB"]) expect(said).toContain(c);
  });
  it("IFC4 RV (F-B3-1): the Axis is an IfcIndexedPolyCurve with no Segments — a line, not a curve; thickness from the body", async () => {
    const r = await readIfcGeometry(rev("revit2024-concept-ifc4rv"));
    lines9(r);
    expect(new Set(r.walls.map((w) => w.thickness_from))).toEqual(new Set(["body"]));
    expect(r.not_read.some((n) => /curved/.test(n.why))).toBe(false);
    expect(r.floors).toHaveLength(2);
  });
  it("IFC4 RV without its Axis: the long edges of the profile give the line", async () => {
    const t = rev("revit2024-concept-ifc4rv").toString("latin1").replace("#277=IFCPRODUCTDEFINITIONSHAPE($,$,(#269,#276));", "#277=IFCPRODUCTDEFINITIONSHAPE($,$,(#276));");
    const w = (await readIfcGeometry(Buffer.from(t, "latin1"))).walls.find((x) => x.global_id === "2VExwC6xrF6u4NaChOdioM");
    expect(w.thickness_from).toBe("body");
    expect(sameLine(w, [0, 12000], [0, 0])).toBe(true);
  });
});

describe("readIfcGeometry — MA-6-8 review", () => {
  it("a body-only wall with mitred ends: the line runs between the middles of the two faces' ends, not the outer extent", async () => {
    const r = await read(edit(["#203=IFCCARTESIANPOINT((5000.,250.))", "#203=IFCCARTESIANPOINT((4750.,250.))"], ["#204=IFCCARTESIANPOINT((0.,250.))", "#204=IFCCARTESIANPOINT((250.,250.))"]));
    expect(byName(r, "W9 profile only")).toMatchObject({ start: [-125, 10125], end: [-125, 14875], thickness_mm: 250, thickness_from: "body" });
  });
  it("an Axis that is an IfcIndexedPolyCurve with an arc is a curved wall, said as one", async () => {
    const r = await read(addLines(edit(["#42=IFCPOLYLINE((#40,#41))", "#42=IFCINDEXEDPOLYCURVE(#340,(IFCARCINDEX((1,2,3))),.F.)"]), ["#340=IFCCARTESIANPOINTLIST2D(((0.,0.),(10000.,5000.),(20000.,0.)));"]));
    expect(why(r, gid("W1"))).toEqual(["a curved wall — straight walls only"]);
  });
  it("runIfc: a file that grew since admission is refused by size before it is read; a good one reads", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "ifc-")), big = resolve(dir, "big.ifc"), ok = resolve(dir, "ok.ifc");
    try {
      writeFileSync(big, Buffer.alloc(20 * 1048576 + 1)); writeFileSync(ok, text);
      const sha = createHash("sha256").update(text).digest("hex");
      const r = await runIfc({ job_id: "job-0001", items: [{ id: "ev-0001", path: big, sha256: sha }, { id: "ev-0002", path: ok, sha256: sha }] });
      expect(r.status).toBe("done");
      expect(r.refused).toEqual([{ id: "ev-0001", reason: expect.stringMatching(/^a \.ifc is read inside the bridge — at most 20 MB \(this one is 20481 KB\)/) }]);
      expect(r.result.candidates.some((c) => c.kind === "wall")).toBe(true);
      expect((await runIfc({ job_id: "job-0001", items: [{ id: "ev-0001", path: big, sha256: sha }] })).status).toBe("refused");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
