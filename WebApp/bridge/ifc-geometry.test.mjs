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
    expect(r.hint).toEqual({ site: { at_mm: [0, 0, 0], rotation_deg: 0 }, map_conversion: null, storey_elevation_mismatch: [], context_wcs_not_origin: false, true_north: [0, 1], length_unit_assumed: false });
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

  it("lists what it did not read, each with its words; the column, the door, its opening and the floor's hole are read (0.2.0), not said", async () => {
    const r = await read(text);
    expect(r.not_read.map((n) => [n.ifc_class, n.storey, n.why]).sort()).toEqual([
      ["IFCSLAB", "L01", "a roof slab — roofs are not proposed"],
      ["IFCWALL", "L00", "no height: no extrusion, no brep, no tessellated body, no base quantity Height"],
      ["IFCWALL", "L00", "no thickness: no material layers, no base quantity Width, no rectangular body"],
    ]);
    expect(r.columns).toMatchObject([{ global_id: gid("C1"), storey: "L00", at: [2000, 2000], shape: "rect", width_mm: 400, depth_mm: 400, rotation_deg: 0, base_mm: 0, top_mm: 3500, load_bearing: null }]);
    expect(r.doors).toMatchObject([{ global_id: gid("D1"), host: gid("W1"), opening: gid("O1"), storey: "L00", along_mm: 5000, width_mm: 900, height_mm: 2100, sill_mm: 0 }]);
    expect(r.openings.map((o) => [o.host_kind, o.host, o.storey, o.loop?.length])).toEqual([["floor", gid("F3"), "L01", 4]]);   // the door's opening is the door's
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
  const SCALED = /^#\d+=(IFCCARTESIANPOINT|IFCCARTESIANPOINTLIST2D|IFCRECTANGLEPROFILEDEF|IFCCIRCLEPROFILEDEF|IFCEXTRUDEDAREASOLID|IFCMATERIALLAYER|IFCMATERIALLAYERSETUSAGE|IFCQUANTITYLENGTH|IFCBUILDINGSTOREY|IFCVECTOR|IFCDOOR|IFCWINDOW)\(/;
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
  it("an opening with no body, in a floor or in a wall no door fills, is said under its own GlobalId, on its host's storey (0.2.0: no more 'unfilled opening(s)' on the wall)", async () => {
    const t = addLines(text, ["#327=IFCOPENINGELEMENT('CN2O200000000000000000',$,'O2',$,$,#227,$,$,.OPENING.);", "#328=IFCRELVOIDSELEMENT('CN2V300000000000000000',$,$,$,#239,#327);", "#329=IFCOPENINGELEMENT('CN2O300000000000000000',$,'O3',$,$,#101,$,$,.OPENING.);", "#330=IFCRELVOIDSELEMENT('CN2V400000000000000000',$,$,$,#117,#329);"]);
    const r = await read(t);
    expect(byName(r, "F1 down").voids).toBe(1);
    expect(why(r, gid("F1"))).toEqual([]);
    expect(why(r, "CN2O200000000000000000")).toEqual(["an opening with no body"]);
    expect(byName(r, "W4 partition")).toBeTruthy();
    expect(why(r, gid("W4"))).toEqual([]);
    expect(why(r, "CN2O300000000000000000")).toEqual(["an opening with no body"]);
    expect(r.not_read.find((n) => n.global_id === "CN2O300000000000000000")).toMatchObject({ ifc_class: "IFCOPENINGELEMENT", storey: "L00" });
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
  it("a round hole is counted, said as a curved hole and does not cost the floor; a straight one is read", async () => {
    const r = await read(edit(["#261=IFCPOLYLINE((#257,#258,#259,#260,#257))", "#261=IFCCIRCLE(#35,500.)"]));
    expect(byName(r, "F3 void")).toMatchObject({ voids: 1 });
    expect(why(r, gid("F3"))).toEqual([]);
    expect(why(r, `${gid("F3")}:hole0`)).toEqual(["a curved hole — the floor is proposed whole; a person cuts it"]);
    expect(r.openings).toEqual([]);
    expect((await read(text)).openings).toMatchObject([{ global_id: `${gid("F3")}:hole0`, host_kind: "floor", host: gid("F3"), storey: "L01" }]);
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
  it("CV2: 9 walls, thickness from layers, 2 floors of 4 corners; the column and door are read (0.2.0), the roof, roof slab and the wall's own cut said", async () => {
    const r = await readIfcGeometry(rev("revit2024-concept-cv2"));
    lines9(r);
    expect(new Set(r.walls.map((w) => w.thickness_from))).toEqual(new Set(["layers"]));
    expect(r.floors.map((f) => [f.loop.length, area(f.loop) / 1e6])).toEqual([[4, 240], [4, 240]]);
    const said = r.not_read.map((n) => n.ifc_class).sort();
    for (const c of ["IFCROOF", "IFCSLAB", "IFCOPENINGELEMENT"]) expect(said).toContain(c);
    for (const c of ["IFCCOLUMN", "IFCDOOR"]) expect(said).not.toContain(c);
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
      writeFileSync(big, Buffer.alloc(64 * 1048576 + 1)); writeFileSync(ok, text);
      const sha = createHash("sha256").update(text).digest("hex");
      const r = await runIfc({ job_id: "job-0001", items: [{ id: "ev-0001", path: big, sha256: sha }, { id: "ev-0002", path: ok, sha256: sha }] });
      expect(r.status).toBe("done");
      expect(r.refused).toEqual([{ id: "ev-0001", reason: expect.stringMatching(/^a \.ifc is read inside the bridge — at most 64 MB \(this one is 65537 KB\)/) }]);
      expect(r.result.candidates.some((c) => c.kind === "wall")).toBe(true);
      expect((await runIfc({ job_id: "job-0001", items: [{ id: "ev-0001", path: big, sha256: sha }] })).status).toBe("refused");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// MA-8-4 — reader 0.2.0: the wall and floor openings, the doors and windows in them, columns, curtain walls, stairs, Revit's mapped bodies.
// Hand-written variants edit the concept fixture the way the tests above do; the Revit 2024 exports are the real thing (scrubbed to example.test).
describe("readIfcGeometry — MA-8-4 (0.2.0)", () => {
  const rv = (n) => readFileSync(resolve(here, `fixtures/ifc-geometry/${n}.ifc`), "latin1");
  const rl = (t) => readIfcGeometry(Buffer.from(t, "latin1"));
  const RP = "2VExwC6xrF6u4NaChOdioP", DOOR = "2VExwC6xrF6u4NaChOdio3", CUT = "04_QWkRVa6o1qnT$iUwFeq", DOOR_OPENING = "3z8MfKj$LEhuvcaN_XIaCP";
  const dropLine = (t, n) => t.split("\n").filter((l) => !l.startsWith(`#${n}=`)).join("\n");
  const addRv = (t, lines) => t.replace(/ENDSEC;\s*END-ISO/, () => `${lines.join("\n")}\nENDSEC;\nEND-ISO`);   // Revit's export has a blank line before END-ISO
  const sameSet = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 1);

  it("the version is 0.2.0", () => expect(VERSION).toBe("0.2.0"));

  for (const n of ["revit2024-concept-cv2", "revit2024-concept-ifc4rv"]) {
    it(`${n}: the door is paired with its opening (1000 x 2000, sill 0, in the wall it stands in), the column reads through its mapped body, the wall's own cut is said`, async () => {
      const r = await rl(rv(n));
      expect(r.doors).toEqual([{ global_id: DOOR, name: expect.stringContaining("BDS_EXT_1 PNL"), ifc_class: "IFCDOOR", type_name: "BDS_EXT_1 PNL:BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", host: RP, opening: DOOR_OPENING, storey: "L02", along_mm: 4000, width_mm: 1000, height_mm: 2000, sill_mm: 0 }]);
      expect(r.windows).toEqual([]);
      // 475 x 475 (the type's name says 457 x 475: Revit's sample family); IFC4 RV writes the section as an arbitrary closed profile over an indexed poly curve
      expect(r.columns).toEqual([{ global_id: "2VExwC6xrF6u4NaChOdio0", name: expect.stringContaining("M_Rectangular Column"), type_name: "M_Rectangular Column:457 x 475mm", storey: "L02", at: [14000, 6000], shape: "rect", width_mm: 475, depth_mm: 475,
        rotation_deg: expect.any(Number), base_mm: 0, top_mm: 3500, load_bearing: null }]);
      expect(r.openings).toEqual([]);   // the door's opening is the door's
      expect(r.not_read.find((x) => x.global_id === CUT)).toMatchObject({ ifc_class: "IFCOPENINGELEMENT", storey: "L02", why: "a cut in the wall's own geometry (a join or an edited profile) — a person decides" });   // amendment 3: on its host's storey
      expect(r.not_read.some((x) => x.global_id === DOOR_OPENING)).toBe(false);
    });
  }

  it("Revit's opening that no element made (a Tag no element has) is an opening of its wall", async () => {
    const t = addRv(rv("revit2024-concept-cv2"), ["#900=IFCOPENINGELEMENT('REVOP00000000000000001',#18,'x',$,'Opening',#847,#844,'9999999');", "#901=IFCRELVOIDSELEMENT('REVOP0000000000000000R',#18,$,$,#84,#900);"]);
    const r = await rl(t);
    expect(r.openings).toEqual([{ global_id: "REVOP00000000000000001", host: RP, host_kind: "wall", storey: "L02", along_mm: 4000, width_mm: 1000, height_mm: 2000, sill_mm: 0 }]);
    expect(r.doors).toHaveLength(1);
  });

  it("amendment 1: a window whose opening carries its Tag and has no IfcRelFillsElement is paired by that Tag in a Revit file — and not in any other", async () => {
    const win = dropLine(rv("revit2024-concept-cv2"), 850).replace("#523=IFCDOOR(", "#523=IFCWINDOW(");
    const r = await rl(win);
    expect(r.windows).toMatchObject([{ global_id: DOOR, host: RP, opening: DOOR_OPENING, width_mm: 1000, height_mm: 2000, sill_mm: 0 }]);
    expect(r.doors).toEqual([]);
    expect(r.openings).toEqual([]);
    const other = await rl(win.replace("'Autodesk Revit 2024 (ENU)','Revit'", "'Some CAD 1.0','CAD'"));
    expect(other.windows).toEqual([]);
    expect(why(other, DOOR)).toEqual(["no opening relation — a window in a curtain wall, or not cut"]);
    expect(other.openings.find((o) => o.global_id === DOOR_OPENING)).toMatchObject({ host: RP, width_mm: 1000 });   // the Tag means nothing here: a plain opening
  });

  it("an opening whose Tag is a curtain wall's is the cut the curtain wall embeds in; one filled by something that is no door or window says what", async () => {
    const t = addRv(rv("revit2024-concept-cv2"), ["#910=IFCCURTAINWALL('REVCW00000000000000001',#18,'cw',$,$,$,$,'9999999');", "#900=IFCOPENINGELEMENT('REVOP00000000000000001',#18,'x',$,'Opening',#847,#844,'9999999');", "#901=IFCRELVOIDSELEMENT('REVOP0000000000000000R',#18,$,$,#84,#900);"]);
    expect(why(await rl(t), "REVOP00000000000000001")).toEqual(["the cut a curtain wall embeds in — not an opening"]);
    const filled = await read(edit(["#324=IFCRELFILLSELEMENT('CN2V200000000000000000',$,$,$,#322,#310);", "#324=IFCRELFILLSELEMENT('CN2V200000000000000000',$,$,$,#322,#298);"]));
    expect(why(filled, gid("O1"))).toEqual(["an opening filled by IfcColumn"]);
    expect(why(filled, gid("D1"))).toEqual(["no opening relation — a window in a curtain wall, or not cut"]);
  });

  it("a window in the opening of a wall (concept fixture); an opening at the wrong wall is not that wall's", async () => {
    const w = await read(edit(["#310=IFCDOOR(", "#310=IFCWINDOW("], [".DOOR.,.NOTDEFINED.,$);", ".WINDOW.,.NOTDEFINED.,$);"]));
    expect(w.windows).toMatchObject([{ global_id: gid("D1"), ifc_class: "IFCWINDOW", host: gid("W1"), storey: "L00", along_mm: 5000, width_mm: 900, height_mm: 2100 }]);
    expect(w.doors).toEqual([]);
    // O1 moved 5 m across: its middle is nowhere near W1's 300 mm
    const far = await read(edit(["#311=IFCCARTESIANPOINT((5000.,0.,0.));", "#311=IFCCARTESIANPOINT((5000.,5000.,0.));"]));
    expect(why(far, gid("D1"))).toEqual(["an opening that is not in its wall — a person cuts it"]);
  });

  const O4 = (ys) => ["#450=IFCCARTESIANPOINT((4500.,0.));", "#451=IFCCARTESIANPOINT((5500.,0.));", ...ys, "#454=IFCCARTESIANPOINT((4500.,2100.));",
    "#456=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#455);", "#457=IFCDIRECTION((0.,-1.,0.));", "#458=IFCCARTESIANPOINT((0.,150.,0.));", "#459=IFCAXIS2PLACEMENT3D(#458,#457,#2);",
    "#460=IFCEXTRUDEDAREASOLID(#456,#459,#1,300.);", "#461=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#460));", "#462=IFCPRODUCTDEFINITIONSHAPE($,$,(#461));",
    "#463=IFCOPENINGELEMENT('CN2O400000000000000000',$,'O4',$,$,#33,#462,$,.OPENING.);", "#464=IFCRELVOIDSELEMENT('CN2V500000000000000000',$,$,$,#46,#463);"];
  it("a Revit-style sideways extrusion of a rectangle is an opening; one with a corner chamfered off, or of more than 10 000 points, is said", async () => {
    const rect = await read(addLines(text, [...O4(["#452=IFCCARTESIANPOINT((5500.,2100.));", "#453=IFCCARTESIANPOINT((5000.,2100.));", "#455=IFCPOLYLINE((#450,#451,#452,#453,#454,#450));"])]));
    expect(rect.openings.filter((o) => o.host_kind === "wall")).toEqual([{ global_id: "CN2O400000000000000000", host: gid("W1"), host_kind: "wall", storey: "L00", along_mm: 5000, width_mm: 1000, height_mm: 2100, sill_mm: 0 }]);
    const cut = await read(addLines(text, [...O4(["#452=IFCCARTESIANPOINT((5500.,1600.));", "#453=IFCCARTESIANPOINT((5000.,2100.));", "#455=IFCPOLYLINE((#450,#451,#452,#453,#454,#450));"])]));
    expect(cut.openings.filter((o) => o.host_kind === "wall")).toEqual([]);
    expect(why(cut, "CN2O400000000000000000")).toEqual(["an opening that is not a rectangle in its wall — a person cuts it"]);
    const pts = Array.from({ length: 10001 }, (_, i) => `(${i % 100}.,${Math.floor(i / 100)}.,0.)`).join(",");
    const big = await read(addLines(text, [`#470=IFCCARTESIANPOINTLIST3D((${pts}));`, "#471=IFCTRIANGULATEDFACESET(#470,$,.T.,((1,2,3)),$);", "#472=IFCSHAPEREPRESENTATION(#9,'Body','Tessellation',(#471));", "#473=IFCPRODUCTDEFINITIONSHAPE($,$,(#472));",
      "#474=IFCOPENINGELEMENT('CN2O500000000000000000',$,'O5',$,$,#33,#473,$,.OPENING.);", "#475=IFCRELVOIDSELEMENT('CN2V600000000000000000',$,$,$,#46,#474);"]));
    expect(why(big, "CN2O500000000000000000")).toEqual(["a body of more than 10000 points"]);
    expect(byName(big, "W1 south")).toBeTruthy();
  });

  it("columns: a circle, a 475 x 610 rectangle (width is the profile's X), a quarter turn, a B-rep box; a section it does not read is said", async () => {
    const round = await read(edit(["#292=IFCRECTANGLEPROFILEDEF(.AREA.,$,#291,400.,400.)", "#292=IFCCIRCLEPROFILEDEF(.AREA.,$,#291,250.)"]));
    expect(round.columns).toMatchObject([{ shape: "circle", diameter_mm: 500, at: [2000, 2000], rotation_deg: 0, base_mm: 0, top_mm: 3500 }]);
    expect(round.columns[0].width_mm).toBeUndefined();
    const rect = await read(edit(["#292=IFCRECTANGLEPROFILEDEF(.AREA.,$,#291,400.,400.)", "#292=IFCRECTANGLEPROFILEDEF(.AREA.,$,#291,475.,610.)"]));
    expect(rect.columns).toMatchObject([{ shape: "rect", width_mm: 475, depth_mm: 610, rotation_deg: 0 }]);
    const turned = await read(edit(["#292=IFCRECTANGLEPROFILEDEF(.AREA.,$,#291,400.,400.)", "#292=IFCRECTANGLEPROFILEDEF(.AREA.,$,#291,475.,610.)"], ["#288=IFCAXIS2PLACEMENT3D(#287,#1,#2);", "#288=IFCAXIS2PLACEMENT3D(#287,#1,#4);"]));
    expect(turned.columns).toMatchObject([{ width_mm: 475, depth_mm: 610, rotation_deg: 90 }]);
    const brep = (name, zs) => {
      const c = [[-200, -150], [200, -150], [200, 150], [-200, 150]];
      const P = [...c.map(([x, y]) => [x, y, 0]), ...c.map(([x, y]) => [x, y, zs])];
      const lines = P.map((p, i) => `#${500 + i}=IFCCARTESIANPOINT((${p[0]}.,${p[1]}.,${p[2]}.));`);
      const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
      faces.forEach((f, i) => lines.push(`#${510 + i}=IFCPOLYLOOP((${f.map((k) => `#${500 + k}`).join(",")}));`, `#${520 + i}=IFCFACEOUTERBOUND(#${510 + i},.T.);`, `#${530 + i}=IFCFACE((#${520 + i}));`));
      lines.push("#540=IFCCLOSEDSHELL((#530,#531,#532,#533,#534,#535));", "#541=IFCFACETEDBREP(#540);", "#542=IFCSHAPEREPRESENTATION(#9,'Body','Brep',(#541));", "#543=IFCPRODUCTDEFINITIONSHAPE($,$,(#542));",
        `#544=IFCCOLUMN('${name}',$,'CB',$,$,#289,#543,$,.COLUMN.);`, "#545=IFCRELCONTAINEDINSPATIALSTRUCTURE('CN2CBR0000000000000000',$,$,$,(#544),#20);");
      return lines;
    };
    const b = await read(addLines(text, brep("CN2CB00000000000000000", 3000)));
    expect(b.columns.find((c) => c.global_id === "CN2CB00000000000000000")).toMatchObject({ shape: "rect", at: [2000, 2000], width_mm: 400, depth_mm: 300, rotation_deg: 0, base_mm: 0, top_mm: 3000 });
    // a point at a third height (a capital) is not a prism
    const capital = brep("CN2CB00000000000000000", 3000).map((l) => l.replace("#507=IFCCARTESIANPOINT((-200.,150.,3000.));", "#507=IFCCARTESIANPOINT((-200.,150.,2500.));"));
    expect(why(await read(addLines(text, capital)), "CN2CB00000000000000000")).toEqual(["a column whose section is not a rectangle or a circle — a person places it"]);
    // an L profile
    const L = await read(edit(["#292=IFCRECTANGLEPROFILEDEF(.AREA.,$,#291,400.,400.)", "#292=IFCISHAPEPROFILEDEF(.AREA.,$,#291,400.,400.,10.,10.)"]));
    expect(why(L, gid("C1"))).toEqual(["a column whose section is not a rectangle or a circle — a person places it"]);
  });

  describe("an IfcMappedItem body", () => {
    const col = (origin = "#7", scale = "1.", nested = false) => [
      ...(origin === "#380" ? ["#379=IFCCARTESIANPOINT((100.,0.,0.));", "#380=IFCAXIS2PLACEMENT3D(#379,$,$);"] : []),
      nested ? "#371=IFCSHAPEREPRESENTATION(#9,'Body','MappedRepresentation',(#381));" : "#371=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#295));",
      ...(nested ? ["#381=IFCMAPPEDITEM(#382,#373);", "#382=IFCREPRESENTATIONMAP(#7,#383);", "#383=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#295));"] : []),
      `#372=IFCREPRESENTATIONMAP(${origin},#371);`, `#373=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#6,${scale},$);`, "#374=IFCMAPPEDITEM(#372,#373);",
      "#375=IFCSHAPEREPRESENTATION(#9,'Body','MappedRepresentation',(#374));", "#376=IFCPRODUCTDEFINITIONSHAPE($,$,(#375));",
      "#377=IFCCOLUMN('CN2C200000000000000000',$,'C2',$,$,#289,#376,$,.COLUMN.);", "#378=IFCRELCONTAINEDINSPATIALSTRUCTURE('CN2C2R0000000000000000',$,$,$,(#377),#20);"];
    it("is read once, through an identity origin and a scale of 1", async () => {
      const r = await read(addLines(text, col()));
      expect(r.columns.find((c) => c.global_id === "CN2C200000000000000000")).toMatchObject({ at: [2000, 2000], width_mm: 400, depth_mm: 400, base_mm: 0, top_mm: 3500 });
    });
    it("a moved origin, a scale and a mapped item inside a mapped item are not followed — each said with its words", async () => {
      const said = async (...a) => why(await read(addLines(text, col(...a))), "CN2C200000000000000000");
      expect(await said("#380")).toEqual(["a column whose body is not read (a mapped body with a moved origin)"]);
      expect(await said("#7", "2.")).toEqual(["a column whose body is not read (a scaled mapped body)"]);
      expect(await said("#7", "1.", true)).toEqual(["a column whose body is not read (a mapped body nested twice)"]);
    });
  });

  describe("curtain walls and stairs", () => {
    const KW = KWL;
    it("with an Axis: the Axis is the line, its body gives the height", async () => {
      const r = await read(addLines(text, KW));
      expect(r.curtain_walls).toEqual([{ global_id: "CN2K100000000000000000", name: "K1", type_name: "", storey: "L00", start: [0, 0], end: [20000, 0], base_mm: 0, height_mm: 3500, is_external: null, from: "axis" }]);
    });
    const PARTS = (profile = "#36") => ["#420=IFCCURTAINWALL('CN2K200000000000000000',$,'K2',$,$,#33,$,$,.NOTDEFINED.);", `#421=IFCEXTRUDEDAREASOLID(${profile},#38,#1,3000.);`, "#422=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#421));",
      "#423=IFCPRODUCTDEFINITIONSHAPE($,$,(#422));", "#424=IFCPLATE('CN2P100000000000000000',$,'P1',$,$,#33,#423,$,.NOTDEFINED.);", "#425=IFCRELAGGREGATES('CN2K2A0000000000000000',$,$,$,#420,(#424));",
      "#426=IFCRELCONTAINEDINSPATIALSTRUCTURE('CN2K2R0000000000000000',$,$,$,(#420,#424),#20);", "#430=IFCRECTANGLEPROFILEDEF(.AREA.,$,#35,20000.,3000.);"];
    it("with only parts: the straight line through them (plates sit mid-band), and the parts are said, not placed", async () => {
      const r = await read(addLines(text, PARTS()));
      const k = r.curtain_walls[0];
      expect(k).toMatchObject({ global_id: "CN2K200000000000000000", storey: "L00", base_mm: 0, height_mm: 3000, from: "parts" });
      expect(sameSet(k.start, [0, 0]) && sameSet(k.end, [20000, 0]) || sameSet(k.start, [20000, 0]) && sameSet(k.end, [0, 0])).toBe(true);
      expect(r.not_read.find((n) => n.global_id === "CN2P100000000000000000")).toMatchObject({ ifc_class: "IFCPLATE", storey: "L00", why: "a panel or mullion of curtain wall CN2K200000000000000000 — its curtain type draws them" });
      expect(r.not_read.filter((n) => n.global_id === "CN2P100000000000000000")).toHaveLength(1);
    });
    it("parts spread over more than a metre across are not a straight wall", async () => {
      const r = await read(addLines(text, PARTS("#430")));
      expect(r.curtain_walls).toEqual([]);
      expect(why(r, "CN2K200000000000000000")).toEqual(["a curtain wall that is not straight"]);
    });
    it("a curtain wall with neither Axis nor parts is said", async () => {
      expect(why(await read(addLines(text, PARTS().filter((l) => !l.startsWith("#425=")))), "CN2K200000000000000000")).toEqual(["a curtain wall with no Axis and no parts to read a line from"]);
    });
    const ST = ["#440=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#39));", "#441=IFCPRODUCTDEFINITIONSHAPE($,$,(#440));", "#442=IFCSTAIR('CN2T100000000000000000',$,'T1',$,$,#33,#441,$,.NOTDEFINED.);",
      "#443=IFCSTAIRFLIGHT('CN2T1F0000000000000000',$,'T1 flight',$,$,#33,#441,$,2,1,150.,250.,.STRAIGHT.);", "#444=IFCRELAGGREGATES('CN2T1A0000000000000000',$,$,$,#442,(#443));",
      "#445=IFCRELCONTAINEDINSPATIALSTRUCTURE('CN2T1R0000000000000000',$,$,$,(#442),#20);"];
    it("a stair is said with its box and never read; its flight says whose it is", async () => {
      const r = await read(addLines(text, ST));
      expect(r.not_read.find((n) => n.global_id === "CN2T100000000000000000")).toMatchObject({ ifc_class: "IFCSTAIR", storey: "L00", why: "a stair — flagged from MA-8 batch 3 (8-9); a person places it", box: { min: [0, -150, 0], max: [20000, 150, 3500] } });
      expect(r.not_read.find((n) => n.global_id === "CN2T1F0000000000000000")).toMatchObject({ ifc_class: "IFCSTAIRFLIGHT", why: "a flight of stair CN2T100000000000000000" });
      const bare = await read(addLines(text, [...ST.slice(2, 3).map((l) => l.replace(",#441,", ",$,")), ST[5]]));
      expect(bare.not_read.find((n) => n.global_id === "CN2T100000000000000000")).toMatchObject({ box: null, box_why: "no body this reader reads" });
    });
  });

  it("a floor of hundreds of holes reads 200 and says the rest (amendment 11: the size limits refuse whole runs)", async () => {
    const lines = [], ids = [];
    for (let k = 0; k < 201; k++) {
      const b = 2000 + k * 5, x = 100 + (k % 20) * 900, y = 100 + Math.floor(k / 20) * 900;
      lines.push(`#${b}=IFCCARTESIANPOINT((${x}.,${y}.));`, `#${b + 1}=IFCCARTESIANPOINT((${x + 500}.,${y}.));`, `#${b + 2}=IFCCARTESIANPOINT((${x + 500}.,${y + 500}.));`, `#${b + 3}=IFCCARTESIANPOINT((${x}.,${y + 500}.));`, `#${b + 4}=IFCPOLYLINE((#${b},#${b + 1},#${b + 2},#${b + 3},#${b}));`);
      ids.push(`#${b + 4}`);
    }
    const r = await read(addLines(edit(["#262=IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,#256,(#261))", `#262=IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,#256,(${ids.join(",")}))`]), lines));
    expect(byName(r, "F3 void").voids).toBe(201);
    expect(r.openings.filter((o) => o.host === gid("F3"))).toHaveLength(200);
    expect(why(r, `${gid("F3")}:hole200`)).toEqual(["more than 200 holes in one floor — the rest are not read; a person cuts them"]);
  });

  it("wallsOnly (the manifest capture's read): the same levels, walls and floors, and none of the 0.2.0 elements", async () => {
    const [full, walls] = [await read(text), await readIfcGeometry(Buffer.from(text, "utf8"), { wallsOnly: true })];
    expect([walls.levels, walls.walls, walls.floors]).toEqual([full.levels, full.walls, full.floors]);
    expect([walls.openings, walls.doors, walls.windows, walls.columns, walls.curtain_walls]).toEqual([[], [], [], [], []]);
  });

  it("hint.true_north is the context's TrueNorth, or null", async () => {
    expect((await read(edit(["#8=IFCDIRECTION((0.,1.));", "#8=IFCDIRECTION((1.,0.));"]))).hint.true_north).toEqual([1, 0]);
    expect((await read(edit(["#9=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#7,#8);", "#9=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#7);"]))).hint.true_north).toBeNull();
  });

  it("runIfc: openings, doors, windows, columns and curtain walls are candidates; not_read_by_class counts the rest", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "ifc-")), f = resolve(dir, "k.ifc");
    try {
      const t = addLines(text, [...KWL, "#900=IFCOPENINGELEMENT('REVOP00000000000000001',$,'o',$,$,#33,$,$,.OPENING.);", "#901=IFCRELVOIDSELEMENT('REVOP0000000000000000R',$,$,$,#46,#900);"]);
      writeFileSync(f, t);
      const r = await runIfc({ job_id: "job-0001", items: [{ id: "ev-0001", path: f, sha256: createHash("sha256").update(t).digest("hex") }] });
      expect(r.status).toBe("done");
      const by = (k) => r.result.candidates.filter((c) => c.kind === k);
      expect(by("door")).toMatchObject([{ cid: gid("D1"), geometry: { storey: "L00", host: gid("W1"), opening: gid("O1"), along_mm: 5000, ifc_class: "IFCDOOR" }, measured: { width_mm: 900, height_mm: 2100, sill_mm: 0 } }]);
      expect(by("column")).toMatchObject([{ cid: gid("C1"), geometry: { Location: [2000, 2000], shape: "rect", rotation_deg: 0, base_mm: 0, top_mm: 3500, load_bearing: null }, measured: { width_mm: 400, depth_mm: 400, height_mm: 3500 } }]);
      expect(by("opening")).toMatchObject([{ cid: `${gid("F3")}:hole0`, geometry: { host_kind: "floor", Boundary: expect.any(Array) }, measured: { area_m2: 1 } }]);
      const kw = by("wall").find((c) => c.geometry.curtain);
      expect(kw).toMatchObject({ cid: "CN2K100000000000000000", measured: { height_mm: 3500, length_mm: 20000 }, geometry: { curtain: true, LocationCurve: { start: [0, 0], end: [20000, 0] }, BaseElevation: 0, TopElevation: 3500, from: "axis" } });
      expect(kw.measured.thickness_mm).toBeUndefined();
      expect(r.result.receipt.not_read_by_class).toEqual({ IFCWALL: 2, IFCSLAB: 1, IFCOPENINGELEMENT: 1 });
      expect(r.result.candidates.every((c) => Object.values(c.measured).every(Number.isFinite))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
const KWL = ["#400=IFCSHAPEREPRESENTATION(#9,'Axis','Curve2D',(#42));", "#401=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#39));", "#402=IFCPRODUCTDEFINITIONSHAPE($,$,(#400,#401));",
  "#403=IFCCURTAINWALL('CN2K100000000000000000',$,'K1',$,$,#33,#402,$,.NOTDEFINED.);", "#404=IFCRELCONTAINEDINSPATIALSTRUCTURE('CN2K1R0000000000000000',$,$,$,(#403),#20);"];
