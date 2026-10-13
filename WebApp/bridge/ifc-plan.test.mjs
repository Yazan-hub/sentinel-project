// MA-6-8 — the pure half of proposing from an IFC job: the 6-7 fixture and the Revit 2024 CV2 export read by the real runIfc, typed by the real
// typer over the BDS survey guideline (Location rules, floors keyed on Function) and catalogue. MA-8-4: and the door, column, openings and curtain
// walls the 0.2.0 reader adds (a hand-made candidate is a clone of the CV2 export's with one thing changed).
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { validateChangeset } from "./changesets-logic.mjs";
import { planIfc, PLANNER, PLANNER_VERSION, facadeOf } from "./ifc-plan.mjs";
import { runIfc } from "./ifc-geometry.mjs";
import { fileURLToPath } from "node:url";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const CATBODY = read("../../demo/bds-pilot/bds-type-catalog.json");
const CAT = { types: CATBODY.types, label: "type_catalog@1 · project · fedcba987654…", sha256: "cd".repeat(32) };
const typerOf = (guideline) => makeTyper({ guideline: { body: read(guideline), label: "guideline@4 · project · 0123456789ab…", sha256: "ab".repeat(32) }, catalog: { body: CATBODY, label: CAT.label, sha256: CAT.sha256 } }, core);
const type = typerOf("../../demo/bds-pilot/bds-dd-survey-guideline.json");
const JOB = { id: "job-0007", ledger: { id: 3301, hash: "13".repeat(32) }, reader: "sentinel-ifc", version: "0.2.0" };
const ZERO = { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 };
const run = async (name) => {
  const path = fileURLToPath(new URL(`./fixtures/ifc-geometry/${name}.ifc`, import.meta.url)), bytes = readFileSync(path);
  const r = await runIfc({ job_id: JOB.id, items: [{ id: "ev-0001", kind: "model", path, sha256: createHash("sha256").update(bytes).digest("hex") }], params: {}, seed: 1 });
  expect(r.status).toBe("done");
  return { candidates: r.result.candidates, notRead: r.result.receipt.not_read, hint: r.result.receipt.hint };
};
const plan = (r, over = {}) => planIfc({ job: JOB, candidates: r.candidates, notRead: r.notRead, hint: r.hint, frame: ZERO, type, catalog: CAT, sameCategory: core.sameCategory, ...over });
const filedAs = (s, ty = type) => validateChangeset(s.body, { member: true, type: ty, job: { record: { id: JOB.id, ledger_id: 3301, ledger_hash: "13".repeat(32), result_sha256: "ab".repeat(32), reader: "sentinel-ifc 0.2.0", planner: `ifc-planner ${PLANNER_VERSION}`, frame: ZERO, storey: s.storey, evidence: [], overlaps: [] }, byCid: s.byCid } });
const types = (s) => filedAs(s).elements.filter((e) => e.kind !== "level").map((e) => [e.kind, e.cid.slice(-6), e.place.TypeName ?? null]);
let concept, cv2;
beforeAll(async () => { concept = await run("concept-2storey"); cv2 = await run("revit2024-concept-cv2"); });

describe("planIfc — a concept IFC becomes one changeset per storey", () => {
  it("the 6-7 fixture: levels created as `IFC <cid> <job>`, nothing pre-ticked, inferred from the IFC", () => {
    const p = plan(concept);
    expect(PLANNER).toBe("ifc-planner");
    expect(p.storeys.map((s) => [s.storey.cid, s.storey.level, s.storey.how])).toEqual([["L00", "IFC L00 job-0007", "created"], ["L01", "IFC L01 job-0007", "created"]]);
    const s0 = p.storeys[0];
    expect(s0.body).toMatchObject({ name: "IFC job-0007 · IFC L00 job-0007", contract: 2, source: "sentinel-ifc 0.2.0" });
    expect(s0.body.elements[0]).toMatchObject({ op: "create", kind: "level", place: { BaseElevation: 0, Name: "IFC L00 job-0007" } });
    for (const t of s0.byCid.values()) expect(t).toMatchObject({ pretick: false, accuracy: { status: "inferred", basis: "ifc", from_job: "job-0007" } });
  });
  it("MA-8-3: a vendor's IFC is named for its provider; the trust is the same claim, still never pre-ticked", () => {
    const p = plan(concept, { job: { ...JOB, provider: "acme scans" } });
    expect(p.storeys[0].body.name).toBe("IFC (acme scans) job-0007 · IFC L00 job-0007");
    expect(plan(concept, { job: { ...JOB, provider: "own" } }).storeys[0].body.name).toBe("IFC job-0007 · IFC L00 job-0007");
    for (const t of p.storeys[0].byCid.values()) expect(t).toMatchObject({ pretick: false, accuracy: { status: "inferred", basis: "ifc" } });
  });

  it("the Revit CV2 export: 300 + IsExternal is the 300 external CMU, 150 not external the 150 internal; a floor 300 is the structural slab", () => {
    const p = plan(cv2);
    const s = p.storeys.find((x) => x.storey.cid === "L02");
    const t = types(s);
    expect(t.filter((x) => x[0] === "wall" && x[2] === "BDS_EXT_ARC_CMU_300 mm")).toHaveLength(4);
    expect(t.filter((x) => x[0] === "wall" && x[2] === "BDS_INT_ARC_CMU_150 mm")).toHaveLength(1);
    expect(t.filter((x) => x[0] === "floor").map((x) => x[2])).toEqual(["BDS_INT_STR_CONC_300 mm"]);
    const w = s.body.elements.find((e) => e.kind === "wall" && e.facts.thickness_mm === 300);
    expect(w.reason).toMatch(/^IFC wall \w{22} "Basic Wall:BDS_EXT_ARC_CMU_300 mm:\d+": 300 mm thick \(material layers\), 3500 mm high, \d+ mm long as modelled · Location Exterior \(IsExternal\) · job-0007 \(ledger #3301\)$/);
    expect(w.validate.identity).toMatchObject({ Class: "IFCWALL", Name: w.cid });
    expect(w.pretick).toBeUndefined();
  });

  it("a storey's body validates as the bridge files it (the real validateChangeset, with the job's trust)", () => {
    expect(filedAs(plan(cv2).storeys.find((x) => x.storey.cid === "L02")).elements.every((e) => e.pretick === false)).toBe(true);
  });

  it("no IsExternal: inside or outside is read from the storey's own walls (D7)", () => {
    const c = structuredClone(cv2.candidates);
    for (const x of c) if (x.kind === "wall") x.geometry.is_external = null;
    const t = types(plan({ ...cv2, candidates: c }).storeys.find((x) => x.storey.cid === "L02")).filter((x) => x[0] === "wall").map((x) => x[2]).sort();
    expect(t).toEqual(["BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_INT_ARC_CMU_150 mm"]);
  });

  it("not read: the wall's own cut is an exception on its storey, the roof on its own (no changeset there); the door is filed, the column held for its top level", () => {
    const p = plan(cv2);
    const ex = p.storeys.find((x) => x.storey.cid === "L02").exceptions;
    expect(ex.map((e) => e.name.split(" ")[0])).toEqual(expect.arrayContaining(["IfcOpeningElement", "column"]));
    expect(ex.map((e) => e.name.split(" ")[0])).not.toContain("IfcDoor");
    expect(p.storeys.find((x) => x.storey.cid === "L02").body.elements.some((e) => e.kind === "door")).toBe(true);
    // a storey that holds no wall or floor is not matched (review): its roof is said on the row, not on a storey
    expect(p.storeys.find((x) => x.storey.cid === "L07")).toBeUndefined();
    expect(p.off_storey.map((e) => [e.ifc_class, e.count, e.name])).toEqual(expect.arrayContaining([["IFCROOF", 1, expect.stringMatching(/^IfcRoof /)]]));
  });

  it("review: two storeys at one height, one empty, do not both match a published level; the empty one's not_read and a storey-null one are said off storey", () => {
    const empty = cv2.candidates.find((c) => c.cid === "L01");
    expect(cv2.candidates.find((c) => c.cid === "L02").geometry.BaseElevation).toBe(empty.geometry.BaseElevation);
    const manifest = [{ name: "GF", elevation_mm: empty.geometry.BaseElevation, from: "ARC.ifc P01" }];
    const lost = { global_id: "N".repeat(22), ifc_class: "IFCWALL", ifc_name: "IfcWall", storey: null, why: "not on a storey" };
    const p = plan({ ...cv2, notRead: [...cv2.notRead, lost] }, { manifest });
    expect(p.storeys.map((x) => [x.storey.cid, x.storey.level])).toEqual(expect.arrayContaining([["L02", "GF"]]));
    expect(p.storeys.some((x) => x.storey.cid === "L01")).toBe(false);
    expect(p.off_storey.find((e) => e.ifc_class === "IFCWALL")).toMatchObject({ count: 1, name: `IfcWall ${lost.global_id}`, reason: expect.stringContaining("not on a storey") });
  });

  it("review: a clipped wall says its height is before the clip; a note from the reader rides the reason", () => {
    const c = structuredClone(cv2.candidates);
    const w = c.find((x) => x.kind === "wall" && x.geometry.storey === "L02");
    w.geometry.clipped = true; w.geometry.note = "centre not stated (no layer-set usage)";
    const e = plan({ ...cv2, candidates: c }).storeys.find((x) => x.storey.cid === "L02").body.elements.find((x) => x.cid === w.cid);
    expect(e.reason).toMatch(/3500 mm high \(before its clip\), .* · centre not stated \(no layer-set usage\) · job-0007/);
  });

  it("not_read is one exception a class: 312 pieces of furniture are one row, the first GlobalIds named", () => {
    const many = Array.from({ length: 312 }, (_, i) => ({ global_id: `F${String(i).padStart(21, "0")}`, ifc_class: "IFCFURNISHINGELEMENT", storey: "L00", why: "an IfcFurnishingElement — the IFC planner reads walls and floors (MA-6); a person places it" }));
    const ex = plan({ ...concept, notRead: many }).storeys[0].exceptions.filter((e) => e.unique_id.startsWith("IFCFURNISHINGELEMENT"));
    expect(ex).toHaveLength(1);
    expect(ex[0].name).toBe("IfcFurnishingElement × 312");
    expect(ex[0].reason.length).toBeLessThanOrEqual(300);
    expect(ex[0].reason).toContain("F000000000000000000000");
  });

  it("a floor 275 mm thick has no type: a gap group, an exception, nothing filed for it", () => {
    const c = structuredClone(cv2.candidates);
    const f = c.find((x) => x.kind === "floor" && x.geometry.storey === "L02");
    f.measured.thickness_mm = 275;
    const p = plan({ ...cv2, candidates: c });
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0]).toMatchObject({ category: "Floors", elements: 1 });
    const s = p.storeys.find((x) => x.storey.cid === "L02");
    expect(s.exceptions.find((e) => e.name === `floor ${f.cid}`).reason).toMatch(/^type gap — BDS_INT_STR_CONC_275 mm is not in the type catalogue/);
    expect(s.body.elements.some((e) => e.kind === "floor")).toBe(false);
  });

  it("the lead's frame moves every line (D5: the IFC's own position is never applied)", () => {
    const a = plan(cv2).storeys.find((x) => x.storey.cid === "L02"), b = plan(cv2, { frame: { ...ZERO, dx_mm: 1000 } }).storeys.find((x) => x.storey.cid === "L02");
    const w = (s) => s.body.elements.filter((e) => e.kind === "wall").map((e) => e.place.LocationCurve.start[0]);
    expect(w(b)).toEqual(w(a).map((x) => x + 1000));
  });

  it("a base 50 mm off its storey is held for a person, not filed", () => {
    const c = structuredClone(cv2.candidates);
    const w = c.find((x) => x.kind === "wall" && x.geometry.storey === "L02");
    w.geometry.BaseElevation = 50;
    const s = plan({ ...cv2, candidates: c }).storeys.find((x) => x.storey.cid === "L02");
    expect(s.exceptions.find((e) => e.name === `wall ${w.cid}`).reason).toBe("its base sits 50 mm off IFC L02 job-0007 — a person decides");
    expect(s.body.elements.filter((e) => e.kind === "wall")).toHaveLength(4);
  });

  it("a cid filed already is not proposed again (decision 19)", () => {
    const w = cv2.candidates.find((x) => x.kind === "wall" && x.geometry.storey === "L02");
    const p = plan(cv2, { filed: { cids: new Set([w.cid]), storeys: new Map() } });
    expect(p.already_filed).toBe(1);
    expect(p.storeys.find((x) => x.storey.cid === "L02").body.elements.some((e) => e.cid === w.cid)).toBe(false);
  });
});

// MA-8-4 — the planner for what the 0.2.0 reader adds. Each case is a clone of the CV2 export's candidates with one thing changed.
describe("planIfc — MA-8-4 (0.2.0): openings, doors, windows, columns and curtain walls", () => {
  const RP = "2VExwC6xrF6u4NaChOdioP", RL = "2VExwC6xrF6u4NaChOdioL", FLOOR = "2VExwC6xrF6u4NaChOdioI", DOOR = "2VExwC6xrF6u4NaChOdio3", COL = "2VExwC6xrF6u4NaChOdio0";
  const mk = (kind, geometry, measured, cid) => ({ cid, kind, evidence: [`ev-0001#${cid}`], measured, geometry: { storey: "L02", ...geometry } });
  const withC = (...extra) => ({ ...cv2, candidates: [...structuredClone(cv2.candidates), ...extra] });
  const change = (r, cid, f) => { const c = structuredClone(r.candidates); f(c.find((x) => x.cid === cid)); return { ...r, candidates: c }; };
  const s02 = (p) => p.storeys.find((x) => x.storey.cid === "L02");
  const elOf = (p, cid) => s02(p).body.elements.find((e) => e.cid === cid);
  const heldOf = (p, cid) => s02(p).exceptions.find((e) => e.unique_id === cid)?.reason;
  const MANIFEST = [{ name: "GF", elevation_mm: 0, from: "ARC.ifc P01" }, { name: "FF", elevation_mm: 3500, from: "ARC.ifc P01" }];
  const typeShell = typerOf("../../demo/bds-pilot/bds-dd-shell-guideline.json");

  it("the version is 0.2.0 and every new element is bridge-built, inferred from the IFC and never pre-ticked", () => {
    expect(PLANNER_VERSION).toBe("0.2.1");
    const p = plan(withC(mk("opening", { host: RP, host_kind: "wall", along_mm: 10000 }, { width_mm: 1000, height_mm: 1500, sill_mm: 900 }, "OPENING0000000000001")), { manifest: MANIFEST });
    expect(s02(p).body.elements.map((e) => e.kind).sort()).toEqual(["column", "door", "floor", "opening", "wall", "wall", "wall", "wall", "wall"]);
    for (const t of s02(p).byCid.values()) expect(t).toMatchObject({ pretick: false, accuracy: { status: "inferred", basis: "ifc", from_job: "job-0007" } });
    expect(filedAs(s02(p)).elements.every((e) => e.pretick === false)).toBe(true);
  });

  describe("doors and windows", () => {
    it("the CV2 door: no office rule for 1000 x 2000, so the IFC's own Family:Type, the one catalogue row of that name (D-B2-1) — recorded as such", () => {
      const p = plan(cv2), d = elOf(p, DOOR);
      expect(d).toMatchObject({ kind: "door", facts: { params: { HostFunction: "Exterior", Size: "W1000 x H2000 mm" } }, validate: { identity: { Class: "IFCDOOR", Name: DOOR } },
        place: { LevelName: "IFC L02 job-0007", Location: [4000, 0, 0], FamilyName: "BDS_EXT_1 PNL", TypeName: "BDS_EXT_1 PNL_WOOD_1000 x 2100 mm" } });
      expect(d.reason).toMatch(/typed by the IFC's own type name "BDS_EXT_1 PNL:BDS_EXT_1 PNL_WOOD_1000 x 2100 mm": BDS_EXT_1 PNL : BDS_EXT_1 PNL_WOOD_1000 x 2100 mm · its hand and facing are not read from the IFC — check the swing in Revit · job-0007/);
      expect(s02(p).byCid.get(DOOR).typing).toEqual({ typed_by: "bridge-ifc-type", type: "BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", family: "BDS_EXT_1 PNL", size: "1000 x 2000 mm", ifc_type_name: "BDS_EXT_1 PNL:BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", catalog: CAT.label, catalog_sha256: CAT.sha256 });
      expect(filedAs(s02(p)).elements.find((e) => e.kind === "door")).toMatchObject({ place: { TypeName: "BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", Location: [4000, 0, 0] }, typing: { typed_by: "bridge-ifc-type" }, pretick: false });
      expect(p.groups).toEqual([]);
    });

    it("an office rule comes first: an interior 1000 x 2100 door in the 150 mm partition is the rule's type, not the file's", () => {
      const p = plan(withC(mk("door", { host: RL, opening: "x", along_mm: 6000, name: "DI", ifc_class: "IFCDOOR", ifc_type_name: "BDS_EXT_1 PNL:BDS_EXT_1 PNL_WOOD_1000 x 2100 mm" }, { width_mm: 1000, height_mm: 2100, sill_mm: 0 }, "DOORINT00000000000001")));
      const d = elOf(p, "DOORINT00000000000001");
      expect(d.place.Location).toEqual([8000, 6000, 0]);
      expect(d.place.FamilyName).toBeUndefined();
      expect(d.reason).toMatch(/typed by an office rule/);
      expect(types(s02(p)).filter((x) => x[0] === "door").map((x) => x[2]).sort()).toEqual(["BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm"]);
      expect(filedAs(s02(p)).elements.find((e) => e.cid === "DOORINT00000000000001").typing.typed_by).toBe("bridge");
    });

    it("no type name: 13 catalogue doors within 100 mm of 1000 x 2000 is a gap that names the rows; with one row left it is typed by size", () => {
      const r = change(cv2, DOOR, (c) => { c.geometry.ifc_type_name = ""; });
      const p = plan(r);
      expect(heldOf(p, DOOR)).toMatch(/^type gap — 13 Doors types are named within 100 mm of 1000 x 2000 mm — a person picks one; it waits in the Holding Area/);
      expect(p.groups).toHaveLength(1);
      expect(p.groups[0]).toMatchObject({ category: "Doors", elements: 1, size: "1000 x 2000 mm" });
      expect(p.groups[0].key).toMatch(/^13 Doors types are named within 100 mm of 1000 x 2000 mm: /);
      const one = plan(r, { catalog: { ...CAT, types: CAT.types.filter((t) => t.category !== "Doors" || t.type === "BDS_EXT_1 PNL_WOOD_1000 x 2100 mm") } });
      expect(elOf(one, DOOR).place).toMatchObject({ FamilyName: "BDS_EXT_1 PNL", TypeName: "BDS_EXT_1 PNL_WOOD_1000 x 2100 mm" });
      expect(s02(one).byCid.get(DOOR).typing).toMatchObject({ typed_by: "bridge-size", band_mm: 100, size: "1000 x 2000 mm" });
    });

    it("a window carries its SillHeight; a door whose bottom is not on its level, and a window below it, are held", () => {
      const win = mk("window", { host: RP, opening: "x", along_mm: 14000, name: "W", ifc_class: "IFCWINDOW", ifc_type_name: "" }, { width_mm: 1200, height_mm: 2000, sill_mm: 900 }, "WINDOW0000000000001");
      const p = plan(withC(win));
      expect(elOf(p, win.cid)).toMatchObject({ kind: "window", place: { Location: [14000, 0, 0], SillHeight: 900 }, validate: { identity: { Class: "IFCWINDOW" } } });
      expect(types(s02(p)).find((x) => x[1] === "000001" && x[0] === "window")[2]).toBe("1200x2000 mm");
      expect(heldOf(plan(change(cv2, DOOR, (c) => { c.measured.sill_mm = 300; })), DOOR)).toBe("a door whose bottom sits 300 mm above its level — a person decides");
      expect(heldOf(plan(withC({ ...win, measured: { ...win.measured, sill_mm: -200 } })), win.cid)).toMatch(/^a window whose sill is -200 mm from its level/);
    });

    it("the host decides: a type-gap wall holds its door (and says which), a wall held for its base does too, a door off any wall is held, a filed host still hosts", () => {
      const gapped = plan(change(cv2, RP, (c) => { c.measured.thickness_mm = 275; }));
      expect(heldOf(gapped, DOOR)).toBe(`its host wall ${RP} is a type gap — propose the job again once the wall's group in the Holding Area closes`);
      expect(heldOf(plan(change(cv2, RP, (c) => { c.geometry.BaseElevation = 50; })), DOOR)).toBe(`its host wall ${RP} is held for a person (see its exception), so nothing is cut or placed in it`);
      expect(heldOf(plan(change(cv2, DOOR, (c) => { c.geometry.host = "NOWALL"; })), DOOR)).toBe("its host wall NOWALL is not a wall of IFC L02 job-0007 in job-0007");
      expect(heldOf(plan(change(cv2, DOOR, (c) => { c.geometry.along_mm = 8000; })), DOOR)).toMatch(/^2 walls of IFC L02 job-0007 pass its point \(a junction or a layered wall\) — Revit hosts in one; a person decides/);
      const filed = plan(cv2, { filed: { cids: new Set([RP]), storeys: new Map() } });
      expect(elOf(filed, DOOR)).toBeTruthy();
      expect(elOf(filed, RP)).toBeUndefined();
    });
  });

  describe("openings", () => {
    const op = (g, m, cid = "OPENING0000000000001") => mk("opening", { host: RP, host_kind: "wall", along_mm: 10000, ...g }, { width_mm: 1000, height_mm: 1500, sill_mm: 900, ...m }, cid);
    it("a wall opening is a rectangle on its wall's line, untyped, in the lead's frame", () => {
      const o = op({}, {});
      const p = plan(withC(o));
      expect(elOf(p, o.cid)).toMatchObject({ kind: "opening", place: { LevelName: "IFC L02 job-0007", Location: [10000, 0, 0], Width: 1000, Height: 1500, SillHeight: 900 }, validate: { identity: { Class: "IFCOPENINGELEMENT" } } });
      expect(filedAs(s02(p)).elements.find((e) => e.kind === "opening").place).toMatchObject({ Width: 1000, SillHeight: 900 });
      expect(elOf(plan(withC(o), { frame: { ...ZERO, dx_mm: 1000 } }), o.cid).place.Location).toEqual([11000, 0, 0]);
    });
    it("held in words: a slot of 50 mm, one on a junction, one past its wall's end or top, one on an unchecked level", () => {
      expect(heldOf(plan(withC(op({}, { width_mm: 50 }))), "OPENING0000000000001")).toMatch(/^a 50 x 1500 mm cut at sill 900 mm — an opening is over 50 and at most 20000 mm each way/);
      expect(heldOf(plan(withC(op({ along_mm: 8000 }, {}))), "OPENING0000000000001")).toMatch(/^2 walls of IFC L02 job-0007 pass its point/);
      expect(heldOf(plan(withC(op({ along_mm: 19800 }, {}))), "OPENING0000000000001")).toMatch(/^its 1000 mm width, centred 19800 mm along .* runs past an end of that wall \(20000 mm long\)/);
      expect(heldOf(plan(withC(op({}, { height_mm: 3000 }))), "OPENING0000000000001")).toMatch(/^it runs from 900 to 3900 mm, past .*'s bottom \(0 mm\) or top \(3500 mm\)/);
      expect(heldOf(plan(withC(op({}, {})), { levels: { L02: "Nowhere" } }), "OPENING0000000000001")).toMatch(/^its level Nowhere is in no published model/);
    });
    it("a hole in a floor: its outline and centre inside the host floor, a flush edge allowed; outside it is held", () => {
      const hole = (b, cid = "HOLE000000000000001") => mk("opening", { host: FLOOR, host_kind: "floor", Boundary: b }, { area_m2: 1 }, cid);
      const sq = (x, y) => [[x, y], [x + 1000, y], [x + 1000, y + 1000], [x, y + 1000]];
      const p = plan(withC(hole(sq(5000, 5000)), hole(sq(0, 0), "HOLE000000000000002"), hole(sq(19500, 5000), "HOLE000000000000003")));
      expect(elOf(p, "HOLE000000000000001")).toMatchObject({ kind: "opening", place: { LevelName: "IFC L02 job-0007", Boundary: sq(5000, 5000) } });
      expect(elOf(p, "HOLE000000000000002")).toBeTruthy();
      expect(heldOf(p, "HOLE000000000000003")).toBe(`its outline is not inside its host floor ${FLOOR} — Revit cuts one floor; a person decides`);
      expect(heldOf(plan(withC(mk("opening", { host: "NOFLOOR", host_kind: "floor", Boundary: sq(5000, 5000) }, { area_m2: 1 }, "HOLE000000000000004"))), "HOLE000000000000004")).toMatch(/^its host floor NOFLOOR is not filed on IFC L02 job-0007/);
      expect(filedAs(s02(p)).elements.filter((e) => e.kind === "opening")).toHaveLength(2);
    });
  });

  describe("review fixes", () => {
    it("a floor hole the executor would refuse (a 300-segment circle, an edge under 1 mm) is held in words and costs the storey nothing", () => {
      const circle = Array.from({ length: 300 }, (_, k) => [10000 + 400 * Math.cos(k * Math.PI / 150), 5000 + 400 * Math.sin(k * Math.PI / 150)]);
      const sliver = [[5000, 5000], [5000.5, 5000], [5000.5, 6000], [5000, 6000]];
      const hole = (b, cid) => mk("opening", { host: FLOOR, host_kind: "floor", Boundary: b }, { area_m2: 1 }, cid);
      const p = plan(withC(hole(circle, "HOLE000000000000001"), hole(sliver, "HOLE000000000000002")));
      expect(heldOf(p, "HOLE000000000000001")).toMatch(/^its outline must be 3 to 256 finite \[x,y\] points — a person cuts the hole$/);
      expect(heldOf(p, "HOLE000000000000002")).toMatch(/^its outline has an edge shorter than 1 mm/);
      expect(filedAs(s02(p)).elements.some((e) => e.kind === "wall")).toBe(true);
    });
    it("a door typed by the IFC's own name must agree with the measured size: 1500 wide against a 1000 x 2100 row is not that row", () => {
      const p = plan(change(cv2, DOOR, (c) => { c.measured.width_mm = 1500; }));
      expect(elOf(p, DOOR)?.place.TypeName).not.toBe("BDS_EXT_1 PNL_WOOD_1000 x 2100 mm");
      expect(s02(p).byCid.get(DOOR)?.typing?.typed_by).not.toBe("bridge-ifc-type");
    });
    it("a curtain wall on the middle of its storey's walls has no told outside: held, not given a facade", () => {
      const ws = cv2.candidates.filter((c) => c.kind === "wall" && c.geometry.storey === "L02"), mid = (k) => ws.reduce((m, c) => m + (c.geometry.LocationCurve.start[k] + c.geometry.LocationCurve.end[k]) / 2, 0) / ws.length;
      const cwall = mk("wall", { LocationCurve: { start: [mid(0) - 4000, mid(1)], end: [mid(0) + 4000, mid(1)] }, BaseElevation: 0, TopElevation: 3500, name: "CW", ifc_class: "IFCCURTAINWALL", ifc_type_name: "", is_external: true, curtain: true, from: "axis" }, { height_mm: 3500, length_mm: 8000 }, "CURTAIN0000000000009");
      const p = plan(withC(cwall), { type: typeShell, levels: { L02: "FC L01" }, manifest: [{ name: "FC L01", elevation_mm: 0, from: "ARC.ifc P01" }] });
      expect(heldOf(p, "CURTAIN0000000000009")).toBe("IfcCurtainWall CURTAIN0000000000009: its outside cannot be told from the storey's walls — a person decides");
      expect(elOf(p, "CURTAIN0000000000009")).toBeUndefined();
    });
  });

  describe("columns", () => {
    it("the CV2 column: typed by the IFC's own name (457 x 475mm), its top to the matched level above — filed as the bridge validates it", () => {
      const p = plan(cv2, { manifest: MANIFEST }), c = elOf(p, COL);
      expect(c).toMatchObject({ kind: "column", facts: { params: { Size: "W475 x H475 mm" } }, validate: { identity: { Class: "IFCCOLUMN" } },
        place: { LevelName: "GF", Location: [14000, 6000, 0], TopLevel: "FF", FamilyName: "M_Rectangular Column", TypeName: "457 x 475mm" } });
      expect(c.reason).toMatch(/LoadBearing not stated — read as architectural/);
      expect(s02(p).byCid.get(COL).typing).toMatchObject({ typed_by: "bridge-ifc-type", type: "457 x 475mm", size: "475 x 475 mm" });
      expect(filedAs(s02(p)).elements.find((e) => e.kind === "column").place).toMatchObject({ TopLevel: "FF", TypeName: "457 x 475mm" });
    });
    it("a top at a level the storey's own changeset creates is held until it is applied", () => {
      expect(heldOf(plan(cv2), COL)).toBe("its top level IFC L04 job-0007 is created by that storey's changeset — apply it, then propose again");
    });
    it("by size without a name (475 x 610 is the 475 x 610mm row, not rounded to a hundred), a circle by its diameter, and a quarter turn swaps the footprint", () => {
      const sz = (g, m) => plan(change(cv2, COL, (c) => { c.geometry.ifc_type_name = ""; Object.assign(c.geometry, g); Object.assign(c.measured, m); }), { manifest: MANIFEST });
      const a = sz({}, { width_mm: 475, depth_mm: 610 });
      expect(elOf(a, COL).place).toMatchObject({ FamilyName: "M_Rectangular Column", TypeName: "475 x 610mm" });
      expect(s02(a).byCid.get(COL).typing).toMatchObject({ typed_by: "bridge-size", size: "475 x 610 mm" });
      const round = sz({ shape: "circle" }, { diameter_mm: 610 });
      expect(elOf(round, COL).place).toMatchObject({ FamilyName: "M_Metal Clad Column", TypeName: "610mm Diameter" });
      expect(elOf(round, COL).facts).toEqual({ params: { Size: "D610 mm" } });
      expect(heldOf(sz({ shape: "circle" }, { diameter_mm: 900 }), COL)).toMatch(/no Columns type is named within 100 mm of D900 mm/);
      const quarter = sz({ rotation_deg: 90 }, { width_mm: 475, depth_mm: 610 });
      expect(heldOf(quarter, COL)).toMatch(/no Columns type is named within 100 mm of 610 x 475 mm/);
      expect(sz({ rotation_deg: 90 }, { width_mm: 610, depth_mm: 610 }).storeys[0].body.elements.some((e) => e.kind === "column")).toBe(true);
    });
    it("held: a column turned off square, a load-bearing one, a base off its level, a top at no level, one on an unchecked level", () => {
      const held = (g, over = {}) => heldOf(plan(change(cv2, COL, (c) => Object.assign(c.geometry, g)), { manifest: MANIFEST, ...over }), COL);
      expect(held({ rotation_deg: 30 })).toBe("a column turned 30° — Sentinel places columns square to the model (no Rotation for a column); a person decides");
      expect(held({ rotation_deg: 0.4 })).toBeUndefined();
      expect(heldOf(plan(change(cv2, COL, (c) => { c.geometry.rotation_deg = 10; }), { manifest: MANIFEST, frame: { ...ZERO, rotation_deg: 80 } }), COL)).toBeUndefined();   // 10° and the lead's 80°: square
      expect(held({ load_bearing: true })).toBe("a structural column — structural columns are not placed from an IFC yet; a person places it");
      expect(held({ base_mm: 50 })).toBe("its base sits 50 mm off IFC L02 job-0007 — a person decides".replace("IFC L02 job-0007", "GF"));
      expect(held({ top_mm: 3000 })).toBe("its top is at 3000 mm, at no level of this IFC's matched storeys — a person decides");
      expect(held({}, { levels: { L02: "Nowhere" } })).toMatch(/^its level Nowhere is in no published model/);
      expect(heldOf(plan(change(cv2, COL, (c) => { c.geometry.load_bearing = false; }), { manifest: MANIFEST }), COL)).toBeUndefined();
      expect(elOf(plan(change(cv2, COL, (c) => { c.geometry.load_bearing = false; }), { manifest: MANIFEST }), COL).reason).toMatch(/LoadBearing false/);
    });
  });

  describe("curtain walls", () => {
    const FC = { levels: { L02: "FC L01" }, manifest: [{ name: "FC L01", elevation_mm: 0, from: "ARC.ifc P01" }] };
    const cw = (start, end, over = {}, cid = "CURTAIN0000000000001") => mk("wall", { LocationCurve: { start, end }, BaseElevation: 0, TopElevation: 3500, name: "CW", ifc_class: "IFCCURTAINWALL", ifc_type_name: "", is_external: true, curtain: true, from: "axis", ...over }, { height_mm: 3500, length_mm: 20000 }, cid);
    it("a facade rule gives M_Exterior Glazing on the south side (the facade read against the IFC's True North); the bridge files it as a wall it types", () => {
      const p = plan(withC(cw([0, 0], [20000, 0])), { ...FC, type: typeShell });
      expect(elOf(p, "CURTAIN0000000000001")).toMatchObject({ kind: "wall", facts: { params: { Location: "Exterior", Facade: "S" } }, validate: { identity: { Class: "IFCWALL" } }, place: { LevelName: "FC L01", TopElevation: 3500 } });
      expect(elOf(p, "CURTAIN0000000000001").reason).toMatch(/Facade read against True North \[0, 1\] of the IFC\) · typed Curtain Wall : M_Exterior Glazing/);
      expect(filedAs(s02(p), typeShell).elements.find((e) => e.cid === "CURTAIN0000000000001").place).toMatchObject({ TypeName: "M_Exterior Glazing" });
      expect(elOf(plan(withC(cw([0, 0], [20000, 0])), { ...FC, type: typeShell, hint: undefined }), "CURTAIN0000000000001").reason).toMatch(/True North \+Y: the IFC states none/);
    });
    it("a side whose rule answers a basic wall is held, in words, and a true north turned a quarter moves the facade", () => {
      const north = withC(cw([20000, 12000], [0, 12000]));
      expect(heldOf(plan(north, { ...FC, type: typeShell }), "CURTAIN0000000000001")).toBe("IfcCurtainWall CURTAIN0000000000001: the office's rules answer a basic wall (BDS_EXT_ARC_CMU_300 mm) for Location Exterior, Facade N — no facade rule names a curtain type for it; a person decides");
      const turned = plan(withC(cw([0, 0], [20000, 0])), { ...FC, type: typeShell, hint: { true_north: [0, -1] } });   // north is -Y: the south wall faces north
      expect(heldOf(turned, "CURTAIN0000000000001")).toMatch(/Facade N/);
    });
    it("no curtain answer at all is an exception only, never a Holding Area group; a door under a curtain wall is held", () => {
      const p = plan(withC(cw([0, 0], [20000, 0])), { ...FC });   // the survey guideline types a wall by thickness: none was sent
      expect(heldOf(p, "CURTAIN0000000000001")).toMatch(/^IfcCurtainWall CURTAIN0000000000001: no office rule types a wall with Location Exterior, Facade S/);
      expect(JSON.stringify(p.groups)).not.toContain("CURTAIN0000000000001");
      const under = plan(withC(cw([0, 0], [20000, 0])), { ...FC, type: typeShell });
      expect(heldOf(under, DOOR)).toBe("a curtain wall passes its point — Revit hosts in one basic wall");
    });
    it("a curtain wall is no barrier to wall-location and has no thickness: the basic walls type as before", () => {
      const p = plan(withC(cw([0, 0], [20000, 0])), { ...FC, type: typeShell });
      expect(filedAs(s02(p), typeShell).elements.filter((e) => e.kind === "wall").map((e) => e.place.TypeName).sort()).toEqual(["BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "M_Exterior Glazing"]);
    });
    it("facadeOf: four sides of a square, the ties on 45° (E), 135° (S), 225° (W) and 315° (N), a turned True North", () => {
      const c = [5, 5];
      expect([[[0, 0], [10, 0]], [[10, 0], [10, 10]], [[10, 10], [0, 10]], [[0, 10], [0, 0]]].map(([a, b]) => facadeOf(a, b, c))).toEqual(["S", "E", "N", "W"]);
      const face = (nx, ny, tn) => facadeOf([10 * nx + 5 * ny, 10 * ny - 5 * nx], [10 * nx - 5 * ny, 10 * ny + 5 * nx], [0, 0], tn);
      expect([[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([x, y]) => face(x, y))).toEqual(["E", "S", "W", "N"]);
      expect(["E", "S", "W", "N"].map((_, i) => face(...[[0, 1], [1, 0], [0, -1], [-1, 0]][i]))).toEqual(["N", "E", "S", "W"]);
      expect(face(0, 1, [-1, 0])).toBe("E");   // north points to -X: a wall facing +Y is to the right of north
      expect(face(0, 1, [0, -1])).toBe("S");
      expect(face(1, 0, [1, 0])).toBe("N");
    });
  });

  describe("stairs: a boxed stair is one flag row for a person (MA-8-9); nothing is placed or pre-ticked", () => {
    const G = (n) => `STAIR${String(n).padStart(17, "0")}`;   // 22 characters
    const stair = (g, box, storey = "L02") => ({ global_id: g, ifc_class: "IFCSTAIR", ifc_name: "IfcStair", storey, why: "a stair — this reader boxes stairs but does not place them; a person places it", box });
    const BOX = { min: [0, 0, 0], max: [1000, 3000, 3500] };
    const withStairs = (rows, over = {}) => plan({ ...cv2, notRead: [...cv2.notRead, ...rows] }, over);
    it("a stair with a box becomes a flag on its storey; one without a box stays in the class row with its why", () => {
      const p = withStairs([stair(G(1), BOX), stair(G(2), null)]);
      const flag = s02(p).exceptions.find((e) => e.unique_id === `stair:${G(1)}`);
      expect(flag).toMatchObject({ name: `Stair ${G(1)}`, kind: "stair", storey: s02(p).storey.level, global_id: G(1), box: { min: [0, 0, 0], max: [1000, 3000, 3500] } });
      expect(flag.reason).toMatch(/^a stair — a person proposes it from this flag \(Propose a stair…, Revit 2021\+\), or adds it; box 1000 × 3000 mm in plan, 3500 mm tall, from \(0, 0, 0\) on .+ · job-0007 \(ledger #3301\)$/);
      expect(flag.reason.length).toBeLessThanOrEqual(300);
      const row = s02(p).exceptions.find((e) => e.unique_id === "IFCSTAIR@L02");
      expect(row).toMatchObject({ name: `IfcStair ${G(2)}` });
      expect(row.reason).toMatch(/^a stair — this reader boxes stairs but does not place them; a person places it · /);
      expect(s02(p).body.elements.filter((e) => /stair/i.test(JSON.stringify(e.validate)))).toEqual([]);
      expect(s02(p).body.elements.some((e) => e.pretick)).toBe(false);
    });
    it("the bridge files it: kind, storey, box and the IFC GlobalId kept, source ifc", () => {
      const f = filedAs(s02(withStairs([stair(G(1), BOX)]))).exceptions.find((e) => e.kind === "stair");
      expect(f).toMatchObject({ unique_id: `stair:${G(1)}`, kind: "stair", source: "ifc", global_id: G(1), box: BOX });
    });
    it("the lead's frame moves the box into the model; a turned frame gives the larger axis-aligned box and says so", () => {
      const moved = s02(withStairs([stair(G(1), BOX)], { frame: { dx_mm: 5000, dy_mm: -2000, dz_mm: 100, rotation_deg: 0 } })).exceptions.find((e) => e.kind === "stair");
      expect(moved.box).toEqual({ min: [5000, -2000, 100], max: [6000, 1000, 3600] });
      expect(moved.reason).not.toMatch(/turned frame/);
      const quarter = s02(withStairs([stair(G(1), BOX)], { frame: { ...ZERO, rotation_deg: 90 } })).exceptions.find((e) => e.kind === "stair");
      expect(quarter.box).toEqual({ min: [-3000, 0, 0], max: [0, 1000, 3500] });
      const turned = s02(withStairs([stair(G(1), BOX)], { frame: { ...ZERO, rotation_deg: 45 } })).exceptions.find((e) => e.kind === "stair");
      expect(turned.box.max[0] - turned.box.min[0]).toBeGreaterThan(2800);   // (1000 + 3000) / sqrt 2
      expect(turned.reason).toMatch(/box 2828 × 2828 mm in plan \(the larger axis-aligned box of a turned frame\)/);
    });
    it("a stair already flagged on a changeset of this job is not flagged again, nor does it fall into the class row", () => {
      const p = withStairs([stair(G(1), BOX), stair(G(2), BOX)], { filed: { cids: new Set(), storeys: new Map(), stairs: new Set([`stair:${G(1)}`]) } });
      expect(s02(p).exceptions.filter((e) => e.kind === "stair").map((e) => e.global_id)).toEqual([G(2)]);
      expect(s02(p).exceptions.find((e) => e.unique_id === "IFCSTAIR@L02")).toBeUndefined();
    });
    it("51 stairs: 50 flags, the 51st stays in the class row", () => {
      const p = withStairs(Array.from({ length: 51 }, (_, i) => stair(G(i + 1), BOX)));
      expect(s02(p).exceptions.filter((e) => e.kind === "stair")).toHaveLength(50);
      expect(s02(p).exceptions.find((e) => e.unique_id === "IFCSTAIR@L02")).toMatchObject({ name: `IfcStair ${G(51)}` });
    });
    it("a box the bridge would refuse (a side under 300 mm) stays in the class row", () => {
      const p = withStairs([stair(G(1), { min: [0, 0, 0], max: [200, 3000, 3500] })]);
      expect(s02(p).exceptions.filter((e) => e.kind === "stair")).toEqual([]);
      expect(s02(p).exceptions.find((e) => e.unique_id === "IFCSTAIR@L02")).toBeTruthy();
    });
  });

  it("an unchecked level holds every point the executor checks the height of, and still files the walls and floor", () => {
    const p = plan(withC(mk("opening", { host: RP, host_kind: "wall", along_mm: 10000 }, { width_mm: 1000, height_mm: 1500, sill_mm: 900 }, "OPENING0000000000001")), { levels: { L02: "Nowhere" } });
    for (const cid of [DOOR, COL, "OPENING0000000000001"]) expect(heldOf(p, cid)).toMatch(/is in no published model, so its height in Revit is unknown here/);
    expect(s02(p).body.elements.filter((e) => e.kind === "wall")).toHaveLength(5);
  });
});
