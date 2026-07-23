import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveType, resolveWithCatalog, validateAgainstCatalog,
  type Guideline, type CatalogType,
} from "./guideline";

const G: Guideline = JSON.parse(readFileSync("../SentinelAddin/Resources/bds-guideline.json", "utf8"));
const CATALOG: CatalogType[] = JSON.parse(
  readFileSync("../demo/bds-pilot/bds-type-catalog.json", "utf8"),
).types;

describe("BDS guideline — every name it uses is real", () => {
  it("names no family or type the template lacks", () => {
    // The guard against the mistake that shipped once: a guideline written from a document named
    // BDS_Wall_Ext_200_FR60, which does not exist, and the builder would have invented it.
    expect(validateAgainstCatalog(G, CATALOG)).toEqual([]);
  });
});

describe("BDS guideline — walls: material is the rule, thickness is measured", () => {
  it("an external architectural wall measured at 200mm resolves to the real CMU type", () => {
    const r = resolveWithCatalog(G, { category: "Walls", layer: "A-WALL-EXT", thicknessMm: 200 }, CATALOG);
    expect(r.type).toBe("BDS_EXT_ARC_CMU_200 mm");
    expect(r.confidence).toBe(1);
  });

  it("the same layer at a different measured thickness picks a different real type", () => {
    expect(resolveWithCatalog(G, { category: "Walls", layer: "A-WALL-EXT", thicknessMm: 300 }, CATALOG).type)
      .toBe("BDS_EXT_ARC_CMU_300 mm");
  });

  it("a structural external wall is concrete, not CMU", () => {
    expect(resolveWithCatalog(G, { category: "Walls", layer: "A-WALL-EXT", discipline: "S", thicknessMm: 250 }, CATALOG).type)
      .toBe("BDS_EXT_STR_CONC_250 mm");
  });

  it("the spec can override the material without touching the thickness", () => {
    expect(resolveWithCatalog(G, { category: "Walls", layer: "A-WALL-EXT", thicknessMm: 50, params: { Material: "STONE" } }, CATALOG).type)
      .toBe("BDS_EXT_ARC_STONE_50 mm");
  });

  it("internal partitions default to gypsum", () => {
    expect(resolveWithCatalog(G, { category: "Walls", layer: "A-WALL-INT", thicknessMm: 100 }, CATALOG).type)
      .toBe("BDS_INT_ARC_GYPS_100 mm");
  });

  it("a measured thickness the template has no type for is REPORTED, never invented", () => {
    // 275mm CMU does not exist. The office must add it or the reviewer picks — the builder must not guess.
    const r = resolveWithCatalog(G, { category: "Walls", layer: "A-WALL-EXT", thicknessMm: 275 }, CATALOG);
    expect(r.confidence).toBe(0);
    expect(r.why).toMatch(/not in the template/);
    expect(r.available).toEqual([
      "BDS_EXT_ARC_CMU_100 mm", "BDS_EXT_ARC_CMU_200 mm",
      "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_400 mm",
    ]);
  });

  it("a DWG measurement of 199.6mm still finds the 200mm type", () => {
    expect(resolveWithCatalog(G, { category: "Walls", layer: "A-WALL-EXT", thicknessMm: 199.6 }, CATALOG).type)
      .toBe("BDS_EXT_ARC_CMU_200 mm");
  });

  it("with no measurement there is no type to resolve — a gap, not a default size", () => {
    expect(resolveType(G, { category: "Walls", layer: "A-WALL-EXT" }).type).toBeUndefined();
  });
});

describe("BDS guideline — determinism", () => {
  it("the same input yields the same type every time", () => {
    const input = { category: "Walls", layer: "A-WALL-EXT", thicknessMm: 200 };
    const runs = Array.from({ length: 20 }, () => resolveWithCatalog(G, input, CATALOG).type);
    expect(new Set(runs).size).toBe(1);
  });
});
