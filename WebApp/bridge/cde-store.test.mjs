import { describe, it, expect } from "vitest";
import { mergeMetaForTest, selectFailures } from "./cde-store.mjs";

describe("selectFailures — the failure list a proposer gets back, with honest totals", () => {
  const f = (req, n) => Array.from({ length: n }, (_, i) => ({ element: `g${req}${i}`, requirement: req, reason: "missing" }));
  const all = [...f("Pset_DoorCommon.FireRating", 132), ...f("Pset_BDS.Discipline", 132)];

  it("unfiltered: first 200 of everything, totals say what was cut", () => {
    const out = selectFailures(all, undefined);
    expect(out.failures).toHaveLength(200);
    expect(out.failures_total).toBe(264);
    expect(out.failures_matched).toBe(264);
  });

  it("filtered to one requirement (case-insensitive): only those, up to 1000, matched counted before slicing", () => {
    const out = selectFailures(all, "pset_doorcommon.firerating");
    expect(out.failures).toHaveLength(132);
    expect(out.failures.every((x) => x.requirement === "Pset_DoorCommon.FireRating")).toBe(true);
    expect(out.failures_total).toBe(264);
    expect(out.failures_matched).toBe(132);
    const big = selectFailures(f("@Name", 1500), "@Name");
    expect(big.failures).toHaveLength(1000);
    expect(big.failures_matched).toBe(1500); // a client sees 1000 < 1500 ⇒ truncated, no guessing
  });

  it("a blank filter is no filter; a non-array is empty", () => {
    expect(selectFailures(all, "  ").failures).toHaveLength(200);
    expect(selectFailures(null, "x")).toEqual({ failures: [], failures_total: 0, failures_matched: 0 });
  });
});

describe("mergeMeta", () => {
  const base = { stage: "design", standards_pack: "", dimensions: { "2d": true }, snapshot: {}, gates: {} };

  it("persists active_ruleset (regression: it was silently dropped)", () => {
    const out = mergeMetaForTest(base, { active_ruleset: { standard_key: "bds-rtg-001", semver: "1.4.1", rules: [] } });
    expect(out.active_ruleset).toEqual({ standard_key: "bds-rtg-001", semver: "1.4.1", rules: [] });
  });

  it("still merges the pre-existing keys unchanged", () => {
    const out = mergeMetaForTest(base, { stage: "coord", standards_pack: "bds-house@1.4.1" });
    expect(out.stage).toBe("coord");
    expect(out.standards_pack).toBe("bds-house@1.4.1");
  });

  it("leaves active_ruleset untouched when the patch omits it", () => {
    const withRs = { ...base, active_ruleset: { standard_key: "keep-me", semver: "1", rules: [] } };
    const out = mergeMetaForTest(withRs, { stage: "coord" });
    expect(out.active_ruleset.standard_key).toBe("keep-me");
  });

  it("deep-merges dimensions and snapshot as before", () => {
    const out = mergeMetaForTest({ ...base, snapshot: { health: 90 } }, { dimensions: { "4d": true }, snapshot: { compliance: 70 } });
    expect(out.dimensions).toEqual({ "2d": true, "4d": true });
    expect(out.snapshot).toEqual({ health: 90, compliance: 70 });
  });
});
