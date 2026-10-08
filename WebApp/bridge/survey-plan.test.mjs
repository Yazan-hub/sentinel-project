// MA-4d — the pure half of proposing from a survey job, on the drill's own job-0002 result (fixtures/survey/job-0002-result.json: the synthetic
// two-storey building, walls 300/200/300/250 mm) and the real typer over the BDS layer-free guideline and catalogue.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { validateChangeset } from "./changesets-logic.mjs";
import { typeGapId } from "./holding-logic.mjs";
import { readProposeBody, toModel, matchStoreys, trimEnds, planSurvey } from "./survey-plan.mjs";

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
    no(() => readProposeBody({ frame: { ...ZERO, dx_mm: 2e7 } }, LEVELS), 400, "frame.dx_mm must be a number of mm within ±10000000 (a scan in a national grid is read with its CRS from MA-4g) — nothing was saved");
    no(() => readProposeBody({ frame: { ...ZERO, dy_mm: "0" } }, LEVELS), 400, "frame.dy_mm must be a number of mm within ±10000000 (a scan in a national grid is read with its CRS from MA-4g) — nothing was saved");
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
