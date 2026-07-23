import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveType, validateGuideline, type Guideline } from "./guideline";

const G: Guideline = JSON.parse(readFileSync("../SentinelAddin/Resources/bds-guideline.json", "utf8"));

describe("the shipped BDS guideline", () => {
  it("is structurally valid", () => expect(validateGuideline(G)).toEqual([]));

  it("a plain external wall gets the standard 200 type", () => {
    const r = resolveType(G, { category: "Walls", layer: "A-WALL-EXT" });
    expect(r.source).toBe("rule");
    expect(r.family).toBe("BDS_Wall_Ext");
  });

  it("an FR60 external wall gets the RATED type — the thing a flat layer map cannot do", () => {
    const r = resolveType(G, { category: "Walls", layer: "A-WALL-EXT", params: { "Fire Rating": "FR60" } });
    expect(r.type).toBe("BDS_Wall_Ext_200_FR60");
  });

  it("an FR120 external wall gets the 300 cavity build-up", () => {
    expect(resolveType(G, { category: "Walls", layer: "A-WALL-EXT", params: { FireRating: "FR120" } }).type)
      .toBe("BDS_Wall_Ext_300_FR120");
  });

  it("a ground-floor slab is RC 200; the same layer elsewhere is not", () => {
    expect(resolveType(G, { category: "Floors", layer: "A-FLOR", level: "Ground" }).type).toBe("BDS_Floor_200_RC");
    expect(resolveType(G, { category: "Floors", layer: "A-FLOR", level: "Level 3" }).type).toBeUndefined();
  });

  it("an unknown wall layer falls back to the office default, not a guess", () => {
    expect(resolveType(G, { category: "Walls", layer: "RANDOM-CONSULTANT-LAYER" }).source).toBe("default");
  });
});
