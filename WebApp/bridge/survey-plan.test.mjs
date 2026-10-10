// MA-4d — the pure half of proposing from a survey job, on the drill's own job-0002 result (fixtures/survey/job-0002-result.json: the synthetic
// two-storey building, walls 300/200/300/250 mm) and the real typer over the BDS layer-free guideline and catalogue.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { validateChangeset } from "./changesets-logic.mjs";
import { typeGapId, typeGapGroups } from "./holding-logic.mjs";
import { readProposeBody, toModel, matchStoreys, trimEnds, planSurvey, toScan, facesOf, measurePlan, judge, measureRefusal, countWords, readMesh, meshFaces, REVIT, FILED, scanBand, cloudRefusal, placeRefusal } from "./survey-plan.mjs";
import { boxMesh } from "./fixtures/box-mesh.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const RESULT = read("./fixtures/survey/job-0002-result.json");
const type = makeTyper({
  guideline: { body: read("../../demo/bds-pilot/bds-dd-layerfree-guideline.json"), label: "guideline@1 · project · 0123456789ab…", sha256: "ab".repeat(32) },
  catalog: { body: read("../../demo/bds-pilot/bds-type-catalog.json"), label: "type_catalog@1 · project · fedcba987654…", sha256: "cd".repeat(32) } }, core);
const JOB = { id: "job-0002", ledger: { id: 2201, hash: "13".repeat(32) }, reader: "sentinel-survey", version: "0.1.0" };
const ZERO = { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 }, EAST = { ...ZERO, dx_mm: 40000 };
const LEVELS = ["scan-L00-level", "scan-L01-level"];
const LV = RESULT.candidates.filter((c) => c.kind === "level");
const no = (fn, status, message) => { try { fn(); } catch (e) { expect([e.status, e.message]).toEqual([status, message]); return; } throw new Error("no throw"); };

describe("readProposeBody — the lead states two things; the bridge builds the rest", () => {
  it("a frame of four numbers and the levels the lead names, trimmed", () => {
    expect(readProposeBody({ frame: EAST, levels: { "scan-L00-level": " GR-FFL " } }, LEVELS)).toEqual({ frame: EAST, levels: { "scan-L00-level": "GR-FFL" } });
    expect(readProposeBody({ frame: ZERO }, LEVELS)).toEqual({ frame: ZERO, levels: {} });
  });
  it("anything else is refused in words, never dropped", () => {
    no(() => readProposeBody({ frame: ZERO, measured: {} }, LEVELS), 400, "measured is not a proposal field — the bridge builds every changeset from the job's own result; send {frame, levels?} — nothing was saved");
    no(() => readProposeBody({}, LEVELS), 400, "frame is required — where the scan sits in the model: {dx_mm, dy_mm, dz_mm, rotation_deg}, the move and turn from the model's internal origin to the scan's origin ({0, 0, 0, 0} when the scan is registered to the internal origin) — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, scale: 1 } }, LEVELS), 400, "frame.scale is not read — a frame is {dx_mm, dy_mm, dz_mm, rotation_deg} — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, dx_mm: 3e10 } }, LEVELS), 400, "frame.dx_mm must be a number of mm within ±20000000000 (where the frame puts the scan is checked when it is proposed) — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, dy_mm: "0" } }, LEVELS), 400, "frame.dy_mm must be a number of mm within ±20000000000 (where the frame puts the scan is checked when it is proposed) — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, rotation_deg: 360 } }, LEVELS), 400, "frame.rotation_deg must be degrees from 0 up to (not including) 360, anticlockwise in plan — nothing was saved");
    no(() => readProposeBody({ frame: ZERO, levels: { "scan-L09-level": "L09" } }, LEVELS), 400, "levels names scan-L09-level, which is not a storey of this job (scan-L00-level, scan-L01-level) — nothing was saved");
    no(() => readProposeBody({ frame: ZERO, levels: { "scan-L00-level": "GR:FFL" } }, LEVELS), 400, "levels.scan-L00-level must be a Revit level's name — one line of at most 256 characters, without \\ : { } [ ] | ; < > ? ` ~ — nothing was saved");
    no(() => readProposeBody({ frame: ZERO, levels: { "scan-L00-level": "GR-FFL", "scan-L01-level": "gr-ffl" } }, LEVELS), 400, "levels names gr-ffl for both scan-L00-level and scan-L01-level — a level is one storey — nothing was saved");
  });
});

describe("toModel — turned anticlockwise about the scan's origin, then moved; 0.1 mm", () => {
  it("zeros are the identity; 90° and a move", () => {
    expect([toModel(ZERO).xy([125, 150]), toModel(ZERO).z(3000)]).toEqual([[125, 150], 3000]);
    const m = toModel({ dx_mm: 1000, dy_mm: 2000, dz_mm: -50, rotation_deg: 90 });
    expect([m.xy([125, 150]), m.z(3000)]).toEqual([[850, 2125], 2950]);
  });
});

describe("matchStoreys — the lead's level, else one published level within 20 mm, else a new one", () => {
  const PUB = [{ name: "GR-FFL", elevation_mm: 0, from: "ARC.ifc P01" }, { name: "01-FFL", elevation_mm: 3012, from: "ARC.ifc P01" }];
  it("named (checked only when a published model holds it), matched, created — lowest first", () => {
    expect(matchStoreys(LV, ZERO, { "scan-L00-level": "GR-FFL" }, [], "job-0002")).toEqual([
      { cid: "scan-L00-level", scan_mm: 0, level: "GR-FFL", how: "named", elevation_mm: 0, delta_mm: null, checked: false, from: null },
      { cid: "scan-L01-level", scan_mm: 3000, level: "Scan L01 job-0002", how: "created", elevation_mm: 3000, delta_mm: 0, checked: true, from: null }]);
    expect(matchStoreys(LV, ZERO, {}, PUB, "job-0002").map((s) => [s.level, s.how, s.delta_mm, s.checked])).toEqual([["GR-FFL", "matched", 0, true], ["01-FFL", "matched", 12, true]]);
    expect(matchStoreys(LV, ZERO, { "scan-L01-level": "01-FFL" }, PUB, "job-0002")[1]).toMatchObject({ level: "01-FFL", how: "named", elevation_mm: 3012, delta_mm: 12, checked: true });
    expect(matchStoreys(LV, { ...ZERO, dz_mm: 3300 }, {}, PUB, "job-0002").map((s) => [s.level, s.elevation_mm])).toEqual([["Scan L00 job-0002", 3300], ["Scan L01 job-0002", 6300]]);
  });
  it("refused in words: a named level too far, two published levels at one height, two storeys on one level", () => {
    no(() => matchStoreys(LV, ZERO, { "scan-L01-level": "01-FFL" }, [{ name: "01-FFL", elevation_mm: 3300, from: "ARC.ifc P01" }], "job-0002"), 400,
      "01-FFL is at 3300 mm in ARC.ifc P01 and the scan's storey scan-L01-level at 3000 mm in the model's frame — 300 mm apart, more than the 20 mm a match allows (D7); name the level at that height, or leave the storey out of levels to have it created — nothing was saved");
    no(() => matchStoreys(LV, ZERO, {}, [{ name: "L00", elevation_mm: 5, from: "ARC.ifc" }, { name: "B00", elevation_mm: -10, from: "STR.ifc" }], "job-0002"), 400,
      "the published models have L00 and B00 within 20 mm of the scan's storey scan-L00-level (0 mm in the model's frame) — name one in levels — nothing was saved");
    no(() => matchStoreys(LV, ZERO, { "scan-L01-level": "Scan L00 job-0002" }, [], "job-0002"), 400,
      "the storeys scan-L00-level and scan-L01-level would both be Scan L00 job-0002 — name each in levels — nothing was saved");
  });
  it("decision 19: a storey this job filed keeps its level (never created twice); naming another for it is refused", () => {
    const FILED = new Map([["scan-L01-level", { cid: "scan-L01-level", level: "Scan L01 job-0002", how: "created", elevation_mm: 3000, delta_mm: 0, checked: true, from: null }]]);
    expect(matchStoreys(LV, ZERO, {}, [], "job-0002", FILED)[1]).toEqual({ cid: "scan-L01-level", scan_mm: 3000, level: "Scan L01 job-0002", how: "filed", elevation_mm: 3000, delta_mm: 0, checked: true, from: null });
    no(() => matchStoreys(LV, ZERO, { "scan-L01-level": "01-FFL" }, [], "job-0002", FILED), 400,
      "scan-L01-level was filed on Scan L01 job-0002 — leave it out of levels, or run the survey again to propose it afresh — nothing was saved");
  });
});

describe("trimEnds — every end to where the centrelines meet", () => {
  const S = (x0, y0, x1, y1, width) => ({ start: [x0, y0, 0], end: [x1, y1, 0], width });
  it("the drill's L00 corners (the survey's centrelines run face a's full length)", () => {
    const walls = RESULT.candidates.filter((c) => c.kind === "wall" && c.geometry.storey === "scan-L00-level")
      .map((c) => ({ start: c.geometry.LocationCurve.start, end: c.geometry.LocationCurve.end, width: c.measured.thickness_mm }));
    expect(trimEnds(walls)).toEqual([ // `to`: the wall each end was trimmed to (an index into walls), so a reason can name a gap's
      { start: [125, 150, 0], end: [7850, 150, 0], trim_mm: [-140, -136], to: [3, 2] }, { start: [125, 5900, 0], end: [7850, 5900, 0], trim_mm: [-139, -137], to: [3, 2] },
      { start: [7850, 150, 0], end: [7850, 5900, 0], trim_mm: [-99, -97], to: [0, 1] }, { start: [125, 150, 0], end: [125, 5900, 0], trim_mm: [-85, -89], to: [0, 1] }]);
  });
  it("a T: an end short of a wall is lengthened to its centreline; a free end, a parallel wall and a wall of one face seen are left as measured", () => {
    const t = trimEnds([S(0, 0, 5000, 0, 200), S(5100, -2000, 5100, 3000, 0), S(0, 300, 5000, 300, 200), S(2500, 450, 2500, 4000, 100)]);
    expect(t.map((w) => [w.trim_mm, w.to])).toEqual([[[0, 0], [null, null]], [[0, 0], [null, null]], [[0, 0], [null, null]], [[150, 0], [2, null]]]);
    expect(t[3].start).toEqual([2500, 300, 0]);
  });
});

describe("planSurvey — the drill's job-0002, frame 40 m east, L00 named GR-FFL (no published IFC)", () => {
  const plan = () => planSurvey({ job: JOB, candidates: RESULT.candidates, frame: EAST, levels: { "scan-L00-level": "GR-FFL" }, manifest: [], type });
  it("one body per storey: GR-FFL's three typed walls, unchecked (nothing pre-ticked); L01's new level and three walls, pre-ticked", () => {
    const p = plan();
    const [a, b] = p.storeys;
    expect(a.body.name).toBe("Survey job-0002 · GR-FFL");
    expect(a.body.elements.map((e) => [e.cid, e.kind, e.facts?.thickness_mm, e.place.LocationCurve])).toEqual([
      ["scan-L00-wall-1", "wall", 300, { start: [40125, 150, 0], end: [47850, 150, 0] }],
      ["scan-L00-wall-2", "wall", 200, { start: [40125, 5900, 0], end: [47850, 5900, 0] }],
      ["scan-L00-wall-3", "wall", 300, { start: [47850, 150, 0], end: [47850, 5900, 0] }]]);
    expect(a.body.elements[0]).toMatchObject({ op: "create", facts: { params: { Location: "Exterior" } }, place: { LevelName: "GR-FFL", TopElevation: 2800 },
      reason: "scan wall scan-L00-wall-1: 300 mm thick, 2800 mm high, 8001 mm long as measured · fit 2 mm rms · Location Exterior · ends -140 / -136 mm to the corners (the start to scan-L00-wall-4's centreline: a type gap, not placed) · job-0002 (ledger #2201)" });
    expect(a.body.elements[2].reason).toContain(" · ends -99 / -97 mm to the corners · "); // wall-3 meets two placed walls: nothing to say
    expect([...a.byCid.values()].map((t) => [t.pretick, t.accuracy.status])).toEqual(Array(3).fill([false, "within_tolerance"]));
    expect(a.body.exceptions.map((x) => x.unique_id)).toEqual(["scan-L00-wall-4", "scan-L00-floor", "scan-L00-ceiling"]);
    expect(a.body.exceptions[0].reason).toBe("type gap — BDS_EXT_ARC_CMU_250 mm is not in the type catalogue; it waits in the Holding Area");
    expect(b.body.name).toBe("Survey job-0002 · Scan L01 job-0002");
    expect(b.body.elements[0]).toEqual({ op: "create", kind: "level", cid: "scan-L01-level", evidence: ["ev-0001#floor-L01"],
      validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: "Scan L01 job-0002" } }, place: { BaseElevation: 3000, Name: "Scan L01 job-0002" },
      reason: "scan storey scan-L01-level at 3000 mm (fit 3.4 mm rms) · a new level at 3000 mm in the model · job-0002 (ledger #2201)" });
    expect(b.body.elements.map((e) => e.cid)).toEqual(["scan-L01-level", "scan-L01-wall-1", "scan-L01-wall-2", "scan-L01-wall-4"]);
    expect([...b.byCid.values()].every((t) => t.pretick)).toBe(true);
    expect(b.byCid.get("scan-L01-wall-1")).toMatchObject({ measured: { thickness_mm: 300 }, trim_mm: [-148, -130],
      accuracy: { status: "within_tolerance", basis: "fit", from_job: "job-0002", fit_rmse_mm: 1.8, face_dev_mm: 0, coverage: 1, target_mm: 20 } });
    expect(b.byCid.get("scan-L01-level").accuracy.face_dev_mm).toBeNull();
  });
  it("the 20 mm: a fit over it, no fit, or a face turned 3° off the ghost (each face on its own line within 2 mm) is never pre-ticked", () => {
    // pair() accepts faces up to 5° apart and the fit is each face against its OWN line: face_dev_mm measures them against the ghost's faces.
    const off = RESULT.candidates.map((c) => (c.cid === "scan-L01-wall-1" ? { ...c, geometry: { ...c.geometry, faces: [c.geometry.faces[0], [253, 106, 7661, 494]] } }
      : c.cid === "scan-L01-wall-2" ? { ...c, fit: { ...c.fit, rmse_mm: 25 } } : c.cid === "scan-L01-wall-4" ? { ...c, fit: undefined } : c));
    const b = planSurvey({ job: JOB, candidates: off, frame: EAST, levels: { "scan-L00-level": "GR-FFL" }, manifest: [], type }).storeys[1].byCid;
    expect(["scan-L01-wall-1", "scan-L01-wall-2", "scan-L01-wall-4"].map((cid) => { const t = b.get(cid); return [t.pretick, t.accuracy.status, t.accuracy.fit_rmse_mm, t.accuracy.face_dev_mm]; }))
      .toEqual([[false, "out_of_tolerance", 1.8, 194], [false, "out_of_tolerance", 25, 0], [false, "insufficient_data", null, 0]]);
    expect(b.get("scan-L01-level").pretick).toBe(true);
  });
  it("every body is a changeset the bridge stores as it is (validateChangeset, the same typer)", () => {
    for (const s of plan().storeys) {
      const v = validateChangeset(s.body, { member: true, type });
      expect([v.elements.length, v.ignored]).toEqual([s.body.elements.length, []]); // no place key the bridge built is dropped (final review)
    }
  });
  it("floors and ceilings, when the office types them: the loop at the level, the ceiling's Offset its measured height above its level", () => {
    const all = () => ({}); // a typer that types every candidate (the BDS standards leave floors and ceilings as gaps)
    const at = (p, i, cid) => p.storeys[i].body.elements.find((e) => e.cid === cid).place;
    const up = planSurvey({ job: JOB, candidates: RESULT.candidates, frame: { ...ZERO, dx_mm: 1000, dz_mm: 100 }, levels: {}, manifest: [], type: all });
    expect(at(up, 0, "scan-L00-floor").LocationLoop[0]).toEqual([8658, 342, 100]);
    expect(at(up, 0, "scan-L00-ceiling")).toMatchObject({ LevelName: "Scan L00 job-0002", Offset: 2800 });
    const pub = planSurvey({ job: JOB, candidates: RESULT.candidates, frame: { ...ZERO, dx_mm: 1000 }, levels: {},
      manifest: [{ name: "01-FFL", elevation_mm: 3012, from: "ARC.ifc P01" }], type: all });
    expect(at(pub, 1, "scan-L01-ceiling")).toMatchObject({ LevelName: "01-FFL", Offset: 2788 });
  });
  it("the gaps: the 250 mm walls want a type the catalogue lacks; scan floors and ceilings have no office rule — one group each, with the evidence", () => {
    const want = { category: "Walls", want: "BDS_EXT_ARC_CMU_250 mm", size: "250 mm" };
    expect(plan().groups).toEqual([
      { id: typeGapId(want), ...want, key: "Location Exterior, 250 mm", elements: 2, labels: ["GR-FFL · scan-L00-wall-4", "Scan L01 job-0002 · scan-L01-wall-3"],
        nearest: ["BDS_EXT_ARC_CMU_100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_400 mm"], evidence: ["ev-0001#slice-L00", "ev-0001#slice-L01"] },
      { id: typeGapId({ category: "Floors", size: "thickness not measured" }), category: "Floors", want: null, size: "thickness not measured", key: "no facts", elements: 2,
        labels: ["GR-FFL · scan-L00-floor", "Scan L01 job-0002 · scan-L01-floor"], nearest: [], evidence: ["ev-0001#floor-L00", "ev-0001#floor-L01"] },
      { id: typeGapId({ category: "Ceilings", size: "thickness not measured" }), category: "Ceilings", want: null, size: "thickness not measured", key: "no facts", elements: 2,
        labels: ["GR-FFL · scan-L00-ceiling", "Scan L01 job-0002 · scan-L01-ceiling"], nearest: [], evidence: ["ev-0001#ceiling-L00", "ev-0001#ceiling-L01"] }]);
  });
  it("deterministic; a turned frame and a published GR-FFL: the storey matched and pre-ticked", () => {
    expect(JSON.stringify(plan(), (k, v) => (v instanceof Map ? [...v] : v))).toBe(JSON.stringify(plan(), (k, v) => (v instanceof Map ? [...v] : v)));
    const p = planSurvey({ job: JOB, candidates: RESULT.candidates, frame: { dx_mm: 1000, dy_mm: 2000, dz_mm: 0, rotation_deg: 90 }, levels: {},
      manifest: [{ name: "GR-FFL", elevation_mm: 0, from: "ARC.ifc P01" }], type });
    expect(p.storeys[0].storey).toMatchObject({ level: "GR-FFL", how: "matched", checked: true, from: "ARC.ifc P01" });
    expect(p.storeys[0].body.elements[0].place.LocationCurve).toEqual({ start: [850, 2125, 0], end: [850, 9850, 0] });
    expect([...p.storeys[0].byCid.values()].every((t) => t.pretick)).toBe(true);
  });
  it("a wall of one face seen is a gap without typing; a storey of only gaps files nothing (its level is not created)", () => {
    const one = RESULT.candidates.map((c) => (c.cid === "scan-L00-wall-1" ? { ...c, measured: { length_mm: 8001, height_mm: 2800 } } : c));
    const p = planSurvey({ job: JOB, candidates: one, frame: ZERO, levels: {}, manifest: [], type });
    expect(p.groups.find((g) => g.labels.includes("Scan L00 job-0002 · scan-L00-wall-1"))).toMatchObject({ category: "Walls", want: null, size: "thickness not measured", key: "one face seen" });
    // the typer was never asked: the words name the missing thickness, not a missing rule (final review)
    expect(p.storeys[0].exceptions.find((x) => x.unique_id === "scan-L00-wall-1").reason).toBe("type gap — its thickness was not measured (one face seen); it waits in the Holding Area");
    const bare = RESULT.candidates.filter((c) => c.kind === "level" || c.kind === "floor");
    expect(planSurvey({ job: JOB, candidates: bare, frame: ZERO, levels: {}, manifest: [], type }).storeys.map((s) => s.body)).toEqual([null, null]);
  });
});

describe("MA-5a — a scan door or window: after its storey's walls, on its host's trimmed line, typed by size from the catalogue or a gap", () => {
  // sentinel-survey 0.5.0's candidates on the drill's building: a 900 x 2100 door in the south wall (x 3000..3900), a 1200 x 1200 window
  // with a 900 mm sill in the east wall (y 2000..3200); along_mm from each host's UNTRIMMED LocationCurve.start.
  const DOOR = { cid: "scan-L00-wall-1-door-1", kind: "door", geometry: { host: "scan-L00-wall-1", storey: "scan-L00-level", direction: [1, 0], Location: [3450, 150, 0], along_mm: 3465 },
    measured: { width_mm: 900, height_mm: 2100, sill_mm: 0, head_mm: 2100 }, evidence: ["ev-0001#slice-L00"], fit: { inliers: 56, rmse_mm: 0, coverage: 0.875, faces_seen: 2 } };
  const WINDOW = { cid: "scan-L00-wall-3-window-1", kind: "window", geometry: { host: "scan-L00-wall-3", storey: "scan-L00-level", direction: [0, 1], Location: [7850, 2600, 0], along_mm: 2549 },
    measured: { width_mm: 1200, height_mm: 1200, sill_mm: 900, head_mm: 2100 }, evidence: ["ev-0001#slice-L00"], fit: { inliers: 48, rmse_mm: 0, coverage: 1, faces_seen: 2 } };
  // The size fixture: one door and one window at the building's sizes. The walls are still typed by the BDS standards (`type`).
  const SIZE = { types: [{ category: "Doors", family: "BDS_INT_1 PNL", type: "BDS_INT_1 PNL_WOOD_900 x 2100 mm" }, { category: "Windows", family: "BDS_Window_1 Panel+FX", type: "1200x1200 mm" }],
    label: "type_catalog@2 · project · 5a5a5a5a5a5a…", sha256: "5a".repeat(32) };
  const BDS = { types: read("../../demo/bds-pilot/bds-type-catalog.json").types, label: "type_catalog@1 · project · fedcba987654…", sha256: "cd".repeat(32) };
  const plan = (openings, catalog = SIZE, over = {}) => planSurvey({ job: JOB, candidates: [...RESULT.candidates, ...openings], frame: EAST, levels: { "scan-L00-level": "GR-FFL" },
    manifest: [], type, catalog, sameCategory: core.sameCategory, ...over });
  const off = (p, { start, end }) => Math.abs((end[0] - start[0]) * (p[1] - start[1]) - (end[1] - start[1]) * (p[0] - start[0])) / Math.hypot(end[0] - start[0], end[1] - start[1]);

  it("typed by size: after the walls, on the host's trimmed line at the level, a window's sill; the trust record says bridge-size, framing, never pre-ticked", () => {
    const a = plan([DOOR, WINDOW]).storeys[0];
    const els = a.body.elements, at = (cid) => els.find((e) => e.cid === cid);
    expect(els.map((e) => e.cid)).toEqual(["scan-L00-wall-1", "scan-L00-wall-2", "scan-L00-wall-3", "scan-L00-wall-1-door-1", "scan-L00-wall-3-window-1"]);
    // along_mm 3465 from the south wall's UNTRIMMED start (-15, 150): x 3450 — on its trimmed line too, which lies on the untrimmed one
    expect(off(at(DOOR.cid).place.Location, at("scan-L00-wall-1").place.LocationCurve)).toBeLessThanOrEqual(0.1);
    expect(off(at(WINDOW.cid).place.Location, at("scan-L00-wall-3").place.LocationCurve)).toBeLessThanOrEqual(0.1);
    expect(at(DOOR.cid)).toEqual({ op: "create", kind: "door", cid: DOOR.cid, evidence: ["ev-0001#slice-L00"], facts: { params: { HostFunction: "Exterior", Size: "W900 x H2100 mm" } },
      validate: { identity: { Class: "IFCDOOR", Name: DOOR.cid } },
      place: { LevelName: "GR-FFL", Location: [43450, 150, 0], FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_900 x 2100 mm" },
      reason: "scan door scan-L00-wall-1-door-1 in scan-L00-wall-1: 900 wide, 2100 high mm as measured (900 x 2100 mm nominal) · hole border 0.875 (2 face(s) seen; a hole is an opening or an occluder) · typed by size from the catalogue: BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_900 x 2100 mm · sill and head not scored against a reference (MA-5a) · job-0002 (ledger #2201)" });
    expect(at(WINDOW.cid).place).toEqual({ LevelName: "GR-FFL", Location: [47850, 2600, 0], FamilyName: "BDS_Window_1 Panel+FX", TypeName: "1200x1200 mm", SillHeight: 900 });
    expect(at(WINDOW.cid).reason).toContain("scan window scan-L00-wall-3-window-1 in scan-L00-wall-3: 1200 wide, 1200 high, sill 900 mm as measured (1200 x 1200 mm nominal) · ");
    const typing = (t, family, size) => ({ typed_by: "bridge-size", type: t, family, size, band_mm: 100, catalog: SIZE.label, catalog_sha256: SIZE.sha256 });
    expect(a.byCid.get(DOOR.cid)).toEqual({ measured: DOOR.measured, pretick: false, typing: typing("BDS_INT_1 PNL_WOOD_900 x 2100 mm", "BDS_INT_1 PNL", "900 x 2100 mm"),
      accuracy: { status: "insufficient_data", basis: "framing", from_job: "job-0002", fit_rmse_mm: null, face_dev_mm: null, coverage: 0.875, target_mm: 20 } }); // decision 10: no fit of its own
    // 2.4: the stored element keeps the planner's typing — never "caller" — and its trust record
    const v = validateChangeset(a.body, { member: true, type, job: { record: { id: "job-0002" }, byCid: a.byCid } });
    expect(v.ignored).toEqual([]);
    expect(v.elements.slice(3).map((e) => [e.cid, e.typing, e.pretick, e.accuracy.basis, e.measured])).toEqual([
      [DOOR.cid, typing("BDS_INT_1 PNL_WOOD_900 x 2100 mm", "BDS_INT_1 PNL", "900 x 2100 mm"), false, "framing", DOOR.measured],
      [WINDOW.cid, typing("1200x1200 mm", "BDS_Window_1 Panel+FX", "1200 x 1200 mm"), false, "framing", WINDOW.measured]]);
  });
  it("an office rule that types it wins over the size; the size is named to the nearest 100 mm, the measured mm stay in the reason", () => {
    const all = () => ({});
    const at = (w, h) => plan([{ ...DOOR, measured: { ...DOOR.measured, width_mm: w, height_mm: h } }], SIZE, { type: all }).storeys[0].body.elements.find((e) => e.cid === DOOR.cid);
    const el = at(940, 2080);
    expect([el.place.TypeName, el.facts.params.Size]).toEqual([undefined, "W900 x H2100 mm"]);
    expect(el.reason).toContain(": 940 wide, 2080 high mm as measured (900 x 2100 mm nominal) · ");
    expect(el.reason).toContain(" · typed by an office rule · ");
    expect(at(1040, 2130).facts.params.Size).toBe("W1000 x H2100 mm"); // a scan's +-50 mm an edge lands on the office's nominal size
  });
  it("several rows at the size: a gap naming them, cut at 500 characters, open until a person picks; none: a gap the Holding Area closes as proposing again would type it", () => {
    const p = plan([{ ...DOOR, measured: { ...DOOR.measured, width_mm: 1000 } }, WINDOW], BDS);
    const door = p.groups.find((g) => g.category === "Doors"), win = p.groups.find((g) => g.category === "Windows");
    expect(door).toMatchObject({ want: null, size: "1000 x 2100 mm", labels: ["GR-FFL · scan-L00-wall-1-door-1"], evidence: ["ev-0001#slice-L00"] });
    expect(door.key).toBe("13 Doors types are named within 100 mm of 1000 x 2100 mm: BDS_EXT_1 PNL : BDS_EXT_1 PNL_GLASS_1000 x 2100 mm, BDS_EXT_1 PNL : BDS_EXT_1 PNL_GLASS_SWING_1000 x 2100 mm, " +
      "BDS_EXT_1 PNL : BDS_EXT_1 PNL_STEEL_1000 x 2100 mm, BDS_EXT_1 PNL : BDS_EXT_1 PNL_STEEL_SWING_1000 x 2100 mm, BDS_EXT_1 PNL : BDS_EXT_1 PNL_WOOD_1000 x 2100 mm, " +
      "BDS_EXT_1 PNL : BDS_EXT_1 PNL_WOOD_SWING_1000 x 2100 mm, BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_1000 x 2100 mm, BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_SWING_1000 x 2100 mm, BDS_");
    expect(door.key).toHaveLength(500);
    expect(p.storeys[0].exceptions.find((x) => x.unique_id === "scan-L00-wall-1-door-1").reason).toBe("type gap — 13 Doors types are named within 100 mm of 1000 x 2100 mm — a person picks one; it waits in the Holding Area");
    expect(win).toMatchObject({ want: null, size: "1200 x 1200 mm", key: "no Windows type is named within 100 mm of 1200 x 1200 mm" });
    expect(p.storeys[0].exceptions.find((x) => x.unique_id === WINDOW.cid).reason).toBe("type gap — no office rule types it (no Windows type is named within 100 mm of 1200 x 1200 mm); it waits in the Holding Area");
    expect(p.storeys[0].body.elements.map((e) => e.kind)).toEqual(["wall", "wall", "wall"]); // nothing placed for either
    // the Holding Area closes a survey group as proposing again would type it (holding-logic typeBySize, review): 13 rows close nothing — a
    // person picks; the office installing one type in the band closes it (catalogMatch reads both spellings)
    const row = (groups, claimed = false) => ({ id: 3003, at: "2026-10-10T10:00:00.000Z", actor: "web", action: "type_gap:run job-0002 · survey-planner · 1 group(s), 1 element(s)",
      new_value: { groups, ...(claimed ? {} : { job: { id: "job-0002" } }), claimed } });
    expect(typeGapGroups([row([door, win])], [], BDS, core.sameCategory)).toMatchObject({ open: [{ category: "Doors" }, { category: "Windows" }], closed: [] });
    expect(typeGapGroups([row([door, win])], [], SIZE, core.sameCategory).closed.map((g) => [g.category, g.closed_by, g.type])).toEqual([
      ["Doors", "catalogue", "BDS_INT_1 PNL_WOOD_900 x 2100 mm"], ["Windows", "catalogue", "1200x1200 mm"]]);
    // a scanned 980 x 2080 (nominal 1000 x 2100) closes by the 900 x 2100 the office installs, one row in the band; a Promote group at
    // that size waits for its exact size (D16)
    const odd = plan([{ ...DOOR, measured: { ...DOOR.measured, width_mm: 980, height_mm: 2080 } }], { types: [] }).groups.find((g) => g.category === "Doors");
    expect(odd).toMatchObject({ size: "1000 x 2100 mm", key: "no Doors type is named within 100 mm of 1000 x 2100 mm" });
    expect(typeGapGroups([row([odd])], [], SIZE, core.sameCategory).closed.map((g) => g.type)).toEqual(["BDS_INT_1 PNL_WOOD_900 x 2100 mm"]);
    expect(typeGapGroups([row([odd], true)], [], SIZE, core.sameCategory).open.map((g) => g.size)).toEqual(["1000 x 2100 mm"]);
  });
  it("a host that is a type gap holds its opening, in words, grouped by its size; a host not on the job is said too", () => {
    const onGap = { ...WINDOW, cid: "scan-L00-wall-4-window-1", geometry: { ...WINDOW.geometry, host: "scan-L00-wall-4", Location: [125, 2600, 0], along_mm: 2535 } };
    const lost = { ...DOOR, cid: "scan-L00-wall-9-door-1", geometry: { ...DOOR.geometry, host: "scan-L00-wall-9" } };
    const p = plan([onGap, lost]);
    const why = (cid) => p.storeys[0].exceptions.find((x) => x.unique_id === cid).reason;
    expect(why(onGap.cid)).toBe("type gap — its host wall scan-L00-wall-4 is a type gap; it is placed once the wall is; it waits in the Holding Area");
    expect(why(lost.cid)).toBe("type gap — its host wall scan-L00-wall-9 is not a wall of GR-FFL in job-0002; it waits in the Holding Area");
    expect(p.groups.find((g) => g.category === "Windows")).toMatchObject({ want: null, size: "1200 x 1200 mm", key: "host scan-L00-wall-4 is a type gap" });
    expect(p.groups.find((g) => g.category === "Doors")).toMatchObject({ want: null, size: "900 x 2100 mm", key: "host wall not on the job" });
  });
  it("decision 19: a host this job filed is not proposed again; its opening, not filed, is — the executor finds the host in the model", () => {
    const p = plan([DOOR], SIZE, { filed: { cids: new Set(["scan-L00-wall-1"]), storeys: new Map() } });
    expect(p.storeys[0].body.elements.map((e) => e.cid)).toEqual(["scan-L00-wall-2", "scan-L00-wall-3", "scan-L00-wall-1-door-1"]);
    expect(p.storeys[0].body.elements[2].place.Location).toEqual([43450, 150, 0]);
    expect(p.already_filed).toBe(1);
    expect(plan([DOOR], SIZE, { filed: { cids: new Set([DOOR.cid]), storeys: new Map() } }).already_filed).toBe(1); // the opening filed: not again
    // a filed host that is a type gap now (an office type withdrawn since) does not hold its opening: the wall is in the model or on the desk
    const onGap = { ...WINDOW, cid: "scan-L00-wall-4-window-1", geometry: { ...WINDOW.geometry, host: "scan-L00-wall-4", Location: [125, 2600, 0], along_mm: 2535 } };
    const q = plan([onGap], SIZE, { filed: { cids: new Set(["scan-L00-wall-4"]), storeys: new Map() } }).storeys[0];
    expect(q.body.elements.map((e) => [e.cid, e.place.Location ?? null])).toEqual([["scan-L00-wall-1", null], ["scan-L00-wall-2", null], ["scan-L00-wall-3", null], [onGap.cid, [40125, 2600, 0]]]);
    expect(q.exceptions.map((x) => x.unique_id)).toEqual(["scan-L00-floor", "scan-L00-ceiling"]); // the window is not one
  });
  it("an opening sits at its storey's level, not its candidate's z; a storey its openings push past 200 elements is refused", () => {
    // L01 matched to a published level 10 mm above the scan's floor: the door is placed at the level (3010), its candidate's z is 3000
    const up = { ...DOOR, cid: "scan-L01-wall-1-door-1", geometry: { ...DOOR.geometry, host: "scan-L01-wall-1", storey: "scan-L01-level", Location: [3450, 150, 3000], along_mm: 3473 } };
    const l01 = plan([up], SIZE, { manifest: [{ name: "01-FFL", elevation_mm: 3010, from: "ARC.ifc P01" }] }).storeys[1];
    expect([l01.storey.level, l01.body.elements.find((e) => e.cid === up.cid).place.Location]).toEqual(["01-FFL", [43450, 150, 3010]]);
    const many = Array.from({ length: 198 }, (_, i) => ({ ...DOOR, cid: `scan-L00-wall-1-door-${i + 1}` }));
    expect(() => plan(many)).toThrow(expect.objectContaining({ status: 413,
      message: "scan-L00-level would file 201 elements on GR-FFL — over the 200 one changeset (one Undo) holds; a storey is not split into changesets yet — survey a part of the building — nothing was saved" }));
  });
  it("an opening's point is range-checked with the rest; the plan is deterministic", () => {
    expect(placeRefusal([{ kind: "door", geometry: { Location: [40_000_000, 0, 0] } }], ZERO)).toBe("the frame puts the scan 40 km from the model's internal origin — Revit draws a model within 32 km of it; state where the scan sits in the model (with no turn, dx_mm -40000000 and dy_mm 0 bring its middle to the origin)");
    const json = (p) => JSON.stringify(p, (k, v) => (v instanceof Map ? [...v] : v));
    expect(json(plan([DOOR, WINDOW]))).toBe(json(plan([DOOR, WINDOW])));
  });
  it("measurePlan: a placed door or window is not measured — its host wall is", () => {
    const cs = { job: { frame: ZERO }, elements: [{ proposal_guid: "d", kind: "door", cid: DOOR.cid }, { proposal_guid: "w", kind: "window", cid: WINDOW.cid }],
      result: { applied: [{ proposal_guid: "d", revit_unique_id: "U-d" }, { proposal_guid: "w", revit_unique_id: "U-w" }] } };
    expect(measurePlan(cs).skip).toEqual([{ proposal_guid: "d", reason: "a door is not measured by sentinel-survey" }, { proposal_guid: "w", reason: "a window is not measured by sentinel-survey" }]);
  });
});

describe("MA-4h — a scan in a national grid: where the frame puts it is checked, not how far it moves it", () => {
  // The drill's job-0002 moved by the Kladno scan's LAS offset (mm): S-JTSK, 1 287 km from its grid's origin.
  const K = [-763_960_000, -1_035_510_000];
  const mv = (p) => [p[0] + K[0], p[1] + K[1], ...p.slice(2)];
  const FAR = RESULT.candidates.map((c) => {
    const g = { ...c.geometry };
    if (g.LocationCurve) g.LocationCurve = { start: mv(g.LocationCurve.start), end: mv(g.LocationCurve.end) };
    if (g.LocationLoop) g.LocationLoop = g.LocationLoop.map(mv);
    if (g.Boundary) g.Boundary = g.Boundary.map(mv);
    if (g.faces) g.faces = g.faces.map(([a, b, c2, d]) => [a + K[0], b + K[1], c2 + K[0], d + K[1]]);
    return { ...c, geometry: g };
  });
  const at = (candidates, frame) => planSurvey({ job: JOB, candidates, frame, levels: { "scan-L00-level": "GR-FFL" }, manifest: [], type });

  it("a frame that moves the scan back from its grid is read", () => {
    expect(readProposeBody({ frame: { ...ZERO, dx_mm: 763974000, dy_mm: 1035484000, dz_mm: -409631 } }, LEVELS).frame)
      .toEqual({ dx_mm: 763974000, dy_mm: 1035484000, dz_mm: -409631, rotation_deg: 0 });
  });
  it("a frame that leaves it 1 287 km out is refused, naming the frame that brings it to the origin", () => {
    expect(placeRefusal(RESULT.candidates, EAST)).toBeNull();
    no(() => at(FAR, ZERO), 400, "the frame puts the scan 1287 km from the model's internal origin — Revit draws a model within 32 km of it; state where the scan sits in the model (with no turn, dx_mm 763956000 and dy_mm 1035507000 bring its middle to the origin, dz_mm 0 its lowest storey to 0) — nothing was saved");
  });
  it("the stated frame proposes exactly what the same building proposes at the origin", () => {
    const near = at(RESULT.candidates, EAST), far = at(FAR, { ...EAST, dx_mm: EAST.dx_mm - K[0], dy_mm: -K[1] });
    expect(far.storeys.map((s) => s.body)).toEqual(near.storeys.map((s) => s.body));
    expect(far.groups).toEqual(near.groups);
  });
});

describe("MA-4e — a placed wall as filed, back in the scan's frame; the bridge's verdict", () => {
  const ZERO = { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 0 }, F = { dx_mm: 40000, dy_mm: -2500, dz_mm: 150, rotation_deg: 30 };
  const W1 = { kind: "wall", facts: { thickness_mm: 300 }, place: { LocationCurve: { start: [40125, 150, 0], end: [47850, 150, 0] }, TopElevation: 2800 } };
  it("toScan undoes toModel (0.1 mm each way)", () => {
    const M = toModel(F), S = toScan(F);
    for (const p of [[0, 0], [8000, 6000], [-1234.5, 777]]) S.xy(M.xy(p)).forEach((v, k) => expect(Math.abs(v - p[k])).toBeLessThanOrEqual(0.2));
    expect(S.z(M.z(2800))).toBe(2800);
  });
  it("facesOf: GR-FFL's wall-1 as filed — two faces 150 mm each side of its line, base to top, out of the wall; why not, in words", () => {
    expect(facesOf(W1, toScan(ZERO))).toEqual({ faces: [[[125, 300, 0], [125, 300, 2800], [7850, 300, 0]], [[125, 0, 0], [7850, 0, 0], [125, 0, 2800]]] });
    expect(facesOf({ ...W1, facts: {} }, toScan(ZERO))).toEqual({ why: "its line, measured thickness or top is not on the changeset" });
    expect(facesOf({ ...W1, place: { ...W1.place, TopElevation: 0 } }, toScan(ZERO))).toEqual({ why: "its line is shorter than 1 mm, or its top not above its base" });
  });
  it("measurePlan: the walls Revit placed are sent; an Undo in Revit, a level and a floor are not, each with why; placed lists every applied ghost", () => {
    const wall = (g, end) => ({ proposal_guid: g, kind: "wall", cid: `c-${g}`, facts: { thickness_mm: 200 }, place: { LocationCurve: { start: [0, 0, 0], end }, TopElevation: 2800 } });
    const cs = { job: { frame: { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 } },
      elements: [wall("w", [5000, 0, 0]), wall("u", [0, 5000, 0]), { proposal_guid: "l", kind: "level", cid: "c-l" }, { proposal_guid: "f", kind: "floor", cid: "c-f" }, wall("r", [0, -5000, 0])],
      result: { applied: ["w", "u", "l", "f"].map((g) => ({ proposal_guid: g, revit_unique_id: `U-${g}` })), rejected: ["r"] } };
    const p = measurePlan(cs, (g) => (g === "u" ? 2211 : null));
    expect(p.send.map((s) => s.guid)).toEqual(["w"]);
    expect(p.skip).toEqual([
      { proposal_guid: "u", reason: "undone in Revit (ledger #2211) — nothing placed to measure" },
      { proposal_guid: "l", reason: "a level has no face to measure — its height was set when it was proposed" },
      { proposal_guid: "f", reason: "one face of a floor is seen; its other is its type's, which no scan measured, and the slab beyond would count against it" }]);
    expect(p.placed.map((x) => [x.proposal_guid, x.revit_unique_id, x.cid, x.kind])).toEqual([["w", "U-w", "c-w", "wall"], ["u", "U-u", "c-u", "wall"], ["l", "U-l", "c-l", "level"], ["f", "U-f", "c-f", "floor"]]);
  });
  it("judge: p95 against D7's 20 mm; missing, insufficient data and not measured in words — never a pass without points", () => {
    const K = { band_mm: 400, edge_mm: 200, cell_mm: 200 }, M = { points: 3512, p95_mm: 20, coverage: 0.999 };
    expect(judge(M, K)).toEqual({ status: "within_tolerance" });
    expect(judge({ ...M, p95_mm: 20.1 }, K)).toEqual({ status: "out_of_tolerance" });
    expect(judge({ ...M, coverage: 0.2 }, K)).toEqual({ status: "insufficient_data", reason: "20% of its faces seen — under the 25% a verdict needs" });
    expect(judge({ points: 1759, p95_mm: 253.2, coverage: 0.5 }, K)).toEqual({ status: "out_of_tolerance" }); // one face seen, 250 mm off (Base)
    expect(judge({ points: 0, p95_mm: null, coverage: 0 }, K)).toEqual({ status: "missing", reason: "no scan point within 400 mm of its faces — not built where it stands, or not scanned there" });
    expect(judge({ points: 0, p95_mm: null, coverage: null }, K)).toEqual({ status: "not_measured", reason: "no face interior to measure — each face is read 200 mm in from every edge" });
    expect(countWords({ within_tolerance: 3 })).toBe("3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured");
  });
  it("measureRefusal: one result per element sent, in order, the five numbers only and in range, its knobs on the receipt", () => {
    const send = [{ guid: "a" }], T = [50, 100, 200];
    const ok = { elements: [{ guid: "a", points: 3, p95_mm: 1, mean_signed_mm: 0, coverage: 1, share_within: { 50: 1, 100: 1, 200: 1 } }], receipt: { measure: { band_mm: 400, edge_mm: 200, cell_mm: 200 } } };
    const el = (o) => ({ ...ok, elements: [{ ...ok.elements[0], ...o }] });
    expect(measureRefusal(ok, send, T)).toBeNull();
    expect(measureRefusal(null, send, T)).toBe("receipt.measure");
    expect(measureRefusal({ ...ok, elements: [] }, send, T)).toBe("not one result per element sent");
    expect([measureRefusal(el({ guid: "b" }), send, T), measureRefusal(el({ points: -1 }), send, T), measureRefusal(el({ p95_mm: "3" }), send, T), measureRefusal(el({ share_within: { 50: 1 } }), send, T)])
      .toEqual(["elements[0].guid", "elements[0].points", "elements[0]'s numbers", "elements[0].share_within"]);
    // Rule 3: a service that sends its own verdict is refused, never merged — p95 63 is never within tolerance.
    expect([measureRefusal(el({ status: "within_tolerance", p95_mm: 63 }), send, T), measureRefusal(el({ coverage: 5 }), send, T),
      measureRefusal(el({ p95_mm: -1 }), send, T), measureRefusal(el({ share_within: { 50: -1, 100: 1, 200: 1 } }), send, T)])
      .toEqual(["elements[0] carries status (the verdict is the bridge's)", "elements[0]'s numbers", "elements[0]'s numbers", "elements[0].share_within"]);
    // Final review: the knobs are exactly three numbers; the numbers agree with each other.
    const rc = (measure) => ({ ...ok, receipt: { measure } });
    expect([measureRefusal(rc({ band_mm: 400, edge_mm: 200 }), send, T), measureRefusal(rc({ band_mm: 400, edge_mm: 200, cell_mm: 200, verdict: "ok" }), send, T),
      measureRefusal(rc({ band_mm: 400, edge_mm: 200, cell_mm: "200" }), send, T)]).toEqual(["receipt.measure", "receipt.measure", "receipt.measure"]);
    const none = { points: 0, p95_mm: null, mean_signed_mm: null, share_within: null, coverage: 0 };
    expect(measureRefusal(el(none), send, T)).toBeNull();
    expect(measureRefusal(el({ ...none, coverage: null }), send, T)).toBeNull();
    expect([measureRefusal(el({ ...none, p95_mm: 3 }), send, T), measureRefusal(el({ ...none, coverage: 0.5 }), send, T),
      measureRefusal(el({ ...none, share_within: { 50: 1, 100: 1, 200: 1 } }), send, T), measureRefusal(el({ coverage: null }), send, T),
      measureRefusal(el({ mean_signed_mm: null }), send, T)]).toEqual(Array(5).fill("elements[0]'s numbers"));
  });
});

describe("MA-4f — Revit's re-read of a placed wall: read, then the two faces sentinel-survey measures", () => {
  const W = { kind: "wall", place: { LocationCurve: { start: [40125, 150, 0], end: [47850, 150, 0] }, TopElevation: 2800 }, facts: { thickness_mm: 300 } };
  const T = { ...W, place: { ...W.place, LocationCurve: { start: [47850, 150, 0], end: [47850, 5900, 0] } } };
  const I = toScan(ZERO); // facesOf in the model's own frame
  const box = boxMesh([40125, 150], [47850, 150], 300, 0, 2800);
  const flip = (m) => Array.from({ length: m.length / 9 }, (_, i) => [...m.slice(9 * i, 9 * i + 3), ...m.slice(9 * i + 6, 9 * i + 9), ...m.slice(9 * i + 3, 9 * i + 6)]).flat();

  it("readMesh: 1 to 64 triangles of 9 finite numbers within 1e9 mm — else what is wrong, in words", () => {
    expect(readMesh(box)).toBeNull();
    expect([readMesh([]), readMesh([1, 2, 3]), readMesh("x"), readMesh(Array(9 * 65).fill(1)), readMesh([1, 2, 3, NaN, 5, 6, 7, 8, 9]), readMesh([0, 0, 2e9, 0, 0, 0, 0, 0, 0])])
      .toEqual(["not a list of triangles (9 numbers each)", "not a list of triangles (9 numbers each)", "not a list of triangles (9 numbers each)",
        "65 triangles — over the 64 a wall's re-read holds", "number 3 is not a coordinate in mm", "number 2 is not a coordinate in mm"]);
  });
  it("meshFaces: a box on the filed line is facesOf's two faces, whatever its winding and its line's direction; a wider type moves each face out by half the difference", () => {
    expect(meshFaces(W, box)).toEqual(facesOf(W, I));
    expect(meshFaces(W, flip(box))).toEqual(facesOf(W, I));
    expect(meshFaces(T, boxMesh([47850, 150], [47850, 5900], 300, 0, 2800))).toEqual(facesOf(T, I));
    expect(meshFaces(W, boxMesh([40125, 150], [47850, 150], 350, 0, 2800)).faces.map((f) => f[0][1])).toEqual([325, -25]);
  });
  it("meshFaces: each side keeps its own ends (Revit's joins); a solid it cannot reduce says why", () => {
    // the left face runs 150 mm past each end (an outside corner), the right one stops 150 mm short (an inside corner)
    const joined = [...boxMesh([39975, 150], [48000, 150], 300, 0, 2800).slice(0, 18), ...boxMesh([40275, 150], [47700, 150], 300, 0, 2800).slice(36, 54)];
    expect(meshFaces(W, joined)).toEqual({ faces: [[[39975, 300, 0], [39975, 300, 2800], [48000, 300, 0]], [[40275, 0, 0], [47700, 0, 0], [40275, 0, 2800]]] });
    expect(meshFaces(W, box.slice(90))).toEqual({ why: "Revit's solid has no face along its filed line" });   // the top only
    expect(meshFaces(W, box.slice(0, 18))).toEqual({ why: "Revit's solid has one side along its filed line" }); // the left side only
    expect(meshFaces(W, [...boxMesh([40125, 150], [47850, 150], 300, 0, 1400), ...boxMesh([40125, 150], [47850, 150], 400, 1400, 2800)]))
      .toEqual({ why: "its left side is not one plane (50 mm deep: a sweep, a reveal or a turn)" });
    expect(meshFaces({ ...W, place: {} }, box)).toEqual({ why: "its line, measured thickness or top is not on the changeset" });
    expect(meshFaces({ ...W, facts: {} }, box)).toEqual({ why: "its line, measured thickness or top is not on the changeset" });
    expect(meshFaces({ ...W, place: { ...W.place, TopElevation: 0 } }, box)).toEqual({ why: "its line is shorter than 1 mm, or its top not above its base" });
    // Final review: a side under 1 mm along — sentinel-survey would refuse its face (both sides at least 1 mm) and fail every measure
    expect(meshFaces({ ...W, place: { ...W.place, LocationCurve: { start: [43000, 150, 0], end: [43300, 150, 0] } } }, boxMesh([43125, 150], [43125.4, 150], 300, 0, 2800)))
      .toEqual({ why: "its left side is under 1 mm across" });
  });
  it("meshFaces: the claim is held to the filed wall — a solid off its line, past its ends or off its height is measured as filed", () => {
    // 2 000 mm off the line: both side planes are parallel to it and one plane each, so only the bound refuses them (offsets 2 150 and 1 850, the bound 450)
    expect(meshFaces(W, boxMesh([40125, 2150], [47850, 2150], 300, 0, 2800))).toEqual({ why: "Revit's re-read is 1700 mm off its filed wall — measured as filed" });
    expect(meshFaces(W, boxMesh([40125, 150], [97850, 150], 300, 0, 2800))).toEqual({ why: "Revit's re-read is 49600 mm off its filed wall — measured as filed" }); // 50 m on
    expect(meshFaces(W, boxMesh([40125, 150], [47850, 150], 300, 3000, 5800))).toEqual({ why: "Revit's re-read is 2900 mm off its filed wall — measured as filed" }); // a storey up
    // Final review: short of them too — a 1 m × 1 m patch the claim chose is not the wall (its ends 2 875 and 3 850 mm in, the bound 400)
    expect(meshFaces(W, boxMesh([43000, 150], [44000, 150], 300, 1000, 2000))).toEqual({ why: "Revit's re-read is 3450 mm off its filed wall — measured as filed" });
    // the bounds' own edges are kept: the location line at a finish face (each side 0 and 300 off) and joins a thickness and 100 mm past each end
    expect(meshFaces(W, boxMesh([40125, 300], [47850, 300], 300, 0, 2800)).faces).toBeDefined();
    expect(meshFaces(W, boxMesh([39725, 150], [48250, 150], 300, -100, 2900)).faces).toBeDefined();
    expect(meshFaces(W, boxMesh([40525, 150], [47450, 150], 300, 100, 2700)).faces).toBeDefined(); // a thickness and 100 mm in, 100 mm under the top
  });
  it("measurePlan: a wall Revit re-read is sent by its re-read, in the scan's frame, and says so; one without — or one the bridge could not reduce — as filed", () => {
    const S = toScan(EAST);
    const rr = { mesh_sha256: "a".repeat(64), ...meshFaces(W, boxMesh([40125, 150], [47850, 150], 350, 0, 2800)) };
    const cs = { job: { frame: EAST }, elements: ["a", "b", "c"].map((g) => ({ ...W, proposal_guid: g })),
      result: { applied: [{ proposal_guid: "a", revit_unique_id: "U-a", reread: rr }, { proposal_guid: "b", revit_unique_id: "U-b" },
        { proposal_guid: "c", revit_unique_id: "U-c", reread: { mesh_sha256: "b".repeat(64), why: "Revit's solid has one side along its filed line" } }] } };
    const p = measurePlan(cs);
    expect(p.send).toEqual([{ guid: "a", faces: [[[125, 325, 0], [125, 325, 2800], [7850, 325, 0]], [[125, -25, 0], [7850, -25, 0], [125, -25, 2800]]] },
      { guid: "b", faces: facesOf(W, S).faces }, { guid: "c", faces: facesOf(W, S).faces }]);
    expect(p.placed.map((x) => [x.reference, x.mesh_sha256 ?? null])).toEqual([[REVIT, "a".repeat(64)], [FILED, null], [FILED, null]]);
  });
});

describe("MA-4f — the scan overlay's cut and its answer", () => {
  const w = (z0, top) => ({ kind: "wall", place: { LocationCurve: { start: [0, 0, z0], end: [1000, 0, z0] }, TopElevation: top } });
  it("scanBand: the walls' height less 300 mm at the floor and the ceiling; none without a wall", () => {
    expect(scanBand({ elements: [w(0, 2800), w(0, 3000), { kind: "level", place: { BaseElevation: 0 } }] })).toEqual([300, 2700]);
    expect([scanBand({ elements: [] }), scanBand({ elements: [w(0, 500)] })]).toEqual([null, null]);
  });
  it("cloudRefusal: at most the cap, three whole mm each, its receipt", () => {
    const ok = { points: [[1, 2, 3]], receipt: { cloud: { cell_mm: 100, of: 1 } } };
    expect(cloudRefusal(ok, 5000)).toBeNull();
    expect(cloudRefusal({ ...ok, points: [[-763960000, -1035510000, 409631]] }, 5000)).toBeNull(); // MA-4h: Kladno's national grid
    expect(cloudRefusal({ ...ok, points: [[3e10, 0, 0]] }, 5000)).toBe("a point is not three whole numbers of mm");
    expect([cloudRefusal({ ...ok, receipt: {} }, 5000), cloudRefusal({ ...ok, points: [[1, 2, 3], [4, 5, 6]] }, 1), cloudRefusal({ ...ok, points: [[1, 2]] }, 5000), cloudRefusal({ ...ok, points: [[1, 2, 3.5]] }, 5000)])
      .toEqual(["receipt.cloud", "not at most 1 points", "a point is not three whole numbers of mm", "a point is not three whole numbers of mm"]);
  });
});
