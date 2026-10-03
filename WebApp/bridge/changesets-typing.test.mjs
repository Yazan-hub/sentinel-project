// MA-2a: the bridge's typer over the real bundle, the layer-free rule file and the BDS catalogue — the answers and, above
// all, the words of every refusal: a post the bridge cannot type is a 400 that says exactly what is missing.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper, checkFacts, saidOf, KIND_CATEGORY, FACTS_FIELDS, CATALOG_PARAM, KIND_ENTITY, clauseValues, makeCiter } from "./changesets-typing.mjs";
import { VOCABULARY } from "./changesets-logic.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const G = read("../../demo/bds-pilot/bds-dd-layerfree-guideline.json");
const C = read("../../demo/bds-pilot/bds-type-catalog.json");
// The labels and shas the store would hand in (artefact-store refLabel); the shared fixture contract2-typed-body.json uses these.
export const STANDARDS = {
  guideline: { body: G, label: "guideline@1 · office · 0123456789ab…", sha256: "ab".repeat(32) },
  catalog: { body: C, label: "type_catalog@1 · office · fedcba987654…", sha256: "cd".repeat(32) },
};
const NONE = (kind) => ({ body: null, label: `none — not installed for ma2a or its office`, sha256: null, kind });
const type = makeTyper(STANDARDS, core);
const refused = (fn, re) => { try { fn(); throw new Error("no throw"); } catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(re); } };

describe("changesets-typing — the bridge types from the facts, or says what is missing (MA-2a)", () => {
  it("every typed kind has its guideline category; a level or grid has none", () => {
    for (const k of VOCABULARY.filter((k) => k !== "level" && k !== "grid")) expect(KIND_CATEGORY[k], k).toBeTruthy();
    expect(KIND_CATEGORY.level).toBeUndefined();
    expect(FACTS_FIELDS).toEqual(["thickness_mm", "params"]);
  });

  it("types a wall from Location and thickness: the exact catalogue type, the rule's words, who typed it, and which standards decided", () => {
    const t = type("wall", { thickness_mm: 200, params: { Location: "Exterior" } }, "elements[0]");
    expect(t.TypeName).toBe("BDS_EXT_ARC_CMU_200 mm");
    expect(t.FamilyName).toBe("Basic Wall");
    expect(t.typing).toMatchObject({
      typed_by: "bridge", type: "BDS_EXT_ARC_CMU_200 mm", family: "Basic Wall", matched: ["param:Location"],
      input: { category: "Walls", params: { Location: "Exterior" }, thicknessMm: 200 },
      guideline: STANDARDS.guideline.label, guideline_sha256: "ab".repeat(32), catalog: STANDARDS.catalog.label, catalog_sha256: "cd".repeat(32),
    });
    expect(t.typing.rule).toMatch(/^DD \(MA-2a\): an outside wall/);
    // Material and Function as posted, nothing more: the rule on two params wins, and Function alone still answers.
    expect(type("wall", { thickness_mm: 50, params: { Location: "Exterior", Material: "Stone / CMU" } }, "e").TypeName).toBe("BDS_EXT_ARC_STONE_50 mm");
    expect(type("wall", { thickness_mm: 100, params: { Function: "Interior" } }, "e").TypeName).toBe("BDS_INT_ARC_GYPS_100 mm");
  });

  it("the 400s name what is missing, in order: the kind, the guideline, the catalogue, the rule, the thickness, the catalogue type", () => {
    const facts = { thickness_mm: 200, params: { Location: "Exterior" } };
    refused(() => type("level", facts, "elements[0]"), /^elements\[0\]: a level without place\.TypeName is typed by the bridge .* — a level is not typed$/);
    refused(() => makeTyper({ guideline: NONE("guideline"), catalog: STANDARDS.catalog }, core)("wall", facts, "elements[0]"),
      /no guideline is installed for this project or its office \(none — not installed for ma2a or its office\): not checkable; send place\.TypeName, or install guideline@n$/);
    refused(() => makeTyper({ guideline: STANDARDS.guideline, catalog: NONE("type_catalog") }, core)("wall", facts, "elements[0]"),
      /no type catalogue is installed .* a type is chosen from the catalogue only \(D16\); send place\.TypeName, or install type_catalog@n$/);
    refused(() => type("wall", { thickness_mm: 200, params: { Material: "Stone" } }, "elements[2]"),
      /^elements\[2\]: .* no rule of guideline@1 · office · 0123456789ab… matches a wall with Material Stone, 200 mm; send place\.TypeName, or add a layer-free rule for it$/);
    refused(() => type("wall", null, "elements[3]"), /no rule of .* matches a wall with no facts; send/);
    refused(() => type("wall", { params: { Location: "Exterior" } }, "elements[4]"),
      /the rule of guideline@1 · office · 0123456789ab… for Location Exterior names its type with \{thickness\} and no thickness was sent; send place\.TypeName, or send facts\.thickness_mm$/);
    refused(() => type("wall", { thickness_mm: 125, params: { Location: "Interior" } }, "elements[5]"),
      /"BDS_INT_ARC_CMU_125 mm" \(the rule of guideline@1 · office · 0123456789ab… for Location Interior, 125 mm\) is not in type_catalog@1 · office · fedcba987654… — the catalogue has BDS_INT_ARC_CMU_100 mm, BDS_INT_ARC_CMU_150 mm, BDS_INT_ARC_CMU_200 mm, BDS_INT_ARC_CMU_300 mm; send place\.TypeName, or pick one of those$/);
    // A guideline whose Walls block has a default: the default is not an office rule.
    const withDefault = { ...G, elements: [{ ...G.elements[0], default: { family: "Basic Wall", type: "Generic - 200mm" } }] };
    refused(() => makeTyper({ guideline: { ...STANDARDS.guideline, body: withDefault }, catalog: STANDARDS.catalog }, core)("wall", { thickness_mm: 200 }, "elements[6]"),
      /only the Walls default of guideline@1 · office · 0123456789ab… would apply \(confidence 0\.6\) — Sentinel types by an office rule only; send place\.TypeName, or write a rule for 200 mm$/);
  });

  it("a door is typed only when the catalogue holds the rule's family AND type as one row — a type name the catalogue holds under another family is a 400 naming the families it is under", () => {
    // Window and door type names repeat across families (the C# side has CatalogHas(category, family, type) for this): the BDS
    // catalogue holds BDS_INT_1 PNL_WOOD_1000 x 2100 mm under BDS_INT_1 PNL only; BDS_INT_2 PNL is a family with other types.
    const doors = (family) => ({ ...G, elements: [...G.elements, { category: "Doors", rules: [{ when: { params: { Location: "Interior" } }, use: { family, type: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" }, why: "test" }] }] });
    const typer = (family) => makeTyper({ guideline: { ...STANDARDS.guideline, body: doors(family) }, catalog: STANDARDS.catalog }, core);
    expect(typer("BDS_INT_1 PNL")("door", { params: { Location: "Interior" } }, "e")).toMatchObject({ TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", FamilyName: "BDS_INT_1 PNL", typing: { typed_by: "bridge" } });
    refused(() => typer("BDS_INT_2 PNL")("door", { params: { Location: "Interior" } }, "elements[7]"),
      /^elements\[7\]: .* "BDS_INT_2 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm" \(the rule of guideline@1 · office · 0123456789ab… for Location Interior\) is not one type in type_catalog@1 · office · fedcba987654… — the catalogue holds BDS_INT_1 PNL_WOOD_1000 x 2100 mm under BDS_INT_1 PNL; send place\.TypeName, or name that family in the rule$/);
  });

  it("checkFacts keeps thickness_mm and params name for name and refuses what it cannot keep", () => {
    expect(checkFacts(undefined, "e")).toBeNull();
    expect(checkFacts({}, "e")).toEqual({});
    expect(checkFacts({ thickness_mm: 200, params: { Function: "Exterior", "Fire Rating": "FR60" } }, "e")).toEqual({ thickness_mm: 200, params: { Function: "Exterior", "Fire Rating": "FR60" } });
    refused(() => checkFacts([], "e"), /^e: facts must be an object \{thickness_mm\?, params\?\}$/);
    refused(() => checkFacts({ thickness_mm: 200, measured: true }, "e"), /^e: facts takes only thickness_mm and params \(got measured\)$/);
    for (const t of [0, -1, "200", NaN, 10001]) refused(() => checkFacts({ thickness_mm: t }, "e"), /facts\.thickness_mm must be a number of mm above 0 and at most 10000/);
    refused(() => checkFacts({ params: ["Exterior"] }, "e"), /facts\.params must be an object of parameter name: value/);
    refused(() => checkFacts({ params: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`p${i}`, "v"])) }, "e"), /facts\.params holds at most 20 parameters \(got 21\)/);
    refused(() => checkFacts({ params: { "": "x" } }, "e"), /a parameter name that is not one line of at most 64 characters/);
    refused(() => checkFacts({ params: { Location: 7 } }, "e"), /^e: facts\.params\.Location must be one line of text of at most 256 characters$/);
    refused(() => checkFacts({ params: { Location: "Ext\nerior" } }, "e"), /facts\.params\.Location must be one line/);
  });

  it("saidOf puts the facts in words", () => {
    expect(saidOf({ thickness_mm: 200, params: { Function: "Exterior", Location: "Exterior" } })).toBe("Function Exterior, Location Exterior, 200 mm");
    expect(saidOf({ params: { Material: "Stone" } })).toBe("Material Stone");
    expect(saidOf(null)).toBe("no facts");
    expect(saidOf({})).toBe("no facts");
  });
});

// MA-2c: a set_parameter's value comes from a cited source the bridge checks — the catalogue row of exactly that type, or the one
// value every whole-class clause of the installed ids@n pins. The shared fixture is the add-in's reading too (tools/promote-check).
describe("changesets-typing — where a set_parameter's value comes from (MA-2c)", () => {
  const VS = read("./fixtures/changeset-ops/value-sources.json");
  const SRC = {
    catalog: { body: VS.catalog, label: "type_catalog@2 · office · fedcba987654…", sha256: "cd".repeat(32) },
    ids: { body: VS.ids, label: "ids@1 · project · 0a1b2c3d4e5f…", sha256: "ef".repeat(32) },
  };
  const cite = makeCiter(SRC, core);
  const WALL = { TypeName: "BDS_EXT_ARC_CMU_200 mm" };
  const DOOR = { FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" };

  it("the catalogue parameter and the IFC entity of each kind are the shared fixture's (the add-in reads the same table)", () => {
    expect(CATALOG_PARAM).toEqual(VS.catalog_param);
    expect(KIND_ENTITY).toEqual(VS.kind_entity);
  });

  it("clauseValues reads every shared case as the add-in's Clauses does: a whole-class clause's one exact value, nothing else", () => {
    for (const c of VS.clauses) {
      const got = clauseValues(VS.ids, c.entity, c.key);
      expect(got.map((h) => h.value), c.name).toEqual(c.values);
      if (c.spec) expect(got[0], c.name).toMatchObject({ spec: c.spec, sentence: c.sentence });
    }
    expect(clauseValues(null, "IFCDOOR", "Pset_DoorCommon.FireRating")).toEqual([]);
    expect(clauseValues({ specifications: [{ name: "bad", applicability: { entity: "(" }, requirements: { properties: [] } }] }, "IFCDOOR", "x.y")).toEqual([]);
  });

  it("a catalogue source holds when exactly one row of that type gives exactly that value; the record names the catalogue, the type and the parameter", () => {
    expect(cite("wall", WALL, "Pset_WallCommon.FireRating", "60 min", { kind: "catalogue" }, "elements[1]"))
      .toEqual({ kind: "catalogue", ref: "type_catalog@2 · office · fedcba987654… · BDS_EXT_ARC_CMU_200 mm · Fire Rating", sha256: "cd".repeat(32) });
    refused(() => cite("wall", WALL, "Pset_WallCommon.FireRating", "120 min", { kind: "catalogue" }, "elements[1]"),
      /^elements\[1\]: set_parameter's value_source: type_catalog@2 · office · fedcba987654… gives BDS_EXT_ARC_CMU_200 mm Fire Rating "60 min", not "120 min" — a value is written only as its source holds it$/);
    refused(() => cite("wall", { TypeName: "BDS_INT_ARC_GYPS_100 mm" }, "Pset_WallCommon.FireRating", "30 min", { kind: "catalogue" }, "e"),
      /gives BDS_INT_ARC_GYPS_100 mm Fire Rating "", not "30 min"/);
    refused(() => cite("wall", { TypeName: "BDS_EXT_ARC_CMU_212 mm" }, "Pset_WallCommon.FireRating", "60 min", { kind: "catalogue" }, "e"),
      /type_catalog@2 · office · fedcba987654… has no row for Walls BDS_EXT_ARC_CMU_212 mm — one row is one source$/);
    refused(() => cite("door", { FamilyName: "BDS_INT_2 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" }, "Pset_DoorCommon.FireRating", "FD30", { kind: "catalogue" }, "e"),
      /has no row for Doors BDS_INT_2 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm/);
    refused(() => cite("window", { FamilyName: "W", TypeName: "T" }, "Pset_WindowCommon.ThermalTransmittance", "1.4", { kind: "catalogue" }, "e"),
      /the catalogue harvests no parameter for Pset_WindowCommon\.ThermalTransmittance — a person fills it$/);
    refused(() => makeCiter({ ...SRC, catalog: NONE("type_catalog") }, core)("wall", WALL, "Pset_WallCommon.FireRating", "60 min", { kind: "catalogue" }, "e"),
      /is the catalogue, and no type catalogue is installed for this project or its office \(none — not installed for ma2a or its office\): not checkable$/);
  });

  it("a clause source holds when the whole-class clauses pin exactly that one value; the record cites the clause's sentence", () => {
    expect(cite("door", DOOR, "Pset_DoorCommon.FireRating", "FD30", { kind: "clause" }, "elements[2]"))
      .toEqual({ kind: "clause", ref: 'ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · "All doors shall be FD30."', sha256: "ef".repeat(32) });
    refused(() => cite("door", DOOR, "Pset_DoorCommon.FireRating", "FD60", { kind: "clause" }, "e"), /ids@1 · project · 0a1b2c3d4e5f… pins "FD30" for Pset_DoorCommon\.FireRating, not "FD60"/);
    refused(() => cite("wall", WALL, "Pset_WallCommon.FireRating", "REI60", { kind: "clause" }, "e"),
      /no clause of ids@1 · project · 0a1b2c3d4e5f… pins one value of Pset_WallCommon\.FireRating for every IFCWALL$/);
    refused(() => cite("roof", { TypeName: "R" }, "Pset_RoofCommon.FireRating", "REI30", { kind: "clause" }, "e"),
      /the clauses of ids@1 · project · 0a1b2c3d4e5f… pin "REI30" and "REI60" for Pset_RoofCommon\.FireRating — they disagree; a person decides$/);
    refused(() => makeCiter({ ...SRC, ids: NONE("ids") }, core)("door", DOOR, "Pset_DoorCommon.FireRating", "FD30", { kind: "clause" }, "e"),
      /is a clause, and no ids@n is installed for this project or its office \(none — not installed for ma2a or its office\): not checkable$/);
  });

  it("both sources are read whichever is cited: a catalogue and a clause that disagree are a 400 either way — the planner's 'disagree', at the bridge (review amendment C1)", () => {
    const D2 = { FamilyName: "BDS_INT_2 PNL", TypeName: "BDS_INT_2 PNL_WOOD_2000 x 2100 mm" };
    const both = '"FD60" \\(type_catalog@2 · office · fedcba987654… · BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm · Fire Rating\\) and "FD30" \\(ids@1 · project · 0a1b2c3d4e5f… · Doors carry FD30 · "All doors shall be FD30\\."\\) — a person decides$';
    refused(() => cite("door", D2, "Pset_DoorCommon.FireRating", "FD60", { kind: "catalogue" }, "e"),
      new RegExp("^e: set_parameter's value_source: the sources disagree on Pset_DoorCommon\\.FireRating for BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm: " + both));
    refused(() => cite("door", D2, "Pset_DoorCommon.FireRating", "FD30", { kind: "clause" }, "e"), new RegExp("the sources disagree on Pset_DoorCommon\\.FireRating for .*: " + both));
    // A wall's catalogue cite is not met by the shared ids' floor or narrowed clauses: they pin nothing (C7, F2).
    expect(cite("wall", WALL, "Pset_WallCommon.FireRating", "60 min", { kind: "catalogue" }, "e").kind).toBe("catalogue");
  });
});
