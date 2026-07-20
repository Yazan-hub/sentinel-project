import { describe, it, expect } from "vitest";
import { validateElement, applies, adjudicate, DEMO_IDS, type IdsSpec } from "./ids";
import type { ElementProperties } from "./adapter/element-properties";

const elem = (cls: string, name: string | undefined, psets: { name: string; rows: { name: string; value: string }[] }[] = [], guid = "G"): ElementProperties => ({
  modelId: "m", localId: 1, identity: { Class: cls, GlobalId: guid, ...(name != null ? { Name: name } : {}) }, psets, quantities: [],
});

// Walls must carry Pset_WallCommon.FireRating (required).
const FIRE_IDS: IdsSpec = {
  title: "Walls need a fire rating",
  specifications: [{
    name: "FireRating on walls",
    applicability: { entity: "IFCWALL" },
    requirements: { attributes: [], properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" }] },
  }],
};

describe("applies (scoping)", () => {
  it("matches by IFC entity (regex, case-insensitive)", () => {
    expect(applies(FIRE_IDS.specifications[0], elem("IFCWALL", "w"))).toBe(true);
    expect(applies(FIRE_IDS.specifications[0], elem("IFCBEAM", "b"))).toBe(false);
  });
});

describe("validateElement", () => {
  it("passes a compliant wall and fails a missing-property wall with a reason", () => {
    const ok = validateElement(FIRE_IDS, elem("IFCWALL", "w", [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "REI60" }] }]));
    expect(ok).toMatchObject({ inScope: true, pass: true, failures: [] });

    const bad = validateElement(FIRE_IDS, elem("IFCWALL", "w"));
    expect(bad.pass).toBe(false);
    expect(bad.failures[0]).toMatchObject({ requirement: "Pset_WallCommon.FireRating", reason: "REQUIRED but missing" });
  });

  it("out-of-scope elements are not judged (inScope false, pass true)", () => {
    expect(validateElement(FIRE_IDS, elem("IFCBEAM", "b"))).toMatchObject({ inScope: false, pass: true });
  });

  it("enforces an exact value (case-insensitive) and a prohibited facet", () => {
    const spec: IdsSpec = { title: "t", specifications: [{ name: "s", applicability: { entity: "IFCWALL" }, requirements: { attributes: [], properties: [{ pset: "P", name: "Grade", value: "A", cardinality: "required" }] } }] };
    expect(validateElement(spec, elem("IFCWALL", "w", [{ name: "P", rows: [{ name: "Grade", value: "a" }] }])).pass).toBe(true); // case-insensitive match
    expect(validateElement(spec, elem("IFCWALL", "w", [{ name: "P", rows: [{ name: "Grade", value: "B" }] }])).pass).toBe(false);

    const proh: IdsSpec = { title: "t", specifications: [{ name: "s", applicability: { entity: "IFCWALL" }, requirements: { attributes: [], properties: [{ pset: "P", name: "Legacy", cardinality: "prohibited" }] } }] };
    expect(validateElement(proh, elem("IFCWALL", "w", [{ name: "P", rows: [{ name: "Legacy", value: "x" }] }])).pass).toBe(false); // present but prohibited
    expect(validateElement(proh, elem("IFCWALL", "w")).pass).toBe(true); // absent → fine
  });
});

describe("adjudicate (the referee)", () => {
  it("accepts a fully-compliant proposal", () => {
    const a = adjudicate(FIRE_IDS, [elem("IFCWALL", "w", [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "REI60" }] }])]);
    expect(a.verdict).toBe("accepted");
    expect(a.summary).toMatchObject({ elements: 1, in_scope: 1, passing: 1, failing: 0 });
    expect(a.failures).toHaveLength(0);
  });

  it("rejects a proposal with a failing element and attributes the failure to its GlobalId", () => {
    const a = adjudicate(FIRE_IDS, [
      elem("IFCWALL", "w", [{ name: "Pset_WallCommon", rows: [{ name: "FireRating", value: "REI60" }] }], "GOOD"),
      elem("IFCWALL", "w", [], "BAD"),
    ]);
    expect(a.verdict).toBe("rejected");
    expect(a.summary).toMatchObject({ in_scope: 2, passing: 1, failing: 1 });
    expect(a.failures).toHaveLength(1);
    expect(a.failures[0]).toMatchObject({ element: "BAD", reason: "REQUIRED but missing" });
  });

  it("ignores out-of-scope elements in the count", () => {
    const a = adjudicate(FIRE_IDS, [elem("IFCBEAM", "b"), elem("IFCDOOR", "d")]);
    expect(a.verdict).toBe("accepted"); // nothing in scope failed
    expect(a.summary.in_scope).toBe(0);
  });

  it("no IDS → verdict 'recorded' (logged, not judged)", () => {
    const a = adjudicate(null, [elem("IFCWALL", "w")]);
    expect(a.verdict).toBe("recorded");
    expect(a.summary.ids).toBeNull();
  });

  it("works with the bundled DEMO_IDS", () => {
    const a = adjudicate(DEMO_IDS, [elem("IFCWALL", undefined)]); // unnamed wall → fails "must be named" + missing IsExternal
    expect(a.verdict).toBe("rejected");
    expect(a.summary.failing).toBe(1);
  });
});
