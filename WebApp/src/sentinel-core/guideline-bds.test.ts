import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveType, resolveWithCatalog, validateAgainstCatalog, validateGuideline,
  type Guideline, type CatalogType,
} from "./guideline";

const G: Guideline = JSON.parse(readFileSync("../demo/bds-pilot/bds-guideline.json", "utf8"));
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

  it("a wall on the structural layer (S-WALL) is concrete, not CMU", () => {
    // Structural walls live on S-WALL, not on an arch layer with discipline S — an A- layer is
    // always discipline A, so the old rule could never fire on a real drawing.
    expect(resolveWithCatalog(G, { category: "Walls", layer: "S-WALL", thicknessMm: 250 }, CATALOG).type)
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

describe("BDS guideline — graphics and views name real things", () => {
  const raw = JSON.parse(readFileSync("../demo/bds-pilot/bds-guideline.json", "utf8"));
  const CAT = JSON.parse(readFileSync("../demo/bds-pilot/bds-type-catalog.json", "utf8"));
  const families = new Set<string>(CAT.types.map((t: any) => t.family.toLowerCase()));
  const templates = new Set<string>(CAT.view_templates.map((v: any) => v.name));

  it("every tag family exists in the template", () => {
    const missing = Object.entries(raw.graphics.tags)
      .filter(([, v]: [string, any]) => !families.has(String(v.family).toLowerCase()))
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it("every view template named is one the template actually has", () => {
    const missing = raw.views
      .flatMap((v: any) => [v.wipTemplate, v.sheetTemplate].filter(Boolean))
      .filter((n: string) => !templates.has(n));
    expect(missing).toEqual([]);
  });

  it("flags which tags are still stock Revit rather than office-authored", () => {
    const stock = Object.entries(raw.graphics.tags)
      .filter(([, v]: [string, any]) => v.officeAuthored === false)
      .map(([k]) => k);
    // Not a failure — a recorded gap in the office standard. Asserting it so a future
    // BDS-authored tag makes this test fail and forces the guideline to be updated.
    expect(stock.sort()).toEqual(
      ["Casework", "Ceilings", "Columns", "Floors", "Furniture", "Stairs", "Walls"],
    );
  });

  it("does not invent a dimension or text style — neither is harvestable yet", () => {
    expect(raw.graphics.dimensionStyle).toBeNull();
    expect(raw.graphics.textStyle).toBeNull();
  });
});

describe("BDS DD elements rule file (Promote v1)", () => {
  const DD: Guideline = JSON.parse(readFileSync("../demo/bds-pilot/bds-dd-elements-guideline.json", "utf8"));
  const WALLS: Guideline = JSON.parse(readFileSync("../demo/bds-pilot/bds-dd-walls-guideline.json", "utf8"));
  const block = (g: Guideline, cat: string) => g.elements.find((e) => e.category === cat);
  const explicit = DD.elements.flatMap((e) => e.rules.filter((r) => r.use.type).map((r) => ({ category: e.category, r })));

  it("is a valid guideline whose every family, type and pattern is in the BDS catalogue", () => {
    expect(validateGuideline(DD)).toEqual([]);
    expect(validateAgainstCatalog(DD, CATALOG)).toEqual([]);
  });

  it("every explicit rule names one catalogue row by (category, family, type)", () => {
    expect(explicit.length).toBe(16);
    for (const { category, r } of explicit)
      expect(CATALOG.filter((c) => c.category === category && c.family === r.use.family && c.type === r.use.type)).toHaveLength(1);
  });

  it("every door and window rule's Size is its own type name's W x H", () => {
    for (const { category, r } of explicit.filter((x) => x.category === "Doors" || x.category === "Windows")) {
      const m = /(\d+)\s*x\s*(\d+)\s*mm/i.exec(r.use.type ?? "");
      expect(r.when.params?.Size, category + " " + r.use.type).toBe(`W${m?.[1]} x H${m?.[2]} mm`);
    }
  });

  it("its Walls block is the walls file's, unchanged", () => {
    expect(block(DD, "Walls")).toEqual(block(WALLS, "Walls"));
  });
});
