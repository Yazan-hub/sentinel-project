import { describe, it, expect } from "vitest";
import { mergeMetaForTest } from "./cde-store.mjs";

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
