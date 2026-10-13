// MA-7-9 — a photo chooses the type (material): a PERSON names the material of a wall from a blurred photo (no vision model - slice 7-8 is held for
// spike M-0); the material is one the guideline's Walls rules key on; the thickness stays the scan's. The pure half (the store's checks are in
// changesets-store.test.mjs, the recipe pin in recipe-store.test.mjs).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { validateChangeset } from "./changesets-logic.mjs";
import { readProposeBody, readMaterials, wallMaterials, planSurvey } from "./survey-plan.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const RESULT = read("./fixtures/survey/job-0002-result.json");
const CATALOG = read("../../demo/bds-pilot/bds-type-catalog.json");
const ZERO = { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 };
const JOB = { id: "job-0002", ledger: { id: 2201, hash: "13".repeat(32) }, reader: "sentinel-survey", version: "0.1.0" };
const rule = (Material, typePattern) => ({ when: { params: { Material } }, use: { family: "Basic Wall", typePattern } });
// R-typer: two Walls rules keyed on params.Material only - a wall with no Material matches no rule
const GUIDE = (...rules) => ({ elements: [{ category: "Walls", rules }] });
const G2 = GUIDE(rule("Concrete", "BDS_EXT_STR_CONC_{thickness} mm"), rule("Block", "BDS_EXT_ARC_CMU_{thickness} mm"));
const typer = (g = G2) => makeTyper({ guideline: { body: g, label: "guideline@2 · project · 0123456789ab…", sha256: "ab".repeat(32) },
  catalog: { body: CATALOG, label: "type_catalog@1 · project · fedcba987654…", sha256: "cd".repeat(32) } }, core);
const WALL = "scan-L00-wall-2"; // 200 mm thick in the drill's job-0002
const choice = { item: "ev-000C", copy_sha256: "e".repeat(64), material: "Concrete", chosen_by: "lead@example.test" };
const plan = (materials, g) => planSurvey({ job: JOB, candidates: RESULT.candidates, frame: ZERO, levels: { "scan-L00-level": "GR-FFL" }, manifest: [], type: typer(g),
  catalog: { types: CATALOG.types }, sameCategory: core.sameCategory, ...(materials ? { materials } : {}) });
const gapped = (p, cid) => p.storeys.flatMap((s) => s.exceptions).find((x) => x.unique_id === cid);
const no = (fn, status, re) => { try { fn(); } catch (e) { expect(e.status).toBe(status); expect(e.message).toMatch(re); return; } throw new Error("no throw"); };

describe("R-typer - rules keyed only on params.Material", () => {
  it("no Material -> a type gap (no rule matches); Concrete -> the concrete type at the scan's thickness", () => {
    const t = typer();
    no(() => t("wall", { thickness_mm: 200, params: { Location: "Interior" } }, "x"), 400, /no rule of guideline@2.*matches a wall with Location Interior, 200 mm/);
    expect(t("wall", { thickness_mm: 200, params: { Location: "Interior", Material: "Concrete" } }, "x").TypeName).toBe("BDS_EXT_STR_CONC_200 mm");
    expect(t("wall", { thickness_mm: 200, params: { Material: "Block" } }, "x").TypeName).toBe("BDS_EXT_ARC_CMU_200 mm");
  });
});

describe("readMaterials / readProposeBody - the body's shape", () => {
  it("{cid: {item, material}} is read; an empty object is none", () => {
    expect(readMaterials({ w1: { item: "ev-000C", material: " Concrete " } })).toEqual([{ cid: "w1", item: "ev-000C", material: "Concrete" }]);
    expect(readMaterials({})).toBeNull();
    expect(readProposeBody({ frame: ZERO, materials: { w1: { item: "ev-000C", material: "Block" } } }, []).materials).toHaveLength(1);
    expect(readProposeBody({ frame: ZERO }, [])).not.toHaveProperty("materials");
  });
  it("PT-3: a photo sets the material only - thickness_mm (or any other key) inside materials is a 400 naming it", () => {
    no(() => readMaterials({ w1: { item: "ev-000C", material: "Concrete", thickness_mm: 200 } }), 400, /a photo sets the material only — materials\.w1\.thickness_mm is not read.*nothing was saved/);
    no(() => readMaterials({ w1: { item: "x", material: "Concrete" } }), 400, /evidence photo's id/);
    no(() => readMaterials({ w1: { item: "ev-000C" } }), 400, /material name/);
    no(() => readMaterials([]), 400, /materials is \{/);
  });
});

describe("wallMaterials - the guideline's Walls materials (D-7-29)", () => {
  it("lists every Walls when.params.Material once, case aside; other categories are not read", () => {
    expect(wallMaterials(G2).values).toEqual(["Concrete", "Block"]);
    expect(wallMaterials(GUIDE(rule("Concrete", "a"), rule("concrete", "b"))).values).toEqual(["concrete"]);
    expect(wallMaterials({ elements: [{ category: "Floors", rules: [rule("Screed", "x")] }] }).values).toEqual([]);
  });
  it("R15: a value inside another (concrete / concrete-block) is a clash, said with both", () => {
    expect(wallMaterials(GUIDE(rule("Concrete", "a"), rule("Concrete-Block", "b"))).clash).toEqual(["Concrete", "Concrete-Block"]);
  });
});

describe("planSurvey with materials - PT-1 / PT-2", () => {
  it("PT-1: with no choice the 200 mm wall is a type gap, On hold", () => {
    const p = plan(null);
    expect(gapped(p, WALL).reason).toMatch(/^type gap — /);
    expect(p.materials).toBeUndefined();
  });
  it("PT-2: the person's Concrete types it BDS_EXT_STR_CONC_200 mm; the reason ends with whose word it is; never pre-ticked; typing.material_from names the photo", () => {
    const p = plan(new Map([[WALL, choice]]));
    expect(gapped(p, WALL)).toBeUndefined();
    const s = p.storeys.find((x) => x.body.elements.some((e) => e.cid === WALL));
    const el = s.body.elements.find((e) => e.cid === WALL);
    expect(el.facts).toMatchObject({ thickness_mm: 200, params: { Material: "Concrete" } });
    expect(el.reason.endsWith(" · material Concrete from photo ev-000C, chosen by lead@example.test")).toBe(true);
    expect(el.reason.length).toBeLessThanOrEqual(500);
    expect(p.materials).toEqual([{ cid: WALL, item: "ev-000C", copy_sha256: "e".repeat(64), material: "Concrete", chosen_by: "lead@example.test" }]);
    const v = validateChangeset(s.body, { member: true, type: typer(), job: { record: { id: "job-0002", ledger_id: 2201, reader: "sentinel-survey 0.1.0" }, byCid: s.byCid } });
    const f = v.elements.find((e) => e.cid === WALL);
    expect(f.place.TypeName).toBe("BDS_EXT_STR_CONC_200 mm");
    expect(f.pretick).toBe(false);
    expect(f.typing).toMatchObject({ typed_by: "bridge", type: "BDS_EXT_STR_CONC_200 mm", material_from: { item: "ev-000C", copy_sha256: "e".repeat(64), read_by: "person", chosen_by: "lead@example.test" } });
    expect(f.typing.input.params.Material).toBe("Concrete");
    expect(f.measured.thickness_mm).toBe(200); // no size came from a photo
  });
  it("a choice no rule answers stays a gap: nothing is guessed", () => {
    const p = plan(new Map([[WALL, { ...choice, material: "Block" }]]), GUIDE(rule("Concrete", "BDS_EXT_STR_CONC_{thickness} mm")));
    expect(gapped(p, WALL)).toBeDefined();
  });
});
