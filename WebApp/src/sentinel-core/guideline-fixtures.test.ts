// Shared guideline fixtures (Promote v1): the TS resolver's own answers over the BDS DD elements rule file and the real
// BDS catalogue, written to fixtures/guideline-dd-cases.json so the add-in's C# port (GuidelineMatcher, checked by
// tools/promote-check) is held to the same family, type, source, confidence and options. Never `why`: C# names the
// catalogue's label, TS "the template". Regenerated on every run; the file is committed, so a resolver change shows up
// as a fixture diff.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolveWithCatalog, type Guideline, type CatalogType, type ResolveInput } from "./guideline";

const OUT = "src/sentinel-core/fixtures/guideline-dd-cases.json";
const G: Guideline = JSON.parse(readFileSync("../demo/bds-pilot/bds-dd-elements-guideline.json", "utf8"));
const CATALOG: CatalogType[] = JSON.parse(readFileSync("../demo/bds-pilot/bds-type-catalog.json", "utf8")).types;

const wall = (Function: string, thicknessMm: number): ResolveInput => ({ category: "Walls", params: { Function }, thicknessMm });
const floor = (Function: string | null, thicknessMm: number): ResolveInput =>
  ({ category: "Floors", params: Function ? { Function, Family: "Floor" } : { Family: "Floor" }, thicknessMm });
const family = (category: string, Family: string, thicknessMm?: number): ResolveInput =>
  (thicknessMm === undefined ? { category, params: { Family } } : { category, params: { Family }, thicknessMm });
const door = (HostFunction: string, w: number, h: number): ResolveInput => ({ category: "Doors", params: { HostFunction, Size: `W${w} x H${h} mm` } });
const window = (w: number, h: number): ResolveInput => ({ category: "Windows", params: { Size: `W${w} x H${h} mm` } });

const INPUTS: ResolveInput[] = [
  wall("Exterior", 200), wall("Interior", 100), wall("Exterior", 150), wall("Foundation", 200),
  floor("Interior", 150), floor("Interior", 300), floor("Interior", 450), floor("Interior", 250), floor("Exterior", 300), floor(null, 300),
  family("Roofs", "Basic Roof", 300), family("Roofs", "Basic Roof", 225), family("Roofs", "Sloped Glazing"),
  family("Ceilings", "Compound Ceiling", 50), family("Ceilings", "Compound Ceiling", 56), family("Ceilings", "Compound Ceiling"), family("Ceilings", "Basic Ceiling"),
  door("Interior", 1000, 2100), door("Interior", 2000, 2100), door("Exterior", 1000, 2100), door("Interior", 915, 2134),
  door("Interior", 10000, 2100), door("Interior", 1000, 21000),
  window(600, 1200), window(800, 1200), window(3600, 3000), window(600, 1300), window(1600, 1200), window(3100, 2900),
];

const cases = INPUTS.map((input) => {
  const r = resolveWithCatalog(G, input, CATALOG);
  return { input, family: r.family || null, type: r.type ?? null, source: r.source, confidence: r.confidence, available: r.available ?? null };
});
const find = (cat: string, pred: (i: ResolveInput) => boolean) => cases.find((c) => c.input.category === cat && pred(c.input))!;

describe("guideline DD fixtures (Promote v1, TS ↔ C#)", () => {
  it("pins the answers Promote depends on", () => {
    expect(cases).toHaveLength(29);
    expect(find("Floors", (i) => i.thicknessMm === 250)).toMatchObject({ source: "rule", confidence: 0,
      available: ["BDS_INT_STR_CONC_150 mm", "BDS_INT_STR_CONC_300 mm", "BDS_INT_STR_CONC_450 mm"] });
    expect(find("Ceilings", (i) => i.params?.Family === "Compound Ceiling" && i.thicknessMm === undefined))
      .toMatchObject({ source: "rule", confidence: 1, type: null });
    expect(find("Doors", (i) => i.params?.Size === "W10000 x H2100 mm")).toMatchObject({ source: "none" });
    expect(find("Windows", (i) => i.params?.Size === "W3600 x H3000 mm")).toMatchObject({ family: "BDS_Window_3 Sliding Panels+FX", type: "3600x3000 mm" });
    expect(find("Windows", (i) => i.params?.Size === "W600 x H1300 mm")).toMatchObject({ source: "none" });
  });

  it("writes fixtures/guideline-dd-cases.json as [{ input, family, type, source, confidence, available }]", () => {
    mkdirSync("src/sentinel-core/fixtures", { recursive: true });
    writeFileSync(OUT, JSON.stringify(cases, null, 2) + "\n");
    expect(JSON.parse(readFileSync(OUT, "utf8"))).toEqual(cases);
  });
});
