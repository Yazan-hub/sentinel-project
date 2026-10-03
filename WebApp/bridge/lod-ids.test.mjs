// MA-2b (design §3.4 step 5): the DD stage IDS made from a lod_matrix — matrixToIds, beside STANDARD_PSETS in ids-compile.mjs —
// and the route the add-in reads it from. The test judges a set of elements, shaped as Revit's GovernedElementExtractor writes
// them, with sentinel-core's validateElement (the bundle the bridge adjudicates with), and writes the elements and the failures
// to fixtures/lod-matrix/ids-cases.json — tools/promote-check holds the add-in's C# judge (StageIds) to the same answers.
// Written to a temp name and renamed into place, so a parallel worker never reads half a file.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { matrixToIds, CATEGORY_ENTITY, STANDARD_PSETS } from "./ids-compile.mjs";
import { parseLodMatrix, validateElement } from "./sentinel-core.mjs";
import { lodMatrixIds, putArtefact } from "./artefact-store.mjs";

const OUT = new URL("./fixtures/lod-matrix/ids-cases.json", import.meta.url);
const MATRIX = {
  standard_key: "MA2B-LOD-001", semver: "0.1.0", status: "draft", stage_map: { CD: "coord" },
  rows: [
    { category: "Walls", DD: { type: "guideline_rule", level: "story_level", top: "next_story_level", properties: ["Pset_WallCommon.FireRating", "IsExternal", "Pset_WallCommon.LoadBearing"] } },
    { category: "Floors", DD: { type: "guideline_rule", level: "story_level", properties: ["Combustible"] } },
    { category: "Ceilings", DD: { type: "guideline_rule", level: "story_level", properties: ["AcousticRating"] } },
    { category: "Doors", DD: { type: "guideline_rule", level: "story_level", host: "wall", properties: ["Pset_DoorCommon.FireRating"] } },
    { category: "Windows", DD: { type: "guideline_rule", level: "story_level", host: "wall" } },
  ],
};
const el = (name, Class, rows) => ({ name, identity: { Class, Name: name }, psets: rows.length ? [{ name: rows[0][0], rows: rows.map(([, n, v]) => ({ name: n, value: v })) }] : [] });
const ELEMENTS = [
  el("wall rated", "IFCWALL", [["Pset_WallCommon", "IsExternal", "True"], ["Pset_WallCommon", "FireRating", "60"]]),
  el("wall unrated", "IFCWALL", [["Pset_WallCommon", "IsExternal", "False"]]),
  el("wall blank rating", "IFCWALL", [["Pset_WallCommon", "IsExternal", "True"], ["Pset_WallCommon", "FireRating", ""]]),
  el("door rated", "IFCDOOR", [["Pset_DoorCommon", "FireRating", "FD30"]]),
  el("door unrated", "IFCDOOR", []),
  el("ceiling", "IFCCOVERING", []),
  el("window", "IFCWINDOW", []),
  el("column", "IFCCOLUMN", []),
];

describe("matrixToIds (MA-2b)", () => {
  const out = matrixToIds(parseLodMatrix(MATRIX), { label: "lod_matrix@1 · office · abababababab…" });
  it("one specification per row that asks for properties, in compileIds' IDS shape, warn — a qualified name as written, a bare one in its class's standard pset", () => {
    expect(out.title).toBe("MA2B-LOD-001 0.1.0 · DD (lod_matrix@1 · office · abababababab…)");
    expect(out.enforce).toBe("warn");
    expect(out.specifications.map((s) => [s.name, s.applicability.entity])).toEqual([
      ["Walls · DD", "IFCWALL"], ["Ceilings · DD", "IFCCOVERING"], ["Doors · DD", "IFCDOOR"]]);
    expect(out.specifications[0].requirements).toEqual({ attributes: [], properties: [
      { pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" },
      { pset: "Pset_WallCommon", name: "IsExternal", cardinality: "required" },
      { pset: "Pset_WallCommon", name: "LoadBearing", cardinality: "required" }] });
    expect(out.specifications[1].requirements.properties).toEqual([{ pset: "Pset_CoveringCommon", name: "AcousticRating", cardinality: "required" }]);
  });
  it("a bare name no standard pset holds for the class is said in unmatched, never dropped; Floors keep no specification", () => {
    expect(out.unmatched).toEqual([{ category: "Floors", property: "Combustible", reason: "no standard property set holds Combustible for IFCSLAB — name it as Pset_X.Combustible" }]);
    expect(STANDARD_PSETS.IFCCOVERING.FireRating).toBe("Pset_CoveringCommon"); // ceilings: the matrix's Ceilings row
    expect(Object.keys(CATEGORY_ENTITY)).toEqual(["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"]);
  });
  it("judged by validateElement, written to the shared fixture the add-in's StageIds reads", () => {
    const ids = { title: out.title, enforce: out.enforce, specifications: out.specifications };
    const cases = ELEMENTS.map((e) => { const r = validateElement(ids, e); return { ...e, in_scope: r.inScope, failures: r.failures.map((f) => f.requirement) }; });
    expect(cases.map((c) => [c.name, c.failures])).toEqual([
      ["wall rated", ["Pset_WallCommon.LoadBearing"]],
      ["wall unrated", ["Pset_WallCommon.FireRating", "Pset_WallCommon.LoadBearing"]],
      ["wall blank rating", ["Pset_WallCommon.FireRating", "Pset_WallCommon.LoadBearing"]],
      ["door rated", []], ["door unrated", ["Pset_DoorCommon.FireRating"]],
      ["ceiling", ["Pset_CoveringCommon.AcousticRating"]], ["window", []], ["column", []]]);
    const tmp = new URL("./fixtures/lod-matrix/ids-cases.json.tmp", import.meta.url);
    writeFileSync(tmp, JSON.stringify({ ids, unmatched: out.unmatched, cases }, null, 2) + "\n");
    renameSync(tmp, OUT);
    expect(JSON.parse(readFileSync(OUT, "utf8")).cases).toHaveLength(8);
  });
});

describe("matrixToIds — what a matrix names twice, or in another class's set (MA-2b, review C9)", () => {
  const one = (properties) => matrixToIds(parseLodMatrix({ standard_key: "X", semver: "1.0.0", rows: [{ category: "Walls", DD: { type: "guideline_rule", properties } }] }));
  it("a property named bare and qualified is required once", () => {
    expect(one(["FireRating", "Pset_WallCommon.FireRating"]).specifications[0].requirements.properties).toEqual([{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" }]);
  });
  it("a standard set of another class is said in unmatched, never required; a set no standard names is kept as written", () => {
    const r = one(["Pset_DoorCommon.FireRating", "BDS_Identity.Code"]);
    expect(r.unmatched).toEqual([{ category: "Walls", property: "Pset_DoorCommon.FireRating", reason: "Pset_DoorCommon is not a standard set of IFCWALL (Pset_WallCommon) — name it in its class's set" }]);
    expect(r.specifications[0].requirements.properties).toEqual([{ pset: "BDS_Identity", name: "Code", cardinality: "required" }]);
  });
});

describe("lodMatrixIds — GET /cde/:key/artefacts/lod_matrix/ids (MA-2b)", () => {
  const mem = (parentKey = null) => {
    const docs = new Map(), k = (s, p, d) => `${s}|${p}|${d}`;
    return {
      ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
      docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
      docInsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      audit: async () => {}, requireMinRole: async () => {},
      officeKeyOf: async () => parentKey,
      officeArtefact: async (key, kind) => { const p = docs.get(k("artefact", `uuid-${key}`, kind)); return p ? docs.get(k("artefact", `uuid-${key}`, `${kind}@${p.version}`)) ?? null : null; },
    };
  };
  it("derives the DD IDS from the matrix in force (project → office), names it, and installs nothing", async () => {
    const d = mem("ma2b-office");
    await putArtefact("ma2b-office", "lod_matrix", MATRIX, { actor: "lead" }, d);
    const r = await lodMatrixIds("ma2b", d);
    expect(r.matrix).toMatch(/^lod_matrix@1 · office · [0-9a-f]{12}…$/);
    expect(r).toMatchObject({ stage: "DD", project_stage: "design", unmatched: [{ category: "Floors", property: "Combustible" }] });
    expect(r.ids.specifications).toHaveLength(3);
    expect(r.ids.title).toBe(`MA2B-LOD-001 0.1.0 · DD (${r.matrix})`);
    await expect(lodMatrixIds("ma2b-orphan", mem())).rejects.toMatchObject({ status: 404, message: "no lod_matrix installed for ma2b-orphan or its office" });
  });
});
