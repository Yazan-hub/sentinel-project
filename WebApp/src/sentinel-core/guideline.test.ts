import { describe, it, expect } from "vitest";
import { resolveType, coverageGaps, validateGuideline, type Guideline } from "./guideline";

// The conformance reference for the C# port (same relationship layers.test.ts has to
// LayerRulesetMatcher.cs). If these change, the add-in's copy must change with them.
const G: Guideline = {
  standard: "Test Office Guideline",
  elements: [
    {
      category: "Walls",
      rules: [
        // Deliberately authored in "natural" order: the general statement first, the exception second.
        { when: { layer: "A-WALL-EXT" }, use: { family: "BDS_Wall_Ext", type: "BDS_Wall_Ext_200" }, why: "External walls are 200 blockwork." },
        { when: { layer: "A-WALL-EXT", params: { "Fire Rating": "FR60" } }, use: { family: "BDS_Wall_Ext", type: "BDS_Wall_Ext_200_FR60" }, why: "FR60 external walls use the rated build-up." },
        { when: { layer: "A-WALL-INT" }, use: { family: "BDS_Wall_Int", type: "BDS_Wall_Int_100" } },
      ],
      default: { family: "BDS_Wall_Int", type: "BDS_Wall_Int_100" },
    },
    {
      category: "Floors",
      rules: [{ when: { level: "Ground" }, use: { family: "BDS_Floor", type: "BDS_Floor_200_RC" } }],
      // no default — an unmatched floor must be reported as a gap, not guessed
    },
  ],
};

describe("guideline — type selection", () => {
  it("picks the office rule for a plain external wall", () => {
    const r = resolveType(G, { category: "Walls", layer: "A-WALL-EXT" });
    expect(r.type).toBe("BDS_Wall_Ext_200");
    expect(r.source).toBe("rule");
    expect(r.confidence).toBe(1);
  });

  it("the MORE specific rule wins even though it is written second", () => {
    // This is the whole point: an author writes the general case first and the exception after, the way
    // a written standard reads. Document order alone would return the 200 non-rated type here.
    const r = resolveType(G, { category: "Walls", layer: "A-WALL-EXT", params: { "Fire Rating": "FR60" } });
    expect(r.type).toBe("BDS_Wall_Ext_200_FR60");
    expect(r.matched).toContain("param:Fire Rating");
  });

  it("matches the parameter name loosely (FireRating vs Fire Rating) and the value by substring", () => {
    const r = resolveType(G, { category: "Walls", layer: "A-WALL-EXT", params: { FireRating: "FR60 / REI60" } });
    expect(r.type).toBe("BDS_Wall_Ext_200_FR60");
  });

  it("is case-insensitive on layer names", () => {
    expect(resolveType(G, { category: "Walls", layer: "a-wall-int" }).type).toBe("BDS_Wall_Int_100");
  });

  it("falls back to the category default at reduced confidence, and says so", () => {
    const r = resolveType(G, { category: "Walls", layer: "A-WALL-SOMETHING-ELSE" });
    expect(r.source).toBe("default");
    expect(r.confidence).toBeLessThan(1);
    expect(r.why).toMatch(/No office rule matched/);
  });

  it("reports a genuine gap rather than guessing when there is no default", () => {
    const r = resolveType(G, { category: "Floors", level: "Roof" });
    expect(r.source).toBe("none");
    expect(r.confidence).toBe(0);
    expect(r.family).toBe("");
  });

  it("an unknown category is a gap, not a crash", () => {
    expect(resolveType(G, { category: "Ceilings" }).source).toBe("none");
  });

  it("is deterministic — the same input gives the same answer every time", () => {
    const input = { category: "Walls", layer: "A-WALL-EXT", params: { "Fire Rating": "FR60" } };
    const runs = Array.from({ length: 20 }, () => resolveType(G, input).type);
    expect(new Set(runs).size).toBe(1);
  });

  it("carries the rule's params through so the element is seeded", () => {
    const g: Guideline = {
      standard: "x",
      elements: [{ category: "Doors", rules: [{ when: { layer: "A-DOOR" }, use: { family: "BDS_Door", params: { "Fire Rating": "FD30" } } }] }],
    };
    expect(resolveType(g, { category: "Doors", layer: "A-DOOR" }).params).toEqual({ "Fire Rating": "FD30" });
  });
});

describe("guideline — coverage and validation", () => {
  it("lists exactly the inputs the office standard does not cover", () => {
    const gaps = coverageGaps(G, [
      { category: "Walls", layer: "A-WALL-EXT" },   // covered by a rule
      { category: "Walls", layer: "A-WALL-WHAT" },  // covered by the default
      { category: "Floors", level: "Roof" },        // genuine gap
      { category: "Ceilings" },                     // genuine gap
    ]);
    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.category)).toEqual(["Floors", "Ceilings"]);
  });

  it("rejects a rule with an empty `when`, which would silently match everything", () => {
    const bad: Guideline = { standard: "x", elements: [{ category: "Walls", rules: [{ when: {}, use: { family: "F" } }] }] };
    expect(validateGuideline(bad).some((e) => /match everything/.test(e))).toBe(true);
  });

  it("rejects a rule with nothing to place, and a category with neither rules nor default", () => {
    const bad = { standard: "x", elements: [{ category: "Walls", rules: [{ when: { layer: "L" }, use: {} }] }, { category: "Floors", rules: [] }] } as unknown as Guideline;
    const errs = validateGuideline(bad);
    expect(errs.some((e) => /no family/.test(e))).toBe(true);
    expect(errs.some((e) => /neither rules nor a default/.test(e))).toBe(true);
  });

  it("passes a well-formed guideline", () => {
    expect(validateGuideline(G)).toEqual([]);
  });
});
