// MA-2a: the layer-free rules — Function, Location (inside or outside, from the outer boundary) and Material as when.params —
// resolved by the TS resolver over demo/bds-pilot/bds-dd-layerfree-guideline.json and the real BDS catalogue, and written to
// fixtures/guideline-layerfree-cases.json so the add-in's C# port (GuidelineMatcher, tools/promote-check ResolverParityLayerFree)
// and the bridge's bundle (bridge/sentinel-core-bundle.test.mjs) give the same family, type, source, confidence, options and
// matched conditions. A case may carry its own `catalog` rows (BOS-5: a row whose category is a localized name and whose `bic`
// is the BuiltInCategory); the others resolve against the BDS catalogue. Never `why`. Regenerated on every run and committed —
// written to a temp name and renamed into place, so a parallel vitest worker reading it never sees a half-written file.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { resolveWithCatalog, validateGuideline, validateAgainstCatalog, CATEGORY_BIC, type Guideline, type CatalogType, type ResolveInput } from "./guideline";

const OUT = "src/sentinel-core/fixtures/guideline-layerfree-cases.json";
const G: Guideline = JSON.parse(readFileSync("../demo/bds-pilot/bds-dd-layerfree-guideline.json", "utf8"));
const CATALOG: CatalogType[] = JSON.parse(readFileSync("../demo/bds-pilot/bds-type-catalog.json", "utf8")).types;

const wall = (params: Record<string, string>, thicknessMm?: number): ResolveInput =>
  (thicknessMm === undefined ? { category: "Walls", params } : { category: "Walls", params, thicknessMm });
// A catalogue harvested on a German Revit: the category is "Wände", the BuiltInCategory says OST_Walls (BOS-5).
const GERMAN: CatalogType[] = [
  { category: "Wände", bic: "OST_Walls", family: "Basic Wall", type: "BDS_EXT_ARC_CMU_200 mm", width_mm: 200 },
  { category: "Wände", bic: "OST_Walls", family: "Basic Wall", type: "BDS_EXT_ARC_CMU_300 mm", width_mm: 300 },
  { category: "Türen", bic: "OST_Doors", family: "BDS_INT_1 PNL", type: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", width_mm: null },
];
// The same rows from a harvest before BOS-5: the localized name alone, no bic — the catalogue cannot answer for "Walls".
const GERMAN_NO_BIC: CatalogType[] = GERMAN.map(({ bic: _b, ...c }) => c);

// The same file with its two-param rules listed LAST. The winner is unchanged (specificity first), and a gap's `available` must be
// the WINNER's sizes: a document-order search listed the Location rule's CMU sizes for a GYPS gap (review of MA-2a).
const REORDERED: Guideline = { ...G, elements: [{ ...G.elements[0], rules: [...G.elements[0].rules.slice(2), ...G.elements[0].rules.slice(0, 2)] }] };

const INPUTS: { input: ResolveInput; catalog?: CatalogType[]; guideline?: Guideline }[] = [
  { input: wall({ Location: "Exterior" }, 200) }, { input: wall({ Location: "Interior" }, 200) }, { input: wall({ Location: "Interior" }, 100) },
  { input: wall({ Location: "Interior", Function: "Exterior" }, 100) },           // Location is listed first: it wins the tie
  { input: wall({ Function: "Exterior" }, 200) }, { input: wall({ Function: "Interior" }, 100) },
  { input: wall({ Location: "Exterior", Material: "Stone / Concrete Masonry Units" }, 50) },
  { input: wall({ Location: "Exterior", Material: "Stone" }, 200) },             // STONE_200 is not a BDS type: options
  { input: wall({ Location: "Interior", Material: "Gypsum Wall Board / Metal Stud" }, 100) },
  { input: wall({ Location: "Interior", Material: "Default Wall" }, 200) },      // a material no rule names: the Location rule
  { input: wall({ Location: "Interior" }, 125) },                                // the planted gap: CMU_125 is not a BDS type
  { input: wall({ Material: "Stone" }, 200) }, { input: wall({}, 200) }, { input: wall({ Location: "Exterior" }) }, // nothing guessed; no thickness, no type
  { input: wall({ Location: "Exterior" }, 200), catalog: GERMAN }, { input: wall({ Location: "Exterior" }, 200), catalog: GERMAN_NO_BIC },
  { input: wall({ Location: "Exterior" }, 150), catalog: GERMAN },               // bic also finds the options
  { input: wall({ Location: "Interior" }, 100.5) },                              // half a millimetre rounds UP on both sides: CMU_101, a gap (C# was to-even: CMU_100)
  { input: wall({ Location: "Interior", Material: "Gypsum Wall Board" }, 125), guideline: REORDERED }, // a GYPS gap lists GYPS sizes, whatever the file's order
  { input: wall({ "Loca tion": "Exterior" }, 200) },                       // a poster's NBSP in a fact name: every whitespace is squashed on both sides
];

const cases = INPUTS.map(({ input, catalog, guideline }) => {
  const r = resolveWithCatalog(guideline ?? G, input, catalog ?? CATALOG);
  return { input, ...(catalog ? { catalog } : {}), ...(guideline ? { guideline } : {}), family: r.family || null, type: r.type ?? null, source: r.source, confidence: r.confidence, available: r.available ?? null, matched: r.matched ?? null };
});
const find = (pred: (c: (typeof cases)[number]) => boolean) => cases.find(pred)!;
const P = (c: (typeof cases)[number]) => c.input.params ?? {};

describe("guideline layer-free fixtures (MA-2a, TS ↔ C# ↔ bridge bundle)", () => {
  it("the rule file is a guideline every type of which the BDS catalogue has, with no layer on any rule", () => {
    expect(validateGuideline(G)).toEqual([]);
    expect(validateAgainstCatalog(G, CATALOG)).toEqual([]);
    expect(G.elements.flatMap((e) => e.rules).every((r) => r.when.layer === undefined && Object.keys(r.when.params ?? {}).length > 0)).toBe(true);
  });

  it("pins the answers Promote, Ghost Builder and the bridge depend on", () => {
    expect(cases).toHaveLength(20);
    expect(find((c) => P(c).Location === "Exterior" && c.input.thicknessMm === 200 && !c.catalog)).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", source: "rule", confidence: 1 });
    expect(find((c) => P(c).Location === "Interior" && c.input.thicknessMm === 200 && !P(c).Material)).toMatchObject({ type: "BDS_INT_ARC_CMU_200 mm", confidence: 1 });
    expect(find((c) => P(c).Location === "Interior" && P(c).Function === "Exterior")).toMatchObject({ type: "BDS_INT_ARC_CMU_100 mm", confidence: 1 });
    expect(find((c) => P(c).Function === "Interior" && !P(c).Location)).toMatchObject({ type: "BDS_INT_ARC_GYPS_100 mm", confidence: 1 });
    expect(find((c) => P(c).Material === "Stone / Concrete Masonry Units")).toMatchObject({ type: "BDS_EXT_ARC_STONE_50 mm", confidence: 1 });
    expect(find((c) => P(c).Material === "Stone" && P(c).Location === "Exterior")).toMatchObject({ type: "BDS_EXT_ARC_STONE_200 mm", confidence: 0, available: ["BDS_EXT_ARC_STONE_50 mm"] });
    expect(find((c) => P(c).Material === "Gypsum Wall Board / Metal Stud")).toMatchObject({ type: "BDS_INT_ARC_GYPS_100 mm", confidence: 1 });
    expect(find((c) => P(c).Material === "Default Wall")).toMatchObject({ type: "BDS_INT_ARC_CMU_200 mm", confidence: 1 });
    expect(find((c) => c.input.thicknessMm === 125)).toMatchObject({ confidence: 0, available: ["BDS_INT_ARC_CMU_100 mm", "BDS_INT_ARC_CMU_150 mm", "BDS_INT_ARC_CMU_200 mm", "BDS_INT_ARC_CMU_300 mm"] });
    expect(find((c) => P(c).Material === "Stone" && !P(c).Location)).toMatchObject({ source: "none", confidence: 0 });
    expect(find((c) => Object.keys(P(c)).length === 0)).toMatchObject({ source: "none" });
    expect(find((c) => c.input.thicknessMm === undefined)).toMatchObject({ source: "rule", confidence: 1, type: null });
    expect(find((c) => c.input.thicknessMm === 100.5)).toMatchObject({ type: "BDS_INT_ARC_CMU_101 mm", confidence: 0 });
    expect(find((c) => "Loca tion" in P(c))).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", confidence: 1, matched: ["param:Location"] });
    expect(find((c) => c.guideline === REORDERED)).toMatchObject({ type: "BDS_INT_ARC_GYPS_125 mm", confidence: 0, available: ["BDS_INT_ARC_GYPS_50 mm", "BDS_INT_ARC_GYPS_100 mm"], matched: ["param:Location", "param:Material"] });
  });

  it("BOS-5: a catalogue row answers for a guideline category by its BuiltInCategory, not only by its name", () => {
    expect(CATEGORY_BIC.Walls).toBe("OST_Walls");
    expect(find((c) => c.catalog === GERMAN && c.input.thicknessMm === 200)).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", confidence: 1 });
    expect(find((c) => c.catalog === GERMAN_NO_BIC)).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", confidence: 0, available: [] });
    expect(find((c) => c.catalog === GERMAN && c.input.thicknessMm === 150)).toMatchObject({ confidence: 0, available: ["BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm"] });
    // The category is found through the bic: only the patterns these two rows cannot fill are reported, never "no types".
    expect(validateAgainstCatalog(G, GERMAN).filter((e) => !e.includes("pattern"))).toEqual([]);
    expect(validateAgainstCatalog(G, GERMAN_NO_BIC)).toEqual(['"Walls" — the template has no types in this category at all.']);
  });

  it("writes fixtures/guideline-layerfree-cases.json as [{ input, catalog?, family, type, source, confidence, available, matched }]", () => {
    mkdirSync("src/sentinel-core/fixtures", { recursive: true });
    writeFileSync(OUT + ".tmp", JSON.stringify(cases, null, 2) + "\n");
    renameSync(OUT + ".tmp", OUT); // atomic: bridge/sentinel-core-bundle.test.mjs reads this file in a parallel worker
    expect(JSON.parse(readFileSync(OUT, "utf8"))).toEqual(cases);
  });
});

// The drill's Ghost Builder guideline: a layer rule and layer-free rules in one Walls block (demo/ghost-sample/ma2a-ghost-guideline.json).
describe("a layer rule and layer-free rules together (drill MA2a's Ghost guideline)", () => {
  const M: Guideline = JSON.parse(readFileSync("../demo/ghost-sample/ma2a-ghost-guideline.json", "utf8"));
  it("is a guideline every type of which the BDS catalogue has", () => {
    expect(validateGuideline(M)).toEqual([]);
    expect(validateAgainstCatalog(M, CATALOG)).toEqual([]);
  });
  it("the layer rule, listed first, wins on its layer whatever the boundary says; a layer no rule names types by Location; neither is a gap", () => {
    const ext = resolveWithCatalog(M, { category: "Walls", layer: "A-WALL-EXT", discipline: "A", params: { Location: "Interior" }, thicknessMm: 200 }, CATALOG);
    expect(ext).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", confidence: 1, matched: ["layer"] });
    const inside = resolveWithCatalog(M, { category: "Walls", layer: "A-WALL-INT", discipline: "A", params: { Location: "Interior" }, thicknessMm: 100 }, CATALOG);
    expect(inside).toMatchObject({ type: "BDS_INT_ARC_CMU_100 mm", confidence: 1, matched: ["param:Location"] });
    const unknown = resolveWithCatalog(M, { category: "Walls", layer: "A-WALL-INT", discipline: "A", params: {}, thicknessMm: 100 }, CATALOG);
    expect(unknown).toMatchObject({ source: "none", confidence: 0 });
  });
  it("a layer-free rule on TWO params, listed last, is tried before the layer rule listed first: the matcher orders by how many conditions a rule states, a layer counting one", () => {
    const two = { when: { params: { Location: "Interior", Material: "GYPS" } }, use: { family: "Basic Wall", typePattern: "BDS_INT_ARC_GYPS_{thickness} mm" }, why: "two conditions" };
    const M2: Guideline = { ...M, elements: [{ ...M.elements[0], rules: [...M.elements[0].rules, two] }] };
    const r = resolveWithCatalog(M2, { category: "Walls", layer: "A-WALL-EXT", discipline: "A", params: { Location: "Interior", Material: "Gypsum Wall Board" }, thicknessMm: 100 }, CATALOG);
    expect(r).toMatchObject({ type: "BDS_INT_ARC_GYPS_100 mm", confidence: 1, matched: ["param:Location", "param:Material"] });
  });
});
