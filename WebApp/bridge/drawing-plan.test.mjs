// MA-5a-4 — a drawing job's candidates to one changeset per drawing, on the drill plan's own sentinel-drawing result
// (fixtures/drawing/drill-plan-L00-result.json: drawing/fixtures/drill-plan-L00.pdf at 1:50, walls 100/200/250/300/300 mm, two tagged doors)
// and the real typer over the BDS layer-free guideline and catalogue.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { validateChangeset } from "./changesets-logic.mjs";
import { readAlignBody, alignFrom, checkResidual, planDrawing, paperToModel, itemOf, PLANNER } from "./drawing-plan.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const RESULT = read("./fixtures/drawing/drill-plan-L00-result.json");
const CAT = read("../../demo/bds-pilot/bds-type-catalog.json");
const type = makeTyper({
  guideline: { body: read("../../demo/bds-pilot/bds-dd-layerfree-guideline.json"), label: "guideline@1 · project · 0123456789ab…", sha256: "ab".repeat(32) },
  catalog: { body: CAT, label: "type_catalog@1 · project · fedcba987654…", sha256: "cd".repeat(32) } }, core);
const catalog = { types: CAT.types, label: "type_catalog@1", sha256: "cd".repeat(32) };
const anyType = () => ({}); // a typer that types everything — the doors' placement, apart from typing
const JOB = { id: "job-0005", ledger: { id: 3001, hash: "31".repeat(32) }, reader: "sentinel-drawing", version: "0.1.0" };
const A = { paper: [60, 40], model: [40000, 0] }, B = { paper: [220, 160], model: [48000, 6000] }, CHECK = { paper: [220, 40], model: [48000, 0] };
const DRILL = { points: [A, B], check: CHECK, elevation_mm: 0 };
const no = (fn, status, message) => { try { fn(); } catch (e) { expect([e.status, e.message]).toEqual([status, message]); return; } throw new Error("no throw"); };
const plan = (body = DRILL, more = {}) => planDrawing({ job: JOB, candidates: RESULT.candidates, align: readAlignBody(body, ["ev-0007"]), type, catalog, sameCategory: core.sameCategory, ...more });
const els = (p) => p.storeys[0].body?.elements ?? [];
const W = (n) => `drawing-ev-0007-p1-wall-${n}`;

describe("readAlignBody — the lead states the points, the level and its height; the bridge builds the rest", () => {
  it("the drill's body; item defaults to the one drawing; a level trimmed", () => {
    expect(readAlignBody({ ...DRILL, level: " GR-FFL " }, ["ev-0007"])).toEqual({ item: "ev-0007", points: [A, B], check: CHECK, level: "GR-FFL", elevation_mm: 0 });
    expect(readAlignBody({ points: [A, B], elevation_mm: 3000, item: "ev-0008" }, ["ev-0007", "ev-0008"])).toMatchObject({ item: "ev-0008", check: null, level: null });
  });
  it("anything else is refused in words, never dropped", () => {
    no(() => readAlignBody({ ...DRILL, frame: {} }, ["ev-0007"]), 400, "frame is not a proposal field — a drawing is proposed with {item?, points, check?, level?, elevation_mm}; the bridge builds every changeset from the job's own result — nothing was saved");
    no(() => readAlignBody({ points: [A, B], elevation_mm: 0 }, ["ev-0007", "ev-0008"]), 400, "the job read ev-0007, ev-0008 — name the drawing in item (one drawing, one alignment) — nothing was saved");
    no(() => readAlignBody({ ...DRILL, item: "ev-0009" }, ["ev-0007"]), 400, "item ev-0009 is not a drawing this job read (ev-0007) — nothing was saved");
    no(() => readAlignBody({ ...DRILL, points: [A] }, ["ev-0007"]), 400, "points is two points, each {paper: [x, y], model: [x, y]} — where a mark is on the drawing (paper mm) and where it is in the model (mm) — nothing was saved");
    no(() => readAlignBody({ ...DRILL, points: [A, { ...B, scale: 50 }] }, ["ev-0007"]), 400, "points[1].scale is not read — a point is {paper: [x, y], model: [x, y]} — nothing was saved");
    no(() => readAlignBody({ ...DRILL, points: [A, { ...B, paper: [2200, 160] }] }, ["ev-0007"]), 400, "points[1].paper must be [x, y], two numbers of mm within ±2000 (millimetres on the drawing's page 1, from its bottom-left corner) — nothing was saved");
    no(() => readAlignBody({ ...DRILL, points: [A, { ...B, model: ["48000", 6000] }] }, ["ev-0007"]), 400, "points[1].model must be [x, y], two numbers of mm within ±20000000000 (the model's internal coordinates) — nothing was saved");
    no(() => readAlignBody({ ...DRILL, points: [A, { paper: [65, 40], model: [48000, 6000] }] }, ["ev-0007"]), 400, "the two points are under 10 mm apart on the paper — pick two marks far apart (opposite corners of the plan) — nothing was saved");
    no(() => readAlignBody({ ...DRILL, points: [A, { paper: [220, 160], model: [40050, 0] }] }, ["ev-0007"]), 400, "the two points are under 100 mm apart in the model — pick two marks far apart — nothing was saved");
    no(() => readAlignBody({ ...DRILL, level: "GR:FFL" }, ["ev-0007"]), 400, "level must be a Revit level's name — one line of at most 256 characters, without \\ : { } [ ] | ; < > ? ` ~ — nothing was saved");
    no(() => readAlignBody({ points: [A, B] }, ["ev-0007"]), 400, "elevation_mm is required — the drawing's level height in the model, in mm (0 for a ground floor at the model's origin), within ±32000000 — nothing was saved");
  });
});

describe("alignFrom / checkResidual — the similarity two points fix, and a third point's residual", () => {
  it("the drill: 1:50, no turn, moved 37000, -2000; the check lands exactly", () => {
    const al = alignFrom([A, B]);
    expect(al).toEqual({ scale: 50, rotation_deg: 0, dx_mm: 37000, dy_mm: -2000 });
    expect([paperToModel(al, [141, 90]), checkResidual(al, CHECK)]).toEqual([[44050, 2500], 0]);
  });
  it("a turned drawing: 90° anticlockwise, the move from the first point", () => {
    expect(alignFrom([{ paper: [0, 0], model: [1000, 1000] }, { paper: [100, 0], model: [1000, 6000] }])).toEqual({ scale: 50, rotation_deg: 90, dx_mm: 1000, dy_mm: 1000 });
    expect(alignFrom([{ paper: [0, 0], model: [0, 0] }, { paper: [100, 0], model: [0, -5000] }]).rotation_deg).toBe(270);
  });
  it("refused in words: a scale no plan is drawn at (the points swapped, or metres for mm), a check point off by more than 100 mm", () => {
    no(() => alignFrom([{ paper: A.model, model: A.paper }, { paper: B.model, model: B.paper }]), 400,
      "the two points give a scale of 1:0.02 — a plan is drawn at 1:1 to 1:2000; check that paper is in paper millimetres and model in model millimetres, and that both name the same two marks — nothing was saved");
    no(() => checkResidual(alignFrom([A, B]), { paper: [220, 40], model: [48000, 150] }), 400,
      "the check point lands 150 mm from where you said it is — more than the 100 mm an alignment is trusted to; one of the three points is not where it was read — nothing was saved");
  });
});

describe("planDrawing — one changeset per drawing, every element inferred and never pre-ticked", () => {
  it("the drill on the BDS layer-free standards: a created level, four walls cornered and typed, the 250 mm wall and both doors gaps", () => {
    const p = plan();
    expect(p.alignment).toEqual({ method: "2-point similarity", item: "ev-0007", points: [A, B], check: CHECK, scale: 50, rotation_deg: 0, dx_mm: 37000, dy_mm: -2000, dz_mm: 0, check_mm: 0, rmse_mm: null });
    expect(p.storeys[0].storey).toEqual({ cid: "drawing-ev-0007-p1-level", level: "Drawing ev-0007 job-0005", how: "created", elevation_mm: 0, delta_mm: 0, checked: true, from: null });
    expect(p.storeys[0].body.name).toBe("Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005");
    expect(p.storeys[0].body.source).toBe("sentinel-drawing 0.1.0");
    expect(els(p).map((e) => [e.kind, e.cid, e.facts?.thickness_mm ?? null, e.place.LocationCurve ? [e.place.LocationCurve.start, e.place.LocationCurve.end] : e.place.BaseElevation])).toEqual([
      ["level", "drawing-ev-0007-p1-level", null, 0],
      ["wall", W(1), 100, [[44050, 150, 0], [44050, 5900, 0]]],
      ["wall", W(2), 200, [[40125, 5900, 0], [47850, 5900, 0]]],
      ["wall", W(4), 300, [[47850, 150, 0], [47850, 5900, 0]]],
      ["wall", W(5), 300, [[40125, 150, 0], [47850, 150, 0]]]]);
    expect(els(p).every((e) => e.place.TopElevation === undefined)).toBe(true); // decision 5: no height drawn
    expect(els(p)[2].reason).toBe(`drawn wall ${W(2)}: 200 mm thick (4 paper mm), 8000 mm long, on ev-0007 page 1 at 1:50 · Location Exterior · ends -125 / -150 mm to the corners (the start to ${W(3)}'s centreline: a type gap, not placed) · height not drawn (the next level up) · drawn, not measured · job-0005 (ledger #3001)`);
    expect(p.storeys[0].exceptions.map((x) => x.reason)).toEqual([
      "type gap — BDS_EXT_ARC_CMU_250 mm is not in the type catalogue; it waits in the Holding Area",
      "type gap — 13 Doors types are named within 100 mm of 1000 x 2100 mm — a person picks one; it waits in the Holding Area",
      "type gap — 13 Doors types are named within 100 mm of 900 x 2100 mm — a person picks one; it waits in the Holding Area"]);
    expect(p.groups.map((g) => g.elements)).toEqual([1, 1, 1]);
    for (const [cid, t] of p.storeys[0].byCid) {
      expect([cid, t.pretick, t.accuracy]).toEqual([cid, false, { status: "inferred", basis: "drawing", from_job: "job-0005", scale: 50, check_mm: 0 }]);
    }
    expect(p.storeys[0].byCid.get(W(1))).toMatchObject({ measured: { thickness_paper_mm: 2, length_paper_mm: 110, thickness_mm: 100, length_mm: 5500 }, trim_mm: [150, 100] });
  });
  it("validateChangeset takes the bridge's trust by cid: nothing pre-ticked, every accuracy inferred, the changeset not claimed", () => {
    const p = plan(), s = p.storeys[0];
    const v = validateChangeset(s.body, { member: true, type, job: { record: { id: JOB.id, ledger_id: 3001, reader: "sentinel-drawing 0.1.0", planner: `${PLANNER} 0.1.0`, alignment: p.alignment }, byCid: s.byCid } });
    expect([v.claimed, v.elements.length, v.elements.every((e) => e.pretick === false && e.accuracy.status === "inferred")]).toEqual([false, 5, true]);
  });
  it("doors (any typer): placed on the host's untrimmed centreline at along x scale; the tag's size", () => {
    const p = plan(DRILL, { type: anyType });
    const doors = els(p).filter((e) => e.kind === "door");
    expect(doors.map((e) => [e.cid, e.place.Location, e.facts.params.Size])).toEqual([
      [`${W(1)}-door-1`, [44050, 2500, 0], "W1000 x H2100 mm"],
      [`${W(5)}-door-1`, [43450, 150, 0], "W900 x H2100 mm"]]);
    expect(doors[0].reason).toBe(`drawn door ${W(1)}-door-1 in ${W(1)}: W1000 x H2100 mm (its tag; swing 1000 mm) on ev-0007 page 1 at 1:50 · typed by an office rule · its facing not read · drawn, not measured · job-0005 (ledger #3001)`);
    expect(p.storeys[0].byCid.get(`${W(1)}-door-1`)).toMatchObject({ pretick: false, measured: { width_paper_mm: 20, width_mm: 1000, height_mm: 2100 } });
  });
  it("a door is held, never placed: no tag height, a tag that disagrees with its swing, a host that is a gap, a level never checked", () => {
    const edit = (cid, f) => RESULT.candidates.map((c) => (c.cid === cid ? f(structuredClone(c)) : c));
    const d1 = `${W(1)}-door-1`, held = (p) => p.storeys[0].exceptions.filter((x) => x.unique_id === d1).map((x) => x.reason);
    const run = (candidates, body = DRILL) => planDrawing({ job: JOB, candidates, align: readAlignBody(body, ["ev-0007"]), type: anyType, catalog, sameCategory: core.sameCategory });
    expect(held(run(edit(d1, (c) => { delete c.measured.tag_width_mm; delete c.measured.tag_height_mm; return c; }))))
      .toEqual(["its height is not drawn (no W x H tag beside its swing; 1000 mm wide as drawn) — a person places this door"]);
    expect(held(run(edit(d1, (c) => { c.measured.tag_width_mm = 800; return c; }))))
      .toEqual(["its swing is drawn 1000 mm wide at 1:50 and its tag says 800 — more than 100 mm apart: check the alignment's scale, or the tag is another door's"]);
    expect(held(planDrawing({ job: JOB, candidates: edit(d1, (c) => { c.geometry.host = W(3); return c; }), align: readAlignBody(DRILL, ["ev-0007"]), type, catalog, sameCategory: core.sameCategory })))
      .toEqual([`its host wall ${W(3)} is a type gap — propose the drawing again once the wall's group in the Holding Area closes`]);
    expect(held(run(RESULT.candidates, { ...DRILL, level: "GR-FFL" })))
      .toEqual(["its level GR-FFL is in no published model, so its height in Revit is unknown here — Revit refuses a door off its level's height; name a published level, or leave level out to have it created"]);
  });
  it("the level: named and checked, matched within 20 mm, refused when the named level is elsewhere; a filed storey keeps its level", () => {
    const PUB = [{ name: "GR-FFL", elevation_mm: 12, from: "ARC.ifc P01" }];
    expect(plan({ ...DRILL, level: "gr-ffl" }, { manifest: PUB }).storeys[0].storey).toMatchObject({ level: "GR-FFL", how: "named", elevation_mm: 12, delta_mm: 12, checked: true });
    const m = plan(DRILL, { manifest: PUB });
    expect([m.storeys[0].storey.how, els(m)[0].kind, els(m)[0].place.LocationCurve.start[2]]).toEqual(["matched", "wall", 12]); // no level created; walls at its height
    no(() => plan({ ...DRILL, elevation_mm: 3000, level: "GR-FFL" }, { manifest: PUB }), 400,
      "GR-FFL is at 12 mm in ARC.ifc P01, and elevation_mm says 3000 — 2988 mm apart, more than the 20 mm a match allows (D7); state the level's own height, or leave level out to have one created — nothing was saved");
    const was = { level: "Drawing ev-0007 job-0005", how: "created", elevation_mm: 0, delta_mm: 0, checked: true, from: null };
    const filed = { cids: new Set([W(1), W(2), W(4), W(5), "drawing-ev-0007-p1-level"]), storeys: new Map([["drawing-ev-0007-p1-level", was]]) };
    const f = plan(DRILL, { filed });
    expect([f.storeys[0].body, f.already_filed, f.storeys[0].storey.how]).toEqual([null, 4, "filed"]);
    no(() => plan({ ...DRILL, level: "GR-FFL" }, { filed }), 400, "ev-0007 was filed on Drawing ev-0007 job-0005 — leave level out, or read the drawing again to propose it afresh — nothing was saved");
  });
  it("a turned alignment turns every wall and door; points that put the drawing out of Revit's reach are refused in the drawing's words", () => {
    const turned = { points: [{ paper: [60, 40], model: [0, 0] }, { paper: [220, 40], model: [0, 8000] }], elevation_mm: 0 };
    const p = plan(turned, { type: anyType });
    expect(els(p).find((e) => e.cid === W(5)).place.LocationCurve).toEqual({ start: [-150, 125, 0], end: [-150, 7850, 0] });
    expect(els(p).find((e) => e.cid === `${W(5)}-door-1`).place.Location).toEqual([-150, 3450, 0]);
    no(() => plan({ points: [{ paper: [60, 40], model: [4e7, 0] }, { paper: [220, 160], model: [4e7 + 8000, 6000] }], elevation_mm: 0 }), 400,
      "the points put the drawing 40 km from the model's internal origin — Revit draws a model within 32 km of it; check the points' model coordinates — nothing was saved");
  });
  it("itemOf: the drawing a candidate came from", () => {
    expect(RESULT.candidates.map(itemOf)).toEqual(Array(7).fill("ev-0007"));
  });
});
