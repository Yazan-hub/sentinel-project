// MA-5a-4 — a drawing job's candidates to one changeset per drawing, on the drill plan's own sentinel-drawing result
// (fixtures/drawing/drill-plan-L00-result.json: drawing/fixtures/drill-plan-L00.pdf at 1:50, walls 100/200/250/300/300 mm, two tagged doors)
// and the real typer over the BDS layer-free guideline and catalogue.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { validateChangeset } from "./changesets-logic.mjs";
import { readAlignBody, alignFrom, checkResidual, planDrawing, paperToModel, itemOf, PLANNER, scanOnStorey, matchWalls } from "./drawing-plan.mjs";

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
    no(() => readAlignBody({ ...DRILL, frame: {} }, ["ev-0007"]), 400, "frame is not a proposal field — a drawing is proposed with {item?, points, check?, level?, elevation_mm, revises?}; the bridge builds every changeset from the job's own result — nothing was saved");
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
  it("review: a same-named level at another height is never the match; a check point on the A-B line is refused; a near-standard scale reads sizes at the standard", () => {
    const two = [{ name: "Level 1", elevation_mm: 2900, from: "STR.ifc P01" }, { name: "Level 1", elevation_mm: 3000, from: "ARC.ifc P01" }];
    expect(plan({ ...DRILL, elevation_mm: 3000 }, { manifest: two }).storeys[0].storey).toMatchObject({ level: "Level 1", how: "matched", elevation_mm: 3000, delta_mm: 0, from: "ARC.ifc P01" });
    no(() => readAlignBody({ ...DRILL, check: { paper: [140, 100], model: [44000, 3000] } }, ["ev-0007"]), 400,
      "the check point lies on (or near) the line through A and B — it cannot catch a mirrored or misread drawing; pick a mark well off that line (a third corner) — nothing was saved");
    // B read 0.2 % short (1:49.9): placement keeps the points' scale, the 300 mm walls still type as 300 (the sizes at 1:50, said)
    const near = plan({ points: [A, { paper: [220, 160], model: [47984, 5988] }], elevation_mm: 0 });
    expect([near.alignment.scale, near.alignment.sizes_at, els(near).filter((e) => e.kind === "wall").map((e) => e.facts.thickness_mm)]).toEqual([49.9, 50, [100, 200, 300, 300]]);
    expect(plan().alignment.sizes_at).toBeUndefined();
  });
  it("itemOf: the drawing a candidate came from", () => {
    expect(RESULT.candidates.map(itemOf)).toEqual(Array(7).fill("ev-0007"));
  });
});

describe("MA-5a-5 — the drawing against the scan's filed walls: agree, differ, drawn only, scanned only; a door the scan did not see", () => {
  // job-0002's GR-FFL as the drill placed it (MA-4d): the scan's 250 mm west wall was a type gap, so never filed; no partition; no door
  const sw = (cid, start, end, t) => ({ op: "create", kind: "wall", cid, proposal_guid: `g-${cid}`, place: { LevelName: "GR-FFL", LocationCurve: { start, end } }, measured: { thickness_mm: t } });
  const STOREY = { cid: "scan-L00-level", level: "GR-FFL", how: "matched", elevation_mm: 0, delta_mm: 0, checked: true, from: "ARC.ifc P01" };
  const CS = (elements, over = {}) => ({ name: "Survey job-0002 · GR-FFL", status: "applied", result: { rejected: [] },
    job: { id: "job-0002", ledger_id: 2201, reader: "sentinel-survey 0.1.0", storey: STOREY }, elements, ...over });
  const WALLS = [sw("scan-L00-wall-1", [40125, 150, 0], [47850, 150, 0], 300), sw("scan-L00-wall-2", [40125, 5900, 0], [47850, 5900, 0], 200),
    sw("scan-L00-wall-3", [47850, 150, 0], [47850, 5900, 0], 300)];
  const SHA = "d7".repeat(32);
  const vs = (elements = WALLS, more = {}) => plan(DRILL, { scan: scanOnStorey([CS(elements)], 0), drawingSha: SHA, type: anyType, ...more });

  it("scanOnStorey: survey changesets proposed or placed on the storey within 20 mm, less what Revit rejected — never a drawing's, a declined one or another storey's", () => {
    const s = scanOnStorey([CS(WALLS, { result: { rejected: ["g-scan-L00-wall-2"] } }), CS(WALLS, { status: "declined" }), CS(WALLS, { job: { ...CS([]).job, storey: { ...STOREY, elevation_mm: 3000 } } }),
      CS(WALLS, { job: { ...CS([]).job, reader: "sentinel-drawing 0.1.0" } })], 12);
    expect([s.walls.map((w) => [w.cid, w.t, w.level]), s.storey, s.ledgers]).toEqual([[["scan-L00-wall-1", 300, "GR-FFL"], ["scan-L00-wall-3", 300, "GR-FFL"]], STOREY, [2201]]);
    expect(scanOnStorey([], 0)).toEqual({ walls: [], doors: [], storey: null, ledgers: [], gaps: 0, copies: 0 });
    // the drill's GR-FFL: the same building scanned four times — each wall counted once, the applied copy first; no "scanned, not drawn"
    const later = CS(WALLS.map((w) => ({ ...w, cid: w.cid.replace("L00", "L00x") })), { status: "partially_applied", name: "Survey job-0006 · Scan L00 job-0006",
      job: { ...CS([]).job, id: "job-0006", ledger_id: 2300, storey: { ...STOREY, level: "Scan L00 job-0006" } } });
    const s4 = scanOnStorey([later, CS(WALLS)], 0);
    expect([s4.walls.map((w) => w.cid), s4.copies, s4.storey.level, s4.ledgers]).toEqual([["scan-L00-wall-1", "scan-L00-wall-2", "scan-L00-wall-3"], 3, "GR-FFL", [2201, 2300]]);
    expect(plan(DRILL, { scan: s4, drawingSha: SHA }).tally).toMatchObject({ agree: 3, scanned_only: 0 });
    expect(scanOnStorey([CS(WALLS, { exceptions: [{ unique_id: "scan-L00-wall-4", name: "wall scan-L00-wall-4", reason: "type gap — BDS_EXT_ARC_CMU_250 mm is not in the type catalogue; it waits in the Holding Area" },
      { unique_id: "scan-L00-floor", name: "floor scan-L00-floor", reason: "type gap — …" }] })], 0).gaps).toBe(1);
  });
  it("the drill: three walls agree (not proposed again), the partition is drawn and not scanned (proposed, one difference), the south door is hosted in the scan's wall on its level", () => {
    const p = plan(DRILL, { scan: scanOnStorey([CS(WALLS, { exceptions: [{ name: "wall scan-L00-wall-4", reason: "type gap — …" }] })], 0), drawingSha: SHA, type: anyType }), s = p.storeys[0];
    expect(s.storey).toMatchObject({ level: "GR-FFL", how: "scan", elevation_mm: 0, checked: true, from: "ARC.ifc P01" });
    // the west wall: the scan held its 250 mm wall as a type gap (never filed) — with every wall typed here it reads "drawn, not in the scan", the gap said
    expect(p.tally).toEqual({ agree: 3, differ: 0, drawn_only: 2, scanned_only: 0, doors_agree: 0, doors_from_drawing: 1 });
    expect(els(p).map((e) => [e.kind, e.cid, e.place.LevelName, e.place.Location ?? null])).toEqual([
      ["wall", W(1), "GR-FFL", null], ["wall", W(3), "GR-FFL", null], ["door", `${W(1)}-door-1`, "GR-FFL", [44050, 2500, 0]], ["door", `${W(5)}-door-1`, "GR-FFL", [43450, 150, 0]]]);
    expect(els(p)[0].reason).toContain(" · drawn, not in the scan (a BCF topic says it) · ");
    expect(els(p)[3].reason).toContain(` · hosted in the scan's scan-L00-wall-1 (Survey job-0002 · GR-FFL — placed first): the scan did not see it (a closed door, or seen on one face only) · `);
    expect(p.differences[0]).toEqual({ kind: "drawn_only", key: `${SHA}|${W(1)}|-|-|drawn_only`, title: `Drawing vs scan: ev-0007 ${W(1)} — drawn, not in the scan`,
      description: expect.stringContaining(`ev-0007 draws ${W(1)} (100 mm thick, 5500 mm long at 1:50) inside the scan's walls on GR-FFL, and no filed scan wall there matches it (3 scan walls, ledger #2201; the scan held 1 wall(s) on this storey as type gaps, not compared)`), item: "ev-0007",
      drawing_cid: W(1), scan_cid: null, scan_changeset: null, scan_job: null, evidence: ["ev-0007#page-1"] });
    // on the office's standards the 250 mm wall is a gap on the drawing too: only the partition differs — the planted difference, one topic
    expect(plan(DRILL, { scan: scanOnStorey([CS(WALLS)], 0), drawingSha: SHA }).differences.map((d) => d.drawing_cid)).toEqual([W(1)]);
    expect(s.byCid.get(`${W(5)}-door-1`)).toMatchObject({ pretick: false, accuracy: { status: "inferred", basis: "drawing" } });
    expect(vs().differences.map((d) => d.key)).toEqual(p.differences.map((d) => d.key)); // the same run, the same keys (dedup across re-runs)
  });
  it("a wall drawn 300 and scanned 200 differs: not proposed, a review row and one difference; a scan wall the drawing lacks is scanned only", () => {
    const thin = [WALLS[0], WALLS[1], { ...WALLS[2], measured: { thickness_mm: 200 } }, sw("scan-L00-wall-9", [42000, 300, 0], [42000, 5800, 0], 100)];
    const p = vs(thin, { type }), s = p.storeys[0]; // the office's standards: the 250 mm west wall a gap on the drawing too
    expect(p.tally).toMatchObject({ agree: 2, differ: 1, drawn_only: 1, scanned_only: 1 });
    expect(els(p).some((e) => e.cid === W(4))).toBe(false);
    expect(s.exceptions.filter((x) => !x.reason.startsWith("type gap")).map((x) => [x.unique_id, x.reason])).toEqual([
      [W(4), `differs from the scan — drawn 300 mm thick, scanned 200 mm: scan-L00-wall-3 in Survey job-0002 · GR-FFL; the scan wins on geometry, not proposed (BCF topic: Drawing vs scan: ev-0007 ${W(4)} — drawn 300 mm thick, scanned 200 mm (scan-L00-wall-3))`],
      ["scan-L00-wall-9", "scanned (Survey job-0002 · GR-FFL), not on ev-0007 — not proposed here (BCF topic: Drawing vs scan: ev-0007 — scan-L00-wall-9 scanned, not drawn)"]]);
    expect(p.differences.map((d) => [d.kind, d.key])).toEqual([["drawn_only", `${SHA}|${W(1)}|-|-|drawn_only`], ["differs", `${SHA}|${W(4)}|2201|scan-L00-wall-3|differs`],
      ["scanned_only", `${SHA}|-|2201|scan-L00-wall-9|scanned_only`]]);
  });
  it("a door the scan filed on that wall is the same door — not proposed twice; a wall offset by more than one paper millimetre differs", () => {
    const door = { op: "create", kind: "door", cid: "scan-L00-wall-1-door-1", proposal_guid: "g-d", place: { LevelName: "GR-FFL", Location: [43500, 150, 0] } };
    expect(vs([...WALLS, door]).tally).toMatchObject({ doors_agree: 1, doors_from_drawing: 0 });
    const moved = [{ ...WALLS[0], place: { ...WALLS[0].place, LocationCurve: { start: [40125, 260, 0], end: [47850, 260, 0] } } }, WALLS[1], WALLS[2]];
    expect(vs(moved).differences.find((d) => d.kind === "differs").title).toBe(`Drawing vs scan: ev-0007 ${W(5)} — 110 mm apart (scan-L00-wall-1)`);
  });
  it("drill MA5a456: the scan's level never checked holds the doors with the scan's words — leaving level out would only give the scan's level again", () => {
    const named = { ...STOREY, how: "named", checked: false, from: null };
    const p = plan(DRILL, { scan: scanOnStorey([CS(WALLS, { job: { ...CS([]).job, storey: named } })], 0), drawingSha: SHA, type: anyType });
    expect(p.storeys[0].storey).toMatchObject({ how: "scan", checked: false });
    expect(p.storeys[0].exceptions.filter((x) => x.name.startsWith("door ")).map((x) => x.reason)).toEqual(Array(2).fill(
      "its level GR-FFL is in no published model, so its height in Revit is unknown here — Revit refuses a door off its level's height; GR-FFL is the scan's level, named when the scan was proposed and never checked: publish a model that holds it, then propose the drawing again"));
  });
  it("no scan on the storey: MA-5a-4 unchanged (a created level, every wall proposed, no difference)", () => {
    const p = plan(DRILL, { scan: scanOnStorey([], 0), drawingSha: SHA });
    expect([p.storeys[0].storey.how, els(p).length, p.differences, p.tally.agree]).toEqual(["created", 5, [], 0]);
  });
  it("review: one type step off is a difference (250 drawn, 300 scanned) — the planted difference, one topic; a wall the scan saw in part differs", () => {
    const west = sw("scan-L00-wall-4", [40125, 150, 0], [40125, 5900, 0], 300);
    const p = vs([...WALLS, west]);
    expect([p.tally.agree, p.tally.differ]).toEqual([3, 1]);
    expect(p.differences.find((d) => d.kind === "differs")).toMatchObject({ title: `Drawing vs scan: ev-0007 ${W(3)} — drawn 250 mm thick, scanned 300 mm (scan-L00-wall-4)`, key: `${SHA}|${W(3)}|2201|scan-L00-wall-4|differs` });
    expect(vs([...WALLS, { ...west, measured: { thickness_mm: 270 } }]).tally).toMatchObject({ agree: 4, differ: 0 }); // 20 mm: the reading's
    const half = [{ ...WALLS[0], place: { ...WALLS[0].place, LocationCurve: { start: [40125, 150, 0], end: [44000, 150, 0] } } }, WALLS[1], WALLS[2]];
    expect(vs(half).differences.find((d) => d.drawing_cid === W(5)).title).toBe(`Drawing vs scan: ev-0007 ${W(5)} — the scan saw 3875 of its 7725 mm (scan-L00-wall-1)`);
  });
  it("review: a drawn wall split at a window shares the scan's wall (never proposed on top of it); a scan wall in fragments is drawn, and the door goes into its own fragment", () => {
    const edit = (cands) => planDrawing({ job: JOB, candidates: cands, align: readAlignBody(DRILL, ["ev-0007"]), type: anyType, catalog, sameCategory: core.sameCategory,
      scan: scanOnStorey([CS(WALLS)], 0), drawingSha: SHA });
    const w2 = RESULT.candidates.find((c) => c.cid === W(2));
    const split = RESULT.candidates.flatMap((c) => (c.cid !== W(2) ? [c] : [
      { ...w2, cid: `${W(2)}a`, geometry: { ...w2.geometry, LocationCurve: { start: [60, 158], end: [120, 158] } }, measured: { ...w2.measured, length_paper_mm: 60 } },
      { ...w2, cid: `${W(2)}b`, geometry: { ...w2.geometry, LocationCurve: { start: [138, 158], end: [220, 158] } }, measured: { ...w2.measured, length_paper_mm: 82 } }]));
    const p = edit(split);
    expect([p.tally.agree, els(p).some((e) => String(e.cid).startsWith(W(2))), p.differences.map((d) => d.drawing_cid)]).toEqual([4, false, [W(1), W(3)]]);
    const frag = [WALLS[0], WALLS[1], WALLS[2]].flatMap((w) => (w.cid !== "scan-L00-wall-1" ? [w]
      : [{ ...w, cid: "scan-L00-wall-1a", place: { ...w.place, LocationCurve: { start: [40125, 150, 0], end: [43000, 150, 0] } } },
        { ...w, cid: "scan-L00-wall-1b", place: { ...w.place, LocationCurve: { start: [43000, 150, 0], end: [47850, 150, 0] } } }]));
    const q = vs(frag);
    expect([q.tally.scanned_only, q.tally.agree]).toEqual([0, 3]);
    expect(els(q).find((e) => e.cid === `${W(5)}-door-1`)).toMatchObject({ place: { Location: [43450, 150, 0] }, reason: expect.stringContaining("hosted in the scan's scan-L00-wall-1b") });
  });
  it("review: each key names its own scan wall's job — a second scan job filed on the storey changes no key", () => {
    const west = sw("scan-L00-wall-4", [40125, 150, 0], [40125, 5900, 0], 300);
    const one = plan(DRILL, { scan: scanOnStorey([CS([...WALLS, west])], 0), drawingSha: SHA, type: anyType });
    const other = CS([sw("scan-L00x-wall-1", [40125, 150, 0], [47850, 150, 0], 300)], { name: "Survey job-0009 · GR-FFL", status: "proposed", job: { ...CS([]).job, id: "job-0009", ledger_id: 2400 } });
    const two = plan(DRILL, { scan: scanOnStorey([CS([...WALLS, west]), other], 0), drawingSha: SHA, type: anyType });
    expect(two.differences.map((d) => d.key)).toEqual(one.differences.map((d) => d.key));
  });
  it("matchWalls: parallel within 5°, half the shorter overlapping, within 300 mm — every pair, nearest first", () => {
    const d = [{ a: [0, 0], b: [1000, 0] }, { a: [0, 100], b: [1000, 100] }];
    expect(matchWalls(d, [{ start: [0, 80, 0], end: [1000, 80, 0] }])).toEqual([{ i: 1, j: 0, off: 20 }, { i: 0, j: 0, off: 80 }]); // every pair, nearest first
    expect(matchWalls(d, [{ start: [0, 500, 0], end: [1000, 500, 0] }])).toEqual([]); // too far
    expect(matchWalls(d, [{ start: [0, 0, 0], end: [0, 1000, 0] }])).toEqual([]); // square to it
    expect(matchWalls(d, [{ start: [900, 0, 0], end: [3000, 0, 0] }])).toEqual([]); // 100 of 1000 overlap
  });
});

describe("MA-5b-1 — rooms from the drawing's labels", () => {
  const ROOMS = read("./fixtures/drawing/drill-plan-L00-rooms-result.json");
  const R = (n) => `drawing-ev-0007-p1-room-${n}`;
  const rooms = (p) => els(p).filter((e) => e.kind === "room");
  const go = (candidates = ROOMS.candidates, more = {}) => plan(DRILL, { candidates, type: anyType, ...more });
  const held = (p) => p.storeys[0].exceptions.filter((x) => x.name.startsWith("room ")).map((x) => [x.unique_id, x.reason]);

  it("each label a room on the storey's level at its point: IFCSPACE, Name its number, LongName its name; inferred, never pre-ticked", () => {
    const p = go();
    expect(rooms(p).map((e) => [e.cid, e.validate.identity, e.place.LevelName, e.place.Name, e.place.Number])).toEqual([
      [R(1), { Class: "IFCSPACE", Name: "102", LongName: "MEETING ROOM" }, "Drawing ev-0007 job-0005", "MEETING ROOM", "102"],
      [R(2), { Class: "IFCSPACE", Name: "101", LongName: "OFFICE" }, "Drawing ev-0007 job-0005", "OFFICE", "101"]]);
    // the label's paper point through the alignment: (x - 60) x 50 + 40000, (y - 40) x 50
    const office = ROOMS.candidates.find((c) => c.cid === R(2)).geometry.Location;
    expect(rooms(p)[1].place.Location).toEqual([Math.round(((office[0] - 60) * 50 + 40000) * 10) / 10, Math.round((office[1] - 40) * 50 * 10) / 10, 0]);
    expect(p.storeys[0].byCid.get(R(2))).toMatchObject({ pretick: false, accuracy: { status: "inferred", basis: "drawing" }, measured: { text_height_paper_mm: expect.any(Number) } });
    expect(rooms(p)[1].reason).toMatch(/^drawn room 101 OFFICE on ev-0007 page 1 at 1:50, inside .* · also written in it: FFL \+0\.00 · drawn, not measured · job-0005 \(ledger #3001\)$/);
    expect(els(p)[0].kind).toBe("level"); // a storey that creates its level creates it for rooms too
  });
  it("held, never proposed: round a wall that is a type gap; round a wall this drawing does not have", () => {
    expect(held(go(ROOMS.candidates, { type }))).toEqual([[R(2), "bounded by drawing-ev-0007-p1-wall-3, a type gap — propose the drawing again once the wall's group in the Holding Area closes"]]);
    const stray = ROOMS.candidates.map((c) => (c.cid === R(1) ? { ...c, geometry: { ...c.geometry, walls: [...c.geometry.walls.slice(0, 3), "drawing-ev-0099-p1-wall-1"] } } : c));
    expect(held(go(stray))).toEqual([[R(1), "a wall round it, drawing-ev-0099-p1-wall-1, is not a wall of ev-0007 in job-0005"]]);
  });
  it("no number drawn: Revit numbers it — the identity's Name is its cid, and the reason says so", () => {
    const bare = ROOMS.candidates.map((c) => (c.cid === R(1) ? { ...c, geometry: { ...c.geometry, number: undefined } } : c));
    const [m] = rooms(go(bare));
    expect([m.validate.identity.Name, m.place.Number, /no number drawn: Revit numbers it/.test(m.reason)]).toEqual([R(1), undefined, true]);
  });
  it("on the scan's level when the scan is filed there — even one never checked (a room needs no height); filed rooms are not proposed again", () => {
    const sw = (cid, start, end, t) => ({ op: "create", kind: "wall", cid, proposal_guid: `g-${cid}`, place: { LevelName: "GR-FFL", LocationCurve: { start, end } }, measured: { thickness_mm: t } });
    const STOREY = { cid: "scan-L00-level", level: "GR-FFL", how: "named", elevation_mm: 0, delta_mm: 0, checked: false, from: null };
    const scan = scanOnStorey([{ name: "Survey job-0002 · GR-FFL", status: "applied", result: { rejected: [] }, job: { id: "job-0002", ledger_id: 2201, reader: "sentinel-survey 0.1.0", storey: STOREY },
      elements: [sw("scan-L00-wall-1", [40125, 150, 0], [47850, 150, 0], 300)] }], 0);
    expect(rooms(go(ROOMS.candidates, { scan, drawingSha: "d7".repeat(32) })).map((e) => e.place.LevelName)).toEqual(["GR-FFL", "GR-FFL"]);
    const p = go(ROOMS.candidates, { filed: { cids: new Set([R(1), R(2)]), storeys: new Map() } });
    expect([rooms(p).length, p.already_filed]).toEqual([0, 2]);
  });
  it("the drill's room IDS (drawing/fixtures/drill-rooms-ids.json): both proposed rooms pass as the referee reads them; a room with no number drawn does not", () => {
    const IDS = read("../../drawing/fixtures/drill-rooms-ids.json");
    expect(rooms(go()).map((e) => core.validateElement(IDS, e.validate).pass)).toEqual([true, true]);
    const bare = ROOMS.candidates.map((c) => (c.cid === R(1) ? { ...c, geometry: { ...c.geometry, number: undefined } } : c));
    expect(core.validateElement(IDS, rooms(go(bare))[0].validate).failures.map((f) => f.requirement)).toEqual(["@Name"]);
  });
  it("review: rooms past the one changeset's cap wait as review rows — the walls and doors still go through", () => {
    const many = [...ROOMS.candidates, ...Array.from({ length: 195 }, (_, i) => ({ ...ROOMS.candidates.find((c) => c.cid === R(1)), cid: R(10 + i) }))];
    const p = go(many), waiting = p.storeys[0].exceptions.filter((x) => x.reason.startsWith("over the 200 elements"));
    expect([els(p).length, waiting.length, els(p).filter((e) => e.kind !== "room").length]).toEqual([200, 1 + 5 + 2 + 197 - 200, 8]);
    expect(waiting.every((x) => !p.storeys[0].byCid.has(x.unique_id))).toBe(true);
  });
});
